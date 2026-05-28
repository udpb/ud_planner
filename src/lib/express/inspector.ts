/**
 * inspectDraft — 1차본 자동 검수 에이전트 (Phase L Wave L5)
 *
 * 사용자 요청: "너가 따로 나중에 검수 에이전트를 통해서 답변 퀄리티가
 * 잘 출력되는지는 점검해줘"
 *
 * 평가 렌즈 (4 + 3):
 *   1) 제1원칙 시장 — 시장·산업 데이터 인용 여부
 *   2) 제1원칙 통계 — 정량 수치·KPI 인용 여부
 *   3) 제1원칙 문제정의 — Before 가 평가위원에게 명확한가
 *   4) 제1원칙 Before/After — After 가 측정 가능한 변화인가
 *   5) keyMessages 분산 — 3개 메시지가 sections 에 골고루 녹아있는가
 *   6) differentiators 인용 — 차별화 자산이 sections 에 흩어졌는가
 *   7) 톤·완결성 — 700자 미만 / 800자 초과 / 마크업 잘림 등
 *
 * 관련: docs/architecture/express-mode.md §8.3 / feedback_first_principle.md
 */

import 'server-only'
import { AI_TOKENS } from '@/lib/ai/config'

import { z } from 'zod'
import { invokeAi } from '@/lib/ai-fallback'
import { safeParseJson as safeParseJsonExternal } from '@/lib/ai/parser'
import {
  SECTION_LABELS,
  type ExpressDraft,
  type SectionKey,
  type Channel,
} from './schema'

// ─────────────────────────────────────────
// 1. 결과 스키마
// ─────────────────────────────────────────

export const InspectorIssueSchema = z.object({
  lens: z.enum([
    'market',
    'statistics',
    'problem',
    'before-after',
    'key-messages',
    'differentiators',
    'tone',
  ]),
  severity: z.enum(['critical', 'major', 'minor']),
  sectionKey: z.string().optional(), // sections.<n> 또는 'overall'
  issue: z.string(),
  suggestion: z.string(),
})

export type InspectorIssue = z.infer<typeof InspectorIssueSchema>

export const InspectorReportSchema = z.object({
  passed: z.boolean(),
  /** 0~100 — 제1원칙 + keyMessages + differentiators 종합 */
  overallScore: z.number().min(0).max(100),
  /** 렌즈별 점수 0~100 */
  lensScores: z.record(z.string(), z.number().min(0).max(100)),
  /** 발견된 이슈 (severity 순) */
  issues: z.array(InspectorIssueSchema),
  /** 우수한 점 — UX 격려 */
  strengths: z.array(z.string()).default([]),
  /** AI 가 추천하는 다음 액션 1줄 */
  nextAction: z.string(),
  /** 채널별 가중치 적용 후 overallScore 가 산정됐는지 (M2 ADR-013) */
  weightedByChannel: z.enum(['B2G', 'B2B', 'renewal']).optional(),
})

export type InspectorReport = z.infer<typeof InspectorReportSchema>

// ─────────────────────────────────────────
// 1.5 채널별 렌즈 가중치 (Phase M2, ADR-013)
// ─────────────────────────────────────────

/**
 * 채널별 평가 가중치 — Inspector overallScore 계산 시 lensScores 에 곱한다.
 *
 * B2G  — 정량 통계 · 정책 근거 · 문제정의 강조 (시장도 중요)
 * B2B  — 발주 부서 문제정의 · Before/After · 차별화 자산 강조
 * renewal — 직전 성과·정량 변화·After 강조, 시장 분석은 덜 (이미 알고 있음)
 *
 * 가중치 합이 정확히 7.0 이 되도록 정규화. lens 7개 × 평균 1.0.
 */
export const CHANNEL_LENS_WEIGHTS: Record<Channel, Record<InspectorIssue['lens'], number>> = {
  B2G: {
    market: 1.1,
    statistics: 1.3,
    problem: 1.2,
    'before-after': 1.0,
    'key-messages': 0.8,
    differentiators: 0.8,
    tone: 0.8,
  },
  B2B: {
    market: 0.9,
    statistics: 0.9,
    problem: 1.3,
    'before-after': 1.2,
    'key-messages': 1.0,
    differentiators: 1.3,
    tone: 0.8,
  },
  renewal: {
    market: 0.7,
    statistics: 1.2,
    problem: 1.0,
    'before-after': 1.3,
    'key-messages': 0.9,
    differentiators: 1.0,
    tone: 0.9,
  },
}

const ALL_LENSES: InspectorIssue['lens'][] = [
  'market',
  'statistics',
  'problem',
  'before-after',
  'key-messages',
  'differentiators',
  'tone',
]

/**
 * lensScores 에 채널 가중치 적용 → overallScore 재계산.
 * 원본 report.overallScore 가 0 이거나 lensScores 가 비어있으면 그대로 반환.
 */
export function applyChannelWeights(
  report: InspectorReport,
  channel: Channel,
): InspectorReport {
  const weights = CHANNEL_LENS_WEIGHTS[channel]
  if (!weights) return report

  // 가중 평균 계산
  let totalWeight = 0
  let weightedSum = 0
  for (const lens of ALL_LENSES) {
    const score = report.lensScores[lens]
    if (typeof score !== 'number') continue
    const w = weights[lens] ?? 1
    weightedSum += score * w
    totalWeight += w
  }
  const weighted =
    totalWeight > 0 ? Math.round(weightedSum / totalWeight) : report.overallScore

  return {
    ...report,
    overallScore: weighted,
    weightedByChannel: channel,
  }
}

// ─────────────────────────────────────────
// 2. 프롬프트
// ─────────────────────────────────────────

function buildInspectPrompt(draft: ExpressDraft): string {
  const sections = (Object.keys(SECTION_LABELS) as SectionKey[])
    .map((k) => {
      const text = draft.sections?.[k] ?? '(미작성)'
      return `### ${k}. ${SECTION_LABELS[k]}\n${text}`
    })
    .join('\n\n')

  const kms = (draft.keyMessages ?? []).map((m, i) => `${i + 1}. ${m}`).join('\n') || '(미작성)'
  const accepted = draft.differentiators?.filter((d) => d.acceptedByPm) ?? []
  const diffSummary =
    accepted.length === 0
      ? '(승인된 차별화 자산 없음)'
      : accepted
          .map((d) => `- [${d.assetId}] ${d.narrativeSnippet.slice(0, 80)} (→ section ${d.sectionKey})`)
          .join('\n')

  return `
당신은 언더독스 RFP 평가위원의 시각으로 1차본을 검수하는 검수 에이전트입니다.

[검수 대상 — 1차본]

## 정체성
${draft.intent ?? '(미작성)'}

## Before / After
Before: ${draft.beforeAfter?.before ?? '(미작성)'}
After: ${draft.beforeAfter?.after ?? '(미작성)'}

## 핵심 메시지 3개
${kms}

## 승인된 차별화 자산
${diffSummary}

## 7 섹션 본문
${sections}

────────────────────────────────────────────
[검수 렌즈]

1) market — 시장·산업 데이터 인용 (예: "국내 X 시장 규모 N억", "정부 지원 사업 매년 X% 증가")
2) statistics — 정량 수치 인용 (KPI·통계·연도)
3) problem — Before 가 평가위원에게 충분히 절박한가, 구체적인가
4) before-after — After 가 측정 가능한 변화이며 Before 와 명확히 차별되는가
5) key-messages — 3개 메시지가 7 섹션에 골고루 녹아있는가 (한 섹션에 몰리지 않음)
6) differentiators — 승인된 차별화 자산이 sections 에 실제 인용 (이름 또는 키 수치)
7) tone — 섹션 길이 (≥200자), 잘림·마크업 깨짐, 한국어 존댓말

[심각도]
- critical — 평가에서 0점 가능성 (빠진 필수 정보, Before/After 동일 의미 등)
- major — 점수 손실 (시장 자료 0건, 차별화 인용 없음)
- minor — 마감 다듬을 사항 (톤 불일치, 길이 미달)

[차별화 5 포인트 매핑 — F1.5 (PDF "데이터센터 운영계획안" §2.3 차별화 5 포인트)]

본 1차본이 평가위원의 5대 차별화 포인트를 얼마나 강하게 충족하는지 함께 평가하세요.
각 포인트에 해당하는 자산·정량 데이터가 본문에 인용되었는지 확인:

1. 근거 기반 기획력 (market + statistics lens 와 연결)
   - 충족 자산 예: 통계청 5년 생존율 34% · 소멸위험지역 57% · 크리에이터이코노미 $480B
   - DOGS·ACTT 진단 데이터 (4.09/5.0, r=.78) 인용 권장

2. 성과관리 체계 (before-after + key-messages 와 연결)
   - 충족 자산 예 (3 진단 체계, 별도 IP):
     • DOGS — 교육 시작 전 1회 (창업가 성향 4 주축 12 유형 + 대화카드 네트워킹·밍글링)
     • ACTT (ACT Test) — **사전·사후 페어 필수** (둘 다 없으면 성장 변화량 측정 불가)
       5대 역량 × 15 지표, 변화량 +1.10 정량 입증
     • 5D — Global·AI·Data·Finance·Domain 시대 필수 5 핵심역량 (별도 진단)
   - 이 3 진단을 커리큘럼 회차에 매핑 권장 — **단 ACTT 사전·사후는 페어로 분리 불가**:
     • 1회차 직전 (또는 1회차): DOGS 진단 + 대화카드 (라포·팀빌딩) — 선택
     • 1~2회차 초반: ACTT 사전 + 5D 진단 (기초 역량 측정) — ACTT 사전 필수
     • 최종회차 (또는 직전): ACTT 사후 (변화량 정량 입증) — ACTT 사후 필수
   - **ACTT 가 사전·사후 둘 중 하나만 있으면 critical issue** — 성과 재현 가능성 검증 불가

3. 실행역량 증명 (differentiators 와 연결)
   - 충족 자산 예: 30,000+ 누적 액트프러너 / 수료율 86.8% (16,076명) / 변화량 +1.10
   - 11년 운영 실적 + 외부 검증(임팩트 리서치랩) 인용 권장

4. 성과 재현 가능성 (statistics + before-after 와 연결)
   - 충족 자산 예: 역량-성과 상관 r=.78 / Top 20% 우수 코호트 Δ0.67
   - 우수 패턴 추출·우수팀 발굴 사례 인용 권장

5. 확산·고도화 전략 (tone + 본문 전반)
   - 충족 자산 예: Asia IMM 표준 / 520+ 글로벌 파트너 / 4개국 거점
   - 후속 사업 확장·글로벌 진출 근거 인용 권장

차별화 5 포인트 미흡 시 differentiators lens 에 issue 추가하고 suggestion 에 어떤 데이터 센터 자산을 인용하면 보강되는지 명시.

────────────────────────────────────────────
[출력 JSON 스키마]

* Phase J (Brain 고도화 2026-05-28): 7 lens → 10 lens 확장
*   추가: detail-completeness (디테일 완결성, guidebook Ch.2)
*         competitive-context (경쟁 맥락, guidebook Ch.2)
*         off-record-insight (공식 밖 정보, guidebook Ch.2)
*         quantitative-saturation (정량 포화, "많은/다양한/충분한" 검출 + 5+ 수치)

{
  "passed": <전체적으로 평가위원 앞에 내놓을 수 있는가 — major 0, minor ≤3 이면 true>,
  "overallScore": <0~100>,
  "lensScores": {
    "market": <0~100>,
    "statistics": <0~100>,
    "problem": <0~100>,
    "before-after": <0~100>,
    "key-messages": <0~100>,
    "differentiators": <0~100>,
    "tone": <0~100>,
    "detail-completeness": <0~100>,
    "competitive-context": <0~100>,
    "off-record-insight": <0~100>,
    "quantitative-saturation": <0~100>
  },
  "issues": [
    {
      "lens": "market" | "statistics" | "problem" | "before-after" | "key-messages" | "differentiators" | "tone" | "detail-completeness" | "competitive-context" | "off-record-insight" | "quantitative-saturation",
      "severity": "critical" | "major" | "minor",
      "sectionKey": "1" | "2" | "3" | "4" | "5" | "6" | "7" | "overall",
      "issue": "...",
      "suggestion": "..."
    }
  ],
  "strengths": ["격려할 만한 잘 된 점 1~3개"],
  "nextAction": "PM 이 다음에 할 일 1줄 (예: '시장 규모 외부 LLM 카드로 보완')"
}

[추가 4 lens 평가 기준 — guidebook Ch.2 다섯 관점 + One Page One Thesis]

8. detail-completeness (디테일 완결성, guidebook Ch.2-2)
   - "모르는 동료가 이 제안서만 보고 회차별 시간표를 쓸 수 있는가" 기준
   - 강사·코치 프로필 실명/경력/담당 회차 매핑 여부
   - 예산 비목 4분류 (인건비·운영비·외주비·제작비) + 비목 내역
   - 안전·리스크·보고 체계 중 하나 이상 "한 문단" 다뤘는가
   - 미달 시: critical (실명 매핑 없음) / major (시간표 추상) / minor (보고 체계 누락)

9. competitive-context (경쟁 맥락, guidebook Ch.2-4)
   - 경쟁사 대비 우리가 명확히 다른 점 1 문장 표현 여부
   - 전년 수행사 아쉬움 포인트가 본문에 과포화로 채워졌는가
   - 가격 경쟁이 아닌 "같은 예산으로 더 큰 효과" 서술 여부
   - 미달 시: critical (차별점 없음) / major (전년 피드백 무시) / minor (가격만 강조)

10. off-record-insight (공식 밖 정보, guidebook Ch.2-5)
    - 담당자 통화·현장 방문 흔적이 있는가 ("이 상권을 직접 걸어 본 결과" 등)
    - RFP 본문 밖 통찰을 재해석으로 녹였는가 (직접 인용 X)
    - 내부 지식 (회사 경험·축적 데이터) 활용 여부
    - 미달 시: critical (현장감 0) / major (담당자 통화 흔적 없음) / minor (내부 지식 부재)

11. quantitative-saturation (정량 포화, guidebook Ch.6-3)
    - "많은/다양한/충분한/적절한/최적의" 모호 표현 0건 권장 (검출 시 critical)
    - 섹션당 정량 수치 (숫자+단위) 5건+ 권장
    - 모든 클레임에 근거 1개+ (수치·사례·도구·체계 중 하나)
    - 미달 시: critical (모호 표현 3건+) / major (정량 < 3건/섹션) / minor (근거 부족)

JSON 만 출력. 설명·마크다운 없이.
`.trim()
}

// ─────────────────────────────────────────
// 3. 메인 함수
// ─────────────────────────────────────────

export async function inspectDraft(
  draft: ExpressDraft,
  options: { channel?: Channel } = {},
): Promise<InspectorReport> {
  const prompt = buildInspectPrompt(draft)

  const r = await invokeAi({
    prompt,
    maxTokens: AI_TOKENS.STANDARD,
    temperature: 0.3, // 검수는 보수적
    label: 'express-inspect',
  })

  const raw = safeParseJsonExternal<unknown>(r.raw, 'express-inspect')
  const validated = InspectorReportSchema.safeParse(raw)
  let report: InspectorReport
  if (validated.success) {
    report = validated.data
  } else {
    // 부분 채움이라도 시도
    console.warn('[inspectDraft] zod 검증 실패 → coerce:', validated.error.message)
    report = coerceReport(raw)
  }

  // 채널 가중치 적용 (M2)
  if (options.channel) {
    report = applyChannelWeights(report, options.channel)
  }
  return report
}

function coerceReport(raw: unknown): InspectorReport {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    passed: Boolean(obj.passed ?? false),
    overallScore: typeof obj.overallScore === 'number' ? obj.overallScore : 0,
    lensScores: (obj.lensScores && typeof obj.lensScores === 'object'
      ? (obj.lensScores as Record<string, number>)
      : {}),
    issues: Array.isArray(obj.issues)
      ? (obj.issues as InspectorIssue[]).filter((x) => typeof x === 'object' && x !== null)
      : [],
    strengths: Array.isArray(obj.strengths)
      ? (obj.strengths as string[]).filter((x) => typeof x === 'string')
      : [],
    nextAction: typeof obj.nextAction === 'string' ? obj.nextAction : '추가 검수 정보 부족',
  }
}

// ─────────────────────────────────────────
// 4. 휴리스틱 백업 (LLM 실패 시 최소 점검)
// ─────────────────────────────────────────

export function heuristicInspect(draft: ExpressDraft): InspectorReport {
  const issues: InspectorIssue[] = []
  let score = 100

  // before/after 동일 검사
  if (
    draft.beforeAfter?.before &&
    draft.beforeAfter?.after &&
    draft.beforeAfter.before.toLowerCase() === draft.beforeAfter.after.toLowerCase()
  ) {
    issues.push({
      lens: 'before-after',
      severity: 'critical',
      issue: 'Before 와 After 가 동일',
      suggestion: 'After 는 측정 가능한 변화로 다시 작성',
    })
    score -= 25
  }

  // keyMessages 3개 미만
  if ((draft.keyMessages?.length ?? 0) < 3) {
    issues.push({
      lens: 'key-messages',
      severity: 'major',
      issue: `keyMessages ${draft.keyMessages?.length ?? 0}개 — 3개 필요`,
      suggestion: '핵심 메시지를 3개로 채워주세요',
    })
    score -= 15
  }

  // 차별화 승인 0개
  const accepted = draft.differentiators?.filter((d) => d.acceptedByPm).length ?? 0
  if (accepted === 0) {
    issues.push({
      lens: 'differentiators',
      severity: 'major',
      issue: '승인된 차별화 자산 0개',
      suggestion: '자산 카드에서 최소 3개 수락',
    })
    score -= 15
  }

  // 섹션 길이
  const requiredSections: SectionKey[] = ['1', '2', '3', '4', '6']
  for (const k of requiredSections) {
    const t = draft.sections?.[k]
    if (!t || t.length < 200) {
      issues.push({
        lens: 'tone',
        severity: 'minor',
        sectionKey: k,
        issue: `섹션 ${k} ${t?.length ?? 0}자 — 200자 미달`,
        suggestion: '챗봇으로 해당 섹션 보강',
      })
      score -= 3
    }
  }

  return {
    passed: score >= 60 && issues.filter((i) => i.severity === 'critical').length === 0,
    overallScore: Math.max(0, score),
    lensScores: {},
    issues,
    strengths: [],
    nextAction: issues.length === 0 ? '제출 가능' : `${issues[0].suggestion}`,
  }
}
