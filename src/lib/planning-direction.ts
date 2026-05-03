/**
 * Planning Direction — Step 1 "기획 방향" AI 생성 모듈 (stateless)
 *
 * 책임:
 *   - 입력: RfpParsed + 발주처 채널 + 평가배점 전략 + (옵션) 유사 프로젝트
 *   - 출력: 제안배경 초안 / 제안 컨셉 후보 3개 / 핵심 기획 포인트 3개 / 파생 채널
 *   - DB 저장 ❌ — PM 확정 후 별도 PATCH 로 저장됨
 *
 * 관련 Skill: `.claude/skills/ud-brand-voice/SKILL.md`
 * 관련 문서: `docs/architecture/data-contract.md` §1.2 RfpSlice
 *
 * 타 모듈과 관계:
 *   - `src/lib/eval-strategy.ts` (B3) → `analyzeEvalStrategy(evalCriteria)` 결과를 프롬프트에 주입
 *   - `src/lib/pipeline-context.ts` → `SimilarProject` 타입 재사용
 *   - `src/lib/ud-brand.ts` → 브랜드 자산 (UD_IDENTITY, UD_KEY_MESSAGE_PATTERNS 등)
 *   - Wave 2: `src/app/(dashboard)/projects/[id]/step-rfp.tsx` (B4) 가 이 모듈의
 *     `PlanningDirectionResponse` 타입을 import 하여 UI 렌더링에 사용
 */

import type { RfpParsed } from '@/lib/ai/parse-rfp'
import type { SimilarProject } from '@/lib/pipeline-context'
import {
  UD_IDENTITY,
  UD_KEY_MESSAGE_PATTERNS,
  UD_TONE_GUIDE,
  UD_TRACK_RECORD,
  UD_PROPRIETARY_TOOLS,
  UD_SUPPORT_LAYERS,
} from '@/lib/ud-brand'
import type { ChannelPresetDto } from '@/lib/channel-presets'

// ═════════════════════════════════════════════════════════════════
// 1. 공개 타입 (B4 UI 가 import)
// ═════════════════════════════════════════════════════════════════

export type PlanningChannel = 'B2G' | 'B2B' | 'renewal'

export interface PlanningDirectionRequest {
  projectId: string
  /** B2 유사 프로젝트 검색 결과 (있으면 프롬프트에 주입) */
  similarProjects?: SimilarProject[]
}

/** 제안 컨셉 후보 — 3개 생성됨 */
export interface ProposalConceptCandidate {
  /** 30자 이내 헤드라인 */
  title: string
  /** 80자 이내 한 줄 설명 */
  oneLiner: string
  /** 왜 이 컨셉인가 (200자 이내) */
  rationale: string
}

/** AI 가 반환하는 기획 방향 결과 (stateless — DB 저장 전) */
export interface PlanningDirectionResponse {
  /** 제안배경 초안 (600-900자, 정책→시장→현장 3단) */
  proposalBackground: string
  /** 컨셉 후보 — 정확히 3개 */
  proposalConceptCandidates: ProposalConceptCandidate[]
  /** 핵심 기획 포인트 — 정확히 3개 (각 1문장) */
  keyPlanningPoints: string[]
  /** RFP 로부터 추정된 발주처 유형 */
  derivedChannel?: PlanningChannel
}

// ═════════════════════════════════════════════════════════════════
// 2. 발주처 채널 간단 판별 (Phase D2 까지 하드코딩)
// ═════════════════════════════════════════════════════════════════

/**
 * RFP 의 발주처명/프로젝트 타입으로부터 채널을 추정.
 * 현재는 간단한 키워드 규칙. Phase D2 에서 ChannelPreset DB 로 교체 예정.
 * 재계약(renewal)은 Phase C+ 에서 프로젝트 관계로 판별.
 */
export function deriveChannel(rfp: RfpParsed): PlanningChannel {
  const client = rfp.client ?? ''
  // 정부·지자체·공공기관
  if (/(시|도|구|군|진흥원|부|청|원|공단|공사|공공|정부)/.test(client)) return 'B2G'
  // 재단·법인 (공공성 기반) → B2G 톤
  if (/재단|법인/.test(client)) return 'B2G'
  // RfpParsed.projectType 이 명시적으로 B2B 이면 존중
  if (rfp.projectType === 'B2B') return 'B2B'
  return 'B2G'
}

/** 채널별 톤 프리셋 — 프롬프트 [발주처 유형] 섹션에 삽입됨 */
export const CHANNEL_TONE_PROMPT: Record<PlanningChannel, string> = {
  B2G: '정책 대응 + 안정적 운영 + 정량 KPI 중심. 혁신 표현은 위험 부담으로 읽힐 수 있음. 사회적 가치·수료율·리스크 관리 어휘 선호.',
  B2B: '비즈니스 ROI + 속도 + 유연성. 결과 지향 언어. 매출·성과·측정 가능한 효과 강조.',
  renewal: '작년 성과 + 개선점 + 신뢰 누적 강조. 처음 만나는 고객 어조 금지 — "올해는 ~을 강화합니다" 프레임.',
}

// ═════════════════════════════════════════════════════════════════
// 3. 평가배점 전략 주입 타입 (B3 와의 계약)
// ═════════════════════════════════════════════════════════════════

/**
 * B3 (`src/lib/eval-strategy.ts`) 가 반환하는 `analyzeEvalStrategy()` 결과의
 * 최소 계약 형태. B3 최종 스펙이 확장되어도 여기 선언된 필드만 읽으면 안정적.
 *
 * Wave 1 병렬 작업으로 B3 파일이 없을 수 있음 → 런타임에 dynamic import 로 처리.
 */
export interface EvalStrategyLike {
  topItems: Array<{
    name: string
    points: number
    section: string
    weight: number
    guidance: string
  }>
  sectionWeights: Record<string, number>
  overallGuidance: string[]
}

// ═════════════════════════════════════════════════════════════════
// 4. 프롬프트 빌더
// ═════════════════════════════════════════════════════════════════

/**
 * RfpParsed 를 프롬프트에 주입 가능한 Markdown 블록으로 직렬화.
 * 과도하게 장황하지 않도록 핵심 필드만 포함.
 */
function serializeRfp(rfp: RfpParsed): string {
  const lines: string[] = []
  lines.push(`- 사업명: ${rfp.projectName || '(미기재)'}`)
  lines.push(`- 발주기관: ${rfp.client || '(미기재)'}`)
  if (rfp.region) lines.push(`- 지역: ${rfp.region}`)
  if (rfp.totalBudgetVat || rfp.supplyPrice) {
    const krw = rfp.totalBudgetVat ?? rfp.supplyPrice ?? 0
    lines.push(`- 예산: ${(krw / 100_000_000).toFixed(2)}억원 (${rfp.totalBudgetVat ? 'VAT 포함' : '공급가액'})`)
  }
  lines.push(`- 대상: ${rfp.targetAudience || '(미기재)'}${rfp.targetCount ? ` / ${rfp.targetCount}명` : ''}`)
  if (rfp.targetStage?.length) lines.push(`- 창업 단계: ${rfp.targetStage.join(', ')}`)
  if (rfp.eduStartDate || rfp.eduEndDate) {
    lines.push(`- 교육 기간: ${rfp.eduStartDate ?? '?'} ~ ${rfp.eduEndDate ?? '?'}`)
  }
  if (rfp.objectives?.length) {
    lines.push(`- 사업 목표:`)
    for (const o of rfp.objectives) lines.push(`    • ${o}`)
  }
  if (rfp.deliverables?.length) {
    lines.push(`- 산출물:`)
    for (const d of rfp.deliverables) lines.push(`    • ${d}`)
  }
  if (rfp.keywords?.length) lines.push(`- 키워드: ${rfp.keywords.join(', ')}`)
  if (rfp.constraints?.length) {
    lines.push(`- 제약사항:`)
    for (const c of rfp.constraints) lines.push(`    • [${c.type}] ${c.description}`)
  }
  if (rfp.summary) lines.push(`- 요약: ${rfp.summary}`)
  return lines.join('\n')
}

/** 평가배점 전략 블록 직렬화 */
function serializeEvalStrategy(evalStrategy: EvalStrategyLike | null): string {
  if (!evalStrategy || evalStrategy.topItems.length === 0) {
    return '[평가배점 전략]\n(평가배점 정보가 RFP 에 없거나 추출되지 않음 — 키 메시지 패턴 기본 가중치로 작성)'
  }
  const lines: string[] = []
  lines.push('[평가배점 전략 — 이 배점에 정조준해서 "핵심 기획 포인트" 를 작성하세요]')
  lines.push('상위 배점 항목:')
  for (const it of evalStrategy.topItems) {
    const pct = Math.round((it.weight ?? 0) * 100)
    lines.push(`  • ${it.name} ${it.points}점 (전체 ${pct}%) — ${it.guidance}`)
  }
  if (evalStrategy.overallGuidance.length > 0) {
    lines.push('전체 전략:')
    for (const g of evalStrategy.overallGuidance) lines.push(`  - ${g}`)
  }
  return lines.join('\n')
}

/** 유사 프로젝트 블록 직렬화 (있는 경우에만) */
function serializeSimilarProjects(similarProjects?: SimilarProject[]): string {
  if (!similarProjects || similarProjects.length === 0) return ''
  const lines: string[] = []
  lines.push('[유사 수주 프로젝트 참고 — 컨셉·포인트 차별화에 활용]')
  for (const p of similarProjects.slice(0, 5)) {
    const status = p.isBidWon ? '수주' : '실패'
    const score = p.techEvalScore != null ? ` / 기술평가 ${p.techEvalScore}점` : ''
    lines.push(`  • ${p.name} (${p.client}) — 유사도 ${(p.similarity * 100).toFixed(0)}% / ${status}${score}`)
    if (p.matchReasons?.length) lines.push(`    매칭 사유: ${p.matchReasons.join(', ')}`)
  }
  return lines.join('\n')
}

/**
 * 기획 방향 AI 프롬프트 조립.
 *
 * @param rfp             RFP 파싱 결과
 * @param channel         발주처 채널 (B2G / B2B / renewal)
 * @param evalStrategy    평가배점 분석 결과 (B3 산출물) — null 이면 생략
 * @param similarProjects 유사 프로젝트 (선택)
 * @returns               Claude user content 로 사용할 단일 문자열
 */
export function buildPlanningDirectionPrompt(
  rfp: RfpParsed,
  channel: PlanningChannel,
  evalStrategy: EvalStrategyLike | null,
  similarProjects?: SimilarProject[],
): string {
  const r = UD_TRACK_RECORD
  const keyMessages = UD_KEY_MESSAGE_PATTERNS.patterns
    .map((p) => `  - ${p.name}: ${p.usage}`)
    .join('\n')
  const tools = UD_PROPRIETARY_TOOLS.slice(0, 5)
    .map((t) => `  - ${t.name} (${t.type}): ${t.description}`)
    .join('\n')
  const layers = UD_SUPPORT_LAYERS.map((l) => `  - ${l.layer}: ${l.role}`).join('\n')

  const evalBlock = serializeEvalStrategy(evalStrategy)
  const similarBlock = serializeSimilarProjects(similarProjects)

  return `당신은 언더독스의 수주 제안서 기획자입니다. 아래 RFP 를 분석하여
① 제안배경 초안, ② 제안 컨셉 후보 3개, ③ 핵심 기획 포인트 3개를 생성하세요.

[언더독스 정체성]
  - 미션: "${UD_IDENTITY.missionKo}"
  - 대표 메시지: "${UD_IDENTITY.ceoMessage}"
  - 실행 철학: "${UD_IDENTITY.actionPhilosophy}"
  - 차별화 선언: ${UD_IDENTITY.differentiation}
  - 인사이트 문장: "${UD_IDENTITY.insightSentence}"

[핵심 실적 (정량 포화용 — 숫자 그대로 인용 가능)]
  - 10년 업력, 창업가 ${r.totalGraduates.toLocaleString()}명 육성 (약 ${r.totalGraduatesApprox.toLocaleString()}명 누적)
  - ${r.programsConducted}개 프로그램 · ${r.startupTeamsFormed.toLocaleString()}팀 창업 · ${r.regionsCovered}개 지역
  - 코치 풀 ${r.totalCoaches}명 · 전국 ${r.regionalHubs}개 거점 · ${r.globalPartners}+ 글로벌 파트너
  - ESG 측정 ${r.esgMeasuredCompanies.toLocaleString()}개 기업 · 일본·인도 현지법인

[4중 지원 체계 — "단일 코치" 표현 금지, 항상 레이어로]
${layers}

[자체 도구 (브랜드 명칭 그대로 사용)]
${tools}

[발주처 유형: ${channel}]
${CHANNEL_TONE_PROMPT[channel]}

[키 메시지 패턴 — 제안서에 반드시 반영]
${keyMessages}

${evalBlock}

${similarBlock ? similarBlock + '\n\n' : ''}[RFP 내용]
${serializeRfp(rfp)}

[제안배경 작성 원칙]
- 600~900자 분량 (${UD_TONE_GUIDE.format}).
- 어조: ${UD_TONE_GUIDE.voice}.
- 정책→시장→현장 3단 구성 권장 (B2G), 혹은 시장→문제→기회 3단 (B2B).
- 모호한 수량 표현("많은", "다양한") 금지 → 반드시 숫자로 (${UD_TONE_GUIDE.evidence}).
- 마지막 한 문장은 약속형 결론 ("~합니다").
- "약자" 프레임 금지 — Underdog 재정의(의지로 변화를 만드는 사람) 존중.

[제안 컨셉 후보 작성 원칙]
- 정확히 3개. 서로 확연히 다른 각도여야 함.
  예시 각도: 실행 보장형 / 지역 정착형 / AI 협업형 / 글로벌 연계형 / 성과 추적형.
- title(30자 이내): 따옴표 브랜딩 + 영문 믹스 OK ("Born Global Action Week" 처럼).
- oneLiner(80자 이내): "국내 최초" / 정량 포화 / 브랜딩된 신조어 적극 활용.
- rationale(200자 이내): 왜 이 컨셉이 이 RFP 에 적합한지 구체 근거. 평가배점·목표·대상 연결.

[핵심 기획 포인트 작성 원칙]
- 정확히 3개. 각 1문장.
- 최소 2개는 평가배점 상위 2 항목에 직접 대응 (위 [평가배점 전략] 참조).
- 나머지 1개는 언더독스 강점(4중 지원·${r.totalCoaches} 코치·${r.totalGraduates.toLocaleString()} 누적 등) 활용.
- one-page-one-thesis 원칙: 각 포인트는 단 하나의 주장이 축.

[금지 (ud-brand-voice SKILL §11)]
- "AI 코치 모듈/서비스" 라고 별도 상품처럼 표현 금지. 강점 언급만.
- 법인명 "언더독스" / "유디임팩트" / "UD Impact" 혼용 금지. 본문은 "언더독스" 로 통일.
- "IMPACT" 를 "임팩트 방법론" 으로 약화 금지 (대문자 고정).
- "약자" 동정 프레임 금지.

[출력 형식 — 아래 JSON 만 반환, 마크다운 코드블록·주석·설명 금지]
{
  "proposalBackground": "600-900자 본문. 줄바꿈은 \\n 으로 이스케이프.",
  "proposalConceptCandidates": [
    { "title": "...", "oneLiner": "...", "rationale": "..." },
    { "title": "...", "oneLiner": "...", "rationale": "..." },
    { "title": "...", "oneLiner": "...", "rationale": "..." }
  ],
  "keyPlanningPoints": ["...", "...", "..."],
  "derivedChannel": "${channel}"
}

JSON 으로만 응답하세요.`
}

// ═════════════════════════════════════════════════════════════════
// 5. 내부 헬퍼 — JSON 안전 파싱 (claude.ts 의 safeParseJson 을 본 모듈 국지 복제)
// ═════════════════════════════════════════════════════════════════

/**
 * Claude 응답 텍스트에서 JSON 을 안전하게 추출·파싱.
 * (claude.ts 의 비공개 `safeParseJson` 동등 구현 — 브리프: claude.ts 기존 함수 수정 금지)
 */
export function parsePlanningDirectionJson(raw: string): PlanningDirectionResponse {
  let s = raw.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim()
  const objStart = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (objStart === -1 || end === -1 || end <= objStart) {
    throw new Error(`[planning-direction] AI 응답에서 JSON 을 찾을 수 없습니다. 응답 일부: ${s.slice(0, 200)}`)
  }
  s = s.slice(objStart, end + 1)
  try {
    return JSON.parse(s) as PlanningDirectionResponse
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`[planning-direction] JSON 파싱 실패: ${msg} (길이: ${s.length})`)
  }
}

// ═════════════════════════════════════════════════════════════════
// 6. 출력 품질 검증
// ═════════════════════════════════════════════════════════════════

/**
 * PlanningDirectionResponse 가 최소 품질 조건을 만족하는지 검사.
 * @returns 에러 메시지 (문제 있음) | null (통과)
 */
export function validatePlanningDirection(r: PlanningDirectionResponse): string | null {
  if (!r || typeof r !== 'object') return '응답이 객체가 아님'
  if (!r.proposalBackground || typeof r.proposalBackground !== 'string') return 'proposalBackground 누락'
  if (r.proposalBackground.length < 300) return 'proposalBackground 너무 짧음 (300자 미만)'
  if (!Array.isArray(r.proposalConceptCandidates) || r.proposalConceptCandidates.length !== 3) {
    return '컨셉 후보는 정확히 3개'
  }
  for (let i = 0; i < r.proposalConceptCandidates.length; i++) {
    const c = r.proposalConceptCandidates[i]
    if (!c?.title || !c?.oneLiner || !c?.rationale) {
      return `컨셉 후보 #${i + 1} 필수 필드 누락 (title/oneLiner/rationale)`
    }
  }
  if (!Array.isArray(r.keyPlanningPoints) || r.keyPlanningPoints.length !== 3) {
    return '핵심 기획 포인트는 정확히 3개'
  }
  for (let i = 0; i < r.keyPlanningPoints.length; i++) {
    if (!r.keyPlanningPoints[i] || typeof r.keyPlanningPoints[i] !== 'string') {
      return `핵심 포인트 #${i + 1} 누락`
    }
  }
  return null
}

// ═════════════════════════════════════════════════════════════════
// 7. DB 기반 채널 톤 조회 + fallback (Phase D2)
// ═════════════════════════════════════════════════════════════════

/**
 * ChannelPresetDto → 프롬프트에 삽입 가능한 톤 문자열.
 * tone + evaluatorProfile + keyMessages + avoidMessages 를 구조화.
 */
function formatToneFromPreset(preset: ChannelPresetDto): string {
  const lines: string[] = []
  lines.push(preset.tone)
  lines.push(`평가위원: ${preset.evaluatorProfile}`)
  if (preset.keyMessages.length > 0) {
    lines.push(`핵심 메시지: ${preset.keyMessages.join(' / ')}`)
  }
  if (preset.avoidMessages.length > 0) {
    lines.push(`금지 표현: ${preset.avoidMessages.join(' / ')}`)
  }
  if (preset.proposalStructure) {
    lines.push(`제안서 구조: ${preset.proposalStructure}`)
  }
  if (preset.budgetTone) {
    lines.push(`예산 톤: ${preset.budgetTone}`)
  }
  return lines.join('\n')
}

/**
 * DB ChannelPreset 을 조회하여 톤 문자열 반환.
 * DB 실패 또는 미등록 코드 → CHANNEL_TONE_PROMPT 하드코딩 fallback.
 *
 * @param channel 발주처 채널 ("B2G" | "B2B" | "renewal")
 * @returns 프롬프트에 삽입할 톤 블록 문자열
 */
export async function resolveChannelTone(channel: PlanningChannel): Promise<string> {
  try {
    // dynamic import — channel-presets 모듈의 DB 의존성을 지연 로드
    const { getChannelPreset } = await import('@/lib/channel-presets')
    const preset = await getChannelPreset(channel)
    if (preset) return formatToneFromPreset(preset)
  } catch {
    // DB 접근 실패 — fallback 으로
  }
  return CHANNEL_TONE_PROMPT[channel]
}
