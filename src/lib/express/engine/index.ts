/**
 * 단일 생성 엔진 — 조립 (EX-1, ADR-021, Tech Spec §5)
 *
 *   generateDraft(input):
 *     if workstreams empty → ensureDefaultWorkstream → reload
 *     evidence = gather(input)                         // RET-1
 *     draft    = assemble(input, evidence)             // plan-then-write (Pro)
 *     for i in 1..MAX_REFINE:
 *       score = selfScore(draft)                       // Pro judge
 *       if score.overall >= THRESHOLD: break
 *       draft = refineWeakest(draft, score.weakest)    // 약점 섹션만 재작성 (Pro)
 *     return { draft, score, iterations }
 *
 * 동시성: 섹션 작성·정제는 순차(공유 memory·429 회피). 직접 SDK 금지 — 전부 invokeAi.
 *
 * 범위 밖(보고만): verify faithfulness gate·typed WinTheme·compliance matrix = EX-2.
 *   full panel·calibration = EVAL-1.
 */

import 'server-only'

import { prisma } from '@/lib/prisma'
import { ensureDefaultWorkstream } from '@/lib/workstream/ensure-default'
import { log } from '@/lib/logger'
import type { Workstream } from '@prisma/client'
import type { ExpressDraft, SectionKey } from '../schema'
import type { EngineInput, EngineResult, EvidencePool, SelfScore } from './types'
import { retrieve } from '@/lib/retrieval'
import { gather } from './gather'
import { assemble, writeSection, planOutline } from './assemble'
import { selfScore, SCORE_THRESHOLD, MAX_REFINE } from './self-score'
import { generateWinThemes } from './win-theme'
import { buildComplianceMatrix } from './compliance'
import { verifyDraft } from './verify'

/**
 * Rubric 라인 키 → 영향 섹션. weakest 가 라인 키('strategy' 등)면 섹션으로 매핑.
 * 섹션 키('1'~'7')는 그대로 통과.
 */
const LINE_TO_SECTIONS: Record<string, SectionKey[]> = {
  compliance: ['1', '2'],
  understanding: ['1', '2'],
  strategy: ['2', '3'],
  differentiation: ['2', '7'],
  evidence: ['1', '6', '7'],
  impact: ['6'],
  risk: ['4'],
  ergonomics: ['1', '2', '3', '4', '5', '6', '7'],
}

const SECTION_SET = new Set<SectionKey>(['1', '2', '3', '4', '5', '6', '7'])

/** weakest 목록(섹션 키·라인 키 혼재) → 재작성 대상 섹션 키 집합. */
function resolveWeakSections(weakest: string[]): SectionKey[] {
  const out = new Set<SectionKey>()
  for (const w of weakest) {
    if (SECTION_SET.has(w as SectionKey)) {
      out.add(w as SectionKey)
    } else if (LINE_TO_SECTIONS[w]) {
      // ergonomics 는 전 섹션 대상이라 폭주 방지: 1개만
      const mapped = w === 'ergonomics' ? LINE_TO_SECTIONS[w].slice(0, 1) : LINE_TO_SECTIONS[w]
      mapped.forEach((s) => out.add(s))
    }
  }
  // 정제는 약점 집중 — 최대 3 섹션
  return [...out].slice(0, 3)
}

/**
 * weakest(라인·섹션 키 혼재)에 해당하는 judge 피드백을 모아 refine 지침으로 포맷.
 * 약점 라인의 "왜 낮은지" 진단을 writeSection memory 에 주입 → 타깃 개선.
 */
function weakLensGuide(weakest: string[], lineFeedback?: Record<string, string>): string[] {
  if (!lineFeedback) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const w of weakest) {
    const fb = lineFeedback[w]
    if (fb && !seen.has(w)) {
      out.push(`[약점 진단 — ${w}] ${fb}`)
      seen.add(w)
    }
  }
  return out
}

/**
 * 약점 섹션만 재작성. 다른 섹션을 memory 로 넘겨 모순·중복 방지하며 순차 재생성.
 * judge 의 약점 렌즈 피드백(왜 낮은지)을 memory 에 주입해 타깃 개선한다.
 */
async function refineWeakest(
  draft: ExpressDraft,
  weakest: string[],
  input: EngineInput,
  evidence: EvidencePool,
  lineFeedback?: Record<string, string>,
): Promise<ExpressDraft> {
  const targets = resolveWeakSections(weakest)
  if (targets.length === 0) return draft

  // outline 재계산 (약점 반영) — 1콜
  const outline = await planOutline(input, evidence)

  // 재작성 대상 외 섹션을 memory 로 — 모순 방지
  const sections: Record<string, string> = { ...(draft.sections as Record<string, string>) }
  const memory: string[] = []
  for (const [k, v] of Object.entries(sections)) {
    if (!targets.includes(k as SectionKey) && typeof v === 'string' && v.length >= 12) {
      memory.push(`[§${k}] ${v.slice(0, 140)}`)
    }
  }

  // judge 약점 피드백 주입 — writeSection 이 무엇을 고쳐야 하는지 안다 (타깃 개선)
  const guide = weakLensGuide(weakest, lineFeedback)
  memory.push(...guide)

  for (const key of targets) {
    input.onProgress?.('refine', `sections.${key} 재작성...`)
    const text = await writeSection(key, outline, input, evidence, memory)
    if (text) {
      sections[key] = text
      memory.push(`[§${key}] ${text.slice(0, 140)}`)
    }
  }

  return {
    ...draft,
    sections: sections as ExpressDraft['sections'],
    meta: { ...draft.meta, lastUpdatedAt: new Date().toISOString() },
  }
}

/**
 * 단일 생성 엔진 진입점. RFP + 과업 → 유효 ExpressDraft(7섹션+keyMessages) + self-score.
 */
export async function generateDraft(input: EngineInput): Promise<EngineResult> {
  const startedAt = Date.now()
  let workstreams = input.workstreams

  // 과업 0개 → 기본 'education' 과업 1개 생성 후 재로드 (하위호환 어댑터, §7.4)
  if (workstreams.length === 0) {
    input.onProgress?.('init', '과업 0개 → ensureDefaultWorkstream')
    await ensureDefaultWorkstream(input.projectId)
    workstreams = (await prisma.workstream.findMany({
      where: { projectId: input.projectId },
      orderBy: { order: 'asc' },
    })) as Workstream[]
  }
  const ctx: EngineInput = { ...input, workstreams }

  // gather (RET-1)
  ctx.onProgress?.('gather', '증거 수집 시작...')
  const evidence = await gather(ctx)

  // assemble (plan-then-write, Pro)
  ctx.onProgress?.('assemble', '본문 조립 시작...')
  let draft = await assemble(ctx, evidence)

  // ── EX-2 품질·검증 3 레이어 (assemble → win-theme → compliance → verify → self-score) ──

  // win-theme (Flash) — typed, proof chain 강제. 본문 변경 없음(결과는 EngineResult/persist).
  ctx.onProgress?.('win-theme', 'win-theme 생성 (proof chain 강제)...')
  const winThemes = await generateWinThemes(ctx, evidence, draft)

  // compliance matrix (Flash) — RFP 요구 → 섹션 매핑. missing 이면 RS-3 경고.
  ctx.onProgress?.('compliance', 'compliance matrix 구축...')
  const compliance = await buildComplianceMatrix(ctx.rfp, draft)

  // verify (Flash) — faithfulness gate. 수치 미지지 제거·인용 부착(검증된 draft 를 채점).
  ctx.onProgress?.('verify', 'faithfulness gate (주장 검증)...')
  const verified = await verifyDraft(draft, retrieve, ctx.channel)
  draft = verified.draft
  const verifyReport = verified.report

  // 정제 루프 — 검증된 draft 를 채점. EX-2 산출물(win-theme·compliance·verify)을 judge 입력으로.
  const scoreExtras = { winThemes, compliance, verifyReport }

  // ── 단조 refine (EVAL-1) ──
  //   best{draft,score} 추적. refine 후 재채점해 **best 보다 높을 때만 채택**, 아니면 best 유지.
  //   최종 return = best. (이전: 무조건 새 draft 채택 → refine 가 점수를 떨어뜨려도 역행.)
  let best: { draft: ExpressDraft; score: SelfScore } = {
    draft,
    score: await selfScore(draft, scoreExtras),
  }
  let iterations = 0
  for (let i = 1; i <= MAX_REFINE; i++) {
    if (best.score.overall >= SCORE_THRESHOLD) break
    ctx.onProgress?.('refine', `정제 #${i} (best overall=${best.score.overall} < ${SCORE_THRESHOLD})`)
    const candidate = await refineWeakest(
      best.draft,
      best.score.weakest,
      ctx,
      evidence,
      best.score.lineFeedback,
    )
    iterations = i
    const candidateScore = await selfScore(candidate, scoreExtras)
    if (candidateScore.overall > best.score.overall) {
      best = { draft: candidate, score: candidateScore }
      ctx.onProgress?.('refine', `정제 #${i} 채택 (overall=${candidateScore.overall} ↑)`)
    } else {
      // 역행·동률 → 폐기하고 best 유지 (단조 보장). 다음 iteration 은 best 약점 재시도.
      ctx.onProgress?.(
        'refine',
        `정제 #${i} 폐기 (overall=${candidateScore.overall} ≤ best ${best.score.overall}) — best 유지`,
      )
    }
  }
  draft = best.draft
  const score = best.score

  // slideSpecs (QUAL-2) — 최종 draft 의 sections → 도식 슬라이드 spec.
  //   produce-slide-specs 본문 무수정(호출만). 실패해도 graceful(빈 배열) — 본문 품질에 영향 없음.
  //   timeline(커리큘럼·사업 일정)·process-flow(추진 사이클)·kpi-grid(성과) 패턴이 나오도록 입력 충실히.
  ctx.onProgress?.('slide-specs', '슬라이드 도식 spec 생성...')
  try {
    const { produceSlideSpecs } = await import('@/lib/express/produce-slide-specs')
    const { UD_TRACK_RECORD } = await import('@/lib/ud-brand')
    const specs = await produceSlideSpecs({
      sections: (draft.sections ?? {}) as Record<'1' | '2' | '3' | '4' | '5' | '6' | '7', string>,
      keyMessages: draft.keyMessages,
      trackRecord: UD_TRACK_RECORD,
      clientName: ctx.rfp.client ?? null,
      projectName: ctx.rfp.projectName ?? null,
    })
    if (specs.length > 0) {
      draft.slideSpecs = specs as ExpressDraft['slideSpecs']
      const patterns = [...new Set(specs.map((s) => s.diagram.pattern))]
      log.info('engine', 'slideSpecs 생성', { count: specs.length, patterns })
    }
  } catch (e) {
    log.warn('engine', 'slideSpecs 생성 실패 → 빈 배열', {
      err: e instanceof Error ? e.message : String(e),
    })
  }

  const elapsedSec = (Date.now() - startedAt) / 1000
  log.info('engine', 'generateDraft 완료', {
    projectId: ctx.projectId,
    overall: score.overall,
    iterations,
    elapsedSec: Number(elapsedSec.toFixed(1)),
    sections: Object.values(draft.sections ?? {}).filter((v) => typeof v === 'string' && v.length > 0)
      .length,
    keyMessages: (draft.keyMessages ?? []).length,
    winThemes: winThemes.length,
    complianceMissing: compliance.missingCount,
    verifyRemoved: verifyReport.removed,
  })

  return { draft, score, iterations, winThemes, compliance, verifyReport }
}

export type { EngineInput, EngineResult, SelfScore } from './types'
