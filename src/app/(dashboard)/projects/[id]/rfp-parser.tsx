'use client'

import { useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Loader2, FileText, CheckCircle2, ChevronDown, ChevronUp, Upload, X } from 'lucide-react'

interface RfpParsed {
  projectName: string
  client: string
  totalBudgetVat: number | null
  supplyPrice: number | null
  targetAudience: string
  targetCount: number | null
  targetStage: string[]
  objectives: string[]
  deliverables: string[]
  evalCriteria: Array<{ item: string; score: number; notes: string }>
  constraints: Array<{ type: string; description: string }>
  summary: string
}

interface Props {
  projectId: string
  initialParsed?: any
  onParsed?: (parsed: RfpParsed, questions: any[], completeness: any) => void
}

export function RfpParser({ projectId, initialParsed, onParsed }: Props) {
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<RfpParsed | null>(initialParsed ?? null)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(!initialParsed)
  const [mode, setMode] = useState<'text' | 'pdf'>('pdf')
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.type !== 'application/pdf') {
      setError('PDF 파일만 업로드 가능합니다.')
      return
    }
    if (f.size > 20 * 1024 * 1024) {
      setError('파일 크기는 20MB 이하여야 합니다.')
      return
    }
    setFile(f)
    setError('')
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f?.type === 'application/pdf') {
      setFile(f)
      setError('')
    }
  }

  async function handleParse() {
    if (mode === 'pdf' && !file) return
    if (mode === 'text' && !text.trim()) return

    setLoading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('projectId', projectId)
      if (mode === 'pdf' && file) {
        fd.append('file', file)
      } else {
        fd.append('text', text)
      }

      const res = await fetch('/api/ai/parse-rfp', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setResult(data.parsed)
      onParsed?.(data.parsed, data.questions ?? [], data.completeness ?? null)
      setExpanded(false)
      setText('')
      setFile(null)

      // 파싱 결과를 DB 에 자동 저장 (PUT /api/ai/parse-rfp)
      // 기존 설계는 PM 수동 저장이었으나, 파싱 완료 시 즉시 저장해야
      // planning-direction 등 후속 API 가 rfpParsed 를 DB 에서 읽을 수 있음
      try {
        await fetch('/api/ai/parse-rfp', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, parsed: data.parsed }),
        })
      } catch {
        // 저장 실패해도 UI 는 이미 표시 — 다음 기획방향 생성 시 재시도 가능
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const canSubmit = mode === 'pdf' ? !!file : text.trim().length > 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4" />
            RFP 파싱
            {result && <CheckCircle2 className="h-4 w-4 text-green-500" />}
          </CardTitle>
          <button onClick={() => setExpanded(!expanded)} className="text-muted-foreground hover:text-foreground">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </CardHeader>

      {/* 결과 요약 (접힌 상태) */}
      {result && !expanded && (
        <CardContent className="pt-0">
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground text-xs">{result.summary}</p>
            <div className="flex flex-wrap gap-1">
              {result.targetStage?.map((s) => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-md bg-muted p-2">
                <p className="text-muted-foreground">예산(VAT포함)</p>
                <p className="font-medium">{result.totalBudgetVat ? `${(result.totalBudgetVat / 1e8).toFixed(2)}억` : '—'}</p>
              </div>
              <div className="rounded-md bg-muted p-2">
                <p className="text-muted-foreground">참여인원</p>
                <p className="font-medium">{result.targetCount ? `${result.targetCount}명` : '—'}</p>
              </div>
              <div className="rounded-md bg-muted p-2">
                <p className="text-muted-foreground">평가항목</p>
                <p className="font-medium">{result.evalCriteria?.length ?? 0}개</p>
              </div>
            </div>
          </div>
        </CardContent>
      )}

      {/* 입력 폼 (펼친 상태) */}
      {expanded && (
        <CardContent className="space-y-3 pt-0">
          {/* 모드 전환 */}
          <div className="flex rounded-md border p-0.5 text-xs">
            <button
              onClick={() => setMode('pdf')}
              className={`flex-1 rounded py-1 transition-colors ${mode === 'pdf' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              PDF 업로드
            </button>
            <button
              onClick={() => setMode('text')}
              className={`flex-1 rounded py-1 transition-colors ${mode === 'text' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              텍스트 붙여넣기
            </button>
          </div>

          {/* PDF 업로드 */}
          {mode === 'pdf' && (
            <div>
              {!file ? (
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 p-6 text-center transition-colors hover:border-primary/50 hover:bg-muted/30"
                >
                  <Upload className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm font-medium">PDF를 여기에 드래그하거나 클릭</p>
                  <p className="text-xs text-muted-foreground">최대 20MB · PDF 전용</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                  <FileText className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{file.name}</p>
                    <p className="text-[10px] text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <button onClick={() => setFile(null)}>
                    <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 텍스트 붙여넣기 */}
          {mode === 'text' && (
            <Textarea
              placeholder="제안요청서 전문을 여기에 붙여넣으세요..."
              className="h-40 text-xs"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          <button
            onClick={handleParse}
            disabled={loading || !canSubmit}
            className={`w-full rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              loading || !canSubmit
                ? 'cursor-not-allowed bg-muted text-muted-foreground'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {mode === 'pdf' ? 'PDF 파싱 중...' : '파싱 중...'}
              </span>
            ) : (
              'Claude로 파싱'
            )}
          </button>
        </CardContent>
      )}
    </Card>
  )
}
