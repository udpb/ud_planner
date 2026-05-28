/**
 * L3 Migration — originalQuote 진짜 PDF/PPT 재읽기 (Drive 자산 대상).
 *
 * ContentAsset 중 sourceReferences 에 "drive:<fileId>" 가 있는 자산:
 *   1. Drive API 로 원본 파일 다운로드 (PDF/PPTX/DOCX)
 *   2. 파일에서 텍스트 추출 (extractTextFromBuffer — file-ingester.ts)
 *   3. LLM 1회로 narrative 와 가장 일치하는 강한 1 문장 발췌
 *   4. sourceReferences.originalQuote = 추출된 진짜 voice
 *   5. sourceReferences.originalQuoteSource = 'pdf-rebuild' (heuristic 보다 우선)
 *
 * idempotent — originalQuoteSource='pdf-rebuild' 이미 있으면 skip.
 *
 * 비용:
 *   자산당 Gemini 1 call (long context for full PDF text) — ~$0.005
 *   K2 휴리스틱이 처리한 1,211건 중 drive 자산 ~270건 → ~$1.4
 *
 * 사용:
 *   npx tsx scripts/migrate-quotes-from-drive.ts                 # dry-run, 5 샘플
 *   npx tsx scripts/migrate-quotes-from-drive.ts --apply --batch 30
 *   npx tsx scripts/migrate-quotes-from-drive.ts --apply --all
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
for (const file of ['.env', '.env.local']) {
  const envPath = path.join(process.cwd(), file)
  if (!fs.existsSync(envPath)) continue
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    process.env[k] = v
  }
}

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const all = args.includes('--all')
  const force = args.includes('--force')
  const batchIdx = args.indexOf('--batch')
  const limit = batchIdx >= 0 ? parseInt(args[batchIdx + 1] ?? '5', 10) : all ? undefined : 5
  const concIdx = args.indexOf('--concurrency')
  const concurrency = concIdx >= 0 ? Math.max(1, Math.min(5, parseInt(args[concIdx + 1] ?? '2', 10))) : 2

  const { prisma } = await import('../src/lib/prisma')
  const { drive } = await import('@googleapis/drive')
  const { GoogleAuth } = await import('google-auth-library')
  const { invokeAi } = await import('../src/lib/ai-fallback')
  const { safeParseJson } = await import('../src/lib/ai/parser')
  const { AI_TOKENS } = await import('../src/lib/ai/config')

  console.log(`▶ L3 originalQuote PDF 재읽기`)
  console.log(`  mode: ${apply ? 'APPLY' : 'DRY-RUN'}`)
  console.log(`  limit: ${limit ?? 'all'}`)
  console.log(`  force overwrite: ${force}`)
  console.log()

  // Drive client
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive.readonly'] })
  const driveClient = drive({ version: 'v3', auth })

  // Find candidates — drive: refs 있는 자산
  const all_assets = await prisma.contentAsset.findMany({
    where: {},
    select: {
      id: true,
      name: true,
      narrativeSnippet: true,
      sourceReferences: true,
    },
  })

  const candidates = all_assets.filter((a) => {
    const srStr = JSON.stringify(a.sourceReferences ?? {})
    if (!srStr.includes('drive:')) return false
    if (!force) {
      const sr = a.sourceReferences as Record<string, unknown> | null
      if (sr?.originalQuoteSource === 'pdf-rebuild') return false
    }
    return true
  })

  console.log(`전체 drive: refs 자산 ${all_assets.filter(a => JSON.stringify(a.sourceReferences ?? {}).includes('drive:')).length}건`)
  console.log(`처리 대상 ${candidates.length}건 (${force ? 'force overwrite' : '아직 pdf-rebuild 안 된 자산'})`)
  console.log()

  const targets = limit ? candidates.slice(0, limit) : candidates

  if (targets.length === 0) {
    console.log('✓ 처리할 자산 없음')
    await prisma.$disconnect()
    return
  }

  let processed = 0
  let saved = 0
  let skippedNoQuote = 0
  let errFetch = 0
  let errExtract = 0
  let errLlm = 0
  const startT = Date.now()

  async function processOne(asset: typeof targets[number]) {
    // Extract first drive: fileId from sourceReferences
    const srRaw = asset.sourceReferences as Record<string, unknown> | unknown[] | null
    let fileId: string | null = null
    if (Array.isArray(srRaw)) {
      for (const v of srRaw) {
        if (typeof v === 'string' && v.startsWith('drive:')) {
          fileId = v.replace('drive:', '')
          break
        }
      }
    } else if (srRaw && typeof srRaw === 'object') {
      for (const v of Object.values(srRaw)) {
        if (typeof v === 'string' && v.startsWith('drive:')) {
          fileId = v.replace('drive:', '')
          break
        }
      }
    }
    if (!fileId) {
      skippedNoQuote += 1
      return
    }

    // Download
    let buffer: Buffer
    let mimeType = 'application/octet-stream'
    try {
      const meta = await driveClient.files.get({
        fileId,
        fields: 'name,mimeType,size',
        supportsAllDrives: true,
      })
      mimeType = meta.data.mimeType ?? mimeType
      const sizeMB = Number(meta.data.size ?? 0) / 1024 / 1024
      if (sizeMB > 50) {
        console.log(`  ⚠ skip large file (${sizeMB.toFixed(1)}MB): ${asset.name.slice(0, 50)}`)
        skippedNoQuote += 1
        return
      }
      const res = await driveClient.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'arraybuffer' },
      )
      buffer = Buffer.from(res.data as ArrayBuffer)
    } catch (err) {
      errFetch += 1
      return
    }

    // Extract text
    let extractedText = ''
    try {
      if (mimeType.includes('pdf') || (asset.name.toLowerCase().endsWith('.pdf'))) {
        const { PDFParse } = await import('pdf-parse')
        const parser = new PDFParse({ data: new Uint8Array(buffer) })
        const result = await parser.getText()
        extractedText = result.text
      } else if (
        mimeType.includes('presentation') ||
        mimeType.includes('wordprocessing') ||
        mimeType.includes('spreadsheet') ||
        ['pptx', 'docx', 'xlsx'].some((ext) => asset.name.toLowerCase().endsWith('.' + ext))
      ) {
        const { OfficeParser } = await import('officeparser')
        const ast = await OfficeParser.parseOffice(buffer)
        extractedText = ast.toText()
      } else {
        skippedNoQuote += 1
        return
      }
      extractedText = extractedText.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
      if (extractedText.length < 200) {
        errExtract += 1
        return
      }
      if (extractedText.length > 50_000) extractedText = extractedText.slice(0, 50_000)
    } catch (err) {
      errExtract += 1
      return
    }

    // LLM — find originalQuote
    let originalQuote: string | null = null
    try {
      const prompt = `
당신은 한국 사업 제안서의 핵심 voice 보존 전문가입니다.
다음 자산의 narrativeSnippet (LLM 재구성된 요약) 과 원본 파일 텍스트가 주어집니다.
원본에서 narrativeSnippet 의 핵심 메시지를 **글자 그대로** 가장 잘 표현한 1 문장을 추출하세요.

[자산 이름]
${asset.name}

[narrativeSnippet — LLM 재구성된 요약]
${(asset.narrativeSnippet ?? '').slice(0, 800)}

[원본 파일 텍스트 — 가공 X, 그대로]
${extractedText.slice(0, 30_000)}

[추출 규칙]
1. 원본에서 글자 그대로 발췌 — paraphrase 금지
2. 길이: 30~400자
3. 정량 수치·강한 동사·UD 시그니처 어휘 포함 우선
4. 평가위원이 「」 직인용해도 어색하지 않은 문장
5. 추출 가능한 강한 1 문장이 없으면 null 반환

[출력 JSON]
{
  "originalQuote": "...글자 그대로 1 문장 (또는 null)",
  "reasoning": "왜 이 문장을 골랐는지 1줄"
}

JSON 만.
`.trim()
      const r = await invokeAi({
        prompt,
        maxTokens: AI_TOKENS.STANDARD,
        temperature: 0.2,
        label: 'l3-pdf-quote',
      })
      const raw = safeParseJson<any>(r.raw, 'l3-pdf-quote')
      if (raw?.originalQuote && typeof raw.originalQuote === 'string' && raw.originalQuote.length >= 20) {
        originalQuote = raw.originalQuote.slice(0, 400)
      }
    } catch (err) {
      errLlm += 1
      return
    }

    if (!originalQuote) {
      skippedNoQuote += 1
      return
    }

    // Save
    if (apply) {
      try {
        const sref = (asset.sourceReferences as Record<string, unknown> | null) ?? {}
        const newSref = {
          ...sref,
          originalQuote,
          originalQuoteSource: 'pdf-rebuild',
          originalQuoteExtractedAt: new Date().toISOString(),
        }
        await prisma.contentAsset.update({
          where: { id: asset.id },
          data: { sourceReferences: newSref },
        })
        saved += 1
      } catch (err) {
        errFetch += 1
      }
    } else {
      saved += 1
    }
  }

  // Worker pool
  let idx = 0
  async function worker() {
    while (idx < targets.length) {
      const myIdx = idx++
      const asset = targets[myIdx]
      await processOne(asset)
      processed += 1
      if (processed % 10 === 0 || processed === targets.length) {
        const elapsedSec = (Date.now() - startT) / 1000
        const rate = processed / elapsedSec
        const remaining = ((targets.length - processed) / rate).toFixed(0)
        console.log(
          `  [${processed}/${targets.length}] saved=${saved} skip=${skippedNoQuote} fetchErr=${errFetch} extractErr=${errExtract} llmErr=${errLlm} · ${rate.toFixed(2)}/s · ETA ${remaining}s`,
        )
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))

  const totalSec = (Date.now() - startT) / 1000
  console.log()
  console.log(`[결과 — ${totalSec.toFixed(1)}s]`)
  console.log(`  처리: ${processed}건`)
  console.log(`  저장: ${saved}건${apply ? '' : ' (dry-run)'}`)
  console.log(`  skip (quote 추출 안 됨): ${skippedNoQuote}건`)
  console.log(`  fetch err: ${errFetch}`)
  console.log(`  extract err: ${errExtract}`)
  console.log(`  llm err: ${errLlm}`)

  if (apply && saved > 0) {
    console.log(`\n[샘플 저장 확인 — 최근 3건]`)
    const recent = await prisma.contentAsset.findMany({
      where: {},
      select: { name: true, sourceReferences: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 3,
    })
    for (const r of recent) {
      const sr = r.sourceReferences as Record<string, unknown> | null
      if (sr?.originalQuoteSource === 'pdf-rebuild') {
        console.log(`  ${r.name.slice(0, 50)}`)
        console.log(`     ★ ${String(sr.originalQuote).slice(0, 150)}`)
      }
    }
  }

  await prisma.$disconnect()
  console.log(apply ? `\n✅ 마이그레이션 완료` : `\n✓ Dry-run 완료`)
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
