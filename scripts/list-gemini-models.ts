/**
 * 사용 가능한 Gemini 모델 목록 조회.
 * 실행: npx tsx scripts/list-gemini-models.ts
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

// 인라인 .env 로더
const envPath = path.join(process.cwd(), '.env')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

interface ModelInfo {
  name: string
  displayName?: string
  inputTokenLimit?: number
  outputTokenLimit?: number
  supportedGenerationMethods?: string[]
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY 없음')
    process.exit(1)
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
  const res = await fetch(url)
  if (!res.ok) {
    console.error(`❌ HTTP ${res.status}: ${await res.text()}`)
    process.exit(1)
  }

  const data = (await res.json()) as { models: ModelInfo[] }
  const models = data.models
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .filter((m) => /flash|pro/i.test(m.name))
    .sort((a, b) => a.name.localeCompare(b.name))

  console.log(`\n📋 사용 가능한 generateContent 지원 모델 (${models.length}개)\n`)
  console.log('NAME'.padEnd(45) + 'INPUT'.padStart(12) + 'OUTPUT'.padStart(12))
  console.log('-'.repeat(69))
  for (const m of models) {
    const name = m.name.replace('models/', '')
    console.log(
      name.padEnd(45) +
        String(m.inputTokenLimit ?? '?').padStart(12) +
        String(m.outputTokenLimit ?? '?').padStart(12),
    )
  }

  // gemini-3 계열 검색
  const gen3 = models.filter((m) => /gemini-3/i.test(m.name))
  console.log(`\n🔍 "gemini-3" 검색 결과: ${gen3.length}개`)
  for (const m of gen3) {
    console.log(`   - ${m.name.replace('models/', '')} (${m.displayName ?? ''})`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
