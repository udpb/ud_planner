/**
 * POST /api/admin/ingest-file — Wave N3 (2026-05-15)
 *
 * multipart/form-data — file (PDF/PPTX/DOCX/XLSX) + 옵션 필드.
 * → 본문 추출 + Gemini 자산 후보 (다건 가능) JSON 응답.
 * autoSave=true 면 ContentAsset 일괄 create (status=developing).
 *
 * 인증: ADMIN | DIRECTOR
 *
 * Form fields:
 *  - file: File (필수)
 *  - hint?: string
 *  - wasWon?: 'true' (수주된 제안서 라벨 — 가산점 가산 대상 candidate)
 *  - perSlide?: 'true' (PPTX 슬라이드별 자산화)
 *  - singleOnly?: 'true' (다건 추출 OFF — 파일 전체 단건 자산)
 *  - autoSave?: 'true'
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  extractTextFromBuffer,
  proposeAssetsFromFile,
} from '@/lib/ingest/file-ingester'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5분 (대용량 PPT)
export const runtime = 'nodejs'

const MAX_FILE_BYTES = 20 * 1024 * 1024 // 20MB

export async function POST(req: NextRequest) {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role
  if (!session?.user || (role !== 'ADMIN' && role !== 'DIRECTOR')) {
    return NextResponse.json(
      { error: 'Forbidden — ADMIN/DIRECTOR 역할 필요' },
      { status: 403 },
    )
  }
  const userId = (session.user as { id?: string }).id

  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file 필드 필요' }, { status: 400 })
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `파일이 너무 큽니다 (${Math.round(file.size / 1024 / 1024)}MB > 20MB)` },
        { status: 413 },
      )
    }

    const hint = form.get('hint')?.toString() || undefined
    const wasWon = form.get('wasWon') === 'true'
    const perSlide = form.get('perSlide') === 'true'
    const singleOnly = form.get('singleOnly') === 'true'
    const autoSave = form.get('autoSave') === 'true'

    const buffer = Buffer.from(await file.arrayBuffer())
    const extracted = await extractTextFromBuffer(buffer, file.name)

    if (extracted.by === 'unsupported') {
      return NextResponse.json(
        {
          error: `지원하지 않는 포맷 (${file.name}) — PDF/PPTX/DOCX/XLSX/TXT/MD 만 가능. HWP 는 PDF 변환 후 업로드.`,
        },
        { status: 415 },
      )
    }
    if (!extracted.text || extracted.text.length < 100) {
      return NextResponse.json({
        skipped: true,
        reason: '본문이 너무 짧음 (< 100자)',
        extractedChars: extracted.charCount,
        by: extracted.by,
      })
    }

    const proposals = await proposeAssetsFromFile(extracted, file.name, {
      hint,
      wasWon,
      perSlide,
      singleOnly,
    })

    if (proposals.length === 0) {
      return NextResponse.json({
        skipped: true,
        reason: 'AI 자산 후보 0건 — 자산화 가치 없음 판단',
        extractedChars: extracted.charCount,
        by: extracted.by,
        truncated: extracted.truncated,
      })
    }

    let savedIds: string[] = []
    if (autoSave) {
      for (const p of proposals) {
        const created = await prisma.contentAsset.create({
          data: {
            name: p.name,
            category: p.category,
            applicableSections: p.applicableSections as unknown as object,
            valueChainStage: p.valueChainStage,
            evidenceType: p.evidenceType,
            keywords: p.keywords as unknown as object,
            narrativeSnippet: p.narrativeSnippet,
            keyNumbers: p.keyNumbers as unknown as object,
            status: 'developing',
            version: 1,
            sourceReferences: [`file://${file.name}`] as unknown as object,
            lastReviewedAt: new Date(),
            createdById: userId,
            updatedById: userId,
          },
          select: { id: true },
        })
        savedIds.push(created.id)
      }
    }

    return NextResponse.json({
      file: { name: file.name, sizeBytes: file.size, by: extracted.by },
      extractedChars: extracted.charCount,
      truncated: extracted.truncated,
      proposalCount: proposals.length,
      proposals,
      savedIds,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[/api/admin/ingest-file] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
