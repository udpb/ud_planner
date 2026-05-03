# Playwright E2E

3-tier 시나리오 구조 (Phase 4-coach-integration, 2026-05-03):

| Project | testMatch | 의존성 | CI 자동? |
|---|---|---|---|
| `smoke` | `tests/e2e/smoke.spec.ts` | 없음 (미인증) | ✅ |
| `auth-flow` | `tests/e2e/auth-flow.spec.ts` | DB user 자동 생성 | ✅ |
| `authenticated` | `tests/e2e/authenticated/*.spec.ts` | E2E_SECRET + DB | 옵션 |

## 실행

### 로컬 (smoke + auth-flow 만)
```powershell
npm run build           # 한 번만 (production server 셋업)
npm run e2e:install     # chromium 다운로드 (한 번만)
npm run e2e -- --project=smoke
npm run e2e -- --project=auth-flow
```

### 로컬 (authenticated 까지)

`.env.local` 에 추가:
```bash
E2E_SECRET="any-random-string-32-chars-minimum"
PLAYWRIGHT_MOCK_AI="true"   # AI 호출 모킹 (비용 절약)
```

실행:
```powershell
npm run e2e
```

globalSetup 이 자동으로:
1. `/api/dev/seed-e2e` 호출 → fresh user `e2e-test@udimpact.ai` + Project 생성
2. login → storageState 저장 (`playwright/.auth/user.json`)
3. `authenticated/*.spec.ts` 가 storageState 재사용

### CI

`.github/workflows/e2e.yml` 이 master push / PR 시 자동 실행.

기본: smoke + auth-flow 만 (DB dummy).
authenticated 까지 활성화하려면 GitHub Secrets 에 `E2E_SECRET` 추가 + workflow 의 `--project=...` 인자 조정.

## AI Mock

`PLAYWRIGHT_MOCK_AI=true` 일 때 `src/lib/ai-fallback.ts` 의 `invokeAi` 가 실제 호출 대신
`src/lib/ai-mock.ts` 의 fixture JSON 반환.

지원 label:
- `parse-rfp` — 청년 창업 회복탄력성 사업 더미 RFP 파싱 결과
- `express-first-turn` / `express-turn` — Express 챗봇 응답
- `proposal-section-1` / `proposal-section-2` — 마크다운 섹션 본문
- `logic-model-builder` — Logic Model 5계층
- `suggest-impact-goal` — 임팩트 목표 제안

label 매칭 안 되면 `{}` 반환 (테스트 깨지지 않게).

## 시나리오

### `smoke.spec.ts` (7 테스트)
- 미인증 라우팅 (/, /admin/metrics, /projects → /login)
- /login 페이지 200 + 이메일 form
- 미인증 API → 401/302

### `auth-flow.spec.ts` (5 테스트)
- 이메일 입력 → 로그인 → 보호 페이지 진입
- 잘못된 도메인 (gmail.com) 거부
- 미인증 API 보호 + rate-limit 형태 검증

### `authenticated/rfp-upload.spec.ts` (2 테스트)
- POST /api/ai/parse-rfp → mock 응답 검증
- PUT 으로 저장 → DB 반영 확인

### `authenticated/express-turn.spec.ts` (2 테스트)
- 첫 턴 (firstTurn=true) → intent 추출 + auto-extract 카드
- 두 번째 턴 → beforeAfter.before 추출

### `authenticated/proposal-section.spec.ts` (2 테스트)
- section 1 생성 → DB 저장 + 메타데이터
- rate-limit 11회 호출 → 429

## 디버그

```powershell
npm run e2e:headed          # 브라우저 visible
npm run e2e:ui              # Playwright UI mode
npm run e2e -- --debug      # step-by-step 디버깅
```

실패 시 `playwright-report/` 자동 생성. CI 실패 artifact 7일 보존.

## 한계 / 후속

- AI mock 은 deterministic — quality assurance 가 아니라 **회귀 감지** 용도.
- PipelineContext 슬라이스 의존성 (logicModel / curriculum / coaches / budget) 까지
  완전 셋업하려면 추가 dev seed endpoint 필요.
- Playwright trace + screenshot 으로 실패 원인 즉시 확인 가능.
