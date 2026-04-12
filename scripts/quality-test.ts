/**
 * 품질 검증 — 계원예대 간이 RFP로 빠른 1건 시뮬레이션.
 * 새 DerivedStrategy 필드 생성 여부 + 품질 체크.
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

// 동적 import — env 로딩 후 실행
let runAgentTurn: any

const RFP = `계원예술대학교 세대융합창업 프로그램 운영 과업지시서.
과업예산: 6000만원(VAT포함). 기간: 2025.11~12월. 대상: 청년(만39세이하)+시니어(만50세이상).
목표: 세대융합창업 팀 발굴 및 육성, 실전형 창업교육, AI리터러시 강화, 글로벌 판매역량, 3개년 로드맵.
5~6주 프로그램. 팀빌딩→아이디어 발굴→문제정의→고객분석→솔루션설계→비즈모델→MVP→사업계획서→데모데이.
필수요건: 5천만원이상 단일사업 운영 실적, 최근2년 유사 프로그램 실적.
우대: 자체 콘텐츠, 글로벌 네트워크, 코치풀, ESG/사회적 기업 경험.
산출물: 결과보고서, 멘토링기록, 사진영상, 팀별 사업계획서+IR자료.`

const ANSWERS = [
  '50플러스재단 시니어 인턴십 사업 경험 + 창업 교육 전문성이 있어서 참여. 세대융합은 우리 강점 도메인.',
  '대학 입장에서는 행정 안정성 + 깔끔한 보고서가 핵심. 프로그램 성과보다 "사고 없이 잘 끝내기"가 진짜 니즈.',
  '시니어-청년 매칭이 핵심. 팀이 깨지면 프로그램 자체가 무너짐. 모객도 마지노선.',
  '상상우리가 경쟁사. 시니어 전문이지만 창업 교육 역량과 자체 도구가 없음.',
  '모객 (특히 청년), 팀 해체, 시니어-청년 소통 갈등',
  '대학 담당자는 행정과 보고서 중시. 교수진이 심사에 참여할 가능성.',
  '시니어 인턴십 운영 경험. 만족도 높았지만 규모 작았음. 이번에 스케일업 필요.'
]

async function main() {
  const agent = await import('../src/lib/planning-agent/agent')
  runAgentTurn = agent.runAgentTurn

  console.log('▶ 품질 테스트 시작 (계원예대 세대융합)')
  const t0 = Date.now()

  let output = await runAgentTurn({
    channelInput: { channel: 'bid', rfpText: RFP, meta: {} },
  })
  let state: AgentState = output.state
  console.log('  parseRfp ✅:', state.intent.bidContext?.rfpFacts?.projectName)

  const maxTurns = 20
  let turnCount = 0
  let answerIdx = 0
  while (!output.isComplete && turnCount < maxTurns) {
    // 준비된 답변이 없으면 기본 답변으로 대체
    const answer = answerIdx < ANSWERS.length ? ANSWERS[answerIdx] : '구체적인 건 아직 정해지지 않았지만 방향성은 맞다고 봅니다.'
    answerIdx++
    try {
      output = await runAgentTurn({ state, userMessage: answer })
      state = output.state
      turnCount++
      process.stdout.write(`턴${turnCount} `)
    } catch (err: any) {
      console.error(`\n❌ 턴${turnCount + 1} 실패:`, err.message?.slice(0, 200))
      break
    }
  }
  console.log(`\nisComplete: ${output.isComplete}`)
  console.log(`derivedStrategy null?: ${state.intent.derivedStrategy === null}`)
  console.log(`derivedStrategy keys: ${state.intent.derivedStrategy ? Object.keys(state.intent.derivedStrategy).join(', ') : 'null'}`)

  const ds = state.intent.derivedStrategy
  console.log(`\n\n▶ 결과 (${((Date.now() - t0) / 1000).toFixed(1)}초)`)
  console.log('rfpAnalysis:', ds?.rfpAnalysis ? `✅ (배점전략 ${ds.rfpAnalysis.evalCriteriaStrategy?.length ?? 0}개, 숨은요구 ${ds.rfpAnalysis.hiddenRequirements?.length ?? 0}개)` : '❌')
  console.log('positioning:', ds?.positioning ? `✅ "${ds.positioning.oneLiner?.slice(0, 100)}"` : '❌')
  console.log('curriculumDirection:', ds?.curriculumDirection ? `✅ (${ds.curriculumDirection.weeklyOutline?.length ?? 0}주, 원칙: ${ds.curriculumDirection.designPrinciple?.slice(0, 80)})` : '❌')
  console.log('evalStrategy:', ds?.evalStrategy ? `✅ (${ds.evalStrategy.pageDistribution?.length ?? 0}섹션)` : '❌')
  console.log('budgetGuideline:', ds?.budgetGuideline ? `✅ ${ds.budgetGuideline.overallApproach?.slice(0, 100)}` : '❌')
  console.log('riskMatrix:', ds?.riskMatrix ? `✅ (${ds.riskMatrix.length}건)` : '❌')
  console.log('keyMessages:', ds?.keyMessages?.length ?? 0, '개')

  // 샘플 출력
  if (ds?.positioning?.whyUnderdogs) {
    console.log('\n── 왜 언더독스인가 ──')
    console.log(ds.positioning.whyUnderdogs)
  }
  if (ds?.rfpAnalysis?.clientIntentInference) {
    console.log('\n── 발주기관 의도 추론 ──')
    console.log(ds.rfpAnalysis.clientIntentInference)
  }
  if (ds?.curriculumDirection?.weeklyOutline) {
    console.log('\n── 주차별 커리큘럼 ──')
    ds.curriculumDirection.weeklyOutline.forEach(w => {
      console.log(`  [${w.week}] ${w.focus} — ${w.keyActivity}`)
    })
  }

  fs.writeFileSync('scripts/quality-test-result.json', JSON.stringify(state.intent, null, 2))
  console.log('\n💾 scripts/quality-test-result.json')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
