/**
 * V4: Proposal-Patterns 라이브러리 무결성 검증.
 *
 * - 모든 패턴이 필수 필드 (id·name·category·source·summary·template) 채움
 * - 모든 패턴의 id 가 unique
 * - applicableLenses 가 실제 11-lens enum 과 일치
 * - applicableSections 가 1~7 범위
 * - getPatternsByCategory/Section/Lens/Id helper 정상 동작
 * - 청년마을 PDF 출처 패턴이 최소 N건
 */

import {
  PROPOSAL_PATTERNS,
  getPatternsByCategory,
  getPatternsBySection,
  getPatternsByLens,
  getPatternById,
} from '../src/lib/proposal-patterns'
import type { ProposalPattern } from '../src/lib/proposal-patterns'

let p = 0, f = 0
const ok = (l: string, c: boolean, hint?: string) =>
  c ? (console.log(`  ✓ ${l}`), p++) : (console.log(`  ✗ ${l}${hint ? ' → ' + hint : ''}`), f++)

console.log('\n[1] 총 패턴 수 + 필수 필드')
ok('총 11+ 패턴', PROPOSAL_PATTERNS.length >= 11, `${PROPOSAL_PATTERNS.length}건`)
console.log(`  → 실제 ${PROPOSAL_PATTERNS.length} 건`)

for (const p2 of PROPOSAL_PATTERNS) {
  ok(`[${p2.id}] id 존재`, !!p2.id && p2.id.length > 0)
  ok(`[${p2.id}] name 한국어`, !!p2.name && p2.name.length >= 3)
  ok(`[${p2.id}] category 정의`, !!p2.category)
  ok(`[${p2.id}] source 정의`, !!p2.source)
  ok(`[${p2.id}] summary 8자+`, !!p2.summary && p2.summary.length >= 8)
  ok(`[${p2.id}] template 30자+`, !!p2.template && p2.template.length >= 30)
}

// id 유니크
console.log('\n[2] id 유니크')
const ids = PROPOSAL_PATTERNS.map((p2) => p2.id)
const uniqueIds = new Set(ids)
ok('id 모두 유니크', ids.length === uniqueIds.size, `${ids.length} vs ${uniqueIds.size}`)

// applicableLenses 검증
console.log('\n[3] applicableLenses 11-lens 와 일치')
const VALID_LENSES = new Set([
  'market', 'statistics', 'problem', 'before-after',
  'key-messages', 'differentiators', 'tone',
  'detail-completeness', 'competitive-context',
  'off-record-insight', 'quantitative-saturation',
])
for (const p2 of PROPOSAL_PATTERNS) {
  if (!p2.applicableLenses) continue
  for (const lens of p2.applicableLenses) {
    ok(`[${p2.id}] lens "${lens}" 유효`, VALID_LENSES.has(lens))
  }
}

// applicableSections 범위
console.log('\n[4] applicableSections 1~7 범위')
const VALID_SECTIONS = new Set(['1', '2', '3', '4', '5', '6', '7'])
for (const p2 of PROPOSAL_PATTERNS) {
  if (!p2.applicableSections) continue
  for (const s of p2.applicableSections) {
    ok(`[${p2.id}] section "${s}" 유효`, VALID_SECTIONS.has(s))
  }
}

// helper functions
console.log('\n[5] helper functions')
const visualPatterns = getPatternsByCategory('visual-hierarchy')
ok('getPatternsByCategory(visual-hierarchy) ≥ 1', visualPatterns.length >= 1)

const meceP = getPatternsByCategory('mece-classification')
ok('getPatternsByCategory(mece-classification) ≥ 2', meceP.length >= 2)

const section1 = getPatternsBySection('1')
ok('getPatternsBySection(1) ≥ 2', section1.length >= 2)

const section7 = getPatternsBySection('7')
ok('getPatternsBySection(7) ≥ 1', section7.length >= 1)
ok('section 7 에 STAR 포함', section7.some((p2) => p2.id === 'star-framework'))

const quantLensPatterns = getPatternsByLens('quantitative-saturation')
ok('getPatternsByLens(quantitative-saturation) ≥ 1', quantLensPatterns.length >= 1)

const detailLensPatterns = getPatternsByLens('detail-completeness')
ok('getPatternsByLens(detail-completeness) ≥ 1', detailLensPatterns.length >= 1)

ok('getPatternById(scqa-framework)', !!getPatternById('scqa-framework'))
ok('getPatternById(invalid) → undefined', getPatternById('xxx-not-exists') === undefined)

// source diversity
console.log('\n[6] source 분포')
const sources = new Set(PROPOSAL_PATTERNS.map((p2) => p2.source))
ok('source 종류 ≥ 4 (학습 출처 다양)', sources.size >= 4, [...sources].join(', '))
ok('source 에 youth-village-2026 포함', sources.has('youth-village-2026'))
ok('source 에 guidebook 포함', sources.has('guidebook'))

// 청년마을 출처 패턴 수
const youthVillagePatterns = PROPOSAL_PATTERNS.filter((p2) => p2.source === 'youth-village-2026')
ok('청년마을 출처 패턴 ≥ 3건', youthVillagePatterns.length >= 3, `${youthVillagePatterns.length}건`)

// category 분포
console.log('\n[7] category 분포')
const cats = new Set(PROPOSAL_PATTERNS.map((p2) => p2.category))
ok('category 종류 ≥ 6', cats.size >= 6, [...cats].join(', '))

console.log('\n─────────────────────────────')
console.log(`결과: ${p} 통과 / ${f} 실패`)
if (f > 0) process.exit(1)
