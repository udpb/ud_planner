/**
 * /admin/brain/graph — W26 (Phase C, Meta-Cognition)
 *
 * Concept Graph 시각화 — interactive client-side rendering.
 *
 * Server: fetch nodes/edges + 서버 사이드 layout 계산 (force-directed simulation).
 * Client: hover · zoom · pan · filter · search 인터랙션.
 *
 * 의존성 없는 force-directed layout — d3 등 외부 라이브러리 불필요.
 */

import Link from 'next/link'
import { Header } from '@/components/layout/header'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Network } from 'lucide-react'
import { GraphView } from './graph-view'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Concept Graph | UD Brain' }

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

/**
 * 서버 사이드 force-directed simulation — repulsion + spring + collision + soft boundary.
 */
function simulate(
  nodes: Node[],
  edges: { fromIdx: number; toIdx: number; strength: number }[],
) {
  const N = nodes.length
  const REPULSION = 6000
  const SPRING_K = 0.06
  const SPRING_LENGTH = 110
  const COLLISION_PAD = 14
  const DAMPING_INIT = 0.88
  const GRAVITY = 0.012
  const ITER = 350

  for (let iter = 0; iter < ITER; iter++) {
    const damping = DAMPING_INIT - (iter / ITER) * 0.12

    // Repulsion
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
    // Spring
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
    // Collision
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
    // Gravity — 약한 노드일수록 강하게 중앙으로
    for (const n of nodes) {
      const pull = GRAVITY * (1 + 4 / Math.max(1, n.degree))
      n.vx += (CENTER.x - n.x) * pull
      n.vy += (CENTER.y - n.y) * pull
    }
    // Integrate + soft boundary
    for (const n of nodes) {
      n.vx *= damping
      n.vy *= damping
      n.x += n.vx
      n.y += n.vy
      const margin = 50
      if (n.x < margin) n.vx += (margin - n.x) * 0.04
      if (n.x > W - margin) n.vx -= (n.x - (W - margin)) * 0.04
      if (n.y < margin) n.vy += (margin - n.y) * 0.04
      if (n.y > H - margin) n.vy -= (n.y - (H - margin)) * 0.04
    }
  }
}

async function getGraphData() {
  const concepts = await prisma.concept.findMany({
    select: {
      id: true,
      name: true,
      type: true,
      assetCount: true,
      patternCount: true,
    },
    orderBy: [{ assetCount: 'desc' }, { patternCount: 'desc' }],
    take: 90,
  })

  const relations = await prisma.conceptRelation.findMany({
    where: { strength: { gte: 0.15 } },
    orderBy: { strength: 'desc' },
    take: 250,
    select: {
      fromId: true,
      toId: true,
      strength: true,
      coOccurCount: true,
    },
  })

  // 추가 참조 노드
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

  // degree
  const degreeById = new Map<string, number>()
  for (const r of relations) {
    degreeById.set(r.fromId, (degreeById.get(r.fromId) ?? 0) + 1)
    degreeById.set(r.toId, (degreeById.get(r.toId) ?? 0) + 1)
  }

  // type별 sector 배치
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
      const innerAngle =
        baseAngle + (((i + 0.5) / group.length) * sectorAngle - sectorAngle / 2) * 0.85
      const count = c.assetCount + c.patternCount
      const degree = degreeById.get(c.id) ?? 0
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

  // edges
  const simEdges: { fromIdx: number; toIdx: number; strength: number }[] = []
  const edges: {
    fromId: string
    toId: string
    strength: number
    coOccurCount: number
  }[] = []
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
    simEdges.push({
      fromIdx: a,
      toIdx: b,
      strength: Math.max(0.05, Math.min(1, r.strength)),
    })
  }

  simulate(nodes, simEdges)

  const typeCount: Record<string, number> = {}
  for (const n of nodes) typeCount[n.type] = (typeCount[n.type] ?? 0) + 1

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

  return {
    nodes: cleanNodes,
    edges,
    typeCount,
    bounds: { W, H },
    meta: { limit: 90, minStrength: 0.15, totalConcepts: allConcepts.length, totalEdges: edges.length },
  }
}

export default async function ConceptGraphPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const data = await getGraphData()

  return (
    <div className="flex flex-col overflow-hidden">
      <Header title="Concept Graph (W26)" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium">
              RDF Triple Graph — {data.nodes.length} Concept · {data.edges.length} Relations
            </h2>
            <p className="text-[11px] text-muted-foreground">
              노드 크기 = asset+pattern count · type별 sector 배치 · 인터랙션:
              hover / drag / scroll / 검색
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <Network className="h-3.5 w-3.5 text-purple-600" />
              Interactive Concept Force Graph
            </CardTitle>
          </CardHeader>
          <CardContent>
            <GraphView initialData={data} />
          </CardContent>
        </Card>

        <div className="mt-4 flex gap-3 text-[11px]">
          <Link
            href="/admin/brain"
            className="rounded border bg-blue-50 px-3 py-1.5 hover:bg-blue-100"
          >
            ← Brain Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
