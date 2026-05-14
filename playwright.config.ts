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

const PORT = Number(process.env.E2E_PORT ?? 3100)
const BASE_URL = `http://localhost:${PORT}`
const STORAGE_STATE = 'playwright/.auth/user.json'

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
  globalSetup: process.env.E2E_SECRET ? './tests/e2e/_fixtures/global-setup.ts' : undefined,

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
    {
      name: 'authenticated',
      testMatch: /authenticated\/.*\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: STORAGE_STATE,
      },
    },
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
