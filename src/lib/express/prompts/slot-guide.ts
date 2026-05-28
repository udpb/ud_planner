/**
 * Express 슬롯별 가이드 (Phase 2.2 단순화, 2026-05-03)
 *
 * 현재 슬롯에 대해 챗봇이 어떻게 대화·추출해야 하는지 가이드 문구.
 * (이전: src/lib/express/prompts.ts 단일 파일에서 분리)
 */

import type { AssetMatch } from '@/lib/asset-registry'
// Phase M-fix-3 — 섹션별 추천 패턴 inline 주입
import { getPatternCheatSheetBySection } from '@/lib/proposal-patterns'

export function currentSlotGuide(currentSlot: string | null, matchedAssets?: AssetMatch[]): string {
  if (!currentSlot) return '(모두 채워짐 — 검토 / 보완 단계)'

  const topAsset = matchedAssets && matchedAssets.length > 0 ? matchedAssets[0] : null
  const assetHint = topAsset
    ? `\n- 매칭 자산 활용 힌트: "${topAsset.asset.name}" 의 narrativeSnippet 을 자연스럽게 인용`
    : ''

  switch (currentSlot) {
    case 'intent':
      return (
        '- "사업의 한 문장 정체성" 을 PM 과 합의\n' +
        '- 30자 내외, 평가위원이 5초에 이해하는 표현\n' +
        '- RFP 의 핵심 keyword 와 ProgramProfile 사업영역을 합쳐 후보 2~3개 제시 후 PM 에게 quickReplies 로 고르게 하기' +
        assetHint
      )
    case 'beforeAfter.before':
      return (
        '- 교육 전 "참가자가 처한 문제 상황" 을 1~2문장으로\n' +
        '- 정량 수치 또는 구체적 페인 포인트 (제1원칙 통계 / 문제정의 렌즈)\n' +
        '- RFP 의 targetAudience / objectives 에서 단서 찾기\n' +
        '- quickReplies 로 후보 3~4개 (예: "지역 청년 인구 유출 N%", "창업 시도 후 6개월 내 폐업 X%")'
      )
    case 'beforeAfter.after':
      return (
        '- 교육 후 "측정 가능한 변화" 를 1~2문장으로\n' +
        '- Before 와 명확히 구분되는 행동·역량·결과\n' +
        '- KPI 형태 권장 (수치 + 단위 + 기간)\n' +
        '- quickReplies 로 후보 3~4개'
      )
    case 'keyMessages.0':
    case 'keyMessages.1':
    case 'keyMessages.2': {
      const idx = Number(currentSlot.split('.')[1]) + 1
      const isLast = currentSlot === 'keyMessages.2'
      return (
        `- 핵심 메시지 ${idx} 번 — 8~80자 짧은 슬로건\n` +
        '- 평가위원 머릿속에 박힐 "한 줄 카피"\n' +
        '- 3개 모두 다른 각도여야 함 (사업 본질 / 차별화 / 임팩트)\n' +
        '- quickReplies 로 후보 4~5개 다양한 톤' +
        (isLast
          ? '\n' +
            '\n- ⭐ keyMessages 3개 모두 채워지면 동시에 **messageHierarchy** 도 제안 (Phase M-fix-1):\n' +
            '  extractedSlots["messageHierarchy"] = [\n' +
            '    { key: <메시지 1>, sub: [구체화 1~3], quantProofs: [정량 근거 1~3] },\n' +
            '    { key: <메시지 2>, sub: [...], quantProofs: [...] },\n' +
            '    { key: <메시지 3>, sub: [...], quantProofs: [...] }\n' +
            '  ]\n' +
            '  sub 는 15~200자 (메시지 구체화 — 어떻게/왜/누구와)\n' +
            '  quantProofs 는 5~150자 (수치·년도·기관명 — 매칭 자산·UD_TRACK_RECORD 활용)\n' +
            '  비어 있어도 됨 (sub: [], quantProofs: []) — 가능한 만큼만'
          : '')
      )
    }
    case 'differentiators':
      return (
        '- 매칭된 UD 자산 중 PM 이 채택할 3~5개를 결정\n' +
        '- 각 자산의 narrativeSnippet 을 1줄 인용 + "수락 / 제외 / 수정" quickReplies\n' +
        '- 점수 가장 높은 자산부터 한 번에 1~2개씩 PM 검토 받기' +
        assetHint
      )
    case 'sections.1':
      return (
        '- ① 제안 배경 및 목적 — 시장 진단 + 정책 맥락 + 발주처 미션\n' +
        '- 첫 단락: Before (현황·문제) → 둘째 단락: After (사업 목적)\n' +
        '- 통계 1개 이상 + UD 자산 1개 이상 인용\n' +
        '- 길이 400~600자\n' +
        '- nextQuestion 에는 절대 본문을 쓰지 말고 extractedSlots["sections.1"] 에 넣기\n' +
        sectionMetaHint('1', '제안 배경 (정책 맥락)', '청년 N% 가 ~ 문제를 겪고 있습니다')
      )
    case 'sections.2':
      return (
        '- ② 추진 전략 및 방법론 — 언더독스 차별화의 핵심 섹션\n' +
        '- IMPACT 18 모듈 / ACT Canvas / 매칭형 실행지원 등 자산을 적극 인용\n' +
        '- "왜 언더독스인가" 가 분명히 나와야 함\n' +
        '- 길이 500~700자\n' +
        '- extractedSlots["sections.2"] 안에만!\n' +
        sectionMetaHint('2', '4대 전략', '연대·협력·참여·혁신 4 가치로 추진')
      )
    case 'sections.3':
      return (
        '- ③ 교육 커리큘럼 — 회차별 큰 그림 (1차본 단계라 디테일 X)\n' +
        '- IMPACT 6단계 또는 발주처가 원하는 흐름과 매핑\n' +
        '- Action Week / 1:1 코칭 같은 차별화 요소 1~2개\n' +
        '- 길이 400~600자\n' +
        '- extractedSlots["sections.3"] 안에만!\n' +
        sectionMetaHint('3', '4 유형 맞춤 커리큘럼', '정주·창업·네트워크·지역거점 4 유형 별도 솔루션')
      )
    case 'sections.4':
      return (
        '- ④ 운영 체계 및 코치진 — PM·코치·운영팀 구조\n' +
        '- 언더독스 코치 풀 (도메인별 N명) 인용\n' +
        '- 운영 체계 (PMO·SLA·리스크 관리) 1줄씩\n' +
        '- 길이 300~500자\n' +
        '- extractedSlots["sections.4"] 안에만!\n' +
        sectionMetaHint('4', '4중 페이스메이커 체계', '전담 코치 N명 + 분야 멘토 + 글로벌 파트너 + 동료 네트워크')
      )
    case 'sections.6':
      return (
        '- ⑥ 기대 성과 및 임팩트 — KPI + SROI Forecast (1줄 추정)\n' +
        '- After 와 연결된 정량 KPI 3개\n' +
        '- "예상 SROI 1:N (벤치마크 기반)" 한 줄\n' +
        '- 평가표 임팩트 가중치 높으면 비중 늘리기\n' +
        '- 길이 400~600자\n' +
        '- extractedSlots["sections.6"] 안에만!\n' +
        sectionMetaHint('6', 'N개 정량 KPI', 'MVP 검증율 80% · SROI 1:N · 시드 연계 N건+')
      )
    default:
      return '(슬롯 가이드 미정의 — 슬롯 의도에 따라 자유롭게)'
  }
}

/**
 * Phase M-fix-2 — 섹션 본문을 채울 때 동시에 sectionMeta (One Page One Thesis 패턴)
 * 도 produce 하도록 가이드 (청년마을 PDF: 부제 + 큰따옴표 헤드라인 + 본문).
 */
function sectionMetaHint(
  sectionKey: '1' | '2' | '3' | '4' | '5' | '6' | '7',
  subtitleExample: string,
  headlineExample: string,
): string {
  const patterns = getPatternCheatSheetBySection(sectionKey, 2)
  return (
    `\n- ⭐ One Page One Thesis (청년마을 PDF 학습): 본문과 함께 **sectionMeta** 도 produce:\n` +
    `  extractedSlots["sectionMeta"] = { "${sectionKey}": {\n` +
    `    "subtitle": ": <부제 — 카테고리 라벨, 80자 이내, 콜론으로 시작>",\n` +
    `    "headline": "<큰따옴표로 인용될 단일 주장 — 200자 이내, 정량 포함 권장>"\n` +
    `  } }\n` +
    `  예: subtitle ": ${subtitleExample}" / headline "${headlineExample}"` +
    (patterns ? `\n\n- 적용 가능 패턴 (Phase K Brain):\n${patterns}` : '')
  )
}
