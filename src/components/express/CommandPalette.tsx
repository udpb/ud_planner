'use client'

/**
 * CommandPalette — Wave U / U2 (2026-05-19)
 *
 * Cmd+K / Ctrl+K 로 호출되는 명령 팔레트. 검색 가능한 모든 보조 액션 + 점프 명령.
 *
 * NowBar 의 "More ▾" 버튼을 클릭해도 동일 팔레트가 열림 (완화책 — Cmd+K 모르는 PM
 * 도 1 클릭 도달).
 *
 * 명령 카테고리:
 *   1. 산출물: 정밀 기획 (Deep) · 검수 · 임팩트 리포트 · 마크다운 · 엑셀 · 발주처 템플릿
 *   2. 점프: 챗봇 · AI 진단 · 채널·전략 · 발주처 문서 · 검수 카드
 *   3. RFP: 업로드 (RFP 없을 때만)
 *
 * 키보드: Cmd+K (mac) / Ctrl+K (win) — 전역. Enter 로 실행. Esc 로 닫기.
 */

import { useEffect } from 'react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import {
  Settings2,
  Search,
  BarChart3,
  FileText,
  FileSpreadsheet,
  ClipboardList,
  MessageSquare,
  Sparkles,
  CheckCircle2,
  Upload,
  Building2,
  Presentation,
} from 'lucide-react'
import { useRouter } from 'next/navigation'

export interface CommandPaletteHandlers {
  projectId: string
  hasRfp: boolean
  progress: number
  isCompleted: boolean
  submitting: boolean
  handingOff: boolean
  onUploadRfp: () => void
  onRunDiagnosis: () => void
  onJumpToChannel: () => void
  onJumpToClientDoc: () => void
  onJumpToChat: () => void
  onSubmitDraft: () => void
  onRunInspector: () => void
  onScrollToInspector: () => void
  onHandoffDeep: (step: string) => void
}

interface Props extends CommandPaletteHandlers {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette(p: Props) {
  const router = useRouter()

  // 전역 Cmd+K / Ctrl+K — 토글
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        p.onOpenChange(!p.open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [p])

  // 실행 헬퍼 — 액션 후 자동 닫기
  function run(fn: () => void) {
    return () => {
      p.onOpenChange(false)
      // 다음 tick — DOM/state 안정화 후 실행
      setTimeout(fn, 50)
    }
  }

  function navigateTo(href: string) {
    return () => {
      p.onOpenChange(false)
      router.push(href)
    }
  }

  function downloadFile(href: string) {
    return () => {
      p.onOpenChange(false)
      const a = document.createElement('a')
      a.href = href
      a.download = ''
      a.click()
    }
  }

  return (
    <CommandDialog
      open={p.open}
      onOpenChange={p.onOpenChange}
      title="명령 팔레트"
      description="Cmd+K — 산출물·점프·인계 명령"
    >
      <CommandInput placeholder="명령 검색 — 예: 검수 · 마크다운 · 챗봇" />
      <CommandList>
        <CommandEmpty>일치하는 명령 없음 — 다른 키워드 시도</CommandEmpty>

        {!p.hasRfp && (
          <>
            <CommandGroup heading="시작">
              <CommandItem onSelect={run(p.onUploadRfp)}>
                <Upload className="mr-2 h-4 w-4" />
                RFP 업로드
                <CommandShortcut>필수</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="산출물">
          <CommandItem
            onSelect={run(p.onSubmitDraft)}
            disabled={p.isCompleted || p.submitting || p.progress < 50}
          >
            <CheckCircle2 className="mr-2 h-4 w-4 text-[color:var(--green)]" />
            1차본 승인 + 검수 + 임팩트 forecast
            {p.progress < 50 && <CommandShortcut>50%+ 필요</CommandShortcut>}
          </CommandItem>
          <CommandItem
            onSelect={run(p.onRunInspector)}
            disabled={p.progress < 50}
          >
            <Search className="mr-2 h-4 w-4" />
            평가위원 검수 실행
            {p.progress < 50 && <CommandShortcut>50%+ 필요</CommandShortcut>}
          </CommandItem>
          <CommandItem
            onSelect={() => p.onHandoffDeep('rfp')}
            disabled={p.handingOff || p.submitting}
          >
            <Settings2 className="mr-2 h-4 w-4" />
            정밀 기획 (Deep) 으로 인계
          </CommandItem>
          <CommandItem
            onSelect={navigateTo(`/projects/${p.projectId}?stage=sroi`)}
          >
            <BarChart3 className="mr-2 h-4 w-4 text-[color:var(--cyan)]" />
            임팩트 리포트 (SROI forecast)
          </CommandItem>
          <CommandItem
            onSelect={downloadFile(`/api/express/export-pptx?projectId=${p.projectId}`)}
          >
            <Presentation className="mr-2 h-4 w-4 text-[color:var(--primary-orange)]" />
            PPT 다운로드 (.pptx — 편집 가능)
          </CommandItem>
          <CommandItem
            onSelect={downloadFile(`/api/projects/${p.projectId}/export-markdown`)}
          >
            <FileText className="mr-2 h-4 w-4" />
            마크다운 다운로드
          </CommandItem>
          <CommandItem
            onSelect={downloadFile(`/api/projects/${p.projectId}/export-excel`)}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            내부 엑셀 다운로드 (5 시트)
          </CommandItem>
          <CommandItem
            onSelect={downloadFile(
              `/api/projects/${p.projectId}/export-budget-template`,
            )}
          >
            <ClipboardList className="mr-2 h-4 w-4" />
            발주처 템플릿 다운로드
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="점프">
          <CommandItem onSelect={run(p.onJumpToChat)}>
            <MessageSquare className="mr-2 h-4 w-4" />
            챗봇 입력으로
          </CommandItem>
          <CommandItem onSelect={run(p.onRunDiagnosis)}>
            <Sparkles className="mr-2 h-4 w-4 text-[color:var(--primary-orange)]" />
            AI 자동 진단 탭
          </CommandItem>
          <CommandItem onSelect={run(p.onJumpToChannel)}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            채널·전략 탭
          </CommandItem>
          <CommandItem onSelect={run(p.onJumpToClientDoc)}>
            <Building2 className="mr-2 h-4 w-4" />
            발주처 문서 탭
          </CommandItem>
          <CommandItem onSelect={run(p.onScrollToInspector)}>
            <Search className="mr-2 h-4 w-4" />
            검수 카드로 이동
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
