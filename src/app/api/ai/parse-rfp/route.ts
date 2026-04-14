import { NextRequest, NextResponse } from 'next/server'
import { parseRfp, type RfpParsed } from '@/lib/claude'
import { prisma } from '@/lib/prisma'

// PDF → 텍스트 추출 (Vercel 서버리스 호환)
async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    // pdfjs-dist legacy build (Node.js 환경용)
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const uint8 = new Uint8Array(buffer)
    const doc = await pdfjsLib.getDocument({ data: uint8, useSystemFonts: true }).promise
    const pages: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      const text = content.items.map((item: any) => item.str).join(' ')
      if (text.trim()) pages.push(text)
    }
    return pages.join('\n\n')
  } catch (err: any) {
    console.error('[extractTextFromPdf] pdfjs-dist 실패, fallback 시도:', err.message)
    // fallback: pdf-parse
    try {
      const pdfParseModule = await import('pdf-parse')
      const pdfParse = (pdfParseModule as any).default ?? pdfParseModule
      const data = await pdfParse(buffer)
      return data.text
    } catch (err2: any) {
      throw new Error(`PDF 텍스트 추출 실패: ${err.message} / fallback: ${err2.message}`)
    }
  }
}

// RFP 파싱 결과에서 정보 부족/주의 항목을 감지하여 질문 생성
interface ClarifyingQuestion {
  field: string
  label: string
  question: string
  severity: 'missing' | 'weak' | 'tip'
}

function detectGaps(parsed: RfpParsed): ClarifyingQuestion[] {
  const questions: ClarifyingQuestion[] = []

  if (!parsed.totalBudgetVat && !parsed.supplyPrice) {
    questions.push({
      field: 'totalBudgetVat',
      label: '예산',
      question: 'RFP에서 예산 정보를 찾지 못했습니다. 총 예산(VAT 포함)을 입력해주세요.',
      severity: 'missing',
    })
  }

  if (!parsed.targetCount) {
    questions.push({
      field: 'targetCount',
      label: '참여인원',
      question: '참여 인원이 명시되지 않았습니다. 예상 참여 인원을 입력해주세요.',
      severity: 'missing',
    })
  }

  if (!parsed.targetStage || parsed.targetStage.length === 0) {
    questions.push({
      field: 'targetStage',
      label: '대상 창업 단계',
      question: '대상자의 창업 단계가 명시되지 않았습니다. 예비/초기/성장 중 어떤 단계인가요?',
      severity: 'missing',
    })
  }

  if (!parsed.eduStartDate || !parsed.eduEndDate) {
    questions.push({
      field: 'eduStartDate',
      label: '교육 기간',
      question: '교육 시작일/종료일을 확인할 수 없습니다. 예상 교육 기간을 입력해주세요.',
      severity: 'missing',
    })
  }

  if (!parsed.objectives || parsed.objectives.length === 0) {
    questions.push({
      field: 'objectives',
      label: '목표',
      question: 'RFP에서 사업 목표를 추출하지 못했습니다. 핵심 목표를 직접 입력해주세요.',
      severity: 'missing',
    })
  }

  if (!parsed.evalCriteria || parsed.evalCriteria.length === 0) {
    questions.push({
      field: 'evalCriteria',
      label: '평가항목',
      question: '평가 배점을 찾지 못했습니다. 제안서 평가 기준을 입력하면 제안서 작성에 큰 도움이 됩니다.',
      severity: 'weak',
    })
  }

  if (parsed.objectives && parsed.objectives.length > 0 && parsed.objectives.length < 3) {
    questions.push({
      field: 'objectives',
      label: '목표 보완',
      question: `목표가 ${parsed.objectives.length}개만 추출되었습니다. 추가 목표가 있으면 보완해주세요.`,
      severity: 'weak',
    })
  }

  if (!parsed.targetAudience || parsed.targetAudience.length < 10) {
    questions.push({
      field: 'targetAudience',
      label: '대상자',
      question: '교육 대상자 설명이 부족합니다. 구체적인 대상(연령, 분야, 경험 등)을 입력하면 커리큘럼 품질이 높아집니다.',
      severity: 'weak',
    })
  }

  // 경쟁력 팁
  if (parsed.evalCriteria && parsed.evalCriteria.length > 0) {
    const sorted = [...parsed.evalCriteria].sort((a, b) => b.score - a.score)
    const top = sorted[0]
    if (top && top.score >= 20) {
      questions.push({
        field: '_tip_eval',
        label: '평가 전략',
        question: `평가 배점에서 "${top.item}"이 ${top.score}점으로 가장 높습니다. 이 영역을 제안서에서 특히 강조해야 합니다.`,
        severity: 'tip',
      })
    }
  }

  return questions
}

// 파싱 완전성 점수 계산 (0~100)
function calculateCompleteness(parsed: RfpParsed): { score: number; breakdown: Record<string, { score: number; max: number; label: string }> } {
  const breakdown: Record<string, { score: number; max: number; label: string }> = {
    projectName: { score: parsed.projectName ? 10 : 0, max: 10, label: '사업명' },
    client: { score: parsed.client ? 10 : 0, max: 10, label: '발주기관' },
    budget: { score: (parsed.totalBudgetVat || parsed.supplyPrice) ? 10 : 0, max: 10, label: '예산' },
    period: { score: (parsed.eduStartDate && parsed.eduEndDate) ? 10 : (parsed.projectStartDate ? 5 : 0), max: 10, label: '기간' },
    target: { score: (parsed.targetAudience && parsed.targetCount) ? 10 : (parsed.targetAudience ? 5 : 0), max: 10, label: '교육 대상' },
    objectives: { score: Math.min((parsed.objectives?.length ?? 0) * 3, 15), max: 15, label: '목표' },
    evalCriteria: { score: Math.min((parsed.evalCriteria?.length ?? 0) * 3, 15), max: 15, label: '평가 배점' },
    constraints: { score: (parsed.constraints?.length ?? 0) > 0 ? 10 : 0, max: 10, label: '제약사항' },
    stage: { score: (parsed.targetStage?.length ?? 0) > 0 ? 10 : 0, max: 10, label: '창업 단계' },
  }

  const score = Object.values(breakdown).reduce((sum, b) => sum + b.score, 0)

  return { score, breakdown }
}

// POST: 파싱만 수행, DB 저장하지 않음 (PM 확인 후 별도 저장)
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
        const buffer = Buffer.from(await file.arrayBuffer())
        text = await extractTextFromPdf(buffer)
      } else if (rawText) {
        text = rawText
      }
    } else {
      const body = await req.json()
      text = body.text ?? ''
      projectId = body.projectId ?? ''
    }

    if (!text || text.trim().length < 100) {
      return NextResponse.json({ error: 'RFP 텍스트가 너무 짧습니다. PDF 또는 텍스트를 확인하세요.' }, { status: 400 })
    }

    const parsed = await parseRfp(text)
    const questions = detectGaps(parsed)
    const completeness = calculateCompleteness(parsed)

    // DB에 rfpRaw만 저장 (파싱 결과는 PM 확인 후 PUT에서 저장)
    if (projectId) {
      await prisma.project.update({
        where: { id: projectId },
        data: { rfpRaw: text },
      })
    }

    return NextResponse.json({ parsed, questions, completeness })
  } catch (err: any) {
    console.error('RFP 파싱 에러:', err)
    return NextResponse.json({ error: err.message ?? '파싱 실패' }, { status: 500 })
  }
}

// PUT: PM이 확인/수정한 파싱 결과를 DB에 저장
export async function PUT(req: NextRequest) {
  try {
    const { projectId, parsed } = await req.json()
    if (!projectId || !parsed) {
      return NextResponse.json({ error: 'projectId와 parsed가 필요합니다.' }, { status: 400 })
    }

    await prisma.project.update({
      where: { id: projectId },
      data: {
        rfpParsed: parsed,
        name: parsed.projectName || undefined,
        client: parsed.client || undefined,
        projectType: parsed.projectType === 'B2B' ? 'B2B' : 'B2G',
        totalBudgetVat: parsed.totalBudgetVat ?? undefined,
        supplyPrice: parsed.supplyPrice ?? undefined,
        projectStartDate: parsed.projectStartDate ? new Date(parsed.projectStartDate) : undefined,
        projectEndDate: parsed.projectEndDate ? new Date(parsed.projectEndDate) : undefined,
        eduStartDate: parsed.eduStartDate ? new Date(parsed.eduStartDate) : undefined,
        eduEndDate: parsed.eduEndDate ? new Date(parsed.eduEndDate) : undefined,
        evalCriteria: parsed.evalCriteria ?? undefined,
        constraints: parsed.constraints ?? undefined,
        kpiTargets: { targetCount: parsed.targetCount, targetStage: parsed.targetStage },
      },
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('RFP 저장 에러:', err)
    return NextResponse.json({ error: err.message ?? '저장 실패' }, { status: 500 })
  }
}
