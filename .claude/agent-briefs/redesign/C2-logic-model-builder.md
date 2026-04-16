# C2 Brief: logic-model-builder.ts — 커리큘럼→Activity 자동 추출 + AI Outcome/Impact

## 🎯 Mission (1 sentence)
`src/lib/logic-model-builder.ts` 를 신규 생성하여 **ADR-004 알고리즘**(커리큘럼 세션 → Activity 결정론적 그룹핑, 코치+예산 → Input 자동) 을 구현하고 AI 는 Outcome/Impact 만 생성하게 한다. `/api/ai/logic-model/route.ts` 를 수정하여 신규 함수 호출.

## 📋 Context

**왜 이 작업이 필요한가.**
- ADR-001: 임팩트를 Step 5 로 이동, Activity 는 커리큘럼에서 자동 추출
- ADR-004: 트랙/유형 기반 결정론적 그룹핑으로 15 세션 → 4~7 Activity
- 현재 `buildLogicModel()` (claude.ts) 는 PM 이 Activity 를 수동 입력하거나 AI 가 추측 — 이중 입력 + 재현성 없음

**해결.**
결정론적 Activity/Input 생성 + AI 는 Output/Outcome/Impact 만.

**ADR-004 § 알고리즘 요약:**
1. Action Week 세션들 → 1 Activity ("실전 실행 주간")
2. 1:1 코칭 세션들 → 1 Activity ("개별 멘토링")
3. 이론 세션들 → 1 Activity ("이론 교육")
4. 나머지 워크숍/실습 → IMPACT 단계(I/M/P/A/C/T) 별 or 순서 근접성으로 그룹핑
5. Input 은 코치/예산/인프라 고정 템플릿

## ✅ Prerequisites
1. 작업 디렉토리: `c:\Users\USER\projects\ud-ops-workspace`
2. `npm run build` 통과
3. `src/lib/pipeline-context.ts` 에 `CurriculumSession`, `CurriculumSlice`, `CoachesSlice`, `BudgetSlice`, `ImpactSlice` 존재
4. `src/lib/claude.ts` 에 `LogicModel`, `LogicModelItem` 타입 존재 + `CLAUDE_MODEL`, `safeParseJson`
5. `docs/decisions/004-activity-session-mapping.md` 완료 (참조 필수)

실패 시 STOP.

## 📖 Read These Files First

1. `CLAUDE.md` · `AGENTS.md`
2. **`docs/decisions/004-activity-session-mapping.md` 전체** — 알고리즘 사양서
3. **`docs/architecture/data-contract.md` §1.2 ImpactSlice** — 출력 스펙
4. `src/lib/pipeline-context.ts` — 슬라이스 타입들
5. `src/lib/claude.ts` — `LogicModel`, `LogicModelItem` 타입 + 기존 `buildLogicModel()` (수정 금지, 참고)
6. `src/lib/curriculum-ai.ts` (C1 산출) — 패턴 참고
7. `src/lib/planning-direction.ts` — B1 validate+재시도 패턴
8. `src/app/api/ai/logic-model/route.ts` 현재 구현
9. `src/lib/ud-brand.ts` — `buildBrandContext()` + IMPACT_STAGE_OVERVIEW

## 🎯 Scope

### ✅ You CAN touch
- `src/lib/logic-model-builder.ts` (신규) — Activity 추출 + Input 유도 + AI 호출
- `src/app/api/ai/logic-model/route.ts` — 신규 함수 호출로 교체

### ❌ You MUST NOT touch
- `src/lib/claude.ts` — import 만
- `src/lib/pipeline-context.ts` · `ud-brand.ts` · `eval-strategy.ts` · `curriculum-ai.ts` (C1 산출물) — 수정 금지
- `prisma/schema.prisma`
- `src/app/(dashboard)/**` — C4 Wave 2
- 다른 api route — C1/C3 영역
- `package.json`

## 🛠 Tasks

### Step 1: 타입 정의 + 결정론적 Activity 추출

```typescript
// src/lib/logic-model-builder.ts

import type {
  CurriculumSession,
  CurriculumSlice,
  CoachesSlice,
  BudgetSlice,
  RfpSlice,
} from '@/lib/pipeline-context'
import type { LogicModel, LogicModelItem } from '@/lib/claude'

export interface BuildLogicModelInput {
  rfp: RfpSlice
  curriculum: CurriculumSlice       // 필수 — 커리큘럼 확정 전제
  coaches?: CoachesSlice            // optional — 있으면 Input 풍부화
  budget?: BudgetSlice              // optional — 있으면 Input 풍부화
  /** PM 이 확정한 Impact Goal (UI 에서 입력) */
  impactGoal: string
}

/**
 * ADR-004 Option B 알고리즘 구현.
 * 순수 함수 — AI 호출 없음.
 */
export function sessionsToActivities(sessions: CurriculumSession[]): ActivityDraft[] {
  const activities: ActivityDraft[] = []

  // 1. Action Week 통합
  const awSessions = sessions.filter(s => s.isActionWeek)
  if (awSessions.length > 0) {
    activities.push({
      type: 'ACTION_WEEK',
      title: `실전 실행 주간 (${awSessions.length}회차)`,
      sourceSessionNos: awSessions.map(s => s.sessionNo),
      defaultOutputs: ['실행 계획서', '중간 점검 보고서', '최종 실행 결과물'],
    })
  }

  // 2. 1:1 코칭 통합
  const coachingSessions = sessions.filter(s => s.isCoaching1on1 && !s.isActionWeek)
  if (coachingSessions.length > 0) {
    activities.push({
      type: 'COACHING',
      title: `개별 멘토링 (${coachingSessions.length}회)`,
      sourceSessionNos: coachingSessions.map(s => s.sessionNo),
      defaultOutputs: ['코칭 일지', '실행 피드백', '개선 계획'],
    })
  }

  // 3. 이론 통합 (AW·코칭 제외)
  const theorySessions = sessions.filter(
    s => s.isTheory && !s.isActionWeek && !s.isCoaching1on1
  )
  if (theorySessions.length > 0) {
    activities.push({
      type: 'THEORY',
      title: `이론 교육 (${theorySessions.length}회)`,
      sourceSessionNos: theorySessions.map(s => s.sessionNo),
      defaultOutputs: theorySessions.map(s => s.title),
    })
  }

  // 4. 워크숍/실습 — IMPACT 단계별 or 순서 근접성
  const workshopSessions = sessions.filter(
    s => !s.isTheory && !s.isActionWeek && !s.isCoaching1on1
  )
  const grouped = groupWorkshopSessions(workshopSessions)
  for (const group of grouped) {
    activities.push({
      type: 'WORKSHOP',
      title: deriveGroupTitle(group),
      sourceSessionNos: group.map(s => s.sessionNo),
      defaultOutputs: group.map(s => `${s.title} 산출물`),
    })
  }

  return activities
}

export interface ActivityDraft {
  type: 'ACTION_WEEK' | 'COACHING' | 'THEORY' | 'WORKSHOP'
  title: string
  sourceSessionNos: number[]
  defaultOutputs: string[]
}
```

**`groupWorkshopSessions` 힌트:**
- 우선 `impactModuleCode` 첫 글자(I/M/P/A/C/T) 기준으로 묶기
- impactModuleCode 없는 세션은 3개씩 순서로 묶기
- 각 그룹 최대 4개 세션 (너무 크면 쪼개기)

**`deriveGroupTitle` 힌트:**
- IMPACT 단계 그룹: 예 `"I (Ideation) 단계 워크숍"`
- 순서 그룹: `"{첫 세션 제목} 외 N회차"`

### Step 2: Input 자동 유도

```typescript
export interface InputDraft {
  type: 'HUMAN' | 'FINANCIAL' | 'INFRASTRUCTURE'
  title: string
  detail: string
}

export function deriveInputs(
  coaches?: CoachesSlice,
  budget?: BudgetSlice,
): InputDraft[] {
  const inputs: InputDraft[] = []

  if (coaches && coaches.assignments.length > 0) {
    inputs.push({
      type: 'HUMAN',
      title: `코치진 ${coaches.assignments.length}명`,
      detail: coaches.totalFee > 0
        ? `총 사례비 ${coaches.totalFee.toLocaleString()}원`
        : '코치 배정 확정',
    })
  } else {
    inputs.push({
      type: 'HUMAN',
      title: '코치진 (미배정)',
      detail: 'Step 3 코치 매칭 완료 후 자동 반영',
    })
  }

  if (budget) {
    inputs.push({
      type: 'FINANCIAL',
      title: `사업 예산 ${budget.structure.acTotal.toLocaleString()}원`,
      detail: `마진 ${budget.marginRate}%`,
    })
  } else {
    inputs.push({
      type: 'FINANCIAL',
      title: '사업 예산 (미확정)',
      detail: 'Step 4 예산 확정 후 자동 반영',
    })
  }

  // 인프라는 항상 고정
  inputs.push({
    type: 'INFRASTRUCTURE',
    title: '교육 인프라',
    detail: '온·오프라인 교육장, 언더베이스 LMS, EduBot AI 도우미',
  })

  return inputs
}
```

### Step 3: AI 호출 (Outcome/Impact 만)

```typescript
export async function buildLogicModel(
  input: BuildLogicModelInput,
): Promise<{ ok: true; data: LogicModel } | { ok: false; error: string; raw?: string }> {
  // 1. Activity 추출 (결정론적)
  const activities = sessionsToActivities(input.curriculum.sessions)

  // 2. Input 유도 (결정론적)
  const inputs = deriveInputs(input.coaches, input.budget)

  // 3. AI 프롬프트 조립 — Activity/Input 은 "이미 확정됨"으로 주입,
  //    AI 는 Output(Activity 별)/Outcome/Impact 만 생성
  const prompt = buildLogicModelPrompt({
    rfp: input.rfp,
    impactGoal: input.impactGoal,
    activities,   // 이것은 AI 가 "수정 불가"로 취급하도록 명시
    inputs,
  })

  // 4. Claude 호출
  // 5. safeParseJson
  // 6. 검증: 각 activity 에 대응하는 output 이 있는지 / outcome 2~4개 / impact 1~2개
  // 7. 재시도 1회
  // 8. 결정론적 Activity/Input + AI Output/Outcome/Impact 를 LogicModel 로 조립
}
```

**중요한 프롬프트 지시:**
```
[고정된 Activity (수정 금지)]
다음 Activity 들은 이미 커리큘럼에서 자동 추출되었습니다. **이 Activity 를
바꾸거나 줄이거나 합치지 마세요.** 각 Activity 에 대한 Output, 전체 Outcome 2~4개,
최종 Impact 1~2개만 생성하세요.

Activities:
{activities.map(a => `- [${a.type}] ${a.title} (sessionNos: ${a.sourceSessionNos.join(',')})`).join('\n')}

[고정된 Input (수정 금지)]
{inputs.map(...)}

[PM 이 확정한 Impact Goal]
{impactGoal}

[언더독스 실행 철학]
"해보기 전엔 아무것도 모른다" — Outcome 은 "실행 경험"을 핵심으로 설계.
```

### Step 4: API 라우트 수정

`src/app/api/ai/logic-model/route.ts`:

```typescript
import { buildLogicModel } from '@/lib/logic-model-builder'
import { buildPipelineContext } from '@/lib/pipeline-context'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return 401

  const { projectId, impactGoal } = await req.json()
  if (!projectId) return 400 'PROJECT_ID_REQUIRED'
  if (!impactGoal || impactGoal.length < 5) return 400 'IMPACT_GOAL_REQUIRED'

  const ctx = await buildPipelineContext(projectId)
  if (!ctx.curriculum || ctx.curriculum.sessions.length === 0) {
    return 400 'CURRICULUM_REQUIRED'  // ADR-001 원칙: 커리큘럼 먼저
  }
  if (!ctx.rfp) return 400 'RFP_REQUIRED'

  const result = await buildLogicModel({
    rfp: ctx.rfp,
    curriculum: ctx.curriculum,
    coaches: ctx.coaches,       // optional
    budget: ctx.budget,         // optional
    impactGoal,
  })

  if (!result.ok) return 500

  // stateless — 저장은 기존 Project.logicModel 업데이트 API 가 담당
  return NextResponse.json(result.data)
}
```

**에러 분기 명확:**
- `CURRICULUM_REQUIRED` 는 ADR-001 의 순서 원칙. 클라이언트는 이 에러 받으면 "Step 2 먼저 완료하세요" 안내.

### Step 5: manifest 업데이트

`src/app/(dashboard)/projects/[id]/step-impact.manifest.ts` 의 `reads.context` 확인:

```typescript
reads: {
  context: ['curriculum', 'budget', 'coaches', 'rfp'],   // ADR-004: coaches 도 읽음
  assets: ['impact-modules', 'sroi-proxy'],
},
```

`coaches` 가 빠져 있으면 추가. `rfp` 도 impactGoal 생성 전 조회에 쓰이므로 포함.

### Step 6: 검증

```bash
npm run typecheck
npm run build
```

**특히 확인:**
- `LogicModel`, `LogicModelItem` 타입이 claude.ts 에서 export 되어야 함 (안 돼 있으면 타입 추론 실패 → 보고)
- `CurriculumSession` 의 `impactModuleCode` 필드가 optional 이므로 undefined 처리

## 🔒 Tech Constraints

- **ADR-004 알고리즘 정확히 구현** — 규칙이 틀어지면 Logic Model 품질 즉시 하락
- **AI 가 Activity 를 수정 못 하게 프롬프트에 강제** (그래도 가끔 시도함 → 검증에서 잡기)
- Claude 모델 · safeParseJson · max_tokens 4096 동일
- stateless · any 금지 · 의존성 추가 금지

## ✔️ Definition of Done

- [ ] `src/lib/logic-model-builder.ts` 신규
- [ ] `sessionsToActivities(sessions)` 순수 함수, ADR-004 규칙 그대로
- [ ] `deriveInputs(coaches?, budget?)` 순수 함수, fallback 텍스트 포함
- [ ] `buildLogicModel(input)` AI 호출 (Outcome/Impact 만)
- [ ] Activity 원본 보존 검증 — AI 가 Activity 를 바꿨으면 재시도
- [ ] `/api/ai/logic-model/route.ts` 가 신규 함수 호출
- [ ] `CURRICULUM_REQUIRED` 에러 분기 (ADR-001 순서 강제)
- [ ] manifest.reads.context 에 `curriculum`, `budget`, `coaches`, `rfp` 포함
- [ ] `claude.ts` 수정 없음
- [ ] typecheck / build 통과

## 📤 Return Format

```
C2 logic-model-builder 완료.

생성 파일:
- src/lib/logic-model-builder.ts (X줄)

수정 파일:
- src/app/api/ai/logic-model/route.ts (신규 함수 호출로 교체)
- src/app/(dashboard)/projects/[id]/step-impact.manifest.ts (reads.context 보완)

ADR-004 알고리즘 구현:
- sessionsToActivities: Action Week/1:1코칭/이론/워크숍(IMPACT단계) 그룹핑
- deriveInputs: 코치·예산·인프라 자동 (optional fallback)
- AI 역할 축소: Output/Outcome/Impact 만

에러 분기:
- 400 CURRICULUM_REQUIRED (ADR-001: 커리큘럼 먼저)
- 400 RFP_REQUIRED / IMPACT_GOAL_REQUIRED
- 401 Unauthorized
- 500 AI_GENERATION_FAILED (재시도 후)

검증:
- Activity 보존 (AI 가 못 바꾸게)
- Outcome 2~4개, Impact 1~2개
- 재시도 1회

typecheck: ✅
build: ✅

주의 / 이슈:
- LogicModel 타입 export 확인 필요
- CurriculumSession.impactModuleCode optional 처리

후속:
- C4 Wave 2 가 step-impact.tsx 에서 "커리큘럼에서 자동 추출됨" 배너 + Activity 편집 UI
- Phase E4 에서 Activity 수동 조정 UI 추가
- SROI 프록시 매핑 Phase D 이후
```

## 🚫 Do NOT

- claude.ts 수정 금지 (import 만)
- ADR-004 알고리즘 임의 변경 금지 (규칙 틀어지면 ADR-004 업데이트 먼저)
- AI 가 Activity 자유 생성 허용 금지 (명시적 프롬프트 제약 + 검증)
- DB 쓰기 금지
- step-impact.tsx 수정 금지 (C4)
- 새 의존성 금지

## 💡 Hints

- `LogicModel` / `LogicModelItem` 타입은 `src/lib/claude.ts` 에서 이미 정의됨. import 경로 확인.
- IMPACT 단계 매핑이 있는 세션이 적으면 (예: 2/15) 순서 그룹핑이 대부분 — fallback 로직 중요
- AI 가 Activity 를 바꾸려 하면 프롬프트에 "❌ Activity 수정 금지" 를 반복 강조. 재시도 시 더 강하게.
- `sessionsToActivities` 에 단위 테스트가 있으면 좋지만 테스트 러너 없으므로 브리프 범위 밖 — 순수 함수라 수동 검증 쉬움.
- `impactModuleCode` 가 `"M1"`, `"I2"` 같은 형식일 때 첫 글자만 추출 (`.charAt(0)`).

## 🏁 Final Note

ADR-004 의 실제 구현. Activity 자동 추출이 작동해야 Step 5 의 "이중 입력 제거" 라는 재설계 목표가 실현됨. 알고리즘 규칙을 정확히 따르는 것이 핵심 — AI 창의성 개입은 Outcome/Impact 만.
