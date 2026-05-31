# D4 Brief: predicted-score 모듈 — 파이프라인 상단 예상 점수 바

## 🎯 Mission

각 step 완료 수준에 따라 RFP 평가배점을 점진적으로 채우는 **예상 점수 시스템** 구현. 파이프라인 상단(`page.tsx`) 에 배치.

## 📋 Context

**v1 설계** ([REDESIGN.md](../../../REDESIGN.md) Part 2):
```
[RFP 분석: 12/20] → [커리큘럼: 0/30] → [코치: 0/10] → [예산: 0/15] → [임팩트: 0/15] → [제안서: 0/10]
현재 총점: 12/100
```

**Phase D4 는 규칙 기반만** 구현. AI 시뮬레이션 부분은 D5 (Gate 3) 의 영역. 둘 다 `predictedScore` 에 반영되지만 소스 구분.

## ✅ Prerequisites

1. Phase A B0 완료 (`Project.predictedScore` 필드)
2. Phase C 완료 (각 slice 가 어느 정도 채워졌는지 판단 가능)
3. `src/lib/eval-strategy.ts` (Phase B B3)

## 📖 Read

1. `docs/architecture/quality-gates.md` §1 Gate 2 · Gate 3
2. `src/lib/eval-strategy.ts` — topItems / sectionWeights
3. `src/lib/pipeline-context.ts` — 슬라이스 타입
4. `src/lib/planning-score.ts` — 기존 점수 계산 (upgrade 대상)

## 🎯 Scope

### ✅ CAN
- `src/modules/predicted-score/` (신규)
  - `manifest.ts`
  - `types.ts`
  - `calculate.ts` — 규칙 기반 계산
  - `score-bar.tsx` — 상단 점수 바 컴포넌트
- `src/app/(dashboard)/projects/[id]/page.tsx` — 상단 배치 (한 줄 추가)
- `src/app/api/projects/[id]/predict-score/route.ts` (신규 GET — 이 함수 래퍼)

### ❌ MUST NOT
- `src/lib/planning-score.ts` 수정 (기존 로직 유지, 필요 시 import 만)
- schema.prisma
- eval-strategy.ts 수정
- AI 호출 (D5 영역)
- page.tsx 의 다른 블록 수정

## 🛠 Tasks

### Step 1: 규칙 기반 계산

`calculate.ts`:

```typescript
export interface PredictedScoreBreakdown {
  totalScore: number      // 0~100 (정규화)
  items: Array<{
    sectionKey: ProposalSectionKey
    maxPoints: number     // RFP 평가배점 항목 원본 점수
    currentScore: number  // 현재 얼마나 채워졌는지
    completeness: number  // 0~1
    reason: string        // 왜 이 점수인지
  }>
  calculatedAt: string
  source: 'rule_based' | 'ai_simulation'
}

export function calculatePredictedScore(context: PipelineContext): PredictedScoreBreakdown {
  const evalStrategy = context.rfp?.evalStrategy
  if (!evalStrategy) return zeroScore('RFP 평가배점 정보 없음')

  const items = evalStrategy.topItems.map(topItem => {
    const { completeness, reason } = judgeSection(topItem.section, context)
    return {
      sectionKey: topItem.section,
      maxPoints: topItem.points,
      currentScore: topItem.points * completeness,
      completeness,
      reason,
    }
  })
  const totalScore = items.reduce((s, i) => s + i.currentScore, 0)
  return { totalScore, items, calculatedAt: new Date().toISOString(), source: 'rule_based' }
}
```

**judgeSection 규칙 (섹션별):**

- `curriculum`: `!!context.curriculum?.confirmedAt` → 0.8, sessions 있으면 +0.15, ruleValidation passed → +0.05
- `coaches`: `context.coaches?.assignments?.length > 0` → 0.7, totalFee > 0 → +0.2, confirmed 비율 0.1
- `budget`: `!!context.budget?.structure` → 0.6, marginRate 적정(10~15%) → +0.2, sroiForecast → +0.2
- `impact`: `!!context.impact?.logicModel` → 0.7, measurementPlan.length > 0 → +0.3
- `proposal-background`: `!!context.rfp?.confirmedAt && !!context.rfp?.proposalConcept` → 1.0
- `org-team`: coaches + strategy 있으면 0.8
- `other`: 0.5 (모호)

### Step 2: API Route

`/api/projects/[id]/predict-score/route.ts`:
- GET
- buildPipelineContext → calculatePredictedScore
- 200 반환 (인증 체크)

### Step 3: Score Bar UI

`src/modules/predicted-score/score-bar.tsx`:

디자인 SKILL 준수:
- 상단 가로 바 (grid-cols 로 items.length 개)
- 각 세그먼트: `maxPoints` 크기, `completeness` 가 progress bar 로 채워짐
- 총점 우측에 `text-3xl font-bold` 로 큰 숫자 (SKILL §8 Scale)
- 색: 0.5 미만은 `bg-muted`, 0.5~0.8 은 `bg-orange-40`, 0.8+ 는 `bg-primary`
- hover 시 tooltip 으로 `reason`

```tsx
export async function ScoreBar({ projectId }: { projectId: string }) {
  const ctx = await buildPipelineContext(projectId)
  const score = calculatePredictedScore(ctx)
  return (
    <div className="flex items-center gap-4 p-3 border-b">
      <div className="flex-1 flex gap-1">
        {score.items.map(item => <ScoreSegment key={item.sectionKey} {...item} />)}
      </div>
      <div>
        <span className="text-3xl font-bold">{Math.round(score.totalScore)}</span>
        <span className="text-sm text-muted-foreground">/100</span>
      </div>
    </div>
  )
}
```

### Step 4: page.tsx 삽입

`src/app/(dashboard)/projects/[id]/page.tsx` 의 **PlanningScorecard 근처** 에 `<ScoreBar projectId={project.id} />` 한 줄 추가. 기존 PlanningScorecard 는 유지 (둘은 서로 다른 지표).

### Step 5: 검증

typecheck · build.

## ✔️ Definition of Done

- [ ] calculate.ts 규칙 기반
- [ ] GET /api/projects/[id]/predict-score
- [ ] ScoreBar 컴포넌트 + page.tsx 삽입
- [ ] manifest.ts
- [ ] digest Score 가 evalStrategy 없으면 0 fallback
- [ ] typecheck · build 통과

## 📤 Return Format

- 예시 계산 (imaginary context 로 한 번 돌려서 값 확인)
- page.tsx 삽입 위치

## 🚫 Do NOT

- AI 호출 (D5)
- evalStrategy 수정
- PlanningScorecard 대체 (병존)

## 💡 Hints

- evalStrategy.topItems.length 가 3 미만일 수 있음 — 방어 코드
- calculatedAt 은 각 호출마다 달라짐 (캐싱 나중에 Phase F)
- 점수가 PM 에게 "위협적" 으로 보이지 않도록 SKILL §2 색 규칙 유지.

## 🏁 Final

수주율 예측이 아닌 **현재 완성도 가시화**. 정량 KPI 로서 각 스텝 우선순위 판단 근거.
