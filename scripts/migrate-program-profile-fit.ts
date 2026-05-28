/**
 * L2 Migration — programProfileFit LLM 추론 일괄.
 *
 * ContentAsset 1,765건 중 programProfileFit 이 비어있는 자산에 대해
 * Gemini 1 LLM 호출로 ProgramProfile 축 추론 → DB 저장.
 *
 * 사용:
 *   npx tsx scripts/migrate-program-profile-fit.ts              # dry-run, 10건 샘플
 *   npx tsx scripts/migrate-program-profile-fit.ts --batch 50   # dry-run, 50건
 *   npx tsx scripts/migrate-program-profile-fit.ts --apply --batch 100 # 실 DB 업데이트
 *   npx tsx scripts/migrate-program-profile-fit.ts --apply --all       # 전체 1,765 처리
 *   npx tsx scripts/migrate-program-profile-fit.ts --apply --resume    # 이미 채워진 거 skip
 *
 * 비용 (predicted):
 *   - Gemini: 1,765 × $0.001 = ~$1.8
 *   - Claude fallback: 1,765 × $0.015 = ~$26
 *   - 실 평균 ~$3-5 추정 (대부분 Gemini 성공)
 *
 * idempotent — 기존 fit 있으면 skip. --force 로 덮어쓰기.
 *
 * server-only 우회 — inline 알고리즘 (extract-quote.ts 패턴과 동일).
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
  const limit = batchIdx >= 0 ? parseInt(args[batchIdx + 1] ?? '10', 10) : all ? undefined : 10
  const concIdx = args.indexOf('--concurrency')
  const concurrency = concIdx >= 0 ? Math.max(1, Math.min(10, parseInt(args[concIdx + 1] ?? '4', 10))) : 4

  const { prisma } = await import('../src/lib/prisma')
  const { invokeAi } = await import('../src/lib/ai-fallback')
  const { safeParseJson } = await import('../src/lib/ai/parser')
  const { AI_TOKENS } = await import('../src/lib/ai/config')

  console.log(`▶ L2 programProfileFit 마이그레이션`)
  console.log(`  mode: ${apply ? 'APPLY (실 DB 업데이트)' : 'DRY-RUN'}`)
  console.log(`  limit: ${limit ?? 'all (~1,765)'}`)
  console.log(`  force overwrite: ${force}`)
  console.log(`  concurrency: ${concurrency}`)
  console.log()

  // 처리 대상 — narrativeSnippet 있고, force 아니면 fit 비어있는 자산
  const whereBase: any = {}
  const assets = await prisma.contentAsset.findMany({
    where: whereBase,
    select: {
      id: true,
      name: true,
      narrativeSnippet: true,
      keywords: true,
      category: true,
      programProfileFit: true,
      // sourceProject 정보는 sourceReferences 에 있을 수 있지만, 우선 안 가져옴 (성능)
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  console.log(`전체 자산 ${assets.length}건 로드됨`)

  // Filter to those needing migration
  const targets = assets.filter((a) => {
    if (!a.narrativeSnippet || a.narrativeSnippet.length < 50) return false
    if (!force && a.programProfileFit && Object.keys(a.programProfileFit as object).length > 0) {
      return false
    }
    return true
  })

  console.log(`마이그레이션 대상 ${targets.length}건 (narrative ≥ 50자, ${force ? 'force overwrite' : '기존 fit 없음'})`)
  console.log()

  if (targets.length === 0) {
    console.log('✓ 처리할 자산 없음')
    await prisma.$disconnect()
    return
  }

  // inline 추론 함수
  async function infer(a: typeof targets[number]): Promise<Record<string, unknown> | null> {
    const prompt = buildInferPrompt({
      name: a.name,
      narrativeSnippet: a.narrativeSnippet ?? '',
      keywords: (a.keywords as string[]) ?? [],
      category: a.category,
    })
    try {
      const r = await invokeAi({
        prompt,
        maxTokens: AI_TOKENS.STANDARD,
        temperature: 0.2,
        label: 'l2-profile-fit',
      })
      const raw = safeParseJson<any>(r.raw, 'l2-profile-fit')
      return mapToFit(raw)
    } catch (err) {
      return null
    }
  }

  // 진행 — concurrent worker pool
  let processed = 0
  let saved = 0
  let skipped = 0
  let errors = 0
  const startT = Date.now()

  async function processOne(asset: typeof targets[number]) {
    const fit = await infer(asset)
    if (!fit) {
      errors += 1
      return
    }
    if (Object.keys(fit).length === 0) {
      skipped += 1
      return
    }
    if (apply) {
      try {
        await prisma.contentAsset.update({
          where: { id: asset.id },
          data: { programProfileFit: fit as any },
        })
        saved += 1
      } catch (err) {
        errors += 1
        console.warn(`  ✗ update fail: ${asset.name.slice(0, 50)}:`, err instanceof Error ? err.message : err)
      }
    } else {
      saved += 1
    }
  }

  // Worker pool — process N at a time
  let idx = 0
  async function worker() {
    while (idx < targets.length) {
      const myIdx = idx++
      const asset = targets[myIdx]
      await processOne(asset)
      processed += 1
      if (processed % 20 === 0 || processed === targets.length) {
        const elapsedSec = (Date.now() - startT) / 1000
        const rate = processed / elapsedSec
        const remaining = ((targets.length - processed) / rate).toFixed(0)
        console.log(
          `  [${processed}/${targets.length}] saved=${saved} skipped=${skipped} err=${errors} · ${rate.toFixed(1)}/s · ETA ${remaining}s`,
        )
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))

  const totalSec = (Date.now() - startT) / 1000
  console.log()
  console.log(`[결과 — ${totalSec.toFixed(1)}s, ${(processed / totalSec).toFixed(2)} assets/s]`)
  console.log(`  처리: ${processed}건`)
  console.log(`  저장: ${saved}건${apply ? '' : ' (dry-run)'}`)
  console.log(`  추론 결과 비어있음: ${skipped}건`)
  console.log(`  에러: ${errors}건`)

  // Sample 5 saved
  if (apply && saved > 0) {
    console.log(`\n[샘플 저장 확인 — 최근 5건]`)
    const recent = await prisma.contentAsset.findMany({
      where: { programProfileFit: { not: undefined as any } },
      select: { name: true, programProfileFit: true },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    })
    for (const r of recent) {
      console.log(`  ${r.name.slice(0, 50)}: ${JSON.stringify(r.programProfileFit)}`)
    }
  }

  await prisma.$disconnect()
  console.log(apply ? `\n✅ 마이그레이션 완료` : `\n✓ Dry-run 완료. 실제 적용: --apply --batch <N>`)
}

function buildInferPrompt(input: {
  name: string
  narrativeSnippet: string
  keywords: string[]
  category: string
}): string {
  return `
당신은 한국 창업 교육 자산 분류 전문가입니다.
다음 ContentAsset 의 narrativeSnippet 을 보고, **명확히 관련 있는** ProgramProfile 축만 추론하세요.
**확실하지 않은 축은 비워둡니다 (over-confidence 금지).**

[자산]
이름: ${input.name}
카테고리: ${input.category ?? '미상'}
keywords: ${input.keywords.slice(0, 8).join(', ') || '없음'}

narrativeSnippet:
${input.narrativeSnippet.slice(0, 1500)}

──────────────────────────────
[추론 가이드 — 보수적으로]

1. **targetStage** (대상 단계): 본문에 명시되거나 강하게 시사된 경우만.
   ['예비창업_아이디어무', '예비창업_아이디어유', 'seed', 'pre-A', 'series-A이상', '소상공인', '비창업자']

2. **businessDomain** (도메인 — 최대 3개): ['ALL', '식품/농업', '문화/예술', '사회/복지', '여행/레저',
   '교육', '유통/커머스', '제조/하드웨어', 'IT/TECH', '바이오/의료', '환경/에너지', '피트니스/스포츠',
   '부동산/건설', '모빌리티/교통', '홈리빙/펫', '인사/법률/비즈니스', '금융/재무/보험',
   '미디어/엔터테인먼트', '핀테크', '기타']
   ⚠ 시사 없으면 'ALL' 또는 비워두기.

3. **methodologyPrimary**: ['IMPACT', '로컬브랜드', '글로컬', '공모전설계', '매칭', '재창업',
   '글로벌진출', '소상공인성장', '커스텀']
   ⚠ 명확한 방법론 시그니처 없으면 비워두기.

4. **deliveryMode**: ['온라인', '오프라인', '하이브리드']

5. **primaryImpacts** (최대 2): ['교육효과', '창업률', '사업화', '매출증대', '고용창출',
   '글로벌진출', '소상공인성장', '재창업성공', '사회문제해결', '네트워킹']

6. **channelType**: ['B2G', 'B2B'] — 명확할 때만.

[출력 JSON — 명시되지 않거나 불확실한 축은 누락]
{
  "targetStage": "...",
  "businessDomain": ["..."],
  "methodologyPrimary": "...",
  "deliveryMode": "...",
  "primaryImpacts": ["..."],
  "channelType": "B2G",
  "reasoning": "..."
}

JSON 만.
`.trim()
}

// Map LLM 응답 → nested ProgramProfile partial 구조
function mapToFit(raw: any): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {}
  const fit: Record<string, unknown> = {}

  if (typeof raw.targetStage === 'string') fit.targetStage = raw.targetStage
  if (Array.isArray(raw.businessDomain) && raw.businessDomain.length > 0) {
    fit.targetSegment = { businessDomain: raw.businessDomain.filter((x: any) => typeof x === 'string').slice(0, 3) }
  }
  if (typeof raw.methodologyPrimary === 'string') {
    fit.methodology = { primary: raw.methodologyPrimary }
  }
  if (typeof raw.deliveryMode === 'string') {
    fit.delivery = { mode: raw.deliveryMode }
  }
  if (Array.isArray(raw.primaryImpacts) && raw.primaryImpacts.length > 0) {
    fit.primaryImpact = raw.primaryImpacts.filter((x: any) => typeof x === 'string').slice(0, 2)
  }
  if (typeof raw.channelType === 'string') {
    fit.channel = { type: raw.channelType }
  }
  return fit
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
