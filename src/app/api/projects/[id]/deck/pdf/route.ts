/**
 * POST /api/projects/[id]/deck/pdf — DeckSpec → 워커 렌더 → PDF 다운로드 (DECK-3b-2, ADR-025 Phase 3b)
 *
 * 클라가 보관한 DeckSpec(생성 라우트 반환)을 body 로 받아 PDF 로 렌더해 스트리밍한다.
 *   deckSpec → deckSpecToElements → buildWorkerHtml(이미지 data URI 인라인, file:// 0)
 *           → renderViaWorker(별도 렌더 워커) → application/pdf attachment.
 *
 * 렌더는 **워커에서만**(Next 앱은 chromium 안 띄움 — ADR-025 §1).
 *
 * ⚠️ buildWorkerHtml 은 buildDeckHtml(내부 renderToStaticMarkup) 호출 → Node 런타임 필수.
 *    `export const runtime = 'nodejs'` 명시(브리프 §4 RSC 주의).
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProjectAccess } from '@/lib/auth-helpers'
import { renderDeckViaWorker } from '@/lib/deck/worker-client'
import { safeParseDeckSpec } from '@/lib/deck/spec'

// ⚠️ 렌더(React→HTML, react-dom/server)는 **워커**가 수행한다. Next App Router 는
//    react-dom/server import 를 빌드 차단하므로 앱은 DeckSpec(JSON)만 워커로 넘긴다.
//    (build-worker-html/render-spec 을 여기서 import 하면 전체 앱 빌드 에러.)

export const runtime = 'nodejs'
export const maxDuration = 120
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

const BodySchema = z.object({
  /** 생성 라우트가 반환한 DeckSpec (클라가 보관 → 그대로 회신). */
  deckSpec: z.unknown(),
  /** 다운로드 파일명 (선택) — 미지정 시 'deck'. */
  filename: z.string().optional(),
})

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params

  const access = await requireProjectAccess(id)
  if (!access.ok) return access.response!

  try {
    const body = await req.json().catch(() => null)
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body — { deckSpec } 필요', issues: parsed.error.issues },
        { status: 400 },
      )
    }

    // DeckSpec 검증 (잘못된 spec 으로 워커 호출 낭비 방지)
    const probe = safeParseDeckSpec(parsed.data.deckSpec)
    if (!probe.ok) {
      return NextResponse.json(
        { error: `DeckSpec 검증 실패: ${probe.error}` },
        { status: 400 },
      )
    }

    // DeckSpec(JSON) → 워커가 React→HTML→chromium 렌더 → PDF (앱은 react-dom/server 미사용)
    const { pdf } = await renderDeckViaWorker(probe.deck)

    const safeName = (parsed.data.filename ?? 'deck').replace(/[^\w가-힣\-]+/g, '_').slice(0, 80)
    const encoded = encodeURIComponent(`${safeName}.pdf`)

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="deck.pdf"; filename*=UTF-8''${encoded}`,
        'Content-Length': String(pdf.length),
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[/api/projects/[id]/deck/pdf] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
