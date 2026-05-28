/**
 * F3: E2E 시나리오 — RFP 부터 .md 다운로드 까지 (DB 우회, 핵심 로직 직접 호출)
 *
 * 시뮬레이션:
 *   1. RFP 파싱 (skip — 미리 가공된 RfpParsed 사용)
 *   2. intent 슬롯 → LLM 호출
 *   3. beforeAfter.before / .after 슬롯 → LLM 호출
 *   4. keyMessages.0/1/2 슬롯 → 마지막에 hierarchy 동시 produce
 *   5. sections.1/2/4/6 슬롯 → 각 sectionMeta 동시 produce
 *   6. .md 렌더 → 시각 확인
 *
 * 측정:
 *   - 매 턴 hierarchy/sectionMeta 정상 produce 비율
 *   - .md 최종 quality (글자 수, 큰따옴표 헤드라인, 부제, 정량)
 *   - 총 LLM 호출 횟수 + elapsed
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

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

interface TurnResult {
  slot: string
  pmInput: string
  llmRaw: string
  payload: any
  extractedKeys: string[]
  accepted: string[]
  hasHierarchy: boolean
  hasSectionMeta: boolean
  elapsedSec: number
  provider: string
  fallback: boolean
}

const SLOTS_TO_RUN = [
  { slot: 'intent', pmInput: '청년 + 시니어 세대융합 창업 6주 프로그램 — 5팀 발굴 + MVP + IR' },
  { slot: 'beforeAfter.before', pmInput: '청년·시니어 매칭 채널 부재로 세대융합 창업 잠재력 사장. 통계청 50대 창업 의향자 65% 가 "청년 파트너 부재" 응답.' },
  { slot: 'beforeAfter.after', pmInput: '6주 후 검증된 MVP 5건 + IR 자료 + 청년-시니어 자생 매칭 5팀 100% 유지 + 시드 연계 3건+ 가능 단계.' },
  { slot: 'keyMessages.0', pmInput: '청년 디지털 + 시니어 산업경험 매칭으로 5팀 발굴' },
  { slot: 'keyMessages.1', pmInput: 'ACTT 사전·사후 진단 + 80% MVP 검증 목표' },
  { slot: 'keyMessages.2', pmInput: 'AI 리터러시 + 글로벌 진출 인프라 (일본·인도 거점) 연계' },
  { slot: 'sections.1', pmInput: '제안 배경 작성 — 통계청 데이터 + UD 자산 인용' },
  { slot: 'sections.2', pmInput: '추진 전략 — 3대 (자원매핑·ACTT 진단·글로벌 인프라)' },
  { slot: 'sections.6', pmInput: '기대 성과 — MVP 80% · 매칭 100% · 시드 연계 3건+' },
]

async function main() {
  const { invokeAi } = await import('../src/lib/ai-fallback')
  const { safeParseJson } = await import('../src/lib/ai/parser')
  const { buildTurnPrompt } = await import('../src/lib/express/prompts')
  const { filterKnownSlots, mergeExtractedSlots } = await import('../src/lib/express/extractor')
  const { emptyDraft, ExpressDraftSchema } = await import('../src/lib/express/schema')
  const { renderExpressMarkdown } = await import('../src/lib/express/render-markdown')

  let draft = emptyDraft()
  const turnsLog: TurnResult[] = []

  console.log('\n========================================')
  console.log('F3: E2E 시나리오 — 9 슬롯 LLM 호출')
  console.log('========================================')

  for (const t of SLOTS_TO_RUN) {
    console.log(`\n── [${t.slot}] PM: "${t.pmInput.slice(0, 50)}..." ──`)

    const prompt = buildTurnPrompt({
      state: { turns: [], currentSlot: t.slot, validationErrors: [] } as any,
      draft,
      pmInput: t.pmInput,
      currentSlot: t.slot,
    })

    const t0 = Date.now()
    const r = await invokeAi({
      prompt,
      maxTokens: 8192,
      temperature: 0.4,
      label: `e2e-${t.slot}`,
    })
    const elapsedSec = (Date.now() - t0) / 1000

    let payload: any
    try {
      payload = safeParseJson(r.raw, t.slot)
    } catch (e: any) {
      console.log(`  ✗ JSON 파싱 실패: ${e.message}`)
      console.log(`  Raw: ${r.raw.slice(0, 300)}`)
      continue
    }

    const extractedKeys = Object.keys(payload.extractedSlots ?? {})
    const filtered = filterKnownSlots(payload.extractedSlots ?? {})
    const merged = mergeExtractedSlots(draft, filtered)
    draft = merged.draft

    const hasHierarchy = extractedKeys.includes('messageHierarchy')
    const hasSectionMeta = extractedKeys.includes('sectionMeta')

    console.log(`  Provider: ${r.provider} | ${elapsedSec.toFixed(1)}s${r.fallback ? ' (fallback)' : ''}`)
    console.log(`  extractedSlots: ${extractedKeys.join(', ')}`)
    console.log(`  accepted: ${merged.acceptedSlots.join(', ') || '(none)'}`)
    if (merged.validationErrors.length > 0) {
      merged.validationErrors.forEach((e) => console.log(`  ⚠ ${e.slotKey}: ${e.zodIssue}`))
    }
    if (hasHierarchy) {
      const h = payload.extractedSlots.messageHierarchy as any[]
      console.log(`  ⭐ hierarchy ${h.length}항목 produce`)
      h.forEach((item, i) => {
        console.log(`     ${i + 1}. "${item.key?.slice(0, 50)}" sub=${item.sub?.length ?? 0} q=${item.quantProofs?.length ?? 0}`)
      })
    }
    if (hasSectionMeta) {
      const sm = payload.extractedSlots.sectionMeta as Record<string, any>
      for (const [k, v] of Object.entries(sm)) {
        console.log(`  ⭐ sectionMeta.${k}: sub="${(v as any).subtitle?.slice(0, 40)}" head="${(v as any).headline?.slice(0, 60)}"`)
      }
    }

    turnsLog.push({
      slot: t.slot,
      pmInput: t.pmInput,
      llmRaw: r.raw,
      payload,
      extractedKeys,
      accepted: merged.acceptedSlots,
      hasHierarchy,
      hasSectionMeta,
      elapsedSec,
      provider: r.provider,
      fallback: r.fallback,
    })
  }

  // 최종 .md 렌더
  console.log('\n========================================')
  console.log('최종 .md 렌더')
  console.log('========================================\n')

  const finalSchema = ExpressDraftSchema.safeParse(draft)
  console.log(`Schema valid: ${finalSchema.success ? '✓' : `✗ ${finalSchema.error?.issues[0]?.message}`}`)

  const md = renderExpressMarkdown({
    project: {
      name: 'F3 E2E — 계원예대 세대융합창업',
      client: '계원예술대학교',
      totalBudgetVat: 60_000_000,
      supplyPrice: null,
      eduStartDate: new Date('2025-11-03'),
      eduEndDate: new Date('2025-12-15'),
    },
    draft,
  })

  const outPath = path.join(process.cwd(), '.tmp-f3-e2e.md')
  fs.writeFileSync(outPath, md, 'utf-8')

  // 요약
  console.log(`\n📂 .md 저장: ${outPath} (${md.length}자 · ${md.split('\n').length}라인)`)

  console.log('\n========================================')
  console.log('F3 요약')
  console.log('========================================')

  const totalTurns = turnsLog.length
  const hierarchyTurns = turnsLog.filter((t) => t.hasHierarchy).length
  const sectionMetaTurns = turnsLog.filter((t) => t.hasSectionMeta).length
  const totalElapsed = turnsLog.reduce((s, t) => s + t.elapsedSec, 0)
  const geminiCalls = turnsLog.filter((t) => t.provider === 'gemini').length
  const claudeCalls = turnsLog.filter((t) => t.provider === 'claude').length
  const fallbacks = turnsLog.filter((t) => t.fallback).length

  console.log(`총 LLM 호출: ${totalTurns}`)
  console.log(`Gemini: ${geminiCalls} · Claude: ${claudeCalls} · Fallback: ${fallbacks}`)
  console.log(`총 elapsed: ${totalElapsed.toFixed(1)}s (평균 ${(totalElapsed / totalTurns).toFixed(1)}s/턴)`)
  console.log(`\nhierarchy produce: ${hierarchyTurns}/${totalTurns} 턴`)
  console.log(`sectionMeta produce: ${sectionMetaTurns}/${totalTurns} 턴`)

  // .md 품질 측정
  const headlineCount = (md.match(/> \*\*"[^"]+"\*\*/g) ?? []).length
  const subtitleCount = (md.match(/^## \d+\.[^:\n]+:/gm) ?? []).length
  const hierarchyHeading = md.includes('## 💬 핵심 메시지 hierarchy')
  const qualityWarnings = md.match(/## ⚠ 자동 품질 점검/g) !== null
  const sourceCitations = (md.match(/\[근거:/g) ?? []).length

  console.log(`\n.md 품질:`)
  console.log(`  큰따옴표 헤드라인: ${headlineCount}개`)
  console.log(`  콜론 부제: ${subtitleCount}개`)
  console.log(`  hierarchy 블록: ${hierarchyHeading ? '✓' : '✗'}`)
  console.log(`  품질 점검 워닝: ${qualityWarnings ? '✓ (검출됨)' : '없음'}`)
  console.log(`  inline source 인용: ${sourceCitations}개`)

  console.log(`\n--- 최종 .md 미리보기 ---`)
  console.log(md.slice(0, 3000))
  console.log('...')
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
