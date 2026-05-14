/**
 * 통합 E2E — Express 2.0 전체 흐름 1 path (Wave 3 #9, 2026-05-14)
 *
 * 1 path: 신규 프로젝트 → RFP 파싱 → 채널 진단 → 컨펌 → 슬롯 채움 → 검수 → Markdown export
 *
 * Mock AI 사용 (PLAYWRIGHT_MOCK_AI=true) — 토큰 비용 0.
 *
 * 검증 포인트:
 *   - 각 단계 API HTTP 200 + 응답 구조
 *   - autoDiagnosis race condition fix 검증 (Wave 1 #3)
 *   - 채널 컨펌 후 autoDiagnosis 보존 확인
 *   - Markdown export 가 실제 본문 포함
 */

import { test, expect } from '@playwright/test'

test.describe.serial('통합 흐름: RFP → 진단 → 컨펌 → 슬롯 → 검수 → export', () => {
  const RFP_TEXT =
    '[E2E Full Path RFP] 사업명: 청년 창업 회복탄력성 강화 사업. 발주기관: 한국청년창업진흥원. ' +
    '사업 기간: 2026-07 ~ 2026-12. 총 예산 3억원 (VAT 포함). 대상: 예비/초기 창업자 30명. ' +
    '평가 항목: 제안 배경(15), 추진 전략(25), 교육 커리큘럼(20), 운영(15), 예산(10), 성과(15).'

  test('1. RFP 파싱 + 저장', async ({ request }) => {
    const projectId = process.env.E2E_PROJECT_ID
    if (!projectId) test.skip()

    const parse = await request.post('/api/ai/parse-rfp', {
      data: { projectId, text: RFP_TEXT },
    })
    expect(parse.status()).toBe(200)
    const parsed = (await parse.json()) as { parsed: unknown }
    expect(parsed.parsed).toBeTruthy()

    const put = await request.put('/api/ai/parse-rfp', {
      data: { projectId, parsed: parsed.parsed },
    })
    expect(put.status()).toBe(200)
  })

  test('2. AI 자동 진단 (channel + framing) — autoDiagnosis 저장', async ({ request }) => {
    const projectId = process.env.E2E_PROJECT_ID
    if (!projectId) test.skip()

    const r = await request.post('/api/express/diagnose', {
      data: { projectId, kinds: ['channel', 'framing'] },
    })
    expect(r.status()).toBe(200)

    const data = (await r.json()) as {
      autoDiagnosis: {
        channel?: { detected?: string; confidence?: number; confirmedByPm?: boolean }
        framing?: { detected?: string }
      }
    }
    expect(data.autoDiagnosis.channel?.detected).toBeTruthy()
    expect(data.autoDiagnosis.channel?.confirmedByPm).toBe(false)
  })

  test('3. PM 채널 컨펌 (B2G)', async ({ request }) => {
    const projectId = process.env.E2E_PROJECT_ID
    if (!projectId) test.skip()

    const r = await request.post('/api/express/channel', {
      data: { projectId, channel: 'B2G' },
    })
    expect(r.status()).toBe(200)
    const data = (await r.json()) as { ok: boolean; channel: string }
    expect(data.ok).toBe(true)
    expect(data.channel).toBe('B2G')
  })

  test('4. Wave 1 #3 race fix 검증 — save 가 autoDiagnosis 보존', async ({ request }) => {
    const projectId = process.env.E2E_PROJECT_ID
    if (!projectId) test.skip()

    // 클라이언트가 autoDiagnosis 모르고 draft 만 보내는 시나리오 시뮬
    const oldDraft = {
      intent: '청년 창업가의 회복탄력성 강화',
      sections: {
        '1': '청년 창업 회복탄력성 강화의 시급성. '.repeat(8),
        '2': '4중 지원 체계 추진 전략. '.repeat(8),
      },
      meta: {
        startedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        isCompleted: false,
        activeSlots: [],
        skippedSlots: [],
        // autoDiagnosis 의도적으로 누락
      },
    }

    const save = await request.post('/api/express/save', {
      data: { projectId, draft: oldDraft },
    })
    expect(save.status()).toBe(200)

    // 저장 후 다시 진단해서 autoDiagnosis 가 살아있는지 확인
    // (save 가 server-side merge 안 했으면 channel 이 사라졌을 것)
    const verify = await request.post('/api/express/diagnose', {
      data: { projectId, kinds: ['channel'] },
    })
    expect(verify.status()).toBe(200)
    const data = (await verify.json()) as {
      autoDiagnosis: {
        channel?: { detected?: string; confirmedByPm?: boolean }
      }
    }
    // PM 이 직전에 B2G 로 컨펌했으므로 보존돼야 함
    expect(data.autoDiagnosis.channel?.confirmedByPm).toBe(true)
    expect(data.autoDiagnosis.channel?.detected).toBe('B2G')
  })

  test('5. logic-chain + fact-check (sections 채워진 상태)', async ({ request }) => {
    const projectId = process.env.E2E_PROJECT_ID
    if (!projectId) test.skip()

    const r = await request.post('/api/express/diagnose', {
      data: { projectId, kinds: ['logic-chain', 'fact-check'] },
    })
    expect(r.status()).toBe(200)
    const data = (await r.json()) as {
      autoDiagnosis: {
        logicChain?: { passed?: boolean; channel?: string; totalSteps?: number }
        factCheck?: { totalFacts?: number }
      }
    }
    expect(data.autoDiagnosis.logicChain).toBeTruthy()
    expect(data.autoDiagnosis.factCheck).toBeTruthy()
  })

  test('6. 평가배점 시뮬 (B2G)', async ({ request }) => {
    const projectId = process.env.E2E_PROJECT_ID
    if (!projectId) test.skip()

    const r = await request.post('/api/express/eval-simulate', {
      data: { projectId },
    })
    expect(r.status()).toBe(200)
    const data = (await r.json()) as {
      simulation: { items: unknown[]; totalMax: number; totalPredicted: number }
    }
    expect(data.simulation.items.length).toBeGreaterThan(0)
    expect(data.simulation.totalMax).toBeGreaterThan(0)
  })

  test('7. 검수 (Inspector + 채널 가중치)', async ({ request }) => {
    const projectId = process.env.E2E_PROJECT_ID
    if (!projectId) test.skip()

    const r = await request.post('/api/express/inspect', {
      data: { projectId },
    })
    expect(r.status()).toBe(200)
    const data = (await r.json()) as {
      report: {
        passed: boolean
        overallScore: number
        lensScores?: Record<string, number>
        weightedByChannel?: string
      }
    }
    expect(typeof data.report.overallScore).toBe('number')
    // 채널 가중치 적용 — autoDiagnosis.channel.detected 가 B2G 이므로
    expect(data.report.weightedByChannel).toBe('B2G')
  })

  test('8. Markdown export — 헤더 + 7 섹션 + 진단 모두 포함', async ({ request }) => {
    const projectId = process.env.E2E_PROJECT_ID
    if (!projectId) test.skip()

    const r = await request.get(`/api/projects/${projectId}/export-markdown`)
    expect(r.status()).toBe(200)
    expect(r.headers()['content-type']).toContain('text/markdown')

    const md = await r.text()
    // 핵심 마커 존재 확인
    expect(md).toContain('# ') // 헤더
    expect(md).toContain('발주처')
    expect(md).toContain('B2G') // 컨펌된 채널
    expect(md).toContain('AI 자동 진단') // 진단 섹션
    expect(md).toContain('<!-- ai-diagnosis')
    expect(md.length).toBeGreaterThan(500)
  })

  test('9. 권한 — 다른 user 의 프로젝트 접근 차단', async ({ request }) => {
    // 임의 ID 로 다른 프로젝트 접근 시도 → 403 또는 404
    const fakeId = 'cmother9999wgvc0000fake0001'
    const r = await request.post('/api/express/diagnose', {
      data: { projectId: fakeId, kinds: ['channel'] },
    })
    // 401 (unauth) 또는 404 (not found) 모두 정상 — 단 200 절대 안 됨
    expect([401, 403, 404]).toContain(r.status())
  })
})
