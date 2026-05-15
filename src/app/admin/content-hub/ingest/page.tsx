/**
 * /admin/content-hub/ingest — Wave N2 (2026-05-15)
 *
 * URL 한 줄 입력 → AI 자동 추출 → 자산 후보 미리보기 → 저장 (또는 폼 수정).
 * sitemap 일괄 처리도 같은 화면 하단에 탭으로 제공.
 *
 * 흐름:
 *   1. PM/담당자가 URL 붙여넣기 → "추출" 버튼
 *   2. /api/admin/ingest-web 호출 → AssetProposal JSON 응답
 *   3. 결과 미리보기 (이름·category·snippet·keyNumbers·keywords)
 *   4. 한 번 더 확인하고 "저장" → ContentAsset.create (status=stable)
 *
 * 추후: 결과를 AssetForm 에 prefill 로 넘겨 PM 이 수정 가능하게 (Wave N5 로 미룸)
 */

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { IngestClient } from './ingest-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: '자산 자동 수집 | Content Hub' }

export default function IngestPage() {
  return (
    <div className="flex flex-col overflow-hidden">
      <Header title="자산 자동 수집 (Web Ingester)" />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 pt-4 pb-12">
          <Link
            href="/admin/content-hub"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            목록으로
          </Link>
          <IngestClient />
        </div>
      </div>
    </div>
  )
}
