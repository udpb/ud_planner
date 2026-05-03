'use client'

/**
 * NewProjectForm — RFP 우선 흐름 (Phase L, 2026-04-28)
 *
 * 1) RFP 업로드 (PDF or 본문 붙여넣기) → 자동 분석
 * 2) 분석 결과로 name·client·예산·기간 자동 채움
 * 3) 사용자가 form 검토·수정 (RFP 가 못 잡은 칸 보완)
 * 4) 제출 → server action createProjectAction → /projects/{id}/express 자동 진입
 *
 * "RFP 없이 수동 시작" 토글로 RFP 영역 접고 빈 form 으로 시작 가능.
 */

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Upload, FileText, X, Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { RfpParsed } from '@/lib/ai/parse-rfp'
import { createProjectAction } from './actions'

interface FormValues {
  name: string
  client: string
  projectType: 'B2G' | 'B2B'
  totalBudgetVat: string // input 은 string
  eduStartDate: string // YYYY-MM-DD
  eduEndDate: string
}

const EMPTY_FORM: FormValues = {
  name: '',
  client: '',
  projectType: 'B2G',
  totalBudgetVat: '',
  eduStartDate: '',
  eduEndDate: '',
}

function dateToInputValue(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

export function NewProjectForm() {
  const [form, setForm] = useState<FormValues>(EMPTY_FORM)
  const [rfpFile, setRfpFile] = useState<File | null>(null)
  const [rfpText, setRfpText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parsed, setParsed] = useState<RfpParsed | null>(null)
  const [rfpUsedRaw, setRfpUsedRaw] = useState<string>('') // 실제 분석에 사용된 본문
  const [skipRfp, setSkipRfp] = useState(false)
  const [isPending, startTransition] = useTransition()

  const setField = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
  }

  // ─────────────────────────────────────────
  // RFP 분석 (POST /api/ai/parse-rfp)
  // ─────────────────────────────────────────
  const handleAnalyzeRfp = async () => {
    if (!rfpFile && rfpText.trim().length < 100) {
      toast.error('RFP 파일을 업로드하거나 본문을 100자 이상 입력해 주세요.')
      return
    }
    setParsing(true)
    try {
      const fd = new FormData()
      if (rfpFile) fd.append('file', rfpFile)
      else fd.append('text', rfpText)
      // projectId 없이 호출 — POST 가 단순 파싱만 (DB 저장 안 함)

      const r = await fetch('/api/ai/parse-rfp', { method: 'POST', body: fd })
      if (!r.ok) {
        const err = await r.text()
        throw new Error(err)
      }
      const data = await r.json()
      const p = data.parsed as RfpParsed

      // form 자동 채움 — 빈 칸만 채우고, 사용자가 이미 수정한 값은 보존
      setForm((prev) => ({
        name: prev.name || p.projectName || '',
        client: prev.client || p.client || '',
        projectType: prev.projectType || (p.projectType ?? 'B2G'),
        totalBudgetVat:
          prev.totalBudgetVat || (p.totalBudgetVat ? String(p.totalBudgetVat) : ''),
        eduStartDate: prev.eduStartDate || dateToInputValue(p.eduStartDate),
        eduEndDate: prev.eduEndDate || dateToInputValue(p.eduEndDate),
      }))
      setParsed(p)

      // 실제 분석에 사용된 raw 텍스트 — server action 으로 hidden 전달 위해 보관
      // PDF 파싱이면 server 가 다시 PDF 처리해야 함. 단순화: text 만 보관 (PDF 의 경우 PUT 흐름 활용)
      if (rfpFile) {
        // PDF 의 경우 raw 가 클라에 없음 — server action 에서는 rfpParsed JSON 만으로도 충분.
        // rfpRaw 는 빈 값 (Project.rfpRaw 만 비어있고 rfpParsed 는 채워짐)
        setRfpUsedRaw('')
      } else {
        setRfpUsedRaw(rfpText)
      }

      toast.success(
        `RFP 분석 완료 — 사업명·기관·예산·기간 자동 채움. 비어있거나 다른 값이면 수정해 주세요.`,
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('RFP 분석 실패: ' + msg.slice(0, 80))
    } finally {
      setParsing(false)
    }
  }

  // ─────────────────────────────────────────
  // 제출
  // ─────────────────────────────────────────
  const handleSubmit = (formData: FormData) => {
    // form 의 controlled value 를 강제로 FormData 에 반영 (server action 에 전달)
    formData.set('name', form.name)
    formData.set('client', form.client)
    formData.set('projectType', form.projectType)
    formData.set('totalBudgetVat', form.totalBudgetVat)
    formData.set('eduStartDate', form.eduStartDate)
    formData.set('eduEndDate', form.eduEndDate)
    if (rfpUsedRaw) formData.set('rfpRaw', rfpUsedRaw)
    if (parsed) formData.set('rfpParsed', JSON.stringify(parsed))

    startTransition(async () => {
      try {
        await createProjectAction(formData)
        // redirect 가 server action 안에서 일어나므로 여기 도달 X
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        // Next.js 의 redirect 는 throw 형식 — 정상 상황에선 이 catch 가 NEXT_REDIRECT 받음
        if (!msg.includes('NEXT_REDIRECT')) {
          toast.error('프로젝트 생성 실패: ' + msg.slice(0, 80))
        }
      }
    })
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {/* RFP 업로드 카드 */}
      {!skipRfp && (
        <Card className="border-primary/30 bg-orange-50/30">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              RFP 부터 — 자동으로 사업 정보를 채워드려요
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              제안요청서 PDF 를 올리거나, 본문을 붙여넣으세요. 분석 후 사업명·기관·예산·기간이
              자동 채워집니다. 다른 값이면 직접 수정 가능해요.
            </p>

            {/* PDF 파일 */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">PDF 파일</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    setRfpFile(f ?? null)
                  }}
                  disabled={parsing || isPending}
                  className="text-xs"
                />
                {rfpFile && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRfpFile(null)}
                    disabled={parsing || isPending}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              {rfpFile && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" />
                  {rfpFile.name} ({(rfpFile.size / 1024).toFixed(0)} KB)
                </div>
              )}
            </div>

            <div className="text-center text-xs text-muted-foreground">또는</div>

            {/* 본문 붙여넣기 */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">본문 붙여넣기</Label>
              <Textarea
                value={rfpText}
                onChange={(e) => setRfpText(e.target.value)}
                placeholder="RFP 본문을 여기에 붙여넣으세요 (최소 100자)..."
                className="min-h-[120px] text-xs"
                disabled={parsing || isPending || !!rfpFile}
              />
            </div>

            {/* 분석 버튼 + 토글 */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSkipRfp(true)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className="h-3 w-3" />
                RFP 없이 수동 시작
              </button>
              <Button
                type="button"
                onClick={handleAnalyzeRfp}
                disabled={parsing || isPending || (!rfpFile && rfpText.trim().length < 100)}
              >
                {parsing ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    분석 중 (1~2분)
                  </>
                ) : parsed ? (
                  <>
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    재분석
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
      )}

      {/* 수동 시작 토글 (접힌 상태) */}
      {skipRfp && (
        <div className="flex items-center justify-between rounded-md border border-dashed bg-muted/20 px-4 py-2">
          <div className="text-sm text-muted-foreground">RFP 없이 수동 시작 모드 (실험·연습용)</div>
          <button
            type="button"
            onClick={() => setSkipRfp(false)}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ChevronUp className="h-3 w-3" />
            RFP 업로드로 돌아가기
          </button>
        </div>
      )}

      {/* 분석 결과 미리보기 (RFP 분석 완료 시) */}
      {parsed && !skipRfp && (
        <Card className="border-green-200 bg-green-50/40">
          <CardContent className="space-y-1.5 p-3 text-xs">
            <div className="flex items-center gap-1.5 font-medium text-green-800">
              <Sparkles className="h-3.5 w-3.5" />
              자동 분석 — 다음 정보가 채워졌어요
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-foreground/85">
              {parsed.projectName && <div>· 사업명: {parsed.projectName}</div>}
              {parsed.client && <div>· 발주: {parsed.client}</div>}
              {parsed.totalBudgetVat && (
                <div>· 예산: {parsed.totalBudgetVat.toLocaleString()}원</div>
              )}
              {(parsed.eduStartDate || parsed.eduEndDate) && (
                <div>
                  · 기간: {parsed.eduStartDate ?? '?'} ~ {parsed.eduEndDate ?? '?'}
                </div>
              )}
              {parsed.targetAudience && <div>· 대상: {parsed.targetAudience}</div>}
              {(parsed.objectives?.length ?? 0) > 0 && (
                <div className="col-span-2">
                  · 목적: {parsed.objectives.slice(0, 2).join(', ')}
                </div>
              )}
            </div>
            <p className="pt-1 text-[11px] text-muted-foreground">
              아래 form 에서 직접 수정 가능. 빈 칸은 직접 채워주세요.
            </p>
          </CardContent>
        </Card>
      )}

      {/* 프로젝트 정보 form (controlled) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">프로젝트 기본 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">프로젝트명 *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="예: 2026 청년창업사관학교 위탁운영"
              required
              className={cn(parsed?.projectName === form.name && form.name && 'bg-green-50/50')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client">발주기관 *</Label>
            <Input
              id="client"
              value={form.client}
              onChange={(e) => setField('client', e.target.value)}
              placeholder="예: 중소벤처기업부"
              required
              className={cn(parsed?.client === form.client && form.client && 'bg-green-50/50')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="projectType">사업 유형</Label>
            <select
              id="projectType"
              value={form.projectType}
              onChange={(e) => setField('projectType', e.target.value as 'B2G' | 'B2B')}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="B2G">B2G (정부/공공)</option>
              <option value="B2B">B2B (기업)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="totalBudgetVat">총 예산 (VAT 포함, 원)</Label>
            <Input
              id="totalBudgetVat"
              type="number"
              value={form.totalBudgetVat}
              onChange={(e) => setField('totalBudgetVat', e.target.value)}
              placeholder="예: 500000000"
              className={cn(
                parsed?.totalBudgetVat &&
                  String(parsed.totalBudgetVat) === form.totalBudgetVat &&
                  'bg-green-50/50',
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="eduStartDate">교육 시작일</Label>
              <Input
                id="eduStartDate"
                type="date"
                value={form.eduStartDate}
                onChange={(e) => setField('eduStartDate', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eduEndDate">교육 종료일</Label>
              <Input
                id="eduEndDate"
                type="date"
                value={form.eduEndDate}
                onChange={(e) => setField('eduEndDate', e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="submit"
              className="flex-1"
              disabled={isPending || parsing || !form.name || !form.client}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  생성 중...
                </>
              ) : parsed ? (
                'RFP 와 함께 프로젝트 생성 → Express 진입'
              ) : (
                '프로젝트 생성'
              )}
            </Button>
            <a href="/projects">
              <Button type="button" variant="outline" disabled={isPending}>
                취소
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
