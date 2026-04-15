'use client'

/**
 * Ingestion 업로드 폼 (Phase A)
 *
 * 자료 종류 선택 (제안서 / 커리큘럼 / 심사위원질문 / 전략인터뷰)
 * + 종류별 동적 메타 필드
 * + 파일 업로드 또는 URL
 *
 * Phase D 워커가 가동되면 status="queued" 가 자동으로 진행됨.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Upload } from 'lucide-react'
import {
  INGESTION_KIND_LABELS,
  INGESTION_KINDS,
  type IngestionKind,
} from '@/lib/ingestion/types'

interface IngestFormProps {
  uploaderId: string
}

export function IngestForm({ uploaderId: _uploaderId }: IngestFormProps) {
  const router = useRouter()
  const [kind, setKind] = useState<IngestionKind>('proposal')
  const [submitting, setSubmitting] = useState(false)

  // 메타 필드 상태 (kind 별로 다름 — 한 곳에 통합)
  const [projectName, setProjectName] = useState('')
  const [client, setClient] = useState('')
  const [isWon, setIsWon] = useState<'won' | 'lost' | ''>('')
  const [totalScore, setTotalScore] = useState('')
  const [audience, setAudience] = useState('')
  const [sessionCount, setSessionCount] = useState('')
  const [presentationDate, setPresentationDate] = useState('')
  const [interviewee, setInterviewee] = useState('')
  const [interviewDate, setInterviewDate] = useState('')

  // 파일/URL
  const [file, setFile] = useState<File | null>(null)
  const [sourceUrl, setSourceUrl] = useState('')

  function buildMetadata(): Record<string, unknown> {
    switch (kind) {
      case 'proposal':
        return {
          projectName: projectName.trim(),
          client: client.trim() || undefined,
          isWon: isWon === 'won' ? true : isWon === 'lost' ? false : undefined,
          totalScore: totalScore.trim() ? Number(totalScore) : undefined,
        }
      case 'curriculum':
        return {
          projectName: projectName.trim() || undefined,
          audience: audience.trim() || undefined,
          sessionCount: sessionCount.trim() ? Number(sessionCount) : undefined,
        }
      case 'evaluator_question':
        return {
          projectName: projectName.trim() || undefined,
          presentationDate: presentationDate || undefined,
        }
      case 'strategy_interview':
        return {
          interviewee: interviewee.trim() || undefined,
          date: interviewDate || undefined,
        }
    }
  }

  function validate(): string | null {
    if (kind === 'proposal' && !projectName.trim()) {
      return '제안서 업로드 시 사업명은 필수입니다.'
    }
    if (!file && !sourceUrl.trim()) {
      return '파일을 선택하거나 자료 URL을 입력하세요.'
    }
    return null
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const err = validate()
    if (err) {
      toast.error(err)
      return
    }

    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('kind', kind)
      formData.append('metadata', JSON.stringify(buildMetadata()))
      if (file) formData.append('file', file)
      if (sourceUrl.trim()) formData.append('sourceUrl', sourceUrl.trim())

      const res = await fetch('/api/ingest', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error ?? '업로드 실패')
      }

      toast.success('자료가 업로드되었습니다. (처리 대기 중)')

      // 폼 리셋
      setProjectName('')
      setClient('')
      setIsWon('')
      setTotalScore('')
      setAudience('')
      setSessionCount('')
      setPresentationDate('')
      setInterviewee('')
      setInterviewDate('')
      setFile(null)
      setSourceUrl('')

      // 우측 목록 새로고침
      router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : '업로드 실패'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">자료 업로드</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-5">
          {/* 자료 종류 — native radio */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">자료 종류</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {INGESTION_KINDS.map((k) => (
                <label
                  key={k}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                    kind === k
                      ? 'border-primary bg-primary/5 font-medium'
                      : 'border-input hover:bg-muted/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="kind"
                    value={k}
                    checked={kind === k}
                    onChange={() => setKind(k)}
                    className="accent-primary"
                  />
                  <span>{INGESTION_KIND_LABELS[k]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* 종류별 메타 필드 */}
          {kind === 'proposal' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="projectName">
                  사업명 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="projectName"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="예) 2026 청년창업사관학교"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="client">발주처</Label>
                <Input
                  id="client"
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                  placeholder="예) 중소벤처기업진흥공단"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="isWon">수주 여부</Label>
                <select
                  id="isWon"
                  value={isWon}
                  onChange={(e) => setIsWon(e.target.value as 'won' | 'lost' | '')}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">선택 안함</option>
                  <option value="won">수주</option>
                  <option value="lost">탈락 (반면교사 자료)</option>
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="totalScore">총점 (옵션)</Label>
                <Input
                  id="totalScore"
                  type="number"
                  step="0.01"
                  value={totalScore}
                  onChange={(e) => setTotalScore(e.target.value)}
                  placeholder="예) 87.5"
                />
              </div>
            </div>
          )}

          {kind === 'curriculum' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="projectName">사업명</Label>
                <Input
                  id="projectName"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="예) 2025 메이커스페이스"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="audience">대상자</Label>
                <Input
                  id="audience"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  placeholder="예) 예비창업자"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sessionCount">총 회차</Label>
                <Input
                  id="sessionCount"
                  type="number"
                  value={sessionCount}
                  onChange={(e) => setSessionCount(e.target.value)}
                  placeholder="예) 24"
                />
              </div>
            </div>
          )}

          {kind === 'evaluator_question' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="projectName">사업명</Label>
                <Input
                  id="projectName"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="예) 2026 청년마을"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="presentationDate">발표일자</Label>
                <Input
                  id="presentationDate"
                  type="date"
                  value={presentationDate}
                  onChange={(e) => setPresentationDate(e.target.value)}
                />
              </div>
            </div>
          )}

          {kind === 'strategy_interview' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="interviewee">대상자</Label>
                <Input
                  id="interviewee"
                  value={interviewee}
                  onChange={(e) => setInterviewee(e.target.value)}
                  placeholder="예) PM 김OO 팀장"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="interviewDate">날짜</Label>
                <Input
                  id="interviewDate"
                  type="date"
                  value={interviewDate}
                  onChange={(e) => setInterviewDate(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* 파일 / URL */}
          <div className="space-y-3 rounded-md border border-dashed border-input p-4">
            <div className="space-y-1.5">
              <Label htmlFor="file" className="flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5" />
                파일 업로드 (PDF / DOCX / XLSX / TXT)
              </Label>
              <Input
                id="file"
                type="file"
                accept=".pdf,.docx,.xlsx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file && (
                <p className="text-xs text-muted-foreground">
                  선택됨: {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sourceUrl">또는 자료 URL (예: 녹취 링크)</Label>
              <Input
                id="sourceUrl"
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                업로드 중...
              </>
            ) : (
              '업로드'
            )}
          </Button>

          <p className="text-xs text-muted-foreground">
            업로드된 자료는 <strong>처리 대기열(queued)</strong>에 추가됩니다.
            실제 자동 추출은 Phase D 워커 가동 시 시작됩니다.
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
