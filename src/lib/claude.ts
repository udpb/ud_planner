/**
 * claude.ts — Phase 2.1 단순화 (2026-05-03)
 *
 * 본 파일은 backward-compat 용 thin re-export shim 입니다.
 * 실제 구현은 src/lib/ai/* 하위 모듈로 이전되었습니다:
 *
 *   - src/lib/ai/parser.ts          — JsonParseError + safeParseJson
 *   - src/lib/ai/research.ts        — ExternalResearch + generateResearchPrompts + formatExternalResearch
 *   - src/lib/ai/strategic-notes.ts — StrategicNotes + formatStrategicNotes
 *   - src/lib/ai/parse-rfp.ts       — RfpParsed + parseRfp
 *   - src/lib/ai/impact-goal.ts     — ImpactGoalSuggestion + suggestImpactGoal
 *   - src/lib/ai/logic-model.ts     — LogicModelItem + LogicModel + buildLogicModel + normalizeLogicModel
 *   - src/lib/ai/curriculum-types.ts — CurriculumSession + CurriculumInsight + CurriculumSuggestion
 *   - src/lib/ai/proposal-section.ts — PROPOSAL_SECTIONS + SECTION_LENGTH_TARGETS + generateProposalSection
 *
 * 신규 코드는 위 하위 모듈을 직접 import 하세요.
 * 본 파일은 향후 점진 제거 예정 (deprecated → removed).
 *
 * AI 호출 단일 진입점: src/lib/ai-fallback.ts `invokeAi` (Gemini Primary + Claude Fallback).
 * Anthropic SDK 자체는 `ai-fallback.ts` 내부에서만 사용 — 외부 호출자는 invokeAi 만 쓰면 됩니다.
 */

import Anthropic from '@anthropic-ai/sdk'

// ────────────────────────────────────────────────────────────────
// LLM 백엔드 — Anthropic Claude 네이티브 SDK (Fallback 용으로만 유지)
// 실제 호출은 ai-fallback.ts → invokeAi 를 사용.
// ────────────────────────────────────────────────────────────────
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export const CLAUDE_MODEL = 'claude-sonnet-4-6'

// ────────────────────────────────────────────────────────────────
// JSON 파서
// ────────────────────────────────────────────────────────────────
export {
  JsonParseError,
  safeParseJson as safeParseJsonExternal,
} from './ai/parser'

// ────────────────────────────────────────────────────────────────
// 전략 맥락
// ────────────────────────────────────────────────────────────────
export {
  formatStrategicNotes,
  type StrategicNotes,
} from './ai/strategic-notes'

// ────────────────────────────────────────────────────────────────
// 외부 리서치
// ────────────────────────────────────────────────────────────────
export {
  generateResearchPrompts,
  formatExternalResearch,
  type ResearchPrompt,
  type ExternalResearch,
} from './ai/research'

// ────────────────────────────────────────────────────────────────
// RFP 파싱
// ────────────────────────────────────────────────────────────────
export {
  parseRfp,
  type RfpParsed,
} from './ai/parse-rfp'

// ────────────────────────────────────────────────────────────────
// 임팩트 목표 제안
// ────────────────────────────────────────────────────────────────
export {
  suggestImpactGoal,
  type ImpactGoalSuggestion,
} from './ai/impact-goal'

// ────────────────────────────────────────────────────────────────
// Logic Model
// ────────────────────────────────────────────────────────────────
export {
  buildLogicModel,
  normalizeLogicModel,
  type LogicModel,
  type LogicModelItem,
} from './ai/logic-model'

// ────────────────────────────────────────────────────────────────
// 커리큘럼 데이터 타입 (생성 로직은 curriculum-ai.ts)
// ────────────────────────────────────────────────────────────────
export {
  type CurriculumSession,
  type CurriculumInsight,
  type CurriculumSuggestion,
} from './ai/curriculum-types'

// ────────────────────────────────────────────────────────────────
// 제안서 섹션 생성 (legacy — improve route 가 사용)
// /api/ai/proposal POST 는 src/lib/proposal-ai.ts 를 사용.
// ────────────────────────────────────────────────────────────────
export {
  generateProposalSection,
  PROPOSAL_SECTIONS,
  SECTION_LENGTH_TARGETS,
} from './ai/proposal-section'
