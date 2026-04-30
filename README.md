# UD-Ops Workspace

> 언더독스 교육 사업 제안 자동화 — **Express Track (메인) + Deep Track (보조)** 두 트랙.
> RFP 한 부 → 30~45분 → "당선 가능한 기획 1차본 (7 섹션 초안)" 까지.

🚀 **프로덕션**: https://ud-planner.vercel.app

📦 **인수인계**: [HANDOVER.md](HANDOVER.md) (다음 개발자가 받아 곧바로 운영·고도화 가능)

---

## ⚡ 5분 빠른 시작 (로컬 개발)

```bash
# 1. 의존성
npm install

# 2. .env 채우기
cp .env.example .env
# DATABASE_URL · GEMINI_API_KEY · AUTH_SECRET 등 입력

# 3. DB 기동 + 마이그레이션
docker compose up -d postgres
npx prisma migrate deploy

# 4. 시드 (4종)
npm run db:seed
npm run db:seed:channel-presets
npm run db:seed:program-profiles
npm run db:seed:content-assets

# 5. dev 서버 (predev: print-worktree + check:manifest 자동)
npm run dev
```

→ http://localhost:3000 접속.

---

## 🗂 핵심 문서 (읽는 순서)

| 문서 | 역할 | 언제 |
|---|---|---|
| **[HANDOVER.md](HANDOVER.md)** ⭐⭐⭐ | 인수인계서 — 시스템 정체성·데이터 모델·user flow·API·점검 결과 | **새 개발자 첫 진입** |
| **[PRD-v7.0.md](PRD-v7.0.md)** | 단일 진실 원본 (v7.1 운영 마일스톤) | 결정 근거 찾을 때 |
| **[docs/architecture/user-flow.md](docs/architecture/user-flow.md)** ⭐ | User flow ASCII 다이어그램 | 흐름 이해할 때 |
| **[STATE.md](STATE.md)** | 현재 진행 한 눈에 | 매 세션 시작 |
| **[ROADMAP.md](ROADMAP.md)** | Phase A~J 체크리스트 | 다음 작업 결정 |
| **[CLAUDE.md](CLAUDE.md)** | 개발 규칙·디자인 시스템 | AI 협업 시 |
| **[LESSONS.md](LESSONS.md)** | 시행착오 케이스 | 이상한 일 발생 시 먼저 |
| **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** | Vercel 배포 가이드 | 배포할 때 |

상세: [docs/architecture/](docs/architecture/) (12 문서) · [docs/decisions/](docs/decisions/) (12 ADR) · [docs/journey/](docs/journey/) (시행착오 일지)

---

## 🏗 시스템 정체성

**RFP → 30~45분 → 당선 가능한 1차본** — 단 하나의 북극성.

```
신규 PM → /projects/new (RFP 우선) → Express 단일 화면
            ↓ 챗봇 + 12 슬롯 + 점진 미리보기 + 자동 저장
            ↓ 4 액션 (1차본 승인 / 정밀 기획 / 검수 / 엑셀)
            ↓
     1차본 완성 (7 섹션) → Deep Track (정밀화) 또는 발주처 제출
```

자세히는 [docs/architecture/user-flow.md](docs/architecture/user-flow.md).

---

## 🛠 Tech 스택

| 영역 | 선택 |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript strict |
| DB | Prisma 7 + PostgreSQL (PrismaPg adapter) — 44 models |
| Auth | NextAuth v5 (JWT) |
| AI | **Gemini 3.1 Pro Preview** (Primary) + **Claude Sonnet 4.6** (Fallback) — `invokeAi()` 단일 진입점 |
| UI | shadcn/ui + base-ui + Tailwind v4 + lucide-react + sonner |
| Excel | exceljs ^4.4.0 |
| 호스팅 | Vercel (Hobby, `regions: ["icn1"]`, `maxDuration: 60`) + Neon PostgreSQL (`ap-southeast-1`) |
| Font / Color | Nanum Gothic / Action Orange `#F05519` |

---

## 📊 진행 상태 (2026-04-29 최종)

| Phase | 이름 | 상태 |
|---|---|---|
| A~D | 골격·Step 1·흐름·Gate 3 | ✅ |
| E | ProgramProfile · 차별화 리서치 | ✅ |
| F | Impact Value Chain | ✅ |
| G | Asset Registry v1 | ✅ |
| H | Content Hub v2 (DB + UI) | ✅ |
| **L** ⭐ | **Express Mode** (메인 트랙) | ✅ L0~L6 |
| I | 안정화 · 배포 · 모니터링 | ✅ I2/I3/I4/I5 (I1 사용자 검증) |
| J | 엑셀 출력 | ✅ PoC + J2 발주처 템플릿 (J3 시트 #16 후속) |

= **모든 코드 트랙 마무리**. 잔여는 사용자 검증·보안 rotate.

---

## 📦 모듈 4 계층 (ADR-002)

- **core** (6) — `rfp-planning` · `curriculum-design` · `coach-matching` · `budget-sroi` · `impact-chain` · `proposal-generation`
- **support** (3) — `pm-guide` · `gate3-validation` · `predicted-score`
- **asset** (1) — `asset-registry`

`src/modules/_registry.ts` 가 10 manifest 통합. 빌드·시작 시 `npm run check:manifest` 자동 실행 (errors 0 보장).

---

## 🔧 주요 명령

```bash
npm run dev                       # dev 서버 (predev 훅: 워크트리 검증 + manifest)
npm run typecheck                 # TypeScript 0 errors
npm run lint                      # ESLint (warnings 348 정상, errors 0 필수)
npm run build                     # prisma generate + next build (로컬)
npm run check:manifest            # Module Manifest 무결성

# DB
npx prisma studio                 # GUI
npx prisma migrate deploy         # 마이그 적용 (idempotent)
npm run db:seed                   # 기본 시드
npm run db:seed:channel-presets   # Channel Preset
npm run db:seed:program-profiles  # ProgramProfile 10 케이스
npm run db:seed:content-assets    # ContentAsset 20건

# 프로덕션 배포
git push origin master            # → Vercel 자동 redeploy (build:prod)
```

---

## 📍 시스템 진입점 (코드)

| 작업 | 위치 |
|---|---|
| Express 챗봇 | `src/components/express/ExpressShell.tsx` + `src/lib/express/` |
| Deep Track 6 step | `src/app/(dashboard)/projects/[id]/step-*.tsx` |
| Asset 매칭 | `src/lib/asset-registry.ts` `matchAssetsToRfp()` |
| AI 호출 | `src/lib/ai-fallback.ts` `invokeAi()` (단일 진입점) |
| 검수 에이전트 | `src/lib/express/inspector.ts` `inspectDraft()` |
| 인터뷰 → 자산 추출 | `src/lib/interview-extractor/extract.ts` |
| 엑셀 출력 | `src/lib/excel-export/render.ts` (5 시트 PoC) + `render-budget-template.ts` (발주처) |

---

## 🛡 인수인계 / 보안

- **인수인계 첫 시작**: [HANDOVER.md §14 체크리스트](HANDOVER.md#14-인수인계-체크리스트)
- **🔴 즉시 rotate 필요**: ANTHROPIC_API_KEY · Neon DB password (작업 중 채팅에 노출됨)
- **다음 개발 권장**: Vercel Pro 업그레이드 (60s → 300s, AI timeout 빈번 시) · Phase J3 (시트 #16) · E2E 자동 테스트

---

## 🌳 워크트리 정책

```
C:\Users\USER\projects\ud-ops-workspace   ← ⭐ 유일한 master 경로
└─ scripts/print-worktree.cjs              ← npm run dev 시 자동 검증
```

`predev` 훅이 매번 경로·브랜치 검증. 워크트리 안에서 `npm run dev` 띄우면 경고.

---

## 🤝 라이선스 / 저작권

(미정 — 사용자 결정)

**작성**: 2026-04-29 v2 (인수인계 단계 반영)
