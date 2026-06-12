# Brief UI-1 — 앱 UI를 공식 디자인 킷 260529 토큰·톤앤매너로 마이그레이션

> **이 브리프는 자급자족입니다.** 서브 에이전트는 본 파일 + `../../CLAUDE.md`
> + `../../AGENTS.md` + `../../docs/glossary.md` 외에 메인 세션 컨텍스트 없이도
> 작업 가능해야 합니다. 막히면 추측하지 말고 STOP 후 메인에 보고하세요.

| 메타 | 값 |
|------|----|
| ID | `UI-1-design-kit-app-migration` |
| Owner | 메인 세션이 채움 |
| 작성일 | 2026-06-12 |
| 상태 | 🟡 **in-progress** — 2026-06-12 사용자 "전부다 가이드 기반으로 바꿔줘" 승인으로 착수. Open Decisions 3건 확정됨 (아래) |
| 의존 브리프 | 없음 (단 Open Decisions 사용자 확정 선행) |
| 우선순위 | P2 |
| 예상 시간 | 1.5~2.5일 (Wave 분할 권장) |
| 격리 | worktree 권장 (전역 스타일 변경 — 시각 회귀 큼) |
| 관련 ADR | 없음 — 완료 시 디자인 토큰 동결 ADR 후보 보고 |

---

## 🎯 Mission
UD-Ops 웹앱(`src/`)의 디자인 토큰·폰트·코너·컬러를 공식 디자인 킷 260529(`docs/design-kit/`) 기준으로 정렬하고, 주요 화면(사이드바·대시보드·Express·Deep 스텝)이 새 톤앤매너로 렌더되는 것을 스크린샷으로 검증한다.

## 📋 Context
2026-06-12 사용자가 새로 정리한 공식 디자인 킷(레포 복사본 `docs/design-kit/`, 레퍼런스 구현 `docs/design-kit/index.html`)을 전달. 스킬(`.claude/skills/ud-design-system/SKILL.md` v2)은 이미 새 킷 기준으로 갱신됨. 그러나 앱 코드는 구 시스템(Nanum Gothic · rounded-md `--radius: 0.5rem` · 시안 #06A9D0 · 오렌지 그라데이션 스케일) 그대로다. 이 간극을 일괄 해소하지 않으면 화면마다 신구 디자인이 섞이는 최악의 상태가 된다 (스킬 §8 전환기 규칙이 임시 방어 중).

## ✅ Prerequisites (STOP 조건)
- [x] 사용자 착수 승인 — 2026-06-12 "전부다 가이드 기반으로 바꿔줘"
- [x] **Open Decisions 3건 확정** (아래)
- [ ] `docs/design-kit/` 존재 — 검증: `ls docs/design-kit/index.html docs/design-kit/fonts`
- [ ] dev 서버 기동 가능 — 검증: `npm run dev` 후 첫 줄 📁 경로가 master 디렉토리

### ✅ Open Decisions — 확정 (2026-06-12, 가이드 전면 적용 방향)
1. **radius 전면 0** — 킷 기본(`* { border-radius: 0 !important }` 정신)대로 `--radius: 0` 일괄. shadcn 다이얼로그·인풋·배지 포함 전 요소.
2. **lucide-react 존치** — 킷 §6 라인 SVG 아이콘 문법(stroke 계열)과 동일 계열이므로 유지. 신규 추가 아이콘도 lucide 안에서. 주요 화면에서 시각 위화감 발견 시 보고만.
3. **본문 폰트 NanumHuman 교체** — `docs/design-kit/fonts/*.woff2` 를 `public/fonts/` 로 복사 + next/font/local 로드. 영문/숫자 강조 표면(큰 지표·kicker)은 Poppins.

## 📖 Read These Files First
1. `../../CLAUDE.md` · `../../AGENTS.md` · `../../docs/glossary.md` (기본)
2. `../../.claude/skills/ud-design-system/SKILL.md` — v2 토큰·문법 전체 (이 브리프의 스펙)
3. `../../docs/design-kit/index.html` — 레퍼런스 구현 (토큰 블록 + 패턴: tint 박스 2px gap · 다크 앵커 · overview-cell · phase-detail)
4. `../../src/app/globals.css` — 현행 토큰 (OKLCH primary · --radius · sidebar)
5. `../../src/components/ui/` — shadcn 인벤토리
6. `../../src/lib/ud-brand.ts` — 브랜드 상수

## 🎯 Scope
### CAN touch (이 파일들만)
- `src/app/globals.css` (토큰·폰트·radius)
- `src/app/layout.tsx` (폰트 로드)
- `public/fonts/**` (woff2 추가)
- `tailwind.config.*` (시맨틱 컬러 매핑)
- `src/components/**/*.tsx` · `src/app/**/*.tsx` — **className·스타일 변경만** (로직·상태·핸들러 변경 금지)
- `.claude/skills/ud-design-system/SKILL.md` §8 전환기 조항 제거 (완료 시)
### MUST NOT touch (절대)
- `prisma/schema.prisma` · `src/lib/ai-fallback.ts` · `src/lib/express/schema.ts`
- 모듈 manifest `reads/writes` · API 라우트 · 비즈니스 로직 일체
- `docs/design-kit/**` (킷 원본 — 읽기 전용)

## 🛠 Tasks
1. **Wave 1 — 토큰 기반**: globals.css 에 킷 토큰(브랜드 3색 + accent/dark/neutral 베리에이션 + 시맨틱) 도입, 기존 OKLCH primary 와 정합 확인. 폐기 컬러(시안 · 구 그라데이션) 참조 전수 검색(`#06A9D0`, `#F48053`, `#F9BBA3`, `#FBD4C5`, `#FF8204`) 후 치환. — 체크포인트: `npm run typecheck` + 전 화면 빌드
2. **Wave 2 — 폰트·radius**: Open Decision 1·3 결정대로 적용. radius 변경 시 shadcn 변수(`--radius`)로 일괄.
3. **Wave 3 — 패턴 정렬**: 사이드바(`--ink` 다크 앵커 유지) · 지표 카드(틴트 박스 2px gap 문법) · `border-brand-left`/`progress-brand` 유틸리티를 킷 문법으로 재정의.
4. **Wave 4 — 검증**: 주요 5화면(대시보드 · 프로젝트 목록 · Express · Deep Step 1 · admin/content-hub) preview 스크린샷 전후 비교 + 다크 사이드바 대비(접근성) 확인.
5. 상태 배지 컬러(스킬 §7)는 **유지** — 의미 컬러는 킷 스코프 밖.

## 🔒 Tech Constraints
- Next.js 16 (App Router) — `node_modules/next/dist/docs/` 가이드 우선 (next/font 로컬 로드 방식 확인)
- TypeScript strict · 스타일 변경이 로직 diff 를 만들면 안 됨
- Tailwind 임의값(`[...]`) 남발 금지 — 토큰을 config 로 승격

## ✔️ Definition of Done
- [ ] 폐기 컬러 hex 가 `src/` 에서 0건 (`grep -r "#06A9D0\|#F48053\|#F9BBA3\|#FBD4C5\|#FF8204" src/`)
- [ ] globals.css 가 킷 시맨틱 토큰 정의 + 주석으로 킷 출처 명시
- [ ] 주요 5화면 스크린샷 전후 비교 첨부 (preview 도구)
- [ ] `npm run typecheck` · `lint` · `check:manifest` 통과
- [ ] Scope 위반 없음 (`git diff --name-only`)

## 📤 Return Format
```
## ✅ 한 일
## ❌ 못한 일 / 보류
## 🤔 결정한 것 (ADR 후보 — 디자인 토큰 동결 포함)
## 🔬 검증 (명령 + 결과 + 스크린샷 경로)
## ⚠️ 위험 신호 / 다음 진입점
```

## 🚫 Do NOT
- Open Decisions 를 추측으로 결정 (의문 = STOP)
- 로직·핸들러·데이터 흐름 변경 (className 외 diff 최소)
- 한 화면만 부분 적용해 신구 혼합 상태로 종료

## 💡 Hints & Edge Cases
- 킷 토큰 블록은 `docs/design-kit/index.html` 10~77행 — 그대로 복사가 정답 (재타이핑 금지).
- 인터랙티브 완화 조항(스킬 §6): transition·절제된 shadow·라인 아이콘은 앱에서 허용 — 문서형 금지 룰을 앱에 과적용하지 말 것.
- 사이드바는 이미 `#373938` — 킷 `--ink` 와 동일값이라 큰 변경 없음. 사이드바 내 액센트 사용처만 점검.
- Express 화면은 사용자 체류 시간이 가장 긴 화면 — Wave 4 검증 1순위.

## 🏁 Final Note
부수 발견(접근성 위반·하드코딩 브랜드 숫자)은 보고만 — 스코프 크리프 금지. 완료 시 후속 후보: 디자인 토큰 동결 ADR + CLAUDE.md 디자인 섹션 현행화(DOCS-* 브리프).
