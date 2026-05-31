# B1 Brief: 기획 방향 AI 생성 API (stateless)

## 🎯 Mission (1 sentence)
`POST /api/ai/planning-direction` 엔드포인트를 구현하여, RFP 파싱 결과를 입력으로 받아 **제안배경 초안 + 컨셉 후보 3개 + 핵심 기획 포인트 3개** 를 JSON 으로 반환한다. **DB 저장은 하지 않는다** (stateless) — PM 이 UI 에서 확정한 후 별도 PATCH 로 저장.

## 📋 Context

**왜 stateless 인가 (설계 결정, 2026-04-15).**
- AI 가 후보 3개를 만들어도 PM 이 그중 1개를 골라 편집해야 확정. 미확정 데이터를 바로 DB 에 저장하면 Project 가 "추측값" 으로 오염됨.
- PM 이 여러 번 재생성할 수도 있음 (프롬프트 개선·다른 관점 시도). 매번 저장하면 쓰레기 데이터.
- stateless 로 가면 "생성 API" 와 "저장 API" 관심사가 분리되어 RESTful.

**저장은 누가 하나?** Wave 2 의 **B4 (step-rfp.tsx)** 가 PM 확정 버튼 클릭 시 `PATCH /api/projects/[id]/rfp` (별도 신규 엔드포인트, B4 가 구현) 로 저장.

**입력 / 출력 (data-contract.md §1.2 `RfpSlice` 의 해당 필드).**
```typescript
// Request
{
  projectId: string
  // 서버 측에서 project.rfpParsed 를 조회 (클라이언트가 다시 보내지 않음)
  // 추가 컨텍스트 (optional):
  similarProjects?: SimilarProject[]  // B2 호출 결과 (있으면 프롬프트에 주입)
}

// Response
{
  proposalBackground: string            // 600-900자, 정책→시장→현장 3단
  proposalConceptCandidates: Array<{    // 정확히 3개
    title: string                       // 30자 이내 헤드라인
    oneLiner: string                    // 80자 이내 한 줄 설명
    rationale: string                   // 왜 이 컨셉인가 (200자 이내)
  }>
  keyPlanningPoints: string[]           // 3개, 각 1문장
  derivedChannel?: "B2G" | "B2B" | "renewal"  // RFP 로부터 추정 (없으면 undefined)
}
```

**프롬프트 주입 (Context 조립):**
- `RfpParsed` 전체 (project.rfpParsed)
- `UD_IDENTITY` 씨앗 문장 (src/lib/ud-brand.ts, `buildBrandContext()` 활용)
- `UD_KEY_MESSAGE_PATTERNS` (정량 포화·Section V 보너스 등)
- `UD_TONE_GUIDE` (선언형 어조·정량 근거)
- 발주처 유형별 톤 프리셋 (ChannelPreset 은 Phase D2 예정, 지금은 간단 하드코딩 3종 — 아래 제공)
- **평가배점 전략** — `analyzeEvalStrategy(rfp.evalCriteria)` 서버에서 계산해 topItems·overallGuidance 주입 (B3 유틸 활용)
- 유사 프로젝트 리스트 (있으면)

## ✅ Prerequisites
1. 작업 디렉토리: `c:\Users\USER\projects\ud-ops-workspace`
2. `npm run build` 현재 통과
3. `src/lib/claude.ts` 에 Anthropic Claude 호출 패턴 존재 (`CLAUDE_MODEL`, `safeParseJson`)
4. `src/lib/ud-brand.ts` 의 `buildBrandContext()` 존재
5. `ANTHROPIC_API_KEY` env 설정됨 (로컬 개발용)
6. `Project` 모델에 `rfpParsed` 필드 존재 (이미 있음)

실패 시 STOP.

## 📖 Read These Files First

1. `CLAUDE.md` — 프로젝트 컨벤션 (Claude 모델, safeParseJson)
2. `AGENTS.md` — Next.js 16 경고
3. **`.claude/skills/ud-brand-voice/SKILL.md`** — 브랜드 보이스 (§1 정체성·§3 키 메시지·§10 톤 매트릭스·§11 금지 목록) — 프롬프트 설계의 기준
4. **`docs/architecture/data-contract.md` §1.2 `RfpSlice`** — 출력 필드 스펙
5. `src/lib/claude.ts` — 기존 Claude API 호출 패턴 (parseRfp, suggestCurriculum 등 참고)
6. `src/lib/ud-brand.ts` — `UD_IDENTITY`, `UD_KEY_MESSAGE_PATTERNS`, `UD_TONE_GUIDE`, `buildBrandContext()` 확인
7. `src/app/api/ai/parse-rfp/route.ts` — 기존 AI 라우트 패턴 (인증·에러 처리)
8. `src/lib/pipeline-context.ts` 의 `RfpSlice` 타입 — 출력 형태 일치 필요
9. `src/lib/auth.ts` — `auth()` 사용 패턴

## 🎯 Scope

### ✅ You CAN touch
- `src/app/api/ai/planning-direction/route.ts` (신규)
- `src/lib/planning-direction.ts` (신규, 옵션) — 프롬프트 빌더·타입 분리를 원하면
- `src/types/shared/planning-direction.ts` (신규, 옵션)

### ❌ You MUST NOT touch
- `prisma/schema.prisma` — B0 영역
- `src/app/(dashboard)/projects/[id]/*.tsx` — B4 Wave 2
- `src/lib/pipeline-context.ts` — A2 결과 유지
- `src/lib/ud-brand.ts` — 브랜드 자산 (KEEP)
- `src/lib/claude.ts` 기존 함수 수정 금지 — 새 함수만 추가하거나 별도 파일
- `package.json` — 의존성 추가 금지 (기존 @anthropic-ai/sdk 사용)

## 🛠 Tasks

### Step 1: 타입 정의

`src/lib/planning-direction.ts` (신규):

```typescript
import type { RfpParsed } from '@/lib/claude'
import type { SimilarProject } from '@/lib/pipeline-context'

export interface PlanningDirectionRequest {
  projectId: string
  similarProjects?: SimilarProject[]
}

export interface ProposalConceptCandidate {
  title: string
  oneLiner: string
  rationale: string
}

export interface PlanningDirectionResponse {
  proposalBackground: string
  proposalConceptCandidates: ProposalConceptCandidate[]   // 정확히 3개
  keyPlanningPoints: string[]                             // 3개
  derivedChannel?: 'B2G' | 'B2B' | 'renewal'
}
```

### Step 2: 발주처 유형 간단 판별 (임시 하드코딩)

ChannelPreset 테이블이 Phase D2 에서 생기기 전까지 간단 룰 기반:

```typescript
function deriveChannel(rfp: RfpParsed): 'B2G' | 'B2B' | 'renewal' {
  const clientName = (rfp.client ?? '').toLowerCase()
  if (/(시|도|구|군|진흥원|부|청|원|공단|공사|공공)/.test(rfp.client ?? '')) return 'B2G'
  if (/재단|법인/.test(rfp.client ?? '')) return 'B2G'
  // 재계약은 현재 판별 불가 — 추후 프로젝트 관계로 판별 (Phase C+)
  return 'B2B'
}

const CHANNEL_TONE_PROMPT = {
  B2G: '정책 대응 + 안정적 운영 + 정량 KPI 중심. 혁신 표현은 위험 부담으로 읽힐 수 있음.',
  B2B: '비즈니스 ROI + 속도 + 유연성. 결과 지향 언어.',
  renewal: '작년 성과 + 개선점 + 신뢰 누적 강조.',
}
```

### Step 3: 프롬프트 빌더

`buildPlanningDirectionPrompt(rfp, channel, evalStrategy, similarProjects?)` 가 시스템 + 유저 프롬프트를 조립.

**evalStrategy 주입 이유:** 평가배점 상위 3 항목과 overallGuidance 를 AI 가 알면 "핵심 기획 포인트" 가 평가배점 최고 항목에 정조준됨. B3 `analyzeEvalStrategy(rfp.evalCriteria)` 를 서버에서 먼저 호출 후 결과를 프롬프트 [평가배점 전략] 섹션에 삽입.

**시스템 프롬프트 뼈대 (ud-brand-voice SKILL 기반):**
```
당신은 언더독스의 수주 제안서 기획자입니다. 다음 RFP 를 분석해
① 제안배경 초안, ② 제안 컨셉 후보 3개, ③ 핵심 기획 포인트 3개를 생성하세요.

[언더독스 정체성]
- 미션: "창업의 가능성을 현실로 만들어 새로운 세상을 엽니다"
- 실행 철학: "해보기 전엔 아무것도 모른다"
- 차별화: AI 코치와 인간 코치의 이중 지원, 실행 보장형 교육

[발주처 유형: {channel}]
{CHANNEL_TONE_PROMPT[channel]}

[키 메시지 패턴 — 반드시 반영]
{buildBrandContext() 의 키 메시지 섹션}

[제안 컨셉 후보 작성 원칙]
- 각 후보는 서로 확연히 다른 각도여야 함 (실행보장형 / 지역정착형 / AI협업형 등)
- 한 줄 설명에 "국내 최초" / 정량 포화 / 브랜딩된 신조어 적극 활용
- 근거(rationale)에는 왜 이 컨셉이 이 RFP 에 적합한지 구체 근거

[핵심 기획 포인트 작성 원칙]
- RFP 평가배점에서 최고 배점 항목 2개에 직접 대응
- 나머지 1개는 언더독스 강점(4중 지원·800 코치·20,211 누적 등) 활용

[출력 형식 (JSON)]
{
  "proposalBackground": "...",
  "proposalConceptCandidates": [{...}, {...}, {...}],
  "keyPlanningPoints": ["...", "...", "..."],
  "derivedChannel": "B2G"
}
```

**유저 프롬프트:**
RfpParsed 직렬화 + (있으면) 유사 프로젝트 요약.

### Step 4: API 라우트

`src/app/api/ai/planning-direction/route.ts`:
- `POST` 핸들러
- NextAuth 인증 체크 (`auth()`)
- 요청 파싱 → `projectId` 추출
- Prisma 로 `project.rfpParsed` 조회. 없으면 400 `{ error: "RFP_NOT_PARSED" }`
- **`analyzeEvalStrategy(rfp.evalCriteria)` 호출** (B3 유틸) → prompt 주입용
- `deriveChannel(rfp)` → 채널 타입
- 프롬프트 조립 → Claude API 호출 (max_tokens: 4096)
- `safeParseJson` 으로 파싱
- 출력 검증: `proposalConceptCandidates.length === 3` 보장 (부족하면 500 + raw)
- JSON 응답

**에러 처리 패턴:** `src/app/api/ai/parse-rfp/route.ts` 참고.

### Step 5: 품질 기준

아래 조건 만족하는지 내부 검증 코드 포함:

```typescript
function validatePlanningDirection(r: PlanningDirectionResponse): string | null {
  if (!r.proposalBackground || r.proposalBackground.length < 300) return 'proposalBackground 너무 짧음'
  if (r.proposalConceptCandidates?.length !== 3) return '컨셉 후보는 정확히 3개'
  for (const c of r.proposalConceptCandidates) {
    if (!c.title || !c.oneLiner || !c.rationale) return '컨셉 필수 필드 누락'
  }
  if (r.keyPlanningPoints?.length !== 3) return '핵심 포인트는 정확히 3개'
  return null
}
```

실패 시 재시도 1회, 재시도도 실패하면 500 반환.

### Step 6: 검증

```bash
npm run typecheck
npm run build
```

둘 다 통과. 런타임 호출은 optional (브리프 범위 밖).

## 🔒 Tech Constraints

- **Claude 모델:** `claude-sonnet-4-6` (`CLAUDE_MODEL` 상수, src/lib/claude.ts)
- **JSON 파싱:** `safeParseJson` 필수 사용 (기존 헬퍼)
- **max_tokens:** 4096 (제안배경 + 3개 컨셉 + 3개 포인트 충분)
- **인증:** NextAuth 세션 필수 (미인증 401)
- **DB 쓰기 ❌:** 저장은 B4 가 별도 PATCH 로
- **의존성 추가 금지**

## ✔️ Definition of Done

- [ ] `src/app/api/ai/planning-direction/route.ts` POST 구현됨
- [ ] `src/lib/planning-direction.ts` 에 타입·프롬프트 빌더 정의됨
- [ ] NextAuth 인증 체크
- [ ] 입력 검증 (projectId 필수, rfpParsed 존재)
- [ ] Claude 호출 + safeParseJson
- [ ] 출력 검증 (컨셉 3개, 포인트 3개)
- [ ] 재시도 1회 로직
- [ ] 에러 응답 (400/401/500) 명확
- [ ] `npm run typecheck` 통과
- [ ] `npm run build` 통과
- [ ] Project 수정 없음 (stateless)
- [ ] 다른 파일 수정 없음 (git diff 확인)

## 📤 Return Format

```
B1 Planning Direction AI 완료.

생성 파일:
- src/app/api/ai/planning-direction/route.ts
- src/lib/planning-direction.ts

출력 스펙:
- proposalBackground, proposalConceptCandidates[3], keyPlanningPoints[3], derivedChannel?

프롬프트 주입:
- RfpParsed 전체
- UD_IDENTITY / UD_KEY_MESSAGE_PATTERNS / UD_TONE_GUIDE
- CHANNEL_TONE_PROMPT (B2G/B2B/renewal 하드코딩, Phase D2 에서 ChannelPreset DB 로 교체 예정)
- similarProjects (optional, 있으면 주입)

품질 검증 로직:
- 출력 필드 길이·개수 체크 + 재시도 1회

검증:
- npm run typecheck: ✅
- npm run build: ✅

주의 / 이슈:
- Claude 응답이 3개 컨셉을 보장 못 하면 재시도. 2회 실패 시 500.
- [추가 발견]

후속:
- B4 UI 가 이 API 호출 + 3개 카드 렌더링 + 선택 편집 → PATCH
- Phase D2 에서 ChannelPreset DB 로 하드코딩 교체
```

## 🚫 Do NOT

- Prisma Project 에 쓰기 금지 (stateless 필수)
- schema.prisma 수정 금지 (B0 영역)
- step-rfp.tsx 건드리지 말 것 (B4 영역)
- claude.ts 기존 함수 수정 금지
- 브랜드 자산 텍스트 하드코딩 ❌ — 반드시 `UD_IDENTITY` / `UD_KEY_MESSAGE_PATTERNS` 등 상수에서
- AI 에 "약자" 프레임 유도 금지 (ud-brand-voice SKILL §11 참조 — Underdog 재정의 존중)
- 새 의존성 추가 금지

## 💡 Hints

- `CLAUDE_MODEL` 은 `src/lib/claude.ts` 에 정의. 재사용.
- `safeParseJson` 은 응답 시작·끝의 ``` 마크다운 블록도 처리. 최신 버전은 배열도 파싱.
- Claude 는 한국어 JSON 출력 시 프롬프트 맨 끝에 `JSON 으로만 응답하세요` 명시 필요.
- 컨셉 후보 3개가 서로 비슷하게 나오면 프롬프트에 "세 개는 서로 다른 각도여야 함 (예: 실행 보장형 / 지역 정착형 / AI 협업형)" 명시.
- 프롬프트에 `"one-page-one-thesis"` 원칙 언급하면 품질 올라감 (ud-brand.ts 의 UD_KEY_MESSAGE_PATTERNS 참조).

## 🏁 Final Note

이 API 가 Step 1 의 지능적 핵심. 여기서 나오는 3개 컨셉이 제안서 전체 흐름을 좌우함. **프롬프트 초안을 짜고 한 번은 실제 RFP 로 돌려서 3개 후보 품질을 눈으로 봐야 할 것** — 브리프 범위 밖이지만 테스트해보면 좋음. 막히면 보고.
