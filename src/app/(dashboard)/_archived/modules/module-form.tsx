'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Loader2, Plus } from 'lucide-react'

const CATEGORY_OPTIONS = [
  { value: 'TECH_EDU', label: '기술교육' },
  { value: 'STARTUP_EDU', label: '창업교육' },
  { value: 'CAPSTONE', label: '캡스톤/해커톤' },
  { value: 'MENTORING', label: '멘토링' },
  { value: 'NETWORKING', label: '네트워킹' },
  { value: 'EVENT', label: '이벤트' },
  { value: 'ACTION_WEEK', label: 'Action Week' },
  { value: 'SPECIAL_LECTURE', label: '특강' },
]
const METHOD_OPTIONS = [
  { value: 'LECTURE', label: '강의' },
  { value: 'WORKSHOP', label: '워크숍' },
  { value: 'PRACTICE', label: '실습' },
  { value: 'MENTORING', label: '멘토링' },
  { value: 'MIXED', label: '혼합' },
  { value: 'ACTION_WEEK', label: 'Action Week' },
  { value: 'ONLINE', label: '온라인' },
]
const DIFFICULTY_OPTIONS = [
  { value: 'INTRO', label: '입문' },
  { value: 'MID', label: '중급' },
  { value: 'ADVANCED', label: '심화' },
]

function ArrayInput({ label, value, onChange, placeholder }: {
  label: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string
}) {
  const [raw, setRaw] = useState(value.join('\n'))
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Textarea
        className="h-20 text-xs"
        placeholder={placeholder ?? '줄바꿈으로 구분'}
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value)
          onChange(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))
        }}
      />
    </div>
  )
}

const DEFAULT_FORM = {
  moduleCode: '',
  name: '',
  category: 'STARTUP_EDU',
  method: 'WORKSHOP',
  durationHours: '3',
  difficulty: 'INTRO',
  keywordTags: [] as string[],
  objectives: [] as string[],
  contents: [] as string[],
  practices: [] as string[],
  equipment: [] as string[],
  outputs: [] as string[],
  targetStages: [] as string[],
  impactQ54Mapping: [] as string[],
  skills5D: [] as string[],
  acttTargets: [] as string[],
  aiRatio: '0',
  expertRatio: '100',
  isTheory: false,
  minParticipants: '5',
  maxParticipants: '50',
}

export function ModuleForm({ initialData }: { initialData?: any }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState(initialData ? {
    ...DEFAULT_FORM,
    ...initialData,
    durationHours: String(initialData.durationHours),
    aiRatio: String(initialData.aiRatio),
    expertRatio: String(initialData.expertRatio),
    minParticipants: String(initialData.minParticipants),
    maxParticipants: String(initialData.maxParticipants),
  } : DEFAULT_FORM)

  function set(key: string, val: any) {
    setForm((p: any) => ({ ...p, [key]: val }))
  }

  async function handleSave() {
    setLoading(true)
    setError('')
    try {
      const body = {
        ...form,
        durationHours: Number(form.durationHours),
        aiRatio: Number(form.aiRatio),
        expertRatio: Number(form.expertRatio),
        minParticipants: Number(form.minParticipants),
        maxParticipants: Number(form.maxParticipants),
      }
      const res = await fetch('/api/modules', {
        method: 'POST',
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
        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow hover:bg-primary/90"
      >
        <Plus className="h-3.5 w-3.5" />
        {initialData ? '수정' : '모듈 추가'}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialData ? '모듈 수정' : '새 모듈 추가'}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="basic">
          <TabsList className="w-full">
            <TabsTrigger value="basic" className="flex-1">기본 정보</TabsTrigger>
            <TabsTrigger value="content" className="flex-1">콘텐츠</TabsTrigger>
            <TabsTrigger value="impact" className="flex-1">IMPACT 매핑</TabsTrigger>
          </TabsList>

          {/* 기본 정보 */}
          <TabsContent value="basic" className="space-y-3 mt-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">모듈 코드</Label>
                <Input placeholder="MOD_STARTUP_01" value={form.moduleCode} onChange={(e) => set('moduleCode', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">모듈명</Label>
                <Input placeholder="BM 설계 워크숍" value={form.name} onChange={(e) => set('name', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">카테고리</Label>
                <Select value={form.category} onValueChange={(v) => v && set('category', v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">운영 방식</Label>
                <Select value={form.method} onValueChange={(v) => v && set('method', v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{METHOD_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">난이도</Label>
                <Select value={form.difficulty} onValueChange={(v) => v && set('difficulty', v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{DIFFICULTY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">소요 시간 (h)</Label>
                <Input type="number" min="0.5" step="0.5" value={form.durationHours} onChange={(e) => set('durationHours', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">최소 인원</Label>
                <Input type="number" value={form.minParticipants} onChange={(e) => set('minParticipants', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">최대 인원</Label>
                <Input type="number" value={form.maxParticipants} onChange={(e) => set('maxParticipants', e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.isTheory} onCheckedChange={(v) => set('isTheory', v)} />
              <Label className="text-xs">이론 위주 모듈 (Action Week 경고 적용)</Label>
            </div>
            <ArrayInput label="키워드 태그" value={form.keywordTags} onChange={(v) => set('keywordTags', v)} placeholder="BM검증&#10;아이디어검증&#10;고객인터뷰" />
            <ArrayInput label="적합 대상 단계" value={form.targetStages} onChange={(v) => set('targetStages', v)} placeholder="pre&#10;early&#10;growth" />
          </TabsContent>

          {/* 콘텐츠 */}
          <TabsContent value="content" className="space-y-3 mt-3">
            <ArrayInput label="학습 목표" value={form.objectives} onChange={(v) => set('objectives', v)} placeholder="BM 캔버스를 작성할 수 있다&#10;고객 세그먼트를 정의할 수 있다" />
            <ArrayInput label="주요 내용" value={form.contents} onChange={(v) => set('contents', v)} placeholder="BM 9 Block 이론&#10;경쟁사 분석" />
            <ArrayInput label="실습 내용" value={form.practices} onChange={(v) => set('practices', v)} placeholder="팀별 BM 작성&#10;발표 및 피드백" />
            <ArrayInput label="필요 장비" value={form.equipment} onChange={(v) => set('equipment', v)} placeholder="노트북&#10;포스트잇&#10;마커" />
            <ArrayInput label="산출물" value={form.outputs} onChange={(v) => set('outputs', v)} placeholder="BM 캔버스 1장&#10;가설 검증 계획서" />
          </TabsContent>

          {/* IMPACT 매핑 */}
          <TabsContent value="impact" className="space-y-3 mt-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">AI 담당 비율 (%)</Label>
                <Input type="number" min="0" max="100" value={form.aiRatio} onChange={(e) => set('aiRatio', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">전문가 담당 비율 (%)</Label>
                <Input type="number" min="0" max="100" value={form.expertRatio} onChange={(e) => set('expertRatio', e.target.value)} />
              </div>
            </div>
            <ArrayInput label="IMPACT 54Q 매핑" value={form.impactQ54Mapping} onChange={(v) => set('impactQ54Mapping', v)} placeholder="Q01&#10;Q12&#10;Q30" />
            <ArrayInput label="5D 타깃 스킬" value={form.skills5D} onChange={(v) => set('skills5D', v)} placeholder="문제발굴&#10;솔루션설계" />
            <ArrayInput label="ACTT 타깃 습관" value={form.acttTargets} onChange={(v) => set('acttTargets', v)} placeholder="ACTION&#10;CONTEXT" />
          </TabsContent>
        </Tabs>

        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />저장 중</> : '저장'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
