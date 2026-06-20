/**
 * BR-SROI-1 — 헤드리스 검증 (오프라인 PASS + 라이브는 배포 후 메인 실측)
 *
 * 실행:
 *   npx tsx scripts/_test-sroi.ts                 # 오프라인 mock — env 없이 PASS
 *   (env SROI_SERVICE_URL·SERVICE_API_TOKEN 있으면 라이브 fetchCoefficients 1회 추가)
 *
 * 오프라인 검증 (네트워크 없이):
 *   - mapPlanToImpactItems: 설계 사실(코칭/교육)은 derived, 결과 변수(고용·투자)는
 *     목표/PM 입력 없으면 missing 으로 제외(추측 생성 0).
 *   - computePredictedSroi: 카테고리값 = combinedProxyValue × ∏(vars), total=Σ, sroi=total/budget.
 *     budget 0/미상이면 sroi=null. dominantCategory 는 설명용(랭킹 아님).
 *   - graceful: env 없을 때 getServiceConfig()=null, fetchCoefficients()=null,
 *     requestReport()=null — throw 0.
 *   - 하드코딩 수치 0 — src/lib/sroi/*.ts 자기 grep.
 *
 * ⚠️ 라이브 호출은 배포 후 메인이 실측 — 서브가 백그라운드로 돌려 결과 유실 금지.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import type { ProgramPlan } from '@/lib/program-design/plan-types'
import type { CoefficientsResponse, SroiGoal } from '@/lib/sroi/types'
import { mapPlanToImpactItems, resolveCategoryBindings } from '@/lib/sroi/map-plan-to-impact'
import { computePredictedSroi } from '@/lib/sroi/predict'
import { getServiceConfig, fetchCoefficients, requestPrediction } from '@/lib/sroi/client'
import { requestReport } from '@/lib/sroi/predict'

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

const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps

// ─────────────────────────────────────────────────────────────────
// Mock 계수 (오프라인) — 서비스가 내려줄 shape. 값은 임의 mock(코드 산식 검증용).
//   ⚠️ 이건 테스트 픽스처지 lib 코드의 하드코딩이 아니다. lib 은 이 계수를 인자로 받는다.
// ─────────────────────────────────────────────────────────────────

const MOCK_COEFFS: CoefficientsResponse = {
  asOf: '2026-06-20',
  country: 'KR',
  categories: [
    {
      categoryId: 'CAT_EDU',
      categoryName: '교육 제공',
      impactTypeName: '역량 향상',
      formulaVariables: ['participants', 'count'],
      combinedProxyValue: 50_000,
      version: 1,
      effectiveDate: '2026-01-01',
    },
    {
      categoryId: 'CAT_COACH',
      categoryName: '1:1 코칭',
      impactTypeName: '맞춤 지원',
      formulaVariables: ['participants', 'count', 'coachesTrained'],
      combinedProxyValue: 80_000,
      version: 1,
      effectiveDate: '2026-01-01',
    },
    {
      categoryId: 'CAT_EMP',
      categoryName: '신규 고용',
      impactTypeName: '일자리 창출',
      formulaVariables: ['newEmployees'],
      combinedProxyValue: 12_000_000,
      version: 1,
      effectiveDate: '2026-01-01',
    },
  ],
}

// ─────────────────────────────────────────────────────────────────
// Fixture ProgramPlan — T3 회차표(교육 + 코칭 섞임)
// ─────────────────────────────────────────────────────────────────

const PLAN: ProgramPlan = {
  operatingType: 'T3',
  decisionLog: [],
  openGates: [],
  structure: {
    kind: 'sessions',
    sessions: [
      { no: 'W1', title: '킥오프', hours: 3, format: '오프라인', kind: 'milestone', rationale: '' },
      { no: 'W2', title: '이론', hours: 3, format: '온라인', kind: 'theory', rationale: '' },
      { no: 'W3', title: '워크숍', hours: 3, format: '오프라인', kind: 'workshop', rationale: '' },
      { no: 'W4', title: '1:1 코칭', hours: 2, format: '오프라인', kind: 'coaching', rationale: '' },
      { no: 'W5', title: '1:1 코칭', hours: 2, format: '오프라인', kind: 'coaching', rationale: '' },
      { no: 'W6', title: '데모데이', hours: 4, format: '오프라인', kind: 'event', rationale: '' },
    ],
  },
  meta: {
    approvedRuleCount: 0,
    totalRuleCount: 0,
    structureGenerated: true,
    generatedAt: '2026-06-20T00:00:00.000Z',
  },
}

// ─────────────────────────────────────────────────────────────────
// 1. 매핑 — 설계 사실 derived / 결과 변수 missing(추측 0)
// ─────────────────────────────────────────────────────────────────

function testMappingNoInvention(): void {
  console.log('\n── 1. 매핑: 설계 사실=derived · 결과 변수(목표 없음)=missing ──')

  // 목표/PM 입력 없음 → 결과 변수(고용·투자 등)는 전부 missing 이어야(추측 0).
  const bindings = resolveCategoryBindings(MOCK_COEFFS)
  const goalNoOutcome: SroiGoal = { totalParticipants: 30, budget: 100_000_000, categoryBindings: bindings }
  const m1 = mapPlanToImpactItems(PLAN, goalNoOutcome)

  const eduItem = m1.items.find((i) => i.categoryId === 'CAT_EDU')
  const coachItem = m1.items.find((i) => i.categoryId === 'CAT_COACH')
  ok(!!eduItem && eduItem.count === 2, '교육 회차 2건 derived (theory+workshop)')
  ok(!!coachItem && coachItem.count === 2, '코칭 접점 2건 derived')
  ok(eduItem?.participants === 30, '참여 인원 30명 = 목표에서(설계 회차로 추측 안 함)')

  // 결과 변수 카테고리(CAT_EMP)는 목표 없으니 item 0 + assumptions missing.
  const empItem = m1.items.find((i) => i.categoryId === 'CAT_EMP')
  ok(!empItem, '신규 고용 item 없음 (결과 변수 — 목표/PM 입력 없어 제외, 추측 0)')
  ok(
    m1.assumptions.some((a) => a.field === '신규 고용' && a.status === 'missing'),
    '신규 고용 = missing 으로 명시 (PM 입력 필요)',
  )
  ok(
    m1.items.every((i) => i.newEmployees === undefined && i.investmentAmount === undefined),
    '어떤 item 도 결과 변수(newEmployees/investmentAmount)를 추측 생성하지 않음',
  )

  // 목표(kpiTargets)에 고용 명시 → provided 로 item 생성.
  const goalWithKpi: SroiGoal = {
    totalParticipants: 30,
    budget: 100_000_000,
    categoryBindings: bindings,
    kpiTargets: [{ metric: '신규 고용 인원', targetValue: 7, unit: '명', raw: '7명 이상' }],
  }
  const m2 = mapPlanToImpactItems(PLAN, goalWithKpi)
  const empItem2 = m2.items.find((i) => i.categoryId === 'CAT_EMP')
  ok(!!empItem2 && empItem2.newEmployees === 7, '고용 KPI 명시 시 newEmployees=7 provided')
  ok(
    m2.assumptions.some((a) => a.field === '신규 고용' && a.status === 'provided'),
    '고용 = provided(클라이언트 KPI 목표에서) 로 표기',
  )
}

// ─────────────────────────────────────────────────────────────────
// 2. 산식 — 분해 = proxy × ∏(vars), total=Σ, sroi=total/budget
// ─────────────────────────────────────────────────────────────────

function testFormula(): void {
  console.log('\n── 2. 산식: 분해·total·sroi ──')

  const bindings = resolveCategoryBindings(MOCK_COEFFS)
  const goal: SroiGoal = {
    totalParticipants: 30,
    budget: 100_000_000,
    categoryBindings: bindings,
    kpiTargets: [{ metric: '신규 고용', targetValue: 7, unit: '명', raw: '' }],
  }
  const { items, assumptions } = mapPlanToImpactItems(PLAN, goal)
  const r = computePredictedSroi(MOCK_COEFFS, items, goal.budget, assumptions)

  // CAT_EDU: 50_000 × participants(30) × count(2)
  const edu = r.breakdown.find((b) => b.categoryId === 'CAT_EDU')
  ok(!!edu && approx(edu.value, 50_000 * 30 * 2), 'CAT_EDU 값 = proxy × participants × count')
  // CAT_COACH: 80_000 × 30 × 2 (coachesTrained 없으니 곱에서 제외) = 4_800_000
  const coach = r.breakdown.find((b) => b.categoryId === 'CAT_COACH')
  ok(
    !!coach && approx(coach.value, 80_000 * 30 * 2),
    'CAT_COACH 값 = proxy × participants × count (없는 변수 coachesTrained 는 곱 제외)',
  )
  // CAT_EMP: 12_000_000 × 7 = 84_000_000
  const emp = r.breakdown.find((b) => b.categoryId === 'CAT_EMP')
  ok(!!emp && approx(emp.value, 12_000_000 * 7), 'CAT_EMP 값 = proxy × newEmployees(목표)')

  const expectedTotal = 50_000 * 30 * 2 + 80_000 * 30 * 2 + 12_000_000 * 7
  ok(approx(r.totalSocialValue, expectedTotal), 'totalSocialValue = Σ 카테고리값')
  ok(r.sroi !== null && approx(r.sroi, expectedTotal / 100_000_000), 'sroi = total / budget')

  // budget 미상 → sroi null (부분 예측 — 분해만)
  const rNoBudget = computePredictedSroi(MOCK_COEFFS, items, undefined, assumptions)
  ok(rNoBudget.sroi === null, 'budget 없으면 sroi = null (부분 예측 — 분해만 본다)')

  // 렌즈 프레이밍 — note 에 "높을수록 좋은 게 아니다" 류 + dominant 설명용.
  ok(
    /렌즈|분해와 가정/.test(r.lens.note),
    'lens.note = "SROI는 비율 — 분해와 가정을 함께 보라" (랭킹 프레이밍 아님)',
  )
  ok(r.lens.dominantCategory === '신규 고용', 'dominantCategory=최대 기여처(설명용, 더 좋음 아님)')
  ok(r.assumptions.length > 0, 'assumptions 동반 (예측은 가정 위에 선다)')
}

// ─────────────────────────────────────────────────────────────────
// 3. graceful — env 없을 때 null, throw 0
// ─────────────────────────────────────────────────────────────────

async function testGraceful(): Promise<void> {
  console.log('\n── 3. graceful: env 없으면 null, throw 0 ──')

  const hasToken = !!process.env.SERVICE_API_TOKEN
  if (hasToken) {
    console.log('     (SERVICE_API_TOKEN 설정됨 — getServiceConfig null 검증은 스킵)')
    ok(getServiceConfig() !== null, 'env 있을 때 getServiceConfig() 정상 config 반환')
  } else {
    ok(getServiceConfig() === null, 'SERVICE_API_TOKEN 없으면 getServiceConfig()=null')
    let threw = false
    let coeffNull = false
    let reportNull = false
    try {
      coeffNull = (await fetchCoefficients('KR')) === null
      reportNull = (await requestReport(PLAN, { totalParticipants: 30 })) === null
      const predNull = (await requestPrediction({ externalProjectId: 'x', title: 't', items: [] })) === null
      ok(predNull, 'env 없을 때 requestPrediction()=null (throw 0)')
    } catch {
      threw = true
    }
    ok(!threw, 'env 없을 때 라이브 호출이 throw 하지 않음 (앱이 안 죽음)')
    ok(coeffNull, 'env 없을 때 fetchCoefficients()=null')
    ok(reportNull, 'env 없을 때 requestReport()=null')
  }
}

// ─────────────────────────────────────────────────────────────────
// 4. 하드코딩 수치 0 — 자기 grep
// ─────────────────────────────────────────────────────────────────

async function testNoHardcodedNumbers(): Promise<void> {
  console.log('\n── 4. 하드코딩 수치/categoryId 0 (자기 grep) ──')

  const targets = [
    'src/lib/sroi/types.ts',
    'src/lib/sroi/client.ts',
    'src/lib/sroi/map-plan-to-impact.ts',
    'src/lib/sroi/predict.ts',
  ]

  // 금지: proxy/사회가치/계수/SROI 비율을 코드에 박은 듯한 수치.
  // 타임아웃(8_000)·백분율 0 같은 인프라 상수는 산식 하드코딩이 아니므로 별도 허용.
  // 패턴: proxy/계수/사회가치/임팩트값/sroi 와 같은 줄에 큰 수치 리터럴.
  const SUSPECT =
    /(proxy|계수|사회가치|임팩트\s*값|combinedProxy|socialValue|coefficient)\D{0,20}(\d{3,}|\d\.\d)/i

  for (const rel of targets) {
    const abs = path.join(process.cwd(), rel)
    const src = await fs.readFile(abs, 'utf8')
    const lines = src.split('\n')
    const hits: string[] = []
    lines.forEach((line, i) => {
      const trimmed = line.trim()
      if (
        trimmed.startsWith('*') ||
        trimmed.startsWith('//') ||
        trimmed.startsWith('/*') ||
        trimmed.startsWith('/**')
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
}

// ─────────────────────────────────────────────────────────────────
// 5. (옵션) 라이브 fetchCoefficients — env 있을 때만 (배포 후 메인 실측)
// ─────────────────────────────────────────────────────────────────

async function testLive(): Promise<void> {
  console.log('\n── 5. 라이브 fetchCoefficients (env 있을 때만) ──')
  if (!process.env.SERVICE_API_TOKEN) {
    console.log('     SKIP — SERVICE_API_TOKEN 미설정. 배포 후 메인이 실측 요망:')
    console.log('     SROI_SERVICE_URL=... SERVICE_API_TOKEN=... npx tsx scripts/_test-sroi.ts')
    return
  }
  const coeffs = await fetchCoefficients('KR')
  if (coeffs === null) {
    console.log('     ⚠️ 라이브 fetchCoefficients = null (서비스 미배포/4xx-5xx — graceful). 메인 확인 요망.')
    return
  }
  ok(Array.isArray(coeffs.categories), '라이브 계수 categories 배열 수신')
  console.log(`     라이브 계수 ${coeffs.categories.length} 카테고리 (asOf=${coeffs.asOf})`)
}

// ─────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('═══ BR-SROI-1 SROI 클라이언트 — 헤드리스 검증 ═══')

  testMappingNoInvention()
  testFormula()
  await testGraceful()
  await testNoHardcodedNumbers()
  await testLive()

  console.log(`\n═══ 결과: ${pass} PASS / ${fail} FAIL ═══`)
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
