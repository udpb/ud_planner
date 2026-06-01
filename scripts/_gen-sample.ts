/**
 * scripts/_gen-sample.ts — QUAL-2 샘플 1차본 생성 + 도식 PPTX 렌더 (유지 — 메인이 재실행·산출물 확인)
 *
 * B2G-청년창업 fixture → 강화된 엔진(generateDraft: §2 named 컨셉 · §3 주차 커리큘럼 표·
 * 전체 타임라인·실행계획 + slideSpecs 자동 생성) → 산출물 2종:
 *   1. docs/sample-draft-B2G-v2.md   — markdown 1차본 (사용자 직접 검증)
 *   2. docs/sample-draft-B2G-v2.pptx — buildPptx 로 렌더한 도식 PPTX (사용자가 도식 검증)
 *
 * 로깅: 섹션 길이 · §3 주차 테이블 유무 · slideSpecs 개수 + 패턴 목록 · self/panel(선택).
 *
 * server-only 진입 → NODE_OPTIONS=--conditions=react-server 필요.
 *
 * 사용:
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/_gen-sample.ts
 */
import { config } from 'dotenv'
config({ path: '.env' })
config({ path: '.env.local', override: true })

import * as fs from 'node:fs'
import * as path from 'node:path'

const TARGET_LABEL = 'B2G-청년창업-중예산'
const OUT_MD = 'docs/sample-draft-B2G-v2.md'
const OUT_PPTX = 'docs/sample-draft-B2G-v2.pptx'

const PANEL_JUDGE_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.1-pro-preview'

const SECTION_LABELS_KO: Record<string, string> = {
  '1': '제안 배경 및 목적',
  '2': '추진 전략 및 방법론',
  '3': '사업 내용',
  '4': '운영 체계 및 코치진',
  '5': '예산 및 경제성',
  '6': '기대 성과 및 임팩트',
  '7': '수행 역량 및 실적',
}

const PANEL_PROMPT = (rfp: any, draft: any) => `
당신은 한국 정부 사업 제안 **평가위원**입니다. 아래 제안 1차본을 냉정하게 채점하세요.
(작성사의 self-check 가 아니라, 외부 평가위원 시선 — 후하지 말 것)

[RFP 요지]
사업명: ${rfp.projectName} · 발주처: ${rfp.client} · 채널: ${rfp.projectType}
대상: ${rfp.targetAudience} (${rfp.targetCount}명)
목표: ${(rfp.objectives ?? []).join(' / ')}
평가표: ${(rfp.evalCriteria ?? []).map((c: any) => `${c.item}(${c.score})`).join(' · ')}

[제출 1차본 — 7 섹션]
${Object.entries(draft.sections ?? {}).map(([k, v]) => `### §${k}\n${String(v).slice(0, 900)}`).join('\n\n')}

[핵심 메시지] ${(draft.keyMessages ?? []).join(' / ') || '(없음)'}

──────────────────
[채점 — 각 0~100, 평가위원 기준 · 특히 QUAL-2 4 차원에 주목]
- curriculumSpecificity: 커리큘럼 구체성(주차·산출물·도구)
- timeline: 전체 타임라인·마일스톤·단계 명확성
- executionDetail: 세부 실행계획(누가·언제·무엇을)
- conceptAppeal: 메인 솔루션 컨셉의 매력·기억성
- overall 종합

[출력 JSON — 이것만, 펜스 X]
{ "scores": {"curriculumSpecificity":N,"timeline":N,"executionDetail":N,"conceptAppeal":N}, "overall": N, "verdict": "당선권/보완필요/미흡 중 1", "comment": "한 줄 총평" }
`.trim()

function renderMarkdown(rfp: any, draft: any, score: any, panel: any): string {
  const lines: string[] = []
  lines.push(`# [샘플 1차본 v2] ${rfp.projectName} — 엔진 생성물 (QUAL-2)`)
  lines.push('')
  lines.push(`> 엔진 자동 생성 · self-score ${score?.overall ?? '?'} / 외부 패널 ${panel?.overall ?? '?'} (${panel?.verdict ?? '미측정'})`)
  lines.push(`> QUAL-2 강화: §2 named 컨셉 · §3 주차 커리큘럼 표·전체 타임라인·실행계획 · slideSpecs 도식.`)
  lines.push(`> ⚠️ fixture RFP + 얕은 매칭 코퍼스 기준. 실 RFP·실 자산이면 더 높을 수 있음.`)
  lines.push('')
  if (Array.isArray(draft.keyMessages) && draft.keyMessages.length > 0) {
    lines.push('## 핵심 메시지')
    draft.keyMessages.forEach((m: string, i: number) => lines.push(`${i + 1}. ${m}`))
    lines.push('')
  }
  lines.push('---')
  lines.push('')
  for (const k of ['1', '2', '3', '4', '5', '6', '7']) {
    const body = draft.sections?.[k]
    if (!body) continue
    lines.push(`## ${k}. ${SECTION_LABELS_KO[k]}`)
    lines.push('')
    lines.push(String(body).trim())
    lines.push('')
  }
  // slideSpecs 요약 (도식 PPTX 대응)
  if (Array.isArray(draft.slideSpecs) && draft.slideSpecs.length > 0) {
    lines.push('---')
    lines.push('')
    lines.push('## [부록] 도식 슬라이드 spec (→ .pptx 로 렌더됨)')
    lines.push('')
    for (const s of draft.slideSpecs) {
      lines.push(`- **${s.kicker}** · \`${s.diagram?.pattern}\` — ${s.headline}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

function hasWeekTable(section3: string | undefined): boolean {
  if (!section3) return false
  // 마크다운 표(파이프 헤더 + 구분선) + 주차 라벨(W1·1주 등) 동시 존재.
  // 구분선은 `|---|` 와 정렬형 `| :--- |` 둘 다 허용(콜론 포함).
  const hasPipeTable = /\|.*\|.*\|/.test(section3)
  const hasSeparator = /\|[\s:-]*-{2,}[\s:-]*\|/.test(section3)
  const hasWeekLabel = /\bW\d|주\s*차|\d+\s*주|W\d+~W\d+/.test(section3)
  return hasPipeTable && hasSeparator && hasWeekLabel
}

async function main() {
  const { generateDraft } = await import('../src/lib/express/engine')
  const { buildPptx } = await import('../src/lib/diagrams/pptx-builder')
  const { invokeAi } = await import('../src/lib/ai-fallback')
  const { AI_TOKENS } = await import('../src/lib/ai/config')
  const { safeParseJson } = await import('../src/lib/ai/parser')
  const { WORKSTREAM_SCORING } = await import('../src/lib/workstream/types')

  console.log(`▶ QUAL-2 sample — judge=${PANEL_JUDGE_MODEL} · target=${TARGET_LABEL}`)

  const allRfps = JSON.parse(fs.readFileSync('scripts/fixtures/eval-rfps.json', 'utf-8')) as any[]
  const item = allRfps.find((r) => r.label === TARGET_LABEL)
  if (!item) throw new Error(`fixture ${TARGET_LABEL} 없음`)

  const projectId = `qual2-${TARGET_LABEL}`
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
  const workstreams = [mk('education', 0), mk('event_ops', 1)] as any[]

  const t0 = Date.now()
  const { draft, score, iterations } = await generateDraft({
    projectId,
    rfp: item.rfp,
    channel: item.channel,
    workstreams,
    profile: null,
    pmInputs: null,
    onProgress: (step: string, detail: string) => console.log(`   [${step}] ${detail}`),
  })
  const genSec = Math.round((Date.now() - t0) / 1000)

  // ── 외부 패널 채점 (선택) ──
  let panel: any = null
  try {
    const r = await invokeAi({
      prompt: PANEL_PROMPT(item.rfp, draft),
      model: PANEL_JUDGE_MODEL,
      maxTokens: AI_TOKENS.STANDARD,
      temperature: 0.3,
      label: 'qual2-panel',
    })
    panel = safeParseJson<any>(r.raw, 'qual2-panel')
  } catch (e) {
    console.log(`   패널 채점 실패: ${e instanceof Error ? e.message.slice(0, 120) : e}`)
  }

  // ── markdown 저장 ──
  const md = renderMarkdown(item.rfp, draft, score, panel)
  fs.mkdirSync(path.dirname(OUT_MD), { recursive: true })
  fs.writeFileSync(OUT_MD, md, 'utf-8')

  // ── PPTX 저장 (buildPptx) ──
  const buf = await buildPptx({
    projectName: item.rfp.projectName,
    clientName: item.rfp.client,
    intent: draft.intent,
    sections: draft.sections as Record<string, string> | undefined,
    slideSpecs: Array.isArray(draft.slideSpecs)
      ? (draft.slideSpecs as unknown as Parameters<typeof buildPptx>[0]['slideSpecs'])
      : undefined,
  })
  fs.writeFileSync(OUT_PPTX, new Uint8Array(buf))

  // ── 로깅 ──
  const sectionLens = Object.fromEntries(
    ['1', '2', '3', '4', '5', '6', '7'].map((k) => [k, (draft.sections?.[k] ?? '').length]),
  )
  const specs = Array.isArray(draft.slideSpecs) ? draft.slideSpecs : []
  const patterns = [...new Set(specs.map((s: any) => s.diagram?.pattern))]

  console.log('\n══════════ QUAL-2 결과 ══════════')
  console.log(JSON.stringify({
    label: TARGET_LABEL,
    elapsedSec: genSec,
    iterations,
    self_overall: score.overall,
    self_lines: Object.fromEntries(score.lines.map((l: any) => [l.key, l.score])),
    panel_scores: panel?.scores ?? null,
    panel_overall: panel?.overall ?? null,
    panel_verdict: panel?.verdict ?? null,
    panel_comment: panel?.comment ?? null,
    sectionLengths: sectionLens,
    section3_hasWeekTable: hasWeekTable(draft.sections?.['3']),
    slideSpecsCount: specs.length,
    slideSpecsPatterns: patterns,
    md_bytes: Buffer.byteLength(md, 'utf-8'),
    pptx_bytes: buf.length,
    md_path: OUT_MD,
    pptx_path: OUT_PPTX,
  }, null, 2))
  console.log('══════════════════════════════════')

  await import('../src/lib/prisma').then(({ prisma }) => prisma.$disconnect()).catch(() => {})
}

main().catch((e) => {
  console.error('FATAL:', e instanceof Error ? e.stack : e)
  process.exitCode = 1
})
