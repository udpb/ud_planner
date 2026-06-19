'use client'
/**
 * S1HeroCenter — UX v2 (ADR-018 · mockup s1.html 1:1)
 *
 * Stage 01 · RFP Analysis · Hero center.
 *
 * 레이아웃 (mockup s1.html):
 *   - eyebrow ● Stage 01 · RFP Analysis
 *   - big title (clamp 32~48px) + italic orange "기획 1차본" accent
 *   - sub copy (~580px)
 *   - dropzone (white · border-top 4px orange · 80×32 padding · 64×64 orange icon box)
 *   - or-divider (hairline · UPPERCASE "또는")
 *   - text-mode-btn (white · border-top 2px hairline)
 *   - after-analysis (dark-charcoal · border-top 3px action-orange · 2col grid)
 *
 * 분석 완료 상태: hero 가 결과 카드로 collapse · NowBar 가 S2 CTA 안내
 */

import { useState, useTransition } from 'react'

export interface S1AnalysisResult {
  projectName?: string | null
  client?: string | null
  totalBudget?: number | null
  evalCriteria?: { item: string; score: number }[]
  keywords?: string[]
  matchedAssetCount?: number
  hasLogicModel?: boolean
}

export interface S1HeroCenterProps {
  projectId: string
  /** 이미 분석 완료된 경우 결과 (null 이면 미분석) */
  analysis?: S1AnalysisResult | null
  /** 업로드 / 텍스트 파싱 callback */
  onAnalyze?: (params: { file?: File; text?: string }) => Promise<void>
  /** S2 진입 callback */
  onProceedToS2?: () => void
}

export function S1HeroCenter({
  projectId,
  analysis,
  onAnalyze,
  onProceedToS2,
}: S1HeroCenterProps) {
  const [pending, startTransition] = useTransition()
  const [dragOver, setDragOver] = useState(false)
  const [textMode, setTextMode] = useState(false)
  const [rawText, setRawText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const isCompleted = !!analysis && !!analysis.projectName

  // ─────────────────────────────────────────
  // 분석 완료 화면
  // ─────────────────────────────────────────

  if (isCompleted) {
    return (
      <div
        className="mx-auto px-8 py-10"
        style={{ width: 'min(85vw, 1100px)' }}
      >
        {/* eyebrow */}
        <div
          className="mb-2.5 inline-flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[1.5px]"
          style={{ color: 'var(--primary-orange)' }}
        >
          <span
            className="h-1.5 w-1.5"
            style={{ background: 'var(--primary-orange)' }}
          />
          Stage 01 · RFP Analysis · 완료
        </div>

        {/* title */}
        <h1
          className="mb-2 text-xl font-bold leading-[1.25] tracking-[-0.3px]"
          style={{ color: 'var(--dark-charcoal)' }}
        >
          <span style={{ color: 'var(--primary-orange)', fontStyle: 'italic' }}>
            {analysis!.projectName}
          </span>
          {' — '}분석 완료
        </h1>
        <p className="mb-6 text-sm" style={{ color: 'var(--subtitle-text)' }}>
          S2 1차본 작성 단계로 진입할 수 있습니다.
        </p>

        {/* 추출 결과 카드 */}
        <div
          className="bg-white p-5"
          style={{ borderTop: '3px solid var(--primary-orange)' }}
        >
          <div
            className="mb-3 inline-flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[1.5px]"
            style={{ color: 'var(--primary-orange)' }}
          >
            <span
              className="h-1.5 w-1.5"
              style={{ background: 'var(--primary-orange)' }}
            />
            Extracted · Automatic
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <ResultRow label="발주처" value={analysis!.client ?? '—'} />
            <ResultRow
              label="총 예산"
              value={
                analysis!.totalBudget
                  ? `${(analysis!.totalBudget / 1e8).toFixed(2)}억`
                  : '—'
              }
              accent
              big
            />
            <ResultRow
              label="평가배점"
              value={`${analysis!.evalCriteria?.length ?? 0}개`}
            />
            <ResultRow
              label="키워드"
              value={`${analysis!.keywords?.length ?? 0}개`}
            />
          </div>

          {/* 자동 처리 결과 */}
          <div
            className="mt-4 grid gap-2 pt-3 sm:grid-cols-2"
            style={{ borderTop: '1px solid var(--hairline, #f0ede8)' }}
          >
            <CheckBullet
              done={!!analysis!.hasLogicModel}
              text="Logic Model 자동 생성"
            />
            <CheckBullet
              done={(analysis!.matchedAssetCount ?? 0) > 0}
              text={`유사 자산 ${analysis!.matchedAssetCount ?? 0}건 매칭`}
            />
          </div>
        </div>

        {/* 진행 CTA */}
        <div className="mt-6 flex items-center justify-center">
          <button
            onClick={onProceedToS2}
            className="inline-flex h-10 items-center gap-2 px-5 text-sm font-semibold tracking-[0.2px] text-white transition-all duration-200 hover:-translate-y-0.5"
            style={{
              background: 'var(--primary-orange)',
              boxShadow: '0 3px 10px rgba(232,84,26,.22)',
            }}
          >
            S2 1차본 작성으로
            <span
              className="px-1.5 py-0.5 text-[9px] font-medium tracking-[0.4px]"
              style={{ background: 'rgba(255,255,255,.18)' }}
            >
              ~30분
            </span>
            <span className="text-[13px] leading-none">→</span>
          </button>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────
  // 미분석 — Hero center (mockup s1.html 정확 일치)
  // ─────────────────────────────────────────

  async function handleFile(file: File) {
    setError(null)
    startTransition(async () => {
      try {
        await onAnalyze?.({ file })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'RFP 분석 실패')
      }
    })
  }

  async function handleText() {
    if (rawText.length < 200) {
      setError('RFP 본문은 최소 200자 이상')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await onAnalyze?.({ text: rawText })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'RFP 분석 실패')
      }
    })
  }

  return (
    <div
      className="mx-auto px-8 py-12"
      style={{ width: 'min(85vw, 1100px)' }}
    >
      {/* eyebrow ● Stage 01 · RFP Analysis */}
      <div
        className="mb-2.5 inline-flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[1.5px]"
        style={{ color: 'var(--primary-orange)' }}
      >
        <span
          className="h-1.5 w-1.5"
          style={{ background: 'var(--primary-orange)' }}
        />
        Stage 01 · RFP Analysis
      </div>

      {/* title */}
      <h1
        className="mb-2 text-2xl font-bold leading-[1.2] tracking-[-0.4px]"
        style={{ color: 'var(--dark-charcoal)' }}
      >
        RFP 를 분석해서{' '}
        <span style={{ color: 'var(--primary-orange)', fontStyle: 'italic' }}>
          기획 1차본
        </span>
        의 출발점을 잡습니다
      </h1>

      {/* sub copy */}
      <p
        className="mb-6 max-w-[560px] text-sm leading-[1.65]"
        style={{ color: 'var(--subtitle-text)' }}
      >
        PDF · DOCX · HWP 업로드 시 AI 가 ~30 초 안에 사업명·발주처·예산·평가배점·키워드를 자동 추출하고
        Logic Model + Brain 매칭까지 한 번에 처리합니다.
      </p>

      {/* Dropzone — file mode */}
      {!textMode && (
        <label
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const file = e.dataTransfer.files[0]
            if (file) handleFile(file)
          }}
          className="relative block cursor-pointer bg-white px-6 py-10 text-center transition-all duration-200 hover:-translate-y-0.5"
          style={{
            borderTop: '3px solid var(--primary-orange)',
            boxShadow: dragOver
              ? '0 10px 24px rgba(0,0,0,.10)'
              : '0 1px 0 var(--hairline, #f0ede8)',
            background: dragOver ? 'var(--light-beige)' : '#ffffff',
            transform: dragOver ? 'translateY(-2px)' : 'translateY(0)',
            marginBottom: 2,
            cursor: pending ? 'wait' : 'pointer',
          }}
        >
          <div className="mb-3.5 flex justify-center">
            <div
              className="inline-flex h-11 w-11 items-center justify-center text-white"
              style={{ background: 'var(--primary-orange)' }}
            >
              {pending ? (
                <div className="h-5 w-5 animate-spin border-2 border-white border-t-transparent" />
              ) : (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              )}
            </div>
          </div>

          <div
            className="mb-1 text-lg font-bold tracking-[-0.3px]"
            style={{ color: 'var(--dark-charcoal)' }}
          >
            {pending ? 'AI 가 RFP 분석 중...' : 'RFP 파일을 드래그 & 드롭'}
          </div>
          <div className="text-xs" style={{ color: 'var(--subtitle-text)' }}>
            {pending
              ? '~30 초 이내 자동 처리'
              : '또는 클릭해서 파일 선택 · 최대 20MB'}
          </div>

          {!pending && (
            <div
              className="mt-3.5 inline-flex gap-px"
              style={{ background: 'var(--hairline, #f0ede8)' }}
            >
              {(['PDF', 'DOCX', 'DOC', 'HWP'] as const).map((fmt) => (
                <span
                  key={fmt}
                  className="bg-white px-2.5 py-1 text-[9px] font-bold tracking-[1.2px]"
                  style={{ color: 'var(--subtitle-text)' }}
                >
                  {fmt}
                </span>
              ))}
            </div>
          )}

          <input
            type="file"
            accept=".pdf,.docx,.doc,.hwp"
            className="hidden"
            disabled={pending}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
            }}
          />
        </label>
      )}

      {/* or-divider */}
      {!textMode && (
        <div
          className="my-4 flex items-center gap-3 text-[9px] font-semibold uppercase tracking-[1.5px]"
          style={{ color: 'var(--subtitle-text)' }}
        >
          <div
            className="h-px flex-1"
            style={{ background: 'var(--hairline-strong, #e4dfd6)' }}
          />
          또는
          <div
            className="h-px flex-1"
            style={{ background: 'var(--hairline-strong, #e4dfd6)' }}
          />
        </div>
      )}

      {/* text-mode-btn */}
      {!textMode && (
        <button
          onClick={() => setTextMode(true)}
          disabled={pending}
          className="mb-6 block w-full cursor-pointer bg-white px-5 py-4 text-center transition-all duration-200 hover:-translate-y-0.5"
          style={{
            borderTop: '2px solid var(--hairline-strong, #e4dfd6)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderTopColor = 'var(--primary-orange)'
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.05)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderTopColor = 'var(--hairline-strong, #e4dfd6)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          <div
            className="mb-1 text-[10px] font-bold uppercase tracking-[1.5px]"
            style={{ color: 'var(--subtitle-text)' }}
          >
            Paste Text
          </div>
          <div
            className="text-sm font-semibold"
            style={{ color: 'var(--dark-charcoal)' }}
          >
            RFP 본문을 직접 붙여넣기
          </div>
        </button>
      )}

      {/* textarea mode */}
      {textMode && (
        <div className="mb-6 space-y-2">
          <div
            className="bg-white p-4"
            style={{ borderTop: '3px solid var(--primary-orange)' }}
          >
            <div className="mb-2.5 flex items-center justify-between">
              <div
                className="text-[10px] font-bold uppercase tracking-[1.5px]"
                style={{ color: 'var(--primary-orange)' }}
              >
                ● Paste RFP Text
              </div>
              <button
                onClick={() => {
                  setTextMode(false)
                  setError(null)
                }}
                className="text-[10px] font-semibold uppercase tracking-[1px]"
                style={{ color: 'var(--subtitle-text)' }}
              >
                ← 파일 모드
              </button>
            </div>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={10}
              placeholder="RFP 본문을 붙여넣어주세요 (최소 200자)"
              className="w-full resize-y bg-white px-3 py-2 text-xs leading-[1.6]"
              style={{
                color: 'var(--body-text, #333)',
                border: '1px solid var(--hairline-strong, #e4dfd6)',
                fontFamily: 'inherit',
              }}
              disabled={pending}
            />
            <div className="mt-2.5 flex items-center justify-between">
              <span
                className="text-[10px] tabular-nums"
                style={{ color: 'var(--subtitle-text)' }}
              >
                {rawText.length} / 최소 200 자
              </span>
              <button
                onClick={handleText}
                disabled={pending || rawText.length < 200}
                className="inline-flex h-9 items-center gap-2 px-4 text-xs font-semibold tracking-[0.2px] text-white transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background:
                    rawText.length >= 200 && !pending
                      ? 'var(--primary-orange)'
                      : 'rgba(0,0,0,.15)',
                  boxShadow:
                    rawText.length >= 200 && !pending
                      ? '0 3px 10px rgba(232,84,26,.22)'
                      : 'none',
                }}
              >
                {pending ? '분석 중...' : '분석 시작'}
                {!pending && <span className="text-[13px] leading-none">→</span>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 에러 표시 */}
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

      {/* After analysis preview — dark section */}
      <div
        className="relative overflow-hidden p-5 text-white"
        style={{
          background: 'var(--dark-charcoal)',
          borderTop: '2px solid var(--action-orange)',
        }}
      >
        {/* gradient overlay (mockup .after-analysis::before) */}
        <div
          className="pointer-events-none absolute right-0 top-0 h-full w-2/5"
          style={{
            background:
              'linear-gradient(135deg, transparent 50%, rgba(240,85,25,0.08) 100%)',
          }}
        />

        <div
          className="relative mb-2 text-[9px] font-semibold uppercase tracking-[1.5px]"
          style={{ color: 'var(--action-orange)' }}
        >
          <span
            className="mr-1.5 inline-block h-1.5 w-1.5 align-middle"
            style={{ background: 'var(--action-orange)' }}
          />
          After Analysis · Automatic
        </div>
        <h3 className="relative mb-3 text-base font-bold tracking-[-0.3px]">
          분석 완료 후 자동으로 처리되는 것
        </h3>
        <div className="relative grid grid-cols-1 gap-2 sm:grid-cols-2">
          {AFTER_ITEMS.map((text) => (
            <AfterItem key={text} text={text} />
          ))}
        </div>
      </div>

      <p
        className="mt-4 text-[9px] uppercase tracking-[1.2px]"
        style={{ color: 'var(--subtitle-text)' }}
      >
        Project · {projectId}
      </p>
    </div>
  )
}

const AFTER_ITEMS = [
  '사업명 · 발주처 · 예산 · 평가배점 · 키워드 추출',
  'Logic Model 자동 생성 (impact·outcome·activity·input)',
  '유사 수주 자산 (Brain matching) 자동 매칭',
  'S2 (1차본) AI 자동 60% 채움 옵션 제시',
  '발주처 평가배점 가중치 inspector 사전 적용',
  'Risk Mitigation 후보 3~5건 자동 제안',
]

function AfterItem({ text }: { text: string }) {
  return (
    <div
      className="relative pl-4 text-xs leading-[1.6]"
      style={{ color: 'var(--warm-gray)' }}
    >
      <span
        className="absolute left-0 top-0 font-bold"
        style={{ color: 'var(--action-orange)' }}
      >
        ✓
      </span>
      {text}
    </div>
  )
}

function ResultRow({
  label,
  value,
  accent,
  big,
}: {
  label: string
  value: string
  accent?: boolean
  big?: boolean
}) {
  return (
    <div>
      <div
        className="mb-1 text-[9px] font-semibold uppercase tracking-[1.2px]"
        style={{ color: 'var(--subtitle-text)' }}
      >
        {label}
      </div>
      <div
        className="font-bold"
        style={{
          color: accent ? 'var(--primary-orange)' : 'var(--dark-charcoal)',
          fontSize: big ? '18px' : '13px',
          letterSpacing: big ? '-0.3px' : '-0.1px',
          fontStyle: accent && big ? 'italic' : 'normal',
        }}
      >
        {value}
      </div>
    </div>
  )
}

function CheckBullet({ done, text }: { done: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center text-[10px] font-bold text-white"
        style={{ background: done ? 'var(--green)' : 'var(--hairline-strong, #e4dfd6)' }}
      >
        {done ? '✓' : ''}
      </span>
      <span
        className="text-xs"
        style={{ color: done ? 'var(--dark-charcoal)' : 'var(--subtitle-text)' }}
      >
        {text}
      </span>
    </div>
  )
}
