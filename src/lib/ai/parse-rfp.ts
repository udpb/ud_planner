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
  // ⚠️ 날짜 정확성 지침 (Wave 5 fix):
  // - 한국식 표기 "2026.7.1" / "2026년 7월 1일" / "26.7.1" 등 모두 YYYY-MM-DD 로 정규화
  // - 2자리 연도 (26.7.1) → 2026 로 가정 (이번 사업·내년 사업이 압도적)
  // - "착수일~종료일" 구분: 사업 전체 (projectStart/End) vs 교육 기간 (eduStart/End)
  // - "협약일 기준 6개월" 같은 상대 표현은 null (절대 추정 X)
  // - "상반기/하반기" 만 있으면 null (구체 일자 없음)
  // - 텍스트에 명시되지 않은 필드는 반드시 null
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
  return parsed
}
