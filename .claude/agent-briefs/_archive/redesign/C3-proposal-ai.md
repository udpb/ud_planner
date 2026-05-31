# C3 Brief: proposal-ai.ts — 전체 PipelineContext 주입 제안서 생성

## 🎯 Mission (1 sentence)
`src/lib/proposal-ai.ts` 를 신규 생성하여 PipelineContext 전체(rfp+strategy+curriculum+coaches+budget+impact) 를 섹션별 제안서 생성 프롬프트에 주입하고, `/api/ai/proposal/route.ts` 를 신규 함수 호출로 교체한다.

## 📋 Context

**왜 이 작업이 필요한가.**
제안서 생성이 Step 1 파싱 결과만 보고 만들면 **Step 2~5 의 모든 결정이 반영 안 됨**. 수주 품질의 최종 승부처인 제안서에 맥락이 없으면 Phase B/C 전체가 헛수고.

**주입해야 할 것 (섹션별로 다름):**
- 공통: 브랜드 자산 · RFP · Strategy 키메시지 · 평가배점
- "제안 배경" 섹션: `rfp.proposalBackground` · `rfp.proposalConcept` · `keyPlanningPoints` · 유사 프로젝트 · ChannelPreset 톤
- "커리큘럼" 섹션: `curriculum.sessions` · `designRationale` · `impactModuleMapping`
- "조직·코치" 섹션: `coaches.assignments` · 4중 지원 체계 (ud-brand)
- "예산" 섹션: `budget.structure` · `sroiForecast` · `benchmark`
- "임팩트" 섹션: `impact.logicModel` · `measurementPlan`
- "추진 전략" 섹션: `strategy.derivedKeyMessages` · `evalStrategy.overallGuidance`

## ✅ Prerequisites
1. 작업 디렉토리: `c:\Users\USER\projects\ud-ops-workspace`
2. `npm run build` 통과
3. Phase B 완료 (PipelineContext 전체 슬라이스 타입 존재)
4. `src/lib/claude.ts` 에 기존 `generateProposalSection` 존재 (참고)
5. `src/lib/ud-brand.ts` 의 `buildBrandContext()`, `buildCurriculumContextForProposal()` 존재

실패 시 STOP.

## 📖 Read These Files First

1. `CLAUDE.md` · `AGENTS.md`
2. **`.claude/skills/ud-brand-voice/SKILL.md`** — §3 키 메시지, §10 톤 매트릭스 (섹션별 반영 필수)
3. **`docs/architecture/data-contract.md` §1.2 ProposalSlice** — 출력 스펙
4. `src/lib/pipeline-context.ts` — 전체 슬라이스 타입 (rfp/strategy/curriculum/coaches/budget/impact)
5. `src/lib/claude.ts` — 기존 `generateProposalSection()` (수정 금지, 참고만)
6. `src/lib/ud-brand.ts` — `buildBrandContext()`, `buildCurriculumContextForProposal()`, `UD_IDENTITY`, `UD_KEY_MESSAGE_PATTERNS`
7. `src/lib/eval-strategy.ts` — `analyzeEvalStrategy()` · `sectionLabel()`
8. `src/lib/planning-direction.ts` (B1) — validate+재시도 패턴
9. `src/app/api/ai/proposal/route.ts` — 현재 구현
10. `src/app/api/ai/proposal/improve/route.ts` — 기존 improve 패턴 (수정 금지, 참고)

## 🎯 Scope

### ✅ You CAN touch
- `src/lib/proposal-ai.ts` (신규) — 섹션별 프롬프트 빌더 + generateSection 함수
- `src/app/api/ai/proposal/route.ts` — 신규 함수 호출로 교체

### ❌ You MUST NOT touch
- `src/lib/claude.ts` — import 만
- `src/app/api/ai/proposal/improve/route.ts` — 기존 improve 로직 유지 (C3 범위 밖)
- `src/lib/pipeline-context.ts` · `ud-brand.ts` · `eval-strategy.ts` · `planning-direction.ts` · `curriculum-ai.ts` (C1) · `logic-model-builder.ts` (C2)
- `prisma/schema.prisma`
- `src/app/(dashboard)/**` — C4
- 다른 api route
- `package.json`

## 🛠 Tasks

### Step 1: 섹션 스키마

언더독스 제안서 표준 7섹션 (기존 `ProposalSection.sectionNo` 와 일치):

```typescript
// src/lib/proposal-ai.ts
export type ProposalSectionNo = 1 | 2 | 3 | 4 | 5 | 6 | 7

export const PROPOSAL_SECTION_SPEC: Record<ProposalSectionNo, {
  title: string
  focus: string             // 이 섹션이 다루는 것
  minChars: number
  maxChars: number
  requiresSlices: Array<keyof PipelineContext>
}> = {
  1: { title: '제안 배경 및 목적', focus: '제안배경+컨셉+핵심포인트', minChars: 800, maxChars: 1500, requiresSlices: ['rfp'] },
  2: { title: '추진 전략 및 방법론', focus: '차별화·방법론·키메시지', minChars: 800, maxChars: 1500, requiresSlices: ['rfp', 'strategy'] },
  3: { title: '교육 커리큘럼', focus: '세션·트랙·IMPACT매핑·Action Week', minChars: 1000, maxChars: 2000, requiresSlices: ['rfp', 'curriculum'] },
  4: { title: '운영 체계 및 코치진', focus: '조직·4중지원·코치진·PM전담', minChars: 700, maxChars: 1200, requiresSlices: ['rfp', 'coaches'] },
  5: { title: '예산 및 경제성', focus: '예산구조·마진·SROI·벤치마크', minChars: 700, maxChars: 1200, requiresSlices: ['rfp', 'budget'] },
  6: { title: '기대 성과 및 임팩트', focus: 'Logic Model·측정계획·SROI', minChars: 700, maxChars: 1300, requiresSlices: ['rfp', 'impact'] },
  7: { title: '수행 역량 및 실적', focus: 'UD 실적·수주사례·보증', minChars: 500, maxChars: 1000, requiresSlices: [] },
}
```

### Step 2: 섹션별 프롬프트 빌더

```typescript
export interface GenerateSectionInput {
  sectionNo: ProposalSectionNo
  context: PipelineContext     // 전체 (섹션에 따라 필요한 slice 만 읽음)
  keepParts?: string           // 부분 재생성용 (특정 문단 보존)
}

function buildSectionPrompt(input: GenerateSectionInput): string {
  const spec = PROPOSAL_SECTION_SPEC[input.sectionNo]
  const ctx = input.context

  // 공통 prefix
  const common = [
    buildBrandContext(),       // ud-brand
    buildRfpBrief(ctx.rfp),
    buildChannelTone(ctx.meta.projectType, ctx.meta.channelType),
    buildEvalStrategyNote(ctx.rfp?.evalStrategy),
    buildStrategyKeyMessages(ctx.strategy),
  ].filter(Boolean).join('\n\n')

  // 섹션별 specific
  const sectionContext = buildSectionSpecific(input.sectionNo, ctx)

  // 출력 지시
  const outputInstruction = `
[섹션 ${input.sectionNo}: ${spec.title}]
초점: ${spec.focus}
분량: ${spec.minChars}~${spec.maxChars}자

[언더독스 문체 규칙 — 반드시 준수]
- 자신감 있는 선언형 ("~합니다", "~입니다")
- 모든 주장은 정량 근거 (정량 포화 원칙)
- 핵심 컨셉은 따옴표 브랜딩 ("4중 페이스메이커")
- "AI 코치" 를 별도 상품으로 표현 ❌ — 기존 체계를 보강하는 도구 ⭕
- Underdog 동정 프레임 ❌ — "기존 시스템에 도전하는 창업가" ⭕

[출력]
본문만 (마크다운 헤딩 ##, ### 활용). JSON 래핑 없음.
`

  return common + '\n\n' + sectionContext + '\n\n' + outputInstruction
}
```

**섹션별 specific 빌더 예시:**

```typescript
function buildSectionSpecific(sectionNo: ProposalSectionNo, ctx: PipelineContext): string {
  switch (sectionNo) {
    case 1:
      return `
[Step 1 에서 PM 이 확정한 기획 방향]
제안 배경 초안: ${ctx.rfp?.proposalBackground ?? '(미확정)'}
제안 컨셉: ${ctx.rfp?.proposalConcept ?? '(미확정)'}
핵심 기획 포인트:
${(ctx.rfp?.keyPlanningPoints ?? []).map((p, i) => `  ${i + 1}. ${p}`).join('\n')}
유사 수주 사업 참고:
${(ctx.rfp?.similarProjects ?? []).slice(0, 3).map(s =>
  `  - ${s.name} (${s.client ?? '발주처 미상'}, ${s.won ? '수주' : '미수주'})`
).join('\n')}
`
    case 3:
      return buildCurriculumContextForProposal(ctx.curriculum?.sessions ?? [])
    case 4:
      if (!ctx.coaches) return '(코치 슬라이스 미확정)'
      return `
[확정된 코치진]
총 배정: ${ctx.coaches.assignments.length}명
총 사례비: ${ctx.coaches.totalFee.toLocaleString()}원

[4중 지원 체계 — 반드시 언급]
${UD_SUPPORT_LAYERS.map(l => `- ${l.layer}: ${l.role}`).join('\n')}
`
    case 5:
      // 예산 구조 + SROI
      ...
    case 6:
      // Logic Model 5계층 + 측정계획
      ...
    case 7:
      // UD 브랜드 자산만 (이미 common 에 포함)
      return '[이 섹션은 브랜드 자산 중심으로 작성]'
    default:
      return ''
  }
}
```

### Step 3: generateProposalSection 함수

```typescript
export async function generateProposalSection(
  input: GenerateSectionInput,
): Promise<{ ok: true; content: string; metadata: SectionMetadata } | { ok: false; error: string }> {
  // 1. 섹션별 필요 슬라이스 검증 (requiresSlices)
  const spec = PROPOSAL_SECTION_SPEC[input.sectionNo]
  for (const slice of spec.requiresSlices) {
    if (input.context[slice] === undefined) {
      return { ok: false, error: `SLICE_REQUIRED:${slice}` }
    }
  }

  // 2. 프롬프트 조립
  const prompt = buildSectionPrompt(input)

  // 3. Claude 호출 (max_tokens 에 따라 섹션별 차등)
  const maxTokens = spec.maxChars * 4  // 여유 버퍼

  // 4. 응답 받기 (JSON 아님, 마크다운 본문)
  const content = await callClaudeText(prompt, maxTokens)

  // 5. 검증 — 분량·금지 표현·키메시지 반영
  const validation = validateSection(input.sectionNo, content, input.context)
  if (!validation.passed) {
    // 재시도 1회
    const retryPrompt = prompt + '\n\n[재생성 힌트]\n' + validation.issues.join('\n')
    const retryContent = await callClaudeText(retryPrompt, maxTokens)
    const retryValidation = validateSection(input.sectionNo, retryContent, input.context)
    if (!retryValidation.passed) {
      return { ok: false, error: 'VALIDATION_FAILED: ' + retryValidation.issues.join('; ') }
    }
    return { ok: true, content: retryContent, metadata: buildMetadata(input, retryContent) }
  }

  return { ok: true, content, metadata: buildMetadata(input, content) }
}
```

**검증 기준:**
- 분량 min/max 준수
- 브랜드 금지 표현 미포함 (ud-brand-voice SKILL §11)
- 최소 키메시지 1개 반영 (정량 포화 · 4중지원 · 실행보장 · IMPACT · ACT-PRENEUR 중)
- 섹션 3 (커리큘럼) 에는 Action Week 언급 필수 (A/B 런타임에서 확인)
- 섹션 5 (예산) 에는 실제 금액 숫자 등장 필수

### Step 4: SectionMetadata

```typescript
export interface SectionMetadata {
  sectionNo: ProposalSectionNo
  charCount: number
  keyMessagesDetected: string[]      // 감지된 키 메시지 이름
  compliantWithBrand: boolean
  warnings: string[]                  // 경고 (치명 아님)
  contextSlicesUsed: Array<keyof PipelineContext>
}
```

### Step 5: API 라우트 수정

`src/app/api/ai/proposal/route.ts`:

```typescript
import { generateProposalSection } from '@/lib/proposal-ai'
import { buildPipelineContext } from '@/lib/pipeline-context'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return 401

  const { projectId, sectionNo, keepParts } = await req.json()
  if (!projectId || !sectionNo) return 400

  const context = await buildPipelineContext(projectId)
  const result = await generateProposalSection({
    sectionNo: sectionNo as ProposalSectionNo,
    context,
    keepParts,
  })

  if (!result.ok) {
    if (result.error.startsWith('SLICE_REQUIRED:')) {
      return NextResponse.json({ error: result.error, message: '이전 스텝을 먼저 완료하세요' }, { status: 400 })
    }
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ content: result.content, metadata: result.metadata })
}
```

### Step 6: manifest 업데이트

`src/app/(dashboard)/projects/[id]/step-proposal.manifest.ts` 의 `reads.context`:

```typescript
reads: {
  context: ['rfp', 'strategy', 'curriculum', 'coaches', 'budget', 'impact'],   // 전체 필요
  assets: ['winning-patterns', 'channel-presets', 'ud-brand'],
},
```

현재 이미 이렇게 되어 있는지 확인, 아니면 보완.

### Step 7: 검증

```bash
npm run typecheck
npm run build
```

둘 다 통과. 기존 `generateProposalSection` 은 claude.ts 에 남음.

## 🔒 Tech Constraints

- **Claude 응답이 JSON 아님** (마크다운 본문 직접) — safeParseJson 아니라 `message.content[0].text` 직접 파싱
- **섹션별 max_tokens 차등** — 섹션 3(커리큘럼) 가장 크게, 섹션 7(실적) 작게
- **SectionMetadata 에 감지된 키메시지 기록** — PM UI 에서 "어떤 키메시지가 반영됐나" 확인 가능
- any 금지, 의존성 추가 금지

## ✔️ Definition of Done

- [ ] `src/lib/proposal-ai.ts` 신규
- [ ] 7개 섹션 스펙 + 섹션별 프롬프트 빌더
- [ ] `generateProposalSection()` 구현 + 재시도 1회
- [ ] 섹션별 필요 슬라이스 검증 (`SLICE_REQUIRED:*` 에러)
- [ ] 분량·브랜드 규칙 검증 로직
- [ ] SectionMetadata 반환
- [ ] `/api/ai/proposal/route.ts` 신규 함수 호출
- [ ] manifest.reads.context 에 전체 슬라이스 포함
- [ ] typecheck / build 통과
- [ ] claude.ts · 다른 lib 수정 없음
- [ ] `/api/ai/proposal/improve/route.ts` 건드리지 않음 (별도 improve 로직 유지)

## 📤 Return Format

```
C3 proposal-ai 완료.

생성 파일:
- src/lib/proposal-ai.ts (X줄)

수정 파일:
- src/app/api/ai/proposal/route.ts (신규 함수 호출)
- src/app/(dashboard)/projects/[id]/step-proposal.manifest.ts (reads 보완)

7개 섹션 스펙 (title · focus · minChars · maxChars · requiresSlices):
1. 제안 배경 및 목적 (rfp)
2. 추진 전략 및 방법론 (rfp, strategy)
3. 교육 커리큘럼 (rfp, curriculum)
4. 운영 체계 및 코치진 (rfp, coaches)
5. 예산 및 경제성 (rfp, budget)
6. 기대 성과 및 임팩트 (rfp, impact)
7. 수행 역량 및 실적 (-)

섹션별 specific 프롬프트:
- 1: proposalBackground + concept + keyPlanningPoints + similarProjects
- 3: buildCurriculumContextForProposal (ud-brand 재사용)
- 4: 4중 지원 체계 필수 언급
- 5: 예산 구조 + SROI + 벤치마크
- 6: Logic Model 5계층 + 측정계획
- ...

공통 검증:
- 분량 min/max
- 브랜드 금지 표현 (§11 SKILL)
- 키메시지 최소 1개 반영 감지
- 섹션별 추가 (섹션3 Action Week, 섹션5 예산 숫자 등)

에러 분기:
- 400 SLICE_REQUIRED:{slice} (이전 스텝 미완)
- 401 Unauthorized
- 500 VALIDATION_FAILED (재시도 후)

검증:
- typecheck ✅
- build ✅

주의 / 이슈:
- Claude 응답이 JSON 아닌 마크다운 본문 — safeParseJson 사용 안 함
- improve 라우트와 분리 (별도 개선 워크플로우)

후속:
- C4 Wave 2 가 step-proposal.tsx 에서 이 API 호출 + SectionMetadata 표시
- Phase D1 winning-patterns 주입 (당선 제안서 섹션별 패턴)
- Phase D5 평가 시뮬 점수 Gate 3 통합
```

## 🚫 Do NOT

- claude.ts 수정 금지
- improve/route.ts 수정 금지 (별도 트랙)
- step-proposal.tsx 수정 금지 (C4)
- DB 쓰기 금지 (stateless, 저장은 기존 save API)
- 브랜드 §11 금지 목록 위반 (AI 코치 별도 레이어, 약자 동정 프레임)
- 새 의존성 금지

## 💡 Hints

- 마크다운 본문 응답은 Claude 의 `content[0].type === 'text'` 에서 `.text` 직접 꺼냄
- 섹션 7 은 독립적 (슬라이스 의존 없음) — Phase B 완료 즉시 생성 가능
- `validateSection` 의 keyMessage 감지는 간단한 regex/keyword 매칭 (예: `/정량|(?:\d+)명|4중|ACT-PRENEUR/`)
- `keepParts` 는 C3 범위에서 구현 필수 아님. "기존 문단 보존 후 나머지 재생성" 패턴은 improve 라우트에 더 적합. 간단 처리만 (프롬프트에 "이 문단은 유지: {keepParts}" 삽입).
- max_tokens 는 섹션별로 1500 (짧은 섹션) ~ 4096 (커리큘럼/임팩트)

## 🏁 Final Note

수주 품질의 최종 집약. 섹션별로 어떤 슬라이스가 반영되어야 하는지 명확히 — **이게 들어가지 않으면 Phase B/C 모든 이전 작업이 제안서에 안 뜸**. 검증 로직은 느슨하게 시작, 실사용 피드백으로 엄격화 (journey 에 기록).
