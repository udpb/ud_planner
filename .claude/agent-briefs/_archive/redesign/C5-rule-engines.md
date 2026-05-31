# C5 Brief: Rule Engines 3개 — budget-rules · impact-rules · proposal-rules

## 🎯 Mission (1 sentence)
`curriculum-rules.ts` 와 동일한 패턴으로 **예산·임팩트·제안서** 룰 엔진 3개 파일을 신규 생성한다. Gate 2 (결정론적 품질 검증) 의 뼈대. API 연동은 Phase D/E 에서.

## 📋 Context

**왜 이 작업이 필요한가.**
- `quality-gates.md` §1 Gate 2 는 예산/임팩트/제안서 룰 계획이 있지만 파일 없음
- C1~C3 에서 AI 가 생성한 산출물에 대한 결정론적 검증이 없으면 품질 보장 불가
- Phase D 에서 이 룰 엔진을 API 에 연결할 것 — 먼저 라이브러리부터

**`curriculum-rules.ts` 의 동일 패턴:**
```typescript
interface RuleValidationResult {
  passed: boolean
  violations: Array<{
    ruleId: string
    ruleName: string
    action: 'BLOCK' | 'WARN' | 'SUGGEST'
    message: string
    affectedItems?: Array<string | number>
  }>
}

interface DesignRule<T> {
  id: string
  name: string
  action: 'BLOCK' | 'WARN' | 'SUGGEST'
  check: (input: T) => { passed: boolean; message?: string; affectedItems?: Array<string | number> }
}
```

## ✅ Prerequisites
1. 작업 디렉토리: `c:\Users\USER\projects\ud-ops-workspace`
2. `npm run build` 통과
3. `src/lib/curriculum-rules.ts` 존재 (참조 원본)
4. `src/lib/pipeline-context.ts` 에 `BudgetSlice`, `ImpactSlice`, `ProposalSlice`, `BudgetWarning` 타입 존재
5. `src/lib/claude.ts` 에 `LogicModel` 타입 존재

실패 시 STOP.

## 📖 Read These Files First

1. `CLAUDE.md`
2. **`docs/architecture/quality-gates.md` §1 Gate 2** — 각 룰 엔진에 어떤 룰이 들어가는지 명시됨
3. **`src/lib/curriculum-rules.ts` 전체** — 복제할 패턴
4. `src/lib/pipeline-context.ts` — `BudgetSlice`, `ImpactSlice`, `ProposalSlice`, `BudgetWarning` 타입
5. `src/lib/claude.ts` — `LogicModel` 타입

## 🎯 Scope

### ✅ You CAN touch
- `src/lib/budget-rules.ts` (신규)
- `src/lib/impact-rules.ts` (신규)
- `src/lib/proposal-rules.ts` (신규)

### ❌ You MUST NOT touch
- `src/lib/curriculum-rules.ts` — 원본 유지
- `src/lib/pipeline-context.ts` — 타입 수정 금지
- `src/lib/claude.ts`
- 어떤 API / UI / 컴포넌트 수정 금지 — 순수 유틸 3개 파일만
- `package.json`

## 🛠 Tasks

### Step 1: budget-rules.ts

`src/lib/budget-rules.ts` (quality-gates.md §1 Gate 2 예산 룰):

```typescript
import type { BudgetSlice, BudgetWarning } from '@/lib/pipeline-context'

/**
 * 예산 룰 엔진 — Gate 2 결정론적 검증.
 * curriculum-rules.ts 와 동일 패턴.
 *
 * 룰 목록:
 *   BUD-001 직접비 비율 < 70% → WARN (B2G 기준)
 *   BUD-002 마진 < 10% → WARN (수익성 경고)
 *   BUD-003 마진 > 20% → WARN (감액 위험)
 *   BUD-004 총액 > RFP 예산 → BLOCK
 *   BUD-005 코치 단가 시장가 ±20% 벗어남 → SUGGEST
 *
 * 사용처:
 *   - Phase D 에서 POST /api/budget 검증
 *   - Step 4 UI 에서 실시간 경고
 */

export interface BudgetRuleInput {
  budget: BudgetSlice
  rfpBudget?: number | null        // RFP 에서 파싱된 총예산
  projectType?: 'B2G' | 'B2B'
  // 시장가 비교용 (Phase D 시 cost-standards 자산에서)
  marketRateRange?: { min: number; max: number }
}

export function validateBudgetRules(input: BudgetRuleInput): RuleValidationResult {
  const violations: BudgetWarning[] = []
  // BUD-001~005 체크 구현
  return { passed: violations.filter(v => v.severity === 'BLOCK').length === 0, violations }
}
```

**룰 상세:**
- **BUD-001**: `budget.structure.items.filter(i => i.type === 'AC').reduce(...)` / 총액 비율이 0.7 미만 → WARN. B2G 에서만 체크.
- **BUD-002/003**: `budget.marginRate` 기반
- **BUD-004**: `rfpBudget` 있을 때만, `structure.acTotal > rfpBudget` 면 BLOCK
- **BUD-005**: marketRateRange 있을 때만 체크. 코치 사례비 평균이 min/max 벗어나면 SUGGEST.

**출력:** `RuleValidationResult` (curriculum-rules 와 동일 shape) 또는 `BudgetWarning[]` (pipeline-context 타입 재사용 가능 — 편한 쪽 선택, 일관성 주석)

### Step 2: impact-rules.ts

```typescript
import type { ImpactSlice } from '@/lib/pipeline-context'
import type { LogicModel, LogicModelItem } from '@/lib/claude'

/**
 * 임팩트 룰 엔진 — Gate 2.
 *
 * 룰 목록:
 *   IMP-001 Activity 가 커리큘럼 세션과 1:1 대응 안 됨 → WARN
 *           (ADR-004: sessionsToActivities 결과여야 함)
 *   IMP-002 Outcome 에 SROI 프록시 매핑 없음 → SUGGEST
 *   IMP-003 측정도구 미지정 Outcome → WARN
 *   IMP-004 Impact 가 Impact Goal 과 관련 없음 → SUGGEST (키워드 매칭)
 *   IMP-005 Logic Model 계층 (Input→Activity→Output→Outcome→Impact) 중 빈 계층 → WARN
 */

export interface ImpactRuleInput {
  impact: ImpactSlice
  /** 커리큘럼 session 수 — IMP-001 검증용 */
  curriculumSessionCount?: number
  /** SROI 프록시 키 목록 (sroi-proxy 자산) */
  availableSroiProxies?: string[]
}
```

**룰 상세 힌트:**
- IMP-001: `impact.logicModel.activity.length` 가 `curriculumSessionCount` 와 극단적으로 다르면 (예: activity 1개인데 sessions 20개) WARN
- IMP-005: `logicModel` 의 5계층 각각 비어있지 않은지 체크

### Step 3: proposal-rules.ts

```typescript
import type { ProposalSlice } from '@/lib/pipeline-context'

/**
 * 제안서 룰 엔진 — Gate 2.
 *
 * 룰 목록:
 *   PROP-001 7개 섹션 모두 존재 → BLOCK (미완)
 *   PROP-002 섹션별 최소 분량 미달 → WARN
 *   PROP-003 ChannelPreset.avoidMessages 포함 → WARN (Phase D 이후 본격)
 *   PROP-004 키메시지 미반영 섹션 → SUGGEST
 *   PROP-005 Action Week / 4중 지원 / IMPACT 중 브랜드 씨앗 0회 등장 → WARN
 *   PROP-006 금지 표현 (SKILL §11) 포함 → WARN
 *
 * Phase C 단계: PROP-001, 002, 005, 006 구현
 * Phase D 단계: PROP-003 (ChannelPreset 생성 후), PROP-004 (strategy.derivedKeyMessages 반영 후)
 */

export interface ProposalRuleInput {
  proposal: ProposalSlice
  /** 섹션별 최소 분량 (PROP-002, 기본값 제공) */
  minCharsPerSection?: Record<number, number>
  /** 금지 표현 리스트 (SKILL §11 에서 도출) */
  forbiddenPhrases?: string[]
  /** 필수 브랜드 씨앗 키워드 (PROP-005) */
  requiredBrandSeeds?: string[]
  /** 예정: ChannelPreset.avoidMessages (Phase D) */
  channelAvoidMessages?: string[]
  /** 예정: Strategy.derivedKeyMessages (Phase D) */
  requiredKeyMessages?: string[]
}
```

**기본값 상수 export:**
```typescript
export const DEFAULT_MIN_CHARS: Record<number, number> = {
  1: 800, 2: 800, 3: 1000, 4: 700, 5: 700, 6: 700, 7: 500,
}

export const DEFAULT_FORBIDDEN_PHRASES = [
  'AI 코치 상품', 'AI 코치 서비스',   // §11 위반
  // "약자" 는 Underdog 재정의 안에서만 쓰여야 하므로 단독 체크 어려움 — journey 기록
]

export const DEFAULT_BRAND_SEEDS = [
  'Action Week', '4중 지원', 'IMPACT', 'ACT-PRENEUR',
  '실행 보장', '정량',
]
```

### Step 4: 공통 타입 재사용

세 파일 모두 `curriculum-rules.ts` 의 `RuleValidationResult` shape 를 따름. 만약 curriculum-rules 가 export 하고 있으면 import 해서 재사용, 안 하면 각자 정의 OR 새 공통 파일 `src/lib/rule-engine-types.ts` 만들 수 있음 (옵션).

**추천:** `curriculum-rules.ts` 의 `RuleValidationResult` 를 **export 확인**. 안 되어 있으면 각 파일에 동일 shape 정의 (짧으니 복제 OK, 나중에 `rule-engine-types.ts` 로 추출 가능).

### Step 5: 검증

```bash
npm run typecheck
npm run build
```

두 개 통과. 3개 파일은 어디서도 import 안 되므로 tree-shake 됨 — 정상.

## 🔒 Tech Constraints

- **curriculum-rules.ts 패턴 정확히 복제** — 일관성
- **순수 함수** — side effect ❌, DB ❌, AI ❌
- **TypeScript strict** — any 금지
- **의존성 추가 금지**
- **각 룰은 명확한 ID** (BUD-NNN, IMP-NNN, PROP-NNN)

## ✔️ Definition of Done

- [ ] `src/lib/budget-rules.ts` — validateBudgetRules + BUD-001~005 (BUD-005 는 marketRateRange 없으면 스킵)
- [ ] `src/lib/impact-rules.ts` — validateImpactRules + IMP-001~005
- [ ] `src/lib/proposal-rules.ts` — validateProposalRules + PROP-001/002/005/006 (+003/004 는 stub)
- [ ] DEFAULT_MIN_CHARS · DEFAULT_FORBIDDEN_PHRASES · DEFAULT_BRAND_SEEDS export
- [ ] 모든 룰에 고유 ID, name, action, message
- [ ] 순수 함수 (side effect 없음)
- [ ] any 0
- [ ] typecheck / build 통과
- [ ] curriculum-rules.ts 수정 없음

## 📤 Return Format

```
C5 Rule Engines 3개 완료.

생성 파일:
- src/lib/budget-rules.ts (N줄, 5 rules)
- src/lib/impact-rules.ts (N줄, 5 rules)
- src/lib/proposal-rules.ts (N줄, 4 rules + 2 stubs)

룰 ID 목록:
- BUD-001~005
- IMP-001~005
- PROP-001 (BLOCK), 002 (WARN), 005 (WARN), 006 (WARN)
- PROP-003 (WARN, stub), 004 (SUGGEST, stub)

공통 타입:
- RuleValidationResult (curriculum-rules.ts 에서 import / 각자 정의 — 실제로 어떻게 했는지 기록)

기본값 상수:
- DEFAULT_MIN_CHARS (섹션별)
- DEFAULT_FORBIDDEN_PHRASES
- DEFAULT_BRAND_SEEDS

검증:
- typecheck ✅
- build ✅ (tree-shake 확인)

주의 / 이슈:
- PROP-003/004 는 Phase D ChannelPreset / Strategy 완성 후 본격 가동
- BUD-005 는 marketRateRange 자산 Phase D 에서 cost-standards 로 연결
- IMP-002 SROI 프록시 매핑은 sroi-proxy 자산 실제 연결 필요 (Phase D/E)

후속:
- Phase D: C1~C3 결과물에 룰 연동 (api 응답 후 validate 호출)
- Phase D: ChannelPreset / SroiProxy 자산 준비되면 stub 해제
- Phase D5: Gate 3 AI 검증과 결합
```

## 🚫 Do NOT

- API / UI 건드리지 말 것 (이번 브리프는 라이브러리 3개만)
- AI 호출 금지 (결정론적 규칙)
- DB 접근 금지
- curriculum-rules.ts 수정 금지
- pipeline-context.ts 타입 수정 금지
- 새 의존성 금지

## 💡 Hints

- `curriculum-rules.ts` 를 열어서 **정확히 같은 구조** 로 각 파일 구성. 인터페이스·export·룰 배열 형식 복붙 수준으로 복제.
- `BudgetSlice.warnings` 는 이미 `BudgetWarning[]` 타입 → 재사용 가능 (import 해서 그대로 반환 or RuleValidationResult 로 래핑)
- 규칙 체크 함수는 **pure function** — 테스트 쉽게 작성할 수 있도록. 실제 테스트 파일은 선택사항 (테스트 러너 없음).
- JSDoc 주석에 **"Phase D 에 어떻게 연결되는지"** 를 기록해야 연결 작업 때 맥락 보존됨.
- 기본값 상수에 주석으로 "SKILL §X 에서 도출" 명시 — 나중에 업데이트 시 참조.

## 🏁 Final Note

Gate 2 의 뼈대. 지금은 아무도 호출 안 하지만 Phase D 에서 연결되는 순간 수주 품질 보장 장치로 작동. **확장 가능성**(Phase D 이후 룰 추가) 고려해서 룰 배열 구조 느슨하게. 룰 수가 늘면 `rule-engine-types.ts` 로 공통 추출.
