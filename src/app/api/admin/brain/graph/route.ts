/**
 * GET /api/admin/brain/graph — W26
 *
 * Concept Graph 데이터 + 서버 사이드 force-directed layout 계산.
 *
 * Query:
 *   ?limit=80 — Top N Concept
 *   ?minStrength=0.15 — Edge filter
 *
 * Response: { nodes, edges, typeCount }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const W = 1400
const H = 900
const CENTER = { x: W / 2, y: H / 2 }

interface Node {
  id: string
  name: string
  type: string
  count: number
  assetCount: number
  patternCount: number
  x: number
  y: number
  vx: number
  vy: number
  r: number
  degree: number
}

interface Edge {
  fromId: string
  toId: string
  strength: number
  coOccurCount: number
}

/**
 * Force-directed simulation — repulsion + spring + collision + center gravity.
 * 300 iter with adaptive cooling.
 */
function simulate(nodes: Node[], edges: { fromIdx: number; toIdx: number; strength: number }[]) {
  const N = nodes.length
  const REPULSION = 6000
  const SPRING_K = 0.06
  const SPRING_LENGTH = 110
  const COLLISION_PAD = 14
  const DAMPING_INIT = 0.88
  const GRAVITY = 0.012
  const ITER = 350

  for (let iter = 0; iter < ITER; iter++) {
    const damping = DAMPING_INIT - (iter / ITER) * 0.12 // cooling: 0.88 → 0.76

    // Repulsion (O(N²))
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const a = nodes[i]
        const b = nodes[j]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist2 = dx * dx + dy * dy + 0.01
        const dist = Math.sqrt(dist2)
        const f = REPULSION / dist2
        const fx = (dx / dist) * f
        const fy = (dy / dist) * f
        a.vx -= fx
        a.vy -= fy
        b.vx += fx
        b.vy += fy
      }
    }

    // Spring (edges)
    for (const e of edges) {
      const a = nodes[e.fromIdx]
      const b = nodes[e.toIdx]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.01
      const target = SPRING_LENGTH / Math.max(0.25, e.strength)
      const diff = dist - target
      const f = SPRING_K * diff * e.strength
      const fx = (dx / dist) * f
      const fy = (dy / dist) * f
      a.vx += fx
      a.vy += fy
      b.vx -= fx
      b.vy -= fy
    }

    // Collision (node-node overlap avoidance)
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const a = nodes[i]
        const b = nodes[j]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.01
        const minDist = a.r + b.r + COLLISION_PAD
        if (dist < minDist) {
          const overlap = (minDist - dist) * 0.5
          const fx = (dx / dist) * overlap
          const fy = (dy / dist) * overlap
          a.x -= fx
          a.y -= fy
          b.x += fx
          b.y += fy
        }
      }
    }

    // Gravity — pull weak nodes (low degree) toward center harder
    for (const n of nodes) {
      const pull = GRAVITY * (1 + 4 / Math.max(1, n.degree))
      n.vx += (CENTER.x - n.x) * pull
      n.vy += (CENTER.y - n.y) * pull
    }

    // Integrate + soft boundary (push back near edges, not hard clamp)
    for (const n of nodes) {
      n.vx *= damping
      n.vy *= damping
      n.x += n.vx
      n.y += n.vy
      // Soft boundary force
      const margin = 50
      if (n.x < margin) n.vx += (margin - n.x) * 0.04
      if (n.x > W - margin) n.vx -= (n.x - (W - margin)) * 0.04
      if (n.y < margin) n.vy += (margin - n.y) * 0.04
      if (n.y > H - margin) n.vy -= (n.y - (H - margin)) * 0.04
    }
  }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const limit = Math.min(150, parseInt(searchParams.get('limit') ?? '90', 10))
  const minStrength = parseFloat(searchParams.get('minStrength') ?? '0.15')

  // 1. Top Concept
  const concepts = await prisma.concept.findMany({
    select: {
      id: true,
      name: true,
      type: true,
      assetCount: true,
      patternCount: true,
    },
    orderBy: [{ assetCount: 'desc' }, { patternCount: 'desc' }],
    take: limit,
  })

  // 2. Relations
  const relations = await prisma.conceptRelation.findMany({
    where: { strength: { gte: minStrength } },
    orderBy: { strength: 'desc' },
    take: 250,
    select: {
      fromId: true,
      toId: true,
      strength: true,
      coOccurCount: true,
    },
  })

  // 3. relations 가 참조하는 노드도 포함
  const referenced = new Set<string>()
  for (const r of relations) {
    referenced.add(r.fromId)
    referenced.add(r.toId)
  }
  const conceptIds = new Set(concepts.map((c) => c.id))
  const missingIds = Array.from(referenced).filter((id) => !conceptIds.has(id))
  const missingConcepts = missingIds.length
    ? await prisma.concept.findMany({
        where: { id: { in: missingIds } },
        select: {
          id: true,
          name: true,
          type: true,
          assetCount: true,
          patternCount: true,
        },
      })
    : []
  const allConcepts = [...concepts, ...missingConcepts]

  // 4. degree 계산
  const degreeById = new Map<string, number>()
  for (const r of relations) {
    degreeById.set(r.fromId, (degreeById.get(r.fromId) ?? 0) + 1)
    degreeById.set(r.toId, (degreeById.get(r.toId) ?? 0) + 1)
  }

  // 5. 초기 위치 — type별 cluster 배치 (radial)
  const typeOrder = [
    'methodology',
    'metric',
    'persona',
    'domain',
    'tool',
    'partnership',
    'framework',
    'event-type',
  ]
  const byType = new Map<string, typeof allConcepts>()
  for (const c of allConcepts) {
    if (!byType.has(c.type)) byType.set(c.type, [])
    byType.get(c.type)!.push(c)
  }

  const nodes: Node[] = []
  const idxById = new Map<string, number>()
  const NT = typeOrder.filter((t) => byType.has(t)).length
  let typeIdx = 0
  for (const t of typeOrder) {
    const group = byType.get(t)
    if (!group) continue
    const sectorAngle = (Math.PI * 2) / NT
    const baseAngle = typeIdx * sectorAngle - Math.PI / 2
    for (let i = 0; i < group.length; i++) {
      const c = group[i]
      const innerAngle = baseAngle + (((i + 0.5) / group.length) * sectorAngle - sectorAngle / 2) * 0.85
      const count = c.assetCount + c.patternCount
      const degree = degreeById.get(c.id) ?? 0
      // 중심에 가까울수록 더 중요한 노드 (degree + count 큰 노드)
      const importance = Math.sqrt(count + degree * 2)
      const radius = 360 - Math.min(220, importance * 8)
      idxById.set(c.id, nodes.length)
      nodes.push({
        id: c.id,
        name: c.name,
        type: c.type,
        count,
        assetCount: c.assetCount,
        patternCount: c.patternCount,
        x: CENTER.x + Math.cos(innerAngle) * radius,
        y: CENTER.y + Math.sin(innerAngle) * radius,
        vx: 0,
        vy: 0,
        r: Math.max(6, Math.min(28, 6 + Math.sqrt(count) * 1.7)),
        degree,
      })
    }
    typeIdx++
  }

  // 6. edges 매핑
  const edges: Edge[] = []
  const simEdges: { fromIdx: number; toIdx: number; strength: number }[] = []
  for (const r of relations) {
    const a = idxById.get(r.fromId)
    const b = idxById.get(r.toId)
    if (a === undefined || b === undefined) continue
    edges.push({
      fromId: r.fromId,
      toId: r.toId,
      strength: r.strength,
      coOccurCount: r.coOccurCount,
    })
    simEdges.push({ fromIdx: a, toIdx: b, strength: Math.max(0.05, Math.min(1, r.strength)) })
  }

  // 7. simulation
  simulate(nodes, simEdges)

  // 8. type 카운트
  const typeCount: Record<string, number> = {}
  for (const n of nodes) typeCount[n.type] = (typeCount[n.type] ?? 0) + 1

  // strip simulation 전용 필드
  const cleanNodes = nodes.map((n) => ({
    id: n.id,
    name: n.name,
    type: n.type,
    count: n.count,
    assetCount: n.assetCount,
    patternCount: n.patternCount,
    x: Math.round(n.x),
    y: Math.round(n.y),
    r: Math.round(n.r * 10) / 10,
    degree: n.degree,
  }))

  return NextResponse.json({
    nodes: cleanNodes,
    edges,
    typeCount,
    bounds: { W, H },
    meta: { limit, minStrength, totalConcepts: allConcepts.length, totalEdges: edges.length },
  })
}
