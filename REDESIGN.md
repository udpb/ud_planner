# UD-Ops 파이프라인 재설계 v2

## Part 1: 시스템 아키텍처

### 핵심 원칙

```
1. 데이터는 위에서 아래로 흐른다 — 각 스텝은 이전 스텝의 산출물을 입력으로 받는다
2. 내부 자산은 자동으로 올라온다 — PM이 찾으러 다니지 않는다
3. AI는 맥락 안에서 호출된다 — 매번 처음부터가 아니라, 축적된 컨텍스트 위에서
4. 신입 PM도 왜 이렇게 써야 하는지 안다 — 각 스텝에 가이드/레퍼런스/경고가 내장
```

### 데이터 레이어 (3층)

```
┌─────────────────────────────────────────────────┐
│  Layer 1: 내부 자산 (회사 공통, 프로젝트 무관)     │
│  ─────────────────────────────────────────────── │
│  • 브랜드 자산 (ud-brand.ts)                      │
│  • IMPACT 18모듈 (ImpactModule DB)               │
│  • 코치 DB (800명, coach-finder 실시간 연동)       │
│  • 비용 기준 단가 (CostStandard DB)               │
│  • SROI 프록시 (SroiProxy DB)                     │
│  • 당선 제안서 패턴 DB (신규)                      │
│  • 발주처 유형별 전략 프리셋 (신규)                 │
│  • 과거 프로젝트 히스토리 (Project DB)             │
└─────────────────────────────────────────────────┘
        │ 각 스텝에서 자동 로드
        ▼
┌─────────────────────────────────────────────────┐
│  Layer 2: 프로젝트 컨텍스트 (스텝 간 흐르는 데이터) │
│  ─────────────────────────────────────────────── │
│  • PipelineContext 객체 — 모든 스텝의 산출물 통합   │
│  • 스텝 1 결과가 스텝 2로, 2가 3으로... 누적 전달   │
│  • DB의 Project 레코드에 영속화                    │
└─────────────────────────────────────────────────┘
        │ 제안서 생성 시 전체 주입
        ▼
┌─────────────────────────────────────────────────┐
│  Layer 3: 외부 인텔리전스 (AI + PM 수집)           │
│  ─────────────────────────────────────────────── │
│  • 티키타카 리서치 (PM이 외부 LLM에서 수집)         │
│  • AI 생성 컨텐츠 (제안배경, 커리큘럼, 임팩트 등)   │
│  • 수주 전략 인터뷰 (Planning Agent)              │
└─────────────────────────────────────────────────┘
```

### PipelineContext 객체 (핵심)

모든 스텝의 산출물을 하나의 객체에 누적. 각 스텝은 이 객체를 읽고 자기 결과를 추가.

```typescript
interface PipelineContext {
  // Step 1: RFP + 기획 방향
  rfp: {
    parsed: RfpParsed              // 파싱된 사업 정보
    proposalBackground: string     // 제안 배경 초안
    proposalConcept: string        // 제안 컨셉 한 줄
    keyPlanningPoints: string[]    // 핵심 기획 포인트 3개
    evalStrategy: EvalStrategy     // 평가배점 분석 (최고배점 항목, 가중치)
    competitorAnalysis: string     // 경쟁 분석
    similarProjects: SimilarProject[] // 내부 유사 프로젝트
  }
  strategy: StrategicNotes           // 수주 전략 (인터뷰 or 수동)
  research: ExternalResearch[]       // 외부 리서치

  // Step 2: 커리큘럼
  curriculum: {
    tracks: Track[]                 // 트랙 구성
    sessions: CurriculumSession[]   // 확정 세션 리스트
    designRationale: string         // 설계 근거
    impactModuleMapping: Record<string, string> // 세션→IMPACT 모듈 매핑
  }

  // Step 3: 코치
  coaches: {
    assignments: CoachAssignment[]  // 코치 배정
    sessionCoachMap: Record<number, string[]> // 세션번호→코치ID
  }

  // Step 4: 예산 + SROI
  budget: {
    structure: BudgetStructure      // 예산 구조표
    marginRate: number
    sroiForecast: SroiForecast      // SROI 예측
    benchmark: string               // 유사 프로젝트 대비
  }

  // Step 5: 임팩트
  impact: {
    goal: string                    // Impact Goal
    logicModel: LogicModel          // 5계층 체인
    measurementPlan: MeasurementItem[] // 측정 계획
  }

  // 메타
  projectType: 'B2G' | 'B2B'
  channelType: 'bid' | 'renewal' | 'lead'
  predictedScore: number            // 현재 예상 점수 (스텝마다 업데이트)
}
```

---

## Part 2: 개별 기능 설계

### Step 1: RFP 분석 + 기획 방향

#### 1A. RFP 파싱 (기존 유지)
```
입력: PDF/텍스트
출력: RfpParsed (사업명, 예산, 대상, 목표, 평가배점 등)
AI: 1회 호출
```

#### 1B. 기획 방향 자동 생성 (신규)
```
입력: RfpParsed + 발주처 유형 프리셋 + 유사 프로젝트
출력:
  - 제안 배경 초안 (정책→시장→현장 3단 구조)
  - 제안 컨셉 후보 3개 (PM이 선택/편집)
  - 핵심 기획 포인트 (평가배점에서 자동 도출)
AI: 1회 호출

프롬프트에 주입되는 것:
  - 발주처 유형별 톤 프리셋 (B2G: 정책 대응형 / B2B: ROI형 / 재계약: 성과 증명형)
  - 과거 유사 프로젝트의 제안 컨셉 (레퍼런스)
  - 당선 제안서 패턴 (제안배경 섹션 Best Practice)
```

#### 1C. 유사 프로젝트 자동 검색 (신규)
```
입력: RfpParsed.keywords + client + projectType
출력: 과거 프로젝트 리스트 (사업명, 예산, 수주 여부, 핵심 전략)
AI: 없음 (DB 검색)

검색 로직:
  - 키워드 매칭 (objectives, keywords)
  - 발주처 동일 여부
  - 예산 규모 유사 (±50%)
  - 대상자 유사 (targetStage)
```

#### 1D. 평가배점 전략 분석 (신규)
```
입력: RfpParsed.evalCriteria
출력:
  - 최고배점 항목 + 섹션 매핑
  - "커리큘럼에 30점 → Step 2에서 실습 중심 설계 필수"
  - 가중치별 우선순위 정렬
AI: 없음 (규칙 기반)
```

#### 1E. PM 가이드 패널 (신규)
```
UI 위치: Step 1 우측 사이드바
내용:
  - "이 유형의 사업에서 평가위원이 보는 것" (발주처 유형별)
  - "과거 우리가 이긴 유사 사업의 핵심 전략" (유사 프로젝트에서)
  - "흔한 실수" (예: "예산만 보고 커리큘럼을 대충 짜면 30점짜리를 날림")
  - 당선 제안서의 해당 섹션 스니펫 (레퍼런스)
```

---

### Step 2: 커리큘럼 설계

#### 2A. 커리큘럼 AI 생성 (기존 개선)
```
입력: PipelineContext.rfp 전체 + IMPACT 모듈 + 외부 리서치
프롬프트에 추가 주입:
  - Step 1의 제안 컨셉 ("이 콘셉트에 맞는 커리큘럼을 설계하세요")
  - Step 1의 핵심 기획 포인트 ("커리큘럼 30점 최고배점")
  - 발주처 유형별 커리큘럼 패턴 (B2G는 체계적, B2B는 빠른 실행)
  - 과거 유사 프로젝트의 커리큘럼 구조 참조
출력: 트랙 구성 + 회차별 세션 + IMPACT 매핑 + 설계 근거
```

#### 2B. 내부 모듈 자동 추천 (기존 개선)
```
입력: RfpParsed.targetStage + objectives
출력: "이 사업에 추천하는 IMPACT 모듈 Top 5"
로직:
  - 예비창업 → I, M 단계 모듈 가중치 UP
  - 초기창업 → P, A 단계
  - 성장 → C, T 단계
```

#### 2C. PM 가이드 패널
```
내용:
  - "Action Week를 넣어야 하는 이유" (수료율 + 만족도 데이터)
  - "이론 비율 30% 넘으면 위험한 이유" (과거 프로젝트 이탈률 데이터)
  - 당선 제안서의 커리큘럼 표 예시
  - 현재 예상 점수 변화 ("커리큘럼 설계 완료 → +15점")
```

---

### Step 3: 코치 매칭

#### 3A. 세션별 코치 자동 추천 (신규)
```
입력: PipelineContext.curriculum.sessions
출력: 각 세션에 대해 추천 코치 Top 3

매칭 로직:
  - 세션 키워드 vs 코치 expertise 매칭
  - 과거 동일 주제 세션 담당 이력
  - 동일 발주처 사업 경험
  - 가용성 (availableDays, blockedPeriods)
  - 단가 (예산 범위 내)

데이터 소스: coach-finder DB (실시간)
```

#### 3B. 코치 배정 보드 (기존 개선)
```
UI: 커리큘럼 세션 리스트 + 각 세션 옆에 추천 코치 드롭다운
  - 추천 이유 표시 ("AI/DX 전문, 유사 사업 3회 경험")
  - 한 코치가 여러 세션 담당 시 총 사례비 자동 계산
```

#### 3C. PM 가이드 패널
```
내용:
  - "이 사업에서 코치 구성 시 주의할 점"
  - "과거 이 발주처 사업에서 좋은 평가를 받은 코치 프로필 유형"
  - 4중 지원 체계 설명 ("단일 코치가 아닌 레이어 구조를 제안서에 녹이세요")
```

---

### Step 4: 예산 + SROI

#### 4A. 자동 예산 산출 (기존 개선)
```
입력: 커리큘럼 세션 수 + 코치 단가 + CostStandard
자동 계산:
  - 인건비: PM/CM/코치/강사 자동 계산
  - 교육 직접비: 세션 수 × 단가
  - 장소비: 오프라인 세션 수 × 장소 단가
  - 홍보비: 프리셋
  - 일반관리비/이윤: 비율 자동
경고:
  - 직접비 비율 < 70% → "B2G 기준 미달"
  - 마진 < 10% → "수익성 경고"
  - 총액 > RFP 예산 → "예산 초과"
```

#### 4B. 유사 프로젝트 벤치마크 (신규)
```
입력: PipelineContext.rfp.similarProjects
출력: "비슷한 사업 평균 대비 이 사업은 인건비 +12%, 교육비 -5%"
```

#### 4C. SROI 예측 (기존 통합)
```
입력: 커리큘럼 산출물 + 대상자 수 + SroiProxy DB
출력:
  - 예상 SROI 배수 (예: 3.2배)
  - 항목별 사회적 가치 (교육훈련 임팩트, 고용 창출 등)
  - 제안서에 넣을 수 있는 SROI 요약 문장
```

#### 4D. PM 가이드 패널
```
내용:
  - "B2G 사업 예산 구조의 암묵적 규칙"
  - "마진 10-15%가 적정인 이유"
  - "SROI를 제안서에 쓸 때 주의점"
```

---

### Step 5: 임팩트 체인

#### 5A. Logic Model 자동 생성 (기존 개선)
```
핵심 변경: 커리큘럼에서 Activity/Output을 자동 추출

입력:
  - PipelineContext.curriculum (확정 세션 → Activity로 변환)
  - PipelineContext.budget.sroiForecast (SROI 프록시 → Outcome 힌트)
  - 외부 리서치
  - PM이 확정한 Impact Goal

AI 프롬프트:
  "아래 커리큘럼의 세션들이 Activity입니다.
   이 Activity에서 나오는 Output을 정리하고,
   Output이 만드는 Outcome과 최종 Impact를 설계하세요.
   Outcome에는 SROI 프록시를 매핑하세요."

출력:
  - Activity: 커리큘럼에서 추출 (자동)
  - Output: 각 세션의 산출물 (자동 + AI 보강)
  - Outcome: AI 생성 (PM 검토)
  - Impact: AI 생성 (PM 검토)
  - Input: 코치 + 예산 + 인프라 (Step 3,4에서 자동)
```

#### 5B. 측정 계획 자동 생성 (신규)
```
입력: 5계층 체인 + 언더독스 진단 도구 목록
출력:
  각 Outcome에 대해:
  - 측정 도구 (ACT-PRENEURSHIP, DOGS, 5D 중 매칭)
  - 측정 시점 (사전/사후/추적)
  - 목표치 제안
```

#### 5C. PM 가이드 패널
```
내용:
  - "평가위원이 Logic Model에서 보는 것"
  - "Activity와 Outcome의 인과관계가 납득되어야 점수를 줌"
  - 당선 제안서의 Logic Model 예시
  - "SROI 수치를 넣으면 차별화 포인트가 됨"
```

---

### Step 6: 제안서 생성

#### 6A. 섹션별 생성 (기존 대폭 개선)
```
핵심 변경: PipelineContext 전체를 주입

각 섹션 프롬프트에 들어가는 것:
  - 브랜드 자산 (ud-brand.ts)
  - 발주처 유형별 톤 프리셋
  - PipelineContext (Step 1~5 전체)
  - 당선 제안서의 해당 섹션 패턴
  - 외부 리서치
  - 전략 맥락
  - 평가배점 가중치 (해당 섹션의 배점)
```

#### 6B. 실시간 평가 시뮬레이션 (기존 개선)
```
변경: 최종 1회 → 섹션 생성될 때마다 점수 업데이트
출력:
  - 항목별 예상 점수
  - "이 섹션은 평가 기준 대비 X가 부족합니다"
  - 전체 예상 총점
```

#### 6C. PM 피드백 → 부분 재생성 (기존 유지)
```
입력: "이 부분을 이렇게 바꿔줘" + keepParts
출력: 수정된 섹션 (버전 관리)
```

#### 6D. PM 가이드 패널
```
내용:
  - 당선 제안서의 해당 섹션 스니펫 (비교 가능)
  - "평가위원이 이 섹션에서 체크하는 것"
  - 현재 섹션의 강점/약점 분석
```

---

### 공통 기능: PM 가이드 시스템

#### 가이드 데이터 구조 (신규)
```typescript
interface StepGuide {
  stepKey: string
  
  // 평가위원 관점
  evaluatorPerspective: string    // "평가위원이 이 스텝에서 보는 것"
  
  // 당선 레퍼런스
  winningPatterns: Array<{
    projectName: string           // "2026 청년마을 만들기"
    snippet: string               // 해당 섹션의 핵심 표현
    whyItWorks: string            // "정량 포화 + 정책 연결"
  }>
  
  // 흔한 실수
  commonMistakes: Array<{
    mistake: string               // "이론 세션만 나열"
    consequence: string           // "실습 비율 부족으로 커리큘럼 점수 하락"
    fix: string                   // "Action Week + 1:1 코칭 페어 추가"
  }>
  
  // 언더독스 강점 활용 팁
  udStrengthTips: string[]        // "800명 코치 풀을 반드시 언급", "4중 지원 체계 도식화"
  
  // 점수 영향
  scoreImpact: string             // "이 스텝 완료 시 예상 +15점"
}
```

#### 발주처 유형별 톤 프리셋 (신규)
```typescript
interface ChannelPreset {
  type: 'B2G' | 'B2B' | 'renewal'
  
  tone: string                    // "B2G: 정책 대응 + 안정적 운영 강조"
  keyMessages: string[]           // ["정부업무평가 대응 가능", "수료율 95%+ 보장"]
  avoidMessages: string[]         // ["너무 혁신적인 표현은 위험 부담으로 읽힘"]
  proposalStructure: string       // "정책배경 → 실적증명 → 체계적 계획"
  budgetTone: string              // "직접비 비율 높게, 마진 보수적으로"
  evaluatorProfile: string        // "공무원 + 외부 전문가, 안정성 중시"
  
  // 커리큘럼 설계 가이드
  curriculumBias: {
    theoryMax: number             // B2G: 30%, B2B: 20%
    actionWeekMin: number         // B2G: 2회, B2B: 3회
    preferredMethods: string[]    // B2G: ["WORKSHOP", "MIXED"], B2B: ["PRACTICE", "ACTION_WEEK"]
  }
}
```

---

### 공통 기능: 예상 점수 시스템 (신규)

각 스텝 완료 시 예상 점수가 올라감. 파이프라인 상단에 표시.

```
[RFP 분석: 12/20] → [커리큘럼: 0/30] → [코치: 0/10] → [예산: 0/15] → [임팩트: 0/15] → [제안서: 0/10]
                     현재 총점: 12/100
```

점수 계산:
  - Step 1: 평가배점 항목이 모두 식별되면 +점
  - Step 2: 커리큘럼이 평가배점 최고 항목을 커버하면 +점
  - Step 3: 코치가 배정되면 +점
  - ...
  - 실제 제안서가 생성되면 AI 시뮬레이션 점수로 교체

---

## Part 3: 기술 아키텍처 변경

### DB 스키마 변경

```
Project 테이블에 추가:
  - proposalBackground  String?   @db.Text  // 제안 배경 초안
  - proposalConcept     String?   @db.Text  // 제안 컨셉
  - keyPlanningPoints   Json?               // 핵심 기획 포인트
  - evalStrategy        Json?               // 평가배점 전략
  - designRationale     String?   @db.Text  // 커리큘럼 설계 근거
  - sroiForecast        Json?               // (기존 필드 활용)
  - measurementPlan     Json?               // 측정 계획
  - predictedScore      Float?              // 현재 예상 점수

신규 테이블:
  - WinningPattern      // 당선 제안서 패턴 DB
  - ChannelPreset       // 발주처 유형별 프리셋
  - StepGuide           // 스텝별 PM 가이드
```

### API 변경

```
변경:
  POST /api/ai/parse-rfp     → 파싱 + 기획 방향 생성 통합
  POST /api/ai/logic-model   → Step 5로 이동, 커리큘럼 자동 주입
  POST /api/ai/curriculum    → Step 1의 기획 방향을 입력으로 받도록

신규:
  GET  /api/projects/[id]/pipeline-context  → PipelineContext 전체 반환
  POST /api/ai/planning-direction           → 기획 방향 생성 (제안배경+컨셉+핵심포인트)
  GET  /api/projects/[id]/similar           → 유사 프로젝트 검색
  POST /api/ai/predict-score               → 현재 상태 기반 예상 점수
  GET  /api/guides/[stepKey]               → 스텝별 PM 가이드
  POST /api/coaches/recommend              → 세션별 코치 자동 추천
```

### 프론트엔드 변경

```
page.tsx:
  - 스텝 순서 변경 (rfp → curriculum → coaches → budget → impact → proposal)
  - PipelineContext를 서버에서 한 번에 로드 → 각 스텝 컴포넌트에 전달
  - 상단에 예상 점수 바 표시

각 step-*.tsx:
  - props로 PipelineContext 수신 (이전 스텝 데이터 참조 가능)
  - 우측에 PM 가이드 패널 통합
  - 하단에 "이 스텝 완료 시 예상 점수 +X" 표시

사이드바:
  - 대시보드, 프로젝트, 설정만 유지
  - 나머지는 프로젝트 내부로 통합
```

---

## Part 4: 개발 프로세스 (Phase별)

### Phase A: 골격 재구성 (파이프라인 흐름) — 2일

```
A1. 스텝 순서 변경 (page.tsx)
    - rfp → curriculum → coaches → budget → impact → proposal
    - 기존 컴포넌트 재배치 (코드 변경 최소화)
    
A2. PipelineContext 설계 + API
    - GET /api/projects/[id]/pipeline-context
    - page.tsx에서 로드 → 각 스텝에 전달
    
A3. 사이드바 정리
    - 코치/모듈/SROI/예산기준 제거
    - 대시보드, 프로젝트, 설정만 유지
```

### Phase B: Step 1 고도화 (기획의 시작점) — 2일

```
B1. 기획 방향 AI 생성
    - POST /api/ai/planning-direction
    - 파싱 완료 후 자동 호출 → 제안배경 + 컨셉 후보 + 핵심기획포인트
    
B2. 유사 프로젝트 검색
    - GET /api/projects/[id]/similar
    - 키워드/발주처/예산 매칭
    
B3. 평가배점 전략 분석
    - evalCriteria → 최고배점 항목 + 섹션 매핑 + 가이드 메시지
    - 규칙 기반 (AI 호출 없음)
    
B4. Step 1 UI 재설계
    - 3컬럼: 파싱 결과 | 기획 방향 (제안배경/컨셉/핵심포인트) | PM 가이드
```

### Phase C: 스텝 간 데이터 흐름 — 1일

```
C1. 각 스텝의 AI 프롬프트에 PipelineContext 주입
    - 커리큘럼 생성 시: Step 1의 제안컨셉 + 핵심기획포인트 + 평가배점 주입
    - 임팩트 생성 시: Step 2의 커리큘럼 Activity 자동 추출
    - 제안서 생성 시: Step 1~5 전체
    
C2. 각 스텝 UI에서 이전 스텝 요약 표시
    - "Step 1에서 확정한 제안 컨셉: '...'"
    - "평가 최고배점: 커리큘럼 30점"
```

### Phase D: PM 가이드 시스템 — 2일

```
D1. 당선 제안서 패턴 DB 구축
    - 청년마을/전통문화 제안서에서 섹션별 패턴 추출
    - WinningPattern 테이블에 저장
    
D2. 발주처 유형별 프리셋
    - B2G / B2B / renewal 3개 프리셋
    - ChannelPreset 테이블
    
D3. 스텝별 가이드 패널 UI
    - 우측 패널: 평가위원 관점 + 당선 레퍼런스 + 흔한 실수 + UD 강점 팁
    
D4. 예상 점수 시스템
    - 파이프라인 상단 점수 바
    - 스텝 완료마다 업데이트
```

### Phase E: 내부 데이터 자동 로드 — 1일

```
E1. Step 2: IMPACT 모듈 자동 추천 (targetStage 기반)
E2. Step 3: 세션별 코치 자동 추천 (POST /api/coaches/recommend)
E3. Step 4: SROI 프로젝트 내 통합 + 유사 프로젝트 예산 벤치마크
E4. Step 5: 커리큘럼 → Activity/Output 자동 추출
```

### Phase F: 안정화 + 배포 — 1일

```
F1. 전체 E2E 테스트 (양양 RFP로)
F2. 빌드 확인 + 에러 수정
F3. Vercel 배포 + GitHub push
```

---

## 요약: 전체 타임라인

```
Phase A: 골격 재구성          ██████
Phase B: Step 1 고도화        ██████
Phase C: 데이터 흐름          ███
Phase D: PM 가이드 시스템      ██████
Phase E: 내부 데이터 자동 로드  ███
Phase F: 안정화 + 배포         ███
```

핵심 순서: **A → B → C → D → E → F**
A~C가 끝나면 이미 체감이 완전히 달라짐 (흐름이 자연스러워지고, 데이터가 연결됨).
D~E는 신입 PM의 가이드와 자동화로, 품질의 하한선을 끌어올림.
