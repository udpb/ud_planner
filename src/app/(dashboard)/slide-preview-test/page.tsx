/**
 * Slide preview test page — Phase M2 검증용.
 * URL: /slide-preview-test
 * Mock draft 로 PpProposalSlides 가 정상 렌더링 되는지 확인.
 */

import { PpProposalSlides } from '@/components/express/slides/PpProposalSlides'
import type { ExpressDraft } from '@/lib/express/schema'

const mockDraft: ExpressDraft = {
  intent: '딥테크 스타트업의 시장 견인(Market Pull) 역량 강화 — 6개월 GTM 실전 동행으로 BM 검증부터 글로벌 진출까지',
  beforeAfter: {
    before:
      '학내 R&D 성과를 보유하나 시장·고객 검증 부족으로 데스밸리 (3-5년) 진입. 기술 우위 ≠ 시장 우위.',
    after:
      '교육 종료 시 MVP 출시 + 첫 매출 발생 + 글로벌 진출 BM 검증 완료. 시장 견인 가능한 산학협력 스타트업 양성.',
  },
  keyMessages: [
    '딥테크 시장 견인 — 기술 우위에서 시장 우위로',
    '실행 동행 — 강의가 아닌 6개월 페이스 메이커',
    '글로벌 진출 — 첫날부터 글로벌 BM',
  ],
  messageHierarchy: [
    {
      key: '시장 견인(Market Pull) 검증된 액트프러너 양성',
      sub: [
        'IMPACT 6단계 방법론 기반 GTM 전략 수립 — 시장 진입부터 사업화까지 단계별 검증',
        '전담 코치 1:1 멘토링 — 학내 R&D 출신 창업가 261명 풀에서 도메인 최적 매칭',
        'AI Co-founder + 휴먼 코치 하이브리드 — 24/7 의사결정 보조 + 결정적 순간 투입',
      ],
      quantProofs: [
        '20,211명 누적 육성 창업가',
        '11년 운영 · 누적 수주 400억',
        '신용등급 BB+ · ESG 측정 1,800개 기업',
      ],
    },
  ],
  sections: {
    '1': '본 사업은 성균관대학교 산학협력단의 딥테크 스타트업 양성을 위한 6개월 집중 GTM 교육 프로그램입니다.\n\n킹고(KINGO) 정신 — 격물치지(格物致知)와 실용지학(實用之學) — 을 계승한 산학일체 모델로, R&D 결과의 시장 견인 (Market Pull) 을 핵심 목표로 합니다.\n\n언더독스는 11년간 20,211명의 창업가를 양성한 누적 데이터 기반 IMPACT 6단계 방법론을 보유하고 있으며, 본 사업에 최적화된 시장 진입 전략을 제공합니다.',
    '2': '본 사업은 IMPACT 6단계 방법론을 기반으로 합니다 — 「Idea → Market → Product → Action → Commercialize → Triumph」.\n\n각 단계는 1개월 단위로 진행되며, 실행 인증(Action Week) + 1:1 코칭 + AI Co-founder 보조의 3중 안전망을 운영합니다.\n\n특히 시장 견인 단계에서는 글로벌 진출을 첫날부터 설계 — 한국 BM 검증 후 일본·인도네시아·인도 3국 동시 진입 전략을 수립합니다.',
    '3': '6개월 총 24주 커리큘럼 — M1 시장 진단 → M2 BM 정립 → M3 MVP 개발 → M4 시장 검증 → M5 사업화 → M6 글로벌 진출.\n\n주차별 IMPACT 18 모듈 + ACT Canvas 54문항 진단 + 5D 행동 지표 측정을 통해 전 과정 정량 관리.\n\nAction Week 격주 강제 — 이론 3회 연속 시 자동 알람으로 실행 비중 80%+ 유지.',
    '4': '본 사업 전담 코치진은 도메인 (딥테크) + 단계 (Seed→Pre-A) 매칭 기반으로 5명을 선발합니다.\n\n전국 261명 액션코치 풀에서 R&D 출신 + 실제 창업 경험 5년+ + IPO/M&A 경험 우선 매칭.\n\n운영 PM 1명 + Lead 코치 1명 + Main 코치 3명 + Support 코치 1명 체제로 1:2 코칭 비율 보장.',
    '5':
      '본 사업 총 예산은 65,000,000원입니다 (VAT 포함). 유사 16건 사업 평균 비목 비율을 기반으로 다음 4분류로 집행합니다.\n\n**비목별 배분 (자동 산출)**:\n- 인건비: 13,330,000원 (20.5%) — 유사 사업 평균\n- 강사료: 8,730,000원 (13.4%)\n- 운영비: 20,440,000원 (31.4%)\n- 간접비: 22,500,000원 (34.6%)\n\n세부 산정 내역서는 별도 제출. 사후 정산 시 발주처 가이드 100% 준수.',
    '6':
      '6개월 종료 시 정량 성과:\n\n- 참여팀 80% 이상 MVP 출시 (Action Week 인증 기반 검증)\n- 참여팀 50% 이상 첫 매출 발생 (월 100만원+)\n- 참여팀 30% 이상 글로벌 진출 BM 검증 완료\n\n사회적 임팩트 — SROI 1.0+ (참여팀 1억 투자 시 1억+ 사회적 가치 창출).',
    '7':
      '언더독스는 11년간 창업가만을 전담해 온 전문 운영사로 200+ 건의 프로그램을 운영하고 20,211명의 창업가를 양성한 압도적 운영 역량을 보유합니다.\n\n**최근 유사 수주 실적**:\n- 2025 예비창업패키지 글로벌 진출 프로그램 (중기부)\n- 2025년 예비창업패키지 창업씨앗공방 (충북창업진흥원)\n- 대전대학교 AI활용 창업 프로그램 (대전대)\n\n**압도적 실행 인프라**: 코치 261명 · 전국 30개 거점 · 동시 1,500명 교육 가능 규모. 신용등급 BB+.',
  },
  sectionMeta: {
    '1': {
      headline: '왜 지금, 왜 우리가 — 시장 견인 검증된 GTM 동행',
      subtitle: '11년 20,211명 데이터 기반 6개월 페이스 메이커',
    },
  },
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
          <h1 className="text-2xl font-bold">슬라이드 미리보기 테스트</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Mock RFP (성균관대 딥테크 GTM) 으로 자동 생성된 슬라이드 — 디자인 시스템 검증용
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
