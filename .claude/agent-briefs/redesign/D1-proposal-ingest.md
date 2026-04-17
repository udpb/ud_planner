# D1 Brief: proposal-ingest — 수주 제안서 PDF → WinningPattern 자동 추출

## 🎯 Mission

Phase A 의 `/api/ingest` 에 업로드된 `kind: "proposal"` 자료를 비동기로 처리하여 `WinningPattern` 후보를 생성하는 워커 + Admin 승인 UI (`/ingest/review`) 를 구현한다. 승인 시 `WinningPattern` 테이블에 반영 + 임베딩(pgvector 전환 전까지는 JSON) 생성.

## 📋 Context

**이게 "쌓일수록 강해지는 시스템"** (ADR-003) 의 첫 구현. 지금까지 Phase A/B/C 는 **기능** 만 만들었고, Phase D1 부터 **축적 경로** 가 열림.

**원본 후보 (메인 세션이 사전 확보):**
- NH 애그테크 · GS리테일 · 코오롱 프로보노 (언더독스 기존 수주)
- 2025 종로구 서촌 로컬브랜드 (PDF 확보)
- 2025 관광공모전 + 관광기념품 박람회 (PDF 확보)
- 2025 한지문화상품 디자인 공모전 (PDF 확보)
- 2025 안성문화장 글로컬 특화사업 (PDF 확보)

**모든 원본 PDF 는 Ingestion UI (`/ingest`) 로 업로드** → 이 워커가 처리 → Admin 승인 → WinningPattern 자산화. **가이드북 요약문을 시드로 쓰는 것은 금지** (ADR-003).

## ✅ Prerequisites

1. D0 완료 (WinningPattern 스키마 · ExtractedItem 확장)
2. Phase A A4 `/api/ingest` 정상 동작
3. `unpdf` 패키지 설치됨 (기존 project 에서 사용 중)
4. Claude API 키 설정됨

## 📖 Read

1. `docs/architecture/ingestion.md` §3.1 proposal-ingest (알고리즘)
2. `docs/architecture/quality-gates.md` §1 Gate 3 (당선 패턴 대조)
3. `docs/decisions/003-ingestion-pipeline.md` — 원본 불변·승인 필수
4. `docs/decisions/005-guidebook-system-separation.md` §"정보 흐름"
5. Phase A A4 산출물: `src/app/api/ingest/route.ts` · `src/app/(dashboard)/ingest/page.tsx`
6. `src/lib/proposal-ai.ts` (C3) — Claude 호출 패턴 재사용
7. `src/lib/pipeline-context.ts` §ProposalSectionKey
8. `src/lib/ud-brand.ts`

## 🎯 Scope

### ✅ CAN
- `src/lib/ingestion/workers/proposal-ingest.ts` (신규)
- `src/lib/ingestion/pdf-section-splitter.ts` (신규)
- `src/app/api/ingest/process/route.ts` (신규 — POST 로 특정 job 처리 트리거)
- `src/app/api/ingest/jobs/[id]/review/route.ts` (신규 — ExtractedItem 승인/거부)
- `src/app/(dashboard)/ingest/review/page.tsx` (신규)
- `src/app/(dashboard)/ingest/review/_components/*.tsx`
- `src/lib/winning-patterns.ts` (신규 — query helper)

### ❌ MUST NOT
- `src/lib/claude.ts` 수정
- `src/lib/proposal-ai.ts` (C3) 수정
- schema.prisma 수정 (D0 완료분 사용만)
- `src/app/api/ingest/route.ts` (A4) 수정 — 신규 파일만 추가
- 기존 pipeline-context.ts 수정
- 새 npm 패키지 설치

## 🛠 Tasks

### Step 1: PDF 섹션 분할기

`pdf-section-splitter.ts`:
- `unpdf` 로 텍스트 추출 (기존 A4 `save-file.ts` 패턴 재활용)
- **7개 표준 섹션 매핑 heuristic**:
  - "제안 배경", "목적", "사업 개요" → section 1
  - "추진 전략", "방법론", "차별화" → section 2
  - "커리큘럼", "교육 과정", "프로그램" → section 3
  - "조직", "인력", "코치" → section 4
  - "예산", "산출", "경제성" → section 5
  - "성과", "임팩트", "측정" → section 6
  - "실적", "포트폴리오", "레퍼런스" → section 7
- 매핑 안 되는 섹션은 `section: "other"` 로 기록
- 반환: `Array<{ sectionKey: ProposalSectionKey | "other", heading: string, body: string }>`

### Step 2: AI 패턴 추출

`proposal-ingest.ts` 의 `extractPatternsFromSection(section)`:

Claude 프롬프트:
```
[언더독스 제안서 분석]
이 제안서의 "{sectionKey}" 섹션에서 다음을 추출하세요:
1. 핵심 스니펫 (snippet): 이 섹션의 본질을 담은 1~3 문장 원문 인용 또는 정제 요약
2. whyItWorks: 왜 이 섹션이 수주에 기여했다고 보는지 (추측임을 명시)
3. tags: 발주처 타입·대상·방법론 키워드 배열 (예: ["B2G", "청년창업", "정량KPI"])

[출력 JSON]
{ "snippet": "...", "whyItWorks": "...", "tags": [...] }

[제안 섹션 원문]
{body}

[제안서 메타]
발주처: {client}
수주여부: {outcome}  (won / lost / pending)
총점: {techEvalScore}
```

- `safeParseJson` 패턴 복제 (claude.ts non-export)
- 재시도 1회

### Step 3: 워커 메인 플로우

`processIngestionJob(jobId)`:
1. `IngestionJob` 조회 (kind === "proposal" 확인)
2. `status` 를 "queued" → "processing"
3. `sourceFile` 에서 PDF 읽기 → `pdf-section-splitter`
4. 각 섹션별 `extractPatternsFromSection` 호출 (순차 or 작은 concurrency)
5. 섹션별로 `ExtractedItem` 생성 (`targetAsset: "winning_pattern"`, `payload: {snippet, whyItWorks, tags, sectionKey, ...}`, `confidence: 0.7`)
6. `status` 를 "review" 로
7. 실패 시 "failed" + error 기록

### Step 4: 트리거 API

`POST /api/ingest/process` (body: `{jobId}`):
- 인증 체크
- `processIngestionJob` 호출 (서버 측, await)
- 결과 요약 반환

**서버리스 제약 고려:** Vercel 의 경우 10초 제한 — 큰 PDF 는 쪼개서 여러 번 호출 필요. 일단 동기 호출로 구현, TODO 주석 달고 후속.

### Step 5: Admin 승인 UI

`/ingest/review` 페이지:
- 좌: `ExtractedItem` 목록 (status: "pending" 만, WinningPattern 타겟)
- 우: 선택한 아이템 상세 (원본 섹션 heading·snippet 미리보기 + AI 추출 payload + 편집 가능 form)
- 액션 3개:
  - **승인 그대로** → `WinningPattern` INSERT + `ExtractedItem.status = "approved"`
  - **편집 후 승인** → payload 편집 → INSERT + status = "edited"
  - **거부** → status = "rejected" + `reviewNotes`

### Step 6: 승인 API

`PATCH /api/ingest/jobs/[jobId]/review`:
- body: `{extractedItemId, action: "approve" | "edit" | "reject", payload?, notes?}`
- action 에 따라 `ExtractedItem` 상태 변경 + `WinningPattern` 레코드 생성 (approve/edit 시)
- 승인 시 `ExtractedItem.appliedWinningPatternId` 에 생성된 WinningPattern.id 저장 (D0 에서 추가)
- 인증 필수

### Step 7: WinningPattern Query helper

`src/lib/winning-patterns.ts`:
- `findWinningPatterns({ sectionKey?, channelType?, outcome?, tags?, limit? })` — 간단 where + orderBy
- Phase D3 pm-guide 가 사용 예정

### Step 8: 검증

```bash
npm run typecheck
npm run lint
npm run build
```

**런타임 테스트는 메인 세션이 나중에 수행** — 에이전트는 빌드 통과까지만.

## ✔️ Definition of Done

- [ ] PDF 섹션 분할 (heuristic) 구현
- [ ] AI 패턴 추출 (재시도 1회)
- [ ] `/api/ingest/process` POST
- [ ] `/ingest/review` UI (리스트 + 상세 + 편집)
- [ ] `PATCH /api/ingest/jobs/[id]/review`
- [ ] ExtractedItem.appliedWinningPatternId 연결
- [ ] `src/lib/winning-patterns.ts` export (findWinningPatterns)
- [ ] typecheck · lint · build 통과
- [ ] any 0 (신규 경로 error 유지)
- [ ] claude.ts · proposal-ai.ts 수정 없음

## 📤 Return Format

표준 포맷. 특히:
- 처리 속도 예상 (PDF 50p 기준 몇 초)
- Vercel 10s 제약 대응 메모
- 후속: D3 pm-guide 가 WinningPattern 소비

## 🚫 Do NOT

- 가이드북 요약문을 직접 WinningPattern 시드로 INSERT ❌ (원본 PDF 만)
- claude.ts · proposal-ai.ts 수정
- schema 수정
- Vercel Blob 등 새 저장소 연결 (Phase F)
- 자동 승인 (반드시 사람 검토)
- 거부된 ExtractedItem 재처리 자동화 (수동 트리거만)

## 💡 Hints

- `unpdf.extractText` 로 전체 텍스트 받고 **목차 기반 분할 + heading regex** 로 섹션 나누기. 목차 못 찾으면 heuristic keyword 우선.
- `sectionKey === "other"` 도 ExtractedItem 은 생성하되 Admin 이 수동으로 섹션 재분류할 수 있게.
- `confidence` 는 Claude 응답 길이 / 키워드 매칭 정도로 간단 heuristic.
- pgvector 없이 시작 — embedding 은 JSON 으로 (Claude 가 뽑은 요약 문자열만). Phase F 에서 전환.

## 🏁 Final

가이드북은 **분석 자료**, 이 워커는 **자산 생산기**. 두 개가 섞이면 ADR-003/005 위반. 원본 불변 보존·사람 승인 두 원칙 사수.
