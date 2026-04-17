import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle } from 'lucide-react'
import type { CommonMistake } from '../types'

interface CommonMistakesCardProps {
  items: CommonMistake[]
}

export function CommonMistakesCard({ items }: CommonMistakesCardProps) {
  if (items.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-base font-semibold">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          흔한 실수 Top {items.length}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-md border border-amber-100 bg-amber-50/30 p-2.5"
          >
            <p className="text-xs font-medium leading-tight">{item.mistake}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {item.consequence}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-primary/80">
              {item.fix}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
