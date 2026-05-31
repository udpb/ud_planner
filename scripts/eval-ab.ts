/**
 * scripts/eval-ab.ts — Flash-only vs Flash+Pro 하이브리드 A/B (EVAL-AB, 2026-06-01)
 *
 * 새 엔진(`generateDraft`)으로 같은 RFP 3건을 생성하고 **고정 Pro 평가위원 패널**로 채점한다.
 *   arm = EVAL_ALL_FLASH==='true' ? 'flash'(전부 flash) : 'hybrid'(Pro 2키 라우팅)
 *
 * judge(패널)는 **양 arm 공통 Pro 고정**(gemini-3.1-pro-preview) — 공정 비교. modelFor 안 씀.
 * 생성만 arm별 모델(EVAL_ALL_FLASH가 modelFor를 좌우 — 모듈 로드 시 const라 프로세스 분리 필수).
 *
 * Pro-call 카운트(arm B 참고용): generateDraft 동안 console 로그('[ai] Gemini 성공 ... model="...pro..."')를
 * 비침습적으로 가로채 Pro 모델명 매칭 횟수 집계. 엔진/invokeAi 무변경.
 *
 * server-only → NODE_OPTIONS=--conditions=react-server 로 실행.
 *
 * 사용:
 *   EVAL_ALL_FLASH=true NODE_OPTIONS=--conditions=react-server npx tsx scripts/eval-ab.ts   # arm A (flash)
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/eval-ab.ts                         # arm B (hybrid)
 */
import { config } from 'dotenv'
config({ path: '.env' })
config({ path: '.env.local', override: true })

import * as fs from 'node:fs'
import * as path from 'node:path'

// ── arm 결정 (EVAL_ALL_FLASH는 ai/config가 모듈 로드 시 읽는 const) ──
const ARM: 'flash' | 'hybrid' = process.env.EVAL_ALL_FLASH === 'true' ? 'flash' : 'hybrid'
const RESULTS_DIR = path.join(process.cwd(), `eval-results-ab-${ARM}`)

// 비교 대상 라벨 (diverse 3채널 — eval-quality-sweep.ts와 동일 fixture)
const TARGET_LABELS = ['B2G-청년창업-중예산', 'B2B-대기업CSR-소셜임팩트', 'renewal-연속사업-운영']

// 패널 judge 고정 Pro (공정 비교 — modelFor 안 씀)
const PANEL_JUDGE_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.1-pro-preview'

// ── PANEL_PROMPT (eval-quality-sweep.ts와 동일 — 재사용 import 안 되므로 복사) ──
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
      /* 카운트 실패해도 로깅은 계속 */
    }
    originalLog(...(args as []))
  }
}

async function main() {
  installProCounter()
  fs.mkdirSync(RESULTS_DIR, { recursive: true })

  const { generateDraft } = await import('../src/lib/express/engine')
  const { invokeAi } = await import('../src/lib/ai-fallback')
  const { AI_TOKENS, EVAL_ALL_FLASH, FLASH_MODEL } = await import('../src/lib/ai/config')
  const { safeParseJson } = await import('../src/lib/ai/parser')
  const { WORKSTREAM_SCORING } = await import('../src/lib/workstream/types')

  originalLog(
    `▶ EVAL-AB arm=${ARM} (EVAL_ALL_FLASH=${EVAL_ALL_FLASH}) · 생성모델=${EVAL_ALL_FLASH ? FLASH_MODEL : 'Pro 2키 라우팅'} · judge(고정)=${PANEL_JUDGE_MODEL}`,
  )

  const allRfps = JSON.parse(
    fs.readFileSync('scripts/fixtures/eval-rfps.json', 'utf-8'),
  ) as any[]
  const rfps = allRfps.filter((r) => TARGET_LABELS.includes(r.label))
  originalLog(`  대상 RFP ${rfps.length}건: ${rfps.map((r) => r.label).join(', ')}`)

  // 최소 EngineInput 구성 — 인라인 과업 2개(education + event_ops). DB 미사용(ensureDefault 건너뜀).
  function buildWorkstreams(projectId: string) {
    const now = new Date()
    const mk = (type: 'education' | 'event_ops', order: number) => ({
      id: `${projectId}-ws-${type}`,
      projectId,
      type,
      scoringCategory: WORKSTREAM_SCORING[type],
      order,
      detail: {},
      budgetSliceKrw: null,
      autoFillRatio: 0,
      createdAt: now,
      updatedAt: now,
    })
    return [mk('education', 0), mk('event_ops', 1)] as any[]
  }

  for (const item of rfps) {
    const outPath = path.join(RESULTS_DIR, `${item.label}.json`)
    if (fs.existsSync(outPath)) {
      originalLog(`  skip(기존) ${item.label}`)
      continue
    }
    originalLog(`\n  ▶ ${item.label} — 생성 시작 (arm=${ARM})...`)
    try {
      const projectId = `eval-ab-${ARM}-${item.label}`
      const t0 = Date.now()

      // Pro-call 카운트는 generateDraft 동안만 (패널 judge 제외)
      proCallCounter = 0
      countingActive = true
      const { draft, score, iterations } = await generateDraft({
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

      // ── 고정 Pro 평가위원 패널 채점 (양 arm 공통) ──
      const r = await invokeAi({
        prompt: PANEL_PROMPT(item.rfp, draft),
        model: PANEL_JUDGE_MODEL,
        maxTokens: AI_TOKENS.STANDARD,
        temperature: 0.3,
        label: `panel-${item.label}`,
      })
      const panel = safeParseJson<any>(r.raw, `panel-${item.label}`)

      const result = {
        label: item.label,
        channel: item.channel,
        arm: ARM,
        selfScore: { overall: score.overall, weakest: score.weakest, iterations },
        panel: panel ?? { error: 'parse fail' },
        panelJudgeModel: r.model,
        proCallsDuringGen: genProCalls,
        elapsedMs,
        meta: {
          sections: Object.keys(draft.sections ?? {}).length,
          keyMessages: (draft.keyMessages ?? []).length,
        },
        draftSections: draft.sections,
        keyMessages: draft.keyMessages,
      }
      fs.writeFileSync(outPath, JSON.stringify(result, null, 2))
      originalLog(
        `  ✓ ${item.label} (${Math.round(elapsedMs / 1000)}s · ProCalls=${genProCalls} · iter=${iterations}) — self ${score.overall} · 패널 ${panel?.overall ?? '?'} [${panel?.verdict ?? '?'}]`,
      )
    } catch (e) {
      countingActive = false
      originalLog(`  ✗ ${item.label} — FAIL: ${e instanceof Error ? e.message.slice(0, 200) : e}`)
      // 실패 사유도 파일로 남김 (부분 결과 보고용)
      fs.writeFileSync(
        path.join(RESULTS_DIR, `${item.label}.FAIL.json`),
        JSON.stringify(
          { label: item.label, arm: ARM, error: e instanceof Error ? e.message : String(e) },
          null,
          2,
        ),
      )
    }
  }

  originalLog(`\n[arm=${ARM} 완료] 결과: ${RESULTS_DIR}`)
  await import('../src/lib/prisma').then(({ prisma }) => prisma.$disconnect()).catch(() => {})
}

main().catch((e) => {
  console.error('FATAL:', e instanceof Error ? e.stack : e)
  process.exitCode = 1
})
