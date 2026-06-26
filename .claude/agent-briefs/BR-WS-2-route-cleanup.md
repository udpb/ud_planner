# Brief BR-WS-2 — 경쟁 라우트 제거 (ADR-029 마무리 · 단일 워크스페이스만)

> **자급자족.** 본 파일 + survey 사실(아래) + ADR-029. 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-WS-2-route-cleanup` · 2026-06-26 |
| 격리 | ud-ops `feat/sroi-integration` in-place |
| 근거 | **ADR-029** — 단일 정본 워크스페이스 `/projects/[id]`. 경쟁 진입점 제거, **엔진/재사용 컴포넌트 보존**. |

## 🎯 Mission
경쟁 라우트 **진입점(page)** 제거 + 그리로 가는 nav 링크를 정본 워크스페이스로 재지정. **워크스페이스가 재사용하는 컴포넌트는 절대 삭제 금지**(현 위치 유지 — 재배치 안 함, 저위험).

## 📋 현재 (survey 확정)
- **재사용(보존 필수)**: `program-design/_components/program-design-flow.tsx`(+그 transitive: structure-view·operating-type-meta·planning-elements 등) ← ProgramWorkspace·load-workspace·page.tsx 가 import. `impact-forecast/forecast-client.tsx` ← ProgramWorkspace import.
- **경쟁 진입점(제거 대상 page)**: `express/page.tsx` · `brain/page.tsx` · `(workspace)/projects/[id]/v2/`(page+v2-shell) · `program-design/page.tsx` · `impact-forecast/page.tsx`.
- **nav 링크(재지정)**: `new/actions.ts` L70 redirect `/express`→`/projects/[id]` (신규생성 깨짐 방지·최우선) · `step-impact.tsx` L442·466 `/impact-forecast`→`?stage=sroi` · `ExpressShell.tsx` L943 동일 · `StageS5.tsx` L75 동일 · `BrainDock.tsx` L144 `/brain` 링크 제거(라우트 삭제) · 사이드바/기타 `/express`·`/brain` 링크.
- `?stage=sroi` 라우팅은 이미 작동(`workspace-stages.ts` mapQueryToWorkspaceStage).

## 🎯 Scope
### CAN touch (삭제 + 링크 수정만)
- **삭제**: `src/app/(dashboard)/projects/[id]/express/` · `brain/` · `program-design/page.tsx` · `impact-forecast/page.tsx` · `src/app/(workspace)/projects/[id]/v2/`
- **링크 수정**: `src/app/(dashboard)/projects/new/actions.ts` · `…/[id]/step-impact.tsx` · `src/components/express/ExpressShell.tsx` · `src/components/projects/stages/StageS5.tsx` · `src/components/shell/BrainDock.tsx` (+ grep로 발견되는 `/express`·`/brain`·`/v2` 잔여 링크)
### MUST NOT touch (보존)
- `program-design/_components/**`(전부 — program-design-flow 와 그 의존) · `impact-forecast/forecast-client.tsx` · `ProgramWorkspace`·`load-workspace`·정본 `page.tsx`(import 경로 유지) · 엔진(`src/lib/**`) · prisma · `components/ui/**`
- **컴포넌트 재배치 금지**(import 경로 그대로 — page만 지우면 _components 는 라우트 아닌 모듈로 남아 정상)

## 🛠 Tasks
1. **신규 생성 redirect 우선 수정** — `new/actions.ts` L70 `/projects/${id}/express` → `/projects/${id}`. (안 고치면 새 프로젝트 404.)
2. **경쟁 page 삭제** — express/·brain/ 폴더, program-design/page.tsx, impact-forecast/page.tsx, (workspace)/…/v2/ 폴더 삭제. **`_components`·`forecast-client.tsx`는 남긴다**(삭제 금지 — 워크스페이스가 씀).
3. **nav 링크 재지정** — 위 목록 + `grep -rn "/express\|/brain\|/v2\|/impact-forecast\|/program-design" src` 로 잔여 `href`/`redirect`/`router.push`/`Link` 전수 → 정본(`/projects/[id]` 또는 `?stage=sroi`/`?stage=design`)로. 삭제된 라우트로 가는 링크 0이어야 함.
4. **BrainDock** — 브레인 라우트 버튼 제거(또는 비표시). 사이드바에 죽은 링크 남기지 말 것.
5. **죽은 import 점검** — 삭제 후 `grep`로 삭제 파일을 import 하는 곳 없는지 확인(있으면 STOP·보고 — 재사용인데 survey가 놓친 것일 수 있음).

## 🧪 Self-Verification
- [ ] `typecheck`·`lint`(신규0)·`check:manifest`·**`build` 통과**(가장 중요 — 깨진 import·라우트 즉시 드러남) · `git diff --stat`로 삭제/수정 범위 ⊆ Scope
- [ ] 정본 워크스페이스 `/projects/[id]` page 빌드 OK, 5단계 캔버스(design=program-design-flow, sroi=forecast-client) import 유지.
- [ ] `grep`상 삭제 라우트(`/express`·`/brain`·`/v2`)로 가는 링크 0. 신규생성 redirect=`/projects/[id]`.
- [ ] 삭제된 page 를 import 하는 모듈 0(pages 는 본래 미import — 확인).
- [ ] ⚠️ 메인이 프리뷰+Chrome 으로 신규생성→워크스페이스 진입·5단계·삭제 라우트 404/redirect 사후 검수 → **코드 ✓**. 백그라운드 dev·커밋 금지.

## 📤 Return (5섹션): ✅한일/❌못한일/🤔결정/🔬검증(`코드 ✓`+`git diff --stat`/`시각 미확인`)/⚠️위험
- 삭제 파일 목록·재지정 링크 목록 명시. 보존 컴포넌트 확인.

## ⚠️ 주의
- **재사용 컴포넌트 삭제 절대 금지**(program-design/_components/**·forecast-client). page 진입점만 제거. 재배치 안 함. 빌드 깨지면 STOP. 커밋은 메인.
