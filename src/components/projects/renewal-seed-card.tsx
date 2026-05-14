'use client'

/**
 * RenewalSeedCard — renewal 채널 자동 시드 카드 (Phase M2, ADR-013).
 *
 * renewal 채널일 때만 렌더. 같은 발주처 직전 프로젝트 찾아서
 * 비어있는 ExpressDraft 필드에 자동 시드 제안.
 *
 * UX:
 *   1. 마운트 시 GET /api/express/renewal-seed?projectId=...
 *   2. proposal 있으면 시드 미리보기 카드 표시
 *   3. PM "시드 적용" 버튼 → POST → router.refresh()
 */

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { History, Loader2, Sparkles, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

interface PriorProjectSummary {
  id: string
  name: string
  client: string
  status: string
  startedAt: string | null
  endedAt: string | null
  hasExpressDraft: boolean
  hasProposalSections: boolean
}

interface RenewalProposal {
  source: PriorProjectSummary
  proposedFields: {
    intent?: string
    beforeAfter?: { before?: string; after?: string }
    keyMessages?: string[]
    sections?: Record<string, string | undefined>
  }
  skippedFields: string[]
}

interface Props {
  projectId: string
}

export function RenewalSeedCard({ projectId }: Props) {
  const router = useRouter()
  const [proposal, setProposal] = useState<RenewalProposal | null>(null)
  const [prior, setPrior] = useState<PriorProjectSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [fetched, setFetched] = useState(false)
  const [appliedDone, setAppliedDone] = useState(false)

  const fetchProposal = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/express/renewal-seed?projectId=${projectId}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      setProposal(data.proposal)
      setPrior(data.prior)
      setFetched(true)
    } catch (err: unknown) {
      console.warn('[RenewalSeedCard] fetch failed', err)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchProposal()
  }, [fetchProposal])

  async function handleApply() {
    if (!proposal || applying) return
    setApplying(true)
    try {
      const r = await fetch('/api/express/renewal-seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, priorProjectId: proposal.source.id }),
      })
      if (!r.ok) {
        const data = await r.json().catch(() => ({}))
        throw new Error(data.error ?? `HTTP ${r.status}`)
      }
      const data = await r.json()
      toast.success(`renewal 시드 적용 — ${data.applied.length}개 필드`)
      setAppliedDone(true)
      router.refresh()
    } catch (err: unknown) {
      toast.error('시드 실패: ' + (err instanceof Error ? err.message : '알 수 없음'))
    } finally {
      setApplying(false)
    }
  }

  // 데이터 없음 — 직전 프로젝트 0건이면 렌더 안 함
  if (fetched && !prior) return null
  if (!loading && !proposal) return null

  // 제안할 필드 0건 (이미 다 채워진 경우) — 간단 안내만
  const proposedKeys = proposal
    ? [
        ...(proposal.proposedFields.intent ? ['intent'] : []),
        ...(proposal.proposedFields.beforeAfter?.before ? ['Before'] : []),
        ...(proposal.proposedFields.beforeAfter?.after ? ['After'] : []),
        ...(proposal.proposedFields.keyMessages ? ['keyMessages'] : []),
        ...Object.keys(proposal.proposedFields.sections ?? {}).map((k) => `sections.${k}`),
      ]
    : []

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <History className="h-4 w-4 text-primary" />
          연속 사업 자동 시드
          <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">
            renewal
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            직전 프로젝트 조회 중...
          </div>
        )}

        {!loading && prior && (
          <div className="rounded-md border bg-muted/20 p-2 text-[10px]">
            <div className="font-medium">직전 사업</div>
            <div className="mt-0.5 text-muted-foreground">
              {prior.name} · {prior.client}
            </div>
            <div className="mt-0.5 text-[9px] text-muted-foreground">
              상태: {prior.status === 'COMPLETED' ? '완료' : prior.status === 'IN_PROGRESS' ? '진행 중' : prior.status}
              {prior.endedAt && ` · ~${prior.endedAt.slice(0, 7)}`}
            </div>
          </div>
        )}

        {!loading && proposal && proposedKeys.length > 0 && !appliedDone && (
          <>
            <div className="text-[10px] text-muted-foreground">
              시드할 필드 ({proposedKeys.length})
            </div>
            <ul className="space-y-0.5 text-[10px]">
              {proposedKeys.map((k) => (
                <li key={k} className="flex items-center gap-1">
                  <Sparkles className="h-2.5 w-2.5 text-primary" />
                  {k}
                </li>
              ))}
            </ul>
            {proposal.skippedFields.length > 0 && (
              <p className="text-[9px] text-muted-foreground">
                이미 작성된 필드는 보존: {proposal.skippedFields.join(', ')}
              </p>
            )}

            {/* intent 미리보기 */}
            {proposal.proposedFields.intent && (
              <details className="rounded-md border bg-background p-1.5">
                <summary className="cursor-pointer text-[10px] font-medium">
                  intent 미리보기
                </summary>
                <p className="mt-1 text-[10px] text-muted-foreground line-clamp-3">
                  {proposal.proposedFields.intent}
                </p>
              </details>
            )}

            <Button
              size="sm"
              onClick={handleApply}
              disabled={applying}
              className="w-full gap-2"
            >
              {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {proposedKeys.length}개 필드 시드 적용
            </Button>
          </>
        )}

        {!loading && proposal && proposedKeys.length === 0 && !appliedDone && (
          <div className="rounded-md border border-dashed p-2 text-[10px] text-muted-foreground">
            모든 필드가 이미 작성됨 — 시드 불필요
          </div>
        )}

        {appliedDone && (
          <div className="flex items-center gap-1.5 rounded-md border border-green-200 bg-green-50/50 p-2 text-[10px] text-green-800">
            <CheckCircle2 className="h-3 w-3" />
            시드 완료 — 미리보기 자동 갱신
          </div>
        )}
      </CardContent>
    </Card>
  )
}
