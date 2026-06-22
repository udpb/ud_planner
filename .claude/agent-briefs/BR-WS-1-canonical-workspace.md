# Brief BR-WS-1 — 정본 3단계 워크스페이스 빌드 (ADR-029, additive)

> **자급자족.** 본 파일 + `CLAUDE.md` + `AGENTS.md` + `docs/glossary.md` + `ud-design-system/SKILL.md` + `docs/decisions/029-canonical-workspace.md`. 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-WS-1-canonical-workspace` |
| Owner | 메인 세션 |
| 작성일 | 2026-06-22 |
| 상태 | 🔲 대기 |
| 관련 ADR | **ADR-029**(정본 워크스페이스) |
| 격리 | ud-ops `feat/sroi-integration` in-place |
| 후속 | BR-WS-2(경쟁 라우트 제거·제안서 하류 재배치) — 이 브리프는 **빌드만, 제거 X** |

## 🎯 Mission
ADR-029의 **단일 정본 워크스페이스 `/projects/[id]` = 3단계(① RFP · ② 프로그램 설계 · ③ 임팩트)**를 빌드한다. **이미 있는 것을 조립**(reuse)하고, 기존 805줄 `page.tsx`의 옛 분기(Deep `?step=`·v3 StageShell·플래그)를 **깨끗한 3단계 렌더로 교체**. **다른 라우트(express·v2·program-design·impact-forecast·brain)는 이 브리프에서 건드리지 마라 — 그대로 둠(BR-WS-2가 제거).**

> 원칙: **엔진 재구현 0.** 각 단계는 기존 컴포넌트 + 서버로드를 재사용. 헷갈리는 옛 쉘 분기만 정리.

## 📋 Context — 조립 재료 (전부 존재)
- **StageLayout**(`src/components/projects/stages/StageLayout.tsx`) — 아코디언/점진공개 기질. **재사용.**
- **① RFP** = `StageS1`(`stages/StageS1.tsx`, StepRfp 래핑) — 재사용.
- **② 설계** = P2 설계 캔버스 = `program-design/_components/program-design-flow.tsx` + 그 서버로드(`program-design/page.tsx` 172줄: loadDesignRules·project·rfpPreview·operatingTypeMeta 등).
- **③ 임팩트** = P1 볼트인 = `impact-forecast/forecast-client.tsx` + 그 서버로드(`impact-forecast/page.tsx` 125줄: project·impactForecast·breakdown).
- 현 `page.tsx`(805줄)의 데이터 로드 헬퍼(prisma project·`buildPipelineContext`·RFP props)는 필요분만 재사용.

## ✅ Prerequisites
- [ ] `StageLayout`·`StageS1`·`program-design-flow.tsx`·`impact-forecast/forecast-client.tsx` 존재
- [ ] ADR-029 정독

## 📖 Read First
1. `CLAUDE.md`·`AGENTS.md`·`ud-design-system/SKILL.md`·`docs/decisions/029-canonical-workspace.md`
2. `src/app/(dashboard)/projects/[id]/page.tsx` (805줄 — 교체 대상. 데이터 로드 패턴 파악, 옛 분기 버림)
3. `src/components/projects/stages/{StageLayout,StageShell,stage-mapping,StageS1}.tsx`(.ts) — 재사용 기질 + 5단계 매핑(3단계로 새로)
4. `src/app/(dashboard)/projects/[id]/program-design/page.tsx` + `_components/program-design-flow.tsx` (② 서버로드+컴포넌트)
5. `src/app/(dashboard)/projects/[id]/impact-forecast/page.tsx` + `forecast-client.tsx` (③ 서버로드+컴포넌트)

## 🎯 Scope
### CAN touch
- `src/components/projects/workspace/**` (신규 — `ProgramWorkspace`(StageLayout 기반 3단계 셸) + `workspace-stages.ts`(3단계 매핑·라벨·done 판정))
- `src/app/(dashboard)/projects/[id]/page.tsx` (3단계 워크스페이스 렌더로 교체 — 깨끗하게)
- (필요 시) `src/lib/projects/load-workspace.ts` (신규 — 3단계 서버로드 조립 헬퍼, 기존 route 로드 재사용)
### MUST NOT touch
- 다른 라우트 파일: `express/`·`v2/`·`program-design/`·`impact-forecast/`·`brain/` (BR-WS-2 영역 — **그대로 둠**)
- 엔진 lib(`src/lib/{program-design,impact,express,coaches,...}`) — 호출·재사용만
- prisma · ai-fallback 시그니처 · `components/ui/**` · manifest
- `program-design-flow.tsx`·`forecast-client.tsx` 내부 로직(임베드만, 필요 시 props 추가는 최소·보고)

## 🛠 Tasks (순서)
1. **3단계 매핑** (`workspace-stages.ts`) — `WorkspaceStageId='rfp'|'design'|'impact'`, 라벨(RFP 분석·프로그램 설계·임팩트), 설명, done 판정(rfp: rfpParsed 있음 / design: plan 진행 / impact: forecast 있음). 하드코딩 라벨 OK(단순 IA 라벨).
2. **`load-workspace.ts`** — `loadWorkspace(projectId, viewerId?)`: 3단계가 필요로 하는 서버 데이터를 **기존 route 로드 재사용**해 한 번에 조립(project·rfpPreview·designRules/operatingTypeMeta·impactForecast/breakdown). 기존 `program-design/page.tsx`·`impact-forecast/page.tsx`의 로드 로직을 그대로 끌어다 씀(중복 구현 최소 — 가능하면 그 파일들이 export 하는 함수 재사용, 없으면 동일 쿼리 복제하되 보고).
3. **`ProgramWorkspace`** (client, `StageLayout` 기반) — 3단계를 아코디언/점진공개로. 각 stage content = ① `StageS1` ② `<ProgramDesignFlow .../>` ③ `<ForecastClient .../>`(임팩트, P1 화면 그대로). currentStage 자동 판정 + ?step/?stage 쿼리로 1회 펼침(StageShell 패턴 차용).
4. **`page.tsx` 교체** — 옛 `?step=` 분기·`isExpressParadigmV3`·`StageShell`(5단계)·PipelineNav 제거하고 **`loadWorkspace` → `<ProgramWorkspace .../>`** 깨끗하게. (다른 라우트 파일은 안 건드림.)
5. 디자인킷 일관(킷 토큰, 목업 톤). 헤더는 기존 Header 재사용.

## 🧪 Self-Verification
- [ ] `npm run typecheck`·`npm run lint`(신규0)·`npm run check:manifest`·`npm run build` 통과 (라우트 `/projects/[id]` 컴파일)
- [ ] `/projects/[id]` 가 3단계(RFP·설계·임팩트)로 렌더 — 옛 6스텝/5스텝 stepper 없음. 각 단계 펼치면 ①RFP ②설계캔버스 ③임팩트 표시.
  - ⚠️ 로컬 DB drift(별건, CLAUDE.md)로 인증/데이터 막히면 **컴파일·구조·스냅샷까지** 보증하고 정직 보고. **백그라운드 dev 금지.**
- [ ] 다른 라우트(express·v2·program-design·impact-forecast·brain) **파일 무변경**(git status 로 확인) — 아직 살아있음(정상, BR-WS-2가 제거)
- [ ] 디자인킷 위반 0 · 엔진 재구현 0 · `git diff --name-only` ⊆ workspace 신규 + page.tsx (+load 헬퍼)

## 📤 Return (5섹션, 한국어): ✅한일 / ❌못한일 / 🤔결정(ADR후보) / 🔬검증(빌드·렌더 실측+git diff --stat) / ⚠️위험

## ⚠️ 주의
- **다른 라우트 제거·수정 금지** — 이 브리프는 *빌드만*. 제거는 BR-WS-2(메인이 새 워크스페이스 검증 후).
- **엔진·각 단계 컴포넌트 내부 재구현 금지** — 조립·임베드만.
- 옛 805줄 page.tsx의 cruft(옛 step 분기·플래그)는 **버린다** — 깨끗한 3단계만. 단 데이터 로드는 필요분 보존.
- 디자인킷 토큰만. 커밋 금지(메인 검수).
