/**
 * 커리큘럼 데이터 타입 — Phase 2.1 단순화 (claude.ts 에서 분리, 2026-05-03)
 *
 * SSoT — `pipeline-context.ts` 의 CurriculumSession 도 본 타입을 그대로 재export.
 * 실제 생성 로직은 `src/lib/curriculum-ai.ts` (split outline + details).
 */

export interface CurriculumSession {
  sessionNo: number
  title: string
  category: string
  method: string
  durationHours: number
  // 세션 내 시간 구성 (분 단위)
  lectureMinutes: number    // 기본 15분
  practiceMinutes: number   // 기본 35분
  isTheory: boolean
  isActionWeek: boolean
  isCoaching1on1: boolean   // Action Week 페어 1:1 코칭 세션
  objectives: string[]
  recommendedExpertise: string[]
  notes: string
  // IMPACT 18모듈 매핑 (예: "I-1", "M-2") — 참고용 가이드
  impactModuleCode?: string | null
  // Logic Model 항목 연결 (예: ["OC-1", "OP-2"]) — 이 세션이 어떤 outcome/output에 기여하는지
  logicModelLinks?: string[]
}

export interface CurriculumInsight {
  type: 'info' | 'tip' | 'asset'
  message: string
}

export interface CurriculumSuggestion {
  sessions: CurriculumSession[]
  totalHours: number
  actionWeekRatio: number
  theoryRatio: number
  rationale: string
  insights: CurriculumInsight[]  // 기획자에게 전달할 안내/제안 (강제 아님)
}
