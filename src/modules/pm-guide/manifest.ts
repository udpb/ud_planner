import type { ModuleManifest } from '@/modules/_types'

export const manifest: ModuleManifest = {
  name: 'pm-guide',
  layer: 'support',
  version: '0.1.0',
  owner: 'Underdogs Workspace Team',

  reads: {
    context: ['rfp', 'strategy', 'curriculum', 'coaches', 'budget', 'impact', 'proposal'],
    assets: ['winning-patterns', 'channel-presets'],
  },
  writes: {
    context: [],
  },

  ui: 'src/modules/pm-guide/panel.tsx',

  quality: {
    checks: [],
  },
}
