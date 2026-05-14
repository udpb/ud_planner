/**
 * Auth 헬퍼 — 권한 체크 표준화 (Phase Wave 1, 2026-05-14)
 *
 * proxy.ts 는 "세션 쿠키 있음" 까지만 확인. 세부 권한 (프로젝트 소유권 등) 은
 * 각 API route 가 본 헬퍼로 직접 검증.
 *
 * 권한 정책:
 *   - ADMIN / DIRECTOR : 모든 프로젝트 접근 가능
 *   - PM : 본인 pmId 프로젝트만 또는 pmId=null (미배정) 프로젝트
 *   - 기타 role : 본인 pmId 프로젝트만
 */

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export interface AuthResult {
  ok: boolean
  userId?: string
  role?: string
  email?: string
  /** ok=false 일 때 반환할 NextResponse */
  response?: NextResponse
}

/**
 * 인증된 사용자인지 확인. session.user 가 있으면 ok=true.
 */
export async function requireAuth(): Promise<AuthResult> {
  const session = await auth()
  if (!session?.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }
  // session.user 타입에 id/role 강제 (auth.ts callbacks 가 세팅)
  const u = session.user as unknown as {
    id?: string
    role?: string
    email?: string
  }
  return {
    ok: true,
    userId: u.id,
    role: u.role,
    email: u.email,
  }
}

/**
 * 프로젝트 소유권 체크 — pmId 또는 ADMIN/DIRECTOR 권한.
 * @returns ok=true 면 통과 (정상 응답 반환). ok=false 면 response 그대로 return.
 */
export async function requireProjectAccess(projectId: string): Promise<
  AuthResult & { projectExists?: boolean }
> {
  const authRes = await requireAuth()
  if (!authRes.ok) return authRes

  // role 이 ADMIN / DIRECTOR 면 무조건 통과
  if (authRes.role === 'ADMIN' || authRes.role === 'DIRECTOR') {
    return { ...authRes, projectExists: true }
  }

  // 프로젝트 조회 — pmId 만 select
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { pmId: true },
  })
  if (!project) {
    return {
      ...authRes,
      projectExists: false,
      ok: false,
      response: NextResponse.json({ error: 'Project not found' }, { status: 404 }),
    }
  }

  // pmId 가 null (미배정) 이거나 본인이면 통과
  if (project.pmId === null || project.pmId === authRes.userId) {
    return { ...authRes, projectExists: true }
  }

  // 다른 PM 의 프로젝트 — 403
  return {
    ...authRes,
    projectExists: true,
    ok: false,
    response: NextResponse.json(
      { error: '본인 또는 미배정 프로젝트만 접근 가능합니다.' },
      { status: 403 },
    ),
  }
}
