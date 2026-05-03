'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Loader2, Pencil } from 'lucide-react'

const STATUS_OPTIONS = [
  { value: 'DRAFT', label: '기획중' },
  { value: 'PROPOSAL', label: '제안서 작성' },
  { value: 'SUBMITTED', label: '제출완료' },
  { value: 'IN_PROGRESS', label: '운영중' },
  { value: 'COMPLETED', label: '완료' },
  { value: 'LOST', label: '미수주' },
]

interface Props {
  project: {
    id: string
    name: string
    client: string
    status: string
    projectType: string
    totalBudgetVat: number | null
    supplyPrice: number | null
    projectStartDate: Date | null
    projectEndDate: Date | null
    eduStartDate: Date | null
    eduEndDate: Date | null
    isBidWon?: boolean | null
    techEvalScore?: number | null
    bidNotes?: string | null
  }
}

function toDateInput(d: Date | null) {
  if (!d) return ''
  return new Date(d).toISOString().slice(0, 10)
}

export function ProjectEditForm({ project }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: project.name,
    client: project.client,
    status: project.status,
    projectType: project.projectType,
    totalBudgetVat: project.totalBudgetVat?.toString() ?? '',
    supplyPrice: project.supplyPrice?.toString() ?? '',
    projectStartDate: toDateInput(project.projectStartDate),
    projectEndDate: toDateInput(project.projectEndDate),
    eduStartDate: toDateInput(project.eduStartDate),
    eduEndDate: toDateInput(project.eduEndDate),
    // Phase 4: 수주 피드백 루프
    isBidWon:
      project.isBidWon === true ? 'won' : project.isBidWon === false ? 'lost' : 'unknown',
    techEvalScore: project.techEvalScore?.toString() ?? '',
    bidNotes: project.bidNotes ?? '',
  })

  function set(key: string, val: string) {
    setForm((p) => ({ ...p, [key]: val }))
  }

  async function handleSave() {
    setLoading(true)
    setError('')
    try {
      const body: any = {
        name: form.name,
        client: form.client,
        status: form.status,
        projectType: form.projectType,
      }
      if (form.totalBudgetVat) body.totalBudgetVat = Number(form.totalBudgetVat)
      if (form.supplyPrice) body.supplyPrice = Number(form.supplyPrice)
      if (form.projectStartDate) body.projectStartDate = form.projectStartDate
      if (form.projectEndDate) body.projectEndDate = form.projectEndDate
      if (form.eduStartDate) body.eduStartDate = form.eduStartDate
      if (form.eduEndDate) body.eduEndDate = form.eduEndDate
      // Phase 4: 수주 피드백 — null/true/false 명시 전송
      if (form.isBidWon === 'won') body.isBidWon = true
      else if (form.isBidWon === 'lost') body.isBidWon = false
      else body.isBidWon = null
      if (form.techEvalScore) body.techEvalScore = Number(form.techEvalScore)
      if (form.bidNotes) body.bidNotes = form.bidNotes

      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? '저장 실패')
      }
      setOpen(false)
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
      >
        <Pencil className="h-3.5 w-3.5" />
        편집
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>프로젝트 편집</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 기본 정보 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">사업명</Label>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">발주기관</Label>
              <Input value={form.client} onChange={(e) => set('client', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">유형</Label>
              <Select value={form.projectType} onValueChange={(v) => v && set('projectType', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="B2G">B2G (정부·공공)</SelectItem>
                  <SelectItem value="B2B">B2B (기업)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">진행 상태</Label>
              <Select value={form.status} onValueChange={(v) => v && set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* 예산 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">총 예산 (VAT포함, 원)</Label>
              <Input
                type="number"
                placeholder="예: 300000000"
                value={form.totalBudgetVat}
                onChange={(e) => set('totalBudgetVat', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">공급가액 (VAT제외, 원)</Label>
              <Input
                type="number"
                placeholder="예: 272727272"
                value={form.supplyPrice}
                onChange={(e) => set('supplyPrice', e.target.value)}
              />
            </div>
          </div>

          <Separator />

          {/* 기간 */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">계약 기간</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">시작일</Label>
                <Input type="date" value={form.projectStartDate} onChange={(e) => set('projectStartDate', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">종료일</Label>
                <Input type="date" value={form.projectEndDate} onChange={(e) => set('projectEndDate', e.target.value)} />
              </div>
            </div>
            <Label className="text-xs text-muted-foreground">교육 운영 기간</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">교육 시작</Label>
                <Input type="date" value={form.eduStartDate} onChange={(e) => set('eduStartDate', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">교육 종료</Label>
                <Input type="date" value={form.eduEndDate} onChange={(e) => set('eduEndDate', e.target.value)} />
              </div>
            </div>
          </div>

          <Separator />

          {/* Phase 4: 수주 피드백 루프 */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              수주 결과 (학습용 — Validation 카드 / WinningPattern 패턴 누적에 활용)
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">isBidWon</Label>
                <Select value={form.isBidWon} onValueChange={(v) => v && set('isBidWon', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unknown">미정 / 결과 없음</SelectItem>
                    <SelectItem value="won">수주 ✓</SelectItem>
                    <SelectItem value="lost">미수주 ✗</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">기술평가 점수 (있으면)</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="예: 87.5"
                  value={form.techEvalScore}
                  onChange={(e) => set('techEvalScore', e.target.value)}
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">메모 (성공/실패 사유, 평가위원 코멘트 등)</Label>
                <Input
                  placeholder="예: 평가위원 A — '커리큘럼 차별성 약함', 자체 평가 — 임팩트 정량 보강 필요"
                  value={form.bidNotes}
                  onChange={(e) => set('bidNotes', e.target.value)}
                />
              </div>
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />저장 중</> : '저장'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
