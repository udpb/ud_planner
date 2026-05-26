import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })

async function main() {
  const { prisma } = await import('../src/lib/prisma')

  const patterns = await prisma.winningPattern.findMany({
    select: {
      id: true,
      sourceProject: true,
      sectionKey: true,
      outcome: true,
      contentRefs: true,
      createdAt: true,
      message: true,
    },
  })

  console.log(`Total: ${patterns.length}`)

  // 같은 sourceProject 가 여러 row 있는 케이스
  const groups = new Map<string, typeof patterns>()
  for (const p of patterns) {
    if (!groups.has(p.sourceProject)) groups.set(p.sourceProject, [])
    groups.get(p.sourceProject)!.push(p)
  }

  const dupGroups = Array.from(groups.entries()).filter(([_, ps]) => ps.length > 1)
  console.log(`\ndistinct sourceProject: ${groups.size}`)
  console.log(`같은 sourceProject 중복 그룹: ${dupGroups.length}건`)

  if (dupGroups.length > 0) {
    console.log(`\n중복 sample 5:`)
    for (const [sp, ps] of dupGroups.slice(0, 5)) {
      console.log(`\n[${sp.slice(0, 60)}] x ${ps.length}`)
      ps.forEach((p) => {
        const hasMessage = !!p.message
        const refs = p.contentRefs?.length ?? 0
        console.log(`  - ${p.id}  sectionKey=${p.sectionKey}  outcome=${p.outcome}  message=${hasMessage}  refs=${refs}  created=${p.createdAt.toISOString().slice(0, 10)}`)
      })
    }
  }

  // sourceProject 별 sectionKey 분포 — 중복이면 같은 sourceProject 다른 sectionKey
  const bySectionKey = new Map<string, number>()
  for (const p of patterns) {
    bySectionKey.set(p.sectionKey, (bySectionKey.get(p.sectionKey) ?? 0) + 1)
  }
  console.log(`\nsectionKey 분포:`)
  for (const [k, v] of [...bySectionKey.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(25)} ${v}`)
  }

  await prisma.$disconnect()
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
