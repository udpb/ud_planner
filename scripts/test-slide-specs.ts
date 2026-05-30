/**
 * N2/O4 Verification — 학습 역주입이 슬라이드 밀도를 높이는지 검증.
 *
 * 측정: 각 슬라이드의 diagram 데이터 항목 수 + evidence 수 = "콘텐츠 밀도".
 * 목표: 실제 당선 평균 (~9 도식 요소 · ~3 근거) 에 근접.
 *
 * server-only 우회 — learned-patterns JSON 직접 로드 + inline prompt.
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

const SECTIONS: Record<string, string> = {
  '2': 'IMPACT 6단계 방법론 — Idea→Market→Product→Action→Commercialize→Triumph. 실행 인증(Action Week) + 1:1 코칭 + AI Co-founder 3중 안전망. 시장 견인 단계에서 글로벌 진출 첫날부터 설계.',
  '3': '6개월 24주 — M1 시장 진단 → M2 BM 정립 → M3 MVP 개발 → M4 시장 검증 → M5 사업화 → M6 글로벌 진출. IMPACT 18 모듈 + ACT Canvas 54문항 + 5D 행동 지표. Action Week 격주 강제.',
  '7': '언더독스 11년간 200+ 프로그램, 20,211명 창업가 양성, 코치 261명, 전국 30개 거점, 동시 1,500명 교육, 신용등급 BB+, 누적 수주 400억, ESG 측정 1,800개 기업.',
}

async function main() {
  const { invokeAi } = await import('../src/lib/ai-fallback')
  const { safeParseJson } = await import('../src/lib/ai/parser')
  const { AI_TOKENS } = await import('../src/lib/ai/config')
  const { validateSlideSpec } = await import('../src/lib/diagrams/slide-pattern')

  // 학습 데이터 직접 로드 (learned-patterns.ts 와 동일 source)
  const learnedPath = path.join(process.cwd(), 'design-kit', 'learned-slide-patterns.json')
  const learned = fs.existsSync(learnedPath)
    ? JSON.parse(fs.readFileSync(learnedPath, 'utf-8'))
    : {}
  const targetBlocks = Math.round(learned.avgBlocksPerSlide ?? 9)
  const targetEvidence = Math.max(2, Math.round(learned.avgEvidencePerSlide ?? 3))
  const headlineExamples: string[] = (learned.headlineExamples ?? []).slice(0, 5)

  console.log(`▶ N2/O4 — 학습 역주입 밀도 검증`)
  console.log(`  학습 목표: ${targetBlocks} 도식 요소 · ${targetEvidence} 근거 / slide\n`)

  let validCount = 0
  let totalItems = 0
  let totalEvidence = 0
  let slideCount = 0

  for (const [num, body] of Object.entries(SECTIONS)) {
    const learnedPats = (learned.sectionPatterns?.[num] ?? []).map((p: any) => p.pattern)
    const prompt = buildPrompt(num, body, { targetBlocks, targetEvidence, headlineExamples, learnedPats })
    const t0 = Date.now()
    try {
      const r = await invokeAi({ prompt, maxTokens: AI_TOKENS.LARGE, temperature: 0.3, label: `n2-spec-${num}` })
      console.log(`§${num} (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
      const raw = safeParseJson<any>(r.raw, `n2-${num}`)
      const slides = Array.isArray(raw?.slides) ? raw.slides : []
      for (const s of slides) {
        const v = validateSlideSpec(s)
        if (v.ok) {
          validCount++
          slideCount++
          const items = countDiagramItems(v.spec.diagram)
          const ev = v.spec.evidence?.length ?? 0
          totalItems += items
          totalEvidence += ev
          console.log(`  ✓ [${v.spec.diagram.pattern}] items=${items} evidence=${ev} — ${v.spec.headline.slice(0, 50)}`)
        } else {
          console.log(`  ✗ ${v.error}`)
        }
      }
    } catch (e) {
      console.log(`  ✗ ${e instanceof Error ? e.message.slice(0, 80) : e}`)
    }
  }

  const avgItems = slideCount > 0 ? (totalItems / slideCount).toFixed(1) : '0'
  const avgEv = slideCount > 0 ? (totalEvidence / slideCount).toFixed(1) : '0'
  console.log(`\n[밀도 결과]`)
  console.log(`  valid slides: ${validCount}`)
  console.log(`  평균 도식 요소/slide: ${avgItems} (목표 ${targetBlocks})`)
  console.log(`  평균 근거/slide: ${avgEv} (목표 ${targetEvidence})`)

  const densityOK = parseFloat(avgItems) >= targetBlocks * 0.5 && parseFloat(avgEv) >= targetEvidence * 0.6
  console.log(densityOK ? `\n✅ PASS — 학습 밀도 근접` : `\n⚠ 밀도 미달 (prompt 추가 강화 검토)`)
  process.exit(validCount >= 3 ? 0 : 1)
}

function countDiagramItems(diagram: any): number {
  const d = diagram?.data
  if (!d) return 0
  if (d.steps) return d.steps.length
  if (d.kpis) return d.kpis.length
  if (d.quadrants) return d.quadrants.length
  if (d.children) return d.children.reduce((s: number, c: any) => s + 1 + (c.children?.length ?? 0), 0)
  if (d.tracks) return d.tracks.reduce((s: number, t: any) => s + (t.bars?.length ?? 0), 0)
  if (d.rows) return d.rows.length
  if (d.layers) return d.layers.reduce((s: number, l: any) => s + (l.items?.length ?? 0), 0)
  if (d.before || d.after) return (d.before?.metrics?.length ?? 0) + (d.after?.metrics?.length ?? 0) + 2
  return 0
}

function buildPrompt(
  num: string,
  body: string,
  opts: { targetBlocks: number; targetEvidence: number; headlineExamples: string[]; learnedPats: string[] },
): string {
  const LABELS: Record<string, string> = { '2': '02 추진 전략 및 방법론', '3': '03 교육 커리큘럼', '7': '07 수행 역량 및 실적' }
  return `
당신은 한국 사업 제안서 슬라이드 디자이너입니다. sections.${num} 본문으로 1-2 슬라이드 spec 생성.

⭐ 실제 당선 제안서 수준 콘텐츠 밀도: 도식 안에 충분한 정보(단계·항목·수치) ~${opts.targetBlocks}개, 근거 ~${opts.targetEvidence}건.
   헤드라인만 있는 빈약한 슬라이드 금지.

각 슬라이드: kicker="${LABELS[num]}" · headline(결론 먼저 30-100자) · diagram(데이터 충분히) · evidence(${opts.targetEvidence}건 내외)
${opts.headlineExamples.length ? `\n[당선 헤드라인 스타일 모방]\n${opts.headlineExamples.map((h, i) => `  ${i + 1}. ${h}`).join('\n')}` : ''}

[본문]
${body}

[이 섹션 당선 빈출 패턴]
${opts.learnedPats.length ? opts.learnedPats.join(' / ') : 'process-flow / kpi-grid / timeline'}

[패턴 데이터 예시]
process-flow: {"pattern":"process-flow","data":{"steps":[{"num":"M1","label":"...","description":"..."}, ...6개]}}
kpi-grid: {"pattern":"kpi-grid","data":{"columns":4,"kpis":[{"value":"20,211","label":"명","sublabel":"..."}, ...8개]}}
timeline: {"pattern":"timeline","data":{"units":["M1".."M6"],"tracks":[{"name":"교육","bars":[{"startIdx":0,"endIdx":1,"label":"x"}]}]}}
architecture-stack: {"pattern":"architecture-stack","data":{"layers":[{"name":"...","items":["a","b","c"]}, ...]}}
comparison-table: {"pattern":"comparison-table","data":{"leftLabel":"시장평균","rightLabel":"언더독스","rows":[{"dim":"...","left":"...","right":"...","advantageOnRight":true}, ...]}}

[출력 JSON]
{ "slides": [ { "kicker":"${LABELS[num]}", "headline":"...", "diagram":{"pattern":"...","data":{...}}, "evidence":[{"text":"...","source":"..."}], "sectionNum":"${num}", "order":1 } ] }
JSON 만.
`.trim()
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
