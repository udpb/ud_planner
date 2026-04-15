/**
 * 평가배점 전략 분석 — 규칙 기반 순수 유틸.
 *
 * 입력: `RfpParsed.evalCriteria` (Array<{ item, score, notes? }>)
 * 출력: `EvalStrategy` (pipeline-context.ts §1.2 SSoT 기준)
 *
 * 하는 일:
 *   1. 평가항목을 점수순으로 정렬 → 상위 3 추출
 *   2. 각 항목을 제안서 표준 섹션(ProposalSectionKey)에 키워드로 매핑
 *   3. 가중치(weight) 정규화 (점수/총점)
 *   4. PM 에게 보여줄 한 줄 guidance + 전체 overallGuidance 생성
 *
 * 사용처:
 *   - Step 1D UI (B4): 가이드 메시지 렌더
 *   - Step 1 AI 분석 (B1): 프롬프트 주입용 context
 *   - pm-guide (Phase D): 섹션별 배점 강조
 *
 * 제약:
 *   - AI 호출 없음 · DB 접근 없음 · side effect 없음
 *   - any 금지 (strict)
 *
 * 참고: docs/architecture/data-contract.md §1.2 EvalStrategy
 */

import type { EvalStrategy, ProposalSectionKey } from '@/lib/pipeline-context'

// ─────────────────────────────────────────
// 섹션 매핑 키워드 (다른 모듈 재사용 가능하도록 export)
// ─────────────────────────────────────────

/**
 * 제안서 섹션별 매칭 키워드 (한글 + 영문 혼용 RFP 대응).
 *
 * 매칭 우선순위는 Object key 순서. 첫 매칭 항목이 승자.
 * - curriculum 을 상단에 두어 "교육·커리큘럼" 항목이 proposal-background("추진/계획") 에
 *   흡수되는 오매칭을 방지.
 * - 'other' 는 매칭에 사용하지 않음 (fallback).
 *
 * 장기 자산: B4 UI, pm-guide, 제안서 생성 모듈에서 공유.
 */
export const EVAL_SECTION_KEYWORDS: Record<ProposalSectionKey, string[]> = {
  curriculum: [
    '커리큘럼',
    '교육내용',
    '교육과정',
    '교육 과정',
    '프로그램',
    '교과',
    '교육 프로그램',
    'curriculum',
  ],
  coaches: ['코치', '멘토', '강사', '전문가', '컨설턴트'],
  impact: ['성과', '평가', '임팩트', '효과', '측정', '지표', 'kpi'],
  budget: ['예산', '비용', '경제성', '산출', '소요', '금액'],
  'org-team': ['조직', '전문성', '역량', '인력', '팀', '운영체계', '수행조직'],
  'proposal-background': [
    '제안',
    '배경',
    '사업계획',
    '실행계획',
    '추진계획',
    '추진전략',
    '필요성',
    '목적',
  ],
  other: [],
}

// ─────────────────────────────────────────
// 내부 타입 (입력 어댑터)
// ─────────────────────────────────────────

/**
 * 내부 분석기가 다루는 정규화된 평가 항목 형태.
 *
 * `RfpParsed.evalCriteria` 의 실제 필드명은 `item / score` 지만,
 * data-contract.md 및 EvalStrategy 출력 스펙은 `name / points` 를 쓴다.
 * 입력부에서 한 번만 변환 후, 내부 로직은 name/points 로 처리한다.
 */
interface NormalizedEvalItem {
  name: string
  points: number
}

/**
 * 외부에서 받을 수 있는 느슨한 입력 형태.
 * - RfpParsed.evalCriteria 그대로 (item/score/notes)
 * - 또는 이미 정규화된 name/points 형태
 */
type EvalCriteriaInput =
  | Array<{ item: string; score: number; notes?: string }>
  | Array<{ name: string; points: number }>
  | null
  | undefined

// ─────────────────────────────────────────
// 섹션 매핑
// ─────────────────────────────────────────

/**
 * 평가 항목명을 제안서 섹션 키로 매핑.
 *
 * @param name  평가 항목명 (예: "교육 프로그램의 적절성")
 * @returns     ProposalSectionKey — 매칭 실패 시 'other'
 */
export function mapToSection(name: string): ProposalSectionKey {
  const lower = (name ?? '').toLowerCase()
  if (!lower) return 'other'

  for (const [section, keywords] of Object.entries(EVAL_SECTION_KEYWORDS) as Array<
    [ProposalSectionKey, string[]]
  >) {
    if (section === 'other') continue
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) return section
    }
  }
  return 'other'
}

/**
 * 섹션 키를 한국어 라벨로 변환 (UI · 가이드 메시지용).
 */
export function sectionLabel(section: ProposalSectionKey): string {
  const labels: Record<ProposalSectionKey, string> = {
    'proposal-background': '제안배경·추진계획',
    'org-team': '조직·운영체계',
    curriculum: '교육 커리큘럼',
    coaches: '코치·전문가',
    budget: '예산·경제성',
    impact: '성과·평가',
    other: '기타',
  }
  return labels[section]
}

// ─────────────────────────────────────────
// 메인 분석 함수
// ─────────────────────────────────────────

/**
 * 평가배점표를 분석하여 제안 전략(EvalStrategy)을 반환.
 *
 * @param evalCriteria  `RfpParsed.evalCriteria` 또는 동일 모양의 정규화된 배열
 * @returns             EvalStrategy | null (입력이 비어있거나 총점 0 이면 null)
 */
export function analyzeEvalStrategy(
  evalCriteria: EvalCriteriaInput,
): EvalStrategy | null {
  const normalized = normalize(evalCriteria)
  if (normalized.length === 0) return null

  const total = normalized.reduce((sum, c) => sum + c.points, 0)
  if (total <= 0) return null

  // 점수 내림차순 정렬 → 상위 3
  const sorted = [...normalized].sort((a, b) => b.points - a.points)
  const top = sorted.slice(0, 3)

  const topItems: EvalStrategy['topItems'] = top.map((item) => {
    const section = mapToSection(item.name)
    const weight = item.points / total
    const guidance = buildGuidance(item.name, item.points, section, weight)
    return { name: item.name, points: item.points, section, weight, guidance }
  })

  const sectionWeights = buildSectionWeights(normalized, total)
  const overallGuidance = buildOverallGuidance(topItems, sectionWeights, total)

  return { topItems, sectionWeights, overallGuidance }
}

// ─────────────────────────────────────────
// 내부 헬퍼
// ─────────────────────────────────────────

/**
 * 입력 배열을 `{ name, points }` 형태로 정규화.
 * - `{ item, score, ... }` 는 어댑터로 치환
 * - name 미정·빈문자열·score NaN 은 제외
 * - score 는 Number 로 강제 변환 후 음수는 0 으로 clamp
 */
function normalize(input: EvalCriteriaInput): NormalizedEvalItem[] {
  if (!input || !Array.isArray(input) || input.length === 0) return []

  const out: NormalizedEvalItem[] = []
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') continue

    // 타입 가드 — item/score 또는 name/points 양쪽 허용
    const rawName =
      'name' in entry && typeof entry.name === 'string'
        ? entry.name
        : 'item' in entry && typeof entry.item === 'string'
        ? entry.item
        : ''
    const rawPoints =
      'points' in entry && typeof entry.points === 'number'
        ? entry.points
        : 'score' in entry && typeof entry.score === 'number'
        ? entry.score
        : NaN

    const name = rawName.trim()
    if (!name) continue
    if (!Number.isFinite(rawPoints)) continue

    out.push({ name, points: Math.max(0, rawPoints) })
  }
  return out
}

/**
 * 개별 top 항목용 한 줄 가이드 생성.
 */
function buildGuidance(
  name: string,
  points: number,
  section: ProposalSectionKey,
  weight: number,
): string {
  const pct = Math.round(weight * 100)
  const priority = pct >= 25 ? '최우선' : pct >= 15 ? '우선' : '주의'
  return `${name} ${points}점 (전체 ${pct}% · ${priority}) — 제안서 "${sectionLabel(section)}" 섹션에 집중.`
}

/**
 * 섹션별 총 가중치 집계. 모든 ProposalSectionKey 를 0 으로 초기화한 뒤 누적.
 */
function buildSectionWeights(
  items: NormalizedEvalItem[],
  total: number,
): Record<ProposalSectionKey, number> {
  const weights: Record<ProposalSectionKey, number> = {
    'proposal-background': 0,
    'org-team': 0,
    curriculum: 0,
    coaches: 0,
    budget: 0,
    impact: 0,
    other: 0,
  }
  if (total <= 0) return weights

  for (const item of items) {
    const section = mapToSection(item.name)
    weights[section] += item.points / total
  }
  return weights
}

/**
 * 전체 가이드 메시지 2~4 개 생성.
 * - 최고배점 항목 강조
 * - 상위 3 합계 비율 (60%+ 시 경고)
 * - 커리큘럼 20%+ → Action Week 언급
 * - 예산 15%+ → 단가 근거 강조
 */
function buildOverallGuidance(
  topItems: EvalStrategy['topItems'],
  sectionWeights: Record<ProposalSectionKey, number>,
  total: number,
): string[] {
  const guides: string[] = []

  // 1. 최고배점 항목
  const top0 = topItems[0]
  if (top0) {
    guides.push(
      `최고 배점: ${top0.name} (${top0.points}점). ${sectionLabel(top0.section)} 섹션에 분량·근거를 집중.`,
    )
  }

  // 2. 상위 3 합계 비율
  if (total > 0 && topItems.length > 0) {
    const topSum = topItems.reduce((s, t) => s + t.points, 0)
    const topPct = Math.round((topSum / total) * 100)
    if (topPct >= 60) {
      guides.push(
        `상위 ${topItems.length}개 항목이 전체의 ${topPct}% 차지. 이 영역에 리소스 집중 필요.`,
      )
    }
  }

  // 3. 커리큘럼 비중이 크면 Action Week 언급
  const curri = sectionWeights.curriculum ?? 0
  if (curri >= 0.2) {
    guides.push(
      `커리큘럼 비중 ${Math.round(curri * 100)}% — Action Week·실습 비율로 차별화 여지.`,
    )
  }

  // 4. 예산 비중이 크면 단가 근거 강조
  const bud = sectionWeights.budget ?? 0
  if (bud >= 0.15) {
    guides.push(
      `예산 평가 ${Math.round(bud * 100)}% — 단가 근거·마진 구조 명시 필수.`,
    )
  }

  return guides
}
