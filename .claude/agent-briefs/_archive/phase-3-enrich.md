# Phase 3 Brief: Coach Data Enrichment (Stage 0)

## 🎯 Mission (1 sentence)
Enrich all 800 coaches in PostgreSQL with structured semantic metadata (domainTags, skillTags, strengthSummary, idealProjectTypes, searchKeywords) using Claude API, so that downstream recommendation searches match on meaning, not just literal keywords.

---

## 📋 Context

You are working in the `ud-ops-workspace` project. This is a coach-matching platform where PMs need to find the best coaches for education projects. Currently, coach data has unstructured fields like `careerHistory` (long Korean text) and small arrays like `expertise` — making keyword search inaccurate.

**The Problem:**
- User searches "AI 창업" → coach with expertise `["인공지능"]` NOT matched
- User searches "글로벌" → coach with experience `"해외"`, `"Global"`, `"오버시즈"` NOT matched
- User searches "투자유치" → coach with career in `"VC"`, `"벤처캐피탈"`, `"IR"` NOT matched

**The Solution (Stage 0 of 5-stage recommendation):**
One-time Claude API call per coach to extract:
- `domainTags[]`: normalized domain tags with synonyms (e.g., `["핀테크", "금융", "IR", "투자유치", "벤처캐피탈"]`)
- `skillTags[]`: normalized skill tags (e.g., `["BM 검증", "IR 코칭", "투자 피칭"]`)
- `strengthSummary`: one-sentence strength summary in Korean (e.g., `"9년 액션러닝 운영 경험과 D2SF 컨설팅 경력을 바탕으로 초기 창업가의 BM 검증 + 투자 피칭을 동시 코칭"`)
- `idealProjectTypes[]`: ideal project types (e.g., `["예비창업", "Seed 단계", "임팩트 사업"]`)
- `searchKeywords[]`: all synonym keywords for search (union of above + extras)

After enrichment, searching "투자" will match coaches whose careers mention "VC", "벤처캐피탈", "IR", etc.

**Cost estimate:** 800 coaches × ~$0.01 per Claude call ≈ $8 one-time
**Time estimate:** ~10-15 minutes with batching and rate limiting

---

## ✅ Prerequisites (must be true before starting)

1. Working directory: `c:\Users\USER\projects\ud-ops-workspace`
2. PostgreSQL Docker container is running: `docker compose ps` shows `ud_ops_db` running
3. 800 coaches exist: run a quick check via Prisma — `prisma.coach.count()` should return 800
4. **CRITICAL**: `Coach` model in `prisma/schema.prisma` must have these 5 new fields already added:
   ```prisma
   domainTags         String[]
   skillTags          String[]
   strengthSummary    String?  @db.Text
   idealProjectTypes  String[]
   searchKeywords     String[]
   enrichedAt         DateTime?
   ```
   If these fields are NOT in the schema yet, STOP and report — this must be added by Phase 2 (main session) first.
5. `.env` file has `ANTHROPIC_API_KEY` set
6. `npx tsc --noEmit` currently passes

If any prerequisite fails, STOP and report exactly which one.

---

## 📖 Read These Files First (in order)

### Project context
1. `CLAUDE.md` — project conventions (Claude model is `claude-sonnet-4-6`, max_tokens patterns)
2. `AGENTS.md` — Next.js caveat (doesn't apply here, but read it)
3. `prisma/schema.prisma` — confirm Coach model has enrichment fields

### Reference code (read before writing)
1. `src/lib/claude.ts` — note the `anthropic` client, `CLAUDE_MODEL` constant, `safeParseJson()` helper pattern
2. `src/lib/ud-brand.ts` — reference for how brand context is formatted
3. `prisma/seed.ts` — reference for how to use Prisma with the PG adapter
4. `scripts/migrate-coaches-json.ts` — reference for a batch script pattern with Prisma

### Sample coach data (to understand input shape)
Run this Prisma query mentally or via a quick script to see a sample:
```ts
await prisma.coach.findFirst({
  where: { tier: 'TIER1' },
  select: {
    id: true, name: true, intro: true, expertise: true,
    industries: true, careerHistory: true, currentWork: true,
    underdogsHistory: true, organization: true, position: true,
    mainField: true, careerYears: true, roles: true, regions: true,
  }
})
```

### Memory context (read these for understanding the domain)
These are in `C:\Users\USER\.claude\projects\c--Users-USER-projects-ud-ops-workspace\memory\`:
1. `ud_education_methodology.md` — understand IMPACT 18 modules (so tags align with methodology)
2. `ud_proposal_patterns.md` — understand language used in proposals (so strengthSummary uses similar tone)

---

## 🎯 Scope

### ✅ You CAN touch (create or modify)
- `src/lib/planning-agent/enrich.ts` — NEW: the enrichment prompt + parser + type definitions
- `scripts/enrich-coaches.ts` — NEW: the batch runner script
- `src/lib/planning-agent/types.ts` — only if it doesn't exist; create minimal stub (or wait — see note below)
- Database writes via Prisma to update the Coach rows (this is the whole point)

### ❌ You MUST NOT touch
- `prisma/schema.prisma` — schema changes are Phase 2's job
- `src/lib/claude.ts` — do not modify the existing Claude utilities
- `src/lib/ud-brand.ts` — do not modify
- `src/components/` — no UI work here
- `src/app/` — no API routes or pages
- Any file under `src/lib/planning-agent/` OTHER than `enrich.ts` and possibly `types.ts`
- `package.json` — no new dependencies

### ⚠️ Note on `src/lib/planning-agent/types.ts`
If the main session has already created this file (Phase 1), DO NOT overwrite it. Just import from it if you need the `ImpactModuleContext` type or similar. If the file doesn't exist, create a minimal local type inside `enrich.ts` — don't create `types.ts` yourself.

---

## 🛠 Tasks (numbered steps)

### Step 1: Verify prerequisites
Write a small verification script (or run commands) to confirm:
- `prisma.coach.count()` returns 800 (or close)
- `prisma.coach.findFirst()` returns a coach with the new enrichment fields visible (even if null)
- If `enrichedAt` field exists, count how many already have `enrichedAt !== null` (for idempotency)

If any check fails, STOP and report.

### Step 2: Create `src/lib/planning-agent/enrich.ts`
This file should export:
1. A TypeScript type `EnrichedCoachMetadata` with the 5 fields
2. A function `buildEnrichmentPrompt(coach: CoachInput): string` that constructs the prompt
3. A function `enrichOneCoach(coach: CoachInput): Promise<EnrichedCoachMetadata>` that calls Claude and parses the result

**The Prompt** (critical — this determines quality):
- System role: "You are a domain expert in Korean startup education ecosystem. Your job is to extract structured, searchable metadata from a coach's unstructured profile."
- Provide the coach's: name, intro, expertise, industries, career_history, current_work, underdogs_history, main_field, organization, position, career_years, roles
- Ask for JSON output with exactly 5 fields
- **Synonym expansion is the key value-add**: explicitly instruct Claude to include Korean + English synonyms, industry abbreviations, related concepts
- Ask for Korean output, concise but specific
- `strengthSummary` should be ONE Korean sentence, 40-80 chars, pattern: "[경력 X년] [주요 경험] 기반으로 [구체적 강점]"
- `domainTags` and `skillTags` should each have 5-10 items
- `idealProjectTypes` should have 2-4 items from a controlled vocabulary:
  - 예비창업, 초기창업, Seed 단계, Pre-A 이상, 임팩트 사업, 로컬 창업, 글로벌 진출, AI 창업, 소셜벤처, 대학/청년, 재창업, 중장년
- `searchKeywords` should be the union of all terms used above + 10-20 extra related keywords

**Prompt example structure** (don't copy verbatim, adapt):
```
당신은 한국 창업 교육 생태계의 도메인 전문가입니다.
아래 코치 프로필에서 구조화된 검색 가능 메타데이터를 추출하세요.

[코치 정보]
이름: {name}
소개: {intro}
전문분야: {expertise}
산업: {industries}
...

[요구사항]
1. domainTags: 5-10개의 도메인 태그 (한국어+영어 동의어 포함). 예: ["핀테크", "FinTech", "금융 서비스", "결제", "벤처캐피탈", "VC", "투자 유치", "IR"]
2. skillTags: 5-10개의 스킬 태그. 예: ["BM 검증", "비즈니스 모델 설계", "고객 인터뷰", "MVP 개발", "투자 피칭"]
3. strengthSummary: 한국어 한 문장 (40-80자). 패턴: "[경력] [주요 경험] 기반으로 [구체적 강점]"
4. idealProjectTypes: 2-4개, 아래 카테고리 중 선택: [예비창업, 초기창업, Seed 단계, Pre-A 이상, 임팩트 사업, 로컬 창업, 글로벌 진출, AI 창업, 소셜벤처, 대학/청년, 재창업, 중장년]
5. searchKeywords: 15-25개의 검색 키워드 (위 태그 + 추가 관련어)

[응답 형식]
반드시 아래 JSON만 반환 (마크다운 코드블록 없이):
{
  "domainTags": [...],
  "skillTags": [...],
  "strengthSummary": "...",
  "idealProjectTypes": [...],
  "searchKeywords": [...]
}
```

**Use `safeParseJson` from `src/lib/claude.ts`** for parsing the Claude response.
**Use model `claude-sonnet-4-6`** (import `CLAUDE_MODEL` constant).
**max_tokens: 2048** should be enough.

### Step 3: Create `scripts/enrich-coaches.ts`
This is the batch runner. It should:

1. **Load env** (`import 'dotenv/config'`)
2. **Initialize Prisma** with PrismaPg adapter (see `scripts/migrate-coaches-json.ts` for pattern)
3. **Accept CLI flags** (optional but recommended):
   - `--sample=N` — enrich only first N coaches (for testing)
   - `--force` — re-enrich coaches that already have `enrichedAt`
   - `--tier=TIER1` — filter by tier (useful for targeted runs)
   - Default: enrich all coaches without `enrichedAt`
4. **Query coaches**: `SELECT * FROM Coach WHERE isActive = true AND (enrichedAt IS NULL OR $force)`
5. **Batch processing**: process in batches of 5 coaches in parallel using `Promise.all()`, then wait 1 second between batches (to respect rate limits)
6. **Error handling**: if one coach fails, log the error and continue with the rest. Track failed coaches at the end.
7. **Progress logging**: console.log every batch — `[45/800] ✓ 김XX enriched` format
8. **Per-coach flow**:
   - Call `enrichOneCoach(coach)` from `enrich.ts`
   - Validate response (all 5 fields present, arrays non-empty)
   - Update DB: `prisma.coach.update({ where: { id: coach.id }, data: { domainTags, skillTags, strengthSummary, idealProjectTypes, searchKeywords, enrichedAt: new Date() } })`
9. **Final report**:
   ```
   ✅ Enrichment complete!
      Processed: 800
      Success: 795
      Failed: 5
      Total cost estimate: $8.00
      Total time: 12m 34s
   
   Failed coaches:
   - Coach #123 (박X): JSON parse error
   - ...
   ```

### Step 4: Dry run with sample (10 coaches)
1. Run: `npx tsx scripts/enrich-coaches.ts --sample=10`
2. Verify 10 coaches get enriched
3. Query the DB to inspect results:
   ```ts
   const samples = await prisma.coach.findMany({
     where: { enrichedAt: { not: null } },
     take: 10,
     select: {
       name: true,
       expertise: true,
       domainTags: true,
       skillTags: true,
       strengthSummary: true,
       idealProjectTypes: true,
     }
   })
   console.log(JSON.stringify(samples, null, 2))
   ```
4. **Quality check (YOU must verify)**:
   - Does `domainTags` include synonyms the original `expertise` doesn't have?
   - Is `strengthSummary` specific and specific (not generic like "전문성이 뛰어난 코치")?
   - Are `idealProjectTypes` plausible given the coach's background?
   - Is `searchKeywords` comprehensive (15+ items)?
5. If quality is poor, iterate on the prompt in `enrich.ts` and re-run the sample (reset `enrichedAt` first with `--force`)

### Step 5: Full run (all 800 coaches)
Only after the dry run quality is confirmed:
1. Run: `npx tsx scripts/enrich-coaches.ts`
2. Monitor progress — should take ~10-15 minutes
3. Handle any rate limit errors gracefully
4. Report final stats

### Step 6: Post-run validation
Run these queries and verify:
```ts
// All coaches have non-null enrichedAt
await prisma.coach.count({ where: { enrichedAt: { not: null } } })
// → should be ~800 (with maybe a few failures)

// Sample 10 random coaches across tiers
const samples = await prisma.coach.findMany({ take: 10, orderBy: { id: 'asc' } })
// → inspect strengthSummary and domainTags

// Keyword search test
await prisma.coach.findMany({
  where: { searchKeywords: { hasSome: ['VC', '벤처캐피탈'] } },
  select: { name: true, domainTags: true }
})
// → should return coaches with investment background
```

---

## 🔒 Tech Constraints

### Claude API usage
- Model: `claude-sonnet-4-6` (import `CLAUDE_MODEL` from `src/lib/claude.ts`)
- Use the existing `anthropic` instance from `src/lib/claude.ts`
- max_tokens: 2048
- Use `safeParseJson()` for parsing

### Rate limiting
- Batch size: 5 parallel requests
- Delay between batches: 1000ms (1 second)
- If you hit rate limit errors (429), double the delay and retry

### Prisma usage
- Use `PrismaPg` adapter (see `prisma/seed.ts` pattern):
  ```ts
  import { PrismaClient } from '@prisma/client'
  import { PrismaPg } from '@prisma/adapter-pg'
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })
  ```
- Always `await prisma.$disconnect()` in `finally` block

### Cost management
- 800 coaches × 2048 max_tokens × ~$15/1M output tokens = ~$25 worst case, usually ~$8
- Use `--sample=10` first to test quality before full run
- Idempotent: running twice without `--force` should not re-enrich

---

## ✔️ Definition of Done (checklist)

- [ ] `src/lib/planning-agent/enrich.ts` exists with `enrichOneCoach()` export
- [ ] `scripts/enrich-coaches.ts` exists with CLI flag support
- [ ] `npx tsc --noEmit` returns exit code 0
- [ ] Dry run with `--sample=10` succeeds and produces quality metadata
- [ ] Full run completes with ≥95% success rate (≥760/800 coaches enriched)
- [ ] Sample verification: 10 random enriched coaches show meaningful `domainTags` with synonyms
- [ ] `enrichedAt` is populated for all successfully enriched coaches
- [ ] Final report logged with success/failure stats
- [ ] NO changes to `prisma/schema.prisma`
- [ ] NO changes to `src/lib/claude.ts` or `src/lib/ud-brand.ts`
- [ ] NO new npm dependencies
- [ ] Script is idempotent (can be re-run safely)

---

## 📤 Return Format (what to report back)

When done, respond with exactly this structure (under 500 words):

```
## Phase 3 Complete

### Files Created
- src/lib/planning-agent/enrich.ts (N lines)
- scripts/enrich-coaches.ts (N lines)

### Prompt Design Summary
[2-3 sentences on the key design decisions for the enrichment prompt]

### Dry Run Results (sample=10)
Success: 10/10
Sample quality check:
- Coach X (TIER1): [brief quality assessment]
- Coach Y (TIER2): [brief quality assessment]
Prompt iterations: [0 / N iterations to get good quality]

### Full Run Results
- Total processed: 800
- Successfully enriched: NNN
- Failed: N
- Time elapsed: Nm Ns
- Estimated cost: $N.NN

### Sample Enriched Coach (one example)
```json
{
  "name": "김XX",
  "tier": "TIER1",
  "strengthSummary": "...",
  "domainTags": [...],
  "skillTags": [...],
  "idealProjectTypes": [...]
}
```

### Keyword Search Test
Tested: `["VC", "벤처캐피탈"]` → N coaches matched
Tested: `["AI", "인공지능"]` → N coaches matched
Tested: `["글로벌", "Global", "해외"]` → N coaches matched

### Failed Coaches (if any)
- Coach #ID (Name): reason
- ...

### Issues Encountered
- [anything that required judgment calls]

### Merge Recommendation
- [READY TO MERGE / NEEDS REVIEW: reason]
```

---

## 🚫 Do NOT do these things

1. Do NOT modify `prisma/schema.prisma`
2. Do NOT modify `src/lib/claude.ts`, `src/lib/ud-brand.ts`, or any other existing lib file
3. Do NOT create UI components or API routes
4. Do NOT add new npm dependencies
5. Do NOT use a different Claude model (stick with `claude-sonnet-4-6`)
6. Do NOT commit changes — main session will review and merge
7. Do NOT run destructive operations (reset, drop, truncate)
8. Do NOT bypass the sample test — always run `--sample=10` first
9. Do NOT parallelize more than 5 requests at a time
10. Do NOT hardcode the API key — use `process.env.ANTHROPIC_API_KEY`

---

## 💡 Hints & Edge Cases

- **Empty fields**: many coaches have empty `intro` or `careerHistory`. Use whatever is available; don't fail. If only `name` and `expertise` exist, still produce reasonable output.
- **Very long `careerHistory`**: if it's > 2000 chars, truncate to 2000 in the prompt to control tokens
- **Multi-language**: some coaches have English names or bilingual content. Preserve in tags.
- **Global coaches (TIER3 with `category: 'GLOBAL_COACH'`)**: their `country` might not be 한국. Make sure `idealProjectTypes` reflects "글로벌 진출" for them.
- **Consultants (`category: 'CONSULTANT'`)**: their role is different from coaches — they advise, not teach. Reflect this in `skillTags`.
- **Korean-English synonyms**: ALWAYS include both. "투자" AND "investment" AND "VC". This is the main value of Stage 0.

---

## 🏁 Final Note

This is Stage 0 of the 5-stage recommendation pipeline. The quality of this enrichment determines the quality of ALL downstream recommendations. Take time on the prompt — it's worth iterating.

If the sample run (10 coaches) produces bad quality, STOP and improve the prompt before committing to the full 800-coach run. Cost of a bad prompt iterated = $0.10. Cost of a bad full run = $8 wasted.

Good luck. The main session and Phase 4 (recommendation engine) are depending on this data being high quality.
