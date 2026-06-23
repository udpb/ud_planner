/**
 * POST /api/projects/[id]/assistant — 워크스페이스 좌 대화 응답 (BR-WS-5)
 *
 * 전폭 2-pane 셸의 좌 대화 pane(WorkspaceChat)이 호출. 단계 인지 대화 응답을
 * invokeAi(Flash 티어, 즉답)로 1턴 생성한다. 외부 LLM 0.
 *
 * ⚠️ 이번 범위 = **대화 응답까지**. 이 버전의 브레인은 안내·해석만 한다 — 캔버스를
 * 직접 변경하는 연결(예: "코칭 비중 높여줘" → 커리큘럼 변형)은 BR-WS-6.
 * 반환 JSON 의 `action` 자리는 항상 `null`(후속 호환만, 이번엔 미사용).
 *
 * 인증: requireProjectAccess (recommend-coaches·planning-intent 동일 패턴 —
 *   PM 본인/미배정/ADMIN·DIRECTOR/dev 우회).
 * AI 호출은 invokeAi 단일 진입점만(eslint 강제). 스키마 변경 0(대화는 client state).
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAccess } from '@/lib/auth-helpers'
import { invokeAi } from '@/lib/ai-fallback'
import { AI_TOKENS, FLASH_MODEL } from '@/lib/ai/config'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/** 파이프라인 단계 id → 사람이 읽는 라벨 (프롬프트 맥락용). server-only 상수. */
const STAGE_LABEL: Record<string, string> = {
  rfp: 'RFP 분석',
  design: '프로그램 기획 (커리큘럼)',
  coach: '코치 매칭',
  budget: '예산 자동화',
  sroi: 'SROI 예측',
}

interface AssistantBody {
  message?: unknown
  stage?: unknown
  contextSummary?: unknown
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const access = await requireProjectAccess(id)
  if (!access.ok) return access.response!

  let body: AssistantBody
  try {
    body = (await req.json()) as AssistantBody
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식' }, { status: 400 })
  }

  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) {
    return NextResponse.json({ error: '메시지를 입력해주세요' }, { status: 400 })
  }
  const stageId = typeof body.stage === 'string' ? body.stage : ''
  const stageLabel = STAGE_LABEL[stageId] ?? '프로그램 기획'
  const contextSummary =
    typeof body.contextSummary === 'string' ? body.contextSummary.trim() : ''

  const prompt = `너는 언더독스(Underdogs) 교육 기획 보조다. PM 이 RFP 기반 프로그램 기획을 디벨롭하도록 돕는다.

현재 단계: ${stageLabel}${contextSummary ? `\n현재 단계 요약: ${contextSummary}` : ''}

규칙:
- 이번 버전은 **안내·해석만** 한다. 화면(캔버스)을 직접 바꾸지 않는다 — 직접 변경은 다음 버전에서 추가된다. 만약 PM 이 "이 회차를 바꿔줘" 같은 직접 변경을 요청하면, 의도를 정리해 한두 문장 방향을 제시하되 "지금은 직접 반영은 곧 추가됩니다"라고 짧게 안내한다.
- 현재 단계 맥락에 맞춰 답한다. 군더더기 없이 2~5문장, 한국어.
- 모르는 사실을 지어내지 않는다. RFP·자산 실제 값이 필요하면 PM 에게 확인을 권한다.
- 점수·합격/불합격 판정을 말하지 않는다. SROI 는 높을수록 좋은 게 아니라 가정을 비추는 렌즈임을 잊지 않는다.

PM 메시지:
${message}

위 규칙대로, 안내·해석 응답만 한국어로 작성하라. (JSON 아님 — 자연어 본문만.)`

  let reply: string
  try {
    const result = await invokeAi({
      prompt,
      maxTokens: AI_TOKENS.LIGHT,
      temperature: 0.5,
      model: FLASH_MODEL,
      label: 'workspace-assistant',
    })
    reply = result.raw.trim()
  } catch (err) {
    console.error('[assistant] invokeAi 실패:', err)
    return NextResponse.json(
      { error: '대화 응답 생성에 실패했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 502 },
    )
  }

  // action 자리는 비워둔다(BR-WS-6 에서 채움). 이번엔 항상 null.
  return NextResponse.json({ reply, action: null })
}
