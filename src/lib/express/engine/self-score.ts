/**
 * self-score — Rubric self-score judge (EX-1 → EVAL-1, Tech Spec §6)
 *
 * Pro judge(`modelFor('engine.self-score')`), **다중 샘플 n=3**(EVAL-1).
 *   - EX-2 산출물(win-theme·compliance·verifyReport)을 judge 입력으로 받아(extras)
 *     evidence·차별성·compliance·risk 렌즈가 채점에 반영되게 한다(이전엔 sections+keyMessages만 봐서
 *     EX-2가 만든 품질이 점수에 안 잡혔다).
 *   - n=3 호출(temperature 약간 분산) → 라인별 **median**, overall=median 가중합 (위치/길이 편향·
 *     단일 샘플 노이즈 완화, Tech Spec §6.3 다중 심사). lineFeedback(라인별 "왜 낮은지")도 수집해
 *     refine 루프(index.ts)가 약점 섹션을 타깃 개선하도록 주입한다.
 *
 * overall + 라인별 점수 + weakest top-3 + lineFeedback 을 산출한다.
 *
 * ⚠️ calibration(gold set κ)은 후속. 여기 THRESHOLD/MAX_REFINE 상수는 가변(EVAL calibration 대상).
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
import type { WinThemeDraft } from './win-theme'
import type { ComplianceMatrix } from './compliance'
import type { VerifyReport } from './verify'

/**
 * Tech Spec §6.1 8 라인 (한국 70/30 정렬). weight 는 §6.1 표 그대로(compliance=gate→15 환산).
 * 가변 데이터 — calibration 대상.
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

/** index.ts 가 import — 정제 루프 임계·최대 반복 (가변, calibration 예정). */
export const SCORE_THRESHOLD = 78
export const MAX_REFINE = 2

/**
 * judge 다중 샘플 수 (Tech Spec §6.3 — 단일 모델 단일 샘플의 위치/길이 편향·노이즈 완화).
 * ⚠️ EVAL 비용: judge=Pro × N_SAMPLES 콜/채점. draft 1건당 self-score 호출이 (1+MAX_REFINE)회이므로
 *    최악 (1+2)×3 = 9 Pro 콜. RPD 한도 유의 — 측정은 소수 RFP로.
 */
const N_SAMPLES = 3
/** 샘플별 temperature (분산 — 동일 프롬프트라도 약간 다른 시점). */
const SAMPLE_TEMPS = [0.1, 0.3, 0.5]

/** EX-2 산출물 — judge 입력(옵셔널, 하위호환). */
export interface SelfScoreExtras {
  winThemes?: WinThemeDraft[]
  compliance?: ComplianceMatrix
  verifyReport?: VerifyReport
}

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

/** win-theme 블록 — discriminator·benefit·quantified + proof 개수 (차별성·증거 채점 입력). */
function winThemesBlock(winThemes?: WinThemeDraft[]): string {
  if (!winThemes || winThemes.length === 0) {
    return '(win-theme 0건 — 차별점이 proof chain 으로 입증되지 않음. 차별성·증거 낮게.)'
  }
  return winThemes
    .slice(0, 5)
    .map(
      (w) =>
        `- [${w.rank}] 차별점: ${w.discriminator}\n  편익: ${w.benefit}${
          w.quantified ? `\n  정량: ${w.quantified}` : ''
        }\n  proof: ${w.proof.length}건${w.hotButton ? ` · hotButton: ${w.hotButton}` : ''}`,
    )
    .join('\n')
}

/** compliance matrix 블록 — covered/partial/missing 카운트 + missing 요구 (compliance 채점 입력). */
function complianceBlock(compliance?: ComplianceMatrix): string {
  if (!compliance) return '(compliance matrix 미산출 — RFP 요구 커버리지 불명.)'
  const missing = compliance.items
    .filter((i) => i.coverage === 'missing')
    .map((i) => i.requirement.slice(0, 50))
    .slice(0, 6)
  return [
    `covered ${compliance.coveredCount} · partial ${compliance.partialCount} · missing ${compliance.missingCount} (총 ${compliance.items.length}요구)`,
    missing.length > 0 ? `미커버(실격 위험) 요구: ${missing.join(' / ')}` : '미커버 요구 없음',
  ].join('\n')
}

/** verifyReport 블록 — 주장 지지율·인용 수·제거 건 (증거 밀도·조작 0 채점 입력). */
function verifyBlock(report?: VerifyReport): string {
  if (!report) return '(faithfulness 검증 미산출 — 인용·지지율 불명.)'
  const total = report.totalClaims || 0
  const supportRate =
    total > 0 ? Math.round(((report.supported + report.partial) / total) * 100) : 0
  return [
    `검증 주장 ${total}건 · 지지(yes) ${report.supported} · 부분 ${report.partial} · 미지지(no) ${report.unsupported}`,
    `지지율(yes+partial) ${supportRate}% · 부착 인용 ${report.citationsAttached}건 · 미지지 수치 제거 ${report.removed}건`,
  ].join('\n')
}

/** judge 1회 호출 결과(파싱 후). */
interface JudgeSample {
  scoreByKey: Map<string, number>
  weakest: string[]
  feedbackByKey: Map<string, string>
}

/** 단일 샘플 judge 호출. */
async function judgeOnce(prompt: string, temperature: number): Promise<JudgeSample | null> {
  try {
    const r = await invokeAi({
      prompt,
      // judge — Pro (판단 품질 직결, Flash-우세 예외 2키 중 하나, ADR-022 §4).
      model: modelFor('engine.self-score'),
      maxTokens: AI_TOKENS.STANDARD,
      temperature,
      label: 'engine.selfScore',
    })
    const raw = safeParseJson<{
      lines?: { key?: string; score?: number; feedback?: string }[]
      weakest?: string[]
    }>(r.raw, 'engine.selfScore')

    const scoreByKey = new Map<string, number>()
    const feedbackByKey = new Map<string, string>()
    for (const l of raw?.lines ?? []) {
      if (typeof l?.key === 'string' && typeof l?.score === 'number') {
        scoreByKey.set(l.key, Math.max(0, Math.min(100, l.score)))
        if (typeof l.feedback === 'string' && l.feedback.trim()) {
          feedbackByKey.set(l.key, l.feedback.trim().slice(0, 200))
        }
      }
    }
    const weakest = Array.isArray(raw?.weakest)
      ? raw.weakest.filter((w) => typeof w === 'string').slice(0, 3)
      : []
    return { scoreByKey, weakest, feedbackByKey }
  } catch (e) {
    log.warn('engine.selfScore', '샘플 1회 실패 → 스킵', {
      err: e instanceof Error ? e.message : String(e),
    })
    return null
  }
}

/** 숫자 배열 중앙값 (홀수=가운데, 짝수=두 가운데 평균). */
function median(values: number[]): number {
  if (values.length === 0) return 50
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * Rubric self-score. EX-2 산출물(extras)을 judge 입력으로 받아 evidence·차별성·compliance·risk
 * 렌즈가 채점에 반영되게 한다. n=3 다중 샘플 → 라인별 median.
 */
export async function selfScore(
  draft: ExpressDraft,
  extras?: SelfScoreExtras,
): Promise<SelfScore> {
  const km = (draft.keyMessages ?? []).filter(Boolean).join(' / ') || '(없음)'
  const linesSpec = RUBRIC_LINES.map((l) => `- ${l.key} (가중 ${l.weight}): ${l.label}`).join('\n')

  const prompt = `
당신은 한국 정부·기업 RFP 평가위원입니다. 아래 제안서 1차본을 8개 채점 라인으로 0~100 채점하세요.
관대하지 말고 평가위원 시각으로 엄격히. 비어 있거나 추상적이면 낮게.

[핵심 메시지]
${km}

[7 섹션]
${sectionsBlock(draft)}

[win-theme (차별점 — proof chain 강제 통과분만. proof 개수 = 입증 강도)]
${winThemesBlock(extras?.winThemes)}

[compliance matrix (RFP 요구 → 섹션 커버리지)]
${complianceBlock(extras?.compliance)}

[faithfulness 검증 (주장 지지율·부착 인용·조작 제거)]
${verifyBlock(extras?.verifyReport)}

[채점 라인 (0~100 each)]
${linesSpec}

[채점 지침 — 위 4 블록(섹션·win-theme·compliance·검증)을 종합해 채점]
- compliance: compliance matrix 의 missing 요구가 있으면 강하게 감점(missing 0 이어야 고득점). partial 다수도 감점.
- understanding: 발주처 맥락·entity·정책 목표 인용 밀도. 보일러플레이트면 낮게.
- strategy: 과업 조합의 논리 사슬이 명확한가 (가중 최대 — 가장 중요).
- differentiation: win-theme 의 discriminator 가 구체·검증가능하고 proof 가 붙어 있나. win-theme 0건이거나 추상 슬로건뿐이면 낮게. 발주처 hot button 연결(ghosting)도 가점.
- evidence: 정량 근거·구체 사실 비율 + faithfulness 지지율·부착 인용 밀도 반영. 미지지(no)·조작 의심 수치가 많거나 인용이 거의 없으면 낮게. 금지어 발견 시 감점.
- impact: outcome map·정량 성과·SROI 정렬.
- risk: **리스크 레지스터(주요 리스크 + 완화책 + 미언급 우려 선제 대응)** 가 본문(특히 운영 섹션)에 있는가. 리스크 식별·대응이 없으면 낮게.
- ergonomics: 문단(≤6줄)·문장(≤15~20단어) 길이, 소제목·핵심 강조 등 10초 가독성.
- 약점 top-3 는 점수가 가장 낮은 라인 또는 가장 약한 섹션 키('1'~'7')로 지목.
- 각 라인 feedback: **왜 그 점수인지 한 문장 진단**(낮은 라인은 무엇이 부족한지 구체적으로 — refine 가 타깃 개선에 사용).

[출력 JSON]
{
  "lines": [ { "key": "compliance", "score": 0~100, "feedback": "왜 이 점수인지 한 문장" }, ... 8개 전부 ],
  "weakest": ["3", "evidence", "5"]   // 점수 낮은 섹션 키 또는 라인 key (top-3)
}
JSON 만. 마크다운 펜스·설명·trailing comma 금지.
`.trim()

  // ── 다중 샘플 (n=3, temperature 분산) — 순차(429 회피) ──
  const samples: JudgeSample[] = []
  for (let i = 0; i < N_SAMPLES; i++) {
    const s = await judgeOnce(prompt, SAMPLE_TEMPS[i % SAMPLE_TEMPS.length])
    if (s) samples.push(s)
  }

  if (samples.length === 0) {
    log.warn('engine.selfScore', '전 샘플 실패 → 중립 점수')
    const lines: ScoreLine[] = RUBRIC_LINES.map((spec) => ({
      key: spec.key,
      weight: spec.weight,
      score: 50,
    }))
    return { overall: 50, lines, weakest: ['strategy', 'evidence', 'understanding'] }
  }

  // 라인별 median (샘플 간 편향·노이즈 완화). 미응답 라인은 중립 50.
  const lines: ScoreLine[] = RUBRIC_LINES.map((spec) => {
    const vals = samples
      .map((s) => s.scoreByKey.get(spec.key))
      .filter((v): v is number => typeof v === 'number')
    return {
      key: spec.key,
      weight: spec.weight,
      score: vals.length > 0 ? Math.round(median(vals)) : 50,
    }
  })

  const totalWeight = lines.reduce((s, l) => s + l.weight, 0)
  const overall = Math.round(lines.reduce((s, l) => s + l.score * l.weight, 0) / totalWeight)

  // weakest: 샘플 간 빈도 합산 → 최빈 top-3. 비면 점수 하위 라인.
  const weakFreq = new Map<string, number>()
  for (const s of samples) for (const w of s.weakest) weakFreq.set(w, (weakFreq.get(w) ?? 0) + 1)
  const weakest =
    weakFreq.size > 0
      ? [...weakFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k)
      : [...lines].sort((a, b) => a.score - b.score).slice(0, 3).map((l) => l.key)

  // lineFeedback: 라인별 첫 유의 피드백 (refine 주입용). 가장 낮은 샘플의 진단 우선.
  const lineFeedback: Record<string, string> = {}
  for (const spec of RUBRIC_LINES) {
    for (const s of samples) {
      const fb = s.feedbackByKey.get(spec.key)
      if (fb && !lineFeedback[spec.key]) lineFeedback[spec.key] = fb
    }
  }

  return { overall, lines, weakest, lineFeedback }
}
