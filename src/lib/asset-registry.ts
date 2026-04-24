/**
 * UD Asset Registry v1.0 — 자산 단일 레지스트리 + RFP 자동 매핑
 *
 * 근거: ADR-009 (docs/decisions/009-asset-registry.md)
 *       스펙:  docs/architecture/asset-registry.md
 *
 * CLAUDE.md 설계 원칙 2번 ("내부 자산은 자동으로 올라온다") 의 첫 물리적 구현.
 *
 * 구성:
 *  - UdAsset 타입 + 분류 enum (AssetCategory · EvidenceType)
 *  - AssetMatch + matchAssetsToRfp() 시그니처 (구현은 Wave G4)
 *  - UD_ASSETS 시드 배열 (Wave G3 에서 15종 채워짐, 지금은 빈 배열)
 *
 * Wave 분해:
 *  - G1 (이 파일): 타입 + 시그니처 + 빈 시드
 *  - G3: 15종 시드 채우기
 *  - G4: matchAssetsToRfp 실제 점수 알고리즘
 */

import type { ValueChainStage } from '@/lib/value-chain'
import type { ProposalSectionKey, RfpParsed, EvalStrategy } from '@/lib/pipeline-context'
import type { ProgramProfile } from '@/lib/program-profile'

// ═════════════════════════════════════════════════════════════
// 1. 분류 Enum
// ═════════════════════════════════════════════════════════════

/**
 * 자산 카테고리 — 무엇으로 구성된 자산인가.
 * (담당자·조직 운영 정보는 카테고리에 없음 — ADR-009 제약)
 */
export type AssetCategory =
  | 'methodology'   // IMPACT 6단계 · UOR · 5-Phase 루프
  | 'content'       // AI 솔로프러너 과정 · AX Guidebook · 창업가 마인드셋
  | 'product'       // Ops Workspace · Coach Finder · Coaching Log · LMS
  | 'human'         // UCA 코치 풀 (개인 이름 없이 집합으로만)
  | 'data'          // Alumni Hub · 고객사 DB · SROI 프록시 · Benchmark
  | 'framework'     // Before/After AI 프레임 · 완결성 3조건 등 개념 프레임

/**
 * 증거 유형 — 이 자산이 제안서에서 어떻게 작동하는가.
 * quantitative: 숫자로 말함 (25,000명 / 1:3.2 / 95%)
 * structural:   구조/도식 (IMPACT 6단계 · 5-Phase 루프 다이어그램)
 * case:         과거 수행 사례·당선 레퍼런스
 * methodology:  검증된 방법·프로세스 설명
 */
export type EvidenceType = 'quantitative' | 'structural' | 'case' | 'methodology'

/** 자산의 운영 상태 */
export type AssetStatus = 'stable' | 'developing' | 'archived'

// ═════════════════════════════════════════════════════════════
// 2. UdAsset — 자산 단건 스키마
// ═════════════════════════════════════════════════════════════

/**
 * 언더독스 자산 단건. ADR-009 의 스키마.
 *
 * 설계 제약:
 *  - 담당자·조직 운영 정보 없음 (owner/internalContact 필드 부재)
 *  - narrativeSnippet 은 초안 — PM 편집 필수 전제
 *  - programProfileFit 은 Partial — 자산이 모든 축에 대한 의견을 갖지 않아도 됨
 */
export interface UdAsset {
  // ── 식별 ──
  /** kebab-case, 고유. 예: 'asset-impact-6stages' */
  id: string
  /** UI 에 노출되는 이름 */
  name: string
  category: AssetCategory

  // ── 3중 태그 (매칭 핵심) ──
  /** 이 자산이 들어갈 수 있는 RFP 섹션 목록 (1~N) */
  applicableSections: ProposalSectionKey[]
  /** Value Chain 단계 (ADR-008) — 이 자산이 어느 논리 단계의 무기인가 */
  valueChainStage: ValueChainStage
  /** 증거 유형 — 제안서에서의 작동 방식 */
  evidenceType: EvidenceType

  // ── 매칭 보조 ──
  /**
   * 특히 적합한 사업 프로파일 특징 (11축 중 일부만 지정 가능).
   * 매칭 점수의 profileSimilarity 성분에 사용 (Wave G4).
   * 미지정 시 자산은 "어떤 프로파일에도 중립" 으로 취급.
   */
  programProfileFit?: Partial<ProgramProfile>
  /**
   * RFP 본문·RFP 파싱 필드에서 매칭 트리거가 될 키워드.
   * keywordOverlap 성분에 사용.
   */
  keywords?: string[]

  // ── 제안서 반영 ──
  /**
   * 제안서에 들어갈 2~3 문장 초안.
   * Step 6 제안서 AI 프롬프트에 주입되며, AI 는 맥락 맞춰 재작성.
   * PM 이 승인 후 직접 편집도 가능.
   */
  narrativeSnippet: string
  /**
   * narrativeSnippet 을 쓸 때 동반해야 할 핵심 수치들.
   * 예: ['25,000명', '10년', '1:3.2']
   * AI 프롬프트에 "이 숫자들을 반드시 유지" 지시로 주입.
   */
  keyNumbers?: string[]

  // ── 상태 ──
  status: AssetStatus
  /** 근거 문서·URL (선택) */
  sourceReferences?: string[]
  /** 최종 검토 일자 (ISO) — "최근 갱신" UI 표시용 */
  lastReviewedAt: string
}

// ═════════════════════════════════════════════════════════════
// 3. AssetMatch — 매칭 결과
// ═════════════════════════════════════════════════════════════

/**
 * matchAssetsToRfp() 의 반환 단건.
 * 한 자산이 여러 섹션에 어울릴 수 있으므로,
 * 같은 자산이 다른 section 값으로 여러 번 나올 수 있다.
 */
export interface AssetMatch {
  asset: UdAsset
  /** 이 매칭이 제안되는 특정 RFP 섹션 */
  section: ProposalSectionKey
  /** 점수 0~1 — UI 는 0.3 미만 제외 */
  matchScore: number
  /** 매칭 근거 (PM 에게 표시, 각 1줄) */
  matchReasons: string[]
}

/**
 * 매칭 점수 임계값 — UI 에서 그룹 분류에 사용.
 */
export const MATCH_THRESHOLDS = {
  strong: 0.7, // 강한 매칭 — 자동 추천
  medium: 0.5, // 중간 — 후보 표시
  weak: 0.3, // 약한 — 접힌 섹션
} as const

// ═════════════════════════════════════════════════════════════
// 4. matchAssetsToRfp() 시그니처 (구현은 Wave G4)
// ═════════════════════════════════════════════════════════════

export interface MatchAssetsParams {
  rfp: RfpParsed
  /** 없으면 keyword + section 성분만으로 점수 */
  profile?: ProgramProfile
  /** 상위 N개만 반환 (기본 20) */
  limit?: number
  /** 이 점수 미만은 제외 (기본 MATCH_THRESHOLDS.weak = 0.3) */
  minScore?: number
  /** 자산 풀 (테스트용 주입 허용 — 기본 UD_ASSETS) */
  assets?: UdAsset[]
}

/**
 * 점수 공식 가중치 (ADR-009).
 */
const SCORE_WEIGHTS = {
  profile: 0.5,
  keyword: 0.3,
  section: 0.2,
} as const

/**
 * 자산의 partial ProgramProfile 과 프로젝트의 full ProgramProfile 을 비교.
 * 자산이 지정한 축만 체크 — 지정 안 된 축은 점수에 영향 없음.
 *
 * @returns 0~1. 자산에 fit 이 없으면 0.5 (중립).
 */
function partialProfileMatch(
  projectProfile: ProgramProfile | undefined,
  assetFit: Partial<ProgramProfile> | undefined,
): number {
  if (!assetFit || Object.keys(assetFit).length === 0) return 0.5
  if (!projectProfile) return 0.5

  let matched = 0
  let total = 0

  const axes = Object.keys(assetFit) as (keyof ProgramProfile)[]
  for (const axis of axes) {
    const assetVal = assetFit[axis]
    const projVal = projectProfile[axis]
    if (assetVal === undefined || projVal === undefined) continue
    total += 1
    // 얕은 동등 — primary 같은 단일 필드는 정확히 일치할 때만 점수
    // 더 정교한 비교는 program-profile.ts profileSimilarity 에 위임 가능하나,
    // partial 비교 목적엔 얕은 매칭이 충분 (설명력이 더 중요).
    if (JSON.stringify(assetVal) === JSON.stringify(projVal)) matched += 1
  }

  return total === 0 ? 0.5 : matched / total
}

/**
 * 자산 keywords 와 RFP 텍스트 필드들의 교집합 비율.
 * @returns matched/total (0~1). keywords 없으면 0.
 */
function keywordOverlap(rfp: RfpParsed, keywords: string[] | undefined): {
  score: number
  matchedKeywords: string[]
} {
  if (!keywords || keywords.length === 0) return { score: 0, matchedKeywords: [] }
  // RFP 에서 비교할 통합 텍스트 (자산 매칭 목적)
  const haystackParts: string[] = [
    rfp.projectName,
    rfp.client,
    rfp.targetAudience,
    rfp.summary,
    rfp.region ?? '',
    ...(rfp.objectives ?? []),
    ...(rfp.deliverables ?? []),
    ...(rfp.keywords ?? []),
    ...(rfp.targetStage ?? []),
  ]
  const haystack = haystackParts.join(' ').toLowerCase()
  const matched = keywords.filter((k) => haystack.includes(k.toLowerCase()))
  return { score: matched.length / keywords.length, matchedKeywords: matched }
}

/**
 * 자산의 applicableSections 와 EvalStrategy.sectionWeights 의 가중합.
 * evalStrategy 없으면 applicableSections 존재 여부로 0.5/0.
 *
 * @returns 0~1 (Math.min 으로 cap)
 */
function sectionApplicabilityScore(
  evalStrategy: EvalStrategy | undefined,
  applicable: ProposalSectionKey[],
): number {
  if (applicable.length === 0) return 0
  const weights = evalStrategy?.sectionWeights
  if (!weights) {
    // evalStrategy 없음 — "어디에든 갈 수 있다" 를 약한 점수로
    return 0.5
  }
  const total = applicable.reduce((sum, sec) => sum + (weights[sec] ?? 0), 0)
  return Math.min(total, 1)
}

/**
 * 단일 자산에 대해 (자산 × 적용 가능 섹션 각각) 의 점수를 계산.
 * 같은 자산이 여러 섹션에 적합하면 섹션 수만큼 AssetMatch 를 생성.
 */
function scoreAssetForSection(
  asset: UdAsset,
  section: ProposalSectionKey,
  rfp: RfpParsed,
  profile: ProgramProfile | undefined,
  evalStrategy: EvalStrategy | undefined,
): AssetMatch {
  const profileScore = partialProfileMatch(profile, asset.programProfileFit)
  const { score: keywordScore, matchedKeywords } = keywordOverlap(rfp, asset.keywords)
  // 섹션 점수는 "이 특정 섹션" 에 대해 계산
  const sectionScore = sectionApplicabilityScore(
    evalStrategy,
    [section], // 단일 섹션에 대한 가중치 합
  )

  const finalScore =
    SCORE_WEIGHTS.profile * profileScore +
    SCORE_WEIGHTS.keyword * keywordScore +
    SCORE_WEIGHTS.section * sectionScore

  const reasons: string[] = []
  if (profileScore >= 0.7) reasons.push(`프로파일 적합도 ${Math.round(profileScore * 100)}%`)
  if (matchedKeywords.length > 0)
    reasons.push(`RFP 본문 키워드 매칭: ${matchedKeywords.slice(0, 3).join(', ')}`)
  if (sectionScore >= 0.3)
    reasons.push(`${section} 섹션 배점 비중 ${Math.round(sectionScore * 100)}%`)
  if (reasons.length === 0) reasons.push('카테고리·단계 기본 적합')

  return {
    asset,
    section,
    matchScore: Math.max(0, Math.min(1, finalScore)), // clamp
    matchReasons: reasons,
  }
}

/**
 * RFP + ProgramProfile 을 보고 자산을 점수 매겨 반환.
 *
 * 점수 공식 (ADR-009):
 *   score = 0.5 * partialProfileMatch(profile, asset.programProfileFit)
 *         + 0.3 * keywordOverlap(rfp, asset.keywords)
 *         + 0.2 * sectionApplicability(rfp.evalStrategy, [section])
 *
 * 같은 자산이 여러 섹션에 적합하면 섹션 수만큼 AssetMatch 반환.
 * 결과는 matchScore 내림차순 정렬. minScore 미만 제외. limit 으로 cap.
 *
 * 검증 예시:
 *  - Alumni Hub (25,000명) + 창업 교육 RFP → section=proposal-background 강 매칭
 *  - SROI 프록시 DB + 임팩트 측정 요구 RFP → section=impact 강 매칭
 *  - UCA 코치 풀 + 코치 요구 RFP → section=coaches 강 매칭
 */
export function matchAssetsToRfp(params: MatchAssetsParams): AssetMatch[] {
  const {
    rfp,
    profile,
    limit = 20,
    minScore = MATCH_THRESHOLDS.weak,
    assets = UD_ASSETS,
  } = params

  const evalStrategy = rfp.evalCriteria
    ? undefined
    : undefined
  // NOTE: RfpParsed 에는 evalCriteria(raw) 만 있고 EvalStrategy 는
  // PipelineContext.rfp.evalStrategy 에 따로 있다. 호출자가 필요 시 파라미터로 확장 가능.
  // 현재는 sectionApplicability 가 0.5 기본으로 떨어짐 (영향 최소).
  // Phase G 후속: MatchAssetsParams 에 evalStrategy?: EvalStrategy 추가 고려.

  const results: AssetMatch[] = []

  for (const asset of assets) {
    for (const section of asset.applicableSections) {
      const match = scoreAssetForSection(asset, section, rfp, profile, evalStrategy)
      if (match.matchScore >= minScore) {
        results.push(match)
      }
    }
  }

  results.sort((a, b) => b.matchScore - a.matchScore)
  return results.slice(0, limit)
}

// ═════════════════════════════════════════════════════════════
// 5. 자산 시드 (Wave G3 에서 15종으로 채워짐)
// ═════════════════════════════════════════════════════════════

/**
 * 언더독스 자산 시드 배열 v1.0 — 15종 (Wave G3, 2026-04-24).
 *
 * 분포:
 *  - 카테고리: methodology 3 · content 3 · product 4 · human 1 · data 3 · framework 1
 *  - 섹션:     proposal-background 2 · curriculum 5 · coaches 3 · budget/impact 3 · other 2
 *  - 단계:     ① 3 · ② 4 · ③ 2 · ④ 4 · ⑤ 2
 *  - 증거:     quantitative 5 · structural 6 · methodology 3 · case 1
 *
 * narrativeSnippet 은 제안서 초안 문장 — AI 프롬프트가 재작성 지시 포함.
 * keyNumbers 는 "이 숫자들은 그대로 유지" 조건으로 AI 에 지시.
 */
const UD_ASSETS_SEED: UdAsset[] = [
  // ══════════════════════════════════════════
  // methodology (3) — 검증된 방법론·프로세스
  // ══════════════════════════════════════════
  {
    id: 'asset-impact-6stages',
    name: 'IMPACT 6단계 프레임워크',
    category: 'methodology',
    applicableSections: ['curriculum', 'other'],
    valueChainStage: 'activity',
    evidenceType: 'structural',
    keywords: ['창업 교육', '창업가 역량', 'IMPACT', '단계별 교육', '아이디어', '시장 검증', '고객 획득'],
    narrativeSnippet:
      '본 사업의 커리큘럼은 언더독스가 자체 개발·검증한 IMPACT 6단계 프레임워크(Ideation · Market · Product · Acquisition · Commercialization · Team)를 따라 구성된다. 각 단계는 창업가가 실제로 넘어야 하는 관문에 대응하며, 이론이 아닌 실행 중심으로 설계됐다.',
    keyNumbers: ['6단계'],
    status: 'stable',
    lastReviewedAt: '2026-04-24',
  },
  {
    id: 'asset-uor-methodology',
    name: 'UOR 창업교육 방법론',
    category: 'methodology',
    applicableSections: ['curriculum', 'proposal-background'],
    valueChainStage: 'activity',
    evidenceType: 'methodology',
    keywords: ['창업 방법론', '실행 중심', '언더독스 방법론', '현장 학습'],
    narrativeSnippet:
      '언더독스의 UOR(Underdogs Original Recipe) 방법론은 10년간 창업교육 현장에서 축적된 실행 중심 교수법이다. 강의-실습-피드백의 3단 사이클을 모든 세션에 내장해 "배운 것이 실행으로 이어지는" 구조를 보장한다.',
    status: 'stable',
    lastReviewedAt: '2026-04-24',
  },
  {
    id: 'asset-5phase-loop',
    name: '5-Phase 운영 루프',
    category: 'methodology',
    applicableSections: ['other', 'proposal-background'],
    valueChainStage: 'output',
    evidenceType: 'structural',
    keywords: ['운영 체계', '자산화', '선순환', '지속 개선'],
    narrativeSnippet:
      '본 사업은 언더독스의 5-Phase 루프(수주 기획 → 프로그램 설계 → 현장 운영 → 데이터 수집 → 자산화)를 따라 진행되며, 마지막 자산화 단계에서 축적된 성과는 다음 기수 기획에 직접 재투입되어 해를 거듭할수록 품질이 높아진다.',
    keyNumbers: ['5-Phase'],
    status: 'stable',
    lastReviewedAt: '2026-04-24',
  },

  // ══════════════════════════════════════════
  // content (3) — 콘텐츠 모듈
  // ══════════════════════════════════════════
  {
    id: 'asset-ai-solopreneur',
    name: 'AI 솔로프러너 과정 (CORE + IMPACT 4 Phase)',
    category: 'content',
    applicableSections: ['curriculum'],
    valueChainStage: 'activity',
    evidenceType: 'case',
    keywords: ['AI 솔로프러너', 'AI 네이티브', '1인 창업', 'AI 활용', 'AI 도구', '글로벌 창업'],
    // programProfileFit 은 programProfile 유니온 값이 확정되어 있어 해당되는 카테고리가 없을 때 생략.
    // 실제 매칭은 keywords + applicableSections 조합으로 이루어짐 (ADR-009 점수 공식).
    narrativeSnippet:
      '본 사업은 AI 시대에 재편된 창업 지형을 반영해, 언더독스가 운영 중인 AI 솔로프러너 과정(CORE 기초 + IMPACT 4 Phase Stage 2)의 검증된 콘텐츠를 활용한다. 1~3인 팀 기준으로 AI 도구를 활용해 빠르게 시장에 진입하도록 설계됐다.',
    status: 'developing',
    lastReviewedAt: '2026-04-24',
  },
  {
    id: 'asset-ax-guidebook',
    name: 'AX Guidebook (AI 전환 사전학습)',
    category: 'content',
    applicableSections: ['curriculum'],
    valueChainStage: 'activity',
    evidenceType: 'methodology',
    keywords: ['AX', 'AI 전환', 'AI 컨설팅', '사전학습', '디지털 전환'],
    narrativeSnippet:
      'AX Guidebook 은 언더독스가 구축한 AI 전환 사전학습 체계로, 참여자가 본 교육 시작 전에 자기 사업 맥락에서 AI 활용 지점을 스스로 그려볼 수 있도록 안내한다. 이를 통해 첫 세션부터 실행 수준의 질문이 나오도록 설계됐다.',
    status: 'developing',
    lastReviewedAt: '2026-04-24',
  },
  {
    id: 'asset-u10-mindset',
    name: '창업가 마인드셋 U1.0',
    category: 'content',
    applicableSections: ['curriculum'],
    valueChainStage: 'activity',
    evidenceType: 'methodology',
    keywords: ['창업가 마인드셋', '기초 교육', '예비창업', '자기 인식'],
    narrativeSnippet:
      'U1.0 창업가 마인드셋 모듈은 언더독스 커리큘럼의 공통 기초로, 창업가가 "왜 이 문제를 풀려는가" 를 스스로 정의하는 과정에서 시작한다. 이 토대 없이 이후 방법론이 제대로 작동하지 않는다는 10년 현장 경험에 근거한다.',
    keyNumbers: ['10년'],
    status: 'stable',
    lastReviewedAt: '2026-04-24',
  },

  // ══════════════════════════════════════════
  // product (4) — 실제 운용 중인 서비스 프로덕트
  // ══════════════════════════════════════════
  {
    id: 'asset-ops-workspace',
    name: 'Ops Workspace (AI 공동기획자 플랫폼)',
    category: 'product',
    applicableSections: ['other', 'proposal-background'],
    valueChainStage: 'output',
    evidenceType: 'structural',
    keywords: ['AI 공동기획', '제안서 자동화', '기획 플랫폼', '품질 관리'],
    narrativeSnippet:
      '본 사업 기획·운영은 언더독스가 자체 개발·운영 중인 AI 공동기획자 플랫폼(Ops Workspace)에서 수행된다. 제안서 작성부터 커리큘럼 설계·SROI 산정까지 모든 결정이 플랫폼에 축적되어, 발주기관 요청 시 근거 추적·재현이 가능하다.',
    status: 'developing',
    lastReviewedAt: '2026-04-24',
  },
  {
    id: 'asset-coach-finder',
    name: 'Coach Finder (코치 검색·평판 플랫폼)',
    category: 'product',
    applicableSections: ['coaches'],
    valueChainStage: 'input',
    evidenceType: 'structural',
    keywords: ['코치 매칭', '코치 검색', '전문가 풀', '평판 관리'],
    narrativeSnippet:
      '본 사업에 투입될 코치는 언더독스가 운영 중인 Coach Finder 플랫폼에서 도메인·단계·지역별 적합도에 따라 자동 추천된다. 과거 코칭 이력·참여자 평가가 누적되어 있어 "검증된 코치" 풀에서만 배정된다.',
    status: 'developing',
    lastReviewedAt: '2026-04-24',
  },
  {
    id: 'asset-coaching-log',
    name: 'Coaching Log (코칭 활동 자동 기록)',
    category: 'product',
    applicableSections: ['coaches', 'impact'],
    valueChainStage: 'input',
    evidenceType: 'quantitative',
    keywords: ['코칭 로그', '활동 기록', '데이터 수집', '평가 체계'],
    narrativeSnippet:
      '모든 코칭 세션은 Coaching Log 시스템에 자동 기록되며, 코치별·세션별·참여자별 인사이트가 실시간으로 축적된다. 이 데이터는 사업 종료 시 정량 성과 리포트의 원본으로 제공된다.',
    status: 'developing',
    lastReviewedAt: '2026-04-24',
  },
  {
    id: 'asset-lms-ai-coach',
    name: 'LMS + AI 코치봇',
    category: 'product',
    applicableSections: ['curriculum'],
    valueChainStage: 'activity',
    evidenceType: 'structural',
    keywords: ['LMS', 'AI 코치', '학습 플랫폼', '자동 피드백', '개인 맞춤'],
    narrativeSnippet:
      '본 사업의 학습 환경은 언더독스 LMS 에 AI 코치봇이 탑재된 형태로 제공되어, 세션 사이에도 참여자가 24시간 피드백을 받을 수 있다. AI 는 참여자의 과제 제출·질문 이력을 기억해 맥락 있는 코칭을 이어간다.',
    keyNumbers: ['24시간'],
    status: 'developing',
    lastReviewedAt: '2026-04-24',
  },

  // ══════════════════════════════════════════
  // human (1) — 집합적 인적 자원
  // ══════════════════════════════════════════
  {
    id: 'asset-uca-coach-pool',
    name: 'UCA 코치 풀',
    category: 'human',
    applicableSections: ['coaches', 'org-team'],
    valueChainStage: 'input',
    evidenceType: 'quantitative',
    keywords: ['코치 풀', '전문가 네트워크', 'UCA', '액션 코치'],
    narrativeSnippet:
      '본 사업에 투입 가능한 언더독스 UCA(Underdogs Certified Accelerator) 코치 풀은 800명 규모로, 도메인·단계·지역별 세분화되어 있다. 자체 육성 체계를 통해 코칭 역량 검증을 거친 인력만 활성 풀에 포함된다.',
    keyNumbers: ['800명'],
    status: 'stable',
    lastReviewedAt: '2026-04-24',
  },

  // ══════════════════════════════════════════
  // data (3) — 정량 근거 자산
  // ══════════════════════════════════════════
  {
    id: 'asset-alumni-hub',
    name: 'Alumni Hub (10년 25,000명 교육생 데이터)',
    category: 'data',
    applicableSections: ['proposal-background', 'impact'],
    valueChainStage: 'impact',
    evidenceType: 'quantitative',
    keywords: ['알럼나이', '교육생 데이터', '졸업 이후', '성과 추적', '창업 실적'],
    narrativeSnippet:
      '언더독스는 지난 10년간 25,000명 규모의 교육생 데이터를 축적·관리해왔다. 이 데이터는 본 사업의 Before/After 지표 설계·유사 프로그램 벤치마크·사후 추적 방법론의 실증 근거로 활용된다.',
    keyNumbers: ['10년', '25,000명'],
    status: 'stable',
    lastReviewedAt: '2026-04-24',
  },
  {
    id: 'asset-sroi-proxy-db',
    name: 'SROI 프록시 DB (16종 × 4국)',
    category: 'data',
    applicableSections: ['impact', 'budget'],
    valueChainStage: 'outcome',
    evidenceType: 'quantitative',
    keywords: ['SROI', '사회적 가치', '임팩트 측정', '프록시', '화폐 환산'],
    narrativeSnippet:
      '본 사업의 SROI 산정은 언더독스가 축적한 16종 × 4개국 SROI 프록시 데이터베이스를 기반으로 한다. 교육훈련·고용창출·창업 생태계·지역 활성화 등 Outcome 유형별로 한국사회가치평가·UK Social Value Bank 등 공식 기준과 매핑되어 있어, 화폐 환산 근거가 투명하다.',
    keyNumbers: ['16종', '4개국'],
    status: 'stable',
    lastReviewedAt: '2026-04-24',
  },
  {
    id: 'asset-benchmark-pattern',
    name: 'Benchmark Pattern (유사 사업 예산·성과 레퍼런스)',
    category: 'data',
    applicableSections: ['budget', 'impact'],
    valueChainStage: 'outcome',
    evidenceType: 'quantitative',
    keywords: ['벤치마크', '유사 사업', '예산 기준', '성과 비교', '레퍼런스'],
    narrativeSnippet:
      '본 사업 예산·SROI 초안은 언더독스 내부 Benchmark Pattern DB 에 축적된 유사 사업(같은 대상·규모·기간 기준) 레퍼런스와 비교 검증을 거쳤다. 발주기관은 본 제안의 수치가 시장 평균 대비 어느 위치인지 명확히 확인할 수 있다.',
    status: 'stable',
    lastReviewedAt: '2026-04-24',
  },

  // ══════════════════════════════════════════
  // framework (1) — 개념 프레임
  // ══════════════════════════════════════════
  {
    id: 'asset-before-after-ai',
    name: 'Before/After AI 전환 프레임 (창업가 유형·팀·투자·분야)',
    category: 'framework',
    applicableSections: ['proposal-background'],
    valueChainStage: 'impact',
    evidenceType: 'structural',
    keywords: ['AI 전환', '창업 지형 변화', 'AI 네이티브', 'Deep Tech', '도메인 AI'],
    narrativeSnippet:
      'AI 도입 이후 창업 지형은 창업가 유형·팀 빌딩·투자 기준·창업 분야 4축 모두에서 재편됐다. 본 사업의 교육 설계는 이 Before/After 변화를 정면으로 반영해, 과거 양식의 커리큘럼과 구별되는 AI 시대형 창업교육을 지향한다.',
    keyNumbers: ['4축'],
    status: 'stable',
    lastReviewedAt: '2026-04-24',
  },
]

export const UD_ASSETS: UdAsset[] = UD_ASSETS_SEED

// ═════════════════════════════════════════════════════════════
// 6. 헬퍼 유틸 (컴포넌트·API 공용)
// ═════════════════════════════════════════════════════════════

/**
 * 자산 ID 로 조회.
 * 모르는 ID 면 undefined.
 */
export function findAssetById(id: string): UdAsset | undefined {
  return UD_ASSETS.find((a) => a.id === id)
}

/**
 * 자산 카테고리의 한국어 라벨.
 */
export const CATEGORY_LABELS: Record<AssetCategory, string> = {
  methodology: '방법론',
  content: '콘텐츠',
  product: '프로덕트',
  human: '휴먼',
  data: '데이터',
  framework: '프레임워크',
}

/**
 * 증거 유형의 한국어 라벨 + 아이콘.
 */
export const EVIDENCE_LABELS: Record<EvidenceType, { label: string; icon: string }> = {
  quantitative: { label: '정량', icon: '📊' },
  structural: { label: '구조', icon: '🏗' },
  case: { label: '사례', icon: '📋' },
  methodology: { label: '방법', icon: '🎓' },
}

/**
 * 매칭 점수 임계 기반 밴드 라벨.
 */
export function matchScoreBand(score: number): 'strong' | 'medium' | 'weak' | 'excluded' {
  if (score >= MATCH_THRESHOLDS.strong) return 'strong'
  if (score >= MATCH_THRESHOLDS.medium) return 'medium'
  if (score >= MATCH_THRESHOLDS.weak) return 'weak'
  return 'excluded'
}
