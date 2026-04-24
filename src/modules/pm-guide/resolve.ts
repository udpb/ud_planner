/**
 * PM Guide Resolve — 스텝·컨텍스트 기반으로 표시할 가이드 콘텐츠 결정
 *
 * Data Source:
 *   - WinningPattern (D1) — findWinningPatterns()
 *   - ChannelPreset (D2) — getChannelPreset()
 *   - Static Content — 흔한 실수 / UD 강점 팁
 *
 * Phase E (ADR-006):
 *   - `context.meta.programProfile` 가 있으면 프로파일 기반 유사도 매칭 경로.
 *   - 없으면 기존 sectionKey × channelType × outcome 3축 경로로 폴백.
 *   - 프로파일의 `methodology.primary` · `channel.type` 에 따라
 *     commonMistakes / udStrengthTips 를 조건부 필터링.
 *
 * ADR-005: 가이드북 본문 통째 주입 금지.
 */

import type { PipelineContext, ProposalSectionKey } from '@/lib/pipeline-context'
import {
  findWinningPatterns,
  type WinningPatternRecord,
} from '@/lib/winning-patterns'
import { getChannelPreset } from '@/lib/channel-presets'
import type {
  MethodologyPrimary,
  ProgramProfile,
} from '@/lib/program-profile'
import {
  COMMON_MISTAKES_BY_STEP,
  EVALUATOR_PERSPECTIVE_BY_STEP,
  EVALUATOR_PERSPECTIVE_FALLBACK,
  UD_STRENGTH_TIPS,
} from './static-content'
import { RESEARCH_REQUESTS_BY_STEP, normalizeResearchId } from './research-prompts'
import type {
  CommonMistake,
  PmGuideContent,
  ResolvedResearchRequest,
  StepKey,
} from './types'
import type { ExternalResearch } from '@/lib/claude'

// ─────────────────────────────────────────
// 상수
// ─────────────────────────────────────────

/** 스텝 → 제안서 섹션 매핑 */
const STEP_TO_SECTION: Record<StepKey, ProposalSectionKey> = {
  rfp: 'proposal-background',
  curriculum: 'curriculum',
  coaches: 'coaches',
  budget: 'budget',
  impact: 'impact',
  proposal: 'other',
}

/** Phase E 유사도 최소 임계값 — spec §5.2 */
const MIN_SIMILARITY = 0.35

/** Phase E 유사도 Top N */
const TOP_N_WINNING = 5

/** 4중 지원 체계가 의미 없는 방법론 (지원 팁 · 실수 필터링에 사용) */
const NON_STARTUP_METHODOLOGIES: readonly MethodologyPrimary[] = [
  '로컬브랜드',
  '글로컬',
  '공모전설계',
  '매칭',
] as const

/** 4중 지원 체계 coach-01 실수가 부적절한 방법론 (커스텀 포함) */
const COACH01_SKIP_METHODOLOGIES: readonly MethodologyPrimary[] = [
  '로컬브랜드',
  '글로컬',
  '공모전설계',
  '매칭',
  '커스텀',
] as const

// ─────────────────────────────────────────
// 채널 타입 도출 (legacy 경로용)
// ─────────────────────────────────────────

/**
 * `meta.programProfile` 미지정 시 기존 channelType 기반 채널 문자열을 도출.
 * - renewal 이면 'renewal'
 * - 그 외에는 projectType (B2G | B2B) 사용.
 */
function deriveLegacyChannel(context: PipelineContext): string {
  if (context.meta.channelType === 'renewal') return 'renewal'
  return context.meta.projectType ?? 'B2G'
}

/**
 * ProgramProfile 에서 ChannelPreset 조회용 채널 코드를 도출.
 * isRenewal=true 가 우선. 그 외에는 channel.type (B2G | B2B).
 */
function deriveChannelFromProfile(profile: ProgramProfile): string {
  if (profile.channel.isRenewal) return 'renewal'
  return profile.channel.type
}

// ─────────────────────────────────────────
// 필터링 헬퍼
// ─────────────────────────────────────────

/**
 * ProgramProfile 에 근거해 흔한 실수 리스트를 필터링한다.
 *
 * 규칙:
 *   - cur-03 (IMPACT 모듈 미매핑): methodology.primary !== 'IMPACT' → 제거
 *   - coach-01 (단일 코치 표현): 로컬브랜드·글로컬·공모전설계·매칭·커스텀 → 제거
 *   - bud-01 (B2G 직접비 <70%): channel.type !== 'B2G' → 제거
 *
 * @param mistakes 원본 흔한 실수 리스트 (static-content.ts)
 * @param profile  현재 사업의 ProgramProfile
 * @returns        프로파일에 적합한 실수만 남긴 배열
 */
function filterMistakesByProfile(
  mistakes: CommonMistake[],
  profile: ProgramProfile,
): CommonMistake[] {
  const method = profile.methodology.primary
  const channelType = profile.channel.type

  return mistakes.filter((m) => {
    if (m.id === 'cur-03' && method !== 'IMPACT') return false
    if (m.id === 'coach-01' && COACH01_SKIP_METHODOLOGIES.includes(method)) return false
    if (m.id === 'bud-01' && channelType !== 'B2G') return false
    return true
  })
}

/**
 * ProgramProfile 에 근거해 UD 강점 팁을 필터링한다.
 *
 * 규칙:
 *   - rfp "IMPACT 18모듈 ..." 팁: methodology !== 'IMPACT' → 제거
 *   - coaches "4중 지원 체계 ..." 팁:
 *     methodology ∈ {로컬브랜드, 글로컬, 공모전설계, 매칭} → 제거
 *   - 그 외는 모두 유지 (보편 팁).
 *
 * @param stepKey 스텝 키
 * @param tips    원본 팁 배열
 * @param profile 현재 사업의 ProgramProfile
 * @returns       프로파일에 적합한 팁만 남긴 배열
 */
function filterTipsByProfile(
  stepKey: StepKey,
  tips: string[],
  profile: ProgramProfile,
): string[] {
  const method = profile.methodology.primary

  return tips.filter((tip) => {
    if (stepKey === 'rfp' && tip.includes('IMPACT 18모듈') && method !== 'IMPACT') {
      return false
    }
    if (
      stepKey === 'coaches' &&
      tip.includes('4중 지원 체계') &&
      NON_STARTUP_METHODOLOGIES.includes(method)
    ) {
      return false
    }
    return true
  })
}

// ─────────────────────────────────────────
// 메인 resolve 함수
// ─────────────────────────────────────────

/**
 * 주어진 스텝과 파이프라인 컨텍스트에 따라 PM 가이드 콘텐츠를 조합합니다.
 *
 * - `context.meta.programProfile` 가 존재하면 Phase E 프로파일 경로로 동작.
 *   (WinningPattern: sourceProfile 보유 + similarity ≥ 0.35 Top 5,
 *    흔한 실수/팁은 방법론·채널 기준 필터링)
 * - 없으면 기존 3축 (sectionKey × channelType × outcome) 경로로 폴백.
 *
 * @param stepKey  현재 활성 스텝
 * @param context  PipelineContext (buildPipelineContext 결과)
 * @returns        PmGuideContent — panel.tsx / sections/* 가 그대로 소비
 */
export async function resolvePmGuide(
  stepKey: StepKey,
  context: PipelineContext,
): Promise<PmGuideContent> {
  const profile = context.meta.programProfile ?? null
  const sectionKey = STEP_TO_SECTION[stepKey]

  const channel = profile
    ? deriveChannelFromProfile(profile)
    : deriveLegacyChannel(context)

  // ── 병렬 DB 조회 ─────────────────────────────────────
  const [patterns, preset] = await Promise.all([
    (profile
      ? findWinningPatterns({
          sectionKey,
          outcome: 'won',
          limit: TOP_N_WINNING,
          profile,
          minSimilarity: MIN_SIMILARITY,
        })
      : findWinningPatterns({
          sectionKey,
          channelType: channel,
          outcome: 'won',
          limit: 3,
        })
    ).catch((): WinningPatternRecord[] => []),
    getChannelPreset(channel).catch(() => null),
  ])

  // ── 평가위원 관점: DB preset 우선, step+channel 2D 룩업, 그 다음 channel 폴백 ──
  //   우선순위:
  //     1. preset.evaluatorProfile (DB ChannelPreset 이 있으면)
  //     2. EVALUATOR_PERSPECTIVE_BY_STEP[stepKey][channel] (스텝별 구체)
  //     3. EVALUATOR_PERSPECTIVE_FALLBACK[channel] (channel 만)
  const stepChannelKey =
    channel === 'B2G' || channel === 'B2B' || channel === 'renewal'
      ? (channel as 'B2G' | 'B2B' | 'renewal')
      : null
  const stepPerspective = stepChannelKey
    ? EVALUATOR_PERSPECTIVE_BY_STEP[stepKey]?.[stepChannelKey]
    : undefined
  const evaluatorPerspective =
    preset?.evaluatorProfile ??
    stepPerspective ??
    EVALUATOR_PERSPECTIVE_FALLBACK[channel] ??
    null

  // ── 흔한 실수 · UD 강점 팁 (프로파일 필터링) ──
  const rawMistakes = COMMON_MISTAKES_BY_STEP[stepKey] ?? []
  const rawTips = UD_STRENGTH_TIPS[stepKey] ?? []

  const commonMistakes = profile
    ? filterMistakesByProfile(rawMistakes, profile)
    : rawMistakes

  const udStrengthTips = profile
    ? filterTipsByProfile(stepKey, rawTips, profile)
    : rawTips

  // ── 리서치 요청 (티키타카 카드) ──
  // 스텝별 요청 + 기존 저장된 답변(externalResearch / strategicNotes) 을 매핑.
  const researchRequests = resolveResearchRequests(stepKey, context)

  return {
    researchRequests,
    winningReferences: patterns,
    evaluatorPerspective,
    commonMistakes,
    udStrengthTips,
  }
}

// ─────────────────────────────────────────
// 리서치 요청 해석 — 정의된 요청 + 저장된 답변 병합
// ─────────────────────────────────────────

/**
 * 스텝별 리서치 요청 리스트를 만들면서 이미 답변된 것은 savedAnswer 로 채운다.
 *
 * 답변 저장 경로 (request.stores 기준):
 *   - 'externalResearch' → context.research[] 에서 promptId=request.id 로 조회
 *   - 'strategicNotes' → context 에 직접 노출돼 있지 않으므로 GET 시 별도 주입 필요.
 *     현재는 externalResearch 에도 researchNote:<id> prefix 로 백업 저장함 (route.ts).
 *
 * @param stepKey 스텝 키
 * @param context PipelineContext
 * @returns       ResolvedResearchRequest[]
 */
function resolveResearchRequests(
  stepKey: StepKey,
  context: PipelineContext,
): ResolvedResearchRequest[] {
  const requests = RESEARCH_REQUESTS_BY_STEP[stepKey] ?? []
  const research: ExternalResearch[] = context.research ?? []

  // strategicNotes 는 context 에 직접 없음 — context.strategy 또는 다른 경로로 접근 필요.
  // 현재는 route.ts 가 externalResearch 배열에 promptId=request.id 로 동일 저장하므로
  // externalResearch 만 봐도 OK (stores='strategicNotes' 도 여기서 찾음).
  return requests.map((req) => {
    // Phase F Wave 3 하위 호환: 구 ID 로 저장된 답변도 신 ID 리서치에 매핑.
    // (imp-outcome-indicators → rfp-outcome-indicators 등)
    const saved = research.find((r) => {
      if (r.promptId === req.id) return true
      const normalized = normalizeResearchId(r.promptId ?? '')
      return normalized === req.id
    })
    return {
      ...req,
      savedAnswer: saved?.content,
      answeredAt: saved?.attachedAt,
    }
  })
}
