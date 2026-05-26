import { config } from 'dotenv'
config({ path: '.env.local' })
config({ path: '.env' })

async function main() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('GEMINI_API_KEY missing')
    process.exit(1)
  }
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
  )
  const d = (await r.json()) as { models?: Array<{ name: string; supportedGenerationMethods?: string[] }>; error?: { message?: string } }
  if (d.error) {
    console.error('API error:', d.error.message)
    process.exit(1)
  }
  const all = d.models || []
  console.log('Total models:', all.length)
  const embed = all.filter((m) => (m.supportedGenerationMethods || []).includes('embedContent'))
  console.log('Embedding-capable models:')
  embed.forEach((m) => console.log(' -', m.name))
}

main().finally(() => setTimeout(() => process.exit(0), 100))
