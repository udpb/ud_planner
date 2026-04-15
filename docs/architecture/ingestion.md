# Ingestion 파이프라인 — 자료 업로드 → 자산 자동 고도화

> **핵심 약속:** PM이 자료를 드롭만 하면, 다음 기획부터 그 자료의 노하우가 자동 주입된다. 별도 엔지니어링 없이.

## 0. 왜 이게 가장 중요한가

새 시스템은 **쌓일수록 강해지는 구조**가 목표다. 기능은 완벽하지 않아도 된다. 대신:
- 수주 제안서 1개 업로드 = 다음 기획 시 그 제안서의 당선 패턴이 자동으로 참조됨
- 심사위원 질문 메모 1개 업로드 = 다음 제안서 생성 시 그 유형 질문에 대한 방어 포인트가 들어감
- 과거 커리큘럼 엑셀 1개 업로드 = 다음 커리큘럼 설계 시 레퍼런스로 뜸

**이 파이프라인이 약하면 시스템 전체가 "또 다른 SaaS"에 불과.** 이 파이프라인이 강하면 언더독스의 지속 자산이 된다.

## 1. 전체 아키텍처

```
[PM]
  │ 자료 드롭 (PDF/DOCX/XLSX/TXT/URL)
  ▼
┌──────────────────────────────────────────┐
│  /ingest UI (단일 진입점)                 │
│  - 자료 종류 선택 (제안서 / 커리큘럼 /    │
│    심사위원질문 / 전략인터뷰)              │
│  - 메타 입력 (사업명·수주여부·발주처 등)   │
└──────────────────────────────────────────┘
  │ POST /api/ingest
  ▼
┌──────────────────────────────────────────┐
│  IngestionJob 레코드 생성 (status=queued) │
│  원본 파일 저장 (blob storage)             │
└──────────────────────────────────────────┘
  │ 비동기 큐
  ▼
┌──────────────────────────────────────────┐
│  Ingestion Worker (자료 종류별 모듈)      │
│                                           │
│  [proposal-ingest]                        │
│    PDF → 텍스트 → 섹션 분할 → AI 패턴추출  │
│    → WinningPattern 후보 생성              │
│                                           │
│  [curriculum-ingest]                      │
│    XLSX → 세션 파싱 → AI 아키타입 분류     │
│    → CurriculumArchetype 후보 생성         │
│                                           │
│  [evaluator-question-ingest]              │
│    TXT/DOCX → AI 질문 추출 → 유형 태깅    │
│    → EvaluatorQuestion 후보 생성           │
│                                           │
│  [strategy-interview-ingest]              │
│    인터뷰 녹취 → StrategyNote              │
│    → ChannelPreset 업데이트 제안           │
└──────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────┐
│  검토 대기 (ReviewQueue)                  │
│  Admin/PM이 확인 → 승인 → 자산 반영        │
└──────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────┐
│  Asset Tables (WinningPattern 등)         │
│  + 임베딩 생성 → 검색 인덱스 업데이트       │
└──────────────────────────────────────────┘
  │
  ▼
다음 기획 시 CORE 모듈이 자동 로드
```

## 2. 공통 데이터 모델

```prisma
model IngestionJob {
  id           String   @id @default(cuid())
  kind         String   // "proposal" | "curriculum" | "evaluator_question" | "strategy_interview"
  sourceFile   String?  // blob URL
  sourceUrl    String?
  metadata     Json     // 사업명·발주처·수주여부·인터뷰 대상 등
  status       String   // "queued" | "processing" | "review" | "approved" | "rejected" | "failed"
  uploadedBy   String
  uploadedAt   DateTime @default(now())
  processedAt  DateTime?
  approvedAt   DateTime?
  approvedBy   String?
  error        String?

  extractedItems  ExtractedItem[]
}

model ExtractedItem {
  id           String   @id @default(cuid())
  jobId        String
  job          IngestionJob @relation(fields: [jobId], references: [id])
  targetAsset  String   // "winning_pattern" | "curriculum_archetype" | ...
  payload      Json     // 자산 레코드의 후보 필드
  confidence   Float    // AI 추출 신뢰도 0~1
  status       String   // "pending" | "approved" | "rejected" | "edited"
  reviewNotes  String?
  appliedAt    DateTime?
  appliedId    String?  // 실제 자산 테이블에 삽입된 레코드 ID
}
```

## 3. 모듈별 상세

### 3.1 proposal-ingest (가장 중요)

**입력:** 수주 제안서 PDF/DOCX + 메타(사업명, 발주처, 수주여부, 총점)
**출력:** `WinningPattern[]` (섹션별)

**처리 흐름:**
1. PDF → 텍스트 (`unpdf` 활용, Vercel 서버리스 호환)
2. 섹션 자동 분할 (AI + 목차 휴리스틱) — 7개 표준 섹션에 매핑
3. 섹션별 AI 분석:
   - `snippet`: 핵심 문장/문단 추출
   - `whyItWorks`: 왜 먹혔다고 보는지 (수주 여부 + 발주처 타입과 대조)
   - `tags`: ["B2G", "청년창업", "정량KPI", ...]
4. `ExtractedItem` 후보 생성 → review 큐
5. Admin 승인 시 `WinningPattern` 삽입 + 임베딩 생성

**품질 보정:**
- 수주 제안서 → `whyItWorks`는 "추측 + 근거"로 명시 (추측임을 숨기지 않음)
- 탈락 제안서도 업로드 가능 → `WinningPattern.outcome = "lost"`로 저장 → 반면교사 참조용
- 같은 사업 반복 업로드 시 중복 감지 (해시 + 사업명)

### 3.2 curriculum-ingest

**입력:** 과거 커리큘럼 XLSX/시트 URL
**출력:** `CurriculumArchetype`

**처리 흐름:**
1. 시트 파싱 → 세션 배열
2. AI 아키타입 분류 — 트랙 구성·이론/실습 비율·Action Week 배치 패턴 추출
3. `targetStage`, `durationWeeks`, `sessionCount` 메타 자동 추출
4. 유사 아키타입 이미 있으면 병합 제안 (중복 방지)

### 3.3 evaluator-question-ingest

**입력:** 발표/심사 현장 질문 메모 or 녹취 텍스트 + 메타(사업명)
**출력:** `EvaluatorQuestion[]`

**처리 흐름:**
1. 텍스트 → 질문 단위 분할
2. 각 질문 AI 분류:
   - `questionType`: "실행가능성" | "차별성" | "예산타당성" | "수료율보장" | ...
   - `defensiveAngle`: 이 질문에 대한 모범 답변 앵글
   - `linkedSection`: 제안서 어느 섹션에서 이걸 선제 방어할 수 있는지
3. 승인 시 `EvaluatorQuestion` 저장 → pm-guide 모듈이 각 스텝에서 자동 참조

### 3.4 strategy-interview-ingest

**입력:** 수주 팀장/PM 인터뷰 녹취 or 메모
**출력:** `StrategyNote` + `ChannelPreset` 업데이트 제안

**처리 흐름:**
1. 인터뷰 텍스트 → AI 구조화 (whyUs·clientHiddenWants·mustNotFail 등 StrategySlice 필드)
2. 동일 발주처 타입 반복 등장 시 `ChannelPreset` 업데이트 제안
3. 개별 `StrategyNote`는 `past-projects` 자산에 연결

## 4. 검토 큐 UX

- `/ingest/review` — Admin 전용 페이지
- 각 ExtractedItem 카드:
  - 원본 스니펫 + AI 추출 결과 diff 뷰
  - [승인 그대로] [편집 후 승인] [거부]
  - 편집 시 편집 사유 기록 → AI 추출 품질 개선 데이터
- 승인 즉시 자산 테이블 반영 + 임베딩 재생성

## 5. 재처리·롤백

- `IngestionJob` 은 불변 원본 보존
- 추출 로직 개선 후 `재처리` 버튼 → 같은 원본으로 새 `ExtractedItem` 생성
- 자산 반영 후에도 `appliedId`로 추적 → 특정 자료의 영향 롤백 가능

## 6. 신규 자료 종류 추가 프로토콜

1. `src/modules/<kind>-ingest/` 신규 모듈 (manifest 포함)
2. `IngestionJob.kind` 에 새 값 추가 (enum 대신 문자열 — 확장성)
3. Worker 라우팅에 처리 함수 등록
4. `/ingest` UI에 선택지 추가
5. ADR 작성

## 7. 현재 없음 / 나중에

- 실시간 스트리밍 처리 ❌ — 배치로 충분
- 다국어 ❌ — 한국어 우선
- 자동 재처리 스케줄러 ❌ — 수동 트리거
- Vector DB는 기존 pgvector 활용 가정 (별도 인프라 안 추가)

## 8. Phase 배치

- **Phase A 초기:** `IngestionJob` 스키마 + 업로드 UI 뼈대 (처리 없음)
- **Phase D와 병행:** `proposal-ingest` — PM 가이드가 이 자산을 쓰므로 같이 가야 함
- **Phase E 이후:** `curriculum-ingest`, `evaluator-question-ingest`
- **Phase F 이후:** `strategy-interview-ingest` + 재처리 UI

---

**연관 문서:** [modules.md](./modules.md), [data-contract.md](./data-contract.md), [quality-gates.md](./quality-gates.md)
