import { NextRequest, NextResponse } from 'next/server'
import { appendRow, buildFeedbackRow } from '@/lib/google-sheets'
import { z } from 'zod'

const FeedbackSchema = z.object({
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  sessionNo: z.union([z.string(), z.number()]).default('전체'),
  respondent: z.string().min(1, '이름을 입력해주세요'),
  role: z.string().min(1),
  overallScore: z.number().min(1).max(5),
  contentScore: z.number().min(1).max(5),
  coachScore: z.number().min(1).max(5),
  facilitationScore: z.number().min(1).max(5),
  bestPart: z.string().default(''),
  improvement: z.string().default(''),
  wouldRecommend: z.enum(['예', '아니요', '모르겠음']).default('예'),
  freeText: z.string().default(''),
})

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }

  const parsed = FeedbackSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: '입력값 오류', details: parsed.error.flatten() },
      { status: 422 }
    )
  }

  const data = parsed.data
  const sheetId = process.env.GOOGLE_SHEETS_FEEDBACK_ID

  if (!sheetId) {
    return NextResponse.json(
      { error: 'Google Sheets ID가 설정되지 않았습니다.' },
      { status: 500 }
    )
  }

  const row = buildFeedbackRow({
    submittedAt: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
    ...data,
    sessionNo: data.sessionNo,
    overallScore: data.overallScore,
    contentScore: data.contentScore,
    coachScore: data.coachScore,
    facilitationScore: data.facilitationScore,
  })

  try {
    await appendRow(sheetId, row)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[feedback] Google Sheets 저장 실패:', e.message)
    return NextResponse.json(
      { error: 'Google Sheets 저장에 실패했습니다.', detail: e.message },
      { status: 500 }
    )
  }
}
