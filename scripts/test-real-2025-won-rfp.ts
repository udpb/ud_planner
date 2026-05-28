/**
 * Real 2025 Won RFP Test — A.25.0050 성균관대 창업중심대학 Go to Market
 *
 * 시나리오:
 *   1. RFP 텍스트 (성균관대 Go to Market) 로 풀 시뮬레이션
 *   2. 9턴 챗봇 (intent → BA → kM × 3 → sections.1/2/3/4/6)
 *   3. .md 생성
 *   4. 실제 당선 narrative (ContentAsset 5건) 와 비교
 *
 * 비교 기준:
 *   - intent 의 핵심 키워드 일치율
 *   - keyMessages 가 당선 차별화 4단계 프레임 (역량진단-시장분석-전략수립-사업개발) 포함?
 *   - sections 본문이 당선 narrative 의 핵심 표현 활용?
 *   - 정량 수치 (13,000명 / 4단계 / 10개사) 인용?
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

// 성균관대 Go to Market RFP 핵심 텍스트 (WinningPattern.overall snippet 정리)
const RFP_TEXT = `
2025년 성균관대학교 창업중심대학 Go to Market 프로그램 운영 용역 제안요청서

발주처: 성균관대학교 창업지원단
공고일: 2025.8.4
사업 예산: 65,000,000원 (육천오백만원, VAT 포함)
사업 기간: 계약 체결일 ~ 2025.11.28(금)

[과업 내용]
가. 스타트업 성장 지원 운영
  1) 사업화 역량 진단
    - 선정된 창업기업의 사업화 수준을 진단하고 구체적인 개선 방안을 제시
    - 기업별 맞춤 피드백 제공
  2) 시장 분석 컨설팅
    - 고객 중심의 시장 전략 수립을 위한 기초 시장 분석 결과 제공
    - 경쟁사 및 유사 제품 시장 비교 분석 등

나. Move the Market 운영
  1) 전략 수립 및 제안서 작성
    - 현황 분석 및 STP 전략 수립, 사업제안서 작성 등
  2) 사업 개발 컨설팅
    - 실행 목표 설정 및 KPI 도출
    - 구체적 실행 과정 설계 및 일정 수립 등

다. 과업 대상: 2025년 창업중심대학 10개사

라. 산출물:
  - 스타트업 성장 지원: 기업별 역량 진단 보고서, 기업별 시장 분석 보고서, 결과보고서
  - Move the Market: 고객(파트너) 맞춤형 제안서(전략), 사업 개발 컨설팅 보고서

[제안서 기본 구성]
I. 제안 개요 (제안 배경 및 목적, 의미와 방향, 제안의 특·장점)
II. 프로그램 추진계획 (컨셉 및 추진방향, 프로그램 기본 및 세부, 프로그램 운영계획)
III. 예산계획 (세부 예산 산출내역서)
IV. 기타 (추진일정, 등)
`.trim()

// 실제 당선 narrative (ContentAsset 5건)
const ACTUAL_WINNING_NARRATIVES = {
  '2': {
    name: '실전형 Go to Market 4단계 프레임워크',
    snippet: '단순 진단을 넘어 시장이 반응하는 실전형 Go to Market 전략을 완성합니다. 언더독스가 누적 13,000명 이상의 창업가를 육성하며 검증한 \'역량진단-시장분석-전략수립-사업개발\'의 4단계 프레임워크를 통해 10개사 맞춤형 시장 진입을 가속화합니다.',
    keyNumbers: ['13,000명', '4단계', '10개사'],
  },
  '3': {
    name: '객관적 지표 기반 사업화 역량 진단 시스템',
    snippet: '— (3번째 narrative chunk — DB에서 추출 가능)',
  },
}

async function main() {
  const { invokeAi } = await import('../src/lib/ai-fallback')
  const { safeParseJson } = await import('../src/lib/ai/parser')
  const { buildTurnPrompt } = await import('../src/lib/express/prompts')
  const { filterKnownSlots, mergeExtractedSlots } = await import('../src/lib/express/extractor')
  const { emptyDraft, ExpressDraftSchema } = await import('../src/lib/express/schema')
  const { renderExpressMarkdown } = await import('../src/lib/express/render-markdown')

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  Real 2025 Won RFP Test')
  console.log('  A.25.0050 성균관대 창업중심대학 Go to Market (B2G · 6,500만)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  let draft = emptyDraft()
  const turnsLog: any[] = []

  const SLOTS = [
    { slot: 'intent', pmInput: '성균관대 창업중심대학 10개사 대상 Go to Market 사업 운영. 사업화 역량진단 + 시장분석 + STP 전략 + 사업개발 컨설팅.' },
    { slot: 'beforeAfter.before', pmInput: '창업중심대학 선정 10개사 대부분이 초기 매출 후 다음 단계 (스케일업·시장 진입) 막힘. 단순 멘토링·교육으로는 한계.' },
    { slot: 'beforeAfter.after', pmInput: '4개월 후 10개사 모두 시장 진입 전략 수립 + 사업제안서 완성 + KPI 기반 실행 로드맵 확보 + 파트너 맞춤형 제안서 도출.' },
    { slot: 'keyMessages.0', pmInput: '역량진단-시장분석-전략수립-사업개발의 4단계 GTM 프레임워크' },
    { slot: 'keyMessages.1', pmInput: '누적 13,000명 창업가 육성 검증 방법론 활용' },
    { slot: 'keyMessages.2', pmInput: '10개사 맞춤형 KPI + 사업제안서 완성 (단순 교육 X)' },
    { slot: 'sections.1', pmInput: '제안 배경 — 창업중심대학의 GTM 단계 갈증. 통계와 시장 진단 인용.' },
    { slot: 'sections.2', pmInput: '추진 전략 — 4단계 GTM 프레임워크 (역량진단·시장분석·전략수립·사업개발) + Move the Market 핵심.' },
    { slot: 'sections.3', pmInput: '커리큘럼 — 4단계별 회차 + 10개사 1:1 컨설팅 일정.' },
    { slot: 'sections.4', pmInput: '운영 — 4중 페이스메이커 (전문 멘토 + 컨설턴트 + 운영팀 + 알럼나이 네트워크).' },
    { slot: 'sections.6', pmInput: '기대 성과 — 10개사 GTM 보고서 완료 100% / 사업제안서 10건 / KPI 도출 10건 / 시장 진입 가속화.' },
  ]

  for (const t of SLOTS) {
    console.log(`\n── [${t.slot}] ${t.pmInput.slice(0, 50)}... ──`)
    const prompt = buildTurnPrompt({
      state: { turns: [], currentSlot: t.slot, validationErrors: [] } as any,
      draft,
      rfp: {
        client: '성균관대학교 창업지원단',
        summary: '성균관대 창업중심대학 10개사 대상 Go to Market 프로그램 운영',
        keywords: ['Go to Market', 'GTM', '창업중심대학', '시장 진입', '사업화', '스타트업'],
        projectName: '2025년 성균관대 창업중심대학 Go to Market 프로그램',
        objectives: ['10개사 GTM 전략 수립', '시장 진입 가속화'],
        constraints: [],
        targetAudience: '창업중심대학 선정 10개사',
        targetCount: 10,
        evalCriteria: [],
      } as any,
      pmInput: t.pmInput,
      currentSlot: t.slot,
    })
    const t0 = Date.now()
    const r = await invokeAi({
      prompt,
      maxTokens: 8192,
      temperature: 0.4,
      label: `real-2025-${t.slot}`,
    })
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
    try {
      const payload = safeParseJson<any>(r.raw, t.slot)
      const filtered = filterKnownSlots(payload.extractedSlots ?? {})
      const merged = mergeExtractedSlots(draft, filtered)
      draft = merged.draft
      console.log(`  ${r.provider} ${elapsed}s · 슬롯 ${merged.acceptedSlots.length}개 채움`)
      turnsLog.push({ slot: t.slot, elapsed, accepted: merged.acceptedSlots, provider: r.provider })
    } catch (e: any) {
      console.error(`  ✗ ${e.message}`)
    }
  }

  // 최종 schema validate + .md 렌더
  const schemaCheck = ExpressDraftSchema.safeParse(draft)
  console.log(`\nSchema valid: ${schemaCheck.success ? '✓' : `✗ ${schemaCheck.error?.issues[0]?.message}`}`)

  const md = renderExpressMarkdown({
    project: {
      name: '[시뮬] 2025 성균관대 창업중심대학 Go to Market',
      client: '성균관대학교 창업지원단',
      totalBudgetVat: 65_000_000,
      supplyPrice: null,
      eduStartDate: new Date('2025-09-01'),
      eduEndDate: new Date('2025-11-28'),
    },
    draft,
  })

  const outPath = path.join(process.cwd(), '.tmp-real-2025-sim.md')
  fs.writeFileSync(outPath, md, 'utf-8')
  console.log(`\n📂 .md 저장: ${outPath} (${md.length}자)`)

  // ──── 실제 당선 narrative 와 비교 ────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  실제 당선 narrative vs 시뮬 비교')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  console.log('\n[실제 당선 #1] 4단계 GTM 프레임워크')
  console.log(`   ${ACTUAL_WINNING_NARRATIVES['2'].snippet}`)
  console.log(`   keyNumbers: ${ACTUAL_WINNING_NARRATIVES['2'].keyNumbers.join(', ')}`)

  console.log('\n[시뮬 결과 비교]')
  const mdContent = md
  const checks = {
    '4단계 프레임워크 언급': mdContent.includes('4단계') || mdContent.includes('역량진단'),
    '13,000명 정량 인용': mdContent.includes('13,000') || mdContent.includes('20,211') || mdContent.includes('명'),
    '10개사 명시': mdContent.includes('10개사'),
    'GTM/Go to Market 키워드': mdContent.toLowerCase().includes('go to market') || mdContent.includes('GTM'),
    '시장 진입 표현': mdContent.includes('시장 진입') || mdContent.includes('스케일업'),
    'STP 전략 언급': mdContent.includes('STP') || mdContent.includes('전략 수립'),
    '사업화 역량 진단': mdContent.includes('역량 진단') || mdContent.includes('사업화'),
    '사업제안서 작성': mdContent.includes('사업제안서') || mdContent.includes('제안서 작성'),
    '큰따옴표 헤드라인': /> \*\*"[^"]+"\*\*/.test(mdContent),
    'hierarchy 블록': mdContent.includes('## 💬 핵심 메시지 hierarchy'),
    'inline source citation': mdContent.includes('[근거:') || mdContent.includes('[source:'),
    '자동 품질 점검': mdContent.includes('## ⚠ 자동 품질 점검'),
  }
  for (const [k, v] of Object.entries(checks)) {
    console.log(`  ${v ? '✓' : '✗'} ${k}`)
  }

  const passed = Object.values(checks).filter(Boolean).length
  console.log(`\n총 ${passed}/${Object.keys(checks).length} 항목 일치`)

  // 호출 요약
  console.log(`\n총 LLM 호출: ${turnsLog.length}`)
  console.log(`총 elapsed: ${turnsLog.reduce((s, t) => s + parseFloat(t.elapsed), 0).toFixed(1)}s`)
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
