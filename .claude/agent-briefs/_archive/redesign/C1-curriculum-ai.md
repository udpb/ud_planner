# C1 Brief: curriculum-ai.ts — PipelineContext 주입 커리큘럼 AI

## 🎯 Mission (1 sentence)
`src/lib/curriculum-ai.ts` 를 신규 생성하여 Step 1 의 기획방향(제안컨셉·핵심포인트·평가전략) 을 AI 프롬프트에 주입하는 `generateCurriculum()` 함수를 구현하고, `/api/ai/curriculum/route.ts` 를 수정하여 이 신규 함수를 호출한다. **`claude.ts` 는 helpers 만 import, 수정 금지**.

## 📋 Context

**왜 이 작업이 필요한가.**
Step 2 커리큘럼 생성이 현재 RFP 만 보고 만들어짐. PM 이 Step 1 에서 확정한 "제안 컨셉(예: 실행보장형)" · "핵심 기획 포인트(예: 커리큘럼 30점 최고배점)" · "평가배점 top 3" 가 프롬프트에 들어가지 않아 커리큘럼이 제안 방향과 따로 놀음.

**해결.**
`PipelineContext.rfp + strategy` 를 함께 주입. 특히:
- `rfp.proposalConcept` → "이 컨셉을 구현할 커리큘럼을 설계하세요"
- `rfp.keyPlanningPoints` → 최우선 반영
- `rfp.evalStrategy.topItems` → 최고배점 항목에 정조준
- `strategy.derivedKeyMessages` (있으면) → 커리큘럼 설계근거에 반영
- ChannelPreset (Phase D 예정, 지금은 하드코딩 재활용): B2G 는 체계성, B2B 는 속도

**ADR 참조:** ROADMAP Phase C1 · ADR-002 (Module Manifest — 모듈 분리)

## ✅ Prerequisites
1. 작업 디렉토리: `c:\Users\USER\projects\ud-ops-workspace`
2. `npm run build` 현재 통과 (Phase B 완료 상태)
3. `src/lib/pipeline-context.ts` 의 `PipelineContext` · `RfpSlice` · `StrategySlice` · `CurriculumSession` 타입 존재
4. `src/lib/claude.ts` 에 `CLAUDE_MODEL` · `safeParseJson` 패턴 존재
5. `src/lib/ud-brand.ts` 의 `buildBrandContext()` + `buildImpactModulesContext()` 존재
6. `src/lib/eval-strategy.ts` 의 `analyzeEvalStrategy()` · `sectionLabel()` export 존재
7. `src/app/api/ai/curriculum/route.ts` 존재 (수정 대상)

실패 시 STOP.

## 📖 Read These Files First

1. `CLAUDE.md` · `AGENTS.md`
2. **`docs/architecture/data-contract.md` §1.2 CurriculumSlice** — 출력 스펙
3. `src/lib/pipeline-context.ts` — `CurriculumSession`, `RfpSlice`, `StrategySlice` 타입
4. `src/lib/claude.ts` 전체 — 기존 `suggestCurriculum` 함수 시그니처·프롬프트 구조 확인 (**수정 금지**, 참고만)
5. `src/lib/ud-brand.ts` — `buildBrandContext()`, `buildImpactModulesContext()` 재사용
6. `src/lib/eval-strategy.ts` — `analyzeEvalStrategy()` 호출 가능
7. `src/lib/planning-direction.ts` — B1 패턴 참고 (stateless AI + 품질 검증 + 재시도)
8. `src/app/api/ai/curriculum/route.ts` 전체 — 현재 구현 확인 (수정 대상)
9. `src/lib/curriculum-rules.ts` — 룰 엔진 (참고)

## 🎯 Scope

### ✅ You CAN touch
- `src/lib/curriculum-ai.ts` (신규) — 프롬프트 빌더 + generateCurriculum 함수
- `src/app/api/ai/curriculum/route.ts` — 수정 (신규 함수 호출로 교체)

### ❌ You MUST NOT touch
- `src/lib/claude.ts` — 기존 함수 유지. 오직 `safeParseJson` · `CLAUDE_MODEL` · (있으면) 타입만 import
- `src/lib/pipeline-context.ts` — 타입 수정 금지, import 만
- `src/lib/ud-brand.ts` · `src/lib/eval-strategy.ts` — 수정 금지, import 만
- `prisma/schema.prisma` — 스키마 변경 금지
- `src/app/(dashboard)/**` — UI 는 C4 Wave 2 영역
- 다른 api route — C2/C3 영역
- `package.json` — 의존성 추가 금지

## 🛠 Tasks

### Step 1: 신규 모듈 타입

`src/lib/curriculum-ai.ts`:

```typescript
import type { RfpSlice, StrategySlice, CurriculumSession } from '@/lib/pipeline-context'
import type { ImpactModuleContext } from '@/lib/ud-brand'
import type { ExternalResearch } from '@/lib/claude'  // 기존 타입 재사용

/**
 * generateCurriculum 입력 — PipelineContext 의 관련 슬라이스만 받음.
 * API route 가 projectId 로부터 이것을 조립해서 전달.
 */
export interface GenerateCurriculumInput {
  rfp: RfpSlice                          // 필수 — Step 1 확정됨 전제
  strategy?: StrategySlice               // optional — Planning Agent 완료 시
  impactModules?: ImpactModuleContext[]  // optional — Phase E1 자동 추천 도입 시
  externalResearch?: ExternalResearch[]  // optional
  /** 발주처 톤 프리셋 (B1 의 CHANNEL_TONE_PROMPT 재활용) */
  channel?: 'B2G' | 'B2B' | 'renewal'
  /** 총 회차 (RFP 에서 못 읽으면 PM 이 주입) */
  totalSessions?: number
}

/**
 * AI 가 반환하는 원시 출력 (파싱 전).
 * 검증 후 CurriculumSession[] + designRationale 로 정제.
 */
export interface GenerateCurriculumResponse {
  sessions: CurriculumSession[]
  designRationale: string
  /** 설계에서 의도적으로 반영한 기획 방향 체크리스트 (검증용) */
  appliedDirection: {
    conceptReflected: boolean
    keyPointsReflected: string[]       // 반영된 핵심포인트 문장들
    evalStrategyAlignment: string      // 평가배점 top 1 에 어떻게 대응했는지
  }
}
```

### Step 2: 프롬프트 빌더

**핵심 주입 요소 (priority 순):**

1. **브랜드 자산** (ud-brand 의 buildBrandContext)
2. **Step 1 확정 기획 방향** — 제안컨셉 · 핵심포인트 · 평가전략
3. **발주처 톤** (B2G/B2B/renewal)
4. **Strategy 파생 키 메시지** (있으면)
5. **IMPACT 모듈 컨텍스트** (Phase E1 에 자동, 지금은 optional)
6. **외부 리서치** (있으면)
7. **출력 형식 JSON 지시**

**[Step 1 기획 방향] 섹션 프롬프트 예시:**
```
[Step 1 에서 PM 이 확정한 기획 방향 — 반드시 반영]
제안 컨셉: {rfp.proposalConcept}
제안 배경: {rfp.proposalBackground 요약 300자}
핵심 기획 포인트 3개:
  1. {point1}
  2. {point2}
  3. {point3}

평가배점 최고배점 항목:
  - {topItems[0].name} ({topItems[0].points}점, 섹션={sectionLabel(topItems[0].section)})
  - {topItems[1].name} ({topItems[1].points}점)
  - {topItems[2].name} ({topItems[2].points}점)
전체 가이드:
  {overallGuidance.join('\n')}

→ 위 최고배점 항목이 "커리큘럼" 섹션이면 커리큘럼에 전체 회차의 60%+ 실습/워크숍·
  Action Week 3회 이상 · 1:1 코칭 포함으로 강도 높게 설계.
```

`evalStrategy` 가 null 일 수 있음 — fallback 텍스트로 "평가배점 정보 없음, 일반적 최적화" 안내.

### Step 3: generateCurriculum 함수

```typescript
export async function generateCurriculum(
  input: GenerateCurriculumInput,
): Promise<{ ok: true; data: GenerateCurriculumResponse } | { ok: false; error: string; raw?: string }> {
  // 1. 프롬프트 조립
  // 2. Claude 호출 (CLAUDE_MODEL, max_tokens: 4096)
  // 3. safeParseJson (claude.ts 에서 import)
  // 4. 구조 검증 — validateGeneratedCurriculum()
  // 5. 재시도 1회 (실패 시)
  // 6. 성공 시 { ok: true, data }
}
```

**검증 기준 (`validateGeneratedCurriculum`):**
- `sessions.length >= 1`
- `designRationale.length >= 200`
- `appliedDirection.keyPointsReflected.length === rfp.keyPlanningPoints.length` (모든 포인트 반영 확인)
- `appliedDirection.conceptReflected === true`
- 각 session 의 필수 필드 (`sessionNo`, `title`, `durationHours`, `isTheory`, `isActionWeek`) 존재

**재시도 프롬프트 힌트:** "이전 출력에서 {실패 필드} 누락. 특히 '{rfp.keyPlanningPoints[0]}' 가 어느 세션에 반영됐는지 명시하세요."

### Step 4: API 라우트 수정

`src/app/api/ai/curriculum/route.ts`:

**현재 로직을 `generateCurriculum()` 호출로 교체:**

```typescript
// 기존 코드 일부 제거, 새 흐름:
import { generateCurriculum } from '@/lib/curriculum-ai'
import { buildPipelineContext } from '@/lib/pipeline-context'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return 401

  const { projectId, channel, totalSessions } = await req.json()
  if (!projectId) return 400 'PROJECT_ID_REQUIRED'

  // PipelineContext 에서 필요한 슬라이스만 뽑기
  const ctx = await buildPipelineContext(projectId)
  if (!ctx.rfp) return 400 'RFP_SLICE_MISSING'

  const result = await generateCurriculum({
    rfp: ctx.rfp,
    strategy: ctx.strategy,
    channel: channel ?? deriveChannel(ctx),
    totalSessions,
  })

  if (!result.ok) return 500 (result.error, result.raw)

  // stateless — DB 저장 금지. 호출자가 CurriculumItem 으로 저장.
  return NextResponse.json(result.data)
}
```

**중요:**
- stateless. CurriculumItem 저장은 기존 저장 API (`POST /api/curriculum/[projectId]/item` 등) 가 담당
- 에러 응답 명확 (400 · 401 · 500)
- 환경변수 미주입 이슈 (Phase B 교훈)

### Step 5: manifest 업데이트

`src/app/(dashboard)/projects/[id]/step-curriculum.manifest.ts` 의 `api` 필드에 변경 없음 (기존 `/api/ai/curriculum` 유지, 내부 구현만 교체).

단, manifest 의 `reads.context` 에 `'strategy'` 가 빠져있으면 추가:

```typescript
reads: {
  context: ['rfp', 'strategy'],   // strategy 추가 확인
  assets: ['impact-modules', 'winning-patterns', 'channel-presets'],
},
```

### Step 6: 검증

```bash
npm run typecheck
npm run build
```

두 개 모두 통과. 기존 `suggestCurriculum` 함수(`claude.ts`)는 그대로 존재 — deprecated 주석 추가 권장 (옵션).

## 🔒 Tech Constraints

- **Claude 모델:** `CLAUDE_MODEL` (claude.ts 상수)
- **JSON 파싱:** `safeParseJson` (claude.ts export 확인 필요, 없으면 본 모듈에 복제)
- **max_tokens:** 4096
- **any 금지** (신규 경로 = ESLint error 유지)
- **의존성 추가 금지**
- **stateless** — DB 쓰기 금지

## ✔️ Definition of Done

- [ ] `src/lib/curriculum-ai.ts` 신규 생성
- [ ] `generateCurriculum()` 구현 (프롬프트 조립 + Claude + 검증 + 재시도 1회)
- [ ] 출력 타입이 `CurriculumSlice` 의 subset 과 호환
- [ ] `RfpSlice.proposalConcept` · `keyPlanningPoints` · `evalStrategy` 모두 프롬프트에 주입
- [ ] `/api/ai/curriculum/route.ts` 가 신규 함수 호출로 교체됨
- [ ] `claude.ts` 수정 없음 (import 만)
- [ ] `pipeline-context.ts` / `ud-brand.ts` / `eval-strategy.ts` 수정 없음
- [ ] manifest.reads.context 에 'strategy' 포함 확인/추가
- [ ] `npm run typecheck` 통과
- [ ] `npm run build` 통과
- [ ] step-curriculum.tsx 건드리지 않음 (C4 영역)

## 📤 Return Format

```
C1 curriculum-ai 완료.

생성 파일:
- src/lib/curriculum-ai.ts (X줄)

수정 파일:
- src/app/api/ai/curriculum/route.ts (기존 로직 → generateCurriculum 호출)
- src/app/(dashboard)/projects/[id]/step-curriculum.manifest.ts (reads.context 확인/보완)

프롬프트 주입 구조:
- 브랜드 자산 (buildBrandContext)
- Step 1 기획 방향: concept · background · keyPlanningPoints · evalStrategy topItems
- channel tone (B2G/B2B/renewal)
- strategy.derivedKeyMessages (있으면)
- IMPACT 모듈 / 외부 리서치 (있으면)

출력 스펙:
- sessions: CurriculumSession[]
- designRationale: string (200자+)
- appliedDirection: { conceptReflected, keyPointsReflected[], evalStrategyAlignment }

품질 검증:
- 출력 필드 필수 체크 + 핵심포인트 모두 반영 확인 + 재시도 1회

검증:
- npm run typecheck: ✅
- npm run build: ✅

주의 / 이슈:
- safeParseJson 이 claude.ts 에서 non-export 면 복제 처리 (B1 사례 참조)
- [기타]

후속:
- C4 Wave 2 가 step-curriculum.tsx 에서 이 API 호출 + DataFlowBanner
- Phase D1 winning-patterns 자산 주입 시 프롬프트 확장
- Phase D2 ChannelPreset DB 로 하드코딩 교체
```

## 🚫 Do NOT

- claude.ts 수정 금지
- DB 쓰기 금지 (stateless)
- step-*.tsx 수정 금지
- pipeline-context.ts 타입 수정 금지
- ud-brand.ts · eval-strategy.ts 수정 금지
- 새 의존성 추가 금지
- `any` 사용 금지 (신규 경로 error)
- AI 에 "약자" 동정 프레임 유도 금지 (ud-brand-voice SKILL §11)

## 💡 Hints

- B1 의 `src/lib/planning-direction.ts` 패턴이 가장 좋은 참고. validate + 재시도 + 에러 분기 구조 그대로 적용.
- `safeParseJson` 이 claude.ts 에서 export 안 돼 있으면 B1 이 했던 것처럼 본 모듈에 복제 (10~15줄).
- `deriveChannel` 는 B1 의 planning-direction.ts 에 있음 — export 되어 있는지 확인 후 재사용. 아니면 간단히 복제.
- 프롬프트가 너무 길어지면 (8K+ tokens) 외부 리서치를 요약하거나 IMPACT 모듈을 상위 5개로 제한.
- 회차 수(totalSessions)는 rfp.parsed 에서 유도 시도 → 없으면 API 입력 필수로.

## 🏁 Final Note

Step 1 → Step 2 의 데이터 흐름 첫 구현. 여기서 품질 나쁘면 Step 3~6 전체 오염. **"제안 컨셉이 커리큘럼에 정말 반영됐는가"** 를 `appliedDirection` 으로 검증하는 패턴이 핵심. 수주 팀이 나중에 이 검증 필드를 실제로 보고 품질 판단함.
