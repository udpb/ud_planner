/**
 * Smoke E2E (Phase 3.4, 2026-05-03)
 *
 * 가장 기본적인 시스템 검증:
 *   - 미인증 사용자가 보호된 페이지 접근 시 /login 으로 redirect
 *   - /login 페이지 로드 + 이메일 입력 form visible
 *   - 정적 자원 (favicon 등) 200 응답
 *
 * 본격 시나리오 (Express 1차본 생성, RFP 업로드, 제안서 생성 등) 는 후속 추가.
 */

import { test, expect } from '@playwright/test'

test.describe('smoke: 미인증 라우팅', () => {
  test('루트(/) 접근 → /login 으로 redirect', async ({ page }) => {
    const response = await page.goto('/', { waitUntil: 'domcontentloaded' })
    // 최종 URL 이 /login 이어야 함 (middleware redirect)
    await expect(page).toHaveURL(/\/login/)
    expect(response?.status()).toBeLessThan(500)
  })

  test('/admin/metrics 접근 → /login 으로 redirect', async ({ page }) => {
    await page.goto('/admin/metrics', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/login/)
  })

  test('/projects 접근 → /login 으로 redirect', async ({ page }) => {
    await page.goto('/projects', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('smoke: /login 페이지', () => {
  test('이메일 입력 폼이 보이고 입력 가능', async ({ page }) => {
    await page.goto('/login')
    // 이메일 type="email" input 존재 (NextAuth Credentials provider)
    const emailInput = page.locator('input[type="email"]').first()
    await expect(emailInput).toBeVisible()
    await emailInput.fill('test@udimpact.ai')
    await expect(emailInput).toHaveValue('test@udimpact.ai')
  })

  test('페이지가 200 응답 + 의미 있는 콘텐츠', async ({ page }) => {
    const response = await page.goto('/login')
    expect(response?.status()).toBe(200)
    // 페이지에 어떤 텍스트라도 렌더링되었는지 (빈 화면 방지)
    const bodyText = await page.locator('body').textContent()
    expect(bodyText?.length ?? 0).toBeGreaterThan(50)
  })
})

test.describe('smoke: API 미인증 보호', () => {
  test('/api/projects 미인증 호출 시 보호됨', async ({ request }) => {
    // maxRedirects=0 — playwright 가 자동 follow 하면 최종 status 200 으로 보임.
    // 우리는 첫 응답의 status (302/307 redirect 또는 401) 를 직접 보고 싶음.
    // 진짜 보호 증거만 인정: 401 또는 redirect (302/307/308).
    const r = await request.get('/api/projects', { maxRedirects: 0 })
    expect([401, 302, 307, 308]).toContain(r.status())
  })
})
