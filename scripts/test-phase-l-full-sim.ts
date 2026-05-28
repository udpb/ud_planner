/**
 * V5: 풀 시뮬레이션 — 계원예대 세대융합창업 RFP → ExpressDraft → .md
 *
 * 실제 RFP 시나리오:
 *   - 계원예대 세대융합창업 6주 프로그램
 *   - 청년 + 시니어 매칭 (만39세이하 + 만50세이상)
 *   - 예산 6천만원 VAT 포함
 *   - 5팀 발굴 + MVP 검증 + IR
 *
 * 검증:
 *   1. messageHierarchy 풍성한 draft → 모든 hierarchy 출력
 *   2. sectionMeta 7 섹션 모두 채워짐 → headline · subtitle 출력
 *   3. UD_TRACK_RECORD 자동 인용 (정량 6+건)
 *   4. SROI forecast 와 본문 일치 시 워닝 없음
 *   5. 평어체 → 경어체 변환 자동
 *   6. .md 파일 4000자+ 풍성한 출력
 *
 * 출력: .tmp-keonwon-full-sim.md (PM 시각 검증용)
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { renderExpressMarkdown } from '../src/lib/express/render-markdown'
import type { ExpressDraft } from '../src/lib/express/schema'
import { UD_TRACK_RECORD } from '../src/lib/ud-brand'

const now = new Date().toISOString()

const draft: ExpressDraft = {
  intent:
    '청년-시니어 매칭 5팀 발굴 + MVP 검증 + IR 자료 산출 — AI 리터러시 + 글로벌 판매역량 강화',
  beforeAfter: {
    before:
      '예술대 청년 (만39세이하) 과 5060 시니어 (만50세이상) 가 자원·경험은 있으나 매칭 채널·창업 실행 도구 부재. 단발성 모임 수준에 머묾.',
    after:
      '6주 후 검증된 MVP 5건 + IR 자료 완성 + 청년-시니어 자생 매칭 5팀. 데모데이 평가 후 시드 연계 가능 단계 진입.',
  },
  messageHierarchy: [
    {
      key: '세대융합 5팀 발굴 — 청년 × 시니어 자원 결합',
      sub: [
        '청년 5팀 × 시니어 멘토 1:1 매칭으로 자원·경험 결합 모델',
        '6주 동안 팀빌딩→문제정의→솔루션→MVP→데모데이 전주기 실행',
      ],
      quantProofs: [
        `청년 모객 30명 → 5팀 (선발률 17%) — 언더독스 ${UD_TRACK_RECORD.programsConducted}개 프로그램 평균 선발률 기반`,
        '시니어 매칭 10명 → 5팀 1:1 매칭',
        '50플러스재단 시니어 인턴십 운영 경험 활용',
      ],
    },
    {
      key: '실전 MVP 검증 — 12주 후 80% 검증율 목표',
      sub: [
        '아이디어 도출 → 고객 분석 → 솔루션 설계 → MVP → BM 6단계 거버넌스',
        '주차별 정량 마일스톤 + 코치 5명 1:1 피드백',
      ],
      quantProofs: [
        'MVP 검증율 80% (4/5 팀 검증된 가설 보유)',
        `전담 코치 5명 (언더독스 ${UD_TRACK_RECORD.totalCoaches}명 풀에서 선발)`,
        '주 1회 정기 코칭 6주 × 5팀 = 30회 1:1 세션',
      ],
    },
    {
      key: 'AI 리터러시 + 글로벌 판매역량 강화',
      sub: [
        '챗GPT·미드저니 활용 MVP 제작 가속화 + 영문 IR·해외 마켓 진출 기초',
        '언더독스 글로벌 파트너 풀 활용 — 일본·인도 거점 멘토 연계',
      ],
      quantProofs: [
        `글로벌 파트너 ${UD_TRACK_RECORD.globalPartners}+ (일본·인도 2025 거점)`,
        '영문 IR 1팀당 2회 작성 워크숍 (총 10회)',
        'AI 리터러시 진단 사전·사후 (5D 진단 활용)',
      ],
    },
  ],
  sections: {
    '1':
      '예술대 청년과 5060 시니어는 각각 다른 강점을 보유합니다. 청년은 디지털 네이티브로 AI 도구·SNS·새로운 비즈니스 모델 이해도가 높은 반면, 시니어는 30년+ 산업 경험·인적 네트워크·자본 여력을 가졌습니다.\n\n그러나 두 세대 간 매칭 채널이 부재하여 세대융합 창업 가능성이 사장되고 있습니다. 통계청 자료에 따르면 50대 창업 의향자 중 65%가 "함께 할 청년 파트너 찾기 어려움" 을 1순위 장애로 답합니다.\n\n본 사업은 6주간 청년 30명 + 시니어 10명을 매칭하여 검증된 MVP 5건 + IR 자료를 산출합니다.',
    '2':
      '본 사업은 3대 전략으로 추진합니다.\n- 첫째, 세대 자원 매핑 — 청년의 디지털 역량과 시니어의 산업 경험을 강점 카드로 표준화 후 1:1 매칭\n- 둘째, ACTT 진단 기반 변화 측정 — 사전·사후 페어 진단으로 +1.10 변화량 정량 입증\n- 셋째, 글로벌 진출 인프라 활용 — 일본·인도 2025 거점 + 520개 글로벌 파트너로 해외 시장 진출 디딤돌',
    '3':
      '6주 커리큘럼은 ACTT 5단계 + DOGS 4유형 기반으로 구성합니다.\n\n주차별 구성:\n- 1주차: DOGS 진단 + 청년-시니어 자원 매칭 (대화카드 활용)\n- 2주차: ACTT 사전 진단 + 5D 진단 + 문제정의 워크숍\n- 3주차: 고객 분석 + 솔루션 아이디어 도출\n- 4주차: MVP 제작 (AI 도구 활용) + 1차 고객 검증\n- 5주차: BM 캔버스 + 영문 IR 작성 + 글로벌 멘토 피드백\n- 6주차: ACTT 사후 진단 + 데모데이 발표 + 시드 연계\n\n매주 코치 1:1 코칭 30분 × 5팀 = 150분 추가 운영.',
    '4':
      '운영 체계는 4중 페이스메이커 구조로 안정성을 확보합니다.\n- 1중: 전담 코치 5명 (언더독스 800명 풀에서 선발, 평균 경력 8년+)\n- 2중: 분야 멘토 3명 (디자인·창업 재무·해외 진출)\n- 3중: 글로벌 파트너 2명 (일본 거점·인도 거점)\n- 4중: 동료 네트워크 (알럼나이 + 청년-시니어 마을 채널)\n\n주차별 보고는 발주처 행정 담당자 대상 PDF 1매로 표준화하여 행정 부담을 최소화합니다.',
    '5':
      '본 사업 총 예산은 60,000,000원 (VAT 포함) 입니다.\n\n비목별 배분:\n- 인건비 (코치 5명 + PM 1명 + 운영 1명): 36,000,000원 (60%)\n- 강사료 (분야 멘토 3명 + 글로벌 멘토 2명): 9,000,000원 (15%)\n- 운영비 (장소·다과·인쇄·교통): 9,000,000원 (15%)\n- 간접비·예비비: 6,000,000원 (10%)\n\n예상 마진율 15% 초과 달성 (총 9,000,000원). 발주처 가이드라인 100% 준수하며 사후 정산 시 영수증 100% 첨부.',
    '6':
      '6주 후 기대 성과는 정량 KPI 5개로 측정합니다.\n- 검증된 MVP 5건 (4/5 팀 = 80% 달성 시 우수)\n- ACTT 변화량 +1.10 이상 (언더독스 평균 변화량 기반)\n- 청년-시니어 자생 매칭 5팀 100% 유지\n- 영문 IR 5건 작성 완료\n- 시드 연계 가능팀 3건+ (발주처 기준 통과)\n\n사후 추적: 6개월 후 사업 영위 팀 3건+ 목표 (사업 영위율 60%).',
    '7':
      `언더독스는 ${UD_TRACK_RECORD.yearsActive}년간 창업가만을 전담해 온 전문 운영사입니다.\n\n주요 실적:\n- 누적 수주 ${UD_TRACK_RECORD.cumulativeRevenueBillions}억원+ · 운영 프로그램 ${UD_TRACK_RECORD.programsConducted}건\n- 청년 창업가 ${UD_TRACK_RECORD.totalGraduates.toLocaleString()}명 양성 · 배출 창업팀 ${UD_TRACK_RECORD.startupTeamsFormed.toLocaleString()}건\n- 전국 ${UD_TRACK_RECORD.regionalHubs}개 거점 · 동시 ${UD_TRACK_RECORD.simultaneousCapacity.toLocaleString()}명 교육 가능\n- 신용등급 ${UD_TRACK_RECORD.creditRating} · 글로벌 파트너 ${UD_TRACK_RECORD.globalPartners}+\n\n유사 수주 사례:\n- 50플러스재단 시니어 인턴십 (2024) — 시니어 30명 매칭 만족도 4.2/5.0\n- 대학 창업 교육 (2023~2025) — 12개 대학 누적 운영`,
  },
  sectionMeta: {
    '1': {
      subtitle: ': 세대융합 창업의 시장 기회',
      headline:
        '예술대 청년 + 시니어 매칭 — 6주 안에 검증된 MVP 5건 산출',
    },
    '2': {
      subtitle: ': 3대 전략 (자원매핑·ACTT 진단·글로벌 인프라)',
      headline:
        '세대 자원 매핑 + ACTT 사전·사후 진단 + 글로벌 거점 활용',
    },
    '3': {
      subtitle: ': 6주 ACTT 5단계 × DOGS 4유형 커리큘럼',
      headline:
        '1주차 매칭부터 6주차 데모데이까지 — 30회 1:1 코칭 + AI 도구 활용',
    },
    '4': {
      subtitle: ': 4중 페이스메이커 운영 체계',
      headline:
        '전담 코치 5명 + 분야 멘토 3명 + 글로벌 파트너 2명 + 동료 네트워크',
    },
    '5': {
      subtitle: ': 60백만원 4비목 집행 계획',
      headline:
        '인건비 60% · 강사료 15% · 운영비 15% · 간접비 10% · 마진율 15%+',
    },
    '6': {
      subtitle: ': 5개 정량 KPI + 6개월 사후 추적',
      headline:
        'MVP 80% · ACTT +1.10 · 매칭 100% · 영문 IR 5건 · 시드 연계 3건+',
    },
    '7': {
      subtitle: ': 10년 800명 코치 운영 역량',
      headline:
        '500억원 누적 · 20,211명 양성 · BB+ 신용등급 · 글로벌 거점 4개국',
    },
  },
  differentiators: [
    {
      assetId: 'actt-pre-post-diagnosis',
      sectionKey: 'curriculum',
      narrativeSnippet:
        'ACTT (Act Test) 사전·사후 페어 진단으로 5대 역량 × 15 지표의 정량 변화량 +1.10 입증. 언더독스 자체 IP 진단 도구로 외부 검증된 도구는 본 사업과 결합 가능.',
      acceptedByPm: true,
    },
    {
      assetId: 'underdogs-coach-pool',
      sectionKey: 'coaches',
      narrativeSnippet:
        '언더독스 전속 코치 풀 800명에서 본 사업 도메인 (세대융합·창업·시니어) 매칭 코치 5명 전담 배정. 평균 경력 8년+ · 코치 1인당 1팀 책임 운영.',
      acceptedByPm: true,
    },
    {
      assetId: 'global-partner-network',
      sectionKey: 'curriculum',
      narrativeSnippet:
        '글로벌 파트너 520+ 풀 활용 — 일본·인도 2025 거점 + 96개 지역 국내외 운영. 본 사업 5팀의 글로벌 진출 디딤돌 연결 가능.',
      acceptedByPm: true,
    },
  ],
  evidenceRefs: [
    {
      topic: '50대 창업 의향 통계',
      source: '통계청 2024 창업 의향 조사',
      summary:
        '50대 창업 의향자 중 65%가 "함께 할 청년 파트너 찾기 어려움" 을 1순위 장애로 답함',
      fetchedVia: 'external-llm',
      capturedAt: now,
    },
  ],
  meta: {
    startedAt: now,
    lastUpdatedAt: now,
    isCompleted: false,
    activeSlots: [],
    skippedSlots: [],
    autoDiagnosis: {
      channel: {
        detected: 'B2G',
        confidence: 0.85,
        reasoning: [
          '계원예술대학교 (대학 발주)',
          '예산 6천만원 단일 사업',
          '국비·교비 혼합 통상적 B2G 패턴',
        ],
        confirmedByPm: true,
      },
    },
  },
}

const md = renderExpressMarkdown({
  project: {
    name: '계원예술대 세대융합창업 6주 프로그램',
    client: '계원예술대학교',
    totalBudgetVat: 60_000_000,
    supplyPrice: null,
    eduStartDate: new Date('2025-11-03'),
    eduEndDate: new Date('2025-12-15'),
  },
  draft,
  impactForecast: {
    totalSocialValue: 320_000_000, // 3.2억원 — 본문 SROI 언급은 없으므로 모순 없음
    beneficiaryCount: 40,
    country: '한국',
    calibration: 'KR-2026',
    calibrationNote: '5팀 × 평균 사회적 가치 6,400만원',
    topBreakdown: [
      { categoryName: '청년 창업가 양성', impactTypeName: '인적 자본', value: 150_000_000 },
      { categoryName: '시니어 활동 확대', impactTypeName: '세대 통합', value: 100_000_000 },
      { categoryName: 'MVP 시장 진출', impactTypeName: '경제 가치', value: 70_000_000 },
    ],
  },
})

const outPath = path.join(process.cwd(), '.tmp-keonwon-full-sim.md')
fs.writeFileSync(outPath, md, 'utf-8')

// ─── 검증 ───
let pp = 0, ff = 0
const ok = (l: string, c: boolean, hint?: string) =>
  c ? (console.log(`  ✓ ${l}`), pp++) : (console.log(`  ✗ ${l}${hint ? ' → ' + hint : ''}`), ff++)

console.log('\n[V5] 풀 시뮬레이션 — 계원예대 세대융합창업')

// 헤더 + 메타
ok('프로젝트명', md.includes('# 계원예술대 세대융합창업 6주 프로그램'))
ok('발주처', md.includes('계원예술대학교'))
ok('예산 (6,000만원)', md.includes('6,000만원'))
ok('교육 기간', md.includes('2025-11-03 ~ 2025-12-15'))
ok('B2G 채널 표시 (PM 컨펌)', md.includes('정부·공공기관 (B2G)'))

// hierarchy 3개
ok('hierarchy 헤딩', md.includes('## 💬 핵심 메시지 hierarchy'))
ok('hierarchy 1번 — 5팀 발굴', md.includes('"세대융합 5팀 발굴'))
ok('hierarchy 2번 — MVP 검증', md.includes('"실전 MVP 검증'))
ok('hierarchy 3번 — AI 리터러시', md.includes('"AI 리터러시 + 글로벌 판매역량 강화"'))
ok('UD_TRACK_RECORD 인용 (800명 코치)', md.includes('800명'))
ok('UD_TRACK_RECORD 인용 (520+ 파트너)', md.includes('520+'))

// 차별화 자산 3건 (모두 acceptedByPm)
ok('차별화 자산 섹션', md.includes('## 🏆 차별화 자산'))
ok('ACTT 진단 자산', md.includes('actt-pre-post-diagnosis'))
ok('Coach Pool 자산', md.includes('underdogs-coach-pool'))
ok('Global Partner 자산', md.includes('global-partner-network'))

// 7 섹션 sectionMeta 모두
for (let i = 1; i <= 7; i++) {
  ok(`section ${i} subtitle (:)`, md.includes(`## ${i}.`) && md.match(new RegExp(`## ${i}\\. [^:\\n]+:`))?.[0] !== undefined)
}

// section 1~7 헤드라인 모두 큰 따옴표
ok('section 1 헤드라인 따옴표', md.includes('"예술대 청년 + 시니어 매칭'))
ok('section 7 헤드라인 따옴표', md.includes('"500억원 누적'))

// 경어체 변환
ok('경어체 — 보유합니다', md.includes('보유합니다'))
ok('경어체 — 추진합니다', md.includes('추진합니다'))
ok('경어체 — 최소화합니다', md.includes('최소화합니다'))

// SROI forecast 출력
ok('SROI forecast 섹션', md.includes('사전 임팩트 리포트 (Forecast)'))
ok('SROI 3.20억원', md.includes('3.20억원'))
ok('수혜자 40명', md.includes('40명'))
ok('forecast 카테고리별', md.includes('청년 창업가 양성'))

// SROI 본문 vs forecast 모순 X (본문에 SROI 숫자 없음)
ok('SROI 모순 워닝 없음', !md.includes('SROI 본문 vs 실제 forecast'))

// 품질 점검 워닝 없음 (정량 충분 + 모호 표현 적음)
const hasQuality = md.includes('자동 품질 점검')
console.log(`  ℹ 자동 품질 점검 섹션: ${hasQuality ? '있음' : '없음'}`)

// 본문 풍성도
console.log(`\n  📊 .md 총 길이: ${md.length.toLocaleString()}자`)
console.log(`  📊 라인 수: ${md.split('\n').length.toLocaleString()}`)
ok('.md 4000자+ 풍성', md.length >= 4000)
ok('.md 100라인+', md.split('\n').length >= 100)

console.log('\n─────────────────────────────')
console.log(`결과: ${pp} 통과 / ${ff} 실패`)
console.log(`📂 출력: ${outPath}`)
if (ff > 0) process.exit(1)
