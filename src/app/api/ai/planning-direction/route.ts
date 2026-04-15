/**
 * POST /api/ai/planning-direction  (stateless)
 *
 * RFP 파싱 결과 + 평가배점 전략 + (옵션) 유사 프로젝트 → Claude 호출 →
 * 제안배경 초안 / 컨셉 후보 3개 / 핵심 기획 포인트 3개 반환.
 *
 * 저장 ❌ — PM 이 UI(B4 step-rfp)에서 확정한 후 별도 PATCH /api/projects/[id]/rfp 로 저장됨.
 *
 * 관련 문서:
 *   - 브리프: `.claude/agent-briefs/redesign/B1-planning-direction-ai.md`
 *   - 데이터 계약: `docs/architecture/data-contract.md` §1.2 RfpSlice
 *   - 브랜드 보이스: `.claude/skills/ud-brand-voice/SKILL.md`
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { anthropic, CLAUDE_MODEL, type RfpParsed } from '@/lib/claude'
import type { SimilarProject } from '@/lib/pipeline-context'
import {
  buildPlanningDirectionPrompt,
  deriveChannel,
  parsePlanningDirectionJson,
  validatePlanningDirection,
  type EvalStrategyLike,
  type PlanningDirectionRequest,
  type PlanningDirectionResponse,
} from '@/lib/planning-direction'

// ─────────────────────────────────────────
// B3 유틸 (src/lib/eval-strategy.ts) 동적 로더
//
// Wave 1 병렬 작업 중 B3 파일이 아직 없을 수 있음.
// 런타임에서 optional 로 로드 → 실패 시 evalStrategy 없이 프롬프트 구성.
// TypeScript 빌드 시점에 파일이 없어도 dynamic import + catch 로 안정.
// ─────────────────────────────────────────
async function loadEvalStrategy(
  evalCriteria: RfpParsed['evalCriteria'] | undefined,
): Promise<EvalStrategyLike | null> {
  if (!evalCriteria || evalCriteria.length === 0) return null
  try {
    // B3 모듈 로드 — 존재하지 않으면 catch 로 흘려 graceful fallback.
    const mod = (await import('@/lib/eval-strategy')) as {
      analyzeEvalStrategy?: (c: unknown) => EvalStrategyLike | null
    }
    if (typeof mod.analyzeEvalStrategy !== 'function') return null
    const result = mod.analyzeEvalStrategy(evalCriteria)
    return result ?? null
  } catch {
    return null
  }
}

// ─────────────────────────────────────────
// Claude 호출 + 품질 검증 (재시도 1회)
// ─────────────────────────────────────────
async function generatePlanningDirection(
  prompt: string,
): Promise<{ ok: true; data: PlanningDirectionResponse } | { ok: false; error: string; raw?: string }> {
  let lastError = 'Unknown error'
  let lastRaw = ''

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const msg = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: attempt === 1
              ? prompt
              : prompt + '\n\n[재시도 지침] 이전 응답이 품질 기준(3+3 개수·필수 필드)을 통과하지 못했습니다. JSON 형식을 엄격히 지키고, 컨셉 3개·포인트 3개를 반드시 채우세요.',
          },
        ],
      })

      const block = msg.content[0]
      const raw = block && 'text' in block ? (block as { text: string }).text.trim() : ''
      lastRaw = raw

      const parsed = parsePlanningDirectionJson(raw)
      const validationError = validatePlanningDirection(parsed)
      if (validationError) {
        lastError = `품질 검증 실패: ${validationError}`
        continue
      }
      return { ok: true, data: parsed }
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err)
    }
  }
  return { ok: false, error: lastError, raw: lastRaw }
}

// ─────────────────────────────────────────
// POST 핸들러
// ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  // 인증
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 요청 파싱
  let body: PlanningDirectionRequest
  try {
    body = (await req.json()) as PlanningDirectionRequest
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 })
  }

  const projectId = body.projectId?.trim()
  if (!projectId) {
    return NextResponse.json({ error: 'PROJECT_ID_REQUIRED' }, { status: 400 })
  }

  // 프로젝트 조회 + rfpParsed 확보
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, rfpParsed: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'PROJECT_NOT_FOUND' }, { status: 404 })
  }
  if (!project.rfpParsed) {
    return NextResponse.json({ error: 'RFP_NOT_PARSED' }, { status: 400 })
  }

  const rfp = project.rfpParsed as unknown as RfpParsed

  // 채널 판별 + 평가배점 전략 분석 (B3)
  const channel = deriveChannel(rfp)
  const evalStrategy = await loadEvalStrategy(rfp.evalCriteria)

  // 유사 프로젝트 (선택적 — 클라이언트가 B2 호출 결과를 보내준 경우)
  const similarProjects: SimilarProject[] | undefined = Array.isArray(body.similarProjects)
    ? body.similarProjects
    : undefined

  // 프롬프트 조립
  const prompt = buildPlanningDirectionPrompt(rfp, channel, evalStrategy, similarProjects)

  // AI 호출 + 품질 검증 (재시도 1회)
  const result = await generatePlanningDirection(prompt)

  if (!result.ok) {
    console.error('[planning-direction] 생성 실패:', result.error)
    return NextResponse.json(
      {
        error: 'AI_GENERATION_FAILED',
        message: result.error,
        ...(process.env.NODE_ENV !== 'production' && result.raw ? { raw: result.raw.slice(0, 2000) } : {}),
      },
      { status: 500 },
    )
  }

  // 파생 채널이 없거나 유효하지 않으면 서버 추정값으로 보강
  const response: PlanningDirectionResponse = {
    ...result.data,
    derivedChannel:
      result.data.derivedChannel === 'B2G' ||
      result.data.derivedChannel === 'B2B' ||
      result.data.derivedChannel === 'renewal'
        ? result.data.derivedChannel
        : channel,
  }

  return NextResponse.json(response)
}
