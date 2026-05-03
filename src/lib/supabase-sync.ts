/*
 * Phase Bridge 1 (2026-05-03) — ud-ops Project → Supabase business_plans mirror.
 *
 * Why:
 *   The cross-app lifecycle (ud-ops → coaching-log → coach-finder) breaks
 *   today because a Project created in ud-ops never lands in Supabase
 *   business_plans. So when PM marks the project as 수주 (status=IN_PROGRESS
 *   or isBidWon=true), the bp_on_won DB trigger never fires, and coaches
 *   never get a row in projects/project_members → blank screen in coaching-log.
 *
 *   This module mirrors every Project create/update to the shared Supabase
 *   business_plans table, anchored by legacy_firestore_id = ud-ops Project.id.
 *   When the mirror lands with status='won', bp_on_won fires automatically.
 *
 * Strategy:
 *   - Best-effort side effect AFTER local Prisma write succeeds.
 *   - All sync calls wrapped in try/catch with structured warns; NEVER
 *     thrown back to the API route. The user's Project save must succeed
 *     even if Supabase is unreachable or misconfigured.
 *   - Idempotent via legacy_firestore_id (text UNIQUE in Supabase).
 *   - Delete is intentionally NOT mirrored in v1 — see note at end of file.
 *
 * Env (server-only — never expose to browser):
 *   SUPABASE_URL              https://zwvrtxxgctyyctirntzj.supabase.co
 *   SUPABASE_SERVICE_ROLE     service_role key (RLS bypass)
 *
 * If env vars are missing, sync silently no-ops (one-time console.warn).
 *
 * Reference: coaching-log/docs/INTEGRATED_ARCHITECTURE.md §4.1 (Option 1).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Project, ProjectStatus } from '@prisma/client'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE

let cachedClient: SupabaseClient | null = null
let envWarned = false

function getClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    if (!envWarned) {
      // eslint-disable-next-line no-console
      console.warn(
        '[supabase-sync] SUPABASE_URL or SUPABASE_SERVICE_ROLE missing — sync disabled. ' +
          'Add both to .env.local (and Vercel env) to enable mirror to coaching-log Supabase.',
      )
      envWarned = true
    }
    return null
  }
  cachedClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return cachedClient
}

// ─── Status mapping ──────────────────────────────────────────────────────
// ud-ops ProjectStatus → Supabase business_plans.status
//
// The Supabase status enum (Phase 5-B + F) accepts:
//   draft / proposed / won / lost / cancelled              — coaching-log lifecycle
//   planning / active / completed                          — coach-finder lifecycle
//
// We map ud-ops onto coaching-log's enum so the bp_on_won trigger (which
// fires on transition to 'won') participates correctly.
//
// isBidWon flag wins over status — if PM explicitly marks 수주, we honor
// that even if status hasn't been bumped yet.
export function mapStatusToBpStatus(
  udopsStatus: ProjectStatus,
  isBidWon: boolean | null | undefined,
): 'draft' | 'proposed' | 'won' | 'lost' | 'cancelled' {
  if (isBidWon === true) return 'won'
  switch (udopsStatus) {
    case 'DRAFT':
    case 'PROPOSAL':
      return 'draft'
    case 'SUBMITTED':
      return 'proposed'
    case 'IN_PROGRESS':
    case 'COMPLETED':
      // IN_PROGRESS = 진행 중 = 이미 수주된 사업.
      // COMPLETED = 종료된 사업도 'won' 유지 (lifecycle상 won → 자체 종료된 것).
      return 'won'
    case 'LOST':
      return 'lost'
    default:
      return 'draft'
  }
}

// ─── created_by resolution ───────────────────────────────────────────────
// ud-ops User (NextAuth, cuid) and Supabase profiles (uuid) are separate
// auth systems today (Gap 5 in INTEGRATED_ARCHITECTURE.md). We try to
// resolve by email; if that fails, fall back to a known admin uid.
//
// This cache is per-server-instance; cleared on cold start. That's fine
// for a stable admin email.
let cachedAdminUserId: string | null = null

async function resolveCreatedBy(client: SupabaseClient): Promise<string | null> {
  if (cachedAdminUserId) return cachedAdminUserId
  try {
    const { data } = await client
      .from('profiles')
      .select('id')
      .eq('email', 'udpb@udimpact.ai')
      .maybeSingle()
    if (data?.id) {
      cachedAdminUserId = data.id as string
      return cachedAdminUserId
    }
  } catch {
    /* fall through */
  }
  return null
}

// ─── Date helper ─────────────────────────────────────────────────────────
function toIsoDate(d: Date | string | null | undefined): string | null {
  if (!d) return null
  if (typeof d === 'string') return d.slice(0, 10)
  return d.toISOString().slice(0, 10)
}

// ─── Project → business_plans row ────────────────────────────────────────
function mapProjectToBpRow(project: Project, createdBy: string | null) {
  return {
    legacy_firestore_id: project.id,
    title: project.name,
    client: project.client,
    description: project.rfpRaw ? project.rfpRaw.slice(0, 500) : null,
    target_start_date: toIsoDate(project.eduStartDate),
    target_end_date: toIsoDate(project.eduEndDate),
    total_budget: project.totalBudgetVat ?? null,
    status: mapStatusToBpStatus(project.status, project.isBidWon),
    notes: project.bidNotes ?? null,
    created_by: createdBy,
  }
}

// ─── Main sync function ──────────────────────────────────────────────────
export interface SyncResult {
  ok: boolean
  bpId?: string
  action?: 'inserted' | 'updated'
  reason?: string
}

export async function syncProjectToSupabase(project: Project): Promise<SyncResult> {
  const client = getClient()
  if (!client) return { ok: false, reason: 'env-missing' }

  try {
    const createdBy = await resolveCreatedBy(client)
    const row = mapProjectToBpRow(project, createdBy)

    // Upsert via legacy_firestore_id (UNIQUE partial index).
    const { data: existing, error: lookupError } = await client
      .from('business_plans')
      .select('id')
      .eq('legacy_firestore_id', project.id)
      .maybeSingle()

    if (lookupError) {
      // eslint-disable-next-line no-console
      console.warn('[supabase-sync] lookup failed', {
        projectId: project.id,
        error: lookupError,
      })
      return { ok: false, reason: lookupError.message }
    }

    if (existing) {
      const { error } = await client
        .from('business_plans')
        .update(row)
        .eq('id', existing.id)
      if (error) {
        // eslint-disable-next-line no-console
        console.warn('[supabase-sync] update failed', { projectId: project.id, error })
        return { ok: false, reason: error.message }
      }
      return { ok: true, bpId: existing.id as string, action: 'updated' }
    }

    const { data: inserted, error: insertError } = await client
      .from('business_plans')
      .insert(row)
      .select('id')
      .single()
    if (insertError || !inserted) {
      // eslint-disable-next-line no-console
      console.warn('[supabase-sync] insert failed', {
        projectId: project.id,
        error: insertError,
      })
      return { ok: false, reason: insertError?.message ?? 'insert returned no row' }
    }
    return { ok: true, bpId: inserted.id as string, action: 'inserted' }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[supabase-sync] sync threw', {
      projectId: project.id,
      err: err instanceof Error ? err.message : String(err),
    })
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Delete sync — INTENTIONALLY NOT IMPLEMENTED in v1 ───────────────────
// Why: if a ud-ops Project that has already reached 'won' status is deleted,
// removing the Supabase business_plans row would orphan the projects /
// project_members rows that the bp_on_won trigger created. Coaches would
// keep their assignments but the sourcing context disappears.
//
// Safer policy: delete from ud-ops only marks the Project as removed in
// ud-ops; the Supabase business_plans row stays as historical record.
// Admins who want to delete the BP do so explicitly in Supabase.
//
// If you need delete-mirror later, gate it on:
//   - status NOT IN ('won') in Supabase
//   - OR cascade clean-up of derived projects (with confirmation)
