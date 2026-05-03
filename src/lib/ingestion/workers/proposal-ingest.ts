/**
 * proposal-ingest 워커 — 수주 제안서 PDF → WinningPattern 후보 자동 추출
 *
 * Phase D1: "쌓일수록 강해지는 시스템" (ADR-003) 의 첫 구현.
 *
 * 흐름:
 * 1. IngestionJob 조회 (kind === "proposal")
 * 2. status "queued" → "processing"
 * 3. sourceFile 에서 PDF 읽기 → pdf-section-splitter
 * 4. 섹션별 AI 패턴 추출 (extractPatternsFromSection)
 * 5. ExtractedItem 생성 (targetAsset: "winning_pattern")
 * 6. status → "review"
 * 7. 실패 시 → "failed" + error 기록
 *
 * 관련 문서:
 *   - docs/architecture/ingestion.md §3.1
 *   - ADR-003 원본 불변 · 승인 필수
 *   - ADR-005 가이드북 분리 (가이드북 요약문 시드 금지)
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { invokeAi } from '@/lib/ai-fallback'
import {
  splitPdfIntoSections,
  type SplitSection,
  type SplitSectionKey,
} from '@/lib/ingestion/pdf-section-splitter'

// ─────────────────────────────────────────
// safeParseJson 복제 (B1 패턴 — claude.ts 에서 export 안 됨)
// ─────────────────────────────────────────

function safeParseJson<T>(raw: string, label: string): T {
  let s = raw.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim()
  const objStart = s.indexOf('{')
  const arrStart = s.indexOf('[')
  let start: number
  let end: number
  if (arrStart !== -1 && (objStart === -1 || arrStart < objStart)) {
    start = arrStart
    end = s.lastIndexOf(']')
  } else {
    start = objStart
    end = s.lastIndexOf('}')
  }
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`[${label}] AI 응답에서 JSON을 찾을 수 없습니다. 응답 일부: ${s.slice(0, 200)}`)
  }
  s = s.slice(start, end + 1)
  try {
    return JSON.parse(s) as T
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    throw new Error(`[${label}] JSON 파싱 실패: ${message} (응답 길이: ${s.length})`)
  }
}

// ─────────────────────────────────────────
// AI 패턴 추출 타입
// ─────────────────────────────────────────

interface ExtractedPattern {
  snippet: string
  whyItWorks: string
  tags: string[]
}

// ─────────────────────────────────────────
// AI 패턴 추출 (Claude 호출)
// ─────────────────────────────────────────

/**
 * 하나의 제안서 섹션에서 핵심 패턴을 추출합니다.
 *
 * Claude 프롬프트: brief Step 2 정의.
 * 재시도 1회.
 */
async function extractPatternsFromSection(
  section: SplitSection,
  meta: {
    client: string
    outcome: string
    techEvalScore: string
  },
): Promise<ExtractedPattern> {
  const prompt = `[언더독스 제안서 분석]
이 제안서의 "${section.sectionKey}" 섹션에서 다음을 추출하세요:
1. 핵심 스니펫 (snippet): 이 섹션의 본질을 담은 1~3 문장 원문 인용 또는 정제 요약
2. whyItWorks: 왜 이 섹션이 수주에 기여했다고 보는지 (추측임을 명시)
3. tags: 발주처 타입·대상·방법론 키워드 배열 (예: ["B2G", "청년창업", "정량KPI"])

[출력 JSON]
{ "snippet": "...", "whyItWorks": "...", "tags": [...] }

[제안 섹션 원문]
${section.body.slice(0, 6000)}

[제안서 메타]
발주처: ${meta.client}
수주여부: ${meta.outcome}
총점: ${meta.techEvalScore}`

  let lastError: Error | null = null

  // 최대 2회 시도 (원본 + 재시도 1회)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await invokeAi({
        prompt,
        maxTokens: 1024,
        temperature: 0.4,
        label: `proposal-ingest (attempt ${attempt + 1})`,
      })

      const raw = r.raw.trim()
      const parsed = safeParseJson<ExtractedPattern>(raw, 'extractPatternsFromSection')

      // 기본 검증
      if (!parsed.snippet || typeof parsed.snippet !== 'string') {
        throw new Error('snippet 이 비어있습니다.')
      }
      if (!parsed.whyItWorks || typeof parsed.whyItWorks !== 'string') {
        throw new Error('whyItWorks 가 비어있습니다.')
      }
      if (!Array.isArray(parsed.tags)) {
        parsed.tags = []
      }

      return parsed
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      // 재시도 전 짧은 대기
      if (attempt < 1) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }
  }

  throw lastError ?? new Error('AI 패턴 추출 실패')
}

// ─────────────────────────────────────────
// confidence 계산 heuristic
// ─────────────────────────────────────────

/**
 * 간단한 confidence heuristic:
 * - 스니펫 길이 (20자 이상 → +0.2)
 * - whyItWorks 길이 (30자 이상 → +0.2)
 * - tags 개수 (2개 이상 → +0.1)
 * - sectionKey 가 "other" 가 아닌 경우 → +0.2
 * - 기본값 0.3
 */
function computeConfidence(
  pattern: ExtractedPattern,
  sectionKey: SplitSectionKey,
): number {
  let confidence = 0.3
  if (pattern.snippet.length >= 20) confidence += 0.2
  if (pattern.whyItWorks.length >= 30) confidence += 0.2
  if (pattern.tags.length >= 2) confidence += 0.1
  if (sectionKey !== 'other') confidence += 0.2
  return Math.min(confidence, 1.0)
}

// ─────────────────────────────────────────
// 메인 워커 플로우
// ─────────────────────────────────────────

export interface ProcessResult {
  jobId: string
  sectionsProcessed: number
  extractedItemIds: string[]
  durationMs: number
}

/**
 * IngestionJob 을 처리합니다.
 *
 * @param jobId - IngestionJob.id
 * @returns 처리 결과 요약
 * @throws 처리 실패 시 (status 를 "failed" 로 업데이트 후 throw)
 *
 * TODO: Vercel 10s 제한 대응 — 큰 PDF 는 섹션별로 분할 호출 필요.
 *       현재는 동기 호출로 전체 처리. 50p PDF 기준 약 30~60초 소요 예상.
 */
export async function processIngestionJob(jobId: string): Promise<ProcessResult> {
  const startTime = Date.now()

  // 1. IngestionJob 조회
  const job = await prisma.ingestionJob.findUnique({ where: { id: jobId } })
  if (!job) {
    throw new Error(`IngestionJob 을 찾을 수 없습니다: ${jobId}`)
  }
  if (job.kind !== 'proposal') {
    throw new Error(`이 워커는 proposal 만 처리합니다. (받은 kind: ${job.kind})`)
  }
  if (job.status !== 'queued') {
    throw new Error(`처리 가능 상태가 아닙니다. (현재 status: ${job.status})`)
  }

  // 2. status → processing
  await prisma.ingestionJob.update({
    where: { id: jobId },
    data: { status: 'processing' },
  })

  try {
    // 3. PDF 읽기 + 섹션 분할
    if (!job.sourceFile) {
      throw new Error('sourceFile 이 없습니다. PDF 파일이 업로드되지 않았습니다.')
    }

    const storageRoot = path.join(process.cwd(), 'storage')
    const absolutePath = path.join(storageRoot, job.sourceFile)
    const buffer = await readFile(absolutePath)
    const sections = await splitPdfIntoSections(Buffer.from(buffer))

    // 메타데이터 추출
    const metadata = (job.metadata ?? {}) as Record<string, unknown>
    const client = String(metadata['client'] ?? '')
    const isWon = metadata['isWon']
    const outcome = isWon === true ? 'won' : isWon === false ? 'lost' : 'pending'
    const techEvalScore = metadata['totalScore'] ? String(metadata['totalScore']) : ''
    const projectName = String(metadata['projectName'] ?? '(알 수 없음)')

    // 4. 섹션별 AI 패턴 추출 (순차 처리 — API rate limit 방어)
    const extractedItemIds: string[] = []

    for (const section of sections) {
      // 너무 짧은 섹션은 건너뜀
      if (section.body.trim().length < 30) {
        continue
      }

      const pattern = await extractPatternsFromSection(section, {
        client,
        outcome,
        techEvalScore,
      })

      const confidence = computeConfidence(pattern, section.sectionKey)

      // 5. ExtractedItem 생성
      const item = await prisma.extractedItem.create({
        data: {
          jobId: job.id,
          targetAsset: 'winning_pattern',
          payload: {
            snippet: pattern.snippet,
            whyItWorks: pattern.whyItWorks,
            tags: pattern.tags,
            sectionKey: section.sectionKey,
            heading: section.heading,
            sourceProject: projectName,
            sourceClient: client,
            outcome,
            techEvalScore: techEvalScore ? Number(techEvalScore) : null,
          } as unknown as Prisma.InputJsonValue,
          confidence,
          status: 'pending',
        },
      })

      extractedItemIds.push(item.id)
    }

    // 6. status → review
    await prisma.ingestionJob.update({
      where: { id: jobId },
      data: {
        status: 'review',
        processedAt: new Date(),
      },
    })

    return {
      jobId,
      sectionsProcessed: extractedItemIds.length,
      extractedItemIds,
      durationMs: Date.now() - startTime,
    }
  } catch (err) {
    // 7. 실패 시 status → failed
    const message = err instanceof Error ? err.message : String(err)
    await prisma.ingestionJob.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        error: message,
      },
    })
    throw err
  }
}
