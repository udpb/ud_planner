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
import { validateStageOps, type StageOp } from '@/lib/program-design/stage-ops'

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

/** BR-WS-19: 비회차(T4/T5) 분기 입력 — 현재 캔버스 단계 목록(label·content 만). 위치는 1-based 순서. */
interface StageRef {
  /** 1-based 위치(StageList 화면 번호와 동일). */
  at: number
  label: string
  content: string
}

interface AssistantBody {
  message?: unknown
  stage?: unknown
  contextSummary?: unknown
  /**
   * BR-WS-19: 현재 구조 종류 — 'sessions'(T1~T3 회차표) | 'nonsession'(T4/T5 단계).
   * 없으면 'sessions' 가정(기존 호환).
   */
  structureKind?: unknown
  /** design 단계: 현재 캔버스 세션 목록(매칭 근거, sessions 구조). */
  sessions?: unknown
  /** BR-WS-19: 현재 캔버스 단계 목록(비회차 구조). */
  stages?: unknown
  /** BR-WS-17: 직전 대화 history(맥락 유지) — {role, text}[] 최근 N턴. */
  history?: unknown
}

/** BR-WS-17: 프롬프트 맥락용 대화 1턴(서버가 신뢰하는 형태). */
interface HistoryTurn {
  role: 'user' | 'assistant'
  text: string
}

/** body.history(unknown) → 신뢰 가능한 HistoryTurn[] (역할·텍스트만, 최근 8턴·길이 컷). */
function parseHistory(v: unknown): HistoryTurn[] {
  if (!Array.isArray(v)) return []
  const out: HistoryTurn[] = []
  for (const item of v) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const role = o.role === 'user' || o.role === 'assistant' ? o.role : null
    if (!role) continue
    if (typeof o.text !== 'string') continue
    const text = o.text.trim()
    if (!text) continue
    // 한 턴 길이 컷(프롬프트 폭주 방지) — 600자.
    out.push({ role, text: text.length > 600 ? text.slice(0, 600) + '…' : text })
  }
  // 최근 8턴만(앞에서 잘라 최신 유지).
  return out.slice(-8)
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

/**
 * body.stages(unknown) → 신뢰 가능한 StageRef[] (label·content 만 추림).
 * 위치(at)는 배열 순서로 1-based 부여 — 클라가 보내는 at 은 신뢰하지 않고 순서로 재계산.
 */
function parseStageRefs(v: unknown): StageRef[] {
  if (!Array.isArray(v)) return []
  const out: StageRef[] = []
  for (const item of v) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    out.push({
      at: out.length + 1,
      label: typeof o.label === 'string' ? o.label : '',
      content: typeof o.content === 'string' ? o.content : '',
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

  // ── BR-WS-6/17/19: 프로그램 기획(design) 단계 — 자연어 → 액션(ops) / 카드(choices) ──
  // 구조 종류로 분기: sessions(T1~T3 회차표) → SessionOp / nonsession(T4/T5 단계) → StageOp.
  if (stageId === 'design') {
    const structureKind = body.structureKind === 'nonsession' ? 'nonsession' : 'sessions'
    if (structureKind === 'nonsession') {
      return handleDesignStages(
        message,
        contextSummary,
        parseStageRefs(body.stages),
        parseHistory(body.history),
      )
    }
    return handleDesign(
      message,
      contextSummary,
      parseSessionRefs(body.sessions),
      parseHistory(body.history),
    )
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
// BR-WS-6/17 — design 단계: 자연어 → {reply, ops, choices} (맥락·행동 우선·카드)
// ─────────────────────────────────────────────────────────────────

/** AI 가 반환할 JSON 형태(분류 결과). ops·choices 는 검증 전 raw. */
interface DesignClassification {
  reply?: unknown
  ops?: unknown
  choices?: unknown
}

/** PM 에게 보일 선택 카드 1개 (검증 후 — ops 는 최소 1건 보장). */
interface DesignChoice {
  label: string
  sub?: string
  ops: SessionOp[]
}

/**
 * AI 가 낸 choices(unknown) → 검증된 DesignChoice[].
 *   - label 문자열 필수.
 *   - 각 ops 는 validateSessionOps + no 존재(knownNos)로 거른다(불량 op drop).
 *   - 적용할 op 이 0건이 된 choice 는 drop(빈 카드 금지).
 */
function validateChoices(v: unknown, knownNos: Set<string>): DesignChoice[] {
  if (!Array.isArray(v)) return []
  const out: DesignChoice[] = []
  for (const item of v) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    if (typeof o.label !== 'string' || !o.label.trim()) continue
    const ops = filterKnownOps(validateSessionOps(o.ops), knownNos)
    if (ops.length === 0) continue // 적용할 게 없는 카드는 버린다.
    const choice: DesignChoice = { label: o.label.trim(), ops }
    if (typeof o.sub === 'string' && o.sub.trim()) choice.sub = o.sub.trim()
    out.push(choice)
    if (out.length >= 3) break // 카드는 최대 3개.
  }
  return out
}

/**
 * 검증된 ops 중 현재 세션에 실제 존재하는 no 만 통과(환각 방지).
 *   - add 는 파괴적이지 않으므로 통과(afterNo 가 없는 라벨이면 끝 추가로 폴백 — afterNo 만 비움).
 *   - remove/edit/setKind/reorder 는 knownNos 에 있는 no 만.
 */
function filterKnownOps(ops: SessionOp[], knownNos: Set<string>): SessionOp[] {
  return ops.filter((op) => {
    if (op.op === 'add') {
      if (op.afterNo && !knownNos.has(op.afterNo)) {
        delete (op as { afterNo?: string }).afterNo
      }
      return true
    }
    return knownNos.has(op.no)
  })
}

/**
 * 프로그램 기획 단계 응답(BR-WS-17).
 *   - 세션 없음(기획 시작 전) → ops/choices=null + 안내(강제 변경 금지).
 *   - 있음 → invokeAi(Flash)로 분류 → **행동 우선**: 명확하면 ops(즉시 적용),
 *     결정/추천이면 choices(카드 2~3개·각 ops 사전계산). 둘 다 검증된 것만 반환.
 *   - 정말 불가능할 때만 ops/choices 없이 reply 로 1회 되물음.
 *   - history 로 직전 맥락 유지("8회차로 줄여줘" → "너가 추천해줘" 연결).
 */
async function handleDesign(
  message: string,
  contextSummary: string,
  sessions: SessionRef[],
  history: HistoryTurn[],
): Promise<NextResponse> {
  // 세션이 없으면(기획 시작 전) — 강제 생성 금지, 안내만.
  if (sessions.length === 0) {
    return NextResponse.json({
      reply:
        "먼저 우측 캔버스에서 '기획 시작'으로 커리큘럼을 생성해 주세요. 회차가 만들어지면 대화로 바로 바꿀 수 있어요.",
      ops: null,
      choices: null,
    })
  }

  const sessionList = sessions
    .map((s) => `- ${s.no} · ${s.kind} · ${s.title || '(제목 없음)'}`)
    .join('\n')

  // BR-WS-17: 직전 대화를 프롬프트에 넣어 맥락 유지(되묻기 루프 방지).
  const historyBlock =
    history.length > 0
      ? `이전 대화 (오래된→최신, 맥락 유지에 사용):\n${history
          .map((t) => `${t.role === 'user' ? 'PM' : '보조'}: ${t.text}`)
          .join('\n')}\n\n`
      : ''

  const prompt = `너는 언더독스(Underdogs) 교육 기획 **공동기획자**다. PM 이 **프로그램 기획(커리큘럼) 캔버스**를 대화로 편집하도록, 되묻지 말고 **구체적으로 행동**해서 돕는다.

${historyBlock}현재 회차 목록 (no · 종류 · 제목):
${sessionList}
${contextSummary ? `\n현재 단계 요약: ${contextSummary}\n` : ''}
== 출력 형식 (JSON 객체 하나만, 그 외 텍스트 금지) ==
{
  "reply": "PM 에게 보일 한국어 1~2문장",
  "ops": SessionOp[] | null,        // 명확한 직접 지시 → 즉시 적용
  "choices": [ { "label": string, "sub"?: string, "ops": SessionOp[] } ] | null  // 결정/추천 필요 → 카드 2~3개
}

SessionOp 종류 (정확히 이 형태만):
- { "op": "add", "title"?: string, "kind"?: SessionKind, "afterNo"?: string }   // afterNo 회차 뒤에(없으면 끝에) 새 회차
- { "op": "remove", "no": string }                                              // 회차 삭제
- { "op": "edit", "no": string, "patch": { "title"?: string, "hours"?: number|null, "format"?: string } }
- { "op": "setKind", "no": string, "kind": SessionKind }                         // 회차 종류 변경
- { "op": "reorder", "no": string, "direction": "up" | "down" }                  // 한 칸 위/아래

SessionKind = ${SESSION_KINDS.map((k) => `"${k}"`).join(' | ')}

행동 우선 규칙 (가장 중요):
- PM 이 변경·추천을 원하면 **반드시 구체적으로 행동**한다 — ops(직접) 또는 choices(2~3안). "균형이 잘 잡혀 있다" 같은 회피, 요청과 무관한 추천(예: 묻지도 않은 '사전학습 추가') **금지**. **요청한 작업 그 자체**(예: 회차 줄이기)에 답하라.
- **명확한 직접 지시**("4회차 실습으로", "마지막에 발표회 추가") → ops 로 즉시.
- **"N회차로 줄여줘"** → 현재 회차 중 통합/제외할 **구체 안 2~3개**를 choices 로(각 ops 는 목표 개수에 도달하도록 remove/edit 조합, label 은 어떤 회차를 어떻게 줄이는지 한 줄).
- **"늘려줘"** → add 조합 안.
- **"너가 추천해줘 / 추천안 줘"** → 직전 대화 맥락의 작업에 대한 **구체 추천**: 최선 1안이면 ops, 비교 필요하면 choices 2~3개. **절대 되묻지 마라.**
- 정말 어떤 행동도 불가능할 때(목록·맥락만으로 도저히 못 정함)만 ops·choices 둘 다 null 로 두고 reply 로 **딱 1회** 되묻는다.

기타 규칙:
- "no" 는 **반드시 위 목록에 있는 정확한 라벨**만(예: 'W3'). 목록에 없는 회차 지어내지 마라.
- 점수·합격/불합격 판정 금지. SROI 는 높을수록 좋은 게 아니라 가정을 비추는 렌즈다 — 단정하지 마라.
- reply 는 무엇을 했는지(또는 카드 중 골라달라는 안내) 짧게. 군더더기 없이 한국어.

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

  const knownNos = new Set(sessions.map((s) => s.no))

  // ops 검증 — 허용 op·kind enum·필드 타입 + 존재하는 no 만(환각 방지).
  const safeOps = filterKnownOps(validateSessionOps(parsed.ops), knownNos)

  // choices 검증 — 각 카드 ops 를 동일 게이트로(불량/빈 카드 drop). ops 가 있으면 카드는 무시(중복 방지).
  const safeChoices = safeOps.length > 0 ? [] : validateChoices(parsed.choices, knownNos)

  // 검증 후 적용할 op 가 하나도 없으면 ops=null(대화만) — 빈 배열로 캔버스 헛갱신 방지.
  return NextResponse.json({
    reply,
    ops: safeOps.length > 0 ? safeOps : null,
    choices: safeChoices.length > 0 ? safeChoices : null,
  })
}

// ─────────────────────────────────────────────────────────────────
// BR-WS-19 — design 단계(비회차 T4/T5): 자연어 → {reply, ops, choices}
//   handleDesign(회차표)의 미러. 참조는 1-based 위치 `at`(stage 엔 id 없음).
// ─────────────────────────────────────────────────────────────────

/** PM 에게 보일 선택 카드 1개(비회차 — ops 는 StageOp[], 최소 1건 보장). */
interface StageChoice {
  label: string
  sub?: string
  ops: StageOp[]
}

/**
 * 검증된 StageOp 중 현재 단계 수(stageCount) 안의 at 만 통과(환각 방지).
 *   - add 는 파괴적이지 않으므로 통과(afterAt 가 범위 밖이면 라벨만 비워 끝 추가로 폴백).
 *   - remove/edit/reorder 는 at ∈ [1, stageCount] 인 것만.
 */
function filterKnownStageOps(ops: StageOp[], stageCount: number): StageOp[] {
  return ops.filter((op) => {
    if (op.op === 'add') {
      if (op.afterAt !== undefined && (op.afterAt < 1 || op.afterAt > stageCount)) {
        delete (op as { afterAt?: number }).afterAt
      }
      return true
    }
    return op.at >= 1 && op.at <= stageCount
  })
}

/**
 * AI 가 낸 choices(unknown) → 검증된 StageChoice[].
 *   - label 문자열 필수.
 *   - 각 ops 는 validateStageOps + 범위 밖 at drop(filterKnownStageOps)로 거른다.
 *   - 적용할 op 이 0건이 된 choice 는 drop(빈 카드 금지). 최대 3개.
 */
function validateStageChoices(v: unknown, stageCount: number): StageChoice[] {
  if (!Array.isArray(v)) return []
  const out: StageChoice[] = []
  for (const item of v) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    if (typeof o.label !== 'string' || !o.label.trim()) continue
    const ops = filterKnownStageOps(validateStageOps(o.ops), stageCount)
    if (ops.length === 0) continue
    const choice: StageChoice = { label: o.label.trim(), ops }
    if (typeof o.sub === 'string' && o.sub.trim()) choice.sub = o.sub.trim()
    out.push(choice)
    if (out.length >= 3) break
  }
  return out
}

/**
 * 비회차(T4/T5) 프로그램 기획 단계 응답(handleDesign 미러, 행동 우선).
 *   - 단계 없음(구조 생성 전) → ops/choices=null + 안내(강제 변경 금지).
 *   - 있음 → invokeAi(Flash)로 분류 → 명확하면 ops(즉시), 결정/추천이면 choices(카드).
 *     둘 다 검증된 것만 반환(범위 밖 at drop). 정말 불가능할 때만 reply 로 1회 되물음.
 *   - history 로 직전 맥락 유지.
 */
async function handleDesignStages(
  message: string,
  contextSummary: string,
  stages: StageRef[],
  history: HistoryTurn[],
): Promise<NextResponse> {
  // 단계가 없으면(구조 생성 전) — 강제 생성 금지, 안내만.
  if (stages.length === 0) {
    return NextResponse.json({
      reply:
        "먼저 우측 캔버스에서 '기획 시작'으로 단계 구조를 생성해 주세요. 단계가 만들어지면 대화로 바로 바꿀 수 있어요.",
      ops: null,
      choices: null,
    })
  }

  const stageList = stages
    .map((s) => `- ${s.at}. ${s.label || '(제목 없음)'}${s.content ? ` — ${s.content}` : ''}`)
    .join('\n')

  // BR-WS-17: 직전 대화를 프롬프트에 넣어 맥락 유지(되묻기 루프 방지).
  const historyBlock =
    history.length > 0
      ? `이전 대화 (오래된→최신, 맥락 유지에 사용):\n${history
          .map((t) => `${t.role === 'user' ? 'PM' : '보조'}: ${t.text}`)
          .join('\n')}\n\n`
      : ''

  const prompt = `너는 언더독스(Underdogs) 교육 기획 **공동기획자**다. PM 이 **비회차(개별 밀착·행사 운영) 프로그램 단계 캔버스**를 대화로 편집하도록, 되묻지 말고 **구체적으로 행동**해서 돕는다. 이 구조는 회차표가 아니라 **순서가 있는 단계(stage) 목록**이다.

${historyBlock}현재 단계 목록 (번호 · 라벨 — 내용):
${stageList}
${contextSummary ? `\n현재 단계 요약: ${contextSummary}\n` : ''}
== 출력 형식 (JSON 객체 하나만, 그 외 텍스트 금지) ==
{
  "reply": "PM 에게 보일 한국어 1~2문장",
  "ops": StageOp[] | null,        // 명확한 직접 지시 → 즉시 적용
  "choices": [ { "label": string, "sub"?: string, "ops": StageOp[] } ] | null  // 결정/추천 필요 → 카드 2~3개
}

StageOp 종류 (정확히 이 형태만 — 단계 참조는 위 목록의 **번호(1-based 위치 at)**):
- { "op": "add", "label"?: string, "content"?: string, "afterAt"?: number }   // afterAt 번호 뒤에(없으면 끝에) 새 단계
- { "op": "remove", "at": number }                                            // 단계 삭제
- { "op": "edit", "at": number, "patch": { "label"?: string, "content"?: string, "rationale"?: string } }
- { "op": "reorder", "at": number, "direction": "up" | "down" }               // 한 칸 위/아래

행동 우선 규칙 (가장 중요):
- PM 이 변경·추천을 원하면 **반드시 구체적으로 행동**한다 — ops(직접) 또는 choices(2~3안). "잘 짜여 있다" 같은 회피, 요청과 무관한 추천 **금지**. **요청한 작업 그 자체**에 답하라.
- **명확한 직접 지시**("2번 단계 내용 이렇게 바꿔줘", "마지막에 성과공유회 추가") → ops 로 즉시.
- **"N단계로 줄여줘"** → 통합/제외할 **구체 안 2~3개**를 choices 로(각 ops 는 목표 개수에 도달하도록 remove/edit 조합).
- **"늘려줘"** → add 조합 안.
- **"너가 추천해줘 / 추천안 줘"** → 직전 대화 맥락의 작업에 대한 **구체 추천**: 최선 1안이면 ops, 비교 필요하면 choices 2~3개. **절대 되묻지 마라.**
- 정말 어떤 행동도 불가능할 때만 ops·choices 둘 다 null 로 두고 reply 로 **딱 1회** 되묻는다.

기타 규칙:
- "at" 은 **반드시 위 목록에 있는 번호**만(1부터 ${stages.length}까지). 없는 단계 지어내지 마라.
- 점수·합격/불합격 판정 금지. SROI 는 높을수록 좋은 게 아니라 가정을 비추는 렌즈다 — 단정하지 마라.
- reply 는 무엇을 했는지(또는 카드 중 골라달라는 안내) 짧게. 군더더기 없이 한국어.

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
      label: 'workspace-assistant-design-stages',
    })
    parsed = safeParseJson<DesignClassification>(result.raw, 'workspace-assistant-design-stages')
  } catch (err) {
    console.error('[assistant:design-stages] invokeAi/parse 실패:', err)
    return NextResponse.json(
      { error: '대화 응답 생성에 실패했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 502 },
    )
  }

  const reply =
    typeof parsed.reply === 'string' && parsed.reply.trim()
      ? parsed.reply.trim()
      : '요청을 이해하지 못했어요. 어느 단계를 어떻게 바꿀지 조금 더 구체적으로 알려 주세요.'

  // ops 검증 — 허용 op·필드 타입 + 범위 안 at 만(환각 방지).
  const safeOps = filterKnownStageOps(validateStageOps(parsed.ops), stages.length)

  // choices 검증 — 각 카드 ops 를 동일 게이트로(불량/빈 카드 drop). ops 가 있으면 카드는 무시(중복 방지).
  const safeChoices = safeOps.length > 0 ? [] : validateStageChoices(parsed.choices, stages.length)

  return NextResponse.json({
    reply,
    ops: safeOps.length > 0 ? safeOps : null,
    choices: safeChoices.length > 0 ? safeChoices : null,
  })
}
