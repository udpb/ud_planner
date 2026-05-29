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
async function main() {
  const { prisma } = await import(path.join(process.cwd(), 'src/lib/prisma'))
  const total = await prisma.contentAsset.count()
  const allAssets = await prisma.contentAsset.findMany({ select: { programProfileFit: true, sourceReferences: true } })
  let l2 = 0, l3 = 0, anyQuote = 0
  for (const a of allAssets) {
    const fit = a.programProfileFit as any
    if (fit && Object.keys(fit).length > 0) l2++
    const sr = a.sourceReferences as any
    if (sr?.originalQuoteSource === 'pdf-rebuild') l3++
    if (sr?.originalQuote) anyQuote++
  }
  console.log(`total: ${total}`)
  console.log(`L2 (programProfileFit 채워짐): ${l2} (${(l2/total*100).toFixed(1)}%)`)
  console.log(`L3 (originalQuoteSource=pdf-rebuild): ${l3}`)
  console.log(`any originalQuote: ${anyQuote}`)
  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
