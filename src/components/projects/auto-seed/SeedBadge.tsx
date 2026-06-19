'use client'

/**
 * SeedBadge — F2 (Wave V, ADR-015)
 *
 * "AI 자동 시드" 시각 마커. 커리큘럼 회차 카드 / 예산 AC 카드에 inline 노출.
 *
 * source:
 *   - 'AI' — AI 가 생성한 콘텐츠 (자동 회차 / 자동 예산 시드)
 *   - 'CostStandard' — DB CostStandard 의 시장가 (단가 출처)
 *   - 'Fallback' — 코드 hardcode 추정 (단가 출처)
 *   - 'PM' — PM 직접 작성 (수동 — 비교용)
 *
 * 디자인 — Wave U citation chip 패턴 재사용 (ActionAI 토큰).
 */

import { cn } from '@/lib/utils'
import { Sparkles, Database, Hash, User } from 'lucide-react'

interface Props {
  source: 'AI' | 'CostStandard' | 'Fallback' | 'PM'
  /** 선택 — 옆에 표시할 작은 라벨 (예: "DOGS", "ACTT 사전", "단가 추정") */
  label?: string
  /** 신뢰도 시각화 (선택) */
  confidence?: 'high' | 'medium' | 'low'
  className?: string
}

const SOURCE_META: Record<
  Props['source'],
  { icon: React.ComponentType<{ className?: string }>; tone: string; defaultLabel: string }
> = {
  AI: {
    icon: Sparkles,
    tone: 'bg-[color:var(--primary-orange)]/10 text-[color:var(--primary-orange)] border-[color:var(--primary-orange)]/30',
    defaultLabel: 'AI 자동',
  },
  CostStandard: {
    icon: Database,
    tone: 'bg-[color:var(--cyan)]/10 text-[color:var(--cyan)] border-[color:var(--cyan)]/30',
    defaultLabel: '시장가',
  },
  Fallback: {
    icon: Hash,
    tone: 'bg-slate-100 text-slate-700 border-slate-200',
    defaultLabel: '추정',
  },
  PM: {
    icon: User,
    tone: 'bg-[color:var(--green)]/10 text-[color:var(--green)] border-[color:var(--green)]/30',
    defaultLabel: 'PM 작성',
  },
}

const CONFIDENCE_LABEL: Record<NonNullable<Props['confidence']>, string> = {
  high: '신뢰 높음',
  medium: '신뢰 중간',
  low: '신뢰 낮음',
}

export function SeedBadge({ source, label, confidence, className }: Props) {
  const meta = SOURCE_META[source]
  const Icon = meta.icon
  const displayLabel = label ?? meta.defaultLabel
  const title = confidence
    ? `${displayLabel} · ${CONFIDENCE_LABEL[confidence]}`
    : displayLabel

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px] font-medium',
        meta.tone,
        className,
      )}
      title={title}
    >
      <Icon className="h-2.5 w-2.5" />
      {displayLabel}
    </span>
  )
}
