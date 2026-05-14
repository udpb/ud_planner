/**
 * FactCheckLight — Express 2.0 (Phase M1, 2026-05-14)
 *
 * 슬기님 5 원칙 中 "팩트체크" 직접 대응:
 *   1차본 sections 에서 정량 수치·정책 인용·발주처 정보·자사 실적·외부 인용을
 *   정규식으로 추출 → AI 1회 검증 (B2G/B2B 만, 토큰 ~2K).
 *
 * 5 카테고리:
 *   - quant-stat:   정량 통계 ("70%", "5,000명", "300건")
 *   - policy-cite:  정책·법령 ("국정과제 ~", "기본계획", "~법")
 *   - client-info:  발주처 관련 정보 (발주처명·부서명·예산·기수)
 *   - own-record:   자사 실적 ("UD 누적 ~", "현재 ~명")
 *   - external-cite: 외부 인용 ("~원 발표", "한국~ 자료")
 *
 * 5 검증 상태:
 *   - verified:      AI 가 출처 확인 또는 명백한 사실
 *   - suspicious:    숫자가 비현실적이거나 출처 없는 인용
 *   - unverifiable:  검증 불가 (구글 검색해도 모름)
 *   - needs-source:  사실이지만 출처 명시 필요
 *   - outdated:      오래된 통계 (2년 이상)
 *
 * 호출 시점: 1차본 조립 직전. AI 호출은 정규식으로 5건 이상 추출 시에만.
 *
 * 관련: docs/decisions/013-express-v2-auto-diagnosis.md §결정 §1.4
 */

import 'server-only'
import { invokeAi } from '@/lib/ai-fallback'
import { safeParseJson } from '@/lib/ai/parser'
import { AI_TOKENS } from '@/lib/ai/config'
import { log } from '@/lib/logger'
import type { ExpressDraft } from './schema'

// ─────────────────────────────────────────
// 1. 추출 카테고리
// ─────────────────────────────────────────

export type FactCategory =
  | 'quant-stat'
  | 'policy-cite'
  | 'client-info'
  | 'own-record'
  | 'external-cite'

export type FactStatus =
  | 'verified'
  | 'suspicious'
  | 'unverifiable'
  | 'needs-source'
  | 'outdated'

export interface ExtractedFact {
  /** 카테고리 */
  category: FactCategory
  /** 원문 (sections 또는 keyMessages 에서 잘라온 ~80자) */
  excerpt: string
  /** 어느 섹션/필드에서 나왔나 */
  source: string
  /** 매칭된 핵심 수치·인용 단편 */
  match: string
  /** 검증 상태 (정규식 단계는 needs-source / unverifiable 기본, AI 가 verified/suspicious/outdated 로 갱신) */
  status: FactStatus
  /** AI 진단 시 보강 사유 */
  note?: string
}

// ─────────────────────────────────────────
// 2. 정규식 사전 (단순·빠름)
// ─────────────────────────────────────────

/** 정량 통계 — 숫자 + 단위 (백분율·명·건·억·만원) */
const QUANT_PATTERNS: RegExp[] = [
  /\d{1,3}(?:,\d{3})*\.?\d*\s?%/g,
  // 단위 — 원 생략 가능 (억 / 억원 둘 다 캡처)
  /\d{1,3}(?:,\d{3})*\s?(?:명|건|개|회|만\s?원?|억\s?원?|조\s?원?|시간|주|개월|년|배|점)/g,
]

/** 정책·법령 인용 */
const POLICY_PATTERNS: RegExp[] = [
  /(?:국정과제|기본계획|시행령|시행규칙|기본법|특별법|진흥법|육성법)/g,
  /제\s?\d+\s?차\s?(?:기본계획|종합계획|시행계획)/g,
  /\d{4}\s?(?:년\s?)?(?:정부|국정|기획재정부|중기부|교육부|문체부|과기정통부)\s?(?:발표|계획|정책)/g,
]

/** 발주처 정보 — "~~기"(기수) "~~사업단" 등 */
const CLIENT_PATTERNS: RegExp[] = [
  /\d+\s?기\s?(?:사업|과정|기수)/g,
  /(?:발주처|주관|운영|사업)\s?(?:기관|단)/g,
]

/** 자사 실적 — "누적 ~", "총 ~명", "운영 ~회차" */
const OWN_RECORD_PATTERNS: RegExp[] = [
  /(?:누적|총|운영)\s?\d{1,3}(?:,\d{3})*\s?(?:명|건|개|회|기수)/g,
  /(?:UD|언더독스|underdogs)\s?[^\s.,]{0,30}/g,
]

/** 외부 인용 — "~~원 발표", "한국~ 자료", "창업진흥원 발표" 등 */
const EXTERNAL_PATTERNS: RegExp[] = [
  /(?:한국|국가|국제|OECD|World\s?Bank|Statista|KDI|KOTRA)\s?[^\s.,]{0,20}\s?(?:발표|자료|통계|연구|분석|보고)/g,
  /(?:통계청|중소벤처기업부|기획재정부|교육부|문체부|과기정통부)\s?[^\s.,]{0,15}\s?(?:발표|자료|통계|보고)/g,
  // 진흥원·공단·재단·연구원 등 한국 공공기관 인용 패턴 (가장 흔함)
  /[가-힣A-Za-z]{2,8}(?:진흥원|공단|재단|연구원|위원회|협회)\s?\d{0,4}\s?(?:발표|자료|통계|보고|연구|분석)/g,
]

const CATEGORY_PATTERNS: Record<FactCategory, RegExp[]> = {
  'quant-stat': QUANT_PATTERNS,
  'policy-cite': POLICY_PATTERNS,
  'client-info': CLIENT_PATTERNS,
  'own-record': OWN_RECORD_PATTERNS,
  'external-cite': EXTERNAL_PATTERNS,
}

// ─────────────────────────────────────────
// 3. 결과 타입
// ─────────────────────────────────────────

export interface FactCheckDiagnosis {
  totalFacts: number
  byCategory: Record<FactCategory, number>
  byStatus: Record<FactStatus, number>
  facts: ExtractedFact[]
  mode: 'regex' | 'ai+regex'
}

// ─────────────────────────────────────────
// 4. 메인 함수
// ─────────────────────────────────────────

export async function checkFacts(
  draft: ExpressDraft,
  options: { aiVerify?: boolean } = {},
): Promise<FactCheckDiagnosis> {
  // 1) 모든 텍스트 코퍼스 수집 (sections + intent + keyMessages)
  const corpus: Array<{ source: string; text: string }> = []
  if (draft.intent) corpus.push({ source: 'intent', text: draft.intent })
  if (draft.beforeAfter?.before) corpus.push({ source: 'before', text: draft.beforeAfter.before })
  if (draft.beforeAfter?.after) corpus.push({ source: 'after', text: draft.beforeAfter.after })
  draft.keyMessages?.forEach((m, i) => corpus.push({ source: `keyMessage.${i}`, text: m }))
  Object.entries(draft.sections ?? {}).forEach(([k, v]) => {
    if (v) corpus.push({ source: `sections.${k}`, text: v })
  })

  // 2) 정규식 추출
  const facts = extractFactsByRegex(corpus)

  // 3) AI 검증 (선택, 5건 이상일 때만)
  const shouldAi = options.aiVerify !== false && facts.length >= 5
  let finalFacts = facts
  let mode: 'regex' | 'ai+regex' = 'regex'
  if (shouldAi) {
    try {
      finalFacts = await verifyFactsWithAi(facts)
      mode = 'ai+regex'
    } catch (err) {
      log.warn('fact-check-light', 'AI 검증 실패 — regex-only fallback', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // 4) 통계 집계
  const byCategory: Record<FactCategory, number> = {
    'quant-stat': 0,
    'policy-cite': 0,
    'client-info': 0,
    'own-record': 0,
    'external-cite': 0,
  }
  const byStatus: Record<FactStatus, number> = {
    verified: 0,
    suspicious: 0,
    unverifiable: 0,
    'needs-source': 0,
    outdated: 0,
  }
  for (const f of finalFacts) {
    byCategory[f.category] += 1
    byStatus[f.status] += 1
  }

  return {
    totalFacts: finalFacts.length,
    byCategory,
    byStatus,
    facts: finalFacts.slice(0, 40), // UI 부하 cap
    mode,
  }
}

// ─────────────────────────────────────────
// 5. 정규식 추출
// ─────────────────────────────────────────

function extractFactsByRegex(
  corpus: Array<{ source: string; text: string }>,
): ExtractedFact[] {
  const facts: ExtractedFact[] = []

  for (const { source, text } of corpus) {
    for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS) as [
      FactCategory,
      RegExp[],
    ][]) {
      for (const re of patterns) {
        // 매번 lastIndex reset
        re.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = re.exec(text)) !== null) {
          const matchStr = m[0]
          const start = Math.max(0, m.index - 30)
          const end = Math.min(text.length, m.index + matchStr.length + 30)
          const excerpt = text.slice(start, end).replace(/\s+/g, ' ').trim()

          // 중복 제거 (같은 source + match)
          if (facts.some((f) => f.source === source && f.match === matchStr)) continue

          facts.push({
            category,
            excerpt,
            source,
            match: matchStr,
            // 정량·외부 인용은 출처 검증 필요, 정책/발주처/자사 실적은 일단 unverifiable
            status:
              category === 'quant-stat' || category === 'external-cite'
                ? 'needs-source'
                : 'unverifiable',
          })

          // 무한 루프 방어
          if (m.index === re.lastIndex) re.lastIndex += 1
        }
      }
    }
  }

  return facts
}

// ─────────────────────────────────────────
// 6. AI 검증 (선택)
// ─────────────────────────────────────────

interface AiFactVerifyResponse {
  facts: Array<{
    match: string
    source: string
    status: FactStatus
    note?: string
  }>
}

async function verifyFactsWithAi(
  facts: ExtractedFact[],
): Promise<ExtractedFact[]> {
  // 상위 20건만 AI 검증 (토큰 한도)
  const target = facts.slice(0, 20)
  const factsBlock = target
    .map(
      (f, i) =>
        `${i + 1}. [${f.category}] (${f.source}) "${f.match}" — 문맥: "${f.excerpt}"`,
    )
    .join('\n')

  const prompt = `당신은 제안서 팩트체크 전문 검토자입니다.
아래 추출 사실 ${target.length}건 각각을 5 상태로 분류하세요.

[추출 사실]
${factsBlock}

[5 검증 상태]
- verified:      명백한 사실 또는 합리적 추정치
- suspicious:    숫자가 비현실적, 또는 출처 없는 강한 주장
- unverifiable:  검증 불가 (자사 내부 데이터 등)
- needs-source:  사실이지만 출처 명시가 필요
- outdated:      통계가 오래되었음 (2024 이전이면 의심)

반드시 아래 JSON 만 반환:
{
  "facts": [
    {"match": "70%", "source": "sections.1", "status": "needs-source", "note": "출처 인용 1줄 추가 권장"},
    ...
  ]
}`

  const result = await invokeAi({
    prompt,
    maxTokens: AI_TOKENS.LIGHT,
    temperature: 0.2,
    label: 'fact-check-light',
  })

  const parsed = safeParseJson<AiFactVerifyResponse>(result.raw, 'fact-check-light')

  // AI 응답 merge — match + source 매칭
  const byKey = new Map<string, AiFactVerifyResponse['facts'][number]>()
  for (const f of parsed.facts ?? []) {
    byKey.set(`${f.source}::${f.match}`, f)
  }

  return facts.map((f) => {
    const aiUpdate = byKey.get(`${f.source}::${f.match}`)
    if (!aiUpdate) return f
    return {
      ...f,
      status: aiUpdate.status,
      note: aiUpdate.note,
    }
  })
}
