'use client'

/**
 * RiskMitigationCard — Wave U / U5 (2026-05-19)
 *
 * S3: 평가위원이 의심할 수 있는 risk + PM 의 능동 답변.
 *
 * "평가위원이 의심할 수 있는 위험을 미리 답변" — 신뢰도의 핵심.
 *
 * UI:
 *   - severity 별 색상 (critical / major / minor)
 *   - PM 직접 추가 + AI 제안 분기 (source 표시)
 *   - AI 제안 수락 / 거절 토글
 *   - 인라인 편집
 *
 * 데이터: draft.risks[] — ExpressDraftSchema.risks (Wave U / U5 추가)
 */

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Shield,
  AlertTriangle,
  AlertCircle,
  Info,
  Plus,
  X,
  Check,
  Sparkles,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import type { RiskMitigation } from '@/lib/express/schema'

const SEVERITY_META: Record<
  RiskMitigation['severity'],
  { label: string; icon: React.ReactNode; tone: string; bg: string; border: string }
> = {
  critical: {
    label: 'Critical',
    icon: <AlertCircle className="h-3 w-3" />,
    tone: 'text-red-700',
    bg: 'bg-red-50/60',
    border: 'border-red-300',
  },
  major: {
    label: 'Major',
    icon: <AlertTriangle className="h-3 w-3" />,
    tone: 'text-amber-700',
    bg: 'bg-amber-50/60',
    border: 'border-amber-300',
  },
  minor: {
    label: 'Minor',
    icon: <Info className="h-3 w-3" />,
    tone: 'text-muted-foreground',
    bg: 'bg-muted/40',
    border: 'border-muted',
  },
}

interface Props {
  projectId: string
  risks: RiskMitigation[]
  onChange: (next: RiskMitigation[]) => void
}

export function RiskMitigationCard({ projectId, risks, onChange }: Props) {
  const [addOpen, setAddOpen] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const accepted = risks.filter((r) => r.acceptedByPm).length
  const aiSuggested = risks.filter((r) => r.source === 'ai-suggested').length

  async function requestAiSuggestions() {
    if (suggesting) return
    setSuggesting(true)
    try {
      const r = await fetch('/api/express/suggest-risks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      if (!r.ok) throw new Error(await r.text())
      const data = (await r.json()) as { suggestions: RiskMitigation[] }
      if (!Array.isArray(data.suggestions) || data.suggestions.length === 0) {
        toast.info('AI 가 risk 를 발견하지 못했습니다 — 1차본 더 채워보세요')
        return
      }
      // 기존 risk 와 중복 제거 (risk 본문 substring 일치로 단순화)
      const merged = [...risks]
      for (const s of data.suggestions) {
        const dup = merged.some(
          (r) => r.risk.slice(0, 40) === s.risk.slice(0, 40),
        )
        if (!dup) merged.push({ ...s, source: 'ai-suggested', acceptedByPm: false })
      }
      onChange(merged)
      toast.success(`AI risk 제안 ${data.suggestions.length}건 추가 — 수락/거절 결정`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('AI risk 제안 실패: ' + msg.slice(0, 80))
    } finally {
      setSuggesting(false)
    }
  }

  function addRisk(item: RiskMitigation) {
    onChange([...risks, item])
    setAddOpen(false)
  }

  function updateRisk(index: number, patch: Partial<RiskMitigation>) {
    onChange(risks.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function removeRisk(index: number) {
    onChange(risks.filter((_, i) => i !== index))
  }

  return (
    <Card className="border-l-4 border-l-[color:var(--primary-orange)]/60">
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Shield className="h-4 w-4 text-[color:var(--primary-orange)]" />
          Risk Mitigation
          <Badge variant="outline" className="ml-1 text-xs">
            {accepted} / {risks.length}
          </Badge>
          {aiSuggested > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] border-[color:var(--cyan)]/40 text-[color:var(--cyan)]"
            >
              AI 제안 {aiSuggested}건
            </Badge>
          )}
        </CardTitle>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-[11px]"
            onClick={requestAiSuggestions}
            disabled={suggesting}
            title="AI 가 1차본을 보고 평가위원 의심 포인트 3~5건 제안"
          >
            {suggesting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            AI 제안
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-[11px]"
            onClick={() => setAddOpen((o) => !o)}
          >
            <Plus className="h-3 w-3" />
            추가
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {risks.length === 0 && !addOpen && (
          <div className=" border border-dashed p-3 text-xs text-muted-foreground">
            평가위원이 의심할 수 있는 위험을 PM 이 능동적으로 답변합니다.
            <br />
            예: "신규 프로그램 운영 경험 부족 → 검증된 6개 협력 코치 풀 + 운영 매뉴얼 v2 보유"
          </div>
        )}

        {risks.map((r, i) => {
          const meta = SEVERITY_META[r.severity]
          return (
            <div
              key={i}
              className={cn(' border p-2.5 text-xs', meta.bg, meta.border)}
            >
              <div className="flex items-start gap-2">
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1 border px-1.5 py-0.5 text-[10px] font-medium',
                    meta.tone,
                    meta.border,
                  )}
                >
                  {meta.icon}
                  {meta.label}
                </span>
                <div className="flex-1 space-y-1">
                  <div className="font-medium leading-snug">
                    의심: {r.risk}
                  </div>
                  <div className="text-foreground/80 leading-relaxed">
                    답변: {r.mitigation}
                  </div>
                  {r.source === 'ai-suggested' && (
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-[color:var(--cyan)]">
                      <Sparkles className="h-2.5 w-2.5" />
                      AI 제안
                      {!r.acceptedByPm && (
                        <button
                          type="button"
                          onClick={() => updateRisk(i, { acceptedByPm: true })}
                          className="ml-1 border border-[color:var(--green)]/40 px-1 text-[10px] text-[color:var(--green)] hover:bg-[color:var(--green)]/10"
                        >
                          <Check className="h-2.5 w-2.5" /> 수락
                        </button>
                      )}
                      {r.acceptedByPm && <span className="ml-1">· ✓ 수락됨</span>}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeRisk(i)}
                  className="text-muted-foreground hover:text-destructive"
                  title="삭제"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )
        })}

        {addOpen && (
          <AddRiskForm
            onAdd={addRisk}
            onCancel={() => setAddOpen(false)}
          />
        )}
      </CardContent>
    </Card>
  )
}

function AddRiskForm({
  onAdd,
  onCancel,
}: {
  onAdd: (item: RiskMitigation) => void
  onCancel: () => void
}) {
  const [risk, setRisk] = useState('')
  const [mitigation, setMitigation] = useState('')
  const [severity, setSeverity] = useState<RiskMitigation['severity']>('major')

  function handleAdd() {
    if (risk.trim().length < 10) {
      toast.error('risk 는 최소 10자')
      return
    }
    if (mitigation.trim().length < 20) {
      toast.error('완화 방안은 최소 20자')
      return
    }
    onAdd({
      risk: risk.trim(),
      mitigation: mitigation.trim(),
      severity,
      source: 'pm-direct',
      acceptedByPm: true,
    })
    setRisk('')
    setMitigation('')
  }

  return (
    <div className=" border border-dashed bg-background p-2.5 text-xs space-y-2">
      <div>
        <label className="block text-[10px] font-medium text-muted-foreground">
          평가위원 의심 포인트 (한 문장)
        </label>
        <Textarea
          value={risk}
          onChange={(e) => setRisk(e.target.value)}
          placeholder={`예: "신규 프로그램이라 운영 경험이 없지 않나?"`}
          rows={2}
          className="mt-0.5 text-xs"
        />
      </div>
      <div>
        <label className="block text-[10px] font-medium text-muted-foreground">
          PM 의 답변 (완화 방안)
        </label>
        <Textarea
          value={mitigation}
          onChange={(e) => setMitigation(e.target.value)}
          placeholder={`예: "유사 6개 사업 운영 실적 + 검증된 IMPACT 18 모듈 + 매뉴얼 v2"`}
          rows={2}
          className="mt-0.5 text-xs"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-muted-foreground">심각도</label>
        <select
          value={severity}
          onChange={(e) =>
            setSeverity(e.target.value as RiskMitigation['severity'])
          }
          className=" border bg-background px-2 py-1 text-xs"
        >
          <option value="critical">Critical (사업 자체 흔드는)</option>
          <option value="major">Major (수행 품질 저하)</option>
          <option value="minor">Minor (부분 영향)</option>
        </select>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" onClick={onCancel} className="h-7 text-[11px]">
            취소
          </Button>
          <Button size="sm" onClick={handleAdd} className="h-7 text-[11px]">
            추가
          </Button>
        </div>
      </div>
    </div>
  )
}
