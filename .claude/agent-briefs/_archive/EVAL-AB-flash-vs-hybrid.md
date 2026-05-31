# Brief EVAL-AB — Flash-only vs Flash+Pro 하이브리드 패널 A/B

> **자급자족.** 본 파일 + `../../CLAUDE.md` + `../../AGENTS.md` + `../../docs/glossary.md`.
> 막히면 추측 금지 → STOP 후 메인 보고.

| 메타 | 값 |
|------|----|
| ID | `EVAL-AB-flash-vs-hybrid` |
| 작성일 | 2026-06-01 |
| 상태 | ✅ 완료 (2026-06-01). 스크립트는 에이전트 작성, 실행·수집은 메인 직접(에이전트가 run 미완 종료). 결과: hybrid 66 vs flash 61(+5), win-deciding 렌즈 hybrid 우위 → **하이브리드 유지 결정**(ADR-022 §4-A). |
| 우선순위 | P1 (모델 정책 최종 확정의 근거) |
| 격리 | 일반 (단독) |
| 관련 | ADR-022(2-tier·사용자 결정 ①), EX-1(엔진), AI-3(라우팅) |
| 의존 | EX-1(`generateDraft`)·AI-3(`modelFor`·`EVAL_ALL_FLASH`) — 완료 |

## 🎯 Mission
새 엔진(`generateDraft`)으로 같은 RFP를 **(A) Flash-only vs (B) Flash+Pro 하이브리드(Pro=2키)** 로 생성하고 **평가위원 패널로 채점 비교**해, "3.5 Flash 단일 통일 가능한가"를 **데이터로** 낸다. + arm A 무결성을 위한 coherence-pass 모델 보정.

## 📋 Context
사용자 ①: Flash-우세 하이브리드 + A/B로 Flash-only 검증. AI-3가 라우팅(Pro=`engine.section.core`·`engine.self-score`)·`EVAL_ALL_FLASH` 플래그 준비. ⚠️ `coherence-pass.ts`가 invokeAi를 model 없이 호출(=Pro 기본·EVAL_ALL_FLASH 무시) → arm A가 진짜 all-flash가 되려면 보정 필요. ⚠️ **RPD**: 3.1 Pro 250/일 → N=3 RFP로 제한(Pro 호출 ~15-20, 안전).

## ✅ Prerequisites (STOP 조건)
- [ ] `generateDraft`(`src/lib/express/engine/index.ts`)·`modelFor`/`EVAL_ALL_FLASH`(`ai/config.ts`)·`PANEL_PROMPT`(`scripts/eval-quality-sweep.ts`) 존재
- [ ] `scripts/fixtures/eval-rfps.json` 6건 · Gemini 한도 여유(메인 확인)

## 📖 Read These Files First
1. `scripts/eval-quality-sweep.ts`(PANEL_PROMPT·패널 채점·_summary 패턴 — 재사용) · `scripts/_archive`엔 없음
2. `src/lib/express/engine/index.ts`(`generateDraft` 시그니처·EngineInput) · EX-1 smoke가 했던 fixture→EngineInput 구성(아카이브 브리프 `EX-1` 참고)
3. `src/lib/ai/config.ts`(modelFor·EVAL_ALL_FLASH) · `src/lib/express/coherence-pass.ts`(line ~161 invokeAi)

## 🎯 Scope
### CAN touch
- `src/lib/express/coherence-pass.ts` (**invokeAi에 `model: modelFor('engine.coherence')` 추가만** — flash, EVAL_ALL_FLASH 적용되게)
- `scripts/eval-ab.ts` (신규 — A/B 생성+패널 채점) · `scripts/eval-ab-compare.mjs` (신규 — 두 arm 비교 요약)
- `eval-results-ab-flash/`·`eval-results-ab-hybrid/` (결과 출력 — gitignore 대상)
### MUST NOT touch
- 엔진 로직·`generateDraft` 본문 · `modelFor`/config 로직 · invokeAi 시그니처 · eval-quality-sweep.ts(재사용만) · 다른 트랙

## 🛠 Tasks

### Task 1 — coherence-pass 모델 보정
`src/lib/express/coherence-pass.ts`의 invokeAi 호출에 `model: modelFor('engine.coherence')` 추가(import 추가). → arm A(EVAL_ALL_FLASH=true)에서 coherence도 flash. (Pro-critical 아님.) **model 인자만, 로직 불변.**

### Task 2 — `scripts/eval-ab.ts`
- `import 'dotenv/config'`. PANEL_PROMPT은 eval-quality-sweep에서 import 안 되면 **동일 프롬프트 복사**.
- N=**3 RFP** (diverse 3채널): label `B2G-청년창업-중예산`·`B2B-대기업CSR-소셜임팩트`·`renewal-연속사업-운영`.
- arm = `process.env.EVAL_ALL_FLASH==='true' ? 'flash' : 'hybrid'` → 결과 디렉토리 `eval-results-ab-${arm}/`.
- 각 RFP: fixture→최소 EngineInput(EX-1 smoke 방식: workstreams는 인라인 2개[education·event_ops] 또는 ensureDefault) → `generateDraft` (시간·Pro콜수 로깅) → draft.
- **패널 채점**: `invokeAi({ prompt: PANEL_PROMPT(rfp, draft), model: 'gemini-3.1-pro-preview', temperature: 0.3, ... })` — **judge는 양 arm 공통 Pro 고정**(공정 비교, modelFor 안 씀). overall + 렌즈별 점수 파싱(safeParseJson).
- 결과 저장: `{label, arm, selfScore, panel, elapsedMs}` per RFP. 
- ⚠️ self-score(엔진 내부)는 arm에 따라 모델 다름(arm A=flash judge, arm B=pro judge) — 이건 엔진 내부라 그대로. **공정 비교 지표는 외부 PANEL(고정 Pro)**.

### Task 3 — 실행 (2 arm)
```
EVAL_ALL_FLASH=true npx tsx scripts/eval-ab.ts    # arm A (전부 flash)
npx tsx scripts/eval-ab.ts                          # arm B (하이브리드 Pro 2키)
```
(EVAL_ALL_FLASH은 모듈 로드 시 const라 프로세스 분리 필수.)

### Task 4 — `scripts/eval-ab-compare.mjs`
두 결과 디렉토리 읽어 출력: RFP별 패널 overall (flash vs hybrid · Δ) + 렌즈별 평균 Δ + 평균 elapsed + arm B 평균 Pro콜수. 콘솔 표.

## 🔒 Tech Constraints
- 패널 judge = 고정 Pro(공정). 생성만 arm별 모델. JSON=safeParseJson.
- 실 Gemini 호출(한도 유의 — N=3로 제한). 직접 SDK 금지(invokeAi/generateDraft 경유).

## ✔️ Definition of Done
- [ ] coherence-pass model 보정(arm A 진짜 all-flash)
- [ ] `eval-ab.ts`·`eval-ab-compare.mjs` 작성
- [ ] 2 arm 실행 완료(3 RFP×2) — 일부 RFP가 시간/한도로 실패 시 **부분 결과라도 보고**(몇 건 성공·실패사유)
- [ ] compare 출력: **flash vs hybrid 패널 overall Δ + 렌즈별 Δ + elapsed + Pro콜수** (그대로 첨부)
- [ ] `npm run typecheck`(coherence-pass 변경분) 통과
- [ ] `git diff --name-only` ⊆ CAN-touch (결과 디렉토리는 gitignore)

## 📤 Return Format
```
## ✅ 한 일 (coherence 보정·스크립트·실행)
## ❌ 못한 일 / 보류 (실패 RFP·한도)
## 🤔 결정한 것 (EngineInput 구성·judge 고정 등)
## 🔬 검증 (A/B 결과 표: RFP별·렌즈별 flash vs hybrid Δ·elapsed·Pro콜수 + typecheck)
## ⚠️ 위험 신호 / 다음 진입점 (Flash-only 권고 여부에 대한 데이터 해석)
```

## 🚫 Do NOT
- 엔진/모델 로직 변경 · judge를 arm별로 다르게(공정성 깨짐) · N>3(RPD) · git commit/push · 추측

## 💡 Hints
- 메인 docs 동시작업 — 코드/스크립트만, `.md` 금지, git write 금지.
- 한 draft 생성이 길다(EX-1 기준 flash ~8분). 3×2=6 draft → 길게 잡고(백그라운드) 진행. RFP별 try/catch로 한 건 실패가 전체를 막지 않게.
- `eval-results-ab-*` 는 `.gitignore`의 `eval-results-*/` 와일드카드에 걸릴 것(확인).
- 해석은 메인이 — 너는 **숫자만 정확히** 뽑아 보고.

## 🏁 Final Note
부수 발견(Pro 0키까지 내릴 수 있는지·maxDuration async)은 구현 말고 "다음 진입점"에 보고만. EVAL-AB = "flash vs hybrid 패널 숫자"까지.
