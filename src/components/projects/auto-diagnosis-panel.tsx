'use client'

/**
 * AutoDiagnosisPanel — Express 2.0 자동 진단 결과 표시 (Phase M0, ADR-013).
 *
 * 4 진단 결과 (채널 / 프레임 / 논리 / 팩트) 를 한 카드로 통합.
 * 각 진단은 pass / warn / fail 신호로 표시.
 *
 * 사용:
 *   <AutoDiagnosisPanel
 *     diagnosis={draft.meta.autoDiagnosis}
 *     onConfirmChannel={() => ...}
 *     onJumpToFix={() => ...}
 *   />
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Bot, CheckCircle2, AlertTriangle, XCircle, Loader2, Sparkles, GitBranch, FileSearch } from 'lucide-react'
import { toast } from 'sonner'
import type { AutoDiagnosis, Channel, Department } from '@/lib/express/schema'
import { cn } from '@/lib/utils'

interface Props {
  projectId: string
  diagnosis?: AutoDiagnosis
  /** 진단 결과 없을 때 PM 이 "지금 진단 실행" 버튼 누르면 호출 */
  onRefresh?: () => void
  /** 1차본 조립 단계인지 — true 면 logic-chain + fact-check 도 자동 포함 */
  enableDeepDiagnosis?: boolean
}

const CHANNEL_LABEL: Record<Channel, string> = {
  B2G: '정부·공공기관',
  B2B: '기업·재단',
  renewal: '연속·재계약',
}

const DEPT_LABEL: Record<Department, string> = {
  csr: '사회공헌·CSR',
  strategy: '기획·전략',
  sales: '영업·고객',
  tech: '기술·DX',
}

export function AutoDiagnosisPanel({ projectId, diagnosis, onRefresh, enableDeepDiagnosis = false }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [, startTransition] = useTransition()

  const channelDiag = diagnosis?.channel
  const framingDiag = diagnosis?.framing
  const logicDiag = diagnosis?.logicChain
  const factDiag = diagnosis?.factCheck

  async function runDiagnose(kinds: Array<'channel' | 'framing' | 'logic-chain' | 'fact-check'> = ['channel', 'framing']) {
    if (busy) return
    setBusy(true)
    try {
      const r = await fetch('/api/express/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, kinds }),
      })
      if (!r.ok) {
        const data = await r.json().catch(() => ({}))
        throw new Error(data.message ?? data.error ?? `HTTP ${r.status}`)
      }
      toast.success('AI 자동 진단 완료')
      startTransition(() => {
        onRefresh?.()
        router.refresh()
      })
    } catch (err: unknown) {
      toast.error('진단 실패: ' + (err instanceof Error ? err.message : '알 수 없음'))
    } finally {
      setBusy(false)
    }
  }

  if (!diagnosis || (!channelDiag && !framingDiag && !logicDiag && !factDiag)) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <Bot className="h-4 w-4 text-primary" />
            AI 자동 진단
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">
            RFP + 제안서 도입부를 AI 가 분석하여 채널·프레임·논리·팩트를 자동 진단합니다.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => runDiagnose(enableDeepDiagnosis
              ? ['channel', 'framing', 'logic-chain', 'fact-check']
              : ['channel', 'framing'])}
            disabled={busy}
            className="w-full gap-2"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            지금 진단 실행
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <Bot className="h-4 w-4 text-primary" />
          AI 자동 진단
        </CardTitle>
        <button
          onClick={() => runDiagnose(enableDeepDiagnosis
            ? ['channel', 'framing', 'logic-chain', 'fact-check']
            : ['channel', 'framing'])}
          disabled={busy}
          className="text-[10px] text-muted-foreground hover:text-primary disabled:opacity-50"
        >
          {busy ? '진단 중...' : '↻ 다시'}
        </button>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* 1. 채널 진단 */}
        {channelDiag && (
          <div
            className={cn(
              'rounded-md border p-2',
              channelDiag.confirmedByPm
                ? 'border-green-200 bg-green-50/50'
                : 'border-amber-200 bg-amber-50/50',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs">
                {channelDiag.confirmedByPm ? (
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                ) : (
                  <AlertTriangle className="h-3 w-3 text-amber-600" />
                )}
                <span className="font-medium">채널</span>
                <Badge variant="outline" className="h-4 px-1 text-[10px]">
                  {CHANNEL_LABEL[channelDiag.detected]}
                </Badge>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {(channelDiag.confidence * 100).toFixed(0)}%
              </span>
            </div>
            {!channelDiag.confirmedByPm && (
              <p className="mt-1 text-[10px] text-amber-700">
                ⚠️ PM 컨펌 필요 — 상단 채널 선택 카드 확인
              </p>
            )}
          </div>
        )}

        {/* 2. 프레임 진단 */}
        {framingDiag && (
          <div
            className={cn(
              'rounded-md border p-2',
              framingDiag.match
                ? 'border-green-200 bg-green-50/50'
                : 'border-red-200 bg-red-50/50',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs">
                {framingDiag.match ? (
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                ) : (
                  <XCircle className="h-3 w-3 text-red-600" />
                )}
                <span className="font-medium">프레임</span>
                <Badge variant="outline" className="h-4 px-1 text-[10px]">
                  {DEPT_LABEL[framingDiag.detected]}
                </Badge>
              </div>
            </div>
            {!framingDiag.match && framingDiag.intendedDepartment && (
              <p className="mt-1 text-[10px] text-red-700">
                ⚠️ 목표 [{DEPT_LABEL[framingDiag.intendedDepartment]}] 와 다른 톤 감지
              </p>
            )}
            {framingDiag.evidence.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
                  근거 보기 ({framingDiag.evidence.length})
                </summary>
                <ul className="mt-1 space-y-0.5 pl-3 text-[10px] text-muted-foreground">
                  {framingDiag.evidence.slice(0, 3).map((e, i) => (
                    <li key={i}>• {e}</li>
                  ))}
                </ul>
              </details>
            )}
            {framingDiag.suggestion && (
              <div className="mt-1.5 rounded bg-white/60 p-1.5 text-[10px] leading-snug">
                <span className="font-medium text-primary">💡 수정 제안:</span>{' '}
                {framingDiag.suggestion}
              </div>
            )}
          </div>
        )}

        {/* 3. 논리 흐름 진단 */}
        {logicDiag ? (
          <div
            className={cn(
              'rounded-md border p-2',
              logicDiag.passed
                ? 'border-green-200 bg-green-50/50'
                : 'border-amber-200 bg-amber-50/50',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs">
                {logicDiag.passed ? (
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                ) : (
                  <GitBranch className="h-3 w-3 text-amber-600" />
                )}
                <span className="font-medium">논리 흐름</span>
                <Badge variant="outline" className="h-4 px-1 text-[10px]">
                  {logicDiag.channel}
                </Badge>
              </div>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {logicDiag.passedSteps}/{logicDiag.totalSteps}
              </span>
            </div>
            {!logicDiag.passed && logicDiag.breakpoints.length > 0 && (
              <details className="mt-1" open>
                <summary className="cursor-pointer text-[10px] text-amber-700 hover:text-foreground">
                  ⚠️ 끊김 {logicDiag.breakpoints.length}건
                </summary>
                <ul className="mt-1 space-y-1 pl-1 text-[10px]">
                  {logicDiag.breakpoints.slice(0, 4).map((bp, i) => (
                    <li
                      key={i}
                      className="rounded bg-white/60 p-1.5"
                      title={bp.reason}
                    >
                      <div className="font-medium text-amber-900">
                        · {bp.stepLabel}
                        {bp.affectedSections.length > 0 && (
                          <span className="ml-1 text-muted-foreground">
                            (섹션 {bp.affectedSections.join('·')})
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-muted-foreground line-clamp-2">
                        {bp.reason}
                      </div>
                      <div className="mt-0.5 text-primary">💡 {bp.suggestion}</div>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ) : (
          <button
            onClick={() => runDiagnose(['logic-chain'])}
            disabled={busy}
            className="flex w-full items-center justify-between gap-1.5 rounded-md border border-dashed border-muted-foreground/30 p-2 text-[10px] text-muted-foreground hover:border-primary/40 hover:text-primary disabled:opacity-50"
          >
            <span className="flex items-center gap-1.5">
              <GitBranch className="h-3 w-3" />
              논리 흐름 — 1차본 sections 채운 후 클릭
            </span>
            <span className="text-primary">진단 →</span>
          </button>
        )}

        {/* 4. 팩트체크 */}
        {factDiag ? (
          <div
            className={cn(
              'rounded-md border p-2',
              factDiag.byStatus.suspicious === 0 && factDiag.byStatus['needs-source'] <= 2
                ? 'border-green-200 bg-green-50/50'
                : factDiag.byStatus.suspicious > 0
                  ? 'border-red-200 bg-red-50/50'
                  : 'border-amber-200 bg-amber-50/50',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs">
                <FileSearch className="h-3 w-3 text-primary" />
                <span className="font-medium">팩트체크</span>
                <Badge variant="outline" className="h-4 px-1 text-[10px]">
                  {factDiag.totalFacts} 건
                </Badge>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {factDiag.mode === 'ai+regex' ? 'AI+정규식' : '정규식'}
              </span>
            </div>
            <div className="mt-1.5 grid grid-cols-5 gap-1 text-[9px]">
              <FactStatusChip n={factDiag.byStatus.verified} label="검증" color="green" />
              <FactStatusChip n={factDiag.byStatus['needs-source']} label="출처" color="amber" />
              <FactStatusChip n={factDiag.byStatus.suspicious} label="의심" color="red" />
              <FactStatusChip n={factDiag.byStatus.unverifiable} label="자체" color="gray" />
              <FactStatusChip n={factDiag.byStatus.outdated} label="구식" color="amber" />
            </div>
            {(factDiag.byStatus.suspicious > 0 || factDiag.byStatus['needs-source'] >= 3) && (
              <details className="mt-1.5">
                <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
                  의심·출처필요 항목
                </summary>
                <ul className="mt-1 space-y-0.5 pl-1 text-[10px]">
                  {factDiag.facts
                    .filter((f) => f.status === 'suspicious' || f.status === 'needs-source')
                    .slice(0, 5)
                    .map((f, i) => (
                      <li
                        key={i}
                        className={cn(
                          'rounded p-1',
                          f.status === 'suspicious' ? 'bg-red-50' : 'bg-amber-50',
                        )}
                        title={f.note ?? f.excerpt}
                      >
                        <span className="font-medium">{f.match}</span>
                        <span className="ml-1 text-[9px] text-muted-foreground">
                          ({f.source})
                        </span>
                        {f.note && (
                          <div className="mt-0.5 text-[9px] text-muted-foreground line-clamp-1">
                            {f.note}
                          </div>
                        )}
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </div>
        ) : (
          <button
            onClick={() => runDiagnose(['fact-check'])}
            disabled={busy}
            className="flex w-full items-center justify-between gap-1.5 rounded-md border border-dashed border-muted-foreground/30 p-2 text-[10px] text-muted-foreground hover:border-primary/40 hover:text-primary disabled:opacity-50"
          >
            <span className="flex items-center gap-1.5">
              <FileSearch className="h-3 w-3" />
              팩트체크 — 정량 수치·인용 추출 후 검증
            </span>
            <span className="text-primary">진단 →</span>
          </button>
        )}
      </CardContent>
    </Card>
  )
}

function FactStatusChip({
  n,
  label,
  color,
}: {
  n: number
  label: string
  color: 'green' | 'amber' | 'red' | 'gray'
}) {
  const colorClass = {
    green: 'bg-green-100 text-green-800',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-800',
    gray: 'bg-gray-100 text-gray-700',
  }[color]
  return (
    <div
      className={cn(
        'rounded px-1 py-0.5 text-center tabular-nums',
        n === 0 ? 'bg-muted/30 text-muted-foreground' : colorClass,
      )}
    >
      <div className="font-semibold">{n}</div>
      <div className="text-[8px]">{label}</div>
    </div>
  )
}
