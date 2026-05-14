/**
 * 전략적 맥락 (수주 핵심) — Phase 2 단순화 (claude.ts 에서 분리, 2026-05-03)
 *
 * Planning Agent의 strategicContext를 프로젝트 파이프라인에서도 활용.
 * PM이 직접 입력하거나, Planning Agent에서 자동 생성.
 */

export interface StrategicNotes {
  clientHiddenWants?: string   // 발주처가 RFP에 안 쓴 진짜 의도
  mustNotFail?: string         // 절대 실패하면 안 되는 것
  competitorWeakness?: string  // 경쟁사 대비 우리 강점
  riskFactors?: string[]       // 주요 리스크
  pastSimilarProjects?: string // 과거 유사 사업 경험/교훈
  participationDecision?: string // 참여 결정 근거
  winStrategy?: string         // 수주 핵심 전략 (PM 자유 입력)
  /**
   * Phase M3-2 (ADR-013): 발주처 공식 문서에서 추출한 키워드·정책·실적.
   * RFP 가 못 담은 발주처 컨텍스트 (홈페이지·기관 소개·중장기 계획서 등) 흡수.
   * - keywords: 발주처가 자주 쓰는 어휘 (제안서 톤 일치)
   * - policies: 정책·법령·계획 (제안서 §1 정당성 근거)
   * - track: 발주처 자체 실적·통계
   */
  clientOfficialDoc?: {
    keywords: string[]
    policies: string[]
    track: string[]
    /** PDF 파일명·URL — 출처 추적 */
    sourceLabel?: string
    /** 마지막 추출 시각 */
    extractedAt?: string
  }
}

/**
 * 전략 맥락을 프롬프트에 주입할 수 있는 형태로 포맷팅.
 * 비어있는 필드는 생략하여 토큰 절약.
 */
export function formatStrategicNotes(notes: StrategicNotes): string {
  if (!notes) return ''
  const lines: string[] = []

  if (notes.clientHiddenWants) lines.push(`- 발주처 진짜 의도: ${notes.clientHiddenWants}`)
  if (notes.mustNotFail) lines.push(`- 절대 실패 금지: ${notes.mustNotFail}`)
  if (notes.competitorWeakness) lines.push(`- 경쟁 우위: ${notes.competitorWeakness}`)
  if (notes.riskFactors?.length) lines.push(`- 주요 리스크: ${notes.riskFactors.join(' / ')}`)
  if (notes.pastSimilarProjects) lines.push(`- 과거 유사 경험: ${notes.pastSimilarProjects}`)
  if (notes.winStrategy) lines.push(`- 수주 전략: ${notes.winStrategy}`)

  // Phase M3-2: 발주처 공식 문서 추출 컨텍스트
  const doc = notes.clientOfficialDoc
  if (doc) {
    if (doc.keywords?.length) lines.push(`- 발주처 어휘: ${doc.keywords.slice(0, 10).join(', ')}`)
    if (doc.policies?.length) lines.push(`- 발주처 정책·법령: ${doc.policies.slice(0, 5).join(' / ')}`)
    if (doc.track?.length) lines.push(`- 발주처 실적: ${doc.track.slice(0, 5).join(' / ')}`)
  }

  if (lines.length === 0) return ''

  return `\n═══════════════════════════════════════
[전략적 맥락 — 제안서의 톤과 강조점을 이 전략에 맞추세요]
═══════════════════════════════════════
${lines.join('\n')}

핵심 지시:
- "발주처 진짜 의도"가 있으면 해당 니즈를 제안서 전반에 자연스럽게 녹이세요
- "절대 실패 금지" 항목에 대해서는 구체적 대응 방안을 반드시 포함하세요
- "경쟁 우위"를 활용하여 차별화 포인트를 부각하세요
═══════════════════════════════════════\n`
}
