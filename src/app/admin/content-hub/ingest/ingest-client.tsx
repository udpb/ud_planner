'use client'

/**
 * IngestClient — URL 자동 수집 UI (Wave N2, 2026-05-15)
 *
 * 좌측: URL 입력 + 추출 버튼 (단건 모드)
 * 우측: 결과 미리보기 (편집 가능한 1줄 폼) + 저장 버튼
 * 하단 탭: sitemap 일괄 (limit · include/exclude regex · auto-save)
 */

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  Loader2,
  Sparkles,
  FileSpreadsheet,
  ExternalLink,
  Upload,
  FileText,
} from 'lucide-react'

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
  const searchParams = useSearchParams()
  const [singleUrl, setSingleUrl] = useState('')
  const [singleHint, setSingleHint] = useState('')
  const [singleLoading, setSingleLoading] = useState(false)
  const [singleResult, setSingleResult] = useState<SinglePageResult | null>(null)
  const [editable, setEditable] = useState<AssetProposal | null>(null)
  const [saving, setSaving] = useState(false)

  // file ingest (Wave N3)
  const [file, setFile] = useState<File | null>(null)
  const [fileHint, setFileHint] = useState('')
  const [fileWasWon, setFileWasWon] = useState(false)
  const [filePerSlide, setFilePerSlide] = useState(false)
  const [fileSingleOnly, setFileSingleOnly] = useState(false)
  const [fileAutoSave, setFileAutoSave] = useState(true)
  const [fileLoading, setFileLoading] = useState(false)
  const [fileResult, setFileResult] = useState<{
    proposalCount: number
    savedIds: string[]
    proposals: AssetProposal[]
    file: { name: string }
    truncated: boolean
  } | null>(null)

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

  // Wave N5 — bookmarklet prefill 자동 실행
  useEffect(() => {
    const prefillUrl = searchParams.get('prefill')
    const prefillTitle = searchParams.get('title')
    if (prefillUrl && !singleUrl) {
      setSingleUrl(prefillUrl)
      if (prefillTitle) setSingleHint(`페이지 제목: ${prefillTitle}`)
      // 자동 추출 트리거 — 한 박자 늦춰서 state 반영 후
      setTimeout(() => {
        // 직접 fetch 호출 (state 의존성 회피)
        void runSingleExtract(prefillUrl, prefillTitle ? `페이지 제목: ${prefillTitle}` : '')
      }, 100)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const runSingleExtract = async (url: string, hint: string) => {
    setSingleLoading(true)
    setSingleResult(null)
    setEditable(null)
    try {
      const r = await fetch('/api/admin/ingest-web', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          hint: hint.trim() || undefined,
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

  const handleSingleExtract = async () => {
    if (!singleUrl.trim()) {
      toast.error('URL 을 입력해주세요')
      return
    }
    await runSingleExtract(singleUrl, singleHint)
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

  const handleFileUpload = async () => {
    if (!file) {
      toast.error('파일을 선택해주세요')
      return
    }
    setFileLoading(true)
    setFileResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      if (fileHint.trim()) form.append('hint', fileHint.trim())
      if (fileWasWon) form.append('wasWon', 'true')
      if (filePerSlide) form.append('perSlide', 'true')
      if (fileSingleOnly) form.append('singleOnly', 'true')
      if (fileAutoSave) form.append('autoSave', 'true')

      const r = await fetch('/api/admin/ingest-file', {
        method: 'POST',
        body: form,
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'unknown')
      if (data.skipped) {
        toast.warning(`스킵: ${data.reason}`)
        return
      }
      setFileResult(data)
      toast.success(
        `${data.proposalCount}개 자산 후보 추출 완료${
          data.savedIds.length > 0 ? ` — ${data.savedIds.length}개 저장됨` : ''
        }`,
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('파일 처리 실패: ' + msg.slice(0, 120))
    } finally {
      setFileLoading(false)
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
          <TabsTrigger value="file" className="gap-1">
            <Upload className="h-3.5 w-3.5" />
            파일 (PDF/PPT)
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

        {/* ── 파일 업로드 모드 ──────────────────────────── */}
        <TabsContent value="file" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">PDF · PPTX · DOCX · XLSX 업로드</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="file" className="text-xs">
                  파일 선택 (최대 20MB)
                </Label>
                <Input
                  id="file"
                  type="file"
                  accept=".pdf,.pptx,.docx,.xlsx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="mt-1 cursor-pointer"
                />
                {file && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    <FileText className="-mt-0.5 mr-0.5 inline h-2.5 w-2.5" />
                    {file.name} · {Math.round(file.size / 1024)}KB
                  </p>
                )}
                <p className="mt-1 text-[10px] text-muted-foreground">
                  HWP 는 지원 안 함 — Word/한컴 오피스에서 PDF 로 변환 후 업로드
                </p>
              </div>
              <div>
                <Label htmlFor="file-hint" className="text-xs">
                  파일 컨텍스트 (선택)
                </Label>
                <Input
                  id="file-hint"
                  value={fileHint}
                  onChange={(e) => setFileHint(e.target.value)}
                  placeholder="예: 2024년 OO재단 청년창업 사업 수주 제안서"
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={fileWasWon}
                    onChange={(e) => setFileWasWon(e.target.checked)}
                  />
                  수주된 제안서 (Win 라벨)
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={filePerSlide}
                    onChange={(e) => setFilePerSlide(e.target.checked)}
                  />
                  슬라이드별 자산화 (PPTX)
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={fileSingleOnly}
                    onChange={(e) => setFileSingleOnly(e.target.checked)}
                  />
                  단건만 추출 (파일 전체)
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={fileAutoSave}
                    onChange={(e) => setFileAutoSave(e.target.checked)}
                  />
                  추출 즉시 저장 (developing)
                </label>
              </div>
              <Button
                onClick={handleFileUpload}
                disabled={fileLoading || !file}
                className="gap-1"
              >
                {fileLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {fileLoading ? '추출·분석 중...' : '🚀 파일 업로드'}
              </Button>
            </CardContent>
          </Card>

          {fileResult && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  추출 결과 — {fileResult.file.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-xs">
                  자산 후보 {fileResult.proposalCount}건 추출
                  {fileResult.savedIds.length > 0 &&
                    ` (${fileResult.savedIds.length}건 저장)`}
                  {fileResult.truncated && (
                    <span className="ml-2 text-amber-700">⚠ 본문 절단됨</span>
                  )}
                </div>
                <div className="max-h-96 space-y-1.5 overflow-y-auto">
                  {fileResult.proposals.map((p, i) => (
                    <div
                      key={i}
                      className="rounded border bg-muted/20 p-1.5 text-[11px]"
                    >
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="font-medium">{p.name}</span>
                        <Badge variant="outline" className="h-3.5 px-1 text-[9px]">
                          {p.category}
                        </Badge>
                        <Badge variant="outline" className="h-3.5 px-1 text-[9px]">
                          {p.evidenceType}
                        </Badge>
                        {fileResult.savedIds[i] && (
                          <a
                            href={`/admin/content-hub/${fileResult.savedIds[i]}/edit`}
                            className="ml-auto text-[10px] text-primary hover:underline"
                          >
                            편집 →
                          </a>
                        )}
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-muted-foreground">
                        {p.narrativeSnippet}
                      </div>
                    </div>
                  ))}
                </div>
                {fileResult.savedIds.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    ⓘ 저장된 자산은{' '}
                    <code>status=developing</code>. /admin/content-hub 에서 검토 후
                    stable 로 승격.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
