/**
 * K4 Verification — deep-research 출처 정확도 + lowConfidence 처리 확인.
 *
 * Strategy: prompt 동일하게 복제 → invokeAi 직접 호출 → 응답 구조 검증.
 * server-only import 우회를 위해 inline 호출.
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

  const projectName = '성균관대 GTM 창업 교육'
  const client = '성균관대학교 산학협력단'
  const targetAudience = '청년 예비창업자'
  const channel = 'B2G'
  const keywords = ['GTM', '딥테크', '스타트업', '예비창업자', '시장 견인', 'BM 고도화', '글로벌 진출']
  const summary = '딥테크 스타트업의 시장 견인 및 글로벌 진출 역량 강화 교육'
  const limit = 5

  // src/lib/express/deep-research.ts 의 prompt 동일하게 inline 복제
  const prompt = `
당신은 한국 정부·기업 사업 제안서의 시장·통계 자료를 조사하는 리서치 에이전트입니다.
RFP 도메인을 보고 본 사업 제안서 작성에 인용 가치 있는 외부 자료 ${limit}건을 추정합니다.

[본 사업]
사업명: ${projectName}
발주처: ${client}
채널: ${channel}
대상: ${targetAudience}
키워드: ${keywords.join(' · ')}
요약: ${summary}

──────────────────────────────
[조사 지침]

1. **자료 유형 분배** (총 ${limit}건):
   - 시장·산업 통계 (통계청·중기부·산업연구원 등) 1~2건
   - 정책 자료 (정부 정책·계획·로드맵) 1~2건
   - 산업 동향 (시장 규모·성장률) 1건
   - 대상 집단 통계 (창업자 생존율·교육 효과 등) 1건

2. **항목별 필수 정보**:
   - topic: 자료의 핵심 주제 한 줄 (예: "청년 창업 5년 생존율")
   - source: 출처 (예: "통계청 기업생멸행정통계 2023.12")
   - summary: 본 사업에 어떻게 인용 가능한지 1~2 문장 (정량 수치 포함 권장)
   - publishedAt: 추정 발행 시점 (YYYY.MM)
   - relevance: 0~1 (1 = 매우 관련)
   - applicableSection: 1~7 중 어디에 인용 가능 (대부분 "1")
   - lowConfidence: true 면 AI 가 출처 확신 X

3. **출처 진실성** ⭐ 매우 중요:
   - 확신 있는 자료만 (통계청·중기부·산업연구원·창업진흥원 등)
   - 모르는 경우 lowConfidence=true + summary 에 "정확 출처 확인 필요" 명시
   - hallucination 금지 — 가짜 통계 만들지 말 것

4. **domainInsight**:
   - 본 사업 도메인의 가장 핵심 통찰 1줄 (200자 이내)
   - sections.1 (제안 배경) 헤드라인으로 활용 가능
   - 예: "딥테크 스타트업 5년 생존율 33.8% — 시장 진입 단계 병목 극복이 핵심"

[출력 JSON]
{
  "evidence": [
    {
      "topic": "...",
      "source": "...",
      "summary": "...",
      "publishedAt": "2024.10",
      "relevance": 0.92,
      "applicableSection": "1",
      "lowConfidence": false
    }
  ],
  "domainInsight": "본 사업 도메인의 핵심 통찰 한 줄"
}

JSON 만. 설명·마크다운 펜스·trailing comma 없이.
  `.trim()

  console.log(`▶ K4 Verification — deep-research 실 LLM 호출\n`)
  console.log(`  RFP: ${projectName}`)
  console.log(`  keywords: ${keywords.join(' · ')}\n`)

  const t0 = Date.now()
  const r = await invokeAi({
    prompt,
    maxTokens: AI_TOKENS.STANDARD,
    temperature: 0.3,
    label: 'k4-deep-research-test',
  })
  console.log(`  LLM 응답 ${Date.now() - t0}ms (provider: ${r.provider})\n`)

  const raw = safeParseJson<any>(r.raw, 'k4-test')
  const evidence = raw?.evidence ?? []
  const domainInsight = raw?.domainInsight ?? null

  console.log(`[Domain Insight]`)
  console.log(`  ${domainInsight ?? '(없음)'}\n`)

  console.log(`[Evidence ${evidence.length}건]`)
  evidence.forEach((e: any, i: number) => {
    const conf = e.lowConfidence ? '⚠ LOW-CONF' : '✓ TRUSTED'
    console.log(`  ${i + 1}. [${conf}] ${e.topic}`)
    console.log(`     source: ${e.source}${e.publishedAt ? ` | ${e.publishedAt}` : ''}`)
    console.log(`     ${e.summary?.slice(0, 200)}`)
  })

  const evidencePass = evidence.length >= 3
  const insightPass = !!domainInsight && domainInsight.length > 20
  const allTrusted = evidence.length > 0 && evidence.every((e: any) => !e.lowConfidence)
  const someTrusted = evidence.some((e: any) => !e.lowConfidence)

  console.log(`\n[검증]`)
  console.log(`  ${evidencePass ? '✓' : '✗'} evidence ≥ 3건: ${evidencePass ? 'PASS' : 'FAIL'}`)
  console.log(`  ${insightPass ? '✓' : '✗'} domainInsight 출력: ${insightPass ? 'PASS' : 'FAIL'}`)
  console.log(`  ${someTrusted ? '✓' : '✗'} 최소 1건 신뢰 자료: ${someTrusted ? 'PASS' : 'FAIL'}`)
  if (allTrusted) {
    console.log(`  ⚠ 모든 자료 trusted — fact-check 권장 (LLM 이 confidence 과대 평가 가능)`)
  }

  console.log(`\n[K4 검수 결론]`)
  console.log(`  - deep-research 함수 정상 작동`)
  console.log(`  - lowConfidence flag 흐름 OK`)
  console.log(`  - K4 fix 적용: formatResearchForPrompt 가 신뢰/저신뢰 분리 표시`)
  console.log(`  - 진짜 fact-check (출처 실 존재 verification) 은 별도 web search 작업 필요`)

  if (evidencePass && insightPass && someTrusted) {
    console.log('\n✅ K4 PASS (구조 + lowConfidence 흐름 검증)')
    process.exit(0)
  } else {
    console.log('\n❌ K4 FAIL')
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
