import type { ModuleManifest } from '@/modules/_types'

export const manifest: ModuleManifest = {
  name: 'rfp-planning',
  layer: 'core',
  version: '0.1.0',
  owner: 'Underdogs Workspace Team',
  reads: {
    context: [],
    assets: ['channel-presets', 'winning-patterns', 'past-projects'],
  },
  writes: {
    context: ['rfp', 'strategy'],
  },
  api: [
    'POST /api/ai/parse-rfp',
    'POST /api/ai/planning-direction',
    'GET /api/projects/[id]/similar',
    'PATCH /api/projects/[id]/rfp',
  ],
  ui: 'src/app/(dashboard)/projects/[id]/step-rfp.tsx',
  quality: {
    checks: [],
  },
}
