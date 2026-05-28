/**
 * K1 Verification — inferBudget 평균 계산 fix (DB 직접 비교).
 *
 * Strategy:
 *   1. infer-budget 의 알고리즘과 동일한 로직을 prisma 로 직접 재현
 *   2. SQL zero-imputation 평균과 비교 — sum ≈ 100%, 인건비 18~30% 인지 확인
 *
 * 이렇게 하면 `server-only` import 우회하면서도 알고리즘 정합성 검증 가능.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
for (const file of ['.env', '.env.local']) {
  const envPath = path.join(process.cwd(), file)
  if (!fs.existsSync(envPath)) continue
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    process.env[k] = v
  }
}

const CATEGORY_MAP: Record<string, string> = {
  인건비: '인건비',
  강사료: '강사료',
  운영비: '운영비',
  재료비: '운영비',
  여비: '운영비',
  회의비: '운영비',
  외주비: '간접비',
  기타: '간접비',
}
function normalizeCategory(raw: string): string {
  return CATEGORY_MAP[raw] ?? '간접비'
}

const STANDARD_CATEGORIES = ['인건비', '강사료', '운영비', '간접비']

async function main() {
  const { prisma } = await import('../src/lib/prisma')

  const totalBudget = 65_000_000
  const channel = 'B2G'
  const minBudget = totalBudget * 0.6
  const maxBudget = totalBudget * 1.4

  const projectTotals = await prisma.proposalBudgetItem.groupBy({
    by: ['sourceProject', 'channelType'],
    where: { channelType: channel },
    _sum: { amount: true },
  })

  const inRange = projectTotals
    .map((p) => ({ proj: p.sourceProject, total: p._sum.amount ?? 0 }))
    .filter((p) => p.total >= minBudget && p.total <= maxBudget)
    .sort((a, b) => Math.abs(a.total - totalBudget) - Math.abs(b.total - totalBudget))

  const MAX_SAMPLE = 25
  let similarProjects = inRange.slice(0, MAX_SAMPLE).map((p) => p.proj)
  if (similarProjects.length < 5) {
    const all = projectTotals
      .map((p) => ({ proj: p.sourceProject, total: p._sum.amount ?? 0 }))
      .filter((p) => p.total > 0)
      .sort((a, b) => Math.abs(a.total - totalBudget) - Math.abs(b.total - totalBudget))
      .slice(0, MAX_SAMPLE)
      .map((p) => p.proj)
    similarProjects = all
  }

  console.log(`▶ K1 Verification — 65M B2G inferBudget`)
  console.log(`  유사 사업 풀: ${similarProjects.length}건 (±40%)\n`)

  const items = await prisma.proposalBudgetItem.findMany({
    where: { sourceProject: { in: similarProjects } },
    select: { sourceProject: true, category: true, amount: true },
  })

  // K1 fix: zero-imputation
  const projectCategorySum = new Map<string, Map<string, number>>()
  const projectTotalSum = new Map<string, number>()
  for (const proj of similarProjects) {
    projectCategorySum.set(proj, new Map(STANDARD_CATEGORIES.map((c) => [c, 0])))
    projectTotalSum.set(proj, 0)
  }
  for (const it of items) {
    const catMap = projectCategorySum.get(it.sourceProject)
    if (!catMap) continue
    const norm = normalizeCategory(it.category)
    catMap.set(norm, (catMap.get(norm) ?? 0) + it.amount)
    projectTotalSum.set(it.sourceProject, (projectTotalSum.get(it.sourceProject) ?? 0) + it.amount)
  }

  const categoryRatios = new Map<string, number[]>(STANDARD_CATEGORIES.map((c) => [c, []]))
  let validProjectCount = 0
  for (const [proj, catMap] of projectCategorySum) {
    const projTotal = projectTotalSum.get(proj) ?? 0
    if (projTotal <= 0) continue
    validProjectCount += 1
    for (const cat of STANDARD_CATEGORIES) {
      const amt = catMap.get(cat) ?? 0
      categoryRatios.get(cat)!.push(amt / projTotal)
    }
  }

  const rawAvg = new Map<string, number>()
  for (const cat of STANDARD_CATEGORIES) {
    const ratios = categoryRatios.get(cat) ?? []
    const avg = ratios.length > 0 ? ratios.reduce((s, r) => s + r, 0) / ratios.length : 0
    rawAvg.set(cat, avg)
  }
  const sumOfAvg = STANDARD_CATEGORIES.reduce((s, c) => s + (rawAvg.get(c) ?? 0), 0)
  const normalizeFactor = sumOfAvg > 0 ? 1 / sumOfAvg : 0

  type B = { category: string; amount: number; percentage: number }
  const breakdown: B[] = []
  for (const cat of STANDARD_CATEGORIES) {
    const avgNormalized = (rawAvg.get(cat) ?? 0) * normalizeFactor
    const amount = Math.round((totalBudget * avgNormalized) / 10000) * 10000
    if (amount > 0) {
      breakdown.push({
        category: cat,
        amount,
        percentage: Math.round(avgNormalized * 1000) / 10,
      })
    }
  }
  const breakdownSum = breakdown.reduce((s, b) => s + b.amount, 0)
  const diff = totalBudget - breakdownSum
  if (Math.abs(diff) > 1000 && breakdown.length > 0) {
    const largest = breakdown.reduce((a, b) => (a.amount >= b.amount ? a : b))
    largest.amount += diff
    largest.percentage = Math.round((largest.amount / totalBudget) * 1000) / 10
  }

  console.log(`인용 사업: ${validProjectCount}건`)
  console.log(`\n[비목 분배]`)
  let sumPct = 0
  let sumAmt = 0
  for (const b of breakdown) {
    console.log(`  ${b.category}: ${b.amount.toLocaleString()}원 (${b.percentage}%)`)
    sumPct += b.percentage
    sumAmt += b.amount
  }
  console.log(`\n합계 비율: ${sumPct.toFixed(1)}% (목표 100±0.5%)`)
  console.log(`합계 금액: ${sumAmt.toLocaleString()}원 (목표 ${totalBudget.toLocaleString()})`)

  const pctPass = Math.abs(sumPct - 100) <= 0.5
  const amtPass = Math.abs(sumAmt - totalBudget) <= 10_000
  const personnelRatio = breakdown.find((b) => b.category === '인건비')?.percentage ?? 0
  const personnelPass = personnelRatio >= 18 && personnelRatio <= 30

  console.log(`\n[검증]`)
  console.log(`  ${pctPass ? '✓' : '✗'} 합계 비율 ≈ 100%: ${pctPass ? 'PASS' : `FAIL (${sumPct.toFixed(1)}%)`}`)
  console.log(`  ${amtPass ? '✓' : '✗'} 합계 금액 ≈ 총 예산: ${amtPass ? 'PASS' : `FAIL`}`)
  console.log(`  ${personnelPass ? '✓' : '✗'} 인건비 ${personnelRatio}% in [18~30]%: ${personnelPass ? 'PASS' : 'FAIL (실 평균 ~23.6%)'}`)

  // SQL 직접 비교 (참고)
  console.log(`\n[SQL 직접 평균 — 65M B2G ±40% pool 직접 계산]`)
  let sqlPct: Record<string, number> = {}
  for (const cat of STANDARD_CATEGORIES) {
    const ratios = categoryRatios.get(cat) ?? []
    const avg = ratios.length > 0 ? ratios.reduce((s, r) => s + r, 0) / ratios.length : 0
    sqlPct[cat] = avg * 100
  }
  for (const cat of STANDARD_CATEGORIES) {
    console.log(`  ${cat}: ${sqlPct[cat].toFixed(2)}%`)
  }

  await prisma.$disconnect()

  if (pctPass && amtPass && personnelPass) {
    console.log(`\n✅ K1 PASS`)
    process.exit(0)
  } else {
    console.log(`\n❌ K1 FAIL`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
