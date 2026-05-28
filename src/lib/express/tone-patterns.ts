/**
 * Tone Patterns — Phase J2 (2026-05-28)
 *
 * WinningPattern.tonePatterns jsonb 활용으로 채널·도메인별 voice 일관성 강화.
 *
 * 흐름:
 *   1. DB 의 WinningPattern.tonePatterns 추출 (이미 schema 에 있음)
 *   2. 본 사업 채널·도메인과 가장 일치하는 패턴 top-3 선별
 *   3. 합쳐서 단일 ToneProfile 생성 (빈도 가중 평균)
 *   4. buildTurnPrompt 에 주입 — LLM 이 본문에 이 톤 일관 활용
 *
 * ToneProfile 구조:
 *   - openings: 문장 도입 표현 3~5건 (예: "본 사업은 ...", "언더독스는 ...")
 *   - transitions: 연결 어구 3~5건 (예: "특히", "또한", "이를 통해")
 *   - closingPhrases: 종결 표현 3~5건 (예: "...완성합니다", "...견인합니다")
 *   - avoidedWords: 회피 어휘 (예: "최선을 다해", "다양한", "최고의")
 *   - signatureNumbers: 시그니처 수치 3~5건 (예: "20,211명", "11년", "BB+")
 *
 * 한계:
 *   - 기존 WinningPattern.tonePatterns 가 채워져 있어야 함 (마이그레이션 필요할 수 있음)
 *   - 채워져 있지 않으면 generic 빈 객체 반환 (graceful)
 */

import 'server-only'

import { prisma } from '@/lib/prisma'
import { z } from 'zod'

export const ToneProfileSchema = z.object({
  openings: z.array(z.string()).max(8).optional(),
  transitions: z.array(z.string()).max(8).optional(),
  closingPhrases: z.array(z.string()).max(8).optional(),
  avoidedWords: z.array(z.string()).max(10).optional(),
  signatureNumbers: z.array(z.string()).max(10).optional(),
})

export type ToneProfile = z.infer<typeof ToneProfileSchema>

export interface BuildToneProfileInput {
  channel: 'B2G' | 'B2B' | 'renewal'
  /** 도메인 키워드 (RFP 의 keywords 또는 사업 영역) */
  keywords?: string[]
  /** top-N 패턴 */
  limit?: number
}

/**
 * WinningPattern 의 tonePatterns 통합 → 단일 ToneProfile.
 * 빈 결과면 empty object 반환 (graceful).
 */
export async function buildToneProfile(
  input: BuildToneProfileInput,
): Promise<ToneProfile> {
  const { channel, keywords = [], limit = 3 } = input

  try {
    // 채널 일치 + tonePatterns 있는 WinningPattern 선별
    const patterns = await prisma.winningPattern.findMany({
      where: {
        channelType: channel,
        outcome: 'won',
        tonePatterns: { not: null as unknown as undefined } as never,
      },
      select: { sourceProject: true, tonePatterns: true, sourceClient: true },
      take: 30, // overfetch — keyword 매칭 후 top-N
    })

    if (patterns.length === 0) {
      return {}
    }

    // 키워드 매칭 점수
    const scored = patterns
      .map((p) => {
        let score = 0.5
        for (const kw of keywords) {
          if (p.sourceProject?.includes(kw)) score += 0.2
        }
        return { ...p, score: Math.min(1, score) }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)

    // 빈도 가중 통합
    const allOpenings: string[] = []
    const allTransitions: string[] = []
    const allClosings: string[] = []
    const allAvoided: string[] = []
    const allNumbers: string[] = []

    // K5 fix (2026-05-29): signatureNumbers 는 DB 에 `{value, context}` object 로 저장됨
    //   string filter 만 적용하면 모두 제외됨. value 추출 (+ context 있으면 "value (context)" 으로 합쳐 prompt 풍부화)
    const extractNumber = (x: unknown): string | null => {
      if (typeof x === 'string') return x
      if (x && typeof x === 'object') {
        const obj = x as { value?: unknown; context?: unknown }
        if (typeof obj.value === 'string' && obj.value.length > 0) {
          if (typeof obj.context === 'string' && obj.context.length > 0) {
            return `${obj.value} (${obj.context})`
          }
          return obj.value
        }
      }
      return null
    }

    for (const p of scored) {
      const tp = (p.tonePatterns ?? null) as Partial<ToneProfile> & {
        signatureNumbers?: unknown
      } | null
      if (!tp) continue
      if (Array.isArray(tp.openings)) allOpenings.push(...tp.openings.filter((x) => typeof x === 'string'))
      if (Array.isArray(tp.transitions)) allTransitions.push(...tp.transitions.filter((x) => typeof x === 'string'))
      if (Array.isArray(tp.closingPhrases)) allClosings.push(...tp.closingPhrases.filter((x) => typeof x === 'string'))
      if (Array.isArray(tp.avoidedWords)) allAvoided.push(...tp.avoidedWords.filter((x) => typeof x === 'string'))
      if (Array.isArray(tp.signatureNumbers)) {
        for (const item of tp.signatureNumbers) {
          const ext = extractNumber(item)
          if (ext) allNumbers.push(ext)
        }
      }
    }

    // 빈도 카운트 → top-N
    const topN = (arr: string[], n: number) => {
      const count = new Map<string, number>()
      for (const s of arr) count.set(s, (count.get(s) ?? 0) + 1)
      return Array.from(count.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, n)
        .map(([s]) => s)
    }

    return {
      openings: topN(allOpenings, 5),
      transitions: topN(allTransitions, 5),
      closingPhrases: topN(allClosings, 5),
      avoidedWords: topN(allAvoided, 8),
      signatureNumbers: topN(allNumbers, 6),
    }
  } catch (err) {
    console.warn('[tone-patterns] 실패 → empty:', err)
    return {}
  }
}

/**
 * ToneProfile → buildTurnPrompt 주입용 compact format.
 */
export function formatToneProfileForPrompt(tone: ToneProfile | null | undefined): string {
  if (!tone) return ''
  const parts: string[] = []
  if (tone.openings && tone.openings.length > 0) {
    parts.push(`▷ 문장 도입 표현 (활용 권장): ${tone.openings.join(' · ')}`)
  }
  if (tone.transitions && tone.transitions.length > 0) {
    parts.push(`▷ 연결 어구 (활용 권장): ${tone.transitions.join(' · ')}`)
  }
  if (tone.closingPhrases && tone.closingPhrases.length > 0) {
    parts.push(`▷ 종결 표현 (활용 권장): ${tone.closingPhrases.join(' · ')}`)
  }
  if (tone.avoidedWords && tone.avoidedWords.length > 0) {
    parts.push(`⚠ **회피 어휘** (사용 금지): ${tone.avoidedWords.join(' · ')}`)
  }
  if (tone.signatureNumbers && tone.signatureNumbers.length > 0) {
    parts.push(`▷ 시그니처 수치 (자연 박음 권장): ${tone.signatureNumbers.join(' · ')}`)
  }
  return parts.length > 0 ? parts.join('\n') : ''
}
