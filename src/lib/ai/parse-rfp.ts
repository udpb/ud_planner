/**
 * RFP 파싱 — Phase 2.1 단순화 (claude.ts 에서 분리, 2026-05-03)
 *
 * RFP 텍스트 → 구조화된 JSON (RfpParsed) 변환.
 * 2026-05-03 (Phase L1): anthropic 직접 호출 → invokeAi (Gemini Primary + Claude Fallback).
 */

import { invokeAi } from '@/lib/ai-fallback'
import { AI_TOKENS } from '@/lib/ai/config'
import { safeParseJson } from '@/lib/ai/parser'
import {
  PROJECT_TASK_VALUES,
  type ProjectTaskType,
} from '@/lib/program-profile'

export interface RfpParsed {
  projectName: string
  client: string
  totalBudgetVat: number | null
  supplyPrice: number | null
  projectStartDate: string | null
  projectEndDate: string | null
  eduStartDate: string | null
  eduEndDate: string | null
  targetAudience: string
  targetCount: number | null
  targetStage: string[]
  objectives: string[]
  deliverables: string[]
  evalCriteria: Array<{ item: string; score: number; notes: string }>
  constraints: Array<{ type: string; description: string }>
  requiredPersonnel: Array<{ role: string; qualification: string; count: number }>
  keywords: string[]
  projectType: 'B2G' | 'B2B'
  region: string
  summary: string
  /**
   * v1.1: RFP 본문에서 자동 감지한 과업 유형 (6종 중 해당하는 것만).
   * step-rfp.tsx 가 이 값을 programProfile.supportStructure.tasks 초기값으로 주입.
   */
  detectedTasks?: ProjectTaskType[]
}

export async function parseRfp(text: string): Promise<RfpParsed> {
  const result = await invokeAi({
    prompt: `당신은 교육 사업 제안서 전문가입니다. 아래 RFP(제안요청서) 텍스트를 분석하여 구조화된 JSON으로 반환하세요.

반드시 아래 JSON 형식만 반환하세요 (마크다운 코드블록 없이):
{
  "projectName": "사업명",
  "client": "발주기관명",
  "totalBudgetVat": 예산(VAT포함, 숫자, 원 단위) 또는 null,
  "supplyPrice": 공급가액(VAT제외) 또는 null,
  "projectStartDate": "YYYY-MM-DD" 또는 null,
  "projectEndDate": "YYYY-MM-DD" 또는 null,
  "eduStartDate": "YYYY-MM-DD" 또는 null,
  "eduEndDate": "YYYY-MM-DD" 또는 null,
  // ⚠️ 날짜 정확성 지침 (B1 강화, 2026-05-19):
  // 1. 다음 포맷 모두 인식 — null 처리 X, YYYY-MM-DD 로 변환:
  //    - "2026.7.1" / "2026.07.01" / "2026-7-1" / "2026/7/1"
  //    - "2026년 7월 1일" / "2026년 7월"
  //    - "26.7.1" / "'26.7.1"  (2자리 연도 → 2000+년)
  //    - "7월 1일" (연도 생략) → 현재 연도 기준
  //    - "2026.3~12" / "2026.3 ~ 2026.12" → start=2026-03-01, end=2026-12-31
  //    - "3~12월" (연도 생략) → 현재 연도
  // 2. 컨텍스트 키워드 매핑:
  //    - "사업 기간", "수행 기간", "협약 기간" → projectStart/End
  //    - "교육 기간", "운영 기간", "수업 기간" → eduStart/End
  //    - 둘 다 모호하면 projectStart/End 채우고 eduStart/End 는 같은 값 복사
  // 3. "월" 단위만 명시되면 일자 추정 (start=01일 / end=말일):
  //    - "2026년 3월" → start: 2026-03-01, end: 2026-03-31
  //    - "2026년 상반기" → start: 2026-01-01, end: 2026-06-30
  //    - "2026년 하반기" → start: 2026-07-01, end: 2026-12-31
  // 4. "협약일 기준 6개월" 같은 상대 표현만 단독으로 있으면 null (절대 추정 X).
  //    단, "협약 후 즉시 ~ 2026.12" 처럼 종료일이 명시되면 종료일만 채움.
  // 5. 텍스트 어디에도 일자/월/반기 단서 0 이면 null.
  "targetAudience": "대상자 설명",
  "targetCount": 참여인원수 또는 null,
  "targetStage": ["예비창업", "초기창업"] 등,
  "objectives": ["목표1", "목표2"],
  "deliverables": ["산출물1", "산출물2"],
  "evalCriteria": [{"item": "평가항목", "score": 점수, "notes": "세부내용"}],
  "constraints": [{"type": "인력/하도급/기타", "description": "제약사항"}],
  "requiredPersonnel": [{"role": "PM/코치/강사", "qualification": "자격요건", "count": 인원수}],
  "keywords": ["키워드1", "키워드2"],
  "projectType": "B2G" 또는 "B2B",
  "region": "지역",
  "summary": "사업 핵심 요약 2~3문장",
  "detectedTasks": ["모객", "심사_선발", ...]
}

"detectedTasks" 작성 지침 (중요):
이 사업에 다음 6가지 과업 유형 중 어떤 것이 포함되는지 판단하여 detectedTasks 배열로 반환하세요.
RFP 본문에 **명시적으로 나오는 것만** (추정 금지). 반드시 아래 6개 값 중에서만 선택:
  - "모객" : 참여자 모집·홍보 과업 (공고·홍보·신청 접수 등)
  - "심사_선발" : 공모·심사·선정 단계 (서류 심사·PT·평가위원 등)
  - "교류_네트워킹" : 참여자 간 교류·외부 파트너 네트워킹·동문 연결
  - "멘토링_코칭" : 1:1 또는 팀 기반 멘토링·코칭 (전담 코치·멘토단)
  - "컨설팅_산출물" : 명확한 deliverable (보고서·실물·디자인·브랜딩 등 산출물 제출)
  - "행사_운영" : 데모데이·박람회·페스티벌·컨퍼런스 등 이벤트 운영
보통 한 사업에 2~5개가 포함됩니다. RFP 에 흔적이 없으면 빈 배열 [] 로 반환.

RFP 텍스트:
${text.length > 200000 ? text.slice(0, 200000) + '\n\n[...분량 초과로 일부 생략...]' : text}`,
    maxTokens: AI_TOKENS.LARGE,
    temperature: 0.4,
    label: 'parse-rfp',
  })

  const raw = result.raw.trim()
  const parsed = safeParseJson<RfpParsed>(raw, 'parseRfp')
  // detectedTasks 검증 — enum 밖 값은 필터링
  if (Array.isArray(parsed.detectedTasks)) {
    parsed.detectedTasks = parsed.detectedTasks.filter((t): t is ProjectTaskType =>
      (PROJECT_TASK_VALUES as readonly string[]).includes(t),
    )
  } else {
    parsed.detectedTasks = []
  }

  // B1 (2026-05-19): AI 가 null 로 반환한 날짜는 정규식 fallback 으로 본문에서 재추출.
  // 한국 RFP 의 흔한 패턴 — "사업기간: 2026.3 ~ 2026.12" 같은 형식.
  const dateExtract = extractDatesFromText(text)
  if (parsed.projectStartDate == null && dateExtract.projectStart) {
    parsed.projectStartDate = dateExtract.projectStart
  }
  if (parsed.projectEndDate == null && dateExtract.projectEnd) {
    parsed.projectEndDate = dateExtract.projectEnd
  }
  if (parsed.eduStartDate == null && (dateExtract.eduStart || parsed.projectStartDate)) {
    parsed.eduStartDate = dateExtract.eduStart ?? parsed.projectStartDate
  }
  if (parsed.eduEndDate == null && (dateExtract.eduEnd || parsed.projectEndDate)) {
    parsed.eduEndDate = dateExtract.eduEnd ?? parsed.projectEndDate
  }

  return parsed
}

/**
 * B1 — RFP 본문에서 날짜 정규식 추출 (AI 후처리 fallback).
 *
 * 추출 우선순위:
 *   1. "사업/수행/협약 기간" 키워드 + 날짜 → project*
 *   2. "교육/운영/수업 기간" 키워드 + 날짜 → edu*
 *   3. 키워드 없이 단독 날짜 범위 → project* (edu 는 같은 값 복사)
 *
 * 지원 포맷:
 *   YYYY.M.D / YYYY.MM.DD / YYYY-MM-DD / YYYY/MM/DD
 *   YYYY년 M월 (D일)
 *   YYYY.M ~ YYYY.M (월 단위 범위)
 *   상반기 / 하반기
 */
function extractDatesFromText(text: string): {
  projectStart?: string
  projectEnd?: string
  eduStart?: string
  eduEnd?: string
} {
  if (!text) return {}

  // 본문에서 줄 단위로 키워드 라벨이 있는 라인 우선 탐색
  const lines = text.split(/\r?\n/).slice(0, 500) // 너무 긴 RFP 첫 500줄만

  const result: {
    projectStart?: string
    projectEnd?: string
    eduStart?: string
    eduEnd?: string
  } = {}

  for (const line of lines) {
    if (line.length > 300) continue // 본문 단락 skip

    const isProjectKw = /(사업\s*기간|수행\s*기간|협약\s*기간|용역\s*기간|계약\s*기간)/.test(
      line,
    )
    const isEduKw = /(교육\s*기간|운영\s*기간|수업\s*기간|프로그램\s*기간|강의\s*기간)/.test(line)
    if (!isProjectKw && !isEduKw) continue

    const range = parseDateRange(line)
    if (!range) continue
    if (isProjectKw) {
      result.projectStart ??= range.start
      result.projectEnd ??= range.end
    }
    if (isEduKw) {
      result.eduStart ??= range.start
      result.eduEnd ??= range.end
    }
  }

  // 키워드 라인 없으면 — 첫 1000자에서 단독 날짜 범위 탐색
  if (!result.projectStart && !result.eduStart) {
    const head = text.slice(0, 2000)
    const range = parseDateRange(head)
    if (range) {
      result.projectStart = range.start
      result.projectEnd = range.end
    }
  }

  return result
}

/**
 * 한 줄 또는 텍스트 조각에서 첫 번째 날짜 "범위" 추출.
 * "2026.3 ~ 2026.12" / "2026년 3월 ~ 12월" / "2026.3.1 ~ 2026.12.31" 등.
 * 단일 일자만 있어도 range.start = 그 일자, end = undefined.
 */
function parseDateRange(s: string): { start: string; end?: string } | null {
  // 1) YYYY[.- /년]M(?:[.- /월]D)? ~ YYYY?[.- /년]?M(?:[.- /월]D)?
  //    한국식 모든 구분자 (. / - 년월일)
  const FULL = /(\d{2,4})\s*[.\-/년]\s*(\d{1,2})(?:\s*[.\-/월]\s*(\d{1,2})\s*일?)?/g
  const matches = Array.from(s.matchAll(FULL))
  if (matches.length === 0) {
    // 상반기/하반기 단독 케이스
    const halfMatch = s.match(/(\d{2,4})\s*년?\s*(상반기|하반기)/)
    if (halfMatch) {
      const year = normalizeYear(halfMatch[1])
      const half = halfMatch[2]
      return half === '상반기'
        ? { start: `${year}-01-01`, end: `${year}-06-30` }
        : { start: `${year}-07-01`, end: `${year}-12-31` }
    }
    return null
  }
  // 2) 첫 매치 → start, 두 번째 매치 → end (있으면)
  const first = matches[0]
  const startYear = normalizeYear(first[1])
  const startMonth = pad2(first[2])
  const startDay = first[3] ? pad2(first[3]) : '01'
  const start = `${startYear}-${startMonth}-${startDay}`

  if (matches.length >= 2) {
    const second = matches[1]
    // 두 번째 매치가 연도 생략된 형태일 수 있음 (예: "2026.3 ~ 12" → second[1]=12 가 연도가 아니라 월)
    // 휴리스틱: second[1] 이 12 이하이고 second[3] 이 없으면 month 만 명시 (연도 = first 연도)
    let endYear: string
    let endMonth: string
    let endDay: string

    const second1 = parseInt(second[1], 10)
    if (second1 <= 12 && !second[3] && parseInt(first[1], 10) > 12) {
      // "2026.3 ~ 12" 패턴 — second[1]=12, second[2] 없거나 매치 길이 짧음
      endYear = startYear
      endMonth = pad2(String(second1))
      endDay = lastDayOfMonth(endYear, endMonth)
    } else {
      endYear = normalizeYear(second[1])
      endMonth = pad2(second[2])
      endDay = second[3] ? pad2(second[3]) : lastDayOfMonth(endYear, endMonth)
    }
    return { start, end: `${endYear}-${endMonth}-${endDay}` }
  }

  // 단일 일자만 — end 는 동일 월 말일 (단일 일자에 D 가 명시되면 그 일자 자체)
  if (first[3]) {
    return { start, end: undefined }
  }
  return { start, end: `${startYear}-${startMonth}-${lastDayOfMonth(startYear, startMonth)}` }
}

function normalizeYear(y: string): string {
  const n = parseInt(y, 10)
  if (n < 100) return String(2000 + n) // "26" → "2026"
  return String(n)
}

function pad2(s: string): string {
  return s.padStart(2, '0')
}

function lastDayOfMonth(year: string, month: string): string {
  const y = parseInt(year, 10)
  const m = parseInt(month, 10)
  // m 이 12 면 다음 해 1월의 0일 = 12월 마지막날
  const lastDay = new Date(y, m, 0).getDate()
  return pad2(String(lastDay))
}
