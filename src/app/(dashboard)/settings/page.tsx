'use client'

import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { useState, useRef } from 'react'

const IMPORT_TYPES = [
  { value: 'coaches', label: '코치 목록 (Coach)' },
  { value: 'cost-standards', label: '비용 기준 단가표 (CostStandard)' },
  { value: 'modules', label: '교육 모듈 (Module)' },
  { value: 'sroi-proxies', label: 'SROI 프록시 계수 (SroiProxy)' },
]

export default function SettingsPage() {
  const [loading, setLoading] = useState<string | null>(null)

  // 엑셀 임포트
  const [importType, setImportType] = useState('coaches')
  const [importSheet, setImportSheet] = useState('')
  const [importDryRun, setImportDryRun] = useState(false)
  const [importResult, setImportResult] = useState<Record<string, any> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleImport() {
    const file = fileInputRef.current?.files?.[0]
    if (!file) { toast.error('파일을 선택해주세요.'); return }

    setLoading('import')
    setImportResult(null)
    try {
      const form = new FormData()
      form.append('type', importType)
      form.append('file', file)
      if (importSheet) form.append('sheet', importSheet)
      if (importDryRun) form.append('dryRun', 'true')

      const res = await fetch('/api/admin/import', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '임포트 실패')
      setImportResult(data)
      toast.success(importDryRun ? '드라이런 완료 (저장 안됨)' : '임포트 완료!')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(null)
    }
  }

  async function callApi(action: string, label: string) {
    setLoading(action)
    try {
      const res = await fetch('/api/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '오류 발생')
      toast.success(data.message ?? `${label} 완료`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(null)
    }
  }

  async function syncCoaches() {
    setLoading('sync-coaches')
    try {
      const res = await fetch('/api/coaches/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '동기화 실패')
      toast.success(`코치 DB 동기화 완료: ${data.upserted}명 업데이트, ${data.skipped}명 스킵`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex flex-col overflow-hidden">
      <Header title="설정" />
      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-2xl">

        {/* 엑셀 임포트 */}
        <Card>
          <CardHeader>
            <CardTitle>엑셀 파일 임포트</CardTitle>
            <CardDescription>
              .xlsx / .csv 파일을 업로드하여 DB에 직접 임포트합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>임포트 타입</Label>
                <Select value={importType} onValueChange={(v) => v && setImportType(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IMPORT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>시트 이름 (선택)</Label>
                <Input
                  placeholder="비어있으면 첫 번째 시트"
                  value={importSheet}
                  onChange={(e) => setImportSheet(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>파일 선택</Label>
              <Input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={importDryRun}
                  onChange={(e) => setImportDryRun(e.target.checked)}
                  className="rounded"
                />
                드라이런 (저장 안 함, 파싱 결과만 확인)
              </label>
              <Button
                onClick={handleImport}
                disabled={loading === 'import'}
              >
                {loading === 'import' ? '처리 중...' : importDryRun ? '드라이런 실행' : '임포트 실행'}
              </Button>
            </div>
            {importResult && (
              <div className="rounded-md bg-muted p-3 text-sm font-mono whitespace-pre-wrap">
                {JSON.stringify(importResult, null, 2)}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 코치 DB */}
        <Card>
          <CardHeader>
            <CardTitle>코치 DB 동기화</CardTitle>
            <CardDescription>
              GitHub 레포지토리의 coaches_db.json을 불러와 DB에 upsert합니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={syncCoaches}
              disabled={loading === 'sync-coaches'}
              variant="outline"
            >
              {loading === 'sync-coaches' ? '동기화 중...' : 'GitHub → DB 동기화'}
            </Button>
          </CardContent>
        </Card>

        {/* Google Sheets */}
        <Card>
          <CardHeader>
            <CardTitle>Google Sheets 연동</CardTitle>
            <CardDescription>
              서비스 계정 키를 .env에 설정한 후 아래 버튼으로 시트를 초기화하세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Button
                onClick={() => callApi('init-feedback', '피드백 시트 초기화')}
                disabled={!!loading}
                variant="outline"
                size="sm"
              >
                {loading === 'init-feedback' ? '처리 중...' : '피드백 시트 헤더 초기화'}
              </Button>
              <p className="text-xs text-muted-foreground">GOOGLE_SHEETS_FEEDBACK_ID 필요</p>
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={() => callApi('init-coaches', '코치 단가 시트 초기화')}
                disabled={!!loading}
                variant="outline"
                size="sm"
              >
                {loading === 'init-coaches' ? '처리 중...' : '코치 단가 시트 헤더 초기화'}
              </Button>
              <p className="text-xs text-muted-foreground">GOOGLE_SHEETS_COACHES_ID 필요</p>
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={() => callApi('export-coaches', '코치 단가 내보내기')}
                disabled={!!loading}
                variant="outline"
                size="sm"
              >
                {loading === 'export-coaches' ? '내보내는 중...' : 'DB → 코치 단가 시트 내보내기'}
              </Button>
              <p className="text-xs text-muted-foreground">코치 단가 전체를 시트에 기록</p>
            </div>
          </CardContent>
        </Card>

        {/* 환경변수 안내 */}
        <Card>
          <CardHeader>
            <CardTitle>환경변수 설정 안내</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p><code className="text-foreground">GITHUB_TOKEN</code> — GitHub PAT (repo:read)</p>
            <p><code className="text-foreground">GITHUB_COACHES_REPO</code> — org/repo 형식</p>
            <p><code className="text-foreground">ANTHROPIC_API_KEY</code> — 제안서/커리큘럼 AI 생성</p>
            <p><code className="text-foreground">GOOGLE_SERVICE_ACCOUNT_EMAIL</code> — 서비스 계정 이메일</p>
            <p><code className="text-foreground">GOOGLE_PRIVATE_KEY</code> — 서비스 계정 Private Key</p>
            <p><code className="text-foreground">GOOGLE_SHEETS_FEEDBACK_ID</code> — 피드백 시트 ID</p>
            <p><code className="text-foreground">GOOGLE_SHEETS_COACHES_ID</code> — 코치 단가 시트 ID</p>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
