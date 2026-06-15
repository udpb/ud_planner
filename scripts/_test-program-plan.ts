/**
 * BR-3a — 헤드리스 검증 (결정론 PASS + LLM 조립 단계 분리)
 *
 * 실행:
 *   npx tsx scripts/_test-program-plan.ts            # 결정론(resolvePlan)만 — LLM 없이 PASS
 *   FULL_LLM=true npx tsx scripts/_test-program-plan.ts   # + planProgram E2E (메인이 키로)
 *
 * 결정론 검증 항목 (LLM 없이):
 *   - 3 fixture 운영유형 판별: A 청년→T3 / B 소상공인→T4(structure 비회차) / C 임직원→T5
 *   - B 시나리오 structure.kind !== 'sessions' (회차표 강요 안 함)
 *   - 결정마다 source·근거(evidence.source) 존재
 *   - 하드코딩 매직넘버 0 — resolve-rules.ts / generate-plan.ts / plan-types.ts 자기 grep
 *   - approved 0건 graceful (크래시 없이 게이트), 일부 승인 시 자동 비율 증가
 *
 * ⚠️ LLM E2E 는 FULL_LLM=true 일 때만 (서브 에이전트 백그라운드로 돌리지 말 것 — 결과 유실).
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import type { RfpParsed } from '@/lib/ai/parse-rfp'
import { loadDesignRules } from '@/lib/program-design/design-rule'
import type { DesignRule } from '@/lib/program-design/design-rule'
import { resolvePlan } from '@/lib/program-design/resolve-rules'
import type { OperatingType, PlanInput, ResolveResult } from '@/lib/program-design/plan-types'
import { usesSessionTable } from '@/lib/program-design/plan-types'

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

// ─────────────────────────────────────────────────────────────────
// Fixtures — v1.2 §09 A/B/C 시나리오 대응
// ─────────────────────────────────────────────────────────────────

function rfp(partial: Partial<RfpParsed>): RfpParsed {
  return {
    projectName: '',
    client: '',
    totalBudgetVat: null,
    supplyPrice: null,
    projectStartDate: null,
    projectEndDate: null,
    eduStartDate: null,
    eduEndDate: null,
    targetAudience: '',
    targetCount: null,
    targetStage: [],
    objectives: [],
    deliverables: [],
    evalCriteria: [],
    constraints: [],
    requiredPersonnel: [],
    keywords: [],
    projectType: 'B2G',
    region: '',
    summary: '',
    detectedTasks: [],
    ...partial,
  }
}

/** A — 지자체 청년 예비창업 (→ T3 장기 여정형). 신호로는 모호 → 담당자 의도로 확정. */
const FIXTURE_A: PlanInput = {
  rfp: {
    parsed: rfp({
      projectName: '○○시 청년 예비창업 육성',
      client: '○○시',
      targetAudience: '만 19~39세 청년 예비창업가',
      targetCount: 30,
      targetStage: ['예비창업'],
      objectives: ['창업 7건 이상', '첫 매출 발생 사례 확보'],
      keywords: ['청년', '예비창업', '데모데이'],
      summary: '5개월 동행형 청년 예비창업 육성 — 킥오프·퀘스트·발표 조합.',
    }),
  },
  // 담당자가 장기 여정형으로 운영하기로 함 (선례·의도 1순위).
  intent: { summary: '작년처럼 킥오프 길게 + 퀘스트 정기 + 데모데이로', decisions: { operatingType: 'T3' } },
}

/** B — 소상공인 매출 성장 (→ T4 개별 밀착형, 회차표 없음). RFP 신호로 자동. */
const FIXTURE_B: PlanInput = {
  rfp: {
    parsed: rfp({
      projectName: '전통시장 소상공인 매출 성장 지원',
      client: '○○구',
      targetAudience: '전통시장 상인 20개 점포',
      targetCount: 20,
      objectives: ['점포당 매출 +20%'],
      keywords: ['소상공인', '전통시장', '점포'],
      summary: '8개월 개별 밀착 소상공인 매출 성장 지원.',
    }),
  },
}

/** C — 대기업 사내벤처 발굴 (→ T5 행사? 아니다 — 임직원 컴팩트). 의도로 운영유형 확정. */
const FIXTURE_C: PlanInput = {
  rfp: {
    parsed: rfp({
      projectName: '대기업 사내벤처 발굴',
      client: '○○㈜',
      targetAudience: '임직원 12팀',
      objectives: ['경영진 승인 가능한 신사업 3건'],
      keywords: ['임직원', '사내벤처'],
      summary: '3개월 컴팩트 임직원 사내벤처 발굴 — 짧고 굵게.',
    }),
  },
  // 임직원 컴팩트 — 소수 회차. 운영 유형은 사람이 확정(여기선 T1 정규 소수회차 또는 T5).
  // 브리프 표기: "C → T5/컴팩트". 임직원은 캠프·여정 0건이라 T5(행사형) 또는 정규 소수.
  // 여기서는 발주 의도가 "행사형 데모데이 중심"이라 가정 → T5.
  intent: { summary: '경영진 보고회·피칭 행사 중심, 워크숍 2회만', decisions: { operatingType: 'T5' } },
}

// ─────────────────────────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────────────────────────

/** 결정 로그가 모두 source·evidence.source 를 갖는가? */
function everyDecisionHasProvenance(res: ResolveResult): boolean {
  return res.decided.every(
    (d) => !!d.source && !!d.evidence?.source && !!d.rationale,
  )
}

/** 운영유형이 기대값인지. */
function operatingTypeIs(res: ResolveResult, expected: OperatingType): boolean {
  return res.operatingType === expected
}

// ─────────────────────────────────────────────────────────────────
// 1. 운영유형 판별 (결정론, approved 일부 가정)
// ─────────────────────────────────────────────────────────────────

async function testOperatingTypeResolution(approvedRules: DesignRule[]): Promise<void> {
  console.log('\n── 1. 운영유형 판별 (3 fixture) ──')

  const rA = resolvePlan(FIXTURE_A, approvedRules)
  ok(operatingTypeIs(rA, 'T3'), 'A 청년 예비창업 → T3 (담당자 의도 1순위)')
  ok(
    rA.decided.some((d) => d.axis === 'operatingType' && d.source === 'intent'),
    'A 운영유형 출처 = intent (선례·의도 우선)',
  )

  const rB = resolvePlan(FIXTURE_B, approvedRules)
  ok(operatingTypeIs(rB, 'T4'), 'B 소상공인 → T4 (RFP 신호 자동 판별)')
  ok(!usesSessionTable('T4'), 'B 의 T4 는 회차표를 쓰지 않는 유형 (structure.kind !== sessions)')
  ok(
    rB.decided.some((d) => d.axis === 'operatingType' && d.source === 'rfp'),
    'B 운영유형 출처 = rfp (자동 판별 신호)',
  )

  const rC = resolvePlan(FIXTURE_C, approvedRules)
  ok(operatingTypeIs(rC, 'T5'), 'C 임직원 컴팩트 → T5 (담당자 의도, 행사형)')
  ok(!usesSessionTable('T5'), 'C 의 T5 는 회차표를 쓰지 않는 유형')

  console.log('\n  결정 출처·근거 점검:')
  ok(everyDecisionHasProvenance(rA), 'A — 모든 결정에 source·evidence·rationale 존재')
  ok(everyDecisionHasProvenance(rB), 'B — 모든 결정에 source·evidence·rationale 존재')
  ok(everyDecisionHasProvenance(rC), 'C — 모든 결정에 source·evidence·rationale 존재')
}

// ─────────────────────────────────────────────────────────────────
// 2. approved 0건 graceful + 자동 비율 증가
// ─────────────────────────────────────────────────────────────────

async function testGraceful(allRules: DesignRule[]): Promise<void> {
  console.log('\n── 2. approved 0건 graceful → 일부 승인 시 자동 증가 ──')

  // (a) approved 0건 — 크래시 없이 동작해야.
  let zeroRes: ResolveResult | null = null
  try {
    zeroRes = resolvePlan(FIXTURE_B, [])
    ok(true, 'approved 0건 — resolvePlan 크래시 없음 (graceful)')
  } catch (e) {
    ok(false, `approved 0건 — 크래시 발생: ${String(e)}`)
  }
  // 0건이어도 B 의 운영유형은 RFP 신호로 자동(규칙 무관)이어야.
  ok(zeroRes?.operatingType === 'T4', 'approved 0건이어도 B 운영유형은 RFP 신호로 자동 = T4')
  const zeroDecisions = zeroRes?.decided.length ?? 0
  const zeroGates = zeroRes?.gates.length ?? 0

  // (b) 일부 승인 — F-smallbiz-default 를 approved 로 가정 (소상공인 매칭).
  const partialApproved = allRules
    .filter((r) => r.id === 'F-smallbiz-default' || r.ruleType === 'A_operatingType')
    .map((r) => ({ ...r, status: 'approved' as const }))
  const partialRes = resolvePlan(FIXTURE_B, partialApproved)
  const partialDecisions = partialRes.decided.length

  console.log(`     approved 0건: 결정 ${zeroDecisions}건 / 게이트 ${zeroGates}건`)
  console.log(`     approved ${partialApproved.length}건: 결정 ${partialDecisions}건`)
  ok(
    partialDecisions >= zeroDecisions,
    '규칙 승인이 늘면 자동 결정 수가 줄지 않는다 (graceful 증가)',
  )

  // (c) 전체 승인 — 더 많은 축이 자동/게이트로 해소.
  const allApproved = allRules.map((r) => ({ ...r, status: 'approved' as const }))
  const fullRes = resolvePlan(FIXTURE_B, allApproved)
  console.log(
    `     approved ${allApproved.length}건(전체): 결정 ${fullRes.decided.length}건 / 게이트 ${fullRes.gates.length}건`,
  )
  ok(
    fullRes.decided.length >= partialDecisions,
    '전체 승인 시 자동 결정 수가 부분 승인 이상',
  )
  // 게이트가 떠도 추측 채움이 아니라 게이트로 (ask_human 규칙 존재 확인).
  ok(
    fullRes.gates.every((g) => !!g.why && !!g.reason),
    '모든 게이트에 why·reason 존재 (추측 대신 사람 위임 명시)',
  )
}

// ─────────────────────────────────────────────────────────────────
// 3. 하드코딩 매직넘버 0 — 자기 grep
// ─────────────────────────────────────────────────────────────────

async function testNoHardcodedNumbers(): Promise<void> {
  console.log('\n── 3. 하드코딩 매직넘버 0 (자기 grep) ──')

  const targets = [
    'src/lib/program-design/resolve-rules.ts',
    'src/lib/program-design/generate-plan.ts',
    'src/lib/program-design/plan-types.ts',
  ]

  // 금지: 회차/코칭/Action Week/실습% 를 박은 듯한 수치 리터럴.
  // 운영유형 코드(T1~T5)·D0~D8·인덱스(0/1)·slice 길이 등은 수치 강제가 아니므로 제외.
  // 패턴: "회차"/"코칭"/"세션"/"실습"/"액션" 과 같은 줄에 2자리+ 숫자나 비율(0.x) 리터럴.
  const SUSPECT = /(회차|코칭|세션|실습|액션\s*위크|Action\s*Week|sessions?\b|coaching)\D{0,20}(\d{2,}|\d\.\d|0\.\d)/i

  for (const rel of targets) {
    const abs = path.join(process.cwd(), rel)
    const src = await fs.readFile(abs, 'utf8')
    const lines = src.split('\n')
    const hits: string[] = []
    lines.forEach((line, i) => {
      // 주석 줄은 제외 (설명·예시 서술에 수치 허용 — 코드 강제값만 잡는다).
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
    ok(hits.length === 0, `${rel} — 회차/코칭/실습 수치 하드코딩 0`)
  }
}

// ─────────────────────────────────────────────────────────────────
// 4. (옵션) LLM E2E — FULL_LLM=true 일 때만
// ─────────────────────────────────────────────────────────────────

async function testLlmE2E(): Promise<void> {
  console.log('\n── 4. LLM E2E (FULL_LLM=true) ──')
  const { planProgram } = await import('@/lib/program-design/generate-plan')

  for (const [name, input] of [
    ['A(T3)', FIXTURE_A],
    ['B(T4)', FIXTURE_B],
    ['C(T5)', FIXTURE_C],
  ] as const) {
    try {
      const plan = await planProgram(input)
      console.log(
        `     ${name}: operatingType=${plan.operatingType} structure.kind=${plan.structure.kind} ` +
          `gates=${plan.openGates.length} decisions=${plan.decisionLog.length}`,
      )
      if (name.startsWith('B')) {
        ok(
          plan.structure.kind !== 'sessions',
          `${name} — structure.kind !== 'sessions' (T4 회차표 강요 안 함)`,
        )
      }
    } catch (e) {
      ok(false, `${name} — planProgram 실패: ${String(e)}`)
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('═══ BR-3a 프로그램 기획 엔진 — 헤드리스 검증 ═══')

  const ruleSet = await loadDesignRules()
  const allRules = ruleSet.rules
  const realApproved = allRules.filter((r) => r.status === 'approved')
  console.log(
    `\n규칙 로드: 전체 ${allRules.length}건 / approved ${realApproved.length}건 ` +
      `(검수 진행 중이면 approved 0 — 정상)`,
  )

  // 결정론 검증은 "운영유형 디스크리미네이터가 승인됐다고 가정"한 상태로도 한 번 돌려
  // 근거 인용까지 확인 (실제 approved 0이어도 A 규칙 근거 path 검증).
  const withDiscriminator = allRules
    .filter((r) => r.ruleType === 'A_operatingType')
    .map((r) => ({ ...r, status: 'approved' as const }))

  await testOperatingTypeResolution([...realApproved, ...withDiscriminator])
  await testGraceful(allRules)
  await testNoHardcodedNumbers()

  if (process.env.FULL_LLM === 'true') {
    await testLlmE2E()
  } else {
    console.log('\n── 4. LLM E2E — SKIP (FULL_LLM 미설정). 메인이 키로 실행 요망:')
    console.log('     FULL_LLM=true npx tsx scripts/_test-program-plan.ts')
  }

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
