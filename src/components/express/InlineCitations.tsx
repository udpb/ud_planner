'use client'

/**
 * InlineCitations — Wave U / U3 (2026-05-19)
 *
 * S1: Inline source citation 렌더링.
 *
 * 섹션 본문의 텍스트에 박혀있는 인용 마커를 클릭 가능한 칩으로 변환.
 * AI 시대 평가위원 신뢰도 핵심 — "25,000명 알럼나이" vs
 * "25,000명 알럼나이 [Alumni Hub 2024.12]" 차이.
 *
 * 지원하는 마커 (모두 본문에 inline 으로 박혀있음):
 *   1. [자산 인용: assetId]\n<narrativeSnippet>            — 차별화 자산 토글 시 자동 박힘
 *   2. [근거: source name | YYYY.MM | URL]                  — 외부 evidence (AI 가 inline 박음)
 *   3. [source: source name | YYYY.MM]                      — short variant (URL 없음)
 *   4. [Asset Name | section 1 | 인용 문구]                 — Inspector 카드에서 직접 박힌 자산 (P2)
 *
 * 마커가 아닌 일반 텍스트는 그대로 통과.
 */

import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { ExternalLink, FileSearch } from 'lucide-react'
import type { AssetMatch } from '@/lib/asset-registry-types'

interface AssetCitation {
  kind: 'asset'
  assetId: string
  // 마커 뒤에 붙은 narrativeSnippet (수락된 자산일 때)
  snippet?: string
  // 자산 메타 (matchedAssets 에서 lookup)
  name?: string
  sourceUrl?: string
  updatedAt?: string
  status?: string
}

interface EvidenceCitation {
  kind: 'evidence'
  sourceName: string
  year?: string
  url?: string
}

interface InspectorAssetCitation {
  kind: 'inspector-asset'
  name: string
  snippet: string
}

type ParsedToken =
  | { type: 'text'; text: string }
  | { type: 'citation'; data: AssetCitation | EvidenceCitation | InspectorAssetCitation }

/**
 * 본문 텍스트를 파싱 — citation 마커를 토큰화.
 * 마커 간 텍스트는 'text' 토큰, 마커는 'citation' 토큰.
 */
export function parseInlineCitations(
  text: string,
  matchedAssets: AssetMatch[],
): ParsedToken[] {
  if (!text) return []

  const tokens: ParsedToken[] = []
  // 패턴: 우선순위 순서
  //  A. [자산 인용: assetId]\n<snippet> — snippet 은 다음 빈 줄 또는 다음 마커까지
  //  B. [근거: source | YYYY.MM | URL]
  //  C. [source: source | YYYY.MM]
  //  D. [Asset Name] <snippet>
  //
  // 빠른 구현 — regex global scan, 토큰 절단.
  const ASSET_RE = /\[자산 인용:\s*([a-zA-Z0-9_-]+)\]\n?([^\n][^[]*?)(?=\n\n\[|\n\[자산 인용:|\n\[근거:|\n\[source:|\n\[[A-Z]|$)/g
  const EVIDENCE_RE = /\[(근거|source):\s*([^\]|]+?)(?:\s*\|\s*([^|\]]+?))?(?:\s*\|\s*([^|\]]+?))?\]/g
  // Inspector-injected: \n\n[Asset Name] <snippet>  (Inspector 카드 onInsertAsset 으로 박힌 형태)
  const INSPECTOR_RE = /\n\n\[([^\]]+)\]\s+([\s\S]+?)(?=\n\n\[|\n\[자산 인용:|$)/g

  // 모든 match 를 한 번에 모은 후 시작 위치로 정렬
  type Match = { start: number; end: number; token: ParsedToken }
  const matches: Match[] = []

  for (const m of text.matchAll(ASSET_RE)) {
    const assetId = m[1]
    const snippet = (m[2] ?? '').trim()
    const meta = matchedAssets.find((x) => x.asset.id === assetId)
    matches.push({
      start: m.index!,
      end: m.index! + m[0].length,
      token: {
        type: 'citation',
        data: {
          kind: 'asset',
          assetId,
          snippet,
          name: meta?.asset.name,
          sourceUrl: meta?.asset.sourceReferences?.[0],
          updatedAt: meta?.asset.updatedAt ?? meta?.asset.lastReviewedAt,
          status: meta?.asset.status,
        },
      },
    })
  }
  for (const m of text.matchAll(EVIDENCE_RE)) {
    matches.push({
      start: m.index!,
      end: m.index! + m[0].length,
      token: {
        type: 'citation',
        data: {
          kind: 'evidence',
          sourceName: (m[2] ?? '').trim(),
          year: (m[3] ?? '').trim() || undefined,
          url: (m[4] ?? '').trim() || undefined,
        },
      },
    })
  }
  for (const m of text.matchAll(INSPECTOR_RE)) {
    const name = (m[1] ?? '').trim()
    const snippet = (m[2] ?? '').trim()
    // ASSET_RE 와 중복되지 않도록 — "자산 인용:" 으로 시작하면 skip
    if (name.startsWith('자산 인용')) continue
    matches.push({
      start: m.index!,
      end: m.index! + m[0].length,
      token: {
        type: 'citation',
        data: { kind: 'inspector-asset', name, snippet },
      },
    })
  }

  matches.sort((a, b) => a.start - b.start)

  // 토큰 사이를 일반 텍스트로 채움
  let cursor = 0
  for (const m of matches) {
    if (m.start > cursor) {
      tokens.push({ type: 'text', text: text.slice(cursor, m.start) })
    }
    tokens.push(m.token)
    cursor = m.end
  }
  if (cursor < text.length) {
    tokens.push({ type: 'text', text: text.slice(cursor) })
  }

  // matches 가 0 개면 전체가 text 토큰
  if (matches.length === 0) {
    return [{ type: 'text', text }]
  }

  return tokens
}

/**
 * 섹션 본문을 inline citation 칩과 함께 렌더.
 * 일반 텍스트는 whitespace-pre-wrap, citation 은 hover popover 가능 inline chip.
 */
export function RenderSectionWithCitations({
  text,
  matchedAssets,
  onRemoveAsset,
}: {
  text: string
  matchedAssets: AssetMatch[]
  onRemoveAsset?: (assetId: string) => void
}) {
  const tokens = parseInlineCitations(text, matchedAssets)

  return (
    <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
      {tokens.map((t, i) =>
        t.type === 'text' ? (
          <span key={i}>{t.text}</span>
        ) : (
          <CitationChip
            key={i}
            data={t.data}
            onRemoveAsset={onRemoveAsset}
          />
        ),
      )}
    </div>
  )
}

function CitationChip({
  data,
  onRemoveAsset,
}: {
  data: AssetCitation | EvidenceCitation | InspectorAssetCitation
  onRemoveAsset?: (assetId: string) => void
}) {
  const [open, setOpen] = useState(false)

  if (data.kind === 'asset') {
    const label = data.name ?? data.assetId
    const dateStr = data.updatedAt
      ? new Date(data.updatedAt).toISOString().slice(0, 7).replace('-', '.')
      : undefined
    return (
      <span className="inline-block">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'inline-flex items-center gap-1 align-baseline rounded-full border px-2 py-0.5 text-[11px] font-medium leading-tight',
            'border-[color:var(--primary-orange)]/30 bg-[color:var(--primary-orange)]/10',
            'text-[color:var(--primary-orange)] hover:bg-[color:var(--primary-orange)]/20',
          )}
          title={`자산 인용 — ${label}${dateStr ? ` (${dateStr})` : ''}`}
        >
          <FileSearch className="h-2.5 w-2.5" />
          {label.length > 18 ? label.slice(0, 18) + '…' : label}
          {dateStr && <span className="opacity-70">· {dateStr}</span>}
        </button>
        {data.snippet && (
          <>
            {' '}
            <span className="text-foreground/85">{data.snippet}</span>
          </>
        )}
        {open && (
          <span
            className="block rounded-md border bg-popover p-2 text-[11px] shadow-md"
            style={{ marginTop: 4 }}
          >
            <span className="block font-semibold">{label}</span>
            <span className="block text-muted-foreground">
              asset id: <code className="font-mono">{data.assetId}</code>
              {data.status && <> · {data.status}</>}
              {dateStr && <> · {dateStr}</>}
            </span>
            {data.sourceUrl && (
              <Link
                href={data.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-[color:var(--primary-orange)] hover:underline"
              >
                원본 자료 열기 <ExternalLink className="h-2.5 w-2.5" />
              </Link>
            )}
            {onRemoveAsset && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onRemoveAsset(data.assetId)
                }}
                className="ml-2 mt-1 inline-block text-[10px] text-muted-foreground hover:text-destructive"
              >
                인용 제거
              </button>
            )}
          </span>
        )}
      </span>
    )
  }

  if (data.kind === 'evidence') {
    const label = data.year ? `${data.sourceName} ${data.year}` : data.sourceName
    return (
      <span className="inline-block">
        {data.url ? (
          <Link
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'inline-flex items-center gap-1 align-baseline rounded-full border px-2 py-0.5 text-[11px] font-medium leading-tight',
              'border-[color:var(--cyan)]/30 bg-[color:var(--cyan)]/10',
              'text-[color:var(--cyan)] hover:bg-[color:var(--cyan)]/20',
            )}
            title={`외부 근거 — ${label} (클릭: 원본 열기)`}
          >
            <ExternalLink className="h-2.5 w-2.5" />
            {label}
          </Link>
        ) : (
          <span
            className={cn(
              'inline-flex items-center gap-1 align-baseline rounded-full border px-2 py-0.5 text-[11px] font-medium leading-tight',
              'border-[color:var(--cyan)]/30 bg-[color:var(--cyan)]/10 text-[color:var(--cyan)]',
            )}
            title="외부 근거"
          >
            {label}
          </span>
        )}
      </span>
    )
  }

  // inspector-asset
  return (
    <span className="inline-block">
      <span
        className={cn(
          'inline-flex items-center gap-1 align-baseline rounded-full border px-2 py-0.5 text-[11px] font-medium leading-tight',
          'border-[color:var(--primary-orange)]/30 bg-[color:var(--primary-orange)]/10 text-[color:var(--primary-orange)]',
        )}
        title={`Inspector 추천 자산 — ${data.name}`}
      >
        <FileSearch className="h-2.5 w-2.5" />
        {data.name.length > 22 ? data.name.slice(0, 22) + '…' : data.name}
      </span>
      {data.snippet && (
        <>
          {' '}
          <span className="text-foreground/85">{data.snippet}</span>
        </>
      )}
    </span>
  )
}
