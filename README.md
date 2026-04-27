# UD-Ops Workspace

> 언더독스 교육 사업 제안서 자동화 워크스페이스 — AI 공동기획자 기반 6단계 파이프라인.

---

## ⚡ 5분 빠른 시작 (로컬 개발)

### 전제

- Node.js 20 이상
- Docker Desktop (PostgreSQL 컨테이너 `ud_ops_db` 용)
- `.env` 파일 (Anthropic / Google OAuth 키 — 별도 안내)

### 명령

```powershell
# 1. 작업 경로 (유일하게 정상)
cd C:\Users\USER\projects\ud-ops-workspace

# 2. 의존성 설치
npm install

# 3. DB 기동 + 마이그레이션
docker compose up -d
npm run db:migrate

# 4. 시드 (3종 모두 적용)
npm run db:seed
npm run db:seed:program-profiles
npm run db:seed:content-assets

# 5. dev 서버 (predev 훅이 경로 자동 검증)
npm run dev
```

브라우저에서 `http://localhost:3000` 접속.

---

## 📍 어디서 작업하나

```
C:\Users\USER\projects\ud-ops-workspace   ← ⭐ 유일한 master 경로
└─ scripts/print-worktree.cjs              ← npm run dev 시 자동 검증
```

과거 `.claude/worktrees/{amazing-khorana,blissful-goodall}-*` 두 워크트리는 2026-04-27 통합·삭제됨. 다시 등장하면 잘못된 곳에서 띄운 것.

---

## 🗂 주요 문서

| 문서 | 역할 | 언제 보나 |
|---|---|---|
| **[PRD-v6.0.md](PRD-v6.0.md)** | 제품 전체 정의 (사용자·가치·파이프라인·자산) | 처음 진입할 때 |
| **[STATE.md](STATE.md)** | 현재 진행 한 눈에 (Phase·DB·다음 할 일) | 매 세션 시작 시 |
| **[PROCESS.md](PROCESS.md)** | 일하는 방식 (Wave·ADR·에이전트·게이트) | 새 작업자 합류 시 |
| **[LESSONS.md](LESSONS.md)** | 시행착오 정리 (반복 함정 케이스) | 이상한 일 생겼을 때 먼저 |
| **[CLAUDE.md](CLAUDE.md)** | 개발 규칙·디자인 시스템·설계 철학 | AI 협업 시 |
| **[ROADMAP.md](ROADMAP.md)** | Phase A~I 체크리스트 | 다음 작업 결정 시 |

보조 문서: [REDESIGN.md](REDESIGN.md) · [docs/architecture/](docs/architecture/) · [docs/decisions/](docs/decisions/) · [docs/journey/](docs/journey/)

---

## 🏗 아키텍처 한 장

```
파이프라인 6 UI 스텝 (공정 레이어)
  RFP → 커리큘럼 → 코치 → 예산 → 임팩트+SROI → 제안서

Impact Value Chain 5 단계 (의미 레이어, ADR-008)
  ① Impact → ② Input → ③ Output → ④ Activity → ⑤ Outcome (=SROI)
  └── 루프: SROI 축 3방향 얼라인 ──┘

자산 레이어 (Layer 1)
  ProgramProfile · IMPACT 18 · UCA 코치 풀 · SROI 프록시 · WinningPattern · Content Hub
```

---

## 🛠 Tech 스택

- **Framework**: Next.js 16 (App Router · Turbopack)
- **Language**: TypeScript strict
- **DB**: Prisma 7 + PostgreSQL (PrismaPg adapter)
- **Auth**: NextAuth v5 (JWT 전략)
- **UI**: shadcn/ui + base-ui + Tailwind v4
- **AI**: Anthropic Claude Sonnet 4.6 + Gemini fallback
- **Font / Color**: Nanum Gothic / Action Orange `#F05519`

---

## 📦 모듈 4 계층 (Module Manifest, ADR-002)

- **core** — 6 스텝 (`rfp` · `curriculum` · `coaches` · `budget` · `impact` · `proposal`)
- **support** — `pm-guide` · `gate3-validation` · `predicted-score`
- **asset** — `asset-registry` · `channel-presets` · `winning-patterns` · `sroi-proxies`
- **ingestion** — `proposal-ingest` · `curriculum-ingest` 등

각 모듈은 `manifest.ts` 에서 `reads` / `writes` / `owner` 를 명시. 자세한 규칙: [docs/architecture/modules.md](docs/architecture/modules.md).

---

## 🚦 진행 상태

| Phase | 이름 | 상태 |
|---|---|---|
| A~D | 골격 · Step 1 · 흐름 · Gate 3 | ✅ |
| E | ProgramProfile · 차별화 리서치 | ✅ |
| F | Impact Value Chain | ✅ |
| G | Asset Registry v1 | ✅ |
| H | Content Hub v2 (DB + 계층 + UI) | ✅ |
| I | 안정화 · 배포 | 🔲 |

상세는 [STATE.md](STATE.md) · 체크리스트는 [ROADMAP.md](ROADMAP.md).

---

## 🔧 주요 명령

```bash
npm run dev                       # dev 서버 (predev 훅 자동 검증)
npm run typecheck                 # TypeScript 0 에러 확인
npm run lint                      # ESLint
npm run build                     # prisma generate + next build
npm run db:migrate                # 마이그레이션
npm run db:studio                 # Prisma Studio
npm run db:seed                   # 기본 시드 (코치 · 모듈 · SROI 등)
npm run db:seed:program-profiles  # ProgramProfile 10 케이스
npm run db:seed:content-assets    # Content Hub 자산 + 계층 시드
```

---

## 📚 별도 산출물 (이 README 범위 밖)

다음은 시스템 본체와 분리된 결과물입니다 — 본 README 는 "Workspace 시스템" 정의에 집중합니다.

- **운영 가이드북** (한/영): [`docs/guidebook/`](docs/guidebook/) · [`docs/guidebook-en/`](docs/guidebook-en/)
- **가이드북 사이트** (Vercel 배포 대상): [`guidebook-site/`](guidebook-site/)
- **강의 자료** (PPT + 스크립트 + 과제): [`lecture-materials/`](lecture-materials/)

---

## 🆘 도움이 필요할 때

1. **[LESSONS.md](LESSONS.md)** — 반복 함정 케이스. 이상한 일 생기면 가장 먼저.
2. **[STATE.md](STATE.md)** — "알려진 이슈 · 기술 부채" 섹션.
3. **[docs/journey/](docs/journey/)** — 가장 최근 파일 = 마지막 세션 맥락.
4. **[docs/decisions/](docs/decisions/)** — ADR-001 ~ ADR-010 의사결정 기록.

---

## 📝 기여 약속

- 결정 · 과정은 기록 의무 (ADR + journey)
- Wave 단위 진행, 각 Wave 끝에 커밋
- 가이드북 · 강의 자료 변경은 별도 PR
- 자세한 규칙: [PROCESS.md](PROCESS.md)
