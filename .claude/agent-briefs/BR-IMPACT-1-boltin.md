# Brief BR-IMPACT-1 — 임팩트 볼트인 (forecast 렌즈 미리보기 + impact-measurement 쓰기/리포트 임베드)

> **자급자족.** 서브는 본 파일 + `CLAUDE.md` + `AGENTS.md` + `docs/glossary.md` + `.claude/skills/ud-design-system/SKILL.md` 로 작업. 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-IMPACT-1-boltin` |
| Owner | 메인 세션 |
| 작성일 | 2026-06-22 |
| 상태 | 🔲 대기 |
| 의존 | impact-measurement `feat/service-api`(POST predict 완성) · `src/lib/impact/`(Wave M, read+forecast) |
| 격리 | ud-ops 현재 브랜치 `feat/sroi-integration` in-place |

## 🎯 Mission
"기획 → 임팩트 리포트"의 볼트인 완성. **③ 임팩트 화면**에서 (1) **forecast 렌즈 미리보기**(기존 `impact/` 재사용) + (2) **"공식 리포트 생성"** → impact-measurement에 prediction 쓰기 → (3) **공식 리포트를 ud-planner 안에 임베드**(`/view/{shareToken}`). 사용자는 두 앱을 오가지 않는다.

> ⭐ **SROI=렌즈, 높을수록 좋은 게 아님** — 비율 최대화/랭킹 금지. 분해 + 정상범위(1:1~1:10) + 가정 표시. (DesignRule `Z-sroi-is-lens-not-target`)

## 📋 핵심 — 중복 정리 먼저
`src/lib/sroi/`(2026-06-20 BR-SROI-1)는 `src/lib/impact/`(Wave M)와 **계수 읽기·SROI 계산이 중복**이다. 정리:
- **유지**: `src/lib/impact/*`(db read·forecast·engine) = forecast 미리보기 정본. 건드리지 말고 **재사용**.
- **흡수**: `src/lib/sroi/`의 **predict 호출(쓰기)만** `src/lib/impact/handoff.ts`(신규)로 이동.
- **삭제**: `src/lib/sroi/{client.ts,predict.ts,map-plan-to-impact.ts,types.ts}` 중 중복분(fetchCoefficients·computePredictedSroi). predict 요청/응답 타입은 handoff.ts로 옮겨 살림. `scripts/_test-sroi.ts`도 정리/이전.

## ✅ Prerequisites (STOP 조건)
- [ ] `src/lib/impact/db.ts`·`forecast.ts`·`engine.ts` 존재 (Wave M)
- [ ] impact-measurement `POST /api/v1/measurements/predict` 계약 (아래) — 배포는 사용자가 별도 진행. **미배포여도 코드 빌드·graceful은 가능**, 라이브 실측만 배포 후.
- [ ] env: `IMPACT_MEASUREMENT_DATABASE_URL`(읽기, 기존) · `SROI_SERVICE_URL`(기본 `https://impact-measurement-udi.vercel.app`) · `SERVICE_API_TOKEN`(쓰기). **없으면 graceful**(미리보기는 db 있으면 동작, 리포트 생성 버튼은 "연동 미설정" 안내).

## 📖 Read First
1. `CLAUDE.md`·`AGENTS.md`·`docs/glossary.md`·`ud-design-system/SKILL.md`
2. `src/lib/impact/{db,forecast,engine,types}.ts` ⭐ — 재사용 대상. `forecastImpact()`·`ImpactForecast` 모델·breakdown 구조
3. `src/app/(dashboard)/projects/[id]/impact-forecast/page.tsx` + `forecast-client.tsx` — 기존 ③ 화면(확장 또는 합류 대상)
4. `src/lib/sroi/*` — 흡수/삭제 대상 (predict 호출 로직만 건짐)
5. impact-measurement 서비스 계약:
   ```
   POST {SROI_SERVICE_URL}/api/v1/measurements/predict   (Authorization: Bearer SERVICE_API_TOKEN)
     body: { externalProjectId, title, country?, budget?, programType?, totalParticipants?,
             items:[{categoryId, count?, participants?, newEmployees?, investmentAmount?, ...}] }
     → { measurementId, totalSocialValue, beneficiaryCount, sroi, breakdown, reportUrl, shareToken }
   reportUrl = {SROI_SERVICE_URL}/view/{shareToken}  (공개 — 임베드 가능)
   ```

## 🎯 Scope
### CAN touch
- `src/lib/impact/handoff.ts` (신규 — predict 호출 + reportUrl)
- `src/app/api/projects/[id]/impact-report/route.ts` (신규 — POST: forecast→items→handoff, 인증)
- `src/app/(dashboard)/projects/[id]/impact-forecast/**` (③ 화면 확장: 렌즈 미리보기 + 리포트 생성 + 임베드)
- `src/lib/sroi/**` (정리/삭제) · `scripts/_test-sroi.ts`(이전) · `scripts/_test-impact-handoff.ts`(신규)
- `.env.example`
### MUST NOT touch
- `src/lib/impact/{db,forecast,engine}.ts` 동작 변경 (재사용만 — 필요한 추출 헬퍼는 추가 가능하나 기존 시그니처·동작 보존)
- prisma 스키마 · ai-fallback 시그니처 · `src/components/ui/**` · program-design 엔진 · 다른 트랙 · manifest
- impact-measurement 레포 (별건)

## 🛠 Tasks
1. **중복 정리** — `src/lib/sroi/`에서 predict 호출 로직을 `impact/handoff.ts`로 옮기고, 계수 읽기·로컬 계산 중복분 삭제. import 깨짐 0 확인.
2. **`impact/handoff.ts`** — `requestOfficialReport(projectId): Promise<{ sroi, reportUrl, shareToken } | null>`:
   - 기존 `ImpactForecast`(또는 `forecastImpact` 재호출)의 items를 predict items로 매핑 → POST predict (Bearer 토큰, 8s 타임아웃) → 결과 반환. config/네트워크 실패 → null + log.warn(throw 금지). 토큰 로그 비노출.
3. **API `POST /api/projects/[id]/impact-report`** — 인증(requireProjectAccess) → handoff 호출 → {sroi, reportUrl, shareToken} 반환. env 미설정 → 명확한 4xx 메시지("연동 미설정").
4. **③ 임팩트 화면** (`impact-forecast` 확장) — 디자인킷:
   - **forecast 렌즈 미리보기**: 기존 ImpactForecast의 totalSocialValue·breakdown + **SROI 비율 + 정상범위(1:1~1:10) 맥락** + 가정(assumptions)/calibrationNote. (최대화·랭킹 표현 금지)
   - **"공식 리포트 생성" 버튼** → API 호출 → 성공 시 `reportUrl`을 **iframe으로 임베드**(같은 화면 안에서 공식 리포트 표시) + "PDF/공유" 링크. 실패/미설정 → 안내.
   - env 미설정 시 미리보기·버튼이 graceful(앱 안 죽음).

## 🧪 Self-Verification
- [ ] `npm run typecheck` · `npm run lint`(신규 0) · `npm run check:manifest` 통과
- [ ] sroi 정리 후 import 깨짐 0 (`tsc` clean)
- [ ] `npx tsx scripts/_test-impact-handoff.ts` — 오프라인: handoff가 env 없을 때 null+graceful, 매핑(forecast items→predict items) 정확, 하드코딩 0. (라이브 POST는 **배포+토큰 후 메인 실측** — 백그라운드 네트워크 금지)
- [ ] `npm run dev`로 ③ 화면 렌더 확인(env 없어도 미리보기 graceful·버튼 안내). 디자인킷 위반 0(bg-primary/rounded-*/폐기hex 0)
- [ ] `git diff --name-only` ⊆ CAN-touch

## 📤 Return (5섹션, 한국어): ✅한일 / ❌못한일 / 🤔결정(ADR후보) / 🔬검증(오프라인 실측+git diff --stat) / ⚠️위험

## ⚠️ 주의
- **SROI 최대화/랭킹 로직 금지** — 렌즈/분해/정상범위/가정만.
- 기존 `impact/` Wave M 동작 깨지 마라(재사용만). 회귀 0.
- 결과변수(고용·투자·창업전환) 추측 생성 금지 — forecast가 이미 confidence/보수보정으로 처리하니 그 출력을 쓴다.
- 라이브 실측은 배포+토큰 후 메인이. 커밋하지 마라(메인 검수).
