/**
 * scripts/cron-drive-watch.ts — W30 (Phase D, Auto-Ingest)
 *
 * Drive 폴더 polling-based watch — 신규/수정 파일 자동 ingest.
 *
 * 흐름:
 *   1. WATCHED_FOLDERS 목록 (env or arg) 의 각 폴더 walkFolder
 *   2. 각 파일의 modifiedTime 과 DB 의 마지막 ingest 시점 비교
 *   3. 새 파일 또는 수정된 파일 발견 → IngestionJob (kind='drive-auto') 큐 생성
 *   4. (옵션) --auto-ingest 플래그 → drive-asset-ingest 트리거
 *   5. 마지막 watch 시점 저장 (다음 cron run에서 비교)
 *
 * Drive Push Notifications 없이도 동작 (매시간 polling 권장).
 *
 * env:
 *   DRIVE_WATCH_FOLDERS — comma-separated folder IDs (없으면 --folders 인자)
 *
 * 사용:
 *   npx tsx scripts/cron-drive-watch.ts --dry-run
 *   npx tsx scripts/cron-drive-watch.ts --folders FOLDER_ID1,FOLDER_ID2
 *   npx tsx scripts/cron-drive-watch.ts --since-hours 24
 */

import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })

const argv = process.argv.slice(2)
function arg(flag: string, dflt: string): string {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}
const DRY_RUN = argv.includes('--dry-run')
const AUTO_INGEST = argv.includes('--auto-ingest')
const FOLDERS_ARG = arg('--folders', '')
const SINCE_HOURS = parseInt(arg('--since-hours', '24'), 10)

const DAY_MS = 24 * 60 * 60 * 1000

interface NewFile {
  folderId: string
  folderName: string
  fileId: string
  fileName: string
  mimeType: string
  size?: number
  modifiedTime: string
  reason: 'new' | 'modified'
  webViewLink?: string
}

async function main() {
  const folders =
    FOLDERS_ARG ||
    process.env.DRIVE_WATCH_FOLDERS ||
    ''
  if (!folders) {
    console.error('❌ --folders 또는 DRIVE_WATCH_FOLDERS 환경변수 필요')
    console.error('  예: --folders 1D_njCi1iOVMh4rHFcWxLErm-TPRTweqU,1LmzpJMIdH-ZdjGipsAJ0nopnwElKIFBN')
    process.exit(1)
  }
  const folderIds = folders.split(',').map((s) => s.trim()).filter(Boolean)

  const { prisma } = await import('../src/lib/prisma')
  const { walkFolder, classifyAsset, GOOGLE_MIME } = await import('../src/lib/drive/client')

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('▶ W30 — Drive Watch (Polling-based)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'PRODUCTION'}`)
  console.log(`Watched folders: ${folderIds.length}`)
  console.log(`Since: ${SINCE_HOURS}h`)
  console.log(`Auto-ingest: ${AUTO_INGEST ? 'YES' : 'NO (job 만 큐잉)'}`)
  console.log('')

  const cutoff = Date.now() - SINCE_HOURS * 60 * 60 * 1000

  // 1. 기존 IngestionJob.metadata.driveFileId 모음 (dedupe)
  const existingJobs = await prisma.ingestionJob.findMany({
    where: {
      kind: { in: ['drive-auto', 'proposal'] },
      uploadedAt: { gte: new Date(Date.now() - 90 * DAY_MS) },
    },
    select: { metadata: true },
  })
  const seenFileIds = new Set<string>()
  const lastModifiedByFileId = new Map<string, string>()
  for (const j of existingJobs) {
    const meta = (j.metadata as Record<string, unknown>) || {}
    const fid = String(meta.driveFileId ?? '')
    if (fid) {
      seenFileIds.add(fid)
      const lm = meta.driveModifiedTime
      if (typeof lm === 'string') lastModifiedByFileId.set(fid, lm)
    }
  }
  console.log(`📦 기존 IngestionJob (Drive): ${seenFileIds.size} 파일 추적 중`)

  // 2. 기존 ContentAsset.sourceRef (Drive ingest 흔적)
  const existingAssets = await prisma.contentAsset.findMany({
    where: { sourceType: 'drive', sourceRef: { not: null } },
    select: { sourceRef: true },
  })
  for (const a of existingAssets) {
    if (a.sourceRef) seenFileIds.add(a.sourceRef)
  }
  console.log(`📦 기존 ContentAsset (Drive sourced): ${existingAssets.length}건`)
  console.log('')

  // 3. 각 폴더 walk
  const newFiles: NewFile[] = []
  for (const folderId of folderIds) {
    console.log(`📡 walking ${folderId}...`)
    try {
      const tree = await walkFolder(folderId, { maxDepth: 4, maxTotal: 500 })
      const folderName = tree.file.name

      // tree 평탄화 — 파일만
      const allFiles: typeof tree.file[] = []
      const stack = [tree]
      while (stack.length) {
        const node = stack.pop()!
        if (!node.file.isFolder) allFiles.push(node.file)
        if (node.children) stack.push(...node.children)
      }
      console.log(`   "${folderName}": ${allFiles.length} 파일`)

      // 각 파일 분류
      for (const f of allFiles) {
        const cls = classifyAsset(f.mimeType, f.name)
        if (cls.category === 'image' || cls.category === 'unknown') continue
        if (f.mimeType === GOOGLE_MIME.folder) continue

        const isNew = !seenFileIds.has(f.id)
        let isModified = false
        if (!isNew && f.modifiedTime) {
          const lastSeen = lastModifiedByFileId.get(f.id)
          if (lastSeen && new Date(f.modifiedTime).getTime() > new Date(lastSeen).getTime()) {
            isModified = true
          }
        }
        if (!isNew && !isModified) continue

        // since 필터
        if (f.modifiedTime) {
          const modMs = new Date(f.modifiedTime).getTime()
          if (modMs < cutoff && isNew) {
            // since 보다 오래된 새 파일은 backfill 으로 분류 (skip — manual ingest 권장)
            continue
          }
        }

        newFiles.push({
          folderId,
          folderName,
          fileId: f.id,
          fileName: f.name,
          mimeType: f.mimeType,
          size: f.size,
          modifiedTime: f.modifiedTime ?? new Date().toISOString(),
          reason: isNew ? 'new' : 'modified',
          webViewLink: f.webViewLink,
        })
      }
    } catch (e) {
      console.error(
        `   ✗ folder ${folderId} fail: ${e instanceof Error ? e.message.slice(0, 100) : String(e)}`,
      )
    }
  }

  console.log('')
  console.log(`📦 신규/수정 파일: ${newFiles.length}`)
  console.log('')

  // 4. sample 출력
  if (newFiles.length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`📋 신규/수정 파일 (top 15)`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    for (const f of newFiles.slice(0, 15)) {
      const icon = f.reason === 'new' ? '🆕' : '✏️'
      const sizeKb = f.size ? `${Math.round(f.size / 1024)}KB` : '?'
      console.log(`  ${icon} [${f.folderName.slice(0, 20)}] ${f.fileName.slice(0, 55)} (${sizeKb})`)
    }
    if (newFiles.length > 15) console.log(`  ... +${newFiles.length - 15} more`)
    console.log('')
  } else {
    console.log('  (신규/수정 파일 없음 — 다음 cron 까지 대기)')
  }

  if (DRY_RUN || newFiles.length === 0) {
    if (DRY_RUN) console.log('✓ dry-run — DB 변경 X')
    await prisma.$disconnect()
    return
  }

  // 5. IngestionJob 큐 생성
  let saved = 0
  for (const f of newFiles) {
    try {
      await prisma.ingestionJob.create({
        data: {
          kind: 'drive-auto',
          sourceUrl: f.webViewLink ?? '',
          status: 'queued',
          uploadedBy: 'cron-w30',
          metadata: {
            driveFileId: f.fileId,
            driveFolderId: f.folderId,
            driveFolderName: f.folderName,
            fileName: f.fileName,
            mimeType: f.mimeType,
            size: f.size,
            driveModifiedTime: f.modifiedTime,
            reason: f.reason,
          },
        },
      })
      saved++
    } catch (e) {
      console.error(
        `  ✗ save fail ${f.fileId}: ${e instanceof Error ? e.message.slice(0, 80) : String(e)}`,
      )
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 Summary')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Folders watched:    ${folderIds.length}`)
  console.log(`New/modified files: ${newFiles.length}`)
  console.log(`Jobs queued:        ${saved}`)
  console.log('')
  console.log('✓ drive-watch cron 완료')
  if (!AUTO_INGEST) {
    console.log('  → 큐된 job 은 admin 검수 후 ingest 또는 --auto-ingest 플래그로 자동 처리')
  }

  await prisma.$disconnect()
  process.exit(0)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : String(e))
  process.exit(1)
})
