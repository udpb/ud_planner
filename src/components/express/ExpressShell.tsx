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
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  ALL_SLOTS,
  SLOT_LABELS,
  ASSET_SECTION_TO_DRAFT,
  calcProgress,
  type ExpressDraft,
  type SlotKey,
  type SectionKey,
} from '@/lib/express/schema'
import type { ConversationState, Turn } from '@/lib/express/conversation'
import type { AssetMatch } from '@/lib/asset-registry-types'
import type { AutoCitationsBundle } from '@/lib/express/auto-citations'
import { Settings2 } from 'lucide-react'
import { NorthStarBar } from './NorthStarBar'
import { ExpressChat } from './ExpressChat'
import { ExpressPreview } from './ExpressPreview'
import { RfpUploadDialog } from './RfpUploadDialog'
import { AutoDiagnosisPanel } from '@/components/projects/auto-diagnosis-panel'
import { ChannelConfirmCard } from '@/components/projects/channel-confirm-card'
import { EvalSimulatorCard } from '@/components/projects/eval-simulator-card'
import { RenewalSeedCard } from '@/components/projects/renewal-seed-card'

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
  const router = useRouter()
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
          if (!r.ok) {
            // 검증 실패 시 응답 body 의 issues 까지 console 에 출력 (디버그)
            const errBody = await r.json().catch(() => null)
            console.warn(
              `[ExpressShell] autosave HTTP ${r.status}:`,
              errBody?.error ?? '(no error)',
              errBody?.issues ?? [],
            )
            throw new Error(`HTTP ${r.status}`)
          }
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
  // RFP 있는데 첫 턴 없으면 자동 init 호출 (2026-04-28: /new 에서 RFP 분석 후
  //   /express 로 redirect 된 케이스 — 첫 턴 자동)
  // ─────────────────────────────────────────
  const autoInitTriggeredRef = useRef(false)
  useEffect(() => {
    if (autoInitTriggeredRef.current) return
    if (!hasRfp) return
    if (convState.turns.length > 0) return
    if (isInitializing) return
    autoInitTriggeredRef.current = true
    ;(async () => {
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
        toast.success('첫 질문이 준비됐어요. 답변하시면 1차본이 채워져 나가요.')
      } catch (err: unknown) {
        console.warn('[ExpressShell] auto init failed:', err)
        toast.error('첫 턴 자동 호출 실패 — 챗봇에서 직접 시작해 주세요.')
      } finally {
        setIsInitializing(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRfp])

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
  //  + 자산 자동 인용 — acceptedByPm 변경 시 narrativeSnippet 을 sections 에 자동 주입/제거
  //    (Phase L L3: 사용자 피드백 "UD 자산이 sections 에 자연스럽게 녹아야")
  // ─────────────────────────────────────────
  const handleToggleDiff = useCallback((assetId: string) => {
    setDraft((d) => {
      const refs = d.differentiators ?? []
      const idx = refs.findIndex((r) => r.assetId === assetId)
      if (idx < 0) return d
      const wasAccepted = refs[idx].acceptedByPm
      const updated = [...refs]
      updated[idx] = { ...updated[idx], acceptedByPm: !wasAccepted }

      const ref = updated[idx]
      const sectionKey: SectionKey = ASSET_SECTION_TO_DRAFT[ref.sectionKey]
      const sections = { ...(d.sections ?? {}) }
      const tag = `[자산 인용: ${ref.assetId}]\n${ref.narrativeSnippet}`
      const existing = sections[sectionKey] ?? ''
      const fingerprint = ref.narrativeSnippet.slice(0, 60)

      if (!wasAccepted) {
        // 수락 — sections 에 narrativeSnippet 추가 (이미 인용돼 있으면 skip)
        if (!existing.includes(fingerprint)) {
          const merged = (existing ? existing + '\n\n' : '') + tag
          sections[sectionKey] = merged.slice(0, 2000)
        }
      } else {
        // 수락 취소 — 해당 자산 인용 블록 제거 (다른 자산 인용은 보존)
        const tagIdx = existing.indexOf(`[자산 인용: ${ref.assetId}]`)
        if (tagIdx >= 0) {
          // 다음 [자산 인용: 또는 끝까지 잘라냄
          const afterTag = existing.slice(tagIdx)
          const nextTagRel = afterTag.indexOf('\n\n[자산 인용: ', 1)
          const cutEnd = nextTagRel >= 0 ? tagIdx + nextTagRel : existing.length
          const before = existing.slice(0, tagIdx).replace(/\n+$/, '')
          const after = existing.slice(cutEnd).replace(/^\n+/, '')
          sections[sectionKey] = (before + (before && after ? '\n\n' : '') + after).trim()
        }
      }

      return { ...d, differentiators: updated, sections }
    })
  }, [])

  // ─────────────────────────────────────────
  // Express → Deep 인계 (1차본 승인 안 해도 정밀기획 이동 시 자동 sync)
  // ─────────────────────────────────────────
  const [handingOff, setHandingOff] = useState(false)
  const handoffToDeep = useCallback(
    async (targetStep: string) => {
      if (handingOff) return
      setHandingOff(true)
      try {
        const r = await fetch('/api/express/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: props.projectId,
            draft,
            conversationState: convState,
            handoffToDeep: true,
          }),
        })
        if (!r.ok) throw new Error(await r.text())
        const data = await r.json()
        const seeded = data.handoff?.proposalSectionsSeeded ?? 0
        const fields = data.handoff?.projectFieldsUpdated ?? 0
        toast.success(
          seeded > 0 || fields > 0
            ? `Deep 인계 완료 — Project ${fields}건 + ProposalSection ${seeded}건 sync`
            : '인계 완료 — 진행 내용이 Deep 에 반영됐어요',
        )
        // 이동 (Next.js router push)
        router.push(`/projects/${props.projectId}?step=${targetStep}`)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        toast.error('인계 실패: ' + msg.slice(0, 80))
        setHandingOff(false)
      }
    },
    [handingOff, props.projectId, draft, convState, router],
  )

  // ─────────────────────────────────────────
  // 1차본 승인 + 자동 검수 (L5)
  // ─────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false)
  const [inspectorReport, setInspectorReport] = useState<{
    passed: boolean
    overallScore: number
    issues: Array<{ severity: string; lens: string; issue: string; suggestion: string }>
    nextAction: string
  } | null>(null)

  const runInspector = useCallback(async () => {
    try {
      const r = await fetch('/api/express/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: props.projectId, draft }),
      })
      if (!r.ok) throw new Error(await r.text())
      const data = await r.json()
      setInspectorReport(data.report)
      const critical = data.report.issues.filter((i: { severity: string }) => i.severity === 'critical').length
      if (critical > 0) {
        toast.warning(`검수 결과: ${data.report.overallScore}점 — critical ${critical}건. ${data.report.nextAction}`)
      } else if (data.report.overallScore >= 80) {
        toast.success(`검수 통과 ✓ ${data.report.overallScore}점 — ${data.report.nextAction}`)
      } else {
        toast(`검수: ${data.report.overallScore}점 — ${data.report.nextAction}`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('검수 실패: ' + msg.slice(0, 80))
    }
  }, [props.projectId, draft])

  const [deepSuggestions, setDeepSuggestions] = useState<
    Array<{ targetStep: string; reason: string }>
  >([])
  const [dismissFinalize, setDismissFinalize] = useState<boolean>(false)

  const handleSubmitDraft = useCallback(async () => {
    setSubmitting(true)
    try {
      // 1) 자동 검수
      await runInspector()
      // 2) 저장 + completed (mapDraftToProjectFields + ProposalSection 시드 transaction)
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
      const data = await r.json()
      const handoff = data.handoff ?? {}
      const seededCount = handoff.proposalSectionsSeeded ?? 0
      const fieldsCount = handoff.projectFieldsUpdated ?? 0
      toast.success(
        `1차본 승인 완료 — Project ${fieldsCount}건 인계 + ProposalSection ${seededCount}건 시드`,
      )
      if (Array.isArray(handoff.deepSuggestions)) {
        setDeepSuggestions(handoff.deepSuggestions)
      }
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
  }, [props.projectId, draft, convState, runInspector])

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
        {/* 검수 + 정밀 기획 분기 — 우측 끝 */}
        <div className="flex items-center justify-end gap-2 border-t border-dashed bg-muted/20 px-6 py-1.5">
          {inspectorReport && (
            <span
              className={cn(
                'rounded-md px-2 py-0.5 text-xs',
                inspectorReport.passed
                  ? 'bg-green-100 text-green-800'
                  : 'bg-amber-100 text-amber-800',
              )}
              title={inspectorReport.nextAction}
            >
              검수 {inspectorReport.overallScore}점 · {inspectorReport.issues.length}건
            </span>
          )}
          <button
            onClick={runInspector}
            className="rounded-md border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary"
            title="현재 1차본을 평가위원 시각 7 렌즈로 검수"
          >
            검수
          </button>
          <button
            type="button"
            onClick={() => handoffToDeep('rfp')}
            disabled={handingOff}
            className="flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary disabled:opacity-50"
            title="Express 진행 내용 (의도·메시지·차별화·섹션) 을 Deep Track 으로 인계 후 이동"
          >
            <Settings2 className="h-3 w-3" />
            {handingOff ? '인계 중...' : '정밀 기획 (Deep) →'}
          </button>
        </div>
      </div>

      {/* 1차본 어느 정도 채워지면 — 다음 단계 안내 패널 (사용자 종료 의사 visible 트리거)
        - progress 50%+ 또는 isCompleted 안 한 상태 + dismiss 안 한 상태
        - markCompleted 후엔 deepSuggestions 패널이 대신 (우선)
      */}
      {progress.overall >= 50 &&
        !draft.meta.isCompleted &&
        !dismissFinalize &&
        deepSuggestions.length === 0 && (
          <div className="border-b border-primary/40 bg-gradient-to-r from-orange-50/60 via-orange-50/30 to-background px-6 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-primary">
                🎯 1차본 핵심이 채워졌어요 ({progress.overall}%) — 다음 단계:
              </span>
              <button
                type="button"
                onClick={handleSubmitDraft}
                disabled={submitting || handingOff}
                className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                title="자동 검수 + Project 필드·ProposalSection 시드 + isCompleted=true"
              >
                {submitting ? '승인 중...' : '✓ 1차본 승인 + 검수'}
              </button>
              <button
                type="button"
                onClick={() => handoffToDeep('rfp')}
                disabled={handingOff || submitting}
                className="flex items-center gap-1 rounded-md border border-primary/40 bg-background px-3 py-1 text-xs text-primary hover:bg-primary/10 disabled:opacity-50"
                title="Express 진행 내용 그대로 Deep Track 으로 인계 후 Step 1 이동"
              >
                <Settings2 className="h-3 w-3" />
                {handingOff ? '인계 중...' : '정밀 기획 (Deep) →'}
              </button>
              <button
                type="button"
                onClick={runInspector}
                className="rounded-md border bg-background px-3 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary"
                title="평가위원 시각 7 렌즈 자동 검수 (점수 + 이슈 표시)"
              >
                🔍 검수만 받기
              </button>
              <a
                href={`/api/projects/${props.projectId}/export-excel`}
                download
                className="rounded-md border bg-background px-3 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary"
                title="내부 검토용 5 시트 엑셀 (요약·커리큘럼·코치·예산·SROI)"
              >
                📥 내부 엑셀
              </a>
              <a
                href={`/api/projects/${props.projectId}/export-budget-template`}
                download
                className="rounded-md border bg-background px-3 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary"
                title="발주처 제출용 budget-template 양식 (1-1-1 주관부서 + 1-2 외부용)"
              >
                📋 발주처 템플릿
              </a>
              <button
                type="button"
                onClick={() => setDismissFinalize(true)}
                className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                title="패널 닫기 — 더 다듬을 게 있으면"
              >
                × 더 다듬기
              </button>
            </div>
          </div>
        )}

      {/* 1차본 완료 시 정밀화 추천 패널 */}
      {deepSuggestions.length > 0 && (
        <div className="border-b border-primary/30 bg-orange-50/40 px-6 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-primary">
              🎯 1차본 완성! 정밀화 권장 영역
            </span>
            {deepSuggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handoffToDeep(s.targetStep)}
                disabled={handingOff}
                className="flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs text-foreground hover:border-primary/40 hover:text-primary disabled:opacity-50"
                title={s.reason}
              >
                Step {s.targetStep} →
              </button>
            ))}
            <button
              onClick={() => setDeepSuggestions([])}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
              title="닫기"
            >
              ×
            </button>
          </div>
        </div>
      )}

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

        {/* 우측 미리보기 + AI 자동 진단 (Phase M0 ADR-013) */}
        <div className="flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {/* AI 자동 진단 + 채널 컨펌 — ExpressPreview 위에 sticky 영역으로 */}
            <div className="space-y-3 border-b bg-muted/20 p-3">
              <AutoDiagnosisPanel
                projectId={props.projectId}
                diagnosis={draft.meta.autoDiagnosis}
                onRefresh={() => router.refresh()}
                enableDeepDiagnosis={progress.overall >= 60}
              />
              <ChannelConfirmCard
                projectId={props.projectId}
                channelDiag={draft.meta.autoDiagnosis?.channel}
                intendedDepartment={draft.meta.intendedDepartment}
                onConfirmed={() => router.refresh()}
              />
              {/* M2: 채널별 분기 카드 — B2G 평가 시뮬 / renewal 시드 */}
              {draft.meta.autoDiagnosis?.channel?.confirmedByPm &&
                draft.meta.autoDiagnosis.channel.detected === 'B2G' && (
                  <EvalSimulatorCard projectId={props.projectId} />
                )}
              {draft.meta.autoDiagnosis?.channel?.confirmedByPm &&
                draft.meta.autoDiagnosis.channel.detected === 'renewal' && (
                  <RenewalSeedCard projectId={props.projectId} />
                )}
            </div>
            {/* 7 섹션 미리보기 */}
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
      </div>
    </>
  )
}
