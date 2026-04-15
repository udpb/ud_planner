/**
 * Module Manifest 타입 정의 (ADR-002)
 *
 * 모든 모듈은 `manifest.ts` 를 통해 자기 계약을 선언한다.
 * - reads: 어떤 PipelineContext 슬라이스 / 어떤 자산을 읽는지
 * - writes: 어떤 PipelineContext 슬라이스를 쓰는지
 *
 * 규칙 (docs/architecture/modules.md §1):
 * - reads.context 에 없는 슬라이스 접근 금지
 * - writes.context 외 슬라이스 수정 금지
 * - 다른 모듈의 함수 직접 import 금지 — asset 승격 or context 경유
 *
 * 강제 수단은 Phase F ESLint 커스텀 룰 (현재는 선언적).
 */

/**
 * PipelineContext 의 "슬라이스" 유니온.
 *
 * 주의: `keyof PipelineContext` 는 `projectId`, `version`, `meta` 도 포함하는데
 *       이것들은 모듈이 직접 읽고 쓰는 대상이 아니다.
 *       따라서 manifest.reads / writes 에는 이 유니온만 사용한다.
 *
 * (data-contract.md §1.1 의 슬라이스 정의와 일치)
 */
export type PipelineContextSlice =
  | 'rfp'
  | 'strategy'
  | 'research'
  | 'curriculum'
  | 'coaches'
  | 'budget'
  | 'impact'
  | 'proposal'

/**
 * 모듈 계층 (modules.md §0).
 * - core: 파이프라인 스텝 (순서 존재)
 * - asset: 회사 공유 자산 (읽기 누구나, 쓰기 ingestion/seed 만)
 * - ingestion: 자료 업로드 → 자산 적재
 * - support: 횡단 기능 (planning-agent, pm-guide 등)
 */
export type ModuleLayer = 'core' | 'asset' | 'ingestion' | 'support'

export interface ModuleManifest {
  /** 모듈 고유 식별자 (kebab-case) */
  name: string
  layer: ModuleLayer
  /** semver 0.x 로 시작 (재설계 중) */
  version: string
  /** 담당자 — 인수인계 시 이 필드만 교체 */
  owner: string

  reads: {
    /** 이 모듈이 읽는 PipelineContext 슬라이스 */
    context?: PipelineContextSlice[]
    /** 이 모듈이 사용하는 asset 모듈 이름들 */
    assets?: string[]
  }
  writes: {
    /** 이 모듈이 쓰는 PipelineContext 슬라이스 */
    context?: PipelineContextSlice[]
  }

  /** 이 모듈이 노출하는 API 엔드포인트 (예: "POST /api/ai/parse-rfp") */
  api?: string[]
  /** 이 모듈의 UI 컴포넌트 경로 */
  ui?: string

  quality?: {
    /** 적용되는 룰 ID 목록 (예: "R-001") */
    checks?: string[]
    /** 이 모듈 완료 최소 점수 (있는 경우) */
    minScore?: number
  }
}
