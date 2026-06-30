'use client'

/**
 * 프로그램 설계 캔버스 (Client Component) — BR-3c (재디자인, BR-3b 턴 루프 보존)
 *
 * BR-3b 의 4단계 흐름을 **설계 캔버스**로 재디자인 (목업 design_stage_auto_intelligence):
 *   ① 토대잡기 — RFP 미리채움 + 목표 확인/수정 → "기획 시작" (선례·의도는 ②기획의도에서 자동 반영, BR-WS-4s)
 *   ② 갈림길  — openGates 카드. 운영 유형은 이름+설명+실측(GateCard), 응답 → 턴 재호출.
 *   ③ 자동조립 — decisionLog 시각화(D0~D8 + source 배지) + 기획요소 칩.
 *   ④ 1차안   — 회차 타임라인(T1~T3) / 단계 리스트(T4/T5) + 코치풀 + 자산 인용.
 *
 * ⚠️ 턴 루프(게이트 응답→재호출)·structure 분기는 BR-3b 그대로 보존 — **UI만 교체**.
 *    엔진은 호출만 (POST /api/projects/[id]/program-design). 새 엔진·추천 로직 0.
 *    코치풀(AutoRecommendedPool)·자산(MatchedAssetsPanel)·운영유형 메타(design-rules)
 *    는 전부 재사용/호출.
 *
 * 디자인킷 260529: radius 0, accent 면 최소, 킷 토큰만(--accent/--ink/--paper/--muted/--line).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { AutoRecommendedPool } from '@/components/projects/coaches/AutoRecommendedPool'
import { MatchedAssetsPanel } from '@/components/projects/matched-assets-panel'
import type { AssetMatch } from '@/lib/asset-registry-types'
import type { ConceptShape } from '@/lib/program-design/concept-synth'
import type {
  NonSessionStage,
  PlanSession,
  PlanStructure,
  ProgramPlan,
} from '@/lib/program-design/plan-types'
import { applySessionOps, type SessionOp } from '@/lib/program-design/session-ops'
import { applyStageOps, type StageOp } from '@/lib/program-design/stage-ops'

import { DecisionLog } from './decision-log'
import { GateCard } from './gate-card'
import { PlanningElements } from './planning-elements'
import { StructureView } from './structure-view'
import type { OperatingTypeMeta } from './operating-type-meta'

// ─────────────────────────────────────────────────────────────────
// 미리채움 타입 (서버 컴포넌트가 RfpParsed 에서 추출)
// ─────────────────────────────────────────────────────────────────

export interface RfpPreview {
  projectName: string | null
  client: string | null
  targetAudience: string | null
  targetCount: number | null
  eduStartDate: string | null
  eduEndDate: string | null
  totalBudgetVat: number | null
  objectives: string[]
}

// ─────────────────────────────────────────────────────────────────
// ②기획의도 맥락 (BR-WS-4 Task4 — strategicNotes 유래, 중복 입력 제거)
// ─────────────────────────────────────────────────────────────────

/**
 * ②기획의도(strategicNotes)에서 파생한 설계 맥락.
 *   - bands : 캔버스 상단 "이 설계가 선 기획의도" 읽기 전용 요약 (재설계 §3 원칙1).
 *   - precedentPrefill / intentPrefill : 엔진 호출에 silently 전달(BR-WS-4s — 토대잡기 중복 textarea 제거, ②가 소유).
 * load-workspace/page.tsx 가 PlanningIntentDraft → 이 형태로 매핑.
 */
export interface DesignIntentContext {
  bands: { label: string; value: string }[]
  precedentPrefill: string
  intentPrefill: string
}

// ─────────────────────────────────────────────────────────────────
// 운영 유형 메타 lookup — name (이름 표시용, 데이터에서)
// ─────────────────────────────────────────────────────────────────

const OPERATING_TYPE_NAME = (
  meta: OperatingTypeMeta[],
  type: string | undefined,
): string | undefined => meta.find((m) => m.type === type)?.name

// ─────────────────────────────────────────────────────────────────
// 섹션 헤더 (kicker + title)
// ─────────────────────────────────────────────────────────────────

function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 10,
        borderBottom: '2px solid var(--ink)',
        paddingBottom: 6,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--accent)',
        }}
      >
        {kicker}
      </span>
      <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{title}</h2>
    </div>
  )
}

/** 보조 패널 헤더 (코치풀·자산 — 작은 라벨). */
function PanelLabel({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--accent)',
        }}
      >
        {kicker}
      </span>
      <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>{title}</h3>
    </div>
  )
}

// (IntentBand 제거 — BR-WS-3s §9: ②기획의도(PlanningIntent)가 의도를 소유하므로
//  설계 캔버스의 중복 의도 띠는 삭제. intentContext 의 prefill·엔진 호출은 유지.)

// ─────────────────────────────────────────────────────────────────
// 메인 — 턴 루프 (BR-3b 보존)
// ─────────────────────────────────────────────────────────────────

export function ProgramDesignFlow({
  projectId,
  rfpPreview,
  operatingTypeMeta,
  assetMatches,
  initialAcceptedAssetIds,
  initialPlan,
  intentContext,
  savedConcept,
  onSessionsChange,
  onStagesChange,
  incomingOps,
}: {
  projectId: string
  rfpPreview: RfpPreview
  /** design-rules.json B 프로파일 → 운영 유형 이름·설명·실측 (서버에서 로드). */
  operatingTypeMeta: OperatingTypeMeta[]
  /** matchAssetsToRfp() 결과 — 자산 인용 패널 (서버에서 계산). */
  assetMatches: AssetMatch[]
  /** Project.acceptedAssetIds — 자산 토글 초기값. */
  initialAcceptedAssetIds: string[]
  /** BR-WS-4 결함2: 저장된 1차안(파일 복원). 있으면 턴 스킵하고 바로 편집 가능. */
  initialPlan?: ProgramPlan | null
  /** BR-WS-4 Task4: ②기획의도 유래 맥락(맥락 띠 + 토대잡기 prefill). */
  intentContext?: DesignIntentContext | null
  /**
   * ADR-031 W3: 확정 컨셉(strategicNotes.concept). operatingType 게이트의 축 추천
   * 바이어스에 쓰인다(없으면 엔진 gate.recommended fallback). 셸이 라이브 concept 을 전달.
   */
  savedConcept?: ConceptShape | null
  /**
   * BR-WS-6 (additive 인렛 ①): effectiveStructure 변경 시 현재 회차 목록 보고.
   * sessions 구조가 아니거나 구조가 없으면 null. 셸(ProgramWorkspace)이 대화에 동봉.
   */
  onSessionsChange?: (sessions: PlanSession[] | null) => void
  /**
   * BR-WS-19 (additive 인렛 ①-b): effectiveStructure 가 비회차(T4/T5)면 현재 단계 목록 보고.
   * sessions 구조거나 구조가 없으면 null. 셸(ProgramWorkspace)이 대화에 동봉.
   */
  onStagesChange?: (stages: NonSessionStage[] | null) => void
  /**
   * BR-WS-6/19 (additive 인렛 ②): 대화가 해석한 액션. id 가 바뀔 때 1회 적용
   * (= PM 이 손으로 편집한 것과 동일한 structureOverride). 기획 시작 전 구조 없으면 무시.
   * sessions 구조면 SessionOp[], 비회차 구조면 StageOp[] (effectiveStructure.kind 로 분기).
   */
  incomingOps?: { id: string; ops: (SessionOp | StageOp)[] } | null
}) {
  // ① 토대잡기 입력 — 목표 확인만 PM 이 직접 (선례·의도는 ②기획의도가 소유 → BR-WS-4s 중복 제거)
  const [goalText, setGoalText] = useState(rfpPreview.objectives.join('\n'))
  // 선례·담당자 의도는 textarea 제거 — ②기획의도(intentContext) 값을 엔진 호출에 silently 전달.
  const precedentSummary = intentContext?.precedentPrefill?.trim() ?? ''
  const intentSummary = intentContext?.intentPrefill?.trim() ?? ''
  // 저장된 1차안이 있으면 토대잡기 스킵하고 바로 편집 화면으로(결함2).
  const [started, setStarted] = useState(!!initialPlan)

  // 턴 상태 (BR-3b 그대로). initialPlan 있으면 plan 시드 → 구조 바로 편집.
  const [decisions, setDecisions] = useState<Record<string, unknown>>({})
  const [pendingAnswers, setPendingAnswers] = useState<Record<string, unknown>>({})
  const [plan, setPlan] = useState<ProgramPlan | null>(initialPlan ?? null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [structureOverride, setStructureOverride] = useState<PlanStructure | null>(null)

  const callEngine = useCallback(
    async (nextDecisions: Record<string, unknown>) => {
      setLoading(true)
      try {
        const res = await fetch(`/api/projects/${projectId}/program-design`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            intent: intentSummary ? { summary: intentSummary } : undefined,
            precedent: precedentSummary ? { summary: precedentSummary } : undefined,
            decisions: nextDecisions,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data?.message ?? data?.error ?? `HTTP ${res.status}`)
        }
        const nextPlan = data.plan as ProgramPlan
        setPlan(nextPlan)
        setStructureOverride(null)
        setPendingAnswers({})
        if (nextPlan.openGates.length === 0) {
          toast.success('1차안 완성 — 결정 로그와 구조를 확인하세요.')
        } else {
          toast.success(`다음 갈림길 ${nextPlan.openGates.length}건 — 결정 후 진행됩니다.`)
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        toast.error('기획 생성 실패: ' + msg.slice(0, 160))
      } finally {
        setLoading(false)
      }
    },
    [projectId, intentSummary, precedentSummary],
  )

  const handleStart = useCallback(() => {
    setStarted(true)
    const seed: Record<string, unknown> = {}
    if (goalText.trim()) seed.goalNote = goalText.trim()
    setDecisions(seed)
    void callEngine(seed)
  }, [goalText, callEngine])

  const handleAnswer = useCallback(
    (axis: string, value: unknown) => {
      setPendingAnswers((p) => ({ ...p, [axis]: value }))
      const next = { ...decisions, [axis]: value }
      setDecisions(next)
      void callEngine(next)
    },
    [decisions, callEngine],
  )

  const effectiveStructure = structureOverride ?? plan?.structure ?? null

  // ── BR-WS-6 인렛 ① : 현재 회차 목록을 셸로 보고(대화 매칭 근거) ──
  // effectiveStructure 가 sessions 면 sessions, 아니면 null. 셸이 WorkspaceChat 에 동봉.
  useEffect(() => {
    if (!onSessionsChange) return
    onSessionsChange(
      effectiveStructure && effectiveStructure.kind === 'sessions'
        ? effectiveStructure.sessions
        : null,
    )
  }, [effectiveStructure, onSessionsChange])

  // ── BR-WS-19 인렛 ①-b : 현재 비회차 단계 목록을 셸로 보고(대화 매칭 근거) ──
  // effectiveStructure 가 비회차(individual/event)면 stages, 아니면 null.
  useEffect(() => {
    if (!onStagesChange) return
    onStagesChange(
      effectiveStructure &&
        (effectiveStructure.kind === 'individual' || effectiveStructure.kind === 'event')
        ? effectiveStructure.stages
        : null,
    )
  }, [effectiveStructure, onStagesChange])

  // ── BR-WS-6/19 인렛 ② : 대화가 보낸 ops 를 1회 적용(structureOverride 갱신) ──
  // id 가 바뀔 때만 적용(중복 방지). 구조 없으면(기획 시작 전) 무시. 저장은 기존 editedStructure 경로 그대로.
  // kind 분기: sessions → applySessionOps(SessionOp[]) / individual·event → applyStageOps(StageOp[]).
  // 두 apply 함수 모두 자기 구조가 아니면 무시하므로 잘못 라우팅돼도 캔버스를 망치지 않는다.
  const appliedOpsId = useRef<string | null>(null)
  useEffect(() => {
    if (!incomingOps) return
    if (appliedOpsId.current === incomingOps.id) return
    appliedOpsId.current = incomingOps.id
    if (incomingOps.ops.length === 0) return
    if (!effectiveStructure) return
    if (effectiveStructure.kind === 'sessions') {
      setStructureOverride(
        applySessionOps(effectiveStructure, incomingOps.ops as SessionOp[]),
      )
    } else if (
      effectiveStructure.kind === 'individual' ||
      effectiveStructure.kind === 'event'
    ) {
      setStructureOverride(
        applyStageOps(effectiveStructure, incomingOps.ops as StageOp[]),
      )
    }
  }, [incomingOps, effectiveStructure])

  const handleSave = useCallback(async () => {
    if (!plan || plan.openGates.length > 0) return
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/program-design`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          intent: intentSummary ? { summary: intentSummary } : undefined,
          precedent: precedentSummary ? { summary: precedentSummary } : undefined,
          decisions,
          save: true,
          // 결함1: PM 편집 구조를 권위값으로 전송 — 서버가 엔진 재생성 결과를 이걸로 덮는다.
          editedStructure: effectiveStructure ?? undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message ?? data?.error ?? `HTTP ${res.status}`)
      // 저장 후: 서버가 받은 plan(편집 구조 반영) 으로 로컬 동기화 — 다음 편집의 기준선 일치.
      if (data?.plan) {
        setPlan(data.plan as ProgramPlan)
        setStructureOverride(null)
      }
      toast.success('1차안을 저장했습니다.')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('저장 실패: ' + msg.slice(0, 160))
    } finally {
      setSaving(false)
    }
  }, [plan, projectId, intentSummary, precedentSummary, decisions, effectiveStructure])
  const hasGates = !!plan && plan.openGates.length > 0
  const isDraftReady = !!plan && plan.openGates.length === 0
  const operatingTypeName = OPERATING_TYPE_NAME(operatingTypeMeta, plan?.operatingType)

  // ── ① 토대잡기 (시작 전) ──
  if (!started) {
    return (
      <div style={{ display: 'grid', gap: 24, maxWidth: 920 }}>
        <section style={{ display: 'grid', gap: 12 }}>
          <SectionTitle kicker="STEP 1" title="토대잡기 — RFP 위에서 시작" />

          {/* ②기획의도 맥락 띠 제거(BR-WS-3s §9): ②(PlanningIntent)가 의도를 소유 — 중복 표시 X.
              prefill·엔진 호출(intentContext)은 그대로 유지. */}

          {/* RFP 미리채움 (틴트박스 그리드) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 2,
              border: '1px solid var(--line)',
            }}
          >
            {[
              { label: '사업', value: rfpPreview.projectName ?? '—' },
              { label: '발주', value: rfpPreview.client ?? '—' },
              {
                label: '대상',
                value:
                  (rfpPreview.targetAudience ?? '—') +
                  (rfpPreview.targetCount ? ` / ${rfpPreview.targetCount}명` : ''),
              },
              {
                label: '교육 기간',
                value:
                  rfpPreview.eduStartDate || rfpPreview.eduEndDate
                    ? `${rfpPreview.eduStartDate ?? '?'} ~ ${rfpPreview.eduEndDate ?? '?'}`
                    : '—',
              },
            ].map((cell, i) => (
              <div
                key={cell.label}
                style={{ background: i % 2 === 0 ? 'var(--paper)' : 'var(--neutral-90)', padding: '10px 14px' }}
              >
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{cell.label}</div>
                <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 700, wordBreak: 'keep-all' }}>
                  {cell.value}
                </div>
              </div>
            ))}
          </div>

          {/* 선례·담당자 의도는 ②기획의도에서 가져옵니다 (한 흐름, 재설계 §9 원칙1 — 중복 입력 제거) */}
          {(precedentSummary || intentSummary) && (
            <p style={{ fontSize: 11, color: 'var(--muted)', wordBreak: 'keep-all', lineHeight: 1.5 }}>
              선례·담당자 운영 의도는 ②기획의도에서 자동으로 가져와 반영합니다 — 고치려면 ②기획의도에서 수정하세요.
            </p>
          )}

          {/* 목표 확인/수정 */}
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
              기획 시작 목표{' '}
              <span style={{ color: 'var(--muted)', fontWeight: 400 }}>
                (이 목표로 커리큘럼을 생성합니다 — RFP 원문 기준 엔진 입력값. ②기획의도의 ‘목표 해석’과는 별개)
              </span>
            </label>
            <Textarea
              value={goalText}
              onChange={(e) => setGoalText(e.target.value)}
              rows={3}
              placeholder="이 프로그램이 달성해야 할 목표"
              style={{ fontSize: 13 }}
            />
          </div>

          <div>
            <Button type="button" onClick={handleStart} disabled={loading}>
              {loading ? '엔진 호출 중…' : '기획 시작'}
            </Button>
          </div>
        </section>
      </div>
    )
  }

  // ── ②③④ 턴 진행 (설계 캔버스) ──
  return (
    <div style={{ display: 'grid', gap: 28, maxWidth: 920 }}>
      {/* 진행 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Button type="button" variant="ghost" size="sm" disabled={loading} onClick={() => setStarted(false)}>
          ← 토대잡기 수정
        </Button>
        {plan?.operatingType && (
          <span style={{ fontSize: 12, color: 'var(--soft-ink)' }}>
            운영 유형:{' '}
            <strong style={{ fontWeight: 700 }}>
              {operatingTypeName ? `${operatingTypeName} (${plan.operatingType})` : plan.operatingType}
            </strong>
          </span>
        )}
        {plan && (
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            승인 규칙 {plan.meta.approvedRuleCount}/{plan.meta.totalRuleCount} ·{' '}
            {hasGates ? `갈림길 ${plan.openGates.length}건` : '1차안 완성'}
          </span>
        )}
        {loading && <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>처리 중…</span>}
      </div>

      {/* ②기획의도 맥락 띠 제거(BR-WS-3s §9): 중복 표시 X — ②가 의도 소유.
          prefill·엔진 호출은 그대로. */}

      {/* ② 갈림길 (게이트) */}
      {hasGates && (
        <section style={{ display: 'grid', gap: 12 }}>
          <SectionTitle kicker="STEP 2" title="큰 갈림길 — 사람이 결정" />
          <p style={{ fontSize: 12, color: 'var(--soft-ink)', lineHeight: 1.6, wordBreak: 'keep-all' }}>
            엔진이 자동으로 정하기엔 모호한 결정만 묻습니다. 고르면 다음 턴으로 진행됩니다.
          </p>
          <div style={{ display: 'grid', gap: 12 }}>
            {plan!.openGates.map((gate, i) => (
              <GateCard
                key={`${gate.axis}-${i}`}
                gate={gate}
                pending={pendingAnswers[gate.axis]}
                disabled={loading}
                operatingTypeMeta={operatingTypeMeta}
                concept={savedConcept ?? null}
                onAnswer={handleAnswer}
              />
            ))}
          </div>
        </section>
      )}

      {/* ③ 자동조립 — 결정 로그 + 기획요소 칩 */}
      {plan && plan.decisionLog.length > 0 && (
        <section style={{ display: 'grid', gap: 12 }}>
          <SectionTitle
            kicker={isDraftReady ? 'STEP 4 · 결정 로그' : 'STEP 3'}
            title={isDraftReady ? '확정된 설계 결정' : '자동으로 정한 결정 (안 물어본 것 + 이유)'}
          />
          {/* 기획요소 칩 (선발·사전진단·사후연계 — 있으면) */}
          <PlanningElements log={plan.decisionLog} />
          <DecisionLog log={plan.decisionLog} />
        </section>
      )}

      {/* ④ 1차안 — 구조 (게이트 0건일 때만) */}
      {isDraftReady && effectiveStructure && (
        <section style={{ display: 'grid', gap: 12 }}>
          <SectionTitle kicker="STEP 4 · 구조" title="프로그램 구조 (PM 이 직접 재배치)" />
          <p style={{ fontSize: 11, color: 'var(--muted)', wordBreak: 'keep-all' }}>
            AI 초안입니다 — 셀 클릭으로 수정, ↑↓ 로 순서변경, 종류 드롭다운·추가·삭제로 직접 재배치하세요.
            저장하면 PM 편집이 그대로 보존됩니다(엔진이 덮지 않음).
            {plan?.meta.model ? ` · 모델: ${plan.meta.model}` : ''}
          </p>
          <StructureView structure={effectiveStructure} onStructureChange={setStructureOverride} />

          <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
            <Button type="button" disabled={saving || loading} onClick={handleSave}>
              {saving ? '저장 중…' : '1차안 저장'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => void callEngine(decisions)}
            >
              구조 다시 생성
            </Button>
          </div>
        </section>
      )}

      {/* ④-보조 — 코치풀 + 자산 인용 (1차안 준비되면 동반 표시) */}
      {isDraftReady && (
        <section style={{ display: 'grid', gap: 20 }}>
          <SectionTitle kicker="STEP 4 · 자동 투입" title="코치풀 · 근거 자산 (자동 추천)" />

          {/* 코치풀 — recommend-coaches 자동추천 (컴포넌트 재사용) */}
          <div style={{ display: 'grid', gap: 8 }}>
            <PanelLabel kicker="coach-finder" title="추천 코치 풀" />
            <AutoRecommendedPool projectId={projectId} mode="inline" assignedCoachIds={[]} />
          </div>

          {/* 자산 인용 — matchAssetsToRfp 매칭 (컴포넌트 재사용) */}
          <div style={{ display: 'grid', gap: 8 }}>
            <PanelLabel kicker="asset registry" title="근거 자산" />
            <MatchedAssetsPanel
              projectId={projectId}
              matches={assetMatches}
              initialAcceptedIds={initialAcceptedAssetIds}
            />
          </div>
        </section>
      )}
    </div>
  )
}
