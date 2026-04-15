import type { ModuleManifest } from '@/modules/_types'

export const manifest: ModuleManifest = {
  name: 'budget-sroi',
  layer: 'core',
  version: '0.1.0',
  owner: 'TBD',
  reads: {
    context: ['curriculum', 'coaches'],
    assets: ['cost-standards', 'sroi-proxy'],
  },
  writes: {
    context: ['budget'],
  },
  api: [
    'POST /api/budget',
    'PATCH /api/budget/[id]',
  ],
  ui: 'src/app/(dashboard)/projects/[id]/budget-dashboard.tsx',
  quality: {
    checks: [],
  },
}
