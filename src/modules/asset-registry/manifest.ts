import type { ModuleManifest } from '@/modules/_types'

/**
 * Asset Registry 모듈 계약 (ADR-009).
 *
 * - layer='asset' — 회사 공유 자산 레지스트리. 읽기 누구나, 쓰기는 시드/ingestion 만.
 * - reads.context: rfp · meta.programProfile 에서 매칭 점수 계산
 * - writes.context: 없음 — 자산 자체는 코드 시드 (src/lib/asset-registry.ts)
 *   프로젝트별 승인 상태는 별도 필드(Project.acceptedAssetIds)로 다른 모듈이 관리
 *
 * UI: Step 1 매칭 자산 패널 (Wave G5) + Step 6 제안서 AI 주입 (Wave G6)
 */
export const manifest: ModuleManifest = {
  name: 'asset-registry',
  layer: 'asset',
  version: '1.0.0',
  owner: 'TBD',

  reads: {
    context: ['rfp'], // rfp.parsed + meta.programProfile
    assets: [], // self-contained (자산 시드 자체가 이 모듈)
  },
  writes: {
    context: [],
  },

  ui: 'src/components/projects/matched-assets-panel.tsx',

  quality: {
    checks: [],
  },
}
