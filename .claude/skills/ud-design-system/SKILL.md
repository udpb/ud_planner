---
name: ud-design-system
description: TRIGGER when creating/editing UI components, choosing colors/fonts/spacing, working on files under src/app/**/*.tsx or src/components/**/*.tsx, adding Tailwind classes, making buttons/cards/modals, or when the user mentions "디자인", "UI", "스타일", "컬러", "폰트". Use this skill to apply Underdogs brand system consistently — font, brand colors, Action Orange ratio, spread/repetition/progress patterns, shadcn/ui + lucide-react, sonner toasts.
---

# 언더독스 UD-Ops 디자인 시스템

**Always apply when producing UI code in this repo.** 다른 디자인 판단(새 컬러·새 폰트·새 그리드 시스템 도입 등)은 금지. 예외가 필요하면 STOP 하고 사용자 확인.

## 1. 폰트

- **기본:** Nanum Gothic (나눔고딕)
- **클래스:** `font-sans`
- **CSS 변수:** `--font-sans`
- **사용 규칙:** 추가 폰트 import 금지. 한글 가독성 우선, 코드·숫자도 동일 폰트.

## 2. 컬러 팔레트

### 메인 — Action Orange
**`#F05519`** — 본사 underdogs.global 과 일치하는 공식 primary (2026-04-15 마이그레이션 완료).
- 내부적으로는 OKLCH `oklch(0.64 0.21 32)` 로 정의 (`src/app/globals.css`).
- `#FF8204` 는 레거시 레퍼런스에만 등장하므로 새 코드에서 사용 금지.

- **클래스:** `bg-primary`, `text-primary`, `border-primary`
- **CSS 변수:** `--ud-orange`
- **비율 제약:** 전체 UI 면적의 **10~15% 이하**. CTA·활성 상태·핵심 강조·아이콘 포인트에만. 배경 전체·큰 블록에 칠하지 않음.

### 오렌지 그라데이션 (본사 사이트 기준)
| 단계 | 컬러 | 용도 |
|------|------|------|
| 100 | `#F05519` | primary, 강조 (Action) |
| 80 | `#F48053` | hover, 2차 강조 |
| 40 | `#F9BBA3` | 배경 틴트 |
| 20 | `#FBD4C5` | 가장 연한 배경, 카드 하이라이트 |

→ `progress-brand` 유틸리티도 이 스케일로 정의되어야 함.

### 서브 컬러
| 용도 | 컬러 | 클래스 |
|------|------|--------|
| 강조 (연한 오렌지, 현행) | `#FFA40D` | `orange-light` |
| 다크/사이드바 | `#373938` | `bg-sidebar`, `text-sidebar-foreground` |
| 회색 | `#D8D4D7` | `gray` |
| 포인트 시안 | `#06A9D0` | `cyan` (가끔 사용) |

### 기본 톤
- **블랙:** `#000000`
- **화이트:** `#FFFFFF`

### 사용 금지
- 임의 컬러 (직접 hex 입력) 금지. 위 팔레트 + shadcn 기본 회색(slate/neutral) + tailwind 기본 상태 컬러(red/green/yellow/blue)만 사용.
- 그라데이션은 위 오렌지 스케일 외 금지.
- 본사 사이트에 없는 오렌지 톤(너무 붉거나 노란) 사용 금지.

## 3. 비주얼 패턴 (UI 일관성 골격)

### 3.1 Spread / Scale — 확장 패턴
- 숫자·지표가 크다는 느낌. 작은 배지 + 큰 숫자 조합.
- 예: 수주율, 코치 수, 누적 성과 — 숫자는 `text-3xl` 이상, 단위는 `text-sm text-muted-foreground`.

### 3.2 Repetition / Alignment — 반복 정렬
- 리스트 아이템은 좌측 컬러 바로 시작되는 패턴.
- **유틸리티:** `border-brand-left` (왼쪽에 2~4px 오렌지 바)
- 카드 리스트, 세션 리스트, 단계 리스트에 사용.

### 3.3 Expansion / Progress — 진행 상태
- 파이프라인 스텝·진행률 표시에 그라데이션.
- **유틸리티:** `progress-brand` (오렌지 → 연한 오렌지 그라데이션)
- 단순 진행 바는 tailwind `bg-primary/20` + `bg-primary` 조합도 OK.

## 4. 레이아웃 규칙

- **라운드 반경:** `--radius: 0.5rem` (= `rounded-md` 기본)
- **컨테이너 여백:** `p-4`, `p-6` 우선. `p-3` 은 밀도 높은 리스트에만.
- **스택 간격:** `space-y-3` / `space-y-4` / `space-y-6` 중 선택. 임의 간격 금지.
- **카드:** `Card` 컴포넌트 기본. 새 박스 스타일 만들지 말 것.
- **사이드바:** 다크 `bg-sidebar` (`#373938`). 메인 컨텐츠는 밝은 배경.

## 5. 컴포넌트 라이브러리

### shadcn/ui
- **위치:** `src/components/ui/`
- **원칙:** 여기 있는 컴포넌트 먼저 사용. 새 shadcn 컴포넌트 추가는 사용자 승인 필요.
- **수정 금지:** 기존 shadcn 파일을 직접 편집하지 않는다. 확장이 필요하면 래퍼 컴포넌트 만들기.

### lucide-react (아이콘)
- **크기:** 기본 `h-4 w-4`, 큰 아이콘 `h-5 w-5`. 임의 크기 금지.
- **컬러:** 기본은 `text-muted-foreground`, 활성·강조는 `text-primary`.
- **새 아이콘 라이브러리 추가 금지.**

### sonner (토스트)
- **성공:** `toast.success('저장됨')`
- **실패:** `toast.error('저장 실패 — X 확인')`
- **긴 작업:** `toast.loading(...)` → `toast.success(...)` 전환
- **금지:** 임의 alert/confirm/브라우저 다이얼로그. 항상 sonner.

## 6. 브랜드 자산 (UI 에 노출되는 숫자·문구)

`src/lib/ud-brand.ts` 의 상수를 **항상** 활용. 하드코딩 금지.

- `UD_TRACK_RECORD` — 코치 800명, 누적 500억, 21,000명 육성 등
- `UD_PROPRIETARY_TOOLS` — ACT-PRENEURSHIP, DOGS, IMPACT 등 (정확한 이름 유지)
- `UD_SUPPORT_LAYERS` — 4중 지원 체계
- `UD_KEY_MESSAGE_PATTERNS` — 정량 포화, 4중 지원 등

`IMPACT` 는 항상 대문자 + "6단계 18모듈 54문항" 이 정식 표기. `DOGS`, `ACT-PRENEURSHIP` 은 하이픈·대소문자 그대로.

## 7. 상태 배지 컨벤션

```
DRAFT       → bg-yellow-100 text-yellow-800
PROPOSAL    → bg-blue-100 text-blue-800
SUBMITTED   → bg-violet-100 text-violet-800
IN_PROGRESS → bg-green-100 text-green-800
COMPLETED   → bg-gray-100 text-gray-700
LOST        → bg-red-100 text-red-700
```

완료/성공 = 초록, 진행 = 파랑/보라, 대기 = 노랑, 실패 = 빨강. 재정의 금지.

## 8. 타이포그래피 스케일

| 용도 | 클래스 |
|------|--------|
| 페이지 제목 | `text-2xl font-bold` |
| 섹션 제목 | `text-lg font-semibold` |
| 카드 제목 | `text-base font-medium` |
| 본문 | `text-sm` |
| 보조 설명 | `text-xs text-muted-foreground` |
| 큰 숫자 (지표) | `text-3xl font-bold` |

## 9. 접근성 최소선

- 모든 버튼에 `aria-label` 또는 명확한 텍스트.
- 컬러만으로 상태 전달 금지 — 아이콘 또는 텍스트 병기.
- 포커스 링 제거 금지. shadcn 기본값 유지.

## 10. 금지 목록 (위반 시 STOP)

1. 새 폰트 import
2. 임의 hex 컬러 직접 입력
3. Action Orange 를 배경 전체에 사용
4. shadcn 컴포넌트 직접 수정
5. 새 아이콘 라이브러리 추가
6. alert / confirm / window.prompt 사용
7. 브랜드 자산 숫자·이름 하드코딩
8. 새 그리드/레이아웃 시스템 도입

## 11. 자주 쓰는 스니펫

### 섹션 헤더
```tsx
<div className="flex items-center justify-between">
  <h2 className="text-lg font-semibold">섹션 제목</h2>
  <Button size="sm">액션</Button>
</div>
```

### 지표 카드
```tsx
<Card>
  <CardContent className="p-4">
    <div className="text-xs text-muted-foreground">누적 수주율</div>
    <div className="text-3xl font-bold">72<span className="text-lg text-muted-foreground">%</span></div>
  </CardContent>
</Card>
```

### 이전 스텝 요약 배너 (파이프라인 전용)
```tsx
<div className="border-brand-left rounded-md bg-muted/40 p-3">
  <div className="text-xs text-muted-foreground">Step 1에서 확정한 컨셉</div>
  <div className="text-sm font-medium">{proposalConcept}</div>
</div>
```

### 상태 배지
```tsx
<span className={cn('rounded px-2 py-0.5 text-xs border', STATUS_COLOR[status])}>
  {STATUS_LABEL[status]}
</span>
```

---

**Single source of truth:** 이 skill · `CLAUDE.md` 디자인 시스템 섹션 · `src/lib/ud-brand.ts` 세 곳이 일치. 충돌 발견 시 보고.
