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
import { NorthStarBar } from './NorthStarBar'
import { NowBar } from './NowBar'
import { CommandPalette } from './CommandPalette'
import { EvaluatorScoreBar } from './EvaluatorScoreBar'
import { ExpressChat, type ExpressChatHandle } from './ExpressChat'
import { ExpressPreview } from './ExpressPreview'
import { RfpUploadDialog } from './RfpUploadDialog'
import { AutoDiagnosisPanel } from '@/components/projects/auto-diagnosis-panel'
import { ChannelConfirmCard } from '@/components/projects/channel-confirm-card'
import { EvalSimulatorCard } from '@/components/projects/eval-simulator-card'
import { RenewalSeedCard } from '@/components/projects/renewal-seed-card'
import { ClientDocUploadCard } from '@/components/projects/client-doc-upload-card'
import { PmInputsEditor } from './PmInputsEditor'
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
  /** C-8 — 서버에서 미리 로드한 사전 임팩트 forecast (있으면 즉시 카드 노출) */
  initialImpactForecast?: {
    id: string
    totalSocialValue: number
    beneficiaryCount: number
    calibration: string
    isStale: boolean
  } | null
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
  // D4 (2026-05-19) — 인증 실패 (401/403) 시 자동저장 영구 중단.
  //   세션 만료 / 다른 PM 프로젝트 등은 retry 해도 동일 결과 → 콘솔 폭주 방지.
  const autosaveDisabledRef = useRef<{ disabled: boolean; reason: string }>({
    disabled: false,
    reason: '',
  })

  // Wave 4 #10: 모바일 view switcher — 채팅/미리보기/사이드바 中 하나만 표시
  // 데스크탑 (lg+) 에선 모두 동시 표시 (CSS 로 mobile 만 한정).
  const [mobileView, setMobileView] = useState<'chat' | 'preview' | 'sidebar'>('chat')

  // Wave U / U2 — Cmd+K 명령 팔레트
  const [paletteOpen, setPaletteOpen] = useState<boolean>(false)

  // Wave U / U7 — Stage-aware 사이드바 자동 활성. controlled tab value + 토스트.
  // L1 / K7 — 'pm-inputs' 4번째 탭 추가 (외부 reality 입력)
  type SidebarTab = 'diagnosis' | 'channel' | 'client' | 'pm-inputs'
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('diagnosis')
  // 자동 전환 1회만 — PM 수동 클릭 후엔 더이상 강제 전환 X (완화책)
  const autoTabRef = useRef<{ toChannel: boolean; toClient: boolean }>({
    toChannel: false,
    toClient: false,
  })

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
  // D3 (2026-05-19) — fetch 응답 파싱 헬퍼.
  //   세션 만료 시 NextAuth 가 /login HTML 을 반환 → r.json() 시
  //   SyntaxError: Unexpected token '<' 발생. Content-Type 검사로 미리 차단.
  // ─────────────────────────────────────────
  type ApiError =
    | { kind: 'auth-required'; status: number }
    | { kind: 'forbidden'; status: number; message: string }
    | { kind: 'http'; status: number; message: string }
    | { kind: 'network'; message: string }

  const parseApiResponse = useCallback(
    async <T,>(r: Response): Promise<{ ok: true; data: T } | { ok: false; error: ApiError }> => {
      const contentType = r.headers.get('content-type') ?? ''
      // 1) 세션 만료 — NextAuth 가 /login HTML 반환 (200 이지만 HTML)
      if (contentType.includes('text/html')) {
        return { ok: false, error: { kind: 'auth-required', status: r.status } }
      }
      // 2) 401/403 — 인증/권한 실패
      if (r.status === 401) {
        return { ok: false, error: { kind: 'auth-required', status: 401 } }
      }
      if (r.status === 403) {
        const body = await r.json().catch(() => null)
        return {
          ok: false,
          error: { kind: 'forbidden', status: 403, message: body?.error ?? '권한 없음' },
        }
      }
      // 3) 기타 HTTP 실패
      if (!r.ok) {
        const body = await r.json().catch(() => null)
        return {
          ok: false,
          error: {
            kind: 'http',
            status: r.status,
            message: body?.error ?? `HTTP ${r.status}`,
          },
        }
      }
      // 4) 정상 — JSON 파싱
      try {
        const data = (await r.json()) as T
        return { ok: true, data }
      } catch (e) {
        return {
          ok: false,
          error: { kind: 'network', message: 'JSON 파싱 실패 — ' + String(e).slice(0, 80) },
        }
      }
    },
    [],
  )

  // ─────────────────────────────────────────
  // 자동 저장 (debounced 1500ms)
  // ─────────────────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef<string>(JSON.stringify(props.initialDraft))

  const triggerAutosave = useCallback(
    (nextDraft: ExpressDraft, nextState: ConversationState) => {
      // D4 — autosave 가 영구 중단된 상태면 스케줄 안 함 (콘솔 폭주 방지)
      if (autosaveDisabledRef.current.disabled) return
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
          const parsed = await parseApiResponse<{ ok: true }>(r)
          if (!parsed.ok) {
            const e = parsed.error

            // D4 — 401/403 은 retry 해도 동일 결과 → 영구 중단 + 명확한 배너
            if (e.kind === 'auth-required' || e.kind === 'forbidden') {
              autosaveDisabledRef.current = {
                disabled: true,
                reason: e.kind === 'auth-required' ? '세션 만료' : '권한 없음',
              }
              const title =
                e.kind === 'auth-required'
                  ? '세션 만료 — 다시 로그인 필요'
                  : '권한 없음 — 다른 PM 의 프로젝트'
              const message =
                e.kind === 'auth-required'
                  ? '세션이 만료되어 자동 저장이 중단됐습니다. 새 탭에서 로그인 후 이 탭을 새로고침하세요. 작성 내용은 화면에 남아있습니다.'
                  : ('message' in e ? e.message : '권한 없음') +
                    ' — Admin/Director 또는 본인 프로젝트만 저장 가능합니다.'
              addOrReplaceError({
                id: 'autosave-fail',
                severity: 'critical',
                title,
                message,
                action: {
                  label: e.kind === 'auth-required' ? '로그인 페이지 열기' : '페이지 새로고침',
                  onClick: () =>
                    e.kind === 'auth-required'
                      ? window.open('/login', '_blank')
                      : router.refresh(),
                },
              })
              setAutosaveStatus('error')
              return
            }

            // 남은 케이스 — http / network (둘 다 message 있음)
            console.warn('[ExpressShell] autosave HTTP error:', e)
            throw new Error(`${e.kind}: ${e.message}`)
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
                '네트워크·DB 문제일 수 있습니다. 페이지를 새로고침 하거나, 작성한 내용을 별도 텍스트로 백업한 뒤 다시 시도해주세요.',
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
    [props.projectId, addOrReplaceError, dismissError, router, parseApiResponse],
  )

  useEffect(() => {
    triggerAutosave(draft, convState)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [draft, convState, triggerAutosave])

  // ─────────────────────────────────────────
  // Wave U / U7 — Stage 전환 시 사이드바 자동 활성 (완화책: 1회만 자동, 토스트로 PM 인지)
  //
  // 전환 룰:
  //   1. AI 진단 완료 + 채널 미확정 → 'channel' 탭으로 + 토스트
  //   2. 채널 확정 + 발주처 문서 비어있음 → 'client' 탭으로 + 토스트 (한 번만)
  //
  // PM 이 수동으로 탭을 클릭하면 자동 전환 비활성 (autoTabRef 로 1회 제한).
  // ─────────────────────────────────────────
  const channelDetected = draft.meta.autoDiagnosis?.channel?.detected
  const channelConfirmed = !!draft.meta.autoDiagnosis?.channel?.confirmedByPm
  const hasClientDoc = !!props.initialClientDoc

  useEffect(() => {
    // 1) 진단 완료 + 채널 미확정 → channel 탭
    if (
      !autoTabRef.current.toChannel &&
      channelDetected &&
      !channelConfirmed &&
      sidebarTab === 'diagnosis'
    ) {
      autoTabRef.current.toChannel = true
      setSidebarTab('channel')
      toast.info(`Stage 전환 — ${channelDetected} 채널 감지. 확정해주세요`, {
        description: '사이드바 [채널·전략] 탭으로 자동 이동',
      })
      return
    }
    // 2) 채널 확정 + 발주처 문서 없음 → client 탭
    if (
      !autoTabRef.current.toClient &&
      channelConfirmed &&
      !hasClientDoc &&
      sidebarTab === 'channel'
    ) {
      autoTabRef.current.toClient = true
      setSidebarTab('client')
      toast.info('Stage 전환 — 채널 확정. 발주처 문서 업로드 권장', {
        description: '사이드바 [발주처] 탭으로 자동 이동',
      })
    }
  }, [channelDetected, channelConfirmed, hasClientDoc, sidebarTab])

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
        // D3 — HTML 응답 (세션 만료) / 401/403 처리
        const parsed = await parseApiResponse<{
          draft: ExpressDraft
          state: ConversationState
          nextSlot: string | null
          fellbackToPlaceholder?: boolean
          validationErrors?: Array<{ slotKey: string; zodIssue: string; remediation: string }>
        }>(r)
        if (!parsed.ok) {
          const e = parsed.error
          if (e.kind === 'auth-required') {
            toast.error('세션 만료 — 새 탭에서 로그인 후 이 페이지 새로고침', {
              duration: 8000,
              action: {
                label: '로그인 열기',
                onClick: () => window.open('/login', '_blank'),
              },
            })
            return
          }
          if (e.kind === 'forbidden') {
            toast.error('권한 없음 — ' + e.message, { duration: 6000 })
            return
          }
          throw new Error(('message' in e ? e.message : 'unknown') as string)
        }
        const data = parsed.data
        startTransition(() => {
          setDraft(data.draft)
          setConvState(data.state)
          setNextSlot(data.nextSlot)
        })
        if (data.fellbackToPlaceholder) {
          toast.warning('AI 응답이 불안정했어요. 답을 더 짧게 또는 한 슬롯만 다뤄 보세요.')
        }
        if (data.validationErrors && data.validationErrors.length > 0) {
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
    [pendingTurn, props.projectId, draft, convState, parseApiResponse],
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

  // Wave M4 — 1차본 승인 시 자동 생성된 사전 임팩트 리포트
  // C-8: 서버 props 초기값 + Stale (curriculum/budget 변경 후) 표시
  const [impactForecast, setImpactForecast] = useState<{
    id: string
    totalSocialValue: number
    beneficiaryCount?: number
    calibration: string
    isStale?: boolean
  } | null>(props.initialImpactForecast ?? null)

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
      {/* Wave U / U2 — Cmd+K 명령 팔레트 (전역 단축키) */}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        projectId={props.projectId}
        hasRfp={hasRfp}
        progress={progress.overall}
        isCompleted={!!draft.meta.isCompleted}
        submitting={submitting}
        handingOff={handingOff}
        onUploadRfp={() => setShowRfpDialog(true)}
        onRunDiagnosis={() => setSidebarTab('diagnosis')}
        onJumpToChannel={() => setSidebarTab('channel')}
        onJumpToClientDoc={() => setSidebarTab('client')}
        onJumpToChat={() => {
          const el = document.querySelector('[data-express-chat-input]')
          if (el instanceof HTMLElement) el.focus()
        }}
        onSubmitDraft={handleSubmitDraft}
        onRunInspector={runInspector}
        onScrollToInspector={() => {
          const el = document.querySelector('[data-inspector-card]')
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }}
        onHandoffDeep={handoffToDeep}
      />

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

      {/* 북극성 바 (진행 표시 전용) + Now Bar (다음 1 액션 — Wave U / U1) */}
      <div className="sticky top-0 z-20 border-b bg-background">
        <NorthStarBar
          progress={progress}
          autosaveStatus={autosaveStatus}
          isCompleted={draft.meta.isCompleted}
        />
        <NowBar
          projectId={props.projectId}
          hasRfp={hasRfp}
          hasDiagnosis={!!draft.meta.autoDiagnosis?.channel}
          channelConfirmed={!!draft.meta.autoDiagnosis?.channel?.confirmedByPm}
          nextSlot={nextSlot}
          progress={progress.overall}
          isCompleted={!!draft.meta.isCompleted}
          hasInspectorReport={!!inspectorReport}
          criticalIssueCount={
            inspectorReport?.issues.filter((i) => i.severity === 'critical').length ?? 0
          }
          inspectorPassed={!!inspectorReport?.passed}
          submitting={submitting}
          handingOff={handingOff}
          onUploadRfp={() => setShowRfpDialog(true)}
          onRunDiagnosis={() => setSidebarTab('diagnosis')}
          onJumpToChannel={() => setSidebarTab('channel')}
          onJumpToChat={() => {
            const el = document.querySelector('[data-express-chat-input]')
            if (el instanceof HTMLElement) el.focus()
          }}
          onSubmitDraft={handleSubmitDraft}
          onRunInspector={runInspector}
          onScrollToInspector={() => {
            const el = document.querySelector('[data-inspector-card]')
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
          onHandoffDeep={handoffToDeep}
          onOpenPalette={() => setPaletteOpen(true)}
        />
        {/* P1 — 평가위원 점수판 (항상 노출) */}
        <EvaluatorScoreBar
          projectId={props.projectId}
          channel={draft.meta?.autoDiagnosis?.channel?.detected}
          progressOverall={progress.overall}
          draftSignature={JSON.stringify({
            i: draft.intent?.length ?? 0,
            b: draft.beforeAfter?.before?.length ?? 0,
            a: draft.beforeAfter?.after?.length ?? 0,
            k: draft.keyMessages?.length ?? 0,
            s: Object.values(draft.sections ?? {}).reduce(
              (sum, v) => sum + (v?.length ?? 0),
              0,
            ),
          })}
          inspectorScore={inspectorReport?.overallScore}
          inspectorWeakLenses={
            inspectorReport?.lensScores
              ? Object.entries(inspectorReport.lensScores)
                  .filter(([k]) => k !== 'tone')
                  .map(([lens, score]) => ({ lens, score }))
                  .sort((a, b) => a.score - b.score)
                  .slice(0, 2)
              : undefined
          }
          onClickDetails={() => {
            // 페이지 하단 InspectorReportCard 로 스크롤
            const el = document.querySelector('[data-inspector-card]')
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
          onJumpToSection={(s) => {
            // 우측 미리보기에서 해당 섹션 스크롤
            const el = document.querySelector(`[data-preview-section="${s}"]`)
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }}
        />
        {/* Wave 2.5 — 상단 status only (액션 버튼은 아래 단일 패널로 통합) */}
        {inspectorReport && (
          <div className="flex items-center justify-end gap-2 border-t border-dashed bg-muted/20 px-6 py-1.5">
            <span
              className={cn(
                ' px-2 py-0.5 text-xs',
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

      {/* Wave 2 #5: 검수 결과 상세 카드 — inspectorReport 있을 때만
          B2 (2026-05-19): max-h + overflow-y-auto — 부모가 overflow-hidden 이라
          긴 추천 리스트가 잘림. 카드 자체에서 스크롤. */}
      {inspectorReport && (
        <div
          data-inspector-card
          className="border-b bg-muted/10 px-6 py-3 max-h-[55vh] overflow-y-auto"
        >
          <InspectorReportCard
            report={inspectorReport}
            onDismiss={() => {
              setInspectorReport(null)
              setInspectorRecommendations([])
            }}
            draftProgress={progress.overall}
            recommendations={inspectorRecommendations}
            onInsertAsset={(asset, target) => {
              if (target === 'chat') {
                // 기존 동작 — 챗봇 textarea 에 박기
                chatRef.current?.injectInput(
                  `[자산 인용 — ${asset.name}] ${asset.narrativeSnippet}`,
                  { append: true },
                )
                toast.success(
                  `"${asset.name}" 을 챗봇 입력에 박았습니다 — 손보고 전송하세요`,
                )
              } else {
                // P2 — 자동 섹션 반영
                setDraft((d) => {
                  const sectionKey = target as SectionKey
                  const current = d.sections?.[sectionKey] ?? ''
                  const snippet = `\n\n[${asset.name}] ${asset.narrativeSnippet}`
                  const next = (current + snippet).trim()
                  return {
                    ...d,
                    sections: {
                      ...d.sections,
                      [sectionKey]: next,
                    },
                  }
                })
                toast.success(
                  `섹션 ${target} 에 "${asset.name}" 추가됨 — 자동 저장됩니다`,
                )
              }
              // 사용 이력 비동기 기록 (에러 무시)
              fetch('/api/express/asset-usage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  projectId: props.projectId,
                  assetId: asset.assetId,
                  surface: 'express',
                  sectionKey: target === 'chat' ? null : target,
                  notes: `inspector-recommend lens=${asset.lens} target=${target}`,
                }),
              }).catch(() => {})
            }}
          />
        </div>
      )}

      {/* Wave U / U1 (2026-05-19): 기존 "승인 영역" + "산출물 액션바" 두 블록은
          NowBar (위) 로 통합. PM 이 동시에 마주하던 7개 액션 → 단일 CTA + More ▾ 6개. */}

      {/* Wave M4 — 1차본 완료 시 사전 임팩트 리포트 카드. C-8: stale 표시 추가 */}
      {impactForecast && (
        <div
          className={cn(
            'border-b px-6 py-3',
            impactForecast.isStale
              ? 'border-amber-300 bg-amber-50/40'
              : 'border-[color:var(--cyan)]/40 bg-[color:var(--light-beige)]',
          )}
        >
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={cn(
                'text-sm font-semibold',
                impactForecast.isStale ? 'text-amber-800' : 'text-[color:var(--primary-orange)]',
              )}
            >
              📊 사전 임팩트 리포트
              {impactForecast.isStale && (
                <span className="ml-1.5 text-[10px] font-normal text-amber-700">
                  (재계산 필요)
                </span>
              )}
            </span>
            <span className="text-sm tabular-nums">
              사회적 가치{' '}
              <strong
                className={
                  impactForecast.isStale ? 'text-amber-900' : 'text-[color:var(--dark-charcoal)]'
                }
              >
                {(impactForecast.totalSocialValue / 100_000_000).toFixed(2)}억원
              </strong>
              {impactForecast.beneficiaryCount != null && (
                <span className="ml-2 text-xs text-muted-foreground">
                  · 수혜자 {impactForecast.beneficiaryCount.toLocaleString()}명
                </span>
              )}
            </span>
            <span
              className={cn(
                ' px-1.5 py-0.5 text-[10px]',
                impactForecast.isStale
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-[color:var(--cyan)]/15 text-[color:var(--cyan)]',
              )}
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
              href={`/projects/${props.projectId}?stage=sroi`}
              className={cn(
                ' border bg-background px-3 py-1 text-xs',
                impactForecast.isStale
                  ? 'border-amber-400 text-amber-700 hover:bg-amber-100'
                  : 'border-[color:var(--cyan)]/40 text-[color:var(--cyan)] hover:bg-[color:var(--cyan)]/10',
              )}
            >
              {impactForecast.isStale ? '재계산 →' : '상세 보기 + 보정 →'}
            </Link>
            <button
              onClick={() => setImpactForecast(null)}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
              title="닫기"
            >
              ×
            </button>
          </div>
          <p
            className={cn(
              'mt-1 text-[10px]',
              impactForecast.isStale ? 'text-amber-700/80' : 'text-[color:var(--primary-orange)]/70',
            )}
          >
            {impactForecast.isStale
              ? 'ⓘ 커리큘럼 또는 예산이 forecast 생성 후 수정됨 — 재계산 권장'
              : 'ⓘ impact-measurement 시스템 계수 기반 · 사후 실측 시 같은 계수로 비교'}
          </p>
        </div>
      )}

      {/* 1차본 완료 시 정밀화 추천 패널 */}
      {deepSuggestions.length > 0 && (
        <div className="border-b border-brand/30 bg-orange-50/40 px-6 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-brand">
              🎯 1차본 완성! 정밀화 권장 영역
            </span>
            {deepSuggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handoffToDeep(s.targetStep)}
                disabled={handingOff}
                className="flex items-center gap-1.5 border bg-background px-2.5 py-1 text-xs text-foreground hover:border-brand/40 hover:text-brand disabled:opacity-50"
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
              ? 'border-b-2 border-brand text-brand'
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
              ? 'border-b-2 border-brand text-brand'
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
              ? 'border-b-2 border-brand text-brand'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          🤖 진단
          {!draft.meta.autoDiagnosis?.channel && (
            <span
              className="absolute right-2 top-1.5 h-1.5 w-1.5 bg-primary animate-pulse"
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
            // F3 (Wave V) — AutoResearchCard 가 accept-research 호출 후 draft 갱신
            draft={draft}
            onResearchAccept={(updatedDraft) => {
              setDraft(updatedDraft)
              toast.success('근거가 sections 에 자동 인용됐어요. 우측 미리보기 확인.')
            }}
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
              <Tabs
                value={sidebarTab}
                onValueChange={(v) => setSidebarTab(v as SidebarTab)}
                className="w-full"
              >
                {/* B4 (2026-05-19) — 탭 라벨에 효과 명시. PM 이 클릭 전에 뭐가 나오는지 안다.
                    L1 / K7 — 'PM 입력' 4번째 탭 (외부 reality — 통화·코치·평가위원) */}
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger
                    value="diagnosis"
                    data-tab-trigger="diagnosis"
                    className="relative flex-col gap-0 py-1.5 text-[11px]"
                    title="채널(B2G/B2B/renewal) · 프레임(CSR/일반) · 논리 흐름 · 팩트체크 4종 자동 진단"
                  >
                    <span className="font-semibold">AI 진단</span>
                    <span className="text-[9px] font-normal opacity-70">
                      채널·프레임·논리·팩트
                    </span>
                    {!draft.meta.autoDiagnosis?.channel && (
                      <span
                        className="absolute -top-0.5 right-1 h-1.5 w-1.5 bg-primary animate-pulse"
                        title="진단 실행 권장"
                      />
                    )}
                  </TabsTrigger>
                  <TabsTrigger
                    value="channel"
                    data-tab-trigger="channel"
                    className="relative flex-col gap-0 py-1.5 text-[11px]"
                    title="채널 확정 + B2G 평가표 시뮬레이션 또는 renewal 작년 자료 추출"
                  >
                    <span className="font-semibold">채널·전략</span>
                    <span className="text-[9px] font-normal opacity-70">
                      확정 → 평가표/작년
                    </span>
                    {draft.meta.autoDiagnosis?.channel &&
                      !draft.meta.autoDiagnosis.channel.confirmedByPm && (
                        <span
                          className="absolute -top-0.5 right-1 h-1.5 w-1.5 bg-amber-500 animate-pulse"
                          title="채널 컨펌 필요"
                        />
                      )}
                  </TabsTrigger>
                  <TabsTrigger
                    value="client"
                    data-tab-trigger="client"
                    className="flex-col gap-0 py-1.5 text-[11px]"
                    title="발주처 공식 문서 (계획안·예산서·내부 보고) 업로드 → 톤 추출"
                  >
                    <span className="font-semibold">발주처</span>
                    <span className="text-[9px] font-normal opacity-70">
                      문서 → 톤·KPI
                    </span>
                    {props.initialClientDoc && (
                      <span
                        className="ml-1 h-1.5 w-1.5 bg-[color:var(--green)]"
                        title="문서 추출됨"
                      />
                    )}
                  </TabsTrigger>
                  <TabsTrigger
                    value="pm-inputs"
                    data-tab-trigger="pm-inputs"
                    className="relative flex-col gap-0 py-1.5 text-[11px]"
                    title="PM 외부 reality 입력 — 발주처 통화·전담 코치·평가위원 (LLM 단독 X)"
                  >
                    <span className="font-semibold">PM 입력</span>
                    <span className="text-[9px] font-normal opacity-70">
                      통화·코치·평가위원
                    </span>
                    {(() => {
                      const pi = draft.pmInputs
                      const n =
                        (pi?.callNotes?.length ?? 0) +
                        (pi?.assignedCoaches?.length ?? 0) +
                        (pi?.evaluators?.length ?? 0)
                      return n > 0 ? (
                        <span className="ml-1 h-1.5 w-1.5 bg-[color:var(--green)]" title={`${n}건 입력됨`} />
                      ) : null
                    })()}
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
                    <div className=" border border-dashed p-3 text-xs text-muted-foreground">
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

                <TabsContent value="pm-inputs" className="mt-3">
                  <PmInputsEditor
                    projectId={props.projectId}
                    initial={draft.pmInputs ?? null}
                    onSaved={(pmInputs) =>
                      setDraft((d) => ({
                        ...d,
                        pmInputs,
                        meta: { ...d.meta, lastUpdatedAt: new Date().toISOString() },
                      }))
                    }
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
                onUpdateRisks={(next) =>
                  setDraft((d) => ({ ...d, risks: next }))
                }
              />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
