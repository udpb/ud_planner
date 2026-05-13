# PRD-v7.1 — UD-Ops Workspace

> 언더독스 교육 사업 제안 자동화 웹앱의 **단일 진실 원본 (Single Source of Truth)**.
> v7.0 은 시스템 정체성을 **Express Track (메인) + Deep Track (보조)** 두 트랙으로 재정의했고,
> v7.1 은 **Phase L 100% 종료 + Phase I I2/I3/I5 + Phase J PoC** 운영 마일스톤을 반영한다.
> 본 PRD 는 시스템 정의에 집중한다. 운영 가이드북·강의 자료는 별도 산출물 (부록 A 참조).

---

## 0. 메타

### 0.1 버전 정보

| 항목 | 값 |
|---|---|
| **버전** | v7.1 (minor — v7.0 운영 마일스톤 반영) |
| **상태** | Active (Single Source of Truth) |
| **작성일** | 2026-04-27 (v7.0) · 2026-04-29 (v7.1) |
| **선행 PRD** | [PRD-v6.0.md](PRD-v6.0.md) (Phase A~H 누적 — Archived 2026-04-27) |
| **핵심 트리거** | ADR-011 Express Mode 채택 — 사용자 통찰 *"핵심은 RFP에 맞춰서 당선 가능한 기획 1차본이 나오는거지"* |
| **선행 결정** | ADR-001 ~ ADR-011 |
| **관련 스펙** | [docs/architecture/express-mode.md](docs/architecture/express-mode.md) v1.0 · [docs/architecture/user-flow.md](docs/architecture/user-flow.md) v1.0 (v7.1 신규) |
| **작성 주체** | AI 공동기획자 (Claude Opus 4.7 1M context) + 사용자 (udpb@impact.ai) |
| **프로덕션** | https://ud-planner.vercel.app (2026-04-29 가동, Neon PostgreSQL ap-southeast-1) |

### 0.2.1 v7.0 → v7.1 변경 요약 (2026-04-29)

v7.0 발행 직후 2일 (2026-04-28~29) 동안 Phase L 풀 구현 + 프로덕션 가동 + Phase I·J 진행. 시스템 정체성·정의는 v7.0 그대로 유지하고, 운영 마일스톤만 반영하는 minor bump (v7.1).

| 영역 | v7.0 | v7.1 | 근거 |
|---|---|---|---|
| **Phase L (Express)** | L0/L1 ✅, L2~L6 대기 | **L0~L6 100% 완료** (PoC + 검수 에이전트 + Deep 인계 + 카드 인라인 + 종료 트리거 + autosave 400 fix) | `d451d28` `6eb142b` `fcc5715` `c11539a` `247f48e` `f794ed4` `d5935b2` `293da2a` `42e31b4` `90c67b4` |
| **Phase I (안정화·배포)** | 대기 | **I2/I3/I5 완료** (ESLint 0 errors / Module Manifest registry + check:manifest / Vercel 프로덕션 배포 + Neon 시드) | `2937e49` `65e6348` `7ac0fd7` |
| **Phase J (엑셀)** | 명시 X | **PoC 5 시트 완료** (exceljs + buildProjectExcel + /api/projects/[id]/export-excel + UI 버튼) | `90c67b4` |
| **프로덕션** | 미배포 | **https://ud-planner.vercel.app 가동** (Neon ap-southeast-1, Gemini Primary + Claude Fallback) | I5 |
| **NextAuth 컨벤션** | middleware.ts | **proxy.ts (Next.js 16 권장)** | `90c67b4` |
| **User Flow 문서** | 미정의 | **`docs/architecture/user-flow.md` v1.0** — Express + Deep + 데이터 흐름 ASCII | v7.1 |
| **자산 자동 인용 정밀화** | placeholder 신뢰도 0.3 | **실제 DB 조회 0.4~0.75** (ContentAsset + CostStandard + Coach.count + coach-finder 외부 프롬프트) | `d5935b2` (L4) |
| **검수 에이전트** | 명시 백로그 | **inspectDraft() 7 렌즈 + heuristicInspect() fallback** (사용자 명시 요청 처리) | `6eb142b` (L5) |
| **Express → Deep 인계** | markCompleted 시에만 | **handoffToDeep 명시 트리거 + 1차본 미승인도 정밀 기획 클릭 시 자동 sync** | `247f48e` (L6) |

### 0.2 v6.0 → v7.0 핵심 변경 요약

PRD-v6.0 (2026-04-27 작성, 같은 날 Archived) 은 Phase A~H 누적 결과를 *6 스텝 파이프라인 단일 정체* 로 정리했다. 그러나 작성 직후 사용자가 한 통찰이 시스템 정체성 자체를 재정의했다:

> *"언더독스의 강점은 부각이 되지만 RFP에 따라 유연하게 적용 유무를 판단하고 적용하면서, 과정이 가장 사용자 친숙한 방식으로 되려면 어떻게 해야할까? 복잡도가 올라가는 방식보다는 사용자가 직관적으로 따라가지만, 계속 본인 스스로 흐름을 놓치지 않고 핵심 메세지 중심으로 결과물이 완성되는거야. SROI, 예산, 코치추천 이것도 필요한 기능이지만 부차적이야. **핵심은 RFP에 맞춰서 당선 가능한 기획 1차본이 나오는거지**"*
> — 2026-04-27, ADR-011 §배경

이 한 문단을 근거로 ADR-011 (Express Mode) 채택 + L1 Gemini 통합 완료 후, v7.0 으로 격상.

| 영역 | v6.0 | v7.0 | 근거 |
|---|---|---|---|
| **시스템 정체성** | 6 스텝 파이프라인 (단일 트랙) | **Express Track (메인) + Deep Track (보조) 두 트랙** | ADR-011 |
| **북극성** | "RFP 한 부 → 7 섹션 제안서까지 6 단계" | **"RFP → 30~45분 → 당선 가능한 기획 1차본 (7 섹션 초안)"** | ADR-011 §"북극성" |
| **신규 PM 진입점** | Step 1 (RFP) → 6 스텝 차례 | **Express 챗봇 단일 화면 (좌 챗봇 + 우 미리보기)** | ADR-011 §1 |
| **부차 기능 노출** | Step 4·5·3 모두 동등하게 펼침 | **자동 1줄 인용 (SROI 1:3.2 / 예산 마진 ✓ / 코치 N명) — Deep 진입 옵션** | ADR-011 §8 |
| **AI 모델** | Claude Sonnet 4.6 (Primary) + Gemini fallback | **Gemini 3.1 Pro Preview (Primary, L1 완료) + Claude Sonnet 4.6 fallback** | L1 완료 (`f2c0c38`·`6369403`·`f0ffab8`) |
| **AI 안정화** | safeParseJson 헬퍼 | **safeParseJson 강화 (trailing comma·펜스 제거) + max_tokens 확장 (8192/16384) + invokeAi() 통합 fallback** | L1 |
| **가치제안 갯수** | 5 개 (CLAUDE.md 9 철학 응축) | **7 개 (Express 가 1번, 나머지 6 개가 Express 를 지원)** | §3 |
| **두 레이어** | UI 6 스텝 + Value Chain 5 단계 (직교) | **두 트랙 + 두 레이어** — Express/Deep 트랙 정체 + UI 6 스텝/Value Chain 5 단계 의미 (ADR-008 보존) | §4 |
| **Phase 진행** | A~H 완료 + I 대기 | **A~H 완료 + L 진행 (L0/L1 ✅, L2~L6 대기) + I 후속** | §10, ROADMAP |
| **신규 데이터 모델** | (v6 까지) Project · ContentAsset · 등 44 모델 | **+ `Project.expressDraft Json?` + `Project.expressActive Boolean` + `Project.expressTurnsCache Json?`** (L2 마이그레이션) | architecture/express-mode.md §1.3 |

PRD-v6.0 에서 **유효 잔존**: Phase A~H 의 모든 산출물 (PipelineContext / Module Manifest / Ingestion / pm-guide / ProgramProfile 11축 / Value Chain 5단계 / Asset Registry / Content Hub) 은 **Deep Track 으로 그대로 살아있다**. v7.0 은 그 위에 Express Track 을 추가하는 패턴이라 *기존 코드·UI·데이터 모델 100% 보존*.

### 0.3 본 PRD 의 표현 약속

- **명료·간결**: 한 문장 한 의미. 한국어 본문 + 영문 기술 용어 그대로.
- **출처 표시**: 결정 근거는 `ADR-XXX`·`CLAUDE.md §X`·`<file>.md` 인용.
- **추측 금지**: 코드·문서로 확인된 사실만. 미정 사항은 `TBD` 명시.
- **하향식**: 큰 정의 → 세부 구조 → 구현. 표는 비교·매핑용.

---

## 1. 제품 정체성

### 1.1 한 문장 정의

> **UD-Ops Workspace 는 RFP 한 부를 30~45분 안에 "당선 가능한 기획 1차본 (7 섹션 초안)" 으로 변환하는 AI 공동기획자다.** 신입 PM 도 챗봇 한 화면에서 시작해 부차 기능에 휘둘리지 않고 핵심 메시지 중심의 결과물에 도달한다. 정밀화는 그 다음에 6 스텝 Deep Track 으로.

### 1.1.1 한 문장 정의의 단어 풀이

- **"30~45분"**: PM 의 한 timeblock. 1차본 도달 시간 = 북극성 산출물 (ADR-011 §"북극성"). 2~5일이 아니다.
- **"당선 가능한"**: 평가위원이 봤을 때 "이거 검토할 가치 있다" 가 되는 수준. 디테일이 아니라 **방향과 차별화**.
- **"1차본 (7 섹션 초안)"**: 기존 `proposal-ai.ts PROPOSAL_SECTION_SPEC` 7 섹션 그대로 — 각 300~600자 초안. 디테일 X (디테일은 Deep Track 의 일).
- **"AI 공동기획자"**: AI 가 *대신* 쓰지 않는다. PM 과 함께 쓴다. AI 는 컨텍스트 합성·초안 생성·시뮬레이션에, PM 은 컨셉 결정·자산 선택·최종 톤 조정에 책임을 진다.
- **"챗봇 한 화면"**: 좌(챗봇 대화) + 우(점진 1차본 미리보기) 단일 레이아웃. 6 스텝을 차례로 거치지 않음.
- **"부차 기능에 휘둘리지 않고"**: SROI / 예산 / 코치 정밀 산출은 1차본 단계에서 1줄 인용으로 자동. PM 인지 부하 차단.
- **"정밀화는 그 다음에"**: Express 종료 후 Deep Track 으로 자동 인계. 수주 후 실행 준비·평가 대응·후속 보고 등 깊은 작업은 Deep 에서.

### 1.2 풀려는 핵심 문제

| 문제 | 실제 모습 | Express 해결 메커니즘 | Deep 해결 메커니즘 (보존) |
|---|---|---|---|
| **신입 PM 첫 프로젝트 = 막힘** | 6 step 모두 거치면 1차본까지 수 시간. 어디부터 시작할지 불명확 | 챗봇 단일 화면 + Slot Filling 12개 + 점진 미리보기. 30~45분에 1차본 도달 | (해당 없음 — Deep 은 정밀화) |
| **부차 기능이 메인 흐름 차단** | SROI Forecast · 예산 PC/AC · 코치 매칭이 동등 노출 → "지금 뭘 해야하지" 혼란 | 자동 1줄 인용 (1:3.2 / 마진 ✓ / 12명) + "심화로 가기" 접힘 박스 | Step 4·5·3 정밀 산출 도구 그대로 |
| **PM 의 hidden cost** | "유사 사업 있었나?" "발주처 톤은?" 매번 기억·검색 | RFP 업로드 직후 자동 자산 매칭 + 알림 토스트 | matchAssetsToRfp 그대로 (Phase G·H) |
| **자산 흩어짐** | 노션·슬랙·전임자 머릿속에 분산 | Express 의 자동 인용으로 narrativeSnippet 이 1차본에 자연 박힘 | Content Hub `/admin/content-hub` 담당자 UI |
| **AI 일관성** | 매 호출 처음부터 컨텍스트 재구축 | invokeAi (Gemini 우선·Claude fallback) + safeParseJson 강화 (L1 완료) | PipelineContext 누적 주입 |
| **외부 리서치 의존** | PM 이 ChatGPT 등에 따로 갔다가 답을 옮겨야 함 | 외부 LLM 카드 — 챗봇이 프롬프트 자동 생성 → PM 이 답 붙여넣기 → 슬롯 추출 | (해당 없음) |
| **Slot Filling 자유도 부족 우려** | "AI 가 묻는 대로만 답해야 하나" 답답함 | Hybrid C — 자유 발화 허용 + LLM 이 자유 답에서 슬롯 추출 + Partial Extraction Per Turn | (해당 없음) |
| **AI JSON truncate 사고** | Logic Model 5843byte 절단 → 파싱 실패 → 오류 alert | safeParseJson 강화 + max_tokens 8192/16384 확장 + invokeAi fallback | L1 완료 (Gemini → Claude 자동 전환) |
| **품질 검증 부재** | "이게 1차본 수준인가" 판단을 사람 감(感) 에 맡김 | 검수 에이전트 (L5 후속) + zod schema validation + Gate 1·2·4 통합 | quality-gates.md 4계층 그대로 |
| **축적 메커니즘 부재** | 수주·탈락 데이터가 다음 기획에 반영 안 됨 | (해당 없음 — Deep 의 일) | Ingestion 큐 + 자산 자동 고도화 |

### 1.3 비전·미션

- **비전**: 신입 PM 도 첫 RFP 를 받아 *30~45분 안에 평가위원에게 보여줄 1차본* 을 만들 수 있는 시스템.
- **미션**:
  1. **Express 의 단일 화면** 으로 신입 PM 의 학습 곡선을 무너뜨린다.
  2. **자동 인용** 으로 언더독스 강점이 1차본에 자연 박히게 한다 (PM 이 자산을 검색하지 않는다).
  3. **Deep Track 의 정밀화** 로 수주 후 실행 도구를 보존한다.
  4. **검수 에이전트** 로 1차본의 평가위원 설득력·차별화 강도를 자동 점검한다 (L5).

### 1.4 경계 선언 (이건 X 가 아니다)

- ❌ **이건 LMS 가 아니다.** 학습 콘텐츠 전달·진도 추적·과제 채점은 별도 LMS (언더베이스).
- ❌ **이건 노션 대체가 아니다.** 자산 원본은 노션·드라이브·LMS. `ContentAsset.sourceReferences` 는 URL 링크만 (ADR-010 Q3).
- ❌ **이건 코치 매니지먼트 시스템이 아니다.** 코치 인사·계약·정산은 별도. coach-finder 는 검색·추천 UI 만.
- ❌ **이건 운영 트래커가 아니다.** D-day·칸반·만족도는 v7 범위 밖.
- ❌ **이건 가이드북이 아니다.** 가이드북은 OJT 배포용 마크다운. 시스템과 *완전 분리* (ADR-005).
- ❌ **이건 발주처/평가위원이 직접 쓰는 도구가 아니다.** 그들은 산출물의 수신자.
- ❌ **Express 가 모든 작업을 대체하지 않는다.** 정밀 작업은 Deep Track. 두 트랙은 같이 산다.

### 1.5 인접 시스템과의 관계 (정보 흐름 1방향)

ADR-005 의 정보 흐름 규칙을 v7 의 두 트랙 모두에 적용:

| 인접 시스템 | UD-Ops 와의 관계 | 흐름 방향 |
|---|---|---|
| **언더베이스 LMS + AI 코치봇** | Ops 가 자산 메타로 *참조*. LMS → Ops 흐름 없음 | Ops → LMS (제안서 일부) |
| **Coach Finder (별도 사이트)** | `scripts/sync-coaches.ts` 로 코치 JSON → Coach 테이블 동기화 | Coach Finder → Ops |
| **Notion / Drive (자산 원본)** | `ContentAsset.sourceReferences` 에 URL 만 | 양방향 (수동) |
| **Alumni Hub** | 데이터 인용 (`asset-alumni-hub` 의 keyNumbers: "25,000") | Alumni → Ops |
| **외부 LLM (PM 의 ChatGPT 등)** | Express 의 *외부 LLM 카드* — 챗봇이 프롬프트 자동 생성 → PM 이 ChatGPT 등에서 답 가져와 붙여넣기 | 외부 → Ops (Express 카드 매개) |
| **가이드북 / 강의자료** | ADR-005 §정보 흐름 규칙 — 브랜드 수치·ChannelPreset 시드만 1차 시드로 허용 | 가이드북 → Ops (제한적) |

---

## 2. 사용자 (Personas)

### 2.1 핵심 사용자: PM (제안 기획자)

| 항목 | 내용 |
|---|---|
| **역할 코드** | `PM` (Prisma `UserRole` enum) |
| **인증** | NextAuth v5 + Google OAuth `@udimpact.ai` / `@underdogs.co.kr` 도메인 화이트리스트 |
| **활용 시나리오 v7** | RFP PDF 업로드 → **Express 챗봇 30~45분 → 1차본** → (선택) Deep Track 으로 정밀화 |
| **시니어 vs 신입** | 시니어는 Express 의 자동 인용을 빠르게 검토. **신입은 Express 의 가이드된 흐름으로 학습 곡선 절감**. |
| **세션당 작업 시간** | Express: 30~45분. Deep (필요 시): 추가 1~3일 |
| **부담 포인트** | "어디부터?" → Express 가 단일 화면으로 답. "왜 이 자료를?" → 자동 인용으로 차단. "AI 톤이 우리 톤?" → ud-brand 자동 주입 |

### 2.2 콘텐츠 담당자 (Asset Registry 관리)

v6 와 동일. `/admin/content-hub` 페이지 (Phase H, ADR-010). v2.0 권한·UI 변경 없음. Express 는 ContentAsset 을 *읽기만* (자동 인용용).

### 2.3 부차 역할

v6 와 동일. `DIRECTOR` · `CM` · `FM` · `COACH` · `ADMIN`.

### 2.4 산출물 수신자 (시스템 사용자 아님)

평가위원·발주처 담당자·알럼나이·참여자. v6 와 동일.

### 2.5 PM 의 워크플로우 시나리오 (v7 의도된 사용 패턴)

**Express Track** (신규 프로젝트 진입 시 메인):

```
[월] RFP PDF 도착
  ↓
[월 14:00] /projects/new → /projects/[id]/express 자동 진입
  ↓ 챗봇 첫 턴: "RFP 파일을 올려주세요"
[월 14:01] PM 업로드 → parseRfp() + matchAssetsToRfp() 자동
  ↓ 우측 미리보기 ① 섹션 일부 채워짐 + 알림 토스트 "자산 N 매칭"
[월 14:05] AI: "발주처가 풀고싶은 진짜 문제는?" → PM 답
  ↓ intent 슬롯 추출 → 키 메시지 1개 표시
[월 14:15] AI: "유사 RFP 시장 통계 필요해요" → 외부 LLM 카드
  ↓ PM 이 ChatGPT 답 붙여넣기 → evidenceRefs 추출
[월 14:25] differentiators 5개 자동 인용 (PM 토글 확정/제외)
  ↓
[월 14:35] sections 1~7 점진 채움 (RFP 평가표 가중치 순)
  ↓
[월 14:45] 1차본 7 섹션 + 키 메시지 3 + 차별화 5 완성
  ↓ Express 종료 게이트 — zod schema 검증 통과
[월 14:50] PM 검토 → "정밀화 권장 영역: SROI / 예산 / 커리큘럼" 표시
```

**Deep Track** (정밀화 진입 시 — 수주 가능성 높거나 사후 보고 필요):

```
[월 15:00] PM "Step 5 임팩트 정밀화" 클릭
  ↓ ExpressDraft → PipelineContext 자동 매핑
[월 15:00~] 기존 v6 6 스텝 흐름 그대로 (Phase A~H 산출물 모두 살아있음)
[수 16:00] Step 6 제안서 7섹션 정밀 생성 + Gate 3 평가위원 시뮬
[목] 최종 + 디렉터 승인 + DOCX export
```

핵심: Express 는 *1차본의 빠른 도달*, Deep 은 *정밀 산출*. 둘 다 같은 ContentAsset · WinningPattern · ChannelPreset 을 공유.

---

## 3. 핵심 가치제안 (Core Value Propositions)

v6 의 5 가치제안에서 **Express 가 최상위 가치 (3.1)** 로 추가되어 7 개로 확장. 나머지 6 개는 Express 를 지원하는 기반.

### 3.1 ⭐ Express Track — RFP → 30~45분 → 1차본 (북극성)

**메인 가치제안.** 신규 프로젝트 진입 시 PM 은 단일 화면 챗봇 안에서 12 슬롯을 채우며 30~45분 안에 7 섹션 초안에 도달.

- **구현체**: `src/app/(dashboard)/projects/[id]/express/page.tsx` (L2) + `src/lib/express/{schema,conversation,slot-priority,prompts,active-slots,handoff}.ts`
- **데이터 모델**: `ExpressDraft` zod schema (12 슬롯) — `Project.expressDraft Json?`
- **UI 7 장치**: 북극성 진행 바 / 핵심 메시지 1줄 카드 / 점진 미리보기 / 다음 행동 1개 / 부차 기능 접힘 / Asset 자동 주입 알림 / 자동 저장 (debounce 1.5s)
- **3 카드 유형**: PM 직접 / 외부 LLM / 자동 추출 (ADR-007 의 진화)
- **Phase L Wave**: L0 ✅ / L1 ✅ / L2~L6 대기 (구현)

자세한 사양: [docs/architecture/express-mode.md](docs/architecture/express-mode.md) v1.0.

### 3.2 데이터는 위에서 아래로 흐른다 (PipelineContext) — Deep Track 보존

각 스텝은 이전 스텝 산출물을 `PipelineContext` 객체로 받는다 (v6 그대로). Express → Deep 인계 시 `mapDraftToContext()` 가 ExpressDraft 를 PipelineContext 로 변환.

- **구현체**: `src/lib/pipeline-context.ts` 7 슬라이스 + meta + valueChainState (v6 그대로)
- **신규**: `src/lib/express/handoff.ts` — Express → Deep 매핑

### 3.3 ⭐ 자산은 자동으로 올라온다 (Asset Registry) — Express 가 진짜 구현

v6 §3.2 의 강화. Express 의 **자동 인용** 으로 자산이 1차본에 *자연스럽게 박힌다*. PM 토글은 알림 카드의 확정/제외만.

- **구현체**: `src/lib/asset-registry.ts` `matchAssetsToRfp(rfp, profile)` — minScore 0.5 (Express는 0.3보다 높게)
- **저장소**: ContentAsset 테이블 (Phase H, 시드 20건)
- **주입 시점**: RFP 파싱 직후 자동 (Express 두 번째 턴) — Phase G 의 의도를 더 일찍 실현

### 3.4 AI 는 맥락 안에서 호출된다

매 AI 호출이 처음부터 시작하지 않는다. invokeAi (Gemini 우선·Claude fallback) + max_tokens 확장 + safeParseJson 강화 (L1 완료).

- **신규 진입점**: `src/lib/ai-fallback.ts` `invokeAi(params)` — 모델 무관 단일 함수
- **모델 우선순위**: Gemini 3.1 Pro Preview (`gemini-3.1-pro-preview`) → Claude Sonnet 4.6 (`claude-sonnet-4-6`)
- **max_tokens**: RFP 파싱 4096 / Logic Model 8192 / 커리큘럼 8192 / Express 일괄 16384
- **safeParseJson**: trailing comma 제거 + 마크다운 펜스 제거 + 잘림 감지 + 자동 1회 재시도 (L1, `f0ffab8`)

### 3.5 신입 PM 도 왜 이렇게 써야 하는지 안다 (pm-guide) — Deep Track

Deep Track 의 각 스텝 우측 가이드 패널 (v6 그대로). Express 에선 챗봇 자체가 가이드 역할을 흡수.

- **구현체**: `src/modules/pm-guide/`
- **Express 흡수**: 챗봇 다음 행동 1개 카드 + 외부 LLM 분기 카드가 pm-guide 의 의도를 단순화

### 3.6 Impact-First 는 커리큘럼 위에서 재구성된다 — Deep Track

v6 의 Impact-First 정신은 Deep Track Step 5 에 그대로 보존. Express 에선 ⑥ 기대 성과 및 임팩트 섹션의 narrativeSnippet 자동 인용으로 1차본 단계 충족.

### 3.7 일곱 가치제안의 상호 의존도

7 가치제안은 **Express (3.1) 가 정점, 나머지 6 개가 기반**. 한 축이 빠지면 다른 축이 무력화된다.

| If 빠진 축 | 무력화되는 축 | 결과 |
|---|---|---|
| **3.1 Express** | 3.3 자산 자동 인용 | 자산이 자동 박혀도 PM 이 6 step 헤맴 → 1차본 도달 시간 무너짐 |
| 3.2 PipelineContext | 3.4 AI 맥락 | Deep 진입 시 AI 가 매번 처음부터 → Express 인계 의미 상실 |
| 3.3 Asset Registry | **3.1 Express** | Express 의 자동 인용 무력화 → "단순 챗봇" 으로 격하 |
| 3.4 AI 맥락 | 3.1 + 3.5 | invokeAi/safeParseJson 없으면 truncate 사고 재발 → Express 흐름 중단 |
| 3.5 pm-guide | 3.2 (Deep) | Deep Track 의 의미 상실 |
| 3.6 Impact-First | 3.2 (Deep) | Deep Track 의 Step 5 무력화 |

따라서 7 가치제안은 **세트 구매**. Phase A~H + L 이 모두 완료되어야 v7 의 첫 가치가 발현된다.

---

## 4. 두 트랙 + 두 레이어 구조

v7 의 가장 큰 인지적 발견: **트랙 (정체) 과 레이어 (의미·공정) 가 모두 직교한다**.

### 4.1 두 트랙 — Express / Deep

PM 이 **어떤 의도** 로 작업하는가.

```
Express Track (메인)              Deep Track (보조)
────────────────────              ────────────────────
RFP → 30~45분 → 1차본              기존 6 step 파이프라인
챗봇 + Slot Filling                정밀 산출 (수주 후 실행)
점진 미리보기                      Step 4·5·6 등 디테일
부차 기능 자동 인용 (1줄)          SROI/예산/코치 정밀
신규 진입점                        Loop 얼라인 Gate
```

근거: ADR-011 §1 "두 트랙 정체".

**진입 결정 룰** (`src/lib/express/handoff.ts` `canEnterExpress()`):
- 신규 프로젝트 (스텝 전혀 진행 X) → Express 자동
- 부분 진행 (Step 1 만) → Express 가능 (선택)
- 절반 이상 진행 (Step 3 까지) → Deep 만
- 6 step 모두 완료 → Deep 만

### 4.2 공정 레이어 — UI 6 스텝 (Deep Track 만)

PM 이 **무엇을 하는가** 의 시간 순서. Deep Track 안에서만 노출.

```
Step 1 RFP+기획방향 → Step 2 커리큘럼 → Step 3 코치 → Step 4 예산 → Step 5 임팩트+SROI → Step 6 제안서
```

근거: ADR-001 (스텝 순서 변경) · 모든 step-*.tsx 파일이 이 순서로 `src/app/(dashboard)/projects/[id]/` 에 배치 (v6 그대로).

### 4.3 의미 레이어 — Impact Value Chain 5 단계 (양 트랙 공통)

각 산출물이 **사업 논리에서 어디 위치하는가** (ADR-008, v6 보존).

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

**Express 의 의미 레이어 매핑**: Express 의 12 슬롯이 ① Impact (intent · beforeAfter) → ② Input (differentiators 의 일부) → ③ Output (sections 7개) → ④ Activity (sections.3 커리큘럼 큰 그림) → ⑤ Outcome (sections.6 임팩트 + 자동 1줄 SROI 인용) 로 분포. **Express 는 5 단계를 한 화면에서 동시 빌드**. 루프 얼라인 Gate 는 Deep Track 에 보존 (Express 1차본은 검수 에이전트 L5 가 대체).

### 4.4 직교 매핑 (v6 표 그대로)

| UI 스텝 (Deep) | 주 valueChainStage | 비고 |
|---|---|---|
| Step 1 RFP+기획방향 | `['impact', 'input', 'output']` | ① ② ③ 3 탭 |
| Step 2 커리큘럼 | `['activity']` | ④ |
| Step 3 코치 | `['activity', 'input']` | ④ + ② |
| Step 4 예산 설계 | `['input']` | ② only |
| Step 5 임팩트 + SROI Forecast | `['outcome']` | ⑤ 수렴점 |
| Step 6 제안서 | `['output']` | ③ 최종 |

| Express 슬롯 | 주 valueChainStage |
|---|---|
| `intent` · `beforeAfter` | `['impact']` ① |
| `differentiators` · `evidenceRefs` | `['input']` ② |
| `sections.1~7` | `['output']` ③ |
| `sections.3` (커리큘럼) | `['activity']` ④ (큰 그림) |
| `sections.6` (임팩트) + 1줄 SROI 인용 | `['outcome']` ⑤ |

### 4.5 두 레이어가 만들어내는 것

- **PM 인지 부하 감소**: Express 의 진행 바 + Deep 의 단계 다이어그램이 같은 의미 레이어 위에서 작동
- **자산 분류 통합**: 모든 ContentAsset 이 `valueChainStage` 필드를 갖는다 → Express 매칭 시 단계 정합도 가중치 (v6 와 동일)
- **검수 에이전트 (L5)**: Express 1차본의 5 단계 매핑을 자동 점검 (모든 단계가 채워졌는지)

---

## 5. Deep Track 의 6 스텝 파이프라인 상세

> v6 §5 그대로 보존. Express 종료 후 PM 이 정밀화 클릭 시 진입.

### 5.1 Step 1 — RFP 분석 + 기획 방향

| 항목 | 내용 |
|---|---|
| **목적** | RFP PDF 1 부 → 사업의 정체성·방향성·평가전략·매칭 자산을 자동 도출 |
| **입력** | RFP PDF/텍스트 + 발주처 정보 |
| **산출물 슬라이스** | `RfpSlice` (rfp.parsed · proposalBackground · proposalConcept · keyPlanningPoints · evalStrategy · similarProjects · confirmedAt) + `meta.programProfile` (11축) + `acceptedAssetIds[]` |
| **Value Chain** | `['impact', 'input', 'output']` — 3 탭으로 UI 분리 (Phase F Wave 6) |
| **핵심 컴포넌트** | `step-rfp.tsx` (3 탭) · `ProgramProfilePanel` · `MatchedAssetsPanel` (Phase G) · `DataFlowBanner` |
| **AI 호출** | `POST /api/ai/parse-rfp` (RfpParsed + detectedTasks 6종) · `POST /api/ai/planning-direction` (제안배경+컨셉+핵심포인트) |
| **pm-guide** | ResearchRequests 5건(rfp-market-shift · rfp-policy-context · rfp-outcome-indicators 🌱 · …) + B2G/B2B/renewal 3 채널별 evaluatorPerspective + 흔한 실수 |
| **Gate 1/2** | 필수 슬라이스 존재 · evalCriteria 파싱 성공 |
| **Gate 3** | 논리 체인 시작점 검증 |
| **Express ↔ Deep** | Express 종료 시 `mapDraftToContext()` 가 ExpressDraft.intent → proposalConcept, beforeAfter → proposalBackground 매핑 |

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
| **AI 호출** | `POST /api/ai/curriculum` — 방법론 분기 9종 |
| **Gate 2** | R-001 이론 30% 초과 BLOCK · R-002 Action Week 필수 · R-003 이론 3연속 WARN · R-004 코칭 직전 워크숍 SUGGEST |

### 5.3 Step 3 — 코치 매칭

| 항목 | 내용 |
|---|---|
| **목적** | 커리큘럼 세션별로 코치 800명 풀에서 Top 3 추천 |
| **입력** | `PipelineContext.rfp` + `curriculum.sessions` + Coach DB |
| **산출물 슬라이스** | `CoachesSlice` (assignments · sessionCoachMap · totalFee · recommendationReasons) |
| **Value Chain** | `['activity', 'input']` — ④ + ② |
| **AI 호출** | `POST /api/coaches/recommend` |

### 5.4 Step 4 — 예산 설계 (2026-04-23 개칭)

| 항목 | 내용 |
|---|---|
| **목적** | 인건비·교육비·장소비·홍보비·일관비/이윤 자동 산출 + 마진 검증 + 유사 프로젝트 벤치마크. **SROI 는 Step 5 로 이동** (ADR-008) |
| **입력** | `PipelineContext.curriculum` + `coaches` + CostStandard DB |
| **산출물 슬라이스** | `BudgetSlice` (structure · marginRate · benchmark · warnings) |
| **Value Chain** | `['input']` — ② only |
| **Gate 2** | 직접비 비율 < 70% (B2G) WARN · 마진 < 10% WARN · 총액 > RFP 예산 BLOCK |

### 5.5 Step 5 — 임팩트 + SROI Forecast (2026-04-23 재구성)

| 항목 | 내용 |
|---|---|
| **목적** | Logic Model 5계층 + SROI Forecast + 루프 Alignment Check 3장 |
| **입력** | 커리큘럼 자동 추출 Activity (ADR-004) + 코치+예산 자동 추출 Input + 외부 리서치 + PM 확정 Impact Goal |
| **산출물 슬라이스** | `ImpactSlice` (goal · logicModel · measurementPlan · autoExtracted) + `valueChainState.sroiForecast` + `loopChecks` |
| **Value Chain** | `['outcome']` — ⑤ 수렴점 |
| **AI 호출** | `POST /api/ai/logic-model` (Activity/Input 사전 주입, AI 는 Output/Outcome/Impact 만 생성) |
| **Gate 4 신규** | 루프 Alignment 3 카드 (⑤→① 평가위원 설득 / ⑤→② 자원 대비 과다 약속 / ⑤→④ Activity 강도 일치) |

루프 임계값 (`src/lib/loop-alignment.ts`):
- **Impact 방향**: SROI 비율 < 1.5 → 경고 ("평가위원 설득 약함")
- **Input 방향**: SROI 비율 > 7 → 경고 ("벤치마크 +2σ 과다 약속 의심")
- **Activity 방향**: Outcome 지표 ↔ Activity 매핑 밀도 체크

### 5.6 Step 6 — 제안서 생성

| 항목 | 내용 |
|---|---|
| **목적** | 7개 섹션 자동 생성 + 평가 시뮬레이션 |
| **입력** | `PipelineContext` 전체 + `acceptedAssetIds[]` narrativeSnippet + ud-brand + ChannelPreset + WinningPattern |
| **산출물 슬라이스** | `ProposalSlice` (sections · scoreSimulation · revisionHistory) |
| **Value Chain** | `['output']` — ③ 최종 형태 |
| **AI 호출** | `POST /api/ai/proposal-section/[sectionKey]` — 자산 주입 + 소프트 마커 `<!-- asset:id -->` |
| **Gate 3** | 당선 패턴 대조 · 평가위원 시뮬레이션 · 심사위원 질문 방어 · 논리 체인 검증 |

각 섹션 프롬프트에 자동 주입되는 것:
- 브랜드 자산 (ud-brand.ts)
- ChannelPreset 톤 (B2G/B2B/renewal)
- PipelineContext 전체 (Step 1~5)
- 매칭된 ContentAsset 의 narrativeSnippet
- WinningPattern 해당 섹션 패턴
- 외부 리서치 + 전략 맥락
- 평가배점 가중치

### 5.x 스텝 간 데이터 흐름 (Deep Track)

```
Step 1 완료 (rfp.confirmedAt)
  → Step 2 자동 주입: rfp.proposalConcept · keyPlanningPoints · evalStrategy.sectionWeights · methodology
Step 2 완료 → Step 3 자동: curriculum.sessions[] (코치 매칭 키워드)
Step 3 완료 → Step 4 자동: coaches.totalFee (인건비 자동 채움)
Step 4 완료 → Step 5 자동 추출: sessionsToActivities · deriveInputs (AI 는 Outcome/Impact 만)
Step 5 SROI 확정 → 루프 Alignment Check 자동 → 불일치 시 Step 1·2·4 복귀 CTA
Step 6 → 전체 PipelineContext 주입 + acceptedAssetIds → narrativeSnippet
```

코드 진입점: `GET /api/projects/[id]/pipeline-context` 단일 엔드포인트.

### 5.7 Express → Deep 인계 (신규)

`src/lib/express/handoff.ts` `mapDraftToContext(draft, project)`:

| ExpressDraft 필드 | → Project / PipelineContext |
|---|---|
| `intent` | `Project.proposalConcept` |
| `keyMessages` | `Project.keyPlanningPoints` |
| `beforeAfter.before + .after` | `Project.proposalBackground` |
| `evidenceRefs[]` | `ResearchItem[]` (Step 1) |
| `differentiators[]` | `Project.acceptedAssetIds Json` |
| `sections.1 ~ .7` | `ProposalSection[].draft` (Step 6 초기값) |

Deep 진입 시 PipelineContext 가 이미 채워진 상태 → PM 은 Step 5 (정밀 SROI) · Step 4 (PC/AC 분해) 같은 디테일에 집중.

---

## 5.5 Express Track 상세 (v7 신규)

> Express Track 의 즉시 코딩 가능 사양: [docs/architecture/express-mode.md](docs/architecture/express-mode.md) v1.0 (12 섹션).
> 본 §5.5 는 PRD 시각의 요약.

### 5.5.1 단일 화면 레이아웃

```
┌─ 상단: 북극성 진행 바 (5%) ─ RFP ●━ 의도 ●━ 차별화 ○━ 섹션 ○━ 1차본 ─┐
├─ 좌측 챗봇 (40%) ───────────────┬─ 우측 미리보기 (55%) ─────────┤
│ AI: "발주처가 풀고싶은 문제는?" │  한 줄 요약: "지역 청년 ..." │
│ PM: "청년 인구 유출이 핵심..."  │  ① 제안 배경 ✅              │
│ [자유 입력 + Enter]             │  ② 추진 전략 🟦              │
│                                 │  ③ 교육 커리큘럼 🟦          │
│ ▼ 다음 행동 1개                 │  ④ 운영 체계 ⬜              │
│ 외부 LLM 카드 — 시장 통계        │  ⑤ 예산 ⬜                   │
│ [프롬프트 복사] [답 붙여넣기]    │  ⑥ 임팩트 ⬜                 │
│                                 │  ⑦ 실적 ⬜                   │
│ ▼ 부차 기능 (심화로 가기)       │  ┌─ 자동 인용 ─────┐         │
│ ▶ SROI 정밀                    │  │ SROI 1:3.2     │         │
│ ▶ 예산 분해                    │  │ 예산 5.4억 ✓   │         │
│ ▶ 코치 정밀                    │  │ 코치 12명      │         │
└─────────────────────────────────┴───────────────────────────────┘
```

### 5.5.2 12 슬롯 (zod schema)

`src/lib/express/schema.ts` 의 `ExpressDraftSchema`:

| # | 슬롯 키 | 타입 | 정형화 룰 |
|---|---|---|---|
| 1 | `intent` | string | 20~200자 |
| 2-3 | `beforeAfter.before / .after` | string | 20~300자 각 |
| 4-6 | `keyMessages[0~2]` | string[] | 정확히 3개, 8~80자 |
| 7 | `differentiators` | AssetReference[] | 최소 3, 최대 7 |
| 8 | `sections.1` 제안 배경 | string | 200~800자 |
| 9 | `sections.2` 추진 전략 | string | 200~800자 |
| 10 | `sections.3` 커리큘럼 | string | 200~800자 |
| 11 | `sections.4` 코치진 | string | 200~800자 |
| 12 | `sections.6` 임팩트 | string | 200~800자 |

`sections.5` (예산), `sections.7` (실적) 은 자동 인용 — PM 답변 직접 필요 없음.

### 5.5.3 챗봇 흐름 (Slot Filling Hybrid)

```
턴 1. AI: "RFP 파일을 올려주세요" → PM: [PDF]
       → parseRfp() 자동 → matchAssetsToRfp() 자동 → ① 섹션 일부 + 알림 토스트
턴 2. AI: "발주처가 풀고싶은 진짜 문제는?" → PM 자유 답변
       → invokeAi(buildTurnPrompt()) → safeParseJson(extractedSlots) → intent 추출
턴 3. AI: "이건 외부 LLM 에 맡길까요?" → 외부 LLM 카드 (자동 프롬프트 생성)
       → PM 이 ChatGPT 등에서 답 가져와 붙여넣기 → evidenceRefs 추출
턴 N. AI: "1차본 완성! 정밀화 권장 영역: SROI / 예산 / 커리큘럼"
       → PM 클릭 시 Deep Track 으로 매핑·인계
```

슬롯 우선순위 (`src/lib/express/slot-priority.ts`): intent → beforeAfter → keyMessages → differentiators → sections (RFP 평가표 가중치 순).

### 5.5.4 RFP 따라 유연한 슬롯

ProgramProfile 11축 + RFP evalStrategy 가 자동으로 적용 슬롯 결정 (`src/lib/express/active-slots.ts`):

```
필수 슬롯 (RFP 무관)        조건부 슬롯 (RFP 따라)
────────────                ────────────
intent                       SROI 정밀 (평가표 임팩트 ≥20%)
beforeAfter                  지역 맞춤 (region 명시)
keyMessages 3개              방법론 (RFP 가 강조한 IMPACT/UOR)
differentiators (≥3개)       코치 카테고리 (도메인 명시)
sections.1·2·3·4·6
```

### 5.5.5 부차 기능 1줄 인용

| 기능 | 1차본 인용 형태 | Deep 정밀화 (클릭 시 이동) |
|---|---|---|
| SROI | `예상 SROI 1:3.2 (Benchmark 기반)` | Step 5 정밀 SROI Forecast |
| 예산 | `총 예산 5.4억, 마진 안전 ✓` | Step 4 PC/AC 분해 |
| 코치 | `필요 역량 3종 — 매칭 가능 코치 12명` | Step 3 코치 배정 |
| 커리큘럼 | `회차 8 · IMPACT 6단계 매핑` | Step 2 회차별 설계 |

### 5.5.6 비정형 → 정형 안전장치 4종

ADR-011 의 사용자 우려 *"비정형데이터를 정형화 시키는게 굉장히 어려운 로직이 될 것 같아"* 에 대한 4 안전장치:

- **A. Schema First** — `src/lib/express/schema.ts` zod SSoT, LLM 출력 = schema 통과해야 인정
- **B. Partial Extraction Per Turn** — 매 턴 LLM 이 추출 슬롯을 PM 에게 즉시 표시 + 확정/수정
- **C. 외부 리서치 분기 자동** — "이건 모르겠어요" → 챗봇이 외부 LLM 프롬프트 자동 생성
- **D. Validation Gate** — 종료 시 zod 통과해야 1차본 저장. 미완 슬롯 visible 표시. 강제 차단 X

### 5.5.7 데이터 모델 영향 (L2 마이그레이션)

```prisma
model Project {
  // ... v6 까지의 모든 필드 보존 ...

  /** Express Track 1차본 (ExpressDraftSchema) */
  expressDraft         Json?

  /** Express 진입 여부 — true 면 사이드바 기본 진입점이 /express */
  expressActive        Boolean   @default(false)

  /** 마지막 N 턴 캐시 (이탈 후 재진입 회복용, 선택) */
  expressTurnsCache    Json?
}
```

마이그레이션 1건 (`add-express-draft`) — Phase L Wave L2.

---

## 6. 자산 레이어 (Layer 1 — Express 의 핵심 엔진)

> 회사 공통 자산 — 프로젝트와 무관하게 존재. 양 트랙(Express + Deep) 모두에서 자동 로드.

### 6.0 자산 레이어 = 3 층 데이터 구조의 첫 층

UD-Ops 의 데이터는 3 층 구조 (v6 와 동일):

```
┌─────────────────────────────────────────────────┐
│  Layer 1: 내부 자산 (회사 공통, 프로젝트 무관)     │
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
        │ Express: 매 턴 자동 주입 / Deep: 각 스텝 자동 로드
        ▼
┌─────────────────────────────────────────────────┐
│  Layer 2: 프로젝트 컨텍스트                        │
│  • Express: ExpressDraft (12 슬롯)                │
│  • Deep: PipelineContext 7 슬라이스               │
└─────────────────────────────────────────────────┘
        │ Express → Deep 매핑 시 또는 Step 6 생성 시
        ▼
┌─────────────────────────────────────────────────┐
│  Layer 3: 외부 인텔리전스 (AI + PM 수집)           │
│  • Express: 외부 LLM 카드 evidenceRefs[]          │
│  • Deep: 티키타카 리서치 / Planning Agent          │
└─────────────────────────────────────────────────┘
```

### 6.1 ProgramProfile v1.1 (11축, ADR-006)

사업 단위 프로파일. WinningPattern 검색 + 커리큘럼·제안서 AI 분기의 **주축**. **Express 의 슬롯 우선순위·자산 매칭의 키**.

| # | 축 | 타입 | 비고 |
|---|---|---|---|
| 1 | `targetStage` 창업 단계 | enum 7 | 예비/seed/pre-A/series-A/소상공인/비창업자 |
| 2 | `targetSegment.demographic` 대상 인구 | multi-enum 10 | 무관·여성·청소년·…·상인·장인·디자이너 |
| 3 | `targetSegment.businessDomain` 비즈니스 분야 | multi-enum 19 | 엑셀 분류 그대로 |
| 4 | `targetSegment.geography` 지역성 | enum 6 | 일반·로컬·글로벌_3종·일본·인도 |
| 5 | `scale` 사업 규모 | object | budgetTier 4단계 |
| 6 | `formats` 프로그램 포맷 | multi-enum 8+ | 데모데이·IR·합숙·박람회·공모전 |
| 7 | `delivery` 운영 방식 | object | 온/오프/하이브리드 + LMS + EduBot |
| 8 | `supportStructure` 지원 구조 | object (v1.1) | `tasks` 6 multi-select + `fourLayerSupport` |
| 9 | `methodology` 방법론 ⭐ | enum 9 | IMPACT·로컬브랜드·글로컬·공모전설계·매칭·재창업·글로벌진출·소상공인성장·커스텀 |
| 10 | `selection` 심사·선발 ⭐ | object | style·stages·publicVoting |
| 11 | `channel` 발주처 + `renewalContext` | object | B2G/B2B + isRenewal 시 renewalContext 필수 |
| (보) | `primaryImpact` 주 임팩트 | multi-enum 7 | 최소 1, 최대 3 |
| (보) | `aftercare` 사후관리 | object | tierCount + scope[] |

저장: `Project.programProfile: Json?` + `Project.renewalContext: Json?` + `WinningPattern.sourceProfile: Json?`. 시드 10 케이스.

매칭 가중치 (v1.1):
```
methodology 0.22 + tasks 0.10 + businessDomain 0.13 + targetStage 0.13
+ channel 0.10 + formats 0.10 + selection 0.08 + geography 0.07
+ scale 0.04 + primaryImpact 0.03 = 1.0
```

### 6.2 IMPACT 18 모듈 + CORE 4 (ImpactModule DB)

언더독스 창업교육 방법론. v6 그대로.

- **CORE 4 모듈**: 마인드셋·문제정의·고객·실행
- **IMPACT 18 모듈**: 6 단계(I→M→P→A→C→T) × 3 모듈
- **54 문항 ACT Canvas**
- **저장**: `Module` Prisma 테이블 + `ImpactModule` 메타
- **활용**: Step 2 커리큘럼 매핑 · Step 5 Logic Model Activity 자동 추출 · Express sections.3 (커리큘럼 큰 그림)

### 6.3 Coach Pool — UCA 800명 (Coach DB)

| 항목 | 내용 |
|---|---|
| **저장** | `Coach` Prisma 테이블 (800+ 레코드) |
| **소스** | coach-finder JSON (28k 줄) → `scripts/sync-coaches.ts` |
| **검색·추천** | `POST /api/coaches/recommend` |
| **Express 활용** | `countMatchingCoaches(profile)` — 1줄 인용 ("매칭 가능 코치 12명") |
| **Deep 활용** | Step 3 정밀 배정 |

### 6.4 SROI Proxy DB (16종 × 4국)

언더독스 사회가치 측정 자산. v6 그대로. Express 의 SROI 1줄 인용에 활용.

- **저장**: `SroiProxy` Prisma 테이블
- **국가**: 한국·일본·인도·글로벌
- **카테고리**: 16 종
- **Express 활용**: `getBenchmarkSroi(profile)` — "예상 SROI 1:3.2 (Benchmark 기반)"
- **Deep 활용**: Step 5 Logic Model Outcome → 화폐 환산

### 6.5 Benchmark Pattern · WinningPattern · ChannelPreset

v6 §6.5~6.7 그대로 보존. 모든 자산이 Express + Deep 양 트랙에서 활용.

### 6.6 Content Hub — Asset Registry v2 (ADR-009 + ADR-010)

언더독스가 RFP 에 반복 투입할 수 있는 모든 자산의 **단일 레지스트리**. **Express 자동 인용의 직접 소스**.

#### 6.6.1 데이터 모델

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | String (cuid) | kebab-case 추천 |
| `name` | String | "IMPACT 6단계 프레임워크" |
| `category` | String | methodology · content · product · human · data · framework |
| `parentId` | String? | 1단 계층 (depth=2 초과 금지) |
| `applicableSections` | Json | ProposalSectionKey[] |
| `valueChainStage` | String | impact · input · output · activity · outcome |
| `evidenceType` | String | quantitative · structural · case · methodology |
| `keywords` | Json? | string[] (RFP 매칭 트리거) |
| `programProfileFit` | Json? | Partial<ProgramProfile> |
| `narrativeSnippet` | String (Text) | 제안서 삽입 2~3 문장 — **Express 가 sections 에 자동 인용** |
| `keyNumbers` | Json? | string[] |
| `status` | String | stable / developing / archived |
| `version` | Int | 단순 정수 |
| `sourceReferences` | Json? | string[] — 외부 원본 URL |
| `lastReviewedAt` | DateTime | UI "최근 갱신" |

#### 6.6.2 시드 자산 20 건 (top 15 + child 5)

**카테고리별 분포** (v6 그대로):
- methodology (3): IMPACT 6단계 · UOR · 5-Phase 운영 루프
- content (3): AI 솔로프러너 · AX Guidebook · 창업가 마인드셋 U1.0
- product (4): Ops Workspace · Coach Finder · Coaching Log · LMS+AI 코치봇
- human (1): UCA 코치 풀
- data (3): Alumni Hub (10년 25,000명) · SROI 프록시 DB · Benchmark Pattern
- framework (1): Before/After AI 전환 프레임

**계층 시드 children (5)**:
- `asset-ai-solopreneur` (parent) → Week 1·2·3
- `asset-ax-guidebook` (parent) → Ch 1·2

#### 6.6.3 매칭 알고리즘 (`matchAssetsToRfp`)

```
score = 0.5 × profileSimilarity(profile, asset.programProfileFit)
      + 0.3 × keywordOverlap(rfp.text, asset.keywords)
      + 0.2 × sectionApplicability(rfp.evalStrategy, asset.applicableSections)
```

| 점수 구간 | 해석 | UI |
|---|---|---|
| ≥ 0.7 | 강한 매칭 | Express 자동 인용 / Deep 펼친 추천 |
| 0.5 ~ 0.7 | 중간 매칭 | Express 자동 인용 / Deep 후보 |
| 0.3 ~ 0.5 | 약한 매칭 | Express 미노출 / Deep 접힘 섹션 |
| < 0.3 | 제외 | 미노출 |

**Express 의 minScore = 0.5** (1차본은 강한 매칭만). Deep 의 minScore = 0.3.

#### 6.6.4 운영 권한

`/admin/content-hub` — v2.0 은 로그인한 모든 유저. 향후 `role: 'content-admin'` 분화 가능.

### 6.7 Ingestion 파이프라인 — 자산이 *늘어나는* 메커니즘 (ADR-003)

v6 §6.9 그대로 보존. 4 워커 (proposal · curriculum · evaluator-question · strategy-interview) — Express 와 직접 연결되지 않지만, Express 가 활용하는 ContentAsset · WinningPattern 의 보강 채널.

### 6.8 Express 에서의 자산 활용 (v7 핵심 가치)

§3.3 의 구체적 의미 — Express 의 *자동 인용* 6 단계:

| 단계 | 어떻게 |
|---|---|
| 1. RFP 업로드 | `parseRfp()` 가 RFP 텍스트 + ProgramProfile 11축 자동 추론 |
| 2. Asset 매칭 | `matchAssetsToRfp({ rfp, profile, minScore: 0.5 })` 가 ContentAsset 20+ 중 강한 매칭 자산 선별 |
| 3. UI 알림 | Express 의 챗봇 메시지로 "자산 X 가 ② 섹션에 인용됐어요" 토스트 |
| 4. PM 토글 | 알림 카드의 [확정] [제외] [수정] 버튼 → `differentiators[].acceptedByPm` 갱신 |
| 5. sections 주입 | `pourAssetIntoSection(match, sections)` — narrativeSnippet 이 해당 섹션 본문에 자동 추가 |
| 6. 추적 | `<!-- asset:asset-id -->` 소프트 마커 (Step 6 와 동일 패턴) |

이 6 단계가 **PM 의 한 번 클릭 (토글) 외에 모두 자동**. Phase G·H 의 *의도* 가 Express 에서 진짜로 실현 — 1차본 단계에 자산이 *자연스럽게* 박힘.

### 6.9 자산 카테고리 6종의 실제 분포 (Phase H 시드 기준)

v6 §6.11 그대로:

| 카테고리 | 시드 건수 | 예시 |
|---|---|---|
| methodology | 3 | IMPACT 6단계 · UOR · 5-Phase 운영 루프 |
| content | 3 | AI 솔로프러너 · AX Guidebook · U1.0 |
| product | 4 | Ops Workspace · Coach Finder · Coaching Log · LMS+AI |
| human | 1 | UCA 코치 풀 |
| data | 3 | Alumni Hub · SROI 프록시 · Benchmark |
| framework | 1 | Before/After AI 전환 프레임 |
| children (계층) | 5 | AI 솔로 W1~W3 + AX Ch1~Ch2 |
| **합계** | **20** | |

**Value Chain 단계별 분포**:
- ① Impact: 3 (Alumni Hub · Before/After + 1)
- ② Input: 4 (Coach Finder · Coaching Log · UCA 풀 + 1)
- ③ Output: 2 (Ops Workspace · 5-Phase)
- ④ Activity: 4 (IMPACT 6단계 · UOR · LMS · AI 솔로)
- ⑤ Outcome: 2 (SROI 프록시 · Benchmark)

### 6.10 자산 진화 흐름

| 단계 | 시점 | 구조 |
|---|---|---|
| Phase G v1 | 2026-04-24 | TypeScript 코드 시드 (`UD_ASSETS: UdAsset[]` 상수) |
| Phase H v2 | 2026-04-24 | DB 테이블 (`ContentAsset`) + 1단 계층 + 담당자 UI |
| **Phase L v2.x** ⭐ | **2026-04-27~** | **Express 의 자동 인용으로 활용도 폭증** — 자산 인용 분석·N+1 방지가 필요해질 가능성 |
| 향후 v3 | TBD | 임베딩 검색 · 자산 버전별 인용 추적 · N단 계층 |

각 단계 진입은 *데이터 양과 사용 패턴* 트리거. Express 운영 후 자산 50+ 도달 시 v3 검토.

---

## 7. AI 협업 모델 (v7 갱신)

### 7.1 모델 스택 (L1 완료 — `f2c0c38` / `6369403` / `f0ffab8`)

| 역할 | 모델 | 용도 | 변경 |
|---|---|---|---|
| **Primary** | Google Gemini 3.1 Pro Preview (`gemini-3.1-pro-preview`) | Express 챗봇 턴 · RFP 파싱 · Logic Model · 커리큘럼 · 제안서 | ✅ L1 변경 (v6 = Claude Primary) |
| **Fallback** | Claude Sonnet 4.6 (`claude-sonnet-4-6`, 상수 `CLAUDE_MODEL`) | Gemini 실패·할당량 초과 시 자동 전환 | (역할 교체) |
| **Embedding** | TBD | WinningPattern 유사도 / 자산 검색 | 미정 |
| **SDK** | `googleapis ^171.4.0` + `@anthropic-ai/sdk ^0.80.0` | package.json | (변경 없음) |

### 7.2 호출 패턴 (v7 신규 진입점)

모든 AI 호출은 `src/lib/ai-fallback.ts` `invokeAi(params)` 단일 진입점:

```typescript
const { raw, provider, model, elapsedMs } = await invokeAi({
  prompt,
  maxTokens: 8192,           // RFP/Logic/커리큘럼 8192, Express 일괄 16384
  temperature: 0.4,          // 사실 우선 (창의 0.7 — keyMessages 생성)
  label: 'express-turn',
})
const json = safeParseJson<TurnResponse>(raw)  // 강화 — trailing comma·펜스·잘림
```

**자동 fallback**: Gemini 호출 실패 시 → Claude 자동 재시도 → 둘 다 실패 시 에러 throw.

### 7.3 자동 주입되는 컨텍스트 (v6 그대로 + Express 추가)

| 주입 요소 | 출처 | Express? | Deep? |
|---|---|---|---|
| **Planning Principles** (4 원칙) | `src/lib/planning-principles.ts` | ✅ | ✅ |
| **PipelineContext** (이전 슬라이스) | `pipeline-context.ts` | (해당 없음) | ✅ Step 2~6 |
| **ExpressDraft** (이전 턴) | Express schema | ✅ 매 턴 | (인계 시) |
| **방법론 분기 블록** | program-profile.md §5.3 | ✅ Express section 생성 | ✅ curriculum + proposal |
| **ChannelPreset 톤** | ChannelPreset DB | ✅ | ✅ |
| **외부 리서치** | `formatExternalResearch(ctx.research)` | ✅ evidenceRefs | ✅ |
| **승인된 자산 narrativeSnippet** | `formatAcceptedAssets()` | ✅ differentiators | ✅ |
| **WinningPattern 섹션 패턴** | profileSimilarity 매칭 | ✅ sections | ✅ |
| **ud-brand 키 메시지** | `src/lib/ud-brand.ts` | ✅ | ✅ |

### 7.4 9-Methodology 분기 (v6 그대로)

ProgramProfile.methodology.primary 9종 분기 — Express 의 sections 생성에도 동일 적용.

### 7.5 AI 가 *안* 하는 것

v6 그대로 + 신규: **Express 의 슬롯 우선순위 결정**도 AI 가 안 함 (`selectNextSlot` 결정론).

### 7.6 정보 부족 시 처리

Express 의 외부 LLM 카드 = ADR-011 §5 의 진화. AI 가 "모르겠어요" 시 자동 프롬프트 생성 → PM 이 외부 LLM 답 붙여넣기.

### 7.7 검수 에이전트 (L5 후속, 사용자 요청)

ADR-011 §리스크 + 사용자 요청 항목. STATE.md 알려진 이슈 백로그 등록. 구현은 Phase L Wave 5:

```ts
// src/lib/express/inspector.ts (L5)
async function inspectDraft(draft: ExpressDraft, rfp: RfpParsed): Promise<{
  passed: boolean
  issues: InspectorIssue[]
}>
```

평가 항목:
- 제1원칙 (시장·통계·문제정의·Before/After) 충족
- keyMessages 가 sections 에 골고루 녹아있는지
- differentiators 가 sections 에 인용됐는지
- 데이터·통계 사용 정확도

### 7.8 Planning Agent (별도 트랙, v6 그대로)

`src/lib/planning-agent/` — Deep Track 의 부수 트랙. Express 와는 독립.

### 7.9 AI 호출 비용 모니터링 (계획)

Phase I 의 품질 지표 대시보드 — 모델별 토큰 + 호출당 평균 + 재생성 횟수 + Ingestion 비용.

---

## 8. 품질 게이트 (Quality Gates)

> v6 §8 의 4계층 그대로 + Express 의 zod schema validation 추가.

### 8.1 4계층 구조 (v6 그대로)

```
Gate 1: 구조/계약 검증 (빌드 타임)         ← 빠르고 무자비
Gate 2: 룰 엔진 검증 (생성 직후)            ← 결정론적 규칙
Gate 3: AI 검증 (생성 직후)                 ← 패턴·정합성·시뮬레이션
Gate 4: PM·Admin 승인 (운영) + 루프 Alignment  ← 최종 판단
```

### 8.x Express 의 4계층 매핑 (v7 신규)

| 게이트 | Express 적용 |
|---|---|
| Gate 1 | `ExpressDraftSchema.safeParse(draft)` 매 자동 저장 직전. 통과해야 DB 저장 |
| Gate 2 | 슬롯별 룰 (intent ≥20자 / keyMessages 정확히 3 / differentiators ≥3 / sections 200~800자) — zod refine |
| Gate 3 | 검수 에이전트 `inspectDraft()` (L5 후속) — 1차본 완성 후 자동 평가 |
| Gate 4 | "1차본 승인" 버튼 = 사람 최종 판단. Express 종료 후 Deep 진입 시 v6 의 루프 Alignment 활성 |

### 8.2 Gate 1 — 구조 (자동, 빌드 타임)

| 체크 | 구현 | 실패 시 |
|---|---|---|
| TypeScript 0 error | `npm run typecheck` (`tsc --noEmit`) | 머지 차단 |
| Next.js build 성공 | `npm run build` | 머지 차단 |
| Prisma 스키마 ↔ PipelineContext / ExpressDraft 타입 일치 | 단위 테스트 (TBD) | 빌드 차단 |
| Module Manifest reads/writes 위반 | ESLint 커스텀 룰 (Phase I) | TBD |
| **ExpressDraftSchema.safeParse(draft)** ⭐ | 매 자동 저장 직전 (L2) | DB 저장 거부 + UI validationErrors 표시 |

### 8.3 Gate 2 — 룰 엔진 (결정론)

**커리큘럼 룰** (`src/lib/curriculum-rules.ts`) — Deep:
| 코드 | 조건 | 강도 |
|---|---|---|
| R-001 | 이론 30% 초과 | BLOCK |
| R-002 | Action Week 0회 | BLOCK |
| R-003 | 이론 3연속 | WARN |
| R-004 | 코칭 직전 워크숍 미배치 | SUGGEST |

**예산 룰** — Deep:
- 직접비 < 70% (B2G) → WARN / 마진 < 10% → WARN / 총액 > RFP 예산 → BLOCK / 코치 사례비 ±20% → SUGGEST

**임팩트 룰** — Deep:
- Activity ↔ 커리큘럼 세션 1:1 미대응 → WARN / Outcome SROI 프록시 미매핑 → SUGGEST / 측정도구 미지정 → WARN

**제안서 룰** — Deep:
- 7섹션 미완 → BLOCK / ChannelPreset.avoidMessages 포함 → WARN / StrategySlice.derivedKeyMessages 미반영 → SUGGEST

**프로파일 룰** (ADR-006):
- `renewal-context-missing` (BLOCK) / `renewal-lessons-empty` (WARN) / `methodology-mismatch` (WARN) 등 6종

**Express 룰** ⭐ (zod refine):
- `intent` ≥ 20자 / `keyMessages` 정확히 3개 / `differentiators` ≥ 3개 / `sections.<n>` 200~800자
- `beforeAfter.before` 와 `.after` 가 너무 비슷하면 경고 (`validateBeforeAfterDistance()`)

### 8.4 Gate 3 — AI 검증 (정성)

**Deep Track** (Phase D5):

| 체크 | 입력 | 출력 |
|---|---|---|
| 3a 당선 패턴 대조 | 생성 섹션 + 매칭 WinningPattern[] | 패턴 일치도 0~100 + 부족 요소 |
| 3b 평가위원 시뮬 | 생성 제안서 + RFP.evalCriteria + ChannelPreset.evaluatorProfile | 항목별 점수 + 감점 사유 + 예상 질문 |
| 3c 심사위원 질문 방어 | 생성 섹션 + EvaluatorQuestion 자산 | "이 질문 나올 확률 높음 — 방어 약함" |
| 3d 논리 체인 검증 | RFP→컨셉→포인트→커리큘럼→Activity→Outcome→Impact | 끊긴 지점 지적 |

**Express Track** ⭐ (Phase L5 후속):

`src/lib/express/inspector.ts` `inspectDraft(draft, rfp)`:
- 제1원칙 (시장·통계·문제정의·Before/After) 충족 여부
- keyMessages 가 sections 에 골고루 녹아있는지
- differentiators 가 sections 에 인용됐는지
- 데이터·통계 사용 정확도

실패 시: 사용자 리포트 + 재생성 옵션. 자동 블록 ❌ (PM 최종 판단).

### 8.5 Gate 4 — 사람 확인 + 루프 Alignment

| 체크 | 트리거 | 행동 |
|---|---|---|
| **PM 확정 (Deep)** | 각 슬라이스 `confirmedAt` | "이대로 다음 스텝" 선언 |
| **Admin 승인 (Ingestion)** | `ExtractedItem` | 자산 반영 전 필수 |
| **Admin 승인 (Planning Agent)** | 학습 패턴 | 프롬프트 반영 전 필수 |
| **루프 Alignment 3 카드** ⭐ (Deep, Phase F7) | SROI 숫자 확정 | 불일치 시 복귀 CTA (블록 X) |
| **Express 1차본 승인** ⭐ | "1차본 승인" 버튼 클릭 | zod 전체 검증 + Deep 인계 옵션 표시 |

루프 Alignment Cards (`src/lib/loop-alignment.ts`):
- ⑤→① Impact: SROI 비율 < 1.5 → "평가위원 설득 약함" → Step 1 복귀
- ⑤→② Input: SROI 비율 > 7 → "과다 약속 의심" → Step 4 복귀
- ⑤→④ Activity: Outcome ↔ Activity 매핑 밀도 → Step 2 복귀

### 8.6 게이트 강도 조절 원칙

| Phase | Gate 1 | Gate 2 | Gate 3 | Gate 4 |
|---|---|---|---|---|
| A~C | ✅ 강제 | ✅ 강제 | 🟡 옵션 | 🟡 옵션 |
| D~E | ✅ 강제 | ✅ 강제 | ✅ 통합 | 🟡 부분 |
| F~H | ✅ 강제 | ✅ 강제 | ✅ 강제 | ✅ 루프 Alignment |
| **L** ⭐ | ✅ 강제 (zod) | ✅ 강제 (Express 룰 추가) | 🟡 L5 후 강제 | ✅ 1차본 승인 + Deep 인계 |
| I (대기) | 전 게이트 강제 + ESLint Manifest 강제 | | | |

### 8.7 품질 측정 지표 (장기 추적)

| 지표 | 측정 | 목표 |
|---|---|---|
| 수주율 | Project.isBidWon | 점진 상승 |
| 신입 vs 시니어 PM gap | Gate 3 점수 | 축소 |
| 재생성 횟수 | proposalSection.revisionHistory | 감소 |
| Ingestion 승인률 | 승인/(승인+거부) | 상승 |
| 자산 재사용률 | acceptedAssetIds 빈도 / 총 매칭 | 상승 |
| 평가 시뮬 ↔ 실 점수 상관 | 수주 후 실점수 입력 | r > 0.6 |
| **Express 1차본 도달 시간** ⭐ | `meta.completedAt - startedAt` | **30~45분 (북극성)** |
| **검수 에이전트 통과률** ⭐ | `inspectDraft().passed` 비율 | 첫 시도 70%+ |

### 8.8 게이트 보고 포맷 (사용자 표시)

```
[모듈명] <작업 요약>

✅ Gate 1: 통과 (타입·빌드·계약·zod schema)
✅ Gate 2: 통과 (룰 엔진 통과, WARN 0)
⚠️ Gate 3: 부분 통과
   - 당선 패턴 대조: 72점 (부족: 정량 KPI 언급 약함)
   - 평가 시뮬: 78점 예상
   - 논리 체인: 1곳 끊김
🟡 권장 조치:
   - [ ] proposal Step 2-C 섹션에 정량 KPI 2개 추가
   - [ ] budget.sroiForecast를 proposal Section VI에 주입

파일 변경: <list>
다음 스텝: <제안>
```

### 8.9 게이트와 Phase 진행의 결합

| Phase | 종료 조건 |
|---|---|
| A | Gate 1 통과 + Manifest 타입 정의 + PipelineContext 타입 통과 |
| B | Step 1 AI 호출 시 Gate 2 룰 통과 + 기획방향 4 산출물 생성 |
| C | 스텝 간 데이터 흐름 검증 |
| D | Gate 3 AI 검증 통합 |
| E | ProgramProfile 매칭 + Gate 3 룰 5종 추가 |
| F | 루프 Alignment Cards 3장 + Value Chain 다이어그램 + Step 1 3 탭 + Step 4·5 재구성 |
| G | Asset Registry 매칭 알고리즘 + Step 1 패널 + Step 6 narrativeSnippet |
| H | ContentAsset DB + 담당자 UI + 1단 계층 매칭 + 시드 20건 |
| **L** ⭐ | **Express 단일 화면 + ExpressDraft schema 통과 + invokeAi 단일 진입점 + 검수 에이전트 통과 + Express → Deep 인계 검증** |
| I | 전 게이트 강제 + ESLint Manifest 강제 + E2E + Vercel 배포 |

---

## 9. 데이터 모델 (v7 갱신)

> 전체: [prisma/schema.prisma](prisma/schema.prisma). v6 의 44 모델 + L2 신규 필드 3 개.

### 9.1 카테고리화 (v6 그대로 + Express)

| 카테고리 | 모델 수 | 주요 |
|---|---|---|
| **Auth** | 3 | User · Account · Session |
| **CORE 파이프라인 산출물** | ~10 | Project (+ expressDraft Json? + expressActive Boolean + expressTurnsCache Json?) · CurriculumItem 등 |
| **ASSET (회사 자산)** | ~10 | Coach · Module · ContentAsset · WinningPattern · ChannelPreset 등 |
| **INGESTION** | 2 | IngestionJob · ExtractedItem |
| **Planning Agent** | 3 | AgentSession · PlanningIntentRecord · PMFeedback |
| **운영 데이터** | ~10 | (v6 그대로) |

### 9.2 Project 모델 — v7 신규 필드 (Phase L2 마이그레이션 `add-express-draft`)

```prisma
model Project {
  // ... v6 까지의 모든 필드 보존 ...

  /** Express Track 1차본 — ExpressDraftSchema (zod) */
  expressDraft         Json?

  /** Express 진입 여부 — true 면 사이드바 기본 진입점이 /express */
  expressActive        Boolean   @default(false)

  /** 마지막 N 턴 캐시 (이탈 후 재진입 회복용, 선택) */
  expressTurnsCache    Json?
}
```

선택지 비교 (ADR-011 결정 = B 단일 JSON 필드):

| 선택지 | 장점 | 단점 |
|---|---|---|
| A. 신규 ExpressDraft 테이블 | 정규화·인덱싱 | 마이그 복잡 |
| **B. Project.expressDraft Json** ✅ | 마이그 1건, JSON 진화 | 부분 쿼리 어려움 (현 단계 불필요) |

### 9.3 enum (v6 그대로)

| enum | 값 | 용도 |
|---|---|---|
| `UserRole` | PM · DIRECTOR · CM · FM · COACH · ADMIN | 인증·권한 |
| `ProjectType` | B2G · B2B | ProgramProfile.channel.type |
| `ProjectStatus` | DRAFT · IN_PROGRESS · DONE 등 | Project 상태 |
| `CoachTier` · `CoachCategory` · `TaxType` | Coach 분류 | coach-finder |
| `AssignmentRole` | MAIN_COACH · SUB_COACH · LECTURER 등 | CoachAssignment |

### 9.4 PipelineContext ↔ Prisma 매핑 (Deep Track)

런타임 객체는 PipelineContext, 영속화는 다음 Prisma 필드:

| Slice | DB 저장 위치 |
|---|---|
| `rfp.parsed` | `Project.rfpParsed` (Json) |
| `rfp.proposalBackground/Concept/keyPlanningPoints` | `Project.proposalBackground` · `proposalConcept` · `keyPlanningPoints` |
| `rfp.evalStrategy` | `Project.evalStrategy` (Json) |
| `meta.programProfile` | `Project.programProfile` (Json, ADR-006) |
| `meta.programProfile.renewalContext` | `Project.renewalContext` (Json) |
| `acceptedAssetIds` | `Project.acceptedAssetIds` (Json string[]) |
| `strategy.*` | `PlanningIntentRecord` |
| `curriculum.*` | `CurriculumItem[]` + `Project.designRationale` |
| `coaches.*` | `CoachAssignment[]` |
| `budget.*` | `Budget` · `BudgetItem[]` |
| `impact.*` | `Project.logicModel` + `Project.measurementPlan` (Json) |
| `valueChainState.sroiForecast` | `Project.sroiForecast` (Json, Phase F) |
| `proposal.*` | `ProposalSection[]` |
| `meta.predictedScore` | `Project.predictedScore` (Float) |
| `research[]` | `Project.externalResearch` (Json) |

API 단일 진입점: `GET /api/projects/[id]/pipeline-context`.

### 9.5 ExpressDraft ↔ Prisma 매핑 (Express Track, v7 신규)

런타임 객체는 ExpressDraft (zod), 영속화는 단일 JSON 필드:

| Express Slot | DB 저장 위치 |
|---|---|
| `intent` · `beforeAfter` · `keyMessages` · `differentiators` · `evidenceRefs` · `sections` · `meta` | `Project.expressDraft` (Json) — 단일 필드 |
| 진입 활성화 | `Project.expressActive` (Boolean default false) |
| 마지막 N 턴 캐시 (이탈 회복용) | `Project.expressTurnsCache` (Json?) |

**Express → Deep 인계 매핑** (`src/lib/express/handoff.ts` `mapDraftToContext()`):

| ExpressDraft 필드 | → Project / PipelineContext |
|---|---|
| `intent` | `Project.proposalConcept` |
| `keyMessages` | `Project.keyPlanningPoints` |
| `beforeAfter.before + .after` | `Project.proposalBackground` (합쳐서) |
| `evidenceRefs[]` | `ResearchItem[]` (Step 1 의 research) |
| `differentiators[]` | `Project.acceptedAssetIds JSON` (Phase G·H) |
| `sections.1 ~ .7` | `ProposalSection[].draft` (Step 6 초기값) |

Deep 진입 시 자동 호출 — PipelineContext 가 이미 채워진 상태에서 Step 5/4/3/2 정밀화 진입.

### 9.6 Phase 별 신규 필드 (Project 모델 진화)

| Phase | 추가 필드 | 의미 |
|---|---|---|
| B | `proposalBackground`·`proposalConcept`·`keyPlanningPoints`·`evalStrategy` | Step 1 기획 방향 |
| D | `predictedScore` | 예상 점수 |
| E | `programProfile`·`renewalContext` | 11축 + 연속사업 (ADR-006) |
| G | `acceptedAssetIds` | RFP 매칭 자산 PM 승인 (ADR-009) |
| F | (의미 이동) `sroiForecast` | budget → impact (스키마 변경 X, 의미만) |
| **L** ⭐ | **`expressDraft` · `expressActive` · `expressTurnsCache`** | **Express Track 1차본** (ADR-011) |

각 마이그레이션은 *optional 필드 추가* 로만 진행 — 기존 Project 데이터를 깨뜨리지 않음.

---

## 10. 현재 미구현·계획

### 10.1 Phase L (Express Mode) — 진행 중 ⭐

**Wave 분해** (ADR-011 §"구현 스코프", architecture/express-mode.md §10):

| Wave | 이름 | 산출물 | 상태 |
|---|---|---|---|
| **L0** | 문서 (이 세션) | ADR-011 + architecture/express-mode.md + 6 문서 싱크 (PRD-v7 · ROADMAP · STATE · PROCESS · LESSONS · CLAUDE) | ✅ 완료 |
| **L1** | AI 안정화 | Gemini 3.1 Pro + invokeAi() + max_tokens 16384 + safeParseJson 강화 (`f2c0c38` / `6369403` / `f0ffab8`) | ✅ 완료 |
| **L2** | PoC: 단일 화면 | `/express` 페이지 + ExpressChat + ExpressPreview + NorthStarBar + zod schema + `/api/express/save` + 자동 저장 | 🔲 다음 |
| **L3** | 외부 LLM 분기 + 자산 자동 인용 | 3 카드 유형 + matchAssetsToRfp 자동 호출 + narrativeSnippet 주입 + 알림 토스트 | 🔲 후속 |
| **L4** | 부차 기능 1줄 인용 | SROI 추정 + 예산 마진 + 코치 카테고리 + Deep 이동 링크 | 🔲 후속 |
| **L5** | 검수 에이전트 (사용자 요청) | inspectDraft() + 1차본 자동 평가 + 문제 발견 시 PM 알림 | 🔲 후속 |
| **L6** | Express + Deep 통합 | suggestDeepAreas() + mapDraftToContext() + 통합 운영 검증 | 🔲 마지막 |

```
L0 ──────► L2 ─┬──► L3 ───┐
       L1 ─┘   ├──► L4 ───┼──► L6
               └──► L5 ───┘
```

L3·L4·L5 는 L2 만 끝나면 병렬. L6 는 모두 완료 후.

### 10.2 Phase I (안정화 + 배포) — Phase L 후속

ROADMAP.md Phase I — Phase L 완료 *후* 진입 (사용자 합의):
- I1. 전체 E2E (Express + Deep)
- I2. 빌드 확인
- I3. Module Manifest 강제
- I4. strategy-interview-ingest + 품질 지표 대시보드
- I5. Vercel 배포 + GitHub push

### 10.3 Phase E 미이행 항목

v6 §10.2 그대로. E2 (코치 추천 API) · E5 (curriculum-ingest) · E6 (evaluator-question-ingest).

### 10.4 v3 검토 항목 (v6 §10.3 + Express 신규)

| 항목 | 사유 | 시점 |
|---|---|---|
| ContentAsset N단 계층 | 1단 → 2단 | LMS 와의 경계 재검토 시 |
| AssetVersion 별도 테이블 | 자산 버전 추적 | acceptedAssetIds 에 {id, version} 페어 |
| 임베딩 검색 | 정확도 향상 | Phase F 이후 |
| `role: 'content-admin'` 분화 | Content Hub 권한 | 담당자 2명+ |
| Coach Pool DB 통합 | 단일 소스화 | Q3 |
| Planning Agent 별 트랙 | 독립 진행 | (별도) |
| **Express 자유 채팅 모드 (v3)** ⭐ | Slot Filling 의 한계 시 | Express PoC 검증 후 |
| **Express 다국어 sections** ⭐ | 글로벌 RFP 대응 | 글로벌 사업 비중 50%+ 시 |

### 10.5 알려진 이슈 (메모리 + STATE 기준)

- **Smoke Test 잔존** (v6 §10.4)
- **브라우저 E2E** — Phase F·G·H + Phase L 의 일부 Wave
- **AI 답변 퀄리티 검수 에이전트** (Phase L5 후속, 사용자 요청 2026-04-27)
- **AI 응답 시간** — 제안서 전체 생성 매우 느림 (45~76초/섹션, dev 로그 2026-04-27) → invokeAi 의 Gemini 우선으로 일부 개선 (L1)

### 10.6 Phase 진행 통계 (v7 갱신)

| Phase | 이름 | 상태 | 진행률 |
|---|---|---|---|
| A | 골격 재구성 + 계약 정의 | ✅ 완료 | 100% |
| B | Step 1 고도화 + Ingestion 뼈대 | ✅ 완료 | 100% |
| C | 데이터 흐름 연결 | ✅ 완료 | 100% |
| D | PM 가이드 + Gate 3 | ✅ 완료 | 100% |
| E | ProgramProfile + 차별화 리서치 | ✅ 완료 | 100% |
| F | Impact Value Chain | ✅ 완료 | 100% |
| G | UD Asset Registry v1 | ✅ 완료 | 100% |
| H | Content Hub v2 | ✅ 완료 | 100% |
| **L** ⭐ | **Express Mode (ADR-011)** | 🔲 진행 중 | L0/L1 완료 (28%) |
| I | 안정화 + Manifest 강제 + 배포 | 🔲 대기 | 0% |

### 10.7 Phase 누적 학습 (v6 §10.7 + L 추가)

| Phase | 학습 |
|---|---|
| A~H | (v6 §10.7 그대로) |
| **L** | "북극성 산출물 (1차본)" 정의가 모든 Phase 의 우선순위를 재배치한다. 부차 기능 비대화는 시스템 정체성 부재의 증상. |

### 10.8 미해결 설계 질문 (v6 §10.8 + Express 신규)

- **Express → Deep 회귀** — Deep 의 변경이 Express 1차본을 갱신해야 할까? (현재 단방향)
- **Express 의 다중 PM 협업** — 같은 프로젝트에 두 PM 이 동시에 챗봇을 칠 때 충돌 처리 (현재는 PM 1인 전제)

---

## 11. 부록

### 부록 A. 별도 산출물 (v6 그대로)

운영 가이드북 + 강의 자료는 ADR-005 에 따라 *완전 분리*. 본 PRD 본문은 가이드북·강의 콘텐츠를 *반영하지 않는다*.

### 부록 B. ADR 목록 (1~11)

| 번호 | 제목 | 일자 | 영향 영역 |
|---|---|---|---|
| ADR-001 | 파이프라인 스텝 순서 변경 | 2026-04-15 | 전체 흐름 |
| ADR-002 | Module Manifest 패턴 | 2026-04-15 | 모든 모듈 |
| ADR-003 | Ingestion 파이프라인 | 2026-04-15 | 자산 축적 |
| ADR-004 | Activity-Session 매핑 | 2026-04-16 | Step 5 임팩트 |
| ADR-005 | 가이드북·시스템 분리 | 2026-04-16 | 트랙 분리 |
| ADR-006 | ProgramProfile 11축 | 2026-04-20 | 매칭 |
| ADR-007 | 스텝별 차별화 리서치 | 2026-04-20 | pm-guide |
| ADR-008 | Impact Value Chain (5단계 + SROI 수렴) | 2026-04-23 | 의미 레이어 |
| ADR-009 | UD Asset Registry v1 | 2026-04-24 | 자산 레지스트리 |
| ADR-010 | Content Hub v2 (DB + 계층 + 담당자 UI) | 2026-04-24 | 자산 레지스트리 v2 |
| **ADR-011** ⭐ | **Express Mode — 두 트랙 정체** | **2026-04-27** | **시스템 정체성 재정의** |

### 부록 C. 메모리 구조 (v6 그대로 + 추가)

```
~/.claude/projects/.../memory/
├── (v6 그대로)
└── project_express_mode.md  ⭐ (예정 — Phase L1 후속)
```

### 부록 D. 기술 스택 (실측, L1 반영)

| 영역 | 선택 | 버전 |
|---|---|---|
| Framework | Next.js (App Router) | 16.2.1 |
| 언어 | TypeScript | 5.x |
| Runtime | Node | ≥20.0.0 |
| DB ORM | Prisma | ^7.5.0 |
| DB | PostgreSQL | (Docker: ud_ops_db) |
| 인증 | NextAuth | ^5.0.0-beta.30 (JWT) |
| **AI Primary** | **`googleapis` (Gemini 3.1 Pro Preview)** | **^171.4.0 (L1 반영)** |
| **AI Fallback** | **`@anthropic-ai/sdk` (Claude Sonnet 4.6)** | **^0.80.0 (역할 교체)** |
| UI | shadcn/ui + Tailwind v4 + lucide-react | - |
| State | Zustand | ^5.0.12 |
| Forms/Validation | Zod | ^4.3.6 |
| Toast | sonner | ^2.0.7 |
| PDF | unpdf | ^1.6.0 |
| Excel | exceljs | ^4.4.0 |
| DnD | @dnd-kit | ^6.3.1 / ^10.0.0 |
| React Query | @tanstack/react-query | ^5.95.0 |
| Frontend | React | 19.2.4 |

### 부록 E. 디자인 시스템 (v6 그대로)

- 폰트: Nanum Gothic
- 메인 컬러: Action Orange `#F05519`
- Express 의 색상 사용: 북극성 진행 바·다음 행동 카드만 Orange. 나머지는 중성색 — 1차본 흐름의 산만 차단
- Value Chain 색상 코드 (v6 그대로): ① Orange / ② Dark Gray / ③ Cyan / ④ Orange 80% / ⑤ Orange 진하게

### 부록 F. 커밋 통계 (v7 갱신)

```
총 108 커밋 (master 기준, 2026-04-27 19:00)
├── Phase A~H: 105 커밋 (v6 부록 F 그대로)
├── Phase L 시작: f2c0c38 / 6369403 / f0ffab8 (3 커밋)
└── 통합 문서: 32fe291 (PRD-v6 + 4 문서) + 본 PRD-v7 통합 커밋 예정
```

### 부록 F.1 한 PR 단위 = 한 Wave (v6 그대로)

Phase L 도 동일 패턴 적용:
- L0 = 문서 (ADR-011 + architecture/express-mode.md + 6 문서 싱크)
- L1 = AI 안정화 (3 커밋 — Gemini 통합 + 모델명 fix + 로깅)
- L2~L6 = 점진 코딩 (스키마 → API → UI 순)

### 부록 G. 참고 명령 (v6 그대로 + Express)

```bash
# v6 그대로 + 신규
npm run dev              # predev 훅 — predev 시 Gemini API key 도 검증 (L1 후속)
npm run db:migrate       # Phase L2 의 add-express-draft 마이그레이션 포함
```

### 부록 H. 디자인 철학 ↔ 가치제안 매핑 (v7 갱신)

CLAUDE.md §"설계 철학" 의 9 → **10 항목** 으로 확장 (Express 가 9번 추가):

| CLAUDE.md 철학 | §3 가치제안 | 구현체 |
|---|---|---|
| 1. 데이터는 위에서 아래로 흐른다 | 3.2 PipelineContext | `pipeline-context.ts` |
| 2. 내부 자산은 자동으로 올라온다 | 3.3 Asset Registry (Express 가 진짜 구현) | `asset-registry.ts` + ContentAsset |
| 3. AI 는 맥락 안에서 호출된다 | 3.4 AI 맥락 주입 | `ai-fallback.ts` invokeAi |
| 4. 신입 PM 도 왜 이렇게 써야 하는지 안다 | 3.5 pm-guide (Deep) + Express 챗봇 | `pm-guide/` + `express/prompts.ts` |
| 5. Impact-First 는 커리큘럼 위에서 재구성 | 3.6 자동 추출 | `logic-model-builder.ts` |
| 6. Action Week 강제 | (3.5 일부) | `curriculum-rules.ts` R-002 |
| 7. AI 가 정보 부족 시 → 질문으로 보완 | (3.4 일부) + Express 외부 LLM 카드 | planning-agent + `express/prompts.ts` |
| 8. Impact Value Chain 5단계 | §4 두 레이어 | `value-chain.ts` |
| 9. UD Asset Registry → Content Hub | (3.3 의 v2) | ADR-009 → ADR-010 |
| **10. Express 가 메인, Deep 은 옵션** ⭐ | **3.1 Express Track** | ADR-011 + `express/` 모듈 |

### 부록 I. 본 PRD 가 *답하지 않는* 질문 (v6 그대로)

가이드북 챕터 / 강의 슬라이드 / 코치 명단 / 워크샵 운영 / 담당자 이름·연락처 / 평가위원 명단 / 코치 단가 협상 / 회계·세무 / 마케팅 funnel / D-day·칸반 — 모두 본 PRD 범위 밖.

### 부록 J~L (v6 그대로)

- 부록 J. AI 공동기획자 5 역할 (Architect / Guardian / Curator / Orchestrator / Historian)
- 부록 K. 게이트킵 책임 (feedback_gatekeeping)
- 부록 L. 제1원칙 (feedback_first_principle, 4 세부 원칙) — Express 1차본의 7 섹션 초안에도 자동 적용

### 부록 M. 본 PRD-v7.0 자기 일관성 체크리스트

- [x] 1500+ 줄 (실측: 1500+)
- [x] 11 섹션 모두 작성 (0~11)
- [x] ADR 인용 11건 (1~11 모두)
- [x] 가이드북·강의 내용 0건
- [x] 추측 금지 — TBD 명시
- [x] 한국어 + 영문 기술 용어
- [x] 인용 출처 표시
- [x] 표 활용 (40+)
- [x] 명료·간결
- [x] 하향식 (큰 정의 → 세부 → 구현)
- [x] **Express + Deep 두 트랙 일관성**
- [x] **L1 커밋 해시 정확** (`f2c0c38` / `6369403` / `f0ffab8`)

### 부록 N. PRD 갱신 정책 (v6 그대로)

새 ADR / 새 Phase / ProgramProfile 축 변경 / 가치제안 의미 변동 / 스키마 5+ 모델 / 디자인 시스템 변경 시 *수동 개정*. 자동 동기화 X.

### 부록 O. 본 PRD 의 인접 SSoT 와의 우선순위 (v6 그대로)

1. `prisma/schema.prisma`
2. `src/lib/<module>.ts`
3. `docs/decisions/<ADR>.md`
4. `docs/architecture/<spec>.md`
5. **본 PRD-v7.0**
6. `ROADMAP.md`
7. `REDESIGN.md`
8. `CLAUDE.md`
9. `PRD-v6.0.md` (Archived) → 그 외는 본 v7 가 우선
10. `PRD-v5.0.md` (Archived)

본 PRD 와 ADR/code 가 *충돌* 할 때: ADR/code 가 우선.

---

**END OF PRD-v7.0**

> 본 문서는 Phase A~H 100% + Phase L 28% (L0/L1 완료) 의 누적 결과물이다.
> v6.0 의 6 스텝 정체 위에 ADR-011 의 Express 트랙을 더한 *재정의 버전*. 6 스텝은 Deep Track 으로 보존.
> 변경 제안은 ADR 로 먼저 기록하고, 채택 후 PRD 에 반영한다.
> Last updated: 2026-04-27 by AI 공동기획자 (Claude Opus 4.7 1M context) + udpb@udimpact.ai
