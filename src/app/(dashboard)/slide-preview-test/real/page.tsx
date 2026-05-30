/**
 * Real generated slides preview — M4 (2026-05-30)
 * URL: /slide-preview-test/real
 *
 * /api/dev/ultimate-draft 로 실제 RFP(성균관대 GTM) 전체 파이프라인을 돌려
 * 생성된 ExpressDraft (generated-draft.json) 를 그대로 렌더.
 * mock 이 아닌 "실제 LLM 산출물" 의 시각 완성도 검증용.
 */

import { PpProposalSlides } from '@/components/express/slides/PpProposalSlides'
import type { ExpressDraft } from '@/lib/express/schema'
import generated from './generated-draft.json'

const draft = generated as unknown as ExpressDraft

export default function RealSlidePreviewPage() {
  const specCount = Array.isArray(draft.slideSpecs) ? draft.slideSpecs.length : 0
  const sectionCount = draft.sections ? Object.keys(draft.sections).length : 0
  return (
    <div className="min-h-screen bg-muted/30 py-8">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">실제 생성 슬라이드 — M4 (성균관대 GTM 풀 파이프라인)</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            /api/dev/ultimate-draft 실 LLM · {sectionCount}/7 섹션 · {specCount} 도식화 슬라이드.
            mock 아님 — RFP → 1차본 → slideSpec 전 과정 자동 생성 결과.
          </p>
        </div>
        <PpProposalSlides
          draft={draft}
          clientName="성균관대학교 창업지원단"
          projectName="2025 창업중심대학 Go to Market(GTM) 프로그램"
        />
      </div>
    </div>
  )
}
