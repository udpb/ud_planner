'use client'

import { useParams } from 'next/navigation'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

const SCORE_OPTIONS = [1, 2, 3, 4, 5]
const SCORE_LABEL: Record<number, string> = { 1: '매우 나쁨', 2: '나쁨', 3: '보통', 4: '좋음', 5: '매우 좋음' }

function StarSelect({
  name,
  value,
  onChange,
}: {
  name: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex gap-2">
      {SCORE_OPTIONS.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-bold transition-colors ${
            value === n
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-muted-foreground/30 text-muted-foreground hover:border-primary hover:text-primary'
          }`}
          title={SCORE_LABEL[n]}
        >
          {n}
        </button>
      ))}
      {value > 0 && (
        <span className="ml-2 self-center text-sm text-muted-foreground">{SCORE_LABEL[value]}</span>
      )}
    </div>
  )
}

export default function FeedbackPage() {
  const params = useParams()
  const projectId = params.projectId as string

  const [form, setForm] = useState({
    respondent: '',
    role: '참가자',
    sessionNo: '전체',
    overallScore: 0,
    contentScore: 0,
    coachScore: 0,
    facilitationScore: 0,
    bestPart: '',
    improvement: '',
    wouldRecommend: '예' as '예' | '아니요' | '모르겠음',
    freeText: '',
    projectName: '',
  })

  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.overallScore === 0) { setErrorMsg('전체 만족도를 선택해주세요.'); return }
    setStatus('loading')
    setErrorMsg('')

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, projectId }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? '서버 오류')
      }
      setStatus('done')
    } catch (e: any) {
      setErrorMsg(e.message)
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="py-12">
            <div className="mb-4 text-5xl">🙏</div>
            <h2 className="text-xl font-bold">소중한 피드백 감사합니다!</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              여러분의 의견이 더 나은 교육 프로그램을 만드는 데 큰 도움이 됩니다.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/30 p-4 py-10">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold">교육 프로그램 만족도 조사</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            솔직한 피드백이 더 나은 프로그램을 만들어요 (익명 가능)
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">기본 정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>이름 (선택)</Label>
                  <Input
                    placeholder="홍길동 또는 익명"
                    value={form.respondent}
                    onChange={(e) => setForm({ ...form, respondent: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>구분</Label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                  >
                    <option>참가자</option>
                    <option>운영진</option>
                    <option>코치/강사</option>
                    <option>기타</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>프로그램명</Label>
                <Input
                  placeholder="참여한 프로그램명을 입력해주세요"
                  value={form.projectName}
                  onChange={(e) => setForm({ ...form, projectName: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>해당 회차 (선택)</Label>
                <Input
                  placeholder="예: 3회차, 또는 '전체'"
                  value={form.sessionNo}
                  onChange={(e) => setForm({ ...form, sessionNo: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">만족도 평가 (1~5점)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {[
                { label: '전체 만족도 *', key: 'overallScore' },
                { label: '콘텐츠/강의 내용', key: 'contentScore' },
                { label: '코치/강사', key: 'coachScore' },
                { label: '운영 및 진행', key: 'facilitationScore' },
              ].map(({ label, key }) => (
                <div key={key} className="space-y-2">
                  <Label>{label}</Label>
                  <StarSelect
                    name={key}
                    value={form[key as keyof typeof form] as number}
                    onChange={(v) => setForm({ ...form, [key]: v })}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">주관식 응답</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>가장 좋았던 점</Label>
                <textarea
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  rows={3}
                  placeholder="어떤 점이 특히 도움이 되었나요?"
                  value={form.bestPart}
                  onChange={(e) => setForm({ ...form, bestPart: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>개선이 필요한 점</Label>
                <textarea
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  rows={3}
                  placeholder="더 나아졌으면 하는 점을 솔직하게 알려주세요."
                  value={form.improvement}
                  onChange={(e) => setForm({ ...form, improvement: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>주변에 추천하시겠어요?</Label>
                <div className="flex gap-2">
                  {(['예', '아니요', '모르겠음'] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setForm({ ...form, wouldRecommend: opt })}
                      className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                        form.wouldRecommend === opt
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-muted-foreground/30 text-muted-foreground hover:border-primary'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>기타 자유 의견</Label>
                <textarea
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  rows={4}
                  placeholder="하고 싶은 말씀이 있으면 편하게 적어주세요."
                  value={form.freeText}
                  onChange={(e) => setForm({ ...form, freeText: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          {errorMsg && (
            <p className="mt-3 text-center text-sm text-destructive">{errorMsg}</p>
          )}

          <Button
            type="submit"
            className="mt-4 w-full"
            disabled={status === 'loading'}
          >
            {status === 'loading' ? '제출 중...' : '피드백 제출하기'}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          수집된 피드백은 교육 프로그램 개선을 위해서만 사용됩니다.
        </p>
      </div>
    </div>
  )
}
