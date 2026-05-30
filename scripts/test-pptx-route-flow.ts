/**
 * M3 보강 — export-pptx route 흐름 1:1 재현.
 * 실 저장 draft → ExpressDraftSchema.safeParse → buildPptx (route 와 동일 경로).
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

async function main() {
  const { ExpressDraftSchema } = await import('../src/lib/express/schema')
  const { buildPptx } = await import('../src/lib/diagrams/pptx-builder')
  const draftPath = path.join(
    process.cwd(),
    'src/app/(dashboard)/slide-preview-test/real/generated-draft.json',
  )
  const raw = JSON.parse(fs.readFileSync(draftPath, 'utf-8'))

  const parsed = ExpressDraftSchema.safeParse(raw)
  console.log('▶ route 흐름 재현')
  console.log(`  ExpressDraftSchema.safeParse: ${parsed.success ? '✓ pass' : '✗ FAIL'}`)
  if (!parsed.success) {
    console.log('  issues:', JSON.stringify(parsed.error.issues.slice(0, 5), null, 2))
    process.exit(1)
  }
  const draft = parsed.data
  const buf = await buildPptx({
    projectName: '성균관대 GTM',
    clientName: '성균관대학교 창업지원단',
    intent: draft.intent,
    sections: draft.sections as Record<string, string> | undefined,
    slideSpecs: Array.isArray(draft.slideSpecs)
      ? (draft.slideSpecs as unknown as Parameters<typeof buildPptx>[0]['slideSpecs'])
      : undefined,
  })
  console.log(`  buildPptx: ✓ ${(buf.length / 1024).toFixed(1)} KB`)
  console.log(`  slideSpecs in draft: ${(draft.slideSpecs || []).length}`)
  console.log(`  sections in draft: ${Object.keys(draft.sections || {}).length}`)
  console.log('\n✅ route 흐름 PASS — 저장 draft → schema → pptx 일치')
}
main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
