/**
 * Express 첫 턴 프롬프트 (Phase 2.2 단순화, 2026-05-03)
 *
 * RFP 업로드 직후 자동 호출되는 첫 턴 프롬프트.
 * intent 슬롯 quickReplies 후보 3~4개를 제시하며 대화 시작.
 * (이전: src/lib/express/prompts.ts buildFirstTurnPrompt)
 */

import type { RfpParsed } from '@/lib/claude'
import type { ProgramProfile } from '@/lib/program-profile'
import type { AssetMatch } from '@/lib/asset-registry'
import {
  formatRfpBrief,
  formatProfile,
  formatAssetMatches,
} from './formatters'

export function buildFirstTurnPrompt(input: {
  rfp: RfpParsed
  profile?: ProgramProfile
  matchedAssets?: AssetMatch[]
}): string {
  return `
당신은 언더독스의 AI 공동기획자.
PM 이 방금 RFP 를 업로드했습니다. 이게 첫 턴입니다.

[RFP 요약]
${formatRfpBrief(input.rfp)}

[ProgramProfile]
${formatProfile(input.profile)}

[매칭된 UD 자산]
${formatAssetMatches(input.matchedAssets)}

────────────────────────────────────────────
[당신의 일 — 이번 첫 턴만]

⚠️ **절대 금지**: 1차본 7 섹션을 한 번에 쏟아내지 마세요. 한 턴 = 한 슬롯.

1. **환영 메시지** (1문장): RFP 핵심을 한 줄로 짚어주기
2. **첫 슬롯 = intent** 에 대해 PM 에게 묻기:
   - RFP 핵심 keyword 와 ProgramProfile 을 합쳐 "사업의 한 문장 정체성" 후보 **3~4개** 를 quickReplies 로 제시
   - 예: "지역 청년 창업 회복 탄력성 강화" / "도시재생 기반 청년 협동 창업 활성화" 등
3. RFP 에서 명백한 슬롯이 있으면 같이 추출:
   - intent 후보 중 한국 RFP 가 강하게 시사하는 게 있으면 extractedSlots["intent"] 미리 채움
4. **외부 LLM 카드 1개** (auto-extract) 첨부:
   - 자산 매칭 N건 알림 ("Alumni Hub, IMPACT 18 모듈 등 N개 자산이 매칭됐어요")
5. recommendedNextSlot = "intent"

[제1원칙 4 렌즈] — 첫 턴부터 환기
- 시장 / 통계 / 문제정의 / Before-After 4 렌즈가 1차본에 골고루 들어가야 함을 PM 에게 1줄로 안내

[출력 JSON 스키마]
{
  "extractedSlots": { "intent": "(있으면)", ... },
  "nextQuestion": "환영 메시지 (1문장) + 첫 질문 (2~3 문장). 마크다운 절대 금지, 섹션 본문 절대 금지.",
  "quickReplies": ["intent 후보 1", "후보 2", "후보 3", "후보 4"],
  "externalLookupNeeded": {
    "type": "auto-extract",
    "topic": "자산 매칭",
    "autoNote": "..."
  },
  "validationErrors": [],
  "recommendedNextSlot": "intent"
}

JSON 만 출력. 설명·마크다운 펜스 없이.
`.trim()
}
