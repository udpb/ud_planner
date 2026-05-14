/**
 * LogicChainChecker — Express 2.0 (Phase M1, 2026-05-14)
 *
 * 슬기님 5 원칙 中 "디테일 완결성 + RFP 정확히 읽기" 직접 대응:
 *   1차본 sections 7개의 논리 흐름이 채널 기대 chain 과 일치하는지 검증.
 *
 * 채널별 기대 chain (Express 2.0 ADR-013 §1.2):
 *   - B2G:    정책 근거 → 발주처 과제 → 솔루션 → 차별화 → 평가배점 매핑 → 기대 성과
 *   - B2B:    발주 부서 니즈 → 인사이트 → 솔루션 → 차별화 → ROI/임팩트
 *   - renewal: 직전 성과 회상 → 학습·한계 → 다음 사이클 확장 → 차별화
 *
 * 호출 시점: 1차본 조립 직전 (sections 5개 이상 채워졌을 때). 토큰 ~3K/회.
 * 비-AI fallback: 키워드 기반 끊김 지점만 찾음.
 *
 * 관련: docs/decisions/013-express-v2-auto-diagnosis.md §결정 §1.3
 */

import 'server-only'
import { invokeAi } from '@/lib/ai-fallback'
import { safeParseJson } from '@/lib/ai/parser'
import { AI_TOKENS } from '@/lib/ai/config'
import { log } from '@/lib/logger'
import type { ExpressDraft, Channel, Department } from './schema'

// ─────────────────────────────────────────
// 1. 채널별 chain 정의
// ─────────────────────────────────────────

interface ChainStep {
  /** 단계 식별자 */
  key: string
  /** 한 줄 설명 — PM 가독성 */
  label: string
  /** 이 단계가 주로 등장해야 할 섹션 (1~7) */
  expectedSections: string[]
  /** 단계 누락 판별 키워드 (heuristic용) */
  keywords: string[]
}

export const CHAIN_BY_CHANNEL: Record<Channel, ChainStep[]> = {
  B2G: [
    {
      key: 'policy-basis',
      label: '정책·법령 근거',
      expectedSections: ['1'],
      keywords: ['정책', '법', '시행령', '계획', '국정과제', '정부', '진흥', '기본계획'],
    },
    {
      key: 'client-issue',
      label: '발주처 과제',
      expectedSections: ['1', '2'],
      keywords: ['과제', '문제', '필요성', '미충족', '미흡', '불균형', '격차'],
    },
    {
      key: 'solution',
      label: '솔루션 (커리큘럼·운영)',
      expectedSections: ['2', '3', '4'],
      keywords: ['커리큘럼', '교육', '코치', '운영', '솔루션', '프로그램'],
    },
    {
      key: 'eval-mapping',
      label: '평가배점 매핑',
      expectedSections: ['2', '7'],
      keywords: ['배점', '평가', '점수', '심사', '평가기준', '항목'],
    },
    {
      key: 'expected-outcome',
      label: '기대 성과 + 정량 지표',
      expectedSections: ['6'],
      keywords: ['성과', '지표', 'KPI', '명', '%', '건', 'SROI', '임팩트', '효과'],
    },
  ],
  B2B: [
    {
      key: 'client-need',
      label: '발주 부서 니즈',
      expectedSections: ['1'],
      keywords: ['니즈', '요구', '과제', '문제', '필요', '목표'],
    },
    {
      key: 'insight',
      label: '인사이트·시장 진단',
      expectedSections: ['1', '2'],
      keywords: ['시장', '경쟁', '인사이트', '트렌드', '데이터', '분석', '벤치마크'],
    },
    {
      key: 'solution',
      label: '솔루션 (커리큘럼·운영)',
      expectedSections: ['2', '3', '4'],
      keywords: ['커리큘럼', '교육', '코치', '운영', '솔루션', '프로그램'],
    },
    {
      key: 'differentiation',
      label: '차별화 (UD 자산)',
      expectedSections: ['2', '4', '7'],
      keywords: ['차별화', '강점', '독자', '경험', '실적', '레퍼런스'],
    },
    {
      key: 'roi',
      label: 'ROI / 비즈니스 임팩트',
      expectedSections: ['5', '6'],
      keywords: ['ROI', '매출', '효율', '비즈니스', '성과', '효과', '환산'],
    },
  ],
  renewal: [
    {
      key: 'prior-result',
      label: '직전 성과 회상',
      expectedSections: ['1', '7'],
      keywords: ['지난', '직전', '전년', '기수', '회차', '성과', '완료'],
    },
    {
      key: 'lesson-limit',
      label: '학습·한계',
      expectedSections: ['1', '2'],
      keywords: ['한계', '학습', '개선', '아쉬운', '미진', '보완'],
    },
    {
      key: 'next-cycle',
      label: '다음 사이클 확장',
      expectedSections: ['2', '3'],
      keywords: ['확장', '발전', '심화', '다음', '신규', '추가'],
    },
    {
      key: 'differentiation',
      label: '차별화·연속성 가치',
      expectedSections: ['4', '7'],
      keywords: ['연속', '축적', '맥락', '관계', '신뢰', '경험'],
    },
  ],
}

// ─────────────────────────────────────────
// 2. 결과 타입
// ─────────────────────────────────────────

export interface LogicChainBreakpoint {
  /** 끊긴 chain step key */
  stepKey: string
  /** 끊긴 단계의 한글 라벨 */
  stepLabel: string
  /** 어떤 섹션에서 끊겼는지 */
  affectedSections: string[]
  /** 끊김 사유 (heuristic 또는 AI 진단) */
  reason: string
  /** 보완 제안 */
  suggestion: string
}

export interface LogicChainDiagnosis {
  passed: boolean
  channel: Channel
  /** 검증된 chain steps 개수 / 전체 */
  passedSteps: number
  totalSteps: number
  /** 끊김 지점들 (passed=false 시) */
  breakpoints: LogicChainBreakpoint[]
  mode: 'ai' | 'heuristic'
}

export interface LogicChainCheckInput {
  draft: ExpressDraft
  channel: Channel
  intendedDepartment?: Department
}

// ─────────────────────────────────────────
// 3. 메인 함수
// ─────────────────────────────────────────

export async function checkLogicChain(
  input: LogicChainCheckInput,
): Promise<LogicChainDiagnosis> {
  const { draft, channel } = input
  const chain = CHAIN_BY_CHANNEL[channel]

  // 섹션 5개 이상 채워졌는지 확인 — 그 미만은 진단 의미 없음
  const filledSecs = (Object.entries(draft.sections ?? {}) as [string, string][])
    .filter(([, t]) => (t ?? '').length >= 100)
  if (filledSecs.length < 3) {
    return {
      passed: true, // 아직 작성 중 — 신호 없음
      channel,
      passedSteps: 0,
      totalSteps: chain.length,
      breakpoints: [
        {
          stepKey: '__notenough__',
          stepLabel: '진단 대상 부족',
          affectedSections: [],
          reason: 'sections 3개 이상 채워져야 chain 진단이 의미 있음',
          suggestion: '먼저 sections 1·2·3·4·6 을 200자 이상씩 채워주세요',
        },
      ],
      mode: 'heuristic',
    }
  }

  // AI 호출 시도
  try {
    return await checkWithAi(draft, channel, chain)
  } catch (err) {
    log.warn('logic-chain-checker', 'AI 호출 실패 — heuristic fallback', {
      error: err instanceof Error ? err.message : String(err),
    })
    return checkHeuristic(draft, channel, chain)
  }
}

// ─────────────────────────────────────────
// 4. Heuristic 진단
// ─────────────────────────────────────────

function checkHeuristic(
  draft: ExpressDraft,
  channel: Channel,
  chain: ChainStep[],
): LogicChainDiagnosis {
  const breakpoints: LogicChainBreakpoint[] = []
  let passedSteps = 0

  for (const step of chain) {
    const corpus = step.expectedSections
      .map((sec) => draft.sections?.[sec as keyof typeof draft.sections] ?? '')
      .join('\n')
    if (!corpus || corpus.length < 50) {
      breakpoints.push({
        stepKey: step.key,
        stepLabel: step.label,
        affectedSections: step.expectedSections,
        reason: `섹션 ${step.expectedSections.join('·')} 가 비어 [${step.label}] 가 누락`,
        suggestion: `섹션 ${step.expectedSections[0]} 에 ${step.label} 1~2문장 추가`,
      })
      continue
    }
    const hits = step.keywords.filter((kw) => corpus.includes(kw)).length
    if (hits === 0) {
      breakpoints.push({
        stepKey: step.key,
        stepLabel: step.label,
        affectedSections: step.expectedSections,
        reason: `[${step.label}] 단서 단어 (${step.keywords.slice(0, 4).join('·')}…) 가 보이지 않음`,
        suggestion: `${step.label} 단계를 짚는 문장을 섹션 ${step.expectedSections.join('·')} 에 명시`,
      })
    } else {
      passedSteps += 1
    }
  }

  return {
    passed: breakpoints.length === 0,
    channel,
    passedSteps,
    totalSteps: chain.length,
    breakpoints,
    mode: 'heuristic',
  }
}

// ─────────────────────────────────────────
// 5. AI 진단
// ─────────────────────────────────────────

interface AiChainResponse {
  passedSteps: string[] // chain step key 들
  breakpoints: Array<{
    stepKey: string
    affectedSections: string[]
    reason: string
    suggestion: string
  }>
}

async function checkWithAi(
  draft: ExpressDraft,
  channel: Channel,
  chain: ChainStep[],
): Promise<LogicChainDiagnosis> {
  const sectionsText = (Object.entries(draft.sections ?? {}) as [string, string][])
    .filter(([, t]) => (t ?? '').length > 0)
    .map(([k, t]) => `[섹션 ${k}]\n${t.slice(0, 800)}`)
    .join('\n\n')

  const chainBlock = chain
    .map((s, i) => `${i + 1}. ${s.key} — ${s.label} (주 섹션: ${s.expectedSections.join('·')})`)
    .join('\n')

  const prompt = `당신은 한국 대기업·정부 제안서 평가 경험 10년차 시니어 컨설턴트입니다.
아래 제안서 1차본의 논리 흐름이 ${channel} 채널의 기대 chain 과 일치하는지 진단하세요.

[기대 chain — ${channel}]
${chainBlock}

[1차본 sections]
${sectionsText.slice(0, 6000)}

진단 기준:
- 각 chain step 이 expected sections 에서 명시적으로 다뤄지는가 (단순 단어 빈도 아님 — 논리적 흐름)
- step 간 흐름이 자연스러운가 (예: 정책 근거 없이 솔루션이 나오면 breakpoint)
- 빠진 step 또는 약하게 다뤄진 step 을 breakpoint 로 명시

반드시 아래 JSON 만 반환:
{
  "passedSteps": ["step-key-1", "step-key-2"],  // 통과한 chain step key 들
  "breakpoints": [
    {
      "stepKey": "policy-basis",
      "affectedSections": ["1"],
      "reason": "정책 근거가 명시되지 않아 발주처가 제안 정당성 평가 불가",
      "suggestion": "섹션 1 도입부에 관련 정책·계획·법령 1줄 인용 추가"
    }
  ]
}`

  const result = await invokeAi({
    prompt,
    maxTokens: AI_TOKENS.STANDARD,
    temperature: 0.3,
    label: 'logic-chain-checker',
  })

  const parsed = safeParseJson<AiChainResponse>(result.raw, 'logic-chain-checker')

  // step key → label 매핑
  const labelByKey = new Map(chain.map((s) => [s.key, s.label]))

  const breakpoints: LogicChainBreakpoint[] = (parsed.breakpoints ?? []).map((bp) => ({
    stepKey: bp.stepKey,
    stepLabel: labelByKey.get(bp.stepKey) ?? bp.stepKey,
    affectedSections: bp.affectedSections ?? [],
    reason: bp.reason,
    suggestion: bp.suggestion,
  }))

  return {
    passed: breakpoints.length === 0,
    channel,
    passedSteps: parsed.passedSteps?.length ?? 0,
    totalSteps: chain.length,
    breakpoints,
    mode: 'ai',
  }
}
