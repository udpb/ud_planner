/**
 * GET /api/cron/brain/concept-evolution — W22 (Phase B) ⭐
 *
 * 매일 실행 — 매핑 안 된 ContentAsset → AssetConcept 자동 생성.
 * Brain 이 새 자산을 24h 이내에 스스로 흡수.
 *
 * 보호 — max 자산 수 30개로 제한 (cron 시간 / 비용 컨트롤). 더 많으면 다음 cron.
 *
 * Vercel Cron: 매일 KST 6시 → "0 21 * * *" (UTC)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkCronAuth } from '@/lib/cron/auth'
import { extractConcepts } from '@/lib/inference/concept-extractor'
import { embed } from '@/lib/inference/vector-utils'
import { log } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5분 — LLM batch 처리

const BATCH_SIZE = 15
const MAX_ASSETS_PER_RUN = 30 // 2 batch

function normalizeName(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase()
}

export async function GET(req: NextRequest) {
  const authError = checkCronAuth(req)
  if (authError) return authError

  const startedAt = Date.now()

  // 1. 매핑 안 된 자산 (시간 기준 우선순위)
  const targets = await prisma.contentAsset.findMany({
    where: { concepts: { none: {} } },
    select: { id: true, name: true, narrativeSnippet: true, assetType: true },
    orderBy: { createdAt: 'desc' },
    take: MAX_ASSETS_PER_RUN,
  })

  if (targets.length === 0) {
    return NextResponse.json({
      ok: true,
      summary: { targets: 0, message: '모든 자산이 이미 Concept 매핑됨' },
    })
  }

  // 2. 기존 Concept 캐시
  const existing = await prisma.concept.findMany({
    select: { id: true, name: true, aliases: true },
  })
  const byName = new Map<string, string>()
  const aliasMap = new Map<string, string>()
  for (const c of existing) {
    byName.set(normalizeName(c.name), c.id)
    for (const a of c.aliases) aliasMap.set(normalizeName(a), normalizeName(c.name))
  }

  // 3. batch 처리
  const batches: typeof targets[] = []
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    batches.push(targets.slice(i, i + BATCH_SIZE))
  }

  let totalConceptsCreated = 0
  let totalMappingsCreated = 0
  let totalBatchFailures = 0
  const affectedConceptIds = new Set<string>()
  const affectedAssetIds = new Set<string>()

  for (const batch of batches) {
    let result
    try {
      const hint = await prisma.concept.findMany({
        select: { name: true, aliases: true, type: true },
        take: 50,
      })
      result = await extractConcepts({
        assets: batch.map((a) => ({
          id: a.id,
          name: a.name,
          narrativeSnippet: a.narrativeSnippet,
          assetType: a.assetType,
        })),
        existingConcepts: hint,
      })
    } catch (e) {
      totalBatchFailures++
      log.warn('cron', '[brain/concept-evolution] batch fail', {
        err: e instanceof Error ? e.message.slice(0, 120) : String(e),
      })
      continue
    }

    // Concept upsert
    const idMap = new Map<string, string>()
    for (const concept of result.concepts) {
      const canonical = normalizeName(concept.name)
      const existingId =
        byName.get(canonical) ??
        (aliasMap.has(canonical) ? byName.get(aliasMap.get(canonical)!) : undefined)
      if (existingId) {
        idMap.set(canonical, existingId)
        continue
      }
      const embText = `${concept.name} ${concept.description ?? ''} ${concept.aliases.join(' ')}`
      const emb = await embed(embText)
      const created = await prisma.concept.create({
        data: {
          name: concept.name,
          type: concept.type,
          description: concept.description ?? null,
          aliases: concept.aliases,
          embedding: emb,
          embeddingModel: 'gemini-embedding-001',
          embeddedAt: new Date(),
        },
      })
      byName.set(canonical, created.id)
      for (const a of concept.aliases) aliasMap.set(normalizeName(a), canonical)
      idMap.set(canonical, created.id)
      totalConceptsCreated++
    }

    // AssetConcept 생성
    for (const mapping of result.mappings) {
      if (!batch.find((a) => a.id === mapping.assetId)) continue
      affectedAssetIds.add(mapping.assetId)
      for (const c of mapping.concepts) {
        const canonical = normalizeName(c.name)
        const conceptId =
          idMap.get(canonical) ??
          byName.get(canonical) ??
          (aliasMap.has(canonical) ? byName.get(aliasMap.get(canonical)!) : undefined)
        if (!conceptId) continue
        try {
          await prisma.assetConcept.create({
            data: {
              assetId: mapping.assetId,
              conceptId,
              weight: c.weight,
              isCore: c.isCore,
            },
          })
          totalMappingsCreated++
          affectedConceptIds.add(conceptId)
        } catch {
          /* 중복 무시 */
        }
      }
    }
  }

  // Concept stats 갱신
  for (const cid of affectedConceptIds) {
    const count = await prisma.assetConcept.count({ where: { conceptId: cid } })
    await prisma.concept.update({
      where: { id: cid },
      data: { assetCount: count, lastUsedAt: new Date() },
    })
  }

  // Backlog 남았는지 확인 (다음 cron 까지 대기)
  const remaining = await prisma.contentAsset.count({ where: { concepts: { none: {} } } })

  const elapsedMs = Date.now() - startedAt
  log.info('cron', '[brain/concept-evolution] 완료', {
    targets: targets.length,
    conceptsCreated: totalConceptsCreated,
    mappingsCreated: totalMappingsCreated,
    batchFailures: totalBatchFailures,
    remaining,
    elapsedMs,
  })

  return NextResponse.json({
    ok: true,
    summary: {
      targets: targets.length,
      conceptsCreated: totalConceptsCreated,
      mappingsCreated: totalMappingsCreated,
      affectedAssets: affectedAssetIds.size,
      batchFailures: totalBatchFailures,
      remainingBacklog: remaining,
      elapsedMs,
    },
  })
}
