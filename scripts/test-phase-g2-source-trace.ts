/**
 * G2-5: 실 LLM 호출로 sourceTrace 생성 검증.
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

async function main() {
  const { invokeAi } = await import('../src/lib/ai-fallback')
  const { safeParseJson } = await import('../src/lib/ai/parser')
  const { buildTurnPrompt } = await import('../src/lib/express/prompts')
  const { emptyDraft } = await import('../src/lib/express/schema')

  const baseDraft = emptyDraft()
  baseDraft.intent = '청년 + 시니어 세대융합 창업 6주 — 5팀 발굴 + MVP'
  baseDraft.beforeAfter = {
    before: '청년-시니어 매칭 채널 부재로 세대융합 창업 잠재력 사장',
    after: '6주 후 검증된 MVP 5건 + 청년-시니어 자생 매칭 5팀',
  }
  baseDraft.keyMessages = [
    'ACTT 진단 + 사전·사후 페어로 +1.10 변화량 정량 입증',
    '4중 페이스메이커 운영 체계 (코치·멘토·글로벌·동료)',
  ]

  const turnPrompt = buildTurnPrompt({
    state: { turns: [], currentSlot: 'keyMessages.2', validationErrors: [] } as any,
    draft: baseDraft,
    matchedAssets: [
      {
        asset: {
          id: 'actt-pre-post',
          name: 'ACTT 사전·사후 진단',
          category: 'methodology',
          applicableSections: ['curriculum', 'impact'],
          valueChainStage: 'outcome',
          evidenceType: 'methodology',
          keyNumbers: ['+1.10', '20211'],
          narrativeSnippet: 'ACTT 진단 도구 5대 역량 × 15 지표',
        },
        score: 0.92,
      } as any,
      {
        asset: {
          id: 'underdogs-coach-pool',
          name: '언더독스 코치 풀 800명',
          category: 'human',
          applicableSections: ['coaches'],
          valueChainStage: 'activity',
          evidenceType: 'structural',
          keyNumbers: ['800'],
          narrativeSnippet: '전속 코치 800명 풀',
        },
        score: 0.85,
      } as any,
    ],
    pmInput: '세 번째 키 메시지: AI 리터러시 + 글로벌 진출 인프라',
    currentSlot: 'keyMessages.2',
  })

  console.log(`Prompt 길이: ${turnPrompt.length}자`)
  console.log('LLM 호출 중...')
  const t0 = Date.now()
  const r = await invokeAi({
    prompt: turnPrompt,
    maxTokens: 8192,
    temperature: 0.4,
    label: 'g2-source-trace-test',
  })
  console.log(`Provider: ${r.provider} · ${((Date.now() - t0) / 1000).toFixed(1)}s · fallback=${r.fallback}`)

  const payload = safeParseJson<any>(r.raw, 'g2-test')
  console.log(`\nextractedSlots 키: ${Object.keys(payload.extractedSlots ?? {}).join(', ')}`)

  const h = payload.extractedSlots?.messageHierarchy as any[] | undefined
  if (!h || h.length === 0) {
    console.error('✗ messageHierarchy 누락')
    process.exit(1)
  }

  console.log(`\n[messageHierarchy ${h.length}개]`)
  let traceCount = 0
  h.forEach((item, i) => {
    console.log(`\n${i + 1}. "${item.key}"`)
    console.log(`   sub: ${item.sub?.length ?? 0}개, quantProofs: ${item.quantProofs?.length ?? 0}개`)
    if (item.sourceTrace) {
      traceCount++
      console.log(`   ⭐ sourceTrace:`)
      console.log(`      assets: ${(item.sourceTrace.matchedAssetIds ?? []).join(', ')}`)
      console.log(`      patterns: ${(item.sourceTrace.patternIds ?? []).join(', ')}`)
      console.log(`      reasoning: "${item.sourceTrace.reasoning ?? '(없음)'}"`)
    } else {
      console.log(`   ✗ sourceTrace 누락`)
    }
  })

  console.log(`\n결과: sourceTrace ${traceCount}/${h.length} hierarchy 항목`)
  if (traceCount === 0) {
    console.error('✗ G2 wire-up 실패 — sourceTrace 생성 X')
    process.exit(1)
  }
  console.log('✓ G2 sourceTrace LLM 생성 정상')
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
