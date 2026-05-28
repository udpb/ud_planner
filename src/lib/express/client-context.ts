/**
 * Client Context Fetch — Phase H1 (2026-05-28)
 *
 * 발주처 정보 (client, projectName, projectType) → Gemini 1회 호출로
 * 발주처의 unique context 조사:
 *   - 과거 유사 사업 (있다면 어떤 패턴이었는지)
 *   - 발주처의 우선 KPI / 평가 성향
 *   - 핵심 어휘 (발주처 특유의 정책 용어 · 산업 키워드)
 *   - 평가위원이 갖는 의문/관심사
 *
 * 결과: ClientContext 객체 — buildTurnPrompt 에 주입.
 * generic 1차본을 **발주처 특화 1차본**으로 업그레이드.
 *
 * 한계:
 *   - LLM 의 학습 데이터 기반 (실시간 X)
 *   - 발주처가 잘 알려지지 않으면 hallucination 위험 → '확신 없으면 비워두기' 지시
 *   - 보수적 fallback: 실패 시 empty context 반환 (graceful)
 */

import 'server-only'

import { invokeAi } from '@/lib/ai-fallback'
import { AI_TOKENS } from '@/lib/ai/config'
import { safeParseJson } from '@/lib/ai/parser'
import { z } from 'zod'

export const ClientContextSchema = z.object({
  /** 발주처 핵심 미션 / 사업 영역 (1~2 문장) */
  mission: z.string().max(300).optional(),
  /** 과거 유사 사업 경험 — 있다면 핵심 키워드 3~5개 */
  pastInitiatives: z.array(z.string().max(120)).max(5).optional(),
  /** 발주처 우선 KPI 또는 평가 성향 (예: "정량 성과 중시", "지역 파급력 강조") */
  evaluationLean: z.array(z.string().max(120)).max(5).optional(),
  /** 발주처 특유의 정책 어휘 · 산업 키워드 (본문에 자연스럽게 박을 수 있는 표현) */
  signatureVocab: z.array(z.string().max(60)).max(10).optional(),
  /** 평가위원이 가질 만한 의문/관심사 — produceRisks 에 활용 */
  likelyQuestions: z.array(z.string().max(200)).max(5).optional(),
  /** 발주처가 강조할 만한 차별점 (예: "타 운영사 대비 X 가 핵심") — 본문에 회사명 X */
  differentiationHints: z.array(z.string().max(200)).max(3).optional(),
  /** AI 가 정보 부족하다고 판단한 경우 true — 사용자에게 외부 LLM 카드 제안 */
  lowConfidence: z.boolean().default(false),
})

export type ClientContext = z.infer<typeof ClientContextSchema>

const EMPTY_CONTEXT: ClientContext = { lowConfidence: true }

export interface FetchClientContextInput {
  /** 발주처 이름 (예: "성균관대학교 창업지원단") */
  client: string
  /** 사업명 (예: "2025 성균관대 창업중심대학 Go to Market") */
  projectName?: string | null
  /** 채널 (B2G/B2B/renewal) */
  channel?: 'B2G' | 'B2B' | 'renewal'
  /** RFP 요약 — 발주처와 사업 도메인 연결용 */
  rfpSummary?: string | null
}

export async function fetchClientContext(
  input: FetchClientContextInput,
): Promise<ClientContext> {
  if (!input.client || input.client.trim().length < 2) return EMPTY_CONTEXT

  const prompt = `
당신은 한국 정부·기업 사업 발주처를 깊이 분석하는 리서치 에이전트입니다.
다음 발주처에 대해 본 사업 제안서 작성에 직접 도움 되는 unique context 를 조사합니다.

발주처: ${input.client}
${input.projectName ? `사업명: ${input.projectName}` : ''}
${input.channel ? `채널: ${input.channel}` : ''}
${input.rfpSummary ? `RFP 요약: ${input.rfpSummary.slice(0, 600)}` : ''}

[조사 지침]
1. **확신 있는 정보만** — 모르면 lowConfidence=true. hallucination 금지.
2. **본 사업과 연결되는 컨텍스트만** — generic 회사 소개 X.
3. **발주처가 1차본에서 듣고 싶은 메시지를 추정** — 평가위원의 관점.
4. **차별점 hints 에 경쟁 운영사 이름 직접 언급 금지** — 우리만의 가치를 우회 표현.

[출력 JSON]
{
  "mission": "발주처 핵심 미션 1~2문장 (확신 있을 때만)",
  "pastInitiatives": ["과거 유사 사업 핵심 키워드 3~5개 (예: '청년 창업 패키지', '대학 발 기업가정신 강화')"],
  "evaluationLean": ["평가 성향 1~3개 (예: '정량 성과 중시', '재무 건전성 평가 우선', '지역 균형 강조')"],
  "signatureVocab": ["발주처 특유 어휘 3~10개 — 본문 자연스럽게 박을 수 있는 표현 (예: '산학협력', '글로컬 캠퍼스')"],
  "likelyQuestions": ["평가위원이 가질 의문 3~5개 (예: '4개월 안에 가능한가', '예산 대비 임팩트 정량은')"],
  "differentiationHints": ["우리만의 차별 hints — 회사명 X. 단 컨텍스트는 활용. (예: '단순 멘토링 X 실행 견인이 핵심')"],
  "lowConfidence": <발주처 정보 부족하면 true>
}

JSON 만 출력. 설명·마크다운 펜스 없이.
  `.trim()

  try {
    const r = await invokeAi({
      prompt,
      maxTokens: AI_TOKENS.STANDARD,
      temperature: 0.3, // 보수적 — hallucination 최소화
      label: 'client-context-fetch',
    })
    const raw = safeParseJson<unknown>(r.raw, 'client-context')
    const validated = ClientContextSchema.safeParse(raw)
    if (!validated.success) {
      console.warn('[client-context] zod 검증 실패 → coerce:', validated.error.message)
      return coerceContext(raw)
    }
    return validated.data
  } catch (err) {
    console.warn('[client-context] fetch 실패 → empty context:', err)
    return EMPTY_CONTEXT
  }
}

function coerceContext(raw: unknown): ClientContext {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const toArr = (v: unknown, max: number) =>
    Array.isArray(v) ? (v.filter((x) => typeof x === 'string').slice(0, max) as string[]) : undefined
  return {
    mission: typeof obj.mission === 'string' ? obj.mission.slice(0, 300) : undefined,
    pastInitiatives: toArr(obj.pastInitiatives, 5),
    evaluationLean: toArr(obj.evaluationLean, 5),
    signatureVocab: toArr(obj.signatureVocab, 10),
    likelyQuestions: toArr(obj.likelyQuestions, 5),
    differentiationHints: toArr(obj.differentiationHints, 3),
    lowConfidence: Boolean(obj.lowConfidence),
  }
}

/**
 * Prompt 주입용 compact format — buildTurnPrompt 에서 호출.
 * 빈 context 면 empty string 반환.
 */
export function formatClientContextForPrompt(ctx: ClientContext | null | undefined): string {
  if (!ctx) return ''
  if (ctx.lowConfidence && !ctx.mission && !ctx.pastInitiatives?.length) return ''

  const parts: string[] = []
  if (ctx.mission) parts.push(`발주처 미션: ${ctx.mission}`)
  if (ctx.pastInitiatives?.length) {
    parts.push(`과거 유사 사업 키워드: ${ctx.pastInitiatives.join(' · ')}`)
  }
  if (ctx.evaluationLean?.length) {
    parts.push(`평가 성향: ${ctx.evaluationLean.join(' · ')}`)
  }
  if (ctx.signatureVocab?.length) {
    parts.push(`발주처 어휘 (본문 자연 박음 권장): ${ctx.signatureVocab.join(' · ')}`)
  }
  if (ctx.likelyQuestions?.length) {
    parts.push(`평가위원 의문: ${ctx.likelyQuestions.map((q) => `"${q}"`).join(' · ')}`)
  }
  if (ctx.differentiationHints?.length) {
    parts.push(`차별 hints (회사명 X, 어휘만 활용): ${ctx.differentiationHints.join(' · ')}`)
  }
  if (ctx.lowConfidence) parts.push('⚠ AI 확신 낮음 — generic 톤 회피, 외부 LLM 카드 권장')

  return parts.join('\n')
}
