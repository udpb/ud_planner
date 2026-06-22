# HANDOFF — 세션 핸드오버 (라이브 문서)

> 새 세션 읽는 순서: **HANDOFF → 메모리(MEMORY.md 인덱스) → [glossary](docs/glossary.md) → [decisions/README](docs/decisions/README.md) → 활성 브리프(.claude/agent-briefs/)**.
> 최종 정리: **2026-06-22** — ⚠️ **전면 재정렬 국면**. 사용자가 compact 후 "최초 기획부터 현 구현까지 전부 재점검·align 후 진행" 요청. 아래 🔴 필독.

---

## 🔴 지금 가장 중요한 것 — 전면 재정렬 요청 (2026-06-22)

사용자가 현재 구현(단일 3단계 워크스페이스, BR-WS-1)을 보고 **근본 피드백 5개**를 줬고, **"최초 기획부터 지금 구현까지 다시 모든 걸 점검하고 전체적으로 align한 후 일을 진행. 필요하면 모든 화면 세부 목업·저니맵·디테일 구조까지"** 를 지시. compact하고 다시 시작 예정.

### 사용자 피드백 5개 (= 현 구현의 갭 = 재정렬 입력) ⭐⭐⭐
1. **PM 직접 편집 상실** — 옛 Deep 화면의 *커리큘럼 재배치* 등 PM이 직접 손보던 요소들이 통합하며 사라짐. **되살려야.**
2. **진행 프로세스 가시화 부재** — 어디까지 왔는지 안 보임.
3. **전체 목표·기획 방향 가시화 부재** — 무슨 목표로 무슨 기획을 가는지 모름.
4. **임팩트측정 미동작** — P1 코드는 됐으나 impact-measurement 배포+SERVICE_API_TOKEN 미설정.
5. ⭐ **챗봇형 원함** — "브레인으로 챗봇 형태로 대화하면서 자연스럽게 기획이 이끌어지도록." 현 아코디언/게이트 폼 → **대화형 공동기획자**.

### ✅ 재정렬 완료 — 설계 정본 (2026-06-22)
- ⭐ **[docs/architecture/program-workspace-redesign-v1.md](docs/architecture/program-workspace-redesign-v1.md)** = 재설계 SSoT. 한 장만 읽으면 정의·정본플로우·3진단·UX원칙·데이터/지식 흐름·6화면 IA·현재→재설계 매핑·빌드순서(§7)·불변제약. 5개 피드백 전부 닫음.
- 핵심 전환: **②기획의도 단계 신설(하이브리드: AI 초안 카드 + "?" 핀 + 대화)** = "맥락없이 딱딱"의 못. 6섹션 누적 워크스페이스, 점수판/게이트 후퇴, 모든 산출=초안+왜+출처+핸들, 단계 디벨롭 바. 6화면 목업 = 대화 위젯으로 사용자 확인 완료.
- **빌드 = 엔진 0% 버림(자동지능 ~20종 재사용), UX/IA·컴포넌트 껍데기만 교체.**

### 다음 (빌드 국면) — 위 문서 §7 순서
- BR-WS-3 ②기획의도 → BR-WS-4 ③커리큘럼 카드 → BR-WS-5 공통 껍데기·thread → BR-WS-6 ④⑤⑥ 정렬 → BR-WS-2 경쟁라우트 제거(마지막).
- ⚠️ **로컬 DB migration 보류(drift)** → 1차 빌드는 **스키마 변경 없이**(기존 필드 재사용). 새 필드 필요 시 STOP·DATA 브리프.
- 메인은 직접 빌드 X(ADR-020) — 자급자족 브리프로 서브 위임, 5섹션 검증.

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
