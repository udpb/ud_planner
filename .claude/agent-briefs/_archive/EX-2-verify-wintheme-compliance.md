# Brief EX-2 — faithfulness gate + typed WinTheme + compliance matrix

> **자급자족.** 본 파일 + `../../CLAUDE.md` + `../../AGENTS.md` + `../../docs/glossary.md`.
> 막히면 추측 금지 → STOP 후 메인 보고.

| 메타 | 값 |
|------|----|
| ID | `EX-2-verify-wintheme-compliance` |
| 작성일 | 2026-06-01 |
| 상태 | ✅ 완료-메커니즘 (2026-06-01). proof win-theme·compliance·faithfulness 작동·typecheck 0. ⚠️ self-score 미상승 — judge가 산출물 안 봄·refine 역행(둘 다 EX-2 scope 밖) → EVAL-1에서 해소. |
| 우선순위 | **P2 최우선** (품질 78+ 핵심 레버) |
| 격리 | 일반 (단독) |
| 관련 | Tech Spec §5(G6·G8·G10)·§6 · ADR-019·021·022 |
| 의존 | EX-1(engine)·DATA-1(WinTheme·ComplianceItem)·RET-1(retrieve)·AI-3(modelFor) — 완료 |

## 🎯 Mission
EX-1 엔진에 **품질·검증 3 레이어**를 추가한다: (1) **typed WinTheme**(proof chain 강제) (2) **compliance matrix**(RFP 요구→섹션 매핑) (3) **결정론 faithfulness gate**(주장→인용 검증→미지지 재생성·수치 조작 차단). A/B에서 약한 렌즈(evidence·winningLanguage·차별성·risk)를 직접 끌어올린다. 새 스테이지는 **Flash 기본**(Pro 2키 유지, ADR-022). **실 Gemini로 self-score 상승 검증**.

## 📋 Context
A/B: 양 arm <78(미달). 약점 = evidence 68·winningLanguage 52·risk 35·차별성. 리서치: faithfulness gate(환각 25→12%·인용 F1 .45→.75), typed win-theme(proof 강제 = "증명 못 하면 말하지 마라"), compliance matrix(실격 방지). 이게 점수 올릴 핵심.

## ✅ Prerequisites (STOP)
- [ ] `generateDraft`(engine/index.ts)·WinTheme/ComplianceItem 모델(`grep "model WinTheme\|model ComplianceItem" prisma/schema.prisma`)·`retrieve`(retrieval/index)·`modelFor`(ai/config) 존재
- [ ] Gemini 한도 여유

## 📖 Read These Files First
1. Tech Spec §5(G6 win-theme·G8 compliance·G10 verify)·§6(win-theme typed·proof chain) · ADR-019(WinTheme/ComplianceItem 스키마)
2. `src/lib/express/engine/{index,assemble,self-score,types}.ts` · `prisma/schema.prisma`(WinTheme·ComplianceItem·KeyPoint 필드) · `src/lib/retrieval/index.ts` · `src/lib/ai/config.ts`(modelFor)
3. `src/lib/express/schema.ts`(ExpressDraft·SourceTrace·EvidenceRefs — 인용 저장 위치)

## 🎯 Scope
### CAN touch
- 신규: `src/lib/express/engine/{win-theme,compliance,verify}.ts`
- `src/lib/express/engine/index.ts` (3 스테이지 파이프라인에 삽입 + 결과 persist)
- `src/app/api/projects/[id]/assemble/route.ts` (WinTheme/ComplianceItem DB persist 추가)
- `scripts/_smoke-ex2.ts` (실행 후 삭제)
### MUST NOT touch
- 기존 engine 스테이지 **로직**(assemble/gather/self-score 본문 — 호출 순서·persist만 index.ts에서)
- `invokeAi`/`modelFor`/retrieve 본문 · ExpressDraftSchema 구조 · 레거시 3엔진 · 다른 트랙

## 🛠 Tasks

### Task 1 — typed WinTheme (`engine/win-theme.ts`, Flash)
- `generateWinThemes(input, evidence, draft): Promise<WinThemeDraft[]>` (3~5개). 각 = `{discriminator, benefit, quantified?, proof: ProofRef[], hotButton?, rank}`.
- **proof chain 강제**: 각 win-theme는 `proof[]` ≥1 (자산/당선청크/SROI 근거). `retrieve()`로 근거 확보. **proof 비면 그 win-theme 드롭**(hard rule — "증명 못 하면 말하지 마라"). 전부 드롭되면 경고 로깅.
- **금지어 차단**: "최고 수준"·"world-class"·"풍부한 경험" 등(사전 상수) 포함 시 재생성 요구 or 제거.
- model: `modelFor('engine.wintheme')`(flash 기본 — A/B 재측정 때 Pro 승격 검토, 주석).

### Task 2 — compliance matrix (`engine/compliance.ts`, Flash)
- `buildComplianceMatrix(rfp, draft): Promise<ComplianceItemDraft[]>` — RFP 요구사항 추출 → 각 요구를 섹션(1~7)에 매핑 + `coverage: 'covered'|'partial'|'missing'` + scoringWeight(알면). 
- **missing 있으면 경고**(실격 위험 RS-3) — 로깅 + 결과에 표시.
- model: `modelFor('engine.compliance')`(flash).

### Task 3 — 결정론 faithfulness gate (`engine/verify.ts`, Flash)
- `verifyDraft(draft, retrieve): Promise<{draft, report}>`:
  - 각 섹션에서 **사실 주장 추출**(특히 수치·실적·당선 주장) — Flash, JSON.
  - 주장별 `retrieve(claim)` → **entailment 판정**(Flash, "근거가 이 주장을 지지하나? yes/no/partial" — 결정론 임계). 
  - **미지지 주장 처리**: 수치 주장이 근거에 없으면 **제거 또는 재생성**(조작 0). 일반 주장 미지지면 약화/인용 부착.
  - report: {총 주장, 지지/미지지, 제거/수정 건}. draft에 인용(SourceTrace/EvidenceRefs) 부착.
- model: `modelFor('engine.verify')`(flash — 주장 多·RPD).

### Task 4 — engine/index.ts 파이프라인 삽입
순서: `gather → assemble → **win-theme → compliance → verify** → self-score → 정제`. 
- win-theme/compliance 결과를 EngineResult에 포함(+ 라우트가 DB persist).
- verify는 self-score 전에 — 검증된 draft를 채점.
- 기존 스테이지 로직 불변, 호출 순서만.

### Task 5 — route persist
`assemble/route.ts`: generateDraft 결과의 WinTheme[]·ComplianceItem[]를 prisma로 저장(projectId 연결). draft persist는 기존대로.

### Task 6 — smoke (`scripts/_smoke-ex2.ts`, 실행 후 삭제)
fixture 1건(B2G-청년창업) → generateDraft(새 3스테이지 포함) → 로깅: WinTheme 수(+proof 개수)·compliance covered/partial/missing·verify report(주장 지지율·제거 건)·self-score overall. **EX-1 baseline(71 또는 A/B hybrid 66) 대비 상승 확인.** 출력 후 삭제.

## 🔒 Tech Constraints
- 새 스테이지 = Flash(modelFor). Pro 2키 불변. JSON=safeParseJson. 직접 SDK 금지.
- WinTheme proof[] 빈 항목 = 드롭(강제). 수치 미지지 = 제거(조작 0).

## ✔️ Definition of Done
- [ ] `engine/{win-theme,compliance,verify}.ts` + index 삽입 + route persist
- [ ] proof chain 강제(빈 proof 드롭) · 금지어 차단 · 수치 faithfulness(미지지 제거)
- [ ] `npm run typecheck`·`lint`·`check:manifest` 통과
- [ ] **smoke**: WinTheme(proof≥1)·compliance matrix·verify report 생성 + self-score가 baseline 대비 **상승**(수치 첨부) → 삭제
- [ ] `git diff --name-only` ⊆ CAN-touch

## 📤 Return Format
```
## ✅ 한 일 (스테이지별)
## ❌ 못한 일 / 보류
## 🤔 결정한 것 (proof 임계·금지어 사전·entailment 판정 방식)
## 🔬 검증 (smoke: WinTheme/compliance/verify 로그 + self-score baseline→신규 Δ + typecheck/lint/manifest)
## ⚠️ 위험 신호 / 다음 진입점 (win-theme Pro 승격·async 라우트·EVAL-1 calibration)
```

## 🚫 Do NOT
- 기존 스테이지 로직 변경 · Pro 키 추가(2키 유지) · ExpressDraftSchema 구조 변경 · 레거시 엔진 · git commit/push · 추측

## 💡 Hints
- 메인 docs 동시작업 — 코드만, `.md` 금지, git write 금지.
- faithfulness는 주장이 많아 호출 多 → 반드시 Flash(10K RPD). 배치 묶기 OK(한 콜에 여러 주장 판정).
- WinTheme proof = ProofRef[] {kind,assetId?,winningChunkId?,sroi?,text} (schema.prisma 주석). retrieve() 결과의 citation을 proof로 매핑.
- self-score 상승이 핵심 지표 — risk/evidence/winningLanguage 렌즈가 오르는지 보라.

## 🏁 Final Note
부수 발견(win-theme Pro 필요성·async·full Rubric panel)은 보고만. EX-2 = "검증·win-theme·compliance가 self-score를 올린다"까지.
