# DECK-4 — 밀도 비평 루프: 자동 덱을 훨씬 빡빡하게

> 자급자족 브리프. `이 브리프 + CLAUDE.md + AGENTS.md + docs/glossary.md + docs/decisions/025-deck-first-html-substrate.md` 만으로 작업. 의문 = STOP 후 보고.

- **트랙/ID**: DECK-4 (ADR-025 Phase 4)
- **상태**: 🟡 in-progress
- **선행(✅)**: DECK-3/3a(author 작동) · DECK-2(rich 컴포넌트).

---

## 0. 왜 (사용자 피드백 2026-06-04)
자동 생성 덱이 "유능하나 보수적"이다 — **셀 중앙 여백이 크고, 항목수가 적다**(예: 코치 2명만, 커리큘럼 셀 절반 비어 있음). 사용자: **"슬라이드가 훨씬 빡빡하게 들어갔으면."** DECK-4 = **밀도 비평 루프**로 sparse 슬라이드를 감지해 densify(항목·코치·디테일·셀 채움)하고, 컴포넌트의 세로 여백을 줄인다.
(⚠️ **이미지 placeholder 존**은 이번 범위 밖 — plan 항목. 여기선 *밀도*만.)

## 1. 목표 (한 문장)
authorDeck 산출 슬라이드를 **밀도 기준으로 비평→재저작**하는 루프와, **컴포넌트 세로 여백 축소**(채움 분배)로, 자동 덱이 당선 덱 수준으로 빡빡하게 차게 한다.

## 2. 스코프 — CAN touch / MUST NOT touch
**CAN touch:**
- `src/lib/deck/author.ts` — **밀도 비평 루프** 추가: 각 body 슬라이드 저작 후(또는 authorDeck 말미) (a) 결정론 밀도 측정 + (b) 미달 시 densify 재저작(1회). authorSlide 프롬프트에 "셀을 비우지 말고 grounding으로 채워라 / 코치·항목은 가능한 많이(상한까지)" 지침 강화.
- `src/lib/deck/spec.ts` — 밀도 측정 헬퍼(`slideDensityScore(slide)`: kind별 항목수 기반 점수) export 추가. **zod 스키마/필드명/version 변경 금지.**
- `src/components/express/slides/rich/index.tsx` + `src/styles/underdogs-slide.css` — **세로 여백 축소**: 키 큰 컴포넌트(coachDetailGrid·curriculumMatrix·strategyCanvas 등)가 가용 높이를 **채우도록**(flex 분배/min-height/줄간격) 조정. 카드 중앙 빈 공간 제거. props 변경 금지(하위호환).
- `scripts/_render-deck.ts` 또는 신규 측정 스크립트 — densify 전/후 밀도 비교용(결정론).

**MUST NOT touch:**
- `src/lib/deck/{render-spec,render-html}.ts` 로직 · `render-worker/**` · `src/app/**` · `invokeAi` 시그니처 · `prisma` · `express/schema.ts` 키 · manifest · 다른 트랙.
- rich 컴포넌트 **props 시그니처**(읽기/스타일만; 새 prop 필요하면 STOP 보고).

## 3. 구현
- **결정론 밀도 측정** `slideDensityScore`: kind별 "정보 항목수"를 센다(예 coachDetailGrid=coaches.length, curriculumMatrix=Σ phases.activities+deliverables, kpiWithLogic=kpis.length, strategyCanvas=zones.length, iconProcess=steps.length, composite=Σparts). + evidence 유무. 슬라이드별 **목표 floor**(예 coaches≥4, curriculum phases≥3·각 활동≥3, kpis≥3, zones≥3) 정의.
- **비평 루프**(author.ts): authorSlide 결과가 floor 미달 → **densify 재저작 1회**: 프롬프트에 "현재 N개 → 최소 M개로, grounding의 추가 사실/수치로 셀을 채워라(창작 금지). 비어 보이는 칸 없게." + 부족 항목 명시. floor 충족 또는 1회 재시도 후 채택. (LLM critic 추가는 선택 — 결정론 floor만으로도 1차 목표 달성.)
- **컴포넌트 여백 축소**: coachDetailGrid 카드 = 약력+배지를 세로 분배(공백 제거) 또는 약력 줄수 ↑. curriculumMatrix 셀 = 활동/산출물 사이 공백 축소·활동 더 노출. 키 큰 박스는 `flex:1`+`justify-content:space-between`/적정 패딩으로 가용 높이 채움. 디자인 킷 가드 유지(여백 호흡은 유지하되 "빈 절반" 제거).
- authorSlide 프롬프트의 항목 상한을 floor와 함께 명시(많이 채우되 컴포넌트 상한 내).

## 4. 검증
- **결정론**(서브 직접, LLM 無): 손작성 fixture(또는 기존 `deckspec-B2G.json`을 일부 sparse하게 만든 변형)로 (a) `slideDensityScore`가 floor 판정 정확, (b) 컴포넌트 여백 축소가 렌더에 반영(전/후 dead-space 측정: 본문 평균 dead-space가 기존 대비 감소, 목표 < 8%). `scripts/_render-deck.ts`류로 PNG·측정 출력.
- `npm run typecheck` 0 · `npm run lint`(touch) · `npm run check:manifest`.
- ⚠️ **실 LLM densify 루프는 서브가 돌리지 말 것**(쿼터·긴 run). 비평 루프 코드는 typecheck/유닛까지. **메인이 author E2E(`scripts/_smoke-deck-e2e.ts`)로 densify 효과 실측**.
- ⚠️ 백그라운드 장기 프로세스·LLM·DB 금지.

## 5. Return Format (5섹션)
- ✅ 한 일 / ❌ 못한 일(실 LLM densify 미검증 명시) / 🤔 결정(ADR 후보만) / 🔬 검증(밀도 floor 유닛 + 전/후 dead-space 측정 + typecheck/lint/manifest) / ⚠️ 위험
- `git diff --name-only` ⊆ CAN-touch. 신규 의존성 명시(없어야 정상).

## 6. Hints
- 기존 밀도 측정 패턴: `scripts/_render-deck.ts`가 `data-block`/`reconstructSlide`로 블록·dead-space를 잰다 — 재사용.
- coachDetailGrid 현 증상: 카드 키가 큰데 약력 3줄+배지 2개가 위/아래로만 붙어 중앙 공백. → 약력 줄수 늘리거나 카드 높이 줄이거나 세로 분배.
- densify는 grounding 내 사실로만 — **수치 창작 금지** 가드 유지.
- 이미지 placeholder 존(plan 항목)은 만들지 말 것 — 밀도에 집중.
