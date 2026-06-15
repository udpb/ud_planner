/**
 * BR-2 — DesignRule 시드 검증 스모크 (결정론적, LLM·DB 없음)
 *
 * 실행: npx tsx scripts/_check-design-rules.ts
 *
 * 단언:
 *   (a) loadDesignRules() 가 시드(`data/program-design/design-rules.json`)를
 *       ADR-028 추록 3 zod 스키마로 무오류 파싱.
 *   (b) 모든 규칙 isDefault === true (제0원칙 — 추록 §불변식 1).
 *   (c) 모든 규칙 evidence.source 존재 (근거 없는 규칙 금지 — 추록 §불변식 3).
 *   (d) ruleType 별 카운트 표시 (UI 그룹 8종 A~G+Z 커버 확인용).
 *
 * ⚠️ LLM/DB 호출 없음 · 백그라운드 프로세스 없음. 1회 검증 후 종료.
 *    파일을 *쓰지 않는다* (status 변경은 검수 UI/ API 책임).
 */
import {
  loadDesignRules,
  RULE_TYPES,
  type RuleType,
} from '../src/lib/program-design/design-rule'

async function main() {
  const fails: string[] = []

  let set
  try {
    set = await loadDesignRules()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log('❌ FAIL — loadDesignRules() 가 시드를 파싱하지 못했습니다:\n')
    console.log(msg)
    process.exitCode = 1
    return
  }

  console.log(`\nDesignRuleSet — version=${set.version} · source=${set.source}`)
  console.log(`규칙 ${set.rules.length}건 (zod 통과)\n`)

  // (b) isDefault · (c) evidence.source.
  for (const r of set.rules) {
    if (r.isDefault !== true) fails.push(`isDefault !== true: ${r.id}`)
    if (!r.evidence?.source) fails.push(`evidence.source 누락: ${r.id}`)
  }

  // (d) ruleType 별 카운트.
  const counts = new Map<RuleType, number>()
  for (const t of RULE_TYPES) counts.set(t, 0)
  for (const r of set.rules) counts.set(r.ruleType, (counts.get(r.ruleType) ?? 0) + 1)

  console.log('┌────────────────────┬───────┐')
  console.log('│ ruleType           │ count │')
  console.log('├────────────────────┼───────┤')
  for (const t of RULE_TYPES) {
    console.log(`│ ${t.padEnd(18)} │ ${String(counts.get(t) ?? 0).padStart(5)} │`)
  }
  console.log('└────────────────────┴───────┘')

  // status 분포 (참고).
  const byStatus = new Map<string, number>()
  for (const r of set.rules) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1)
  console.log(
    '\nstatus: ' +
      [...byStatus.entries()].map(([k, v]) => `${k}=${v}`).join(' · '),
  )

  console.log('')
  if (fails.length === 0) {
    console.log(
      `✅ PASS — ${set.rules.length}건 전부 zod 통과 · isDefault 전부 true · evidence.source 전부 존재.`,
    )
  } else {
    console.log('❌ FAIL:')
    for (const f of fails) console.log(`   - ${f}`)
    process.exitCode = 1
  }
}

main()
