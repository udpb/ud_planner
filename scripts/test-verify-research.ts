/**
 * L4 Verification — verify-research 2차 LLM fact-check.
 *
 * 시나리오:
 *   1. 잘 알려진 실재 출처 (통계청·중기부) → verified 기대
 *   2. 모호한 출처 (○○ 시장 동향 보고서) → uncertain 기대
 *   3. 가공된 출처 (가공의 기관명·publication) → fabricated 기대
 *
 * server-only 우회 — inline 로직 복제 + invokeAi 직접 호출.
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
  const { invokeAi } = await import('../src/lib/ai-fallback')
  const { safeParseJson } = await import('../src/lib/ai/parser')
  const { AI_TOKENS } = await import('../src/lib/ai/config')

  // 3 가지 케이스 — 검수자가 분별 가능해야
  const testEvidence = [
    {
      topic: '기업 생존율 통계',
      source: '통계청 기업생멸행정통계',
      publishedAt: '2023.12',
      summary: '국내 신생 기업 5년 생존율 33.8%로 OECD 평균 대비 낮음.',
    },
    {
      topic: '스타트업 글로벌 진출 전망',
      source: '글로벌 스타트업 인사이트 보고서',
      publishedAt: '2024.06',
      summary: '국내 스타트업의 글로벌 진출 시장 규모가 2030년까지 5배 성장 전망.',
    },
    {
      topic: 'AI 창업 효과 분석',
      source: '대한민국 AI 창업진흥재단 2024 연차보고서',
      publishedAt: '2024.11',
      summary: 'AI 기반 창업자의 매출이 일반 대비 2.7배 높음.',
    },
  ]

  const evidenceList = testEvidence
    .map((e, i) => `[${i}] topic: ${e.topic}\n     source: ${e.source}${e.publishedAt ? ` (${e.publishedAt})` : ''}\n     summary: ${e.summary}`)
    .join('\n\n')

  const prompt = `
당신은 한국 정부·기업 사업 제안서의 출처 검증을 담당하는 **회의적 검수자(skeptical reviewer)** 입니다.
다른 AI 가 생성한 외부 자료 ${testEvidence.length}건의 출처가 진짜 실재하는지 검증합니다.

[검증 규칙 — 매우 엄격하게]

1. **verified** — 출처가 다음 중 하나에 해당하면 verified:
   - 통계청·중소벤처기업부·산업연구원·창업진흥원·한국무역협회·한국개발연구원·국가과학기술자문회의 등 **실재 정부·공공 기관**
   - 그 기관이 **연례 정기 발행하는 통계·조사** (예: "기업생멸행정통계", "벤처기업정밀실태조사")
   - 출판 시점이 과거 5년 이내 (~2021) 로 명시되어 있고 합리적

2. **uncertain** — 다음에 해당:
   - 기관명은 실재하지만 specific 한 publication title 이 generic·gulp 일 때
   - "○○년 ○○ 보고서" 같이 너무 일반적
   - 출처가 민간 reports 인데 그 회사가 확실히 그 시점에 발행했는지 모를 때

3. **fabricated** — 다음에 해당:
   - 기관명이 실재하지 않음 (가공된 이름)
   - publication title 이 너무 구체적이지만 검색에 안 나옴
   - 통계 수치가 너무 구체적이라 만들어낸 것 같음 (예: "정확히 33.8%")

⚠ 중요: 확실하지 않으면 **uncertain** 또는 **fabricated** 로 분류. verified 는 매우 확실할 때만.

[검증 대상]
${evidenceList}

[출력 JSON]
{
  "verifications": [
    { "index": 0, "status": "verified", "reason": "통계청의 정기 발행 통계로 실재함" },
    ...
  ],
  "overallTrustworthy": true,
  "overallReason": "..."
}

JSON 만.
`.trim()

  console.log(`▶ L4 Verification — verify-research (skeptical reviewer)\n`)
  console.log(`검증 대상 ${testEvidence.length}건:`)
  testEvidence.forEach((e, i) => console.log(`  [${i}] ${e.source}`))
  console.log()

  const t0 = Date.now()
  const r = await invokeAi({
    prompt,
    maxTokens: AI_TOKENS.STANDARD,
    temperature: 0.1,
    label: 'l4-verify-test',
  })
  console.log(`LLM 응답 ${Date.now() - t0}ms (provider: ${r.provider})\n`)

  const raw = safeParseJson<any>(r.raw, 'l4-test')
  const verifications = raw?.verifications ?? []
  const overallTrustworthy = raw?.overallTrustworthy

  console.log(`[검증 결과]`)
  verifications.forEach((v: any) => {
    const ev = testEvidence[v.index]
    const icon = v.status === 'verified' ? '✓' : v.status === 'uncertain' ? '⚠' : '✗'
    console.log(`  ${icon} [${v.index}] ${v.status.toUpperCase()}: ${ev?.source}`)
    console.log(`     reason: ${v.reason}`)
  })

  console.log(`\nOverall trustworthy: ${overallTrustworthy}\n`)

  // 검증 기대값
  // case 0: 통계청 기업생멸행정통계 — verified 기대
  // case 1: "글로벌 스타트업 인사이트 보고서" — uncertain (generic title)
  // case 2: "대한민국 AI 창업진흥재단" — fabricated (가공 기관)
  const expectedStatuses = ['verified', 'uncertain', 'fabricated']
  let pass = 0
  let warn = 0
  for (let i = 0; i < testEvidence.length; i++) {
    const v = verifications.find((x: any) => x.index === i)
    if (!v) {
      console.log(`  ✗ [${i}] 검증 누락`)
      continue
    }
    if (v.status === expectedStatuses[i]) {
      pass += 1
    } else {
      // not exact match — 다른 conservative 분류도 OK (fabricated 보다 uncertain 등)
      const conservativeOK =
        (expectedStatuses[i] === 'fabricated' && v.status === 'uncertain') ||
        (expectedStatuses[i] === 'verified' && v.status === 'uncertain')
      if (conservativeOK) {
        warn += 1
        console.log(`  ⚠ [${i}] expected ${expectedStatuses[i]}, got ${v.status} (conservative — OK)`)
      } else {
        console.log(`  ✗ [${i}] expected ${expectedStatuses[i]}, got ${v.status}`)
      }
    }
  }

  console.log(`\n[검증]`)
  console.log(`  완벽 일치: ${pass}/${testEvidence.length}`)
  console.log(`  보수적 fallback (OK): ${warn}`)
  console.log(`  실패: ${testEvidence.length - pass - warn}`)

  // verified 케이스가 verified 로 인식되는지가 가장 중요
  const verifiedCorrect = verifications.find((v: any) => v.index === 0)?.status === 'verified'

  if (verifiedCorrect && pass + warn >= 2) {
    console.log('\n✅ L4 PASS — skeptical reviewer 정상 작동')
    process.exit(0)
  } else {
    console.log('\n❌ L4 FAIL')
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
