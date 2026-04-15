# B0 Brief: Schema 확장 — Project 에 기획방향·평가전략 필드 추가

## 🎯 Mission (1 sentence)
`Project` Prisma 모델에 재설계 v2 의 Step 1 산출물을 저장할 5개 필드(`proposalBackground`, `proposalConcept`, `keyPlanningPoints`, `evalStrategy`, `predictedScore`)를 **추가만** 하고, 마이그레이션 1건을 생성한다.

## 📋 Context

**왜 이 작업이 필요한가.** Phase B Step 1 고도화의 산출물(제안배경·컨셉·핵심포인트·평가전략)을 저장할 곳이 없다. data-contract.md §3 에서 이미 매핑 표가 정의되어 있음 — 실제 컬럼만 만들어주면 됨.

**어떤 필드인지.** 모두 Optional — 기존 Project 레코드는 깨지지 않음.
- `proposalBackground: String?` — 제안배경 초안 (긴 텍스트)
- `proposalConcept: String?` — 확정된 컨셉 한 줄 (PM 이 3개 후보 중 선택·편집)
- `keyPlanningPoints: Json?` — 핵심 기획 포인트 배열 (`string[]`)
- `evalStrategy: Json?` — 평가배점 전략 객체 (B3 의 출력)
- `predictedScore: Float?` — 예상 점수 (Phase D4 에서 본격 활용, 지금은 필드만)

**다른 Phase B 작업과의 관계:**
- B1 stateless API 는 이 필드들을 **저장하지 않음** (JSON 반환만). B0 없이도 B1 개발 가능.
- B4 UI 가 PM 확정 시 PATCH 로 이 필드들 저장. B4 는 Wave 2 이므로 B0 가 먼저 완료되어야 함.
- B2/B3 는 이 필드들과 무관 (B2 는 기존 데이터, B3 는 순수 유틸).

**중요한 것:** pipeline-context.ts 의 `RfpSlice` 타입은 **이미 이 필드들을 참조**하고 있음. buildPipelineContext() 는 현재 undefined 로 처리 중 — 필드가 추가되면 자동으로 실제 값 반환 가능해짐 (단, 실제 값 주입은 B4 완료 후).

## ✅ Prerequisites
1. 작업 디렉토리: `c:\Users\USER\projects\ud-ops-workspace`
2. `npm run build` 현재 통과
3. PostgreSQL 실행 중, Prisma migrate dev 가능
4. `prisma/schema.prisma` 에 `Project` 모델 존재
5. Phase A 완료됨 (Ingestion 마이그레이션 `add_ingestion_skeleton` 이 이미 적용되어 있어야 함)

실패 시 STOP.

## 📖 Read These Files First

1. `CLAUDE.md`
2. `AGENTS.md`
3. **`docs/architecture/data-contract.md` §1.2 `RfpSlice` + §3 DB 매핑 표** — 필드 이름·타입 이곳에 근거
4. `prisma/schema.prisma` — `Project` 모델 현재 정의 확인
5. `src/lib/pipeline-context.ts` 의 `RfpSlice` 인터페이스 — 타입 일치 필요

## 🎯 Scope

### ✅ You CAN touch
- `prisma/schema.prisma` — `Project` 모델에 5개 필드 **추가만**
- `prisma/migrations/` — 자동 생성 (migration name: `add_rfp_planning_fields`)

### ❌ You MUST NOT touch
- 기존 Project 필드 수정 금지
- 다른 Prisma 모델 수정 금지 (IngestionJob 등 Phase A 에서 추가된 것 포함)
- `src/lib/pipeline-context.ts` 수정 금지 (타입은 이미 맞음)
- 어떤 API / UI 파일도 수정 금지 — 순수 schema 작업
- `package.json` — 의존성 추가 금지

## 🛠 Tasks

### Step 1: Project 모델에 필드 5개 추가

`prisma/schema.prisma` 의 `Project` 모델을 찾아 **필드만 추가**. 모델 본문 내 적당한 위치(기존 JSON 필드 근처)에:

```prisma
model Project {
  // ... 기존 필드들 유지 ...

  // Phase B: Step 1 기획 방향 산출물 (data-contract.md §1.2 RfpSlice)
  proposalBackground String?   @db.Text
  proposalConcept    String?   @db.Text
  keyPlanningPoints  Json?     // string[]
  evalStrategy       Json?     // EvalStrategy 객체 (eval-strategy.ts 참조)

  // Phase D: 예상 점수 (Phase D4 에서 본격 활용, B0 에서 필드만 준비)
  predictedScore     Float?

  // ... 기존 관계·인덱스 유지 ...
}
```

**주의:** 필드 순서나 위치는 기존 유사 필드(JSON 타입 등) 근처에 배치. 기존 필드·관계 선언·인덱스·@@map 등 **절대 수정하지 않음**.

### Step 2: 마이그레이션 생성

```bash
npx prisma migrate dev --name "add_rfp_planning_fields"
npx prisma generate
```

- 마이그레이션 이름: `add_rfp_planning_fields` (고정)
- 프롬프트에서 migration name 재확인 시 그대로 엔터
- DB 에 실제 적용됨 + Prisma Client 타입 재생성

### Step 3: 검증

```bash
npm run typecheck
npm run build
```

두 개 모두 통과해야 완료. 특히 `src/lib/pipeline-context.ts` 가 새 필드를 참조하더라도 현재는 optional 체이닝으로 처리되어 있어 에러 없어야 함 (A2 가 의도적으로 그렇게 설계).

## 🔒 Tech Constraints

- **추가만, 수정 금지** — 기존 필드·인덱스·관계 손대지 않음
- **필드 모두 optional** (`?:`) — 기존 레코드 깨지지 않게
- **마이그레이션 이름 고정:** `add_rfp_planning_fields`
- **의존성 추가 금지**

## ✔️ Definition of Done

- [ ] `Project` 모델에 `proposalBackground`, `proposalConcept`, `keyPlanningPoints`, `evalStrategy`, `predictedScore` 5개 필드 추가됨
- [ ] 모든 필드 optional
- [ ] 기존 Project 필드·관계·인덱스 변경 없음 (git diff 로 확인)
- [ ] 마이그레이션 `add_rfp_planning_fields` 생성됨
- [ ] `npx prisma generate` 후 Prisma Client 타입에 새 필드 노출됨
- [ ] `npm run typecheck` 통과
- [ ] `npm run build` 통과

## 📤 Return Format

```
B0 Schema 확장 완료.

변경 파일:
- prisma/schema.prisma (Project 모델에 5개 필드 추가)
- prisma/migrations/YYYYMMDDHHMMSS_add_rfp_planning_fields/migration.sql (자동 생성)

추가 필드:
- proposalBackground: String? @db.Text
- proposalConcept: String? @db.Text
- keyPlanningPoints: Json?
- evalStrategy: Json?
- predictedScore: Float?

검증:
- npx prisma migrate dev: ✅
- npx prisma generate: ✅
- npm run typecheck: ✅
- npm run build: ✅

주의 / 발견:
- [있다면]

후속:
- B4 Wave 2 에서 PATCH /api/projects/[id]/rfp 구현 시 이 필드에 저장
- Phase D4 에서 predictedScore 본격 활용
```

## 🚫 Do NOT

- 기존 Project 필드 수정 / 삭제 금지
- 다른 모델 건드리지 말 것
- API 라우트 생성 금지 (B4 가 담당)
- UI 파일 수정 금지
- `buildPipelineContext()` 수정 금지 (A2 결과 유지)
- 새 의존성 추가 금지

## 💡 Hints

- `@db.Text` 는 PostgreSQL 의 `TEXT` 타입 — 긴 문자열용. VARCHAR 제한 없음.
- `Json?` 은 `Prisma.JsonValue | null` 로 타입화됨. 구체 타입 안정성은 런타임 파싱 시점에 보장 (이 단계에서 걱정 ❌).
- `Float?` 은 PostgreSQL `DOUBLE PRECISION`. predictedScore 는 0~100 실수값 예정.
- 마이그레이션 파일은 커밋 대상. 자동 생성된 SQL 검토해서 의도와 일치 확인.

## 🏁 Final Note

15분짜리 작업. 그러나 Wave 2 B4 와 이후 Phase C/D 에서 계속 쓰는 기반. 필드 이름 오타 없이 data-contract.md §1.2 와 **정확히 일치**시키자. 이름이 어긋나면 buildPipelineContext() 가 자동으로 못 읽어와서 전체 흐름 깨짐.
