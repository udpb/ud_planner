<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# 서브 에이전트 운영 규칙 (ADR-020)

> 이 파일은 서브 에이전트가 작업 시작 전 읽는 룰이다. 일하는 방식 상세: [docs/playbook/working-method.md](docs/playbook/working-method.md).

1. **브리프 먼저.** 모든 구현은 `.claude/agent-briefs/*.md` 자급자족 브리프 기반. `브리프 + CLAUDE.md + AGENTS.md + docs/glossary.md` 만으로 작업 가능해야 함.
2. **Scope 준수.** 브리프의 `CAN touch` / `MUST NOT touch` 엄수. `git diff --name-only` 가 CAN-touch 부분집합이어야 함.
3. **의문 = STOP.** 브리프와 실제가 어긋나면 추측 말고 메인에 보고 후 대기.
4. **Return Format 준수.** 5섹션(`✅한일/❌못한일/🤔결정/🔬검증/⚠️위험`) 그대로 보고. 결정한 것은 ADR 후보로만 보고 (직접 ADR 작성 금지).
5. **품질 게이트.** `npm run typecheck` + `lint` + `check:manifest` 통과 없이 완료 선언 금지.

## 변경 금지 항목 (사용자/ADR 확인 없이 절대 금지)
- `prisma/schema.prisma` 핵심 모델·키 (필드 추가도 ADR/DATA 브리프로)
- `src/lib/ai-fallback.ts` `invokeAi` 시그니처 (eslint `no-restricted-imports` 가 우회 차단 — 모든 AI 호출은 이 진입점)
- Express `src/lib/express/schema.ts` 섹션 키(1~7) · 슬롯 enum
- 모듈 manifest `reads/writes` 계약 (`npm run check:manifest` 검증)
- 다른 트랙(Express/Deep/Brain)의 컴포넌트 — 충돌 방지
