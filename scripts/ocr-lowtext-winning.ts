/**
 * scripts/ocr-lowtext-winning.ts — lowText 당선본 OCR 복구 (P12, 2026-05-31)
 *
 * pdf-parse 로 텍스트가 거의 안 나온 이미지 PDF(lowText=true)를 Drive 재download →
 * Gemini Vision(inlineData application/pdf, 네이티브 OCR)로 full-text 추출 → 갱신.
 * 성공 시 lowText=false → 이후 embed-winning-chunks 가 RAG 에 편입.
 *
 * 재개: lowText=true 인 것만 처리. HWP(application/haansofthwp) 는 PDF Vision 불가 → skip.
 *
 * 사용: npx tsx scripts/ocr-lowtext-winning.ts [--limit N] [--dry-run]
 */
import { config } from 'dotenv'
config({ path: '.env' })
config({ path: '.env.local', override: true })

import { GoogleGenerativeAI } from '@google/generative-ai'

const argv = process.argv.slice(2)
const arg = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined }
const LIMIT = arg('--limit') ? parseInt(arg('--limit')!, 10) : Infinity
const DRY = argv.includes('--dry-run')

const VISION_MODEL = 'gemini-3-flash-preview'
const VISION_PROMPT = `이 PDF 의 모든 텍스트를 추출하세요. 구조 (제목·목록·표) 도 보존.
출력: 본문 텍스트만 (JSON X, 마크다운 펜스 X). 페이지 구분은 "--- 페이지 N ---" 형식.`

/** NUL·제어문자 strip (Postgres TEXT 안전) */
function sanitize(s: string): string {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
}

async function visionOcr(buf: Buffer): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY missing')
  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: VISION_MODEL,
    generationConfig: { maxOutputTokens: 32768, temperature: 0.1 },
  })
  const r = await model.generateContent({
    contents: [{ role: 'user', parts: [
      { text: VISION_PROMPT },
      { inlineData: { mimeType: 'application/pdf', data: buf.toString('base64') } },
    ] }],
  })
  return r.response.text()
}

async function main() {
  const { prisma } = await import('../src/lib/prisma')
  const { downloadFile } = await import('../src/lib/drive/client')

  const docs = await prisma.winningProposalDoc.findMany({
    where: { lowText: true, mimeType: 'application/pdf' },
    select: { id: true, sourceFileId: true, projectName: true, charCount: true },
  })
  console.log(`▶ lowText OCR 복구 — application/pdf ${docs.length}건 ${DRY ? '(DRY)' : ''}`)

  let ok = 0, fail = 0, skip = 0, n = 0
  for (const d of docs) {
    if (n >= LIMIT) break
    n++
    if (DRY) { console.log(`  [DRY] ${d.projectName.slice(0, 36)} (기존 ${d.charCount}자)`); continue }
    try {
      const buf = await downloadFile(d.sourceFileId)
      const sizeMB = buf.length / 1024 / 1024
      if (sizeMB > 19) { console.warn(`  - ${d.projectName.slice(0,28)} ${sizeMB.toFixed(1)}MB > 19MB inline 한계 skip`); skip++; continue }
      const text = sanitize(await visionOcr(buf))
      if (text.length <= Math.max(d.charCount, 500)) {
        console.warn(`  - ${d.projectName.slice(0,28)} OCR ${text.length}자 (개선 미미) skip`); skip++; continue
      }
      await prisma.winningProposalDoc.update({
        where: { id: d.id },
        data: { fullText: text.slice(0, 200_000), charCount: text.length, lowText: false, parseBy: 'vision-ocr' },
      })
      ok++
      console.log(`  ✓ ${d.projectName.slice(0, 34)} — OCR ${text.length}자 (기존 ${d.charCount})`)
    } catch (e) {
      fail++
      console.warn(`  ✗ ${d.projectName.slice(0, 28)} — ${e instanceof Error ? e.message.slice(0, 70) : e}`)
    }
  }
  console.log(`\n[요약] OCR 복구 ${ok} · skip ${skip} · 실패 ${fail}`)
  const stillLow = await prisma.winningProposalDoc.count({ where: { lowText: true } })
  console.log(`[DB] 남은 lowText ${stillLow}건`)
  await prisma.$disconnect()
}
main().catch((e) => { console.error('FATAL:', e instanceof Error ? e.stack : e); process.exitCode = 1 })
