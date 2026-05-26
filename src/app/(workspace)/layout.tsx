/**
 * (workspace) — UX v2 의 fullscreen route group.
 *
 * (dashboard) layout 과는 별개. 사이드바 / 헤더 wrapper 없이 v2 가 화면 전체를 사용.
 * Auth + Providers 만 적용.
 */

import { Providers } from '@/components/providers'

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>
}
