# UD-Ops Workspace — 인수인계서 (2026-04-29)

> 본 문서는 **다음 개발자가 시스템을 받아 곧바로 운영·고도화할 수 있도록** 정리한 인수인계 자료입니다.
> 가장 빠른 시작은 [§14 인수인계 체크리스트](#14-인수인계-체크리스트) 부터.
>
> 단일 진실 원본: [PRD-v7.0.md](PRD-v7.0.md) (v7.1 minor bump 2026-04-29 반영) · 본 문서는 그 보완·운영 안내.

---

## 0. 한 눈 정리

| 항목 | 값 |
|---|---|
| **시스템 정체성** | RFP → 30~45분 → "당선 가능한 기획 1차본" 을 만드는 AI 공동기획자 |
| **두 트랙** | **Express Track (메인)** + **Deep Track (보조)** |
| **북극성** | "RFP 한 부 → 30~45분 → 7 섹션 1차본 초안" |
| **프로덕션** | https://ud-planner.vercel.app |
| **GitHub** | https://github.com/udpb/ud_planner |
| **DB** | Neon PostgreSQL (`ap-southeast-1`, sslmode=require) |
| **AI** | Gemini 3.1 Pro Preview (Primary) + Claude Sonnet 4.6 (Fallback) |
| **누적 Phase** | A·B·C·D·E·F·G·H·L·I·J — 모든 코드 트랙 마무리 |
| **남은 사용자 액션** | I1 E2E 검증 / 보안 rotate / 도메인 (선택) |

---

## 1. 기술 스택

| 영역 | 선택 |
|---|---|
| Framework | **Next.js 16.2.1** (App Router) + **TypeScript strict** |
| React | 19.2.4 |
| DB | PostgreSQL 16 + **Prisma 7.5.0** (PrismaPg adapter) |
| 인증 | NextAuth v5 (JWT 전략) — Google OAuth + 개발 모드 Credentials |
| AI | **Gemini 3.1 Pro Preview** (`gemini-3.1-pro-preview` via `@google/generative-ai 0.24.1`) — Primary |
|     | **Claude Sonnet 4.6** (`claude-sonnet-4-6` via `@anthropic-ai/sdk ^0.80.0`) — Fallback |
|     | 단일 진입점: `src/lib/ai-fallback.ts` `invokeAi(params)` |
| Styling | Tailwind v4 + shadcn/ui + base-ui + lucide-react + sonner |
| 엑셀 | exceljs ^4.4.0 |
| PDF | unpdf ^1.6.0 (Vercel serverless 호환) |
| 호스팅 | Vercel (Hobby plan, `regions: ["icn1"]`, `maxDuration: 60`) |

### 디자인 시스템
- 폰트: Nanum Gothic (나눔고딕)
- 메인 컬러: **Action Orange `#F05519`** (underdogs.global 공식)
- 컬러 비율: Action Orange 가 전체 UI 의 10~15% 이하
- 사이드바: 다크 `#373938`

---

## 2. 폴더 구조

```
ud-ops-workspace/
├── prisma/
│   ├── schema.prisma          ← 44 models
│   ├── migrations/            ← 7 마이그 (Phase B~L)
│   ├── seed.ts                ← 기본
│   ├── seed-channel-presets.ts
│   ├── seed-program-profiles.ts (10 케이스)
│   └── seed-content-assets.ts (15 top-level + 5 children)
├── src/
│   ├── app/
│   │   ├── (auth)/login/
│   │   ├── (dashboard)/
│   │   │   ├── dashboard/
│   │   │   ├── projects/
│   │   │   │   ├── new/page.tsx   ← 신규 프로젝트 (Express 진입점)
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx           ← Deep Track (6 step)
│   │   │   │       ├── express/page.tsx   ← Express Track 진입
│   │   │   │       ├── step-rfp.tsx ~ step-proposal.tsx
│   │   │   │       └── *.manifest.ts (6 step manifest)
│   │   │   ├── ingest/
│   │   │   └── settings/
│   │   ├── admin/
│   │   │   ├── content-hub/        ← 콘텐츠 자산 관리
│   │   │   ├── metrics/            ← 운영 지표 대시보드
│   │   │   └── interview-ingest/   ← 전략 인터뷰 인제스트
│   │   ├── api/                    ← 48 routes
│   │   └── proxy.ts                ← Next.js 16 proxy (구 middleware)
│   ├── components/
│   │   ├── express/                ← ExpressShell, ExpressChat, ExpressPreview, NorthStarBar, RfpUploadDialog, cards/{3종}
│   │   ├── projects/               ← 6 step 컴포넌트
│   │   ├── layout/                 ← sidebar, header
│   │   └── ui/                     ← shadcn/ui
│   ├── lib/
│   │   ├── ai-fallback.ts          ← invokeAi 단일 진입점 (Gemini Primary / Claude Fallback)
│   │   ├── claude.ts               ← Claude SDK + safeParseJson 헬퍼
│   │   ├── gemini.ts               ← Gemini SDK
│   │   ├── prisma.ts               ← Prisma client (PrismaPg)
│   │   ├── auth.ts                 ← NextAuth v5
│   │   ├── pipeline-context.ts     ← Deep Track 슬라이스 계약
│   │   ├── express/                ← Express Track 코어 (12 파일)
│   │   ├── interview-extractor/    ← Phase I4 — 인터뷰 AI 자산 추출
│   │   ├── excel-export/           ← Phase J PoC + J2 발주처 템플릿
│   │   ├── asset-registry.ts       ← Asset 매칭·시드
│   │   ├── asset-registry-types.ts ← Client 안전 타입
│   │   ├── program-profile.ts      ← ProgramProfile 11축
│   │   ├── value-chain.ts          ← Impact Value Chain 5단계
│   │   ├── curriculum-rules.ts
│   │   ├── curriculum-ai.ts
│   │   ├── logic-model-builder.ts
│   │   ├── proposal-ai.ts
│   │   ├── ud-brand.ts
│   │   ├── fetch-helper.ts         ← 클라이언트 safeFetchJson (504/HTML 친절 처리)
│   │   └── planning-agent/         ← Deep Track 보조 에이전트
│   └── modules/
│       ├── _registry.ts            ← 10 manifest 통합 (Phase I3)
│       ├── _types.ts
│       ├── pm-guide/               ← PM 가이드 패널
│       ├── predicted-score/        ← 예상 점수 바
│       ├── gate3-validation/       ← AI 검증 게이트
│       └── asset-registry/         ← 모듈 manifest
├── docs/
│   ├── architecture/               ← 12 architecture docs
│   ├── decisions/                  ← 12 ADR
│   └── journey/                    ← 시행착오 일지
├── scripts/
│   ├── check-manifests.ts          ← npm run check:manifest
│   ├── print-worktree.cjs          ← predev hook
│   └── sync-coaches.ts
├── PRD-v7.0.md                     ← 단일 진실 원본 (v7.1 운영 마일스톤 반영)
├── ROADMAP.md                      ← Phase 체크리스트
├── STATE.md                        ← 현재 진행 상태
├── PROCESS.md                      ← 개발 프로세스
├── LESSONS.md                      ← 학습·실패 케이스
├── HANDOVER.md                     ← 본 문서
├── README.md                       ← 시작 가이드
├── CLAUDE.md                       ← AI 협업 메모리
├── docker-compose.yml              ← 로컬 PostgreSQL
├── vercel.json                     ← Vercel 배포 설정 (build:prod, icn1, maxDuration: 60)
├── eslint.config.mjs               ← ADR-002 lint 정책
├── next.config.ts
├── tsconfig.json
└── package.json
```

---

## 3. 데이터 모델 — Prisma 44 models 요약

### 3.1 카테고리화

| 카테고리 | 모델 (대표) | 역할 |
|---|---|---|
| **인증** | User · Account · Session · VerificationToken | NextAuth v5 |
| **프로젝트** | **Project** ⭐ · Budget · BudgetItem · ProposalSection · CurriculumItem · CoachAssignment · LogicModel | 1차 사업 단위 |
| **자산 — Asset Registry / Content Hub** | ContentAsset (Phase H) | 재사용 가능 자산 + 3중 태그 |
| **자산 — 마스터** | CostStandard · SroiProxy · TargetPreset · ImpactModule · WinningPattern · ChannelPreset · CurriculumArchetype | 시드 데이터 |
| **자산 — 코치** | Coach · CoachExpertise · SatisfactionLog · CoachSync | coach-finder DB sync |
| **인제스트** | IngestionJob · ExtractedItem | 자료 업로드 → 자산 적재 + Phase I4 인터뷰 |
| **외부 리서치** | ResearchItem | Phase E (스텝 차별화) |
| **시뮬레이션** | (logicModel · sroiForecast 는 Project Json 필드) | 임팩트 + SROI |

### 3.2 Project 모델의 Phase 별 진화 (핵심)

```
[Phase B·C] base
  id · name · client · projectType · totalBudgetVat · supplyPrice · eduStartDate · eduEndDate
  status · pmId · budget · curriculum · coaches · proposalSections

[Phase D] RFP·Planning
  + rfpRaw · rfpParsed Json
  + proposalConcept · proposalBackground · keyPlanningPoints Json

[Phase E] ProgramProfile
  + programProfile Json (11축)
  + renewalContext Json

[Phase F] Impact Value Chain
  + logicModel Json (Activity·Output·Outcome·Impact)
  + sroiForecast Json (16종×4국)
  + sroiCountry String (default '한국')

[Phase G] Asset Registry
  + acceptedAssetIds Json (PM 수락한 자산 IDs)

[Phase L] Express Track ⭐ (2026-04-28 마이그)
  + expressDraft Json (12 슬롯 + sections + meta)
  + expressActive Boolean (default false)
  + expressTurnsCache Json (마지막 N 턴 캐시)
```

### 3.3 ExpressDraft 의 12 슬롯 (Phase L SSoT)

```ts
// src/lib/express/schema.ts ExpressDraftSchema
{
  intent?: string,                // ① 사업 정체성 (20~200자)
  beforeAfter?: { before, after } // ②③ 교육 전·후 (각 20~300자)
  keyMessages?: string[]          // ④⑤⑥ 정확히 3개 (각 8~80자)
  differentiators?: AssetReference[]   // ⑦ 차별화 자산 (3+, max 7)
  evidenceRefs?: ExternalEvidence[]    // 외부 LLM 답 누적
  sections?: { '1','2','3','4','5','6','7' }  // ⑧⑨⑩⑪⑫ + 5,7 (5,7 은 자동 인용)
  meta: { startedAt, lastUpdatedAt, isCompleted, completedAt?, activeSlots, skippedSlots, lastFilledSlot }
}
```

12 슬롯 명세 — `src/lib/express/schema.ts` 의 `ALL_SLOTS` 배열.

### 3.4 ContentAsset (Phase H)

```ts
// 단순 + 1단 계층 + 3중 태그
{
  id · name · category (methodology|content|product|human|data|framework)
  parentId? (1단 계층: 상품 → 세션/주차/챕터)
  applicableSections: ProposalSectionKey[]   // 3중 태그 1
  valueChainStage: ValueChainStage           // 3중 태그 2 (input·output·activity·outcome·impact)
  evidenceType: ('quantitative'|'structural'|'case'|'methodology')  // 3중 태그 3
  keywords?: string[]
  programProfileFit?: Partial<ProgramProfile>   // 매칭 보조
  narrativeSnippet · keyNumbers?               // 제안서 반영
  status: 'stable'|'developing'|'archived'
  version · sourceReferences? · lastReviewedAt · createdById? · updatedById?
}
```

### 3.5 IngestionJob (Phase D + I4)

```ts
{
  id · kind ('proposal'|'curriculum'|'evaluator_question'|'strategy_interview')
  sourceFile? · sourceUrl?
  metadata Json   // Phase I4 인터뷰 시: { projectName, outcome, intervieweeName, rawText, aiSummary, aiRedFlags, ... }
  status ('queued'|'processing'|'review'|'approved'|'rejected'|'failed')
  uploadedBy · uploadedAt · processedAt? · approvedAt? · approvedBy? · error?
  extractedItems: ExtractedItem[]   // 후보 자산
}
```

### 3.6 마이그레이션 적용 상태 (Neon 프로덕션)

```
20260324022406_init                              ✅
20260406075214_v5_1_data_collection_models       ✅
20260407043917_add_impact_module_code_to_curriculum ✅
20260412084344_add_auth_and_planning_agent_phase2 ✅
20260413005745_add_external_research              ✅
20260413024845_add_strategic_notes                ✅
20260415074654_add_ingestion_skeleton             ✅
20260415124312_add_rfp_planning_fields            ✅
20260417012218_add_phase_d_assets                 ✅
20260421000206_phase_e_program_profile            ✅
20260424000000_phase_g_accepted_assets            ✅
20260424120000_phase_h_content_hub                ✅
20260428000000_phase_l_express_draft              ✅ (마지막)
```

---

## 4. User Flow

> 자세한 ASCII 다이어그램은 [docs/architecture/user-flow.md](docs/architecture/user-flow.md) 참조.

### 4.1 Express Track (메인 흐름) — 30~45분

```
[1] 사이드바 「+ 새 프로젝트」
       ↓
[2] /projects/new — RFP 우선 흐름
       • PDF 업로드 또는 본문 붙여넣기
       • [분석 시작] → parseRfp (Gemini → Claude fallback) ~30초
       • 자동 form 채움: 사업명·발주기관·예산·기간
       • [프로젝트 생성] → expressActive=true 설정
       ↓
[3] /projects/[id]/express 자동 진입
       • 단일 화면 (좌 챗봇 + 우 미리보기 + 상단 북극성 바)
       • 자동 첫 턴 — RFP 요약 + intent 후보 4개 quickReplies
       ↓
[4] 12 슬롯 채우기 (PM ↔ AI 1~3 턴/슬롯)
       intent → beforeAfter.{before,after} → keyMessages.{0,1,2}
       → differentiators (자산 토글) → sections.{1,2,3,4,6}
       • quickReplies chip → 클릭 prefill (편집 후 전송)
       • 외부 카드 3유형: 자동 추출 / 외부 LLM / PM 직접
       • 자동 저장 (debounced 1500ms)
       ↓
[5] 진행률 50%+ 도달
       자동 종료 안내 패널 등장 — 4 액션:
       ↓
       ├─→ ✓ 1차본 승인 + 검수
       │     inspectDraft (7 렌즈) → Project 필드 + ProposalSection 시드
       │     → "정밀화 권장 영역" 패널 (Step 링크)
       │
       ├─→ ⚙ 정밀 기획 (Deep) →
       │     handoffToDeep('rfp') → router.push('/projects/[id]?step=rfp')
       │
       ├─→ 🔍 검수만 받기
       │     inspectDraft toast (저장·이동 X)
       │
       ├─→ 📥 내부 엑셀 (PoC 5 시트)
       └─→ 📋 발주처 템플릿 (J2: 1-1-1 주관부서 + 1-2 외부용)
```

### 4.2 Deep Track (정밀 기획) — 6 Step

```
Step 1. RFP 분석 + 기획 방향   (writes: rfp, strategy)
   ↓ 자동: ContentAsset 매칭 (RFP 키워드)
Step 2. 커리큘럼 설계          (reads: rfp+strategy / writes: curriculum)
   ↓ 자동: 회차 추천 + IMPACT 모듈 매핑 + Action Week 1:1 코칭 페어
Step 3. 코치 매칭              (reads: rfp+curriculum / writes: coaches)
   ↓ 자동: coach-finder API 호출 (또는 외부 LLM 프롬프트 자동 생성)
Step 4. 예산 설계 (② Input)    (reads: curriculum+coaches / writes: budget)
   ↓ 자동: 코치 단가 × 회차 + AC 운영비 표준 → PC/AC/마진
Step 5. 임팩트 + SROI          (reads: 위 모두+rfp / writes: impact)
   ↓ 자동: Activity → Outcome (SROI 수렴점, ADR-008)
Step 6. 제안서                 (reads: 모두 / writes: proposal)
   ↓ Express 의 sections 가 ProposalSection 으로 시드된 상태
```

각 Step:
- 좌 본문: 데이터 입력·확인
- 우 사이드바 (280px): PM 가이드 패널 (4 핵심 질문 + Tips + 리서치 카드)
- 하단: 4 게이트 검증 (구조 / 룰 / AI / 사람)

### 4.3 Express → Deep 인계 (handoff)

```
ExpressDraft (Json on Project)
       ↓ markCompleted=true OR handoffToDeep=true 트리거
       ↓
mapDraftToProjectFields() — src/lib/express/handoff.ts
       ├→ Project.proposalConcept     ← draft.intent
       ├→ Project.proposalBackground  ← draft.beforeAfter (Before/After 합침)
       ├→ Project.keyPlanningPoints[] ← draft.keyMessages
       └→ Project.acceptedAssetIds[]  ← draft.differentiators (acceptedByPm=true)

mapDraftToProposalSections() — 동일 파일
       ↓
ProposalSection.{1..7} 시드 (version=1, isApproved=false)
       (기존 isApproved=true 는 보존)
```

전 트랜잭션은 `prisma.$transaction` 으로 원자적.

### 4.4 인터뷰 인제스트 (Phase I4)

```
PM 인터뷰 텍스트
   ↓ /admin/interview-ingest 입력 폼
   ↓ POST /api/admin/interview-ingest
   ↓ IngestionJob (kind='strategy_interview', status='queued')
   ↓ 상세 페이지 [AI 추출 시작] 버튼
   ↓ POST /api/admin/interview-ingest/[id] { action: 'process' }
   ↓ extractFromInterview() — Gemini 호출
   ↓ status: queued → processing → review
   ↓ ExtractedItem 후보 N개 (4 자산 유형: winning_pattern · curriculum_archetype · evaluator_question · strategy_note)
   ↓ 콘텐츠 담당자 검토 (CandidateCard)
   ↓ POST /api/admin/extracted-items/[id] { action: 'approve' }
   ↓ ContentAsset 자동 생성 (id=interview-{jobId6}-{itemId6}, status='developing')
   ↓ 프로젝트의 Express / Deep 에서 자동 매칭 시 인용
```

---

## 5. API 카탈로그 (48 routes)

### 5.1 인증 (NextAuth)
- `/api/auth/[...nextauth]` — NextAuth v5 default

### 5.2 AI (Phase D~L)
| Route | 역할 | 호출 |
|---|---|---|
| POST `/api/ai/parse-rfp` | RFP PDF → 구조화 데이터 | invokeAi (max_tokens 12288) |
| PUT `/api/ai/parse-rfp` | 파싱 결과 DB 확정 | — |
| POST `/api/ai/planning-direction` | 기획 방향 추천 | Claude |
| POST `/api/ai/curriculum` | 커리큘럼 자동 생성 | Claude (max_tokens 12288) |
| POST `/api/ai/logic-model` | Logic Model | invokeAi (max_tokens 12288) |
| POST `/api/ai/suggest-impact-goal` | 임팩트 목표 추천 | invokeAi |
| POST `/api/ai/proposal` | 제안서 섹션 생성 | Claude (max_tokens 12288) |
| POST `/api/ai/proposal/improve` | 섹션 개선 | Claude |
| POST `/api/ai/proposal/validate` | 섹션 검증 | Claude |

### 5.3 Express Track (Phase L)
| Route | 역할 |
|---|---|
| POST `/api/express/init` | 첫 진입 — RFP 매칭 + 자산 시드 + 첫 턴 자동 |
| POST `/api/express/turn` | 챗봇 1턴 처리 (PM 입력 → AI 응답 → 슬롯 머지) |
| POST `/api/express/save` | 자동 저장 (debounced) + handoffToDeep / markCompleted |
| POST `/api/express/inspect` | 1차본 자동 검수 (7 렌즈, Phase L5) |

### 5.4 Project 관련
| Route | 역할 |
|---|---|
| GET·PATCH `/api/projects/[id]` | 단일 프로젝트 |
| POST·DELETE `/api/projects` | 목록·생성 |
| `/api/projects/[id]/rfp` | RFP CRUD |
| `/api/projects/[id]/research` | 외부 리서치 |
| `/api/projects/[id]/similar` | 유사 사업 추천 |
| `/api/projects/[id]/predict-score` | 예상 점수 |
| `/api/projects/[id]/pipeline-context` | PipelineContext 조회 |
| `/api/projects/[id]/assets` | acceptedAssetIds 토글 |
| GET `/api/projects/[id]/export-excel` | Phase J PoC 5 시트 |
| GET `/api/projects/[id]/export-budget-template` | Phase J2 발주처 템플릿 (1-1-1 + 1-2) |

### 5.5 Step 별 API (Deep Track)
- `/api/budget/calculate`
- `/api/curriculum/[projectId]/{item,reorder}`
- `/api/coaches`, `/api/coaches/sync`, `/api/coach-assignments`
- `/api/impact-modules`, `/api/modules`

### 5.6 Admin (Phase H + I4)
| Route | 역할 |
|---|---|
| `/api/content-hub/assets` (`[id]`) | ContentAsset CRUD |
| POST `/api/admin/seed-content-assets` | 시드 적용 (멱등 upsert) |
| POST `/api/admin/import` | CSV 일괄 임포트 |
| POST·GET `/api/admin/interview-ingest` | 전략 인터뷰 입력·목록 |
| GET·POST `/api/admin/interview-ingest/[id]` | 단일 + AI 추출 트리거 |
| POST `/api/admin/extracted-items/[id]` | 자산 후보 승인·반려·편집 |

### 5.7 인제스트
- `/api/ingest`, `/api/ingest/process`, `/api/ingest/jobs/[id]/review`

### 5.8 기타
- `/api/feedback`, `/api/sheets`

---

## 6. AI 호출 패턴

### 6.1 단일 진입점

`src/lib/ai-fallback.ts` `invokeAi(params)`:

```ts
const result = await invokeAi({
  prompt: '...',
  maxTokens: 12288,           // 60s 안전 마진 (16384 → 12288 으로 축소, 2026-04-29)
  temperature: 0.4,
  label: 'curriculum',         // 콘솔 로그용
})
// 1. Gemini 우선 시도 (GEMINI_API_KEY 있을 때)
// 2. 실패 시 Claude 자동 fallback
// 3. console.log: [ai] curriculum → Gemini gemini-3.1-pro-preview 31622ms · raw=3334b
```

### 6.2 JSON 파싱

`src/lib/claude.ts` `safeParseJson()` / `safeParseJsonExternal()`:
- 마크다운 코드 펜스 자동 제거
- trailing comma 자동 보정
- 끝 절단 자동 복구 (마지막 valid 위치까지 자르기)
- 자동 1회 재시도

### 6.3 Express 의 markdown fallback

`src/lib/express/process-turn.ts` `extractMarkdownSections()`:
- AI 가 `nextQuestion` 안에 마크다운으로 7섹션을 한꺼번에 토하면
- `### N.` / `### IV.` / `[N장.]` 패턴 인식 → `sections.{1..7}` 자동 매핑
- nextQuestion 짧게 자르고 quickReplies 자동 생성

### 6.4 클라이언트 에러 처리

`src/lib/fetch-helper.ts` `safeFetchJson<T>(url, init)`:
- 504/502/HTML 응답 → "AI 응답이 너무 오래 걸려 시간 초과됐어요" 친절 메시지
- 401/403/404/429/5xx 각각 친절 메시지
- "Unexpected token 'A'" 같은 raw error 노출 차단

---

## 7. 자산 시스템 (Asset Registry / Content Hub)

### 7.1 데이터 흐름

```
[1] 콘텐츠 담당자 → /admin/content-hub
    • 새 자산 입력 (3중 태그 + narrativeSnippet)
    • 또는 시드 적용 버튼 (UD_ASSETS_SEED 15종 + 계층 5종 upsert)
[2] PM RFP 업로드
    • parseRfp → keywords 추출
    • matchAssetsToRfp(rfp, profile) — programProfileFit + keyword 점수
[3] Express Track
    • differentiators 슬롯에 자동 시드 (acceptedByPm=false)
    • PM 토글 → acceptedByPm=true 시 narrativeSnippet 이 sections 에 자동 인용
[4] Deep Track
    • Step 1 패널에 매칭 자산 표시
    • Step 6 제안서 생성 시 narrativeSnippet 인용
[5] 인터뷰 인제스트 (Phase I4)
    • 수주 후 PM 인터뷰 → AI 자산 후보 추출 → 검토 → ContentAsset 추가
```

### 7.2 시드 데이터

`prisma/seed-content-assets.ts` + `/api/admin/seed-content-assets`:
- **15 top-level**: UOR 방법론 / IMPACT 18 모듈 / ACT Canvas / Alumni Hub (10년 25,000명) / SROI Proxy DB (16종×4국) / Benchmark Pattern / coach-finder / AI 솔로프리너 / AX 가이드북 등
- **5 children** (계층 예시): AI 솔로프리너 W1~W3, AX 가이드북 Ch1·Ch2

---

## 8. 검증 게이트 — 4 계층

> 자세히는 [docs/architecture/quality-gates.md](docs/architecture/quality-gates.md)

| Gate | 종류 | 위치 |
|---|---|---|
| **Gate 1** — 구조 | zod schema 자동 (빌드·런타임) | ExpressDraftSchema, RfpParsed, ProgramProfile 등 |
| **Gate 2** — 룰 (결정론) | 코드 검증 | curriculum-rules.ts (R-001 ~ R-004), express/extractor 등 |
| **Gate 3** — AI 검증 (정성) | LLM 호출 | proposal/validate, **inspectDraft 7 렌즈 (Phase L5)** — market·statistics·problem·before-after·key-messages·differentiators·tone |
| **Gate 4** — 사람 (PM 확인) | UI 클릭 | "1차본 승인" 버튼, ProposalSection.isApproved |

---

## 9. 배포·운영

### 9.1 Vercel 빌드 파이프라인

`vercel.json`:
```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build:prod",
  "regions": ["icn1"],
  "functions": {
    "src/app/api/**/route.ts": { "maxDuration": 60 }
  }
}
```

`package.json` 의 `build:prod`:
```
prisma generate && prisma migrate deploy && next build
```

= GitHub push 후 Vercel webhook 자동 trigger:
1. npm install
2. prebuild: `npm run check:manifest` (errors 0 보장)
3. prisma generate
4. prisma migrate deploy (Neon idempotent — 이미 적용된 마이그 skip)
5. next build

### 9.2 maxDuration 한계

Vercel **Hobby plan = 60s 최대**. 자주 timeout 나면 Pro plan (300s) 권장.

현재 모든 AI route 의 `max_tokens = 12288` (16384 → 축소, 2026-04-29). 일반 케이스 60s 안에 응답.

### 9.3 도메인

- 현재: `https://ud-planner.vercel.app`
- 권장: 커스텀 도메인 연결 (예: `ops.underdogs.global`)
  - Vercel Settings → Domains → Add
  - DNS CNAME 등록
  - SSL 자동 발급 (~10분)
  - `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL` 환경변수 갱신
  - Google OAuth Redirect URIs 갱신

자세한 가이드: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

---

## 10. 환경변수 카탈로그

### 10.1 필수

| 변수 | 값 | 비고 |
|---|---|---|
| `DATABASE_URL` | Neon connection string | postgresql://...?sslmode=require |
| `AUTH_SECRET` | 32자 랜덤 base64 | https://generate-secret.vercel.app/32 |
| `NEXTAUTH_URL` | https://ud-planner.vercel.app | 도메인 변경 시 갱신 |

### 10.2 AI (둘 중 하나는 필수, 둘 다 권장)

| 변수 | 값 | 발급 |
|---|---|---|
| `GEMINI_API_KEY` | Gemini key | https://aistudio.google.com/apikey |
| `GEMINI_MODEL` | `gemini-3.1-pro-preview` | default 동일 — 미설정 OK |
| `ANTHROPIC_API_KEY` | Claude key | https://console.anthropic.com/settings/keys |

### 10.3 선택

| 변수 | 용도 |
|---|---|
| `AUTH_GOOGLE_ID`·`AUTH_GOOGLE_SECRET` | Google OAuth 로그인 |
| `NEXT_PUBLIC_APP_URL` | 외부 링크/이메일 |
| `GITHUB_TOKEN`·`GITHUB_COACHES_*` | 코치 DB 동기화 (sync:coaches) |
| `GOOGLE_*` (Sheets) | 피드백/코치/예산 시트 연동 |

전체 목록: [.env.example](.env.example), [.env.production.example](.env.production.example)

---

## 11. 코드베이스 진입점 — 어디서 시작해서 어디로

### 11.1 새 기능 추가

| 작업 | 시작점 |
|---|---|
| **새 AI 호출** | `src/lib/ai-fallback.ts` invokeAi 사용 → label 추가 |
| **새 Step 추가 (Deep)** | `src/app/(dashboard)/projects/[id]/step-XXX.tsx` + `step-XXX.manifest.ts` + `src/modules/_registry.ts` 등록 |
| **새 자산 카테고리** | `src/lib/asset-registry-types.ts` `AssetCategory` 유니온 + Prisma migration |
| **Express 새 슬롯** | `src/lib/express/schema.ts` `ALL_SLOTS` + `extractor.ts` + `slot-priority.ts` + `prompts.ts` (currentSlotGuide) |
| **새 Admin 페이지** | `src/app/admin/XXX/page.tsx` (server) + `_components/...` (client) + `auth()` 가드 |
| **새 마이그** | `prisma/schema.prisma` 수정 → `npx prisma migrate dev --name XXX` |
| **새 환경변수** | `.env.example` + `.env.production.example` + 코드 사용 + Vercel Settings |

### 11.2 디버깅

| 증상 | 어디 보면? |
|---|---|
| AI 호출 실패 | Vercel Logs → `[ai] LABEL → ...` 검색 |
| Express autosave 실패 | DevTools Network → `/api/express/save` Response body |
| 슬롯 진행 멈춤 | `extractor.ts` → 어느 검증에서 reject 됐는지 |
| 카드 + 질문 동시 표시 | `prompts.ts` 의 카드 trigger 룰 + AI 가 instruction 따르는지 |
| Module Manifest 위반 | `npm run check:manifest` |

### 11.3 자주 보는 SSoT 문서

| 결정 | 문서 |
|---|---|
| Express 메인 트랙 채택 | [ADR-011](docs/decisions/011-express-mode.md) |
| Express 구현 계약 | [docs/architecture/express-mode.md](docs/architecture/express-mode.md) |
| 시스템 정체성 | [PRD-v7.0.md](PRD-v7.0.md) |
| User Flow | [docs/architecture/user-flow.md](docs/architecture/user-flow.md) |
| 데이터 슬라이스 계약 | [docs/architecture/data-contract.md](docs/architecture/data-contract.md) |
| Module Manifest 패턴 | [docs/architecture/modules.md](docs/architecture/modules.md) + [ADR-002](docs/decisions/002-module-manifest-pattern.md) |
| Impact Value Chain | [docs/architecture/value-chain.md](docs/architecture/value-chain.md) + [ADR-008](docs/decisions/008-impact-value-chain.md) |

---

## 12. 알려진 이슈 / 잔여 작업

### 12.1 코드 backlog (작은 것)

- ESLint warnings 348 (legacy `any`) — Phase 재작업 중 자연 정리 정책 (eslint config). 즉시 fix 안 함.
- `/coaches` `/modules` 404 prefetch — 빌드 캐시 잔재. 새 빌드 후 자연 해소 예상.

### 12.2 사용자 직접 처리 (보안·운영)

- **🔴 ANTHROPIC_API_KEY rotate** — Vercel logs 에 한 번 노출됨 (`sk-ant-api03-...`). https://console.anthropic.com/settings/keys 에서 Disable + 새 키 발급 → Vercel·.env 갱신.
- **🟠 Neon DB password rotate** — connection string 이 이번 세션 채팅에 노출됨. Neon 대시보드 → Roles → Reset password.
- 🟡 Google OAuth Redirect URIs — OAuth 사용 시 `https://ud-planner.vercel.app/api/auth/callback/google` 등록.
- 🟢 커스텀 도메인 — 선택.

### 12.3 후속 권장

- **Vercel Pro 업그레이드 (60s → 300s)** — AI 호출이 자주 timeout 나면 효과 큼. Hobby plan 한계가 가장 큰 운영 리스크.
- **Phase J3** — budget-template 시트 #16 (2. 내부용 세부 예산) 매핑 (1-1-1 + 1-2 외 후속).
- **인터뷰 인제스트 워커 강화** — 현재는 명시적 [AI 추출 시작] 버튼. 자동 처리 (queue 워커) 로 발전.
- **모니터링 대시보드 시계열** — 현재 스냅샷. 시간축·차트 (recharts 등 deps 추가) 후속.
- **E2E 자동 테스트** — Playwright/Cypress 등으로 RFP→Express→Deep 흐름 자동 검증.

---

## 13. 점검 결과 (2026-04-29 최종)

| 항목 | 상태 | 비고 |
|---|---|---|
| Prisma schema 모델 수 | **44** | Phase B~L 누적 |
| Prisma 마이그 적용 | **13/13** | Neon production 동기화 |
| API routes 수 | **48** | Express 4 + Admin 6 + 기존 38 |
| Architecture docs | **12** | user-flow.md (v1.0) 포함 |
| ADR | **12** (001~011) | ADR-011 Express Mode = 시스템 정체성 |
| Module Manifest | **10** | 6 step + 4 support/asset, owner all set |
| `npm run check:manifest` | **errors 0 / warnings 0** | manifest 무결성 OK |
| `npx tsc --noEmit` | **0 errors** | TypeScript strict |
| `npx next build` | **정상** | proxy + 모든 라우트 등록 |
| ContentAsset DB 시드 | **20건** (15 top-level + 5 children) | 시드 자동화 버튼 (admin UI) |
| Project 시드 | **10건** ProgramProfile 케이스 | seed-program-profiles.ts |
| Channel Preset 시드 | **다수** | seed-channel-presets.ts |
| 사이드바 진입점 | **7** | 대시보드/프로젝트/자료 업로드/Content Hub/운영 지표/전략 인터뷰/설정 |
| 신규 프로젝트 → Express 자동 redirect | **OK** | new/page.tsx |
| Express ↔ Deep 양방향 토글 | **OK** | ExpressShell + project [id]/page.tsx |
| 자동 저장 (debounced 1500ms) | **OK** | ExpressShell |
| 외부 카드 3유형 | **OK** | TurnBubble 인라인 (마지막 AI turn) |
| 검수 에이전트 7 렌즈 | **OK** | inspectDraft (Phase L5) + heuristicInspect fallback |
| Express → Deep 인계 | **OK** | mapDraftToProjectFields + ProposalSection 시드 (transaction) |
| 엑셀 출력 PoC (5 시트) | **OK** | /api/projects/[id]/export-excel |
| 발주처 budget-template (J2) | **OK** | 1-1-1 + 1-2 두 시트 |
| 인터뷰 인제스트 + AI 추출 | **OK** | /admin/interview-ingest + extractFromInterview |
| 모니터링 대시보드 | **OK** | /admin/metrics |
| safeFetchJson 헬퍼 | **OK** | curriculum-board 적용, 다른 호출자 점진 적용 가능 |
| 프로덕션 가동 | **✅** | https://ud-planner.vercel.app |

---

## 14. 인수인계 체크리스트

### 14.1 즉시 (인수자 첫 작업)

- [ ] **이 문서 (HANDOVER.md) 와 [PRD-v7.0.md](PRD-v7.0.md) 정독**
- [ ] **[docs/architecture/user-flow.md](docs/architecture/user-flow.md) 다이어그램 확인**
- [ ] GitHub repo (`https://github.com/udpb/ud_planner`) 클론 + `npm install`
- [ ] `.env.example` 복사 → `.env` 채우기 (DATABASE_URL · GEMINI_API_KEY · AUTH_SECRET 등)
- [ ] `docker compose up postgres` (로컬 DB) 또는 Neon 연결
- [ ] `npx prisma migrate deploy` + `npm run db:seed:*` (4종)
- [ ] `npm run dev` → http://localhost:3000 진입 확인
- [ ] 로그인 → 새 프로젝트 생성 → Express → 1차본 → Deep 흐름 한 사이클

### 14.2 보안 마무리

- [ ] **ANTHROPIC_API_KEY 즉시 rotate** (채팅 노출됨)
- [ ] **Neon DB password rotate** (채팅 노출됨)
- [ ] Vercel 환경변수 갱신
- [ ] 로컬 `.env` 갱신
- [ ] (선택) Google OAuth 설정

### 14.3 운영 검증

- [ ] 프로덕션 (https://ud-planner.vercel.app) 로그인
- [ ] RFP 1~2개로 Express → 1차본 끝까지
- [ ] /admin/metrics 운영 지표 확인
- [ ] /admin/interview-ingest 인터뷰 1건 입력 → AI 추출 → 자산 승인 → ContentAsset 생성 검증
- [ ] /admin/content-hub 시드 적용 버튼 동작 확인

### 14.4 다음 개발 시

- [ ] Phase J3 (budget-template 시트 #16) 또는 자체 우선순위
- [ ] Vercel Pro 업그레이드 검토 (60s timeout 빈번 시)
- [ ] E2E 자동 테스트 도입 (Playwright)
- [ ] 모니터링 시계열·알림 (Sentry / DataDog 등)

### 14.5 Phase Bridge 1 (2026-05-03) — Supabase mirror 활성화

ud-ops 가 단독 운영 중이라면 skip 가능. coaching-log/coach-finder 와 lifecycle 을 자연스럽게 잇고 싶다면:

- [ ] Vercel env 에 `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE` 추가 (`.env.production.example` 참조)
- [ ] (이미 push 된 코드라면) 새 deploy 자동 적용. 아니면 redeploy.
- [ ] **검증**: ud-ops 에서 새 Project 생성 → Supabase Table Editor 에서 `business_plans` 테이블에 새 행 확인. `legacy_firestore_id` 가 ud-ops Project.id 와 일치해야 함.
- [ ] **수주 흐름 검증**: Project.status 를 `IN_PROGRESS` 로 변경 (또는 `isBidWon=true`) → Supabase 의 같은 BP 가 status='won' 으로 업데이트 → bp_on_won 트리거 발동 → `projects` + `project_members` 자동 생성 → 코치들이 coaching-log 에서 프로젝트 즉시 확인.

자세한 설계: `../underdogs-coaching-log/docs/INTEGRATED_ARCHITECTURE.md` §4.1
구현: `src/lib/supabase-sync.ts`

---

## 15. 시작 명령 cheatsheet

```bash
# 로컬 개발
docker compose up -d postgres
npm install
npx prisma migrate deploy
npm run db:seed
npm run db:seed:channel-presets
npm run db:seed:program-profiles
npm run db:seed:content-assets
npm run dev
# → predev hook: print-worktree + check:manifest 자동 실행

# 빌드 검증
npm run check:manifest      # Module Manifest 무결성
npx tsc --noEmit            # TypeScript strict
npm run lint                # ESLint (warnings 348 정상, errors 0 필수)
npm run build               # 로컬 빌드
npx next build              # 또는 next 직접

# 프로덕션
git push origin master      # → Vercel 자동 redeploy (build:prod = prisma migrate deploy + next build)

# DB 관리
npx prisma studio           # GUI
npx prisma migrate dev --name xxx   # 새 마이그
npx prisma migrate deploy   # 적용 (idempotent)
```

---

## 16. 핵심 결정 인용 (시스템 정체성)

> *"언더독스의 강점은 부각이 되지만 RFP에 따라 유연하게 적용 유무를 판단하고 적용하면서, 과정이 가장 사용자 친숙한 방식으로 되려면 어떻게 해야할까? 복잡도가 올라가는 방식보다는 사용자가 직관적으로 따라가지만, 계속 본인 스스로 흐름을 놓치지 않고 핵심 메세지 중심으로 결과물이 완성되는거야. SROI, 예산, 코치추천 이것도 필요한 기능이지만 부차적이야. **핵심은 RFP에 맞춰서 당선 가능한 기획 1차본이 나오는거지**"*
>
> — 사용자 (udpb@impact.ai), 2026-04-27 ADR-011 트리거

이 한 문단으로 v6 (단일 6 스텝) → v7 (Express + Deep 두 트랙) 으로 정체성 재정의됨.

---

## 17. 주요 ADR (12개)

| ADR | 결정 |
|---|---|
| 001 | 스텝 순서 = rfp → curriculum → coaches → budget → impact → proposal |
| 002 | Module Manifest 패턴 (4 계층: core / support / asset / ingestion) |
| 003 | safeParseJson 헬퍼 + max_tokens 정책 |
| 004 | PipelineContext 슬라이스 계약 (모듈 간 직접 호출 금지) |
| 005 | Ingestion → 자산 자동 고도화 |
| 006 | ProgramProfile 11축 + Gate 3 룰 |
| 007 | Step 차별화 리서치 흐름 (External Research) |
| 008 | Impact Value Chain 5 단계 + SROI = Outcome 수렴점 |
| 009 | UD Asset Registry v1 (자산 단일 레지스트리 + 3중 태그) |
| 010 | Content Hub v2 (DB 이관 + 1단 계층 + 담당자 UI) |
| 011 | ⭐ **Express Mode 채택 — 두 트랙 정체성 재정의** |

---

## 18. 마지막 메시지

이 시스템은 **PM 1명이 RFP 한 부를 받아 30~45분 안에 당선 가능한 1차본까지** 가는 흐름을 위해 설계됐습니다. 모든 결정은 그 북극성을 향해 최적화됐고, Deep Track 의 6 step 은 1차본을 정밀화·검증하는 보조 도구입니다.

다음 개발자가 시스템을 받아 운영·고도화할 때:
1. **북극성을 잊지 말기** — 새 기능 추가 시 "1차본 30~45분 도달" 에 도움이 되는가?
2. **데이터는 위에서 아래로** — Deep Track 의 Step 간 데이터 흐름 (rfp → curriculum → ...)
3. **자산은 자동으로 올라온다** — Asset Registry 매칭 + narrativeSnippet 인용
4. **AI 는 맥락 안에서** — invokeAi 단일 진입점, 항상 RFP·ProgramProfile·매칭 자산 컨텍스트
5. **검증 게이트 4 계층** — 새 흐름 추가 시 어떤 게이트로 검증할지 명시

문제 생기면:
- Vercel Logs (실시간 함수 로그)
- DevTools Network (response body 확인)
- `npm run check:manifest` (모듈 무결성)
- 본 문서의 [§11.2 디버깅](#112-디버깅)

행운을 빕니다. 좋은 1차본이 많이 나오기를 🎉

---

**작성**: 2026-04-29
**작성자**: AI 공동기획자 (Claude Opus 4.7 1M context) + 사용자 (udpb@impact.ai)
**버전**: v1.0
