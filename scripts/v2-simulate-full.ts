/**
 * v2 Full Simulation
 *
 * 목적: UX v2 가 실제 풀 시나리오에서 quality 있는 제안서 .md 를 뽑는지 검증
 *
 * 단계:
 *   1. 기존 테스트 프로젝트의 expressDraft 상태 확인
 *   2. 12개 슬롯 모두 채움 (의미 있는 한국어 input — 실제 PM 이 작성할 만한 수준)
 *   3. 페이지 reload 후 S2 슬롯 12/12 + S3 draftReady=true 확인
 *   4. Inspector 호출 결과 (lensScores + recommendations)
 *   5. export-markdown endpoint 호출 → .md 내용 확인
 *
 * 실행: npx tsx scripts/v2-simulate-full.ts
 */

import { prisma } from '../src/lib/prisma'
import {
  ExpressDraftSchema,
  emptyDraft,
  listFilledSlots,
  ALL_SLOTS,
  SLOT_LABELS,
} from '../src/lib/express/schema'

const PROJECT_ID = 'cmpcgyyx7000004joclxcdlgh'

async function main() {
  console.log(`\n=== v2 Full Simulation · ${PROJECT_ID} ===\n`)

  const project = await prisma.project.findUnique({
    where: { id: PROJECT_ID },
    select: {
      id: true,
      name: true,
      client: true,
      expressDraft: true,
      rfpParsed: true,
      curriculum: { select: { id: true, title: true, sessionNo: true } },
      coachAssignments: { select: { id: true, totalFee: true } },
      budget: { select: { acTotal: true, marginRate: true } },
      impactForecast: { select: { totalSocialValue: true, beneficiaryCount: true } },
      proposalSections: { select: { sectionNo: true, title: true, content: true } },
    },
  })

  if (!project) {
    console.error('Project not found:', PROJECT_ID)
    process.exit(1)
  }

  console.log(`Project: ${project.name}`)
  console.log(`Client: ${project.client}`)
  console.log(`RFP parsed: ${!!project.rfpParsed}`)

  // 1. 현재 expressDraft 상태
  const parsed = ExpressDraftSchema.safeParse(project.expressDraft)
  const draft = parsed.success ? parsed.data : emptyDraft()
  const filled = listFilledSlots(draft)
  console.log(`\n=== 현재 슬롯 상태: ${filled.length}/${ALL_SLOTS.length} ===`)
  for (const slot of ALL_SLOTS) {
    const isFilled = filled.includes(slot)
    console.log(`  [${isFilled ? '✓' : ' '}] ${slot} — ${SLOT_LABELS[slot]}`)
  }

  // 2. 12개 슬롯 모두 채움 (한국외대 RISE 사업단 · 안산 임팩트 챌린지 컨텍스트)
  const richDraft = {
    ...draft,
    intent:
      '안산 청년 창업가들이 12주 동안 실전 인터뷰·MVP 검증·시드 연결까지 완수하는 IC-PBL 임팩트 챌린지로 지역 청년 인구 유출을 막고 지속가능한 창업 생태계를 구축한다.',
    beforeAfter: {
      ...(draft.beforeAfter ?? {}),
      before:
        '안산 청년은 시장 진입 막막 · 자금 부족 · 사회적 자본 부재 · 인적 네트워크 한정. 창업 의지는 있지만 첫 고객 발굴부터 막혀서 80% 가 6개월 안에 포기.',
      after:
        '12주 후 검증된 MVP 보유 · 실제 첫 고객 5명 이상 확보 · 시드 투자자 3팀 연결 · 지역 멘토 네트워크 8명 확보. 80% 가 12개월 후에도 지속 운영. 30% 가 다음 라운드 투자 유치.',
    },
    keyMessages: [
      '안산 청년 창업가의 진짜 무대를 만든다 — 검증된 MVP + 시드 연결까지 12주',
      'ERICA IC-PBL 방법론으로 학교·시장·코치 3중 지원 체계 가동',
      '누적 800명 코치 풀 + 500억 수주 실적의 언더독스 ACT-PRENEURSHIP 적용',
    ],
    differentiators:
      'ACTT 5단계 실행 루프 (가설→실행→검증→학습→재실행) · DOGS 리더십 4 유형 진단 · 5D AI 시대 창업가 5 역량 진단 · IMPACT 6단계 18모듈 54질문 표준화 · UCA 코치 매칭 시스템',
    sections: {
      ...(draft.sections ?? {}),
      '1': {
        content:
          '안산은 ERICA 등 우수 대학이 있음에도 청년 창업 생태계가 분절되어 있다. 통계청 2025 자료에 따르면 안산 청년 창업 6개월 생존율 22% (전국 평균 38%). 청년 인구 매년 3.2% 유출. 본 사업은 IC-PBL (Industry-Campus Project Based Learning) 방법론으로 학교·시장·코치 3중 지원 체계를 가동, 12주 후 검증된 MVP 보유율 80% 달성을 목표로 한다.',
      },
      '2': {
        content:
          '핵심 전략 3축: (1) ACTT 5단계 실행 루프로 가설→검증 사이클을 12주에 4번 반복 (2) DOGS 4 유형 진단 + 5D AI 역량 진단 사전 적용으로 팀별 맞춤 코칭 (3) Action Week 3주 삽입으로 이론 편향 방지. 평가 지표: 검증된 MVP 보유율 · 시드 연결 팀 수 · 누적 매출 · ROI.',
      },
      '3': {
        content:
          '12주차 커리큘럼 — W1 OT + 5D 진단, W2 Mom Test 인터뷰 설계 (이론), W3 Action Week · 인터뷰 10건 실행, W4 MVP 설계 (이론), W5 글로벌 시장 진입 특강 (강연), W6 Action Week · MVP 제작, W7 중간 점검 발표, W8-11 시드 IR 준비, W12 데모데이 · 시드 IR. 이론 4 · Action 3 · 강연 5 · 발표 1 비율.',
      },
      '4': {
        content:
          '코치진 8명 구성 — 메인 코치 2명 (ACTT 5단계 전담), 보조 코치 4명 (각 팀 1:1 매칭), 특강 연사 2명 (글로벌 시장 진입 + 시드 IR 사례). 총 강사료 3,200만원. ERICA IC + 언더독스 800명 코치 풀에서 매칭. UCA 코치 매칭 시스템으로 팀별 최적화.',
      },
      '6': {
        content:
          '12주 후 정량 성과 — MVP 검증 80% (12팀 중 10팀) · 시드 연결 12팀 · 누적 매출 9.2억원 · 직접 수혜 120명 · 간접 수혜 440명. 사회적 가치 SROI 2.3억원 (impact-measurement DB 16 카테고리 계수). ROI 1,150%. 후속 12개월 생존율 80% 목표 (전국 평균 38% 대비 +42%p).',
      },
    },
    activeSlots: [...ALL_SLOTS],
  }

  const validated = ExpressDraftSchema.safeParse(richDraft)
  if (!validated.success) {
    console.error('\n❌ Draft validation failed:')
    validated.error.issues.slice(0, 10).forEach((iss) => {
      console.error(`  · ${iss.path.join('.')} — ${iss.message}`)
    })
    process.exit(1)
  }

  await prisma.project.update({
    where: { id: PROJECT_ID },
    data: { expressDraft: validated.data as unknown as object },
  })

  const newFilled = listFilledSlots(validated.data)
  console.log(`\n✅ 슬롯 채움 완료 — ${newFilled.length}/${ALL_SLOTS.length}`)

  // 3. 기존 데이터 요약 (S4 검증용)
  console.log(`\n=== S4 데이터 (real) ===`)
  console.log(`  Curriculum: ${project.curriculum.length}건`)
  if (project.curriculum.length > 0) {
    console.log(`    예: W${project.curriculum[0]?.sessionNo} ${project.curriculum[0]?.title}`)
  }
  console.log(`  CoachAssignments: ${project.coachAssignments.length}건`)
  console.log(`  Budget total: ${project.budget?.acTotal ?? 'X'} · marginRate ${project.budget?.marginRate ?? 'X'}`)
  console.log(`  ImpactForecast: ${project.impactForecast?.totalSocialValue ?? 'X'} · 수혜 ${project.impactForecast?.beneficiaryCount ?? 'X'}명`)
  console.log(`  ProposalSections: ${project.proposalSections.length}건`)

  console.log(`\n=== 다음 단계 ===`)
  console.log(`  · 페이지 reload 시 S2 슬롯 12/12 → S3 draftReady=true`)
  console.log(`  · S3 자동 Inspector 호출 → lensScores + recommendations`)
  console.log(`  · S5 .md 다운로드 → 제안서 quality 확인`)
  console.log(``)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
