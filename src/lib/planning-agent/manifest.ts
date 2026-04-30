import type { ModuleManifest } from '@/modules/_types'

export const manifest: ModuleManifest = {
  name: 'planning-agent',
  layer: 'support',
  version: '0.2.0',
  owner: 'Underdogs Workspace Team',
  reads: {
    context: ['rfp'],
    assets: ['channel-presets', 'past-projects'],
  },
  writes: {
    context: ['strategy'],
  },
  api: [
    'POST /api/agent/start',
    'POST /api/agent/respond',
  ],
  ui: 'src/app/(lab)/agent-test/page.tsx',
  quality: {
    checks: [],
  },
}
