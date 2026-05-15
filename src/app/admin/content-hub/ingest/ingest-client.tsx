'use client'

/**
 * IngestClient — URL 자동 수집 UI (Wave N2, 2026-05-15)
 *
 * 좌측: URL 입력 + 추출 버튼 (단건 모드)
 * 우측: 결과 미리보기 (편집 가능한 1줄 폼) + 저장 버튼
 * 하단 탭: sitemap 일괄 (limit · include/exclude regex · auto-save)
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Sparkles, FileSpreadsheet, ExternalLink } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface AssetProposal {
  name: string
  category: string
  evidenceType: string
  applicableSections: string[]
  valueChainStage: string
  narrativeSnippet: string
  keyNumbers: string[]
  keywords: string[]
}

interface SinglePageResult {
  proposal: AssetProposal
  page: { url: string; title: string; truncated: boolean }
  savedId?: string
}

interface BulkResultRow {
  url: string
  status: 'saved' | 'proposal' | 'skipped' | 'error'
  reason?: string
  assetName?: string
  savedId?: string
}

export function IngestClient() {
  const router = useRouter()
  const [singleUrl, setSingleUrl] = useState('')
  const [singleHint, setSingleHint] = useState('')
  const [singleLoading, setSingleLoading] = useState(false)
  const [singleResult, setSingleResult] = useState<SinglePageResult | null>(null)
  const [editable, setEditable] = useState<AssetProposal | null>(null)
  const [saving, setSaving] = useState(false)

  // bulk
  const [sitemap, setSitemap] = useState('')
  const [bulkLimit, setBulkLimit] = useState(20)
  const [include, setInclude] = useState('')
  const [exclude, setExclude] = useState('')
  const [bulkHint, setBulkHint] = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkResults, setBulkResults] = useState<BulkResultRow[] | null>(null)
  const [bulkSummary, setBulkSummary] = useState<{
    saved: number
    proposed: number
    skipped: number
    errors: number
  } | null>(null)

  const handleSingleExtract = async () => {
    if (!singleUrl.trim()) {
      toast.error('URL 을 입력해주세요')
      return
    }
    setSingleLoading(true)
    setSingleResult(null)
    setEditable(null)
    try {
      const r = await fetch('/api/admin/ingest-web', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: singleUrl.trim(),
          hint: singleHint.trim() || undefined,
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'unknown')
      if (data.skipped) {
        toast.warning(`자산화 부적절: ${data.reason}`)
        return
      }
      setSingleResult(data)
      setEditable(data.proposal)
      toast.success('자산 후보 추출 완료 — 확인 후 저장')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('추출 실패: ' + msg.slice(0, 120))
    } finally {
      setSingleLoading(false)
    }
  }

  const handleSave = async () => {
    if (!editable || !singleResult) return
    setSaving(true)
    try {
      const r = await fetch('/api/admin/ingest-web', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: singleResult.page.url,
          hint: singleHint.trim() || undefined,
          autoSave: true,
          initialStatus: 'stable',
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'unknown')
      toast.success(`저장 완료 — ID: ${data.savedId}`)
      router.push(`/admin/content-hub/${data.savedId}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('저장 실패: ' + msg.slice(0, 120))
    } finally {
      setSaving(false)
    }
  }

  const handleBulkRun = async () => {
    if (!sitemap.trim()) {
      toast.error('sitemap.xml URL 을 입력해주세요')
      return
    }
    setBulkLoading(true)
    setBulkResults(null)
    setBulkSummary(null)
    try {
      const includePatterns = include.trim() ? [include.trim()] : undefined
      const excludePatterns = exclude.trim() ? [exclude.trim()] : undefined
      const r = await fetch('/api/admin/ingest-sitemap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sitemapUrl: sitemap.trim(),
          limit: bulkLimit,
          autoSave: true, // bulk 모드는 무조건 저장 (status=developing)
          hint: bulkHint.trim() || undefined,
          includePatterns,
          excludePatterns,
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'unknown')
      setBulkResults(data.results)
      setBulkSummary({
        saved: data.saved,
        proposed: data.proposed,
        skipped: data.skipped,
        errors: data.errors,
      })
      toast.success(
        `Bulk 완료 — saved ${data.saved} · skipped ${data.skipped} · errors ${data.errors}`,
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('Bulk 실패: ' + msg.slice(0, 120))
    } finally {
      setBulkLoading(false)
    }
  }

  return (
    <div className="mt-4">
      <Tabs defaultValue="single">
        <TabsList>
          <TabsTrigger value="single" className="gap-1">
            <Sparkles className="h-3.5 w-3.5" />
            단건 URL
          </TabsTrigger>
          <TabsTrigger value="bulk" className="gap-1">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            sitemap 일괄
          </TabsTrigger>
        </TabsList>

        {/* ── 단건 모드 ──────────────────────────── */}
        <TabsContent value="single" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">1. URL 입력</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="single-url" className="text-xs">
                  자산화할 페이지 URL
                </Label>
                <Input
                  id="single-url"
                  value={singleUrl}
                  onChange={(e) => setSingleUrl(e.target.value)}
                  placeholder="https://underdogs.global/ko/case/..."
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="single-hint" className="text-xs">
                  추가 컨텍스트 (선택)
                </Label>
                <Input
                  id="single-hint"
                  value={singleHint}
                  onChange={(e) => setSingleHint(e.target.value)}
                  placeholder="예: 이 페이지는 알럼나이 케이스 스터디 컬렉션"
                  className="mt-1"
                />
              </div>
              <Button
                onClick={handleSingleExtract}
                disabled={singleLoading || !singleUrl.trim()}
                className="gap-1"
              >
                {singleLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {singleLoading ? 'AI 분석 중...' : 'AI 로 자산 후보 추출'}
              </Button>
            </CardContent>
          </Card>

          {editable && singleResult && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>2. 자산 후보 미리보기</span>
                  <a
                    href={singleResult.page.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-primary"
                  >
                    원본 페이지 <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">이름</Label>
                  <Input
                    value={editable.name}
                    onChange={(e) => setEditable({ ...editable, name: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Badge variant="outline" className="justify-center">
                    {editable.category}
                  </Badge>
                  <Badge variant="outline" className="justify-center">
                    {editable.evidenceType}
                  </Badge>
                  <Badge variant="outline" className="justify-center">
                    {editable.valueChainStage}
                  </Badge>
                </div>
                <div>
                  <Label className="text-xs">narrativeSnippet (제안서 본문 인용)</Label>
                  <Textarea
                    value={editable.narrativeSnippet}
                    onChange={(e) =>
                      setEditable({ ...editable, narrativeSnippet: e.target.value })
                    }
                    rows={3}
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">applicable sections</Label>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {editable.applicableSections.map((s) => (
                        <Badge key={s} variant="secondary" className="text-[10px]">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">key numbers</Label>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {editable.keyNumbers.map((n, i) => (
                        <Badge key={i} variant="outline" className="text-[10px]">
                          {n}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">keywords ({editable.keywords.length})</Label>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {editable.keywords.map((k, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">
                        {k}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="gap-1"
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {saving ? '저장 중...' : '✓ 자산으로 저장 (stable)'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSingleResult(null)
                      setEditable(null)
                    }}
                  >
                    취소
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  ⓘ 세부 필드 (programProfileFit, parentId 등) 추가 편집은 저장 후
                  /admin/content-hub/[id] 페이지에서 가능합니다.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── 일괄 모드 ──────────────────────────── */}
        <TabsContent value="bulk" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">sitemap.xml 일괄 처리</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="sitemap" className="text-xs">
                  sitemap.xml URL
                </Label>
                <Input
                  id="sitemap"
                  value={sitemap}
                  onChange={(e) => setSitemap(e.target.value)}
                  placeholder="https://underdogs.global/sitemap.xml"
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="bulk-limit" className="text-xs">
                    최대 처리 수 (max 100)
                  </Label>
                  <Input
                    id="bulk-limit"
                    type="number"
                    min={1}
                    max={100}
                    value={bulkLimit}
                    onChange={(e) => setBulkLimit(Number(e.target.value) || 20)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="bulk-hint" className="text-xs">
                    공통 컨텍스트
                  </Label>
                  <Input
                    id="bulk-hint"
                    value={bulkHint}
                    onChange={(e) => setBulkHint(e.target.value)}
                    placeholder="예: underdogs.global 임팩트 컬렉션"
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="include" className="text-xs">
                    포함 패턴 (정규식)
                  </Label>
                  <Input
                    id="include"
                    value={include}
                    onChange={(e) => setInclude(e.target.value)}
                    placeholder="/case|/impact|/program"
                    className="mt-1 font-mono text-xs"
                  />
                </div>
                <div>
                  <Label htmlFor="exclude" className="text-xs">
                    제외 패턴 (정규식)
                  </Label>
                  <Input
                    id="exclude"
                    value={exclude}
                    onChange={(e) => setExclude(e.target.value)}
                    placeholder="/login|/admin"
                    className="mt-1 font-mono text-xs"
                  />
                </div>
              </div>
              <div className="rounded-md border border-amber-200 bg-amber-50/50 p-2 text-[11px] text-amber-900">
                <strong>주의:</strong> 일괄 모드는 모든 url 을{' '}
                <code>status=developing</code> 으로 저장. 저장 후
                /admin/content-hub 에서 검토 후 stable 로 승격.
              </div>
              <Button onClick={handleBulkRun} disabled={bulkLoading || !sitemap.trim()}>
                {bulkLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                {bulkLoading ? 'Bulk 진행 중... (시간 소요)' : '🚀 일괄 실행 (auto-save)'}
              </Button>
            </CardContent>
          </Card>

          {bulkSummary && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">결과 요약</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-3 flex gap-4 text-xs">
                  <span className="text-green-700">✓ saved {bulkSummary.saved}</span>
                  <span className="text-muted-foreground">
                    ⊘ skipped {bulkSummary.skipped}
                  </span>
                  <span className="text-red-600">
                    ✗ errors {bulkSummary.errors}
                  </span>
                </div>
                <div className="max-h-80 overflow-y-auto rounded-md border">
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-muted/40">
                      <tr>
                        <th className="px-2 py-1 text-left">URL</th>
                        <th className="px-2 py-1 text-left">상태</th>
                        <th className="px-2 py-1 text-left">자산명/이유</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkResults?.map((r, i) => (
                        <tr key={i} className="border-t hover:bg-muted/20">
                          <td className="px-2 py-1">
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="truncate text-muted-foreground hover:text-primary"
                              title={r.url}
                            >
                              {r.url.length > 50 ? r.url.slice(0, 50) + '…' : r.url}
                            </a>
                          </td>
                          <td className="px-2 py-1">
                            {r.status === 'saved' && (
                              <span className="text-green-700">✓</span>
                            )}
                            {r.status === 'skipped' && (
                              <span className="text-muted-foreground">⊘</span>
                            )}
                            {r.status === 'error' && (
                              <span className="text-red-600">✗</span>
                            )}
                            {r.status === 'proposal' && (
                              <span className="text-amber-700">▶</span>
                            )}
                          </td>
                          <td className="px-2 py-1">
                            {r.savedId ? (
                              <a
                                href={`/admin/content-hub/${r.savedId}`}
                                className="text-primary hover:underline"
                              >
                                {r.assetName}
                              </a>
                            ) : (
                              <span className="text-muted-foreground">
                                {r.assetName ?? r.reason}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
