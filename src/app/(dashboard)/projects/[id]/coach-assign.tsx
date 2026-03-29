'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Loader2, Search, UserPlus, ExternalLink, X } from 'lucide-react'

// coach-finder와 동일한 상수 (호환)
const EXPERTISE_OPTIONS = [
  '창업 일반 (기업가정신/팀빌딩)', '비즈니스 모델 (BM/가설검증)',
  '사업계획서/IR (투자유치/피칭)', '마케팅/브랜딩 (시장조사/퍼포먼스)',
  'AI/DX (생성형 AI 활용/노코드)', '기술/R&D (제조/특허)',
  'ESG/소셜임팩트', '조직문화/HR', '로컬 비즈니스 (지역자원/크리에이터)',
  '투자/심사', '글로벌코칭',
]
const REGION_OPTIONS = ['서울', '경기', '인천', '부산', '대구', '대전', '광주', '강원', '제주']
const ROLE_OPTIONS = [
  { value: 'MAIN_COACH', label: '메인 코치' },
  { value: 'SUB_COACH', label: '보조 코치' },
  { value: 'LECTURER', label: '강사(메인)' },
  { value: 'SUB_LECTURER', label: '강사(보조)' },
  { value: 'SPECIAL_LECTURER', label: '특강 연사' },
  { value: 'JUDGE', label: '심사위원' },
  { value: 'PM_OPS', label: '운영 PM' },
]
const TIER_LABEL: Record<string, string> = {
  TIER1: '베테랑코치', TIER2: 'UD코치', TIER3: '외부풀',
}
const TIER_COLOR: Record<string, string> = {
  TIER1: 'bg-amber-100 text-amber-800',
  TIER2: 'bg-blue-100 text-blue-800',
  TIER3: 'bg-slate-100 text-slate-700',
}
const COACH_FINDER_URL = 'https://underdogs-coach-finder.vercel.app'

interface CoachResult {
  id: string
  githubId: number | null
  name: string
  organization: string | null
  position: string | null
  tier: string
  category: string
  expertise: string[]
  regions: string[]
  roles: string[]
  photoUrl: string | null
  careerYears: number | null
  satisfactionAvg: number | null
  collaborationCount: number
  intro: string | null
  lectureRateMain: number | null
  coachRateMain: number | null
}

interface AssignForm {
  role: string
  sessions: string
  hoursPerSession: string
  agreedRate: string
  notes: string
}

interface Props {
  projectId: string
  assignedCoachIds: string[]
}

export function CoachAssign({ projectId, assignedCoachIds }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [selectedExpertise, setSelectedExpertise] = useState<string[]>([])
  const [selectedRegion, setSelectedRegion] = useState('')
  const [results, setResults] = useState<CoachResult[]>([])
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState<CoachResult | null>(null)
  const [assignForm, setAssignForm] = useState<AssignForm>({
    role: 'MAIN_COACH', sessions: '1', hoursPerSession: '5', agreedRate: '', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const search = useCallback(async () => {
    setSearching(true)
    try {
      const params = new URLSearchParams({ q, limit: '20' })
      if (selectedExpertise.length) params.set('expertise', selectedExpertise.join(','))
      if (selectedRegion) params.set('region', selectedRegion)
      const res = await fetch(`/api/coaches?${params}`)
      const data = await res.json()
      setResults(data.coaches ?? [])
    } finally {
      setSearching(false)
    }
  }, [q, selectedExpertise, selectedRegion])

  function toggleExpertise(e: string) {
    setSelectedExpertise((prev) =>
      prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]
    )
  }

  function pickCoach(c: CoachResult) {
    setPicked(c)
    // 기본 단가 자동 입력
    const defaultRate = c.lectureRateMain ?? c.coachRateMain ?? 150000
    setAssignForm((p) => ({ ...p, agreedRate: defaultRate.toString() }))
  }

  async function handleAssign() {
    if (!picked) return
    setSaving(true)
    setError('')
    try {
      const totalHours = Number(assignForm.sessions) * Number(assignForm.hoursPerSession)
      const agreedRate = Number(assignForm.agreedRate)
      const totalFee = totalHours * agreedRate
      const taxRate = 0.033
      const netFee = Math.round(totalFee * (1 - taxRate))

      const res = await fetch('/api/coach-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          coachId: picked.id,
          role: assignForm.role,
          sessions: Number(assignForm.sessions),
          hoursPerSession: Number(assignForm.hoursPerSession),
          totalHours,
          agreedRate,
          totalFee,
          taxRate,
          netFee,
          notes: assignForm.notes,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? '배정 실패')
      }
      setPicked(null)
      setOpen(false)
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const totalFeePreview =
    picked && assignForm.agreedRate
      ? Number(assignForm.sessions) * Number(assignForm.hoursPerSession) * Number(assignForm.agreedRate)
      : 0

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow hover:bg-primary/90"
      >
        <UserPlus className="h-3.5 w-3.5" />
        코치 배정
      </DialogTrigger>

      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>코치 검색 및 배정</DialogTitle>
        </DialogHeader>

        <div className="flex gap-4">
          {/* 왼쪽: 검색 */}
          <div className="flex-1 space-y-3">
            {/* 검색창 */}
            <div className="flex gap-2">
              <Input
                placeholder="이름, 소속, 키워드 검색"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && search()}
                className="flex-1"
              />
              <Button onClick={search} disabled={searching} size="sm">
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>

            {/* 지역 필터 */}
            <Select value={selectedRegion} onValueChange={(v) => setSelectedRegion(v ?? '')}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="지역 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">전체 지역</SelectItem>
                {REGION_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* 전문분야 필터 */}
            <div className="flex flex-wrap gap-1">
              {EXPERTISE_OPTIONS.slice(0, 8).map((e) => (
                <button
                  key={e}
                  onClick={() => toggleExpertise(e)}
                  className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                    selectedExpertise.includes(e)
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-muted-foreground/30 text-muted-foreground hover:border-primary'
                  }`}
                >
                  {e.split('(')[0].trim()}
                </button>
              ))}
            </div>

            {/* 결과 목록 */}
            <div className="max-h-72 space-y-1.5 overflow-y-auto">
              {results.length === 0 && !searching && (
                <p className="py-6 text-center text-xs text-muted-foreground">검색어를 입력하고 Enter를 누르세요</p>
              )}
              {results.map((c) => (
                <button
                  key={c.id}
                  onClick={() => pickCoach(c)}
                  disabled={assignedCoachIds.includes(c.id)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    picked?.id === c.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50'
                  } ${assignedCoachIds.includes(c.id) ? 'opacity-40' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    {c.photoUrl ? (
                      <img src={c.photoUrl} alt={c.name} className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-bold">
                        {c.name[0]}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-sm">{c.name}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${TIER_COLOR[c.tier]}`}>
                          {TIER_LABEL[c.tier]}
                        </span>
                        {assignedCoachIds.includes(c.id) && (
                          <span className="text-[10px] text-muted-foreground">이미 배정됨</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {c.organization} · {c.position}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {c.expertise.slice(0, 3).map((e) => (
                          <span key={e} className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                            {e.split('(')[0].trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      {c.satisfactionAvg && (
                        <p className="text-xs font-medium text-amber-600">★ {c.satisfactionAvg.toFixed(1)}</p>
                      )}
                      {c.lectureRateMain && (
                        <p className="text-[10px] text-muted-foreground">{c.lectureRateMain.toLocaleString()}원/h</p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* coach-finder 링크 */}
            <a
              href={COACH_FINDER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              코치파인더에서 상세 검색
            </a>
          </div>

          {/* 오른쪽: 배정 설정 */}
          {picked && (
            <div className="w-60 shrink-0 space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{picked.name}</p>
                  <p className="text-xs text-muted-foreground">{picked.organization}</p>
                </div>
                <button onClick={() => setPicked(null)}>
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              <Separator />

              <div className="space-y-2.5">
                <div className="space-y-1">
                  <Label className="text-xs">역할</Label>
                  <Select value={assignForm.role} onValueChange={(v) => setAssignForm((p) => ({ ...p, role: v ?? p.role }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">세션 수</Label>
                    <Input type="number" min="1" className="h-8 text-xs" value={assignForm.sessions}
                      onChange={(e) => setAssignForm((p) => ({ ...p, sessions: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">세션당 시간</Label>
                    <Input type="number" min="1" className="h-8 text-xs" value={assignForm.hoursPerSession}
                      onChange={(e) => setAssignForm((p) => ({ ...p, hoursPerSession: e.target.value }))} />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">시간당 단가 (원)</Label>
                  <Input type="number" className="h-8 text-xs" value={assignForm.agreedRate}
                    onChange={(e) => setAssignForm((p) => ({ ...p, agreedRate: e.target.value }))} />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">메모</Label>
                  <Input className="h-8 text-xs" placeholder="특이사항" value={assignForm.notes}
                    onChange={(e) => setAssignForm((p) => ({ ...p, notes: e.target.value }))} />
                </div>

                {totalFeePreview > 0 && (
                  <div className="rounded-md bg-muted p-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">총 시간</span>
                      <span>{Number(assignForm.sessions) * Number(assignForm.hoursPerSession)}h</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span>사례비 합계</span>
                      <span>{totalFeePreview.toLocaleString()}원</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>세후 (3.3%)</span>
                      <span>{Math.round(totalFeePreview * 0.967).toLocaleString()}원</span>
                    </div>
                  </div>
                )}
              </div>

              {error && <p className="text-xs text-destructive">{error}</p>}

              <Button className="w-full" size="sm" onClick={handleAssign} disabled={saving || !assignForm.agreedRate}>
                {saving ? <><Loader2 className="mr-2 h-3 w-3 animate-spin" />배정 중</> : '배정 확정'}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
