'use client'

/**
 * PM 직접 카드 — 발주처 통화·내부 정보 등 시스템이 모르는 영역
 * (Phase L Wave L2, ADR-011 §5.1 · F4 must/nice 차등 ADR-015 §7)
 *
 * F4 (2026-05-22, Wave V):
 *   - checklistItems 가 string[] (회귀) 또는 ChecklistItem[] (신규 object) 모두 수용
 *   - normalizeChecklistItems 로 통일 → must 빨강 dot 우선, nice 접힘
 *   - 각 항목 hover 시 분류 근거 (reason) 표시
 *   - PM 이 nice 를 클릭으로 must 승격은 차후 (현재는 통화 후 답 입력만 변경)
 */

import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Phone, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'
import {
  normalizeChecklistItems,
  type ChecklistItem,
} from '@/lib/express/conversation'

interface Props {
  topic: string
  /**
   * F4: union 으로 받음 — 회귀 호환 (기존 string[] 캐시) + 신규 분류 object 모두 처리.
   * 내부에서 normalizeChecklistItems 거쳐 통일.
   */
  checklistItems: ChecklistItem[]
  onSubmit: (answer: string) => void
}

export function PmDirectCard({ topic, checklistItems, onSubmit }: Props) {
  const [answer, setAnswer] = useState('')
  const [niceOpen, setNiceOpen] = useState(false)

  // F4: 정규화 + must/nice 분리. 한 번만 계산.
  const { mustItems, niceItems } = useMemo(() => {
    const normalized = normalizeChecklistItems(checklistItems)
    return {
      mustItems: normalized.filter((it) => it.classification === 'must'),
      niceItems: normalized.filter((it) => it.classification === 'nice'),
    }
  }, [checklistItems])

  const totalCount = mustItems.length + niceItems.length

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Phone className="h-4 w-4 text-amber-700" />
          PM 직접 카드 — {topic}
        </div>

        {totalCount > 0 && (
          <div className="space-y-2.5">
            {/* must 섹션 — 빨강 dot + 항상 펼침 */}
            {mustItems.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-red-700">
                  <AlertCircle className="h-3.5 w-3.5" />
                  꼭 물어보세요
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
                    must · {mustItems.length}
                  </span>
                </div>
                <ul className="ml-1 space-y-1 text-xs">
                  {mustItems.map((it, i) => (
                    <li
                      key={`must-${i}`}
                      className="flex items-start gap-2"
                      title={it.reason ?? undefined}
                    >
                      <span className="mt-0.5 flex h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                      <span className="flex-1">{it.item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* nice 섹션 — 접힘 (▾ 여유되면 N개) */}
            {niceItems.length > 0 && (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setNiceOpen((v) => !v)}
                  className="flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-900"
                >
                  {niceOpen ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  여유되면
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
                    nice · {niceItems.length}
                  </span>
                </button>
                {niceOpen && (
                  <ul className="ml-1 space-y-1 text-xs">
                    {niceItems.map((it, i) => (
                      <li
                        key={`nice-${i}`}
                        className="flex items-start gap-2 text-muted-foreground"
                        title={it.reason ?? undefined}
                      >
                        <span className="mt-0.5 flex h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                        <span className="flex-1">{it.item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <div className="text-xs font-medium">확인 결과 입력</div>
          <Textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="확인한 내용을 자유롭게 적어주세요..."
            className="min-h-[80px] text-xs"
          />
          <Button
            size="sm"
            disabled={!answer.trim()}
            onClick={() => {
              onSubmit(answer.trim())
              setAnswer('')
            }}
          >
            결과 제출
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
