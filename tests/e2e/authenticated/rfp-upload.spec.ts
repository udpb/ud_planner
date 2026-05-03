/**
 * 인증된 흐름: RFP 텍스트 업로드 → 파싱 결과 확인 (Phase 4-coach-integration, 2026-05-03)
 *
 * globalSetup 이 storageState 저장 + E2E_PROJECT_ID 셋팅.
 * 본 spec 은 이미 로그인 + project 가 있다고 가정.
 *
 * AI 호출은 PLAYWRIGHT_MOCK_AI=true 일 때 ai-mock.ts 의 fixture 응답 사용.
 */

import { test, expect } from '@playwright/test'

const SAMPLE_RFP = `
[E2E Test RFP]

사업명: 청년 창업 회복탄력성 강화 사업
발주기관: 한국청년창업진흥원
총 예산: 3억원 (VAT 포함)
교육 기간: 2026년 7월 ~ 11월

대상자: 예비/초기 창업자 30명 (서울 거주, 20~39세)

사업 목표:
1. 창업 회복탄력성 강화
2. 사회적 가치 창출 역량 함양
3. 실전 사업 모델 검증

평가 배점:
- 사업 추진 배경 및 목적 (15점)
- 추진 전략 및 방법론 (25점)
- 교육 커리큘럼 (20점)
- 운영 체계 (15점)
- 예산 계획 (10점)
- 기대 성과 (15점)

요구 사항:
- PM 풀타임 1명 + 코치 5명 이상
- 매주 출결 보고
- 수료 후 6개월 추적
`.trim()

test.describe('인증 흐름: RFP 업로드 + 파싱', () => {
  test('텍스트 RFP 입력 → POST /api/ai/parse-rfp → 파싱 결과 200', async ({ request }) => {
    const projectId = process.env.E2E_PROJECT_ID
    expect(projectId, 'E2E_PROJECT_ID must be set by globalSetup').toBeTruthy()

    const r = await request.post('/api/ai/parse-rfp', {
      data: {
        projectId,
        text: SAMPLE_RFP,
      },
      headers: { 'Content-Type': 'application/json' },
    })

    expect(r.status()).toBe(200)
    const data = (await r.json()) as {
      parsed?: {
        projectName?: string
        client?: string
        evalCriteria?: Array<{ item: string; score: number }>
      }
      questions?: unknown[]
      completeness?: { score: number }
    }

    // mock 응답이라 deterministic — projectName / client 자명히 존재
    expect(data.parsed?.projectName).toContain('청년')
    expect(data.parsed?.client).toBeTruthy()
    expect(Array.isArray(data.parsed?.evalCriteria)).toBe(true)
    expect(data.parsed?.evalCriteria?.length).toBeGreaterThanOrEqual(5)
    expect(data.completeness?.score).toBeGreaterThan(0)
  })

  test('파싱 후 PUT 으로 저장 → DB 반영 확인', async ({ request }) => {
    const projectId = process.env.E2E_PROJECT_ID
    if (!projectId) test.skip()

    // 1. 파싱
    const parseRes = await request.post('/api/ai/parse-rfp', {
      data: { projectId, text: SAMPLE_RFP },
      headers: { 'Content-Type': 'application/json' },
    })
    expect(parseRes.status()).toBe(200)
    const parseData = (await parseRes.json()) as { parsed: unknown }

    // 2. 저장 (PUT)
    const saveRes = await request.put('/api/ai/parse-rfp', {
      data: { projectId, parsed: parseData.parsed },
      headers: { 'Content-Type': 'application/json' },
    })
    expect(saveRes.status()).toBe(200)
    expect(((await saveRes.json()) as { ok?: boolean }).ok).toBe(true)
  })
})
