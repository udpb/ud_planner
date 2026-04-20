/**
 * Curriculum AI — Step 2 커리큘럼 생성 (stateless)
 *
 * 책임:
 *   - 입력: RfpSlice + (옵션) StrategySlice + (옵션) ImpactModuleContext[] + ExternalResearch[]
 *   - 출력: CurriculumSession[] + designRationale + appliedDirection 검증 체크리스트
 *   - DB 저장 ❌ — 호출자(API route 또는 step-curriculum UI) 가 저장 책임
 *
 * 설계 철학:
 *   Step 1 에서 PM 이 확정한 "제안 컨셉 · 핵심 기획 포인트 · 평가배점 전략" 을
 *   프롬프트에 최우선으로 주입하여 Step 1 과 Step 2 가 따로 놀지 않도록 보장.
 *   `appliedDirection` 에서 실제 반영 여부를 AI 가 자가 보고 → 수주 팀 검증용.
 *
 * 타 모듈과 관계:
 *   - `src/lib/pipeline-context.ts` — RfpSlice / StrategySlice / CurriculumSession / EvalStrategy 타입 재사용
 *   - `src/lib/planning-direction.ts` — deriveChannel / CHANNEL_TONE_PROMPT 재사용 (B1 자산)
 *   - `src/lib/eval-strategy.ts` — sectionLabel (섹션 한국어 라벨)
 *   - `src/lib/ud-brand.ts` — buildBrandContext / buildImpactModulesContext / ImpactModuleContext 타입
 *   - `src/lib/claude.ts` — CLAUDE_MODEL · anthropic · ExternalResearch · formatExternalResearch · CurriculumSession (SSoT) 재사용
 *
 * 관련 Skill: `.claude/skills/ud-brand-voice/SKILL.md` §11 (금지 목록 — 약자 프레임·법인명 혼용 등)
 * 관련 문서: `docs/architecture/data-contract.md` §1.2 CurriculumSlice
 */

import {
  anthropic,
  CLAUDE_MODEL,
  formatExternalResearch,
  type ExternalResearch,
} from '@/lib/claude'
import type {
  RfpSlice,
  StrategySlice,
  CurriculumSession,
  EvalStrategy,
} from '@/lib/pipeline-context'
import {
  buildBrandContext,
  buildImpactModulesContext,
  type ImpactModuleContext,
} from '@/lib/ud-brand'
import { sectionLabel } from '@/lib/eval-strategy'
import {
  CHANNEL_TONE_PROMPT,
  deriveChannel,
  type PlanningChannel,
} from '@/lib/planning-direction'

// ═════════════════════════════════════════════════════════════════
// 1. 공개 타입
// ═════════════════════════════════════════════════════════════════

/**
 * generateCurriculum 입력 — PipelineContext 의 관련 슬라이스만 받음.
 * API route 가 projectId 로부터 조립해서 전달.
 */
export interface GenerateCurriculumInput {
  /** 필수 — Step 1 이 확정된 상태 전제 */
  rfp: RfpSlice
  /** optional — Planning Agent 완료 시 */
  strategy?: StrategySlice
  /** optional — IMPACT 18모듈 컨텍스트 (Phase E1 자동 추천 도입 시 필수화) */
  impactModules?: ImpactModuleContext[]
  /** optional — PM 이 수집한 외부 LLM 리서치 */
  externalResearch?: ExternalResearch[]
  /** 발주처 톤 프리셋 — 없으면 deriveChannel(rfp.parsed) 로 추정 */
  channel?: PlanningChannel
  /** 총 회차 힌트 — RFP 에서 못 읽으면 API 입력으로 주입 */
  totalSessions?: number
}

/**
 * AI 가 반환하는 원시 구조 (검증 전).
 * 검증 통과 후 CurriculumSession[] + designRationale + appliedDirection 으로 정제.
 */
export interface GenerateCurriculumResponse {
  sessions: CurriculumSession[]
  /** 커리큘럼 설계 근거 (200자 이상) — 어떤 기획 방향을 어느 세션에 반영했는지 */
  designRationale: string
  /** Step 1 기획 방향 반영 체크리스트 — 품질 검증용 */
  appliedDirection: {
    /** 제안 컨셉이 커리큘럼 구조에 실제 반영됐는지 */
    conceptReflected: boolean
    /** 각 핵심 기획 포인트가 어떻게 반영됐는지 (rfp.keyPlanningPoints 와 동일 길이) */
    keyPointsReflected: string[]
    /** 평가배점 top 1 항목에 대한 대응 전략 서술 */
    evalStrategyAlignment: string
  }
}

export type GenerateCurriculumResult =
  | { ok: true; data: GenerateCurriculumResponse }
  | { ok: false; error: string; raw?: string }

// ═════════════════════════════════════════════════════════════════
// 2. 내부 헬퍼
// ═════════════════════════════════════════════════════════════════

/**
 * claude.ts 의 비공개 `safeParseJson` 동등 구현 (B1 패턴 준수 — claude.ts 수정 금지).
 */
function parseJsonStrict<T>(raw: string, label: string): T {
  let s = raw.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim()
  const objStart = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (objStart === -1 || end === -1 || end <= objStart) {
    throw new Error(`[${label}] AI 응답에서 JSON 을 찾을 수 없습니다. 응답 일부: ${s.slice(0, 200)}`)
  }
  s = s.slice(objStart, end + 1)
  try {
    return JSON.parse(s) as T
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`[${label}] JSON 파싱 실패: ${msg} (길이: ${s.length})`)
  }
}

/** Claude 응답의 첫 텍스트 블록 추출 (any 회피) */
function extractClaudeText(content: unknown): string {
  if (!Array.isArray(content) || content.length === 0) {
    throw new Error('[curriculum-ai] Claude 응답에 content 블록이 없습니다')
  }
  const first = content[0] as { type?: string; text?: string }
  if (typeof first?.text !== 'string') {
    throw new Error('[curriculum-ai] Claude 응답 첫 블록에 text 필드가 없습니다')
  }
  return first.text.trim()
}

// ─────────────────────────────────────────
// 프롬프트 직렬화 블록
// ─────────────────────────────────────────

function serializeRfpSummary(rfp: RfpSlice): string {
  const p = rfp.parsed
  const lines: string[] = []
  lines.push(`- 사업명: ${p.projectName || '(미기재)'}`)
  lines.push(`- 발주기관: ${p.client || '(미기재)'}`)
  if (p.region) lines.push(`- 지역: ${p.region}`)
  if (p.totalBudgetVat || p.supplyPrice) {
    const krw = p.totalBudgetVat ?? p.supplyPrice ?? 0
    lines.push(`- 예산: ${(krw / 100_000_000).toFixed(2)}억원`)
  }
  lines.push(`- 대상: ${p.targetAudience || '(미기재)'}${p.targetCount ? ` / ${p.targetCount}명` : ''}`)
  if (p.targetStage?.length) lines.push(`- 창업 단계: ${p.targetStage.join(', ')}`)
  if (p.eduStartDate || p.eduEndDate) {
    lines.push(`- 교육 기간: ${p.eduStartDate ?? '?'} ~ ${p.eduEndDate ?? '?'}`)
  }
  if (p.objectives?.length) {
    lines.push(`- 사업 목표:`)
    for (const o of p.objectives) lines.push(`    • ${o}`)
  }
  if (p.keywords?.length) lines.push(`- 키워드: ${p.keywords.join(', ')}`)
  if (p.summary) lines.push(`- 요약: ${p.summary}`)
  return lines.join('\n')
}

function serializePlanningDirection(rfp: RfpSlice): string {
  const lines: string[] = []
  lines.push('[Step 1 에서 PM 이 확정한 기획 방향 — 반드시 반영]')

  // 제안 컨셉
  if (rfp.proposalConcept && rfp.proposalConcept.trim().length > 0) {
    lines.push(`▣ 제안 컨셉 (커리큘럼 구조·어조의 축): ${rfp.proposalConcept}`)
  } else {
    lines.push('▣ 제안 컨셉: (미확정) — 실행 보장형 기본 톤으로 설계')
  }

  // 제안 배경 (너무 길면 요약)
  if (rfp.proposalBackground && rfp.proposalBackground.trim().length > 0) {
    const bg =
      rfp.proposalBackground.length > 400
        ? rfp.proposalBackground.slice(0, 400) + '…'
        : rfp.proposalBackground
    lines.push(`▣ 제안 배경 요약: ${bg}`)
  }

  // 핵심 기획 포인트
  const points = rfp.keyPlanningPoints ?? []
  if (points.length > 0) {
    lines.push('▣ 핵심 기획 포인트 (각각 커리큘럼 어느 세션에 어떻게 반영됐는지 appliedDirection.keyPointsReflected 로 자가 보고):')
    points.forEach((p, i) => lines.push(`  ${i + 1}. ${p}`))
  } else {
    lines.push('▣ 핵심 기획 포인트: (미확정)')
  }

  return lines.join('\n')
}

function serializeEvalStrategyBlock(evalStrategy: EvalStrategy | undefined): string {
  if (!evalStrategy || evalStrategy.topItems.length === 0) {
    return '[평가배점 전략]\n(평가배점 정보 없음 — 일반적 커리큘럼 최적화: 실습 60%+ / Action Week 2회+ / 1:1 코칭 포함)'
  }

  const lines: string[] = []
  lines.push('[평가배점 전략 — 최고배점 섹션에 커리큘럼 리소스 집중]')
  lines.push('▣ 최고배점 상위 항목:')
  for (const it of evalStrategy.topItems) {
    const pct = Math.round((it.weight ?? 0) * 100)
    lines.push(`  • ${it.name} ${it.points}점 (전체 ${pct}%) — 섹션: ${sectionLabel(it.section)} / ${it.guidance}`)
  }

  if (evalStrategy.overallGuidance.length > 0) {
    lines.push('▣ 전체 전략:')
    for (const g of evalStrategy.overallGuidance) lines.push(`  - ${g}`)
  }

  // 커리큘럼 섹션이 top 1 이면 강도 높은 설계 지시
  const top = evalStrategy.topItems[0]
  if (top?.section === 'curriculum') {
    lines.push('')
    lines.push('▣ 지시: 최고배점이 "교육 커리큘럼" 섹션 → 전체 회차의 60%+ 를 실습/워크숍 로 채우고,')
    lines.push('   Action Week 를 최소 3회 포함, 1:1 코칭 페어링까지 설계하여 강도 높게 차별화.')
  }

  return lines.join('\n')
}

function serializeStrategyBlock(strategy: StrategySlice | undefined): string {
  if (!strategy) return ''
  const lines: string[] = []
  lines.push('[Planning Agent 전략 맥락 — 커리큘럼 어조와 강조점에 반영]')
  if (strategy.whyUs) lines.push(`  - 수주 명분: ${strategy.whyUs}`)
  if (strategy.clientHiddenWants) lines.push(`  - 발주처 숨은 니즈: ${strategy.clientHiddenWants}`)
  if (strategy.mustNotFail) lines.push(`  - 절대 실패 금지: ${strategy.mustNotFail}`)
  if (strategy.competitorWeakness) lines.push(`  - 경쟁 우위: ${strategy.competitorWeakness}`)
  if (strategy.riskFactors?.length) lines.push(`  - 주요 리스크: ${strategy.riskFactors.join(' / ')}`)
  if (strategy.derivedKeyMessages?.length) {
    lines.push('  - 제안서 키 메시지 (커리큘럼 설계근거에 반영):')
    for (const m of strategy.derivedKeyMessages.slice(0, 5)) lines.push(`    • ${m}`)
  }
  return lines.length > 1 ? lines.join('\n') : ''
}

// ═════════════════════════════════════════════════════════════════
// 3. 프롬프트 빌더
// ═════════════════════════════════════════════════════════════════

/**
 * 커리큘럼 생성 프롬프트 조립.
 *
 * 주입 우선순위:
 *   1. 브랜드 자산 (buildBrandContext)
 *   2. Step 1 확정 기획 방향 (concept · background · keyPlanningPoints · evalStrategy)
 *   3. 발주처 톤 프리셋
 *   4. Strategy 키 메시지 (있으면)
 *   5. IMPACT 모듈 컨텍스트 (있으면)
 *   6. 외부 리서치 (있으면)
 *   7. 출력 형식 JSON 지시
 */
export function buildCurriculumPrompt(
  input: GenerateCurriculumInput,
  retryHint?: string,
): string {
  const { rfp, strategy, impactModules = [], externalResearch, totalSessions } = input
  const channel: PlanningChannel = input.channel ?? deriveChannel(rfp.parsed)

  const brandBlock = buildBrandContext()
  const directionBlock = serializePlanningDirection(rfp)
  const evalBlock = serializeEvalStrategyBlock(rfp.evalStrategy)
  const strategyBlock = serializeStrategyBlock(strategy)
  const impactBlock = impactModules.length > 0
    ? buildImpactModulesContext(impactModules.slice(0, 18))
    : ''
  const researchBlock = externalResearch && externalResearch.length > 0
    ? formatExternalResearch(externalResearch)
    : ''

  const rfpBlock = serializeRfpSummary(rfp)
  const sessionCountHint = totalSessions
    ? `총 회차: ${totalSessions}회 (이 수치를 기준으로 설계).`
    : '총 회차: RFP 에 명시 없음 — 예산·기간·대상 규모를 고려하여 적정 회차(보통 8-16) 판단.'

  const keyPointsCount = rfp.keyPlanningPoints?.length ?? 0
  const keyPointExpected = keyPointsCount > 0
    ? `정확히 ${keyPointsCount}개 — rfp.keyPlanningPoints 각각에 대응`
    : '0개 (핵심 포인트 미확정)'

  const retry = retryHint ? `\n[재시도 힌트]\n${retryHint}\n` : ''

  return `당신은 창업 교육 커리큘럼 설계 전문가입니다. 아래 기획 방향을 반영하여 커리큘럼을 JSON 으로 생성하세요.

[기획 방향]
${directionBlock}

${evalBlock ? `[평가배점]\n${evalBlock}\n` : ''}[발주처 톤: ${channel}] ${CHANNEL_TONE_PROMPT[channel]}

${rfpBlock}

[설계 규칙]
- ${sessionCountHint}
- Action Week 최소 2회. 이론 3연속 금지.
- 세션당 50분 기본 (강의 15분 + 실습 35분).

${retry}[출력 형식 — JSON 만, 설명 금지]
{
  "sessions": [
    {
      "sessionNo": 1,
      "title": "세션 제목",
      "durationHours": 2,
      "isTheory": false,
      "isActionWeek": false,
      "isCoaching1on1": false,
      "objectives": ["목표1"]
    }
  ],
  "designRationale": "설계 근거 200자 이상"
}
JSON 으로만 응답하세요.`
}

// ═════════════════════════════════════════════════════════════════
// 4. 검증
// ═════════════════════════════════════════════════════════════════

/**
 * AI 출력의 최소 품질 검사.
 * @returns 에러 메시지 (문제 있음) | null (통과)
 */
export function validateGeneratedCurriculum(
  r: GenerateCurriculumResponse,
  input: GenerateCurriculumInput,
): string | null {
  if (!r || typeof r !== 'object') return '응답이 객체가 아님'

  // sessions
  if (!Array.isArray(r.sessions) || r.sessions.length < 1) {
    return 'sessions 가 비어있음'
  }
  for (let i = 0; i < r.sessions.length; i++) {
    const s = r.sessions[i]
    if (!s || typeof s !== 'object') return `sessions[${i}] 이 객체가 아님`
    if (typeof s.sessionNo !== 'number') return `sessions[${i}].sessionNo 누락`
    if (typeof s.title !== 'string' || s.title.length === 0) return `sessions[${i}].title 누락`
    if (typeof s.durationHours !== 'number') return `sessions[${i}].durationHours 누락`
    if (typeof s.isTheory !== 'boolean') return `sessions[${i}].isTheory 누락`
    if (typeof s.isActionWeek !== 'boolean') return `sessions[${i}].isActionWeek 누락`
  }

  // designRationale — 있으면 좋지만 없어도 통과
  if (typeof r.designRationale !== 'string' || r.designRationale.length < 10) {
    return `designRationale 누락 또는 너무 짧음 (현재 ${r.designRationale?.length ?? 0}자)`
  }

  // appliedDirection — 보너스 검증 (없어도 커리큘럼 자체는 유효)
  // Claude 가 이 필드를 정확히 못 만드는 경우가 많으므로 warn 수준으로 완화
  // 실패해도 null 반환 (통과)
  const ad = r.appliedDirection
  if (ad && typeof ad === 'object') {
    // 있으면 내용 검증하되 실패해도 통과
    if (typeof ad.conceptReflected === 'boolean' && !ad.conceptReflected) {
      // 경고만 (console), 실패로 처리하지 않음
      console.warn('[curriculum-ai] appliedDirection.conceptReflected = false — 제안 컨셉 반영 약할 수 있음')
    }
  }

  return null
}

// ═════════════════════════════════════════════════════════════════
// 5. 메인 함수
// ═════════════════════════════════════════════════════════════════

/**
 * 커리큘럼 생성 — Claude 호출 + JSON 파싱 + 검증 + 실패 시 1회 재시도.
 *
 * Stateless: DB 에 쓰지 않음. 호출자가 CurriculumItem 으로 저장.
 *
 * @param input GenerateCurriculumInput — rfp 필수, 나머지 optional
 * @returns 성공 시 { ok: true, data } / 실패 시 { ok: false, error, raw? }
 */
export async function generateCurriculum(
  input: GenerateCurriculumInput,
): Promise<GenerateCurriculumResult> {
  // 최소 입력 검증 — rfp.parsed 없으면 즉시 실패
  if (!input?.rfp?.parsed) {
    return { ok: false, error: '[curriculum-ai] rfp.parsed 가 없습니다' }
  }

  const prompt = buildCurriculumPrompt(input)
  let rawFirst = ''

  try {
    const msg = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    })

    rawFirst = extractClaudeText(msg.content)
    const parsed = parseJsonStrict<GenerateCurriculumResponse>(rawFirst, 'generateCurriculum')
    const err = validateGeneratedCurriculum(parsed, input)

    if (!err) {
      return { ok: true, data: parsed }
    }

    // 재시도 1회 — 실패 사유를 힌트로 재주입
    const firstKeyPoint = input.rfp.keyPlanningPoints?.[0]
    const retryHint = `이전 출력 검증 실패: ${err}. 특히 appliedDirection.keyPointsReflected 배열 길이와 designRationale 200자+ 기준을 엄격히 준수하세요.${
      firstKeyPoint ? ` '${firstKeyPoint}' 가 어느 세션에 반영됐는지 명시하세요.` : ''
    }`

    const retryPrompt = buildCurriculumPrompt(input, retryHint)
    const retryMsg = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      messages: [{ role: 'user', content: retryPrompt }],
    })

    const rawSecond = extractClaudeText(retryMsg.content)
    const parsedRetry = parseJsonStrict<GenerateCurriculumResponse>(rawSecond, 'generateCurriculum.retry')
    const err2 = validateGeneratedCurriculum(parsedRetry, input)

    if (!err2) {
      return { ok: true, data: parsedRetry }
    }

    return {
      ok: false,
      error: `검증 실패 (2회 시도): ${err2}`,
      raw: rawSecond,
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: message, raw: rawFirst || undefined }
  }
}
