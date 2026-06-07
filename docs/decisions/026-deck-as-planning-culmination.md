# ADR-026: 덱은 기획의 최종 산출물 — PipelineContext 소비 + 흐름의 마지막에 배치

- **상태**: Proposed (2026-06-07)
- **결정일**: 2026-06-07
- **결정자**: udpb@udimpact.ai + AI Architect (메인 세션)
- **Scope**: `src/lib/deck/author.ts`(입력) · `src/app/api/projects/[id]/deck/route.ts`(grounding 구성) · 덱 생성 UI 위치(`DeckPanel`→제안서 스텝/흐름 끝)
- **관련**: ADR-025(덱-우선 HTML 렌더 — 렌더 파이프라인은 그대로 재사용) · ADR-011(Express 북극성) · ADR-021(단일 엔진) · `src/lib/pipeline-context.ts`(buildPipelineContext)

---

## 배경 (Context)

라이브 E2E 후 사용자 피드백(2026-06-07): *"PPT가 바로 처음부터 나오는 게, 기획 관점에서 흐름이 한눈에 안 보인다. PPT는 마지막에 나와야 하지 않나?"*

코드 매핑으로 확인된 **이중 단절**:
1. **위치** — 덱 생성이 프로젝트 화면 아무 때나 누르는 **독립 패널**(`DeckPanel`). 기획 흐름(RFP→커리큘럼→코치→예산→임팩트→제안서)과 따로 놀고, PPT가 "처음부터" 나옴.
2. **입력 (더 근본)** — 덱 author(`deck/author.ts`)는 **RFP grounding + 당선 코퍼스만** 소비하고, PM이 단계에서 쌓은 **실제 커리큘럼·코치·예산·임팩트(`CurriculumItem`·`CoachAssignment`·`Budget`·`logicModel`/`sroiForecast`)를 반영하지 않음.** 즉 덱은 *기획의 결과물*이 아니라 *기획을 우회하는 지름길*. → 흐름이 안 보이는 본질.

이미 존재하는 정합 패턴: `buildPipelineContext(projectId)`(`src/lib/pipeline-context.ts`)가 6단계 산출물을 한 객체(rfp/curriculum/coaches/budget/impact/proposal 슬라이스)로 조립하고, **제안서 스텝(`proposal-ai.ts generateProposalSection`)은 이미 PipelineContext를 소비**한다. 덱만 이 패턴 밖에 있다.

---

## Decision

**덱 = 기획 흐름의 최종 산출물.** 덱 author 가 **PipelineContext(누적 기획)를 소비**하고, 덱 생성은 **흐름의 마지막(제안서 스텝)**에 위치한다.

### 1. 입력 — PipelineContext 소비
- 덱 생성 라우트가 `buildPipelineContext(projectId)`를 조립해 author 에 전달. author 는 슬라이드를 **실제 기획 산출물**에서 구성:
  - 커리큘럼 슬라이드 ← `context.curriculum.sessions[]`(주차·세션·Action Week)
  - 코치 슬라이드 ← `context.coaches.assignments[]` + Coach 메타(실명·약력)
  - 예산/경제성 ← `context.budget.structure` + `sroiForecast`
  - 임팩트 ← `context.impact.logicModel`(Impact→…→Outcome) + measurementPlan
- **당선 코퍼스 grounding(gather)은 보조 근거로 유지** — 차별화 win-theme·헤드라인 톤. 즉 *기획-우선 + 근거-보강*.
- **수치 창작 금지** 가드 유지: 슬라이드 수치는 PipelineContext 값만. 없으면 비움.

### 2. 빈 단계 — graceful (데이터 현실)
- 실측: 커리큘럼·코치는 보통 채워짐. **예산·임팩트는 비어 있을 때 많음**(PM 미작성·자동생성 없음).
- 빈 슬라이스는 (a) 해당 슬라이드 생략 또는 (b) 코퍼스 grounding 으로 보강하되 **"가안" 표시**. 라우트는 **preflight 경고**(예산/임팩트 비면 "이 슬라이드는 가안" 또는 "단계 먼저 채우기 권장").

### 3. 위치 — 흐름의 마지막
- 독립 `DeckPanel`(아무 때나 즉시 생성)을 **제거/이동** → 덱 생성을 **제안서 스텝(6, `step-proposal.tsx`) 하단의 최종 액션** 또는 흐름 맨 끝에 배치.
- 게이트: 핵심 단계(최소 RFP+커리큘럼) 충족 시 권장. 미충족이면 비활성+안내("기획 단계를 먼저 진행하세요").

### 4. 관계 — 북극성과의 정합
- ADR-011 북극성("RFP→빠른 1차본")의 *빠른 텍스트 1차본*은 **Express/제안서 스텝**이 담당(그대로). 덱은 그 위 **최종 시각 산출물**.
- ADR-025 렌더 파이프라인(DeckSpec→워커→PDF)·DECK-1~3b·DECK-4·THROTTLE **전부 그대로 재사용**. 바뀌는 건 **author 의 입력(grounding)과 UI 위치**뿐.

---

## Consequences

### Positive
- 덱이 기획의 *집약*이 됨 — 흐름이 위→아래로 한눈에. PPT가 마지막에.
- 슬라이드가 실제 커리큘럼·코치·예산·임팩트를 반영 → 진실성·정합성↑(허위 수치↓).
- 제안서 스텝(PipelineContext 소비)과 동일 입력 → 텍스트 제안서와 덱이 같은 기획에서 파생(일관).

### Negative / Trade-offs
- 덱 author 입력 재작업(EngineInput→PipelineContext+grounding). 렌더는 무변경.
- 예산·임팩트 데이터 신뢰도 낮음 → graceful + preflight 필요(빈 덱 방지).
- "아무 때나 빠른 덱" 편의 상실(의도된 트레이드오프 — 사용자 결정).

### Follow-ups
- [ ] DECK-5(author 입력): 라우트가 buildPipelineContext 조립 → author 가 planning grounding 으로 슬롯 채움 + 빈 슬라이스 graceful. (코퍼스 grounding 보조 유지.)
- [ ] DECK-6(UI 위치): DeckPanel 제거/이동 → 제안서 스텝 최종 액션 + 게이트/preflight.
- [ ] 데이터 보강(후속): 예산/임팩트 자동 시드(커리큘럼·코치 rate→예산, 커리큘럼→임팩트) — 덱 신뢰도 근본 향상. (별 트랙.)

## References
- 사용자 피드백 2026-06-07 · Explore 데이터 매핑(PipelineContext·stage 저장)
- 코드: `src/lib/pipeline-context.ts`(buildPipelineContext·슬라이스) · `src/lib/proposal-ai.ts`(PipelineContext 소비 선례) · `src/lib/deck/author.ts`(현 EngineInput 입력) · `src/app/api/projects/[id]/deck/route.ts` · `src/components/deck/DeckPanel.tsx` · `step-proposal.tsx`
- 관련 ADR: 025(렌더 재사용)·011·021

## Teaching Notes
- 덱이 "기획을 우회하는 지름길"이면 흐름이 안 보인다. 덱은 **기획을 소비**해야 흐름의 끝이 된다.
- 정합 패턴은 이미 있었다(`buildPipelineContext` + 제안서 스텝). 덱만 그 밖에 있었을 뿐 — 새 인프라가 아니라 **합류**다.
- 렌더(DeckSpec→PDF)는 입력과 무관 — 바꾸는 건 author 의 grounding 과 UI 위치뿐. 재작업 범위를 좁게.
