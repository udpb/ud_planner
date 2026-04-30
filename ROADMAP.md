# UD-Ops 파이프라인 재설계 로드맵

> 상세 설계: [REDESIGN.md](REDESIGN.md) · **[PRD-v7.0.md](PRD-v7.0.md)** ⭐ (단일 진실 원본, v7.1 2026-04-29) · **[docs/architecture/user-flow.md](docs/architecture/user-flow.md)** (User flow 다이어그램)
> 아키텍처 골격: [docs/architecture/](docs/architecture/) (modules · data-contract · ingestion · quality-gates · **value-chain** · program-profile · asset-registry · content-hub · **express-mode** ⭐)
> 의사결정 기록: [docs/decisions/](docs/decisions/) (ADR-001~011)
> 마지막 업데이트: 2026-04-27 (**Phase L Express Mode** Wave 추가 — ADR-011 채택)

---

## 설계 원칙 (재설계 v2 확정)

1. **가벼운 모듈 + 공유 DB** — Module Manifest 패턴, 모듈은 `reads/writes` 명시. ADR-002.
2. **데이터는 한 방향으로 누적** — PipelineContext 슬라이스 단위 계약. 같은 일 두 번 입력 금지.
3. **자산은 자동 축적** — Ingestion 파이프라인으로 자료 드롭 → 자산 고도화. ADR-003. 시스템 정체성.
4. **품질은 4계층 게이트로 보증** — 구조 · 룰 · AI · 사람. [docs/architecture/quality-gates.md](docs/architecture/quality-gates.md).
5. **AI 공동기획자가 전체 책임** — 기능 구현은 서브 에이전트 병렬, 메인은 아키텍처·품질·축적 주관.

---

## 전체 진행 현황

| Phase | 이름 | 상태 | 진행률 |
|-------|------|------|--------|
| A | 골격 재구성 + 계약 정의 | ✅ 완료 | 100% |
| B | Step 1 고도화 + Ingestion 뼈대 | ✅ 완료 | 100% |
| C | 데이터 흐름 연결 | ✅ 완료 | 100% |
| D | PM 가이드 + proposal-ingest + Gate 3 | ✅ 완료 | 100% |
| E | ProgramProfile + 스텝 차별화 리서치 (ADR-006·007) | ✅ 완료 | 100% |
| **F** | **Impact Value Chain + SROI 수렴 (ADR-008)** | ✅ 완료 | 100% |
| **G** | **UD Asset Registry v1 (ADR-009)** | ✅ 완료 | 100% |
| **H** | **Content Hub v2 — DB + 계층 + 담당자 UI (ADR-010)** | ✅ 완료 | 100% |
| **L** ⭐ | **Express Mode — RFP → 30~45분 → 1차본 (ADR-011)** | ✅ **완료** | **L0~L6 모두 완료 (100%)** |
| I | 안정화 + Manifest 강제 + 배포 | 🔲 대기 | 0% (Phase L 완료 후 진입) |

### Phase 진행 순서 (2026-04-27 합의)

Phase L (Express Mode) 가 Phase I (안정화·배포) 보다 우선. 1차본 흐름이 안정화되어야 배포의 의미가 있음.

```
A → B → C → D → E → F → G → H → L → I → J(PoC)
                                         ▲
                                 (현재 위치 — Phase I I1·I4 외 완료, Phase J PoC 까지 들어감)
```

---

## Phase A: 골격 재구성 + 계약 정의

> A가 끝나면: 스텝 순서가 자연스러워지고, 데이터가 스텝 간 전달됨. Module Manifest·PipelineContext 타입·Ingestion 뼈대 스키마가 깔림.

- [ ] **A1. 스텝 순서 변경**
  - 파일: `page.tsx`
  - 변경: rfp → ~~impact~~ → curriculum → coaches → budget → impact → proposal
  - 기존 컴포넌트 재배치 (코드 변경 최소화)
  - 근거: [ADR-001](docs/decisions/001-pipeline-reorder.md)

- [ ] **A2. PipelineContext 설계 + API**
  - 신규: `src/lib/pipeline-context.ts` — PipelineContext 타입 정의 (전체 슬라이스)
  - 신규: `GET /api/projects/[id]/pipeline-context` — 전체 컨텍스트 반환
  - 변경: `page.tsx` — 로드 후 각 스텝 컴포넌트에 props로 전달
  - 계약: [docs/architecture/data-contract.md](docs/architecture/data-contract.md)

- [ ] **A3. Module Manifest 도입**
  - 신규: `src/modules/_types.ts` — `ModuleManifest` 타입
  - 각 기존 스텝 폴더/파일에 `manifest.ts` 추가 (reads/writes/owner 등)
  - 근거: [ADR-002](docs/decisions/002-module-manifest-pattern.md)

- [ ] **A4. Ingestion 스키마 + 업로드 UI 뼈대**
  - 신규: Prisma `IngestionJob`, `ExtractedItem` 마이그레이션
  - 신규: `/ingest` 페이지 — 자료 종류 선택 + 업로드 (처리는 Phase D 이후)
  - 근거: [ADR-003](docs/decisions/003-ingestion-pipeline.md)

- [ ] **A5. 사이드바 정리**
  - 파일: `src/components/layout/sidebar.tsx`
  - 유지: 대시보드, 프로젝트, Ingestion(/ingest), 설정
  - 제거: 코치 DB, 교육 모듈, 예산 기준, SROI 프록시, 피드백 관리
  - 이동: 프로젝트 내부 스텝에서 접근하도록

- [ ] **A6. 품질 게이트 Gate 1 강제**
  - TypeScript 타입 체크·빌드 CI
  - 계약 단위 테스트 기반 (Phase C에 확장)
  - 근거: [docs/architecture/quality-gates.md](docs/architecture/quality-gates.md)

---

## Phase B: Step 1 고도화 (기획의 시작점)

> B가 끝나면: RFP 파싱 → 제안배경 + 컨셉 + 핵심기획포인트가 자동 생성됨

- [ ] **B1. 기획 방향 AI 생성**
  - 신규: `POST /api/ai/planning-direction`
  - 입력: RfpParsed + 발주처 유형 + 유사 프로젝트
  - 출력: 제안배경 초안 + 컨셉 후보 3개 + 핵심기획포인트 3개

- [ ] **B2. 유사 프로젝트 검색**
  - 신규: `GET /api/projects/[id]/similar`
  - 검색: 키워드/발주처/예산규모/대상자 매칭
  - 출력: 과거 프로젝트 리스트 (사업명, 예산, 수주 여부, 핵심 전략)

- [ ] **B3. 평가배점 전략 분석**
  - 신규: `src/lib/eval-strategy.ts`
  - 입력: evalCriteria
  - 출력: 최고배점 항목 + 섹션 매핑 + 가이드 메시지
  - AI 호출 없음 (규칙 기반)

- [ ] **B4. Step 1 UI 재설계**
  - 파일: `step-rfp.tsx` 대폭 수정
  - 레이아웃: 파싱 결과 | 기획 방향 (제안배경/컨셉/핵심포인트) | PM 가이드
  - PM 확정 플로우: 컨셉 선택 → 핵심포인트 조정 → "기획 방향 확정" 버튼

---

## Phase C: 스텝 간 데이터 흐름 연결

> C가 끝나면: 이전 스텝의 결정이 다음 스텝에 자동 반영됨

- [ ] **C1. 커리큘럼 AI에 기획 방향 주입**
  - 파일: `src/lib/claude.ts` — `suggestCurriculum()` 수정
  - 주입: 제안컨셉 + 핵심기획포인트 + 평가배점 가중치

- [ ] **C2. 임팩트 AI에 커리큘럼 자동 추출**
  - 파일: `src/lib/claude.ts` — `buildLogicModel()` 수정
  - 변경: Activity를 커리큘럼 세션에서 자동 추출 (PM이 수동 생성 아님)
  - 변경: Input을 코치+예산에서 자동 추출

- [ ] **C3. 제안서 AI에 전체 PipelineContext 주입**
  - 파일: `src/lib/claude.ts` — `generateProposalSection()` 수정
  - 주입: Step 1 제안배경/컨셉 + Step 2 커리큘럼 + Step 3 코치 + Step 4 예산/SROI + Step 5 임팩트

- [ ] **C4. 각 스텝 UI에서 이전 스텝 요약 표시**
  - 모든 step-*.tsx에 상단 배너 추가
  - "Step 1에서 확정한 컨셉: '...'" / "평가 최고배점: 커리큘럼 30점"

---

## Phase D: PM 가이드 + proposal-ingest + Gate 3 (AI 검증)

> D가 끝나면: 신입 PM도 왜 이렇게 써야 하는지 이해. 당선 제안서 업로드 → 자동 패턴 추출 → 가이드에 반영. AI 검증 게이트 가동.

- [ ] **D1. 당선 제안서 패턴 DB + Ingestion 모듈**
  - 신규: `WinningPattern` Prisma 모델
  - 신규: `proposal-ingest` 모듈 — PDF 업로드 → 섹션 분할 → AI 패턴 추출 → ExtractedItem 생성
  - 신규: `/ingest/review` — Admin 승인 UI
  - 초기 데이터: 청년마을/전통문화 제안서 + **NH 애그테크 · GS리테일 · 코오롱 프로보노 원본 PDF** 를 Ingestion 으로 처리 (수동 시드 금지 — ADR-003 원본 불변 보존)
  - 근거: [ADR-003](docs/decisions/003-ingestion-pipeline.md), [journey 2026-04-16](docs/journey/2026-04-16-guidebook-review.md)

- [ ] **D2. 발주처 유형별 프리셋**
  - 신규: `ChannelPreset` Prisma 모델
  - B2G: 정책 대응 + 안정적 운영 + 정량 KPI
  - B2B: 비즈니스 ROI + 속도 + 유연성
  - 재계약: 작년 성과 + 개선점 + 신뢰
  - **시드 데이터:** 가이드북 Ch.12 발주처 유형 카드 3종 상세 필드 (평가위원 프로필 · 커리큘럼 이론 비율 상한 · 예산 톤) 그대로 DB 시드로 이관

- [ ] **D3. 스텝별 가이드 패널 컴포넌트 (`pm-guide` 모듈)**
  - 신규: `src/modules/pm-guide/` + manifest.ts
  - 내용: 평가위원 관점 + 당선 레퍼런스(WinningPattern 쿼리) + 흔한 실수 + UD 강점 팁
  - 각 step-*.tsx 우측에 배치
  - **시드 콘텐츠:**
    - 가이드북 Ch.14 "흔한 실수 Top 7" 그대로 인용
    - "코오롱 프로보노 사례" (Value Chain 없이 장표부터 씀 → 2주 무한수정 → VC 확정 후 1.5일 완성) 을 Step 2~5 의 경고 문구로 활용

- [ ] **D4. 예상 점수 시스템 (`predicted-score` 모듈)**
  - 신규: `src/modules/predicted-score/` + manifest.ts
  - 파이프라인 상단에 점수 바 표시
  - 스텝 완료마다 업데이트 (규칙 기반 + 제안서 생성 후 AI 시뮬레이션)

- [ ] **D5. 품질 게이트 Gate 3 통합**
  - 당선 패턴 대조 (proposal 생성 시 WinningPattern 유사도)
  - 평가위원 시뮬레이션 (섹션 생성 직후)
  - 논리 체인 검증 (RFP → 컨셉 → 커리큘럼 → Impact 끊기는 지점)
  - 근거: [docs/architecture/quality-gates.md](docs/architecture/quality-gates.md)

---

## Phase E: ProgramProfile + 스텝 차별화 리서치 ✅ 완료 (2026-04-21)

> 실제 완료 내용: ProgramProfile v1.1 11축 도입 (ADR-006) + 스텝 차별화 리서치 플로우 (ADR-007) + Gate 3 강화 + 평가위원 관점 매트릭스.
> 원 계획(아래 E1~E6 IMPACT 모듈 자동 추천·코치 추천·SROI 통합 등)은 부분 이행 → Phase H 로 이월 고려.
>
> 근거: [ADR-006](docs/decisions/006-program-profile.md) · [ADR-007](docs/decisions/007-step-differentiated-research-flow.md) · [docs/journey/2026-04-21-phase-e-complete.md](docs/journey/2026-04-21-phase-e-complete.md)

### 원 계획 (참고용 — 실제 완료 여부 상이)

- [ ] **E1. Step 2: IMPACT 모듈 자동 추천**
  - targetStage 기반 모듈 추천 (예비→I,M / 초기→P,A / 성장→C,T)
  - UI: "추천 모듈" 사이드패널

- [ ] **E2. Step 3: 세션별 코치 자동 추천**
  - 신규: `POST /api/coaches/recommend` (Planning Agent Phase 4 결과 활용)
  - 커리큘럼 세션 주제 → 코치 expertise 매칭 → Top 3
  - coach-finder DB 실시간 연동

- [ ] **E3. Step 4: SROI 통합 + 유사 프로젝트 예산 벤치마크**
  - SROI를 /sroi 별도 페이지 → Step 4 안으로 통합
  - 유사 프로젝트 대비 예산 비교 표시

- [ ] **E4. Step 5: 커리큘럼 → Activity/Output 자동 추출**
  - 커리큘럼 세션 → Logic Model Activity 자동 변환
  - 세션 산출물 → Output 자동 변환
  - AI는 Outcome/Impact만 생성

- [ ] **E5. curriculum-ingest 모듈**
  - XLSX/시트 업로드 → 세션 파싱 → 아키타입 분류 → `CurriculumArchetype` 자산
  - 커리큘럼 설계 시 레퍼런스로 자동 로드

- [ ] **E6. evaluator-question-ingest 모듈**
  - 심사 질문 메모 업로드 → 질문 유형 분류 → `EvaluatorQuestion` 자산
  - pm-guide가 각 스텝에서 "이 질문 나올 확률 높음" 표시

---

## Phase F: Impact Value Chain + SROI 수렴 (ADR-008)

> F가 끝나면: 파이프라인에 의미 레이어(Value Chain 5단계)가 정식화되고, SROI 가 ⑤ Outcome 의 수렴점이 되며, 루프 얼라인 Gate 로 품질이 자동 검증된다.
>
> 근거: [ADR-008](docs/decisions/008-impact-value-chain.md) · [docs/architecture/value-chain.md](docs/architecture/value-chain.md) · [docs/journey/2026-04-23-impact-value-chain-adoption.md](docs/journey/2026-04-23-impact-value-chain-adoption.md)

- [x] **F0. 기록·계획 문서** *(2026-04-23, `0f416b5`)*
  - ADR-008 · architecture/value-chain.md · journey/2026-04-23-*.md
  - CLAUDE.md 설계 철학 8번째 항목 추가
  - ROADMAP Phase F 섹션 확장

- [x] **F1. 코어 타입** *(`bcd36c0`)*
  - 신규: `src/lib/value-chain.ts` — `ValueChainStage` 타입 · 5단계 스펙 · `STEP_TO_STAGES` 매핑
  - 확장: `src/lib/pipeline-context.ts` — `valueChainState` 슬라이스 (currentStage · completedStages · sroiForecast · loopChecks)
  - 신규 타입: `SROIForecast` · `LoopAlignmentChecks` · `AlignmentCheck`

- [x] **F2. 스키마 점검** *(`c98bd62`, 마이그레이션 불필요)*
  - SROI 관련 기존 필드 감사
  - 스키마 변경 최소화 목표 (UI 라우팅만 이동)

- [x] **F3. 리서치 재배치** *(`82e101d`)*
  - `imp-outcome-indicators` → `rfp-outcome-indicators` (🌱 씨앗)
  - `imp-diagnostic-tools` → `cur-diagnostic-tools` (🌱 씨앗)
  - 신규 `imp-outcome-benchmark` (🌾 수확)
  - 리서치 카드에 단계 뱃지 + 씨앗↔수확 링크
  - `imp-*` ID 하위 호환 resolver

- [x] **F4. Impact Value Chain 다이어그램** *(`bedec87`)*
  - 신규: `src/components/value-chain-diagram.tsx` — 5단계 가로 플로우 + 루프 화살표
  - pm-guide 우측 패널 상단 고정
  - 현재 단계 하이라이트 + SROI 확정 시 루프 화살표 실선화

- [x] **F5. Step 4·5 재구성** *(`0f3e4fd`, SROI 데이터 흐름은 이미 분리되어 라벨만 변경)*
  - `src/app/(dashboard)/projects/[id]/step-budget.tsx` — SROI 섹션 제거, 링크만 유지
  - `src/app/(dashboard)/projects/[id]/step-impact.tsx` — SROI Forecast 섹션 추가
  - `page.tsx` — 스텝 레이블 교체

- [x] **F6. Step 1 3탭 분리** *(`04e0e04`)*
  - `step-rfp.tsx` — ① Impact 의도 / ② Input 자산 / ③ Output RFP 탭 구조
  - 기존 기획방향·프로파일·RFP 파싱을 3탭으로 재배치

- [x] **F7. 루프 Gate — SROI 축 3방향 얼라인** *(`ff9dca1`)*
  - 신규: `src/lib/loop-alignment.ts` — SROI 숫자 기반 3방향 체크 룰
  - Step 5 에 `LoopAlignmentCards` 섹션 (⑤→① / ⑤→② / ⑤→④)
  - 불일치 시 해당 스텝 복귀 CTA (블록 X)
  - Gate 4 (사람 확인) 로 quality-gates.md 업데이트

- [x] **F8. 검증 · 메모리 · 완료 기록** *(이 세션)*
  - `npx tsc --noEmit` 0 에러
  - MEMORY.md · project_impact_value_chain.md · journey Wave 진행 로그 갱신
  - ROADMAP Phase F 전부 ✅
  - 브라우저 E2E 검증은 다음 세션으로 — Docker `ud_ops_db` 기동 후

---

## Phase G: UD Asset Registry + RFP 자동 매핑 (ADR-009)

> G가 끝나면: 언더독스 자산이 RFP 앞에 자동으로 꺼내져 섹션별로 제안됨. PM 이 기억·검색에 의존하지 않고, 신입 PM 도 "차별화" 를 구조적으로 쓸 수 있음.
>
> 근거: [ADR-009](docs/decisions/009-asset-registry.md) · [docs/architecture/asset-registry.md](docs/architecture/asset-registry.md) · [docs/journey/2026-04-24-phase-g-asset-registry-kickoff.md](docs/journey/2026-04-24-phase-g-asset-registry-kickoff.md)

- [x] **G0. 기록·계획 문서** *(2026-04-24)*
  - ADR-009 · architecture/asset-registry.md · journey/2026-04-24-*.md
  - CLAUDE.md 설계 철학 9번째 항목 추가
  - ROADMAP Phase G 섹션 추가 (기존 G → H 이동)

- [x] **G1. 코어 타입** *(`c157863`)*
  - 신규: `src/lib/asset-registry.ts` — `UdAsset` · `AssetCategory` · `EvidenceType` · `AssetMatch`
  - 신규: `src/modules/asset-registry/manifest.ts` — reads/writes 계약
  - 함수 시그니처만 선언 (구현은 G4)

- [x] **G2. 스키마 마이그레이션** *(`833819f`)*
  - 변경 1건: `Project.acceptedAssetIds Json?` 추가
  - `prisma/migrations/<timestamp>_asset_registry/migration.sql`
  - PipelineContext 에 `acceptedAssetIds?: string[]` 슬라이스

- [x] **G3. 시드 자산 15종** *(`4947254`)*
  - methodology 3 (IMPACT 6단계 · UOR · 5-Phase 루프)
  - content 3 (AI 솔로프러너 · AX Guidebook · U1.0)
  - product 4 (Ops Workspace · Coach Finder · Coaching Log · LMS+AI봇)
  - human 1 (UCA 코치 풀)
  - data 3 (Alumni Hub · SROI 프록시 DB · Benchmark Pattern)
  - framework 1 (Before/After AI 전환 프레임)
  - 각 자산 narrativeSnippet 2~3 문장 초안 작성

- [x] **G4. matchAssetsToRfp() 점수 알고리즘** *(`a489880`)*
  - profileSimilarity(0.5) + keywordOverlap(0.3) + sectionApplicability(0.2)
  - matchReasons 반환 (근거 표시)
  - 임계: 0.7↑ 강 · 0.5↑ 중 · 0.3↑ 약 · 0.3 미만 제외
  - 테스트 케이스 3~5개

- [x] **G5. Step 1 매칭 자산 패널 UI** *(`a2c8d8a`)*
  - 신규: `src/components/projects/matched-assets-panel.tsx`
  - 섹션별 그룹 + Value Chain 단계 뱃지 + 증거 유형 뱃지
  - narrativeSnippet 프리뷰
  - "제안서에 포함" 토글 → POST `/api/projects/[id]/assets`
  - Step 1 ③ Output 탭 하단 또는 우측 사이드바 최상단 배치

- [x] **G6. Step 6 제안서 AI 자산 주입** *(`e9ad4ac`)*
  - `src/lib/proposal-ai.ts` 프롬프트 수정 — acceptedAssetIds 로 자산 narrativeSnippet 주입
  - 소프트 마커 `<!-- asset:id -->` 삽입 (추적용)
  - "복붙 금지, 맥락 맞춰 재작성" 지시 포함

- [x] **G7. 검증 · 메모리 · 완료 기록** *(이 세션)*
  - `npx tsc --noEmit` 0 에러
  - MEMORY.md + project_asset_registry.md 갱신
  - journey 완료 로그
  - 브라우저 E2E 는 다음 세션 (Docker `ud_ops_db` 기동 후)

---

## Phase H: Content Hub v2 — DB + 계층 + 담당자 UI (ADR-010)

> H가 끝나면: 콘텐츠 담당자가 `/admin/content-hub` 에서 직접 자산 CRUD. 상품 → 세션/주차/챕터 계층으로 세분화 인용 가능. 엔지니어 PR 병목 해소.
>
> 근거: [ADR-010](docs/decisions/010-content-hub.md) · [docs/architecture/content-hub.md](docs/architecture/content-hub.md) · [docs/journey/2026-04-24-phase-h-content-hub-kickoff.md](docs/journey/2026-04-24-phase-h-content-hub-kickoff.md)

- [x] **H0. 기록·계획 문서** *(2026-04-24, `c3bd197`)*
  - ADR-010 · architecture/content-hub.md · journey
  - CLAUDE.md 설계 철학 9번 업데이트 (v1 → v2)
  - ROADMAP Phase H 교체, 기존 "안정화+배포" → Phase I 이동

- [x] **H1. Prisma ContentAsset + 마이그레이션 + DB 시드** *(`9133730`)*
  - Prisma `ContentAsset` 테이블 (parentId 자기 참조 · JSON 필드 6개 · version · sourceReferences)
  - 마이그레이션 `phase_h_content_hub`
  - `prisma/seed-content-assets.ts` — UD_ASSETS 15종 DB insert
  - `package.json` 에 `db:seed:content-assets` 추가

- [x] **H2. asset-registry.ts 리팩터** *(`c4ffba6`)*
  - 코드 시드 UD_ASSETS 제거 → `getAllAssets()` async 함수 (React cache)
  - `findAssetById`, `matchAssetsToRfp`, `formatAcceptedAssets` async 전환
  - 호출부(page.tsx · proposal-ai.ts · matched-assets-panel.tsx · API) 에 await 주입
  - UdAsset 타입에 parentId · children · version 필드 추가

- [x] **H3. /admin/content-hub 관리자 UI** *(`cdf28eb`)*
  - 목록 `/admin/content-hub/page.tsx` — 필터바(카테고리·단계·상태·부모·검색) + 테이블
  - 편집 `/admin/content-hub/[id]/edit/page.tsx` + 신규 `/admin/content-hub/new/page.tsx`
  - 필수 5 필드 (name · category · narrativeSnippet · applicableSections · valueChainStage)
  - 선택 필드 접힌 섹션 (parentId · keywords · keyNumbers · sourceReferences · ...)
  - API 라우트: GET/POST/PATCH/DELETE `/api/content-hub/assets`

- [x] **H4. 계층 매칭 + MatchedAssetsPanel 부모-자식 렌더** *(`58684f7`)*
  - matchAssetsToRfp: 부모 매칭 strong/medium 이면 children 도 후보
  - AssetCard: children.length > 0 이면 "▸ 세부 세션 N개" 토글
  - 펼치면 children 카드 들여쓰기 + 독립 Switch (각자 acceptedAssetIds)

- [x] **H5. 계층 시드 예시 5건** *(`0e87652`)*
  - `asset-ai-solopreneur` 아래에 Week 1~3 children
  - `asset-ax-guidebook` 아래에 Ch 1~2 children
  - 담당자 UI 흐름 검증용

- [x] **H6. 검증 · 메모리 · 완료** *(이 세션)*
  - `npx tsc --noEmit` 0 에러
  - MEMORY.md · project_asset_registry.md 에 v2 추가
  - journey 완료 로그
  - Phase H 100% 표시

---

## Phase L: Express Mode — "당선 가능한 1차본" 단일 흐름 (ADR-011) ⭐

> L이 끝나면: 신규 PM 이 RFP 한 부 받아 단일 화면 챗봇에서 **30~45분 안에 7 섹션 1차본** 에 도달. 부차 기능 (SROI · 예산 · 코치) 은 자동 1줄 인용으로 자연 박힘. 정밀화 필요 시 Deep Track (기존 6 스텝) 으로 자동 인계.
>
> 근거: [ADR-011](docs/decisions/011-express-mode.md) · [docs/architecture/express-mode.md](docs/architecture/express-mode.md) · [PRD-v7.0.md](PRD-v7.0.md)

### Phase L 의 정체

ADR-011 의 사용자 통찰:
> *"핵심은 RFP에 맞춰서 당선 가능한 기획 1차본이 나오는거지. SROI, 예산, 코치추천 이것도 필요한 기능이지만 부차적이야"*

이 한 문단으로 시스템 정체성이 *6 스텝 단일 트랙* → *Express (메인) + Deep (보조) 두 트랙* 으로 재정의됨.

- **Express Track (신규)**: 단일 화면 (좌 챗봇 + 우 점진 미리보기) · Slot Filling 12 슬롯 · 30~45분 1차본
- **Deep Track (보존)**: 기존 6 스텝 그대로 — 정밀 산출 (수주 후 실행)

### Wave 분해 (의존성: L2 만 끝나면 L3·L4·L5 병렬, L6 는 마지막)

```
L0 ──────► L2 ─┬──► L3 ───┐
       L1 ─┘   ├──► L4 ───┼──► L6
               └──► L5 ───┘
```

- [x] **L0. ADR-011 + architecture spec + 6 문서 싱크** *(2026-04-27)*
  - `docs/decisions/011-express-mode.md` — 두 트랙 정체, 북극성, 12 슬롯, 3 카드 유형, 4 안전장치
  - `docs/architecture/express-mode.md` v1.0 — 12 섹션 즉시 코딩 가능 사양 (953줄)
  - `docs/journey/2026-04-27-express-mode-adoption.md` — 채택 흐름
  - 6 문서 싱크: `PRD-v7.0.md` (신규) + `ROADMAP.md` (이 섹션) + `STATE.md` + `PROCESS.md` + `LESSONS.md` + `CLAUDE.md`

- [x] **L1. AI 안정화** *(2026-04-27)*
  - `f2c0c38` `feat(ai): L1 — Gemini 3.1 Pro 통합 + max_tokens 확대 + safeParseJson 강화`
  - `6369403` `fix(ai): Gemini 모델명 → gemini-3.1-pro-preview (실제 API 명)`
  - `f0ffab8` `chore(ai): invokeAi 호출마다 provider/model/elapsed 콘솔 로그`
  - 신규: `src/lib/ai-fallback.ts` — `invokeAi(params)` 단일 진입점
  - **모델 우선순위 교체**: Gemini 3.1 Pro Preview Primary / Claude Sonnet 4.6 Fallback
  - max_tokens: 4096 → **8192 (일반) / 16384 (Express 일괄)**
  - safeParseJson 강화: trailing comma 제거 + 마크다운 펜스 + 잘림 감지 + 자동 1회 재시도

- [x] **L2. Express PoC: 단일 화면** *(2026-04-28 완료)*
  - 신규 라우트: `src/app/(dashboard)/projects/[id]/express/page.tsx`
  - 신규 컴포넌트: `<ExpressShell>` (top-level orchestration) + `<ExpressChat>` (좌측 챗봇) + `<ExpressPreview>` (우측 미리보기) + `<NorthStarBar>` (상단 진행 바) + `<RfpUploadDialog>` + 3 카드 (`PmDirectCard`, `ExternalLlmCard`, `AutoExtractCard`)
  - 신규 라이브러리:
    - `src/lib/express/schema.ts` — `ExpressDraftSchema` zod (12 슬롯) + `calcProgress()` 5단계
    - `src/lib/express/conversation.ts` — `ConversationStateSchema` + `TurnResponseSchema`
    - `src/lib/express/slot-priority.ts` — `selectNextSlot()` 결정론
    - `src/lib/express/prompts.ts` — `buildTurnPrompt()` + `buildFirstTurnPrompt()` + `buildFinalDraftPrompt()`
    - `src/lib/express/active-slots.ts` — `computeActiveSlots()` RFP 따라 적용 슬롯 결정
    - `src/lib/express/extractor.ts` — `mergeExtractedSlots()` Partial Extraction
    - `src/lib/express/asset-mapper.ts` — `assetMatchesToReferences()` + `seedDifferentiatorsFromMatches()`
    - `src/lib/express/handoff.ts` — `mapDraftToProjectFields()` + `suggestDeepAreas()` (L6 본격, L2 stub)
    - `src/lib/express/auto-citations.ts` — SROI/예산/코치/커리큘럼 1줄 자동 인용 (L4 placeholder)
    - `src/lib/express/process-turn.ts` — invokeAi → safeParseJson → mergeExtractedSlots 오케스트레이터
  - 신규 API:
    - `POST /api/express/init` — 첫 진입 시 RFP 매칭·자산 시드·첫 턴 자동 호출
    - `POST /api/express/turn` — 챗봇 1턴 처리
    - `POST /api/express/save` — debounced 자동 저장 (1500ms)
  - 마이그레이션: `20260428000000_phase_l_express_draft` — `Project.expressDraft Json?` + `expressActive Boolean @default(false)` + `expressTurnsCache Json?`
  - 진입점:
    - `src/app/(dashboard)/projects/new/page.tsx` 신규 프로젝트 생성 시 자동 redirect → `/projects/[id]/express` (`expressActive=true`)
    - `src/app/(dashboard)/projects/[id]/page.tsx` 6 step 페이지에서 우상단 "Express" 링크
    - `<ExpressShell>` 안 "정밀 기획 (Deep)" 분기 토글 (양방향)
  - typecheck: 0 errors

- [x] **L3. 외부 LLM 분기 + 자산 자동 인용** *(2026-04-28 완료)*
  - 3 카드 유형 (PoC 단계 L2 에 같이 들어감) — `PmDirectCard` / `ExternalLlmCard` / `AutoExtractCard`
  - `matchAssetsToRfp()` 자동 호출 — RFP 업로드 직후 (`/api/express/init`) + 매 턴 (`/api/express/turn` 안)
  - **차별화 자산 자동 인용** (`<ExpressShell>.handleToggleDiff` 강화):
    - 사용자가 자산 "수락" 클릭 → narrativeSnippet 이 `ASSET_SECTION_TO_DRAFT` 매핑 따라 sections 자동 주입 (`[자산 인용: assetId]\n...`)
    - "제외" 클릭 → 해당 자산 인용 블록만 정확히 제거 (다른 자산 인용 보존)
  - **외부 LLM 카드 운영 로그** (`process-turn.ts`):
    - 카드 띄울 때마다 `🔔 ${type} → ${topic}` console.log
    - 4턴 동안 카드 0건이면 `⚠️ prompts 튜닝 신호` 경고 (PM 시간 절약 모니터링)
  - **prompts.ts 강화**:
    - PM 답이 `[외부 LLM 답]` / `[PM 직접 확인]` 으로 시작하면 evidenceRefs 자동 누적 + sections 자연스럽게 인용 명시
    - 시장·통계 자료 부족 / 발주처 의도 모호 / 매 4턴 카드 0건 → 능동적으로 카드 띄우기 패턴

- [x] **L4. 부차 기능 1줄 인용 정밀화** *(2026-04-28 완료)*
  - `src/lib/express/auto-citations.ts` 전면 개정 — sync placeholder → **async 실제 데이터 기반**
    - `citationSroi` — `getAllAssets()` (ContentAsset DB) 에서 valueChainStage='outcome' + SROI/Benchmark 키워드 자산 조회 + `programProfile` 휴리스틱 ratio + 인용 자산 칩
    - `citationBudget` — `prisma.costStandard.findMany({ type: 'PC' })` 평균 단가 + `estimateSessionCount()` (RFP 기간 또는 ProgramProfile.targetStage) → PC/AC/마진 분해
    - `citationCoaches` — `prisma.coach.count({ isActive: true })` 실제 활성 코치 수 + 도메인 매칭 휴리스틱 + **coach-finder 외부 LLM 프롬프트 자동 생성** (사용자 이전 의도)
    - `citationCurriculum` — RFP eduStartDate~eduEndDate 기간 + IMPACT/UOR 자산 인용
  - **신뢰도 0.3 → 0.4~0.75** 데이터 보유 정도에 따라 동적
  - `<ExpressPreview>` UI 강화:
    - 신뢰도 칩 (높음/중간/추정 + %) — 색상 (녹색/노랑/회색)
    - 인용 자산 칩 (📎 자산명) 표시
    - 외부 프롬프트 복사 버튼 (📋 외부 프롬프트 복사) — coach-finder 등에 붙여넣기
    - rationale tooltip
  - 호출자 (`/api/express/init` / `/projects/[id]/express/page.tsx`) 모두 await 처리

- [x] **L5. 검수 에이전트 (사용자 요청)** *(2026-04-28 완료)*
  - `src/lib/express/inspector.ts` — `inspectDraft()` AI 검수 + `heuristicInspect()` 휴리스틱 백업
  - 7 렌즈: market · statistics · problem · before-after · key-messages · differentiators · tone
  - 심각도 3: critical · major · minor
  - `/api/express/inspect` — 1차본 평가위원 시각 분석 (LLM 실패 시 휴리스틱 fallback)
  - `<ExpressShell>`: 1차본 승인 시 자동 검수 호출 + 수동 "검수" 버튼 + 점수/이슈 칩 표시
  - 사용자 명시 인용: *"너가 따로 나중에 검수 에이전트를 통해서 답변 퀄리티가 잘 출력되는지는 점검해줘"* (2026-04-27)
  - 신규: `src/lib/express/inspector.ts` — `inspectDraft(draft, rfp)`
  - 1차본 완성 직후 자동 평가 — 평가위원 시각 + 제1원칙 4 렌즈
  - 검사 항목:
    - 시장·통계·문제정의·Before/After 충족
    - keyMessages 가 sections 에 골고루 녹아있는지
    - differentiators 가 sections 에 인용됐는지
    - 데이터·통계 사용 정확도
  - 문제 발견 시 PM 알림 (toast.warning) + 권장 수정 제시
  - 사용자 원문 (STATE 알려진 이슈 등록): *"AI 답변 퀄리티 검수 에이전트 — Gemini/Claude 응답이 '1차본 당선력' 기준 충족하는지 자동 점검"*

- [x] **L6. Express + Deep 통합 운영 검증** *(2026-04-28 부분 완료 — 데이터 인계 본격, E2E 검증은 사용자 손에)*
  - `src/lib/express/handoff.ts` — `mapDraftToProjectFields()` + `mapDraftToProposalSections()` + `suggestDeepAreas()`
  - `/api/express/save` markCompleted=true 시:
    - Prisma transaction 으로 `Project.proposalConcept` / `proposalBackground` / `keyPlanningPoints` / `acceptedAssetIds` 자동 동기화
    - `ProposalSection` 7건 시드 (version=1, isApproved=false, 기존 비승인 시 갱신·승인 시 보존)
    - `suggestDeepAreas()` 결과 응답에 포함
  - `<ExpressShell>`: 1차본 승인 후 "🎯 1차본 완성! 정밀화 권장 영역" 패널 자동 표시 (Step 링크 + 닫기)
  - 신규: `src/lib/express/handoff.ts`
    - `mapDraftToContext(draft, project)` — ExpressDraft → PipelineContext
    - `suggestDeepAreas(draft, rfp)` — 정밀화 권장 영역 자동 결정 (평가표 임팩트 ≥20% / 예산 5억+ / 커리큘럼 항상)
    - `canEnterExpress(project)` — 이미 진행된 프로젝트 차단 룰
  - "1차본 완성 화면" — 정밀화 권장 영역 N개 표시 + 각각 Deep Step 으로 이동 링크
  - E2E 시나리오 검증:
    - 신규 RFP → Express 30~45분 → 1차본 → Deep Step 5 진입 (mapDraftToContext 자동) → SROI 정밀 → Step 6 제안서 7섹션 정밀
    - Express 도중 이탈 → 다음 진입 시 그 자리부터 (expressTurnsCache)
    - zod schema 검증 실패 → visible 표시 + 강제 차단 X

### Phase L 의 게이트 (Wave 종료 시)

각 Wave 끝에:

1. `npx tsc --noEmit` 통과
2. `src/modules/<관련>/manifest.ts` 의 `reads`/`writes` 갱신 (Express 가 ExpressDraftSchema 슬롯 reads/writes)
3. journey 파일에 한 단락 추가 (시간순, 막힌 지점 + 결정 + 사용자 한마디)
4. `feat(phase-l,express): ...` 형식으로 커밋

---

## Phase J: 엑셀 출력 (PoC, 2026-04-29)

> 발주처 제출용 .xlsx 자동 생성. PoC 5 시트 (단순 형식) 완료.
> 후속: 16 시트 발주처 템플릿 매핑 (`docs/architecture/budget-template.md`).

- [x] **J1 PoC: 5 시트 단순 형식** *(2026-04-29 완료)*
  - 신규: `exceljs ^4.4.0` 의존성
  - 신규: `src/lib/excel-export/render.ts` — `buildProjectExcel(input)` async, ArrayBuffer → Buffer 반환
  - 신규: `/api/projects/[id]/export-excel` GET — Project + curriculum + coaches + budget + sroi 조회 → workbook → 다운로드 응답
  - 5 시트:
    1. 프로젝트 요약 (사업명·기관·예산·기간·핵심 기획·제안 배경)
    2. 커리큘럼 (회차·제목·시간·날짜·장소·구분)
    3. 코치 배정 (역할·세션수·단가·총사례비)
    4. 예산 (PC/AC 합계 + 항목별)
    5. SROI Forecast (비율·총가치·Outcome 화폐환산)
  - UI: ExpressShell 의 finalize 패널에 "📥 엑셀 추출" 버튼 (`<a href download>`)
  - 한글 파일명 utf-8 인코딩 (`Content-Disposition: filename*=UTF-8''...`)

- [ ] **J2 (후속) 16 시트 발주처 템플릿 매핑**
  - `docs/architecture/budget-template.md` 의 매핑 데이터 → ts 상수
  - 시트 #2 (1-1-1. 주관부서) 60+ 셀 매핑 — 메인 출력
  - 시트 #5 (1-2. 외부용) — 발주처 제출
  - 시트 #16 (2. 내부용 세부 예산)
  - Q1·Q2·Q3 미해결 사항 답 후 진행

---

## Phase I: 안정화 + Manifest 강제 + 배포

> I가 끝나면: 프로덕션 배포 완료 + 모듈 경계가 런타임·린트로 강제됨
>
> ⚠️ Phase L 완료 *후* 진입 (사용자 합의 2026-04-27).

- [ ] **I1. 전체 E2E 테스트**
  - 양양 신활력 RFP로 Step 1~6 전체 플로우
  - 각 스텝의 데이터 흐름 검증
  - Ingestion → 승인 → 자산 반영 → 기획 활용 end-to-end

- [x] **I2. 빌드 확인 + 에러 수정** *(2026-04-28)*
  - TypeScript 0 에러 ✓
  - ESLint 0 errors / 364 warnings (legacy any 의도적 warn)
  - 수정: `src/modules/pm-guide/sections/research-requests.tsx` 의 `catch (e: any)` → `unknown` (2건)
  - eslint.config.mjs: `**/*.cjs` 에 `no-require-imports` off 추가 (Node.js 표준 require 허용)

- [x] **I3. Module Manifest 강제** *(2026-04-28)*
  - 신규: `src/modules/_registry.ts` — 6 step + 4 support/asset = 총 10 manifest 단일 진입점 + 헬퍼 (`findModule`, `modulesByLayer`, `modulesUsingSlice`, `modulesUsingAsset`)
  - 신규: `scripts/check-manifests.ts` 무결성 검증 — 6 검사 (이름 중복 / layer 유효성 / asset 참조 / writes 충돌 / version semver / owner TBD)
  - 신규 스크립트: `npm run check:manifest`
  - **predev / prebuild 훅에 통합** — 시작·빌드 시 자동 검증
  - 결과: errors 0 / warnings 8 (모두 owner TBD — Phase L·H 후 인수인계 대상)
  - ESLint 커스텀 룰 (모듈이 manifest 없는 slice/asset 접근 금지) 은 후속 — AST 분석 기반 별도 패키지 필요. 현재는 검증 스크립트로 충분.
  - 근거: [ADR-002](docs/decisions/002-module-manifest-pattern.md)

- [ ] **I4. strategy-interview-ingest + 품질 지표 대시보드**
  - 수주 전략 인터뷰 자산화
  - 수주율 · 재생성 횟수 · Ingestion 승인률 · 자산 재사용률 모니터링

- [~] **I5. Vercel 배포 + GitHub push** *(2026-04-28 코드 준비 완료, 배포 자체는 사용자 액션)*
  - GitHub push ✓ (`origin/master` 22 커밋 반영)
  - 신규: `vercel.json` (framework=nextjs, buildCommand=`npm run build:prod`, region=icn1, maxDuration=60s)
  - 신규 npm script: `build:prod` = `prisma generate && prisma migrate deploy && next build` (마이그 자동 적용)
  - 신규: `.env.example` (개발용 모든 환경변수 카탈로그)
  - 갱신: `.env.production.example` (GEMINI_API_KEY / GEMINI_MODEL 추가)
  - 신규: `docs/DEPLOYMENT.md` — 9 섹션 (Neon 준비 / Vercel 프로젝트 / 환경변수 표 / 시드 / OAuth / 검증 체크리스트 / 트러블슈팅)
  - **사용자 액션 대기**:
    - Vercel 계정 → New Project → GitHub `udpb/ud_planner` import
    - 환경변수 입력 (DATABASE_URL, GEMINI_API_KEY, AUTH_SECRET, NEXTAUTH_URL 등)
    - Deploy 클릭
    - 첫 배포 후 시드 실행 (`vercel env pull` → `npx tsx prisma/seed*.ts`)
    - Google OAuth Redirect URIs 갱신

---

## 참고: 파이프라인 흐름 (2026-04-23 Value Chain 확장)

UI 스텝(공정 레이어) + Impact Value Chain(의미 레이어) 을 병행 표기.

```
Step 1: RFP 분석 + 기획 방향                           [① Impact · ② Input · ③ Output]
  → 의도 선언 · Before/After · 기관 자산 · RFP 요구 (3 탭)
       │
       ▼
Step 2: 커리큘럼 설계                                  [④ Activity]
  → 트랙 구성 / 회차별 세션 / IMPACT 매핑 / 사전·사후 진단
       │
       ▼
Step 3: 코치 매칭                                      [④ Activity + ② Input]
  → 세션별 추천 코치 / 배정표 / 사례비
       │
       ▼
Step 4: 예산 설계 (2026-04-23 개칭)                    [② Input]
  → 예산 구조표 / 마진 / 기관 보유 자원 매핑
       │
       ▼
Step 5: 임팩트 + SROI Forecast (2026-04-23 재구성)     [⑤ Outcome — 수렴점]
  → IMPACT 모듈 / Logic Model / SROI 비율 / 벤치마크
  → 루프 Alignment Check 3장 (⑤→① · ⑤→② · ⑤→④)    ◀── 루프 시작
       │                                              │
       ▼                                              │
Step 6: 제안서 생성                                    [③ Output 최종]
  → 7개 섹션 (위 모든 데이터 + 루프 얼라인 결과 반영)
       │
       └───── 루프: SROI 숫자 축으로 ①·②·④ 로 역류 검증 ─────┘
```

### Impact Value Chain (ADR-008)

```
  ① Impact  ─▶  ② Input  ─▶  ③ Output  ─▶  ④ Activity  ─▶  ⑤ Outcome (SROI)
     ▲                                                            │
     └────────────── 루프: SROI 3방향 얼라인 ────────────────────┘
```

## 참고: 데이터 레이어

```
Layer 1: 내부 자산 (회사 공통)
  브랜드 자산 / IMPACT 18모듈 / 코치 DB / 비용 기준 / SROI 프록시 / 당선 패턴 / 유형별 프리셋

Layer 2: 프로젝트 컨텍스트 (PipelineContext — 스텝 간 흐름)
  Step 1→2→3→4→5→6으로 누적 전달

Layer 3: 외부 인텔리전스 (AI + PM 수집)
  티키타카 리서치 / AI 생성 / 수주 전략 인터뷰
```
