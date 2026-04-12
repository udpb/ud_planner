/**
 * (lab) Layout
 *
 * 격리된 실험 라우트들의 공통 레이아웃.
 * (dashboard) 레이아웃과 별개로, 사이드바 없이 단순하게.
 */

export default function LabLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="h-screen overflow-hidden flex flex-col">
      <header className="border-b px-6 py-3 bg-amber-50">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
            🧪 LAB
          </span>
          <span className="text-sm text-muted-foreground">
            격리 실험 모드 — 메인 시스템과 분리되어 있음
          </span>
        </div>
      </header>
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  )
}
