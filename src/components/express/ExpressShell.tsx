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
import { ExpressChat, type ExpressChatHandle } from './ExpressChat'
import { ExpressPreview } from './ExpressPreview'
import { RfpUploadDialog } from './RfpUploadDialog'
import { AutoDiagnosisPanel } from '@/components/projects/auto-diagnosis-panel'
import { ChannelConfirmCard } from '@/components/projects/channel-confirm-card'
import { EvalSimulatorCard } from '@/components/projects/eval-simulator-card'
import { RenewalSeedCard } from '@/components/projects/renewal-seed-card'
import { ClientDocUploadCard } from '@/components/projects/client-doc-upload-card'
import { PersistentErrorBanner, type PersistentError } from '@/components/ui/persistent-error-banner'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  InspectorReportCard,
  type AssetRecommendationUI,
} from '@/components/projects/inspector-report-card'
import type { StrategicNotes } from '@/lib/ai/strategic-notes'

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
  initialClientDoc?: StrategicNotes['clientOfficialDoc']
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

  // Wave 1 #12: persistent error 영구 표시 (toast 가 사라지면 안 되는 케이스)
  const [persistentErrors, setPersistentErrors] = useState<PersistentError[]>([])
  const consecutiveSaveFailRef = useRef<number>(0)

  // Wave 4 #10: 모바일 view switcher — 채팅/미리보기/사이드바 中 하나만 표시
  // 데스크탑 (lg+) 에선 모두 동시 표시 (CSS 로 mobile 만 한정).
  const [mobileView, setMobileView] = useState<'chat' | 'preview' | 'sidebar'>('chat')

  const dismissError = useCallback((id: string) => {
    setPersistentErrors((es) => es.filter((e) => e.id !== id))
  }, [])

  const addOrReplaceError = useCallback((err: PersistentError) => {
    setPersistentErrors((es) => {
      const without = es.filter((e) => e.id !== err.id)
      return [...without, err]
    })
  }, [])

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
          consecutiveSaveFailRef.current = 0
          // 자동 저장 복구 — banner 가 있었다면 제거
          dismissError('autosave-fail')
          // 2초 후 idle 로 복귀
          setTimeout(() => setAutosaveStatus('idle'), 2000)
        } catch (err: unknown) {
          console.warn('[ExpressShell] autosave error:', err)
          consecutiveSaveFailRef.current += 1
          // 3회 연속 실패 시 영구 배너 (toast 만으로는 PM 이 놓침)
          if (consecutiveSaveFailRef.current >= 3) {
            addOrReplaceError({
              id: 'autosave-fail',
              severity: 'critical',
              title: '자동 저장 실패 (3회 연속)',
              message:
                '네트워크·세션 만료·DB 문제일 수 있습니다. 페이지를 새로고침 하거나, 작성한 내용을 별도 텍스트로 백업한 뒤 다시 시도해주세요.',
              action: {
                label: '페이지 새로고침',
                onClick: () => router.refresh(),
              },
            })
          }
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
    lensScores?: Record<string, number>
    issues: Array<{
      severity: 'critical' | 'major' | 'minor'
      lens: string
      sectionKey?: string
      issue: string
      suggestion: string
    }>
    strengths?: string[]
    nextAction: string
    weightedByChannel?: 'B2G' | 'B2B' | 'renewal'
  } | null>(null)
  // Wave N1 — Inspector 가 약점 lens 별로 추천한 자산 카드
  const [inspectorRecommendations, setInspectorRecommendations] = useState<
    AssetRecommendationUI[]
  >([])
  // ExpressChat textarea 에 외부에서 텍스트 주입할 때 사용
  const chatRef = useRef<ExpressChatHandle>(null)

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
      setInspectorRecommendations(
        Array.isArray(data.recommendations) ? data.recommendations : [],
      )
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

  // Wave M4 — 1차본 승인 시 자동 생성된 사전 임팩트 리포트
  const [impactForecast, setImpactForecast] = useState<{
    id: string
    totalSocialValue: number
    calibration: string
  } | null>(null)

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
      // Wave M4 — 사전 임팩트 리포트 자동 생성 결과
      if (data.impactForecast) {
        setImpactForecast({
          id: data.impactForecast.id,
          totalSocialValue: Number(data.impactForecast.totalSocialValue),
          calibration: data.impactForecast.calibration,
        })
        toast.success(
          `📊 사전 임팩트 리포트 생성 — 사회적 가치 ${(Number(data.impactForecast.totalSocialValue) / 1_000_000).toFixed(1)}백만원`,
          { duration: 6000 },
        )
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

      {/* Wave 1 #12: 영구 에러 배너 — 자동 저장 실패 등 toast 가 사라지면 안 되는 케이스 */}
      {persistentErrors.length > 0 && (
        <PersistentErrorBanner
          errors={persistentErrors}
          onDismiss={dismissError}
          className="px-6 py-2"
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
        {/* Wave 2.5 — 상단 status only (액션 버튼은 아래 단일 패널로 통합) */}
        {inspectorReport && (
          <div className="flex items-center justify-end gap-2 border-t border-dashed bg-muted/20 px-6 py-1.5">
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
          </div>
        )}
      </div>

      {/* Wave 2 #5: 검수 결과 상세 카드 — inspectorReport 있을 때만 */}
      {inspectorReport && (
        <div className="border-b bg-muted/10 px-6 py-3">
          <InspectorReportCard
            report={inspectorReport}
            onDismiss={() => {
              setInspectorReport(null)
              setInspectorRecommendations([])
            }}
            draftProgress={progress.overall}
            recommendations={inspectorRecommendations}
            onInsertAsset={(asset) => {
              // textarea 에 narrativeSnippet 박고 + 사용 이력 기록 (fire & forget)
              chatRef.current?.injectInput(
                `[자산 인용 — ${asset.name}] ${asset.narrativeSnippet}`,
                { append: true },
              )
              toast.success(`"${asset.name}" 을 챗봇 입력에 박았습니다 — 손보고 전송하세요`)
              // 사용 이력 비동기 기록 (에러 무시)
              fetch('/api/express/asset-usage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  projectId: props.projectId,
                  assetId: asset.assetId,
                  surface: 'express',
                  notes: `inspector-recommend lens=${asset.lens}`,
                }),
              }).catch(() => {})
            }}
          />
        </div>
      )}

      {/* Wave 2.5: 다음 단계 안내 패널 — 항상 표시 (progress 따라 활성/비활성)
        - 액션 hub: 1차본 승인 / 정밀 기획 / 검수만 / 마크다운 / 엑셀 / 발주처 템플릿
        - 50% 미만 시 1차본 승인 버튼 disabled + 라벨 변경
        - markCompleted 후엔 deepSuggestions 패널이 대신 (우선)
      */}
      {!draft.meta.isCompleted &&
        !dismissFinalize &&
        deepSuggestions.length === 0 && (
          <div
            className={cn(
              'border-b px-3 py-2 sm:px-6 sm:py-3',
              progress.overall >= 50
                ? 'border-primary/40 bg-gradient-to-r from-orange-50/60 via-orange-50/30 to-background'
                : 'border-muted bg-muted/20',
            )}
          >
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span
                className={cn(
                  'w-full text-xs font-semibold sm:w-auto sm:text-sm',
                  progress.overall >= 50 ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {progress.overall >= 50
                  ? `🎯 1차본 ${progress.overall}% — 다음 단계:`
                  : `⏳ 1차본 ${progress.overall}% — 더 채우거나 지금 받기:`}
              </span>
              <button
                type="button"
                onClick={handleSubmitDraft}
                disabled={submitting || handingOff || progress.overall < 50}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium disabled:opacity-50',
                  progress.overall >= 50
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-muted text-muted-foreground cursor-not-allowed',
                )}
                title={
                  progress.overall < 50
                    ? '50% 이상 채워야 승인 가능'
                    : '자동 검수 + Project 필드·ProposalSection 시드 + isCompleted=true'
                }
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
                disabled={progress.overall < 50}
                className={cn(
                  'rounded-md border px-3 py-1 text-xs',
                  progress.overall < 50
                    ? 'cursor-not-allowed border-muted bg-muted/40 text-muted-foreground/60'
                    : 'bg-background text-muted-foreground hover:border-primary/40 hover:text-primary',
                )}
                title={
                  progress.overall < 50
                    ? '1차본 50% 이상이어야 의미있는 검수 가능 (현재 본문이 비어 모든 lens 가 0 으로 나옴)'
                    : '평가위원 시각 7 렌즈 자동 검수 (점수 + 이슈 표시)'
                }
              >
                🔍 검수
              </button>
              <a
                href={`/api/projects/${props.projectId}/export-markdown`}
                download
                className="rounded-md border bg-background px-3 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary"
                title="1차본 전체 → Markdown 다운로드 (PPT/HWP 변환은 PM 후처리)"
              >
                📝 마크다운
              </a>
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

      {/* Wave M4 — 1차본 완료 시 사전 임팩트 리포트 카드 */}
      {impactForecast && (
        <div className="border-b border-violet-300 bg-violet-50/40 px-6 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-violet-700">
              📊 사전 임팩트 리포트
            </span>
            <span className="text-sm tabular-nums">
              사회적 가치{' '}
              <strong className="text-violet-900">
                {(impactForecast.totalSocialValue / 100_000_000).toFixed(2)}억원
              </strong>
            </span>
            <span
              className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-800"
              title={
                impactForecast.calibration === 'auto-conservative'
                  ? 'AI 추정 항목에 0.7 보수 인수 적용됨'
                  : impactForecast.calibration === 'pm-locked'
                    ? 'PM 이 최종 확정한 값'
                    : 'PM 이 보정한 값'
              }
            >
              {impactForecast.calibration === 'auto-conservative'
                ? '보수 추정'
                : impactForecast.calibration === 'pm-locked'
                  ? 'PM 확정'
                  : 'PM 보정'}
            </span>
            <Link
              href={`/projects/${props.projectId}/impact-forecast`}
              className="rounded-md border border-violet-400 bg-background px-3 py-1 text-xs text-violet-700 hover:bg-violet-100"
            >
              상세 보기 + 보정 →
            </Link>
            <button
              onClick={() => setImpactForecast(null)}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
              title="닫기"
            >
              ×
            </button>
          </div>
          <p className="mt-1 text-[10px] text-violet-700/70">
            ⓘ impact-measurement 시스템 계수 기반 · 사후 실측 시 impact-measurement
            에서 같은 계수로 측정
          </p>
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

      {/* Wave 4 #10: 모바일 view switcher — segmented control (lg 이하만 표시) */}
      <div className="sticky top-0 z-10 flex border-b bg-background lg:hidden">
        <button
          type="button"
          onClick={() => setMobileView('chat')}
          className={cn(
            'flex-1 py-2 text-xs font-medium transition-colors',
            mobileView === 'chat'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          💬 채팅
        </button>
        <button
          type="button"
          onClick={() => setMobileView('preview')}
          className={cn(
            'flex-1 py-2 text-xs font-medium transition-colors',
            mobileView === 'preview'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          👁 미리보기 {progress.overall}%
        </button>
        <button
          type="button"
          onClick={() => setMobileView('sidebar')}
          className={cn(
            'relative flex-1 py-2 text-xs font-medium transition-colors',
            mobileView === 'sidebar'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          🤖 진단
          {!draft.meta.autoDiagnosis?.channel && (
            <span
              className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-primary animate-pulse"
              title="진단 실행 권장"
            />
          )}
        </button>
      </div>

      {/* 본문 — 좌(40%) 우(60%) — 모바일에선 mobileView 따라 한 컬럼만 표시 */}
      <div className="grid flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-[2fr_3fr]">
        {/* 좌측 챗봇 — 모바일 'chat' 일 때만 */}
        <div
          className={cn(
            'flex flex-col overflow-hidden lg:border-r',
            mobileView !== 'chat' && 'hidden lg:flex',
          )}
        >
          <ExpressChat
            ref={chatRef}
            turns={convState.turns}
            currentSlot={nextSlot}
            pendingExternalLookup={convState.pendingExternalLookup}
            pendingTurn={pendingTurn || isInitializing}
            isInitializing={isInitializing}
            hasRfp={hasRfp}
            projectId={props.projectId}
            onSendMessage={handleSendMessage}
            onUploadRfp={() => setShowRfpDialog(true)}
          />
        </div>

        {/* 우측 미리보기 + AI 자동 진단 (Phase M0 ADR-013, Wave 2 #1 탭화, Wave 4 모바일 분리) */}
        <div
          className={cn(
            'flex flex-col overflow-hidden',
            mobileView === 'chat' && 'hidden lg:flex',
          )}
        >
          <div className="flex-1 overflow-y-auto">
            {/* Wave 2 #1: 사이드바 3 탭화 — AI 진단 / 채널·전략 / 발주처
                Wave 4: 모바일 'preview' 일 때 hide */}
            <div
              className={cn(
                'border-b bg-muted/20 p-3',
                mobileView === 'preview' && 'hidden lg:block',
              )}
            >
              <Tabs defaultValue="diagnosis" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="diagnosis" className="relative text-xs">
                    AI 진단
                    {!draft.meta.autoDiagnosis?.channel && (
                      <span
                        className="absolute -top-0.5 right-1 h-1.5 w-1.5 rounded-full bg-primary animate-pulse"
                        title="진단 실행 권장"
                      />
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="channel" className="relative text-xs">
                    채널·전략
                    {draft.meta.autoDiagnosis?.channel &&
                      !draft.meta.autoDiagnosis.channel.confirmedByPm && (
                        <span
                          className="absolute -top-0.5 right-1 h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"
                          title="채널 컨펌 필요"
                        />
                      )}
                  </TabsTrigger>
                  <TabsTrigger value="client" className="text-xs">
                    발주처
                    {props.initialClientDoc && (
                      <span
                        className="ml-1 h-1.5 w-1.5 rounded-full bg-green-500"
                        title="문서 추출됨"
                      />
                    )}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="diagnosis" className="mt-3 space-y-3">
                  <AutoDiagnosisPanel
                    projectId={props.projectId}
                    diagnosis={draft.meta.autoDiagnosis}
                    onRefresh={() => router.refresh()}
                    onDiagnosed={(autoDiagnosis) => {
                      setDraft((d) => ({
                        ...d,
                        meta: { ...d.meta, autoDiagnosis },
                      }))
                    }}
                    enableDeepDiagnosis={progress.overall >= 60}
                  />
                </TabsContent>

                <TabsContent value="channel" className="mt-3 space-y-3">
                  <ChannelConfirmCard
                    projectId={props.projectId}
                    channelDiag={draft.meta.autoDiagnosis?.channel}
                    intendedDepartment={draft.meta.intendedDepartment}
                    onConfirmed={(channel, intendedDepartment) => {
                      setDraft((d) => ({
                        ...d,
                        meta: {
                          ...d.meta,
                          intendedDepartment:
                            channel === 'B2B' ? intendedDepartment : undefined,
                          autoDiagnosis: {
                            ...(d.meta.autoDiagnosis ?? {}),
                            channel: {
                              detected: channel,
                              confidence: 1.0,
                              reasoning:
                                d.meta.autoDiagnosis?.channel?.reasoning ?? [
                                  'PM 직접 확정',
                                ],
                              confirmedByPm: true,
                            },
                          },
                        },
                      }))
                      router.refresh()
                    }}
                  />
                  {draft.meta.autoDiagnosis?.channel?.confirmedByPm &&
                    draft.meta.autoDiagnosis.channel.detected === 'B2G' && (
                      <EvalSimulatorCard projectId={props.projectId} />
                    )}
                  {draft.meta.autoDiagnosis?.channel?.confirmedByPm &&
                    draft.meta.autoDiagnosis.channel.detected === 'renewal' && (
                      <RenewalSeedCard projectId={props.projectId} />
                    )}
                  {!draft.meta.autoDiagnosis?.channel && (
                    <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                      먼저 [AI 진단] 탭에서 진단을 실행하면 채널이 자동 감지됩니다.
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="client" className="mt-3">
                  <ClientDocUploadCard
                    projectId={props.projectId}
                    current={props.initialClientDoc}
                  />
                </TabsContent>
              </Tabs>
            </div>
            {/* 7 섹션 미리보기 — 모바일 'sidebar' 일 때 hide */}
            <div className={cn(mobileView === 'sidebar' && 'hidden lg:block')}>
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
      </div>
    </>
  )
}
