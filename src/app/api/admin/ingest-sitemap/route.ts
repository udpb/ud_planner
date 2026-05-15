/**
 * POST /api/admin/ingest-sitemap — Wave N2 bulk (2026-05-15)
 *
 * sitemap.xml 받아 → 모든 url 순회 → AI 제안 → autoSave=true 면 일괄 저장.
 *
 * 운영 정책:
 *  - 너무 많은 URL 한 번에 처리하면 Gemini quota 폭발 → limit 기본 30, max 100
 *  - 페이지 간 200ms slack (rate limit 보호)
 *  - 실패한 url 은 errors[] 로 응답 (다른 url 진행 계속)
 *
 * Body: { sitemapUrl, limit?, autoSave?, hint?, includePatterns?, excludePatterns? }
 * Response: { total, processed, saved, skipped, errors, proposals: [...] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  fetchPageText,
  fetchSitemapUrls,
  proposeAssetFromText,
} from '@/lib/ingest/web-ingester'

const BodySchema = z.object({
  sitemapUrl: z.string().url(),
  /** 최대 처리 url 수 (기본 30, max 100) */
  limit: z.number().int().min(1).max(100).optional(),
  /** AI 제안 → DB 즉시 저장 (status=developing) */
  autoSave: z.boolean().optional(),
  /** 모든 페이지에 공통 컨텍스트 */
  hint: z.string().max(500).optional(),
  /** url 정규식 — 포함된 url 만 (예: '/case-study/|/impact/') */
  includePatterns: z.array(z.string()).max(10).optional(),
  /** url 정규식 — 매칭 url 제외 */
  excludePatterns: z.array(z.string()).max(10).optional(),
})

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5분

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
    const body = await req.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', issues: parsed.error.issues },
        { status: 400 },
      )
    }
    const { sitemapUrl, limit = 30, autoSave, hint, includePatterns, excludePatterns } =
      parsed.data

    // 1) sitemap → url 리스트
    let urls = await fetchSitemapUrls(sitemapUrl)
    if (includePatterns?.length) {
      const re = new RegExp(includePatterns.join('|'))
      urls = urls.filter((u) => re.test(u))
    }
    if (excludePatterns?.length) {
      const re = new RegExp(excludePatterns.join('|'))
      urls = urls.filter((u) => !re.test(u))
    }
    const total = urls.length
    urls = urls.slice(0, limit)

    const results: Array<{
      url: string
      status: 'saved' | 'proposal' | 'skipped' | 'error'
      reason?: string
      savedId?: string
      assetName?: string
    }> = []

    for (const url of urls) {
      try {
        const page = await fetchPageText(url)
        if (!page.text || page.text.length < 100) {
          results.push({ url, status: 'skipped', reason: '본문 너무 짧음' })
          continue
        }
        const proposal = await proposeAssetFromText(page, { hint })
        if (!proposal) {
          results.push({ url, status: 'skipped', reason: 'AI 부적절 판단' })
          continue
        }
        if (autoSave) {
          const created = await prisma.contentAsset.create({
            data: {
              name: proposal.name,
              category: proposal.category,
              applicableSections: proposal.applicableSections as unknown as object,
              valueChainStage: proposal.valueChainStage,
              evidenceType: proposal.evidenceType,
              keywords: proposal.keywords as unknown as object,
              narrativeSnippet: proposal.narrativeSnippet,
              keyNumbers: proposal.keyNumbers as unknown as object,
              status: 'developing', // 담당자 검토 대기
              version: 1,
              sourceReferences: [url] as unknown as object,
              lastReviewedAt: new Date(),
              createdById: userId,
              updatedById: userId,
            },
            select: { id: true },
          })
          results.push({
            url,
            status: 'saved',
            savedId: created.id,
            assetName: proposal.name,
          })
        } else {
          results.push({ url, status: 'proposal', assetName: proposal.name })
        }

        // rate limit 보호 — Gemini 분당 60 요청 가정, 1초 ~~> 200ms slack
        await new Promise((r) => setTimeout(r, 200))
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        results.push({ url, status: 'error', reason: msg.slice(0, 200) })
      }
    }

    const summary = {
      total,
      processed: results.length,
      saved: results.filter((r) => r.status === 'saved').length,
      proposed: results.filter((r) => r.status === 'proposal').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      errors: results.filter((r) => r.status === 'error').length,
    }

    return NextResponse.json({ ...summary, results })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[/api/admin/ingest-sitemap] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
