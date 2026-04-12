import Anthropic from '@anthropic-ai/sdk'
import {
  buildBrandContext,
  buildImpactModulesContext,
  buildCurriculumContextForProposal,
  type ImpactModuleContext,
} from './ud-brand'

// ────────────────────────────────────────────────────────────────
// LLM 백엔드: Anthropic Claude (네이티브 SDK)
// ────────────────────────────────────────────────────────────────

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

/** Logic Model 항목 — ID와 SROI 힌트를 포함한 구조화된 형태 */
export interface LogicModelItem {
  id: string           // 예: "OC-1", "AC-2"
  text: string         // 항목 내용
  sroiProxy?: string   // SROI 프록시 유형 (예: "교육훈련 임팩트", "고용 창출")
  estimatedValue?: string // 추정 임팩트 가치 (예: "인당 3.2M원")
  linkedTo?: string[]  // 연결된 상위/하위 항목 ID (예: outcome의 경우 어떤 output에서 오는지)
}

export interface LogicModel {
  impactGoal: string
  impact: LogicModelItem[]
  outcome: LogicModelItem[]
  output: LogicModelItem[]
  activity: LogicModelItem[]
  input: LogicModelItem[]
  /** LLM이 추가로 제안하는 외부 인사이트 */
  externalInsights: Array<{
    type: 'trend' | 'benchmark' | 'tip'
    source: string      // 어디서 온 인사이트인지 (예: "OECD 청년 창업 교육 가이드라인")
    message: string
    relevantLayer: 'impact' | 'outcome' | 'output' | 'activity' | 'input'
  }>
}

// ─── 외부 리서치 (티키타카 파이프라인) ────────────────────
//
// Step A: generateResearchPrompts() → PM이 외부 LLM에 복사 → 결과 수집
// Step B: 수집된 리서치를 buildLogicModel/suggestCurriculum/generateProposalSection에 주입
// → 토큰 절약 + 일관성 + PM 컨트롤

/** PM이 외부 LLM에 복사할 리서치 프롬프트 */
export interface ResearchPrompt {
  id: string
  category: 'policy' | 'market' | 'benchmark' | 'audience' | 'operation'
  title: string
  description: string
  prompt: string
  usedIn: string[]
}

/** PM이 외부 LLM에서 가져온 리서치 결과 */
export interface ExternalResearch {
  promptId: string
  category: string
  content: string
  source?: string
  attachedAt: string
}

/**
 * RFP 정보를 기반으로 외부 LLM용 리서치 프롬프트를 생성합니다.
 * 템플릿 기반 → API 호출 없음 → 토큰 비용 0.
 */
export function generateResearchPrompts(
  rfpParsed: RfpParsed,
  impactGoal?: string,
): ResearchPrompt[] {
  const { projectName, targetAudience, objectives, keywords, region, client } = rfpParsed
  const field = keywords?.slice(0, 3).join(', ') || '교육 사업'
  const year = new Date().getFullYear()

  return [
    {
      id: 'policy',
      category: 'policy',
      title: '정책/제도 동향',
      description: '"추진 배경 및 필요성"의 정책 맥락 근거',
      usedIn: ['proposal-1', 'logicModel'],
      prompt: `다음 사업과 관련된 ${year}년 최신 정책 동향을 조사해주세요.

사업명: ${projectName}
발주기관: ${client}
지역: ${region || '전국'}
분야: ${field}

조사 항목:
1. 이 사업과 직접 관련된 정부/지자체 정책 방향 (최근 1-2년)
2. 관련 법령/제도 변화 (구체적 법령명과 시행일)
3. 정부 예산/지원 추이 (증가/감소 트렌드, 가능하면 수치)
4. 이 사업이 "지금" 필요한 정책적 근거

형식: 번호 매기고, 출처/근거를 함께. 핵심만 300~500자.`,
    },
    {
      id: 'market',
      category: 'market',
      title: '시장/트렌드 데이터',
      description: '정량 근거 + 트렌드 (Logic Model, 제안서 전반)',
      usedIn: ['logicModel', 'proposal-1', 'proposal-2'],
      prompt: `다음 분야의 ${year}년 최신 시장 동향과 트렌드를 조사해주세요.

분야: ${field}
대상: ${targetAudience}
지역: ${region || '전국'}
${impactGoal ? `임팩트 목표: ${impactGoal}` : ''}

조사 항목:
1. ${field} 분야 시장 규모 및 성장 추이 (수치 포함)
2. ${year}년 주요 트렌드 3가지 (AI 활용, 디지털 전환, 글로벌화 등)
3. 주목받는 새로운 접근법/방법론
4. ${targetAudience} 관련 최신 통계/연구 데이터

형식: 번호 + 수치/출처 포함. 핵심만 300~500자.`,
    },
    {
      id: 'benchmark',
      category: 'benchmark',
      title: '타 기관 우수 사례',
      description: '차별화 전략과 벤치마킹 (커리큘럼, 운영 설계)',
      usedIn: ['logicModel', 'proposal-2', 'curriculum'],
      prompt: `다음 사업과 유사한 타 기관/해외 우수 사례를 조사해주세요.

사업 목표: ${objectives.join('; ')}
대상: ${targetAudience}
유형: 교육/육성 프로그램

조사 항목:
1. 국내 유사 사업 우수 사례 2개 (기관명, 사업명, 핵심 성과 수치)
2. 해외 벤치마크 1-2개 (교육 설계나 임팩트 측정 방법 중심)
3. 각 사례의 핵심 성공 요인 / 차별점
4. 우리가 참고할 만한 구체적 운영 방식이나 커리큘럼 구성

형식: 사례별 구분, 핵심만. 400~600자.`,
    },
    {
      id: 'audience',
      category: 'audience',
      title: '대상자 인사이트',
      description: '대상자 맞춤 설계 근거 (커리큘럼, 코치 구성)',
      usedIn: ['curriculum', 'proposal-4', 'proposal-5'],
      prompt: `다음 교육 대상자에 대한 심층 인사이트를 조사해주세요.

대상: ${targetAudience}
${region ? `지역: ${region}` : ''}
사업 목표: ${objectives.slice(0, 2).join('; ')}

조사 항목:
1. ${targetAudience}의 주요 어려움/장벽 (최근 조사/통계 기반)
2. 교육 프로그램에서 가장 원하는 것 (실용성, 네트워킹, 자격 등)
3. 교육 이탈/중도포기 주요 원인과 검증된 방지 전략
4. 이 대상에게 효과적인 교육 방법론 (PBL, 코칭, 플립러닝 등)

형식: 번호 + 근거/출처 포함. 핵심만 300~500자.`,
    },
    {
      id: 'operation',
      category: 'operation',
      title: '운영 노하우 & 리스크',
      description: '실행 계획/예산/평가 설계에 활용',
      usedIn: ['proposal-6', 'proposal-7', 'curriculum'],
      prompt: `다음 유형의 사업 운영 노하우와 리스크를 정리해주세요.

사업 유형: ${projectName} (교육/육성)
규모: ${rfpParsed.targetCount ? `${rfpParsed.targetCount}명` : '소규모'}
기간: ${rfpParsed.projectStartDate || '미정'} ~ ${rfpParsed.projectEndDate || '미정'}
${rfpParsed.totalBudgetVat ? `예산: ${(rfpParsed.totalBudgetVat / 10000).toLocaleString()}만원` : ''}

조사 항목:
1. 이 유형 사업의 흔한 운영 리스크 3가지 + 대응 전략
2. 참여자 모집/유지율을 높이는 검증된 방법
3. 발주기관이 중시하는 성과 지표와 보고 형식
4. 예산 집행 주의점 (실비 비율, 인건비 구조)

형식: 핵심만, 번호 정리. 300~500자.`,
    },
  ]
}

/**
 * 수집된 외부 리서치를 프롬프트에 주입할 수 있는 형태로 포맷팅.
 * 카테고리별로 묶어서 간결하게 정리.
 */
export function formatExternalResearch(research: ExternalResearch[]): string {
  if (!research?.length) return ''
  const grouped = research.reduce((acc, r) => {
    const key = r.category
    if (!acc[key]) acc[key] = []
    acc[key].push(r)
    return acc
  }, {} as Record<string, ExternalResearch[]>)

  const LABELS: Record<string, string> = {
    policy: '정책/제도 동향',
    market: '시장/트렌드',
    benchmark: '타 기관 사례',
    audience: '대상자 인사이트',
    operation: '운영 노하우',
  }

  const sections = Object.entries(grouped).map(([cat, items]) =>
    `[${LABELS[cat] || cat}]\n${items.map(i => i.content).join('\n')}`
  )

  return `\n═══════════════════════════════════════
[PM이 수집한 외부 리서치 — 반드시 활용하세요]
═══════════════════════════════════════
${sections.join('\n\n')}\n`
}

// 하위 호환: 기존 string[] 형식을 새 형식으로 변환
function normalizeLogicModelLayer(items: any[], prefix: string): LogicModelItem[] {
  if (!items?.length) return []
  // 이미 새 형식이면 그대로
  if (typeof items[0] === 'object' && items[0].id) return items as LogicModelItem[]
  // 기존 string[] 형식 → 변환
  return items.map((item: any, i: number) => ({
    id: `${prefix}-${i + 1}`,
    text: typeof item === 'string' ? item : (item as any).text ?? '',
  }))
}

export function normalizeLogicModel(raw: any): LogicModel {
  return {
    impactGoal: raw.impactGoal ?? '',
    impact: normalizeLogicModelLayer(raw.impact, 'IM'),
    outcome: normalizeLogicModelLayer(raw.outcome, 'OC'),
    output: normalizeLogicModelLayer(raw.output, 'OP'),
    activity: normalizeLogicModelLayer(raw.activity, 'AC'),
    input: normalizeLogicModelLayer(raw.input, 'IN'),
    externalInsights: raw.externalInsights ?? [],
  }
}

/**
 * 기획자가 확인/편집한 impactGoal을 받아 역추적으로 Logic Model을 생성.
 *
 * 티키타카 모드: externalResearch가 제공되면 PM이 수집한 리서치를 주입하고,
 * LLM에게 외부 인사이트 생성을 요청하지 않음 → 토큰 절약 + 품질 향상.
 */
export async function buildLogicModel(
  rfpSummary: string,
  objectives: string[],
  confirmedImpactGoal: string,
  externalResearch?: ExternalResearch[],
): Promise<LogicModel> {
  const hasResearch = externalResearch && externalResearch.length > 0
  const researchContext = hasResearch ? formatExternalResearch(externalResearch) : ''

  // 리서치 유무에 따라 프롬프트 분기 → 토큰 절약
  const insightInstruction = hasResearch
    ? `6. 위 [PM이 수집한 외부 리서치]를 Logic Model 설계에 반드시 반영하세요. externalInsights는 빈 배열로 두세요 (이미 PM이 수집 완료).`
    : `6. externalInsights에 이 Logic Model을 더 강화할 수 있는 외부 트렌드/벤치마크/운영 팁을 3~5개 추가하세요.`

  const msg = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: hasResearch ? 3072 : 4096, // 리서치 있으면 인사이트 생성 불필요 → 토큰 절약
    messages: [
      {
        role: 'user',
        content: `당신은 소셜임팩트 전문가이자 교육 프로그램 설계 컨설턴트입니다.
기획자가 확정한 임팩트 목표를 기준으로 역추적하여 Logic Model을 생성하세요.
${researchContext}
[확정된 임팩트 목표]
"${confirmedImpactGoal}"

사업 개요: ${rfpSummary}
추가 목표: ${objectives.join(', ')}

역추적 원칙:
1. impactGoal은 반드시 위 확정 목표 문장을 그대로 사용
2. 각 계층의 항목에 고유 ID를 부여하세요 (IM-1, OC-1, OP-1, AC-1, IN-1 형식)
3. outcome/output 항목에는 SROI 프록시 유형과 추정 임팩트 가치를 포함하세요
4. linkedTo로 항목 간 인과관계를 연결하세요 (예: OC-1은 OP-1, OP-2에서 도출)
5. activity에 Action Week를 반드시 포함하세요
${insightInstruction}

반드시 아래 JSON만 반환하세요:
{
  "impactGoal": "${confirmedImpactGoal}",
  "impact": [
    {"id": "IM-1", "text": "장기적 사회변화", "sroiProxy": "사회적 가치 유형", "estimatedValue": "추정 가치"}
  ],
  "outcome": [
    {"id": "OC-1", "text": "참여자 변화", "sroiProxy": "프록시 유형", "estimatedValue": "인당 추정 가치", "linkedTo": ["OP-1", "OP-2"]}
  ],
  "output": [
    {"id": "OP-1", "text": "직접 산출물+수치", "linkedTo": ["AC-1", "AC-2"]}
  ],
  "activity": [
    {"id": "AC-1", "text": "핵심 활동", "linkedTo": ["IN-1"]},
    {"id": "AC-3", "text": "Action Week: 실전 실행 주간", "linkedTo": ["IN-1", "IN-2"]}
  ],
  "input": [
    {"id": "IN-1", "text": "필요 자원"}
  ],
  "externalInsights": []
}`,
      },
    ],
  })

  const raw = (msg.content[0] as any).text.trim()
  const parsed = safeParseJson<any>(raw, 'buildLogicModel')
  return normalizeLogicModel(parsed)
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
  // IMPACT 18모듈 매핑 (예: "I-1", "M-2") — 참고용 가이드
  impactModuleCode?: string | null
  // Logic Model 항목 연결 (예: ["OC-1", "OP-2"]) — 이 세션이 어떤 outcome/output에 기여하는지
  logicModelLinks?: string[]
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
  impactModules: ImpactModuleContext[] = [],
  externalResearch?: ExternalResearch[],
): Promise<CurriculumSuggestion> {
  const impactContext = buildImpactModulesContext(impactModules)
  const hasResearch = externalResearch && externalResearch.length > 0
  const researchContext = hasResearch ? formatExternalResearch(externalResearch) : ''

  // Logic Model 항목을 텍스트로 변환 (새/구 형식 모두 대응)
  const formatItems = (items: any[]) =>
    items.map((item: any) => {
      if (typeof item === 'string') return item
      const parts = [item.id ? `[${item.id}]` : '', item.text]
      if (item.sroiProxy) parts.push(`(SROI: ${item.sroiProxy})`)
      return parts.filter(Boolean).join(' ')
    }).join(', ')

  const msg = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `당신은 창업 교육 프로그램 설계 전문가입니다.
${researchContext}
중요한 원칙:
1. 아래 [참고 자산]의 IMPACT 방법론은 **가이드**입니다. 강제가 아닙니다.
2. IMPACT 모듈에 가중치를 주되, ${hasResearch ? '위 [PM이 수집한 외부 리서치]를 적극 반영하여' : '최신 교육 트렌드, 해외 우수 프로그램 사례를 결합하여'} 더 나은 커리큘럼을 설계하세요.
3. "이 사업에 이런 새로운 접근도 고려해볼 만합니다" 같은 창의적 제안을 insights에 포함하세요.
4. 각 세션이 Logic Model의 어떤 outcome/output에 기여하는지 명시하세요 (logicModelLinks).

═══════════════════════════════════════
사업 정보
═══════════════════════════════════════
사업명: ${rfpParsed.projectName}
대상: ${rfpParsed.targetAudience} (${rfpParsed.targetCount}명)
단계: ${rfpParsed.targetStage.join(', ')}
기간: ${rfpParsed.eduStartDate} ~ ${rfpParsed.eduEndDate}

═══════════════════════════════════════
Logic Model (커리큘럼이 달성해야 할 것)
═══════════════════════════════════════
임팩트 목표: ${logicModel.impactGoal}
Outcome (참여자 변화): ${formatItems(logicModel.outcome)}
Output (직접 산출물): ${formatItems(logicModel.output)}
Activity (핵심 활동): ${formatItems(logicModel.activity)}

═══════════════════════════════════════
[참고 자산] 언더독스 IMPACT 방법론 (가이드, 강제 아님)
═══════════════════════════════════════
${impactContext || 'IMPACT 6단계: I(Ideation) → M(Market) → P(Product) → A(Acquisition) → C(Commercial) → T(Team)'}

세션 구성 참고:
- 일반 세션: 강의 15분 + 실습 35분 (총 50분) 기본이나, 사업 특성에 맞게 조정 가능
- Action Week: 실전 실행 주간, 이론 세션 2~3회 후 배치 권장
- 1:1 코칭: Action Week 직후 페어로 배치 권장
- IMPACT 모듈에 매핑 가능하면 impactModuleCode에 기록, 불가능하면 null
- 사업 대상 단계에 맞춰 무게중심 조정 (예비: I,M,P / 초기: A,C / 성장: C,T)

반드시 아래 JSON만 반환하세요:
{
  "sessions": [
    {
      "sessionNo": 1,
      "title": "세션 제목 (사업 맥락에 맞게)",
      "category": "STARTUP_EDU|TECH_EDU|MENTORING|ACTION_WEEK|NETWORKING|SPECIAL_LECTURE",
      "method": "WORKSHOP|LECTURE|PRACTICE|MENTORING|ACTION_WEEK|MIXED|ONLINE",
      "durationHours": 시간수,
      "lectureMinutes": 15,
      "practiceMinutes": 35,
      "isTheory": false,
      "isActionWeek": false,
      "isCoaching1on1": false,
      "objectives": ["목표1"],
      "recommendedExpertise": ["전문 분야"],
      "notes": "세부 안내",
      "impactModuleCode": "I-1 등 (해당 없으면 null)",
      "logicModelLinks": ["OC-1", "OP-2"]
    }
  ],
  "totalHours": 총시간,
  "actionWeekRatio": Action Week 비율(0~100),
  "theoryRatio": 이론 비율(0~100),
  "rationale": "커리큘럼 설계 근거 — Logic Model의 어떤 outcome을 중점적으로 달성하려 했고, 어떤 외부 사례를 참고했는지",
  "insights": [
    {"type": "tip", "message": "운영 팁 또는 최신 트렌드 제안"},
    {"type": "info", "message": "타 기관 우수 사례 참고 정보"},
    {"type": "asset", "message": "언더독스 내부 자산 활용 제안"}
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

// 섹션별 목표 글자수 (프론트엔드 편집 UX용 export)
export const SECTION_LENGTH_TARGETS: Record<number, { min: number; max: number }> = {
  1: { min: 700, max: 900 },
  2: { min: 700, max: 900 },
  3: { min: 800, max: 1000 },
  4: { min: 900, max: 1200 },
  5: { min: 700, max: 900 },
  6: { min: 700, max: 900 },
  7: { min: 700, max: 900 },
}

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
    externalResearch?: ExternalResearch[]
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

  const msg = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `당신은 교육 사업 제안서 전문 작성가입니다. 아래 브랜드 자산과 사업 정보를 바탕으로 제안서의 "${section.title}" 섹션을 한국어로 작성하세요.

${hasResearch ? '중요: 아래 [PM이 수집한 외부 리서치]를 반드시 활용하여 정량 근거와 외부 사례를 자연스럽게 녹이세요.' : '중요: 언더독스의 내부 자산을 활용하되, 최신 교육 트렌드와 타 기관 우수 사례를 자연스럽게 결합하세요.'}
내부 홍보만이 아닌, 업계 맥락에서 차별화를 보여주는 것이 높은 평가를 받습니다.
${researchContext}

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
