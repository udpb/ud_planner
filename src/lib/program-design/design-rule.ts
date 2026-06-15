/**
 * DesignRule — 프로그램 설계 문법 규칙 스키마 + 로더/세이버 (ADR-028 추록 3 동결)
 *
 * v1.2 (docs/UD-Brain-CurriculumDesignLogic-v1.2.html) 에서 큐레이션해 메인이
 * 발행한 규칙 시드(`data/program-design/design-rules.json`)를 타입 안전하게
 * 검증하고, `/admin/design-rules` 검수 UI 가 status/reviewerNote 를 되기록한다.
 *
 * **JSON-first** (ADR-028 Option B — 로컬 DB migration 보류 중이라 Prisma 모델 없음).
 *
 * 키 **이름·구조**는 ADR-028 추록 3 으로 동결 (변경 시 ADR supersede 필요).
 * - enum 값 추가는 자유 (추록 §불변식 5).
 * - `recommend.value` 는 단일값/범위/프로파일객체/결정트리/세트를 모두 담으므로
 *   `z.unknown()` (구조를 강제하지 않음 — kind 별 형태가 v1.2 큐레이션마다 다름).
 *
 * Source: docs/decisions/028-program-design-grammar.md 추록 3 ·
 *         .claude/agent-briefs/BR-2-design-rule-review.md
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────
// 파일 경로 (process.cwd() 기준 상수)
// ─────────────────────────────────────────────────────────────────

export const DESIGN_RULES_PATH = path.join(
  process.cwd(),
  'data',
  'program-design',
  'design-rules.json',
)

// ─────────────────────────────────────────────────────────────────
// enum (ADR-028 추록 3 동결)
// ─────────────────────────────────────────────────────────────────

/** 규칙 유형 — UI 그룹핑 키이기도 하다 (A~G + Z). */
export const RULE_TYPES = [
  'A_operatingType',
  'B_typeProfile',
  'C_flowGrammar',
  'D_budgetStructure',
  'E_immersionSet',
  'F_audienceDefault',
  'G_inputGate',
  'Z_meta',
] as const

/** 규칙 발동 조건의 축. */
export const CONDITION_DIMENSIONS = [
  'always',
  'operatingType',
  'channel',
  'targetStage',
  'demographic',
  'budgetBand',
  'goalType',
] as const

/** 권장값의 형태. */
export const RECOMMEND_KINDS = [
  'value',
  'range',
  'profile',
  'placement',
  'discriminator',
  'set',
] as const

/**
 * 결정 정책 — 사람에게 "자동 적용인지, 선택지로 뜨는지"를 알린다.
 *  - auto                = 신뢰 높은 구조 기본값, 조용히 적용 (예: 흐름 문법)
 *  - ask_human           = 항상 사람에게 선택 표시 (턴 기반 게이트)
 *  - auto_unless_conflict = 적용하되 RFP/클라이언트 목표와 충돌하면 양보 + 사람에게 표시
 */
export const DECISION_POLICIES = ['auto', 'ask_human', 'auto_unless_conflict'] as const

/** 검수 상태 — approved 만 생성기(BR-3)가 소비. */
export const RULE_STATUSES = ['draft', 'approved', 'rejected'] as const

export const RuleTypeSchema = z.enum(RULE_TYPES)
export const ConditionDimensionSchema = z.enum(CONDITION_DIMENSIONS)
export const RecommendKindSchema = z.enum(RECOMMEND_KINDS)
export const DecisionPolicySchema = z.enum(DECISION_POLICIES)
export const RuleStatusSchema = z.enum(RULE_STATUSES)

export type RuleType = z.infer<typeof RuleTypeSchema>
export type ConditionDimension = z.infer<typeof ConditionDimensionSchema>
export type RecommendKind = z.infer<typeof RecommendKindSchema>
export type DecisionPolicy = z.infer<typeof DecisionPolicySchema>
export type RuleStatus = z.infer<typeof RuleStatusSchema>

// ─────────────────────────────────────────────────────────────────
// DesignRule 스키마 (단일 규칙)
// ─────────────────────────────────────────────────────────────────

/** match? : 단일 문자열 또는 문자열 배열 (규칙 발동 조건의 값). */
const ConditionSchema = z
  .object({
    dimension: ConditionDimensionSchema,
    match: z.union([z.string(), z.array(z.string())]).optional(),
  })
  .strict()

/** recommend.value 는 단일값/객체/트리/세트 모두 허용 → z.unknown(). */
const RecommendSchema = z
  .object({
    kind: RecommendKindSchema,
    target: z.string().min(1),
    value: z.unknown(),
  })
  .strict()

/** evidence — 근거 없는 규칙 금지 (source 필수, 추록 §불변식 3). */
const EvidenceSchema = z
  .object({
    source: z.string().min(1, 'evidence.source 는 필수입니다 (근거 없는 규칙 금지).'),
    n: z.number().optional(),
    stat: z.string().optional(),
  })
  .strict()

export const DesignRuleSchema = z
  .object({
    id: z.string().min(1),
    ruleType: RuleTypeSchema,
    title: z.string().min(1),
    condition: ConditionSchema,
    recommend: RecommendSchema,
    decisionPolicy: DecisionPolicySchema,
    rationale: z.string().min(1),
    evidence: EvidenceSchema,
    confidence: z.number().min(0).max(1),
    // ⭐ 항상 true — 제0원칙: 모든 규칙은 기본값, 목표가 이긴다 (추록 §불변식 1).
    isDefault: z.literal(true),
    status: RuleStatusSchema,
    reviewerNote: z.string().optional(),
  })
  .strict()

export type DesignRule = z.infer<typeof DesignRuleSchema>

// ─────────────────────────────────────────────────────────────────
// DesignRuleSet 스키마 (파일 전체)
// ─────────────────────────────────────────────────────────────────

export const DesignRuleSetSchema = z
  .object({
    version: z.string().min(1),
    source: z.string().min(1),
    generatedAt: z.string().min(1),
    note: z.string().optional(),
    rules: z.array(DesignRuleSchema),
  })
  .strict()

export type DesignRuleSet = z.infer<typeof DesignRuleSetSchema>

// ─────────────────────────────────────────────────────────────────
// 로더 / 세이버
// ─────────────────────────────────────────────────────────────────

/**
 * 파일을 읽어 zod 파싱한다. 실패 시 경로 + zod 이슈를 담은 명확한 에러를 던진다.
 * (검수 UI 의 서버 컴포넌트·검증 스모크가 이걸 호출.)
 */
export async function loadDesignRules(): Promise<DesignRuleSet> {
  let raw: string
  try {
    raw = await fs.readFile(DESIGN_RULES_PATH, 'utf8')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`[design-rule] 시드 파일을 읽지 못했습니다 (${DESIGN_RULES_PATH}): ${msg}`)
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`[design-rule] 시드 JSON 파싱 실패 (${DESIGN_RULES_PATH}): ${msg}`)
  }

  const parsed = DesignRuleSetSchema.safeParse(json)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join('.') || '(root)'} — ${i.message}`)
      .join('\n')
    throw new Error(
      `[design-rule] 시드가 ADR-028 추록 3 스키마와 불일치합니다 (${DESIGN_RULES_PATH}).\n` +
        `시드는 메인이 작성자입니다 — 시드를 고치지 말고 STOP·보고하세요.\n${issues}`,
    )
  }
  return parsed.data
}

/**
 * 해당 규칙의 `status`(필요 시 `reviewerNote`)만 되기록한다.
 *
 * ⚠️ 전체 set 을 `JSON.stringify` 로 재직렬화하면 시드의 그룹 구분 빈 줄·
 *    `condition: { ... }` 같은 한 줄 객체 포맷이 다 무너진다 (거대 diff).
 *    그래서 **원본 텍스트를 surgical 패치**한다 — 변경은 status/reviewerNote
 *    라인만, 나머지 필드·규칙 순서·들여쓰기·빈 줄 무손상.
 *
 * 전제 (시드 포맷, ADR-028 추록 3 시드):
 *   - 각 규칙은 한 줄 `"id": "<id>",` 로 시작 (6-space indent).
 *   - `status` 는 각 규칙 블록의 마지막 필드(`isDefault` 다음), 있으면
 *     `reviewerNote` 는 `status` 바로 뒤 또는 사이.
 *   - 6-space indent (2-space × 3 depth: 객체 → rules 배열 → 규칙 객체).
 *
 * 먼저 loadDesignRules() 로 구조를 검증(불일치면 throw)하고, 그 다음 텍스트 패치.
 *
 * reviewerNote 인자:
 *   - undefined → reviewerNote 미변경 (status 만 갱신)
 *   - string    → reviewerNote 갱신 (빈 문자열이면 키 제거)
 */
export async function saveRuleStatus(
  id: string,
  status: RuleStatus,
  reviewerNote?: string,
): Promise<DesignRule> {
  // 1) 구조 검증 + 대상 규칙 존재 확인 (불일치면 여기서 throw).
  const set = await loadDesignRules()
  const idx = set.rules.findIndex((r) => r.id === id)
  if (idx === -1) {
    throw new Error(`[design-rule] 규칙을 찾지 못했습니다: id="${id}"`)
  }

  // 2) 원본 텍스트 surgical 패치.
  const raw = await fs.readFile(DESIGN_RULES_PATH, 'utf8')
  const lines = raw.split('\n')

  // 대상 규칙 블록 범위 찾기: `"id": "<id>"` 라인 → 다음 규칙 `"id":` 또는 배열 끝.
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const idLineRe = new RegExp(`^\\s*"id":\\s*"${escapedId}"\\s*,?\\s*$`)
  const anyIdLineRe = /^\s*"id":\s*"/

  let start = -1
  for (let i = 0; i < lines.length; i++) {
    if (idLineRe.test(lines[i])) {
      start = i
      break
    }
  }
  if (start === -1) {
    throw new Error(`[design-rule] 텍스트에서 규칙 "id": "${id}" 라인을 찾지 못했습니다.`)
  }
  // 블록 끝 = 다음 규칙의 "id": 라인 직전, 없으면 파일 끝.
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (anyIdLineRe.test(lines[i])) {
      end = i
      break
    }
  }

  // indent 추론 (id 라인 앞 공백).
  const indent = lines[start].match(/^(\s*)/)?.[1] ?? '      '

  // 블록 내 status / reviewerNote 라인 위치.
  const statusLineRe = /^\s*"status":\s*"(?:draft|approved|rejected)"\s*,?\s*$/
  const reviewerNoteLineRe = /^\s*"reviewerNote":\s*".*"\s*,?\s*$/
  let statusLineIdx = -1
  let reviewerLineIdx = -1
  for (let i = start; i < end; i++) {
    if (statusLineIdx === -1 && statusLineRe.test(lines[i])) statusLineIdx = i
    if (reviewerLineIdx === -1 && reviewerNoteLineRe.test(lines[i])) reviewerLineIdx = i
  }
  if (statusLineIdx === -1) {
    throw new Error(`[design-rule] 규칙 "${id}" 블록에서 "status" 라인을 찾지 못했습니다.`)
  }

  // reviewerNote 최종값 결정:
  //   - reviewerNote 인자 지정 → 그 값(빈 문자열이면 제거)
  //   - 미지정 → 기존 reviewerNote 값 유지 (있으면)
  const trimmedNote = reviewerNote?.trim()
  let finalNote: string | null
  if (reviewerNote !== undefined) {
    finalNote = trimmedNote ? trimmedNote : null
  } else if (reviewerLineIdx !== -1) {
    // 기존 라인에서 값 추출 (마지막 필드면 콤마 없을 수도).
    const m = lines[reviewerLineIdx].match(/^\s*"reviewerNote":\s*(".*")\s*,?\s*$/)
    finalNote = m ? (JSON.parse(m[1]) as string) : null
  } else {
    finalNote = null
  }

  // status 는 reviewerNote 가 뒤따르면 콤마 필요, 아니면 마지막 필드(콤마 없음).
  const statusLine = `${indent}"status": "${status}"${finalNote !== null ? ',' : ''}`
  const newBlockTail: string[] = [statusLine]
  if (finalNote !== null) {
    newBlockTail.push(`${indent}"reviewerNote": ${JSON.stringify(finalNote)}`)
  }

  // 제거 대상 인덱스 집합.
  const removeSet = new Set<number>([statusLineIdx])
  if (reviewerLineIdx !== -1) removeSet.add(reviewerLineIdx)

  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    if (i === statusLineIdx) {
      // status 위치에 새 tail 삽입.
      out.push(...newBlockTail)
      continue
    }
    if (removeSet.has(i)) continue // 기존 reviewerNote 라인 제거 (status 자리로 통합).
    out.push(lines[i])
  }

  const serialized = out.join('\n')
  const tmpPath = `${DESIGN_RULES_PATH}.${process.pid}.tmp`
  await fs.writeFile(tmpPath, serialized, 'utf8')
  await fs.rename(tmpPath, DESIGN_RULES_PATH)

  // 갱신 후 재검증 + 반환 (패치가 깨졌으면 여기서 throw).
  const reloaded = await loadDesignRules()
  const updated = reloaded.rules.find((r) => r.id === id)
  if (!updated) {
    throw new Error(`[design-rule] 패치 후 규칙 "${id}" 를 다시 읽지 못했습니다 (패치 손상 의심).`)
  }
  return updated
}
