/**
 * GET /api/projects/[id]/export-markdown
 *
 * Express 1차본 → 깔끔한 `.md` 파일 다운로드 (Phase M3-1a, ADR-013).
 *
 * 응답:
 *   - Content-Type: text/markdown; charset=utf-8
 *   - Content-Disposition: attachment; filename="<safeName>_1차본.md"
 *
 * 후속 (M3-1b):
 *   - PPT (pptxgenjs) — AI 동적 슬라이드 분할 + UD 브랜드 디자인
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAccess } from '@/lib/auth-helpers'
import { ExpressDraftSchema } from '@/lib/express/schema'
import { renderExpressMarkdown } from '@/lib/express/render-markdown'
import type { StrategicNotes } from '@/lib/ai/strategic-notes'
import type { BreakdownEntry, ForecastItemWithMeta } from '@/lib/impact/types'
import { listActiveCategories, isImpactDbConfigured } from '@/lib/impact/db'
import { fromImpactCountry } from '@/lib/impact/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 15

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const access = await requireProjectAccess(id)
  if (!access.ok) return access.response!

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      name: true,
      client: true,
      totalBudgetVat: true,
      supplyPrice: true,
      eduStartDate: true,
      eduEndDate: true,
      expressDraft: true,
      strategicNotes: true,
      impactForecast: true,
    },
  })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Draft 파싱
  const parsed = ExpressDraftSchema.safeParse(project.expressDraft)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Express draft 가 비어있거나 손상됨' },
      { status: 400 },
    )
  }

  const notes = project.strategicNotes as unknown as StrategicNotes | null

  // Wave M5 — 사전 임팩트 forecast (있으면 markdown 섹션 자동 포함)
  let forecastBlock: Parameters<typeof renderExpressMarkdown>[0]['impactForecast'] = undefined
  if (project.impactForecast && isImpactDbConfigured()) {
    try {
      const cats = await listActiveCategories()
      const catMap = new Map(cats.map((c) => [c.id, c]))
      const breakdown = (project.impactForecast.breakdownJson as unknown as BreakdownEntry[]) ?? []
      const itemsMeta = (project.impactForecast.itemsJson as unknown as ForecastItemWithMeta[]) ?? []
      // breakdown 상위 5건 (이름·유형 lookup)
      const top = [...breakdown]
        .sort((a, b) => b.value - a.value)
        .slice(0, 5)
        .map((b) => {
          const cat = catMap.get(b.categoryId)
          const fromItem = itemsMeta.find((i) => i.categoryId === b.categoryId)
          return {
            categoryName: cat?.name ?? fromItem?.categoryName ?? b.categoryId,
            impactTypeName: cat?.impactType?.name ?? fromItem?.impactTypeName ?? '',
            value: b.value,
          }
        })
      forecastBlock = {
        totalSocialValue: Number(project.impactForecast.totalSocialValue),
        beneficiaryCount: project.impactForecast.beneficiaryCount,
        country: fromImpactCountry(project.impactForecast.country),
        calibration: project.impactForecast.calibration,
        calibrationNote: project.impactForecast.calibrationNote,
        topBreakdown: top,
      }
    } catch (err) {
      console.warn('[export-markdown] forecast 블록 구성 실패 (무시):', err)
    }
  }

  const markdown = renderExpressMarkdown({
    project: {
      name: project.name,
      client: project.client,
      totalBudgetVat: project.totalBudgetVat,
      supplyPrice: project.supplyPrice,
      eduStartDate: project.eduStartDate,
      eduEndDate: project.eduEndDate,
    },
    draft: parsed.data,
    clientOfficialDoc: notes?.clientOfficialDoc,
    impactForecast: forecastBlock,
  })

  const safeName = project.name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)
  const filename = `${safeName}_1차본.md`

  return new NextResponse(markdown, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  })
}
