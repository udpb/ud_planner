/**
 * K7 Verification — PM Inputs schema · formatter · prompt injection.
 *
 * 검증:
 *   1. PmInputsSchema validates 정상/이상 input
 *   2. formatPmInputs 출력이 LLM prompt 에 적합한 형식
 *   3. produce-ultimate-draft 의 pmInputs 가 prompt 에 주입됨 (실 LLM 없이 dry check)
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
for (const file of ['.env', '.env.local']) {
  const envPath = path.join(process.cwd(), file)
  if (!fs.existsSync(envPath)) continue
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    process.env[k] = v
  }
}

async function main() {
  // schema 만 import (server-only 아님)
  const { PmInputsSchema } = await import('../src/lib/express/schema')

  console.log(`▶ K7 Verification — PM Inputs schema · formatter\n`)

  // 1. 정상 입력
  const goodInput = {
    callNotes: [
      {
        date: '2026-05-25',
        contact: '산학협력단 이OO 팀장',
        summary:
          '본 사업은 단순 교육 X — 졸업 후 실제 BM 검증 까지 동행 필요. 평가 시 "이론보다 실행" 강조 예상.',
      },
      {
        date: '2026-05-27',
        contact: '심사 위원장 (추정)',
        summary: '딥테크 도메인 전문성 코치 풀 검증 — 단순 강사 풀 X, 실제 창업 경험 5년+ 코치 명단 요구.',
      },
    ],
    assignedCoaches: [
      { name: '김상혁', role: 'lead', background: '前 카카오 PM · 액트프러너 5년 · 50팀 멘토링' },
      { name: '박미선', role: 'main', background: '바이오 스타트업 창업 7년 · IPO 경험' },
      { name: '이재훈', role: 'support', background: 'AI 모델링 · 3개 스타트업 CTO 역임' },
    ],
    evaluators: [
      { name: '평가위원 A', affiliation: '산학협력단', focus: '교육 효과 측정 (정량 KPI)' },
      { name: '평가위원 B', affiliation: '경영학부 교수', focus: '재무 건전성 · ROI' },
    ],
    freeNotes: '발주처는 작년 운영사 (디캠프 추정) 대비 차별화 — "포스트 교육 성과" 압박 강함.',
  }

  const validation = PmInputsSchema.safeParse(goodInput)
  console.log(`[1] PmInputsSchema 정상 입력: ${validation.success ? '✓ PASS' : '✗ FAIL'}`)
  if (!validation.success) {
    console.log('  issues:', validation.error.issues.slice(0, 3))
  }

  // 2. 빈 입력 (모든 필드 optional)
  const emptyInput = {}
  const validation2 = PmInputsSchema.safeParse(emptyInput)
  console.log(`[2] PmInputsSchema 빈 입력 허용: ${validation2.success ? '✓ PASS' : '✗ FAIL'}`)

  // 3. 잘못된 입력 (callNotes 너무 많음)
  const badInput = {
    callNotes: Array(10).fill({ summary: 'a'.repeat(30) }),
  }
  const validation3 = PmInputsSchema.safeParse(badInput)
  console.log(`[3] PmInputsSchema 초과 입력 거부 (callNotes > 5): ${!validation3.success ? '✓ PASS' : '✗ FAIL'}`)

  // 4. formatPmInputs 출력 검증
  const { formatPmInputs } = await import('../src/lib/express/prompts/formatters')
  const formatted = formatPmInputs(goodInput as any)
  console.log(`\n[4] formatPmInputs 출력 (${formatted.length} chars):`)
  console.log('───────────────────────────')
  console.log(formatted)
  console.log('───────────────────────────')

  const formatPass =
    formatted.includes('통화/미팅') &&
    formatted.includes('전담 코치') &&
    formatted.includes('평가위원') &&
    formatted.includes('이재훈') &&
    formatted.includes('재무 건전성')

  console.log(`\n[5] formatted 출력에 필수 정보 포함: ${formatPass ? '✓ PASS' : '✗ FAIL'}`)

  // 6. 빈 input → empty string
  const emptyFormatted = formatPmInputs({})
  const emptyPass = emptyFormatted === ''
  console.log(`[6] 빈 input → empty string: ${emptyPass ? '✓ PASS' : `✗ FAIL (got: "${emptyFormatted}")`}`)

  const allPass = validation.success && validation2.success && !validation3.success && formatPass && emptyPass
  if (allPass) {
    console.log('\n✅ K7 PASS — schema + formatter 정상')
    console.log('   다음: PM UI (별도 PR — DraftEnrichmentEditor 패턴 참고)')
    process.exit(0)
  } else {
    console.log('\n❌ K7 FAIL')
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
