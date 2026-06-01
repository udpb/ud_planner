/**
 * AI 호출 정책 상수 (Phase 1 — DIAGNOSIS 2026-05-03)
 *
 * 모든 AI 호출의 max_tokens 를 5 카테고리로 표준화. 매직 넘버 제거.
 *
 * 정책:
 *   - LIGHT    (4096)  : 짧은 응답 — 1~2 문장 / 단순 분류 / 개선 제안
 *   - STANDARD (8192)  : 일반 응답 — 챗봇 1턴 / 검수 / 단일 섹션
 *   - LARGE    (12288) : 큰 응답 — RFP 파싱 / Logic Model / 제안서 단일 섹션 (기존 16384 → 60s 안전 마진)
 *   - OUTLINE  (6144)  : 분할 호출 1단계 — 골격만
 *   - DETAILS  (8192)  : 분할 호출 2단계 — outline 기반 detail 보강
 *
 * 16384 는 사용 안 함 (60초 timeout 위험). 더 큰 응답이 필요하면 분할 호출 패턴.
 *
 * 사용 예:
 *   await invokeAi({ prompt, maxTokens: AI_TOKENS.LARGE, label: 'parse-rfp' })
 */

export const AI_TOKENS = {
  LIGHT: 4096,
  STANDARD: 8192,
  LARGE: 12288,
  OUTLINE: 6144,
  DETAILS: 8192,
} as const

export type AiTokenSize = keyof typeof AI_TOKENS

/**
 * 모델 라우팅 — 2-tier 정책 (ADR-022, Tech Spec §8.1).
 *
 * 품질-결정 경로(본문 작성·win-theme·assemble·정제·심사·진단)는 Pro(`GEMINI_MODEL`,
 * `gemini-3.1-pro-preview`), 빠르고 품질 민감도 낮은 plumbing(추출·분류·rewrite·HyDE·
 * decompose·rerank·청크 blurb)은 Flash.
 *
 * Flash 호출 경로: `invokeAi` 시그니처는 불변(ADR 동결)이므로 모델 override 가 필요한
 * Flash 작업은 `src/lib/gemini.ts` 의 `invokeGemini({ model: FLASH_MODEL })` 를 직접 호출.
 * (gemini.ts 는 단일 진입점 예외 — eslint no-restricted-imports 화이트리스트에 포함.)
 *
 * 모델명은 가변 데이터(Axiom A4) — 코드 분기 금지. env override 가능.
 */
export const FLASH_MODEL = process.env.GEMINI_FLASH_MODEL ?? 'gemini-3.5-flash'

export type ModelTier = 'pro' | 'flash'

/**
 * 작업 → 모델 tier 라우팅 표 — **Flash-우세** (ADR-022 §1·§4, 사용자 결정 ① 2026-06-01).
 *
 * 기본 전부 **Flash**. Pro는 "꼭 필요한 곳" **3개 키에서만** (스펙상 Pro 우위 = 깊은
 * 롱컨텍스트·추상 추론뿐 — MRCR 84.9 vs 77.3, Pro 키 상한 3):
 *   - `engine.section.core` : ③ 사업내용 핵심 합성 (롱컨텍스트 위 결정적 본문)
 *   - `engine.self-score`   : Rubric self-score judge (판단 품질 직결)
 *   - `engine.wintheme`     : win-theme discriminator/proof 품질 (differentiation 직결, ADR-022 §4-B)
 * 그 외 엔진 task(outline·일반 섹션·keyMessages·coherence·retrieval plumbing 등)는 전부 Flash.
 *
 * 'pro' = `GEMINI_MODEL`(기본 Pro), 'flash' = `FLASH_MODEL`.
 * 라우팅은 가변 데이터(Axiom A4) — 코드 분기 금지. 미정의 키는 modelFor()에서 flash 기본.
 *
 * ⚠️ 이 Pro 2키가 정말 Pro여야 하는지는 후속 EVAL A/B(arm A=전부 flash vs arm B=현 라우팅)로
 *    실측 예정 — flash로 충분하면 Pro 0키까지 내릴 수 있음.
 */
export const MODEL_ROUTING: Record<string, ModelTier> = {
  // ── Pro (3키 — Pro 키 상한, ADR-022 §4·§4-B) ──────────────
  'engine.section.core': 'pro', // ③ 사업내용 핵심 합성
  'engine.self-score': 'pro', // Rubric judge
  'engine.wintheme': 'pro', // win-theme discriminator/proof 품질 = differentiation 직결 (ADR-022 §4-B, EVAL-1 후 승격)

  // ── Flash (기본·명시 참조용) ──────────────────────────
  'engine.outline': 'flash',
  'engine.section': 'flash', // ③ 외 일반 섹션
  'engine.keymsg': 'flash',
  'engine.coherence': 'flash',
  // retrieval plumbing
  'ret.hyde': 'flash',
  'ret.decompose': 'flash',
  'ret.rerank': 'flash',
  'ret.context-blurb': 'flash',
}

/**
 * A/B arm A 용 강제 all-flash 플래그.
 * `EVAL_ALL_FLASH=true` 이면 modelFor()가 라우팅을 무시하고 무조건 FLASH_MODEL 반환
 * (Pro 2키 포함 전부 flash). 다가올 EVAL A/B에서 "전부 flash로 충분한가"를 측정하는 arm.
 * 미설정(=프로덕션)이면 MODEL_ROUTING 라우팅대로(Pro 2키 + 나머지 flash).
 */
export const EVAL_ALL_FLASH = process.env.EVAL_ALL_FLASH === 'true'

/**
 * task-key → 실제 모델명 리졸버 (Flash-우세 라우팅 단일 해석 지점).
 *
 *   - `EVAL_ALL_FLASH=true`  → 무조건 `FLASH_MODEL` (A/B arm A).
 *   - MODEL_ROUTING[key]==='pro' → `GEMINI_MODEL`(진짜 Pro, gemini-3.1-pro-preview).
 *   - 그 외(flash 또는 미정의 키) → `FLASH_MODEL`.
 *
 * GEMINI_MODEL 은 호출 시점 env 를 반영하도록 동적 import 회피 — 직접 process.env 참조.
 */
export function modelFor(key: string): string {
  const PRO_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.1-pro-preview'
  if (EVAL_ALL_FLASH) return FLASH_MODEL
  return MODEL_ROUTING[key] === 'pro' ? PRO_MODEL : FLASH_MODEL
}

/**
 * route 별 권장 maxTokens (참고용 — 호출자가 직접 import 해도 됨).
 *
 * 새 호출 추가 시 이 표 갱신.
 */
export const AI_TOKEN_MAP = {
  // Express
  'express-turn': AI_TOKENS.STANDARD,
  'express-first-turn': AI_TOKENS.STANDARD,
  'express-turn-retry': AI_TOKENS.STANDARD,
  'express-inspect': AI_TOKENS.STANDARD,
  'interview-extract': AI_TOKENS.STANDARD,

  // Deep Track
  'parse-rfp': AI_TOKENS.LARGE,
  'planning-direction': AI_TOKENS.LIGHT,
  'logic-model-builder': AI_TOKENS.LARGE,
  'logic-model-builder.retry': AI_TOKENS.LARGE,
  'suggest-impact-goal': AI_TOKENS.STANDARD,
  'curriculum': AI_TOKENS.LARGE, // single-shot fallback
  'curriculum-outline': AI_TOKENS.OUTLINE,
  'curriculum-details': AI_TOKENS.DETAILS,
  'proposal-section': AI_TOKENS.LARGE,
  'proposal-improve': AI_TOKENS.LIGHT,

  // Planning Agent
  'planning-agent.tool': AI_TOKENS.LARGE,
} as const
