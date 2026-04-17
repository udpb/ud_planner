/**
 * PM Guide 정적 콘텐츠
 *
 * ADR-005: 가이드북 본문 통째 주입 금지.
 * 여기서는 "흔한 실수 Top 5 / 평가위원 관점 / UD 강점 팁" 만 정적으로 관리.
 */

import type { CommonMistake, StepKey } from './types'

// ─────────────────────────────────────────
// 흔한 실수 (step 별)
// ─────────────────────────────────────────

export const COMMON_MISTAKES_BY_STEP: Record<StepKey, CommonMistake[]> = {
  rfp: [
    {
      id: 'rfp-01',
      mistake: '평가 배점표 미분석',
      consequence: '배점 높은 항목에 분량·근거 투자를 못 하여 점수 누락',
      fix: '평가표를 먼저 분석하고 섹션별 가중치를 확인하세요',
    },
    {
      id: 'rfp-02',
      mistake: 'RFP 키워드 누락',
      consequence: '발주처 관점에서 핵심 사항이 빠져 보임',
      fix: '파싱된 키워드가 기획 방향에 모두 반영되었는지 확인',
    },
  ],
  curriculum: [
    {
      id: 'cur-01',
      mistake: '이론 3연속 배치',
      consequence: '실행 중심 교육 철학 위배, 교육생 집중도 저하',
      fix: 'Action Week 또는 실습 세션을 중간에 삽입하세요',
    },
    {
      id: 'cur-02',
      mistake: 'Action Week 누락',
      consequence: '"실행 보장형 교육" 차별화 포인트 상실',
      fix: '최소 1회 이상 Action Week를 배치하세요',
    },
    {
      id: 'cur-03',
      mistake: 'IMPACT 모듈 미매핑',
      consequence: '자체 방법론 활용도가 평가에 반영되지 않음',
      fix: '각 세션에 관련 IMPACT 모듈 코드를 매핑하세요',
    },
  ],
  coaches: [
    {
      id: 'coach-01',
      mistake: '단일 코치 표현 (4중 지원 체계 누락)',
      consequence: '경쟁사 대비 차별화 실패, 지원 구조가 약해 보임',
      fix: '전문멘토+컨설턴트+전담코치+동료 네트워크 4레이어를 반드시 언급',
    },
    {
      id: 'coach-02',
      mistake: '1:1 코칭 없이 강의만 구성',
      consequence: '교육생 밀착 관리 부족, 이탈 위험 증가',
      fix: '1:1 코칭 페어를 커리큘럼에 포함하세요',
    },
  ],
  budget: [
    {
      id: 'bud-01',
      mistake: '직접비 비율 70% 미만 (B2G)',
      consequence: '공공사업 예산 집행 기준 미달, 감사 위험',
      fix: '직접비 비율을 70% 이상으로 조정하세요',
    },
    {
      id: 'bud-02',
      mistake: '마진 10% 미만',
      consequence: '운영 리스크 흡수 불가, 추가 비용 발생 시 적자',
      fix: '코치 배정 또는 직접비 항목을 조정하여 마진 10%+ 확보',
    },
  ],
  impact: [
    {
      id: 'imp-01',
      mistake: 'Activity에서 Outcome으로의 도약 ("그래서?" 테스트 실패)',
      consequence: '논리 체인이 끊겨 임팩트 목표 달성 근거 약화',
      fix: '각 Output에 "그래서 어떤 변화가 생기는가?" 질문을 던지세요',
    },
    {
      id: 'imp-02',
      mistake: 'Output을 Outcome으로 혼동',
      consequence: '산출(수료 인원)과 성과(역량 변화)를 구분 못 하면 평가 약화',
      fix: 'Output은 수량, Outcome은 변화. "~명 수료"는 Output, "역량 향상"은 Outcome',
    },
  ],
  proposal: [
    {
      id: 'prop-01',
      mistake: 'Section V 보너스 누락',
      consequence: 'RFP 범위 외 추가 제안 없이 경쟁사와 동일 수준',
      fix: '글로벌 연계·임팩트 리포트·후속 투자 연계 등 3~4건 추가 제안',
    },
    {
      id: 'prop-02',
      mistake: '모호한 수량 표현 ("많은", "다양한")',
      consequence: '정량 포화 원칙 위배, 신뢰도 저하',
      fix: '항상 구체적 숫자로 표현 (예: "291명의 코치진", "50개 기업")',
    },
  ],
}

// ─────────────────────────────────────────
// 평가위원 관점 (ChannelPreset fallback)
// ─────────────────────────────────────────

export const EVALUATOR_PERSPECTIVE_FALLBACK: Record<string, string> = {
  B2G: '공무원 + 외부 전문가. 안정성·수행 능력·실적 중시.',
  B2B: '실무 담당자 + 경영진. 결과·ROI·속도 중시.',
  renewal: '이전 프로젝트 경험 있는 담당자 포함. 실질 성과·개선 노력 중시.',
}

// ─────────────────────────────────────────
// UD 강점 팁 (step 별)
// ─────────────────────────────────────────

export const UD_STRENGTH_TIPS: Record<StepKey, string[]> = {
  rfp: [
    '발주처 키워드를 정확히 추출하여 기획 방향에 반영',
    '유사 수주 프로젝트가 있으면 차별화 포인트를 찾아 활용',
  ],
  curriculum: [
    'IMPACT 18모듈 중 5개 이상 명시하여 자체 방법론 활용도를 어필',
    'Action Week 3회 이상 배치로 실행 중심 교육 차별화',
    '1:1 코칭 페어를 포함하여 밀착 관리 역량 강조',
  ],
  coaches: [
    '4중 지원 체계(전문멘토+컨설턴트+전담코치+동료) 반드시 언급',
    '800명 코치 풀 수치화로 규모의 신뢰 확보',
  ],
  budget: [
    '자체 투자사(라이콘) 연계 가능성 언급으로 부가가치 강조',
    'SROI 프록시 매핑으로 사회적 가치 정량화',
  ],
  impact: [
    'ACT-PRENEURSHIP 사전/사후 측정으로 역량 변화 정량 증명',
    '6 Dimension Startup Growth Model 진단으로 성장 추적',
  ],
  proposal: [
    '"국내 최초" — 해당 분야에서 처음 시도하는 요소 찾아 강조',
    '"정량 포화" — 모호한 표현 없이 항상 숫자로 표현',
    '"자체 도구 브랜딩" — ACT-PRENEURSHIP, DOGS, 6 Dimension 고유 명칭 사용',
  ],
}
