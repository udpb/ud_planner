import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })

async function main() {
  const { extractSheetId, fetchSheetWorkbook, parseTab } = await import('../src/lib/drive/sheets')
  const SHEET = 'https://docs.google.com/spreadsheets/d/1PK4azsX__TPGJqFTyC_WPgAnFTzamrbn9Boij4pPE38/edit?gid=1586476588'
  const { sheetId } = extractSheetId(SHEET)
  const wb = await fetchSheetWorkbook(sheetId)
  for (const tabName of ['2025년(운영)', '2024년(운영)']) {
    const ws = wb.getWorksheet(tabName)
    if (!ws) continue
    const content = parseTab(ws, { maxRows: 2000 })
    let xlsx = 0, gsheet = 0, pdf = 0, hwp = 0, other = 0
    const samples: string[] = []
    for (const r of content.rows) {
      // fuzzy header
      let cell = r.byHeaderRich['산출내역서']
      if (!cell) {
        for (const [k, v] of Object.entries(r.byHeaderRich)) {
          if (k.replace(/\s+/g, '').startsWith('산출내역서')) { cell = v; break }
        }
      }
      if (!cell?.link) continue
      const url = cell.link
      const text = cell.text || ''
      if (/spreadsheets/.test(url)) gsheet++
      else if (/\.xlsx?$/i.test(text)) xlsx++
      else if (/\.pdf$|\(PDF\)/i.test(text)) { pdf++; if (samples.length < 3) samples.push(text) }
      else if (/\.hwp$/i.test(text)) hwp++
      else other++
    }
    console.log(`${tabName}: Sheet=${gsheet} XLSX=${xlsx} PDF=${pdf} HWP=${hwp} other=${other}`)
    if (samples.length > 0) console.log('  PDF samples:', samples)
  }
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
