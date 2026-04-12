/**
 * Planning Agent — 자동화 시나리오 테스트
 *
 * 실제 Claude API를 호출해서 4가지 시나리오를 돌려봄:
 * 1. 고품질 답변 — 인터뷰가 깔끔하게 완료되어야 함
 * 2. 빈약한 답변 — 재질문이 발동하고, 결국 완료되지 않아야 함
 * 3. 엉뚱한 답변 — Agent가 답변과 질문의 미스매치를 감지해야 함
 * 4. 중간 품질 — 재질문 후 개선되면 통과
 *
 * 각 시나리오의 기대값(expectations)과 실제 결과를 비교.
 * 실패한 기대값을 리포트.
 *
 * 실행: npx tsx scripts/test-agent-scenarios.ts
 */

import 'dotenv/config'
import { runAgentTurn } from '../src/lib/planning-agent/agent'
import type {
  AgentTurnOutput,
  ChannelInput,
  PartialPlanningIntent,
  AgentState,
} from '../src/lib/planning-agent/types'

// ─────────────────────────────────────────
// 테스트 RFP 샘플 (입찰 모드)
// ─────────────────────────────────────────

const SAMPLE_RFP_BID = `
2026년 청년 창업가 양성 프로그램 운영 용역

■ 발주기관: 서울특별시 청년청
■ 사업 개요:
서울시 거주 청년(만 19~34세)을 대상으로 창업 기본 역량을 갖춘 예비 창업가 100명을 양성하는 사업입니다. 본 사업은 이론 중심 교육을 지양하고 실전 실행 중심(Action Week 방식)으로 운영되어야 하며, 수료 후 실제 창업 전환까지 이어질 수 있는 후속 지원을 포함합니다.

■ 교육 대상: 서울시 거주 청년 예비창업자 100명
■ 교육 기간: 2026.05.01 ~ 2026.07.31 (3개월)
■ 총 사업비: 250,000,000원 (VAT 별도)

■ 사업 목표:
1. 청년 예비창업가 100명 모집 및 양성
2. 창업 핵심 역량 (기업가정신, 비즈니스 모델, 마케팅, 투자유치 등) 교육
3. 수료율 85% 이상 달성
4. 수료 후 6개월 내 창업 전환율 20% 이상

■ 제안 요구사항:
1. 창업 교육 프로그램 설계 (커리큘럼, Action Week 포함)
2. 전담 코치 운영 (1:1 매칭, 주간 점검)
3. 성과 측정 및 임팩트 리포트 제공
4. 수료 후 알럼나이 네트워크 구축

■ 평가 배점 (100점):
- 사업 이해도 및 추진 전략 (15점)
- 교육 커리큘럼 설계 (20점)
- 코치 및 전문가 구성 (25점) ★★★
- 임팩트 측정 방법론 (20점) ★★
- 운영 관리 체계 (15점)
- 예산 계획의 합리성 (5점)

■ 평가 방식: 서면 심사 + 발표 심사 (15분 발표 + 15분 질의응답)
`.trim()

// ─────────────────────────────────────────
// 시나리오 정의
// ─────────────────────────────────────────

interface Scenario {
  name: string
  description: string
  channel: 'bid'
  rfp: string
  /** 각 턴에서 사용자가 할 답변 (Agent 질문 순서대로) */
  answers: string[]
  expectations: {
    /** 최소 턴 수 */
    minTurns?: number
    /** 최대 턴 수 */
    maxTurns?: number
    /** 최종 완성도 범위 */
    completenessMin?: number
    completenessMax?: number
    /** 재질문이 발동되어야 하는지 */
    expectFollowup?: boolean
    /** 완료 여부 */
    shouldComplete?: boolean
    /** 핵심 슬롯이 채워졌는지 */
    requiredFilledSlots?: string[]
    /** 채워지면 안 되는 슬롯 (빈약한 답변이 저장되면 안 됨) */
    shouldBeEmptySlots?: string[]
  }
}

const scenarios: Scenario[] = [
  // ═══════════════════════════════════════
  // 시나리오 1: 고품질 답변
  // ═══════════════════════════════════════
  {
    name: '🟢 고품질 답변',
    description: '구체적이고 수치 포함한 좋은 답변 → 깔끔하게 완료',
    channel: 'bid',
    rfp: SAMPLE_RFP_BID,
    answers: [
      // Q1: participationDecision
      '1) 평가 배점 "코치 전문성" 25점이 가장 높은데, 우리 800명 코치 풀이 경쟁사 대비 4배 많아서 여기서 크게 벌 수 있음. 2) "Action Week 운영 경험 우대"라고 RFP에 명시되어 있어서 사실상 우리 지명 수준. 국내에서 Action Week 체계화한 건 우리뿐임.',

      // Q2: clientHiddenWants
      '서울시 청년청은 최근 국정감사에서 "청년 창업 지원 사업 성과 부족" 지적받음. 이번 사업에서는 수료율과 창업 전환율을 숫자로 증명할 수 있는 정성/정량 데이터를 원할 것. 특히 졸업생 후속 트래킹 데이터가 핵심.',

      // Q3: mustNotFail
      '1순위: 수료율 85%. 이것보다 낮으면 내년 예산 삭감. 2순위: 창업 전환율 20%. 우리가 "실행 보장"을 내세운 근거라 6개월 내 최소 20팀 법인 설립 못 하면 회사 브랜드 타격.',

      // Q4: competitorWeakness
      '예상 경쟁사: 1) A컨설팅 (작년 수주사) — 지방 거점 부족, 우리 30개 거점 강조. 2) B아카데미 — 코치 풀 200명, 우리 800명 + 분야별 전문성으로 압도. 3) 대기업 계열 교육업체 — 가격 높고 관료적, 우리는 스피드와 유연성.',

      // Q5: riskFactors
      '외적: 1) 경쟁사 OO가 가격 후려치기 가능성, 2) 청년 인구 감소로 모집 리스크. 내적: 3) 3월부터 다른 2개 사업 겹쳐서 PM 여유 부족, 4) 글로벌 코치 풀 부족 (향후 확장 시 이슈).',

      // Q6: decisionMakers
      '서울시 청년청 담당자 김OO 과장은 정량 데이터 선호. 평가위원 구성은 학계 2명 + 업계 2명 + 시청 1명 구조로 추정. 시청 위원은 정책 연속성 중요시함. 학계는 방법론 근거 참고문헌 인용 좋아함.',

      // Q7: pastSimilarProjects
      '2024년 대전시 청년 창업 아카데미 수주. 수료율 92%, 창업 전환 8팀. 만족도 4.7. 잘된 점: Action Week 운영 + 1:1 코칭. 아쉬운 점: 지방 도시라 홍보 채널 제한적. 이번 서울 사업에는 SNS 광고 채널 추가 예정.',
    ],
    expectations: {
      minTurns: 7,
      maxTurns: 9,
      completenessMin: 85,
      shouldComplete: true,
      expectFollowup: false,
      requiredFilledSlots: [
        'participationDecision',
        'clientHiddenWants',
        'mustNotFail',
        'competitorWeakness',
        'riskFactors',
        'decisionMakers',
      ],
    },
  },

  // ═══════════════════════════════════════
  // 시나리오 2: 빈약한 답변 (현재 버그 재현)
  // ═══════════════════════════════════════
  {
    name: '🔴 빈약한 답변',
    description: '"잘 모름" 같은 회피성 답변 → 재질문 발동, 완료 안 됨',
    channel: 'bid',
    rfp: SAMPLE_RFP_BID,
    answers: [
      '잘 모르겠음',
      '아직 정확히 몰라',
      '그냥 여러 곳 나왔다고 보는 거 같음',
      '위에 말한 거 같음',
      '없는 것 같음',
      '모름',
      '없음',
    ],
    expectations: {
      completenessMax: 40,       // 높으면 안 됨
      shouldComplete: false,     // 완료되면 안 됨
      expectFollowup: true,      // 재질문 발동해야 함
      shouldBeEmptySlots: [      // 빈약한 답변이 슬롯에 저장되면 안 됨
        'participationDecision',
        'clientHiddenWants',
        'mustNotFail',
      ],
    },
  },

  // ═══════════════════════════════════════
  // 시나리오 3: 엉뚱한 답변
  // ═══════════════════════════════════════
  {
    name: '🟡 엉뚱한 답변',
    description: '질문과 관련 없는 답변 → 슬롯 매칭 오류 감지되어야 함',
    channel: 'bid',
    rfp: SAMPLE_RFP_BID,
    answers: [
      '작년에 수료율 88%였어',                        // Q1(participationDecision)에 엉뚱한 답
      '경쟁사는 아마 A컨설팅일 것 같아',              // Q2(clientHiddenWants)에 엉뚱한 답
      '예산이 부족해 보여',                          // Q3(mustNotFail)에 엉뚱한 답
      '학계 위원이 많을 것 같은데',                   // Q4(competitorWeakness)에 엉뚱한 답
      '구체적으로 숫자는 모르겠음',                   // Q5(riskFactors)에 엉뚱한 답
      '모르겠음',
      '없음',
    ],
    expectations: {
      // 엉뚱한 답변이라도 secondary slot으로 라우팅되거나 재질문 발동
      completenessMax: 60,
      expectFollowup: true,
    },
  },

  // ═══════════════════════════════════════
  // 시나리오 4: 중간 품질
  // ═══════════════════════════════════════
  {
    name: '🟠 중간 품질',
    description: '구체적이지만 얕은 답변 → 첫 답변은 통과, 재질문 일부 발동',
    channel: 'bid',
    rfp: SAMPLE_RFP_BID,
    answers: [
      '평가 배점이 우리 강점과 맞는 것 같음. 특히 코치 전문성이 높음.',
      '수료율과 창업 전환율을 중요하게 볼 것 같음.',
      '모집이 제일 중요함. 수료율도 중요하고.',
      'A컨설팅이 들어올 것 같음. 그들은 지방 약함.',
      '모집 리스크와 경쟁사 가격 리스크 있음.',
      '서울시 청년청 담당자는 정량 데이터 좋아함.',
      '2024년에 OO대학 청년 창업 아카데미 운영 경험 있음. 수료율 88% 정도 나왔고 만족도 양호.',
    ],
    expectations: {
      minTurns: 7,
      completenessMin: 60,
      shouldComplete: true,
    },
  },
]

// ─────────────────────────────────────────
// 시뮬레이터
// ─────────────────────────────────────────

interface SimulationResult {
  scenarioName: string
  description: string
  // 실제 측정값
  turnsCompleted: number
  completenessFinal: number
  isComplete: boolean
  followupDetected: boolean
  filledSlots: string[]
  emptySlots: string[]
  // 기대값 vs 실제 비교
  failures: string[]
  warnings: string[]
  // 대화 로그 (디버깅용)
  messages: Array<{ role: string; content: string }>
  finalIntent: any
  error?: string
}

async function runScenario(scenario: Scenario): Promise<SimulationResult> {
  const result: SimulationResult = {
    scenarioName: scenario.name,
    description: scenario.description,
    turnsCompleted: 0,
    completenessFinal: 0,
    isComplete: false,
    followupDetected: false,
    filledSlots: [],
    emptySlots: [],
    failures: [],
    warnings: [],
    messages: [],
    finalIntent: null,
  }

  try {
    // 1. 새 세션 시작
    const channelInput: ChannelInput = {
      channel: 'bid',
      rfpText: scenario.rfp,
      meta: { source: 'nara_bot' },
    }

    let turnOutput = await runAgentTurn({ channelInput })
    let state: AgentState | null = turnOutput.state
    result.messages.push({
      role: 'agent',
      content: turnOutput.agentMessage.content,
    })

    // 2. 답변 루프
    let answerIdx = 0
    let prevQuestionId: string | null = null
    const maxTurns = 15 // 안전장치

    while (!turnOutput.isComplete && state && answerIdx < scenario.answers.length && result.turnsCompleted < maxTurns) {
      const currentQuestionId = state.currentQuestion?.id ?? null

      // 재질문 감지 (같은 질문 ID가 반복됨)
      if (prevQuestionId === currentQuestionId && prevQuestionId !== null) {
        result.followupDetected = true
      }
      prevQuestionId = currentQuestionId

      const answer = scenario.answers[answerIdx]
      result.messages.push({ role: 'user', content: answer })

      try {
        turnOutput = await runAgentTurn({
          state,
          userMessage: answer,
        })
        state = turnOutput.state
        result.messages.push({
          role: 'agent',
          content: turnOutput.agentMessage.content,
        })
        result.turnsCompleted++
        answerIdx++
      } catch (err: any) {
        result.error = `Turn ${result.turnsCompleted + 1} error: ${err.message}`
        break
      }
    }

    // 3. 최종 상태 수집
    if (state) {
      result.completenessFinal = state.intent.metadata.completeness
      result.isComplete = turnOutput.isComplete
      result.finalIntent = state.intent

      // 채워진/빈 슬롯 분류
      const ctx = state.intent.strategicContext
      const allSlots = [
        'participationDecision',
        'clientHiddenWants',
        'mustNotFail',
        'competitorWeakness',
        'riskFactors',
        'decisionMakers',
        'pastSimilarProjects',
      ]
      for (const slot of allSlots) {
        const val = (ctx as any)[slot]
        const hasContent = Array.isArray(val)
          ? val.length > 0 && val.some((v: any) => typeof v === 'string' && v.trim().length >= 5)
          : typeof val === 'string' && val.trim().length >= 10
        if (hasContent) result.filledSlots.push(slot)
        else result.emptySlots.push(slot)
      }
    }

    // 4. 기대값 vs 실제 비교
    const exp = scenario.expectations

    if (exp.minTurns !== undefined && result.turnsCompleted < exp.minTurns) {
      result.failures.push(`턴 수 부족: ${result.turnsCompleted} < ${exp.minTurns}`)
    }
    if (exp.maxTurns !== undefined && result.turnsCompleted > exp.maxTurns) {
      result.failures.push(`턴 수 초과: ${result.turnsCompleted} > ${exp.maxTurns}`)
    }
    if (exp.completenessMin !== undefined && result.completenessFinal < exp.completenessMin) {
      result.failures.push(`완성도 부족: ${result.completenessFinal} < ${exp.completenessMin}`)
    }
    if (exp.completenessMax !== undefined && result.completenessFinal > exp.completenessMax) {
      result.failures.push(`완성도 초과 (빈약한 답변인데 높음): ${result.completenessFinal} > ${exp.completenessMax}`)
    }
    if (exp.shouldComplete === true && !result.isComplete) {
      result.failures.push('완료되어야 하는데 완료되지 않음')
    }
    if (exp.shouldComplete === false && result.isComplete) {
      result.failures.push('완료되면 안 되는데 완료됨 (빈약한 답변 통과)')
    }
    if (exp.expectFollowup === true && !result.followupDetected) {
      result.failures.push('재질문이 발동되어야 하는데 안 됨')
    }
    if (exp.requiredFilledSlots) {
      for (const slot of exp.requiredFilledSlots) {
        if (!result.filledSlots.includes(slot)) {
          result.failures.push(`필수 슬롯 미충족: ${slot}`)
        }
      }
    }
    if (exp.shouldBeEmptySlots) {
      for (const slot of exp.shouldBeEmptySlots) {
        if (result.filledSlots.includes(slot)) {
          result.failures.push(`빈약한 답변이 ${slot} 슬롯에 저장됨 (품질 검증 실패)`)
        }
      }
    }
  } catch (err: any) {
    result.error = err.message
    result.failures.push(`치명 오류: ${err.message}`)
  }

  return result
}

// ─────────────────────────────────────────
// 리포트 출력
// ─────────────────────────────────────────

function printResult(result: SimulationResult) {
  console.log('\n' + '═'.repeat(70))
  console.log(`${result.scenarioName}`)
  console.log(`${result.description}`)
  console.log('─'.repeat(70))
  console.log(`턴 수: ${result.turnsCompleted}`)
  console.log(`완성도: ${result.completenessFinal}/100`)
  console.log(`완료: ${result.isComplete}`)
  console.log(`재질문 감지: ${result.followupDetected}`)
  console.log(`채워진 슬롯 (${result.filledSlots.length}): ${result.filledSlots.join(', ') || '(없음)'}`)
  console.log(`빈 슬롯 (${result.emptySlots.length}): ${result.emptySlots.join(', ') || '(없음)'}`)

  if (result.error) {
    console.log(`\n❌ 에러: ${result.error}`)
  }

  if (result.failures.length > 0) {
    console.log(`\n❌ 실패 (${result.failures.length}):`)
    for (const f of result.failures) {
      console.log(`   - ${f}`)
    }
  } else {
    console.log('\n✅ 모든 기대값 통과')
  }

  if (result.warnings.length > 0) {
    console.log(`\n⚠️ 경고:`)
    for (const w of result.warnings) {
      console.log(`   - ${w}`)
    }
  }
}

async function main() {
  console.log('🧪 Planning Agent 시나리오 테스트 시작\n')
  console.log(`시나리오 수: ${scenarios.length}`)

  const results: SimulationResult[] = []

  for (const scenario of scenarios) {
    console.log(`\n\n▶ 실행: ${scenario.name}`)
    const result = await runScenario(scenario)
    results.push(result)
    printResult(result)

    // 결과 JSON 저장
    const fs = await import('fs/promises')
    const filename = `test-output-${scenario.name.replace(/[^\w가-힣]/g, '_')}.json`
    await fs.writeFile(
      `./scripts/${filename}`,
      JSON.stringify(result, null, 2),
      'utf-8',
    )
  }

  // 전체 요약
  console.log('\n\n' + '═'.repeat(70))
  console.log('📊 전체 요약')
  console.log('═'.repeat(70))
  let passCount = 0
  let failCount = 0
  for (const r of results) {
    if (r.failures.length === 0 && !r.error) {
      console.log(`✅ ${r.scenarioName}`)
      passCount++
    } else {
      console.log(`❌ ${r.scenarioName} (${r.failures.length} 실패)`)
      failCount++
    }
  }
  console.log(`\n결과: ${passCount} PASS / ${failCount} FAIL`)

  process.exit(failCount > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('치명 오류:', err)
  process.exit(1)
})
