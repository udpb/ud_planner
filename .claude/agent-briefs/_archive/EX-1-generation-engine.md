# Brief EX-1 — 단일 생성 엔진 골격 (gather → assemble → refine)

> **자급자족.** 본 파일 + `../../CLAUDE.md` + `../../AGENTS.md` + `../../docs/glossary.md`.
> 막히면 추측 금지 → STOP 후 메인 보고.

| 메타 | 값 |
|------|----|
| ID | `EX-1-generation-engine` |
| 작성일 | 2026-06-01 |
| 상태 | ✅ 완료 (2026-06-01, 메인 검증: engine 5파일+라우트·typecheck 0·레거시 무변경·E2E 7/7섹션·parse PASS·self-score 71). ⚠️ smoke가 .env.local 핀으로 구형 flash로 실행됨·maxDuration 510s. |
| 우선순위 | **P2 최우선** (사용자 북극성 "좋은 제안서"의 본체) |
| 격리 | 일반 (단독) |
| 관련 | ADR-021(단일 엔진)·ADR-019(과업)·ADR-022(2-tier)·ADR-023(Gemini/genai)·Tech Spec §5·§7 |
| 의존 | DATA-1(과업 스키마)·RET-1(retrieve())·AI-1(genai/Gemini) — **전부 완료·검증됨** |

## 🎯 Mission
RFP+프로젝트 컨텍스트 → **과업(Workstream)-aware 단계형 파이프라인**으로 유효한 `ExpressDraft`(7섹션+키메시지)를 end-to-end 생성하는 **단일 엔진**을 만들고 **production 라우트에 배선**한다. `gather(RET-1) → assemble(plan-then-write, Pro) → 기본 self-score → 정제 루프`. **실 Gemini로 E2E 생성 검증**(한도 해제됨).

## 📋 Context
Tech Spec §5(G1~G13의 assemble/refine 골격)·ADR-021. 현재 production은 약한 turn 경로, flagship `produceUltimateDraft`는 dev-only. EX-1은 **새 단일 엔진을 alongside 빌드 + production 라우트 배선**. 레거시 3엔진 제거·typed WinTheme·compliance matrix·faithfulness gate·full Rubric panel 은 **본 브리프 범위 아님**(EX-2·EVAL-1·후속). EX-1 = "과업 위 7섹션 초안이 실제로 나오고 production에서 돈다".

## ✅ Prerequisites (STOP 조건)
- [ ] `src/lib/express/schema.ts` `ExpressDraft`/`ExpressDraftSchema` 존재 — 검증: `grep -n "ExpressDraftSchema" src/lib/express/schema.ts`
- [ ] `src/lib/workstream/{types,ensure-default}.ts` 존재(DATA-1) · `src/lib/retrieval/index.ts` `retrieve()` 존재(RET-1)
- [ ] `invokeAi` 의 `model?` 파라미터(AI-1) — 검증: `grep -n "model?" src/lib/ai-fallback.ts`
- [ ] Gemini 한도 해제됨(메인 확인 2026-06-01) — 실호출 가능

## 📖 Read These Files First
1. `../../docs/UD-Engine-TechSpec-v1.0.md` §5·§7 · `../../docs/decisions/021-single-generation-engine.md`·`022`·`019`
2. `src/lib/express/schema.ts`(ExpressDraft 형태) · `src/lib/express/produce-ultimate-draft.ts`(흡수 참고 — 단계 구조·프롬프트 재사용 가능, **호출은 안 함**)
3. `src/lib/express/prompts/*`·`coherence-pass.ts`·`render-markdown.ts`(재사용 가능) · `src/lib/retrieval/index.ts` · `src/lib/workstream/*` · `src/lib/ai-fallback.ts`(invokeAi) · `src/lib/ai/config.ts`(모델)
4. 기존 express 라우트 패턴: `src/app/api/express/save/route.ts`(requireProjectAccess·persist)

## 🎯 Scope
### CAN touch (신규 위주)
- `src/lib/express/engine/{index,types,gather,assemble,self-score}.ts` (신규)
- `src/app/api/projects/[id]/assemble/route.ts` (신규 production 라우트)
- `scripts/_smoke-engine.ts` (E2E smoke — 실행 후 삭제)
### MUST NOT touch
- **레거시 3엔진 본문 변경/삭제 금지**: `produce-ultimate-draft.ts`·`proposal-ai.ts`·`ai/proposal-section.ts` (alongside 빌드. 제거는 EX-1 검증 후 별건)
- `invokeAi`/`invokeGemini` 시그니처 · `retrieval/*`·`workstream/*` 본문 · `schema.ts`(ExpressDraft는 **사용**, 변경 X)
- typed WinTheme 모델 생성 로직(EX-2) · compliance matrix(EX-2) · 다른 트랙

## 🛠 Tasks

### Task 1 — `engine/types.ts`
```ts
export interface EngineInput {
  projectId: string
  rfp: RfpParsed                    // 기존 타입 (ai/parse-rfp)
  channel: Channel                  // schema.ts
  workstreams: Workstream[]         // DB(Prisma) — 없으면 index.ts가 ensureDefaultWorkstream
  pmInputs?: PmInputs
}
export interface EngineResult { draft: ExpressDraft; score: SelfScore; iterations: number }
export interface SelfScore { overall: number; lines: { key:string; weight:number; score:number }[]; weakest: string[] }
```

### Task 2 — `engine/gather.ts` (RET-1 wrap)
과업별·섹션별로 `retrieve({text, channel, workstreamType})`(RET-1) 호출해 evidence 풀 수집. 반환: `Map<sectionKey, RetrievedChunk[]>` + 과업별 자료. (외부 무거운 리서치는 본 브리프 범위 아님 — RET-1 retrieve로 당선청크·자산만.)

### Task 3 — `engine/assemble.ts` (plan-then-write, **Pro**)
- `planOutline(input, evidence)` — Pro(invokeAi, model=GEMINI_MODEL). 7섹션 각각 {thesis 한 줄, 사용할 evidence ref, 길이예산} JSON. `safeParseJson`.
- `writeSection(key, outline, input, evidence, memory)` — Pro. **과업 위 투영**(Tech Spec §7.2): ③ 사업내용=과업 블록 순차, ⑤ 예산=Σ과업, ⑥ 성과=과업 Outcome 합성. `memory`(이미 쓴 주장·수치)로 중복·모순 방지. 각 섹션 ≤2000자(schema).
- `synthKeyMessages(input, sections)` — Pro. keyMessages(기존 schema, ≤3) — 과업 가로질러. (typed WinTheme proof chain은 EX-2.)
- `coherencePass(draft)` — 기존 `coherence-pass.ts` 재사용 가능하면 호출, 아니면 Pro 1콜로 섹션 간 정합 점검.
- 출력은 **유효 `ExpressDraft`** (ExpressDraftSchema.parse 통과).

### Task 4 — `engine/self-score.ts` (기본, **Pro** judge, 단일샘플)
Tech Spec §6 8라인(compliance·사업이해도·추진전략·차별성·증거밀도·기대효과·위험관리·ergonomics) 0~100 + overall + weakest3. Pro 1콜 JSON(`safeParseJson`). **full panel/calibration/n≥3 은 EVAL-1** — 여기선 단일 judge로 정제 루프만 돌릴 수 있게.

### Task 5 — `engine/index.ts` 조립
```
generateDraft(input):
  if input.workstreams empty: ensureDefaultWorkstream(projectId); reload
  evidence = gather(input)
  draft = assemble(input, evidence)
  for i in 1..MAX_REFINE(=2):
    score = selfScore(draft)
    if score.overall >= THRESHOLD(=78): break
    draft = refineWeakest(draft, score.weakest, input, evidence)   // Pro, 약점 섹션만 재작성
  return { draft, score, iterations:i }
```
- maxOutputTokens 크게(thinking 모델, ADR-022). 동시성: 섹션 작성은 순차(공유 memory) — 병렬 금지(정합·429).

### Task 6 — production 라우트 `POST /api/projects/[id]/assemble`
- `requireProjectAccess` (save/route.ts 패턴). `export const maxDuration = 300`. body에서 rfp/channel 등 받거나 DB에서 로드.
- `generateDraft` 호출 → draft 를 기존 ExpressDraft 저장 경로로 persist(save 로직 재사용) → `{ ok, draft, score }` 반환.

### Task 7 — E2E smoke (`scripts/_smoke-engine.ts`, 실행 후 삭제)
`scripts/fixtures/eval-rfps.json` 1건 + 최소 EngineInput(workstreams는 ensure-default 또는 인라인 1~2개) → `generateDraft` 직접 호출(라우트 거치지 않고 함수). **실 Gemini**. 확인·로깅: 7섹션 전부 비지 않음 · keyMessages ≥1 · `ExpressDraftSchema.parse` 통과 · self-score overall 출력 · 소요시간. 출력 확인 후 스크립트 삭제.

## 🔒 Tech Constraints
- 모든 LLM = `invokeAi`(Pro: model 미지정 시 기본=Pro / 명시 시 GEMINI_MODEL). 직접 SDK 금지. JSON=`safeParseJson`.
- 출력은 반드시 유효 `ExpressDraft`(기존 schema). render-markdown·UI 호환.
- Next.js 16 라우트(`params` async). strict 타입.

## ✔️ Definition of Done
- [ ] `engine/{index,types,gather,assemble,self-score}.ts` + `assemble` 라우트
- [ ] `npm run typecheck` · `lint` · `check:manifest` 통과
- [ ] **E2E smoke**: fixture RFP → 7섹션+keyMessages 생성 · ExpressDraftSchema.parse 통과 · self-score 출력 (실행 로그 첨부) → 스크립트 삭제
- [ ] 라우트 `requireProjectAccess`·maxDuration 300
- [ ] 레거시 3엔진 본문 무변경 · invokeAi 시그니처 무변경
- [ ] `git diff --name-only` ⊆ CAN-touch (smoke 삭제로 미포함)

## 📤 Return Format
```
## ✅ 한 일 (파일별 + 단계 구조)
## ❌ 못한 일 / 보류 (EX-2/EVAL-1로 미룬 것 명시)
## 🤔 결정한 것 (과업 투영·refine 임계·coherence 재사용 판단)
## 🔬 검증 (typecheck/lint/manifest + E2E smoke 로그: 섹션 수·keyMessages·parse·self-score·소요)
## ⚠️ 위험 신호 / 다음 진입점 (EX-2 typed win-theme·compliance·faithfulness, 레거시 제거, EVAL-1 calibration)
```

## 🚫 Do NOT
- 레거시 3엔진 호출/수정/삭제 · invokeAi·schema·retrieval·workstream 본문 변경
- 섹션 병렬 생성(공유 memory·429) · 직접 SDK import · git commit/push · 추측 진행

## 💡 Hints
- 메인이 docs 동시 작업 가능 — **코드만, `.md` 금지, git write 금지**(tsx/npm/edit만).
- `produce-ultimate-draft.ts`의 단계·프롬프트는 **읽어서 재사용**(복붙·개선 OK), 단 그 함수를 import·호출하진 말 것(새 엔진은 독립).
- 과업 투영(§7.2)이 핵심 차별점 — ③ 사업내용에 과업 블록이 실제로 순차 렌더되는지 smoke에서 확인.
- 모델: Pro `gemini-3.1-pro-preview`. thinking 모델 → maxOutputTokens 16384+.
- self-score THRESHOLD/ MAX_REFINE 는 상수(가변) — 주석으로 EVAL-1에서 calibration 예정 명시.

## 🏁 Final Note
부수 발견(typed WinTheme·compliance matrix·faithfulness gate·legacy 제거·full panel)은 구현 말고 "다음 진입점"에 EX-2/EVAL-1 후보로 보고만. EX-1 = "과업 위 7섹션이 실제로 나오고 production에서 돈다"까지.
