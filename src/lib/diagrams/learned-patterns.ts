/**
 * Learned Slide Patterns — Phase N2 (2026-05-30)
 *
 * design-kit/learned-slide-patterns.json (실제 당선 PPT 60 슬라이드 학습 결과) 를
 * 로드해 produce-slide-specs 에 역주입.
 *
 * 학습 핵심:
 *   - 섹션별 자주 쓰는 도식화 패턴 (데이터 기반 — hardcoded SECTION_DEFAULT_PATTERNS 보강)
 *   - 평균 메시지 밀도 (blocks ~9.6, evidence ~3.4 per slide)
 *   - 헤드라인 작성 스타일 예시
 *
 * 파일 없으면 안전한 기본값 fallback (CI·신규 환경).
 */

import 'server-only'
import * as fs from 'node:fs'
import * as path from 'node:path'

interface LearnedPatterns {
  learnedAt?: string
  sampleSize?: number
  sectionPatterns?: Record<string, { pattern: string; count: number }[]>
  headlineExamples?: string[]
  avgEvidencePerSlide?: number
  avgBlocksPerSlide?: number
}

let _cache: LearnedPatterns | null = null

function load(): LearnedPatterns {
  if (_cache) return _cache
  try {
    const p = path.join(process.cwd(), 'design-kit', 'learned-slide-patterns.json')
    if (fs.existsSync(p)) {
      _cache = JSON.parse(fs.readFileSync(p, 'utf-8')) as LearnedPatterns
      return _cache
    }
  } catch {
    // fall through to defaults
  }
  _cache = {}
  return _cache
}

/**
 * 섹션별 학습된 도식화 패턴 (빈도순). 학습 데이터 없으면 빈 배열.
 */
export function getLearnedSectionPatterns(sectionNum: string): string[] {
  const data = load()
  const pats = data.sectionPatterns?.[sectionNum]
  if (!pats || pats.length === 0) return []
  return pats.map((p) => p.pattern)
}

/**
 * 실제 당선 슬라이드의 평균 밀도 — 생성 시 목표치.
 * fallback: 학습 결과(9.6 blocks · 3.4 evidence) 기반 안전 기본값.
 */
export const LEARNED_DENSITY = (() => {
  const data = load()
  return {
    avgBlocks: data.avgBlocksPerSlide ?? 9,
    avgEvidence: data.avgEvidencePerSlide ?? 3,
  }
})()

/**
 * 헤드라인 작성 스타일 예시 (실제 당선 슬라이드 모방용) — 최대 8건.
 */
export const LEARNED_HEADLINE_EXAMPLES: string[] = (() => {
  const data = load()
  return (data.headlineExamples ?? []).slice(0, 8)
})()
