/**
 * /admin/bookmarklet — Wave N5 (2026-05-15)
 *
 * 브라우저 북마크바에 끌어놓아 한 클릭으로 현재 페이지를 자산화하는
 * javascript: URL 생성 페이지.
 *
 * 동작: 클릭 → 현재 페이지 URL 추출 → 새 탭으로 /admin/content-hub/ingest?prefill=<url>
 *       열어 단건 ingest 폼이 자동으로 추출 실행.
 *
 * 운영: 슬기님 / 다른 담당자가 자료 서핑 중 발견한 페이지를 별도 작업 없이
 *       바로 자산 후보로 큐잉.
 */

import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BookMarked } from 'lucide-react'
import { BookmarkletClient } from './bookmarklet-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Bookmarklet | Content Hub' }

export default function BookmarkletPage() {
  return (
    <div className="flex flex-col overflow-hidden">
      <Header title="브라우저 북마크릿" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <BookMarked className="h-4 w-4 text-primary" />한 클릭 자산
                수집 북마크릿
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <BookmarkletClient />
              <div className="rounded-md border bg-muted/20 p-3 text-xs">
                <p className="font-medium">설치 방법</p>
                <ol className="ml-4 mt-1 list-decimal space-y-0.5 text-muted-foreground">
                  <li>위 &ldquo;UD 자산 수집&rdquo; 링크를 브라우저 북마크바로 드래그</li>
                  <li>또는 우클릭 → &ldquo;북마크에 추가&rdquo;</li>
                  <li>
                    자료 서핑 중 자산화하고 싶은 페이지에서 클릭 →
                    /admin/content-hub/ingest 가 새 탭으로 열림 + 자동 추출 실행
                  </li>
                </ol>
              </div>
              <p className="text-xs text-muted-foreground">
                ⓘ Chrome / Safari / Firefox 모두 지원. 모바일 브라우저는
                북마크릿 클릭이 제한적이라 권장하지 않음.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
