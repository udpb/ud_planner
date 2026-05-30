/**
 * scripts/learn-winning-fulltext.ts — 당선 제안서 full-text 영구 학습 (P9, 2026-05-31)
 *
 * "두번 학습 안 하기": 마스터 시트의 운영(당선) 탭에서 '사업제안서(PDF)' 하이퍼링크 →
 * Drive 에서 1회 download + parse → WinningProposalDoc.fullText 영구 저장.
 * sourceFileId 가 unique 라 이미 적재된 파일은 skip → 중단돼도 재개(재학습 X).
 *
 * LLM 호출 없음 (download + pdf-parse 만) — 빠르고 저렴. 이미지 PDF 는 lowText 플래그.
 *
 * 사용:
 *   npx tsx scripts/learn-winning-fulltext.ts --dry-run            # 매칭·스캔만
 *   npx tsx scripts/learn-winning-fulltext.ts --tab "2025년(운영)" --limit 5
 *   npx tsx scripts/learn-winning-fulltext.ts                      # 전체 운영 탭
 *
 * 환경: Drive ADC + DATABASE_URL (Docker postgres).
 */
import { config } from 'dotenv'
config({ path: '.env' })
config({ path: '.env.local', override: true })

const SHEET = '1PK4azsX__TPGJqFTyC_WPgAnFTzamrbn9Boij4pPE38'
const DEFAULT_TABS = [
  '2025년(운영)',
  '2024년(운영)',
  '2023년(운영)',
  '2022년(운영)',
  '2021년(운영)',
]

const argv = process.argv.slice(2)
function arg(name: string): string | undefined {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}
const DRY = argv.includes('--dry-run')
const TAB_ONE = arg('--tab')
const LIMIT = arg('--limit') ? parseInt(arg('--limit')!, 10) : Infinity

/** 프로젝트 ID 접두로 채널 추정 (A.* = B2G 공공, B.* = B2B 기업). 모호하면 null. */
function inferChannel(projectId: string | undefined, name: string): string | null {
  const pid = (projectId ?? '').trim().toUpperCase()
  if (pid.startsWith('A')) return 'B2G'
  if (pid.startsWith('B')) return 'B2B'
  if (/재계약|연속|차년도|\d기/.test(name)) return 'renewal'
  return null
}

/** 헤더 행에서 라벨 부분일치 컬럼 인덱스 (1-based, ExcelJS) */
function findCol(header: unknown[], label: string): number {
  for (let i = 1; i < header.length; i++) {
    const v = header[i]
    if (v && String(v).replace(/\s/g, '').includes(label.replace(/\s/g, ''))) return i
  }
  return -1
}

async function main() {
  const { fetchSheetWorkbook, extractCellLink, extractDriveFileId } = await import('../src/lib/drive/sheets')
  const { getFileMeta, downloadFile, exportFile } = await import('../src/lib/drive/client')
  const { extractTextFromBuffer } = await import('../src/lib/ingest/file-ingester')
  const { prisma } = await import('../src/lib/prisma')

  const tabs = TAB_ONE ? [TAB_ONE] : DEFAULT_TABS
  console.log(`▶ 당선 full-text 학습 — 탭 ${tabs.length}개 ${DRY ? '(DRY-RUN)' : ''} limit=${LIMIT}`)
  const wb = await fetchSheetWorkbook(SHEET)

  let scanned = 0, hasLink = 0, skipped = 0, learned = 0, failed = 0, lowText = 0
  let processedThisRun = 0

  for (const tabName of tabs) {
    const ws = wb.getWorksheet(tabName)
    if (!ws) { console.log(`  [${tabName}] 탭 없음 — skip`); continue }
    const yearMatch = tabName.match(/(\d{4})/)
    const year = yearMatch ? parseInt(yearMatch[1], 10) : null

    const header = ws.getRow(1).values as unknown[]
    const colPdf = findCol(header, '사업제안서(PDF)')
    const colName = findCol(header, '프로젝트명')
    const colId = findCol(header, '프로젝트ID') >= 0 ? findCol(header, '프로젝트ID') : findCol(header, '프로젝트 ID')
    if (colPdf < 0) { console.log(`  [${tabName}] '사업제안서(PDF)' 컬럼 없음 — skip`); continue }
    console.log(`\n  [${tabName}] PDF컬럼=${colPdf} 명컬럼=${colName} ID컬럼=${colId}`)

    const rows: { rowNum: number; fileId: string; name: string; pid: string }[] = []
    ws.eachRow((row, n) => {
      if (n === 1) return
      const { link } = extractCellLink(row.getCell(colPdf).value as never)
      const fileId = link ? extractDriveFileId(link) : null
      if (!fileId) return
      const name = colName > 0 ? String(row.getCell(colName).value ?? '').trim() : ''
      const pid = colId > 0 ? String(row.getCell(colId).value ?? '').trim() : ''
      rows.push({ rowNum: n, fileId, name, pid })
    })
    hasLink += rows.length
    console.log(`  → PDF 링크 행 ${rows.length}`)

    for (const r of rows) {
      if (processedThisRun >= LIMIT) break
      scanned++
      // 재개: 이미 학습된 fileId 면 skip
      const exists = await prisma.winningProposalDoc.findUnique({ where: { sourceFileId: r.fileId }, select: { id: true } })
      if (exists) { skipped++; continue }
      if (DRY) {
        console.log(`    [DRY] ${r.pid || '?'} ${r.name.slice(0, 36)} (file ${r.fileId.slice(0, 12)}…)`)
        processedThisRun++
        continue
      }
      try {
        const meta = await getFileMeta(r.fileId)
        const mime = meta.mimeType ?? ''
        let buf: Buffer
        let fname = meta.name ?? `${r.fileId}.pdf`
        if (mime.startsWith('application/vnd.google-apps')) {
          buf = await exportFile(r.fileId, 'application/pdf')
          fname = fname.endsWith('.pdf') ? fname : fname + '.pdf'
        } else {
          buf = await downloadFile(r.fileId)
        }
        const extracted = await extractTextFromBuffer(buf, fname)
        const text = extracted.text ?? ''
        const low = text.length < 500
        await prisma.winningProposalDoc.create({
          data: {
            sourceFileId: r.fileId,
            projectId: r.pid || null,
            projectName: r.name || fname,
            channel: inferChannel(r.pid, r.name),
            year,
            sourceTab: tabName,
            won: true,
            fileName: fname,
            mimeType: mime,
            fullText: text,
            charCount: extracted.charCount ?? text.length,
            parseBy: extracted.by,
            lowText: low,
          },
        })
        learned++
        if (low) lowText++
        processedThisRun++
        console.log(`    ✓ ${r.pid || '?'} ${r.name.slice(0, 32)} — ${text.length}자 (${extracted.by})${low ? ' ⚠lowText' : ''}`)
      } catch (e) {
        failed++
        processedThisRun++
        console.warn(`    ✗ ${r.pid || '?'} ${r.name.slice(0, 28)} — ${e instanceof Error ? e.message.slice(0, 80) : e}`)
      }
    }
    if (processedThisRun >= LIMIT) { console.log(`\n  (limit ${LIMIT} 도달 — 중단, 재개 가능)`); break }
  }

  const total = await prisma.winningProposalDoc.count()
  console.log(`\n[요약] 스캔 ${scanned} · 링크보유 ${hasLink} · 신규학습 ${learned} · skip(기존) ${skipped} · 실패 ${failed} · lowText ${lowText}`)
  console.log(`[DB] WinningProposalDoc 총 ${total}건`)
  await prisma.$disconnect()
}
main().catch((e) => { console.error('FATAL:', e instanceof Error ? e.stack : e); process.exitCode = 1 })
