/**
 * scripts/embed-winning-chunks.ts — 당선 full-text 의미검색 청킹+임베딩 (P11, 2026-05-31)
 *
 * WinningProposalDoc.fullText 를 섹션 단위로 청킹 → gemini-embedding 임베딩 →
 * WinningProposalChunk 저장. 본 RFP 와 의미 유사한 당선 passage 검색(RAG)의 기반.
 *
 * 재개: 이미 청크가 있는 doc 은 skip (재청킹 원하면 --reembed 로 교체).
 * lowText(이미지/HWP) 는 본문 빈약 → 제외.
 *
 * 사용:
 *   npx tsx scripts/embed-winning-chunks.ts [--limit N] [--reembed] [--dry-run]
 */
import { config } from 'dotenv'
config({ path: '.env' })
config({ path: '.env.local', override: true })

const argv = process.argv.slice(2)
const arg = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined }
const LIMIT = arg('--limit') ? parseInt(arg('--limit')!, 10) : Infinity
const DRY = argv.includes('--dry-run')
const REEMBED = argv.includes('--reembed')

const MIN_CHUNK = 80
const MAX_CHUNK = 1400
const HEAD_RE = /^\s*((?:0?\d{1,2}\.)|(?:[가-힣]\.)|(?:제\s*\d+\s*[장절])|(?:[ⅠⅡⅢⅣⅤ]\.)|[■□●◆▶])\s*\S/

/** fullText → {sectionHint, text} 청크 배열. 섹션 헤더 기준 분할, 길면 윈도우 재분할. */
function chunkText(full: string): { sectionHint: string | null; text: string }[] {
  const lines = full.split('\n')
  const segs: { hint: string | null; buf: string[] }[] = []
  let cur: { hint: string | null; buf: string[] } = { hint: null, buf: [] }
  for (const ln of lines) {
    if (HEAD_RE.test(ln.trim()) && ln.trim().length <= 40) {
      if (cur.buf.join('').trim().length > 0) segs.push(cur)
      cur = { hint: ln.trim().slice(0, 40), buf: [ln.trim()] }
    } else {
      cur.buf.push(ln)
    }
  }
  if (cur.buf.join('').trim().length > 0) segs.push(cur)
  // 헤더가 거의 없으면(<3) 통짜 → 윈도우 분할로 fallback
  const out: { sectionHint: string | null; text: string }[] = []
  const pushWindowed = (hint: string | null, body: string) => {
    const t = body.replace(/\s+/g, ' ').trim()
    if (t.length <= MAX_CHUNK) {
      if (t.length >= MIN_CHUNK) out.push({ sectionHint: hint, text: t })
      return
    }
    for (let i = 0; i < t.length; i += MAX_CHUNK - 150) {
      const piece = t.slice(i, i + MAX_CHUNK)
      if (piece.length >= MIN_CHUNK) out.push({ sectionHint: hint, text: piece })
    }
  }
  if (segs.length < 3) {
    pushWindowed(null, full)
  } else {
    for (const s of segs) pushWindowed(s.hint, s.buf.join('\n'))
  }
  return out.slice(0, 40) // doc 당 상한
}

async function main() {
  const { prisma } = await import('../src/lib/prisma')
  const { generateEmbeddings, EMBEDDING_MODEL_LABEL } = await import('../src/lib/ai/embedding')

  const docs = await prisma.winningProposalDoc.findMany({
    where: { lowText: false, charCount: { gt: 500 } },
    select: { id: true, projectName: true, channel: true, fullText: true },
    orderBy: { fetchedAt: 'asc' },
  })
  console.log(`▶ 당선 청킹+임베딩 — rich doc ${docs.length}건 ${DRY ? '(DRY)' : ''} ${REEMBED ? '(reembed)' : ''}`)

  let processed = 0, skipped = 0, chunksTotal = 0, failed = 0
  for (const d of docs) {
    if (processed >= LIMIT) break
    const existing = await prisma.winningProposalChunk.count({ where: { docId: d.id } })
    if (existing > 0 && !REEMBED) { skipped++; continue }
    const chunks = chunkText(d.fullText)
    if (chunks.length === 0) { skipped++; continue }
    if (DRY) {
      console.log(`  [DRY] ${d.projectName.slice(0, 34)} → ${chunks.length} 청크`)
      processed++; chunksTotal += chunks.length; continue
    }
    try {
      // 임베딩 (배치 — 한 doc 의 청크 전부 한 번에)
      const vectors = await generateEmbeddings(chunks.map((c) => c.text))
      if (REEMBED) await prisma.winningProposalChunk.deleteMany({ where: { docId: d.id } })
      await prisma.winningProposalChunk.createMany({
        data: chunks.map((c, i) => ({
          docId: d.id,
          projectName: d.projectName,
          channel: d.channel,
          sectionHint: c.sectionHint,
          chunkIndex: i,
          chunkText: c.text,
          embedding: vectors[i] ?? [],
          embeddingModel: EMBEDDING_MODEL_LABEL,
        })),
      })
      processed++; chunksTotal += chunks.length
      console.log(`  ✓ ${d.projectName.slice(0, 34)} → ${chunks.length} 청크`)
    } catch (e) {
      failed++
      console.warn(`  ✗ ${d.projectName.slice(0, 28)} — ${e instanceof Error ? e.message.slice(0, 70) : e}`)
    }
  }
  const total = await prisma.winningProposalChunk.count()
  console.log(`\n[요약] 처리 ${processed} · skip ${skipped} · 실패 ${failed} · 신규청크 ${chunksTotal}`)
  console.log(`[DB] WinningProposalChunk 총 ${total}건`)
  await prisma.$disconnect()
}
main().catch((e) => { console.error('FATAL:', e instanceof Error ? e.stack : e); process.exitCode = 1 })
