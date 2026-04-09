/**
 * Planning Agent — 실제 RFP PDF 3건 시뮬레이션
 *
 * Downloads 폴더의 실제 제안요청서 PDF를 직접 추출 → preprocessBidChannel
 * → 7개 질문 인터뷰 풀 사이클 → derivedStrategy 종합까지 실행하고
 * 구체 수치 + 발견된 문제점을 리포트한다.
 *
 * 백엔드: src/lib/claude.ts의 anthropic 어댑터 (실제로는 Gemini REST 호출)
 *
 * 실행: npx tsx scripts/test-real-rfp-pdfs.ts
 */

import * as fs from 'node:fs/promises'
import * as fsSync from 'node:fs'
import * as path from 'node:path'

// 인라인 .env 로더 — dotenv 의존성 회피
function loadEnvFile(envPath: string) {
  if (!fsSync.existsSync(envPath)) return
  const content = fsSync.readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    // 양쪽 따옴표 제거
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}
loadEnvFile(path.join(process.cwd(), '.env'))
import { runAgentTurn } from '../src/lib/planning-agent/agent'
import { generateVerificationChecklist } from '../src/lib/planning-agent/channel-preprocessors'
import type {
  AgentState,
  ChannelInput,
  PartialPlanningIntent,
} from '../src/lib/planning-agent/types'

// ─────────────────────────────────────────
// 시뮬레이션 대상 PDF 3건
// ─────────────────────────────────────────

const DOWNLOADS = 'C:/Users/USER/Downloads'

const PDF_TARGETS = [
  {
    label: 'AI 청년 창업가 RFP',
    file: '붙임 2. 2025년 AI 청년 창업가를 위한 AI 및 창업 교육_운영용역_제안요청서.pdf',
  },
  {
    label: '과업지시서_0609',
    file: '과업지시서_0609.pdf',
  },
  {
    label: '계원예대 세대융합창업',
    file: '계원예술대학 세대융합창업 프로그램 용역 과업지시서(안).pdf',
  },
]

// ─────────────────────────────────────────
// 가상 PM 답변 (고품질 — 언더독스 강점 반영)
// 7개 질문에 순서대로 매핑
// ─────────────────────────────────────────

const HIGH_QUALITY_ANSWERS = [
  // Q1 participationDecision: 왜 들어가야 하는가
  '평가 배점에서 코치/전문가 구성과 운영 역량 비중이 높은데, 우리는 800명 코치 풀과 분야별 전문성으로 경쟁사 대비 4배 이상 깊이가 있음. 또 RFP에 "실전 중심", "Action Week" 같은 키워드가 있으면 사실상 우리 지명. Action Week 체계화한 곳은 국내에서 우리뿐이고, IMPACT 18모듈 + 자체 진단 도구(ACT-PRENEURSHIP, 5D, DOGS)로 정량 입증 가능.',

  // Q2 clientHiddenWants: 클라이언트의 진짜 의도
  '발주기관 입장에서는 "수료율과 성과 지표를 숫자로 증명할 수 있는 운영사"를 원함. 특히 정부 사업이면 국정감사/평가 대비용으로 정량 데이터(수료율, 창업 전환율, 만족도)가 핵심. 졸업생 후속 트래킹과 임팩트 리포트를 줄 수 있는 곳을 선호. 단순 교육이 아니라 "사업 종료 후에도 성과를 증빙할 수 있는 자료 제공"이 진짜 니즈.',

  // Q3 mustNotFail: 절대 실패하면 안 되는 지점
  '1순위: 모집 미달 (인원 못 채우면 사업 자체가 무산). 2순위: 수료율 85% 이하로 떨어지면 내년 예산 삭감 + 우리 브랜드 타격. 3순위: 약속한 창업 전환율(보통 15~20%) 미달 시 평판 리스크. 모집과 수료는 회사 차원에서 마지노선.',

  // Q4 competitorWeakness: 경쟁사 약점
  '예상 경쟁사: 1) A컨설팅류 - 코치 풀 200명 수준, 우리 800명 + 분야별 전문성으로 압도. 2) 대기업 계열 교육업체 - 가격 높고 의사결정 느림, 우리는 스피드와 유연성. 3) 지역 거점 부족한 곳 - 우리는 30개 이상 지역 거점 + 알럼나이 네트워크로 확장성 강조 가능. 핵심 차별점: Action Week + 1:1 코칭 페어 운영 방식은 우리 고유 자산.',

  // Q5 riskFactors: 리스크 (외적/내적)
  '외적 리스크: 1) 경쟁사 가격 후려치기, 2) 모집 채널 한정 시 인원 미달 가능성, 3) 청년 인구 감소로 모집 풀 축소. 내적 리스크: 4) 동시 진행 사업 겹쳐서 PM 여유 부족, 5) 글로벌/특화 분야 코치 풀 부족 시 유연 대응 필요, 6) Action Week 운영 시 외부 공간 섭외 리스크.',

  // Q6 decisionMakers: 의사결정자/평가위원
  '발주기관 담당자(주무관/팀장)는 정량 데이터와 운영 안정성 선호. 평가위원은 통상 학계 2명 + 업계 2명 + 기관 내부 1명 구조. 학계 위원은 방법론과 근거 논문 인용 좋아함, 업계 위원은 실제 운영 경험과 수치 사례, 기관 위원은 정책 연속성과 행정 절차 준수 중시.',

  // Q7 pastSimilarProjects: 과거 유사 사업
  '2024년 OO대학 청년 창업 아카데미 운영 (수료율 88%, 창업 전환 8팀, 만족도 4.5). 잘된 점: Action Week 운영 + 1:1 코칭 매칭 시스템. 아쉬운 점: 지방 도시라 SNS 홍보 채널 제한적 → 이번에는 지역 인플루언서 마케팅 추가. 또 2023년 임팩트 프랜차이즈 사업으로 협력기관 모집 + 사업관리 + 결과보고 풀 사이클 운영 경험.',
]

// ─────────────────────────────────────────
// PDF 텍스트 추출 (route handler와 동일 패턴)
// ─────────────────────────────────────────

async function setupPdfjsPolyfills() {
  if (typeof (globalThis as any).DOMMatrix !== 'undefined') return
  try {
    const canvas: any = await import('@napi-rs/canvas')
    if (canvas.DOMMatrix) {
      ;(globalThis as any).DOMMatrix = canvas.DOMMatrix
    }
  } catch (err: any) {
    console.warn('[pdfjs polyfill] 실패:', err.message)
  }
}

async function extractPdfText(filePath: string): Promise<{ text: string; numPages: number }> {
  await setupPdfjsPolyfills()
  const pdfjsLib: any = await import('pdfjs-dist/legacy/build/pdf.mjs')

  const buffer = await fs.readFile(filePath)
  const uint8Array = new Uint8Array(buffer)
  const loadingTask = pdfjsLib.getDocument({
    data: uint8Array,
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: 0,
  })
  const pdf = await loadingTask.promise

  let fullText = ''
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item: any) => (typeof item.str === 'string' ? item.str : ''))
      .join(' ')
    fullText += pageText + '\n\n'
  }
  return { text: fullText.trim(), numPages: pdf.numPages }
}

// ─────────────────────────────────────────
// 시뮬레이션 결과 타입
// ─────────────────────────────────────────

interface SimulationResult {
  label: string
  pdfFile: string
  pdfPages: number
  pdfTextLength: number
  // RFP 파싱 결과
  rfpParseSuccess: boolean
  rfpParseError?: string
  parsedRfp?: {
    projectName: string
    client: string
    totalBudgetVat: number | null
    targetCount: number | null
    evalCriteriaCount: number
    objectivesCount: number
    summary: string
  }
  // 검증 체크리스트
  verificationPointsCount: number
  verificationCategories: string[]
  // 인터뷰 진행
  interviewSuccess: boolean
  interviewError?: string
  turnsCompleted: number
  filledSlots: string[]
  emptySlots: string[]
  followupTriggered: boolean
  // 최종 결과
  isComplete: boolean
  completenessFinal: number
  derivedStrategy?: {
    keyMessagesCount: number
    differentiatorsCount: number
    coachProfile: string
    sectionVBonusCount: number
    riskMitigationCount: number
    keyMessageSamples: string[]
  }
  // 시간
  durationMs: number
}

// ─────────────────────────────────────────
// 시뮬레이션 실행
// ─────────────────────────────────────────

async function runSimulation(target: typeof PDF_TARGETS[number]): Promise<SimulationResult> {
  const startTime = Date.now()
  const result: SimulationResult = {
    label: target.label,
    pdfFile: target.file,
    pdfPages: 0,
    pdfTextLength: 0,
    rfpParseSuccess: false,
    verificationPointsCount: 0,
    verificationCategories: [],
    interviewSuccess: false,
    turnsCompleted: 0,
    filledSlots: [],
    emptySlots: [],
    followupTriggered: false,
    isComplete: false,
    completenessFinal: 0,
    durationMs: 0,
  }

  try {
    // STEP 1: PDF 추출
    const filePath = path.join(DOWNLOADS, target.file)
    console.log(`\n  [1] PDF 추출: ${target.file}`)
    const { text, numPages } = await extractPdfText(filePath)
    result.pdfPages = numPages
    result.pdfTextLength = text.length
    console.log(`      → ${numPages}p, ${text.length}자`)

    if (text.length < 100) {
      throw new Error(`텍스트 너무 짧음 (${text.length}자) — 스캔 PDF일 가능성`)
    }

    // STEP 2: preprocessBidChannel → parseRfp (Claude/Gemini 호출)
    console.log(`  [2] preprocessBidChannel → parseRfp 호출 중...`)
    const channelInput: ChannelInput = {
      channel: 'bid',
      rfpText: text,
      meta: { source: 'nara_bot', sourceDetail: target.file },
    }

    let turnOutput
    try {
      turnOutput = await runAgentTurn({ channelInput })
    } catch (err: any) {
      result.rfpParseError = err.message
      throw err
    }
    result.rfpParseSuccess = true

    let state: AgentState = turnOutput.state
    const bidContext = state.intent.bidContext
    if (bidContext) {
      const rfp = bidContext.rfpFacts
      result.parsedRfp = {
        projectName: rfp.projectName,
        client: rfp.client,
        totalBudgetVat: rfp.totalBudgetVat,
        targetCount: rfp.targetCount,
        evalCriteriaCount: rfp.evalCriteria?.length ?? 0,
        objectivesCount: rfp.objectives?.length ?? 0,
        summary: rfp.summary,
      }
      console.log(`      → 사업명: "${rfp.projectName}"`)
      console.log(`      → 발주: ${rfp.client}, 인원: ${rfp.targetCount ?? '미상'}, 예산: ${rfp.totalBudgetVat ? (rfp.totalBudgetVat / 1e8).toFixed(2) + '억' : '미상'}`)
      console.log(`      → 평가배점 ${rfp.evalCriteria?.length ?? 0}개, 목표 ${rfp.objectives?.length ?? 0}개`)

      // STEP 3: 검증 체크리스트 생성
      const checklist = generateVerificationChecklist(bidContext)
      result.verificationPointsCount = checklist.length
      result.verificationCategories = [...new Set(checklist.map((c) => c.category))]
      console.log(`  [3] 확인 포인트 ${checklist.length}개 (${result.verificationCategories.join(', ')})`)
    }

    // STEP 4: 7개 질문 인터뷰 풀 사이클
    console.log(`  [4] 7개 질문 인터뷰 시작`)
    let answerIdx = 0
    let prevQuestionId: string | null = null
    const maxTurns = 12 // 안전장치

    while (
      !turnOutput.isComplete &&
      answerIdx < HIGH_QUALITY_ANSWERS.length &&
      result.turnsCompleted < maxTurns
    ) {
      const currentQuestionId = state.currentQuestion?.id ?? null
      if (prevQuestionId === currentQuestionId && prevQuestionId !== null) {
        result.followupTriggered = true
      }
      prevQuestionId = currentQuestionId

      const answer = HIGH_QUALITY_ANSWERS[answerIdx]
      try {
        turnOutput = await runAgentTurn({ state, userMessage: answer })
        state = turnOutput.state
        result.turnsCompleted++
        answerIdx++
        process.stdout.write(`      턴 ${result.turnsCompleted} ✓ `)
      } catch (err: any) {
        console.log(`\n      ❌ 턴 ${result.turnsCompleted + 1} 실패: ${err.message}`)
        result.interviewError = `Turn ${result.turnsCompleted + 1}: ${err.message}`
        break
      }
    }
    console.log('')
    result.interviewSuccess = !result.interviewError

    // STEP 5: 최종 상태 수집
    if (state) {
      result.completenessFinal = state.intent.metadata.completeness
      result.isComplete = turnOutput.isComplete

      const ctx = state.intent.strategicContext
      const allSlots = [
        'participationDecision',
        'clientHiddenWants',
        'mustNotFail',
        'competitorWeakness',
        'riskFactors',
        'decisionMakers',
        'pastSimilarProjects',
      ]
      for (const slot of allSlots) {
        const val = (ctx as any)[slot]
        const hasContent = Array.isArray(val)
          ? val.length > 0
          : typeof val === 'string' && val.trim().length >= 10
        if (hasContent) result.filledSlots.push(slot)
        else result.emptySlots.push(slot)
      }

      // derivedStrategy
      const ds = state.intent.derivedStrategy
      if (ds) {
        result.derivedStrategy = {
          keyMessagesCount: ds.keyMessages?.length ?? 0,
          differentiatorsCount: ds.differentiators?.length ?? 0,
          coachProfile: ds.coachProfile ?? '',
          sectionVBonusCount: ds.sectionVBonus?.length ?? 0,
          riskMitigationCount: ds.riskMitigation?.length ?? 0,
          keyMessageSamples: (ds.keyMessages ?? []).slice(0, 3),
        }
        console.log(`  [5] derivedStrategy 종합: 키메시지 ${ds.keyMessages?.length ?? 0}, 차별점 ${ds.differentiators?.length ?? 0}, V섹션보너스 ${ds.sectionVBonus?.length ?? 0}`)
      }
    }
  } catch (err: any) {
    console.log(`\n  ❌ 시뮬레이션 실패: ${err.message}`)
    if (!result.rfpParseError) result.rfpParseError = err.message
  }

  result.durationMs = Date.now() - startTime
  return result
}

// ─────────────────────────────────────────
// 리포트 출력
// ─────────────────────────────────────────

function printResult(r: SimulationResult, idx: number) {
  console.log('\n' + '═'.repeat(78))
  console.log(`[${idx + 1}/${PDF_TARGETS.length}] ${r.label}`)
  console.log('═'.repeat(78))
  console.log(`📄 PDF: ${r.pdfFile}`)
  console.log(`   페이지: ${r.pdfPages}p / 텍스트: ${r.pdfTextLength.toLocaleString()}자`)
  console.log(`   소요: ${(r.durationMs / 1000).toFixed(1)}초`)

  console.log(`\n[STEP 1] RFP 파싱: ${r.rfpParseSuccess ? '✅ 성공' : '❌ 실패'}`)
  if (r.rfpParseError) {
    console.log(`   에러: ${r.rfpParseError}`)
  }
  if (r.parsedRfp) {
    console.log(`   사업명:  ${r.parsedRfp.projectName}`)
    console.log(`   발주기관: ${r.parsedRfp.client}`)
    console.log(`   인원:    ${r.parsedRfp.targetCount ?? '미상'}`)
    console.log(`   예산:    ${r.parsedRfp.totalBudgetVat ? (r.parsedRfp.totalBudgetVat / 1e8).toFixed(2) + '억 (VAT포함)' : '미상'}`)
    console.log(`   평가배점: ${r.parsedRfp.evalCriteriaCount}개`)
    console.log(`   목표:    ${r.parsedRfp.objectivesCount}개`)
    console.log(`   요약:    ${r.parsedRfp.summary?.slice(0, 120) ?? ''}...`)
  }

  console.log(`\n[STEP 2] 확인 체크리스트: ${r.verificationPointsCount}개`)
  console.log(`   카테고리: ${r.verificationCategories.join(', ') || '(없음)'}`)

  console.log(`\n[STEP 3] 인터뷰: ${r.interviewSuccess ? '✅ 성공' : '⚠️ 부분 실패'}`)
  console.log(`   진행 턴: ${r.turnsCompleted}/7`)
  console.log(`   완료: ${r.isComplete}`)
  console.log(`   완전성: ${r.completenessFinal}/100`)
  console.log(`   재질문 발동: ${r.followupTriggered}`)
  console.log(`   채워진 슬롯 (${r.filledSlots.length}/7): ${r.filledSlots.join(', ') || '(없음)'}`)
  console.log(`   빈 슬롯 (${r.emptySlots.length}/7): ${r.emptySlots.join(', ') || '(없음)'}`)
  if (r.interviewError) {
    console.log(`   에러: ${r.interviewError}`)
  }

  console.log(`\n[STEP 4] derivedStrategy: ${r.derivedStrategy ? '✅' : '❌ 미생성'}`)
  if (r.derivedStrategy) {
    console.log(`   키메시지: ${r.derivedStrategy.keyMessagesCount}개`)
    console.log(`   차별점:   ${r.derivedStrategy.differentiatorsCount}개`)
    console.log(`   V섹션보너스: ${r.derivedStrategy.sectionVBonusCount}개`)
    console.log(`   리스크 완화: ${r.derivedStrategy.riskMitigationCount}개`)
    console.log(`   코치 프로필: ${r.derivedStrategy.coachProfile?.slice(0, 100) || '(없음)'}`)
    if (r.derivedStrategy.keyMessageSamples.length > 0) {
      console.log(`   키메시지 샘플:`)
      r.derivedStrategy.keyMessageSamples.forEach((m, i) => {
        console.log(`     ${i + 1}. ${m.slice(0, 100)}`)
      })
    }
  }
}

// ─────────────────────────────────────────
// main
// ─────────────────────────────────────────

async function main() {
  console.log('🧪 Planning Agent — 실제 RFP PDF 시뮬레이션')
  console.log(`백엔드: ${process.env.GEMINI_API_KEY ? 'Gemini (gemini-2.5-pro)' : '⚠️ GEMINI_API_KEY 없음'}`)
  console.log(`대상 PDF: ${PDF_TARGETS.length}건`)

  if (!process.env.GEMINI_API_KEY) {
    console.error('\n❌ GEMINI_API_KEY 환경변수가 없음. .env에 추가 필요.')
    process.exit(1)
  }

  const results: SimulationResult[] = []
  for (let i = 0; i < PDF_TARGETS.length; i++) {
    const target = PDF_TARGETS[i]
    console.log(`\n\n▶ [${i + 1}/${PDF_TARGETS.length}] ${target.label} 시작`)
    const result = await runSimulation(target)
    results.push(result)
    printResult(result, i)
  }

  // ─────────────── 종합 비교 ───────────────
  console.log('\n\n' + '═'.repeat(78))
  console.log('📊 종합 비교')
  console.log('═'.repeat(78))
  console.log(
    [
      '#'.padEnd(3),
      '라벨'.padEnd(24),
      '페이지'.padStart(6),
      'parse'.padStart(6),
      '인터뷰'.padStart(7),
      '슬롯'.padStart(6),
      '완전성'.padStart(7),
      'KM'.padStart(4),
      '소요'.padStart(7),
    ].join(' '),
  )
  console.log('-'.repeat(78))
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    console.log(
      [
        String(i + 1).padEnd(3),
        r.label.padEnd(24),
        String(r.pdfPages).padStart(6),
        (r.rfpParseSuccess ? '✅' : '❌').padStart(6),
        (r.interviewSuccess ? '✅' : '⚠️').padStart(7),
        `${r.filledSlots.length}/7`.padStart(6),
        `${r.completenessFinal}/100`.padStart(7),
        String(r.derivedStrategy?.keyMessagesCount ?? 0).padStart(4),
        `${(r.durationMs / 1000).toFixed(1)}s`.padStart(7),
      ].join(' '),
    )
  }

  // 결과 JSON 저장
  const outPath = path.join(process.cwd(), 'scripts', 'test-real-rfp-results.json')
  await fs.writeFile(outPath, JSON.stringify(results, null, 2), 'utf-8')
  console.log(`\n\n💾 상세 결과 저장: ${outPath}`)

  // 종합 판정
  const passed = results.filter((r) => r.rfpParseSuccess && r.interviewSuccess && r.isComplete).length
  console.log(`\n결과: ${passed}/${results.length} 시뮬레이션 통과`)
  process.exit(passed === results.length ? 0 : 1)
}

main().catch((err) => {
  console.error('치명 오류:', err)
  process.exit(1)
})
