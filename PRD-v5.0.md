# UD-Ops Workspace + Coach Finder 통합 시스템
## PRD & 기능명세서 v5.1
### "최소 인풋, 최고 품질, 스스로 진화하는 언더독스 기획 엔진"

**작성일:** 2026-03-29  **최종 업데이트:** 2026-04-06
**기준 코드베이스:** ud-ops-workspace (Next.js/PostgreSQL) + underdogs-coach-finder (React/Vite/Firebase/JSON)
**아키텍처 철학:** 3-Layer Optimization Engine (지식 DB → 설계 엔진 → 학습 루프)
**개발 원칙:** UI/UX 플로우 우선 → 기능 채우기 순서 (기능보다 플로우가 명확해야 기능이 의미있음)
**핵심 전환 (v5.1):** "데이터 입력 도구" → "공동 기획자(Co-planner)" — AI가 질문하고, PM이 판단하고, 함께 좋은 기획을 만든다

---

## 0. 문서 목적 & 범위

이 문서는 두 개의 기존 시스템을 **단일 플랫폼으로 통합**하고, Optimization Engine 아키텍처를 결합하여 실질적인 자동화 이점을 극대화하기 위한 구체적 기능 명세서입니다.

### 현재 시스템 상태 분석

| 항목 | UD-Ops Workspace | Coach Finder |
|------|-----------------|--------------|
| 프레임워크 | Next.js (App Router) | React + Vite |
| DB | PostgreSQL (Prisma) | JSON 파일 + Firebase |
| AI | Claude (Anthropic) | Gemini (Google) + FAISS |
| 인증 | NextAuth (미구현) | Firebase (@udimpact.ai) |
| 코치 수 | Schema만 있음 (sync 스크립트 존재) | 250+ 코치 (coaches_db.json 28k줄) |
| 벡터 검색 | 없음 | FAISS (Python FastAPI 사이드카) |
| 문서 출력 | 없음 | DOCX, PPTX 생성 가능 |
| 배포 | Vercel | Vercel + Cloud Run |

### 통합 후 시스템 계층

```
┌─────────────────────────────────────────────────────────────────────┐
│           UD-Ops Workspace (메인 허브 — Next.js)                    │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────┐ ┌────────────────┐  │
│  │  기획 엔진   │ │  예산 엔진   │ │ SROI엔진 │ │  운영 트래커   │  │
│  │ RFP→제안서  │ │ PC/AC/마진  │ │ 예측/실적│ │ D-day/칸반    │  │
│  └─────────────┘ └──────────────┘ └──────────┘ └────────────────┘  │
│                          ↕ (공유 PostgreSQL DB)                     │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │         Coach Finder Module (통합 서브시스템)                   │ │
│  │  코치 디스커버리 · 프로필 · AI 매칭 · 평가 관리               │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────────────────┐
│           Optimization Engine (Layer 1~3)                           │
│  Layer 1: 지식 DB (Admin CRUD — 모듈·규칙·단가·가중치)              │
│  Layer 2: 설계 엔진 (AI 조립 — Claude + Gemini FAISS)              │
│  Layer 3: 학습 루프 (실적 → 가중치 자동 보정)                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. 통합 전략 (Integration Strategy)

### 1.1 DB 통합: JSON → PostgreSQL 마이그레이션

**현황:**
- coach-finder: `coaches_db.json` (250+ 코치, 28k줄) → in-memory 필터링
- ud-ops: `Coach` Prisma 모델 존재, `githubId` 필드로 외부 sync 지원
- `/api/coaches/sync` 라우트가 이미 GitHub 레포에서 JSON을 당겨 PostgreSQL에 upsert 함

**통합 방안:**

```
[Coach Finder coaches_db.json]
        ↓ (1회성 마이그레이션 스크립트)
[PostgreSQL - Coach 테이블] ← 이후 모든 CRUD의 단일 진실 원천
        ↓
[Coach Finder UI] ← API 호출로 데이터 읽기
[UD-Ops UI] ← 동일 API 호출
```

**필드 매핑 (coach-finder → Prisma Coach 모델):**

| coach-finder 필드 | Prisma Coach 필드 | 처리 |
|---|---|---|
| id (number) | githubId (Int) | 직접 매핑 |
| name | name | 직접 매핑 |
| tier (1/2/3) | tier (TIER1/TIER2/TIER3) | 변환 필요 |
| category ("파트너코치"/"코치"/...) | category (enum) | 변환 필요 |
| expertise (string[]) | expertise (string[]) | 직접 매핑 |
| regions (string[]) | regions (string[]) | 직접 매핑 |
| career_history | careerHistory | snake_case → camelCase |
| photo_url | photoUrl | 직접 매핑 |
| overseas | overseas | 직접 매핑 |
| language (string) | language (string[]) | 배열 변환 |

**마이그레이션 스크립트 위치:** `scripts/migrate-coaches-json.ts`

### 1.2 인증 통합

**현황:**
- coach-finder: Firebase Auth (`@udimpact.ai` 도메인 체크)
- ud-ops: NextAuth (Google OAuth, 미구현 상태)

**통합 방안:**
- NextAuth Google OAuth를 `@udimpact.ai` 도메인으로 제한 → 단일 인증 시스템
- coach-finder Firebase Auth 제거 또는 NextAuth Session 토큰을 Firebase Custom Token으로 교환하는 브릿지 레이어 구현 (단기)
- 장기: coach-finder React 앱을 Next.js 페이지로 마이그레이션

### 1.3 벡터 검색 통합

**현황:**
- coach-finder: Python FastAPI + FAISS (로컬 벡터 인덱스)
- ud-ops: 벡터 검색 없음

**통합 방안 (단기):**
- Python FastAPI 사이드카(`python-service/`)를 UD-Ops와 공유 배포
- `/api/coaches/recommend` → 내부적으로 Python FastAPI `/api/v1/recommend` 호출
- coaches_db.json 대신 PostgreSQL에서 코치 데이터 읽도록 FastAPI 수정

**통합 방안 (장기):**
- PostgreSQL `pgvector` 익스텐션 활성화
- Coach 임베딩을 DB에 저장 → Python FastAPI 의존 제거

### 1.4 Coach Finder UI 통합

**단기 방안 (현재 스프린트):**
- UD-Ops의 프로젝트 코치 배정 화면에서 "코치 찾기" 버튼 클릭 시
- → coach-finder 앱으로 Deep Link (`?projectId=xxx&context=assign`)
- → coach-finder에서 선택한 코치 ID 목록을 UD-Ops로 postMessage 전달
- → UD-Ops가 자동으로 `CoachAssignment` 레코드 생성

**장기 방안:**
- coach-finder의 핵심 UI 컴포넌트 (`FilterPanel`, `CoachCard`, `CoachDetailModal`)를 `/src/components/coaches/` 아래로 이식
- 단일 Next.js 앱으로 통합

---

## 2. 시스템 아키텍처 (Optimization Engine 3-Layer)

### Layer 1: 지식 DB (Admin 통제)

Admin이 코드 없이 CRUD하는 4가지 마스터 데이터. 이 데이터가 바뀌면 AI 결과가 자동으로 바뀜.

| DB | 역할 | 현재 상태 |
|---|---|---|
| IMPACT 모듈 라이브러리 | 18모듈 뼈대 + 300+ 콘텐츠 매핑 | 미구현 (Module 테이블은 있으나 2계층 구조 아님. Content 모델 Phase 4 예정) |
| 설계 규칙 & 가중치 | 커리큘럼 흐름 룰, 대상별 가중치 | 미구현 (Rule 로직은 프롬프트에만 존재) |
| 비용 기준 단가 | WBS 단가표 | CostStandard 모델 있음 — **시드 데이터 입력 필요** |
| 과거 제안서 & 실적 | 학습 루프 원천 | 미구현 (Project 모델로 대체 가능) |

### Layer 2: 설계 엔진 (AI 조립)

Layer 1 데이터를 가져다 조합하는 파이프라인:

```
RFP 업로드
  → [Step 1] RFP 파싱 (Claude) → 구조화된 JSON
  → [Step 2] 유사 과거 사업 매칭 (FAISS or pgvector) → Top-3 레퍼런스
  → [Step 3] 임팩트 역추적 (Claude) → Logic Model
  → [Step 4] IMPACT 모듈 선택 + 콘텐츠 매칭 (Rule Engine) → 모듈 순서
  → [Step 5] 커리큘럼 조립 (Rule 검증) → 세션 리스트
  → [Step 6] 예산 자동 산출 (Budget Engine) → PC/AC/마진
  → [Step 7] SROI 예측 → 화폐가치
  → [Step 8] 3가지 설계안 생성 (A/B/C안)
  → [Step 9] 제안서 7섹션 생성 (Claude)
```

### Layer 3: 학습 루프 (Feedback Loop)

```
제안서 제출 → 수주 결과 입력 → 패턴 분석
프로젝트 종료 → 실적 입력 → 전환율 보정
코치 평가 완료 → 만족도 업데이트 → 매칭 알고리즘 보정
     ↓
Admin 승인 Review Panel → Layer 1 가중치 자동 반영
```

---

## 3. 기능 명세 (Feature Specifications)

---

### F0. 기획 파이프라인 UI ✅ **구현 완료 (2026-04-01)**

**핵심 원칙:** 기능을 먼저 채우는 게 아니라 실제 업무 플로우를 UI에 먼저 구현.

#### F0.1 6단계 파이프라인 네비게이터

프로젝트 상세 페이지(`/projects/[id]`)는 탭 기반 → **URL 기반 스텝 라우팅**으로 재설계됨.

```
?step=rfp → ?step=impact → ?step=curriculum → ?step=coaches → ?step=budget → ?step=proposal
```

**스텝별 완료 판정 기준:**

| 스텝 | 완료 조건 | 표시 |
|------|-----------|------|
| RFP 분석 | `project.rfpParsed` 존재 | 초록 체크 |
| 임팩트 설계 | `project.logicModel` 존재 | 초록 체크 |
| 커리큘럼 | `curriculum.length > 0` | 초록 체크 |
| 코치 배정 | `coachAssignments.length > 0` | 초록 체크 |
| 예산 | `budget` 존재 | 초록 체크 |
| 제안서 | `proposalSections.length >= 7` | 초록 체크 |

**구현 파일:**
- `src/app/(dashboard)/projects/[id]/pipeline-nav.tsx` — PipelineNav 컴포넌트
- `src/app/(dashboard)/projects/[id]/step-rfp.tsx` — RFP 분석 풀너비 뷰 (2컬럼: 업로드 | 결과)
- `src/app/(dashboard)/projects/[id]/step-impact.tsx` — Logic Model 생성 + 5컬럼 체인 그리드
- `src/app/(dashboard)/projects/[id]/step-proposal.tsx` — 7섹션 제안서 카드 그리드
- `src/app/(dashboard)/projects/[id]/page.tsx` — 파이프라인 레이아웃 (searchParams.step 라우팅)

#### F0.2 프로젝트 목록 진행률 도트

`/projects` 목록 테이블에 "기획 진행률" 컬럼 추가:
- 6개 도트 (●●●○○○ 형태), 각 도트 = 파이프라인 스텝 완료 여부
- hover 시 스텝 이름 tooltip

#### F0.3 UI 레이아웃 구조

```
[Header: 프로젝트명]
[Sticky Top Bar]
  ├── 프로젝트 메타 스트립: 상태배지 | 유형 | 클라이언트 | 총예산 | 코치비 | 마진율 | 수정버튼
  └── PipelineNav: ①RFP — ②임팩트 — ③커리큘럼 — ④코치 — ⑤예산 — ⑥제안서
[Step Content: 풀너비]
  각 스텝이 URL param 기반으로 렌더링됨
```

> **삭제된 파일 (dead code):** `ai-panel.tsx`, `project-ai-wrapper.tsx` — 파이프라인 스텝들에 기능이 분산됨

---

### F1. 인증 및 권한 관리 (RBAC)

**우선순위:** 프로덕션 필수 (Phase 1 첫 번째 작업)

#### F1.1 NextAuth 미들웨어 구현

**파일:** `src/middleware.ts`

```
보호 라우트: /dashboard/*, /projects/*, /coaches/*, /modules/*, /sroi/*, /settings/*
공개 라우트: /feedback/[projectId], /api/feedback (외부 참여자용)
Admin 전용: /admin/*, /api/admin/*
```

**구현 내용:**
- `src/middleware.ts` 생성: NextAuth `auth()` 함수로 세션 체크
- 미인증 사용자 → `/login` 리다이렉트
- 역할 체크: 라우트별 허용 역할 매트릭스 적용

#### F1.2 역할별 접근 권한 매트릭스

| 기능 | Admin | PM | CM | FM | Coach |
|------|-------|----|----|----|-------|
| 프로젝트 생성/삭제 | ✅ | ✅ | ❌ | ❌ | ❌ |
| RFP 파싱 / AI 기획 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 코치 DB CRUD | ✅ | 읽기 | ✅ | 읽기 | 본인만 |
| 예산 열람 | ✅ | ✅ | ❌ | ✅ | ❌ |
| 예산 확정/수정 | ✅ | ✅ | ❌ | ✅ | ❌ |
| 실지출 입력 | ✅ | ✅ | ❌ | ✅ | ❌ |
| Layer 1 Admin UI | ✅ | ❌ | ❌ | ❌ | ❌ |
| 학습 루프 승인 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 코치 가용성 입력 | ✅ | ✅ | ✅ | ❌ | 본인만 |
| 참여자 관리 | ✅ | ✅ | ✅ | ❌ | 읽기 |
| 피드백 열람 | ✅ | ✅ | ✅ | ❌ | 본인 세션만 |

#### F1.3 Coach 역할 포털

코치가 로그인하면 접근 가능한 제한된 뷰:
- 본인의 배정 프로젝트 목록
- 배정된 세션 날짜/장소/담당 참여자
- 가용 일정 업데이트 폼
- 본인이 담당한 세션의 만족도 피드백 결과 열람

---

### F2. RFP 지능형 파싱 (고도화)

**우선순위:** 기존 구현 보완

#### F2.1 배열 파싱 버그 수정

**현재 문제:** `safeParseJson()`이 `{`~`}` 슬라이싱만 함 → AI가 배열(`[...]`) 루트로 반환 시 파싱 실패

**수정 내용** (`src/lib/claude.ts`):
```
현재: start = s.indexOf('{'), end = s.lastIndexOf('}')
수정: { } 또는 [ ] 중 먼저 나오는 것을 기준으로 자동 감지
     배열 반환 시 첫 번째 요소를 객체로 사용하거나 래핑
```

#### F2.2 클라이언트 Fallback UI

**파싱 실패 시 UX 흐름:**
1. `try/catch`에서 에러 캐치
2. API가 `{ error: 'PARSE_FAILED', raw: '...', partialData: {...} }` 반환
3. 클라이언트: 에러 모달 노출
   - "AI 응답 파싱에 실패했습니다. 아래 항목을 수동으로 입력해주세요."
   - `partialData`에서 파싱된 필드는 미리 채워진 Edit Form 노출
   - "다시 시도" 버튼 (동일 텍스트로 재요청)

#### F2.3 PM 확인 플로우

RFP 파싱 결과 → **즉시 DB 저장 금지** → Edit Form으로 렌더링 → PM 검토/수정 → "저장" 클릭 시 DB 저장.

파싱 결과 UI 항목:
- 사업명, 발주기관, 예산(VAT/공급가), 사업 기간, 교육 기간
- 대상자 설명, 참여 인원, 창업 단계
- 목표 (편집 가능 리스트), 산출물, 제약사항
- 평가 배점표 (항목별 점수 편집 가능)
- "AI 분석 요약" 패널 (수정 불가 참고용)

---

### F3. 임팩트 역추적 Logic Model

**우선순위:** 기존 구현 UI 고도화

#### F3.1 Logic Model Visualizer

현재: JSON 데이터를 텍스트 리스트로만 표시
개선: 계층형 트리 그래프 노드 형태로 시각화

```
[임팩트 목표] (1개 — 편집 가능)
     ↓
[Impact] (2~3개 — 각 노드 클릭하여 텍스트 편집)
     ↓
[Outcome] (3~4개)
     ↓
[Output] (3~4개)
     ↓
[Activity] (4~6개 — Action Week 노드는 주황색 강조)
     ↓
[Input] (3~4개)
```

#### F3.2 유사 과거 사업 참조 패널

Logic Model 생성 시 `PastProposal` DB에서 대상유형 + 예산 + 기간이 유사한 Top-3 사업을 사이드 패널로 표시:
- "비슷한 사업에서 이런 Logic Model을 썼어요"
- PM이 클릭하여 해당 Logic Model 컴포넌트를 현재 편집 항목에 복사 가능

---

### F4. 커리큘럼 조립 엔진 (Rule Engine 하드코딩)

**우선순위:** 비즈니스 로직 핵심 (Phase 1 우선)

#### F4.1 서버단 Rule 검증 엔진

**파일:** `src/lib/curriculum-rules.ts` (신규)

```typescript
interface RuleValidationResult {
  passed: boolean
  violations: Array<{
    ruleId: string
    ruleName: string
    action: 'BLOCK' | 'WARN' | 'SUGGEST'
    message: string
    affectedSessions?: number[]
  }>
}

// 검증 룰 목록
const RULES: DesignRule[] = [
  {
    id: 'R-001',
    name: '이론 비율 30% 초과 금지',
    check: (sessions) => {
      const theoryCount = sessions.filter(s => s.isTheory).length
      return (theoryCount / sessions.length) <= 0.3
    },
    action: 'BLOCK',
    message: `이론 세션 비율이 ${ratio}%입니다. 30% 이하로 조정해주세요.`
  },
  {
    id: 'R-002',
    name: 'Action Week 필수',
    check: (sessions) => sessions.some(s => s.isActionWeek),
    action: 'BLOCK',
    message: 'Action Week(실전 실행 주간)가 포함되어야 합니다.'
  },
  {
    id: 'R-003',
    name: '이론 3연속 금지',
    check: (sessions) => {
      // 연속된 isTheory === true 세션이 3개 미만인지 검사
    },
    action: 'WARN',
    message: `${n}회차~${n+2}회차에 이론 강의가 연속됩니다. Action Week 삽입을 권장합니다.`
  },
  {
    id: 'R-004',
    name: '코칭 세션 전에 워크숍 필수',
    check: (sessions) => {
      // MENTORING 세션 직전에 WORKSHOP/PRACTICE가 있는지
    },
    action: 'SUGGEST',
    message: `${n}회차 코칭 세션 직전에 실습/워크숍 세션 배치를 권장합니다.`
  }
]
```

**API 연동:** `POST /api/ai/curriculum` 응답 생성 후, `validateCurriculumRules(sessions)` 호출:
- `BLOCK` 위반 시: HTTP 422 반환, PM UI에 "수정 필요" 모달 노출
- `WARN` 위반 시: 정상 저장 + Warning Badge 노출
- `SUGGEST` 위반 시: 사이드 패널에 제안 노출

#### F4.2 IMPACT 2계층 모듈 구조

> **⚠️ 구현 상태:** `Content` 모델은 현재 Prisma 스키마에 없음.
> - `importContents()` 함수는 `/api/admin/import/route.ts`에서 **임시 제거됨** (2026-04-01)
> - `Content` 모델은 Phase 4에서 `ImpactModule` + `ContentMapping`과 함께 스키마에 추가 예정
> - 현재 `Module` 테이블(하이레벨 카테고리)이 임시 대체 역할

**Prisma 스키마 추가 (기존 Module 테이블 확장):**

```prisma
// IMPACT 18모듈 (상위 뼈대)
model ImpactModule {
  id              String   @id @default(cuid())
  stage           String   // "I" | "M" | "P" | "A" | "C" | "T"
  stageOrder      Int      // 1~6 (I=1, M=2, ...)
  moduleOrder     Int      // 각 스테이지 내 순서 (1~3)
  moduleCode      String   @unique // "I-1", "M-2", "P-3", ...
  moduleName      String   // "창업 의지와 목적"
  coreQuestion    String   // "왜 창업하는가?"
  workshopOutputs String[] // ["창업 동기 카드", "필연성 한 문장"]
  durationMinutes Int      @default(50)
  sixRolesTarget  String[] // [CEO, CPO, CTO, CMO, CFO, COO]
  isActive        Boolean  @default(true)

  contentMappings ContentMapping[]
}

// 콘텐츠 라이브러리 (하위, 300+ 기존 데이터)
model Content {
  id              String   @id @default(cuid())
  legacyCode      Int      @unique // 기존 coaches_db code 번호 (code 9, 11, ...)
  name            String   // "고객 인지"
  format          String   // 현장강의 | VOD | 워크숍 | 온라인강의 | 사례
  category        String   // UOR 0~4단계 / 선배창업가 / ...
  targetAudience  String[] // [청년, 대학생, 시니어, 청소년]
  businessField   String[] // [ESG, 로컬창업, SME, 투자]
  startupStage    String[] // [예비, 초기, Seed, Pre-A 이상]
  deliveryMethod  String?  // 현장 강의+워크샵 | VOD | ZOOM
  sixRolesTarget  String[] // [CEO, CPO, ...]
  learningType    String?  // 인지형 | 적용형 | 실행형
  impactExpect    String?  // 역량강화 | 산출물생성 | 행동변화
  prerequisites   Int[]    // 선수 콘텐츠 legacyCode 목록
  pptUrl          String?
  vodUrl          String?
  description     String?  @db.Text
  isActive        Boolean  @default(true)

  contentMappings ContentMapping[]
}

// 콘텐츠 ↔ IMPACT 모듈 매핑 (Admin 관리)
model ContentMapping {
  id              String       @id @default(cuid())
  impactModuleId  String
  impactModule    ImpactModule @relation(fields: [impactModuleId], references: [id])
  contentId       String
  content         Content      @relation(fields: [contentId], references: [id])
  fitScore        Int          @default(3) // 1~5 (Admin이 적합도 설정)
  notes           String?

  @@unique([impactModuleId, contentId])
}
```

**기존 Module 테이블과의 관계:**
- 기존 `Module`은 하이레벨 카테고리 (TECH_EDU, STARTUP_EDU, ...)로 유지
- `ImpactModule`은 IMPACT 방법론의 18모듈 뼈대 (I-1 ~ T-3)
- `Content`는 실제 교육 콘텐츠 (기존 300+ 데이터)
- `CurriculumItem`이 `contentId`를 참조하여 어떤 콘텐츠를 쓸지 지정

#### F4.3 Drag & Drop 커리큘럼 편집

- 세션 카드를 드래그하여 순서 변경 → DB 자동 `order` 업데이트
- 각 카드에 Lock 아이콘 (🔒): 클릭하면 `isLocked: true` → 전체 Re-roll 시에도 해당 세션 불변
- "이 세션만 다시 생성" 버튼: 해당 sessionNo만 Claude에 재요청
- 세션별 Warning Badge: Rule 위반 시 주황/빨강 뱃지 표시

---

### F5. Coach Finder 통합 모듈

**우선순위:** 통합 핵심 (Phase 2)

#### F5.1 코치 데이터 단일 진실 원천화

**마이그레이션 스크립트** `scripts/migrate-coaches-json.ts`:
- `underdogs-coach-finder/python-service/coaches_db.json` 읽기
- 필드 매핑 변환 (snake_case → camelCase, tier 숫자 → enum)
- `category` 변환: "파트너코치" → PARTNER_COACH, "코치" → COACH, "글로벌코치" → GLOBAL_COACH, "컨설턴트" → CONSULTANT, "투자사" → INVESTOR
- `prisma.coach.upsert({ where: { githubId: coach.id } })` 로 안전하게 업서트

**이후 운영:**
- Coach Finder의 모든 코치 CRUD → UD-Ops PostgreSQL API (`/api/coaches`) 호출
- coaches_db.json 파일은 백업/참조용으로만 유지

#### F5.2 벡터 검색 통합

**Python FastAPI 수정** (`python-service/app/core/database.py`):
- JSON 파일 대신 PostgreSQL에서 코치 데이터 로드
- `DATABASE_URL` 환경변수 공유
- `/api/v1/ingest` 호출 시 PostgreSQL `Coach` 테이블 전체 읽어 FAISS 인덱스 재빌드

**UD-Ops API 추가** `POST /api/coaches/ai-recommend`:
- Request: `{ rfpText: string, projectId: string, topK?: number }`
- 내부적으로 FastAPI `/api/v1/recommend` 호출
- 결과를 UD-Ops Coach 형식으로 변환하여 반환

#### F5.3 프로젝트 컨텍스트 코치 매칭

커리큘럼이 확정된 프로젝트에서:
1. 세션별 `recommendedExpertise` + `title` 텍스트를 RFP 요약과 합성
2. → AI Recommend API로 전송
3. → Top-3 코치를 각 세션 카드에 "추천 코치" 칩으로 표시
4. PM이 클릭하면 CoachDetailModal 오픈
5. "이 세션에 배정" 버튼 → `CoachAssignment` 레코드 생성

#### F5.4 Coach Detail 통합 뷰

**`/coaches/[id]` 페이지 (신규):**
- 기존 coach-finder의 `CoachDetailModal` 내용을 전체 페이지로 구현
- 상단: 프로필 사진, 이름, 티어/카테고리 배지, 전문 분야 태그
- 탭 1 "프로필": intro, 경력, 학력, 언더독스 이력, 보유 툴
- 탭 2 "배정 현황": 현재/과거 프로젝트 배정 이력
- 탭 3 "평가 이력": 세션별 만족도 점수 + 코멘트 타임라인
- 탭 4 "가용 일정": 가능 요일, 불가 기간, 리드타임
- 하단 액션바: "이 프로젝트에 배정하기" (컨텍스트에 projectId가 있을 때 활성화)

---

### F6. 예산 자동 산출 엔진 (Budget Engine)

**우선순위:** 매우 높음 — 가장 비어있는 핵심 기능 (Phase 1)

#### F6.1 예산 산출 공식

```
공급가액(supplyPrice) = PC(인건비) + AC(직접비) + 마진
총액(totalBudgetVat) = 공급가액 × 1.1 (VAT 10%)

PC = Σ(각 코치 배정 건별 인건비)
  각 코치 인건비 = agreedRate × totalHours × (1 - taxRate)

AC = Σ(직접비 항목)
  직접비 = 대관 + 식음료 + 홍보 + 디자인 + 영상 + 기타
  각 항목 = CostStandard.unitPrice × 수량

마진 = supplyPrice - PC - AC
마진율(%) = 마진 / supplyPrice × 100
```

#### F6.2 Budget Engine API

**`POST /api/budget/calculate`** (신규):

**Request:**
```typescript
{
  projectId: string
  participantCount: number    // 참여자 수 (대관/식음료 계산용)
  sessionCount: number        // 세션 수
  venueDays: number           // 대관 일수
  isCapitalArea: boolean      // 수도권 여부 (대관 단가 분기)
  overrides?: {               // PM이 수동 조정하는 항목
    [wbsCode: string]: number
  }
}
```

**Response:**
```typescript
{
  pc: {
    total: number
    items: Array<{
      coachId: string
      coachName: string
      role: AssignmentRole
      sessions: number
      hoursPerSession: number
      agreedRate: number
      totalHours: number
      grossFee: number
      taxRate: number
      netFee: number
      wbsCode: string
    }>
  }
  ac: {
    total: number
    items: Array<{
      wbsCode: string
      category: string
      name: string
      unit: string
      unitPrice: number
      quantity: number
      amount: number
      isEstimated: boolean    // AI 추정치 여부
    }>
  }
  summary: {
    supplyPrice: number
    vatAmount: number
    totalBudgetVat: number
    margin: number
    marginRate: number
    budgetUtilizationRate: number  // 발주 예산 대비 사용률
    marginWarning: boolean          // marginRate < 10% 시 true
  }
}
```

**자동 AC 추정 로직:**
- `CostStandard` DB에서 `wbsCode` 기준으로 항목 조회
- 수량 = 참여자 수 × 세션 수 (식음료), 1건 (디자인/영상)
- isCapitalArea에 따라 대관 단가 분기 (수도권: 30,000원/인/일, 지방: 20,000원/인/일)

#### F6.3 Budget 대시보드 UI

**`/projects/[id]/budget` 탭** (신규 컴포넌트 `budget-dashboard.tsx`):

**레이아웃:**
```
[상단 요약 카드 3개]
  PC 합계: 000원   AC 합계: 000원   마진율: 00%
  (마진율 < 10% 시 빨간색 배경 + 경고 아이콘)

[탭: WBS 표 | 차트 | 시뮬레이터]

WBS 표 탭:
  WBS코드 | 분류 | 항목 | 단위 | 단가 | 수량 | 금액 | 비고
  (PC 섹션 — 코치 배정 기반 자동 생성)
  (AC 섹션 — AI 추정치, PM 수정 가능)
  [항목 추가] [항목 삭제] [직접 입력]

차트 탭:
  - 도넛 차트: PC/AC/마진 비율
  - 막대 차트: 카테고리별 AC 분해

시뮬레이터 탭:
  "마진 최적화 시뮬레이터"
  - Tier 조합 변경 시 마진 변화 미리보기
  - 특정 코치를 하위 티어로 교체 시 마진 증가분 계산
  - PM이 클릭하여 코치 교체 제안 생성
```

#### F6.4 예산-커리큘럼-코치 실시간 연동

Zustand Store (`useBudgetStore`)에서:
- `CoachAssignment` 변경 → 자동으로 PC 합계 재계산
- 세션 수 변경 → 자동으로 AC 추정 재계산
- 예산 변경 → 마진율 실시간 업데이트 + Warning 표시

---

### F7. SROI 예측 및 실적 비교 대시보드

**우선순위:** 기존 구현 연결 (Phase 2)

#### F7.1 SROI와 프로젝트 데이터 연동

현재 `sroi-calculator.tsx`는 독립적으로 동작함. 프로젝트 데이터와 연결:

- 프로젝트 선택 시 `totalBudgetVat`이 "총 투자금"에 자동 채워짐 (이미 구현됨)
- 프로젝트의 `kpiTargets`에서 참여자 수, 목표 수료율, 목표 창업 전환율 읽어 각 ImapctLine의 `count` / `frequency` 초기값 자동 채움 (신규)

#### F7.2 예측 vs 실적 비교

프로젝트 상태가 COMPLETED가 되면:
- `sroiActual` 필드에 실제 전환율/성과 입력 폼 활성화
- 차트: 예측 SROI (파란색 bar) vs 실제 SROI (주황색 bar) 병렬 표시
- 오차율 자동 계산 → Layer 3 학습 루프에 반영

---

### F8. 사후 평가 시스템 (Post-Program Evaluation)

**우선순위:** 통합 핵심 기능 (Phase 2)

#### F8.1 코치 평가 플로우

프로젝트 종료 후 PM이 트리거:

**Step 1 — 세션별 평가 생성:**
- 프로젝트의 각 `CurriculumItem`에서 `assignedCoachId`가 있는 세션 목록 추출
- 각 세션별 평가 폼 자동 생성

**Step 2 — 평가 폼 구성:**
```
세션명: {session.title}
코치: {coach.name}
날짜: {session.date}

[1] 전반적 만족도: ★★★★☆ (1~5점)
[2] 내용 전문성: ★★★★☆
[3] 전달력/강의력: ★★★☆☆
[4] 참여자 반응: ★★★★☆
[5] 다음 프로젝트 추천 의향: ★★★★☆
[6] 자유 코멘트: [텍스트 입력]
[7] 이 콘텐츠를 다음에도 사용할 의향: ✅ 예 / ❌ 아니오
```

**Step 3 — DB 저장:**
- `SatisfactionLog` 레코드 생성
- `Coach.satisfactionAvg` 자동 재계산 (`UPDATE Coach SET satisfactionAvg = AVG(SatisfactionLog.score)`)
- `Coach.collaborationCount` +1

#### F8.2 참여자 만족도 연동

기존 `/feedback/[projectId]` 공개 링크:
- 현재: 참여자 전반 만족도만 수집
- 추가: 세션별 만족도 수집 (어떤 세션이 가장 도움이 됐나?)
- 결과가 `Content.legacyCode` 기준으로 집계 → Layer 3에 반영

#### F8.3 코치 만족도 → 매칭 알고리즘 반영

`Coach.satisfactionAvg < 3.5` 인 코치:
- 코치 카드에 "최근 평가 낮음" 배지 표시 (Admin/CM에게만)
- AI 추천 점수에서 -2점 패널티 적용
- Admin에게 "이 코치 상태를 검토해주세요" 알림

---

### F9. 학습 루프 엔진 (Layer 3)

**우선순위:** Phase 4 (엔드게임)

#### F9.1 수주 결과 입력

프로젝트 상태를 SUBMITTED → COMPLETED 또는 LOST로 변경 시 팝업:
```
이 제안서의 결과를 입력해주세요.
[수주 성공] [수주 실패]
기술 평가 점수: [___] / 100
이익률(마진율): [___] %
특이사항: [텍스트 입력]
```

저장 필드 (`Project` 테이블 확장):
```prisma
isBidWon      Boolean?
techEvalScore Float?
bidNotes      String?  @db.Text
feedbackApplied Boolean @default(false)
```

#### F9.2 실적 입력 (프로젝트 종료 후)

프로젝트 COMPLETED 상태에서 "실적 입력" 버튼:
```
핵심 성과 지표 (실측치):
수료율: [___] %
창업 전환율(6개월): [___] %
투자 유치 건수: [___] 건
매출 발생 팀 수: [___] 팀
NPS 점수: [___]
모듈별 만족도: [세션1: __] [세션2: __] ...
```

`Project.kpiActuals` JSON에 저장.

#### F9.3 가중치 보정 제안 엔진

**`POST /api/learning/analyze`** (배치 실행, 월 1회):
- 최근 6개월 완료 프로젝트의 예측 vs 실측 오차 계산
- 오차 패턴이 3회 이상 반복되면 보정 제안 생성
- 제안을 `WeightSuggestion` 테이블에 저장

```prisma
model WeightSuggestion {
  id           String   @id @default(cuid())
  category     String   // "conversion_rate" | "coach_score" | "theory_ratio"
  targetField  String   // "mvpConversionRate" | "investConversionRate"
  currentValue Float
  suggestedValue Float
  evidenceJson Json     // 근거 데이터 (어떤 프로젝트들의 데이터 기반인지)
  status       String   @default("PENDING") // PENDING | APPROVED | REJECTED
  adminNote    String?
  createdAt    DateTime @default(now())
  resolvedAt   DateTime?
}
```

#### F9.4 Admin 승인 Review Panel

**`/admin/learning`** 페이지:
- 대기 중인 가중치 보정 제안 목록
- 각 제안 카드: 현재값 → 제안값, 근거 데이터 차트, 승인/거부 버튼
- 승인 시 해당 `AudienceProfile` 또는 `CostStandard` 자동 업데이트

---

### F10. Admin Layer 1 관리 UI

**우선순위:** Phase 3~4

#### F10.1 Admin 전용 페이지 구조

```
/admin
  ├── /impact-modules     IMPACT 18모듈 관리
  ├── /contents           콘텐츠 300+ 관리 (CSV 업로드)
  ├── /content-mappings   콘텐츠 ↔ 모듈 매핑 (드래그앤드롭)
  ├── /design-rules       설계 규칙 ON/OFF 패널
  ├── /audience-profiles  대상별 가중치 프로필 편집
  ├── /cost-standards     비용 기준 단가표 편집
  ├── /sroi-proxies       SROI 프록시 계수 관리
  ├── /past-proposals     과거 제안서 아카이브 + 실적 입력
  └── /learning           학습 루프 대시보드 + 승인 패널
```

#### F10.2 설계 규칙 관리

`DesignRule` 모델 (신규):
```prisma
model DesignRule {
  id          String  @id @default(cuid())
  ruleCode    String  @unique  // "R-001"
  name        String           // "이론 연속 제한"
  description String?
  ruleType    String           // "MAX_THEORY_CONSECUTIVE" | "MIN_ACTION_WEEK" | "MIN_MARGIN" | ...
  threshold   Float            // 역치값 (3 = 3연속, 0.1 = 10%)
  action      String           // "BLOCK" | "WARN" | "SUGGEST"
  message     String           // 위반 시 표시할 메시지
  category    String           // "flow" | "format" | "budget" | "impact"
  priority    Int     @default(5)
  isActive    Boolean @default(true)
  updatedAt   DateTime @updatedAt
}
```

Admin UI에서 각 Rule의 threshold 조정, action 변경, ON/OFF 토글 가능.
변경 즉시 Curriculum Rule Engine에 반영.

#### F10.3 대상별 가중치 프로필

```prisma
model AudienceProfile {
  id                 String @id @default(cuid())
  name               String @unique  // "AI 청년 창업팀"
  targetAudience     String[]        // ["청년", "대학생"]
  businessFields     String[]        // ["투자", "AI/DX"]
  startupStages      String[]        // ["예비", "초기"]

  formatWeights      Json   // {"LECTURE": 0.6, "WORKSHOP": 1.4, "ACTION_WEEK": 1.5}
  impactStageWeights Json   // {"I": 0.5, "M": 1.2, "P": 1.5, "A": 1.3, "C": 1.0, "T": 0.8}
  fieldWeights       Json   // {"투자": 1.3, "ESG": 0.5, "로컬": 0.3}

  recommendedPattern String?         // "정기교육형" | "인큐베이팅형" | "스프린트형"
  notes              String?
  updatedAt          DateTime @updatedAt
}
```

---

### F11. Human-in-the-Loop UX 가이드라인

#### F11.1 세션별 Lock 기능

```typescript
// CurriculumItem 테이블에 필드 추가
isLocked Boolean @default(false)
```

- 세션 카드 우측 상단에 자물쇠 아이콘
- 클릭 시 `isLocked: true` → 주황색 아이콘으로 변경
- 전체 Re-roll 시 `isLocked === true` 세션은 Claude에 "이 세션은 고정입니다" 프롬프트에 포함
- 예산/SROI 재계산 시에도 해당 세션의 코치/단가는 불변

#### F11.2 블록 단위 부분 재생성 (Granular Re-roll)

세션 카드 컨텍스트 메뉴 (우클릭 또는 `...` 버튼):
- "이 세션만 다시 생성" → `POST /api/ai/curriculum/reroll` with `{ sessionNo, context }`
- "이 세션부터 끝까지 다시 생성" → 해당 sessionNo 이후 미잠금 세션 모두 재생성
- "Action Week로 교체" → 해당 세션을 Action Week로 즉시 변환

#### F11.3 에러 바운더리 & Fallback UI

**모든 AI API 호출 지점에 적용:**
```
로딩 중 → 스피너 + "Claude가 기획 중입니다..." 텍스트
성공 → 결과 렌더링
실패(parse error) → Fallback 모달:
  "AI 응답 파싱에 실패했습니다."
  [다시 시도] [수동으로 입력하기]
  수동 입력: 해당 폼의 빈 Edit Form 노출
실패(network/timeout) → Toast: "연결이 불안정합니다. 잠시 후 다시 시도해주세요."
```

---

### F12. 프로젝트 총괄 시트 내보내기 (Export Mapper)

**우선순위:** Phase 4

**`src/lib/export/sheet-mapper.ts`** (신규):

내보내기 대상 항목 (총 30개 마스터 항목):

| 번호 | 항목 | 소스 필드 |
|------|------|-----------|
| 1 | 사업명 | Project.name |
| 2 | 발주기관 | Project.client |
| 3 | 계약 유형 | Project.projectType |
| 4 | 총 계약금액(VAT포함) | Project.totalBudgetVat |
| 5 | 공급가액 | Project.supplyPrice |
| 6 | 마진율 | Budget.marginRate |
| 7 | 사업 시작일 | Project.projectStartDate |
| 8 | 사업 종료일 | Project.projectEndDate |
| 9 | 교육 시작일 | Project.eduStartDate |
| 10 | 교육 종료일 | Project.eduEndDate |
| 11 | 총 교육 시간 | SUM(CurriculumItem.durationHours) |
| 12 | 총 세션 수 | COUNT(CurriculumItem) |
| 13 | Action Week 비율 | COUNT(isActionWeek) / total |
| 14 | 이론 비율 | COUNT(isTheory) / total |
| 15 | 참여 인원 | Project.rfpParsed.targetCount |
| 16 | 수료 인원 | COUNT(Participant.graduated === true) |
| 17 | 수료율 | 수료인원/참여인원 |
| 18 | 메인 코치 | CoachAssignment(MAIN_COACH).coach.name |
| 19 | 코치 총 인건비(PC) | Budget.pcTotal |
| 20 | 직접비 총액(AC) | Budget.acTotal |
| 21 | 예측 SROI | Project.sroiForecast.sroiRatio |
| 22 | 실제 SROI | Project.sroiActual.sroiRatio |
| 23 | 임팩트 목표 | Project.impactGoal |
| 24 | 수주 여부 | Project.isBidWon |
| 25 | 기술 평가 점수 | Project.techEvalScore |
| 26 | 코치 평균 만족도 | AVG(SatisfactionLog.score) |
| 27 | NPS | Project.kpiActuals.nps |
| 28 | 창업 전환율 | Project.kpiActuals.startupConversionRate |
| 29 | 투자 유치 건수 | Project.kpiActuals.investCount |
| 30 | 담당 PM | User.name (Project.pmId) |

**출력 포맷:**
- Excel (.xlsx): `exceljs` 라이브러리 사용
- Google Sheets: 기존 `google-sheets.ts` 확장

---

## 4. 데이터베이스 스키마 변경 계획

### 4.1 기존 테이블 필드 추가

```prisma
// Project 모델 추가 필드
model Project {
  // ... 기존 필드 유지 ...

  // Learning Loop용
  isBidWon        Boolean?
  techEvalScore   Float?
  bidNotes        String?   @db.Text
  feedbackApplied Boolean   @default(false)
  actualOutcomes  Json?     // {completionRate, startupRate, investCount, nps, ...}
}

// CurriculumItem 모델 추가 필드
model CurriculumItem {
  // ... 기존 필드 유지 ...
  isLocked        Boolean   @default(false)
  contentId       String?   // Content 테이블 참조 (Layer 1 콘텐츠)
  impactModuleId  String?   // ImpactModule 테이블 참조
}
```

### 4.2 신규 추가 모델

```prisma
// Layer 1: IMPACT 모듈 뼈대 (18개)
model ImpactModule { ... } // F4.2 참조

// Layer 1: 콘텐츠 라이브러리 (300+)
model Content { ... } // F4.2 참조

// Layer 1: 콘텐츠-모듈 매핑
model ContentMapping { ... } // F4.2 참조

// Layer 1: 설계 규칙
model DesignRule { ... } // F10.2 참조

// Layer 1: 대상별 가중치 프로필
model AudienceProfile { ... } // F10.3 참조

// Layer 3: 가중치 보정 제안
model WeightSuggestion { ... } // F9.3 참조

// Layer 3: 과거 제안서 아카이브
model PastProposal {
  id                String   @id @default(cuid())
  projectName       String
  clientName        String
  year              Int
  budget            Float?
  targetAudience    String
  startupStage      String
  impactModulesUsed String[]
  activityMix       Json
  operatingPattern  String?
  additionalTasks   String[]
  wonBid            Boolean?
  techScore         Float?
  actualOutcomes    Json?
  predictedVsActual Json?
  moduleSatisfaction Json?
  proposalFileUrl   String?
  parsedContent     Json?
  createdAt         DateTime @default(now())
}
```

---

## 5. 실행 로드맵 (Action Plan)

### Phase 1: 코어 방어 + 예산 엔진 + 기획 품질 UI ✅ (대부분 완료)

> **🗓 2026-04-06 현재 상태:** DB 세팅, 시드 적재, UI 재설계 6건, Coach 800명 마이그레이션 완료.

**개발자 작업:**

1. **`src/middleware.ts` 생성** — NextAuth 미들웨어로 라우트 보호 ← **미완료 (개발 중 인증 없이 진행 결정)**
2. **`scripts/migrate-coaches-json.ts`** — coach-finder JSON → PostgreSQL 마이그레이션 ✅ **800명 에러 0**
3. **`src/lib/curriculum-rules.ts`** — Rule Engine 구현 (R-001~R-004) ✅ **완료 + API 연결**
4. **`POST /api/budget/calculate`** — 예산 산출 API ✅ 완료
5. **`budget-dashboard.tsx`** — 예산 UI ✅ 완료
6. **`curriculum-board.tsx`** — 커리큘럼 보드 ✅ **재설계: 실시간 Rule 가드레일 + 비용 미리보기 + DataFlow**
7. **파이프라인 UI** ✅ 완료 + **기획 품질 스코어카드 추가**
8. **`src/lib/claude.ts` 버그 수정** ✅ **safeParseJson 배열 감지 로직 완료**
9. **Zustand useBudgetStore** ← **미완료** (커리큘럼 비용 미리보기로 부분 대체)
10. **`/api/admin/import`** ✅ 완료

**시드 데이터 (전부 적재 완료):**
- CostStandard: 76개 (AC+PC+CF단가)
- SroiProxy: 45개 (16종×4국)
- InternalLaborRate: 16개 (B2G+B2B+내부)
- ServiceProduct: 14개 (DOGS/VOD/BeyondEdu/SV)
- ImpactModule: 18개 (실제 PPTX 기반)
- Coach: 800명 (coaches_db.json 마이그레이션)

**UI/UX 기획 품질 재설계 (6건 완료):**
1. ✅ RFP 인텔리전스 — 3컬럼 인라인 편집 + AI 질문 + 완전성 점수
2. ✅ 스텝 간 데이터 흐름 — DataFlowBanner 키워드/배점 반영 실시간 표시
3. ✅ 기획 품질 스코어카드 — 7카테고리 70점, 행동 제안
4. ✅ 임팩트 설계 워크숍 — 3개 목표 후보 + SROI 힌트 + 2단계 플로우
5. ✅ 커리큘럼 디자이너 — 실시간 Rule 가드레일 + 비용 미리보기
6. ✅ 제안서 어시스턴트 — 인라인 편집 + 평가 시뮬레이션

**완료 기준:**
- [x] 파이프라인 6단계 UI로 프로젝트 기획 플로우 확인 가능
- [x] 예산 탭에서 PC/AC 항목 표시
- [x] 커리큘럼 보드에서 세션 추가/순서 변경 + Rule 실시간 검증
- [x] 커리큘럼 이론 비율 30% 초과 시 API가 422 반환
- [x] Action Week 없는 커리큘럼 저장 불가
- [x] CostStandard 시드 76개 적재 완료
- [x] Coach 800명 PostgreSQL 마이그레이션 완료
- [x] 제안서 섹션 인라인 편집 + 평가 시뮬레이션
- [ ] RBAC (개발 중 미적용 — 프로덕션 시 NextAuth 활성화)

---

### Phase 2: Coach Finder 통합 + 평가 시스템 (2주)

1. **`/api/coaches/ai-recommend`** — Python FastAPI 연동 API 래퍼
2. **`/coaches/[id]` 페이지** — 코치 상세 통합 뷰
3. **커리큘럼 세션 카드 → 추천 코치 칩** 연동
4. **코치 평가 플로우** — SatisfactionLog 생성 UI
5. **Drag & Drop 커리큘럼 편집** — `@dnd-kit/core` 도입
6. **Lock 기능** — CurriculumItem.isLocked 필드 + UI
7. **SROI-프로젝트 데이터 연동** — kpiTargets 자동 채움

**완료 기준:**
- [ ] coach-finder의 250+ 코치가 PostgreSQL에 정상 마이그레이션
- [ ] 프로젝트 컨텍스트에서 AI 코치 추천 동작
- [ ] 프로젝트 종료 후 코치 평가 폼 작성 가능
- [ ] Lock된 세션은 Re-roll에서 제외

---

### Phase 3: RBAC 완성 + 운영 고도화 (1주)

1. **역할별 UI 분기** — 각 컴포넌트에 useSession().role 체크
2. **Coach 포털** — COACH 역할 전용 제한 뷰
3. **실지출 트래커** — Expense 모델 UI 구현
4. **D-Day 칸반** — Task 보드 고도화 (우선순위, 담당자 필터)
5. **참여자 원장** — 출석률 입력, 수료 처리, 이메일 넛지

---

### Phase 4: Optimization Engine + Export (2주)

1. **Admin UI** (`/admin/*`) — Layer 1 전체 CRUD
2. **ImpactModule + Content + ContentMapping** 스키마 마이그레이션
3. **AudienceProfile + DesignRule** Admin 편집 화면
4. **Learning Loop** — 수주/실적 입력 → WeightSuggestion 생성
5. **Admin Review Panel** — 가중치 보정 승인/거부
6. **`lib/export/sheet-mapper.ts`** — 총괄 시트 내보내기
7. **PastProposal 아카이브** — 과거 제안서 업로드 + 파싱

---

## 6. 기술 스택 최종 정리

| 영역 | 기술 | 비고 |
|------|------|------|
| 프레임워크 | Next.js (App Router) | 기존 유지 |
| DB | PostgreSQL + Prisma | 기존 유지, pgvector 장기 추가 |
| 인증 | NextAuth v5 (Google OAuth) | @udimpact.ai 도메인 제한 |
| AI (기획) | Claude Sonnet 4.6 (Anthropic) | 기존 유지 |
| AI (벡터검색) | Google Gemini + FAISS | coach-finder에서 이식, 사이드카 유지 |
| 상태관리 | Zustand | 기존 유지, useBudgetStore 추가 |
| 드래그앤드롭 | @dnd-kit/core | 신규 설치 |
| 엑셀 출력 | exceljs | 신규 설치 |
| Word/PPT | docx + pptxgenjs | coach-finder에서 이식 |
| 지도 | Google Maps API | coach-finder에서 이식 (선택) |
| UI | shadcn/ui + Radix UI | 기존 유지, Radix 컴포넌트 추가 |
| 폰트 | Nanum Gothic | 기존 유지 |
| 배포 | Vercel | 기존 유지 |
| Python 서비스 | FastAPI + uvicorn | Cloud Run, DB를 PostgreSQL로 교체 |

---

## 7. 환경변수 추가 목록

```bash
# 기존 (유지)
DATABASE_URL=
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
ANTHROPIC_API_KEY=

# 신규 추가
PYTHON_SERVICE_URL=         # FastAPI 서비스 URL (로컬: http://127.0.0.1:8000, 프로덕션: Cloud Run URL)
GOOGLE_API_KEY=             # Gemini Embeddings용 (coach-finder에서 이식)
ALLOWED_EMAIL_DOMAIN=udimpact.ai   # 이메일 도메인 제한
COACH_FINDER_APP_URL=       # coach-finder 앱 URL (Deep Link용, 통합 전 단기)
```

---

*이 문서는 살아있는 문서입니다. 각 Phase 완료 시 해당 섹션 상태를 업데이트하세요.*
*Last updated: 2026-04-01 (엑셀 파일 학습 반영: 킥오프 시트 / 업무 프로세스 2026 / 임팩트 성과인증 / 마스터 데이터 취합)*

---

## 8. 실제 마스터 데이터 (Excel 학습 기반)

> 아래 데이터는 4개 엑셀 파일(킥오프 시트, 업무 프로세스 2026, 임팩트 성과인증 샘플, 마스터 데이터 취합)에서 추출한 실제 운영 기준이다.
> 코드로 바로 시드(seed)하거나 CostStandard / SroiProxy DB에 적재할 수 있다.

---

### 8.1 AC 직접비 기준 단가표 (4-1 탭 기준 — 내부용 최대 실비)

> `CostStandard` 테이블 seed 기준. type = 'AC'. 이 단가를 초과하려면 견적서 + 명확한 사유 필요.

#### 교통·숙박 기준 (단가 아닌 규칙)
- 100~200km 이동: +50,000원/인
- 200km 초과 이동: +100,000원/인
- 숙박: 언더독스가 직접 예매 배정 (실비 직접지급 불가)

#### 외부 인건비 (코치·강사 — 코치파인더 RATE_TABLE이 최종 우선순위)

| 항목 | 등급 | 기준 | 단가(원) | wbsCode 제안 |
|------|------|------|---------|------------|
| 특강 연사비 | S급 | 1 hour | 400,000 | AC-SPK-S |
| 특강 연사비 | A급 | 1 hour | 300,000 | AC-SPK-A |
| 특강 연사비 | B급 | 1 hour | 250,000 | AC-SPK-B |
| 특강 연사비 | C급 | 1 hour | 150,000 | AC-SPK-C |
| 심사비 | - | 1 hour (일 최대 300k) | 100,000 | AC-JUDGE |
| 액션코치 CM (8주교육) | A급 | 1 hour | 87,500 | AC-CM-A-8W |
| 액션코치 CM (8주교육) | B급 | 1 hour | 75,000 | AC-CM-B-8W |
| 액션코치 (8주교육) | A급 | 1 hour | 62,500 | AC-COACH-A-8W |
| 액션코치 (8주교육) | B급 | 1 hour | 50,000 | AC-COACH-B-8W |
| 액션코치 CM (해커톤) | A급 | 1 hour (일 최대 450k) | 75,000 | AC-CM-A-HK |
| 액션코치 CM (해커톤) | B급 | 1 hour (일 최대 375k) | 62,500 | AC-CM-B-HK |
| 액션코치 (해커톤) | A급 | 1 hour (일 최대 300k) | 50,000 | AC-COACH-A-HK |
| 액션코치 (해커톤) | B급 | 1 hour (일 최대 225k) | 37,500 | AC-COACH-B-HK |
| 운영 프리랜서 파트너PM | D1 | 1 month | 4,000,000 | AC-OPR-D1 |
| 운영 프리랜서 파트너PM | M3 | 1 month | 3,400,000 | AC-OPR-M3 |
| 운영 프리랜서 파트너PM | M2 | 1 month | 3,000,000 | AC-OPR-M2 |
| 운영 스태프 | M2 | 1 hour (일 최대 120k) | 12,000 | AC-OPR-STAFF |
| 사회자 | - | 0.5 day | 500,000 | AC-MC-HALF |
| 사회자 | - | 1 day | 800,000 | AC-MC-FULL |

#### 홍보마케팅비

| 항목 | 기준 | 단가(원) | wbsCode 제안 |
|------|------|---------|------------|
| 매체광고 (배너/이메일/기사 등) | 모객 1인당 | 100,000 | AC-MKT-AD |
| 홈페이지 (기획+디자인+개발+유지1년) | 풀패키지 | 2,500,000 | AC-WEB-FULL |

#### 디자인·인쇄비

| 항목 | 기준 | 단가(원) | wbsCode 제안 |
|------|------|---------|------------|
| 키비주얼 디자인 풀패키지 | 1건 | 2,500,000 | AC-DES-KV-FULL |
| 키비주얼 디자인 기본패키지 | 1건 | 1,200,000 | AC-DES-KV-BASIC |
| 포스터/웹자보 | 1장 | 150,000 | AC-DES-POSTER |
| 카드뉴스 | 1장 | 20,000 | AC-DES-CARD |
| 현수막/배너/포토월 디자인 | 1장 | 100,000 | AC-DES-BANNER |
| PPT 디자인 | 1장 | 40,000 | AC-DES-PPT |
| 현수막/X배너 인쇄 | 1장 | 30,000 | AC-PRINT-BANNER |
| 책자 인쇄 (100권 미만) | 1권 | 15,000 | AC-PRINT-BOOK |

#### 사진·영상비

| 항목 | 기준 | 단가(원) | wbsCode 제안 |
|------|------|---------|------------|
| 사진 촬영 | 0.5 day | 300,000 | AC-PHOTO-HALF |
| 사진 촬영 | 1 day | 600,000 | AC-PHOTO-FULL |
| 스케치 영상 3회 촬영 | 1건 | 2,500,000 | AC-VIDEO-3X |
| 스케치 영상 1회 촬영 | 1건 | 1,500,000 | AC-VIDEO-1X |
| 온라인 중계 기본 (2cam) | 1회 | 1,000,000 | AC-LIVE-BASIC |
| 온라인 중계 풀 (3cam+) | 1회 | 3,200,000 | AC-LIVE-FULL |

#### 교육 운영비

| 항목 | 기준 | 단가(원) | wbsCode 제안 |
|------|------|---------|------------|
| 식사비 (교육 — 외부 인원 포함 시) | 1인 | 12,000 | AC-EDU-MEAL |
| 다과비 (교육 — 오프라인 1회) | 1인 | 4,000 | AC-EDU-SNACK |
| 사무용품비 (현장 준비) | 1회 | 50,000 | AC-EDU-SUPPLY |

#### 행사 운영비

| 항목 | 기준 | 단가(원) | wbsCode 제안 |
|------|------|---------|------------|
| 케이터링 일반 | 1인 | 12,000 | AC-EVT-CATERING |
| 케이터링 VIP | 1인 | 25,000 | AC-EVT-CATERING-VIP |
| 숙박 (광역시) | 1인/1박 | 60,000 | AC-EVT-HOTEL-METRO |
| 숙박 (시군구) | 1인/1박 | 50,000 | AC-EVT-HOTEL-RURAL |
| 임차/대관 (광역시) | 1인/1일 | 30,000 | AC-EVT-VENUE-METRO |
| 임차/대관 (시군구) | 1인/1일 | 20,000 | AC-EVT-VENUE-RURAL |
| 다과 (행사) | 1인 | 6,000 | AC-EVT-SNACK |
| 통역비 (리시버 200개, 녹화 없음) | 1회 | 2,000,000 | AC-EVT-INTERP |
| 통역비 (리시버 200개, 녹화 포함) | 1회 | 2,500,000 | AC-EVT-INTERP-REC |

#### 경상 운영비

| 항목 | 기준 | 단가(원) | wbsCode 제안 |
|------|------|---------|------------|
| 사업 경상운영비 | 1개월 | 200,000 | AC-OPS-MONTH |
| 교통비 (택시) | 실비 (네이버 지도 기준) | - | AC-TRANS-TAXI |
| 교통비 (KTX) | 실비 (일반석 기준) | - | AC-TRANS-KTX |
| 교통비 (고속버스) | 실비 (우등버스 기준) | - | AC-TRANS-BUS |
| 교통비 (항공) | 실비 (이코노미 기준) | - | AC-TRANS-AIR |

---

### 8.2 PC 인건비 기준 단가 (4-2 탭 기준)

> `CostStandard` 테이블에 type = 'PC'로 적재. **코치 단가는 coach-finder RATE_TABLE이 최종 우선순위** (아래 8.3 참고). 이 탭은 UD 내부 인력(PM/매니저)의 외부 견적용 단가다.

#### B2G 사업 — 학술연구용역인건비기준단가 (2024년, 기획재정부)

| 직군 | 직급 | 1시간 | 1일 | 1개월 | wbsCode |
|------|------|------|-----|------|---------|
| 프로/코치 | CEO·이사·본부장 (책임연구원) | 37,059 | 352,943 | 7,411,808 | PC-B2G-LEAD |
| 프로/코치 | 팀장·SD·사업PM·Director (연구원) | 28,416 | 270,632 | 5,683,276 | PC-B2G-PM |
| 프로/코치 | Manager (연구보조원) | 18,995 | 180,908 | 3,799,078 | PC-B2G-MGR |
| 프로/코치 | Intern (보조원) | 14,247 | 135,686 | 2,849,404 | PC-B2G-INTERN |

*1개월 기준: 5~50% 투입 비율만 가능*

#### B2B 사업 — 언더독스 인건비 기준단가 (2024년)

| 직군 | 직급 | 1시간 | 1일 | 1개월 | wbsCode |
|------|------|------|-----|------|---------|
| 프로/코치 | 대표 | 75,000 | 750,000 | 15,000,000 | PC-B2B-CEO |
| 프로/코치 | 이사·본부장 | 50,000 | 500,000 | 10,000,000 | PC-B2B-EXEC |
| 프로/코치 | 팀장·SD | 40,000 | 400,000 | 8,000,000 | PC-B2B-LEAD |
| 프로/코치 | 사업PM·디렉터 | 30,000 | 300,000 | 6,000,000 | PC-B2B-PM |
| 프로/코치 | 매니저 | 20,000 | 200,000 | 4,000,000 | PC-B2B-MGR |

*1개월 기준: 최대 5~100% 투입 가능*

---

### 8.3 코치 단가 (coach-finder RATE_TABLE — 최종 단가)

> **이 표가 Coach 배정 시 사용하는 최종 단가다.** 4-1, 4-2 탭의 코치 관련 단가보다 우선한다.

#### 역할별 × 등급별 단가

| 역할(role) | 등급(grade) | 일(원) | 시간(원) | 월(원) |
|-----------|-----------|-------|---------|------|
| 코칭(coaching) | 특별지급 | 300,000 | 85,000 | - |
| 코칭(coaching) | 메인 | 550,000 | 70,000 | - |
| 코칭(coaching) | 보조 | 400,000 | 50,000 | - |
| 강의(lecture) | 특별지급 | 500,000 | 200,000 | - |
| 강의(lecture) | 메인 | 650,000 | 80,000 | - |
| 강의(lecture) | 보조 | 350,000 | 40,000 | - |
| 운영(ops) | 특별지급 | 400,000 | 50,000 | 8,000,000 |
| 운영(ops) | 메인 | 224,000 | 28,000 | 4,480,000 |
| 운영(ops) | 보조 | 120,000 | 15,000 | 2,400,000 |

**세금:** 코치 인건비에는 3.3% 사업소득세 원천징수 (netFee = grossFee × 0.967)

---

### 8.4 언더독스 자체 서비스 단가 (4-3 탭)

> B2B 외부 견적 또는 교육비 내 서비스 포함 시 사용

#### DOGS 워크숍 서비스 (1인 일반가)

| 레벨 | 서비스명 | 1인 일반 | 단체(20인↑) | 핵심고객 |
|------|---------|---------|-----------|--------|
| LV.0 | DOGS 업무 성향 진단 | 150,000 | 40% DC | 60% DC |
| LV.1 | DOGS 팀 빌딩 워크숍 | 350,000 | 40% DC | 60% DC |
| LV.2-1 | DOGS 온보딩 워크숍 | 590,000 | 40% DC | 60% DC |
| LV.2-2 | DOGS 조직 문화 워크숍 | 790,000 | 40% DC | 60% DC |
| LV.2-3 | DOGS 리더십 워크숍 | 990,000 | 40% DC | 60% DC |

*할인 전결: 단체/연속 → 팀장, 핵심고객 → 본부장, 특별 → 전기팀*

#### 언더독스 아카이브 (VOD)

| 항목 | 1인 일반 |
|------|---------|
| 창업시리즈 패키지 | 173,600 |
| 기초 스타트업 A to Z | 163,800 |
| 창업시리즈 기초편 | 25,200 |

---

### 8.5 SROI 프록시 계수 전체 (임팩트 성과인증 샘플)

> `SroiProxy` 테이블 seed 기준. 기여율(contributionRate)은 별도 컬럼. 환율: IDR/KRW=0.085, JPY/KRW=9.285, INR/KRW=16.39

| 임팩트 유형 | 세부항목 | 방법론 | 산정식 | 한국(KRW) | 인도네시아 | 일본 | 인도 | 단위 |
|-----------|--------|------|------|---------|----------|----|----|-----|
| 교육 | 육성교육 | 비용/시장접근법 | 참여자×교육횟수×proxy | 156,000 | 85,000 | 241,280 | 147,000 | /회.명 |
| 교육 | 육성교육(VOD) | 시장접근법 | 참여자×교육개수×proxy | 66,000 | 66,000 | 66,000 | 66,000 | /개.명 |
| 교육 | 코칭 | 시장접근법 | 참여자×코칭횟수×proxy | 300,000 | 170,000 | 371,000 | 122,000 | /회.명 |
| 교육 | 해커톤 | 비용/시장접근법 | 참여자×진행일×proxy | 457,000 | 255,000 | 706,000 | 430,000 | /일.명 |
| 교육 | 해커톤(사업계획서) | 시장접근법 | 참여자×1건×proxy | 358,000 | - | 479,000 | - | /건.명 |
| 교육 | 창업전환 | 이익접근법 | 창업전환인원×proxy×12개월 | 2,500,000 | 1,530,000 | 1,665,000 | - | /월.명 |
| 경제부가가치 | 창업팀 매출성과 | 이익접근법 | 매출합계×부가가치율(%) | 43.75% | 100% | 43.75% | - | 부가가치율 |
| 경제부가가치 | 창업팀 매출성과 예측 | 시장접근법 | 소상공인 평균 매출 | 250,000,000 | - | 105,849,000 | - | /팀 |
| 고용가치 | 창업팀 신규채용 | 이익접근법 | 신규고용인원×proxy×12개월 | 3,200,000 | 1,530,000 | 2,598,000 | - | /월.명 |
| 투자 | 투자유치 | 이익접근법 | 투자유치금액×기여율(20%) | - | - | - | - | 기여율 0.2 |
| 투자 | 투자유치 시장가 | 시장접근법 | 스타트업 평균 투자유치액 | 360,000,000 | - | 464,250,000 | - | /건 |
| 투자 | 사업화자금 유치 | 이익접근법 | 사업화자금×기여율(20%) | - | - | - | - | 기여율 0.2 |
| 투자 | 사업화자금 시장가 | 시장접근법 | TIPS 프로그램 평균 지원금 | 500,000,000 | - | - | - | /건 |
| 생태계 조성 | 창업코치 육성 | 비용/시장접근법 | 육성인원×교육횟수×proxy | 156,000 | 85,000 | 241,280 | - | /회.명 |
| 생태계 조성 | 지역경제 활성화 | 비용/시장접근법 | 행사참여자×proxy | 52,000 | - | - | - | /명 |
| 생태계 조성 | 공간 조성 | 시장접근법 | 제공면적×proxy×기간 | 20,000 | - | - | - | /월.평 |

**출처:**
- 교육/코칭: udimpact 내부 프로그램 평균 단가 (udi analysis)
- 창업팀 매출: 한국은행 산업연관표 업종별 부가가치율 (스타트업 주요업종 평균)
- 고용가치: 고용노동부 2024년 월임금총액(실질) 통계
- 투자 기여율 20%: 교육 성과기여도 조사 데이터 결과 중 최소 비율 적용

---

### 8.6 데이터 수집 프레임워크 (마스터 데이터 취합 기준)

> UD가 모든 프로젝트에서 표준으로 수집하는 8종 데이터. `Participant` 및 관련 모델 설계 기준.

#### 수집 타임라인

```
(0) 킥오프 전
  → 1. 프로그램 메타데이터 (PM 입력: 프로젝트명, 기간, 예산, 목표)

(1) 참여자 모집/신청
  → 2. 참여자 신청 정보 (신청폼: 기본 특성, 창업단계, 팀 정보)

(2) 교육 시작 전 (사전)
  → 3. DOGS 성향 진단 (팀빌딩 필요 시 — 선택적)
  → 4-pre. ACTT 사전 설문 (실행역량 기저값 측정)
  → 5-pre. 창업현황 사전 설문 (비즈니스 성장지표 기저값)

(3) 교육 진행 중
  → 6. 출석률 & 코칭일지 (세션별 입력)
  → 7. 만족도 (세션별 또는 월별)

(4) 교육 종료 후 (사후)
  → 4-post. ACTT 사후 설문 (역량변화 측정)
  → 5-post. 창업현황 사후 설문

(5) 수료 6개월 후
  → 8. 알럼나이 설문 (장기 임팩트 추적)
```

#### 수집 항목별 목적

| 수집 항목 | 목적 | 관리 주체 | 수집 방식 |
|---------|------|---------|---------|
| 프로그램 정보 | 사업 메타데이터, 킥오프 기준 | PM | 내부 요청 |
| 참여자 신청 | 참여자 기본 특성 파악 | PM | 신청폼 |
| DOGS | 팀빌딩, 성향(D.O.G.S) 측정 | 코치 | 진단 도구 |
| ACTT (사전사후) | 실행역량 변화 측정, 교육 효과성 | 랩스/PM | 설문 |
| 창업현황 (사전사후) | 비즈니스 성장지표 사전·사후 비교 | PM | 설문 |
| 교육과정 출결·코칭일지 | 성실도, 수료기준, Retention | 코치 | 현장 기록 |
| 만족도 | 교육 만족도 | PM | 설문 |
| 알럼나이 | 수료 후 장기 임팩트 추적 | 랩스 | 설문 |

#### DB 모델 — 구현 완료 (v5.1, 2026-04-06)

> Prisma 스키마에 아래 모델들이 추가됨. 시드 데이터는 `prisma/seed-data/survey-templates.json`에 문항 전체 정의.

| 모델 | 역할 | 관계 |
|------|------|------|
| `Applicant` | 참여자 지원서 (28개 산업분류, 신청서 전체) | Project 1:N |
| `DogsResult` | DOGS 24문항 결과 (4점 리커트, D/O/G/S 점수) | Participant 1:N |
| `ActtResult` | ACTT 15문항 사전/사후 (5점 리커트, 5개 역량 도메인별 점수) | Participant 1:N, timing=PRE/POST |
| `StartupStatusRecord` | 창업현황 사전/사후 (매출/고용/투자/특허 등 12항목) | Participant 1:N, timing=PRE/POST |
| `StartupDiagnosis` | 창업현황 진단 루브릭 (12항목 5레벨 + 주관식 4개) | Participant 1:1 |
| `SatisfactionResponse` | 만족도 응답 (10개 섹션 47문항, 세션별+최종) | Participant N:1, Project N:1 |
| `CoachingJournal` | 코칭일지 (목표/활동/진단/액션플랜) | Project N:1, Participant N:1 |
| `AlumniRecord` | 알럼나이 연 1회 추적 (활동상태/매출/투자/고용 등 16항목) | Participant 1:N, surveyYear |
| `InternalLaborRate` | 내부 인건비 단가 (B2G/B2B/INTERNAL 16개 등급) | 독립 마스터 |
| `ServiceProduct` | 서비스 상품 카탈로그 (DOGS/VOD/BeyondEdu/SV Impact 14종) | 독립 마스터 |

**시드 데이터 파일 목록:**
- `prisma/seed-data/cost-standards.json` — 76개 (AC 직접비 + PC 외부인건비 + CF 코치파인더 단가)
- `prisma/seed-data/sroi-proxies.json` — 46개 (16종 × 4개국, methodology/source/isRate 필드 포함)
- `prisma/seed-data/internal-labor-rates.json` — 16개 (B2G 6 + B2B 5 + INTERNAL 5)
- `prisma/seed-data/service-products.json` — 14개 (DOGS 5 + VOD 3 + BeyondEdu 3 + SV Impact 3)
- `prisma/seed-data/survey-templates.json` — DOGS 24Q + ACTT 15Q + 창업현황 12항목 + 진단 루브릭 12항목 + 만족도 47문항 + 알럼나이 16항목
- `prisma/seed-data/industry-categories.json` — 28개 산업분류

---

### 8.7 킥오프 시트 표준 구조 (Project 킥오프 시 체크리스트)

> 새 프로젝트 킥오프 시 UD 시스템에 입력해야 하는 표준 항목 (0-1 ~ 0-6 탭 기준)

#### 0-1. 사업개요 필수 입력 항목
- 클라이언트명 + 담당자 (이름, 파트, 역할)
- 이해관계자 목록 (투자사, 기부금처리기관, 컨소시엄 기관 등)
- 클라이언트의 목적 (왜 이 사업을 하는가)
- 언더독스의 목적 (왜 수임하는가)
- 협업 부서 목록

#### 0-3. 세부사항 / 목표 체계
```
사업 목적 (통합 목적 = 클라이언트 목적 + 언더독스 목적)
  ↓
교육 대상 (특성, 창업 단계, Track 구분)
  ↓
성장 목표 (KPI)
  ├── [정량성과] 수료율, 창업전환율, 투자유치건수, 입점률 등
  ├── [영업관점] 파트너십 확보, 연속사업 유치
  └── [프로 목표 / 코치 목표] 직군별 개별 목표
  ↓
세부기획방향 (목표별 달성 방법)
  ↓
달성주차 (언제까지)
  ↓
진행상황 위클리 (매 교육 후 랩업)
```

#### 0-4. R&R 매트릭스 필수 항목
- 구분 (프로/코치/외부)
- 그룹 (창업그룹/비욘드에듀/스포트라이트 등)
- 담당자 이름
- R&R 상세 (불릿 포인트)

#### 0-5. 전체 일정 (간트차트)
- 구분 / 과업분류 / 세부과업 / 산출물 / 담당부서 / 담당자 / 체크사항 / 주차별 O표시

---

### 8.8 업무 프로세스 표준 2026 (ud 업무 프로세스 표준화 탭 기준)

> 시스템이 지원해야 하는 업무 흐름 기준 (01.셀관리~03.프로젝트운영 탭)

#### 영업 프로세스 컬럼 구조 (시스템 자동화 기준)
```
guideline | 과업 | 세부 프로세스(절차) | PIC | 구분 | 도구(TOOL)
```

#### 자동화 백로그 구조 (02자동화 탭)
```
No. | 프로세스 백로그 | 유형 | 산출물 | 개발/도입 프로덕트 | 개발상태 | 우선순위 | 마감기한 | PM 피드백
```

→ 이 형식을 UD-Ops의 `Task` 칸반 기능에 직접 반영.

#### 내부 사업성 검토 승인 라인 (1-1 탭 기준)
```
1개 부서 단독사업: 1-1-1. 탭 1개 작성
2개 부서 이상 협업: 각 부서가 별개 탭 작성 → 주관부서에서 종합 탭에 취합
승인: 모든 그룹장 1차 승인 → FM 예산 검토
```

#### 마진율 목표
- 라운드업 리그 사례 실측: 공급가액 300M원, 사업 투입 250.5M원, 사업 실비 181.3M원 → **마진율 약 14.9%**
- 시스템 경고 기준: marginRate < 10% (기존 설정 유지)
- **권장 마진율: 10~20%**

---

## 9. F6 Budget Engine 고도화 (Excel 데이터 반영)

> 8절의 실제 단가표를 Budget Engine에 완전 통합하는 구현 명세

### 9.1 CostStandard 자동 시드 스크립트

`prisma/seed-data/cost-standards-ac.json` 신규 파일로 8.1의 모든 항목을 시드:

```typescript
// 자동 AC 추정 시 wbsCode 매핑 규칙
const AUTO_AC_ITEMS = [
  { wbsCode: 'AC-EDU-MEAL',    trigger: 'participantCount × sessionCount',   formula: 'participantCount * sessionCount * 12000' },
  { wbsCode: 'AC-EDU-SNACK',   trigger: 'participantCount × sessionCount',   formula: 'participantCount * sessionCount * 4000' },
  { wbsCode: 'AC-EDU-SUPPLY',  trigger: 'sessionCount',                      formula: 'sessionCount * 50000' },
  { wbsCode: 'AC-OPS-MONTH',   trigger: 'projectMonths',                     formula: 'projectMonths * 200000' },
  { wbsCode: 'AC-EVT-VENUE-METRO', trigger: 'isCapitalArea && venueDays',    formula: 'participantCount * venueDays * 30000' },
  { wbsCode: 'AC-EVT-VENUE-RURAL', trigger: '!isCapitalArea && venueDays',   formula: 'participantCount * venueDays * 20000' },
]
```

### 9.2 PC 인건비 계산 업데이트

```typescript
// Budget Engine PC 계산 시 사용
function calculateCoachFee(assignment: CoachAssignment): number {
  const { role, grade, unit, quantity } = assignment
  const rateTable = RATE_TABLE[role][grade]  // coach-finder RATE_TABLE
  const grossFee = rateTable[unit] * quantity
  const netFee = grossFee * (1 - 0.033)  // 3.3% 원천징수
  return netFee
}

// UD 내부 인력(PM/Manager) PC 계산
function calculateUdStaffFee(staffType: 'B2G' | 'B2B', grade: string, hours: number): number {
  const rateTable = UD_STAFF_RATES[staffType][grade]
  return rateTable.hour * hours
}
```

### 9.3 예산 검토 자동화 체크리스트

예산 산출 완료 후 시스템이 자동으로 체크:

```
□ 마진율 10% 이상인가? (기준: 권장 10~20%)
□ 사업 실비 비율이 60% 이하인가? (라운드업 리그 실측 60.4% 참고)
□ 코치 인건비가 RATE_TABLE 범위 내인가?
□ 100만원 이상 대관비 항목에 비교견적 필요 표시가 있는가?
□ B2G 사업인 경우 학술연구용역인건비기준단가가 적용되었는가?
□ 인사이트 트립 등 해외 비용 항목이 있는 경우 환율 기준일이 기재되어 있는가?
```

---

## 10. F11 데이터 수집 통합 (Phase 3)

> 8.6의 데이터 수집 프레임워크를 시스템에 구현하는 명세

### 10.1 참여자 원장 (Participant Ledger)

`/projects/[id]/participants` 탭 구성:

```
[참여자 목록 테이블]
  번호 | 이름 | 팀명 | Track | 출석률 | ACTT변화 | 창업전환 | 수료

[상단 필터]
  Track A/B | 수료/미수료 | 고위험(출석 < 70%)

[개인 상세 드로어]
  - 기본 정보 (신청폼 데이터)
  - DOGS 성향 결과
  - ACTT 사전→사후 점수 차트
  - 창업현황 사전→사후 비교
  - 세션별 출석 이력
  - 코칭 일지 목록
```

### 10.2 SROI 자동 계산 연동

프로젝트 데이터 → SROI 자동 매핑:

```typescript
// 프로젝트 참여자 데이터 → SROI 입력값 자동 채움
function autoFillSroiInputs(project: Project, participants: Participant[]) {
  return {
    // 교육/육성교육: 참여자 수 × 총 세션 수
    educationImpact: participants.length * project.curriculumItems.length,

    // 교육/코칭: 코칭 세션 참여자 수 × 코칭 횟수
    coachingImpact: participants.length * coachingSessionCount,

    // 창업전환: ACTT 사후 기반 전환 예측
    startupConversion: participants.length * expectedConversionRate,

    // 투자유치: 참여팀 × 평균 투자유치 기대액 × 기여율(20%)
    investmentImpact: teamCount * AVG_INVESTMENT * 0.2,
  }
}
```

### 10.3 알럼나이 추적 자동화

수료 후 연 1회(매년 1/15~25) 자동 설문 발송:
- 수료 처리 시 알럼나이 대상 자동 등록
- Cron 또는 Vercel Cron으로 해당 날짜에 이메일 발송
- 응답 데이터 → `AlumniRecord` 저장 → Layer 3 학습 루프 반영

---

## 11. 인프라 결정 사항 (2026-04-06 확정)

### 11.1 DB 환경

- **개발**: Docker Compose (로컬 PostgreSQL)
- **프로덕션**: Google Cloud SQL (PostgreSQL)
- **Coach Finder 통합**: UD-Ops가 마더 사이트, Coach Finder는 하위 사이트. 동일 PostgreSQL DB 공유, Coach Finder UI는 UD-Ops 내부 라우트(`/coaches/*`)로 통합

### 11.2 인증 전략

- **개발 중**: 인증 없이 진행 (middleware.ts 미적용)
- **프로덕션**: NextAuth Google OAuth, `@udimpact.ai` 도메인 제한

### 11.3 코치 단가 우선순위

**Coach Finder의 RATE_TABLE이 최종 단가.** 킥오프 시트 4-1/4-2 탭은 UD 내부 인력 단가 및 외부 견적 참고용.

---

## 12. 업무 프로세스 표준화 2026 — 시스템 반영 사항

> `ud 업무 프로세스 표준화_2026 ver.xlsx` 분석 결과. Cell 기반 경영 체계로 전환된 2026 운영 프로세스를 UD-Ops에 반영.

### 12.1 Cell 경영 체계 핵심

- **사업이익 KPI**: 1인당 기여이익 1.2~1.8억원 목표
- **실비율 목표**: 60% → 55% 감축
- **CL(Cell Leader)→CEO 직접 보고**: 주간 정기 미팅 + 대시보드 기반
- **예산 검토 필수 게이트**: D-2까지 Flex 예산검토 요청 → CSO 리뷰

### 12.2 영업 파이프라인 (시스템 반영 대상)

```
리드 확보 (인바운드/아웃바운드)
  → SQL 세일즈 (영업관리 대시보드)
  → 기회 전환 (입찰/영업 제안)
  → 수주 → 사업 PM 배정 → 프로젝트 세팅
```

**UD-Ops 반영 포인트:**
- 영업 대시보드 필요 (현재 미구현, Slack + Google Sheets 분산)
- SQL → 기회 전환율 20%, 영업 수주율 60%, 입찰 수주율 20% 기준
- 제안서 정기 회고: 월별 대표 2건 선정 + 개선 반영

### 12.3 프로젝트 라이프사이클 (시스템 반영 대상)

```
01 수주사업 세팅 (PM 배정, 채널 개설, 다운로드 미팅)
02 계약/대가 수령 (이행보증보험, 선금/중도금/잔금)
03 프로젝트 세팅 (총괄시트, 투입인력, KPI/임팩트 확정, 예산 확정)
04 프로젝트 점검 (킥오프 → 중간랩업 → 최종랩업, 주간 대시보드)
05 협력사 관리 (등록 → 계약 → 검수 → 대가지급)
06 교육 관리 (교육생/코치/알럼나이)
07 프로젝트 종료 (결산 → 종료)
```

### 12.4 자동화 백로그 — UD-Ops로 흡수 가능 항목

| 우선순위 | 항목 | UD-Ops 대응 기능 |
|---------|------|-----------------|
| 1 | 교육사업 운영 ADMIN 서비스 | UD-Ops 자체 (파이프라인 UI) |
| 1 | 코칭일지 기록 | `CoachingJournal` 모델 + UI |
| 1 | 액션코치 내부평가 | `SatisfactionLog` + 평가 UI |
| 1 | 영업/입찰 히스토리 기록 | Project 모델 확장 (영업 단계 추가) |
| 2 | 지원서 데이터 저장 | `Applicant` 모델 (구현 완료) |
| 2 | 심사평가 결과취합 | `Applicant.evaluationScores` JSON |
| 3 | 결과보고서 자동 작성 | 제안서 생성 + Export Mapper 확장 |
| 4 | 프로젝트별 수익률 자동계산 | Budget Engine (구현 완료) |

### 12.5 내부 사업성 검토 표준 구조

```
R (총 예산, VAT 포함) = R' × 1.1
R' (공급가액/매출) = R / 1.1
IC (전사 운영비) = R' × 15%
IDC (본부 운영비) = R' × 1.5%
DR (사업 예산) = R' - IC - IDC = R' × 83.5%
PC (인건비) = Σ(인원 × 시간 × 시급)
AC (사업 실비) = Σ(단가 × 수량)
OR (영업이익) = DR - PC - AC
영업이익률 = OR / R' × 100%
```

**SAP 계정 매핑:** 41910000 (매출), 94308000 (PC/인건비), 69004999 (AC/사업실비)

**다부서 협업 사업:** 주관부서 + 협업부서 각각 사업성 검토 → 종합 탭 취합 → 전 그룹장 1차 승인 → FM 예산 검토

---

## 13. IMPACT 창업방법론 (교육 콘텐츠 기반, 2026-04-06 학습)

> IMPACT PPTX 18개 + CORE 4개 실제 분석 결과. `ImpactModule` 테이블에 시드 적재 완료.

### 13.1 IMPACT 구조

**CORE (선수 4모듈)** → **IMPACT (본과 6단계 × 3모듈 = 18모듈, 54문항)** → **MVP 실행** → **산업분석**

포맷: 15분 강의 + 35분 워크숍 (ACT Canvas 3문항/모듈). 러닝 예시: "당당식단" 전 모듈 공통.

### 13.2 IMPACT 6단계 (I-M-P-A-C-T)

| 단계 | 이름 | 모듈 | 핵심 |
|------|------|------|------|
| **I** - Ideation | 나 자신 | I-1 의지와 목적, I-2 마인드셋, I-3 역량과 자원 | Why Digging, HEL Loop, MILES |
| **M** - Market | 고객과 문제 | M-1 고객 정의, M-2 문제 발견, M-3 문제 검증 | Early Adopter, JTBD, Mom Test |
| **P** - Product | 솔루션 | P-1 핵심가치, P-2 솔루션 설계, P-3 프로토타입 | VP Canvas, Walking Skeleton, Vibe Coding |
| **A** - Acquisition | 시장 진입 | A-1 MVP 설계, A-2 고객 획득, A-3 가격/전환 | MVP 3유형, Traction, Pricing 3-Lens |
| **C** - Commercial | 사업화 | C-1 시장/경쟁, C-2 비즈니스 모델, C-3 IR | Bottom-Up GTM, Unit Economics, 12-Slide Deck |
| **T** - Team | 조직과 성장 | T-1 비전/미션/CV, T-2 조직 구조, T-3 성장 로드맵 | Golden Circle, Vesting, KPI Dashboard |

### 13.3 ACTT + 5D 진단 체계

- **ACTT** (5가지 실행 습관): Goal → Environment → Problem → eXecution → Routinization (각 1-5점, 목표 4+)
- **5D** (AI시대 스킬셋): Domain, AI, Global, Data, Finance (각 1-5점, 목표 4+)
- ACTT = 엔진, 5D = 내비게이션 + 연료
- 자립 기준: ACTT 평균 4+ AND 5D 평균 4+

### 13.4 시스템 반영 (다음 스프린트)

- [ ] 제안서 AI 프롬프트에 IMPACT 방법론 구체적 반영
- [ ] 커리큘럼 AI 생성 시 18모듈 컨텍스트 제공 (모듈별 핵심질문/프레임워크/산출물)
- [ ] 운영 구조 템플릿에 ACTT/5D 진단 연계

---

## 14. 제안서 AI 생성 전략 (2026-04-06 수주 제안서 2건 분석 기반)

> 청년마을(60p) + 재창업(63p) 수주 제안서 분석. 제안서 AI 프롬프트에 반영 예정.

### 14.1 제안서 구조 공식

```
I. 일반 현황 (회사 소개, 조직, 실적, 재무)
II. 기본 계획 (배경, 전략, 인력, 로드맵, 기대성과)
III. 수행 계획 (세부 실행 — 제안서의 핵심, 가장 분량 많음)
IV. 사업 관리 (품질보증, 보고, 안전)
V. 기타 추가 제안 (RFP 범위 밖 3~4건 보너스 — 핵심 차별화)
```

### 14.2 반복되는 키 메시지 패턴

| 패턴 | AI가 생성 시 적용 방법 |
|------|---------------------|
| "국내 최초" | 언더독스가 해당 분야에서 처음 시도하는 요소 강조 |
| 정량 포화 | "많은" → "291명", "다양한" → "50개 기업 파트너" |
| 4중 지원 체계 | 코치 1명이 아닌 전문멘토+컨설턴트+전담코치+동료 레이어 |
| Section V 보너스 | RFP에 없는 추가 제안 3-4건 자동 생성 |
| 실행 보장 | "실행을 보장하는 코칭 중심의 체계적인 교육" |
| 자체 도구 브랜딩 | ACT-PRENEURSHIP, DOGS, 6 Dimension — 항상 고유 명칭 |

### 14.3 페이지 설계 공식 (one-page-one-thesis)

```
[컬러 헤더 바]
[서브헤더]
[ONE BOLD 선언적 헤드라인]
[구조화된 시각 자료]
```

### 14.4 운영 구조 표현

```
대표 (최상단) → 사업PM (본부장급, 전담) → 기능별 리더 → 전국 코치진 (300명 pool)
```
→ "전담" 역할 반복 강조, 실제 사진/이름 사용

### 14.5 예산 표현

- 예산은 주인공이 아님 — 마지막, 담백하게
- "프로그램 투입 비율 91.2%" 효율성 프레이밍
- 실비율 60% 이하 강조

### 14.6 pgvector/RAG 판단

현재 시점에서 RAG 불필요:
- IMPACT 18모듈 → 프롬프트 컨텍스트로 충분 (데이터 소량)
- 과거 제안서 2건 → 패턴 이미 메모리에 학습
- **Phase 4에서 과거 제안서 10건+ 축적 시 pgvector 도입 적합**

---

## 15. Planning Agent 시스템 (2026-04-07 신규 결정)

> **별도 상세 문서:** `PLANNING_AGENT_ROADMAP.md` 참조 (실행 시 사용)

### 15.1 핵심 전환

기존 PRD v5.0의 "AI가 도와주는 도구" → **"AI 공동기획자(Co-planner)"**

| 측면 | Before | After |
|------|--------|-------|
| AI 역할 | 검색/생성 도구 | PM 의도까지 캡처하는 공동기획자 |
| 인터랙션 | 1-shot 호출 | 5-10턴 대화형 인터뷰 |
| 품질 목표 | 보통 PM 수준 | 시니어 PM 수준 (95%+) |
| 학습 | 없음 | PMFeedback 기반 자기개선 루프 |

### 15.2 인터뷰 설계 원칙

- **자유 답변** (객관식 ❌)
- **예시 4-5개 제공** — 답변이 어려운 PM 도움
- **"잘 모름" 답변 가능** — Agent가 다른 각도로 재질문
- **진짜 Agent 루프** — state + reasoning + tools + termination

### 15.3 신규 데이터 모델

```
PlanningIntent {
  rfpFacts: { ... }            // RFP에서 추출 (객관)
  strategicContext: {           // PM 인터뷰에서 캡처 (주관)
    whyUs, clientHiddenWants, mustNotFail,
    competitorWeakness, internalAdvantage,
    riskFactors, decisionMakers, pastSimilarProjects
  }
  derivedStrategy: {            // Agent가 종합 후 도출
    keyMessages, differentiators, coachProfile,
    sectionVBonus, riskMitigation
  }
  completeness, confidence
}

AgentSession { history, status }
PMFeedback { action, reason, patternLearned }

Coach 풍부화 필드:
  domainTags, skillTags, strengthSummary,
  idealProjectTypes, searchKeywords, enrichedAt
```

### 15.4 5단계 추천 엔진

| Stage | 작업 |
|-------|------|
| 0 (1회성) | 800명 코치 데이터 풍부화 (Claude 호출, ~$8) |
| 1 | PlanningIntent → Claude → 검색 쿼리 풍부화 |
| 2 | PostgreSQL 정형 필터 (800 → ~200) |
| 3 | 정형 점수 (200 → Top 50) |
| 4 | Claude 의미적 재랭킹 (50 → Top 10 + 이유) |
| 5 | 4중 지원 체계 매핑 + PMFeedback 처리 |

### 15.5 격리 모듈 전략 (인지부하 관리)

**원칙:** Phase 6 전까지 기존 코드 손대지 않음

```
src/lib/planning-agent/         # 격리된 Agent 로직
src/app/(lab)/agent-test/       # 격리된 테스트 UI
src/app/(lab)/coach-finder/     # 격리된 Coach Finder UI
src/app/api/agent/              # 격리된 API
```

각 Phase 끝마다 사용자 직접 검증 → 다음 진행.

### 15.6 6-Phase 로드맵 (12일 분량)

| Phase | 일수 | 영향 | 산출물 |
|-------|------|------|--------|
| 1. Agent 로직 | Day 1-2 | **0** | 7개 신규 파일 |
| 1.5 테스트 UI | Day 2-3 | 0 (신규 라우트) | 채팅 UI |
| 2. 스키마 추가 | Day 3-4 | 최소 (마이그레이션) | 3개 모델 |
| 3. 코치 풍부화 | Day 4-5 | 최소 (컬럼 추가) | 800명 1회 처리 |
| 4. 추천 엔진 | Day 5-7 | 0 (격리 API) | 5단계 추천 |
| 5. UI 임베드 | Day 7-9 | 0 (격리 라우트) | Coach Finder |
| 6. 통합 | Day 9-12 | **여기서 통합** | 메인 파이프라인 |

### 15.7 품질 등급 (Phase 6에서 추가)

| 등급 | 점수 | 의미 |
|------|------|------|
| C | 50점 이하 | 사람이 처음 그릴 수준 |
| B | 50-70 | 보통 PM 수준 |
| **A** | **70-85** | **시니어 PM 수준 ← 우리 목표** |
| S | 85+ | "와, 이런 건 생각 못했네" — 진짜 차별화 |

각 등급별 부족한 부분 자동 안내.

### 15.8 핵심 원칙 (반복)

1. **격리 우선** — Phase 6 전까지 기존 코드 손대지 않음
2. **검증 후 전진** — 각 Phase 끝에 사용자 검증
3. **자유 답변** — 객관식 ❌
4. **진짜 Agent** — 단발 호출 ❌
5. **품질 목표** — 시니어 PM 수준 95%+
