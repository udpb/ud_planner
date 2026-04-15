# UD-Ops Workspace

언더독스 교육 기획 자동화 웹앱 — AI 공동기획자가 RFP부터 제안서까지 6단계를 함께 설계합니다.

```
RFP + 기획방향 → 커리큘럼 → 코치 → 예산 + SROI → 임팩트 → 제안서
```

## 문서

신규 작업을 시작하기 전, 아래 순서로 읽으세요.

1. [CLAUDE.md](CLAUDE.md) — 개발 규칙 / 디자인 시스템 / 설계 철학
2. [ROADMAP.md](ROADMAP.md) — 파이프라인 재설계 6-Phase 체크리스트 (A~F)
3. [REDESIGN.md](REDESIGN.md) — 상세 설계 v2 (PipelineContext, PM 가이드, 예상 점수)
4. [PLANNING_AGENT_ROADMAP.md](PLANNING_AGENT_ROADMAP.md) — Planning Agent 별도 트랙
5. `PRD-v5.0.md` — ⚠️ 아카이브. 비즈니스 룰·IMPACT 18모듈·SROI·마스터 데이터만 참고

## 기술 스택

- **Framework**: Next.js 16 (App Router) + TypeScript
- **DB**: PostgreSQL + Prisma 7 (35개 모델)
- **AI**: Anthropic Claude (`claude-sonnet-4-6`) + Google Gemini (fallback)
- **Auth**: NextAuth v5 (JWT)
- **UI**: shadcn/ui + Tailwind + Nanum Gothic

## 개발

```bash
npm install
npx prisma migrate dev
npm run dev
```

`http://localhost:3000` 에서 확인.

## 배포

Vercel. `master` 푸시 시 자동 배포.
