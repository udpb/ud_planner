/**
 * §간 내러티브 연결 점검 — coherencePass 단독 실행.
 * 리스트로 시작하는 섹션(§3 커리큘럼)에 산문 도입 1문장이 추가되는지 검증.
 * server-only 우회: node --conditions=react-server 로 실행.
 */
import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })

import * as fs from 'node:fs'
import * as path from 'node:path'

async function main() {
  const { coherencePass } = await import('../src/lib/express/coherence-pass')
  const draftPath = path.join(
    process.cwd(),
    'src/app/(dashboard)/slide-preview-test/real/generated-draft.json',
  )
  const draft = JSON.parse(fs.readFileSync(draftPath, 'utf-8'))

  // 시작이 리스트 마커인지 — 모든 대안을 ^\s* 로 앵커 (STEP 항목이 본문 뒤에 있어도 오탐 X)
  const startsWithListRe = /^\s*(?:[❍•\-*]|\[STEP|\d+[.)])/
  const s3before = (draft.sections?.['3'] || '').trim()
  console.log('▶ coherencePass — §간 내러티브 점검')
  console.log(`  §3 [BEFORE] 첫 40자: ${s3before.slice(0, 40)}`)
  const startsWithList = startsWithListRe.test(s3before)
  console.log(`  §3 BEFORE 리스트 시작: ${startsWithList ? '예 (개선 대상)' : '아니오'}`)

  const { updatedSections, result } = await coherencePass({
    draft,
    projectName: '2025 창업중심대학 GTM 프로그램',
  })

  const s3after = (updatedSections['3'] || '').trim()
  console.log(`\n  §3 [AFTER]  첫 80자: ${s3after.slice(0, 80)}`)
  const afterStartsWithList = startsWithListRe.test(s3after)
  console.log(`  §3 AFTER 리스트 시작: ${afterStartsWithList ? '⚠ 여전히 리스트' : '✓ 산문 도입 추가됨'}`)
  console.log(`\n  reasoning: ${result.reasoning || '(없음)'}`)

  // 본문 보존 확인 — STEP 항목·source 인용 유지
  const stepsPreserved = (s3after.match(/STEP \d/g) || []).length
  const sourcePreserved = (s3after.match(/\[source:/g) || []).length
  console.log(`  STEP 항목 보존: ${stepsPreserved}개 / source 인용 보존: ${sourcePreserved}개`)

  const pass = !afterStartsWithList && stepsPreserved >= 2
  console.log(`\n${pass ? '✅ PASS — 산문 도입 추가 + 리스트 보존' : '❌ FAIL'}`)
  process.exitCode = pass ? 0 : 1
}
main().catch((e) => { console.error('FATAL:', e); process.exitCode = 1 })
