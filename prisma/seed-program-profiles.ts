/**
 * ProgramProfile-tagged WinningPattern 시드 — 10건 (Phase E Step 7)
 *
 * 목적:
 *   pm-guide Step 3 의 "프로파일 유사도 매칭" 이 동작하도록 실제 수주/운영
 *   레퍼런스 10건을 11축 ProgramProfile 과 함께 DB 에 심는다.
 *
 * 수록 케이스 (10건):
 *   1) NH 애그테크 창업 육성
 *   2) GS리테일 에코 소셜임팩트 (8기 연속, isRenewal=true)
 *   3) 코오롱 프로보노 매칭
 *   4) 2025 종로구 서촌 로컬브랜드
 *   5) 2025 관광공모전 + 관광기념품 박람회
 *   6) 2025 한지문화상품 디자인 공모전
 *   7) 2025 안성문화장 글로컬 특화사업
 *   8) 2025 예비창업패키지 글로벌 진출 (약식, 원본 OCR 미확보)
 *   9) 2026 청년마을 만들기 (추정 — 원문 확보 시 교정 필요)
 *   10) 재창업 특화 교육 (추정 — 원문 확보 시 교정 필요)
 *
 * 실행:
 *   npx tsx prisma/seed-program-profiles.ts
 *
 * 선행 조건:
 *   - DB 마이그레이션이 적용되어 있어야 함
 *       npx prisma migrate deploy
 *     (WinningPattern.sourceProfile / profileVector 컬럼이 있는 마이그레이션)
 *   - .env 의 DATABASE_URL 이 설정되어 있어야 함
 *
 * 특징:
 *   - WinningPattern 에는 (sourceProject, sectionKey) 복합 unique 가 없음.
 *     따라서 upsert 불가 → findFirst + create/update 패턴으로 idempotent 구현.
 *   - 각 프로파일은 src/lib/program-profile.ts 의 normalizeProfile() 을 거쳐
 *     자동 연동 규칙(budgetTier 재계산·공모전↔심사·primaryImpact 길이 등)을
 *     통과시킨 뒤 DB 에 저장한다.
 *
 * 원본 출처:
 *   - docs/guidebook/03-casebook/**: 8건 가이드북 케이스
 *   - memory: ud_proposal_patterns.md (청년마을 / 재창업 — 추정)
 *
 * 관련 설계:
 *   - docs/architecture/program-profile.md v1.0 (11축 스펙)
 *   - docs/decisions/006-program-profile.md (ADR)
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import type { Prisma } from '@prisma/client'
import {
  normalizeProfile,
  type ProgramProfile,
  type ChannelType,
} from '../src/lib/program-profile'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

// ─────────────────────────────────────────────────────────────────
// 입력 타입 — CaseSeedInput
// ─────────────────────────────────────────────────────────────────

export interface CaseSeedInput {
  sourceProject: string
  sourceClient: string
  channelType: ChannelType
  outcome: 'won' | 'lost' | 'pending'
  techEvalScore?: number
  /** proposal-background 섹션 스니펫 (시장맥락 → 정량 포화 → before/after) */
  snippet: string
  /** 왜 먹혔는가 — 배점 항목 + 차별화 자산 */
  whyItWorks: string
  /** 4~8개 키워드 */
  tags: string[]
  /** 정규화 전 프로파일 (normalizeProfile 을 통과시킨 뒤 저장) */
  profile: ProgramProfile
}

// ─────────────────────────────────────────────────────────────────
// 10 케이스 정의
// ─────────────────────────────────────────────────────────────────

const UPDATED_AT = new Date().toISOString()

export const CASE_SEEDS: Array<{ case: CaseSeedInput }> = [
  // ──────────────────────────────────────────────────────────────
  // 1) NH 애그테크
  // ──────────────────────────────────────────────────────────────
  {
    case: {
      sourceProject: '2025 NH 애그테크 창업 육성 사업',
      sourceClient: '농업·농촌 분야 공공기관(NH)',
      channelType: 'B2G',
      outcome: 'won',
      snippet:
        '2020년대 후반 농식품 분야 예비창업가 발굴 경쟁이 격화되는 가운데, 본 사업은 연 20~30팀 애그테크 팀의 실행력을 수료 시점까지 책임지는 "실행 보장형 창업 플랫폼" 으로 재설계한다. ACT-PRENEURSHIP 5역량(G·E·P·X·R) 사전·사후 진단과 IMPACT 6단계(I→M→P→A→C→T) 커리큘럼을 골격으로, 800명 코치 풀·520+ 글로벌 파트너·농식품부·농진청 멘토 네트워크를 4중 지원 체계로 결합. "수료는 많은데 창업은 적다" 는 기존 관성을 창업 전환율·Action Week·Demo Day 투자자 초청으로 전환한다.',
      whyItWorks:
        '"과업 이해도" 배점에서 농식품 도메인 전문성을 외부 멘토로 공급하고 제안사는 창업 방법론 전문가 포지션을 명확히 분리한 것이 결정적. ACT-PRENEURSHIP 사전·사후 진단으로 "정량 성과 측정" 배점을 정면 대응하고, 4중 지원 체계가 "수행 능력" 의 근거가 된다. 정책 언어("실행 보장·체계적 운영") 로 톤을 감싸 B2G 평가위원의 안정감 배점을 흡수.',
      tags: [
        '애그테크',
        'IMPACT방법론',
        'ACT-PRENEURSHIP',
        '4중지원체계',
        '정량포화',
        'Action Week',
        '창업전환율',
      ],
      profile: {
        targetStage: '예비창업_아이디어유',
        targetSegment: {
          demographic: ['무관'],
          businessDomain: ['식품/농업', 'IT/TECH'],
          geography: '일반',
        },
        scale: {
          budgetKrw: 500_000_000,
          budgetTier: '5억_이상', // normalizeProfile 재계산
          participants: '20-50',
          durationMonths: 8,
        },
        formats: ['데모데이', '네트워킹'],
        delivery: {
          mode: '하이브리드',
          usesLMS: true,
          onlineRatio: 40,
          usesAICoach: true,
        },
        supportStructure: {
          tasks: ['모객', '심사_선발', '멘토링_코칭', '행사_운영'],
          fourLayerSupport: true,
          coachingStyle: '1:1',
          externalSpeakers: true,
          externalSpeakerCount: 12,
        },
        methodology: {
          primary: 'IMPACT',
          impactModulesUsed: ['I-1', 'I-2', 'M-1', 'M-2', 'P-1', 'A-1', 'C-1', 'T-1'],
        },
        selection: {
          style: '서류+PT',
          stages: 2,
          competitionRatio: '중간_1:3-5',
          publicVoting: false,
          evaluatorCount: 5,
        },
        channel: {
          type: 'B2G',
          clientTier: '공공기관',
          isRenewal: false,
        },
        primaryImpact: ['역량개발', '매출/판로'],
        aftercare: {
          hasAftercare: true,
          scope: ['투자연계', 'alumni네트워크', '진단지속'],
          tierCount: 2,
        },
        version: '1.0',
        updatedAt: UPDATED_AT,
      },
    },
  },

  // ──────────────────────────────────────────────────────────────
  // 2) GS리테일 (8기 연속 — isRenewal=true)
  // ──────────────────────────────────────────────────────────────
  {
    case: {
      sourceProject: 'GS리테일 에코 소셜임팩트 프로젝트 8기',
      sourceClient: 'GS리테일',
      channelType: 'B2B',
      outcome: 'won',
      snippet:
        '2019년부터 누적 7기·7년간 ESG 유통 접점의 실질 매출을 만들어 온 본 프로그램은, 2026년 8기에서 "7년 누적 데이터로 더 빠르고 더 정확하게" 를 새 무게중심으로 잡는다. 1~7기 참여 10~15팀/기수·GS25 2,000개 점포 파일럿·정식 입점 전환률·재입점률 데이터가 축적돼, 어느 성장 단계의 팀이 유통 입점까지 가는지 **데이터로 세분화** 가 가능. 6 Dimension Startup Growth Model 로 기수별 팀 단계를 측정해 코칭 밀도를 차등화하고, EduBot·언더베이스 LMS 로 기수 간 비교 데이터를 누적한다. 6기 "월 매출 200만원" KPI 에서 8기 "월 매출 300만원 + 재입점률 70%" 로 한 단계 올린다.',
      whyItWorks:
        '재계약의 핵심 배점 "제안사 이해도·개선 지향·성장 의지"(통상 20~30%) 를 7년 누적 데이터 + 개선 KPI 업그레이드로 정면 증명. "처음 뵙는" 어조 대신 "작년 대비 업그레이드" 톤으로 신규 경쟁사 대비 독보적 포지션. 6 Dimension · ACT-PRENEURSHIP · EduBot 3종 도구가 반복 등장해 "체계적 운영" 이미지를 강화.',
      techEvalScore: undefined,
      tags: [
        '재계약',
        '8기연속',
        '6Dimension',
        '유통MD네트워크',
        'ESG',
        '누적데이터',
        'B2B대기업',
      ],
      profile: {
        targetStage: 'seed',
        targetSegment: {
          demographic: ['무관'],
          businessDomain: ['유통/커머스', '환경/에너지', '사회/복지'],
          geography: '일반',
        },
        scale: {
          budgetKrw: 400_000_000,
          budgetTier: '3-5억',
          participants: '20명_이하',
          durationMonths: 9,
        },
        formats: ['네트워킹', 'IR'],
        delivery: {
          mode: '하이브리드',
          usesLMS: true,
          onlineRatio: 40,
          usesAICoach: true,
        },
        supportStructure: {
          tasks: ['모객', '심사_선발', '멘토링_코칭', '교류_네트워킹', '컨설팅_산출물'],
          fourLayerSupport: true,
          coachingStyle: '혼합',
          externalSpeakers: true,
          externalSpeakerCount: 10,
        },
        methodology: {
          primary: 'IMPACT',
          impactModulesUsed: ['P-1', 'P-2', 'C-1', 'C-2', 'T-1'],
        },
        selection: {
          style: '서류+PT',
          stages: 2,
          competitionRatio: '중간_1:3-5',
          publicVoting: false,
          evaluatorCount: 5,
        },
        channel: {
          type: 'B2B',
          clientTier: '대기업',
          // 핵심: 연속사업. renewalContext 는 Project.renewalContext 에 저장되므로
          // 본 WinningPattern 시드에서는 sourceProfile.channel.isRenewal=true 만 노출.
          isRenewal: true,
        },
        primaryImpact: ['매출/판로', '사회적가치'],
        aftercare: {
          hasAftercare: true,
          scope: ['유통입점', 'alumni네트워크', '투자연계'],
          tierCount: 3,
        },
        version: '1.0',
        updatedAt: UPDATED_AT,
      },
    },
  },

  // ──────────────────────────────────────────────────────────────
  // 3) 코오롱 프로보노
  // ──────────────────────────────────────────────────────────────
  {
    case: {
      sourceProject: '코오롱 프로보노 프로그램',
      sourceClient: '코오롱',
      channelType: 'B2B',
      outcome: 'won',
      snippet:
        '기업 CSR 이 "사진 찍는 이벤트" 로 소모되는 흐름을 거슬러, 본 사업은 코오롱 그룹 임직원 멘토와 소셜 섹터 창업가·단체를 ACT-PRENEURSHIP 5역량 매트릭스 기반 1:1 페어링으로 매칭한다. 주간 멘토링 + Action Week + 결과 발표 3단 구조로 "이론 3연속" 을 차단하고, 임직원 참여 시간 대비 창업가 KPI 변화·정성 인터뷰를 묶어 **코오롱 지속가능경영보고서에 바로 쓸 수 있는 포맷** 으로 리포트한다. 이전 기수의 "2주 무한 수정 → Value Chain 반나절 + 작성 1.5일" 리셋 경험을 작성 프로세스에 체화해 초안→확정 사이클을 단축.',
      whyItWorks:
        '"참여 경험(임직원 만족)" 배점과 "사회적 임팩트(창업가 성장)" 배점 양쪽을 매칭 품질·Action Week·진단 리포트로 동시에 잡는 구조가 결정적. 코오롱 지속가능경영보고서와 **포맷 단위로 호환** 되는 산출물을 약속해 B2B 평가의 "재활용 가치" 배점을 확보. 4중 지원(임직원 멘토 + 외부 컨설턴트 + 전담 코치 + 동료 페어) 으로 단일 멘토 리스크 제거.',
      tags: ['프로보노', '매칭방법론', 'CSR', 'ESG리포팅', 'Action Week', '임직원몰입도'],
      profile: {
        targetStage: '비창업자',
        targetSegment: {
          demographic: ['임직원'],
          businessDomain: ['ALL', '사회/복지'],
          geography: '일반',
        },
        scale: {
          budgetKrw: 200_000_000,
          budgetTier: '1-3억',
          participants: '20-50',
          durationMonths: 6,
        },
        formats: ['네트워킹'],
        delivery: {
          mode: '하이브리드',
          usesLMS: true,
          onlineRatio: 40,
          usesAICoach: false,
        },
        supportStructure: {
          tasks: ['모객', '멘토링_코칭', '교류_네트워킹', '컨설팅_산출물'],
          fourLayerSupport: true,
          coachingStyle: '1:1',
          externalSpeakers: true,
          externalSpeakerCount: 6,
          nonStartupSupport: {
            matchingOperator: true,
            domainPartners: ['코오롱 임직원 멘토 풀', '소셜 섹터 단체'],
          },
        },
        methodology: {
          primary: '매칭',
          impactModulesUsed: [],
        },
        selection: {
          style: '서류',
          stages: 1,
          competitionRatio: '낮음_1:2이하',
          publicVoting: false,
          evaluatorCount: 3,
        },
        channel: {
          type: 'B2B',
          clientTier: '대기업',
          isRenewal: false,
        },
        primaryImpact: ['역량개발', '사회적가치'],
        aftercare: {
          hasAftercare: true,
          scope: ['alumni네트워크'],
          tierCount: 1,
        },
        version: '1.0',
        updatedAt: UPDATED_AT,
      },
    },
  },

  // ──────────────────────────────────────────────────────────────
  // 4) 서촌 로컬브랜드
  // ──────────────────────────────────────────────────────────────
  {
    case: {
      sourceProject: '2025 종로구 서촌 로컬브랜드 상권강화 사업',
      sourceClient: '종로구청',
      channelType: 'B2G',
      outcome: 'won',
      snippet:
        '2023년 비전 수립 → 2024년 역량 강화 → 2025년 자생력 강화의 3단계 로드맵 마무리 기수로, 본 사업은 5.39억 예산·9명 전담 인력으로 "머무는 온기, 서촌" 메시지를 상권강화기구 + 3종 커뮤니티 + 릴레이 집들이 + 자립 로드맵 시스템으로 뒷받침한다. 93개 시·군·구 로컬 운영 데이터와 액션코치 261명·파트너 175개를 근거로 서촌 집주인(2주 1회)·서촌 수다방(월 1회)·지역경험단 4유형의 3종 커뮤니티를 동시 가동. 2025년 운영사 주도 → 2026년 이후 상인회 자율 운영 **이관 로드맵** 으로 "운영사 철수 후에도 지속" 을 선언한다.',
      whyItWorks:
        '지자체가 은연중 배점하는 "운영사 철수 후 지속 가능성" 에 정면으로 이관 로드맵을 제시한 것, 그리고 정서 메시지("머무는 온기") 를 상권강화기구 3원 체계·릴레이 집들이·로컬 패스 50개 상점 같은 구체 시스템으로 받친 것이 동시에 평가에서 차별화를 만듦. 93개 시·군·구 누적 운영 데이터가 "수행 능력" 배점을 독점한다.',
      tags: [
        '로컬상권',
        '상권강화기구',
        '릴레이집들이',
        '지역경험단',
        '정서메시지',
        '자립로드맵',
        'B2G기초지자체',
      ],
      profile: {
        targetStage: '비창업자',
        targetSegment: {
          demographic: ['상인', '일반소상공인'],
          businessDomain: ['유통/커머스', '식품/농업'],
          geography: '로컬',
        },
        scale: {
          budgetKrw: 539_000_000,
          budgetTier: '5억_이상',
          participants: '50-100',
          durationMonths: 9,
        },
        formats: ['네트워킹', '페스티벌/축제'],
        delivery: {
          mode: '오프라인',
          usesLMS: true,
          onlineRatio: 10,
          usesAICoach: false,
        },
        supportStructure: {
          tasks: ['모객', '교류_네트워킹', '컨설팅_산출물', '행사_운영'],
          fourLayerSupport: false,
          coachingStyle: '1:1',
          externalSpeakers: true,
          externalSpeakerCount: 8,
          nonStartupSupport: {
            coordinationBody: '상권강화기구',
            domainPartners: ['서촌 집주인 협의체', '주민 협의체', '운영사무국'],
            matchingOperator: false,
          },
        },
        methodology: {
          primary: '로컬브랜드',
          impactModulesUsed: [],
        },
        selection: {
          style: '선정형_비경쟁',
          stages: 1,
          competitionRatio: '낮음_1:2이하',
          publicVoting: false,
          evaluatorCount: 4,
        },
        channel: {
          type: 'B2G',
          clientTier: '기초지자체',
          isRenewal: true, // 3단계 마무리 기수 (2023~2025)
        },
        primaryImpact: ['지역활성화'],
        aftercare: {
          hasAftercare: true,
          scope: ['alumni네트워크', '진단지속'],
          tierCount: 3,
        },
        version: '1.0',
        updatedAt: UPDATED_AT,
      },
    },
  },

  // ──────────────────────────────────────────────────────────────
  // 5) 관광기념품 박람회 + 공모전
  // ──────────────────────────────────────────────────────────────
  {
    case: {
      sourceProject: '2025 관광공모전(기념품 부문) 및 관광기념품 박람회 운영 대행',
      sourceClient: '한국관광공사 계열',
      channelType: 'B2G',
      outcome: 'won',
      snippet:
        '1998년부터 전국 관광기념품 발굴이 "축제 열리는 기념품 마을" 톤으로 운영되던 흐름을, 2025년 13.2억 예산에서 "Streaming K-Souvenir — 세계인의 관광 플레이리스트에" 메시지로 국내 매출 → 국외 수출 축으로 재설계. 공모 참가작 600점 이상(2024년 580점 대비 20% 증가 목표)·박람회 참가 기업 130개·바이어 상담 200건·참가 기업 매출 6억·글로벌 수출 계약 1억 KPI 를 박고, 이 숫자들을 2024 메종&오브제 바이어 상담 100건·수출 1억 실적 2회 연속·DDP 유료 관람객 1만 명·일 매출 3억 같은 **과거 실적으로 정당화**. 일본 지사(2025) + 메종&오브제 추계 참가 확정 + 100개사 메가 히트 브랜드 풀 3중 인프라로 "Beyond K" 를 실행 단계까지 내린다.',
      whyItWorks:
        '"기대 효과" 배점의 모든 KPI 가 과거 실적 × 개선률로 뒷받침되어 공허함이 없고, "실적·수행 능력" 배점에서 일본 지사·메종&오브제·DDP·포켓몬스터 팝업 등 구체 레퍼런스가 압도. 공모 + 컨설팅 + 박람회 + 유통 + 글로벌 5개 복합 과업을 "Streaming K-Souvenir" 한 우산 아래 배치한 구성력이 "과업 이해도" 배점을 독점.',
      tags: [
        '관광기념품',
        '공모전설계',
        '박람회운영',
        '메종&오브제',
        '일본지사',
        'Beyond K',
        '글로벌수출',
      ],
      profile: {
        targetStage: 'seed',
        targetSegment: {
          demographic: ['무관', '일반소상공인'],
          businessDomain: ['제조/하드웨어', '여행/레저', '문화/예술'],
          geography: '글로벌_공통',
        },
        scale: {
          budgetKrw: 1_320_000_000,
          budgetTier: '5억_이상',
          participants: '100+',
          durationMonths: 9,
        },
        formats: ['공모전', '박람회/전시', '해외연수'],
        delivery: {
          mode: '하이브리드',
          usesLMS: true,
          onlineRatio: 30,
          usesAICoach: true,
        },
        supportStructure: {
          tasks: ['모객', '심사_선발', '컨설팅_산출물', '행사_운영'],
          fourLayerSupport: false,
          coachingStyle: '1:1',
          externalSpeakers: true,
          externalSpeakerCount: 15,
          nonStartupSupport: {
            coordinationBody: '관광기념품 육성 협의체',
            domainPartners: [
              '일본 지사',
              '메종&오브제',
              '네이버·무신사·11번가·G마켓',
              '아마존·야후재팬',
              '100개사 메가 히트 브랜드 풀',
            ],
          },
        },
        methodology: {
          primary: '공모전설계',
          impactModulesUsed: [],
        },
        selection: {
          style: '공모전형',
          stages: 3,
          competitionRatio: '높음_1:6+',
          publicVoting: false,
          evaluatorCount: 7,
        },
        channel: {
          type: 'B2G',
          clientTier: '공공기관',
          isRenewal: false,
        },
        primaryImpact: ['매출/판로', '글로벌확장'],
        aftercare: {
          hasAftercare: true,
          scope: ['유통입점', '해외진출', '투자연계'],
          tierCount: 3,
        },
        version: '1.0',
        updatedAt: UPDATED_AT,
      },
    },
  },

  // ──────────────────────────────────────────────────────────────
  // 6) 한지 디자인 공모전 (대중심사 + 4단 사후관리)
  // ──────────────────────────────────────────────────────────────
  {
    case: {
      sourceProject: '2025 한지문화상품 디자인 공모전',
      sourceClient: '한국공예·디자인문화진흥원',
      channelType: 'B2G',
      outcome: 'won',
      snippet:
        '2023 실험 → 2024 가치 정립 → 2025 가능성의 확장 → 2026 글로벌 확장 → 2027~ 글로벌 트렌드 5단계 로드맵의 3년차 재수주 공모로, 본 사업은 1억 예산에서 "Hanji Re:Craft — 전통을 넘어, 삶에 닿다" 메시지를 **대중심사단 30명의 10점 정량 반영** 과 **Startup 6 Dimension → 맞춤 코치 → 액션클럽 → 라이콘 투자 4단 사후관리** 로 뒷받침한다. 1차 서류 30팀 → 2차 실물 10팀 → 3차 최종(실물+PT+대중심사) 4팀의 3단 심사와 컨설팅 60회 이상(30팀×1회 + 10팀×1회 + 최종 4팀 추가)·공예트렌드페어·한지가헌 입점·유통 3개사 이상 연계. 이전 기수의 "수상작이 시장에서 안 팔린다" 를 심사 설계와 사후관리로 선제 해소.',
      whyItWorks:
        '"차별화" 배점을 대중심사 10점 정량 반영(시장성 검증을 심사 단계에 내장) 이 독점하고, "사후관리" 배점을 4단 육성 경로(진단→코치→커뮤니티→투자) 가 독점. 예산 1억 대비 과업 밀도를 제안사 기존 자산(공예트렌드페어·한지가헌·유통 5종 플랫폼 풀·라이콘·일본 지사) 재활용으로 가능하게 만든 설계가 "수행 능력" 신뢰를 확보.',
      tags: [
        '한지',
        '공모전설계',
        '대중심사',
        '4단사후관리',
        '6Dimension',
        '라이콘투자',
        '재수주',
      ],
      profile: {
        targetStage: '비창업자',
        targetSegment: {
          demographic: ['디자이너', '장인'],
          businessDomain: ['문화/예술'],
          geography: '일반',
        },
        scale: {
          budgetKrw: 100_000_000,
          budgetTier: '1-3억', // normalizeProfile 재계산 (1억이면 1-3억 구간)
          participants: '20-50',
          durationMonths: 8,
        },
        formats: ['공모전', '박람회/전시'],
        delivery: {
          mode: '오프라인',
          usesLMS: true,
          onlineRatio: 10,
          usesAICoach: false,
        },
        supportStructure: {
          tasks: ['모객', '심사_선발', '컨설팅_산출물'],
          fourLayerSupport: false,
          coachingStyle: '1:1',
          externalSpeakers: true,
          externalSpeakerCount: 5,
          nonStartupSupport: {
            coordinationBody: '공예·디자인 전문가 풀',
            domainPartners: [
              '공예트렌드페어',
              '한지가헌',
              '아이디어스·29cm·와디즈·텀블벅·오늘의집·챕터원·오브젝트',
            ],
          },
        },
        methodology: {
          primary: '공모전설계',
          impactModulesUsed: [],
        },
        selection: {
          style: '대중심사_병행',
          stages: 3,
          competitionRatio: '높음_1:6+',
          publicVoting: true,
          publicVotingWeight: 10,
          evaluatorCount: 35, // 전문가 5 + 대중심사단 30
        },
        channel: {
          type: 'B2G',
          clientTier: '공공기관',
          isRenewal: true, // 3년차
        },
        primaryImpact: ['매출/판로'],
        aftercare: {
          hasAftercare: true,
          scope: ['투자연계', 'IR지원', 'alumni네트워크', '유통입점'],
          tierCount: 4, // 한지 4단 사후관리 특수
        },
        version: '1.0',
        updatedAt: UPDATED_AT,
      },
    },
  },

  // ──────────────────────────────────────────────────────────────
  // 7) 안성문화장 글로컬
  // ──────────────────────────────────────────────────────────────
  {
    case: {
      sourceProject: '2025 안성문화장 글로컬 특화사업',
      sourceClient: '안성시',
      channelType: 'B2G',
      outcome: 'won',
      snippet:
        '안성은 국비·지방비 200억 3년 규모 대한민국 문화도시·동아시아 문화도시의 수도권 유일 보유 지자체로, 본 6.5억 사업은 "Weaving Heritage, Sharing Culture" 우산 아래 문화장인 20인을 한국-중국(후저우)-일본(가마쿠라) 3국 연합 교류 네트워크로 엮는다. 국외 인사이트 교류(교토·경덕진·타이난 중 1개)·해외 유명 공예인 7인 초청·협업 디자인 7건 이상·페스티벌 방문자 누적 50만·바이럴 2,000만 뷰 KPI 를, **도쿄 지사(2025년 2월 설립) + 아시아투모로우 플랫폼 + 메종&오브제 참가 확정** 3중 글로벌 인프라로 실행. 앵커 사업(문화장인학교·문화창작 플랫폼·장인 레지던시·6070 추억의 거리·바우덕이 축제) 과의 레이어 연계로 단년도 6.5억이 200억 규모 콘텐츠 핵심 자리에 위치한다.',
      whyItWorks:
        '"수행 가능성" 배점에서 도쿄 지사·메종&오브제 계약·파트너 Pool(교토 MOCAD·경덕진 세라믹 유니버시티) 실명을 드러내 "보유" 를 구체로 증명한 것, "기대 효과" 배점에서 안성 통합 축제 누적 50만(주변 사업 누적 KPI) 로 단년도 사업의 레버리지를 보여준 것이 동시에 점수 차를 만듦. Weaving/Heritage/Contents/Global 4키워드 프레임이 복잡한 5과업·세부 수십 개 프로그램에 구조를 부여.',
      tags: [
        '글로컬',
        '문화장인',
        '도쿄지사',
        '메종&오브제',
        '앵커사업연계',
        '3국연합',
        '지역활성화',
      ],
      profile: {
        targetStage: '비창업자',
        targetSegment: {
          demographic: ['장인'],
          businessDomain: ['문화/예술'],
          geography: '글로벌_공통',
        },
        scale: {
          budgetKrw: 650_000_000,
          budgetTier: '5억_이상',
          participants: '20-50',
          durationMonths: 5,
        },
        formats: ['해외연수', '페스티벌/축제', '박람회/전시'],
        delivery: {
          mode: '오프라인',
          usesLMS: true,
          onlineRatio: 15,
          usesAICoach: false,
        },
        supportStructure: {
          tasks: ['모객', '교류_네트워킹', '컨설팅_산출물', '행사_운영'],
          fourLayerSupport: false,
          coachingStyle: '팀코칭',
          externalSpeakers: true,
          externalSpeakerCount: 10,
          nonStartupSupport: {
            coordinationBody: '문화장인 특별추진위원회(10인)',
            domainPartners: [
              '도쿄 지사',
              '아시아투모로우',
              '메종&오브제',
              '교토 MOCAD·교토예술대학',
              '경덕진 세라믹 유니버시티',
              '타이난 Creative Expo',
            ],
          },
        },
        methodology: {
          primary: '글로컬',
          impactModulesUsed: [],
        },
        selection: {
          style: '선정형_비경쟁',
          stages: 1,
          competitionRatio: '낮음_1:2이하',
          publicVoting: false,
          evaluatorCount: 5,
        },
        channel: {
          type: 'B2G',
          clientTier: '기초지자체',
          isRenewal: false,
        },
        primaryImpact: ['지역활성화', '글로벌확장'],
        aftercare: {
          hasAftercare: true,
          scope: ['해외진출', 'alumni네트워크', '유통입점'],
          tierCount: 3,
        },
        version: '1.0',
        updatedAt: UPDATED_AT,
      },
    },
  },

  // ──────────────────────────────────────────────────────────────
  // 8) 예비창업 글로벌 진출 (약식 — 원본 OCR 미확보)
  // ──────────────────────────────────────────────────────────────
  {
    case: {
      sourceProject: '2025 예비창업패키지 글로벌 진출 프로그램',
      sourceClient: '중소벤처기업부 창업진흥원 계열',
      channelType: 'B2G',
      outcome: 'won',
      snippet:
        '2020년대 한국 예비창업 트랙이 국내 생존 중심에서 Born Global 지향으로 축을 옮기는 흐름에 본 사업은 "초기 단계부터 해외 시장 기준" 을 설계 전제로 둔다. 예비창업자 선발 → ACT-PRENEURSHIP 사전 진단 → IMPACT 기반 Born Global 커리큘럼 → 해외 시장 리서치·MVP 테스트 → 일본·인도 현지 법인(2025 설립) 인큐베이션 공간 활용 → 520+ 글로벌 파트너·아시아투모로우 플랫폼 게재·메종&오브제/CES 참가 지원 → 라이콘 투자 + LIPS 융자 최대 5배 매칭 경로를 연결. "해외 진출 지원" 을 구호가 아닌 실존 인프라로 전환한다.',
      whyItWorks:
        '"수행 가능성·현지화 역량" 배점(글로벌 사업 핵심, 통상 15~25%) 을 일본·인도 법인 실존·520+ 파트너·메종&오브제 계약의 구체성으로 방어. "차별화" 배점에서 Born Global 프레임 + 글로벌 콘텐츠 플랫폼(아시아투모로우) 자체 런칭 자산이 신규 경쟁사 대비 격차를 만듦.',
      tags: [
        '예비창업',
        '글로벌진출',
        'Born Global',
        '일본법인',
        '인도법인',
        '아시아투모로우',
        '라이콘',
      ],
      profile: {
        targetStage: '예비창업_아이디어유',
        targetSegment: {
          demographic: ['무관'],
          businessDomain: ['ALL'],
          geography: '글로벌_공통',
        },
        scale: {
          budgetKrw: 400_000_000,
          budgetTier: '3-5억',
          participants: '20-50',
          durationMonths: 8,
        },
        formats: ['해외연수', 'IR', '네트워킹'],
        delivery: {
          mode: '하이브리드',
          usesLMS: true,
          onlineRatio: 40,
          usesAICoach: true,
        },
        supportStructure: {
          tasks: ['모객', '심사_선발', '멘토링_코칭', '교류_네트워킹', '행사_운영'],
          fourLayerSupport: true,
          coachingStyle: '1:1',
          externalSpeakers: true,
          externalSpeakerCount: 15,
          nonStartupSupport: {
            domainPartners: [
              '일본 법인(2025)',
              '인도 법인(2025)',
              '아시아투모로우 플랫폼',
              '메종&오브제',
              '520+ 글로벌 파트너',
            ],
          },
        },
        methodology: {
          primary: '글로벌진출',
          impactModulesUsed: ['I-1', 'M-1', 'M-2', 'C-1', 'T-1'],
        },
        selection: {
          style: '서류+PT',
          stages: 2,
          competitionRatio: '중간_1:3-5',
          publicVoting: false,
          evaluatorCount: 5,
        },
        channel: {
          type: 'B2G',
          clientTier: '중앙부처',
          isRenewal: false,
        },
        primaryImpact: ['투자유치', '글로벌확장'],
        aftercare: {
          hasAftercare: true,
          scope: ['해외진출', '투자연계', 'IR지원'],
          tierCount: 3,
        },
        version: '1.0',
        updatedAt: UPDATED_AT,
      },
    },
  },

  // ──────────────────────────────────────────────────────────────
  // 9) 청년마을 만들기 (추정 — 원문 확보 시 교정 필요)
  // ──────────────────────────────────────────────────────────────
  {
    case: {
      // 추정: 수주 제안서 60p, 행정안전부 청년마을 사업
      sourceProject: '2026 청년마을 만들기 사업',
      sourceClient: '행정안전부(추정)',
      channelType: 'B2G',
      outcome: 'won',
      // 추정 — 원문 확보 시 교정 필요.
      // ud_proposal_patterns.md 의 공통 패턴(4중 지원 체계·전국 30거점 1,500명
      // 동시 교육·21,000명 육성·291명 코치·정부업무평가 연계 성과) 를 기반으로
      // 청년마을의 로컬·공동체 톤에 맞춰 조합.
      snippet:
        '2020년대 후반 지방 소멸 가속과 청년 수도권 집중이 동시에 심화되는 가운데, 본 사업은 특정 로컬을 거점으로 청년 30명을 6개월간 집주·프로젝트·커뮤니티 운영에 묶어 "방문자에서 거주자로" 전환하는 설계다. 전국 30개 거점·1,500명 동시 교육 인프라와 291명 액션코치 풀·21,000명 육성 데이터를 기반으로, 4중 지원 체계(전문 멘토 + 지역 컨설턴트 + 전담 코치 + 청년 동료) 와 상권강화기구형 운영사무국을 결합. 방문자 체류 경험 → 프로젝트 참여 → 정착 의향 단계별 전환율을 정량 KPI 로 세분화한다.',
      whyItWorks:
        '"지역 정착 효과" 배점에서 정부업무평가에 활용 가능한 맞춤형 성과 분석 포맷(한국사회가치평가 연계) 으로 상위 평가까지 대응하는 것이 결정적. 93개 시·군·구 로컬 운영 데이터 + 4중 지원 체계의 "수행 능력" 근거가 신규 경쟁사 대비 격차.',
      tags: ['청년마을', '로컬브랜드', '지역활성화', '4중지원체계', '행안부'],
      profile: {
        targetStage: '비창업자',
        targetSegment: {
          demographic: ['청소년', '대학생', '일반소상공인'],
          businessDomain: ['문화/예술', '여행/레저'],
          geography: '로컬',
        },
        scale: {
          budgetKrw: 500_000_000,
          budgetTier: '5억_이상', // 추정
          participants: '20-50',
          durationMonths: 8,
        },
        formats: ['네트워킹', '페스티벌/축제'],
        delivery: {
          mode: '오프라인',
          usesLMS: true,
          onlineRatio: 15,
          usesAICoach: false,
        },
        supportStructure: {
          tasks: ['모객', '교류_네트워킹', '컨설팅_산출물', '행사_운영'],
          fourLayerSupport: true,
          coachingStyle: '혼합',
          externalSpeakers: true,
          externalSpeakerCount: 10,
          nonStartupSupport: {
            coordinationBody: '운영사무국',
            domainPartners: ['지역 앵커 시설', '로컬 크리에이터'],
          },
        },
        methodology: {
          primary: '로컬브랜드',
          impactModulesUsed: [],
        },
        selection: {
          style: '선정형_비경쟁',
          stages: 1,
          competitionRatio: '낮음_1:2이하',
          publicVoting: false,
          evaluatorCount: 5,
        },
        channel: {
          type: 'B2G',
          clientTier: '중앙부처', // 행정안전부 기준 추정
          isRenewal: false,
        },
        primaryImpact: ['지역활성화', '역량개발'],
        aftercare: {
          hasAftercare: true,
          scope: ['alumni네트워크', '진단지속'],
          tierCount: 2,
        },
        version: '1.0',
        updatedAt: UPDATED_AT,
      },
    },
  },

  // ──────────────────────────────────────────────────────────────
  // 10) 재창업 특화 교육 (추정 — 원문 확보 시 교정 필요)
  // ──────────────────────────────────────────────────────────────
  {
    case: {
      sourceProject: '재창업 특화 교육 사업',
      sourceClient: '중소벤처기업부 산하 공공기관(추정)',
      channelType: 'B2G',
      outcome: 'won',
      // 추정 — 원문 확보 시 교정 필요.
      // 재창업 패키지의 일반 패턴(실패 원인 분석 → 재설계 → 투자 연계) 와
      // 언더독스 제안 공통 자산(4중 지원·IMPACT·Action Week·라이콘) 을 결합.
      snippet:
        '초기 창업 실패율이 높아지는 2020년대 후반, 재창업자의 **실패 원인 분석 → 사업 모델 재설계 → 자금·판로 재연결** 3단 전환 경로가 공백으로 남아 있다. 본 사업은 재창업자 30명을 6개월간 ACT-PRENEURSHIP 사전·사후 진단으로 5역량을 다시 측정하고, IMPACT 6단계 중 Market/Product/Commercial 구간에 시간을 재배분해 "왜 지난 시도가 실패했는가 → 이번엔 어떻게 다를 것인가" 를 코칭 로그에 축적. 291명 액션코치 풀 + 전담 PM + 외부 컨설턴트 + 재창업 동료 네트워크 4중 지원 체계, Demo Day 에 투자자 초청, 라이콘 투자 + LIPS 융자 최대 5배 매칭으로 "재도전 = 방치" 공식을 깬다.',
      whyItWorks:
        '재창업 심사의 핵심 "실패 학습·재설계 품질" 배점을 ACT-PRENEURSHIP 사전·사후 진단 + 코칭 로그 + Action Week 3중 장치로 정량 증명. 한국사회가치평가 연계 성과 분석으로 발주처의 정부업무평가 상위 대응까지 커버.',
      tags: ['재창업', 'IMPACT방법론', '실패학습', '4중지원체계', '라이콘투자'],
      profile: {
        targetStage: 'seed', // 재창업 = 이미 1회 이상 창업 경험
        targetSegment: {
          demographic: ['무관'],
          businessDomain: ['ALL'],
          geography: '일반',
        },
        scale: {
          budgetKrw: 400_000_000,
          budgetTier: '3-5억', // 추정
          participants: '20-50',
          durationMonths: 6,
        },
        formats: ['네트워킹', '데모데이'],
        delivery: {
          mode: '하이브리드',
          usesLMS: true,
          onlineRatio: 35,
          usesAICoach: true,
        },
        supportStructure: {
          tasks: ['모객', '심사_선발', '멘토링_코칭', '컨설팅_산출물', '행사_운영'],
          fourLayerSupport: true,
          coachingStyle: '1:1',
          externalSpeakers: true,
          externalSpeakerCount: 10,
        },
        methodology: {
          primary: '재창업',
          impactModulesUsed: ['M-1', 'M-2', 'P-1', 'C-1', 'C-2'],
        },
        selection: {
          style: '서류+PT',
          stages: 2,
          competitionRatio: '중간_1:3-5',
          publicVoting: false,
          evaluatorCount: 5,
        },
        channel: {
          type: 'B2G',
          clientTier: '공공기관',
          isRenewal: false,
        },
        primaryImpact: ['투자유치', '역량개발'],
        aftercare: {
          hasAftercare: true,
          scope: ['투자연계', 'alumni네트워크', 'IR지원'],
          tierCount: 3,
        },
        version: '1.0',
        updatedAt: UPDATED_AT,
      },
    },
  },
]

// ─────────────────────────────────────────────────────────────────
// Idempotent upsert — WinningPattern 에는 (sourceProject, sectionKey)
// 복합 unique 가 없으므로 findFirst + update/create 패턴
// ─────────────────────────────────────────────────────────────────

const PRIMARY_SECTION_KEY = 'proposal-background'

async function upsertCase(input: CaseSeedInput): Promise<'created' | 'updated'> {
  const normalizedProfile = normalizeProfile(input.profile)

  // Prisma 의 Json 필드 입력으로 전달 (타입 시스템 상 InputJsonValue 로 강제)
  const sourceProfileJson = normalizedProfile as unknown as Prisma.InputJsonValue

  const existing = await prisma.winningPattern.findFirst({
    where: {
      sourceProject: input.sourceProject,
      sectionKey: PRIMARY_SECTION_KEY,
    },
    select: { id: true },
  })

  const data = {
    sourceProject: input.sourceProject,
    sourceClient: input.sourceClient,
    sectionKey: PRIMARY_SECTION_KEY,
    channelType: input.channelType,
    outcome: input.outcome,
    techEvalScore: input.techEvalScore ?? null,
    snippet: input.snippet,
    whyItWorks: input.whyItWorks,
    tags: input.tags,
    sourceProfile: sourceProfileJson,
  }

  if (existing) {
    await prisma.winningPattern.update({
      where: { id: existing.id },
      data,
    })
    return 'updated'
  }

  await prisma.winningPattern.create({ data })
  return 'created'
}

async function main() {
  console.log('🌱 ProgramProfile-tagged WinningPattern 시드 시작...')
  console.log(`   (총 ${CASE_SEEDS.length}건, sectionKey='${PRIMARY_SECTION_KEY}')\n`)

  let createdCount = 0
  let updatedCount = 0

  for (const { case: c } of CASE_SEEDS) {
    const action = await upsertCase(c)
    if (action === 'created') createdCount++
    else updatedCount++

    const marker = action === 'created' ? '✓ 신규' : '↻ 갱신'
    console.log(`  ${marker}  ${c.sourceProject}`)
  }

  console.log(
    `\n✅ 완료 — 신규 ${createdCount}건 · 갱신 ${updatedCount}건 (총 ${CASE_SEEDS.length}건)`,
  )
}

// Guard: only auto-run the seed when executed directly (not when imported
// by simulation/test scripts). Uses import.meta to detect entrypoint.
const isEntrypoint = (() => {
  try {
    const invoked = process.argv[1] ? process.argv[1].replace(/\\/g, '/') : ''
    const thisUrl = import.meta.url.replace(/^file:\/\/\/?/, '').replace(/\\/g, '/')
    return invoked && thisUrl && thisUrl.toLowerCase().endsWith(
      invoked.toLowerCase().split('/').pop() ?? '',
    )
  } catch {
    return false
  }
})()

if (isEntrypoint) {
  main()
    .catch((e) => {
      console.error('❌ ProgramProfile 시드 실패:', e)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
