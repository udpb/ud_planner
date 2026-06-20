/**
 * /projects/[id]/program-design — 턴 기반 프로그램 기획 인테이크 (BR-3b · Server Component)
 *
 * BR-3a 엔진(`planProgram`) 위에 4단계 흐름을 얹는다 (v1.2 §01·§09):
 *   ① 토대잡기 → ② 갈림길(게이트) → ③ 자동조립 표시 → ④ 1차안.
 *
 * 서버 컴포넌트는 프로젝트·RFP 미리보기 값만 로드(엔진 호출은 안 함 — 클라이언트가
 * "기획 시작" 클릭 시 POST /api/projects/[id]/program-design 로 턴 루프 시작).
 *
 * 디자인킷 260529: radius 0, accent 면 최소, 킷 토큰만(--accent/--ink/--paper/--muted/--line),
 *   rule-board.tsx 와 같은 톤(inline style 킷 토큰).
 */

import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'

import { Header } from '@/components/layout/header'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { RfpParsed } from '@/lib/ai/parse-rfp'

import { ProgramDesignFlow, type RfpPreview } from './_components/program-design-flow'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const project = await prisma.project.findUnique({
    where: { id },
    select: { name: true },
  })
  return { title: `프로그램 기획 — ${project?.name ?? '프로젝트'}` }
}

/** RfpParsed 에서 토대잡기 미리채움 값만 추출 (전체 슬라이스는 서버 호출 시 엔진이 본다). */
function toRfpPreview(rfp: RfpParsed | null): RfpPreview | null {
  if (!rfp) return null
  return {
    projectName: rfp.projectName ?? null,
    client: rfp.client ?? null,
    targetAudience: rfp.targetAudience ?? null,
    targetCount: rfp.targetCount ?? null,
    eduStartDate: rfp.eduStartDate ?? null,
    eduEndDate: rfp.eduEndDate ?? null,
    totalBudgetVat: rfp.totalBudgetVat ?? null,
    objectives: Array.isArray(rfp.objectives) ? rfp.objectives : [],
  }
}

export default async function ProgramDesignPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect('/login')

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, name: true, client: true, rfpParsed: true },
  })

  if (!project) notFound()

  const rfp = (project.rfpParsed as unknown as RfpParsed | null) ?? null
  const rfpPreview = toRfpPreview(rfp)

  return (
    <div className="flex flex-col overflow-hidden">
      <Header title={`${project.name} · 프로그램 기획`} />
      <div className="flex-1 overflow-y-auto" style={{ padding: 24 }}>
        {/* 안내 */}
        <div style={{ marginBottom: 20, maxWidth: 880 }}>
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.7,
              color: 'var(--soft-ink)',
              wordBreak: 'keep-all',
            }}
          >
            RFP 위에 <strong style={{ fontWeight: 700 }}>프로그램 기획 1차안</strong>을 만듭니다.
            브레인이 <strong style={{ fontWeight: 700 }}>“답 + 이유”</strong>를 들고 오고, 사람은
            빈칸을 채우는 게 아니라 <strong style={{ fontWeight: 700 }}>큰 갈림길만</strong>{' '}
            확인·방향수정합니다.{' '}
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>멈추는 건 엔진이 낸 결정 게이트뿐</span>
            이고, 자동으로 정한 결정은 근거와 함께 보여드립니다(수치는 1차안에서 수정).
          </p>
        </div>

        {!rfpPreview ? (
          <div
            style={{
              border: '1px solid var(--line)',
              borderLeft: '3px solid var(--accent)',
              background: 'var(--neutral-90)',
              padding: 16,
              maxWidth: 880,
              fontSize: 13,
              color: 'var(--soft-ink)',
              lineHeight: 1.6,
            }}
          >
            <strong style={{ fontWeight: 700 }}>RFP 파싱이 먼저 필요합니다.</strong>
            {'  '}프로그램 기획은 RFP 핵심(목표·대상·기간·예산) 위에서 시작합니다 — RFP 를 먼저
            업로드·분석한 뒤 다시 들어와 주세요.
            <div style={{ marginTop: 12 }}>
              <Link
                href={`/projects/${project.id}`}
                style={{
                  display: 'inline-block',
                  border: '1px solid var(--line)',
                  background: 'var(--paper)',
                  padding: '6px 12px',
                  fontSize: 12,
                  color: 'var(--ink)',
                }}
              >
                ← 프로젝트로 이동
              </Link>
            </div>
          </div>
        ) : (
          <ProgramDesignFlow projectId={project.id} rfpPreview={rfpPreview} />
        )}
      </div>
    </div>
  )
}
