# C4 Brief: DataFlowBanner 배치 — 모든 스텝에 이전 스텝 요약

## 🎯 Mission (1 sentence)
각 `step-*.tsx` 상단에 기존 `DataFlowBanner` 컴포넌트를 배치하여 "이전 스텝에서 확정된 핵심 결정" 을 PM 이 즉시 인지하게 만들고, 각 스텝이 `PipelineContext` 를 props 로 받도록 `page.tsx` 와 컴포넌트 시그니처 업데이트.

## 📋 Context

**왜 이 작업이 필요한가.**
- Phase C1~C3 에서 AI 프롬프트에는 이전 스텝 데이터가 주입됨. 그러나 **PM 의 화면** 에는 "지금 무엇을 참조하고 있는지" 표시 없음
- PM 이 Step 3 작업하면서 Step 1 에서 무엇을 확정했는지 까먹음 → 흐름 끊김
- `src/components/projects/data-flow-banner.tsx` 가 이미 존재 (Phase A current-state-audit 에서 UPGRADE 판정됨)

**스텝별 배너 내용 (이전 스텝의 핵심 3~5개 항목):**

| 스텝 | 표시할 이전 결정 |
|------|---------------|
| **rfp (Step 1)** | — (첫 스텝, 배너 없음) |
| **curriculum (Step 2)** | Step 1: 제안 컨셉 · 핵심 포인트 3개 · 평가 최고배점 |
| **coaches (Step 3)** | Step 2: 세션 수 · Action Week 수 · 트랙 수 · (Step 1 간결 요약) |
| **budget (Step 4)** | Step 2: 세션 수 · Step 3: 코치 수·총 사례비 |
| **impact (Step 5)** | Step 2: 세션 수 · Step 3: 코치 · Step 4: 예산·SROI (있으면) + "Activity 자동 추출됨" 알림 |
| **proposal (Step 6)** | Step 1~5 모든 확정 핵심 (컨셉·회차·코치·예산·Impact Goal) |

**매칭 필드 (`DataFlowBanner` 의 `items`):**
- `label`: 무엇인지 (예: "제안 컨셉")
- `value`: 값 (예: "실행 보장형")
- `matched`: 실제로 현재 스텝 작업에 반영됐는지
- `detail`: 미매칭일 때 안내 (예: "Step 1 먼저 확정")

## ✅ Prerequisites (Wave 1 완료 필수)
1. Wave 1 (C1 + C2 + C3 + C5) 완료, typecheck/build 통과
2. `src/lib/pipeline-context.ts` · `buildPipelineContext` 동작
3. `src/components/projects/data-flow-banner.tsx` 존재
4. 각 `step-*.tsx` 및 `page.tsx` 존재

실패 시 STOP.

## 📖 Read These Files First

1. `CLAUDE.md` · `AGENTS.md`
2. **`.claude/skills/ud-design-system/SKILL.md`** — 배너 배치·컬러·타이포
3. `src/components/projects/data-flow-banner.tsx` 전체 — props 구조 확인
4. `src/app/(dashboard)/projects/[id]/page.tsx` — 각 스텝 렌더링 현재 구조
5. `src/app/(dashboard)/projects/[id]/step-rfp.tsx` — Phase B B4 구현 (initialRfpSlice 패턴 참고)
6. 각 step 컴포넌트 (`curriculum-board`, `coach-assign`, `budget-dashboard`, `step-impact`, `step-proposal`) 현재 props
7. `src/lib/pipeline-context.ts` — 슬라이스 타입
8. `src/lib/eval-strategy.ts` (B3/C 산출) — `sectionLabel()` 재사용

## 🎯 Scope

### ✅ You CAN touch
- `src/app/(dashboard)/projects/[id]/page.tsx` — 각 `<StepXxx>` 에 PipelineContext 일부를 props 로 전달
- `src/app/(dashboard)/projects/[id]/curriculum-board.tsx` — 상단에 DataFlowBanner + prop 추가
- `src/app/(dashboard)/projects/[id]/coach-assign.tsx` — 동일
- `src/app/(dashboard)/projects/[id]/budget-dashboard.tsx` — 동일
- `src/app/(dashboard)/projects/[id]/step-impact.tsx` — 동일 + "Activity 자동 추출됨" 배너
- `src/app/(dashboard)/projects/[id]/step-proposal.tsx` — 동일 (전체 PipelineContext 받음)
- (각 manifest 의 reads.context 확인/보완)

### ❌ You MUST NOT touch
- `step-rfp.tsx` — B4 결과 유지 (첫 스텝, 배너 불필요)
- `src/components/projects/data-flow-banner.tsx` — 기존 컴포넌트 유지 (내부 수정 금지, 사용만)
- `src/lib/**` — C1~C3/C5 결과 유지, import 만
- `src/app/api/**` — Wave 1 결과 유지
- `prisma/schema.prisma`
- `package.json`
- `.claude/skills/**`, `docs/**`

## 🛠 Tasks

### Step 1: page.tsx — PipelineContext 로드 + props 전달

현재 `page.tsx` 는 `prisma.project.findUnique` 로 직접 프로젝트를 읽음. 여기에 `buildPipelineContext` 를 **추가 호출** 하여 각 스텝에 slice 를 전달:

```typescript
// page.tsx 상단 추가
import { buildPipelineContext } from '@/lib/pipeline-context'

// async function 내부
const [project, context] = await Promise.all([
  getProject(id),
  buildPipelineContext(id),
])
```

**주의:** 기존 `project` 객체는 UI 렌더용으로 계속 사용. `context` 는 각 스텝에 전달. 중복 쿼리지만 짧게 병렬이므로 수용 가능. (Phase F 에서 단일화 고려)

**각 스텝 호출부 업데이트:**

```tsx
{step === 'curriculum' && (
  <CurriculumBoard
    projectId={project.id}
    initialItems={...}              // 기존 유지
    rfpSlice={context.rfp}           // 신규
    strategySlice={context.strategy} // 신규
  />
)}

{step === 'coaches' && (
  <CoachAssignBoardOrWhatever
    projectId={project.id}
    assignedCoachIds={...}
    rfpSlice={context.rfp}           // 신규
    curriculumSlice={context.curriculum}  // 신규
  />
)}

{step === 'budget' && (
  <BudgetDashboard
    projectId={project.id}
    initialBudget={...}
    curriculumSlice={context.curriculum}  // 신규
    coachesSlice={context.coaches}        // 신규
  />
)}

{step === 'impact' && (
  <StepImpact
    projectId={project.id}
    rfpParsed={...}
    initialLogicModel={...}
    curriculumSlice={context.curriculum}   // 신규
    coachesSlice={context.coaches}         // 신규
    budgetSlice={context.budget}           // 신규
  />
)}

{step === 'proposal' && (
  <StepProposal
    projectId={project.id}
    hasLogicModel={...}
    initialSections={...}
    evalCriteria={...}
    context={context}                       // 전체 주입
  />
)}
```

`step-rfp.tsx` 호출부는 B4 결과 그대로 유지.

### Step 2: 각 스텝 컴포넌트에 DataFlowBanner 추가

패턴 (curriculum-board 예시):

```tsx
'use client'
import { DataFlowBanner } from '@/components/projects/data-flow-banner'
import type { RfpSlice, StrategySlice } from '@/lib/pipeline-context'
import { sectionLabel } from '@/lib/eval-strategy'

interface CurriculumBoardProps {
  // 기존 props 유지
  ...
  rfpSlice?: RfpSlice
  strategySlice?: StrategySlice
}

export function CurriculumBoard({ ..., rfpSlice, strategySlice }: CurriculumBoardProps) {
  const bannerItems = buildCurriculumBannerItems(rfpSlice, strategySlice)

  return (
    <div className="space-y-4">
      <DataFlowBanner
        fromStep="Step 1"
        toStep="Step 2"
        items={bannerItems}
      />
      {/* 기존 UI 그대로 */}
    </div>
  )
}

function buildCurriculumBannerItems(rfp?: RfpSlice, strategy?: StrategySlice) {
  if (!rfp) return []
  return [
    {
      label: '제안 컨셉',
      value: rfp.proposalConcept ?? '미확정',
      matched: !!rfp.proposalConcept,
      detail: rfp.proposalConcept ? undefined : 'Step 1 에서 컨셉을 확정하세요',
    },
    {
      label: '핵심 포인트',
      value: rfp.keyPlanningPoints?.[0] ?? '미확정',
      matched: (rfp.keyPlanningPoints?.length ?? 0) >= 3,
    },
    {
      label: '평가 최고배점',
      value: rfp.evalStrategy?.topItems?.[0]
        ? `${rfp.evalStrategy.topItems[0].name} (${rfp.evalStrategy.topItems[0].points}점)`
        : '미분석',
      matched: !!rfp.evalStrategy?.topItems?.[0],
    },
  ]
}
```

**기존 컴포넌트 로직 변경 금지** — 배너를 상단에 덧붙이기만.

### Step 3: 스텝별 배너 설계 (권장 items)

**curriculum (Step 2):** RfpSlice 에서 3~4개
- 제안 컨셉 / 제안 배경 (200자 요약) / 핵심 포인트 3개 중 첫 번째 / 평가 최고배점

**coaches (Step 3):** Step 2 중심 + Step 1 간결
- Step 2: 세션 수 · Action Week 수 · 1:1 코칭 수 · 설계근거 유무
- Step 1: 제안 컨셉 (한 줄)

**budget (Step 4):** Step 2/3 중심
- Step 2: 총 회차 · 총 교육시간 (∑ durationHours)
- Step 3: 배정 코치 수 · 총 사례비

**impact (Step 5):** Step 2/3/4 + **특별 배너 "Activity 자동 추출됨"**
```tsx
{autoExtractedBanner && (
  <div className="rounded-md bg-primary/10 border border-primary/30 p-3 text-sm">
    <span className="font-medium text-primary">자동 추출됨:</span> 이 Logic Model 의
    Activity 는 Step 2 커리큘럼에서, Input 은 Step 3 코치 + Step 4 예산에서
    자동으로 추출되었습니다. PM 은 Outcome/Impact 만 검토·편집하세요.
  </div>
)}
```

**proposal (Step 6):** 전체 요약 (접기 가능 UI 고려 — 정보 많음)

### Step 4: manifest.reads.context 업데이트

각 manifest 가 실제로 읽는 슬라이스를 반영:

- `step-curriculum.manifest.ts`: `['rfp', 'strategy']`
- `step-coaches.manifest.ts`: `['rfp', 'curriculum']`
- `step-budget.manifest.ts`: `['curriculum', 'coaches']`
- `step-impact.manifest.ts`: `['curriculum', 'budget', 'coaches', 'rfp']`
- `step-proposal.manifest.ts`: `['rfp', 'strategy', 'curriculum', 'coaches', 'budget', 'impact']`

이미 맞게 되어 있으면 수정 불필요.

### Step 5: Step 5 (impact) 특수 처리 — Activity 자동 추출 표시

C2 의 `buildLogicModel` 이 자동 추출된 Activity 를 반환하므로, UI 는:
- 기존 수동 입력 UI **유지** (B4 원칙: C4 에서 UI 재설계 아님)
- 배너에 "Activity 는 Step 2 커리큘럼 세션에서 자동 추출됨" 고지 추가
- Phase E4 에서 step-impact.tsx 전면 재작업

즉 **C4 범위에서 step-impact 는 배너만 추가**, 내부 편집 UI 는 Phase E4 에서 다룸. 과잉 변경 금지.

### Step 6: 검증

```bash
npm run typecheck
npm run build
```

**특히 확인:**
- 각 스텝 컴포넌트의 기존 prop 호환성 (optional 추가이므로 기존 호출자 깨지지 않음)
- 배너 렌더링 (SSR 에러 없이)
- 디자인 시스템 SKILL 준수 (컬러·타이포)

## 🔒 Tech Constraints

- **디자인 시스템 엄격 준수** — SKILL.md 참조, shadcn / lucide 만
- **브랜드 보이스 SKILL §11 금지 목록** 위반 없음 (배너 문구 포함)
- **기존 UI 로직 변경 ❌** — 배너 추가 + prop 확장만
- **타입 안전** — 새로 추가되는 코드에 `any` 금지 (단, 기존 `as any` 캐스트는 legacy 경로 warn 상태라 유지 가능)
- **의존성 추가 금지**
- **단일 에이전트** — 여러 파일 동시 수정하므로 커밋 충돌 방지 위해 순차

## ✔️ Definition of Done

- [ ] `page.tsx` 에서 `buildPipelineContext` 호출, 각 스텝에 slice props 전달
- [ ] `curriculum-board.tsx` 상단 DataFlowBanner (Step 1 → Step 2 항목 3~4개)
- [ ] `coach-assign.tsx` 관련 컴포넌트 상단 배너 (Step 1/2 → Step 3)
- [ ] `budget-dashboard.tsx` 상단 배너 (Step 2/3 → Step 4)
- [ ] `step-impact.tsx` 상단 배너 (Step 2/3/4 → Step 5) + "자동 추출됨" 알림
- [ ] `step-proposal.tsx` 상단 배너 (Step 1~5 요약)
- [ ] 각 manifest.reads.context 정합성 확인 (필요 시 보완)
- [ ] `step-rfp.tsx` 미수정 (B4 결과 유지)
- [ ] `data-flow-banner.tsx` 미수정 (기존 컴포넌트 활용)
- [ ] typecheck · build 통과
- [ ] 디자인 시스템 SKILL · 브랜드 보이스 SKILL 준수
- [ ] 배너에 sonner/alert 사용 없음 (순수 표시용)

## 📤 Return Format

```
C4 DataFlowBanner 배치 완료.

변경 파일:
- src/app/(dashboard)/projects/[id]/page.tsx (buildPipelineContext 호출 + slice 전달)
- src/app/(dashboard)/projects/[id]/curriculum-board.tsx (배너 + props)
- src/app/(dashboard)/projects/[id]/coach-assign.tsx (배너 + props)
- src/app/(dashboard)/projects/[id]/budget-dashboard.tsx (배너 + props)
- src/app/(dashboard)/projects/[id]/step-impact.tsx (배너 + 자동추출 알림)
- src/app/(dashboard)/projects/[id]/step-proposal.tsx (배너 + context prop)
- src/app/(dashboard)/projects/[id]/step-curriculum.manifest.ts (reads 확인)
- src/app/(dashboard)/projects/[id]/step-coaches.manifest.ts (reads 확인)
- src/app/(dashboard)/projects/[id]/step-budget.manifest.ts (reads 확인)
- src/app/(dashboard)/projects/[id]/step-impact.manifest.ts (reads 확인)
- src/app/(dashboard)/projects/[id]/step-proposal.manifest.ts (reads 확인)

DataFlowBanner 배치:
- Step 2 curriculum: 컨셉·핵심포인트·평가배점
- Step 3 coaches: 세션수·Action Week·컨셉 (간결)
- Step 4 budget: 회차·교육시간·코치수·사례비
- Step 5 impact: 세션·코치·예산 + "Activity 자동 추출됨" 강조
- Step 6 proposal: 1~5 요약 (접기 고려)

step-rfp.tsx 미변경 (첫 스텝, 배너 불필요 — B4 결과 유지).

검증:
- typecheck ✅
- build ✅
- 디자인 SKILL 준수 ✅

주의 / 이슈:
- page.tsx 의 getProject + buildPipelineContext 이중 쿼리 (Phase F 단일화 예정)
- step-impact 는 배너만 — 내부 편집 UI 재작업은 Phase E4
- step-proposal 배너는 정보량 많아 접기 UI 고려 (현재는 펼침)

후속:
- Phase D3 pm-guide 가 배너와 함께 우측 패널 보강
- Phase E4 step-impact 전면 재작업 시 배너 통합
- Phase E5 IMPACT 모듈 자동 추천 UI 도 배너와 같은 패턴
```

## 🚫 Do NOT

- `step-rfp.tsx` 수정 금지 (B4 유지)
- `data-flow-banner.tsx` 내부 로직 수정 금지 (기존 컴포넌트 그대로)
- 각 스텝 컴포넌트 **기존 UI 로직 수정 금지** — 배너 + prop 확장만
- `src/lib/**` 수정 금지 (C1~C3 Wave 1 결과)
- API route 수정 금지
- Prisma / 의존성 추가 금지
- 브랜드 §11 금지 표현 배너에 사용 금지

## 💡 Hints

- 배너 항목이 너무 많으면 (5개+) 가독성 저하 — 3~4개 권장
- `matched: false` 항목은 시각적으로 경고색 (기존 data-flow-banner.tsx 의 amber/green 분기 그대로)
- `rfpSlice?.proposalConcept ?? '미확정'` fallback 반드시
- Step 5 의 "자동 추출됨" 알림은 `bg-primary/10 border-primary/30` 로 강조 (SKILL §2 Action Orange 10-15% 규칙 준수)
- `sectionLabel(topItem.section)` 으로 섹션 이름 한국어화 (예: "교육 커리큘럼")
- `step-proposal.tsx` 의 context prop 은 타입이 크므로 `PipelineContext` 전체 대신 필요한 슬라이스만 분리 전달도 가능 — 선택

## 🏁 Final Note

UI 변경이 많아 보이지만 각 파일 변경은 **최소 (배너 + prop)**. 데이터 흐름이 화면으로 드러나는 순간 PM 이 "진짜 파이프라인" 이라고 체감. 과도한 UI 변경 유혹 참고, 정확히 배너 + 자동추출 알림 + prop 연결까지만. Phase E4/D3 가 후속.
