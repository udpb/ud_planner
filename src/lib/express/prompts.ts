/**
 * Express 챗봇 프롬프트 (Phase L Wave L2, ADR-011)
 *
 * 2026-05-03 (Phase 2.2 단순화): 553 줄 단일 파일을 4개 모듈로 분할.
 *   - prompts/formatters.ts  (RFP/Profile/Asset/Turn 컨텍스트 포맷터)
 *   - prompts/slot-guide.ts  (currentSlotGuide — 슬롯별 가이드 문구)
 *   - prompts/turn.ts        (buildTurnPrompt — 매 턴 메인 프롬프트)
 *   - prompts/first-turn.ts  (buildFirstTurnPrompt — RFP 업로드 직후 첫 턴)
 *
 * buildFinalDraftPrompt 는 호출자 0 으로 dead code 였기 때문에 제거.
 *
 * 모든 모델 무관 동일 프롬프트 (Gemini Primary / Claude fallback).
 * trailing comma 금지, 코드 펜스 금지, JSON 만 출력 강제.
 *
 * 관련 문서: docs/architecture/express-mode.md §4.2
 */

export {
  buildTurnPrompt,
  type BuildTurnPromptInput,
} from './prompts/turn'

export { buildFirstTurnPrompt } from './prompts/first-turn'
