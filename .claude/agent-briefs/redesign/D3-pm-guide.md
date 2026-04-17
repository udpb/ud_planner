# D3 Brief: pm-guide 모듈 — 스텝별 우측 가이드 패널

## 🎯 Mission

각 step 컴포넌트 우측 패널에 **평가위원 관점 · 당선 레퍼런스 (WinningPattern) · 흔한 실수 · UD 강점 팁** 을 보여주는 `pm-guide` 모듈 신규 구현. Phase C4 에서 만든 DataFlowBanner 는 상단, 이건 우측.

## 📋 Context

**재설계 Phase D 의 핵심 PM UX.** 신입 PM 이 시스템 쓰는 동안 "왜 이렇게 해야 하는가" 를 우측에서 실시간 읽을 수 있게.

**Data Source:**
- WinningPattern (D1 완료 결과) — `findWinningPatterns({ sectionKey, channelType })`
- ChannelPreset (D2 완료 결과) — `getChannelPreset(channel)`
- Static Content (이 브리프에 포함) — 흔한 실수 Top 5 / 평가위원 관점 / UD 강점 팁

**ADR-005 금지:** 가이드북 본문 통째 주입 ❌. 필요한 컨텐츠는 static content 또는 WinningPattern 으로만.

## ✅ Prerequisites

1. D1 완료 (`src/lib/winning-patterns.ts`)
2. D2 완료 (`src/lib/channel-presets.ts`)
3. Phase C4 완료 (step 컴포넌트들이 PipelineContext slice 받는 구조)

## 📖 Read

1. `docs/decisions/005-guidebook-system-separation.md`
2. `docs/architecture/modules.md` §3 SUPPORT MODULES (pm-guide 정의)
3. `docs/architecture/quality-gates.md` §1 Gate 3
4. `src/lib/winning-patterns.ts` (D1)
5. `src/lib/channel-presets.ts` (D2)
6. `src/lib/eval-strategy.ts`
7. `src/lib/ud-brand.ts` — UD_KEY_MESSAGE_PATTERNS · UD_SUPPORT_LAYERS
8. Phase C4 결과: `src/app/(dashboard)/projects/[id]/{curriculum-board, coach-assign, budget-dashboard, step-impact, step-proposal}.tsx` — 우측 공간 확인
9. `.claude/skills/ud-design-system/SKILL.md`
10. `.claude/skills/ud-brand-voice/SKILL.md`

## 🎯 Scope

### ✅ CAN
- `src/modules/pm-guide/` 신규 폴더
  - `manifest.ts`
  - `types.ts`
  - `static-content.ts` — 흔한 실수·평가위원 관점·UD 강점 팁 (static)
  - `resolve.ts` — slice 별 어떤 컨텐츠를 보여줄지 결정하는 로직
  - `panel.tsx` — 패널 React 컴포넌트
  - `sections/*.tsx` — 각 카드 (WinningReferences · CommonMistakes · Evaluator · UDStrengths)
- 각 step 컴포넌트 (curriculum-board 등) 에 `<PmGuidePanel stepKey="..." context={context} />` **삽입만** — 기존 로직 수정 ❌

### ❌ MUST NOT
- 각 step 의 기존 props·내부 로직 변경 (C4 결과 유지)
- schema.prisma
- claude.ts · pipeline-context.ts · ud-brand.ts
- 새 의존성 (lucide·shadcn 만 사용)
- Gate 3 AI 시뮬레이션 (D5 영역)

## 🛠 Tasks

### Step 1: Module Manifest

`src/modules/pm-guide/manifest.ts`:

```typescript
export const manifest: ModuleManifest = {
  name: 'pm-guide',
  layer: 'support',
  version: '0.1.0',
  owner: 'TBD',
  reads: {
    context: ['rfp', 'strategy', 'curriculum', 'coaches', 'budget', 'impact', 'proposal'],
    assets: ['winning-patterns', 'channel-presets'],
  },
  writes: { context: [] },
  ui: 'src/modules/pm-guide/panel.tsx',
  quality: { checks: [] },
}
```

### Step 2: Static Content

`static-content.ts`:

**Common Mistakes Top 5** (step 별 분기):
- curriculum: "이론 3연속 배치", "Action Week 누락", "IMPACT 모듈 미매핑"
- coaches: "단일 코치 표현 (4중 지원 체계 누락)", "1:1 코칭 없이 강의만"
- budget: "직접비 비율 70% 미만 (B2G)", "마진 10% 미만"
- impact: "Activity → Outcome 도약 ('그래서?' 테스트 실패)", "Output 을 Outcome 으로 혼동"
- proposal: "Section V 보너스 누락", "모호한 수량 표현 ('많은', '다양한')"

각 항목: `{ id, mistake, consequence, fix }` 형식

**Evaluator Perspective** (ChannelPreset 에서 재사용):
- B2G: `"공무원 + 외부 전문가. 안정성·수행 능력·실적 중시."`
- B2B: `"실무 담당자 + 경영진. 결과·ROI·속도 중시."`
- renewal: `"이전 프로젝트 경험 있는 담당자 포함. 실질 성과·개선 노력 중시."`

**UD Strengths Tips** (step 별):
- curriculum: "IMPACT 18모듈 중 5개 명시 · Action Week 3회 이상 · 1:1 코칭 페어 포함"
- coaches: "4중 지원 체계(전문멘토+컨설턴트+전담코치+동료) 반드시 언급 · 800명 코치 풀 수치화"
- budget: "자체 투자사(라이콘) 연계 가능성 언급 · SROI 프록시 매핑"
- impact: "ACT-PRENEURSHIP 사전/사후 측정 · Startup 6 Dimension 진단"
- proposal: "국내 최초/정량 포화/자체 도구 브랜딩 3 패턴 반드시"

### Step 3: Resolve 로직

`resolve.ts`:

```typescript
export interface PmGuideContent {
  winningReferences: WinningPattern[]
  evaluatorPerspective: string | null
  commonMistakes: CommonMistake[]
  udStrengthTips: string[]
}

export async function resolvePmGuide(
  stepKey: 'rfp' | 'curriculum' | 'coaches' | 'budget' | 'impact' | 'proposal',
  context: PipelineContext,
): Promise<PmGuideContent> {
  const channel = context.meta.channelType === 'bid'
    ? context.meta.projectType  // B2G | B2B
    : 'renewal'

  const [patterns, preset] = await Promise.all([
    findWinningPatterns({
      sectionKey: mapStepToSection(stepKey),
      channelType: channel,
      outcome: 'won',
      limit: 3,
    }),
    getChannelPreset(channel),
  ])

  return {
    winningReferences: patterns,
    evaluatorPerspective: preset?.evaluatorProfile ?? null,
    commonMistakes: COMMON_MISTAKES_BY_STEP[stepKey] ?? [],
    udStrengthTips: UD_STRENGTH_TIPS[stepKey] ?? [],
  }
}
```

### Step 4: Panel UI

`panel.tsx`:

```tsx
'use client'
import type { PipelineContext } from '@/lib/pipeline-context'
import { resolvePmGuide } from './resolve'
import { WinningReferencesCard } from './sections/winning-references'
import { EvaluatorCard } from './sections/evaluator'
import { CommonMistakesCard } from './sections/common-mistakes'
import { UdStrengthsCard } from './sections/ud-strengths'

interface Props {
  stepKey: StepKey
  context: PipelineContext
}

export async function PmGuidePanel({ stepKey, context }: Props) {
  // Server Component 이므로 async 가능
  const content = await resolvePmGuide(stepKey, context)

  return (
    <aside className="space-y-3">
      <EvaluatorCard perspective={content.evaluatorPerspective} />
      <WinningReferencesCard patterns={content.winningReferences} />
      <CommonMistakesCard items={content.commonMistakes} />
      <UdStrengthsCard tips={content.udStrengthTips} />
    </aside>
  )
}
```

**디자인 SKILL 준수:**
- Card 컴포넌트 사용
- 각 카드 제목은 `text-base font-semibold`
- Action Orange 는 배지·강조만 (§2 10-15% 제약)
- lucide 아이콘 4개 (Target · Trophy · AlertTriangle · Sparkles)

### Step 5: 각 step 에 삽입

Phase C4 결과 `curriculum-board.tsx` 등은 이미 `rfpSlice`·기타 props 받고 있음. 이 brief 는 **그 위에 `<PmGuidePanel>` 만 삽입**. 우측 컬럼 공간 (grid 3열) 이 없으면 기존 레이아웃의 우측 패널 자리에 배치.

**주의 (scope 제약):** step 컴포넌트 내부 JSX 구조 재편 ❌. `<PmGuidePanel>` 을 기존 layout 의 이미 존재하는 우측 자리에 넣기만.

C4 에이전트가 각 step 에 grid 구성을 어떻게 했는지 확인 후 배치. 만약 우측 자리가 없으면 해당 step 은 **삽입 보류** + 보고 (사용자 피드백 받기).

### Step 6: 검증

typecheck · lint · build 통과.

## ✔️ Definition of Done

- [ ] `src/modules/pm-guide/` 전체 구현
- [ ] static content 5개 step 전부 (curriculum/coaches/budget/impact/proposal — rfp 는 Phase B B4 에 이미 자체 가이드)
- [ ] `resolvePmGuide` async 함수
- [ ] `<PmGuidePanel>` Server Component
- [ ] 4개 카드 (evaluator · winning · mistakes · strengths)
- [ ] 각 step 에 삽입 (우측 자리 있는 경우만)
- [ ] manifest.ts
- [ ] 디자인 SKILL · 브랜드 보이스 SKILL 준수
- [ ] typecheck · lint · build 통과

## 📤 Return Format

- 각 step 삽입 여부 (5개 중 몇 개 성공)
- 보류한 step 이 있다면 이유 (레이아웃 우측 자리 없음 등)
- static content 의 항목 수 요약

## 🚫 Do NOT

- step 컴포넌트 내부 JSX 재편
- Gate 3 AI 시뮬 (D5)
- 가이드북 본문 주입
- 우측 공간 없는데 억지로 배치

## 💡 Hints

- PmGuidePanel 이 async Server Component 라 streaming 됨. Suspense fallback 은 심플한 skeleton.
- WinningPattern 이 DB 에 0건일 수 있음 (D1 승인된 것 없을 때) — empty state "아직 수집된 당선 패턴이 없습니다. /ingest 에서 업로드하세요." 안내.
- 디자인 SKILL §11 스니펫의 "이전 스텝 요약 배너" 는 DataFlowBanner (C4) 가 담당. 여기선 우측 패널.
- `text-base` 카드 제목, `text-sm` 본문, `text-xs text-muted-foreground` 보조 — SKILL §8 Scale.

## 🏁 Final

신입 PM 의 첫 화면 경험을 결정. WinningPattern 이 쌓여갈수록 자연 풍부해지는 UI.
