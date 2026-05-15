/**
 * Express 1차본 → Markdown 렌더러 (Phase M3-1a, 2026-05-14)
 *
 * ExpressDraft + 프로젝트 메타 → 깔끔한 `.md` 본문.
 *
 * 구조:
 *   1. 헤더 — 프로젝트명·발주처·예산·채널
 *   2. 사업의 한 문장 + Before/After + 핵심 메시지 3개
 *   3. 차별화 자산 (수락된 것만)
 *   4. 7섹션 본문
 *   5. AI 자동 진단 요약 (참고용 — 발주처 제출 시 제거 가능)
 *   6. 발주처 공식 문서 인용 (있을 때)
 *   7. 메타 푸터
 *
 * 디자인 원칙:
 *   - 발주처 제출용으로도, PM 내부 회람용으로도 깨끗하게 보이도록 H1/H2/H3 규칙 일관
 *   - 빈 필드는 자동 생략 (placeholder 줄 없음)
 *   - 자동 진단 섹션은 "<!-- ai-diagnosis -->" 마커로 grep 삭제 가능
 *
 * 관련: docs/decisions/013-express-v2-auto-diagnosis.md §결정 §3 (M3-1)
 */

import type { ExpressDraft, AutoDiagnosis, Department, Channel } from './schema'
import { SECTION_LABELS } from './schema'
import type { StrategicNotes } from '@/lib/ai/strategic-notes'

// ─────────────────────────────────────────
// 입력 타입
// ─────────────────────────────────────────

export interface MarkdownInput {
  /** 프로젝트 식별 정보 */
  project: {
    name: string
    client: string
    totalBudgetVat: number | null
    supplyPrice: number | null
    eduStartDate: Date | null
    eduEndDate: Date | null
  }
  draft: ExpressDraft
  /** 발주처 공식 문서 추출 (M3-2 산출물) — 있으면 인용 섹션 추가 */
  clientOfficialDoc?: StrategicNotes['clientOfficialDoc']
  /** Wave M5 — 사전 임팩트 forecast 요약 (있으면 markdown 끝에 자동 섹션) */
  impactForecast?: {
    totalSocialValue: number
    beneficiaryCount: number
    country: string
    calibration: string
    calibrationNote: string | null
    /** breakdown 상위 5건만 markdown 에 노출 */
    topBreakdown: Array<{
      categoryName: string
      impactTypeName: string
      value: number
    }>
  }
}

// ─────────────────────────────────────────
// 라벨
// ─────────────────────────────────────────

const CHANNEL_LABEL: Record<Channel, string> = {
  B2G: '정부·공공기관 (B2G)',
  B2B: '기업·재단 (B2B)',
  renewal: '연속·재계약 (renewal)',
}

const DEPT_LABEL: Record<Department, string> = {
  csr: '사회공헌·CSR',
  strategy: '기획·전략',
  sales: '영업·고객',
  tech: '기술·DX',
}

const ASSET_SECTION_LABEL: Record<string, string> = {
  'proposal-background': '제안 배경',
  curriculum: '커리큘럼',
  coaches: '코치진',
  budget: '예산',
  impact: '임팩트',
  'org-team': '운영 조직',
  other: '기타',
}

// ─────────────────────────────────────────
// 메인 렌더러
// ─────────────────────────────────────────

export function renderExpressMarkdown(input: MarkdownInput): string {
  const { project, draft, clientOfficialDoc } = input
  const parts: string[] = []

  // 1. 헤더 ─────────────────────────────────────
  parts.push(`# ${project.name}\n`)
  const headerMeta: string[] = []
  headerMeta.push(`**발주처**: ${project.client}`)
  if (project.totalBudgetVat) {
    headerMeta.push(`**예산**: ${formatKRW(project.totalBudgetVat)} (VAT 포함)`)
  }
  if (project.eduStartDate && project.eduEndDate) {
    headerMeta.push(
      `**교육 기간**: ${formatDate(project.eduStartDate)} ~ ${formatDate(project.eduEndDate)}`,
    )
  }
  const channelDiag = draft.meta?.autoDiagnosis?.channel
  if (channelDiag?.confirmedByPm) {
    const dept =
      draft.meta?.intendedDepartment && channelDiag.detected === 'B2B'
        ? ` · 목표 부서: ${DEPT_LABEL[draft.meta.intendedDepartment]}`
        : ''
    headerMeta.push(`**채널**: ${CHANNEL_LABEL[channelDiag.detected]}${dept}`)
  }
  parts.push(headerMeta.join('  \n'))
  parts.push('\n---\n')

  // 2. 사업의 한 문장 ─────────────────────────────
  if (draft.intent) {
    parts.push(`## ✨ 사업의 한 문장 정체성\n\n${draft.intent}\n`)
  }

  // 3. Before → After ────────────────────────────
  const before = draft.beforeAfter?.before?.trim()
  const after = draft.beforeAfter?.after?.trim()
  if (before || after) {
    parts.push(`## 🎯 Before → After\n`)
    if (before) parts.push(`**Before**\n\n${before}\n`)
    if (after) parts.push(`**After**\n\n${after}\n`)
  }

  // 4. 핵심 메시지 ────────────────────────────────
  const kms = (draft.keyMessages ?? []).filter((m) => m?.trim())
  if (kms.length > 0) {
    parts.push(`## 💬 핵심 메시지\n`)
    kms.forEach((m, i) => parts.push(`${i + 1}. ${m}`))
    parts.push('')
  }

  // 5. 차별화 자산 (수락된 것만) ─────────────────
  const accepted = (draft.differentiators ?? []).filter((d) => d.acceptedByPm)
  if (accepted.length > 0) {
    parts.push(`## 🏆 차별화 자산\n`)
    for (const ref of accepted) {
      const sectionLabel = ASSET_SECTION_LABEL[ref.sectionKey] ?? ref.sectionKey
      parts.push(`### ${ref.assetId} _(${sectionLabel})_`)
      parts.push(ref.narrativeSnippet + '\n')
    }
  }

  parts.push('\n---\n')

  // 6. 7섹션 본문 ─────────────────────────────────
  const sectionKeys = ['1', '2', '3', '4', '5', '6', '7'] as const
  for (const k of sectionKeys) {
    const text = draft.sections?.[k]?.trim()
    if (!text) continue
    parts.push(`## ${k}. ${SECTION_LABELS[k]}\n\n${text}\n`)
  }

  // 7. AI 자동 진단 (참고 — 발주처 제출 시 제거 가능) ──
  const diag = draft.meta?.autoDiagnosis
  if (diag && hasAnyDiagnosis(diag)) {
    parts.push('\n---\n')
    parts.push('<!-- ai-diagnosis: 발주처 제출 시 본 섹션 제거 권장 -->\n')
    parts.push(`## 🤖 AI 자동 진단 (참고)\n`)

    if (diag.channel) {
      const conf = Math.round(diag.channel.confidence * 100)
      const status = diag.channel.confirmedByPm ? '✓ PM 컨펌' : '⚠ 컨펌 필요'
      parts.push(
        `- **채널**: ${CHANNEL_LABEL[diag.channel.detected]} · 신뢰도 ${conf}% · ${status}`,
      )
    }

    if (diag.framing) {
      const match = diag.framing.match ? '✓ 톤 일치' : '⚠ 톤 불일치'
      parts.push(`- **프레임**: ${DEPT_LABEL[diag.framing.detected]} · ${match}`)
      if (diag.framing.suggestion) {
        parts.push(`  - 💡 ${diag.framing.suggestion}`)
      }
    }

    if (diag.logicChain) {
      const status = diag.logicChain.passed ? '✓ 통과' : `⚠ 끊김 ${diag.logicChain.breakpoints.length}건`
      parts.push(
        `- **논리 흐름** (${diag.logicChain.channel}): ${diag.logicChain.passedSteps}/${diag.logicChain.totalSteps} · ${status}`,
      )
      const bps = diag.logicChain.breakpoints.filter((b) => b.stepKey !== '__notenough__')
      for (const bp of bps.slice(0, 3)) {
        parts.push(`  - ${bp.stepLabel}: ${bp.reason}`)
      }
    }

    if (diag.factCheck) {
      const fc = diag.factCheck
      parts.push(
        `- **팩트체크**: 총 ${fc.totalFacts}건 · 검증 ${fc.byStatus.verified} · 출처필요 ${fc.byStatus['needs-source']} · 의심 ${fc.byStatus.suspicious}`,
      )
    }
    parts.push('')
  }

  // 8. 발주처 공식 문서 인용 (M3-2 산출물 있을 때) ──
  if (clientOfficialDoc && hasClientDoc(clientOfficialDoc)) {
    parts.push('\n---\n')
    parts.push(`## 📚 발주처 공식 문서 인용\n`)
    if (clientOfficialDoc.sourceLabel) {
      parts.push(`> 출처: ${clientOfficialDoc.sourceLabel}\n`)
    }
    if ((clientOfficialDoc.keywords?.length ?? 0) > 0) {
      parts.push(
        `**발주처 어휘**: ${clientOfficialDoc.keywords!.slice(0, 12).join(', ')}`,
      )
    }
    if ((clientOfficialDoc.policies?.length ?? 0) > 0) {
      parts.push(`\n**정책·법령**:`)
      for (const p of clientOfficialDoc.policies!.slice(0, 6)) {
        parts.push(`- ${p}`)
      }
    }
    if ((clientOfficialDoc.track?.length ?? 0) > 0) {
      parts.push(`\n**발주처 실적**:`)
      for (const t of clientOfficialDoc.track!.slice(0, 6)) {
        parts.push(`- ${t}`)
      }
    }
    parts.push('')
  }

  // 9. 검수 결과 (있을 때) ────────────────────────
  if (draft.meta?.inspectionResult) {
    const r = draft.meta.inspectionResult
    parts.push('\n---\n')
    parts.push(`## 🔍 검수 결과 (참고)\n`)
    parts.push(
      `- 점수: **${r.overallScore}/100** · 이슈 ${r.issues.length}건 · ${r.passed ? '✓ 통과' : '⚠ 미통과'}`,
    )
    if (r.nextAction) parts.push(`- 다음 액션: ${r.nextAction}`)
    const critical = r.issues.filter((i) => i.severity === 'critical')
    if (critical.length > 0) {
      parts.push(`\n**Critical 이슈**:`)
      for (const i of critical.slice(0, 5)) {
        parts.push(`- ${i.lens}: ${i.issue}`)
      }
    }
  }

  // 9.5 Wave M5 — 사전 임팩트 리포트 ─────────────
  if (input.impactForecast) {
    const f = input.impactForecast
    parts.push('\n## 사전 임팩트 리포트 (Forecast)\n')
    parts.push(
      `**총 사회적 가치**: ${formatKRW(f.totalSocialValue)} (${f.country})`,
    )
    parts.push(`**예상 수혜자**: ${f.beneficiaryCount.toLocaleString()}명\n`)
    if (project.totalBudgetVat && project.totalBudgetVat > 0) {
      const ratio = f.totalSocialValue / project.totalBudgetVat
      parts.push(`**예산 대비 SROI**: 1:${ratio.toFixed(2)}\n`)
    }
    if (f.topBreakdown.length > 0) {
      parts.push('### 카테고리별 기여 (상위 5)\n')
      for (const b of f.topBreakdown) {
        parts.push(
          `- ${b.impactTypeName} · ${b.categoryName}: ${formatKRW(b.value)}`,
        )
      }
    }
    if (f.calibrationNote) {
      parts.push(`\n_분석 메모: ${f.calibrationNote}_`)
    }
    parts.push(
      '\n_본 forecast 는 impact-measurement 시스템 (UD impact 측정 플랫폼) 의 활성 계수 기반. 사후 실측 시 동일 계수로 비교 가능._',
    )
  }

  // 10. 메타 푸터 ─────────────────────────────────
  parts.push('\n---\n')
  parts.push(
    `_생성: ${new Date().toISOString().slice(0, 19).replace('T', ' ')} · Express 1차본 · UD-Ops_`,
  )

  return parts.join('\n')
}

// ─────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────

function formatKRW(amount: number): string {
  if (amount >= 1e8) {
    return `${(amount / 1e8).toFixed(2)}억원`
  }
  if (amount >= 1e4) {
    return `${(amount / 1e4).toLocaleString()}만원`
  }
  return `${amount.toLocaleString()}원`
}

function formatDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toISOString().slice(0, 10)
}

function hasAnyDiagnosis(d: AutoDiagnosis): boolean {
  return !!(d.channel || d.framing || d.logicChain || d.factCheck)
}

function hasClientDoc(doc: NonNullable<StrategicNotes['clientOfficialDoc']>): boolean {
  return (
    (doc.keywords?.length ?? 0) > 0 ||
    (doc.policies?.length ?? 0) > 0 ||
    (doc.track?.length ?? 0) > 0
  )
}
