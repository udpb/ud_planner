/**
 * 스텝별 리서치 요청 (티키타카 카드)
 *
 * 배경 (2026-04-20 사용자 피드백):
 *   "오른쪽 탭도 프로세스가 진척됨에 따라 뭔가 내용이 달라져야 하지 않을까?"
 *   "리서치를 단계가 진행함에 따라 추가로 요청을 하거나 티키타카가 되는 느낌이 들어야 하는데
 *    뭔가 처음 세팅만 하면 그냥 나머지가 너무 자동으로 버튼만 클릭하게 되는 느낌이야"
 *
 * → 각 스텝 진입 시 AI 가 PM 에게 되묻는 리서치 요청 카드를 우측 패널 최상단에 배치.
 *
 * 제1원칙 (feedback_first_principle.md):
 *   - 모든 requiest 의 `whyAsking` 은 "왜 이걸 물어보는지 + 어떤 배점·차별화와 연결되는지" 를 명시.
 *   - 일반 체크리스트 금지. 구체 구조화 질문.
 *   - PM 이 외부 LLM 에 `promptTemplate` 를 붙여넣어 답 받아, 다시 붙여넣는 인터랙션이 핵심.
 *
 * 저장 경로:
 *   - stores='externalResearch' — 대부분. DB Project.externalResearch JSON 배열에 append.
 *     이후 커리큘럼 AI · Logic Model · 제안서 AI 가 formatExternalResearch() 로 자동 주입.
 *   - stores='strategicNotes' — 전략적 결정 (경쟁 우위·절대 실패 금지) 성격이면 이쪽.
 *     Project.strategicNotes JSON object 에 requestId 키로 저장 → formatStrategicNotes() 로 주입.
 */

import type { StepKey } from './types'
import type { ValueChainStage } from '@/lib/value-chain'

/**
 * 리서치 요청 단건 — PM 이 외부 LLM 에 붙여넣어 답 받는 구조화된 질문.
 *
 * Phase F (ADR-008, 2026-04-23) 확장:
 *   - `valueChainStage`: 이 리서치가 준비하는 논리 단계 (UI 스텝과 다를 수 있음)
 *   - `seedOrHarvest`: 씨앗🌱(앞 스텝에서 미리 뿌리는 질문) / 수확🌾(뒷 스텝에서 확정)
 *   - `linkedResearchIds`: 씨앗↔수확 연결 — 같은 주제 다른 시점 리서치 그룹화
 */
export interface ResearchRequest {
  /** 고유 ID (promptId 로 externalResearch 에 저장) */
  id: string
  /** 한 줄 제목 — PM 이 무엇을 묻는지 3초 안에 이해 */
  title: string
  /** 왜 이걸 묻는가. "어떤 배점·차별화 손실과 연결되는지" 명시 (제1원칙) */
  whyAsking: string
  /** 외부 LLM 에 그대로 붙여넣을 수 있는 완성 프롬프트 (맥락·출력 형식 포함) */
  promptTemplate: string
  /** 답변 저장 위치 — externalResearch(리서치 배열) 또는 strategicNotes(전략 객체) */
  stores: 'externalResearch' | 'strategicNotes'
  /** 선택적 요청인가 (기본 false — 강력 권장) */
  optional: boolean
  /**
   * 이 리서치가 **준비하는** Value Chain 단계 (ADR-008).
   * 리서치의 소속 UI 스텝이 아니라, "어느 논리 단계의 산출물을 예리하게 할 것인가".
   * 예: `rfp-outcome-indicators` 는 Step 1 에 있지만 ⑤ Outcome 을 위한 씨앗이므로 stage='outcome'.
   */
  valueChainStage?: ValueChainStage
  /**
   * 씨앗(앞에서 뿌리는 준비 질문) / 수확(뒤에서 확정하는 검증 질문).
   * 단계 간 연결 가시화에 사용 — 리서치 카드에 🌱/🌾 아이콘.
   */
  seedOrHarvest?: 'seed' | 'harvest'
  /**
   * 연결된 다른 리서치 ID 들 (씨앗↔수확 그룹).
   * 예: `rfp-outcome-indicators` 와 `imp-sroi-proxy`·`imp-outcome-benchmark` 는 같은 그룹.
   */
  linkedResearchIds?: string[]
}

// ─────────────────────────────────────────────────────────────────
// 하위 호환 — 이동된 리서치 ID 매핑
// ─────────────────────────────────────────────────────────────────

/**
 * Phase F Wave 3 (2026-04-23) 에서 이동된 리서치 ID 매핑.
 * 기존 Project.externalResearch JSON 에 구 ID 가 저장되어 있을 수 있으므로
 * UI 및 AI 프롬프트 주입 시 정규화.
 */
export const LEGACY_ID_MAP: Record<string, string> = {
  'imp-outcome-indicators': 'rfp-outcome-indicators',
  'imp-diagnostic-tools': 'cur-diagnostic-tools',
}

/** 구 ID → 신 ID 로 정규화. 모르는 ID 는 그대로 반환. */
export function normalizeResearchId(id: string): string {
  return LEGACY_ID_MAP[id] ?? id
}

// ─────────────────────────────────────────────────────────────────
// 각 스텝의 리서치 요청 정의
// ─────────────────────────────────────────────────────────────────

const RFP_REQUESTS: ResearchRequest[] = [
  {
    id: 'rfp-client-offline',
    title: '발주처 담당자 통화 · 메일 확인 체크리스트',
    whyAsking:
      'RFP 문서엔 안 적힌 "진짜 의도·올해 변화 포인트" 가 "제안 이해도" 배점(통상 최고 가중치 20~30%) 을 가른다. 인터넷 리서치가 아니라 PM 이 직접 통화·메일로 확인해야 하는 4~5가지.',
    promptTemplate: `아래 사업의 발주처 담당자에게 통화 또는 메일로 물어볼 체크리스트를 만들어주세요.
(※ 이건 구글·AI 로 찾을 수 있는 게 아니라 담당자에게만 있는 정보입니다.)

[사업 정보]
- 사업명: [여기에 프로젝트명 붙여넣기]
- 발주기관: [발주처명 붙여넣기]
- 올해 예산: [예산 붙여넣기]

[체크리스트 작성 원칙]
1. RFP 에 안 쓰여 있지만 담당자가 말할 수 있는 정보에 집중
2. "작년 대비 올해 무엇이 달라졌는가" 식 변화 포인트 중심
3. 예산 집행 유연성 · 보고 빈도 · 선호 운영 방식 같은 실무 정보
4. 경쟁사 지원 현황 · 이 사업의 정치적 맥락 같은 정성적 신호
5. 답변 받기 부담 없는 톤 (5~7개 질문, 각 1줄)

출력 형식: 번호 매긴 질문 리스트 + 각 질문 옆 "왜 이걸 묻는지" 한 줄 설명.`,
    stores: 'strategicNotes',
    optional: false,
    valueChainStage: 'impact',
  },
  {
    id: 'rfp-past-similar-winners',
    title: '과거 유사 사업 수주·탈락 사례 3건 (배점 분포 포함)',
    whyAsking:
      '같은 발주처·같은 도메인의 과거 수주·탈락 사례는 "평가위원이 무엇을 중시했는지" 의 가장 강한 신호. 우리의 차별화 포인트가 그 기준에서 통했는지 검증해야 차별화 자산 선택이 흐트러지지 않음.',
    promptTemplate: `아래 사업과 유사한 과거 공공 제안사업의 수주·탈락 사례 3건을 조사해주세요.

[사업 정보]
- 사업명: [프로젝트명]
- 발주기관: [발주처명]
- 도메인: [예: 청년 창업 교육, 지역 브랜드, ESG 임팩트 등]
- 예산 규모: [예산 붙여넣기]

[조사 항목]
1. 최근 2~3년 이 도메인에서 수주한 회사 3곳 (회사명 · 사업명 · 수주 금액)
2. 각 사업의 기술평가 점수 분포 (공시 있으면 수치, 없으면 추정)
3. 당선 회사들의 공통 차별화 포인트 2~3개 (방법론 · 자산 · 실적 기준)
4. 같은 기간 탈락한 사례 1~2건 — 탈락 이유 추정 (가격? 경험 부족? 제안 불일치?)

[출력 형식]
표 형태로 3행 (회사명 · 사업명 · 금액 · 점수 · 차별화 포인트)
+ 탈락 사례 섹션에 "공통 탈락 패턴" 2~3줄 요약.
핵심만, 600~800자.`,
    stores: 'externalResearch',
    optional: false,
    valueChainStage: 'output',
  },
  {
    id: 'rfp-market-shift-2025',
    title: '이 시장·도메인의 2025~2026 변화 3개 (정책·기술·수혜자)',
    whyAsking:
      '제안 배경·컨셉이 "시장 흐름 반영" 제1원칙 위에 서야 "제안 이해도 · 시의성" 배점이 살아남. 과거 사업 문장 복제가 평가위원에게 "최근 공부 안 했구나" 를 드러내는 가장 큰 감점 요인.',
    promptTemplate: `아래 사업의 도메인에서 2025~2026 년 일어나고 있는 변화 3가지를 조사해주세요.
단순 나열이 아니라 "이 사업을 지금 해야 하는 이유" 로 연결되도록.

[사업 정보]
- 도메인: [예: 창업 교육 / 지역 브랜드 / 임팩트 측정 등]
- 대상자: [예: 예비창업가 / 소상공인 / 청년 등]
- 지역: [전국 / 특정 지역]

[세 가지 축에서 각 1개씩]
1. 정책 변화 — 중앙부처 전략 · 지자체 역점사업 · 규제 환경 중 이 사업과 직접 관련된 변화 1개
   (예: 중기부 2025년 창업지원 개편 방향, 지역균형발전특별법 등)
2. 기술 변화 — AI · 디지털 전환 · 자동화 · 플랫폼화 중 이 수혜자에게 작동하는 변화 1개
3. 수혜자 니즈 변화 — 세대 · 소비 · 라이프스타일 · 경력 경로 변화 1개

[각 변화마다]
- 변화 내용 (2~3줄)
- 근거·출처 (정부 보고서·뉴스·통계)
- "그래서 왜 지금 이 사업인가" 한 줄

형식: 번호 매김, 800~1000자.`,
    stores: 'externalResearch',
    optional: false,
    valueChainStage: 'impact',
  },
  {
    id: 'rfp-competitors-strengths',
    title: '경쟁 예상 회사 3곳 + 그들의 강점',
    whyAsking:
      '"우리의 차별화" 는 진공에서 나오는 게 아니라 경쟁사 대비로만 의미가 있음. 경쟁사 강점을 먼저 알아야 Section II(추진전략) 키 메시지에서 헛된 차별화 주장을 피할 수 있음.',
    promptTemplate: `아래 사업에 지원할 가능성이 높은 경쟁 회사 3곳과 각자의 강점을 조사해주세요.

[사업 정보]
- 사업명: [프로젝트명]
- 발주기관: [발주처명]
- 도메인: [도메인]
- 예산: [예산]

[조사 항목]
1. 이 도메인에서 활발하게 수주 중인 회사 3곳 (회사명 · 주 수주 유형)
2. 각 회사의 차별화 강점 1~2개 (방법론 · 자산 · 실적 · 브랜드)
3. 각 회사의 공통 약점 또는 빈틈 (규모 한계 · 지역 한계 · 방법론 협소 등)
4. 그들이 이 사업에 쓸 것으로 예상되는 "뻔한 답변" 2~3개

[출력 형식]
회사별 카드 3개 (회사명 · 강점 · 약점 · 예상 답변).
마지막에 "그래서 우리는 이 세 회사와 어떻게 차별화할 수 있는가" 한 문단.
700~900자.`,
    stores: 'externalResearch',
    optional: false,
    valueChainStage: 'output',
  },
  {
    // 🌱 Phase F Wave 3 (2026-04-23) — imp-outcome-indicators 에서 Step 1 로 이동.
    // Step 5 에서 수확(imp-sroi-proxy · imp-outcome-benchmark)하기 위한 씨앗.
    id: 'rfp-outcome-indicators',
    title: '🌱 SROI 재료가 될 Before/After 지표 후보 5개',
    whyAsking:
      'Outcome 이 "역량 향상" 같은 추상 표현이면 "기대 효과" 배점 직격탄. 이 대상에게 실제 측정 가능한 5개 후보를 **Step 1 에서 미리** 뽑아두면 Step 5 SROI 계산 재료가 바로 준비됨. 제1원칙 중 "Before·After 정량 대비". ⑤ Outcome 수확의 씨앗.',
    promptTemplate: `아래 교육 대상에서 사업 전후 before/after 를 숫자로 보여줄 수 있는 실측 가능한 지표 5개를 조사해주세요.

[대상]
- 대상자: [targetAudience]
- 사업 목적: [impactGoal 또는 제안 컨셉]
- 기간: [개월]

[지표 조건]
1. 사업 시작 전에 측정 가능 (before)
2. 사업 종료 시 재측정 가능 (after)
3. 변화량을 % · 건수 · 배수 중 하나로 표현 가능
4. 교육 사업 논문 · 정책보고서에서 실제 쓰이는 표준 지표 우선
5. 설문·자가진단·실측·매출·고용 · 다양한 유형 섞기

[각 지표마다]
- 지표명 (예: "창업 역량 진단 점수", "월 매출", "고객 재방문율")
- 측정 도구·방법 (설문 · 매출 데이터 · 공시 등)
- 벤치마크 수치 (같은 대상 평균값)
- 이 사업 목표 수치 (before N → after M 예시)

[출력 형식]
번호 매긴 지표 5개 + 맨 아래 "이 5개 중 어느 3개를 Outcome 으로 쓸지" 추천.
600~900자.`,
    stores: 'externalResearch',
    optional: false,
    valueChainStage: 'outcome',
    seedOrHarvest: 'seed',
    linkedResearchIds: ['imp-sroi-proxy', 'imp-outcome-benchmark'],
  },
]

const CURRICULUM_REQUESTS: ResearchRequest[] = [
  {
    id: 'cur-trend-6month',
    title: '이 대상·도메인의 최근 6개월 트렌드 3개',
    whyAsking:
      '커리큘럼이 작년·재작년 양식 그대로면 "실행 역량" 배점에서 감점. 대상(targetStage × businessDomain) 에 맞는 최근 6개월 트렌드가 세션 주제·사례에 녹아야 "이 회사 정말 현장 보고 있다" 신뢰가 생김.',
    promptTemplate: `아래 교육 대상의 최근 6개월 주요 트렌드 3개를 조사해주세요.

[대상]
- 단계: [예비창업 / 초기창업 / 재창업 / 소상공인 등]
- 도메인: [예: F&B / 뷰티 / 디지털 서비스 / 로컬브랜드 등]
- 지역: [전국 또는 특정 지역]
- 교육 목적: [제안 컨셉 또는 impactGoal 붙여넣기]

[트렌드 3개 조건]
1. 최근 6개월 내에 두드러진 변화일 것 (2024 트렌드 아님)
2. 수혜자의 실제 의사결정·행동이 바뀌고 있는 변화일 것
3. 교육 세션 주제·사례로 녹일 수 있을 만큼 구체적일 것

[각 트렌드마다]
- 이름 (한 줄 헤드라인)
- 근거 데이터 (수치 · 사례 · 출처)
- 이 교육에 어떻게 녹일 수 있는가 (세션 주제 또는 사례 아이디어)

형식: 번호 매김, 600~800자.`,
    stores: 'externalResearch',
    optional: false,
    valueChainStage: 'activity',
  },
  {
    id: 'cur-benchmark-structure',
    title: '유사 규모·도메인 사업의 커리큘럼 구성 벤치마크',
    whyAsking:
      '세션 수 · Action Week 비율 · 이론/실습 비율은 평가위원에게 "이 회사가 이 규모 사업을 돌려본 적 있나" 신호. 벤치마크 없이 감으로 구성하면 "운영 실현 가능성" 배점에서 의심 받음.',
    promptTemplate: `아래와 유사한 규모·대상의 교육 사업 3~4개의 커리큘럼 구성을 조사해주세요.

[우리 사업]
- 예산: [예산 붙여넣기]
- 대상자 수: [targetCount]
- 기간: [projectStartDate] ~ [projectEndDate]
- 도메인: [도메인]

[벤치마크 대상]
- 같은 발주처 또는 같은 도메인의 과거 교육 사업
- 예산 규모 ±30% 이내
- 수혜자 수 ±30% 이내

[각 사업마다 조사]
1. 총 세션 수 (몇 회차)
2. 이론 세션 vs 실습 세션 비율 (대략 %)
3. Action Week 또는 현장 실행형 세션 유무 · 배치
4. 1:1 코칭 · 멘토링 포함 여부 · 시간
5. 그 구성의 특이한 점 1개 (왜 이렇게 짰을까)

[출력 형식]
표 형태로 3~4행 (사업명 · 세션수 · 이론/실습 · ActionWeek · 코칭 · 특징).
마지막에 "우리 사업에 적용할 시사점" 3줄.
600~900자.`,
    stores: 'externalResearch',
    optional: false,
    valueChainStage: 'activity',
  },
  {
    id: 'cur-methodology-best-practice',
    title: '해당 방법론의 2025 industry best practice 3개',
    whyAsking:
      '우리 방법론(methodology.primary) 을 "UD 고유" 로만 쓰면 평가위원이 폐쇄적 인상 받음. 글로벌·타 기관 best practice 3개를 인용하면서 "우리도 이 수준 위에서 한 단계 더" 로 포지셔닝하면 "방법론 신뢰도" 배점 상승.',
    promptTemplate: `아래 교육 방법론의 2025년 industry best practice 3개를 조사해주세요.

[우리가 쓰는 방법론]
- 주방법론: [methodology.primary — 예: IMPACT / 매칭 / 로컬브랜드 / 글로컬 등]
- 보조방법론: [methodology.secondary 있으면]
- 교육 대상: [대상]

[조사 대상]
- 같은 방법론 또는 유사 방법론을 쓰는 국내 3곳 + 해외 1곳
- 최근 1년(2025~2026) 사례로 한정 (2020~2023 사례 제외)

[각 사례마다]
1. 기관명 · 프로그램명 · 운영 시기
2. 방법론을 어떻게 구현했는가 (구체 구조 1~2줄)
3. 핵심 성과 수치 (수료율 · 참여자 변화 · 후속 투자 등)
4. 우리가 참고할 만한 "한 가지" (구체 설계 요소)

[출력 형식]
사례별 카드 4개.
마지막에 "그래서 우리는 이 best practice 들을 어떻게 뛰어넘을 수 있는가" 한 문단.
700~900자.`,
    stores: 'externalResearch',
    optional: false,
    valueChainStage: 'activity',
  },
  {
    id: 'cur-client-change-points',
    title: '발주처가 원하는 이번 기수의 변화 포인트',
    whyAsking:
      '재계약·재공고 사업일 때 발주처는 "작년과 무엇이 달라지는가" 를 구체적으로 묻고 싶어함. 이 정보는 RFP 에 안 쓰여 있지만 담당자 통화 · 작년 결과보고서 · 기공고문 비교로만 나옴. 놓치면 "개선 지향 · 성장 의지" 배점 직격탄.',
    promptTemplate: `아래는 우리가 과거 운영했거나 유사 운영 경험이 있는 사업의 "이번 기수 변화 포인트" 를 정리하는 체크리스트입니다.
이 리스트를 답변 형태로 완성해주세요 — 인터넷 리서치 + 담당자 통화 두 소스 합쳐서.

[사업]
- 사업명: [사업명]
- 발주기관: [발주처]
- 재공고 여부: [O / X]
- 과거 운영 경험: [있다면 연도 · 차수 · 당시 성과]

[확인할 포인트 — 답변을 채워주세요]
1. 작년 대비 예산 변화: [증가 · 감소 · 유지 · 정보없음]
2. 대상자 범위 변화: [확대 · 축소 · 동일 · 정보없음] — 구체 어떻게?
3. 평가 기준 변화: [강화 · 완화 · 동일 · 정보없음] — 어느 항목?
4. 발주처 조직 변화: [담당자 변경 · 과 개편 · 예산 과 변경 등]
5. 작년 사업 불만 사항: [있다면 구체적 내용]
6. 올해 특별 요청: [디지털화 · ESG · 지역균형 등 새 키워드 있는가]

[결과 활용]
각 변화 포인트마다 "커리큘럼에서 어떻게 반영할지" 1줄.
500~700자.`,
    stores: 'strategicNotes',
    optional: true,
    valueChainStage: 'activity',
  },
  {
    // 🌱 Phase F Wave 3 (2026-04-23) — imp-diagnostic-tools 에서 Step 2 로 이동.
    // 커리큘럼 설계 시점에 사전·사후 진단 도구를 박아넣어야 Step 5 SROI 수확 가능.
    id: 'cur-diagnostic-tools',
    title: '🌱 사전·사후 진단 도구 비교 (커리큘럼에 박을 측정 장치)',
    whyAsking:
      '커리큘럼 설계 시점에 사전·사후 진단 시점이 세션에 박혀 있지 않으면 Step 5 SROI 계산 재료가 나오지 않음. 내부 도구와 외부 표준 도구 중 어느 조합을 쓸지 **지금 결정** 해야 커리큘럼 주차 배치에 반영 가능. ⑤ Outcome 수확의 씨앗.',
    promptTemplate: `교육 효과성 측정을 위한 진단 도구 3~4개를 비교해주세요.

[대상]
- 대상자: [대상]
- 도메인: [도메인]
- 기대 변화: [impactGoal]

[비교할 도구]
1. 언더독스 자체 도구 — 창업역량 진단 · 6 Dimension Startup Growth
   (우리 내부 자산)
2. 국내 표준 — 중기부 창업역량 진단, 한국창업보육협회 도구 등
3. 국제 표준 — GEM(Global Entrepreneurship Monitor), Business Model Canvas 기반 도구
4. 논문 기반 — 학술 검증된 관련 scale

[각 도구마다]
- 측정 영역 (역량 · 태도 · 행동 · 성과 중 어디)
- 문항 수 · 소요 시간
- 검증 수준 (학술 검증 여부, 표본 크기)
- 이 사업 대상에 적합한 정도 (1~5)
- 비용 · 사용 조건

[출력 형식]
비교 표 4행 + 마지막에 "우리 제안서에 어느 도구 2개 조합을 쓸지" 추천.
600~800자.`,
    stores: 'externalResearch',
    optional: false,
    valueChainStage: 'outcome',
    seedOrHarvest: 'seed',
    linkedResearchIds: ['imp-sroi-proxy', 'imp-outcome-benchmark'],
  },
]

const COACHES_REQUESTS: ResearchRequest[] = [
  {
    id: 'coach-external-partners',
    title: '이 도메인의 외부 파트너 기관 3곳',
    whyAsking:
      '800명 내부 코치만으로 커버 안 되는 도메인이 있음. 외부 파트너(투자사·액셀러레이터·업계 협회) 를 섹션 V 에 1~2개 얹으면 "지원 구조 폭" 배점에서 경쟁사 대비 +3~5점. 어느 기관을 · 어떤 역할로 · 왜 필요한지 구체화 필수.',
    promptTemplate: `아래 사업에 외부 파트너로 얹을 수 있는 기관 3곳을 조사해주세요.

[사업]
- 도메인: [도메인]
- 대상자: [대상]
- 핵심 성과 목표: [impactGoal 또는 Outcome 목표]

[파트너 후보 조건]
1. 이 도메인에서 실제 활동하는 국내 기관
2. 우리와 협업 가능성이 실제로 있는 수준 (너무 큰 곳 배제)
3. 각자 다른 기능 담당 (투자 · 네트워킹 · 액셀러레이팅 · 판로 등)

[각 기관마다]
1. 기관명 · 홈페이지 · 주 활동 분야
2. 이 사업에서 맡을 수 있는 구체 역할 (예: "Action Week 멘토링 3회", "Demo Day 심사")
3. 우리 커리큘럼·코치 풀과 겹치지 않는 차별 기능
4. 접촉 경로 (알음알음 · 공식 제휴 · 과거 협업 이력 등)

[출력 형식]
기관별 카드 3개.
마지막에 "섹션 V 에 어떻게 배치할까" 2~3줄.
600~800자.`,
    stores: 'externalResearch',
    optional: false,
    valueChainStage: 'input',
  },
  {
    id: 'coach-support-structure',
    title: '4중 지원 체계 가용성 확인 (IMPACT·매칭·재창업·글로벌진출 방법론)',
    whyAsking:
      'UD 시그니처인 4중 지원 체계(전문멘토+컨설턴트+전담코치+동료) 는 이 방법론일 때만 위력. 다른 방법론이면 헛된 주장이 되어 "진정성" 배점 감점. 가용성을 먼저 체크해야 coaches 섹션에서 무엇을 강조할지 갈림.',
    promptTemplate: `이 사업에서 UD 4중 지원 체계가 실제로 구현 가능한지 확인해주세요.

[4중 지원 체계 정의]
1. 전문멘토 — 업계 시니어, 도메인 지식 전수
2. 컨설턴트 — 비즈니스 설계·실행 조언
3. 전담코치 — 1:1 밀착 동반 (수료까지)
4. 동료 네트워크 — 동기 수강생 + 기수 선배 연결

[현재 사업 컨텍스트]
- 방법론: [methodology.primary]
- 대상자 수: [N명]
- 기간: [개월]
- 예산 중 코치비: [금액]

[체크리스트 — 각 항목 O/X + 이유]
1. 4층 모두 각각 분리된 인원으로 구성 가능한가
   (아니라면 어떤 층이 겹치는가)
2. 전담코치 배정 비율 (코치 1명 : 수강생 N명) 이 밀착 관리 가능한 수준인가
3. 동료 네트워크 활성화를 위한 세션 설계 있는가 (동기회 · 기수간 믹스)
4. 이 방법론에 4중 체계가 과잉은 아닌가 (로컬브랜드 · 매칭형 등은 단순 구조가 더 설득력)

[결과]
4중 체계가 적합하면 → 제안서에 강조할 수치·사례 2~3개
적합하지 않으면 → 대체 구조 ("3중 · N중 · 도메인 특화") 추천.
500~700자.`,
    stores: 'externalResearch',
    optional: false,
    valueChainStage: 'input',
  },
  {
    id: 'coach-alternative-structure',
    title: '대체 지원 구조 — 로컬브랜드·글로컬·공모전설계 전용',
    whyAsking:
      '4중 지원 체계가 어색한 방법론(로컬브랜드·글로컬·공모전설계) 은 오히려 "도메인 특화 지원 구조" 를 짜야 점수. 예: 로컬브랜드면 "브랜드 어드바이저 + 현장 코디네이터 + 로컬 크리에이터 + 바이어 네트워크" 4층이 더 맞음.',
    promptTemplate: `아래 방법론에 맞는 지원 구조를 N층으로 설계해주세요.

[방법론]
- 주방법론: [로컬브랜드 / 글로컬 / 공모전설계 / 매칭 중 하나]
- 대상자: [대상]
- 핵심 산출물: [브랜드 / 진출 / 수상안 / 매칭 결과]

[설계 원칙]
1. 이 방법론의 핵심 산출물을 만들기 위한 "다른 전문성" 을 층으로 분리
2. 일반 교육 사업의 "멘토+코치" 도식 복사 금지
3. 3~5층이 적정 (너무 많으면 운영 비용 부담)

[각 층마다]
- 층 이름 (역할을 한눈에)
- 전문성 (구체 스킬 · 배경)
- 이 사업에서의 구체 기여 (세션 · 자문 · 연결 등)
- 예상 인원 · 시간 · 비용 범위

[출력 형식]
구조 다이어그램 설명(텍스트) + 각 층 카드.
마지막에 "이 구조가 경쟁사 제안과 어떻게 달라 보이는가" 2줄.
600~900자.`,
    stores: 'externalResearch',
    optional: true,
    valueChainStage: 'input',
  },
]

const BUDGET_REQUESTS: ResearchRequest[] = [
  {
    id: 'bud-benchmark-ratios',
    title: '유사 규모 사업의 예산 실집행 비율 벤치마크',
    whyAsking:
      '직접비·인건비·운영비·홍보비 비율은 평가위원이 "운영 현실성" 을 판단하는 정량 기준. 우리 예산이 시장 평균 대비 어긋나 있으면 감점. 벤치마크 없이 구성하면 "경험 부족" 인상.',
    promptTemplate: `아래와 유사한 규모의 공공 교육 사업의 예산 실집행 비율을 조사해주세요.

[우리 사업]
- 예산: [supplyPrice 또는 totalBudgetVat]
- 대상자 수: [N명]
- 기간: [개월]
- 발주처 유형: [B2G 또는 B2B]

[벤치마크 조건]
- 예산 규모 ±30% 이내
- 공시 또는 보고서 기반 (추정 최소화)

[조사 항목]
1. 직접비 비율 — 수강생에게 직접 가는 비용 (교재 · 현장운영 · 초빙강사)
2. 인건비 비율 — PM · 코치 · 강사 사례비
3. 운영비 비율 — 관리 · 회의 · 교통 등
4. 홍보비 비율 — 모집 홍보 · 결과 공유
5. 마진(이윤) 비율 — 공공사업은 보통 10~15%

[출력 형식]
표 형태로 3~4행 (사업명 · 총예산 · 직접비% · 인건비% · 운영비% · 홍보비% · 마진%).
마지막에 "우리 예산이 벤치마크 대비 어디가 어긋나 있는가" 한 문단.
500~700자.`,
    stores: 'externalResearch',
    optional: false,
    valueChainStage: 'input',
  },
  {
    id: 'bud-client-culture',
    title: '이 발주처의 예산 집행 문화',
    whyAsking:
      '분기별·월별·선지급·사후정산 같은 집행 문화를 모르면 현금흐름 설계 어긋남. "운영 실현 가능성" 배점 직격탄. 이 정보는 담당자·과거 협력사에게만 있음.',
    promptTemplate: `아래 발주처의 예산 집행 문화를 조사 또는 담당자 통화로 확인해주세요.

[발주처]
- 기관명: [client]
- 기관 유형: [중앙부처 / 광역 / 기초 / 공공기관]

[확인 항목]
1. 집행 주기 — 월별? 분기별? 단계별 (설계-운영-결과)?
2. 선지급 비율 — 계약 직후 지급 %? 언제 몇 %?
3. 사후정산 기준 — 결과보고서 기준? 증빙 요구 수준?
4. 변경 유연성 — 예산 항목간 전용 가능? 승인 절차?
5. 보고 빈도 — 월보 · 중간보고 · 결과보고 각각 시기와 형식
6. 과거 정산 시 자주 지적받은 문제 (있다면)

[출력 형식]
각 항목 2~3줄씩.
마지막에 "이 집행 문화 아래서 우리 현금흐름을 어떻게 설계할지" 한 문단.
500~700자.`,
    stores: 'strategicNotes',
    optional: false,
    valueChainStage: 'input',
  },
  {
    id: 'bud-b2g-direct-ratio',
    title: 'B2G 직접비 비율 · 마진 가이드라인 검증',
    whyAsking:
      '공공사업은 직접비 70% + 마진 10~15% 가 불문율. 이 라인 위반이면 감사 위험 + 평가 감점 + 운영 리스크 삼중. 발주처·감독기관별 기준이 다르므로 이 사업에 특정된 기준 재확인 필수. (B2G 일 때만 표시)',
    promptTemplate: `아래 공공사업의 예산 편성 기준을 조사해주세요.

[사업]
- 발주기관: [client]
- 사업 유형: [교육 / 컨설팅 / 육성]
- 예산: [supplyPrice]

[조사 항목]
1. 이 발주처 · 이 유형 사업의 직접비 최소 비율 (%) — 공시 기준
2. 허용 마진 범위 — 일반관리비(간접) + 이윤 합쳐서 몇 %까지
3. 초빙강사 인건비 단가 상한 (시간당 또는 일당)
4. 국고 보조 사업이면 "보조금 관리에 관한 법률" 적용 여부
5. 감사 시 자주 지적되는 예산 항목 (최근 사례)

[출력 형식]
항목별 수치 + 근거(법령 · 지침 이름).
마지막에 "우리 예산 초안이 이 기준 대비 어떤 리스크가 있는가" 체크리스트.
500~700자.`,
    stores: 'externalResearch',
    optional: true,
    valueChainStage: 'input',
  },
]

const IMPACT_REQUESTS: ResearchRequest[] = [
  {
    // 🌾 수확 — 기존 IMPACT 리서치. Step 1/2 씨앗 (rfp-outcome-indicators · cur-diagnostic-tools) 을 받아 여기서 확정.
    id: 'imp-sroi-proxy',
    title: '🌾 SROI 프록시 매핑 적합성',
    whyAsking:
      'SROI 프록시는 "사회적 가치 정량화" 의 핵심. Step 1 에서 뽑은 Outcome 지표 후보 · Step 2 에서 정한 진단 도구를 받아 **여기서 프록시로 확정**. ⑤ Outcome 의 수렴 지점. Project.sroiForecast 비율(예: 1:3.2)의 재료.',
    promptTemplate: `아래 Outcome 들에 적합한 SROI 프록시를 매핑해주세요.

[우리 Outcome 초안]
[Outcome 1: ___]
[Outcome 2: ___]
[Outcome 3: ___]

[참고 프록시 카테고리]
- 교육훈련 임팩트 (창업교육·직업훈련)
- 고용 창출 (신규 일자리)
- 창업 생태계 기여 (신규 법인 설립 · 투자 유치)
- 매출 증대 (참여 기업 매출 상승)
- 사회적 자본 (네트워크 · 멘토링 확장)
- 지역 활성화 (지역 소비 · 인구 유입)

[각 Outcome 마다]
1. 가장 가까운 프록시 카테고리 1개
2. 화폐 환산 기준 (인당 · 건당 · 평균 가치)
3. 데이터 출처 (한국사회가치평가 · UK Social Value Bank 등)
4. 이 사업에서 예상 총 가치 (참여자 수 × 인당 가치)

[출력 형식]
Outcome 별 카드 + 맨 아래 총 SROI 예상치 1줄.
500~700자.`,
    stores: 'externalResearch',
    optional: true,
    valueChainStage: 'outcome',
    seedOrHarvest: 'harvest',
    linkedResearchIds: ['rfp-outcome-indicators', 'cur-diagnostic-tools', 'imp-outcome-benchmark'],
  },
  {
    // 🌾 Phase F Wave 3 신규 (2026-04-23) — SROI 숫자가 과다/과소인지 벤치마크로 검증.
    // 루프 Gate ⑤→② Input 방향 체크의 데이터 기반.
    id: 'imp-outcome-benchmark',
    title: '🌾 유사 사업 SROI·Outcome 달성률 벤치마크',
    whyAsking:
      '우리가 산정한 SROI 비율이 평가위원이 볼 때 "너무 낮아 설득 약함(< 1.5)" 또는 "너무 높아 과다 약속(> 7)" 인지 벤치마크로 검증 필요. 루프 Gate ⑤→②Input 방향 체크의 근거 데이터. 동시에 Outcome 목표 수치가 시장 평균 대비 어느 위치인지 확인.',
    promptTemplate: `우리 사업과 유사한 공공·민간 교육 사업의 SROI 비율 · Outcome 달성률 벤치마크를 조사해주세요.

[우리 사업]
- 대상: [대상자]
- 예산 규모: [원]
- 기간: [개월]
- 참여 규모: [명]
- 우리 SROI 초안: [1 : ___]
- 우리 Outcome 목표 수치: [예: 매출 30% 상승, 창업 20건 등]

[조사 항목]
1. 같은 대상·유사 규모 사업 3~4건 (사업명 · 연도 · 발주처)
2. 각 사업의 공개된 SROI 비율 (보고서 · 감사자료 · 학술 인용)
3. 각 사업의 Outcome 달성률 (목표 대비 실적)
4. 특이 케이스 — 이례적으로 높거나 낮았던 사업 1건 + 이유
5. 우리 SROI 초안의 시장 내 위치 (하위 25% / 중간 / 상위 25% / 이례적)

[각 벤치마크마다]
- 사업명 · 연도
- 예산 · 참여자 수
- SROI 비율 (또는 유사 성과 지표)
- 데이터 출처 (보고서 링크 또는 인용)

[출력 형식]
비교 표 3~4행 + 마지막에 "우리 숫자의 타당성 진단" 한 문단 (하향 조정 · 유지 · 상향 조정 중 어느 쪽).
600~900자.`,
    stores: 'externalResearch',
    optional: false,
    valueChainStage: 'outcome',
    seedOrHarvest: 'harvest',
    linkedResearchIds: ['rfp-outcome-indicators', 'imp-sroi-proxy'],
  },
]

const PROPOSAL_REQUESTS: ResearchRequest[] = [
  {
    id: 'prop-bonus-assets',
    title: 'Section V 보너스 — 이 사업에 얹을 UD 자산 3~4개',
    whyAsking:
      'Section V(추가 제안) 는 RFP 범위 외 가산점 구간. 언더독스 자산(LICORN · 일본/인도 법인 · 아시아투모로우 · 한국사회가치평가) 중 이 사업 맥락에 "왜 이게 필요한지" 연결될 때만 점수. 아무거나 얹으면 "일관성 부족" 감점.',
    promptTemplate: `아래 사업에 Section V 에 얹을 수 있는 언더독스 자산 3~4개를 추천해주세요.

[사업 컨텍스트]
- 사업명: [프로젝트명]
- 도메인: [도메인]
- 대상자: [대상]
- 핵심 Outcome: [Outcome 1~3]

[언더독스 자산 후보]
1. LICORN — 자체 투자사 (시드·프리A)
2. 일본 법인 UD Japan — 글로벌 진출 / 일본 시장 접점
3. 인도 법인 UD India — 글로벌 진출 / 남아시아 시장 접점
4. 아시아투모로우 — 아시아 13개국 스타트업 네트워크 (500+)
5. 한국사회가치평가 — SROI 정량 측정 · 임팩트 리포트 발행
6. 4중 지원 체계 · 800명 코치 풀 (이미 핵심에 있을 수 있음)
7. ACT-PRENEURSHIP · 6 Dimension · DOGS (진단 도구)
8. 10년 498 프로그램 · 20,211명 육성 실적

[추천 조건]
1. 각 자산을 얹는 이유가 이 사업 맥락에서 구체적일 것 ("글로벌 지향" 추상 말고 "왜 일본인지")
2. 운영 부담 대비 기대 점수 상승이 합리적일 것
3. 서로 시너지 나는 조합일 것 (LICORN + 아시아투모로우 = 투자+네트워크 등)

[각 추천마다]
- 자산명
- 왜 이 사업에 얹나 (2~3줄)
- 구체 연계 방식 (세션 · 자문 · 연결 · 후속)
- 예상 추가 효과

[출력 형식]
3~4개 추천 카드 + 맨 아래 "Section V 최종 구성안" 3줄.
700~1000자.`,
    stores: 'externalResearch',
    optional: false,
    valueChainStage: 'output',
  },
  {
    id: 'prop-evaluator-profile',
    title: '평가위원 프로필 재확인',
    whyAsking:
      '같은 발주처라도 이번 평가위원 구성이 작년과 다를 수 있음. 학계·업계·공무원 비율을 알면 문체·레퍼런스·수치 밀도를 맞출 수 있음. 평가위원 프로필 배점 매핑 실수가 흔한 탈락 패턴.',
    promptTemplate: `아래 사업의 평가위원 구성을 추정해주세요.

[사업]
- 발주기관: [client]
- 사업 유형: [교육 / 컨설팅 / 육성]
- 재공고 여부: [O/X]

[조사 항목]
1. 이 발주처의 과거 유사 사업에서 평가위원 구성 패턴
   - 학계 교수 : 업계 전문가 : 공무원 대략 비율
2. 평가위원 공개 여부 (결과 발표 후 공시되는지)
3. 자주 등장하는 평가위원 (복수 사업에서 반복되는 인물 · 기관)
4. 평가위원들이 최근 발표한 논문 · 칼럼 · 정책 제언 중 키워드
5. 이 사업 도메인과 직접 연관된 전문가 (없다면 가장 가까운 전공)

[출력 형식]
평가위원 구성 추정 + 주요 예상 인물 2~3명 특징 + "우리 제안서 톤·밀도를 어디에 맞출지" 추천.
500~700자.`,
    stores: 'strategicNotes',
    optional: true,
    valueChainStage: 'output',
  },
  {
    id: 'prop-rfp-final-check',
    title: '제출 직전 RFP 전체 재읽기 체크리스트',
    whyAsking:
      '모든 스텝을 완료해도 "RFP 의 사소한 필수 요소" (서식 · 증빙 · 첨부 · 특정 언어) 누락이 형식 탈락 원인 1위. AI 가 놓친 요소를 PM 이 다시 체크하는 게 유일한 방어선.',
    promptTemplate: `아래 RFP 를 다시 읽으면서 "우리가 아직 반영 안 했을 수 있는 요소" 를 찾아주세요.

[RFP 요약]
[여기에 rfpRaw 전체 또는 요약 붙여넣기]

[우리가 지금 준비한 것]
[여기에 커리큘럼 · 예산 · 제안서 섹션 주요 포인트 붙여넣기]

[체크리스트 — 각 항목 확인]
1. RFP 에 명시된 "필수 제출 서류" 중 빠진 것
2. 특정 단어·키워드 (지역명 · 정책명 · 부처 슬로건) 가 제안서에 반영되었는가
3. 분량·형식 제한 (페이지 수 · 폰트 · 양식) 지켰는가
4. 특별 요구사항 (여성·장애인 기업 우대 · ESG · 지역균형 등) 에 응답했는가
5. 평가 항목별 최소 분량 요구 있는지
6. 면접 PT 별도 준비 필요한지

[출력 형식]
체크리스트 표 (항목 · 상태 O/X/확인필요 · 메모).
마지막에 "제출 전 반드시 수정할 3가지" 우선순위.
500~800자.`,
    stores: 'externalResearch',
    optional: false,
    valueChainStage: 'output',
  },
  {
    id: 'prop-competitor-answers',
    title: '경쟁사 제안서 추정 구성',
    whyAsking:
      '차별화는 경쟁사의 뻔한 답변을 피하는 데서 시작. 경쟁사가 뭐라고 쓸지 먼저 시뮬레이션하면 우리 키 메시지가 "그들과 다른 무엇" 으로 반응형으로 쓰여짐.',
    promptTemplate: `아래 사업에 지원할 경쟁사 3곳이 쓸 것으로 예상되는 제안서 구성을 시뮬레이션해주세요.

[사업]
- 사업명: [프로젝트명]
- 도메인: [도메인]
- 예산: [예산]

[경쟁사 시뮬레이션 조건]
(Step 1 에서 조사한 경쟁사 3곳이 있으면 그걸 사용, 없으면 이 도메인 주요 3곳)
- 각 회사의 수주 이력 · 방법론 · 강점 반영
- 각 회사가 쓸 것으로 예상되는 제안 컨셉 · 키 메시지 · Section V 보너스

[각 회사마다]
1. 예상 제안 컨셉 1~2줄
2. 핵심 차별화 주장 2~3개 (추상어 피하지 말고 그대로 뽑기)
3. Section V 에 얹을 자산 2~3개
4. 예상 약점 (톤 · 경험 · 실적 중 어디)

[출력 형식]
경쟁사별 카드 3개 + 마지막에 "우리는 이 세 회사가 공통으로 쓸 말을 어떻게 피할까" 3줄.
700~900자.`,
    stores: 'externalResearch',
    optional: false,
    valueChainStage: 'output',
  },
]

// ─────────────────────────────────────────────────────────────────
// 스텝별 맵 export
// ─────────────────────────────────────────────────────────────────

/**
 * 스텝별 리서치 요청 목록.
 *
 * 품질 기준 (Quality Gates):
 *   - 각 스텝 최소 2개 (빈 상태 금지)
 *   - 총 15~25개 (현재 21개)
 *   - 각 `whyAsking` 에 배점·차별화 프레임 포함 (제1원칙)
 *   - `promptTemplate` 은 바로 외부 LLM 에 붙일 수 있는 완성 프롬프트
 */
export const RESEARCH_REQUESTS_BY_STEP: Record<StepKey, ResearchRequest[]> = {
  rfp: RFP_REQUESTS,
  curriculum: CURRICULUM_REQUESTS,
  coaches: COACHES_REQUESTS,
  budget: BUDGET_REQUESTS,
  impact: IMPACT_REQUESTS,
  proposal: PROPOSAL_REQUESTS,
}

/** 합계 개수 확인용 (테스트·문서화) */
export const TOTAL_RESEARCH_REQUESTS = Object.values(RESEARCH_REQUESTS_BY_STEP).reduce(
  (sum, arr) => sum + arr.length,
  0,
)
