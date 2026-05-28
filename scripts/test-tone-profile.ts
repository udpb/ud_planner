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
  const { buildToneProfile, formatToneProfileForPrompt } = await import(
    '../src/lib/express/tone-patterns'
  )
  const tone = await buildToneProfile({
    channel: 'B2G',
    keywords: ['창업', 'GTM', '스타트업'],
    limit: 3,
  })
  console.log('openings:', tone.openings)
  console.log('transitions:', tone.transitions)
  console.log('closingPhrases:', tone.closingPhrases)
  console.log('avoidedWords:', tone.avoidedWords)
  console.log('signatureNumbers:', tone.signatureNumbers)
  console.log('\n--- prompt format ---')
  console.log(formatToneProfileForPrompt(tone))
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
