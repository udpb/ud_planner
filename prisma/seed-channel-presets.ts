/**
 * ChannelPreset 시드 — B2G / B2B / renewal 3종
 *
 * 실행: npm run db:seed:channel-presets
 * 원본: 가이드북 Ch.12 (ADR-005 §정보 흐름 규칙 3)
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const presets = [
  {
    code: 'B2G',
    displayName: '정부·공공기관',
    description: '중앙부처·지자체·공공기관 발주. 정부업무평가 대응 필수.',
    keyMessages: [
      '정부업무평가 대응 가능',
      '수료율 95% 이상 보장',
      '정량 KPI 중심 성과 측정',
      '정책 연계·체계적 운영',
    ],
    avoidMessages: [
      '너무 혁신적인 표현 (위험 부담으로 읽힘)',
      '과도한 매출·ROI 용어',
      '민간 비즈니스 중심 언어',
    ],
    tone: '선언형 + 정책 언어 + 정량 포화. 안정감·체계성 강조.',
    evaluatorProfile: '공무원 + 외부 전문가. 안정성·수행 능력·실적 중시. 작성 실수에 엄격.',
    theoryMaxRatio: 0.3,
    actionWeekMinCount: 2,
    budgetTone: '직접비 비율 높게(70%+), 마진 보수적으로(10~15%).',
    directCostMinRatio: 0.7,
    proposalStructure: '정책배경 → 실적증명 → 체계적 계획 → 리스크 관리 → 정량 성과',
    source: 'seed',
  },
  {
    code: 'B2B',
    displayName: '기업·재단',
    description: '대기업·그룹사 CSR/ESG · 민간 재단 발주.',
    keyMessages: [
      '매출·ROI 연계 성과',
      '속도와 실행력',
      '유연한 커스터마이징',
      '비즈니스 임팩트 직접 연결',
    ],
    avoidMessages: [
      '정부업무평가 같은 공공 용어',
      '너무 체계적·관료적 표현',
      '정치적 함의 있는 표현',
    ],
    tone: '결과 지향 + ROI 언어. 빠른 실행·측정 가능한 효과.',
    evaluatorProfile: '실무 담당자 + 경영진. 결과·ROI·속도 중시. 실행력 검증에 엄격.',
    theoryMaxRatio: 0.2,
    actionWeekMinCount: 3,
    budgetTone: 'ROI 대비 효율성 피력. 마진은 유연.',
    directCostMinRatio: 0.6,
    proposalStructure: 'ROI 라이즈 → 차별화 포인트 → 속도감 있는 실행 계획 → 측정 가능한 효과',
    source: 'seed',
  },
  {
    code: 'renewal',
    displayName: '재계약·연속 사업',
    description: '이전 수행 사업의 확장·연속. 신뢰 자산 최대 활용.',
    keyMessages: [
      '작년 대비 성장·개선점',
      '데이터 기반 개선 제안',
      '신뢰 관계 누적',
      '연속성 있는 성과 추적',
    ],
    avoidMessages: [
      '처음 만나는 고객 같은 어조',
      '기본 소개 반복',
      '작년 성과 언급 누락',
    ],
    tone: '신뢰 기반 + 개선 지향. 숫자로 작년 대비 증명.',
    evaluatorProfile: '이전 프로젝트 경험 있는 담당자 포함. 실질 성과·개선 노력 중시.',
    theoryMaxRatio: null,
    actionWeekMinCount: null,
    budgetTone: '작년 대비 합리성. 단가 인상 근거 명시.',
    directCostMinRatio: null,
    proposalStructure: '작년 성과 리뷰 → 개선 포인트 → 이번 시즌 업그레이드 계획 → 신규 KPI',
    source: 'seed',
  },
] as const

async function main() {
  console.log('🌱 ChannelPreset 시드 시작...')

  for (const p of presets) {
    // Prisma upsert 에 전달할 데이터 (code 를 where 로 사용)
    const data = {
      code: p.code,
      displayName: p.displayName,
      description: p.description,
      keyMessages: p.keyMessages as unknown as string[],
      avoidMessages: p.avoidMessages as unknown as string[],
      tone: p.tone,
      evaluatorProfile: p.evaluatorProfile,
      theoryMaxRatio: p.theoryMaxRatio,
      actionWeekMinCount: p.actionWeekMinCount,
      budgetTone: p.budgetTone,
      directCostMinRatio: p.directCostMinRatio,
      proposalStructure: p.proposalStructure,
      source: p.source,
    }

    await prisma.channelPreset.upsert({
      where: { code: p.code },
      update: data,
      create: data,
    })

    console.log(`  ✓ ${p.code} (${p.displayName})`)
  }

  console.log(`\n✅ ChannelPreset ${presets.length}개 upsert 완료`)
}

main()
  .catch((e) => {
    console.error('❌ ChannelPreset 시드 실패:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
