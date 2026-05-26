# 2026-05-23 — Sphere 2 첫 ingest · 한국외대 검증 + Gemini quota 한계

## 오늘의 맥락
- **누구**: udpb@udimpact.ai + AI Architect
- **무엇**: PRD-v11.0 Wave W W1 구현 — Sphere 2 의 3-tuple 학습 인프라 + 첫 ingest 검증
- **시작 상태**: PRD-v11.0 채택 직후. 어떤 코드도 없음. Google Drive 통합 + 자료 학습부터.

## 흐름 (시간순)

### 1. 인프라 셋업 (A1~A4)
- A2: prisma schema 14 컬럼 추가 + migration `sphere2_3tuple` 성공
- A3: `src/lib/inference/` 7 파일 작성 — types · vector-utils · semantic-chunker · 3 extractor + 오케스트레이터 (~1440 줄)
- A4: API endpoint `POST /api/v1/inference/extract-tuple` (auth + rate limit + dryRun 지원)
- 3 commit on `feat/wave-w-w1` branch

### 2. Google Drive 회사 도메인 제한
- service account `ud-planner-sphere2-reader@ud-ops.iam.gserviceaccount.com` 만들었으나 UD Labs Workspace 외부 공유 제한.
- 해결책: 사용자가 xlsx 시트 + 33 PDF 를 manually export 해서 `C:/Users/USER/projects/archive/` 에 둠.
- 시트 영구 reference: `docs/reference/proposal-master-sheet.md` (33 컬럼 + 10 탭 + PDF URL 패턴 2개).

### 3. 첫 dry-run 검증 — A.25.0023 한국외대 학생창업캠프
**3 issue 발견·해결**:
1. `server-only` import 가 tsx 환경에서 throw → 5 파일에서 제거 (`prisma`·`invokeAi` 가 client bundle 에서 자연 fail 이라 이중 보호 X 결정)
2. Gemini 3.x **thinking 모드** 가 maxOutputTokens 일부 사용 → 잘림. maxTokens 4 곳 상향 (1024→8192 · 2048→12288 · 768→4096)
3. embedding 모델명 변경: `text-embedding-004` → `gemini-embedding-001` (3072 dim, deprecated 모델)

**최종 결과 (한국외대 dry-run)**:
- Message confidence **0.95** · slogan "연쇄 실행으로 임팩트를 만드는 '액트프러너' 육성, 1박 2일의 압축적 실전 교육으로 IR Deck 완성까지 이끄는 창업교육 3.0"
- Logic confidence **0.88** · 10 nodes · 10 edges · input→activity→output→outcome chain
- Content **24/24 chunks** (failed 0) · category 분포 정상 (methodology · content · human · data)
- **avoidedWords 4개** 추출 ("최선을 다하여" · "다양한 프로그램" · "유익한 시간" · "노력하겠습니다") — 반복 출력 방지 메커니즘 작동 검증
- Signature numbers 5개 (261명 · 2만개 · 1박2일 · 4Steps/6Dimension · 5단계)
- 287초 · $0.015

### 4. Batch ingest 33 PDF — 실패 (DB 0건)
- archive 폴더에 33 PDF 확인 (사용자가 17 → 33 으로 추가)
- 33 PDF × 26 LLM 호출 = **858 호출 시도 필요**
- Gemini 일일 quota **250건** 초과 → ~9 PDF 후 모두 quota error
- ANTHROPIC_API_KEY 미설정 → Claude fallback 도 fail
- 처음 ~9 PDF 도 transaction 안에서 chunk embedding 등 부분 실패 → 전체 rollback → DB 0건

## 내가 틀렸던 것

- **batch 비용 추정 부정확** — 24 chunk × 33 PDF 의 sequential 비용을 과소평가. content-extractor 가 chunk 마다 1 LLM 호출이라 빠르게 quota 소진.
- **dry-run 1건 + batch 33 = 34건 × 26호출 ≈ 884호출** 이 Gemini free tier 250 quota 의 3.5배. 사전 계산했으면 batch 시도 X 했을 것.
- **Claude fallback 확인 안 함** — ANTHROPIC_API_KEY 가 .env 에 없는 걸 batch 전에 확인했어야.
- **server-only 제거 결정** — 단기 ok 이지만 client component 가 실수로 inference 모듈 import 시 build error 안 남. 향후 protection 다시 추가 검토.

## 내가 맞았던 것 (검증)

- **PRD-v11.0 Chapter 4 의 3-tuple 학습 알고리즘** — 한국외대 사례에서 정확 작동.
- **avoidedWords 추출** — Sphere 2 의 진짜 가치 입증 (단어 매몰·반복 출력 방지의 핵심).
- **사용자 우려 RAG 4 한계** — 한 사례지만 명확히 해소 검증.
- **시트 영구 reference 작성** — 내일 자동화 재시도 시 즉시 활용.

## 잃은 것 / 감수한 것

- **오늘 ingest 0건** — Gemini quota reset 4.5시간 대기 필요.
- **첫 dry-run 1회 LLM 호출** (26회) 도 quota 카운트에 들어가 batch 가능량 감소.
- **batch script 의 fail-fast 없음** — quota 초과 1건이면 나머지 모두 skip 하는 로직 부재. 858 호출 모두 시도하며 시간·로그 낭비.

## 내일 시작 시 quick start

### 1. quota reset 확인 (4.5시간 후)
```bash
npx tsx scripts/debug-gemini-raw.ts  # 한 번 호출해 quota 정상인지 확인
```

### 2. Content extractor 호출 수 최적화 (사용자 확정)
현재: PDF 1건 = message 1 + logic 1 + content N (chunk 수) = ~26 호출
목표: PDF 1건 = **3 호출 이내**

선택지 2가지 (사용자 확인 후 결정):
- **A**: semantic-chunker 의 min/max 조정 → 24 chunk → 6~8 chunk
- **B**: content-extractor 통합 → 전체 텍스트 1 호출로 "자산 후보 N개" 일괄 추출

### 3. ANTHROPIC_API_KEY 활성화
`.env.local` 에 추가 → Claude fallback 작동.

### 4. Batch dedupe 로직 추가
이미 ingest 된 `sourceProject` 는 skip (WinningPattern.sourceProject 기준).

### 5. 33 PDF 재시도
```bash
npx tsx scripts/batch-ingest-proposals.ts --folder C:/Users/USER/projects/archive
```
**예상**: 33 × 3 호출 = 99 호출 → Gemini free quota 안에서 완료. 비용 ~$0.10.

## 신입에게 전할 말

> LLM batch 처리는 비용·quota 를 사전에 계산하라. **1건당 N 호출 × M 건 = total** 이 무료 한도를 넘으면 절반도 못 가서 모두 fail.
> dry-run 으로 1건 검증 후, **batch 전 비용 추정 + fail-fast 룰** 필수. 858 호출 = $0.50 + 1.5시간 — 사전 결정 가능했음.
> RAG 의 chunk 수가 적을수록 검색 정밀도는 다소 떨어지지만 **비용·시간은 기하급수 감소**. 균형 결정이 필요.

## 연결
- Branch: `feat/wave-w-w1` · 3 commit (a877657 · 0f11e33 · d6a3eec)
- 관련 PRD: PRD-v11.0 §4.3 (ingest 알고리즘)
- 관련 reference: `docs/reference/proposal-master-sheet.md`
- 관련 script: `scripts/dry-run-extract-tuple.ts` · `scripts/batch-ingest-proposals.ts`
- 외부 자료: `C:/Users/USER/projects/archive/` (33 PDF) · `.secrets/proposals/master-sheet.xlsx`
- 사용자 인용: *"오늘 이까지만하고 내일 gemini부터 할게"*
