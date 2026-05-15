/**
 * Login Page — Server component wrapper.
 *
 * Google OAuth 버튼은 AUTH_GOOGLE_ID 환경변수 있을 때만 표시.
 * 미설정 시 클릭 시 invalid_client 에러 페이지로 가니 처음부터 숨김 (Wave 5 fix).
 */

import { Suspense } from 'react'
import { LoginForm } from './login-form'

export default function LoginPage() {
  const hasGoogle = !!process.env.AUTH_GOOGLE_ID
  return (
    <Suspense>
      <LoginForm hasGoogle={hasGoogle} />
    </Suspense>
  )
}
