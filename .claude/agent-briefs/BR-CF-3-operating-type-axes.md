# Brief BR-CF-3 — 운영유형 축 재구성 (ADR-031 Wave 3)

> **자급자족.** 본 파일 + `docs/decisions/031-concept-first-program-design.md` + 승인 목업(concept_first_program_design 우측 §②) + W1 `ConceptShape`. 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-CF-3-operating-type-axes` · 2026-06-27 |
| 격리 | ud-ops `feat/sroi-integration` in-place |
| 전제 | W1·W2 완료. 본 웨이브=운영유형 게이트 UI 재구성(박스→축). **엔진 동결.** |

## 🎯 Mission
운영유형 게이트가 **T1~T5 박스 중 cold 선택**이라 "정형 규칙"으로 읽힘(사용자 지적). 이걸 **① 컨셉-도출 추천(이 컨셉이면 → T3, 왜) + ② 실제 축(압축↔동행·팀↔개별·교육↔행사·시간 통째 토글) + ③ 실측 앵커(기간·회차·예산 중앙)** 로 재구성한다. PM이 축을 조정 → **가장 가까운 운영유형(T1~T5)으로 resolve → 기존 엔드포인트에 그 유형 post**. **엔진·enum·분기 무변경**(UI 표현 + 컨셉 바이어스 + 축↔유형 매핑만).

## 📋 현재 (survey 확정)
- `program-design/_components/program-design-flow.tsx` — openGates 에 operatingType 있으면 게이트 렌더. 선택 → `onAnswer(gate.axis, type)` → `POST /api/projects/[id]/program-design {decisions:{operatingType}}`(엔진). **이 post 계약 유지(T1~T5 값).**
- `program-design/_components/gate-card.tsx` — `OperatingTypeChoice`(meta·recommended·selected·onPick) 그리드. T1~T5 박스 + 메트릭 칩(기간/회차/코칭/팀코호트/예산) + source.
- `program-design/_components/operating-type-meta.ts` — `OperatingTypeMeta`(type·name·desc·**기간/회차/코칭/인원/팀코호트/예산 수치** + source). 축 위치 산출 원천.
- `resolve-rules.ts` `detectOperatingType` — 키워드 신호. **동결(읽기/호출만).** `plan-types.ts` `OperatingType` enum 동결.
- W2: `savedConcept: ConceptShape` 가 ProgramWorkspace 에 있음(확정 후 ProgramDesignFlow 표시). 게이트까지 스레딩 필요.

## 🎯 Scope
### CAN touch
- **신규** `src/app/(dashboard)/projects/[id]/program-design/_components/concept-to-axes.ts` (① 컨셉→추천 바이어스 `biasTypeFromConcept(concept, metas)` ② 각 유형의 축 프로파일 `axisProfile(meta)` ③ 축값→최근접 유형 `nearestType(axes, metas)`)
- `program-design/_components/gate-card.tsx` (operatingType 게이트 렌더: 박스 → 추천 배너 + 축 슬라이더/토글 + 선택 유형 실측 앵커. 비-operatingType 게이트는 무변경)
- `program-design/_components/program-design-flow.tsx` (savedConcept 받아 게이트에 전달 — 추천 바이어스용)
- `src/components/projects/workspace/ProgramWorkspace.tsx` (designProps 에 savedConcept 전달)
### MUST NOT touch
- `resolve-rules.ts`·`detectOperatingType`·`OperatingType` enum·`plan-types` · `/api/projects/[id]/program-design` 엔진 로직 · `operating-type-meta.ts`(읽기만) · concept route/engine · prisma · `components/ui/**` · 회차표/비회차 생성

## 🧩 축 매핑 계약 (operating-type-meta 수치 기반 — best-effort, 동결 아님)
4축(0~100, 메타 수치에서 산출):
- **압축↔동행**: 기간(개월)·회차 밀도 → 짧을수록 압축. (T2 단기=압축, T3 장기=동행)
- **팀↔개별**: `팀 코호트` 값 → 높을수록 팀(T1~T3 ~0.9), 낮을수록 개별(T4 ~0.23).
- **교육↔행사**: 유형/구조 → T1~T4 교육, T5 행사.
- **시간 통째 토글**: T2 만 true(청년·청소년 시간 통째). 나머지 false.
`nearestType(axes)` = 각 유형 축프로파일과 거리 최소 유형. `biasTypeFromConcept` = concept(chosenAngle·differentiation·keyMessages) 키워드로 추천 유형 가중(동행/개별/행사 등 신호). **추천은 강제 아님 — PM 축 조정이 우선.**

## 🛠 Tasks
1. **concept-to-axes.ts** — `axisProfile(meta)`(메타→4축) · `biasTypeFromConcept(concept, metas)`(→추천 type + 한 줄 why) · `nearestType(axes, metas)`(축→T1~T5). 순수 함수.
2. **gate-card.tsx operatingType 게이트 재구성** — 박스 그리드 대신:
   - **추천 배너**: "이 컨셉이면 → {recommended.name} — {why}" (컨셉 없으면 엔진 gate.recommended fallback).
   - **축 컨트롤**: 3 슬라이더(압축↔동행·팀↔개별·교육↔행사) + 시간 통째 토글. 초기값=추천 유형의 축프로파일.
   - **선택 유형 + 실측 앵커**: 현재 축의 nearestType 라벨(‘장기 여정형’) + 그 유형 메타(기간·회차·예산 중앙·n=) 칩. "라벨은 축 위치의 요약" 1줄.
   - **확정**: 현재 nearestType 으로 `onAnswer(gate.axis, type)`(기존 post 계약). T1~T5 값 그대로 엔진에.
   - (선택) "유형 직접 보기" 접이식으로 기존 5박스도 남겨 안전망(과한 변경 회피).
3. **스레딩** — ProgramWorkspace designProps→program-design-flow→gate-card 로 savedConcept 전달.
4. 디자인킷(accent·radius 0·틴트·슬라이더). 비-operatingType 게이트 무변경.

## 🧪 Self-Verification
- [ ] `typecheck`·`lint`(신규0)·`check:manifest`·`build` 통과 · `git diff` ⊆ CAN-touch(+신규 1)
- [ ] **엔진 무변경**: resolve-rules·enum·/program-design·operating-type-meta diff 없음(operating-type-meta는 import만). post 는 여전히 T1~T5.
- [ ] 축 조정→nearestType 변경→확정 시 그 유형 post. 컨셉 있으면 추천 바이어스, 없으면 fallback. 비-operatingType 게이트 회귀 없음.
- [ ] ⚠️ 메인이 프리뷰+Chrome으로 "컨셉 확정→게이트 축+추천→조정→유형 resolve→1차안 생성" 사후 검수 → **코드 ✓**. 백그라운드 dev·커밋 금지.

## 📤 Return (5섹션): ✅한일/❌못한일/🤔결정(축 매핑 수치 근거)/🔬검증(`코드 ✓`+git diff/`시각 미확인`)/⚠️위험

## ⚠️ 주의
- **엔진·enum·post 계약 동결** — 축은 UI가 T1~T5로 resolve하는 표현일 뿐. detectOperatingType 무변경. 회차표/비회차 생성 무관. 커밋은 메인.
