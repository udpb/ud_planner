# Brief AI-1 — `@google/genai` SDK 마이그레이션 + Gemini 단일화

> **자급자족.** 본 파일 + `../../CLAUDE.md` + `../../AGENTS.md` + `../../docs/glossary.md`.
> 막히면 추측 금지 → STOP 후 메인 보고.

| 메타 | 값 |
|------|----|
| ID | `AI-1-genai-sdk-migration` |
| 작성일 | 2026-06-01 |
| 상태 | ✅ 완료 (2026-06-01, 메인 검증: @google/genai 2.7.0·구SDK import 0·typecheck 0·manifest 0·scope clean). 🔴 런타임 positive 확인은 spend cap 429로 보류(코드 정상, 외부 빌링). |
| 우선순위 | P0 (엔진 EX-1 의 토대) |
| 격리 | 일반 (단독 — LLM 코어, 다른 에이전트와 동시 금지) |
| 관련 | ADR-023(Gemini 단일화·SDK), ADR-022(2-tier), Tech Spec §1·§8 |

## 🎯 Mission
LLM SDK 를 **deprecated `@google/generative-ai` → GA `@google/genai`** 로 교체하고, **Claude/Anthropic 제거(Gemini 단일화)** 한다. `invokeAi`·`invokeGemini`·임베딩 등 **공개 시그니처는 100% 보존**(51개 호출부 무영향). 네이티브 구조화출력(responseSchema)·thinking 제어 추가.

## 📋 Context
ADR-023. 현 SDK 는 2025-11-30 EOL·아카이브. `@google/genai`(2025-05 GA)가 후속. anthropic 직접 사용은 `ai-fallback.ts` 1곳뿐이라 국소적. 마이그레이션 가이드: https://ai.google.dev/gemini-api/docs/migrate

## ✅ Prerequisites (STOP 조건)
- [ ] 현 SDK 사용처 파악 — 검증: `grep -rln "@google/generative-ai\|@anthropic-ai/sdk" src`
- [ ] `invokeAi`/`invokeGemini` 호출부 수 — 검증: `grep -rln "invokeAi\|invokeGemini" src | wc -l` (약 51)
- [ ] `CLAUDE_MODEL` import 외부 사용 여부 — 검증: `grep -rn "CLAUDE_MODEL" src` (ai-fallback 외 있으면 처리)
- [ ] GEMINI_API_KEY 설정됨(런타임 smoke 용) — `.env` 에 존재

## 📖 Read These Files First
1. `../../docs/decisions/023-gemini-only-genai-sdk.md` · `022-model-policy.md`(모델명·2-tier)
2. `src/lib/gemini.ts` · `src/lib/ai-fallback.ts` · `src/lib/ai/embedding.ts` · `src/lib/research/web-search.ts` · `src/lib/ai/config.ts`(FLASH_MODEL — RET-1이 추가함)
3. 설치 후 `node_modules/@google/genai` 의 타입(.d.ts)로 정확한 API 확인 — **훈련 기억보다 설치된 타입 우선**

## 🎯 Scope
### CAN touch
- `package.json` (deps: `@google/genai` 추가, `@google/generative-ai`·`@anthropic-ai/sdk` 제거)
- `src/lib/gemini.ts` · `src/lib/ai-fallback.ts` · `src/lib/ai/embedding.ts` · `src/lib/research/web-search.ts`
- `eslint.config.mjs` (no-restricted-imports 대상 `@google/genai` 로 갱신)
- `scripts/_smoke-genai.ts` (런타임 smoke — 실행 후 **삭제**)
### MUST NOT touch
- `invokeAi`·`invokeAiForJson`·`invokeGemini`·`isGeminiAvailable`·`generateEmbedding(s)` **시그니처/반환 shape 변경 금지** (호출부 51곳 보존)
- 생성 엔진·retrieval·prisma·다른 트랙

## 🛠 Tasks

### Task 1 — 의존성
`npm install @google/genai` · `npm uninstall @google/generative-ai @anthropic-ai/sdk`. (network 필요. 실패 시 STOP 보고.)

### Task 2 — `gemini.ts` 새 SDK로 (시그니처 보존)
`@google/genai` API (설치 타입으로 재확인하되 기준 패턴):
```ts
import { GoogleGenAI } from '@google/genai'
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
const res = await ai.models.generateContent({
  model,                              // 'gemini-3.1-pro-preview' 등
  contents: prompt,                   // string OK
  config: {
    maxOutputTokens, temperature,
    // 구조화출력(선택): responseMimeType:'application/json', responseSchema,
    // thinking(선택): thinkingConfig: { thinkingBudget } ,
    // 검색(web-search): tools: [{ googleSearch: {} }],
  },
})
const text = res.text                 // getter
const usage = res.usageMetadata       // promptTokenCount/candidatesTokenCount/thoughtsTokenCount
```
- `invokeGemini(params)` 반환 `{raw, inputTokens, outputTokens, model}` 유지. `params.model` override 유지(2-tier·Flash 라우팅이 의존).
- **thinking 대비**: maxOutputTokens 충분히(빈 응답 방지). `thoughtsTokenCount` 로깅.
- `GEMINI_MODEL` 상수·`isGeminiAvailable()` 유지.

### Task 3 — `ai-fallback.ts` Gemini 단일화
- Anthropic import·`CLAUDE_MODEL`·Claude 분기 **제거**.
- `invokeAi` = Gemini-only. **intra-Gemini 폴백**: Pro 실패 → `gemini-pro-latest` → Flash(`FLASH_MODEL`). 전부 실패 시 throw.
- 반환 `InvokeAiResult{raw, provider, model, fallback, primaryError?}` **shape 유지** — `provider` 는 항상 `'gemini'`(타입은 그대로 두되 값 고정), `fallback`=intra-Gemini 폴백 발생 여부.
- `PLAYWRIGHT_MOCK_AI` mock 경로 유지.
- (선택) JSON 강제 호출용 `responseSchema` 전달 경로 추가 — 단 **invokeAi 시그니처 보존**(옵셔널 파라미터 추가는 OK, 기존 호출 깨지지 않게).
- `export { GEMINI_MODEL }` 유지. `CLAUDE_MODEL` export 제거(외부 사용 있으면 먼저 정리).

### Task 4 — `embedding.ts` 새 SDK
`ai.models.embedContent({ model:'gemini-embedding-001', contents })` → `res.embeddings[0].values`(설치 타입 확인). `generateEmbedding`/`generateEmbeddings` 시그니처·차원 assert(3072, FIX-2) 유지.

### Task 5 — `research/web-search.ts` 검색 grounding 새 SDK
구 `googleSearchRetrieval` → 새 SDK `tools: [{ googleSearch: {} }]`. grounding metadata 회수 경로 `res.candidates[0].groundingMetadata.groundingChunks[].web.uri` (설치 타입 확인). 기존 export 함수 시그니처 유지. FIX-2가 단 inline eslint-disable 는 새 SDK 기준으로 갱신/유지.

### Task 6 — `eslint.config.mjs`
`no-restricted-imports` 의 `@google/generative-ai` → `@google/genai` 로 교체(단일 진입점 강제 유지). `@anthropic-ai/sdk` 제한은 제거 가능(의존성 삭제됨). ignores 목록(ai-fallback·gemini·embedding) 유지. web-search 는 inline-disable 유지.

### Task 7 — 런타임 smoke (`scripts/_smoke-genai.ts`, 실행 후 삭제)
실 키로 검증: `invokeAi({prompt:'한 단어로: ok', maxTokens:600})`(Pro) + `invokeGemini({prompt:'ok', model: FLASH_MODEL, maxTokens:600})`(Flash) + `generateEmbedding('test')`(길이 3072 확인). 각 성공·model·thoughts 로깅. **출력 확인 후 스크립트 삭제.** (네트워크/키 필요 — 실패 시 에러 그대로 보고.)

## 🔒 Tech Constraints
- 공개 시그니처 불변(호출부 51곳). Zod·`safeParseJson` 유지. Next.js 16/TS strict.
- 새 SDK 정확한 API 는 **설치된 `.d.ts` 로 확인**(추측 금지).

## ✔️ Definition of Done
- [ ] `@google/genai` 설치 · 구 2개 SDK 제거 (package.json)
- [ ] gemini/ai-fallback/embedding/web-search 새 SDK로, **시그니처 보존**
- [ ] Claude/Anthropic 완전 제거 · intra-Gemini 폴백
- [ ] `npm run typecheck`(51 호출부 컴파일) · `lint` · `check:manifest` 통과
- [ ] **런타임 smoke**: Pro·Flash 텍스트 반환 + 임베딩 3072 확인(출력 첨부) → 스크립트 삭제
- [ ] `git diff --name-only` ⊆ CAN-touch (smoke 스크립트는 삭제로 미포함)

## 📤 Return Format
```
## ✅ 한 일 (파일별 + 새 SDK API 매핑)
## ❌ 못한 일 / 보류
## 🤔 결정한 것 (web-search grounding·responseSchema·폴백 구현 판단)
## 🔬 검증 (typecheck/lint/manifest + 런타임 smoke 출력 그대로)
## ⚠️ 위험 신호 / 다음 진입점 (responseSchema 전면 적용·thinking budget 튜닝 등)
```

## 🚫 Do NOT
- 공개 시그니처 변경 · 호출부 51곳 수정 · 엔진/retrieval/prisma 터치
- 새 SDK API 추측(설치 타입 확인) · web-search 기능 깨기 · git commit/push · 추측 진행

## 💡 Hints
- 메인이 docs 동시 작업 가능 — **코드/package.json/eslint만, `.md` 금지, git write 금지**(npm/tsx/edit만).
- 모델명: Pro `gemini-3.1-pro-preview` · Flash `gemini-3.5-flash` · Embed `gemini-embedding-001`(3072) (ADR-022 런타임 검증됨).
- `@google/genai` 는 thinking·responseSchema·googleSearch 를 `config` 객체로 받음. 구 SDK의 `getGenerativeModel().generateContent()` 패턴과 다름 — `ai.models.generateContent({model,contents,config})`.
- responseSchema 전면 적용은 본 브리프 필수 아님(경로/capability만, 전면 도입은 EX 브리프). 단 호환 깨지면 안 됨.

## 🏁 Final Note
부수 발견(responseSchema 전면화·thinking budget tier·구 mock 형식)은 변경 말고 "다음 진입점"에 보고만.
