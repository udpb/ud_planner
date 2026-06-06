/**
 * Rich Slide Components — DECK-1 (ADR-025 Phase 1)
 *
 * OOXML 8패턴으로 불가능했던 어휘를 HTML/CSS 로 시연:
 *   DECK-1:
 *   - IconProcess     : 단색 라인 아이콘 단계 흐름
 *   - IconCardGrid    : 아이콘 + 제목 + 설명 카드 그리드 (밀도 높은 커리큘럼/전략)
 *   - PhotoOrgGrid    : 사진(이미지 슬롯) 박힌 코치/조직 카드
 *   - PartnerLogoGrid : 실적/파트너 로고·마크 그리드
 *   - BadgeRow        : 인증/실적 배지 행
 *   - BigNumberHero   : 빅넘버 hero (One Loudest)
 *   - AnnotatedImage  : 주석 박힌 이미지 블록
 *   - MilestoneTimeline: 아이콘 마일스톤 타임라인
 *
 *   DECK-2 (당선 덱 밀도·디테일 — ADR-025 Phase 2):
 *   - EvidenceBand    : 근거 밴드 (수치 + 무엇을 증명 + 출처) — 본문 슬라이드 의무 layer
 *   - CoachDetailCard : 코치 상세 (사진+이름+직함+약력 2~3줄+정량 실적 배지)
 *   - CurriculumMatrix: 주차×트랙 매트릭스 (셀마다 핵심활동+산출물, Action Week 강조)
 *   - KpiWithLogic    : KPI 빅넘버 + 산출 논리(메커니즘) + SROI
 *   - StrategyCanvas  : 2~3존 전략 캔버스 (각 블록 근거 한 줄)
 *
 * 모두 정적 렌더(renderToStaticMarkup) 안전 · 순수 함수 · 디자인 킷 준수
 * (accent F05519 최소, radius 0(전역 강제), shadow/gradient/emoji 금지, NanumHuman/Poppins).
 *
 * 밀도 측정: 각 정보 블록은 `data-block` 속성을 가진다(하니스가 결정론적으로 카운트).
 * 근거 밴드는 `data-evidence-band`. 빽빽하되 4단계 위계(kicker/heading/body/caption)+정렬 유지.
 *
 * 신규 컴포넌트만 추가 — 기존 props 불변(하위호환).
 */
import React from 'react'
import { Icon, type IconName } from './icons'

// 공통 헤더 (diagrams 와 동일 톤 — 중복 정의로 의존 최소화)
function RichHeader({ kicker, headline }: { kicker?: string; headline: string }) {
  return (
    <div style={{ marginBottom: 'var(--ud-gap-element)' }}>
      {kicker && <span className="ud-label en">{kicker}</span>}
      <h2 className="ud-section-title" style={{ marginTop: 'var(--ud-s-2)' }}>
        {headline}
      </h2>
    </div>
  )
}

// ─────────────────────────────────────────
// 1. IconProcess — 단색 라인 아이콘 단계 흐름
// ─────────────────────────────────────────
export interface IconProcessProps {
  kicker?: string
  headline: string
  steps: { icon: IconName; num?: string; label: string; description?: string }[]
}

export function IconProcess({ kicker, headline, steps }: IconProcessProps) {
  return (
    <div>
      <RichHeader kicker={kicker} headline={headline} />
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 'var(--ud-s-3)', marginTop: 'var(--ud-s-5)' }}>
        {steps.map((s, i) => (
          <React.Fragment key={i}>
            <div
              data-block="icon-process-step"
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--ud-s-2)',
                padding: 'var(--ud-s-4)',
                border: '1px solid var(--ud-line)',
                background: 'var(--ud-paper)',
              }}
            >
              <Icon name={s.icon} size={36} color="var(--ud-accent)" />
              {s.num && (
                <span className="ud-label en" style={{ color: 'var(--ud-muted)' }}>
                  {s.num}
                </span>
              )}
              <p style={{ margin: 0, fontWeight: 700, fontSize: 'var(--ud-type-body)', color: 'var(--ud-ink)', lineHeight: 1.3 }}>
                {s.label}
              </p>
              {s.description && <p className="ud-caption" style={{ lineHeight: 1.4 }}>{s.description}</p>}
            </div>
            {i < steps.length - 1 && (
              <div style={{ alignSelf: 'center', color: 'var(--ud-ink)', fontWeight: 700, fontSize: 24 }}>›</div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// 2. IconCardGrid — 아이콘 카드 그리드 (밀도 높은 커리큘럼/전략)
// ─────────────────────────────────────────
export interface IconCardGridProps {
  kicker?: string
  headline: string
  columns?: 2 | 3 | 4
  cards: { icon: IconName; tag?: string; title: string; description?: string; highlight?: boolean }[]
}

export function IconCardGrid({ kicker, headline, columns = 3, cards }: IconCardGridProps) {
  return (
    <div>
      <RichHeader kicker={kicker} headline={headline} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: 'var(--ud-s-3)',
          marginTop: 'var(--ud-s-5)',
        }}
      >
        {cards.map((c, i) => (
          <div
            key={i}
            data-block="icon-card"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--ud-s-2)',
              padding: 'var(--ud-s-4)',
              border: c.highlight ? '2px solid var(--ud-accent)' : '1px solid var(--ud-line)',
              background: c.highlight ? 'var(--ud-accent-88)' : 'var(--ud-paper)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Icon name={c.icon} size={28} color="var(--ud-accent)" />
              {c.tag && (
                <span className="ud-label en" style={{ color: 'var(--ud-muted)', fontSize: 'var(--ud-type-caption)' }}>
                  {c.tag}
                </span>
              )}
            </div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 'var(--ud-type-body)', color: 'var(--ud-ink)', lineHeight: 1.3 }}>
              {c.title}
            </p>
            {c.description && <p className="ud-caption" style={{ lineHeight: 1.45 }}>{c.description}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// 3. PhotoOrgGrid — 사진(이미지 슬롯) 코치/조직 카드
// ─────────────────────────────────────────
export interface PhotoOrgGridProps {
  kicker?: string
  headline: string
  people: { photo: string; name: string; role: string; tags?: string[] }[]
  columns?: 3 | 4
}

export function PhotoOrgGrid({ kicker, headline, people, columns = 4 }: PhotoOrgGridProps) {
  return (
    <div>
      <RichHeader kicker={kicker} headline={headline} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: 'var(--ud-s-4)',
          marginTop: 'var(--ud-s-5)',
        }}
      >
        {people.map((p, i) => (
          <div key={i} data-block="photo-person" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ud-s-3)' }}>
            <div
              style={{
                width: '100%',
                aspectRatio: '1 / 1',
                background: 'var(--ud-neutral-60)',
                overflow: 'hidden',
                filter: 'grayscale(1) contrast(1.05)',
              }}
            >
              <img src={p.photo} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 'var(--ud-type-body)', color: 'var(--ud-ink)' }}>{p.name}</p>
              <p className="ud-caption" style={{ color: 'var(--ud-accent)', fontWeight: 600 }}>{p.role}</p>
              {p.tags && p.tags.length > 0 && (
                <p className="ud-caption" style={{ marginTop: 'var(--ud-s-1)' }}>{p.tags.join(' · ')}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// 4. PartnerLogoGrid — 실적/파트너 로고·마크 그리드
// ─────────────────────────────────────────
export interface PartnerLogoGridProps {
  kicker?: string
  headline: string
  /** logo = 이미지 경로(data URI/절대경로) 또는 텍스트 워드마크. note = 한 줄 역할/관계(DECK-2 디테일) */
  partners: { logo?: string; name: string; note?: string }[]
  columns?: 4 | 5 | 6
  /** 가용 높이를 채워 행을 균등 신장 (DECK-2 페이지 채움) — flex 컨테이너 안에서 height:100% */
  fill?: boolean
}

export function PartnerLogoGrid({ kicker, headline, partners, columns = 5, fill = false }: PartnerLogoGridProps) {
  const rowCount = Math.ceil(partners.length / columns)
  return (
    <div style={fill ? { display: 'flex', flexDirection: 'column', height: '100%', width: '100%' } : undefined}>
      <RichHeader kicker={kicker} headline={headline} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gridTemplateRows: fill ? `repeat(${rowCount}, 1fr)` : undefined,
          gap: 0,
          marginTop: 'var(--ud-s-5)',
          border: '1px solid var(--ud-line)',
          flex: fill ? 1 : undefined,
        }}
      >
        {partners.map((p, i) => {
          const col = i % columns
          const row = Math.floor(i / columns)
          const lastRow = Math.floor((partners.length - 1) / columns)
          return (
            <div
              key={i}
              data-block="partner-logo"
              style={{
                minHeight: 84,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--ud-s-2)',
                padding: 'var(--ud-s-4)',
                borderRight: col < columns - 1 ? '1px solid var(--ud-line)' : 'none',
                borderBottom: row < lastRow ? '1px solid var(--ud-line)' : 'none',
              }}
            >
              {p.logo ? (
                <img src={p.logo} alt={p.name} style={{ maxHeight: 36, maxWidth: '80%', objectFit: 'contain' }} />
              ) : (
                <span
                  className="en"
                  style={{ fontWeight: 600, fontSize: 'var(--ud-type-body)', color: 'var(--ud-muted)', letterSpacing: '0.02em', textAlign: 'center' }}
                >
                  {p.name}
                </span>
              )}
              {p.note && <span className="ud-caption" style={{ textAlign: 'center', lineHeight: 1.3 }}>{p.note}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// 5. BadgeRow — 인증/실적 배지 행
// ─────────────────────────────────────────
export interface BadgeRowProps {
  badges: { icon?: IconName; value: string; label: string }[]
}

export function BadgeRow({ badges }: BadgeRowProps) {
  return (
    <div style={{ display: 'flex', gap: 'var(--ud-s-3)', flexWrap: 'wrap' }}>
      {badges.map((b, i) => (
        <div
          key={i}
          data-block="badge"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--ud-s-3)',
            padding: 'var(--ud-s-3) var(--ud-s-4)',
            border: '1px solid var(--ud-ink)',
            background: 'var(--ud-paper)',
          }}
        >
          {b.icon && <Icon name={b.icon} size={24} color="var(--ud-accent)" />}
          <div>
            <p className="en" style={{ margin: 0, fontWeight: 700, fontSize: 'var(--ud-type-body)', color: 'var(--ud-ink)', lineHeight: 1 }}>
              {b.value}
            </p>
            <p className="ud-caption" style={{ marginTop: 2 }}>{b.label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────
// 6. BigNumberHero — 빅넘버 hero (One Loudest)
// ─────────────────────────────────────────
export interface BigNumberHeroProps {
  kicker?: string
  headline: string
  bigNumber: string
  bigCaption: string
  supportingPoints?: { value: string; label: string }[]
}

export function BigNumberHero({ kicker, headline, bigNumber, bigCaption, supportingPoints }: BigNumberHeroProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <RichHeader kicker={kicker} headline={headline} />
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 'var(--ud-s-7)', alignItems: 'stretch', flex: 1 }}>
        <div data-block="big-number" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <p
            className="en"
            style={{ margin: 0, fontSize: 'calc(var(--ud-type-display) * 2.1)', fontWeight: 800, color: 'var(--ud-accent)', lineHeight: 0.9, letterSpacing: '-0.03em' }}
          >
            {bigNumber}
          </p>
          <p style={{ margin: 'var(--ud-s-4) 0 0', fontWeight: 700, fontSize: 'var(--ud-type-body)', color: 'var(--ud-ink)', lineHeight: 1.4 }}>
            {bigCaption}
          </p>
        </div>
        {supportingPoints && supportingPoints.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 'var(--ud-s-4)', borderLeft: '2px solid var(--ud-ink)', paddingLeft: 'var(--ud-s-5)', paddingTop: 'var(--ud-s-2)', paddingBottom: 'var(--ud-s-2)' }}>
            {supportingPoints.map((sp, i) => (
              <div key={i} data-block="support-point">
                <p className="en" style={{ margin: 0, fontSize: 'var(--ud-type-section-title)', fontWeight: 700, color: 'var(--ud-ink)', lineHeight: 1 }}>
                  {sp.value}
                </p>
                <p className="ud-caption" style={{ marginTop: 'var(--ud-s-1)' }}>{sp.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// 7. AnnotatedImage — 주석 박힌 이미지 블록
// ─────────────────────────────────────────
export interface AnnotatedImageProps {
  kicker?: string
  headline: string
  image: string
  annotations: { title: string; description?: string }[]
}

export function AnnotatedImage({ kicker, headline, image, annotations }: AnnotatedImageProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <RichHeader kicker={kicker} headline={headline} />
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 'var(--ud-s-5)', flex: 1, marginTop: 'var(--ud-s-4)' }}>
        <div style={{ background: 'var(--ud-neutral-60)', overflow: 'hidden' }}>
          <img src={image} alt={headline} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ud-s-4)', justifyContent: 'center' }}>
          {annotations.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 'var(--ud-s-3)' }}>
              <span className="en" style={{ fontWeight: 800, fontSize: 'var(--ud-type-section-title)', color: 'var(--ud-accent)', lineHeight: 1 }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 'var(--ud-type-body)', color: 'var(--ud-ink)' }}>{a.title}</p>
                {a.description && <p className="ud-caption" style={{ marginTop: 'var(--ud-s-1)', lineHeight: 1.45 }}>{a.description}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// 8. MilestoneTimeline — 아이콘 마일스톤 타임라인
// ─────────────────────────────────────────
export interface MilestoneTimelineProps {
  kicker?: string
  headline: string
  milestones: { icon: IconName; period: string; title: string; description?: string }[]
}

export function MilestoneTimeline({ kicker, headline, milestones }: MilestoneTimelineProps) {
  return (
    <div>
      <RichHeader kicker={kicker} headline={headline} />
      <div style={{ position: 'relative', marginTop: 'var(--ud-s-6)' }}>
        {/* axis */}
        <div style={{ position: 'absolute', top: 18, left: 0, right: 0, height: 2, background: 'var(--ud-ink)' }} />
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${milestones.length}, 1fr)`, gap: 'var(--ud-s-3)' }}>
          {milestones.map((m, i) => (
            <div key={i} data-block="milestone" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--ud-s-2)' }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 0,
                  background: 'var(--ud-accent)',
                  color: 'var(--ud-white)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                <Icon name={m.icon} size={22} color="var(--ud-white)" />
              </div>
              <span className="ud-label en" style={{ color: 'var(--ud-muted)' }}>{m.period}</span>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 'var(--ud-type-body)', color: 'var(--ud-ink)', lineHeight: 1.3 }}>{m.title}</p>
              {m.description && <p className="ud-caption" style={{ lineHeight: 1.4 }}>{m.description}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════
// DECK-2 — 당선 덱 밀도·디테일 컴포넌트 (ADR-025 Phase 2)
// 슬라이드 = 한 주장 + 다층 증거. 각 본문 슬라이드는 디테일 레이어 + 근거 밴드로 페이지를 채운다.
// ═════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────
// 9. EvidenceBand — 근거 밴드 (수치 + 무엇을 증명 + 출처)
//    "출처 태그"가 아니라 "수치 → 무엇을 증명 → 출처" 3요소. 본문 슬라이드 의무 layer.
// ─────────────────────────────────────────
export interface EvidenceItem {
  /** 정량 수치 (Poppins en) — 예 "39%", "₩48억", "1:5" */
  figure: string
  /** 이 수치가 무엇을 증명하는가 (so-what) */
  proves: string
  /** 출처 — 기관·연도·문서 */
  source: string
}
export interface EvidenceBandProps {
  /** 좌측 라벨 — 예 "EVIDENCE" / "근거" */
  label?: string
  items: EvidenceItem[]
}

export function EvidenceBand({ label = 'EVIDENCE', items }: EvidenceBandProps) {
  return (
    <div
      data-evidence-band="true"
      style={{
        display: 'grid',
        gridTemplateColumns: `120px repeat(${items.length}, 1fr)`,
        gap: 0,
        border: '1px solid var(--ud-line)',
        borderLeft: '3px solid var(--ud-accent)',
        background: 'var(--ud-neutral-90)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', padding: 'var(--ud-s-3) var(--ud-s-4)', borderRight: '1px solid var(--ud-line)' }}>
        <span className="ud-label en" style={{ lineHeight: 1.2 }}>{label}</span>
      </div>
      {items.map((it, i) => (
        <div
          key={i}
          data-block="evidence"
          style={{
            padding: 'var(--ud-s-3) var(--ud-s-4)',
            borderRight: i < items.length - 1 ? '1px solid var(--ud-line)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--ud-s-1)',
          }}
        >
          <span className="en" style={{ fontWeight: 700, fontSize: 'var(--ud-type-body)', color: 'var(--ud-accent)', lineHeight: 1 }}>
            {it.figure}
          </span>
          <span style={{ fontSize: 'var(--ud-type-caption)', color: 'var(--ud-ink)', fontWeight: 600, lineHeight: 1.35 }}>{it.proves}</span>
          <span className="ud-caption" style={{ color: 'var(--ud-muted)', lineHeight: 1.3 }}>{it.source}</span>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────
// 10. CoachDetailCard 그리드 — 사진+이름+직함+약력 2~3줄+정량 실적 배지
// ─────────────────────────────────────────
export interface CoachDetail {
  photo: string
  name: string
  role: string
  /** 전 직장·전문 — 한 줄 */
  affiliation: string
  /** 약력 2~3줄 */
  bio: string[]
  /** 정량 실적 배지 — value + label */
  stats: { value: string; label: string }[]
  /** 담당 트랙 태그 */
  tracks?: string[]
}
export interface CoachDetailGridProps {
  kicker?: string
  headline: string
  coaches: CoachDetail[]
  /** 하단 근거 밴드 */
  evidence?: EvidenceItem[]
  columns?: 2 | 4
}

export function CoachDetailGrid({ kicker, headline, coaches, evidence, columns = 4 }: CoachDetailGridProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 'var(--ud-gap-element)' }}>
      <RichHeader kicker={kicker} headline={headline} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: 'var(--ud-s-3)',
          flex: 1,
        }}
      >
        {coaches.map((c, i) => (
          <div
            key={i}
            data-block="coach-card"
            style={{
              display: 'flex',
              flexDirection: 'column',
              border: '1px solid var(--ud-line)',
              background: 'var(--ud-paper)',
            }}
          >
            <div style={{ display: 'flex', gap: 'var(--ud-s-3)', padding: 'var(--ud-s-3)', borderBottom: '1px solid var(--ud-line)' }}>
              <div
                style={{ width: 56, height: 56, flexShrink: 0, background: 'var(--ud-neutral-60)', overflow: 'hidden', filter: 'grayscale(1) contrast(1.05)' }}
              >
                <img src={c.photo} alt={c.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 'var(--ud-type-body)', color: 'var(--ud-ink)', lineHeight: 1.15 }}>{c.name}</p>
                <p className="ud-caption" style={{ color: 'var(--ud-accent)', fontWeight: 600, marginTop: 2 }}>{c.role}</p>
                <p className="ud-caption" style={{ marginTop: 2, lineHeight: 1.25 }}>{c.affiliation}</p>
              </div>
            </div>
            {/* DECK-4: bio 영역이 가용 높이를 채우도록 항목을 세로 균등 분배(중앙 공백 제거). */}
            <div style={{ padding: 'var(--ud-s-3)', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <ul style={{ margin: 0, paddingLeft: 'var(--ud-s-4)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, gap: 'var(--ud-s-2)' }}>
                {c.bio.map((b, bi) => (
                  <li key={bi} className="ud-caption" style={{ lineHeight: 1.45, color: 'var(--ud-soft-ink)' }}>{b}</li>
                ))}
              </ul>
            </div>
            <div style={{ display: 'flex', borderTop: '1px solid var(--ud-line)' }}>
              {c.stats.map((s, si) => (
                <div
                  key={si}
                  data-block="coach-stat"
                  style={{
                    flex: 1,
                    padding: 'var(--ud-s-2) var(--ud-s-3)',
                    borderRight: si < c.stats.length - 1 ? '1px solid var(--ud-line)' : 'none',
                    background: 'var(--ud-accent-88)',
                  }}
                >
                  <p className="en" style={{ margin: 0, fontWeight: 700, fontSize: 'var(--ud-type-caption)', color: 'var(--ud-accent)', lineHeight: 1.1 }}>
                    {s.value}
                  </p>
                  <p className="ud-caption" style={{ marginTop: 1, lineHeight: 1.2 }}>{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {evidence && evidence.length > 0 && <EvidenceBand items={evidence} />}
    </div>
  )
}

// ─────────────────────────────────────────
// 11. CurriculumMatrix — 주차×트랙 매트릭스 (셀마다 핵심활동+산출물, Action Week 강조)
// ─────────────────────────────────────────
export interface CurriculumPhase {
  /** 주차 범위 — 예 "W1–4" */
  weeks: string
  /** 단계명 */
  phase: string
  /** 핵심 활동 2~3개 */
  activities: string[]
  /** 산출물(deliverable) */
  deliverable: string
  /** Action Week 강조 */
  actionWeek?: boolean
}
export interface CurriculumMatrixProps {
  kicker?: string
  headline: string
  phases: CurriculumPhase[]
  evidence?: EvidenceItem[]
}

export function CurriculumMatrix({ kicker, headline, phases, evidence }: CurriculumMatrixProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 'var(--ud-gap-element)' }}>
      <RichHeader kicker={kicker} headline={headline} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${phases.length}, 1fr)`,
          gap: 0,
          border: '1px solid var(--ud-line)',
          flex: 1,
        }}
      >
        {phases.map((ph, i) => (
          <div
            key={i}
            data-block="curriculum-phase"
            style={{
              display: 'flex',
              flexDirection: 'column',
              borderRight: i < phases.length - 1 ? '1px solid var(--ud-line)' : 'none',
              background: ph.actionWeek ? 'var(--ud-accent-88)' : 'var(--ud-paper)',
            }}
          >
            {/* phase head */}
            <div
              style={{
                padding: 'var(--ud-s-3)',
                borderBottom: ph.actionWeek ? '2px solid var(--ud-accent)' : '1px solid var(--ud-line)',
                background: ph.actionWeek ? 'var(--ud-accent)' : 'var(--ud-ink)',
                color: 'var(--ud-white)',
              }}
            >
              <span className="ud-label en" style={{ color: 'var(--ud-white)', opacity: 0.85 }}>{ph.weeks}</span>
              <p style={{ margin: '2px 0 0', fontWeight: 700, fontSize: 'var(--ud-type-body)', color: 'var(--ud-white)', lineHeight: 1.15 }}>{ph.phase}</p>
              {ph.actionWeek && (
                <p className="ud-caption en" style={{ color: 'var(--ud-white)', fontWeight: 600, marginTop: 2, letterSpacing: '0.08em' }}>ACTION WEEK</p>
              )}
            </div>
            {/* activities — DECK-4: 활동 목록이 가용 높이를 채우도록 세로 균등 분배(셀 중앙 공백 제거). */}
            <div style={{ padding: 'var(--ud-s-3)', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <span className="ud-label" style={{ color: 'var(--ud-muted)', fontSize: 'calc(var(--ud-type-label) * 0.85)' }}>핵심 활동</span>
              <ul style={{ margin: '6px 0 0', paddingLeft: 'var(--ud-s-4)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, gap: 'var(--ud-s-2)' }}>
                {ph.activities.map((a, ai) => (
                  <li key={ai} className="ud-caption" style={{ lineHeight: 1.4, color: 'var(--ud-soft-ink)' }}>{a}</li>
                ))}
              </ul>
            </div>
            {/* deliverable */}
            <div data-block="curriculum-deliverable" style={{ padding: 'var(--ud-s-2) var(--ud-s-3)', borderTop: '1px solid var(--ud-line)', background: ph.actionWeek ? 'transparent' : 'var(--ud-neutral-90)' }}>
              <span className="ud-label" style={{ color: 'var(--ud-accent)', fontSize: 'calc(var(--ud-type-label) * 0.85)' }}>산출물</span>
              <p className="ud-caption" style={{ marginTop: 2, fontWeight: 600, color: 'var(--ud-ink)', lineHeight: 1.3 }}>{ph.deliverable}</p>
            </div>
          </div>
        ))}
      </div>
      {evidence && evidence.length > 0 && <EvidenceBand items={evidence} />}
    </div>
  )
}

// ─────────────────────────────────────────
// 12. KpiWithLogic — KPI 빅넘버 + 산출 논리(메커니즘) + SROI
// ─────────────────────────────────────────
export interface KpiLogicItem {
  value: string
  label: string
  /** 어떻게 그 숫자가 나오는지 (산출 논리) */
  logic: string
}
export interface KpiWithLogicProps {
  kicker?: string
  headline: string
  kpis: KpiLogicItem[]
  evidence?: EvidenceItem[]
}

export function KpiWithLogic({ kicker, headline, kpis, evidence }: KpiWithLogicProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 'var(--ud-gap-element)' }}>
      <RichHeader kicker={kicker} headline={headline} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${kpis.length}, 1fr)`,
          gap: 0,
          border: '2px solid var(--ud-ink)',
          flex: 1,
        }}
      >
        {kpis.map((k, i) => (
          <div
            key={i}
            data-block="kpi-logic"
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: 'var(--ud-s-4)',
              borderRight: i < kpis.length - 1 ? '1px solid var(--ud-line)' : 'none',
              gap: 'var(--ud-s-2)',
            }}
          >
            <p className="en" style={{ margin: 0, fontSize: 'calc(var(--ud-type-display) * 0.75)', fontWeight: 800, color: 'var(--ud-accent)', lineHeight: 0.95, letterSpacing: '-0.02em' }}>
              {k.value}
            </p>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 'var(--ud-type-body)', color: 'var(--ud-ink)', lineHeight: 1.2 }}>{k.label}</p>
            <div data-block="kpi-derivation" style={{ marginTop: 'auto', borderTop: '1px solid var(--ud-line)', paddingTop: 'var(--ud-s-2)' }}>
              <span className="ud-label" style={{ color: 'var(--ud-muted)', fontSize: 'calc(var(--ud-type-label) * 0.85)' }}>산출 논리</span>
              <p className="ud-caption" style={{ marginTop: 2, lineHeight: 1.35, color: 'var(--ud-soft-ink)' }}>{k.logic}</p>
            </div>
          </div>
        ))}
      </div>
      {evidence && evidence.length > 0 && <EvidenceBand items={evidence} />}
    </div>
  )
}

// ─────────────────────────────────────────
// 13. StrategyCanvas — 2~3존 전략 캔버스 (각 블록 근거 한 줄)
// ─────────────────────────────────────────
export interface StrategyZone {
  icon: IconName
  num?: string
  title: string
  /** 본문 설명 */
  body: string
  /** 근거 한 줄 (수치 포함 권장) */
  rationale: string
  highlight?: boolean
}
export interface StrategyCanvasProps {
  kicker?: string
  headline: string
  zones: StrategyZone[]
  evidence?: EvidenceItem[]
  columns?: 2 | 3 | 4
}

export function StrategyCanvas({ kicker, headline, zones, evidence, columns = 4 }: StrategyCanvasProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 'var(--ud-gap-element)' }}>
      <RichHeader kicker={kicker} headline={headline} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: 'var(--ud-s-3)',
          flex: 1,
        }}
      >
        {zones.map((z, i) => (
          <div
            key={i}
            data-block="strategy-zone"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--ud-s-2)',
              padding: 'var(--ud-s-4)',
              border: z.highlight ? '2px solid var(--ud-accent)' : '1px solid var(--ud-line)',
              background: z.highlight ? 'var(--ud-accent-88)' : 'var(--ud-paper)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Icon name={z.icon} size={30} color="var(--ud-accent)" />
              {z.num && <span className="ud-label en" style={{ color: 'var(--ud-muted)' }}>{z.num}</span>}
            </div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 'var(--ud-type-body)', color: 'var(--ud-ink)', lineHeight: 1.2 }}>{z.title}</p>
            {/* DECK-4: 본문을 가용 높이에 채워 세로 중앙 정렬(아이콘/제목과 근거 사이 공백 제거). */}
            <p className="ud-caption" style={{ lineHeight: 1.5, flex: 1, display: 'flex', alignItems: 'center' }}>{z.body}</p>
            <div data-block="strategy-rationale" style={{ borderTop: '1px solid var(--ud-line)', paddingTop: 'var(--ud-s-2)' }}>
              <p className="ud-caption" style={{ color: 'var(--ud-accent)', fontWeight: 600, lineHeight: 1.3 }}>{z.rationale}</p>
            </div>
          </div>
        ))}
      </div>
      {evidence && evidence.length > 0 && <EvidenceBand items={evidence} />}
    </div>
  )
}
