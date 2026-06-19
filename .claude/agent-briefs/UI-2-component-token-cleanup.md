# Brief UI-2 — 앱 컴포넌트 디자인킷 토큰 정리 (기술부채, 시각 변화 0)

> **자급자족 브리프.** 서브는 본 파일 + `CLAUDE.md` + `AGENTS.md` + `docs/glossary.md` +
> `.claude/skills/ud-design-system/SKILL.md` 만으로 작업. 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `UI-2-component-token-cleanup` |
| Owner | 메인 세션 |
| 작성일 | 2026-06-16 |
| 상태 | 🔲 대기 |
| 의존 | UI-1(✅ globals.css 킷 토큰·radius 0 완료) |
| 우선순위 | P3 (낮음 — 순수 기술부채, 사용자 가시 변화 없음) |
| 격리 | 일반 (현재 브랜치 in-place) |

## 🎯 Mission
앱 컴포넌트의 **구버전 Tailwind 클래스를 킷 토큰으로 정리**한다. **시각적 변화는 0이어야 한다**
(검증의 핵심 = 렌더 결과 불변). 두 가지 기계적 치환:
1. **죽은 `rounded-*` 제거** — 전역 `border-radius: 0 !important`(globals.css)로 이미 무효화된 클래스. 제거해도 화면 안 바뀜.
2. **`bg-primary`/`text-primary`/`border-primary` 계열 → 킷 brand 유틸리티** — 현재 `--primary: var(--accent)` 별칭이라 색은 같음. 시맨틱 정리.

## 📋 Context (UI 감사 2026-06-16 실측)
- `bg-primary`/`text-primary` ≈ **225곳 / 54파일** · `rounded-*` ≈ **324곳 / 104파일** · `border-primary/*` ≈ 103곳.
- 폐기 hex(#06A9D0·#F48053 계열·#FF8204)는 src/ 에 이미 0건(UI-1 완료). 이번엔 **클래스 레벨 정리만**.
- 시각 버그가 아니라 유지보수성 — **그래서 P3**. 절대 시각·기능을 바꾸지 마라.

## ✅ Prerequisites
- [ ] `src/app/globals.css` 에 brand 유틸리티가 매핑돼 있는지 **먼저 확인** (`--color-brand`/`bg-brand`/`text-brand` 등). 없으면 STOP·보고(임의 도입 금지).
- [ ] `npm run build` 또는 dev 기동 가능

## 📖 Read First
1. `CLAUDE.md` · `AGENTS.md` · `.claude/skills/ud-design-system/SKILL.md` §7~§9 (앱 규칙·금지 목록)
2. `src/app/globals.css` — 킷 토큰·brand 유틸리티 매핑 확인 (치환 타깃의 정답)

## 🎯 Scope
### CAN touch
- `src/app/**/*.tsx` · `src/components/**/*.tsx` 의 className 문자열만 (위 2종 치환)
### MUST NOT touch
- `src/components/ui/**` (shadcn 원본 — 직접 수정 금지)
- `src/app/globals.css`·tailwind 설정 (토큰 레이어는 UI-1 동결 — 새 토큰·유틸 도입 금지)
- 로직·JSX 구조·props·상태 (className 문자열 외 일절 금지)
- `src/lib/**` · API 라우트 · prisma · 다른 트랙 로직
- 의미 컬러(상태 배지 green/destructive 등, SKILL §7) — **건드리지 마라**
- `src/app/admin/design-rules/**`(BR-2, 이미 킷 토큰) · `src/lib/program-design`·`program-design` 라우트(BR-3 — inline style 킷 토큰, 무관)

## 🛠 Tasks (기계적, 보수적)
1. **`rounded-*` 제거**: className 안의 whole-token `rounded`, `rounded-{sm,md,lg,xl,2xl,full,none,t,b,l,r,tl,...}` 만 제거. ⚠️ 다른 토큰의 일부(예: 임의값 `rounded-[...]`, 변형 `group-hover:rounded-*`)도 동일 처리하되, **className 문자열 밖(주석·변수명·data)** 은 절대 건드리지 마라. 토큰 제거 후 이중 공백 정리.
2. **`*-primary` → brand 유틸리티**: `bg-primary`→`bg-brand`, `text-primary`→`text-brand`, `border-primary`→(globals.css 가 제공하는 brand 보더 유틸) 로 치환. `bg-primary/10` 같은 **불투명도 변형**도 보존해 치환(`bg-brand/10`). `text-primary-foreground`(대비 텍스트)는 **그대로 둬라**(별개 토큰). globals.css 에 해당 brand 유틸이 없으면 그 항목은 **건드리지 말고 보고**.
3. 한 파일씩, 작은 단위로. 정규식 일괄치환 시 위 예외(ui/, foreground, 의미컬러, 문자열 밖)를 반드시 회피.

## 🧪 Self-Verification (시각 불변 = 최우선)
- [ ] `npm run typecheck` · `npm run lint`(신규 에러 0) · `npm run check:manifest` 통과
- [ ] `npm run build` 성공 (Tailwind 가 모든 brand 유틸 인식 — 미인식 클래스 0)
- [ ] **시각 불변 스팟체크**: dev 띄워 주요 화면 3곳(로그인·프로젝트 목록·`/admin/design-rules`) 렌더가 치환 전후 동일한지 육안/스냅샷 확인. radius 0·accent 색 그대로여야 함. (백그라운드 dev 금지 — 직접 확인)
- [ ] grep 재확인: 남은 `bg-primary`/`text-primary`(`-foreground` 제외)·`rounded-`(ui/ 제외) 카운트 보고 — 0 또는 "보고된 예외만"
- [ ] `git diff` 가 **className 문자열만** 바꿨는지 샘플 10파일 육안 확인 (로직·구조 변경 0)
- [ ] `git diff --name-only` ⊆ CAN-touch (ui/ 미포함)

## 📤 Return Format (5섹션, 한국어)
**✅ 한 일**(치환 건수·파일수) / **❌ 못한 일**(brand 유틸 없어 보류한 항목 등) / **🤔 결정**(ADR 후보만) / **🔬 검증**(체크리스트 실측 + 시각 불변 증명 + 남은 카운트 + `git diff --stat`) / **⚠️ 위험**

## ⚠️ 주의
- **시각·기능을 바꾸면 실패다.** 색·간격·레이아웃이 1px라도 달라지면 STOP·보고.
- shadcn `src/components/ui/**` 절대 수정 금지.
- 의심되면(brand 유틸 부재·foreground 혼동·임의값) 치환하지 말고 그 목록을 보고.
- 커밋하지 마라 — 워킹트리에 남겨 메인이 검수 후 커밋.
