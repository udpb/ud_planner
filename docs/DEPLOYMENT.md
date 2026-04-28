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

### [선택] 외부 연동

| 변수 | 용도 |
|---|---|
| `NEXT_PUBLIC_APP_URL` | 외부 링크/이메일에서 사용 (NEXTAUTH_URL 과 동일 설정 권장) |
| `GITHUB_TOKEN` / `GITHUB_COACHES_*` | 코치 DB 동기화 |
| `GOOGLE_*` (Sheets) | 피드백/코치/예산 시트 연동 |

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

- [ ] 도메인 접속 → 로그인 페이지 노출
- [ ] 개발 모드 Credentials 또는 Google OAuth 로 로그인
- [ ] `/projects/new` → RFP 업로드 → 자동 분석 동작
- [ ] Express 화면 진입 → 챗봇 첫 질문 + quickReplies 표시
- [ ] 자동 저장 (debounced 1500ms) 동작
- [ ] 차별화 자산 토글 → 우측 sections 자동 채움
- [ ] 1차본 승인 → 검수 점수 + Project 필드 + ProposalSection 7건 시드 toast
- [ ] "정밀 기획 (Deep) →" 클릭 → Step 1 RFP 화면 + 데이터 인계 확인

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
