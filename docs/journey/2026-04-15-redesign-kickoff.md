# 2026-04-15 — 파이프라인 재설계 Kickoff 세션

> 파이프라인 구조를 전면 재설계하기로 한 날. 하루 동안 ROADMAP/REDESIGN 초안 → 문서 싱크 → 아키텍처 골격(모듈/데이터/Ingestion/품질게이트) → ADR 3건까지 쏟아냄.

## 이날의 맥락
- **참여자:** 사용자(언더독스), AI 공동기획자(메인 세션)
- **무엇을 하려 했나:** 기존 PRD v5.1 구조의 누적된 문제(이중 입력·임팩트 추상성·PM 몰입 흐름)를 해결할 재설계, 그리고 장기 자산 축적 메커니즘 확립
- **어디서 시작했나:**
  - 스텝 순서: `rfp → impact → curriculum → coaches → budget → proposal`
  - Planning Agent Phase 2 진행 중, Phase 3~6 격리 트랙
  - 자산 축적 경로 없음 (하드코딩된 수주 제안서 2건만)

## 흐름 (시간순)

### 1. 사용자가 ROADMAP.md/REDESIGN.md 초안을 내놓음
스텝 순서 변경 + PipelineContext + PM 가이드 시스템 + 예상 점수. 초안은 이미 상당히 정돈됨.

**막힌 지점:** 기존 PRD·CLAUDE.md와 충돌하는 지점이 많아 어느 문서가 최신 소스인지 혼란.

### 2. 문서 싱크 (1차)
CLAUDE.md, PRD-v5.0, README, PLANNING_AGENT_ROADMAP, agent-briefs README 5개 문서의 충돌 제거. PRD-v5.0은 ARCHIVED로 배너 추가 — 삭제 대신 유지한 이유는 비즈니스 룰·IMPACT 모듈·마스터 데이터가 여전히 유효하기 때문.

### 3. 사용자가 협업 방식과 비전을 명확히 함
핵심 발화:
- "너가 AI 공동기획자야. 에이전트들을 시켜서 기능을 별개로 움직일거야."
- "지금 당장 엄청 높은 품질보다 쌓였을 때 강력해지는 구조적 설계가 필요해."
- "수주 가능한 기획이 핵심. 논리구성과 핵심 컨셉 그 구조가 명확하지 않으면 결국 다른 기능은 아무런 의미가 없어."
- "넌 이 구조를 전체 책임지고 중심을 지키고 품질을 검증하고 품질의 수준을 높이기 위한 내용들을 수집해야지, 너가 기능을 하나씩 개발하고 있으면 안 돼"

**생각의 전환:** AI 공동기획자의 역할이 "기능 구현 도우미"가 아니라 **Architect + Guardian + Curator + Orchestrator + Historian**. 내가 기능을 짜면 안 된다는 제약은 품질에 대한 책임을 명시하는 제약이기도 했다.

### 4. 아키텍처 골격 설계
4개 문서를 이어서 작성:
- `modules.md` — CORE/ASSET/INGESTION/SUPPORT 4계층 + Module Manifest 패턴
- `data-contract.md` — PipelineContext 슬라이스 단위 계약·읽기/쓰기 규칙
- `ingestion.md` — 자료 업로드 → 자산 자동 고도화 파이프라인 (사용자 요구의 정체성 결정)
- `quality-gates.md` — 4계층 검증(구조·룰·AI·사람) + 내가 매일 할 일 체크리스트

### 5. ADR 3건 작성
001 파이프라인 순서 / 002 Module Manifest / 003 Ingestion. 각 ADR에 "Teaching Notes" 섹션을 둠 — 신입에게 전할 말을 ADR 단계에서부터 남겨야 교육자료가 살아있다.

## 내가 틀렸던 것

- **처음에 "아키텍처 골격을 짧게 세우고 바로 Phase A 코딩으로 가자"** 고 생각했다. 사용자가 "너는 기능 개발하면 안 된다"고 명시적으로 차단해줘서 방향을 잡았다.
- **Module Manifest를 처음엔 `src/modules/` 폴더 재배치와 묶어서** 생각했다. 이는 과도한 리팩토링 리스크를 만든다 → ADR-002에서 폴더 재배치와 manifest 도입을 분리함.
- **Ingestion을 Phase 후반 기능으로만** 봤다. 사용자의 "쌓일수록 강해지는 구조" 발화 이후에야 이게 **시스템 정체성**이라는 걸 인식. 우선순위 재조정.

## 내가 맞았던 것

- PRD를 삭제하지 않고 ARCHIVED로 유지한 판단 — 비즈니스 룰·IMPACT·SROI가 남아있어야 했음
- 문서 싱크를 먼저 하고 설계로 넘어간 순서 — 동기화 안 된 상태로 아키텍처 문서를 쓰면 어느 쪽이 정답인지 혼란
- ADR에 "Teaching Notes" 섹션을 넣은 것 — 나중에 별도로 교육자료를 만들기보다, 결정 시점의 생생한 맥락을 ADR에서 바로 남기는 게 정확도가 높다

## 잃은 것 / 감수한 것

- **방법론적 순수성**: Impact-First가 UI 순서상 뒤로 밀렸다. 신입 PM 교육 포인트가 됨.
- **기존 구현 재작업 부담**: step-impact.tsx는 Activity 입력 UI를 자동 추출 뷰로 바꿔야 함.
- **초기 개발 속도**: Quality Gate를 도입하면서 Phase A~C는 Gate 1,2만 강제. Gate 3는 Phase D에서야 본격 적용 → 한동안 AI 산출물 품질은 PM 감각에 의존.
- **Module Manifest 강제 지연**: ESLint 룰은 Phase F. 그전까지는 선언과 실제의 gap 가능성 → PR 리뷰로 보완.

## 다음에 또 할 일 (이 상황 재발 시)

- [ ] 큰 재설계 시작 전: **문서 싱크 먼저**, 그 다음 아키텍처
- [ ] 사용자가 "내 역할"을 명시하면 그 제약을 설계 문서에도 새겨 놓기 (quality-gates.md 작성의 계기)
- [ ] ADR 작성 시 Teaching Notes 섹션 비우지 않기 — 시간이 지나면 맥락이 사라진다
- [ ] 아키텍처 문서 4개는 상호 참조가 많음 → 파일명·섹션 이름 변경 시 일괄 검색 필요

## 신입에게 전할 말 (교육자료 씨앗)

**"큰 재설계는 기능을 먼저 만들지 말고 계약부터 그려라."**
- 스텝 순서 하나 바꾸는 것 같지만, 실제로는 모듈 간 계약·데이터 흐름·자산 축적 경로가 전부 재정의되는 일이다.
- 이걸 코드로 먼저 뛰어들면 전부 뒤엎게 된다. 문서 6개 + ADR 3건 정도가 하루치 "속도를 위한 일시 정지"의 적정선이었다.

**"자산 축적 경로가 없는 시스템은 결국 평범해진다."**
- 기능이 80%여도 자산이 쌓이면 6개월 후 강해진다. 100% 기능이어도 자산 경로가 없으면 평범한 SaaS.
- 그래서 Ingestion은 Phase 후반이 아니라 정체성 모듈로 다뤄야 한다.

## 연결

- **ADR:** [001-pipeline-reorder](../decisions/001-pipeline-reorder.md) · [002-module-manifest-pattern](../decisions/002-module-manifest-pattern.md) · [003-ingestion-pipeline](../decisions/003-ingestion-pipeline.md)
- **변경된 문서:**
  - 싱크 1차: CLAUDE.md, PRD-v5.0.md (ARCHIVED), README.md, PLANNING_AGENT_ROADMAP.md, .claude/agent-briefs/README.md
  - 신규: docs/architecture/{modules,data-contract,ingestion,quality-gates}.md, docs/decisions/{TEMPLATE,001,002,003}.md, docs/journey/{TEMPLATE,2026-04-15-redesign-kickoff}.md
  - 메모리: project_pipeline_redesign_20260415.md, feedback_coplanner_mode.md
- **관련 커밋:** (이 세션 커밋 시 추가)
