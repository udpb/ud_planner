/**
 * Gemini 어댑터 스모크 테스트.
 * claude.ts의 anthropic.messages.create() 가 실제로 작동하는지 1회 호출로 검증.
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

async function main() {
  console.log('🔥 Gemini 어댑터 스모크 테스트')
  console.log(`GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? `설정됨 (${process.env.GEMINI_API_KEY.slice(0, 12)}…)` : '❌ 없음'}`)

  if (!process.env.GEMINI_API_KEY) {
    process.exit(1)
  }

  const { anthropic, CLAUDE_MODEL } = await import('../src/lib/claude')
  console.log(`모델: ${CLAUDE_MODEL}`)

  const t0 = Date.now()
  try {
    const res = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: '아래 JSON을 그대로 반환해줘. 마크다운 없이.\n{"status":"ok","echo":"hello"}',
        },
      ],
    })
    const text = (res.content[0] as any).text
    console.log(`\n✅ 응답 (${Date.now() - t0}ms):`)
    console.log(text)
  } catch (err: any) {
    console.error(`\n❌ 실패 (${Date.now() - t0}ms):`)
    console.error(err.message)
    process.exit(1)
  }
}

main()
