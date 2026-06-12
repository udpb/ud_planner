---
name: ud-design-system
description: TRIGGER when creating/editing UI components, brand HTML outputs (landing/report/poster), choosing colors/fonts/spacing, working on files under src/app/**/*.tsx or src/components/**/*.tsx or docs/**/*.html, adding Tailwind classes, making buttons/cards/modals, or when the user mentions "디자인", "UI", "스타일", "컬러", "폰트", "톤앤매너", "디자인 킷", "랜딩". Use this skill to apply the official Underdogs design kit 260529 — NanumHuman+Poppins, single accent #F05519 + variations, radius 0, tint-box language, semantic tokens.
---

# 언더독스 디자인 시스템 v2 — 공식 킷 260529 기준

> **SSoT**: `docs/design-kit/` (2026-05-29 공식 킷, 레포 내 복사본).
> - 레퍼런스 구현: [docs/design-kit/index.html](../../../docs/design-kit/index.html) — Action AI Boost 랜딩. **인터랙티브 UI에 톤앤매너를 적용한 기준 구현체.** 새 UI 패턴이 필요하면 이 파일에서 먼저 찾는다.
> - 폰트 선언: [docs/design-kit/styles/webfonts.css](../../../docs/design-kit/styles/webfonts.css)
> - 로고: `docs/design-kit/assets/logo/` (underdogs 4종 + **Action AI 2종**)

**Always apply when producing UI code or brand HTML in this repo.** 새 컬러·새 폰트·새 그리드 도입 금지. 예외가 필요하면 STOP 하고 사용자 확인.

## 0. 두 프로파일 — 무엇을 만들고 있는가

| | A. 브랜드 HTML 산출물 | B. 앱 UI (src/) |
|---|---|---|
| 대상 | 리포트·랜딩·포스터·PRD HTML 등 docs/ 산출물 | UD-Ops 웹앱 (shadcn/Tailwind) |
| 기준 | 킷 토큰 + 아래 룰 **전면 적용** | ⚠️ **전환기** — §8 참조 |
| 장식 | 문서형(스크롤 리포트)=엄격 / 인터랙티브(랜딩)=§6 완화 적용 | 마이그레이션(UI-1 브리프) 후 킷 정렬 |

## 1. 컬러 토큰 (킷 그대로 복사 — 임의 hex 금지)

```css
/* 브랜드 3색 + 흑백 (불변) */
--accent:    #F05519;   /* PANTONE 1655 — 유일한 포인트 컬러 */
--dark:      #373938;   /* PANTONE 447 */
--warm-gray: #D8D4D7;   /* PANTONE Warm Gray 1 */
--white: #FFFFFF;  --black: #000000;

/* 액센트 베리에이션 (틴트 면·연한 강조) */
--accent-88: #FDEBE3;  --accent-76: #FBD6C8;  --accent-52: #F8AD91;  --accent-40: #F69975;

/* 다크 베리에이션 (텍스트 위계) */
--dark-70: #C3C4C3;  --dark-55: #A5A6A5;  --dark-40: #878888;  --dark-25: #696A6A;  --dark-10: #4B4D4C;

/* 뉴트럴 베리에이션 (배경·면 구분) */
--neutral-90: #FBFBFB;  --neutral-60: #F0F0F0;  --neutral-30: #E4E4E4;  --neutral-0: #D9D9D9;

/* 시맨틱 토큰 — 컴포넌트는 이것만 참조 */
--paper: var(--white);     --ink: var(--dark);       --soft-ink: var(--dark-10);
--muted: var(--dark-40);   --muted-2: var(--dark-55);
--line: var(--neutral-0);  --line-soft: var(--neutral-30);
```

- **포인트 컬러는 accent 1개.** 구버전의 시안(#06A9D0)·오렌지 그라데이션 스케일(#F48053/#F9BBA3/#FBD4C5)·#FF8204 는 폐기 — 새 코드 사용 금지. 연한 강조가 필요하면 accent-88/76/52/40.
- **면적비**: paper(흰) 60%+ · 뉴트럴 20~30% · accent 면 최소. 다크 앵커 면(`--ink` 배경)은 hero/overview/footer 같은 **앵커 섹션에만**.
- 본문 텍스트에 accent 금지 — accent 텍스트는 kicker·라벨·핵심 숫자·`strong` 1포인트만.

## 2. 타이포그래피

- **국문 = NanumHuman** (400/700/800) · **영문/숫자 = Poppins** (400/500/600). 한 단어 안에서 두 폰트 교차 금지.
- 폰트는 로컬 woff2 (`docs/design-kit/fonts/`). 외부 폰트 import 금지. ⚠️ 구버전 "Nanum Gothic"은 앱 UI 잔존분 — 새 산출물은 NanumHuman.
- 위계 4단계: kicker(Poppins 600, letter-spacing 1.5~2px, uppercase, accent) > heading(800/700) > body(400, line-height 1.7) > caption(muted).
- display 100% 크기 제목(One Loudest)은 산출물당 1개.
- `word-break: keep-all` 국문 전체 적용.

## 3. 레이아웃 골격

- **radius 0 — 전 요소.** `*, *::before, *::after { border-radius: 0 !important; }` 가 킷 기본. 둥근 모서리 금지.
- **spacing 8값만**: 4 / 8 / 12 / 16 / 22 / 28 / 40 / 60px (`--s-1`~`--s-8`).
- **틴트 박스 그리드 언어**: 카드 군집은 `gap: 2px` + 셀 배경(paper ↔ neutral-60/90 교차)으로 면 분할. 보더 카드보다 이 패턴 우선.
- 디바이더 2종: 1px `--line` / 2px `--ink`.
- 컨테이너: 랜딩 max 1200px / 스크롤 리포트 max 900px.

## 4. 박스·강조 문법

- 박스 2종 — 4변 stroke **또는** tint 면. 한 산출물에는 한 박스 언어만. "한쪽 모서리 accent 라인 카드" 금지.
- **accent 면(주황 배경 블록)은 산출물당 한 곳** — 킷의 `pivot-callout`(accent-88 면) 패턴. CTA 풀-블리드 섹션(`cta-final`)은 랜딩의 예외.
- 다크 셀 하이라이트: 그리드 안에서 1셀만 `--ink` 또는 `--accent` 배경으로 반전 (`overview-cell.highlight` 패턴).

## 5. 로고

- 헤더 + 푸터에 wordmark (심볼 단독 금지, 워터마크 제외).
- **심볼 워터마크**: `opacity: 0.05`, 섹션 모서리에 대형 배치 (`hero-watermark` 패턴) — 허용되는 유일한 장식적 사용.
- Action AI 산출물은 `Action_AI_logo_black.svg` 사용, "Powered by Underdogs" 병기 패턴 (킷 `feature-soft` 섹션 참조).

## 6. 인터랙티브 UI 완화 조항 (랜딩·웹앱 — 문서형 산출물에는 불허)

킷 레퍼런스 구현이 명시적으로 허용한 것:

| 허용 | 조건 |
|---|---|
| transition · hover 효과 | translateY(-2px)·색 전환 수준의 절제 |
| fadeInUp · scroll-reveal 애니메이션 | 0.6~0.8s ease, 콘텐츠 등장에만 |
| box-shadow | 핵심 카드 1~2곳만 (hero 패널·gold 카드) — `rgba(55,57,56,0.07~0.12)` 톤 |
| 부드러운 틴트 그라데이션 | accent-88↔paper radial(히어로), paper↔neutral-60 linear(섹션 전환)만 |
| 라인 SVG 아이콘 | `stroke="currentColor" stroke-width="1.6"` 인라인 SVG, accent 컬러 — 이모지·채움 아이콘 금지 |
| 아코디언·탭·언어 토글 | +/− 기호 회전, max-height 트랜지션 패턴 |

문서형(리포트·PRD·포스터)은 종전대로 **장식 전면 금지** (radius·이모지·아이콘·그라데이션·shadow ❌).

## 7. 앱 공통 규칙 (프로파일 B — 유지 항목)

- **shadcn/ui** (`src/components/ui/`): 기존 컴포넌트 우선, 직접 수정 금지(래퍼로 확장), 새 컴포넌트 추가는 사용자 승인.
- **sonner**: `toast.success/error/loading`. alert/confirm 금지.
- **브랜드 상수**: `src/lib/ud-brand.ts` — UD_TRACK_RECORD·UD_PROPRIETARY_TOOLS 등 하드코딩 금지. `IMPACT`(대문자, "6단계 18모듈 54문항")·`DOGS`·`ACT-PRENEURSHIP` 표기 유지.
- **상태 배지** (재정의 금지): DRAFT=yellow / PROPOSAL=blue / SUBMITTED=violet / IN_PROGRESS=green / COMPLETED=gray / LOST=red.
- **접근성**: 버튼 aria-label, 컬러 단독 상태 전달 금지, 포커스 링 유지.

## 8. ⚠️ 앱 UI 전환기 규칙 (마이그레이션 전까지)

현행 `src/` 앱은 구 시스템(Nanum Gothic · rounded-md · lucide-react · 시안 서브컬러)으로 작성됨. 킷 정렬은 **UI-1 브리프**(`.claude/agent-briefs/UI-1-design-kit-app-migration.md`, deferred)로 일괄 진행 예정.

그 전까지:
1. **기존 화면 유지보수** = 기존 컨벤션 따름 (한 화면 안에 신구 혼합 금지 — 어색한 반반 UI가 최악).
2. **새 독립 화면·외부 노출 화면**(랜딩·공유 페이지·인쇄 뷰) = 새 킷 적용.
3. **브랜드 HTML 산출물**(docs/) = 항상 새 킷.
4. globals.css 토큰·radius 전역 변경은 UI-1 브리프 스코프 — 단발 PR로 건드리지 말 것.

## 9. 금지 목록 (위반 시 STOP)

1. 새 폰트 import / 외부 폰트 CDN
2. 임의 hex 직접 입력 (킷 토큰 외)
3. 폐기 컬러 사용 (시안 #06A9D0 · #F48053 계열 그라데이션 · #FF8204)
4. accent 를 대면적 배경에 사용 (앵커·CTA 예외 외)
5. 문서형 산출물에 radius·이모지·아이콘·shadow·그라데이션
6. shadcn 컴포넌트 직접 수정 · 새 아이콘 라이브러리 추가
7. alert/confirm · 브랜드 숫자 하드코딩
8. 한 화면 신구 디자인 혼합 (§8)

---

**Single source of truth**: `docs/design-kit/` > 이 skill > `CLAUDE.md` 디자인 섹션(구버전 잔존) > `src/lib/ud-brand.ts`. 충돌 발견 시 킷 우선 + 보고.
