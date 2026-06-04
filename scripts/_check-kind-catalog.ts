/**
 * DECK-3a (ADR-025 Phase 3 핫픽스) — per-kind 필드 계약 카탈로그 검증 (결정론적, LLM·DB 없음)
 *
 * 실행: npx tsx scripts/_check-kind-catalog.ts
 *
 * authorSlide 가 LLM 에 주입하는 KIND_FIELD_SPEC/KIND_EXAMPLE 카탈로그가
 *   (a) 모든 SlideKind 를 빠짐없이 커버하고
 *   (b) 각 kind 예시 JSON 이 safeParseDeckSpec({version:'deck-v3', slides:[example]}) 를 통과
 * 함을 단언한다. 통과해야 LLM 에 "정확한 필드명" 계약을 줄 수 있다(불일치 = 의미 없음).
 *
 * ⚠️ LLM/DB 호출 없음 · 백그라운드 프로세스 없음. 1회 검증 후 종료.
 */
import { SlideSpecSchema, KIND_EXAMPLE, KIND_FIELD_SPEC, safeParseDeckSpec, type SlideKind } from '../src/lib/deck/spec'

// SlideSpecSchema 판별 유니온의 모든 kind 리터럴을 진실원본으로 수집.
function allSlideKinds(): SlideKind[] {
  const opts = (SlideSpecSchema as unknown as { options: Array<{ shape: { kind: { value: SlideKind } } }> }).options
  return opts.map((o) => o.shape.kind.value)
}

function main() {
  const kinds = allSlideKinds()
  const exampleKeys = Object.keys(KIND_EXAMPLE) as SlideKind[]
  const specKeys = Object.keys(KIND_FIELD_SPEC) as SlideKind[]

  console.log(`\nSlideKind (스키마 진실): ${kinds.length}종`)
  console.log(`KIND_EXAMPLE 키: ${exampleKeys.length}종 · KIND_FIELD_SPEC 키: ${specKeys.length}종\n`)

  const fails: string[] = []

  // (a) 전 kind 커버 — 누락/잉여 검사 (양방향).
  for (const k of kinds) {
    if (!exampleKeys.includes(k)) fails.push(`KIND_EXAMPLE 누락: ${k}`)
    if (!specKeys.includes(k)) fails.push(`KIND_FIELD_SPEC 누락: ${k}`)
  }
  for (const k of exampleKeys) {
    if (!kinds.includes(k)) fails.push(`KIND_EXAMPLE 잉여(스키마에 없는 kind): ${k}`)
  }

  // (b) 각 예시 JSON 이 safeParseDeckSpec 통과 + body.kind 일치 + KIND_FIELD_SPEC 가 예시 직렬화와 동기.
  console.log('┌──────────────────────┬──────────┬──────────┐')
  console.log('│ kind                 │ zod 통과 │ kind일치 │')
  console.log('├──────────────────────┼──────────┼──────────┤')
  for (const k of exampleKeys) {
    const ex = KIND_EXAMPLE[k]
    const r = safeParseDeckSpec({ version: 'deck-v3', slides: [ex] })
    const kindMatch = ex.body.kind === k
    if (!r.ok) fails.push(`예시 zod 실패 [${k}]: ${r.error}`)
    if (!kindMatch) fails.push(`예시 body.kind 불일치 [${k}]: body.kind=${ex.body.kind}`)
    // KIND_FIELD_SPEC[k] 가 예시에서 파생된 직렬화와 1:1 인지(드리프트 방지).
    if (KIND_FIELD_SPEC[k] !== JSON.stringify(ex, null, 2)) {
      fails.push(`KIND_FIELD_SPEC 가 KIND_EXAMPLE 직렬화와 불일치 [${k}]`)
    }
    console.log(
      `│ ${k.padEnd(20)} │ ${(r.ok ? '✅' : '❌').padEnd(7)}  │ ${(kindMatch ? '✅' : '❌').padEnd(7)}  │`,
    )
  }
  console.log('└──────────────────────┴──────────┴──────────┘')

  console.log('')
  if (fails.length === 0) {
    console.log(`✅ PASS — ${kinds.length}종 SlideKind 전부 커버 · 모든 예시가 safeParseDeckSpec 통과 · 카탈로그 동기.`)
  } else {
    console.log('❌ FAIL:')
    for (const f of fails) console.log(`   - ${f}`)
    process.exitCode = 1
  }
}

main()
