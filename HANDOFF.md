# HANDOFF — 세션 핸드오버 (라이브 문서)

> 새 세션 읽는 순서: **HANDOFF → 메모리(MEMORY.md 인덱스) → [glossary](docs/glossary.md) → [decisions/README](docs/decisions/README.md) → 활성 브리프(.claude/agent-briefs/)**.
> 최종 정리: **2026-06-25** — ✅ 재설계+서비스개선 10/10 · 예산 캘리브레이션(ADR-030) · 대화 영속 · 카드 UX(기획의도·예산). 아래 🟢 현재 상태.

---

## 🟢 현재 상태 (2026-06-25) — 작업 1~4 완료(코드✓), 라이브 시각 검수만 대기

워크스페이스 재설계+서비스개선 백로그 **10/10 완료**. 추가로 사용자 지시 작업 1~4(카드 UX·#10·예산 캘리브레이션·영속) **전부 코드✓·커밋·푸시**. ⚠️ 새 5건은 **프리뷰 시각 검수 대기**(코드 게이트는 통과). 검수 루프 확립(아래 ⚠️).

### ⭐ 2026-06-25 추가 완료 (코드✓ — typecheck/lint신규0/manifest/build 통과 · 시각 미확인)
- **ADR-030 예산 적산 캘리브레이션** (BR-WS-18, `e1742e3`) — 마진 과대(OR 77.7%) 교정: 매직넘버(OPS_FTE/PC_RATE)→`budget-rules.json costingDefaults` 데이터화 + `drSplitObserved`(AC60%/PC8%/OR16%) 가드·참조 카드. **강제 재분배 금지**(정직 bottom-up 유지). OR 잔차·단가·워터폴 불변.
- **#10 비회차 대화 편집** (BR-WS-19, `a144157`) — T4/T5 NonSessionStructure를 신규 `stage-ops.ts`(StageOp, 1-based at)로 대화 반영. handleDesign structureKind 분기. 회차표 경로 무변경.
- **대화 영속** (BR-WS-20, `c41b5a9`) — WorkspaceChat 메시지 서버 저장·복원. `Project.expressTurnsCache` 재사용(**스키마 변경 0**, 마이그레이션 보류 회피). 신규 PUT `/workspace-chat` + load 복원 + autosave(dirty 가드).
- **카드 UX·기획의도 채우기** (BR-WS-21, `b811f12`) — "대화로 채우기"→AI 후보 2~3개 카드→클릭=즉시 입력. planning-intent route 신규 'suggest'.
- **카드 UX·예산 항목** (BR-WS-22, `e3d9d7f`) — 예산 단계 대화→조정안 카드→클릭 시 적산 라인 즉시 반영(신규 `budget-ops.ts`, 라인 override만, 엔진 무변경). design 채널과 분리(회귀 방지).
- **코치 단계 완성** ⭐ (BR-WS-23 `b0e43de` + BR-WS-24 `f999dd5`) — **라이브 검증 완료**. Phase 1=선발팀 배선(기존 `CoachAssignment` 재사용, 신규 GET 로스터 + `SelectedTeamPanel` 패널·역할·단가·제거·n/N, `assignedCoachIds` 하드코딩 제거, **스키마 변경 0**). Phase 2=`handleCoach` + 교체/추가 카드(신규 `coach-ops.ts`, 서버 영속 POST/DELETE→로스터 재fetch, knownIds 환각 필터). 검증: "2명 추천해서 넣어줘"→선발팀 0/3→2/3(메인·보조)·풀 "이미 배정됨". 코치 채널 분리(design/budget 회귀 0).

### ✅ 2026-06-26 라이브 시각 검수 완료 (Vercel 프리뷰 + Chrome, 직접 클릭·DOM)
BR-WS-18~24 **전부 시각 검증**: 기획의도 후보 카드→채움 · 영속 저장/복원(Vercel DB expressTurnsCache 컬럼 존재 확인) · 예산 관찰분할 참조·진단·가드 · 예산 카드→마진 재계산 · #10 비회차 단계 추가 · design 카드 회귀 0(15→10회차) · 코치 선발팀+카드 배정. 크래시 0.
⚠️ 검수 중 테스트 흔적: 안산(cmpcgyyx7)에 T3 회차표·코치 2명 배정, 카카오(cmopf5xqv…tzw7dei)에 T4 구조·채팅 probe 남음(원하면 정리).

워크스페이스 재설계가 **빌드+프리뷰 라이브 검증**까지 끝났고, 서비스 개선 백로그도 10/10 완료. 검수 루프 확립(아래 ⚠️).

### 완료 (전부 `feat/sroi-integration` 푸시, 프리뷰 검증)
- **전폭 2-pane 셸** (BR-WS-1/5): 좌 대화 + 우 캔버스 + 상단 5단계 파이프라인(RFP·프로그램기획·코치·예산·SROI). 세로 아코디언 폐기.
- **대화→캔버스 직접 변경** (BR-WS-6): "성과 발표회 추가해줘" → 커리큘럼 실반영. (회차표 T1~T3만 — T4/T5는 #10 남음.)
- **②기획의도** 하이브리드(strategicNotes) · **③커리큘럼 PM편집**(재배치·저장·복원) · 폼 벽/목표 중복 정리 (BR-WS-3/3s/4/4s/9).
- **단계 라이브 연동** (BR-WS-15): 커리큘럼 회차 → 코치 필요수(estimateRequiredCoaches) → 예산 적산, **실시간**.
- **서비스 개선 백로그 9/10** — [docs/architecture/service-improvements-backlog.md](docs/architecture/service-improvements-backlog.md). #10(T4/T5 대화 편집)만 🔲.
- **예산 지식화** ⭐ — 29개 실예산+2026 단가표 → [data/program-design/budget-rules.json](data/program-design/budget-rules.json)(권위, coach-finder 정합) → 적산 엔진(BR-WS-14: 워터폴+단가 JSON출처+마진 경고).
- **레이아웃 폴리시** (BR-WS-16) — 대화 pane 360px(캔버스 넓게) + 사이드바 접기 토글(localStorage). PC 전용. 시각 확인 ✓.
- **대화 공동기획자화** ⭐⭐ (BR-WS-17) — design 단계 채팅: ① 대화 history 전송(맥락 유지) ② 행동우선 프롬프트(되묻기 X) ③ **choices 카드 → 클릭 시 캔버스 즉시 반영**. 라이브 검증: "6회차로 줄여줘"→3안 카드→클릭→8→6회차. (그동안 "멍청한 채팅" 해결.)

### ✅ 2026-06-26 추가 완료 (코드✓ + 라이브✓)
- **예산 적산 후속** (BR-WS-25, `c6385b3`) — 진단 단일 소스화(`computeBudgetDiagnostics` — 엔진/canvas 중복 제거) + costingDefaults 세션밀도 정교화(다회차일수록 AC↑). ADR-030 동결 준수. 라이브: 관찰분할 참조·단계 렌더 ✓.
- **경쟁 라우트 제거** (BR-WS-2, `142ee98`) — ADR-029 마무리. express·brain·v2·program-design/page·impact-forecast/page 진입점 삭제, **재사용 컴포넌트(program-design/_components·forecast-client) 보존**, nav→정본 재지정(신규생성·?stage=sroi). 라이브: `/v2` 404·워크스페이스 5단계(sroi/budget/design 재사용분) 무크래시 ✓.
- ⚠️ cleanup 잔여(후속): `(workspace)` 그룹 고아 layout · `load-express-props.ts` 등 미사용 lib · budget costingDefaults 실예산 전수 재분석.

### 🔲 다음 (다음 세션)
0. ✅ ~~2026-06-25 추가 5건 라이브 검수~~ — **완료(06-26)**. (아래는 검수 항목 기록)
   - BR-WS-18 예산: 6회차+예산충분 → 마진 진단 warning·관찰분할 참조 카드 뜨는지 (마진이 현실 범위로 내려갔는지)
   - BR-WS-19 #10: T4/T5 플랜 → "단계 추가/수정해줘" → StageList 반영 (회차표 회귀 없는지)
   - BR-WS-20 영속: 대화 → 새로고침 → 메시지 복원 (⚠️ Vercel DB에 expressTurnsCache 컬럼 존재 가정 — 첫 저장 실동작 확인)
   - BR-WS-21 기획의도: "대화로 채우기" → 후보 카드 → 클릭 → 항목 채워짐
   - BR-WS-22 예산 카드: budget 단계 "마진 낮춰줘" → 카드 → 클릭 → 라인·마진 변화 (design 카드 회귀 없는지)
1. ⭐ **SROI 라이브 연동** (이 브랜치 본래 목표 · 피드백 ④) — **코드 100% 완성·대기 중**(`src/lib/impact/handoff.ts` predict POST + `api/projects/[id]/impact-report` + forecast-client UI, 코드 갭 0). **사용자 액션만 남음**: ① measurement 레포 `feat/service-api` 배포(`impact-measurement-udi.vercel.app`, POST `/api/v1/measurements/predict`) ② `SERVICE_API_TOKEN`(양쪽 env, 고엔트로피) ③ ud-planner Vercel에 `SERVICE_API_TOKEN`·`IMPACT_MEASUREMENT_DATABASE_URL`(읽기)·(선택)`SROI_SERVICE_URL`. 게이트=`isHandoffConfigured()`(토큰 유무). 되면 "공식 리포트 생성" 버튼이 라이브 호출→SROI+iframe.
2. (선택) 코치 카드 후속 — `CoachAssign onAssigned` 정식 콜백(현재 window focus 재fetch 우회) · swap 부분실패 UX.
3. (선택) cleanup 잔여 — `(workspace)` 고아 layout · 미사용 lib(load-express-props 등) · budget costingDefaults 실예산 전수 재분석(프로그램타입 정합).

### ⚠️ 검수 루프 (확립됨 — 06-25)
- **Vercel 프리뷰 + Claude in Chrome** 으로 메인이 직접 시각 검수(로컬 docker DB 올리면 더 정확). 로그인=`pm@underdogs.co.kr`(Credentials). 프리뷰 URL=`ud-planner-git-feat-sroi-integration-…vercel.app` (Source=feat/sroi-integration 인 것).
- ⚠️ 스텝 전환은 **클릭(setStage)** 으로 — URL navigate 하면 ctx in-memory sessions 리셋. AUTH_URL이 프로덕션 고정이라 로그인 후 프로덕션으로 튐(프리뷰 URL 재진입).

### (과거) 재정렬 완료 — 설계 정본 (2026-06-22)
- ⭐ **[docs/architecture/program-workspace-redesign-v1.md](docs/architecture/program-workspace-redesign-v1.md)** = 재설계 SSoT. 한 장만 읽으면 정의·정본플로우·3진단·UX원칙·데이터/지식 흐름·6화면 IA·현재→재설계 매핑·빌드순서(§7)·불변제약. 5개 피드백 전부 닫음.
- 핵심 전환: **②기획의도 단계 신설(하이브리드: AI 초안 카드 + "?" 핀 + 대화)** = "맥락없이 딱딱"의 못. 6섹션 누적 워크스페이스, 점수판/게이트 후퇴, 모든 산출=초안+왜+출처+핸들, 단계 디벨롭 바. 6화면 목업 = 대화 위젯으로 사용자 확인 완료.
- **빌드 = 엔진 0% 버림(자동지능 ~20종 재사용), UX/IA·컴포넌트 껍데기만 교체.**

### 진행 (빌드 국면)
- ✅ **BR-WS-3 ②기획의도**(하이브리드, strategicNotes 저장) · **BR-WS-4 ③커리큘럼 PM편집**(재배치·저장·복원, 결함3개 수정) — 머지·푸시 완료. **단 로직만 ✓, 표면이 "폼 벽"으로 어긋남**(사용자 지적 06-23).
- ⭐ **다음 = ② 표면 정리** — 재설계 §9 클린 통합 화면(목업 `stage2_clean_unified_redesign`)에 맞춰 `PlanningIntent`+`ProgramDesignFlow` **표면만** 교체(로직 재사용). 목업 승인됨.
- 이후 ①③④⑤⑥도 **목업 먼저→사용자 OK→표면 교체**(재설계 §10). BR-WS-2(경쟁라우트 제거)는 표면 정리 후.

### ⚠️ 일하는 방식 갱신 (재설계 §10, 06-23)
- **메인은 이 세션에서 실행 화면 자체 검증 불가**(프리뷰 도구 미부착·로컬 login drift). 그래서 **목업이 구속력 스펙 → 빌드는 재현 → 시각 yes/no는 사용자.** 보고는 `코드 ✓`와 `시각 미확인` 분리, "검증 완료" 단독 금지.
- ⚠️ **로컬 DB migration 보류(drift)** → 스키마 변경 없이(기존 필드 재사용). 메인은 직접 빌드 X(ADR-020) — 자급자족 브리프 위임.
- 배포: production=`master`(5/29, PR#50) 무손상. 작업=`feat/sroi-integration` 푸시(프리뷰만 생길 수 있음, 운영 영향 0).

---

## 🧭 여정 (최초 → 현재, 한 흐름)
1. **스코프 축소**: 제안서 고도화 → **프로그램 기획 고도화**. 정본 = `docs/UD-Brain-CurriculumDesignLogic-v1.2.html`(제0원칙·D0~D8·운영유형 T1~T5·흐름문법).
2. **브레인 구축**: BR-1 추출(WinningProposalDoc 147건→16축) → ADR-028 DesignRule 스키마(추록3) → BR-2 검수UI(`/admin/design-rules`) → **BR-3a D0~D8 엔진** → BR-3b 턴UI → BR-3c 설계 캔버스(읽을수있는 게이트·코치풀·자산).
3. **SROI 볼트인**: ud-ops에 이미 `src/lib/impact/`(Wave M, impact-measurement DB read+forecast) 존재 발견 → 내가 만든 `src/lib/sroi/`는 중복이라 P1에서 정리. **P1 = impact/handoff.ts(쓰기)+③화면(forecast 렌즈+공식 리포트 iframe 임베드)**. measurement 레포 `feat/service-api`(POST predict 서비스 API).
4. **전수 점검**: ud-planner = **자동지능 ~20종 AI 공동기획자**(코치풀[coach-finder 715명·5축]·자산자동인용·인스펙터4종·11렌즈·brain매치·예산자동·forecast…). 진단/선발/연계/덱 모델=제안서 내용요소(폼 아님).
5. **통합 결정**: ADR-029 — 7개 경쟁 진입점(Express·Deep ?step=·v2 StageShell·program-design·impact-forecast·brain) → **단일 정본 워크스페이스 `/projects/[id]` 3단계(RFP·설계·임팩트)**. 엔진 보존, 경쟁 쉘 제거.
6. **현재**: BR-WS-1로 page.tsx 805→181줄(3단계 조립). → **사용자 피드백 5개 → 전면 재정렬.**

## 📍 브랜치·배포
- **작업 브랜치:** `feat/sroi-integration` (ud-ops, `feat/alpha-test-prep`에서 분기, auto-push). measurement: `feat/service-api`(로컬, 미배포).
- ⚠️ **production = `master`, 미머지** → 운영 무손상. 신규 화면은 로컬 `localhost:3000`에서만. **그래서 과감히 정리·재정렬해도 안전 + 롤백 자유.**
- 일하는 방식: 위임+검증+투명보고(ADR-020). 메인=구조/문서/기획, 기능코드=자급자족 브리프 서브 위임. **⚠️ 메인 로컬은 login authorize가 DB drift(별건)로 막혀 라이브 렌더 검증 불가 → 사용자 localhost 의존.**

## ✅ 이번 아크 빌드물 (전부 feat/sroi-integration 커밋·푸시)
| 영역 | 파일 | 상태 |
|---|---|---|
| DesignRule 엔진·시드·검수UI | `program-design/{design-rule,operating-format}` · `data/program-design/design-rules.json`(24규칙 draft) · `/admin/design-rules` | ✅ 검증 |
| D0~D8 엔진 | `program-design/{plan-types,resolve-rules,generate-plan,plan-input}` | ✅ 결정론18·LLM19 |
| 설계 캔버스 (P2) | `program-design/_components/{program-design-flow,gate-card,decision-log,structure-view,operating-type-meta,planning-elements}` | ✅ typecheck·킷 |
| 임팩트 볼트인 (P1) | `impact/handoff.ts` · `api/projects/[id]/impact-report` · `impact-forecast/{page,forecast-client}` | ✅ 오프라인10. ⏳라이브=배포후 |
| 통합 워크스페이스 (BR-WS-1) | `projects/[id]/page.tsx`(181줄) · `components/projects/workspace/{ProgramWorkspace,workspace-stages}` · `lib/projects/load-workspace.ts` | ✅ build. ⏳라이브 미확인 |
| 정리 | `src/lib/sroi/` 삭제(−1117, impact/로 흡수) · 데드코드(budget-rules·session-count·analyze-lost-patterns·extractClaudeText) | ✅ |

## 🟡 진행 중단/미해결
- **BR-WS-2 (경쟁 라우트 제거)** — BR-WS-1 빌드 검증 후 예정이었으나 **피드백으로 보류.** express·v2·program-design·impact-forecast·brain 라우트 파일은 아직 살아있음.
- **현 워크스페이스 라이브 미검증** — 사용자 화면(위 스샷): 3단계는 뜨나 ②설계가 자산 리스트만 보이고 **PM 편집·진행·목표·챗봇 부재**(피드백 1·2·3·5). 빌드는 통과(런타임 크래시 아님 — UX 갭).
- **임팩트 라이브** — measurement `feat/service-api` 배포 + SERVICE_API_TOKEN(양쪽) + 로컬 `IMPACT_MEASUREMENT_DATABASE_URL` 필요(피드백 4).

## 🧠 보존 자산 — 자동지능 ~20종 (재구현 금지, 재사용)
coach-recommender(coach-finder/Supabase 715명·5축) · asset auto-cite/recommend · express 인스펙터(channel·framing·factcheck·logicchain)+11렌즈 · impact/forecast(Wave M) · budget/auto-seed · brain 매치(inference) · program-design 브레인(D0~D8) · curriculum-ai(방법론) · proposal-ai · research. → [[reference-udplanner-feature-map]] 필독.

## 🔑 모델·인프라
- Gemini 단일(`@google/genai`), `invokeAi` 단일진입(eslint 강제). 로컬 docker DB(project 쿼리 OK, login authorize drift).
- impact-measurement = 별도 배포앱 `impact-measurement-udi.vercel.app`. read=`IMPACT_MEASUREMENT_DATABASE_URL`(Vercel만, 로컬 추가 필요). write/리포트=`feat/service-api` POST predict + SERVICE_API_TOKEN.

## 🗂 핵심 문서·ADR
- 정본 로직: `docs/UD-Brain-CurriculumDesignLogic-v1.2.html`
- ADR: **029**(단일 워크스페이스)·**028**(program-design grammar)·021(생성엔진)·013/015/018(진입 패러다임, 029가 supersede)
- 활성 브리프: BR-WS-2(미작성·보류) · BR-IMPACT-1·BR-3c(완료)
- 메모리(필독): [[reference-udplanner-feature-map]] · [[project-program-design-grammar]] · [[project-sroi-integration]] · [[ud-target-operating-model]] · [[project-deck-terminal-module]]

## 🏁 다음 진입 한 줄
**전면 재정렬.** compact 후: ① 최초~현재 전수 align(피드백 5개 기준) ② **대화형 브레인 공동기획자** UX 재설계(피드백 5) + PM 편집·진행·목표 가시화(1·2·3) ③ **모든 화면 세부 목업 + 저니맵 + 디테일 구조**(사용자 명시) ④ 그 위에서 빌드. **성급히 빌드 금지 — align 먼저.** 엔진은 다 있음(재사용), 바꾸는 건 UX/IA.
