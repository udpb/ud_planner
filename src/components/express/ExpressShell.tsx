'use client'

/**
 * ExpressShell — Express 단일 화면 클라이언트 오케스트레이터
 * (Phase L Wave L2, ADR-011)
 *
 * 좌측 챗봇 + 우측 미리보기 + 상단 북극성 바 통합.
 * 자동 저장 (debounced) · AI 턴 호출 · RFP 업로드 통합.
 *
 * 관련: docs/architecture/express-mode.md §3.1
 */

import { useEffect, useRef, useState, useTransition, useCallback } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  ALL_SLOTS,
  SLOT_LABELS,
  calcProgress,
  type ExpressDraft,
  type SlotKey,
} from '@/lib/express/schema'
import type { ConversationState, Turn } from '@/lib/express/conversation'
import type { AssetMatch } from '@/lib/asset-registry-types'
import type { AutoCitationsBundle } from '@/lib/express/auto-citations'
import { Settings2 } from 'lucide-react'
import { NorthStarBar } from './NorthStarBar'
import { ExpressChat } from './ExpressChat'
import { ExpressPreview } from './ExpressPreview'
import { RfpUploadDialog } from './RfpUploadDialog'

interface Props {
  projectId: string
  projectName: string
  clientName: string
  hasRfp: boolean
  rfpRawPresent: boolean
  initialDraft: ExpressDraft
  initialState: ConversationState
  initialNextSlot: string | null
  initialProgress: ReturnType<typeof calcProgress>
  initialMatchedAssets: AssetMatch[]
  initialAutoCitations: AutoCitationsBundle
}

export function ExpressShell(props: Props) {
  const [draft, setDraft] = useState<ExpressDraft>(props.initialDraft)
  const [convState, setConvState] = useState<ConversationState>(props.initialState)
  const [nextSlot, setNextSlot] = useState<string | null>(props.initialNextSlot)
  const [hasRfp, setHasRfp] = useState<boolean>(props.hasRfp)
  const [matchedAssets, setMatchedAssets] = useState<AssetMatch[]>(props.initialMatchedAssets)
  const [autoCitations, setAutoCitations] = useState<AutoCitationsBundle>(
    props.initialAutoCitations,
  )
  const [pendingTurn, setPendingTurn] = useState<boolean>(false)
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  )
  const [isInitializing, setIsInitializing] = useState<boolean>(false)
  const [, startTransition] = useTransition()

  const progress = calcProgress(draft, hasRfp)

  // ─────────────────────────────────────────
  // 자동 저장 (debounced 1500ms)
  // ─────────────────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef<string>(JSON.stringify(props.initialDraft))

  const triggerAutosave = useCallback(
    (nextDraft: ExpressDraft, nextState: ConversationState) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(async () => {
        const json = JSON.stringify(nextDraft)
        if (json === lastSavedRef.current) return // 변화 없으면 skip
        setAutosaveStatus('saving')
        try {
          const r = await fetch('/api/express/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId: props.projectId,
              draft: nextDraft,
              conversationState: nextState,
              cacheTurnsLimit: 30,
            }),
          })
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          lastSavedRef.current = json
          setAutosaveStatus('saved')
          // 2초 후 idle 로 복귀
          setTimeout(() => setAutosaveStatus('idle'), 2000)
        } catch (err: unknown) {
          console.warn('[ExpressShell] autosave error:', err)
          setAutosaveStatus('error')
        }
      }, 1500)
    },
    [props.projectId],
  )

  useEffect(() => {
    triggerAutosave(draft, convState)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [draft, convState, triggerAutosave])

  // ─────────────────────────────────────────
  // RFP 없이 진입 했을 때 — RFP 업로드 우선 안내
  // ─────────────────────────────────────────
  const [showRfpDialog, setShowRfpDialog] = useState<boolean>(!hasRfp)

  // ─────────────────────────────────────────
  // RFP 파싱 완료 핸들러 (RfpUploadDialog 가 호출)
  // ─────────────────────────────────────────
  const handleRfpReady = useCallback(async () => {
    setShowRfpDialog(false)
    setHasRfp(true)
    setIsInitializing(true)
    try {
      const r = await fetch('/api/express/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: props.projectId, autoFirstTurn: true }),
      })
      if (!r.ok) throw new Error(await r.text())
      const data = await r.json()
      setDraft(data.draft)
      setConvState(data.state)
      setNextSlot(data.nextSlot)
      setMatchedAssets(data.matchedAssets ?? [])
      setAutoCitations(data.autoCitations)
      toast.success('RFP 분석 완료. 첫 질문이 나왔어요.')
    } catch (err: unknown) {
      console.error(err)
      toast.error('RFP 파싱은 완료됐지만 첫 턴 호출에 실패. 챗봇에서 직접 시작해 주세요.')
    } finally {
      setIsInitializing(false)
    }
  }, [props.projectId])

  // ─────────────────────────────────────────
  // PM 메시지 전송
  // ─────────────────────────────────────────
  const handleSendMessage = useCallback(
    async (pmInput: string, forceSlot?: string | null) => {
      if (pendingTurn) return
      setPendingTurn(true)
      try {
        const r = await fetch('/api/express/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: props.projectId,
            pmInput,
            draft,
            conversationState: convState,
            forceSlot: forceSlot ?? null,
          }),
        })
        if (!r.ok) {
          const err = await r.text()
          throw new Error(err)
        }
        const data = await r.json()
        startTransition(() => {
          setDraft(data.draft)
          setConvState(data.state)
          setNextSlot(data.nextSlot)
        })
        if (data.fellbackToPlaceholder) {
          toast.warning('AI 응답이 불안정했어요. 답을 더 짧게 또는 한 슬롯만 다뤄 보세요.')
        }
        if (data.validationErrors?.length > 0) {
          for (const v of data.validationErrors.slice(0, 2)) {
            toast.warning(`${v.slotKey}: ${v.zodIssue}`, {
              description: v.remediation,
            })
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(err)
        toast.error('AI 호출 실패: ' + msg.slice(0, 80))
      } finally {
        setPendingTurn(false)
      }
    },
    [pendingTurn, props.projectId, draft, convState],
  )

  // ─────────────────────────────────────────
  // 차별화 자산 토글 (수락/제외)
  // ─────────────────────────────────────────
  const handleToggleDiff = useCallback((assetId: string) => {
    setDraft((d) => {
      const refs = d.differentiators ?? []
      const idx = refs.findIndex((r) => r.assetId === assetId)
      if (idx < 0) return d
      const updated = [...refs]
      updated[idx] = { ...updated[idx], acceptedByPm: !updated[idx].acceptedByPm }
      return { ...d, differentiators: updated }
    })
  }, [])

  // ─────────────────────────────────────────
  // 1차본 승인
  // ─────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false)
  const handleSubmitDraft = useCallback(async () => {
    setSubmitting(true)
    try {
      const r = await fetch('/api/express/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: props.projectId,
          draft,
          conversationState: convState,
          markCompleted: true,
        }),
      })
      if (!r.ok) throw new Error(await r.text())
      toast.success('1차본 승인 완료. Deep Track 으로 정밀화하실 수 있어요.')
      setDraft((d) => ({
        ...d,
        meta: { ...d.meta, isCompleted: true, completedAt: new Date().toISOString() },
      }))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('승인 실패: ' + msg.slice(0, 80))
    } finally {
      setSubmitting(false)
    }
  }, [props.projectId, draft, convState])

  return (
    <>
      {/* RFP 업로드 모달 */}
      {showRfpDialog && (
        <RfpUploadDialog
          projectId={props.projectId}
          onReady={handleRfpReady}
          onSkip={() => setShowRfpDialog(false)}
        />
      )}

      {/* 북극성 바 */}
      <div className="sticky top-0 z-20 border-b bg-background">
        <NorthStarBar
          progress={progress}
          autosaveStatus={autosaveStatus}
          onSubmitDraft={handleSubmitDraft}
          submitting={submitting}
          isCompleted={draft.meta.isCompleted}
        />
        {/* 정밀 기획 (Deep) 분기 — 우측 끝 */}
        <div className="flex items-center justify-end border-t border-dashed bg-muted/20 px-6 py-1.5">
          <Link
            href={`/projects/${props.projectId}?step=rfp`}
            className="flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary"
            title="기존 6 step 정밀 기획 (Deep Track) — SROI·예산·코치 정밀화"
          >
            <Settings2 className="h-3 w-3" />
            정밀 기획 (Deep)
          </Link>
        </div>
      </div>

      {/* 본문 — 좌(40%) 우(60%) */}
      <div className="grid flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-[2fr_3fr]">
        {/* 좌측 챗봇 */}
        <div className="flex flex-col overflow-hidden border-r">
          <ExpressChat
            turns={convState.turns}
            currentSlot={nextSlot}
            pendingExternalLookup={convState.pendingExternalLookup}
            pendingTurn={pendingTurn || isInitializing}
            isInitializing={isInitializing}
            hasRfp={hasRfp}
            onSendMessage={handleSendMessage}
            onUploadRfp={() => setShowRfpDialog(true)}
          />
        </div>

        {/* 우측 미리보기 */}
        <div className="flex flex-col overflow-hidden">
          <ExpressPreview
            draft={draft}
            matchedAssets={matchedAssets}
            autoCitations={autoCitations}
            onToggleDiff={handleToggleDiff}
            currentSlot={nextSlot}
            projectId={props.projectId}
          />
        </div>
      </div>
    </>
  )
}
