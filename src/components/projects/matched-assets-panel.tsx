'use client'

/**
 * MatchedAssetsPanel — Step 1 매칭 자산 패널 (Phase G Wave 5)
 *
 * ADR-009 (docs/decisions/009-asset-registry.md)
 * 스펙:   docs/architecture/asset-registry.md §"Step 1 매칭 자산 패널 (Wave G5)"
 *
 * 역할:
 *   - matchAssetsToRfp() 결과(AssetMatch[]) 를 섹션별로 그룹핑해 표시
 *   - 각 자산 카드에 "✓ 제안서에 포함" 토글 — 상태는 Project.acceptedAssetIds JSON 필드
 *   - 토글은 POST /api/projects/[id]/assets 로 낙관 업데이트 + 실패 시 롤백
 *
 * 설계 원칙 (CLAUDE.md §설계 철학):
 *   2. "내부 자산은 자동으로 올라온다" — 이 패널은 PM 이 자산을 찾아가는 대신,
 *      RFP 가 자산을 끌어오게 하는 첫 물리적 구현 지점.
 *
 * 비어있는 경우 → "RFP 를 먼저 파싱해주세요" 안내 카드.
 */

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, ChevronDown, ChevronRight, Package, Sparkles } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  CATEGORY_LABELS,
  EVIDENCE_LABELS,
  matchScoreBand,
  type AssetMatch,
} from '@/lib/asset-registry-types'
import { VALUE_CHAIN_STAGES } from '@/lib/value-chain'
import type { ProposalSectionKey } from '@/lib/pipeline-context'

// ─────────────────────────────────────────
// 섹션 한국어 라벨 (UI 전용)
// ─────────────────────────────────────────

const SECTION_LABELS: Record<ProposalSectionKey, string> = {
  'proposal-background': '제안배경',
  'org-team': '수행팀',
  curriculum: '커리큘럼',
  coaches: '코치',
  budget: '예산',
  impact: '임팩트',
  other: '기타·차별화',
}

/** 섹션 카드를 보여줄 순서 — ProposalSectionKey 선언 순서와 동일 */
const SECTION_ORDER: ProposalSectionKey[] = [
  'proposal-background',
  'org-team',
  'curriculum',
  'coaches',
  'budget',
  'impact',
  'other',
]

// ─────────────────────────────────────────
// Props
// ─────────────────────────────────────────

export interface MatchedAssetsPanelProps {
  projectId: string
  /** matchAssetsToRfp() 결과 — 서버 컴포넌트가 계산해 전달 */
  matches: AssetMatch[]
  /** 이미 승인된 자산 ID (Project.acceptedAssetIds) */
  initialAcceptedIds: string[]
}

// ─────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────

export function MatchedAssetsPanel({
  projectId,
  matches,
  initialAcceptedIds,
}: MatchedAssetsPanelProps) {
  // Set 기반으로 상태 관리 — 토글 조작이 O(1)
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(
    () => new Set(initialAcceptedIds),
  )
  /** 현재 네트워크 요청 중인 자산 ID 집합 — 중복 클릭 방지용 */
  const [pending, setPending] = useState<Set<string>>(() => new Set())

  // ─ 섹션별 그룹핑 (매칭 점수 내림차순 유지) ─
  const groupedBySection = useMemo(() => {
    const map = new Map<ProposalSectionKey, AssetMatch[]>()
    for (const m of matches) {
      const arr = map.get(m.section) ?? []
      arr.push(m)
      map.set(m.section, arr)
    }
    // 각 그룹 내 점수 내림차순
    for (const arr of map.values()) {
      arr.sort((a, b) => b.matchScore - a.matchScore)
    }
    return map
  }, [matches])

  // ─ 카운트: 고유 자산 N개 (섹션마다 중복 가능한 자산을 ID 로 유니크화) ─
  const uniqueAssetIds = useMemo(() => {
    const set = new Set<string>()
    for (const m of matches) set.add(m.asset.id)
    return set
  }, [matches])

  const acceptedVisibleCount = useMemo(() => {
    let n = 0
    for (const id of uniqueAssetIds) if (acceptedIds.has(id)) n += 1
    return n
  }, [acceptedIds, uniqueAssetIds])

  // ─ 토글 핸들러 (낙관 업데이트 + 실패 롤백) ─
  const handleToggle = async (assetId: string, nextAccepted: boolean) => {
    if (pending.has(assetId)) return

    // 이전 상태 스냅샷 (롤백용)
    const prevAccepted = new Set(acceptedIds)

    // 낙관 업데이트
    setAcceptedIds((prev) => {
      const next = new Set(prev)
      if (nextAccepted) next.add(assetId)
      else next.delete(assetId)
      return next
    })
    setPending((prev) => {
      const next = new Set(prev)
      next.add(assetId)
      return next
    })

    try {
      const res = await fetch(`/api/projects/${projectId}/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId, accepted: nextAccepted }),
      })
      if (!res.ok) {
        const data: unknown = await res.json().catch(() => ({}))
        const msg =
          typeof data === 'object' && data !== null && 'error' in data
            ? String((data as { error?: unknown }).error ?? '저장 실패')
            : '저장 실패'
        throw new Error(msg)
      }
      const data = (await res.json()) as { acceptedAssetIds: string[] }
      // 서버 최종 상태로 동기화 (동시 편집 안전)
      setAcceptedIds(new Set(data.acceptedAssetIds))
    } catch (err: unknown) {
      // 롤백
      setAcceptedIds(prevAccepted)
      const msg = err instanceof Error ? err.message : '알 수 없는 오류'
      toast.error(`자산 상태 변경 실패 — ${msg}`)
    } finally {
      setPending((prev) => {
        const next = new Set(prev)
        next.delete(assetId)
        return next
      })
    }
  }

  // ─ 빈 상태 ─
  if (matches.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex min-h-[140px] flex-col items-center justify-center gap-2 py-6 text-center">
          <Package className="h-7 w-7 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">
            아직 매칭된 자산이 없습니다.
          </p>
          <p className="text-xs text-muted-foreground">
            RFP 를 먼저 파싱해주세요. 파싱이 끝나면 이 프로젝트에 적합한 언더독스 자산이
            자동으로 올라옵니다.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            이 RFP 에 매칭된 UD 자산 {uniqueAssetIds.size}개
          </span>
          <Badge variant="outline" className="shrink-0 font-mono text-[11px]">
            승인 {acceptedVisibleCount}/{uniqueAssetIds.size}
          </Badge>
        </CardTitle>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
          섹션별 적합도 순. &lsquo;제안서에 포함&rsquo; 토글은 Step 6 제안서 AI 가 해당 자산의
          narrativeSnippet 을 섹션 프롬프트에 주입하도록 지시합니다.
        </p>
      </CardHeader>

      <CardContent className="space-y-4 pt-2">
        {SECTION_ORDER.map((section) => {
          const items = groupedBySection.get(section)
          if (!items || items.length === 0) return null
          return (
            <SectionGroup
              key={section}
              section={section}
              items={items}
              acceptedIds={acceptedIds}
              pending={pending}
              onToggle={handleToggle}
            />
          )
        })}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────
// SectionGroup — 섹션 단위 그룹 (Wave H4: 부모-자식 계층 렌더)
// ─────────────────────────────────────────

interface SectionGroupProps {
  section: ProposalSectionKey
  items: AssetMatch[]
  acceptedIds: Set<string>
  pending: Set<string>
  onToggle: (assetId: string, nextAccepted: boolean) => void
}

/**
 * Wave H4: 같은 section 안에서 부모 매칭과 자식 매칭을 하나의 블록으로 묶는다.
 *
 * 규칙:
 *  - `asset.parentId` 가 있고, 같은 section 안에 그 parentId 를 가진 부모 매칭이 있으면
 *    자식으로 그루핑.
 *  - 부모가 같은 section 에 없는 자식은 고아 자식 → 독립 카드로 상단 노출.
 *  - 부모 순서는 기존 점수 내림차순 유지. 부모 안에서 자식은 점수 내림차순.
 */
interface ParentBlock {
  parent: AssetMatch
  children: AssetMatch[]
}
function groupBySection(items: AssetMatch[]): {
  parentBlocks: ParentBlock[]
  orphanChildren: AssetMatch[]
} {
  // 1 차 순회: 부모 후보 map 구축 (asset.parentId 가 없는 매칭들)
  const parentById = new Map<string, ParentBlock>()
  const orphanChildren: AssetMatch[] = []

  for (const m of items) {
    if (!m.asset.parentId) {
      parentById.set(m.asset.id, { parent: m, children: [] })
    }
  }

  // 2 차 순회: 자식 할당
  for (const m of items) {
    if (m.asset.parentId) {
      const block = parentById.get(m.asset.parentId)
      if (block) {
        block.children.push(m)
      } else {
        orphanChildren.push(m)
      }
    }
  }

  // 부모 블록 순서: 입력 순서(점수 내림차순) 유지.
  // 자식 정렬도 점수 내림차순으로 재정렬 (안전망).
  const parentBlocks: ParentBlock[] = []
  for (const m of items) {
    if (!m.asset.parentId) {
      const block = parentById.get(m.asset.id)
      if (block) {
        block.children.sort((a, b) => b.matchScore - a.matchScore)
        parentBlocks.push(block)
      }
    }
  }

  return { parentBlocks, orphanChildren }
}

function SectionGroup({
  section,
  items,
  acceptedIds,
  pending,
  onToggle,
}: SectionGroupProps) {
  const { parentBlocks, orphanChildren } = useMemo(
    () => groupBySection(items),
    [items],
  )

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/80">
          {SECTION_LABELS[section]}
        </h4>
        <span className="text-[10px] text-muted-foreground">
          · {items.length}개 매칭
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {parentBlocks.map((block) => (
          <AssetBlock
            key={`${block.parent.asset.id}__${block.parent.section}`}
            block={block}
            acceptedIds={acceptedIds}
            pending={pending}
            onToggle={onToggle}
          />
        ))}
        {/* 고아 자식 (같은 section 에 부모 매칭이 없음) → 독립 카드 */}
        {orphanChildren.map((m) => (
          <AssetCard
            key={`${m.asset.id}__${m.section}`}
            match={m}
            accepted={acceptedIds.has(m.asset.id)}
            disabled={pending.has(m.asset.id)}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// AssetBlock — 부모 자산 + children 묶음 (Wave H4)
// ─────────────────────────────────────────

interface AssetBlockProps {
  block: ParentBlock
  acceptedIds: Set<string>
  pending: Set<string>
  onToggle: (assetId: string, nextAccepted: boolean) => void
}

function AssetBlock({ block, acceptedIds, pending, onToggle }: AssetBlockProps) {
  const { parent, children } = block
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="space-y-1.5">
      <AssetCard
        match={parent}
        accepted={acceptedIds.has(parent.asset.id)}
        disabled={pending.has(parent.asset.id)}
        onToggle={onToggle}
      />
      {children.length > 0 && (
        <div className="ml-5 space-y-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            세부 세션 {children.length}개 {expanded ? '접기' : '보기'}
          </Button>
          {expanded && (
            <div className="space-y-2 border-l-2 border-dashed border-border/70 pl-3">
              {children.map((childMatch) => (
                <AssetCard
                  key={`${childMatch.asset.id}__${childMatch.section}`}
                  match={childMatch}
                  accepted={acceptedIds.has(childMatch.asset.id)}
                  disabled={pending.has(childMatch.asset.id)}
                  onToggle={onToggle}
                  isChild
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────
// AssetCard — 자산 단건 카드
// ─────────────────────────────────────────

interface AssetCardProps {
  match: AssetMatch
  accepted: boolean
  disabled: boolean
  onToggle: (assetId: string, nextAccepted: boolean) => void
  /** Wave H4: 계층 렌더 시 자식 카드 — 옅은 배경 + 약간 작은 padding */
  isChild?: boolean
}

function AssetCard({ match, accepted, disabled, onToggle, isChild = false }: AssetCardProps) {
  const [expanded, setExpanded] = useState(false)

  const { asset, matchScore, matchReasons } = match
  const band = matchScoreBand(matchScore)
  const percent = Math.round(matchScore * 100)

  const stage = VALUE_CHAIN_STAGES[asset.valueChainStage]
  const evidence = EVIDENCE_LABELS[asset.evidenceType]

  // 점수 색 — band 별
  const scoreClass =
    band === 'strong'
      ? 'bg-green-100 text-green-800 border-green-300'
      : band === 'medium'
        ? 'bg-orange-100 text-orange-800 border-orange-300'
        : 'bg-gray-100 text-gray-700 border-gray-300'

  return (
    <div
      className={cn(
        'rounded-md border p-3 transition-colors',
        isChild ? 'bg-muted/40 p-2.5' : '',
        accepted
          ? 'border-primary/50 bg-primary/[0.03]'
          : 'border-border bg-background hover:border-border/80',
      )}
    >
      {/* 상단: 자산명 + 카테고리 + 점수 */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-semibold leading-tight">{asset.name}</p>
            <Badge variant="secondary" className="text-[10px]">
              {CATEGORY_LABELS[asset.category]}
            </Badge>
          </div>
        </div>
        <div
          className={cn(
            'shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-mono font-semibold',
            scoreClass,
          )}
          title={`매칭 점수 ${matchScore.toFixed(2)} (${band})`}
        >
          {percent}%
        </div>
      </div>

      {/* 뱃지 라인: Value Chain 단계 + 증거 유형 */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium"
          style={{
            borderColor: stage.colorHex,
            color: stage.colorHex,
            backgroundColor: `${stage.colorHex}12`, // very light tint
          }}
          title={stage.description}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: stage.colorHex }}
          />
          {stage.numberedLabel}
        </span>
        <Badge variant="outline" className="gap-1 text-[10px]">
          <span aria-hidden>{evidence.icon}</span>
          {evidence.label}
        </Badge>
        {asset.keyNumbers && asset.keyNumbers.length > 0 && (
          <span className="text-[10px] text-muted-foreground">
            · 핵심 수치 {asset.keyNumbers.join(' · ')}
          </span>
        )}
      </div>

      {/* matchReasons — 최대 3개 */}
      {matchReasons.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {matchReasons.slice(0, 3).map((r, i) => (
            <li
              key={i}
              className="flex gap-1.5 text-[11px] leading-relaxed text-muted-foreground"
            >
              <span className="mt-0.5 shrink-0 text-primary">•</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}

      {/* narrativeSnippet 프리뷰 (접힘 / 확장) */}
      {asset.narrativeSnippet && (
        <div className="mt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? '초안 접기' : '초안 보기'}
          </Button>
          {expanded && (
            <div className="mt-1 rounded-md border border-dashed bg-muted/30 p-2">
              <p className="text-[11px] leading-relaxed text-foreground/80">
                {asset.narrativeSnippet}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                ※ Step 6 제안서 AI 가 섹션 맥락에 맞게 재작성합니다 (PM 편집 가능).
              </p>
            </div>
          )}
        </div>
      )}

      {/* 하단: 토글 스위치 */}
      <div className="mt-3 flex items-center justify-end gap-2 border-t pt-2">
        <label
          htmlFor={`toggle-${asset.id}-${match.section}`}
          className={cn(
            'flex cursor-pointer items-center gap-2 text-xs font-medium',
            accepted ? 'text-primary' : 'text-muted-foreground',
            disabled && 'cursor-wait opacity-60',
          )}
        >
          {accepted && <CheckCircle2 className="h-3.5 w-3.5" />}
          <span>{accepted ? '제안서에 포함' : '제안서에 포함'}</span>
        </label>
        <Switch
          id={`toggle-${asset.id}-${match.section}`}
          checked={accepted}
          disabled={disabled}
          onCheckedChange={(next) => onToggle(asset.id, next)}
          aria-label={`${asset.name} 을(를) 제안서에 포함`}
          size="sm"
        />
      </div>
    </div>
  )
}
