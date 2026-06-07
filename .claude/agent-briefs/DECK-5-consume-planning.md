# DECK-5 — 덱이 기획을 소비 (PipelineContext) + 제안서 스텝에 배치

> 자급자족 브리프. `이 브리프 + CLAUDE.md + AGENTS.md + docs/glossary.md + docs/decisions/026-deck-as-planning-culmination.md` 만으로 작업. 의문 = STOP 후 보고.

- **트랙/ID**: DECK-5 (ADR-026)
- **상태**: 🟡 in-progress
- **선행(✅)**: DECK-3/3a(author), DECK-3b(라우트·워커 렌더 — **무변경 재사용**), DECK-4·THROTTLE.

---

## 0. 왜 (ADR-026)
덱이 RFP+코퍼스만 보고 **기획 산출물(커리큘럼·코치·예산·임팩트)을 우회**해서, 흐름이 안 보이고 PPT가 "처음부터" 나옴. **소프트+가산(additive)** 으로: 있으면 기획을 우선 근거로 쓰고, 없으면 지금 동작 그대로. 위치는 흐름의 마지막(제안서 스텝)으로.

## 1. 목표 (한 문장)
덱 생성이 `buildPipelineContext(projectId)`의 **실제 커리큘럼·코치·예산·임팩트를 우선 근거**로 슬라이드를 채우게 하고(빈 슬라이스는 graceful 생략/가안 + 경고), 덱 생성 UI를 **제안서 스텝(흐름의 끝)**으로 옮긴다. **렌더 파이프라인(DeckSpec→워커→PDF)·author 골격은 그대로.**

## 2. 스코프 — CAN touch / MUST NOT touch
**CAN touch:**
- `src/app/api/projects/[id]/deck/route.ts` — `buildPipelineContext(id)` 조립(try/catch fail-safe) → author 에 전달. 빈 슬라이스 preflight 경고를 응답 `{ deckSpec, warnings }` 로.
- `src/lib/deck/author.ts` — `DeckAuthorInput` 에 `pipeline?: PipelineContext` 추가(**optional, 가산**). `groundingBlock`/슬롯 프롬프트가 pipeline 의 커리큘럼·코치·예산·임팩트를 **우선 근거**로 사용. 없으면 기존(EvidencePool) 그대로. 빈 단계는 슬라이드 생략 또는 '가안' 라벨(프롬프트 지시). **수치 창작 금지 가드 유지** — pipeline/제공 값만.
- UI: `src/components/deck/DeckPanel.tsx` 를 **제안서 스텝**(`src/app/(dashboard)/projects/[id]/step-proposal.tsx` 또는 그 stage 컴포넌트)의 **최종 액션**으로 이동/임베드. 프로젝트 페이지(`page.tsx`) 하단의 독립 DeckPanel 은 **제거**. 경고 토스트 표시.
- `src/components/deck/*` — 경고 표시·위치 조정.

**MUST NOT touch:**
- `src/lib/deck/{spec,render-spec,render-html,deck-render-entry,build-worker-html,worker-client}.ts` · `render-worker/**` (렌더 파이프라인 무변경).
- `src/lib/pipeline-context.ts`(읽기만 — buildPipelineContext 호출) · `prisma` · `invokeAi` · `express/schema.ts` 키 · manifest · 다른 트랙.
- author 의 모델 라우팅·storyline/slot 구조(프롬프트 내용만 보강, invokeAi 단일 유지).

## 3. 구현 (소프트+가산 — 회귀 최소)
1. **route**: `const pipeline = await buildPipelineContext(id).catch(() => null)`. author 에 `pipeline` 전달. 생성 후 빈 슬라이스 체크 → `warnings`(예: "예산 미작성 — 예산 슬라이드 가안", "임팩트 미작성 — 생략") 응답에 포함. 기존 gather/EngineInput 흐름 유지(보조 근거).
2. **author**: `DeckAuthorInput.pipeline?` 추가. grounding 빌드 시 pipeline 슬라이스를 **사실 블록**으로:
   - 커리큘럼 → `pipeline.curriculum.sessions[]`(주차·세션·Action Week) 를 curriculumMatrix 근거로.
   - 코치 → `pipeline.coaches.assignments[]` + 코치 메타(실명·약력) 를 coachDetailGrid 근거로.
   - 예산 → `pipeline.budget.structure`+`sroiForecast` 를 예산/kpi 근거로.
   - 임팩트 → `pipeline.impact.logicModel`(Impact→…→Outcome) 를 임팩트 슬라이드 근거로.
   - storyline 프롬프트: "**기획에 있는 단계는 그 실제 데이터로**, 없는 단계는 슬라이드 생략 또는 '가안' 표시. 코퍼스는 차별화·헤드라인 보조." 슬롯 프롬프트: pipeline 값 우선, 없으면 EvidencePool, **둘 다 없으면 비움(창작 금지)**.
3. **UI**: DeckPanel 을 제안서 스텝의 최종 카드로. 프로젝트 페이지 하단 독립 패널 제거. 생성 응답 `warnings` 를 토스트/배지로. (게이트는 하드하게 안 함 — 소프트.)

## 4. 데이터 주의 (실측)
- 커리큘럼·코치 보통 채워짐. **예산·임팩트 자주 빔** → graceful 필수(생략/가안). buildPipelineContext 슬라이스는 전부 optional — 항상 null 체크.
- 코치 실명/약력은 Coach 모델/assignment 에서. 없으면 placeholder 유지(DATA-2).

## 5. 검증
- **결정론(서브 직접)**: `npm run typecheck` 0 · `npm run lint`(touch) · `npm run check:manifest`. 렌더 fixture 회귀 무영향(`npx tsx scripts/_render-spec.ts` PASS — 렌더 파이프라인 무변경 확인). **빈 pipeline(null)일 때 author 가 기존처럼 동작**하는 단위(가능하면).
- ⚠️ **실 LLM E2E(덱이 실제 커리큘럼·코치 반영)는 서브가 돌리지 말 것** — 쿼터·긴 run + 기획 채워진 프로젝트 필요. **메인이 라이브 검증**(기획 단계 채워진 프로젝트로 덱 생성 → 커리큘럼/코치 슬라이드가 실데이터인지).
- ⚠️ 백그라운드 장기·LLM·DB 금지(서브). UI 변경은 typecheck/lint 까지.

## 6. Return Format (5섹션)
- ✅ 한 일 / ❌ 못한 일(실 LLM 미검증·UI 위치 메인 육안) / 🤔 결정(ADR 후보만) / 🔬 검증(typecheck/lint/manifest + render-spec 회귀 PASS + null-pipeline 동작) / ⚠️ 위험
- `git diff --name-only` ⊆ CAN-touch. 신규 의존성(없어야 정상).

## 7. Hints
- `buildPipelineContext`·슬라이스 타입: `src/lib/pipeline-context.ts`(RfpSlice·CurriculumSlice·CoachesSlice·BudgetSlice·ImpactSlice). 선례: `proposal-ai.ts generateProposalSection(sectionNo, context)` 가 PipelineContext 소비 — grounding 빌드 참고.
- author 골격(architectStoryline→authorSlide→authorDeck) 유지. grounding 블록에 pipeline 사실만 추가하면 슬롯이 자연히 실데이터로 채워짐.
- DeckPanel 이동 시 props(projectId·projectName) 그대로. 제안서 스텝 컴포넌트 구조 확인 후 최소 침습.
- 게이트/자동시드 만들지 말 것(소프트 — 버그 최소).
