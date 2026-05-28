/**
 * Generate Track Record — Phase I1 (2026-05-28)
 *
 * sections.7 (수행 역량 및 실적) 자동 생성.
 *
 * 입력:
 *   - RFP (channel, keywords, projectName)
 *   - 매칭 한도 (default: top-5 유사 사업)
 *
 * 흐름:
 *   1. DB 의 WinningPattern (102+건) 에서 channelType 일치 + keywords 부분 매칭
 *   2. ContentAsset (assetType='case', 153건) 에서 narrativeSnippet 도메인 매칭
 *   3. 합쳐서 score 정렬 → top-5 (또는 입력 limit)
 *   4. Gemini 1 호출로 sections.7 본문 생성:
 *      - 누적 실적 통계 (UD_TRACK_RECORD)
 *      - 유사 사업 5건 (정량 KPI + sourceProject)
 *      - "왜 우리가 운영해야 하는가" 한 줄
 *
 * 결과: { sectionText, citedSources[] }
 *   - sectionText 가 draft.sections['7'] 에 박힘
 *   - citedSources 가 sourceTrace.matchedAssetIds 에 박힘
 *
 * 토큰: 1 LLM 호출 (track record 풍부 → 8K tokens 충분)
 */

import 'server-only'

import { prisma } from '@/lib/prisma'
import { invokeAi } from '@/lib/ai-fallback'
import { AI_TOKENS } from '@/lib/ai/config'
import { safeParseJson } from '@/lib/ai/parser'
import { z } from 'zod'
import type { RfpParsed } from '@/lib/ai/parse-rfp'
import { UD_TRACK_RECORD } from '@/lib/ud-brand'

export interface GenerateTrackRecordInput {
  rfp: RfpParsed
  channel: 'B2G' | 'B2B' | 'renewal'
  /** 매칭 한도 (default 5) */
  limit?: number
}

export interface SimilarProject {
  sourceProject: string
  sourceClient: string | null
  sectionKey: string
  snippet: string
  channelType: string | null
  outcome: string
  similarityScore: number
}

const TrackRecordResultSchema = z.object({
  sectionText: z.string().max(2000),
  highlights: z.array(z.string().max(200)).max(5).optional(),
})

export async function generateTrackRecord(
  input: GenerateTrackRecordInput,
): Promise<{
  sectionText: string
  citedSources: string[]
  similarProjects: SimilarProject[]
}> {
  const { rfp, channel, limit = 5 } = input

  // 1. DB 검색 — 채널 일치 + 키워드 매칭
  const keywords = (rfp.keywords ?? []).slice(0, 6)
  const projectName = rfp.projectName ?? ''
  const keywordPattern = keywords.length > 0 ? keywords.join('|') : null

  // WinningPattern 에서 채널 + 키워드 매칭
  // PostgreSQL ILIKE OR 형식
  const matches = await prisma.winningPattern.findMany({
    where: {
      channelType: channel,
      outcome: 'won',
      ...(keywordPattern
        ? {
            OR: keywords.flatMap((kw) => [
              { sourceProject: { contains: kw, mode: 'insensitive' as const } },
              { snippet: { contains: kw, mode: 'insensitive' as const } },
            ]),
          }
        : {}),
    },
    select: {
      id: true,
      sourceProject: true,
      sourceClient: true,
      sectionKey: true,
      snippet: true,
      channelType: true,
      outcome: true,
      techEvalScore: true,
    },
    take: limit * 4, // overfetch — dedupe + scoring 후 top-N
  })

  // 사업 단위로 dedupe (sourceProject) + 점수 부여
  const projectMap = new Map<string, SimilarProject>()
  for (const m of matches) {
    if (!m.sourceProject) continue
    const existing = projectMap.get(m.sourceProject)
    let score = 0.5
    // 키워드 매칭 개수 + sectionKey 보너스 (proposal-background 가장 풍부)
    for (const kw of keywords) {
      if (m.sourceProject.includes(kw)) score += 0.2
      if (m.snippet?.includes(kw)) score += 0.1
    }
    if (m.sectionKey === 'proposal-background') score += 0.1
    if (m.techEvalScore && m.techEvalScore > 80) score += 0.1
    if (!existing || existing.similarityScore < score) {
      projectMap.set(m.sourceProject, {
        sourceProject: m.sourceProject,
        sourceClient: m.sourceClient,
        sectionKey: m.sectionKey,
        snippet: (m.snippet ?? '').slice(0, 400),
        channelType: m.channelType,
        outcome: m.outcome,
        similarityScore: Math.min(1, score),
      })
    }
  }

  const similarProjects = Array.from(projectMap.values())
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, limit)

  // 2. Gemini 호출로 sections.7 본문 생성
  const r = UD_TRACK_RECORD
  const similarList = similarProjects
    .map((p, i) =>
      `${i + 1}. ${p.sourceProject}${p.sourceClient ? ` (${p.sourceClient})` : ''} — ${p.snippet.slice(0, 250)}`,
    )
    .join('\n')

  const prompt = `
당신은 한국 RFP 제안서의 "수행 역량 및 실적" 섹션 전문 작성자입니다.
다음 본 사업과 유사한 ${similarProjects.length}건 수행 실적 + 누적 실적 데이터를 기반으로
sections.7 본문을 작성합니다.

[본 사업]
${rfp.projectName ?? '(미상)'}
발주처: ${rfp.client ?? '(미상)'}
채널: ${channel}
키워드: ${keywords.join(' · ')}

[유사 사업 ${similarProjects.length}건 — 모두 당선 (won)]
${similarList || '(매칭 없음)'}

[언더독스 누적 실적 (UD_TRACK_RECORD)]
- ${r.yearsActive}년 운영 · 누적 수주 ${r.cumulativeRevenueBillions}억원+
- 운영 프로그램 ${r.programsConducted}건 · 청년 창업가 ${r.totalGraduates.toLocaleString()}명
- 배출 창업팀 ${r.startupTeamsFormed.toLocaleString()}건
- 전속 코치 풀 ${r.totalCoaches}명 · 글로벌 파트너 ${r.globalPartners}+
- 전국 ${r.regionalHubs}개 거점 · ${r.regionsCovered}개 국내외 지역
- 동시 ${r.simultaneousCapacity.toLocaleString()}명 교육 가능 · 신용등급 ${r.creditRating}
- ${r.esgMeasuredCompanies.toLocaleString()}개 기업 ESG 임팩트 측정
- 매년 ${r.startupDatabaseAnnualUpdate.toLocaleString()}명 신생 기업가 DB 갱신

──────────────────────────────
[작성 규칙]

1. **본문 구조** (700~1500자):
   - 첫 단락 (80~150자): 누적 실적 핵심 한 문장 + 본 사업 적합성
   - 둘째 단락 (200~400자): 유사 사업 3~5건 핵심 인용 (사업명·발주처·정량 결과)
     · 각 사업은 1~2 문장 · 정량 수치 강조
   - 셋째 단락 (200~400자): 본 사업 특화 역량 (코치진·글로벌·디지털 인프라)
   - 마지막 (100~200자): "왜 언더독스가 운영해야 하는가" 한 문장

2. **인용 형식**:
   - 유사 사업 인용 시: "사업명 (발주처, 핵심 정량)"
   - 정량 수치 박을 때: 매번 [근거: 출처] 형식 X — 본문 흐름 우선
   - inline source citation 1~2건만 (UD 내부 데이터 출처)

3. **톤**:
   - 경어체 (~합니다)
   - 자신감 + 겸손 균형 ("압도적" 같은 과장 X, 객관적 정량 강조)
   - 회사명 비교 금지 (디캠프·스파크랩 등)

4. **유사 사업 활용** ⭐ 매우 중요:
   - 위 ${similarProjects.length}건 사업명을 본문에 1~2개 실명 인용 (예: "A.25.0046 창업아이디어 빌드UP 캠프 실적 ...")
   - 정량 결과 (snippet 의 핵심 수치) 자연스럽게 박기
   - 동일 채널 (${channel}) 사업 인용으로 발주처 신뢰도 ↑

[출력 JSON]
{
  "sectionText": "<sections.7 본문 — 700~1500자, 위 4단락 구조>",
  "highlights": ["핵심 인용 1줄 1~3개 (PM 검토용)"]
}

JSON 만. 설명·마크다운 펜스 없이.
  `.trim()

  try {
    const aiResp = await invokeAi({
      prompt,
      maxTokens: AI_TOKENS.STANDARD,
      temperature: 0.4,
      label: 'generate-track-record',
    })
    const raw = safeParseJson<unknown>(aiResp.raw, 'track-record')
    const validated = TrackRecordResultSchema.safeParse(raw)
    if (!validated.success || !validated.data.sectionText) {
      console.warn('[track-record] zod 검증 실패 → fallback')
      return { sectionText: buildFallback(similarProjects), citedSources: similarProjects.map((p) => p.sourceProject), similarProjects }
    }
    return {
      sectionText: validated.data.sectionText,
      citedSources: similarProjects.map((p) => p.sourceProject),
      similarProjects,
    }
  } catch (err) {
    console.warn('[track-record] LLM 실패 → fallback:', err)
    return { sectionText: buildFallback(similarProjects), citedSources: similarProjects.map((p) => p.sourceProject), similarProjects }
  }
}

/** LLM 실패 시 휴리스틱 fallback */
function buildFallback(projects: SimilarProject[]): string {
  const r = UD_TRACK_RECORD
  const lines: string[] = []
  lines.push(
    `언더독스는 ${r.yearsActive}년간 창업가만을 전담해 온 전문 운영사로 ${r.programsConducted}건의 프로그램을 운영하고 ${r.totalGraduates.toLocaleString()}명의 창업가를 양성한 압도적 운영 역량을 보유합니다.`,
  )
  if (projects.length > 0) {
    lines.push('\n**최근 유사 수주 실적**:')
    for (const p of projects.slice(0, 5)) {
      lines.push(`- ${p.sourceProject}: ${p.snippet.slice(0, 120)}`)
    }
  }
  lines.push(
    `\n**압도적 실행 인프라**: 코치 ${r.totalCoaches}명 · 전국 ${r.regionalHubs}개 거점 · 동시 ${r.simultaneousCapacity.toLocaleString()}명 교육 가능 규모. 신용등급 ${r.creditRating}.`,
  )
  return lines.join('\n')
}
