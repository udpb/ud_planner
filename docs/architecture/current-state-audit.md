# 기존 코드베이스 감사 — 유지 vs 고도화 vs 제거

> **작성일:** 2026-04-15
> **목적:** 재설계 Phase A~F 진행 중 "기존 자산을 어떻게 다룰지" 를 파일 단위로 명시. 에이전트·개발자가 이 문서를 근거로 판단.
>
> **핵심 원칙:** 가능한 한 유지·고도화. 제거는 "유지 비용 > 재작성 비용" 인 경우만.

## 0. 판정 기준

각 파일/모듈은 다음 4개 중 하나로 분류:

| 판정 | 의미 | 액션 |
|------|------|------|
| **✅ KEEP** | 그대로 유지, 큰 변경 없음 | 건드리지 말 것 |
| **⚡ UPGRADE** | 유지하되 해당 Phase 에서 기능 확장 | 지정 Phase 에서 수정 |
| **🔧 REWORK** | 구조는 유지하되 내부 로직 재설계 | 지정 Phase 에서 재작업 |
| **❌ REMOVE** | 제거. 대체 모듈이 이미 있거나 Phase 완료 후 대체됨 | 지정 Phase 에서 삭제 |

---

## 1. `src/lib/` — 핵심 라이브러리

| 파일 | 판정 | 사유 / 액션 |
|------|------|------------|
| `ud-brand.ts` | **✅ KEEP** | 브랜드 자산 단일 소스. 수주 제안서 2건 기반. 절대 건드리지 말 것. 새 상수 추가는 OK. |
| `claude.ts` | **⚡ UPGRADE** | AI 호출 핵심. Phase B 에서 `planning-direction` 함수 추가, Phase C 에서 `PipelineContext` 주입 패턴 도입. `safeParseJson` 은 유지. |
| `curriculum-rules.ts` | **⚡ UPGRADE** | Gate 2 룰 엔진의 선배. Phase C~D 에서 예산·임팩트·제안서 룰도 같은 패턴으로 추가(`budget-rules.ts`, `impact-rules.ts`, `proposal-rules.ts`). |
| `planning-score.ts` | **⚡ UPGRADE** | 예상 점수의 선배. Phase D4 예상 점수 시스템이 이를 확장 — Step 완료 시점별 점수 + 제안서 AI 시뮬레이션. |
| `planning-agent/` | **✅ KEEP** | 별도 트랙 (PLANNING_AGENT_ROADMAP.md). 이번 재설계는 이 폴더 건드리지 않음. Phase A3 가 manifest.ts 만 추가. |
| `prisma.ts` | **✅ KEEP** | Prisma singleton. 수정 금지. |
| `utils.ts` | **✅ KEEP** | `cn()` helper. 수정 금지. |
| `auth.ts` | **✅ KEEP** | NextAuth 설정. 수정 금지. |
| `excel.ts`, `google-sheets.ts` | **⚡ UPGRADE** | 기존 시트 내보내기. Phase E5 에서 `curriculum-ingest` 가 역방향(시트 파싱)으로 확장 사용. |

**신규 예정:**
- `src/lib/pipeline-context.ts` — Phase A2
- `src/lib/ingestion/` — Phase A4 (뼈대), Phase D 에서 워커 확장
- `src/lib/budget-rules.ts`, `impact-rules.ts`, `proposal-rules.ts` — Phase C~D
- `src/lib/predicted-score.ts` — Phase D4

---

## 2. `src/app/(dashboard)/` — 페이지

### 2.1 유지 (프로젝트 주 경로)
| 경로 | 판정 | 액션 |
|------|------|------|
| `dashboard/` | **✅ KEEP** | 메인 대시보드. 추후 예상 점수·Ingestion 상태 위젯 추가 가능하나 이번 재설계에선 건드리지 않음. |
| `projects/` (목록) | **✅ KEEP** | 기획 진행률 도트. 유지. |
| `projects/[id]/` | **각 파일 개별 판정 — §3 참조** | — |
| `settings/` | **✅ KEEP** | 설정 페이지. 수정 금지. |

### 2.2 제거 — 자산 관리 별도 페이지 5개
이 페이지들은 **독립 자산 관리** 목적이었으나, 재설계 철학("내부 자산은 자동으로 올라온다")에 반함. 관리가 필요하면 Admin 경로(`/admin/*`)로 이전 — 단, 이번 재설계에선 Admin UI 까지 만들지 않음. 따라서 **페이지 삭제 + API 는 유지**.

| 경로 | 판정 | Phase | 사유 |
|------|------|-------|------|
| `coaches/` | **❌ REMOVE** | Phase E2 | Planning Agent Phase 5 Coach Finder UI (`src/app/(lab)/coach-finder/` 예정)가 이를 대체. 이번 재설계에서는 A5 로 사이드바 링크만 제거, 실제 파일 삭제는 Coach Finder 통합 시점(Planning Agent 트랙). 지금은 Orphan 상태로 방치 가능. |
| `modules/` | **❌ REMOVE** | Phase E1 | 프로젝트 내부 자동 추천으로 흡수. 페이지 삭제는 E1 완료 후. 지금은 사이드바에서만 제거(A5). |
| `feedback/` | **❌ REMOVE** | Phase F | 관리용. 외부 참여자 경로 `/feedback/[projectId]` 는 **유지** (서비스 동작에 필요). 관리 뷰는 Admin 경로로 이전 혹은 Step 3/4 안으로 흡수. |
| `sroi/` | **❌ REMOVE** | Phase E3 | Step 4 (예산+SROI) 내부로 통합. E3 완료 후 페이지 삭제. |
| `feedback/[projectId]` (외부 참여자 경로) | **✅ KEEP** | — | 공개 피드백 경로. 절대 삭제 금지. |

**주의:** 삭제 타이밍은 **대체 기능이 실제로 돌아간 후**. 지금 삭제하면 기능 공백 발생.

---

## 3. `src/app/(dashboard)/projects/[id]/` — 파이프라인 스텝 UI

이 폴더가 재설계의 중심. 파일별 판정:

| 파일 | 판정 | 액션 | Phase |
|------|------|------|-------|
| `page.tsx` | **🔧 REWORK** | A1: 스텝 순서 재배치 (rfp→curriculum→coaches→budget→impact→proposal). A2: PipelineContext 로드 후 각 스텝에 props 전달. A3: `manifest.ts` 는 co-locate (별도 파일). | A1/A2/A3 |
| `pipeline-nav.tsx` | **✅ KEEP** | 네비 로직은 그대로. A1 에서 steps 배열 순서만 page.tsx 에서 변경. 이 파일 자체는 거의 안 건드림. | — |
| `project-edit-form.tsx` | **✅ KEEP** | 프로젝트 메타 편집. 유지. |
| `rfp-parser.tsx` | **⚡ UPGRADE** | RFP 파싱 UI. Phase B1 에서 "기획 방향 생성" 버튼·결과 패널 병합. 내부 로직은 유지. | B1 |
| `step-rfp.tsx` | **🔧 REWORK** | Step 1 고도화. 3컬럼 레이아웃(파싱결과 / 기획방향 / PM 가이드). 제안배경·컨셉·핵심포인트·평가전략·유사프로젝트 영역 추가. 기존 파싱 UI 는 유지하되 레이아웃 재구성. | B1~B4 |
| `curriculum-board.tsx` | **⚡ UPGRADE** | 커리큘럼 UI. Phase C1 에서 PipelineContext 주입, Phase D3 에서 PM 가이드 패널, Phase E1 에서 IMPACT 모듈 자동 추천 사이드패널 추가. 기존 DnD/편집 UI 유지. | C1/D3/E1 |
| `coach-assign.tsx` | **⚡ UPGRADE** | 코치 배정. Phase E2 에서 세션별 자동 추천, Phase 5 통합 시점에 Coach Finder UI 와 연결. | E2 |
| `budget-dashboard.tsx` | **⚡ UPGRADE** | 예산 UI. Phase E3 에서 SROI 통합, 유사 프로젝트 벤치마크. 기존 계산 로직 유지. | E3 |
| `step-impact.tsx` | **🔧 REWORK** | **가장 큰 재작업.** Activity 수동 입력 UI 제거, 커리큘럼에서 자동 추출 뷰로 변경. Outcome/Impact 는 AI 생성 + PM 검토. 측정 계획 자동 생성 추가. | E4 |
| `step-proposal.tsx` | **🔧 REWORK** | 제안서 생성. Phase C3 에서 PipelineContext 전체 주입, Phase D5 에서 평가 시뮬레이션 Gate 3 통합. 섹션별 재생성 로직은 유지. | C3/D5 |

**재작업 원칙:**
- 기존 UI·UX 패턴은 최대한 유지 (사용자가 익숙한 흐름).
- 로직·데이터 소스만 재설계 — "데이터를 PipelineContext 로 바꾸고, AI 호출 때 기존 자산 주입".
- 단계적 적용 가능 — 한 스텝씩 교체.

---

## 4. `src/app/api/` — API 라우트

| 경로 | 판정 | 액션 | Phase |
|------|------|------|-------|
| `admin/import/` | **✅ KEEP** | 시드·임포트 용. 유지. |
| `agent/` | **✅ KEEP** | Planning Agent 트랙. 유지. |
| `ai/parse-rfp/` | **⚡ UPGRADE** | Phase B1 에서 `/api/ai/planning-direction` 과 프롬프트 공유 가능. 파싱 자체는 유지. | B1 |
| `ai/logic-model/` | **🔧 REWORK** | Phase E4 에서 커리큘럼 자동 추출 로직 추가. 기존 함수는 유지 (fallback). | E4 |
| `ai/curriculum/` | **⚡ UPGRADE** | Phase C1 에서 PipelineContext(rfp+strategy) 주입. 프롬프트 강화. | C1 |
| `ai/proposal/` | **🔧 REWORK** | Phase C3 에서 전체 context 주입, Phase D5 에서 평가 시뮬. | C3/D5 |
| `ai/suggest-impact-goal/` | **✅ KEEP** | 임팩트 목표 제안. 유지. |
| `auth/` | **✅ KEEP** | NextAuth. 수정 금지. |
| `budget/` | **✅ KEEP** | 예산 CRUD. 유지. |
| `coach-assignments/` | **✅ KEEP** | 유지. |
| `coaches/` | **✅ KEEP** | 코치 API. 페이지는 제거하지만 API 는 내부 모듈이 계속 사용. |
| `curriculum/` | **✅ KEEP** | 커리큘럼 CRUD. 유지. |
| `feedback/` | **✅ KEEP** | 외부 피드백 수집. 유지 필수. |
| `modules/` | **✅ KEEP** | IMPACT 모듈 조회용. 페이지는 제거하지만 API 는 Step 2 가 사용. |
| `projects/` | **⚡ UPGRADE** | Phase A2 에서 `[id]/pipeline-context` 하위 라우트 추가. 기존 라우트 유지. | A2 |
| `sheets/` | **✅ KEEP** | Google Sheets 연동. 유지. |

**신규 예정:**
- `api/projects/[id]/pipeline-context/` — A2
- `api/projects/[id]/similar/` — B2
- `api/ai/planning-direction/` — B1
- `api/ingest/` + `api/ingest/[id]/` — A4, D
- `api/coaches/recommend/` — E2
- `api/ai/predict-score/` — D4

---

## 5. `src/components/projects/` — 프로젝트 서브 컴포넌트

| 파일 | 판정 | 액션 |
|------|------|------|
| `data-flow-banner.tsx` | **⚡ UPGRADE** | **핵심 재활용 자산.** 신 설계의 "이전 스텝 요약 배너"에 정확히 부합. Phase C4 에서 각 스텝 상단에 활용. Props 구조가 이미 적절 — 그대로 사용. |
| `planning-scorecard.tsx` | **⚡ UPGRADE** | 예상 점수 UI 선배. Phase D4 에서 파이프라인 상단 점수 바로 확장. |
| `agent-interview-panel.tsx` | **✅ KEEP** | Planning Agent 인터뷰 UI. 유지. |
| `research-panel.tsx` | **✅ KEEP** | 외부 리서치 패널. Phase C (PipelineContext.research) 와 연동. |
| `strategy-panel.tsx` | **✅ KEEP** | 전략 패널. PipelineContext.strategy 와 연결 확장 가능. |

**신규 예정:**
- `src/components/projects/step-guide-panel.tsx` — D3 PM 가이드 패널
- `src/components/projects/predicted-score-bar.tsx` — D4

---

## 6. `src/components/layout/`, `src/components/ui/`, `src/components/coaches/`

| 경로 | 판정 | 액션 |
|------|------|------|
| `layout/header.tsx` | **✅ KEEP** | 헤더. 수정 금지. |
| `layout/sidebar.tsx` | **⚡ UPGRADE** | A5 가 navItems 정리. 나머지 유지. |
| `ui/*` | **✅ KEEP** | shadcn. 절대 수정 금지. 새 shadcn 컴포넌트 추가는 사용자 승인. |
| `coaches/` (빈 폴더) | **❌ REMOVE** | 빈 폴더 삭제 or Phase 5 에서 Coach Finder 컴포넌트가 여기로 들어옴 — 결정은 Planning Agent 트랙에서. 이번 재설계는 건드리지 않음. |

---

## 7. `prisma/schema.prisma` — 데이터 모델 (37개)

### 유지 그룹 (모두 KEEP)
- NextAuth: `User`, `Account`, `Session`
- 코어: `Coach`, `Module`, `Project`, `CurriculumItem`, `CoachAssignment`, `Budget`, `BudgetItem`, `Expense`, `Task`, `TaskAssignee`, `Participant`, `ProposalSection`
- 자산: `CostStandard`, `SroiProxy`, `TargetPreset`, `ImpactModule`, `Content`, `ContentMapping`, `DesignRule`, `AudienceProfile`, `WeightSuggestion`, `InternalLaborRate`, `ServiceProduct`
- 참여자 관련: `Applicant`, `DogsResult`, `ActtResult`, `StartupStatusRecord`, `StartupDiagnosis`, `SatisfactionLog`, `SatisfactionResponse`, `CoachingJournal`, `AlumniRecord`
- Planning Agent: `AgentSession`, `PlanningIntentRecord`, `PMFeedback`

### 필드 추가 (UPGRADE)
`Project` 모델에 다음 필드 추가 필요 (Phase A~D 에 걸쳐):
- `proposalBackground: String?` — Phase B
- `proposalConcept: String?` — Phase B
- `keyPlanningPoints: Json?` — Phase B
- `evalStrategy: Json?` — Phase B
- `designRationale: String?` — 이미 있는지 확인 필요
- `measurementPlan: Json?` — Phase E4
- `predictedScore: Float?` — Phase D4

### 신규 모델
- `IngestionJob`, `ExtractedItem` — Phase A4
- `WinningPattern` — Phase D1
- `ChannelPreset` — Phase D2
- `CurriculumArchetype` — Phase E5
- `EvaluatorQuestion` — Phase E6
- `StrategyNote` — Phase F
- `QualityMetric` — Phase F (대시보드용)

---

## 8. `src/app/(lab)/` — 격리 라우트 (Planning Agent 트랙)

| 경로 | 판정 | 액션 |
|------|------|------|
| `agent-test/` | **✅ KEEP** | Planning Agent 테스트 UI. 이번 재설계는 건드리지 않음. |
| `coach-finder/` (미래) | — | Planning Agent Phase 5 에서 생성 예정. |

---

## 9. 루트 파일

| 파일 | 판정 | 액션 |
|------|------|------|
| `middleware.ts` | **✅ KEEP** | 인증 미들웨어. 유지. |
| `layout.tsx`, `page.tsx` (root) | **✅ KEEP** | 수정 금지. |
| `globals.css` | **⚡ UPGRADE** | 브랜드 유틸리티 추가 가능 (`border-brand-left`, `progress-brand` 등). 기존 토큰 건드리지 말 것. |

---

## 10. 즉시 제거 가능 / 유보 목록

### 즉시 제거 (Phase A 에 안전하게 삭제 가능)
- 없음. 모든 제거 대상은 대체 기능 완료 후에만 삭제.

### Phase E 완료 후 제거 대상
- `src/app/(dashboard)/modules/` (E1 후)
- `src/app/(dashboard)/coaches/` (Planning Agent Phase 5 통합 후)
- `src/app/(dashboard)/sroi/` (E3 후)

### Phase F 완료 후 제거 대상
- `src/app/(dashboard)/feedback/` (관리 뷰만. 외부 참여자 경로는 유지)

---

## 11. 유지 근거 — "왜 많이 제거 안 하는가"

1. **작동 중 기능은 다시 만들기 어렵다.** 코치 DB 페이지 삭제 시점은 Coach Finder UI 가 안정 운영된 후.
2. **API 는 프로젝트 내부에서도 쓴다.** `/coaches` 페이지가 없어져도 `/api/coaches` 는 Step 3 가 사용.
3. **대체 모듈 완성 전 삭제 = 기능 공백.** 이번 재설계 철학은 "점진적 전환", 급진적 교체가 아님.
4. **사이드바 링크 제거만으로 "보이지 않음" 목표 달성.** 사용자가 접근 못 하면 사실상 비활성.

---

## 12. 에이전트 작업 시 참조 규칙

작업 시작 전 반드시:
1. 이 문서의 해당 파일 판정 확인
2. **KEEP 파일은 건드리지 않기** — 브리프의 `MUST NOT touch` 섹션에 반영
3. **UPGRADE/REWORK 파일은 지정 Phase 에만** 수정
4. **REMOVE 파일은 지정 Phase 까지 대기** — 섣불리 삭제 금지

파일 판정과 브리프의 지시가 충돌하면 **이 문서가 우선**. 브리프 업데이트 필요하면 메인에 보고.

---

**연관:** [modules.md](./modules.md) · [../decisions/](../decisions/) · [../../ROADMAP.md](../../ROADMAP.md)
