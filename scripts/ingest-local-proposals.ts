/**
 * scripts/ingest-local-proposals.ts — 로컬 PDF → WinningProposalDoc 적재 (ADR-028 추록 2 후속)
 *
 * Drive 시트 파이프라인(learn-winning-fulltext.ts)을 거치지 않은 **로컬 파일**
 * (제안서·결과보고서)을 같은 WinningProposalDoc 테이블에 적재한다.
 * 스키마 변경 없음 — 기존 필드만 사용:
 *   - sourceFileId = `local:<파일명>` (unique — 재실행 시 upsert 멱등)
 *   - sourceTab    = 'local-2026'
 *   - won          = true
 *   - parseBy / charCount / lowText 기록 (텍스트 빈약 = 스캔 PDF 추정 → lowText, 중단 안 함)
 *
 * 결과보고서 여부는 DB 에 따로 저장하지 않는다 — 파일명/프로젝트명의 '결과보고서'
 * 포함 여부로 추출 단계(extract-design-patterns.ts)가 docType 을 판별한다 (추록 2).
 *
 * 사용:
 *   npx tsx scripts/ingest-local-proposals.ts "C:\path\제안서 A.pdf" "C:\path\결과보고서 B.pdf"
 *
 * LLM 호출 없음 (파일 read + pdf-parse 만).
 */

import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })

import fs from 'node:fs'
import path from 'node:path'

/** learn-winning-fulltext.ts 와 동일 기준 — 500자 미만이면 이미지 PDF 추정. */
const LOW_TEXT_THRESHOLD = 500

const EXT_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
}

/** 파일명에서 연도(20xx) 추정 — 없으면 null. */
function inferYear(fileName: string): number | null {
  const m = fileName.match(/20\d{2}/)
  return m ? parseInt(m[0], 10) : null
}

async function main() {
  const filePaths = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  if (filePaths.length === 0) {
    console.error('사용: npx tsx scripts/ingest-local-proposals.ts <파일경로> [<파일경로> ...]')
    process.exit(1)
  }

  // dotenv 이후 동적 import (env 의존 모듈)
  const { extractTextFromBuffer } = await import('../src/lib/ingest/file-ingester')
  const { prisma } = await import('../src/lib/prisma')

  console.log(`▶ 로컬 제안서/결과보고서 적재 — ${filePaths.length}건`)

  let succeeded = 0
  let failed = 0
  const results: { docId: string; fileName: string; charCount: number; lowText: boolean }[] = []

  for (const fp of filePaths) {
    const abs = path.resolve(fp)
    const fileName = path.basename(abs)
    try {
      if (!fs.existsSync(abs)) throw new Error(`파일 없음: ${abs}`)
      const buffer = fs.readFileSync(abs)
      const extracted = await extractTextFromBuffer(buffer, fileName)
      const text = extracted.text ?? ''
      const low = text.length < LOW_TEXT_THRESHOLD
      const sourceFileId = `local:${fileName}`
      const projectName = fileName.replace(/\.[^.]+$/, '')
      const data = {
        projectId: null as string | null,
        projectName,
        client: null as string | null,
        channel: null as string | null, // 추측 금지 — 추출 단계가 원문에서 추론 (profileSnapshot.channel)
        year: inferYear(fileName),
        sourceTab: 'local-2026',
        won: true,
        fileName,
        mimeType: EXT_MIME[path.extname(fileName).toLowerCase()] ?? null,
        fullText: text,
        charCount: extracted.charCount ?? text.length,
        parseBy: extracted.by,
        lowText: low,
      }
      const doc = await prisma.winningProposalDoc.upsert({
        where: { sourceFileId },
        update: data,
        create: { sourceFileId, ...data },
      })
      succeeded++
      results.push({ docId: doc.id, fileName, charCount: data.charCount, lowText: low })
      console.log(
        `  ✓ ${doc.id} — ${fileName} (${data.charCount.toLocaleString()}자 · ${extracted.by}` +
          `${low ? ' · ⚠lowText(스캔 PDF 추정)' : ''}${extracted.truncated ? ' · 절단' : ''})`,
      )
    } catch (e) {
      failed++
      console.warn(`  ✗ ${fileName} — ${e instanceof Error ? e.message.slice(0, 200) : e}`)
    }
  }

  console.log(`\n[요약] 성공 ${succeeded} · 실패 ${failed}`)
  if (results.length > 0) {
    console.log('\n다음 단계 (추출):')
    console.log(
      `  npx tsx scripts/extract-design-patterns.ts --ids ${results.map((r) => r.docId).join(',')}`,
    )
  }
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error('FATAL:', e instanceof Error ? e.stack : e)
  process.exitCode = 1
})
