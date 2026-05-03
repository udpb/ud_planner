/**
 * Playwright E2E 설정 (Phase 3.4, 2026-05-03)
 *
 * 시나리오 범위 (smoke):
 *   - 미인증 / → /login redirect
 *   - /login 페이지 로드 + 이메일 입력 가능
 *   - /admin/metrics 미인증 시 /login redirect
 *
 * 실행:
 *   npm run e2e            — webServer 자동 시작 후 chromium 으로 실행
 *   npm run e2e:headed     — 브라우저 visible
 *   npx playwright install chromium  — 처음에 한 번 (CI 에서도)
 *
 * CI: .github/workflows/e2e.yml (별도 추가 가능)
 */

import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT ?? 3100)
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // 인증 상태가 갈리면 병렬 위험 — 단순 시작은 직렬
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // 로컬·CI 모두 — 자동으로 Next.js production server 시작
  // build 는 별도 (npm run build 먼저), 본 webServer 는 npm start 만.
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
