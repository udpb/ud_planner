/**
 * UD Asset Registry — 클라이언트 안전 타입·상수·순수 헬퍼
 *
 * 근거: ADR-009 · ADR-010
 *
 * 이 파일은 Client Component 에서도 안전하게 import 할 수 있는
 * 순수 타입 · 상수 · 매칭 정수(MATCH_THRESHOLDS) · UI 라벨 · 순수 헬퍼만 포함.
 *
 * DB 조회·Prisma 의존성은 `asset-registry.ts` 에 분리되어 있고,
 * 거기서는 파일 최상단에 `import 'server-only'` 로 번들링 가드.
 *
 * 분리 이유 (2026-04-24 Phase H 이후 발견):
 *   Client Component 가 asset-registry 에서 타입만 import 해도 Turbopack 이
 *   같은 모듈의 prisma 의존성을 client bundle 에 포함시킴 → `pg` → `dns`
 *   노드 전용 모듈이 브라우저 번들에 들어가 빌드 에러.
 */

// ═════════════════════════════════════════════════════════════════════
// 1. 분류 유니온
// ═════════════════════════════════════════════════════════════════════

/**
 * 자산 카테고리 — 무엇으로 구성된 자산인가.
 * (담당자·조직 운영 정보는 카테고리에 없음 — ADR-009 제약)
 */
export type AssetCategory =
  | 'methodology' // IMPACT 6단계 · UOR · 5-Phase 루프
  | 'content' // AI 솔로프러너 과정 · AX Guidebook · 창업가 마인드셋
  | 'product' // Ops Workspace · Coach Finder · Coaching Log · LMS
  | 'human' // UCA 코치 풀 (개인 이름 없이 집합으로만)
  | 'data' // Alumni Hub · 고객사 DB · SROI 프록시 · Benchmark
  | 'framework' // Before/After AI 프레임 · 완결성 3조건 등 개념 프레임

/**
 * 증거 유형 — 제안서에서의 작동 방식.
 */
export type EvidenceType = 'quantitative' | 'structural' | 'case' | 'methodology'

/** 운영 상태 */
export type AssetStatus = 'stable' | 'developing' | 'archived'

// ═════════════════════════════════════════════════════════════════════
// 2. UdAsset — 자산 단건 스키마 (타입만)
// ═════════════════════════════════════════════════════════════════════

// UdAsset 안에서 참조되는 외부 타입들은 그대로 import.
// 이들은 pure type export 라 client 번들에 안전.
import type { ValueChainStage } from '@/lib/value-chain'
import type { ProposalSectionKey } from '@/lib/pipeline-context'
import type { ProgramProfile } from '@/lib/program-profile'

/**
 * 언더독스 자산 단건. 스키마 SSoT — `asset-registry.ts` 가 DB 행을 이 모양으로 정규화.
 */
export interface UdAsset {
  id: string
  name: string
  category: AssetCategory

  // 3중 태그
  applicableSections: ProposalSectionKey[]
  valueChainStage: ValueChainStage
  evidenceType: EvidenceType

  // 매칭 보조
  programProfileFit?: Partial<ProgramProfile>
  keywords?: string[]

  // 제안서 반영
  narrativeSnippet: string
  keyNumbers?: string[]

  // 상태 + 감사
  status: AssetStatus
  sourceReferences?: string[]
  lastReviewedAt: string

  // Phase H (ADR-010) 확장 — 계층·버전·감사
  parentId?: string | null
  children?: UdAsset[]
  version?: number
  createdAt?: string
  updatedAt?: string
}

// ═════════════════════════════════════════════════════════════════════
// 3. AssetMatch — 매칭 결과 타입
// ═════════════════════════════════════════════════════════════════════

export interface AssetMatch {
  asset: UdAsset
  section: ProposalSectionKey
  matchScore: number
  matchReasons: string[]
}

// ═════════════════════════════════════════════════════════════════════
// 4. 매칭 임계값
// ═════════════════════════════════════════════════════════════════════

export const MATCH_THRESHOLDS = {
  strong: 0.7,
  medium: 0.5,
  weak: 0.3,
} as const

/** 점수 밴드 분류 — UI 색상 결정 */
export function matchScoreBand(
  score: number,
): 'strong' | 'medium' | 'weak' | 'excluded' {
  if (score >= MATCH_THRESHOLDS.strong) return 'strong'
  if (score >= MATCH_THRESHOLDS.medium) return 'medium'
  if (score >= MATCH_THRESHOLDS.weak) return 'weak'
  return 'excluded'
}

// ═════════════════════════════════════════════════════════════════════
// 5. UI 라벨 상수
// ═════════════════════════════════════════════════════════════════════

export const CATEGORY_LABELS: Record<AssetCategory, string> = {
  methodology: '방법론',
  content: '콘텐츠',
  product: '프로덕트',
  human: '휴먼',
  data: '데이터',
  framework: '프레임워크',
}

export const EVIDENCE_LABELS: Record<
  EvidenceType,
  { label: string; icon: string }
> = {
  quantitative: { label: '정량', icon: '📊' },
  structural: { label: '구조', icon: '🏗' },
  case: { label: '사례', icon: '📋' },
  methodology: { label: '방법', icon: '🎓' },
}

// ═════════════════════════════════════════════════════════════════════
// 6. 섹션 번호 → ProposalSectionKey 매핑 (서버·클라 공용)
// ═════════════════════════════════════════════════════════════════════

/**
 * proposal-ai.ts PROPOSAL_SECTION_SPEC 기준 섹션번호 → ProposalSectionKey.
 * 서버 쪽 proposal-ai 와 클라 쪽 Section 뱃지 모두 공통 사용.
 */
export const SECTION_NO_TO_KEY: Record<number, ProposalSectionKey> = {
  1: 'proposal-background',
  2: 'proposal-background',
  3: 'curriculum',
  4: 'coaches',
  5: 'budget',
  6: 'impact',
  7: 'org-team',
}
