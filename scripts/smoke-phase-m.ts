/**
 * Phase M0-M2 pure-function smoke test
 *
 * 실행: npx tsx scripts/smoke-phase-m.ts
 *
 * DB 의존 없음. 순수 함수만 fixture 입력으로 실행 + 핵심 invariant 검증.
 * 발견된 버그는 즉시 throw — 끝까지 통과하면 ✓
 */

import { detectChannel } from '../src/lib/express/channel-detector'
import { simulateEvalScore } from '../src/lib/express/eval-simulator'
import { applyRenewalSeed } from '../src/lib/express/renewal-seed'
import { applyChannelWeights, CHANNEL_LENS_WEIGHTS } from '../src/lib/express/inspector'
import { checkFacts } from '../src/lib/express/fact-check-light'
import { checkLogicChain } from '../src/lib/express/logic-chain-checker'
import type { ExpressDraft } from '../src/lib/express/schema'
import type { RfpParsed } from '../src/lib/ai/parse-rfp'
import type { InspectorReport } from '../src/lib/express/inspector'

let testCount = 0
let failCount = 0
const fails: string[] = []

function test(name: string, fn: () => void | Promise<void>) {
  testCount += 1
  return Promise.resolve()
    .then(() => fn())
    .then(() => console.log(`  ✓ ${name}`))
    .catch((err) => {
      failCount += 1
      fails.push(`${name}: ${err.message}`)
      console.error(`  ✗ ${name}`)
      console.error(`     → ${err.message}`)
    })
}

function expect<T>(actual: T) {
  return {
    toBe(expected: T) {
      if (actual !== expected) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    },
    toBeTruthy() {
      if (!actual) throw new Error(`expected truthy, got ${JSON.stringify(actual)}`)
    },
    toBeFalsy() {
      if (actual) throw new Error(`expected falsy, got ${JSON.stringify(actual)}`)
    },
    toEqual(expected: unknown) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
      }
    },
    toBeGreaterThan(n: number) {
      if (typeof actual !== 'number' || actual <= n) {
        throw new Error(`expected > ${n}, got ${actual}`)
      }
    },
    toBeGreaterThanOrEqual(n: number) {
      if (typeof actual !== 'number' || actual < n) {
        throw new Error(`expected >= ${n}, got ${actual}`)
      }
    },
    toBeLessThanOrEqual(n: number) {
      if (typeof actual !== 'number' || actual > n) {
        throw new Error(`expected <= ${n}, got ${actual}`)
      }
    },
    toContain(item: unknown) {
      if (Array.isArray(actual)) {
        if (!actual.includes(item)) throw new Error(`expected array to contain ${JSON.stringify(item)}`)
      } else if (typeof actual === 'string') {
        if (!actual.includes(item as string)) throw new Error(`expected string to contain ${JSON.stringify(item)}`)
      } else {
        throw new Error('toContain only works on array/string')
      }
    },
  }
}

async function main() {
  console.log('━━━ Phase M Pure-Function Smoke ━━━\n')

  // ──────────────────────────────────────────────────────
  // 1. ChannelDetector (heuristic, 토큰 0)
  // ──────────────────────────────────────────────────────
  console.log('[1] ChannelDetector')

  await test('B2G — 정부 키워드 + 평가배점 5개', () => {
    const rfp: Partial<RfpParsed> = {
      client: '한국청년창업진흥원',
      projectType: 'B2G',
      evalCriteria: [
        { item: '제안 배경', score: 15 },
        { item: '추진 전략', score: 25 },
        { item: '교육 커리큘럼', score: 20 },
        { item: '운영 체계', score: 15 },
        { item: '예산 계획', score: 10 },
      ],
    }
    const r = detectChannel(rfp as RfpParsed, [])
    expect(r.detected).toBe('B2G')
    expect(r.confidence).toBeGreaterThanOrEqual(0.8)
  })

  await test('B2B — 기업 키워드 + 평가배점 없음', () => {
    const rfp: Partial<RfpParsed> = {
      client: '신한카드 주식회사',
      projectType: 'B2B',
      evalCriteria: [],
    }
    const r = detectChannel(rfp as RfpParsed, [])
    expect(r.detected).toBe('B2B')
    expect(r.confidence).toBeGreaterThanOrEqual(0.7)
  })

  await test('renewal — prior project COMPLETED 있음', () => {
    const rfp: Partial<RfpParsed> = {
      client: '신한카드 주식회사',
      projectType: 'B2B',
    }
    const r = detectChannel(rfp as RfpParsed, [
      { client: '신한카드 주식회사', status: 'COMPLETED' },
    ])
    expect(r.detected).toBe('renewal')
    expect(r.confidence).toBeGreaterThanOrEqual(0.9)
  })

  await test('빈 발주처명 — B2B default + 약한 신호', () => {
    const rfp: Partial<RfpParsed> = { client: '', evalCriteria: [] }
    const r = detectChannel(rfp as RfpParsed, [])
    expect(r.detected).toBe('B2B')
  })

  // ──────────────────────────────────────────────────────
  // 2. EvalSimulator
  // ──────────────────────────────────────────────────────
  console.log('\n[2] EvalSimulator')

  const draftFull: ExpressDraft = {
    intent: '청년 창업가의 회복탄력성 강화',
    sections: {
      '1': 'A'.repeat(500),
      '2': 'B'.repeat(500),
      '3': 'C'.repeat(500),
      '4': 'D'.repeat(500),
      '5': 'E'.repeat(500),
      '6': 'F'.repeat(500),
      '7': 'G'.repeat(500),
    },
    meta: {
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      isCompleted: false,
      activeSlots: [],
      skippedSlots: [],
    },
  }
  const draftEmpty: ExpressDraft = {
    sections: {},
    meta: {
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      isCompleted: false,
      activeSlots: [],
      skippedSlots: [],
    },
  }

  await test('evalCriteria 없음 → items=[] + 메시지', () => {
    const r = simulateEvalScore(draftFull, null)
    expect(r.items.length).toBe(0)
    expect(r.totalMax).toBe(0)
    expect(r.guidance.length).toBeGreaterThanOrEqual(1)
  })

  await test('evalCriteria 있고 sections 다 채움 → 만점 근사', () => {
    const r = simulateEvalScore(draftFull, [
      { item: '제안 배경', score: 15 },
      { item: '추진 전략', score: 25 },
      { item: '교육 커리큘럼', score: 20 },
    ])
    expect(r.totalMax).toBe(60)
    // sections 500자면 0.85 completeness → 51점 근처
    expect(r.totalPredicted).toBeGreaterThan(45)
  })

  await test('sections 빈 draft → 0점 + worstItems', () => {
    const r = simulateEvalScore(draftEmpty, [
      { item: '제안 배경', score: 15 },
      { item: '교육 커리큘럼', score: 20 },
    ])
    expect(r.totalPredicted).toBe(0)
    expect(r.worstItems.length).toBeGreaterThanOrEqual(1)
  })

  // ──────────────────────────────────────────────────────
  // 3. ChannelWeights (Inspector)
  // ──────────────────────────────────────────────────────
  console.log('\n[3] Inspector ChannelWeights')

  await test('가중치 정확히 7 lens 매핑', () => {
    const lenses = ['market', 'statistics', 'problem', 'before-after', 'key-messages', 'differentiators', 'tone']
    for (const ch of ['B2G', 'B2B', 'renewal'] as const) {
      for (const l of lenses) {
        const w = CHANNEL_LENS_WEIGHTS[ch][l as keyof (typeof CHANNEL_LENS_WEIGHTS)['B2G']]
        if (typeof w !== 'number') throw new Error(`missing weight ${ch}.${l}`)
      }
    }
  })

  await test('applyChannelWeights B2G — 통계 가중 높음', () => {
    const baseReport: InspectorReport = {
      passed: true,
      overallScore: 70,
      lensScores: {
        market: 80,
        statistics: 100, // B2G 1.3
        problem: 60,
        'before-after': 60,
        'key-messages': 60,
        differentiators: 60,
        tone: 60,
      },
      issues: [],
      strengths: [],
      nextAction: '',
    }
    const r = applyChannelWeights(baseReport, 'B2G')
    // B2G 가중치 적용 시 statistics 100 점에 1.3 곱 → overall 끌어올림
    expect(r.overallScore).toBeGreaterThan(70)
    expect(r.weightedByChannel).toBe('B2G')
  })

  await test('applyChannelWeights B2B — differentiators 가중 높음', () => {
    const baseReport: InspectorReport = {
      passed: true,
      overallScore: 70,
      lensScores: {
        market: 60,
        statistics: 60,
        problem: 60,
        'before-after': 60,
        'key-messages': 60,
        differentiators: 100, // B2B 1.3
        tone: 60,
      },
      issues: [],
      strengths: [],
      nextAction: '',
    }
    const r = applyChannelWeights(baseReport, 'B2B')
    expect(r.overallScore).toBeGreaterThan(65)
    expect(r.weightedByChannel).toBe('B2B')
  })

  // ──────────────────────────────────────────────────────
  // 4. FactCheckLight (regex only — AI mock 안 함)
  // ──────────────────────────────────────────────────────
  console.log('\n[4] FactCheckLight (regex)')

  await test('빈 draft → 0 facts', async () => {
    const r = await checkFacts(draftEmpty, { aiVerify: false })
    expect(r.totalFacts).toBe(0)
    expect(r.mode).toBe('regex')
  })

  await test('수치·정책 다수 → 추출 + 분류', async () => {
    const draft: ExpressDraft = {
      ...draftEmpty,
      intent: '청년 창업 회복탄력성 강화',
      sections: {
        '1': '예비창업 청년의 70% 가 6개월 내 사업 중단 (창업진흥원 2025 발표). 국정과제 23번 청년 정책 연계.',
        '6': '수료자 30명, 사업 지속률 80%, SROI 5억원 예상.',
        '7': 'UD 누적 600억 수주, 25,000명 동문풀.',
      },
    }
    const r = await checkFacts(draft, { aiVerify: false })
    expect(r.totalFacts).toBeGreaterThan(0)
    // quant-stat (70%, 80%, 30명 등) 다수
    expect(r.byCategory['quant-stat']).toBeGreaterThan(0)
    // policy-cite (국정과제)
    expect(r.byCategory['policy-cite']).toBeGreaterThanOrEqual(1)
    // external-cite (창업진흥원 발표)
    expect(r.byCategory['external-cite']).toBeGreaterThanOrEqual(1)
    // own-record (UD 누적 600억)
    expect(r.byCategory['own-record']).toBeGreaterThanOrEqual(1)
  })

  await test('무한루프 방어 — 같은 매치 dedup', async () => {
    const draft: ExpressDraft = {
      ...draftEmpty,
      sections: {
        '1': '70%. 70%. 70%. 70%. 70%.', // 같은 매치 5번
      },
    }
    const r = await checkFacts(draft, { aiVerify: false })
    // 한 source 안에서 같은 match 는 dedup — 1건만
    const sevens = r.facts.filter((f) => f.match === '70%')
    expect(sevens.length).toBe(1)
  })

  // ──────────────────────────────────────────────────────
  // 5. LogicChainChecker heuristic
  // ──────────────────────────────────────────────────────
  console.log('\n[5] LogicChainChecker (heuristic)')

  await test('sections 미달 → __notenough__ placeholder', async () => {
    const r = await checkLogicChain({ draft: draftEmpty, channel: 'B2G' })
    expect(r.passed).toBe(true)
    expect(r.breakpoints.length).toBe(1)
    expect(r.breakpoints[0].stepKey).toBe('__notenough__')
  })

  // Note: AI 호출 경로는 mock 환경 없으면 실패 → heuristic 만 검증
  // sections 3개 채우면 AI 시도하므로 PLAYWRIGHT_MOCK_AI 가 없으면 fallback heuristic
  await test('B2G sections 3개+ 키워드 다양 → heuristic 통과', async () => {
    process.env.PLAYWRIGHT_MOCK_AI = 'true' // mock 강제
    const draft: ExpressDraft = {
      ...draftEmpty,
      sections: {
        '1': '국정과제 23번 청년 정책. 청년 창업가 6개월 내 70% 가 사업 중단하는 과제.',
        '2': '평가배점 항목별 IMPACT 18 모듈 솔루션 대응. 운영 전략 차별화.',
        '3': '커리큘럼 12회차 + Action Week.',
        '6': '성과 지표 SROI 5억, 수료율 95% KPI.',
      },
    }
    const r = await checkLogicChain({ draft, channel: 'B2G' })
    // mock 또는 heuristic 어느 경로든 정상 응답
    expect(['ai', 'heuristic']).toContain(r.mode)
    expect(r.totalSteps).toBeGreaterThanOrEqual(5)
    delete process.env.PLAYWRIGHT_MOCK_AI
  })

  // ──────────────────────────────────────────────────────
  // 6. RenewalSeed.applyRenewalSeed (pure)
  // ──────────────────────────────────────────────────────
  console.log('\n[6] RenewalSeed apply')

  await test('빈 draft 에 모든 필드 시드', () => {
    const r = applyRenewalSeed(draftEmpty, {
      intent: '[테스트 연속] 청년 창업',
      beforeAfter: { before: 'Before...', after: 'After...' },
      keyMessages: ['연속', '강화', '확장'],
      sections: { '1': '제안 배경 시드 본문...' },
    })
    expect(r.intent).toBe('[테스트 연속] 청년 창업')
    expect(r.beforeAfter?.before).toBe('Before...')
    expect(r.keyMessages?.length).toBe(3)
    expect(r.sections?.['1']).toContain('시드 본문')
  })

  await test('이미 작성된 필드 보존 — 시드 무시', () => {
    const partial: ExpressDraft = {
      ...draftEmpty,
      intent: '기존 의도',
      sections: { '1': '기존 섹션 1 본문' },
    }
    const r = applyRenewalSeed(partial, {
      intent: '시드 의도 (무시되어야)',
      sections: { '1': '시드 섹션 1 (무시되어야)' },
    })
    expect(r.intent).toBe('기존 의도') // 보존
    expect(r.sections?.['1']).toBe('기존 섹션 1 본문') // 보존
  })

  // ──────────────────────────────────────────────────────
  // 결과
  // ──────────────────────────────────────────────────────
  console.log(`\n━━━ 결과 ━━━`)
  console.log(`총 ${testCount}건 / 통과 ${testCount - failCount} / 실패 ${failCount}`)
  if (failCount > 0) {
    console.log('\n실패 목록:')
    for (const f of fails) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(2)
})
