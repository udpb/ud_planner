/**
 * Proposal Patterns Library — Phase K (2026-05-28)
 *
 * 청년마을 PDF + guidebook 5 관점 + 외부 컨설팅 skill (SCQA·Pyramid·MECE·STAR) 학습 기반.
 * 새 제안서 작성 시 매칭·참고 가능한 패턴 카탈로그.
 *
 * 출처:
 *   - 청년마을 만들기 사업 용역 발표자료 (유디임팩트 2026.03, 77p)
 *   - guidebook-site/docs/ko (5 관점 · 표준 섹션 · One-Page-One-Thesis)
 *   - 외부: Barbara Minto Pyramid Principle · McKinsey SCQA · Joseph Williams STAR
 *
 * 사용처:
 *   - Inspector — Brain matching 강화 (lens 별 적용 가능 패턴 안내)
 *   - render-markdown — 본문 구조 자동 생성 (sections.1 SCQA 마커 등)
 *   - S2 Chat — PM 가이드 (어떤 패턴 적용할까)
 */

export interface ProposalPattern {
  /** unique id (snake-case) */
  id: string
  /** 한국어 이름 */
  name: string
  /** 카테고리 */
  category:
    | 'message-hierarchy' // 키 메시지 hierarchy
    | 'section-structure' // 표준 섹션 구조 (I~V)
    | 'narrative-flow' // 서사 흐름 (SCQA · Pyramid · STAR)
    | 'mece-classification' // MECE 분류 패턴 (4대 가치 · 4 유형 등)
    | 'quantitative-pattern' // 정량 포화 패턴
    | 'visual-hierarchy' // One-Page-One-Thesis · 컬러 헤더 등
    | 'support-structure' // 지원 구조 (4중 지원 등)
    | 'self-check' // 5 관점 자체 점검
  /** 어디서 학습됐는가 */
  source: 'youth-village-2026' | 'guidebook' | 'pyramid-principle' | 'scqa' | 'mece' | 'star'
  /** 한 줄 설명 (PM 이 바로 이해할 수 있게) */
  summary: string
  /** 패턴 구조 · 적용 방법 */
  template: string
  /** 적용 사례 (실제 인용) */
  examples?: string[]
  /** 어떤 섹션에 주로 적용 (1~7) */
  applicableSections?: ('1' | '2' | '3' | '4' | '5' | '6' | '7')[]
  /** 어떤 Inspector lens 와 매칭 */
  applicableLenses?: string[]
  /** 적용 시 KPI 영향 */
  expectedImpact?: string
}

// ─────────────────────────────────────────
// 1. Message Hierarchy 패턴 (청년마을 PDF)
// ─────────────────────────────────────────

export const PROPOSAL_PATTERNS: ProposalPattern[] = [
  {
    id: 'youth-village-5-core-messages',
    name: '5 핵심 메시지 hierarchy (청년마을)',
    category: 'message-hierarchy',
    source: 'youth-village-2026',
    summary:
      '구축 / 과정 / 결과 / 인프라 4개 카테고리에 한 줄 메시지 + 1줄 구체화',
    template: `[카테고리] → [메인 메시지 한 줄] → [서브 메시지 한 줄 — 정량/주체/방법 명시]

예시 구조:
구축: 청년마을 주도 사회연대경제 공동체 구축
   서브: 당사자 중심으로 지역주민, 이해관계자, 행정부, 기업 ESG, 전국 300명 멘토가 함께 만드는 공동체

과정: 4대 가치 (연대·협력·참여·혁신) 내재화
결과: 4 유형 × 4중 페이스메이커 시스템 + 인증제
인프라: AX 전환 + One-Stop 육성 + 데이터 아카이브`,
    examples: [
      '청년마을 주도 사회연대경제 공동체 구축 / 당사자 중심으로 행정부·기업 ESG·전국 300명 멘토가 함께',
      '연대·협력·참여·혁신 가치가 내재화된 청년마을 조성 / 4대 핵심가치로 청년마을을 재정의',
    ],
    applicableSections: ['1', '2'],
    applicableLenses: ['key-messages', 'differentiators'],
    expectedImpact: '평가위원 첫 페이지 5초 안에 사업 전체 그림 잡음',
  },
  {
    id: 'pyramid-principle',
    name: 'Pyramid Principle — 결론 먼저 → 핵심 3 → 세부',
    category: 'narrative-flow',
    source: 'pyramid-principle',
    summary: 'Barbara Minto 의 역피라미드 — 결론 1문장 → 근거 3개 → 각 근거의 정량 디테일',
    template: `1. 결론 (한 문장): "본 사업은 X 달성을 통해 Y 효과를 만든다"
2. 핵심 3개: A · B · C (서로 독립 + 합쳐서 완전)
3. 각 핵심의 세부 (정량·사례·구조)

평가위원이 정독 안 해도 1번만 보고 결론 잡음.
시간 있으면 2번 → 3번 순서로 깊어짐.`,
    examples: [
      '결론: 12주 안에 검증된 MVP + 시드 연결 / 핵심3: ACTT 5단계·DOGS 4유형·Action Week 3주',
    ],
    applicableSections: ['1', '2', '6'],
    applicableLenses: ['key-messages', 'detail-completeness'],
    expectedImpact: '헤드라인 훑기 만으로도 평가 시작 가능',
  },
  {
    id: 'scqa-framework',
    name: 'SCQA — Situation · Complication · Question · Answer',
    category: 'narrative-flow',
    source: 'scqa',
    summary: '제안 배경 (section.1) 의 표준 4단 흐름. 평가위원 공감대 형성에 최적',
    template: `1. Situation (상황): "현재 발주처/지역은 X 상태입니다" — 사실 기반
2. Complication (문제): "그런데 Y 문제가 있습니다" — 정량 근거 (통계청 등)
3. Question (질문): "그래서 Z 를 어떻게 해결할 것인가?" — 발주처의 진짜 질문
4. Answer (답): "본 사업은 ..." — 우리의 답 (다음 섹션과 연결)

청년마을 사례:
S — 청년마을 사업 2018-2025 8년차 ('19년 5만명 → '23년 70만명 비수도권 인구 감소)
C — 매년 변동 단년도 성과 지표 + 분절된 브랜딩 (한국표준협회 보고서)
Q — '장기적 성과 관리 + 통합 브랜딩' 어떻게 확립?
A — 4대 가치 (연대·협력·참여·혁신) 내재화 + 4중 페이스메이커`,
    applicableSections: ['1'],
    applicableLenses: ['market', 'problem', 'statistics'],
    expectedImpact: 'sections.1 평가위원 공감 + 다음 섹션으로 자연 진입',
  },

  // ─────────────────────────────────────────
  // 2. Section Structure 패턴
  // ─────────────────────────────────────────

  {
    id: 'standard-5-section-structure',
    name: '표준 5 섹션 구조 I~V (분량 분배)',
    category: 'section-structure',
    source: 'guidebook',
    summary:
      '발주처 RFP 가 목차 지정 안 할 때 기본 골격 — III 가 전체의 40~50% (심장)',
    template: `I.   일반 현황 (10~15%) — 회사·조직·실적·재무
II.  기본 계획 (20~25%) — 제안 배경·전략·인력·로드맵·기대성과
III. 수행 계획 (40~50%) ⭐ — 커리큘럼·코치·임팩트·운영 상세 (제안서의 심장)
IV.  사업 관리 (10~15%) — 품질·보고·예산
V.   기타 추가 제안 (5~10%) — RFP 범위 밖 보너스 3~4건 (차별화 핵심)

배점 최고 항목은 대개 III 에 대응.
V 는 RFP 가 요구 안 한 것 — 경쟁사와 가장 차이 나는 영역.`,
    applicableLenses: ['detail-completeness'],
    expectedImpact: '평가배점 분배 자동 균형',
  },
  {
    id: 'one-page-one-thesis',
    name: 'One-Page-One-Thesis (청년마을 PDF 학습)',
    category: 'visual-hierarchy',
    source: 'youth-village-2026',
    summary: '한 페이지 = 한 가지 주장. 평가위원 헤드라인 훑기 대응',
    template: `[1] 카테고리 라벨 (좌상단, 작게): "기본계획 1) 제안 배경 및 목적"
[2] 부제목 (콜론 형식): ": 청년마을 정책 목표"
[3] 큰 따옴표 헤드라인 (가운데, 굵게): "청년이 주체가 되어 지역에 활력을 넣는 대표 장기 지속 사업"
[4] 시각 자료 (헤드라인 증명): 도표·통계·도식
[5] 출처/카피라이트 (하단): copyright © 2026 ...

평가위원은 정독 X — 헤드라인만 훑음.
헤드라인이 없거나 한 페이지에 여러 주제면 "정리 안 된 제안서" 인상.`,
    examples: [
      '"청년마을은 지역 공동체와 지역 창업가의 중간점에 있어 정의하기 어렵습니다"',
      '"청년이 주체가 되어 지역에 활력을 넣는 대표 장기 지속 사업"',
    ],
    applicableSections: ['1', '2', '3', '4', '5', '6', '7'],
    applicableLenses: ['key-messages', 'tone'],
    expectedImpact: '헤드라인 훑기로 결론 잡힘 + visual flow 일관',
  },

  // ─────────────────────────────────────────
  // 3. MECE 분류 패턴
  // ─────────────────────────────────────────

  {
    id: 'mece-4-values',
    name: 'MECE 4대 가치 분류 (청년마을: 연대·협력·참여·혁신)',
    category: 'mece-classification',
    source: 'youth-village-2026',
    summary:
      '본 사업의 가치를 4개로 나눠 — 각 가치가 독립 (Mutually Exclusive) + 합쳐서 전부 (Collectively Exhaustive)',
    template: `4개 가치 정의:
1. [가치 A]: 함께 ~하는 ~ (정의 한 줄)
2. [가치 B]: 상호 호혜적인 ~ (정의 한 줄)
3. [가치 C]: 주체적인 ~ (정의 한 줄)
4. [가치 D]: ~의 ~ 내재화 (정의 한 줄)

각 가치별 → 본 사업 과업 매핑 → KPI

청년마을 사례:
연대: 계획 검토·사업비 관리·현장 점검·성과 분석·인증제
협력: 멘토단·맞춤 컨설팅·연합 사업·대학 연계·기업 협력
참여: 마을 학교·소통 채널·협의체·발대식·홍보 행사
혁신: AX 도입·글로벌 교류·임팩트 투자·리포트`,
    applicableSections: ['2'],
    applicableLenses: ['key-messages', 'differentiators'],
    expectedImpact: '평가위원이 사업 분류 명확히 인식',
  },
  {
    id: 'mece-4-types',
    name: 'MECE 4 유형 분류 (청년마을: 정주·창업·네트워크·지역거점)',
    category: 'mece-classification',
    source: 'youth-village-2026',
    summary: '대상을 4 유형으로 분류 + 각 유형별 비율 정량 (19.6% · 27.5% · 21.6% · 31.4%)',
    template: `4 유형 분류:
1. 정주형 (19.6%): 외부 청년이 지역에 정착 — 강릉 강릉살자 (1-2개월 → 정착 31.1%)
2. 창업형 (27.5%): 지역자원 경제 자립 — 괴산 뭐하농 (농촌 로컬콘텐츠)
3. 네트워크형 (21.6%): 지역 내/외 관계망 — 목포 괜찮아마을 (지속 가능 커뮤니티 시초)
4. 지역거점형 (31.4%): 복합문화공간·맞춤 서비스 — 태백 광광스토리지 (탄광 문화 재해석)

분류 → 정량 → 대표 사례 = MECE 완성도 입증`,
    applicableSections: ['2', '6'],
    applicableLenses: ['differentiators', 'statistics'],
    expectedImpact: 'segmentation + 사례 = 분석 깊이 증명',
  },

  // ─────────────────────────────────────────
  // 4. Quantitative Pattern (정량 포화)
  // ─────────────────────────────────────────

  {
    id: 'quantitative-saturation',
    name: '정량 포화 — 모든 클레임에 수치+근거',
    category: 'quantitative-pattern',
    source: 'guidebook',
    summary: '"많은/다양한/충분한" 모호 표현 금지. 섹션당 정량 5~10개 분포',
    template: `❌ 나쁜 예 → ⭕ 좋은 예
"많은 코치" → "전국 800명 코치 풀"
"풍부한 경험" → "10년간 498개 프로그램, 20,211명 창업가 육성"
"다양한 파트너" → "520개+ 글로벌 파트너, 96개 지역 동시 운영"
"체계적으로 운영" → "2주에 1회 오프라인 + 월 1회 통합 + 상시 카카오톡"

언더독스 핵심 정량 (UD_TRACK_RECORD):
- 10년 운영 · 누적 수주 500억+ · 운영 프로그램 498건
- 청년 창업가 20,211명 (배출 창업팀 6,110건)
- 코치 풀 800명 · 글로벌 파트너 520+
- 전국 30개 거점 · 96개 지역 · 1,500명 동시 운영
- 신용등급 BB+ · 1,600개 기업 ESG 측정 · 매년 10,000명 DB 갱신

청년마을 사례 정량 포화:
사업규모(누적) 60억원 / 지역정착률 75% / 지역내 협력 500건
사업규모(누적) 30억원 / 협업 지방정부 23개 / 지역방문 8,271회
사업규모(누적) 225억원 / 거점대학 30개 / 육성청년 5,000명`,
    applicableSections: ['1', '2', '3', '4', '5', '6', '7'],
    applicableLenses: ['quantitative-saturation', 'statistics'],
    expectedImpact: '평가위원 신뢰도 확보 + 자랑 vs 증명 명확',
  },

  // ─────────────────────────────────────────
  // 5. Support Structure (지원 구조)
  // ─────────────────────────────────────────

  {
    id: '4-layer-support',
    name: '4중 지원 체계 (창업·소상공인 사업 기본)',
    category: 'support-structure',
    source: 'guidebook',
    summary: '단일 담당자 표현 X → 3+ 레이어 구조로 도식',
    template: `4중 지원 체계 (창업 교육 기본):
1. 전문 멘토단 — 분야별 전문가 300명+ 풀, 분기별 전문 조언
2. 컨설턴트 풀 — 심화 분야 1:1 컨설팅 (회계·법률·투자·글로벌)
3. 전담 코치 (액션코치) — 주간 1:1 코칭, 실행 견인, 진행 점검
4. 동료 네트워크 — 코호트 러닝·알럼나이 커뮤니티·협업 연결

사업 유형별 다른 구조:
- 공모전·디자인: 심사위원단 + 컨설턴트 + 유통 MD
- 문화·장인 교류: 국내 장인 + 국외 교류 + 운영사무국
- 매칭 (멘토링·프로보노): 임직원·멘토 풀 + 수혜 조직 담당자 + 매칭 운영자
- 로컬 상권: 상권강화기구 + 주민 협의체 + 외부 추진단 + 운영사무국
- 글로벌 진출: 국내 멘토 + 현지 파트너 + 바이어 + 해외 법인

원칙: 최소 3 레이어. 단일 표현 X.`,
    applicableSections: ['4'],
    applicableLenses: ['detail-completeness', 'differentiators'],
    expectedImpact: '"이 회사 진짜 할 수 있나?" 의문 해소',
  },
  {
    id: 'youth-village-pacemaker',
    name: '4중 페이스메이커 시스템 (청년마을 유형별)',
    category: 'support-structure',
    source: 'youth-village-2026',
    summary: '청년마을 4 유형 (정주·창업·네트워크·지역거점) 각각 별도 솔루션',
    template: `4 유형 × 4 페이스메이커 시스템:

정주형 → 지역 이주·순환적 정주·지역살이 지원
창업형 → 지역자원 상생 유통·외부자원 연계·지역 일자리 창출
네트워크형 → 지역 관계 안전망·관계인구 형성·공동체 중추조직
지역거점형 → 복합문화공간·지역맞춤 서비스·지역 관광

각 유형별 → 다른 KPI + 다른 솔루션
정주형: 정착률 % · 평균 거주 기간
창업형: 매출 · 사업 영위 수
네트워크형: 협의체 회원 · MOU 수
지역거점형: 방문자 · 거점 활용도`,
    applicableSections: ['3', '4', '6'],
    applicableLenses: ['differentiators', 'detail-completeness'],
    expectedImpact: '유형별 맞춤 = 평가 차별성',
  },

  // ─────────────────────────────────────────
  // 6. Self-Check (5 관점)
  // ─────────────────────────────────────────

  {
    id: 'five-perspectives-self-check',
    name: 'guidebook 5 관점 자체 점검',
    category: 'self-check',
    source: 'guidebook',
    summary: '제안서 초안 후 PM 자체 점검 5 관점 × 3 문항 = 15 체크',
    template: `1. 납득성 (모호 표현 X, RFP 키워드, 수치/사례)
   [ ] 모호 수량 표현 0건
   [ ] RFP 키워드 상위 5개 본문 반영
   [ ] 주장당 근거 1+

2. 디테일 완결성 (모르는 동료도 실행 가능)
   [ ] 회차별 시간표 + 강사/코치 실명
   [ ] 예산 비목 4분류
   [ ] 안전·리스크·보고 체계 1+ 문단

3. RFP 정독 (테이블·각주·배점)
   [ ] 평가표 배점 vs 페이지 수 비례
   [ ] RFP 목차 지정 시 그대로 따름
   [ ] 가점/필수/감점 표현 모두 캐치

4. 경쟁 맥락 (내정·전년·경쟁사)
   [ ] 내정자/전년 정보 확인
   [ ] 차별점 한 문장 표현
   [ ] 전년 아쉬움 과포화

5. 공식 밖 정보 (담당자·현장·내부)
   [ ] 담당자 통화 1+
   [ ] 사업 대상 지역/기관 방문
   [ ] 공식 밖 통찰 재해석 반영`,
    applicableLenses: [
      'detail-completeness',
      'competitive-context',
      'off-record-insight',
      'quantitative-saturation',
    ],
    expectedImpact: '제출 전 마지막 통과 기준',
  },

  // ─────────────────────────────────────────
  // 7. STAR 패턴 (수행실적 sections.7)
  // ─────────────────────────────────────────

  {
    id: 'star-framework',
    name: 'STAR — Situation·Task·Action·Result',
    category: 'narrative-flow',
    source: 'star',
    summary: 'sections.7 (수행 역량 및 실적) 표준 4단 — 평가위원이 실제 능력 판단',
    template: `1. Situation (배경): "X 사업이 Y 발주처 의뢰로 시작"
2. Task (과업): "본 사업의 핵심 과업은 Z 였음 — 정량 목표 포함"
3. Action (실행): "우리는 ABC 방식으로 실행 — 단계별 설명"
4. Result (성과): "결과적으로 N 명 / M 억원 / K% 달성"

청년마을 사례 (PDF 페이지 9):
S — 로컬라이즈 군산 / 발주 한국사회혁신금융 / 3년간 사업
T — 청년 창업가 60억원 규모 · 26개 활동가 · 누적 매출 100억 목표
A — 지역 자원 연계 + 지역내 협력 500건
R — 지역 정착률 75% · 자생 26개 활동가 · 누적 매출 100억 달성`,
    applicableSections: ['7'],
    applicableLenses: ['detail-completeness', 'statistics'],
    expectedImpact: '"이 회사 능력 증명" 표준 패턴',
  },
]

// ─────────────────────────────────────────
// Lookup helpers
// ─────────────────────────────────────────

export function getPatternsByCategory(
  category: ProposalPattern['category'],
): ProposalPattern[] {
  return PROPOSAL_PATTERNS.filter((p) => p.category === category)
}

export function getPatternsBySection(
  sectionKey: '1' | '2' | '3' | '4' | '5' | '6' | '7',
): ProposalPattern[] {
  return PROPOSAL_PATTERNS.filter((p) =>
    p.applicableSections?.includes(sectionKey),
  )
}

export function getPatternsByLens(lens: string): ProposalPattern[] {
  return PROPOSAL_PATTERNS.filter((p) => p.applicableLenses?.includes(lens))
}

export function getPatternById(id: string): ProposalPattern | undefined {
  return PROPOSAL_PATTERNS.find((p) => p.id === id)
}
