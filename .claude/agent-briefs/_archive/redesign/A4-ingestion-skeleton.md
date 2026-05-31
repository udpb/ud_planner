# A4 Brief: Ingestion 스키마 + `/ingest` UI 뼈대

## 🎯 Mission (1 sentence)
`IngestionJob` + `ExtractedItem` Prisma 모델을 추가하고, `/ingest` 페이지에 자료 종류 선택 + 파일 업로드 UI를 만든다. 처리는 하지 않음 — 파일만 저장하고 `status: "queued"` 로 레코드 생성.

## 📋 Context

**왜 이 작업이 필요한가.** Ingestion 파이프라인은 재설계의 정체성 모듈(ADR-003). 하지만 실제 추출·AI 파이프라인은 Phase D에서 가동. Phase A에서는 **스키마와 UI 뼈대만** 깔아놓음 → 사용자가 언제든 자료를 드롭할 수 있는 경로 개방.

**핵심 제약.** 이 작업은 실제 AI 추출을 구현하지 않는다. 업로드된 파일은 `status: "queued"` 상태로 쌓이고, Phase D 워커가 나중에 처리. UI에서 "처리 대기 중" 표시만.

**Next.js 16 주의:** 파일 업로드는 Server Action 또는 API Route. `formData` 처리 방식이 변경될 수 있으니 `node_modules/next/dist/docs/` 에서 현재 권장 패턴 확인.

## ✅ Prerequisites
1. 작업 디렉토리: `c:\Users\USER\projects\ud-ops-workspace`
2. PostgreSQL 실행 중, `npx prisma migrate dev` 가능
3. `npm run build` 현재 통과
4. shadcn/ui 컴포넌트 (Card, Button, Input, Select, RadioGroup 등) 존재
5. NextAuth 세팅 완료

실패 시 STOP.

## 📖 Read These Files First

1. `CLAUDE.md`, `AGENTS.md`
2. **`docs/architecture/ingestion.md` — 이 작업의 사양서 (가장 중요)**
3. **`docs/decisions/003-ingestion-pipeline.md` — 왜 이 설계인지**
4. `prisma/schema.prisma` 전체 — 기존 모델 패턴 (특히 CoachingJournal, SatisfactionLog 등 파일 업로드 연관 모델이 있는지)
5. `src/app/(dashboard)/layout.tsx` — 대시보드 레이아웃 구조
6. `src/components/ui/` — 사용 가능한 shadcn 컴포넌트 목록
7. `src/lib/prisma.ts` — prisma client
8. 기존 `/api/coaches` 또는 `/api/ai/parse-rfp` 라우트 — 파일 업로드 처리 패턴이 있다면 참고

## 🎯 Scope

### ✅ You CAN touch
- `prisma/schema.prisma` — `IngestionJob`, `ExtractedItem` 모델 **추가만** (기존 모델 수정 금지)
- `prisma/migrations/` — 자동 생성
- `src/app/(dashboard)/ingest/page.tsx` (신규)
- `src/app/(dashboard)/ingest/_components/*.tsx` (신규)
- `src/app/api/ingest/route.ts` (신규) — POST 업로드 핸들러
- `src/app/api/ingest/[id]/route.ts` (신규, 옵션) — 상태 조회
- `src/lib/ingestion/` (신규 폴더) — 타입 + 헬퍼

### ❌ You MUST NOT touch
- `src/lib/pipeline-context.ts` — A2 영역
- `src/components/layout/sidebar.tsx` — A5가 ingest 링크 추가함
- `src/app/(dashboard)/projects/[id]/*.tsx` — Wave 2
- 기존 Prisma 모델 수정 — 추가만 가능
- `src/lib/planning-agent/*`
- `package.json` — 의존성 추가 금지 (파일 저장은 로컬 파일시스템 또는 기존 업로드 경로 활용)

## 🛠 Tasks

### Step 1: Prisma 스키마 추가

`prisma/schema.prisma` 파일 **끝에** 다음 모델 추가:

```prisma
model IngestionJob {
  id           String    @id @default(cuid())
  kind         String    // "proposal" | "curriculum" | "evaluator_question" | "strategy_interview"
  sourceFile   String?   // blob 경로 또는 로컬 경로
  sourceUrl    String?
  metadata     Json      // 사업명·발주처·수주여부·인터뷰 대상 등
  status       String    @default("queued")  // "queued" | "processing" | "review" | "approved" | "rejected" | "failed"
  uploadedBy   String
  uploadedAt   DateTime  @default(now())
  processedAt  DateTime?
  approvedAt   DateTime?
  approvedBy   String?
  error        String?

  extractedItems ExtractedItem[]

  @@index([kind, status])
  @@index([uploadedBy])
}

model ExtractedItem {
  id           String    @id @default(cuid())
  jobId        String
  job          IngestionJob @relation(fields: [jobId], references: [id], onDelete: Cascade)
  targetAsset  String    // "winning_pattern" | "curriculum_archetype" | "evaluator_question" | "strategy_note"
  payload      Json      // 자산 후보 필드
  confidence   Float     @default(0)
  status       String    @default("pending")  // "pending" | "approved" | "rejected" | "edited"
  reviewNotes  String?
  appliedAt    DateTime?
  appliedId    String?   // 자산 테이블에 삽입된 레코드 ID

  @@index([jobId])
  @@index([targetAsset, status])
}
```

**ingestion.md §2 의 스키마와 일치 확인.**

### Step 2: 마이그레이션

```bash
npx prisma migrate dev --name "add_ingestion_skeleton"
npx prisma generate
```

마이그레이션 파일명은 `add_ingestion_skeleton` 로. 생성된 migration 파일은 커밋 대상.

### Step 3: 파일 저장 경로 결정

현재 프로젝트에 파일 저장 인프라가 있는지 확인:
- Vercel Blob, S3, 로컬 `public/uploads/` 등
- 없으면 **로컬 파일시스템 `./storage/ingest/<jobId>/<filename>`** 임시 사용 (Vercel 배포 시 교체 필요 — 해당 부분은 TODO 주석으로 표시)
- `.gitignore` 에 `storage/` 추가

결정한 방식을 Return Format에 명시.

### Step 4: 타입 + 헬퍼

`src/lib/ingestion/types.ts` — `IngestionKind`, `ExtractedItemStatus`, 업로드 입력 DTO 등
`src/lib/ingestion/save-file.ts` — 파일 저장 헬퍼 (결정된 저장 방식에 맞게)

### Step 5: POST API 라우트

`src/app/api/ingest/route.ts`:
- NextAuth 인증 체크
- `multipart/form-data` 처리 (FormData 파싱)
- 필드: `kind`, `file` (optional), `sourceUrl` (optional), `metadata` (JSON 문자열)
- 파일 저장 → `sourceFile` 경로 획득
- `IngestionJob` 레코드 생성 (`status: "queued"`, `uploadedBy: session.user.id`)
- `{ jobId, status }` 반환

**처리 로직 없음.** AI 호출·추출 없음. 그냥 레코드 생성으로 끝.

### Step 6: `/ingest` 페이지

`src/app/(dashboard)/ingest/page.tsx`:

**좌측 컬럼 (업로드 폼):**
- 자료 종류 선택 (RadioGroup: 제안서 / 커리큘럼 / 심사위원 질문 / 전략 인터뷰)
- 메타 필드 (종류에 따라 동적)
  - 제안서: 사업명 (필수), 발주처, 수주여부(bool), 총점 (옵션)
  - 커리큘럼: 사업명, 대상자, 총 회차
  - 심사위원 질문: 사업명, 발표일자
  - 전략 인터뷰: 대상자, 날짜
- 파일 업로드 (PDF / DOCX / XLSX / TXT 허용) 또는 URL
- 제출 버튼

**우측 컬럼 (최근 업로드 목록):**
- 최신 10건 `IngestionJob` 표시
- 각 행: 종류, 사업명, 업로드 시각, 상태 배지 (queued=회색 / processing=파랑 / review=노랑 / approved=초록 / rejected=빨강 / failed=빨강)
- Phase D까지는 queued 에서 변화 없음 → "처리 대기 중 (Phase D에서 가동)" 안내 띄우기

### Step 7: 사이드바 링크 고려

사이드바 자체는 A5가 작업 중. A4는 사이드바 수정 금지. **대신** `/ingest` 페이지가 동작하도록 라우트만 확실히 구현. 사이드바에 링크 추가는 A5 에이전트가 할 일.

### Step 8: 검증

```bash
npm run build
```

빌드 통과 + 개발 서버에서 `/ingest` 접근 → 업로드 폼 렌더링 확인 (런타임 테스트는 optional).

## 🔒 Tech Constraints

- **Prisma 마이그레이션:** `add_ingestion_skeleton` 이름 고정
- **Next.js 16 App Router** — Server Action 또는 API Route 선택. 현재 프로젝트 기존 패턴을 따름 (API Route + FormData 권장)
- **shadcn/ui 재사용** — 새 UI 컴포넌트 만들지 말 것
- **의존성 추가 금지**
- **파일 저장:** 로컬 `./storage/` 사용 시 `.gitignore` 업데이트 필수

## ✔️ Definition of Done

- [ ] `IngestionJob`, `ExtractedItem` 모델 추가됨 (ingestion.md §2 와 일치)
- [ ] 마이그레이션 `add_ingestion_skeleton` 적용됨
- [ ] `prisma generate` 후 타입 사용 가능
- [ ] `/api/ingest` POST 동작 (파일 저장 + 레코드 생성)
- [ ] `/ingest` 페이지 렌더링 (좌: 폼, 우: 최근 10건)
- [ ] 사이드바는 건드리지 않음
- [ ] 기존 모델·API 건드리지 않음 (git diff로 확인)
- [ ] `npm run build` 통과
- [ ] `.gitignore` 에 `storage/` 추가 (로컬 경로 사용한 경우)

## 📤 Return Format

```
A4 Ingestion 뼈대 완료.

스키마 변경:
- IngestionJob 모델 추가
- ExtractedItem 모델 추가
- 마이그레이션: add_ingestion_skeleton

생성 파일:
- src/app/(dashboard)/ingest/page.tsx
- src/app/(dashboard)/ingest/_components/*.tsx (N개)
- src/app/api/ingest/route.ts
- src/lib/ingestion/types.ts
- src/lib/ingestion/save-file.ts

파일 저장 방식: [로컬 ./storage/ingest/ | Vercel Blob | 기타]
(Vercel 배포 시 교체 필요 여부: [yes/no])

UI 구조:
- 자료 종류 4개: 제안서 / 커리큘럼 / 심사위원 질문 / 전략 인터뷰
- 종류별 동적 메타 필드
- 최근 10건 목록

검증:
- npm run build: ✅
- /ingest 페이지 로드: [확인 여부]

주의사항:
- [Vercel 배포 시 storage 교체 필요 등]
- [발견된 이슈]

Phase D 후속 작업:
- Ingestion 워커 (AI 추출)
- /ingest/review Admin 승인 UI
- WinningPattern 등 자산 테이블 연결
```

## 🚫 Do NOT

- 기존 Prisma 모델 수정 금지
- AI 호출 / 파일 파싱 / 추출 로직 구현 금지 (Phase D)
- 사이드바 수정 금지 (A5 영역)
- 새 의존성 추가 금지
- Admin 검토 UI (`/ingest/review`) 구현 금지 (Phase D)
- 임베딩 / 벡터 DB 건드리지 말 것 (Phase D 이후)

## 💡 Hints

- PDF 파일 파싱을 위한 라이브러리(unpdf 등)는 이번 브리프에서 설치/사용 금지. 그냥 파일만 저장
- `metadata` Json 필드 스키마는 유연하게 (다음 Phase에서 어떤 필드가 중요해질지 알 수 없음)
- `.gitignore` 업데이트 시 기존 라인과 겹치지 않게 append
- 업로드 폼은 `<form>` + Server Action 또는 FormData POST 중 하나 선택. 기존 프로젝트 패턴을 보고 결정
- 파일이 없어도 URL로만 업로드 가능 (전략 인터뷰는 녹취 URL일 수 있음)

## 🏁 Final Note

이 작업은 **시스템 정체성 모듈의 첫 삽**. 뼈대는 작지만 깔아놓으면 사용자가 자료를 쌓기 시작할 수 있음. 과도한 기능 추가 유혹을 참고, 정확히 "스키마 + 업로드 UI + 레코드 생성" 까지만. 파싱·AI는 Phase D.
