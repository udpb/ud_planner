'use client'

/**
 * SubmitAssetClient — PM 자산 제안 폼 (2026-05-19)
 *
 * 두 모드:
 *  1. AI 보완 (기본) — PM 이 본문만 자유롭게 쓰면 AI 가 category·tags·snippet 추론
 *  2. 수동 — PM 이 모든 필드 명시
 *
 * AI 보완이 더 직관적 — PM 입장에서 "이 한 줄/한 문단이 자산이 됩니다" 던지면 끝.
 */

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Sparkles, Settings2, CheckCircle2, Upload, FileText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'

const CATEGORIES = [
  { value: 'methodology', label: '방법론' },
  { value: 'content', label: '콘텐츠' },
  { value: 'product', label: '프로덕트' },
  { value: 'human', label: '휴먼' },
  { value: 'data', label: '데이터' },
  { value: 'framework', label: '프레임워크' },
]
const EVIDENCE = [
  { value: 'quantitative', label: '정량 (숫자)' },
  { value: 'structural', label: '구조 (프레임)' },
  { value: 'case', label: '사례 (과거 수행)' },
  { value: 'methodology', label: '방법 (프로세스)' },
]
const SECTIONS = [
  { value: 'proposal-background', label: '제안 배경' },
  { value: 'curriculum', label: '커리큘럼' },
  { value: 'coaches', label: '코치·운영' },
  { value: 'budget', label: '예산' },
  { value: 'impact', label: '임팩트' },
  { value: 'org-team', label: '조직·팀' },
]
const STAGES = [
  { value: 'impact', label: '① Impact' },
  { value: 'input', label: '② Input' },
  { value: 'output', label: '③ Output' },
  { value: 'activity', label: '④ Activity' },
  { value: 'outcome', label: '⑤ Outcome' },
]

export function SubmitAssetClient() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<{ id: string; name: string } | null>(
    null,
  )

  // AI assist 모드
  const [body, setBody] = useState('')
  const [name, setName] = useState('')
  const [submitterNote, setSubmitterNote] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')

  // G1 — 파일 업로드 모드
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadExtracting, setUploadExtracting] = useState(false)
  const [uploadDragOver, setUploadDragOver] = useState(false)
  const [extractedMeta, setExtractedMeta] = useState<{
    fileName: string
    fileType: string
    pageCount?: number
    charCount: number
    truncated?: boolean
  } | null>(null)

  async function handleFileUpload(file: File) {
    setUploadExtracting(true)
    setUploadFile(file)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/content-hub/extract-file', {
        method: 'POST',
        body: fd,
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        toast.error(data.error || '파일 추출 실패')
        if (data.suggestion) toast.message(data.suggestion)
        setUploadFile(null)
        return
      }
      // 추출된 텍스트를 assist 모드 body 에 채움 + 이름 자동 추출
      setBody(data.text)
      if (!name && data.fileName) {
        // 확장자 제거 + 이름 자동 채움
        const baseName = data.fileName.replace(/\.[^.]+$/, '')
        setName(baseName.slice(0, 120))
      }
      setExtractedMeta({
        fileName: data.fileName,
        fileType: data.fileType,
        pageCount: data.pageCount,
        charCount: data.charCount,
        truncated: data.truncated,
      })
      toast.success(
        `${data.fileName} 추출 완료 — ${data.charCount}자${data.pageCount ? ` · ${data.pageCount}p` : ''}${data.truncated ? ' (12000자 컷)' : ''}`,
      )
    } catch (err) {
      toast.error(`파일 추출 실패: ${err instanceof Error ? err.message : String(err)}`)
      setUploadFile(null)
    } finally {
      setUploadExtracting(false)
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void handleFileUpload(file)
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setUploadDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) void handleFileUpload(file)
  }

  // 수동 모드
  const [manualName, setManualName] = useState('')
  const [manualCategory, setManualCategory] = useState('content')
  const [manualEvidence, setManualEvidence] = useState('structural')
  const [manualSections, setManualSections] = useState<string[]>(['proposal-background'])
  const [manualStage, setManualStage] = useState('activity')
  const [manualSnippet, setManualSnippet] = useState('')
  const [manualKeywords, setManualKeywords] = useState('')
  const [manualSubmitterNote, setManualSubmitterNote] = useState('')

  const handleAssistSubmit = async () => {
    if (body.trim().length < 40) {
      toast.error('본문 최소 40자 — 더 자세히 써주세요')
      return
    }
    setSubmitting(true)
    try {
      const r = await fetch('/api/content-hub/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'assist',
          body: body.trim(),
          name: name.trim() || undefined,
          submitterNote: submitterNote.trim() || undefined,
          sourceUrl: sourceUrl.trim() || undefined,
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'unknown')
      toast.success(data.message ?? '제안 등록 완료')
      setSubmitted(data.asset)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('제출 실패: ' + msg.slice(0, 120))
    } finally {
      setSubmitting(false)
    }
  }

  const handleManualSubmit = async () => {
    if (!manualName.trim() || !manualSnippet.trim()) {
      toast.error('이름과 narrativeSnippet 은 필수')
      return
    }
    if (manualSections.length === 0) {
      toast.error('최소 1개 섹션 선택')
      return
    }
    setSubmitting(true)
    try {
      const r = await fetch('/api/content-hub/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'manual',
          name: manualName.trim(),
          category: manualCategory,
          evidenceType: manualEvidence,
          applicableSections: manualSections,
          valueChainStage: manualStage,
          narrativeSnippet: manualSnippet.trim(),
          keywords: manualKeywords
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          submitterNote: manualSubmitterNote.trim() || undefined,
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'unknown')
      toast.success(data.message ?? '제안 등록 완료')
      setSubmitted(data.asset)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('제출 실패: ' + msg.slice(0, 120))
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <Card className="border-green-300 bg-green-50/40">
        <CardContent className="space-y-3 py-6 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
          <p className="text-lg font-semibold">제안 등록 완료</p>
          <p className="text-sm">
            <strong>{submitted.name}</strong> — 검수 대기 중
          </p>
          <p className="text-xs text-muted-foreground">
            Admin/Director 가 승인하면 추천 풀에 자동 합류됩니다. (보통 1~2 영업일)
          </p>
          <div className="flex justify-center gap-2 pt-2">
            <Button
              size="sm"
              onClick={() => {
                setSubmitted(null)
                setBody('')
                setName('')
                setSubmitterNote('')
                setSourceUrl('')
              }}
            >
              새 자산 추가 제안
            </Button>
            <Button variant="outline" size="sm" onClick={() => router.push('/dashboard')}>
              대시보드로
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Tabs defaultValue="file">
      <TabsList>
        <TabsTrigger value="file" className="gap-1">
          <Upload className="h-3.5 w-3.5" />
          파일 업로드 (PDF / TXT)
        </TabsTrigger>
        <TabsTrigger value="assist" className="gap-1">
          <Sparkles className="h-3.5 w-3.5" />
          텍스트 직접 입력
        </TabsTrigger>
        <TabsTrigger value="manual" className="gap-1">
          <Settings2 className="h-3.5 w-3.5" />
          수동 입력
        </TabsTrigger>
      </TabsList>

      {/* G1 — 파일 업로드 모드 */}
      <TabsContent value="file" className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">파일 업로드 + AI 자동 정리</CardTitle>
            <p className="text-[11px] text-muted-foreground">
              PDF · TXT · MD 자산 파일을 드래그&드롭 → 자동 텍스트 추출 → AI 가 카테고리·태그·인용 문구 정리해 검수 큐에 등록.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Drag & drop zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setUploadDragOver(true)
              }}
              onDragLeave={() => setUploadDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer border-2 border-dashed p-6 text-center transition-colors ${
                uploadDragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/30 hover:border-primary/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                onChange={handleFileSelect}
                className="hidden"
              />
              {uploadExtracting ? (
                <div className="flex items-center justify-center gap-2 py-2 text-xs">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  추출 중...
                </div>
              ) : extractedMeta ? (
                <div className="space-y-1">
                  <div className="flex items-center justify-center gap-2 text-xs font-semibold">
                    <FileText className="h-4 w-4" />
                    {extractedMeta.fileName}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {extractedMeta.charCount}자
                    {extractedMeta.pageCount ? ` · ${extractedMeta.pageCount} 페이지` : ''}
                    {extractedMeta.truncated ? ' · 12,000자 컷' : ''}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    다른 파일을 드롭하거나 클릭해서 교체
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <Upload className="mx-auto h-6 w-6 text-muted-foreground" />
                  <p className="text-xs font-semibold">
                    파일을 여기에 드롭하거나 클릭해서 선택
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    PDF · TXT · MD · 최대 20MB
                  </p>
                </div>
              )}
            </div>

            {/* 추출 텍스트 미리보기 + 편집 */}
            {body && extractedMeta && (
              <>
                <div>
                  <Label htmlFor="body-extracted" className="text-xs">
                    추출된 본문 (수정 가능)
                  </Label>
                  <Textarea
                    id="body-extracted"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={8}
                    className="mt-1 text-xs"
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {body.length} / 8000자 (AI 분석 한도 — 길면 핵심 부분만 남기세요)
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="upload-name" className="text-xs">
                      자산 이름 (자동 추출 — 수정 가능)
                    </Label>
                    <Input
                      id="upload-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="예: AX 가이드북"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="upload-sourceUrl" className="text-xs">
                      출처 URL (선택)
                    </Label>
                    <Input
                      id="upload-sourceUrl"
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                      placeholder="https://..."
                      className="mt-1"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="upload-note" className="text-xs">
                    왜 자산화 가치가 있나요? (Admin 검수 참고)
                  </Label>
                  <Input
                    id="upload-note"
                    value={submitterNote}
                    onChange={(e) => setSubmitterNote(e.target.value)}
                    placeholder="예: 청년 창업 사업 제안서에 인용 가능한 정량 데이터 풍부"
                    className="mt-1"
                  />
                </div>
                <Button
                  onClick={handleAssistSubmit}
                  disabled={submitting || body.trim().length < 40}
                  className="gap-1"
                >
                  {submitting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {submitting ? 'AI 분석 + 등록 중...' : 'AI 자동 정리 + 등록'}
                </Button>
                <p className="text-[10px] text-muted-foreground">
                  ※ 본문 추출 + AI 분석 후 status=&quot;developing&quot; 으로 검수 큐 등록. Admin 승인 후 추천 풀 합류.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* AI 보완 모드 */}
      <TabsContent value="assist" className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">자산 후보 본문</CardTitle>
            <p className="text-[11px] text-muted-foreground">
              자산화하고 싶은 내용을 자유롭게 쓰세요. AI 가 카테고리·태그·인용
              문구를 자동으로 정리해 검수 큐에 등록합니다.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="body" className="text-xs">
                본문 <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={
                  '예: 2026년 카카오 임팩트 사업에서 활용한 \'제주 청년 창업 생존율 73%\' 데이터. 비교 그룹 (일반 창업 41%) 대비 1.8배 높음. 동일 비즈니스 도메인 (식음료·여행) 매칭 시 가산점 가능.'
                }
                rows={8}
                className="mt-1 text-sm"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                {body.length} / 8000자 (최소 40자)
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="name" className="text-xs">
                  이름 (선택 — 비우면 AI 가 제안)
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: 제주 청년 창업 생존율 데이터"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="sourceUrl" className="text-xs">
                  출처 URL (선택)
                </Label>
                <Input
                  id="sourceUrl"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://..."
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="note" className="text-xs">
                왜 자산화 가치가 있나요? (Admin 검수 참고)
              </Label>
              <Input
                id="note"
                value={submitterNote}
                onChange={(e) => setSubmitterNote(e.target.value)}
                placeholder="예: B2G 청년 창업 사업에서 즉시 인용 가능한 정량 데이터"
                className="mt-1"
              />
            </div>
            <Button
              onClick={handleAssistSubmit}
              disabled={submitting || body.trim().length < 40}
              className="gap-1"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {submitting ? 'AI 분석 + 등록 중...' : '제안 등록 (AI 자동 정리)'}
            </Button>
          </CardContent>
        </Card>
      </TabsContent>

      {/* 수동 모드 */}
      <TabsContent value="manual" className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">수동 입력</CardTitle>
            <p className="text-[11px] text-muted-foreground">
              모든 필드를 직접 채워서 정확한 형태로 제안.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">
                자산 이름 <span className="text-red-500">*</span>
              </Label>
              <Input
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="예: Alumni Hub 25,000명 데이터"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">카테고리</Label>
                <select
                  value={manualCategory}
                  onChange={(e) => setManualCategory(e.target.value)}
                  className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">증거 유형</Label>
                <select
                  value={manualEvidence}
                  onChange={(e) => setManualEvidence(e.target.value)}
                  className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                >
                  {EVIDENCE.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Value Chain</Label>
                <select
                  value={manualStage}
                  onChange={(e) => setManualStage(e.target.value)}
                  className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                >
                  {STAGES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label className="text-xs">
                적용 섹션 <span className="text-red-500">*</span> (1~3개)
              </Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {SECTIONS.map((s) => {
                  const active = manualSections.includes(s.value)
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() =>
                        setManualSections((cur) =>
                          active
                            ? cur.filter((x) => x !== s.value)
                            : [...cur, s.value],
                        )
                      }
                      className={
                        active
                          ? 'rounded-md bg-primary px-2 py-0.5 text-xs text-primary-foreground'
                          : 'rounded-md border px-2 py-0.5 text-xs hover:border-primary/40'
                      }
                    >
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <Label className="text-xs">
                narrativeSnippet (제안서 본문에 인용) <span className="text-red-500">*</span>
              </Label>
              <Textarea
                value={manualSnippet}
                onChange={(e) => setManualSnippet(e.target.value)}
                placeholder="언더독스 Alumni Hub 의 25,000명 알럼나이 풀은 본 사업의 핵심 자원으로..."
                rows={3}
                className="mt-1 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">
                키워드 (콤마 구분, 옵션)
              </Label>
              <Input
                value={manualKeywords}
                onChange={(e) => setManualKeywords(e.target.value)}
                placeholder="알럼나이, 25000명, 청년 창업, 데이터셋"
                className="mt-1"
              />
              {manualKeywords && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {manualKeywords
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .map((k, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">
                        {k}
                      </Badge>
                    ))}
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs">
                왜 자산화 가치 (Admin 검수 참고)
              </Label>
              <Input
                value={manualSubmitterNote}
                onChange={(e) => setManualSubmitterNote(e.target.value)}
                placeholder="예: B2G 청년 창업 사업에서 즉시 인용 가능"
                className="mt-1"
              />
            </div>
            <Button onClick={handleManualSubmit} disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {submitting ? '등록 중...' : '제안 등록'}
            </Button>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
