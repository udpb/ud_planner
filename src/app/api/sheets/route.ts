/**
 * /api/sheets
 * POST { action: "init-feedback" | "init-coaches" | "export-coaches" }
 *
 * - init-feedback : 피드백 시트 헤더 초기화
 * - init-coaches  : 코치 단가 시트 헤더 초기화
 * - export-coaches: DB → 코치 단가 시트 전체 내보내기
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  initFeedbackSheet,
  initCoachRateSheet,
  appendRow,
  buildCoachRateRow,
} from '@/lib/google-sheets'

export async function POST(req: NextRequest) {
  let body: { action?: string } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  const { action } = body

  // ── 피드백 시트 헤더 초기화 ─────────────────────────────
  if (action === 'init-feedback') {
    const sheetId = process.env.GOOGLE_SHEETS_FEEDBACK_ID
    if (!sheetId) return NextResponse.json({ error: 'GOOGLE_SHEETS_FEEDBACK_ID 미설정' }, { status: 500 })

    try {
      await initFeedbackSheet(sheetId)
      return NextResponse.json({ ok: true, message: '피드백 시트 헤더 초기화 완료' })
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
  }

  // ── 코치 단가 시트 헤더 초기화 ──────────────────────────
  if (action === 'init-coaches') {
    const sheetId = process.env.GOOGLE_SHEETS_COACHES_ID
    if (!sheetId) return NextResponse.json({ error: 'GOOGLE_SHEETS_COACHES_ID 미설정' }, { status: 500 })

    try {
      await initCoachRateSheet(sheetId)
      return NextResponse.json({ ok: true, message: '코치 단가 시트 헤더 초기화 완료' })
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
  }

  // ── 코치 DB → 시트 전체 내보내기 ────────────────────────
  if (action === 'export-coaches') {
    const sheetId = process.env.GOOGLE_SHEETS_COACHES_ID
    if (!sheetId) return NextResponse.json({ error: 'GOOGLE_SHEETS_COACHES_ID 미설정' }, { status: 500 })

    try {
      await initCoachRateSheet(sheetId)

      const coaches = await prisma.coach.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          email: true,
          tier: true,
          category: true,
          lectureRateMain: true,
          lectureRateSub: true,
          coachRateMain: true,
          coachRateSub: true,
          specialLectureRate: true,
          dailyRateCoach: true,
          dailyRateLecture: true,
          taxType: true,
          needTransport: true,
          transportEstimate: true,
          needAccomm: true,
          accommEstimate: true,
          availableDays: true,
          onlineAvailable: true,
          minLeadTimeDays: true,
        },
        orderBy: [{ tier: 'asc' }, { name: 'asc' }],
      })

      let exported = 0
      for (const coach of coaches) {
        const row = buildCoachRateRow(coach)
        await appendRow(sheetId, row, '코치단가')
        exported++
      }

      return NextResponse.json({ ok: true, exported })
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
  }

  return NextResponse.json({ error: `알 수 없는 action: ${action}` }, { status: 400 })
}
