/**
 * Slide preview test — Phase O5 (2026-05-30)
 * URL: /slide-preview-test
 *
 * Mock draft 에 slideSpecs (8 diagram pattern 모두 사용) 포함 → PpProposalSlides 가
 * 실제 도식화된 슬라이드 시퀀스 자동 생성.
 */

import { PpProposalSlides } from '@/components/express/slides/PpProposalSlides'
import type { ExpressDraft } from '@/lib/express/schema'

const mockDraft: ExpressDraft = {
  intent: '딥테크 스타트업의 시장 견인(Market Pull) 역량 강화 — 6개월 GTM 실전 동행으로 BM 검증부터 글로벌 진출까지',
  beforeAfter: {
    before: '학내 R&D 성과를 보유하나 시장·고객 검증 부족으로 데스밸리 (3-5년) 진입.',
    after: '교육 종료 시 MVP 출시 + 첫 매출 발생 + 글로벌 진출 BM 검증 완료.',
  },
  keyMessages: [
    '딥테크 시장 견인 — 기술 우위에서 시장 우위로',
    '실행 동행 — 강의가 아닌 6개월 페이스 메이커',
    '글로벌 진출 — 첫날부터 글로벌 BM',
  ],
  sections: {
    '1': '본 사업은 성균관대학교 산학협력단의 딥테크 스타트업 양성을 위한 6개월 집중 GTM 교육 프로그램입니다.',
    '2': 'IMPACT 6단계 방법론 + Action Week + 글로벌 진출 전략.',
    '3': '6개월 24주 — M1 시장 진단 → M2 BM → M3 MVP → M4 검증 → M5 사업화 → M6 글로벌.',
    '4': '운영 PM 1 + Lead 1 + Main 3 + Support 1 — 도메인 매칭 코치 5명.',
    '5': '총 65,000,000원 — 인건비 20.5% / 강사료 13.4% / 운영비 31.4% / 간접비 34.6%.',
    '6': '6개월 종료 시: MVP 80%+ / 첫 매출 50%+ / 글로벌 BM 30%+.',
    '7': '11년 200+ 프로그램 · 20,211명 양성 · 261명 코치 · 30개 거점 · BB+.',
  },
  slideSpecs: [
    // section 1 — before-after
    {
      kicker: '01 제안 배경 및 목적',
      headline: '학내 R&D 보유 → 시장 견인 검증 액트프러너 — 6개월의 변화',
      caption: '대부분 데스밸리 진입 → 시장 검증 완료',
      diagram: {
        pattern: 'before-after',
        data: {
          before: {
            label: '학내 R&D 보유, 시장 검증 X',
            description: '대부분 데스밸리 진입 (3-5년)',
            metrics: ['기술 우위 ≠ 시장 우위', '첫 매출 발생률 12%', '글로벌 진출 0%'],
          },
          after: {
            label: '시장 견인 검증된 액트프러너',
            description: 'MVP + 첫 매출 + 글로벌 BM 검증 완료',
            metrics: ['MVP 출시율 80%+', '첫 매출 50%+', '글로벌 BM 30%+'],
          },
        },
      },
      evidence: [
        { text: '딥테크 5년 생존율 33.8%', source: '통계청 2023.12' },
      ],
      sectionNum: '1',
      order: 1,
    },
    // section 2 — matrix-2x2
    {
      kicker: '02 추진 전략 및 방법론',
      headline: '딥테크 GTM — 기술 우위 + 시장 견인력 동시 검증',
      diagram: {
        pattern: 'matrix-2x2',
        data: {
          axisX: { label: '시장 견인력', low: '낮음', high: '높음' },
          axisY: { label: '기술 우위', low: '낮음', high: '높음' },
          quadrants: [
            { q: 'TL', label: '기술 강점, 시장 부재', description: '대부분 학내 스타트업 현재 위치' },
            { q: 'TR', label: '시장 견인 검증 (목표)', description: '본 사업 후 도달', highlight: true },
            { q: 'BL', label: '데스밸리', description: '시장도 기술도 약함' },
            { q: 'BR', label: '시장 강점, 기술 부재', description: '진입 장벽 낮음 = 경쟁 심함' },
          ],
        },
      },
      sectionNum: '2',
      order: 1,
    },
    // section 3 — process-flow
    {
      kicker: '03 교육 커리큘럼',
      headline: 'IMPACT 6단계 — 시장 견인까지의 정밀한 6개월 경로',
      diagram: {
        pattern: 'process-flow',
        data: {
          steps: [
            { num: 'M1', label: '시장 진단', description: '딥테크 기술의 시장 적합도' },
            { num: 'M2', label: 'BM 정립', description: '수익 모델 + Pricing' },
            { num: 'M3', label: 'MVP 개발', description: '최소 기능 제품' },
            { num: 'M4', label: '시장 검증', description: '20팀 베타 + 피드백' },
            { num: 'M5', label: '사업화', description: '첫 매출 발생' },
            { num: 'M6', label: '글로벌 진출', description: '일본·인도 진입' },
          ],
        },
      },
      sectionNum: '3',
      order: 1,
    },
    // section 3 - timeline
    {
      kicker: '03 교육 커리큘럼',
      headline: '6개월 24주 — Action Week 격주 + 1:1 코칭 풀카운트',
      diagram: {
        pattern: 'timeline',
        data: {
          units: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'],
          tracks: [
            {
              name: '교육 모듈',
              bars: [
                { startIdx: 0, endIdx: 1, label: 'IMPACT 1-6 모듈' },
                { startIdx: 2, endIdx: 3, label: 'ACT Canvas' },
                { startIdx: 4, endIdx: 5, label: '글로벌 진출 모듈', accent: true },
              ],
            },
            { name: '1:1 코칭', bars: [{ startIdx: 0, endIdx: 5, label: '격주 코칭' }] },
            {
              name: 'Action Week',
              bars: [
                { startIdx: 1, endIdx: 1, label: 'AW#1', accent: true },
                { startIdx: 3, endIdx: 3, label: 'AW#2', accent: true },
                { startIdx: 5, endIdx: 5, label: 'AW#3', accent: true },
              ],
            },
          ],
        },
      },
      sectionNum: '3',
      order: 2,
    },
    // section 4 — hierarchy-tree
    {
      kicker: '04 운영 체계 및 코치진',
      headline: '운영 조직 — PM 1 + Lead 1 + Main 3 + Support 1 (총 6명)',
      diagram: {
        pattern: 'hierarchy-tree',
        data: {
          root: { label: '운영 PM (본 사업 총괄)', sublabel: '주 5일 전담' },
          children: [
            {
              label: 'Lead 코치 1',
              sublabel: '前 카카오 PM · 액트프러너 5년',
              children: [{ label: '주 코칭 + 의사결정' }, { label: 'AI Co-founder 운영' }],
            },
            {
              label: 'Main 코치 3',
              sublabel: '딥테크 도메인 전문',
              children: [{ label: '도메인별 1:1' }, { label: '주차별 멘토링' }],
            },
            { label: 'Support 1', sublabel: '운영 보조', children: [{ label: '행정·데이터' }] },
          ],
        },
      },
      sectionNum: '4',
      order: 1,
    },
    // section 5 — kpi-grid
    {
      kicker: '05 예산 및 경제성',
      headline: '6,500만원 — 유사 16건 사업 평균 비율 기반 4분류',
      caption: '인건비·강사료·운영비·간접비',
      diagram: {
        pattern: 'kpi-grid',
        data: {
          columns: 4,
          kpis: [
            { value: '20.5%', label: '인건비', sublabel: '1,333만원' },
            { value: '13.4%', label: '강사료', sublabel: '873만원' },
            { value: '31.4%', label: '운영비', sublabel: '2,044만원' },
            { value: '34.6%', label: '간접비', sublabel: '2,250만원' },
          ],
        },
      },
      sectionNum: '5',
      order: 1,
    },
    // section 5 — comparison
    {
      kicker: '05 예산 및 경제성',
      headline: '시장 평균 대비 비용 효율성 — 동일 결과물 절반 비용',
      diagram: {
        pattern: 'comparison-table',
        data: {
          leftLabel: '시장 평균',
          rightLabel: '언더독스',
          rows: [
            { dim: '1인 교육비', left: '650만원', right: '320만원', advantageOnRight: true },
            { dim: '1:1 코칭 시간', left: '월 1회', right: '월 2회', advantageOnRight: true },
            { dim: '졸업 후 추적', left: 'X', right: '6개월 사후 추적', advantageOnRight: true },
            { dim: '글로벌 진출 모듈', left: 'X', right: '6개월차 포함', advantageOnRight: true },
          ],
        },
      },
      sectionNum: '5',
      order: 2,
    },
    // section 6 — kpi-grid
    {
      kicker: '06 기대 성과 및 임팩트',
      headline: '6개월 종료 시 — MVP 80% · 첫 매출 50% · 글로벌 30%',
      diagram: {
        pattern: 'kpi-grid',
        data: {
          columns: 3,
          kpis: [
            { value: '80%', label: 'MVP 출시', sublabel: '20팀 중 16팀+' },
            { value: '50%', label: '첫 매출', sublabel: '월 100만원+' },
            { value: '30%', label: '글로벌 BM', sublabel: '검증 완료' },
            { value: '1.0+', label: 'SROI', sublabel: '사회적 가치' },
            { value: '70%+', label: '6개월 후 지속률', sublabel: 'Action Week 효과' },
            { value: '54', label: '진단 지표', sublabel: 'ACT Canvas' },
          ],
        },
      },
      sectionNum: '6',
      order: 1,
    },
    // section 7 — kpi-grid (track record)
    {
      kicker: '07 수행 역량 및 실적',
      headline: '11년 누적 — 20,211명 양성 · 261 코치 · 30 거점 · BB+',
      diagram: {
        pattern: 'kpi-grid',
        data: {
          columns: 4,
          kpis: [
            { value: '20,211', label: '명', sublabel: '누적 육성 창업가' },
            { value: '261', label: '명', sublabel: '전국 액션 코치' },
            { value: '11', label: '년', sublabel: '운영 경력' },
            { value: 'BB+', label: '신용', sublabel: '재무 건전성' },
            { value: '400억', label: '원+', sublabel: '누적 수주' },
            { value: '30', label: '개', sublabel: '국내외 거점' },
            { value: '1,500', label: '명', sublabel: '동시 교육 capacity' },
            { value: '1,800', label: '개', sublabel: 'ESG 측정 기업' },
          ],
        },
      },
      sectionNum: '7',
      order: 1,
    },
  ],
  meta: {
    startedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    isCompleted: false,
    activeSlots: [],
    skippedSlots: [],
  },
}

export default function SlidePreviewTestPage() {
  return (
    <div className="min-h-screen bg-muted/30 py-8">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">슬라이드 미리보기 — O5 (slideSpecs 사용)</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            8 도식화 패턴 포함된 풀 1차본 시각 검증. PM 이 받는 결과물 그대로.
          </p>
        </div>
        <PpProposalSlides
          draft={mockDraft}
          clientName="성균관대학교 산학협력단"
          projectName="성균관대 딥테크 GTM 창업 교육"
        />
      </div>
    </div>
  )
}
