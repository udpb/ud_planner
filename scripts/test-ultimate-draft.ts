/**
 * H7: produceUltimateDraft 시뮬 + 실 2025 당선 narrative 와 quality 비교.
 *
 * 시나리오: A.25.0050 성균관대 창업중심대학 Go to Market (B2G · 6,500만원 · 10개사)
 *
 * 비교 기준 (사용자 평가):
 *   1. 플로우 선명도 — 7 섹션이 하나의 narrative arc 인가
 *   2. 맥락 설득력 — 평가위원 입장에서 "설득당할" 정도인가
 *   3. 기존 당선 우위 — 실제 당선 narrative 보다 깊이/구체성 ↑
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
  const { produceUltimateDraft } = await import('../src/lib/express/produce-ultimate-draft')
  const { renderExpressMarkdown } = await import('../src/lib/express/render-markdown')

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  H7: Ultimate Draft Simulation')
  console.log('  A.25.0050 성균관대 창업중심대학 Go to Market (B2G · 6,500만)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const rfp: any = {
    client: '성균관대학교 창업지원단',
    projectName: '2025년 성균관대학교 창업중심대학 Go to Market 프로그램',
    summary:
      '성균관대 창업중심대학 10개사 대상 Go to Market 프로그램. 사업화 역량진단·시장분석 컨설팅·Move the Market 운영 (STP 전략 + 사업제안서) + 사업 개발 컨설팅. 산출물: 기업별 역량/시장 분석 보고서, 맞춤형 제안서, 사업 개발 컨설팅 보고서.',
    keywords: ['Go to Market', 'GTM', '창업중심대학', '시장 진입', '사업화', '스타트업', 'STP', '사업제안서'],
    targetCount: 10,
    targetAudience: '창업중심대학 선정 10개사',
    targetStage: ['기창업'],
    objectives: [
      '10개사 GTM 전략 수립 + 사업제안서 완성',
      '시장 진입 가속화 및 사업화 ROI 정량 측정',
    ],
    constraints: [],
    deliverables: [
      '기업별 역량 진단 보고서',
      '기업별 시장 분석 보고서',
      'GTM 맞춤형 제안서',
      '사업 개발 컨설팅 보고서',
    ],
    evalCriteria: [],
    detectedTasks: ['컨설팅_산출물', '교육_운영', 'GTM_전략'],
    totalBudgetVat: 65_000_000,
    supplyPrice: null,
    eduStartDate: '2025-09-01',
    eduEndDate: '2025-11-28',
    projectType: 'B2G',
  }

  const slotInputs = [
    {
      slot: 'intent',
      pmInput: '성균관대 창업중심대학 10개사 대상 Go to Market 사업 — 4단계 (역량진단 → 시장분석 → STP 전략 → 사업개발 컨설팅) 운영',
    },
    {
      slot: 'beforeAfter.before',
      pmInput: '창업중심대학 선정 10개사가 초기 매출 후 다음 단계 (스케일업·시장 진입) 막혀 있음. 단순 멘토링·강의로는 한계.',
    },
    {
      slot: 'beforeAfter.after',
      pmInput: '4개월 후 10개사 전원 GTM 전략 수립 + 사업제안서 완성 + KPI 기반 실행 로드맵 + 파트너 맞춤형 제안서 도출.',
    },
    { slot: 'keyMessages.0', pmInput: '단순 멘토링을 넘어 시장이 반응하는 실전형 GTM 4단계 완성' },
    { slot: 'keyMessages.1', pmInput: '11년 누적 검증된 ACT Canvas 진단 + IMPACT 18 모듈 GTM 특화' },
    { slot: 'keyMessages.2', pmInput: '10개사 맞춤형 KPI · 사업제안서 100% 완료 (단순 교육 X)' },
    {
      slot: 'sections.1',
      pmInput: '제안 배경 — 창업중심대학 GTM 단계 갈증. 통계청 데이터 + 시장 분석.',
    },
    {
      slot: 'sections.2',
      pmInput: '추진 전략 — 4단계 GTM 프레임 (역량진단·시장분석·STP·사업개발) + Move the Market 핵심.',
    },
    {
      slot: 'sections.3',
      pmInput: '커리큘럼 — 4단계별 회차 + 10개사 1:1 컨설팅 일정.',
    },
    {
      slot: 'sections.4',
      pmInput: '운영 체계 — 4중 페이스메이커 (전담 코치 + 분야 멘토 + 운영팀 + 알럼나이).',
    },
    {
      slot: 'sections.6',
      pmInput: '기대 성과 — 10개사 GTM 보고서 100% / 사업제안서 10건 / KPI 도출 10건.',
    },
  ]

  console.log('\nproduceUltimateDraft 시작...\n')
  const result = await produceUltimateDraft({
    rfp,
    channel: 'B2G',
    slotInputs,
    onProgress: (step, detail) => console.log(`  [${step}] ${detail}`),
  })

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  Metrics')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`총 LLM 호출: ${result.metrics.totalLlmCalls}`)
  console.log(`총 elapsed: ${result.metrics.totalElapsedSec.toFixed(1)}s (${(result.metrics.totalElapsedSec / 60).toFixed(1)}분)`)
  console.log(`호출 분포:`, result.metrics.callsBySource)

  console.log(`\nclientContext.lowConfidence: ${result.clientContext.lowConfidence}`)
  console.log(`clientContext.signatureVocab:`, result.clientContext.signatureVocab?.slice(0, 5))
  console.log(`clientContext.likelyQuestions:`, result.clientContext.likelyQuestions?.slice(0, 3))
  console.log(`\nmatchedAssets: ${result.matchedAssets.length} 자산`)
  result.matchedAssets.slice(0, 5).forEach((m, i) => {
    console.log(`  ${i + 1}. ${m.asset?.name?.slice(0, 60)} (점수 ${m.matchScore?.toFixed(2)})`)
  })
  console.log(`\nrisks: ${result.risks.length} 항목`)
  result.risks.forEach((r, i) => {
    console.log(`  ${i + 1}. [${r.severity}] ${r.risk.slice(0, 80)}`)
  })
  console.log(`\ncoherence reasoning: ${result.coherenceReasoning ?? '?'}`)
  console.log(`inspector score: ${result.inspection?.overallScore ?? '?'}/100`)
  console.log(`inspector issues: ${result.inspection?.issues.length ?? 0}`)

  // .md 출력
  const md = renderExpressMarkdown({
    project: {
      name: '[H7 시뮬] 2025 성균관대 창업중심대학 Go to Market',
      client: '성균관대학교 창업지원단',
      totalBudgetVat: 65_000_000,
      supplyPrice: null,
      eduStartDate: new Date('2025-09-01'),
      eduEndDate: new Date('2025-11-28'),
    },
    draft: result.draft,
  })

  const outPath = path.join(process.cwd(), '.tmp-h7-ultimate.md')
  fs.writeFileSync(outPath, md, 'utf-8')

  console.log(`\n📂 .md 저장: ${outPath}`)
  console.log(`   ${md.length}자 · ${md.split('\n').length} 라인`)
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
