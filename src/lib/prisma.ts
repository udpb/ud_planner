import { PrismaClient, type Project } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { syncProjectToSupabase } from './supabase-sync'

// Phase Bridge 1 (2026-05-03): Prisma client extension that mirrors EVERY
// project create/update/upsert to Supabase business_plans, regardless of
// which API route triggered the mutation.
//
// Why an extension instead of per-route hooks:
//   ud-ops mutates Project from 8+ routes (POST /api/projects, PATCH
//   /api/projects/[id], /api/express/init, /api/express/save, /api/ai/
//   parse-rfp, /api/projects/[id]/rfp, /api/projects/[id]/research,
//   /api/projects/[id]/assets). Hooking each route is brittle — easy to
//   miss when new routes get added. The extension catches every Prisma
//   mutation centrally.
//
// All sync calls are fire-and-forget: the local Prisma write is the
// source of truth and never blocked by Supabase status. See
// src/lib/supabase-sync.ts for the mirror logic itself.

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined
}

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  }).$extends({
    name: 'supabase-mirror',
    query: {
      project: {
        async create({ args, query }) {
          const result = await query(args)
          fireSync(result as Project, 'create')
          return result
        },
        async update({ args, query }) {
          const result = await query(args)
          fireSync(result as Project, 'update')
          return result
        },
        async upsert({ args, query }) {
          const result = await query(args)
          fireSync(result as Project, 'upsert')
          return result
        },
        async updateMany({ args, query }) {
          // updateMany returns { count } only — no row data to sync individually.
          // If this fires we log a warning so future devs notice the gap.
          const result = await query(args)
          if (result.count > 0) {
             
            console.warn(
              `[prisma-extend] project.updateMany fired (count=${result.count}) but Supabase mirror was skipped (no row data). ` +
                'If this becomes a regular path, add a findMany pre-call to mirror each row.',
            )
          }
          return result
        },
      },
    },
  })
}

function fireSync(project: Project, op: 'create' | 'update' | 'upsert') {
  void syncProjectToSupabase(project)
    .then((res) => {
      if (!res.ok && res.reason !== 'env-missing') {
         
        console.warn('[prisma-extend] supabase mirror failed', {
          op,
          projectId: project.id,
          reason: res.reason,
        })
      }
    })
    .catch((err) => {
       
      console.warn('[prisma-extend] supabase mirror threw', {
        op,
        projectId: project.id,
        err: err instanceof Error ? err.message : String(err),
      })
    })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
