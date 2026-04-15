import type { ModuleManifest } from '@/modules/_types'

export const manifest: ModuleManifest = {
  name: 'coach-matching',
  layer: 'core',
  version: '0.1.0',
  owner: 'TBD',
  reads: {
    context: ['rfp', 'curriculum'],
    assets: ['coach-pool'],
  },
  writes: {
    context: ['coaches'],
  },
  api: [
    'POST /api/coaches/recommend',
    'POST /api/coach-assignments',
    'PATCH /api/coach-assignments/[id]',
  ],
  ui: 'src/app/(dashboard)/projects/[id]/coach-assign.tsx',
  quality: {
    checks: [],
  },
}
