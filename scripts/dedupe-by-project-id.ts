/**
 * scripts/dedupe-by-project-id.ts — 같은 사업 ID 가진 중복 WinningPattern 정리
 *
 * sourceProject 의 prefix (예: "A.25.0058") 가 같으면 동일 사업의 중복.
 * 정책:
 *   1. sheet ingest 우선 keep (sourceRef 가 'sheet-row-' 시작)
 *   2. sheet 가 없으면 contentRefs 많은 것 keep
 *   3. 같으면 더 짧은 sourceProject (메타 더 정확) keep
 *   4. 나머지 삭제 (WinningPattern + 연결된 ContentAsset cascade)
 *
 * 사용:
 *   # scan 만 (삭제 안 함)
 *   npx tsx scripts/dedupe-by-project-id.ts --dry-run
 *
 *   # 실제 정리
 *   npx tsx scripts/dedupe-by-project-id.ts
 */

import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })

const DRY_RUN = process.argv.includes('--dry-run')

interface PatternRow {
  id: string
  sourceProject: string
  contentRefs: string[]
  createdAt: Date
}

/**
 * sourceProject 에서 사업 ID prefix 추출.
 * 예: "A.25.0058 사업제안서(PDF) 대전대학교 AI활용 창업프로그램" → "A.25.0058"
 * 예: "A.25 (1).0047 ..." → "A.25(1).0047"
 */
function extractProjectId(sourceProject: string): string | null {
  const m = sourceProject.match(/^([A-Z]\.\d{2}(?:\s*\(\d+\))?\.\d{4})/)
  if (!m) return null
  return m[1].replace(/\s+/g, '')
}

/**
 * "파일명 접미사" 가 있는가 (archive ingest 흔적).
 * 예: "사업제안서(PDF)" / ".pdf" / "_PDF" 등이 sourceProject 안에 있으면 archive 일 가능성 높음.
 */
function hasFileNameSuffix(sourceProject: string): boolean {
  return /사업\s*제안서|\.pdf$|\.pptx?$|\.docx?$|\(PDF\)|\(PPT\)|_PDF|_PPT/i.test(sourceProject)
}

/**
 * 정책: contentRefs 많고, sourceProject 가 깔끔 (파일명 접미사 X) 한 게 keep.
 * 같으면 최근 createdAt.
 */
function pickWinner(patterns: PatternRow[]): PatternRow {
  const scored = patterns.map((p) => ({
    pattern: p,
    score: 0
      + (hasFileNameSuffix(p.sourceProject) ? 0 : 100) // 깔끔한 메타 우선
      + p.contentRefs.length * 5 // 자산 많은 게 좋음
      - p.sourceProject.length * 0.1, // 짧은 sourceProject 약간 우선
  }))
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return b.pattern.createdAt.getTime() - a.pattern.createdAt.getTime()
  })
  return scored[0].pattern
}

async function main() {
  const { prisma } = await import('../src/lib/prisma')

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`▶ Dedupe by project ID  (${DRY_RUN ? 'DRY-RUN' : 'PRODUCTION'})`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const allPatterns = await prisma.winningPattern.findMany({
    select: {
      id: true,
      sourceProject: true,
      contentRefs: true,
      createdAt: true,
    },
  }) as PatternRow[]

  console.log(`전체 WinningPattern: ${allPatterns.length}건`)

  // 1. project ID 추출 + 그룹핑
  const groups = new Map<string, PatternRow[]>()
  const noIdCount: PatternRow[] = []
  for (const p of allPatterns) {
    const pid = extractProjectId(p.sourceProject)
    if (!pid) {
      noIdCount.push(p)
      continue
    }
    if (!groups.has(pid)) groups.set(pid, [])
    groups.get(pid)!.push(p)
  }
  console.log(`프로젝트 ID 추출: ${allPatterns.length - noIdCount.length}건`)
  console.log(`ID 추출 실패 (정리 대상 X): ${noIdCount.length}건`)

  // 2. 중복 (2+ 패턴) 만
  const dupes = Array.from(groups.entries())
    .filter(([_, ps]) => ps.length > 1)
    .sort((a, b) => b[1].length - a[1].length)

  console.log(`\n중복 그룹: ${dupes.length}개 (총 ${dupes.reduce((s, [_, ps]) => s + ps.length, 0)}건)`)
  console.log('')

  if (dupes.length === 0) {
    console.log('✓ 중복 없음')
    await prisma.$disconnect()
    return
  }

  // 3. 출력 + 결정
  const toDelete: PatternRow[] = []
  for (const [pid, ps] of dupes) {
    const winner = pickWinner(ps)
    console.log(`[${pid}] ${ps.length} patterns`)
    for (const p of ps) {
      const mark = p.id === winner.id ? '✓ KEEP   ' : '✗ DELETE '
      const tag = hasFileNameSuffix(p.sourceProject) ? 'archive' : 'clean  '
      const dateStr = p.createdAt.toISOString().slice(0, 16).replace('T', ' ')
      console.log(`  ${mark} ${p.id}  ${tag}  refs=${String(p.contentRefs.length).padStart(2)}  ${dateStr}  | ${p.sourceProject.slice(0, 60)}`)
      if (p.id !== winner.id) toDelete.push(p)
    }
    console.log('')
  }

  // 4. 실행
  if (toDelete.length === 0) {
    console.log('✓ 삭제 대상 없음')
    await prisma.$disconnect()
    return
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`📊 정리 plan`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`WinningPattern 삭제: ${toDelete.length}건`)
  const totalAssetRefs = toDelete.reduce((s, p) => s + p.contentRefs.length, 0)
  console.log(`연결된 ContentAsset (총): ${totalAssetRefs}건 (실제 삭제는 다른 패턴이 안 쓰는 것만)`)
  console.log('')

  if (DRY_RUN) {
    console.log('✓ dry-run — DB 변경 X')
    await prisma.$disconnect()
    return
  }

  // 안전: 다른 패턴이 같은 ContentAsset 을 reference 하면 그 자산은 keep
  // 단순화를 위해 winner 의 contentRefs 와 비교
  for (const p of toDelete) {
    // 이 패턴만 reference 하는 자산만 삭제
    if (p.contentRefs.length > 0) {
      // 다른 패턴들이 reference 하는 자산은 빼고
      const otherRefs = new Set<string>()
      for (const other of allPatterns) {
        if (other.id === p.id) continue
        other.contentRefs.forEach((r) => otherRefs.add(r))
      }
      const safeToDelete = p.contentRefs.filter((r) => !otherRefs.has(r))
      if (safeToDelete.length > 0) {
        const del = await prisma.contentAsset.deleteMany({ where: { id: { in: safeToDelete } } })
        console.log(`  🗑  [${p.id}] ContentAsset ${del.count}건 삭제 (${p.contentRefs.length - del.count}건은 공유라 keep)`)
      }
    }
    await prisma.winningPattern.delete({ where: { id: p.id } })
    console.log(`  🗑  [${p.id}] WinningPattern 삭제`)
  }

  console.log('')
  console.log('✓ dedupe 완료')
  await prisma.$disconnect()
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.stack : String(e))
    process.exit(1)
  })
  .finally(() => setTimeout(() => process.exit(0), 200))
