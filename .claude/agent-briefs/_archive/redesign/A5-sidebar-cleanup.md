# A5 Brief: 사이드바 정리

## 🎯 Mission (1 sentence)
`src/components/layout/sidebar.tsx` 의 `navItems` 배열에서 자산 관리용 항목을 제거하고, `/ingest` 항목을 추가한다. 기존 항목 링크가 프로젝트 내부로 이동했다는 것을 반영하는 간단한 정리 작업.

## 📋 Context

**왜 이 작업이 필요한가.** 재설계 후 코치·모듈·예산기준·SROI 프록시 관리는 "프로젝트 컨텍스트 안에서 자동 로드"되도록 재배치됨. 사이드바에서 이들 별도 페이지 항목은 중복·혼란 유발. Admin 전용 자산 관리는 향후 `/admin` 경로로 통합 (이 작업에서는 건드리지 않음).

**무엇이 없는 상태인가.** 현재 사이드바 항목:
```
대시보드 / 프로젝트 / 코치 DB / 교육 모듈 / 피드백 관리 / 예산 기준 / SROI 프록시 / 설정
```

## ✅ Prerequisites
1. 작업 디렉토리: `c:\Users\USER\projects\ud-ops-workspace`
2. `src/components/layout/sidebar.tsx` 존재
3. `npm run build` 현재 통과
4. `lucide-react` 설치됨

실패 시 STOP.

## 📖 Read These Files First

1. `CLAUDE.md` — 디자인 시스템 (컬러·폰트)
2. `src/components/layout/sidebar.tsx` 전체
3. `src/app/(dashboard)/layout.tsx` — 사이드바가 어떻게 쓰이는지
4. `ROADMAP.md` Phase A5 조항
5. 기존 페이지 위치 확인:
   - `/coaches` — 삭제 대상 (실제 파일은 남기되 사이드바 링크만 제거)
   - `/modules`
   - `/budget`
   - `/sroi`
   - `/feedback` — 외부 참여자 피드백 페이지는 그대로 둠 (사이드바 항목만 제거)

## 🎯 Scope

### ✅ You CAN touch
- `src/components/layout/sidebar.tsx` — `navItems` 배열 및 관련 import만

### ❌ You MUST NOT touch
- `src/app/(dashboard)/coaches/` 등 실제 페이지 파일 — 사이드바 링크만 제거, 페이지 자체는 유지
- `src/app/api/*` — API 유지
- 다른 layout 파일
- shadcn/ui 컴포넌트
- Prisma, 다른 lib 파일

## 🛠 Tasks

### Step 1: navItems 재구성

`src/components/layout/sidebar.tsx` 의 `navItems` 배열을 다음으로 변경:

```typescript
const navItems = [
  { href: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { href: '/projects', label: '프로젝트', icon: FolderKanban },
  { href: '/ingest', label: '자료 업로드', icon: Upload },
  { href: '/settings', label: '설정', icon: Settings },
]
```

### Step 2: import 정리

제거된 항목에서 쓰던 import 중 **다른 곳에서 안 쓰는** 것만 제거:
- `Users` — 사이드바 외 사용 여부 확인 후 판단
- `BookOpen`, `Calculator`, `BarChart3`, `RefreshCw`, `MessageSquare` — 사이드바 외 사용 없으면 제거

**`Upload` icon 추가** (lucide-react 내장).

### Step 3: 검증

```bash
npm run build
```

빌드 통과 + 개발 서버에서 사이드바 렌더링 확인.

## 🔒 Tech Constraints

- **디자인 변경 금지** — 레이아웃·색상·타이포그래피 건드리지 않음
- **항목 순서** — 위 순서 그대로
- **의존성 추가 금지** — `Upload` 는 lucide-react 기존 설치에 이미 있음

## ✔️ Definition of Done

- [ ] navItems 배열이 위 4개 항목으로 구성됨
- [ ] 쓰이지 않는 lucide 아이콘 import 제거
- [ ] `Upload` icon import 추가
- [ ] 기존 페이지 파일 건드리지 않음 (git diff로 확인)
- [ ] `npm run build` 통과
- [ ] 로고·스타일 등 사이드바의 나머지 구조는 그대로

## 📤 Return Format

```
A5 사이드바 정리 완료.

변경 파일:
- src/components/layout/sidebar.tsx

navItems 변경:
- 제거: /coaches, /modules, /feedback, /budget, /sroi
- 추가: /ingest (자료 업로드, Upload 아이콘)
- 유지: /dashboard, /projects, /settings

Import 정리:
- 제거: [실제로 제거한 아이콘 목록]
- 추가: Upload

검증:
- npm run build: ✅
- 사이드바 렌더링 확인: [확인 여부]

주의: /ingest 페이지 자체는 A4 에이전트가 생성. 이 작업은 링크만 추가.
제거된 기존 페이지(/coaches 등)는 파일이 남아있음. 나중에 Admin 통합 시 정리 필요.
```

## 🚫 Do NOT

- 페이지 파일 삭제 금지 (링크만 제거)
- 사이드바 스타일 변경 금지
- 새 컴포넌트 생성 금지
- 의존성 추가 금지

## 💡 Hints

- `Upload` 아이콘은 `lucide-react` 에 포함됨
- `navItems` 배열 외 다른 로직은 건드리지 않으면 됨 — 매우 작은 작업
- grep으로 `Users`, `BookOpen` 등 아이콘 사용처 확인하여 안전하게 제거

## 🏁 Final Note

5분짜리 작업. 작은 변경이지만 A4의 `/ingest` 가 접근 가능해지려면 이 링크가 필요. A4 와 독립 실행 가능.
