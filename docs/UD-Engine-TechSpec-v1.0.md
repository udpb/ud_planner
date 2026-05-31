# UD 기획 엔진 — Tech Spec v1.0

| 메타 | 값 |
|------|----|
| 상태 | Proposed — 검토 후 구현 착수 |
| 일자 | 2026-06-01 |
| Owner | udpb@udimpact.ai · 언더독스 / UD IMPACT |
| 대상 독자 | 개발 · AI 엔지니어 · 구현 서브 에이전트 |
| Pair | `UD-Engine-PRD-v1.0.html` (방향·기획·벤치마크) · `UD-Engine-JourneyMap-v1.0.html` (8단계 화면) |
| 승계 | PRD-v8.0(Express 2.0) + PRD-Brain 의 기술 부분 통합 |
| 관련 ADR | ADR-019(과업 레이어) · ADR-020(일하는 방식) · ADR-021(단일 엔진, 예정) · ADR-022(모델 정책, 예정) · ADR-008(Value Chain) · ADR-013(자동 진단) |
| 일하는 방식 | ADR-020 — 메인 설계·검증, 기능 코드는 자급자족 브리프로 위임 |

> 본 문서는 저니맵 8단계(S0~S7)·9결정지점을 **데이터 모델 · 생성 파이프라인 · 검색 계약 · Rubric 엔진 · 플라이휠 · API**로 분해해 묶는다. 각 절은 저니맵 단계와 1:1 대응을 명시한다.

---

## 0. 설계 공리 (Design Axioms — 절대 룰)

> 사용자 직접 지시 (2026-06-01): **"핵심은 좋은 제안서가 나오는 것. 토큰을 얼마를 써도 괜찮으니 좋은 제안서가 나오게."**

| # | 공리 | 구현 함의 |
|---|------|-----------|
| A1 | **품질이 1번. 비용은 제약이 아니다.** | **2-tier(ADR-022)**: 생성·판단 = **Pro(`gemini-3.1-pro-preview`)**, plumbing(추출·분류·rewrite) = **Flash(`gemini-3.5-flash`)**. Pro 경로는 다중 패스/샘플. 품질 희생 단축(과한 캐싱·저샘플·얕은 검색) 금지. |
| A2 | **품질은 측정된다.** | "좋은 제안서" = §6 Rubric self-score(한국 70/30 정렬). 제출 전 시뮬레이션 → 임계 미달이면 자동 반복 정제. |
| A3 | **모든 주장은 증거에 묶인다.** | typed win-theme `proof[]` 강제 · 결정론 faithfulness gate · 조작 수치 0. "증명 못 하면 말하지 마라." |
| A4 | **구조는 데이터다 (프롬프트 아님).** | 과업유형·섹션·채널·루브릭 임계 = DB/레지스트리. 프롬프트엔 로직 안 박는다. |
| A5 | **복리.** | 사람 수정 diff·당락·평가자 라벨이 학습 신호. 다음 제안서는 직전보다 낫다. |
| A6 | **신뢰성 ≠ 비용 절약.** | 비용은 안 아끼되, **동시성 캡 + 429 재시도 + 멱등**은 유지(품질·신뢰성 위함). |

**품질-우선 기본값 (cost-no-object 해석):**
- 본문 섹션 생성·win-theme·Rubric 심사·framing 진단 = **Pro `gemini-3.1-pro-preview`** (§8). plumbing은 Flash.
- 평가: **n≥3 샘플 + 다중 심사(서로 다른 모델·페르소나)**, 위치 편향 무작위화.
- 검색: top-k 크게(예: 40) → rerank → top-8. 다중 쿼리(HyDE·분해) 융합.
- 정제: self-score < 임계면 **약점 타깃 재생성 반복**(최대 N회, 보통 2~3).
- 검증: 모든 사실 주장 **주장 추출 → 인용 entailment → 미지지 재생성**(적대적 다중 검증).

---

## 1. 스택 결정

| Layer | 선택 | 비고 |
|---|---|---|
| Framework | Next.js 16 (App Router · Turbopack) | `params` async · `node_modules/next/dist/docs/` 가이드 우선 (AGENTS.md) |
| Language | TypeScript strict · Zod v4 | API·LLM 경계 전부 Zod |
| DB | PostgreSQL + **pgvector** | 현 in-memory 코사인 → pgvector(ivfflat/hnsw) 이관 (§4) |
| ORM | Prisma 7 (`@prisma/adapter-pg`) | 현 42모델 → 과업 레이어 추가 |
| AI 진입점 | `src/lib/ai-fallback.ts` `invokeAi()` | **단일 진입점 불변** (eslint `no-restricted-imports` 가 우회 차단). 라우팅은 이 뒤 (§8) |
| 모델 | **Gemini 3.1 Pro (`gemini-3.1-pro-preview`) 기본** · 임베딩 `gemini-embedding-001`(3072) | ✅ ADR-022 런타임 검증: production=실제 Pro. ⚠️ ANTHROPIC_API_KEY 미설정→Claude fallback 무력 |
| 검색 보강 | BM25(Postgres FTS 또는 외부) + dense + cross-encoder rerank | §4 |
| Observability | 생성 trace 로깅(provider/model/elapsed/tokens) | 이미 L1 로깅 有, 확장 |
| Hosting | Vercel (icn1) + Postgres | `maxDuration` 상향 필요(긴 생성 — §5) |

**불변(ADR 동결):** `invokeAi` 시그니처 · Prisma 핵심 모델 키 · Express `schema.ts` 섹션 키 · 모듈 manifest `reads/writes`.
**가변(데이터):** 프롬프트 본문 · 루브릭 가중치/임계 · 과업유형 레지스트리 · 모델 라우팅 표 · 금지어 사전.

---

## 2. 아키텍처 — 4 레이어 × 저니맵 매핑

```
[주입] ── S0 ──▶ 멱등 ingest + 자동분류 + 검수큐
[지식] ────────▶ 그래프 제약 코퍼스(Value Chain 백본) · Contextual RAG + GraphRAG
[입력] ── S1·S2 ▶ RFP 파싱 → 채널/framing 진단 → 과업 N개 분해 → 60% 자동채움
[생성] ── S3·S4 ▶ gather(병렬) → assemble(단일·plan-then-write) → verify(분리)
[검수] ── S5 ──▶ Rubric self-score → 약점 타깃 정제 반복 → faithfulness gate
[출력] ── S6 ──▶ compliance matrix + win-theme + SROI + .pptx/.md
[학습] ── S7 ──▶ win/loss · 수정 diff · 평가자 CLHF → 검색/예시뱅크 재가중
```

**핵심 원칙(병렬/단일/분리, Anthropic 멀티에이전트 교훈):** 제안서는 강하게 상호의존적 → **수집만 병렬**, **본문 조립은 단일 컨텍스트**, **검증은 별도 패스**. 전면 멀티에이전트 작성 금지.

모듈 배치(현 코드 기준):
- `src/lib/express/` — 생성 코어 (단일 엔진으로 수렴, §5)
- `src/lib/ingest/`·`src/lib/inference/` — 주입·추출
- `src/lib/asset-registry.ts`·`src/lib/express/winning-reference.ts` — 검색 (그래프·RAG로 확장)
- `src/lib/impact/` — SROI (재사용)
- `src/lib/workstream/` — **신규** 과업 레이어 (§7)
- `src/lib/eval/` — **신규** Rubric 엔진 (eval-quality-sweep 승격, §6)

---

## 3. 데이터 모델 (Prisma)

> 현 42모델 유지 + 과업 레이어·win-theme·compliance·rubric·outcome·edit-diff 추가. 임베딩은 pgvector 타입으로 이관.

### 3.1 신규 모델

```prisma
// ── 과업 레이어 (ADR-019) ──────────────────────────────
model Workstream {
  id            String   @id @default(cuid())
  projectId     String
  project       Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  type          String   // WorkstreamType enum (레지스트리 키): education|event_ops|venue|speaker|recruiting|screening|networking|mentoring|deliverable
  scoringCategory String // 연결 RFP 배점 카테고리 (ADR-006 제1원칙)
  order         Int      // 제안서 내 과업 블록 순서
  detail        Json     // 타입별 구조화 필드 (레지스트리 스키마로 검증)
  budgetSliceKrw Int?    // 과업별 예산 → ⑤ = Σ
  autoFillRatio Float    @default(0)   // 자동채움 비율 (S2 표시)
  assets        WorkstreamAsset[]
  keyPoints     KeyPoint[]            // 이 과업이 떠받치는 뒷받침 포인트
  evidence      Json?    // 당선 근거·수치 (FactCheck 대상)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([projectId])
}

model WorkstreamAsset {     // 과업 ↔ 자산 (피드 소스)
  id           String   @id @default(cuid())
  workstreamId String
  workstream   Workstream @relation(fields: [workstreamId], references: [id], onDelete: Cascade)
  contentAssetId String?
  winningChunkId String?
  relevance    Float
  @@index([workstreamId])
}

// ── win-theme + 키메시지 (typed, proof chain) ──────────
model WinTheme {
  id            String   @id @default(cuid())
  projectId     String
  project       Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  discriminator String   // 차별점
  benefit       String   // 고객 편익
  quantified    String?  // 정량 가치
  proof         Json     // ProofRef[] — 비어 있으면 hard error (A3)
  hotButton     String?  // 발주처 hot button 연결
  rank          Int
  @@index([projectId])
}
// ProofRef = { kind: 'quant'|'past_perf'|'testimonial'|'institutional', assetId?, winningChunkId?, sroi?, text }

model KeyPoint {           // 키메시지 뒷받침 디테일 (과업에서 인용)
  id            String   @id @default(cuid())
  workstreamId  String
  workstream    Workstream @relation(fields: [workstreamId], references: [id], onDelete: Cascade)
  winThemeId    String?
  text          String
  proof         Json
  @@index([workstreamId])
}

// ── compliance matrix (1급 산출물) ─────────────────────
model ComplianceItem {
  id           String   @id @default(cuid())
  projectId    String
  project      Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  requirement  String   // RFP 파싱 요구사항
  scoringWeight Int?    // 배점
  mappedSection String? // '1'~'7' (미매핑이면 RS-3 경고)
  coverage     String   // covered | partial | missing
  @@index([projectId])
}

// ── Rubric self-score (S5) ─────────────────────────────
model RubricScore {
  id           String   @id @default(cuid())
  projectId    String
  project      Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  draftVersion Int
  lines        Json     // RubricLine[] {key, weight, score, passed, evidence}
  overall      Float
  weakest      Json     // top-3 약점
  panelScores  Json?    // 다중 심사 raw (calibration용)
  model        String   // 채점 모델·n샘플 기록
  createdAt    DateTime @default(now())
  @@index([projectId, draftVersion])
}

// ── 플라이휠: 당락 결과 ─────────────────────────────────
model ProposalOutcome {
  id           String   @id @default(cuid())
  projectId    String   @unique
  project      Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  result       String   // won | lost | pending
  reason       String?  // 사유 메모 (정성)
  awardScore   Float?   // 받은 점수(알면)
  submittedAt  DateTime?
  decidedAt    DateTime?
}

// ── 플라이휠: 사람 수정 diff (SALT) ────────────────────
model EditDiff {
  id           String   @id @default(cuid())
  projectId    String
  sectionKey   String
  aiText       String   // AI 초안
  shippedText  String   // PM 최종본
  diffKind     String?  // tone|fact|structure|trim
  createdAt    DateTime @default(now())
  @@index([projectId])
}
```

### 3.2 기존 모델 확장

```prisma
// ContentAsset / WinningProposalChunk — 임베딩 pgvector + 신선도·맥락
//   embedding        Unsupported("vector(3072)")   // pgvector (현 Float[] 이관)
//   contextBlurb     String?   // Contextual Retrieval prepend (§4.1)
//   lastVerifiedAt   DateTime?
//   decayRate        String?   // weeks|months|stable
//   sourceRef        String? @unique   // 멱등 dedup
//   workstreamType   String?   // 과업유형 태깅 (생성 검색 필터)
// Project — relations 추가: workstreams, winThemes, complianceItems, rubricScores, outcome, editDiffs
```

> ⚠️ 모델 수: 42 → 약 49 (+7). DATA 브리프로 migration. `ADR_workstream` 채택 후 진행.

---

## 4. 검색 계약 (Retrieval) — S0·S2·S3 공급

> 목표: 생성되는 모든 문장이 **실제 당선 언어·자산에 근거**. 품질-우선이므로 깊게(top-k 크게) 검색하고 rerank.

### 4.1 Ingest 시 — Contextual Retrieval (Anthropic, top-k 실패 −49%)
- 각 청크에 **frontier로 50~100토큰 맥락 blurb 생성** → blurb+청크 임베딩(3072) + BM25 인덱싱.
- 멱등: `sourceRef @unique` / content-hash. 차원 assert(3072) — 불일치 시 적재 거부.
- 비용 무제약(A1)이므로 Batch 대신 실시간으로 즉시 인덱싱해도 무방. 단 대량 재인덱싱은 동시성 캡.

### 4.2 Query 시 — 다중쿼리 hybrid + rerank (−67%)
```
retrieve(query, {channel, workstreamType}):
  qs = [query, hyde(query), ...decompose(query)]     // 다중 쿼리 (frontier)
  cand = union( bm25(qs, k=40), dense(qs, k=40) )      // RRF 융합
  cand = filter(cand, channel/workstreamType, freshness>0)  // 그래프 제약 + 신선도
  top = crossEncoderRerank(query, cand)[:8]            // 품질 핵심
  return parentSection(top)                            // 섹션 단위로 확장(coherence)
```
- 인터페이스: `src/lib/retrieval/index.ts` `retrieve(q, filter): RetrievedChunk[]`.
- `winning-reference.ts`·`asset-registry.ts`를 이 계약 뒤로 통합 (단일 검색 계약).

### 4.3 GraphRAG (전역 질문) — S3 전략/framing 한정
- Value Chain 백본 위 concept 그래프 → 커뮤니티 요약. "이 발주처/사업유형에서 무엇이 당선되나" 같은 전역 질문 응답.
- 전 검색 경로엔 미적용(비용 아닌 적합성 — 지역 검색이 대부분).

### 4.4 검색 품질 평가 (필수 ADD)
- 라벨셋: (RFP → 기대 당선문서/자산). `recall@k`·`MRR` 추적. 임베딩·청킹 변경 시 회귀 게이트.
- 위치: `src/lib/eval/retrieval-eval.ts`.

---

## 5. 생성 파이프라인 (Generation) — S2~S5 핵심

> **단일 엔진으로 수렴** (현 3엔진 표류 폐기: `produce-ultimate-draft`·`proposal-ai`·`ai/proposal-section` → 하나). production 라우트에 배선(현 dev-only 문제 해소).

### 5.1 단계 (각 단계 = 모델·검증 명시)

| # | 단계 | 입력 | 모델 | 출력 | 저니맵 |
|---|------|------|------|------|--------|
| G1 | RFP 파싱 | RFP 텍스트/PDF(OCR 폴백) | frontier | 구조화 RFP | S1 |
| G2 | 채널·framing 진단 | 구조화 RFP | frontier(품질) + 휴리스틱 fallback | channel·framing·factcheck·logicchain | S1 |
| G3 | **과업 분해** | RFP + ProgramProfile | frontier | Workstream[] (타입·배점) | S2 |
| G4 | 과업 자동채움 | 각 Workstream + 검색(§4) | frontier | detail·assets·keyPoints | S2 |
| G5 | gather (병렬) | 과업별 needs | 병렬 서브: 외부 리서치·코치매칭·통계·당선청크 | evidence pool | S3 |
| G6 | win-theme 생성 | 과업 + evidence | frontier | WinTheme[] (proof 강제) | S3 |
| G7 | **assemble (단일)** | 전 컨텍스트 | frontier · plan-then-write | 7섹션 초안 (과업 위 투영) | S4 |
| G8 | compliance matrix | RFP 요구 × 섹션 | frontier + 룰 | ComplianceItem[] | S4 |
| G9 | SROI forecast | outcome map | 결정론(impact 엔진) | SROI | S4 |
| G10 | **verify (분리)** | 초안 + 검색 | frontier · 적대적 다중 | faithfulness 판정·인용 | S4·S5 |
| G11 | Rubric self-score | 초안 | 다중 심사(n≥3) | RubricScore | S5 |
| G12 | **정제 루프** | 약점 top-3 | frontier | 타깃 재생성 → G10·G11 재실행 | S5 |
| G13 | render | 최종 draft | 결정론 | .pptx/.md/.xlsx | S6 |

### 5.2 assemble — plan-then-write (STORM +25% 조직성)
```
assemble(ctx):
  outline = planOutline(ctx)         // 섹션별 evidence-plan + 길이예산 (frontier)
  memory = []                        // 이미 한 주장·인용한 수치 (모순/중복 방지)
  for section in [1..7]:             // 과업 위 투영 (§7)
    draft[section] = writeSection(section, outline, ctx, memory)  // frontier, 공유 컨텍스트
    memory += extractClaims(draft[section])
  coherencePass(draft, memory)       // 섹션 간 정합 (frontier)
  return draft
```

### 5.3 정제 루프 (품질-우선 핵심, A2)
```
draft = assemble(ctx)
for i in 1..MAX_REFINE(=3):
  verify(draft)                       // G10 — 미지지 주장 재생성
  score = rubricSelfScore(draft)      // G11
  if score.overall >= 당선권_임계: break
  draft = refineWeakest(draft, score.weakest)   // 약점 타깃 재생성 (frontier)
```
- `maxDuration` 상향 + 진행 상태 스트리밍(PM 대기 UX). 비용 무제약이라 반복 적극.

### 5.4 verify — 결정론 faithfulness gate (환각 25→12%)
```
for claim in extractClaims(draft):
  ev = retrieve(claim)               // §4
  verdict = entailment(claim, ev)    // 다중 심사, frontier
  if verdict < THRESH: regenerate(claim) or drop
  attachCitation(claim, ev)
# 수치 주장은 더 엄격: 당선청크/자산에 동일 수치 없으면 차단 (조작 0, A3)
```

---

## 6. Rubric 엔진 — "좋은 제안서"의 정의 (S5)

> 평가위원 시트를 그대로 최적화 대상으로. 현 평가위원 패널(eval-quality-sweep)을 정식 엔진으로 승격.

### 6.1 채점 라인 (한국 70/30 정렬)
| 라인 | 가중 | 기계 검증 |
|---|---|---|
| RFP compliance | gate | 미매핑 요구 0 (아니면 실격 경고 RS-3) |
| 사업이해도·tailoring | 15 | 발주처 entity 인용 ≥N · 보일러플레이트 점수 낮음 |
| 추진전략·logic chain | 30 | LogicChainChecker 채널 chain 통과 · Action Week |
| 차별성 | 15 | discriminator ≥3 each proof · ghosting 존재 |
| 증거 밀도 | 15 | 증거주장/전체 ≥ 임계 · 금지어 0 · 조작 0 |
| 기대효과·SROI | 10 | outcome map 완성 · 3방향 정렬(ADR-008) |
| 위험·품질관리 | 10 | 리스크 레지스터 + 미언급 우려 |
| ergonomics | 5 | 문단≤6줄·문장≤15~20단어·10초 규칙 |

집계: `overall = Σ(line.score × weight) − ap_penalty`. 당선권 임계는 레지스트리(가변).

### 6.2 win-theme typed + proof chain (A3)
- 스키마 = `WinTheme` 모델. **`proof[]` 비면 hard validation error**.
- 금지어 사전(가변): "최고 수준"·"world-class"·"풍부한 경험"… → 자동 차단·치환 요구.

### 6.3 평가자 calibration (anti-gaming)
- binary MET/UNMET 우선 · 3~5단 앵커 · **생성 모델군이 단독 judge 금지**(교차 모델) · 위치 편향 무작위화 · 길이 편향 패널티.
- gold set(과거 당선/탈락 라벨) → judge↔human **κ/Krippendorff α** 추적. judge 신뢰 확보 후에만 점수 신뢰.
- CLHF: ~5건 라벨로 judge 튜닝(정확도 ~30%/회).

---

## 7. 과업(Workstream) 레이어 (ADR-019) — S2·S4

### 7.1 레지스트리 (`src/lib/workstream/registry.ts`, 가변 데이터)
타입별 선언: 기대 필드 스키마 · 연결 RFP 배점 · 피드 소스 · 당선언어 패턴 키.
```ts
// 예
education:  { fields: ['curriculum','sessions','methodology'], scoring: '수행역량', feeds: ['coach','impact-module'] }
event_ops:  { fields: ['eventType','scale','staff','safety'],  scoring: '운영역량', feeds: ['result-report'] }
speaker:    { fields: ['candidates','topic','difficulty','fee'], scoring: '차별화', feeds: ['speaker-pool'] }
venue:      { fields: ['site','capacity','access','cost'],      scoring: '운영역량', feeds: [] }
```
**새 과업유형 추가 = 레지스트리 1엔트리** (파이프라인 불변, A4).

### 7.2 7섹션 = 과업 위 투영
| 섹션 | 합성 |
|---|---|
| ② 추진 전략 | 과업 조합의 논리 사슬 |
| ③ 사업 내용 | 과업별 블록 순차 렌더 (order) |
| ④ 운영 체계 | 과업별 운영·인력(코치=멘토링 과업 디테일) |
| ⑤ 예산 | Σ workstream.budgetSlice |
| ⑥ 기대 성과 | 과업별 Output→Outcome 합성 → SROI |

### 7.3 키메시지 = 과업 종합
- WinTheme 3~5개, 각 `KeyPoint`(뒷받침)를 관련 과업에서 자동 인용. 평문 아닌 추적 가능 구조.

### 7.4 하위호환
- 기존 교육 전용 프로젝트 → "교육 과업 1개" 자동 변환 어댑터(DATA 브리프).

---

## 8. 모델·동시성 정책 (§A1 품질-우선)

### 8.1 라우팅 (`invokeAi` 뒤, `src/lib/ai/config.ts` 확장)
**2-tier (Pro + Flash 결합, ADR-022):** 품질-결정=Pro, plumbing=Flash. 품질-우선 유지(Pro 경로 다중 패스).
| 작업 | 모델 | 근거 |
|---|---|---|
| 본문 작성·win-theme·assemble·정제·coherence | **`gemini-3.1-pro-preview`** | 품질 직결 (A1) |
| framing 진단·faithfulness·Rubric 심사(다중)·과업 분해·GraphRAG | **Pro** | 판단·구조 품질 |
| RFP 파싱·추출·claim 분리·청크 blurb·분류·태깅·query rewrite | **`gemini-3.5-flash`** | 빠름(~2.5×)·품질 민감 낮음. 신뢰도 낮으면 Pro escalate |
| S3 대화 즉답 | **Flash** | latency 중요 |
| 임베딩 | gemini-embedding-001 (3072) | — |
| 구조화 출력 | responseSchema/JSON 모드 + `safeParseJson` 폴백 | 견고성 |

> ✅ **ADR-022 해결**: 런타임 검증 결과 production 기본 `gemini-3.1-pro-preview`는 **실제 작동하는 Pro frontier**. "flash 동작"은 eval 스윕 env override 한정이었음. frontier 전제 충족. (단 thinking 모델 → maxOutputTokens 크게 / ANTHROPIC_API_KEY 미설정 → fallback 무력.)

### 8.2 동시성·신뢰성 (비용 아님, 품질·안정 위함)
- gather 병렬·정제 반복 → **동시성 캡(예: 3~5) + 지수 백오프 429 재시도**. naive 무한 병렬 금지.
- 멱등(생성 재시도 안전) · per-step 타임아웃 · 부분 실패 graceful.

---

## 9. 플라이휠 (S7) — 복리 (A5)

| 루프 | 트리거 | 구현 | 되먹임 |
|---|---|---|---|
| 당락 | `ProposalOutcome` 입력 | 당선 상관 자산·win-theme·framing 집계 | 검색 rerank 가중 ↑ |
| 수정 diff | `EditDiff`(AI vs 최종본) | few-shot 예시뱅크 + 재랭킹 | assemble 프롬프트 예시 |
| 평가자 CLHF | gold set ~5 라벨 | judge 튜닝 | Rubric 신뢰도 ↑ |

- 잡: `src/app/api/cron/brain/*` 패턴 재사용. 라벨 누락 시 리마인드(RS-6).
- 재학습(fine-tune) 불필요 — 검색 가중·예시뱅크·judge 튜닝만으로 복리.

---

## 10. API·라우트 계약 (저니맵 단계별)

| 라우트 | 단계 | 책임 | auth |
|---|---|---|---|
| `POST /api/brain/inject` | S0 | 멱등 ingest + 자동분류 | role-gated |
| `POST /api/projects` | S1 | RFP 파싱·진단(G1·G2) | requireProjectAccess |
| `POST /api/projects/[id]/workstreams` | S2 | 과업 분해·자동채움(G3·G4) | **requireProjectAccess (현 갭 닫기)** |
| `POST /api/projects/[id]/build/turn` | S3 | 결정 대화·win-theme(G5·G6) | requireProjectAccess |
| `POST /api/projects/[id]/assemble` | S4 | 단일 조립·matrix·SROI(G7~G9) | requireProjectAccess · maxDuration↑ |
| `POST /api/projects/[id]/review` | S5 | verify·Rubric·정제(G10~G12) | requireProjectAccess |
| `POST /api/projects/[id]/export` | S6 | pptx/md/xlsx(G13) | requireProjectAccess |
| `POST /api/projects/[id]/outcome` | S7 | 당락 입력 → 플라이휠 | requireProjectAccess |

> ⚠️ 보안: 현 express `turn`·`init`만 auth 없음 → 신 라우트는 전부 `requireProjectAccess` 강제.

---

## 11. 마이그레이션 · 구현 브리프 (ADR-020 위임)

| Phase | 브리프 | 내용 | DoD |
|---|---|---|---|
| P0 | FIX-2 | Gemini 로그 확인·ADR-022 · turn/init auth · embedding assert · web-search invokeAi 통합 | typecheck·lint·manifest·build |
| P1 | (ADR) | ADR-019 Accept · ADR-021(단일 엔진) 작성 · 과거 제안서 3~5건 과업 taxonomy 검증 | 사용자 승인 |
| P2 | DATA-1 | Prisma: Workstream·WinTheme·Compliance·Rubric·Outcome·EditDiff + pgvector 이관 + 어댑터 | migration·시드 |
| P2 | WS-1 | `workstream/registry.ts` + 과업유형 8~10종 + 분해(G3)·자동채움(G4) | 분해 E2E |
| P2 | RET-1 | `retrieval/index.ts` 단일 계약 + Contextual + hybrid + rerank + recall eval | recall@k 측정 |
| P3 | EX-1 | 단일 엔진 수렴(3→1) + assemble plan-then-write + production 배선 + 정제 루프 | self-score 통과 |
| P3 | EX-2 | verify faithfulness gate(결정론) + win-theme typed + compliance matrix | 환각↓·인용 |
| P3 | EVAL-1 | Rubric 엔진(70/30) + 다중 심사 + calibration(gold set κ) | judge κ 목표 |
| P4 | BR-1 | 멱등 ingest + 자동분류 + 검수큐 + drop-zone UX + 그래프 엣지/신선도 | 주입 E2E |
| P5 | FLY-1 | win/loss·edit-diff·CLHF 플라이휠 + vitest 결정론 코어 | 루프 동작 |

**불변/가변 재확인:** 불변=스키마 키·invokeAi·섹션 키·manifest. 가변=프롬프트·루브릭 임계·레지스트리·라우팅·금지어.

---

## 12. 검수 게이트 (각 브리프 완료 시)
- [ ] `npm run typecheck` · `lint` · `check:manifest` 통과
- [ ] Scope 위반 0 (`git diff --name-only` ⊆ CAN-touch)
- [ ] 신규 라우트 `requireProjectAccess`
- [ ] LLM 호출 전부 `invokeAi` 경유 (직접 SDK import 0)
- [ ] (생성 관련) self-score·faithfulness·recall 지표 회귀 0
- [ ] 5섹션 보고 + 검증 증거

---

## 13. 미해결 (사용자/ADR 확인 대기)
- ~~ADR-022: 모델 확정~~ → **Accepted(2026-06-01, 런타임 검증)**: production=실제 Pro. 남은 결정 = `ANTHROPIC_API_KEY` 설정 여부(fallback 이중화).
- 당선권 Rubric 임계 수치 — 과거 당선/탈락 라벨로 보정 필요.
- 한국 평가배점 정확 수치 — law.go.kr 원문으로 핀다운(PRD §9 주석).
- Deep Track 정밀화의 단일 엔진 통합 범위(S6 옵션) — ADR-021에서 결정.

## References
- `UD-Engine-PRD-v1.0.html` · `UD-Engine-JourneyMap-v1.0.html` · ADR-019·020 · docs/glossary.md · docs/playbook/
- 리서치 출처: PRD §9 (Anthropic Contextual Retrieval·Microsoft GraphRAG·STORM·VeriFact-CoT·Shipley/APMP·조달청 협상계약)
