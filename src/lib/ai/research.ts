/**
 * 외부 리서치 (티키타카 파이프라인) — Phase 2 단순화 (claude.ts 에서 분리, 2026-05-03)
 *
 * Step A: generateResearchPrompts() → PM이 외부 LLM에 복사 → 결과 수집
 * Step B: 수집된 리서치를 buildLogicModel/curriculum-ai/generateProposalSection 에 주입
 * → 토큰 절약 + 일관성 + PM 컨트롤
 */

import type { RfpParsed } from '@/lib/claude'

/** PM이 외부 LLM에 복사할 리서치 프롬프트 */
export interface ResearchPrompt {
  id: string
  category: 'policy' | 'market' | 'benchmark' | 'audience' | 'operation'
  title: string
  description: string
  prompt: string
  usedIn: string[]
}

/** PM이 외부 LLM에서 가져온 리서치 결과 */
export interface ExternalResearch {
  promptId: string
  category: string
  content: string
  source?: string
  attachedAt: string
}

/**
 * RFP 정보를 기반으로 외부 LLM용 리서치 프롬프트를 생성합니다.
 * 템플릿 기반 → API 호출 없음 → 토큰 비용 0.
 */
export function generateResearchPrompts(
  rfpParsed: RfpParsed,
  impactGoal?: string,
): ResearchPrompt[] {
  const { projectName, targetAudience, objectives, keywords, region, client } = rfpParsed
  const field = keywords?.slice(0, 3).join(', ') || '교육 사업'
  const year = new Date().getFullYear()

  return [
    {
      id: 'policy',
      category: 'policy',
      title: '정책/제도 동향',
      description: '"추진 배경 및 필요성"의 정책 맥락 근거',
      usedIn: ['proposal-1', 'logicModel'],
      prompt: `다음 사업과 관련된 ${year}년 최신 정책 동향을 조사해주세요.

사업명: ${projectName}
발주기관: ${client}
지역: ${region || '전국'}
분야: ${field}

조사 항목:
1. 이 사업과 직접 관련된 정부/지자체 정책 방향 (최근 1-2년)
2. 관련 법령/제도 변화 (구체적 법령명과 시행일)
3. 정부 예산/지원 추이 (증가/감소 트렌드, 가능하면 수치)
4. 이 사업이 "지금" 필요한 정책적 근거

형식: 번호 매기고, 출처/근거를 함께. 핵심만 300~500자.`,
    },
    {
      id: 'market',
      category: 'market',
      title: '시장/트렌드 데이터',
      description: '정량 근거 + 트렌드 (Logic Model, 제안서 전반)',
      usedIn: ['logicModel', 'proposal-1', 'proposal-2'],
      prompt: `다음 분야의 ${year}년 최신 시장 동향과 트렌드를 조사해주세요.

분야: ${field}
대상: ${targetAudience}
지역: ${region || '전국'}
${impactGoal ? `임팩트 목표: ${impactGoal}` : ''}

조사 항목:
1. ${field} 분야 시장 규모 및 성장 추이 (수치 포함)
2. ${year}년 주요 트렌드 3가지 (AI 활용, 디지털 전환, 글로벌화 등)
3. 주목받는 새로운 접근법/방법론
4. ${targetAudience} 관련 최신 통계/연구 데이터

형식: 번호 + 수치/출처 포함. 핵심만 300~500자.`,
    },
    {
      id: 'benchmark',
      category: 'benchmark',
      title: '타 기관 우수 사례',
      description: '차별화 전략과 벤치마킹 (커리큘럼, 운영 설계)',
      usedIn: ['logicModel', 'proposal-2', 'curriculum'],
      prompt: `다음 사업과 유사한 타 기관/해외 우수 사례를 조사해주세요.

사업 목표: ${objectives.join('; ')}
대상: ${targetAudience}
유형: 교육/육성 프로그램

조사 항목:
1. 국내 유사 사업 우수 사례 2개 (기관명, 사업명, 핵심 성과 수치)
2. 해외 벤치마크 1-2개 (교육 설계나 임팩트 측정 방법 중심)
3. 각 사례의 핵심 성공 요인 / 차별점
4. 우리가 참고할 만한 구체적 운영 방식이나 커리큘럼 구성

형식: 사례별 구분, 핵심만. 400~600자.`,
    },
    {
      id: 'audience',
      category: 'audience',
      title: '대상자 인사이트',
      description: '대상자 맞춤 설계 근거 (커리큘럼, 코치 구성)',
      usedIn: ['curriculum', 'proposal-4', 'proposal-5'],
      prompt: `다음 교육 대상자에 대한 심층 인사이트를 조사해주세요.

대상: ${targetAudience}
${region ? `지역: ${region}` : ''}
사업 목표: ${objectives.slice(0, 2).join('; ')}

조사 항목:
1. ${targetAudience}의 주요 어려움/장벽 (최근 조사/통계 기반)
2. 교육 프로그램에서 가장 원하는 것 (실용성, 네트워킹, 자격 등)
3. 교육 이탈/중도포기 주요 원인과 검증된 방지 전략
4. 이 대상에게 효과적인 교육 방법론 (PBL, 코칭, 플립러닝 등)

형식: 번호 + 근거/출처 포함. 핵심만 300~500자.`,
    },
    {
      id: 'operation',
      category: 'operation',
      title: '운영 노하우 & 리스크',
      description: '실행 계획/예산/평가 설계에 활용',
      usedIn: ['proposal-6', 'proposal-7', 'curriculum'],
      prompt: `다음 유형의 사업 운영 노하우와 리스크를 정리해주세요.

사업 유형: ${projectName} (교육/육성)
규모: ${rfpParsed.targetCount ? `${rfpParsed.targetCount}명` : '소규모'}
기간: ${rfpParsed.projectStartDate || '미정'} ~ ${rfpParsed.projectEndDate || '미정'}
${rfpParsed.totalBudgetVat ? `예산: ${(rfpParsed.totalBudgetVat / 10000).toLocaleString()}만원` : ''}

조사 항목:
1. 이 유형 사업의 흔한 운영 리스크 3가지 + 대응 전략
2. 참여자 모집/유지율을 높이는 검증된 방법
3. 발주기관이 중시하는 성과 지표와 보고 형식
4. 예산 집행 주의점 (실비 비율, 인건비 구조)

형식: 핵심만, 번호 정리. 300~500자.`,
    },
  ]
}

/**
 * 수집된 외부 리서치를 프롬프트에 주입할 수 있는 형태로 포맷팅.
 * 카테고리별로 묶어서 간결하게 정리.
 */
export function formatExternalResearch(research: ExternalResearch[]): string {
  if (!research?.length) return ''
  const grouped = research.reduce((acc, r) => {
    const key = r.category
    if (!acc[key]) acc[key] = []
    acc[key].push(r)
    return acc
  }, {} as Record<string, ExternalResearch[]>)

  const LABELS: Record<string, string> = {
    policy: '정책/제도 동향',
    market: '시장/트렌드',
    benchmark: '타 기관 사례',
    audience: '대상자 인사이트',
    operation: '운영 노하우',
  }

  const sections = Object.entries(grouped).map(([cat, items]) =>
    `[${LABELS[cat] || cat}]\n${items.map(i => i.content).join('\n')}`
  )

  return `\n═══════════════════════════════════════
[PM이 수집한 외부 리서치 — 반드시 활용하세요]
═══════════════════════════════════════
${sections.join('\n\n')}\n`
}
