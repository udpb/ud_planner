/**
 * scripts/extract-design-patterns.ts — WinningProposalDoc → ProgramDesignPattern JSON (BR-1 · ADR-028)
 *
 * 로컬 DB WinningProposalDoc(148건) fullText 를 Flash(plumbing 티어)로 구조화 추출해
 * `data/program-design/extracted/<docId>.json` 으로 저장한다. JSON-first (ADR-028 Option B
 * — prisma 스키마 변경 없음).
 *
 * 사용:
 *   npx tsx scripts/extract-design-patterns.ts --ids <id1,id2> [--force]
 *   npx tsx scripts/extract-design-patterns.ts --limit 10 --concurrency 3
 *
 * 옵션:
 *   --ids id1,id2     특정 docId 만 (스모크용)
 *   --limit N         앞에서 N 건만 (id 오름차순 — 결정적)
 *   --concurrency N   동시 호출 수 (기본 3)
 *   --force           기존 산출 파일 덮어쓰기 (기본 = 존재 시 skip — 멱등·재개 가능)
 *
 * 정책:
 *   - AI 호출 = invokeAi 단일 진입점 + FLASH_MODEL (plumbing 티어, ADR-022).
 *     429 백오프·intra-Gemini 폴백은 invokeAi 내장 — 폴백 발생 시 extractionMeta.fallback 표시.
 *   - fullText > 60k → 앞 55k + '…[중략]' (p99 만 해당), extractionMeta.truncated 표시.
 *   - lowText / parseBy='unsupported' 도 추출하되 extractionMeta 에 플래그.
 *   - zod 검증 통과분만 저장. 실패 시 AI 1회 재시도 → 그래도 실패면 _run-report.json 에 기록하고 계속.
 *   - intensity 는 LLM 산출이 아니라 deriveIntensity() 코드 파생.
 */

import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })
delete process.env.PLAYWRIGHT_MOCK_AI
delete process.env.E2E_SECRET

import fs from 'node:fs'
import path from 'node:path'

// ── CLI ──────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
function arg(flag: string, dflt?: string): string | undefined {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}
const IDS = arg('--ids')?.split(',').map((s) => s.trim()).filter(Boolean)
const LIMIT = parseInt(arg('--limit', '0')!, 10)
const CONCURRENCY = parseInt(arg('--concurrency', '3')!, 10)
const FORCE = argv.includes('--force')

const OUT_DIR = path.join(process.cwd(), 'data', 'program-design', 'extracted')
const RUN_REPORT = path.join(process.cwd(), 'data', 'program-design', '_run-report.json')

/** fullText 절단 정책 (BR-1): 60k 초과 시 앞 55k + 중략 표시. */
const TRUNCATE_THRESHOLD = 60_000
const TRUNCATE_KEEP = 55_000

interface RunFailure {
  docId: string
  projectName: string
  error: string
}

async function main() {
  // dotenv 이후 동적 import (env 의존 모듈 — prisma·gemini)
  const [{ prisma }, { invokeAi }, { FLASH_MODEL, AI_TOKENS }, { safeParseJson }, schemaMod, { buildExtractionPrompt }, { createLimiter }] =
    await Promise.all([
      import('../src/lib/prisma'),
      import('../src/lib/ai-fallback'),
      import('../src/lib/ai/config'),
      import('../src/lib/ai/parser'),
      import('../src/lib/program-design/operating-format'),
      import('../src/lib/program-design/extraction-prompt'),
      import('../src/lib/util/limit'),
    ])
  const { extractionOutputSchema, programDesignPatternSchema, normalizeExtraction, deriveIntensity } = schemaMod

  fs.mkdirSync(OUT_DIR, { recursive: true })

  const docs = await prisma.winningProposalDoc.findMany({
    where: IDS && IDS.length > 0 ? { id: { in: IDS } } : undefined,
    orderBy: { id: 'asc' },
    ...(LIMIT > 0 ? { take: LIMIT } : {}),
    select: {
      id: true,
      projectId: true,
      projectName: true,
      client: true,
      fileName: true,
      channel: true,
      year: true,
      fullText: true,
      charCount: true,
      parseBy: true,
      lowText: true,
    },
  })

  if (IDS && IDS.length > 0 && docs.length !== IDS.length) {
    const found = new Set(docs.map((d) => d.id))
    const missing = IDS.filter((id) => !found.has(id))
    console.error(`⚠️ --ids 중 DB 에 없는 id: ${missing.join(', ')}`)
  }

  console.log(`📄 대상 ${docs.length}건 · concurrency=${CONCURRENCY} · force=${FORCE}`)

  let succeeded = 0
  let skipped = 0
  const failures: RunFailure[] = []
  const run = createLimiter(CONCURRENCY)

  /** 1건 추출 — AI 호출 → safeParseJson → normalize → zod → intensity 파생 → 파일 저장. */
  async function extractOne(doc: (typeof docs)[number]): Promise<void> {
    const outPath = path.join(OUT_DIR, `${doc.id}.json`)
    if (!FORCE && fs.existsSync(outPath)) {
      skipped++
      console.log(`⏭️  skip (이미 존재): ${doc.id} ${doc.projectName}`)
      return
    }

    const truncated = doc.fullText.length > TRUNCATE_THRESHOLD
    const fullText = truncated ? `${doc.fullText.slice(0, TRUNCATE_KEEP)}\n…[중략]` : doc.fullText
    // ADR-028 추록 2 — 파일명/프로젝트명에 '결과보고서' 포함 시 docType='result-report'
    // (kpiTargets = 실측 실적 · 운영 구조 = 실행된 구조로 추출 지시)
    const docType: 'proposal' | 'result-report' =
      `${doc.fileName ?? ''}${doc.projectName}`.includes('결과보고서') ? 'result-report' : 'proposal'
    const prompt = buildExtractionPrompt({
      projectName: doc.projectName,
      client: doc.client,
      channel: doc.channel,
      year: doc.year,
      fullText,
      docType,
    })

    const MAX_ATTEMPTS = 2 // 1차 + 재시도 1회 (zod/JSON 실패 시)
    let lastError = ''
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await invokeAi({
          prompt,
          model: FLASH_MODEL, // plumbing 티어 (ADR-022) — Pro 라우팅 금지
          maxTokens: AI_TOKENS.LARGE,
          temperature: 0.1,
          label: 'design-pattern-extract',
        })
        const parsed = safeParseJson<unknown>(res.raw, 'design-pattern-extract')
        const { output: normalized, demotedAxes } = normalizeExtraction(parsed)
        const output = extractionOutputSchema.parse(normalized)

        const pattern = programDesignPatternSchema.parse({
          ...output,
          docId: doc.id,
          projectId: doc.projectId,
          projectName: doc.projectName,
          intensity: deriveIntensity(output),
          extractionMeta: {
            model: res.model,
            docType,
            charCount: doc.charCount,
            parseBy: doc.parseBy,
            lowText: doc.lowText,
            unsupported: doc.parseBy === 'unsupported',
            truncated,
            fallback: res.fallback,
            demotedAxes,
            extractedAt: new Date().toISOString(),
          },
        })

        fs.writeFileSync(outPath, JSON.stringify(pattern, null, 2), 'utf8')
        succeeded++
        console.log(
          `✅ ${doc.id} ${doc.projectName} (${doc.charCount.toLocaleString()}자` +
            `${truncated ? '·절단' : ''}${res.fallback ? '·⚠️fallback:' + res.model : ''}` +
            `${demotedAxes.length > 0 ? `·강등 ${demotedAxes.length}축[${demotedAxes.join(',')}]` : ''})`,
        )
        return
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        console.warn(`⚠️ ${doc.id} 시도 ${attempt}/${MAX_ATTEMPTS} 실패: ${lastError.slice(0, 300)}`)
      }
    }
    failures.push({ docId: doc.id, projectName: doc.projectName, error: lastError.slice(0, 500) })
  }

  await Promise.all(docs.map((doc) => run(() => extractOne(doc))))

  const report = {
    runAt: new Date().toISOString(),
    args: { ids: IDS ?? null, limit: LIMIT || null, concurrency: CONCURRENCY, force: FORCE },
    targeted: docs.length,
    succeeded,
    skipped,
    failed: failures.length,
    failures,
  }
  fs.writeFileSync(RUN_REPORT, JSON.stringify(report, null, 2), 'utf8')

  console.log(
    `\n🏁 완료 — 성공 ${succeeded} · skip ${skipped} · 실패 ${failures.length}` +
      ` (report: ${path.relative(process.cwd(), RUN_REPORT)})`,
  )
  if (failures.length > 0) {
    for (const f of failures) console.log(`   ❌ ${f.docId} ${f.projectName}: ${f.error.slice(0, 120)}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
