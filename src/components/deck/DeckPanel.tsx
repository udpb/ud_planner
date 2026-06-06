'use client'
/**
 * DeckPanel — 덱 생성 · 미리보기 · PDF 다운로드 (DECK-3b-2, ADR-025 Phase 3b)
 *
 * "덱 생성" → POST /api/projects/[id]/deck (grounding→author) → DeckSpec 보관(미영속 — 브리프 §3)
 *  → deckSpecToElements 로 **클라이언트 미리보기**(chromium 불필요).
 * "PDF 다운로드" → POST /api/projects/[id]/deck/pdf {deckSpec} → 워커 렌더 PDF blob 다운로드.
 *
 * 디자인: ud-design-system 준수 (Card·Button·sonner·lucide, Action Orange 절제).
 */

import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Sparkles, Download, Loader2, Presentation } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { deckSpecToElements } from '@/lib/deck/render-spec'
import type { DeckSpec } from '@/lib/deck/spec'
import { DeckSlidePreview } from './DeckSlidePreview'

export function DeckPanel({
  projectId,
  projectName,
  hasRfp,
}: {
  projectId: string
  projectName?: string
  /** RFP 파싱 여부 — 없으면 생성 비활성(서버도 400). */
  hasRfp: boolean
}) {
  const [deckSpec, setDeckSpec] = useState<DeckSpec | null>(null)
  const [generating, setGenerating] = useState(false)
  const [downloading, setDownloading] = useState(false)

  // DeckSpec → React 엘리먼트 (미리보기). 잘못된 spec 은 throw → 빈 배열로 degrade.
  const elements = useMemo(() => {
    if (!deckSpec) return []
    try {
      return deckSpecToElements(deckSpec)
    } catch (e) {
      console.error('[DeckPanel] deckSpecToElements 실패:', e)
      return []
    }
  }, [deckSpec])

  async function generate() {
    setGenerating(true)
    const t = toast.loading('덱 생성 중 — grounding → 스토리라인 → 슬라이드 저작 (1~3분 소요)...')
    try {
      const res = await fetch(`/api/projects/${projectId}/deck`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `생성 실패 (${res.status})`)
      setDeckSpec(data.deckSpec as DeckSpec)
      toast.success(`덱 생성 완료 — ${data.deckSpec?.slides?.length ?? 0}장`, { id: t })
    } catch (e) {
      toast.error(`덱 생성 실패 — ${e instanceof Error ? e.message : String(e)}`, { id: t })
    } finally {
      setGenerating(false)
    }
  }

  async function downloadPdf() {
    if (!deckSpec) return
    setDownloading(true)
    const t = toast.loading('PDF 렌더 중 (렌더 워커)...')
    try {
      const res = await fetch(`/api/projects/${projectId}/deck/pdf`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deckSpec, filename: projectName ?? 'deck' }),
      })
      if (!res.ok) {
        // 실패 시 JSON({error}) 반환.
        let msg = `렌더 실패 (${res.status})`
        try {
          const err = await res.json()
          if (err?.error) msg = err.error
        } catch {
          /* non-json */
        }
        throw new Error(msg)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(projectName ?? 'deck').replace(/[^\w가-힣\-]+/g, '_').slice(0, 80)}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success('PDF 다운로드 완료', { id: t })
    } catch (e) {
      toast.error(`PDF 다운로드 실패 — ${e instanceof Error ? e.message : String(e)}`, { id: t })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Presentation className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">제안 덱 (HTML→PDF)</h2>
              <p className="text-xs text-muted-foreground">
                RFP grounding → 덱-우선 저작 → 고해상 PDF (ADR-025)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={generate}
              disabled={generating || !hasRfp}
              aria-label="덱 생성"
              title={hasRfp ? '덱 생성' : 'RFP 분석을 먼저 완료하세요'}
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              덱 생성
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={downloadPdf}
              disabled={downloading || !deckSpec}
              aria-label="PDF 다운로드"
              title={deckSpec ? 'PDF 다운로드' : '먼저 덱을 생성하세요'}
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              PDF 다운로드
            </Button>
          </div>
        </div>

        {!hasRfp && (
          <p className="text-sm text-muted-foreground">
            RFP 분석이 완료되어야 덱을 생성할 수 있습니다.
          </p>
        )}

        {deckSpec && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              미리보기 — {elements.length}장 (브라우저 직접 렌더, 인쇄용 고해상은 PDF 다운로드)
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {elements.map((el, i) => (
                <DeckSlidePreview key={i} element={el} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
