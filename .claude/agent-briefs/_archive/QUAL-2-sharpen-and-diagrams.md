# Brief QUAL-2 — 커리큘럼·타임라인·실행계획·컨셉 날카롭게 + 도식 PPTX

> **자급자족.** 본 파일 + `../../CLAUDE.md` + `../../AGENTS.md` + `../../docs/glossary.md`.
> 막히면 추측 금지 → STOP 후 메인 보고.

| 메타 | 값 |
|------|----|
| ID | `QUAL-2-sharpen-and-diagrams` |
| 작성일 | 2026-06-01 |
| 우선순위 | P2 (사용자 직접 피드백 — 4 차원 + 도식 산출물) |
| 격리 | 일반 (단독) |
| 관련 | EX-1·EX-2·QUAL-1 · produce-slide-specs·pptx-builder · Tech Spec §7 |
| 의존 | 엔진·`produceSlideSpecs`·`buildPptx` — 완료 |

## 🎯 Mission
사용자 피드백 4개를 **엔진 프롬프트로 날카롭게**: (1) **커리큘럼 구체성**(주차별 주제·활동·산출물·도구) (2) **타임라인**(전체 일정·마일스톤) (3) **세부 실행계획**(준비→모집→교육→데모데이→결과보고 단계·담당) (4) **메인 컨셉 매력**(기억에 남는 named 솔루션 1줄 + 왜 매력적). + **slideSpecs를 엔진에 연결** → 1차본을 **도식 PPTX**로 렌더해 산출물 생성. (사용자가 draft + 도식 덱을 직접 검증.)

## 📋 Context
사용자가 샘플 1차본 읽고: "전체 좋은데 커리큘럼 구체성·타임라인·세부 실행계획·메인 컨셉 매력이 더 날카로웠으면. 도식화 산출물 보고싶다." 엔진은 7섹션은 만들지만 ① 커리큘럼이 주차 테이블·산출물까지 안 내려감 ② 명시 타임라인 없음 ③ 메인 컨셉이 평이 ④ slideSpecs 미생성(EX-1이 produce-slide-specs 연결 안 함).

## ✅ Prerequisites (STOP)
- [ ] 엔진 `generateDraft`·`assemble.ts`(writeSection·projectionGuide) · `produceSlideSpecs`(produce-slide-specs.ts) · `buildPptx`(diagrams/pptx-builder.ts) · `SlideSpec`(diagrams/slide-pattern.ts 8패턴) 존재
- [ ] Gemini 한도 여유

## 📖 Read These Files First
1. `docs/sample-draft-B2G.md`(현재 품질·약점 — 사용자 피드백 대상) · Tech Spec §7(과업·커리큘럼)
2. `src/lib/express/engine/{assemble,index,types}.ts` · `src/lib/express/produce-slide-specs.ts`(입력·출력) · `src/lib/diagrams/pptx-builder.ts`(`buildPptx(input)`) · `slide-pattern.ts`(timeline·process-flow·kpi-grid 등) · `src/app/api/express/export-pptx/route.ts`(buildPptx 호출 예)

## 🎯 Scope
### CAN touch
- `src/lib/express/engine/assemble.ts` (§2 컨셉 + §3 커리큘럼·타임라인·실행계획 프롬프트 강화 — projectionGuide/writeSection 텍스트)
- `src/lib/express/engine/index.ts` (assemble 후 `produceSlideSpecs` 호출 → draft.slideSpecs 채움)
- `src/lib/express/engine/types.ts` (필요 시 EngineInput에 slideSpecs 옵션)
- `scripts/_gen-sample.ts` (1 RFP 생성 + slideSpecs + buildPptx → 파일 저장. **삭제 안 함 — 메인이 산출물 전달**)
### MUST NOT touch
- self-score/verify/win-theme/compliance 본문 · produce-slide-specs/pptx-builder 본문(호출만) · invokeAi/modelFor · ExpressDraftSchema 구조(slideSpecs는 기존 optional 필드) · 레거시 엔진

## 🛠 Tasks

### Task 1 — §3 커리큘럼 구체성 + 타임라인 (assemble.ts)
§3(사업 내용) projectionGuide/프롬프트 강화:
- **주차별 커리큘럼 테이블** 강제: 각 주차(W1~WN) = {주제 · 핵심 활동 · 사용 도구/방법론 · 산출물}. 막연한 단계 서술 ❌ → 주차·산출물 명시 ⭕.
- **Action Week**(실행 주차) 명시 — 이론 연속 금지(언더독스 원칙).
- 과업별로 이 구체성 적용(교육 과업은 주차 커리큘럼, 행사 과업은 운영 타임라인).

### Task 2 — 세부 실행계획 + 전체 타임라인 (assemble.ts)
- 명시적 **사업 전체 타임라인**(준비/세팅 → 모집·선발 → 주차별 교육 → 데모데이 → 성과 결과보고) — 월/주 단위 + 마일스톤 + 담당(PMO/코치). §2 또는 §3·§4 적절 위치.
- 단계별 실행 디테일(누가·언제·무엇을·산출물).

### Task 3 — 메인 컨셉 매력 (§2, assemble.ts)
- **메인 솔루션을 기억에 남는 named 컨셉 1줄**로(예: "Act-preneur 8주 BM 고도화 사이클" 같은 brandable 한 줄) + **왜 매력적인가**(발주처 hot button 직격·차별화·편익). 평이한 서술 ❌ → 날카로운 컨셉 ⭕.

### Task 4 — slideSpecs 엔진 연결 (index.ts)
- assemble 후 `produceSlideSpecs`(draft + trackRecord/budget 등 입력) 호출 → `draft.slideSpecs` 채움. 실패 시 graceful(빈 배열). 모델은 produce-slide-specs 기존대로.
- **timeline 패턴**(커리큘럼/사업 타임라인)·process-flow(추진 사이클)·kpi-grid(성과)가 나오도록 입력 충실히.

### Task 5 — 샘플 생성 + PPTX 렌더 (`scripts/_gen-sample.ts`, **유지**)
- B2G-청년창업 fixture → `generateDraft`(강화된 §2·§3 + slideSpecs) → markdown 저장 `docs/sample-draft-B2G-v2.md` + **`buildPptx`로 `.pptx` Buffer → `docs/sample-draft-B2G-v2.pptx` 저장**.
- 로깅: 섹션 길이·주차 테이블 유무·slideSpecs 개수·도식 패턴 목록·self/panel(선택).
- ⚠️ **이 스크립트는 삭제하지 말 것**(메인이 재실행·산출물 확인). 단 결과 파일(.md/.pptx)은 docs/에.

## 🔒 Tech Constraints
- 프롬프트 강화는 텍스트만(로직·모델 인자 불변). slideSpecs는 produceSlideSpecs 호출(본문 무수정). pptx는 buildPptx 호출. JSON=safeParseJson.
- 모델: 라우팅 불변(§3 core=Pro, 나머지 Flash). slideSpecs/pptx 기존 모델.

## ✔️ Definition of Done
- [ ] §3 주차 커리큘럼 테이블·산출물 + 전체 타임라인 + 실행계획 단계 + §2 named 컨셉 (프롬프트 강화)
- [ ] index.ts가 slideSpecs 생성(draft.slideSpecs ≥ 3, timeline 패턴 포함)
- [ ] `docs/sample-draft-B2G-v2.md` + **`docs/sample-draft-B2G-v2.pptx`** 생성(buildPptx)
- [ ] `typecheck`·`lint`·`check:manifest` 통과
- [ ] `git diff --name-only` ⊆ CAN-touch (산출물 docs/·_gen-sample.ts 유지)

## 📤 Return Format
```
## ✅ 한 일 (4 차원 프롬프트·slideSpecs 연결·pptx)
## ❌ 못한 일 / 보류
## 🤔 결정한 것 (커리큘럼 테이블 형식·컨셉 네이밍·slideSpecs 입력)
## 🔬 검증 (sample-draft-v2 발췌: 주차 테이블·타임라인·컨셉 / slideSpecs 패턴 목록 / pptx 생성 확인 / 게이트)
## ⚠️ 위험 신호 / 다음 진입점 (실 자산 grounding·pptx 디자인 다듬기)
```

## 🚫 Do NOT
- self-score/verify/win-theme/compliance/produce-slide-specs/pptx-builder 본문 변경 · 모델 라우팅 변경 · ExpressDraftSchema 구조 · _gen-sample.ts·산출물 삭제 · git commit/push

## 💡 Hints
- 메인 docs 동시작업 — 코드+docs/산출물만, `.md` 기존문서 금지(신규 sample-v2는 OK), git write 금지.
- 현 §3은 단계 서술까지만(주차 테이블·산출물 없음) → 주차 grid가 구체성·타임라인 동시 해결.
- buildPptx 호출 형태는 `export-pptx/route.ts` 참고(draft.intent·sections·slideSpecs 전달).
- timeline 패턴 데이터(TimelineDataSchema)를 커리큘럼 주차로 채우면 사용자 요청 "타임라인 도식" 충족.

## 🏁 Final Note
부수 발견(pptx 디자인 미세조정·실 자산 grounding)은 보고만. QUAL-2 = "4 차원 날카로워진 draft + 도식 PPTX 산출물"까지.
