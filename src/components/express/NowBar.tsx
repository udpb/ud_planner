'use client'

/**
 * NowBar — Wave U / U1 (2026-05-19)
 *
 * "다음 1 액션" 단일 CTA + "More ▾" 보조 액션 패널
 *
 * 정보 과부하 70% ↓ — 동시 source 10+ → 3 tier:
 *   tier 1 (Now Bar): PM 이 지금 해야 할 단 1 액션
 *   tier 2 (More ▾):  나머지 산출물 액션 (정밀기획 · 검수 · 임팩트 · 마크다운 · 엑셀 · 발주처)
 *   tier 3 (사이드바): AI 진단 · 채널 · 발주처 문서 (Stage-aware 자동 활성 — U7)
 *
 * Stage 우선순위 (위 → 아래, 첫 매치가 next action):
 *   1. !hasRfp                                          → "RFP 업로드"
 *   2. !diagnosis                                       → "AI 진단 실행"
 *   3. diagnosis && !channel.confirmedByPm              → "채널 확정"
 *   4. progress < 50                                    → "다음 슬롯 답변: {label}"
 *   5. !isCompleted && progress >= 50                   → "✓ 1차본 승인 + 검수"
 *   6. isCompleted && !inspectorReport                  → "🔍 검수 실행"
 *   7. isCompleted && criticalIssues > 0                → "검수 이슈 {n}건 해결 ↓"
 *   8. isCompleted && passed                            → "📥 발주처 템플릿 다운로드"
 *
 * 디자인: ActionAI 토큰 — primary CTA 는 --primary-orange,
 *         배경 tint 는 .now-bar-active (8% mix)
 */

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  Sparkles,
  Loader2,
  ChevronDown,
  Search,
  ClipboardList,
  Upload,
  MessageSquare,
  CheckCircle2,
  Settings2,
} from 'lucide-react'
import { SLOT_LABELS, type SlotKey } from '@/lib/express/schema'

export type NowBarStage =
  | { kind: 'upload-rfp' }
  | { kind: 'run-diagnosis' }
  | { kind: 'confirm-channel' }
  | { kind: 'fill-slot'; slotKey: string | null; progress: number }
  | { kind: 'submit-draft'; progress: number }
  | { kind: 'run-inspector' }
  | { kind: 'fix-issues'; criticalCount: number }
  | { kind: 'deliver' }

interface Props {
  projectId: string
  hasRfp: boolean
  hasDiagnosis: boolean
  channelConfirmed: boolean
  nextSlot: string | null
  progress: number
  isCompleted: boolean
  hasInspectorReport: boolean
  criticalIssueCount: number
  inspectorPassed: boolean
  submitting: boolean
  handingOff: boolean
  inspectorRunning?: boolean
  onUploadRfp: () => void
  onRunDiagnosis: () => void
  onJumpToChannel: () => void
  onJumpToChat: () => void
  onSubmitDraft: () => void
  onRunInspector: () => void
  onScrollToInspector: () => void
  onHandoffDeep: (step: string) => void
  /** Wave U / U2 — 'More ▾' 클릭 시 Cmd+K 팔레트 오픈 */
  onOpenPalette: () => void
}

/** Stage 판정 로직 — 가장 위 매치가 즉시 반환 */
function detectStage(p: {
  hasRfp: boolean
  hasDiagnosis: boolean
  channelConfirmed: boolean
  nextSlot: string | null
  progress: number
  isCompleted: boolean
  hasInspectorReport: boolean
  criticalIssueCount: number
  inspectorPassed: boolean
}): NowBarStage {
  if (!p.hasRfp) return { kind: 'upload-rfp' }
  if (!p.hasDiagnosis) return { kind: 'run-diagnosis' }
  if (!p.channelConfirmed) return { kind: 'confirm-channel' }
  if (!p.isCompleted && p.progress < 50)
    return { kind: 'fill-slot', slotKey: p.nextSlot, progress: p.progress }
  if (!p.isCompleted && p.progress >= 50)
    return { kind: 'submit-draft', progress: p.progress }
  // isCompleted
  if (!p.hasInspectorReport) return { kind: 'run-inspector' }
  if (p.criticalIssueCount > 0) return { kind: 'fix-issues', criticalCount: p.criticalIssueCount }
  return { kind: 'deliver' }
}

export function NowBar(props: Props) {
  const stage = useMemo(
    () =>
      detectStage({
        hasRfp: props.hasRfp,
        hasDiagnosis: props.hasDiagnosis,
        channelConfirmed: props.channelConfirmed,
        nextSlot: props.nextSlot,
        progress: props.progress,
        isCompleted: props.isCompleted,
        hasInspectorReport: props.hasInspectorReport,
        criticalIssueCount: props.criticalIssueCount,
        inspectorPassed: props.inspectorPassed,
      }),
    [
      props.hasRfp,
      props.hasDiagnosis,
      props.channelConfirmed,
      props.nextSlot,
      props.progress,
      props.isCompleted,
      props.hasInspectorReport,
      props.criticalIssueCount,
      props.inspectorPassed,
    ],
  )

  // ─────────────────────────────────────────
  // 단일 CTA — stage 별 라벨 + 클릭 핸들러 + 활성도 (지금 추천?)
  // ─────────────────────────────────────────
  const cta = useMemo(() => {
    const busy = props.submitting || props.handingOff || props.inspectorRunning
    const loaderEl = busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null

    switch (stage.kind) {
      case 'upload-rfp':
        return {
          label: 'RFP 업로드',
          icon: <Upload className="h-3.5 w-3.5" />,
          onClick: props.onUploadRfp,
          disabled: false,
          tooltip: '먼저 RFP 를 업로드하면 챗봇 첫 질문이 자동으로 나옵니다',
          loaderEl,
        }
      case 'run-diagnosis':
        return {
          label: 'AI 자동 진단 실행',
          icon: <Sparkles className="h-3.5 w-3.5" />,
          onClick: props.onRunDiagnosis,
          disabled: false,
          tooltip: 'B2G/B2B/renewal 채널 + 사회공헌·일반전략 framing + 팩트체크',
          loaderEl,
        }
      case 'confirm-channel':
        return {
          label: '채널 확정',
          icon: <CheckCircle2 className="h-3.5 w-3.5" />,
          onClick: props.onJumpToChannel,
          disabled: false,
          tooltip: '진단 결과 채널을 확정해야 검수 가중치·렌즈가 적용됩니다',
          loaderEl,
        }
      case 'fill-slot': {
        const label = stage.slotKey
          ? (SLOT_LABELS[stage.slotKey as SlotKey] ?? stage.slotKey)
          : '슬롯 답변 채우기'
        return {
          label: `답변: ${label}`,
          icon: <MessageSquare className="h-3.5 w-3.5" />,
          onClick: props.onJumpToChat,
          disabled: false,
          tooltip: `좌측 챗봇으로 이동 — 현재 ${stage.progress}%`,
          loaderEl,
        }
      }
      case 'submit-draft':
        return {
          label: '✓ 1차본 승인 + 검수 + 임팩트 forecast',
          icon: <CheckCircle2 className="h-3.5 w-3.5" />,
          onClick: props.onSubmitDraft,
          disabled: busy || false,
          tooltip:
            '자동 검수 + Project 필드·ProposalSection 시드 + 사전 임팩트 forecast 생성',
          loaderEl,
        }
      case 'run-inspector':
        return {
          label: '🔍 평가위원 시각 검수 실행',
          icon: <Search className="h-3.5 w-3.5" />,
          onClick: props.onRunInspector,
          disabled: busy || false,
          tooltip: '7 렌즈 자동 평가 (채널 가중치 적용)',
          loaderEl,
        }
      case 'fix-issues':
        return {
          label: `검수 이슈 ${stage.criticalCount}건 해결`,
          icon: <ChevronDown className="h-3.5 w-3.5" />,
          onClick: props.onScrollToInspector,
          disabled: false,
          tooltip: '검수 카드로 이동 — critical 이슈부터 우선',
          loaderEl,
        }
      case 'deliver':
        // E3 (2026-05-19) — 검수 통과 후 다음 액션은 "Step 1 정밀 기획" (워크플로 진행).
        // 발주처 템플릿 다운로드는 More ▾ 팔레트에서 별도 접근.
        return {
          label: 'Step 1 정밀 기획으로 →',
          icon: <Settings2 className="h-3.5 w-3.5" />,
          onClick: () => props.onHandoffDeep('rfp'),
          disabled: props.handingOff,
          tooltip:
            '검수 통과 — Express 내용 그대로 Deep Track Step 1 (RFP 분석) 으로 이동. 발주처 템플릿 다운로드는 More ▾ 에서.',
          loaderEl,
        }
    }
  }, [stage, props])

  // Cmd+K 단축키 안내 — OS 별
  const cmdKLabel = useMemo(() => {
    if (typeof window === 'undefined') return 'Ctrl K'
    const isMac = /Mac|iPod|iPhone|iPad/.test(window.navigator.platform)
    return isMac ? '⌘ K' : 'Ctrl K'
  }, [])

  return (
    <div
      className={cn(
        'border-b transition-colors',
        // stage 별 활성도 — submit/inspector 같은 강조 단계는 더 진한 tint
        stage.kind === 'submit-draft' ||
          stage.kind === 'fix-issues' ||
          stage.kind === 'run-inspector'
          ? 'now-bar-active'
          : 'bg-muted/15',
      )}
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 sm:px-6 sm:py-2.5">
        {/* 좌측 라벨 — "다음 1 액션" */}
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          다음 1 액션
        </span>

        {/* Primary CTA — 단일 버튼 (E3 이후 모든 stage 가 button — href 안 씀) */}
        <button
            type="button"
            onClick={cta.onClick}
            disabled={cta.disabled}
            title={cta.tooltip}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm',
              'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
              cta.disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            {cta.loaderEl ?? cta.icon}
            {cta.label}
          </button>

        {/* More ▾ — Wave U / U2: Cmd+K 팔레트 호출. Cmd+K 모르는 PM 도 1 클릭. */}
        <button
          type="button"
          onClick={props.onOpenPalette}
          className="ml-auto flex items-center gap-1 rounded-md border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          title={`다른 산출물 · 점프 명령 (${cmdKLabel})`}
          aria-haspopup="dialog"
        >
          More
          <ChevronDown className="h-3 w-3" />
          <kbd className="ml-1 hidden rounded border bg-muted/40 px-1 py-px font-mono text-[10px] text-muted-foreground sm:inline">
            {cmdKLabel}
          </kbd>
        </button>
      </div>
    </div>
  )
}
