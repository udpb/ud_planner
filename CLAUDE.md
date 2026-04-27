@AGENTS.md

# UD-Ops Workspace — 개발 규칙

## 프로젝트 개요
언더독스 교육 기획 자동화 웹앱. AI 공동기획자 기반 6단계 파이프라인:
**RFP + 기획방향 → 커리큘럼 → 코치 → 예산 설계 → 임팩트 + SROI → 제안서**
(※ 2026-04-15 Step 순서 재설계. 2026-04-23 Impact Value Chain 5단계 프레임 채택 — ADR-008. Step 4·5 재구성: SROI Forecast 가 Step 5 로 이동하여 ⑤ Outcome 수렴점이 됨)
- **Tech**: Next.js 16 (App Router) + TypeScript + Prisma 7 + PostgreSQL + Claude API
- **DB**: 35개 모델, `prisma/schema.prisma` 참조
- **AI**: Anthropic Claude + Google Gemini (fallback)

## 최신 설계 소스 (Single Source of Truth)
- **[ROADMAP.md](ROADMAP.md)** — 파이프라인 재설계 6-Phase 체크리스트 (A~F)
- **[REDESIGN.md](REDESIGN.md)** — 상세 설계 v2 (PipelineContext / PM 가이드 / 예상 점수)
- **[docs/architecture/](docs/architecture/)** — 아키텍처 5문서
  - [modules.md](docs/architecture/modules.md) — 모듈 4계층 + Manifest 패턴
  - [data-contract.md](docs/architecture/data-contract.md) — PipelineContext 슬라이스 계약
  - [ingestion.md](docs/architecture/ingestion.md) — 자료 업로드 → 자산 자동 고도화
  - [quality-gates.md](docs/architecture/quality-gates.md) — 4계층 품질 검증 체계
  - [value-chain.md](docs/architecture/value-chain.md) ⭐ — Impact Value Chain 5단계 + SROI 수렴점 (ADR-008)
  - [asset-registry.md](docs/architecture/asset-registry.md) ⭐ — UD Asset Registry v1 + RFP 자동 매핑 (ADR-009)
  - [content-hub.md](docs/architecture/content-hub.md) ⭐ — Content Hub v2 (DB + 계층 + 담당자 UI, ADR-010)
  - [program-profile.md](docs/architecture/program-profile.md) — ProgramProfile v1.1 11축 (ADR-006)
  - [current-state-audit.md](docs/architecture/current-state-audit.md) — 기존 파일 유지/고도화/재작업/제거 판정
- **[docs/decisions/](docs/decisions/)** — ADR. 중요 결정 전후 필수 참조
- **[docs/journey/](docs/journey/)** — 시행착오 일지. 세션 끝에 기록
- **[PLANNING_AGENT_ROADMAP.md](PLANNING_AGENT_ROADMAP.md)** — Planning Agent 별도 트랙
- `PRD-v5.0.md` — ⚠️ 아카이브. 비즈니스 룰·IMPACT·SROI만 참고

## 아키텍처 (꼭 읽어야 할 파일)
- `prisma/schema.prisma` — 전체 데이터 모델
- `src/lib/claude.ts` — AI 호출 함수 (safeParseJson 포함)
- `src/lib/planning-agent/` — Planning Agent 코어 (7개 모듈)
- `src/app/(dashboard)/projects/[id]/` — 6단계 파이프라인 UI

## 디자인 시스템
- **폰트**: Nanum Gothic (나눔고딕) — `font-sans` / `--font-sans` 변수
- **메인 컬러**: Action Orange `#F05519` (underdogs.global 공식 기준, 2026-04-15 마이그레이션 완료) — `bg-primary` / `text-primary` / `--ud-orange`
- **블랙**: `#000000`, 화이트: `#FFFFFF`
- **오렌지 그라데이션**: `#F05519` (100) → `#F48053` (80) → `#F9BBA3` (40) → `#FBD4C5` (20)
- **서브 컬러**: `#373938`(dark/sidebar), `#D8D4D7`(gray), `#06A9D0`(cyan)
- **컬러 비율**: Action Orange는 전체 UI의 10~15% 이하 (CTA, 강조, 아이콘 등)
- **비주얼 패턴**: Spread/Scale, Repetition/Alignment, Expansion/Progress
  - 반복 정렬: `border-brand-left` 유틸리티 클래스 사용
  - 진행 상태: `progress-brand` 그라데이션 클래스
- **반경**: `--radius: 0.5rem` (rounded-md 기본)
- **사이드바**: 다크 `#373938` 배경 (`bg-sidebar`)
- **UI 라이브러리**: shadcn/ui (src/components/ui/)
- **아이콘**: lucide-react
- **토스트**: sonner (`toast.success()`, `toast.error()`)

## 설계 철학 (재설계 v2, 2026-04-15 · Value Chain 확장 2026-04-23)
1. **데이터는 위에서 아래로 흐른다** — 각 스텝은 이전 스텝 산출물을 `PipelineContext`로 받는다
2. **내부 자산은 자동으로 올라온다** — IMPACT 모듈·코치·SROI 프록시 등 PM이 찾아가지 않음
3. **AI는 맥락 안에서 호출된다** — 매번 처음부터가 아니라 축적된 컨텍스트 위에서
4. **신입 PM도 왜 이렇게 써야 하는지 안다** — 각 스텝에 가이드·레퍼런스·경고 내장
5. **Impact-First는 커리큘럼 위에서 재구성된다** — Activity를 커리큘럼에서 자동 추출해 Outcome/Impact만 AI 생성
6. **Action Week 강제**: 이론 3회 연속 시 경고, Action Week 삽입 제안
7. AI가 정보 부족 시 → 자동 생성 대신 질문으로 보완
8. ⭐ **Impact Value Chain 5단계 (ADR-008, 2026-04-23)** — 파이프라인에는 UI 6 스텝과는 독립된 의미 레이어가 있다:
   `① Impact(의도·Before/After) → ② Input(자원) → ③ Output(RFP/산출물) → ④ Activity(커리큘럼·코칭) → ⑤ Outcome(SROI)`
   **⑤ Outcome = SROI Forecast** 가 루프의 수렴점. SROI 숫자 축 3방향 얼라인 체크(⑤→①·②·④)로 품질 검증.
   각 UI 스텝은 자신이 건드리는 단계를 `valueChainStage` 로 태그 ([value-chain.md](docs/architecture/value-chain.md)).
9. ⭐ **UD Asset Registry v1 → Content Hub v2 (ADR-009 → ADR-010, 2026-04-24)** — 2번 원칙의 물리적 구현.
   - v1: 자산을 3중 태그(카테고리·RFP 섹션·Value Chain 단계·증거 유형)로 등록 · RFP 파싱 직후 자동 매핑 · Step 1 패널 제안 · Step 6 `narrativeSnippet` 주입.
   - v2: DB(`ContentAsset`) 기반 + 1단 계층(상품 → 세션/주차/챕터) + `/admin/content-hub` 담당자 UI + 단순 version 관리 + 원본 파일은 외부 (sourceReferences URL 만).
   - 스키마: [asset-registry.md](docs/architecture/asset-registry.md) (v1) · [content-hub.md](docs/architecture/content-hub.md) (v2).

## Claude API
- 모델: `claude-sonnet-4-6` (`CLAUDE_MODEL` 상수)
- JSON 파싱: 항상 `safeParseJson()` 헬퍼 사용 (src/lib/claude.ts)
- `max_tokens`: RFP 파싱 4096 / Logic Model 4096 / 커리큘럼 4096

## 인증
- NextAuth v5 (JWT 전략) — `src/lib/auth.ts`
- Google OAuth + 개발 모드 Credentials
- 미들웨어: `src/middleware.ts` (로그인 페이지 제외 전체 보호)
- 역할: PM, DIRECTOR, CM, FM, COACH, ADMIN

## 워크트리 정책 (2026-04-27 통합)
- ⭐ **유일한 작업 경로**: `C:\Users\USER\projects\ud-ops-workspace` (master 디렉토리)
- 과거 `.claude/worktrees/{amazing-khorana,blissful-goodall}-*` 두 워크트리는 **삭제됨**. 이 경로들이 다시 등장하면 잘못된 셸·메모.
- 새 작업도 master 에 직접. Claude Code 의 자동 worktree 생성 기능을 쓸 때만 임시로 워크트리 사용 → 완료 즉시 머지·삭제.
- `npm run dev` 실행 시 `predev` 훅(`scripts/print-worktree.cjs`)이 현재 경로·브랜치를 출력하고, 워크트리 안에서 띄우면 경고.
- Phase 진행 중 dev 가 멈춘 듯하면 가장 먼저 출력 첫 줄(📁 경로) 부터 확인.

## 병렬 작업 규칙
- 기능 개발은 `feat/<task-id>` 브랜치에서 진행
- master 직접 커밋은 인프라/설정 변경만 허용
- 태스크 스펙은 `.claude/tasks/` 디렉토리에 저장됨
- 스펙 파일을 읽고 지시대로 수행 → 완료 시 커밋
- 다른 step의 컴포넌트는 건드리지 않기 (충돌 방지)

## 커밋 컨벤션
- `feat(scope): 설명` / `fix(scope): 설명`
- scope: step-rfp, step-curriculum, step-coaches, step-budget, step-impact, step-proposal, pipeline-context, planning-agent, pm-guide, winning-pattern, channel-preset, auth, coaches, modules, value-chain, loop-gate, asset-registry 등
- Phase 작업은 `feat(phase-h): ...` (현재 Phase H Content Hub Wave 진행 중)
- 한글 커밋 메시지 OK
