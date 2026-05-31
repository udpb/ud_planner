# Brief DATA-1 — 과업(Workstream) 레이어 Prisma 스키마 (순수 추가)

> **자급자족.** 본 파일 + `../../CLAUDE.md` + `../../AGENTS.md` + `../../docs/glossary.md`.
> 막히면 추측 금지 → STOP 후 메인 보고.

| 메타 | 값 |
|------|----|
| ID | `DATA-1-workstream-schema` |
| 작성일 | 2026-06-01 |
| 상태 | ✅ 완료 (2026-06-01, 메인 검증: 모델 42→50·validate✓·typecheck 0·manifest 0·scope clean). ⚠️ migration 미적용 — 로컬 DB drift(별건). |
| 우선순위 | P2 |
| 격리 | 일반 (단독 실행 — 병렬 prisma generate race 방지) |
| 관련 | ADR-019(과업 레이어, Accepted) · Tech Spec §3·§7 |
| 의존 | 없음. 후속 RET-1·EX-1 이 본 스키마 위에 빌드 |

## 🎯 Mission
ADR-019 과업 레이어를 Prisma 스키마에 **순수 추가(additive)** 한다: 8개 신규 모델 + Project 관계 + 기존 모델에 nullable 필드 추가 + 과업유형 타입 + 하위호환 어댑터. **기존 데이터를 깨뜨리는 변경 금지**(unique 제약·타입 변경·pgvector 전환은 본 브리프 범위 아님).

## 📋 Context
Tech Spec §3 데이터 모델. 제안서를 "교육 1종"에서 "N과업 합성"으로 재구성하는 토대. 후속 RET-1(검색)·EX-1(엔진)이 이 스키마를 소비. **pgvector 이관·sourceRef unique-dedup 은 DATA-2(별건)** — 실데이터 마이그레이션 위험이라 분리.

## ✅ Prerequisites (STOP 조건)
- [ ] `prisma/schema.prisma` 존재 · Prisma 7 — 검증: `grep -n "model Project" prisma/schema.prisma` (line ~247)
- [ ] `prisma generate` 가 DB 없이 동작(스키마 검증용) — 검증: `npx prisma validate`
- [ ] DATABASE_URL = localhost:5432 (로컬 docker). **DB 미기동이어도 진행** — migrate 는 조건부(아래 Task 5)

## 📖 Read These Files First
1. `../../AGENTS.md`(변경 금지) · `../../docs/decisions/019-workstream-layer.md` · `../../docs/UD-Engine-TechSpec-v1.0.md` §3·§7
2. `prisma/schema.prisma` — **컨벤션 정독**: `@id @default(cuid())`, `@@index`, `onDelete: Cascade`, 한글 주석 섹션 헤더(`// ───`). 신규 모델은 이 컨벤션 그대로.
3. `model Project`(L247~) · `model ContentAsset`(L528~) · `model WinningProposalChunk`(L1370~)

## 🎯 Scope
### CAN touch
- `prisma/schema.prisma` (신규 모델 추가 + Project 관계 추가 + 지정 nullable 필드 추가)
- `src/lib/workstream/types.ts` (신규 — WorkstreamType 타입 + 배점 매핑)
- `src/lib/workstream/ensure-default.ts` (신규 — 하위호환 어댑터)
- `prisma/migrations/**` (migrate 시 자동 생성분)
### MUST NOT touch
- 기존 모델의 **기존 필드**(타입/이름/제약 변경 금지). 신규 nullable 필드 **추가만**.
- `ContentAsset.sourceRef` 에 `@unique` 추가 **금지**(기존 중복 데이터로 마이그레이션 실패 위험 — DATA-2)
- `embedding Float[]` → vector 전환 **금지**(DATA-2)
- 다른 모든 코드 · 생성 엔진 · 라우트

## 🛠 Tasks

### Task 1 — 신규 모델 8개 (schema.prisma 끝에 `// [WORKSTREAM] 과업 레이어 (ADR-019)` 섹션 추가)
Tech Spec §3.1 그대로. 정확히:
- `Workstream` (id, projectId, project rel onDelete Cascade, type String, scoringCategory String, order Int, detail Json, budgetSliceKrw Int?, autoFillRatio Float @default(0), evidence Json?, createdAt, updatedAt, `@@index([projectId])`) + relations: assets `WorkstreamAsset[]`, keyPoints `KeyPoint[]`
- `WorkstreamAsset` (id, workstreamId, workstream rel Cascade, contentAssetId String?, winningChunkId String?, relevance Float, `@@index([workstreamId])`)
- `WinTheme` (id, projectId, project rel Cascade, discriminator String, benefit String, quantified String?, proof Json, hotButton String?, rank Int, `@@index([projectId])`)
- `KeyPoint` (id, workstreamId, workstream rel Cascade, winThemeId String?, text String, proof Json, `@@index([workstreamId])`)
- `ComplianceItem` (id, projectId, project rel Cascade, requirement String, scoringWeight Int?, mappedSection String?, coverage String, `@@index([projectId])`)
- `RubricScore` (id, projectId, project rel Cascade, draftVersion Int, lines Json, overall Float, weakest Json, panelScores Json?, model String, createdAt, `@@index([projectId, draftVersion])`)
- `ProposalOutcome` (id, projectId @unique, project rel Cascade, result String, reason String?, awardScore Float?, submittedAt DateTime?, decidedAt DateTime?)
- `EditDiff` (id, projectId, sectionKey String, aiText String, shippedText String, diffKind String?, createdAt, `@@index([projectId])`)
> Json 필드 형태는 주석으로 명시(예: `// ProofRef[] {kind,assetId?,winningChunkId?,sroi?,text}`). 빈 proof = 앱 레벨 검증(여기선 스키마만).

### Task 2 — Project 관계 추가
`model Project` 에 역관계 추가(필드만): `workstreams Workstream[]`, `winThemes WinTheme[]`, `complianceItems ComplianceItem[]`, `rubricScores RubricScore[]`, `outcome ProposalOutcome?`, `editDiffs EditDiff[]`. 기존 필드 미변경.

### Task 3 — 기존 모델 nullable 필드 추가 (additive, 안전)
- `ContentAsset` 에 추가: `contextBlurb String?` · `lastVerifiedAt DateTime?` · `decayRate String?` · `workstreamType String?` (Contextual RAG·신선도·과업 태깅용. Tech Spec §3.2). **embedding·sourceRef 미변경.**
- `WinningProposalChunk` 에 추가: `contextBlurb String?` · `workstreamType String?`.

### Task 4 — `src/lib/workstream/types.ts`
```ts
export const WORKSTREAM_TYPES = ['education','event_ops','venue','speaker','recruiting','screening','networking','mentoring','deliverable'] as const
export type WorkstreamType = typeof WORKSTREAM_TYPES[number]
// 각 유형 → RFP 배점 카테고리 (ADR-006 제1원칙 · Tech Spec §7.1)
export const WORKSTREAM_SCORING: Record<WorkstreamType, string> = {
  education:'수행역량', mentoring:'수행역량(4중 지원)', event_ops:'운영역량·집객 실적',
  venue:'운영역량', speaker:'차별화', recruiting:'모집 전략', screening:'심사·선정 설계',
  networking:'차별화(파트너·동문)', deliverable:'수행능력(산출물)',
}
```
(값은 glossary §2·Tech Spec §7.1 과 일치시킬 것. 불일치 발견 시 보고.)

### Task 5 — migration
- `npx prisma validate` → `npx prisma generate` (DB 불필요. 스키마·클라이언트 검증).
- DB 기동돼 있으면(`localhost:5432` 접속 가능): `npx prisma migrate dev --name add_workstream_layer` 로 마이그레이션 생성·적용.
- **DB 미기동이면**: migrate 시도하지 말고, `prisma validate`+`generate` 통과만 확인 후 보고에 "migration 파일 미생성 — DB 기동 후 `prisma migrate dev --name add_workstream_layer` 필요" 명시. (DB 못 켜는 건 STOP 사유 아님.)

### Task 6 — 하위호환 어댑터 `src/lib/workstream/ensure-default.ts`
함수 `ensureDefaultWorkstream(projectId: string): Promise<void>` — 해당 Project 에 Workstream 이 0개면, 기존 데이터(있으면 CurriculumItem 존재 여부 등)를 보고 **'education' 과업 1개**를 `order:0, type:'education', scoringCategory: WORKSTREAM_SCORING.education, detail:{}, autoFillRatio:0` 으로 생성. 이미 있으면 no-op. (Prisma client 사용. 순수 추가 로직 — 기존 데이터 변경 없음.)

## 🔒 Tech Constraints
- Prisma 7 컨벤션 그대로(cuid·@@index·Cascade). Next.js 16. TypeScript strict.
- 신규 모델은 전부 additive. 기존 필드/제약 불변.

## ✔️ Definition of Done
- [ ] 8 신규 모델 + Project 6 역관계 + ContentAsset 4필드 + WinningProposalChunk 2필드 (전부 additive)
- [ ] `src/lib/workstream/types.ts` · `ensure-default.ts` 생성
- [ ] `npx prisma validate` 통과 · `npx prisma generate` 성공
- [ ] `npm run typecheck` 통과 (생성된 Prisma client 타입 반영)
- [ ] `npm run lint` · `npm run check:manifest` 통과
- [ ] migration: DB 기동 시 적용, 미기동 시 명령 문서화
- [ ] `git diff --name-only` ⊆ CAN-touch

## 📤 Return Format
```
## ✅ 한 일 (모델·필드·파일별)
## ❌ 못한 일 / 보류 (migration DB 상태 명시)
## 🤔 결정한 것 (스키마 판단·glossary 불일치 등)
## 🔬 검증 (prisma validate/generate·typecheck·lint·manifest 결과 그대로 + 모델 수 before/after)
## ⚠️ 위험 신호 / 다음 진입점 (DATA-2 pgvector·sourceRef unique 등)
```

## 🚫 Do NOT
- 기존 필드 변경 · sourceRef @unique · embedding 타입 변경 · pgvector (DATA-2)
- DB 못 켜진다고 STOP (validate+generate 로 갈음) · prisma migrate 강행으로 기존 데이터 위험
- git commit/push · 다른 트랙 파일 · 추측 진행

## 💡 Hints
- 메인이 docs 동시 작업 가능 — **코드/prisma만, `.md` 금지, git write 명령 금지**(prisma/npm/edit만).
- 모델 수: 현 42 → +8 = 50. 보고에 before/after 카운트(`grep -c "^model " prisma/schema.prisma`).
- Json 필드는 Prisma `Json` 타입. 앱 레벨 Zod 검증은 후속(EX 브리프).
- `ProposalOutcome.projectId @unique` — 1:1 관계라 Project 쪽은 `outcome ProposalOutcome?`.

## 🏁 Final Note
부수 발견(pgvector 필요성·중복 sourceRef 등)은 삭제·변경 말고 "다음 진입점"에 보고만. DATA-2 후보로.
