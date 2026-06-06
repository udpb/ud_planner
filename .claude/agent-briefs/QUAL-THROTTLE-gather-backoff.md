# QUAL-THROTTLE — gather 동시성 캡 + invokeAi 429 지수 백오프

> 자급자족 브리프. `이 브리프 + CLAUDE.md + AGENTS.md + docs/glossary.md` 만으로 작업. 의문 = STOP 후 보고.

- **트랙/ID**: QUAL-THROTTLE
- **상태**: 🟡 in-progress

---

## 0. 왜 (메인 실측 2026-06-04)
`gather`가 7섹션 retrieve(임베딩+rerank LLM)를 **한꺼번에 병렬**로 쏴서 Gemini **분당 한도(429 TooManyRequests)를 버스트**로 친다(실 E2E에서 rerank/passage 검색 429 다발). 결과는 RRF 폴백으로 degrade되지만, 안정성·grounding 품질이 떨어진다. **동시성 캡 + 429 백오프 재시도**로 버스트를 없앤다.

## 1. 목표 (한 문장)
(1) `invokeAi`(또는 ai-fallback 내부)에 **429 지수 백오프 재시도**(같은 모델, 폴백 전), (2) `gather`의 섹션 retrieve **동시성 제한**으로 rate-limit 버스트를 제거한다.

## 2. 스코프 — CAN touch / MUST NOT touch
**CAN touch:**
- `src/lib/ai-fallback.ts` — 429(RESOURCE_EXHAUSTED) 시 **같은 모델 백오프 재시도**(예 최대 3회, base 800ms·지수·jitter) 후에도 실패면 기존 폴백 체인으로. **`invokeAi` 시그니처·export 불변**(내부 로직만). prepay-소진 류(메시지에 "prepayment credits")는 무한 재시도 말고 빠르게 폴백/실패(메시지로 구분, 1회만).
- `src/lib/express/engine/gather.ts` — 섹션별 retrieve를 **동시성 N(예 2~3)** 으로 제한(배치 또는 경량 limiter). 순차도 허용(품질 우선).
- 필요 시 `src/lib/retrieval/*` 의 rerank 호출부 — rerank 실패가 치명적이지 않게(이미 RRF 폴백 있음) 유지하되, 호출 빈도 자체를 gather 동시성으로 낮춤.
- 신규 경량 유틸 `src/lib/util/limit.ts`(p-limit 류 5줄) 또는 인라인 — **외부 의존성 추가 금지**.

**MUST NOT touch:**
- `invokeAi` 시그니처/반환 타입 · `prisma` · `express/schema.ts` 키 · manifest · `src/app/**` · `render-worker/**` · deck 트랙(`src/lib/deck/*`) · 다른 트랙.
- 모델 라우팅(`ai/config.ts`) 키·정책.

## 3. 구현
- **백오프**: `ai-fallback.ts`의 모델 호출 부분에서 429를 잡아 `for (attempt<MAX) { try call; catch 429 → await backoff(attempt); }`. 429가 아닌 에러는 즉시 폴백. prepay-소진 429는 재시도 1회로 제한(메시지 매칭). 로깅 유지(provider/model/attempt).
- **동시성 캡**: gather에서 `Promise.all(sections.map(...))` → 동시성 제한(배치 크기 2~3 또는 limiter). 섹션 순서·결과 동일 보장.
- 토큰/시간 약간 증가 허용(품질 우선·토큰 무제한 전제). 무한 루프 금지(재시도 상한).

## 4. 검증
- **유닛/결정론**(LLM·DB 없음): limiter 유닛(동시성 ≤ N 보장), 백오프 함수 유닛(지수·상한). `scripts/_check-throttle.ts`류.
- `npm run typecheck` 0 · `npm run lint`(touch) · `npm run check:manifest`.
- ⚠️ **실 gather E2E(429 재현)는 서브가 돌리지 말 것** — 메인이 `scripts/_smoke-deck-e2e.ts`로 버스트 감소 실측. 서브는 코드+유닛까지.
- ⚠️ 백그라운드 장기 프로세스·LLM·DB 금지.

## 5. Return Format (5섹션)
- ✅ 한 일 / ❌ 못한 일(실 E2E 미검증 명시) / 🤔 결정(ADR 후보만) / 🔬 검증(limiter·backoff 유닛 + typecheck/lint/manifest) / ⚠️ 위험
- `git diff --name-only` ⊆ CAN-touch. 신규 의존성 0 확인.

## 6. Hints
- 메인 실측 에러: `429 RESOURCE_EXHAUSTED` (rerank·passage·storyline). 같은 키가 임베딩에도 쓰이므로 gather 동시성이 핵심.
- 기존 폴백 체인(3.1Pro→2.5Pro→3.5Flash)은 유지 — 백오프는 **그 이전 단계**(같은 모델 재시도)로 추가.
- p-limit 등 의존성 추가 금지 — 5줄짜리 세마포어로 충분.
