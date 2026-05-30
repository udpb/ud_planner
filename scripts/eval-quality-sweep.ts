/**
 * scripts/eval-quality-sweep.ts — 평가위원 패널 품질 스윕 (15H-Phase2, 2026-06-01)
 *
 * 다양 RFP(eval-rfps.json) → produceUltimateDraft 생성 → **독립 LLM 평가위원 패널**이
 * 우리 Inspector 와 별개로 섹션·차원별 채점 → 약점 집계 리포트.
 *
 * 우리 Inspector(self-grade) 와 분리한 외부 시선 — 알파테스트 readiness 의 객관 측정.
 * 재개: scripts/eval-results/<label>.json 있으면 skip. 결과는 gitignore.
 * server-only → NODE_OPTIONS=--conditions=react-server 로 실행.
 *
 * 사용: NODE_OPTIONS=--conditions=react-server npx tsx scripts/eval-quality-sweep.ts [--limit N]
 */
import { config } from 'dotenv'
config({ path: '.env' })
config({ path: '.env.local', override: true })

import * as fs from 'node:fs'
import * as path from 'node:path'

const argv = process.argv.slice(2)
const arg = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined }
const LIMIT = arg('--limit') ? parseInt(arg('--limit')!, 10) : Infinity
const RESULTS_DIR = path.join(process.cwd(), 'scripts/eval-results')

const PANEL_PROMPT = (rfp: any, draft: any) => `
당신은 한국 정부·대기업 사업 제안 **평가위원**입니다. 아래 제안 1차본을 냉정하게 채점하세요.
(작성사의 self-check 가 아니라, 외부 평가위원 시선 — 후하지 말 것)

[RFP 요지]
사업명: ${rfp.projectName} · 발주처: ${rfp.client} · 채널: ${rfp.projectType}
대상: ${rfp.targetAudience} (${rfp.targetCount}명) · 예산: ${(rfp.totalBudgetVat ?? 0).toLocaleString()}원
목표: ${(rfp.objectives ?? []).join(' / ')}
평가표: ${(rfp.evalCriteria ?? []).map((c: any) => `${c.item}(${c.score})`).join(' · ')}

[제출 1차본 — 7 섹션]
${Object.entries(draft.sections ?? {}).map(([k, v]) => `### §${k}\n${String(v).slice(0, 900)}`).join('\n\n')}

[핵심 메시지] ${(draft.keyMessages ?? []).join(' / ') || '(없음)'}
[슬라이드 도식] ${(draft.slideSpecs ?? []).map((s: any) => s?.diagram?.pattern).filter(Boolean).join(', ') || '(없음)'}

──────────────────
[채점 — 각 0~100, 평가위원 기준]
- logic: 논리 흐름·인과 (배경→전략→커리큘럼→운영→성과 가 한 흐름인가)
- quant: 정량 근거 밀도·신뢰성 (수치·출처·KPI 측정방법)
- concreteness: 실행 구체성 (회차·일정·장소·행사·산출물이 그려지는가)
- operations: 운영 안정성 (PMO·보고체계·리스크·인력 — '사업을 굴리는 힘')
- winningLanguage: 당선 제안서 수준의 설득 언어·자신감 (카탈로그 톤 X)
- differentiation: 경쟁 대비 차별 (회사명 직접 비교 없이도 명확한가)
- fit: RFP 요구·평가표 대응도

[출력 JSON — 이것만, 펜스 X]
{
  "scores": {"logic":N,"quant":N,"concreteness":N,"operations":N,"winningLanguage":N,"differentiation":N,"fit":N},
  "overall": N,
  "verdict": "당선권/보완필요/미흡 중 1",
  "weakest": [{"lens":"...","why":"한 문장 진단","fix":"구체 개선 1줄"}, ... 최대 3],
  "strengths": ["...","..."]
}
`.trim()

async function main() {
  fs.mkdirSync(RESULTS_DIR, { recursive: true })
  const { produceUltimateDraft } = await import('../src/lib/express/produce-ultimate-draft')
  const { invokeAi } = await import('../src/lib/ai-fallback')
  const { AI_TOKENS } = await import('../src/lib/ai/config')
  const { safeParseJson } = await import('../src/lib/ai/parser')

  const rfps = JSON.parse(fs.readFileSync('scripts/fixtures/eval-rfps.json', 'utf-8')) as any[]
  console.log(`▶ 평가위원 품질 스윕 — RFP ${rfps.length}건 (limit ${LIMIT})`)

  let done = 0
  for (const item of rfps) {
    if (done >= LIMIT) break
    const outPath = path.join(RESULTS_DIR, `${item.label}.json`)
    if (fs.existsSync(outPath)) { console.log(`  skip(기존) ${item.label}`); continue }
    console.log(`\n  ▶ ${item.label} — 생성 중...`)
    try {
      const t0 = Date.now()
      const { draft, inspection } = await produceUltimateDraft({
        rfp: item.rfp, channel: item.channel, slotInputs: item.slotInputs ?? [], pmInputs: null,
        onProgress: () => {},
      })
      const genS = Math.round((Date.now() - t0) / 1000)
      // 평가위원 패널 채점
      const r = await invokeAi({ prompt: PANEL_PROMPT(item.rfp, draft), maxTokens: AI_TOKENS.STANDARD, temperature: 0.3, label: `panel-${item.label}` })
      const panel = safeParseJson<any>(r.raw, `panel-${item.label}`)
      const result = {
        label: item.label, channel: item.channel,
        ourInspector: inspection ? { overallScore: inspection.overallScore, passed: inspection.passed } : null,
        panel: panel ?? { error: 'parse fail' },
        meta: { sections: Object.keys(draft.sections ?? {}).length, slideSpecs: (draft.slideSpecs ?? []).length, keyMessages: (draft.keyMessages ?? []).length, genS },
        draftSections: draft.sections,
      }
      fs.writeFileSync(outPath, JSON.stringify(result, null, 2))
      done++
      console.log(`  ✓ ${item.label} (${genS}s) — 우리Inspector ${result.ourInspector?.overallScore ?? '?'} · 패널 ${panel?.overall ?? '?'} [${panel?.verdict ?? '?'}]`)
    } catch (e) {
      console.warn(`  ✗ ${item.label} — ${e instanceof Error ? e.message.slice(0, 100) : e}`)
    }
  }

  // 집계
  const files = fs.readdirSync(RESULTS_DIR).filter((f) => f.endsWith('.json') && f !== '_summary.json')
  const all = files.map((f) => JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, f), 'utf-8')))
  const lensAgg: Record<string, number[]> = {}
  const weakCount: Record<string, number> = {}
  for (const r of all) {
    const sc = r.panel?.scores ?? {}
    for (const [k, v] of Object.entries(sc)) { (lensAgg[k] ??= []).push(Number(v)) }
    for (const w of r.panel?.weakest ?? []) { if (w?.lens) weakCount[w.lens] = (weakCount[w.lens] ?? 0) + 1 }
  }
  const lensAvg = Object.fromEntries(Object.entries(lensAgg).map(([k, vs]) => [k, Math.round(vs.reduce((a, b) => a + b, 0) / vs.length)]))
  const summary = {
    n: all.length,
    panelOverallAvg: Math.round(all.reduce((a, r) => a + (r.panel?.overall ?? 0), 0) / Math.max(all.length, 1)),
    ourInspectorAvg: Math.round(all.reduce((a, r) => a + (r.ourInspector?.overallScore ?? 0), 0) / Math.max(all.length, 1)),
    lensAvg,
    weakestLensFreq: Object.fromEntries(Object.entries(weakCount).sort((a, b) => b[1] - a[1])),
    perRfp: all.map((r) => ({ label: r.label, panel: r.panel?.overall, verdict: r.panel?.verdict, ours: r.ourInspector?.overallScore })),
  }
  fs.writeFileSync(path.join(RESULTS_DIR, '_summary.json'), JSON.stringify(summary, null, 2))
  console.log(`\n[집계 — ${all.length}건]`)
  console.log(`  패널 평균 ${summary.panelOverallAvg} · 우리 Inspector 평균 ${summary.ourInspectorAvg}`)
  console.log(`  lens 평균: ${JSON.stringify(lensAvg)}`)
  console.log(`  최빈 약점: ${JSON.stringify(summary.weakestLensFreq)}`)
  await import('../src/lib/prisma').then(({ prisma }) => prisma.$disconnect())
}
main().catch((e) => { console.error('FATAL:', e instanceof Error ? e.stack : e); process.exitCode = 1 })
