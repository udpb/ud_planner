# Brief BR-WS-16 — 워크스페이스 레이아웃 폴리시 (채팅 비율 + 사이드바 접기, PC 전용)

> **자급자족.** 본 파일 + `ud-design-system/SKILL.md` + `docs/architecture/program-workspace-redesign-v1.md`. 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-WS-16-layout-polish` · 2026-06-25 |
| 격리 | ud-ops `feat/sroi-integration` in-place |

## 🎯 Mission
사용자 UI 피드백(영상 제작 중 목업 기준, **PC 전용**): ① 좌 대화:우 캔버스 **비율 조정**(대화 더 좁게 → 기획이 한눈에 더 잘 보이게), ② 좌측 네비 사이드바를 **interactive하게 접기**(토글 → 아이콘만).

## 📋 위치
- **사이드바** `src/components/layout/sidebar.tsx` — `<aside className="...w-60...">` 고정폭. `(dashboard)/layout.tsx`가 `flex h-screen`(Sidebar + main flex-1) → **사이드바 폭만 줄이면 본문 자동 확장**(layout 무변경).
- **2-pane 비율** `src/components/projects/workspace/ProgramWorkspace.tsx` ~248줄 — 좌 대화 `className="hidden w-2/5 max-w-[520px] shrink-0 md:block"`.

## 🎯 Scope
### CAN touch
- `src/components/layout/sidebar.tsx` (접기: client state + 토글 버튼 + 접힌 스타일 + localStorage 영속)
- `src/components/projects/workspace/ProgramWorkspace.tsx` (대화 pane 폭만 — 캔버스 넓게)
### MUST NOT touch
- `(dashboard)/layout.tsx`(불필요 — flex가 처리) · 엔진·prisma·invokeAi·`components/ui/**`·다른 컴포넌트·다른 라우트

## 🛠 Tasks
1. **사이드바 접기(sidebar.tsx)** — `const [collapsed, setCollapsed] = useState`(초기값 localStorage `ud-sidebar-collapsed`). 
   - 펼침 = `w-60`(기존), 접힘 = `w-16`(아이콘만). `transition-[width] duration-200`.
   - 접힘 시: nav 라벨·children·로고 텍스트 숨김 → 로고는 `UD`만, nav는 아이콘만 가운데 정렬. 아이콘에 `title={label}`(hover 툴팁). active(bg-primary) 유지.
   - **토글 버튼**: 사이드바 하단(또는 로고 옆)에 lucide `PanelLeftClose`(펼침)/`PanelLeft`(접힘) 아이콘 버튼. 클릭 → collapsed 토글 + localStorage 저장. aria-label "사이드바 접기/펼치기".
   - 접힘 시 children 그룹(자산 하위)은 숨김(아이콘만, 클릭 시 그 라우트로). 디자인킷(다크 #373938·accent active·radius 0).
2. **대화:캔버스 비율(ProgramWorkspace.tsx)** — 좌 대화 pane `hidden w-2/5 max-w-[520px] shrink-0 md:block` → **`w-[360px] shrink-0 md:block`**(고정 좁게, 캔버스 `flex-1`이 나머지 차지 → 기획 넓게). PC 전용이라 `hidden ... md:block`은 유지(데스크톱 표시).
3. 디자인킷·접근성(토글 aria-label·active 색) 유지. 애니메이션은 절제(width transition).

## 🧪 Self-Verification
- [ ] `typecheck`·`lint`(신규0)·`check:manifest`·`build` 통과 · `git diff` ⊆ 2파일
- [ ] 사이드바 토글 → w-60↔w-16, 라벨/children 숨김·복원, localStorage 영속(코드 경로)
- [ ] 대화 pane 360px 고정, 캔버스 flex-1 확장
- [ ] ⚠️ 메인이 Vercel 프리뷰+Chrome으로 접기·비율 사후 검수 → **코드 ✓** 보증. 백그라운드 dev 금지.

## 📤 Return (5섹션): ✅한일/❌못한일/🤔결정/🔬검증(`코드 ✓`+git diff/`시각 미확인`)/⚠️위험

## ⚠️ 주의
- 레이아웃 폭만 — 엔진·로직 무변경. layout.tsx 안 건드림(flex가 처리). 커밋 금지(메인 검수·프리뷰 검수).
