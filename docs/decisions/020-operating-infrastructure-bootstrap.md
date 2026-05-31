# ADR-020: 일하는 방식 운영 인프라 부트스트랩 (ActBot 체계 채택)

- **상태**: **Accepted** (사용자 승인 — 본 방식으로 진행 중, 2026-06-01)
- **결정일**: 2026-06-01
- **결정자**: udpb@udimpact.ai + AI Architect (메인 세션)
- **관련**: ADR-019 (과업 레이어 — 이 인프라 위에서 진행), ADR-002 (모듈 manifest)
- **Scope**: 운영 문서·메타 전체 (코드 변경 없음)

---

## 배경 (Context)

2026-06-01 ud-ops 전체 종합 점검 결과 + UDImpact-ActBot 심층 학습 결과, 두 사실이 드러났다:

1. **ud-ops 의 일하는 방식 인프라가 부분·표류 상태.** ADR·Journey·CLAUDE/AGENTS 는 있으나 — HANDOFF·HISTORY·glossary 부재, ADR 뎁스·인덱스 들쭉날쭉, 자급자족 브리프 시스템이 옛 Planning Agent 트랙에 묶여 stale, **문서가 코드보다 ~2세대 stale**(ROADMAP "Wave V 미시작" vs 실제 Brain Sphere-2+alpha-test).

2. **`C:\Users\USER\bots\UDImpact-ActBot`** 가 ActionAI(18개월 검증)에서 이식한 성숙한 운영 체계를 보유 — 5역할 분리, 자급자족 브리프, 문서 5분리(Journey/ADR/HISTORY/HANDOFF/glossary), Rubric, K-시리즈 흡수.

사용자 요청 (2026-06-01):
> "ActBot처럼 위임+검증+투명보고 방식으로 해주고, 네가 판단했을 때 일하는 방식에 고도화·반영할 부분을 바로 반영해서 일을 할 수 있는 최상의 세팅을 먼저 만들어줘."

안 하면 무엇이 깨지나 (이미 ud-ops 에서 일어난 일):
- 한 AI 가 다 구현 → 제안서 생성 엔진 3개로 표류
- 결정 이유 휘발 · 명명 체계 3번 바뀌어 충돌 (Phase/Wave/Brain-W)
- 문서 stale 누적 → 신규 진입점이 거짓 정보를 먼저 읽음

---

## Options Considered

### Option A — 점진적으로 한 줄씩 추가
- 장점: 가벼움.
- 기각: 사용자가 "최상의 세팅을 먼저" 명시. 점진 = ud-ops 가 지금까지 표류한 방식.

### Option B — ActBot `.claude`·`docs` 를 그대로 복사
- 장점: 빠름.
- 기각: 도메인 다름 (ActBot=LangGraph 코칭 챗봇, ud-ops=Next.js/Prisma 제안서 자동화). 변경 금지 항목·글로서리·스택 모두 다름.

### Option C — ActBot 체계를 ud-ops 현실에 어댑테이션 + 점검에서 드러난 표류 동시 진실화
- 장점: 검증된 패턴 + ud-ops 특화(Express/Brain/Deep·3기둥·ADR-019) + stale 문서 정정을 부트스트랩에 통합.
- 단점: 초기 셋업 비용 (문서 ~10건). 메인 세션 오버헤드 (매 세션 HANDOFF/Journey 갱신).
- **채택**: 사용자 명시 요구 + ud-ops 의 실제 문제(표류)를 같이 해결.

---

## Decision

**ActBot/ActionAI 의 일하는 방식을 ud-ops 에 어댑테이션해 운영 인프라로 부트스트랩한다.** "위임 + 검증 + 투명 보고" 채택.

### 1. 5역할 분리 (메인=구조, 서브=구현)
메인 세션 = Architect·Guardian·Curator·Orchestrator·Historian, **기능 코드 직접 구현 금지**. 서브 에이전트 = 자급자족 브리프로 구현. (문서·메타 셋업은 메인 직접 — 예외.)

### 2. 신규/갱신 파일 (이 세션에서 작성)
- `docs/playbook/{working-method,brief-checklist,reporting}.md` — 일하는 방식
- `docs/glossary.md` — 제안서 도메인 용어 SSoT (명명 충돌 정리 포함)
- `docs/HISTORY.md` — 문서 버전 ledger + **문서 진실화**(42모델·PRD-v11 깨짐·stale 식별)
- `HANDOFF.md` — 라이브 핸드오버 (stale `HANDOVER.md` 대체)
- `docs/decisions/README.md` — ADR 001~020 인덱스 + 운영 룰
- `docs/journey/README.md` — 세션 로그 골격·룰
- `.claude/agent-briefs/{README.md(재작성),_template.md,_archive/}` — 위임 인프라
- `CLAUDE.md`·`AGENTS.md` — 일하는 방식 섹션 + 서브 에이전트 룰 추가 (기존 내용 보존)

### 3. 안정 vs 가변 레이어 명문화
가변(프롬프트·가중치·루브릭)은 하드코딩 금지 → 데이터. 안정(스키마 키·invokeAi·manifest 계약)은 ADR 동결.

### 4. 후속 트랙 (ActBot 깊이로 ud-ops 재기획)
PRD 단일진실 재작성 · 저니맵 · Rubric(평가위원 패널 승격) · K-시리즈 흡수 표준화 — 별도 진행.

---

## Consequences

### Positive
- 새 세션 진입점 명확 (HANDOFF→HISTORY→glossary→브리프). 거짓 정보 먼저 읽는 문제 해소.
- 서브 에이전트 자급자족 가능. 결정 이유 영구 보존. 용어 침투 차단.
- 문서 표류 진실화 (HISTORY 가 42모델·stale 식별).

### Negative / Trade-offs
- 초기 문서 ~10건 작성 비용. 매 세션 HANDOFF/Journey 갱신 오버헤드.
- "급할 때 직접 짜기" 차단 = 단기 속도 손실, 장기 구조 보존 (사용자 동의 트레이드오프).

### Follow-ups
- [ ] 사용자 검토 → Proposed → Accepted 전환
- [ ] `HANDOVER.md`·`docs/architecture/current-state-audit.md`·`PLANNING_AGENT_ROADMAP.md` → `docs/archive/`
- [ ] CLAUDE.md 의 stale worktree "삭제됨" 주장 정정 (2개 실재 — 사용자 확인 후 삭제)
- [ ] ADR-021 (단일 생성 엔진) · ADR-015/017 상태 정정
- [ ] glossary §본문 사용자 검토 확정

## References
- 메모리: `reference-actbot-operating-system`, `project-direction-workstream`
- 원천: `C:\Users\USER\bots\UDImpact-ActBot` (ADR-001 일하는 방식 부트스트랩)
- 관련 journey: docs/journey/2026-06-01-operating-infra-bootstrap.md

## Teaching Notes
**신입이 배울 것:**
- 표류는 "일하는 방식 부재"의 증상이다. 기능보다 구조 인프라를 먼저 세운다.
- 검증된 외부 패턴은 복사(B)가 아니라 도메인 어댑테이션(C)으로 가져온다.
- 부트스트랩에 "현 상태 진실화"를 끼워넣으면 인프라 구축과 부채 청산을 한 번에 한다.
