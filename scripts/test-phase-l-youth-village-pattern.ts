/**
 * V2: 청년마을 PDF 패턴 재현 검증
 *
 * 청년마을 2026 PDF (77p) 의 표준 패턴이 새 render-markdown 출력으로 재현되는지 확인.
 *
 * 검증 대상 패턴 (proposal-patterns/index.ts 인용):
 *   1. One-Page-One-Thesis — 부제 + 큰따옴표 헤드라인 + 본문
 *   2. 5 핵심 메시지 hierarchy — 카테고리 + 메인 + 서브 + 정량
 *   3. MECE 4대 가치 — 연대·협력·참여·혁신
 *   4. 4 유형 분류 — 정주(19.6%)·창업(27.5%)·네트워크(21.6%)·지역거점(31.4%)
 *   5. STAR — 로컬라이즈 군산 사례
 *   6. 정량 포화 — 모든 클레임에 수치+근거
 *
 * 출력: sample-youth-village.md 파일 저장 + 시각 확인 가능.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { renderExpressMarkdown } from '../src/lib/express/render-markdown'
import type { ExpressDraft } from '../src/lib/express/schema'
import {
  getPatternById,
  getPatternsBySection,
} from '../src/lib/proposal-patterns'

const now = new Date().toISOString()

// 청년마을 PDF 패턴 그대로 ExpressDraft 빌드
const draft: ExpressDraft = {
  intent:
    '청년마을 주도 사회연대경제 공동체 구축 — 4대 가치 내재화 + 4중 페이스메이커 + AX 인프라',
  beforeAfter: {
    before:
      '매년 변동되는 단년도 성과 지표 + 분절된 브랜딩 — 8년간 운영했으나 장기 성과 관리 미흡 (한국표준협회 보고서)',
    after:
      '4대 가치 (연대·협력·참여·혁신) 내재화 + 4 유형 × 4중 페이스메이커 시스템으로 정주율 75%, 누적 사업규모 60억원 달성',
  },
  messageHierarchy: [
    {
      key: '청년마을 주도 사회연대경제 공동체 구축',
      sub: [
        '당사자 중심으로 행정부·기업 ESG·전국 300명 멘토가 함께 만드는 공동체',
        '8년 분절된 브랜딩 → 통합 브랜딩 + 장기 성과 관리 체계',
      ],
      quantProofs: [
        '전국 300명 멘토 풀',
        '8년 운영 기반 (`19년 5만명 → `23년 70만명 비수도권 인구 감소)',
        '한국표준협회 2025 평가 결과 인용',
      ],
    },
    {
      key: '4대 가치 (연대·협력·참여·혁신) 내재화',
      sub: [
        '함께 ~하는 가치 4개를 사업 과업으로 매핑 + 각 가치별 KPI 분리',
        '평가위원이 사업 분류 명확히 인식하는 MECE 구조',
      ],
      quantProofs: [
        '연대: 사업비 관리·현장 점검 12회/년',
        '협력: 멘토단 300명 · 컨설팅 200건',
        '참여: 마을 학교 24개 · 협의체 50개',
        '혁신: AX 도입 1차 100개 마을 · 글로벌 교류 5건',
      ],
    },
    {
      key: '4 유형 × 4중 페이스메이커 시스템',
      sub: [
        '정주·창업·네트워크·지역거점 4유형 각각 별도 솔루션 + 별도 KPI',
        '단일 솔루션 → 4중 맞춤 → 평가 차별성',
      ],
      quantProofs: [
        '정주형 19.6% (강릉 강릉살자 정착률 31.1%)',
        '창업형 27.5% (괴산 뭐하농 농촌 로컬콘텐츠)',
        '네트워크형 21.6% (목포 괜찮아마을)',
        '지역거점형 31.4% (태백 광광스토리지)',
      ],
    },
    {
      key: 'AX 전환 + One-Stop 육성 + 데이터 아카이브',
      sub: [
        '청년마을별 운영 데이터 + 외부 통계 + 임팩트 측정을 한 곳에 통합',
        '8년간 분절된 자료 → AX 기반 통합 아카이브',
      ],
      quantProofs: [
        'AX 도입 100개 마을 1차',
        '데이터 아카이브 8년 + 신규 5년 = 13년 시계열',
        'One-Stop 육성 24/7',
      ],
    },
  ],
  sections: {
    '1':
      '청년마을 사업은 2018년부터 8년차 운영 중인 정부 대표 청년 정책입니다. 그러나 \'19년 5만명에서 \'23년 70만명으로 비수도권 청년 인구 감소가 가속화되고 있습니다.\n\n매년 변동되는 단년도 성과 지표 + 분절된 브랜딩으로 인해 장기 성과 관리가 어렵다는 한국표준협회 2025 평가 결과가 있습니다.\n\n그래서 본 사업은 4대 가치 내재화 + 통합 브랜딩으로 장기 성과 관리 체계를 확립합니다.',
    '2':
      '본 사업은 4대 가치 (연대·협력·참여·혁신) 를 청년마을 운영의 기본 원칙으로 내재화합니다.\n- 연대: 함께 사회 책임을 다하는 가치 — 사업비 관리·현장 점검·인증제\n- 협력: 상호 호혜적 관계 — 멘토단·맞춤 컨설팅·대학 연계\n- 참여: 주체적 참여 — 마을 학교·소통 채널·협의체\n- 혁신: 새로운 시도 내재화 — AX 도입·글로벌 교류·임팩트 투자',
    '3':
      '커리큘럼은 청년마을 4 유형별 차별화된 콘텐츠로 구성됩니다.\n- 정주형: 지역 이주·순환적 정주·지역살이 지원 (12주)\n- 창업형: 지역자원 상생 유통·외부자원 연계 (16주)\n- 네트워크형: 지역 관계 안전망·관계인구 형성 (8주)\n- 지역거점형: 복합문화공간·지역맞춤 서비스 (24주)',
    '6':
      '예상 성과는 4 유형별 차등 KPI 로 측정됩니다.\n정주형 정착률 75% 목표 (강릉 강릉살자 31.1% 대비), 창업형 누적 매출 100억원 (로컬라이즈 군산 사례), 네트워크형 협의체 회원 1,000명, 지역거점형 방문자 50만명.',
    '7':
      '언더독스는 10년간 누적 500억원 수주, 창업가 20,211명 양성, 코치 800명, 30개 거점, 1,600개 기업 ESG 측정, 1,500명 동시 운영 가능 규모를 보유합니다. 본 사업과 유사한 로컬라이즈 군산 사업에서 3년간 60억원 규모 · 26개 활동가 · 누적 매출 100억원 달성 실적이 있습니다.',
  },
  sectionMeta: {
    '1': {
      subtitle: ': 청년마을 정책 배경 (8년차 진단)',
      headline:
        '청년마을은 지역 공동체와 지역 창업가의 중간점에 있어 정의하기 어렵습니다',
    },
    '2': {
      subtitle: ': 4대 가치 내재화 전략',
      headline:
        '연대·협력·참여·혁신 4 가치가 내재화된 청년마을 공동체 운영',
    },
    '3': {
      subtitle: ': 4 유형 맞춤 커리큘럼',
      headline:
        '정주·창업·네트워크·지역거점 4 유형 각 별도 솔루션',
    },
    '6': {
      subtitle: ': 4 유형 차등 성과 KPI',
      headline:
        '정주율 75% · 누적 매출 100억원 · 협의체 1,000명 · 방문자 50만명',
    },
    '7': {
      subtitle: ': 10년 800명 코치 운영 역량',
      headline:
        '청년이 주체가 되어 지역에 활력을 넣는 대표 장기 지속 사업 운영 역량',
    },
  },
  differentiators: [],
  evidenceRefs: [],
  meta: {
    startedAt: now,
    lastUpdatedAt: now,
    isCompleted: false,
    activeSlots: [],
    skippedSlots: [],
  },
}

const md = renderExpressMarkdown({
  project: {
    name: '2026 청년마을 만들기 사업 운영 용역',
    client: '행정안전부',
    totalBudgetVat: 2_500_000_000,
    supplyPrice: null,
    eduStartDate: new Date('2026-03-01'),
    eduEndDate: new Date('2026-12-31'),
  },
  draft,
})

// 출력 파일 저장
const outPath = path.join(process.cwd(), '.tmp-youth-village-render.md')
fs.writeFileSync(outPath, md, 'utf-8')

// ─── 검증 ───
let p = 0, f = 0
const ok = (l: string, c: boolean) => { c ? (console.log(`  ✓ ${l}`), p++) : (console.log(`  ✗ ${l}`), f++) }

console.log('\n[청년마을 패턴 재현 검증]')

// One-Page-One-Thesis 패턴
ok('section.1 부제 ": 청년마을 정책 배경" 출력', md.includes(': 청년마을 정책 배경'))
ok('section.1 큰따옴표 헤드라인', md.includes('"청년마을은 지역 공동체와 지역 창업가의 중간점'))
ok('section.2 4대 가치 헤드라인', md.includes('"연대·협력·참여·혁신 4 가치가 내재화'))
ok('section.6 차등 KPI 헤드라인', md.includes('"정주율 75% · 누적 매출 100억원'))

// 5 핵심 메시지 hierarchy
ok('hierarchy 헤딩 출력', md.includes('## 💬 핵심 메시지 hierarchy'))
ok('hierarchy 1번 키 큰따옴표', md.includes('"청년마을 주도 사회연대경제 공동체 구축"'))
ok('hierarchy 2번 4대 가치', md.includes('"4대 가치 (연대·협력·참여·혁신) 내재화"'))
ok('hierarchy 3번 4 유형', md.includes('"4 유형 × 4중 페이스메이커 시스템"'))
ok('hierarchy 4번 AX', md.includes('"AX 전환 + One-Stop 육성 + 데이터 아카이브"'))

// 정량 근거 박스
ok('정량 근거 헤더', md.includes('**정량 근거**'))
ok('300명 멘토 인용', md.includes('전국 300명 멘토 풀'))
ok('정주율 31.1% 인용', md.includes('정착률 31.1%'))

// sub 메시지 bullet
ok('sub 메시지 bullet', md.includes('- 당사자 중심으로 행정부·기업 ESG'))

// 4 유형 segmentation (커리큘럼)
ok('section.3 정주형 12주', md.includes('정주형: 지역 이주·순환적 정주·지역살이 지원 (12주)'))
ok('section.3 창업형 16주', md.includes('창업형: 지역자원 상생 유통·외부자원 연계 (16주)'))

// 자동 품질 점검 — 청년마을 패턴은 풍성하므로 워닝 X 예상
ok('SROI 모순 없음 (forecast 미제공)', !md.includes('SROI 본문 vs 실제 forecast'))

// 경어체 변환 확인
ok('평어체 → 경어체 (section.1)', md.includes('확립합니다'))
ok('경어체 (section.2)', md.includes('내재화합니다'))

// 헤더 메타
ok('프로젝트명', md.includes('# 2026 청년마을 만들기 사업 운영 용역'))
ok('발주처', md.includes('**발주처**: 행정안전부'))
ok('예산 25억', md.includes('25.00억원'))
ok('교육 기간', md.includes('2026-03-01 ~ 2026-12-31'))

// ─── proposal-patterns 함수 확인 ───
console.log('\n[proposal-patterns helper 검증]')
const oneAge = getPatternById('one-page-one-thesis')
ok('getPatternById(one-page-one-thesis) 동작', !!oneAge && oneAge.category === 'visual-hierarchy')

const section1Patterns = getPatternsBySection('1')
ok('section 1 패턴 ≥ 2 건', section1Patterns.length >= 2)
ok('section 1 에 SCQA 포함', section1Patterns.some((p) => p.id === 'scqa-framework'))

console.log('\n─────────────────────────────')
console.log(`결과: ${p} 통과 / ${f} 실패`)
console.log(`\n.md 저장: ${outPath} (${md.length} 자)`)
console.log('  → cat 으로 시각 확인 가능')
if (f > 0) process.exit(1)
