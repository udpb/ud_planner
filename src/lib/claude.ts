import {
  buildBrandContext,
  buildImpactModulesContext,
  buildCurriculumContextForProposal,
  type ImpactModuleContext,
} from './ud-brand'

// ────────────────────────────────────────────────────────────────
// LLM 백엔드: Google Gemini (REST 직접 호출, SDK 의존성 없음)
//
// 호환성: Anthropic SDK의 messages.create() shape를 그대로 노출
// → 기존 호출 사이트 (parseRfp, extractSlotFromAnswer, synthesizeStrategy 등)
//   를 변경하지 않고 백엔드만 교체.
//
// 응답 shape: { content: [{ text: string }] } — Anthropic과 동일
// ────────────────────────────────────────────────────────────────

// gemini-3.1-pro-preview: 최신 Pro 모델, 깊은 추론 + 한국어 강점
// thinking 허용 (Pro는 thinking 비활성화 불가, 대신 깊이 있는 분석)
export const CLAUDE_MODEL = 'gemini-3.1-pro-preview'

interface AnthropicLikeRequest {
  model: string
  max_tokens: number
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  /** true로 설정하면 Gemini responseMimeType='application/json' 강제 */
  json_mode?: boolean
}

interface AnthropicLikeResponse {
  content: Array<{ text: string }>
}

async function geminiGenerate(req: AnthropicLikeRequest): Promise<AnthropicLikeResponse> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('[claude.ts] GEMINI_API_KEY 환경변수가 설정되지 않았습니다')
  }

  // Anthropic messages → Gemini contents 변환
  const contents = req.messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${req.model}:generateContent?key=${apiKey}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        maxOutputTokens: req.max_tokens,
        temperature: 0.7,
        // Pro 모델: thinking 허용 (깊은 추론). Flash: thinking 비활성화 (토큰 절약).
        ...(req.model.includes('flash')
          ? { thinkingConfig: { thinkingBudget: 0 } }
          : {}),
        // JSON 모드: 프롬프트가 길어져도 확실히 JSON만 반환
        ...(req.json_mode ? { responseMimeType: 'application/json' } : {}),
      },
    }),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`[Gemini] HTTP ${res.status}: ${errBody.slice(0, 500)}`)
  }

  const data = (await res.json()) as any

  // Gemini 응답에서 텍스트 추출
  // 정상: candidates[0].content.parts[*].text
  // finishReason가 'MAX_TOKENS' / 'SAFETY' 등이면 텍스트가 없을 수 있음
  const candidate = data?.candidates?.[0]
  if (!candidate) {
    throw new Error(`[Gemini] 응답에 candidates가 없음: ${JSON.stringify(data).slice(0, 300)}`)
  }

  const parts = candidate?.content?.parts ?? []
  const text = parts.map((p: any) => p.text ?? '').join('')

  if (!text) {
    const finishReason = candidate.finishReason ?? 'UNKNOWN'
    throw new Error(`[Gemini] 빈 응답 (finishReason: ${finishReason})`)
  }

  return { content: [{ text }] }
}

/**
 * Anthropic SDK 호환 객체.
 * 기존 호출 사이트는 anthropic.messages.create({...}) 그대로 사용.
 * 내부적으로 Gemini REST API 호출.
 */
export const anthropic = {
  messages: {
    create: geminiGenerate,
  },
}

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
    json_mode: true,
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
${text.length > 200000 ? text.slice(0, 200000) + '\n\n[...분량 초과로 일부 생략...]' : text}`,
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
  // IMPACT 18모듈 매핑 (예: "I-1", "M-2") — AI가 자동 매핑
  impactModuleCode?: string | null
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
  impactModules: ImpactModuleContext[] = []
): Promise<CurriculumSuggestion> {
  const impactContext = buildImpactModulesContext(impactModules)

  const msg = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `당신은 언더독스 교육 기획 전문가입니다. 언더독스의 자체 IMPACT 창업방법론(6단계 18모듈, 54문항)을 기반으로 최적의 커리큘럼 초안을 설계하세요.

이 결과물은 기획자가 자유롭게 수정할 수 있는 초안입니다. 강제 규칙이 아닌 효과적인 설계안을 제시하세요.

═══════════════════════════════════════
사업 정보
═══════════════════════════════════════
사업명: ${rfpParsed.projectName}
대상: ${rfpParsed.targetAudience} (${rfpParsed.targetCount}명)
단계: ${rfpParsed.targetStage.join(', ')}
임팩트 목표: ${logicModel.impactGoal}
핵심 아웃컴: ${logicModel.outcome.join(', ')}
핵심 아웃풋: ${logicModel.output.join(', ')}
기간: ${rfpParsed.eduStartDate} ~ ${rfpParsed.eduEndDate}

═══════════════════════════════════════
${impactContext}
═══════════════════════════════════════

세션 구성 기본 원칙:
- 일반 세션: 강의 15분 + 실습 35분 (총 50분). lectureMinutes=15, practiceMinutes=35
- Action Week 세션: 실전 실행 중심. lectureMinutes=0, practiceMinutes=0 (별도 안내)
- 1:1 코칭 세션: Action Week 직후 페어로 배치 권장. isCoaching1on1=true
- 각 세션은 IMPACT 18모듈 중 하나에 매핑되어야 함 (impactModuleCode 필드)
- 사업 대상 단계(예비/초기/Seed 등)에 맞춰 IMPACT 단계의 무게중심을 조정
  · 예비창업: I, M, P 단계 비중↑
  · 초기/Seed: A, C 단계 비중↑
  · Pre-A 이상: C, T 단계 비중↑

IMPACT 방법론 권장사항:
- 이론 위주 세션보다 실습/워크숍 위주 설계
- Action Week는 P-3(프로토타입)/A-1(MVP)/A-3(전환) 같은 실행 모듈 직후 배치
- Action Week 직후 1:1 온라인 코칭으로 실행 결과 리뷰
- 6단계 흐름(I→M→P→A→C→T)을 가능하면 유지하되, 사업 특성에 맞게 일부 단계 생략 가능

반드시 아래 JSON만 반환하세요:
{
  "sessions": [
    {
      "sessionNo": 1,
      "title": "세션 제목 (사업 맥락에 맞게 변형, 모듈명 그대로 쓰지 말 것)",
      "category": "STARTUP_EDU|TECH_EDU|MENTORING|ACTION_WEEK|NETWORKING|SPECIAL_LECTURE",
      "method": "WORKSHOP|LECTURE|PRACTICE|MENTORING|ACTION_WEEK|MIXED|ONLINE",
      "durationHours": 시간수,
      "lectureMinutes": 15,
      "practiceMinutes": 35,
      "isTheory": false,
      "isActionWeek": false,
      "isCoaching1on1": false,
      "objectives": ["목표1 (해당 IMPACT 모듈의 핵심 질문 반영)"],
      "recommendedExpertise": ["창업 일반", "BM검증"],
      "notes": "세부 안내",
      "impactModuleCode": "I-1 또는 M-2 등 (없으면 null)"
    }
  ],
  "totalHours": 총시간,
  "actionWeekRatio": Action Week 비율(0~100),
  "theoryRatio": 이론 비율(0~100),
  "rationale": "커리큘럼 설계 근거 2~3문장 — 어떤 IMPACT 단계에 무게를 뒀고, 사업 대상에 어떻게 맞췄는지",
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

// 섹션별 작성 가이드 — 언더독스 제안서 패턴 분석 기반
const SECTION_GUIDES: Record<number, { headlinePattern: string; mustInclude: string[]; lengthRange: string }> = {
  1: {
    headlinePattern: '[사회 문제/정책 맥락] → [왜 지금 필요한가] → [언더독스가 적임자인 이유]',
    mustInclude: [
      '발주기관의 정책/사업 맥락 (RFP에서 추출)',
      '해당 영역의 사회적 필요성 (정량 근거)',
      '언더독스의 차별적 적합성 (실적 수치, 자체 도구, 4중 지원 체계 중 1-2개)',
    ],
    lengthRange: '700~900자',
  },
  2: {
    headlinePattern: '[임팩트 목표] → [핵심 추진 전략 3-4개] → [기대 성과 KPI]',
    mustInclude: [
      'Logic Model의 임팩트 목표를 그대로 헤드라인으로',
      '추진 전략을 3-4개 키워드로 구조화 (예: With AI / Human Touch / Born Global)',
      'KPI 목표 정량 명시 (모집/수료/창업전환/투자유치)',
    ],
    lengthRange: '700~900자',
  },
  3: {
    headlinePattern: '[Impact Goal] → [Outcome→Output→Activity→Input 역추적] → [측정 방법]',
    mustInclude: [
      'Logic Model의 5계층(Input/Activity/Output/Outcome/Impact)을 표 또는 다이어그램으로',
      'Action Week가 활동에 포함된 이유',
      '성과 측정 방법 (자체 진단 도구 ACT-PRENEURSHIP, DOGS, 6 Dimension 등 명시)',
    ],
    lengthRange: '800~1000자',
  },
  4: {
    headlinePattern: '[IMPACT 6단계 구조 설명] → [회차별 구성 표] → [Action Week 핵심 강조]',
    mustInclude: [
      'IMPACT 창업방법론의 6단계 구조(I→M→P→A→C→T) 설명',
      '확정된 커리큘럼 회차를 IMPACT 단계와 매핑하여 인용',
      'Action Week + 1:1 코칭 페어 운영 방식',
      '15분 강의 + 35분 워크숍 + EduBot AI 도우미 구조',
      '이론 비율과 실습 비율, 그것이 학습 효과에 미치는 영향',
    ],
    lengthRange: '900~1200자',
  },
  5: {
    headlinePattern: '[4중 지원 체계 그림] → [핵심 코치진 소개] → [전담 운영 약속]',
    mustInclude: [
      '4중 지원 체계 (전문멘토단 / 컨설턴트 풀 / 전담코치 / 동료 네트워크)',
      '코치 풀 규모 (800명 풀, 분야별 전문성)',
      '전담 PM + CM(Coach Manager) 운영 구조',
    ],
    lengthRange: '700~900자',
  },
  6: {
    headlinePattern: '[KPI 정량 목표] → [측정 도구] → [데이터 아카이빙·리포팅]',
    mustInclude: [
      'ACT-PRENEURSHIP 사전·사후 진단 (5가지 실행역량)',
      '5D 스킬셋 진단 (Domain/AI/Global/Data/Finance)',
      'DOGS 팀빌딩 진단',
      '언더베이스 LMS 기반 출결/만족도/코칭일지 자동 수집',
      '정부업무평가 활용 가능한 맞춤형 성과 분석 리포트',
    ],
    lengthRange: '700~900자',
  },
  7: {
    headlinePattern: '[월별 마일스톤] → [예산 항목별 비율] → [실비 60% 이하 효율 약속]',
    mustInclude: [
      '주차별 또는 월별 추진 일정 (간트차트형 표현)',
      '예산 분류 (인건비/직접비/일반관리비/이윤)',
      '프로그램 투입 비율 90%+ 효율성',
      '마진율 적정선(10~20%) 명시',
    ],
    lengthRange: '700~900자',
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
  }
): Promise<string> {
  const section = PROPOSAL_SECTIONS.find((s) => s.no === sectionNo)
  if (!section) throw new Error(`섹션 ${sectionNo} 없음`)

  const guide = SECTION_GUIDES[sectionNo]

  // 이전 섹션 요약 (앞 섹션과의 일관성 유지)
  const prevContext = context.previousSections
    ?.map((s) => `[${s.no}. ${s.title}]\n${s.content.slice(0, 600)}`)
    .join('\n\n')

  // 평가 배점 분석 — 이 섹션이 평가에서 차지하는 비중
  const evalCriteria = (context.rfpParsed.evalCriteria ?? []) as Array<{ item: string; score: number }>
  const evalContext = evalCriteria.length > 0
    ? `\n[평가 배점 — 이 섹션이 대응해야 할 항목]\n${evalCriteria.map((e) => `  - ${e.item}: ${e.score}점`).join('\n')}\n`
    : ''

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

  const msg = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `당신은 언더독스의 교육 사업 제안서 전문 작성가입니다. 아래 브랜드 자산과 사업 정보를 바탕으로 제안서의 "${section.title}" 섹션을 한국어로 작성하세요.

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

▣ 분량: ${guide.lengthRange}

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
      },
    ],
  })

  return (msg.content[0] as any).text.trim()
}

export { PROPOSAL_SECTIONS }
