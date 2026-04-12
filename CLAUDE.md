@AGENTS.md

# UD-Ops Workspace — 개발 규칙

## 프로젝트 개요
언더독스 교육 기획 자동화 웹앱. RFP 분석 → 임팩트 설계 → 커리큘럼 → 코치 배정 → 예산 → 제안서의 6단계 파이프라인.
- **Tech**: Next.js 16 (App Router) + TypeScript + Prisma 7 + PostgreSQL + Claude API
- **DB**: 35개 모델, `prisma/schema.prisma` 참조
- **AI**: Anthropic Claude + Google Gemini (fallback)

## 아키텍처 (꼭 읽어야 할 파일)
- `prisma/schema.prisma` — 전체 데이터 모델
- `src/lib/claude.ts` — AI 호출 함수 (safeParseJson 포함)
- `src/lib/planning-agent/` — Planning Agent 코어 (7개 모듈)
- `src/app/(dashboard)/projects/[id]/` — 6단계 파이프라인 UI
- `PRD-v5.0.md` — 전체 요구사항 (78KB)
- `PLANNING_AGENT_ROADMAP.md` — Planning Agent 6-Phase 로드맵

## 디자인 시스템
- **폰트**: Nanum Gothic (나눔고딕) — `font-sans` / `--font-sans` 변수
- **메인 컬러**: Action Orange `#FF8204` — `bg-primary` / `text-primary` / `--ud-orange`
- **블랙**: `#000000`, 화이트: `#FFFFFF`
- **서브 컬러**: `#FFA40D`(orange-light), `#373938`(dark/sidebar), `#D8D4D7`(gray), `#06A9D0`(cyan)
- **컬러 비율**: Action Orange는 전체 UI의 10~15% 이하 (CTA, 강조, 아이콘 등)
- **비주얼 패턴**: Spread/Scale, Repetition/Alignment, Expansion/Progress
  - 반복 정렬: `border-brand-left` 유틸리티 클래스 사용
  - 진행 상태: `progress-brand` 그라데이션 클래스
- **반경**: `--radius: 0.5rem` (rounded-md 기본)
- **사이드바**: 다크 `#373938` 배경 (`bg-sidebar`)
- **UI 라이브러리**: shadcn/ui (src/components/ui/)
- **아이콘**: lucide-react
- **토스트**: sonner (`toast.success()`, `toast.error()`)

## 설계 철학 (PRD v4.0)
1. **Impact-First**: 임팩트 목표 → 역추적 → 커리큘럼 → 코치 → 예산 순서
2. **Action Week 강제**: 이론 3회 연속 시 경고, Action Week 삽입 제안
3. **시트는 부산물**: 기획 품질 > 시트 채우기
4. AI가 정보 부족 시 → 자동 생성 대신 질문으로 보완

## Claude API
- 모델: `claude-sonnet-4-6` (`CLAUDE_MODEL` 상수)
- JSON 파싱: 항상 `safeParseJson()` 헬퍼 사용 (src/lib/claude.ts)
- `max_tokens`: RFP 파싱 4096 / Logic Model 4096 / 커리큘럼 4096

## 인증
- NextAuth v5 (JWT 전략) — `src/lib/auth.ts`
- Google OAuth + 개발 모드 Credentials
- 미들웨어: `src/middleware.ts` (로그인 페이지 제외 전체 보호)
- 역할: PM, DIRECTOR, CM, FM, COACH, ADMIN

## 병렬 작업 규칙
- 기능 개발은 `feat/<task-id>` 브랜치에서 진행
- master 직접 커밋은 인프라/설정 변경만 허용
- 태스크 스펙은 `.claude/tasks/` 디렉토리에 저장됨
- 스펙 파일을 읽고 지시대로 수행 → 완료 시 커밋
- 다른 step의 컴포넌트는 건드리지 않기 (충돌 방지)

## 커밋 컨벤션
- `feat(scope): 설명` / `fix(scope): 설명`
- scope: step-rfp, step-impact, step-curriculum, step-coaches, step-budget, step-proposal, planning-agent, auth, coaches, modules 등
- 한글 커밋 메시지 OK
