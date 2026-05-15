/**
 * scripts/embed-assets.ts — Wave N4 CLI (2026-05-15)
 *
 * 모든 stable/developing 자산에 대해 Gemini text-embedding-004 임베딩 생성.
 *
 * 사용:
 *   npx tsx scripts/embed-assets.ts          # 누락된 것만
 *   npx tsx scripts/embed-assets.ts --force  # 전체 재생성
 *
 * 환경: DATABASE_URL · GEMINI_API_KEY
 */

import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })
// .env.local 의 E2E mock 모드를 강제로 끔 (실제 Gemini 호출)
delete process.env.PLAYWRIGHT_MOCK_AI
delete process.env.E2E_SECRET

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import {
  generateEmbeddings,
  buildAssetEmbeddingText,
  EMBEDDING_MODEL_LABEL,
} from '../src/lib/ai/embedding'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  const force = process.argv.includes('--force')
  console.log(`▶ Embed Assets 시작 (mode: ${force ? 'force' : 'missing-only'})`)
  console.log(`  model: ${EMBEDDING_MODEL_LABEL}`)

  const where = force
    ? { status: { not: 'archived' as const } }
    : {
        status: { not: 'archived' as const },
        OR: [
          { embeddedAt: null },
          { embeddingModel: { not: EMBEDDING_MODEL_LABEL } },
        ],
      }

  const assets = await prisma.contentAsset.findMany({
    where,
    select: {
      id: true,
      name: true,
      narrativeSnippet: true,
      keywords: true,
      keyNumbers: true,
    },
    orderBy: { updatedAt: 'desc' },
  })

  if (assets.length === 0) {
    console.log('◇ 임베딩 필요한 자산 0건 — 모든 자산 최신 모델로 임베딩 완료됨')
    await prisma.$disconnect()
    return
  }

  console.log(`◇ ${assets.length}개 자산 임베딩 시작`)
  console.log('')

  let processed = 0
  let errors = 0
  const BATCH = 50

  for (let i = 0; i < assets.length; i += BATCH) {
    const slice = assets.slice(i, i + BATCH)
    const prefix = `[${i + 1}-${i + slice.length}/${assets.length}]`
    try {
      const texts = slice.map((a) =>
        buildAssetEmbeddingText({
          name: a.name,
          narrativeSnippet: a.narrativeSnippet,
          keywords: a.keywords as string[] | null,
          keyNumbers: a.keyNumbers as string[] | null,
        }),
      )
      const embeddings = await generateEmbeddings(texts)
      const now = new Date()
      await prisma.$transaction(
        slice.map((a, j) =>
          prisma.contentAsset.update({
            where: { id: a.id },
            data: {
              embedding: embeddings[j],
              embeddingModel: EMBEDDING_MODEL_LABEL,
              embeddedAt: now,
            },
          }),
        ),
      )
      processed += slice.length
      console.log(`${prefix} ✓ batch ok`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`${prefix} ✗ batch 실패: ${msg.slice(0, 200)}`)
      errors += slice.length
    }
    // rate limit slack
    await new Promise((r) => setTimeout(r, 500))
  }

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Embed Assets 완료')
  console.log(`  processed: ${processed}`)
  console.log(`  errors   : ${errors}`)
  console.log(`  total    : ${assets.length}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('치명적 에러:', err)
  prisma.$disconnect()
  process.exit(1)
})
