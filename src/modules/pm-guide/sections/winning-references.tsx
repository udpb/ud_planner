import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trophy } from 'lucide-react'
import type { WinningPatternRecord } from '@/lib/winning-patterns'

interface WinningReferencesCardProps {
  patterns: WinningPatternRecord[]
}

export function WinningReferencesCard({ patterns }: WinningReferencesCardProps) {
  // empty state
  if (patterns.length === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-base font-semibold">
            <Trophy className="h-4 w-4 text-primary" />
            당선 레퍼런스
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground">
            아직 수집된 당선 패턴이 없습니다. /ingest 에서 수주 제안서를 업로드하세요.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-base font-semibold">
          <Trophy className="h-4 w-4 text-primary" />
          당선 레퍼런스
          <Badge variant="outline" className="ml-auto text-[10px]">
            {patterns.length}건
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5 pt-0">
        {patterns.map((p) => (
          <div
            key={p.id}
            className="rounded-md border bg-background p-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium leading-tight">
                {p.sourceProject}
              </p>
              {p.techEvalScore != null && (
                <Badge className="shrink-0 bg-primary text-[10px] text-primary-foreground">
                  {p.techEvalScore}점
                </Badge>
              )}
            </div>
            {p.sourceClient && (
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {p.sourceClient}
              </p>
            )}
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-3">
              {p.snippet}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-primary/80">
              {p.whyItWorks}
            </p>
            {p.tags.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {p.tags.slice(0, 4).map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
