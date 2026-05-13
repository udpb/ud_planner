'use client'

/**
 * ChannelConfirmCard — Express 2.0 채널 컨펌 카드 (Phase M0, ADR-013).
 *
 * AI 가 추론한 채널을 PM 이 확정 / 변경.
 * B2B 선택 시 추가로 intendedDepartment (목표 부서) 선택.
 *
 * 표시:
 *   - 추론된 채널 + 신뢰도 + reasoning
 *   - 3 채널 라디오 (B2G / B2B / renewal)
 *   - B2B 선택 시 4 부서 라디오 (csr / strategy / sales / tech)
 *   - "컨펌" 버튼 — /api/express/channel POST
 *
 * 사용:
 *   <ChannelConfirmCard
 *     projectId={id}
 *     channelDiag={draft.meta.autoDiagnosis?.channel}
 *     intendedDepartment={draft.meta.intendedDepartment}
 *     onConfirmed={(channel, dept) => ...}
 *   />
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Compass, Loader2, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import type { AutoDiagnosis, Channel, Department } from '@/lib/express/schema'
import { cn } from '@/lib/utils'

interface Props {
  projectId: string
  channelDiag?: AutoDiagnosis['channel']
  intendedDepartment?: Department
  onConfirmed?: (channel: Channel, intendedDepartment?: Department) => void
}

const CHANNEL_OPTIONS: { value: Channel; label: string; desc: string }[] = [
  {
    value: 'B2G',
    label: 'B2G — 정부·공공기관',
    desc: '평가배점 명시 · 공식 양식 · 사회적 가치 정량',
  },
  {
    value: 'B2B',
    label: 'B2B — 기업·재단',
    desc: '발주 부서 톤 일치 · 비즈니스 임팩트 · 단가 정당화',
  },
  {
    value: 'renewal',
    label: 'renewal — 연속·재계약',
    desc: '직전 성과 회상 → 다음 사이클 확장',
  },
]

const DEPT_OPTIONS: { value: Department; label: string; desc: string }[] = [
  { value: 'csr', label: '사회공헌·CSR', desc: '사회적 가치 · 임팩트 · 취약계층' },
  { value: 'strategy', label: '기획·전략', desc: 'MAU · 경쟁사 · 비즈니스 모델' },
  { value: 'sales', label: '영업·고객', desc: '고객 확보 · 매출 · 캠페인' },
  { value: 'tech', label: '기술·DX', desc: 'AI · 플랫폼 · 시스템 도입' },
]

export function ChannelConfirmCard({
  projectId,
  channelDiag,
  intendedDepartment: initialDept,
  onConfirmed,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [selectedChannel, setSelectedChannel] = useState<Channel>(
    channelDiag?.detected ?? 'B2B',
  )
  const [selectedDept, setSelectedDept] = useState<Department | undefined>(
    initialDept,
  )
  const [busy, setBusy] = useState(false)

  const isConfirmed = !!channelDiag?.confirmedByPm
  const detectedChanged = channelDiag && selectedChannel !== channelDiag.detected

  async function handleConfirm() {
    if (busy) return
    setBusy(true)
    try {
      const r = await fetch('/api/express/channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          channel: selectedChannel,
          intendedDepartment: selectedChannel === 'B2B' ? selectedDept : undefined,
        }),
      })
      if (!r.ok) {
        const data = await r.json().catch(() => ({}))
        throw new Error(data.message ?? data.error ?? `HTTP ${r.status}`)
      }
      toast.success(
        `채널 컨펌: ${selectedChannel}` +
          (selectedChannel === 'B2B' && selectedDept ? ` (${selectedDept})` : ''),
      )
      startTransition(() => {
        onConfirmed?.(selectedChannel, selectedDept)
        router.refresh()
      })
    } catch (err: unknown) {
      toast.error('컨펌 실패: ' + (err instanceof Error ? err.message : '알 수 없음'))
    } finally {
      setBusy(false)
    }
  }

  // 진단 결과 자체가 없으면 렌더 안 함 (AutoDiagnosisPanel 이 "지금 진단 실행" 유도)
  if (!channelDiag) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <Compass className="h-4 w-4 text-primary" />
          채널 컨펌
          {isConfirmed && !detectedChanged && (
            <Badge className="ml-auto h-5 gap-1 bg-green-100 text-[10px] text-green-800">
              <CheckCircle2 className="h-3 w-3" /> 컨펌됨
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* AI 추론 결과 */}
        <div className="rounded-md border border-dashed bg-muted/30 p-2 text-[11px] leading-relaxed">
          <div className="mb-1 flex items-center gap-1.5">
            <span className="font-medium">AI 추론:</span>
            <Badge variant="outline" className="h-4 px-1 text-[10px]">
              {channelDiag.detected}
            </Badge>
            <span className="tabular-nums text-muted-foreground">
              신뢰도 {(channelDiag.confidence * 100).toFixed(0)}%
            </span>
          </div>
          {channelDiag.reasoning.length > 0 && (
            <ul className="space-y-0.5 pl-3 text-muted-foreground">
              {channelDiag.reasoning.slice(0, 3).map((r, i) => (
                <li key={i}>• {r}</li>
              ))}
            </ul>
          )}
        </div>

        {/* 채널 선택 */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-muted-foreground">채널 선택</div>
          {CHANNEL_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={cn(
                'flex cursor-pointer items-start gap-2 rounded-md border p-2 text-xs transition-colors',
                selectedChannel === opt.value
                  ? 'border-primary/50 bg-orange-50/50'
                  : 'border-muted hover:border-primary/30 hover:bg-muted/40',
              )}
            >
              <input
                type="radio"
                name="channel"
                value={opt.value}
                checked={selectedChannel === opt.value}
                onChange={(e) => setSelectedChannel(e.target.value as Channel)}
                className="mt-0.5 accent-primary"
              />
              <div className="flex-1">
                <div className="font-medium">{opt.label}</div>
                <div className="text-[10px] text-muted-foreground">{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>

        {/* B2B 일 때 — 목표 부서 선택 */}
        {selectedChannel === 'B2B' && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-muted-foreground">
              발주 부서 (목표) — 프레임 진단의 기준
            </div>
            {DEPT_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={cn(
                  'flex cursor-pointer items-start gap-2 rounded-md border p-1.5 text-xs transition-colors',
                  selectedDept === opt.value
                    ? 'border-primary/50 bg-orange-50/50'
                    : 'border-muted hover:border-primary/30 hover:bg-muted/40',
                )}
              >
                <input
                  type="radio"
                  name="dept"
                  value={opt.value}
                  checked={selectedDept === opt.value}
                  onChange={(e) => setSelectedDept(e.target.value as Department)}
                  className="mt-0.5 accent-primary"
                />
                <div className="flex-1">
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-[10px] text-muted-foreground">{opt.desc}</div>
                </div>
              </label>
            ))}
            {!selectedDept && (
              <p className="text-[10px] text-amber-700">
                ⚠️ 부서를 선택해야 프레임 진단이 작동합니다.
              </p>
            )}
          </div>
        )}

        <Button
          size="sm"
          onClick={handleConfirm}
          disabled={busy || (selectedChannel === 'B2B' && !selectedDept)}
          className="w-full gap-2"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          {isConfirmed && !detectedChanged ? '재컨펌' : '컨펌'}
        </Button>
      </CardContent>
    </Card>
  )
}
