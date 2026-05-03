/**
 * GET /api/coaches/live
 *
 * Supabase `coaches_directory` 에서 직접 read (5분 캐시).
 * Prisma 로컬 Coach 테이블 우회 — coach-finder 가 update 하면 즉시 반영.
 *
 * 용도:
 *   - 운영 모니터링 (코치 풀 실시간 카운트)
 *   - 동기화 전 미리보기 (sync 안 돌려도 최신 데이터 확인)
 *   - 외부 통합 진단 (Supabase 키 정상 동작 검증)
 *
 * 인증: ADMIN | DIRECTOR (서비스 키가 노출되면 안 되므로 권한 제한)
 *
 * 응답:
 *   { source: 'supabase', count: 818, fetchedAt: ISO, coaches: [...] }
 *
 * 또는 fetch 실패 시:
 *   { error, source: 'supabase' }
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import {
  getCoachesCached,
  isSupabaseCoachSourceAvailable,
} from '@/lib/coaches/supabase-source'
import { log } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET() {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (role !== 'ADMIN' && role !== 'DIRECTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!isSupabaseCoachSourceAvailable()) {
    return NextResponse.json(
      {
        error:
          'Supabase coach source 미설정. SUPABASE_URL + SUPABASE_SERVICE_ROLE 환경변수 필요.',
        hint:
          'coach-finder 와 동일 키 사용 — Vercel 환경변수에 추가하거나 .env.local 에 작성.',
      },
      { status: 503 },
    )
  }

  const t0 = Date.now()
  try {
    const coaches = await getCoachesCached()
    log.info('coach-live', 'fetch OK', { count: coaches.length, ms: Date.now() - t0 })

    return NextResponse.json({
      source: 'supabase',
      count: coaches.length,
      fetchedAt: new Date().toISOString(),
      // 무거우니까 요약만 — 전체 필요하면 sync 후 prisma 사용
      coaches: coaches.map((c) => ({
        githubId: c.githubId ?? null,
        name: c.name,
        organization: c.organization,
        category: c.category,
        tier: c.tier,
        regions: c.regions,
        expertise: c.expertise,
        isActive: c.isActive,
      })),
    })
  } catch (err) {
    log.error('coach-live', err)
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'fetch 실패',
        source: 'supabase',
      },
      { status: 502 },
    )
  }
}
