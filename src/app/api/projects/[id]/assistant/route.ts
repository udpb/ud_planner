/**
 * POST /api/projects/[id]/assistant — 워크스페이스 좌 대화 응답 (BR-WS-5 · BR-WS-6)
 *
 * 전폭 2-pane 셸의 좌 대화 pane(WorkspaceChat)이 호출. 단계 인지 대화 응답을
 * invokeAi(Flash 티어, 즉답)로 1턴 생성한다. 외부 LLM 0.
 *
 * BR-WS-6 (2026-06-23) — **프로그램 기획(design) 단계만**: PM 자연어를 세션 액션
 * 배열(`SessionOp[]`)로 해석해 캔버스(커리큘럼)를 실제로 바꾼다. design 단계에서는
 * body 에 현재 세션 목록(`sessions`)을 받아 `{reply, ops}` 를 반환(ops 없으면 null=대화만).
 * **다른 단계(rfp·coach·budget·sroi)는 기존대로 `{reply, action:null}`** (ops 미포함).
 *
 * 강제 변경 금지: 세션 없으면 ops=null + 안내, 모호하면 ops=null + 되묻기. SROI·점수 판단 0.
 *
 * 인증: requireProjectAccess (recommend-coaches·planning-intent 동일 패턴 —
 *   PM 본인/미배정/ADMIN·DIRECTOR/dev 우회).
 * AI 호출은 invokeAi 단일 진입점만(eslint 강제). 스키마 변경 0(대화는 client state).
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAccess } from '@/lib/auth-helpers'
import { invokeAi } from '@/lib/ai-fallback'
import { AI_TOKENS, FLASH_MODEL } from '@/lib/ai/config'
import { safeParseJson } from '@/lib/ai/parser'
import {
  SESSION_KINDS,
  validateSessionOps,
  type SessionOp,
} from '@/lib/program-design/session-ops'

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

/** design 분기 입력 — 현재 캔버스 세션 목록(no·title·kind 만). */
interface SessionRef {
  no: string
  title: string
  kind: string
}

interface AssistantBody {
  message?: unknown
  stage?: unknown
  contextSummary?: unknown
  /** design 단계: 현재 캔버스 세션 목록(매칭 근거). */
  sessions?: unknown
}

/** body.sessions(unknown) → 신뢰 가능한 SessionRef[] (no·title·kind 만 추림). */
function parseSessionRefs(v: unknown): SessionRef[] {
  if (!Array.isArray(v)) return []
  const out: SessionRef[] = []
  for (const item of v) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    if (typeof o.no !== 'string') continue
    out.push({
      no: o.no,
      title: typeof o.title === 'string' ? o.title : '',
      kind: typeof o.kind === 'string' ? o.kind : '',
    })
  }
  return out
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

  // ── BR-WS-6: 프로그램 기획(design) 단계 — 자연어 → 세션 액션(ops) 분류 ──
  if (stageId === 'design') {
    return handleDesign(message, contextSummary, parseSessionRefs(body.sessions))
  }

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

  // action 자리는 비워둔다(design 외 단계는 ops 미사용). 이번엔 항상 null.
  return NextResponse.json({ reply, action: null })
}

// ─────────────────────────────────────────────────────────────────
// BR-WS-6 — design 단계: 자연어 → {reply, ops} 분류
// ─────────────────────────────────────────────────────────────────

/** AI 가 반환할 JSON 형태(분류 결과). ops 는 검증 전 raw. */
interface DesignClassification {
  reply?: unknown
  ops?: unknown
}

/**
 * 프로그램 기획 단계 응답.
 *   - 세션 없음(기획 시작 전) → ops=null + 안내(강제 변경 금지).
 *   - 있음 → invokeAi(Flash)로 액션 프로토콜 분류 → 검증된 ops 만 반환.
 *   - 모호/대화 의도 → AI 가 ops=null + 되묻기 reply.
 */
async function handleDesign(
  message: string,
  contextSummary: string,
  sessions: SessionRef[],
): Promise<NextResponse> {
  // 세션이 없으면(기획 시작 전) — 강제 생성 금지, 안내만.
  if (sessions.length === 0) {
    return NextResponse.json({
      reply:
        "먼저 우측 캔버스에서 '기획 시작'으로 커리큘럼을 생성해 주세요. 회차가 만들어지면 대화로 바로 바꿀 수 있어요.",
      ops: null,
    })
  }

  const sessionList = sessions
    .map((s) => `- ${s.no} · ${s.kind} · ${s.title || '(제목 없음)'}`)
    .join('\n')

  const prompt = `너는 언더독스(Underdogs) 교육 기획 보조다. PM 이 **프로그램 기획(커리큘럼) 캔버스**를 대화로 편집하도록 돕는다.

PM 의 자연어 요청을 읽고, 우측 캔버스의 회차표를 바꾸는 **세션 액션 배열(ops)**로 해석해라.

현재 회차 목록 (no · 종류 · 제목):
${sessionList}
${contextSummary ? `\n현재 단계 요약: ${contextSummary}\n` : ''}
== 출력 형식 (JSON 만, 그 외 텍스트 금지) ==
{ "reply": "PM 에게 보일 한국어 1~2문장", "ops": SessionOp[] | null }

SessionOp 종류 (정확히 이 형태만):
- { "op": "add", "title"?: string, "kind"?: SessionKind, "afterNo"?: string }   // afterNo 회차 뒤에(없으면 끝에) 새 회차
- { "op": "remove", "no": string }                                              // 회차 삭제
- { "op": "edit", "no": string, "patch": { "title"?: string, "hours"?: number|null, "format"?: string } }
- { "op": "setKind", "no": string, "kind": SessionKind }                         // 회차 종류 변경
- { "op": "reorder", "no": string, "direction": "up" | "down" }                  // 한 칸 위/아래

SessionKind = ${SESSION_KINDS.map((k) => `"${k}"`).join(' | ')}

해석 규칙:
- "no" 는 **반드시 위 목록에 있는 정확한 라벨**만 사용해라(예: 'W3'). 목록에 없는 회차를 지어내지 마라.
- "4회차를 실습으로" → setKind {no: 해당 라벨, kind: "workshop"}.
- "코칭 비중 높여줘" → 이론/워크숍 일부를 setKind:"coaching" 여러 op (현재 코칭이 아닌 회차 중 일부).
- "마지막에 발표회 추가" → add {title:"성과 발표회", kind:"event"} (afterNo 생략 = 끝).
- 단순 질문·방향 상담 등 **편집 의도가 아니면 ops=null** 로 두고 reply 로만 답해라.
- **요청이 모호하면(어느 회차인지 불명확 등) ops=null + 되묻는 reply** — 함부로 바꾸지 마라(PM 확인 우선).
- 점수·합격/불합격 판정 금지. SROI 는 높을수록 좋은 게 아니라 가정을 비추는 렌즈다 — 판단하지 마라.
- reply 는 무엇을 바꿨는지(또는 왜 안 바꿨는지) 짧게. 군더더기 없이 한국어.

PM 메시지:
${message}

위 형식의 JSON 객체 하나만 출력하라.`

  let parsed: DesignClassification
  try {
    const result = await invokeAi({
      prompt,
      maxTokens: AI_TOKENS.STANDARD,
      temperature: 0.3,
      model: FLASH_MODEL,
      label: 'workspace-assistant-design',
    })
    parsed = safeParseJson<DesignClassification>(result.raw, 'workspace-assistant-design')
  } catch (err) {
    console.error('[assistant:design] invokeAi/parse 실패:', err)
    return NextResponse.json(
      { error: '대화 응답 생성에 실패했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 502 },
    )
  }

  const reply =
    typeof parsed.reply === 'string' && parsed.reply.trim()
      ? parsed.reply.trim()
      : '요청을 이해하지 못했어요. 어느 회차를 어떻게 바꿀지 조금 더 구체적으로 알려 주세요.'

  // ops 검증 — 허용 op·kind enum·필드 타입. 통과 못한 항목은 drop.
  const validated: SessionOp[] = validateSessionOps(parsed.ops)
  // no 존재 검증: 현재 세션에 없는 no 를 가리키는 op(add 제외)는 제거(환각 방지).
  const knownNos = new Set(sessions.map((s) => s.no))
  const safeOps = validated.filter((op) => {
    if (op.op === 'add') {
      // afterNo 가 있고 목록에 없으면 무시(끝에 추가로 폴백되지만, 의도 보존 위해 afterNo 만 비움).
      if (op.afterNo && !knownNos.has(op.afterNo)) {
        delete (op as { afterNo?: string }).afterNo
      }
      return true
    }
    return knownNos.has(op.no)
  })

  // 검증 후 적용할 op 가 하나도 없으면 ops=null(대화만) — 빈 배열로 캔버스 헛갱신 방지.
  return NextResponse.json({
    reply,
    ops: safeOps.length > 0 ? safeOps : null,
  })
}
