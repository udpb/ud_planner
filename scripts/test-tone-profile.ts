/**
 * K2/K5 Verification — buildToneProfile DB activation.
 *
 * Tests the algorithm directly via prisma (bypass server-only import).
 * After K5 fix: signatureNumbers from {value, context} objects should now appear.
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

async function main() {
  const { prisma } = await import('../src/lib/prisma')

  const channel = 'B2G'
  const keywords = ['창업', 'GTM', '스타트업']
  const limit = 3

  const patterns = await prisma.winningPattern.findMany({
    where: {
      channelType: channel,
      outcome: 'won',
      tonePatterns: { not: null as unknown as undefined } as never,
    },
    select: { sourceProject: true, tonePatterns: true, sourceClient: true },
    take: 30,
  })

  const scored = patterns
    .map((p) => {
      let score = 0.5
      for (const kw of keywords) {
        if (p.sourceProject?.includes(kw)) score += 0.2
      }
      return { ...p, score: Math.min(1, score) }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  const allOpenings: string[] = []
  const allTransitions: string[] = []
  const allClosings: string[] = []
  const allAvoided: string[] = []
  const allNumbers: string[] = []

  // K5 fix mirror
  const extractNumber = (x: unknown): string | null => {
    if (typeof x === 'string') return x
    if (x && typeof x === 'object') {
      const obj = x as { value?: unknown; context?: unknown }
      if (typeof obj.value === 'string' && obj.value.length > 0) {
        if (typeof obj.context === 'string' && obj.context.length > 0) {
          return `${obj.value} (${obj.context})`
        }
        return obj.value
      }
    }
    return null
  }

  for (const p of scored) {
    const tp = p.tonePatterns as any
    if (!tp) continue
    if (Array.isArray(tp.openings)) allOpenings.push(...tp.openings.filter((x: any) => typeof x === 'string'))
    if (Array.isArray(tp.transitions)) allTransitions.push(...tp.transitions.filter((x: any) => typeof x === 'string'))
    if (Array.isArray(tp.closingPhrases)) allClosings.push(...tp.closingPhrases.filter((x: any) => typeof x === 'string'))
    if (Array.isArray(tp.avoidedWords)) allAvoided.push(...tp.avoidedWords.filter((x: any) => typeof x === 'string'))
    if (Array.isArray(tp.signatureNumbers)) {
      for (const item of tp.signatureNumbers) {
        const ext = extractNumber(item)
        if (ext) allNumbers.push(ext)
      }
    }
  }

  const topN = (arr: string[], n: number) => {
    const count = new Map<string, number>()
    for (const s of arr) count.set(s, (count.get(s) ?? 0) + 1)
    return Array.from(count.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, n)
      .map(([s]) => s)
  }

  const tone = {
    openings: topN(allOpenings, 5),
    transitions: topN(allTransitions, 5),
    closingPhrases: topN(allClosings, 5),
    avoidedWords: topN(allAvoided, 8),
    signatureNumbers: topN(allNumbers, 6),
  }

  console.log('▶ K2/K5 Verification — buildToneProfile output\n')
  console.log('  sampled patterns:', scored.length)
  console.log('  total signatureNumbers collected (raw):', allNumbers.length)
  console.log('')
  console.log('openings:', tone.openings)
  console.log('transitions:', tone.transitions)
  console.log('closingPhrases:', tone.closingPhrases)
  console.log('avoidedWords:', tone.avoidedWords)
  console.log('signatureNumbers:', tone.signatureNumbers)

  const sigPass = tone.signatureNumbers.length >= 3
  console.log(`\n[검증]`)
  console.log(`  ${sigPass ? '✓' : '✗'} signatureNumbers ≥ 3건: ${sigPass ? 'PASS' : `FAIL (${tone.signatureNumbers.length}건)`}`)

  await prisma.$disconnect()

  if (sigPass) {
    console.log('\n✅ K5 PASS')
    process.exit(0)
  } else {
    console.log('\n❌ K5 FAIL')
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
