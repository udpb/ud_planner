/**
 * O4 Verification — slide spec LLM 생성 (server-only 우회).
 *
 * inline prompt + invokeAi direct call. 슬라이드 spec 검증.
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

const SECTIONS = {
  '3': '6개월 총 24주 커리큘럼 — M1 시장 진단 → M2 BM 정립 → M3 MVP 개발 → M4 시장 검증 → M5 사업화 → M6 글로벌 진출. Action Week 격주 강제.',
  '5': '본 사업 총 예산 65,000,000원. 인건비 20.5%, 강사료 13.4%, 운영비 31.4%, 간접비 34.6%.',
  '7': '언더독스 11년간 200+ 프로그램, 20,211명 창업가 양성, 코치 261명, 전국 30개 거점, 신용등급 BB+.',
}

async function main() {
  const { invokeAi } = await import('../src/lib/ai-fallback')
  const { safeParseJson } = await import('../src/lib/ai/parser')
  const { AI_TOKENS } = await import('../src/lib/ai/config')
  const { validateSlideSpec } = await import('../src/lib/diagrams/slide-pattern')

  console.log('▶ O4 Verification — 3 sections × slide spec\n')

  let validCount = 0
  for (const [num, body] of Object.entries(SECTIONS)) {
    const prompt = buildPrompt(num as '3' | '5' | '7', body)
    const t0 = Date.now()
    try {
      const r = await invokeAi({
        prompt,
        maxTokens: AI_TOKENS.LARGE,
        temperature: 0.3,
        label: `o4-spec-${num}`,
      })
      console.log(`section ${num} (${((Date.now() - t0) / 1000).toFixed(1)}s) — provider=${r.provider}`)
      const raw = safeParseJson<any>(r.raw, `o4-${num}`)
      const slides = Array.isArray(raw?.slides) ? raw.slides : []
      for (const s of slides) {
        const v = validateSlideSpec(s)
        if (v.ok) {
          validCount++
          console.log(`  ✓ [${v.spec.diagram.pattern}] ${v.spec.headline.slice(0, 60)}`)
        } else {
          console.log(`  ✗ validation: ${v.error}`)
        }
      }
    } catch (e) {
      console.log(`  ✗ LLM 실패: ${e instanceof Error ? e.message.slice(0, 80) : e}`)
    }
    console.log()
  }

  console.log(`총 valid slides: ${validCount}`)
  process.exit(validCount >= 3 ? 0 : 1)
}

function buildPrompt(num: '3' | '5' | '7', body: string): string {
  const SECTION_LABELS = { '3': '03 교육 커리큘럼', '5': '05 예산 및 경제성', '7': '07 수행 역량 및 실적' }
  const DEFAULT_PATTERNS = {
    '3': 'process-flow, timeline, hierarchy-tree',
    '5': 'kpi-grid, comparison-table',
    '7': 'kpi-grid, timeline',
  }
  return `
당신은 한국 사업 제안서 슬라이드 디자이너입니다.
sections.${num} 본문을 보고 1-2 슬라이드 spec 생성.

한 슬라이드 = 한 메시지. 각 슬라이드:
  - kicker: "${SECTION_LABELS[num]}"
  - headline: 한 문장 핵심 (결론 먼저, 30-100자)
  - diagram: 도식화 패턴 + 데이터
  - evidence: 근거 0-3건

[본문]
${body}

[도식화 패턴 권장 — 이 섹션에]
${DEFAULT_PATTERNS[num]}

[패턴별 데이터 schema 예시]
process-flow: { "pattern":"process-flow", "data": { "steps":[{"num":"M1","label":"시장 진단","description":"기술 적합도"},...] } }
kpi-grid: { "pattern":"kpi-grid", "data": { "columns":4, "kpis":[{"value":"20,211","label":"명","sublabel":"누적 육성"},...] } }
timeline: { "pattern":"timeline", "data": { "units":["M1","M2",...], "tracks":[{"name":"교육","bars":[{"startIdx":0,"endIdx":1,"label":"x"}]}] } }
comparison-table: { "pattern":"comparison-table", "data": { "leftLabel":"...","rightLabel":"...","rows":[{"dim":"...","left":"...","right":"...","advantageOnRight":true}] } }
hierarchy-tree: { "pattern":"hierarchy-tree", "data": { "root":{"label":"..."}, "children":[{"label":"..."}] } }

[출력 JSON]
{
  "slides": [
    {
      "kicker": "${SECTION_LABELS[num]}",
      "headline": "한 문장 핵심",
      "diagram": { "pattern": "...", "data": { ... } },
      "evidence": [{"text":"...","source":"..."}],
      "sectionNum": "${num}",
      "order": 1
    }
  ]
}

JSON 만.
`.trim()
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
