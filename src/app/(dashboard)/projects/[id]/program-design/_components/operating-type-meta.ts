/**
 * BR-3c — 운영 유형(T1~T5) 표시 메타 추출 (데이터 기반, 하드코딩 0)
 *
 * 운영 유형의 **이름·한줄설명·실측 프로파일(기간·회차·코칭)** 은 절대 이 파일에
 * 하드코딩하지 않는다. 전부 `data/program-design/design-rules.json` 의
 * B_typeProfile 규칙(condition.match=T1~T5, recommend.value=프로파일)에서 추출한다.
 *
 * page.tsx(서버)가 loadDesignRules() 로 규칙을 읽어 이 함수로 변환한 뒤
 * `OperatingTypeMeta[]` 를 클라이언트 flow 에 prop 으로 내린다.
 *
 * 엔진(resolve-rules·generate-plan)은 건드리지 않는다 — 같은 시드를 읽기만 한다.
 */

import type { DesignRule } from '@/lib/program-design/design-rule'
import type { OperatingType } from '@/lib/program-design/plan-types'
import { OPERATING_TYPES } from '@/lib/program-design/plan-types'

/** 운영 유형 1건의 표시 메타 — 게이트 카드가 이름+설명+실측을 읽는다. */
export interface OperatingTypeMeta {
  type: OperatingType
  /** 깔끔한 이름 (예: '정규 강좌형') — B 프로파일 title 에서 추출. */
  name: string
  /** 한 줄 설명 — B 프로파일 rationale 의 첫 문장. */
  description: string
  /** 실측 프로파일 측정값 (기간·회차·코칭 등) — recommend.value 에서. */
  metrics: OperatingTypeMetric[]
  /** 근거 출처 (예: 'v1.2:§04') + 표본 n. */
  source: { label: string; n?: number }
  /** 이 메타를 만든 규칙 id. */
  ruleId: string
}

/** 실측 1줄 (라벨 + 값) — 게이트 카드의 칩. */
export interface OperatingTypeMetric {
  label: string
  value: string
}

// ─────────────────────────────────────────────────────────────────
// recommend.value 의 프로파일 키 → 사람이 읽는 라벨 (실측 표시용).
//   ⚠️ 라벨 텍스트일 뿐 — 수치는 절대 여기 없다 (수치는 전부 데이터에서).
// ─────────────────────────────────────────────────────────────────

const METRIC_LABELS: Record<string, string> = {
  durationMonths: '기간(개월)',
  participants: '인원',
  sessions: '회차',
  hoursPerSession: '회당(h)',
  coachingRounds: '코칭(회)',
  teamCohort: '팀 코호트',
  budgetKrwApprox: '예산',
  format: '형식',
  structure: '구조',
  audience: '대상',
  audienceLimit: '대상 제약',
}

/** 실측으로 보여줄 키 우선순위 — 기간·회차·코칭을 앞세운다 (브리프 요구). */
const METRIC_ORDER = [
  'durationMonths',
  'sessions',
  'coachingRounds',
  'participants',
  'hoursPerSession',
  'teamCohort',
  'budgetKrwApprox',
  'format',
  'structure',
  'audience',
  'audienceLimit',
]

/** title 에서 깔끔한 운영 유형 이름 추출 (예: 'T1 정규 강좌형 기본 프로파일' → '정규 강좌형'). */
function cleanName(type: OperatingType, title: string): string {
  // 'T1 정규 강좌형 기본 프로파일 ...' → 'Tn ' 접두 제거 + '기본 프로파일' 이후 절단.
  let s = title.replace(new RegExp(`^${type}\\s*`), '')
  const cut = s.indexOf('기본 프로파일')
  if (cut >= 0) s = s.slice(0, cut)
  // 괄호 부연(예: '(지향 모델과 가장 닮음)') 제거.
  s = s.replace(/\s*[—-].*$/, '').replace(/\s*\(.*$/, '')
  return s.trim() || title
}

/** rationale 첫 문장만 (한 줄 설명). */
function firstSentence(text: string): string {
  const m = text.split(/(?<=[.。])\s/)[0] ?? text
  return m.trim()
}

/** 값 1개를 사람이 읽는 문자열로. */
function metricValueText(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return '(값)'
  }
}

/** recommend.value(프로파일 객체) → 정렬된 실측 칩 목록. */
function extractMetrics(value: unknown): OperatingTypeMetric[] {
  if (!value || typeof value !== 'object') return []
  const obj = value as Record<string, unknown>
  const out: OperatingTypeMetric[] = []
  const seen = new Set<string>()
  // 우선순위 키 먼저.
  for (const key of METRIC_ORDER) {
    if (key in obj) {
      out.push({ label: METRIC_LABELS[key] ?? key, value: metricValueText(obj[key]) })
      seen.add(key)
    }
  }
  // 나머지 키 (라벨 사전에 있는 것만 — 잡음 방지).
  for (const key of Object.keys(obj)) {
    if (seen.has(key)) continue
    if (METRIC_LABELS[key]) {
      out.push({ label: METRIC_LABELS[key], value: metricValueText(obj[key]) })
    }
  }
  return out
}

/**
 * design-rules.json 의 B_typeProfile 규칙 → 운영 유형 표시 메타 lookup.
 *
 * 매칭되는 B 프로파일이 없는 유형은 메타에서 제외된다 (게이트가 코드만 보일 뿐
 * fallback — 하드코딩하지 않음. 시드를 승인하면 자동으로 이름이 붙는다).
 */
export function buildOperatingTypeMeta(rules: DesignRule[]): OperatingTypeMeta[] {
  const profiles = rules.filter((r) => r.ruleType === 'B_typeProfile')
  const out: OperatingTypeMeta[] = []

  for (const type of OPERATING_TYPES) {
    const rule = profiles.find((r) => {
      const m = r.condition.match
      const v = Array.isArray(m) ? m[0] : m
      return v === type
    })
    if (!rule) continue
    out.push({
      type,
      name: cleanName(type, rule.title),
      description: firstSentence(rule.rationale),
      metrics: extractMetrics(rule.recommend.value),
      source: { label: rule.evidence.source, n: rule.evidence.n },
      ruleId: rule.id,
    })
  }
  return out
}
