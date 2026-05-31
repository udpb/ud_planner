# Brief RET-1 — 단일 검색 계약 (Contextual + hybrid + RRF + rerank + recall eval)

> **자급자족.** 본 파일 + `../../CLAUDE.md` + `../../AGENTS.md` + `../../docs/glossary.md`.
> 막히면 추측 금지 → STOP 후 메인 보고.

| 메타 | 값 |
|------|----|
| ID | `RET-1-retrieval-contract` |
| 작성일 | 2026-06-01 |
| 상태 | ✅ 완료 (2026-06-01, 메인 검증: 단위 14 cases·typecheck 0·manifest 0·scope clean). 런타임 E2E는 DATA-2/실데이터 후. |
| 우선순위 | P2 |
| 격리 | 일반 (DATA-1 완료 후 단독 실행) |
| 관련 | Tech Spec §4 · ADR-022(모델 2-tier) · ADR-019 |
| 의존 | DATA-1 완료(Workstream 타입·contextBlurb 필드 — 스키마/client 반영됨) |

## 🎯 Mission
생성 파이프라인이 쓸 **단일 검색 계약** `retrieve()` 를 만든다: 기존 storage(Float[] 임베딩 + 키워드) 위에서 다중쿼리 → hybrid 후보 → RRF 융합 → **LLM rerank(Flash)** → top-N. + ingest용 Contextual blurb 유틸 + recall@k/MRR 평가 하니스. **기존 winning-reference·asset-registry 는 후보 생성기로 wrap(제거 X)**. pgvector 바인딩은 DATA-2 후(본 브리프 미포함).

## 📋 Context
Tech Spec §4. 품질-우선: 깊게 검색(top-40) → rerank → top-8. 모델 2-tier(ADR-022): **blurb·HyDE·rewrite·rerank = Flash `gemini-3.5-flash`**(plumbing). 현재 검색이 `winning-reference.ts`(당선청크 in-memory 코사인)·`asset-registry.ts`(자산 키워드+임베딩)로 분산 → 단일 계약 뒤로 통합(이번엔 wrap, 전면 refactor 는 RET-2).
> ⚠️ **런타임 한계**: 로컬 DB drift로 실데이터 E2E 는 보류(별건). 본 브리프 DoD 는 **typecheck + 순수함수 단위검증**까지(LLM·DB 실행 불요).

## ✅ Prerequisites (STOP 조건)
- [ ] DATA-1 land 확인 — 검증: `grep -n "model Workstream " prisma/schema.prisma` 존재 · `src/lib/workstream/types.ts` 존재
- [ ] 기존 검색 함수 시그니처 파악 — 검증: `grep -n "export" src/lib/express/winning-reference.ts src/lib/asset-registry.ts | head`
- [ ] `invokeAi` 시그니처 — `src/lib/ai-fallback.ts`

## 📖 Read These Files First
1. `../../docs/UD-Engine-TechSpec-v1.0.md` §4 · `../../docs/decisions/022-model-policy.md`(2-tier 표)
2. `src/lib/express/winning-reference.ts`(retrieveWinningPassages 등) · `src/lib/asset-registry.ts`(matchAssetsToRfp) · `src/lib/inference/vector-utils.ts`(cosine·MMR — 재사용)
3. `src/lib/ai-fallback.ts`(invokeAi) · `src/lib/ai/config.ts`(모델 라우팅 — Flash 추가 지점)
4. `scripts/fixtures/eval-rfps.json`(라벨 픽스처 시드용)

## 🎯 Scope
### CAN touch (신규 위주)
- `src/lib/retrieval/index.ts` (계약 진입점) · `src/lib/retrieval/fusion.ts` (RRF, 순수) · `src/lib/retrieval/rerank.ts` (LLM rerank, Flash) · `src/lib/retrieval/multi-query.ts` (HyDE·decompose, Flash) · `src/lib/retrieval/context-blurb.ts` (ingest용 blurb, Flash) · `src/lib/retrieval/types.ts`
- `src/lib/eval/retrieval-eval.ts` (recall@k·MRR, 순수) + `scripts/fixtures/retrieval-labels.json` (라벨 시드)
- `src/lib/ai/config.ts` (Flash 모델 상수/라우팅 키 **추가만**)
- `scripts/test-retrieval-units.ts` (순수함수 smoke — vitest 미도입이라 tsx assert)
### MUST NOT touch
- `winning-reference.ts`·`asset-registry.ts` **본문 로직 변경 금지**(import 해서 호출만 — wrap). 전면 refactor 는 RET-2.
- `prisma/schema.prisma`·pgvector(DATA-2) · `invokeAi` 시그니처 · 생성 엔진 · 다른 트랙

## 🛠 Tasks

### Task 1 — types (`retrieval/types.ts`)
```ts
export interface RetrieveQuery { text: string; channel?: string; workstreamType?: string }
export interface Candidate { id: string; source: 'winning'|'asset'; text: string; parentSectionText?: string; rawScore: number; citation: { docId?: string; chunkId?: string; assetId?: string } }
export interface RetrievedChunk extends Candidate { score: number /* 최종 rerank 점수 */ }
export interface RetrieveOptions { kDense?: number; kKeyword?: number; topN?: number; useMultiQuery?: boolean; useRerank?: boolean }
```

### Task 2 — fusion (`retrieval/fusion.ts`, 순수·테스트 대상)
`reciprocalRankFusion(lists: Candidate[][], k=60): Candidate[]` — RRF 표준(score += 1/(k+rank)), id 기준 병합·합산, 점수 내림차순. 순수함수(LLM·DB 무관).

### Task 3 — candidate 생성 (계약 내부, 기존 wrap)
`retrieval/index.ts` 의 내부 헬퍼:
- `denseCandidates(q, kDense=40)` — `winning-reference` 의 임베딩 검색 + `asset-registry` 의 임베딩 매칭을 **호출**해 Candidate[] 로 정규화(점수/citation 매핑). 기존 함수 시그니처에 맞춰 어댑트.
- `keywordCandidates(q, kKeyword=40)` — 기존 키워드 스코어러 호출(있으면) 또는 간단 토큰 매칭. Candidate[] 정규화.
- 채널/과업유형 필터 적용(있으면).

### Task 4 — multi-query (`retrieval/multi-query.ts`, Flash)
- `hyde(q): Promise<string>` — Flash로 "가상의 당선 제안서 문단" 생성(retrieval용). 
- `decompose(q): Promise<string[]>` — Flash로 복합 쿼리 분해.
- 실패 시 graceful(원쿼리만). `invokeAi({preferredProvider 무관, label:'ret.hyde'})` 사용하되 **모델은 Flash 라우팅**(Task 7).

### Task 5 — rerank (`retrieval/rerank.ts`, Flash)
`rerank(query, candidates, topN=8): Promise<RetrievedChunk[]>` — cross-encoder API 없으므로 **LLM rerank**: Flash에 (query + 후보 텍스트들)을 주고 각 0~1 관련도 점수 요청(배치 프롬프트, JSON, `safeParseJson`). 점수순 topN. LLM 실패 시 RRF 점수 fallback. (품질 핵심이라 Flash지만 프롬프트 견고하게.)

### Task 6 — `retrieve()` 조립 (`retrieval/index.ts`)
```
retrieve(q, opts):
  queries = opts.useMultiQuery ? [q.text, await hyde(q), ...await decompose(q)] : [q.text]
  dense = denseCandidates(...) ; kw = keywordCandidates(...)   // 각 쿼리별
  fused = reciprocalRankFusion([dense, kw, ...])               // Task 2
  return opts.useRerank!==false ? await rerank(q.text, fused.slice(0,40), opts.topN??8) : fused.slice(0, opts.topN??8)
```

### Task 7 — Flash 라우팅 (`ai/config.ts` 추가)
`FLASH_MODEL='gemini-3.5-flash'` 상수 + retrieval 작업이 Flash 쓰도록 (invokeAi 가 모델 override 받게 하거나, gemini.ts model 파라미터 경유). **invokeAi 시그니처 변경 금지** — 이미 `model` 전달 경로 없으면 `invokeGemini({model})` 직접 호출(gemini.ts는 단일진입점 예외)도 허용. 어느 경로 택했는지 보고.

### Task 8 — context-blurb 유틸 (`retrieval/context-blurb.ts`, Flash)
`generateContextBlurb(chunkText, docTitle): Promise<string>` — Flash로 50~100토큰 맥락 prepend 생성(Contextual Retrieval). ingest 브리프가 호출 예정(여기선 유틸만, 실행 X).

### Task 9 — recall eval (`eval/retrieval-eval.ts` + `scripts/fixtures/retrieval-labels.json`)
- `recallAtK(retrieved, expected, k)` · `mrr(retrieved, expected)` — 순수.
- 라벨 픽스처: `eval-rfps.json` 6건에서 각 RFP→기대 자산/당선문서 id를 **placeholder 구조로 스캐폴드**(실 id 매핑은 데이터 있을 때 — TODO 주석). 하니스가 라벨 로드→retrieve()→지표 산출 구조만 완성.

### Task 10 — 단위 smoke (`scripts/test-retrieval-units.ts`)
RRF·recall@k·mrr 를 **하드코딩 입력으로 assert**(node assert, tsx 실행). LLM·DB 불요. `npx tsx scripts/test-retrieval-units.ts` → 통과 출력.

## 🔒 Tech Constraints
- Next.js 16 · TS strict · Zod(LLM JSON 경계, `safeParseJson`). 모델 2-tier(rerank/hyde/blurb = Flash).
- 기존 검색 모듈 wrap만. 순수함수와 IO 분리(테스트 가능하게).

## ✔️ Definition of Done
- [ ] `retrieval/{index,types,fusion,rerank,multi-query,context-blurb}.ts` + `eval/retrieval-eval.ts` + 라벨 픽스처 + smoke 스크립트
- [ ] `npx tsx scripts/test-retrieval-units.ts` → RRF·recall·mrr assert 통과
- [ ] `npm run typecheck` · `lint` · `check:manifest` 통과
- [ ] Flash 라우팅 경로 명시 · 기존 모듈 본문 무변경(wrap 확인)
- [ ] `git diff --name-only` ⊆ CAN-touch
> 런타임 E2E(실 LLM·DB)는 **DoD 아님** — DB drift 해소 후 별도 검증.

## 📤 Return Format
```
## ✅ 한 일 (파일별)
## ❌ 못한 일 / 보류 (런타임 E2E·pgvector 등)
## 🤔 결정한 것 (Flash 라우팅 경로·rerank 방식·wrap 어댑트 판단)
## 🔬 검증 (smoke assert 출력 + typecheck/lint/manifest 그대로)
## ⚠️ 위험 신호 / 다음 진입점 (RET-2 refactor·pgvector·라벨 실매핑)
```

## 🚫 Do NOT
- winning-reference·asset-registry 본문 변경 · pgvector/schema · invokeAi 시그니처 변경
- 실 LLM·DB 호출을 DoD로 강제(빌드·순수검증까지) · git commit/push · 추측 진행

## 💡 Hints
- 메인이 docs 동시 작업 가능 — **코드만, `.md` 금지, git write 금지**(tsx/npm/edit만).
- `vector-utils.ts` 의 cosine·MMR 재사용(중복 구현 금지).
- gemini.ts 는 `invokeGemini({model})` 로 모델 override 가능(Flash 호출 경로). config.ts 에 FLASH_MODEL 상수.
- rerank 프롬프트: 후보에 인덱스 부여 → JSON `{idx:score}` 반환 강제 → `safeParseJson`.

## 🏁 Final Note
부수 발견(기존 모듈 refactor 필요·라벨 실매핑·pgvector)은 변경 말고 "다음 진입점"에 RET-2/DATA-2 후보로 보고만.
