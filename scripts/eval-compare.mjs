/**
 * scripts/eval-compare.mjs — 품질 스윕 before/after 비교 (15H-Phase2)
 *
 * eval-results-baseline/_summary.json (before) vs scripts/eval-results/_summary.json (after)
 * 를 읽어 lens별·RFP별 점수 delta 를 표로 출력. 파이프라인 미접촉 (순수 JSON read).
 *
 * 사용: node scripts/eval-compare.mjs [beforeDir] [afterDir]
 *   기본: before=eval-results-baseline  after=scripts/eval-results
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

const beforeDir = process.argv[2] || 'eval-results-baseline'
const afterDir = process.argv[3] || 'scripts/eval-results'

function loadSummary(dir) {
  const p = path.join(dir, '_summary.json')
  if (!fs.existsSync(p)) return null
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}
function loadPerRfp(dir) {
  if (!fs.existsSync(dir)) return new Map()
  const m = new Map()
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json') || f === '_summary.json') continue
    try {
      const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'))
      m.set(r.label, r)
    } catch {}
  }
  return m
}

const before = loadSummary(beforeDir)
const after = loadSummary(afterDir)
if (!before) { console.error(`✗ before 없음: ${beforeDir}/_summary.json`); process.exit(1) }
if (!after) { console.error(`✗ after 없음: ${afterDir}/_summary.json (스윕 아직 미완?)`); process.exit(1) }

const sign = (d) => (d > 0 ? `+${d}` : `${d}`)
const pad = (s, n) => String(s).padEnd(n)

console.log(`\n━━━ 품질 스윕 before/after 비교 ━━━`)
console.log(`  before: ${beforeDir} (n=${before.n})   after: ${afterDir} (n=${after.n})\n`)

console.log(`[종합]`)
console.log(`  패널 평균:      ${pad(before.panelOverallAvg, 4)} → ${pad(after.panelOverallAvg, 4)}  (${sign(after.panelOverallAvg - before.panelOverallAvg)})`)
console.log(`  우리 Inspector: ${pad(before.ourInspectorAvg, 4)} → ${pad(after.ourInspectorAvg, 4)}  (${sign(after.ourInspectorAvg - before.ourInspectorAvg)})\n`)

console.log(`[lens별 패널 평균]`)
const lenses = Array.from(new Set([...Object.keys(before.lensAvg ?? {}), ...Object.keys(after.lensAvg ?? {})]))
for (const k of lenses) {
  const b = before.lensAvg?.[k] ?? 0
  const a = after.lensAvg?.[k] ?? 0
  const d = a - b
  const mark = d >= 5 ? ' ⬆' : d <= -5 ? ' ⬇' : ''
  console.log(`  ${pad(k, 18)} ${pad(b, 4)} → ${pad(a, 4)}  (${sign(d)})${mark}`)
}

console.log(`\n[RFP별 패널 overall]`)
const bMap = new Map((before.perRfp ?? []).map((r) => [r.label, r]))
const aMap = new Map((after.perRfp ?? []).map((r) => [r.label, r]))
const labels = Array.from(new Set([...bMap.keys(), ...aMap.keys()]))
for (const l of labels) {
  const b = bMap.get(l), a = aMap.get(l)
  const bp = b?.panel ?? '-', ap = a?.panel ?? '-'
  const d = typeof bp === 'number' && typeof ap === 'number' ? sign(ap - bp) : ''
  console.log(`  ${pad(l, 26)} ${pad(bp, 4)} → ${pad(ap, 4)}  ${d}  [${a?.verdict ?? '-'}]`)
}

// 비목(budget) 실측 — after 의 각 RFP §5 간접비% 추출 (jargon·간접비 캡 검증용)
console.log(`\n[after §5 간접비% 실측 (간접비 캡 검증)]`)
const afterRfps = loadPerRfp(afterDir)
for (const [label, r] of afterRfps) {
  const s5 = r.draftSections?.['5'] ?? ''
  const m = s5.match(/간접비[^0-9]*([0-9]+(?:\.[0-9]+)?)\s*%/)
  const jargon = /임퓨테이션|정규화|imputation|제로/.test(s5) ? ' ⚠ jargon누출' : ''
  console.log(`  ${pad(label, 26)} 간접비 ${m ? m[1] + '%' : '?'}${jargon}`)
}
console.log()
