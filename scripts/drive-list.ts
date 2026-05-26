/**
 * scripts/drive-list.ts — Google Drive 트리 탐색 CLI
 *
 * ADC 자격 증명 (gcloud auth application-default login) 으로 Drive API 호출.
 * 폴더 트리 출력 + 자산 유형별 카운트.
 *
 * 사용:
 *   # 사전: gcloud auth application-default login --scopes=...drive.readonly
 *
 *   # (a) 본인 My Drive 의 특정 폴더 (또는 'root')
 *   npx tsx scripts/drive-list.ts <folder-id-or-root>
 *
 *   # (b) Shared Drives 목록 (회사 공유 드라이브들)
 *   npx tsx scripts/drive-list.ts --shared-drives
 *
 *   # (c) Shared with me — 본인에게 직접 공유된 파일/폴더 최상위
 *   npx tsx scripts/drive-list.ts --shared-with-me
 *
 *   # (d) 특정 Shared Drive 의 트리 — (b) 에서 얻은 driveId 사용
 *   npx tsx scripts/drive-list.ts <shared-drive-id> --depth 3
 *
 * 옵션:
 *   --depth N        재귀 깊이 (기본 3)
 *   --max N          총 파일 수 제한 (기본 500)
 *   --show-files     파일도 출력 (기본 폴더만)
 *   --json           JSON 으로 출력
 *   --shared-drives  공유 드라이브 목록만 출력 (folder ID 무시)
 *   --shared-with-me Shared with me 최상위 (folder ID 무시)
 *
 * 폴더 ID 찾는 법: Drive 웹에서 폴더 진입 시 URL 끝부분
 *   https://drive.google.com/drive/folders/1abc...xyz  ← 1abc...xyz 가 ID
 *
 * 공유 드라이브 ID 찾는 법:
 *   Drive 좌측 "공유 드라이브" → 드라이브 클릭 → URL 끝부분
 *   또는 --shared-drives 옵션으로 일괄 조회
 */

import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })

import type { DriveTreeNode, DriveFile } from '../src/lib/drive/client'

// Dynamic import (ESM hoisting + heavy module)
let walkFolder: typeof import('../src/lib/drive/client').walkFolder
let classifyAsset: typeof import('../src/lib/drive/client').classifyAsset
let listSharedDrives: typeof import('../src/lib/drive/client').listSharedDrives
let listSharedWithMe: typeof import('../src/lib/drive/client').listSharedWithMe

async function loadHeavy() {
  const mod = await import('../src/lib/drive/client')
  walkFolder = mod.walkFolder
  classifyAsset = mod.classifyAsset
  listSharedDrives = mod.listSharedDrives
  listSharedWithMe = mod.listSharedWithMe
}

// ─────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────

function arg(argv: string[], flag: string, dflt: string): string {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}

// ─────────────────────────────────────────
// Pretty print tree
// ─────────────────────────────────────────

function fileLabel(f: DriveFile): string {
  if (f.isFolder) return `📁 ${f.name}/`
  const cat = classifyAsset(f.mimeType, f.name)
  const icon =
    cat.category === 'proposal-pdf'
      ? '📄'
      : cat.category === 'document'
        ? '📃'
        : cat.category === 'spreadsheet'
          ? '📊'
          : cat.category === 'image'
            ? '🖼️ '
            : '❔'
  const sizeStr = f.size ? ` (${(f.size / 1024).toFixed(0)}KB)` : ''
  return `${icon} ${f.name}${sizeStr}  [${cat.category}]`
}

function printTree(node: DriveTreeNode, indent = ''): void {
  console.log(`${indent}${fileLabel(node.file)}  id=${node.file.id}`)
  if (node.children) {
    for (const child of node.children) {
      printTree(child, indent + '  ')
    }
  }
}

function printTreeFoldersOnly(node: DriveTreeNode, indent = ''): void {
  if (!node.file.isFolder) return
  const childCount = node.children?.length ?? 0
  const fileCount = node.children?.filter((c) => !c.file.isFolder).length ?? 0
  const folderCount = node.children?.filter((c) => c.file.isFolder).length ?? 0
  console.log(
    `${indent}📁 ${node.file.name}/  (${fileCount}개 파일 + ${folderCount}개 하위 폴더, total=${childCount})  id=${node.file.id}`,
  )
  if (node.children) {
    for (const child of node.children) {
      if (child.file.isFolder) printTreeFoldersOnly(child, indent + '  ')
    }
  }
}

// ─────────────────────────────────────────
// Stats
// ─────────────────────────────────────────

interface Stats {
  total: number
  folders: number
  proposalPdf: number
  document: number
  spreadsheet: number
  image: number
  unknown: number
  byMime: Record<string, number>
}

function collectStats(node: DriveTreeNode, stats: Stats): void {
  stats.total++
  if (node.file.isFolder) {
    stats.folders++
  } else {
    const cat = classifyAsset(node.file.mimeType, node.file.name)
    if (cat.category === 'proposal-pdf') stats.proposalPdf++
    else if (cat.category === 'document') stats.document++
    else if (cat.category === 'spreadsheet') stats.spreadsheet++
    else if (cat.category === 'image') stats.image++
    else stats.unknown++

    stats.byMime[node.file.mimeType] = (stats.byMime[node.file.mimeType] ?? 0) + 1
  }
  if (node.children) {
    for (const child of node.children) collectStats(child, stats)
  }
}

// ─────────────────────────────────────────
// main
// ─────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2)
  const showSharedDrives = argv.includes('--shared-drives')
  const showSharedWithMe = argv.includes('--shared-with-me')
  const folderId = argv.find((a) => !a.startsWith('--')) ?? 'root'
  const depth = parseInt(arg(argv, '--depth', '3'), 10)
  const max = parseInt(arg(argv, '--max', '500'), 10)
  const showFiles = argv.includes('--show-files')
  const asJson = argv.includes('--json')

  await loadHeavy()

  // ─────────────────────────────────────────
  // 분기 1: Shared Drives 목록 (회사 공유 드라이브들)
  // ─────────────────────────────────────────
  if (showSharedDrives) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('▶ Shared Drives 목록 (회사 공유 드라이브)')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    const t0 = Date.now()
    const drives = await listSharedDrives({ maxTotal: max })
    console.log(`Total: ${drives.length} shared drives · ${Date.now() - t0}ms`)
    console.log('')
    drives.forEach((d, i) => {
      console.log(`[${i + 1}] ${d.name}`)
      console.log(`     id: ${d.id}`)
      if (d.createdTime) console.log(`     created: ${d.createdTime}`)
      console.log('')
    })
    if (drives.length === 0) {
      console.log('(공유 드라이브 없음 — 본 계정이 어떤 Shared Drive 의 멤버도 아님)')
    } else {
      console.log('💡 특정 드라이브 트리 보려면:')
      console.log(`   npx tsx scripts/drive-list.ts ${drives[0].id} --depth 3`)
    }
    return
  }

  // ─────────────────────────────────────────
  // 분기 2: Shared with me 최상위
  // ─────────────────────────────────────────
  if (showSharedWithMe) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('▶ Shared with me — 본 계정에 공유된 파일/폴더 (최상위)')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    const t0 = Date.now()
    const items = await listSharedWithMe({ maxTotal: max })
    console.log(`Total: ${items.length} items · ${Date.now() - t0}ms`)
    console.log('')
    items.forEach((f, i) => {
      const cat = classifyAsset(f.mimeType, f.name)
      const icon = f.isFolder ? '📁' : cat.category === 'proposal-pdf' ? '📄' : '📃'
      console.log(`[${i + 1}] ${icon} ${f.name}  [${cat.category}]`)
      console.log(`     id: ${f.id}  mime: ${f.mimeType}`)
      console.log('')
    })
    if (items.length === 0) {
      console.log('(공유받은 자산 없음)')
    } else {
      console.log('💡 폴더 트리 보려면:')
      const firstFolder = items.find((f) => f.isFolder)
      if (firstFolder) {
        console.log(`   npx tsx scripts/drive-list.ts ${firstFolder.id} --depth 3`)
      }
    }
    return
  }

  // ─────────────────────────────────────────
  // 분기 3 (기본): 특정 폴더 트리 (My Drive root 또는 Shared Drive ID)
  // ─────────────────────────────────────────

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('▶ Google Drive tree walk')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Folder ID: ${folderId}`)
  console.log(`Depth: ${depth} · max files: ${max} · show files: ${showFiles}`)
  console.log('')
  console.log('⏳ Drive API 호출 중... (큰 폴더는 시간 소요)')
  console.log('')

  const t0 = Date.now()
  const tree = await walkFolder(folderId, { maxDepth: depth, maxTotal: max })
  const elapsedMs = Date.now() - t0

  if (asJson) {
    console.log(JSON.stringify(tree, null, 2))
    return
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`📂 Tree (root: ${tree.file.name})`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  if (showFiles) {
    printTree(tree)
  } else {
    printTreeFoldersOnly(tree)
  }

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 Stats')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const stats: Stats = {
    total: 0,
    folders: 0,
    proposalPdf: 0,
    document: 0,
    spreadsheet: 0,
    image: 0,
    unknown: 0,
    byMime: {},
  }
  collectStats(tree, stats)

  console.log(`Total items: ${stats.total}`)
  console.log(`  📁 folders:        ${stats.folders}`)
  console.log(`  📄 proposal PDF:   ${stats.proposalPdf}`)
  console.log(`  📃 document:       ${stats.document}`)
  console.log(`  📊 spreadsheet:    ${stats.spreadsheet}`)
  console.log(`  🖼️  image:          ${stats.image}`)
  console.log(`  ❔ unknown:        ${stats.unknown}`)
  console.log('')
  console.log('MIME types:')
  const mimeEntries = Object.entries(stats.byMime).sort((a, b) => b[1] - a[1])
  for (const [mime, count] of mimeEntries) {
    console.log(`  ${count.toString().padStart(4)} × ${mime}`)
  }

  console.log('')
  console.log(`✓ 완료 · ${elapsedMs}ms`)
  if (!showFiles && stats.total - stats.folders > 0) {
    console.log('  💡 파일까지 보려면 --show-files 옵션 추가')
  }
}

main()
  .catch((e) => {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error('✗ FAIL')
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    const msg = e instanceof Error ? e.message : String(e)
    console.error(msg)
    // ADC 미설정 안내
    if (/Could not load the default credentials|invalid_grant|UNAUTHENTICATED/i.test(msg)) {
      console.error('')
      console.error('💡 ADC 자격 증명이 없거나 만료. 다음 명령 실행:')
      console.error('   gcloud auth application-default login --scopes=openid,profile,email,https://www.googleapis.com/auth/drive.readonly')
    }
    process.exit(1)
  })
  .finally(() => setTimeout(() => process.exit(0), 100))
