'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, Copy, Check, ChevronDown, ChevronUp,
  Search, Trash2, ExternalLink, FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface ResearchPrompt {
  id: string
  category: string
  title: string
  description: string
  prompt: string
  usedIn: string[]
}

interface ExternalResearch {
  promptId: string
  category: string
  content: string
  source?: string
  attachedAt: string
}

interface Props {
  projectId: string
  /** 리서치가 업데이트되면 부모에게 알려줌 */
  onResearchUpdate?: (research: ExternalResearch[]) => void
}

const CATEGORY_LABELS: Record<string, string> = {
  policy: '정책/제도',
  market: '시장/트렌드',
  benchmark: '타 기관 사례',
  audience: '대상자 인사이트',
  operation: '운영 노하우',
}
const CATEGORY_COLORS: Record<string, string> = {
  policy: 'bg-red-50 text-red-700 border-red-200',
  market: 'bg-blue-50 text-blue-700 border-blue-200',
  benchmark: 'bg-green-50 text-green-700 border-green-200',
  audience: 'bg-purple-50 text-purple-700 border-purple-200',
  operation: 'bg-amber-50 text-amber-700 border-amber-200',
}

export function ResearchPanel({ projectId, onResearchUpdate }: Props) {
  const [prompts, setPrompts] = useState<ResearchPrompt[]>([])
  const [saved, setSaved] = useState<ExternalResearch[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [activePrompt, setActivePrompt] = useState<string | null>(null)
  const [pasteContent, setPasteContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const fetchResearch = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/research`)
      if (!res.ok) throw new Error('로드 실패')
      const data = await res.json()
      setPrompts(data.prompts ?? [])
      setSaved(data.savedResearch ?? [])
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchResearch() }, [fetchResearch])

  const copyPrompt = async (prompt: ResearchPrompt) => {
    await navigator.clipboard.writeText(prompt.prompt)
    setCopiedId(prompt.id)
    toast.success(`"${prompt.title}" 프롬프트가 복사되었습니다. 외부 LLM에 붙여넣기 하세요.`)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const saveResearch = async (promptId: string, category: string) => {
    if (!pasteContent.trim()) {
      toast.error('조사 결과를 붙여넣어 주세요')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptId, category, content: pasteContent }),
      })
      if (!res.ok) throw new Error('저장 실패')
      const data = await res.json()
      setSaved(data.research)
      onResearchUpdate?.(data.research)
      setPasteContent('')
      setActivePrompt(null)
      toast.success('리서치 저장 완료 — 이후 생성에 자동 반영됩니다')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const deleteResearch = async (promptId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/research`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptId }),
      })
      if (!res.ok) throw new Error('삭제 실패')
      const data = await res.json()
      setSaved(data.research)
      onResearchUpdate?.(data.research)
      toast.success('삭제 완료')
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const completedCount = saved.length
  const totalCount = prompts.length

  return (
    <div className="rounded-lg border border-cyan-200 bg-cyan-50/20">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-3 text-left hover:bg-cyan-50/40 transition-colors rounded-t-lg"
      >
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-cyan-700" />
          <span className="text-sm font-semibold text-cyan-900">외부 리서치 수집</span>
          <Badge variant="outline" className="text-[10px] border-cyan-300 text-cyan-700">
            {completedCount}/{totalCount}
          </Badge>
          {completedCount > 0 && completedCount === totalCount && (
            <Badge className="text-[10px] bg-green-100 text-green-700 border-green-300">완료</Badge>
          )}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-cyan-600" /> : <ChevronDown className="h-4 w-4 text-cyan-600" />}
      </button>

      {expanded && (
        <div className="border-t border-cyan-200 p-3 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-4 gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> 프롬프트 생성 중...
            </div>
          ) : prompts.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              RFP 분석을 먼저 완료해 주세요
            </p>
          ) : (
            <>
              <p className="text-[11px] text-cyan-700">
                아래 프롬프트를 Claude/Gemini에 복사 → 조사 결과를 붙여넣기 하면 이후 생성에 자동 반영됩니다.
              </p>

              {prompts.map((p) => {
                const hasSaved = saved.some((s) => s.promptId === p.id)
                const isActive = activePrompt === p.id
                const savedItem = saved.find((s) => s.promptId === p.id)

                return (
                  <div
                    key={p.id}
                    className={cn(
                      'rounded-md border p-2.5 transition-all',
                      hasSaved
                        ? 'border-green-200 bg-green-50/50'
                        : 'border-cyan-100 bg-white/60',
                    )}
                  >
                    {/* Prompt header */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge
                          variant="outline"
                          className={cn('text-[9px] shrink-0', CATEGORY_COLORS[p.category])}
                        >
                          {CATEGORY_LABELS[p.category] || p.category}
                        </Badge>
                        <span className="text-xs font-medium truncate">{p.title}</span>
                        {hasSaved && <Check className="h-3 w-3 text-green-600 shrink-0" />}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px] gap-1"
                          onClick={() => copyPrompt(p)}
                        >
                          {copiedId === p.id
                            ? <><Check className="h-3 w-3 text-green-600" /> 복사됨</>
                            : <><Copy className="h-3 w-3" /> 복사</>
                          }
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => {
                            if (isActive) { setActivePrompt(null); setPasteContent('') }
                            else { setActivePrompt(p.id); setPasteContent(savedItem?.content ?? '') }
                          }}
                        >
                          {isActive ? '접기' : hasSaved ? '수정' : '결과 입력'}
                        </Button>
                        {hasSaved && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteResearch(p.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>

                    <p className="mt-1 text-[10px] text-muted-foreground">{p.description}</p>

                    {/* Saved content preview */}
                    {hasSaved && !isActive && savedItem && (
                      <div className="mt-1.5 rounded bg-green-50 p-1.5 text-[10px] text-green-800 line-clamp-2">
                        {savedItem.content.slice(0, 150)}...
                      </div>
                    )}

                    {/* Paste area */}
                    {isActive && (
                      <div className="mt-2 space-y-1.5">
                        <Textarea
                          placeholder="외부 LLM에서 받은 조사 결과를 여기에 붙여넣기..."
                          className="h-32 text-xs"
                          value={pasteContent}
                          onChange={(e) => setPasteContent(e.target.value)}
                        />
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground">
                            {pasteContent.length > 0 ? `${pasteContent.length}자` : ''}
                          </span>
                          <Button
                            size="sm"
                            className="h-6 text-[10px] gap-1"
                            disabled={saving || !pasteContent.trim()}
                            onClick={() => saveResearch(p.id, p.category)}
                          >
                            {saving
                              ? <><Loader2 className="h-3 w-3 animate-spin" /> 저장 중</>
                              : <><FileText className="h-3 w-3" /> 저장</>
                            }
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Usage indicator */}
              {completedCount > 0 && (
                <div className="flex items-center gap-1.5 text-[10px] text-green-700 pt-1">
                  <ExternalLink className="h-3 w-3" />
                  {completedCount}개 리서치가 Logic Model · 커리큘럼 · 제안서 생성에 자동 반영됩니다
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
