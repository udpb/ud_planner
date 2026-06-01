/**
 * compliance — RFP 요구 → 섹션 매핑 matrix (EX-2, Tech Spec §5 G8·§6.1 RS-3, ADR-019)
 *
 * RFP 의 요구사항·평가배점을 추출해 7섹션(1~7) 중 하나에 매핑하고, 본문 커버리지를
 * covered|partial|missing 로 판정한다. **missing(미커버) 요구가 있으면 실격 위험(RS-3)
 * 으로 경고 로깅** + 결과에 표시.
 *
 * 모델: `modelFor('engine.compliance')` — Flash. 요구 추출·매핑은 plumbing 성격.
 *
 * 직접 SDK 금지 — invokeAi. JSON = safeParseJson.
 */

import 'server-only'

import { invokeAi } from '@/lib/ai-fallback'
import { AI_TOKENS, modelFor } from '@/lib/ai/config'
import { safeParseJson } from '@/lib/ai/parser'
import { log } from '@/lib/logger'
import { SECTION_LABELS } from '../schema'
import type { ExpressDraft, SectionKey } from '../schema'
import type { RfpParsed } from '@/lib/ai/parse-rfp'

// ─────────────────────────────────────────
// 타입 (schema.prisma ComplianceItem 형태 — id·projectId 는 라우트가 부여)
// ─────────────────────────────────────────

export type Coverage = 'covered' | 'partial' | 'missing'

export interface ComplianceItemDraft {
  requirement: string
  scoringWeight?: number
  /** '1'~'7' 또는 null(미매핑 — RS-3) */
  mappedSection?: SectionKey | null
  coverage: Coverage
}

export interface ComplianceMatrix {
  items: ComplianceItemDraft[]
  /** 미커버(coverage==='missing' 또는 mappedSection 없음) 요구 — 실격 위험 */
  missingCount: number
  coveredCount: number
  partialCount: number
}

const SECTION_KEYS: SectionKey[] = ['1', '2', '3', '4', '5', '6', '7']
const SECTION_SET = new Set<string>(SECTION_KEYS)

// ─────────────────────────────────────────
// 컨텍스트 포매팅
// ─────────────────────────────────────────

function formatRfpRequirements(rfp: RfpParsed): string {
  const lines: string[] = []
  if ((rfp.objectives ?? []).length) lines.push(`목표: ${(rfp.objectives ?? []).join(' / ')}`)
  if ((rfp.deliverables ?? []).length) lines.push(`산출물: ${(rfp.deliverables ?? []).join(' / ')}`)
  if ((rfp.constraints ?? []).length)
    lines.push(
      `제약·요건: ${(rfp.constraints ?? [])
        .map((c) => (c?.description ? `${c.type ? `[${c.type}] ` : ''}${c.description}` : String(c)))
        .join(' / ')}`,
    )
  if ((rfp.requiredPersonnel ?? []).length)
    lines.push(
      `필수 인력: ${(rfp.requiredPersonnel ?? [])
        .map((p) =>
          p?.role
            ? `${p.role}${p.qualification ? `(${p.qualification})` : ''}${p.count ? ` ${p.count}명` : ''}`
            : String(p),
        )
        .join(' / ')}`,
    )
  if ((rfp.evalCriteria ?? []).length)
    lines.push(
      `평가배점: ${(rfp.evalCriteria ?? [])
        .map((c) => `${c.item}(${c.score}${c.notes ? ` — ${c.notes}` : ''})`)
        .join(' · ')}`,
    )
  if (rfp.summary) lines.push(`요약: ${rfp.summary}`)
  return lines.join('\n')
}

function sectionsBlock(draft: ExpressDraft): string {
  const sections = draft.sections ?? {}
  return SECTION_KEYS.map((k) => {
    const t = sections[k]
    return t
      ? `### sections.${k} ${SECTION_LABELS[k]}\n${t.slice(0, 700)}`
      : `### sections.${k} ${SECTION_LABELS[k]}\n(비어 있음)`
  }).join('\n\n')
}

// ─────────────────────────────────────────
// buildComplianceMatrix
// ─────────────────────────────────────────

interface RawComplianceItem {
  requirement?: string
  scoringWeight?: number
  mappedSection?: string | null
  coverage?: string
}

function normCoverage(v: unknown): Coverage {
  return v === 'covered' || v === 'partial' || v === 'missing' ? v : 'missing'
}

/**
 * RFP 요구 × 본문 → compliance matrix. 미커버 요구는 RS-3 경고.
 */
export async function buildComplianceMatrix(
  rfp: RfpParsed,
  draft: ExpressDraft,
): Promise<ComplianceMatrix> {
  const prompt = `
당신은 한국 정부·기업 RFP **compliance 검수관**입니다. 아래 RFP 요구사항을 항목별로 추출하고,
각 요구가 제안서 7섹션 중 어디서 다뤄졌는지 매핑한 뒤 커버리지를 판정하세요.

[RFP 요구사항]
${formatRfpRequirements(rfp) || '(요구 정보 부족)'}

[제안서 7섹션]
${sectionsBlock(draft)}

[섹션 키]
1=제안 배경·목적 / 2=추진 전략·방법론 / 3=교육 커리큘럼(사업 내용) / 4=운영 체계·코치진 /
5=예산·경제성 / 6=기대 성과·임팩트 / 7=수행 역량·실적

[판정 규칙]
- requirement: RFP 가 요구하는 구체 항목 1개(목표·산출물·필수요건·평가배점 항목 단위). 8~15개로 분해.
- scoringWeight: 평가배점에서 온 요구면 그 배점(숫자), 아니면 생략.
- mappedSection: 그 요구를 다루는 섹션 키('1'~'7'). 어느 섹션도 안 다루면 null.
- coverage:
  - covered = 해당 섹션에서 구체·충분히 다룸
  - partial = 언급은 있으나 얕거나 일부만
  - missing = 본문에 사실상 없음 (실격 위험)

[출력 JSON]
{ "items": [ { "requirement": "...", "scoringWeight": 30, "mappedSection": "2", "coverage": "covered" }, ... ] }
JSON 만. 마크다운 펜스·설명·trailing comma 금지.
`.trim()

  let raw: { items?: RawComplianceItem[] } | null = null
  try {
    const r = await invokeAi({
      prompt,
      model: modelFor('engine.compliance'),
      maxTokens: AI_TOKENS.STANDARD,
      temperature: 0.2,
      label: 'engine.buildComplianceMatrix',
    })
    raw = safeParseJson<{ items?: RawComplianceItem[] }>(r.raw, 'engine.buildComplianceMatrix')
  } catch (e) {
    log.warn('engine.compliance', 'buildComplianceMatrix LLM 실패 → 빈 matrix', {
      err: e instanceof Error ? e.message : String(e),
    })
    return { items: [], missingCount: 0, coveredCount: 0, partialCount: 0 }
  }

  const items: ComplianceItemDraft[] = (raw?.items ?? [])
    .filter((it) => typeof it?.requirement === 'string' && it.requirement.trim().length >= 4)
    .slice(0, 20)
    .map((it) => {
      const ms =
        typeof it.mappedSection === 'string' && SECTION_SET.has(it.mappedSection)
          ? (it.mappedSection as SectionKey)
          : null
      const coverage = ms ? normCoverage(it.coverage) : 'missing'
      return {
        requirement: it.requirement!.trim().slice(0, 400),
        scoringWeight:
          typeof it.scoringWeight === 'number' && it.scoringWeight > 0
            ? Math.round(it.scoringWeight)
            : undefined,
        mappedSection: ms,
        coverage,
      }
    })

  const missingCount = items.filter((i) => i.coverage === 'missing').length
  const coveredCount = items.filter((i) => i.coverage === 'covered').length
  const partialCount = items.filter((i) => i.coverage === 'partial').length

  if (missingCount > 0) {
    log.warn('engine.compliance', `RS-3 실격 위험 — 미커버 요구 ${missingCount}건`, {
      missing: items.filter((i) => i.coverage === 'missing').map((i) => i.requirement.slice(0, 60)),
    })
  }
  log.info('engine.compliance', 'compliance matrix 생성', {
    total: items.length,
    coveredCount,
    partialCount,
    missingCount,
  })

  return { items, missingCount, coveredCount, partialCount }
}
