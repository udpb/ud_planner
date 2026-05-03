/**
 * Curriculum AI — Step 2 커리큘럼 생성 (stateless)
 *
 * 책임:
 *   - 입력: RfpSlice + (옵션) StrategySlice + (옵션) ImpactModuleContext[] + ExternalResearch[]
 *           + (옵션) ProgramProfile — 방법론 스위치 주입용
 *   - 출력: CurriculumSession[] + designRationale + appliedDirection 검증 체크리스트
 *   - DB 저장 ❌ — 호출자(API route 또는 step-curriculum UI) 가 저장 책임
 *
 * 설계 철학:
 *   Step 1 에서 PM 이 확정한 "제안 컨셉 · 핵심 기획 포인트 · 평가배점 전략" 을
 *   프롬프트에 최우선으로 주입하여 Step 1 과 Step 2 가 따로 놀지 않도록 보장.
 *   `appliedDirection` 에서 실제 반영 여부를 AI 가 자가 보고 → 수주 팀 검증용.
 *
 * Phase E 변경 (2026-04-20, ADR-006 ProgramProfile v1.0 참조):
 *   - 과거: 모든 커리큘럼을 IMPACT 18모듈 기본 프레임으로 생성 (로컬브랜드·공모전·
 *          매칭 사업에도 억지로 I-1 ~ T-3 매핑).
 *   - 이제: `profile.methodology.primary` (9종) 를 스위치로 사용하여 해당 방법론에
 *          맞는 프레임 가이드를 주입. IMPACT 강제 매핑은 methodology.primary === 'IMPACT'
 *          일 때만 수행. profile 미전달 시 기존 동작 유지 (back-compat).
 *   - 신규 헬퍼: buildMethodologyBlock(profile) → 프롬프트 조각 반환.
 *   - 참조: docs/architecture/program-profile.md Part 5.3,
 *          docs/decisions/006-program-profile.md
 *
 * 타 모듈과 관계:
 *   - `src/lib/pipeline-context.ts` — RfpSlice / StrategySlice / CurriculumSession / EvalStrategy 타입 재사용
 *   - `src/lib/program-profile.ts` — ProgramProfile · MethodologyPrimary (Phase E)
 *   - `src/lib/planning-direction.ts` — deriveChannel / CHANNEL_TONE_PROMPT 재사용 (B1 자산)
 *   - `src/lib/eval-strategy.ts` — sectionLabel (섹션 한국어 라벨)
 *   - `src/lib/ud-brand.ts` — buildBrandContext / buildImpactModulesContext / ImpactModuleContext 타입
 *   - `src/lib/claude.ts` — CLAUDE_MODEL · anthropic · ExternalResearch · formatExternalResearch · CurriculumSession (SSoT) 재사용
 *
 * 관련 Skill: `.claude/skills/ud-brand-voice/SKILL.md` §11 (금지 목록 — 약자 프레임·법인명 혼용 등)
 * 관련 문서: `docs/architecture/data-contract.md` §1.2 CurriculumSlice
 */

import { formatExternalResearch, type ExternalResearch } from '@/lib/ai/research'
import { invokeAi } from '@/lib/ai-fallback'
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
import type {
  ProgramProfile,
  MethodologyPrimary,
} from '@/lib/program-profile'
import { COMMON_PLANNING_PRINCIPLES } from '@/lib/planning-principles'
import { AI_TOKENS } from '@/lib/ai/config'

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
  /**
   * Phase E — 사업 스펙트럼 프로파일 (방법론 스위치용).
   * profile?.methodology.primary 에 따라 IMPACT / 로컬브랜드 / 글로컬 / 공모전설계 /
   * 매칭 / 재창업 / 글로벌진출 / 소상공인성장 / 커스텀 프레임 중 하나로 분기.
   * 전달되지 않으면 기존 IMPACT 기본 동작으로 fallback (back-compat).
   */
  profile?: ProgramProfile
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

// ─────────────────────────────────────────
// 방법론 스위치 (Phase E · ADR-006)
// ─────────────────────────────────────────

/**
 * 방법론별 커리큘럼 프레임 가이드 (프롬프트 조각).
 *
 * 커스텀 케이스의 customFrameworkName 은 buildMethodologyBlock() 에서
 * interpolation 처리하므로 여기서는 `${CUSTOM_FRAMEWORK_NAME}` placeholder 를 사용.
 */
const METHODOLOGY_PROMPT_BLOCKS: Record<MethodologyPrimary, string> = {
  IMPACT: `
커리큘럼 골격은 IMPACT 18모듈 (6단계: I·M·P·A·C·T) 을 기본으로 설계하시오.
- I: Ideation (아이덴티티 · 문제 발견)
- M: Market (고객·문제 검증)
- P: Product (솔루션·MVP)
- A: Acquisition (초기 50명 확보)
- C: Commercial (수익 구조)
- T: Team (조직·성장)
각 세션을 I-1 ~ T-3 코드 중 하나에 매핑하세요.
`,
  로컬브랜드: `
커리큘럼 골격은 상권강화기구 + 브랜딩 액션러닝 관점으로 설계하시오.
- 상권 진단 → 상인 협의체 조직화 → 브랜딩 워크숍 → 팝업/쇼케이스 → 상생 시스템 정착
- IMPACT 모듈 강제 매핑 금지. 대신 로컬 맥락(상권·주민·관광·상인 네트워크)에 맞는 실행 흐름을 설계.
- 1:1 밀착 코칭 + Action Week (현장 실행 주간) 포함 권장.
`,
  글로컬: `
커리큘럼 골격은 지역 × 글로벌 교류 구조로 설계하시오.
- 국내 장인/로컬 자원 발굴 → 해외 파트너 교류 → 공동 창작/전시 → 글로컬 쇼케이스
- 안성 글로컬 · 한국-중국-일본 3국 연합 같은 교류 네트워크 패턴 참조.
- 방법론 이름을 본문에 명시해 "장인 교류" · "공동 창작 워크숍" 등으로 표기.
`,
  공모전설계: `
커리큘럼 골격은 다단계 심사 + 사후 유통 연계 흐름으로 설계하시오.
- 공모 공고 → 서류 심사 → 컨설팅 (1~2회) → 실물 심사 → 시상 → 유통 입점/수출 연계
- 심사 단계별 멘토링 밀도 명시. 수상작의 시장 안착이 최종 산출물.
- IMPACT 모듈 매핑 생략 가능. 대신 "심사 단계별 역량 강화" 관점.
`,
  매칭: `
커리큘럼 골격은 멘토-수혜자 매칭 + 공동 프로젝트 흐름으로 설계하시오.
- 멘토 풀 구축 → 사전 진단 기반 페어링 → OT/킥오프 → 주간 멘토링 → Action Week → 결과 발표
- 코오롱 프로보노 패턴 참조. 멘토와 수혜자 양쪽 모두의 진단·만족도를 측정.
- 매칭 품질이 프로그램 전체 성과를 좌우함 — 페어링 로직을 명시.
`,
  재창업: `
커리큘럼 골격은 실패 분석 → 재설계 흐름으로 설계하시오.
- 이전 시도 회고 → 실패 원인 구조화 → 새 가설 설정 → 시장 재검증 → 재출발 전략
- 심리적 회복 · 자원 재정비 · 네트워크 재구축을 단계별로 포함.
- 단순 "다시 창업" 이 아니라 "학습을 기반으로 한 재설계" 관점.
`,
  글로벌진출: `
커리큘럼 골격은 Born Global 프레임으로 설계하시오.
- 타겟 시장 리서치 → 현지 고객 인터뷰 → MVP 현지 테스트 → 바이어 미팅 → 해외 법인 설립/진출
- 언더독스 일본·인도 지사 · 520+ 글로벌 파트너 네트워크 활용 경로 명시.
- 단계마다 "한국에서 해야 할 일" 과 "현지에서 해야 할 일" 을 구분.
`,
  소상공인성장: `
커리큘럼 골격은 매장 진단 → 리뉴얼 → 매출 개선 흐름으로 설계하시오.
- 매장 현장 방문 → 매출·객단가·재방문율 진단 → 리뉴얼 계획 → 실행 → 사후 추적
- 온라인 채널 전환 (네이버 스마트스토어 · 카카오톡채널 등) 포함 권장.
- IMPACT 강제 금지. 실제 매장 운영 개선 프레임 사용.
`,
  커스텀: `
커리큘럼 골격은 사업 도메인 특성에 맞게 커스텀 설계하시오.
- 참고 프레임워크명: "\${CUSTOM_FRAMEWORK_NAME}"
- IMPACT · 로컬 · 글로컬 등 기존 프레임을 억지로 적용하지 말 것.
- 대신 사업의 고유 목적 · 수혜자 · 산출물에 맞는 세션 구조를 제안.
`,
}

/**
 * ProgramProfile 의 methodology.primary 에 맞는 프롬프트 조각을 반환.
 *
 * - 커스텀 케이스는 `profile.methodology.customFrameworkName` 을 interpolate.
 *   미지정이면 "(미지정)" 으로 치환.
 * - 그 외는 정적 블록을 그대로 반환.
 *
 * 호출자: buildCurriculumPrompt (내부). 외부에서도 테스트 · 프리뷰 목적으로 호출 가능.
 */
export function buildMethodologyBlock(profile: ProgramProfile): string {
  const primary = profile.methodology.primary
  const block = METHODOLOGY_PROMPT_BLOCKS[primary]

  if (primary === '커스텀') {
    const name = profile.methodology.customFrameworkName ?? '(미지정)'
    return block.replace('${CUSTOM_FRAMEWORK_NAME}', name)
  }

  return block
}

/**
 * 레거시 IMPACT 기본 프레임 조각 (profile 미전달 시 fallback).
 * 프로젝트에 ProgramProfile 이 아직 없을 때 하위 호환을 보장.
 */
const LEGACY_IMPACT_FALLBACK_BLOCK = METHODOLOGY_PROMPT_BLOCKS.IMPACT

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
 *   5. 방법론 프레임 (Phase E · ProgramProfile.methodology.primary)
 *      — profile 미전달 시 IMPACT 기본 프레임 fallback (레거시 호환)
 *   6. IMPACT 모듈 컨텍스트 (있으면 · primary === 'IMPACT' 일 때 실질적 가치)
 *   7. 외부 리서치 (있으면)
 *   8. 출력 형식 JSON 지시
 */
export function buildCurriculumPrompt(
  input: GenerateCurriculumInput,
  retryHint?: string,
): string {
  const { rfp, strategy, impactModules = [], externalResearch, totalSessions, profile } = input
  const channel: PlanningChannel = input.channel ?? deriveChannel(rfp.parsed)

  const brandBlock = buildBrandContext()
  const directionBlock = serializePlanningDirection(rfp)
  const evalBlock = serializeEvalStrategyBlock(rfp.evalStrategy)
  const strategyBlock = serializeStrategyBlock(strategy)

  // Phase E — 방법론 스위치.
  // profile 있음: methodology.primary 에 해당하는 프레임 가이드 주입.
  // profile 없음: 레거시 IMPACT 기본 프레임 fallback (기존 동작 보존).
  const methodologyBlock = profile
    ? buildMethodologyBlock(profile)
    : LEGACY_IMPACT_FALLBACK_BLOCK
  const methodologyLabel = profile?.methodology.primary ?? 'IMPACT (fallback)'

  // IMPACT 모듈 컨텍스트는 primary === 'IMPACT' 일 때만 실질적 가치가 있으나,
  // 호출자가 명시적으로 전달했다면 참고 자산으로 유지 (데이터 손실 방지).
  const shouldIncludeImpactModules =
    impactModules.length > 0 &&
    (!profile || profile.methodology.primary === 'IMPACT')
  const impactBlock = shouldIncludeImpactModules
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

${COMMON_PLANNING_PRINCIPLES}

[기획 방향]
${directionBlock}

${evalBlock ? `[평가배점]\n${evalBlock}\n` : ''}[발주처 톤: ${channel}] ${CHANNEL_TONE_PROMPT[channel]}

${rfpBlock}

[방법론 프레임: ${methodologyLabel}]
${methodologyBlock}
${impactBlock ? `\n${impactBlock}\n` : ''}
[설계 규칙]
- ${sessionCountHint}
- Action Week 최소 2회. 이론 3연속 금지.
- 세션당 50분 기본 (강의 15분 + 실습 35분).
- 각 세션의 설계 근거에는 [공통 설계 원칙] 4가지 중 해당하는 관점이 최소 1개 명시되어야 함 (예: "이 세션의 before=참여자 고객 인터뷰 0회 → after=5건 이상").

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
 * 커리큘럼 생성 — invokeAi (Gemini Primary / Claude Fallback) + JSON 파싱 + 검증.
 *
 * Phase L1 (2026-04-27): invokeAi 단일 진입점 도입. Gemini Primary 가 더 빠름.
 * 2026-05-03 (1차): anthropic 직접 호출 → invokeAi 마이그.
 * 2026-05-03 (2차): 60초 timeout 빈번 → 분할 호출 도입.
 *   - generateCurriculumOutline: 가벼운 호출 (~30초) — 회차 제목·태그·시간 + designRationale
 *   - enrichCurriculumDetails: outline 받아서 각 회차 detail 보강 (~30초)
 *   - generateCurriculum: 두 호출 합치는 헬퍼 (60초 한계 안전 마진 + 단일 호출 fallback)
 *
 * Stateless: DB 에 쓰지 않음. 호출자가 CurriculumItem 으로 저장.
 *
 * @param input GenerateCurriculumInput — rfp 필수, 나머지 optional
 * @returns 성공 시 { ok: true, data } / 실패 시 { ok: false, error, raw? }
 */
export async function generateCurriculum(
  input: GenerateCurriculumInput,
): Promise<GenerateCurriculumResult> {
  // 최소 입력 검증
  if (!input?.rfp?.parsed) {
    return { ok: false, error: '[curriculum-ai] rfp.parsed 가 없습니다' }
  }

  const prompt = buildCurriculumPrompt(input)
  let raw = ''

  try {
    const aiResult = await invokeAi({
      prompt,
      maxTokens: AI_TOKENS.LARGE,
      temperature: 0.4,
      label: 'curriculum',
    })
    raw = aiResult.raw

    const parsed = parseJsonStrict<GenerateCurriculumResponse>(raw, 'generateCurriculum')
    const err = validateGeneratedCurriculum(parsed, input)

    if (!err) {
      return { ok: true, data: parsed }
    }

    return {
      ok: false,
      error: `검증 실패: ${err}`,
      raw,
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: message, raw: raw || undefined }
  }
}

// ═════════════════════════════════════════════════════════════════
// 분할 호출 (2026-05-03) — 60초 timeout 우회
// ═════════════════════════════════════════════════════════════════

/**
 * 1단계: 가벼운 outline 호출 (~30초 목표)
 *   - 출력: 회차 제목·태그·시간 + designRationale + appliedDirection
 *   - 빠진 것 (2단계에서 채움): objectives, recommendedExpertise, notes, impactModuleCode
 *   - max_tokens: 6144
 *
 * 2026-05-03: buildCurriculumPrompt 전체 + hint 가 prompt 너무 길고 instruction
 *   혼동 — 별도 단순 prompt 로 분리. impactModules·externalResearch 제외.
 */
export async function generateCurriculumOutline(
  input: GenerateCurriculumInput,
): Promise<GenerateCurriculumResult> {
  if (!input?.rfp?.parsed) {
    return { ok: false, error: '[curriculum-ai/outline] rfp.parsed 가 없습니다' }
  }

  const rfp = input.rfp.parsed
  const totalSessions =
    input.totalSessions ?? (rfp as { totalSessions?: number }).totalSessions ?? 8
  const keyPoints = (input.rfp.keyPlanningPoints ?? []).slice(0, 5)
  const concept = input.rfp.proposalConcept ?? '(미설정)'
  const projectName = (rfp as { projectName?: string }).projectName ?? '(미상)'
  const methodology = input.profile?.methodology?.primary ?? 'IMPACT'

  // IMPACT 18 모듈 중 top 6 — outline 단계의 IMPACT 매핑 힌트 (퀄리티 ↑)
  const impactSummary =
    input.impactModules && input.impactModules.length > 0
      ? input.impactModules
          .slice(0, 6)
          .map((m) => `  ${m.moduleCode}. ${m.moduleName}`)
          .join('\n')
      : '  (impactModules 미주입 — 일반 흐름)'

  // 평가 가중치 top 1~2 (회차 비중 결정용)
  const evalTop =
    rfp.evalCriteria && rfp.evalCriteria.length > 0
      ? rfp.evalCriteria
          .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
          .slice(0, 2)
          .map((c) => `${c.item} (${c.score}점)`)
          .join(' · ')
      : '(평가표 미명시)'

  const prompt = `[1단계: 커리큘럼 골격 (Outline)]

[RFP 핵심]
- 사업명: ${projectName}
- 제안 컨셉: ${concept}
- 핵심 기획 포인트: ${keyPoints.length > 0 ? keyPoints.join(' · ') : '(미설정)'}
- 총 회차: ${totalSessions}회
- 발주 기관: ${rfp.client ?? '미상'}
- 대상: ${rfp.targetAudience ?? '미상'}
${rfp.objectives && rfp.objectives.length > 0 ? `- 목적: ${rfp.objectives.slice(0, 3).join(' / ')}` : ''}
- 평가표 top: ${evalTop}

[방법론·자산 활용 힌트]
- 주 방법론: ${methodology}
- IMPACT 18 모듈 중 핵심 6개 (회차에 매핑 권장):
${impactSummary}

[설계 원칙]
- Action Week (실전 주간) 1~2회 포함 권장
- 이론 강의 3회 연속 X — 실습/AW 사이에 배치
- 1:1 코칭은 Action Week 직후 페어 (자동 추가됨)
- ${methodology} 방법론 흐름에 회차 배치 정렬

[당신의 일 — 회차 골격만]
${totalSessions} 회차의 outline 만 채우세요. 상세 (objectives·notes 등) 는 2단계에서 보강.

[출력 JSON 스키마]
{
  "sessions": [
    {
      "sessionNo": 1,
      "title": "회차 제목 (간결)",
      "category": "LECTURE" | "WORKSHOP" | "PRACTICE" | "MENTORING" | "ACTION_WEEK" | "OTHERS",
      "method": "ONLINE" | "OFFLINE" | "HYBRID",
      "durationHours": 2 | 4 | 8,
      "lectureMinutes": 45,
      "practiceMinutes": 75,
      "isTheory": true | false,
      "isActionWeek": false,
      "isCoaching1on1": false,
      "objectives": [],
      "recommendedExpertise": [],
      "notes": "",
      "impactModuleCode": null
    }
  ],
  "designRationale": "200자 이상 — 어떤 기획 방향을 어느 회차에 반영했는지",
  "appliedDirection": {
    "conceptReflected": true,
    "keyPointsReflected": ${JSON.stringify(keyPoints.length > 0 ? keyPoints.map(() => '...반영 위치/방법...') : ['반영 위치 서술'])},
    "evalStrategyAlignment": "평가 가중치 top 1 항목에 대한 대응 전략 1~2 문장"
  }
}

JSON 만 출력. 마크다운 펜스·trailing comma 금지.`

  let raw = ''
  try {
    const aiResult = await invokeAi({
      prompt,
      maxTokens: AI_TOKENS.OUTLINE,
      temperature: 0.4,
      label: 'curriculum-outline',
    })
    raw = aiResult.raw

    const parsed = parseJsonStrict<GenerateCurriculumResponse>(raw, 'generateCurriculumOutline')
    if (!parsed.sessions || parsed.sessions.length === 0) {
      console.error('[curriculum-outline] sessions 비어있음. raw 앞 500:', raw.slice(0, 500))
      return { ok: false, error: 'outline: sessions 가 비어있음', raw }
    }
    if (!parsed.designRationale || parsed.designRationale.length < 100) {
      console.error(
        `[curriculum-outline] designRationale 짧음 (${parsed.designRationale?.length ?? 0}자). raw 앞 500:`,
        raw.slice(0, 500),
      )
      return {
        ok: false,
        error: `outline: designRationale 가 짧음 (${parsed.designRationale?.length ?? 0}자, 100자+ 필요)`,
        raw,
      }
    }
    return { ok: true, data: parsed }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[curriculum-outline] 예외:', message)
    if (raw) console.error('[curriculum-outline] raw 앞 500:', raw.slice(0, 500))
    return { ok: false, error: message, raw: raw || undefined }
  }
}

/**
 * 2단계: outline 의 각 회차에 detail 보강 (~30초 목표)
 *   - objectives, recommendedExpertise, notes, impactModuleCode 채움
 *   - max_tokens: AI_TOKENS.STANDARD
 */
export async function enrichCurriculumDetails(
  input: GenerateCurriculumInput,
  outline: GenerateCurriculumResponse,
): Promise<GenerateCurriculumResult> {
  if (!input?.rfp?.parsed) {
    return { ok: false, error: '[curriculum-ai/details] rfp.parsed 가 없습니다' }
  }

  const sessionsBrief = outline.sessions
    .map(
      (s) =>
        `${s.sessionNo}회차 "${s.title}" (${s.category}/${s.method}/${s.durationHours}h${
          s.isActionWeek ? '/AW' : s.isCoaching1on1 ? '/1on1' : s.isTheory ? '/이론' : '/실습'
        })`,
    )
    .join('\n')

  const detailsPrompt = `[분할 호출 2단계 — Details]

이미 1단계에서 정해진 커리큘럼 골격:
${sessionsBrief}

설계 근거: ${outline.designRationale.slice(0, 400)}

[당신의 일]
각 회차에 다음 detail 을 채워주세요. 회차 순서·제목·시간 등은 절대 변경하지 마세요:
- objectives: 회차 학습 목표 3~5개 (각 1줄)
- recommendedExpertise: 코치/강사 추천 전문성 1~3개
- notes: 회차 운영 노하우·주의점 (1~3 문장)
- impactModuleCode: IMPACT 18 모듈 중 매핑되는 모듈 코드 (해당 시 — null 도 OK)

[RFP 핵심]
- 사업명: ${input.rfp.parsed?.projectName ?? '미상'}
- 핵심 기획 포인트: ${(input.rfp.keyPlanningPoints ?? []).join(' · ') || '미설정'}
- 제안 컨셉: ${input.rfp.proposalConcept ?? '미설정'}

[IMPACT 모듈 후보 (회차에 매핑 추천)]
${(input.impactModules ?? [])
  .slice(0, 18)
  .map((m) => `${m.moduleCode}: ${m.moduleName} — ${m.coreQuestion?.slice(0, 50) ?? ''}`)
  .join('\n')}

[출력 JSON 스키마]
{
  "sessions": [
    {
      "sessionNo": <기존 그대로>,
      "title": "<기존 그대로>",
      "category": "<기존 그대로>",
      "method": "<기존 그대로>",
      "durationHours": <기존 그대로>,
      "lectureMinutes": <기존 그대로>,
      "practiceMinutes": <기존 그대로>,
      "isTheory": <기존 그대로>,
      "isActionWeek": <기존 그대로>,
      "isCoaching1on1": <기존 그대로>,
      "objectives": ["...", "...", "..."],
      "recommendedExpertise": ["...", "..."],
      "notes": "...",
      "impactModuleCode": "U1.0" | null
    }
  ],
  "designRationale": "<기존 그대로>",
  "appliedDirection": <기존 그대로>
}

JSON 만 출력. 설명·마크다운 펜스 없이. trailing comma 금지.`

  let raw = ''
  try {
    const aiResult = await invokeAi({
      prompt: detailsPrompt,
      maxTokens: AI_TOKENS.STANDARD,
      temperature: 0.3,
      label: 'curriculum-details',
    })
    raw = aiResult.raw

    const parsed = parseJsonStrict<GenerateCurriculumResponse>(raw, 'enrichCurriculumDetails')

    // outline 의 회차 수·순서 보존 검증
    if (
      !parsed.sessions ||
      parsed.sessions.length !== outline.sessions.length
    ) {
      return {
        ok: false,
        error: `details 단계: 회차 수 불일치 (outline ${outline.sessions.length} vs details ${parsed.sessions?.length ?? 0})`,
        raw,
      }
    }

    // 풀 검증
    const err = validateGeneratedCurriculum(parsed, input)
    if (err) {
      return { ok: false, error: `details 검증 실패: ${err}`, raw }
    }

    return { ok: true, data: parsed }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: message, raw: raw || undefined }
  }
}
