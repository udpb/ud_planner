'use client'

/**
 * RfpUploadDialog — 첫 진입 시 RFP 업로드 (PDF or 본문 붙여넣기)
 *  - Express 흐름: PM 확인 단계 생략, 자동으로 DB 저장 후 onReady 호출
 *  - PM 이 수정하고 싶으면 챗봇 안에서 진행
 *
 * (Phase L Wave L2, ADR-011 §2.4)
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Loader2, Upload, FileText, X } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  projectId: string
  onReady: () => void
  onSkip: () => void
}

export function RfpUploadDialog({ projectId, onReady, onSkip }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [parsing, setParsing] = useState(false)

  const handleSubmit = async () => {
    if (!file && text.trim().length < 100) {
      toast.error('RFP 파일을 업로드하거나 본문을 100자 이상 입력해 주세요.')
      return
    }
    setParsing(true)
    try {
      // 1) 파싱 (POST)
      const fd = new FormData()
      fd.append('projectId', projectId)
      if (file) fd.append('file', file)
      else fd.append('text', text)

      const r = await fetch('/api/ai/parse-rfp', { method: 'POST', body: fd })
      if (!r.ok) {
        const err = await r.text()
        throw new Error(err)
      }
      const data = await r.json()

      // 2) DB 저장 (PUT) — Express 는 PM 확인 단계 생략, 자동 저장
      const r2 = await fetch('/api/ai/parse-rfp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, parsed: data.parsed }),
      })
      if (!r2.ok) throw new Error(await r2.text())

      toast.success('RFP 파싱 완료')
      onReady()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('RFP 파싱 실패: ' + msg.slice(0, 80))
    } finally {
      setParsing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-xl">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">RFP 부터 시작</CardTitle>
          <Button variant="ghost" size="icon" onClick={onSkip} disabled={parsing}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            PDF 파일을 올리거나, 본문을 붙여넣어 주세요. 챗봇이 자동으로 분석해 첫 질문을 던져요.
          </p>

          {/* 파일 업로드 */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">PDF 파일 (선택)</label>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept=".pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  setFile(f ?? null)
                }}
                disabled={parsing}
                className="text-xs"
              />
              {file && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFile(null)}
                  disabled={parsing}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            {file && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                {file.name} ({(file.size / 1024).toFixed(0)} KB)
              </div>
            )}
          </div>

          <div className="text-center text-xs text-muted-foreground">또는</div>

          {/* 본문 붙여넣기 */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">본문 붙여넣기 (선택)</label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="RFP 본문을 여기에 붙여넣으세요 (최소 100자)..."
              className="min-h-[140px] text-xs"
              disabled={parsing || !!file}
            />
          </div>

          {/* 액션 */}
          <div className="flex justify-between gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onSkip} disabled={parsing}>
              나중에 (RFP 없이 시작)
            </Button>
            <Button onClick={handleSubmit} disabled={parsing}>
              {parsing ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  분석 중 (1~2분)
                </>
              ) : (
                <>
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  분석 시작
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
