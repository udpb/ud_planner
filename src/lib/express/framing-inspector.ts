/**
 * FramingInspector — Express 2.0 (Phase M0-2, 2026-05-03)
 *
 * 슬기님 03/25 신한 사례 피드백 직접 대응:
 *   "현 제안서의 논리 흐름이 '사회공헌사업' 제안 보다는 '일반 사업 전략 제안'으로 읽힘"
 *
 * 입력:
 *   - ExpressDraft.sections.*  (특히 sections.1 = 제안 배경 = 첫 인상)
 *   - 채널 (B2B 우선 — B2G/renewal 은 다른 lens)
 *
 * 출력:
 *   - 감지된 부서 (csr / strategy / sales / tech)
 *   - 목표 부서와 일치 여부
 *   - 근거 (감지 단서가 된 키워드·문장)
 *   - 불일치 시 수정 제안
 *
 * 호출 시점: sections.* 슬롯 채워질 때마다 (debounce 1초). 토큰 ~2K/회.
 *
 * 비-AI fallback: 환경변수 GEMINI_API_KEY 없을 때 키워드 매칭만으로 진단.
 *
 * 관련: docs/decisions/013-express-v2-auto-diagnosis.md §결정 §1.2
 */

import 'server-only'
import { invokeAi } from '@/lib/ai-fallback'
import { safeParseJson } from '@/lib/ai/parser'
import { AI_TOKENS } from '@/lib/ai/config'
import { log } from '@/lib/logger'
import type { ExpressDraft, Department, Channel } from './schema'

// ─────────────────────────────────────────
// 1. 부서 키워드 사전 (휴리스틱 fallback 용)
// ─────────────────────────────────────────

const DEPARTMENT_KEYWORDS: Record<Department, readonly string[]> = {
  csr: [
    '사회공헌', 'CSR', 'ESG', '동반성장', '상생', '아름다운',
    '시민', '사회적 가치', '임팩트', '취약계층', '약자',
    '공익', '나눔', '봉사', '재단',
    '소상공인', '청년', '여성', '장애인', '다문화',
  ],
  strategy: [
    '전략', '비즈니스 모델', 'MAU', '시장점유율', '경쟁',
    '수수료', '매출', '수익성', '성장률', '시장 규모',
    '플랫폼', '경쟁사', '벤치마크', '차별화 전략',
    '먹깨비', '쿠팡이츠', '배민', // 신한 사례의 시장 경쟁 언어
  ],
  sales: [
    '영업', '고객 확보', '신규 고객', '리드', '전환율',
    '매출 증대', '판매', '프로모션', '캠페인',
  ],
  tech: [
    '기술', 'AI', 'DX', 'AX', '디지털 전환',
    'API', 'SaaS', '플랫폼 구축', '시스템', '솔루션 도입',
    '머신러닝', '데이터 파이프라인',
  ],
}

// ─────────────────────────────────────────
// 2. 결과 타입
// ─────────────────────────────────────────

export interface FramingDiagnosis {
  detected: Department
  /** PM 이 명시한 목표 부서 (intendedDepartment) */
  intendedDepartment?: Department
  /** detected === intendedDepartment 면 true */
  match: boolean
  /** 감지에 사용된 키워드·문장 근거 */
  evidence: string[]
  /** 불일치 시 수정 제안 (AI 호출 시에만) */
  suggestion?: string
  /** AI 호출 모드 / heuristic fallback 모드 */
  mode: 'ai' | 'heuristic'
}

export interface FramingDiagnoseInput {
  draft: ExpressDraft
  channel: Channel
  intendedDepartment?: Department
}

// ─────────────────────────────────────────
// 3. 메인 함수
// ─────────────────────────────────────────

/**
 * 프레임 진단. B2B 채널일 때 가장 강하게 작동.
 * B2G / renewal 은 채널별 다른 lens — 본 모듈은 기본 heuristic 만 적용.
 */
export async function diagnoseFraming(
  input: FramingDiagnoseInput,
): Promise<FramingDiagnosis> {
  const { draft, channel, intendedDepartment } = input

  // 1차 인상이 결정적 — sections.1 (제안 배경) + sections.2 (추진 전략) 만 사용
  const firstImpression = [
    draft.sections?.['1'] ?? '',
    draft.sections?.['2'] ?? '',
  ].join('\n\n').trim()

  // 텍스트 부족 시 — 슬롯 미작성, 진단 skip
  if (firstImpression.length < 100) {
    return {
      detected: intendedDepartment ?? 'csr',
      intendedDepartment,
      match: true, // 아직 작성 안 됐으므로 신호 없음
      evidence: ['sections.1 또는 sections.2 가 아직 충분하지 않음 (100자 미만)'],
      mode: 'heuristic',
    }
  }

  // B2G / renewal — heuristic 만 사용 (별도 lens 는 v2.1 에서)
  if (channel !== 'B2B') {
    return diagnoseHeuristic(firstImpression, intendedDepartment)
  }

  // B2B — AI 호출 시도 → 실패 시 heuristic fallback
  try {
    const aiResult = await diagnoseWithAi(firstImpression, intendedDepartment)
    return aiResult
  } catch (err) {
    log.warn('framing-inspector', 'AI 호출 실패 — heuristic fallback', {
      error: err instanceof Error ? err.message : String(err),
    })
    return diagnoseHeuristic(firstImpression, intendedDepartment)
  }
}

// ─────────────────────────────────────────
// 4. Heuristic 진단 (AI 없이)
// ─────────────────────────────────────────

function diagnoseHeuristic(
  text: string,
  intendedDepartment?: Department,
): FramingDiagnosis {
  // 각 부서 키워드 매칭 개수
  const scores: Record<Department, { count: number; matched: string[] }> = {
    csr: { count: 0, matched: [] },
    strategy: { count: 0, matched: [] },
    sales: { count: 0, matched: [] },
    tech: { count: 0, matched: [] },
  }

  for (const [dept, keywords] of Object.entries(DEPARTMENT_KEYWORDS) as [
    Department,
    readonly string[],
  ][]) {
    for (const kw of keywords) {
      if (text.includes(kw)) {
        scores[dept].count += 1
        scores[dept].matched.push(kw)
      }
    }
  }

  // 최다 매칭 부서 = 감지된 부서
  const sortedDepts = (Object.entries(scores) as [Department, typeof scores.csr][])
    .sort((a, b) => b[1].count - a[1].count)
  const detected = sortedDepts[0][0]
  const evidence = sortedDepts[0][1].matched.slice(0, 5).map((kw) => `"${kw}" 매칭`)

  // 의도 부서와 비교
  const match = !intendedDepartment || detected === intendedDepartment

  return {
    detected,
    intendedDepartment,
    match,
    evidence: evidence.length > 0 ? evidence : ['특별한 부서 키워드 매칭 없음 — 중립'],
    suggestion: !match
      ? `현재 글이 [${labelDept(detected)}] 부서 언어로 감지됩니다. 목표인 [${labelDept(intendedDepartment!)}] 부서로 끌리도록 첫 문단을 재작성하세요.`
      : undefined,
    mode: 'heuristic',
  }
}

// ─────────────────────────────────────────
// 5. AI 진단 (정밀)
// ─────────────────────────────────────────

interface AiFramingResponse {
  detected: Department
  evidence: string[]
  suggestion?: string
}

async function diagnoseWithAi(
  text: string,
  intendedDepartment?: Department,
): Promise<FramingDiagnosis> {
  const intendedHint = intendedDepartment
    ? `\n\n[참고] PM 이 목표로 한 부서: ${labelDept(intendedDepartment)}`
    : ''

  const prompt = `당신은 한국 대기업·재단의 제안서 평가 경험이 많은 시니어 컨설턴트입니다.
아래 제안서 도입부가 발주처의 어느 "부서" 언어로 작성되었는지 진단하세요.

[제안서 도입부 — sections 1·2]
${text.slice(0, 3000)}
${intendedHint}

4 부서 정의:
- csr (사회공헌·CSR·ESG): 사회적 가치, 동반성장, 시민, 임팩트 언어. 취약계층·지역 공공성 강조.
- strategy (기획·전략): 시장 경쟁, MAU, 매출, 차별화, 비즈니스 모델 언어. 경쟁사·점유율 강조.
- sales (영업·고객): 고객 확보, 매출 증대, 캠페인 언어. 전환율·리드 강조.
- tech (기술·DX): 기술 도입, AI/플랫폼/시스템 언어. API·아키텍처·솔루션 강조.

진단 기준:
- 첫 5문장의 어조·키워드가 결정적
- 정량 수치가 사회 임팩트(취약계층 비율 등)인지 사업 성과(MAU·매출)인지
- 인용된 정책·제도가 사회공헌 영역인지 산업 영역인지

반드시 아래 JSON 만 반환:
{
  "detected": "csr" | "strategy" | "sales" | "tech",
  "evidence": ["감지 근거 1 (직접 인용)", "근거 2"],
  "suggestion": "${intendedDepartment ? '목표 부서와 다른 경우 수정 제안 1문장' : '진단 결과 한 줄 요약'}"
}`

  const result = await invokeAi({
    prompt,
    maxTokens: AI_TOKENS.LIGHT,
    temperature: 0.3,
    label: 'framing-inspector',
  })

  const parsed = safeParseJson<AiFramingResponse>(result.raw, 'framing-inspector')

  const detected = parsed.detected
  const match = !intendedDepartment || detected === intendedDepartment

  return {
    detected,
    intendedDepartment,
    match,
    evidence: parsed.evidence ?? [],
    suggestion: parsed.suggestion,
    mode: 'ai',
  }
}

// ─────────────────────────────────────────
// 6. 라벨
// ─────────────────────────────────────────

const DEPARTMENT_LABELS: Record<Department, string> = {
  csr: '사회공헌·CSR',
  strategy: '기획·전략',
  sales: '영업·고객',
  tech: '기술·DX',
}

export function labelDept(dept: Department): string {
  return DEPARTMENT_LABELS[dept]
}

export function getAllDepartments(): { value: Department; label: string }[] {
  return (Object.entries(DEPARTMENT_LABELS) as [Department, string][]).map(([value, label]) => ({
    value,
    label,
  }))
}

export type { Department }
