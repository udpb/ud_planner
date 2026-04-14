/**
 * 기획 품질 스코어카드 — 프로젝트 데이터를 종합 분석하여 기획 완성도 산출
 * 각 카테고리별 10점 만점, 총 100점
 */

export interface ScoreCategory {
  key: string
  label: string
  score: number
  max: number
  status: 'good' | 'warn' | 'missing'
  detail: string
  action?: string // 개선 행동 제안
}

export interface PlanningScore {
  total: number
  maxTotal: number
  categories: ScoreCategory[]
}

interface ProjectData {
  rfpParsed: any
  logicModel: any
  curriculumCount: number
  curriculumItems: Array<{ isTheory: boolean; isActionWeek: boolean }>
  coachAssignmentCount: number
  budget: { marginRate: number } | null
  proposalSectionCount: number
}

export function calculatePlanningScore(data: ProjectData): PlanningScore {
  const categories: ScoreCategory[] = []

  // 1. RFP 정보 완전성 (10점)
  const rfp = data.rfpParsed
  if (!rfp) {
    categories.push({
      key: 'rfp',
      label: 'RFP 정보 완전성',
      score: 0,
      max: 10,
      status: 'missing',
      detail: 'RFP가 아직 파싱되지 않았습니다',
      action: 'RFP 분석 스텝에서 제안요청서를 업로드하세요',
    })
  } else {
    let rfpScore = 0
    const missing: string[] = []
    if (rfp.projectName) rfpScore += 1
    else missing.push('사업명')
    if (rfp.client) rfpScore += 1
    else missing.push('발주기관')
    if (rfp.totalBudgetVat || rfp.supplyPrice) rfpScore += 2
    else missing.push('예산')
    if (rfp.targetAudience && rfp.targetCount) rfpScore += 2
    else missing.push('대상자/인원')
    if (rfp.objectives?.length >= 2) rfpScore += 2
    else missing.push('목표(2개 이상)')
    if (rfp.evalCriteria?.length > 0) rfpScore += 2
    else missing.push('평가 배점')

    categories.push({
      key: 'rfp',
      label: 'RFP 정보 완전성',
      score: rfpScore,
      max: 10,
      status: rfpScore >= 8 ? 'good' : rfpScore >= 4 ? 'warn' : 'missing',
      detail: rfpScore >= 8 ? 'RFP 핵심 정보가 충분합니다' : `누락: ${missing.join(', ')}`,
      action: rfpScore < 8 ? 'RFP 분석 스텝에서 누락 항목을 보완하세요' : undefined,
    })
  }

  // 2. 임팩트 목표 구체성 (10점)
  const lm = data.logicModel
  if (!lm) {
    categories.push({
      key: 'impact',
      label: '임팩트 목표 구체성',
      score: 0,
      max: 10,
      status: 'missing',
      detail: 'Logic Model이 생성되지 않았습니다',
      action: '임팩트 설계 스텝에서 Logic Model을 생성하세요',
    })
  } else {
    let impactScore = 0
    if (lm.impactGoal && lm.impactGoal.length > 10) impactScore += 3
    if (lm.outcome?.length >= 2) impactScore += 2
    if (lm.activity?.length >= 3) impactScore += 2
    const hasActionWeek = (lm.activity ?? []).some((a: any) => {
      const text = typeof a === 'string' ? a : a?.text ?? ''
      return text.toLowerCase().includes('action')
    })
    if (hasActionWeek) impactScore += 2
    if (lm.input?.length >= 2) impactScore += 1

    categories.push({
      key: 'impact',
      label: '임팩트 목표 구체성',
      score: impactScore,
      max: 10,
      status: impactScore >= 8 ? 'good' : impactScore >= 4 ? 'warn' : 'missing',
      detail: impactScore >= 8 ? 'Logic Model이 충분히 구체적입니다'
        : impactScore >= 4 ? 'Logic Model 항목을 보완하면 기획 품질이 높아집니다'
          : 'Logic Model에 핵심 항목이 부족합니다',
      action: !hasActionWeek ? 'Activity에 Action Week를 추가하세요' : undefined,
    })
  }

  // 3. 커리큘럼-RFP 정합성 (10점)
  if (data.curriculumCount === 0) {
    categories.push({
      key: 'curriculum',
      label: '커리큘럼 설계',
      score: 0,
      max: 10,
      status: 'missing',
      detail: '커리큘럼이 작성되지 않았습니다',
      action: '커리큘럼 스텝에서 AI 생성 또는 직접 입력하세요',
    })
  } else {
    let curScore = 0
    if (data.curriculumCount >= 5) curScore += 3
    else if (data.curriculumCount >= 3) curScore += 2

    const theoryCount = data.curriculumItems.filter((c) => c.isTheory).length
    const theoryRatio = theoryCount / data.curriculumCount
    if (theoryRatio <= 0.3) curScore += 3
    else if (theoryRatio <= 0.4) curScore += 1

    const awCount = data.curriculumItems.filter((c) => c.isActionWeek).length
    if (awCount > 0) curScore += 2

    // RFP 키워드 매칭 (있으면 보너스)
    if (rfp?.keywords?.length > 0) curScore += 2
    else curScore += 1

    curScore = Math.min(curScore, 10)

    categories.push({
      key: 'curriculum',
      label: '커리큘럼 설계',
      score: curScore,
      max: 10,
      status: curScore >= 8 ? 'good' : curScore >= 4 ? 'warn' : 'missing',
      detail: `${data.curriculumCount}회차, 이론 ${Math.round(theoryRatio * 100)}%, Action Week ${awCount}회`,
      action: theoryRatio > 0.3 ? '이론 비율을 30% 이하로 줄이세요' : awCount === 0 ? 'Action Week를 추가하세요' : undefined,
    })
  }

  // 4. 코치 배정 (10점)
  if (data.coachAssignmentCount === 0) {
    categories.push({
      key: 'coaches',
      label: '코치 배정',
      score: 0,
      max: 10,
      status: 'missing',
      detail: '배정된 코치가 없습니다',
      action: '코치 배정 스텝에서 코치를 추가하세요',
    })
  } else {
    const coachScore = Math.min(data.coachAssignmentCount * 3, 10)
    categories.push({
      key: 'coaches',
      label: '코치 배정',
      score: coachScore,
      max: 10,
      status: coachScore >= 8 ? 'good' : 'warn',
      detail: `${data.coachAssignmentCount}명 배정됨`,
    })
  }

  // 5. 예산 마진 안전성 (10점)
  if (!data.budget) {
    categories.push({
      key: 'budget',
      label: '예산 마진 안전성',
      score: 0,
      max: 10,
      status: 'missing',
      detail: '예산이 산출되지 않았습니다',
      action: '예산 스텝에서 예산을 계산하세요',
    })
  } else {
    const mr = data.budget.marginRate
    let budgetScore = 0
    if (mr >= 15) budgetScore = 10
    else if (mr >= 10) budgetScore = 7
    else if (mr >= 5) budgetScore = 4
    else budgetScore = 2

    categories.push({
      key: 'budget',
      label: '예산 마진 안전성',
      score: budgetScore,
      max: 10,
      status: budgetScore >= 7 ? 'good' : budgetScore >= 4 ? 'warn' : 'missing',
      detail: `마진율 ${mr.toFixed(1)}%`,
      action: mr < 10 ? `마진율이 ${mr.toFixed(1)}%로 권장(10~20%)보다 낮습니다` : undefined,
    })
  }

  // 6. 제안서 완성도 (10점)
  const propScore = Math.round((data.proposalSectionCount / 7) * 10)
  categories.push({
    key: 'proposal',
    label: '제안서 완성도',
    score: Math.min(propScore, 10),
    max: 10,
    status: propScore >= 8 ? 'good' : propScore >= 4 ? 'warn' : 'missing',
    detail: `${data.proposalSectionCount}/7 섹션 생성됨`,
    action: propScore < 10 ? '제안서 스텝에서 미생성 섹션을 작성하세요' : undefined,
  })

  // 7. 평가 배점 대응도 (10점)
  if (!rfp?.evalCriteria?.length) {
    categories.push({
      key: 'evalAlignment',
      label: '평가 배점 대응도',
      score: 0,
      max: 10,
      status: 'missing',
      detail: '평가 배점이 입력되지 않아 대응도를 측정할 수 없습니다',
      action: 'RFP 분석에서 평가 배점을 입력하세요',
    })
  } else {
    // 평가 배점 항목 수 대비 제안서 섹션 + 커리큘럼이 얼마나 커버하는지
    const evalCount = rfp.evalCriteria.length
    let covered = 0
    if (data.proposalSectionCount >= 5) covered += 3
    if (data.curriculumCount >= 5) covered += 3
    if (lm) covered += 2
    if (data.coachAssignmentCount > 0) covered += 2
    const evalScore = Math.min(covered, 10)

    categories.push({
      key: 'evalAlignment',
      label: '평가 배점 대응도',
      score: evalScore,
      max: 10,
      status: evalScore >= 8 ? 'good' : evalScore >= 4 ? 'warn' : 'missing',
      detail: `평가 ${evalCount}개 항목 중 ${evalScore >= 8 ? '대부분' : '일부만'} 대응됨`,
      action: evalScore < 8 ? '제안서와 커리큘럼이 평가 항목을 충분히 커버하는지 확인하세요' : undefined,
    })
  }

  const total = categories.reduce((sum, c) => sum + c.score, 0)
  const maxTotal = categories.reduce((sum, c) => sum + c.max, 0)

  return { total, maxTotal, categories }
}
