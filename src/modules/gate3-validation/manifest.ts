import type { ModuleManifest } from '@/modules/_types'

export const manifest: ModuleManifest = {
  name: 'gate3-validation',
  layer: 'support',
  version: '0.1.0',
  owner: 'D5-agent',

  reads: {
    context: ['rfp', 'strategy', 'curriculum', 'coaches', 'budget', 'impact', 'proposal'],
    assets: ['winning-patterns', 'channel-presets'],
  },
  writes: {
    context: [],
  },

  api: ['POST /api/ai/proposal/validate'],
  ui: undefined,

  quality: {
    checks: [],
    minScore: undefined,
  },
}
