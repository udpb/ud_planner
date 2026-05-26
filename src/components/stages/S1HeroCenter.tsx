'use client'
/**
 * S1HeroCenter — UX v2 (ADR-018) S1 RFP 분석 stage
 *
 * 본질: 업로드 + 분석 대기.
 *
 * 레이아웃 (Hero center):
 *   - 미분석 상태: 큰 dropzone (PDF/DOCX/HWP) + 텍스트 붙여넣기 옵션
 *   - 분석 완료: 추출 결과 카드 (사업명·발주처·예산·평가배점·키워드) + S2 진입 CTA
 *
 * 단순함이 핵심 — 다른 요소 X. NowBar 가 다음 액션 안내.
 */

import { useState, useTransition } from 'react'
import { FileText, Upload, Check, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface S1AnalysisResult {
  projectName?: string | null
  client?: string | null
  totalBudget?: number | null
  evalCriteria?: { item: string; score: number }[]
  keywords?: string[]
  /** 자동 매칭된 자산 수 */
  matchedAssetCount?: number
  /** Logic Model 자동 생성 여부 */
  hasLogicModel?: boolean
}

export interface S1HeroCenterProps {
  projectId: string
  /** 이미 분석 완료된 경우 결과 (null 이면 미분석) */
  analysis?: S1AnalysisResult | null
  /** 업로드 / 텍스트 파싱 callback. 자동으로 server side parse-rfp 호출 */
  onAnalyze?: (params: { file?: File; text?: string }) => Promise<void>
  /** S2 진입 callback */
  onProceedToS2?: () => void
}

export function S1HeroCenter({ projectId, analysis, onAnalyze, onProceedToS2 }: S1HeroCenterProps) {
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
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-12">
        {/* 완료 배지 */}
        <div className="flex items-center gap-2 rounded-full border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700">
          <Check className="h-4 w-4" />
          RFP 분석 완료
        </div>

        <h1 className="text-center text-2xl font-bold tracking-tight">
          {analysis!.projectName}
        </h1>

        {/* 추출 결과 카드 */}
        <div className="w-full rounded-xl border bg-card p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <ResultRow label="발주처" value={analysis!.client ?? '—'} />
            <ResultRow
              label="총 예산"
              value={
                analysis!.totalBudget
                  ? `${(analysis!.totalBudget / 1e8).toFixed(2)}억`
                  : '—'
              }
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
          <div className="mt-5 space-y-1.5 border-t pt-4">
            <BulletItem
              done={!!analysis!.hasLogicModel}
              text="Logic Model 자동 생성"
            />
            <BulletItem
              done={(analysis!.matchedAssetCount ?? 0) > 0}
              text={`유사 수주 자산 ${analysis!.matchedAssetCount ?? 0}건 자동 매칭`}
            />
          </div>
        </div>

        {/* 진행 CTA */}
        <button
          onClick={onProceedToS2}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary/90"
        >
          <Sparkles className="h-4 w-4" />
          S2 1차본 작성으로
        </button>
        <p className="text-[11px] text-muted-foreground">
          AI 가 자동으로 60% 채우고, PM 은 9개 결정만 (30~45분)
        </p>
      </div>
    )
  }

  // ─────────────────────────────────────────
  // 미분석 — Hero dropzone
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
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-4 py-12">
      <div className="text-center">
        <h1 className="mb-2 text-2xl font-bold tracking-tight">
          📄 RFP 업로드해서 분석 시작
        </h1>
        <p className="text-sm text-muted-foreground">
          PDF · DOCX · HWP 지원 · AI 가 자동 파싱
        </p>
      </div>

      {/* Dropzone */}
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
          className={cn(
            'flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-12 transition cursor-pointer',
            dragOver
              ? 'border-primary bg-primary/5'
              : pending
                ? 'border-muted bg-muted/30 cursor-wait'
                : 'border-muted-foreground/30 hover:border-primary/60 hover:bg-primary/5',
          )}
        >
          {pending ? (
            <>
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <div className="text-sm font-medium text-muted-foreground">
                AI 가 RFP 분석 중... (~30초)
              </div>
            </>
          ) : (
            <>
              <Upload className="h-10 w-10 text-muted-foreground" />
              <div className="text-center">
                <div className="text-base font-medium">
                  드래그 & 드롭 또는 클릭해서 업로드
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  최대 20MB · PDF · DOCX · HWP
                </div>
              </div>
            </>
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

      {/* 텍스트 모드 */}
      {textMode && (
        <div className="w-full space-y-2">
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={10}
            placeholder="RFP 본문을 붙여넣어주세요 (최소 200자)"
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            disabled={pending}
          />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{rawText.length} 자</span>
            <button
              onClick={handleText}
              disabled={pending || rawText.length < 200}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {pending ? '분석 중...' : '분석 시작'}
            </button>
          </div>
        </div>
      )}

      {/* 모드 전환 */}
      <button
        onClick={() => {
          setTextMode((t) => !t)
          setError(null)
        }}
        disabled={pending}
        className="text-[11px] text-muted-foreground underline hover:text-foreground"
      >
        {textMode ? '← 파일 업로드로' : '또는 텍스트 직접 붙여넣기 →'}
      </button>

      {/* 에러 표시 */}
      {error && (
        <div className="w-full rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
          ⚠ {error}
        </div>
      )}

      {/* 분석 후 가능한 것들 (안내) */}
      <div className="mt-4 w-full rounded-xl border bg-muted/30 p-4 text-[11px] text-muted-foreground">
        <div className="mb-1 font-medium text-foreground">분석 완료 후 자동으로:</div>
        <ul className="space-y-0.5">
          <li>✓ 사업명 · 발주처 · 예산 · 평가배점 자동 추출</li>
          <li>✓ Logic Model 자동 생성</li>
          <li>✓ 유사 수주 자산 (Brain matching) 자동 매칭</li>
          <li>✓ S2 (1차본) 자동 60% 채움 옵션</li>
        </ul>
      </div>

      <p className="text-[10px] text-muted-foreground">project: {projectId}</p>
    </div>
  )
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  )
}

function BulletItem({ done, text }: { done: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={cn(
          'flex h-4 w-4 items-center justify-center rounded-full',
          done ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground',
        )}
      >
        {done && <Check className="h-2.5 w-2.5" />}
      </span>
      <span className={done ? 'text-foreground' : 'text-muted-foreground'}>{text}</span>
    </div>
  )
}
