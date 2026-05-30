'use client'
/**
 * PpProposalSlides — Phase M2 (2026-05-29)
 *
 * ExpressDraft → 다중 슬라이드 시퀀스 자동 생성.
 *
 * 슬라이드 구성:
 *   1. 표지 (intent + 발주처)
 *   2. INDEX (목차 — 7 sections)
 *   3-N. Section divider + content slides (각 section 별 1-3 슬라이드)
 *   마지막. 마무리 (감사 인사 + 로고)
 *
 * 디자인 시스템 100% 준수:
 *   - 한 화면 한 메시지
 *   - 텍스트 위계 4단계 (kicker/heading/body/caption)
 *   - One Loudest (display 1회/슬라이드)
 *   - 폰트 교차 금지
 *   - 로고 최소 1개
 *
 * 토큰 cost = 0 (이미 생성된 draft 를 렌더링만)
 */

import type { ExpressDraft } from '@/lib/express/schema'
import { SlideShell } from './SlideShell'
import {
  ProcessFlow,
  Matrix2x2,
  KpiGrid,
  HierarchyTree,
  Timeline,
  ComparisonTable,
  ArchitectureStack,
  BeforeAfter,
} from './diagrams'

const SECTION_TITLES: Record<string, { num: string; ko: string; en: string }> = {
  '1': { num: '01', ko: '제안 배경 및 목적', en: 'BACKGROUND & PURPOSE' },
  '2': { num: '02', ko: '추진 전략 및 방법론', en: 'STRATEGY & METHOD' },
  '3': { num: '03', ko: '교육 커리큘럼', en: 'CURRICULUM' },
  '4': { num: '04', ko: '운영 체계 및 코치진', en: 'OPERATION & COACHES' },
  '5': { num: '05', ko: '예산 및 경제성', en: 'BUDGET & FEASIBILITY' },
  '6': { num: '06', ko: '기대 성과 및 임팩트', en: 'IMPACT' },
  '7': { num: '07', ko: '수행 역량 및 실적', en: 'TRACK RECORD' },
}

interface PpProposalSlidesProps {
  draft: ExpressDraft
  clientName?: string | null
  projectName?: string | null
  /** scale for sidebar preview (true → smaller fonts) */
  scalePreview?: boolean
  /** show 1 specific slide (0-indexed) or all */
  onlySlide?: number
}

export function PpProposalSlides({
  draft,
  clientName,
  projectName,
  scalePreview = false,
  onlySlide,
}: PpProposalSlidesProps) {
  const slides = buildSlideSequence(draft, { clientName, projectName, scalePreview })

  if (onlySlide !== undefined) {
    return slides[onlySlide] ?? <PpEmptySlide scalePreview={scalePreview} />
  }

  return (
    <div className="flex flex-col gap-4">
      {slides.map((s, i) => (
        <div key={i} className="rounded border border-border bg-muted/10 overflow-hidden">
          {s}
        </div>
      ))}
    </div>
  )
}

function buildSlideSequence(
  draft: ExpressDraft,
  opts: { clientName?: string | null; projectName?: string | null; scalePreview: boolean },
): React.ReactElement[] {
  const slides: React.ReactElement[] = []
  let pageNum = 0

  // slideSpecs 기반 빌드 vs legacy 텍스트 빌드 결정
  const useSlideSpecs = Array.isArray(draft.slideSpecs) && draft.slideSpecs.length > 0

  // 슬라이드 총 수 미리 계산
  const totalSpecs = useSlideSpecs ? (draft.slideSpecs?.length ?? 0) : 0
  const sectionsPresent = ['1', '2', '3', '4', '5', '6', '7'].filter(
    (n) => !!draft.sections?.[n as keyof typeof draft.sections],
  ).length
  const total = useSlideSpecs
    ? 2 + sectionsPresent + totalSpecs + 1 // cover + index + divider×N + specs + closing
    : countTotalSlides(draft)

  // 1. 표지
  slides.push(<PpCoverSlide key="cover" draft={draft} clientName={opts.clientName} projectName={opts.projectName} scalePreview={opts.scalePreview} />)
  pageNum++

  // 2. INDEX
  slides.push(<PpIndexSlide key="index" draft={draft} pageNumber={++pageNum} totalPages={total} scalePreview={opts.scalePreview} />)

  if (useSlideSpecs) {
    // O4 path — section 별 slideSpecs 렌더
    const specsBySection = new Map<string, any[]>()
    for (const spec of draft.slideSpecs as any[]) {
      if (!spec || !spec.sectionNum) continue
      if (!specsBySection.has(spec.sectionNum)) specsBySection.set(spec.sectionNum, [])
      specsBySection.get(spec.sectionNum)!.push(spec)
    }
    for (const sectionNum of ['1', '2', '3', '4', '5', '6', '7']) {
      if (!draft.sections?.[sectionNum as keyof typeof draft.sections]) continue
      const info = SECTION_TITLES[sectionNum]
      if (!info) continue
      slides.push(
        <PpSectionDividerSlide
          key={`div-${sectionNum}`}
          kickerNum={info.num}
          sectionEn={info.en}
          sectionKo={info.ko}
          pageNumber={++pageNum}
          totalPages={total}
          scalePreview={opts.scalePreview}
        />,
      )
      const specs = (specsBySection.get(sectionNum) ?? []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      for (const spec of specs) {
        slides.push(
          <PpSpecSlide
            key={`spec-${sectionNum}-${spec.order}`}
            spec={spec}
            pageNumber={++pageNum}
            totalPages={total}
            scalePreview={opts.scalePreview}
          />,
        )
      }
    }
  } else {
    // Legacy text-only path
    for (const sectionNum of ['1', '2', '3', '4', '5', '6', '7']) {
      const sectionContent = draft.sections?.[sectionNum as keyof typeof draft.sections]
      if (!sectionContent) continue
      const info = SECTION_TITLES[sectionNum]
      if (!info) continue
      slides.push(
        <PpSectionDividerSlide
          key={`div-${sectionNum}`}
          kickerNum={info.num}
          sectionEn={info.en}
          sectionKo={info.ko}
          pageNumber={++pageNum}
          totalPages={total}
          scalePreview={opts.scalePreview}
        />,
      )
      const hierarchy = draft.messageHierarchy?.find((h: any) => h && (h.sectionRef === sectionNum || h.section === sectionNum))
      if (hierarchy && (hierarchy.key || (hierarchy.sub && hierarchy.sub.length > 0))) {
        slides.push(
          <PpMessageHierarchySlide
            key={`msg-${sectionNum}`}
            kicker={`${info.num} ${info.ko}`}
            hierarchy={hierarchy}
            pageNumber={++pageNum}
            totalPages={total}
            scalePreview={opts.scalePreview}
          />,
        )
      }
      slides.push(
        <PpSectionBodySlide
          key={`body-${sectionNum}`}
          kicker={`${info.num} ${info.ko}`}
          sectionTitle={info.ko}
          body={sectionContent}
          sectionMeta={draft.sectionMeta?.[sectionNum as keyof typeof draft.sectionMeta]}
          pageNumber={++pageNum}
          totalPages={total}
          scalePreview={opts.scalePreview}
        />,
      )
    }
  }

  // 마지막. 마무리
  slides.push(<PpClosingSlide key="closing" pageNumber={++pageNum} totalPages={total} scalePreview={opts.scalePreview} />)

  return slides
}

// ─────────────────────────────────────────
// SlideSpec 렌더링 — diagram 컴포넌트 + headline + evidence
// ─────────────────────────────────────────
function PpSpecSlide({
  spec,
  pageNumber,
  totalPages,
  scalePreview,
}: BaseSlideProps & { spec: any }) {
  const diagram = renderDiagram(spec)
  return (
    <SlideShell kicker={spec.kicker} pageNumber={pageNumber} totalPages={totalPages} scalePreview={scalePreview}>
      {/* headline — One Page One Thesis */}
      <h2 className="ud-section-title" style={{ maxWidth: '85%' }}>
        {spec.headline}
      </h2>
      {spec.caption && <p className="ud-caption">{spec.caption}</p>}
      <hr className="ud-divider" />
      {/* diagram */}
      {diagram && <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>{diagram}</div>}
      {/* evidence */}
      {Array.isArray(spec.evidence) && spec.evidence.length > 0 && (
        <div className="ud-box-tint" style={{ marginTop: 'var(--ud-gap-element)' }}>
          <span className="ud-label">근거</span>
          <ul style={{ margin: 'var(--ud-s-2) 0 0', paddingLeft: 'var(--ud-s-4)' }}>
            {spec.evidence.slice(0, 3).map((e: any, i: number) => (
              <li key={i} className="ud-caption" style={{ marginBottom: 'var(--ud-s-1)' }}>
                {e.text}
                {e.source && <span style={{ marginLeft: 'var(--ud-s-2)', color: 'var(--ud-muted-2)' }}>· {e.source}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </SlideShell>
  )
}

function renderDiagram(spec: any): React.ReactNode {
  const pattern = spec?.diagram?.pattern
  const data = spec?.diagram?.data
  if (!pattern) return null
  // diagram 컴포넌트가 headline 도 받는데, slide level 에서 이미 표시 → 빈 headline 전달
  const noHeadline = ''
  switch (pattern) {
    case 'process-flow':
      return data?.steps ? <ProcessFlow headline={noHeadline} steps={data.steps} /> : null
    case 'matrix-2x2':
      return data?.quadrants ? <Matrix2x2 headline={noHeadline} axisX={data.axisX} axisY={data.axisY} quadrants={data.quadrants} /> : null
    case 'kpi-grid':
      return data?.kpis ? <KpiGrid headline={noHeadline} columns={data.columns ?? 3} kpis={data.kpis} /> : null
    case 'hierarchy-tree':
      return data?.root && data?.children ? <HierarchyTree headline={noHeadline} root={data.root} children={data.children} /> : null
    case 'timeline':
      return data?.units && data?.tracks ? <Timeline headline={noHeadline} units={data.units} tracks={data.tracks} /> : null
    case 'comparison-table':
      return data?.rows ? <ComparisonTable headline={noHeadline} leftLabel={data.leftLabel} rightLabel={data.rightLabel} rows={data.rows} /> : null
    case 'architecture-stack':
      return data?.layers ? <ArchitectureStack headline={noHeadline} layers={data.layers} /> : null
    case 'before-after':
      return data?.before && data?.after ? <BeforeAfter headline={noHeadline} before={data.before} after={data.after} /> : null
    case 'text-only':
      return null
    default:
      return null
  }
}

function countTotalSlides(draft: ExpressDraft): number {
  let count = 2 // 표지 + INDEX
  for (const num of ['1', '2', '3', '4', '5', '6', '7']) {
    const sectionContent = draft.sections?.[num as keyof typeof draft.sections]
    if (!sectionContent) continue
    count += 1 // section divider
    const hierarchy = draft.messageHierarchy?.find((h: any) => h && (h.sectionRef === num || h.section === num))
    if (hierarchy && (hierarchy.key || (hierarchy.sub && hierarchy.sub.length > 0))) count += 1 // message slide
    count += 1 // body slide
  }
  count += 1 // closing
  return count
}

// ─────────────────────────────────────────────
// 슬라이드 컴포넌트들
// ─────────────────────────────────────────────

interface BaseSlideProps {
  scalePreview?: boolean
  pageNumber?: number
  totalPages?: number
}

function PpEmptySlide({ scalePreview }: BaseSlideProps) {
  return (
    <SlideShell density="standard" scalePreview={scalePreview} className="ud-empty">
      <p className="ud-empty-msg">RFP 업로드 후 슬라이드가 자동 생성됩니다.</p>
    </SlideShell>
  )
}

function PpCoverSlide({
  draft,
  clientName,
  projectName,
  scalePreview,
}: BaseSlideProps & { draft: ExpressDraft; clientName?: string | null; projectName?: string | null }) {
  return (
    <SlideShell variant="cover" density="sparse" scalePreview={scalePreview}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 'var(--ud-gap-section)' }}>
        {clientName && <span className="ud-kicker en">{clientName}</span>}
        <h1 className="ud-display">{projectName ?? '제안서'}</h1>
        {draft.intent && <p className="ud-body" style={{ maxWidth: '70%' }}>{draft.intent}</p>}
      </div>
      <div className="ud-page-foot" style={{ borderTop: 'none' }}>
        <img src="/design-kit/logo/underdogs-wordmark-black.svg" alt="Underdogs" className="ud-logo ud-logo--big" />
        <span className="ud-caption en">언더독스 · UNDERDOGS</span>
      </div>
    </SlideShell>
  )
}

function PpIndexSlide({
  draft,
  pageNumber,
  totalPages,
  scalePreview,
}: BaseSlideProps & { draft: ExpressDraft }) {
  const presentSections = ['1', '2', '3', '4', '5', '6', '7'].filter(
    (n) => !!draft.sections?.[n as keyof typeof draft.sections],
  )
  return (
    <SlideShell kicker="INDEX" pageNumber={pageNumber} totalPages={totalPages} scalePreview={scalePreview}>
      <h2 className="ud-section-title">목차</h2>
      <hr className="ud-divider-strong" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ud-gap-element)' }}>
        {presentSections.map((n) => {
          const info = SECTION_TITLES[n]
          return (
            <div key={n} style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--ud-s-5)' }}>
              <span className="ud-label en" style={{ minWidth: 32 }}>{info.num}</span>
              <span className="ud-body" style={{ flex: 1, color: 'var(--ud-ink)', fontWeight: 500 }}>
                {info.ko}
              </span>
              <span className="ud-caption en">{info.en}</span>
            </div>
          )
        })}
      </div>
    </SlideShell>
  )
}

function PpSectionDividerSlide({
  kickerNum,
  sectionEn,
  sectionKo,
  pageNumber,
  totalPages,
  scalePreview,
}: BaseSlideProps & { kickerNum: string; sectionEn: string; sectionKo: string }) {
  return (
    <SlideShell variant="section-divider" density="sparse" pageNumber={pageNumber} totalPages={totalPages} scalePreview={scalePreview}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 'var(--ud-s-5)' }}>
        <span className="ud-kicker en">{kickerNum}</span>
        <h1 className="ud-display en">{sectionEn}</h1>
        <p className="ud-section-name">{sectionKo}</p>
      </div>
    </SlideShell>
  )
}

function PpMessageHierarchySlide({
  kicker,
  hierarchy,
  pageNumber,
  totalPages,
  scalePreview,
}: BaseSlideProps & { kicker: string; hierarchy: any }) {
  return (
    <SlideShell kicker={kicker} pageNumber={pageNumber} totalPages={totalPages} scalePreview={scalePreview}>
      {hierarchy.key && (
        <h2 className="ud-section-title" style={{ maxWidth: '80%' }}>
          {hierarchy.key}
        </h2>
      )}
      <hr className="ud-divider" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ud-gap-element)' }}>
        {Array.isArray(hierarchy.sub) &&
          hierarchy.sub.slice(0, 3).map((s: string, i: number) => (
            <div key={i} className="ud-msg-card">
              <p className="ud-msg-sub">
                <span className="ud-label en" style={{ marginRight: 'var(--ud-s-3)' }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                {s}
              </p>
            </div>
          ))}
      </div>
      {Array.isArray(hierarchy.quantProofs) && hierarchy.quantProofs.length > 0 && (
        <div className="ud-box-tint" style={{ marginTop: 'var(--ud-gap-element)' }}>
          <span className="ud-label">정량 근거</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--ud-gap-element)', marginTop: 'var(--ud-s-3)' }}>
            {hierarchy.quantProofs.slice(0, 3).map((p: string, i: number) => (
              <p key={i} className="ud-msg-proof">{p}</p>
            ))}
          </div>
        </div>
      )}
    </SlideShell>
  )
}

function PpSectionBodySlide({
  kicker,
  sectionTitle,
  body,
  sectionMeta,
  pageNumber,
  totalPages,
  scalePreview,
}: BaseSlideProps & {
  kicker: string
  sectionTitle: string
  body: string
  sectionMeta?: any
}) {
  const headline = sectionMeta?.headline ?? sectionTitle
  const subtitle = sectionMeta?.subtitle

  // body 를 단락 단위로 분리 — 한 슬라이드 한 메시지 원칙
  const paragraphs = body
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .slice(0, 4)

  return (
    <SlideShell kicker={kicker} pageNumber={pageNumber} totalPages={totalPages} scalePreview={scalePreview}>
      <h2 className="ud-section-title">{headline}</h2>
      {subtitle && <p className="ud-caption" style={{ marginTop: 'var(--ud-s-2)' }}>{subtitle}</p>}
      <hr className="ud-divider" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ud-gap-element)', maxHeight: '70%', overflow: 'hidden' }}>
        {paragraphs.map((p, i) => (
          <p key={i} className="ud-body">{p}</p>
        ))}
      </div>
    </SlideShell>
  )
}

function PpClosingSlide({ pageNumber, totalPages, scalePreview }: BaseSlideProps) {
  return (
    <SlideShell variant="section-divider" density="sparse" pageNumber={pageNumber} totalPages={totalPages} scalePreview={scalePreview}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 'var(--ud-s-5)' }}>
        <span className="ud-kicker en">THANK YOU</span>
        <h1 className="ud-display en">UNDERDOGS</h1>
        <p className="ud-caption" style={{ color: 'var(--ud-white)' }}>
          창업가의 페이스 메이커
        </p>
      </div>
    </SlideShell>
  )
}
