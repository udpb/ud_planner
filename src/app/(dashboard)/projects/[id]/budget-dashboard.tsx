'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { AlertTriangle, Calculator, CheckCircle2, Pencil, RefreshCw } from 'lucide-react'
import { DataFlowBanner } from '@/components/projects/data-flow-banner'
import type { CurriculumSlice, CoachesSlice } from '@/lib/pipeline-context'

interface PcItem {
  coachId: string
  coachName: string
  role: string
  payRole: string
  payGrade: string
  sessions: number
  hoursPerSession: number
  totalHours: number
  agreedRate: number
  grossFee: number
  taxRate: number
  netFee: number
  wbsCode: string
}

interface AcItem {
  id: string
  wbsCode: string
  category: string
  name: string
  unit: string
  unitPrice: number
  quantity: number
  amount: number
  isEstimated: boolean
}

interface BudgetSummary {
  pcTotal: number
  acTotal: number
  margin: number
  marginRate: number
  marginWarning: boolean
  supplyPrice: number
  totalBudgetVat: number
}

interface Props {
  projectId: string
  initialBudget: BudgetSummary | null
  initialPcItems: PcItem[]
  initialAcItems: AcItem[]
  curriculumSlice?: CurriculumSlice
  coachesSlice?: CoachesSlice
}

const ROLE_LABEL: Record<string, string> = {
  MAIN_COACH: '메인 코치', SUB_COACH: '보조 코치', LECTURER: '강사(메인)',
  SUB_LECTURER: '강사(보조)', SPECIAL_LECTURER: '특강 연사', JUDGE: '심사위원', PM_OPS: '운영 PM',
}

function fmt(n: number) {
  if (n >= 1e8) return `${(n / 1e8).toFixed(2)}억`
  if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만`
  return n.toLocaleString()
}

export function BudgetDashboard({
  projectId, initialBudget, initialPcItems, initialAcItems,
  curriculumSlice, coachesSlice,
}: Props) {
  const [budget, setBudget] = useState<BudgetSummary | null>(initialBudget)
  const [pcItems, setPcItems] = useState<PcItem[]>(initialPcItems)
  const [acItems, setAcItems] = useState<AcItem[]>(initialAcItems)
  const [calculating, setCalculating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<{ unitPrice: number; quantity: number }>({ unitPrice: 0, quantity: 0 })

  const calculate = useCallback(async () => {
    setCalculating(true)
    try {
      const res = await fetch('/api/budget/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setBudget(data.budget)
      setPcItems(data.pcItems)
      setAcItems(data.acItems)
    } finally {
      setCalculating(false)
    }
  }, [projectId])

  const saveAcEdit = useCallback(async (itemId: string) => {
    const res = await fetch('/api/budget/calculate', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, ...editValues }),
    })
    const data = await res.json()
    if (!res.ok) return
    setAcItems((prev) => prev.map((i) => i.id === itemId ? { ...i, ...editValues, amount: data.item.amount, isEstimated: false } : i))
    setBudget((prev) => prev ? { ...prev, acTotal: data.acTotal, margin: data.margin, marginRate: data.marginRate, marginWarning: data.marginRate < 10 } : prev)
    setEditingId(null)
  }, [editValues])

  if (!budget && pcItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <Calculator className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">코치 배정 후 예산을 자동 산출합니다.</p>
        <Button onClick={calculate} disabled={calculating} className="gap-2">
          {calculating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
          예산 자동 산출
        </Button>
      </div>
    )
  }

  const utilized = budget && budget.totalBudgetVat > 0
    ? Math.round((budget.supplyPrice / (budget.totalBudgetVat / 1.1)) * 100)
    : null

  // 이전 스텝 요약 배너 아이템 (Step 2·3 → Step 4)
  const sessionCount = curriculumSlice?.sessions.length ?? 0
  const totalEduHours = curriculumSlice?.sessions.reduce(
    (sum, s) => sum + (s.durationHours ?? 0),
    0,
  ) ?? 0
  const assignedCoachCount = coachesSlice?.assignments.length ?? 0
  const coachTotalFee = coachesSlice?.totalFee ?? 0
  const prevStepItems = [
    {
      label: '총 회차',
      value: sessionCount > 0 ? `${sessionCount}회` : '미작성',
      matched: sessionCount > 0,
      detail: sessionCount > 0 ? undefined : 'Step 2 커리큘럼 먼저 확정',
    },
    {
      label: '총 교육시간',
      value: totalEduHours > 0 ? `${totalEduHours.toFixed(1)}시간` : '—',
      matched: totalEduHours > 0,
    },
    {
      label: '배정 코치',
      value: assignedCoachCount > 0 ? `${assignedCoachCount}명` : '미배정',
      matched: assignedCoachCount > 0,
      detail: assignedCoachCount > 0 ? undefined : 'Step 3 코치 먼저 배정',
    },
    {
      label: '총 사례비',
      value:
        coachTotalFee > 0
          ? `${Math.round(coachTotalFee / 10000).toLocaleString()}만원`
          : '—',
      matched: coachTotalFee > 0,
    },
  ]

  return (
    <div className="space-y-4">
      {/* 이전 스텝 요약 (Step 2·3 → Step 4) */}
      <DataFlowBanner
        fromStep="Step 2·3 커리큘럼·코치"
        toStep="Step 4 예산"
        items={prevStepItems}
      />

      {/* 요약 카드 */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'PC (인건비성)', value: budget?.pcTotal ?? 0, color: 'text-foreground' },
          { label: 'AC (사업실비)', value: budget?.acTotal ?? 0, color: 'text-foreground' },
          { label: '마진', value: budget?.margin ?? 0, color: (budget?.margin ?? 0) < 0 ? 'text-destructive' : 'text-foreground' },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="py-3 px-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`mt-0.5 text-lg font-bold tabular-nums ${color}`}>{fmt(value)}원</p>
            </CardContent>
          </Card>
        ))}
        <Card className={budget?.marginWarning ? 'border-destructive/50 bg-destructive/5' : ''}>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              마진율
              {budget?.marginWarning && <AlertTriangle className="h-3 w-3 text-destructive" />}
            </p>
            <p className={`mt-0.5 text-lg font-bold tabular-nums ${budget?.marginWarning ? 'text-destructive' : 'text-green-600'}`}>
              {budget?.marginRate.toFixed(1) ?? '—'}%
            </p>
            {utilized !== null && (
              <p className="text-[10px] text-muted-foreground mt-0.5">예산 활용률 {utilized}%</p>
            )}
          </CardContent>
        </Card>
      </div>

      {budget?.marginWarning && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          마진율이 10% 미만입니다. 코치 배정 또는 직접비 항목을 조정해보세요.
        </div>
      )}

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={calculate} disabled={calculating} className="gap-1.5">
          {calculating ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          재산출
        </Button>
      </div>

      {/* PC 테이블 */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Badge variant="default" className="text-xs">PC</Badge>
            인건비성 경비
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">코치</th>
                <th className="px-4 py-2 text-left font-medium">역할</th>
                <th className="px-4 py-2 text-right font-medium">세션</th>
                <th className="px-4 py-2 text-right font-medium">시간</th>
                <th className="px-4 py-2 text-right font-medium">단가</th>
                <th className="px-4 py-2 text-right font-medium">지급 전</th>
                <th className="px-4 py-2 text-right font-medium">세후(3.3%)</th>
              </tr>
            </thead>
            <tbody>
              {pcItems.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-xs text-muted-foreground">코치 배정 후 자동 계산됩니다.</td></tr>
              ) : (
                pcItems.map((item) => (
                  <tr key={item.coachId} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-medium">{item.coachName}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{ROLE_LABEL[item.role] ?? item.role}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{item.sessions}회</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{item.totalHours}h</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{item.agreedRate.toLocaleString()}원</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{item.grossFee.toLocaleString()}원</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">{item.netFee.toLocaleString()}원</td>
                  </tr>
                ))
              )}
            </tbody>
            {pcItems.length > 0 && (
              <tfoot>
                <tr className="border-t bg-muted/20">
                  <td colSpan={5} className="px-4 py-2 text-xs text-muted-foreground">PC 소계</td>
                  <td className="px-4 py-2 text-right tabular-nums font-bold">
                    {(budget?.pcTotal ?? 0).toLocaleString()}원
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </CardContent>
      </Card>

      {/* AC 테이블 */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">AC</Badge>
            사업 실비
            <span className="ml-auto text-[10px] font-normal text-muted-foreground">항목을 클릭하면 수정할 수 있습니다.</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">카테고리</th>
                <th className="px-4 py-2 text-left font-medium">항목</th>
                <th className="px-4 py-2 text-right font-medium">단가</th>
                <th className="px-4 py-2 text-right font-medium">수량</th>
                <th className="px-4 py-2 text-right font-medium">금액</th>
                <th className="px-4 py-2 text-center font-medium w-8" />
              </tr>
            </thead>
            <tbody>
              {acItems.map((item) => (
                <tr key={item.id || item.wbsCode} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{item.category}</td>
                  <td className="px-4 py-2.5">
                    {item.name}
                    {item.isEstimated && (
                      <span className="ml-1.5 text-[10px] text-muted-foreground/60">추정</span>
                    )}
                  </td>
                  {editingId === item.id ? (
                    <>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          className="h-7 text-xs text-right"
                          value={editValues.unitPrice}
                          onChange={(e) => setEditValues((v) => ({ ...v, unitPrice: Number(e.target.value) }))}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          className="h-7 text-xs text-right"
                          value={editValues.quantity}
                          onChange={(e) => setEditValues((v) => ({ ...v, quantity: Number(e.target.value) }))}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                        {(editValues.unitPrice * editValues.quantity).toLocaleString()}원
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <Button size="sm" className="h-6 px-2 text-xs" onClick={() => saveAcEdit(item.id)}>
                          <CheckCircle2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2.5 text-right tabular-nums text-xs">{item.unitPrice.toLocaleString()}<span className="text-muted-foreground">/{item.unit}</span></td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-xs">{item.quantity}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">{item.amount.toLocaleString()}원</td>
                      <td className="px-2 py-2.5 text-center">
                        {item.id && (
                          <button
                            className="text-muted-foreground/40 hover:text-muted-foreground"
                            onClick={() => { setEditingId(item.id); setEditValues({ unitPrice: item.unitPrice, quantity: item.quantity }) }}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
            {acItems.length > 0 && (
              <tfoot>
                <tr className="border-t bg-muted/20">
                  <td colSpan={4} className="px-4 py-2 text-xs text-muted-foreground">AC 소계</td>
                  <td className="px-4 py-2 text-right tabular-nums font-bold">
                    {(budget?.acTotal ?? 0).toLocaleString()}원
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </CardContent>
      </Card>

      <Separator />

      {/* 공급가액 / 총액 요약 */}
      <div className="flex justify-end">
        <div className="space-y-1.5 text-sm w-64">
          <div className="flex justify-between text-muted-foreground">
            <span>PC + AC</span>
            <span className="tabular-nums">{((budget?.pcTotal ?? 0) + (budget?.acTotal ?? 0)).toLocaleString()}원</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>마진 ({budget?.marginRate.toFixed(1)}%)</span>
            <span className="tabular-nums">{(budget?.margin ?? 0).toLocaleString()}원</span>
          </div>
          <Separator />
          <div className="flex justify-between font-medium">
            <span>공급가액</span>
            <span className="tabular-nums">{(budget?.supplyPrice ?? 0).toLocaleString()}원</span>
          </div>
          <div className="flex justify-between text-muted-foreground text-xs">
            <span>VAT (10%)</span>
            <span className="tabular-nums">{Math.round((budget?.supplyPrice ?? 0) * 0.1).toLocaleString()}원</span>
          </div>
          <div className="flex justify-between font-bold text-base">
            <span>총 계약금액</span>
            <span className="tabular-nums">{(budget?.totalBudgetVat ?? 0).toLocaleString()}원</span>
          </div>
        </div>
      </div>
    </div>
  )
}
