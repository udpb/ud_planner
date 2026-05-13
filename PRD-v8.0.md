# PRD-v8.0 — UD-Ops Workspace

> 언더독스 교육 사업 제안 자동화 웹앱의 **단일 진실 원본 (Single Source of Truth)**.
> v8.0 은 [ADR-013 Express 2.0](docs/decisions/013-express-v2-auto-diagnosis.md) 채택을 반영한다 —
> **AI 자동 진단 + 채널 분기 + 외부 LLM 최소화** 패러다임.
> v7.1 은 [docs/archive/PRD-v7.1.md](docs/archive/PRD-v7.1.md) 로 아카이브.

---

## 0. 메타

### 0.1 버전 정보

| 항목 | 값 |
|---|---|
| **버전** | v8.0 (Express 2.0 채택) |
| **상태** | Active (Single Source of Truth) |
| **작성일** | 2026-05-03 |
| **선행 PRD** | [PRD-v7.1.md](docs/archive/PRD-v7.1.md) (Phase L 100% — Archived 2026-05-03) |
| **핵심 트리거** | (1) 슬기님 03/25 신한 사례 *"사회공헌 vs 일반전략 프레임 판별 부재"*  (2) 사용자 *"토큰 OK, 무거운 리서치만 외부, 왔다갔다 X"*  (3) 사용자 *"우측 사이드바 UI/UX 안 좋다"* |
| **선행 결정** | ADR-001 ~ **ADR-013** ⭐ |
| **관련 스펙** | [docs/architecture/express-mode.md](docs/architecture/express-mode.md) v2.0 |
| **프로덕션** | https://ud-planner.vercel.app (2026-04-29 가동) |
| **Coach 단일 source** | Supabase `coaches_directory` (coach-finder 와 동기) — 715명 활성 |

### 0.2 v7.1 → v8.0 핵심 변경

v7.1 (2026-04-29) 발행 직후 4일 (2026-04-30 ~ 2026-05-03) 동안:
- 코드 정리 30+ 커밋 (Phase 1·2·3 + 운영 안정화)
- 슬기님 5 원칙 + 새싹 8 Step + 팩트체크 워크플로 흡수
- coach-finder Supabase 단일 source 통합
- ADR-012 (모델 정리) + ADR-013 (Express 2.0) 채택

| 영역 | v7.1 | v8.0 | 근거 |
|---|---|---|---|
| **Express 패러다임** | AI 가 생성자 | **AI 가 오케스트레이터·자동 진단자** | ADR-013 |
| **AI 자동 진단** | Inspector 7 렌즈만 | **+ ChannelDetector + FramingInspector + FactCheck + LogicChain** | ADR-013 |
| **채널 분기** | 톤만 분리 (B2G/B2B/renewal) | **Inspector·UI·진단 lens 모두 분기** | ADR-013 |
| **외부 LLM 카드** | 5건 | **2~3건만 (정부 통계·발주처 공식 문서·시장 데이터)** | ADR-013 |
| **사이드바 UI** | 5+ 카드 분산 | **행동 흐름 4 패널 (다음 액션·자동 진단·외부 LLM·진행률)** | ADR-013 |
| **의사결정 컨펌** | slot filling 흐름 | **+ 4 마일스톤 컨펌 (채널·솔루션·조립·검수)** | ADR-013 |
| **Prisma 모델** | 36개 | **33개** (ADR-012 완결: 11개 정리) | ADR-012 |
| **Coach DB source** | GitHub coaches-db | **Supabase coaches_directory (coach-finder 동기)** | Phase 4-coach-integration |
| **/admin/metrics** | 4 카드 | **6 카드** (Validation + evalCriteria + isBidWon 피드백) | Phase 3 |
| **Sentry / Analytics** | 미통합 | **통합** (Vercel Analytics + Speed Insights + Sentry hook) | Phase 3 |
| **E2E 테스트** | smoke 7 | **smoke 7 + auth-flow 5 + authenticated 6** | Phase 3.4 |

### 0.3 PRD 작성 주체

| 작업 | 주체 |
|---|---|
| 시스템 정체성·정의 | 사용자 (udpb@udimpact.ai) + AI 공동기획자 |
| 제안서 품질 5 원칙 | 한슬기 (운영 PM) — 슬랙 영업 경험 기반 |
| 8 Step 워크플로 | Sassac (새싹) — proposal-planner 스킬 설계 |
| 코드 구현 | AI 공동기획자 (Claude Opus 4.7) |

---

## 1. 시스템 정체성

### 1.1 북극성

> *"RFP → 30~45분 → 당선 가능한 기획 1차본 (7 섹션 초안)"*
> — ADR-011 (v7.0 부터 유지)

v8.0 은 위 북극성을 유지하면서, **품질 차원 7가지로 확장**:

| 품질 차원 | 측정 |
|---|---|
| 1. 발주처 관점·납득 | 프레임 진단 (사회공헌 vs 일반전략) 통과 |
| 2. 디테일 완결성 | sections.* 분량·키 메시지·UD 자산 인용 |
| 3. RFP 정확히 읽기 | evalCriteria·constraints·detectedTasks 추출률 |
| 4. 경쟁 환경 인식 | StrategicNotes.competitorWeakness + Strategy |
| 5. 내부 정보 반영 | PM 직접 카드 + evidenceRefs 누적 |
| 6. **논리 흐름 (신규)** | 1~7 섹션 chain 정합성 (gate3-validation/logic-chain) |
| 7. **팩트체크 (신규)** | 수치 추출 → 5 카테고리 → 5 검증 상태 |

종합 점수 목표: **74% 이상** (v7.1 51% 대비 +23%p).

### 1.2 두 트랙 (유지)

**Express Track (메인)** — 30~45분 1차본
- 단일 화면 (좌 챗봇 / 중 미리보기 / 우 사이드바)
- 12 슬롯 + AI 자동 진단 4종 + 외부 LLM 2~3건 + PM 직접 카드 1건
- 마일스톤 컨펌 4지점

**Deep Track (보조)** — 정밀화
- 6 스텝 파이프라인 (RFP → 커리큘럼 → 코치 → 예산 → 임팩트 → 제안서)
- Express 산출물 자동 인계 (handoffToDeep)
- SROI·예산·코치·평가 정밀

### 1.3 3 채널 분기 ⭐ v8.0 신규

`ChannelPreset` 시드 (B2G/B2B/renewal) 의 의미적 확장:

| 채널 | 메커니즘 | Inspector 가중치 (top 3) | 사이드바 특화 |
|---|---|---|---|
| **B2G** | 정량성·정확성·경쟁 | evalWeight 30% / quantitative 20% / rfpCompliance 20% | 평가배점 100점 시뮬 |
| **B2B** | 프레임·부서·인용 | framing 30% / officialDoc 20% / departmentTone 15% | 프레임 진단 카드 |
| **renewal** | 개선·연속 | improvementMapping 30% / priorYear 25% / measurable 20% | 전년 vs 올해 매핑 표 |

---

## 2. 시스템 아키텍처

### 2.1 데이터 흐름 (v8.0 갱신)

```
[RFP 업로드 / 텍스트 입력]
        ↓
[parse-rfp + ChannelDetector] ← v8.0 신규
        ↓
[채널 컨펌 카드 — PM 1 클릭]  ← v8.0 신규
        ↓
[Express 단일 화면]
   ├─ 좌: 챗봇 12 슬롯
   ├─ 중: 7 섹션 미리보기 + 수치 highlight ← v8.0 신규
   └─ 우: 4 패널 사이드바 (재설계)
        ↓
[AI 자동 진단 — 매 턴]  ← v8.0 신규
   ├─ FramingInspector (B2B 모드)
   ├─ LogicChainChecker
   └─ FactCheck Light
        ↓
[마일스톤 컨펌 4지점]  ← v8.0 신규
        ↓
[1차본 조립 (7 섹션, 채널별 톤)]
        ↓
[Inspector 8 렌즈 검수]  ← v8.0 확장
        ↓
[handoffToDeep 또는 markCompleted]
        ↓
[Deep Track (선택) — 6 스텝 정밀화]
```

### 2.2 신규 모듈 (v8.0)

```
src/lib/express/
├─ channel-detector.ts          ⭐ 신규 (Phase M0)
├─ framing-inspector.ts         ⭐ 신규 (Phase M0)
├─ decision-points.ts           ⭐ 신규 (Phase M1)
└─ schema.ts                    (수정: channel meta 추가)

src/lib/proposal/
├─ fact-checker.ts              ⭐ 신규 (Phase M1)
└─ logic-chain-checker.ts       ⭐ 확장 (gate3-validation 기반)

src/components/express/sidebar/
├─ NextActionCard.tsx           ⭐ 신규 (Phase M0)
├─ AutoDiagnosisPanel.tsx       ⭐ 신규 (Phase M0)
├─ ExternalLLMCards.tsx         ⭐ 재설계 (Phase M0)
├─ PMDirectCard.tsx             (유지)
└─ SlotProgress.tsx             ⭐ 신규 (Phase M0)

src/components/express/sidebar/channel/
├─ B2GSidebar.tsx               (Phase M2)
├─ B2BSidebar.tsx               (Phase M0)
└─ RenewalSidebar.tsx           (Phase M2)
```

### 2.3 기존 모듈 (v7.1 → v8.0 변경 없음)

다음은 v7.1 그대로 유지:
- `src/lib/ai/*` (8 모듈, claude.ts 분할 완료)
- `src/lib/ai-fallback.ts` (invokeAi 단일 진입점)
- `src/lib/express/{process-turn,prompts,inspector}.ts`
- `src/lib/proposal-ai.ts` (PipelineContext 기반)
- `src/lib/coaches/supabase-source.ts` (715명 동기)
- `src/lib/asset-registry.ts` (Phase G/H)
- `prisma/schema.prisma` (33 모델, ADR-012 완결)

---

## 3. 토큰·비용 모델

### 3.1 1차본 1회 생성 토큰 (Express 2.0)

| 단계 | 토큰 | 변화 (v7.1) |
|---|---|---|
| RFP 파싱 | ~5K | 동일 |
| 채널 추론 | ~1K | +1K 신규 |
| Express turn × 12 | ~24K (1회 ~2K) | 동일 |
| 프레임 진단 × 3 | ~6K | +6K 신규 |
| 팩트체크 × 1 | ~3K | +3K 신규 |
| 논리 chain × 1 | ~3K | +3K 신규 |
| 1차본 조립 (7 섹션) | ~21K | 동일 |
| 검수 (Inspector 8 렌즈) | ~3K | 동일 |
| **합계** | **~66K** | +13K (+25%) |

월 100 프로젝트 기준: **추가 비용 ~$15** (Gemini 3.1 Pro 가격). 허용 범위.

### 3.2 외부 LLM 사용 (PM 왔다갔다)

| | v7.1 | v8.0 |
|---|---|---|
| 외부 LLM 카드 건수 | 5 (정책·시장·벤치마크·대상자·운영) | **2~3** (정부 통계·발주처 공식·시장 데이터) |
| PM 왔다갔다 시간 | ~20분 | **~8분 (60% ↓)** |

---

## 4. 슬기님 5 원칙 + 새싹 8 Step 매핑

### 4.1 슬기님 5 원칙 → 우리 시스템 모듈

| 원칙 | v8.0 모듈 |
|---|---|
| 1. 발주처 관점·납득 | ChannelPreset + FramingInspector + Inspector "발주처 관점" 렌즈 |
| 2. 디테일 완결성 | sections.* mustInclude + LogicChainChecker + Inspector "디테일" 렌즈 |
| 3. RFP 정확히 읽기 | parse-rfp (evalCriteria/constraints/detectedTasks) + 외부 LLM "정부 통계" |
| 4. 경쟁 환경 인식 | StrategicNotes + WinningPattern 매칭 + B2B 의 competition slot (선택) |
| 5. 내부 정보 반영 | PM 직접 카드 + evidenceRefs + 인터뷰 인제스트 |
| 6. 논리 흐름 (신규) | LogicChainChecker (gate3-validation 확장) |
| 7. 팩트체크 (신규) | FactCheckLight + AI 검증 (선택) |

### 4.2 새싹 8 Step → 우리 Express 흐름

| Step (Sassac) | v8.0 매핑 |
|---|---|
| 1. RFP 정밀 분석 | parse-rfp + ChannelDetector |
| 2. 유디 역량 매칭 | asset-registry 자동 매칭 |
| 3. 과거 유사 제안서 | similar-projects API |
| 4. 슬랙·리서치 | external-llm 카드 (2~3건) + 인터뷰 인제스트 |
| 5. 차별화 + 목차 | keyMessages + Strategy + FramingInspector |
| 6. 페이지네이션 | (Phase M3 후속) |
| 7. PPT 생성 | (Phase M3 후속 — Sassac 연결 또는 pptxgenjs) |
| 8. 심사위원 리뷰 | Inspector 8 렌즈 + evaluator-simulation |

---

## 5. UI/UX 재설계 (사이드바)

### 5.1 4 패널 구조

```
╔═════════════════════════════════════╗
║ 🎯 다음 1 액션 (Next Step)         ║
║   critical / warn 중 1개            ║
╠═════════════════════════════════════╣
║ 🤖 AI 자동 진단                    ║
║   채널 | 프레임 | 논리 | 팩트       ║
║   각각 pass / warn / fail           ║
╠═════════════════════════════════════╣
║ 🤝 외부 LLM (2~3건만)              ║
║   Impact Value Chain stage 태깅     ║
╠═════════════════════════════════════╣
║ 📊 슬롯 진행 (12 / 12)             ║
║   진행률 + 펼침 목록                ║
╚═════════════════════════════════════╝
```

### 5.2 채널별 사이드바 차이

| 패널 | B2G | B2B | renewal |
|---|---|---|---|
| **다음 1 액션** | "평가배점 항목 보강" | "프레임 진단 critical" | "작년 미흡 영역 보강" |
| **AI 자동 진단** | 평가배점 시뮬 100점 | 프레임·부서 진단 | 개선 매핑 진단 |
| **외부 LLM** | 정부 통계 / 시장 / 벤치마크 | 발주처 공식 / 시장 / 정부 | 트렌드 업데이트 / 정부 |
| **슬롯 진행** | 12 슬롯 + B2G hint | 12 슬롯 + B2B hint | 12 슬롯 + renewal hint |

---

## 6. 점진 실행 로드맵 — Phase M

| Phase | 노력 | 산출물 | 슬기님 5원칙 영향 |
|---|---|---|---|
| **M0** | 반나절~1일 | ChannelDetector + FramingInspector + 사이드바 재설계 | 1·6 (+20%p, +45%p) |
| **M1** | 1~2일 | FactCheckLight + LogicChain 확장 + 의사결정 컨펌 흐름 | 7 (+50%p) |
| **M2** | 3~5일 | 채널별 Inspector 가중치 + B2G 평가배점 시뮬 + renewal 매핑 | 4 (+10%p) |
| **M3** | 1주+ | PPT 출력 + 발주처 공식 문서 ingestion | 3 (+10%p) |

추천 시작: **Phase M0** — 사용자 가장 큰 통점 (UI/UX) + 슬기님 가장 큰 피드백 (프레임 진단) 동시 해결.

---

## 7. 비기능 요구사항 (v7.1 유지)

| 항목 | 값 |
|---|---|
| AI Primary | Google Gemini 3.1 Pro Preview |
| AI Fallback | Claude Sonnet 4.6 |
| 단일 진입점 | `invokeAi()` (src/lib/ai-fallback.ts) |
| DB | Neon PostgreSQL (ap-southeast-1) — 33 모델 |
| Coach Source | Supabase coaches_directory (coach-finder 동기, 715명) |
| 인증 | NextAuth v5 JWT (Google OAuth + @udimpact.ai Credentials) |
| Hosting | Vercel (icn1 region) |
| 모니터링 | Vercel Analytics + Speed Insights + Sentry (DSN 활성 시) |
| 운영 | /admin/metrics (6 카드) + /admin/content-hub + health-check |
| Rate-limit | AI 라우트 분당 10회 (IP·user 기반) |
| E2E | Playwright 18 시나리오 (smoke + auth + authenticated) |

---

## 8. 부록

### A. 참조 문서

- [ADR-011 Express Mode](docs/decisions/011-express-mode.md) — v7.0 정체성
- [ADR-012 Prune Unused Models](docs/decisions/012-prune-unused-models.md) — 44→33 모델
- [ADR-013 Express 2.0](docs/decisions/013-express-v2-auto-diagnosis.md) ⭐ — v8.0 정체성
- [docs/architecture/express-mode.md](docs/architecture/express-mode.md) v2.0
- [docs/architecture/coach-data-integration.md](docs/architecture/coach-data-integration.md)
- [DIAGNOSIS-2026-05-03.md](docs/DIAGNOSIS-2026-05-03.md) — 30+ 커밋 정리 진단 보고서

### B. 인용 — 핵심 트리거 원문

**슬기님 03/25 피드백** (정상훈 고문 자문):
> *"현 제안서의 논리 흐름이 '사회공헌사업' 제안 보다는 '일반 사업 전략 제안'으로 읽힘. 사회공헌 사업 제안으로 읽혀야 '하나금융사례처럼 사회공헌, 동반성장' 관점으로 어필될 수 있음."*

**사용자 2026-05-03**:
> *"토큰은 좀 소모되어도 되는데, 무거운 리서치만 외부에서 하자. 너무 왔다갔다하면 번거롭잖아."*
> *"대화 방식 현재 express track을 좀 더 고도화해서 뭔가 대화만으로도 완성도 있는 제안서가 나오면 좋겠는데."*
> *"PM가이드랑 평가위원 관점 흔한 실수 Top 4 당선 레퍼런스 이런게 ui/ux 기획이 너무 안좋아."*

**Sassac (새싹) 9:24 진단**:
> *"플랫폼 경쟁 심화 → 수수료 차별화 한계 → 비즈니스 전략으로 AX 도입. 이건 신한 기획/전략팀 언어야. 사회공헌팀 언어가 아님."*

이 세 인용이 v8.0 (Express 2.0) 의 의사결정 근거.
