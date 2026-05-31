# Brief FIX-1 — 확정 죽은 코드 제거 (검증된 범위만)

> **자급자족.** 본 파일 + `../../CLAUDE.md` + `../../AGENTS.md` + `../../docs/glossary.md` 로 작업.
> 막히면 추측 금지 → STOP 후 메인 보고.

| 메타 | 값 |
|------|----|
| ID | `FIX-1-dead-code-removal` |
| 작성일 | 2026-06-01 |
| 상태 | ✅ 완료 (2026-06-01, 메인 검증 통과: typecheck 0·manifest 0·build OK·scope clean) |
| 우선순위 | P1 |
| 격리 | 일반 (메인은 docs 만 동시 수정 — 코드 충돌 없음) |
| 관련 | ADR-020 (정리), 종합 점검 2026-06-01 |

## 🎯 Mission
메인이 도달성 검증을 끝낸 **확정 죽은 코드 4건만** 제거하고, 전체 빌드 게이트를 통과시킨다.

## 📋 Context
2026-06-01 종합 점검 + 교차검증에서 확정된 죽은 코드. 다른 항목(planning-agent·agent-test·회귀 스크립트·3 생성엔진)은 **숨은 의존성 또는 설계 결정**이라 본 브리프 범위 아님 — 절대 건드리지 말 것.

## ✅ Prerequisites (STOP 조건)
- [ ] 메인이 이미 확인: 아래 4건 외 다른 삭제 금지 — 확인: 본 Scope 만 수정
- [ ] `git status` 깨끗하지 않아도 OK (메인이 docs 동시 작업 중 — `src/`·`prisma/` 만 본인 변경으로)

## 📖 Read These Files First
1. `../../AGENTS.md` (변경 금지 항목)
2. `src/proxy.ts` · `src/app/admin/brain/page.tsx`

## 🎯 Scope
### CAN touch (이 파일들만)
- 삭제: `src/lib/express/infer-program-profile.ts`
- 삭제: `src/lib/express/extract-quote.ts`
- 삭제: `src/app/(dashboard)/slide-preview-test/page.tsx`
- 삭제: `src/app/(dashboard)/slide-preview-test/diagrams/page.tsx`
- 삭제: `src/app/(dashboard)/slide-preview-test/real/page.tsx`
- 수정: `src/proxy.ts` (publicPaths 에서 `/slide-preview-test` 2개 항목 제거)
- 수정: `src/app/admin/brain/page.tsx` (죽은 for-loop 제거)
### MUST NOT touch (절대)
- `src/app/(lab)/agent-test/**` · `src/lib/planning-agent/**` · `src/app/api/agent/**` (planning-agent 트랙 — 라이브 import)
- `src/lib/express/produce-ultimate-draft.ts` (ADR-021 설계 영역)
- `prisma/**` · `scripts/**` · `src/lib/ai-fallback.ts` · 다른 모든 파일

## 🛠 Tasks
1. `infer-program-profile.ts`·`extract-quote.ts` 삭제 (0 refs 확인됨).
2. slide-preview-test 페이지 3개 삭제 + 빈 디렉토리 정리.
3. `src/proxy.ts`의 `publicPaths` 배열에서 `'/slide-preview-test'`, `'/slide-preview-test/diagrams'` 두 항목 제거 (다른 항목 `/login`·`/api/auth`·`/api/dev` 는 유지).
4. `src/app/admin/brain/page.tsx`: `for (const pc of patternConcepts) { // ... }` **빈 루프 제거**. 그 위의 `const patternConcepts = await prisma.patternConcept.findMany(...)` 첫 쿼리가 이 루프 외에 **사용되지 않으면** 그 쿼리도 제거 (바로 아래 `pcWithPatternId` 가 실사용). 단, 파일 다른 곳에서 `patternConcepts` 를 쓰면 남길 것 — 반드시 grep 확인 후 결정.
5. 각 단계 후 `npm run typecheck` 통과 확인.

## 🔒 Tech Constraints
- Next.js 16 App Router. 페이지 삭제는 라우트 제거일 뿐 — import 영향 없음(grep 으로 재확인).
- TypeScript strict.

## ✔️ Definition of Done
- [ ] 위 4건 처리 완료
- [ ] `npm run typecheck` 통과
- [ ] `npm run lint` 통과
- [ ] `npm run check:manifest` 통과 (Errors 0)
- [ ] `npm run build` 통과 (선택 — 시간 길면 typecheck 로 갈음하고 보고에 명시)
- [ ] `git diff --name-only` 가 Scope CAN-touch 의 부분집합

## 📤 Return Format
```
## ✅ 한 일 (파일별 삭제/수정 라인)
## ❌ 못한 일 / 보류
## 🤔 결정한 것 (예: admin/brain 첫 쿼리 제거 여부 + 근거)
## 🔬 검증 (typecheck/lint/manifest/build 결과 그대로)
## ⚠️ 위험 신호 / 다음 진입점
```

## 🚫 Do NOT
- Scope 밖 파일 수정 · planning-agent/agent-test 터치 · git commit/push
- 추측으로 admin/brain 첫 쿼리 제거 (grep 확인 필수)

## 💡 Hints
- `infer-program-profile`·`extract-quote` 는 메인이 grep 으로 0 refs 확인 완료.
- agent-test 페이지는 `planning-agent/manifest.ts:19` 의 `ui` 필드가 가리킴 → 삭제 시 manifest 깨짐. **그래서 제외.**
- slide-preview-test 는 `proxy.ts` 만 참조 → 페이지+proxy 동시 처리하면 안전.

## 🏁 Final Note
부수 발견(다른 죽은 코드 등)은 삭제하지 말고 "다음 진입점"에 보고만.
