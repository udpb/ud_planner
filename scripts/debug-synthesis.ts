/**
 * synthesis 실패 디버그 — 격리된 synthesizeStrategy 호출.
 * 프롬프트 크기, 응답 형태, 에러 원인을 확인.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

// .env
const envPath = path.join(process.cwd(), '.env')
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

// 동적 import — env 로딩 후 실행되도록
let buildSynthesisPrompt: any
let anthropic: any
let CLAUDE_MODEL: string

// 실제 테스트 결과에서 가져온 intent (간소화)
const mockIntent: PartialPlanningIntent = {
  channel: { type: 'bid', source: 'nara_bot', discoveredAt: new Date().toISOString() },
  bidContext: {
    rfpFacts: {
      projectName: '계원예술대학교 세대융합창업 프로그램',
      client: '계원예술대학교',
      totalBudgetVat: 60000000,
      supplyPrice: null,
      projectStartDate: null,
      projectEndDate: '2025-12-31',
      eduStartDate: '2025-11-01',
      eduEndDate: '2025-12-31',
      targetAudience: '청년(만39세이하)+시니어(만50세이상)',
      targetCount: null,
      targetStage: ['예비창업'],
      objectives: ['세대융합창업 팀 발굴 및 육성', '실전형 창업교육', 'AI 리터러시 강화'],
      deliverables: ['결과보고서', '팀별 사업계획서'],
      evalCriteria: [],
      constraints: [{ type: '기타', description: '추가 예산 발생 시 과업수행자 부담' }],
      requiredPersonnel: [{ role: 'PM', qualification: '창업 교육 경험', count: null }],
      keywords: ['세대융합', 'AI리터러시', '데모데이'],
      projectType: 'B2G' as const,
      region: '경기도',
      summary: '5-6주간 세대융합 창업 교육 프로그램. 예산 6천만원.',
    },
    rfpRawText: '(생략)',
    verificationChecklist: [],
    phoneCallCompleted: false,
  },
  strategicContext: {
    participationDecision: '50플러스재단 경험 + 창업교육 전문성으로 참여.',
    clientHiddenWants: '행정 안정성 + 보고서 품질이 핵심 니즈.',
    mustNotFail: '팀 해체 방지, 모객 확보가 마지노선.',
    competitorWeakness: '상상우리가 경쟁사. 시니어 전문이지만 창업 교육 약함.',
    riskFactors: ['모객 어려움', '팀 해체', '시니어-청년 소통 갈등'],
    decisionMakers: '대학 담당자 + 교수진 심사 가능',
    pastSimilarProjects: '시니어 인턴십 운영 경험. 만족도 높았지만 규모 작았음.',
  },
  derivedStrategy: null,
  metadata: {
    completeness: 100,
    confidence: 'high' as const,
    turnsCompleted: 7,
    unfilledSlots: [],
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isComplete: true,
  },
}

const mockHistory: Message[] = [
  { id: '1', role: 'user', content: '50플러스재단 경험 있어서 참여', timestamp: '' },
  { id: '2', role: 'user', content: '행정 안정성이 핵심', timestamp: '' },
  { id: '3', role: 'user', content: '팀 깨지면 안됨', timestamp: '' },
]

async function main() {
  // 동적 import (env 로딩 후)
  const prompts = await import('../src/lib/planning-agent/prompts')
  buildSynthesisPrompt = prompts.buildSynthesisPrompt
  const claude = await import('../src/lib/claude')
  anthropic = claude.anthropic
  CLAUDE_MODEL = claude.CLAUDE_MODEL

  console.log('🔍 synthesis 디버그\n')
  console.log(`모델: ${CLAUDE_MODEL}`)
  console.log(`ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? '설정됨' : '❌'}`)

  // 1. 프롬프트 크기 확인
  const prompt = buildSynthesisPrompt(mockIntent, mockHistory)
  console.log(`\n프롬프트 길이: ${prompt.length}자 (${Math.round(prompt.length / 4)} 토큰 추정)`)
  console.log(`프롬프트 앞 200자:\n${prompt.slice(0, 200)}...\n`)

  // 2. 실제 호출
  console.log('Claude 호출 중...')
  const t0 = Date.now()
  try {
    const msg = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 16384,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = (msg.content[0] as any).text
    console.log(`\n✅ 응답 (${((Date.now() - t0) / 1000).toFixed(1)}초)`)
    console.log(`응답 길이: ${raw.length}자`)
    console.log(`stop_reason: ${(msg as any).stop_reason}`)
    console.log(`\n응답 앞 500자:\n${raw.slice(0, 500)}`)
    console.log(`\n응답 뒤 500자:\n${raw.slice(-500)}`)

    // 3. JSON 파싱 시도
    let s = raw.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim()
    const start = s.indexOf('{')
    const end = s.lastIndexOf('}')
    if (start === -1 || end === -1) {
      console.log('\n❌ JSON 찾기 실패 — 응답이 JSON이 아님')
    } else {
      s = s.slice(start, end + 1)
      try {
        const parsed = JSON.parse(s)
        console.log('\n✅ JSON 파싱 성공')
        console.log(`keyMessages: ${parsed.keyMessages?.length ?? 0}개`)
        console.log(`rfpAnalysis: ${parsed.rfpAnalysis ? '있음' : '없음'}`)
        console.log(`positioning: ${parsed.positioning ? '있음' : '없음'}`)
        console.log(`curriculumDirection: ${parsed.curriculumDirection ? '있음' : '없음'}`)
      } catch (e: any) {
        console.log(`\n❌ JSON 파싱 실패: ${e.message}`)
        console.log(`파싱 시도한 텍스트 앞 300자: ${s.slice(0, 300)}`)
      }
    }
  } catch (e: any) {
    console.log(`\n❌ API 에러 (${((Date.now() - t0) / 1000).toFixed(1)}초):`)
    console.log(`status: ${e.status}`)
    console.log(`message: ${e.message?.slice(0, 500)}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
