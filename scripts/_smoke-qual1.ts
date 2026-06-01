/**
 * scripts/_smoke-qual1.ts — QUAL-1 측정 (evidence·differentiation 렌즈 Δ, 실행 후 삭제)
 *
 * 2 RFP(B2G-청년창업·B2B-CSR) × generateDraft → 다중샘플 self-score(8 렌즈, evidence·
 * differentiation 포함) + 고정 Pro 평가위원 패널(7 렌즈). EVAL-1 baseline(evidence 45·
 * differentiation 48) 대비 Δ 중심 보고 + overall + Pro 콜수(win-theme 이제 Pro).
 *
 * 결과는 stdout 단일 라인으로 즉시 emit(EVAL-1 monitor 누락 교훈). server-only →
 * NODE_OPTIONS=--conditions=react-server.
 *
 * 사용:
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/_smoke-qual1.ts
 */
import { config } from 'dotenv'
config({ path: '.env' })
config({ path: '.env.local', override: true })

import * as fs from 'node:fs'

// EVAL-1 baseline (self-score 다중샘플 렌즈) — 본 브리프 §Context
const BASELINE = { evidence: 45, differentiation: 48 } as const

const TARGET_LABELS = ['B2G-청년창업-중예산', 'B2B-대기업CSR-소셜임팩트']

const PANEL_JUDGE_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.1-pro-preview'

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

──────────────────
[채점 — 각 0~100, 평가위원 기준]
- logic: 논리 흐름·인과
- quant: 정량 근거 밀도·신뢰성
- concreteness: 실행 구체성
- operations: 운영 안정성
- winningLanguage: 당선 제안서 수준의 설득 언어
- differentiation: 경쟁 대비 차별 (회사명 직접 비교 없이도 명확한가)
- fit: RFP 요구·평가표 대응도

[출력 JSON — 이것만, 펜스 X]
{ "scores": {"logic":N,"quant":N,"concreteness":N,"operations":N,"winningLanguage":N,"differentiation":N,"fit":N}, "overall": N, "verdict": "당선권/보완필요/미흡 중 1" }
`.trim()

// ── Pro-call 카운터: console.log 가로채 Gemini 성공 + Pro 모델 매칭 ──
let proCallCounter = 0
let countingActive = false
const originalLog = console.log.bind(console)
const PRO_PATTERN = /Gemini.*성공/
function installProCounter() {
  console.log = (...args: unknown[]) => {
    try {
      const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
      if (countingActive && PRO_PATTERN.test(line) && line.includes(PANEL_JUDGE_MODEL)) {
        proCallCounter++
      }
    } catch {
      /* 카운트 실패해도 로깅 계속 */
    }
    originalLog(...(args as []))
  }
}

function emit(obj: Record<string, unknown>) {
  // 단일 라인 즉시 출력 (monitor 누락 방지)
  originalLog('QUAL1_RESULT ' + JSON.stringify(obj))
}

async function main() {
  installProCounter()

  const { generateDraft } = await import('../src/lib/express/engine')
  const { invokeAi } = await import('../src/lib/ai-fallback')
  const { AI_TOKENS } = await import('../src/lib/ai/config')
  const { safeParseJson } = await import('../src/lib/ai/parser')
  const { WORKSTREAM_SCORING } = await import('../src/lib/workstream/types')

  originalLog(`▶ QUAL-1 smoke — judge(고정 Pro)=${PANEL_JUDGE_MODEL} · win-theme=Pro · baseline evidence=${BASELINE.evidence}·differentiation=${BASELINE.differentiation}`)

  const allRfps = JSON.parse(fs.readFileSync('scripts/fixtures/eval-rfps.json', 'utf-8')) as any[]
  const rfps = allRfps.filter((r) => TARGET_LABELS.includes(r.label))
  originalLog(`  대상 RFP ${rfps.length}건: ${rfps.map((r) => r.label).join(', ')}`)

  function buildWorkstreams(projectId: string) {
    const now = new Date()
    const mk = (type: 'education' | 'event_ops', order: number) => ({
      id: `${projectId}-ws-${type}`,
      projectId,
      type,
      scoringCategory: (WORKSTREAM_SCORING as any)[type],
      order,
      detail: {},
      budgetSliceKrw: null,
      autoFillRatio: 0,
      createdAt: now,
      updatedAt: now,
    })
    return [mk('education', 0), mk('event_ops', 1)] as any[]
  }

  const agg: Record<string, { evidence: number; differentiation: number; overall: number; panelDiff: number; panelOverall: number; proCalls: number }> = {}

  for (const item of rfps) {
    originalLog(`\n  ▶ ${item.label} — 생성 시작...`)
    try {
      const projectId = `qual1-${item.label}`
      const t0 = Date.now()
      proCallCounter = 0
      countingActive = true
      const { draft, score, iterations, winThemes } = await generateDraft({
        projectId,
        rfp: item.rfp,
        channel: item.channel,
        workstreams: buildWorkstreams(projectId),
        profile: null,
        pmInputs: null,
        onProgress: (step: string, detail: string) => originalLog(`     [${step}] ${detail}`),
      })
      countingActive = false
      const genProCalls = proCallCounter
      const elapsedMs = Date.now() - t0

      const lineOf = (k: string) => score.lines.find((l) => l.key === k)?.score ?? null
      const selfEvidence = lineOf('evidence')
      const selfDiff = lineOf('differentiation')

      // 고정 Pro 패널 (참고용 differentiation 교차검증)
      let panel: any = null
      try {
        const r = await invokeAi({
          prompt: PANEL_PROMPT(item.rfp, draft),
          model: PANEL_JUDGE_MODEL,
          maxTokens: AI_TOKENS.STANDARD,
          temperature: 0.3,
          label: `qual1-panel-${item.label}`,
        })
        panel = safeParseJson<any>(r.raw, `qual1-panel-${item.label}`)
      } catch (e) {
        originalLog(`     패널 채점 실패: ${e instanceof Error ? e.message.slice(0, 120) : e}`)
      }

      agg[item.label] = {
        evidence: selfEvidence ?? -1,
        differentiation: selfDiff ?? -1,
        overall: score.overall,
        panelDiff: panel?.scores?.differentiation ?? -1,
        panelOverall: panel?.overall ?? -1,
        proCalls: genProCalls,
      }

      // 즉시 단일 라인 emit
      emit({
        label: item.label,
        self_evidence: selfEvidence,
        self_evidence_delta: selfEvidence != null ? selfEvidence - BASELINE.evidence : null,
        self_differentiation: selfDiff,
        self_differentiation_delta: selfDiff != null ? selfDiff - BASELINE.differentiation : null,
        self_overall: score.overall,
        panel_differentiation: panel?.scores?.differentiation ?? null,
        panel_overall: panel?.overall ?? null,
        panel_verdict: panel?.verdict ?? null,
        winThemes: (winThemes ?? []).length,
        iterations,
        proCallsDuringGen: genProCalls,
        elapsedSec: Math.round(elapsedMs / 1000),
        allLines: Object.fromEntries(score.lines.map((l) => [l.key, l.score])),
      })
    } catch (e) {
      countingActive = false
      emit({ label: item.label, error: e instanceof Error ? e.message.slice(0, 300) : String(e) })
    }
  }

  // 집계 요약 (단일 라인)
  const labels = Object.keys(agg)
  if (labels.length > 0) {
    const avg = (f: (v: (typeof agg)[string]) => number) =>
      Math.round((labels.reduce((s, l) => s + f(agg[l]), 0) / labels.length) * 10) / 10
    emit({
      SUMMARY: true,
      n: labels.length,
      baseline_evidence: BASELINE.evidence,
      avg_self_evidence: avg((v) => v.evidence),
      avg_self_evidence_delta: Math.round((avg((v) => v.evidence) - BASELINE.evidence) * 10) / 10,
      baseline_differentiation: BASELINE.differentiation,
      avg_self_differentiation: avg((v) => v.differentiation),
      avg_self_differentiation_delta: Math.round((avg((v) => v.differentiation) - BASELINE.differentiation) * 10) / 10,
      avg_self_overall: avg((v) => v.overall),
      avg_panel_differentiation: avg((v) => v.panelDiff),
      avg_panel_overall: avg((v) => v.panelOverall),
      total_proCalls_gen: labels.reduce((s, l) => s + agg[l].proCalls, 0),
    })
  }

  await import('../src/lib/prisma').then(({ prisma }) => prisma.$disconnect()).catch(() => {})
}

main().catch((e) => {
  console.error('FATAL:', e instanceof Error ? e.stack : e)
  process.exitCode = 1
})
