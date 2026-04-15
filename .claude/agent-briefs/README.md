# Agent Briefs Index

서브 에이전트에게 위임할 작업의 자급자족 브리프 모음. 메인 세션이 `Agent` 도구로 서브 에이전트를 생성할 때 브리프 내용을 `prompt`로 전달합니다.

> **📌 이 브리프들은 Planning Agent 트랙 (코치 풍부화 / 추천 / UI 임베드) 전용입니다.**
> 파이프라인 재설계 트랙(Step 순서 변경, PipelineContext, PM 가이드)은 별도입니다 —
> [../../ROADMAP.md](../../ROADMAP.md) / [../../REDESIGN.md](../../REDESIGN.md) 의 Phase A~F를 따르세요.
>
> 두 트랙의 상호 관계: [../../PLANNING_AGENT_ROADMAP.md](../../PLANNING_AGENT_ROADMAP.md) 상단 참조.

---

## 📋 브리프 목록

| 브리프 | Phase | 독립성 | 격리 방식 | 예상 시간 | 의존성 |
|--------|-------|--------|---------|---------|-------|
| [phase-5-coach-ui.md](./phase-5-coach-ui.md) | 5. Coach Finder UI 임베드 | ⭐⭐⭐ 완전 독립 | Worktree + 백그라운드 | 1.5일 | 없음 (즉시 시작 가능) |
| [phase-3-enrich.md](./phase-3-enrich.md) | 3. Coach 데이터 풍부화 | ⭐⭐ 스키마만 필요 | 일반 (메인 브랜치) | 1일 | Phase 2 스키마 완료 |
| [phase-4-recommend.md](./phase-4-recommend.md) | 4. 추천 엔진 | ⭐ 여러 의존성 | Worktree | 2일 | Phase 1 (types) + Phase 3 (풍부화) |

---

## 🎯 실행 타임라인 (메인 세션 관점)

```
Day 1 아침:
├─ 메인: Phase 1 시작 (Agent 로직)
└─ Agent B (Phase 5): Worktree 백그라운드 시작 ← 이 브리프 사용

Day 4 (Phase 2 스키마 완료 후):
├─ 메인: Phase 4 인터페이스 설계
└─ Agent C (Phase 3): 일반 서브 에이전트 시작 ← 이 브리프 사용

Day 5-6 (Phase 3 완료 후):
├─ 메인: Phase 4 직접 구현
OR
└─ Agent D (Phase 4): Worktree 시작 ← 이 브리프 사용 (대안)

Day 7 이후:
└─ 메인이 직접 Phase 6 통합
```

---

## 📖 메인 세션에서 브리프 사용법

### Option 1: 백그라운드 (Phase 5 권장)
```typescript
Agent({
  description: "Phase 5 Coach Finder UI port",
  subagent_type: "general-purpose",
  isolation: "worktree",
  run_in_background: true,
  prompt: fs.readFileSync('.claude/agent-briefs/phase-5-coach-ui.md', 'utf-8'),
})
```
완료 시 자동 알림. 메인 세션은 다른 작업 계속.

### Option 2: 포그라운드 (결과 즉시 필요할 때)
```typescript
Agent({
  description: "Phase 3 Coach data enrichment",
  subagent_type: "general-purpose",
  prompt: fs.readFileSync('.claude/agent-briefs/phase-3-enrich.md', 'utf-8'),
})
```
메인 세션 블록. 결과 받을 때까지 대기.

---

## ✅ 브리프 품질 체크리스트 (모든 브리프에 적용)

각 브리프는 다음 요소를 반드시 포함:

- [x] **🎯 Mission** — 한 문장으로 무엇을 하는지
- [x] **📋 Context** — 프로젝트 배경 + 왜 이 작업이 필요한지
- [x] **✅ Prerequisites** — 시작 전 확인 사항 (실패 시 STOP)
- [x] **📖 Read These Files First** — 읽어야 할 파일 경로 목록
- [x] **🎯 Scope** — CAN touch / MUST NOT touch 명시
- [x] **🛠 Tasks** — 번호 붙은 상세 단계
- [x] **🔒 Tech Constraints** — Next.js 버전, Claude 모델, 브랜드 가이드
- [x] **✔️ Definition of Done** — 체크리스트
- [x] **📤 Return Format** — 결과 보고 형식 (토큰 효율용)
- [x] **🚫 Do NOT** — 금지 사항
- [x] **💡 Hints & Edge Cases** — 예상 엣지 케이스
- [x] **🏁 Final Note** — 맥락 재강조

---

## 🔄 브리프 업데이트 규칙

1. **브리프는 살아있는 문서** — Phase 1, 2가 완료되면서 전제 조건이 구체화되면 브리프를 업데이트
2. **버전 관리 불필요** — 항상 최신 상태만 유지. Git 히스토리로 추적.
3. **실행 전 재확인** — 메인 세션은 Agent 호출 전 브리프의 Prerequisites 섹션 재확인
4. **실행 후 교훈 반영** — Phase 완료 후 이슈가 있었으면 브리프에 hint 추가 (다음 비슷한 작업에 재사용)

---

## 🆘 브리프 실행 중 문제 생기면

서브 에이전트가 브리프를 읽고도 막히면 다음 중 하나:

1. **Prerequisites 미충족** → 메인 세션이 선행 작업 완료 후 재실행
2. **파일 경로 변경** → 브리프 업데이트
3. **타입/API 계약 변경** → 의존 Phase의 결과 확인 후 브리프 수정
4. **에이전트가 예상치 못한 판단 필요** → 브리프에 결정 가이드 추가 + 재실행

에이전트는 막히면 STOP하고 메인에게 보고 — 절대 추측으로 진행 금지.
