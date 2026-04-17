import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Target } from 'lucide-react'

interface EvaluatorCardProps {
  perspective: string | null
}

export function EvaluatorCard({ perspective }: EvaluatorCardProps) {
  if (!perspective) return null

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-base font-semibold">
          <Target className="h-4 w-4 text-primary" />
          평가위원 관점
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {perspective}
        </p>
      </CardContent>
    </Card>
  )
}
