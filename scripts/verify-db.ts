import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const p = new PrismaClient({ adapter })
async function main() {
  const total = await p.winningPattern.count()
  const withProfile = await p.winningPattern.count({ where: { NOT: { sourceProfile: { equals: null as any } } } })
  const bySection = await p.winningPattern.groupBy({
    by: ['sectionKey'],
    _count: { _all: true },
    orderBy: { sectionKey: 'asc' },
  })
  const impactModules = await p.impactModule.count()
  const projects = await p.project.count()

  console.log('\n📊 Phase E seeded data:')
  console.log('  WinningPattern total     :', total)
  console.log('  with sourceProfile (new) :', withProfile)
  console.log('  ImpactModule total       :', impactModules)
  console.log('  Project total            :', projects)
  console.log('\n  By section:')
  bySection.forEach(s => console.log('    ' + s.sectionKey.padEnd(24) + s._count._all))

  await p.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
