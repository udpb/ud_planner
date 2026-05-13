/**
 * ChannelDetector — Express 2.0 (Phase M0-1, 2026-05-03)
 *
 * RFP 정보 + 발주처명 + 우리 prior project 조회 → B2G / B2B / renewal 추론.
 *
 * 추론 로직:
 *   1. Renewal 우선 — 같은 발주처 prior project (status=COMPLETED) 있으면 renewal
 *   2. 발주처명 키워드 + 평가표 명시 강도로 B2G vs B2B 판별
 *   3. 신뢰도 < 0.8 → PM 컨펌 필수 (하이브리드 케이스)
 *
 * 호출 시점: Express 진입 시 1회. 결과는 ExpressDraft.meta.autoDiagnosis.channel 에 저장.
 *
 * 비-AI 추론 — 토큰 0. 발주처명 + 키워드 매칭 + DB 조회만.
 * (필요 시 v2 에서 AI 호출 추가 가능)
 *
 * 관련: docs/decisions/013-express-v2-auto-diagnosis.md §결정 §1
 */

import 'server-only'
import type { RfpParsed } from '@/lib/ai/parse-rfp'
import type { Channel } from './schema'

// ─────────────────────────────────────────
// 1. 키워드 사전
// ─────────────────────────────────────────

/** B2G — 정부·공공기관 키워드 (발주처명에 포함 시 강한 신호) */
const GOV_KEYWORDS = [
  '진흥원', '공단', '재단법인', '청', '부', '처',
  '시청', '구청', '도청', '군청',
  '정부', '국가', '공공', '공기업',
  '교육청', '교육부', '문체부', '중기부', '과기정통부',
  '한국', // "한국정보화진흥원" 등
] as const

/** B2B — 기업·재단·조합 키워드 */
const CORP_KEYWORDS = [
  '주식회사', '㈜', 'Inc', 'Co.,', 'Ltd',
  '그룹', '홀딩스', '카드', '은행', '금융',
  '카카오', '네이버', '쿠팡', '삼성', 'LG', 'SK', '현대',
  '신한', '하나', 'KB', 'NH',
  '협동조합', // 사회적 경제 영역
] as const

// ─────────────────────────────────────────
// 2. 결과 타입
// ─────────────────────────────────────────

export interface ChannelDetectionResult {
  detected: Channel
  /** 0~1. 0.8 이상이면 자동 진행, 미만이면 PM 컨펌 필수 */
  confidence: number
  reasoning: string[]
  /** 하이브리드 케이스 — PM 에게 다른 옵션 추천 */
  alternatives?: Channel[]
}

export interface PriorProjectLike {
  client: string
  status: 'DRAFT' | 'PROPOSAL' | 'SUBMITTED' | 'IN_PROGRESS' | 'COMPLETED' | 'LOST'
}

// ─────────────────────────────────────────
// 3. 메인 함수
// ─────────────────────────────────────────

/**
 * 채널 추론.
 *
 * @param rfp RFP 파싱 결과 (parse-rfp 산출물)
 * @param priorProjects 같은 발주처와의 과거 프로젝트 (renewal 판별용)
 */
export function detectChannel(
  rfp: RfpParsed,
  priorProjects: PriorProjectLike[] = [],
): ChannelDetectionResult {
  const reasoning: string[] = []
  const client = (rfp.client ?? '').trim()

  // ─── 1. Renewal 우선 — 같은 발주처와 COMPLETED 또는 IN_PROGRESS 프로젝트 있나? ───
  const sameClientPrior = priorProjects.filter(
    (p) => p.client === client && (p.status === 'COMPLETED' || p.status === 'IN_PROGRESS'),
  )
  if (client && sameClientPrior.length > 0) {
    reasoning.push(`같은 발주처 "${client}" 와의 prior project ${sameClientPrior.length}건 발견 (status: ${sameClientPrior.map((p) => p.status).join(', ')})`)
    reasoning.push('연속사업 / 재계약 가능성 매우 높음')
    return {
      detected: 'renewal',
      confidence: 0.95,
      reasoning,
    }
  }

  // ─── 2. B2G vs B2B 신호 수집 ───
  const govScore = scoreKeywords(client, GOV_KEYWORDS)
  const corpScore = scoreKeywords(client, CORP_KEYWORDS)

  if (govScore > 0) {
    reasoning.push(`발주처명에 정부·공공 키워드 ${govScore}개 매칭`)
  }
  if (corpScore > 0) {
    reasoning.push(`발주처명에 기업·재단 키워드 ${corpScore}개 매칭`)
  }

  // RFP projectType 필드도 신호 (parse-rfp 가 추출함)
  if (rfp.projectType === 'B2G') {
    reasoning.push('RFP 본문에서 B2G 로 분류됨 (parse-rfp)')
  } else if (rfp.projectType === 'B2B') {
    reasoning.push('RFP 본문에서 B2B 로 분류됨 (parse-rfp)')
  }

  // 평가표 명시 강도 — B2G 의 강한 신호
  const evalCount = rfp.evalCriteria?.length ?? 0
  if (evalCount >= 4) {
    reasoning.push(`평가 배점 ${evalCount}개 항목 명시 — B2G 패턴`)
  } else if (evalCount === 0) {
    reasoning.push('평가 배점 명시 없음 — B2B 패턴')
  } else {
    reasoning.push(`평가 배점 ${evalCount}개 — 약한 신호 (하이브리드 가능)`)
  }

  // ─── 3. 종합 판단 ───
  let detected: Channel = 'B2B'
  let confidence = 0.6

  // 강한 B2G 신호: 정부 키워드 + 평가표 명시
  if (govScore >= 1 && evalCount >= 4) {
    detected = 'B2G'
    confidence = 0.92
    reasoning.push('→ B2G 강한 신호 (정부 키워드 + 평가표 명시)')
  }
  // 강한 B2B 신호: 기업 키워드 + 평가표 없음
  else if (corpScore >= 1 && evalCount === 0) {
    detected = 'B2B'
    confidence = 0.88
    reasoning.push('→ B2B 강한 신호 (기업 키워드 + 평가표 없음)')
  }
  // 중간 B2G 신호: 정부 키워드 또는 RFP projectType=B2G
  else if (govScore >= 1 || rfp.projectType === 'B2G') {
    detected = 'B2G'
    confidence = 0.75
    reasoning.push('→ B2G 중간 신호 — PM 컨펌 권장')
  }
  // 중간 B2B 신호
  else if (corpScore >= 1 || rfp.projectType === 'B2B') {
    detected = 'B2B'
    confidence = 0.75
    reasoning.push('→ B2B 중간 신호 — PM 컨펌 권장')
  }
  // 신호 약함 — B2B default + PM 컨펌
  else {
    detected = 'B2B'
    confidence = 0.5
    reasoning.push('→ 신호 약함, B2B default — PM 컨펌 필수')
  }

  // 하이브리드 alternatives
  const alternatives: Channel[] = []
  if (confidence < 0.8) {
    // 둘 다 보여줌
    alternatives.push(detected === 'B2G' ? 'B2B' : 'B2G')
    if (priorProjects.length > 0) alternatives.push('renewal')
  }

  return {
    detected,
    confidence,
    reasoning,
    alternatives: alternatives.length > 0 ? alternatives : undefined,
  }
}

// ─────────────────────────────────────────
// 4. 헬퍼
// ─────────────────────────────────────────

function scoreKeywords(text: string, keywords: readonly string[]): number {
  if (!text) return 0
  return keywords.filter((kw) => text.includes(kw)).length
}
