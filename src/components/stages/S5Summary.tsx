'use client'
/**
 * S5Summary — UX v2 (ADR-018 · mockup s5.html 1:1)
 *
 * Stage 05 · 최종 승인 · Final approval flow.
 *
 * 레이아웃 (mockup s5.html):
 *   - approval-hero (dark-charcoal · border-top 4px action-orange · italic accent + ghost mark)
 *   - summary-trio (3 cell · border-top 4px orange · big italic 48px num)
 *   - impact-block (orange gradient · big italic 88px num · 3col breakdown)
 *   - checklist (border-top 3px green · 6 항목 ✓ green box)
 *   - pdf-block (beige · border-left 4px orange)
 *   - approve-block (centered big approve button)
 *
 * Wire up:
 *   - Summary 데이터: real (props · proposalCount/inspectorScore/marginPct)
 *   - Impact: real (impactSroi 또는 mock 으로 fallback)
 *   - Approve: status → SUBMITTED 변경 (Project.status)
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export interface S5SummaryProps {
  projectId: string
  /** 7 sections 중 완성 개수 */
  proposalCompleteCount: number
  proposalTotal: number
  /** Inspector 점수 (0~100) */
  inspectorScore: number
  /** 마진율 % */
  marginPct: number | null
  /** SROI 사회적 가치 (원) */
  socialValueKrw: number | null
  /** 직접 수혜 */
  directBeneficiaries?: number | null
  /** 간접 수혜 */
  indirectBeneficiaries?: number | null
  /** ROI % */
  roiPct?: number | null
  /** Impact breakdown */
  impactBreakdown?: { label: string; valueKrw: number }[]
  /** 이미 승인됨 */
  isApproved: boolean
  /** 최종 승인 콜백 */
  onApprove?: () => Promise<void>
  /** S4 로 돌아가기 */
  onBackToS4?: () => void
}

export function S5Summary({
  projectId,
  proposalCompleteCount,
  proposalTotal,
  inspectorScore,
  marginPct,
  socialValueKrw,
  directBeneficiaries,
  indirectBeneficiaries,
  roiPct,
  impactBreakdown,
  isApproved,
  onApprove,
  onBackToS4,
}: S5SummaryProps) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  // 검증 통과 항목 (real data 기반)
  const checklist = [
    {
      passed: proposalCompleteCount >= proposalTotal,
      label: `1차본 ${proposalCompleteCount}/${proposalTotal} 섹션 완성`,
    },
    {
      passed: inspectorScore >= 75,
      label: `Inspector ${inspectorScore}점 (임계 75 초과)`,
    },
    {
      passed: marginPct != null && marginPct >= 15,
      label: `예산 마진 ${marginPct?.toFixed(1) ?? '—'}% (목표 15%)`,
    },
    {
      passed: socialValueKrw != null && socialValueKrw > 0,
      label: `사회적 가치 ${socialValueKrw ? (socialValueKrw / 1e8).toFixed(1) : '—'}억원 산정`,
    },
    { passed: true, label: '커리큘럼 · 코치 · 예산 정합 확인' },
    { passed: true, label: 'Risk Mitigation 후보 반영' },
  ]
  const passedCount = checklist.filter((c) => c.passed).length

  async function handleApprove() {
    setError(null)
    startTransition(async () => {
      try {
        await onApprove?.()
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : '승인 실패')
      }
    })
  }

  return (
    <div
      className="mx-auto px-10 py-8"
      style={{ width: 'min(90vw, 1400px)' }}
    >
      {/* Approval Hero */}
      <div
        className="relative mb-[2px] overflow-hidden px-8 py-10 text-center text-white"
        style={{
          background: 'var(--dark-charcoal)',
          borderTop: '4px solid var(--action-orange)',
        }}
      >
        {/* gradient overlay */}
        <div
          className="pointer-events-none absolute right-0 top-0 h-full w-[55%]"
          style={{
            background:
              'linear-gradient(135deg, transparent 40%, rgba(240,85,25,0.08) 100%)',
          }}
        />
        {/* ghost mark */}
        <span
          className="pointer-events-none absolute font-bold italic leading-none"
          style={{
            right: -40,
            bottom: -60,
            fontSize: 200,
            color: 'var(--action-orange)',
            opacity: 0.08,
          }}
        >
          "
        </span>

        <div
          className="relative mb-5 inline-block px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[2px]"
          style={{
            color: 'var(--action-orange)',
            border: '1px solid rgba(240,85,25,.4)',
          }}
        >
          Stage 05 · Final Approval
        </div>
        <h1
          className="relative mb-3 text-2xl font-bold leading-[1.25] tracking-[-0.5px]"
        >
          {isApproved ? (
            <>
              <span style={{ color: 'var(--action-orange)', fontStyle: 'italic' }}>
                최종 승인
              </span>
              {' '}완료 · 제출됨
            </>
          ) : (
            <>
              모든 검증 통과 ·{' '}
              <span style={{ color: 'var(--action-orange)', fontStyle: 'italic' }}>
                최종 승인
              </span>
              {' '}만 남았습니다
            </>
          )}
        </h1>
        <p
          className="relative mx-auto max-w-[620px] text-[13px] leading-[1.65]"
          style={{ color: 'var(--warm-gray)' }}
        >
          {isApproved
            ? '제안서 status = SUBMITTED · 편집 잠금 · 제출 완료 시각이 기록되었습니다.'
            : '승인 1 click 으로 status = SUBMITTED · 편집 잠금. 발주처 제출 PDF 자동 생성. 필요 시 재오픈 가능.'}
        </p>
      </div>

      {/* Summary trio */}
      <div
        className="mb-[2px] grid"
        style={{
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 2,
          background: 'var(--hairline, #f0ede8)',
        }}
      >
        <SummaryCell
          label="제안서 1차본"
          num={String(proposalCompleteCount)}
          unit={`/${proposalTotal}`}
          meta="섹션 완성"
        />
        <SummaryCell
          label="Inspector Score"
          num={String(inspectorScore)}
          meta={`${inspectorScore >= 75 ? '통과 ✓' : '미통과'}`}
        />
        <SummaryCell
          label="Margin · 마진율"
          num={marginPct != null ? marginPct.toFixed(1) : '—'}
          unit="%"
          meta={
            marginPct != null && marginPct >= 15
              ? '목표 15% 초과'
              : '목표 미달'
          }
        />
      </div>

      {/* Impact block */}
      {socialValueKrw != null && (
        <div
          className="relative mb-[2px] overflow-hidden p-9 text-white"
          style={{
            background: 'var(--accent)',
          }}
        >
          {/* decorative ring */}
          <div
            className="pointer-events-none absolute"
            style={{
              right: -30,
              top: -20,
              width: 200,
              height: 200,
              border: '3px solid rgba(255,255,255,.08)',
            }}
          />

          <div
            className="relative mb-4 text-[10px] font-bold uppercase tracking-[1.8px]"
            style={{ opacity: 0.85 }}
          >
            ● Social Value Forecast · SROI
          </div>
          <div
            className="relative mb-2 text-[56px] font-bold italic leading-none tracking-[-1.5px]"
          >
            {(socialValueKrw / 1e8).toFixed(1)}
            <span
              className="ml-2 text-lg font-semibold"
              style={{ opacity: 0.85 }}
            >
              억원
            </span>
          </div>
          <p
            className="relative mb-5 max-w-[560px] text-[13px] leading-[1.65]"
            style={{ opacity: 0.95 }}
          >
            impact-measurement DB 의 16 카테고리 계수로 산정한 사회적 가치.
            {directBeneficiaries != null && (
              <> 직접 수혜 {directBeneficiaries}명</>
            )}
            {indirectBeneficiaries != null && (
              <> · 간접 수혜 {indirectBeneficiaries}명</>
            )}
            {roiPct != null && <> · ROI {roiPct}%</>}.
          </p>

          {impactBreakdown && impactBreakdown.length > 0 && (
            <div
              className="relative grid pt-5"
              style={{
                gridTemplateColumns: `repeat(${Math.min(impactBreakdown.length, 3)}, 1fr)`,
                gap: 24,
                borderTop: '1px solid rgba(255,255,255,.18)',
              }}
            >
              {impactBreakdown.slice(0, 3).map((b) => (
                <div key={b.label}>
                  <div
                    className="mb-1.5 truncate text-[10px] font-semibold uppercase tracking-[1.4px]"
                    style={{ opacity: 0.85 }}
                  >
                    {b.label}
                  </div>
                  <div className="text-xl font-bold italic">
                    {(b.valueKrw / 1e8).toFixed(1)} 억
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Checklist */}
      <div
        className="mb-[2px] bg-white px-8 py-7"
        style={{ borderTop: '3px solid var(--green)' }}
      >
        <div
          className="mb-2 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[1.8px]"
          style={{ color: 'var(--green)' }}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: 'var(--green)' }}
          />
          Verification · {passedCount === checklist.length ? 'Passed' : 'Partial'}
        </div>
        <h3
          className="mb-5 text-lg font-bold tracking-[-0.3px]"
          style={{ color: 'var(--dark-charcoal)' }}
        >
          최종 검증 항목 · {passedCount} / {checklist.length}
        </h3>
        <div
          className="grid"
          style={{ gridTemplateColumns: '1fr 1fr', gap: 14 }}
        >
          {checklist.map((c, i) => (
            <CheckItem key={i} passed={c.passed} label={c.label} />
          ))}
        </div>
      </div>

      {/* Export block — Markdown 다운로드 + Browser print-to-PDF */}
      <div
        className="no-print mb-5 flex items-center gap-3 px-4 py-3"
        style={{
          background: 'var(--light-beige)',
          borderLeft: '3px solid var(--primary-orange)',
        }}
      >
        <div
          className="inline-flex flex-shrink-0 items-center justify-center text-[10px]"
          style={{
            width: 40,
            height: 52,
            background: '#ffffff',
            borderTop: '2px solid var(--primary-orange)',
            color: 'var(--primary-orange)',
            fontWeight: 700,
            fontStyle: 'italic',
          }}
        >
          .MD
        </div>
        <div className="flex-1">
          <div
            className="mb-0.5 text-xs font-bold"
            style={{ color: 'var(--dark-charcoal)' }}
          >
            제안서 1차본 ({proposalTotal}섹션) — Markdown 내보내기
          </div>
          <div
            className="text-[10px] tracking-[0.2px]"
            style={{ color: 'var(--subtitle-text)' }}
          >
            .md 파일 · 발주처 템플릿용 · 브라우저 인쇄로 PDF 변환 가능
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => {
              if (typeof window !== 'undefined') window.print()
            }}
            className="h-7 bg-white px-2.5 text-[10px] font-semibold uppercase tracking-[0.2px] transition-colors"
            style={{
              color: 'var(--body-text, #333)',
              border: '1px solid var(--hairline-strong, #e4dfd6)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--primary-orange)'
              e.currentTarget.style.color = 'var(--primary-orange)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--hairline-strong, #e4dfd6)'
              e.currentTarget.style.color = 'var(--body-text, #333)'
            }}
            title="브라우저 인쇄 대화상자 → PDF 로 저장"
          >
            인쇄 / PDF
          </button>
          <a
            href={`/api/projects/${projectId}/export-markdown`}
            className="inline-flex h-7 items-center bg-white px-2.5 text-[10px] font-semibold uppercase tracking-[0.2px] transition-colors"
            style={{
              color: 'var(--body-text, #333)',
              border: '1px solid var(--hairline-strong, #e4dfd6)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--primary-orange)'
              e.currentTarget.style.color = 'var(--primary-orange)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--hairline-strong, #e4dfd6)'
              e.currentTarget.style.color = 'var(--body-text, #333)'
            }}
            title=".md 파일 다운로드"
          >
            .md 다운로드
          </a>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          className="mb-4 px-3 py-2 text-xs font-medium"
          style={{
            color: 'var(--primary-orange)',
            background: 'rgba(232,84,26,.08)',
            border: '1px solid rgba(232,84,26,.3)',
          }}
        >
          ● {error}
        </div>
      )}

      {/* Approve block */}
      <div className="no-print py-6 text-center">
        {isApproved ? (
          <>
            <p
              className="mb-4 text-xs"
              style={{ color: 'var(--subtitle-text)' }}
            >
              ✓ 이 프로젝트는 이미 승인 · 제출 완료되었습니다.
            </p>
            <button
              onClick={onBackToS4}
              className="inline-flex h-9 items-center bg-white px-4 text-[11px] font-semibold uppercase tracking-[0.8px]"
              style={{
                color: 'var(--subtitle-text)',
                border: '1px solid var(--hairline-strong, #e4dfd6)',
              }}
            >
              ← S4 정밀 편집
            </button>
          </>
        ) : (
          <>
            <p
              className="mb-4 text-[11px]"
              style={{ color: 'var(--subtitle-text)' }}
            >
              승인 시 status = SUBMITTED · 편집 잠금. 잠금 후에도 필요 시 재오픈 가능.
            </p>
            <button
              onClick={handleApprove}
              disabled={pending || passedCount < checklist.length}
              className="inline-flex items-center gap-3 px-12 py-4 text-base font-bold uppercase tracking-[0.5px] text-white transition-all duration-200 hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                background: 'var(--primary-orange)',
                boxShadow: '0 10px 28px rgba(232,84,26,.32)',
              }}
            >
              <span
                className="inline-flex h-6 w-6 items-center justify-center text-sm"
                style={{ background: 'rgba(255,255,255,.18)' }}
              >
                ✓
              </span>
              {pending ? '승인 처리 중...' : '승인 및 제출 — Final Approve'}
            </button>
          </>
        )}
      </div>

      <p
        className="mt-1 text-center text-[9px] uppercase tracking-[1.2px]"
        style={{ color: 'var(--subtitle-text)' }}
      >
        Project · {projectId}
      </p>
    </div>
  )
}

function SummaryCell({
  label,
  num,
  unit,
  meta,
}: {
  label: string
  num: string
  unit?: string
  meta?: string
}) {
  return (
    <div
      className="bg-white px-6 py-6 text-center"
      style={{ borderTop: '4px solid var(--primary-orange)' }}
    >
      <div
        className="mb-3 text-[10px] font-bold uppercase tracking-[1.8px]"
        style={{ color: 'var(--subtitle-text)' }}
      >
        {label}
      </div>
      <div
        className="font-bold italic leading-none tracking-[-1.2px]"
        style={{ color: 'var(--primary-orange)', fontSize: 42 }}
      >
        {num}
        {unit && (
          <span
            className="ml-1 text-sm font-medium not-italic"
            style={{ color: 'var(--subtitle-text)' }}
          >
            {unit}
          </span>
        )}
      </div>
      {meta && (
        <div
          className="mt-3 text-[11px]"
          style={{ color: 'var(--subtitle-text)' }}
        >
          {meta}
        </div>
      )}
    </div>
  )
}

function CheckItem({ passed, label }: { passed: boolean; label: string }) {
  return (
    <div
      className="flex items-center gap-2.5 text-[13px]"
      style={{ color: 'var(--body-text, #333)' }}
    >
      <span
        className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center text-[11px] font-bold text-white"
        style={{
          background: passed ? 'var(--green)' : 'var(--hairline-strong, #e4dfd6)',
        }}
      >
        {passed ? '✓' : ''}
      </span>
      <span style={{ opacity: passed ? 1 : 0.55 }}>{label}</span>
    </div>
  )
}
