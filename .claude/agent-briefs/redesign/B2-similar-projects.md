# B2 Brief: 유사 프로젝트 검색 API

## 🎯 Mission (1 sentence)
`GET /api/projects/[id]/similar` 엔드포인트를 구현하여, 지정된 프로젝트의 RFP 특성을 기준으로 **과거 유사 프로젝트 top N개**를 점수화·정렬하여 반환한다. AI 호출 없이 PostgreSQL 쿼리 + 가중치 스코어링.

## 📋 Context

**왜 이 작업이 필요한가.**
- Step 1 기획 방향 AI(B1) 의 프롬프트에 "유사 프로젝트 레퍼런스" 를 주입하면 품질 향상 (ud-brand-voice SKILL §3 "회사 역량·신뢰" 메시지).
- PM 도 Step 1 우측 패널에서 "비슷한 사업 과거 어떻게 했나" 를 즉시 참조.
- 장기적으로 수주율 분석의 기반 데이터.

**매칭 기준 (가중치):**
- 키워드 겹침 (objectives, keywords): w1 = 0.40
- 발주처 일치: w2 = 0.30
- 예산 규모 유사 (±50%): w3 = 0.20
- 대상자 단계 일치 (targetStage): w4 = 0.10

**점수:** `similarity = w1 * kw + w2 * client + w3 * budget + w4 * target` — 각 항목 0~1 로 정규화.

## ✅ Prerequisites
1. 작업 디렉토리: `c:\Users\USER\projects\ud-ops-workspace`
2. `npm run build` 통과
3. `Project` 모델에 `rfpParsed`, `client`, `supplyPrice` 등 필드 존재
4. Prisma client 타입 최신 (npx prisma generate 완료된 상태)

실패 시 STOP.

## 📖 Read These Files First

1. `CLAUDE.md`
2. `AGENTS.md`
3. **`docs/architecture/data-contract.md` §1.2** — `SimilarProject` 타입 (출력 스펙)
4. `src/lib/pipeline-context.ts` — `SimilarProject` 인터페이스 현재 정의
5. `prisma/schema.prisma` — `Project` 모델 확인 (특히 rfpParsed JSON 구조)
6. `src/lib/claude.ts` — `RfpParsed` 타입 (`keywords`, `objectives`, `targetStage` 필드 확인)
7. `src/app/api/projects/[id]/pipeline-context/route.ts` — A2 가 만든 params pattern 참고
8. `src/app/api/coaches/route.ts` — 기존 GET 라우트 + 인증 패턴

## 🎯 Scope

### ✅ You CAN touch
- `src/app/api/projects/[id]/similar/route.ts` (신규)
- `src/lib/similar-projects.ts` (신규) — 스코어링 로직 분리

### ❌ You MUST NOT touch
- `prisma/schema.prisma` — B0 영역
- `src/lib/pipeline-context.ts` — A2 결과 유지 (단 `SimilarProject` 타입 import 는 OK)
- `src/app/(dashboard)/projects/[id]/*.tsx` — B4 영역
- 기존 API 라우트 수정 금지
- `src/lib/claude.ts` 수정 금지
- `package.json` — 의존성 추가 금지

## 🛠 Tasks

### Step 1: 스코어링 유틸

`src/lib/similar-projects.ts`:

```typescript
import type { RfpParsed } from '@/lib/claude'
import type { SimilarProject } from '@/lib/pipeline-context'

export interface SimilarProjectSearchOptions {
  topN?: number                // 기본 5
  minScore?: number            // 기본 0.2 (너무 낮으면 제외)
  includeLost?: boolean        // 수주 실패 프로젝트도 포함 (기본 true — 반면교사)
}

// 각 항목 0~1
export function keywordOverlap(a: string[], b: string[]): number { ... }
export function clientMatch(a: string | null, b: string | null): number { ... }
export function budgetSimilarity(a: number | null, b: number | null): number { ... }
export function targetStageMatch(a: string | null, b: string | null): number { ... }

const WEIGHTS = { keywords: 0.4, client: 0.3, budget: 0.2, target: 0.1 }

export function scoreSimilarity(baseRfp: RfpParsed, baseBudget: number | null, candidate: {
  rfpParsed: RfpParsed | null
  client: string | null
  supplyPrice: number | null
}): number { ... }
```

**keywordOverlap 구현 힌트:**
```typescript
const setA = new Set(a.map(s => s.toLowerCase().trim()))
const setB = new Set(b.map(s => s.toLowerCase().trim()))
const intersection = [...setA].filter(x => setB.has(x)).length
const union = new Set([...setA, ...setB]).size
return union === 0 ? 0 : intersection / union    // Jaccard similarity
```

**budgetSimilarity:**
```typescript
if (a === null || b === null || a === 0) return 0
const diff = Math.abs(a - b) / Math.max(a, b)
return Math.max(0, 1 - diff)   // 0% 차이 → 1, 100% 차이 → 0
```

### Step 2: 메인 검색 함수

`findSimilarProjects(projectId: string, options?): Promise<SimilarProject[]>`:

1. 기준 프로젝트(projectId) 조회 → `baseRfp`, `baseBudget`, `baseTargetStage` 추출. 없으면 빈 배열 반환.
2. 후보 프로젝트 조회:
   - `where: { id: { not: projectId }, rfpParsed: { not: null } }`
   - `orderBy: { updatedAt: 'desc' }` — **최근 수정순** (가장 신선한 레퍼런스 우선)
   - `take: 100` — 성능 위한 샘플링
3. 각 후보에 `scoreSimilarity()` 계산
4. `minScore` 미만 제외, top N 정렬 후 `SimilarProject` 타입으로 변환해 반환.

### Step 3: SimilarProject 타입 매핑

`SimilarProject` (pipeline-context.ts §1.2) 에 맞게 변환:

```typescript
{
  projectId: string
  name: string
  client: string | null
  budget: number | null
  won: boolean | null           // Project.status 가 'IN_PROGRESS' / 'COMPLETED' 면 true, 'LOST' 면 false, else null
  keyStrategy?: string | null   // Project.proposalConcept 이 있으면 사용 (B0 가 필드 추가 전까지 undefined)
  similarity: number            // 0~1
}
```

`won` 판별:
- `status === 'COMPLETED' || status === 'IN_PROGRESS' || status === 'SUBMITTED'` → `true` (확정 수주)
- `status === 'LOST'` → `false`
- 그 외 (`DRAFT`, `PROPOSAL`) → `null`

### Step 4: API 라우트

`src/app/api/projects/[id]/similar/route.ts`:

```typescript
// GET /api/projects/[id]/similar?topN=5&includeLost=true
// Next.js 16 params Promise 패턴 (src/app/api/projects/[id]/pipeline-context/route.ts 참고)

export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return 401

  const { id } = await params
  const url = new URL(req.url)
  const topN = parseInt(url.searchParams.get('topN') ?? '5', 10)
  const includeLost = url.searchParams.get('includeLost') !== 'false'

  const results = await findSimilarProjects(id, { topN, includeLost })
  return NextResponse.json(results)
}
```

인증·예외 처리는 A2 의 pipeline-context route 와 같은 패턴.

### Step 5: 검증

```bash
npm run typecheck
npm run build
```

둘 다 통과. 런타임 테스트는 optional (DB 에 Project 레코드 2개+ 있어야 의미 있음).

## 🔒 Tech Constraints

- **AI 호출 없음** — 순수 Prisma + 계산
- **성능:** 후보 샘플링 100건 이하. 전체 스캔 금지.
- **Next.js 16:** params Promise 패턴
- **의존성 추가 금지**

## ✔️ Definition of Done

- [ ] `src/lib/similar-projects.ts` 에 스코어링 유틸 + 검색 함수
- [ ] `src/app/api/projects/[id]/similar/route.ts` GET 구현
- [ ] 인증 체크
- [ ] `topN`, `includeLost` 쿼리 파라미터 지원
- [ ] 출력이 `SimilarProject` 타입과 일치 (pipeline-context.ts)
- [ ] `npm run typecheck` 통과
- [ ] `npm run build` 통과
- [ ] 스키마·기존 코드 변경 없음 (git diff 확인)

## 📤 Return Format

```
B2 Similar Projects 완료.

생성 파일:
- src/lib/similar-projects.ts (스코어링 + findSimilarProjects)
- src/app/api/projects/[id]/similar/route.ts (GET)

스코어링:
- Jaccard keyword overlap (w=0.4)
- client exact match (w=0.3)
- budget similarity ±50% (w=0.2)
- targetStage match (w=0.1)

쿼리 파라미터:
- ?topN=5 (기본 5)
- ?includeLost=true|false (기본 true)

성능:
- 후보 샘플링 100건 제한

검증:
- npm run typecheck: ✅
- npm run build: ✅

주의 / 이슈:
- [후보 샘플링 기준 정렬을 최신순으로 했는지 등]
- SimilarProject.keyStrategy 는 Project.proposalConcept (B0 완료 후에만) 이 source. 현재 DB 에 그 필드 없으면 undefined.

후속:
- B1 API 가 이 결과를 프롬프트 주입에 활용
- B4 UI 가 Step 1 에 유사 프로젝트 패널 렌더링
- 향후: 임베딩 기반 semantic similarity 로 업그레이드 (Phase F+)
```

## 🚫 Do NOT

- AI 호출 금지 (본 엔드포인트는 결정론적 계산)
- Prisma schema 수정 금지
- PipelineContext 타입 수정 금지 (import 만)
- 전체 프로젝트 스캔 금지 (샘플링 100건)
- 의존성 추가 금지

## 💡 Hints

- `RfpParsed.keywords`, `objectives` 가 배열인지 문자열인지 확인. 스키마에 따라 다를 수 있음.
- Jaccard 는 keyword 겹침에 적절. 정확도 낮으면 후속 phase 에 임베딩 기반으로 업그레이드.
- Project.status 의 enum 값은 schema.prisma 에서 확인 (DRAFT/PROPOSAL/SUBMITTED/IN_PROGRESS/COMPLETED/LOST).
- `SimilarProject.keyStrategy` 는 현재 대부분 `undefined`. B0 완료 + 과거 프로젝트에 `proposalConcept` 데이터가 채워진 후에야 의미 있음. 지금은 타입만 맞추고 실데이터 없으면 undefined.
- `supplyPrice` 와 `totalBudgetVat` 중 뭘 쓸지 결정 — 대외 비교는 VAT 포함 더 안전. 일관성 위해 `supplyPrice` 권장.

## 🏁 Final Note

스코어링 기준은 v1. 실제 돌려보면 "키워드 겹침이 부족하게 잡힌다" 같은 feedback 이 나올 수 있음. **가중치와 알고리즘은 journey 에 기록해서 추후 조정 여지**. 지금은 구조 + 기본 버전 완성이 목표.
