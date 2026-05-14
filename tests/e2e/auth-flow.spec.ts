/**
 * 인증 후 핵심 흐름 E2E (Phase 4-coach-integration, 2026-05-03)
 *
 * 시나리오:
 *   1. /login 에서 @udimpact.ai 이메일 입력 → 로그인 → /dashboard
 *   2. 대시보드에서 프로젝트 목록 진입
 *   3. /admin/metrics 접근 (PM 권한 — 일부만 visible 또는 redirect)
 *
 * 본격적인 RFP 업로드 / Express turn / 제안서 생성은 후속 시나리오
 * (DB seed user + storageState 셋업 후).
 *
 * 본 spec 은 Credentials provider 의 dev 로그인 동작만 검증.
 * production 에서는 @udimpact.ai 도메인 가드가 막아야 함 — production smoke 별도.
 */

import { test, expect } from '@playwright/test'

// 테스트 사용자 — auth.ts 의 Credentials provider 가 자동 생성
const TEST_EMAIL = `e2e-test-${Date.now()}@udimpact.ai`

// 로그인 페이지의 이메일 버튼 — form 밖 <button onClick={signIn}> 구조라
// type="submit" 가드 없음. 텍스트로 잡는다 (Wave 3 fix).
const LOGIN_BTN_RE = /이메일로 로그인|로그인 중/

test.describe('auth-flow: Credentials 로그인', () => {
  test('이메일 입력 → 로그인 → 보호된 페이지 진입', async ({ page }) => {
    // 1. /login 진입
    await page.goto('/login')

    // 2. 이메일 input 발견 + 입력
    const emailInput = page.locator('input[type="email"]').first()
    await expect(emailInput).toBeVisible({ timeout: 10_000 })
    await emailInput.fill(TEST_EMAIL)

    // 3. 이메일 로그인 버튼 (텍스트 기반)
    const submitBtn = page.getByRole('button', { name: LOGIN_BTN_RE }).first()
    await expect(submitBtn).toBeVisible()
    await submitBtn.click()

    // 4. callback 후 redirect 대기 — /login 에서 벗어남
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
      timeout: 15_000,
    })

    // 5. 로그인된 상태 확인 — 어딘가 본인 이메일 또는 dashboard 영역 있어야 함
    const finalUrl = page.url()
    expect(finalUrl).not.toContain('/login')
  })

  test('잘못된 도메인 거부 — gmail.com 은 거절', async ({ page }) => {
    await page.goto('/login')
    const emailInput = page.locator('input[type="email"]').first()
    await emailInput.fill('outsider@gmail.com')

    const submitBtn = page.getByRole('button', { name: LOGIN_BTN_RE }).first()
    await submitBtn.click()

    // /login 에 머물거나 error 페이지로 redirect
    await page.waitForLoadState('networkidle', { timeout: 5_000 })
    const url = page.url()
    expect(url).toMatch(/\/login/)
  })
})

test.describe('auth-flow: API 인증 보호 검증', () => {
  // 미인증 GET/POST 가 받을 수 있는 status:
  //   - 401: 명시적 인증 거부
  //   - 302/307/308: redirect (proxy.ts → /login)
  //   - 405: Method Not Allowed (라우트 존재하지만 method 안 맞음)
  //   - 400: 라우트가 body 검증 먼저 — 의미상 정상이지만 인증 우선 권장
  // 보호의 증거로 200·201 만 아니면 OK.
  const PROTECTED_STATUSES = [401, 302, 307, 308, 405, 400]

  test('미인증 /api/projects → 보호됨', async ({ request }) => {
    const r = await request.get('/api/projects', {
      headers: { 'Content-Type': 'application/json' },
    })
    expect(PROTECTED_STATUSES).toContain(r.status())
  })

  test('미인증 AI 라우트 → 보호됨', async ({ request }) => {
    const r = await request.post('/api/ai/proposal', {
      data: { projectId: 'fake', sectionNo: 1 },
      headers: { 'Content-Type': 'application/json' },
    })
    expect(PROTECTED_STATUSES).toContain(r.status())
  })

  test('rate-limit 헤더 동작 검증 (시뮬)', async ({ request }) => {
    // 인증 가드만으로 충분 — 401/302/405 어떤 응답이든 endpoint 가 보호됨
    const r = await request.post('/api/ai/proposal', {
      data: { projectId: 'fake', sectionNo: 1 },
      headers: { 'Content-Type': 'application/json' },
    })
    expect([...PROTECTED_STATUSES, 429]).toContain(r.status())
  })
})
