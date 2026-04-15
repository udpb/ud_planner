# A1 + A3 Brief: 스텝 순서 변경 + Module Manifest 도입

## 🎯 Mission (1 sentence)
파이프라인 스텝 렌더링 순서를 `rfp → impact → curriculum → coaches → budget → proposal` 에서 `rfp → curriculum → coaches → budget → impact → proposal` 로 변경하고, 각 스텝(및 planning-agent, pm-guide 예정 모듈)에 `manifest.ts` 파일을 추가하여 모듈 경계를 선언한다.

## 📋 Context

**왜 이 작업이 필요한가.**
- A1: ADR-001 결정사항. 임팩트를 Step 5로 이동 → Activity/Input 자동 추출 기반 마련.
- A3: ADR-002 결정사항. 모듈 이식성·품질 검증·에이전트 브리프의 기반.

**Wave 2 로 분리된 이유.**
- A3 의 manifest 는 `src/lib/pipeline-context.ts` (A2 산출물) 의 타입을 `reads/writes` 에서 import 해야 한다.
- A1 과 A3 둘 다 `src/app/(dashboard)/projects/[id]/` 영역을 건드리므로 충돌 방지를 위해 단일 에이전트 순차 처리.

**무엇이 바뀌는가.**
- `page.tsx` 의 스텝 조건부 렌더링 순서
- `pipeline-nav.tsx` 의 steps 배열 순서 (완료 조건 포함)
- 각 스텝 폴더에 `manifest.ts` 신규 추가
- 실제 컴포넌트 로직은 건드리지 않음 (이번 작업은 순서·메타데이터만)

## ✅ Prerequisites

**Wave 1 완료가 필수:**
1. `src/lib/pipeline-context.ts` 존재 (A2 산출물)
2. `PipelineContext` + 슬라이스 타입들이 export 되어 있음
3. `src/app/api/projects/[id]/pipeline-context/route.ts` GET 핸들러 존재

**기본:**
1. 작업 디렉토리: `c:\Users\USER\projects\ud-ops-workspace`
2. `npm run build` 현재 통과
3. `npm run typecheck` 통과 (A6 스크립트 사용 가능)
4. 다음 파일 존재:
   - `src/app/(dashboard)/projects/[id]/page.tsx`
   - `src/app/(dashboard)/projects/[id]/pipeline-nav.tsx`
   - 6개 스텝 관련 파일: `step-rfp.tsx`, `step-impact.tsx`, `curriculum-board.tsx`, `coach-assign.tsx`, `budget-dashboard.tsx`, `step-proposal.tsx`

실패 시 STOP.

## 📖 Read These Files First

1. `CLAUDE.md` — 디자인 · 커밋 scope
2. `AGENTS.md` — Next.js 16 경고
3. **`docs/decisions/001-pipeline-reorder.md` — A1 의 근거**
4. **`docs/decisions/002-module-manifest-pattern.md` — A3 의 근거**
5. **`docs/architecture/modules.md` §1~§2 — Manifest 타입 형식 + CORE 모듈 표 (reads/writes 정의)**
6. **`docs/architecture/data-contract.md` §1.1~§1.2 — 슬라이스 이름 확인 (manifest reads/writes 에 이 이름 사용)**
7. `src/lib/pipeline-context.ts` — Wave 1 산출물, `PipelineContext` 타입 import 위치
8. `src/app/(dashboard)/projects/[id]/page.tsx` — 스텝 조건부 렌더링 전체 흐름
9. `src/app/(dashboard)/projects/[id]/pipeline-nav.tsx` — steps 배열 구조

## 🎯 Scope

### ✅ You CAN touch
- `src/app/(dashboard)/projects/[id]/page.tsx` — 스텝 렌더링 순서, steps 배열만
- `src/app/(dashboard)/projects/[id]/pipeline-nav.tsx` — 필요 시 (대부분 page.tsx 의 steps 배열만 바꾸면 됨)
- `src/modules/_types.ts` (신규) — `ModuleManifest` 타입 정의
- 각 스텝 폴더에 `manifest.ts` (신규):
  - `src/app/(dashboard)/projects/[id]/step-rfp.manifest.ts`
  - `src/app/(dashboard)/projects/[id]/step-curriculum.manifest.ts` (파일명 매핑은 아래 Task 참조)
  - `src/app/(dashboard)/projects/[id]/step-coaches.manifest.ts`
  - `src/app/(dashboard)/projects/[id]/step-budget.manifest.ts`
  - `src/app/(dashboard)/projects/[id]/step-impact.manifest.ts`
  - `src/app/(dashboard)/projects/[id]/step-proposal.manifest.ts`
- `src/lib/planning-agent/manifest.ts` (신규)

### ❌ You MUST NOT touch
- 각 스텝 컴포넌트 내부 로직 (`step-rfp.tsx` 내부 등)
- `src/lib/pipeline-context.ts` — A2 결과 유지
- `src/app/api/projects/[id]/pipeline-context/route.ts` — A2 결과 유지
- `prisma/schema.prisma`
- `src/components/layout/sidebar.tsx` — A5 영역
- `.github/workflows/*`, `package.json` — A6 영역
- `src/lib/planning-agent/*.ts` — 기존 파일 (manifest.ts 신규만 허용)
- 의존성 추가 금지

## 🛠 Tasks

### Part A1: 스텝 순서 변경

#### Step 1: `page.tsx` 스텝 배열 변경

현재 순서:
```
rfp → impact → curriculum → coaches → budget → proposal
```

변경 후:
```
rfp → curriculum → coaches → budget → impact → proposal
```

**변경 지점:**
- `steps: PipelineStep[]` 배열 (page.tsx 내부 정의 또는 pipeline-nav 로 전달되는 배열)
- 조건부 렌더링 블록 순서 (step === 'rfp' ... step === 'impact' 블록들)
- 기본 step (URL param 없을 때) 은 `'rfp'` 유지
- 각 스텝의 `done` 판정은 기존 로직 그대로

**steps 배열 예상 형태:**
```typescript
const steps: PipelineStep[] = [
  { key: 'rfp', label: 'RFP 분석', sublabel: '+ 기획 방향', done: !!project.rfpParsed },
  { key: 'curriculum', label: '커리큘럼', done: project.curriculum.length > 0 },
  { key: 'coaches', label: '코치', done: project.coachAssignments.length > 0 },
  { key: 'budget', label: '예산 + SROI', done: !!project.budget },
  { key: 'impact', label: '임팩트', done: !!project.logicModel },
  { key: 'proposal', label: '제안서', done: project.proposalSections.length >= 7 },
]
```

sublabel 은 기존값 유지하거나 새로 짤 수 있음 (너무 길지 않게). 아이콘/컬러 변경 금지.

#### Step 2: 조건부 렌더링 블록 순서

`step === 'rfp'` 블록은 그대로 맨 위.
그다음 `step === 'curriculum'` → `'coaches'` → `'budget'` → `'impact'` → `'proposal'` 순.
블록 내부 JSX 는 **손대지 않음**. 단순 순서만 재배치.

#### Step 3: URL 쿼리 호환성

기존 북마크 `?step=impact` 가 여전히 동작해야 함. URL param 값 자체는 변경하지 않음 (`'impact'` 문자열 유지). 단지 렌더링 순서만 바뀜.

### Part A3: Module Manifest 도입

#### Step 4: `ModuleManifest` 타입 정의

`src/modules/_types.ts` (신규):

```typescript
import type { PipelineContext } from "@/lib/pipeline-context"

export type ModuleLayer = "core" | "asset" | "ingestion" | "support"

export interface ModuleManifest {
  name: string
  layer: ModuleLayer
  version: string
  owner: string

  reads: {
    context?: Array<keyof PipelineContext>
    assets?: string[]
  }
  writes: {
    context?: Array<keyof PipelineContext>
  }

  api?: string[]
  ui?: string

  quality?: {
    checks?: string[]
    minScore?: number
  }
}
```

**폴더 생성:** `src/modules/` 폴더만 생성. 이번 브리프에서 파일 재배치 ❌. manifest 파일은 각 스텝 파일 옆에 co-locate.

#### Step 5: 각 CORE 모듈 manifest (6개)

파일 위치: 각 스텝 컴포넌트 파일 옆 (`.manifest.ts` 접미사).

**매핑표 (기존 파일 → manifest 파일):**
| 기존 컴포넌트 | manifest 파일 | manifest.name |
|--------------|---------------|---------------|
| `step-rfp.tsx` | `step-rfp.manifest.ts` | `rfp-planning` |
| `curriculum-board.tsx` | `step-curriculum.manifest.ts` | `curriculum-design` |
| `coach-assign.tsx` | `step-coaches.manifest.ts` | `coach-matching` |
| `budget-dashboard.tsx` | `step-budget.manifest.ts` | `budget-sroi` |
| `step-impact.tsx` | `step-impact.manifest.ts` | `impact-chain` |
| `step-proposal.tsx` | `step-proposal.manifest.ts` | `proposal-generation` |

**각 manifest 내용 — modules.md §2 CORE MODULES 표 그대로:**

예시 (rfp-planning):
```typescript
import type { ModuleManifest } from "@/modules/_types"

export const manifest: ModuleManifest = {
  name: "rfp-planning",
  layer: "core",
  version: "0.1.0",
  owner: "TBD",
  reads: {
    context: [],
    assets: ["channel-presets", "winning-patterns", "past-projects"],
  },
  writes: {
    context: ["rfp", "strategy"],
  },
  api: ["POST /api/ai/parse-rfp", "POST /api/ai/planning-direction"],
  ui: "src/app/(dashboard)/projects/[id]/step-rfp.tsx",
  quality: {
    checks: [],
  },
}
```

**나머지 5개** 는 [docs/architecture/modules.md](../../../docs/architecture/modules.md) §2 의 표 그대로. `reads.context` / `writes.context` 은 data-contract.md §1.1 에 정의된 슬라이스 키(`"rfp" | "strategy" | "curriculum" | "coaches" | "budget" | "impact" | "proposal" | "research"`) 중에서만.

**주의:** `keyof PipelineContext` 는 `"meta"`, `"projectId"`, `"version"` 도 포함. 이것들은 reads/writes 에 쓰지 말 것 (슬라이스 아님). 문자열로 적되, 실제 슬라이스 키만 써야 타입 체크 시 에러 없음.
→ 더 안전한 방법: `ModuleManifest.reads.context` 타입을 `Array<keyof PipelineContext>` 대신 슬라이스 이름 유니온 타입으로 좁힐 수 있음. 단, A2 가 만든 타입 구조를 우선 확인 후 조정. 에러가 나면 String 배열로 느슨하게 시작 후 메인에 보고.

#### Step 6: planning-agent manifest

`src/lib/planning-agent/manifest.ts` (신규):

```typescript
import type { ModuleManifest } from "@/modules/_types"

export const manifest: ModuleManifest = {
  name: "planning-agent",
  layer: "support",
  version: "0.2.0",
  owner: "TBD",
  reads: {
    context: ["rfp"],
    assets: ["channel-presets", "past-projects"],
  },
  writes: {
    context: ["strategy"],
  },
  api: ["POST /api/agent/start", "POST /api/agent/respond"],
  ui: "src/app/(lab)/agent-test/page.tsx",
  quality: {
    checks: [],
  },
}
```

(다른 기존 support 모듈이 현재 없으면 pm-guide / predicted-score manifest 는 이번에 만들지 않음 — 그 모듈들이 Phase D 에 실제 생기면 그때 추가.)

#### Step 7: 검증

```bash
npm run typecheck
npm run build
```

모두 통과해야 완료. manifest 파일들이 typecheck 를 통과하는지 확인 (특히 `keyof PipelineContext` 제약).

개발 서버에서 프로젝트 상세 페이지 로드 → 스텝 네비게이션 순서 육안 확인.

## 🔒 Tech Constraints

- **컴포넌트 내부 로직 변경 금지** — 이번 작업은 순서·메타데이터만
- **파일 재배치 ❌** — manifest 는 기존 파일 옆 co-locate
- **`src/modules/_types.ts` 만 신규 폴더** — 나머지 manifest 는 기존 스텝 파일 옆
- **URL param 값 유지** — `?step=impact` 는 여전히 유효
- **의존성 추가 금지**

## ✔️ Definition of Done

### A1
- [ ] `page.tsx` 스텝 배열 순서 변경 (rfp → curriculum → coaches → budget → impact → proposal)
- [ ] 조건부 렌더링 블록 순서 재배치
- [ ] URL `?step=impact` 여전히 동작
- [ ] 각 스텝 내부 컴포넌트 변경 없음 (git diff 확인)

### A3
- [ ] `src/modules/_types.ts` — `ModuleManifest` 타입 정의
- [ ] 6개 CORE manifest 파일 생성 (각 스텝 옆 co-locate)
- [ ] `src/lib/planning-agent/manifest.ts` 생성
- [ ] 각 manifest 의 reads/writes 가 modules.md §2 표와 일치
- [ ] 각 manifest.reads.context / writes.context 가 data-contract.md §1.1 의 슬라이스 이름만 사용

### 공통
- [ ] `npm run typecheck` 통과
- [ ] `npm run build` 통과
- [ ] Scope ❌ 목록의 파일들 건드리지 않음

## 📤 Return Format

```
A1+A3 완료.

### A1 스텝 순서 변경
변경 파일:
- src/app/(dashboard)/projects/[id]/page.tsx
- src/app/(dashboard)/projects/[id]/pipeline-nav.tsx [변경 여부]

신 순서: rfp → curriculum → coaches → budget → impact → proposal
URL 쿼리 호환: ✅ (`?step=impact` 여전히 작동)
컴포넌트 내부 변경: 없음

### A3 Module Manifest
생성 파일:
- src/modules/_types.ts
- src/app/(dashboard)/projects/[id]/step-rfp.manifest.ts
- ... (6개 CORE 전부 열거)
- src/lib/planning-agent/manifest.ts

manifest 검증:
- rfp-planning: reads=[...], writes=[...] (modules.md 일치: ✅)
- ... (각 모듈별)

타입 안전성:
- keyof PipelineContext 제약: [성공 / 문자열로 완화했으면 이유]

### 검증
- npm run typecheck: ✅
- npm run build: ✅
- 스텝 순서 육안 확인: [yes/no]

주의사항:
- [있다면]

후속:
- pm-guide / predicted-score manifest 는 Phase D 에 해당 모듈 생성 시 추가
- src/modules/ 로의 실제 폴더 재배치는 Phase F (ADR-002)
```

## 🚫 Do NOT

- 스텝 컴포넌트 내부 JSX / 로직 수정 금지
- 파일 재배치 금지 (manifest 는 co-locate)
- 사이드바 수정 금지 (A5 영역)
- `src/lib/pipeline-context.ts` 수정 금지 (A2 영역)
- `prisma/schema.prisma` 수정 금지
- 새 의존성 추가 금지

## 💡 Hints

- `page.tsx` 의 조건부 렌더링이 크면 순서 재배치만으로도 diff 가 커 보일 수 있음 — 코드 블록 이동이지 로직 변경은 아님
- manifest 파일은 순수 객체 export 만 — React 컴포넌트 아님
- `ModuleManifest.reads.context` 타입을 정확히 하려면 `PipelineContext` 의 슬라이스 키만 뽑는 유틸 타입이 필요할 수도. 일단 느슨하게 시작해도 됨:
  ```typescript
  type ContextSlice =
    | "rfp" | "strategy" | "research"
    | "curriculum" | "coaches" | "budget" | "impact" | "proposal"
  // reads.context?: ContextSlice[]
  ```
  이렇게 별도 타입을 `_types.ts` 에 둬도 좋음
- A2 가 만든 `src/lib/pipeline-context.ts` 를 먼저 읽어서 실제 슬라이스 키 이름을 확인

## 🏁 Final Note

이 작업 후 재설계의 Phase A 골격이 완성됨. 스텝 순서는 프론트에서 바뀌고, 각 모듈은 자기 계약을 선언한 상태. 실제 비즈니스 로직 개선은 Phase B 부터. **이 브리프에서 "조금만 더 개선" 유혹을 참자** — 딱 순서 + 메타데이터까지만.
