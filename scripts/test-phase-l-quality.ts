/**
 * Phase L 품질 점검 단위 테스트.
 *
 * buildQualityWarnings:
 *   1. MECE 일관성 — "N가지" 선언 vs 실제 항목 수 mismatch
 *   2. 모호 표현 — '많은/다양한/충분한' 과다 감지
 *   3. 정량 포화 — quantProofs 부족 시 UD_TRACK_RECORD 인용 제안
 *
 * 또한 messageHierarchy + sectionMeta 렌더링 출력 확인.
 */

import { renderExpressMarkdown, buildQualityWarnings } from '../src/lib/express/render-markdown'
import type { ExpressDraft } from '../src/lib/express/schema'

function fixture(overrides: Partial<ExpressDraft> = {}): ExpressDraft {
  const now = new Date().toISOString()
  return {
    intent: '세대융합창업 프로그램으로 청년-시니어 협업 창업팀 5팀 발굴',
    keyMessages: [],
    differentiators: [],
    evidenceRefs: [],
    sections: {},
    meta: {
      startedAt: now,
      lastUpdatedAt: now,
      isCompleted: false,
      activeSlots: [],
      skippedSlots: [],
    },
    ...overrides,
  }
}

let passed = 0
let failed = 0

function expect(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.log(`  ✗ ${label}`)
    console.log(`    expected: ${JSON.stringify(expected)}`)
    console.log(`    actual:   ${JSON.stringify(actual)}`)
    failed++
  }
}

function expectIncludes(label: string, haystack: string, needle: string) {
  const ok = haystack.includes(needle)
  if (ok) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.log(`  ✗ ${label}`)
    console.log(`    expected to include: ${needle}`)
    console.log(`    in: ${haystack.slice(0, 200)}...`)
    failed++
  }
}

// ─────────────────────────────────────────
// Test 1: MECE 일관성 검출
// ─────────────────────────────────────────
console.log('\n[Test 1] MECE 일관성 — "3가지" 선언 vs 실제 2 항목')
{
  const draft = fixture({
    sections: {
      '2': '본 사업은 다음 3가지 전략으로 추진합니다.\n- 첫째, 청년-시니어 매칭\n- 둘째, MVP 검증\n위 전략으로 사업을 완수합니다.',
    },
  })
  const warnings = buildQualityWarnings(draft)
  const meceWarn = warnings.find((w) => w.title.includes('MECE'))
  expect('MECE 워닝 발생', !!meceWarn, true)
  if (meceWarn) {
    expectIncludes('MECE 디테일에 3가지 포함', meceWarn.detail, '3가지')
    expectIncludes('MECE 디테일에 실제 2 포함', meceWarn.detail, '2')
  }
}

// ─────────────────────────────────────────
// Test 2: MECE 일치 — 워닝 X
// ─────────────────────────────────────────
console.log('\n[Test 2] MECE 일치 — "3가지" + 3 항목 (워닝 없음)')
{
  const draft = fixture({
    sections: {
      '2': '본 사업은 다음 3가지 전략으로 추진합니다.\n- 첫째, 청년-시니어 매칭\n- 둘째, MVP 검증\n- 셋째, 데모데이 성과 공유\n이상.',
    },
  })
  const warnings = buildQualityWarnings(draft)
  const meceWarn = warnings.find((w) => w.title.includes('MECE'))
  expect('MECE 일치 시 워닝 없음', meceWarn, undefined)
}

// ─────────────────────────────────────────
// Test 3: 모호 표현 과다 검출
// ─────────────────────────────────────────
console.log('\n[Test 3] 모호 표현 — 많은/다양한/충분한 3건 이상')
{
  const draft = fixture({
    sections: {
      '1': '많은 코치진이 다양한 영역에서 활동하며 충분한 경험을 보유하고 있습니다.',
      '2': '다양한 프로그램으로 많은 창업가를 지원합니다.',
    },
  })
  const warnings = buildQualityWarnings(draft)
  const ambWarn = warnings.find((w) => w.title.includes('모호 표현'))
  expect('모호 표현 워닝 발생', !!ambWarn, true)
  if (ambWarn) {
    expectIncludes('정량 대체 suggestion 포함', ambWarn.suggestion!, '코치 800명')
  }
}

// ─────────────────────────────────────────
// Test 4: 모호 표현 적음 — 워닝 X
// ─────────────────────────────────────────
console.log('\n[Test 4] 모호 표현 적음 — 워닝 없음')
{
  const draft = fixture({
    sections: {
      '1': '코치진 800명이 30개 거점에서 활동합니다.',
    },
  })
  const warnings = buildQualityWarnings(draft)
  const ambWarn = warnings.find((w) => w.title.includes('모호'))
  expect('모호 표현 워닝 없음', ambWarn, undefined)
}

// ─────────────────────────────────────────
// Test 5: 정량 포화 — messageHierarchy quantProofs < 5
// ─────────────────────────────────────────
console.log('\n[Test 5] 정량 포화 — quantProofs 3건 → 워닝')
{
  const draft = fixture({
    messageHierarchy: [
      {
        key: '청년-시니어 5팀 발굴',
        sub: ['주 4시간 4주 운영'],
        quantProofs: ['5팀 목표', '6000만원 예산'],
      },
      {
        key: '실전 MVP 검증',
        sub: [],
        quantProofs: ['12주 운영'],
      },
    ],
  })
  const warnings = buildQualityWarnings(draft)
  const quantWarn = warnings.find((w) => w.title.includes('정량'))
  expect('정량 포화 워닝 발생', !!quantWarn, true)
  if (quantWarn) {
    expectIncludes('UD_TRACK_RECORD 인용 제안', quantWarn.suggestion!, '800명')
  }
}

// ─────────────────────────────────────────
// Test 6: 정량 포화 — quantProofs 5건+ 워닝 없음
// ─────────────────────────────────────────
console.log('\n[Test 6] 정량 포화 충분 — quantProofs 6건 → 워닝 없음')
{
  const draft = fixture({
    messageHierarchy: [
      {
        key: '5팀 발굴',
        sub: [],
        quantProofs: ['5팀', '6천만원', '12주', '코치 5명', '만족도 4.5+', 'MVP 80%'],
      },
    ],
  })
  const warnings = buildQualityWarnings(draft)
  const quantWarn = warnings.find((w) => w.title.includes('정량'))
  expect('정량 충분 시 워닝 없음', quantWarn, undefined)
}

// ─────────────────────────────────────────
// Test 7: 렌더링 출력 — messageHierarchy + sectionMeta
// ─────────────────────────────────────────
console.log('\n[Test 7] renderExpressMarkdown — hierarchy + sectionMeta 출력')
{
  const draft = fixture({
    messageHierarchy: [
      {
        key: '청년-시니어 5팀 발굴 + MVP 검증',
        sub: ['주 4시간 × 12주 운영', '전담 코치 매칭'],
        quantProofs: ['5팀 목표', 'MVP 80% 달성'],
      },
    ],
    sections: {
      '1': '본 사업은 5천만원+ 운영 실적을 바탕으로 세대융합 창업팀을 발굴한다.',
    },
    sectionMeta: {
      '1': {
        headline: '세대융합으로 청년 유출을 막는 첫 사업',
        subtitle: ': 정책 배경',
      },
    },
  })
  const md = renderExpressMarkdown({
    project: {
      name: '계원예대 세대융합창업',
      client: '계원예술대학교',
      totalBudgetVat: 60_000_000,
      supplyPrice: null,
      eduStartDate: null,
      eduEndDate: null,
    },
    draft,
  })
  expectIncludes('hierarchy section heading', md, '## 💬 핵심 메시지 hierarchy')
  expectIncludes('hierarchy key 큰 따옴표', md, '"청년-시니어 5팀 발굴 + MVP 검증"')
  expectIncludes('hierarchy sub bullet', md, '- 주 4시간 × 12주 운영')
  expectIncludes('hierarchy quant', md, '- 5팀 목표')
  expectIncludes('sectionMeta subtitle 포함', md, ': 정책 배경')
  expectIncludes('sectionMeta headline 큰 따옴표', md, '"세대융합으로 청년 유출을 막는 첫 사업"')
  // 경어체 변환 확인
  expectIncludes('평어체 → 경어체', md, '발굴합니다')
}

// ─────────────────────────────────────────
// 결과 요약
// ─────────────────────────────────────────
console.log('\n─────────────────────────────────────────')
console.log(`결과: ${passed} 통과 / ${failed} 실패`)
if (failed > 0) {
  process.exit(1)
}
