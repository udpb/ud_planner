'use client'
/**
 * graph-view.tsx — W26 (Phase C) — Interactive Concept Graph
 *
 * 클라이언트 측 인터랙션:
 *   - hover 노드 → 노드 + neighbors + edges 강조 (나머지는 dim)
 *   - 검색 → 매칭 노드 highlight
 *   - 필터: type checkbox · min strength · min count
 *   - zoom: 마우스 휠
 *   - pan: 드래그
 *
 * 데이터는 /api/admin/brain/graph 에서 fetch (서버가 layout 계산).
 */

import { useEffect, useMemo, useRef, useState } from 'react'

interface Node {
  id: string
  name: string
  type: string
  count: number
  assetCount: number
  patternCount: number
  x: number
  y: number
  r: number
  degree: number
}

interface Edge {
  fromId: string
  toId: string
  strength: number
  coOccurCount: number
}

interface GraphData {
  nodes: Node[]
  edges: Edge[]
  typeCount: Record<string, number>
  bounds: { W: number; H: number }
  meta: { limit: number; minStrength: number; totalConcepts: number; totalEdges: number }
}

const TYPE_COLORS: Record<string, string> = {
  methodology: '#F05519',
  metric: '#373938', /* 킷 ink (구 시안 폐기) */
  persona: '#8B5CF6',
  domain: '#10B981',
  tool: '#F59E0B',
  partnership: '#EF4444',
  framework: '#3B82F6',
  'event-type': '#EC4899',
}

const TYPE_LABEL: Record<string, string> = {
  methodology: '방법론',
  metric: '지표',
  persona: '대상',
  domain: '도메인',
  tool: '도구',
  partnership: '파트너',
  framework: '프레임워크',
  'event-type': '이벤트',
}

export function GraphView({ initialData }: { initialData: GraphData }) {
  const [data, setData] = useState<GraphData>(initialData)
  const [hoverNode, setHoverNode] = useState<Node | null>(null)
  const [pinnedNode, setPinnedNode] = useState<Node | null>(null)
  const [search, setSearch] = useState('')
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(
    new Set(Object.keys(TYPE_COLORS)),
  )
  const [minStrength, setMinStrength] = useState(0.15)
  const [minCount, setMinCount] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // 검색 정규화 — debounce 없이도 충분히 빠름
  const searchLower = search.toLowerCase().trim()

  // 필터링된 nodes / edges
  const { visibleNodes, visibleEdges, neighborIds, edgesByNode } = useMemo(() => {
    const visibleSet = new Set<string>()
    for (const n of data.nodes) {
      if (!enabledTypes.has(n.type)) continue
      if (n.count < minCount) continue
      visibleSet.add(n.id)
    }
    const visibleNodes = data.nodes.filter((n) => visibleSet.has(n.id))
    const visibleEdges = data.edges.filter(
      (e) =>
        e.strength >= minStrength &&
        visibleSet.has(e.fromId) &&
        visibleSet.has(e.toId),
    )

    // 노드별 neighbor 인덱스
    const edgesByNode = new Map<string, Edge[]>()
    const neighborIds = new Map<string, Set<string>>()
    for (const e of visibleEdges) {
      ;(edgesByNode.get(e.fromId) ?? edgesByNode.set(e.fromId, []).get(e.fromId)!).push(e)
      ;(edgesByNode.get(e.toId) ?? edgesByNode.set(e.toId, []).get(e.toId)!).push(e)
      if (!neighborIds.has(e.fromId)) neighborIds.set(e.fromId, new Set())
      if (!neighborIds.has(e.toId)) neighborIds.set(e.toId, new Set())
      neighborIds.get(e.fromId)!.add(e.toId)
      neighborIds.get(e.toId)!.add(e.fromId)
    }
    return { visibleNodes, visibleEdges, neighborIds, edgesByNode }
  }, [data, enabledTypes, minStrength, minCount])

  // 강조할 노드 (hover or pinned or search match)
  const focusNode = pinnedNode ?? hoverNode
  const searchMatches = useMemo(() => {
    if (!searchLower) return new Set<string>()
    return new Set(
      visibleNodes
        .filter(
          (n) =>
            n.name.toLowerCase().includes(searchLower) ||
            n.type.toLowerCase().includes(searchLower),
        )
        .map((n) => n.id),
    )
  }, [searchLower, visibleNodes])

  const focusNeighbors = focusNode ? neighborIds.get(focusNode.id) ?? new Set() : new Set()

  const isDimmed = (nodeId: string) => {
    if (!focusNode && searchMatches.size === 0) return false
    if (focusNode) {
      return nodeId !== focusNode.id && !focusNeighbors.has(nodeId)
    }
    return !searchMatches.has(nodeId)
  }

  const isEdgeDimmed = (e: Edge) => {
    if (!focusNode && searchMatches.size === 0) return false
    if (focusNode) {
      return e.fromId !== focusNode.id && e.toId !== focusNode.id
    }
    return !searchMatches.has(e.fromId) && !searchMatches.has(e.toId)
  }

  // re-fetch when limit/minStrength 변경 (서버 layout 재계산)
  async function reload(newLimit?: number, newMinStrength?: number) {
    const url = new URL('/api/admin/brain/graph', window.location.origin)
    url.searchParams.set('limit', String(newLimit ?? data.meta.limit))
    url.searchParams.set('minStrength', String(newMinStrength ?? data.meta.minStrength))
    const res = await fetch(url.toString())
    if (res.ok) setData(await res.json())
  }

  // Wheel zoom
  function handleWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom((z) => Math.max(0.3, Math.min(3, z * delta)))
  }

  // Drag pan
  function handleMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    // only on background (not nodes)
    if ((e.target as SVGElement).tagName === 'svg' || (e.target as SVGElement).tagName === 'rect') {
      setDragging(true)
      dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
    }
  }
  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!dragging || !dragStart.current) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy })
  }
  function handleMouseUp() {
    setDragging(false)
    dragStart.current = null
  }

  // 라벨 표시 정책: focused node 모두 / 검색 매칭 / 큰 노드 (count >= 12)
  function shouldShowLabel(n: Node): boolean {
    if (focusNode && (n.id === focusNode.id || focusNeighbors.has(n.id))) return true
    if (searchMatches.has(n.id)) return true
    if (!focusNode && searchMatches.size === 0 && n.count >= 12) return true
    return false
  }

  const W = data.bounds.W
  const H = data.bounds.H

  return (
    <div className="space-y-3">
      {/* 컨트롤 */}
      <div className="rounded-lg border bg-card p-3">
        <div className="grid gap-3 md:grid-cols-3">
          {/* 검색 */}
          <div>
            <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
              🔍 Concept 검색
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="DOGS, ACTT, IMPACT, 5D ..."
              className="w-full rounded border border-input bg-background px-2.5 py-1.5 text-xs"
            />
          </div>

          {/* min strength */}
          <div>
            <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
              Min Relation Strength: {minStrength.toFixed(2)}
            </label>
            <input
              type="range"
              min={0.1}
              max={0.6}
              step={0.05}
              value={minStrength}
              onChange={(e) => setMinStrength(parseFloat(e.target.value))}
              onMouseUp={() => reload(undefined, minStrength)}
              className="w-full"
            />
          </div>

          {/* min count */}
          <div>
            <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
              Min Asset+Pattern Count: {minCount}
            </label>
            <input
              type="range"
              min={0}
              max={50}
              step={1}
              value={minCount}
              onChange={(e) => setMinCount(parseInt(e.target.value, 10))}
              className="w-full"
            />
          </div>
        </div>

        {/* type 토글 */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-medium text-muted-foreground">Type:</span>
          {Object.entries(TYPE_COLORS).map(([type, color]) => {
            const enabled = enabledTypes.has(type)
            return (
              <button
                key={type}
                onClick={() => {
                  const next = new Set(enabledTypes)
                  if (enabled) next.delete(type)
                  else next.add(type)
                  setEnabledTypes(next)
                }}
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] transition ${
                  enabled ? 'bg-white' : 'bg-gray-100 opacity-40'
                }`}
                title={enabled ? '클릭하면 숨김' : '클릭하면 표시'}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: color }}
                />
                <span className="font-medium">{TYPE_LABEL[type] || type}</span>
                <span className="text-muted-foreground">
                  {data.typeCount[type] ?? 0}
                </span>
              </button>
            )
          })}
          <button
            onClick={() => {
              setZoom(1)
              setPan({ x: 0, y: 0 })
              setPinnedNode(null)
              setSearch('')
            }}
            className="ml-auto rounded border bg-gray-50 px-2 py-0.5 text-[10px] hover:bg-gray-100"
          >
            🔄 리셋
          </button>
        </div>
      </div>

      {/* SVG */}
      <div className="relative overflow-hidden rounded-lg border bg-white">
        <svg
          ref={svgRef}
          width="100%"
          height={H * 0.7}
          viewBox={`0 0 ${W} ${H}`}
          xmlns="http://www.w3.org/2000/svg"
          style={{ display: 'block', cursor: dragging ? 'grabbing' : 'grab' }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Background (드래그용) */}
          <rect x={0} y={0} width={W} height={H} fill="#FAFAFA" />
          {/* 그리드 (배경 가이드) */}
          <g stroke="#E5E7EB" strokeWidth="0.5">
            {Array.from({ length: 10 }).map((_, i) => (
              <line
                key={`gv${i}`}
                x1={(W / 10) * i}
                y1={0}
                x2={(W / 10) * i}
                y2={H}
              />
            ))}
            {Array.from({ length: 7 }).map((_, i) => (
              <line
                key={`gh${i}`}
                x1={0}
                y1={(H / 7) * i}
                x2={W}
                y2={(H / 7) * i}
              />
            ))}
          </g>

          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Edges */}
            <g>
              {visibleEdges.map((e, i) => {
                const a = data.nodes.find((n) => n.id === e.fromId)
                const b = data.nodes.find((n) => n.id === e.toId)
                if (!a || !b) return null
                const dimmed = isEdgeDimmed(e)
                const isFocusEdge =
                  focusNode && (e.fromId === focusNode.id || e.toId === focusNode.id)
                return (
                  <line
                    key={i}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={isFocusEdge ? '#F05519' : '#6B7280'}
                    strokeOpacity={dimmed ? 0.06 : isFocusEdge ? 0.85 : 0.32}
                    strokeWidth={Math.max(0.5, e.strength * 2.6) * (isFocusEdge ? 1.6 : 1)}
                  />
                )
              })}
            </g>

            {/* Nodes */}
            <g>
              {visibleNodes.map((n) => {
                const dimmed = isDimmed(n.id)
                const isFocus = focusNode?.id === n.id
                const isNeighbor = focusNeighbors.has(n.id)
                const isMatch = searchMatches.has(n.id)
                return (
                  <g
                    key={n.id}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHoverNode(n)}
                    onMouseLeave={() => setHoverNode(null)}
                    onClick={(e) => {
                      e.stopPropagation()
                      setPinnedNode((cur) => (cur?.id === n.id ? null : n))
                    }}
                  >
                    {/* 강조 링 */}
                    {(isFocus || isMatch) && (
                      <circle
                        cx={n.x}
                        cy={n.y}
                        r={n.r + 6}
                        fill="none"
                        stroke={isFocus ? '#F05519' : '#A5A6A5'}
                        strokeWidth={2}
                        strokeOpacity={0.7}
                      />
                    )}
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={n.r}
                      fill={TYPE_COLORS[n.type] || '#9CA3AF'}
                      fillOpacity={dimmed ? 0.12 : 1}
                      stroke="#fff"
                      strokeWidth={isFocus || isNeighbor ? 2 : 1.2}
                    >
                      <title>{`${n.name}\ntype: ${n.type}\nasset+pattern: ${n.count} (asset ${n.assetCount} / pattern ${n.patternCount})\ndegree: ${n.degree}`}</title>
                    </circle>
                    {shouldShowLabel(n) && (
                      <g>
                        <rect
                          x={n.x - getLabelWidth(n.name) / 2 - 3}
                          y={n.y + n.r + 4}
                          width={getLabelWidth(n.name) + 6}
                          height={14}
                          fill="#fff"
                          fillOpacity={0.92}
                          rx={2}
                        />
                        <text
                          x={n.x}
                          y={n.y + n.r + 14}
                          textAnchor="middle"
                          fontSize={isFocus ? 12 : 10.5}
                          fontFamily="NanumHuman, sans-serif"
                          fontWeight={isFocus || isNeighbor ? 600 : 400}
                          fill="#111827"
                          style={{ pointerEvents: 'none' }}
                        >
                          {n.name.length > 16 ? n.name.slice(0, 15) + '…' : n.name}
                        </text>
                      </g>
                    )}
                  </g>
                )
              })}
            </g>
          </g>
        </svg>

        {/* 노드 디테일 패널 (우상단) */}
        {focusNode && (
          <div className="absolute right-3 top-3 w-64 rounded-lg border bg-white p-3 shadow-lg">
            <div className="mb-1.5 flex items-center gap-1.5">
              <span
                className="h-3 w-3 rounded-full"
                style={{ background: TYPE_COLORS[focusNode.type] || '#9CA3AF' }}
              />
              <span className="text-xs font-medium">
                {TYPE_LABEL[focusNode.type] || focusNode.type}
              </span>
              {pinnedNode && (
                <button
                  onClick={() => setPinnedNode(null)}
                  className="ml-auto text-[10px] text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="mb-2 text-sm font-semibold">{focusNode.name}</div>
            <div className="space-y-0.5 text-[10px] text-muted-foreground">
              <div>
                Asset: <span className="font-medium text-foreground">{focusNode.assetCount}</span>
                {' · '}
                Pattern: <span className="font-medium text-foreground">{focusNode.patternCount}</span>
              </div>
              <div>
                Degree: <span className="font-medium text-foreground">{focusNode.degree}</span> (연결 concept 수)
              </div>
              <div>
                연결 concepts:{' '}
                <span className="font-medium text-foreground">
                  {focusNeighbors.size}
                </span>
              </div>
            </div>
            {focusNeighbors.size > 0 && (
              <div className="mt-2 border-t pt-2">
                <div className="mb-1 text-[10px] font-medium text-muted-foreground">
                  연결된 Concept (Top 8):
                </div>
                <div className="flex flex-wrap gap-1">
                  {Array.from(focusNeighbors)
                    .map((id) => data.nodes.find((n) => n.id === id))
                    .filter((x): x is Node => !!x)
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 8)
                    .map((n) => (
                      <button
                        key={n.id}
                        onClick={() => setPinnedNode(n)}
                        className="rounded border px-1.5 py-0.5 text-[10px] hover:bg-gray-50"
                        style={{
                          borderColor: TYPE_COLORS[n.type] || '#D1D5DB',
                        }}
                      >
                        {n.name.length > 12 ? n.name.slice(0, 11) + '…' : n.name}
                      </button>
                    ))}
                </div>
              </div>
            )}
            {!pinnedNode && (
              <div className="mt-2 text-[9px] italic text-muted-foreground">
                💡 클릭하면 고정 · 다른 노드 클릭 가능
              </div>
            )}
          </div>
        )}

        {/* zoom 표시 (좌하단) */}
        <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded border bg-white/95 px-2 py-1 text-[10px] shadow">
          <button
            onClick={() => setZoom((z) => Math.min(3, z * 1.2))}
            className="px-1 hover:bg-gray-100"
          >
            ＋
          </button>
          <span className="font-mono">{(zoom * 100).toFixed(0)}%</span>
          <button
            onClick={() => setZoom((z) => Math.max(0.3, z * 0.85))}
            className="px-1 hover:bg-gray-100"
          >
            －
          </button>
          <button
            onClick={() => {
              setZoom(1)
              setPan({ x: 0, y: 0 })
            }}
            className="ml-1 border-l pl-1.5 hover:bg-gray-100"
          >
            fit
          </button>
        </div>

        {/* hint (우하단) */}
        <div className="absolute bottom-3 right-3 rounded border bg-white/95 px-2 py-1 text-[10px] text-muted-foreground shadow">
          🖱 drag = pan · scroll = zoom · hover = highlight
        </div>
      </div>

      <div className="text-[11px] text-muted-foreground">
        Showing <span className="font-medium text-foreground">{visibleNodes.length}</span>{' '}
        nodes ·{' '}
        <span className="font-medium text-foreground">{visibleEdges.length}</span> edges
        {focusNode && (
          <>
            {' · focused on '}
            <span className="font-medium text-foreground">{focusNode.name}</span>
          </>
        )}
        {searchMatches.size > 0 && (
          <>
            {' · '}
            <span className="font-medium text-foreground">{searchMatches.size}</span>{' '}
            match
          </>
        )}
      </div>
    </div>
  )
}

/** 한글 라벨 폭 추정 (chars * pixel) */
function getLabelWidth(name: string): number {
  const trimmed = name.length > 16 ? name.slice(0, 15) + '…' : name
  // 한글 1글자 ≈ 10.5px, 영문 ≈ 6.5px
  let w = 0
  for (const ch of trimmed) {
    w += /[가-힣ㄱ-ㅎ]/.test(ch) ? 10.5 : 6.5
  }
  return w
}
