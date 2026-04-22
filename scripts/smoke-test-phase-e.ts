/**
 * smoke-test-phase-e.ts — Phase E 품질 실전 검증 (Control vs Treatment)
 *
 * 목적:
 *   양양 로컬 창업 RFP 샘플 1건을 in-memory 로 구성하고, curriculum-ai.generateCurriculum()
 *   을 Phase E 적용 전(Control, profile 미전달) / 적용 후(Treatment, profile 전달) 로
 *   두 번 호출하여 실제 AI 응답 품질을 자동 규칙으로 비교한다.
 *
 * 실행:
 *   npx tsx scripts/smoke-test-phase-e.ts
 *
 * 산출물:
 *   - scripts/smoke-output/control.json      (Phase E 미적용 응답)
 *   - scripts/smoke-output/treatment.json    (Phase E 적용 응답)
 *   - docs/journey/2026-04-21-smoke-test-phase-e.md  (Before/After 비교표 + 판정)
 *
 * 관련 설계:
 *   - src/lib/curriculum-ai.ts (Phase E methodology 스위치)
 *   - src/lib/planning-principles.ts (COMMON_PLANNING_PRINCIPLES)
 *   - src/lib/program-profile.ts (normalizeProfile)
 *
 * 비용: 실제 Claude API 호출 2회 (max_tokens 8192 each). 소액이지만 발생.
 */

// ─────────────────────────────────────────────────────────────────
// 1. .env 로딩 (인라인 — dotenv 의존성 회피)
// ─────────────────────────────────────────────────────────────────
import * as fs from 'node:fs'
import * as path from 'node:path'

const envPath = path.join(process.cwd(), '.env')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    if (!process.env[k]) process.env[k] = v
  }
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('[smoke-test-phase-e] ANTHROPIC_API_KEY 가 .env 에 없습니다.')
  process.exit(1)
}

// ─────────────────────────────────────────────────────────────────
// 2. 지연 import (env 로딩 후)
// ─────────────────────────────────────────────────────────────────
import type { RfpParsed } from '../src/lib/claude'
import type {
  RfpSlice,
  EvalStrategy,
} from '../src/lib/pipeline-context'
import {
  normalizeProfile,
  type ProgramProfile,
} from '../src/lib/program-profile'

// Anthropic SDK 직접 사용 — curriculum-ai.generateCurriculum() 은 max_tokens=8192
// 고정이라 12세션 + designRationale + appliedDirection 합치면 자주 truncation.
// 스모크 테스트는 buildCurriculumPrompt 로 프롬프트만 만들고 호출부는 자체 구현 (max_tokens 16384).
import Anthropic from '@anthropic-ai/sdk'

// ─────────────────────────────────────────────────────────────────
// 3. 양양 로컬 창업 RFP 샘플 (in-memory 수동 구성)
// ─────────────────────────────────────────────────────────────────

const RFP_PARSED: RfpParsed = {
  projectName: '2026 양양군 로컬 창업 활성화 지원 사업',
  client: '양양군청 · 강원특별자치도',
  totalBudgetVat: 440_000_000, // 4.4억
  supplyPrice: 400_000_000,
  projectStartDate: '2026-05-01',
  projectEndDate: '2026-12-31',
  eduStartDate: '2026-06-15',
  eduEndDate: '2026-11-30',
  targetAudience:
    '양양군 내 거주/사업 중인 소상공인·상인 25명 + 청년 귀촌 예비창업자 15명 (총 40명 혼합)',
  targetCount: 40,
  targetStage: ['비창업자', '예비창업_아이디어유'],
  objectives: [
    '지역 소멸 위기 속 양양 상권의 자생력 확보',
    '서핑·바다·자연 관광 자원을 활용한 로컬 브랜드 육성',
    '상인-청년-관광객을 잇는 상생 네트워크 구축',
    '양양 고유 스토리 기반 팝업/페스티벌 2회 이상 운영',
  ],
  deliverables: [
    '참여 상인/청년별 브랜드 스토리북 1부',
    '로컬 팝업 스토어 1회 (3일 이상)',
    '양양 로컬 페스티벌 1회 공동 기획/운영',
    '종료 후 자생 운영체(상인협의체) 이관 매뉴얼',
  ],
  evalCriteria: [
    {
      item: '사업 수행 계획의 적절성 및 실행력',
      score: 40,
      notes: '커리큘럼 설계·실행 체계·Action Week 구성',
    },
    {
      item: '기대 효과 및 지역 파급력',
      score: 30,
      notes: '지역 상권 활성화·관광 연계·지속 가능성',
    },
    {
      item: '제안사 수행 역량 및 유사 사업 실적',
      score: 20,
      notes: '로컬 · 상권 강화 사업 운영 경험',
    },
    { item: '예산 집행 계획의 합리성', score: 10, notes: '' },
  ],
  constraints: [
    { type: '인력', description: 'PM 1명 상주 + 로컬 코치 3명 이상' },
    { type: '기타', description: '양양 현지 오프라인 중심 운영 (최소 6회 방문)' },
  ],
  requiredPersonnel: [
    { role: 'PM', qualification: '로컬 상권 사업 PM 경력 3년+', count: 1 },
    { role: '코치', qualification: '로컬브랜드·상권 활성화 경력 2년+', count: 3 },
  ],
  keywords: ['로컬', '서핑', '바다', '상권활성화', '관광', '페스티벌', '지역소멸'],
  projectType: 'B2G',
  region: '강원특별자치도 양양군',
  summary:
    '양양군 로컬 상권의 자생력 확보와 서핑·바다 자원 기반 로컬 브랜드 육성을 위한 상인·청년 혼합 40명 대상 교육+실행 프로그램. 상인협의체 이관까지 포함.',
}

const EVAL_STRATEGY: EvalStrategy = {
  topItems: [
    {
      name: '사업 수행 계획의 적절성 및 실행력',
      points: 40,
      section: 'curriculum',
      weight: 0.4,
      guidance:
        '커리큘럼 섹션이 최고배점 — 실습 60%+ · Action Week 3회 · 1:1 코칭 페어링으로 강도 차별화.',
    },
    {
      name: '기대 효과 및 지역 파급력',
      points: 30,
      section: 'impact',
      weight: 0.3,
      guidance:
        '지역 파급력 정량 Outcome 필수 — 상권 매출·빈점포·관광객 before/after 대비.',
    },
    {
      name: '제안사 수행 역량 및 유사 사업 실적',
      points: 20,
      section: 'org-team',
      weight: 0.2,
      guidance:
        '서촌·안성 등 로컬브랜드 레퍼런스 + 93개 시·군·구 누적 운영 데이터 전면 제시.',
    },
  ],
  sectionWeights: {
    'proposal-background': 0,
    'org-team': 0.2,
    curriculum: 0.4,
    coaches: 0,
    budget: 0.1,
    impact: 0.3,
    other: 0,
  },
  overallGuidance: [
    '최고배점(커리큘럼 40%)에 자원 집중 — 실습/Action Week 비중을 가시적으로 높일 것.',
    '기대 효과(30%)는 정량 before/after 로만 서술 — "역량 강화" 등 추상 표현 금지.',
    '제안사 역량(20%)은 서촌 · 안성 같은 로컬브랜드 레퍼런스 3건+ 구체 숫자로.',
  ],
}

const RFP_SLICE: RfpSlice = {
  parsed: RFP_PARSED,
  proposalBackground:
    '양양군은 2023년 대비 2025년 빈 점포 수가 12→18개로 증가한 반면, 서핑 관광객은 연 40만→62만으로 급증하여 "관광객은 오는데 상권은 죽는" 역설적 상황에 놓여 있다. 기존 상인은 60대 이상이 78%로 디지털/브랜딩 전환 역량이 부족하고, 청년 귀촌자는 20명 미만으로 로컬 커뮤니티와 고립되어 있다. 2026년은 강원특별자치도 출범 3년차로 "자생 상권" 지표가 도 평가 기준에 포함되어, 본 사업은 단순 교육이 아닌 상권-관광-청년 세 축을 엮는 "양양형 로컬 브랜드 생태계" 를 구축한다.',
  proposalConcept: '양양을 머무는 파도로 — 상인·청년·관광객 3색 커뮤니티',
  keyPlanningPoints: [
    '상인 25 + 청년 15 혼합 편성 → 매 세션 세대/업종 페어링 로테이션으로 "섞임" 설계',
    '이론 3연속 금지 + Action Week 3회 (1회 팝업 · 1회 페스티벌 · 1회 현장 실험)',
    '운영사 철수 후 상인협의체 자율 운영 이관 로드맵 세션 2회 명시',
    '서핑·바다·자연 등 양양 고유 자원을 브랜드 스토리로 전환하는 워크숍 모듈',
  ],
  evalStrategy: EVAL_STRATEGY,
}

// ─────────────────────────────────────────────────────────────────
// 4. ProgramProfile (Phase E 방법론 스위치 주입용)
// ─────────────────────────────────────────────────────────────────

const RAW_PROFILE: ProgramProfile = {
  targetStage: '비창업자',
  targetSegment: {
    demographic: ['상인', '일반소상공인'],
    businessDomain: ['유통/커머스', '여행/레저', '식품/농업'],
    geography: '로컬',
  },
  scale: {
    budgetKrw: 440_000_000,
    budgetTier: '3-5억', // normalizeProfile 이 재계산
    participants: '20-50',
    durationMonths: 7,
  },
  formats: ['네트워킹', '페스티벌/축제'],
  delivery: {
    mode: '오프라인',
    usesLMS: true,
    onlineRatio: 15,
    usesAICoach: false,
  },
  supportStructure: {
    tasks: ['모객', '교류_네트워킹', '컨설팅_산출물', '행사_운영'],
    fourLayerSupport: false,
    coachingStyle: '1:1',
    externalSpeakers: true,
    externalSpeakerCount: 5,
    nonStartupSupport: {
      coordinationBody: '양양 상인협의체 (신설 예정)',
      domainPartners: ['양양군청 관광과', '서핑협회 강원지부'],
      matchingOperator: false,
    },
  },
  methodology: {
    primary: '로컬브랜드',
    impactModulesUsed: [],
  },
  selection: {
    style: '선정형_비경쟁',
    stages: 1,
    competitionRatio: '낮음_1:2이하',
    publicVoting: false,
    evaluatorCount: 4,
  },
  channel: {
    type: 'B2G',
    clientTier: '광역지자체',
    isRenewal: false,
  },
  primaryImpact: ['지역활성화', '역량개발'],
  aftercare: {
    hasAftercare: true,
    scope: ['alumni네트워크', '진단지속'],
    tierCount: 2,
  },
  version: '1.0',
  updatedAt: new Date().toISOString(),
}

const PROFILE = normalizeProfile(RAW_PROFILE)

// ─────────────────────────────────────────────────────────────────
// 5. AI 호출 — generateCurriculum 2회 (Control / Treatment)
// ─────────────────────────────────────────────────────────────────

interface RunResult {
  label: 'control' | 'treatment'
  ok: boolean
  raw: unknown
  error?: string
  tokensIn?: number
  tokensOut?: number
  durationMs: number
}

/**
 * Anthropic 응답에서 JSON 안전 추출 (claude.ts safeParseJson 동등).
 */
function parseJsonFromText<T>(raw: string, label: string): T {
  let s = raw.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim()
  const objStart = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (objStart === -1 || end === -1 || end <= objStart) {
    throw new Error(`[${label}] JSON 을 찾을 수 없음. head: ${s.slice(0, 200)}`)
  }
  s = s.slice(objStart, end + 1)
  return JSON.parse(s) as T
}

async function runOne(
  label: 'control' | 'treatment',
  includeProfile: boolean,
): Promise<RunResult> {
  const mod = await import('../src/lib/curriculum-ai')
  const buildCurriculumPrompt = mod.buildCurriculumPrompt

  const prompt = buildCurriculumPrompt({
    rfp: RFP_SLICE,
    totalSessions: 12,
    profile: includeProfile ? PROFILE : undefined,
  })

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const t0 = Date.now()
  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      // curriculum-ai 기본은 8192 지만 스모크 테스트는 12세션 + 설계근거 + appliedDirection
      // 를 안 잘리게 담도록 16384 로 여유 둠 (Sonnet 4 최대 64k).
      max_tokens: 16384,
      messages: [{ role: 'user', content: prompt }],
    })
    const dt = Date.now() - t0

    const first = (msg.content?.[0] ?? {}) as { type?: string; text?: string }
    if (typeof first.text !== 'string') {
      return {
        label,
        ok: false,
        raw: { error: 'no text block in response', blocks: msg.content },
        error: 'no text block in response',
        durationMs: dt,
      }
    }

    const tokensIn = msg.usage?.input_tokens
    const tokensOut = msg.usage?.output_tokens

    try {
      const parsed = parseJsonFromText<unknown>(first.text, label)
      return {
        label,
        ok: true,
        raw: parsed,
        durationMs: dt,
        tokensIn,
        tokensOut,
      }
    } catch (pe: unknown) {
      const pem = pe instanceof Error ? pe.message : String(pe)
      return {
        label,
        ok: false,
        raw: { error: pem, rawText: first.text },
        error: pem,
        durationMs: dt,
        tokensIn,
        tokensOut,
      }
    }
  } catch (e: unknown) {
    const dt = Date.now() - t0
    const msg = e instanceof Error ? e.message : String(e)
    return { label, ok: false, raw: null, error: msg, durationMs: dt }
  }
}

// ─────────────────────────────────────────────────────────────────
// 6. 자동 평가 지표
// ─────────────────────────────────────────────────────────────────

interface Metrics {
  label: 'control' | 'treatment'
  sessionCount: number
  /** 첫 3개 세션 title 에 I-1/M-1 등 IMPACT 약자 노출 수 */
  impactCodeInEarlyTitles: number
  /** 금지어 총 출현 횟수 (많은/다양한/충분한/풍부한/최적의) */
  bannedWordCount: number
  /** 시장 맥락 키워드 빈도 (2025/2026/지역 소멸/관광/로컬 등) */
  marketContextHits: number
  /** designRationale + 세션 notes/objectives 에 정량 표현 (→, %, 배) */
  quantitativeTokens: number
  /** isActionWeek 비율 (%) */
  actionWeekRatio: number
  rawJsonLength: number
}

const BANNED = ['많은', '다양한', '충분한', '풍부한', '최적의', '상당한']
const MARKET_CTX = [
  '2025',
  '2026',
  '지역 소멸',
  '지역소멸',
  '관광',
  '로컬',
  '빈 점포',
  '빈점포',
  '서핑',
  '자생',
]
const QUANT_TOKEN_RE = /→|%|[0-9]+배|[0-9]+명|[0-9]+건|[0-9]+회/g
const IMPACT_CODE_RE = /\b([IMPACT])-[1-3]\b/g

function scanTextAll(texts: string[], pattern: RegExp): number {
  let n = 0
  for (const t of texts) {
    if (!t) continue
    const matches = t.match(new RegExp(pattern.source, pattern.flags))
    n += matches?.length ?? 0
  }
  return n
}

function countSubstr(haystack: string, needle: string): number {
  if (!haystack || !needle) return 0
  let idx = 0
  let count = 0
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++
    idx += needle.length
  }
  return count
}

function computeMetrics(label: 'control' | 'treatment', raw: unknown): Metrics {
  const data = (raw ?? {}) as {
    sessions?: Array<{
      title?: string
      isActionWeek?: boolean
      objectives?: string[]
      notes?: string
    }>
    designRationale?: string
  }
  const sessions = Array.isArray(data.sessions) ? data.sessions : []
  const fullText = JSON.stringify(data)

  const early3 = sessions.slice(0, 3)
  const impactCodeInEarlyTitles = scanTextAll(
    early3.map((s) => s.title ?? ''),
    IMPACT_CODE_RE,
  )

  let bannedWordCount = 0
  for (const w of BANNED) bannedWordCount += countSubstr(fullText, w)

  let marketContextHits = 0
  for (const kw of MARKET_CTX) marketContextHits += countSubstr(fullText, kw)

  const textsForQuant = [
    data.designRationale ?? '',
    ...sessions.flatMap((s) => [s.notes ?? '', ...(s.objectives ?? [])]),
  ]
  const quantitativeTokens = scanTextAll(textsForQuant, QUANT_TOKEN_RE)

  const awCount = sessions.filter((s) => s.isActionWeek === true).length
  const actionWeekRatio =
    sessions.length > 0
      ? Math.round((awCount / sessions.length) * 1000) / 10
      : 0

  return {
    label,
    sessionCount: sessions.length,
    impactCodeInEarlyTitles,
    bannedWordCount,
    marketContextHits,
    quantitativeTokens,
    actionWeekRatio,
    rawJsonLength: fullText.length,
  }
}

// ─────────────────────────────────────────────────────────────────
// 7. 저장 & 리포트 생성
// ─────────────────────────────────────────────────────────────────

const OUTPUT_DIR = path.join(
  process.cwd(),
  'scripts',
  'smoke-output',
)
const JOURNEY_DIR = path.join(process.cwd(), 'docs', 'journey')
const REPORT_PATH = path.join(
  JOURNEY_DIR,
  '2026-04-21-smoke-test-phase-e.md',
)

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
}

function writeJson(filePath: string, obj: unknown) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf-8')
}

function fmtMarkdownTable(
  ctrl: Metrics,
  trt: Metrics,
  ctrlDuration: number,
  trtDuration: number,
): string {
  const row = (
    label: string,
    cVal: string | number,
    tVal: string | number,
    winner: 'control' | 'treatment' | 'tie',
    principle: string,
  ) => {
    const mark = (w: typeof winner) => (w === 'tie' ? '=' : w === 'treatment' ? 'T' : 'C')
    return `| ${label} | ${cVal} | ${tVal} | **${mark(winner)}** | ${principle} |`
  }

  const lines: string[] = []
  lines.push('| 지표 | Control | Treatment | 승자 | 제1원칙 관련성 |')
  lines.push('|---|---:|---:|:---:|---|')
  lines.push(
    row(
      '첫 3세션 제목에 IMPACT 코드 (I-1 등)',
      ctrl.impactCodeInEarlyTitles,
      trt.impactCodeInEarlyTitles,
      trt.impactCodeInEarlyTitles < ctrl.impactCodeInEarlyTitles
        ? 'treatment'
        : trt.impactCodeInEarlyTitles === ctrl.impactCodeInEarlyTitles
        ? 'tie'
        : 'control',
      '방법론-대상 정합성: 비창업자(상인)에 IMPACT 강제는 "과업 이해도 부족" 감점',
    ),
  )
  lines.push(
    row(
      '금지어 (많은·다양한·충분한·풍부한·최적의·상당한)',
      ctrl.bannedWordCount,
      trt.bannedWordCount,
      trt.bannedWordCount < ctrl.bannedWordCount
        ? 'treatment'
        : trt.bannedWordCount === ctrl.bannedWordCount
        ? 'tie'
        : 'control',
      '정량적 근거 원칙 — 추상어는 곧 "증거 없는 주장"',
    ),
  )
  lines.push(
    row(
      '시장 맥락 키워드 (2025·2026·지역소멸·관광·로컬·서핑·자생)',
      ctrl.marketContextHits,
      trt.marketContextHits,
      trt.marketContextHits > ctrl.marketContextHits
        ? 'treatment'
        : trt.marketContextHits === ctrl.marketContextHits
        ? 'tie'
        : 'control',
      '시장 흐름 반영 원칙 — "왜 지금" 이 얼마나 살아있는가',
    ),
  )
  lines.push(
    row(
      '정량 표현 (→, %, 배, 명, 건, 회)',
      ctrl.quantitativeTokens,
      trt.quantitativeTokens,
      trt.quantitativeTokens > ctrl.quantitativeTokens
        ? 'treatment'
        : trt.quantitativeTokens === ctrl.quantitativeTokens
        ? 'tie'
        : 'control',
      'Before/After 원칙 — 측정 가능한 변화로만 기대효과 배점 확보',
    ),
  )
  lines.push(
    row(
      'Action Week 비율 (%)',
      `${ctrl.actionWeekRatio}%`,
      `${trt.actionWeekRatio}%`,
      trt.actionWeekRatio > ctrl.actionWeekRatio
        ? 'treatment'
        : trt.actionWeekRatio === ctrl.actionWeekRatio
        ? 'tie'
        : 'control',
      '로컬브랜드 방법론 요구 — 현장 실행 주간이 곧 최고배점 "실행력" 증빙',
    ),
  )
  lines.push(
    row(
      '세션 수',
      ctrl.sessionCount,
      trt.sessionCount,
      'tie',
      '참고 — 둘 다 12회 힌트 제공',
    ),
  )
  lines.push(
    row(
      '응답 크기 (chars)',
      ctrl.rawJsonLength,
      trt.rawJsonLength,
      'tie',
      '참고 — 설계 밀도 지표',
    ),
  )
  lines.push(
    row(
      'API 소요 (ms)',
      ctrlDuration,
      trtDuration,
      'tie',
      '참고 — 프롬프트 길이 차 영향',
    ),
  )

  return lines.join('\n')
}

function buildJudgment(ctrl: Metrics, trt: Metrics): {
  verdict: 'YES' | 'NO' | 'PARTIAL'
  reasoning: string
  regressions: string[]
} {
  const wins: string[] = []
  const losses: string[] = []

  if (trt.impactCodeInEarlyTitles < ctrl.impactCodeInEarlyTitles)
    wins.push('IMPACT 코드 억제')
  else if (trt.impactCodeInEarlyTitles > ctrl.impactCodeInEarlyTitles)
    losses.push('IMPACT 코드 역행')

  if (trt.bannedWordCount < ctrl.bannedWordCount) wins.push('금지어 감소')
  else if (trt.bannedWordCount > ctrl.bannedWordCount)
    losses.push('금지어 증가')

  if (trt.marketContextHits > ctrl.marketContextHits)
    wins.push('시장 맥락 강화')
  else if (trt.marketContextHits < ctrl.marketContextHits)
    losses.push('시장 맥락 약화')

  if (trt.quantitativeTokens > ctrl.quantitativeTokens)
    wins.push('정량 표현 증가')
  else if (trt.quantitativeTokens < ctrl.quantitativeTokens)
    losses.push('정량 표현 감소')

  if (trt.actionWeekRatio >= 15) wins.push(`Action Week ≥15% (${trt.actionWeekRatio}%)`)

  const verdict: 'YES' | 'NO' | 'PARTIAL' =
    wins.length >= 3 && losses.length <= 1
      ? 'YES'
      : wins.length >= 2
      ? 'PARTIAL'
      : 'NO'

  const reasoning = `승점 ${wins.length}개 (${wins.join(' · ') || '없음'}) / 역행 ${losses.length}개 (${losses.join(' · ') || '없음'}).`

  return { verdict, reasoning, regressions: losses }
}

function buildReport(
  ctrl: RunResult,
  trt: RunResult,
  cMet: Metrics,
  tMet: Metrics,
): string {
  const now = new Date().toISOString().slice(0, 10)
  const judgment = buildJudgment(cMet, tMet)
  const table = fmtMarkdownTable(cMet, tMet, ctrl.durationMs, trt.durationMs)

  return `# 2026-04-21 Phase E 품질 실전 검증 (Smoke Test)

**작성**: ${now} · **대상**: \`scripts/smoke-test-phase-e.ts\`
**RFP**: 2026 양양군 로컬 창업 활성화 지원 사업 (B2G · 광역지자체 · 4.4억 · 40명 혼합)

## 1. 실험 설계

동일 RFP + 동일 Step 1 산출물(제안 배경·컨셉·핵심 기획 포인트·평가 전략) 을 기반으로
\`generateCurriculum()\` 을 두 번 호출:

- **Control** — \`profile\` 미전달. 레거시 IMPACT fallback 프레임.
- **Treatment** — \`profile\` 전달 (methodology.primary = "로컬브랜드"). Phase E 방법론 스위치 + 공통 설계 원칙 주입.

모델: \`claude-sonnet-4-6\` · max_tokens 16384 (truncation 방지 위해 curriculum-ai 기본 8192 에서 상향) · 각 1회 호출.

**토큰 사용량**: Control in=${ctrl.tokensIn ?? '?'} out=${ctrl.tokensOut ?? '?'} / Treatment in=${trt.tokensIn ?? '?'} out=${trt.tokensOut ?? '?'} · 합계 ${(ctrl.tokensIn ?? 0) + (ctrl.tokensOut ?? 0) + (trt.tokensIn ?? 0) + (trt.tokensOut ?? 0)} 토큰.

## 2. 자동 평가 결과

${table}

> 승자 표기: **T** = Treatment 우세 · **C** = Control 우세 · **=** = 동률/참고 지표.

## 3. 제1원칙 렌즈로 본 의미

- **방법론-대상 정합성**: IMPACT 18모듈은 창업가 대상. 양양은 상인·소상공인(비창업자)이므로 I-1/M-1 이 뜨면 평가위원에게 "과업 이해도 부족" 으로 보이고 최고배점(40%) 수행계획 섹션이 직접 감점.
- **정량적 근거 포화**: 금지어가 남아 있으면 "근거 없는 주장" 으로 읽혀 기대 효과(30%) 배점이 바닥. 공통 원칙의 Ctrl+F 5단어 룰이 여기서 작동해야 함.
- **시장 흐름 반영**: 2025~2026 서핑 관광객 62만 · 빈 점포 18개 · 강원특별자치도 자생 지표 등 실제 맥락이 커리큘럼 설계근거에 스며들어야 "왜 지금 이 사업인가" 가 뒷받침됨.
- **Before/After**: 세션별 objectives/notes 에 "현재 N → 목표 M" 이 실제로 서술되어야 평가 30% 배점을 공략 가능.
- **Action Week ≥15%**: 로컬브랜드 방법론의 핵심 실행 주간 비율 — 팝업·페스티벌·현장 실험이 전체의 최소 2회(12회 기준 ~17%) 이상 되어야 "실행력" 증빙.

## 4. 최종 판정

**Phase E 가 품질을 개선했는가?** — **${judgment.verdict}**

${judgment.reasoning}

${
  judgment.regressions.length > 0
    ? `**회귀(Regression) 포착**:\n${judgment.regressions.map((r) => `- ${r}`).join('\n')}\n`
    : '**회귀 없음** — 모든 개선 방향이 단방향으로 작동.\n'
}

## 5. 산출 파일

- \`scripts/smoke-output/control.json\` — Control (레거시 IMPACT fallback) 전체 응답
- \`scripts/smoke-output/treatment.json\` — Treatment (로컬브랜드 방법론) 전체 응답
- \`scripts/smoke-test-phase-e.ts\` — 재실행 가능한 스크립트

## 6. 한계 & 다음 단계

- N=1 샘플. 실제로는 5~10건 (공모전·매칭·재창업·글로벌진출·IMPACT 창업 등) 교차로 돌려야 방법론 스위치의 정합성이 완전히 증명됨.
- 자동 지표는 "형식적 개선" 만 포착. 내용적 설득력(예: 팝업 스토어 기획의 현실성) 은 평가위원 시뮬(D5) 로 이어서 검증 필요.
- designRationale 과 appliedDirection 의 질적 차이는 수작업 diff 로 추가 분석 권장.

---

> 자동 생성된 리포트입니다. 원본 응답은 \`scripts/smoke-output/\` 을 참조하세요.
`
}

// ─────────────────────────────────────────────────────────────────
// 8. main
// ─────────────────────────────────────────────────────────────────

async function main() {
  ensureDir(OUTPUT_DIR)
  ensureDir(JOURNEY_DIR)

  console.log('▶ Phase E Smoke Test 시작 — 양양 RFP 샘플')
  console.log('  • RFP 사업명:', RFP_PARSED.projectName)
  console.log('  • Profile methodology:', PROFILE.methodology.primary)
  console.log('')

  console.log('[1/2] Control 호출 (profile 미전달, 레거시 IMPACT fallback)...')
  const ctrl = await runOne('control', false)
  console.log(
    `  → ${ctrl.ok ? 'OK' : 'FAIL'} (${ctrl.durationMs}ms, in=${ctrl.tokensIn ?? '?'} out=${ctrl.tokensOut ?? '?'})${
      ctrl.error ? ' — ' + ctrl.error : ''
    }`,
  )

  if (!ctrl.ok) {
    writeJson(path.join(OUTPUT_DIR, 'control.json'), ctrl.raw ?? { error: ctrl.error })
    console.error('Control 호출 실패로 종료.')
    process.exit(1)
  }

  console.log('[2/2] Treatment 호출 (profile 전달, 로컬브랜드 + 공통 원칙)...')
  const trt = await runOne('treatment', true)
  console.log(
    `  → ${trt.ok ? 'OK' : 'FAIL'} (${trt.durationMs}ms, in=${trt.tokensIn ?? '?'} out=${trt.tokensOut ?? '?'})${
      trt.error ? ' — ' + trt.error : ''
    }`,
  )

  if (!trt.ok) {
    writeJson(path.join(OUTPUT_DIR, 'treatment.json'), trt.raw ?? { error: trt.error })
    console.error('Treatment 호출 실패로 종료.')
    process.exit(1)
  }

  // 저장
  writeJson(path.join(OUTPUT_DIR, 'control.json'), ctrl.raw)
  writeJson(path.join(OUTPUT_DIR, 'treatment.json'), trt.raw)
  console.log('')
  console.log('✅ 응답 저장:')
  console.log('  •', path.join(OUTPUT_DIR, 'control.json'))
  console.log('  •', path.join(OUTPUT_DIR, 'treatment.json'))

  // 메트릭 계산
  const cMet = computeMetrics('control', ctrl.raw)
  const tMet = computeMetrics('treatment', trt.raw)

  console.log('')
  console.log('📊 자동 평가 지표:')
  console.log('                         Control    Treatment')
  console.log(
    `  세션 수                ${String(cMet.sessionCount).padEnd(10)} ${tMet.sessionCount}`,
  )
  console.log(
    `  IMPACT코드(초3세션)    ${String(cMet.impactCodeInEarlyTitles).padEnd(10)} ${tMet.impactCodeInEarlyTitles}`,
  )
  console.log(
    `  금지어                 ${String(cMet.bannedWordCount).padEnd(10)} ${tMet.bannedWordCount}`,
  )
  console.log(
    `  시장맥락 키워드        ${String(cMet.marketContextHits).padEnd(10)} ${tMet.marketContextHits}`,
  )
  console.log(
    `  정량 표현              ${String(cMet.quantitativeTokens).padEnd(10)} ${tMet.quantitativeTokens}`,
  )
  console.log(
    `  Action Week 비율       ${String(cMet.actionWeekRatio + '%').padEnd(10)} ${tMet.actionWeekRatio}%`,
  )

  // 리포트 생성
  const report = buildReport(ctrl, trt, cMet, tMet)
  fs.writeFileSync(REPORT_PATH, report, 'utf-8')
  console.log('')
  console.log('📝 리포트:', REPORT_PATH)

  const judgment = buildJudgment(cMet, tMet)
  console.log('')
  console.log('🏁 최종 판정:', judgment.verdict)
  console.log('  ', judgment.reasoning)

  const totalIn = (ctrl.tokensIn ?? 0) + (trt.tokensIn ?? 0)
  const totalOut = (ctrl.tokensOut ?? 0) + (trt.tokensOut ?? 0)
  console.log(
    `\n💰 토큰 사용량 총합 — in: ${totalIn}, out: ${totalOut} (합계 ${totalIn + totalOut})`,
  )
}

main().catch((e) => {
  console.error('[smoke-test-phase-e] 치명적 오류:', e)
  process.exit(1)
})
