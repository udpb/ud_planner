# Brief FIX-2 — P0 진실화 (보안·embedding·단일진입점)

> **자급자족.** 본 파일 + `../../CLAUDE.md` + `../../AGENTS.md` + `../../docs/glossary.md`.
> 막히면 추측 금지 → STOP 후 메인 보고.

| 메타 | 값 |
|------|----|
| ID | `FIX-2-p0-truthing` |
| 작성일 | 2026-06-01 |
| 상태 | ✅ 완료 (2026-06-01, 메인 검증: typecheck 0·manifest 0·auth 2/2·768→0·assert·web-search 판단정확). eslint 예외에 embedding.ts 추가(메인). |
| 우선순위 | P0 |
| 격리 | 일반 |
| 관련 | Tech Spec §0·§10 · ADR-022(예정) |

## 🎯 Mission
저위험·정적 검증 가능한 P0 위생 3건을 고친다: (1) Express `turn`·`init` 라우트 보안 갭, (2) embedding 차원 오기재(768→3072) + assert, (3) `research/web-search.ts` 의 invokeAi 단일진입점 위반 — **단, web-search는 기능 보존 우선(판단 필요)**.

## 📋 Context
2026-06-01 종합 점검에서 확정. Tech Spec 품질-우선 전제(frontier 모델)는 ADR-022 별건이라 **본 브리프 범위 아님**(모델명·flash 확인 제외). 본 브리프는 정적으로 검증되는 것만.

## ✅ Prerequisites (STOP 조건)
- [ ] `src/app/api/express/save/route.ts` 가 `requireProjectAccess` 를 쓰는 패턴 존재 — 검증: `grep -n requireProjectAccess src/app/api/express/save/route.ts`
- [ ] `EMBEDDING_DIM` 상수 위치 확인 — 검증: `grep -rn "EMBEDDING_DIM" src/lib/ai/embedding.ts`

## 📖 Read These Files First
1. `../../AGENTS.md` (변경 금지 항목 · invokeAi 단일진입점)
2. `src/app/api/express/save/route.ts` (auth 패턴 레퍼런스) · `turn/route.ts` · `init/route.ts`
3. `src/lib/ai/embedding.ts` · `src/lib/inference/vector-utils.ts` · `prisma/schema.prisma`(768 주석)
4. `src/lib/research/web-search.ts` · `src/lib/ai-fallback.ts`(invokeAi 시그니처)

## 🎯 Scope
### CAN touch
- `src/app/api/express/turn/route.ts` · `src/app/api/express/init/route.ts`
- `src/lib/ai/embedding.ts` · `src/lib/inference/vector-utils.ts`
- `prisma/schema.prisma` (**주석만** — 모델/필드 구조 변경 금지)
- `src/lib/research/web-search.ts`
### MUST NOT touch
- `src/lib/ai-fallback.ts` 시그니처 · `src/lib/gemini.ts`(embedding/gen 래퍼 — generative-ai import 정당)
- prisma 모델/필드 구조 (주석 외) · 다른 라우트 · planning-agent · 생성 엔진

## 🛠 Tasks
1. **turn·init auth**: 다른 10개 express 라우트와 동일하게 `requireProjectAccess(projectId)` 호출 추가. `save/route.ts` 패턴 그대로 미러. body의 `projectId` 사용. 인증 실패 시 동일 응답 형태.
2. **embedding 차원**: `embedding.ts`·`vector-utils.ts`·`schema.prisma` 의 "768"·"text-embedding-004" 주석을 **실제값(3072·gemini-embedding-001)으로 정정**. embedding 생성 유틸에 **차원 assert**(반환 벡터 length !== EMBEDDING_DIM 이면 throw) 추가. (런타임 무성 zero-recall 방지.)
3. **web-search.ts** (판단 필요): 파일을 읽고 —
   - 평범한 텍스트 생성에 `@google/generative-ai` 직접 import 중이면 → `invokeAi` 경유로 교체.
   - **Gemini 고유 기능(search grounding/google search tool)** 을 쓰는 거라 invokeAi로 대체 불가하면 → 교체하지 말고, 해당 import 줄에 `// eslint-disable-next-line no-restricted-imports — Gemini search grounding (provider-neutral invokeAi 미지원), 정당한 예외` 주석으로 문서화. **어느 쪽인지 판단 근거를 보고에 명시.**
4. 각 단계 후 `npm run typecheck`.

## 🔒 Tech Constraints
- Next.js 16 App Router. TypeScript strict. Zod 경계.
- prisma.schema 는 주석만 — 구조 변경은 별도 DATA 브리프.

## ✔️ Definition of Done
- [ ] turn·init 에 requireProjectAccess (`grep -c` ≥1 each)
- [ ] 768 주석 0건 잔존(`grep -rn "768" 위 3파일`), assert 추가
- [ ] web-search: invokeAi 경유 OR 문서화된 eslint-disable (판단 근거 보고)
- [ ] `npm run typecheck` · `lint` · `check:manifest` 통과
- [ ] `git diff --name-only` ⊆ CAN-touch

## 📤 Return Format
```
## ✅ 한 일 (파일별)
## ❌ 못한 일 / 보류
## 🤔 결정한 것 (특히 web-search 판단 근거)
## 🔬 검증 (typecheck/lint/manifest 결과 그대로 + grep 증거)
## ⚠️ 위험 신호 / 다음 진입점
```

## 🚫 Do NOT
- Gemini 모델명·flash 확인 (ADR-022 별건) · prisma 구조 변경 · invokeAi 시그니처 변경
- web-search 기능 깨면서 invokeAi 강제 · git commit/push · 추측 진행

## 💡 Hints
- 메인이 docs 동시 작업 중일 수 있음 — **코드만, `.md` 파일 금지, git write 명령 금지**(rm/edit/typecheck만).
- web-search.ts 는 `src/lib/research/` 에 있음(루트 lib 아님). gemini.ts·embedding.ts의 generative-ai import는 **정당**(래퍼·임베딩) — 건드리지 말 것.

## 🏁 Final Note
부수 발견은 보고만. 스코프 4파일 외 손대지 말 것.
