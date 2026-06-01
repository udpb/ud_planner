# Brief QUAL-1 — evidence·differentiation 본질 개선 (최약 렌즈 공략)

> **자급자족.** 본 파일 + `../../CLAUDE.md` + `../../AGENTS.md` + `../../docs/glossary.md`.
> 막히면 추측 금지 → STOP 후 메인 보고.

| 메타 | 값 |
|------|----|
| ID | `QUAL-1-evidence-differentiation` |
| 작성일 | 2026-06-01 |
| 우선순위 | P2 (EVAL-1이 측정한 최약 렌즈 직접 공략 — 새 데이터 없이 가능한 마지막 레버) |
| 격리 | 일반 (단독) |
| 관련 | EVAL-1(측정)·ADR-022 §4-B(win-theme→Pro) · Tech Spec §4·§6 |
| 의존 | EX-1·EX-2·EVAL-1·RET-1(retrieve) — 완료 |

## 🎯 Mission
EVAL-1이 정직하게 가리킨 최약 렌즈 **evidence(45)·differentiation(48)**를 본질적으로 끌어올린다: (1) **win-theme→Pro 승격** (2) **assemble가 검색 근거(retrieve)를 섹션 생성에 주입**(grounding) + **정량 주장은 근거 기반만**(없으면 생략) (3) **ghosting + named discriminator**. **honest judge로 evidence·differentiation Δ 측정.**
> ⚠️ 정의된 수정 + 측정까지. 무한 thrashing 금지.

## 📋 Context
EVAL-1: judge가 EX-2 산출물 보게 됐고 risk/ergonomics는 올랐으나 evidence·differentiation 잔존 최약. 원인: (a) win-theme discriminator/proof 품질(차별성) — Flash라 약함 → Pro 승격(ADR-022 §4-B). (b) assemble가 gather한 evidence를 섹션 프롬프트에 충분히 안 넣어 근거 밀도 낮음(evidence). (c) 경쟁 대비(ghosting)·구체 차별점 부재.

## ✅ Prerequisites (STOP)
- [ ] `modelFor`·MODEL_ROUTING(ai/config) · `gather`가 섹션별 evidence 반환(`engine/gather.ts`·types `EvidencePool`) · `win-theme.ts` · `assemble.ts`(writeSection이 evidence 인자 받는지)
- [ ] Gemini 한도 여유

## 📖 Read These Files First
1. EVAL-1 결과(이 브리프 §Context) · ADR-022 §4-B · Tech Spec §4.2(grounding)·§6(evidence·differentiation·ghosting)
2. `src/lib/express/engine/{gather,assemble,win-theme,types}.ts` · `src/lib/ai/config.ts`(MODEL_ROUTING) · `src/lib/retrieval/index.ts`(retrieve 반환 형태·citation)

## 🎯 Scope
### CAN touch
- `src/lib/ai/config.ts` (`engine.wintheme`: 'pro' 추가 — 3번째 Pro 키)
- `src/lib/express/engine/assemble.ts` (writeSection 프롬프트: 섹션 evidence 주입 + 정량 주장 근거 강제 + ghosting/discriminator)
- `src/lib/express/engine/win-theme.ts` (ghosting·named discriminator 프롬프트 보강 — 로직·proof 강제 불변)
- `scripts/_smoke-qual1.ts` (실행 후 삭제)
### MUST NOT touch
- self-score/verify/compliance/index 본문 · invokeAi/modelFor/retrieve 본문 · ExpressDraftSchema · 레거시 엔진 · 다른 트랙

## 🛠 Tasks

### Task 1 — win-theme → Pro (ai/config.ts)
`MODEL_ROUTING`에 `'engine.wintheme': 'pro'` 추가(3번째 Pro 키, ADR-022 §4-B). win-theme.ts가 `modelFor('engine.wintheme')` 쓰면 자동 Pro. (win-theme.ts가 다른 키 쓰면 그 호출의 키 확인.)

### Task 2 — assemble evidence grounding (assemble.ts, 프롬프트만)
- writeSection이 받는 **섹션별 retrieve 근거(RetrievedChunk[])를 프롬프트에 구조화 삽입**(당선청크 발췌·자산 — 출처 표시). 이미 받고 있으면 **주입 강도↑**(현재 약하면 명시 블록으로).
- **정량 주장 규칙**: "수치·실적·통계는 제공된 근거에 있는 것만. 근거 없으면 정량 주장 대신 정성 서술." (조작 0·evidence 밀도↑.) verify가 사후 제거하기 전에 생성 단계에서 grounding.

### Task 3 — differentiation (assemble.ts §2/§3 + win-theme.ts)
- **named discriminator**: 막연한 우위 대신 구체 차별점(예: "4중 지원 체계"·"코치 N명"·"Action Week") + 그 편익.
- **ghosting**: 경쟁/대안의 약점을 **이름 없이** 대비(예: "이론 중심·실행 전환 장치 없는 프로그램과 달리…"). win-theme·추진전략 섹션에.

### Task 4 — 측정 (`scripts/_smoke-qual1.ts`, 실행 후 삭제)
2 RFP(B2G-청년창업·B2B-CSR) × generateDraft → 다중샘플 self-score + 고정 Pro 패널. **EVAL-1 baseline 대비 evidence·differentiation 렌즈 Δ** 중심 보고(+ overall). Pro콜수(win-theme Pro 포함). 출력 후 삭제.

## 🔒 Tech Constraints
- win-theme=Pro(승격), 그 외 라우팅 불변. 프롬프트만 변경(로직·model 인자 외 불변). proof chain 강제·금지어 차단 유지. JSON=safeParseJson. 직접 SDK 금지.

## ✔️ Definition of Done
- [ ] win-theme Pro 승격(config) · evidence grounding 주입·정량 근거 강제 · ghosting/discriminator
- [ ] `typecheck`·`lint`·`check:manifest` 통과
- [ ] **측정**: evidence·differentiation 렌즈 Δ(EVAL-1 baseline: evidence 45·differentiation 48 → 신규) + overall + Pro콜수 (첨부) → 삭제
- [ ] `git diff --name-only` ⊆ CAN-touch

## 📤 Return Format
```
## ✅ 한 일 (win-theme Pro·evidence 주입·differentiation)
## ❌ 못한 일 / 보류
## 🤔 결정한 것 (grounding 주입 방식·ghosting 위치)
## 🔬 검증 (evidence·differentiation 렌즈 baseline→신규 Δ·overall·Pro콜수 + 게이트)
## ⚠️ 위험 신호 / 다음 진입점 (DATA-2 코퍼스·async·실 RFP 검증)
```

## 🚫 Do NOT
- self-score/verify/compliance/index 로직 변경 · proof 강제 완화 · Pro 키 4번째 추가(3키까지) · ExpressDraftSchema · git commit/push · 무한 thrashing

## 💡 Hints
- 메인 docs 동시작업 — 코드만, `.md` 금지, git write 금지.
- evidence 핵심 = "생성 단계에서 검색 근거를 본문에 녹이고 정량은 근거 기반만". verify(사후 제거)보다 생성 grounding이 근본.
- differentiation은 ud-brand 자산(4중 지원·코치 풀·IMPACT) named discriminator가 잘 먹힘(glossary §6 참고).
- 측정 길다(draft ~10분·judge 다중·win-theme Pro). 2 RFP·RPD 유의. 결과는 stdout 단일 라인으로 즉시 emit(EVAL-1의 monitor 누락 교훈).

## 🏁 Final Note
부수 발견(DATA-2 코퍼스가 evidence 천장·실 RFP 검증 필요)은 보고만. QUAL-1 = "evidence·differentiation을 새 데이터 없이 끌어올린 만큼"까지. 이후는 코퍼스(DATA-2)·실데이터·사용자 검증.
