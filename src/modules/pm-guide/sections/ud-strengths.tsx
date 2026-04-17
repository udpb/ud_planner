import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Sparkles } from 'lucide-react'

interface UdStrengthsCardProps {
  tips: string[]
}

export function UdStrengthsCard({ tips }: UdStrengthsCardProps) {
  if (tips.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-base font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          UD 강점 팁
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="space-y-1.5">
          {tips.map((tip, i) => (
            <li
              key={i}
              className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground"
            >
              <span className="mt-0.5 shrink-0 text-primary">·</span>
              {tip}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
