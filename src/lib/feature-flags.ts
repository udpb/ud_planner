/**
 * Feature Flags — UD-Ops Workspace
 *
 * 단일 진입점. 다른 파일에서 `process.env.X` 직접 읽지 않고 본 helper 사용.
 *
 * - server-side only: 함수형 (런타임 평가). client component 에선 NEXT_PUBLIC_*
 *   prefix 가 붙은 변형이 필요 — 현재는 server 분기만 있어 함수형만 export.
 * - 기본값: 모든 flag false (운영 기본 OFF).
 *
 * 추가 flag 도 동일 패턴으로 본 파일에 정의.
 */

/**
 * Wave V — Express+Deep 완전 통합 + AI 자동 채움 패러다임 (ADR-015, 2026-05-20).
 *
 * true:  /projects/[id] 가 5 Stage Progressive Disclosure (S1~S5) 로 렌더,
 *        /projects/[id]/express 는 /projects/[id] 로 redirect.
 *        Wave V 의 F0~F5 점진 도입.
 *
 * false: 기존 Express/Deep 분리 동작. 회귀 0. 운영 기본.
 *
 * 변경 시 dev 서버 재시작 필수 (Next.js env reload).
 */
export function isExpressParadigmV3(): boolean {
  return process.env.EXPRESS_PARADIGM_V3 === 'true'
}

/**
 * 디버그용 — 현재 활성화된 모든 flag 의 snapshot. 콘솔 로깅·에러 리포트에 활용.
 */
export function getActiveFlags(): Record<string, boolean> {
  return {
    EXPRESS_PARADIGM_V3: isExpressParadigmV3(),
  }
}
