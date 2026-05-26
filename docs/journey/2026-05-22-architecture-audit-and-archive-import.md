# 2026-05-22 — Architecture Audit + 데이터 아카이브 인계

> Wave V F0~F3+F1.5 완료 직후의 ground-truth 점검 + 사용자가 공유한 30개 사업 아카이브 HTML 분석.
> Wave V 잔여 (F4·F5) 와 Wave W (ADR-017) 의 입력 데이터가 됨.

## 이날의 맥락
- **누구:** udpb@udimpact.ai + AI Architect
- **무엇을 하려 했나:**
  1. 이전 세션 요약 (architecture/F1~F3 진척) 의 ground-truth 검증
  2. 현재 시스템의 architecture-level 강·약점 진단
  3. 장기 비전 (HBR/SSIR/트리플라잇 크롤링 + 톤·강점 극대화 + 수주율) 으로 가는 우선순위 정렬
  4. 사용자 제공 데이터 아카이브 (`Data Labs._데이터 아카이빙 대시보드_0522.html`) 의 시스템 통합 가치 산정
- **어디서 시작했나:**
  - Wave V F0~F3 + F1.5 직후 commit `44c23c3`
  - ADR-015 Draft + ROADMAP/CLAUDE 갱신 완료
  - EXPRESS_PARADIGM_V3 flag 운영 OFF, dev/test 만 ON
  - PM 풀테스트 + 11개 이슈 → ADR-015 채택의 배경

## 흐름 (시간순)

### 1. Ground-truth 검증 — 이전 세션 요약의 4개 보정점

이전 세션이 만든 architecture 요약은 대부분 정확했지만, 코드를 직접 읽으니 **4개 사실이 다르거나 누락**되어 있었다.

| 이전 요약 | 실제 검증 |
|---|---|
| "asset-recommender 가 semantic embedding cosine 사용" | 부분 사실. embedding 은 약점 lens → 자산 추천 에서만 (`asset-recommender.ts:285`). **core `matchAssetsToRfp` 는 embedding 미사용** (rule-based 0.5/0.3/0.2). 두 매칭 경로가 분리됨. |
| "AssetUsage 가 데이터만 쌓이고 학습 안 함" | **이미 학습 중**. `loadWinLossMap()` (asset-recommender.ts:381-472) 가 Laplace smoothing + 1년 half-life + techScore 가중치로 채널별 win-rate 산출 → 추천 점수에 최대 +15% 보너스. 다만 **PM 거절 신호는 추적 X** (실제 gap). |
| "WinningPattern 시드만 있고 매칭 활용 0" | **확인됨**. 스키마 (`prisma:1070`) + `snippet`/`whyItWorks`/`profileVector` 컬럼 모두 존재, 어디서도 read 없음. **가장 큰 dead asset**. |
| "/admin/content-hub UI 미구현" | **존재함**. `src/app/admin/content-hub/` (page+[id]+ingest+new+_components) + `asset-insights/` + `bookmarklet/`. ExtractedItem → ContentAsset 자동 승격만 미구현. |

**막힌 지점:**
처음엔 Explore agent 의 audit 보고서를 그대로 신뢰하려 했으나, `/admin/content-hub` 부재 주장이 사용자 CLAUDE.md 와 모순 → 직접 `ls src/app/admin/` 확인 → agent 가 좁은 grep 으로 miss 했음을 발견. **Agent 보고서도 "trust but verify" 필요.**

### 2. Architecture 5개 핵심 관찰 (직접 코드 본 뒤)

#### 2.1 자산 매칭의 이중 트랙 — 통합 필요
현재 두 개의 독립된 점수 시스템이 같은 자산 풀에 다른 순위를 매김.

| 경로 | 사용처 | 알고리즘 | embedding | win-rate |
|---|---|---|---|---|
| `matchAssetsToRfp` | RFP 분석 시 자산 카드 (S1) | 0.5 profile + 0.3 keyword + 0.2 section | ✗ | ✗ |
| `recommendAssetsForWeakLenses` | Inspector 약점 lens 추천 (S3) | 0.5 evidence + 0.3 category + 0.2 vector + profileBonus + channelWeight + wlBonus | ✓ | ✓ |

PM 입장에서 S1/S3 에 같은 자산이 다른 순위로 등장 → 신뢰 저하.

#### 2.2 WinningPattern — 최대 dead asset
스키마는 있는데 어디서도 read 안 함. 사용자 비전 ("학습량 똑똑하게 → 톤·강점 극대화") 의 핵심이 정확히 여기서 막힘.

#### 2.3 AssetUsage 학습 루프 — 부정 신호 부족
`wonProject=null` 인 채로 인용된 자산은 영영 학습 데이터 안 됨. PM 이 거절한 사건도 정보. `rejectedByPm Boolean` 컬럼 추가가 자연스러운 다음 단계.

#### 2.4 ContentAsset embedding — 인프라만 있고 자동 갱신 X
`embedding`+`embeddingModel`+`embeddedAt` 컬럼은 있는데 cron 없음. 자산 수정마다 embedding 안 갱신되면 시간 지날수록 stale.

#### 2.5 accept-research 의 section 자동 선택 — 5 정규식 한계
`pickSectionForHit` (accept-research/route.ts:49-54) 가 regex 5개로 sections.1/2/3/6 분배. `evalCriteria.sectionWeights` 무시 — RFP 별 평가배점 가중을 못 반영.

### 3. 내용/제품 6개 제안

사용자 비전 ("HBR/SSIR/트리플라잇 크롤링 → 톤·강점 극대화") 기준 우선순위.

1. **톤·키 메시지 자산화** (1순위) — 외부 크롤링 전 안전망. WinningPattern 에 `tonePatterns Json?` 추가, IngestionJob 의 LLM 추출 step, prompts/turn.ts 동적 주입, Inspector 8번째 lens `voice`, ud-brand-voice skill 진화.
2. **출처 신뢰도 tier** (2순위) — HBR/SSIR/Stanford SI/Skoll/Triplelight = high, 일반 미디어 = medium, 블로그 = low, 내부 = internal. ContentAsset 에 `sourceTier` 컬럼.
3. **외부 인사이트 → ContentAsset 자동 파이프라인** (3순위) — 기존 `src/lib/ingest/web-ingester.ts` + `admin/content-hub/ingest` 재활용. Playwright/RSS crawl → IngestionJob → ExtractedItem → review queue → 승인 → ContentAsset 자동 생성.
4. **신규 콘텐츠 자동 제안 trigger** (4순위) — 약점 lens 거절률 ≥ 60% → 콘텐츠팀 알림. 1·2·3 누적 후 자연스러움.
5. **Coach 학습 루프** (중간) — AssetUsage 패턴 재사용으로 CoachUsage 모델 추가. coach-recommender 의 historyScore (현재 5% 가중치, 거의 작동 X) 가 실제 수주 결과로 대체.
6. **API surface v1** (장기 R&D) — `/api/v1/assets/search`, `/v1/coaches/recommend`, `/v1/research/auto`, `/v1/impact/forecast` → Zod → OpenAPI 자동 export.

### 4. 데이터 아카이브 HTML 분석 — 보석 발견

사용자가 공유한 `Data Labs._데이터 아카이빙 대시보드_0522.html` (504KB, 8488 lines) 는 단순 dashboard 가 아니라 **2023~2026 전사 사업 30건 의 정제된 메타데이터**.

**구조**:
- **STAGES 16개**: S00 계약서 ~ S15 총괄시트 (사업 라이프사이클 산출물 폴더)
- **SECTORS 7개**: 창업·로컬·SME·문화·MICE·AI·글로벌
- **PORTFOLIOS 9개**: 오더메이드·FinACT·Action AI·아웃바운드·인바운드·SME AX·언더우먼·지역상품·기타
- **BIZ_MINOR 15개**: 더 fine-grained 분류 (창업 교육·행사·박람회·온라인, 인사이트 트립, 등)
- **BIZ_STAGES 3개**: sales/presales/ops
- **OCCUPANCY 3개**: won_ops/unwon_sales/unwon_plan
- **PROJECTS 30건**: 각각 code·name·year·client·sector·portfolio·bizstage·country·status·stage·files·partner·docs(연도별 문서유형)
- **PROJECT_META 30건**: pm·group·minor·target·ps(진행상태)
- **PROJECT_DESC 30건**: **사업 설명 + 성과 + 후속 사업 자연어 연관성** — 톤 학습 ideal source
- **PROJECT_AMOUNTS / PROJECT_PERIODS**: 예산 (VAT 포함) + 시작·종료

**핵심 발견**:
- PROJECT_DESC 의 "후속 SK이노 협력사 온보딩(SM-2026-004)의 레퍼런스가 되었습니다" 같은 **후속 사업 연관성 자연어** 가 WinningPattern → next-WinningPattern 의 propagation chain.
- 30건 중 **결과보고서까지 도달한 (stage=15·status=won) 완료 사업이 다수** — 즉시 학습 데이터.
- **PM × Group × Sector × Outcome 매트릭스** — 즉시 Coach 학습 루프 (3.5) 의 시드 데이터.

### 5. 결정 — Wave V 잔여 → Wave W (ADR-017) → 데이터 아카이브 import

사용자 확정:
> "ADR-015 F4·F5 마무리하고 Part 3.1·2.2 (Wave W ADR) 진행하자"
> "HTML 제대로 분석해보고 추가 반영할 부분 알려줘"

순서:
1. **Wave V F4** (담당자 질문 차등화) — 단독 PR
2. **Wave V F5** (5 Stage 완전 통합 + AI 자동 60% 채움) — 가장 큰 변경, 신중히
3. **Wave W (ADR-017)** — 톤 자산화 + WinningPattern 활용 + (선택) 데이터 아카이브 import
4. 데이터 아카이브 import 는 Wave W 의 **첫 번째 마일스톤** 으로 자연스럽게 흡수 — 30건 PROJECT_DESC 가 WinningPattern.snippet 초기 시드, STAGES 16개가 ContentAsset stageHint 차원

## 내가 틀렸던 것

- **"AssetUsage 가 학습 안 한다"** 라고 짐작했는데 실제로는 Laplace + 시간감쇠 + techScore 가중까지 정교하게 구현되어 있었다. 코드 안 보고 추측한 부분.
- **"WinningPattern 이 활용되고 있다"** 고 가정했는데 dead asset 이었다. 사용자가 명확히 강조한 비전인데 가장 안 활용된 자산이 가장 비전 핵심이라는 mismatch.
- **첫 Explore agent 의 보고서를 일부 그대로 옮기려 했음** — `/admin/content-hub` 없다는 잘못된 단언. 사용자 CLAUDE.md 와 충돌하는 주장은 반드시 직접 ls 로 확인해야 함.

## 내가 맞았던 것

- **자산 매칭의 이중 트랙 가설** 은 맞았다. PM 이 S1/S3 다른 순위에 혼란스러워 했던 부분의 원인.
- **외부 크롤링 전에 톤 자산화 먼저** 라는 우선순위. HBR/SSIR 톤이 섞이기 전에 언더독스 톤을 명시화해야 정체성 유지된다는 직관.
- **데이터 아카이브 HTML 의 학습 가치 극대** 판단. 사용자가 단순 dashboard 공유로 보였지만 실제로는 정제된 학습 시드 30건.

## 잃은 것 / 감수한 것

- **Wave V F4·F5 가 끝나기 전까지 Wave W 시작 X** — 패러다임 통합 (F5) 가 끝나야 톤 자산화의 surface (Inspector voice lens) 를 정확히 끼울 수 있음. F4·F5 = 7~12일 추정.
- **데이터 아카이브 import 를 ADR-017 안으로 흡수** → 별도 ADR-018 가 안 됨. 만약 import 스케일이 커지면 (예: 16 stage 폴더별 실파일 import 시 GB 단위), 나중에 ADR 분리 필요.
- **HTML 의 PROJECT_AMOUNTS / PROJECT_PERIODS 는 추정값** — `mkDocs(scale, bias)` helper 도 합성 분포. 실제 사업의 정확한 회계 데이터가 아니라 representative sample. import 시 "이것은 historical proxy" 라는 메타데이터 명시 필요.

## 다음에 또 할 일 (이 상황 재발 시)

- [ ] **이전 세션 요약 그대로 받아들이지 말 것** — 4개 보정점이 나온 것처럼 ground-truth 검증을 항상 먼저.
- [ ] **Explore agent 결과 cross-check** — 사용자 CLAUDE.md / ROADMAP 과 충돌하는 단언은 1회 직접 검증.
- [ ] **사용자가 "분석해줘" 라며 공유한 파일** — dashboard/html 도 데이터 모델로 보기. 표면이 UI 라고 데이터가 단순한 게 아님.
- [ ] **dead asset (WinningPattern) 발견 시 즉시 ADR 후보** 로 기록. 스키마만 있고 활용 0 = 가장 큰 leverage.

## 신입에게 전할 말 (교육자료 씨앗)

> 코드는 매번 빠르게 진화한다. 어제의 "이것은 미구현" 이 오늘은 "이미 됐는데 사용 안 함" 일 수 있다. 매번 직접 grep + ls + read 하라. Memory 와 CLAUDE.md 는 시작점일 뿐 결론이 아니다.
>
> 그리고 사용자가 "그냥 자료 공유야" 라며 보낸 파일도 정독하라. 거기에 시스템의 다음 1년치 학습 데이터가 들어있을 수 있다.

## 연결

- 이 journey 에서 나온 ADR: ADR-017 (Wave W — 톤 자산화 + WinningPattern 활용)
- 검증된 ADR: ADR-015 (Wave V — F0~F3+F1.5 완료, F4·F5 잔여)
- 입력 데이터: `Data Labs._데이터 아카이빙 대시보드_0522.html` (사용자 Downloads)
- 변경된 문서:
  - `docs/decisions/017-wave-w-tone-asset-winning-pattern.md` (신규)
  - `ROADMAP.md` (Wave W 추가 — 다음 PR)
  - `CLAUDE.md` (명명 사전에 Wave W 추가 — 다음 PR)
- 관련 커밋:
  - `44c23c3` F3 AI 자동 리서치
  - `f20ef4c` F2 커리큘럼·예산 시드
  - `70ff734` F1 코치 자동 추천
  - `974bfd0` F0 5 Stage skeleton + feature flag
  - `0a1aeb5` ADR-015 작성
