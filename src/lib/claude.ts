import Anthropic from '@anthropic-ai/sdk'
import {
  buildBrandContext,
  buildImpactModulesContext,
  buildCurriculumContextForProposal,
  type ImpactModuleContext,
} from './ud-brand'
import {
  PROJECT_TASK_VALUES,
  type ProjectTaskType,
} from './program-profile'

// ────────────────────────────────────────────────────────────────
// LLM 백엔드: Anthropic Claude (네이티브 SDK)
// ────────────────────────────────────────────────────────────────

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export const CLAUDE_MODEL = 'claude-sonnet-4-6'

/**
 * Claude/Gemini 가 반환한 텍스트에서 JSON 을 안전하게 추출.
 *
 * 강화 (2026-04-27 L1):
 *  - 마크다운 펜스(```json …```) 제거
 *  - { } 또는 [ ] 자동 감지
 *  - **자동 복구 시도** — 1차 실패 시:
 *      a. trailing comma 제거 (`, }` `, ]`)
 *      b. 미닫힌 문자열·배열·객체 자동 보정
 *      c. 잘린 끝 부분 정리 (마지막 완전한 키:값 까지만 사용)
 *  - 모든 시도 실패 시 명확한 에러 (응답 길이·실패 위치 포함)
 *
 * 호출자가 재시도 여부 판단할 수 있도록 `originalRaw` 를 에러에 부착.
 */
export class JsonParseError extends Error {
  constructor(
    public readonly label: string,
    public readonly originalRaw: string,
    public readonly innerError: Error,
  ) {
    super(`[${label}] JSON 파싱 실패: ${innerError.message} (원본 길이: ${originalRaw.length})`)
    this.name = 'JsonParseError'
  }
}

function stripFenceAndExtract(raw: string): string {
  let s = raw.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim()
  const objStart = s.indexOf('{')
  const arrStart = s.indexOf('[')
  let start: number
  let end: number
  if (arrStart !== -1 && (objStart === -1 || arrStart < objStart)) {
    start = arrStart
    end = s.lastIndexOf(']')
  } else {
    start = objStart
    end = s.lastIndexOf('}')
  }
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('JSON 본문을 찾을 수 없음')
  }
  return s.slice(start, end + 1)
}

/** 자주 발생하는 LLM JSON 오류 자동 복구 */
function attemptRepair(s: string): string {
  let r = s
  // 1) trailing comma 제거: ", }" → " }"  / ", ]" → " ]"
  r = r.replace(/,(\s*[}\]])/g, '$1')
  // 2) 짝 안 맞는 따옴표·괄호 보정 — 단순 카운트 기반 누락 복구
  const openBraces = (r.match(/\{/g) ?? []).length
  const closeBraces = (r.match(/\}/g) ?? []).length
  const openBrackets = (r.match(/\[/g) ?? []).length
  const closeBrackets = (r.match(/\]/g) ?? []).length
  if (openBraces > closeBraces) r = r + '}'.repeat(openBraces - closeBraces)
  if (openBrackets > closeBrackets) r = r + ']'.repeat(openBrackets - closeBrackets)
  return r
}

/** 끝부분이 깨진 경우, 마지막 완전한 항목까지로 잘라냄 */
function truncateToLastValid(s: string): string | null {
  // 가장 마지막 콤마 또는 } / ] 위치를 찾아 그 이후 자름
  for (let i = s.length - 1; i > 0; i--) {
    const c = s[i]
    if (c === '}' || c === ']') {
      const candidate = s.slice(0, i + 1)
      try {
        JSON.parse(candidate)
        return candidate
      } catch { /* continue */ }
    }
  }
  return null
}

/**
 * 외부 모듈에서 사용할 때는 `safeParseJsonExternal` 로 import.
 * (내부 함수와 같은 시그니처, 단지 export alias)
 */
export function safeParseJsonExternal<T>(raw: string, label: string): T {
  return safeParseJson<T>(raw, label)
}

function safeParseJson<T>(raw: string, label: string): T {
  let extracted: string
  try {
    extracted = stripFenceAndExtract(raw)
  } catch (e: any) {
    throw new JsonParseError(label, raw, e)
  }

  // 1차 시도 — 그대로
  try {
    return JSON.parse(extracted) as T
  } catch (firstError: any) {
    // 2차 시도 — trailing comma + 누락 괄호 보정
    const repaired = attemptRepair(extracted)
    try {
      return JSON.parse(repaired) as T
    } catch {
      // 3차 시도 — 끝부분 자르기
      const truncated = truncateToLastValid(repaired)
      if (truncated) {
        try {
          return JSON.parse(truncated) as T
        } catch { /* fall through */ }
      }
      throw new JsonParseError(label, raw, firstError)
    }
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
  /**
   * v1.1: RFP 본문에서 자동 감지한 과업 유형 (6종 중 해당하는 것만).
   * step-rfp.tsx 가 이 값을 programProfile.supportStructure.tasks 초기값으로 주입.
   */
  detectedTasks?: ProjectTaskType[]
}

export async function parseRfp(text: string): Promise<RfpParsed> {
  const msg = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 16384, // L1 확대 (4096 → 16384) — RFP 본문이 길 때 절단 방지
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
  "summary": "사업 핵심 요약 2~3문장",
  "detectedTasks": ["모객", "심사_선발", ...]
}

"detectedTasks" 작성 지침 (중요):
이 사업에 다음 6가지 과업 유형 중 어떤 것이 포함되는지 판단하여 detectedTasks 배열로 반환하세요.
RFP 본문에 **명시적으로 나오는 것만** (추정 금지). 반드시 아래 6개 값 중에서만 선택:
  - "모객" : 참여자 모집·홍보 과업 (공고·홍보·신청 접수 등)
  - "심사_선발" : 공모·심사·선정 단계 (서류 심사·PT·평가위원 등)
  - "교류_네트워킹" : 참여자 간 교류·외부 파트너 네트워킹·동문 연결
  - "멘토링_코칭" : 1:1 또는 팀 기반 멘토링·코칭 (전담 코치·멘토단)
  - "컨설팅_산출물" : 명확한 deliverable (보고서·실물·디자인·브랜딩 등 산출물 제출)
  - "행사_운영" : 데모데이·박람회·페스티벌·컨퍼런스 등 이벤트 운영
보통 한 사업에 2~5개가 포함됩니다. RFP 에 흔적이 없으면 빈 배열 [] 로 반환.

RFP 텍스트:
${text.length > 200000 ? text.slice(0, 200000) + '\n\n[...분량 초과로 일부 생략...]' : text}`,
      },
    ],
  })

  const raw = (msg.content[0] as any).text.trim()
  const parsed = safeParseJson<RfpParsed>(raw, 'parseRfp')
  // detectedTasks 검증 — enum 밖 값은 필터링
  if (Array.isArray(parsed.detectedTasks)) {
    parsed.detectedTasks = parsed.detectedTasks.filter((t): t is ProjectTaskType =>
      (PROJECT_TASK_VALUES as readonly string[]).includes(t),
    )
  } else {
    parsed.detectedTasks = []
  }
  return parsed
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
    max_tokens: 8192, // L1 확대 (1024 → 8192) — Impact Goal 응답 절단 사고 (2026-04-27)
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

// ─── 전략적 맥락 (수주 핵심) ──────────────────────────────
//
// Planning Agent의 strategicContext를 프로젝트 파이프라인에서도 활용.
// PM이 직접 입력하거나, Planning Agent에서 자동 생성.

export interface StrategicNotes {
  clientHiddenWants?: string   // 발주처가 RFP에 안 쓴 진짜 의도
  mustNotFail?: string         // 절대 실패하면 안 되는 것
  competitorWeakness?: string  // 경쟁사 대비 우리 강점
  riskFactors?: string[]       // 주요 리스크
  pastSimilarProjects?: string // 과거 유사 사업 경험/교훈
  participationDecision?: string // 참여 결정 근거
  winStrategy?: string         // 수주 핵심 전략 (PM 자유 입력)
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
    max_tokens: 16384, // L1 확대 (6144 → 16384) — Logic Model 5843byte 절단 사고 (2026-04-27)
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
    max_tokens: 16384, // L1 확대 (4096 → 16384) — 커리큘럼 길어질 때 안전 마진
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

  const msg = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 16384, // L1 확대 (4096 → 16384) — 제안서 섹션 길이 안전 마진
    messages: [
      {
        role: 'user',
        content: `당신은 교육 사업 제안서 전문 작성가입니다. 아래 브랜드 자산과 사업 정보를 바탕으로 제안서의 "${section.title}" 섹션을 한국어로 작성하세요.

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
      },
    ],
  })

  return (msg.content[0] as any).text.trim()
}

export { PROPOSAL_SECTIONS }
