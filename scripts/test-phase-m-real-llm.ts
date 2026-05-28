/**
 * F2: 실 LLM 호출로 hierarchy/sectionMeta 생성 검증.
 *
 * Sample turn: keyMessages.2 슬롯에서 LLM 이 messageHierarchy 도 produce 하는지.
 * 또한 sections.1 슬롯에서 sectionMeta 도 produce 하는지.
 *
 * 측정:
 *   - Provider (gemini / claude) + 모델 + 응답 시간
 *   - extractedSlots 의 키 (messageHierarchy 포함?)
 *   - hierarchy 객체 구조 검증
 *   - sectionMeta 객체 구조 검증
 *   - extractor 통과 + render 출력 확인
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

// .env 로딩
const envPath = path.join(process.cwd(), '.env')
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const eq = t.indexOf('=')
  if (eq === -1) continue
  const k = t.slice(0, eq).trim()
  let v = t.slice(eq + 1).trim()
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
  if (!process.env[k]) process.env[k] = v
}

async function main() {
  const { invokeAi } = await import('../src/lib/ai-fallback')
  const { safeParseJson } = await import('../src/lib/ai/parser')
  const { buildTurnPrompt } = await import('../src/lib/express/prompts')
  const { filterKnownSlots, mergeExtractedSlots } = await import('../src/lib/express/extractor')
  const { emptyDraft, ExpressDraftSchema } = await import('../src/lib/express/schema')
  const { renderExpressMarkdown } = await import('../src/lib/express/render-markdown')

  // ──── 사전: draft 빌드 (keyMessages.0/1 까지 채워진 상태 → keyMessages.2 슬롯 진행) ────
  const baseDraft = emptyDraft()
  baseDraft.intent = '계원예대 청년-시니어 세대융합창업 6주 프로그램 — 5팀 발굴 + MVP 검증 + IR'
  baseDraft.beforeAfter = {
    before: '예술대 청년과 5060 시니어 간 매칭 채널 부재로 세대융합 창업 가능성이 사장되고 있음',
    after: '6주 후 검증된 MVP 5건 + IR 자료 + 청년-시니어 자생 매칭 5팀 100% 유지',
  }
  baseDraft.keyMessages = ['세대융합 5팀 발굴', '실전 MVP 검증']  // .0, .1 까지

  // ──── Test 1: keyMessages.2 슬롯에서 messageHierarchy 동시 produce ────
  console.log('\n========================================')
  console.log('Test 1: keyMessages.2 슬롯 — hierarchy 동시 produce')
  console.log('========================================\n')

  const turnPrompt1 = buildTurnPrompt({
    state: { turns: [], currentSlot: 'keyMessages.2', validationErrors: [] } as any,
    draft: baseDraft,
    pmInput: '세 번째 핵심 메시지: AI 리터러시 + 글로벌 판매역량 강화',
    currentSlot: 'keyMessages.2',
  })

  console.log(`> 프롬프트 길이: ${turnPrompt1.length} 자`)
  const t0 = Date.now()
  const r1 = await invokeAi({
    prompt: turnPrompt1,
    maxTokens: 8192,
    temperature: 0.4,
    label: 'test-phase-m-real-llm-keymessages',
  })
  const elapsed1 = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`> Provider: ${r1.provider} | Model: ${r1.model} | Elapsed: ${elapsed1}s | Fallback: ${r1.fallback}`)
  if (r1.primaryError) console.log(`> Primary error: ${r1.primaryError}`)
  console.log(`> Raw 길이: ${r1.raw.length} 자`)

  let payload1: any
  try {
    payload1 = safeParseJson(r1.raw, 'test1')
  } catch (e: any) {
    console.error('✗ JSON 파싱 실패:', e.message)
    console.error('Raw:', r1.raw.slice(0, 500))
    process.exit(1)
  }

  console.log(`\n> extractedSlots 키: ${Object.keys(payload1.extractedSlots ?? {}).join(', ')}`)
  console.log(`> 응답:`)
  console.log(JSON.stringify(payload1, null, 2).slice(0, 2000))

  const hasHierarchy = 'messageHierarchy' in (payload1.extractedSlots ?? {})
  if (hasHierarchy) {
    console.log(`\n✓ messageHierarchy 포함! (${(payload1.extractedSlots.messageHierarchy as any[])?.length} 항목)`)
  } else {
    console.log(`\n✗ messageHierarchy 누락 — LLM 이 slot-guide 지시 무시함`)
  }

  // extractor 통과 + render
  const filtered1 = filterKnownSlots(payload1.extractedSlots ?? {})
  const merged1 = mergeExtractedSlots(baseDraft, filtered1)
  console.log(`> Accepted slots: ${merged1.acceptedSlots.join(', ')}`)
  if (merged1.validationErrors.length > 0) {
    console.log(`> Validation errors: ${merged1.validationErrors.length}`)
    merged1.validationErrors.forEach((e) => console.log(`  - ${e.slotKey}: ${e.zodIssue}`))
  }

  // ──── Test 2: sections.1 슬롯에서 sectionMeta 동시 produce ────
  console.log('\n========================================')
  console.log('Test 2: sections.1 슬롯 — sectionMeta 동시 produce')
  console.log('========================================\n')

  const draft2 = merged1.draft
  // keyMessages.2 채워진 상태로 다음 슬롯 진행
  if (!draft2.keyMessages || draft2.keyMessages.length < 3) {
    draft2.keyMessages = ['세대융합 5팀 발굴', '실전 MVP 검증', 'AI 리터러시 + 글로벌']
  }

  const turnPrompt2 = buildTurnPrompt({
    state: { turns: [], currentSlot: 'sections.1', validationErrors: [] } as any,
    draft: draft2,
    pmInput: 'sections.1 제안 배경 작성해 주세요. 통계청 50대 창업 의향자 65% 정도 데이터 활용 가능.',
    currentSlot: 'sections.1',
  })

  console.log(`> 프롬프트 길이: ${turnPrompt2.length} 자`)
  const t0_2 = Date.now()
  const r2 = await invokeAi({
    prompt: turnPrompt2,
    maxTokens: 8192,
    temperature: 0.4,
    label: 'test-phase-m-real-llm-sections',
  })
  const elapsed2 = ((Date.now() - t0_2) / 1000).toFixed(1)
  console.log(`> Provider: ${r2.provider} | Elapsed: ${elapsed2}s | Fallback: ${r2.fallback}`)

  let payload2: any
  try {
    payload2 = safeParseJson(r2.raw, 'test2')
  } catch (e: any) {
    console.error('✗ JSON 파싱 실패:', e.message)
    console.error('Raw:', r2.raw.slice(0, 500))
    process.exit(1)
  }

  console.log(`\n> extractedSlots 키: ${Object.keys(payload2.extractedSlots ?? {}).join(', ')}`)
  console.log(`> 응답:`)
  console.log(JSON.stringify(payload2, null, 2).slice(0, 2000))

  const hasSectionMeta = 'sectionMeta' in (payload2.extractedSlots ?? {})
  if (hasSectionMeta) {
    const sm = payload2.extractedSlots.sectionMeta as Record<string, any>
    console.log(`\n✓ sectionMeta 포함! 키: ${Object.keys(sm).join(', ')}`)
    for (const [k, v] of Object.entries(sm)) {
      console.log(`  section ${k}: subtitle="${(v as any).subtitle?.slice(0, 60)}" headline="${(v as any).headline?.slice(0, 80)}"`)
    }
  } else {
    console.log(`\n✗ sectionMeta 누락 — LLM 이 sectionMetaHint 지시 무시함`)
  }

  const filtered2 = filterKnownSlots(payload2.extractedSlots ?? {})
  const merged2 = mergeExtractedSlots(draft2, filtered2)
  console.log(`> Accepted slots: ${merged2.acceptedSlots.join(', ')}`)

  // ──── 최종: 통합 .md 출력 ────
  console.log('\n========================================')
  console.log('최종 — .md 시각 확인')
  console.log('========================================\n')

  const md = renderExpressMarkdown({
    project: {
      name: 'F2 실 LLM 검증 — 계원예대',
      client: '계원예술대학교',
      totalBudgetVat: 60_000_000,
      supplyPrice: null,
      eduStartDate: null,
      eduEndDate: null,
    },
    draft: merged2.draft,
  })

  const outPath = path.join(process.cwd(), '.tmp-f2-real-llm.md')
  fs.writeFileSync(outPath, md, 'utf-8')
  console.log(`📂 .md 저장: ${outPath} (${md.length}자)`)
  console.log(`\n--- 출력 미리보기 (200자 limit per 섹션) ---\n`)
  console.log(md.slice(0, 2500))
  console.log(`...\n`)

  // ──── 요약 ────
  console.log('\n========================================')
  console.log('F2 요약')
  console.log('========================================')
  console.log(`Test 1 (keyMessages.2 → hierarchy):  ${hasHierarchy ? '✓ produce' : '✗ 누락'}`)
  console.log(`Test 2 (sections.1 → sectionMeta):   ${hasSectionMeta ? '✓ produce' : '✗ 누락'}`)
  console.log(`총 호출: 2회 · Total elapsed: ${(parseFloat(elapsed1) + parseFloat(elapsed2)).toFixed(1)}s`)

  // 최종 expressDraft validate
  const final = ExpressDraftSchema.safeParse(merged2.draft)
  console.log(`최종 ExpressDraft schema valid: ${final.success ? '✓' : `✗ ${final.error?.issues[0]?.message}`}`)
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
