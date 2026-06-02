/**
 * render-spec — DeckSpec(JSON) → React 엘리먼트 배열 (DECK-3, ADR-025 Phase 3)
 *
 * 스펙↔렌더 계약의 **유일한 React 경계**. 순수 JSON DeckSpec 을 받아 DECK-2 리치
 * 컴포넌트(`rich/index.tsx`)·diagrams(`BeforeAfter`)·SlideShell 로 매핑해
 * `renderDeckToPdf`(DECK-1)에 그대로 투입 가능한 ReactElement[] 를 만든다.
 *
 * 동형성 보장: 각 컴포넌트는 spec 필드를 **그대로** props 로 받는다. spec(z.infer)과
 * 컴포넌트 props 가 어긋나면 **이 파일이 컴파일 에러**(tsc) — 계약 위반을 빌드가 잡는다.
 *
 * 안전망: 입력은 먼저 zod 로 검증(parseDeckSpec). 알 수 없는 kind 는 discriminatedUnion 이
 * 이미 reject 하므로 여기 도달하지 않지만, exhaustive switch 로 컴파일 타임에도 누락을 막는다.
 *
 * 표지/디바이더/마무리는 컴포넌트가 아니라 SlideShell + 인라인 마크업(deck-v3.tsx 패턴 미러).
 * 'use client' 없음 — renderToStaticMarkup 안전.
 */
import React from 'react'
import { SlideShell } from '@/components/express/slides/SlideShell'
import { BeforeAfter } from '@/components/express/slides/diagrams'
import {
  IconProcess,
  IconCardGrid,
  PhotoOrgGrid,
  PartnerLogoGrid,
  BadgeRow,
  BigNumberHero,
  AnnotatedImage,
  MilestoneTimeline,
  EvidenceBand,
  CoachDetailGrid,
  CurriculumMatrix,
  KpiWithLogic,
  StrategyCanvas,
} from '@/components/express/slides/rich'
import {
  parseDeckSpec,
  type DeckSpec,
  type DeckSlide,
  type SlideSpec,
  type StackablePart,
} from './spec'

/** never 도달 = exhaustive switch 보장 (kind 누락 시 컴파일 에러). */
function assertNever(x: never): never {
  throw new Error(`[render-spec] 처리되지 않은 slide kind: ${JSON.stringify(x)}`)
}

// ─────────────────────────────────────────
// 표지/디바이더/마무리 — SlideShell + 인라인 마크업 (deck-v3.tsx 패턴)
// ─────────────────────────────────────────
function renderCover(b: Extract<SlideSpec, { kind: 'cover' }>): React.ReactElement {
  return (
    <SlideShell variant="cover" density="sparse" backgroundImage={b.backgroundImage}>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 'var(--ud-gap-section)',
        }}
      >
        {b.eyebrow && <span className="ud-kicker en">{b.eyebrow}</span>}
        <h1 className="ud-display">{b.title}</h1>
        {b.subtitle && (
          <p className="ud-body" style={{ maxWidth: '64%' }}>
            {b.subtitle}
          </p>
        )}
      </div>
      <div
        className="ud-page-foot"
        style={b.backgroundImage ? { borderTop: '1px solid rgba(255,255,255,0.4)' } : undefined}
      >
        <img
          src={`/design-kit/logo/underdogs-wordmark-${b.backgroundImage ? 'white' : 'black'}.svg`}
          alt="Underdogs"
          className="ud-logo ud-logo--big"
        />
        {b.footnote && (
          <span
            className="ud-caption en"
            style={b.backgroundImage ? { color: 'var(--ud-white)' } : undefined}
          >
            {b.footnote}
          </span>
        )}
      </div>
    </SlideShell>
  )
}

function renderSectionDivider(
  b: Extract<SlideSpec, { kind: 'sectionDivider' }>,
): React.ReactElement {
  return (
    <SlideShell variant="section-divider" density="sparse">
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 'var(--ud-gap-element)',
        }}
      >
        {b.eyebrow && <span className="ud-kicker en">{b.eyebrow}</span>}
        <h1 className="ud-display">{b.display}</h1>
        <p className="ud-section-name">{b.sectionName}</p>
      </div>
    </SlideShell>
  )
}

function renderClosing(b: Extract<SlideSpec, { kind: 'closing' }>): React.ReactElement {
  return (
    <SlideShell
      variant="cover"
      density="sparse"
      dark={!b.backgroundImage}
      backgroundImage={b.backgroundImage}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 'var(--ud-gap-section)',
        }}
      >
        {b.eyebrow && <span className="ud-kicker en">{b.eyebrow}</span>}
        <h1 className="ud-display">{b.title}</h1>
        {b.subtitle && (
          <p className="ud-body" style={{ maxWidth: '70%' }}>
            {b.subtitle}
          </p>
        )}
      </div>
      <div className="ud-page-foot" style={{ borderTop: '1px solid rgba(255,255,255,0.4)' }}>
        <img
          src="/design-kit/logo/underdogs-wordmark-white.svg"
          alt="Underdogs"
          className="ud-logo ud-logo--big"
        />
        {b.footnote && (
          <span className="ud-caption en" style={{ color: 'var(--ud-white)' }}>
            {b.footnote}
          </span>
        )}
      </div>
    </SlideShell>
  )
}

/**
 * 적층 가능 컴포넌트(StackablePart) spec → 컴포넌트 엘리먼트. 동형성: spec 필드 = props.
 * (exhaustive switch — 새 part kind 추가 시 컴파일 에러로 누락 방지.)
 */
function renderPart(b: StackablePart): React.ReactElement {
  switch (b.kind) {
    // DECK-1 리치 8종
    case 'iconProcess':
      return <IconProcess kicker={b.kicker} headline={b.headline} steps={b.steps} />
    case 'iconCardGrid':
      return (
        <IconCardGrid kicker={b.kicker} headline={b.headline} columns={b.columns} cards={b.cards} />
      )
    case 'photoOrgGrid':
      return (
        <PhotoOrgGrid
          kicker={b.kicker}
          headline={b.headline}
          people={b.people}
          columns={b.columns}
        />
      )
    case 'partnerLogoGrid':
      return (
        <PartnerLogoGrid
          kicker={b.kicker}
          headline={b.headline}
          partners={b.partners}
          columns={b.columns}
          fill={b.fill}
        />
      )
    case 'badgeRow':
      return <BadgeRow badges={b.badges} />
    case 'bigNumberHero':
      return (
        <BigNumberHero
          kicker={b.kicker}
          headline={b.headline}
          bigNumber={b.bigNumber}
          bigCaption={b.bigCaption}
          supportingPoints={b.supportingPoints}
        />
      )
    case 'annotatedImage':
      return (
        <AnnotatedImage
          kicker={b.kicker}
          headline={b.headline}
          image={b.image}
          annotations={b.annotations}
        />
      )
    case 'milestoneTimeline':
      return (
        <MilestoneTimeline kicker={b.kicker} headline={b.headline} milestones={b.milestones} />
      )

    // DECK-2 밀도 5종 + beforeAfter
    case 'evidenceBand':
      return <EvidenceBand label={b.label} items={b.items} />
    case 'coachDetailGrid':
      return (
        <CoachDetailGrid
          kicker={b.kicker}
          headline={b.headline}
          coaches={b.coaches}
          evidence={b.evidence}
          columns={b.columns}
        />
      )
    case 'curriculumMatrix':
      return (
        <CurriculumMatrix
          kicker={b.kicker}
          headline={b.headline}
          phases={b.phases}
          evidence={b.evidence}
        />
      )
    case 'kpiWithLogic':
      return (
        <KpiWithLogic kicker={b.kicker} headline={b.headline} kpis={b.kpis} evidence={b.evidence} />
      )
    case 'strategyCanvas':
      return (
        <StrategyCanvas
          kicker={b.kicker}
          headline={b.headline}
          zones={b.zones}
          evidence={b.evidence}
          columns={b.columns}
        />
      )
    case 'beforeAfter':
      return (
        <BeforeAfter
          kicker={b.kicker}
          headline={b.headline}
          before={b.before}
          after={b.after}
          fill={b.fill}
        />
      )
    default:
      return assertNever(b)
  }
}

/**
 * composite — 여러 part 를 한 SlideShell 안에서 세로로 적층 (deck-v3 슬라이드 2·6·8 패턴).
 * growIndex 가 가리키는 part 는 flex:1 로 신장해 가용 높이를 채운다(dead-space 축소).
 */
function renderComposite(
  b: Extract<SlideSpec, { kind: 'composite' }>,
): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        gap: 'var(--ud-gap-element)',
      }}
    >
      {b.parts.map((part, i) =>
        i === b.growIndex ? (
          <div key={i} style={{ flex: 1, display: 'flex' }}>
            {renderPart(part)}
          </div>
        ) : (
          <React.Fragment key={i}>{renderPart(part)}</React.Fragment>
        ),
      )}
    </div>
  )
}

/**
 * 슬라이드 body spec → 컴포넌트/표지 엘리먼트. (exhaustive — 새 kind 컴파일 에러.)
 */
function renderBody(b: SlideSpec): React.ReactElement {
  switch (b.kind) {
    case 'cover':
      return renderCover(b)
    case 'sectionDivider':
      return renderSectionDivider(b)
    case 'closing':
      return renderClosing(b)
    case 'composite':
      return renderComposite(b)
    default:
      // 나머지는 전부 StackablePart (리치 컴포넌트) — renderPart 위임.
      return renderPart(b)
  }
}

/** 본문 슬라이드 — body 를 SlideShell 로 감싼다. pageNumber/totalPages 는 호출부가 주입. */
function renderShellSlide(
  slide: DeckSlide,
  pageNumber: number,
  totalPages: number,
): React.ReactElement {
  const inner = renderBody(slide.body)
  // 표지/디바이더/마무리는 자체 SlideShell 을 가지므로 그대로 반환.
  if (slide.body.kind === 'cover' || slide.body.kind === 'sectionDivider' || slide.body.kind === 'closing') {
    return inner
  }
  return (
    <SlideShell
      kicker={slide.meta?.kicker}
      density={slide.meta?.density ?? 'dense'}
      pageNumber={pageNumber}
      totalPages={totalPages}
    >
      {inner}
    </SlideShell>
  )
}

/**
 * DeckSpec(JSON) → ReactElement[]. `renderDeckToPdf` 에 바로 투입.
 *
 * - 입력은 zod 로 검증(parseDeckSpec). 잘못된 kind/누락 슬롯은 여기서 throw(안전망).
 * - 본문 슬라이드 페이지 번호는 **비본문(표지/디바이더/마무리) 제외 1-base** — deck-v3 와 동일.
 *
 * @param input  손작성/LLM 산출 DeckSpec (검증 전 unknown 도 허용 — 내부에서 parse).
 */
export function deckSpecToElements(input: DeckSpec | unknown): React.ReactElement[] {
  const deck = parseDeckSpec(input)

  // totalPages = 본문(비표지) 슬라이드 수 (deck-v3: pageNumber 는 본문만 카운트)
  const bodyCount = deck.slides.filter(
    (s) =>
      s.body.kind !== 'cover' &&
      s.body.kind !== 'sectionDivider' &&
      s.body.kind !== 'closing',
  ).length

  let pageNumber = 0
  return deck.slides.map((slide, i) => {
    const isBody =
      slide.body.kind !== 'cover' &&
      slide.body.kind !== 'sectionDivider' &&
      slide.body.kind !== 'closing'
    if (isBody) pageNumber += 1
    return (
      <React.Fragment key={i}>{renderShellSlide(slide, pageNumber, bodyCount)}</React.Fragment>
    )
  })
}
