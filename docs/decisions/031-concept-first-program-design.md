# ADR-031: 컨셉-퍼스트 프로그램 기획 — 대화로 도출하는 컨셉/메시지 + 운영유형 축 재구성 + 메시지 value-chain 관통

**Status:** Accepted (2026-06-27, 사용자 목업 2종 승인 + "(깊음) ①+②+③" 선택 + "진행해줘")
**Date:** 2026-06-27
**Deciders:** 사용자 (방향·"T1-5가 너무 정형화된 규칙처럼 보인다 · 컨셉/메시지를 더 뾰족하게 · 좌측 대화로 선택하며 도출") + 메인 세션
**관련/연장:** ADR-028(program-design grammar 운영유형 T1~T5)·ADR-008(Impact Value Chain)·ADR-029(단일 워크스페이스)·BR-WS-17/21(대화 카드 UX)

## Context

프로그램 기획(design) 단계가 **구조(운영유형)부터 고르게** 돼 있다. 첫 화면이 T1~T5 박스 선택 게이트라 — 근거는 실측 당선작 아키타입(n=23·22·20…)으로 탄탄한데도 — **"정해진 규칙 메뉴 고르기"** 로 읽힌다. 정작 당선을 가르는 **컨셉·핵심 메시지(뾰족한 차별 각도)** 는 ②기획의도(strategicNotes)에 흩어져 있고, 구조 결정보다 **앞에 없다.**

사용자 (2026-06-27):
- *"최초 프로그램 기획 단계에서 컨셉이랑 메세지 내용을 좀 더 뾰족하게 잡아야 하는데 T1-5까지가 너무 정형화된 규칙처럼 보여."*
- *"컨셉이나 이런 부분을 좌측 대화를 통해서 뭔가 선택을 하면서 뾰족하게 도출이 되어야 하지 않을까?"*

승인된 목업 2종: 컨셉-퍼스트 캔버스 + **좌측 대화로 단계별 선택→우측 캔버스에 맺힘** (대화 도출).

## Decision

**프로그램 기획은 "컨셉-퍼스트"로 재정렬한다. 운영유형은 컨셉의 결과로 강등한다. 컨셉·메시지는 좌측 대화로 도출하고, 정해진 메시지가 전 단계를 관통한다.**

### ① 컨셉·메시지 = 좌측 대화로 도출 (메뉴 아님)
- 기획 단계 진입 시 좌측 대화가 **컨셉 잡기 가이드 흐름**을 연다. AI가 `RFP + strategicNotes(기획의도) + 당선패턴 브레인(WinningProposalDoc) + UD 자산`을 종합해 **날 선 질문 + 선택 카드**를 단계별로 제시(각도 → 차별점 → 발주처 우려에 답할 한 줄 …).
- PM 이 카드를 고를수록 컨셉이 좁혀지고, **언제든 자유 입력으로 더 뾰족하게** 밀 수 있다. (카드 UX = BR-WS-17/21 재사용.)
- 선택이 누적되면 컨셉이 **조립**돼 우측 캔버스에 맺힌다: `win-theme 한 줄 + 핵심 메시지 3 + 차별점 + 근거 + 좁혀온 경로(provenance)`.
- **강제 없음** — 카드 클릭/직접 입력만 반영. 근거·경로 투명. 점수/합격 단정 금지, SROI 렌즈 원칙 유지.

### ② 운영유형 = 컨셉의 결과 (고정 게이트 → 축 조정)
- T1~T5 "박스 선택 게이트"를 폐기하고: 컨셉이 정해지면 엔진이 **운영유형 1개 추천 + "왜"** 를 제시하고, **실제 축**(압축↔동행 · 팀↔개별 · 교육↔행사 · 대상 시간 통째 가능 토글)을 노출해 PM 이 미세조정 → 엔진이 운영유형으로 resolve.
- 라벨(‘장기 여정형’ 등)은 **축 위치의 요약 + 실측 앵커**(기간·회차·예산 중앙, n=)로 남는다 — 고정 규칙이 아니라 근거 있는 출발점.
- **엔진 계약 동결**: `OperatingType` enum(T1~T5)·`detectOperatingType`/`resolve-rules`·회차표↔비회차 분기는 **불변**. 바뀌는 건 게이트 **UI 표현**(박스→축)과 컨셉→축 바이어스뿐.

### ③ 메시지 value-chain 관통 (ADR-008 연장)
- 정한 컨셉·핵심 메시지가 **커리큘럼 rationale → 예산 프레이밍 → SROI 내러티브 → 제안서** 프롬프트에 context로 주입돼 일관 관통한다. "당선 가능한 1차본"의 척추.

### 데이터 모델 (스키마 변경 0)
- 컨셉은 **`Project.strategicNotes`(Json) 확장** — 새 sub-object `concept: { winTheme, keyMessages[3], differentiation, grounding[], derivationPath[], chosenAngle, axisHints? }`. 기존 기획의도 키와 공존. **마이그레이션 보류 준수(새 필드·모델 0).** load-workspace 가 이미 strategicNotes 로드.

## Consequences

### Positive
- 기획이 "규칙 고르기" → **"날을 세우는 대화"** 로. 컨셉/메시지가 구조보다 먼저, 뾰족하게.
- T1~T5가 "정형 규칙" → "컨셉이 만든 근거 있는 축". 정형화 인상 해소.
- 메시지 일관성 — 한 컨셉이 커리큘럼·예산·SROI·제안서를 관통(value-chain 실현).
- 자동지능 재사용(당선패턴·자산·엔진·카드 UX) — 재구현 최소.

### Negative / Trade-offs
- 기획 단계 흐름 변경 = 빌드 다파장(엔진·UI·스레딩). 웨이브 분할 필요.
- 컨셉 합성 품질은 프롬프트·그라운딩 의존 — 반복 튜닝 필요.
- strategicNotes Json 비대화 — 읽기 가드 필수.

### 불변 (계약)
- `OperatingType` enum·detectOperatingType·resolve-rules·회차표/비회차 분기 = **동결**(UI만 재구성).
- Express schema 섹션 키·invokeAi 단일 진입·prisma 스키마 = 무변경.
- 카드=PM 선택만(강제 변경 금지)·근거 투명·점수/합격 단정 금지·SROI 렌즈.

## 마이그레이션 (웨이브)
1. **W1 — 컨셉 데이터+합성/대화 엔진**: strategicNotes.concept 스키마(읽기가드·저장) + 컨셉 합성 엔진(`concept-synth` — RFP·strategicNotes·당선패턴·자산 → 단계별 질문·카드·조립). 저장 라우트.
2. **W2 — 컨셉 대화 UI + 맺힘 캔버스**: 좌측 design 대화의 컨셉 가이드 흐름(카드, BR-WS-17/21 재사용) + 우측 컨셉 캔버스(win-theme·메시지·근거·좁혀온 경로). 기획 단계 진입 = 컨셉부터.
3. **W3 — 운영유형 축 재구성**: 게이트 UI(박스→축 슬라이더+추천+실측 앵커) + 컨셉→축 바이어스 → resolve(엔진 무변경).
4. **W4 — 메시지 value-chain 관통**: 컨셉·메시지를 커리큘럼/예산/SROI/제안서 프롬프트 context로 주입.
- 각 웨이브: 자급자족 브리프 → 서브 위임 → 게이트 → 프리뷰 검수.

## References
- 승인 목업: concept_first_program_design_mockup · concept_derivation_via_chat_mockup (대화 위젯, 2026-06-27)
- 엔진/자산: program-design(D0~D8)·resolve-rules·strategicNotes(planning-intent)·당선패턴 브레인(WinningProposalDoc)·자산 인용·카드 UX(BR-WS-17/21)
- 원칙: ADR-008(value chain)·ADR-028(operating grammar)·[[ud-target-operating-model]]·[[project-program-design-grammar]]
