/**
 * 제안서 섹션 생성 (legacy) — Phase 2.1 단순화 (claude.ts 에서 분리, 2026-05-03)
 *
 * 본 함수는 /api/ai/proposal/improve route 가 사용 (PM 피드백 정밀 반영).
 * /api/ai/proposal POST 는 src/lib/proposal-ai.ts 의 신규 generateProposalSection
 * (PipelineContext 전체 주입) 을 사용 — 이 두 함수는 의도적으로 공존.
 *
 * 관련 모듈:
 *   - src/lib/ud-brand.ts — buildBrandContext / buildImpactModulesContext / buildCurriculumContextForProposal
 *   - src/lib/ai/research.ts — formatExternalResearch
 *   - src/lib/ai/strategic-notes.ts — formatStrategicNotes
 *   - src/lib/ai/logic-model.ts — LogicModel
 *   - src/lib/ai/parse-rfp.ts — RfpParsed
 *   - src/lib/ai/curriculum-types.ts — CurriculumSuggestion
 */

import { invokeAi } from '@/lib/ai-fallback'
import { AI_TOKENS } from '@/lib/ai/config'
import {
  buildBrandContext,
  buildImpactModulesContext,
  buildCurriculumContextForProposal,
  type ImpactModuleContext,
} from '@/lib/ud-brand'
import {
  formatExternalResearch,
  type ExternalResearch,
} from '@/lib/ai/research'
import {
  formatStrategicNotes,
  type StrategicNotes,
} from '@/lib/ai/strategic-notes'
import type { RfpParsed } from '@/lib/ai/parse-rfp'
import type { LogicModel } from '@/lib/ai/logic-model'
import type { CurriculumSuggestion } from '@/lib/ai/curriculum-types'

export const PROPOSAL_SECTIONS = [
  { no: 1, title: '사업 추진 배경 및 필요성' },
  { no: 2, title: '사업 목표 및 추진 전략' },
  { no: 3, title: '임팩트 로직 모델' },
  { no: 4, title: '교육 커리큘럼 및 운영 계획' },
  { no: 5, title: '코치 및 전문가 구성' },
  { no: 6, title: '성과 지표 및 평가 계획' },
  { no: 7, title: '추진 일정 및 예산 계획' },
]

// 섹션별 목표 글자수 (프론트엔드 편집 UX용 export)
export const SECTION_LENGTH_TARGETS: Record<number, { min: number; max: number }> = {
  1: { min: 800, max: 3000 },
  2: { min: 800, max: 3500 },
  3: { min: 800, max: 2500 },
  4: { min: 1000, max: 4000 },
  5: { min: 800, max: 3000 },
  6: { min: 800, max: 3000 },
  7: { min: 800, max: 3000 },
}

// 섹션별 작성 가이드 — 실제 당선 제안서 분석 기반 (청년마을·전통문화 패턴)
//
// 당선 제안서 공통 패턴:
// ① 정책→시장→현장 3단 근거: 정부 정책/법령 변화 → 시장 데이터 → 현장 니즈
// ② 연도별 사업 흐름도: 과거 운영 경험 → 올해 차별점 → 미래 로드맵
// ③ 유형화: 대상을 2~4개 유형/트랙으로 나눠 맞춤 솔루션 제시
// ④ 한 페이지 한 메시지: 서브 헤드라인 + 비주얼 블록 + 정량 KPI
// ⑤ 제안 콘셉트 브랜딩: 영어+한국어 혼합 콘셉트명 (예: "Connect-Preneur")
//
const SECTION_GUIDES: Record<number, { headlinePattern: string; mustInclude: string[]; lengthRange: string }> = {
  1: {
    headlinePattern: '[정책/법령 변화] → [시장 데이터 + 현장 니즈] → [왜 지금, 왜 언더독스인가]',
    mustInclude: [
      '정부/지자체 정책 흐름 (최근 법령·제도 변화를 구체적 명칭과 시행일로) — 외부 리서치 활용',
      '시장 규모/성장 데이터 (정량 수치 2개 이상) — 외부 리서치 활용',
      '해당 사업 분야의 현장 과제 (대상자가 겪는 구체적 어려움)',
      '언더독스의 차별적 적합성 (누적 수주 600억+, 관련 사업 수행 실적 수치, 자체 도구)',
      '연도별 사업 흐름도: "2018~24 → 2025 → 2026" 형식으로 경험 축적 과정을 한눈에',
    ],
    lengthRange: '800~1000자',
  },
  2: {
    headlinePattern: '[콘셉트명 브랜딩] → [임팩트 목표] → [추진 전략 3-4개 키워드] → [정량 KPI 표]',
    mustInclude: [
      '제안 콘셉트를 영어+한국어 브랜딩 (예: "Connect-Preneur", "4중 페이스메이커")',
      'Logic Model의 임팩트 목표를 그대로 헤드라인으로',
      '추진 전략을 3-4개 키워드로 구조화 — 각 키워드에 1줄 설명 + 해당 Activity 연결',
      'KPI 정량 목표 표: 모집/수료율/창업전환/투자유치 등을 표 형식으로 (목표치 + 측정 방법)',
      '대상을 2~4개 유형/트랙으로 분류하여 맞춤 접근 제시 (RFP의 대상 분류 활용)',
    ],
    lengthRange: '800~1000자',
  },
  3: {
    headlinePattern: '[Impact Goal] → [5계층 역추적 + 항목 간 연결] → [SROI 힌트 + 측정 방법]',
    mustInclude: [
      'Logic Model의 5계층(Impact→Outcome→Output→Activity→Input)을 표 또는 체인 다이어그램으로',
      '각 항목의 ID와 인과관계 연결 (OC-1 ← OP-1, OP-2 형식)',
      'Outcome에 SROI 프록시 유형 명시 (교육훈련 임팩트, 고용 창출 등)',
      'Action Week가 활동에 포함된 이유 + 타 기관 대비 차별점',
      '성과 측정 도구: ACT-PRENEURSHIP 사전·사후 진단, DOGS 팀빌딩 진단, 5D 스킬셋 등 구체 명시',
      '외부 벤치마크 사례 1개 이상 인용 — 외부 리서치 활용',
    ],
    lengthRange: '900~1100자',
  },
  4: {
    headlinePattern: '[교육 과정 설계 철학] → [트랙별 커리큘럼 표] → [전담코치 코칭 체계]',
    mustInclude: [
      '교육 설계 철학: "전문강의(1h) + 전담코치 코칭(2h)" 또는 IMPACT 6단계 구조 설명',
      '트랙별(대상 유형별) 커리큘럼 회차 표: 주제/시간/강사/교육방식/결과물 포함',
      '공통교육 → 실무과정 → 심화워크숍 → 최종평가 단계 구분',
      'Action Week + 1:1 코칭 페어 운영 방식 (매주 코칭으로 실행 리뷰)',
      'AI 도구 활용 설계: 리서치/기획/프로토타이핑에 AI 도구 통합',
      '이론 vs 실습 비율 명시 + 학습 전환 효과 근거',
      '타 기관 우수 교육 사례 참고 — 외부 리서치 활용',
    ],
    lengthRange: '1000~1300자',
  },
  5: {
    headlinePattern: '[전문인력 배치 총괄표] → [핵심 코치/강사 프로필] → [4중 지원 체계]',
    mustInclude: [
      '사업총괄/기획책임/운영책임/교육관리 등 역할별 전문인력 배치표 (이름/직위/경력/핵심 실적)',
      '핵심 강사 풀: 분야별 전문가 3-5명 프로필 (소속/주요 이력/본 사업 기여점)',
      '전담코치 제도: 코치 선발 기준, 코치-교육생 매칭 방식, 코칭 주기',
      '4중 지원 체계 (전문멘토단/컨설턴트 풀/전담코치/동료 네트워크)',
      '코치 풀 규모 (800명 풀, 분야별 전문성)',
      '전담 PM + CM(Coach Manager) 운영 구조',
    ],
    lengthRange: '800~1000자',
  },
  6: {
    headlinePattern: '[정량 KPI 표 + 달성 기준] → [3단 측정 체계] → [데이터 기반 리포팅]',
    mustInclude: [
      '정량 성과 목표 표: 수료율 ≥95%, 교육만족도 ≥4.5/5, 창업전환율, 사업화 성과 등',
      'ACT-PRENEURSHIP 사전·사후 진단 (5가지 실행역량) — PRE/POST 비교',
      '5D 스킬셋 진단 (Domain/AI/Global/Data/Finance)',
      'DOGS 팀빌딩 진단',
      '3단 측정: ① 과정 중 실시간 (출결/만족도) → ② 프로그램 종료 (성과 진단) → ③ 사후 추적 (3-6개월)',
      '데이터 아카이브: 대시보드 제공, 정책/사회가치 보고서, 발주처 맞춤 보고 형식',
      '언더베이스 LMS 기반 자동 수집 + 정부업무평가 활용 가능한 리포트',
    ],
    lengthRange: '800~1000자',
  },
  7: {
    headlinePattern: '[마스터플랜 타임라인] → [단계별 마일스톤] → [예산 구조 + 효율성]',
    mustInclude: [
      '마스터플랜: 준비→모집→교육→성과→사후 5단계 타임라인 (월별/주별)',
      '단계별 핵심 마일스톤과 산출물 (계약 → 모집공고 → 교육 시작 → 중간평가 → 최종성과)',
      '예산 구조표: 인건비/직접비(교육비·장소비·홍보비)/일반관리비/이윤 비율',
      '프로그램 직접 투입 비율 90%+ 효율성 약속',
      '위기 관리: 모집 미달 시 대응, 교육생 이탈 방지, 현장 안전 계획',
      '사후 관리: 수료 후 3-6개월 추적, 커뮤니티 유지, 후속 연계 (투자/IR/네트워킹)',
    ],
    lengthRange: '800~1000자',
  },
}

export async function generateProposalSection(
  sectionNo: number,
  context: {
    rfpParsed: RfpParsed
    logicModel: LogicModel
    curriculum?: CurriculumSuggestion
    curriculumSessions?: Array<{
      sessionNo: number
      title: string
      durationHours: number
      isTheory: boolean
      isActionWeek: boolean
      isCoaching1on1: boolean
      objectives?: string[]
      impactModuleCode?: string | null
    }>
    impactModules?: ImpactModuleContext[]
    previousSections?: Array<{ no: number; title: string; content: string }>
    externalResearch?: ExternalResearch[]
    strategicNotes?: StrategicNotes
  }
): Promise<string> {
  const section = PROPOSAL_SECTIONS.find((s) => s.no === sectionNo)
  if (!section) throw new Error(`섹션 ${sectionNo} 없음`)

  const guide = SECTION_GUIDES[sectionNo]

  // 전략적 맥락 (수주 핵심)
  const strategyContext = context.strategicNotes
    ? formatStrategicNotes(context.strategicNotes)
    : ''

  // 이전 섹션 요약 (앞 섹션과의 일관성 유지)
  const prevContext = context.previousSections
    ?.map((s) => `[${s.no}. ${s.title}]\n${s.content.slice(0, 600)}`)
    .join('\n\n')

  // 평가 배점 분석 — 이 섹션에 매핑되는 배점 항목 + 가중치 계산
  const evalCriteria = (context.rfpParsed.evalCriteria ?? []) as Array<{ item: string; score: number; notes: string }>
  const EVAL_KEYWORD_MAP: Record<string, number[]> = {
    '배경': [1], '필요성': [1], '추진': [1, 2], '목표': [2], '전략': [2],
    '로직': [3], '임팩트': [3, 6], '커리큘럼': [4], '교육': [4], '운영': [4, 7],
    '코치': [5], '전문': [5], '강사': [5], '인력': [5],
    '성과': [6], '평가': [6], '지표': [6], '일정': [7], '예산': [7], '사업비': [7],
  }

  // 이 섹션에 매핑되는 배점 항목 찾기
  const sectionEvalItems = evalCriteria.filter((e) => {
    const itemText = (e.item ?? '').toLowerCase()
    return Object.entries(EVAL_KEYWORD_MAP).some(([kw, sections]) =>
      itemText.includes(kw) && sections.includes(sectionNo)
    )
  })
  const sectionScore = sectionEvalItems.reduce((sum, e) => sum + (e.score ?? 0), 0)
  const totalScore = evalCriteria.reduce((sum, e) => sum + (e.score ?? 0), 0)

  let evalContext = ''
  if (sectionEvalItems.length > 0) {
    const weight = totalScore > 0 ? Math.round((sectionScore / totalScore) * 100) : 0
    evalContext = `\n[평가 배점 — 이 섹션 관련 ${sectionScore}점 / 전체 ${totalScore}점 (${weight}%)]
${sectionEvalItems.map((e) => `  - ${e.item}: ${e.score}점${e.notes ? ` (${e.notes})` : ''}`).join('\n')}
${weight >= 25 ? '⚠ 고배점 섹션입니다. 평가 항목의 세부 기준을 하나도 빠짐없이 대응하세요.' : ''}\n`
  } else if (evalCriteria.length > 0) {
    // 매핑 안 되는 섹션이라도 전체 배점 보여줌
    evalContext = `\n[참고: 전체 평가 배점]\n${evalCriteria.map((e) => `  - ${e.item}: ${e.score}점`).join('\n')}\n`
  }

  // 외부 리서치 (티키타카 파이프라인)
  const hasResearch = context.externalResearch && context.externalResearch.length > 0
  const researchContext = hasResearch ? formatExternalResearch(context.externalResearch!) : ''

  // 브랜드 자산
  const brandContext = buildBrandContext()

  // IMPACT 모듈 컨텍스트 (섹션 3, 4에 필수)
  const impactContext = (sectionNo === 3 || sectionNo === 4) && context.impactModules?.length
    ? '\n' + buildImpactModulesContext(context.impactModules) + '\n'
    : ''

  // 커리큘럼 컨텍스트 (섹션 4, 5, 7에 필수)
  const curriculumContext = (sectionNo === 4 || sectionNo === 5 || sectionNo === 7) && context.curriculumSessions?.length
    ? '\n' + buildCurriculumContextForProposal(context.curriculumSessions) + '\n'
    : ''

  // 2026-05-03 (Phase 2.1): src/lib/claude.ts 에서 분리.
  const result = await invokeAi({
    prompt: `당신은 교육 사업 제안서 전문 작성가입니다. 아래 브랜드 자산과 사업 정보를 바탕으로 제안서의 "${section.title}" 섹션을 한국어로 작성하세요.

${hasResearch ? '중요: 아래 [PM이 수집한 외부 리서치]를 반드시 활용하여 정량 근거와 외부 사례를 자연스럽게 녹이세요.' : '중요: 언더독스의 내부 자산을 활용하되, 최신 교육 트렌드와 타 기관 우수 사례를 자연스럽게 결합하세요.'}
내부 홍보만이 아닌, 업계 맥락에서 차별화를 보여주는 것이 높은 평가를 받습니다.
${researchContext}${strategyContext}
═══════════════════════════════════════
${brandContext}
═══════════════════════════════════════

[사업 기본 정보]
- 사업명: ${context.rfpParsed.projectName}
- 발주기관: ${context.rfpParsed.client}
- 사업 요약: ${context.rfpParsed.summary}
- 대상: ${context.rfpParsed.targetAudience} (${context.rfpParsed.targetCount}명)
- 목표: ${context.rfpParsed.objectives.join(', ')}
- 임팩트 목표: ${context.logicModel.impactGoal}
${evalContext}${impactContext}${curriculumContext}
${prevContext ? `\n[이전 섹션 요약 — 일관성 유지용]\n${prevContext}\n` : ''}

═══════════════════════════════════════
[섹션 ${sectionNo}. ${section.title}] 작성 가이드
═══════════════════════════════════════

▣ 페이지 구성 공식 (one-page-one-thesis)
${guide.headlinePattern}

▣ 반드시 포함해야 할 요소:
${guide.mustInclude.map((m) => `  - ${m}`).join('\n')}

▣ 분량 참고: ${guide.lengthRange} (핵심 정보를 충분히 전달하는 것이 우선. 근거와 데이터가 풍부하면 초과해도 됩니다)

▣ 필수 적용 사항:
1. 위 [언더독스 브랜드 자산] 중 적합한 것을 자연스럽게 인용 (실적 수치, 자체 도구명, 4중 지원 체계 등)
2. "많은", "다양한", "여러" 같은 모호한 표현 ❌ → 항상 정량 표현 ⭕
3. 자신감 있는 선언형 — "~할 수 있습니다" ❌ → "~합니다" ⭕
4. 핵심 컨셉은 "따옴표로 브랜딩"하거나 영어+한국어 믹스 (Born Global, Human Touch 등)
5. 마크다운 소제목 + 리스트 활용
6. ${(sectionNo === 4 || sectionNo === 5 || sectionNo === 7) ? '위 [확정된 커리큘럼]의 회차를 직접 인용 — "1~2회차에서는...", "Action Week가 포함된 5회차" 형식' : ''}
7. ${(sectionNo === 3 || sectionNo === 4) ? '위 [IMPACT 18모듈] 중 해당하는 모듈명과 핵심 질문을 구체적으로 언급' : ''}

═══════════════════════════════════════

"${section.title}" 섹션의 본문을 마크다운 형식으로 작성하세요. 헤드라인부터 시작:`,
    maxTokens: AI_TOKENS.LARGE,
    temperature: 0.4,
    label: `proposal-section-${sectionNo}`,
  })

  return result.raw.trim()
}
