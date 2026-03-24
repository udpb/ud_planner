import { Header } from '@/components/layout/header'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ExternalLink, Copy } from 'lucide-react'
import { FeedbackLinkCopy } from './feedback-link-copy'

export const dynamic = 'force-dynamic'
export const metadata = { title: '피드백 관리' }

async function getProjects() {
  return prisma.project.findMany({
    where: { status: { in: ['IN_PROGRESS', 'COMPLETED', 'SUBMITTED'] } },
    select: { id: true, name: true, client: true, status: true },
    orderBy: { updatedAt: 'desc' },
  })
}

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: '제출완료', IN_PROGRESS: '운영중', COMPLETED: '완료',
}

export default async function FeedbackAdminPage() {
  const projects = await getProjects()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const sheetId = process.env.GOOGLE_SHEETS_FEEDBACK_ID

  return (
    <div className="flex flex-col overflow-hidden">
      <Header title="피드백 관리" />
      <div className="flex-1 overflow-y-auto p-6">
        {/* 안내 카드 */}
        <Card className="mb-6 border-primary/30 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="text-2xl">📊</div>
              <div>
                <p className="font-medium">피드백 수집 → Google Sheets 자동 저장</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  각 프로젝트 링크를 참가자에게 공유하면, 제출된 피드백이 실시간으로 구글 스프레드시트에 쌓입니다.
                </p>
                {sheetId ? (
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${sheetId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    피드백 스프레드시트 열기
                  </a>
                ) : (
                  <p className="mt-2 text-xs text-amber-600">
                    ⚠️ .env의 GOOGLE_SHEETS_FEEDBACK_ID가 설정되지 않았습니다.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Google Sheets 설정 가이드 */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm">Google Sheets 연동 설정 방법</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <ol className="list-decimal space-y-1 pl-4">
              <li>
                <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  Google Cloud Console
                </a>
                에서 서비스 계정 생성 (Google Sheets API 활성화)
              </li>
              <li>서비스 계정의 JSON 키 다운로드 → <code className="rounded bg-muted px-1">.env</code>에 아래 값 추가</li>
              <li>새 구글 스프레드시트 생성 → 서비스 계정 이메일에 편집 권한 부여</li>
              <li>스프레드시트 ID를 <code className="rounded bg-muted px-1">GOOGLE_SHEETS_FEEDBACK_ID</code>에 설정</li>
            </ol>
            <div className="mt-3 rounded-md bg-muted p-3 font-mono text-xs">
              <p>GOOGLE_SERVICE_ACCOUNT_EMAIL=xxx@project.iam.gserviceaccount.com</p>
              <p>GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."</p>
              <p>GOOGLE_SHEETS_FEEDBACK_ID=1BxiMV...</p>
            </div>
            <p className="text-xs">
              📋 스프레드시트 첫 행(헤더):{' '}
              <code className="rounded bg-muted px-1 text-xs">
                제출일시 | 프로그램명 | 프로젝트ID | 회차 | 응답자 | 구분 | 전체만족도 | 콘텐츠 | 코치 | 운영 | 좋았던점 | 개선점 | 추천여부 | 자유의견
              </code>
            </p>
          </CardContent>
        </Card>

        {/* 프로젝트별 피드백 링크 */}
        <h2 className="mb-3 text-sm font-semibold">프로젝트별 피드백 링크</h2>
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">운영중이거나 완료된 프로젝트가 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {projects.map((p) => (
              <Card key={p.id}>
                <CardContent className="flex items-center gap-4 py-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{p.name}</span>
                      <Badge variant="outline">{STATUS_LABEL[p.status] ?? p.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{p.client}</p>
                    <code className="mt-1 block text-xs text-muted-foreground">
                      {appUrl}/feedback/{p.id}
                    </code>
                  </div>
                  <div className="flex gap-2">
                    <FeedbackLinkCopy url={`${appUrl}/feedback/${p.id}`} />
                    <a
                      href={`/feedback/${p.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <ExternalLink className="h-3.5 w-3.5" />
                        미리보기
                      </Button>
                    </a>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
