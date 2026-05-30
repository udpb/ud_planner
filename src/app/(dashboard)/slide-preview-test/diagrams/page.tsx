/**
 * Diagram preview test page — N3 검증.
 * URL: /slide-preview-test/diagrams
 * 8 diagram pattern 시각 확인용.
 */

import { SlideShell } from '@/components/express/slides/SlideShell'
import {
  ProcessFlow,
  Matrix2x2,
  KpiGrid,
  HierarchyTree,
  Timeline,
  ComparisonTable,
  ArchitectureStack,
  BeforeAfter,
} from '@/components/express/slides/diagrams'

export default function DiagramPreviewPage() {
  return (
    <div className="min-h-screen bg-muted/30 py-8">
      <div className="mx-auto max-w-7xl px-4 space-y-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">N3 — 8 도식화 패턴 미리보기</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            디자인 시스템 (Action Orange · NanumHuman · 8pt grid) 준수
          </p>
        </div>

        {/* 1. ProcessFlow */}
        <div className="rounded border border-border bg-muted/10 overflow-hidden">
          <SlideShell kicker="03 교육 커리큘럼" pageNumber={5} totalPages={17}>
            <ProcessFlow
              headline="IMPACT 6단계 — 시장 견인까지의 정밀한 경로"
              steps={[
                { num: 'M1', label: '시장 진단', description: '딥테크 기술의 시장 적합도 검증' },
                { num: 'M2', label: 'BM 정립', description: '수익 모델 설계 + Pricing' },
                { num: 'M3', label: 'MVP 개발', description: '최소 기능 제품 제작' },
                { num: 'M4', label: '시장 검증', description: '20팀 베타 + 피드백' },
                { num: 'M5', label: '사업화', description: '첫 매출 발생' },
                { num: 'M6', label: '글로벌 진출', description: '일본·인도 진입' },
              ]}
            />
          </SlideShell>
        </div>

        {/* 2. Matrix2x2 */}
        <div className="rounded border border-border bg-muted/10 overflow-hidden">
          <SlideShell kicker="02 추진 전략" pageNumber={3} totalPages={17}>
            <Matrix2x2
              headline="딥테크 GTM 전략 — 우리는 어디에 있는가"
              axisX={{ label: '시장 견인력', low: '낮음', high: '높음' }}
              axisY={{ label: '기술 우위', low: '낮음', high: '높음' }}
              quadrants={[
                { q: 'TL', label: '기술 강점, 시장 부재', description: '대부분 학내 스타트업의 현재 위치' },
                { q: 'TR', label: '시장 견인 검증', description: '본 사업 후 도달 위치', highlight: true },
                { q: 'BL', label: '데스밸리', description: '시장도 기술도 약함' },
                { q: 'BR', label: '시장 강점, 기술 부재', description: '낮은 진입 장벽 = 경쟁 심함' },
              ]}
            />
          </SlideShell>
        </div>

        {/* 3. KpiGrid */}
        <div className="rounded border border-border bg-muted/10 overflow-hidden">
          <SlideShell kicker="07 수행 역량 및 실적" pageNumber={16} totalPages={17}>
            <KpiGrid
              headline="언더독스 누적 실적 — 11년 데이터로 보장하는 운영 역량"
              columns={4}
              kpis={[
                { value: '20,211', label: '명', sublabel: '누적 육성 창업가' },
                { value: '261', label: '명', sublabel: '전국 액션 코치' },
                { value: '11', label: '년', sublabel: '운영 경력' },
                { value: 'BB+', label: '신용', sublabel: '재무 건전성' },
                { value: '400억', label: '원+', sublabel: '누적 수주 규모' },
                { value: '30', label: '개', sublabel: '국내외 지역' },
                { value: '1,500', label: '명', sublabel: '동시 교육 capacity' },
                { value: '1,800', label: '개', sublabel: 'ESG 측정 기업' },
              ]}
            />
          </SlideShell>
        </div>

        {/* 4. HierarchyTree */}
        <div className="rounded border border-border bg-muted/10 overflow-hidden">
          <SlideShell kicker="04 운영 체계 및 코치진" pageNumber={9} totalPages={17}>
            <HierarchyTree
              headline="운영 조직 — PM 1 + Lead 1 + Main 3 + Support 1"
              root={{ label: '운영 PM (본 사업 총괄)', sublabel: '주 5일 전담' }}
              children={[
                {
                  label: 'Lead 코치 1',
                  sublabel: '前 카카오 PM · 액트프러너 5년',
                  children: [{ label: '주 코칭 + 의사결정 보조' }, { label: 'AI Co-founder 운영' }],
                },
                {
                  label: 'Main 코치 3',
                  sublabel: '딥테크 도메인 전문',
                  children: [{ label: '도메인별 1:1 매칭' }, { label: '주차별 멘토링' }],
                },
                {
                  label: 'Support 1',
                  sublabel: '운영 보조',
                  children: [{ label: '행정 + 데이터 관리' }, { label: 'AI 평가 운영' }],
                },
              ]}
            />
          </SlideShell>
        </div>

        {/* 5. Timeline */}
        <div className="rounded border border-border bg-muted/10 overflow-hidden">
          <SlideShell kicker="03 교육 커리큘럼" pageNumber={7} totalPages={17}>
            <Timeline
              headline="6개월 24주 — 단계별 정밀 일정"
              units={['M1', 'M2', 'M3', 'M4', 'M5', 'M6']}
              tracks={[
                {
                  name: '교육 모듈',
                  bars: [
                    { startIdx: 0, endIdx: 1, label: 'IMPACT 1-6 모듈' },
                    { startIdx: 2, endIdx: 3, label: 'ACT Canvas 작성' },
                    { startIdx: 4, endIdx: 5, label: '글로벌 진출 모듈', accent: true },
                  ],
                },
                {
                  name: '코칭',
                  bars: [{ startIdx: 0, endIdx: 5, label: '1:1 코칭 (격주)' }],
                },
                {
                  name: 'Action Week',
                  bars: [
                    { startIdx: 1, endIdx: 1, label: 'AW#1', accent: true },
                    { startIdx: 3, endIdx: 3, label: 'AW#2', accent: true },
                    { startIdx: 5, endIdx: 5, label: 'AW#3', accent: true },
                  ],
                },
                {
                  name: '평가',
                  bars: [
                    { startIdx: 1, endIdx: 1, label: '중간평가' },
                    { startIdx: 5, endIdx: 5, label: '최종 PT' },
                  ],
                },
              ]}
            />
          </SlideShell>
        </div>

        {/* 6. ComparisonTable */}
        <div className="rounded border border-border bg-muted/10 overflow-hidden">
          <SlideShell kicker="02 추진 전략" pageNumber={4} totalPages={17}>
            <ComparisonTable
              headline="시장 평균 vs 언더독스 — 정량 검증"
              leftLabel="시장 평균"
              rightLabel="언더독스"
              rows={[
                { dim: '강의:실습 비중', left: '70:30', right: '20:80', advantageOnRight: true },
                { dim: '1:1 코칭 시간', left: '월 1회', right: '격주 1회 (월 2회)', advantageOnRight: true },
                { dim: '졸업 후 검증', left: '없음', right: '6개월 후 사후 추적', advantageOnRight: true },
                { dim: '비용 (1인)', left: '650만원', right: '320만원', advantageOnRight: true },
                { dim: '글로벌 진출 모듈', left: 'X', right: '6개월차 포함', advantageOnRight: true },
              ]}
            />
          </SlideShell>
        </div>

        {/* 7. ArchitectureStack */}
        <div className="rounded border border-border bg-muted/10 overflow-hidden">
          <SlideShell kicker="02 추진 전략 및 방법론" pageNumber={4} totalPages={17}>
            <ArchitectureStack
              headline="언더독스 5계층 데이터 허브 아키텍처"
              layers={[
                { name: '사용자', items: ['창업가', 'PM', '코치', '발주처'] },
                { name: '프론트엔드', items: ['Web', 'LMS', '모바일'] },
                { name: 'AI · 로직', items: ['EDU 봇', 'ACT 봇', 'AI Co-founder', '진단 모델'], accent: true },
                { name: '데이터 허브 (LRS)', items: ['xAPI 표준', '학습 이력', '진단 결과'] },
                { name: '백엔드', items: ['DB', '인증', 'API', '관리자'] },
              ]}
            />
          </SlideShell>
        </div>

        {/* 8. BeforeAfter */}
        <div className="rounded border border-border bg-muted/10 overflow-hidden">
          <SlideShell kicker="01 제안 배경 및 목적" pageNumber={3} totalPages={17}>
            <BeforeAfter
              headline="시장 견인 검증된 액트프러너 양성 — 6개월의 변화"
              before={{
                label: '학내 R&D 보유, 시장 검증 X',
                description: '대부분 데스밸리 진입 (3-5년)',
                metrics: ['기술 우위 ≠ 시장 우위', '첫 매출 발생률 12%', '글로벌 진출 0%'],
              }}
              after={{
                label: '시장 견인 검증된 액트프러너',
                description: 'MVP + 첫 매출 + 글로벌 BM 검증 완료',
                metrics: ['MVP 출시율 80%+', '첫 매출 50%+', '글로벌 진출 BM 30%+'],
              }}
            />
          </SlideShell>
        </div>
      </div>
    </div>
  )
}
