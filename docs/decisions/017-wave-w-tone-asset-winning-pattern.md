# ADR-017: Wave W — 톤 자산화 + WinningPattern 활성화 + 데이터 아카이브 시드

> ⚠️ **상태 정정 (2026-06-01):** 의도 상당 부분이 **Brain Sphere-2 로 흡수**됨 (WinningPattern→WinningProposalDoc 풀텍스트 RAG, tone-patterns.ts). 원안 W1~W5 대로 vs 재구현 정합 확인 필요. ⚠️ 명명: "Wave W" ≠ Brain "W14~W32 Waves" (glossary §9).

**Status:** Draft → Brain Sphere-2 로 일부 흡수 (정합 확인 필요)
**Date:** 2026-05-22
**Deciders:** udpb@udimpact.ai + AI Architect
**Scope:** AI prompt layer · 자산 매칭 layer · 학습 루프 layer · 데이터 시드 layer (4개 레이어 동시 활성화)
**관련:** ADR-009 (UD Asset Registry v1), ADR-010 (Content Hub v2), ADR-014 (Wave U), ADR-015 (Wave V — 선행), ADR-016 (Data Center Google Drive — 후속)

> **선행 조건**: ADR-015 의 F4·F5 가 완료되어 5 Stage 통합이 안정화된 후 본 Wave W 시작. F5 의 Inspector surface 가 안정되어야 본 ADR 의 8번째 lens `voice` 가 정확히 끼워질 수 있다.

---

## Context

### 사용자 비전 (장기)
> "언더독스 에셋이 충분히 학습 → 콘텐츠·코치풀·자료 계속 주입 → 좋은 제안서.
> 장기적으로 HBR·SSIR·트리플라잇 같은 인사이트 리포트 크롤링 → 학습량 똑똑하게 → AI 챗봇과 방향 잡으면 정확하게 언더독스 톤·강점이 가장 극대화된 조합으로 제안서 → 수주율 ↑.
> 처음에는 핵심메시지·컨셉이 잘 뽑히고 차별화 포인트·자산 매핑 → 필요시 신규 콘텐츠 생성까지."

### 현재 시스템의 3개 본질적 gap (2026-05-22 architecture audit)

1. **WinningPattern dead asset** — 스키마는 있는데 (`prisma:1070` — `snippet`, `whyItWorks`, `tags`, `profileVector`, `outcome`) 어디서도 read 안 함. 사용자 비전의 핵심이 가장 안 활용된 곳.
2. **톤 학습 layer 부재** — `ud-brand.ts` 의 정적 상수만 prompt 에 주입. 수주 사례의 실제 표현 패턴은 학습 0. 외부 자료 (HBR/SSIR/트리플라잇) 크롤링 시작하면 그 톤이 섞일 위험.
3. **historical 학습 시드 부재** — 30개 사업의 정제된 메타데이터가 사용자 Downloads (`Data Labs._데이터 아카이빙 대시보드_0522.html`) 에 있는데 시스템에 import 안 됨. AssetUsage 가 신규 프로젝트만 학습하면 cold start 가 길어짐.

### 자산 매칭의 이중 트랙 문제 (보조 gap)

`matchAssetsToRfp` (rule-based 0.5/0.3/0.2) vs `recommendAssetsForWeakLenses` (embedding + win-rate + channelWeight) 가 분리되어 PM 이 S1/S3 에서 다른 순위 보게 됨. 신뢰 저하.

### 외부 벤치마킹

1. **Stripe Atlas / Notion Templates** — 도메인 패턴을 자산화 (template + 메타데이터 + 사용 통계 + 거절률) → 매번 PM 이 처음부터 안 짜고 패턴 위에서 시작.
2. **Anthropic / OpenAI dogfood** — 자사 프롬프트의 톤 가이드를 "exemplars + anti-exemplars" 로 명시 (do/don't pair). 정적 상수 X.
3. **Crew AI / LangSmith** — agent trace 의 win/loss outcome 으로 prompt 자동 튜닝. 현재 우리의 AssetUsage 와 같은 구조이지만 prompt-level 까지 확장.

---

## Options Considered

### Option A — 점진적 활성화 (작은 ADR 3개로 분리)
- 장점: 각 PR 작고 회귀 위험 ↓, 게이트 명확
- 단점: WinningPattern 활용 + 톤 자산화 + 데이터 시드는 **상호 의존** (시드 없이 톤 학습 X, 톤 학습 없이 WinningPattern 활용 의미 ↓). 분리하면 첫 ADR 완료 후 효과 측정 어려움
- 기각 이유: ADR-015 처럼 Wave 단위 통합이 학습 효과 측정에 유리

### Option B — Wave W 통합 ADR (W1~W5 마일스톤)
- 장점: 사용자 비전의 1개 명확한 deliverable (톤·강점 학습 루프 활성화). 데이터 시드 → WinningPattern 활용 → 톤 학습 → Inspector lens → 외부 크롤링 준비 의 자연스러운 chain
- 단점: ADR-015 처럼 7~12일 추정 작업
- **채택**

### Option C — Wave W 미루고 외부 크롤링 (Wave X) 부터
- 장점: 사용자 장기 비전의 가장 큰 부분
- 단점: 톤 자산화 안 된 상태에서 HBR/SSIR 크롤링 = 정체성 희석 위험. **선행 안전망 없이 큰 외부 데이터 도입 = 1년 후 회수 비용 ↑↑**
- 기각 이유: 사용자가 명시한 "톤 자산화 → 외부 크롤링" 순서가 자연스러움. 본 ADR-017 (Wave W) 가 ADR-018 (Wave X: 외부 크롤링) 의 안전망

---

## Decision

**Wave W** = 4개 layer 동시 활성화로 학습 루프 완성.

### 1. Layer 1 — 데이터 시드 (W1)

사용자 제공 데이터 아카이브 HTML 을 historical baseline 으로 import.

**Source**: `C:/Users/USER/Downloads/Data Labs._데이터 아카이빙 대시보드_0522.html` (504KB)
**Volume**: 2023~2026 30개 사업 × 16 stage × 7 sector × 9 portfolio × PM/그룹/예산/기간/desc

**스키마 변경 (최소)**:
- `WinningPattern` 에 `archiveCode String?` 컬럼 추가 (예: `'SM-2026-004'`) — 데이터 아카이브 식별자
- `ContentAsset` 에 `stageHint String?` 컬럼 추가 — 16 stage 중 어디 단계 산출물인지 (S00~S15)
- `ChannelPreset` 은 그대로. 단 `sector`/`portfolio` 차원은 ChannelPreset 의 `code` 가 아닌 별도 차원 → `Project` 에 `sector String?` `portfolio String?` 추가

**Import 스크립트** (`scripts/import-archive.ts` 신규):
```
HTML parse → JS 객체 추출 (PROJECTS, PROJECT_META, PROJECT_DESC, etc.)
  → 30 Project row insert (status=COMPLETED for stage=15, LOST for status=lost, etc.)
  → 30 WinningPattern row (snippet=PROJECT_DESC[code], outcome=mapStatus, sourceProfile=ProgramProfile 추정)
  → ProgramProfile derived: sector × portfolio × bizMinor × occupancy → 11축 매핑
  → 메타데이터: meta.importedFrom = 'archive-html-2026-05-22', meta.note = 'historical-proxy (예산/문서수는 추정)'
```

**Import 후 즉시 학습 가능한 신호**:
- PM × Sector × Outcome 매트릭스 (Coach 학습 루프 시드)
- Portfolio × BIZ_MINOR × Outcome (자산 매칭 차원 확장)
- 후속 사업 자연어 연관성 (예: "SM-2024-002 → SM-2026-004") → WinningPattern 의 chain
- 16 stage 산출물 분포 → ContentAsset stageHint 차원

**정기 갱신 (사용자 확정 2026-05-22)**: HTML dashboard 가 분기/월별 갱신되는 별도 도구.
- `scripts/import-archive.ts` 는 idempotent — `archiveCode` 가 같으면 row upsert (insert or update)
- 변경 추적: import 결과에 `created/updated/unchanged` 카운트 + diff JSON 출력 → admin 확인
- **re-import cron 후속 작업** (W1 PR 후, ADR-016 (구글 드라이브 통합) 와 함께 처리): 주기적으로 HTML 다운로드 → import. 우선은 수동 trigger (`/admin/content-hub/ingest` 에 "데이터 아카이브 재import" 버튼).
- 양방향 sync (UD-Ops 신규 사업이 HTML 로 흘러감) 는 본 Wave W 외 별도 ADR 후보. 현재 SSoT 는 HTML (우리가 follower).

### 2. Layer 2 — WinningPattern 활성화 (W2)

**유틸 신규**:
- `src/lib/winning-pattern/loader.ts` — `loadSimilarWinningPatterns({profile, channel, sectorHint, sectionKey, limit=3})`
- `profileVector cosine + outcome='won' 필터 + sector/portfolio match bonus`
- React `cache()` 로 request-scoped 단일 호출

**Prompt 통합**:
- `src/lib/express/prompts/turn.ts` 의 `[유사 수주 패턴]` 섹션 신규 — top 3 의 snippet + whyItWorks 주입
- `src/lib/ai/proposal-section.ts` 도 동일 패턴 — 7섹션 각각 생성 시 sectionKey + sectorHint 로 필터

**자동 ingestion (won + lost 양방향 — 사용자 확정 2026-05-22)**:
- Project.isBidWon=true cascade 시 (현재 AssetUsage 만 갱신) → ProposalSection 7건 snapshot → WinningPattern row 자동 생성 (outcome='won')
- **Project.isBidWon=false cascade 시 (lost)**: 동일하게 ProposalSection snapshot + WinningPattern row (outcome='lost') 자동 생성 — 패배 패턴도 동등 학습 가치
- snippet=ProposalSection.content
- whyItWorks=AI 1회 생성 (Haiku 4.5, 200 토큰) — won 일 때 "왜 성공" / lost 일 때 "왜 실패"
- tags=evalCriteria 매핑

**Loss reason 학습 (Wave W W2 흡수 — 사용자 확정 2026-05-22)**:
- WinningPattern 에 추가 컬럼 2개:
  - `lossReason String?` — 짧은 분류 (예: "예산 미달", "이해관계자 조율 지연", "기술 점수 70 이하", "재공고 보류")
  - `lessonsLearned String?` — 자연어 메모 (PM 입력 가능, AI 보강도 가능)
- W1 의 historical import 시 PROJECT_DESC 의 패배 사유 자연어 (예: "재공고 시 우선 대응 대상", "이해관계자 조율 지연") 를 Haiku 로 lossReason 분류 + lessonsLearned 추출
- `loadSimilarWinningPatterns` 가 outcome='lost' 도 받아 "유사 패배 패턴 1건" 도 함께 prompt 주입 → AI 가 같은 실수 안 함
- Inspector 에 별도 lens 아닌 검수 카드 한 줄로 노출 (UI 부담 최소)

**기존 UI 확장**:
- `/admin/content-hub/ingest` 에 "이 프로젝트를 winning/losing pattern 으로 저장" 버튼 (PM 수동)

### 3. Layer 3 — 톤 자산화 (W3)

**스키마 확장**:
- `WinningPattern.tonePatterns Json?` 추가 — `{ openings: string[], transitions: string[], closingPhrases: string[], avoidedWords: string[], signatureNumbers: { value: string, context: string }[] }`
- W2 의 자동 ingestion 흐름에 톤 추출 step 추가 (Haiku, 400토큰)

**Prompt 통합**:
- `prompts/turn.ts` 의 `[톤·스타일]` 섹션을 정적 상수 → 동적 (channel × sector 필터 top 5 패턴의 openings/transitions 주입)
- Inspector 에 **8번째 lens `voice`** 추가
  - `inspector.ts:36-50` 의 LENSES 배열에 추가
  - 평가: 현재 sections 의 표현이 매칭된 WinningPattern 의 tonePatterns 와 얼마나 align? (LLM 1회 호출, 점수 0~100)
  - CHANNEL_LENS_WEIGHTS: B2G=1.0, B2B=1.2, renewal=1.4 (renewal 일수록 톤 일관성 중요)
- skill `ud-brand-voice` 가 본 데이터를 read 하도록 `references` 섹션 갱신

### 4. Layer 4 — 매칭 이중 트랙 통합 (W4)

`matchAssetsToRfp` 에 두 신호 합산:
- embedding cosine (`recommendAssetsForWeakLenses` 와 동일 호출, +0.1 가중치)
- wlBonus (동일 호출, +0.1 가중치)
- WinningPattern 시드된 자산에 +0.05 historical bonus

가중치 sum=1 재정규화 (현재 0.5+0.3+0.2 → 0.4+0.25+0.15+0.1+0.1). PR 1개 분량.

### 5. Layer 5 — AssetUsage 부정 신호 (W5, 작은 보조 작업)

- `AssetUsage.rejectedByPm Boolean? @default(false)` 컬럼 추가
- UI 거절 클릭 → 같은 row update (acceptedByPm=false + rejectedByPm=true)
- `loadWinLossMap` 가 wlBonus 차감 (max -0.1)
- 약점 lens 별 거절률 30일 윈도 계산 → 60% 초과 시 `admin/asset-insights` 페이지에 알림 카드

---

## Consequences

### Positive

- **사용자 비전 ("학습량 똑똑하게 → 톤·강점 극대화") 의 첫 실현**
- **Cold start 해소** — 30개 historical seed 로 신규 프로젝트도 첫 1차본부터 학습 가중치 적용 가능
- **외부 크롤링 (ADR-018 후보) 안전망 완비** — 톤 자산화 + 신뢰도 tier (W2) 후 HBR/SSIR 도입해도 정체성 유지
- **매칭 일관성** — S1/S3 에서 같은 자산이 같은 순위 (W4)
- **dead asset 해소** — WinningPattern 4개 컬럼 모두 활용
- **사용자 인사이트 활용** — 데이터 아카이브의 PROJECT_DESC 후속 사업 연관성이 자연스럽게 WinningPattern chain 으로 변환

### Negative / Trade-offs

- **데이터 import 의 "historical proxy" 경고 영구 유지** — HTML 의 예산/문서수는 추정값. 시스템이 학습 가중치 적용 시 `meta.note='historical-proxy'` 로 가중치 -20% 적용
- **WinningPattern 자동 ingestion 비용** — Project 1건 수주 cascade 시 LLM 호출 추가 (Haiku 200+400+sectionKey×100 토큰 ≈ ~$0.005/건). 월 10건 가정 시 $0.05/월 = 무시 가능
- **Inspector 8번째 lens 비용** — 검수마다 LLM 1회 추가. 채널 가중치 큰 renewal 만 활성화하는 cost-aware 분기 도입 가능
- **W1 (데이터 import) 가 1회성** — 향후 데이터 아카이브 dashboard 가 갱신되면 재import 필요. cron 자동화는 ADR-016 (구글 드라이브 통합) 의 일환으로 후속 처리

### Follow-ups

- [ ] **ADR-018 후보**: 외부 인사이트 크롤링 architecture (HBR/SSIR/트리플라잇). Wave W 완료 후.
- [ ] **신규 콘텐츠 자동 제안 trigger** (3.7 in audit) — Wave W W5 의 거절률 데이터 누적 3개월 후 trigger 활성화
- [ ] **Coach 학습 루프** (3.5 in audit) — AssetUsage 패턴 재사용 → CoachUsage. Wave W 이후 별도 ADR
- [ ] **API surface v1** (3.6 in audit) — 장기 R&D, 별도 ADR
- [ ] **데이터 아카이브 dashboard 와 UD-Ops 단방향 sync** — 현재 HTML 이 source of truth 면 우리가 follower. 양방향 sync 는 ADR-016 와 함께 결정

---

## 작업 분할 (W1~W5) — 게이트 단위, 일괄 X

ADR-015 의 F1~F5 패턴 그대로.

| PR | 작업 | 위임 vs 직접 | 검수 |
|---|---|---|---|
| **W1** | 데이터 아카이브 import (`scripts/import-archive.ts` + 스키마 3 컬럼 + 30 row insert) | Agent 위임 (HTML parser) + 내가 schema 결정 + 검수 | tsc·prisma migrate dev·import dry-run·DB 확인 |
| **W2** | WinningPattern 활성화 (loader + prompt 통합 + 자동 ingestion) | Agent 위임 (loader 알고리즘) + 내가 prompt | 동일 + S2 1차본 작성 + S3 검수 비교 |
| **W3** | 톤 자산화 (tonePatterns 추출 + 동적 주입 + Inspector voice lens) | Agent 위임 + 내가 통합 + 검수 | 동일 + Inspector 8 렌즈 회귀 |
| **W4** | 매칭 이중 트랙 통합 | 직접 (가중치 결정이 단순) | 동일 + S1/S3 자산 순위 동일성 확인 |
| **W5** | AssetUsage 거절 신호 + 거절률 알림 | Agent 위임 (UI) + 내가 알림 조건 | 동일 |

**총 추정**: 8~14일 (W1 이 가장 큼 — HTML parser + DB seed + Profile derivation)

### 작업 순서 합리화

1. **W1 먼저** — 시드 없이는 W2 부터 활성화해도 학습 데이터 0. 시드가 모든 layer 의 fuel.
2. **W2 (WinningPattern 활용)** — W1 의 30 row 가 즉시 read 대상. proposal prompt 에 첫 효과 발현.
3. **W3 (톤 자산화)** — W2 의 자동 ingestion 흐름에 톤 추출 step 추가가 자연스러움. Inspector voice lens 도 W2 의 WinningPattern 풀 위에서 작동.
4. **W4 (매칭 통합)** — W1 의 시드된 WinningPattern 풀이 충분히 쌓인 후 historical bonus 가 의미 있음.
5. **W5 (거절 신호)** — 가장 작은 작업, 마지막.

---

## 안전망

1. **각 W PR 별 게이트** — 사용자 화면 확인 후 다음 진행. 통째 일괄 X. (ADR-015 와 동일)
2. **Feature flag `WAVE_W_TONE_LEARNING=true/false`** — W3 voice lens 만 gating. 운영 기본 OFF, dev/test ON.
3. **데이터 아카이브 import = 1회성 + dry-run 필수** — `scripts/import-archive.ts --dry-run` 으로 row 변환 결과 JSON 출력 → 사용자 검수 후 실제 insert
4. **historical proxy 가중치 -20%** — W1 으로 시드된 WinningPattern 은 `meta.confidence='historical-proxy'` 자동 태깅. loader 가 매칭 점수에 0.8 곱
5. **W3 voice lens cost guard** — `process.env.VOICE_LENS_CHANNELS='renewal,b2b'` 로 채널별 활성화 분기. 기본 renewal 만
6. **Rollback** — 모든 변경 reversible. 신규 컬럼 nullable, 신규 row 는 archiveCode 로 일괄 삭제 가능
7. **회귀 보호** — Wave V F5 의 5 Stage 통합이 안정화된 후 Wave W 시작 (선행 조건 명시)
8. **PM 1명 풀테스트** — W3 완료 직후 (Wave W 끝나기 전) PM 실제 작성 + 15분 인터뷰. 데이터 기반으로 ADR-018 (외부 크롤링) 결정

---

## References

- 관련 ADR: ADR-009, ADR-010, ADR-014, ADR-015 (선행), ADR-016 (후속)
- 관련 journey: docs/journey/2026-05-22-architecture-audit-and-archive-import.md
- 입력 데이터: `Data Labs._데이터 아카이빙 대시보드_0522.html` (사용자 Downloads, 504KB, 30 projects)
- 관련 파일:
  - `src/lib/asset-registry.ts` (matchAssetsToRfp)
  - `src/lib/express/asset-recommender.ts` (recommendAssetsForWeakLenses, loadWinLossMap)
  - `src/lib/express/inspector.ts` (7 lenses → 8)
  - `src/lib/express/prompts/turn.ts` (톤·스타일 섹션)
  - `src/lib/ai/proposal-section.ts` (7섹션 생성)
  - `src/lib/ud-brand.ts` (정적 → 동적)
  - `prisma/schema.prisma` (WinningPattern·ContentAsset·AssetUsage 확장)

## 사용자 인용 (의사결정 트레이스)

> "언더독스 에셋이 충분히 학습되어있고, 이 후에도 계속해서 콘텐츠, 코치풀, 그 외 데이터나 자료들을 계속해서 주입해서 그걸 기반으로 좋은 제안서가 나오는 것을 목표"
>
> "장기적으로는 HBR이나 SSIR 아니면 국내에 트리플라잇 같은 인사이트 리포트를 발행하는 곳들의 자료들을 크롤링해서 학습량이 계속 똑똑하게 만들어서 AI챗봇과 방향을 잡으면 정확하게 언더독스 톤과 강점이 가장 극대화 된 조합으로 제안서가 나와서 수주율을 높이는 것"
>
> "필요하면 신규로 콘텐츠나 교육자료 등을 만들어서 하는 것 까지 필요"
>
> "ADR-015 F4·F5 마무리하고 Part 3.1·2.2 (Wave W ADR) 진행하자"

## Teaching Notes (교육자료용)

**신입 PM/개발자가 이 ADR에서 배울 것:**
- **dead asset 발견 = 최대 leverage** — 스키마는 있는데 활용 0 인 컬럼/모델은 사용자 비전의 가장 큰 미실현 영역일 가능성이 높다. 발견 즉시 ADR 후보로 기록.
- **외부 데이터 도입 전 안전망** — 우리 톤을 명시화 안 한 채 외부 자료 도입하면 1년 후 정체성 회수 비용이 도입 비용의 10배. ADR-017 → ADR-018 순서가 우연이 아님.
- **historical seed 의 가치** — Cold start 1개월 vs. 30개 historical seed import 1일. 학습 시스템은 첫 데이터가 가장 비싸다. 사용자가 공유한 dashboard/csv/json 의 데이터 잠재력을 항상 100% 추출.
- **Wave 단위 통합 vs 작은 PR 분리** — 상호 의존이 있는 변경은 Wave 로 묶고 마일스톤 단위 PR. 독립 변경은 작은 ADR. 판단 기준: "첫 PR 후 효과 측정 가능한가?"
- **feature flag 의 cost guard 패턴** — 비싼 LLM 호출은 환경변수로 채널별 활성화 분기 (`VOICE_LENS_CHANNELS='renewal'`). 운영 비용 통제와 점진 도입을 한 코드로 해결.
