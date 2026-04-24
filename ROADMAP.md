# UD-Ops 파이프라인 재설계 로드맵

> 상세 설계: [REDESIGN.md](REDESIGN.md)
> 아키텍처 골격: [docs/architecture/](docs/architecture/) (modules · data-contract · ingestion · quality-gates · **value-chain** · program-profile)
> 의사결정 기록: [docs/decisions/](docs/decisions/) (ADR-001~008)
> 마지막 업데이트: 2026-04-23 (Phase F Impact Value Chain Wave 추가)

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
| G | 안정화 + Manifest 강제 + 배포 | 🔲 대기 | 0% |

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
> 원 계획(아래 E1~E6 IMPACT 모듈 자동 추천·코치 추천·SROI 통합 등)은 부분 이행 → Phase G 로 이월 고려.
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

## Phase G: 안정화 + Manifest 강제 + 배포

> G가 끝나면: 프로덕션 배포 완료 + 모듈 경계가 런타임·린트로 강제됨

- [ ] **F1. 전체 E2E 테스트**
  - 양양 신활력 RFP로 Step 1~6 전체 플로우
  - 각 스텝의 데이터 흐름 검증
  - Ingestion → 승인 → 자산 반영 → 기획 활용 end-to-end

- [ ] **F2. 빌드 확인 + 에러 수정**
  - TypeScript 0 에러
  - Vercel 서버리스 호환 확인

- [ ] **F3. Module Manifest 강제**
  - ESLint 커스텀 룰: 모듈이 manifest에 없는 slice/asset 접근 금지
  - 런타임 레지스트리 (`src/modules/_registry.ts`) — 모든 manifest 자동 수집
  - 근거: [ADR-002](docs/decisions/002-module-manifest-pattern.md)

- [ ] **F4. strategy-interview-ingest + 품질 지표 대시보드**
  - 수주 전략 인터뷰 자산화
  - 수주율 · 재생성 횟수 · Ingestion 승인률 · 자산 재사용률 모니터링

- [ ] **F5. Vercel 배포 + GitHub push**
  - 프로덕션 배포
  - Google OAuth 최종 확인

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
