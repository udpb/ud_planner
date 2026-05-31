# 2026-06-01 · 운영 인프라 부트스트랩 (ActBot 체계 채택)

| 메타 | 값 |
|------|----|
| 메인 세션 | Claude Opus 4.8 (1M) |
| 작업 시간 | ~1 세션 |
| 트리거 | "ActBot처럼 위임+검증+투명보고 방식으로 하고, 고도화·반영할 부분 바로 반영해서 일할 수 있는 최상의 세팅을 먼저 만들어줘" |
| 관련 ADR | ADR-020 (Proposed), ADR-019 (과업 레이어, Proposed) |
| 다음 세션 진입점 | HANDOFF.md "다음 세션 진입점" |

## 한 일
1. ud-ops 운영 문서 실제 상태 점검 — playbook(빈 디렉토리)·agent-briefs(옛 Planning Agent 트랙 stale)·glossary/HANDOFF/HISTORY/README 부재 확인.
2. UDImpact-ActBot 6에이전트 병렬 심층 학습 (직전 세션) 기반으로 ud-ops 어댑테이션.
3. **신규 작성**: `docs/playbook/{working-method,brief-checklist,reporting}.md` · `docs/glossary.md` · `docs/HISTORY.md` · `HANDOFF.md` · `docs/decisions/README.md` · `docs/journey/README.md` · `.claude/agent-briefs/_template.md` · ADR-020 · 본 journey.
4. **재작성**: `.claude/agent-briefs/README.md` (Planning Agent 전용 → 일반 위임 시스템).
5. **아카이브**: 옛 브리프 5건(phase-3/4/5 + guidebook/redesign) → `_archive/`.
6. **갱신**: CLAUDE.md(일하는 방식 + 읽는 순서 섹션) · AGENTS.md(서브 에이전트 룰 + 변경 금지 항목).
7. HISTORY 에 **문서 진실화** 통합 — 42모델·PRD-v11 깨진 링크·stale HANDOVER/ROADMAP 식별.

## 뭘 틀렸나 / 의외 발견
- ud-ops 에 이미 agent-briefs 12항목 체크리스트의 **씨앗이 있었음** (옛 README) — 다만 Planning Agent 트랙에 묶이고 stale ROADMAP 참조. 재발명 아니라 일반화로 처리.
- CLAUDE.md 가 "worktree 2개 삭제됨" 이라 주장하나 **실재** (`.claude/worktrees/{amazing-khorana,blissful-goodall}-*`). 파괴적 git 작업이라 삭제 안 하고 HANDOFF/ADR-020 follow-up 으로 보고만.
- `docs/playbook/` 디렉토리는 04-15 부터 비어 있었음 — 의도는 있었으나 미실행.

## 결정한 것 (메인 — 사용자 검토 대기)
- 문서·메타 셋업은 메인이 직접 (working-method §2 예외 조항). 기능 코드부터 브리프 위임 전환.
- 브리프 ID 트랙 prefix 체계 (EX/BR/DP/WS/UI/DATA/EVAL/FIX/DOCS).
- glossary §본문은 1차본 — 사용자 검토 후 확정 (역추출이라).

## 다음 세션이 알아야 할 것
- ADR-019·020 사용자 검토 → Accepted 전환 필요.
- 저위험 즉시 작업 가능: Gemini 로그 확인 · 확정 죽은 코드 삭제 · stale 문서 아카이브 (HANDOFF 참조).
- planning-agent 통째 삭제·브랜치 일괄 삭제·회귀 스크립트 선삭제 = **금지** (검증된 함정).

## 변경된 파일
NEW: docs/playbook/working-method.md · brief-checklist.md · reporting.md · docs/glossary.md · docs/HISTORY.md · HANDOFF.md · docs/decisions/README.md · docs/decisions/020-operating-infrastructure-bootstrap.md · docs/journey/README.md · docs/journey/2026-06-01-operating-infra-bootstrap.md · .claude/agent-briefs/_template.md
MODIFIED: CLAUDE.md · AGENTS.md · .claude/agent-briefs/README.md
MOVED: .claude/agent-briefs/{phase-3-enrich,phase-4-recommend,phase-5-coach-ui}.md + guidebook/ + redesign/ → _archive/
UNCHANGED (의도, 부트스트랩 단계): src/** · prisma/** 0건 — 운영 인프라만

---

## 후속 (같은 세션) — 대규모 정리 (헷갈림 제거)

트리거: "기존 문서·코드 모두 수정해서 다른 사람이 이어받아도 깔끔하게. 불필요한 거 제거 + 재정렬."

### 문서 (메인 직접)
- stale 8건 → `docs/archive/`: HANDOVER(04-29)·REDESIGN·PLANNING_AGENT_ROADMAP·PROCESS(playbook이 대체)·current-state-audit·DECISION_LOG/OPEN_QUESTIONS(04-16)·DIAGNOSIS(05-03). 루트 .md 13→9.
- 참조 수정: README(HANDOVER→HANDOFF·44→42·핵심문서 표 재작성)·ROADMAP(STALE 배너)·CLAUDE(워크트리 거짓 정정·링크 archive화·ADR 020)·PRD-Brain(깨진 PRD-v11→v8.0)·ADR-015·017(상태 배너)·docs/README(읽는순서·ADR규칙 정합).

### 코드 (FIX-1 브리프 위임 → 메인 검증)
- 삭제 6: infer-program-profile.ts·extract-quote.ts(0 refs)·slide-preview-test 3페이지+generated-draft.json
- 수정 2: proxy.ts(publicPaths 정리)·admin/brain/page.tsx(죽은 루프+미사용 쿼리 제거)
- **메인 독립 검증**: git diff = CAN-touch 부분집합 ✅ · typecheck EXIT 0 ✅ · check:manifest Errors 0 ✅ · build OK(에이전트)

### 뭘 안 했나 (의도 — 과신 삭제 방지)
- agent-test 페이지(planning-agent manifest ui 필드 묶임)·planning-agent·브랜치 일괄·회귀 스크립트·produce-ultimate-draft·worktree 2개 → 보류(라이브 의존/설계결정/사용자 확인).

### 의외 발견
- agent-test 가 planning-agent manifest 의 `ui` 필드로 물려 있어 삭제 시 manifest 깨짐 → 제외 (함정 회피 성공).
- FIX-1 에이전트가 `web-search.ts:13` 의 invokeAi 단일진입점 위반(사전 존재)을 포착 → HANDOFF follow-up 기록.

### 변경 파일 (후속)
MODIFIED: src/proxy.ts · src/app/admin/brain/page.tsx · README.md · CLAUDE.md · ROADMAP.md · PRD-Brain.md · docs/README.md · docs/decisions/015·017
DELETED: src/lib/express/{infer-program-profile,extract-quote}.ts · src/app/(dashboard)/slide-preview-test/** (4)
ARCHIVED(docs): 8건 → docs/archive/ · FIX-1 브리프 → _archive/
