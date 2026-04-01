'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { RfpParser } from './rfp-parser'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, FileText } from 'lucide-react'

interface Props {
  projectId: string
  initialParsed: any
}

export function StepRfp({ projectId, initialParsed }: Props) {
  const [parsed, setParsed] = useState<any>(initialParsed)
  const router = useRouter()
  const pathname = usePathname()

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Left: parser */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          RFP 업로드 &amp; 파싱
        </p>
        <RfpParser
          projectId={projectId}
          initialParsed={parsed}
          onParsed={(p) => setParsed(p)}
        />
      </div>

      {/* Right: result */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          파싱 결과
        </p>

        {!parsed ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed text-sm text-muted-foreground">
            <FileText className="h-8 w-8 opacity-30" />
            <p>RFP를 파싱하면 여기에 결과가 표시됩니다</p>
          </div>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-4 p-4">
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">요약</p>
                  <p className="text-sm leading-relaxed">{parsed.summary}</p>
                </div>

                {parsed.targetStage?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {parsed.targetStage.map((s: string) => (
                      <Badge key={s} variant="secondary" className="text-xs">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}

                {parsed.objectives?.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs text-muted-foreground">목표</p>
                    <ul className="space-y-1">
                      {parsed.objectives.map((o: string, i: number) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <span className="mt-0.5 shrink-0 text-primary">·</span>
                          {o}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {parsed.evalCriteria?.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs text-muted-foreground">평가항목</p>
                    <div className="space-y-1">
                      {parsed.evalCriteria.map((c: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span>{c.item}</span>
                          <span className="font-mono font-medium text-primary">{c.score}점</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: '예산(VAT포함)', value: parsed.totalBudgetVat ? `${(parsed.totalBudgetVat / 1e8).toFixed(2)}억` : '—' },
                    { label: '참여인원', value: parsed.targetCount ? `${parsed.targetCount}명` : '—' },
                    { label: '평가항목', value: `${parsed.evalCriteria?.length ?? 0}개` },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-md bg-muted p-2 text-center">
                      <p className="text-[11px] text-muted-foreground">{stat.label}</p>
                      <p className="mt-0.5 text-sm font-bold">{stat.value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Button
              className="w-full gap-2"
              onClick={() => router.push(`${pathname}?step=impact`)}
            >
              임팩트 설계로 이동
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
