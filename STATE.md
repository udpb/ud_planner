# STATE.md — 현재 진행 상태 (2026-04-28 기준)

> 단일 페이지 상태 스냅샷. "지금 어디까지 됐고, 뭐가 남았고, 어떻게 동작하는지" 즉시 파악용.
> 갱신 주기: 마이너 마일스톤 단위. 5문서 묶음(ROADMAP·REDESIGN·CLAUDE·MEMORY·STATE) 통합 커밋 시 동기화.

---

## 한 눈 요약

- **누적 커밋 수**: 108 (master 기준 — L1 3 커밋 포함, L2 통합 커밋 1건 진행 중)
- **현재 브랜치**: `claude/blissful-goodall-56a659` (워크트리)
- **마지막 큰 변경**: ⭐ **L2 Express PoC 풀 구현** (2026-04-28) — 단일 화면 동작
- **Phase A~H + L 완료** (9 Phase) — **Phase I 진행 중** (I2/I3 완료, I1/I4/I5 사용자 액션 대기).
- **다음 우선순위**: **I1 (E2E 테스트 — 사용자 검증)** + **I5 (Vercel 배포 + GitHub push)**. PAT workflow scope 갱신 후 push 가능.
- **시스템 정체성 재정의 (2026-04-27)**: 6 스텝 단일 트랙 → **Express (메인) + Deep (보조) 두 트랙**. 북극성 = "RFP → 30~45분 → 1차본".

### Phase 진행률 표

| Phase | 이름 | 상태 | 진행률 |
|-------|------|------|--------|
| A | 골격·계약 | 완료 | 100% |
| B | Step 1 + Ingestion 뼈대 | 완료 | 100% |
| C | 데이터 흐름 | 완료 | 100% |
| D | PM 가이드 + Gate 3 | 완료 | 100% |
| E | ProgramProfile + 차별화 리서치 | 완료 | 100% |
| F | Impact Value Chain | 완료 | 100% |
| G | UD Asset Registry v1 | 완료 | 100% |
| H | Content Hub v2 | 완료 | 100% |
| **L** ⭐ | **Express Mode (ADR-011)** | ✅ **완료** | **L0~L6 100%** |
| I | 안정화·배포 | 대기 | 0% (Phase L 후) |

---

## Phase 진행 표 (대표 커밋 해시)

| Phase | 이름 | 상태 | 핵심 산출 | 대표 커밋 |
|-------|------|------|---------|---------|
| A | 골격·계약 | 완료 | PipelineContext · Module Manifest 패턴 · Ingestion 스키마 | `b7980dd` `ccf2150` `3d5d28b` |
| B | Step 1 + Ingestion 뼈대 | 완료 | RFP 기획방향 AI · 평가배점 전략 · Step 1 3컬럼 UI | `c23d2b6` `10b3683` `98cd461` |
| C | 데이터 흐름 | 완료 | PipelineContext 주입 AI · 룰 엔진 뼈대 · DataFlowBanner | `ec9c3c2` `3b1332f` `061d5b5` |
| D | PM 가이드 + Gate 3 | 완료 | proposal-ingest · ChannelPreset · pm-guide · predicted-score | `de71f15` `2c72625` `d649d67` `e2ae095` `d1ad453` |
| E | ProgramProfile + 차별화 리서치 | 완료 | ADR-006·007 · 11축 프로파일 · 시드 60건 · Gate 3 강화 | `4190096` `a82b2e4` `1b73769` `1f3017f` `afc82fe` `2226f19` `9d00616` |
| F | Impact Value Chain | 완료 | ADR-008 · 5단계 + SROI 수렴점 + 루프 Gate (9 커밋) | `0f416b5` → `2714ca7` |
| G | UD Asset Registry v1 | 완료 | ADR-009 · 시드 15종 + matchAssetsToRfp + 자산 패널 (8 커밋) | `9af914a` → `b754052` |
| H | Content Hub v2 | 완료 | ADR-010 · ContentAsset DB + 계층 + 담당자 UI (7 커밋) | `c3bd197` → `0ee6b23` |
| **L** ⭐ | **Express Mode** | **진행 중** | **ADR-011 · 두 트랙 정체 + Gemini 3.1 Pro Primary + invokeAi() + max_tokens 8192/16384 + safeParseJson 강화** | **`f2c0c38` `6369403` `f0ffab8`** |
| I | 안정화·배포 | 대기 | (계획) E2E · Manifest 강제 · Vercel 배포 | — |

---

## 코드 현황

### Tech 스택

- **Next.js 16.2.1** (App Router, Turbopack)
- **React 19.2.4** + **TypeScript** strict
- **Prisma 7.5.0** + `@prisma/adapter-pg` (PrismaPg adapter)
- **PostgreSQL** (Docker Compose `ud_ops_db`)
- **NextAuth v5** (JWT 전략 — Google OAuth + 개발 모드 Credentials)
- **shadcn/ui** + **base-ui** + **Tailwind v4**
- **AI Primary**: Google Gemini 3.1 Pro Preview (`gemini-3.1-pro-preview` via `googleapis ^171.4.0`) — L1 완료
- **AI Fallback**: Anthropic Claude SDK `^0.80.0` (모델: `claude-sonnet-4-6`)
- **호출 진입점**: `src/lib/ai-fallback.ts` `invokeAi(params)` — provider/model 중립
- **PDF**: `unpdf` (Vercel 서버리스 호환)
- 기타: `@dnd-kit`, `@tanstack/react-query`, `zod`, `zustand`, `sonner`, `lucide-react`, `exceljs`, `googleapis`

### 디렉토리 구조 (주요만)

```
src/app/
  (auth)/                     로그인 라우팅
  (dashboard)/
    projects/[id]/            6 스텝 UI (rfp · curriculum · coaches · budget · impact · proposal)
      step-rfp.tsx            Step 1 + 3탭 (Impact · Input · Output)
      step-curriculum.tsx
      step-coaches.tsx
      step-budget.tsx         예산 설계 (Phase F 개칭)
      step-impact.tsx         임팩트 + SROI Forecast (Phase F 재구성)
      step-proposal.tsx
      *.manifest.ts           Module Manifest 6종
    ingest/                   Ingestion 페이지
    settings/
  admin/
    content-hub/              Phase H 담당자 UI (목록·신규·편집)
  api/                        라우트 (admin·agent·ai·auth·budget·coaches·content-hub·ingest 등)

src/lib/                      도메인 레이어
  asset-registry.ts           DB 기반 자산 매칭 (Phase H async 전환)
  asset-registry-types.ts     UdAsset · AssetCategory · EvidenceType · AssetMatch
  value-chain.ts              5단계 의미 레이어 (Phase F)
  loop-alignment.ts           SROI 3방향 얼라인 룰 (Phase F)
  program-profile.ts          11축 프로파일 + profileSimilarity (Phase E)
  planning-principles.ts      제1원칙 + 4 세부원칙 주입
  pipeline-context.ts         867줄 SSoT 슬라이스 계약
  claude.ts                   AI 호출 + safeParseJson
  curriculum-ai.ts            커리큘럼 AI (PipelineContext 주입)
  proposal-ai.ts              제안서 AI (자산 narrativeSnippet 주입)
  logic-model-builder.ts      Logic Model + Activity-Session 매핑
  winning-patterns.ts         WinningPattern + profileSimilarity 매칭
  proposal-rules.ts           Gate 3 룰 (당선 패턴·평가위원·논리체인)
  channel-presets.ts          ChannelPreset 시드 + resolveChannelTone
  eval-strategy.ts            평가배점 전략 (규칙 기반)
  ingestion/                  pdf-section-splitter · save-file · workers
  planning-agent/             Planning Agent 코어 (agent · prompts · question-bank · state · tools · types · channel-preprocessors · intent-schema · manifest)
  budget-rules.ts · impact-rules.ts · curriculum-rules.ts   Gate 2 룰 엔진

src/modules/                  Module Manifest 4계층 (ADR-002)
  _types.ts                   ModuleManifest 타입
  pm-guide/                   manifest · panel · resolve · sections · static-content · types · research-prompts
  asset-registry/             manifest 만 (실 구현은 src/lib/asset-registry.ts)
  gate3-validation/           manifest · run · evaluator-simulation · logic-chain · pattern-comparison · types
  predicted-score/            manifest · calculate · score-bar · types

src/components/
  projects/                   agent-interview-panel · data-flow-banner · matched-assets-panel
                              · planning-scorecard · program-profile-panel · research-panel · strategy-panel
  admin/                      asset-form
  layout/                     sidebar 등
  value-chain-diagram.tsx     Phase F 5단계 다이어그램
  loop-alignment-cards.tsx    Phase F 루프 Gate 카드
  ui/                         shadcn/ui 빌트인

prisma/
  schema.prisma               44 모델 · 1161줄
  migrations/                 12 마이그레이션
  seed.ts · seed-channel-presets.ts · seed-program-profiles.ts
  seed-content-assets.ts · seed-winning-patterns-sections.ts
```

### 마이그레이션 (12건)

1. `20260324022406_init`
2. `20260406075214_v5_1_data_collection_models`
3. `20260407043917_add_impact_module_code_to_curriculum`
4. `20260412084344_add_auth_and_planning_agent_phase2`
5. `20260413005745_add_external_research`
6. `20260413024845_add_strategic_notes`
7. `20260415074654_add_ingestion_skeleton` (Phase A)
8. `20260415124312_add_rfp_planning_fields` (Phase B)
9. `20260417012218_add_phase_d_assets` (Phase D — WinningPattern · ChannelPreset)
10. `20260421000206_phase_e_program_profile` (Phase E — ProgramProfile · ProfileTag)
11. `20260424000000_phase_g_accepted_assets` (Phase G — Project.acceptedAssetIds)
12. `20260424120000_phase_h_content_hub` (Phase H — ContentAsset)

### DB 시드 현황

- **ProgramProfile + WinningPattern**: 60건 (Phase E, 10 케이스 × 축 조합)
- **ContentAsset**: 20건 = 15 top-level + 5 children (Phase H)
- **ChannelPreset**: 3종 (B2G · B2B · 재계약 — Phase D)
- **IMPACT Module**: 18건 (CORE 4 + IMPACT 14)
- **Coach**: 800명 (sync-coaches.ts)
- 기타: SROI 프록시, 비용 기준, 타깃 프리셋 등

### 데이터 모델 44개 (`prisma/schema.prisma`)

User · Account · Session · Coach · Module · Project · CurriculumItem · CoachAssignment · Budget · BudgetItem · Expense · Task · TaskAssignee · Participant · ProposalSection · CostStandard · ContentAsset · SroiProxy · TargetPreset · SatisfactionLog · ImpactModule · Content · ContentMapping · DesignRule · AudienceProfile · WeightSuggestion · InternalLaborRate · ServiceProduct · Applicant · DogsResult · ActtResult · StartupStatusRecord · StartupDiagnosis · SatisfactionResponse · CoachingJournal · AlumniRecord · AgentSession · PlanningIntentRecord · PMFeedback · IngestionJob · ExtractedItem · WinningPattern · ProfileTag · ChannelPreset

---

## 모듈별 상태 표

| 모듈 | 위치 | 상태 | manifest | 비고 |
|------|------|------|----------|------|
| pm-guide | `src/modules/pm-guide/` | 운영 (Phase D~E 완성) | 있음 | panel · sections · resolve · research-prompts · static-content |
| asset-registry | `src/modules/asset-registry/` | 운영 (Phase G~H DB 전환) | 있음 | 실 구현은 `src/lib/asset-registry.ts` |
| gate3-validation | `src/modules/gate3-validation/` | Phase D5 완료 | 있음 | evaluator-simulation · logic-chain · pattern-comparison |
| predicted-score | `src/modules/predicted-score/` | Phase D4 완료 | 있음 | calculate · score-bar |

스텝별 manifest (`src/app/(dashboard)/projects/[id]/*.manifest.ts`): step-rfp · step-curriculum · step-coaches · step-budget · step-impact · step-proposal — 6종 모두 존재.

---

## 주요 설계 결정 (ADR 1줄씩)

- **ADR-001** 파이프라인 스텝 순서 변경 — 임팩트 Step 2 → Step 5, 커리큘럼 Activity 자동 추출.
- **ADR-002** Module Manifest 패턴 — reads/writes 명시, 가벼운 모듈 + 공유 DB.
- **ADR-003** Ingestion 파이프라인 — 자료 업로드가 곧 자산 고도화. 시스템 정체성.
- **ADR-004** Activity-Session 매핑 — 1 세션 = 1 Activity. 커리큘럼 → Logic Model 자동 변환 규칙.
- **ADR-005** 가이드북-시스템 정체성 분리 — 가이드북은 OJT 배포용, ud-ops 와 별개 트랙.
- **ADR-006** ProgramProfile 11축 — 사업 스펙트럼 매칭. WinningPattern 3축의 한계 극복.
- **ADR-007** 스텝별 티키타카 리서치 — 단계마다 리서치 갱신, "버튼만 누르면" 느낌 제거.
- **ADR-008** Impact Value Chain 5단계 + SROI = Outcome 수렴점, 루프 얼라인 Gate.
- **ADR-009** UD Asset Registry — 5 카테고리 자산 + 3중 태그 + RFP 자동 매핑.
- **ADR-010** Content Hub v2 — DB 기반 + parentId 계층 + 담당자 직접 CRUD UI.
- **ADR-011** ⭐ Express Mode — 두 트랙 정체 (Express 메인 / Deep 보조). 북극성 = "RFP → 30~45분 → 1차본 7 섹션".

---

## 마지막 큰 변경 5개 (시간 역순)

| # | 커밋 | 내용 |
|---|------|------|
| 1 | ⭐ `L2` (이 세션) | **Phase L Wave L2 — Express PoC 풀 구현** — `/projects/[id]/express` 단일 화면 + 좌(챗봇) + 우(7섹션 점진 미리보기) + 12 슬롯 + 외부 LLM 카드 3종 + 부차 기능 1줄 자동 인용 + 자동 저장 (debounced 1500ms) + RFP→자산 매칭→첫 턴 자동 흐름 + Express↔Deep 양방향 분기. typecheck 0 errors. |
| 2 | `06d81a5` | L0 — ADR-011 채택 + `architecture/express-mode.md` + 9 문서 싱크 |
| 3 | `f0ffab8` | L1 Wave 3 — invokeAi 호출마다 provider/model/elapsed 콘솔 로그 |
| 4 | `6369403` | L1 Wave 2 — Gemini 모델명 fix (`gemini-3.1-pro-preview` 실제 API명) |
| 5 | `f2c0c38` | ⭐ **L1 — Gemini 3.1 Pro 통합 + max_tokens 확대 (8192/16384) + safeParseJson 강화** (Logic Model 5843byte truncate 사고 해소) |

---

## 다음 우선순위 (Phase L Wave L2 — Express PoC) ⭐

ROADMAP §Phase L 그대로 인용:

- [x] **L0. ADR-011 + architecture spec + 6 문서 싱크** *(2026-04-27)*
- [x] **L1. AI 안정화** — Gemini 3.1 Pro + invokeAi + max_tokens 8192/16384 + safeParseJson 강화 *(`f2c0c38` / `6369403` / `f0ffab8`)*
- [x] **L2. Express PoC: 단일 화면** *(2026-04-28 완료)*
  - `src/app/(dashboard)/projects/[id]/express/page.tsx` 서버 컴포넌트 진입
  - `src/components/express/` 6 컴포넌트 (`ExpressShell`, `ExpressChat`, `ExpressPreview`, `NorthStarBar`, `RfpUploadDialog`, 카드 3종)
  - `src/lib/express/` 8 파일 (`schema`, `conversation`, `slot-priority`, `prompts`, `active-slots`, `extractor`, `asset-mapper`, `handoff`, `auto-citations`, `process-turn`)
  - 신규 API: `/api/express/init` + `/api/express/turn` + `/api/express/save`
  - 마이그레이션: `20260428000000_phase_l_express_draft` — `Project.expressDraft Json?` + `expressActive Boolean @default(false)` + `expressTurnsCache Json?`
  - 자동 저장 (debounce 1500ms) + RFP 업로드 → 자동 자산 매칭 → 첫 턴 자동
  - 진입점: 신규 프로젝트 → Express 자동 redirect / 6 step 페이지에서 우상단 "Express" 링크 / Express 안에서 "정밀 기획 (Deep)" 분기
  - typecheck 0 errors
- [x] **L3. 외부 LLM 분기 + 자산 자동 인용** *(2026-04-28)* — 차별화 자산 토글 시 narrativeSnippet 자동 sections 주입/제거 + externalLookupNeeded 운영 로그 + prompts 에 PM 외부 답 → evidenceRefs 자동 누적 + 카드 능동 트리거 패턴
- [x] **L4. 부차 기능 1줄 정밀화** *(2026-04-28)* — auto-citations.ts async 전면 개정 · ContentAsset (Asset Registry) + CostStandard + Coach DB 실제 조회 + coach-finder 외부 프롬프트 자동 생성 · 신뢰도 0.3 → 0.4~0.75 · ExpressPreview 신뢰도 칩·인용 자산 칩·외부 프롬프트 복사 버튼
- [ ] **L4. 부차 기능 1줄 인용** — SROI 추정 + 예산 마진 + 코치 카테고리 + Deep 이동 링크
- [x] **L5. 검수 에이전트 (사용자 요청)** *(2026-04-28)* — `inspectDraft()` AI + `heuristicInspect()` 휴리스틱 백업 · 7 렌즈 (market/statistics/problem/before-after/key-messages/differentiators/tone) · 1차본 승인 시 자동 호출 + 수동 "검수" 버튼
- [x] **L6. Express + Deep 통합 운영 검증** *(2026-04-28 부분)* — `mapDraftToProjectFields()` + `mapDraftToProposalSections()` + `suggestDeepAreas()` 자동 호출 (markCompleted transaction). E2E 검증은 사용자 손에.

## Phase L 후속: Phase I (안정화·배포)

ROADMAP §Phase I — Phase L 완료 *후* 진입:

- [ ] **I1. 전체 E2E 테스트** — Express + Deep 모두 (Express 30~45분 → Deep Step 5 정밀)
- [ ] **I2. 빌드 확인 + 에러 수정**
- [ ] **I3. Module Manifest 강제**
- [ ] **I4. strategy-interview-ingest + 품질 지표 대시보드**
- [ ] **I5. Vercel 배포 + GitHub push**

### 즉각 후속 (Phase L 이전 기술 부채)

- 브라우저 E2E 검증 (Phase F·G·H 가시 동작) — Docker `ud_ops_db` 기동 후
- master `node_modules` 재 install 필요 (워크트리 통합 후)
- `evalStrategy` 를 `MatchAssetsParams` 로 받기 (Phase G 후속)
- `ProgramProfile.methodology.primary` 유니온 확장
- `PmGuidePanel` `valueChainInputs` 실제 주입 (현재 미사용)

---

## 알려진 이슈·기술 부채

| 카테고리 | 항목 | 출처 |
|----------|------|------|
| 인프라 | master `node_modules` 재설치 필요 (워크트리 통합 후) | 138ebab 후속 |
| Phase G | `evalStrategy` 를 `MatchAssetsParams` 로 받기 | project_asset_registry.md 후속 TODO |
| Phase E | `ProgramProfile.methodology.primary` 유니온 확장 | project_program_profile_v1.md |
| Phase F | `PmGuidePanel` `valueChainInputs` 실제 주입 | journey 2026-04-23 |
| Phase H | `ContentAsset` 검색 인덱스 (현재 풀스캔) | journey 2026-04-24 phase-h |
| 빌드 | TypeScript 빌드 정보 477KB (`tsconfig.tsbuildinfo`) — 정리 필요 | 빌드 디버그 |
| 가이드북 | 가이드북-시스템 분리 후 `lecture-materials/` 자료 정리 | ADR-005 후속 |
| Smoke Test | 실제 RFP 로 6 스텝 전수 검증 미실행 | session_20260420 |
| AI 품질 | **AI 답변 퀄리티 검수 에이전트** — Gemini/Claude 응답이 "1차본 당선력" 기준 충족하는지 자동 점검 (사용자 요청 2026-04-27) | Phase L 후속 |
| AI | 제안서 전체 생성 매우 느림 (45~76초/섹션) — Gemini 응답 시간 또는 prompt 길이 최적화 필요 | dev 로그 2026-04-27 |

---

## 파이프라인 흐름 요약

UI 6 스텝 + Impact Value Chain 5단계 의미 레이어 병행.

```
Step 1 RFP+기획방향  [① Impact · ② Input · ③ Output 3 탭]
Step 2 커리큘럼      [④ Activity]
Step 3 코치          [④ Activity + ② Input]
Step 4 예산 설계     [② Input]
Step 5 임팩트+SROI   [⑤ Outcome — 수렴점] ◀── 루프 시작
Step 6 제안서        [③ Output 최종]
                            └── 루프: SROI 3방향 얼라인 ──┘
```

데이터 레이어:

```
Layer 1 내부 자산 (회사 공통)
  브랜드 자산 / IMPACT 18모듈 / 코치 800 / 비용 기준
  / SROI 프록시 / 당선 패턴 60 / ChannelPreset 3 / ContentAsset 20
Layer 2 프로젝트 컨텍스트 (PipelineContext — 스텝 간 흐름)
  Step 1→2→3→4→5→6 누적 전달
Layer 3 외부 인텔리전스 (AI + PM 수집)
  티키타카 리서치 / AI 생성 / 수주 전략 인터뷰
```

---

## 참고 문서

- **PRD-v7.0.md** ⭐ — 단일 진실 원본 (v6.0 은 archived)
- **ROADMAP.md** — Phase 체크리스트 (A~H 완료, **L 진행 중**, I 대기)
- **REDESIGN.md** — 상세 설계 v2
- **CLAUDE.md** — 프로젝트 규칙 / 브랜드 / 컨벤션 / 설계 철학 10
- **docs/architecture/** — modules · data-contract · ingestion · quality-gates · value-chain · program-profile · asset-registry · content-hub · **express-mode** ⭐ · current-state-audit
- **docs/decisions/** — ADR-001 ~ **ADR-011** (Express Mode 채택)
- **docs/journey/** — 12+건 시행착오 일지

---

*Generated 2026-04-27. 다음 갱신: Phase L Wave L2 완료 시.*
