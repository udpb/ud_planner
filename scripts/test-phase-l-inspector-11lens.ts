/**
 * V3: Inspector 11-lens schema/weight 일관성 검증
 *
 * 검증:
 *   1. InspectorIssueSchema.lens enum 11개 모두 허용
 *   2. CHANNEL_LENS_WEIGHTS — B2G·B2B·renewal 모두 11 lens 정의
 *   3. ALL_LENSES — 11개
 *   4. applyChannelWeights — 11 lens 점수로 호출 시 정상 가중 평균
 *   5. coerceReport — 4 추가 lens issue 도 통과
 *   6. heuristicInspect — backward compat
 *
 * LLM 실제 호출 없이 schema·로직만 검증.
 */

import {
  InspectorIssueSchema,
  InspectorReportSchema,
  CHANNEL_LENS_WEIGHTS,
  applyChannelWeights,
  heuristicInspect,
} from '../src/lib/express/inspector'
import type { InspectorReport } from '../src/lib/express/inspector'
import type { ExpressDraft, Channel } from '../src/lib/express/schema'

let p = 0, f = 0
const ok = (l: string, c: boolean, hint?: string) => {
  c ? (console.log(`  ✓ ${l}`), p++) : (console.log(`  ✗ ${l}${hint ? ' → ' + hint : ''}`), f++)
}

// ─── 1. lens enum 11개 검증 ───
console.log('\n[1] InspectorIssueSchema.lens enum 11 lens')
const allLens = [
  'market', 'statistics', 'problem', 'before-after',
  'key-messages', 'differentiators', 'tone',
  'detail-completeness', 'competitive-context',
  'off-record-insight', 'quantitative-saturation',
]
for (const lens of allLens) {
  const r = InspectorIssueSchema.safeParse({
    lens,
    severity: 'major',
    issue: 'test',
    suggestion: 'test',
  })
  ok(`lens "${lens}" 허용`, r.success, r.success ? '' : r.error.message)
}

// 잘못된 lens 는 거부
const bad = InspectorIssueSchema.safeParse({
  lens: 'invalid-lens',
  severity: 'major',
  issue: 'test',
  suggestion: 'test',
})
ok('invalid lens 거부', !bad.success)

// ─── 2. CHANNEL_LENS_WEIGHTS 11 lens 정의 ───
console.log('\n[2] CHANNEL_LENS_WEIGHTS — 모든 채널에 11 lens 정의')
const channels: Channel[] = ['B2G', 'B2B', 'renewal']
for (const ch of channels) {
  const w = CHANNEL_LENS_WEIGHTS[ch]
  for (const lens of allLens) {
    ok(
      `${ch}.${lens} 가중치 존재`,
      typeof w[lens as keyof typeof w] === 'number',
    )
  }
}

// ─── 3. applyChannelWeights — 11 lens 점수 입력 ───
console.log('\n[3] applyChannelWeights — 11 lens 점수 입력 가중 평균')
const fullReport: InspectorReport = {
  passed: true,
  overallScore: 80,
  lensScores: {
    market: 80, statistics: 90, problem: 75, 'before-after': 85,
    'key-messages': 70, differentiators: 80, tone: 75,
    'detail-completeness': 65, 'competitive-context': 70,
    'off-record-insight': 60, 'quantitative-saturation': 88,
  },
  issues: [],
  strengths: [],
  nextAction: 'test',
}

for (const ch of channels) {
  const weighted = applyChannelWeights(fullReport, ch)
  ok(`${ch} 가중치 적용 — overallScore 정상`, typeof weighted.overallScore === 'number' && weighted.overallScore > 0)
  ok(`${ch} 가중치 적용 — weightedByChannel 설정`, weighted.weightedByChannel === ch)
}

// B2G 는 정량 포화 (1.3) · 통계 (1.3) · 디테일 (1.2) · 문제정의 (1.2) 가중치 높음
// → 이 점수들이 높으면 overallScore 더 올라감
const lowQuantReport: InspectorReport = {
  ...fullReport,
  lensScores: { ...fullReport.lensScores, 'quantitative-saturation': 30 }, // 88 → 30
}
const wB2GHigh = applyChannelWeights(fullReport, 'B2G').overallScore
const wB2GLow = applyChannelWeights(lowQuantReport, 'B2G').overallScore
ok('B2G 정량포화 영향력 — 30 ↓ 시 overallScore 명확히 ↓', wB2GHigh > wB2GLow + 3, `${wB2GHigh} vs ${wB2GLow}`)

// B2B 는 경쟁맥락 (1.3) · 차별화 (1.3) 가중치 높음
const lowCompReport: InspectorReport = {
  ...fullReport,
  lensScores: { ...fullReport.lensScores, 'competitive-context': 30 },
}
const wB2BHigh = applyChannelWeights(fullReport, 'B2B').overallScore
const wB2BLow = applyChannelWeights(lowCompReport, 'B2B').overallScore
ok('B2B 경쟁맥락 영향력 — 30 ↓ 시 overallScore 명확히 ↓', wB2BHigh > wB2BLow + 3, `${wB2BHigh} vs ${wB2BLow}`)

// ─── 4. InspectorReportSchema 전체 검증 ───
console.log('\n[4] InspectorReportSchema 전체 검증 (11 lens issues 포함)')
const fullReportPayload = {
  ...fullReport,
  issues: [
    {
      lens: 'detail-completeness',
      severity: 'major',
      sectionKey: '3',
      issue: '시간표 추상적',
      suggestion: '회차별 강사 실명 매핑',
    },
    {
      lens: 'quantitative-saturation',
      severity: 'critical',
      sectionKey: '1',
      issue: '모호 표현 5건 검출',
      suggestion: 'UD_TRACK_RECORD 정량 인용',
    },
    {
      lens: 'off-record-insight',
      severity: 'minor',
      sectionKey: 'overall',
      issue: '현장 방문 흔적 부족',
      suggestion: '담당자 통화 1+ 시도',
    },
  ],
}
const reportR = InspectorReportSchema.safeParse(fullReportPayload)
ok('11 lens issues 포함된 report 통과', reportR.success, reportR.success ? '' : reportR.error.message)

// ─── 5. heuristicInspect backward compat ───
console.log('\n[5] heuristicInspect — 기존 동작 유지')
const draftBA: ExpressDraft = {
  beforeAfter: { before: '동일 문구', after: '동일 문구' },
  keyMessages: ['1'],
  sections: {},
  meta: {
    startedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    isCompleted: false,
    activeSlots: [],
    skippedSlots: [],
  },
}
const hReport = heuristicInspect(draftBA)
ok('heuristicInspect 동작', hReport.overallScore >= 0 && hReport.overallScore <= 100)
ok('Before/After 동일 — critical issue', hReport.issues.some((i) => i.lens === 'before-after' && i.severity === 'critical'))
ok('keyMessages 부족 — major issue', hReport.issues.some((i) => i.lens === 'key-messages'))

console.log('\n─────────────────────────────')
console.log(`결과: ${p} 통과 / ${f} 실패`)
if (f > 0) process.exit(1)
