/**
 * Playwright global setup (Phase 4-coach-integration, 2026-05-03)
 *
 * 모든 spec 실행 전 1회:
 *   1. dev seed endpoint 호출 → fresh test user + project 생성
 *   2. Credentials provider 로 로그인 → storageState 저장 (`playwright/.auth/user.json`)
 *   3. spec 들이 storageState 재사용 → 매번 로그인 안 해도 됨
 *
 * 환경변수:
 *   E2E_SECRET           — seed endpoint 인증용 (Vercel Production env 미설정 권장)
 *   PLAYWRIGHT_MOCK_AI   — 'true' 권장 (실제 AI 호출 비용 절약)
 */

import { chromium, type FullConfig } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const STORAGE_PATH = 'playwright/.auth/user.json'
const E2E_USER_EMAIL = 'e2e-test@udimpact.ai'

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? `http://localhost:${process.env.E2E_PORT ?? 3100}`
  const e2eSecret = process.env.E2E_SECRET

  if (!e2eSecret) {
    console.warn(
      '[e2e global-setup] ⚠️ E2E_SECRET 미설정 — seed endpoint 호출 skip. ' +
        'auth-flow.spec 만 실행 가능 (인증 흐름 검증).',
    )
    return
  }

  // 1. seed endpoint 호출
  let projectId: string
  try {
    const r = await fetch(`${baseURL}/api/dev/seed-e2e`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-e2e-secret': e2eSecret,
      },
      body: JSON.stringify({ userEmail: E2E_USER_EMAIL, reset: true }),
    })
    if (!r.ok) {
      throw new Error(`seed endpoint ${r.status}: ${await r.text()}`)
    }
    const data = (await r.json()) as { userId: string; projectId: string }
    projectId = data.projectId
    console.log(`[e2e global-setup] ✓ seed OK — projectId=${projectId}`)

    // spec 에서 사용할 수 있도록 projectId 환경변수로 export
    process.env.E2E_PROJECT_ID = projectId
  } catch (err) {
    console.error('[e2e global-setup] seed 실패:', err)
    throw err
  }

  // 2. 로그인 → storageState 저장
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    await page.goto(`${baseURL}/login`)
    const emailInput = page.locator('input[type="email"]').first()
    await emailInput.waitFor({ timeout: 15_000 })
    await emailInput.fill(E2E_USER_EMAIL)

    const submitBtn = page.locator('button[type="submit"]').first()
    await submitBtn.click()

    // login → callback → 보호 페이지 redirect 대기
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
      timeout: 20_000,
    })
    console.log(`[e2e global-setup] ✓ 로그인 OK — ${page.url()}`)

    // 3. storageState 저장 (auth.json)
    mkdirSync(dirname(STORAGE_PATH), { recursive: true })
    await context.storageState({ path: STORAGE_PATH })
    console.log(`[e2e global-setup] ✓ storageState 저장 — ${STORAGE_PATH}`)
  } finally {
    await browser.close()
  }
}

export { STORAGE_PATH, E2E_USER_EMAIL }
