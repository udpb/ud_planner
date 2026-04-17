'use client'

/**
 * ReviewClient — 좌: 아이템 목록, 우: 상세 패널 + 편집/승인/거부 액션
 *
 * Phase D1: Admin 승인 UI 클라이언트 컴포넌트.
 * 자동 승인 절대 금지 (ADR-003).
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  CheckCircle2,
  Edit3,
  Inbox,
  Loader2,
  XCircle,
} from 'lucide-react'
import type { ReviewItemData } from '../page'

// ─────────────────────────────────────────
// 섹션 키 한글 레이블
// ─────────────────────────────────────────

const SECTION_KEY_LABELS: Record<string, string> = {
  'proposal-background': '제안 배경',
  'org-team': '추진 전략/방법론',
  curriculum: '교육 커리큘럼',
  coaches: '코치/인력',
  budget: '예산',
  impact: '성과/임팩트',
  other: '기타',
}

const OUTCOME_LABELS: Record<string, string> = {
  won: '수주',
  lost: '탈락',
  pending: '미정',
}

// ─────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────

interface ReviewClientProps {
  items: ReviewItemData[]
}

export function ReviewClient({ items }: ReviewClientProps) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<string | null>(
    items.length > 0 ? items[0].id : null,
  )
  const [submitting, setSubmitting] = useState(false)

  // 편집 모드 상태
  const [editMode, setEditMode] = useState(false)
  const [editSnippet, setEditSnippet] = useState('')
  const [editWhyItWorks, setEditWhyItWorks] = useState('')
  const [editTags, setEditTags] = useState('')
  const [rejectNotes, setRejectNotes] = useState('')

  const selectedItem = items.find((i) => i.id === selectedId) ?? null

  function onSelectItem(id: string) {
    setSelectedId(id)
    setEditMode(false)
    setRejectNotes('')
    const item = items.find((i) => i.id === id)
    if (item) {
      setEditSnippet(item.snippet)
      setEditWhyItWorks(item.whyItWorks)
      setEditTags(item.tags.join(', '))
    }
  }

  function enterEditMode() {
    if (!selectedItem) return
    setEditMode(true)
    setEditSnippet(selectedItem.snippet)
    setEditWhyItWorks(selectedItem.whyItWorks)
    setEditTags(selectedItem.tags.join(', '))
  }

  async function handleAction(action: 'approve' | 'edit' | 'reject') {
    if (!selectedItem) return
    setSubmitting(true)

    try {
      const reqBody: Record<string, unknown> = {
        extractedItemId: selectedItem.id,
        action,
      }

      if (action === 'edit') {
        reqBody['payload'] = {
          snippet: editSnippet.trim(),
          whyItWorks: editWhyItWorks.trim(),
          tags: editTags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        }
      }
      if (action === 'reject') {
        reqBody['notes'] = rejectNotes.trim()
      }

      const res = await fetch(
        `/api/ingest/jobs/${selectedItem.jobId}/review`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reqBody),
        },
      )
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error ?? '처리 실패')
      }

      const actionLabel =
        action === 'approve'
          ? '승인되었습니다'
          : action === 'edit'
            ? '편집 후 승인되었습니다'
            : '거부되었습니다'
      toast.success(`패턴이 ${actionLabel}.`)

      // 다음 아이템으로 이동 또는 초기화
      setEditMode(false)
      setRejectNotes('')
      router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : '처리 실패'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  // ── 빈 상태 ──
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
        <Inbox className="h-10 w-10 opacity-60" />
        <p className="text-sm font-medium">검토 대기 중인 항목이 없습니다.</p>
        <p className="text-xs">
          /ingest 에서 제안서 PDF 를 업로드하고 처리를 실행하면 여기에 표시됩니다.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
      {/* 좌: 아이템 목록 */}
      <Card className="max-h-[calc(100vh-220px)] overflow-y-auto">
        <CardHeader className="sticky top-0 z-10 bg-card pb-3">
          <CardTitle className="text-sm font-medium">
            검토 대기 ({items.length}건)
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <ul className="divide-y">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelectItem(item.id)}
                  className={`w-full px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                    selectedId === item.id
                      ? 'bg-primary/5 border-l-2 border-primary'
                      : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {SECTION_KEY_LABELS[item.sectionKey] ?? item.sectionKey}
                    </Badge>
                    <Badge
                      variant={
                        item.outcome === 'won'
                          ? 'default'
                          : item.outcome === 'lost'
                            ? 'destructive'
                            : 'secondary'
                      }
                      className="text-[10px]"
                    >
                      {OUTCOME_LABELS[item.outcome] ?? item.outcome}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-sm font-medium">
                    {item.sourceProject || '(제목 없음)'}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {item.snippet.slice(0, 80)}...
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    신뢰도: {(item.confidence * 100).toFixed(0)}%
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* 우: 상세 패널 */}
      {selectedItem ? (
        <Card className="max-h-[calc(100vh-220px)] overflow-y-auto">
          <CardHeader>
            <CardTitle className="text-base">
              {selectedItem.sourceProject} --{' '}
              {SECTION_KEY_LABELS[selectedItem.sectionKey] ?? selectedItem.sectionKey}
            </CardTitle>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="outline">
                {OUTCOME_LABELS[selectedItem.outcome] ?? selectedItem.outcome}
              </Badge>
              {selectedItem.sourceClient && (
                <Badge variant="secondary">{selectedItem.sourceClient}</Badge>
              )}
              {selectedItem.techEvalScore !== null && (
                <Badge variant="secondary">
                  총점: {selectedItem.techEvalScore}
                </Badge>
              )}
              <Badge variant="secondary">
                신뢰도: {(selectedItem.confidence * 100).toFixed(0)}%
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* 원문 heading */}
            {selectedItem.heading && (
              <div>
                <Label className="text-xs text-muted-foreground">
                  원본 섹션 제목
                </Label>
                <p className="mt-1 text-sm">{selectedItem.heading}</p>
              </div>
            )}

            {/* snippet */}
            <div>
              <Label className="text-xs text-muted-foreground">
                핵심 스니펫 (AI 추출)
              </Label>
              {editMode ? (
                <Textarea
                  value={editSnippet}
                  onChange={(e) => setEditSnippet(e.target.value)}
                  className="mt-1"
                  rows={4}
                />
              ) : (
                <p className="mt-1 whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-sm">
                  {selectedItem.snippet}
                </p>
              )}
            </div>

            {/* whyItWorks */}
            <div>
              <Label className="text-xs text-muted-foreground">
                왜 먹혔는가 (AI 추측)
              </Label>
              {editMode ? (
                <Textarea
                  value={editWhyItWorks}
                  onChange={(e) => setEditWhyItWorks(e.target.value)}
                  className="mt-1"
                  rows={3}
                />
              ) : (
                <p className="mt-1 whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-sm">
                  {selectedItem.whyItWorks}
                </p>
              )}
            </div>

            {/* tags */}
            <div>
              <Label className="text-xs text-muted-foreground">태그</Label>
              {editMode ? (
                <Input
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  className="mt-1"
                  placeholder="쉼표로 구분: B2G, 청년창업, 정량KPI"
                />
              ) : (
                <div className="mt-1 flex flex-wrap gap-1">
                  {selectedItem.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                  {selectedItem.tags.length === 0 && (
                    <span className="text-xs text-muted-foreground">
                      (태그 없음)
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* 거부 사유 입력 (항상 표시) */}
            <div>
              <Label className="text-xs text-muted-foreground">
                거부 사유 / 메모 (선택)
              </Label>
              <Input
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                className="mt-1"
                placeholder="거부 시 사유를 입력하세요"
              />
            </div>

            {/* 액션 버튼 */}
            <div className="flex flex-wrap gap-2 border-t pt-4">
              {editMode ? (
                <>
                  <Button
                    onClick={() => handleAction('edit')}
                    disabled={submitting}
                    className="gap-1.5"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    편집 후 승인
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setEditMode(false)}
                    disabled={submitting}
                  >
                    편집 취소
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    onClick={() => handleAction('approve')}
                    disabled={submitting}
                    className="gap-1.5"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    승인 (그대로)
                  </Button>
                  <Button
                    variant="outline"
                    onClick={enterEditMode}
                    disabled={submitting}
                    className="gap-1.5"
                  >
                    <Edit3 className="h-4 w-4" />
                    편집 후 승인
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleAction('reject')}
                    disabled={submitting}
                    className="gap-1.5"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    거부
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="flex items-center justify-center py-16">
          <p className="text-sm text-muted-foreground">
            왼쪽에서 항목을 선택하세요.
          </p>
        </Card>
      )}
    </div>
  )
}
