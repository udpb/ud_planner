# Brief BR-CF-4 — 메시지 value-chain 관통 (ADR-031 Wave 4)

> **자급자족.** 본 파일 + `docs/decisions/031-concept-first-program-design.md`(§③) + W1 `ConceptShape`. 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-CF-4-message-value-chain` · 2026-06-27 |
| 격리 | ud-ops `feat/sroi-integration` in-place |
| 전제 | W1~W3 완료. 본 웨이브=컨셉·핵심 메시지를 하류 프롬프트에 주입(관통). |

## 🎯 Mission
정한 컨셉(`strategicNotes.concept`: winTheme·keyMessages[3]·differentiation)이 **커리큘럼 rationale → SROI 내러티브 → 제안서** 프롬프트에 **context로 주입**돼 일관 관통하게 한다(ADR-008 value-chain 연장). 출력 구조·엔진 로직 무변경 — **프롬프트 컨텍스트 추가만.**

## 📋 현재 (survey 확정 + 위치 단서)
- 컨셉 = `Project.strategicNotes.concept`(W1, `ConceptShape` in `concept-synth.ts`). 각 엔진이 project/strategicNotes 로드하는 지점에서 읽어 주입.
- **커리큘럼**: `src/lib/program-design/generate-plan.ts` — 구조/rationale 생성 프롬프트. (PlanInput 가 strategicNotes 운반하는지 `plan-input.ts` 확인.)
- **SROI**: `src/lib/impact/forecast.ts` `forecastImpact` — 프롬프트에 이미 `draft.keyMessages` 받는 블록 존재(survey L~416). concept.keyMessages 가 그 자리에 흐르게.
- **제안서**: `src/lib/proposal-ai.ts`(또는 `src/lib/ai/proposal-section.ts`) 섹션 프롬프트 — `buildPipelineContext`/`context.strategicNotes` 경유. concept.keyMessages 주입.
- 공통: 모든 AI 호출 `invokeAi` 단일 진입. concept 없으면 블록 생략(graceful).

## 🧩 주입 블록 (공통 포맷)
```
[프로그램 컨셉 — 전 단계 일관 관통]
컨셉: {winTheme}
핵심 메시지:
1. {keyMessages[0]}
2. {keyMessages[1]}
3. {keyMessages[2]}
차별점: {differentiation}
→ 위 메시지가 {이 산출물}에 일관되게 반영되어야 한다(억지 삽입 금지, 자연스럽게).
```
- concept 부재/불완전 → 블록 생략. 점수/합격/SROI 단정 금지(기존 규칙 유지). 헬퍼로 한 곳에 포맷(중복 방지).

## 🎯 Scope
### CAN touch
- **신규(소)** `src/lib/program-design/concept-context.ts` (`conceptContextBlock(concept|strategicNotes): string` — 위 포맷·graceful. 한 곳에서 포맷)
- `src/lib/program-design/generate-plan.ts` (커리큘럼 프롬프트에 블록 주입 — strategicNotes/concept 읽어)
- `src/lib/impact/forecast.ts` (SROI 내러티브 프롬프트에 concept.keyMessages/블록 주입)
- `src/lib/proposal-ai.ts` **또는** `src/lib/ai/proposal-section.ts` (섹션 프롬프트에 블록 주입 — 둘 중 실제 프롬프트 조립처)
- (필요 최소) `src/lib/program-design/plan-input.ts` / `src/lib/pipeline-context.ts` (concept/strategicNotes 가 엔진까지 안 닿으면 운반 추가)
### MUST NOT touch
- concept route/engine(W1)·gate(W3)·UI(W2) · `OperatingType`/resolve-rules · budget-calc(결정론, 본 웨이브 제외) · prisma · `invokeAi` 시그 · `components/**` · 출력 스키마(섹션 키 등)

## 🛠 Tasks
1. **concept-context.ts** — `conceptContextBlock` 헬퍼(concept 또는 strategicNotes 받아 위 블록 문자열, 없으면 ''). 순수.
2. **커리큘럼(generate-plan)** — 구조/rationale 프롬프트 조립부에 블록 삽입(strategicNotes.concept 읽기 — PlanInput 에 있으면 사용, 없으면 plan-input 에 운반 추가 최소). rationale 가 컨셉/메시지를 반영하도록.
3. **SROI(forecast)** — 기존 keyMessages 블록 자리에 concept.keyMessages 우선 사용(있으면) + 컨셉 한 줄. 내러티브 일관.
4. **제안서(proposal-ai/section)** — 섹션 프롬프트에 블록 주입(buildPipelineContext 의 strategicNotes.concept 경유). 7섹션이 컨셉/메시지 관통.
5. budget 은 결정론이라 제외(향후 budget-ops 대화에서 메시지 언급은 별건). graceful·억지 삽입 금지 프롬프트 명시.

## 🧪 Self-Verification
- [ ] `typecheck`·`lint`(신규0)·`check:manifest`·`build` 통과 · `git diff` ⊆ CAN-touch(+신규 1)
- [ ] 스키마 변경 0. 출력 구조(섹션 키·forecast shape) 무변경 — 프롬프트 컨텍스트만 추가. concept 없으면 블록 생략(회귀 0).
- [ ] 커리큘럼·SROI·제안서 프롬프트에 컨셉 블록이 들어가는 코드 경로 확인.
- [ ] ⚠️ 메인이 프리뷰에서 (컨셉 확정한 프로젝트로) 커리큘럼/제안서 생성 시 메시지 반영 사후 검수 → **코드 ✓**. 백그라운드 dev·커밋 금지.

## 📤 Return (5섹션): ✅한일/❌못한일/🤔결정(주입 지점·운반 경로)/🔬검증(`코드 ✓`+git diff/`시각 미확인`)/⚠️위험

## ⚠️ 주의
- 프롬프트 컨텍스트 추가만 — 엔진 로직·출력 스키마·invokeAi 시그 무변경. concept 부재 시 완전 무영향(graceful). budget-calc 제외. 커밋은 메인.
