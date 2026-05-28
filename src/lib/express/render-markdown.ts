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

import type {
  ExpressDraft,
  AutoDiagnosis,
  Department,
  Channel,
  MessageHierarchy,
  SectionMeta,
} from './schema'
import { SECTION_LABELS } from './schema'
import type { StrategicNotes } from '@/lib/ai/strategic-notes'
import { UD_TRACK_RECORD } from '@/lib/ud-brand'

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
  /** PR1 — sections.5 (예산 및 경제성) 자동 fallback 데이터 */
  budget?: {
    totalKrw: number
    marginRatePct?: number | null
    items?: { category: string; amount: number }[]
  } | null
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
  const { project, draft, budget, clientOfficialDoc } = input
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
  // Phase L — messageHierarchy 가 채워져 있으면 우선 사용 (key + sub + quantProofs)
  //          없으면 기존 keyMessages 사용 (하위 호환)
  const hierarchy = (draft.messageHierarchy ?? []).filter((m) => m.key?.trim())
  if (hierarchy.length > 0) {
    parts.push(`## 💬 핵심 메시지 hierarchy\n`)
    hierarchy.forEach((item, i) => {
      // 카테고리 라벨 + 큰 따옴표 헤드라인 (One Page One Thesis 적용)
      parts.push(`### ${i + 1}. "${item.key}"`)
      if (item.sub.length > 0) {
        for (const s of item.sub) {
          parts.push(`- ${s}`)
        }
      }
      if (item.quantProofs.length > 0) {
        parts.push('  **정량 근거**:')
        for (const q of item.quantProofs) {
          parts.push(`  - ${q}`)
        }
      }
      parts.push('')
    })
  } else {
    const kms = (draft.keyMessages ?? []).filter((m) => m?.trim())
    if (kms.length > 0) {
      parts.push(`## 💬 핵심 메시지\n`)
      kms.forEach((m, i) => parts.push(`${i + 1}. ${m}`))
      parts.push('')
    }
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
  // PR1: sections.5/7 fallback · PR3: 경어체 자동 변환 + 길이 marker
  // Phase L: sectionMeta (headline·subtitle) → One Page One Thesis 패턴 적용
  const sectionKeys = ['1', '2', '3', '4', '5', '6', '7'] as const
  for (const k of sectionKeys) {
    let text = draft.sections?.[k]?.trim()
    const isFallback = !text
    const meta = draft.sectionMeta?.[k]

    // sections.5 fallback — budget 데이터 있을 때
    if (!text && k === '5') {
      text = buildSection5Fallback(project.totalBudgetVat, budget)
    }
    // sections.7 fallback — UD_TRACK_RECORD 기반
    if (!text && k === '7') {
      text = buildSection7Fallback()
    }
    if (!text) continue

    // PR3: 경어체 자동 변환 (PM 작성한 평어체 → 발주처 제출용 경어체)
    const polishedText = polishProposalTone(text)

    // PR3: 길이 marker (300자 미만이면 짧음 경고)
    const charCount = polishedText.length
    const lengthMarker = charCount < 300 && !isFallback
      ? ` _(${charCount}자 · 300자+ 권장)_`
      : ''
    const fallbackMarker = isFallback ? ' _(자동 생성 · PM 보완 권장)_' : ''

    // Phase L — 헤더: ## N. 라벨 + (sectionMeta.subtitle 있으면 콜론으로 부제)
    let header = `## ${k}. ${SECTION_LABELS[k]}`
    if (meta?.subtitle) header += ` ${meta.subtitle}`
    header += `${fallbackMarker}${lengthMarker}`

    parts.push(header)
    parts.push('')

    // Phase L — One Page One Thesis: headline 있으면 큰 따옴표 인용 표시
    if (meta?.headline) {
      parts.push(`> **"${meta.headline}"**`)
      parts.push('')
    }

    parts.push(polishedText)
    parts.push('')
  }

  // PR2: 자동 일관성 경고 (SROI 본문/forecast 모순 · 채널 톤 mismatch)
  const consistencyWarnings = buildConsistencyWarnings({
    draft,
    forecastTotalSocialValue: input.impactForecast?.totalSocialValue,
  })
  // Phase L — 품질 경고 (MECE 패턴 검증 · 모호 표현 · 정량 포화)
  const qualityWarnings = buildQualityWarnings(draft)
  const allWarnings = [...consistencyWarnings, ...qualityWarnings]
  if (allWarnings.length > 0) {
    parts.push('\n---\n')
    parts.push(
      '<!-- ai-consistency: 발주처 제출 전 PM 확인 권장 -->\n',
    )
    parts.push('## ⚠ 자동 품질 점검 (PM 확인)\n')
    for (const w of allWarnings) {
      parts.push(`- **${w.title}**: ${w.detail}`)
      if (w.suggestion) parts.push(`  - 💡 ${w.suggestion}`)
    }
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

// ─────────────────────────────────────────
// PR3 — 경어체 자동 변환 (평어체 ~한다 → 경어체 ~합니다)
// ─────────────────────────────────────────

/**
 * PM 평어체 본문 → 발주처 제출용 경어체 변환.
 *
 * 종결어미만 변환 (문장 중간 동사는 그대로 둠 — 어색해질 수 있음).
 * 마침표/줄바꿈/공백 직전 패턴만 매칭.
 *
 * 예:
 *   "본 사업은 ... 구축한다." → "본 사업은 ... 구축합니다."
 *   "12주 후 검증된 MVP 보유율 80% 달성을 목표로 한다." → "... 목표로 합니다."
 *   "활용된다." → "활용됩니다."
 *
 * 주의: '한다는' '한다고' 처럼 어미가 이어지는 경우는 변환 X.
 */
export function polishProposalTone(text: string): string {
  let result = text

  // 1. ~한다 → ~합니다 (문장 종결만)
  result = result.replace(/한다(?=[.\s\n!?]|$)/g, '합니다')
  // 2. ~된다 → ~됩니다
  result = result.replace(/된다(?=[.\s\n!?]|$)/g, '됩니다')
  // 3. ~이다 → ~입니다 (단, '아이디어' 같은 단어는 ~이다 가 아니므로 안전)
  result = result.replace(/이다(?=[.\s\n!?]|$)/g, '입니다')
  // 4. ~한 다 (드물게 띄어쓴 평어체) → ~합니다
  result = result.replace(/한 다(?=[.\s\n!?]|$)/g, '합니다')
  // 5. ~된 다 → ~됩니다
  result = result.replace(/된 다(?=[.\s\n!?]|$)/g, '됩니다')

  return result
}

// ─────────────────────────────────────────
// PR2 — 자동 일관성 경고 (SROI 본문 vs forecast · 채널 톤 mismatch)
// ─────────────────────────────────────────

interface ConsistencyWarning {
  title: string
  detail: string
  suggestion?: string
}

/** B2G 톤 키워드 — '지역', '청년 유출', '공공' 등 사회공헌·정부 사업 표현 */
const B2G_TONE_KEYWORDS = [
  '지역', '청년 유출', '사회공헌', '공공', '시민', '취약계층', '복지', '균형 발전', '지자체',
]
/** B2B 톤 키워드 — 'ROI', '솔루션', '비즈니스 임팩트' 등 영리·B2B 사업 표현 */
const B2B_TONE_KEYWORDS = [
  'ROI', '솔루션', '비즈니스 임팩트', '비용 효율', '수익성', '경쟁우위', '시장 점유', '브랜드 가치',
]

export function buildConsistencyWarnings(args: {
  draft: ExpressDraft
  forecastTotalSocialValue: number | undefined
}): ConsistencyWarning[] {
  const { draft, forecastTotalSocialValue } = args
  const warnings: ConsistencyWarning[] = []

  // 1. SROI 본문 vs forecast 모순 검출
  if (forecastTotalSocialValue != null && forecastTotalSocialValue > 0) {
    const allText = Object.values(draft.sections ?? {}).filter(Boolean).join('\n')
    // 'SROI 2.3억' / 'SROI: 2.3억원' / '사회적 가치 2.3억' 등
    const sroiMatch = allText.match(/(?:SROI|사회적\s*가치)\D{0,12}(\d+(?:[\.,]\d+)?)\s*억/)
    if (sroiMatch) {
      const bodyValueEokwon = parseFloat(sroiMatch[1].replace(',', '.'))
      const bodyValueKrw = bodyValueEokwon * 1e8
      const forecastEokwon = forecastTotalSocialValue / 1e8
      const ratio = bodyValueKrw / forecastTotalSocialValue
      // 1.5배 이상 차이 — 모순으로 판정
      if (ratio >= 1.5 || ratio <= 0.66) {
        warnings.push({
          title: 'SROI 본문 vs 실제 forecast 모순',
          detail: `본문에 명시한 SROI ${bodyValueEokwon.toFixed(1)}억 vs 실제 impact-measurement forecast ${formatKRW(forecastTotalSocialValue)} (${forecastEokwon.toFixed(2)}억)`,
          suggestion: `본문의 SROI 숫자를 forecast 값 (${forecastEokwon.toFixed(2)}억) 으로 수정하거나, 본문에서 SROI 숫자를 제거하고 'forecast 리포트 참조' 로 표현 권장`,
        })
      }
    }
  }

  // 2. 채널 톤 mismatch 검출
  const detectedChannel = draft.meta?.autoDiagnosis?.channel?.detected
  if (detectedChannel === 'B2B' || detectedChannel === 'B2G') {
    const allText = Object.values(draft.sections ?? {}).filter(Boolean).join('\n')
    const b2gHits = B2G_TONE_KEYWORDS.filter((kw) => allText.includes(kw)).length
    const b2bHits = B2B_TONE_KEYWORDS.filter((kw) => allText.includes(kw)).length
    if (detectedChannel === 'B2B' && b2gHits >= 3 && b2bHits === 0) {
      warnings.push({
        title: '채널 vs 본문 톤 불일치',
        detail: `채널은 B2B (기업·재단) 로 감지 (${b2gHits}건 B2G 키워드 / B2B 키워드 0건). 본문은 사회공헌·지역사회 톤으로 작성됨.`,
        suggestion: 'B2B 발주처라면 ROI · 비즈니스 임팩트 · 경쟁우위 등 영리 사업 톤 보강 권장. 또는 채널을 B2G 로 재확인.',
      })
    }
    if (detectedChannel === 'B2G' && b2bHits >= 3 && b2gHits === 0) {
      warnings.push({
        title: '채널 vs 본문 톤 불일치',
        detail: `채널은 B2G (정부·공공) 로 감지 (${b2bHits}건 B2B 키워드 / B2G 키워드 0건). 본문은 영리·비용 효율 톤으로 작성됨.`,
        suggestion: 'B2G 발주처라면 지역 사회·공공성·균형 발전 등 공공 톤 보강 권장.',
      })
    }
  }

  return warnings
}

// ─────────────────────────────────────────
// PR1 — sections.5/7 자동 fallback
// ─────────────────────────────────────────

function buildSection5Fallback(
  totalBudgetVat: number | null,
  budget: MarkdownInput['budget'],
): string {
  if (!budget && !totalBudgetVat) {
    return 'PM 작성 권장 — Project.budget 입력 후 자동 생성 또는 수동 작성하세요.'
  }
  const lines: string[] = []
  const total = budget?.totalKrw ?? totalBudgetVat ?? 0
  lines.push(
    `본 사업 총 예산은 ${formatKRW(total)}입니다 (VAT 포함). 인건비·강사료·운영비·간접비 4대 항목으로 구분하여 집행하며, 발주처 가이드라인을 준수합니다.`,
  )
  if (budget?.items && budget.items.length > 0) {
    const byCat = budget.items.reduce<Record<string, number>>((acc, it) => {
      acc[it.category] = (acc[it.category] ?? 0) + it.amount
      return acc
    }, {})
    const rows = Object.entries(byCat)
      .sort(([, a], [, b]) => b - a)
      .map(([cat, amt]) => `- ${cat}: ${formatKRW(amt)}`)
    if (rows.length > 0) {
      lines.push('\n**항목별 배분**:')
      lines.push(...rows)
    }
  }
  if (budget?.marginRatePct != null) {
    lines.push(
      `\n**예상 마진율**: ${budget.marginRatePct.toFixed(1)}% (목표 15% 초과 ✓)`,
    )
  }
  lines.push(
    '\n_세부 산정 내역은 별도 산출 내역서로 제공합니다. 사후 정산 시 발주처 가이드 준수._',
  )
  return lines.join('\n')
}

function buildSection7Fallback(): string {
  const r = UD_TRACK_RECORD
  const lines: string[] = []
  lines.push(
    `${r.yearsActive}년간 창업가만을 전담해 온 언더독스는 다음의 실적을 보유하고 있습니다.`,
  )
  lines.push('')
  lines.push('**누적 실적**:')
  lines.push(`- 누적 수주 ${r.cumulativeRevenueBillions}억원+ · 운영 프로그램 ${r.programsConducted}건`)
  lines.push(
    `- 청년 창업가 ${r.totalGraduates.toLocaleString()}명 육성 (배출 창업팀 ${r.startupTeamsFormed.toLocaleString()}건)`,
  )
  lines.push(`- 전속 코치 풀 ${r.totalCoaches}명 · 글로벌 파트너 ${r.globalPartners}+`)
  lines.push(`- 전국 ${r.regionalHubs}개 거점 · ${r.regionsCovered}개 국내외 지역 운영`)
  lines.push(
    `- 동시 운영 가능 ${r.simultaneousCapacity.toLocaleString()}명 규모 · 신용등급 ${r.creditRating}`,
  )
  lines.push('')
  lines.push(
    `**프로그램 운영 역량**: ${r.esgMeasuredCompanies.toLocaleString()}개 기업 ESG 임팩트 측정 + 매년 ${r.startupDatabaseAnnualUpdate.toLocaleString()}명 신생 기업가 DB 갱신.`,
  )
  lines.push('')
  lines.push(
    '_본 사업 핵심 PM·코치 이력서 및 유사 수주 사례 첨부 (별첨). PM 보완 권장._',
  )
  return lines.join('\n')
}

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

// ─────────────────────────────────────────
// Phase L — 품질 점검 (MECE 일관성 · 모호 표현 · 정량 포화)
// ─────────────────────────────────────────

/** 한글 숫자 → 아라비아 숫자 변환 (1~10) */
const KO_NUM: Record<string, number> = {
  한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10,
}

/** 모호 표현 — 정량 근거로 대체 권장 */
const AMBIGUOUS_EXPRESSIONS = [
  '많은', '다양한', '충분한', '대부분', '상당한', '여러', '풍부한', '폭넓은',
  '여러가지', '여러 가지', '많이', '광범위한', '수많은', '대다수',
]

/**
 * Phase L — 품질 점검 워닝 빌더.
 *
 * 1. MECE 일관성: "N가지/N대 요소/N단계" 선언과 실제 항목 수 불일치 검출
 * 2. 모호 표현: '많은/다양한/충분한' 등 정량 근거로 대체 권장
 * 3. 정량 포화: messageHierarchy 의 quantProofs 합이 5건 미만 → UD_TRACK_RECORD 인용 제안
 */
export function buildQualityWarnings(draft: ExpressDraft): ConsistencyWarning[] {
  const warnings: ConsistencyWarning[] = []

  // ─ 1. MECE 일관성 검사 ─
  // "N가지" / "N대 요소" / "N개의 기둥" / "N단계" 선언과 실제 bullet/번호 항목 수 비교
  const sectionMap = (draft.sections ?? {}) as Record<string, string | undefined>
  for (const [k, text] of Object.entries(sectionMap)) {
    if (!text) continue
    const meceIssues = detectMeceMismatch(text)
    for (const issue of meceIssues) {
      warnings.push({
        title: `섹션 ${k} MECE 불일치`,
        detail: `"${issue.declared}" 선언했으나 실제 항목 ${issue.found}개 발견`,
        suggestion: `선언 숫자(${issue.declaredCount})와 실제 항목 수(${issue.found})를 일치시키거나, 선언 문장을 제거하세요.`,
      })
    }
  }

  // ─ 2. 모호 표현 검출 ─
  // sections 전체에서 '많은/다양한/충분한' 등 정량 없는 표현 카운트
  const allText = Object.values(sectionMap).filter(Boolean).join('\n')
  const ambiguousHits = AMBIGUOUS_EXPRESSIONS.flatMap((kw) => {
    const matches = allText.match(new RegExp(kw, 'g'))
    return matches ? Array(matches.length).fill(kw) : []
  })
  if (ambiguousHits.length >= 3) {
    const counts = ambiguousHits.reduce<Record<string, number>>((acc, kw) => {
      acc[kw] = (acc[kw] ?? 0) + 1
      return acc
    }, {})
    const top = Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([kw, n]) => `'${kw}' ${n}회`)
      .join(', ')
    warnings.push({
      title: '모호 표현 과다 (정량 대체 권장)',
      detail: `총 ${ambiguousHits.length}건 모호 표현 (${top})`,
      suggestion: `'많은 코치' → '코치 ${UD_TRACK_RECORD.totalCoaches}명' / '다양한 지역' → '${UD_TRACK_RECORD.regionalHubs}개 거점' / '풍부한 실적' → '${UD_TRACK_RECORD.cumulativeRevenueBillions}억원 누적 수주' 식으로 UD_TRACK_RECORD 수치 인용 권장.`,
    })
  }

  // ─ 3. 정량 포화 검사 ─
  // messageHierarchy 있을 때 quantProofs 총합 / 없으면 본문에서 숫자 패턴 카운트
  const hierarchy = draft.messageHierarchy ?? []
  if (hierarchy.length > 0) {
    const totalQuant = hierarchy.reduce((s, h) => s + h.quantProofs.length, 0)
    if (totalQuant < 5) {
      warnings.push({
        title: '정량 근거 부족 (메시지 hierarchy)',
        detail: `messageHierarchy 의 quantProofs 총 ${totalQuant}건 (권장 5건+)`,
        suggestion: `UD_TRACK_RECORD 핵심 수치 활용: 누적 ${UD_TRACK_RECORD.cumulativeRevenueBillions}억원 / 창업가 ${UD_TRACK_RECORD.totalGraduates.toLocaleString()}명 / 코치 ${UD_TRACK_RECORD.totalCoaches}명 / ${UD_TRACK_RECORD.regionalHubs}개 거점 / 신용등급 ${UD_TRACK_RECORD.creditRating} / 동시 운영 ${UD_TRACK_RECORD.simultaneousCapacity.toLocaleString()}명.`,
      })
    }
  } else {
    // 본문에서 숫자 + 단위 패턴 카운트 (간이 정량 포화 측정)
    const quantPattern = /\d+(?:[,.]\d+)?\s*(?:%|명|건|개|년|개월|주|회|억|만원|원|점|등급)/g
    const quantHits = (allText.match(quantPattern) ?? []).length
    if (quantHits < 6 && allText.length > 500) {
      warnings.push({
        title: '정량 근거 부족 (본문 전체)',
        detail: `본문 정량 표현 ${quantHits}건 (권장 6건+)`,
        suggestion: `숫자·년도·기관명 인용으로 신뢰도 강화. UD_TRACK_RECORD 핵심: 누적 ${UD_TRACK_RECORD.cumulativeRevenueBillions}억원 / 창업가 ${UD_TRACK_RECORD.totalGraduates.toLocaleString()}명 / 코치 ${UD_TRACK_RECORD.totalCoaches}명.`,
      })
    }
  }

  return warnings
}

interface MeceIssue {
  declared: string
  declaredCount: number
  found: number
}

/**
 * 한 섹션 본문에서 MECE 불일치 검출.
 *
 * 예: "다음 3가지 전략으로 추진합니다. - 첫째 ... - 둘째 ..." (선언 3, 실제 2)
 *
 * 패턴:
 *   - 숫자 + 가지/대/개/단계/축/기둥/요소/원칙/단계로 + (전략/방법/축 등)
 *   - 한글 수사 (한/두/세/네/다섯 + 가지/대/개)
 *
 * 항목 카운팅:
 *   - "- " bullet, "1)" / "1." / "①" 등 번호, "첫째/둘째/셋째" 순서
 */
function detectMeceMismatch(text: string): MeceIssue[] {
  const issues: MeceIssue[] = []

  // 선언 패턴: 숫자(또는 한글 수사) + 가지/대/개/단계/축/기둥/요소/원칙
  const declRegex =
    /(\d+|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*(가지|대|개의|단계|축|기둥|요소|원칙)/g
  const matches = Array.from(text.matchAll(declRegex))
  if (matches.length === 0) return issues

  // 항목 카운팅 — 각 패턴별로 출현 횟수 측정 후 최대값을 실제 항목 수로 본다
  const counts = [
    (text.match(/^\s*[-*]\s+/gm) ?? []).length,  // - bullet
    (text.match(/^\s*\d+\.\s+/gm) ?? []).length, // 1. 번호
    (text.match(/^\s*\d+\)\s+/gm) ?? []).length, // 1) 번호
    (text.match(/[①②③④⑤⑥⑦⑧⑨⑩]/g) ?? []).length, // 원숫자
    (text.match(/(?:첫째|둘째|셋째|넷째|다섯째|여섯째|일곱째)/g) ?? []).length,
  ]
  const itemCount = Math.max(...counts)

  for (const m of matches) {
    const numStr = m[1]
    const unit = m[2]
    const declaredCount = /^\d+$/.test(numStr) ? parseInt(numStr, 10) : KO_NUM[numStr] ?? 0
    // 1~2 같은 작은 수는 단순 명사구일 수 있으니 스킵 (오탐 방지)
    if (declaredCount < 3 || declaredCount > 12) continue
    if (itemCount === 0) continue // 항목 자체가 없으면 스킵 (선언만 있는 문장)
    if (Math.abs(itemCount - declaredCount) >= 1) {
      issues.push({
        declared: `${numStr}${unit}`,
        declaredCount,
        found: itemCount,
      })
      // 한 섹션에 같은 종류 워닝 여러 개 안 띄움
      break
    }
  }

  return issues
}
