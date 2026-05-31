# Brief <ID> — <한 줄 제목>

> **이 브리프는 자급자족입니다.** 서브 에이전트는 본 파일 + `../../CLAUDE.md`
> + `../../AGENTS.md` + `../../docs/glossary.md` 외에 메인 세션 컨텍스트 없이도
> 작업 가능해야 합니다. 막히면 추측하지 말고 STOP 후 메인에 보고하세요.

| 메타 | 값 |
|------|----|
| ID | `<ID>` (예: `EX1-single-engine-converge`) |
| Owner | 메인 세션이 채움 |
| 작성일 | YYYY-MM-DD |
| 상태 | 🟡 in-progress / ✅ 완료 / 🔴 blocked / 📦 deferred |
| 의존 브리프 | (있으면) `<선행-brief-id>` |
| 우선순위 | P0 / P1 / P2 |
| 예상 시간 | (메인 추정) |
| 격리 | 일반 / worktree |
| 관련 ADR | (있으면) ADR-NNN |

---

## 🎯 Mission
<한 문장 · 능동 동사 · 측정 가능한 종료 상태>

## 📋 Context
<왜 필요한가 — PRD § / ADR-N / Journey 날짜 인용. 안 하면 뭐가 깨지나.>

## ✅ Prerequisites (STOP 조건)
- [ ] <선행 조건> — 검증: `<명령 또는 경로>`
- [ ] <...>
> 하나라도 미충족이면 작업 시작 말고 메인에 보고.

## 📖 Read These Files First
1. `../../CLAUDE.md` · `../../AGENTS.md` · `../../docs/glossary.md` (기본)
2. <작업 관련 파일 — 순서대로>

## 🎯 Scope
### CAN touch (이 파일들만)
- `<경로>`
### MUST NOT touch (절대)
- `prisma/schema.prisma` 핵심 키 · `src/lib/ai-fallback.ts` 시그니처
- 모듈 manifest `reads/writes` · 다른 트랙 컴포넌트
- <추가>

## 🛠 Tasks
1. <단계>
2. <단계> — 체크포인트: `npm run typecheck` 통과
3. <...>

## 🔒 Tech Constraints
- Next.js 16 (App Router · `params` async) — `node_modules/next/dist/docs/` 가이드 우선
- TypeScript strict · Zod 경계 검증
- 모든 AI 호출은 `invokeAi` 단일 진입점 (eslint 가 우회 차단)

## ✔️ Definition of Done
- [ ] <Mission 과 1:1 매핑된 측정 가능 항목>
- [ ] `npm run typecheck` · `lint` · `check:manifest` 통과
- [ ] Scope 위반 없음 (`git diff --name-only`)

## 📤 Return Format
```
## ✅ 한 일
## ❌ 못한 일 / 보류
## 🤔 결정한 것 (ADR 후보)
## 🔬 검증 (명령 + 결과)
## ⚠️ 위험 신호 / 다음 진입점
```

## 🚫 Do NOT
- 스코프 밖 파일 수정 · 변경 금지 항목 터치
- 추측으로 진행 (의문 = STOP)
- 검증 없이 완료 선언

## 💡 Hints & Edge Cases
<이전 브리프 교훈 · 특수 데이터 상태 · 복사할 소스 라인>

## 🏁 Final Note
<부수 발견은 보고만(스코프 크리프 금지) · 다음 후보 브리프>
