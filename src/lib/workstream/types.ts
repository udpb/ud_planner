// [WORKSTREAM] 과업유형 타입 + RFP 배점 매핑 (ADR-019, Tech Spec §7.1)
//
// ProgramProfile 6종(ADR-006 축9)을 골격으로 승격 + 확장 후보 포함.
// 제1원칙: 각 과업유형은 RFP 평가 배점 한 카테고리에 직접 연결된다 → 출력 그릇이
// 평가위원 채점 축과 1:1. 값은 docs/glossary.md §2 · Tech Spec §7.1 과 정렬.
//
// 새 과업유형 추가 = 이 배열 + 매핑 1엔트리 (파이프라인 불변, Axiom A4).
// 상세 레지스트리(기대 필드·피드 소스·당선언어 키)는 후속 WS-1 브리프의
// src/lib/workstream/registry.ts 에서 선언.

export const WORKSTREAM_TYPES = [
  'education',
  'event_ops',
  'venue',
  'speaker',
  'recruiting',
  'screening',
  'networking',
  'mentoring',
  'deliverable',
] as const

export type WorkstreamType = (typeof WORKSTREAM_TYPES)[number]

// 각 유형 → RFP 배점 카테고리 (ADR-006 제1원칙 · Tech Spec §7.1 · glossary §2)
export const WORKSTREAM_SCORING: Record<WorkstreamType, string> = {
  education: '수행역량',
  mentoring: '수행역량(4중 지원)',
  event_ops: '운영역량·집객 실적',
  venue: '운영역량',
  speaker: '차별화',
  recruiting: '모집 전략',
  screening: '심사·선정 설계',
  networking: '차별화(파트너·동문)',
  deliverable: '수행능력(산출물)',
}

/** 임의 문자열이 알려진 과업유형인지 (런타임 가드). */
export function isWorkstreamType(value: string): value is WorkstreamType {
  return (WORKSTREAM_TYPES as readonly string[]).includes(value)
}

/** 과업유형 → 연결 RFP 배점 카테고리. 미지의 유형이면 undefined. */
export function scoringCategoryFor(type: string): string | undefined {
  return isWorkstreamType(type) ? WORKSTREAM_SCORING[type] : undefined
}
