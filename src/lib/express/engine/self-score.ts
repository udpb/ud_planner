/**
 * self-score — 기본 Rubric self-score (EX-1, Tech Spec §6 8라인)
 *
 * 단일 Pro judge, 단일 샘플. 정제 루프(index.ts)가 약점 섹션을 재작성할 수 있도록
 * overall + 라인별 점수 + weakest top-3 만 산출한다.
 *
 * ⚠️ full panel(다중 심사 n≥3)·calibration(gold set κ)·위치 편향 무작위화는 **EVAL-1 범위**.
 *    여기 THRESHOLD/MAX_REFINE 상수는 EVAL-1 에서 과거 당선/탈락 라벨로 calibration 예정(가변).
 *
 * 직접 SDK 금지 — invokeAi(Pro). JSON = safeParseJson.
 */

import 'server-only'

import { invokeAi } from '@/lib/ai-fallback'
import { AI_TOKENS, modelFor } from '@/lib/ai/config'
import { safeParseJson } from '@/lib/ai/parser'
import { log } from '@/lib/logger'
import { SECTION_LABELS } from '../schema'
import type { ExpressDraft } from '../schema'
import type { SelfScore, ScoreLine } from './types'

/**
 * Tech Spec §6.1 8 라인 (한국 70/30 정렬). weight 는 §6.1 표 그대로(compliance=gate→15 환산).
 * 가변 데이터 — EVAL-1 calibration 대상.
 */
const RUBRIC_LINES: { key: string; label: string; weight: number }[] = [
  { key: 'compliance', label: 'RFP compliance (요구 누락 0)', weight: 15 },
  { key: 'understanding', label: '사업이해도·tailoring (발주처 맥락 인용)', weight: 15 },
  { key: 'strategy', label: '추진전략·logic chain', weight: 30 },
  { key: 'differentiation', label: '차별성 (discriminator + proof)', weight: 15 },
  { key: 'evidence', label: '증거 밀도 (근거 주장 비율·금지어 0·조작 0)', weight: 15 },
  { key: 'impact', label: '기대효과·SROI (outcome map·정렬)', weight: 10 },
  { key: 'risk', label: '위험·품질관리 (리스크 레지스터)', weight: 10 },
  { key: 'ergonomics', label: 'ergonomics (문단≤6줄·문장≤20단어·10초 규칙)', weight: 5 },
]

/** index.ts 가 import — 정제 루프 임계·최대 반복 (가변, EVAL-1 calibration 예정). */
export const SCORE_THRESHOLD = 78
export const MAX_REFINE = 2

function sectionsBlock(draft: ExpressDraft): string {
  const sections = draft.sections ?? {}
  return (['1', '2', '3', '4', '5', '6', '7'] as const)
    .map((k) => {
      const t = sections[k]
      return t
        ? `### sections.${k} ${SECTION_LABELS[k]}\n${t.slice(0, 900)}`
        : `### sections.${k} ${SECTION_LABELS[k]}\n(비어 있음)`
    })
    .join('\n\n')
}

export async function selfScore(draft: ExpressDraft): Promise<SelfScore> {
  const km = (draft.keyMessages ?? []).filter(Boolean).join(' / ') || '(없음)'
  const linesSpec = RUBRIC_LINES.map((l) => `- ${l.key} (가중 ${l.weight}): ${l.label}`).join('\n')

  const prompt = `
당신은 한국 정부·기업 RFP 평가위원입니다. 아래 제안서 1차본을 8개 채점 라인으로 0~100 채점하세요.
관대하지 말고 평가위원 시각으로 엄격히. 비어 있거나 추상적이면 낮게.

[핵심 메시지]
${km}

[7 섹션]
${sectionsBlock(draft)}

[채점 라인 (0~100 each)]
${linesSpec}

[채점 지침]
- compliance: RFP 요구가 섹션에 매핑되었나. 누락 많으면 낮게.
- evidence: 정량 근거·구체 사실 비율. 추상 슬로건·조작 의심 수치는 감점.
- strategy: 과업 조합의 논리 사슬이 명확한가 (가중 최대 — 가장 중요).
- ergonomics: 문단·문장 길이, 가독성.
- 약점 top-3 는 점수가 가장 낮은 라인 또는 가장 약한 섹션 키('1'~'7')로 지목.

[출력 JSON]
{
  "lines": [ { "key": "compliance", "score": 0~100 }, ... 8개 전부 ],
  "weakest": ["3", "evidence", "5"]   // 점수 낮은 섹션 키 또는 라인 key (top-3)
}
JSON 만. 마크다운 펜스·설명·trailing comma 금지.
`.trim()

  try {
    const r = await invokeAi({
      prompt,
      // judge — Pro (판단 품질 직결, Flash-우세 예외 2키 중 하나, ADR-022 §4).
      model: modelFor('engine.self-score'),
      maxTokens: AI_TOKENS.STANDARD,
      temperature: 0.2,
      label: 'engine.selfScore',
    })
    const raw = safeParseJson<{
      lines?: { key?: string; score?: number }[]
      weakest?: string[]
    }>(r.raw, 'engine.selfScore')

    const scoreByKey = new Map<string, number>()
    for (const l of raw?.lines ?? []) {
      if (typeof l?.key === 'string' && typeof l?.score === 'number') {
        scoreByKey.set(l.key, Math.max(0, Math.min(100, l.score)))
      }
    }

    const lines: ScoreLine[] = RUBRIC_LINES.map((spec) => ({
      key: spec.key,
      weight: spec.weight,
      score: scoreByKey.get(spec.key) ?? 50, // 미응답 라인은 중립 50
    }))

    const totalWeight = lines.reduce((s, l) => s + l.weight, 0)
    const overall = Math.round(
      lines.reduce((s, l) => s + l.score * l.weight, 0) / totalWeight,
    )

    const weakest = Array.isArray(raw?.weakest)
      ? raw.weakest.filter((w) => typeof w === 'string').slice(0, 3)
      : []

    // weakest 가 비면 점수 하위 라인에서 도출
    const fallbackWeak = [...lines].sort((a, b) => a.score - b.score).slice(0, 3).map((l) => l.key)

    return {
      overall,
      lines,
      weakest: weakest.length > 0 ? weakest : fallbackWeak,
    }
  } catch (e) {
    log.warn('engine.selfScore', '실패 → 중립 점수', {
      err: e instanceof Error ? e.message : String(e),
    })
    const lines: ScoreLine[] = RUBRIC_LINES.map((spec) => ({
      key: spec.key,
      weight: spec.weight,
      score: 50,
    }))
    return { overall: 50, lines, weakest: ['strategy', 'evidence', 'understanding'] }
  }
}
