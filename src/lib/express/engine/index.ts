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
import { gather } from './gather'
import { assemble, writeSection, planOutline } from './assemble'
import { selfScore, SCORE_THRESHOLD, MAX_REFINE } from './self-score'

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
 * 약점 섹션만 재작성. 다른 섹션을 memory 로 넘겨 모순·중복 방지하며 순차 재생성.
 */
async function refineWeakest(
  draft: ExpressDraft,
  weakest: string[],
  input: EngineInput,
  evidence: EvidencePool,
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

  // 정제 루프
  let score: SelfScore = await selfScore(draft)
  let iterations = 0
  for (let i = 1; i <= MAX_REFINE; i++) {
    if (score.overall >= SCORE_THRESHOLD) break
    ctx.onProgress?.('refine', `정제 #${i} (overall=${score.overall} < ${SCORE_THRESHOLD})`)
    draft = await refineWeakest(draft, score.weakest, ctx, evidence)
    iterations = i
    score = await selfScore(draft)
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
  })

  return { draft, score, iterations }
}

export type { EngineInput, EngineResult, SelfScore } from './types'
