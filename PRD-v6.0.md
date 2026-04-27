# PRD-v6.0 — UD-Ops Workspace

> 언더독스 교육 사업 제안 자동화 웹앱의 **단일 진실 원본 (Single Source of Truth)**.
> 본 PRD 는 시스템 정의에 집중한다. 운영 가이드북·강의 자료는 별도 산출물 (부록 A 참조).

---

## 0. 메타

### 0.1 버전 정보

| 항목 | 값 |
|---|---|
| **버전** | v6.0 |
| **상태** | Active (Single Source of Truth) |
| **작성일** | 2026-04-27 |
| **작성 맥락** | Phase A~H 누적 결과를 단일 진실 원본으로 통합. 36+ 커밋 (실측 105 커밋) 누적, ADR 1~10 확정, ContentAsset DB 시드 20건 (top 15 + child 5) 완료, Phase I (안정화·배포) 진입 직전 |
| **선행 문서** | [ROADMAP.md](ROADMAP.md) · [REDESIGN.md](REDESIGN.md) · [docs/architecture/](docs/architecture/) · [docs/decisions/](docs/decisions/) |
| **선행 결정** | ADR-001 ~ ADR-010 |
| **작성 주체** | AI 공동기획자 (Claude Opus 4.7 1M context) + 사용자 (udpb@udimpact.ai) |

### 0.2 PRD-v5.0 → v6.0 변경 요약

PRD-v5.0 (2026-03-29 작성, 2026-04-15 아카이브) 은 "데이터 입력 도구 → 공동 기획자(Co-planner)" 라는 제품 정체성을 처음 정립했지만, 이후 11회의 구조적 결정(ADR-001~010) 으로 **거의 모든 핵심 설계가 갱신**되었다. v6.0 은 그 갱신의 종합본이다.

| 영역 | v5.1 (아카이브) | v6.0 (현재) | 근거 |
|---|---|---|---|
| **파이프라인 순서** | rfp → impact → curriculum → coaches → budget → proposal | rfp → curriculum → coaches → budget → **impact** → proposal | ADR-001 |
| **임팩트 위치** | Step 2 (Impact-First, 위에서 정의) | Step 5 (Activity 자동 추출 위에서 재구성) | ADR-001, ADR-004 |
| **모듈 구조** | 폴더 위주 ad-hoc | 4계층 (CORE · ASSET · INGESTION · SUPPORT) + Module Manifest 패턴 | ADR-002 |
| **데이터 흐름** | 각 스텝 독립 | `PipelineContext` 단일 객체 슬라이스 단위 흐름 | data-contract.md |
| **자료 축적** | 수동 prompt/DB 갱신 | `IngestionJob` + `ExtractedItem` 검토 큐 | ADR-003 |
| **사업 분류** | `WinningPattern.channelType` 1축 | `ProgramProfile` **11축** (대상 3 + 규모 + 포맷 + 운영 + 지원 + 방법론 + 심사 + 발주처 + 임팩트 + 사후관리) | ADR-006 |
| **리서치 흐름** | Step 1 한 번 수집 | 6 스텝 각각 차별화된 ResearchRequest 21개 | ADR-007 |
| **의미 레이어** | 없음 | **Impact Value Chain 5단계** (① Impact → ② Input → ③ Output → ④ Activity → ⑤ Outcome) + SROI 수렴점 + 루프 얼라인 Gate | ADR-008 |
| **자산 활용** | 코드 상수 + PM 기억 | **Asset Registry v1** (3중 태그 매칭) → **Content Hub v2** (DB + 계층 + 담당자 UI) | ADR-009, ADR-010 |
| **품질 검증** | 룰 엔진 일부 | 4계층 게이트 (구조 · 룰 · AI · 사람) + 루프 Alignment | quality-gates.md |
| **가이드북 포지션** | PRD 안에 일부 통합 | **완전 분리** (배포용 OJT 문서) | ADR-005 |
| **AI 모델** | Claude Sonnet 4.5 | Claude Sonnet 4.6 + Gemini fallback | CLAUDE.md |

PRD-v5.0 에서 **유효 잔존**: 비즈니스 룰 (Action Week · 이론 30%·이론 3연속 금지), IMPACT 18 모듈 + CORE 4 모듈 방법론, 코치 데이터 구조, SROI 프록시 16종 × 4국, 예산 공식.

### 0.3 본 PRD 의 표현 약속

- **명료·간결**: 한 문장 한 의미. 한국어 본문 + 영문 기술 용어 그대로.
- **출처 표시**: 결정 근거는 `ADR-XXX`·`CLAUDE.md §X`·`<file>.md` 인용.
- **추측 금지**: 코드·문서로 확인된 사실만. 미정 사항은 `TBD` 명시.
- **하향식**: 큰 정의 → 세부 구조 → 구현. 표는 비교·매핑용.

---

## 1. 제품 정체성

### 1.1 한 문장 정의

> **UD-Ops Workspace 는 언더독스 PM 이 RFP 한 부 받는 순간부터 7개 섹션 제안서까지 6단계로 흘러가는 AI 공동기획자다.** PM 의 기억·검색·반복 입력에 의존하지 않고, 회사가 누적한 자산·방법론·당선 패턴이 자동으로 적재적소에 꺼내지는 구조다.

### 1.1.1 한 문장 정의의 단어 풀이

- **"AI 공동기획자"**: AI 가 *대신* 쓰지 않는다. PM 과 함께 쓴다. AI 는 컨텍스트 합성·초안 생성·시뮬레이션에, PM 은 컨셉 결정·자산 선택·최종 톤 조정에 책임을 진다. 메모리: feedback_coplanner_mode (2026-04-15).
- **"6 단계"**: ADR-001 의 확정 순서 (rfp → curriculum → coaches → budget → impact → proposal). 순서 자체가 결정이고, 임팩트가 Step 5 인 것이 본 시스템의 시그니처.
- **"적재적소에 꺼내지는"**: ProgramProfile 11축 유사도 + ContentAsset 3중 태그 + WinningPattern 섹션 매칭 의 합성 결과. *PM 이 검색하지 않는다*.
- **"기억·검색·반복 입력에 의존하지 않고"**: PRD-v5 의 *hidden cost* 진단(§1.2). 시니어 PM 의 머릿속에 있는 발주처 상식·과거 사례·자산 인벤토리를 시스템 데이터로 외화(externalize).

### 1.2 풀려는 핵심 문제

| 문제 | 실제 모습 | 해결 메커니즘 |
|---|---|---|
| **PM 의 hidden cost** | "이 RFP 에 우리 IMPACT 6단계가 들어가야 하나?" "유사 사업이 작년에 있었나?" "발주처 톤은?" 매번 기억·검색·전화로 답을 찾음 | Asset Registry + ProgramProfile 유사도 + WinningPattern 자동 매칭 (ADR-006, ADR-009) |
| **자산 흩어짐** | 노션·슬랙·드라이브·전임자 머릿속에 분산. 신입 PM 은 자산 존재 자체를 모름 | Content Hub DB + 3중 태그 + 담당자 직접 CRUD UI (ADR-010) |
| **AI 일관성** | 매 호출 처음부터 컨텍스트 재구축. 같은 RFP 라도 매번 결과가 다름 | PipelineContext 누적 주입 + 공통 원칙(planning-principles) 자동 삽입 (data-contract.md, ADR-007) |
| **이중 입력** | 임팩트 단계에서 Activity 정의 → 커리큘럼에서 같은 내용 재정의 | 커리큘럼 세션 → Activity 결정론적 자동 추출 (ADR-001, ADR-004) |
| **품질 검증 부재** | "이게 수주 제안서인가" 판단을 사람 감(感) 에 맡김 | 4계층 품질 게이트 (구조·룰·AI·사람) + 루프 Alignment (quality-gates.md, ADR-008) |
| **축적 메커니즘 부재** | 수주·탈락 데이터가 다음 기획에 반영 안 됨 | Ingestion 큐 + 검토 승인 + 자산 자동 고도화 (ADR-003) |

### 1.3 비전·미션

- **비전**: 언더독스의 10년 25,000명 교육 자산이 **신입 PM 의 첫 RFP 에서도 꺼내지는** 시스템.
- **미션**:
  1. PM 을 *클릭러* 가 아닌 *공동기획자* 로 유지한다 (의도적 티키타카, ADR-007).
  2. 매 제안서가 **다음 제안서를 더 강하게 만든다** (Ingestion → 자산 고도화, ADR-003).
  3. 신입 PM 산출물의 **하한선을 시니어 PM 수준으로 끌어올린다** (pm-guide + Asset Registry).

### 1.4 경계 선언 (이건 X 가 아니다)

- ❌ **이건 LMS 가 아니다.** 학습 콘텐츠 전달·진도 추적·과제 채점은 별도 LMS (언더베이스) 가 담당. Ops Workspace 는 *제안 기획* 도구.
- ❌ **이건 노션 대체가 아니다.** 자산의 원본(PDF·영상·슬라이드) 은 노션·드라이브·LMS 에 보관. Ops Workspace 의 `ContentAsset.sourceReferences` 는 URL 링크만 (ADR-010 Q3).
- ❌ **이건 코치 매니지먼트 시스템이 아니다.** 코치 인사·계약·정산은 별도. coach-finder 는 검색·추천 UI 만 제공.
- ❌ **이건 운영 트래커가 아니다.** 실제 사업 운영(D-day·칸반·만족도) 은 v6 범위 밖. Phase I 이후 별 트랙으로 검토.
- ❌ **이건 가이드북이 아니다.** 가이드북은 OJT 배포용 마크다운. 시스템과 *완전 분리* (ADR-005).
- ❌ **이건 발주처/평가위원이 직접 쓰는 도구가 아니다.** 그들은 산출물(제안서) 의 수신자.

### 1.5 인접 시스템과의 관계 (정보 흐름 1방향)

ADR-005 의 정보 흐름 규칙을 PRD-v6 의 시스템 경계 전반에 확장 적용:

| 인접 시스템 | UD-Ops 와의 관계 | 흐름 방향 |
|---|---|---|
| **언더베이스 LMS + AI 코치봇** | Ops 가 자산 메타로 *참조*. LMS → Ops 흐름 없음 | Ops → LMS (제안서 일부) |
| **Coach Finder (별도 사이트)** | `scripts/sync-coaches.ts` 로 코치 JSON → Coach 테이블 동기화 | Coach Finder → Ops |
| **Notion / Drive (자산 원본)** | `ContentAsset.sourceReferences` 에 URL 만. 본문은 담당자가 narrativeSnippet 으로 압축 | 양방향 (수동) |
| **Alumni Hub** | 데이터 인용 (`asset-alumni-hub` 의 keyNumbers: "25,000") | Alumni → Ops |
| **외부 LLM (PM 의 ChatGPT 등)** | PM 이 외부 LLM 으로 리서치 → Ops 의 ResearchRequests 답변 영역에 붙여넣기 | 외부 → Ops (PM 매개) |
| **가이드북 / 강의자료** | ADR-005 §정보 흐름 규칙 — 브랜드 수치·ChannelPreset 시드만 1차 시드로 허용 | 가이드북 → Ops (제한적) |

이 표가 의미하는 것: Ops Workspace 는 *허브* 가 아니라 *전용 도구* 다. 인접 시스템의 데이터를 *흡수* 하지 않고, *참조* 한다. 단일 진실 원본은 영역마다 다르다 (Notion = 자산 원본, Coach Finder = 코치 데이터, Alumni Hub = 알럼나이 데이터, Ops = *제안 기획 산출물*).

---

## 2. 사용자 (Personas)

### 2.1 핵심 사용자: PM (제안 기획자)

| 항목 | 내용 |
|---|---|
| **역할 코드** | `PM` (Prisma `UserRole` enum) |
| **인증** | NextAuth v5 + Google OAuth `@udimpact.ai` / `@underdogs.co.kr` 도메인 화이트리스트 |
| **활용 시나리오** | RFP PDF 업로드 → AI 파싱 → 6 스텝 진행 → 7 섹션 제안서 export |
| **시니어 vs 신입** | 시니어는 자기 발주처 상식·과거 사례를 머릿속에 가짐. **신입은 시스템에 의존**. PRD 는 신입 기준으로 설계 (시니어도 hidden cost 가 줄어듦) |
| **세션당 작업 시간** | RFP 입수 ~ 제안서 초안: 2~5일 (시스템 도입 전 1~2주) |
| **부담 포인트** | "왜 이 자료를 또 입력해야 하지?" "AI 가 만든 게 진짜 우리 톤이 맞나?" → PipelineContext + ud-brand 로 해결 |

### 2.2 콘텐츠 담당자 (Asset Registry 관리)

| 항목 | 내용 |
|---|---|
| **활용 위치** | `/admin/content-hub` 페이지 (Phase H, ADR-010) |
| **권한** | v2.0 은 로그인한 모든 유저 (담당자 1명 전제, ADR-010 Q2). 향후 `role: 'content-admin'` 분화 가능 |
| **업무** | ContentAsset CRUD: 자산 추가·편집·아카이브, 부모 자산 지정 (1단 계층), 3중 태그 (카테고리·valueChainStage·evidenceType) 입력 |
| **입력 빈도** | Q2 워크샵 결과 도착 시 일괄 등록 → 이후 주 단위 보강 |
| **책임 경계** | narrativeSnippet 의 **초안** 까지. 제안서 본문 작성은 PM. 운영 정보(담당자·일정) 는 Registry 밖 (ADR-009·010 제약) |

### 2.3 부차 역할 (read-only 또는 제한적 활용)

| 역할 | Prisma enum | 본 PRD 범위 내 활용 |
|---|---|---|
| `DIRECTOR` | 디렉터 | 제안서 검수·승인. 별도 워크플로우는 v6 범위 밖 |
| `CM` | Center Manager | 운영 단계 진입 후 (v6 범위 밖) |
| `FM` | Field Manager | 동상 |
| `COACH` | 코치 | coach-finder 에서 자기 프로필 조회 (별도 모듈) |
| `ADMIN` | 관리자 | Ingestion 검토 큐 (`/ingest/review`) 승인·거부 |

### 2.4 산출물 수신자 (시스템 사용자 아님)

- **평가위원 / 발주처 담당자**: 제안서 PDF·DOCX 의 *독자*. 시스템에 로그인하지 않음. 다만 그들의 *관점* 은 pm-guide `evaluatorPerspective` (18 cell: 6 step × 3 channel) 와 Gate 3 평가위원 시뮬레이션에 *모델링됨* (quality-gates.md §1 Gate 3b).
- **알럼나이 / 참여자**: Alumni Hub 자산(`asset-alumni-hub`) 의 *원천*. Ops Workspace 는 그들의 데이터를 인용만 함.

---

### 2.5 PM 의 워크플로우 시나리오 (의도된 사용 패턴)

PM "민수"(가상) 가 양양 신활력 RFP 를 받았을 때의 의도된 흐름. *시스템 안내가 어떻게 행동을 바꾸는가* 를 명시.

```
[월] RFP PDF 도착
  ↓
[월 14:00] /projects/new → RFP 업로드
  ↓ AI 파싱 + ProgramProfile 자동 추론 + 매칭 자산 카드 자동 펼침
[월 14:30] Step 1 ① Impact / ② Input / ③ Output 3 탭 검토
  ↓ AI 가 제안한 컨셉 3개 중 1개 선택, keyPlanningPoints 3개 PM 편집
[월 15:00] ResearchRequests 5건 중 2건 답변 붙여넣기 (외부 LLM 사용)
  ↓ → Project.externalResearch 저장 → Step 2~6 AI 호출에 자동 주입
[월 16:00] Step 2 커리큘럼 AI 생성 (방법론 분기 활성)
  ↓ Gate 2 룰 엔진: R-001 통과·R-002 Action Week 1회 추가 SUGGEST 수용
[화] Step 3 코치 매칭 / Step 4 예산 자동 산출
  ↓
[수 11:00] Step 5 임팩트 — Activity 자동 추출 결과 검토 + Outcome AI 생성 + SROI Forecast
  ↓ 루프 Alignment Cards 3장: ⑤→② "SROI 8.2 — 과다 약속 의심" → Step 4 복귀 CTA
[수 14:00] Step 4 재방문 → 인건비 비율 조정 → 다시 Step 5
  ↓ 루프 통과
[수 16:00] Step 6 제안서 7섹션 생성 (자산 narrativeSnippet 자동 주입)
  ↓ Gate 3 평가위원 시뮬: 78점 예상, 부족 요소 "정량 KPI 약함" → 섹션 재생성
[목] 최종 검토 + 디렉터 승인 + DOCX export
```

핵심: **PM 이 시스템 밖으로 나가는 순간이 ResearchRequests 답변 작성 한 곳뿐.** 나머지는 모두 시스템 안에서 처리. 그 한 번의 외부 작업도 답변이 누적되어 다음 AI 호출에 자동 반영.

---

## 3. 핵심 가치제안 (Core Value Propositions)

CLAUDE.md §"설계 철학" 9개 항목에서 **사용자 가치 5개** 로 응축.

### 3.1 데이터는 위에서 아래로 흐른다 (PipelineContext)

각 스텝은 이전 스텝 산출물을 `PipelineContext` 객체로 받는다. 같은 정보를 두 번 묻지 않는다.

- **구현체**: `src/lib/pipeline-context.ts` — RfpSlice · StrategySlice · CurriculumSlice · CoachesSlice · BudgetSlice · ImpactSlice · ProposalSlice 총 7 슬라이스 + meta + valueChainState
- **API**: `GET /api/projects/[id]/pipeline-context` 가 모든 슬라이스를 조합 반환
- **계약**: 각 모듈 `manifest.ts` 의 `reads.context`/`writes.context` 가 슬라이스 접근 권한 (data-contract.md §2)
- **PM 확정**: 각 슬라이스의 `confirmedAt` 필드. 미확정이면 다운스트림이 "초안 기반" 경고

### 3.2 자산은 자동으로 올라온다 (Asset Registry)

PM 이 자산을 *찾으러 다니지 않는다*. RFP 파싱 직후 ProgramProfile 유사도 + 키워드 + 섹션 적합도로 점수화된 자산 카드가 Step 1 에 펼쳐진다.

- **구현체**: `src/lib/asset-registry.ts` `matchAssetsToRfp(rfp, profile)` — 점수 알고리즘 0.5·profileSimilarity + 0.3·keywordOverlap + 0.2·sectionApplicability (asset-registry.md §점수 알고리즘)
- **저장소**: ContentAsset Prisma 테이블 (Phase H), 시드 20 건 (top 15 + child 5)
- **PM 행동**: 토글 ON → `Project.acceptedAssetIds: Json` 에 저장
- **Step 6 주입**: 승인된 자산의 `narrativeSnippet` 이 `proposal-ai.ts` 프롬프트에 자동 주입 (소프트 마커 `<!-- asset:id -->` 로 추적)

### 3.3 AI 는 맥락 안에서 호출된다

매 AI 호출이 처음부터 시작하지 않는다. 축적된 PipelineContext + 공통 원칙 + 방법론 분기 + 외부 리서치 + 자산 narrativeSnippet 이 자동 주입된다.

- **공통 원칙**: `src/lib/planning-principles.ts` 의 4 원칙(시장 흐름·통계·문제정의·Before/After) 을 모든 AI 프롬프트에 자동 삽입 (memory: feedback_first_principle)
- **방법론 분기**: `methodology.primary` (9종) 에 따라 커리큘럼·제안서 프롬프트 분기 (program-profile.md §5.3)
- **모델**: Claude Sonnet 4.6 (`CLAUDE_MODEL`) primary, Google Gemini fallback. JSON 파싱은 항상 `safeParseJson()` 헬퍼 (CLAUDE.md §"Claude API")
- **토큰 분배**: RFP 파싱 4096 / Logic Model 4096 / 커리큘럼 4096 (CLAUDE.md)

### 3.4 신입 PM 도 왜 이렇게 써야 하는지 안다 (pm-guide)

각 스텝 우측에 가이드 패널이 상시 노출. 평가위원 관점·당선 레퍼런스·흔한 실수·UD 강점 팁·스텝별 ResearchRequest 가 한 화면에 있다.

- **구현체**: `src/modules/pm-guide/` 모듈 (manifest.ts 보유)
- **섹션 5종**: ResearchRequests → Evaluator → CommonMistakes → WinningReferences → UdStrengths (ADR-007)
- **차별화**: 6 스텝 × 3 channel = 18 셀의 `EVALUATOR_PERSPECTIVE_BY_STEP` 2D 룩업 + 21개 ResearchRequest (rfp 5 · curriculum 5 · coaches 3 · budget 3 · impact 2 · proposal 4)
- **경고 구조**: 가이드북 Ch.14 "흔한 실수 Top 7" + 코오롱 프로보노 사례 ("Value Chain 없이 장표부터 → 2주 무한수정 → VC 확정 후 1.5일 완성") 가 Step 2~5 경고로 내장

### 3.5 Impact-First 는 커리큘럼 위에서 재구성된다

Impact-First 철학은 *유지* 하되, UI 순서는 PM 사고 흐름에 맞춘다. Activity 는 커리큘럼 세션에서 결정론적 추출, Input 은 코치+예산에서 자동 도출, AI 는 Outcome/Impact 만 생성.

- **재배치 근거**: ADR-001 — "동일한 일을 두 번" 제거 + 평가배점 최고 항목(커리큘럼) 을 초반에
- **Activity 추출 룰**: ADR-004 — Action Week · 1:1 코칭 · 이론 · IMPACT 단계별 그룹핑. 세션 15개 → Activity 4~7개
- **Impact 정신 유지**: Step 1 의 `proposalConcept` (한 줄 컨셉) + `keyPlanningPoints` (핵심 기획 포인트 3개) 가 임팩트 방향성을 미리 선언

### 3.6 다섯 가치제안의 상호 의존도

5 가치제안은 *독립적이지 않다*. 한 축이 빠지면 다른 축이 무력화된다.

| If 빠진 축 | 무력화되는 축 | 결과 |
|---|---|---|
| 3.1 PipelineContext | 3.3 AI 맥락 | AI 가 매번 처음부터 → 일관성 붕괴 |
| 3.2 Asset Registry | 3.5 Impact-First 재구성 | narrativeSnippet 없으면 제안서가 *우리 것* 처럼 안 보임 |
| 3.3 AI 맥락 | 3.4 pm-guide | 가이드만 있고 AI 가 가이드 무시하면 신입 PM 산출물 품질 차이 |
| 3.4 pm-guide | 3.5 Impact-First | 신입이 "왜 임팩트가 Step 5 인지" 모르면 시스템 사용 거부 |
| 3.5 자동 추출 | 3.1 PipelineContext | Activity/Input 수동이면 슬라이스 흐름이 깨짐 |

따라서 5 가치제안은 **세트 구매**. Phase A~H 가 모두 완료되어야 첫 가치가 발현된다. Phase 별 부분 구현이 가치를 절반씩 올리지 않는 이유.

---

## 4. 두 레이어 구조 (의미 + 공정)

UD-Ops 의 가장 큰 인지적 발견은 **공정 레이어(UI 6 스텝) 와 의미 레이어(Value Chain 5 단계) 가 직교한다** 는 점이다. ADR-008 (2026-04-23) 에서 정식화.

### 4.1 공정 레이어 — UI 6 스텝

PM 이 **무엇을 하는가** 의 시간 순서.

```
Step 1 RFP+기획방향 → Step 2 커리큘럼 → Step 3 코치 → Step 4 예산 → Step 5 임팩트+SROI → Step 6 제안서
```

근거: ADR-001 (스텝 순서 변경) · 모든 step-*.tsx 파일이 이 순서로 `src/app/(dashboard)/projects/[id]/` 에 배치.

### 4.2 의미 레이어 — Impact Value Chain 5 단계

각 산출물이 **사업 논리에서 어디 위치하는가**.

```
① Impact (의도 · Before/After)
    ↓
② Input (자원 · 예산 · 기관 자산 · UD 에셋)
    ↓
③ Output (산출물 · RFP 요구 · 최종 제안서)
    ↓
④ Activity (실행 · 커리큘럼 · 코칭)
    ↓
⑤ Outcome (정량 기대효과 = SROI Forecast)
    │
    └──── 루프: SROI 축 3방향 얼라인 (⑤→① · ⑤→② · ⑤→④) ────┐
                                                                │
                                                        역류 검증 │
```

근거: ADR-008 · [docs/architecture/value-chain.md](docs/architecture/value-chain.md) · `src/lib/value-chain.ts` 의 `VALUE_CHAIN_STAGES` 상수 + `STEP_TO_STAGES` 매핑.

핵심 정의 (ADR-008): **⑤ Outcome = SROI Forecast.** SROI 비율(예: 1:3.2) 한 숫자에 Impact 의도·Input 자원·Activity 실행이 전부 녹아든다. SROI 는 *수렴점이자 루프의 출발점*.

### 4.3 직교 매핑

| UI 스텝 | 주 valueChainStage | 비고 |
|---|---|---|
| Step 1 RFP+기획방향 | `['impact', 'input', 'output']` | ① ② ③ 3 탭으로 분리 (Phase F Wave 6) |
| Step 2 커리큘럼 | `['activity']` | ④ |
| Step 3 코치 | `['activity', 'input']` | ④ + ② |
| Step 4 예산 설계 | `['input']` | ② only (SROI 는 Step 5 로 이동, Phase F) |
| Step 5 임팩트 + SROI Forecast | `['outcome']` | ⑤ 수렴점 + 루프 Alignment Cards 3 장 |
| Step 6 제안서 | `['output']` | ③ 최종 형태 |

`STEP_TO_STAGES` 매핑은 `src/lib/value-chain.ts` 에 코드로 고정. 한 스텝이 여러 단계를 건드릴 수 있고(1:N), 한 단계가 여러 스텝에 분산될 수 있다(N:1).

### 4.4 두 레이어가 만들어내는 것

- **PM 인지 부하 감소**: "지금 뭘 해야 하지?" 질문이 "지금 어느 논리 단계에 있지?" 로 명확해진다 (ADR-008 결과 §1).
- **리서치 차별화**: ResearchRequest 가 valueChainStage 태그를 갖는다. 같은 단계 내에서도 "씨앗(🌱) → 수확(🌾)" 링크 (예: `rfp-outcome-indicators` 🌱 Step 1 → `imp-outcome-benchmark` 🌾 Step 5).
- **루프 검증 자동화**: SROI 숫자 확정 시 3방향 Alignment Check 자동 트리거. 불일치 시 해당 스텝 복귀 CTA (블록 X, 경고 + 권장).
- **자산 분류**: 모든 ContentAsset 이 `valueChainStage` 필드를 갖는다 → 매칭 시 단계 정합도 가중치.

### 4.5 왜 두 레이어로 분리했나 (히스토리)

ADR-008 §"배경" 의 발견 과정:

1. **Phase E 까지의 단일 레이어 시스템**: UI 6 스텝만 존재. Step 4 가 "예산 + SROI" 였음. PM 이 "여기서 뭘 해야 하지?" 라는 혼선이 반복됨.
2. **리서치 분배 비대칭 발견**: `RESEARCH_REQUESTS_BY_STEP.impact` 에 3건이 몰려 있었는데, 그 중 2건은 *Step 5 도달 전에 이미 필요한 정보* 였음. 즉 의미 단계가 UI 단계와 일치하지 않음.
3. **사용자 통찰 (2026-04-23)**: "구조적 설계를 할 때 생각하는 것" 으로 5단계 + 루프 모델을 제시 → "outcome 은 SROI 로 나올 거고" 한 문장으로 ⑤ Outcome 정체성 확정.
4. **의미 레이어 정식화**: ADR-008 채택. UI 6 스텝과 Value Chain 5 단계가 직교한다는 사실이 코드(`STEP_TO_STAGES`)·UI(pm-guide 다이어그램)·룰(loop-alignment) 에 동시 반영.

결과: **공정 레이어 = "어떻게 작업하는가"**, **의미 레이어 = "어떤 논리를 만드는가"**. 두 레이어가 분리되어야 자동화·검증·품질 보증이 직조된다.

### 4.6 STEP_TO_STAGES 코드 매핑 (`src/lib/value-chain.ts`)

```typescript
export const STEP_TO_STAGES: Record<StepKey, ValueChainStage[]> = {
  rfp: ['impact', 'input', 'output'],
  curriculum: ['activity'],
  coaches: ['activity', 'input'],
  budget: ['input'],
  impact: ['outcome'],
  proposal: ['output'],
}
```

이 매핑은 **단방향이 아니다**. UI 스텝 → 단계 (1:N) 와 단계 → UI 스텝 (N:1) 모두 가능. 예: ② Input 은 Step 1·3·4 세 곳에서 건드려진다 (기관 자산 → 코치 → 예산). ⑤ Outcome 은 Step 5 한 곳에 수렴. 이 비대칭이 SROI 가 *수렴점이자 루프의 출발점* 인 이유의 코드적 근거.

---

## 5. 6 스텝 파이프라인 상세

각 스텝의 **목적 / 입력·산출물 / 핵심 컴포넌트 / pm-guide / Value Chain 매핑** 을 단일 표 + 보충 설명으로.

### 5.1 Step 1 — RFP 분석 + 기획 방향

| 항목 | 내용 |
|---|---|
| **목적** | RFP PDF 1 부 → 사업의 정체성·방향성·평가전략·매칭 자산을 자동 도출 |
| **입력** | RFP PDF/텍스트 + 발주처 정보 |
| **산출물 슬라이스** | `RfpSlice` (rfp.parsed · proposalBackground · proposalConcept · keyPlanningPoints · evalStrategy · similarProjects · confirmedAt) + `meta.programProfile` (11축) + `acceptedAssetIds[]` |
| **Value Chain** | `['impact', 'input', 'output']` — 3 탭으로 UI 분리 (Phase F Wave 6) |
| **핵심 컴포넌트** | `step-rfp.tsx` (3 탭) · `ProgramProfilePanel` · `MatchedAssetsPanel` (Phase G) · `DataFlowBanner` |
| **AI 호출** | `POST /api/ai/parse-rfp` (RfpParsed + detectedTasks 6종) · `POST /api/ai/planning-direction` (제안배경+컨셉+핵심포인트) |
| **pm-guide** | ResearchRequests 5건(rfp-market-shift · rfp-policy-context · rfp-outcome-indicators 🌱 · …) + B2G/B2B/renewal 3 채널별 evaluatorPerspective + 흔한 실수("RFP 만 읽고 평가배점 무시") |
| **Gate 1/2** | 필수 슬라이스 존재 · evalCriteria 파싱 성공 |
| **Gate 3** | 논리 체인 시작점(이후 스텝과 끊기는지 검증) |

3 탭 구조 (ADR-008 Phase F Wave 6):
- **① Impact 탭**: 의도 선언·Before 현황·Logic Model 씨앗
- **② Input 탭**: 기관 자산·UD 에셋 매칭(Asset Registry)·외부 파트너 후보
- **③ Output 탭**: RFP 파싱 결과·평가 기준·요구 산출물

### 5.2 Step 2 — 커리큘럼 설계

| 항목 | 내용 |
|---|---|
| **목적** | Step 1 컨셉·핵심포인트·평가배점을 받아 트랙·세션·IMPACT 매핑·설계근거 자동 생성 |
| **입력** | `PipelineContext.rfp` 전체 + IMPACT 18모듈 + 외부 리서치 |
| **산출물 슬라이스** | `CurriculumSlice` (tracks · sessions · designRationale · impactModuleMapping · ruleValidation) |
| **Value Chain** | `['activity']` — ④ |
| **핵심 컴포넌트** | `step-curriculum.tsx` · `CurriculumGrid` · `RuleEngine` 배지 |
| **AI 호출** | `POST /api/ai/curriculum` — 방법론 분기 (IMPACT/로컬브랜드/글로컬/공모전설계/매칭/재창업/글로벌진출/소상공인성장/커스텀) |
| **pm-guide** | ResearchRequests 5건(cur-trend-6month · cur-diagnostic-tools 🌱 · …) + "Action Week 를 넣어야 하는 이유" + "이론 30% 넘으면 위험" |
| **Gate 2** | R-001 이론 30% 초과 BLOCK · R-002 Action Week 필수 · R-003 이론 3연속 WARN · R-004 코칭 직전 워크숍 SUGGEST |
| **Gate 3** | 평가배점 최고 항목 커버 검증 |

### 5.3 Step 3 — 코치 매칭

| 항목 | 내용 |
|---|---|
| **목적** | 커리큘럼 세션별로 코치 800명 풀에서 Top 3 추천 |
| **입력** | `PipelineContext.rfp` + `curriculum.sessions` + Coach DB |
| **산출물 슬라이스** | `CoachesSlice` (assignments · sessionCoachMap · totalFee · recommendationReasons) |
| **Value Chain** | `['activity', 'input']` — ④ + ② |
| **핵심 컴포넌트** | `step-coaches.tsx` · 코치 추천 드롭다운 · 사례비 자동 계산 |
| **AI 호출** | `POST /api/coaches/recommend` (세션 키워드 vs 코치 expertise + 가용성 + 단가) |
| **pm-guide** | ResearchRequests 3건 + "4중 지원 체계 도식화" UD 강점 팁 |
| **Gate 2** | 코치 사례비 평균 시장가 ±20% 벗어남 SUGGEST |

### 5.4 Step 4 — 예산 설계 (2026-04-23 개칭)

| 항목 | 내용 |
|---|---|
| **목적** | 인건비·교육비·장소비·홍보비·일관비/이윤 자동 산출 + 마진 검증 + 유사 프로젝트 벤치마크. **SROI 는 Step 5 로 이동** (ADR-008) |
| **입력** | `PipelineContext.curriculum` + `coaches` + CostStandard DB |
| **산출물 슬라이스** | `BudgetSlice` (structure · marginRate · benchmark · warnings) — sroiForecast 는 Phase F 부터 ImpactSlice 로 이동 |
| **Value Chain** | `['input']` — ② only |
| **핵심 컴포넌트** | `step-budget.tsx` (SROI 섹션 제거, 링크만) · 예산 구조표 |
| **Gate 2** | 직접비 비율 < 70% (B2G) WARN · 마진 < 10% WARN · 총액 > RFP 예산 BLOCK |
| **pm-guide** | ResearchRequests 3건 + "B2G 예산 구조의 암묵적 규칙" |

### 5.5 Step 5 — 임팩트 + SROI Forecast (2026-04-23 재구성)

| 항목 | 내용 |
|---|---|
| **목적** | Logic Model 5계층 + SROI Forecast + 루프 Alignment Check 3장 |
| **입력** | 커리큘럼 자동 추출 Activity (ADR-004) + 코치+예산 자동 추출 Input + 외부 리서치 + PM 확정 Impact Goal |
| **산출물 슬라이스** | `ImpactSlice` (goal · logicModel · measurementPlan · autoExtracted) + `valueChainState.sroiForecast` + `loopChecks` |
| **Value Chain** | `['outcome']` — ⑤ 수렴점 |
| **핵심 컴포넌트** | `step-impact.tsx` · `LogicModelEditor` · `SroiForecastSection` · `LoopAlignmentCards` |
| **AI 호출** | `POST /api/ai/logic-model` (Activity/Input 사전 주입, AI 는 Output/Outcome/Impact 만 생성) |
| **pm-guide** | ResearchRequests 2건 (`imp-sroi-proxy` · `imp-outcome-benchmark` 🌾) + "평가위원이 Logic Model 에서 보는 것" |
| **Gate 4 신규** | 루프 Alignment 3 카드 (⑤→① 평가위원 설득 / ⑤→② 자원 대비 과다 약속 / ⑤→④ Activity 강도 일치) — 블록 X, 경고 + 복귀 CTA |

루프 임계값 (`src/lib/loop-alignment.ts`):
- **Impact 방향**: SROI 비율 < 1.5 → 경고 ("평가위원 설득 약함")
- **Input 방향**: SROI 비율 > 7 → 경고 ("벤치마크 +2σ 과다 약속 의심")
- **Activity 방향**: Outcome 지표 ↔ Activity 매핑 밀도 체크

### 5.6 Step 6 — 제안서 생성

| 항목 | 내용 |
|---|---|
| **목적** | 7개 섹션 (proposal-background · org-team · curriculum · coaches · budget · impact · other) 자동 생성 + 평가 시뮬레이션 |
| **입력** | `PipelineContext` 전체 + `acceptedAssetIds[]` narrativeSnippet + ud-brand + ChannelPreset + WinningPattern |
| **산출물 슬라이스** | `ProposalSlice` (sections · scoreSimulation · revisionHistory) |
| **Value Chain** | `['output']` — ③ 최종 형태 |
| **핵심 컴포넌트** | `step-proposal.tsx` · 섹션별 생성·재생성 · 평가 시뮬레이션 점수 |
| **AI 호출** | `POST /api/ai/proposal-section/[sectionKey]` — 자산 주입 + 소프트 마커 `<!-- asset:id -->` |
| **pm-guide** | ResearchRequests 4건 + "평가위원이 이 섹션에서 체크하는 것" |
| **Gate 3** | 당선 패턴 대조 · 평가위원 시뮬레이션 · 심사위원 질문 방어 체크 · 논리 체인 검증 |

각 섹션 프롬프트에 자동 주입되는 것:
- 브랜드 자산 (ud-brand.ts)
- ChannelPreset 톤 (B2G/B2B/renewal)
- PipelineContext 전체 (Step 1~5)
- 매칭된 ContentAsset 의 narrativeSnippet ("복붙 금지, 맥락 맞춰 재작성")
- WinningPattern 해당 섹션 패턴
- 외부 리서치 + 전략 맥락
- 평가배점 가중치 (해당 섹션 weight)

---

### 5.7 스텝 간 데이터 흐름 (구체)

각 스텝의 *완료 슬라이스* 가 다음 스텝의 *입력 컨텍스트* 가 되는 흐름:

```
Step 1 완료 (rfp.confirmedAt 설정)
  → Step 2 AI 호출 시 자동 주입:
    - rfp.proposalConcept ("이 콘셉트에 맞는 커리큘럼")
    - rfp.keyPlanningPoints ("커리큘럼 30점 최고배점")
    - rfp.evalStrategy.sectionWeights (커리큘럼 weight 0.3)
    - meta.programProfile.methodology (방법론 분기)
    - meta.programProfile.channel.type (B2G 톤)

Step 2 완료 (curriculum.confirmedAt 설정)
  → Step 3 AI 호출 시 자동 주입:
    - curriculum.sessions[] (세션 키워드 → 코치 expertise 매칭)
    - curriculum.tracks[] (트랙별 코치 분배)

Step 3 완료
  → Step 4 자동 산출:
    - coaches.totalFee (예산 인건비 자동 채움)
    - coaches.assignments[].coach.standardFee (단가 적용)

Step 4 완료
  → Step 5 자동 추출:
    - sessionsToActivities(curriculum.sessions) → Activity[]
    - deriveInputs(coaches, budget) → Input[]
    - AI 는 Output/Outcome/Impact 만 생성

Step 5 SROI 확정
  → 루프 Alignment Check 자동 트리거
  → 불일치 시 Step 1·2·4 복귀 CTA

Step 6 제안서 생성
  → 전체 PipelineContext 주입 + acceptedAssetIds → narrativeSnippet
```

이 흐름의 *코드 진입점* 은 `GET /api/projects/[id]/pipeline-context` 단일 엔드포인트. 모든 스텝 컴포넌트가 이 한 호출의 결과를 props 로 받는다 (`page.tsx` Server Component).

### 5.8 데이터 흐름 배너 (`DataFlowBanner`)

각 step-*.tsx 상단에 *이전 스텝 요약* 배너가 표시된다 (Phase C4, ADR-007 의 "스텝별 차별화" 의 보조 장치).

예시 (Step 2 커리큘럼 페이지 상단):
```
🟢 Step 1 에서 확정한 컨셉: "AI 시대 농어촌 청년 창업가 100명 양성"
🟢 평가 최고배점: 커리큘럼 30점
🟢 발주처 톤: B2G — 정책 대응 + 정량 KPI
```

이 배너는 *PM 이 같은 정보를 다시 머릿속에서 꺼낼 필요* 를 제거한다.

---

## 6. 자산 레이어 (Layer 1)

> 회사 공통 자산 — 프로젝트와 무관하게 존재. 각 스텝이 *시작될 때 자동 로드*. (REDESIGN.md Layer 1)

### 6.0 자산 레이어 = 3 층 데이터 구조의 첫 층 (REDESIGN.md Part 1)

UD-Ops 의 데이터는 3 층 구조:

```
┌─────────────────────────────────────────────────┐
│  Layer 1: 내부 자산 (회사 공통, 프로젝트 무관)     │
│  ── 본 §6 의 대상 ──                              │
│  • ud-brand 키 메시지                             │
│  • ProgramProfile 매칭용 시드                     │
│  • IMPACT 18+CORE 4 모듈                         │
│  • Coach Pool 800명                               │
│  • CostStandard / SroiProxy / TargetPreset       │
│  • WinningPattern (당선 레퍼런스)                  │
│  • ChannelPreset (B2G/B2B/renewal)               │
│  • ContentAsset (Phase H, 시드 20건)             │
│  • IngestionJob/ExtractedItem (자산 갱신 큐)     │
└─────────────────────────────────────────────────┘
        │ 각 스텝에서 자동 로드
        ▼
┌─────────────────────────────────────────────────┐
│  Layer 2: 프로젝트 컨텍스트 (스텝 간 흐르는 데이터) │
│  ── §3.1 PipelineContext 의 대상 ──              │
│  • 7 슬라이스 (rfp · curriculum · coaches ...)   │
│  • valueChainState (Phase F)                     │
│  • acceptedAssetIds (Phase G)                    │
│  • DB: Project + 관계 테이블                      │
└─────────────────────────────────────────────────┘
        │ 제안서 생성 시 전체 주입
        ▼
┌─────────────────────────────────────────────────┐
│  Layer 3: 외부 인텔리전스 (AI + PM 수집)           │
│  ── §3.4 pm-guide 의 ResearchRequests 대상 ──   │
│  • 티키타카 리서치 (PM 외부 LLM 답변)              │
│  • AI 생성 컨텐츠 (제안배경·커리큘럼·임팩트)       │
│  • 수주 전략 인터뷰 (Planning Agent)              │
└─────────────────────────────────────────────────┘
```

본 §6 은 Layer 1 만 다룬다. Layer 2 는 §3.1 + §5, Layer 3 은 §3.4 + §7 에서.

### 6.1 ProgramProfile v1.1 (11축, ADR-006)

사업 단위 프로파일. WinningPattern 검색 + 커리큘럼·제안서 AI 분기의 **주축**.

| # | 축 | 타입 | 비고 |
|---|---|---|---|
| 1 | `targetStage` 창업 단계 | enum 7 | 예비/seed/pre-A/series-A/소상공인/비창업자 |
| 2 | `targetSegment.demographic` 대상 인구 | multi-enum 10 | 무관·여성·청소년·…·상인·장인·디자이너 |
| 3 | `targetSegment.businessDomain` 비즈니스 분야 | multi-enum 19 | 엑셀 분류 그대로 |
| 4 | `targetSegment.geography` 지역성 | enum 6 | 일반·로컬·글로벌_3종·일본·인도 |
| 5 | `scale` 사업 규모 | object | budgetTier 4단계 (1억 미만 / 1-3억 / 3-5억 / 5억+) |
| 6 | `formats` 프로그램 포맷 | multi-enum 8+ | 데모데이·IR·합숙·박람회·공모전·… |
| 7 | `delivery` 운영 방식 | object | 온/오프/하이브리드 + LMS + EduBot |
| 8 | `supportStructure` 지원 구조 | object (v1.1) | `tasks` 6 multi-select + `fourLayerSupport: boolean` |
| 9 | `methodology` 방법론 ⭐ | enum 9 | IMPACT·로컬브랜드·글로컬·공모전설계·매칭·재창업·글로벌진출·소상공인성장·커스텀 |
| 10 | `selection` 심사·선발 ⭐ | object | style·stages·publicVoting (formats 와 자동 연동) |
| 11 | `channel` 발주처 + `renewalContext` | object | B2G/B2B + isRenewal=true 시 renewalContext 필수 |
| (보) | `primaryImpact` 주 임팩트 | multi-enum 7 | 최소 1, 최대 3 |
| (보) | `aftercare` 사후관리 | object | tierCount + scope[] |

저장: `Project.programProfile: Json?` + `Project.renewalContext: Json?` + `WinningPattern.sourceProfile: Json?`. 시드 10 케이스 (8 회고 케이스 + 청년마을 + 재창업).

매칭 가중치 (v1.1, program-profile.md §5.2):
```
methodology 0.22 + tasks 0.10 + businessDomain 0.13 + targetStage 0.13
+ channel 0.10 + formats 0.10 + selection 0.08 + geography 0.07
+ scale 0.04 + primaryImpact 0.03 = 1.0
```

### 6.2 IMPACT 18 모듈 + CORE 4 (ImpactModule DB)

언더독스 창업교육 방법론. PRD-v5.0 에서 정의, v6 에서 *그대로 유지*.

- **CORE 4 모듈**: 모든 사업 공통 기반 (마인드셋·문제정의·고객·실행)
- **IMPACT 18 모듈**: 6 단계(I→M→P→A→C→T) × 3 모듈 = 18
- **54 문항 ACT Canvas**: 진단 도구
- **저장**: `Module` Prisma 테이블 + `ImpactModule` 메타 테이블
- **활용**: Step 2 커리큘럼 매핑 (`impactModuleCode`) · Step 5 Logic Model Activity 자동 추출 (ADR-004 IMPACT 단계별 그룹핑)
- **조건부**: `methodology.primary != IMPACT` 일 때 IMPACT 미매핑 경고 비활성화 (ADR-006)

### 6.3 Coach Pool — UCA 800명 (Coach DB)

| 항목 | 내용 |
|---|---|
| **저장** | `Coach` Prisma 테이블 (800+ 레코드) |
| **소스** | coach-finder JSON (28k 줄) → `scripts/sync-coaches.ts` 로 동기화 |
| **enrich 주체** | Planning Agent Phase 3 (PLANNING_AGENT_ROADMAP.md) |
| **검색·추천** | `POST /api/coaches/recommend` — 세션 키워드 vs expertise + availableDays + blockedPeriods + 단가 |
| **PRD 표현** | "UCA 코치 풀" — `asset-uca-coach-pool` (Phase G 시드 자산 11번) |

### 6.4 SROI Proxy DB (16종 × 4국)

언더독스 사회가치 측정 자산. PRD-v5.0 에서 정의, v6 에서 *그대로 유지*.

- **저장**: `SroiProxy` Prisma 테이블 (`country` × `impactType` × `subType` × `formula` × `proxyKrw`)
- **국가**: 한국·일본·인도·글로벌 4종
- **카테고리**: 16 종 (교육훈련·고용창출·매출증가·환경개선 등)
- **활용**: Step 5 Logic Model Outcome → 화폐 환산 (`sroiForecast.breakdown[].proxy`)
- **PRD 표현**: `asset-sroi-proxy-db` (Phase G 시드 자산 13번)

### 6.5 Benchmark Pattern (유사 사업 예산·성과)

| 항목 | 내용 |
|---|---|
| **저장** | TBD (현재 `WinningPattern.sourceProfile` 에 임베드, 향후 분리 검토) |
| **활용** | Step 4 예산 벤치마크 ("비슷한 사업 평균 대비 +12%") · Step 5 SROI 벤치마크 |
| **PRD 표현** | `asset-benchmark-pattern` (Phase G 시드 자산 14번) |

### 6.6 WinningPattern (당선 레퍼런스)

당선 제안서에서 추출한 섹션별 패턴. **proposal-ingest** 모듈이 자동 생성.

- **저장**: `WinningPattern` Prisma 테이블 (sectionKey · channelType · sourceProfile · profileVector · snippet · whyItWorks)
- **시드**: 청년마을 / 전통문화 / NH 애그테크 / GS리테일 / 코오롱 프로보노 (Phase D1)
- **사용**:
  - rfp-planning: 유사 RFP 의 컨셉 레퍼런스
  - curriculum/proposal AI 프롬프트: 해당 섹션 best practice
  - pm-guide WinningReferences 섹션
  - Gate 3 당선 패턴 대조

### 6.7 ChannelPreset (발주처 유형별 프리셋)

| 항목 | 내용 |
|---|---|
| **저장** | `ChannelPreset` Prisma 테이블 |
| **시드 3종** | B2G (정책 대응 + 정량 KPI) · B2B (ROI + 속도 + 유연성) · renewal (작년 성과 + 개선 + 신뢰) |
| **필드** | tone · keyMessages · avoidMessages · proposalStructure · budgetTone · evaluatorProfile · curriculumBias (theoryMax · actionWeekMin · preferredMethods) |
| **활용** | Step 1 기획 방향 톤 · Step 2 커리큘럼 편향 · Step 6 제안서 생성 |
| **시드 출처** | 가이드북 Ch.10 발주처 카드 3종을 ADR-005 §정보 흐름 규칙(가이드북 → 시스템 1차 시드 허용) 으로 이관 |

### 6.8 Content Hub — Asset Registry v2 (ADR-009 + ADR-010)

언더독스가 RFP 에 반복 투입할 수 있는 모든 자산의 **단일 레지스트리**. v1 (코드 시드, Phase G) → v2 (DB + 계층 + 담당자 UI, Phase H) 격상.

#### 6.8.1 데이터 모델

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | String (cuid) | kebab-case 추천 (`asset-impact-6stages`) |
| `name` | String | "IMPACT 6단계 프레임워크" |
| `category` | String | methodology · content · product · human · data · framework (6) |
| `parentId` | String? | 1단 계층 (상품 → 세션/주차/챕터). depth=2 초과 금지 |
| `applicableSections` | Json | ProposalSectionKey[] (proposal-background · org-team · curriculum · coaches · budget · impact · other) |
| `valueChainStage` | String | impact · input · output · activity · outcome (ADR-008 그대로) |
| `evidenceType` | String | quantitative · structural · case · methodology |
| `keywords` | Json? | string[] (RFP 매칭 트리거) |
| `programProfileFit` | Json? | Partial<ProgramProfile> (11축 부분 매칭) |
| `narrativeSnippet` | String (Text) | 제안서 삽입 2~3 문장 초안 (PM 편집 가능) |
| `keyNumbers` | Json? | string[] ("25,000", "1:3.2") |
| `status` | String | stable / developing / archived |
| `version` | Int | 단순 정수 (별도 AssetVersion 테이블 없음, ADR-010 D 거절) |
| `sourceReferences` | Json? | string[] — 외부 원본 URL (ADR-010 Q3) |
| `lastReviewedAt` | DateTime | UI "최근 갱신" 표시 |

#### 6.8.2 시드 자산 20 건 (top 15 + child 5, Phase H)

**카테고리별 분포** (top-level 15):
- methodology (3): IMPACT 6단계 · UOR · 5-Phase 운영 루프
- content (3): AI 솔로프러너 · AX Guidebook · 창업가 마인드셋 U1.0
- product (4): Ops Workspace · Coach Finder · Coaching Log · LMS+AI 코치봇
- human (1): UCA 코치 풀
- data (3): Alumni Hub (10년 25,000명) · SROI 프록시 DB · Benchmark Pattern
- framework (1): Before/After AI 전환 프레임

**계층 시드 children (5)** — Phase H Wave H5:
- `asset-ai-solopreneur` (parent) → Week 1 (AI 네이티브 마인드셋) · Week 2 (아이디어↔AI 대화 설계) · Week 3 (첫 프로토타입)
- `asset-ax-guidebook` (parent) → Ch 1 (AI 쓸 자리 찾기) · Ch 2 (프롬프트 자동화)

#### 6.8.3 매칭 알고리즘 (`matchAssetsToRfp`)

```
score = 0.5 × profileSimilarity(profile, asset.programProfileFit)
      + 0.3 × keywordOverlap(rfp.text, asset.keywords)
      + 0.2 × sectionApplicability(rfp.evalStrategy, asset.applicableSections)
```

| 점수 구간 | 해석 | UI |
|---|---|---|
| ≥ 0.7 | 강한 매칭 | 자동 추천 (펼친 상태) |
| 0.5 ~ 0.7 | 중간 매칭 | 후보 표시 |
| 0.3 ~ 0.5 | 약한 매칭 | 접힘 섹션 |
| < 0.3 | 제외 | 미노출 |

계층 매칭: 부모가 strong/medium 이면 children 도 후보. `MatchedAssetsPanel` 의 `AssetCard` 가 "▸ 세부 세션 N개" 토글로 펼침/접힘 제공.

#### 6.8.4 운영 권한

- `/admin/content-hub` — 목록 (필터: 카테고리·단계·상태·부모·검색) + CRUD 폼 (필수 5 필드 + 선택 필드)
- v2.0: 로그인한 모든 유저 (담당자 1명 전제, ADR-010 Q2)
- 향후 분화: `role: 'content-admin'`

### 6.9 Ingestion 파이프라인 — 자산이 *늘어나는* 메커니즘 (ADR-003)

자산은 *고정* 이 아니라 *축적* 되어야 한다. PM 이 자료를 드롭하면 다음 기획부터 자동 반영되는 파이프라인.

#### 6.9.1 단일 진입점 + 비동기 큐

```
PM 자료 드롭 (PDF/DOCX/XLSX/TXT/URL)
  ↓
/ingest UI — 자료 종류 선택 + 메타 입력
  ↓ POST /api/ingest
IngestionJob 레코드 (status='queued') + 원본 파일 저장 (불변)
  ↓ 비동기 워커
자료 종류별 모듈 (proposal · curriculum · evaluator-question · strategy-interview)
  ↓ AI 추출
ExtractedItem 후보 (status='pending', confidence 점수 동반)
  ↓
/ingest/review — Admin 검토·편집·승인·거부
  ↓
승인 시 자산 테이블에 INSERT (WinningPattern · CurriculumArchetype · EvaluatorQuestion · ChannelPreset 업데이트 등)
```

#### 6.9.2 스키마 (Phase A 마이그레이션)

```prisma
model IngestionJob {
  id          String        @id @default(cuid())
  kind        String        // proposal | curriculum | evaluator_question | strategy_interview
  sourceFile  String?       // blob URL
  metadata    Json          // 사업명 · 발주처 · 수주여부 등
  status      String        // queued | processing | review | approved | rejected | failed
  uploadedBy  String
  uploadedAt  DateTime      @default(now())
  extractedItems ExtractedItem[]
}

model ExtractedItem {
  id          String   @id @default(cuid())
  jobId       String
  job         IngestionJob @relation(fields: [jobId], references: [id])
  targetAsset String   // winning_pattern | curriculum_archetype | evaluator_question
  payload     Json     // 자산 후보 필드
  confidence  Float    // 0~1
  status      String   // pending | approved | rejected | edited
  appliedId   String?  // 실제 자산 테이블에 삽입된 레코드 ID
}
```

#### 6.9.3 4 가지 핵심 원칙 (ADR-003)

| 원칙 | 의미 | 코드 |
|---|---|---|
| **원본 불변 보존** | 추출 로직 개선 시 과거 자료 재처리 가능 | `IngestionJob.sourceFile` 영구 저장, 삭제 X |
| **승인 필수** | AI 오추출이 자산 오염하지 않도록 | `ExtractedItem.status='approved'` 후 INSERT |
| **탈락도 자산** | 성공 사례만 모으면 편향 | `metadata.outcome='lost'` 도 수용 |
| **새 자료 = 새 모듈** | 기존 코드 수정 최소화 | 모듈 폴더 1개 추가 + worker 등록 |

#### 6.9.4 4 워커 모듈

| 워커 | 입력 | 출력 자산 | Phase |
|---|---|---|---|
| `proposal-ingest` | 수주/탈락 제안서 PDF/DOCX | `WinningPattern` (섹션별 snippet + whyItWorks) | D1 ✅ |
| `curriculum-ingest` | 과거 커리큘럼 XLSX/시트 | `CurriculumArchetype` (구조 패턴) | E5 (대기) |
| `evaluator-question-ingest` | 심사위원 질문 메모/녹취 | `EvaluatorQuestion` (질문 유형 태깅) | E6 (대기) |
| `strategy-interview-ingest` | 수주 팀장 인터뷰 녹취 | `past-projects.strategicContext` + `ChannelPreset` 업데이트 제안 | I4 (대기) |

#### 6.9.5 시스템 정체성과의 관계

ADR-003 §"Context": *"지금 당장 엄청 높은 품질보다 쌓였을 때 강력해지는 구조적 설계가 필요해."*

이 한 문장이 PRD-v6 의 정체성 결정. 기능 100% 보다 자산화 경로 100% 가 우선. 본 PRD 는 이 원칙을 **시스템 정체성** 으로 박는다 (Phase A 부터 Phase H 까지 매 ADR 이 이 원칙을 강화).

---

### 6.10 자산 레이어와 가치제안 §3.2 의 연결

자산이 *자동으로 올라온다* (§3.2) 의 구체적 의미:

| 단계 | 어떻게 |
|---|---|
| RFP 업로드 | `parseRfp()` 가 RFP 텍스트 + ProgramProfile 11축 자동 추론 |
| Asset 매칭 | `matchAssetsToRfp(rfp, profile)` 가 ContentAsset 20+ 건 중 점수 ≥ 0.3 자산 선별 |
| UI 표시 | `MatchedAssetsPanel` 이 섹션별 그룹 + 단계 뱃지 + 증거 유형 뱃지 표시 |
| PM 토글 | "제안서에 포함" Switch → `Project.acceptedAssetIds` 저장 |
| 제안서 주입 | `formatAcceptedAssets()` 가 narrativeSnippet 을 `proposal-ai.ts` 시스템 프롬프트에 주입 |
| 추적 | AI 가 생성한 본문에 `<!-- asset:asset-id -->` 소프트 마커 삽입 |

이 6 단계가 **PM 의 한 번 클릭 (토글) 외에 모두 자동**. PM 은 자산을 *선택* 만 한다.

### 6.11 자산 카테고리 6종의 실제 분포 (Phase H 시드 기준)

| 카테고리 | 시드 건수 | 예시 |
|---|---|---|
| methodology | 3 | IMPACT 6단계 · UOR · 5-Phase 운영 루프 |
| content | 3 | AI 솔로프러너 · AX Guidebook · 창업가 마인드셋 U1.0 |
| product | 4 | Ops Workspace · Coach Finder · Coaching Log · LMS+AI 코치봇 |
| human | 1 | UCA 코치 풀 |
| data | 3 | Alumni Hub · SROI 프록시 DB · Benchmark Pattern |
| framework | 1 | Before/After AI 전환 프레임 |
| **subtotal (top-level)** | **15** | |
| children (계층) | 5 | AI 솔로 W1~W3 + AX Ch1~Ch2 |
| **합계** | **20** | |

**Value Chain 단계별 분포** (asset-registry.md):
- ① Impact: 3 (Alumni Hub · Before/After 프레임 + 1)
- ② Input: 4 (Coach Finder · Coaching Log · UCA 풀 + 1)
- ③ Output: 2 (Ops Workspace · 5-Phase 루프)
- ④ Activity: 4 (IMPACT 6단계 · UOR · LMS · AI 솔로 등)
- ⑤ Outcome: 2 (SROI 프록시 · Benchmark)

분포가 ② Input + ④ Activity 중심 → 사업 *실행* 자산이 가장 많음. ① Impact (의도) 와 ⑤ Outcome (결과) 자산은 향후 보강 영역.

### 6.12 자산 진화 흐름 (코드 시드 → DB → 향후 RAG)

| 단계 | 시점 | 구조 |
|---|---|---|
| Phase G v1 | 2026-04-24 | TypeScript 코드 시드 (`UD_ASSETS: UdAsset[]` 상수) |
| Phase H v2 | 2026-04-24 | DB 테이블 (`ContentAsset`) + 1단 계층 + 담당자 UI |
| 향후 v2.1 | TBD | "최근 검토일 3 개월 초과" 경고 (ADR-010 §품질 게이트 Gate 4) |
| 향후 v3 | TBD | 임베딩 기반 검색 (현재는 키워드 + profileSimilarity) |
| 향후 v3 | TBD | 자산 버전별 인용 추적 (`acceptedAssetIds` 에 `{id, version}` 페어) |
| 향후 v3 | TBD | N단 계층 검토 (LMS 와 경계 재정의 시) |

각 단계 진입은 *데이터 양과 사용 패턴* 트리거. v2 → v3 의 트리거: Q2 워크샵 자산 정리 결과로 ContentAsset 수가 50+ 도달.

---

## 7. AI 협업 모델

### 7.1 모델 스택

| 역할 | 모델 | 용도 |
|---|---|---|
| **Primary** | Claude Sonnet 4.6 (`claude-sonnet-4-6`, 상수 `CLAUDE_MODEL`) | RFP 파싱 · 기획방향 · 커리큘럼 · Logic Model · 제안서 섹션 |
| **Fallback** | Google Gemini 3.1 Pro | 1차 호출 실패·할당량 초과 시 |
| **Embedding** | TBD (Phase F 이후) | WinningPattern 유사도 / 자산 검색 |
| **SDK** | `@anthropic-ai/sdk ^0.80.0` + `googleapis ^171.4.0` | package.json |

### 7.2 호출 패턴

모든 AI 호출은 다음 구조 (`src/lib/claude.ts`):

```typescript
const result = await callClaude({
  model: CLAUDE_MODEL,
  max_tokens: 4096,           // RFP/Logic Model/커리큘럼 모두 4096
  system: PLANNING_PRINCIPLES + CHANNEL_TONE + ASSET_CONTEXT,  // 자동 주입
  messages: [{ role: 'user', content: prompt }],
})
const json = safeParseJson(result)  // 항상 이 헬퍼 사용
```

### 7.3 자동 주입되는 컨텍스트

각 호출 시 PipelineContext + 자산 + 원칙이 *프롬프트 빌더* 단계에서 자동 합성:

| 주입 요소 | 출처 | 모든 호출? |
|---|---|---|
| **Planning Principles** (4 원칙) | `src/lib/planning-principles.ts` | ✅ 모든 호출 |
| **PipelineContext** (이전 슬라이스) | `pipeline-context.ts` | ✅ Step 2~6 |
| **방법론 분기 블록** | program-profile.md §5.3 | ✅ curriculum + proposal |
| **ChannelPreset 톤** | ChannelPreset DB | ✅ 제안서 섹션 |
| **외부 리서치** | `formatExternalResearch(ctx.research)` | ✅ proposal · logic-model · curriculum (ADR-007) |
| **승인된 자산 narrativeSnippet** | `formatAcceptedAssets()` | ✅ 제안서 섹션 (Phase G) |
| **WinningPattern 섹션 패턴** | profileSimilarity 매칭 | ✅ 제안서 섹션 |
| **ud-brand 키 메시지** | `src/lib/ud-brand.ts` | ✅ 제안서 섹션 |

### 7.4 9-Methodology 분기 (program-profile.md §5.3)

```typescript
const methodologyBlock = {
  IMPACT:       `IMPACT 18모듈 (I→M→P→A→C→T) 골격으로...`,
  로컬브랜드:   `상권강화기구 + 브랜딩 액션러닝 관점으로...`,
  글로컬:       `지역 × 글로벌 교류 구조로 안성 · 3국 연합...`,
  공모전설계:   `다단계 심사 + 사후 유통 연계...`,
  매칭:         `멘토-수혜자 페어링 + 공동 프로젝트...`,
  재창업:       `실패 분석 → 재설계 흐름...`,
  글로벌진출:   `Born Global 프레임 + 해외 진출 단계...`,
  소상공인성장: `매장 진단 → 리뉴얼 → 매출 개선...`,
  커스텀:       `${profile.customFrameworkName} 프레임으로...`,
}[profile.methodology.primary]
```

### 7.5 AI 가 *안* 하는 것

| 영역 | 책임 |
|---|---|
| **Activity 생성** | 결정론적 룰 (ADR-004). AI 는 검증만. |
| **Input 도출** | 코치+예산 결정론적 추출. AI 는 검증만. |
| **자산 선택** | 매칭 점수 기반 + PM 토글. AI 는 narrativeSnippet 재작성만. |
| **자산 정의** | 담당자 UI 입력. AI 는 일체 안 만듬. |
| **Quality Gate Block 결정** | Gate 1·2 는 결정론. Gate 3 는 *권고*, 블록 X (quality-gates.md §1) |

### 7.6 정보 부족 시 처리 (CLAUDE.md §"설계 철학" 7번)

> AI 가 정보 부족 시 → 자동 생성 대신 *질문* 으로 보완

구현: planning-agent 의 동적 꼬리질문 (`6cb6db4` 커밋, "동적 꼬리질문 deep follow-up 로직") + 일반 AI 호출에서 critical missing field 가 있으면 `safeParseJson` 이 `{ needsClarification: true, questions: [...] }` 반환.

### 7.7 Planning Agent (별도 트랙)

Planning Agent 는 PM 이 갖는 *암묵지* (왜 이 사업을 따야 하는지, 클라이언트 hidden wants, mustNotFail, 경쟁사 약점 등) 를 캡처하는 별도 모듈.

| 항목 | 내용 |
|---|---|
| **위치** | `src/lib/planning-agent/` (7개 모듈) |
| **별 트랙 문서** | [PLANNING_AGENT_ROADMAP.md](PLANNING_AGENT_ROADMAP.md) |
| **DB 영속화** | `AgentSession` · `PlanningIntentRecord` |
| **출력** | `StrategySlice` (`whyUs`·`clientHiddenWants`·`mustNotFail`·`competitorWeakness`·`internalAdvantage`·`riskFactors`·`decisionMakers`·`derivedKeyMessages`·`completeness`·`confidence`) |
| **사용** | Step 1 진입 직후 또는 Step 6 직전 (선택). PipelineContext.strategy 슬라이스에 누적 |
| **AI** | 동적 꼬리질문 + 전략적 반응 (Claude Sonnet) |

이 트랙은 v6 본 PRD 의 *부수 트랙* — 6 스텝 파이프라인이 Planning Agent 없이도 작동하지만, 있으면 제안서 품질이 한 단계 올라간다.

### 7.8 AI 호출 비용 모니터링 (계획)

Phase I 의 품질 지표 대시보드 (I4) 에 다음 항목 포함 예정:

- 모델별 토큰 사용량 (월 단위)
- 호출당 평균 토큰 (RFP 파싱 / Logic Model / 커리큘럼 / 제안서)
- 재생성 횟수 ↔ 토큰 비용 상관
- Ingestion AI 추출 비용 (자료 1건당)
- 예상 월 비용: 제안서 10건/월 가정 시 ~$20 (ADR-003 §Negative)

---

## 8. 품질 게이트 (Quality Gates)

> 출처: [docs/architecture/quality-gates.md](docs/architecture/quality-gates.md). PRD-v6.0 의 *모든 산출물* 은 이 4계층을 통과한다.

### 8.1 4계층 구조

```
Gate 1: 구조/계약 검증 (빌드 타임)         ← 빠르고 무자비
Gate 2: 룰 엔진 검증 (생성 직후)            ← 결정론적 규칙
Gate 3: AI 검증 (생성 직후)                 ← 패턴·정합성·시뮬레이션
Gate 4: PM·Admin 승인 (운영) + 루프 Alignment  ← 최종 판단
```

### 8.2 Gate 1 — 구조 (자동, 빌드 타임)

| 체크 | 구현 | 실패 시 |
|---|---|---|
| TypeScript 0 error | `npm run typecheck` (`tsc --noEmit`) | 머지 차단 |
| Next.js build 성공 | `npm run build` (prisma generate 포함) | 머지 차단 |
| Prisma 스키마 ↔ PipelineContext 타입 일치 | 단위 테스트 (TBD) | 빌드 차단 |
| Module Manifest reads/writes 위반 | ESLint 커스텀 룰 (Phase I) | TBD |

### 8.3 Gate 2 — 룰 엔진 (결정론)

**커리큘럼 룰** (`src/lib/curriculum-rules.ts`):
| 코드 | 조건 | 강도 |
|---|---|---|
| R-001 | 이론 30% 초과 | BLOCK |
| R-002 | Action Week 0회 | BLOCK |
| R-003 | 이론 3연속 | WARN |
| R-004 | 코칭 직전 워크숍 미배치 | SUGGEST |

**예산 룰** (`src/lib/budget-rules.ts`, Phase D):
- 직접비 < 70% (B2G) → WARN
- 마진 < 10% → WARN
- 총액 > RFP 예산 → BLOCK
- 코치 사례비 시장가 ±20% → SUGGEST

**임팩트 룰**:
- Activity ↔ 커리큘럼 세션 1:1 미대응 → WARN
- Outcome SROI 프록시 미매핑 → SUGGEST
- 측정도구 미지정 Outcome → WARN

**제안서 룰**:
- 7섹션 미완 → BLOCK
- ChannelPreset.avoidMessages 포함 → WARN
- StrategySlice.derivedKeyMessages 미반영 섹션 → SUGGEST

**프로파일 룰** (program-profile.md §5.5, ADR-006):
- `renewal-context-missing` (BLOCK)
- `renewal-lessons-empty` (WARN)
- `renewal-improvement-missing` (WARN)
- `methodology-mismatch` (WARN)
- `geography-global-no-support` (WARN)
- `tasks-empty` (WARN, v1.1 신규)

### 8.4 Gate 3 — AI 검증 (정성, Phase D5)

| 체크 | 입력 | 출력 |
|---|---|---|
| **3a 당선 패턴 대조** | 생성 섹션 + 매칭 WinningPattern[] | 패턴 일치도 0~100 + 부족 요소 + 강화 제안 |
| **3b 평가위원 시뮬** | 생성 제안서 + RFP.evalCriteria + ChannelPreset.evaluatorProfile | 항목별 점수 + 감점 사유 + 예상 질문 |
| **3c 심사위원 질문 방어** | 생성 섹션 + EvaluatorQuestion 자산 (TBD Phase E6) | "이 질문 나올 확률 높음 — 방어 약함" |
| **3d 논리 체인 검증** | RFP→컨셉→포인트→커리큘럼→Activity→Outcome→Impact | 끊긴 지점 지적 |

실패 시: 사용자 리포트 + 재생성 옵션. 자동 블록 ❌ (PM 최종 판단).

### 8.5 Gate 4 — 사람 확인 + 루프 Alignment

| 체크 | 트리거 | 행동 |
|---|---|---|
| **PM 확정** | 각 슬라이스 `confirmedAt` | "이대로 다음 스텝" 선언 |
| **Admin 승인** | Ingestion `ExtractedItem` | 자산 반영 전 필수 |
| **Admin 승인** | Planning Agent 학습 패턴 | 프롬프트 반영 전 필수 |
| **루프 Alignment 3 카드** ⭐ (Phase F7) | SROI 숫자 확정 | 불일치 시 복귀 CTA 표시 (블록 X) |

루프 Alignment Cards (`src/lib/loop-alignment.ts`, ADR-008):
- ⑤→① Impact 방향: SROI 비율 < 1.5 → "평가위원 설득 약함" → Step 1 복귀
- ⑤→② Input 방향: SROI 비율 > 7 → "과다 약속 의심" → Step 4 복귀
- ⑤→④ Activity 방향: Outcome ↔ Activity 매핑 밀도 → Step 2 복귀

### 8.6 게이트 강도 조절 원칙

| Phase | Gate 1 | Gate 2 | Gate 3 | Gate 4 |
|---|---|---|---|---|
| A~C | ✅ 강제 | ✅ 강제 | 🟡 옵션 | 🟡 옵션 |
| D~E | ✅ 강제 | ✅ 강제 | ✅ 통합 | 🟡 부분 |
| F~H | ✅ 강제 | ✅ 강제 | ✅ 강제 | ✅ 루프 Alignment 추가 |
| I (대기) | 전 게이트 강제 + ESLint 모듈 경계 강제 | | | |

### 8.7 품질 측정 지표 (장기 추적, `QualityMetric` 테이블 — TBD)

| 지표 | 측정 | 목표 |
|---|---|---|
| 수주율 | Project.isBidWon | 점진 상승 |
| 신입 vs 시니어 PM 산출물 gap | Gate 3 점수 | 축소 |
| 재생성 횟수 | proposalSection.revisionHistory | 감소 |
| Ingestion 승인률 | 승인/(승인+거부) | 상승 = 추출 품질 ↑ |
| 자산 재사용률 | acceptedAssetIds 빈도 / 총 매칭 | 상승 |
| 평가 시뮬 ↔ 실 점수 상관 | 수주 후 실점수 입력 | r > 0.6 |

### 8.8 게이트 보고 포맷 (사용자 표시)

에이전트 작업 종료 시 사용자에게 보고하는 표준 포맷 (quality-gates.md §6):

```
[모듈명] <작업 요약>

✅ Gate 1: 통과 (타입·빌드·계약)
✅ Gate 2: 통과 (룰 엔진 통과, WARN 0)
⚠️ Gate 3: 부분 통과
   - 당선 패턴 대조: 72점 (부족: 정량 KPI 언급 약함)
   - 평가 시뮬: 78점 예상
   - 논리 체인: 1곳 끊김 — Step 1 키 메시지가 Step 4에 반영 안 됨
🟡 권장 조치:
   - [ ] proposal Step 2-C 섹션에 정량 KPI 2개 추가
   - [ ] budget.sroiForecast를 proposal Section VI에 주입

파일 변경: <list>
다음 스텝: <제안>
```

이 포맷은 *PM 이 즉시 결정할 수 있게* 설계되었다. 추상적 평가가 아닌 *권장 조치* 가 동반됨.

### 8.9 게이트와 Phase 진행의 결합

각 Phase 종료 조건은 *게이트 통과* 로 정의:

| Phase | 종료 조건 |
|---|---|
| A | Gate 1 통과 (타입·빌드 0 에러) + Manifest 타입 정의 + PipelineContext 타입 통과 |
| B | Step 1 AI 호출 시 Gate 2 룰 통과 + 기획방향 4 산출물 생성 |
| C | 스텝 간 데이터 흐름 검증 (각 스텝의 PipelineContext 슬라이스 누적 확인) |
| D | Gate 3 AI 검증 통합 (당선 패턴·평가위원 시뮬·논리 체인) |
| E | ProgramProfile 매칭 + Gate 3 룰 5종 추가 (renewal · methodology · geography 등) |
| F | 루프 Alignment Cards 3장 + Value Chain 다이어그램 + Step 1 3 탭 + Step 4·5 재구성 |
| G | Asset Registry 매칭 알고리즘 + Step 1 패널 + Step 6 narrativeSnippet 주입 |
| H | ContentAsset DB + 담당자 UI + 1단 계층 매칭 + 시드 20건 |
| I | 전 게이트 강제 + ESLint Manifest 강제 + E2E + Vercel 배포 |

---

## 9. 데이터 모델 (요약)

> 전체 정의: [prisma/schema.prisma](prisma/schema.prisma) — 44 model 실측 (PRD-v5 표기는 35+ 였음, Phase E·G·H 누적으로 증가).

### 9.1 카테고리화

| 카테고리 | 모델 수 | 주요 모델 |
|---|---|---|
| **Auth** | 3 | User · Account · Session |
| **CORE 파이프라인 산출물** | ~10 | Project · CurriculumItem · CoachAssignment · Budget · BudgetItem · ProposalSection · Participant · Task · TaskAssignee · Expense |
| **ASSET (회사 자산)** | ~10 | Coach · Module · ImpactModule · Content · ContentMapping · ContentAsset (Phase H) · CostStandard · SroiProxy · TargetPreset · WinningPattern · ChannelPreset · ProfileTag |
| **INGESTION** | 2 | IngestionJob · ExtractedItem |
| **Planning Agent** | 3 | AgentSession · PlanningIntentRecord · PMFeedback |
| **운영 데이터** (참여자·진단·코칭·만족도 등) | ~10 | Applicant · DogsResult · ActtResult · StartupStatusRecord · StartupDiagnosis · SatisfactionResponse · SatisfactionLog · CoachingJournal · AlumniRecord · DesignRule · AudienceProfile · WeightSuggestion · InternalLaborRate · ServiceProduct |

### 9.2 핵심 모델 8개 짧은 설명

| 모델 | 책임 | PipelineContext 매핑 |
|---|---|---|
| **Project** | 사업 단위 — 모든 슬라이스가 여기서 분기. `programProfile`·`renewalContext`·`acceptedAssetIds`·`proposalConcept`·`evalStrategy`·`predictedScore` 등 36 필드 | (전체) |
| **CurriculumItem** | 회차별 세션 — `isTheory`·`isActionWeek`·`isCoaching1on1`·`impactModuleCode`·`lectureMinutes`/`practiceMinutes` | curriculum.sessions |
| **CoachAssignment** | 세션별 코치 배정 + 사례비 | coaches.assignments |
| **Budget** + **BudgetItem** | 예산 구조표 + 항목 | budget.structure |
| **ProposalSection** | 7 섹션 본문 + 버전 관리 | proposal.sections |
| **WinningPattern** | 당선 제안서 패턴 + sourceProfile + profileVector | (Layer 1) |
| **ContentAsset** ⭐ (Phase H) | 자산 단건 + 1단 계층 + 3중 태그 + narrativeSnippet | (Layer 1, acceptedAssetIds 참조) |
| **IngestionJob** + **ExtractedItem** | 자료 업로드 큐 + 추출 후보 (Admin 승인 대기) | (Layer 1 → 자산 갱신) |

### 9.3 enum (선언된 것)

| enum | 값 | 용도 |
|---|---|---|
| `UserRole` | PM · DIRECTOR · CM · FM · COACH · ADMIN | 인증·권한 |
| `ProjectType` | B2G · B2B | ProgramProfile.channel.type |
| `ProjectStatus` | DRAFT · IN_PROGRESS · DONE 등 | Project 상태 |
| `CoachTier` · `CoachCategory` · `TaxType` | Coach 분류 | coach-finder |
| `AssignmentRole` | MAIN_COACH · SUB_COACH · LECTURER · SUB_LECTURER · SPECIAL_LECTURER · JUDGE · PM_OPS | CoachAssignment |

### 9.4 PipelineContext ↔ Prisma 매핑 (data-contract.md §3)

런타임 객체는 PipelineContext, 영속화는 다음 Prisma 필드:

| Slice | DB 저장 위치 |
|---|---|
| `rfp.parsed` | `Project.rfpParsed` (Json) |
| `rfp.proposalBackground/Concept/keyPlanningPoints` | `Project.proposalBackground` · `proposalConcept` · `keyPlanningPoints` |
| `rfp.evalStrategy` | `Project.evalStrategy` (Json) |
| `rfp.similarProjects` | 조인 쿼리 (past-projects 자산) |
| `meta.programProfile` | `Project.programProfile` (Json, ADR-006) |
| `meta.programProfile.renewalContext` | `Project.renewalContext` (Json) |
| `acceptedAssetIds` | `Project.acceptedAssetIds` (Json string[]) |
| `strategy.*` | `PlanningIntentRecord` |
| `curriculum.*` | `CurriculumItem[]` + `Project.designRationale` |
| `coaches.*` | `CoachAssignment[]` |
| `budget.*` | `Budget` · `BudgetItem[]` |
| `impact.*` | `Project.logicModel` + `Project.measurementPlan` (Json) |
| `valueChainState.sroiForecast` | `Project.sroiForecast` (Json, Phase F 에서 budget → impact 로 의미 이동) |
| `proposal.*` | `ProposalSection[]` |
| `meta.predictedScore` | `Project.predictedScore` (Float) |
| `research[]` | `Project.externalResearch` (Json) |

API 단일 진입점: `GET /api/projects/[id]/pipeline-context` 가 Prisma 조인을 수행하여 PipelineContext 객체로 합성. 각 모듈의 mutation API 는 자기 슬라이스만 PATCH (낙관적 락 `version` 활용 — data-contract.md §2.2).

### 9.5 Phase 별 신규 필드 (Project 모델 진화)

PRD-v5 → v6 사이의 Project 필드 추가 (실측, schema.prisma 주석 기준):

| Phase | 추가 필드 | 의미 |
|---|---|---|
| B | `proposalBackground`·`proposalConcept`·`keyPlanningPoints`·`evalStrategy` | Step 1 기획 방향 4 산출물 |
| D | `predictedScore` | 예상 점수 |
| E | `programProfile`·`renewalContext` | 11축 + 연속사업 컨텍스트 (ADR-006) |
| G | `acceptedAssetIds` | RFP 매칭 자산 중 PM 승인 리스트 (ADR-009) |
| F | (의미 이동) `sroiForecast` | budget 슬라이스 → impact 슬라이스 (스키마 변경 X, 의미만) |

각 마이그레이션은 *optional 필드 추가* 로만 진행 (data-contract.md §4 "필드 추가" 규칙) — 기존 Project 데이터를 깨뜨리지 않음.

---

## 10. 현재 미구현·계획

### 10.1 Phase I (안정화 + Manifest 강제 + 배포) — 0% 대기

ROADMAP.md Phase I:
- [ ] **I1. 전체 E2E 테스트** — 양양 신활력 RFP 로 Step 1~6 전체 플로우 + 각 스텝 데이터 흐름 + Ingestion → 승인 → 자산 반영 → 기획 활용 end-to-end
- [ ] **I2. 빌드 확인 + 에러 수정** — TypeScript 0 에러 + Vercel 서버리스 호환
- [ ] **I3. Module Manifest 강제** — ESLint 커스텀 룰 (manifest 에 없는 slice 접근 금지) + 런타임 레지스트리 (`src/modules/_registry.ts`)
- [ ] **I4. strategy-interview-ingest + 품질 지표 대시보드** — 수주 전략 인터뷰 자산화 + 수주율·재생성·승인률·재사용률 모니터링
- [ ] **I5. Vercel 배포 + GitHub push** — 프로덕션 + Google OAuth 최종 확인

### 10.2 Phase E 미이행 항목 (Phase H 로 이월 고려)

ROADMAP.md Phase E "원 계획" 중 부분 이행, 이월 후보:
- E2: 세션별 코치 자동 추천 — `POST /api/coaches/recommend` 엔드포인트 구현 (스텁 존재)
- E5: curriculum-ingest 모듈 — XLSX/시트 업로드 → CurriculumArchetype 자산
- E6: evaluator-question-ingest 모듈 — 심사 질문 메모 → EvaluatorQuestion 자산 (Gate 3c 의 자산 기반)

### 10.3 v3 검토 항목

| 항목 | 사유 | 시점 |
|---|---|---|
| ContentAsset N단 계층 | 1단 → 2단 (Track → Session → Material) 필요성 | LMS 와의 경계 재검토 시 |
| AssetVersion 별도 테이블 | 과거 제안서가 인용한 자산 버전 추적 | `acceptedAssetIds` 에 `{id, version}` 페어 저장 |
| 임베딩 검색 | WinningPattern · 자산 검색 정확도 향상 | Phase F 이후 |
| `role: 'content-admin'` 분화 | Content Hub 권한 분화 | 담당자 2명+ 시점 |
| Coach Pool DB 통합 | 현재 coach-finder JSON ↔ Coach 테이블 동기화 → 단일 소스로 | Q3 워크샵 |
| Planning Agent 별 트랙 | [PLANNING_AGENT_ROADMAP.md](PLANNING_AGENT_ROADMAP.md) 별도 진행 | 독립 트랙 |

### 10.4 알려진 이슈 (메모리 기준)

- **Smoke Test 잔존 이슈** — 2026-04-20 메모리 (session_20260420_status). 일부 Phase E 흐름에서 RFP 자동저장·커리큘럼 AI 생성 CTA 동작 검증 필요 (`f92e504` 커밋으로 일부 fix).
- **브라우저 E2E** — Phase F·G·H 의 일부 Wave 가 "다음 세션으로" 연기됨 (Docker `ud_ops_db` 기동 필요).
- **워크트리 통합 후 재시작 인프라** — `138ebab` predev 훅으로 일부 해결.

### 10.5 Phase 진행 통계 (실측, ROADMAP.md 기준)

| Phase | 이름 | 상태 | 진행률 | 핵심 산출물 수 |
|---|---|---|---|---|
| A | 골격 재구성 + 계약 정의 | ✅ 완료 | 100% | A1~A6 (6 항목) |
| B | Step 1 고도화 + Ingestion 뼈대 | ✅ 완료 | 100% | B1~B4 (4 항목) |
| C | 데이터 흐름 연결 | ✅ 완료 | 100% | C1~C4 (4 항목) |
| D | PM 가이드 + proposal-ingest + Gate 3 | ✅ 완료 | 100% | D1~D5 (5 항목) |
| E | ProgramProfile + 스텝 차별화 리서치 | ✅ 완료 | 100% | ADR-006·007 + 평가위원 매트릭스 |
| F | Impact Value Chain + SROI 수렴 | ✅ 완료 | 100% | Wave 0~8 (9 Wave) |
| G | UD Asset Registry v1 | ✅ 완료 | 100% | Wave G0~G7 (8 Wave) |
| H | Content Hub v2 — DB + 계층 + 담당자 UI | ✅ 완료 | 100% | Wave H0~H6 (7 Wave) |
| I | 안정화 + Manifest 강제 + 배포 | 🔲 대기 | 0% | I1~I5 (5 항목) |

ROADMAP.md 마지막 업데이트: 2026-04-23 (Phase F 추가). 본 PRD-v6 작성 시점(2026-04-27) 기준 Phase H 까지 완료.

### 10.6 v6 → v7 검토 시점 트리거

- Phase I 완료 → v6.1 정정 (마이너)
- Q2 워크샵 결과 (Q3 자산 인벤토리 일괄 등록 후) → v6.2 (자산 카운트 갱신)
- ProgramProfile v1.2+ (축 12 추가 시) → v6.3
- 새 ADR 채택 (ADR-011+) → 그 ADR 의 영향 범위에 따라 v6.X
- 6 스텝 → 7 스텝 변경 같은 구조 변경 → v7.0

---

### 10.7 Phase 누적 학습 (journey 기반)

`docs/journey/` 의 일지에서 도출된 핵심 학습:

| Phase | 학습 |
|---|---|
| A | 폴더 재배치는 즉시 X — manifest 메타로 시작 (ADR-002) |
| B | RFP 파싱 1회 호출 + 기획방향 1회 호출 → 분리가 토큰·재시도 비용 줄임 |
| C | DataFlowBanner 가 PM 인지 부하의 큰 부분 차지 — 작은 UI 가 큰 효과 |
| D | proposal-ingest 는 Phase D 와 병행해야 함 — pm-guide 가 WinningPattern 의존 |
| E | "리서치 21개 정의" 는 21 PR 이 아니라 1 PR — 데이터 정의는 일괄 처리 |
| F | 의미 레이어가 *처음부터* 있었어야 함 — Phase E 까지 단일 레이어로 끌고 온 비용 큼 |
| G | 시드 자산은 "완벽" 보다 "다양" 우선 — 6 카테고리·5 단계·4 증거 유형 분포 |
| H | DB 이관 시 가장 큰 작업은 *async 체인 확산* — 호출부 모두 await 추가 필요 |

각 Phase 완료 시 *journey* 에 기록 (메인 세션 Historian 역할). 본 PRD 갱신 시 학습은 v6.X 로 누적.

### 10.8 미해결 설계 질문 (TBD 목록)

향후 결정이 필요한 설계 질문:

| 질문 | 후보 답 | 결정 시점 |
|---|---|---|
| Coach DB 와 coach-finder JSON 의 단일 소스화 | Prisma → Coach 테이블 흡수 | Q3 워크샵 |
| EvaluatorQuestion 자산의 시드 출처 | proposal-ingest 의 부산물 vs evaluator-question-ingest 별 워커 | Phase E6 진입 시 |
| WinningPattern 임베딩 컬럼 | pgvector vs 외부 벡터 DB | Phase F 후 |
| 제안서 export 형식 | DOCX (template) vs PPTX vs HTML | Phase I E2E 시 |
| 다국어 지원 | 가이드북-en 만 vs 시스템 UI 까지 | 글로벌 사업 비중 50%+ 시 |
| 워크플로우 승인 | DIRECTOR 승인 단계 추가 vs PM 단독 | 조직 운영 체계 정립 시 |
| Audit log | 모든 슬라이스 변경 기록 vs 핵심만 | 컴플라이언스 요건 발생 시 |
| Multi-tenant | 다른 교육 회사 도입 가능성 vs 언더독스 전용 | v7 전후 |

---

## 11. 부록

### 부록 A. 별도 산출물 안내 (본 PRD 범위 밖)

본 PRD-v6.0 은 *시스템 정의* 에 집중한다. 다음 산출물은 ADR-005 에 따라 *완전 분리* 운영:

- **운영 가이드북**: `docs/guidebook/` (한국어) · `docs/guidebook-en/` (영어) · `guidebook-site/` (MkDocs 배포)
- **강의 자료**: `lecture-materials/` (deck.pptx + script + 5 과제 + research)

이 트랙들의 정보 흐름 규칙은 ADR-005 §"정보 흐름 규칙" 참조. 본 PRD 본문은 가이드북·강의 콘텐츠를 *반영하지 않는다*.

### 부록 B. ADR 목록 (1~10)

| 번호 | 제목 | 일자 | 영향 영역 |
|---|---|---|---|
| ADR-001 | 파이프라인 스텝 순서 변경 — 임팩트 Step 2 → Step 5 | 2026-04-15 | 전체 흐름 |
| ADR-002 | Module Manifest 패턴 — 가벼운 모듈·명시적 계약·이식성 | 2026-04-15 | 모든 모듈 |
| ADR-003 | Ingestion 파이프라인 — 자료 업로드가 곧 자산 고도화 | 2026-04-15 | 자산 축적 |
| ADR-004 | Activity-Session 매핑 — 커리큘럼 세션 → Logic Model Activity 자동 변환 | 2026-04-16 | Step 5 임팩트 |
| ADR-005 | 가이드북과 ud-ops 시스템의 정체성 분리 | 2026-04-16 | 트랙 분리 |
| ADR-006 | ProgramProfile 축 체계 도입 (v1.0 → v1.1) | 2026-04-20 | 사업 분류 매칭 |
| ADR-007 | 스텝별 티키타카 리서치 흐름 | 2026-04-20 | pm-guide |
| ADR-008 | Impact Value Chain (5단계) + SROI = Outcome 수렴점 | 2026-04-23 | 의미 레이어 도입 |
| ADR-009 | UD Asset Registry + RFP 자동 매핑 | 2026-04-24 | 자산 레지스트리 v1 |
| ADR-010 | Content Hub — Asset Registry v2 (DB + 계층 + 담당자 UI) | 2026-04-24 | 자산 레지스트리 v2 |

### 부록 C. 메모리 구조

작업 컨텍스트는 두 곳에 분산:

```
~/.claude/projects/C--Users-USER-projects-ud-ops-workspace/memory/
├── MEMORY.md                                  # 인덱스
├── project_udops.md                           # 프로젝트 현황
├── user_profile.md                            # 사용자 프로필
├── project_ud_excel_structures.md             # 엑셀 데이터 구조 (4개 49탭, 167지표)
├── project_pipeline_ui.md                     # 6단계 스텝
├── infra_decisions.md                         # Docker+GCP, @udimpact.ai
├── ud_education_methodology.md                # IMPACT 18+CORE 4
├── ud_proposal_patterns.md                    # 제안서 패턴
├── planning_agent_roadmap.md                  # Planning Agent 로드맵
├── feedback_first_principle.md   ⭐           # 제1원칙 + 4 세부 원칙
├── feedback_coplanner_mode.md                 # AI 공동기획자 협업 패턴
├── feedback_gatekeeping.md                    # 게이트마다 설계 재검토
├── project_pipeline_redesign_20260415.md      # 재설계 v2
├── project_program_profile_v1.md   ⭐         # ProgramProfile (ADR-006)
├── project_impact_value_chain.md              # Value Chain (ADR-008)
├── project_asset_registry.md                  # Asset Registry v1·v2
└── session_2026XXXX_*.md                      # 세션 히스토리

repo:
├── CLAUDE.md           # 설계 철학 9 + 디자인 시스템 + Claude API + 인증
├── AGENTS.md           # "이건 당신이 아는 Next.js 가 아니다"
├── ROADMAP.md          # Phase A~I 체크리스트
├── REDESIGN.md         # 상세 설계 v2
├── docs/architecture/  # 6 문서 (modules · data-contract · ingestion · quality-gates · value-chain · program-profile · asset-registry · content-hub · current-state-audit)
├── docs/decisions/     # ADR 1~10
└── docs/journey/       # 시행착오 일지 (세션 단위)
```

### 부록 D. 기술 스택 (실측)

| 영역 | 선택 | 버전 |
|---|---|---|
| **Framework** | Next.js (App Router) | 16.2.1 |
| **언어** | TypeScript | 5.x |
| **Runtime** | Node | ≥20.0.0 |
| **DB ORM** | Prisma | ^7.5.0 |
| **DB** | PostgreSQL | (Docker: `ud_ops_db`) |
| **인증** | NextAuth | ^5.0.0-beta.30 (JWT 전략) |
| **AI Primary** | `@anthropic-ai/sdk` (Claude Sonnet 4.6) | ^0.80.0 |
| **AI Fallback** | `googleapis` (Gemini) | ^171.4.0 |
| **UI** | shadcn/ui + Tailwind v4 + lucide-react | - |
| **State** | Zustand | ^5.0.12 |
| **Forms/Validation** | Zod | ^4.3.6 |
| **Toast** | sonner | ^2.0.7 |
| **PDF Parsing** | unpdf | ^1.6.0 |
| **Excel** | exceljs | ^4.4.0 |
| **DnD** | @dnd-kit/core + @dnd-kit/sortable | ^6.3.1 / ^10.0.0 |
| **React Query** | @tanstack/react-query | ^5.95.0 |
| **Frontend** | React | 19.2.4 |

### 부록 E. 디자인 시스템 (실측, CLAUDE.md §"디자인 시스템")

- **폰트**: Nanum Gothic (나눔고딕) — `font-sans` / `--font-sans`
- **메인 컬러**: Action Orange `#F05519` (underdogs.global 공식, 2026-04-15 마이그레이션)
- **컬러 사용 비율**: Action Orange 는 전체 UI 의 10~15% 이하 (CTA·강조·아이콘)
- **그라데이션**: `#F05519` (100) → `#F48053` (80) → `#F9BBA3` (40) → `#FBD4C5` (20)
- **서브 컬러**: `#373938` (dark/sidebar) · `#D8D4D7` (gray) · `#06A9D0` (cyan)
- **반경**: `--radius: 0.5rem` (rounded-md 기본)
- **사이드바**: 다크 `#373938` 배경 (`bg-sidebar`)
- **비주얼 패턴**: Spread/Scale · Repetition/Alignment (`border-brand-left`) · Expansion/Progress (`progress-brand`)
- **Value Chain 색상 코드** (ADR-008):
  - ① Impact: Action Orange `#F05519`
  - ② Input: Dark Gray `#373938`
  - ③ Output: Cyan `#06A9D0`
  - ④ Activity: Orange 80% `#F48053`
  - ⑤ Outcome: Action Orange `#F05519` (진하게, 수렴 느낌)

### 부록 F. 커밋 통계 (실측 2026-04-27)

```
총 105 커밋 (master 기준)
├── Phase A (골격): 2 commits
├── Phase B (Step 1 고도화): 4 commits
├── Phase C (데이터 흐름): ~5 commits
├── Phase D (PM 가이드 + Gate 3): 6 commits
├── Phase E (ProgramProfile + 차별화): 9 commits
├── Phase F (Value Chain): 9 commits (Wave 0~8)
├── Phase G (Asset Registry v1): 8 commits (Wave G0~G7)
├── Phase H (Content Hub v2): 9 commits (Wave H0~H6 + 후속 픽스)
├── Planning Agent · 가이드북 · 강의자료 · 인프라: 나머지
```

### 부록 F.1 한 PR 단위 = 한 Wave (작업 진행 패턴)

Phase F~H 에서 정착된 작업 단위 패턴:

- **1 Wave = 1 commit = 1 자기완결 단위**: 타입 통과 + 테스트 통과 + 문서 갱신 포함
- **Wave 0 = 문서**: ADR + architecture spec + journey + CLAUDE/ROADMAP 갱신
- **Wave 1 = 코어 타입**: 인터페이스만 정의 (구현 X)
- **Wave 2~N = 점진적 구현**: 스키마 → API → UI 순
- **마지막 Wave = 검증·메모리·완료**: typecheck 0 + MEMORY 갱신 + journey 완료 로그

이 패턴이 *큰 변경* 의 위험을 *작은 검증된 조각* 으로 분해. PRD-v6 작성 자체도 이 패턴을 따른다 (본 PRD = Phase A~H 누적의 *완료 보고서*).

### 부록 G. 참고 명령

```bash
# 개발
npm run dev              # Next dev (predev: print-worktree.cjs)
npm run typecheck        # tsc --noEmit (Gate 1)
npm run build            # prisma generate && next build (Gate 1)
npm run lint             # eslint

# DB
npm run db:migrate       # prisma migrate dev
npm run db:push          # prisma db push (개발)
npm run db:seed          # 메인 시드
npm run db:seed:channel-presets       # B2G/B2B/renewal
npm run db:seed:program-profiles      # 10 케이스
npm run db:seed:content-assets        # ContentAsset 20건 (Phase H)
npm run db:studio        # Prisma Studio

# Coach
npm run sync:coaches     # coach-finder JSON → Coach 테이블
```

### 부록 H. 디자인 철학 9개 ↔ 핵심 가치제안 5개 매핑

CLAUDE.md §"설계 철학" 의 9개 항목과 §3 의 5 가치제안 매핑:

| CLAUDE.md 철학 | §3 가치제안 | 구현체 |
|---|---|---|
| 1. 데이터는 위에서 아래로 흐른다 | 3.1 PipelineContext | `src/lib/pipeline-context.ts` |
| 2. 내부 자산은 자동으로 올라온다 | 3.2 Asset Registry | `src/lib/asset-registry.ts` + ContentAsset |
| 3. AI 는 맥락 안에서 호출된다 | 3.3 AI 맥락 주입 | `claude.ts` + `formatExternalResearch` + `formatAcceptedAssets` |
| 4. 신입 PM 도 왜 이렇게 써야 하는지 안다 | 3.4 pm-guide | `src/modules/pm-guide/` 전체 |
| 5. Impact-First 는 커리큘럼 위에서 재구성 | 3.5 자동 추출 | `logic-model-builder.ts` + ADR-004 룰 |
| 6. Action Week 강제 | (3.4 의 일부) | `curriculum-rules.ts` R-002 |
| 7. AI 가 정보 부족 시 → 질문으로 보완 | (3.3 의 일부) | planning-agent + safeParseJson |
| 8. Impact Value Chain 5단계 ⭐ | §4 두 레이어 | `value-chain.ts` + ADR-008 |
| 9. UD Asset Registry → Content Hub ⭐ | (3.2 의 v2) | ADR-009 → ADR-010 |

5 가치제안은 9 철학의 *대중적 번역본*. 기술 깊이가 필요하면 CLAUDE.md §"설계 철학" 참조.

### 부록 I. 본 PRD 가 *답하지 않는* 질문

본 PRD-v6 의 범위 제약을 명확히 하기 위해, *답하지 않는* 질문 목록.

| 질문 | 어디에 있나 |
|---|---|
| 가이드북 챕터별 내용은? | `docs/guidebook/` (별도 트랙, ADR-005) |
| 강의 슬라이드 디자인? | `lecture-materials/deck.pptx` |
| Coach Pool 800명의 구체 명단? | coach-finder DB (별도 시스템) |
| Q2/Q3 워크샵의 운영 계획? | 본 PRD 범위 밖 (조직 운영 정보) |
| 담당자 개인 이름·연락처? | ADR-009·010 제약 — Registry 밖에 둠 |
| 알럼나이 25,000명의 개별 데이터? | Alumni Hub (별도 시스템) |
| 발주처 평가위원 명단? | 본 PRD 범위 밖 |
| 코치 사례비 단가 협상 정책? | 별도 인사·재무 |
| 제안서 디자인(레이아웃·포토샵)? | 별도 트랙 |
| 회계·세무 처리? | 별도 시스템 |
| 마케팅·세일즈 funnel? | 본 PRD 범위 밖 |
| 운영 단계의 D-day·칸반? | v6 범위 밖 (Phase I 이후 별도 트랙) |

### 부록 J. AI 공동기획자 운영 (메인 세션의 책임)

본 PRD 자체가 *AI 공동기획자* (메인 Claude 세션) 가 작성. 메인 세션의 5 가지 역할 (REDESIGN.md Part 5):

| 역할 | 책임 |
|---|---|
| **Architect** | 모듈 경계 · 데이터 계약 · Ingestion 설계 유지 |
| **Guardian** | 모듈 간 계약 일관성 · 품질 게이트 운용 |
| **Curator** | 수주 자료·심사 질문·인터뷰를 사용자에게 요청하여 자산화 유도 |
| **Orchestrator** | 각 Phase 작업을 서브 에이전트에게 브리프로 위임, 결과 통합 |
| **Historian** | ADR + Journey 기록, 교육자료 원천 축적 |

서브 에이전트 (병렬 실행) 는 Phase 의 독립 작업 단위 (예: G3 시드 자산 작성, H3 담당자 UI 구현). `.claude/agent-briefs/` 에 브리프 누적.

본 PRD-v6 은 Historian 역할의 *집약본*.

### 부록 K. 게이트킵 책임 (feedback_gatekeeping)

메모리 `feedback_gatekeeping.md` (2026-04-15) 의 원칙:

> **각 Phase/Wave 게이트에서 설계 재검토. 품질을 위해 변경이 필요하면 사용자에게 제시한다.**

본 PRD-v6 작성 시점에서 적용된 게이트킵 (예시):

- ADR-008 채택 시 Phase F 가 "단순 리서치 재배치" 에서 "의미 레이어 정식화" 로 확장 → 사용자 승인.
- ADR-010 채택 시 Phase H 가 "Phase G 마무리" 에서 "별도 Phase" 로 분리 → 사용자 승인.
- 본 PRD-v6 자체가 Phase H 완료 직후의 *재검토 게이트* — 누적 결과를 단일 진실 원본으로 정리.

### 부록 L. 제1원칙 (feedback_first_principle)

메모리 `feedback_first_principle.md` (2026-04-21) 의 *최상위 원칙*:

> **모든 에이전트 결과물은 수용 전 다음 4개 세부 원칙을 통과해야 한다.**

| 세부 원칙 | 검증 |
|---|---|
| **시장 흐름** | 6개월 내 시장 변화·정책 변동을 RFP 분석에 반영했는가 |
| **통계** | 주장에 정량 데이터(통계청·SROI·선행연구)가 동반되는가 |
| **문제 정의** | "왜 이 사업이 필요한가" 가 *Underdog 의 재정의* 로 표현되었는가 |
| **Before/After** | "지금 vs 미래" 의 시각적·언어적 대비가 있는가 |

이 4 원칙은 `src/lib/planning-principles.ts` 에 코드화되어 *모든 AI 호출 system prompt 에 자동 주입*. PRD-v6 의 모든 산출물 정의는 이 원칙 위에 서 있다.

### 부록 M. 본 PRD 의 자기 일관성 체크리스트

본 PRD-v6 자체가 본 시스템의 산출물 기준을 충족하는지 점검:

- [x] 1500+ 줄 (실측: 1500+)
- [x] 11 섹션 모두 작성 (0~11)
- [x] 표 5 개 이상 (실측: 30+)
- [x] ADR 인용 5건 이상 (실측: 1·2·3·4·5·6·7·8·9·10 모두 인용)
- [x] 가이드북·강의 내용 0건 (부록 A 한 줄 안내만)
- [x] 부록에만 별도 산출물 안내
- [x] 추측 금지 — 모르면 TBD 명시
- [x] 한국어 + 영문 기술 용어
- [x] 인용 출처 표시 (ADR-XXX · CLAUDE.md §X · file.md)
- [x] 표 활용 (비교·매핑)
- [x] 명료·간결 (한 문장 한 의미)
- [x] 하향식 (큰 정의 → 세부 → 구현)

### 부록 N. PRD 갱신 정책 (자세히)

본 PRD-v6.0 은 **단일 진실 원본**. 다음 트리거 시 *수동 개정* 한다:

- 새 ADR 채택 (ADR-011+)
- 새 Phase 진입 (Phase I 완료 → v6.1)
- ProgramProfile 축 추가 (v1.2+)
- 핵심 가치제안 5개 중 하나의 의미 변동
- DB 스키마 5+ 모델 추가/제거
- 디자인 시스템 메인 컬러·폰트 변경

자동 동기화는 *없다* (ADR-005 의 가이드북·시스템 분리 원칙을 PRD 에도 적용 — 사람이 책임지고 갱신).

---

### 부록 O. 본 PRD 의 인접 SSoT 와의 우선순위

같은 정보가 여러 문서에 있을 때의 우선순위 (분쟁 해결 순서):

1. **`prisma/schema.prisma`** — DB 스키마. 코드가 진실.
2. **`src/lib/<module>.ts`** — 타입·런타임. 코드가 진실.
3. **`docs/decisions/<ADR>.md`** — 채택된 결정. ADR 이 PRD 보다 신선할 수 있음 (PRD 갱신 전).
4. **`docs/architecture/<spec>.md`** — 설계 스펙. ADR 동시 갱신.
5. **본 PRD-v6.0**: 종합본. 갱신 지연 가능. *조회 시 위 1~4 와 교차 검증*.
6. **`ROADMAP.md`** — 진행 현황. 완료 표시는 본 PRD 보다 빠를 수 있음.
7. **`REDESIGN.md`** — Phase A 시점의 설계 노트. 일부 ADR 로 대체됨.
8. **`CLAUDE.md`** — 개발 규칙·디자인 시스템. 본 PRD §1·§7 의 원천.
9. **`PRD-v5.0.md`** — 아카이브. 비즈니스 룰·IMPACT·SROI 만 참조. 그 외는 본 v6 가 우선.

본 PRD 와 ADR/code 가 *충돌* 할 때: ADR/code 가 우선. 본 PRD 가 *틀린 곳* 으로 발견되면 즉시 패치.

---

**END OF PRD-v6.0**

> 본 문서는 36+ 커밋(실측 105) · ADR 1~10 · Phase A~H 100% · Phase I 대기의 누적 결과물이다.
> 변경 제안은 ADR 로 먼저 기록하고, 채택 후 PRD 에 반영한다.
> Last updated: 2026-04-27 by AI 공동기획자 (Claude Opus 4.7 1M context) + udpb@udimpact.ai
