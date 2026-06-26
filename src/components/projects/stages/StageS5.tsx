'use client'

/**
 * StageS5 — 최종 승인·제출 (Wave V / F0)
 *
 * 펼침 시: 임팩트 forecast 카드 + 발주처 템플릿 다운로드 + markdown export.
 * F0 minimal — F5 에서 검수 통과 배지·SROI 상세 등 추가.
 */

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { BarChart3, ClipboardList, FileText, FileSpreadsheet, CheckCircle2 } from 'lucide-react'

interface Props {
  projectId: string
  /** 사전 임팩트 forecast (있을 때만 카드 표시) */
  impactForecast?: {
    id: string
    totalSocialValue: number // 원 단위
    beneficiaryCount?: number | null
    calibration: string
    isStale: boolean
  } | null
  /** ProposalSection 7섹션 모두 작성 여부 */
  proposalReady: boolean
}

export function StageS5({ projectId, impactForecast, proposalReady }: Props) {
  return (
    <div className="space-y-4">
      {/* 검수·완성 상태 배지 */}
      <div className="flex flex-wrap items-center gap-2">
        {proposalReady ? (
          <Badge className="gap-1 bg-green-100 text-green-800 hover:bg-green-100">
            <CheckCircle2 className="h-3 w-3" /> 1차본 7/7 섹션 완성
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            제안서 미완성 — Stage 4 에서 정밀 편집
          </Badge>
        )}
        {impactForecast && (
          <Badge variant="outline" className="text-xs">
            사회적 가치 forecast{' '}
            <strong className="ml-1 text-brand">
              {(impactForecast.totalSocialValue / 100_000_000).toFixed(2)}억원
            </strong>
          </Badge>
        )}
      </div>

      {/* 임팩트 forecast 카드 (있을 때만) */}
      {impactForecast && (
        <div
          className={
            impactForecast.isStale
              ? ' border border-amber-300 bg-amber-50/40 p-3'
              : ' border border-[color:var(--cyan)]/40 bg-[color:var(--light-beige)] p-3'
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <BarChart3 className="h-4 w-4 text-[color:var(--primary-orange)]" />
                사전 임팩트 리포트
                {impactForecast.isStale && (
                  <span className="text-[10px] text-amber-700">(재계산 필요)</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                impact-measurement 시스템 계수 기반 SROI Proxy
              </div>
            </div>
            <Link
              href={`/projects/${projectId}?stage=sroi`}
              className=" border bg-background px-3 py-1 text-xs hover:border-brand/40 hover:text-brand"
            >
              {impactForecast.isStale ? '재계산 →' : '상세·보정 →'}
            </Link>
          </div>
        </div>
      )}

      {/* 산출물 다운로드 (발주처 제출용) */}
      <div className="space-y-2">
        <h3 className="text-base font-semibold">발주처 제출 산출물</h3>
        <p className="text-xs text-muted-foreground">
          1차본 + 정밀 편집 결과를 PM 이 직접 다운로드해 발주처에 제출합니다.
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/projects/${projectId}/export-budget-template`}
            download
            className="flex items-center gap-1.5 border bg-background px-3 py-1.5 text-xs hover:border-brand/40 hover:text-brand"
            title="발주처 제출용 budget-template 양식 (1-1-1 주관부서 + 1-2 외부용)"
          >
            <ClipboardList className="h-3.5 w-3.5" />
            발주처 템플릿 (엑셀)
          </a>
          <a
            href={`/api/projects/${projectId}/export-markdown`}
            download
            className="flex items-center gap-1.5 border bg-background px-3 py-1.5 text-xs hover:border-brand/40 hover:text-brand"
            title="1차본 전체 → Markdown (PPT/HWP 변환은 PM 후처리)"
          >
            <FileText className="h-3.5 w-3.5" />
            1차본 마크다운
          </a>
          <a
            href={`/api/projects/${projectId}/export-excel`}
            download
            className="flex items-center gap-1.5 border bg-background px-3 py-1.5 text-xs hover:border-brand/40 hover:text-brand"
            title="내부 검토용 5 시트 엑셀 (요약·커리큘럼·코치·예산·SROI)"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            내부 엑셀 (5 시트)
          </a>
        </div>
      </div>
    </div>
  )
}
