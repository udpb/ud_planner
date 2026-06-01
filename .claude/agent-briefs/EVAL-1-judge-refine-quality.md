# Brief EVAL-1 — judge 정합 + 단조 refine + 최약 렌즈 보강 (품질 점프)

> **자급자족.** 본 파일 + `../../CLAUDE.md` + `../../AGENTS.md` + `../../docs/glossary.md`.
> 막히면 추측 금지 → STOP 후 메인 보고.

| 메타 | 값 |
|------|----|
| ID | `EVAL-1-judge-refine-quality` |
| 작성일 | 2026-06-01 |
| 우선순위 | **P2 최우선** (점수가 품질을 반영하게 — 모든 튜닝의 토대) |
| 격리 | 일반 (단독) |
| 관련 | Tech Spec §6 · ADR-022 · EX-1/EX-2 |
| 의존 | EX-1·EX-2(win-theme·compliance·verify 산출물)·AI-3(modelFor) — 완료 |

## 🎯 Mission
self-score가 **EX-2 산출물을 반영**하게 고치고(judge가 win-theme·compliance·인용을 입력으로), **refine를 단조화**(나빠지면 이전 best 유지)하며, **최약 렌즈(risk 35·ergonomics 50)를 구조적으로 보강**한다. + 다중 샘플로 노이즈↓. **목표 = self-score(신뢰 가능)와 panel 점수가 baseline(self 55/panel 66) 대비 상승.** 이게 되면 그 다음 프롬프트·모델 튜닝이 의미를 가짐.
> ⚠️ 본 브리프는 **정의된 구조 수정 + 측정**까지. 무한 프롬프트 thrashing 금지(반복은 명시 한도).

## 📋 Context
EX-2 진단: (a) judge 프롬프트가 sections+keyMessages만 읽어 win-theme/compliance/인용이 채점에 안 들어감 → evidence·차별성·compliance·risk 렌즈가 오를 경로 없음. (b) refine 루프가 점수를 오히려 떨어뜨림(단조 가드 없음). (c) risk/ergonomics 렌즈가 구조적으로 비어 있음(리스크 레지스터·포맷 강제 부재). 이걸 고치면 EX-2가 만든 품질이 숫자로 드러남.

## ✅ Prerequisites (STOP)
- [ ] EX-2 산출물 타입: `EngineResult.{winThemes?, compliance?, verifyReport?}`(`grep -n "winThemes\|compliance\|verifyReport" src/lib/express/engine/types.ts`)
- [ ] `selfScore` 시그니처·`refineWeakest`·`MAX_REFINE`·`SCORE_THRESHOLD`(self-score.ts·index.ts)
- [ ] Gemini 한도 여유(judge=Pro 다중샘플 → RPD 유의)

## 📖 Read These Files First
1. Tech Spec §6(8라인 rubric·proof chain·calibration) · `docs/decisions/022`(judge 비자기채점·다중심사)
2. `src/lib/express/engine/self-score.ts`(judge — sectionsBlock·8라인·weakest) · `index.ts`(refine 루프·EngineResult) · `assemble.ts`(writeSection 프롬프트·projectionGuide) · `types.ts`
3. `src/lib/express/engine/{win-theme,compliance,verify}.ts`(EX-2 산출물 형태) · `prisma`(RubricScore — 선택 persist)

## 🎯 Scope
### CAN touch
- `src/lib/express/engine/self-score.ts` (judge 입력 확장 + 다중 샘플 + 라인별 피드백)
- `src/lib/express/engine/index.ts` (단조 refine + EX-2 산출물을 selfScore에 전달)
- `src/lib/express/engine/assemble.ts` (writeSection 프롬프트에 risk 레지스터·ergonomics 포맷 강제 — **해당 섹션만**)
- `scripts/_smoke-eval1.ts` (실행 후 삭제)
### MUST NOT touch
- `invokeAi`/`modelFor`/retrieve/win-theme/compliance/verify 본문 · ExpressDraftSchema 구조 · ai/config(Pro 키) · 레거시 엔진 · 다른 트랙

## 🛠 Tasks

### Task 1 — judge 입력 확장 (self-score.ts)
- `selfScore(draft, extras?: { winThemes?, compliance?, verifyReport? })` — 시그니처 확장(옵셔널, 하위호환).
- 프롬프트에 블록 추가: **win-theme**(discriminator/benefit/quantified + proof 개수) · **compliance matrix**(covered/partial/missing 카운트) · **인용/검증**(verifyReport: 주장 지지율·인용 수). 
- 채점 지시 보강: evidence=proof·인용 밀도 반영 / differentiation=win-theme discriminator·ghosting 반영 / compliance=matrix missing 반영 / risk=리스크 레지스터 유무. **judge 모델=Pro 유지(`modelFor('engine.self-score')`).**

### Task 2 — 다중 샘플 judge
- judge를 **n=3** 호출(temperature 약간 분산) → 라인별 **median**, overall=가중합. 위치/길이 편향 완화 주석. (Tech Spec §6.3.) n은 상수(주석에 EVAL 비용 명시).

### Task 3 — 단조 refine (index.ts)
- best 추적: `best = {draft, score}`. 매 iteration refine 후 재채점 → **새 score가 best보다 높을 때만 채택**, 아니면 best 유지하고 다른 약점 시도 or 종료. 최종 return = **best**. (현재: 무조건 새 draft 채택 → 역행.)
- refine 프롬프트에 **해당 약점 렌즈의 judge 피드백**(왜 낮은지) 주입 → 타깃 개선. EX-2 산출물도 selfScore에 전달(index에서).

### Task 4 — 최약 렌즈 구조 보강 (assemble.ts, 해당 섹션 프롬프트만)
- **risk**: 적절 섹션(④ 운영 또는 전용)에 **리스크 레지스터**(주요 리스크 3~5 + 완화책 + 미언급 우려 선제 대응) 생성 지시 추가.
- **ergonomics**: 전 섹션 프롬프트에 **포맷 규칙**(문단 ≤6줄·문장 ≤15~20단어·소제목·핵심 굵게) 지시 추가. (Tech Spec §6 ergonomics.)
- 프롬프트 텍스트만 보강 — 스테이지 구조·model 인자 불변.

### Task 5 — 측정 (`scripts/_smoke-eval1.ts`, 실행 후 삭제)
- **2 RFP**(B2G-청년창업·B2B-CSR — RPD 절약) × generateDraft(전 파이프라인) → self-score(다중샘플) + **고정 Pro 패널**(eval-quality-sweep PANEL_PROMPT) 채점.
- 보고: RFP별 **self-score(baseline 55 → 신규) · panel(baseline 66 → 신규)** + 라인/렌즈별 Δ(특히 evidence·differentiation·risk·ergonomics) + refine 단조 확인(점수 비감소) + Pro콜수.
- 출력 후 삭제.

## 🔒 Tech Constraints
- judge=Pro(다중샘플), 생성=Flash-우세(AI-3 라우팅 불변). JSON=safeParseJson. 직접 SDK 금지.
- RPD: 측정 2 RFP로 한정. judge n=3. 과도 반복 금지.

## ✔️ Definition of Done
- [ ] judge가 win-theme·compliance·인용을 입력으로 받음(시그니처+프롬프트) · 다중 n=3
- [ ] refine 단조(best 유지·역행 0) + 피드백 주입
- [ ] risk 레지스터·ergonomics 포맷 프롬프트 보강
- [ ] `typecheck`·`lint`·`check:manifest` 통과
- [ ] **측정 첨부**: self/panel baseline→신규 Δ(2 RFP) + 렌즈별 Δ + refine 비감소 확인 → 삭제
- [ ] `git diff --name-only` ⊆ CAN-touch

## 📤 Return Format
```
## ✅ 한 일 (judge 확장·다중샘플·단조 refine·렌즈 보강)
## ❌ 못한 일 / 보류
## 🤔 결정한 것 (n·median·refine accept 기준·risk 섹션 위치)
## 🔬 검증 (self/panel baseline→신규 Δ·렌즈별·refine 단조·Pro콜수 + 게이트)
## ⚠️ 위험 신호 / 다음 진입점 (추가 프롬프트 튜닝·win-theme Pro 승격·async·DATA-2 코퍼스)
```

## 🚫 Do NOT
- 무한 프롬프트 thrashing(정의된 수정+측정까지) · Pro 키 추가 · ExpressDraftSchema 구조 변경 · win-theme/compliance/verify 본문 변경 · git commit/push · 추측

## 💡 Hints
- 메인 docs 동시작업 — 코드만, `.md` 금지, git write 금지.
- judge가 EX-2 산출물을 보면 evidence·differentiation·compliance·risk가 오를 경로 생김 — 이게 가장 큰 점프 기대.
- refine 역행은 "새 draft 무조건 채택" 때문 — best 가드만 넣어도 비감소 보장.
- 측정은 길다(draft당 ~9분·judge 다중). 2 RFP·RPD 유의. 실패 RFP는 부분 보고.

## 🏁 Final Note
부수 발견(추가 튜닝 여지·win-theme Pro·async·코퍼스)은 "다음 진입점"에 보고만. EVAL-1 = "측정이 품질을 반영 + 점수 상승 실증"까지. 그 다음 max-quality 튜닝은 별도.
