/**
 * concept-to-axes — 운영유형 축 매핑 (ADR-031 Wave 3, 순수 함수)
 *
 * 운영유형 게이트를 "T1~T5 박스 cold 선택" 에서 **실제 축**(압축↔동행 · 팀↔개별 ·
 * 교육↔행사 + 시간 통째 토글)으로 재구성하기 위한 순수 매핑 레이어다.
 *
 *   ① axisProfile(meta)        — 각 운영유형의 operating-type-meta 수치 → 4축 위치(0~100)
 *   ② biasTypeFromConcept(...)  — 확정 컨셉(chosenAngle·differentiation·keyMessages) 키워드
 *                                 → 추천 유형 + "왜" 한 줄 (강제 아님, 출발점)
 *   ③ nearestType(axes, metas)  — 현재 축 위치 → 가장 가까운 운영유형(T1~T5)
 *
 * ⚠️ 엔진 동결 계약: 이 파일은 **UI 가 T1~T5 로 resolve 하기 위한 표현 보조**일 뿐이다.
 *    OperatingType enum·detectOperatingType·resolve-rules·/program-design 엔드포인트는
 *    무변경. 최종 post 값은 여전히 operatingType ∈ {T1..T5}.
 *
 * 수치는 전부 OperatingTypeMeta(=design-rules.json B 프로파일)에서 파싱한다 —
 * 이 파일에 운영유형별 회차·기간 수치를 하드코딩하지 않는다(축 변환 상수만).
 */

import type { OperatingType } from '@/lib/program-design/plan-types'
import type { ConceptShape } from '@/lib/program-design/concept-synth'
import type { OperatingTypeMeta } from './operating-type-meta'

// ─────────────────────────────────────────────────────────────────
// 축 정의 — 0~100, 양 끝 라벨. (압축↔동행 / 팀↔개별 / 교육↔행사)
// ─────────────────────────────────────────────────────────────────

export type AxisKey = 'tempo' | 'cohort' | 'mode'

export interface AxisDef {
  key: AxisKey
  /** 왼쪽(0) 라벨. */
  left: string
  /** 오른쪽(100) 라벨. */
  right: string
}

/** 3 슬라이더 축 정의 (시간 통째는 별도 토글). */
export const AXES: readonly AxisDef[] = [
  { key: 'tempo', left: '압축', right: '동행' },
  { key: 'cohort', left: '팀', right: '개별' },
  { key: 'mode', left: '교육', right: '행사' },
] as const

/** 한 운영유형(또는 현재 슬라이더)의 축 위치. */
export interface AxisVector {
  /** 압축(0)↔동행(100) — 기간(개월)·회차 밀도에서. */
  tempo: number
  /** 팀(0)↔개별(100) — 팀 코호트 값에서. */
  cohort: number
  /** 교육(0)↔행사(100) — 구조·회차 신호에서. */
  mode: number
  /** 대상이 시간을 통째로 낼 수 있는가 (T2 류 — 청년·청소년 종일·합숙). */
  wholeTime: boolean
}

const clamp = (n: number, lo = 0, hi = 100): number =>
  Math.max(lo, Math.min(hi, n))

// ─────────────────────────────────────────────────────────────────
// 메타 수치 파서 — metrics(라벨+문자열값)에서 숫자/텍스트 추출
//   operating-type-meta 는 표시용이라 값이 문자열(예 '8.5', '개별 일정 …').
//   여기서 best-effort 로 숫자만 뽑는다(못 뽑으면 undefined).
// ─────────────────────────────────────────────────────────────────

/** metrics 에서 라벨로 값 텍스트 찾기. */
function metricText(meta: OperatingTypeMeta, label: string): string | undefined {
  return meta.metrics.find((m) => m.label === label)?.value
}

/** 텍스트 앞부분에서 첫 숫자(소수 포함) 추출. 없으면 undefined. */
function firstNumber(text: string | undefined): number | undefined {
  if (!text) return undefined
  const m = text.match(/-?\d+(?:\.\d+)?/)
  return m ? Number(m[0]) : undefined
}

interface ParsedProfile {
  durationMonths?: number
  sessions?: number
  coachingRounds?: number
  /** 팀 코호트 0~1 (높을수록 팀). */
  teamCohort?: number
  /** 구조/형식/대상 제약 — 키워드 신호용 결합 텍스트. */
  text: string
}

function parseProfile(meta: OperatingTypeMeta): ParsedProfile {
  const text = meta.metrics
    .map((m) => `${m.label} ${m.value}`)
    .concat(meta.name, meta.description)
    .join(' ')
  return {
    durationMonths: firstNumber(metricText(meta, '기간(개월)')),
    sessions: firstNumber(metricText(meta, '회차')),
    coachingRounds: firstNumber(metricText(meta, '코칭(회)')),
    teamCohort: firstNumber(metricText(meta, '팀 코호트')),
    text,
  }
}

// ─────────────────────────────────────────────────────────────────
// ① axisProfile — 메타 수치 → 4축 (best-effort, 동결 아님)
// ─────────────────────────────────────────────────────────────────

/** 기간(개월) 범위 → tempo(압축0↔동행100). 짧을수록 압축. 데이터 범위 ~1.5~9개월. */
const TEMPO_MIN_MONTHS = 1.5
const TEMPO_MAX_MONTHS = 9

/** 행사 신호 키워드(구조/대상). 있으면 mode 를 행사쪽으로. */
const EVENT_KEYWORDS = ['행사', '경진대회', '박람회', '공모전', '데모데이', '발표', '대행', '운영 대행']
/** 시간 통째 신호 키워드(대상이 종일·합숙 가능). */
const WHOLE_TIME_KEYWORDS = ['시간 통', '시간통', '종일', '합숙', '몰입', '캠프']

/**
 * 운영유형 메타 → 축 위치. 수치가 빠지면 중립(50)/false 로 graceful.
 *
 *   - tempo  : 기간(개월) 선형 매핑(짧을수록 압축=0). 회차 밀도(회차/개월 높음=압축) 가미.
 *   - cohort : (1 - 팀코호트)*100 — 팀코호트 0.9→~10(팀), 0.23→~77(개별).
 *   - mode   : 기본 교육(낮음). 구조/대상에 행사 키워드 → 행사쪽 상향. 회차 희박(회차≤3 & 코칭≤1)도 행사 신호.
 *   - wholeTime : 종일·합숙·시간통 키워드.
 */
export function axisProfile(meta: OperatingTypeMeta): AxisVector {
  const p = parseProfile(meta)

  // tempo — 기간 선형(압축0↔동행100). 못 뽑으면 50.
  let tempo = 50
  if (typeof p.durationMonths === 'number') {
    const span = TEMPO_MAX_MONTHS - TEMPO_MIN_MONTHS
    tempo = clamp(((p.durationMonths - TEMPO_MIN_MONTHS) / span) * 100)
    // 회차 밀도 보정: 같은 기간이라도 회차/개월 높으면 압축(0쪽)으로 살짝.
    if (typeof p.sessions === 'number' && p.durationMonths > 0) {
      const density = p.sessions / p.durationMonths // 회/개월
      // density 4↑(주1회 이상)이면 압축쪽 -8, 1↓(드문드문)이면 동행쪽 +8.
      if (density >= 4) tempo = clamp(tempo - 8)
      else if (density <= 1) tempo = clamp(tempo + 8)
    }
  }

  // cohort — 팀코호트 0~1 → (1-x)*100. 못 뽑으면 50.
  let cohort = 50
  if (typeof p.teamCohort === 'number') {
    cohort = clamp((1 - p.teamCohort) * 100)
  }

  // mode — 기본 교육(15). 행사 키워드 / 회차 희박 → 행사쪽 상향.
  let mode = 15
  const eventHits = EVENT_KEYWORDS.filter((k) => p.text.includes(k)).length
  const eventBody = p.text.includes('본체') && eventHits > 0
  if (eventBody) {
    mode = 90 // 행사 설계가 본체(T5)
  } else if (eventHits > 0) {
    mode = clamp(30 + eventHits * 12) // 발표 행사 조합 등(T3) — 교육+행사 혼합
  }
  // 회차 희박(회차≤3 & 코칭≤1) 추가 행사 신호.
  if (
    typeof p.sessions === 'number' &&
    p.sessions <= 3 &&
    typeof p.coachingRounds === 'number' &&
    p.coachingRounds <= 1
  ) {
    mode = clamp(Math.max(mode, 80))
  }

  // wholeTime — 종일·합숙·시간통 키워드.
  const wholeTime = WHOLE_TIME_KEYWORDS.some((k) => p.text.includes(k))

  return { tempo, cohort, mode, wholeTime }
}

// ─────────────────────────────────────────────────────────────────
// ③ nearestType — 축 위치 → 가장 가까운 운영유형(T1~T5)
// ─────────────────────────────────────────────────────────────────

/** 두 축 벡터 거리(가중 유클리드). wholeTime 불일치는 페널티로 가산. */
function axisDistance(a: AxisVector, b: AxisVector): number {
  const dt = a.tempo - b.tempo
  const dc = a.cohort - b.cohort
  const dm = a.mode - b.mode
  const wholePenalty = a.wholeTime === b.wholeTime ? 0 : 35
  return Math.sqrt(dt * dt + dc * dc + dm * dm) + wholePenalty
}

/**
 * 현재 슬라이더 축 위치에서 가장 가까운 운영유형 메타를 고른다.
 * metas 가 비면 null. 동률이면 metas 순서(T1→T5) 우선.
 */
export function nearestType(
  axes: AxisVector,
  metas: OperatingTypeMeta[],
): OperatingTypeMeta | null {
  let best: OperatingTypeMeta | null = null
  let bestD = Infinity
  for (const meta of metas) {
    const d = axisDistance(axes, axisProfile(meta))
    if (d < bestD) {
      bestD = d
      best = meta
    }
  }
  return best
}

// ─────────────────────────────────────────────────────────────────
// ② biasTypeFromConcept — 컨셉 키워드 → 추천 유형 + 왜 (강제 아님)
// ─────────────────────────────────────────────────────────────────

/** 컨셉 키워드 → 유형 가중 신호. 각 유형에 점수를 더하는 어휘 사전(분류 신호, 수치 아님). */
const TYPE_KEYWORD_BIAS: Record<OperatingType, { words: string[]; why: string }> = {
  T1: {
    words: ['정규', '강좌', '매주', '주차', '커리큘럼', '체계', '기초', '입문'],
    why: '매주 만나는 정규 강좌 흐름이 컨셉과 맞습니다',
  },
  T2: {
    words: ['몰입', '캠프', '합숙', '부트캠프', '단기', '집중', '청년', '청소년', '며칠'],
    why: '시간을 통으로 모아 몰아치는 몰입 흐름이 컨셉과 맞습니다',
  },
  T3: {
    words: ['장기', '여정', '동행', '킥오프', '퀘스트', '성장', '발표', '단계', '오래'],
    why: '킥오프부터 발표까지 길게 동행하는 여정이 컨셉과 맞습니다',
  },
  T4: {
    words: ['개별', '밀착', '맞춤', '1:1', '소상공인', '재창업', '컨설팅', '현장', '점포'],
    why: '팀이 아니라 개별 사업체를 밀착 지원하는 흐름이 컨셉과 맞습니다',
  },
  T5: {
    words: ['행사', '경진대회', '박람회', '공모전', '데모데이', '대행', '페스티벌', '컨퍼런스'],
    why: '교육보다 행사 운영 자체가 본체인 흐름이 컨셉과 맞습니다',
  },
}

export interface ConceptBias {
  /** 추천 유형 메타 (없으면 null — fallback 으로 엔진 recommended 사용). */
  recommended: OperatingTypeMeta | null
  /** 추천 근거 한 줄 ("이 컨셉이면 → … 왜"). */
  why: string
}

/** 컨셉에서 비교할 텍스트 결합 (chosenAngle·차별점·핵심 메시지·win-theme). */
function conceptText(concept: ConceptShape): string {
  return [
    concept.winTheme,
    concept.chosenAngle ?? '',
    concept.differentiation,
    ...(Array.isArray(concept.keyMessages) ? concept.keyMessages : []),
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * 확정 컨셉 키워드로 운영유형을 가중해 추천한다. **강제 아님** — PM 의 축 조정이 우선.
 * concept 없거나 신호 0이면 recommended=null(호출부가 엔진 gate.recommended fallback).
 */
export function biasTypeFromConcept(
  concept: ConceptShape | null | undefined,
  metas: OperatingTypeMeta[],
): ConceptBias {
  if (!concept || metas.length === 0) {
    return { recommended: null, why: '' }
  }
  const text = conceptText(concept)
  if (!text.trim()) return { recommended: null, why: '' }

  let bestType: OperatingType | null = null
  let bestScore = 0
  for (const meta of metas) {
    const bias = TYPE_KEYWORD_BIAS[meta.type]
    if (!bias) continue
    const score = bias.words.reduce((s, w) => (text.includes(w) ? s + 1 : s), 0)
    if (score > bestScore) {
      bestScore = score
      bestType = meta.type
    }
  }

  if (!bestType || bestScore === 0) {
    return { recommended: null, why: '' }
  }
  const recommended = metas.find((m) => m.type === bestType) ?? null
  return {
    recommended,
    why: TYPE_KEYWORD_BIAS[bestType].why,
  }
}

// ─────────────────────────────────────────────────────────────────
// 표시 보조 — 메타에서 실측 앵커 칩(기간·회차·예산 중앙 + n=)
// ─────────────────────────────────────────────────────────────────

/** 실측 앵커로 보여줄 우선 칩(기간·회차·예산). 없으면 metrics 앞 3개. */
export function anchorMetrics(meta: OperatingTypeMeta): OperatingTypeMeta['metrics'] {
  const want = ['기간(개월)', '회차', '예산']
  const picked = want
    .map((label) => meta.metrics.find((m) => m.label === label))
    .filter((m): m is OperatingTypeMeta['metrics'][number] => !!m)
  if (picked.length > 0) return picked
  return meta.metrics.slice(0, 3)
}

/** 숫자처럼 보이는 값은 반올림해 표시(소수 자르기 — 디자인킷 요구). 그 외 원문 유지. */
export function roundedMetricValue(value: string): string {
  const trimmed = value.trim()
  // 순수 숫자(소수 포함)만일 때 반올림. 단위·텍스트 섞이면 원문 유지.
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return String(Math.round(Number(trimmed)))
  }
  return value
}
