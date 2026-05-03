/**
 * AI Mock 응답 (Phase 4-coach-integration, 2026-05-03)
 *
 * Playwright E2E 시나리오에서 AI 호출 비용·시간 절약 + deterministic 한 응답.
 * PLAYWRIGHT_MOCK_AI=true 일 때만 invokeAi 가 본 모듈을 사용.
 *
 * label 별 fixture 응답 — 실제 응답 형식과 동일.
 */

interface MockTable {
  [labelPrefix: string]: string
}

const MOCKS: MockTable = {
  // RFP 파싱
  'parse-rfp': JSON.stringify({
    projectName: '[E2E Mock] 청년 창업 회복탄력성 강화 사업',
    client: '[E2E Mock] 한국청년창업진흥원',
    totalBudgetVat: 300000000,
    supplyPrice: 272727272,
    projectStartDate: '2026-06-01',
    projectEndDate: '2026-12-31',
    eduStartDate: '2026-07-01',
    eduEndDate: '2026-11-30',
    targetAudience: '예비/초기 창업자 30명',
    targetCount: 30,
    targetStage: ['예비창업', '초기창업'],
    objectives: ['창업 회복탄력성 강화', '사회적 가치 창출 역량 함양', '실전 사업 모델 검증'],
    deliverables: ['수료자 30명', '시제품 5건', '투자유치 3건'],
    evalCriteria: [
      { item: '사업 추진 배경 및 목적', score: 15, notes: '시장·정책·현장 3단 근거' },
      { item: '추진 전략 및 방법론', score: 25, notes: '차별화 + IMPACT 18 모듈 활용' },
      { item: '교육 커리큘럼', score: 20, notes: 'Action Week + 1:1 코칭 가산점' },
      { item: '운영 체계', score: 15, notes: '4중 지원 체계' },
      { item: '예산 계획', score: 10, notes: '직접비 90%+' },
      { item: '기대 성과', score: 15, notes: 'KPI + SROI' },
    ],
    constraints: [{ type: '인력', description: 'PM 풀타임 1명 + 코치 5명 이상' }],
    requiredPersonnel: [{ role: 'PM', qualification: '교육 사업 5년+', count: 1 }],
    keywords: ['청년창업', '회복탄력성', 'IMPACT', '교육'],
    projectType: 'B2G',
    region: '서울',
    summary: '예비/초기 창업자 30명을 대상으로 6개월간 IMPACT 18 모듈 + Action Week 기반 회복탄력성 강화 교육 운영.',
    detectedTasks: ['모객', '심사_선발', '멘토링_코칭', '컨설팅_산출물'],
  }),

  // Express turn (첫 턴)
  'express-first-turn': JSON.stringify({
    extractedSlots: {
      intent: '청년 창업가의 회복탄력성 강화로 지속 가능한 창업 생태계 형성',
    },
    nextQuestion:
      'RFP 핵심을 잘 파악했어요. 사업의 한 문장 정체성을 아래 후보 중 골라주세요. 발주처가 강조하는 "회복탄력성" 을 중심에 둔 표현을 추천드려요.',
    quickReplies: [
      '청년 창업가의 회복탄력성 강화로 지속 가능한 창업 생태계 형성',
      '예비/초기 창업자의 실행 역량 강화 + 사회적 가치 창출',
      '도시재생 기반 청년 협동 창업 활성화',
      '직접 입력하기',
    ],
    externalLookupNeeded: {
      type: 'auto-extract',
      topic: '자산 매칭',
      autoNote: '[E2E Mock] Alumni Hub, IMPACT 18 모듈, ACT Canvas 등 매칭됨',
    },
    validationErrors: [],
    recommendedNextSlot: 'intent',
  }),

  // Express turn (일반)
  'express-turn': JSON.stringify({
    extractedSlots: {
      'beforeAfter.before': '예비창업 청년의 70%가 6개월 내 사업 중단 (창업진흥원 2025)',
      'beforeAfter.after': '회복탄력성 진단 4점 이상 수료자 80%, 6개월 후 사업 지속률 70%+',
    },
    nextQuestion:
      'Before/After 가 채워졌어요. 다음은 핵심 메시지 1개를 정해 주세요. 평가위원이 5초에 이해하는 한 줄 슬로건이면 좋겠습니다.',
    quickReplies: [
      'Action Week 로 6개월 후 사업 지속률 70%+',
      'IMPACT 18 모듈 × 1:1 코칭 페어 = 회복탄력성 보장',
      '실패 후 다시 일어서는 청년 창업가 양성',
      '직접 입력하기',
    ],
    externalLookupNeeded: null,
    validationErrors: [],
    recommendedNextSlot: 'keyMessages.0',
  }),

  // 제안서 섹션 (마크다운 본문)
  'proposal-section-1': `## 청년 창업 회복탄력성 강화의 시급성

[E2E Mock] 정부 정책 흐름 및 시장 데이터 기반 제안 배경.

**[정책 동향]**
- 2025년 「창업진흥법」 개정 — 회복탄력성 교육 의무화 (2026.3 시행)
- 중기부 청년창업 지원 예산 전년 대비 35% 증액 (3,200억원 → 4,320억원)

**[시장 데이터]**
- 예비창업 청년 6개월 내 중단률 70% (창업진흥원 2025)
- IMPACT 18 모듈 적용 사업 수료자 사업 지속률 평균 72% (언더독스 누적 600억+ 수주 사례 분석)

**[왜 지금, 왜 언더독스인가]**
- 2018~24 600억+ 누적 수주, 25,000명 동문 풀
- Action Week + 1:1 코칭 페어로 검증된 4중 지원 체계
- 본 사업은 "회복탄력성 = 측정 가능한 변화" 라는 정량적 접근으로 차별화`,

  // 제안서 다른 섹션도 추가 가능
  'proposal-section-2': `## 추진 전략 — "Resilience-Preneur" 4중 페이스메이커

[E2E Mock] 콘셉트 + 전략 키워드 + KPI 표.

**[콘셉트]** Resilience-Preneur — 6개월 후 다시 일어서는 청년 창업가

**[추진 전략 4 키워드]**
1. **Action Week 선언** — 매주 실행 → 코치 페어 리뷰
2. **IMPACT 18 모듈 매핑** — 단계별 핵심 질문 정조준
3. **5D 스킬셋 진단** — Domain/AI/Global/Data/Finance 사전·사후
4. **Alumni Hub 연결** — 25,000명 풀 멘토링

**[KPI 표]**
| 지표 | 목표 | 측정 |
|---|---|---|
| 수료율 | 95%+ | 매주 출결 |
| 회복탄력성 진단 4점+ | 80% | ACT-PRENEURSHIP 사전·사후 |
| 6개월 후 사업 지속률 | 70%+ | 사후 추적 |`,

  // Logic Model
  'logic-model-builder': JSON.stringify({
    impactGoal:
      '청년 창업가의 회복탄력성 강화로 지속 가능한 창업 생태계 형성',
    impact: [
      {
        id: 'IM-1',
        text: '청년 창업 생태계 회복탄력성 50% 향상',
        sroiProxy: '사회적 가치 — 창업 지속률',
        estimatedValue: '1인당 평생 추정 5,000만원',
      },
    ],
    outcome: [
      {
        id: 'OC-1',
        text: '수료자 80% 가 ACT-PRENEURSHIP 진단 4점 이상 달성',
        sroiProxy: '교육훈련 임팩트',
        estimatedValue: '인당 350만원',
        linkedTo: ['OP-1', 'OP-2'],
      },
    ],
    output: [
      { id: 'OP-1', text: '수료자 30명 (수료율 95%+)', linkedTo: ['AC-1', 'AC-2'] },
      { id: 'OP-2', text: '시제품 5건 + 투자유치 3건', linkedTo: ['AC-3'] },
    ],
    activity: [
      { id: 'AC-1', text: 'IMPACT 18 모듈 강의', linkedTo: ['IN-1'] },
      { id: 'AC-2', text: '1:1 코칭 페어 (코치 5명)', linkedTo: ['IN-2'] },
      { id: 'AC-3', text: 'Action Week × 6주 — 실전 실행 주간', linkedTo: ['IN-1', 'IN-2'] },
    ],
    input: [
      { id: 'IN-1', text: '강사 풀 + IMPACT 자료' },
      { id: 'IN-2', text: '코치 5명 (전담 PM 1명 포함)' },
    ],
    externalInsights: [],
  }),

  // 임팩트 목표 제안
  'suggest-impact-goal': JSON.stringify({
    suggestedGoal:
      '청년 창업가의 회복탄력성 강화로 지속 가능한 창업 생태계 형성',
    rationale:
      'RFP 의 "예비/초기 창업자 30명 대상 회복탄력성 교육" 핵심 + 평가표 임팩트 25% 가중치를 반영. ACT-PRENEURSHIP 진단으로 정량 측정 가능.',
    clarifyingQuestions: [
      '"회복탄력성" 의 구체적 측정 지표는 ACT-PRENEURSHIP 진단으로 충분한가요?',
      '6개월 후 사업 지속률 70% 가 적절한 KPI 인가요?',
    ],
  }),
}

/**
 * label 의 prefix 매칭으로 mock 응답 반환.
 * 매칭 실패 시 기본 빈 JSON 객체 반환 (테스트 안 깨지게).
 */
export function getMockResponse(label: string): string {
  // 정확 매칭 우선
  if (MOCKS[label]) return MOCKS[label]

  // prefix 매칭 — 'proposal-section-1' / 'planning-direction (attempt 1)' 등
  for (const key of Object.keys(MOCKS)) {
    if (label.startsWith(key)) return MOCKS[key]
  }

  // 기본값 — 테스트 깨지지 않게
  console.warn(`[ai-mock] unmatched label: ${label} — returning empty object`)
  return '{}'
}
