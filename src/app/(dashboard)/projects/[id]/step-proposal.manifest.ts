import type { ModuleManifest } from '@/modules/_types'

export const manifest: ModuleManifest = {
  name: 'proposal-generation',
  layer: 'core',
  version: '0.1.0',
  owner: 'TBD',
  reads: {
    context: ['rfp', 'strategy', 'curriculum', 'coaches', 'budget', 'impact'],
    assets: ['winning-patterns', 'channel-presets', 'ud-brand'],
  },
  writes: {
    context: ['proposal'],
  },
  api: ['POST /api/ai/proposal'],
  ui: 'src/app/(dashboard)/projects/[id]/step-proposal.tsx',
  quality: {
    checks: [],
  },
}
