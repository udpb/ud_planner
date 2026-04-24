/**
 * Phase H (ADR-010) — Content Hub DB 시드.
 *
 * Phase G 의 코드 시드 UD_ASSETS_SEED(15종) 을 ContentAsset 테이블로 이관.
 *
 * 실행:
 *   npm run db:seed:content-assets
 *
 * 멱등성:
 *   upsert(id) 로 동작 — 같은 id 가 있으면 업데이트, 없으면 insert.
 *   담당자가 UI 로 수정한 내용은 이 시드 재실행 시 덮어쓰기됨.
 *   운영 환경 재실행 주의 — 개발·초기 셋업 용도.
 */

import { PrismaClient } from '@prisma/client'
import { UD_ASSETS_SEED } from '../src/lib/asset-registry'

const prisma = new PrismaClient()

async function main() {
  console.log(`[seed-content-assets] 시작 — ${UD_ASSETS_SEED.length} 종 자산 upsert`)

  let upserted = 0
  for (const asset of UD_ASSETS_SEED) {
    await prisma.contentAsset.upsert({
      where: { id: asset.id },
      create: {
        id: asset.id,
        name: asset.name,
        category: asset.category,
        parentId: null, // v1 자산은 모두 top-level (children 은 Wave H5 에서 추가)
        applicableSections: asset.applicableSections as unknown as object,
        valueChainStage: asset.valueChainStage,
        evidenceType: asset.evidenceType,
        keywords: asset.keywords ? (asset.keywords as unknown as object) : undefined,
        programProfileFit: asset.programProfileFit
          ? (asset.programProfileFit as unknown as object)
          : undefined,
        narrativeSnippet: asset.narrativeSnippet,
        keyNumbers: asset.keyNumbers ? (asset.keyNumbers as unknown as object) : undefined,
        status: asset.status,
        version: 1,
        sourceReferences: asset.sourceReferences
          ? (asset.sourceReferences as unknown as object)
          : undefined,
        lastReviewedAt: new Date(asset.lastReviewedAt),
        createdById: null,
        updatedById: null,
      },
      update: {
        name: asset.name,
        category: asset.category,
        applicableSections: asset.applicableSections as unknown as object,
        valueChainStage: asset.valueChainStage,
        evidenceType: asset.evidenceType,
        keywords: asset.keywords ? (asset.keywords as unknown as object) : undefined,
        programProfileFit: asset.programProfileFit
          ? (asset.programProfileFit as unknown as object)
          : undefined,
        narrativeSnippet: asset.narrativeSnippet,
        keyNumbers: asset.keyNumbers ? (asset.keyNumbers as unknown as object) : undefined,
        status: asset.status,
        sourceReferences: asset.sourceReferences
          ? (asset.sourceReferences as unknown as object)
          : undefined,
        lastReviewedAt: new Date(asset.lastReviewedAt),
      },
    })
    upserted += 1
    console.log(`  ✓ ${asset.id} (${asset.category} / ${asset.valueChainStage})`)
  }

  const total = await prisma.contentAsset.count()
  console.log(`\n[seed-content-assets] 완료 — upsert ${upserted} 종 · DB 총 ${total} 종`)
}

main()
  .catch((e) => {
    console.error('[seed-content-assets] 실패:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
