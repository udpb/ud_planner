# Express Mode v1.0 — 아키텍처 스펙

> 근거: [ADR-011 Express Mode](../decisions/011-express-mode.md)
> 관련: [ADR-006 ProgramProfile](../decisions/006-program-profile.md) · [ADR-007 Differentiated Research](../decisions/007-step-differentiated-research-flow.md) · [ADR-008 Value Chain](../decisions/008-impact-value-chain.md) · [ADR-009 Asset Registry](../decisions/009-asset-registry.md) · [ADR-010 Content Hub](../decisions/010-content-hub.md)
> 연결: [data-contract.md](data-contract.md) · [asset-registry.md](asset-registry.md) · [content-hub.md](content-hub.md) · [program-profile.md](program-profile.md) · [value-chain.md](value-chain.md) · [quality-gates.md](quality-gates.md)
> 최종: 2026-04-27

---

## 0. 메타

| 항목 | 값 |
|---|---|
| 버전 | v1.0 (초안) |
| 일자 | 2026-04-27 |
| 작성자 | Underdogs UD-Ops 코어 |
| 상태 | Accepted (ADR-011 채택과 동시) |
| 선행 | ADR-001 ~ ADR-010 (특히 ADR-006 / 008 / 009 / 010) |
| 후속 | Phase L Wave (L0~L6) — L1 Gemini fallback 완료, L2 PoC 시작 |
| 본 문서 책임 범위 | Express Track 1차본 흐름의 데이터 모델·챗봇 흐름·UI·자산 인용·Deep 인계의 **구현 계약** |

이 문서는 ADR-011 의 결정을 architecture 차원에서 구체화한다. ADR 본문에 적힌 결정·배경·대안·리스크는 **참조만 하고 중복하지 않는다**. 본 문서는 "L2 PoC 를 즉시 코딩 가능한 수준의 사양" 을 목표로 한다.

---

## 1. 데이터 모델

### 1.1 ExpressDraft — zod schema

`src/lib/express/schema.ts` 에 zod 로 정의한 단일 SSoT. 모든 챗봇 턴의 슬롯 검증·LLM 출력 검증·DB 저장 직전 검증이 이 스키마 한 곳을 통과한다.

```ts
// src/lib/express/schema.ts (Wave L2 신규)
import { z } from 'zod'

/** 의도 — 사업의 한 문장 정체성 */
export const IntentSchema = z
  .string()
  .min(20, '의도는 최소 20자')
  .max(200, '의도는 1줄 (최대 200자)')

/** Before/After — 평가위원 머릿속 그림 */
export const BeforeAfterSchema = z.object({
  before: z.string().min(20).max(300),
  after: z.string().min(20).max(300),
})

/** 키 메시지 — 정확히 3개 */
export const KeyMessagesSchema = z
  .array(z.string().min(8).max(80))
  .length(3, '키 메시지는 정확히 3개')

/** 차별화 자산 인용 — Asset Registry / Content Hub 의 자산 ID 5개 */
export const AssetReferenceSchema = z.object({
  assetId: z.string(),                        // ContentAsset.id
  sectionKey: z.enum([
    'proposal-background',
    'curriculum',
    'coaches',
    'budget',
    'impact',
    'other',
  ]),
  narrativeSnippet: z.string().min(40).max(600),
  acceptedByPm: z.boolean().default(false),   // PM 확정/제외 토글 결과
})
export const DifferentiatorsSchema = z
  .array(AssetReferenceSchema)
  .min(3, '차별화는 최소 3개')
  .max(7, '차별화는 7개를 넘기지 않음 (시각적 부하)')

/** 외부 리서치 근거 — 외부 LLM 카드로 가져온 시장·통계·정책 자료 */
export const ExternalEvidenceSchema = z.object({
  topic: z.string().min(2).max(60),           // '시장 규모', '청년 고용 통계' 등
  source: z.string().min(2).max(200),         // '통계청 2025', 'OECD 2024' 등
  summary: z.string().min(20).max(400),       // PM 또는 외부 LLM 요약
  fetchedVia: z.enum(['pm-direct', 'external-llm', 'auto-extract']),
})
export const EvidenceRefsSchema = z.array(ExternalEvidenceSchema).max(15)

/** 7 섹션 초안 — 각 300~600자 */
export const SectionDraftSchema = z
  .string()
  .min(200, '섹션 초안은 최소 200자')
  .max(800, '섹션 초안은 최대 800자 (1차본은 디테일 X, 방향+차별화)')
export const SectionsSchema = z.object({
  '1': SectionDraftSchema, // 제안 배경 및 목적
  '2': SectionDraftSchema, // 추진 전략 및 방법론
  '3': SectionDraftSchema, // 교육 커리큘럼
  '4': SectionDraftSchema, // 운영 체계 및 코치진
  '5': SectionDraftSchema, // 예산 및 경제성
  '6': SectionDraftSchema, // 기대 성과 및 임팩트
  '7': SectionDraftSchema, // 수행 역량 및 실적
})

/** 메타 — 진행·완성 추적 */
export const ExpressMetaSchema = z.object({
  startedAt: z.string().datetime(),
  lastUpdatedAt: z.string().datetime(),
  isCompleted: z.boolean().default(false),
  completedAt: z.string().datetime().optional(),
  /** 자동 결정된 적용 슬롯 (RFP 따라 유연 — §9 참조) */
  activeSlots: z.array(z.string()),
  /** 자동 결정된 생략 슬롯 */
  skippedSlots: z.array(z.string()),
})

/** 최상위 — Project.expressDraft Json 으로 저장 */
export const ExpressDraftSchema = z.object({
  intent: IntentSchema.optional(),
  beforeAfter: BeforeAfterSchema.optional(),
  keyMessages: KeyMessagesSchema.optional(),
  differentiators: DifferentiatorsSchema.optional(),
  evidenceRefs: EvidenceRefsSchema.optional(),
  sections: SectionsSchema.partial(),         // 점진 채움 — 진행 중엔 일부 키만
  meta: ExpressMetaSchema,
})

export type ExpressDraft = z.infer<typeof ExpressDraftSchema>
```

**필수/optional 정책**:

- 필드 자체는 모두 optional (점진 채움)
- 제출(=`isCompleted=true`) 직전 호출되는 `ExpressDraftSchema.refine(isReadyToSubmit)` 가 **필수 슬롯이 모두 차 있는지** 검사 (§8 참조)
- "필수 슬롯" 은 RFP 가 결정 (§9) — schema 자체가 결정하지 않음

**12 슬롯 카운팅** (ADR-011 §3 의 "12 슬롯"):

| # | 슬롯 키 | zod 정의 |
|---|---|---|
| 1 | `intent` | IntentSchema |
| 2 | `beforeAfter.before` | BeforeAfterSchema.before |
| 3 | `beforeAfter.after` | BeforeAfterSchema.after |
| 4 | `keyMessages[0]` | KeyMessagesSchema[0] |
| 5 | `keyMessages[1]` | KeyMessagesSchema[1] |
| 6 | `keyMessages[2]` | KeyMessagesSchema[2] |
| 7 | `differentiators` (≥3개) | DifferentiatorsSchema |
| 8 | `sections.1` 제안 배경 및 목적 | SectionDraftSchema |
| 9 | `sections.2` 추진 전략 및 방법론 | SectionDraftSchema |
| 10 | `sections.3` 교육 커리큘럼 | SectionDraftSchema |
| 11 | `sections.4` 운영 체계 및 코치진 | SectionDraftSchema |
| 12 | `sections.6` 기대 성과 및 임팩트 | SectionDraftSchema |

`sections.5` (예산), `sections.7` (수행 실적) 은 부차 기능 인용 + 자산 자동 인용으로 **자동 채워지므로 PM 답변이 직접 필요 없는 슬롯** — 12 슬롯 카운트에서 제외 (단 출력에는 포함).

### 1.2 Conversation State — 챗봇 진행

`src/lib/express/conversation.ts` 에서 정의. 챗봇 화면 메모리에 머무르며 일부만 DB 동기화된다.

```ts
// src/lib/express/conversation.ts (Wave L2)
import { z } from 'zod'

export const TurnSchema = z.object({
  id: z.string(),
  role: z.enum(['ai', 'pm']),
  text: z.string(),
  /** 이 턴에서 추출된 슬롯 (LLM Partial Extraction 결과 §4.3) */
  extractedSlots: z.record(z.unknown()).optional(),
  /** 이 턴에서 챗봇이 만든 외부 LLM 프롬프트 (§5.2) */
  externalLookupPrompt: z.string().optional(),
  createdAt: z.string().datetime(),
})

export const ValidationErrorSchema = z.object({
  slotKey: z.string(),
  zodIssue: z.string(),         // zod issue.message
  remediation: z.string(),      // PM 에게 보여줄 해결 가이드
})

export const ExternalLookupRequestSchema = z.object({
  type: z.enum(['pm-direct', 'external-llm', 'auto-extract']),
  topic: z.string(),
  generatedPrompt: z.string().optional(),  // 외부 LLM 카드인 경우만
  checklistItems: z.array(z.string()).optional(),  // PM 직접 카드인 경우만
})

export const ConversationStateSchema = z.object({
  projectId: z.string(),
  turns: z.array(TurnSchema),
  /** 다음 채워야 할 슬롯 — 우선순위 룰(§2.2) 결과 */
  currentSlot: z.string().nullable(),
  /** 외부 답을 기다리는 슬롯 (외부 LLM 카드 띄운 상태) */
  pendingExternalLookup: ExternalLookupRequestSchema.optional(),
  validationErrors: z.array(ValidationErrorSchema),
})

export type ConversationState = z.infer<typeof ConversationStateSchema>
```

ConversationState 는 **DB 영구 저장 안 함**. 새로 진입하면 ExpressDraft + 마지막 턴 N개 (예: 20) 로 재구성. 초기 PoC 는 `localStorage` + 마지막 N 턴 `Project.expressTurnsCache Json?` (선택) 으로 충분.

### 1.3 Prisma 스키마 영향

ADR-011 의 단순화 결정에 따라 **신규 테이블 없이 단일 필드 추가**:

```prisma
model Project {
  // ... 기존 필드 유지 ...

  /** Express Track 1차본 (ExpressDraftSchema) */
  expressDraft         Json?

  /** Express 진입 여부 — true 면 사이드바 기본 진입점이 /express */
  expressActive        Boolean   @default(false)

  /** 마지막 N 턴 캐시 (이탈 후 재진입 회복용, 선택) */
  expressTurnsCache    Json?
}
```

**마이그레이션 1건** (`add-express-draft`):

```sql
ALTER TABLE "Project"
  ADD COLUMN "expressDraft" JSONB,
  ADD COLUMN "expressActive" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "expressTurnsCache" JSONB;
```

**선택지 비교** (ADR-011 결정 = B):

| 선택지 | 장점 | 단점 |
|---|---|---|
| A. 신규 `ExpressDraft` 테이블 (Project 1:1) | 정규화·인덱싱 가능 | 테이블·관계 추가, 마이그 복잡 |
| **B. `Project.expressDraft Json` 단일 필드** ✅ | 마이그 1건, JSON으로 빠른 진화 | 부분 쿼리 어려움 (현 단계 불필요) |

향후 자산 사용 분석·N+1 방지가 필요해지면 A 로 마이그 (Phase L 끝나고 재고).

---

## 2. 챗봇 흐름 (Slot Filling Hybrid)

### 2.1 턴 구조 (입력 → 처리 → 출력)

```
┌──────────────────────────────────────────────────────────────────┐
│                         한 턴의 라이프사이클                       │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  PM 입력 (자유 발화 OR 외부 LLM 답 붙여넣기 OR 카드 클릭)           │
│       │                                                            │
│       ▼                                                            │
│  [Step A] processTurn(state, pmInput)                              │
│       │                                                            │
│       ▼                                                            │
│  [Step B] invokeAi(prompt) — Gemini→Claude fallback                │
│           프롬프트 = currentSlot + recent turns + pmInput          │
│       │                                                            │
│       ▼                                                            │
│  [Step C] safeParseJson(raw) → { extractedSlots,                   │
│                                  nextQuestion,                     │
│                                  externalLookupNeeded?,            │
│                                  validationErrors? }               │
│       │                                                            │
│       ▼                                                            │
│  [Step D] mergeExtractedSlots(draft, extractedSlots)               │
│           각 슬롯이 ExpressDraftSchema 의 부분 검증 통과해야 채택  │
│       │                                                            │
│       ▼                                                            │
│  [Step E] saveDraft(projectId, draft) — debounced 1.5s             │
│       │                                                            │
│       ▼                                                            │
│  [Step F] selectNextSlot(draft) — §2.2 우선순위 룰                 │
│       │                                                            │
│       ▼                                                            │
│  [Step G] UI 렌더 — 좌(다음 질문) + 우(미리보기 갱신)              │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 슬롯 우선순위 룰

`src/lib/express/slot-priority.ts`:

```ts
export function selectNextSlot(
  draft: ExpressDraft,
  rfp: RfpParsed | undefined,
  profile: ProgramProfile | undefined,
): keyof ExpressDraft | null {
  // 1단계: 정체성 (자산 매칭의 키)
  if (!draft.intent) return 'intent'
  if (!draft.beforeAfter?.before || !draft.beforeAfter?.after) return 'beforeAfter'

  // 2단계: 핵심 메시지 (북극성 = "당선 가능한 1차본")
  if (!draft.keyMessages || draft.keyMessages.length < 3) return 'keyMessages'

  // 3단계: 차별화 (자산 자동 인용 결과 PM 검토)
  if (!draft.differentiators || draft.differentiators.length < 3) return 'differentiators'

  // 4단계: 7 섹션 초안 — RFP 평가표 가중치 순
  const sectionOrder = orderSectionsByEvalWeight(rfp?.evalStrategy)
  for (const sec of sectionOrder) {
    if (!draft.sections?.[sec]) return `sections.${sec}` as any
  }

  return null  // 모두 채워짐 — 종료 게이트로
}
```

**규칙**:

1. **intent → beforeAfter → keyMessages → differentiators → sections** 순서 고정 (정체성이 차별화·섹션의 키이므로)
2. **sections 내부 순서는 RFP 평가표 가중치** — 가중치 높은 섹션부터 (PM 의 핵심 시간을 평가위원이 먼저 보는 곳에 투자)
3. 한 슬롯이 검증 실패 시 다음으로 넘어가지 않음 (그 슬롯에 머무름) — 누적 실패 방지 (ADR-011 §"비정형→정형 안전장치 B")

### 2.3 외부 LLM 분기 (3 카드 유형)

ADR-011 §5 의 3 카드 유형을 챗봇 흐름 안에 배치:

| 유형 | 트리거 조건 | UI 카드 | 결과 |
|---|---|---|---|
| 자동 추출 (auto-extract) | RFP 업로드 시 / Asset 매칭 시 | "자산 X 매칭됨, 기본 활용 OK?" 알림만 | PM 토글 → `differentiators[].acceptedByPm` 갱신 |
| PM 직접 (pm-direct) | 시스템이 모를 수 있는 영역 (발주처 의도·경쟁사 정보 등) | "발주처에 통화해 보셨어요?" 카드 + 체크리스트 | PM 답 입력 → 슬롯 추출 |
| 외부 LLM (external-llm) | 시장·통계·정책 등 외부 자료 필요 | "이건 외부 LLM 에 맡기실까요? 프롬프트 만들어드릴게요" | 챗봇이 프롬프트 생성 → PM 이 ChatGPT/Claude 데스크탑 → 답을 챗봇에 붙여넣기 → 슬롯 추출 |

분기 결정은 LLM 이 매 턴 자체적으로 한다 (출력 JSON 의 `externalLookupNeeded` 필드).

```ts
// processTurn 의 응답 JSON 스키마
{
  extractedSlots: { ... },
  nextQuestion: "...",
  externalLookupNeeded?: {
    type: 'pm-direct' | 'external-llm' | 'auto-extract',
    topic: '시장 규모',
    generatedPrompt?: '...',     // external-llm 일 때만
    checklistItems?: ['...'],    // pm-direct 일 때만
  },
  validationErrors?: [...]
}
```

### 2.4 자동 진입점 (RFP 업로드 = 첫 턴 자동)

ADR-011 §6 "자동 인용" 의 진입 패턴:

1. PM 이 `/projects/[id]/express` 진입
2. ExpressDraft 가 비어 있으면 **챗봇이 자동 첫 턴 시작**: "RFP 파일을 올려주세요"
3. PM 이 PDF/DOCX 업로드 → 기존 `parseRfp()` (Phase D) 호출 → `RfpParsed` 저장
4. 챗봇이 자동 두 번째 턴: `RfpParsed` 를 바탕으로 자산 매칭 (`matchAssetsToRfp`, Phase G·H 재사용) → 우측 미리보기 ① 섹션 일부 채움 + 알림 카드 "자산 N 개 매칭됐어요"
5. 세 번째 턴부터 슬롯 채우기 시작 (intent 부터)

### 2.5 종료 조건

```ts
export function isReadyToSubmit(
  draft: ExpressDraft,
  activeSlots: string[],
): { ready: boolean; missingSlots: string[] } {
  const missing: string[] = []
  for (const slot of activeSlots) {
    if (!isSlotFilled(draft, slot)) missing.push(slot)
  }
  return { ready: missing.length === 0, missingSlots: missing }
}
```

- `activeSlots` = §9 의 RFP 따라 자동 결정된 적용 슬롯
- PM 이 "1차본 승인" 클릭 시 zod 전체 검증 수행. 실패 시 visible 표시, 강제 차단 X (ADR-011 §"안전장치 D")

---

## 3. UI 화면 구조

### 3.1 단일 화면 레이아웃

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [북극성 진행 바] RFP ●━━ 의도 ●━━ 차별화 ○━━ 섹션 ○━━ 1차본 (5%)         │
├──────────────────────────────────────┬──────────────────────────────────┤
│                                      │                                  │
│  좌측 챗봇 영역 (40%)                │  우측 1차본 미리보기 (55%)         │
│                                      │                                  │
│  ┌──────────────────────────────┐    │  ┌────────────────────────────┐  │
│  │ AI: 발주처가 풀고싶은 진짜    │    │  │ 한 줄 요약: "지역 청년 창   │  │
│  │     문제는 무엇인가요?       │    │  │  업의 회복 탄력성 강화"     │  │
│  │ PM: 청년 인구 유출이 핵심...  │    │  └────────────────────────────┘  │
│  └──────────────────────────────┘    │                                  │
│                                      │  ① 제안 배경 및 목적 ✅            │
│  [자유 입력 + Enter]                 │  ② 추진 전략 및 방법론 🟦          │
│                                      │  ③ 교육 커리큘럼 🟦                │
│  ▼ 다음 행동 1개                      │  ④ 운영 체계 및 코치진 ⬜          │
│  ┌──────────────────────────────┐    │  ⑤ 예산 및 경제성 ⬜               │
│  │ 외부 LLM 카드                │    │  ⑥ 기대 성과 및 임팩트 ⬜          │
│  │ 시장 규모 통계가 필요해요.    │    │  ⑦ 수행 역량 및 실적 ⬜            │
│  │ 프롬프트 복사하기 [📋]       │    │                                  │
│  │ ChatGPT 답 붙여넣기:         │    │  ┌────────────────────────────┐  │
│  │ [____________________]       │    │  │ 부차 기능 (자동 인용)       │  │
│  └──────────────────────────────┘    │  │ • SROI 1:3.2 (벤치마크)    │  │
│                                      │  │ • 예산 5.4억, 마진 안전 ✓  │  │
│  ▼ 부차 기능 접힘 (심화로 가기)       │  │ • 코치 매칭 12명 (도시재생) │  │
│  ▶ SROI 정밀 산출                    │  │                            │  │
│  ▶ 예산 분해                         │  └────────────────────────────┘  │
│  ▶ 코치 정밀 배정                    │                                  │
│                                      │                                  │
└──────────────────────────────────────┴──────────────────────────────────┘
```

### 3.2 7 UI 장치 (ADR-011 §6 구체화)

| # | 장치 | 위치 | 구현 컴포넌트 | 동작 |
|---|---|---|---|---|
| 1 | 북극성 진행 바 | 상단 (5%) | `<NorthStarBar>` | 5단계 (RFP/의도/차별화/섹션/1차본) 각 단계 progress 0~100% |
| 2 | 핵심 메시지 1줄 카드 | 우측 최상단 | `<KeyMessageCard>` | `draft.keyMessages[0]` 또는 `draft.intent` 1줄 |
| 3 | 점진 미리보기 | 우측 중앙 | `<ExpressPreview>` | 7 섹션 카드 ⬜→🟦→✅ 상태별 색·아이콘 |
| 4 | 다음 행동 1개 | 좌측 하단 | `<NextActionCard>` | `state.currentSlot` 기반 단 1개 카드 |
| 5 | 부차 기능 접힘 | 좌측 하단 | `<DeepLinks>` 접힘 | "심화로 가기" 클릭 → Step 4·5·3 으로 이동 |
| 6 | Asset 자동 주입 알림 | 챗봇 메시지로 | `<AssetMatchToast>` | 매칭 시 "자산 X 가 ② 섹션에 인용됐어요" 토스트 |
| 7 | 자동 저장 | 백그라운드 | `useExpressAutosave()` | debounce 1500ms 마다 `POST /api/express/save` |

### 3.3 부차 기능 1줄 인용 (ADR-011 §8)

우측 미리보기 하단의 "부차 기능 (자동 인용)" 박스에 표시. **클릭하면 Deep Track Step 으로 이동** (ADR-011 §"두 트랙 정체").

| 기능 | 1차본 인용 형태 (1줄) | 산출 로직 (PoC L4) | 클릭 시 Deep 이동 |
|---|---|---|---|
| SROI | `예상 SROI 1:3.2 (Benchmark 기반)` | `getBenchmarkSroi(profile)` — Phase F 의 benchmark 자산 활용 | Step 5 정밀 SROI Forecast |
| 예산 | `총 예산 5.4억, 마진 안전 ✓` | `estimateMarginSafety(rfp.totalBudgetVat, profile)` | Step 4 PC/AC 분해 |
| 코치 | `필요 역량 3종 — 매칭 가능 코치 12명` | `countMatchingCoaches(profile.businessDomain, profile.targetStage)` | Step 3 코치 배정 |
| 커리큘럼 | `회차 8 · IMPACT 6단계 매핑` | `quickCurriculumOutline(rfp, profile)` | Step 2 회차별 설계 |

각 박스에 `<HelpTip>` 으로 "이건 추정치 — 정밀화 시 [Deep] 에서" 라벨 (ADR-011 리스크 §"부차 기능 자동 인용이 부정확").

---

## 4. AI 호출 패턴

### 4.1 invokeAi 활용 (Phase L1 완료)

`src/lib/ai-fallback.ts` 의 `invokeAi(params)` 를 모든 Express 챗봇 턴에서 사용.

- 우선 Gemini 3.1 Pro (`GEMINI_API_KEY` 있을 때) → 실패 시 Claude Sonnet 4.6 자동 fallback
- `maxTokens` = 8192 (일반 턴) / 16384 (1차본 일괄 생성 — L2 종반)
- `temperature` = 0.4 (사실 우선) / 0.7 (창의 — keyMessages 생성)
- 프롬프트는 모델 무관 동일

### 4.2 프롬프트 템플릿

`src/lib/express/prompts.ts`:

```ts
export function buildTurnPrompt(input: {
  state: ConversationState
  draft: ExpressDraft
  rfp?: RfpParsed
  profile?: ProgramProfile
  matchedAssets?: AssetMatch[]
  pmInput: string
  currentSlot: string
}): string {
  return `
당신은 언더독스 AI 공동기획자입니다. PM 과 함께 RFP 를 보고 30~45분 안에
"당선 가능한 1차본"을 만드는 챗봇으로 작동합니다.

[현재 단계]
- 채울 슬롯: ${input.currentSlot}
- 이미 채워진 슬롯: ${listFilledSlots(input.draft)}

[RFP 요약]
${formatRfpBrief(input.rfp)}

[ProgramProfile 11축 요약]
${formatProfile(input.profile)}

[매칭된 UD 자산 Top 5]
${formatAssetMatches(input.matchedAssets)}

[최근 대화 (최대 5턴)]
${formatRecentTurns(input.state.turns, 5)}

[PM 의 이번 답]
${input.pmInput}

────────────────────────────────────────────
당신의 일:
1. PM 의 답에서 "${input.currentSlot}" 슬롯 값을 추출
2. 추출된 값이 zod schema 통과 가능 여부 판단
3. 다음 질문 1개 생성 (또는 외부 LLM 카드 제안)
4. 결과를 JSON 으로 출력 — trailing comma 금지

출력 JSON 스키마:
{
  "extractedSlots": { "<slotKey>": <value>, ... },
  "nextQuestion": "다음 PM 에게 던질 질문 (또는 \"\" 면 카드만)",
  "externalLookupNeeded": {
    "type": "pm-direct" | "external-llm" | "auto-extract",
    "topic": "...",
    "generatedPrompt": "외부 LLM 에 던질 프롬프트 (external-llm 일 때만)",
    "checklistItems": ["체크리스트 1", "체크리스트 2"]  // pm-direct 일 때만
  } | null,
  "validationErrors": [
    { "slotKey": "...", "issue": "...", "remediation": "..." }
  ]
}

JSON 만 출력. 설명·주석·마크다운 코드펜스 없이.
`.trim()
}
```

### 4.3 Partial Extraction

매 턴 LLM 응답을 `extractedSlots` 객체로 받아 **즉시 우측 미리보기 갱신**. 누적 실패 방지.

```ts
async function processTurn(input: ProcessTurnInput): Promise<ProcessTurnResult> {
  const prompt = buildTurnPrompt(input)
  const { raw } = await invokeAi({
    prompt,
    maxTokens: 8192,
    temperature: 0.4,
    label: 'express-turn',
  })

  const parsed = safeParseJson<TurnResponse>(raw)
  if (!parsed.ok) {
    // 파싱 실패 시 자동 1회 재시도 (ai-fallback 이 다른 모델로)
    return { ok: false, error: 'JSON 파싱 실패', shouldRetry: true }
  }

  // 부분 슬롯 검증 — 통과한 것만 draft 에 머지
  const safeExtracted = filterValidSlots(parsed.value.extractedSlots, ExpressDraftSchema)
  const newDraft = mergeExtractedSlots(input.draft, safeExtracted)

  return {
    ok: true,
    nextQuestion: parsed.value.nextQuestion,
    externalLookupNeeded: parsed.value.externalLookupNeeded ?? undefined,
    extractedSlots: safeExtracted,
    newDraft,
  }
}
```

`safeParseJson` 은 `src/lib/claude.ts` 의 강화 버전 (Phase L1 에서 trailing comma·여는·닫는 펜스 제거 등) 사용.

---

## 5. 외부 리서치 분기

ADR-011 §5 의 3 카드 유형을 UI·데이터로 구체화. ADR-007 의 "스텝 차별화 리서치" 와 동일 정신이지만 카드 패턴으로 진화.

### 5.1 PM 직접 카드

**용례**: 발주처 의도, 경쟁사 정보, 내부 인사 정보 — 시스템이 알 수 없는 영역.

```
┌────────────────────────────────────────────┐
│ 📞 PM 직접 카드                              │
├────────────────────────────────────────────┤
│ 토픽: "발주처가 평가에서 진짜 원하는 것"     │
│                                            │
│ 체크리스트:                                 │
│ ☐ 발주 담당자에게 전화로 물어볼 항목 3개     │
│   1. 작년 우승 제안서의 어떤 점이 마음에 들었나│
│   2. 평가 위원 구성 (학계/실무 비율)         │
│   3. 사업의 정치적·기관 내 우선순위           │
│ ☐ 통화 후 답을 아래에 입력                  │
│                                            │
│ [PM 입력 자유 텍스트]                       │
│ ____________________________________       │
└────────────────────────────────────────────┘
```

PM 이 입력 시 → `processTurn(input='[발주처 통화 결과] ...')` → 챗봇이 슬롯 추출.

### 5.2 외부 LLM 카드

**용례**: 시장·통계·정책 등 외부 LLM 의 검색·요약 능력이 필요한 영역.

```
┌────────────────────────────────────────────┐
│ 🔍 외부 LLM 카드                             │
├────────────────────────────────────────────┤
│ 토픽: "지역 청년 창업 시장 규모 (2024-2026)" │
│                                            │
│ AI 가 만든 프롬프트 (복사해서 ChatGPT 등에): │
│ ┌──────────────────────────────────────┐   │
│ │ 한국의 지역(비수도권) 청년 창업 시장 │   │
│ │ 규모와 정부 지원 사업 예산 추이를     │   │
│ │ 2024~2026년 통계청·중기부 자료 기반  │   │
│ │ 으로 정리해줘. 출처 명시.             │   │
│ │                          [📋 복사]    │   │
│ └──────────────────────────────────────┘   │
│                                            │
│ 답 받아서 여기에 붙여넣기:                  │
│ ____________________________________       │
└────────────────────────────────────────────┘
```

PM 이 외부 답을 붙여넣으면 → 챗봇이 슬롯 추출 + `evidenceRefs[]` 에 `{ topic, source, summary, fetchedVia: 'external-llm' }` 자동 추가.

### 5.3 자동 추출 카드

**용례**: RFP 파싱, 자산 매칭, 유사 프로젝트 — 시스템이 자동 처리하고 PM 에겐 알림만.

```
┌────────────────────────────────────────────┐
│ 🌱 자동 추출 알림                            │
├────────────────────────────────────────────┤
│ "Alumni Hub (10년 25,000명)" 자산이         │
│ ② 추진 전략 및 방법론 섹션에 인용됐어요.    │
│                                            │
│ [확정] [제외] [수정]                         │
└────────────────────────────────────────────┘
```

PM 클릭 → `differentiators[].acceptedByPm = true/false` 갱신 → 즉시 미리보기 반영.

---

## 6. 자산 자동 인용 (Asset Registry / Content Hub 활용)

### 6.1 자산 매칭 트리거

Phase G·H 의 `matchAssetsToRfp(params)` 를 **그대로 재사용** — Express 의 핵심 엔진.

```ts
// src/app/(dashboard)/projects/[id]/express/page.tsx 서버 컴포넌트
import { matchAssetsToRfp } from '@/lib/asset-registry'

const matches = await matchAssetsToRfp({
  rfp: project.rfp.parsed,
  profile: project.programProfile,
  limit: 10,
  minScore: 0.5,  // Express 는 v1 의 0.3 보다 높게 — 1차본 단계라 강한 매칭만
})
```

트리거 시점:

1. RFP 업로드 직후 (자동 첫 턴, §2.4)
2. PM 이 ProgramProfile 11축 보정한 직후 (재매칭)
3. PM 이 `keyMessages` 입력 직후 (메시지 일치도 점수 가산)

### 6.2 narrativeSnippet 주입

매칭된 자산의 `narrativeSnippet` 이 자동으로 sections 에 인용. PM 은 알림 카드(§5.3)로 확정/제외만.

```ts
// 자산 → ExpressDraft 인용 변환
function pourAssetIntoSection(
  match: AssetMatch,
  sections: ExpressDraft['sections'],
): ExpressDraft['sections'] {
  const sec = match.section  // 'proposal-background' → '1', 'curriculum' → '3' 매핑
  const sectionKey = SECTION_KEY_MAP[match.section]
  return {
    ...sections,
    [sectionKey]:
      (sections[sectionKey] ?? '') +
      `\n\n[자산: ${match.asset.name}]\n${match.asset.narrativeSnippet}`,
  }
}
```

이 로직은 ADR-009 §"Step 6 제안서 생성 시 주입" 와 동일하지만 **1차본 단계에서 미리** 일어난다 (Phase G 의 의도를 더 일찍 실현).

### 6.3 부각도 측정 (차별화 강도)

```ts
export function calcDifferentiatorStrength(draft: ExpressDraft): {
  count: number
  diversityScore: number
  recommendation: string
} {
  const accepted = draft.differentiators?.filter((d) => d.acceptedByPm) ?? []
  const evidenceTypes = new Set(/* ... 자산별 evidenceType 집계 */)
  return {
    count: accepted.length,
    diversityScore: evidenceTypes.size / 4,  // 4 evidence type 다양성
    recommendation:
      accepted.length < 5 ? '자산 5개 이상 권장' :
      evidenceTypes.size < 3 ? 'evidence 다양성 보강 권장' : '충분',
  }
}
```

---

## 7. 1차본 → Deep Track 인계

### 7.1 Express 종료 조건

```ts
function canSubmitDraft(draft: ExpressDraft, activeSlots: string[]): boolean {
  const validation = ExpressDraftSchema.safeParse(draft)
  if (!validation.success) return false

  const { ready } = isReadyToSubmit(draft, activeSlots)
  return ready
}
```

PM 이 "1차본 승인" 클릭 → `draft.meta.isCompleted = true`, `completedAt = now()` 저장.

### 7.2 Deep 진입점

Express 종료 시점에 자동 표시:

```
┌──────────────────────────────────────────────────────┐
│ 🎯 1차본 완성! 정밀화 권장 영역                       │
├──────────────────────────────────────────────────────┤
│ • SROI 정밀 산출 — 발주처 평가표 임팩트 25%로 확정   │
│   필요. [Step 5 로 이동 →]                          │
│                                                      │
│ • 예산 PC/AC 분해 — 마진 안전 범위 ±5% 정밀화 필요. │
│   [Step 4 로 이동 →]                                │
│                                                      │
│ • 커리큘럼 회차별 설계 — 1차본은 회차 8개 큰 그림. │
│   [Step 2 로 이동 →]                                │
└──────────────────────────────────────────────────────┘
```

추천 룰 (`src/lib/express/deep-suggestions.ts`):

```ts
function suggestDeepAreas(
  draft: ExpressDraft,
  rfp: RfpParsed,
): DeepSuggestion[] {
  const out: DeepSuggestion[] = []

  // SROI 정밀 — 평가표 임팩트 가중치 ≥20%
  if ((rfp.evalStrategy?.sectionWeights?.impact ?? 0) >= 0.20) {
    out.push({ targetStep: 'impact', reason: '평가표 임팩트 ≥20%' })
  }

  // 예산 정밀 — 5억 이상
  if ((rfp.totalBudgetVat ?? 0) >= 500_000_000) {
    out.push({ targetStep: 'budget', reason: '예산 5억 이상' })
  }

  // 커리큘럼 정밀 — 항상 (1차본은 큰 그림만)
  out.push({ targetStep: 'curriculum', reason: '회차별 설계 필요' })

  return out
}
```

### 7.3 Express 데이터의 Deep 에서 활용

ExpressDraft → 기존 PipelineContext 슬라이스로 자동 매핑:

| ExpressDraft 필드 | → Project / PipelineContext 매핑 |
|---|---|
| `intent` | `Project.proposalConcept` |
| `keyMessages` | `Project.keyPlanningPoints` (배열) |
| `beforeAfter.before` + `.after` | `Project.proposalBackground` (합쳐서) |
| `evidenceRefs[]` | `ResearchItem[]` (Step 1 의 research) |
| `differentiators[]` | `Project.acceptedAssetIds JSON` (Phase G·H 의 필드) |
| `sections.1` ~ `.7` | `ProposalSection[].draft` (Step 6 의 ProposalSection 7건 초기값) |

매핑은 `src/lib/express/handoff.ts` 의 `mapDraftToContext(draft, project)` 함수가 담당. Deep 진입 시 자동 호출.

---

## 8. 검증 게이트 (Quality Gates 매핑)

기존 [quality-gates.md](quality-gates.md) 의 4계층을 Express 에 그대로 매핑:

### 8.1 Gate 1 — 구조 (zod schema)

- `ExpressDraftSchema.safeParse(draft)` — 매 자동 저장 직전
- 통과해야 DB 저장 (실패 시 `validationErrors` 에 누적, UI 표시)

### 8.2 Gate 2 — 룰 (각 슬롯 길이·내용 제약)

- `intent` ≥ 20자 / `keyMessages` 정확히 3개 / `differentiators` ≥ 3개 (zod refine)
- `sections.<n>` 200~800자 (zod refine)
- `beforeAfter.before` 와 `.after` 가 너무 비슷하면 경고 (별도 룰 — `validateBeforeAfterDistance()`)

### 8.3 Gate 3 — AI (검수 에이전트, Phase L5)

ADR-011 §리스크 + 사용자 요청 항목. **L5 에서 구현**:

```ts
// src/lib/express/inspector.ts (L5)
async function inspectDraft(draft: ExpressDraft, rfp: RfpParsed): Promise<{
  passed: boolean
  issues: InspectorIssue[]
}> {
  // AI 가 7 섹션 초안을 평가위원 시각으로 점검:
  //  - 제1원칙 (시장·통계·문제정의·Before/After) 충족
  //  - keyMessages 가 sections 에 골고루 녹아있는지
  //  - differentiators 가 sections 에 인용됐는지
  //  - 데이터·통계 사용 정확도
}
```

### 8.4 Gate 4 — 사람 (PM 최종 승인)

- "1차본 승인" 버튼 클릭이 Gate 4
- 승인 후 Deep Track 으로 인계 (§7)

---

## 9. RFP 따라 유연한 슬롯

### 9.1 슬롯 우선순위 룰

ADR-011 §7 "RFP 따라 유연한 슬롯" 의 결정 자동화:

```ts
// src/lib/express/active-slots.ts
export function computeActiveSlots(
  rfp: RfpParsed,
  profile: ProgramProfile,
): { active: string[]; skipped: string[] } {
  const REQUIRED_ALWAYS = [
    'intent', 'beforeAfter.before', 'beforeAfter.after',
    'keyMessages.0', 'keyMessages.1', 'keyMessages.2',
    'differentiators',
    'sections.1', 'sections.2', 'sections.3', 'sections.4', 'sections.6',
  ]

  const conditional: string[] = []
  const skipped: string[] = []

  // 평가표 가중치 ≥20% 인 영역 = 필수
  const weights = rfp.evalStrategy?.sectionWeights ?? {}
  if ((weights.impact ?? 0) >= 0.20) conditional.push('sections.6_detailed')
  if ((weights.coaches ?? 0) >= 0.15) conditional.push('sections.4_detailed')

  // ProgramProfile 일치 영역 = 필수
  if (profile.methodology.primary === '글로벌진출') {
    conditional.push('global_partner_evidence')
  }

  return {
    active: [...REQUIRED_ALWAYS, ...conditional],
    skipped,
  }
}
```

### 9.2 자동 슬롯 적용 결정

- RFP 파싱 직후 (`parseRfp` 응답 도착 시) 자동 호출
- 결과는 `draft.meta.activeSlots` / `draft.meta.skippedSlots` 에 저장
- **PM 에게 보이지 않음** (백그라운드)
- selectNextSlot 이 activeSlots 만 순회

---

## 10. Phase L Wave 분해

ADR-011 §"구현 스코프" 와 일치. 의존성 표시.

| Wave | 이름 | 산출물 | 의존성 | 상태 |
|---|---|---|---|---|
| **L0** | 문서 (이 세션) | ADR-011 + architecture/express-mode.md (이 문서) + journey + 6 문서 싱크 | — | 진행 중 |
| **L1** | AI 안정화 | Gemini 3.1 Pro + `invokeAi()` + max_tokens 16384 + safeParseJson 강화 | — | ✅ 완료 (2026-04-27) |
| **L2** | PoC: 단일 화면 | `/projects/[id]/express` 페이지 + `<ExpressChat>` + `<ExpressPreview>` + `<NorthStarBar>` + ExpressDraft schema + `/api/express/save` API + 자동 저장 (debounced) | L0, L1 | 다음 |
| **L3** | 외부 LLM 분기 + 자산 자동 인용 | 3 카드 유형 (PM 직접 / 외부 LLM / 자동 추출) + `matchAssetsToRfp` 자동 호출 + narrativeSnippet 자동 주입 + 알림 토스트 | L2 | 후속 |
| **L4** | 부차 기능 1줄 인용 | SROI 추정 (벤치마크 기반) + 예산 마진 안전 1줄 + 코치 카테고리 1줄 + Deep 이동 링크 | L2 (자산 매칭은 L3 와 독립) | 후속 |
| **L5** | 검수 에이전트 | AI 답변 품질 자동 점검 (`inspectDraft`) + 1차본 완성 후 자동 평가 + 문제 발견 시 PM 알림 | L2 | 후속 |
| **L6** | Express + Deep 통합 | Deep 진입점 자동 안내 (`suggestDeepAreas`) + ExpressDraft → Project 슬라이스 매핑 (`mapDraftToContext`) + 통합 운영 검증 | L2~L5 | 마지막 |

```
L0 ──────► L2 ─┬──► L3 ───┐
       L1 ─┘   ├──► L4 ───┼──► L6
               └──► L5 ───┘
```

L3·L4·L5 는 **L2 만 끝나면 병렬 가능**. L6 는 모두 끝나야 시작.

---

## 11. 호환성 + 마이그레이션

### 11.1 기존 6 step 영향

- 6 step 은 **Deep Track 으로 그대로 유지** (ADR-011 §"두 트랙 정체")
- 기존 코드·UI·라우트(`/projects/[id]/step-rfp`, `/step-curriculum` 등) **변경 없음**
- 사이드바 진입점만 신규 프로젝트는 `/express` 로 (Express 활성 시), 기존은 그대로

### 11.2 기존 데이터 호환

| 기존 상태 | Express 진입 가능? | 동작 |
|---|---|---|
| 신규 프로젝트 (스텝 전혀 진행 X) | ✅ | Express 부터 시작 |
| 부분 진행 (Step 1 만) | ✅ (선택) | RFP 데이터 자동 인계, 의도부터 시작 |
| 절반 이상 진행 (Step 3 까지) | ❌ | Deep Track 만 사용 (Express 띄우면 혼동) |
| 6 step 모두 완료 | ❌ | Deep 만 — 수정·재생성 시에도 Deep |

판정 룰:

```ts
function canEnterExpress(project: Project): boolean {
  if (project.expressDraft?.meta?.isCompleted) return true  // 이미 한 번 완성
  const filledSteps = countFilledSteps(project)
  return filledSteps <= 1  // RFP 까지만 채워진 상태면 OK
}
```

### 11.3 데이터 매핑 (Deep 인계)

§7.3 의 매핑이 핵심. 양방향:

- **Express → Deep**: PM 이 "정밀화" 클릭 시 `mapDraftToContext()` 자동 실행, Deep 의 PipelineContext 가 이미 채워진 상태에서 시작
- **Deep → Express** (드뭄): 회귀 케이스. PM 이 다시 1차본 단계로 돌아가고 싶을 때. 현재 PoC 에선 Deep → Express 매핑 미구현 (필요 시 L6 에서 추가)

---

## 12. 변경 이력

| 일자 | 버전 | 변경 |
|---|---|---|
| 2026-04-27 | v1.0 | 초안 — ADR-011 채택과 동시 작성. 12 섹션 구조, zod schema 5종, ASCII 화면 다이어그램, Phase L Wave 분해. |

---

## 부록 A. 핵심 파일·경로 요약

| 위치 | 역할 | Wave |
|---|---|---|
| `src/lib/express/schema.ts` | ExpressDraft zod schema | L2 |
| `src/lib/express/conversation.ts` | ConversationState 타입 | L2 |
| `src/lib/express/slot-priority.ts` | selectNextSlot | L2 |
| `src/lib/express/prompts.ts` | buildTurnPrompt | L2 |
| `src/lib/express/active-slots.ts` | computeActiveSlots | L2 |
| `src/lib/express/handoff.ts` | mapDraftToContext, suggestDeepAreas | L6 |
| `src/lib/express/inspector.ts` | inspectDraft | L5 |
| `src/lib/express/auto-citations.ts` | SROI/예산/코치 1줄 인용 산출 | L4 |
| `src/app/(dashboard)/projects/[id]/express/page.tsx` | Express 진입 페이지 | L2 |
| `src/components/express/ExpressChat.tsx` | 좌측 챗봇 | L2 |
| `src/components/express/ExpressPreview.tsx` | 우측 미리보기 | L2 |
| `src/components/express/NorthStarBar.tsx` | 상단 진행 바 | L2 |
| `src/components/express/cards/PmDirectCard.tsx` | PM 직접 카드 | L3 |
| `src/components/express/cards/ExternalLlmCard.tsx` | 외부 LLM 카드 | L3 |
| `src/components/express/cards/AutoExtractCard.tsx` | 자동 추출 카드 | L3 |
| `src/app/api/express/save/route.ts` | 자동 저장 API | L2 |
| `src/app/api/express/turn/route.ts` | 챗봇 턴 처리 API | L2 |
| `src/lib/asset-registry.ts` | 기존 — `matchAssetsToRfp` 재사용 | (기존) |
| `src/lib/ai-fallback.ts` | 기존 — `invokeAi()` 재사용 | (L1 완료) |
| `src/lib/proposal-ai.ts` | 기존 — `PROPOSAL_SECTION_SPEC` 7 섹션 재사용 | (기존) |
| `prisma/schema.prisma` | `Project.expressDraft Json?` 추가 | L2 |

## 부록 B. 기존 PRD-v6.0 / STATE.md / ROADMAP 와의 관계

| 문서 | 충돌 가능성 | 조치 |
|---|---|---|
| PRD-v6.0 | "6 step 파이프라인이 메인" 표현 → ADR-011 의 "Express 메인 / Deep 옵션" 과 충돌 | PRD-v6.0 의 "Tracks" 섹션 추가 또는 v6.1 발행 (후속) |
| STATE.md | 현재 Phase H 까지 완료로 기록 → Phase L 추가 필요 | Phase L Wave 진행 따라 갱신 |
| ROADMAP.md | 6-Phase 체크리스트 (A~F) 가 메인 → Phase G·H·L 누락 | L0 동시에 Phase L Wave 추가 (별도 작업) |
| CLAUDE.md "설계 철학" | 1~9번 중 9번 (Value Chain) 까지. ADR-011 의 "Express 메인" 추가 필요 | 설계 철학 10번 추가 (별도 작업) |

이 문서는 **본문에서 충돌을 일으키지 않음** — Deep Track 설계는 그대로 유지하고 Express 만 추가하는 패턴이라 6 step·Phase A~H 모두 보존된다.
