# Phase 4 Brief: Recommendation Engine (5-Stage Hybrid)

## 🎯 Mission (1 sentence)
Build a 5-stage hybrid recommendation engine that takes a `PlanningIntent` (RFP + PM's captured strategic context) and returns the Top 10 coaches from the 800-coach pool with explicit reasoning, using a combination of Claude-powered query enrichment, PostgreSQL structured filtering/scoring, and Claude semantic reranking.

---

## 📋 Context

You are working in the `ud-ops-workspace` project. This is Phase 4 of a 6-phase Planning Agent system. By the time you start, these should already exist:

### From Phase 1 (main session)
- `src/lib/planning-agent/types.ts` — defines `PlanningIntent`, `AgentState`, etc.
- `src/lib/planning-agent/intent-schema.ts` — PlanningIntent schema + validation
- `src/lib/planning-agent/question-bank.ts` — interview questions
- `src/lib/planning-agent/agent.ts` — agent loop

### From Phase 2 (main session)
- Prisma models: `PlanningIntent`, `AgentSession`, `PMFeedback`

### From Phase 3 (Agent C)
- All 800 coaches enriched with: `domainTags`, `skillTags`, `strengthSummary`, `idealProjectTypes`, `searchKeywords`
- `src/lib/planning-agent/enrich.ts` exists

### What you are building
The 5 stages of recommendation:

| Stage | Input | Processing | Output |
|-------|-------|------------|--------|
| **1** | `PlanningIntent` | Claude enriches into searchable query (core_competencies, domain_keywords, archetype, filters) | `RecommendationQuery` |
| **2** | `RecommendationQuery` | PostgreSQL hard filter | 800 → ~200 coaches |
| **3** | ~200 coaches + query | Structured scoring (code, fast) | 200 → Top 50 with scores |
| **4** | Top 50 + full context | Claude semantic reranking | Top 10 with reasoning |
| **5** | Top 10 | 4-layer support structure mapping | Final result |

---

## ✅ Prerequisites (must be true before starting)

1. Working directory: `c:\Users\USER\projects\ud-ops-workspace`
2. `src/lib/planning-agent/types.ts` exists and exports `PlanningIntent` type. If not, STOP — Phase 1 not done.
3. `src/lib/planning-agent/intent-schema.ts` exists. If not, STOP — Phase 1 not done.
4. Coach table has all 5 enrichment fields populated for ≥95% of coaches. Verify:
   ```ts
   const enrichedCount = await prisma.coach.count({
     where: { enrichedAt: { not: null } }
   })
   // Should be ≥760 out of 800
   ```
   If enrichment not done, STOP — Phase 3 not done.
5. `.env` has `ANTHROPIC_API_KEY`
6. `npx tsc --noEmit` currently passes

If ANY prerequisite fails, STOP and report exactly which one is missing.

---

## 📖 Read These Files First (in order)

### Type contracts (CRITICAL — read first)
1. `src/lib/planning-agent/types.ts` — **study `PlanningIntent` carefully**. All your code must accept this exact shape.
2. `src/lib/planning-agent/intent-schema.ts` — validation helpers
3. `src/lib/planning-agent/enrich.ts` — understand the coach enrichment shape (so you know what tags look like)
4. `prisma/schema.prisma` — find the `Coach` model with enrichment fields + `PlanningIntent` model (if Phase 2 added it)

### Supporting utilities
1. `src/lib/claude.ts` — use `anthropic`, `CLAUDE_MODEL`, `safeParseJson`
2. `src/lib/ud-brand.ts` — optionally use `buildBrandContext()` for rerank context
3. `src/lib/planning-agent/prompts.ts` — if exists, check for prompt helpers

### Reference patterns
1. `src/app/api/ai/curriculum/route.ts` — see how existing AI routes work in this project
2. `src/app/api/ai/proposal/route.ts` — another reference pattern, has PATCH/PUT examples
3. `scripts/migrate-coaches-json.ts` — Prisma + PG adapter pattern

### Memory context (for domain understanding)
In `C:\Users\USER\.claude\projects\c--Users-USER-projects-ud-ops-workspace\memory\`:
1. `ud_education_methodology.md` — IMPACT 18 modules, ACTT, 5D
2. `ud_proposal_patterns.md` — 4-layer support structure, key messages

---

## 🎯 Scope

### ✅ You CAN create
- `src/lib/planning-agent/recommend.ts` — main orchestrator
- `src/lib/planning-agent/scoring.ts` — structured scoring logic (Stage 3)
- `src/lib/planning-agent/rerank.ts` — Claude semantic reranking (Stage 4)
- `src/lib/planning-agent/recommendation-types.ts` — types for Query/Result/Scored/etc.
- `src/app/api/agent/recommend/route.ts` — POST endpoint

### ❌ You MUST NOT touch
- `src/lib/planning-agent/types.ts` — Phase 1's output, frozen
- `src/lib/planning-agent/intent-schema.ts` — Phase 1's output, frozen
- `src/lib/planning-agent/enrich.ts` — Phase 3's output, frozen
- `src/lib/claude.ts`, `src/lib/ud-brand.ts` — frozen
- `prisma/schema.prisma` — no schema changes
- `src/components/**` — no UI work
- `src/app/(dashboard)/**` — no existing page changes
- `src/app/(lab)/coach-finder/**` — Phase 5's territory
- `package.json` — no new dependencies

---

## 🛠 Tasks (numbered steps)

### Step 1: Design types
Create `src/lib/planning-agent/recommendation-types.ts`:

```typescript
// Stage 1 output: enriched query
export interface RecommendationQuery {
  coreCompetencies: string[]      // ["BM 검증", "투자 피칭", "IR 코칭"]
  domainKeywords: string[]         // ["핀테크", "금융", "투자유치", "VC"]
  coachArchetype: string           // one-sentence ideal coach description
  mandatoryFilters: {
    minTier?: 'TIER1' | 'TIER2' | 'TIER3'
    regions?: string[]
    mustHaveExpertise?: string[]
    startupStageMatch?: string     // from idealProjectTypes vocabulary
  }
  niceToHaves: {
    languages?: string[]
    hasStartupExperience?: boolean
    minSatisfaction?: number
    preferredCategories?: string[]
  }
  coachCount: number               // how many to recommend (default 10)
}

// Stage 3 output: scored coach
export interface ScoredCoach {
  coachId: string
  name: string
  tier: string
  category: string
  score: number
  scoreBreakdown: {
    domainMatch: number          // max 20
    skillMatch: number           // max 20
    tierBonus: number            // max 15
    satisfaction: number         // max 10
    careerYears: number          // max 10
    regionMatch: number          // max 10
    availability: number         // max 5
    enrichmentBonus: number      // max 10 (if enriched, some bonus for quality)
  }
  // denormalized for Stage 4
  strengthSummary: string | null
  domainTags: string[]
  skillTags: string[]
  idealProjectTypes: string[]
  organization: string | null
  position: string | null
  careerYears: number | null
}

// Stage 4 output: final recommendation
export interface CoachRecommendation {
  coachId: string
  name: string
  tier: string
  rank: number
  finalScore: number               // 0-100 normalized
  reasoning: string                // Claude-generated "왜 이 코치인지"
  supportLayer: 'main' | 'sub' | 'special' | 'mentor'  // 4-layer mapping
  relevantStrengths: string[]      // 2-3 highlighted strengths
  concerns: string[]               // any caveats (low availability, etc.)
  photoUrl: string | null
  organization: string | null
  position: string | null
}

// Full response
export interface RecommendationResponse {
  query: RecommendationQuery
  totalCandidates: number          // 800 initially
  afterHardFilter: number          // ~200
  afterScoring: number             // Top 50
  recommendations: CoachRecommendation[]  // Top 10
  metadata: {
    processingTimeMs: number
    stagesCompleted: number
    totalCost?: number
  }
}
```

### Step 2: Stage 1 — Query Enrichment (`enrichQuery`)
Create in `recommend.ts`:

```typescript
async function enrichQuery(intent: PlanningIntent): Promise<RecommendationQuery>
```

- Prompt Claude with:
  - The full `PlanningIntent` (rfpFacts + strategicContext + derivedStrategy)
  - Ask it to extract searchable query parameters
  - Include explicit instructions to generate SYNONYMS for keywords (English + Korean)
  - Include the controlled vocabulary for `idealProjectTypes` (from Phase 3 brief)
- Use `claude-sonnet-4-6`, max_tokens: 1024
- Use `safeParseJson` for parsing
- Return a `RecommendationQuery`

**Prompt example structure:**
```
당신은 언더독스 창업 교육 사업의 코치 매칭 전문가입니다.
아래 기획 의도를 분석하여 코치 검색 쿼리를 생성하세요.

[사업 정보 (RFP에서 추출)]
{rfpFacts}

[PM 전략 컨텍스트 (인터뷰에서 캡처)]
- 왜 우리에게: {strategicContext.whyUs}
- 진짜 원하는 것: {strategicContext.clientHiddenWants}
- 절대 실패 금지: {strategicContext.mustNotFail}
- 경쟁사 약점: {strategicContext.competitorWeakness}

[도출된 전략]
- 키 메시지: {derivedStrategy.keyMessages}
- 이상적 코치 프로필: {derivedStrategy.coachProfile}

[출력 요구사항]
JSON 형식으로 검색 쿼리를 생성하세요:
{
  "coreCompetencies": [...5-10개, 영어+한국어 동의어 포함],
  "domainKeywords": [...],
  "coachArchetype": "한 문장으로 이상적 코치 프로필",
  "mandatoryFilters": {...},
  "niceToHaves": {...},
  "coachCount": 10
}
```

### Step 3: Stage 2 — Hard Filter (`hardFilter`)
Create in `recommend.ts`:

```typescript
async function hardFilter(query: RecommendationQuery, prisma: PrismaClient): Promise<Coach[]>
```

Use Prisma to filter 800 → ~200 coaches:
```typescript
await prisma.coach.findMany({
  where: {
    isActive: true,
    enrichedAt: { not: null },  // prefer enriched coaches
    ...(query.mandatoryFilters.regions?.length && {
      regions: { hasSome: query.mandatoryFilters.regions }
    }),
    ...(query.mandatoryFilters.startupStageMatch && {
      idealProjectTypes: { has: query.mandatoryFilters.startupStageMatch }
    }),
    // Tier is SOFT — don't hard filter
    // Use domainTags overlap as a weak filter (at least one keyword matches)
    domainTags: {
      hasSome: [
        ...query.coreCompetencies,
        ...query.domainKeywords,
      ]
    }
  },
  take: 200,  // safety cap
})
```

**Important**: If the filter is too strict and returns < 30 coaches, relax it (remove `domainTags` constraint, then remove regions) and retry until you get ≥30 candidates.

### Step 4: Stage 3 — Structured Scoring (`scoreCoaches`)
Create in `scoring.ts`:

```typescript
export function scoreCoaches(
  coaches: Coach[],
  query: RecommendationQuery
): ScoredCoach[]
```

For each coach, compute:
- **domainMatch** (0-20): count overlaps between `query.coreCompetencies + domainKeywords` and `coach.domainTags + searchKeywords`. Normalize.
- **skillMatch** (0-20): count overlaps between query competencies and `coach.skillTags`. Normalize.
- **tierBonus** (0-15): TIER1=15, TIER2=10, TIER3=5
- **satisfaction** (0-10): `Math.min(10, (coach.satisfactionAvg ?? 3) * 2)`
- **careerYears** (0-10): `Math.min(10, (coach.careerYears ?? 0) / 2)`
- **regionMatch** (0-10): 10 if region in coach's regions, 0 otherwise
- **availability** (0-5): basic placeholder (we don't track active assignments yet; default 5)
- **enrichmentBonus** (0-10): 10 if `enrichedAt` is not null, else 0

Sum → total score. Sort desc. Return Top 50.

### Step 5: Stage 4 — Claude Semantic Reranking (`rerank`)
Create in `rerank.ts`:

```typescript
export async function rerankCoaches(
  scoredCoaches: ScoredCoach[],
  intent: PlanningIntent,
  query: RecommendationQuery,
  topK: number = 10
): Promise<CoachRecommendation[]>
```

- Take top 50 scored coaches
- Build a compact summary for each (name, strength, tags, score)
- Send to Claude with:
  - The PlanningIntent (abbreviated)
  - The query
  - The 50 coach summaries
  - Instruction: "Select the top {topK} coaches and explain why for each. Assign each to a support layer."
- Use `claude-sonnet-4-6`, max_tokens: 4096
- Parse JSON response

**Support layer mapping (4중 지원 체계):**
- `main` — 메인 코치 (전담, 주간 1:1, 실행 견인) — highest quality, 1-2 people
- `sub` — 보조 코치 (서브 멘토링, 특강) — 2-4 people
- `special` — 특강 연사 (단발성 고퀄 강의) — 1-3 people
- `mentor` — 전문가 멘토 (분야별 조언, 컨설팅) — 2-4 people

**Prompt structure:**
```
당신은 언더독스의 사업 전략가입니다.
아래 사업 기획과 50명의 후보 코치 중에서, 이 사업에 가장 적합한 {topK}명을 선정하고, 각 코치를 4중 지원 체계의 어느 레이어에 배치할지 결정하세요.

[사업 정보]
{intent summary}

[검색 쿼리]
{query}

[후보 코치 50명]
1. 김XX (TIER1, 파트너코치) — 강점: "9년 액션러닝..." — 태그: [BM검증, IR코칭] — 점수: 72
2. ...

[요구사항]
- {topK}명 선정
- 각 코치에 대해:
  * rank (1-{topK})
  * finalScore (0-100)
  * reasoning (한국어 2-3문장, "왜 이 사업에 이 코치인지")
  * supportLayer ('main' | 'sub' | 'special' | 'mentor')
  * relevantStrengths (배열 2-3개)
  * concerns (배열, 걱정되는 부분 있으면. 없으면 빈 배열)
- 'main' 레이어는 1-2명, 'sub' 2-4명, 'special' 1-3명, 'mentor' 2-4명

JSON 응답:
{
  "recommendations": [
    { "coachId": "...", "rank": 1, "finalScore": 95, "reasoning": "...", "supportLayer": "main", "relevantStrengths": [...], "concerns": [] }
  ]
}
```

### Step 6: Main Orchestrator (`recommend.ts`)
Create the main function:

```typescript
export async function recommend(
  intent: PlanningIntent,
  options?: { topK?: number; prisma?: PrismaClient }
): Promise<RecommendationResponse>
```

Flow:
1. Start timer
2. Stage 1: `const query = await enrichQuery(intent)`
3. Stage 2: `const candidates = await hardFilter(query, prisma)`
4. Stage 3: `const scored = scoreCoaches(candidates, query)`
5. Stage 3.5: take `scored.slice(0, 50)` (top 50)
6. Stage 4: `const ranked = await rerankCoaches(top50, intent, query, options.topK ?? 10)`
7. Return `RecommendationResponse` with all metadata

### Step 7: API Route
Create `src/app/api/agent/recommend/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recommend } from '@/lib/planning-agent/recommend'

export async function POST(req: NextRequest) {
  try {
    const { intent, topK } = await req.json()
    if (!intent) {
      return NextResponse.json({ error: 'intent is required' }, { status: 400 })
    }

    const result = await recommend(intent, { topK, prisma })
    return NextResponse.json(result)
  } catch (err: any) {
    console.error('Recommendation error:', err)
    return NextResponse.json({ error: err.message ?? 'recommendation failed' }, { status: 500 })
  }
}
```

### Step 8: Verification
Create a test script at `scripts/test-recommend.ts` (optional but helpful):

```typescript
import { recommend } from '../src/lib/planning-agent/recommend'
import { prisma } from '../src/lib/prisma'

const mockIntent = {
  rfpFacts: {
    projectName: "AI 창업가 양성 프로그램",
    client: "중소벤처기업부",
    target: "AI 스타트업 예비창업자 100명",
    budget: 300_000_000,
    ...
  },
  strategicContext: {
    whyUs: "언더독스의 800명 코치 풀과 IMPACT 방법론",
    clientHiddenWants: "구체적인 창업 전환 성과",
    mustNotFail: "수료율 90% 이상",
    competitorWeakness: "경쟁사는 AI 전문 코치 부족",
    ...
  },
  derivedStrategy: {
    keyMessages: ["실행 보장", "AI 특화 커리큘럼"],
    coachProfile: "AI 스타트업 경험 + 투자유치 실적 있는 시니어 코치",
    ...
  },
  ...
} as const

const result = await recommend(mockIntent as any)
console.log(JSON.stringify(result, null, 2))
await prisma.$disconnect()
```

Run 3 different scenarios:
1. AI 창업 (should match AI/tech coaches)
2. 청년마을 / 로컬 창업 (should match regional/local coaches)
3. 재창업 / 중장년 (should match mentors with varied experience)

**Verify:**
- Different scenarios produce DIFFERENT top 10
- Reasoning is specific (not generic)
- Support layer distribution makes sense (1-2 main, 2-4 sub, etc.)
- Processing time < 15 seconds per call

---

## 🔒 Tech Constraints

### Claude API
- Model: `claude-sonnet-4-6` (use `CLAUDE_MODEL` constant)
- Stage 1: max_tokens 1024
- Stage 4: max_tokens 4096
- Total cost per recommendation: ~$0.05 (Stage 1 + Stage 4)
- Use `safeParseJson` from `src/lib/claude.ts` for all JSON parsing

### Prisma
- Use existing `prisma` instance from `src/lib/prisma.ts`
- Don't create new Prisma client instances in the main code path
- Test scripts can use PrismaPg adapter directly

### Error handling
- If Stage 1 fails: return 500 with clear message
- If Stage 2 returns < 10 coaches: relax filters and retry once
- If Stage 4 fails: fallback to returning top 10 scored (from Stage 3) with generic reasoning
- Log each stage's duration for debugging

### Performance targets
- Total time per recommendation: < 15 seconds
- Stage 1 (Claude): < 5s
- Stage 2 (DB): < 500ms
- Stage 3 (scoring): < 100ms
- Stage 4 (Claude): < 8s

---

## ✔️ Definition of Done (checklist)

- [ ] `src/lib/planning-agent/recommendation-types.ts` with all 4 types
- [ ] `src/lib/planning-agent/recommend.ts` with `enrichQuery`, `hardFilter`, `recommend` functions
- [ ] `src/lib/planning-agent/scoring.ts` with `scoreCoaches` function
- [ ] `src/lib/planning-agent/rerank.ts` with `rerankCoaches` function
- [ ] `src/app/api/agent/recommend/route.ts` with POST handler
- [ ] `npx tsc --noEmit` returns exit code 0
- [ ] 3 test scenarios produce different, reasonable recommendations
- [ ] Processing time < 15s per recommendation
- [ ] Each recommendation has specific reasoning (not generic boilerplate)
- [ ] Support layer distribution: 1-2 main, 2-4 sub, 1-3 special, 2-4 mentor
- [ ] NO touches outside allowed files
- [ ] NO new npm dependencies

---

## 📤 Return Format (what to report back)

When done, respond with this structure (under 600 words):

```
## Phase 4 Complete

### Files Created
- src/lib/planning-agent/recommendation-types.ts (N lines)
- src/lib/planning-agent/recommend.ts (N lines)
- src/lib/planning-agent/scoring.ts (N lines)
- src/lib/planning-agent/rerank.ts (N lines)
- src/app/api/agent/recommend/route.ts (N lines)

### Stage-by-Stage Implementation Notes
- Stage 1 (enrichQuery): [key design choices]
- Stage 2 (hardFilter): [filter strictness, fallback logic]
- Stage 3 (scoring): [weight rationale]
- Stage 4 (rerank): [prompt structure, support layer logic]

### Test Results
Scenario 1: AI 창업 프로그램
- Top 3 coaches: 김X(TIER1), 박X(TIER2), 이X(TIER1)
- Main layer: 1, Sub: 3, Special: 3, Mentor: 3
- Processing time: Xs
- Sample reasoning: "..."

Scenario 2: 청년마을 / 로컬 창업
- Top 3 coaches: ...
- ...

Scenario 3: 재창업 / 중장년
- Top 3 coaches: ...
- ...

### Differentiation Check
- Scenarios produce distinct top 10: [YES/NO]
- Reasoning is specific to each scenario: [YES/NO]

### Performance
- Average total time: Ns
- Stage 1: Ns, Stage 4: Ns
- Cost per call: $N.NN

### Issues Encountered
- [judgment calls]
- [prompt iterations needed]

### Merge Recommendation
- [READY TO MERGE / NEEDS REVIEW: reason]
```

---

## 🚫 Do NOT do these things

1. Do NOT modify Phase 1/2/3 outputs (types.ts, intent-schema.ts, enrich.ts, schema.prisma)
2. Do NOT use vector search or embeddings (not needed for 800 items)
3. Do NOT call Gemini or OpenAI — Claude only
4. Do NOT hard-filter by tier (keep it as a soft scoring signal)
5. Do NOT return coaches without `enrichedAt` unless you have to relax filters
6. Do NOT skip the rerank stage — the scoring alone is not enough
7. Do NOT hardcode test data into production code
8. Do NOT create new npm dependencies
9. Do NOT commit — main session reviews
10. Do NOT assume Phase 1/2/3 schemas match what you expect — READ the actual files first

---

## 💡 Hints & Edge Cases

- **Empty strategicContext**: PlanningIntent might have incomplete strategicContext (PM skipped questions). Handle null/empty gracefully in the prompt.
- **Coach without enrichedAt**: Prefer enriched coaches; if filter is too strict, include un-enriched as fallback with reduced score.
- **Regional mismatch**: If RFP says "제주" but no coaches have 제주 in regions, expand to "전국" and note in reasoning.
- **Tier distribution**: Don't ONLY recommend TIER1. A good team has mix. The rerank should balance tier.
- **Rerank stability**: Same input should produce similar output. Claude with temp=0 helps; you can pass `temperature: 0` to anthropic.messages.create.
- **Cost optimization**: Stage 4 sends 50 coach summaries. Keep each summary under 100 tokens. 50 × 100 = 5000 input tokens, fine.
- **DomainTags vs expertise**: domainTags from enrichment are richer. Prefer them. `expertise` is legacy, only fallback.

---

## 🏁 Final Note

This is the heart of the Planning Agent system. The rerank (Stage 4) is where Claude does the real judgment — the earlier stages are just filtering/scoring to give Claude a manageable candidate set.

Quality of recommendation = quality of Stage 1 prompt × quality of Stage 4 prompt. Iterate on prompts using test scenarios before declaring done.

If test scenarios produce bad results:
- First check Stage 1 — is the query enrichment capturing intent?
- Then check Stage 3 — are the scores making sense?
- Finally Stage 4 — is the rerank prompt clear?

Good luck. Phase 6 will integrate this into the main pipeline.
