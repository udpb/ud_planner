# 2026-04-20 ~ 21 — Phase E 완료 + 가이드북 재정비 + 제1원칙 정립

> 이날의 세션은 **Smoke Test 품질 미달 원인 진단 → ProgramProfile 축 체계 설계 → Phase E 전면 구현 → 가이드북 재정비 + 영문화 + Vercel 배포 → 제1원칙 정립** 까지 하나의 긴 호흡으로 이어졌다. 중간에 여러 번 궤도 수정이 있었고 그 흔적을 그대로 남긴다.

## 이날의 맥락

- **누구:** udpb (사용자) + AI 공동기획자
- **무엇을 하려 했나:** Smoke Test 에서 드러난 커리큘럼 AI 생성 품질 문제 해결, 그리고 이를 뿌리부터 고치기 위한 ProgramProfile 축 체계 도입
- **어디서 시작했나:** Phase A~D 완료, Phase E/F 대기 상태. Smoke Test 에서 커리큘럼 AI 생성이 실패(500 에러)했고, PM 관점에서 수주 방향성이 잡히지 않는다는 피드백

---

## 흐름 (시간순)

### 1. 진행 현황 전면 감사 (Phase A~D)

사용자가 "지금까지 진행된 모든 작업을 파악해달라" 요청. Phase A~D 가 스키마·아키텍처·UI 관점에서 끝나 있었지만, 실사용 품질이 기대에 못 미침. 커밋 26개, 159 src 파일 변경 상태였음.

**막힌 지점:**
Smoke Test 에서 Step 2 커리큘럼 AI 생성이 500 에러. 근본 원인은 두 층:
- (a) 프롬프트가 너무 커서 Claude 응답 JSON 이 max_tokens 에 잘림 — 이건 이미 f92e504 로 경량화 수정됨
- (b) **더 근본 원인**: `WinningPattern` 이 `channelType`(B2G/B2B/renewal) 1축만으로 매칭해서, "B2G 청년 데모데이" 와 "B2G 로컬상권 5개월 오프라인" 을 동일 패턴으로 취급

---

### 2. WinningPattern 로직이 사업 스펙트럼을 못 담는다는 문제 제기

사용자: *"우리 과업의 스펙트럼이 굉장히 넓어서, 데모데이 · 네트워킹 · 외부 연사 · 코치 · 온라인/오프라인 · LMS · 임팩트창업방법론을 반드시 쓰는 게 아니라 대상에 따라 다르게 설계되어야 한다. WinningPattern 을 설계하는데 로직이 잘못 들어가면 다른 변수들 대처가 안 된다."*

**생각의 전환:**
"패턴" 이라는 단어 자체가 문제였다. 수렴시키면 다양성 상실, 안 수렴시키면 학습 없음. → **축(facet)** 으로 분해하는 접근. 11축 ProgramProfile 구조 초안(v0.1) 작성.

**제가 틀렸던 것:**
초기에 "비즈니스 분야" 를 free tag 로 둘지 enum 으로 둘지 고민이었는데, 사용자가 2024년 11월 만든 교육 콘텐츠 재정비 스프린트 엑셀을 제공. 거기 이미 **19종 비즈니스 분야 enum** 이 설계되어 있었다. 2024-11 엑셀 분류 체계가 v1.0 의 기반이 됨 — 내부에 이미 있던 자산을 못 찾고 있었던 것.

---

### 3. 가이드북 진단 — 특수 케이스 부각 문제 발견

사용자가 별도로 가이드북(`docs/guidebook/`) 진단을 요청. 읽어보니:
- Ch.5 함정 1 에서 **코오롱 프로보노 사례 스토리가 챕터를 점유** 하고 원칙이 뒷전
- 부록 B 의 IMPACT 방법론이 "커리큘럼 설계 골격" 으로 기술 — 이는 **창업교육 계열에만 맞는 프레임** 임을 흐림
- 8개 케이스 중 IMPACT 기반은 3건뿐 (NH, GS, 코오롱). 5건 (서촌·안성·한지·관광기념품·예비글로벌) 은 **비 IMPACT**. 편향 확인됨

**사용자 원칙:**
*"특수한 케이스가 부각되면 안 되고, 결국 사업 운영을 잘 하기 위한 구조가 잘 보여야 해."*

**전환:**
"코오롱 사례 반복" 을 **강점이라 판단했던 내가 틀렸다.** 원칙이 본문, 사례는 참고 박스 — 이 원칙으로 가이드북 전면 재정비.

Ch.5 함정 1 재구성 (원칙 → 왜 이 순서인가 → 증상 → 대응 → 체크포인트 → 참고 박스), 부록 B IMPACT 서술 정정 ("창업교육 계열 기본 프레임 중 하나"), Ch.4 Outcome 예시 7개 사업 유형으로 확장, Ch.5 함정 2/6 을 IMPACT·B2B-CSR 전제 없애고 다양한 사업 유형으로 일반화, Ch.6 섹션 5 에서 "반드시" 표현 제거.

---

### 4. 한/영 2버전 가이드북 배포

사용자가 외부 코치 배포용으로 한/영 양쪽 필요하다고 지시. 번역 에이전트 7개 병렬 발송 — 19개 파일 (~20K 단어) 전체 자연스러운 영문으로 번역. 기존에 일부만 번역돼 있던 것을 전체화.

**MkDocs Material 사이트 구축**: `guidebook-site/` 디렉토리 신설, `mkdocs-static-i18n` 플러그인으로 ko/en 미러 구조, Vercel 로 배포. 처음엔 브랜드가 부족했다 — 사용자가 *"탭이 깨졌고 한글 번역 100% 안 됐고, 우리 디자인 규칙에 맞지 않다"* 지적.

**내가 놓친 것:**
1. `mkdocs.yml` 에 `nav:` 명시 안 함 — 상단 탭이 빈 상태로 렌더링됨
2. `b-ud-assets.md` 한글 슬로건 리스트가 번역 없이 6줄 남아있음 (진짜 번역 누락)
3. 처음 CSS 가 너무 덤덤 — underdogs.global/boost 의 Hero 톤을 반영해야 했음

**2차 재작업:**
- `mkdocs.yml` 에 nav + nav_translations 추가 (Part 1~4 + 부록 풀 매핑)
- 누락 번역 병기
- CSS 전면 재작성 — Action Orange `#F05519`, Nanum Gothic, Hero 섹션 (검정 그라데이션 + 큰 타이포 + 오렌지 강조 "명료하게"), 카드 그리드 (한 번은 md_in_html 문제로 깨진 것을 raw HTML 로 해결)
- 섹션 랜딩 페이지 자동 생성 (build.sh 의 Python 스크립트) — 8개 디렉토리 404 해결

최종: **https://site-wine-psi-37.vercel.app/** (ko) + `/en/`, 모든 링크 200 OK 확인.

---

### 5. Q1~Q12 답변 수신 + ProgramProfile v1.0 확정 (ADR-006)

v0.1 초안에 12개 결정 질문을 포함해 사용자에게 제출. 답변 정리:

| Q | 답 | v1.0 반영 |
|---|---|---|
| Q1 | 비창업자 유지, targetSegment 로 세분화 | `비창업자` enum + demographic 10종으로 상인/장인/디자이너 흡수 |
| Q2 | 엑셀 기반 3축 세분화 | demographic(7) × businessDomain(19) × geography(6) |
| Q3 | 1억미만/1-3억/3-5억/5억이상 | `budgetTier` 4단계 확정 |
| Q4 | 나중에 추가 | v1.0 은 8종 유지 |
| Q5 | 필수 아니지만 권장 | `usesLMS: true` 기본값 |
| Q6 | 메인은 창업/소상공인 | `nonStartupSupport` 옵셔널 필드 |
| Q7 | 커스텀 세분화 | 9개 enum + `customFrameworkName` 자유도 |
| Q8 | 중복 모두 자동화 | formats↔selection 자동 동기화 |
| Q9 | renewal 플래그 + **작년 레슨런·성과 필수** | `renewalContext` 블로킹 필드 |
| Q10 | 복수 선택 | `primaryImpact: Array` (1~3) |
| Q11 | tierCount 충분 | 현행 유지 |
| Q12 | 이 정도면 충분 | 11축 확정 |

ADR-006 작성, program-profile.md v1.0 으로 승격.

---

### 6. Phase E 구현 — Step 1~7

Phase E 를 **7단계** 로 나눠 순차·병렬 진행.

#### Step 1: Prisma 스키마
- `Project.programProfile Json?`, `Project.renewalContext Json?` 추가
- `WinningPattern.sourceProfile Json?`, `profileVector Json?` 추가
- 신규 `ProfileTag` 모델

**여기서 중간 차질:**
Claude Code 의 deny 규칙이 `Edit(prisma/schema.prisma)` 를 차단. 사용자가 과거에 안전 목적으로 설정한 것. 옵션 제시 → 사용자 *"너가 직접 해줄 수 없어?"* → settings.local.json 에서 deny 규칙 임시 해제 → 편집 → 복원. 윤리적으로 사용자 명시 요청 후에만 우회했다. DB 는 미연결 상태라 migration 은 `--create-only` 도 안 되서 **수동 SQL 작성** 으로 `prisma/migrations/20260421000206_phase_e_program_profile/migration.sql` 생성. `prisma generate` 로 Client 재생성은 성공.

#### Step 2: TypeScript 타입 (`src/lib/program-profile.ts`)
11축 인터페이스 + enum 상수 + `normalizeProfile` · `profileSimilarity` · `validateProfile` · `computeBudgetTier` 헬퍼. 약 560줄.

#### Step 3: pm-guide/resolve.ts 개편 (에이전트)
과거 3축 쿼리 → 프로파일 유사도 매칭 (가중치: methodology 0.25, businessDomain 0.15, …). `filterMistakesByProfile`/`filterTipsByProfile` 헬퍼로 methodology 별 mistake · tip 필터링.

#### Step 4: curriculum-ai.ts 9-methodology 분기 (에이전트)
`METHODOLOGY_PROMPT_BLOCKS` 딕셔너리로 9개 방법론별 프롬프트 블록. `buildImpactModulesContext` 를 `methodology.primary === 'IMPACT'` 일 때만 주입 (비IMPACT 사업에 IMPACT 모듈 누수 차단).

#### Step 5: proposal-rules.ts Gate 3 (에이전트 + 제가 재작업)
에이전트 1차 결과물의 메시지가 "시스템 에러 톤" 이어서 **제1원칙 기준 미달**. 제가 직접 재작업 — `ProfileIssue` 타입에 `scoringImpact` / `differentiationLoss` / `fixHint` 3개 필드 추가, 5개 메시지 전면 재작성해 "어떤 RFP 배점이 날아가는지 + 어떤 언더독스 차별화를 놓치는지 + 구체 해결 경로" 3층 포함.

#### Step 6: Step 1 UI ProgramProfilePanel (에이전트)
1505줄 컴포넌트. 핵심 4축 (2×2 grid) + 상세 7축 (Collapsible). Gate 3 이슈 카드가 `formatIssueForUI` 3층 렌더. `hasBlocker` 시 저장 버튼 비활성 + 토스트 차단. 자동 연동(공모전↔심사, IMPACT↔모듈 칩, isRenewal↔RenewalContext 인라인). `UpdateProjectSchema` 에 `programProfile` · `renewalContext` 추가.

#### Step 7: 10 케이스 시드 (에이전트)
`prisma/seed-program-profiles.ts` — 967줄. 8 guidebook 케이스 + 청년마을 + 재창업. 모두 `normalizeProfile()` 통과. snippet 은 시장 흐름 + 정량 포화 + before/after 포함. whyItWorks 는 구체 배점 항목 + 구체 차별화 자산 명시.

---

### 7. 제1원칙 정립

세션 중반, 사용자가 갑자기 명확한 기준을 내걸었다:

> *"반드시 지켜야 하는 가장 기본 원칙은 RFP·클라이언트 요구 사항에 맞춰서 가장 설득력 있는 제안서를 기획하는 것이고, 그 안에서 우리의 강점·차별화 포인트가 잘 나와야 해. 너는 에이전트가 일할 때 계속 이 관점에서 높은 기준으로 결과물이 나오는지를 검증해야 해."*

그리고 조금 뒤 추가:

> *"단순히 기존 자료·데이터를 기본으로 '이게 좋은 제안서다' 이렇게 하면 안 돼. 시장의 흐름을 반영하면서, 통계적 근거 있는 설득과 함께 제대로 된 문제정의, 그래서 before & after 가 명확하도록 기획해줘. 이걸 그대로 반영하라는 게 아니라 이런 관점들이 잘 서있어야 해."*

**이건 시스템 전체 사고 프레임 재정비 요청이었다.** 하드코딩 체크리스트가 아니라 AI 가 이 관점 위에서 사고하게 만들어야 함.

**대응:**
`src/lib/planning-principles.ts` 신설 — 4원칙 공통 모듈:
1. **시장 흐름 반영** — 2025~2026 기술·정책·수혜자 변화 반영
2. **통계적 근거 있는 설득** — "많은·다양한" 금지, 정량 포화
3. **제대로 된 문제정의** — 누가·무엇이·왜·왜 지금 4요소
4. **Before · After 정량 대비** — 현재값 → 목표값 (변화량)

이 모듈의 `COMMON_PLANNING_PRINCIPLES` 를 `curriculum-ai.ts` · `proposal-ai.ts` 프롬프트 최상단에 주입. pm-guide `static-content.ts` 에 관련 흔한 실수 4개 추가 (`rfp-03` 시장흐름 누락, `rfp-04` 문제정의 모호, `imp-03` Before/After 불명, `prop-03` 통계근거 없음).

---

### 8. Step 5, 7 에이전트 결과 1차 반려 후 재작업

Phase E 중 두 번 에이전트 결과를 **제1원칙 기준으로 반려** 했다:

- **Step 5 proposal-rules**: 에이전트 1차 결과의 Gate 3 메시지가 "…없으면 제안서 작성을 시작할 수 없습니다" 같은 시스템 에러 톤이었음. 제가 5개 메시지 전부 재작성 (scoringImpact · differentiationLoss · fixHint 3층 포함).
- **Step 7 시드**: 에이전트가 스스로 "Kolon·청년마을 snippet 이 약하다" 고 flag. 실제 파일 확인 결과 **둘 다 충분한 품질** 이었음 (2020년대 후반 시장 변화, 방문자→거주자 전환, 291명 액션코치 풀 등 포함). 에이전트가 자기 평가에 과소했던 케이스.

---

## 내가 틀렸던 것

1. **"코오롱 사례 반복" 을 앵커 교훈으로 강점이라 판단했다** — 실제로는 특수 케이스 부각 문제. 사용자가 원칙 본문에서 빼달라고 지적.
2. **2024-11 엑셀 분류 체계를 처음에 못 찾았다** — 내부 자산을 참조하기 전에 처음부터 설계하려 함. 사용자가 직접 엑셀을 첨부해야 발견.
3. **초기 가이드북 사이트 디자인이 너무 덤덤** — 언더독스 브랜드 톤을 약하게 설정. underdogs.global/boost 의 히어로 톤 반영이 1차에 안 됐다.
4. **마크다운 카드(`<div markdown>`) 를 쓰면 `<a>` 안이 `<p>` 로 감싸져서 깨진다는 걸 처음에 몰랐다** — 카드 빈 박스로 렌더링되는 문제가 두 번 발생 후에야 raw HTML 로 전환.
5. **Step 5 메시지 1차 결과물이 기준 미달인데 바로 검증 못 했다** — 에이전트 보고만 보고 "완료" 마킹했다가 사용자가 제1원칙 선언한 직후 재검증. 이후로는 모든 에이전트 결과를 `grep`/`Read` 로 직접 확인하는 프로토콜.

## 내가 맞았던 것

1. **"패턴" 대신 "축(facet)"** 이라는 접근. 수렴/다양성 딜레마를 그대로 풀었다.
2. **Step 5 메시지 재작성 결정**. 에이전트 1차 결과를 시간 아끼려 수용하지 않고 재작업한 것. 이게 이후 Step 6, 7 의 scoringImpact/differentiationLoss/fixHint 3층 표현의 기반이 됨.
3. **planning-principles.ts 를 별도 모듈로 분리**. 커리큘럼/제안서 AI 에 동일하게 주입 가능. 하드코딩 체크리스트와 달리 유지보수 포인트가 하나.
4. **guidebook-site 배포 파이프라인을 Vercel 로 단순화**. GitHub Pages 쪽으로 가려다 유혹 넘겼고, 결과적으로 배포 속도 2분 이내로 유지.

## 교훈 / 규칙 (다음 세션으로 가져갈)

1. **에이전트 결과물은 보고만 보고 수용하지 말 것** — `grep` + `Read` 로 실제 코드 · 실제 텍스트 확인 후 제1원칙 렌즈 통과해야 완료 표시.
2. **특수 케이스(사례) 가 원칙 본문을 점유하면 안 된다** — 사례는 참고 박스로 분리.
3. **deny 규칙을 내가 임시 해제할 때는 반드시 사용자 명시 요청 후에만** 하고 작업 후 복원.
4. **시장 흐름·통계 근거·문제정의·Before/After 4원칙** 은 이제 시스템 DNA. 커리큘럼 AI · 제안서 AI · pm-guide 에 이미 주입돼 있음.
5. **번역 에이전트 병렬 운영 시 중간에 끼어드는 지시는 검증 렌즈 재확인 용도로 쓴다** — 원칙을 새로 내건 뒤에는 이전 결과물도 재검증 대상.

## 결과물

- **ADR-006** (`docs/decisions/006-program-profile.md`) — 11축 결정 근거
- **program-profile.md v1.0** (`docs/architecture/program-profile.md`) — 축 스펙
- **Phase E Step 1~7** 전부 코드 반영 + 타입체크 clean
- **planning-principles.ts** — 4원칙 공통 모듈
- **가이드북 v2 한/영 양쪽** — https://site-wine-psi-37.vercel.app/ 로 배포
- **10 케이스 ProgramProfile 시드** — DB 연결 시 `npx prisma migrate deploy` + `npx tsx prisma/seed-program-profiles.ts`

다음 세션 시작 시점:
- DB 연결 후 마이그레이션 + 시드 실행
- Smoke Test 재검증 (Step 2 커리큘럼 AI 생성이 Phase E 프로파일·원칙 주입 이후 어떻게 달라지는지)
- Phase F (E2E 테스트 + Manifest 강제 + Vercel 배포)
