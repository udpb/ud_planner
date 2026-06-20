# Brief BR-SROI-1 — ud-ops SROI 클라이언트 (라이브 호출 + 예측 + 리포트 핸드오프)

> **자급자족 브리프.** 서브는 본 파일 + `CLAUDE.md` + `AGENTS.md` + `docs/glossary.md` 로 작업. 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-SROI-1-client` |
| Owner | 메인 세션 |
| 작성일 | 2026-06-20 |
| 상태 | 🔲 대기 |
| 의존 | impact-measurement 서비스 API(`feat/service-api`, 계약 확정·커밋됨) |
| 우선순위 | P0 |
| 격리 | 현재 브랜치 `feat/sroi-integration` in-place |

## 🎯 Mission
ud-ops가 배포된 impact-measurement SROI 서비스를 **라이브 호출**해 (1) 라이브 proxy로 **예측 SROI 계산**, (2) **임팩트 리포트 핸드오프**까지 하는 **클라이언트 라이브러리**를 만든다. **UI 연결은 범위 밖**(별건) — 이 브리프는 lib + 헤드리스 검증까지.

> ⭐ **SROI는 렌즈이지 타깃이 아니다.** 높을수록 좋은 게 아님 — 비율 최대화 금지. 출력은 **카테고리별 분해 + 가정(assumptions) 명시**로, "왜 이 임팩트가 나오는가"를 보여주는 것. 설계를 SROI로 줄세우지 말 것.

## 📋 Context — 서비스 계약 (impact-measurement, 토큰 인증)
```
GET  /api/v1/coefficients?country=KR
  → { asOf, country, categories: [{ categoryId, categoryName, impactTypeName,
      formulaVariables: string[], combinedProxyValue: number, version, effectiveDate }] }

POST /api/v1/measurements/predict
  body: { externalProjectId, title, country?, budget?, programType?, participantType?,
          totalParticipants?, startDate?, endDate?,
          items: [{ categoryId, count?, participants?, days?, months?, revenue?,
                    newEmployees?, investmentAmount?, bizFund?, coachesTrained?,
                    eventParticipants?, spaceArea?, spaceDuration? }] }
  → { measurementId, totalSocialValue, beneficiaryCount, sroi, breakdown, reportUrl, shareToken }

인증: Authorization: Bearer ${SERVICE_API_TOKEN}
사회가치 산식: 카테고리값 = combinedProxyValue × ∏(formulaVariables 값). SROI = Σ / 예산.
```

## ✅ Prerequisites
- [ ] env: `SROI_SERVICE_URL`(기본 `https://impact-measurement-udi.vercel.app`) · `SERVICE_API_TOKEN`. **없으면 클라이언트는 비활성(graceful null) — 에러로 죽지 말 것.**
- [ ] `src/lib/program-design/plan-types.ts` 의 `ProgramPlan` 타입 확인(매핑 입력)

## 📖 Read First
1. `CLAUDE.md`·`AGENTS.md`·`docs/glossary.md`
2. `src/lib/program-design/plan-types.ts` — `ProgramPlan`(operatingType·decisionLog·structure·meta)·구조 종류
3. `src/lib/ai-fallback.ts` 주변 — fetch/에러 패턴 참고(이건 AI 아님, 일반 fetch)
4. 위 계약 (서비스 API)

## 🎯 Scope
### CAN touch
- `src/lib/sroi/client.ts`(신규 — fetch coefficients/predict, env config, graceful)
- `src/lib/sroi/map-plan-to-impact.ts`(신규 — ProgramPlan → impact items)
- `src/lib/sroi/predict.ts`(신규 — coefficients+items → 예측 SROI·분해)
- `src/lib/sroi/types.ts`(신규 — 계약 타입)
- `scripts/_test-sroi.ts`(신규 — 헤드리스 검증)
- `.env.example`(있으면 — `SROI_SERVICE_URL`·`SERVICE_API_TOKEN` 추가)
### MUST NOT touch
- `src/lib/program-design/**`(읽기만) · prisma 스키마 · ai-fallback 시그니처 · UI 컴포넌트 · 다른 트랙 · manifest
- impact-measurement 레포(별건, 건드리지 마라)

## 🛠 Tasks
1. **types.ts** — `CoefficientEntry`·`CoefficientsResponse`·`PredictRequest`·`PredictResponse`·`PredictedSroi`(아래) 계약 타입.
2. **client.ts** — `getServiceConfig()`(env에서 url+token, 없으면 null) · `fetchCoefficients(country='KR'): Promise<CoefficientsResponse | null>` · `requestPrediction(body): Promise<PredictResponse | null>`. Bearer 헤더. **graceful**: config 없거나 네트워크 실패/4xx-5xx → null + `log.warn`(throw 금지). 타임아웃(예: 8s).
3. **map-plan-to-impact.ts** — `mapPlanToImpactItems(plan, goal): { items: PredictItem[], assumptions: Assumption[] }`:
   - **직접 도출(설계 사실)**: participants(인원), 1:1 코칭 카테고리 count=코칭 회수·participants=인원, 교육 카테고리 등 — ProgramPlan/구조에서 읽을 수 있는 것.
   - **결과 변수(가정)**: newEmployees·investmentAmount·창업전환·revenue 등은 **설계가 아니라 목표/추정** → 클라이언트 목표(kpiTargets)나 PM 입력에서만. **없으면 추측 생성 금지** — `assumptions`에 "PM 입력 필요"로 표시하고 그 카테고리는 제외(부분 예측). (= SROI 예측은 불확실하다는 원칙)
   - 매핑 규칙은 **하드코딩 수치 금지** — proxy는 서비스에서, 변수는 plan/goal에서.
4. **predict.ts** — `computePredictedSroi(coefficients, items, budget?): PredictedSroi`:
   - 카테고리별 value = combinedProxyValue × ∏(formulaVariables). breakdown[{categoryId, categoryName, value, vars}]. totalSocialValue=Σ. sroi = budget>0 ? total/budget : null.
   - **렌즈 프레이밍**: 반환에 `lens: { dominantCategory, note: 'SROI는 비율 — 분해와 가정을 함께 보라' }` + `assumptions`. **랭킹/최대화 함수 만들지 말 것.**
   - `requestReport(plan, goal): Promise<{ sroi, reportUrl } | null>` — map → client.requestPrediction → 결과.
5. **_test-sroi.ts** — 헤드리스: (a) **오프라인** mock coefficients로 computePredictedSroi 검증(매핑·분해·sroi 산식·assumptions). (b) env 있으면 **라이브** fetchCoefficients 1회(배포 후 실측). 토큰/URL 없으면 graceful 스킵 메시지.

## 🧪 Self-Verification
- [ ] `npm run typecheck` · `npm run lint`(신규 0) · `npm run check:manifest` 통과
- [ ] `npx tsx scripts/_test-sroi.ts` — 오프라인 mock으로 PASS(분해·sroi·assumptions·하드코딩 수치 0 자기 grep). env 없을 때 graceful(throw 0)
- [ ] env에 SROI_SERVICE_URL·SERVICE_API_TOKEN 없이도 import·호출이 null 반환(앱이 안 죽음) 확인
- [ ] `git diff --name-only` ⊆ CAN-touch
- [ ] ⚠️ 라이브 호출은 **배포 후 메인이 실측** — 서브가 백그라운드로 네트워크 돌려 결과 유실 금지

## 📤 Return (5섹션, 한국어): ✅한일 / ❌못한일 / 🤔결정(ADR후보) / 🔬검증(실측+오프라인 결과+git diff --stat) / ⚠️위험

## ⚠️ 주의
- **SROI 최대화·랭킹 로직 만들지 마라** — 렌즈/분해/가정만. (사용자 핵심: 높을수록 좋은 게 아님)
- **결과 변수(고용·투자·창업전환) 추측 생성 금지** — 목표/PM입력에서만, 없으면 assumptions로 표시·제외.
- **graceful 필수** — 서비스 없음/다운/토큰없음에 앱이 죽으면 안 됨(SROI는 옵션 렌즈).
- 토큰을 코드·로그·커밋에 넣지 마라(env만). 커밋하지 마라(메인 검수).
