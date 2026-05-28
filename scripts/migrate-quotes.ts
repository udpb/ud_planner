/**
 * K2 Migration — originalQuote 일괄 추출 (heuristic stopgap).
 *
 * ContentAsset 1,765 건 모두에 대해 narrativeSnippet 에서 강한 1 문장 추출 →
 * sourceReferences.originalQuote 에 저장.
 *
 * 사용:
 *   npx tsx scripts/migrate-quotes.ts            # dry-run (점수만 출력)
 *   npx tsx scripts/migrate-quotes.ts --apply    # 실제 DB 업데이트
 *   npx tsx scripts/migrate-quotes.ts --apply --limit 100  # 100건만 처리
 *
 * 한계 — extract-quote.ts 의 docstring 참조.
 *   원본 PDF/PPT 재읽기 기반 진짜 voice 보존은 별도 cron 작업 (K2.5+).
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
for (const file of ['.env', '.env.local']) {
  const envPath = path.join(process.cwd(), file)
  if (!fs.existsSync(envPath)) continue
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    process.env[k] = v
  }
}

import { extractQuoteFromNarrative } from '../src/lib/express/extract-quote'

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const limitIdx = args.indexOf('--limit')
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1] ?? '0', 10) || undefined : undefined
  const force = args.includes('--force') // 이미 originalQuote 있어도 덮어쓰기

  const { prisma } = await import('../src/lib/prisma')

  console.log(`▶ K2 originalQuote 마이그레이션`)
  console.log(`  mode: ${apply ? 'APPLY (실 DB 업데이트)' : 'DRY-RUN'}`)
  console.log(`  limit: ${limit ?? 'all'}`)
  console.log(`  force overwrite: ${force}`)
  console.log()

  // narrativeSnippet 있는 자산만 대상 (Prisma 7: not: '' 대신 길이 확인)
  const assets = await prisma.contentAsset.findMany({
    select: {
      id: true,
      name: true,
      narrativeSnippet: true,
      sourceReferences: true,
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
  })

  console.log(`처리 대상: ${assets.length}건`)
  console.log()

  let extracted = 0
  let skipped_existing = 0
  let skipped_low_score = 0
  let skipped_no_narrative = 0
  let scoreSum = 0
  let updated = 0
  const sampleResults: { name: string; score: number; quote: string }[] = []

  for (const asset of assets) {
    const sref = (asset.sourceReferences as Record<string, unknown> | null) ?? {}
    const existing = sref.originalQuote as string | undefined

    if (existing && !force) {
      skipped_existing += 1
      continue
    }

    if (!asset.narrativeSnippet) {
      skipped_no_narrative += 1
      continue
    }

    const result = extractQuoteFromNarrative(asset.narrativeSnippet)
    if (result.quote === null) {
      skipped_low_score += 1
      continue
    }

    extracted += 1
    scoreSum += result.score

    if (sampleResults.length < 5) {
      sampleResults.push({
        name: asset.name,
        score: result.score,
        quote: result.quote,
      })
    }

    if (apply) {
      const newSref = {
        ...sref,
        originalQuote: result.quote,
        originalQuoteSource: result.source, // 'heuristic' — 향후 재처리 식별용
        originalQuoteExtractedAt: new Date().toISOString(),
      }
      await prisma.contentAsset.update({
        where: { id: asset.id },
        data: { sourceReferences: newSref },
      })
      updated += 1
    }
  }

  console.log(`[결과]`)
  console.log(`  추출 성공: ${extracted}건`)
  console.log(`  skip — 기존 originalQuote 있음: ${skipped_existing}건`)
  console.log(`  skip — narrative 없음: ${skipped_no_narrative}건`)
  console.log(`  skip — 점수 미달 (< 3): ${skipped_low_score}건`)
  console.log(`  평균 점수 (추출 성공): ${(scoreSum / Math.max(1, extracted)).toFixed(2)}`)
  console.log(`  DB 업데이트: ${updated}건${apply ? '' : ' (dry-run)'}`)

  console.log(`\n[샘플 5건]`)
  sampleResults.forEach((s, i) => {
    console.log(`  ${i + 1}. ${s.name.slice(0, 50)} (score: ${s.score})`)
    console.log(`     "${s.quote.slice(0, 150)}${s.quote.length > 150 ? '...' : ''}"`)
  })

  await prisma.$disconnect()

  console.log(apply ? `\n✅ 마이그레이션 완료` : `\n✓ Dry-run 완료. 실제 적용: --apply 추가`)
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
