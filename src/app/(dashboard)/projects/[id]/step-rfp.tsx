'use client'

import { useState, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { RfpParser } from './rfp-parser'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  ArrowRight, FileText, Save, Pencil, Check, X, AlertTriangle,
  Lightbulb, HelpCircle, Target, TrendingUp, CheckCircle2, Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AgentInterviewPanel } from '@/components/projects/agent-interview-panel'

interface ClarifyingQuestion {
  field: string
  label: string
  question: string
  severity: 'missing' | 'weak' | 'tip'
}

interface Completeness {
  score: number
  breakdown: Record<string, { score: number; max: number; label: string }>
}

interface Props {
  projectId: string
  initialParsed: any
}

export function StepRfp({ projectId, initialParsed }: Props) {
  const [parsed, setParsed] = useState<any>(initialParsed)
  const [editData, setEditData] = useState<any>(initialParsed)
  const [questions, setQuestions] = useState<ClarifyingQuestion[]>([])
  const [completeness, setCompleteness] = useState<Completeness | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false) // PM이 수정했거나 아직 저장 안 한 새 파싱
  const router = useRouter()
  const pathname = usePathname()

  const handleParsed = useCallback((p: any, q: ClarifyingQuestion[], c: Completeness) => {
    setParsed(p)
    setEditData(structuredClone(p))
    setQuestions(q)
    setCompleteness(c)
    setIsDirty(true)
    setIsEditing(false)
  }, [])

  function startEdit() {
    setEditData(structuredClone(parsed))
    setIsEditing(true)
  }

  function cancelEdit() {
    setEditData(structuredClone(parsed))
    setIsEditing(false)
  }

  function updateField(field: string, value: any) {
    setEditData((prev: any) => ({ ...prev, [field]: value }))
    setIsDirty(true)
  }

  function updateObjective(index: number, value: string) {
    setEditData((prev: any) => {
      const newObj = [...(prev.objectives ?? [])]
      newObj[index] = value
      return { ...prev, objectives: newObj }
    })
    setIsDirty(true)
  }

  function addObjective() {
    setEditData((prev: any) => ({
      ...prev,
      objectives: [...(prev.objectives ?? []), ''],
    }))
    setIsDirty(true)
  }

  function removeObjective(index: number) {
    setEditData((prev: any) => ({
      ...prev,
      objectives: (prev.objectives ?? []).filter((_: any, i: number) => i !== index),
    }))
    setIsDirty(true)
  }

  function updateEvalCriteria(index: number, field: string, value: any) {
    setEditData((prev: any) => {
      const newCriteria = [...(prev.evalCriteria ?? [])]
      newCriteria[index] = { ...newCriteria[index], [field]: value }
      return { ...prev, evalCriteria: newCriteria }
    })
    setIsDirty(true)
  }

  function updateTargetStage(stages: string[]) {
    setEditData((prev: any) => ({ ...prev, targetStage: stages }))
    setIsDirty(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/ai/parse-rfp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, parsed: editData }),
      })
      if (!res.ok) throw new Error('저장 실패')
      setParsed(editData)
      setIsDirty(false)
      setIsEditing(false)
      router.refresh()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setSaving(false)
    }
  }

  const data = isEditing ? editData : parsed
  const missingCount = questions.filter((q) => q.severity === 'missing').length
  const weakCount = questions.filter((q) => q.severity === 'weak').length
  const tipCount = questions.filter((q) => q.severity === 'tip').length

  // 평가 배점 상위 항목 분석
  const topEvalItems = data?.evalCriteria
    ? [...data.evalCriteria].sort((a: any, b: any) => b.score - a.score).slice(0, 3)
    : []

  const STAGE_OPTIONS = ['예비창업', '초기창업', 'Seed', 'Pre-A', 'Series A+', '성장기']

  return (
    <div className="space-y-4">
      {/* 완전성 스코어 + 알림 바 */}
      {completeness && isDirty && (
        <div className="flex items-center gap-4 rounded-lg border bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-800">
              파싱 결과를 확인해주세요
            </span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-amber-700">
              완전성 <span className="font-bold">{completeness.score}점</span>/100
            </span>
            {missingCount > 0 && (
              <Badge variant="destructive" className="text-xs">필수 누락 {missingCount}건</Badge>
            )}
            {weakCount > 0 && (
              <Badge variant="secondary" className="text-xs">보완 권장 {weakCount}건</Badge>
            )}
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              <Save className="h-3.5 w-3.5" />
              {saving ? '저장 중...' : '확인 후 저장'}
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Column 1: RFP 업로드 */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            RFP 업로드
          </p>
          <RfpParser
            projectId={projectId}
            initialParsed={parsed}
            onParsed={handleParsed}
          />

          {/* AI 질문 패널 */}
          {questions.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-xs font-semibold text-amber-800">
                  <HelpCircle className="h-4 w-4" />
                  AI 확인 요청 ({questions.length}건)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {questions.map((q, i) => (
                  <div
                    key={i}
                    className={cn(
                      'rounded-md border px-3 py-2 text-xs',
                      q.severity === 'missing' && 'border-red-200 bg-red-50',
                      q.severity === 'weak' && 'border-amber-200 bg-amber-50',
                      q.severity === 'tip' && 'border-blue-200 bg-blue-50',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {q.severity === 'missing' && <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-red-500" />}
                      {q.severity === 'weak' && <Info className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />}
                      {q.severity === 'tip' && <Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-blue-500" />}
                      <div>
                        <span className="font-medium">{q.label}</span>
                        <p className="mt-0.5 text-muted-foreground">{q.question}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Column 2: 파싱 결과 (편집 가능) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              파싱 결과
            </p>
            {data && !isEditing && (
              <button onClick={startEdit} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <Pencil className="h-3 w-3" /> 수정
              </button>
            )}
            {isEditing && (
              <div className="flex gap-1">
                <button onClick={cancelEdit} className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted">
                  <X className="h-3 w-3" /> 취소
                </button>
                <button onClick={() => { setParsed(editData); setIsEditing(false) }} className="flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-xs text-primary hover:bg-primary/20">
                  <Check className="h-3 w-3" /> 적용
                </button>
              </div>
            )}
          </div>

          {!data ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed text-sm text-muted-foreground">
              <FileText className="h-8 w-8 opacity-30" />
              <p>RFP를 파싱하면 여기에 결과가 표시됩니다</p>
            </div>
          ) : (
            <Card>
              <CardContent className="space-y-4 p-4">
                {/* 사업명 + 발주기관 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1 text-[11px] text-muted-foreground">사업명</p>
                    {isEditing ? (
                      <Input className="h-8 text-xs" value={data.projectName ?? ''} onChange={(e) => updateField('projectName', e.target.value)} />
                    ) : (
                      <p className="text-sm font-medium">{data.projectName || '—'}</p>
                    )}
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] text-muted-foreground">발주기관</p>
                    {isEditing ? (
                      <Input className="h-8 text-xs" value={data.client ?? ''} onChange={(e) => updateField('client', e.target.value)} />
                    ) : (
                      <p className="text-sm font-medium">{data.client || '—'}</p>
                    )}
                  </div>
                </div>

                {/* 요약 */}
                <div>
                  <p className="mb-1 text-[11px] text-muted-foreground">AI 분석 요약</p>
                  {isEditing ? (
                    <Textarea className="h-20 text-xs" value={data.summary ?? ''} onChange={(e) => updateField('summary', e.target.value)} />
                  ) : (
                    <p className="text-xs leading-relaxed text-muted-foreground">{data.summary}</p>
                  )}
                </div>

                {/* 대상 + 인원 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1 text-[11px] text-muted-foreground">교육 대상</p>
                    {isEditing ? (
                      <Input className="h-8 text-xs" value={data.targetAudience ?? ''} onChange={(e) => updateField('targetAudience', e.target.value)} />
                    ) : (
                      <p className="text-xs">{data.targetAudience || '—'}</p>
                    )}
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] text-muted-foreground">참여인원</p>
                    {isEditing ? (
                      <Input className="h-8 text-xs" type="number" value={data.targetCount ?? ''} onChange={(e) => updateField('targetCount', e.target.value ? parseInt(e.target.value) : null)} />
                    ) : (
                      <p className="text-xs">{data.targetCount ? `${data.targetCount}명` : <span className="text-red-500">미입력</span>}</p>
                    )}
                  </div>
                </div>

                {/* 창업 단계 */}
                <div>
                  <p className="mb-1.5 text-[11px] text-muted-foreground">대상 창업 단계</p>
                  {isEditing ? (
                    <div className="flex flex-wrap gap-1.5">
                      {STAGE_OPTIONS.map((s) => (
                        <button
                          key={s}
                          onClick={() => {
                            const current = data.targetStage ?? []
                            updateTargetStage(
                              current.includes(s) ? current.filter((x: string) => x !== s) : [...current, s]
                            )
                          }}
                          className={cn(
                            'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                            (data.targetStage ?? []).includes(s)
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-muted text-muted-foreground hover:border-primary/50',
                          )}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {data.targetStage?.length > 0 ? (
                        data.targetStage.map((s: string) => (
                          <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                        ))
                      ) : (
                        <span className="text-xs text-red-500">미입력</span>
                      )}
                    </div>
                  )}
                </div>

                {/* 예산 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1 text-[11px] text-muted-foreground">예산 (VAT 포함)</p>
                    {isEditing ? (
                      <Input className="h-8 text-xs" type="number" value={data.totalBudgetVat ?? ''} onChange={(e) => updateField('totalBudgetVat', e.target.value ? parseInt(e.target.value) : null)} placeholder="원 단위" />
                    ) : (
                      <p className="text-sm font-bold">
                        {data.totalBudgetVat ? `${(data.totalBudgetVat / 1e8).toFixed(2)}억` : <span className="text-red-500 font-normal text-xs">미입력</span>}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] text-muted-foreground">공급가액</p>
                    {isEditing ? (
                      <Input className="h-8 text-xs" type="number" value={data.supplyPrice ?? ''} onChange={(e) => updateField('supplyPrice', e.target.value ? parseInt(e.target.value) : null)} placeholder="원 단위" />
                    ) : (
                      <p className="text-sm font-bold">
                        {data.supplyPrice ? `${(data.supplyPrice / 1e8).toFixed(2)}억` : '—'}
                      </p>
                    )}
                  </div>
                </div>

                {/* 목표 */}
                <div>
                  <p className="mb-1.5 text-[11px] text-muted-foreground">목표</p>
                  {isEditing ? (
                    <div className="space-y-1.5">
                      {(data.objectives ?? []).map((o: string, i: number) => (
                        <div key={i} className="flex gap-1.5">
                          <Input className="h-7 flex-1 text-xs" value={o} onChange={(e) => updateObjective(i, e.target.value)} />
                          <button onClick={() => removeObjective(i)} className="shrink-0 text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      ))}
                      <button onClick={addObjective} className="text-xs text-primary hover:underline">+ 목표 추가</button>
                    </div>
                  ) : (
                    <ul className="space-y-1">
                      {(data.objectives ?? []).map((o: string, i: number) => (
                        <li key={i} className="flex gap-2 text-xs">
                          <span className="mt-0.5 shrink-0 text-primary">·</span>{o}
                        </li>
                      ))}
                      {(!data.objectives || data.objectives.length === 0) && (
                        <p className="text-xs text-red-500">미입력</p>
                      )}
                    </ul>
                  )}
                </div>

                {/* 평가항목 */}
                <div>
                  <p className="mb-1.5 text-[11px] text-muted-foreground">평가 배점</p>
                  {isEditing ? (
                    <div className="space-y-1">
                      {(data.evalCriteria ?? []).map((c: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <Input className="h-7 flex-1" value={c.item} onChange={(e) => updateEvalCriteria(i, 'item', e.target.value)} />
                          <Input className="h-7 w-16 text-center" type="number" value={c.score} onChange={(e) => updateEvalCriteria(i, 'score', parseInt(e.target.value) || 0)} />
                          <span className="text-muted-foreground">점</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {(data.evalCriteria ?? []).map((c: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span>{c.item}</span>
                          <span className="font-mono font-medium text-primary">{c.score}점</span>
                        </div>
                      ))}
                      {(!data.evalCriteria || data.evalCriteria.length === 0) && (
                        <p className="text-xs text-amber-600">평가 배점 미확인</p>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Column 3: 경쟁력 분석 + 완전성 */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            기획 가이드
          </p>

          {!data ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed text-sm text-muted-foreground">
              <Target className="h-8 w-8 opacity-30" />
              <p>파싱 후 기획 가이드가 표시됩니다</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* 완전성 점수 */}
              {completeness && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        RFP 정보 완전성
                      </span>
                      <span className={cn(
                        'text-lg font-bold',
                        completeness.score >= 80 ? 'text-green-600' :
                          completeness.score >= 50 ? 'text-amber-600' : 'text-red-600',
                      )}>
                        {completeness.score}<span className="text-xs font-normal text-muted-foreground">/100</span>
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5 pt-0">
                    {Object.entries(completeness.breakdown).map(([key, b]) => (
                      <div key={key} className="flex items-center gap-2 text-xs">
                        <span className="w-16 shrink-0 text-muted-foreground">{b.label}</span>
                        <div className="flex-1 overflow-hidden rounded-full bg-muted h-1.5">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              b.score === b.max ? 'bg-green-500' : b.score > 0 ? 'bg-amber-400' : 'bg-red-300',
                            )}
                            style={{ width: `${(b.score / b.max) * 100}%` }}
                          />
                        </div>
                        <span className="w-10 shrink-0 text-right font-mono text-muted-foreground">
                          {b.score}/{b.max}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* 경쟁력 분석: 평가 배점 전략 */}
              {topEvalItems.length > 0 && (
                <Card className="border-blue-100 bg-blue-50/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-1.5 text-xs text-blue-800">
                      <TrendingUp className="h-4 w-4" />
                      평가 배점 전략
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0">
                    {topEvalItems.map((item: any, i: number) => (
                      <div key={i} className="rounded-md border border-blue-200 bg-white px-3 py-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">{item.item}</span>
                          <Badge className={cn(
                            'text-[10px]',
                            i === 0 ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800',
                          )}>
                            {item.score}점 {i === 0 ? '최고 배점' : `${i + 1}위`}
                          </Badge>
                        </div>
                        {i === 0 && (
                          <p className="mt-1 text-[11px] text-blue-700">
                            이 항목이 가장 높은 배점입니다. 제안서에서 이 영역을 특히 강조하세요.
                          </p>
                        )}
                      </div>
                    ))}
                    <p className="text-[10px] text-muted-foreground">
                      * 평가 배점 상위 항목은 커리큘럼 설계와 제안서 작성에 자동 반영됩니다.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* 수주 전략 인터뷰 (RFP 파싱 완료 시 표시) */}
              {data && (
                <AgentInterviewPanel
                  projectId={projectId}
                  rfpText={data.summary ?? ''}
                />
              )}

              {/* 다음 스텝 */}
              {data && !isDirty && (
                <Button
                  className="w-full gap-2"
                  onClick={() => router.push(`${pathname}?step=impact`)}
                >
                  임팩트 설계로 이동
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}

              {data && isDirty && (
                <Button
                  className="w-full gap-2"
                  onClick={handleSave}
                  disabled={saving}
                >
                  <Save className="h-4 w-4" />
                  {saving ? '저장 중...' : '확인 후 저장'}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
