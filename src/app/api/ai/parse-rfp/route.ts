import { NextRequest, NextResponse } from 'next/server'
import { parseRfp } from '@/lib/claude'
import { prisma } from '@/lib/prisma'

// PDF → 텍스트 추출 (서버 전용)
async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  // pdf-parse는 Node.js 전용 — dynamic import
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse')
  const data = await pdfParse(buffer)
  return data.text
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') ?? ''
    let text = ''
    let projectId = ''

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      projectId = (formData.get('projectId') as string) ?? ''
      const file = formData.get('file') as File | null
      const rawText = formData.get('text') as string | null

      if (file) {
        // PDF 파일 처리
        const buffer = Buffer.from(await file.arrayBuffer())
        text = await extractTextFromPdf(buffer)
      } else if (rawText) {
        text = rawText
      }
    } else {
      // JSON body fallback
      const body = await req.json()
      text = body.text ?? ''
      projectId = body.projectId ?? ''
    }

    if (!text || text.trim().length < 100) {
      return NextResponse.json({ error: 'RFP 텍스트가 너무 짧습니다. PDF 또는 텍스트를 확인하세요.' }, { status: 400 })
    }

    const parsed = await parseRfp(text)

    if (projectId) {
      await prisma.project.update({
        where: { id: projectId },
        data: {
          rfpRaw: text,
          rfpParsed: parsed as any,
          name: parsed.projectName || undefined,
          client: parsed.client || undefined,
          projectType: parsed.projectType === 'B2B' ? 'B2B' : 'B2G',
          totalBudgetVat: parsed.totalBudgetVat ?? undefined,
          supplyPrice: parsed.supplyPrice ?? undefined,
          projectStartDate: parsed.projectStartDate ? new Date(parsed.projectStartDate) : undefined,
          projectEndDate: parsed.projectEndDate ? new Date(parsed.projectEndDate) : undefined,
          eduStartDate: parsed.eduStartDate ? new Date(parsed.eduStartDate) : undefined,
          eduEndDate: parsed.eduEndDate ? new Date(parsed.eduEndDate) : undefined,
          evalCriteria: parsed.evalCriteria as any,
          constraints: parsed.constraints as any,
          kpiTargets: { targetCount: parsed.targetCount, targetStage: parsed.targetStage } as any,
        },
      })
    }

    return NextResponse.json({ parsed })
  } catch (err: any) {
    console.error('RFP 파싱 에러:', err)
    return NextResponse.json({ error: err.message ?? '파싱 실패' }, { status: 500 })
  }
}
