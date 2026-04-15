import type { ModuleManifest } from '@/modules/_types'

export const manifest: ModuleManifest = {
  name: 'impact-chain',
  layer: 'core',
  version: '0.1.0',
  owner: 'TBD',
  reads: {
    context: ['curriculum', 'budget'],
    assets: ['impact-modules', 'sroi-proxy'],
  },
  writes: {
    context: ['impact'],
  },
  api: [
    'POST /api/ai/logic-model',
    'POST /api/ai/suggest-impact-goal',
  ],
  ui: 'src/app/(dashboard)/projects/[id]/step-impact.tsx',
  quality: {
    checks: [],
  },
}
