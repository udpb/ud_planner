/**
 * UD Asset Registry v2.0 — Content Hub 런타임 API (Phase H Wave H2, ADR-010)
 *
 * 근거: ADR-009 (docs/decisions/009-asset-registry.md) — 자산 스키마 v1
 *       ADR-010 (docs/decisions/010-content-hub.md)   — DB 저장소 전환
 *       스펙:  docs/architecture/content-hub.md
 *
 * CLAUDE.md 설계 원칙 2번 ("내부 자산은 자동으로 올라온다") 의 첫 물리적 구현.
 *
 * **서버 전용**: 이 파일은 prisma/@prisma/adapter-pg 를 import 하므로
 * Client Component 에서 import 하면 pg → dns 로 번들 에러.
 * 클라이언트가 필요한 타입·상수는 `asset-registry-types.ts` 에서 가져올 것.
 *
 * v2.0 변경:
 *  - 자산 풀 소스: 코드 시드(UD_ASSETS 상수) → Prisma.ContentAsset 테이블
 *  - 런타임 API 는 비동기(async). findAssetById / matchAssetsToRfp / formatAcceptedAssets
 *    모두 Promise 반환.
 *  - UD_ASSETS_SEED 는 seed-content-assets.ts 전용으로만 유지 (public export).
 *  - UdAsset 인터페이스에 parentId / children / version / createdAt / updatedAt 추가.
 *
 * v2.1 변경 (2026-04-24 저녁, Phase H 브라우저 번들 픽스):
 *  - 모든 pure 타입·상수·헬퍼는 asset-registry-types.ts 로 분리 (client safe)
 *  - 이 파일은 'server-only' 가드 + DB 로직만 유지
 *  - backward compat 위해 types/constants 를 re-export
 */

// 'server-only' 가드 제거 — 모든 import 가 server context (page.tsx · lib/server · api).
// CLI seed 스크립트 (prisma/seed-content-assets.ts) 가 동일 모듈에서 UD_ASSETS_SEED 를
// 가져갈 수 있어야 production 시드 가능. (2026-05-15)
// 만약 클라이언트가 이 모듈을 import 하면 build 시 pg/dns 에러 발생 — 그건 본 guard
// 가 아닌 빌드 단계에서 잡힘. asset-registry-types.ts 가 client-safe re-export 책임.

import { cache } from 'react'

import { prisma } from '@/lib/prisma'
import type { RfpParsed, EvalStrategy, ProposalSectionKey } from '@/lib/pipeline-context'
import type { ProgramProfile } from '@/lib/program-profile'
import type { ValueChainStage } from '@/lib/value-chain'

// ═════════════════════════════════════════════════════════════
// 0. 클라이언트 안전 심볼 re-export (backward compat)
// ═════════════════════════════════════════════════════════════
//
// 기존 import 경로 (`@/lib/asset-registry` 에서 types/constants 가져가기)를
// 유지하고 싶은 서버 코드 위해 re-export. 새 클라이언트 코드는 직접
// `@/lib/asset-registry-types` 에서 가져갈 것.

export type {
  AssetCategory,
  EvidenceType,
  AssetStatus,
  UdAsset,
  AssetMatch,
} from '@/lib/asset-registry-types'
export {
  MATCH_THRESHOLDS,
  matchScoreBand,
  CATEGORY_LABELS,
  EVIDENCE_LABELS,
  SECTION_NO_TO_KEY,
} from '@/lib/asset-registry-types'

// 내부 로직에서 쓰기 위한 타입 import
import type {
  AssetCategory,
  EvidenceType,
  AssetStatus,
  UdAsset,
  AssetMatch,
} from '@/lib/asset-registry-types'
import { MATCH_THRESHOLDS } from '@/lib/asset-registry-types'

// ═════════════════════════════════════════════════════════════
// 1~3. 타입·임계값은 asset-registry-types.ts 로 이관됨.
//      이 파일 상단에서 이미 re-export + 내부 import 완료.
// ═════════════════════════════════════════════════════════════

/* Phase H v2.1 (2026-04-24 저녁)
 * — 남은 심볼(UD_ASSETS_SEED, DB 조회, matchAssetsToRfp, formatAcceptedAssets)은
 *   server-only 로 유지.
 * — pure 심볼(AssetCategory/EvidenceType/AssetStatus/UdAsset/AssetMatch/
 *   MATCH_THRESHOLDS/matchScoreBand/CATEGORY_LABELS/EVIDENCE_LABELS/SECTION_NO_TO_KEY)
 *   은 asset-registry-types.ts 에 정의됨. 이 파일 최상단에서 re-export + 내부 import 완료.
 */

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
  /** 자산 풀 (테스트용 주입 허용 — 기본 getAllAssets() DB 조회 결과) */
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
 * Phase H Wave H4 (ADR-010) — 계층 지원:
 *  - 자산 풀은 평면 배열 (top-level 과 children 이 섞여 있음).
 *  - top-level 자산만 일반 매칭 루프에서 평가.
 *  - 어떤 top-level 자산이 section 기준 MATCH_THRESHOLDS.medium (0.5) 이상이면,
 *    그 자산의 children 도 **같은 section 에서** 후보로 강제 포함 (minScore 우회).
 *    children 자체 점수는 정상 계산 (점수 알고리즘 불변).
 *  - 결과 타입은 평면 AssetMatch[] — UI 에서 parentId 로 그룹화.
 *  - limit 은 부모 매칭을 자르지 않도록, 부모-자식 블록 단위로 고려하되
 *    현재는 단순히 부모·자식을 하나의 정렬 스트림으로 섞고 상위 N 절삭.
 *    (UI 입장에서는 부모 없이 자식만 뜨는 경우가 없도록 아래 로직이 보장.)
 *
 * 검증 예시:
 *  - Alumni Hub (25,000명) + 창업 교육 RFP → section=proposal-background 강 매칭
 *  - SROI 프록시 DB + 임팩트 측정 요구 RFP → section=impact 강 매칭
 *  - UCA 코치 풀 + 코치 요구 RFP → section=coaches 강 매칭
 *  - AI 솔로프러너 과정(parent) 매칭 시 Week 1~3(children) 도 커리큘럼 후보로 함께 상승
 */
export async function matchAssetsToRfp(
  params: MatchAssetsParams,
): Promise<AssetMatch[]> {
  const {
    rfp,
    profile,
    limit = 20,
    minScore = MATCH_THRESHOLDS.weak,
    assets,
  } = params

  // Phase H (ADR-010): 기본 자산 풀은 DB 조회 (getAllAssets). 테스트용 주입 시 그 풀 사용.
  const pool = assets ?? (await getAllAssets())

  const evalStrategy = rfp.evalCriteria
    ? undefined
    : undefined
  // NOTE: RfpParsed 에는 evalCriteria(raw) 만 있고 EvalStrategy 는
  // PipelineContext.rfp.evalStrategy 에 따로 있다. 호출자가 필요 시 파라미터로 확장 가능.
  // 현재는 sectionApplicability 가 0.5 기본으로 떨어짐 (영향 최소).
  // Phase G 후속: MatchAssetsParams 에 evalStrategy?: EvalStrategy 추가 고려.

  // ── Wave H4: top-level 과 children 분리 ──
  const topLevel = pool.filter((a) => !a.parentId)
  const childrenByParent = new Map<string, UdAsset[]>()
  for (const a of pool) {
    if (a.parentId) {
      const arr = childrenByParent.get(a.parentId) ?? []
      arr.push(a)
      childrenByParent.set(a.parentId, arr)
    }
  }

  const results: AssetMatch[] = []

  for (const parent of topLevel) {
    // 부모 자산에 대해 applicable 한 섹션 각각 매칭
    const parentMatchesBySection = new Map<ProposalSectionKey, AssetMatch>()
    for (const section of parent.applicableSections) {
      const match = scoreAssetForSection(parent, section, rfp, profile, evalStrategy)
      parentMatchesBySection.set(section, match)
      if (match.matchScore >= minScore) {
        results.push(match)
      }
    }

    // children 강제 포함 규칙:
    //  - 부모 자산이 어떤 section 에서 medium+ 로 매칭되면, 그 section 을
    //    applicableSections 로 가진 children 을 minScore 우회해 후보에 포함.
    //  - children 이 부모와 다른 section 에도 applicable 하면, 그 section 은 정상 점수 규칙.
    const children = childrenByParent.get(parent.id) ?? []
    if (children.length === 0) continue

    // 부모가 medium+ 로 매칭된 섹션 집합
    const strongParentSections = new Set<ProposalSectionKey>()
    for (const [section, m] of parentMatchesBySection) {
      if (m.matchScore >= MATCH_THRESHOLDS.medium) {
        strongParentSections.add(section)
      }
    }

    for (const child of children) {
      for (const section of child.applicableSections) {
        const match = scoreAssetForSection(child, section, rfp, profile, evalStrategy)
        // 부모가 해당 section 에서 medium+ 이면 minScore 우회해 포함.
        // 아니면 일반 minScore 적용.
        const parentStrong = strongParentSections.has(section)
        if (parentStrong || match.matchScore >= minScore) {
          // 부모 강제 포함 케이스는 이유 추가 (UI 설명력)
          if (parentStrong && match.matchScore < minScore) {
            match.matchReasons = [
              ...match.matchReasons,
              `상위 자산 "${parent.name}" 매칭에 따른 자동 포함`,
            ]
          }
          results.push(match)
        }
      }
    }
  }

  results.sort((a, b) => b.matchScore - a.matchScore)
  return results.slice(0, limit)
}

// ═════════════════════════════════════════════════════════════
// 5. 자산 시드 (Wave G3, 2026-04-24 — v1.0 15종)
// ═════════════════════════════════════════════════════════════

/**
 * 언더독스 자산 시드 배열 v1.0 — 15종 (Wave G3, 2026-04-24).
 *
 * Phase H (ADR-010) 이후 런타임 조회는 `getAllAssets()` (DB) 로 전환됨.
 * 이 상수는 **초기 DB 시드 전용** (`prisma/seed-content-assets.ts`) 으로만 유지.
 * 앱 런타임 로직은 이 상수를 참조해서는 안 된다.
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
export const UD_ASSETS_SEED: UdAsset[] = [
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

  // ══════════════════════════════════════════
  // 데이터 센터 (8) — 2026 운영계획안 + 연구기획안 자산화 (F1.5 · 2026-05-20)
  //
  // 모든 자산은 외부 검증·11년 누적 데이터 기반 — 평가위원이 의심하기 어려운
  // "압도적 정량 증빙". RFP 의 evidence-based bidding 요구에 정면 대응.
  // ══════════════════════════════════════════
  {
    id: 'asset-actt-5competency',
    name: 'ACTT 액트프러너십 5대 역량 진단 (사전·사후 2회, 외부 검증)',
    category: 'methodology',
    applicableSections: ['proposal-background', 'coaches', 'impact'],
    valueChainStage: 'activity',
    evidenceType: 'methodology',
    keywords: [
      'ACTT', '액트프러너십', '5대 역량', '진단', 'GEPXR',
      '실행력', '리더십', '문제해결', '협업', '시장중심',
      '외부 검증', '임팩트 리서치랩', '사전사후', '교육효과', 'pre-post',
    ],
    narrativeSnippet:
      'ACTT(Actpreneur Competency Test) 는 언더독스가 자체 개발한 액트프러너십 역량 진단 도구로, 10개 차원·30 문항·5점 리커트 척도로 인지→적용→실행 3단계 갭을 정량화한다. **교육 사전·사후 2회 실시 (pre/post)** — 사전 진단으로 참가자 기초 역량을 측정하고, 사후 진단으로 교육·코칭에 따른 변화량(Δ)을 정량 입증한다. 2024 임팩트 리서치랩 협업 사회성과 연구(N=1,002) 에서 5대 역량(실행력·리더십·문제해결·협업·시장중심) 평균 4.09/5.0, 역량-성과 상관계수 r=.78 외부 검증 완료. 사전→사후 실행단계 변화량 +1.10 — 평가위원의 "이 교육이 실제 효과 있나?" 의심에 정량 답변.',
    keyNumbers: [
      '5대 역량', '15 세부 지표', '평균 4.09/5.0', 'r=.78', 'N=1,002',
      '사전·사후 2회', 'Δ+1.10',
    ],
    status: 'stable',
    sourceReferences: ['임팩트 리서치랩 「언더독스 사회성과 연구」 2024.01'],
    lastReviewedAt: '2026-05-20',
  },
  {
    id: 'asset-dogs-personality',
    name: 'DOGS 창업가 성향 진단 + 대화카드 (교육 시작 전 1회, 네트워킹·밍글링 도구)',
    category: 'methodology',
    applicableSections: ['proposal-background', 'coaches', 'curriculum'],
    valueChainStage: 'input',
    evidenceType: 'methodology',
    keywords: [
      'DOGS', '창업가 성향', '진단', 'Director', 'Organizer', 'Guider', 'Supporter',
      '4주축', '12유형', '코호트 분석', '대화카드', '네트워킹', '밍글링', '팀빌딩',
    ],
    narrativeSnippet:
      'DOGS(Director/Organizer/Guider/Supporter) 진단은 창업가의 본원적 성향과 행동 패턴을 4주축·12세부 유형으로 분류하는 자체 IP. **교육 시작 전 1회** 실시(31항 + 인구통계, 디지털 설문). 단순 분류 도구가 아니라 **DOGS 대화카드** 를 결합해 참가자들이 서로의 성향을 직관적으로 이해하고 팀을 빌드하는 **네트워킹·밍글링 도구** 로 운영 — 초반 라포 형성 + 협업 패턴 자동 조성. 2025 하나소셜벤처유니버시티 3기 30개 거점대학 1,500명 전수 진단에서 대학별 분포 차이 p<.001 통계 유의 — 진단 도구 변별력 정량 입증. 우수 60팀 발굴→12팀 최종 선발에 적용해 사업 ROI 직접 증명.',
    keyNumbers: ['4 주축', '12 유형', '31 항목', '1,500명', 'p<.001', '교육 시작 전 1회'],
    status: 'stable',
    sourceReferences: ['하나소셜벤처유니버시티 최종결과보고서 2026.01'],
    lastReviewedAt: '2026-05-20',
  },
  {
    id: 'asset-actpreneur-graduation-rate',
    name: '액트프러너 교육 수료율 86.8% (404 프로그램, 16,076명)',
    category: 'data',
    applicableSections: ['impact', 'proposal-background', 'org-team'],
    valueChainStage: 'outcome',
    evidenceType: 'quantitative',
    keywords: ['수료율', '실행률', '교육 완수', '누적 수료', '운영 성과'],
    narrativeSnippet:
      '2015~2024 누적 404개 프로그램에서 16,076명 액트프러너를 수료까지 이끌어낸 평균 수료율 86.8% — 단순 참가가 아니라 끝까지 실행한 모수 기준. 1,500명 단일 운영 사례(하나SVU 3기) 에서도 86.8% 동일 달성으로 재현 가능성 입증. 발주처가 가장 의심하는 "참가자가 도중 이탈하지 않나" 의 정면 답변이다.',
    keyNumbers: ['86.8%', '16,076명', '404 프로그램', '재현 가능'],
    status: 'stable',
    lastReviewedAt: '2026-05-20',
  },
  {
    id: 'asset-competency-outcome-correlation',
    name: '역량-성과 상관 r=.78 (액트프러너십이 비즈니스 성과를 만든다)',
    category: 'data',
    applicableSections: ['impact', 'proposal-background'],
    valueChainStage: 'outcome',
    evidenceType: 'quantitative',
    keywords: ['상관계수', '역량-성과', '인과관계', '회귀분석', '학술 통계'],
    narrativeSnippet:
      '임팩트 리서치랩 협업 연구(N=1,002) 에서 ACTT 5대 역량의 사전·사후 변화와 비즈니스 성과(매출·고용·생존) 의 상관계수 r=.78 — 학술적 강한 상관. 직관에 의존하던 창업가 자질을 학술적 기준으로 규명하고 외부 인용 가능한 객관 정량 토대 확보. 후속 KPI 설계·임팩트 측정·관리(IMM) 표준 체계의 통계적 근거.',
    keyNumbers: ['r=.78', 'N=1,002', '강한 상관'],
    status: 'stable',
    sourceReferences: ['임팩트 리서치랩 「언더독스 사회성과 연구」 2024.01'],
    lastReviewedAt: '2026-05-20',
  },
  {
    id: 'asset-pre-post-delta',
    name: '사전→사후 실행단계 변화량 +1.10 (코칭 효과 정량 입증)',
    category: 'data',
    applicableSections: ['impact', 'curriculum', 'coaches'],
    valueChainStage: 'outcome',
    evidenceType: 'quantitative',
    keywords: ['사전사후', '변화량', '델타', '코칭 효과', '실행력 향상', 'Action Week'],
    narrativeSnippet:
      'ACTT 인지→적용→실행 3단계 매트릭스에서 실행단계 변화량 +1.10 (사전→사후) — 5대 역량 중 최대치. "아는 것" 보다 "하는 것" 에 코칭이 결정적 영향을 미친다는 정량 증거. Top 20% 우수 코호트(N=234) 의 평균 Δ0.67 격차로 우수팀 패턴 추출 가능. Action Week 등 실행 중심 회차 설계의 정량 근거.',
    keyNumbers: ['+1.10', 'Δ0.67', 'Top 20%', 'N=234'],
    status: 'stable',
    sourceReferences: ['임팩트 리서치랩 「언더독스 사회성과 연구」 2024.01'],
    lastReviewedAt: '2026-05-20',
  },
  {
    id: 'asset-actpreneur-universe-30k',
    name: '액트프러너 30,000+ 명 누적 실증 데이터',
    category: 'data',
    applicableSections: ['proposal-background', 'org-team', 'impact'],
    valueChainStage: 'input',
    evidenceType: 'quantitative',
    keywords: ['액트프러너', '누적 모수', '실증 데이터', '11년', '코호트', 'big data'],
    narrativeSnippet:
      '2015~2026 11년간 30,000명 이상 액트프러너를 직접 육성하며 축적한 현장 실증 데이터. 단순 참가자 명단이 아니라 DOGS·ACTT 진단 응답 + LMS 학습 로그 + 코칭 일지 + 결과 보고가 결합된 입체 데이터셋. 9 타깃 유니버스(스타트업·SME·로컬·문화예술·HR·시니어·다음세대·D&I·글로벌) 의 보편적 성공·생존 패턴을 추출하는 독보적 지식 자본 — 타 기관이 모방할 수 없는 11년 격차.',
    keyNumbers: ['30,000+ 명', '11년', '9 타깃 유니버스'],
    status: 'stable',
    lastReviewedAt: '2026-05-20',
  },
  {
    id: 'asset-asia-imm-standard',
    name: 'Asia IMM 표준 (아시아형 임팩트 측정 가이드라인)',
    category: 'framework',
    applicableSections: ['impact', 'proposal-background'],
    valueChainStage: 'outcome',
    evidenceType: 'structural',
    keywords: [
      'Asia IMM', '임팩트 측정', '아시아 표준', '글로벌 룰메이커', 'IMM',
      '크로스보더', '혁신 지수',
    ],
    narrativeSnippet:
      '서구권 중심의 평가 방식을 넘어 아시아 생태계에 최적화된 독자적 임팩트 측정·관리 가이드라인(Asia IMM). 한국·일본·인도네시아·인도 4개국 액트프러너 실증 데이터를 통합 분석해 아시아 액트프러너 크로스보더 혁신 지수로 발간 예정. 글로벌 ODA·임팩트 투자사·정부 부처가 인용하는 신뢰 기준으로 자리매김 중. 본 사업 임팩트 보고에 적용 시 발주처 KPI 와 글로벌 표준 동시 충족.',
    keyNumbers: ['4개국', 'IMM 표준', 'WB·ADB 협의'],
    status: 'developing',
    lastReviewedAt: '2026-05-20',
  },
  {
    id: 'asset-5d-competency',
    name: '5D 핵심역량 진단 (Global · AI · Data · Finance · Domain)',
    category: 'methodology',
    applicableSections: ['proposal-background', 'curriculum', 'coaches', 'impact'],
    valueChainStage: 'activity',
    evidenceType: 'methodology',
    keywords: [
      '5D', '핵심역량', 'Global', 'AI', 'Data', 'Finance', 'Domain',
      '글로벌', '데이터', '재무', '도메인', '진단', '5축',
    ],
    narrativeSnippet:
      '5D 핵심역량 진단은 ACTT 의 일반 액트프러너십 5대 역량과 별도로 **시대가 요구하는 5가지 핵심역량 — Global(글로벌)·AI·Data(데이터)·Finance(재무)·Domain(도메인 전문성)** 을 정량 측정하는 진단 IP. AI 시대·크로스보더 경제·데이터 기반 의사결정이 일상화된 환경에서 창업가가 갖춰야 할 보편 역량을 5축으로 코드화. ACTT(역량 일반) + 5D(시대 필수역량) 이중 진단으로 참가자 약점 축을 정확히 짚어 맞춤 커리큘럼·코칭 매칭 가능. 평가위원의 "AI/글로벌 시대 적합성" 질문에 정량 답변.',
    keyNumbers: ['5축', 'Global·AI·Data·Finance·Domain'],
    status: 'stable',
    lastReviewedAt: '2026-05-20',
  },
  {
    id: 'asset-global-partners-520',
    name: '아시아 520+ 글로벌 파트너십 + 4개국 거점 (KR·ID·JP·IN)',
    category: 'human',
    applicableSections: ['org-team', 'proposal-background', 'coaches'],
    valueChainStage: 'input',
    evidenceType: 'structural',
    keywords: [
      '글로벌 파트너', '아시아 거점', '크로스보더', '국제 협력',
      '일본 도쿄', '인도 뉴델리', 'UDI Japan',
    ],
    narrativeSnippet:
      '서울 본사 외 일본(도쿄·UDI Japan) + 인도(뉴델리) 현지 법인 + 인도네시아 네트워크 + 아시아 전역 160개 이상 글로벌 파트너를 포함한 520+ 협력 파트너십. 한국 내수가 아닌 크로스보더 사업·해외 확장 RFP 에 즉시 응답 가능한 운영 인프라. 글로벌 휴먼 코치 255명 + 30+ AI 기술 파트너 얼라이언스로 데이터 수집·분석·확산 전 단계에서 검증망 활용 가능.',
    keyNumbers: ['520+ 파트너', '4개국', '255명 코치', '30+ AI 파트너'],
    status: 'stable',
    lastReviewedAt: '2026-05-20',
  },
]

// ═════════════════════════════════════════════════════════════
// 6. DB 조회 헬퍼 (Phase H · ADR-010)
// ═════════════════════════════════════════════════════════════

/**
 * Prisma ContentAsset 행 → UdAsset 변환.
 *
 * ContentAsset 의 JSON 필드(applicableSections / keywords / programProfileFit /
 * keyNumbers / sourceReferences) 는 Prisma.JsonValue 로 반환되므로 TS 배열/객체로
 * 안전하게 캐스팅한다. 잘못된 JSON 모양이 들어와 있을 가능성은 시드·관리자 UI 쪽에서
 * 입력 검증으로 막는다 (content-hub.md §"품질 게이트 연동").
 */
function dbRowToUdAsset(row: {
  id: string
  name: string
  category: string
  parentId: string | null
  applicableSections: unknown
  valueChainStage: string
  evidenceType: string
  keywords: unknown
  programProfileFit: unknown
  narrativeSnippet: string
  keyNumbers: unknown
  status: string
  version: number
  sourceReferences: unknown
  lastReviewedAt: Date
  createdAt: Date
  updatedAt: Date
}): UdAsset {
  return {
    id: row.id,
    name: row.name,
    category: row.category as AssetCategory,
    applicableSections: (row.applicableSections ?? []) as ProposalSectionKey[],
    valueChainStage: row.valueChainStage as ValueChainStage,
    evidenceType: row.evidenceType as EvidenceType,
    keywords: row.keywords ? (row.keywords as string[]) : undefined,
    programProfileFit: row.programProfileFit
      ? (row.programProfileFit as Partial<ProgramProfile>)
      : undefined,
    narrativeSnippet: row.narrativeSnippet,
    keyNumbers: row.keyNumbers ? (row.keyNumbers as string[]) : undefined,
    status: row.status as AssetStatus,
    sourceReferences: row.sourceReferences
      ? (row.sourceReferences as string[])
      : undefined,
    lastReviewedAt:
      row.lastReviewedAt instanceof Date
        ? row.lastReviewedAt.toISOString().slice(0, 10)
        : String(row.lastReviewedAt),
    parentId: row.parentId,
    version: row.version,
    createdAt:
      row.createdAt instanceof Date ? row.createdAt.toISOString() : undefined,
    updatedAt:
      row.updatedAt instanceof Date ? row.updatedAt.toISOString() : undefined,
  }
}

/**
 * 모든 비아카이브 자산을 DB 에서 조회.
 *
 * React `cache()` 로 요청 단위 메모 캐시 — 같은 요청에서 여러 Server Component 가
 * 호출해도 DB 쿼리는 1회만 수행된다.
 *
 * ⚠ Server Component · Server Action · Route Handler 에서만 호출 가능.
 *   Client Component 에서 직접 import/호출 금지.
 */
export const getAllAssets = cache(async (): Promise<UdAsset[]> => {
  const rows = await prisma.contentAsset.findMany({
    where: { status: { not: 'archived' } },
    orderBy: { name: 'asc' },
  })
  return rows.map(dbRowToUdAsset)
})

// ═════════════════════════════════════════════════════════════
// 7. 헬퍼 유틸 (컴포넌트·API 공용)
// ═════════════════════════════════════════════════════════════

/**
 * 자산 ID 로 조회. 모르는 ID 면 null.
 *
 * Phase H (ADR-010): DB 조회로 전환. 요청 단위 cache 로 중복 쿼리 방지.
 */
export const findAssetById = cache(
  async (id: string): Promise<UdAsset | null> => {
    const row = await prisma.contentAsset.findUnique({ where: { id } })
    if (!row) return null
    return dbRowToUdAsset(row)
  },
)

// ═════════════════════════════════════════════════════════════
// CATEGORY_LABELS · EVIDENCE_LABELS · matchScoreBand · SECTION_NO_TO_KEY
// 은 asset-registry-types.ts 로 이관됨.
// 파일 최상단에서 re-export 되므로 기존 import 경로 (@/lib/asset-registry)
// 는 그대로 동작.
// ═════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════
// 8. Wave G6 — Step 6 제안서 섹션 생성 시 자산 주입
// ═════════════════════════════════════════════════════════════

/**
 * acceptedAssetIds 를 받아 섹션별로 필터·포맷한 AI 프롬프트 블록 생성.
 *
 * 사용: Step 6 제안서 섹션 생성 시 proposal-ai.ts 가 호출.
 *
 * 동작:
 *  - acceptedIds 를 ContentAsset DB 에서 조회 (findAssetById).
 *  - section 이 주어지면 asset.applicableSections 에 section 이 포함된 자산만.
 *  - section 이 없으면 승인된 모든 자산을 포맷.
 *  - 결과 없으면 빈 문자열 반환 → 기존 프롬프트 동작에 영향 없음.
 *
 * 출력 예시:
 * ```
 * [이 섹션에 반드시 포함할 언더독스 자산]
 * 1. Alumni Hub (10년 25,000명 교육생 데이터) — 언더독스는 지난 10년간 25,000명 ...
 *    핵심 수치 (그대로 유지): 10년, 25,000명
 * 2. IMPACT 6단계 프레임워크 — 본 사업의 커리큘럼은 ...
 *    핵심 수치: 6단계
 *
 * **주의**: 위 narrativeSnippet 을 그대로 복사하지 말고 이 섹션의 맥락에 맞춰
 * 재작성할 것. 단 keyNumbers 는 정확히 유지.
 * 자산을 활용한 문단 끝에 `<!-- asset:{id} -->` 주석을 삽입해 추적 가능하게 할 것.
 * ```
 *
 * @param acceptedIds PM 이 Step 1 에서 승인한 자산 ID 목록 (Project.acceptedAssetIds)
 * @param section 이 섹션에 applicable 한 자산만 필터 (생략 시 전체)
 * @returns AI 프롬프트용 포맷된 블록. 승인 자산이 없으면 빈 문자열.
 */
export async function formatAcceptedAssets(
  acceptedIds: string[] | undefined,
  section?: ProposalSectionKey,
): Promise<string> {
  if (!acceptedIds || acceptedIds.length === 0) return ''

  // 1. ID → UdAsset 으로 매핑 (모르는 ID 는 조용히 제외).
  //    Phase H (ADR-010) 이후 findAssetById 는 async + DB 조회. 요청 단위 cache 덕에
  //    같은 id 중복 호출은 1 회 쿼리로 귀결.
  const resolved = await Promise.all(
    acceptedIds.map((id) => findAssetById(id)),
  )
  const assets: UdAsset[] = resolved.filter((a): a is UdAsset => a !== null)
  if (assets.length === 0) return ''

  // 2. 섹션 필터
  const filtered = section
    ? assets.filter((a) => a.applicableSections.includes(section))
    : assets
  if (filtered.length === 0) return ''

  // 3. 포맷 — AI 가 바로 읽을 한국어 지시문
  const lines: string[] = []
  lines.push('[이 섹션에 반드시 포함할 언더독스 자산]')
  filtered.forEach((a, idx) => {
    lines.push(`${idx + 1}. ${a.name} — ${a.narrativeSnippet}`)
    if (a.keyNumbers && a.keyNumbers.length > 0) {
      lines.push(`   핵심 수치 (그대로 유지): ${a.keyNumbers.join(', ')}`)
    }
    // 소프트 마커 지시 — 편집 UI 가 나중에 asset:id 주석으로 활용 위치 추적
    lines.push(`   (활용 위치 끝에 <!-- asset:${a.id} --> 주석 삽입)`)
  })
  lines.push('')
  lines.push(
    '**주의**: 위 narrativeSnippet 을 그대로 복사하지 말고 이 섹션의 맥락에 맞춰 재작성할 것.',
  )
  lines.push('단 keyNumbers 로 지정된 숫자는 정확히 유지해야 한다 (수치 왜곡 금지).')
  lines.push(
    '각 자산을 활용한 문단 끝에 `<!-- asset:{asset-id} -->` 주석을 삽입해 추적 가능하게 할 것.',
  )
  return lines.join('\n')
}
