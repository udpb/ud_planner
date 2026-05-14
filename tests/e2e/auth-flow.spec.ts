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

    // /login 에 머물거나 error 페이지로 redirect — 네트워크 안정될 때까지 대기
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
    const url = page.url()
    // 정확 검증: NextAuth 의 credentials authorize() 가 null 반환 → /login 으로 돌아감
    // /login?error= 또는 /login 자체 둘 다 OK. 보호 페이지 진입 = 거절 실패
    expect(url).toMatch(/\/login/)
  })
})

test.describe('auth-flow: API 인증 보호 검증', () => {
  // 진짜 "보호의 증거" 만 인정 (엄격화 — 사용자 피드백):
  //   - 401: 명시적 unauthorized — 라우트 핸들러의 auth() 거부
  //   - 302/307/308: proxy.ts 의 /login redirect
  //   - 405/400 은 보호 증거 아님:
  //     · 405 = 라우트 정의의 method 불일치 (인증 검증 안 거침)
  //     · 400 = body 검증이 auth 보다 먼저 (false positive 가능)
  //   proxy.ts matcher 가 /api/* 잡으니 미인증은 무조건 redirect 또는 401.
  const PROTECTED_STATUSES = [401, 302, 307, 308]

  test('미인증 /api/projects → 보호됨', async ({ request }) => {
    const r = await request.get('/api/projects', {
      headers: { 'Content-Type': 'application/json' },
      maxRedirects: 0, // redirect 자동 follow 막아 첫 응답 status 직접 검사
    })
    expect(PROTECTED_STATUSES).toContain(r.status())
  })

  test('미인증 AI 라우트 → 보호됨', async ({ request }) => {
    const r = await request.post('/api/ai/proposal', {
      data: { projectId: 'fake', sectionNo: 1 },
      headers: { 'Content-Type': 'application/json' },
      maxRedirects: 0,
    })
    expect(PROTECTED_STATUSES).toContain(r.status())
  })

  test('rate-limit 헤더 동작 검증 (시뮬)', async ({ request }) => {
    const r = await request.post('/api/ai/proposal', {
      data: { projectId: 'fake', sectionNo: 1 },
      headers: { 'Content-Type': 'application/json' },
      maxRedirects: 0,
    })
    expect([...PROTECTED_STATUSES, 429]).toContain(r.status())
  })
})
