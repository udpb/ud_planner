/**
 * Proposal AI — PipelineContext 전체 주입 기반 제안서 섹션 생성 (stateless)
 *
 * 책임:
 *   - 입력: PipelineContext(rfp + strategy + curriculum + coaches + budget + impact) + sectionNo
 *   - 출력: 섹션 본문 마크다운 + SectionMetadata (키메시지 감지·경고·사용 슬라이스)
 *   - DB 저장 ❌ — 호출자가 ProposalSection 테이블에 저장
 *
 * 설계 원칙:
 *   - 기존 `claude.ts` 의 `generateProposalSection()` 은 수정하지 않고 공존 (improve route 가 참조)
 *   - 본 모듈은 Phase C 파이프라인 전체 컨텍스트를 섹션별로 필터링해서 프롬프트 조립
 *   - Claude 응답은 JSON 이 아닌 마크다운 본문 직접 추출 (safeParseJson 사용 ❌)
 *
 * 관련 문서:
 *   - 브리프: `.claude/agent-briefs/redesign/C3-proposal-ai.md`
 *   - 브랜드 보이스: `.claude/skills/ud-brand-voice/SKILL.md`
 *   - 데이터 계약: `docs/architecture/data-contract.md` §1.2 ProposalSlice
 */

import { formatExternalResearch } from '@/lib/claude'
import { invokeAi } from '@/lib/ai-fallback'
import type { PipelineContext } from '@/lib/pipeline-context'
import {
  buildBrandContext,
  buildCurriculumContextForProposal,
  UD_SUPPORT_LAYERS,
} from '@/lib/ud-brand'
import {
  CHANNEL_TONE_PROMPT,
  type PlanningChannel,
} from '@/lib/planning-direction'
import { sectionLabel } from '@/lib/eval-strategy'
import { COMMON_PLANNING_PRINCIPLES } from '@/lib/planning-principles'
import {
  formatAcceptedAssets,
  SECTION_NO_TO_KEY,
} from '@/lib/asset-registry'
import { AI_TOKENS } from '@/lib/ai/config'

// ═════════════════════════════════════════════════════════════════
// 1. 공개 타입 · 상수
// ═════════════════════════════════════════════════════════════════

export type ProposalSectionNo = 1 | 2 | 3 | 4 | 5 | 6 | 7

/**
 * PipelineContext 슬라이스 키 — 섹션별 필수 의존성 선언용.
 * (rfp/strategy/curriculum/coaches/budget/impact 만 대상. meta/research/proposal 제외)
 */
export type PipelineSliceKey =
  | 'rfp'
  | 'strategy'
  | 'curriculum'
  | 'coaches'
  | 'budget'
  | 'impact'

export interface ProposalSectionSpec {
  title: string
  /** 이 섹션이 다루는 초점 (프롬프트에 직접 반영) */
  focus: string
  /** 최소 글자수 (본문 기준) */
  minChars: number
  /** 최대 글자수 (본문 기준) */
  maxChars: number
  /** Claude max_tokens — 섹션 중요도·분량에 따라 차등 */
  maxTokens: number
  /** 이 섹션을 생성하려면 PipelineContext 에 있어야 하는 슬라이스 */
  requiresSlices: PipelineSliceKey[]
}

/**
 * 7개 섹션 스펙 — ProposalSection.sectionNo 와 일치.
 */
export const PROPOSAL_SECTION_SPEC: Record<ProposalSectionNo, ProposalSectionSpec> = {
  1: {
    title: '제안 배경 및 목적',
    focus: '제안배경 + 한 줄 컨셉 + 핵심 기획 포인트 3개 + 유사 수주 사례',
    minChars: 800,
    maxChars: 1500,
    maxTokens: 2500,
    requiresSlices: ['rfp'],
  },
  2: {
    title: '추진 전략 및 방법론',
    focus: '차별화 · 방법론 · 키 메시지 · 평가배점 상위 대응',
    minChars: 800,
    maxChars: 1500,
    maxTokens: 2500,
    requiresSlices: ['rfp', 'strategy'],
  },
  3: {
    title: '교육 커리큘럼',
    focus: '세션 · 트랙 · IMPACT 매핑 · Action Week · 설계 근거',
    minChars: 1000,
    maxChars: 2000,
    // 2026-05-03 P1-4: 4096 → 3500 (504 timeout 방어, 재시도 포함 50s 안에 들어오게)
    maxTokens: 3500,
    requiresSlices: ['rfp', 'curriculum'],
  },
  4: {
    title: '운영 체계 및 코치진',
    focus: '조직 · 4중 지원 체계 · 코치진 · 전담 PM',
    minChars: 700,
    maxChars: 1200,
    maxTokens: 2500,
    requiresSlices: ['rfp', 'coaches'],
  },
  5: {
    title: '예산 및 경제성',
    focus: '예산 구조 · 마진 · SROI · 벤치마크',
    minChars: 700,
    maxChars: 1200,
    maxTokens: 2500,
    requiresSlices: ['rfp', 'budget'],
  },
  6: {
    title: '기대 성과 및 임팩트',
    focus: 'Logic Model 5계층 · 측정계획 · SROI',
    minChars: 700,
    maxChars: 1300,
    maxTokens: 3000,
    requiresSlices: ['rfp', 'impact'],
  },
  7: {
    title: '수행 역량 및 실적',
    focus: 'UD 실적 · 수주 사례 · 보증',
    minChars: 500,
    maxChars: 1000,
    maxTokens: 2000,
    requiresSlices: [],
  },
}

export interface GenerateSectionInput {
  sectionNo: ProposalSectionNo
  context: PipelineContext
  /** 부분 재생성 시 보존할 문단 힌트 (간단 처리 — 프롬프트에 주입) */
  keepParts?: string
}

export interface SectionMetadata {
  sectionNo: ProposalSectionNo
  charCount: number
  /** 감지된 키 메시지 이름 (정량포화 · 4중지원 · 실행보장 · IMPACT · ACT-PRENEUR) */
  keyMessagesDetected: string[]
  compliantWithBrand: boolean
  /** 경고 메시지 (치명 아님 — 분량 약간 미달·키 메시지 1개 이하 등) */
  warnings: string[]
  /** 이 섹션 생성에 사용된 슬라이스 */
  contextSlicesUsed: PipelineSliceKey[]
  /** 재시도 여부 */
  retried: boolean
}

export type GenerateSectionResult =
  | { ok: true; content: string; metadata: SectionMetadata }
  | { ok: false; error: string }

// ═════════════════════════════════════════════════════════════════
// 2. 공통 프롬프트 블록 빌더
// ═════════════════════════════════════════════════════════════════

/** RFP 요약 블록 — 모든 섹션 공통 */
function buildRfpBrief(ctx: PipelineContext): string {
  const rfp = ctx.rfp?.parsed
  if (!rfp) return '(RFP 미파싱)'
  const lines: string[] = []
  lines.push('[사업 기본 정보]')
  lines.push(`- 사업명: ${rfp.projectName || '(미기재)'}`)
  lines.push(`- 발주기관: ${rfp.client || '(미기재)'}`)
  if (rfp.region) lines.push(`- 지역: ${rfp.region}`)
  if (rfp.totalBudgetVat || rfp.supplyPrice) {
    const krw = rfp.totalBudgetVat ?? rfp.supplyPrice ?? 0
    lines.push(`- 예산: ${(krw / 100_000_000).toFixed(2)}억원`)
  }
  lines.push(
    `- 대상: ${rfp.targetAudience || '(미기재)'}${rfp.targetCount ? ` / ${rfp.targetCount}명` : ''}`,
  )
  if (rfp.targetStage?.length) lines.push(`- 창업 단계: ${rfp.targetStage.join(', ')}`)
  if (rfp.objectives?.length) lines.push(`- 사업 목표: ${rfp.objectives.join(' · ')}`)
  if (rfp.summary) lines.push(`- 요약: ${rfp.summary}`)
  return lines.join('\n')
}

/** 채널 톤 블록 — projectType(B2G/B2B) 을 PlanningChannel 로 매핑 */
function buildChannelTone(ctx: PipelineContext): string {
  // PipelineContext.meta.projectType 은 'B2G'|'B2B'. renewal 은 channelType 에서.
  const pt = ctx.meta.projectType
  const channel: PlanningChannel =
    ctx.meta.channelType === 'renewal' ? 'renewal' : pt === 'B2B' ? 'B2B' : 'B2G'
  return `[발주처 유형: ${channel}]\n${CHANNEL_TONE_PROMPT[channel]}`
}

/** 평가배점 전략 블록 (Step 1D 산출물) */
function buildEvalStrategyNote(ctx: PipelineContext): string {
  const es = ctx.rfp?.evalStrategy
  if (!es || es.topItems.length === 0) return ''
  const lines: string[] = []
  lines.push('[평가배점 전략 — 상위 배점 항목에 정조준]')
  for (const it of es.topItems) {
    const pct = Math.round((it.weight ?? 0) * 100)
    lines.push(
      `  • ${it.name} ${it.points}점 (전체 ${pct}%) — 제안서 "${sectionLabel(it.section)}" 섹션 — ${it.guidance}`,
    )
  }
  if (es.overallGuidance.length > 0) {
    lines.push('전체 전략:')
    for (const g of es.overallGuidance) lines.push(`  - ${g}`)
  }
  return lines.join('\n')
}

/** Strategy 슬라이스의 키 메시지 주입 (Planning Agent 산출물) */
function buildStrategyKeyMessages(ctx: PipelineContext): string {
  const s = ctx.strategy
  if (!s) return ''
  const lines: string[] = []
  lines.push('[Planning Agent 전략 맥락 — 제안서에 자연스럽게 반영]')
  if (s.whyUs) lines.push(`- Why Us: ${s.whyUs}`)
  if (s.clientHiddenWants) lines.push(`- 발주처 숨은 Want: ${s.clientHiddenWants}`)
  if (s.mustNotFail) lines.push(`- 절대 실패하면 안 되는 것: ${s.mustNotFail}`)
  if (s.competitorWeakness) lines.push(`- 경쟁사 약점: ${s.competitorWeakness}`)
  if (s.derivedKeyMessages.length > 0) {
    lines.push('- 파생 키 메시지:')
    for (const km of s.derivedKeyMessages) lines.push(`    • ${km}`)
  }
  return lines.join('\n')
}

// ═════════════════════════════════════════════════════════════════
// 3. 섹션별 specific 프롬프트 블록
// ═════════════════════════════════════════════════════════════════

function buildSection1Context(ctx: PipelineContext): string {
  const rfp = ctx.rfp
  const lines: string[] = []
  lines.push('[Step 1 에서 PM 이 확정한 기획 방향]')
  lines.push(`- 제안 배경 초안: ${rfp?.proposalBackground ?? '(미확정 — RFP 를 기반으로 새로 작성)'}`)
  lines.push(`- 제안 컨셉: ${rfp?.proposalConcept ?? '(미확정)'}`)
  const pts = rfp?.keyPlanningPoints
  if (pts && pts.length > 0) {
    lines.push('- 핵심 기획 포인트:')
    pts.forEach((p, i) => lines.push(`    ${i + 1}. ${p}`))
  } else {
    lines.push('- 핵심 기획 포인트: (미확정 — RFP 목표에서 역추적)')
  }
  const similar = rfp?.similarProjects
  if (similar && similar.length > 0) {
    lines.push('[유사 수주 사업 참고]')
    for (const s of similar.slice(0, 3)) {
      const wonTag = s.won ? '수주' : s.won === false ? '미수주' : '참고'
      lines.push(
        `  - ${s.name} (${s.client ?? '발주처 미상'}, ${wonTag})${
          s.keyStrategy ? ` — 전략: ${s.keyStrategy}` : ''
        }`,
      )
    }
  }
  return lines.join('\n')
}

function buildSection2Context(ctx: PipelineContext): string {
  const s = ctx.strategy
  if (!s) return '(전략 슬라이스 미확정 — Planning Agent 세션 필요)'
  const lines: string[] = []
  lines.push('[전략 차별화 포인트 — "추진 전략" 본문의 헤드라인 재료]')
  if (s.internalAdvantage) lines.push(`- 내부 강점: ${s.internalAdvantage}`)
  if (s.derivedKeyMessages.length > 0) {
    lines.push('- 파생 키 메시지 (본문에 브랜딩해서 배치):')
    s.derivedKeyMessages.forEach((km, i) => lines.push(`    ${i + 1}. ${km}`))
  }
  if (s.riskFactors.length > 0) {
    lines.push('- 리스크 요인 (대응 전략 문단에 반영):')
    for (const r of s.riskFactors) lines.push(`    • ${r}`)
  }
  if (s.decisionMakers) lines.push(`- 의사결정자 프로필: ${s.decisionMakers}`)
  return lines.join('\n')
}

function buildSection3Context(ctx: PipelineContext): string {
  const c = ctx.curriculum
  if (!c) return '(커리큘럼 슬라이스 미확정)'
  const curriculumBlock = buildCurriculumContextForProposal(
    c.sessions.map((s) => ({
      sessionNo: s.sessionNo,
      title: s.title,
      durationHours: s.durationHours,
      isTheory: s.isTheory,
      isActionWeek: s.isActionWeek,
      isCoaching1on1: s.isCoaching1on1,
      objectives: s.objectives,
      impactModuleCode: s.impactModuleCode,
    })),
  )
  const extra: string[] = []
  if (c.designRationale) {
    extra.push('')
    extra.push('[설계 근거 — PM 확정]')
    extra.push(c.designRationale)
  }
  if (c.tracks.length > 1) {
    extra.push('')
    extra.push('[트랙 구성]')
    for (const t of c.tracks) {
      extra.push(
        `  - ${t.name}${t.description ? `: ${t.description}` : ''} — 세션 ${(t.sessionNos ?? []).join(', ')}`,
      )
    }
  }
  const mappingCount = Object.keys(c.impactModuleMapping).length
  if (mappingCount > 0) {
    extra.push('')
    extra.push(`[IMPACT 모듈 매핑: ${mappingCount}개 세션]`)
  }
  if (c.ruleValidation.violations.length > 0) {
    extra.push('')
    extra.push('[커리큘럼 룰 검증 경고 — 제안서 본문에서 "이유를 설명" 하는 형태로 선제 대응]')
    for (const v of c.ruleValidation.violations) {
      extra.push(`  - [${v.action}] ${v.message}`)
    }
  }
  return curriculumBlock + extra.join('\n')
}

function buildSection4Context(ctx: PipelineContext): string {
  const coaches = ctx.coaches
  const lines: string[] = []
  lines.push('[4중 지원 체계 — 반드시 본문에 언급, "단일 코치" 표현 금지]')
  for (const l of UD_SUPPORT_LAYERS) {
    lines.push(`  - ${l.layer}: ${l.role}`)
  }
  if (!coaches) {
    lines.push('')
    lines.push('(코치 슬라이스 미확정 — 4중 체계와 브랜드 자산 중심으로 작성)')
    return lines.join('\n')
  }
  lines.push('')
  lines.push('[확정된 코치 배정]')
  lines.push(
    `- 총 배정: ${coaches.assignments.length}명 / 총 사례비: ${coaches.totalFee.toLocaleString()}원`,
  )
  for (const a of coaches.assignments.slice(0, 10)) {
    const hours = a.totalHours ?? a.sessions * a.hoursPerSession
    lines.push(
      `  • ${a.coachName ?? a.coachId} (${a.role}) — ${a.sessions}회 × ${a.hoursPerSession}h = ${hours}h${
        a.totalFee ? ` / ${a.totalFee.toLocaleString()}원` : ''
      }`,
    )
    const reason = coaches.recommendationReasons[a.coachId]
    if (reason) lines.push(`    추천 사유: ${reason}`)
  }
  const mapped = Object.keys(coaches.sessionCoachMap).length
  if (mapped > 0) lines.push(`- 세션-코치 매핑 완료: ${mapped}개 회차`)
  return lines.join('\n')
}

function buildSection5Context(ctx: PipelineContext): string {
  const b = ctx.budget
  if (!b) return '(예산 슬라이스 미확정)'
  const s = b.structure
  const lines: string[] = []
  lines.push('[확정된 예산 구조]')
  lines.push(
    `- 총 직접비(PC): ${s.pcTotal.toLocaleString()}원 / 간접비(AC): ${s.acTotal.toLocaleString()}원`,
  )
  lines.push(
    `- 마진: ${s.margin.toLocaleString()}원 (${(s.marginRate * 100).toFixed(1)}%)`,
  )
  lines.push('- 주요 항목:')
  for (const item of s.items.slice(0, 12)) {
    lines.push(
      `  • [${item.wbsCode}] ${item.category} · ${item.name}: ${item.amount.toLocaleString()}원 (${item.type})`,
    )
  }
  if (s.items.length > 12) lines.push(`  ... 외 ${s.items.length - 12}건`)

  if (b.sroiForecast) {
    lines.push('')
    lines.push('[SROI 예측]')
    lines.push(
      `- 총 SROI 가치: ${b.sroiForecast.totalValueKrw.toLocaleString()}원 / 비율 ${b.sroiForecast.ratio.toFixed(2)}`,
    )
    if (b.sroiForecast.country) lines.push(`- 기준 국가: ${b.sroiForecast.country}`)
    if (b.sroiForecast.breakdown && b.sroiForecast.breakdown.length > 0) {
      lines.push('- 주요 임팩트 분해:')
      for (const br of b.sroiForecast.breakdown.slice(0, 5)) {
        lines.push(
          `    • ${br.impactType}${br.subType ? ` (${br.subType})` : ''}: ${br.contributionKrw.toLocaleString()}원`,
        )
      }
    }
  }

  if (b.benchmark) {
    lines.push('')
    lines.push('[벤치마크]')
    lines.push(`- 비교 프로젝트 ${b.benchmark.comparedCount}건`)
    if (b.benchmark.averageUnitCost != null && b.benchmark.ourUnitCost != null) {
      lines.push(
        `- 평균 단가 ${b.benchmark.averageUnitCost.toLocaleString()}원 vs 우리 ${b.benchmark.ourUnitCost.toLocaleString()}원`,
      )
    }
    if (b.benchmark.averageSroiRatio != null) {
      lines.push(`- 평균 SROI 비율: ${b.benchmark.averageSroiRatio.toFixed(2)}`)
    }
  }

  if (b.warnings.length > 0) {
    lines.push('')
    lines.push('[예산 룰 경고 — 선제적 설명 필요]')
    for (const w of b.warnings) {
      lines.push(`  - [${w.severity}] ${w.message}`)
    }
  }
  return lines.join('\n')
}

function buildSection6Context(ctx: PipelineContext): string {
  const imp = ctx.impact
  if (!imp) return '(임팩트 슬라이스 미확정)'
  const lm = imp.logicModel
  const lines: string[] = []
  lines.push('[임팩트 목표]')
  lines.push(`- ${imp.goal || lm.impactGoal || '(미설정)'}`)
  lines.push('')
  lines.push('[Logic Model 5계층 — 각 계층의 ID 를 본문에 인용해 인과관계 연결]')
  const layers: Array<[string, typeof lm.impact]> = [
    ['Impact', lm.impact],
    ['Outcome', lm.outcome],
    ['Output', lm.output],
    ['Activity', lm.activity],
    ['Input', lm.input],
  ]
  for (const [label, items] of layers) {
    if (items.length === 0) continue
    lines.push(`■ ${label}`)
    for (const it of items.slice(0, 6)) {
      const proxy = it.sroiProxy ? ` / SROI:${it.sroiProxy}` : ''
      const val = it.estimatedValue ? ` / ${it.estimatedValue}` : ''
      const link = it.linkedTo && it.linkedTo.length > 0 ? ` ← ${it.linkedTo.join(',')}` : ''
      lines.push(`  - [${it.id}] ${it.text}${proxy}${val}${link}`)
    }
  }

  if (imp.measurementPlan.length > 0) {
    lines.push('')
    lines.push('[측정 계획 — 본문 "측정 체계" 소단원에서 구체 인용]')
    for (const m of imp.measurementPlan.slice(0, 8)) {
      lines.push(
        `  - [${m.logicModelItemId}] ${m.indicator} · ${m.method} · ${m.timing}${
          m.target != null ? ` → 목표 ${m.target}${m.unit ?? ''}` : ''
        }`,
      )
    }
  }

  if (lm.externalInsights.length > 0) {
    lines.push('')
    lines.push('[외부 벤치마크·인사이트]')
    for (const e of lm.externalInsights.slice(0, 3)) {
      lines.push(`  - [${e.type}] ${e.message} (출처: ${e.source})`)
    }
  }

  if (imp.autoExtracted.activities || imp.autoExtracted.inputs) {
    const auto: string[] = []
    if (imp.autoExtracted.activities) auto.push('활동(커리큘럼)')
    if (imp.autoExtracted.inputs) auto.push('투입(코치·예산)')
    lines.push('')
    lines.push(`(참고: ${auto.join('·')} 계층은 이전 스텝에서 자동 추출됨)`)
  }
  return lines.join('\n')
}

function buildSection7Context(): string {
  return [
    '[섹션 7 — 수행 역량 및 실적]',
    '이 섹션은 상단 [언더독스 브랜드 자산] 블록의 실적·자체 도구·4중 지원 체계를 중심으로 작성합니다.',
    '정량 수치(코치 800명, 누적 500억+, 창업가 20,211명, 96개 지역, 520+ 파트너 등)를',
    '문단에 고르게 분포시키고, 본 사업 유형에 유사한 수주 레퍼런스 1~2건을 구체적으로 인용하세요.',
  ].join('\n')
}

function buildSectionSpecific(
  sectionNo: ProposalSectionNo,
  ctx: PipelineContext,
): string {
  switch (sectionNo) {
    case 1:
      return buildSection1Context(ctx)
    case 2:
      return buildSection2Context(ctx)
    case 3:
      return buildSection3Context(ctx)
    case 4:
      return buildSection4Context(ctx)
    case 5:
      return buildSection5Context(ctx)
    case 6:
      return buildSection6Context(ctx)
    case 7:
      return buildSection7Context()
  }
}

// ═════════════════════════════════════════════════════════════════
// 4. 전체 프롬프트 조립
// ═════════════════════════════════════════════════════════════════

async function buildSectionPrompt(
  input: GenerateSectionInput,
  retryHint?: string,
): Promise<string> {
  const spec = PROPOSAL_SECTION_SPEC[input.sectionNo]
  const ctx = input.context

  // Wave G6 (ADR-009) — PM 이 Step 1 에서 승인한 UD 자산을 섹션별로 필터·포맷해서 주입.
  // 자산 없음(acceptedAssetIds 미설정 또는 빈 배열) 이면 빈 문자열 → 기존 프롬프트 동작 유지.
  // Phase H Wave H2 (ADR-010): formatAcceptedAssets 가 DB 비동기 조회 → await.
  const sectionKey = SECTION_NO_TO_KEY[input.sectionNo]
  const assetBlockRaw = await formatAcceptedAssets(ctx.acceptedAssetIds, sectionKey)
  const assetBlock = assetBlockRaw.trim().length > 0
    ? `[언더독스 자산 활용 지시 — PM 승인 자산, Wave G6]\n${assetBlockRaw}`
    : ''

  const commonBlocks: string[] = [
    COMMON_PLANNING_PRINCIPLES,
    buildBrandContext(),
    buildRfpBrief(ctx),
    buildChannelTone(ctx),
    buildEvalStrategyNote(ctx),
    buildStrategyKeyMessages(ctx),
    // PM 이 각 스텝에서 수집한 티키타카 리서치 답변 — 모든 섹션 생성에 공통 주입
    // (pm-guide/sections/research-requests.tsx → POST /api/projects/[id]/research
    //  → Project.externalResearch → PipelineContext.research → 여기)
    ctx.research && ctx.research.length > 0
      ? formatExternalResearch(ctx.research)
      : '',
    // UD 자산 블록은 섹션 specific 컨텍스트 바로 앞에 배치되도록 common 뒤에 append.
    assetBlock,
  ].filter((s) => s.trim().length > 0)
  const common = commonBlocks.join('\n\n')

  const sectionContext = buildSectionSpecific(input.sectionNo, ctx)

  const keepBlock = input.keepParts?.trim()
    ? `\n\n[다음 문단/내용은 유지하고, 나머지를 이 힌트에 맞춰 재생성하세요]\n${input.keepParts.trim()}`
    : ''

  const retryBlock = retryHint ? `\n\n[재생성 힌트 — 이전 응답 품질 미달]\n${retryHint}` : ''

  const outputInstruction = `
[섹션 ${input.sectionNo}: ${spec.title}]
초점: ${spec.focus}
분량: ${spec.minChars}~${spec.maxChars}자 (근거가 풍부하면 상한 초과 허용, 하한은 지킬 것)

[언더독스 문체 규칙 — 반드시 준수]
- 자신감 있는 선언형 ("~합니다", "~입니다"). "~할 수 있습니다" 류 약한 어조 금지.
- 모든 주장은 정량 근거 (정량 포화 원칙). "많은", "다양한" 같은 모호 표현 금지.
- 핵심 컨셉은 따옴표 브랜딩 또는 영문 믹스 ("4중 페이스메이커", "Action Week" 등).
- 법인명은 "언더독스" 로 통일. 본문에 "유디임팩트" / "UD Impact" 섞지 말 것.
- "IMPACT" 는 대문자 고정 — "임팩트 방법론" 으로 약화 금지.

[금지 (ud-brand-voice SKILL §11)]
- "AI 코치 모듈/서비스" 를 별도 상품·레이어로 표현 금지. 4중 지원 체계를 강화하는 도구로만 언급.
- "약자" 를 동정·자선 프레임으로 쓰지 말 것. Underdog 재정의(의지로 변화를 만드는 사람) 존중.
- 자체 도구 이름 변형 금지 (ACT-PRENEURSHIP · DOGS · 6 Dimension · EduBot 등 표기 그대로).

[출력 형식]
- 마크다운 본문만 반환. 헤드라인(##, ###)과 리스트 자유 활용.
- 코드블록(\`\`\`)·JSON 래핑·"답변:" 류 메타 설명 금지.
- 첫 줄부터 섹션 본문으로 바로 시작.
`.trim()

  return [common, sectionContext, outputInstruction + keepBlock + retryBlock]
    .filter((s) => s.trim().length > 0)
    .join('\n\n')
}

// ═════════════════════════════════════════════════════════════════
// 5. Claude 호출 (마크다운 본문 직접 추출)
// ═════════════════════════════════════════════════════════════════

// 2026-05-03: anthropic → invokeAi (Gemini Primary + Claude Fallback)
async function callClaudeText(prompt: string, maxTokens: number): Promise<string> {
  const result = await invokeAi({
    prompt,
    maxTokens,
    temperature: 0.4,
    label: 'proposal-ai',
  })
  return result.raw.trim()
}

/** 응답에서 흔한 마크다운 래퍼(```...```) 를 제거 */
function stripMarkdownFence(raw: string): string {
  let s = raw.trim()
  if (s.startsWith('```')) {
    s = s.replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '').trim()
  }
  return s
}

// ═════════════════════════════════════════════════════════════════
// 6. 품질 검증
// ═════════════════════════════════════════════════════════════════

interface ValidationResult {
  passed: boolean
  issues: string[]
  warnings: string[]
  keyMessagesDetected: string[]
}

/**
 * 섹션 본문이 최소 품질 기준을 만족하는지 검사.
 * - 분량 min/max
 * - 브랜드 금지 표현 미포함
 * - 최소 키 메시지 1개 반영
 * - 섹션 3(커리큘럼) → Action Week 언급 필수
 * - 섹션 5(예산) → 실제 금액 숫자 등장 필수
 */
function validateSection(
  sectionNo: ProposalSectionNo,
  content: string,
  ctx: PipelineContext,
): ValidationResult {
  const spec = PROPOSAL_SECTION_SPEC[sectionNo]
  const issues: string[] = []
  const warnings: string[] = []

  const trimmed = content.trim()
  const len = trimmed.length

  // 1. 분량
  if (len < spec.minChars) {
    issues.push(`분량 부족: ${len}자 < 최소 ${spec.minChars}자`)
  } else if (len > spec.maxChars * 1.5) {
    // 상한은 +50% 여유, 그 이상은 경고
    warnings.push(`분량 초과 (상한 ${spec.maxChars}자, 실제 ${len}자)`)
  }

  // 2. 브랜드 금지 표현 (SKILL §11)
  const forbiddenPatterns: Array<{ pattern: RegExp; label: string }> = [
    // "AI 코치 모듈/서비스/상품" 처럼 별도 상품 표현 감지
    { pattern: /AI\s*코치\s*(모듈|서비스|상품|레이어|제품)/i, label: 'AI 코치 별도 상품 표현' },
    // "약자를 돕/지원/구제" 류 동정 프레임
    { pattern: /약자(를|들을)?\s*(돕|구제|지원해|동정|자선)/, label: '약자 동정 프레임' },
    // IMPACT 소문자화
    { pattern: /임팩트\s*방법론/, label: 'IMPACT 방법론 한글 약화 (대문자 고정)' },
  ]
  for (const { pattern, label } of forbiddenPatterns) {
    if (pattern.test(trimmed)) {
      issues.push(`금지 표현 감지: ${label}`)
    }
  }

  // 3. 법인명 혼용 — "유디임팩트" / "UD Impact" 가 본문에 등장하면 경고
  //    (섹션 7 의 법적 정보 블록은 예외적 허용)
  if (sectionNo !== 7) {
    const hasLegalMix =
      /유디임팩트/.test(trimmed) || /\bUD\s*Impact\b/i.test(trimmed)
    if (hasLegalMix) {
      warnings.push('법인명 혼용 감지 — 본문은 "언더독스" 로 통일 권장')
    }
  }

  // 4. 키 메시지 감지
  const keyMessageRules: Array<{ name: string; pattern: RegExp }> = [
    { name: '정량포화', pattern: /\d{2,}(명|개|%|억|회|건|팀|시간|개국|년)/ },
    { name: '4중지원', pattern: /4중\s*(지원|페이스메이커|체계)/ },
    { name: '실행보장', pattern: /실행\s*보장|끝까지\s*책임|Action\s*Week/i },
    { name: 'IMPACT', pattern: /\bIMPACT\b/ },
    { name: 'ACT-PRENEUR', pattern: /ACT[-\s]?PRENEUR|액트프러너|Actpreneur/i },
    { name: '자체도구', pattern: /ACT-PRENEURSHIP|DOGS\b|6\s*Dimension|EduBot|언더베이스/ },
  ]
  const keyMessagesDetected: string[] = []
  for (const rule of keyMessageRules) {
    if (rule.pattern.test(trimmed)) keyMessagesDetected.push(rule.name)
  }
  if (keyMessagesDetected.length === 0) {
    issues.push('키 메시지 최소 1개 반영 필요 (정량포화 · 4중지원 · 실행보장 · IMPACT · ACT-PRENEUR · 자체도구)')
  }

  // 5. 섹션별 추가 기준
  if (sectionNo === 3) {
    // 커리큘럼에 Action Week 언급 확인 (세션에 AW 가 실제 있을 때만 강제)
    const hasAW = (ctx.curriculum?.sessions ?? []).some((s) => s.isActionWeek)
    if (hasAW && !/Action\s*Week|AW/i.test(trimmed)) {
      issues.push('섹션 3: 커리큘럼에 Action Week 가 포함되어 있으나 본문에 언급되지 않음')
    }
  }
  if (sectionNo === 5) {
    // 실제 금액 숫자(천단위 콤마 또는 "원" / "억원") 등장 확인
    const hasAmount = /(\d{1,3}(,\d{3})+|\d+(\.\d+)?\s*(억|천|만)?원)/.test(trimmed)
    if (!hasAmount) {
      issues.push('섹션 5: 실제 예산 금액 숫자가 본문에 등장하지 않음')
    }
  }
  if (sectionNo === 6) {
    // Logic Model 항목 ID(OC-, OP-, AC-, IN-, IM-) 중 하나라도 인용되면 가점
    const hasLmId = /\b(IM|OC|OP|AC|IN)-\d+\b/.test(trimmed)
    if (!hasLmId) {
      warnings.push('섹션 6: Logic Model 항목 ID 인용 권장 (OC-1 ← OP-1 형식)')
    }
  }

  return {
    passed: issues.length === 0,
    issues,
    warnings,
    keyMessagesDetected,
  }
}

function buildMetadata(
  input: GenerateSectionInput,
  content: string,
  validation: ValidationResult,
  retried: boolean,
): SectionMetadata {
  const spec = PROPOSAL_SECTION_SPEC[input.sectionNo]
  // 실제 context 에 존재하는 슬라이스만 표시
  const slicesUsed: PipelineSliceKey[] = []
  for (const s of spec.requiresSlices) {
    if (input.context[s] !== undefined) slicesUsed.push(s)
  }
  return {
    sectionNo: input.sectionNo,
    charCount: content.trim().length,
    keyMessagesDetected: validation.keyMessagesDetected,
    compliantWithBrand: validation.issues.length === 0,
    warnings: validation.warnings,
    contextSlicesUsed: slicesUsed,
    retried,
  }
}

// ═════════════════════════════════════════════════════════════════
// 7. 메인 함수
// ═════════════════════════════════════════════════════════════════

/**
 * 제안서 섹션을 생성합니다.
 *
 * 1. 섹션별 requiresSlices 검증 → 없으면 SLICE_REQUIRED:{slice} 에러
 * 2. 프롬프트 조립 → Claude 호출 (마크다운 본문)
 * 3. 분량·브랜드·키메시지 검증 → 실패 시 1회 재시도
 * 4. 재시도도 실패 시 VALIDATION_FAILED 에러
 *
 * 저장은 호출자 책임 (본 함수는 stateless).
 */
export async function generateProposalSection(
  input: GenerateSectionInput,
): Promise<GenerateSectionResult> {
  const spec = PROPOSAL_SECTION_SPEC[input.sectionNo]
  if (!spec) {
    return { ok: false, error: `INVALID_SECTION_NO:${input.sectionNo}` }
  }

  // 1. 슬라이스 의존성 검증
  for (const slice of spec.requiresSlices) {
    if (input.context[slice] === undefined) {
      return { ok: false, error: `SLICE_REQUIRED:${slice}` }
    }
  }

  // 2. 1차 생성
  const prompt = await buildSectionPrompt(input)
  let raw: string
  try {
    raw = await callClaudeText(prompt, spec.maxTokens)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: `CLAUDE_CALL_FAILED:${msg}` }
  }
  let content = stripMarkdownFence(raw)

  let validation = validateSection(input.sectionNo, content, input.context)
  let retried = false

  // 3. 재시도 1회
  if (!validation.passed) {
    retried = true
    const retryHint = validation.issues.join(' / ')
    const retryPrompt = await buildSectionPrompt(input, retryHint)
    let retryRaw: string
    try {
      retryRaw = await callClaudeText(retryPrompt, spec.maxTokens)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, error: `CLAUDE_CALL_FAILED:${msg}` }
    }
    const retryContent = stripMarkdownFence(retryRaw)
    const retryValidation = validateSection(
      input.sectionNo,
      retryContent,
      input.context,
    )
    if (!retryValidation.passed) {
      return {
        ok: false,
        error: 'VALIDATION_FAILED: ' + retryValidation.issues.join('; '),
      }
    }
    content = retryContent
    validation = retryValidation
  }

  return {
    ok: true,
    content,
    metadata: buildMetadata(input, content, validation, retried),
  }
}
