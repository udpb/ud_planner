/**
 * scripts/eval-ab-compare.mjs — A/B 결과 비교 요약 (EVAL-AB, 2026-06-01)
 *
 * eval-results-ab-flash/ 와 eval-results-ab-hybrid/ 의 per-RFP 결과를 읽어:
 *   - RFP별 패널 overall (flash vs hybrid · Δ=hybrid-flash)
 *   - 렌즈별 평균 Δ
 *   - 평균 elapsed (초)
 *   - arm B(hybrid) 평균 Pro-call 수
 * 콘솔 표로 출력. 해석은 메인이 — 숫자만.
 *
 * 사용: node scripts/eval-ab-compare.mjs
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

const LENSES = ['logic', 'quant', 'concreteness', 'operations', 'winningLanguage', 'differentiation', 'fit']

function loadArm(arm) {
  const dir = path.join(process.cwd(), `eval-results-ab-${arm}`)
  if (!fs.existsSync(dir)) return {}
  const out = {}
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json') || f.endsWith('.FAIL.json')) continue
    const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'))
    out[r.label] = r
  }
  return out
}

function fmt(n) {
  return n === null || n === undefined || Number.isNaN(n) ? ' n/a' : String(n).padStart(4)
}
function fmtSigned(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return ' n/a'
  const s = n >= 0 ? `+${n}` : `${n}`
  return s.padStart(5)
}

const flash = loadArm('flash')
const hybrid = loadArm('hybrid')
const labels = [...new Set([...Object.keys(flash), ...Object.keys(hybrid)])].sort()

console.log('\n══════════════════════════════════════════════════════════════')
console.log(' EVAL-AB — Flash-only(A) vs Flash+Pro 하이브리드(B) 패널 비교')
console.log(' Δ = hybrid - flash  (양수 = hybrid 우위)')
console.log('══════════════════════════════════════════════════════════════\n')

// ── 1. RFP별 패널 overall ──
console.log('[1] RFP별 패널 overall')
console.log('  label                          flash hybrid    Δ   (verdict flash→hybrid)')
let sumFlash = 0, sumHybrid = 0, nBoth = 0
for (const label of labels) {
  const f = flash[label]?.panel?.overall ?? null
  const h = hybrid[label]?.panel?.overall ?? null
  const d = f !== null && h !== null ? h - f : null
  if (f !== null && h !== null) { sumFlash += f; sumHybrid += h; nBoth++ }
  const vf = flash[label]?.panel?.verdict ?? '-'
  const vh = hybrid[label]?.panel?.verdict ?? '-'
  console.log(`  ${label.padEnd(30)} ${fmt(f)}  ${fmt(h)} ${fmtSigned(d)}   (${vf} → ${vh})`)
}
const avgF = nBoth ? Math.round(sumFlash / nBoth) : null
const avgH = nBoth ? Math.round(sumHybrid / nBoth) : null
console.log(`  ${'평균(공통 RFP)'.padEnd(30)} ${fmt(avgF)}  ${fmt(avgH)} ${fmtSigned(avgF !== null && avgH !== null ? avgH - avgF : null)}   (n=${nBoth})`)

// ── 2. 렌즈별 평균 Δ ──
console.log('\n[2] 렌즈별 평균 점수 (공통 RFP 기준)')
console.log('  lens                flash hybrid    Δ')
for (const lens of LENSES) {
  let sf = 0, sh = 0, n = 0
  for (const label of labels) {
    const f = flash[label]?.panel?.scores?.[lens]
    const h = hybrid[label]?.panel?.scores?.[lens]
    if (typeof f === 'number' && typeof h === 'number') { sf += f; sh += h; n++ }
  }
  const af = n ? Math.round(sf / n) : null
  const ah = n ? Math.round(sh / n) : null
  const d = af !== null && ah !== null ? ah - af : null
  console.log(`  ${lens.padEnd(18)} ${fmt(af)}  ${fmt(ah)} ${fmtSigned(d)}`)
}

// ── 3. 평균 elapsed + Pro-call ──
console.log('\n[3] 자원 — 평균 생성시간 · arm B Pro-call')
function avgElapsed(arm) {
  const vals = Object.values(arm).map((r) => r.elapsedMs).filter((v) => typeof v === 'number')
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length / 1000) : null
}
function avgProCalls(arm) {
  const vals = Object.values(arm).map((r) => r.proCallsDuringGen).filter((v) => typeof v === 'number')
  return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : 'n/a'
}
console.log(`  flash  평균 생성시간: ${avgElapsed(flash) ?? 'n/a'}s   (Pro-call 0 기대 — all flash)`)
console.log(`  hybrid 평균 생성시간: ${avgElapsed(hybrid) ?? 'n/a'}s   평균 Pro-call: ${avgProCalls(hybrid)}`)
console.log('  per-RFP Pro-call (arm B hybrid):')
for (const label of labels) {
  const h = hybrid[label]
  if (h) console.log(`    ${label.padEnd(30)} ProCalls=${h.proCallsDuringGen ?? 'n/a'} · iter=${h.selfScore?.iterations ?? '?'} · ${avgElapsed({ x: h })}s`)
}

// ── 4. 실패 건 ──
console.log('\n[4] 실패 건')
for (const arm of ['flash', 'hybrid']) {
  const dir = path.join(process.cwd(), `eval-results-ab-${arm}`)
  if (!fs.existsSync(dir)) { console.log(`  ${arm}: 디렉토리 없음`); continue }
  const fails = fs.readdirSync(dir).filter((f) => f.endsWith('.FAIL.json'))
  if (fails.length === 0) console.log(`  ${arm}: 실패 0`)
  else for (const f of fails) {
    const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'))
    console.log(`  ${arm}: ${r.label} — ${String(r.error).slice(0, 120)}`)
  }
}
console.log('')
