# ADR-007: 스텝별 티키타카 리서치 흐름

**Status:** Accepted
**Date:** 2026-04-20
**Deciders:** udpb@udimpact.ai, Claude Opus 4.7 agent
**Scope:** pm-guide 모듈 · research API · AI 프롬프트 주입 경로 (curriculum-ai · proposal-ai · logic-model-builder)

## Context

2026-04-20 사용자 피드백:

> "오른쪽 탭도 프로세스가 진척됨에 따라 뭔가 내용이 달라져야 하지 않을까?"
> "리서치를 단계가 진행함에 따라 추가로 요청을 하거나 티키타카가 되는 느낌이 들어야 하는데
>  뭔가 처음 세팅만 하면 그냥 나머지가 너무 자동으로 버튼만 클릭하게 되는 느낌이야."

기존 PM 가이드 우측 패널은 4개 섹션(평가위원 관점 · 당선 레퍼런스 · 흔한 실수 · UD 강점 팁) 만 정적으로 렌더했고, 스텝간 내용 차별화가 약했다. Step 1 에서 한 번 리서치를 수집하면 나머지 스텝은 자동 클릭 일변도로 흘러갔다.

## Options Considered

### Option A — 스텝별 흔한 실수·팁만 확장
- 장점: 최소 구현. 기존 섹션 재사용.
- 단점: 사용자 피드백의 "티키타카 되는 느낌" 은 여전히 부재. 여전히 일방 출력.
- 기각: "PM 이 외부 LLM 에서 답 받아 붙여넣는" 인터랙션이 핵심인데 이 옵션은 이를 만들지 못함.

### Option B — 스텝별 리서치 요청 카드를 우측 패널 최상단에 배치 (채택)
- 장점:
  - 각 스텝 진입 시 "이 스텝에서 왜 이걸 더 알아야 하는가" 를 AI 가 되묻는 티키타카 형태.
  - 답변이 `Project.externalResearch` 에 누적 저장 → 다음 AI 호출에 자동 주입.
  - 제1원칙(시장 흐름 · 통계 · 문제정의 · before/after) 을 각 요청의 `whyAsking` 에 박아 넣음.
- 단점:
  - PM 에게 "리서치 붙여넣기" 작업 부담 추가. (대신 자동 버튼 클릭만 하던 경험을 깨뜨리는 게 본 결정의 목적이므로 받아들임.)
  - 스텝당 2~5개 요청을 품질 유지하며 작성해야 함 (총 21개).

## Decision

6 스텝 각각에 **스텝별 ResearchRequest 리스트** 를 정의하고, PM 가이드 우측 패널 최상단에 `ResearchRequestsCard` 섹션을 배치한다.

### 변경 사항

1. **`src/modules/pm-guide/research-prompts.ts` (신규)**
   - `ResearchRequest` 타입 — `{ id, title, whyAsking, promptTemplate, stores, optional }`
   - `RESEARCH_REQUESTS_BY_STEP: Record<StepKey, ResearchRequest[]>` — 6 스텝 총 21개.

2. **`src/modules/pm-guide/static-content.ts`**
   - `EVALUATOR_PERSPECTIVE_BY_STEP`: 2D 룩업 (6 step × 3 channel = 18 셀).

3. **`src/modules/pm-guide/resolve.ts`**
   - `researchRequests` 를 반환값에 추가 (기 저장 답변과 병합).
   - 평가위원 관점을 step+channel 2D 룩업에서 우선 조회.

4. **`src/modules/pm-guide/sections/research-requests.tsx` (신규)**
   - 클라이언트 컴포넌트. 프롬프트 복사 · 답변 붙여넣기 UX · 저장된 답변 접힘 프리뷰.

5. **`src/modules/pm-guide/panel.tsx`**
   - 섹션 순서: ResearchRequests → Evaluator → CommonMistakes → WinningReferences → UdStrengths.

6. **`src/app/api/projects/[id]/research/route.ts`**
   - POST: `{ stepKey, requestId, answer, stores }` 신규 스키마 + 레거시 공존.
   - `stores='strategicNotes'` 면 `Project.strategicNotes.researchNotes` 에 미러 저장.

7. **`src/app/(dashboard)/projects/[id]/page.tsx`**
   - `PM_GUIDE_STEPS` 에 `'rfp'` 추가 (Step 1 에도 리서치 카드 표시).
   - `PmGuidePanel` 에 `projectId` · `stepKey` prop 전달.

8. **AI 프롬프트 주입 경로 확장**
   - `src/lib/proposal-ai.ts`: `buildSectionPrompt` 공통 블록에 `formatExternalResearch(ctx.research)` 추가.
   - `src/lib/logic-model-builder.ts`: `BuildLogicModelInput.externalResearch` + 프롬프트 주입.
   - `src/app/api/ai/logic-model/route.ts`: `ctx.research` 를 `externalResearch` 로 전달.
   - `src/lib/curriculum-ai.ts`: 기존 이미 주입 중 (변경 없음).

## Consequences

### Positive
- **스텝별 차별화**: 각 스텝의 우측 패널이 다른 질문을 던짐 → "왜 이 스텝에 왔는가" 가 명확.
- **제1원칙 내장**: 각 `whyAsking` 이 "어떤 배점·차별화 손실과 연결되는지" 를 명시 → AI 결과물이 아니라 PM 사고가 제1원칙 프레임 위에서 돌아감.
- **E2E 자동 반영**: PM 답변 → `Project.externalResearch` → `PipelineContext.research` → 다음 AI 호출 프롬프트 → 생성 품질 상승.
- **경험 깨뜨리기**: 자동 버튼 클릭 피로감을 의도적으로 깨고, PM 을 "공동기획자" 로 다시 끌어들임.

### Negative / Trade-offs
- PM 작업 부담 증가. 스텝 통과당 최소 2~3개 리서치 권장. (사용자가 허용한 트레이드오프)
- 21개 요청의 `promptTemplate` 품질을 계속 관리해야 함. 시장 흐름에 따라 리프레시 필요.
- `strategicNotes.researchNotes` 는 새로운 Json 서브 키 — 타입 관점에서는 `Record<string, unknown>` 캐스팅 1회 필요 (StrategicNotes 타입 자체는 확장하지 않음).

### Follow-ups
- [ ] 21개 요청 중 정책 변화가 빠른 항목은 분기별 리프레시 (특히 rfp-market-shift · cur-trend-6month).
- [ ] 일정 기간 PM 사용률 트래킹 — 답변율 30% 미만이면 카드 UX 재검토.
- [ ] "이 스텝엔 요청이 없습니다" 빈 상태 발생 여부 CI 테스트로 강제 (현재는 전 스텝 2개 이상 보장).

## References

- 관련 ADR: ADR-005 (가이드북 분리 — 본 ADR 은 그 원칙 하에서 정적 콘텐츠만 추가), ADR-006 (ProgramProfile — 스텝별 조건부 필터링 계속 적용).
- 관련 문서:
  - `CLAUDE.md` — 설계 철학 §2 "내부 자산은 자동으로 올라온다"
  - `src/lib/planning-principles.ts` — 제1원칙 4개 프레임
  - 메모리: `feedback_first_principle.md`
- 관련 커밋: 본 ADR 과 함께 들어가는 단일 커밋.

## Teaching Notes

**신입 PM/개발자가 이 ADR 에서 배울 것:**

1. **자동화의 함정** — 모든 스텝을 자동 버튼 클릭으로 만들면 PM 이 "공동기획자" 에서 "클릭러" 로 퇴화한다. 의도적으로 티키타카를 삽입하는 것이 품질을 지킨다.
2. **데이터 흐름 사고** — "UI 의 한 버튼" 이 아니라 "PM 답변 → DB → 다음 AI 호출 프롬프트" E2E 경로를 먼저 설계한다. 주입 지점이 없으면 UI 를 만들지 않는다.
3. **제1원칙 내장 방식** — 원칙을 "체크리스트" 가 아니라 "왜 이걸 묻는지" 1문장에 녹여서 내장. 추상 규칙을 PM 이 체감하는 질문으로 변환.
4. **체크리스트: 새 우측 패널 섹션을 추가할 때**
   - [ ] 6 스텝 각각에 최소 2개 항목 보장되는가
   - [ ] 각 항목이 "다음 AI 호출에 어떻게 반영되는가" E2E 로 추적되는가
   - [ ] `stepKey` 를 받는 props 로 스텝간 차별화가 명시되는가
   - [ ] 빈 상태 메시지가 "데이터 없음" 이 아니라 "다음 행동" 을 알려주는가
