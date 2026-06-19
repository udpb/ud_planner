'use client'
/**
 * ReasoningTooltip — Phase G2 (2026-05-28)
 *
 * AI 가 hierarchy/sectionMeta 를 생성한 추론 근거를 PM 에게 노출.
 * ⓘ 아이콘 → 클릭 시 펼침 (matchedAssetIds + patternIds + reasoning).
 *
 * 신뢰도 효과:
 *   - "왜 이 결과를 추천했지?" 즉시 답
 *   - 자산·패턴 ID 가 표시되면 PM 이 사용처 추적 가능
 *   - reasoning 1줄로 매칭 논리 검증 가능
 *
 * 사용처:
 *   - DraftEnrichmentEditor (hierarchy.sourceTrace · sectionMeta.sourceTrace)
 *   - S5Summary (sectionMeta.sourceTrace 옆)
 *   - S3Checklist (lens issues.suggestion 의 패턴 인용 옆)
 */

import { useState } from 'react'
import type { SourceTrace } from '@/lib/express/schema'

export interface ReasoningTooltipProps {
  trace: SourceTrace | undefined | null
  /** 작은 크기 (10px 아이콘) vs 일반 (12px) */
  size?: 'sm' | 'md'
  /** 추가 className */
  className?: string
}

export function ReasoningTooltip({ trace, size = 'sm', className = '' }: ReasoningTooltipProps) {
  const [open, setOpen] = useState(false)

  // sourceTrace 가 없거나 비어있으면 노출 X
  if (!trace) return null
  const hasAssets = (trace.matchedAssetIds?.length ?? 0) > 0
  const hasPatterns = (trace.patternIds?.length ?? 0) > 0
  const hasReasoning = !!trace.reasoning?.trim()
  if (!hasAssets && !hasPatterns && !hasReasoning) return null

  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'
  const fontSize = size === 'sm' ? 'text-[9px]' : 'text-[10px]'

  return (
    <div className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`inline-flex ${iconSize} cursor-pointer items-center justify-center border text-[8px] font-bold transition-colors hover:bg-brand/10`}
        style={{
          borderColor: 'var(--primary-orange)',
          color: 'var(--primary-orange)',
        }}
        title="AI 추론 근거 보기"
      >
        i
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-30 mt-1 min-w-[280px] max-w-[400px] border bg-white p-2.5 shadow-lg"
          style={{
            borderColor: 'var(--hairline-strong, #e4dfd6)',
            borderLeft: '3px solid var(--primary-orange)',
          }}
        >
          <div
            className={`mb-1.5 font-bold uppercase tracking-[0.5px] ${fontSize}`}
            style={{ color: 'var(--primary-orange)' }}
          >
            🔍 AI 추론 근거 (Phase G2)
          </div>
          {hasReasoning && (
            <div className={`mb-1.5 ${fontSize}`} style={{ color: 'var(--body-text, #333)' }}>
              {trace.reasoning}
            </div>
          )}
          {hasAssets && (
            <div className="mb-1">
              <div
                className={`mb-0.5 font-semibold uppercase tracking-[0.5px] ${fontSize}`}
                style={{ color: 'var(--subtitle-text)' }}
              >
                인용 자산
              </div>
              <div className="flex flex-wrap gap-1">
                {trace.matchedAssetIds!.map((id) => (
                  <span
                    key={id}
                    className={`inline-flex items-center bg-orange-50 px-1.5 py-0.5 ${fontSize} font-mono`}
                    style={{ color: 'var(--primary-orange)' }}
                  >
                    {id}
                  </span>
                ))}
              </div>
            </div>
          )}
          {hasPatterns && (
            <div>
              <div
                className={`mb-0.5 font-semibold uppercase tracking-[0.5px] ${fontSize}`}
                style={{ color: 'var(--subtitle-text)' }}
              >
                인용 패턴
              </div>
              <div className="flex flex-wrap gap-1">
                {trace.patternIds!.map((id) => (
                  <span
                    key={id}
                    className={`inline-flex items-center bg-blue-50 px-1.5 py-0.5 ${fontSize} font-mono`}
                    style={{ color: '#2563eb' }}
                  >
                    {id}
                  </span>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={() => setOpen(false)}
            className={`mt-2 ${fontSize}`}
            style={{ color: 'var(--subtitle-text)' }}
          >
            닫기 ×
          </button>
        </div>
      )}
    </div>
  )
}
