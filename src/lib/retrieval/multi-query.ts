/**
 * Multi-query 확장 — HyDE + 분해 (RET-1, Tech Spec §4.2, 모델 2-tier ADR-022).
 *
 * 단일 질의를 여러 변형으로 확장해 검색 recall 을 높인다:
 *  - hyde(): 가상의 "당선 제안서 문단" 생성 → 답변-스타일 임베딩으로 검색 (HyDE).
 *  - decompose(): 복합 질의를 하위 질의로 분해.
 *
 * 모델: 둘 다 **Flash**(plumbing). invokeAi 시그니처는 불변이므로 모델 override 가
 * 필요한 Flash 호출은 gemini.ts 의 invokeGemini({ model: FLASH_MODEL }) 직접 호출
 * (단일 진입점 예외 — eslint 화이트리스트). 실패 시 graceful: 원쿼리만 쓰도록 호출부가
 * 처리할 수 있게 빈/단순 결과 반환.
 */

import 'server-only'

import { invokeGemini } from '@/lib/gemini'
import { FLASH_MODEL, AI_TOKENS } from '@/lib/ai/config'
import { safeParseJson } from '@/lib/ai/parser'
import { log } from '@/lib/logger'

/**
 * HyDE — 질의에 대한 가상의 당선 제안서 문단 1개를 Flash 로 생성.
 * 이 문단을 임베딩해 "답변↔답변" 유사도로 검색하면 "질문↔답변" 보다 recall 이 높다.
 * 실패 시 원 질의를 그대로 반환(graceful).
 */
export async function hyde(query: string): Promise<string> {
  const q = query.trim()
  if (q.length < 4) return q
  try {
    const r = await invokeGemini({
      model: FLASH_MODEL,
      maxTokens: AI_TOKENS.LIGHT,
      temperature: 0.3,
      prompt:
        '당신은 정부·기업 사업 제안서 전문가입니다. 아래 검색 질의에 대해, ' +
        '실제 당선 제안서에 등장할 법한 자연스러운 한국어 문단 1개(3~5문장)를 작성하세요. ' +
        '검색용 가상 문단이므로 군더더기·머리말 없이 본문만 출력합니다.\n\n' +
        `질의: ${q}\n\n가상 당선 제안서 문단:`,
    })
    const out = r.raw.trim()
    return out.length > 0 ? out : q
  } catch (e) {
    log.warn('ret.hyde', 'HyDE 생성 실패 → 원쿼리 사용', {
      err: e instanceof Error ? e.message : String(e),
    })
    return q
  }
}

/**
 * 복합 질의를 하위 질의 2~4개로 분해 (Flash, JSON 배열).
 * 단순/단일 의도면 분해할 것이 없어 [] 를 반환할 수 있다.
 * 실패 시 [] (graceful — 호출부는 원쿼리만 사용).
 */
export async function decompose(query: string): Promise<string[]> {
  const q = query.trim()
  if (q.length < 8) return []
  try {
    const r = await invokeGemini({
      model: FLASH_MODEL,
      maxTokens: AI_TOKENS.LIGHT,
      temperature: 0.2,
      prompt:
        '아래 검색 질의를 의미적으로 독립된 하위 질의로 분해하세요. ' +
        '복합 의도(예: 여러 주제·요구사항)가 섞여 있을 때만 2~4개로 나누고, ' +
        '단일 의도면 빈 배열을 반환합니다. ' +
        '반드시 JSON 문자열 배열만 출력하세요 (마크다운·설명 금지).\n\n' +
        `질의: ${q}\n\n예: ["하위 질의 1", "하위 질의 2"]`,
    })
    const parsed = safeParseJson<unknown>(r.raw, 'ret.decompose')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .map((x) => x.trim())
      .slice(0, 4)
  } catch (e) {
    log.warn('ret.decompose', '분해 실패 → 분해 없음', {
      err: e instanceof Error ? e.message : String(e),
    })
    return []
  }
}

/**
 * 질의 → 확장 질의 집합 (원쿼리 + HyDE + 분해). 중복 제거.
 * useMultiQuery=false 면 [원쿼리]만 반환(호출부가 결정).
 */
export async function expandQueries(query: string): Promise<string[]> {
  const base = query.trim()
  const [hydeDoc, subs] = await Promise.all([hyde(base), decompose(base)])
  const set = new Set<string>([base])
  if (hydeDoc && hydeDoc !== base) set.add(hydeDoc)
  for (const s of subs) set.add(s)
  return Array.from(set)
}
