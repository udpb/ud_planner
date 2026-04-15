# 데이터 계약 (PipelineContext + 공유 스키마)

> **핵심:** 모듈 간 "직접 호출"은 금지. 대신 `PipelineContext` 객체 + Prisma 공유 스키마를 통한 간접 연결. 한 번 생산된 정보는 다시 묻지 않는다.

## 1. PipelineContext — 스텝 간 흐르는 데이터

### 1.1 전체 타입

```typescript
// src/lib/pipeline-context.ts
export interface PipelineContext {
  projectId: string
  version: number              // 낙관적 락용

  // Step 1: RFP + 기획 방향 + 전략
  rfp?: RfpSlice
  strategy?: StrategySlice
  research?: ResearchItem[]

  // Step 2: 커리큘럼
  curriculum?: CurriculumSlice

  // Step 3: 코치
  coaches?: CoachesSlice

  // Step 4: 예산 + SROI
  budget?: BudgetSlice

  // Step 5: 임팩트
  impact?: ImpactSlice

  // Step 6: 제안서
  proposal?: ProposalSlice

  // 메타
  meta: {
    projectType: "B2G" | "B2B"
    channelType: "bid" | "renewal" | "lead"
    predictedScore?: number
    lastUpdatedAt: string
    lastUpdatedBy: string       // userId
    lastUpdatedModule: string   // 모듈명 (manifest.name)
  }
}
```

### 1.2 슬라이스별 상세

**RfpSlice** (Step 1A/1B/1C/1D)
```typescript
interface RfpSlice {
  parsed: RfpParsed                // 기존 타입 유지
  proposalBackground: string       // 제안배경 초안
  proposalConcept: string          // 한 줄 컨셉
  keyPlanningPoints: string[]      // 핵심 기획 포인트 3개
  evalStrategy: EvalStrategy       // 최고배점·섹션매핑·가중치
  similarProjects: SimilarProject[] // 유사 프로젝트 top N
  confirmedAt?: string             // PM 확정 시각 (미확정이면 undefined)
}
```

**StrategySlice** (Planning Agent 산출물)
```typescript
interface StrategySlice {
  whyUs: string
  clientHiddenWants: string
  mustNotFail: string
  competitorWeakness: string
  internalAdvantage: string
  riskFactors: string[]
  decisionMakers: string
  derivedKeyMessages: string[]    // 제안서에 주입될 키 메시지
  completeness: number            // 0-100
  confidence: "low" | "medium" | "high"
}
```

**CurriculumSlice**
```typescript
interface CurriculumSlice {
  tracks: Track[]
  sessions: CurriculumSession[]
  designRationale: string
  impactModuleMapping: Record<string, string>  // sessionId → moduleId
  ruleValidation: RuleValidationResult          // curriculum-rules 결과
  confirmedAt?: string
}
```

**CoachesSlice**
```typescript
interface CoachesSlice {
  assignments: CoachAssignment[]
  sessionCoachMap: Record<number, string[]>   // sessionNo → coachId[]
  totalFee: number
  recommendationReasons: Record<string, string>  // coachId → 왜 추천됐는지
}
```

**BudgetSlice**
```typescript
interface BudgetSlice {
  structure: BudgetStructure
  marginRate: number
  sroiForecast: SroiForecast
  benchmark: BenchmarkResult
  warnings: BudgetWarning[]                   // 룰 엔진 경고
}
```

**ImpactSlice**
```typescript
interface ImpactSlice {
  goal: string
  logicModel: LogicModel                      // 5계층
  measurementPlan: MeasurementItem[]
  autoExtracted: {                            // 커리큘럼에서 자동 추출 표시
    activities: boolean                       // true = 커리큘럼에서 자동
    inputs: boolean                           // true = 코치+예산에서 자동
  }
}
```

**ProposalSlice**
```typescript
interface ProposalSlice {
  sections: ProposalSection[]                 // 7개 섹션
  scoreSimulation?: ScoreSimulationResult     // 섹션별 예상 점수
  revisionHistory: RevisionEntry[]
}
```

## 2. 계약 규칙 (모듈이 지켜야 할 것)

### 2.1 읽기 규칙
- 모듈은 `manifest.reads.context`에 선언한 슬라이스만 읽는다.
- 슬라이스가 `undefined`인 경우 → "이전 스텝 미완료"로 해석, UI는 "먼저 Step N을 완료해주세요" 표시.
- **과거 프로젝트 컨텍스트 참조**는 직접 DB 쿼리 ❌ → `past-projects` 자산 모듈의 함수를 통해야 함.

### 2.2 쓰기 규칙
- 모듈은 `manifest.writes.context`에 선언한 슬라이스만 쓴다.
- 부분 업데이트는 slice 단위 (rfp만, curriculum만). 다른 슬라이스는 건드리지 않음.
- 쓰기 후 반드시 `meta.lastUpdatedAt`, `lastUpdatedBy`, `lastUpdatedModule` 갱신.
- `version` 증가 → 동시 수정 충돌 감지.

### 2.3 PM 확정 규칙
- 각 슬라이스는 `confirmedAt`을 갖는다 (해당되는 경우).
- 미확정 슬라이스를 읽는 다운스트림 모듈은 UI에 "초안 기반" 경고 표시.
- PM 확정 = "이 스텝의 결과를 다음 스텝에 쓰겠다"는 의사표시.

## 3. 영속화 — Prisma 스키마 매핑

PipelineContext는 런타임 객체. DB에는 다음과 같이 저장:

| Slice | DB 저장 위치 |
|-------|-------------|
| `rfp.parsed` | `Project.rfpParsed` (JSON) |
| `rfp.proposalBackground/Concept/keyPlanningPoints` | `Project.proposalBackground`, `proposalConcept`, `keyPlanningPoints` (신규 필드) |
| `rfp.evalStrategy` | `Project.evalStrategy` (신규 JSON 필드) |
| `rfp.similarProjects` | 조인 쿼리 (past-projects 자산) |
| `strategy.*` | `PlanningIntentRecord` (기존) |
| `curriculum.*` | `CurriculumItem[]` + `Project.designRationale` |
| `coaches.*` | `CoachAssignment[]` |
| `budget.*` | `Budget`, `BudgetItem[]` + `Project.sroiForecast` |
| `impact.*` | `Project.logicModel` + `Project.measurementPlan` |
| `proposal.*` | `ProposalSection[]` |
| `meta.predictedScore` | `Project.predictedScore` (신규 필드) |

**API:** `GET /api/projects/[id]/pipeline-context` → 전체 조합하여 반환.
**Mutation:** 각 모듈의 개별 API가 자기 슬라이스만 업데이트 → 다음 `GET` 호출 시 병합됨.

## 4. 확장 규칙 — 새 슬라이스·새 필드 추가

### 슬라이스 추가 (거의 없어야 함)
1. 이 문서에 타입 정의 추가
2. ADR 작성 (왜 기존 슬라이스로 안 되는지)
3. 해당 모듈의 manifest에 `writes.context` 추가
4. Prisma 마이그레이션

### 필드 추가 (일반적)
1. 타입에 `?:` optional 필드로 추가 (기존 데이터 깨지지 않게)
2. 해당 모듈의 manifest만 영향 받는지 확인
3. Prisma 마이그레이션 (필요 시)

### 필드 제거
1. Deprecation 주석 달고 한 버전 유지
2. 다음 버전에서 제거 + ADR

## 5. 타입 단일 원천

```
src/lib/pipeline-context.ts           ← PipelineContext 최상위 타입
src/modules/<name>/types.ts           ← 해당 모듈이 기여하는 슬라이스 타입
src/types/shared/*.ts                 ← 여러 모듈이 공유하는 하위 타입 (CurriculumSession 등)
```

**금지:** 모듈이 다른 모듈의 `types.ts`를 import. 필요하면 `src/types/shared/`로 승격.

## 6. 품질 게이트 (계약 위반 감지)

데이터 계약은 선언만으로는 지켜지지 않는다. [quality-gates.md](./quality-gates.md)에서 다음을 강제:

- **타입 체크:** 빌드 시 TypeScript가 잘못된 슬라이스 접근 차단
- **런타임 어설션:** `context.rfp.proposalConcept` 읽을 때 `rfp`가 `confirmedAt` 없으면 개발 환경에서 경고 로그
- **ESLint 커스텀 룰:** 모듈이 manifest에 없는 context slice를 import하면 에러 (Phase F 이후)
- **계약 테스트:** 각 모듈별 "이 입력이면 이 출력 슬라이스만 바뀐다" 단위 테스트

---

**다음 문서:** [ingestion.md](./ingestion.md) — 자료 업로드 → 자산 자동 고도화 파이프라인
