/**
 * Phase M-fix wire-up 검증.
 *
 * 1. extractor 가 messageHierarchy 객체 형태 정상 처리
 * 2. extractor 가 sectionMeta 객체 형태 정상 처리
 * 3. KNOWN_SLOT_PREFIXES 필터링 통과
 * 4. 유효하지 않은 데이터는 거부
 * 5. End-to-end: LLM 출력 형태 → extractor → render-markdown 까지 흐름
 */

import {
  mergeExtractedSlots,
  filterKnownSlots,
} from '../src/lib/express/extractor'
import { emptyDraft } from '../src/lib/express/schema'
import { renderExpressMarkdown } from '../src/lib/express/render-markdown'

let p = 0, f = 0
const ok = (l: string, c: boolean, hint?: string) =>
  c ? (console.log(`  ✓ ${l}`), p++) : (console.log(`  ✗ ${l}${hint ? ' → ' + hint : ''}`), f++)

// ─── 1. filterKnownSlots: messageHierarchy/sectionMeta 통과 ───
console.log('\n[1] KNOWN_SLOT_PREFIXES 화이트리스트')
const filtered = filterKnownSlots({
  messageHierarchy: [{ key: 'test message' }],
  sectionMeta: { '1': { headline: 'test' } },
  invalidKey: 'should-be-filtered',
  intent: '테스트 의도',
})
ok('messageHierarchy 통과', 'messageHierarchy' in filtered)
ok('sectionMeta 통과', 'sectionMeta' in filtered)
ok('invalidKey 필터링', !('invalidKey' in filtered))
ok('intent 통과', 'intent' in filtered)

// ─── 2. messageHierarchy 머지 ───
console.log('\n[2] messageHierarchy 머지')
{
  const draft = emptyDraft()
  const result = mergeExtractedSlots(draft, {
    messageHierarchy: [
      {
        key: '세대융합 5팀 발굴',
        sub: [
          '청년 5팀 × 시니어 멘토 1:1 매칭으로 자원·경험 결합 모델 설계',
          '6주 동안 팀빌딩부터 데모데이까지 전주기 실행',
        ],
        quantProofs: [
          '청년 30명 → 5팀 (선발률 17%)',
          '코치 800명 풀에서 5명 선발',
        ],
      },
      {
        key: '실전 MVP 검증',
        sub: ['주간 1:1 코칭 6주 × 5팀 = 30회 세션'],
        quantProofs: ['MVP 검증율 80% 목표'],
      },
    ],
  })
  ok('머지 성공', result.acceptedSlots.includes('messageHierarchy'))
  ok('hierarchy 2개 저장', result.draft.messageHierarchy?.length === 2)
  ok('첫 번째 key 정상', result.draft.messageHierarchy?.[0].key === '세대융합 5팀 발굴')
  ok('첫 번째 sub 2개', result.draft.messageHierarchy?.[0].sub.length === 2)
  ok('첫 번째 quantProofs 2개', result.draft.messageHierarchy?.[0].quantProofs.length === 2)
}

// ─── 3. messageHierarchy 짧은 항목 trim ───
console.log('\n[3] messageHierarchy 짧은 항목 trim')
{
  const draft = emptyDraft()
  const result = mergeExtractedSlots(draft, {
    messageHierarchy: [
      {
        key: '정상 키 메시지',
        sub: [
          '정상 sub 메시지 — 15자 이상',
          '짧음', // 15자 미만 → 제거
          '또 정상 sub 메시지 — 15자 이상 됨',
        ],
        quantProofs: [
          '정상 정량',
          '너', // 5자 미만 → 제거
          '두 번째 정량 (5자+)',
        ],
      },
      {
        key: '짧음', // 8자 미만 → 항목 자체 제거
        sub: [],
        quantProofs: [],
      },
    ],
  })
  ok('짧은 key 항목 제거됨', result.draft.messageHierarchy?.length === 1)
  ok('sub 짧은 거 제거 (2개만)', result.draft.messageHierarchy?.[0].sub.length === 2)
  ok('quantProofs 짧은 거 제거 (2개만)', result.draft.messageHierarchy?.[0].quantProofs.length === 2)
}

// ─── 4. sectionMeta 머지 ───
console.log('\n[4] sectionMeta 머지')
{
  const draft = emptyDraft()
  const result = mergeExtractedSlots(draft, {
    sectionMeta: {
      '1': {
        subtitle: ': 청년마을 정책 배경',
        headline: '청년이 주체가 되어 지역에 활력을 넣는 대표 장기 지속 사업',
      },
      '2': {
        subtitle: ': 4대 가치 내재화',
        headline: '연대·협력·참여·혁신 4 가치 내재화된 청년마을',
      },
      'invalid': { headline: 'should be ignored' }, // 1~7 범위 외
    },
  })
  ok('sectionMeta 머지 성공', result.acceptedSlots.includes('sectionMeta'))
  ok('section 1 subtitle 저장', result.draft.sectionMeta?.['1']?.subtitle?.startsWith(':'))
  ok('section 1 headline 저장', !!result.draft.sectionMeta?.['1']?.headline)
  ok('section 2 subtitle 저장', !!result.draft.sectionMeta?.['2']?.subtitle)
  ok('invalid 키 무시', !('invalid' in (result.draft.sectionMeta ?? {})))
}

// ─── 5. sectionMeta 일부만 (subtitle만 / headline만) ───
console.log('\n[5] sectionMeta 부분만 (legacy 호환)')
{
  const draft = emptyDraft()
  const result = mergeExtractedSlots(draft, {
    sectionMeta: {
      '3': { headline: '4 유형 맞춤 커리큘럼' }, // subtitle 없음
      '4': { subtitle: ': 운영 체계' }, // headline 없음
    },
  })
  ok('section 3 headline만', result.draft.sectionMeta?.['3']?.headline === '4 유형 맞춤 커리큘럼')
  ok('section 3 subtitle 없음', result.draft.sectionMeta?.['3']?.subtitle === undefined)
  ok('section 4 subtitle만', result.draft.sectionMeta?.['4']?.subtitle === ': 운영 체계')
  ok('section 4 headline 없음', result.draft.sectionMeta?.['4']?.headline === undefined)
}

// ─── 6. End-to-end: extractor → render-markdown ───
console.log('\n[6] End-to-end — LLM 출력 형태 → extractor → render')
{
  // LLM 이 다음과 같이 응답한다고 가정 (실제 turn.ts 프롬프트 요구 형식)
  const llmOutput = {
    'sections.1':
      '청년마을 사업은 2018년부터 8년차 운영 중이며 \'19년 5만명에서 \'23년 70만명으로 비수도권 인구 감소가 가속화되고 있습니다. 한국표준협회 2025 평가 결과에 따르면 매년 변동되는 단년도 성과 지표 + 분절된 브랜딩 으로 장기 성과 관리가 어렵습니다. 본 사업은 4대 가치 내재화 + 통합 브랜딩으로 장기 성과 관리 체계를 확립합니다.',
    sectionMeta: {
      '1': {
        subtitle: ': 청년마을 정책 배경 (8년차 진단)',
        headline:
          '청년마을은 지역 공동체와 지역 창업가의 중간점에 있어 정의하기 어렵습니다',
      },
    },
    messageHierarchy: [
      {
        key: '청년마을 주도 사회연대경제 공동체 구축',
        sub: [
          '당사자 중심으로 행정부·기업 ESG·전국 300명 멘토가 함께 만드는 공동체 구성',
          '8년 분절된 브랜딩을 통합 브랜딩 + 장기 성과 관리 체계로 진화',
        ],
        quantProofs: [
          '전국 300명 멘토 풀 확보',
          '8년 운영 + 신규 5년 = 13년 시계열 데이터',
        ],
      },
    ],
    keyMessages: [
      '청년마을 사회연대경제 공동체',
      '4대 가치 내재화',
      '4중 페이스메이커 시스템',
    ],
  }

  // filterKnownSlots → mergeExtractedSlots → render
  const filtered = filterKnownSlots(llmOutput)
  const draft = emptyDraft()
  const merged = mergeExtractedSlots(draft, filtered)

  ok('sections.1 머지', !!merged.draft.sections?.['1'])
  ok('sectionMeta.1.headline 머지', !!merged.draft.sectionMeta?.['1']?.headline)
  ok('messageHierarchy 머지', (merged.draft.messageHierarchy?.length ?? 0) > 0)
  ok('keyMessages 머지', (merged.draft.keyMessages?.length ?? 0) === 3)

  // render
  const md = renderExpressMarkdown({
    project: {
      name: '청년마을 E2E',
      client: '행정안전부',
      totalBudgetVat: null,
      supplyPrice: null,
      eduStartDate: null,
      eduEndDate: null,
    },
    draft: merged.draft,
  })
  ok('렌더 hierarchy 출력', md.includes('## 💬 핵심 메시지 hierarchy'))
  ok('렌더 hierarchy key 큰따옴표', md.includes('"청년마을 주도 사회연대경제 공동체 구축"'))
  ok('렌더 정량 근거 박스', md.includes('**정량 근거**'))
  ok('렌더 section 1 헤드라인 큰따옴표', md.includes('"청년마을은 지역 공동체와 지역 창업가의 중간점에 있어 정의하기 어렵습니다"'))
  ok('렌더 section 1 부제 (콜론)', md.includes('## 1. 제안 배경 및 목적 : 청년마을 정책 배경'))
}

console.log('\n─────────────────────────')
console.log(`결과: ${p} 통과 / ${f} 실패`)
if (f > 0) process.exit(1)
