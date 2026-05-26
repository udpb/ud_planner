import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })

async function main() {
  const { prisma } = await import('../src/lib/prisma')

  // 1. 총 통계
  const total = await prisma.proposalBudgetItem.count()
  console.log(`Total ProposalBudgetItem: ${total}`)

  // 2. 사업별 분포
  const bySourceProject = await prisma.proposalBudgetItem.groupBy({
    by: ['sourceProject'],
    _count: { id: true },
    _sum: { amount: true },
  })
  console.log(`\n사업 수 (distinct sourceProject): ${bySourceProject.length}`)
  console.log(`사업 평균 항목 수: ${(total / bySourceProject.length).toFixed(1)}`)

  // 3. 사업 총액 분포
  const totals = bySourceProject.map((g) => Number(g._sum.amount ?? 0))
  totals.sort((a, b) => a - b)
  const sumAll = totals.reduce((s, v) => s + v, 0)
  const median = totals[Math.floor(totals.length / 2)]
  console.log(`\n전체 누적 학습 예산: ${sumAll.toLocaleString()}원`)
  console.log(`사업당 평균: ${Math.round(sumAll / totals.length).toLocaleString()}원`)
  console.log(`사업당 중앙: ${median.toLocaleString()}원`)
  console.log(`최소: ${totals[0].toLocaleString()}원`)
  console.log(`최대: ${totals[totals.length - 1].toLocaleString()}원`)

  // 4. category 분포
  const byCategory = await prisma.proposalBudgetItem.groupBy({
    by: ['category'],
    _count: { id: true },
    _sum: { amount: true },
  })
  console.log(`\nCategory 분포:`)
  for (const c of byCategory.sort((a, b) => (b._sum.amount ?? 0) - (a._sum.amount ?? 0))) {
    const pct = (((c._sum.amount ?? 0) / sumAll) * 100).toFixed(1)
    console.log(
      `  ${c.category.padEnd(8)} 항목 ${String(c._count.id).padStart(4)}건  합계 ${Number(c._sum.amount ?? 0).toLocaleString().padStart(18)}원 (${pct}%)`,
    )
  }

  // 5. WinningPattern 과의 매칭 (예산이 있는 사업 vs 없는 사업)
  const patterns = await prisma.winningPattern.findMany({ select: { sourceProject: true } })
  const patternProjects = new Set(patterns.map((p) => p.sourceProject))
  const budgetProjects = new Set(bySourceProject.map((g) => g.sourceProject))

  const overlap = [...budgetProjects].filter((p) => patternProjects.has(p)).length
  const budgetOnly = [...budgetProjects].filter((p) => !patternProjects.has(p)).length
  const patternOnly = [...patternProjects].filter((p) => !budgetProjects.has(p)).length

  console.log(`\n=== 매칭 (WinningPattern ↔ ProposalBudgetItem sourceProject) ===`)
  console.log(`  WinningPattern 사업 수:           ${patternProjects.size}`)
  console.log(`  Budget 사업 수:                  ${budgetProjects.size}`)
  console.log(`  ✓ 양쪽 모두 있음:                ${overlap}`)
  console.log(`  ⚠ Budget 만 있음 (pattern X):    ${budgetOnly}`)
  console.log(`  ⚠ Pattern 만 있음 (budget X):    ${patternOnly}`)

  // 6. Pattern 만 있는 (예산 없는) 사업 sample 10
  if (patternOnly > 0) {
    console.log(`\nPattern 만 있는 (예산 없는) 사업 sample 10:`)
    const orphans = [...patternProjects].filter((p) => !budgetProjects.has(p)).slice(0, 10)
    orphans.forEach((p, i) => console.log(`  ${i + 1}. ${p.slice(0, 70)}`))
  }

  await prisma.$disconnect()
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
