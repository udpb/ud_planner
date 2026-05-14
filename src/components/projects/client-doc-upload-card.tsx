'use client'

/**
 * ClientDocUploadCard — Express 2.0 (Phase M3-2, ADR-013).
 *
 * 발주처 공식 문서 (홈페이지 소개·중장기 계획·사업보고서·정책자료) 업로드.
 * PDF 또는 텍스트 → AI 가 키워드·정책·실적 자동 추출 → strategicNotes 보강.
 *
 * UX:
 *   - 처음: PDF drop 영역 + "텍스트로 붙여넣기" 토글
 *   - 처리 중: Loader + 진행률
 *   - 완료 시: 3 카테고리 칩 (keywords / policies / track) 표시 + 재업로드
 */

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Library, Loader2, Upload, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { StrategicNotes } from '@/lib/ai/strategic-notes'

interface Props {
  projectId: string
  /** 기존 추출 결과 (server-rendered) */
  current?: StrategicNotes['clientOfficialDoc']
}

export function ClientDocUploadCard({ projectId, current }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [pasteMode, setPasteMode] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteLabel, setPasteLabel] = useState('')
  const [localData, setLocalData] = useState(current)

  const hasData =
    localData &&
    ((localData.keywords?.length ?? 0) > 0 ||
      (localData.policies?.length ?? 0) > 0 ||
      (localData.track?.length ?? 0) > 0)

  async function uploadFile(file: File) {
    if (busy) return
    setBusy(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('sourceLabel', file.name)
    try {
      const r = await fetch(`/api/projects/${projectId}/ingest-client-doc`, {
        method: 'POST',
        body: fd,
      })
      if (!r.ok) {
        const data = await r.json().catch(() => ({}))
        throw new Error(data.error ?? `HTTP ${r.status}`)
      }
      const data = (await r.json()) as { extraction: NonNullable<typeof current> }
      toast.success(
        `추출 완료 — 어휘 ${data.extraction.keywords.length} · 정책 ${data.extraction.policies.length} · 실적 ${data.extraction.track.length}`,
      )
      setLocalData({ ...data.extraction, sourceLabel: file.name, extractedAt: new Date().toISOString() })
      router.refresh()
    } catch (err: unknown) {
      toast.error('추출 실패: ' + (err instanceof Error ? err.message : '알 수 없음'))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function submitPaste() {
    if (busy || pasteText.trim().length < 100) {
      toast.error('100자 이상 붙여넣어 주세요')
      return
    }
    setBusy(true)
    try {
      const r = await fetch(`/api/projects/${projectId}/ingest-client-doc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: pasteText,
          sourceLabel: pasteLabel || '텍스트 붙여넣기',
        }),
      })
      if (!r.ok) {
        const data = await r.json().catch(() => ({}))
        throw new Error(data.error ?? `HTTP ${r.status}`)
      }
      const data = (await r.json()) as { extraction: NonNullable<typeof current> }
      toast.success(
        `추출 완료 — 어휘 ${data.extraction.keywords.length} · 정책 ${data.extraction.policies.length} · 실적 ${data.extraction.track.length}`,
      )
      setLocalData({
        ...data.extraction,
        sourceLabel: pasteLabel || '텍스트 붙여넣기',
        extractedAt: new Date().toISOString(),
      })
      setPasteMode(false)
      setPasteText('')
      setPasteLabel('')
      router.refresh()
    } catch (err: unknown) {
      toast.error('추출 실패: ' + (err instanceof Error ? err.message : '알 수 없음'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <Library className="h-4 w-4 text-primary" />
          발주처 공식 문서
          {hasData && (
            <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">
              추출됨
            </Badge>
          )}
        </CardTitle>
        {hasData && (
          <button
            onClick={() => setPasteMode(false)}
            className="text-[10px] text-muted-foreground hover:text-primary"
            title="새 문서 업로드"
            disabled={busy}
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {!hasData && !pasteMode && (
          <>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              발주처 홈페이지 소개 · 중장기 계획 · 사업보고서 PDF 를 업로드하면
              핵심 키워드 · 정책 · 실적을 자동 추출해 제안서 톤을 발주처에 맞춥니다.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) uploadFile(f)
              }}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="w-full gap-2"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              PDF 업로드
            </Button>
            <button
              type="button"
              onClick={() => setPasteMode(true)}
              className="w-full text-center text-[10px] text-muted-foreground hover:text-primary"
            >
              또는 텍스트로 붙여넣기
            </button>
          </>
        )}

        {pasteMode && !hasData && (
          <div className="space-y-1.5">
            <input
              type="text"
              placeholder="출처 표기 (예: 연세대 중장기 계획서 2026)"
              className="w-full rounded-md border bg-background px-2 py-1 text-xs"
              value={pasteLabel}
              onChange={(e) => setPasteLabel(e.target.value)}
            />
            <Textarea
              placeholder="발주처 공식 문서 본문을 여기에 붙여넣기 (100자 이상)..."
              className="h-32 text-xs"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                {pasteText.length}자
              </span>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px]"
                  onClick={() => {
                    setPasteMode(false)
                    setPasteText('')
                    setPasteLabel('')
                  }}
                  disabled={busy}
                >
                  취소
                </Button>
                <Button
                  size="sm"
                  className="h-6 text-[10px]"
                  onClick={submitPaste}
                  disabled={busy || pasteText.trim().length < 100}
                >
                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : '추출'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {hasData && (
          <>
            <div className="rounded-md border bg-muted/20 p-2 text-[10px]">
              <div className="font-medium">출처</div>
              <div className="mt-0.5 truncate text-muted-foreground">
                {localData!.sourceLabel ?? '(미표기)'}
              </div>
              {localData!.extractedAt && (
                <div className="text-[9px] text-muted-foreground">
                  추출: {localData!.extractedAt.slice(0, 10)}
                </div>
              )}
            </div>

            {(localData!.keywords?.length ?? 0) > 0 && (
              <section>
                <div className="text-[10px] font-medium text-muted-foreground">
                  발주처 어휘 ({localData!.keywords!.length})
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {localData!.keywords!.slice(0, 12).map((k, i) => (
                    <Badge key={i} variant="outline" className="h-4 px-1 text-[10px]">
                      {k}
                    </Badge>
                  ))}
                </div>
              </section>
            )}

            {(localData!.policies?.length ?? 0) > 0 && (
              <section>
                <div className="text-[10px] font-medium text-muted-foreground">
                  정책·법령 ({localData!.policies!.length})
                </div>
                <ul className="mt-1 space-y-0.5 pl-2 text-[10px]">
                  {localData!.policies!.slice(0, 6).map((p, i) => (
                    <li key={i}>· {p}</li>
                  ))}
                </ul>
              </section>
            )}

            {(localData!.track?.length ?? 0) > 0 && (
              <section>
                <div className="text-[10px] font-medium text-muted-foreground">
                  발주처 실적 ({localData!.track!.length})
                </div>
                <ul className="mt-1 space-y-0.5 pl-2 text-[10px]">
                  {localData!.track!.slice(0, 6).map((t, i) => (
                    <li key={i}>· {t}</li>
                  ))}
                </ul>
              </section>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) uploadFile(f)
              }}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="w-full gap-2 text-[10px]"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              새 문서로 갱신
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
