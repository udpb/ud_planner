# Brief BR-WS-5 — 전폭 2-pane 워크스페이스 셸 (좌 대화 + 우 캔버스 + 상단 고정 파이프라인)

> **자급자족.** 본 파일 + `CLAUDE.md` + `AGENTS.md` + `ud-design-system/SKILL.md` + `docs/architecture/program-workspace-redesign-v1.md`(§9·§10). 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-WS-5-fullwidth-shell` |
| Owner | 메인 (위임) · 작성 2026-06-23 |
| 상태 | 🔲 대기 |
| 관련 | 사용자 확정 목업 `fullwidth_chat_canvas_workspace`(2026-06-23) · ADR-029 |
| 격리 | ud-ops `feat/sroi-integration` in-place |
| 후속 | **BR-WS-6**(대화→캔버스 직접 변경) — 본 브리프는 **셸·레이아웃·대화 응답까지**. 캔버스 변형은 다음. |

## 🎯 Mission
사용자가 확정한 **전폭 2-pane 워크스페이스 셸**을 빌드한다. 현재 `ProgramWorkspace`(3단계 세로 아코디언, 정적 스크롤)를 **교체**:
- **사이드바·헤더(상단 nav) 유지** (앱 레이아웃 — (dashboard) layout + Header. 건드리지 않음).
- **상단 고정 파이프라인 스텝퍼** (5단계, 안 바뀜): `RFP 분석 → 프로그램 기획 → 코치 매칭 → 예산 자동화 → SROI 예측`. 클릭으로 단계 전환.
- **본문 = 전폭 2-pane, 풀 높이**(페이지 스크롤 X, 각 pane 내부 스크롤):
  - **좌(약 40%): 대화** — 브레인 주도 채팅(메시지 + 입력). 단계 바뀌어도 **하나로 이어짐**.
  - **우(약 60%): 캔버스** — **현재 단계의 산출물**. **기존 컴포넌트 재사용**(아래 매핑).

> ⚠️ **이번 범위 = 셸/레이아웃/캔버스 스왑 + 대화(브레인 응답)까지.** 대화가 캔버스를 **직접 바꾸는** 연결(예: "코칭 비중 높여줘"→커리큘럼 변형)은 **BR-WS-6**. 단, assistant 응답 JSON에 `action?` 자리만 비워둔다(후속 호환).
> ⚠️ **엔진·각 단계 컴포넌트 내부 재구현 0** — 배치·임베드만. 점수판(48/70)·게이트 stepper 신설 금지.

## 📋 Context — 재료 (전부 존재, page.tsx가 이미 조립)
- `src/components/projects/workspace/ProgramWorkspace.tsx` — **교체 대상**(현 3단계 아코디언). props 조립은 `page.tsx`에 있음 — 그 props를 그대로 받아 새 셸로.
- `src/lib/projects/load-workspace.ts` — `WorkspaceData`(project·rfp·intent·design·impact 전부). **재사용**(필요 시 코치/예산 약간 추가 가능).
- 단계별 캔버스 컴포넌트(전부 존재, 임베드만):
  | 파이프라인 단계 | 우 캔버스 컴포넌트 |
  |---|---|
  | **RFP 분석** (발주처 의도 포함) | `StageS1`(stepRfpProps) **+** `PlanningIntent`(intentProps, 기획의도=발주처 의도) |
  | **프로그램 기획** | `ProgramDesignFlow`(designProps) |
  | **코치 매칭** | `AutoRecommendedPool`(`projectId`, mode="inline") |
  | **예산 자동화** | 기존 예산 뷰가 있으면 재사용(검색: `src/components`·`app` 의 budget). **없으면 클린 placeholder** "예산 자동화 — 자동 적산 (준비 중)" + 보고 |
  | **SROI 예측** | `ImpactForecastClient`(impactProps) |
- `src/app/(dashboard)/projects/[id]/page.tsx` — `loadWorkspace` → props 조립 → 현재 `<ProgramWorkspace/>`. 여기서 새 셸로 교체 + 풀높이 레이아웃.
- `invokeAi`(`src/lib/ai-fallback.ts`) — 대화 응답 단일 진입점. Flash 티어(즉답).

## 🎯 Scope
### CAN touch
- `src/components/projects/workspace/ProgramWorkspace.tsx` (전폭 2-pane 셸로 재작성)
- `src/components/projects/workspace/WorkspacePipeline.tsx` (신규 — 상단 5단계 스텝퍼)
- `src/components/projects/workspace/WorkspaceChat.tsx` (신규 — 좌 대화 pane)
- `src/components/projects/workspace/workspace-stages.ts` (5단계 id·라벨·캔버스 매핑로 갱신)
- `src/app/api/projects/[id]/assistant/route.ts` (신규 — invokeAi 대화 응답. POST {message, stage, contextSummary} → {reply, action:null})
- `src/app/(dashboard)/projects/[id]/page.tsx` (풀높이 2-pane 셸 렌더 — props 조립은 기존 재사용)
- (필요 시) `src/lib/projects/load-workspace.ts` (코치/예산 캔버스용 최소 데이터 — 가능하면 무변경)
### MUST NOT touch
- 단계 컴포넌트 내부: `StageS1`·`PlanningIntent`·`ProgramDesignFlow`·`ImpactForecastClient`·`AutoRecommendedPool` (임베드만, props 추가 최소·보고)
- 엔진 lib(`program-design`·`impact`·`planning-intent`·`coaches`) · prisma · `invokeAi` 시그니처 · `components/ui/**` · manifest · 다른 라우트

## 🛠 Tasks
1. **`workspace-stages.ts`** — `WorkspaceStageId = 'rfp'|'design'|'coach'|'budget'|'sroi'`, 라벨(RFP 분석·프로그램 기획·코치 매칭·예산 자동화·SROI 예측), 각 done 판정(rfp: rfpParsed / design: plan·programProfile / coach: 배정 있음 / budget: 예산 있음 / sroi: forecast). currentStage 자동 판정.
2. **`WorkspacePipeline.tsx`** — 상단 가로 스텝퍼 5칸. 현재=accent, 완료=success 체크, 클릭→ onSelect(stageId). overflow-x auto. 디자인킷.
3. **`WorkspaceChat.tsx`** — 좌 pane. 메시지 리스트(브레인/PM 말풍선) + 하단 입력. 전송 → `/api/projects/[id]/assistant` POST {message, stage, contextSummary} → reply 추가. 메시지는 **client state**(이번엔 영속 X — 새로고침 리셋, 주석 명시). 로딩·에러 토스트. 브레인 말풍선 = accent 아이콘.
4. **`assistant` route** — `requireProjectAccess` 가드. invokeAi(Flash)로 **단계 인지 대화 응답**(시스템 맥락: "너는 언더독스 기획 보조. 현재 단계=X. PM이 기획을 디벨롭하도록 돕되, 이번 버전은 안내·해석만(캔버스 직접 변경은 다음)"). 반환 `{ reply: string, action: null }`(action 자리만 비움). 외부 LLM 0.
5. **`ProgramWorkspace`(재작성)** — 전폭 2-pane: 좌 `WorkspaceChat`(고정폭/비율 ~40%, 내부 스크롤), 우 캔버스(현재 stage 컴포넌트, 내부 스크롤). 상단 `WorkspacePipeline`. currentStage state + 스텝 클릭 전환(?stage= 1회 펼침 호환). 캔버스 컴포넌트는 위 매핑대로 **조립만**.
6. **`page.tsx`** — 풀높이 레이아웃(`h-[calc(100vh-...)]` 또는 flex-1 min-h-0), Header·메타 strip 유지. `<ProgramWorkspace .../>`에 기존 props(stepRfpProps·intentProps·designProps·impactProps + projectId) 전달.
7. 디자인킷 260529: 사이드바 다크 #373938 유지, accent #F05519 1개, radius 0, 틴트. 목업 `fullwidth_chat_canvas_workspace` 톤.

## 🧪 Self-Verification
- [ ] `typecheck`·`lint`(신규0)·`check:manifest`·`build` 통과
- [ ] `git diff --name-only` ⊆ CAN touch. 단계 컴포넌트 내부·엔진·prisma·invokeAi 시그·ui 무변경.
- [ ] `/projects/[id]`가 **전폭 2-pane**(좌 대화·우 캔버스) + 상단 5단계 스텝퍼로 렌더. 세로 아코디언 없음. 스텝 클릭 시 우 캔버스만 바뀜.
- [ ] 대화 입력 → assistant 응답 1턴 왕복(엔진 0, invokeAi Flash). 캔버스 변형은 **아직 없음**(정상 — BR-WS-6).
- [ ] ⚠️ 메인이 Vercel 프리뷰+Chrome으로 사후 시각검수 → **코드 ✓**만 보증. 백그라운드 dev 금지.

## 📤 Return (5섹션): ✅한일/❌못한일/🤔결정(ADR후보)/🔬검증(`코드 ✓`+git diff --stat / `시각 미확인`)/⚠️위험

## ⚠️ 주의
- 셸·배치만. 단계 컴포넌트·엔진 내부 재구현 0. 대화는 이번엔 **응답까지**(캔버스 변경 X).
- 사이드바·헤더(상단 nav) 유지. 점수판 신설 금지. 스키마 변경 0(대화 client state).
- 커밋 금지(메인 검수·프리뷰 검수).
