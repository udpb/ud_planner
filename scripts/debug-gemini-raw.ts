import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })
delete process.env.PLAYWRIGHT_MOCK_AI
delete process.env.E2E_SECRET

import { invokeAi } from '../src/lib/ai-fallback'

async function main() {
  const result = await invokeAi({
    prompt: `아래 텍스트의 핵심 1줄 슬로건을 JSON 으로 추출하세요. {"slogan": "..."} 만 출력. 마크다운 펜스 없이.

[텍스트]
2025 한국외대 창업캠프 1박2일 제안서. 액트프러너 육성. 실행 중심 창업가.`,
    maxTokens: 256,
    temperature: 0.3,
    label: 'debug-test',
  })
  console.log('--- Provider ---', result.provider)
  console.log('--- Model ---', result.model)
  console.log('--- Raw bytes ---', result.raw.length)
  console.log('--- Raw ---')
  console.log(JSON.stringify(result.raw))
}

main().catch((e) => {
  console.error('FAIL:', e)
  process.exit(1)
}).finally(() => setTimeout(() => process.exit(0), 100))
