'use client'

/**
 * ResearchRequestsCard — 스텝별 티키타카 리서치 카드
 *
 * 위치: PmGuidePanel 최상단 (2026-04-20 사용자 피드백)
 *
 * 흐름:
 *   1. 스텝별 ResearchRequest 리스트 렌더
 *   2. "프롬프트 복사" 버튼 → clipboard 에 promptTemplate
 *   3. PM 이 외부 LLM(Claude · Gemini) 에 붙여넣어 답변 받음
 *   4. "답변 붙여넣기" textarea 에 paste → 저장
 *   5. 저장된 답변은 ✓ 체크 + 접힘 상태로 렌더
 *
 * 저장 경로: POST /api/projects/[id]/research
 *   body: { stepKey, requestId, answer, stores }
 *   → externalResearch JSON 배열에 append/update
 *   → 다음 AI 호출(curriculum-ai, proposal-ai, logic-model) 이 자동 주입
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  MessageCircleQuestion,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Trash2,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { ResolvedResearchRequest } from '../types'
import type { StepKey } from '../types'
import { VALUE_CHAIN_STAGES, STAGE_TO_STEPS } from '@/lib/value-chain'
import type { ValueChainStage } from '@/lib/value-chain'

interface ResearchRequestsCardProps {
  projectId: string
  stepKey: StepKey
  requests: ResolvedResearchRequest[]
}

export function ResearchRequestsCard({
  projectId,
  stepKey,
  requests,
}: ResearchRequestsCardProps) {
  // 최소 2개 이상이어야 함 (빈 상태 금지 — research-prompts.ts 품질 게이트)
  if (requests.length === 0) {
    return (
      <Card className="border-dashed border-primary/30">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-base font-semibold">
            <MessageCircleQuestion className="h-4 w-4 text-primary" />
            AI 리서치 요청
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground">
            이 스텝엔 추가 리서치 요청이 없습니다. (정의된 요청: 0)
          </p>
        </CardContent>
      </Card>
    )
  }

  const answeredCount = requests.filter((r) => r.savedAnswer).length

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-base font-semibold">
          <MessageCircleQuestion className="h-4 w-4 text-primary" />
          AI 리서치 요청
          <Badge
            variant="outline"
            className="ml-auto border-primary/40 bg-primary/10 text-[10px] font-semibold text-primary"
          >
            {answeredCount}/{requests.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          이 스텝에서 AI 가 PM 에게 되묻는 리서치입니다. 프롬프트를 복사해 외부
          LLM(Claude · Gemini · ChatGPT) 에 붙여넣고, 받은 답변을 다시 붙여넣으면
          다음 AI 호출에 자동 반영됩니다.
        </p>
        {requests.map((req) => (
          <RequestRow
            key={req.id}
            projectId={projectId}
            stepKey={stepKey}
            request={req}
          />
        ))}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────
// 단건 Row
// ─────────────────────────────────────────

interface RequestRowProps {
  projectId: string
  stepKey: StepKey
  request: ResolvedResearchRequest
}

function RequestRow({ projectId, stepKey, request }: RequestRowProps) {
  const hasAnswer = !!request.savedAnswer
  const [expanded, setExpanded] = useState(!hasAnswer && !request.optional)
  const [pasteMode, setPasteMode] = useState(false)
  const [pasteContent, setPasteContent] = useState(request.savedAnswer ?? '')
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleted, setDeleted] = useState(false)
  // 저장된 답변 로컬 캐시 (서버에서 받은 최신 상태로 보여주기 위함)
  const [localAnswer, setLocalAnswer] = useState<string | undefined>(
    request.savedAnswer,
  )
  const [whyOpen, setWhyOpen] = useState(false)

  const answered = !!localAnswer && !deleted

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(request.promptTemplate)
      setCopied(true)
      toast.success(
        `"${request.title}" 프롬프트 복사 완료 — 외부 LLM 에 붙여넣으세요`,
      )
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('클립보드 접근 실패')
    }
  }

  const saveAnswer = async () => {
    if (!pasteContent.trim()) {
      toast.error('답변을 붙여넣어 주세요')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stepKey,
          requestId: request.id,
          answer: pasteContent.trim(),
          stores: request.stores,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? '저장 실패')
      }
      setLocalAnswer(pasteContent.trim())
      setDeleted(false)
      setPasteMode(false)
      setExpanded(false)
      toast.success('리서치 답변 저장 — 다음 AI 호출에 자동 반영됩니다')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '저장 실패'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const deleteAnswer = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/research`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: request.id }),
      })
      if (!res.ok) throw new Error('삭제 실패')
      setLocalAnswer(undefined)
      setDeleted(true)
      setPasteContent('')
      setPasteMode(false)
      toast.success('답변 삭제')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '삭제 실패'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className={cn(
        'rounded-md border bg-background p-2.5 transition-colors',
        answered
          ? 'border-green-200 bg-green-50/40'
          : 'border-primary/20',
      )}
    >
      {/* 타이틀 라인 */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-1.5 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {answered && <Check className="h-3 w-3 shrink-0 text-green-600" />}
            <p className="text-xs font-medium leading-tight">
              {request.title}
            </p>
            {request.optional && (
              <Badge variant="outline" className="text-[9px]">
                선택
              </Badge>
            )}
          </div>
          {/* Phase F (ADR-008): Value Chain 단계 뱃지 + 씨앗/수확 링크 힌트 */}
          {(request.valueChainStage || request.seedOrHarvest) && (
            <StageMetaLine
              stage={request.valueChainStage}
              seedOrHarvest={request.seedOrHarvest}
              currentStep={stepKey}
            />
          )}
        </div>
        <span className="shrink-0 pt-0.5 text-muted-foreground">
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </span>
      </button>

      {/* 요약 프리뷰 (닫힌 상태) */}
      {!expanded && answered && (
        <p className="mt-1 text-[10px] leading-relaxed text-green-800 line-clamp-2">
          {localAnswer!.slice(0, 120)}
          {localAnswer!.length > 120 ? '...' : ''}
        </p>
      )}

      {/* 펼침 — whyAsking + 액션 영역 */}
      {expanded && (
        <div className="mt-2 space-y-2">
          {/* whyAsking */}
          <div>
            <button
              type="button"
              onClick={() => setWhyOpen((v) => !v)}
              className="flex items-center gap-1 text-[10px] font-medium text-primary/80 hover:text-primary"
            >
              <Sparkles className="h-3 w-3" />
              {whyOpen ? '왜 이걸 묻는지 접기' : '왜 이걸 묻는지 보기'}
            </button>
            {whyOpen && (
              <p className="mt-1 rounded bg-primary/5 p-1.5 text-[10px] leading-relaxed text-muted-foreground">
                {request.whyAsking}
              </p>
            )}
          </div>

          {/* 저장된 답변 전체 */}
          {answered && !pasteMode && (
            <div className="rounded border border-green-200 bg-green-50/60 p-2">
              <p className="text-[10px] leading-relaxed text-green-900 whitespace-pre-wrap">
                {localAnswer}
              </p>
            </div>
          )}

          {/* 붙여넣기 모드 */}
          {pasteMode && (
            <div className="space-y-1.5">
              <Textarea
                placeholder="외부 LLM 에서 받은 답변을 여기에 붙여넣기..."
                className="h-28 text-xs"
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  {pasteContent.length > 0 ? `${pasteContent.length}자` : ''}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px]"
                    onClick={() => {
                      setPasteMode(false)
                      setPasteContent(localAnswer ?? '')
                    }}
                  >
                    취소
                  </Button>
                  <Button
                    size="sm"
                    className="h-6 text-[10px] gap-1"
                    disabled={saving || !pasteContent.trim()}
                    onClick={saveAnswer}
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" /> 저장 중
                      </>
                    ) : (
                      '저장'
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* 액션 버튼 */}
          {!pasteMode && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-6 flex-1 gap-1 text-[10px]"
                onClick={copyPrompt}
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 text-green-600" /> 복사됨
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" /> 프롬프트 복사
                  </>
                )}
              </Button>
              <Button
                variant={answered ? 'ghost' : 'default'}
                size="sm"
                className="h-6 flex-1 text-[10px]"
                onClick={() => {
                  setPasteMode(true)
                  setPasteContent(localAnswer ?? '')
                }}
              >
                {answered ? '수정' : '답변 붙여넣기'}
              </Button>
              {answered && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                  disabled={saving}
                  onClick={deleteAnswer}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────
// Phase F (ADR-008) Value Chain 단계 메타 라인
// ─────────────────────────────────────────

interface StageMetaLineProps {
  stage?: ValueChainStage
  seedOrHarvest?: 'seed' | 'harvest'
  currentStep: StepKey
}

/**
 * 리서치 카드 타이틀 아래에 표시되는 Value Chain 메타:
 *  - 단계 뱃지 (① Impact 등, 색상 코드)
 *  - 씨앗🌱(앞 스텝에서 뿌리는 준비) / 수확🌾(뒷 스텝에서 확정) 힌트
 *  - 씨앗/수확이면 실제 연결 스텝 명시 ("Step 5 에서 수확" 또는 "Step 1·2 에서 이어짐")
 */
function StageMetaLine({ stage, seedOrHarvest, currentStep }: StageMetaLineProps) {
  const spec = stage ? VALUE_CHAIN_STAGES[stage] : null

  // 씨앗이면 해당 단계가 완성되는 스텝 (통상 impact 단계 = Step 5 임팩트)
  // 수확이면 이전에 씨앗을 뿌린 스텝들 — STAGE_TO_STEPS 에서 현재 스텝 제외
  let linkHint: string | null = null
  if (seedOrHarvest === 'seed' && stage) {
    const targetSteps = STAGE_TO_STEPS[stage].filter((s) => s !== currentStep)
    if (targetSteps.length > 0) {
      linkHint = `Step 5 에서 수확`
    }
  } else if (seedOrHarvest === 'harvest' && stage) {
    // 수확은 씨앗이 뿌려진 "앞 스텝들" 을 암시 — 현재 스텝 앞에 있는 스텝들
    linkHint = `앞 스텝들에서 이어짐`
  }

  return (
    <div className="mt-1 flex items-center gap-1.5 text-[9px] text-muted-foreground">
      {spec && (
        <span
          className="inline-flex items-center rounded px-1.5 py-0.5 font-semibold"
          style={{
            backgroundColor: `${spec.colorHex}18`,
            color: spec.colorHex,
            borderLeft: `2px solid ${spec.colorHex}`,
          }}
        >
          {spec.numberedLabel}
        </span>
      )}
      {seedOrHarvest === 'seed' && (
        <span className="text-amber-700" title="씨앗 — 앞 스텝에서 미리 뿌리는 준비 질문">
          🌱 씨앗
        </span>
      )}
      {seedOrHarvest === 'harvest' && (
        <span className="text-orange-700" title="수확 — 앞에서 뿌린 씨앗을 여기서 확정">
          🌾 수확
        </span>
      )}
      {linkHint && (
        <span className="text-[9px] italic text-muted-foreground/80">· {linkHint}</span>
      )}
    </div>
  )
}
