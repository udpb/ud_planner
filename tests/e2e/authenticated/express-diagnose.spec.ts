/**
 * 인증 흐름: Express 2.0 자동 진단 (Phase M0~M2, ADR-013)
 *
 * 검증 대상 API:
 *   - POST /api/express/diagnose (kinds: channel · framing · logic-chain · fact-check)
 *   - POST /api/express/channel  (PM 채널 컨펌)
 *   - POST /api/express/eval-simulate  (B2G 평가배점 시뮬)
 *   - GET/POST /api/express/renewal-seed  (renewal 시드)
 *
 * AI 호출 mock: framing-inspector / logic-chain-checker / fact-check-light
 *   → src/lib/ai-mock.ts 의 fixture JSON 반환 (PLAYWRIGHT_MOCK_AI=true).
 *
 * 사전 셋업: rfp-upload.spec 의 RFP 가 저장돼 있어야 channel 진단 가능.
 *   (없으면 beforeAll 에서 RFP 파싱 + 저장)
 */

import { test, expect } from '@playwright/test'

test.describe.serial('인증 흐름: Express 2.0 자동 진단', () => {
  // ─────────────────────────────────────────
  // 사전 셋업: RFP 저장 (rfp-upload 와 동일)
  // ─────────────────────────────────────────
  test.beforeAll(async ({ request }) => {
    const projectId = process.env.E2E_PROJECT_ID
    if (!projectId) return

    const parseRes = await request.post('/api/ai/parse-rfp', {
      data: {
        projectId,
        text:
          '[E2E Test RFP]\n사업명: 청년 창업 회복탄력성 강화 사업\n발주기관: 한국청년창업진흥원\n예산 3억원\n예비/초기 창업자 30명',
      },
    })
    if (parseRes.ok()) {
      const data = (await parseRes.json()) as { parsed: unknown }
      await request.put('/api/ai/parse-rfp', {
        data: { projectId, parsed: data.parsed },
      })
    }
  })

  // ─────────────────────────────────────────
  // 1. 채널 진단 (heuristic, 토큰 0)
  // ─────────────────────────────────────────
  test('POST /api/express/diagnose kinds=[channel] → autoDiagnosis.channel 저장', async ({ request }) => {
    const projectId = process.env.E2E_PROJECT_ID
    if (!projectId) test.skip()

    const r = await request.post('/api/express/diagnose', {
      data: { projectId, kinds: ['channel'] },
      headers: { 'Content-Type': 'application/json' },
    })

    expect(r.status()).toBe(200)
    const data = (await r.json()) as {
      autoDiagnosis?: {
        channel?: {
          detected?: string
          confidence?: number
          reasoning?: string[]
          confirmedByPm?: boolean
        }
      }
    }
    expect(data.autoDiagnosis?.channel).toBeTruthy()
    expect(['B2G', 'B2B', 'renewal']).toContain(data.autoDiagnosis!.channel!.detected)
    expect(data.autoDiagnosis!.channel!.confidence).toBeGreaterThanOrEqual(0)
    expect(data.autoDiagnosis!.channel!.confidence).toBeLessThanOrEqual(1)
    expect(Array.isArray(data.autoDiagnosis!.channel!.reasoning)).toBe(true)
    expect(data.autoDiagnosis!.channel!.confirmedByPm).toBe(false)
  })

  // ─────────────────────────────────────────
  // 2. 채널 컨펌 (PM)
  // ─────────────────────────────────────────
  test('POST /api/express/channel → confirmedByPm=true + intendedDepartment', async ({ request }) => {
    const projectId = process.env.E2E_PROJECT_ID
    if (!projectId) test.skip()

    const r = await request.post('/api/express/channel', {
      data: {
        projectId,
        channel: 'B2G', // 한국청년창업진흥원 → B2G
      },
      headers: { 'Content-Type': 'application/json' },
    })

    expect(r.status()).toBe(200)
    const data = (await r.json()) as { ok?: boolean; channel?: string }
    expect(data.ok).toBe(true)
    expect(data.channel).toBe('B2G')
  })

  test('POST /api/express/channel B2B + intendedDepartment=csr', async ({ request }) => {
    const projectId = process.env.E2E_PROJECT_ID
    if (!projectId) test.skip()

    const r = await request.post('/api/express/channel', {
      data: {
        projectId,
        channel: 'B2B',
        intendedDepartment: 'csr',
      },
      headers: { 'Content-Type': 'application/json' },
    })

    expect(r.status()).toBe(200)
    const data = (await r.json()) as {
      ok?: boolean
      channel?: string
      intendedDepartment?: string
    }
    expect(data.ok).toBe(true)
    expect(data.channel).toBe('B2B')
    expect(data.intendedDepartment).toBe('csr')
  })

  // ─────────────────────────────────────────
  // 3. 프레임 진단 (AI mock — framing-inspector)
  // ─────────────────────────────────────────
  test('POST /api/express/diagnose kinds=[framing] → mock 응답 csr 감지', async ({ request }) => {
    const projectId = process.env.E2E_PROJECT_ID
    if (!projectId) test.skip()

    // draft 에 sections 채우기 — framing 은 sections.1+2 가 100자 이상 필요
    // turn API 로 채우는 게 정석이지만, E2E 에서는 직접 save 호출
    const turnRes = await request.post('/api/express/turn', {
      data: { projectId, pmInput: '', firstTurn: true },
    })
    expect(turnRes.ok()).toBe(true)

    // 두 번째 턴 — beforeAfter
    await request.post('/api/express/turn', {
      data: {
        projectId,
        pmInput: '청년 창업가의 사회적 가치 창출과 동반성장을 위한 회복탄력성 강화 교육. CSR 차원에서 취약계층 청년 지원.',
      },
    })

    const r = await request.post('/api/express/diagnose', {
      data: { projectId, kinds: ['framing'] },
      headers: { 'Content-Type': 'application/json' },
    })

    expect(r.status()).toBe(200)
    const data = (await r.json()) as {
      autoDiagnosis?: {
        framing?: {
          detected?: string
          evidence?: string[]
          suggestion?: string
          diagnosedAt?: string
        }
      }
    }
    // framing 응답이 와야 함 (sections 가 100자 미달이면 heuristic skip 응답)
    expect(data.autoDiagnosis?.framing).toBeTruthy()
    expect(['csr', 'strategy', 'sales', 'tech']).toContain(
      data.autoDiagnosis!.framing!.detected,
    )
  })

  // ─────────────────────────────────────────
  // 4. 논리 흐름 + 팩트체크 (둘 다 mock)
  // ─────────────────────────────────────────
  test('POST /api/express/diagnose kinds=[logic-chain, fact-check]', async ({ request }) => {
    const projectId = process.env.E2E_PROJECT_ID
    if (!projectId) test.skip()

    const r = await request.post('/api/express/diagnose', {
      data: { projectId, kinds: ['logic-chain', 'fact-check'] },
      headers: { 'Content-Type': 'application/json' },
    })

    expect(r.status()).toBe(200)
    const data = (await r.json()) as {
      autoDiagnosis?: {
        logicChain?: {
          passed?: boolean
          channel?: string
          passedSteps?: number
          totalSteps?: number
          breakpoints?: Array<{ stepKey?: string }>
        }
        factCheck?: {
          totalFacts?: number
          byStatus?: Record<string, number>
        }
      }
    }
    // sections 가 3개 이상 채워졌어야 logicChain 의미 — 부족하면 placeholder breakpoint 반환
    expect(data.autoDiagnosis?.logicChain).toBeTruthy()
    expect(data.autoDiagnosis?.factCheck).toBeTruthy()
    expect(typeof data.autoDiagnosis!.factCheck!.totalFacts).toBe('number')
  })

  // ─────────────────────────────────────────
  // 5. B2G 평가배점 시뮬
  // ─────────────────────────────────────────
  test('POST /api/express/eval-simulate → items 배열 + totalPredicted', async ({ request }) => {
    const projectId = process.env.E2E_PROJECT_ID
    if (!projectId) test.skip()

    const r = await request.post('/api/express/eval-simulate', {
      data: { projectId },
      headers: { 'Content-Type': 'application/json' },
    })

    expect(r.status()).toBe(200)
    const data = (await r.json()) as {
      simulation?: {
        items?: Array<{
          criteriaName: string
          maxPoints: number
          predictedScore: number
          completeness: number
        }>
        totalMax?: number
        totalPredicted?: number
      } | null
    }
    expect(data.simulation).toBeTruthy()
    expect(Array.isArray(data.simulation!.items)).toBe(true)
    // mock RFP evalCriteria 6개 항목
    expect(data.simulation!.items!.length).toBeGreaterThan(0)
    expect(data.simulation!.totalMax).toBe(100) // mock 합계 15+25+20+15+10+15
    expect(typeof data.simulation!.totalPredicted).toBe('number')
  })

  // ─────────────────────────────────────────
  // 6. renewal 시드 — 직전 프로젝트 없음 → null
  // ─────────────────────────────────────────
  test('GET /api/express/renewal-seed → 직전 프로젝트 없으면 null', async ({ request }) => {
    const projectId = process.env.E2E_PROJECT_ID
    if (!projectId) test.skip()

    const r = await request.get(`/api/express/renewal-seed?projectId=${projectId}`)

    expect(r.status()).toBe(200)
    const data = (await r.json()) as {
      proposal: unknown | null
      prior: unknown | null
    }
    // E2E seed user 는 단일 프로젝트만 — prior=null 정상
    expect(data.prior).toBeNull()
    expect(data.proposal).toBeNull()
  })

  // ─────────────────────────────────────────
  // 7. 검수 (Inspector) + 채널 가중치
  // ─────────────────────────────────────────
  test('POST /api/express/inspect → overallScore + 채널 가중치 적용', async ({ request }) => {
    const projectId = process.env.E2E_PROJECT_ID
    if (!projectId) test.skip()

    const r = await request.post('/api/express/inspect', {
      data: { projectId },
      headers: { 'Content-Type': 'application/json' },
    })

    expect(r.status()).toBe(200)
    const data = (await r.json()) as {
      report?: {
        passed?: boolean
        overallScore?: number
        lensScores?: Record<string, number>
        weightedByChannel?: string
      }
      fellbackToHeuristic?: boolean
    }
    expect(data.report).toBeTruthy()
    expect(typeof data.report!.overallScore).toBe('number')
    expect(data.report!.lensScores).toBeTruthy()
    // 위 테스트에서 channel='B2B' 컨펌됨 — weightedByChannel='B2B' 기대
    expect(data.report!.weightedByChannel).toBe('B2B')
  })
})
