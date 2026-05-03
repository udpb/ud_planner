/**
 * 인증된 흐름: Express 챗봇 1턴 (Phase 4-coach-integration, 2026-05-03)
 *
 * 시나리오:
 *   1. 사전: rfp-upload spec 이 RFP 파싱 + 저장
 *   2. /api/express/turn 호출 (firstTurn=true) → AI mock 응답 받기
 *   3. extractedSlots 의 intent 확인
 *   4. 두 번째 턴 (PM 답변 시뮬) → beforeAfter 추출 확인
 *
 * AI mock 응답: src/lib/ai-mock.ts 의 'express-first-turn' / 'express-turn'.
 */

import { test, expect } from '@playwright/test'

test.describe('인증 흐름: Express turn', () => {
  test.beforeAll(async ({ request }) => {
    // RFP 가 저장된 상태인지 확인 — 없으면 사전 셋업
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

  test('첫 턴 (firstTurn=true) → intent 추출 + 카드 첨부', async ({ request }) => {
    const projectId = process.env.E2E_PROJECT_ID
    if (!projectId) test.skip()

    const r = await request.post('/api/express/turn', {
      data: {
        projectId,
        pmInput: '',
        firstTurn: true,
      },
      headers: { 'Content-Type': 'application/json' },
    })

    expect(r.status()).toBe(200)
    const data = (await r.json()) as {
      ok?: boolean
      aiTurn?: { text?: string; extractedSlots?: Record<string, unknown> }
      externalLookupNeeded?: { type?: string } | null
    }

    expect(data.ok).toBe(true)
    expect(data.aiTurn?.text).toBeTruthy()
    // mock 응답: intent 자동 채워짐
    expect(data.aiTurn?.extractedSlots?.intent).toBeTruthy()
    // mock 응답: auto-extract 카드
    expect(data.externalLookupNeeded?.type).toBe('auto-extract')
  })

  test('두 번째 턴 (PM 답변) → beforeAfter 추출', async ({ request }) => {
    const projectId = process.env.E2E_PROJECT_ID
    if (!projectId) test.skip()

    // 첫 턴
    await request.post('/api/express/turn', {
      data: { projectId, pmInput: '', firstTurn: true },
    })

    // 두 번째 턴 — PM 입력
    const r = await request.post('/api/express/turn', {
      data: {
        projectId,
        pmInput: '청년 창업가의 회복탄력성 강화로 지속 가능한 창업 생태계 형성',
      },
      headers: { 'Content-Type': 'application/json' },
    })

    expect(r.status()).toBe(200)
    const data = (await r.json()) as {
      ok?: boolean
      aiTurn?: { extractedSlots?: Record<string, unknown> }
    }
    expect(data.ok).toBe(true)
    // mock 응답: beforeAfter.before / .after 자동 추출
    const slots = data.aiTurn?.extractedSlots ?? {}
    expect(slots['beforeAfter.before']).toBeTruthy()
  })
})
