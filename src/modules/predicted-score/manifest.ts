import type { ModuleManifest } from '@/modules/_types'

export const manifest: ModuleManifest = {
  name: 'predicted-score',
  layer: 'support',
  version: '0.1.0',
  owner: 'D4-agent',

  reads: {
    context: ['rfp', 'curriculum', 'coaches', 'budget', 'impact'],
    assets: [],
  },
  writes: {
    context: [],
  },

  api: ['GET /api/projects/[id]/predict-score'],
  ui: 'src/modules/predicted-score/score-bar.tsx',

  quality: {
    checks: [],
    minScore: undefined,
  },
}
