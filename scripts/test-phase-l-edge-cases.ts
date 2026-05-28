/**
 * Phase L Edge Case 회귀 검증.
 *
 * - 빈 hierarchy / 비어있는 sub 배열 / quantProofs 0건
 * - sectionMeta 일부 키만 있는 경우
 * - 한글 수사 MECE (한/두/세/...)
 * - MECE 큰 숫자 (10가지) edge
 * - 모호 표현 boundary (정확히 3건)
 * - Legacy keyMessages-only draft (Phase J 이전 데이터 회귀)
 * - 본문 < 500자 일 때 정량 포화 검사 skip
 * - SROI 본문 vs forecast 통합 (Phase L 와 결합)
 */

import {
  renderExpressMarkdown,
  buildQualityWarnings,
} from '../src/lib/express/render-markdown'
import type { ExpressDraft } from '../src/lib/express/schema'

function fx(overrides: Partial<ExpressDraft> = {}): ExpressDraft {
  const now = new Date().toISOString()
  return {
    keyMessages: [],
    differentiators: [],
    evidenceRefs: [],
    sections: {},
    meta: { startedAt: now, lastUpdatedAt: now, isCompleted: false, activeSlots: [], skippedSlots: [] },
    ...overrides,
  }
}

let p = 0, f = 0
const ok = (l: string, c: boolean, hint?: string) => {
  if (c) { console.log(`  ✓ ${l}`); p++ }
  else { console.log(`  ✗ ${l}${hint ? ' → ' + hint : ''}`); f++ }
}

// ─── 1. 빈 hierarchy → keyMessages fallback ───
console.log('\n[E1] 빈 hierarchy → keyMessages fallback')
{
  const draft = fx({
    keyMessages: ['핵심 메시지 1', '핵심 메시지 2', '핵심 메시지 3'],
    messageHierarchy: [], // 명시적 빈 배열
  })
  const md = renderExpressMarkdown({
    project: { name: 'X', client: 'Y', totalBudgetVat: null, supplyPrice: null, eduStartDate: null, eduEndDate: null },
    draft,
  })
  ok('hierarchy 빈 배열일 때 hierarchy 헤딩 X', !md.includes('hierarchy'))
  ok('keyMessages fallback 사용', md.includes('## 💬 핵심 메시지'))
  ok('keyMessages 1번 출력', md.includes('1. 핵심 메시지 1'))
}

// ─── 2. hierarchy 의 sub/quantProofs 비어있어도 key 만으로 출력 ───
console.log('\n[E2] hierarchy key만 (sub·quantProofs 0개)')
{
  const draft = fx({
    messageHierarchy: [
      { key: '키 메시지 단독', sub: [], quantProofs: [] },
    ],
  })
  const md = renderExpressMarkdown({
    project: { name: 'X', client: 'Y', totalBudgetVat: null, supplyPrice: null, eduStartDate: null, eduEndDate: null },
    draft,
  })
  ok('key 헤딩 출력', md.includes('"키 메시지 단독"'))
  ok('sub 비어도 에러 없음', !md.includes('undefined'))
}

// ─── 3. sectionMeta 일부 키만 (예: section 1만 있고 다른 건 없음) ───
console.log('\n[E3] sectionMeta 일부만 (section 1 만)')
{
  const draft = fx({
    sections: {
      '1': '제안 배경 본문입니다.',
      '2': '추진 전략 본문입니다.',
    },
    sectionMeta: {
      '1': { headline: 'section 1 헤드라인', subtitle: ': 부제 1' },
      // section 2 없음
    },
  })
  const md = renderExpressMarkdown({
    project: { name: 'X', client: 'Y', totalBudgetVat: null, supplyPrice: null, eduStartDate: null, eduEndDate: null },
    draft,
  })
  ok('section 1 헤드라인 인용', md.includes('"section 1 헤드라인"'))
  ok('section 1 부제 표시', md.includes('## 1. 제안 배경 및 목적 : 부제 1'))
  ok('section 2 헤드라인 인용 X', !md.includes('section 2 헤드라인'))
  ok('section 2 헤더 정상', md.includes('## 2. 추진 전략 및 방법론'))
}

// ─── 4. 한글 수사 MECE — "세 가지 원칙" 선언 + 2 항목 ───
console.log('\n[E4] 한글 수사 MECE — "세 가지 원칙" 선언 + 2 항목')
{
  const draft = fx({
    sections: {
      '2': '본 사업은 세 가지 원칙으로 운영합니다.\n- 책임\n- 성과\n끝.',
    },
  })
  const warnings = buildQualityWarnings(draft)
  const mw = warnings.find((w) => w.title.includes('MECE'))
  ok('한글 "세" → 3 인식', !!mw, JSON.stringify(warnings))
  if (mw) ok('실제 항목 2 발견', mw.detail.includes('2'))
}

// ─── 5. MECE 큰 숫자 boundary (12가지) — declaredCount > 12 → 스킵 ───
console.log('\n[E5] MECE 큰 숫자 (15가지) → 스킵 (오탐 방지)')
{
  const draft = fx({
    sections: {
      '2': '15가지 세부 활동을 포함합니다.\n- 활동 1\n- 활동 2',
    },
  })
  const warnings = buildQualityWarnings(draft)
  const mw = warnings.find((w) => w.title.includes('MECE'))
  ok('15가지 (>12) 는 스킵', !mw)
}

// ─── 6. MECE 작은 숫자 (2가지) — declaredCount < 3 → 스킵 ───
console.log('\n[E6] MECE 작은 숫자 (2가지) → 스킵')
{
  const draft = fx({
    sections: {
      '2': '두 가지 핵심 가치를 추구합니다.\n- 책임\n- 성과\n- 혁신',
    },
  })
  const warnings = buildQualityWarnings(draft)
  const mw = warnings.find((w) => w.title.includes('MECE'))
  ok('2가지 (<3) 는 스킵', !mw)
}

// ─── 7. 항목 0개 → MECE 검사 스킵 ───
console.log('\n[E7] 항목 0개 (선언만 있음) → 스킵')
{
  const draft = fx({
    sections: {
      '2': '5가지 차별점이 있습니다. 하나의 문장으로만 설명.',
    },
  })
  const warnings = buildQualityWarnings(draft)
  const mw = warnings.find((w) => w.title.includes('MECE'))
  ok('항목 자체 없으면 스킵', !mw)
}

// ─── 8. 모호 표현 boundary (정확히 3건) ───
console.log('\n[E8] 모호 표현 boundary — 정확히 3건')
{
  const draft = fx({
    sections: {
      '1': '많은 코치진, 다양한 프로그램, 충분한 예산이 있습니다.',
    },
  })
  const warnings = buildQualityWarnings(draft)
  const aw = warnings.find((w) => w.title.includes('모호'))
  ok('3건 → 워닝 발생', !!aw)
}

// ─── 9. 모호 표현 2건 (boundary 직전) ───
console.log('\n[E9] 모호 표현 2건 → 워닝 없음')
{
  const draft = fx({
    sections: {
      '1': '많은 코치진과 다양한 프로그램.',
    },
  })
  const warnings = buildQualityWarnings(draft)
  const aw = warnings.find((w) => w.title.includes('모호'))
  ok('2건 → 워닝 없음', !aw)
}

// ─── 10. 본문 < 500자 + hierarchy 없음 → 정량 포화 검사 스킵 ───
console.log('\n[E10] 짧은 본문 (<500자) → 정량 포화 검사 스킵')
{
  const draft = fx({
    sections: {
      '1': '짧은 본문.',
    },
  })
  const warnings = buildQualityWarnings(draft)
  const qw = warnings.find((w) => w.title.includes('정량'))
  ok('짧은 본문일 때 워닝 X', !qw)
}

// ─── 11. Legacy keyMessages-only draft 회귀 ───
console.log('\n[E11] Legacy draft (keyMessages 만) 100% 호환')
{
  const draft = fx({
    intent: '계원예대 세대융합창업 프로그램 운영',
    beforeAfter: { before: '시니어-청년 간 단절', after: '5팀 발굴 + MVP 검증' },
    keyMessages: ['세대융합 5팀', 'AI 리터러시', '실전 MVP'],
    sections: {
      '1': '제안 배경 본문입니다 (legacy).',
      '6': '기대 성과 본문입니다 (legacy).',
    },
  })
  const md = renderExpressMarkdown({
    project: { name: 'Legacy 테스트', client: 'X', totalBudgetVat: 60_000_000, supplyPrice: null, eduStartDate: null, eduEndDate: null },
    draft,
  })
  ok('legacy keyMessages 출력', md.includes('1. 세대융합 5팀'))
  ok('legacy keyMessages 3번', md.includes('3. 실전 MVP'))
  ok('hierarchy 헤딩 X', !md.includes('hierarchy'))
  ok('Before/After 출력', md.includes('**Before**'))
  ok('section 1 헤더', md.includes('## 1. 제안 배경 및 목적'))
}

// ─── 12. sectionMeta 만 있고 sections 본문 없음 → 출력 안함 ───
console.log('\n[E12] sectionMeta 있어도 본문 없으면 출력 안함 (fallback 5/7 제외)')
{
  const draft = fx({
    sectionMeta: {
      '3': { headline: '커리큘럼 헤드라인' },
    },
  })
  const md = renderExpressMarkdown({
    project: { name: 'X', client: 'Y', totalBudgetVat: null, supplyPrice: null, eduStartDate: null, eduEndDate: null },
    draft,
  })
  ok('section 3 헤더 X (본문 없음)', !md.includes('## 3.'))
  ok('section 3 헤드라인 X', !md.includes('커리큘럼 헤드라인'))
}

// ─── 13. SROI 본문 + Phase L 워닝 통합 ───
console.log('\n[E13] SROI 모순 + 모호 표현 통합 → 둘 다 워닝')
{
  const draft = fx({
    sections: {
      '6': '본 사업의 사회적 가치는 SROI 3.5억 입니다. 많은 청년이 다양한 경험을 충분한 코치진과 함께 합니다.',
    },
  })
  const md = renderExpressMarkdown({
    project: { name: 'X', client: 'Y', totalBudgetVat: null, supplyPrice: null, eduStartDate: null, eduEndDate: null },
    draft,
    impactForecast: {
      totalSocialValue: 17_900_000,  // 1,790만원 — 본문 3.5억 대비 19배 차이
      beneficiaryCount: 50,
      country: '한국',
      calibration: 'KR-2026',
      calibrationNote: null,
      topBreakdown: [],
    },
  })
  ok('통합 품질 점검 섹션', md.includes('자동 품질 점검'))
  ok('SROI 모순 워닝', md.includes('SROI 본문 vs 실제 forecast'))
  ok('모호 표현 워닝', md.includes('모호 표현 과다'))
}

// ─── 14. 정량 포화 충분 (UD_TRACK_RECORD 수치 포함 본문) ───
console.log('\n[E14] 정량 포화 충분 (본문 8건+ 숫자단위)')
{
  const draft = fx({
    sections: {
      '7': '언더독스는 10년간 누적 500억원 수주, 창업가 20,211명 양성, 코치 800명 확보, 30개 거점 운영, BB+ 신용등급 보유, 동시 1,500명 교육 가능 규모를 보유하고 있습니다. 추가로 매년 10,000명 신생 기업가 DB 갱신.'.padEnd(550, ' '),
    },
  })
  const warnings = buildQualityWarnings(draft)
  const qw = warnings.find((w) => w.title.includes('정량'))
  ok('정량 충분 시 본문 모드 워닝 없음', !qw)
}

console.log('\n─────────────────────────')
console.log(`결과: ${p} 통과 / ${f} 실패`)
if (f > 0) process.exit(1)
