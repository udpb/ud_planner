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

  // 2026-05-03: Google Sheets 연동 폐기됨 (callApi 제거)

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
              Supabase coaches_directory (coach-finder 와 동일 source) 에서 fetch 후
              ud-ops 로컬 Coach 테이블에 upsert. SUPABASE_URL + SUPABASE_SERVICE_ROLE
              미설정 시 GitHub raw JSON 으로 자동 fallback.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={syncCoaches}
              disabled={loading === 'sync-coaches'}
              variant="outline"
            >
              {loading === 'sync-coaches' ? '동기화 중...' : 'Supabase → DB 동기화'}
            </Button>
          </CardContent>
        </Card>

        {/* 환경변수 안내 */}
        <Card>
          <CardHeader>
            <CardTitle>환경변수 설정 안내</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p><code className="text-foreground">DATABASE_URL</code> — Neon PostgreSQL 연결 (필수)</p>
            <p><code className="text-foreground">AUTH_SECRET</code> — NextAuth v5 JWT 서명 (필수)</p>
            <p><code className="text-foreground">SUPABASE_URL</code> — Supabase 프로젝트 URL (Coach 데이터 source)</p>
            <p><code className="text-foreground">SUPABASE_SERVICE_ROLE</code> — Supabase service-role 키 (server-only, sensitive)</p>
            <p><code className="text-foreground">GEMINI_API_KEY</code> — AI primary (제안서/커리큘럼 생성)</p>
            <p><code className="text-foreground">ANTHROPIC_API_KEY</code> — AI fallback</p>
            <p><code className="text-foreground">GITHUB_TOKEN</code> — Coach DB GitHub fallback (선택)</p>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
