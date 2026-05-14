/**
 * Playwright E2E 설정 (Phase 4-coach-integration, 2026-05-03)
 *
 * Projects 분리:
 *   - smoke      : 미인증 라우팅만 (storageState 없음, 빠른 1분 내)
 *   - auth-flow  : 로그인 흐름 검증 (storageState 없음)
 *   - authenticated : 인증된 상태에서 RFP/Express/제안서 시나리오
 *                     (globalSetup 이 storageState 저장 후 재사용)
 *
 * 실행:
 *   npm run e2e                 — 모든 project 실행
 *   npm run e2e -- --project=smoke   — smoke 만
 *   npm run e2e:install         — chromium 다운로드 (한 번만)
 *
 * E2E 환경:
 *   E2E_SECRET           — seed endpoint 인증 (없으면 authenticated project skip)
 *   PLAYWRIGHT_MOCK_AI   — 'true' 권장 (실제 AI 호출 절약)
 *   E2E_PROJECT_ID       — globalSetup 이 자동 set
 */

import { defineConfig, devices } from '@playwright/test'
import { config as dotenvConfig } from 'dotenv'
import { existsSync } from 'node:fs'

// Next.js 와 동일한 우선순위로 .env.local → .env 자동 로드 (playwright process)
// 이 두 파일 안 읽으면 process.env.E2E_SECRET 이 undefined → authenticated skip
// (사용자 피드백: .env.local 추가했는데도 미설정 경고)
for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) {
    dotenvConfig({ path: file, override: false })
  }
}

const PORT = Number(process.env.E2E_PORT ?? 3100)
const BASE_URL = `http://localhost:${PORT}`
const STORAGE_STATE = 'playwright/.auth/user.json'

// E2E_SECRET 가 있어야 authenticated project 실행 가능 (storageState 생성용)
const hasE2ESecret = !!process.env.E2E_SECRET

if (!hasE2ESecret) {
  // playwright 실행 시 명시적 안내 — 실패 후 디버그 시간 절약
  console.warn(
    '\n[playwright.config] ⚠️  E2E_SECRET 환경변수 미설정 — authenticated project 자동 skip.\n' +
      '  smoke + auth-flow (총 11 tests) 만 실행됩니다.\n' +
      '  authenticated 13 tests 실행하려면 .env.local 에 추가:\n' +
      '    E2E_SECRET="<32자 이상 랜덤>"\n' +
      '    PLAYWRIGHT_MOCK_AI="true"   (실제 AI 호출 절약 권장)\n',
  )
}

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',

  // E2E_SECRET 있을 때만 globalSetup 실행 (없으면 smoke / auth-flow 만)
  globalSetup: hasE2ESecret ? './tests/e2e/_fixtures/global-setup.ts' : undefined,

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'smoke',
      testMatch: /smoke\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'auth-flow',
      testMatch: /auth-flow\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    // E2E_SECRET 없으면 authenticated project 자체를 등록 안 함 —
    // 빈 testMatch 로 두면 spec 들이 ENOENT 로 cascade fail.
    // 사용자 환경에서 7건 fail 대신 13건 skip 으로 명확하게.
    ...(hasE2ESecret
      ? [
          {
            name: 'authenticated',
            testMatch: /authenticated\/.*\.spec\.ts$/,
            use: {
              ...devices['Desktop Chrome'],
              storageState: STORAGE_STATE,
            },
          },
        ]
      : []),
  ],

  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      // 자식 프로세스에 mock AI 옵션 전파 (있을 때만)
      ...(process.env.PLAYWRIGHT_MOCK_AI ? { PLAYWRIGHT_MOCK_AI: process.env.PLAYWRIGHT_MOCK_AI } : {}),
      ...(process.env.E2E_SECRET ? { E2E_SECRET: process.env.E2E_SECRET } : {}),
      // NextAuth v5 — host 검증 우회 (production build + 3100 포트 + .env 의 NEXTAUTH_URL=3000 mismatch).
      // 또한 AUTH_URL 을 명시해서 NextAuth 가 callback URL 을 3100 으로 생성.
      AUTH_TRUST_HOST: 'true',
      AUTH_URL: BASE_URL,
      NEXTAUTH_URL: BASE_URL,
    },
  },
})
