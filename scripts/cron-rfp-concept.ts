/**
 * scripts/cron-rfp-concept.ts — W28 (Phase C, Meta-Cognition)
 *
 * 신규 RFP → Concept 매핑 + 도메인 변화 자동 감지.
 *
 * 입력 source:
 *   1. 기존 Project.rfpRaw — 매핑 안 된 신규 프로젝트
 *   2. (미래) W29 Bizinfo fetch — 외부 RFP feed
 *
 * 알고리즘:
 *   1. since=24h 이내 생성된 Project 조회 (또는 매핑 미완료 Project)
 *   2. RFP raw text → keyword 추출 (간단 토크나이저, LLM 없이도 동작)
 *   3. matchConceptsByKeywords (W15 재사용) → 매칭된 Concept 추출
 *   4. 매칭 0건 → 신규 도메인 감지 alert
 *   5. 매칭 결과를 Project.aiNotes 또는 별도 store 에 저장
 *
 * 부수 효과:
 *   - 신규 도메인 자동 감지 → Slack/log alert
 *   - Brain 의 "방어 범위" 자동 측정 (% RFP 매칭됨)
 *
 * 사용:
 *   npx tsx scripts/cron-rfp-concept.ts --dry-run
 *   npx tsx scripts/cron-rfp-concept.ts --since-hours 168 --limit 20
 */

import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })

const argv = process.argv.slice(2)
function arg(flag: string, dflt: string): string {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}
const DRY_RUN = argv.includes('--dry-run')
const SINCE_HOURS = parseInt(arg('--since-hours', '0'), 10) // 0 = 모든 프로젝트
const LIMIT = parseInt(arg('--limit', '0'), 10)
const MIN_MATCHES = parseInt(arg('--min-matches', '3'), 10) // 이 이하면 alert

const STOP_WORDS = new Set([
  '및',
  '등',
  '대한',
  '관련',
  '통한',
  '위한',
  '내용',
  '운영',
  '진행',
  '사업',
  '프로그램',
  '교육',
  '지원',
  '제공',
  '하는',
  '있는',
  '되는',
])

/** RFP 텍스트 → keyword 추출 (간단 토크나이저) */
function extractKeywords(text: string, max = 40): string[] {
  // 한글·영문 단어 토크나이즈
  const tokens = text.match(/[가-힣A-Za-z0-9]+/g) || []
  const counts = new Map<string, number>()
  for (const t of tokens) {
    if (t.length < 2) continue
    if (STOP_WORDS.has(t)) continue
    if (/^\d+$/.test(t)) continue // 순수 숫자 skip
    counts.set(t, (counts.get(t) ?? 0) + 1)
  }
  // 빈도 + 길이 점수 (길수록 의미 있을 가능성)
  const ranked = Array.from(counts.entries())
    .map(([w, c]) => ({ w, c, score: c * (1 + Math.log(w.length)) }))
    .sort((a, b) => b.score - a.score)
  return ranked.slice(0, max).map((r) => r.w)
}

interface ProjectMatch {
  projectId: string
  projectName: string
  rfpChars: number
  topKeywords: string[]
  matchedConcepts: { id: string; name: string; type: string; assetCount: number }[]
  matchedCount: number
  alert?: string
}

async function main() {
  const { prisma } = await import('../src/lib/prisma')

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('▶ W28 — RFP × Concept 자동 매핑 cron')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'PRODUCTION'}`)
  console.log(`since-hours: ${SINCE_HOURS || '∞'} · limit: ${LIMIT || '∞'} · min-matches alert: ${MIN_MATCHES}`)
  console.log('')

  // 1. RFP raw 있는 Project (since 필터)
  const where: Record<string, unknown> = {
    rfpRaw: { not: null },
  }
  if (SINCE_HOURS > 0) {
    where.createdAt = { gte: new Date(Date.now() - SINCE_HOURS * 60 * 60 * 1000) }
  }

  const projects = await prisma.project.findMany({
    where,
    select: {
      id: true,
      name: true,
      rfpRaw: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: LIMIT > 0 ? LIMIT : 100,
  })

  console.log(`📦 분석 대상 Project: ${projects.length}건`)
  if (projects.length === 0) {
    console.log('  (조건에 맞는 Project 없음)')
    await prisma.$disconnect()
    return
  }

  // 2. 기존 Concept 캐시 (matching 용)
  const allConcepts = await prisma.concept.findMany({
    select: { id: true, name: true, type: true, aliases: true, assetCount: true },
  })
  const normalize = (s: string) => s.replace(/\s+/g, '').toLowerCase()
  const nameMap = new Map<string, typeof allConcepts[0]>()
  for (const c of allConcepts) {
    nameMap.set(normalize(c.name), c)
    for (const a of c.aliases) nameMap.set(normalize(a), c)
  }
  console.log(`📚 Concept entity: ${allConcepts.length} (alias 포함 lookup ${nameMap.size})`)
  console.log('')

  // 3. 매핑 수행
  const results: ProjectMatch[] = []
  const newDomainAlerts: ProjectMatch[] = []

  for (const p of projects) {
    const rfp = p.rfpRaw ?? ''
    if (rfp.length < 200) continue

    const keywords = extractKeywords(rfp, 50)
    const matchedConcepts: ProjectMatch['matchedConcepts'] = []
    const seenConceptIds = new Set<string>()
    for (const kw of keywords) {
      const norm = normalize(kw)
      const concept = nameMap.get(norm)
      if (concept && !seenConceptIds.has(concept.id)) {
        seenConceptIds.add(concept.id)
        matchedConcepts.push({
          id: concept.id,
          name: concept.name,
          type: concept.type,
          assetCount: concept.assetCount,
        })
      }
    }
    matchedConcepts.sort((a, b) => b.assetCount - a.assetCount)

    const match: ProjectMatch = {
      projectId: p.id,
      projectName: p.name,
      rfpChars: rfp.length,
      topKeywords: keywords.slice(0, 10),
      matchedConcepts: matchedConcepts.slice(0, 15),
      matchedCount: matchedConcepts.length,
    }
    if (matchedConcepts.length < MIN_MATCHES) {
      match.alert = `🆕 신규 도메인 가능 — Brain 이 ${matchedConcepts.length}개 Concept 만 매칭. 추가 학습 필요.`
      newDomainAlerts.push(match)
    }
    results.push(match)
  }

  // 4. 출력
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`📊 Project ${results.length}건 매핑 결과`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  for (const r of results.slice(0, 20)) {
    const status = r.alert ? '🆕' : '✅'
    console.log(`\n${status} [${r.matchedCount} matched] ${r.projectName.slice(0, 60)} (${r.rfpChars}자)`)
    if (r.alert) console.log(`   ${r.alert}`)
    console.log(`   keywords: ${r.topKeywords.slice(0, 8).join(', ')}`)
    if (r.matchedConcepts.length > 0) {
      console.log(`   matched: ${r.matchedConcepts.slice(0, 8).map((c) => `${c.name}(${c.type.slice(0, 4)},${c.assetCount}a)`).join(', ')}`)
    }
  }
  if (results.length > 20) console.log(`\n  ... +${results.length - 20} more`)
  console.log('')

  // 5. 신규 도메인 alert
  if (newDomainAlerts.length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`🔴 신규 도메인 alert (${newDomainAlerts.length}건)`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    for (const a of newDomainAlerts) {
      console.log(`  ▶ ${a.projectName.slice(0, 60)} — ${a.matchedCount} matched`)
    }
    console.log('')
  }

  // 6. 통계
  const avgMatched =
    results.length > 0
      ? Math.round(results.reduce((s, r) => s + r.matchedCount, 0) / results.length)
      : 0
  const coverage = results.length > 0 ? 100 - (newDomainAlerts.length / results.length) * 100 : 0

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 Summary')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Projects analyzed:   ${results.length}`)
  console.log(`Avg matched concepts: ${avgMatched}`)
  console.log(`Brain coverage:      ${coverage.toFixed(0)}% (≥${MIN_MATCHES} concepts matched)`)
  console.log(`New domain alerts:   ${newDomainAlerts.length}`)
  console.log('')
  console.log(DRY_RUN ? '✓ dry-run 완료' : '✓ rfp-concept cron 완료')

  await prisma.$disconnect()
  process.exit(0)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : String(e))
  process.exit(1)
})
