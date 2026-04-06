import Anthropic from '@anthropic-ai/sdk'

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export const CLAUDE_MODEL = 'claude-sonnet-4-6'

/**
 * Claude가 반환한 텍스트에서 JSON 객체를 안전하게 추출.
 * - 마크다운 코드블록 제거
 * - 첫 번째 { 부터 마지막 } 까지만 슬라이스 (잘린 JSON 방어)
 * - 잘린 경우 에러 메시지에 원인 포함
 */
function safeParseJson<T>(raw: string, label: string): T {
  // 마크다운 펜스 제거
  let s = raw.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim()
  // { } 또는 [ ] 중 먼저 나오는 것을 기준으로 자동 감지
  const objStart = s.indexOf('{')
  const arrStart = s.indexOf('[')
  let start: number
  let end: number
  if (arrStart !== -1 && (objStart === -1 || arrStart < objStart)) {
    // 배열이 먼저 → [ ] 추출
    start = arrStart
    end = s.lastIndexOf(']')
  } else {
    // 객체가 먼저 → { } 추출
    start = objStart
    end = s.lastIndexOf('}')
  }
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`[${label}] AI 응답에서 JSON을 찾을 수 없습니다. 응답 일부: ${s.slice(0, 200)}`)
  }
  s = s.slice(start, end + 1)
  try {
    return JSON.parse(s) as T
  } catch (e: any) {
    throw new Error(`[${label}] JSON 파싱 실패: ${e.message} (응답 길이: ${s.length})`)
  }
}

// ─── RFP 파싱 ─────────────────────────────────────────────
export interface RfpParsed {
  projectName: string
  client: string
  totalBudgetVat: number | null
  supplyPrice: number | null
  projectStartDate: string | null
  projectEndDate: string | null
  eduStartDate: string | null
  eduEndDate: string | null
  targetAudience: string
  targetCount: number | null
  targetStage: string[]
  objectives: string[]
  deliverables: string[]
  evalCriteria: Array<{ item: string; score: number; notes: string }>
  constraints: Array<{ type: string; description: string }>
  requiredPersonnel: Array<{ role: string; qualification: string; count: number }>
  keywords: string[]
  projectType: 'B2G' | 'B2B'
  region: string
  summary: string
}

export async function parseRfp(text: string): Promise<RfpParsed> {
  const msg = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `당신은 교육 사업 제안서 전문가입니다. 아래 RFP(제안요청서) 텍스트를 분석하여 구조화된 JSON으로 반환하세요.

반드시 아래 JSON 형식만 반환하세요 (마크다운 코드블록 없이):
{
  "projectName": "사업명",
  "client": "발주기관명",
  "totalBudgetVat": 예산(VAT포함, 숫자, 원 단위) 또는 null,
  "supplyPrice": 공급가액(VAT제외) 또는 null,
  "projectStartDate": "YYYY-MM-DD" 또는 null,
  "projectEndDate": "YYYY-MM-DD" 또는 null,
  "eduStartDate": "YYYY-MM-DD" 또는 null,
  "eduEndDate": "YYYY-MM-DD" 또는 null,
  "targetAudience": "대상자 설명",
  "targetCount": 참여인원수 또는 null,
  "targetStage": ["예비창업", "초기창업"] 등,
  "objectives": ["목표1", "목표2"],
  "deliverables": ["산출물1", "산출물2"],
  "evalCriteria": [{"item": "평가항목", "score": 점수, "notes": "세부내용"}],
  "constraints": [{"type": "인력/하도급/기타", "description": "제약사항"}],
  "requiredPersonnel": [{"role": "PM/코치/강사", "qualification": "자격요건", "count": 인원수}],
  "keywords": ["키워드1", "키워드2"],
  "projectType": "B2G" 또는 "B2B",
  "region": "지역",
  "summary": "사업 핵심 요약 2~3문장"
}

RFP 텍스트:
${text.slice(0, 12000)}`,
      },
    ],
  })

  const raw = (msg.content[0] as any).text.trim()
  return safeParseJson<RfpParsed>(raw, 'parseRfp')
}

// ─── 임팩트 목표 제안 (기획자 확인용) ────────────────────
export interface ImpactGoalSuggestion {
  /** AI가 제안하는 임팩트 목표 문장 */
  suggestedGoal: string
  /** 왜 이 목표를 제안하는지 근거 */
  rationale: string
  /** 추가로 확인이 필요한 질문들 */
  clarifyingQuestions: string[]
}

export async function suggestImpactGoal(
  rfpSummary: string,
  objectives: string[],
  targetAudience: string,
  targetCount: number | null,
): Promise<ImpactGoalSuggestion> {
  const msg = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `당신은 소셜임팩트 전문가이자 교육 기획자입니다.
아래 RFP 정보를 바탕으로 "이 사업이 궁극적으로 만들고자 하는 사회적 변화"를 한 문장으로 제안하고,
기획자가 검토·수정할 수 있도록 도와주세요.

사업 개요: ${rfpSummary}
목표: ${objectives.join(', ')}
대상: ${targetAudience}${targetCount ? ` (${targetCount}명)` : ''}

원칙:
- "[참여 대상]의 [구체적 역량/상태 변화]로 인해 [사회/생태계 수준 변화]가 가능해진다" 형식
- 활동이 아닌 변화(변화된 상태)를 서술
- 측정 가능한 수준으로 구체적으로

반드시 아래 JSON만 반환하세요:
{
  "suggestedGoal": "임팩트 목표 한 문장",
  "rationale": "이 목표를 제안한 근거 (2~3문장)",
  "clarifyingQuestions": ["정보 부족 시 기획자에게 물어볼 질문 1", "질문 2"]
}`,
      },
    ],
  })

  const raw = (msg.content[0] as any).text.trim()
  return safeParseJson<ImpactGoalSuggestion>(raw, 'suggestImpactGoal')
}

// ─── 임팩트 역추적 (Logic Model) ──────────────────────────
export interface LogicModel {
  impact: string[]
  outcome: string[]
  output: string[]
  activity: string[]
  input: string[]
  impactGoal: string
}

/**
 * 기획자가 확인/편집한 impactGoal을 받아 역추적으로 Logic Model을 생성.
 * impactGoal을 직접 받으므로 AI가 임의로 바꾸지 않음.
 */
export async function buildLogicModel(
  rfpSummary: string,
  objectives: string[],
  confirmedImpactGoal: string,
): Promise<LogicModel> {
  const msg = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `당신은 소셜임팩트 전문가입니다.
기획자가 확정한 임팩트 목표를 기준으로, 그 목표를 달성하기 위해 필요한 것들을 역추적하여 Logic Model을 JSON으로 반환하세요.

[확정된 임팩트 목표]
"${confirmedImpactGoal}"

사업 개요: ${rfpSummary}
추가 목표: ${objectives.join(', ')}

역추적 원칙:
1. impactGoal은 반드시 위 확정 목표 문장을 그대로 사용
2. impact: 임팩트 목표가 달성되면 나타나는 장기 사회변화 (2~3개)
3. outcome: 그 변화를 만들기 위해 참여자에게 일어나야 하는 변화 (3~4개)
4. output: outcome을 만들기 위한 직접 산출물·수치 (3~4개)
5. activity: output을 만들기 위한 구체적 교육 활동 — Action Week 반드시 포함 (4~6개)
6. input: 활동 실행에 필요한 자원 (3~4개)

반드시 아래 JSON만 반환하세요:
{
  "impactGoal": "${confirmedImpactGoal}",
  "impact": ["장기적 사회변화 1", "장기적 사회변화 2"],
  "outcome": ["참여자 변화 1", "참여자 변화 2", "참여자 변화 3"],
  "output": ["직접 산출물+수치 1", "직접 산출물 2", "직접 산출물 3"],
  "activity": ["핵심 활동 1", "Action Week: 실전 실행 주간", "핵심 활동 3", "핵심 활동 4"],
  "input": ["필요 자원 1", "필요 자원 2", "필요 자원 3"]
}`,
      },
    ],
  })

  const raw = (msg.content[0] as any).text.trim()
  return safeParseJson<LogicModel>(raw, 'buildLogicModel')
}

// ─── 커리큘럼 자동 추천 ───────────────────────────────────
export interface CurriculumSession {
  sessionNo: number
  title: string
  category: string
  method: string
  durationHours: number
  // 세션 내 시간 구성 (분 단위)
  lectureMinutes: number    // 기본 15분
  practiceMinutes: number   // 기본 35분
  isTheory: boolean
  isActionWeek: boolean
  isCoaching1on1: boolean   // Action Week 페어 1:1 코칭 세션
  objectives: string[]
  recommendedExpertise: string[]
  notes: string
}

export interface CurriculumInsight {
  type: 'info' | 'tip' | 'asset'
  message: string
}

export interface CurriculumSuggestion {
  sessions: CurriculumSession[]
  totalHours: number
  actionWeekRatio: number
  theoryRatio: number
  rationale: string
  insights: CurriculumInsight[]  // 기획자에게 전달할 안내/제안 (강제 아님)
}

export async function suggestCurriculum(
  rfpParsed: RfpParsed,
  logicModel: LogicModel,
  _availableModuleCodes: string[]
): Promise<CurriculumSuggestion> {
  const msg = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `당신은 언더독스 교육 기획 전문가입니다. IMPACT 방법론(역추적→Action Week 중심)을 기반으로 최적의 커리큘럼 초안을 설계하세요.
이 결과물은 기획자가 자유롭게 수정할 수 있는 초안입니다. 강제 규칙이 아닌 효과적인 설계안을 제시하세요.

사업명: ${rfpParsed.projectName}
대상: ${rfpParsed.targetAudience} (${rfpParsed.targetCount}명)
단계: ${rfpParsed.targetStage.join(', ')}
임팩트 목표: ${logicModel.impactGoal}
핵심 아웃컴: ${logicModel.outcome.join(', ')}
핵심 아웃풋: ${logicModel.output.join(', ')}
기간: ${rfpParsed.eduStartDate} ~ ${rfpParsed.eduEndDate}

세션 구성 기본 원칙 (기획자가 수정 가능한 기본값):
- 일반 세션: 강의 15분 + 실습 35분 (총 50분) 구성. lectureMinutes=15, practiceMinutes=35
- Action Week 세션: 실전 실행 중심. lectureMinutes=0, practiceMinutes=0 (별도 안내)
- 1:1 코칭 세션: Action Week가 포함된 주에는 1:1 온라인 코칭 세션을 페어로 배치 권장. isCoaching1on1=true

IMPACT 방법론 권장사항 (기획자 참고용):
- 이론 위주 세션보다 실습/워크숍 위주 설계 권장
- Action Week(실전 실행 주간)는 학습 효과를 높이는 핵심 요소
- Action Week 직후 1:1 온라인 코칭으로 실행 결과 리뷰 권장

반드시 아래 JSON만 반환하세요:
{
  "sessions": [
    {
      "sessionNo": 1,
      "title": "세션 제목",
      "category": "STARTUP_EDU|TECH_EDU|MENTORING|ACTION_WEEK|NETWORKING|SPECIAL_LECTURE",
      "method": "WORKSHOP|LECTURE|PRACTICE|MENTORING|ACTION_WEEK|MIXED|ONLINE",
      "durationHours": 시간수,
      "lectureMinutes": 15,
      "practiceMinutes": 35,
      "isTheory": false,
      "isActionWeek": false,
      "isCoaching1on1": false,
      "objectives": ["목표1"],
      "recommendedExpertise": ["창업 일반", "BM검증"],
      "notes": "세부 안내 및 기획자 참고사항"
    }
  ],
  "totalHours": 총시간,
  "actionWeekRatio": Action Week 비율(0~100),
  "theoryRatio": 이론 비율(0~100),
  "rationale": "커리큘럼 설계 근거 2~3문장",
  "insights": [
    {
      "type": "tip|info|asset",
      "message": "기획자에게 전달할 안내 메시지"
    }
  ]
}`,
      },
    ],
  })

  const raw = (msg.content[0] as any).text.trim()
  return safeParseJson<CurriculumSuggestion>(raw, 'suggestCurriculum')
}

// ─── 제안서 섹션 생성 ─────────────────────────────────────
const PROPOSAL_SECTIONS = [
  { no: 1, title: '사업 추진 배경 및 필요성' },
  { no: 2, title: '사업 목표 및 추진 전략' },
  { no: 3, title: '임팩트 로직 모델' },
  { no: 4, title: '교육 커리큘럼 및 운영 계획' },
  { no: 5, title: '코치 및 전문가 구성' },
  { no: 6, title: '성과 지표 및 평가 계획' },
  { no: 7, title: '추진 일정 및 예산 계획' },
]

export async function generateProposalSection(
  sectionNo: number,
  context: {
    rfpParsed: RfpParsed
    logicModel: LogicModel
    curriculum?: CurriculumSuggestion
    previousSections?: Array<{ no: number; title: string; content: string }>
  }
): Promise<string> {
  const section = PROPOSAL_SECTIONS.find((s) => s.no === sectionNo)
  if (!section) throw new Error(`섹션 ${sectionNo} 없음`)

  const prevContext = context.previousSections
    ?.map((s) => `[${s.no}. ${s.title}]\n${s.content.slice(0, 800)}`)
    .join('\n\n')

  const msg = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 3000,
    messages: [
      {
        role: 'user',
        content: `당신은 언더독스의 교육 사업 제안서 전문 작성가입니다. 아래 정보를 바탕으로 제안서의 "${section.title}" 섹션을 한국어로 작성하세요.

사업 기본 정보:
- 사업명: ${context.rfpParsed.projectName}
- 발주기관: ${context.rfpParsed.client}
- 사업 요약: ${context.rfpParsed.summary}
- 대상: ${context.rfpParsed.targetAudience} (${context.rfpParsed.targetCount}명)
- 목표: ${context.rfpParsed.objectives.join(', ')}

임팩트 목표: ${context.logicModel.impactGoal}

${prevContext ? `이전 섹션 요약:\n${prevContext}\n\n` : ''}

작성 지침:
- 전문적이고 설득력 있는 제안서 문체
- 구체적 수치와 근거 포함
- 언더독스의 IMPACT 방법론(역추적→실행 중심) 반영
- 마크다운 형식으로 소제목, 리스트 활용
- 분량: 500~800자

"${section.title}" 섹션 내용:`,
      },
    ],
  })

  return (msg.content[0] as any).text.trim()
}

export { PROPOSAL_SECTIONS }
