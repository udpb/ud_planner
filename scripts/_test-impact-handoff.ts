/**
 * BR-IMPACT-1 — 핸드오프 헤드리스 검증 (오프라인 PASS · 라이브는 배포+토큰 후 메인 실측)
 *
 * 실행:
 *   npx tsx scripts/_test-impact-handoff.ts
 *
 * 오프라인 검증 (네트워크 없이):
 *   - forecastItemsToPredictItems: forecast itemsJson(ForecastItemWithMeta[]) → PredictItem[]
 *     매핑 정확. null/0 필드 제외. 결과변수(고용·투자) 추측 생성 0 — forecast 에 있는 값만.
 *   - graceful: SERVICE_API_TOKEN 없으면 isHandoffConfigured()=false.
 *   - 하드코딩 수치 0 — src/lib/impact/handoff.ts 자기 grep.
 *
 * ⚠️ requestOfficialReport 의 라이브 POST 는 배포+토큰 후 메인이 실측 — 서브가 백그라운드로
 *    돌려 결과 유실 금지. 본 스크립트는 prisma/네트워크를 건드리는 호출을 하지 않는다(매핑·grep만).
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

import type { ForecastItemWithMeta } from '@/lib/impact/types'

// 'server-only' 가드 스텁 — tsx 는 client 로 보고 throw 하므로 require.cache 선점
//   (repo 표준 패턴: scripts/_smoke-author.ts). handoff.ts 는 server-only(+prisma) 라
//   값 import 는 이 스텁 이후 동적으로 한다.
const require = createRequire(import.meta.url)
try {
  const soPath = require.resolve('server-only')
  require.cache[soPath] = {
    id: soPath,
    filename: soPath,
    loaded: true,
    exports: {},
  } as never
} catch {
  /* ignore */
}

// ─────────────────────────────────────────────────────────────────
// 미니 어서션
// ─────────────────────────────────────────────────────────────────

let pass = 0
let fail = 0
const failures: string[] = []

function ok(cond: boolean, label: string): void {
  if (cond) {
    pass++
    console.log(`  ✅ ${label}`)
  } else {
    fail++
    failures.push(label)
    console.log(`  ❌ ${label}`)
  }
}

// server-only 스텁 이후 동적 import (정적 import 하면 스텁 전에 평가됨)
type HandoffMod = typeof import('@/lib/impact/handoff')
let handoff: HandoffMod

// ─────────────────────────────────────────────────────────────────
// Fixture — forecast itemsJson (ForecastItemWithMeta[]).
//   ⚠️ 테스트 픽스처지 lib 코드의 하드코딩이 아니다. lib 은 이 값을 인자로 받는다.
//   결과변수(newEmployees)는 여기 forecast 안에 이미 있는 값만 — 매핑이 추측 생성 안 함을 보임.
// ─────────────────────────────────────────────────────────────────

const FORECAST_ITEMS: ForecastItemWithMeta[] = [
  {
    categoryId: 'CAT_EDU',
    itemName: '부트캠프',
    count: 8,
    hours: null,
    participants: 30,
    days: null,
    months: null,
    revenue: null,
    newEmployees: null,
    investmentAmount: null,
    bizFund: null,
    coachesTrained: null,
    eventParticipants: null,
    spaceArea: null,
    spaceDuration: null,
    confidence: 'derived',
    rationale: '커리큘럼 8주 × 30명',
    categoryName: '교육 제공',
    impactTypeName: '역량 향상',
  },
  {
    categoryId: 'CAT_COACH',
    itemName: '1:1 코칭',
    count: 4,
    hours: null,
    participants: 30,
    days: null,
    months: null,
    revenue: null,
    newEmployees: null,
    investmentAmount: null,
    bizFund: null,
    coachesTrained: 0, // 0 → 제외되어야(곱 의미 없음)
    eventParticipants: null,
    spaceArea: null,
    spaceDuration: null,
    confidence: 'derived',
    rationale: '코칭 4회',
  },
  {
    categoryId: 'CAT_EMP',
    itemName: '신규 고용',
    count: null,
    hours: null,
    participants: null,
    days: null,
    months: null,
    revenue: null,
    newEmployees: 7, // forecast 가 이미 보유한 결과변수 — 매핑은 그대로 옮기기만
    investmentAmount: null,
    bizFund: null,
    coachesTrained: null,
    eventParticipants: null,
    spaceArea: null,
    spaceDuration: null,
    confidence: 'estimated',
    rationale: 'KPI 목표 7명 (보수 0.7×)',
  },
]

// ─────────────────────────────────────────────────────────────────
// 1. 매핑: forecast items → predict items 정확 (추측 생성 0)
// ─────────────────────────────────────────────────────────────────

function testMapping(): void {
  console.log('\n── 1. 매핑: forecast itemsJson → PredictItem[] ──')
  const items = handoff.forecastItemsToPredictItems(FORECAST_ITEMS)

  ok(items.length === 3, '항목 3건 모두 매핑(개수 보존)')

  const edu = items.find((i) => i.categoryId === 'CAT_EDU')
  ok(!!edu && edu.count === 8 && edu.participants === 30, 'CAT_EDU: count=8 · participants=30 (값 보존)')
  ok(!!edu && !('hours' in edu) && !('newEmployees' in edu), 'CAT_EDU: null 필드(hours·newEmployees 등) 전부 제외')

  const coach = items.find((i) => i.categoryId === 'CAT_COACH')
  ok(!!coach && coach.count === 4 && coach.participants === 30, 'CAT_COACH: count=4 · participants=30')
  ok(!!coach && !('coachesTrained' in coach), 'CAT_COACH: coachesTrained=0 은 제외(0 곱 의미 없음)')

  const emp = items.find((i) => i.categoryId === 'CAT_EMP')
  ok(!!emp && emp.newEmployees === 7, 'CAT_EMP: newEmployees=7 (forecast 보유값 그대로 — 추측 생성 0)')
  ok(
    items.every((i) => Object.keys(i).every((k) => k === 'categoryId' || typeof (i as Record<string, unknown>)[k] === 'number')),
    '모든 항목: categoryId 외 필드는 전부 number (confidence/rationale 같은 메타 전달 안 함)',
  )

  // 빈 forecast → 빈 items (throw 0)
  ok(handoff.forecastItemsToPredictItems([]).length === 0, '빈 forecast items → 빈 PredictItem[] (throw 0)')
}

// ─────────────────────────────────────────────────────────────────
// 2. graceful: env 없으면 isHandoffConfigured()=false
// ─────────────────────────────────────────────────────────────────

function testGraceful(): void {
  console.log('\n── 2. graceful: env 없으면 핸드오프 비활성 ──')
  const hasToken = !!process.env.SERVICE_API_TOKEN?.trim()
  if (hasToken) {
    console.log('     (SERVICE_API_TOKEN 설정됨 — isHandoffConfigured=true 검증)')
    ok(handoff.isHandoffConfigured() === true, 'env 있을 때 isHandoffConfigured()=true')
  } else {
    ok(handoff.isHandoffConfigured() === false, 'SERVICE_API_TOKEN 없으면 isHandoffConfigured()=false (graceful 안내 분기)')
  }
}

// ─────────────────────────────────────────────────────────────────
// 3. 하드코딩 수치 0 — 자기 grep
// ─────────────────────────────────────────────────────────────────

async function testNoHardcodedNumbers(): Promise<void> {
  console.log('\n── 3. 하드코딩 proxy/계수/사회가치 수치 0 (자기 grep) ──')

  const rel = 'src/lib/impact/handoff.ts'
  const abs = path.join(process.cwd(), rel)
  const src = await fs.readFile(abs, 'utf8')
  const lines = src.split('\n')

  // 금지: proxy/사회가치/계수/SROI 비율을 코드에 박은 듯한 수치.
  // 타임아웃(8_000)·HTTP status(200·4xx)·slice(200) 같은 인프라 상수는 산식 하드코딩이 아님 → 별도.
  const SUSPECT =
    /(proxy|계수|사회가치|combinedProxy|socialValue|coefficient)\D{0,20}(\d{3,}|\d\.\d)/i

  const hits: string[] = []
  lines.forEach((line, i) => {
    const trimmed = line.trim()
    if (
      trimmed.startsWith('*') ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('/*')
    ) {
      return
    }
    if (SUSPECT.test(line)) hits.push(`L${i + 1}: ${trimmed.slice(0, 80)}`)
  })
  if (hits.length > 0) {
    console.log(`     ⚠️ ${rel} 의심 라인:`)
    hits.forEach((h) => console.log(`        ${h}`))
  }
  ok(hits.length === 0, `${rel} — proxy/사회가치/계수 수치 하드코딩 0`)
}

// ─────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('═══ BR-IMPACT-1 임팩트 핸드오프 — 헤드리스 검증 ═══')

  // 동적 import (server-only 스텁 이후)
  handoff = await import('@/lib/impact/handoff')

  testMapping()
  testGraceful()
  await testNoHardcodedNumbers()

  console.log(`\n═══ 결과: ${pass} PASS / ${fail} FAIL ═══`)
  console.log(
    '\nⓘ requestOfficialReport 의 라이브 POST 는 배포+토큰 후 메인이 실측:',
  )
  console.log(
    '   SROI_SERVICE_URL=... SERVICE_API_TOKEN=... (앱에서 "공식 리포트 생성" 버튼)',
  )
  if (fail > 0) {
    console.log('실패 항목:')
    failures.forEach((f) => console.log(`  - ${f}`))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('테스트 크래시:', e)
  process.exit(1)
})
