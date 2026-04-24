'use client'

/**
 * Content Hub 자산 편집 폼 — 신규·편집 공용 (Phase H Wave H3).
 *
 * 필수 5 필드는 최상단:
 *   1. name · 2. category · 3. narrativeSnippet · 4. applicableSections · 5. valueChainStage
 *
 * 선택 필드는 접힌 Accordion (details/summary) 안:
 *   parentId · evidenceType · keywords · keyNumbers · sourceReferences ·
 *   programProfileFit · status · version · lastReviewedAt
 *
 * 저장/아카이브/취소 액션 — onSave · onArchive prop 으로 상위(new · edit 페이지)에서 분기.
 */

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Plus, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { VALUE_CHAIN_STAGES_ORDERED } from '@/lib/value-chain'

// ─────────────────────────────────────────
// 상수
// ─────────────────────────────────────────

const CATEGORY_OPTIONS = [
  { value: 'methodology', label: '방법론' },
  { value: 'content', label: '콘텐츠' },
  { value: 'product', label: '프로덕트' },
  { value: 'human', label: '휴먼' },
  { value: 'data', label: '데이터' },
  { value: 'framework', label: '프레임워크' },
] as const

const SECTION_OPTIONS = [
  { value: 'proposal-background', label: '제안 배경' },
  { value: 'org-team', label: '수행 조직' },
  { value: 'curriculum', label: '커리큘럼' },
  { value: 'coaches', label: '코치' },
  { value: 'budget', label: '예산' },
  { value: 'impact', label: '임팩트' },
  { value: 'other', label: '기타' },
] as const

const EVIDENCE_OPTIONS = [
  { value: 'quantitative', label: '정량 (숫자)' },
  { value: 'structural', label: '구조 (도식·프레임)' },
  { value: 'case', label: '사례 (과거 수행)' },
  { value: 'methodology', label: '방법 (프로세스)' },
] as const

const STATUS_OPTIONS = [
  { value: 'stable', label: '안정 (stable)' },
  { value: 'developing', label: '개발 중 (developing)' },
  { value: 'archived', label: '아카이브 (archived)' },
] as const

// ─────────────────────────────────────────
// 타입
// ─────────────────────────────────────────

export interface AssetFormInitial {
  id?: string
  name?: string
  category?: string
  narrativeSnippet?: string
  applicableSections?: string[]
  valueChainStage?: string
  parentId?: string | null
  evidenceType?: string
  keywords?: string[]
  keyNumbers?: string[]
  sourceReferences?: string[]
  programProfileFit?: unknown
  status?: string
  version?: number
  lastReviewedAt?: string // ISO (yyyy-mm-dd)
}

export interface AssetFormParent {
  id: string
  name: string
}

export interface AssetFormProps {
  mode: 'new' | 'edit'
  initial?: AssetFormInitial
  /** parentId Select 옵션 — 서버가 전달한 top-level 자산 목록 */
  parents: AssetFormParent[]
}

// ─────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────

export function AssetForm({ mode, initial, parents }: AssetFormProps) {
  const router = useRouter()

  const [name, setName] = useState(initial?.name ?? '')
  const [category, setCategory] = useState(initial?.category ?? 'methodology')
  const [narrativeSnippet, setNarrativeSnippet] = useState(
    initial?.narrativeSnippet ?? '',
  )
  const [applicableSections, setApplicableSections] = useState<string[]>(
    initial?.applicableSections ?? [],
  )
  const [valueChainStage, setValueChainStage] = useState(
    initial?.valueChainStage ?? 'activity',
  )

  const [parentId, setParentId] = useState<string>(initial?.parentId ?? '')
  const [evidenceType, setEvidenceType] = useState(
    initial?.evidenceType ?? 'structural',
  )
  const [keywords, setKeywords] = useState<string[]>(initial?.keywords ?? [])
  const [keyNumbers, setKeyNumbers] = useState<string[]>(initial?.keyNumbers ?? [])
  const [sourceReferences, setSourceReferences] = useState<string[]>(
    initial?.sourceReferences ?? [],
  )

  const [profileFitJson, setProfileFitJson] = useState<string>(
    initial?.programProfileFit
      ? JSON.stringify(initial.programProfileFit, null, 2)
      : '',
  )

  const [status, setStatus] = useState(initial?.status ?? 'stable')
  const [version, setVersion] = useState<number>(initial?.version ?? 1)
  const [bumpVersion, setBumpVersion] = useState<boolean>(false)

  const [lastReviewedAt, setLastReviewedAt] = useState<string>(
    initial?.lastReviewedAt ??
      (mode === 'new' ? new Date().toISOString().slice(0, 10) : ''),
  )

  const [saving, setSaving] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // parentId 옵션: 편집 모드면 자기 자신 제외
  const parentOptions = useMemo(
    () => parents.filter((p) => p.id !== initial?.id),
    [parents, initial?.id],
  )

  // ─────────────────────────
  // 핸들러 — 체크박스·태그·URL
  // ─────────────────────────

  function toggleSection(value: string) {
    setApplicableSections((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value],
    )
  }

  function validate(): string | null {
    if (!name.trim()) return '이름이 비어있습니다.'
    if (!category) return '카테고리를 선택하세요.'
    if (narrativeSnippet.trim().length < 50)
      return '제안서 초안은 최소 50자 이상이어야 합니다.'
    if (applicableSections.length === 0)
      return '적용 섹션을 1개 이상 선택하세요.'
    if (!valueChainStage) return 'Value Chain 단계를 선택하세요.'

    // profileFit JSON 검증
    if (profileFitJson.trim()) {
      try {
        JSON.parse(profileFitJson)
      } catch {
        return 'programProfileFit JSON 파싱 실패 — 유효한 JSON 이어야 합니다.'
      }
    }
    return null
  }

  function buildPayload(overrideStatus?: string) {
    const payload: Record<string, unknown> = {
      name: name.trim(),
      category,
      narrativeSnippet: narrativeSnippet.trim(),
      applicableSections,
      valueChainStage,
      evidenceType,
      keywords,
      keyNumbers,
      sourceReferences,
      status: overrideStatus ?? status,
      version: bumpVersion ? version + 1 : version,
      parentId: parentId ? parentId : null,
    }

    if (profileFitJson.trim()) {
      payload.programProfileFit = JSON.parse(profileFitJson)
    } else {
      payload.programProfileFit = null
    }

    if (lastReviewedAt) {
      payload.lastReviewedAt = lastReviewedAt
    }

    return payload
  }

  async function handleSave() {
    const err = validate()
    if (err) {
      setErrorMsg(err)
      toast.error(err)
      return
    }
    setErrorMsg(null)
    setSaving(true)

    try {
      const payload = buildPayload()
      const url =
        mode === 'new'
          ? '/api/content-hub/assets'
          : `/api/content-hub/assets/${initial?.id}`
      const method = mode === 'new' ? 'POST' : 'PATCH'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data: { error?: string; issues?: unknown } = await res.json().catch(() => ({}))
        const msg = data.error ?? `저장 실패 (HTTP ${res.status})`
        throw new Error(msg)
      }

      toast.success(mode === 'new' ? '자산이 생성되었습니다.' : '자산이 저장되었습니다.')
      router.push('/admin/content-hub')
      router.refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : '저장 실패'
      setErrorMsg(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleArchive() {
    if (mode !== 'edit' || !initial?.id) return
    setArchiving(true)
    setErrorMsg(null)
    try {
      const payload = buildPayload('archived')
      const res = await fetch(`/api/content-hub/assets/${initial.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data: { error?: string } = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `아카이브 실패 (HTTP ${res.status})`)
      }
      toast.success('자산이 아카이브되었습니다.')
      setConfirmArchive(false)
      router.push('/admin/content-hub')
      router.refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : '아카이브 실패'
      setErrorMsg(msg)
      toast.error(msg)
    } finally {
      setArchiving(false)
    }
  }

  // ─────────────────────────
  // 렌더
  // ─────────────────────────

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">
          {mode === 'new' ? '새 자산' : '자산 편집'}
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Content Hub — 언더독스 자산 {mode === 'new' ? '신규 등록' : '수정'}
        </p>
      </div>

      {/* ───────── 필수 5 필드 ───────── */}
      <section className="space-y-5 rounded-lg border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">필수 필드</h2>

        {/* 1. 이름 */}
        <div className="space-y-1.5">
          <Label htmlFor="asset-name" className="text-xs">
            1. 이름 <span className="text-destructive">*</span>
          </Label>
          <Input
            id="asset-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: IMPACT 6단계 프레임워크"
          />
        </div>

        {/* 2. 카테고리 */}
        <div className="space-y-1.5">
          <Label className="text-xs">
            2. 카테고리 <span className="text-destructive">*</span>
          </Label>
          <Select value={category} onValueChange={(v) => v && setCategory(v)}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 3. narrativeSnippet */}
        <div className="space-y-1.5">
          <Label htmlFor="asset-snippet" className="text-xs">
            3. 제안서 초안 (narrativeSnippet){' '}
            <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="asset-snippet"
            value={narrativeSnippet}
            onChange={(e) => setNarrativeSnippet(e.target.value)}
            placeholder="제안서에 들어갈 2~3 문장 초안. AI 가 섹션 맥락에 맞춰 재작성합니다."
            className="min-h-28"
          />
          <p className="text-[11px] text-muted-foreground">
            현재 {narrativeSnippet.trim().length}자 · 최소 50자 권장 (2~3 문장)
          </p>
        </div>

        {/* 4. applicableSections */}
        <div className="space-y-1.5">
          <Label className="text-xs">
            4. 적용 섹션 (applicableSections){' '}
            <span className="text-destructive">*</span>
          </Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {SECTION_OPTIONS.map((o) => {
              const checked = applicableSections.includes(o.value)
              return (
                <label
                  key={o.value}
                  className="group flex cursor-pointer items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs hover:bg-muted/30"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleSection(o.value)}
                  />
                  <span>{o.label}</span>
                </label>
              )
            })}
          </div>
        </div>

        {/* 5. valueChainStage */}
        <div className="space-y-1.5">
          <Label className="text-xs">
            5. Value Chain 단계 (valueChainStage){' '}
            <span className="text-destructive">*</span>
          </Label>
          <RadioGroup
            value={valueChainStage}
            onValueChange={(v) => v && setValueChainStage(v)}
            className="grid-cols-1 sm:grid-cols-2"
          >
            {VALUE_CHAIN_STAGES_ORDERED.map((s) => (
              <label
                key={s.key}
                className="flex cursor-pointer items-center gap-2 rounded-md border bg-background px-2.5 py-2 text-xs hover:bg-muted/30"
              >
                <RadioGroupItem value={s.key} />
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: s.colorHex }}
                />
                <span className="font-medium">{s.numberedLabel}</span>
                <span className="text-muted-foreground">{s.koLabel}</span>
              </label>
            ))}
          </RadioGroup>
        </div>
      </section>

      {/* ───────── 선택 필드 (Accordion) ───────── */}
      <details className="group rounded-lg border bg-card">
        <summary className="flex cursor-pointer select-none items-center justify-between p-5 text-sm font-semibold">
          선택 필드 (계층·태그·버전·검토일)
          <span className="text-xs text-muted-foreground group-open:hidden">
            ▸ 펼치기
          </span>
          <span className="hidden text-xs text-muted-foreground group-open:inline">
            ▾ 접기
          </span>
        </summary>

        <div className="space-y-5 border-t p-5">
          {/* parentId */}
          <div className="space-y-1.5">
            <Label className="text-xs">부모 자산 (parentId)</Label>
            <Select
              value={parentId || 'none'}
              onValueChange={(v) => v && setParentId(v === 'none' ? '' : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— 없음 (Top-level)</SelectItem>
                {parentOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              1 단 계층만 허용 — 선택할 수 있는 부모는 top-level 자산뿐입니다.
            </p>
          </div>

          {/* evidenceType */}
          <div className="space-y-1.5">
            <Label className="text-xs">증거 유형 (evidenceType)</Label>
            <Select
              value={evidenceType}
              onValueChange={(v) => v && setEvidenceType(v)}
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVIDENCE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* keywords */}
          <TagInputField
            label="키워드 (keywords)"
            helper="RFP 본문·파싱 필드에서 매칭 트리거가 될 단어. Enter 로 추가."
            values={keywords}
            onChange={setKeywords}
            placeholder="예: 창업 교육"
          />

          {/* keyNumbers */}
          <TagInputField
            label="핵심 수치 (keyNumbers)"
            helper="narrativeSnippet 안에서 그대로 유지할 숫자. Enter 로 추가."
            values={keyNumbers}
            onChange={setKeyNumbers}
            placeholder="예: 25,000명"
          />

          {/* sourceReferences */}
          <UrlListField
            label="소스 레퍼런스 (sourceReferences)"
            helper="외부 원본 URL 여러 개 등록 가능."
            values={sourceReferences}
            onChange={setSourceReferences}
          />

          {/* programProfileFit */}
          <div className="space-y-1.5">
            <Label className="text-xs">
              programProfileFit (JSON, 고급)
            </Label>
            <Textarea
              value={profileFitJson}
              onChange={(e) => setProfileFitJson(e.target.value)}
              placeholder={'예: {\n  "primary": "startup",\n  "stage": "ideation"\n}'}
              className="min-h-24 font-mono text-xs"
            />
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              ⚠ 초보자는 비워두세요. ProgramProfile 11축 중 일부만 Partial 로 입력.
              빈 칸은 &quot;어떤 프로파일에도 중립&quot;으로 처리됩니다.
            </p>
          </div>

          {/* status + version + lastReviewedAt */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">상태 (status)</Label>
              <Select value={status} onValueChange={(v) => v && setStatus(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">버전 (version)</Label>
              <Input
                type="number"
                min={1}
                value={version}
                onChange={(e) =>
                  setVersion(Math.max(1, Number(e.target.value) || 1))
                }
              />
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Checkbox
                  checked={bumpVersion}
                  onCheckedChange={(v) => setBumpVersion(Boolean(v))}
                />
                저장 시 자동 +1
              </label>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">최종 검토일 (lastReviewedAt)</Label>
              <Input
                type="date"
                value={lastReviewedAt}
                onChange={(e) => setLastReviewedAt(e.target.value)}
              />
            </div>
          </div>
        </div>
      </details>

      {/* ───────── 에러 + 액션 ───────── */}
      {errorMsg && (
        <p className="text-xs text-destructive">
          저장할 수 없습니다: {errorMsg}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <div>
          {mode === 'edit' && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmArchive(true)}
              disabled={archiving || saving}
            >
              아카이브
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/admin/content-hub')}
            disabled={saving || archiving}
          >
            취소
          </Button>
          <Button onClick={handleSave} disabled={saving || archiving} size="sm">
            {saving ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                저장 중
              </>
            ) : (
              '저장'
            )}
          </Button>
        </div>
      </div>

      {/* 아카이브 확인 다이얼로그 */}
      <Dialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>아카이브하시겠습니까?</DialogTitle>
            <DialogDescription>
              이 자산의 상태가 <b>archived</b> 로 변경되어 기본 목록에서
              숨겨집니다. 과거 제안서의 참조는 유지되며, 필요 시 상태 필터로 다시
              불러올 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmArchive(false)}
            >
              취소
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleArchive}
              disabled={archiving}
            >
              {archiving ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  처리 중
                </>
              ) : (
                '아카이브 확정'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─────────────────────────────────────────
// 보조 컴포넌트 — 태그 입력 (Enter 로 추가)
// ─────────────────────────────────────────

function TagInputField({
  label,
  helper,
  values,
  onChange,
  placeholder,
}: {
  label: string
  helper?: string
  values: string[]
  onChange: (next: string[]) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState('')

  function add(v?: string) {
    const text = (v ?? draft).trim()
    if (!text) return
    if (values.includes(text)) {
      setDraft('')
      return
    }
    onChange([...values, text])
    setDraft('')
  }

  function remove(v: string) {
    onChange(values.filter((x) => x !== v))
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-background p-1.5">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs"
          >
            {v}
            <button
              type="button"
              onClick={() => remove(v)}
              className="rounded-sm p-0.5 hover:bg-background"
              aria-label={`${v} 제거`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-xs outline-none"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            } else if (e.key === 'Backspace' && !draft && values.length) {
              remove(values[values.length - 1])
            }
          }}
          placeholder={placeholder}
        />
      </div>
      {helper && <p className="text-[11px] text-muted-foreground">{helper}</p>}
    </div>
  )
}

// ─────────────────────────────────────────
// 보조 컴포넌트 — URL 여러 개 입력
// ─────────────────────────────────────────

function UrlListField({
  label,
  helper,
  values,
  onChange,
}: {
  label: string
  helper?: string
  values: string[]
  onChange: (next: string[]) => void
}) {
  const [draft, setDraft] = useState('')

  function add() {
    const text = draft.trim()
    if (!text) return
    onChange([...values, text])
    setDraft('')
  }

  function remove(idx: number) {
    onChange(values.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="space-y-1.5">
        {values.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input value={v} readOnly className="text-xs" />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => remove(i)}
              type="button"
              aria-label="제거"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Input
            placeholder="https://..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
            className="text-xs"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={add}
            type="button"
            disabled={!draft.trim()}
          >
            <Plus className="h-3.5 w-3.5" />
            추가
          </Button>
        </div>
      </div>
      {helper && <p className="text-[11px] text-muted-foreground">{helper}</p>}
    </div>
  )
}
