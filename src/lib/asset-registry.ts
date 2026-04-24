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
import type { ProposalSectionKey, RfpParsed } from '@/lib/pipeline-context'
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
 * RFP + ProgramProfile 을 보고 자산을 점수 매겨 반환.
 *
 * 점수 공식 (ADR-009):
 *   score = 0.5 * profileSimilarity(profile, asset.programProfileFit)
 *         + 0.3 * keywordOverlap(rfp, asset.keywords)
 *         + 0.2 * sectionApplicability(rfp.evalStrategy, asset.applicableSections)
 *
 * 반환: 같은 자산이 여러 섹션에 등장 가능 (섹션별 별도 AssetMatch).
 *
 * **주의**: 이 시그니처는 Wave G1 에서 정의만, 실제 구현은 Wave G4.
 * 지금은 빈 배열 반환 stub.
 */
export function matchAssetsToRfp(params: MatchAssetsParams): AssetMatch[] {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { rfp, profile, limit = 20, minScore = MATCH_THRESHOLDS.weak, assets = UD_ASSETS } = params
  // TODO(Wave G4): profileSimilarity + keywordOverlap + sectionApplicability 구현
  return []
}

// ═════════════════════════════════════════════════════════════
// 5. 자산 시드 (Wave G3 에서 15종으로 채워짐)
// ═════════════════════════════════════════════════════════════

/**
 * 언더독스 자산 시드 배열.
 * 현재는 빈 배열 — Wave G3 에서 15종 추가.
 */
export const UD_ASSETS: UdAsset[] = []

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
