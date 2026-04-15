import type { ModuleManifest } from '@/modules/_types'

export const manifest: ModuleManifest = {
  name: 'curriculum-design',
  layer: 'core',
  version: '0.1.0',
  owner: 'TBD',
  reads: {
    context: ['rfp', 'strategy'],
    assets: ['impact-modules', 'winning-patterns', 'channel-presets'],
  },
  writes: {
    context: ['curriculum'],
  },
  api: ['POST /api/ai/curriculum'],
  ui: 'src/app/(dashboard)/projects/[id]/curriculum-board.tsx',
  quality: {
    checks: ['R-001', 'R-002', 'R-003', 'R-004'],
    minScore: 70,
  },
}
