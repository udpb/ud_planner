'use client'

/**
 * BookmarkletClient — 동적으로 자신의 origin 을 박은 javascript: URL 생성.
 *
 * 자체 host (production 또는 dev) 의 /admin/content-hub/ingest?prefill=<url>
 * 로 새 탭 열기.
 */

import { useEffect, useState } from 'react'

export function BookmarkletClient() {
  const [origin, setOrigin] = useState('')

  useEffect(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin)
  }, [])

  if (!origin) return <div className="text-xs text-muted-foreground">로딩 중...</div>

  // javascript: 한 줄 — encodeURIComponent 로 현재 페이지 URL 직렬화
  const code = `javascript:(function(){var u=encodeURIComponent(location.href);var t=encodeURIComponent(document.title||'');window.open('${origin}/admin/content-hub/ingest?prefill='+u+'&title='+t,'_blank');})();`

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        아래 링크를 브라우저 북마크바로 끌어놓으세요:
      </p>
      <a
        href={code}
        className="inline-block rounded-md border-2 border-dashed border-primary/60 bg-primary/5 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10"
        onClick={(e) => e.preventDefault()}
      >
        ★ UD 자산 수집
      </a>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          ▶ 원본 코드 보기 (수동 복사용)
        </summary>
        <pre className="mt-2 overflow-x-auto rounded-md border bg-muted/30 p-2 text-[10px]">
          {code}
        </pre>
      </details>
    </div>
  )
}
