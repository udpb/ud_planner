# D0 Brief: Phase D Schema — WinningPattern · ChannelPreset · ExtractedItem 확장

## 🎯 Mission

`WinningPattern` 모델과 `ChannelPreset` 모델을 Prisma 스키마에 추가하고, Phase A 의 `ExtractedItem` 에 타겟 asset 타입 가드용 컬럼 몇 개 추가. 마이그레이션 1건.

## 📋 Context

**D1 (proposal-ingest)·D2 (ChannelPreset)·D3 (pm-guide) 전부가 이 스키마에 의존.** Phase B B0 선결 패턴 재사용.

**schema 변경은 deny 가드 있음.** 실행 전 `.claude/settings.local.json` 에서 해제 필요.

## ✅ Prerequisites

1. Phase C 완료 (Wave 1 · Wave 2)
2. `npm run build` 통과
3. `.claude/settings.local.json` deny 해제 (메인이 선행)

## 📖 Read

1. `docs/architecture/data-contract.md`
2. `docs/architecture/ingestion.md` §2 (IngestionJob/ExtractedItem)
3. `docs/decisions/003-ingestion-pipeline.md`
4. `docs/decisions/005-guidebook-system-separation.md` §"정보 흐름 규칙"
5. `prisma/schema.prisma` 전체 (기존 모델 패턴)

## 🎯 Scope

### ✅ CAN
- `prisma/schema.prisma` — WinningPattern · ChannelPreset 모델 추가, ExtractedItem 에 필드 추가만
- `prisma/migrations/` 자동 생성

### ❌ MUST NOT
- 기존 모델 수정
- Phase A 의 IngestionJob 스키마 자체 변경
- API / UI / lib 건드리지 말 것

## 🛠 Tasks

### Step 1: WinningPattern 모델 추가

```prisma
model WinningPattern {
  id              String   @id @default(cuid())
  // 출처
  sourceProject   String   // 사업명 (예: "2025 종로구 서촌 로컬브랜드")
  sourceClient    String?  // 발주처
  ingestionJobId  String?  // 어느 IngestionJob 에서 왔는지
  extractedItemId String?  // 어느 ExtractedItem 에서 승인되었는지

  // 분류
  sectionKey      String   // ProposalSectionKey 값 (proposal-background/curriculum/...)
  channelType     String?  // B2G | B2B | renewal
  outcome         String   // "won" | "lost" | "pending" — 반면교사도 저장
  techEvalScore   Float?   // 기술평가 점수 (있으면)

  // 내용
  snippet         String   @db.Text  // 섹션의 핵심 원문 스니펫
  whyItWorks      String   @db.Text  // 왜 먹혔는지 (추측+근거 명시)
  tags            String[] // ["청년창업", "정량KPI", ...]

  // 메타
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  approvedBy      String?  // userId
  embedding       Json?    // pgvector 전환 전까지는 Json

  @@index([sectionKey, channelType, outcome])
  @@index([sourceProject])
}
```

### Step 2: ChannelPreset 모델 추가

```prisma
model ChannelPreset {
  id                String   @id @default(cuid())
  code              String   @unique  // "B2G" | "B2B" | "renewal" (추후 확장)
  displayName       String   // "정부·공공기관"
  description       String   @db.Text

  // 톤·메시지
  keyMessages       Json     // string[]
  avoidMessages     Json     // string[] — 이 타입에서 피해야 할 표현
  tone              String   @db.Text
  evaluatorProfile  String   @db.Text

  // 커리큘럼 가이드
  theoryMaxRatio    Float?   // 이론 비율 상한 (B2G 0.3)
  actionWeekMinCount Int?    // Action Week 최소 횟수

  // 예산
  budgetTone        String   @db.Text
  directCostMinRatio Float?  // 직접비 최소 비율

  // 제안서 구조
  proposalStructure String   @db.Text

  // 메타
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  source            String   @default("seed")  // "seed" | "strategy_interview"
}
```

### Step 3: ExtractedItem 에 타겟 asset 필드 추가

```prisma
// 기존 ExtractedItem 에 추가만 (기존 필드 보존)
model ExtractedItem {
  // ... 기존 필드 전체 유지 ...
  appliedWinningPatternId String?  // 승인 후 생성된 WinningPattern.id (hanji 것이 여기로)
  appliedChannelPresetId  String?  // ChannelPreset 업데이트 소스라면
}
```

### Step 4: 마이그레이션

```bash
npx prisma migrate dev --name "add_phase_d_assets"
npx prisma generate
```

### Step 5: 검증

```bash
npm run typecheck
npm run build
```

## ✔️ Definition of Done

- [ ] WinningPattern 모델 추가 (필드·인덱스 완전)
- [ ] ChannelPreset 모델 추가
- [ ] ExtractedItem 에 appliedWinningPatternId · appliedChannelPresetId 추가
- [ ] 기존 모델 변경 없음 (git diff 확인)
- [ ] 마이그레이션 `add_phase_d_assets` 적용
- [ ] typecheck · build 통과

## 📤 Return Format

- 마이그레이션 SQL 요약
- 기존 모델 무수정 확인
- 후속: D1·D2 브리프가 이 스키마 소비 가능

## 🚫 Do NOT

- 시드 스크립트 작성 ❌ (D2 에서 별도)
- API / UI 구현 ❌
- 기존 IngestionJob · ExtractedItem 핵심 필드 수정 ❌
- 새 의존성 ❌

## 🏁 Final

Phase D 의 기반. 이게 틀어지면 D1~D3 전부 재작업.
