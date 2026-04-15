'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { TrendingUp, Plus, Trash2, Download } from 'lucide-react'

interface SroiProxy {
  id: string
  country: string
  impactType: string
  subType: string
  formula: string
  proxyKrw: number
  unit: string
  contributionRate: number | null
}

interface Project {
  id: string
  name: string
  client: string
  totalBudgetVat: number | null
  kpiTargets: any
  sroiForecast: any
}

interface LineItem {
  proxyId: string
  count: number
  frequency: number
  duration: number
  deadweight: number
  attribution: number
  dropoff: number
}

function calcSroi(proxy: SroiProxy, item: LineItem): number {
  const contrib = proxy.contributionRate ?? 1
  const rawImpact = proxy.proxyKrw * item.count * item.frequency * item.duration
  const adjusted = rawImpact * contrib * (1 - item.deadweight / 100) * (item.attribution / 100) * (1 - item.dropoff / 100)
  return Math.round(adjusted)
}

export function SroiCalculator({ proxies, projects }: { proxies: SroiProxy[]; projects: Project[] }) {
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [investment, setInvestment] = useState('')
  const [lines, setLines] = useState<LineItem[]>([
    { proxyId: '', count: 30, frequency: 1, duration: 1, deadweight: 20, attribution: 80, dropoff: 10 }
  ])
  const [saving, setSaving] = useState(false)

  const selectedProject = projects.find((p) => p.id === selectedProjectId)
  if (selectedProject?.totalBudgetVat && !investment) {
    setInvestment(selectedProject.totalBudgetVat.toString())
  }

  function addLine() {
    setLines((p) => [...p, { proxyId: '', count: 30, frequency: 1, duration: 1, deadweight: 20, attribution: 80, dropoff: 10 }])
  }
  function removeLine(i: number) {
    setLines((p) => p.filter((_, idx) => idx !== i))
  }
  function updateLine(i: number, key: keyof LineItem, val: any) {
    setLines((p) => p.map((l, idx) => idx === i ? { ...l, [key]: val } : l))
  }

  const totalImpact = lines.reduce((sum, line) => {
    const proxy = proxies.find((p) => p.id === line.proxyId)
    if (!proxy || !line.proxyId) return sum
    return sum + calcSroi(proxy, line)
  }, 0)

  const investmentNum = Number(investment) || 0
  const sroiRatio = investmentNum > 0 ? totalImpact / investmentNum : 0

  // 국가별 그룹
  const countries = [...new Set(proxies.map((p) => p.country))]
  const byCountry = (country: string) => proxies.filter((p) => p.country === country)

  async function handleSave() {
    if (!selectedProjectId) return
    setSaving(true)
    try {
      await fetch(`/api/projects/${selectedProjectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sroiForecast: { totalImpact, investmentNum, sroiRatio, lines, calculatedAt: new Date().toISOString() },
        }),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* 헤더 카드 */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">SROI (사회적 투자 대비 가치 창출) 계산기</p>
              <p className="text-sm text-muted-foreground">
                투자 대비 사회적 가치를 화폐 단위로 측정합니다. SROI = 총 사회적 가치 ÷ 투자금
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-6">
        {/* 입력 패널 */}
        <div className="col-span-2 space-y-4">
          {/* 프로젝트 선택 */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">기본 설정</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">프로젝트 연결 (선택)</Label>
                <Select value={selectedProjectId} onValueChange={(v) => v && setSelectedProjectId(v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="프로젝트 선택" /></SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">총 투자금 (원)</Label>
                <Input
                  type="number"
                  className="h-8 text-xs"
                  placeholder="예: 300000000"
                  value={investment}
                  onChange={(e) => setInvestment(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* 임팩트 항목 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">임팩트 항목</CardTitle>
                <Button size="sm" variant="outline" onClick={addLine} className="h-7 gap-1 text-xs">
                  <Plus className="h-3 w-3" />항목 추가
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {lines.map((line, i) => {
                const proxy = proxies.find((p) => p.id === line.proxyId)
                const impact = proxy ? calcSroi(proxy, line) : 0
                return (
                  <div key={i} className="rounded-lg border p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">항목 {i + 1}</span>
                      <button onClick={() => removeLine(i)}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></button>
                    </div>

                    {/* 프록시 선택 */}
                    <div className="space-y-1">
                      <Label className="text-xs">임팩트 유형</Label>
                      <Select value={line.proxyId} onValueChange={(v) => v && updateLine(i, 'proxyId', v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="선택" /></SelectTrigger>
                        <SelectContent>
                          {countries.map((country) => (
                            <div key={country}>
                              <p className="px-2 py-1 text-[10px] font-medium text-muted-foreground">{country}</p>
                              {byCountry(country).map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.impactType} — {p.subType} ({(p.proxyKrw / 10000).toFixed(0)}만원/{p.unit})
                                </SelectItem>
                              ))}
                            </div>
                          ))}
                        </SelectContent>
                      </Select>
                      {proxy && <p className="text-[10px] text-muted-foreground">산정식: {proxy.formula}</p>}
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">참여 인원</Label>
                        <Input type="number" className="h-7 text-xs" value={line.count}
                          onChange={(e) => updateLine(i, 'count', Number(e.target.value))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">빈도 (회/년)</Label>
                        <Input type="number" className="h-7 text-xs" value={line.frequency}
                          onChange={(e) => updateLine(i, 'frequency', Number(e.target.value))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">기간 (년)</Label>
                        <Input type="number" className="h-7 text-xs" value={line.duration}
                          onChange={(e) => updateLine(i, 'duration', Number(e.target.value))} />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Deadweight (%)</Label>
                        <Input type="number" min="0" max="100" className="h-7 text-xs" value={line.deadweight}
                          onChange={(e) => updateLine(i, 'deadweight', Number(e.target.value))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">기여도 (%)</Label>
                        <Input type="number" min="0" max="100" className="h-7 text-xs" value={line.attribution}
                          onChange={(e) => updateLine(i, 'attribution', Number(e.target.value))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Drop-off (%)</Label>
                        <Input type="number" min="0" max="100" className="h-7 text-xs" value={line.dropoff}
                          onChange={(e) => updateLine(i, 'dropoff', Number(e.target.value))} />
                      </div>
                    </div>

                    {proxy && (
                      <div className="flex justify-end">
                        <span className="text-xs font-medium text-primary">
                          사회적 가치: {impact.toLocaleString()}원
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>

        {/* 결과 패널 */}
        <div className="space-y-4">
          <Card className="sticky top-0">
            <CardHeader className="pb-3"><CardTitle className="text-sm">SROI 결과</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center">
                <p className="text-4xl font-bold text-primary">
                  {sroiRatio > 0 ? `${sroiRatio.toFixed(2)}x` : '—'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">SROI 비율</p>
                {sroiRatio >= 2 && (
                  <Badge className="mt-2 bg-green-100 text-green-800">우수 (2배 이상)</Badge>
                )}
              </div>

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">총 사회적 가치</span>
                  <span className="font-medium">{(totalImpact / 1e8).toFixed(2)}억원</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">투자금</span>
                  <span>{investmentNum > 0 ? `${(investmentNum / 1e8).toFixed(2)}억원` : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">임팩트 항목</span>
                  <span>{lines.filter((l) => l.proxyId).length}개</span>
                </div>
              </div>

              <Separator />

              {/* 항목별 분해 */}
              <div className="space-y-1.5">
                {lines.map((line, i) => {
                  const proxy = proxies.find((p) => p.id === line.proxyId)
                  if (!proxy) return null
                  const impact = calcSroi(proxy, line)
                  const pct = totalImpact > 0 ? (impact / totalImpact) * 100 : 0
                  return (
                    <div key={i} className="space-y-0.5">
                      <div className="flex justify-between text-xs">
                        <span className="truncate text-muted-foreground max-w-[120px]">{proxy.subType}</span>
                        <span>{pct.toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted">
                        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>

              {selectedProjectId && (
                <Button size="sm" className="w-full gap-1.5" onClick={handleSave} disabled={saving}>
                  {saving ? '저장 중...' : '프로젝트에 저장'}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
