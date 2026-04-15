# A2 Brief: PipelineContext 타입 + API

## 🎯 Mission (1 sentence)
`PipelineContext` 타입을 `src/lib/pipeline-context.ts`에 정의하고, `GET /api/projects/[id]/pipeline-context` 엔드포인트를 구현하여 한 프로젝트의 모든 스텝 산출물을 단일 객체로 반환한다.

## 📋 Context

**왜 이 작업이 필요한가.** 파이프라인 재설계의 핵심 계약(contract). 모든 CORE 모듈이 이 타입을 읽고 쓰고, 이 API를 통해 이전 스텝 데이터를 받는다. 이게 없으면 Wave 2의 Manifest 작업도 진행 불가.

**무엇이 없는 상태인가.** 현재 각 스텝은 Prisma 쿼리를 개별적으로 호출 (project.rfpParsed, curriculum 배열 등). 이걸 한 번에 조합한 "파이프라인 컨텍스트"가 없다.

**Next.js 16 주의:** AGENTS.md에 명시. `node_modules/next/dist/docs/` 에서 App Router + dynamic route 관련 문서를 참고. 특히 `params` 의 async 변경 여부 확인.

## ✅ Prerequisites
1. 작업 디렉토리: `c:\Users\USER\projects\ud-ops-workspace`
2. `npm run build` 가 현재 main에서 통과
3. PostgreSQL이 Docker로 실행 중, Prisma 연결 정상
4. `prisma/schema.prisma` 에 Project / CurriculumItem / CoachAssignment / Budget / BudgetItem / ProposalSection 모델이 존재
5. `src/lib/prisma.ts` (싱글톤 prisma client) 존재

실패 시 STOP.

## 📖 Read These Files First (in order)

1. `CLAUDE.md` — 프로젝트 컨벤션
2. `AGENTS.md` — Next.js 16 경고
3. **`docs/architecture/data-contract.md` — 이 작업의 사양서 (가장 중요)**
4. `docs/architecture/modules.md` — 모듈 4계층 맥락 (§2 CORE MODULES의 reads/writes 표)
5. `prisma/schema.prisma` — 다음 모델 확인:
   - `Project` (기존 필드 전체 + 어떤 필드가 RfpSlice/Impact로 매핑되는지 data-contract §3 표 참조)
   - `CurriculumItem`, `CoachAssignment`, `Budget`, `BudgetItem`, `ProposalSection`
   - `PlanningIntentRecord` (StrategySlice 저장소)
6. `src/lib/prisma.ts` — prisma client import 패턴
7. `src/app/api/projects/[id]/route.ts` — 기존 프로젝트 GET 패턴 (params 처리 참고)
8. `src/lib/claude.ts` 의 타입 정의들 — 재사용 가능한 하위 타입 (RfpParsed 등)

## 🎯 Scope

### ✅ You CAN touch
- `src/lib/pipeline-context.ts` (신규) — 타입 정의 + 조합 헬퍼
- `src/app/api/projects/[id]/pipeline-context/route.ts` (신규) — GET 엔드포인트
- `src/types/shared/*.ts` (신규, 필요 시) — 여러 모듈이 공유할 하위 타입

### ❌ You MUST NOT touch
- `prisma/schema.prisma` — 스키마 변경 금지 (A4가 Ingestion 필드 추가 중일 수 있음)
- `src/app/(dashboard)/projects/[id]/*.tsx` — 스텝 UI 파일 (Wave 2)
- `src/components/layout/sidebar.tsx` — A5 영역
- `src/lib/planning-agent/*` — 다른 트랙
- 기존 API 라우트 수정 금지 (새 라우트만 추가)
- `package.json` — 의존성 추가 금지

## 🛠 Tasks

### Step 1: 타입 파일 뼈대 생성

`src/lib/pipeline-context.ts` 생성.

**포함 내용:**
- `PipelineContext` 최상위 인터페이스 (data-contract.md §1.1 그대로)
- 슬라이스 타입 7개: `RfpSlice`, `StrategySlice`, `CurriculumSlice`, `CoachesSlice`, `BudgetSlice`, `ImpactSlice`, `ProposalSlice` (data-contract.md §1.2 전체)
- 하위 타입 (EvalStrategy, SimilarProject, Track, CurriculumSession, CoachAssignment, BudgetStructure, BudgetWarning, SroiForecast, BenchmarkResult, LogicModel, MeasurementItem, ProposalSection, ScoreSimulationResult, RevisionEntry, RuleValidationResult, ResearchItem 등)
- 이미 `src/lib/claude.ts` 등 기존 코드에 정의된 하위 타입이 있으면 **그것을 re-export**하여 SSoT 유지. 중복 정의 금지.
- `meta` 필드 포함

**`src/types/shared/` 활용 원칙:**
- 여러 슬라이스가 쓰는 타입(예: `CurriculumSession`)은 `src/types/shared/curriculum.ts` 등으로 분리 가능
- 단일 슬라이스 전용은 `pipeline-context.ts` 내부 유지

### Step 2: 조합 헬퍼 함수

`src/lib/pipeline-context.ts` 에 `buildPipelineContext(projectId: string): Promise<PipelineContext>` 를 추가.

**구현:**
- Prisma로 Project + 관계 테이블들 조회 (병렬 Promise.all)
- data-contract.md §3 의 매핑 표 대로 슬라이스별로 조립
- 슬라이스가 비어있으면 `undefined` (빈 객체 아님)
- `meta.lastUpdatedAt` = Project.updatedAt
- `meta.lastUpdatedBy` = 지금은 `"system"` 하드코딩 OK (나중에 확장)
- `meta.lastUpdatedModule` = 지금은 `"unknown"` OK
- `meta.projectType`, `meta.channelType` = Project 필드에서 (없으면 기본값 `"B2G"`, `"bid"`)
- `meta.predictedScore` = Project.predictedScore (필드가 없으면 `undefined`)

**주의:** 스키마에 아직 없는 필드(proposalBackground, proposalConcept, keyPlanningPoints, evalStrategy, predictedScore, designRationale, measurementPlan)는 **현재 undefined로 처리**. 해당 필드 마이그레이션은 다른 Phase에서 진행 예정. 타입에는 있지만 런타임에는 없는 상태 허용.

### Step 3: API 라우트

`src/app/api/projects/[id]/pipeline-context/route.ts` 생성.

**구현:**
- Next.js 16 App Router 규칙 준수 (params async 여부 확인)
- `GET` 핸들러
- NextAuth 세션 체크 (`auth()` from `src/lib/auth.ts` 패턴 — 기존 API 라우트 참고)
- 비인증 시 401
- `buildPipelineContext(projectId)` 호출 후 JSON 반환
- 예외 시 500 + `{ error: string }`

### Step 4: 검증

```bash
npm run build
```

빌드 통과해야 완료. 런타임 테스트는 optional (DB에 프로젝트가 있다면 `curl` 또는 브라우저로 확인 가능).

## 🔒 Tech Constraints

- **Next.js 16 App Router** — `params` 처리는 현재 코드베이스 기존 API 라우트와 동일 패턴 사용
- **TypeScript strict** — any 금지, 명확한 타입
- **Prisma client** — `src/lib/prisma.ts` 의 싱글톤만 사용, 새로 생성 금지
- **의존성 추가 금지**
- **기존 하위 타입 재사용** — `src/lib/claude.ts`, `src/types/*` 에 이미 정의된 타입은 import해서 re-export

## ✔️ Definition of Done

- [ ] `src/lib/pipeline-context.ts` 에 `PipelineContext` + 7개 슬라이스 타입 + 하위 타입 정의됨
- [ ] `buildPipelineContext(projectId)` 함수 동작 (Prisma 조회 + 슬라이스 조립)
- [ ] `src/app/api/projects/[id]/pipeline-context/route.ts` GET 핸들러 구현됨
- [ ] NextAuth 인증 체크 포함됨
- [ ] `npm run build` 0 에러 통과
- [ ] 기존 API·UI 코드 건드리지 않음 (git diff로 확인)
- [ ] data-contract.md §1.1 / §1.2 / §3 과 타입·매핑이 일치

## 📤 Return Format

메인에 돌려줄 때:

```
A2 PipelineContext 완료.

생성 파일:
- src/lib/pipeline-context.ts (X줄)
- src/app/api/projects/[id]/pipeline-context/route.ts (X줄)
- src/types/shared/*.ts (있다면)

타입 정의:
- PipelineContext + 7 슬라이스 + N개 하위 타입
- 재사용한 기존 타입: [목록]

검증:
- npm run build: ✅
- typecheck: ✅

data-contract.md 와의 일치:
- §1.1 PipelineContext: ✅
- §1.2 슬라이스: [확인된 것 / 주의사항]
- §3 DB 매핑: [확인된 것 / 스키마에 없는 필드는 undefined 처리]

주의사항 / 발견한 이슈:
- [있다면]

다음 Wave의 A3 이 이 타입을 import해서 manifest.reads/writes에 사용 예정.
```

## 🚫 Do NOT

- 스키마 마이그레이션 하지 말 것 (A4가 병행 중)
- 새 의존성 추가 금지
- 기존 파일 수정 금지 — 오직 신규 파일
- 런타임 슬라이스 병합 로직을 너무 복잡하게 만들지 말 것. 단순 매핑으로 충분
- 검증되지 않은 추측성 필드 추가 금지 — data-contract.md 기준

## 💡 Hints

- 스키마에 `designRationale`, `evalStrategy`, `measurementPlan` 등 신규 필드가 아직 없으면 Prisma 타입에서 에러 날 수 있음 → `as any` 안 쓰고 optional chain과 undefined 처리로 해결
- Project 단일 조회 후 관계 테이블 병렬 조회가 성능상 유리
- NextAuth `auth()` 함수는 서버 컴포넌트 / 라우트 핸들러에서 `await auth()` 패턴
- `src/types/shared/` 가 없으면 그냥 `pipeline-context.ts` 안에 다 넣어도 OK (초기에는 단순함 우선)

## 🏁 Final Note

이 작업은 전체 재설계의 척추. 타입이 틀어지면 나머지 모든 작업이 오염된다. 의심나는 부분은 STOP → 메인에 문의. 특히 data-contract.md 와 불일치가 보이면 반드시 보고.
