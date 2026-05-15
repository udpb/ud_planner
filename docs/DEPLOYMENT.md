# Vercel 배포 가이드

> Phase I Wave I5 — 프로덕션 배포 단계.
> 본 문서: 사용자 액션 체크리스트 + 환경변수 설명 + 트러블슈팅.

---

## 0. 사전 준비

| 항목 | 비고 |
|---|---|
| **GitHub 레포** | `https://github.com/udpb/ud_planner` (이미 push 됨) |
| **Vercel 계정** | https://vercel.com 가입 |
| **PostgreSQL DB** | Neon (https://neon.tech 무료 플랜 권장) 또는 Vercel Postgres |
| **Gemini API Key** | https://aistudio.google.com/apikey (Primary) |
| **Anthropic API Key** | https://console.anthropic.com/settings/keys (Fallback, 선택) |
| **Google OAuth** | https://console.cloud.google.com/apis/credentials (선택) |

---

## 1. Neon Postgres 준비

1. https://neon.tech 가입 → New Project
2. 프로젝트 이름: `ud-ops-prod` (자유)
3. Region: **Singapore** (한국 latency 유리) 또는 가장 가까운 곳
4. PostgreSQL version: 16
5. 생성 후 Connection String 복사 — 형식:
   ```
   postgresql://user:pass@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
6. (선택) Pooled / Direct 두 connection 모두 메모. 마이그/시드는 Direct 권장.

---

## 2. Vercel 프로젝트 생성

1. Vercel 대시보드 → **New Project**
2. **Import Git Repository** → `udpb/ud_planner` 선택
3. Framework: **Next.js** 자동 감지 — 그대로
4. **Root Directory**: 그대로 (./)
5. **Build & Output Settings**:
   - vercel.json 이 자동 적용 — 빌드 명령은 `npm run build:prod`
   - `prisma migrate deploy` 가 빌드 시 자동 실행 → DB 스키마 자동 동기화
6. **Environment Variables**: 아래 §3 표 참조 — 모두 입력 후 Deploy
7. **Deploy** 클릭

---

## 3. 환경변수 (Vercel Settings > Environment Variables)

### [필수] DB

| 변수 | 값 |
|---|---|
| `DATABASE_URL` | Neon connection string (위 §1) |

### [필수] AI — 둘 중 하나는 필수, 둘 다 권장

| 변수 | 값 |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio 발급 (Primary, L1) |
| `GEMINI_MODEL` | `gemini-3.1-pro-preview` (default 동일 — 미설정 OK) |
| `ANTHROPIC_API_KEY` | Anthropic Console 발급 (Fallback) |

### [필수] NextAuth

| 변수 | 값 |
|---|---|
| `AUTH_SECRET` | `openssl rand -base64 32` 또는 https://generate-secret.vercel.app/32 |
| `NEXTAUTH_URL` | `https://your-app.vercel.app` (배포 후 실제 URL 로 갱신) |

### [선택] Google OAuth

| 변수 | 값 |
|---|---|
| `AUTH_GOOGLE_ID` | Google Cloud Console 발급 |
| `AUTH_GOOGLE_SECRET` | 동상 |

OAuth 사용 시 **Authorized redirect URIs** 에 다음 추가 필수:
```
https://your-app.vercel.app/api/auth/callback/google
```

### [강력 권장] Supabase mirror — Phase Bridge 1

| 변수 | 용도 |
|---|---|
| `SUPABASE_URL` | `https://zwvrtxxgctyyctirntzj.supabase.co` |
| `SUPABASE_SERVICE_ROLE` | Service Role Key — RLS 우회 슈퍼키. 절대 클라이언트 노출 금지 |

미설정 시 ud-ops Project mirror 비활성 → coaching-log 가 빈 화면 (cross-app lifecycle 깨짐).

### [선택] Sentry 모니터링

| 변수 | 용도 |
|---|---|
| `SENTRY_DSN` | logger.error/warn 자동 수집. 운영 환경 적극 권장 |

### [선택] 외부 연동

| 변수 | 용도 |
|---|---|
| `NEXT_PUBLIC_APP_URL` | 외부 링크/이메일에서 사용 (NEXTAUTH_URL 과 동일 설정 권장) |
| `GITHUB_TOKEN` / `GITHUB_COACHES_*` | 코치 DB 동기화 |

### ⚠️ 절대 박지 말 것 (Production)

| 변수 | 이유 |
|---|---|
| `E2E_SECRET` | `/api/dev/seed-e2e` 가 secret 매칭 시 임의 user/project 생성 — E2E 가 production 대상으로 돌아야 할 때만 |
| `PLAYWRIGHT_MOCK_AI` | AI 응답을 fixture 로 대체 — 실제 사용자가 mock 응답 받음 (서비스 마비) |
| `AUTH_TRUST_HOST` | Vercel 은 X-Forwarded-Host 자동 검증 — `true` 박으면 host injection 표면 노출 |

---

## 4. 첫 배포 후 — 시드 실행

배포 자체는 자동으로 `prisma migrate deploy` 실행하지만 **시드 데이터는 별도** 입니다.

### 옵션 A — Vercel CLI 로 원격 시드

```bash
npx vercel link        # 로컬에서 Vercel 프로젝트 연결
npx vercel env pull    # 로컬에 .env.production.local 받기
npx tsx prisma/seed.ts                       # 기본 시드
npx tsx prisma/seed-channel-presets.ts       # Channel Preset
npx tsx prisma/seed-program-profiles.ts      # ProgramProfile 10 케이스
npx tsx prisma/seed-content-assets.ts        # Content Hub 5건
```

### 옵션 B — Neon SQL Editor 에서 수동
프로덕션 DB 에 직접 INSERT 실행. 일회성 작업.

---

## 5. Google OAuth 설정 (선택)

> 운영팀 외 사용자도 로그인 가능하게 하려면 필수.

1. https://console.cloud.google.com/apis/credentials
2. **Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. **Authorized JavaScript origins**:
   ```
   https://your-app.vercel.app
   ```
5. **Authorized redirect URIs**:
   ```
   https://your-app.vercel.app/api/auth/callback/google
   ```
6. Client ID + Secret 을 Vercel 환경변수에 입력 → Redeploy

---

## 6. 배포 검증 체크리스트

배포 후 다음 확인:

### 기본 인증·라우팅 (Phase L)
- [ ] 도메인 접속 → 로그인 페이지 노출
- [ ] @udimpact.ai 또는 @underdogs.co.kr 이메일로 로그인
- [ ] 미인증 `/api/projects` → 302 redirect (보호)
- [ ] gmail 등 외부 도메인 거부

### RFP → 1차본 흐름
- [ ] `/projects/new` → RFP 업로드 → 자동 분석 동작
- [ ] Express 화면 진입 → 챗봇 첫 질문 + quickReplies 표시
- [ ] 자동 저장 (debounced 1500ms) 동작
- [ ] 차별화 자산 토글 → 우측 sections 자동 채움

### Phase M — AI 자동 진단 (ADR-013)
- [ ] 사이드바 3 탭 (`AI 진단 / 채널·전략 / 발주처`) 표시
- [ ] "지금 진단 실행" 클릭 → channel(B2G/B2B/renewal) + framing(csr/strategy/sales/tech) 감지
- [ ] 채널 컨펌 (3 라디오 + B2B 시 부서 라디오) → 저장됨
- [ ] B2G 컨펌 후 평가배점 시뮬 카드 노출 (`/api/express/eval-simulate`)
- [ ] renewal 컨펌 후 직전 프로젝트 시드 카드 노출 (있을 때)
- [ ] 발주처 PDF 업로드 → 어휘·정책·실적 자동 추출

### Phase M3-1a — Markdown export
- [ ] 상단 우측 `📝 .md` 또는 다음 단계 패널의 `📝 마크다운` 클릭
- [ ] 한글 파일명 `<프로젝트명>_1차본.md` 다운로드
- [ ] 7섹션 + 진단 + 발주처 인용 모두 포함 확인

### 검수·인계
- [ ] 검수 클릭 → InspectorReportCard (총점 + 7 렌즈 막대 + Top 3 이슈)
- [ ] 1차본 승인 → Project 필드 + ProposalSection 7건 시드 toast
- [ ] "정밀 기획 (Deep) →" 클릭 → Step 1 RFP 화면 + 데이터 인계 확인

### Wave 1 (신뢰성)
- [ ] 자동저장 3회 연속 실패 시 영구 banner 표시 (PersistentErrorBanner)
- [ ] 채팅 인풋 textarea 작성 후 새로고침 → 인풋 복원 (sessionStorage)
- [ ] 다른 user 의 프로젝트 URL 접근 시 403 (권한 체크)

### Wave 4 (모바일)
- [ ] 모바일 (≤768px) — 상단 segmented tab (`💬 채팅 / 👁 미리보기 / 🤖 진단`)
- [ ] NorthStarBar — 모바일에선 단계 라벨 hide + 5 점만 표시
- [ ] 채팅 입력 — 전송 버튼 44x44px (터치 친화)
- [ ] 모든 액션 버튼이 1 줄 또는 stack 으로 자연스럽게 wrap

---

## 7. 트러블슈팅

### 빌드 실패: `prisma migrate deploy` 에러

원인: `DATABASE_URL` 미설정 또는 잘못된 connection string.
대응: Vercel 환경변수 다시 확인 + Neon SQL Editor 로 connection 테스트.

### AI 호출 실패: `Gemini + Claude 모두 실패`

원인: 두 키 모두 미설정 또는 invalid.
대응: 최소 하나 (`GEMINI_API_KEY` 권장) 는 설정. Anthropic key 도 같이 두면 자동 fallback.

### 함수 timeout (60초 초과)

원인: AI 호출이 60초 넘김 (Logic Model 일괄 생성, 1차본 final draft 등).
대응:
- Vercel Hobby plan: 60초 제한 — Express PoC 는 처리 가능, Deep 의 logic-model 이 60초 넘기면 분할
- Pro plan: 300초까지 가능
- 일시적: prompt 단순화 또는 `maxTokens` 축소

### `manifest check 에러` 빌드 시

`prebuild` 가 `npm run check:manifest` 를 실행하고 errors 있으면 빌드 실패.
대응: `npm run check:manifest` 를 로컬에서 실행해 같은 에러 reproduce → fix → push.

### NextAuth callback URL mismatch

원인: Google OAuth Redirect URI 가 `NEXTAUTH_URL` 과 다름.
대응: §5 의 Authorized redirect URIs 갱신.

### NextAuth `UntrustedHost` 에러 (production 로그)

원인: Vercel 이 X-Forwarded-Host 자동 검증해야 하는데 reverse proxy 미설정.
대응:
1. Vercel 표준 deployment 라면 자동 trust — `AUTH_URL` 환경변수가 정확한 production URL 인지 확인
2. 자체 호스팅 (Docker 등) 이라면 `AUTH_TRUST_HOST="true"` 박기 (보안 검토 후)

### Phase M API timeout (60초 초과)

원인: AI 자동 진단 4종 동시 호출 시 누적 시간 초과 가능.
대응:
- diagnose 호출 시 `kinds` 를 분할 (예: `['channel']` 만 먼저, 그 후 `['framing']`)
- Vercel Pro plan 으로 maxDuration 300초 확장 (자주 발생 시)

### 발주처 PDF 업로드 — 큰 파일 timeout

원인: `unpdf` 가 큰 PDF (50MB+) 처리 중 60초 초과.
대응: 사용자에게 핵심 페이지만 추출하거나 텍스트 paste 모드 권장.

### Phase M 진단 결과가 화면에 안 나타남 (Wave 1 #3 race)

증상: 진단 실행했는데 사이드바 카드 안 보임.
원인: ExpressShell 의 setDraft state stale.
대응: 이미 Wave 1 #3 에서 fix 됨 (onDiagnosed callback + setDraft merge).
재발 시: 브라우저 새로고침으로 server-rendered initialDraft 다시 받기.

### seed-e2e 가 production 에서 노출됐는지 확인

검증: `curl -X POST https://your-app.vercel.app/api/dev/seed-e2e` → 404 가 정상.
만약 503 또는 401 받으면 → `E2E_SECRET` 환경변수가 박혀 있음 → 즉시 제거.

---

## 8. CI / GitHub Actions

`.github/workflows/ci.yml` 이 있으면 PR 마다 자동 lint + typecheck + build.
PAT 가 `workflow` scope 갖고 있어야 push 됨 (Phase I 세션 트러블슈팅 참조).

---

## 9. 도메인 연결 (선택)

1. Vercel Settings → Domains
2. 커스텀 도메인 추가 (예: `ops.underdogs.global`)
3. DNS 에 CNAME 또는 A 레코드 설정
4. SSL 자동 발급 대기 (~10분)
5. `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL` 도 갱신 + Google OAuth Redirect URIs 갱신

---

## 변경 이력

| 일자 | 변경 |
|---|---|
| 2026-04-28 | 초판 — Phase I Wave I5 (Vercel 배포 + GitHub push) |
| 2026-05-15 | Phase M (ADR-013 Express 2.0) + Wave 1~4 반영 — AI 자동 진단 4종 · 채널 컨펌 · B2G 시뮬 · renewal 시드 · 발주처 ingestion · Markdown export · 권한 체크 · 영구 에러 banner · 채팅 인풏 보존 · 모바일 반응형. .env.production.example 갱신 (AUTH_TRUST_HOST 정책 + E2E_SECRET production 금지). 검증 체크리스트 8 → 32 항목. 트러블슈팅 5 → 11 케이스. |
