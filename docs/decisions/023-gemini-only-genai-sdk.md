# ADR-023: LLM = Gemini 단일화 + `@google/genai` SDK 마이그레이션

- **상태**: **Accepted** (Gemini 단일화 = 사용자 지시 2026-06-01; SDK 마이그레이션 = 증거 기반 권장)
- **결정일**: 2026-06-01
- **결정자**: udpb@udimpact.ai + AI Architect
- **Scope**: `src/lib/ai-fallback.ts` · `src/lib/gemini.ts` · `src/lib/ai/embedding.ts` · `package.json` · eslint · `ai/config.ts`
- **관련**: ADR-022(2-tier Pro/Flash), ADR-013(invokeAi 단일 진입점), Tech Spec §1·§8
- **승계**: ADR-013의 "Gemini Primary + Claude Fallback" → **Gemini 단일화**로 갱신

---

## 배경 (Context)

사용자 지시(2026-06-01): **"LLM API는 Gemini로 통일한다."** + "지금 툴/스펙이 최적인가, 더 나은 방식?"

런타임·웹 검증으로 드러난 사실:
1. **현 SDK `@google/generative-ai@0.24.1` 은 deprecated·EOL** — Google이 2025-11-30 legacy 라이브러리 EOL 선언, repo(`deprecated-generative-ai-js`) 2025-12-16 **아카이브(read-only)**. 후속 = **`@google/genai`**(2025-05 GA, generative-ai+vertex 통합, 최신 기능·성능, 유지보수 중). 출처: ai.google.dev/gemini-api/docs/migrate.
2. **Anthropic fallback 은 死코드** — `ANTHROPIC_API_KEY` 미설정이라 Gemini 실패 시 throw(폴백 작동 안 함). Gemini-only 결정으로 제거 대상.
3. anthropic 직접 사용은 `ai-fallback.ts` **1곳뿐**(단일 진입점 덕). 리팩터 국소적.
4. Gemini 3.x = thinking 모델 — 현 SDK/코드에 `thinkingConfig`·네이티브 `responseSchema` 미사용 → 빈 응답·JSON 신뢰성을 safeParseJson 복구에만 의존.

안 하면: EOL·아카이브 SDK 위에서 운영(보안·기능 업데이트 끊김), 死폴백 유지, thinking·구조화출력 미활용으로 품질·신뢰성 손해.

---

## Decision

### 1. LLM = Gemini 단일화 (Anthropic 제거)
- `invokeAi` 를 **Gemini-only** 로. Claude 분기·`@anthropic-ai/sdk` 의존성·`CLAUDE_MODEL` 제거.
- **폴백은 intra-Gemini**: Pro(`gemini-3.1-pro-preview`) 실패 → `gemini-pro-latest` → Flash(`gemini-3.5-flash`). 가용성 확보(키 1개).
- **`invokeAi` 단일 진입점은 유지** — Gemini-only여도 라우팅(2-tier)·로깅·재시도·구조화출력·thinking 설정의 단일 지점으로 가치. eslint `no-restricted-imports` 유지(`@google/genai` 직접 import는 ai-fallback/gemini/embedding 예외만).

### 2. SDK 마이그레이션 `@google/generative-ai` → `@google/genai`
- `package.json`: `@google/generative-ai`·`@anthropic-ai/sdk` 제거, `@google/genai` 추가.
- `gemini.ts`·`embedding.ts`·web-search 의 SDK 호출을 `@google/genai` API로 교체. **`invokeAi`/`invokeGemini` 시그니처는 보존**(뒤 구현만 교체 → RET-1 등 호출부 무영향).
- eslint 제한 import 대상도 `@google/genai` 로 갱신.

### 3. 네이티브 구조화 출력 채택
- JSON 필수 콜은 `responseMimeType:'application/json'` + `responseSchema`(Zod→스키마) 로 **유효 JSON 보장**. `safeParseJson` 은 fallback(이중 안전).

### 4. thinking 제어
- tier별 `thinkingConfig`(예산): Pro 무거운 생성=충분히, Flash 추출=최소/off. `maxOutputTokens` 는 thinking 감안 크게. `usageMetadata.thoughtsTokenCount` 로깅.

### 5. 후속 (사용자 확정 2026-06-01)
- **Batch API** — ingest contextual blurb 대량 처리(새 SDK batch). 비용·속도. → **BR-batch 브리프** (AI-1 후).
- **LLM 트레이싱 강화** — 호출별 {label·tier·model·in/out/thoughts 토큰·elapsed·fallback·비용추정} 구조화 trace. 권장: 경량 구조화 로그/DB 우선, Lamin(`@lmnr-ai/lmnr`)은 선택. → **AI-2 브리프** (AI-1 후).
- pgvector → DATA-2 (계획됨).
> ⚠️ Batch·트레이싱 모두 LLM 코어(gemini/ai-fallback) 위에서 작동 → **AI-1 완료가 선결**(동시 수정 충돌 방지).

---

## Consequences

### Positive
- 지원되는 GA SDK로 — 보안·신기능·성능 지속. 코드·의존성 단순(1 provider).
- 死폴백 제거 + intra-Gemini 폴백으로 실질 가용성.
- 네이티브 구조화 출력·thinking 제어로 엔진 JSON 신뢰성·품질 ↑(빈 응답 방지).

### Negative / Trade-offs
- 단일 provider 종속(Gemini 장애 시 전체 영향) — intra-Gemini 폴백으로 완화. 추후 필요 시 다른 provider 재도입은 invokeAi 뒤에서 가능.
- 마이그레이션 작업량(국소적이나 LLM 코어 손댐) — 회귀 위험은 인터페이스 보존 + eval 게이트로 방어.

### Follow-ups
- [ ] **AI-1 브리프** — SDK 마이그레이션 + Gemini-only 리팩터 (RET-1 완료 후, ai/config·gemini 충돌 방지)
- [ ] CLAUDE.md AI API 섹션 정정(현재 "googleapis ^171.4.0" + Claude fallback = 오기) · Tech Spec §1·§8 · glossary §8 갱신
- [ ] 네이티브 responseSchema 도입은 엔진(EX) 브리프와 연계
- [ ] 마이그레이션 후 eval 재측정(회귀 0 확인)

## References
- 웹 검증: ai.google.dev/gemini-api/docs/migrate · github.com/google-gemini/deprecated-generative-ai-js (archived) · ai.google.dev/gemini-api/docs/libraries
- 런타임 프로브(ADR-022) · `src/lib/ai-fallback.ts`·`gemini.ts` · Tech Spec §8

## Teaching Notes
- **단일 진입점의 배당금**: provider/SDK 교체가 1~2파일 리팩터로 끝남(anthropic 직접사용 1곳). 추상화는 이럴 때 값을 한다.
- "deprecated"는 동작해도 위험 — EOL·아카이브 SDK는 보안/기능 업데이트가 끊긴다. 동작 != 적합.
- thinking 모델은 출력 예산을 thinking과 나눈다 — 제어 안 하면 빈 응답. 새 SDK의 thinkingConfig로 명시 제어.
