# UD-Ops 종합 진단 보고서 (2026-05-03)

> **작성 목적**: "제대로 기획안이 자연스럽게 다 뽑히고, 다른 사람들이 봤을 때도 퀄리티 높은 제안서" 를 위한 코드베이스 전수 점검.
> **작성 방식**: 모든 핵심 파일 직접 read + 의존성 분석 + 데이터 흐름 추적 (에이전트 위임 X).
> **결론**: 시스템은 동작 가능 상태이지만 — **AI 호출 패턴 무질서 / 데이터 시드 누락 / 검증 게이트 분산 / 코드 중량화** 4 영역에서 정리·단순화 필요.

---

## 0. 한 눈에 — 가장 큰 5 이슈

| 순위 | 영역 | 영향 | 노력 | 즉시 가능? |
|---|---|---|---|---|
| 🔴 **1** | **Coach DB 빈 상태** | Step 3·4 무력화 | 5분 (사용자 1 클릭) | ✅ 어드민 Sync 버튼 |
| 🔴 **2** | **AI route 5개 maxDuration 미명시** | 504 timeout 잠재 위험 | 5분 | ✅ |
| 🟠 **3** | **anthropic 직접 호출 16곳** (Gemini fallback X) | AI 호출 안정성 | 1~2시간 | ✅ |
| 🟠 **4** | **max_tokens 4096~16384 무질서** | 응답 절단 / timeout | 10분 | ✅ |
| 🟡 **5** | **claude.ts 1014줄 단일 파일** | 유지보수 부담 | 3시간 | 추후 |

**결론**: 1·2·4 는 **15분 안에** 해결 가능. 3·5 는 **하루 작업**.

---

## 1. 시스템 구조 한 눈

```
┌─────────────────────────────────────────────────────────────┐
│ Express Track (메인) — RFP → 30~45분 → 1차본               │
│   /projects/[id]/express                                     │
│   └─ src/lib/express/ (12 파일, 2703줄)                      │
│      • schema, conversation, slot-priority, active-slots     │
│      • prompts (552줄!), extractor, asset-mapper             │
│      • process-turn (387줄, retry+fallback), inspector       │
│      • handoff (인계), auto-citations                        │
└─────────────────────────────────────────────────────────────┘
              ↓ markCompleted=true OR handoffToDeep=true
┌─────────────────────────────────────────────────────────────┐
│ Deep Track (보조) — 6 step 정밀화                            │
│   /projects/[id]?step={rfp,curriculum,coaches,budget,...}   │
│   └─ /api/ai/* (8 routes — parse-rfp, curriculum, ...)      │
│      └─ src/lib/{claude (1014줄), curriculum-ai (808),       │
│         proposal-ai (828), logic-model-builder (718)}        │
└─────────────────────────────────────────────────────────────┘
              ↓ ProposalSection 7건 시드
┌─────────────────────────────────────────────────────────────┐
│ 자산 / 검증 / 출력                                            │
│ • ContentAsset (Phase H DB) ← UD_ASSETS_SEED 코드 ↘          │
│ • 검수: inspectDraft (Express L5) / runGate3 (proposal)     │
│ • 출력: 5시트 PoC + 발주처 budget-template (J2)              │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 발견된 문제 (8 카테고리)

### 2.1 🔴 데이터 / 시드 문제

#### A. Coach DB 빈 상태 (확인됨)
- `seed.ts` 가 7종 시드 (CostStandard·SroiProxy·TargetPreset·Module·InternalLaborRate·ServiceProduct·ImpactModule)
- **`Coach` 테이블만 시드 X** — `npm run sync:coaches` 가 별도 (GitHub coaches-db 에서 fetch)
- Vercel 배포 시 자동 실행 안 됨 → 프로덕션 Neon 의 Coach 테이블 비어있을 가능성 큼
- **영향 chain**: Step 3 검색 0건 → Step 4 인건비 산출 X → 마진 계산 부정확 → 제안서 예산 섹션 빈약

#### B. WinningPattern-sections 시드 미적용
- `prisma/seed-winning-patterns-sections.ts` (50건 시드 파일) 존재
- **`package.json` 의 `db:seed:*` script 에 빠짐** — `seed-program-profiles.ts` 만 등록
- 결과: pm-guide Step 3 의 "유사 사업 매칭" 5배 부족 (10건만)

#### C. Schema 44 모델 중 25 모델 미사용 (코드베이스 부풀림)
실제 사용되는 19 모델 (`prisma.X.find/create/update` 호출 grep):
```
agentSession · budget · budgetItem · channelPreset · coach
coachAssignment · contentAsset · costStandard · curriculumItem
extractedItem · impactModule · ingestionJob · module · 
planningIntentRecord · project · proposalSection · sroiProxy
user · winningPattern
```

미사용 25 모델:
```
ActtResult · AlumniRecord · Applicant · AudienceProfile · CoachingJournal
Content · ContentMapping · DesignRule · DogsResult · Expense
InternalLaborRate · PMFeedback · Participant · ProfileTag · SatisfactionLog
SatisfactionResponse · ServiceProduct · Session · StartupDiagnosis
StartupStatusRecord · Task · TaskAssignee · WeightSuggestion
```

→ Phase v5 의 잔재 (`Actt`, `Dogs`, `Alumni`, `StartupDiagnosis`) + 미구현 기능 (Task, PMFeedback) + 대체된 모델 (Content → ContentAsset).

---

### 2.2 🔴 AI 호출 패턴 — 일관성 부재

#### A. max_tokens 무질서
| 호출 | max_tokens |
|---|---|
| `ai-fallback.ts` default | 16384 |
| `claude.ts/parseRfp` | 12288 |
| `claude.ts/buildLogicModel` | 12288 |
| `claude.ts/generateProposalSection` | 12288 |
| `claude.ts/suggestImpactGoal` | 8192 |
| `claude.ts/suggestCurriculum` | 12288 (사용 X — dead code) |
| `curriculum-ai.ts/generateCurriculum` | 12288 |
| `curriculum-ai.ts/Outline` | 6144 |
| `curriculum-ai.ts/Details` | 8192 |
| `process-turn.ts` (Express turn) | 8192 |
| `inspector.ts` | 8192 |
| `/api/ai/planning-direction` | 4096 |
| `/api/ai/proposal/route` | 2048 |
| `/api/ai/proposal/improve` | 4096 |
| `/api/ai/suggest-impact-goal` | 8192 |

→ 4096·8192·12288·16384 4 단계가 **함수마다 다르게**. 일관 정책 부재.

#### B. invokeAi vs anthropic 직접 호출 — 16곳 혼재
**invokeAi 사용 (Gemini Primary + Claude Fallback)** — 6곳:
- `curriculum-ai.ts/generateCurriculum + Outline + Details`
- `process-turn.ts` (Express)
- `inspector.ts` (Express L5)
- `/api/ai/suggest-impact-goal`
- `logic-model-builder.ts` (1곳)

**anthropic 직접 호출 (Claude만, Gemini fallback X)** — 16곳:
- `claude.ts`: parseRfp · suggestImpactGoal · buildLogicModel · suggestCurriculum · generateProposalSection (5곳)
- `/api/ai/planning-direction/route.ts`
- `/api/ai/proposal/route.ts`
- `/api/ai/proposal/improve/route.ts`
- `lib/ingestion/workers/proposal-ingest.ts`
- `lib/planning-agent/tools.ts` (5곳)
- `lib/proposal-ai.ts`

→ Gemini 키 있어도 16곳은 **Claude only**. 안정성 절반.

#### C. maxDuration 명시 — 8 AI route 중 1개만 명시
**명시 ✅**: `/api/ai/curriculum` (`maxDuration = 60`)

**명시 ❌** (vercel.json 의 `functions` 패턴이 60 적용하지만 명시 권장):
- `/api/ai/logic-model`
- `/api/ai/parse-rfp`
- `/api/ai/planning-direction`
- `/api/ai/proposal`
- `/api/ai/proposal/improve`
- `/api/ai/proposal/validate`
- `/api/ai/suggest-impact-goal`

#### D. 분할 호출 — curriculum 만 적용
2026-05-03 도입한 `outline + details` 분할 패턴은 **curriculum 한정**.
- `/api/ai/proposal` 도 7 섹션 × 12288 = 60초 위험. 단일 호출 그대로.
- `/api/ai/logic-model` 도 12288, 단일.
- Express 의 `buildFinalDraftPrompt` (1차본 일괄 생성) 도 분할 X.

→ 큰 RFP 에서 proposal·logic-model 도 504 가능성.

#### E. retry / fallback 정책 분산
- `process-turn.ts`: 1회 자동 retry (model 바꿔서)
- `curriculum-ai.ts/generateCurriculum`: retry 제거됨 (단일 시도)
- `curriculum-ai.ts/Outline + Details`: retry 없음
- `inspector.ts`: heuristic fallback (LLM 실패 시 별도 함수)
- `claude.ts` 함수들: retry X

→ 어떤 호출이 retry 가지고 어떤 호출이 안 가지는지 코드 안 봐야 모름.

---

### 2.3 🟠 Express 코어 복잡도

#### A. `prompts.ts` 552줄 — 비대화
- `buildTurnPrompt` (메인 챗봇 prompt) — 매 턴 RFP·ProgramProfile·12 슬롯 가이드·UD 자산·외부 카드 룰 모두 prompt 에 주입 → **5000~8000 token** 입력
- `buildFirstTurnPrompt` (첫 턴)
- `buildFinalDraftPrompt` (1차본 일괄)
- + 6 헬퍼 (formatRfp / formatProfile / formatAssetMatches / formatRecentTurns / listFilledSlotsText / currentSlotGuide)
- **slot 별 가이드 (currentSlotGuide)** 가 12 case statement 분기 — 슬롯 추가 시 prompts 수정 필수

→ AI 가 5000+ 토큰 prompt 받아 응답 생성 시 시간↑ (timeout 위험).

#### B. `process-turn.ts` 387줄 — 다중 fallback
한 함수 안에:
1. selectNextSlot 호출
2. buildTurnPrompt 또는 buildFirstTurnPrompt 분기
3. invokeAi 1차 시도
4. AI 실패 시 placeholder 메시지 + state 저장
5. JSON 파싱 실패 시 다른 model 로 retry
6. retry 도 실패 시 placeholder
7. coerceToTurnResponse (zod 부분 채움)
8. extractMarkdownSections (markdown fallback)
9. mergeExtractedSlots (Partial Extraction)
10. ConversationState 갱신

→ try/catch 중첩 + 분기 많음. 디버깅 어려움.

#### C. 슬롯 진행 룰 분산
`schema.ts` `ALL_SLOTS` (12개) + `slot-priority.ts` `selectNextSlot` + `extractor.ts` `mergeExtractedSlots` + `process-turn.ts` `recommendedNextSlot` 가 결과 결정.

→ "왜 이 슬롯에 멈춰있는가" 추적 시 4 파일 읽어야.

---

### 2.4 🟠 Deep Track lib 중량

| 파일 | 줄 수 | 책임 |
|---|---|---|
| `claude.ts` | **1014** | parseRfp · suggestImpactGoal · buildLogicModel · suggestCurriculum · generateProposalSection · 8 type · 4 helper |
| `curriculum-ai.ts` | 808 | generateCurriculum + Outline + Details + 검증 + prompt builder |
| `proposal-ai.ts` | 828 | proposal 섹션 생성 + 룰 + ud-brand 통합 |
| `logic-model-builder.ts` | 718 | Logic Model 생성 + 검증 |

→ `claude.ts` 가 **단일 책임 원칙 위반**. 기능 5개 + 타입 8개 + 헬퍼가 한 파일에.

---

### 2.5 🟠 인계 흐름 — 3 경로 (사용자 헷갈림)

`/api/express/save` 의 분기:
1. **일반 자동 저장** (`markCompleted=false, handoffToDeep=false`) → expressDraft 만 갱신
2. **handoffToDeep=true** → Project 필드 4종 + ProposalSection 7건 시드 (isCompleted X)
3. **markCompleted=true** → 위 + isCompleted=true + suggestDeepAreas 응답

UI 의 트리거:
- "✓ 1차본 승인" 버튼 → markCompleted=true
- "⚙ 정밀 기획 (Deep) →" 버튼 → handoffToDeep=true
- 자동 저장 (debounce) → 일반

→ PM 입장에서 "1차본 승인" vs "정밀 기획" 차이 모호. 두 버튼 동시 visible.

---

### 2.6 🟡 검증 게이트 부분 누락

| 게이트 | 정의 위치 | 호출 위치 | 상태 |
|---|---|---|---|
| zod schema | `express/schema.ts` 등 | 모든 API route | ✅ 동작 |
| `validateCurriculumRules` | `curriculum-rules.ts` | `/api/ai/curriculum` + `curriculum-board.tsx` | ✅ 동작 |
| `inspectDraft` (7 렌즈) | `express/inspector.ts` | `/api/express/inspect` | ✅ 동작 |
| `runGate3` | `modules/gate3-validation/run.ts` | `/api/ai/proposal/validate` | ✅ 동작 |
| **`validateProposalRules`** | `proposal-rules.ts:289` | **호출 0** | ❌ Dead code |
| **`runPhaseEGates`** | `proposal-rules.ts` | **호출 0** | ❌ Dead code |

→ 정의는 있지만 호출 안 되는 검증 함수 2개. Phase E 게이트가 운영 안 됨.

---

### 2.7 🟡 자산 시스템 이중화

```
[코드] UD_ASSETS_SEED (15 top-level + 5 children)
       ↓ npm run db:seed:content-assets 또는
       ↓ /api/admin/seed-content-assets POST
       ↓
[DB]   ContentAsset 테이블
       ↓
       getAllAssets() (server-only, prisma 조회)
       ↓
       matchAssetsToRfp(rfp, profile) — 점수 매칭
       ↓
       Express differentiators 슬롯 + Deep Step 1 패널
```

문제:
- 코드 시드 (`UD_ASSETS_SEED`) 와 DB 가 **분리** — 담당자가 UI 로 수정한 자산이 코드에 반영 안 됨
- 시드 자동화: admin 버튼 ✓ 있지만 **사용자가 클릭해야** 함 (postdeploy hook X)
- 신규 ContentAsset 추가 시 UI 또는 코드 시드 둘 중 하나만 갱신 → 일관성 깨짐 가능

---

### 2.8 🟢 Module Manifest — 운영 미적용

10 manifest 정의 + `_registry.ts` + `npm run check:manifest` ✓

문제:
- ESLint 커스텀 룰 (manifest 외 slice/asset 접근 금지) **미구현**
- 새 import 시 자동 차단 X — 사용자가 수동 확인
- `check:manifest` 는 무결성만 (이름 중복·asset 참조), import 제한 X

---

## 3. 단순화 제안 (퀄리티 유지하면서)

### 3.1 🔴 AI 호출 통합 — 가장 큰 효과

**현재**: invokeAi 6곳 + anthropic 16곳, max_tokens 5단계, retry 정책 4가지.

**제안**:

```
src/lib/ai/
  index.ts            — 단일 진입점 (invokeAi re-export)
  config.ts           — 정책 상수 (TOKENS_LIGHT/STANDARD/LARGE/SPLIT)
  parse-rfp.ts        — claude.ts 에서 분리
  logic-model.ts      — 동상
  proposal.ts         — 동상 + 분할 호출 (outline + sections)
  curriculum.ts       — curriculum-ai.ts 통합 (이미 분할 적용)
  impact-goal.ts      — 동상
  research.ts         — generateResearchPrompts + formatExternalResearch
  parser.ts           — safeParseJson + JsonParseError
  types.ts            — RfpParsed · LogicModel · CurriculumSession 등
```

**max_tokens 정책**:
```ts
export const AI_TOKENS = {
  LIGHT:    4096,   // planning-direction, proposal/improve, suggest-impact-goal
  STANDARD: 8192,   // express turn, inspect, interview-extract
  LARGE:    12288,  // parse-rfp, logic-model (단일 호출 시)
  OUTLINE:  6144,   // 분할 호출 1단계 (curriculum-outline)
  DETAILS:  8192,   // 분할 호출 2단계
} as const
```

**모든 호출자 → invokeAi 마이그**. 16곳 중:
- 1순위: `claude.ts` 5 함수 (parseRfp / buildLogicModel / generateProposalSection / suggestImpactGoal / suggestCurriculum)
- 2순위: `/api/ai/proposal` + `/improve` + `planning-direction`
- 3순위: `planning-agent/tools.ts` 5 곳 (Phase 2 의도된 호출들)
- 4순위: `proposal-ai.ts` + `ingestion/workers/proposal-ingest.ts`

**모든 AI route → maxDuration = 60 명시**.

**분할 호출 패턴 표준화**:
```ts
// src/lib/ai/_split-pattern.ts
export async function splitAiCall<TOutline, TFull>(
  outlineFn: () => Promise<{ ok: boolean; data?: TOutline }>,
  detailsFn: (outline: TOutline) => Promise<{ ok: boolean; data?: TFull }>,
): Promise<{ ok: boolean; data?: TFull }> {
  // 1단계 outline (~30s) → 2단계 details (~30s)
}
```

→ proposal generate 도 이 패턴 적용:
- 1단계: 7 섹션 outline + key messages
- 2단계: 각 섹션 본문 (병렬 가능)

### 3.2 🟠 Express 코어 단순화

**prompts.ts** 분할:
```
src/lib/express/prompts/
  index.ts       — buildTurnPrompt + 분기
  format.ts      — formatRfp / formatProfile / formatAssets (재사용)
  slot-guides.ts — currentSlotGuide (12 case → object lookup)
  first-turn.ts  — buildFirstTurnPrompt
  final-draft.ts — buildFinalDraftPrompt
  rules.ts       — 카드 / 4 렌즈 / 유의점 등 instruction 블록
```

**process-turn.ts** 분할:
```
src/lib/express/turn/
  index.ts        — processTurn (오케스트레이터, 80줄)
  prompt.ts      — prompt 빌드만
  parse.ts       — safeParseJson + coerce + markdown fallback
  apply.ts       — mergeExtractedSlots + state 갱신
  fallback.ts    — placeholder 메시지 (AI 실패 시)
```

→ 각 100~150줄, 책임 분명, 디버깅 ↑.

### 3.3 🟠 인계 흐름 단순화 — 단일 액션

**현재 3 트리거** → **단일 "정밀화 시작" 액션**:

```
사용자 액션
   ├─ 자동 저장 (debounce)        → expressDraft 만 (현재 그대로)
   └─ "정밀화 시작" 클릭            → 자동 검수 + Project 필드 + ProposalSection 시드 + Deep Step 1 이동
       (markCompleted=true 와 handoffToDeep=true 통합)
```

이전 markCompleted 와 handoffToDeep 의 차이:
- markCompleted: isCompleted 표시 + deepSuggestions 응답
- handoffToDeep: 동일 인계, isCompleted X

→ **둘이 사실상 같은 동작**. 통합:
- API: `markCompleted=true` 만 사용. 이름은 그대로 (의미 명확).
- UI: "1차본 승인 + 정밀화로" 단일 버튼.
- "더 다듬기" → 패널 닫기 (현재 그대로).

### 3.4 🟡 Schema 다이어트

**Phase 1 — 미사용 25 모델 제거** (2~3시간):
```sql
-- 마이그 cleanup-unused-models
DROP TABLE IF EXISTS ActtResult, AlumniRecord, Applicant, AudienceProfile,
  CoachingJournal, Content, ContentMapping, DesignRule, DogsResult, Expense,
  InternalLaborRate, PMFeedback, Participant, ProfileTag, SatisfactionLog,
  SatisfactionResponse, ServiceProduct, Session, StartupDiagnosis,
  StartupStatusRecord, Task, TaskAssignee, WeightSuggestion;
```

⚠ 주의: 일부는 NextAuth 의존 (Session). 확인 필수.

**효과**: schema.prisma 가독성 ↑, prisma generate 속도 ↑, 마이그 단순화.

### 3.5 🟢 검증 게이트 통합 ValidationDashboard

신규 컴포넌트 `<QualityScorecard project>`:
```
┌─ 기획 품질 점수 ────────────────────────────┐
│ 종합:  78 / 100                              │
├──────────────────────────────────────────────┤
│ Gate 1 (구조):     ✅ 12/12 슬롯              │
│ Gate 2 (룰):       ⚠ 1 위반 (R-002 이론연속) │
│ Gate 3 (AI 검수):  82점 / 7 렌즈              │
│ Gate 4 (PM 승인):  3/7 섹션 승인              │
│                                              │
│ Phase E 전제:    ✅ programProfile · renewal│
│ 자산 인용:        5/12 슬롯에 narrativeSnippet│
└──────────────────────────────────────────────┘
```

기존 `validateProposalRules` + `runPhaseEGates` (dead code) 도 호출.

### 3.6 🟢 Coach 시드 자동화

**옵션 A — Vercel Cron**:
- `/api/cron/sync-coaches` 매일 1회 실행
- vercel.json `crons: [{ path: "/api/cron/sync-coaches", schedule: "0 3 * * *" }]`
- ⚠ Hobby plan 은 cron 제한 있음 (Pro 권장)

**옵션 B — Build hook**:
- `package.json` postinstall 에 sync 추가? — 빌드 시 GitHub fetch
- ⚠ 빌드 시간 늘어남

**옵션 C — Admin UI 강화** (가장 안전):
- 현재 Coach Sync 버튼 ✓ 있음 — 사용자 인지·실행
- + 신규 프로젝트 진입 시 Coach 0 → 모달 "Coach DB 동기화 필요" 안내

---

## 4. 추가해야 할 것 (Backlog)

### 🟡 모니터링·관측

- **AI 응답 시간 누적 통계** — invokeAi 의 elapsed 를 DB 또는 메트릭 저장 → /admin/metrics 에 시계열
- **Sentry 에러 추적** — 프로덕션 에러 자동 alert
- **/admin/health** — DB 연결 / AI key 검증 / 시드 상태 한 페이지

### 🟢 자동화

- **E2E 테스트 (Playwright)** — RFP 업로드 → Express → Deep 끝까지 자동 검증
- **prebuild 에 시드 검증 추가** — 필수 시드 누락 시 빌드 실패

### 🟢 사용자 가이드

- **/docs 페이지** (in-app) — 새 PM 온보딩
- **video tutorial** — 30초 Express 사용법

---

## 5. 정리해야 할 것

| 항목 | 작업 | 노력 |
|---|---|---|
| **claude.ts 분할** | 7 파일로 (§3.1) | 3시간 |
| **프롬프트 분할** | prompts.ts → 6 파일 (§3.2) | 1시간 |
| **process-turn 분할** | 5 파일 (§3.2) | 1시간 |
| **미사용 25 model** | DROP 마이그 (§3.4) | 2시간 |
| **Dead code** | validateProposalRules / runPhaseEGates 활용 또는 제거 | 1시간 |
| **suggestCurriculum** | claude.ts 안의 사용 안 되는 함수 — 제거 | 5분 |
| **ESLint warnings 348** | legacy `any` 점진 정리 | 점진 (정책 유지) |

---

## 6. 우선순위 매트릭스

```
        높은 임팩트
            ↑
            │  [1] Coach Sync 클릭         [3] AI lib 분할 + invokeAi 마이그
            │  [2] maxDuration 5 명시      [4] proposal 분할 호출
            │  [4] max_tokens 표준화        [5] 검증 통합 dashboard
            │                              [6] 인계 단일 액션
            │                              [7] WinningPattern-sections 시드
            │                              [8] E2E 테스트 (Playwright)
   낮은 ────┼──────────────────────────────────────→ 높은 노력
   노력     │
            │  [9] suggestCurriculum 제거   [11] claude.ts 7 파일 분할
            │  [10] dead code 제거          [12] 25 미사용 모델 정리
            │                              [13] Sentry 에러 추적
            │
        낮은 임팩트
```

---

## 7. 추천 다음 단계 — 3 Phase

### Phase 1 — 운영 안정화 (1~2일)
**목표**: 현재 production 의 504 / fallback 누락 / 데이터 빈 상태 해결.

- [ ] **(5분)** `/admin/metrics` 에서 Coach Sync 클릭 (사용자 액션)
- [ ] **(5분)** `db:seed:winning-patterns-sections` script 추가 + 1회 실행
- [ ] **(5분)** AI route 5개에 `export const maxDuration = 60` 추가
- [ ] **(15분)** `src/lib/ai/config.ts` — `AI_TOKENS` 상수 + 모든 호출자 마이그
- [ ] **(1시간)** `claude.ts` 의 5 anthropic 직접 호출 → invokeAi 마이그
- [ ] **(30분)** `/api/ai/proposal` + `/improve` + `planning-direction` → invokeAi
- [ ] **(20분)** `/api/ai/proposal` 도 분할 호출 (outline + sections) 적용

→ **결과**: 504 위험 50%↓, 모든 AI 호출이 Gemini Primary, 일관 정책.

### Phase 2 — 단순화 (1주)
**목표**: 코드베이스 가독성 ↑, 새 개발자 진입 장벽 ↓.

- [ ] **(3시간)** `claude.ts` → `src/lib/ai/{...}.ts` 7 파일 분할
- [ ] **(2시간)** `prompts.ts` → 6 파일 분할
- [ ] **(2시간)** `process-turn.ts` → 5 파일 분할
- [ ] **(1시간)** 인계 흐름 단일 액션 ("1차본 승인 + 정밀화로")
- [ ] **(2시간)** 미사용 25 모델 cleanup 마이그
- [ ] **(1시간)** Dead code 제거 (suggestCurriculum + validateProposalRules + runPhaseEGates 활용 결정)

→ **결과**: claude.ts 1014줄 → 100~200줄 × 7. 책임 분명. 한 명이 하루에 모듈 하나 익힐 수 있음.

### Phase 3 — 품질·자동화 (2주+)
**목표**: 운영 자동화, 회귀 방지.

- [ ] **(3시간)** `<QualityScorecard>` 통합 검증 컴포넌트 + 4 게이트 결과 한 화면
- [ ] **(1일)** Vercel Cron (또는 admin 강화) Coach 자동 sync
- [ ] **(2~3일)** Playwright E2E 테스트 — RFP → Express → Deep 풀 흐름
- [ ] **(1일)** Sentry 통합 + AI 응답 시간 시계열 메트릭
- [ ] **(1일)** Module Manifest ESLint 커스텀 룰 (slice/asset 강제)

→ **결과**: 자동 회귀 테스트, 에러 가시성, 운영 신뢰성 ↑.

---

## 8. "퀄리티 높은 제안서" 가 나오기 위한 핵심 leverage

아래 5개가 결과 퀄리티를 80% 결정:

### 8.1 자산 풍부도 (Asset Pool)
- 현재: 20 ContentAsset (15 top-level + 5 children)
- 권장: **50+ 자산** (실제 수주 사례·통계·방법론)
- 추가 경로: Phase I4 의 인터뷰 인제스트로 자산 자동 생성 (이미 구현)

### 8.2 RFP 파싱 정확도
- 현재: parseRfp + safeParseJson 강화
- 권장: **evalCriteria 추출 정확도 검증** — 평가 가중치 = 회차/섹션 비중 결정. 잘못 추출되면 모든 step 영향.
- 측정: 5건 RFP × 사용자 검증 → "evalCriteria 정확도 X%" 메트릭

### 8.3 ProgramProfile 11축 매칭
- 현재: 10 케이스 시드, profileSimilarity 함수 ✓
- 권장: 매칭 점수 0.7+ 케이스 → 자산 + winningPattern 자동 인용

### 8.4 검수 에이전트 (inspectDraft) 활용
- 현재: 1차본 승인 시 자동 호출 ✓ + 수동 "검수" 버튼
- 권장: **각 슬롯 채워질 때마다 mini-inspect** (token 적게) — 실시간 품질 피드백

### 8.5 PM 가이드 (in-app)
- 현재: pm-guide 사이드바 (Step 별 4 핵심 질문)
- 권장: Express 안에서도 같은 가이드. PM 이 "왜 이 슬롯 채워야 하지?" 답을 옆에서 봄.

---

## 9. 결론

### 시스템은 **동작 가능**하지만 정리가 필요한 4 영역
1. **AI 호출 일관성** — 가장 큰 영향. Phase 1 에 즉시.
2. **데이터 시드 누락** — Coach·WinningPattern. 5분 액션.
3. **lib 중량** — 한 명이 한 파일 이해하기 어려움. Phase 2.
4. **검증 게이트 분산** — 사용자가 "어디서 막혔는지" 모름. Phase 3.

### 가장 빠른 ROI 5종 (15분 안)
1. Coach Sync 클릭 (사용자)
2. AI route 5개 maxDuration = 60 명시
3. AI_TOKENS 상수 + 일괄 적용
4. claude.ts 의 anthropic 직접 호출 → invokeAi 마이그 (5 함수)
5. WinningPattern-sections 시드 script 추가

### 가장 큰 leverage (1주 작업)
1. 모든 AI 호출 invokeAi 통합 (16곳)
2. claude.ts 7 파일 분할
3. proposal 분할 호출 (504 위험 영역)
4. 인계 흐름 단일 액션

### "다른 사람들이 봤을 때도 퀄리티 높은 제안서" 의 진짜 leverage
1. 자산 풀 50+ 로 확대 (인터뷰 인제스트 활용)
2. evalCriteria 정확도 모니터링
3. inspectDraft 실시간 호출 (슬롯별)

---

**작성**: 2026-05-03
**다음 결정 필요**: 어느 Phase 부터, 어떤 항목부터 진행할지 사용자 결정.
