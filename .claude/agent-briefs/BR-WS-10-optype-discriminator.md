# Brief BR-WS-10 — SI-optype: 운영유형 오분류 보정 (교육 사업이 데모데이 때문에 T5 되는 버그)

> **자급자족.** 본 파일 + `CLAUDE.md` + `AGENTS.md` + [service-improvements-backlog.md](../../docs/architecture/service-improvements-backlog.md) + `docs/decisions/028-program-design-grammar.md`. 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-WS-10-optype-discriminator` (백로그 SI-optype, 순서 4) · 2026-06-23 |
| 격리 | ud-ops `feat/sroi-integration` in-place |

## 🎯 Mission
라이브 검수 버그: "**서울 AI 허브 청년 창업팀 육성**"(교육 코호트)이 **T5(행사 운영형)** 로 자동 분류 → 회차표(커리큘럼) 실종.
원인: `resolve-rules.ts` `detectOperatingType` 의 `T5_EVENT_KEYWORDS` 에 **"데모데이"**(교육 프로그램의 흔한 마일스톤)가 들어 있어, RFP 텍스트에 데모데이만 있으면 단일 매치로 **자동 T5**. 교육 신호("육성·교육")를 무시함.

**고친다(규칙 철학 그대로 — "명백하면 자동, 모호하면 게이트, decisionPolicy=auto_unless_conflict"):**
강한 **본체-행사** 신호만 자동 T5. 약한 행사어(데모데이·경진대회·공모전 등)는 **교육 신호와 함께 나오면 충돌 → 게이트(PM 결정)**. 즉 **오분류 대신 보수적으로 사람에게 위임.**

## 📋 현재 (정독)
`src/lib/program-design/resolve-rules.ts`:
- `T5_EVENT_KEYWORDS = ['경진대회','박람회','공모전','데모데이','페스티벌','컨퍼런스','운영 대행','운영대행','행사 운영','행사운영']` — 강·약 신호 혼재.
- `T4_INDIVIDUAL_KEYWORDS = ['소상공인','상인','점포','재창업','자영업','전통시장','소공인','후속 보육','후속보육']`.
- `detectOperatingType(input)`: T5 1순위 단일 `includes` → T4 → null(게이트). `buildSignalText` 가 projectName·summary·targetAudience·objectives·deliverables·keywords·targetStage 결합.
- 호출부 `resolveOperatingType`(~229줄~): signal 있으면 auto decided, 없으면 gate(PlanGate). **이 게이트 흐름은 그대로 — null 반환이 곧 게이트.**

## 🎯 Scope
### CAN touch
- `src/lib/program-design/resolve-rules.ts` — `detectOperatingType` + 키워드 사전 + (신규)교육 신호·충돌 판정. **반환 계약(OperatingTypeSignal|null) 유지** — null=게이트.
### MUST NOT touch
- `plan-types.ts` · `generate-plan.ts`(구조 생성) · `design-rules.json` · 게이트 생성부(resolveOperatingType 의 PlanGate 조립 형태) · prisma · invokeAi · 다른 lib/컴포넌트

## 🛠 Tasks
1. **T5 신호를 강/약으로 분리:**
   - `T5_STRONG`(본체가 행사 운영 = 자동 T5): `'운영 대행','운영대행','행사 운영','행사운영','대행 용역','행사 대행'`. (사업의 산출물이 행사 운영 그 자체.)
   - `T5_WEAK_EVENT`(행사어지만 교육의 마일스톤일 수 있음): `'데모데이','경진대회','공모전','박람회','페스티벌','컨퍼런스','해커톤'`.
2. **교육 신호 사전 추가:** `EDUCATION_SIGNALS = ['교육','육성','양성','과정','커리큘럼','역량','캠프','부트캠프','아카데미','코칭','멘토링','교육생','수강','워크숍','강좌']`.
3. **detectOperatingType 로직 교체(계약 유지):**
   - `T5_STRONG` 매치 → 자동 `T5`(why: 본체가 행사 운영 대행).
   - `T5_STRONG` 없고 `T5_WEAK_EVENT` 매치:
     - **교육 신호도 있으면 → 충돌 → `null`(게이트)** (오분류 금지. 게이트 why에 "행사어와 교육 신호 공존 — 행사 본체인지 교육의 마일스톤인지 사람이 결정"이 뜨도록, 호출부 게이트 메시지는 기존 그대로면 OK — 단지 null 반환).
     - 교육 신호 **없으면** → 자동 `T5`(순수 행사).
   - T4: 기존 `T4_INDIVIDUAL_KEYWORDS` 유지하되 동일 원칙 — 강한 개별-사업체 신호(소상공인·전통시장·점포·자영업·소공인)는 자동 T4 유지. (교육 코호트 신호와 충돌 시 게이트로 둘지는 보수적으로: 일단 T4 강신호는 유지, 과교정 주의.)
   - T1/T2/T3 = 기존대로 신호만으로 결정 안 함(null→게이트).
4. **why/evidence 문구**도 사용자-facing 자연어 유지(이미 그러함). 내부 §코드 인용은 최소.

## 🧪 Self-Verification (필수 — 임시 tsx 테스트로 증명 후 삭제)
- `청년 창업팀 육성 … 데모데이` → **null(게이트)** (교육+약신호 충돌). ← 핵심 회귀
- `OO 박람회 운영 대행 용역` (교육 신호 없음) → **T5**.
- `데모데이` 만 있고 교육 신호 전무 → **T5**.
- `전통시장 소상공인 디지털 교육` → **T4**(강 개별신호 유지) — 단 과교정으로 T4가 사라지지 않는지 확인.
- 일반 청년 창업 교육(행사어 없음) → **null(게이트)** (기존대로).
- [ ] `typecheck`·`lint`(신규0)·`check:manifest`·`build` 통과 · `git diff`=`resolve-rules.ts`만 · 반환 계약·게이트 조립 무변경
- [ ] ⚠️ 메인이 Vercel 프리뷰+Chrome으로 "서울 AI 허브" 류가 게이트로 뜨는지 사후 검수 → **코드 ✓ + 위 단위 케이스** 보증.

## 📤 Return (5섹션): ✅한일/❌못한일/🤔결정(ADR후보 — 키워드의 data 이관 등)/🔬검증(`코드 ✓`+단위 케이스 결과+git diff/`시각 미확인`)/⚠️위험

## ⚠️ 주의
- **과교정 금지** — 진짜 행사 대행(T5)·진짜 개별 사업체(T4)는 그대로 자동. 바뀌는 건 **약한 행사어+교육 공존 = 게이트**.
- 반환 계약(OperatingTypeSignal|null)·게이트 흐름 무변경. 키워드 사전을 data(design-rules.json)로 옮기는 건 범위 밖(ADR 후보로만).
- 커밋 금지(메인 검수·프리뷰 검수).
