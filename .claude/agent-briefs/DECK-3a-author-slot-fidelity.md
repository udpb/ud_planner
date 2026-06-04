# DECK-3a — author 슬롯 충실도: 슬라이드별 저작이 스키마-정확한 DeckSpec 을 내게 한다

> 자급자족 브리프. `이 브리프 + CLAUDE.md + AGENTS.md + docs/glossary.md + docs/decisions/025-deck-first-html-substrate.md` 만으로 작업. 의문 = STOP 후 보고.

- **트랙/ID**: DECK-3a (ADR-025 Phase 3, DECK-3 후속 핫픽스)
- **상태**: 🟡 in-progress

---

## 0. 왜 (메인 실측 진단 — 2026-06-04)
메인이 `authorDeck` 를 **실 Gemini 로 실행**(189s) → `architectStoryline` 은 정상(좋은 kind 선택·강한 액션 타이틀)이나, **`authorSlide` 가 거의 모든 슬라이드에서 zod 검증 실패 → skip → 덱이 1장(cover)만 생존**. 원인: authorSlide 프롬프트가 component `kind` 이름만 주고 **각 kind 의 정확한 필드 스키마를 주지 않아** LLM 이 키를 틀리게 생성.

실측된 누락(=LLM이 틀린 키 사용):
- `sectionDivider`: `display`·`sectionName` 누락
- `coachDetailGrid`: `coaches[]` 누락 · `evidence[].proves` 누락
- `iconProcess`: `steps[]` 누락 · `kpiWithLogic`: `kpis[].value`·`logic` 누락 · `composite`: `parts[]` 누락 · `closing`: `title` 누락

## 1. 목표 (한 문장)
`authorSlide`(및 필요 시 `architectStoryline`)가 **각 슬라이드 kind 의 정확한 필드 스키마를 LLM 에 주입**하고 **zod 실패 시 1회 교정 재시도**하게 해서, 실 LLM 실행 시 **본문 슬라이드 대부분이 검증 통과**(skip 최소화)하도록 만든다.

## 2. 스코프 — CAN touch / MUST NOT touch
**CAN touch:**
- `src/lib/deck/author.ts` — `authorSlide` 프롬프트에 **per-kind 필드 계약** 주입 + **zod-error 피드백 1회 재시도**. 필요 시 `architectStoryline` 도 보강(과다 sectionDivider 억제 등).
- `src/lib/deck/spec.ts` — **per-kind 필드 스펙 카탈로그 생성기**(LLM-facing 필드 설명/예시)를 spec 에서 파생해 export(예: `KIND_FIELD_SPEC: Record<SlideKind,string>` 또는 kind별 최소 예시 JSON). **zod 스키마 자체·필드명 변경 금지**(렌더 계약 동결 — DECK-3 `version:'deck-v3'`). 추가 export만.
- 신규/확장 `scripts/` 결정론 유닛(아래 §5) — 카탈로그가 전 kind 커버하는지.

**MUST NOT touch:**
- `spec.ts` 의 기존 zod 스키마/필드명/`version`(계약 동결) · `render-spec.tsx`(렌더 경계) · `render-html.ts`.
- `src/lib/ai-fallback.ts` `invokeAi` 시그니처 · `ai/config.ts` 라우팅 키 · `prisma` · manifest · 다른 트랙.
- `src/app/**`(라우트·UI = DECK-3b).

## 3. 구현
1. **per-kind 필드 계약 주입**: 각 `SlideKind` 에 대해 "정확한 JSON 슬롯 형태"(필드명·타입·필수/선택 + 1줄 의미)를 문자열로 만들어, `authorSlide` 프롬프트에 **선택된 kind 의 것만** 삽입. 가장 신뢰도 높은 방법 = **kind별 최소 유효 예시 JSON**(few-shot) 1개씩. spec.ts 의 진실(필드명)에서 파생하거나(권장) 손작성하되 **spec 과 1:1 일치**해야 함(불일치 시 의미 없음). 근거(`EvidenceItem`)는 `{figure, proves, source}` 형태를 명시.
2. **zod-error 교정 재시도**: `safeParseDeckSpec` 실패 시, **그 error 메시지를 프롬프트에 덧붙여 1회 재호출** → 그래도 실패면 skip(현 동작). (무한 루프 금지 — 정확히 1회.)
3. **architectStoryline 보강(선택)**: sectionDivider 가 과다하지 않게(섹션 전환에만), 본문 위주가 되도록 지침 한 줄. body 슬라이드가 충분히(≥6) 나오게.
4. AI 진입점 = `invokeAi` 단일 유지. 모델 라우팅 키 유지(storyline=Pro `engine.section.core`, slot=Flash `engine.section`). maxTokens 충분히.

## 4. 데이터/계약 주의
- 렌더 계약(`deck-v3`)은 **동결** — 필드명을 바꾸지 말고 **LLM 이 그 필드명을 쓰게** 만드는 게 임무.
- 수치 창작 금지 가드 유지(근거는 grounding 값만, 없으면 비움). 자산 경로 placeholder 허용.

## 5. 검증
- **결정론 유닛(서브가 직접)**: `KIND_FIELD_SPEC`/예시 카탈로그가 **모든 `SlideKind` 를 커버**하고, **각 kind 예시 JSON 이 `safeParseDeckSpec` 를 통과**함을 단언하는 스크립트(`scripts/_check-kind-catalog.ts` 등) → `npx tsx` 로 PASS. (LLM·DB 없음.)
- `npm run typecheck` 0 · `npm run lint`(touch 파일) · `npm run check:manifest` 통과.
- ⚠️ **실 LLM 실행(authorDeck) 검증은 메인이 직접** (`scripts/_smoke-author.ts` 재실행). 서브는 **LLM 호출 금지**(긴 run·쿼터). 결정론 유닛까지만.

## 6. Return Format (5섹션)
- ✅ 한 일 / ❌ 못한 일(실 LLM 미검증 명시) / 🤔 결정(ADR 후보만) / 🔬 검증(결정론 유닛 출력 + typecheck/lint/manifest) / ⚠️ 위험
- `git diff --name-only` ⊆ CAN-touch 확인. 신규 의존성 명시(없어야 정상).

## 7. Hints
- 실측 누락 필드(§0)를 반드시 카탈로그/예시로 커버: sectionDivider(display·sectionName)·coachDetailGrid(coaches[]·evidence.proves)·iconProcess(steps[])·kpiWithLogic(kpis[].value·logic)·composite(parts[])·closing(title).
- 카탈로그를 spec.ts 에서 파생하면 향후 필드 변경에 자동 동기(드리프트 방지). 손작성이면 spec 과 동기 단언을 유닛에 포함.
- few-shot 예시는 **짧고 유효한** 실제 DeckSlide JSON(meta+body) 1개씩이 가장 효과적.
