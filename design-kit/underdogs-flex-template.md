---
# ════════════════════════════════════════════════════════════════════
#  UNDERDOGS FLEX TEMPLATE — 폰트·컬러·로고는 고정, 형식은 자유
#  ────────────────────────────────────────────────────────────────
#  한 파일로 다음을 모두 커버한다:
#    · 리포트(A4/Letter/B5 인쇄, 웹 스크롤)
#    · 포스터(A1/A2/A3/A4, B1/B2/B3) — 인쇄 + 디지털 사이니지
#    · 상세페이지(이커머스 롱스크롤 860–1080px)
#    · 슬라이드(16:9)
#    · 카드뉴스(1:1, 4:5, 9:16 스토리)
#
#  쓰는 법
#  1. `design_system`은 절대 수정하지 않는다 (불변 영역).
#  2. `project` 슬롯을 채운다. `format` 값이 RENDER CONTRACT를 결정.
#  3. 형식·페이지 수·레이아웃은 자유. 단 PRINCIPLES 13가지를 어기지 않는다.
#  4. CSS의 :root와 base 스타일은 그대로 복사. 색·간격·타입 스케일 값을 임의로 만들지 않는다.
#  5. COMPOSITION PATTERNS에서 필요한 만큼 골라 조합한다.
#  6. 로고는 LOGO USAGE 규칙에 따라 반드시 1개 이상 배치한다.
#  7. 결과물은 단일 HTML(또는 매체별 출력) 1개. 자산은 같은 폴더 `assets/`로.
# ════════════════════════════════════════════════════════════════════

design_system:
  # ---- 폰트 (불변) ----
  fonts:
    en:
      family: Poppins
      weights: [400, 500, 600]
      source: "로컬 woff2 (Poppins-Regular/Medium/SemiBold)"
    ko:
      family: NanumHuman
      weights: [400, 700, 800]
      source: "로컬 woff2 (NanumHuman-Regular/Bold/ExtraBold)"
      note: |
        body의 font-family는 항상 `"NanumHuman", system-ui, sans-serif` 순.
        영문/숫자는 `"Poppins", "NanumHuman", sans-serif`.
        EN과 KO는 절대 교차하지 않는다 (한 단어 안에 섞지 않는다).

  # ---- 컬러 (불변) ----
  # 3가지 브랜드 컬러 + #FFFFFF + #000000 으로만 구성.
  # 추가 색이 필요하면 아래 베리에이션에서만 선택한다.
  #
  # ★ #000000과 #FFFFFF는 폰트 컬러 등 꼭 필요한 경우에만 사용.
  #   넓은 면적에 사용하는 것은 되도록 지양한다.

  brand_colors:
    accent:     "#F05519"      # PANTONE 1655 C/U — 유일한 포인트 컬러
    dark:       "#373938"      # PANTONE 447 C/U — 기본 텍스트·강조 배경
    warm_gray:  "#D8D4D7"      # PANTONE Warm Gray 1 C/U — 보조 면·배경
    white:      "#FFFFFF"      # 페이지 바탕 (넓은 면적 지양)
    black:      "#000000"      # 폰트·강조 (넓은 면적 지양)

  # ── 액센트 베리에이션 (F05519 + white 혼합) ──
  # 강조가 필요하거나 컬러 면이 필요한 경우에만 사용.
  accent_tints:
    accent_88: "#FDEBE3"       # 88% white — 가장 연한 배경
    accent_76: "#FBD6C8"       # 76% white — 연한 강조 면
    accent_52: "#F8AD91"       # 52% white — 중간 톤
    accent_40: "#F69975"       # 40% white — 진한 강조
    accent_0:  "#F05519"       # 원색 (= accent)

  # ── 다크 베리에이션 (373938 + white 혼합) ──
  # 텍스트 위계·디바이더·어두운 배경에 사용.
  dark_tints:
    dark_70: "#C3C4C3"         # 70% white — 가장 연한 (구분선·비활성)
    dark_55: "#A5A6A5"         # 55% white — 캡션·푸터
    dark_40: "#878888"         # 40% white — 보조 텍스트
    dark_25: "#696A6A"         # 25% white — 서브 텍스트
    dark_10: "#4B4D4C"         # 10% white — 본문 텍스트
    dark_0:  "#373938"         # 원색 (= dark) — 헤드라인·강한 텍스트

  # ── 뉴트럴 그레이 베리에이션 (D9D9D9 + white 혼합) ──
  # 배경 면·callout 박스·섹션 구분에 사용.
  neutral_tints:
    neutral_90: "#FBFBFB"      # 90% white — 거의 흰 배경 (미묘한 구분)
    neutral_60: "#F0F0F0"      # 60% white — callout 박스 배경
    neutral_30: "#E4E4E4"      # 30% white — 섹션 배경·카드 면
    neutral_0:  "#D9D9D9"      # 원색 — 외곽 배경·강한 면 구분

  # ── 시맨틱 토큰 (위 베리에이션에서 매핑) ──
  semantic:
    paper:     "#FFFFFF"       # 페이지 바탕
    ink:       "#373938"       # 헤드라인·강한 텍스트 = dark_0
    soft_ink:  "#4B4D4C"       # 본문 텍스트 = dark_10
    muted:     "#878888"       # 캡션·푸터 = dark_40
    muted_2:   "#A5A6A5"       # 비활성·보조 캡션 = dark_55
    line:      "#D9D9D9"       # 디바이더·구분선 = neutral_0
    line_soft: "#E4E4E4"       # 약한 구분선 = neutral_30
    bg:        "#D9D9D9"       # 외곽 배경 = neutral_0
    accent:    "#F05519"       # 포인트 컬러 = accent_0

  # ── 컬러 배분 원칙 ──
  # 누가 만들어도 같은 톤이 나오게 하는 면적 비율 가이드.
  color_ratio:
    - "주조색: #FFFFFF(paper)가 전체 면적의 60% 이상. 가장 넓은 면."
    - "보조면: neutral 베리에이션(#FBFBFB ~ #D9D9D9)으로 섹션 배경·callout 박스. 전체의 20-30%."
    - "텍스트: dark 베리에이션(#373938 ~ #C3C4C3)으로 위계 표현. 면적이 아닌 텍스트에만."
    - "포인트: accent(#F05519)와 accent 베리에이션은 kicker·label·숫자·강조 라벨에만. 전체 면적의 5% 미만."
    - "accent 베리에이션을 배경 면으로 쓸 경우: 한 산출물에 1개 영역 이하. 연한 톤(accent_88, accent_76)만."
    - "dark_0(#373938)를 배경으로 쓸 경우: 한 산출물에 1개 섹션 이하 (다크 전환점 용도)."
    - "#000000은 폰트 컬러로만, #FFFFFF는 다크 배경 위 폰트·페이지 바탕에만. 넓은 단색 면으로 사용 지양."

  # ---- 로고 (불변 자산) ----
  logo:
    location: "assets/logo/"
    assets:
      wordmark_black: "assets/logo/underdogs-wordmark-black.svg"   # 기본형 검정 — 밝은 배경
      wordmark_white: "assets/logo/underdogs-wordmark-white.svg"   # 기본형 흰색 — 어두운 배경
      symbol_black:   "assets/logo/underdogs-symbol-black.svg"     # 심볼 검정 — 보조용
      symbol_white:   "assets/logo/underdogs-symbol-white.svg"     # 심볼 흰색 — 보조용
    primary: "wordmark"                # 기본형(워드마크)이 메인. 심볼은 보조.
    min_appearance: 1                  # 모든 결과물에 4종 중 최소 1개는 들어가야 한다.
    # 자세한 사용 규칙은 본문 LOGO USAGE 섹션 참고.

  # ---- 상세 스펙 ----
  # 타입 스케일·간격·밀도·원칙 등은 본문의 각 섹션이 단일 진실 소스(single source of truth).
  # → QUALITY SYSTEM: 간격 토큰·타입 캐스케이드·밀도 티어·One Loudest
  # → REFERENCE CSS: :root 변수·컴포넌트 클래스
  # → Design Principles: 13가지 절대 룰

# ════════════════════════════════════════════════════════════════════
#  PROJECT — 매번 채우는 부분
# ════════════════════════════════════════════════════════════════════
project:
  title:        "<리포트/포스터/상세페이지 제목>"
  subtitle:     "<부제, 선택>"
  publisher:    "<발행 주체 / 팀명>"
  date:         "<YYYY-MM 또는 발행일>"
  audience:     "<주요 독자, 1-2줄>"
  format:       "<예: A4-report / A2-poster / B3-poster / detail-page / slide-16x9 / card-news-1x1 / card-news-9x16>"
  length_hint:  "<예상 분량, 자유 — '한 화면', '6~8장', '스크롤 2회분' 등>"
  tone:         "<예: 실행 중심 / 영감 중심 / 분석 중심 / 모객 중심 / 신뢰 중심>"
  notes:        "<자유 메모 — 강조하고 싶은 메시지·꼭 들어갈 데이터·피해야 할 표현 등>"
---

# Quick Start (이 파일을 받은 Claude/디자이너에게)

이 템플릿은 **'폰트·컬러·로고·디자인 원칙'은 고정**, **'형식·페이지 수·레이아웃'은 자유**다. 어떤 매체(리포트, A1~A4·B1~B3 포스터, 상세페이지, 슬라이드, 카드뉴스)로 가도 일정 시각 퀄리티가 나오게 설계됐다.

**콘텐츠 수정 절대 금지** — 이 규칙은 모든 작업에 우선한다:
- ❌ 긴 카피를 짧게 압축 / 짧은 카피를 길게 확장
- ❌ 받은 톤을 다른 톤으로 바꿔쓰기
- ❌ 한국어 ↔ 영어 번역해서 EN tagline 만들기
- ❌ 받지 않은 새 문구 추가 ("Apply by", "Underdogs Up Support" 등)
- ❌ 날짜·연락처·일정 형식 변환 ("5월 25일" → "5.25" 등)
- 받지 못한 콘텐츠는 임의로 채우지 말고 묻는다.

## ⛔ MANDATORY GATE — 아래를 완료하기 전에 HTML을 생성하지 마라

> **이 게이트를 건너뛰면 결과물의 비율·호흡감이 무너진다. "빨리 만들고 고치자"는 접근은 금지.**
> 새로 만들 때뿐 아니라, 기존 파일을 수정·리디자인할 때도 반드시 거친다.

### GATE 1 — 정보 수집 (3가지 확인 전까지 코드 작성 금지)

다음 3가지가 **사용자에게 확인되지 않으면 작업에 들어가지 않는다.** 추측으로 넘어가지 말고 묻는다.

- **형태 + 사이즈**: "포스터 만들어줘"만으로는 부족. → "어떤 사이즈(A4, A2 등)의 포스터인가요?" 확인. 미지정 시 기본값(STEP 1 표) 안내 후 확인받기. 기존 파일 수정의 경우, 파일에서 형태와 사이즈를 파악하고 사용자에게 확인.
- **목적**: "모집 공고", "이벤트 안내" 등 한 줄. 불명확하면 묻는다.
- **콘텐츠**: 들어갈 텍스트 전체(헤드라인·본문·날짜·연락처 등). 빠진 항목이 있으면 묻는다. 기존 파일 수정의 경우, 파일 내 콘텐츠를 추출해 사용자에게 "이 내용이 맞나요?" 확인.

### GATE 2 — 레퍼런스 리서치 (구체적 사례 없이 레이아웃 결정 금지)

> **이 단계를 건너뛰는 것은 절대 허용되지 않는다.** 새로 만들 때, 수정할 때, 단순 컬러 교체일 때도 반드시 거친다. "이미 알고 있다", "간단한 수정이라 불필요하다"는 판단으로 생략하지 않는다.

- 해당 **포맷 + 목적**의 우수 사례를 웹에서 **2–3개** 찾는다. 찾지 않고 넘어가면 GATE 실패.
- 찾은 사례 각각에서 다음을 관찰하고 **사용자에게 요약 보고**한다:
  - 헤드라인이 전체 면적에서 차지하는 비중
  - 여백과 콘텐츠의 균형
  - 정보 요소들의 시각적 무게 분배, 시선 흐름
- 레퍼런스의 컬러·폰트·장식은 무시한다. **구조와 비율만** 참고한다.
- 기존 파일 수정의 경우에도 리서치를 생략하지 않는다. 원본 레이아웃이 적절한지 레퍼런스와 비교하여 판단한다.

### GATE 3 — 적용 방향 선언 (선언 없이 코드 작성 금지)

GATE 1·2를 마친 뒤, HTML을 작성하기 **전에** 다음을 사용자에게 한 번 정리해서 보여준다:
- 선택한 format key, 밀도 티어, 패턴 조합
- 레퍼런스에서 가져올 비율·배치 포인트
- 콘텐츠 위계 매핑 (어떤 텍스트가 display / lead / body / caption인지)

사용자가 "좋아" 또는 수정 지시를 준 뒤에만 코드 작성에 들어간다.

> **세 GATE를 모두 통과한 뒤에만 아래 작업 순서를 진행한다.**

---

작업 순서:

1. frontmatter의 `project` 슬롯을 채운다. `format` 값이 `FORMAT PROFILES`의 어느 항목에 해당하는지 확인.
2. **Design Principles** 13가지를 절대 어기지 않는다. 어기면 시각 일관성이 무너진다.
3. `LOGO USAGE`에서 해당 포맷의 로고 배치 레시피를 따른다. 4종 SVG 중 최소 1개는 반드시 배치.
4. 콘텐츠 구조(섹션 수·순서·페이지 분할)는 자유롭게 설계하되, **COMPOSITION PATTERNS**에서만 골라 조합한다. 새 패턴을 임의로 만들지 않는다.
5. 사용자가 "~~ 사이즈의 ~~ 형식으로 만들어줘"라고 하면 → `FORMAT & LAYOUT GUIDE`를 따라 캔버스·레이아웃·위계만 자동 결정한다.
6. CSS 변수(:root)는 REFERENCE CSS를 그대로 복사한다. 색·간격·타입 스케일 값을 임의로 만들지 않는다.
7. 결과물은 단일 HTML 1개. 이미지·폰트·로고 등 자산은 같은 폴더 하위 `assets/`, `fonts/`에.
8. 작성 후 **검수 체크리스트 23개**를 모두 확인한다.

---

# Design Principles — 13가지 절대 룰

> 형식이 자유여도, 이 13가지가 지켜지면 결과물은 같은 시각 정체성으로 묶인다.

1. **한 화면 = 한 메시지.** 한 페이지/화면에 여러 메시지를 욱여넣지 않는다. 더 할 말이 있으면 페이지를 늘린다.
2. **여백은 정보다.** 빈 공간이 텍스트만큼 많은 일을 한다. 매체별 최소 호흡 단위는 FORMAT PROFILES 참고.
3. **간격은 8개 값에서만.** spacing_scale `[4, 8, 12, 16, 22, 28, 40, 60]` 외 px 값을 만들지 않는다. 포스터·슬라이드의 큰 여백이 필요하면 이 값들의 정수배(×1.5, ×2, ×3)만 허용.
4. **텍스트 위계 4단계.** kicker > heading > body > caption. 5단계로 늘리지 않는다. 더 강조하고 싶으면 위계가 아니라 여백/디바이더로.
5. **포인트 컬러 1개.** `#F05519` 하나. 빨강·파랑·노랑 등 다른 채도 컬러 금지. 텍스트 위계는 dark 베리에이션 4단계(ink/soft_ink/muted/muted_2)로. 컬러 배분은 frontmatter `color_ratio` 참조.
6. **선과 박스 규칙.**
   - **디바이더 2종**: 1px var(--line) / 2px var(--ink). 그 외 굵기·색·점선 금지 (출처 리스트의 dotted underline만 예외).
   - **박스 표현 2종**: (a) **4변 모두 stroke** 닫힌 박스 / (b) **채워진 tint 박스** (`var(--neutral-90)` 또는 `var(--neutral-60)`).
   - **금지**: 한쪽 모서리(좌·우·상·하)에만 컬러 라인을 깔아 박스·카드를 흉내내는 패턴 (예: `border-top: 2px solid var(--accent)`만 있는 카드).
   - **한 산출물 = 한 박스 언어**. stroke 박스와 tint 박스를 같은 페이지에 섞지 않는다.
7. **장식 금지.** border-radius, 이모지, 아이콘, 그라데이션, 화면 출력용 외 box-shadow 모두 금지. (이미지 위 캡션 그라데이션만 유일 예외.)
8. **한글 keep-all.** 한글 텍스트 블록은 모두 `word-break: keep-all`. 단어 중간 끊김 금지.
9. **폰트 교차 금지.** 한 단어 안에 Poppins와 NanumHuman을 섞지 않는다. EN/숫자는 Poppins, KO는 NanumHuman.
10. **빈 이미지는 단색 박스.** image-card에 이미지가 없으면 `var(--neutral-0)` (#D9D9D9)로 채우고 캡션은 유지.
11. **accent는 강조용만.** kicker, label, 큰 숫자(통계), 강조 라벨에만. body 본문 텍스트에 #f05519를 직접 쓰지 않는다 (위계가 무너진다).
12. **컬럼은 좁히지 말고 줄여라.** 3컬럼 그리드가 답답해 보이면 2로, 또 답답하면 1로. 컬럼 폭을 줄이면 가독성이 같이 깎인다.
13. **로고는 반드시 1개 이상.** `assets/logo/` 4종 SVG 중 최소 1개를 배치한다. 기본은 wordmark(기본형), 심볼은 자리가 좁거나 wordmark가 이미 들어간 자리에 보조 마크로만 사용. 자세한 규칙은 LOGO USAGE 섹션.

---

# QUALITY SYSTEM — 후속 지시 없어도 기본 퀄리티가 유지되는 5가지

> 원칙 13개는 "하지 말 것"을 막는다. 이 섹션은 "어떻게 하면 잘 되는지"를 정량화한다. 새 산출물을 만들 때 이 5개를 먼저 결정하고 시작한다.

## 1. 간격을 값이 아니라 관계로 고른다

spacing_scale 8개는 1차 primitive다. 실제 컴포넌트의 gap·padding은 다음 3개만 쓴다.

| 토큰 | 의미 | sparse | standard | dense |
|---|---|---|---|---|
| `--gap-section` | 섹션 ↔ 섹션 사이 | 40px | 28px | 22px |
| `--gap-element` | 한 섹션 안 요소 사이 | 22px | 16px | 12px |
| `--gap-tight` | 강하게 묶인 한 덩어리 안 | 8px | 6px | 4px |

**룰**: CSS에서 `gap: 14px;` 같이 임의 값 박지 말 것. 무조건 `gap: var(--gap-element);` 형태. 컴포넌트가 어떤 매체로 가도 같은 호흡으로 묶인다.

## 2. 타입 사이즈는 비율로 캐스케이드

`--type-display` 한 개만 정하면 나머지는 비율로 따라온다.

```
section-title = display / 1.75
kicker        = display / 5.1
body          = display / 4.0
caption       = display / 5.1
label         = section-title / 3.2
```

**룰**: 헤딩·본문 사이즈를 매번 눈대중으로 정하지 않는다. display 한 번만 정하고 나머지는 `calc(var(--type-display) / 4)` 형태로 호출.

## 3. 앵커 포지션 강제

페이지/캔버스 컨테이너는 `display: flex; flex-direction: column;`. 그리고:

- **header (page-head)** → 맨 위. `margin-top` 없음.
- **footer / CTA** → 맨 아래. `margin-top: auto;`로 자동 푸시.
- **중간 콘텐츠** → 자연스럽게 fill.

이렇게 하면 콘텐츠 양이 바뀌어도 QR이 잘리거나 푸터가 떠오르는 사고가 안 생긴다. **`overflow: hidden`으로 자르지 말고 앵커로 정렬한다.**

## 4. 밀도 티어 (sparse / standard / dense)

한 화면(또는 페이지)에 들어가는 섹션 수로 자동 결정.

| 티어 | 트리거 | 타입 스케일 | 갭 스케일 | 언제 |
|---|---|---|---|---|
| `density-sparse` | 섹션 ≤ 4 | display 64px | section 40px | 표지·포스터(단일 메시지)·카드뉴스 |
| `density-standard` | 섹션 5–7 | display 56px | section 28px | 일반 리포트 페이지·상세페이지 hero |
| `density-dense` | 섹션 ≥ 8 | display 48px | section 22px | A4 정보형 포스터·상세페이지 중간 |

**룰**: 페이지 컨테이너에 `.density-sparse` / `.density-standard` / `.density-dense` 클래스 1개 붙인다. 이 클래스가 `:root` 토큰을 오버라이드해서 타입과 갭이 일관되게 줄어든다. 작업 시작 전에 섹션 수 세고 티어부터 결정.

## 5. One Loudest — 한 화면 가장 큰 소리는 1개

시각 강도를 정량화해서 위계를 강제한다.

| 강도 | 100% (primary) | 50% (secondary) | 25% (tertiary) | 15% (body) |
|---|---|---|---|---|
| 어디 | display | section-title, big-num | kicker, label, KPI 라벨 | 본문, caption |
| 한 화면 허용 횟수 | **1회** | ≤ 3회 | 무제한 | 무제한 |

**룰**: "이 카드/숫자도 두드러져 보였으면" 충동이 들면 위계 무너진다. **primary 하나만 100%, 그 외 전부 더 작아야 한다.** display + 똑같이 큰 EN tagline 같은 건 금지.

---

# REFERENCE CSS

```css
/* ============================================================
   UNDERDOGS FLEX — Base CSS
   :root, base type, components — 그대로 복사
   ============================================================ */

:root {
  /* ── 브랜드 컬러 3색 + 흑백 ── */
  --accent:    #F05519;   /* PANTONE 1655 C/U */
  --dark:      #373938;   /* PANTONE 447 C/U */
  --warm-gray: #D8D4D7;   /* PANTONE Warm Gray 1 C/U */
  --white:     #FFFFFF;
  --black:     #000000;

  /* ── 액센트 베리에이션 (강조·컬러 면) ── */
  --accent-88: #FDEBE3;
  --accent-76: #FBD6C8;
  --accent-52: #F8AD91;
  --accent-40: #F69975;

  /* ── 다크 베리에이션 (텍스트 위계·어두운 면) ── */
  --dark-70: #C3C4C3;
  --dark-55: #A5A6A5;
  --dark-40: #878888;
  --dark-25: #696A6A;
  --dark-10: #4B4D4C;

  /* ── 뉴트럴 베리에이션 (배경·callout·섹션 구분) ── */
  --neutral-90: #FBFBFB;
  --neutral-60: #F0F0F0;
  --neutral-30: #E4E4E4;
  --neutral-0:  #D9D9D9;

  /* ── 시맨틱 토큰 (컴포넌트는 이것만 참조) ── */
  --paper:    var(--white);
  --ink:      var(--dark);        /* 헤드라인·강한 텍스트 */
  --soft-ink: var(--dark-10);     /* 본문 텍스트 */
  --muted:    var(--dark-40);     /* 캡션·푸터 */
  --muted-2:  var(--dark-55);     /* 비활성·보조 캡션 */
  --line:     var(--neutral-0);   /* 디바이더·구분선 */
  --line-soft:var(--neutral-30);  /* 약한 구분선 */
  --bg:       var(--neutral-0);   /* 외곽 배경 */

  /* spacing scale — 1차 primitive (8개). 실제 컴포넌트는 아래 관계 토큰만 사용 */
  --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px;
  --s-5: 22px; --s-6: 28px; --s-7: 40px; --s-8: 60px;

  /* ── 간격 관계 토큰 (standard 티어 기본값) ── */
  /* 컴포넌트의 gap/padding은 이 3개만 쓴다. 값이 아니라 관계로 고른다. */
  --gap-section: 28px;   /* 섹션 ↔ 섹션 */
  --gap-element: 16px;   /* 한 섹션 안 요소 사이 */
  --gap-tight:   6px;    /* 강하게 묶인 한 덩어리 안 */

  /* ── 타입 비율 캐스케이드 (standard 티어 기본값) ── */
  /* --type-display를 정하면 나머지는 var(--type-display)/N 로 따라옴 */
  --type-display: 56px;
  --type-section-title: calc(var(--type-display) / 1.75);   /* ≈ 32 */
  --type-kicker:        calc(var(--type-display) / 5.1);    /* ≈ 11 */
  --type-body:          calc(var(--type-display) / 4.0);    /* ≈ 14 */
  --type-caption:       calc(var(--type-display) / 5.1);    /* ≈ 11 */
}

/* ── 밀도 티어 오버라이드 (페이지 컨테이너에 .dense / .sparse 클래스로 적용) ── */
.density-sparse {
  --gap-section: 40px; --gap-element: 22px; --gap-tight: 8px;
  --type-display: 64px;
}
.density-dense {
  --gap-section: 22px; --gap-element: 12px; --gap-tight: 4px;
  --type-display: 48px;
}

*, *::before, *::after { box-sizing: border-box; border-radius: 0 !important; }
input, button, textarea, select { border-radius: 0 !important; }

html, body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: "NanumHuman", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

a {
  color: inherit;
  text-decoration: none;
  border-bottom: 1px solid rgba(240, 85, 25, 0.45);
}
a:hover { color: var(--accent); border-bottom-color: var(--accent); }

img, svg { display: block; max-width: 100%; height: auto; }

/* ---------- Type ---------- */
.en  { font-family: "Poppins", "NanumHuman", sans-serif; }

.kicker {
  margin: 0 0 14px;
  display: inline-block;
  color: var(--accent);
  font-family: "Poppins", "NanumHuman", sans-serif;
  font-size: 11px; font-weight: 600;
  letter-spacing: 0.18em; text-transform: uppercase;
}

.label {
  display: inline-block;
  color: var(--accent);
  font-family: "Poppins", "NanumHuman", sans-serif;
  font-size: 10px; font-weight: 600;
  letter-spacing: 0.16em; text-transform: uppercase;
}

.display {
  margin: 0;
  font-family: "Poppins", "NanumHuman", sans-serif;
  font-size: 56px; font-weight: 600;
  line-height: 1.2; letter-spacing: -0.01em;
  color: var(--ink);
  word-break: keep-all;
}
.display .ko {
  display: block;
  margin-top: 14px;
  font-family: "NanumHuman", sans-serif;
  font-size: 28px; font-weight: 600;
  line-height: 1.22; letter-spacing: -0.01em;
  color: var(--ink);
  word-break: keep-all;
}

.section-title {
  margin: 0;
  font-family: "NanumHuman", sans-serif;
  font-size: 32px; font-weight: 800;
  line-height: 1.18; letter-spacing: -0.01em;
  color: var(--ink); word-break: keep-all;
}
.section-title.en {
  font-family: "Poppins", "NanumHuman", sans-serif;
  font-size: 38px; font-weight: 600;
  line-height: 1.04; letter-spacing: -0.01em;
}

.big-num {
  font-family: "Poppins", sans-serif;
  font-size: 110px; font-weight: 600;
  line-height: 0.86; letter-spacing: -0.02em;
  color: var(--accent);
}

.lead  { margin: 0; color: var(--soft-ink); font-size: 14px; line-height: 1.74; word-break: keep-all; }
.body  { margin: 0; color: var(--soft-ink); font-size: 14px; line-height: 1.78; word-break: keep-all; }
.small { margin: 0; color: var(--muted);    font-size: 11px; line-height: 1.62; word-break: keep-all; }

/* ---------- Layout helpers ---------- */
.stack    { display: flex; flex-direction: column; gap: var(--s-4); }
.stack-lg { display: flex; flex-direction: column; gap: var(--s-5); }

.row      { display: flex; gap: var(--s-5); }
.grid-2   { display: grid; grid-template-columns: 1fr 1fr;     gap: var(--s-5); }
.grid-3   { display: grid; grid-template-columns: repeat(3,1fr); gap: var(--s-5); }
.grid-4   { display: grid; grid-template-columns: repeat(4,1fr); gap: var(--s-5); }
.split    { display: grid; grid-template-columns: 0.92fr 1.08fr; gap: var(--s-5); }

/* ---------- Logo ---------- */
.logo-wordmark { display: block; width: auto; }
.logo-symbol   { display: block; width: auto; }
/* 크기 가이드 — 인라인 height로 매체별 조절. wordmark min 60mm, symbol min 12mm (인쇄 기준) */

/* ---------- Components ---------- */

/* Page Head */
.page-head {
  display: flex; align-items: flex-end; justify-content: space-between;
  gap: var(--s-4);
  padding-bottom: var(--s-5); margin-bottom: var(--s-6);
  border-bottom: 2px solid var(--ink);
}
.page-head .label-stack { display: grid; gap: 6px; }

/* Hero (Cover) */
.hero { padding: var(--s-8); }
.hero-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: var(--s-5); margin-bottom: 96px;
}
.hero-issue {
  font-family: "Poppins", sans-serif;
  font-size: 11px; font-weight: 600;
  letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--ink);
}
.hero-issue span { color: var(--muted); margin-left: 10px; font-weight: 500; }

/* Quote */
.quote {
  margin: 0;
  padding: 26px 28px;
  background: var(--neutral-60);
  font-family: "NanumHuman", sans-serif;
  font-size: 18px; font-weight: 600;
  line-height: 1.5; color: var(--ink); word-break: keep-all;
}

/* Takeaway */
.takeaway { padding: var(--s-5) var(--s-5) 24px; background: var(--neutral-60); color: var(--ink); }
.takeaway .kicker { color: var(--accent); margin-bottom: 10px; font-size: 14px; }
.takeaway p {
  margin: 0;
  font-family: "NanumHuman", sans-serif;
  font-size: 16px; font-weight: 600; line-height: 1.5;
  word-break: keep-all; color: var(--ink);
}

/* KPI Row — 핵심 수치 강조 (3-4개) */
.kpi-row {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 0;
  border-top: 1px solid var(--ink); border-bottom: 1px solid var(--ink);
}
.kpi { padding: var(--s-5) var(--s-4) 24px 0; border-right: 1px solid var(--line); }
.kpi:last-child  { border-right: 0; padding-right: 0; }
.kpi:not(:first-child) { padding-left: var(--s-4); }
.kpi-num {
  font-family: "Poppins", sans-serif;
  font-size: 36px; font-weight: 600; line-height: 1;
  color: var(--accent); margin-bottom: 14px;
}
.kpi h3 {
  margin: 0 0 10px;
  font-family: "Poppins", "NanumHuman", sans-serif;
  font-size: 16px; font-weight: 600; line-height: 1.3;
  word-break: keep-all;
}

/* Image Card */
.image-card {
  position: relative; margin: 0;
  width: 100%; align-self: stretch; overflow: hidden;
  background: var(--neutral-60);
  min-height: 200px;
}
.image-card img { width: 100%; height: 100%; object-fit: cover; }
.image-card::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(180deg, transparent 60%, rgba(0,0,0,0.30));
  pointer-events: none;
}
.image-card a { display: block; width: 100%; height: 100%; border: 0; cursor: zoom-in; }
.caption {
  position: absolute; left: var(--s-3); right: var(--s-3); bottom: 11px; z-index: 2;
  color: #fff;
  font-family: "NanumHuman", sans-serif;
  font-size: 11px; font-weight: 400; line-height: 1.5;
  word-break: keep-all;
}

/* Source List */
.source-list { display: grid; gap: 0; }
.source-item {
  display: grid; grid-template-columns: auto 1fr;
  gap: 14px; padding: var(--s-3) 0;
  border-bottom: 1px solid var(--line);
}
.source-item:first-child { border-top: 1px solid var(--line); }
.source-item .num {
  font-family: "Poppins", sans-serif;
  font-size: 10px; font-weight: 600;
  color: var(--accent); letter-spacing: 0.1em; padding-top: 2px;
}
.source-item a {
  color: var(--ink);
  font-family: "Poppins", "NanumHuman", sans-serif;
  font-size: 13px; font-weight: 500; line-height: 1.4;
  border: 0;
  text-decoration: underline;
  text-decoration-color: rgba(240, 85, 25, 0.4);
  text-decoration-style: dotted;
  text-underline-offset: 3px;
  word-break: keep-all;
}
.source-item a::after { content: " ↗"; margin-left: 3px; color: var(--muted); }
.source-item a:hover { color: var(--accent); text-decoration-color: var(--accent); }
.source-item .desc {
  display: block; margin-top: 4px;
  color: var(--muted); font-size: 11px; line-height: 1.5; word-break: keep-all;
}

/* Pills */
.pill-row { display: flex; flex-wrap: wrap; gap: 6px; }
.pill {
  display: inline-flex; padding: 5px 10px;
  border: 1px solid var(--line);
  color: var(--soft-ink);
  font-family: "Poppins", "NanumHuman", sans-serif;
  font-size: 9px; font-weight: 500; letter-spacing: 0.04em;
}

/* Tint Box — 채워진 박스 (stroke 없음, 연한 배경)
   언제 쓰나: 랜딩페이지·상세페이지·슬라이드·카드뉴스 등 한 페이지에
   여러 메시지를 묶어야 할 때. 텍스트 많은 리포트엔 stroke 박스를 쓰고
   tint 박스와 섞지 않는다. */
.tint-box {
  padding: var(--gap-element, 16px);
  background: var(--neutral-90);
  color: var(--ink);
}
.tint-box.is-strong { background: var(--neutral-60); }
.tint-box .kicker { margin-bottom: 10px; }

/* Footer */
.footer-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding-top: 9px;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-family: "Poppins", "NanumHuman", sans-serif;
  font-size: 9px; font-weight: 500;
  letter-spacing: 0.14em; text-transform: uppercase;
}

/* Dividers */
.rule        { height: 1px; margin: var(--s-5) 0; background: var(--line); border: 0; }
.rule-thick  { height: 2px; background: var(--ink); border: 0; margin: 0 0 var(--s-5); }

/* ============================================================
   POSTER MODE — 큰 판형 전용 헬퍼 (.poster 컨테이너 안에서만 적용)
   ────────────────────────────────────────────────────────────
   아래는 구조·line-height·letter-spacing만 제공한다.
   font-size는 STEP 0-B 레퍼런스 리서치 결과에 따라
   캔버스 크기에 맞게 직접 설정한다.
   ============================================================ */

.poster .display      { line-height: 0.92; }
.poster .section-title{ line-height: 1.04; }
.poster .big-num      { line-height: 0.86; }
.poster .kicker       { letter-spacing: 0.22em; }
.poster .lead         { line-height: 1.55; }
.poster .body         { line-height: 1.7; }

/* ============================================================
   DETAIL PAGE MODE — 이커머스/이벤트 롱스크롤
   ============================================================ */

.detail-shell        { max-width: 1080px; margin: 0 auto; background: var(--paper); }
.detail-shell section{ padding: var(--s-7) var(--s-6); }
.detail-shell .hero  { padding: var(--s-8) var(--s-6); }
.detail-cta {
  display: inline-block;
  padding: 16px 28px;
  background: var(--ink); color: #fff;
  font-family: "Poppins", "NanumHuman", sans-serif;
  font-size: 14px; font-weight: 600; letter-spacing: 0.04em;
  border-bottom: 0;
}
.detail-cta:hover { background: var(--accent); color: #fff; border-bottom: 0; }
```

---

# LOGO USAGE — 4종 SVG 운용 규칙

> `assets/logo/`에 4종 SVG가 있다. 모든 결과물에 최소 1개는 반드시 배치한다.

## 자산 4종

| 파일 | 용도 | 배경 |
|---|---|---|
| `assets/logo/underdogs-wordmark-black.svg` | 기본형(검정) | 밝은 배경(paper, neutral 계열, 흰색 이미지) |
| `assets/logo/underdogs-wordmark-white.svg` | 기본형(흰색) | 어두운 배경(ink, 사진 위) |
| `assets/logo/underdogs-symbol-black.svg`   | 심볼(검정) — 보조 | 밝은 배경 |
| `assets/logo/underdogs-symbol-white.svg`   | 심볼(흰색) — 보조 | 어두운 배경 |

## 운용 원칙 5가지

1. **기본은 wordmark(기본형).** 워드마크가 들어갈 공간이 확보된 자리에는 무조건 워드마크. 인지도가 가장 높은 표현.
2. **심볼은 두 경우만.**
   - (a) wordmark가 들어가기엔 가로 폭이 모자란 자리(좁은 footer 우측, 카드뉴스 9:16의 코너, 인스타 정사각 컴팩트 레이아웃 등).
   - (b) wordmark가 이미 한 번 들어가 있고, 한 번 더 브랜드 신호를 주고 싶을 때 보조 마크로.
3. **컬러 선택은 배경 대비로.** 밝은 배경 = 검정, 어두운 배경(ink/사진) = 흰색. 회색 배경(`--bg #B2B1AE`)에서는 검정 사용.
4. **최소 사이즈를 지킨다.**
   - Wordmark: 인쇄에서 가로 30mm 이상, 디지털에서 height 24px 이상.
   - Symbol: 인쇄에서 가로 8mm 이상, 디지털에서 height 20px 이상.
5. **로고 주변에는 호흡 여백.** 워드마크 높이의 0.5배(심볼은 0.7배) 이상을 사방 여백으로 비워둔다. 텍스트·이미지·디바이더가 이 영역에 침범하지 않는다.

## 포맷별 배치 레시피 (기본값)

| 포맷 | 주 로고 위치 | 보조 로고 | 비고 |
|---|---|---|---|
| 리포트(A4/Letter/B5) | 표지 우상단 wordmark (height 32–40px) | 각 페이지 footer 우측 symbol(height 16px) | 표지=메인 / 본문=서명용 보조 |
| 웹 스크롤 리포트 | 페이지 최상단 sticky 헤더에 wordmark | 푸터 끝에 wordmark 다시 | 심볼은 사용 안 함 (스크롤 매체엔 메인만) |
| A1–A4 포스터 | 좌하단 또는 우하단 wordmark (height = `clamp(36px,4vw,84px)`) | 메시지 옆 또는 강조 영역에 symbol | 워드마크는 1회만, 심볼은 0–1회 |
| B1–B3 포스터 | 동일 (포스터 규칙) | 동일 | 포스터는 한 화면 한 메시지가 핵심 |
| 상세페이지 | 최상단 hero 좌측 wordmark | 각 섹션 구분점·푸터에 symbol | 롱스크롤이라 심볼 반복은 허용 |
| 슬라이드 16:9 | 표지 우상단 wordmark / 일반 슬라이드 우하단 symbol | — | 한 슬라이드에 둘 다 넣지 않음 |
| 카드뉴스 1:1 | 첫 카드에 wordmark 좌하단 | 본문 카드 우하단에 symbol 작게 | 첫 카드만 wordmark, 나머지는 symbol |
| 카드뉴스 9:16 (스토리) | 코너에 symbol만 | — | 세로 좁은 캔버스라 wordmark는 거의 깨짐 |

## HTML 사용 예

```html
<!-- 기본형(워드마크) -->
<img class="logo-wordmark"
     src="assets/logo/underdogs-wordmark-black.svg"
     alt="Underdogs"
     style="height: 32px;">

<!-- 어두운 배경 위 -->
<img class="logo-wordmark"
     src="assets/logo/underdogs-wordmark-white.svg"
     alt="Underdogs"
     style="height: 40px;">

<!-- 심볼(보조) -->
<img class="logo-symbol"
     src="assets/logo/underdogs-symbol-black.svg"
     alt=""
     aria-hidden="true"
     style="height: 24px;">
```

> 보조용 심볼은 `aria-hidden="true"`, 메인 wordmark는 `alt="Underdogs"`. 한 페이지에 같은 텍스트 alt가 중복되지 않게 하기 위함.

---

# COMPOSITION PATTERNS — 골라 쓰는 레이아웃 컴포넌트

> 새 레이아웃을 임의로 만들지 말 것. 아래 15개 패턴 안에서 조합한다.

### P1 · Page Head (섹션 시작점)
```html
<header class="page-head">
  <div class="label-stack">
    <p class="kicker">Section Kicker</p>
    <h2 class="section-title">국문 섹션 타이틀<br>두 줄까지</h2>
  </div>
</header>
```
**언제 쓰나**: 모든 본문 섹션의 첫 머리. 2px solid ink 디바이더로 본문과 분리.

### P2 · Hero / Cover
```html
<section class="hero">
  <div class="hero-head">
    <div class="hero-issue">발행정보 <span>발행처</span></div>
    <img class="logo-wordmark" src="assets/logo/underdogs-wordmark-black.svg" alt="Underdogs" style="height: 32px;">
  </div>
  <p class="kicker">시리즈 슬러그</p>
  <h1 class="display en">
    English Display<br>Headline
    <span class="ko">국문 부제 두 줄까지</span>
  </h1>
  <p class="lead" style="max-width: 110mm;">표지 리드 1문단, 120-160자.</p>
</section>
```
**언제 쓰나**: 표지·랜딩 페이지·문서 도입부. wordmark 1회 배치.

### P3 · Split (텍스트 + 이미지)
```html
<div class="split">
  <div class="stack-lg">
    <figure class="image-card" style="min-height: 130mm;">
      <a href="<source-url>" target="_blank">
        <img src="<image-url>" alt="">
      </a>
      <figcaption class="caption">캡션 한 줄</figcaption>
    </figure>
  </div>
  <div class="stack-lg">
    <p class="body">본문 단락.</p>
  </div>
</div>
```
**언제 쓰나**: 시각 + 정보. 좌/우 비율은 `0.92fr 1.08fr`(텍스트 비중 높을 때) 또는 `1fr 1fr`.

### P4 · Grid-2 / Grid-3 / Grid-4
```html
<div class="grid-3">
  <article>...</article>
  <article>...</article>
  <article>...</article>
</div>
```
**언제 쓰나**: 등열 카드(사례·트렌드·지표). 좁아 보이면 컬럼 수를 줄인다(원칙 12).

### P5 · KPI Row (핵심 수치 강조)
```html
<div class="kpi-row">
  <article class="kpi">
    <div class="kpi-num">01</div>
    <h3>지표 제목</h3>
    <p class="small">지표 설명 한 줄.</p>
  </article>
  <article class="kpi"> ... </article>
  <article class="kpi"> ... </article>
</div>
```
**언제 쓰나**: 한 페이지에 핵심 수치 3-4개를 동등하게 보여줘야 할 때.

### P6 · Quote Block
```html
<blockquote class="quote">"인용 문장, 50-90자."</blockquote>
```
**언제 쓰나**: 핵심 메시지 강조. 한 섹션에 1번만 (남용 시 위계 무너짐).

### P7 · Takeaway Box (시사점·체크리스트)
```html
<div class="takeaway">
  <p class="kicker">Reading Point</p>
  <p>한 단락 시사점 80-140자.</p>
</div>
```
**언제 쓰나**: 섹션 마무리, 액션 아이템 강조. 헤더 카피는 자유 ("내일 해볼 일" / "Reading Point" / "Brand Takeaway" 등).

### P8 · Source List (출처)
```html
<div class="source-list">
  <div class="source-item">
    <span class="num">REF 01</span>
    <div>
      <a href="<url>" target="_blank">출처 타이틀</a>
      <span class="desc">한 줄 설명.</span>
    </div>
  </div>
</div>
```
**언제 쓰나**: 본문 출처 2-3개 또는 마지막 페이지의 전체 출처 8-12개.

### P9 · Image Card
```html
<figure class="image-card">
  <a href="<source-url>" target="_blank" aria-label="출처 보기">
    <img src="<image-url>" alt="">
  </a>
  <figcaption class="caption">캡션</figcaption>
</figure>
```
**언제 쓰나**: 이미지+캡션. src가 없으면 a 안에 img 생략 → neutral-60 박스로 fallback.

### P10 · Pill Row (태그·키워드)
```html
<div class="pill-row">
  <span class="pill">keyword 1</span>
  <span class="pill">keyword 2</span>
</div>
```
**언제 쓰나**: 한 섹션의 핵심 키워드 3-5개. 한 페이지에 두 줄을 넘기지 않는다.

### P11 · Poster Display (포스터 메인 카피) ★포스터 전용
```html
<section class="poster" style="background: var(--paper); min-height: 100vh; padding: var(--s-8); display: grid; grid-template-rows: auto 1fr auto;">
  <div style="display:flex; justify-content: space-between; align-items: flex-start;">
    <p class="kicker">POSTER KICKER</p>
    <p class="small">2026.05.18 · UNDERDOGS</p>
  </div>
  <div style="align-self: end;">
    <h1 class="display en">
      ONE MESSAGE<br>POSTER
      <span class="ko">한 줄로 끝나는 핵심 메시지</span>
    </h1>
  </div>
  <div style="display:flex; justify-content: space-between; align-items: flex-end;">
    <img class="logo-wordmark" src="assets/logo/underdogs-wordmark-black.svg" alt="Underdogs">
    <p class="small">서브 정보 한 줄</p>
  </div>
</section>
```
**언제 쓰나**: 포스터(A1–A4, B1–B3) 메인 면. 한 메시지·큰 타이포·여백 중심.

### P12 · Full-bleed Image (풀블리드 이미지 포스터)
```html
<section class="poster" style="position: relative; min-height: 100vh; color: #fff;">
  <img src="assets/cover.jpg" alt="" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:0;">
  <div style="position: relative; z-index: 1; padding: var(--s-8); display: grid; grid-template-rows: auto 1fr auto; min-height: 100vh;">
    <img class="logo-wordmark" src="assets/logo/underdogs-wordmark-white.svg" alt="Underdogs" style="height: 40px;">
    <h1 class="display en" style="align-self: end; color: #fff;">
      Big Statement<span class="ko" style="color:#fff;">큰 메시지</span>
    </h1>
    <p class="small" style="color: rgba(255,255,255,0.7);">캡션 또는 부가 정보 한 줄</p>
  </div>
</section>
```
**언제 쓰나**: 사진 베이스 포스터. wordmark는 흰색 버전 사용.

### P13 · Detail Hero (상세페이지 메인) ★상세페이지 전용
```html
<section class="hero" style="background: var(--paper);">
  <img class="logo-wordmark" src="assets/logo/underdogs-wordmark-black.svg" alt="Underdogs" style="height: 28px; margin-bottom: var(--s-7);">
  <p class="kicker">Campaign / Event</p>
  <h1 class="display en">
    Product Name<span class="ko">제품/서비스 한 줄 설명</span>
  </h1>
  <p class="lead" style="max-width: 60ch; margin-top: var(--s-5);">상세 소개 리드 2–3문장.</p>
  <a class="detail-cta" href="#cta" style="margin-top: var(--s-6);">자세히 보기</a>
</section>
```
**언제 쓰나**: 상세페이지 최상단. 좌측 정렬, 큰 호흡.

### P14 · Section Anchor (긴 페이지의 섹션 구분)
```html
<div style="display: grid; place-items: center; padding: var(--s-7) 0;">
  <img class="logo-symbol" src="assets/logo/underdogs-symbol-black.svg" alt="" aria-hidden="true" style="height: 28px;">
  <hr class="rule" style="width: 80px; margin: var(--s-4) 0 0;">
</div>
```
**언제 쓰나**: 상세페이지·롱스크롤에서 섹션 사이의 시각 쉼표. 심볼이 자연스럽게 들어가는 자리.

### P15 · Card News Frame (정사각 / 세로)
```html
<section class="card" style="aspect-ratio: 1/1; padding: var(--s-7); display: grid; grid-template-rows: auto 1fr auto; background: var(--paper);">
  <p class="kicker">01 / 06</p>
  <h2 class="section-title" style="align-self: center;">한 카드 한 메시지<br>두 줄까지</h2>
  <div style="display:flex; justify-content: space-between; align-items: end;">
    <img class="logo-wordmark" src="assets/logo/underdogs-wordmark-black.svg" alt="Underdogs" style="height: 24px;">
    <p class="small">@underdogs</p>
  </div>
</section>
```
**언제 쓰나**: 인스타·뉴스레터 카드뉴스. 첫 카드만 wordmark, 본문 카드는 symbol로 교체.

### P16 · Tint Box (배경 채운 박스, stroke 없음)
```html
<div class="tint-box">
  <p class="kicker">Section Kicker</p>
  <p class="body">콘텐츠 본문 한 단락.</p>
</div>

<!-- 더 진한 톤 -->
<div class="tint-box is-strong">
  <p class="kicker">Highlight</p>
  <p class="body">강조 카피.</p>
</div>
```
**언제 쓰나**: 랜딩페이지·상세페이지·슬라이드·카드뉴스·메일 HTML — 한 페이지에 여러 메시지를 시각적으로 묶어야 할 때. 텍스트 많은 리포트나 인쇄 포스터는 stroke 박스를 쓰고, 한 산출물에 둘을 섞지 않는다.

**금지 패턴**: `border-top: 2px solid var(--accent)`만 있는 카드, `border-left: 3px solid var(--accent)`만 있는 인용박스 — 모두 "한쪽 모서리 accent line" 패턴이라 사용 금지. 박스가 필요하면 P7(Takeaway, neutral-60 바탕)·P16(Tint Box) 또는 4변 stroke 닫힌 박스로.

---

# FORMAT PROFILES — 매체별 캔버스·여백·타입 스케일

> `project.format` 값이 어느 프로필에 해당하는지 보고 그대로 적용. CSS 변수(:root)는 매체 무관 동일.

## 매체 부류 — Static vs Interactive

산출물은 두 부류로 나뉜다. **이 분류가 hover·transition·animation 허용 여부를 결정한다.**

| 부류 | 매체 | hover·transition·animation |
|---|---|---|
| **Static** | 포스터(A1–A4, B1–B3), 인쇄 리포트(A4/Letter/B5), 슬라이드, 카드뉴스 | ❌ **금지** — PDF/이미지 출력이라 동작 안 함 |
| **Interactive** | 웹 스크롤 리포트, 상세페이지, 랜딩페이지, 메일 HTML | ✅ 허용 — 실제로 동작하는 코드 매체 |

**룰**:
- Static 포맷에서는 `:hover`, `transition`, `@keyframes`, `animation` 일체 쓰지 않는다.
- 링크는 base 스타일(border-bottom 등)만, hover 변화 없음.
- CTA·버튼·카드는 정적 상태(background/color/padding/border)만 정의.
- Interactive 포맷에서는 기존 hover 패턴(`a:hover` accent 전환, CTA bg 전환 등) 그대로 허용.
- `@media (hover: hover)`로 감싸지 말 것 — 부류 자체로 갈린다.

## 리포트·문서 계열

| Format key | 폭 × 높이 | 패딩 | 본문 width | 타입 스케일 | 비고 |
|---|---|---|---|---|---|
| `A4-report` | 210mm × 297mm | 60px 사방 | 본문 ≤ 110mm | 기본(:root) | `@page { size: A4; margin: 0; }` |
| `Letter-report` | 215.9mm × 279.4mm | 60px 사방 | 본문 ≤ 110mm | 기본 | `@page { size: Letter; margin: 0; }` |
| `B5-report` | 176mm × 250mm | 48px 사방 | 본문 ≤ 95mm | 기본 ×0.95 | 작은 판형 — 패딩 축소 |
| `Web-scroll-report` | 100% (max 900px) | 32–48px | 100% | 기본 | 페이지 분리 없음, 섹션 단위 |

## 포스터 계열 (.poster 컨테이너 안에서 작업)

| Format key | 폭 × 높이 | 패딩 | 비고 |
|---|---|---|---|
| `A1-poster` | 594mm × 841mm | 80px 사방 | 대형. 한 메시지·풀블리드 권장 |
| `A2-poster` | 420mm × 594mm | 60px 사방 | 행사·전시 표준 |
| `A3-poster` | 297mm × 420mm | 48px 사방 | 사내 게시·소형 행사 |
| `A4-poster` | 210mm × 297mm | 40px 사방 | 카운터·라운지 게시 |
| `B1-poster` | 707mm × 1000mm | 80px 사방 | 대형 옥외·전시 |
| `B2-poster` | 500mm × 707mm | 60px 사방 | 행사장 안내 |
| `B3-poster` | 353mm × 500mm | 48px 사방 | 매장·라운지 |
| `B4-poster` | 250mm × 353mm | 40px 사방 | 소형 — 텍스트 많은 안내용 |

타입 사이즈(display·body 등)는 고정값을 쓰지 않는다. STEP 0-B에서 찾은 레퍼런스의 비율을 참고하여 캔버스 크기에 맞게 결정한다.

**포스터 공통 규칙**
- 인쇄 포스터는 3mm bleed 영역을 컨테이너 외곽에 두지 않고, `@page`로 잡거나 PDF 출력 시 별도 설정.
- 텍스트는 가장자리에서 최소 padding 만큼 떨어뜨린다 (안전 영역).
- 한 포스터에 메시지 1개. lead 카피는 60–120자 이내.
- wordmark는 1회, symbol은 0–1회. 합쳐서 2개 이하.

## 상세페이지 계열 (.detail-shell 안에서 작업)

| Format key | 폭 | 섹션 패딩 | 본문 width | 비고 |
|---|---|---|---|---|
| `detail-page` | max 1080px | 60–80px 좌우 / 60px 상하 | 본문 ≤ 720px | 이커머스·이벤트·캠페인 페이지 |
| `detail-page-narrow` | max 860px | 48px 좌우 | 본문 ≤ 640px | 모바일 친화 — 매뉴얼·고지문 |

## 슬라이드·카드뉴스 계열

| Format key | 폭 × 높이 | 패딩 | 비고 |
|---|---|---|---|
| `slide-16x9` | 1600px × 900px | 80px 사방 | 한 슬라이드 = 한 메시지 |
| `slide-4x3` | 1600px × 1200px | 80px 사방 | 발표 자료, 인쇄 가능 |
| `card-news-1x1` | 1080px × 1080px | 64px 사방 | 인스타 피드 정사각 |
| `card-news-4x5` | 1080px × 1350px | 64px 사방 | 인스타 피드 세로 |
| `card-news-9x16` | 1080px × 1920px | 80px 사방 | 인스타 스토리·릴스 |

### 카드뉴스·광고소재 모바일 타입 스케일 (필수)

카드뉴스·광고소재는 **모바일 폰 화면에서 소비된다.** 1080px 캔버스는 폰 뷰포트(~375px)에서 약 35%로 축소되므로, A4 리포트용 타입 스케일을 그대로 쓰면 텍스트가 읽히지 않는다.

**캔버스 기준 최솟값 (1080px 폭 기준):**

| 역할 | 최솟값 | 폰 렌더 환산 (~35%) | 비고 |
|---|---|---|---|
| `--type-display` | **110px 이상** | ~38px | 헤드라인이 화면 절반 가까이 차지해야 스크롤 중 시선을 잡는다 |
| `--type-body` | **28px 이상** | ~10px | 서브 카피·CTA 텍스트. 이보다 작으면 모바일에서 읽기 어렵다 |
| `--type-kicker` | **22px 이상** | ~8px | 최소 인지 가능 라인 |
| `--type-caption` | **22px 이상** | ~8px | 푸터·부가 정보 |
| 로고 wordmark height | **36px 이상** | ~13px | 브랜드 인지에 필요한 최소 크기 |

**비율 캐스케이드 조정:** 기본 비율(display/4.0, display/5.1)은 A4 리포트용이다. 카드뉴스·광고소재에서는 본문이 상대적으로 더 커야 하므로 비율을 좁힌다:

```
body    = display / 3.5   (기본 /4.0 대비 약 14% 증가)
kicker  = display / 4.5   (기본 /5.1 대비 약 13% 증가)
caption = display / 4.5
```

**룰**: 카드뉴스·광고소재 작업 시 위 최솟값을 먼저 확인한다. `--type-display: 56px` 같은 A4 기본값을 그대로 복사하지 않는다.

## 박스 언어 매핑 (포맷별)

한 산출물에서 박스 언어 1종만 사용한다. 섞으면 시각 위계가 무너진다.

| 포맷 | 박스 언어 | 이유 |
|---|---|---|
| `A4-report` / `Letter-report` / `B5-report` | **stroke** (1px line / 2px ink) | 텍스트 많고 정보 단위 분리가 중요. 닫힌 박스가 위계 명확. |
| `A4-poster` / `B4-poster` (텍스트 많은 소형 포스터) | **stroke** | 정보형 포스터 — 리포트 언어 유지. |
| `A1` / `A2` / `A3` / `B1` / `B2` / `B3` 포스터 (대형) | 박스 거의 없음 | 타이포·이미지 중심. 박스 쓸 일 자체가 적음. |
| `Web-scroll-report` / `detail-page` | **tint** (neutral 베리에이션 배경) | 한 페이지에 여러 메시지가 흐름으로 묶임. tint가 시각 부담 적음. |
| `slide-16x9` / `slide-4x3` | **tint** | 슬라이드별 message group 묶기에 적합. |
| `card-news-*` (1x1 / 4x5 / 9x16) | **tint** | 모바일 좁은 화면에서 stroke가 시각 부담. |
| 메일 HTML | **tint** | 메일 클라이언트가 stroke·border 렌더링 불안정. |

**컴포넌트 매핑:**
- tint 언어의 기본: P16 (Tint Box) / P7 (Takeaway, neutral-60 바탕) / P6 (Quote, neutral-60 바탕)
- stroke 언어의 기본: P1 (Page Head, 2px 강 디바이더) / P5 (KPI Row, 1px ink 라인) / P9 (Image Card, 닫힌 박스)

---

# FORMAT & LAYOUT GUIDE — 사용자 입력 → 산출물 매핑 룰

> 사용자는 **(1) 형태 (2) 목적 (3) 콘텐츠** 세 가지만 준다. 디자인 시스템이 나머지(레이아웃·여백·타입·로고·컬러)를 자동으로 결정한다.
>
> **핵심 원칙: 콘텐츠는 받은 그대로 사용. 압축·요약·번역·각색·새로 만들기 모두 금지.**

## STEP 0. → Quick Start의 ⛔ MANDATORY GATE 참조

> STEP 0(정보 수집 → 레퍼런스 리서치 → 적용 방향 선언)은 문서 상단 **MANDATORY GATE** 섹션으로 이동했다. 여기까지 읽고 STEP 0을 건너뛴 경우, 지금이라도 돌아가서 GATE 1·2·3을 완료한다.

---

## STEP 1. 형태 → format 매핑

사용자 요청 → `project.format`:

| 사용자가 한 말 | format key |
|---|---|
| "A4 리포트로", "리포트로", "문서로" | `A4-report` (기본) |
| "Letter로", "미국 페이퍼" | `Letter-report` |
| "B5로", "작은 책자" | `B5-report` |
| "웹페이지로", "사이트 스크롤로" | `Web-scroll-report` |
| "A1/A2/A3/A4 포스터" | `A1-poster` ~ `A4-poster` |
| "B1/B2/B3 포스터" | `B1-poster` ~ `B3-poster` |
| "그냥 포스터로" (사이즈 미지정) | `A2-poster` (기본 포스터) |
| "상세페이지", "이벤트 페이지", "랜딩" | `detail-page` |
| "슬라이드로", "PT로", "발표자료" | `slide-16x9` |
| "카드뉴스", "인스타용" | `card-news-1x1` |
| "스토리용", "릴스용" | `card-news-9x16` |

## STEP 2. 목적 → 레이아웃 패턴 선택

목적(=사용 맥락)에 따라 COMPOSITION PATTERNS 중 어떤 조합을 쓸지 결정. **콘텐츠 자체는 수정하지 않는다.**

| 목적 (사용자가 한 말) | 추천 패턴 조합 |
|---|---|
| "모집 공고", "채용", "참가자 모집" | P11 Poster Display + (선택) P4 Grid + P7 Takeaway |
| "이벤트 안내", "행사 알림" | P11 + P10 Pills (날짜·장소) |
| "신제품·서비스 소개" | P13 Detail Hero + P3 Split + P5 KPI |
| "정책·고지 안내" | P1 Page Head + P2 본문 + P8 Source |
| "트렌드·인사이트 리포트" | P2 Cover + P1+P3+P5 본문 + P8 Source |
| "캠페인 비주얼" (포스터 한 장) | P11 단독 또는 P12 Full-bleed |
| "발표자료" | P2 Cover + 슬라이드별 P1/P3/P5/P9 |

## STEP 3. 콘텐츠 위계 매핑 (수정 없이, 자리 배치만)

받은 콘텐츠 중 어떤 게 display/lead/body/caption인지 매핑한다. **카피 자체는 절대 손대지 않는다.**

**자동 추론 룰**:
- 가장 짧고 임팩트 있는 한 줄 → `display` (Primary 100%)
- 시각 무게가 필요한 슬로건·태그라인 → `secondary` (50% 강도, display의 ~55% 크기)
- 한 문단 길이 (60–160자) → `lead` 또는 `body`
- 짧은 부가 정보(날짜·장소·연락처) → `caption` 또는 `pill` 또는 footer 정보
- 핵심 단어(브랜드명·프로그램명) → 같은 카피 안에서 `accent` 컬러 처리

**애매할 때**: 추론으로 결정하지 말고 한 번만 묻는다. "받은 콘텐츠 중 어떤 게 메인 헤드라인이에요?"

콘텐츠 수정 금지 규칙은 Quick Start 상단 참조. 받지 못한 콘텐츠는 임의로 채우지 말고 묻는다.

## STEP 4. 밀도 티어 자동 결정

콘텐츠 블록 수로 결정 (QUALITY SYSTEM 참고):

| 블록 수 | 티어 | 클래스 |
|---|---|---|
| ≤ 4 | sparse | `.density-sparse` |
| 5–7 | standard | (기본값, 클래스 불필요) |
| ≥ 8 | dense | `.density-dense` |

## STEP 5. 로고 배치

`LOGO USAGE → 포맷별 배치 레시피`를 그대로 적용. 절대 빠뜨리지 않는다.

## STEP 6. 보조 요소는 옵트인 (요청 시에만)

- **QR 코드**: 기본 제외. 사용자가 "QR 넣어줘"라고 요청할 때만 footer 우측에 추가.
- **워터마크·발급일시·버전 번호**: 동일하게 옵트인.
- **기본 footer**: `copyright` 한 줄로 충분.

---

# RENDER CONTRACT — 출력 규칙

**공통**
- 출력은 단일 HTML 1개. 외부 CDN 의존 최소화(폰트는 `fonts/` 로컬, 로고는 `assets/logo/` 로컬).
- CSS 변수명·클래스명을 임의로 변경하지 않는다.
- 컬러는 :root 13개 변수에서만 가져온다. 인라인 `#xxxxxx` 색 값 사용 금지 (단, 로고 자체의 fill·이미지 위 캡션의 #fff은 예외).
- 간격은 spacing scale 8개 값에서만 (--s-1 ~ --s-8). 포스터 큰 여백은 정수배만.

**인쇄 매체 PDF 변환**
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="<slug>.pdf" \
  "file://$(pwd)/<slug>.html"
```

**포스터 인쇄 시 추가**
- `@page { size: A2 portrait; margin: 0; }` 같이 정확한 사이즈 지정.
- 본문 컨테이너에 `min-height: 100vh`로 한 화면 채움.
- 3mm bleed가 필요하면 background를 컨테이너 밖까지 끌고 가거나 출력 시 별도 처리.

**상세페이지 / 웹 매체**
- viewport meta: `<meta name="viewport" content="width=device-width, initial-scale=1">`
- 모바일 미디어쿼리는 768px 기준으로만(불필요한 breakpoint 금지).

---

# 검수 체크리스트 (렌더 후 23개)

**디자인 시스템**
- [ ] 모든 색이 :root 변수에서만 왔는가 (인라인 hex 없음, 로고/이미지 캡션 예외)
- [ ] 모든 간격이 spacing_scale 8개 값(또는 정수배)에 속하는가
- [ ] 텍스트 위계가 4단계 이내인가 (kicker / heading / body / caption)
- [ ] 한 화면/페이지가 한 메시지에 집중되는가 (정보 과밀 없음)
- [ ] 포인트 컬러는 `#f05519` 단 하나만 쓰였는가 (다른 채도 컬러 없음)
- [ ] 한글 모든 텍스트에 `word-break: keep-all`이 적용됐는가
- [ ] EN/숫자 = Poppins, KO = NanumHuman 가 한 단어 안에 교차하지 않는가
- [ ] 디바이더는 1px line / 2px ink 두 종류만 쓰였는가
- [ ] 박스가 4변 stroke 또는 4변 tint 둘 중 하나로 통일됐는가 (한쪽 모서리 accent line 박스 금지)
- [ ] 한 산출물에 stroke 박스와 tint 박스가 섞이지 않았는가 (포맷별 박스 언어 표 참고)
- [ ] 둥근 모서리·이모지·아이콘·그라데이션이 없는가 (이미지 위 캡션 예외)
- [ ] 이미지가 없을 때 image-card는 `#D9D9D9`(neutral-0)로 fallback, 캡션 유지
- [ ] accent 컬러는 kicker/label/큰 숫자/강조 라벨에만 (본문 텍스트엔 없음)
- [ ] 출처(P8) 링크가 새 탭에서 열리고 (`target="_blank"`) 1차 출처를 가리키는가

**QUALITY SYSTEM (5가지)**
- [ ] 모든 gap·padding이 `--gap-section / --gap-element / --gap-tight` 3개 토큰만 쓰는가 (임의 px 박지 않음)
- [ ] `--type-display` 1개로 다른 타입이 비율 캐스케이드되는가 (눈대중 사이즈 없음)
- [ ] 컨테이너에 `display: flex; flex-direction: column;` + footer/CTA에 `margin-top: auto` 적용됐는가
- [ ] 페이지에 `density-sparse / standard / dense` 클래스가 1개 붙어 있고 섹션 수에 맞는가
- [ ] **One Loudest** — 시각 강도 100%(display) 요소가 정확히 1개인가, secondary는 3회 이내인가
- [ ] 헤더와 푸터 사이 콘텐츠가 자연 호흡으로 가운데에 떠올라 있는가 (강제 fit 안 함)

**로고·자산**
- [ ] 로고가 4종 SVG 중 최소 1개 이상 배치됐는가 (`assets/logo/...` 참조)
- [ ] 메인 로고는 wordmark이고, symbol은 보조용으로만 쓰였는가 (좁은 자리 또는 wordmark 동행)
- [ ] 로고 주변에 최소 호흡 여백(워드마크 높이 ×0.5, 심볼 높이 ×0.7 이상)이 확보됐는가
