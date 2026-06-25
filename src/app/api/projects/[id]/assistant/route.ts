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
import {
  validateBudgetOps,
  type BudgetLineRef,
  type BudgetOp,
} from '@/lib/program-design/budget-ops'
import {
  ASSIGNMENT_ROLES,
  validateCoachOps,
  type CoachOp,
  type CoachPoolRef,
  type CoachTeamRef,
} from '@/lib/coaches/coach-ops'

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
  /** BR-WS-22: 예산 단계 — 현재 적산 라인(매칭 근거·환각 방지). {section,label,amount}[]. */
  budgetLines?: unknown
  /** BR-WS-22: 예산 단계 — 현재 마진율(0~1, OR/R'). 근거 문구용(단정·강제 금지). */
  marginRate?: unknown
  /** BR-WS-24: 코치 단계 — 현재 추천 풀(coachId·name·단가·강점·점수). assign/swap 근거·환각 방지. */
  coachPool?: unknown
  /** BR-WS-24: 코치 단계 — 현재 선발팀(assignmentId·coachId·coachName·role). remove/swap 근거·환각 방지. */
  coachTeam?: unknown
  /** BR-WS-24: 코치 단계 — 필요 코치 수 N(Live Plan). 근거 문구용(단정·강제 금지). */
  requiredN?: unknown
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

/**
 * body.budgetLines(unknown) → 신뢰 가능한 BudgetLineRef[] (section·label·amount 만 추림).
 * label 없거나 section 이 AC/PC 아니면 drop. amount 는 유한 number 아니면 0.
 */
function parseBudgetLineRefs(v: unknown): BudgetLineRef[] {
  if (!Array.isArray(v)) return []
  const out: BudgetLineRef[] = []
  for (const item of v) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const section = o.section === 'AC' || o.section === 'PC' ? o.section : null
    if (!section) continue
    if (typeof o.label !== 'string' || !o.label.trim()) continue
    out.push({
      section,
      label: o.label.trim(),
      amount:
        typeof o.amount === 'number' && Number.isFinite(o.amount) ? o.amount : 0,
    })
  }
  return out
}

/**
 * body.coachPool(unknown) → 신뢰 가능한 CoachPoolRef[] (coachId·name·단가·강점·점수 추림).
 * coachId 없으면 drop. coachRateMain 은 유한 양수 number 아니면 null. matchScore 는 number 아니면 0.
 */
function parseCoachPoolRefs(v: unknown): CoachPoolRef[] {
  if (!Array.isArray(v)) return []
  const out: CoachPoolRef[] = []
  for (const item of v) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    if (typeof o.coachId !== 'string' || !o.coachId.trim()) continue
    out.push({
      coachId: o.coachId.trim(),
      name: typeof o.name === 'string' ? o.name : '',
      coachRateMain:
        typeof o.coachRateMain === 'number' && Number.isFinite(o.coachRateMain) && o.coachRateMain > 0
          ? o.coachRateMain
          : null,
      strengthOneLiner: typeof o.strengthOneLiner === 'string' ? o.strengthOneLiner : '',
      matchScore:
        typeof o.matchScore === 'number' && Number.isFinite(o.matchScore) ? o.matchScore : 0,
    })
  }
  return out
}

/**
 * body.coachTeam(unknown) → 신뢰 가능한 CoachTeamRef[] (assignmentId·coachId·coachName·role 추림).
 * assignmentId 없으면 drop.
 */
function parseCoachTeamRefs(v: unknown): CoachTeamRef[] {
  if (!Array.isArray(v)) return []
  const out: CoachTeamRef[] = []
  for (const item of v) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    if (typeof o.assignmentId !== 'string' || !o.assignmentId.trim()) continue
    out.push({
      assignmentId: o.assignmentId.trim(),
      coachId: typeof o.coachId === 'string' ? o.coachId : '',
      coachName: typeof o.coachName === 'string' ? o.coachName : '',
      role: typeof o.role === 'string' ? o.role : '',
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

  // ── BR-WS-22: 예산 자동화(budget) 단계 — 자연어 → 라인 override(ops) / 조정안 카드(choices) ──
  // design 미러: 현재 적산 라인 동봉 → knownLabels 필터로 환각 차단. ops 있으면 choices 무시.
  if (stageId === 'budget') {
    const marginRate =
      typeof body.marginRate === 'number' && Number.isFinite(body.marginRate)
        ? body.marginRate
        : null
    return handleBudget(
      message,
      contextSummary,
      parseBudgetLineRefs(body.budgetLines),
      marginRate,
      parseHistory(body.history),
    )
  }

  // ── BR-WS-24: 코치 매칭(coach) 단계 — 자연어 → 배정/교체/제거(ops) / 후보 카드(choices) ──
  // budget 미러: 추천 풀·선발팀 동봉 → knownIds 필터로 환각 차단. apply 는 ProgramWorkspace 가
  // 기존 coach-assignments POST/DELETE 로(서버 영속) — route 는 검증된 CoachOp 만 반환.
  if (stageId === 'coach') {
    const requiredN =
      typeof body.requiredN === 'number' && Number.isFinite(body.requiredN) && body.requiredN > 0
        ? Math.round(body.requiredN)
        : null
    return handleCoach(
      message,
      contextSummary,
      parseCoachPoolRefs(body.coachPool),
      parseCoachTeamRefs(body.coachTeam),
      requiredN,
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

// ─────────────────────────────────────────────────────────────────
// BR-WS-22 — 예산 자동화(budget) 단계: 자연어 → {reply, ops, choices}
//   handleDesign 의 미러. 참조는 라인 라벨(section+label). 라인 override 만 —
//   적산 엔진·단가표 무변경(BudgetCalcCanvas 가 합으로 OR/마진 재계산).
// ─────────────────────────────────────────────────────────────────

/** PM 에게 보일 예산 조정 카드 1개(ops 는 BudgetOp[], 최소 1건 보장). */
interface BudgetChoice {
  label: string
  sub?: string
  ops: BudgetOp[]
}

/** section+label 키 정규화(knownLabels 셋·필터 동일 규칙). */
function lineKey(section: 'AC' | 'PC', label: string): string {
  return `${section}::${label}`
}

/**
 * 검증된 BudgetOp 중 현재 라인에 실제 존재하는 (section,label) 만 통과(환각 방지).
 *   - filterKnownOps(design) 미러. setLine·resetLine 모두 라벨이 현재 라인에 있어야 통과.
 *   - 없는 라벨을 가리키는 op 는 drop(엔진이 안 만든 라인을 지어내지 못하게).
 */
function filterKnownBudgetOps(ops: BudgetOp[], knownLabels: Set<string>): BudgetOp[] {
  return ops.filter((op) => knownLabels.has(lineKey(op.section, op.label)))
}

/**
 * AI 가 낸 choices(unknown) → 검증된 BudgetChoice[].
 *   - label 문자열 필수.
 *   - 각 ops 는 validateBudgetOps + knownLabels 필터로 거른다(불량/환각 op drop).
 *   - 적용할 op 이 0건이 된 choice 는 drop(빈 카드 금지). 최대 3개.
 */
function validateBudgetChoices(v: unknown, knownLabels: Set<string>): BudgetChoice[] {
  if (!Array.isArray(v)) return []
  const out: BudgetChoice[] = []
  for (const item of v) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    if (typeof o.label !== 'string' || !o.label.trim()) continue
    const ops = filterKnownBudgetOps(validateBudgetOps(o.ops), knownLabels)
    if (ops.length === 0) continue // 적용할 게 없는 카드는 버린다.
    const choice: BudgetChoice = { label: o.label.trim(), ops }
    if (typeof o.sub === 'string' && o.sub.trim()) choice.sub = o.sub.trim()
    out.push(choice)
    if (out.length >= 3) break // 카드는 최대 3개.
  }
  return out
}

/**
 * 예산 자동화 단계 응답(handleDesign 미러, 행동 우선).
 *   - 라인 없음(적산 전) → ops/choices=null + 안내(강제 변경 금지).
 *   - 있음 → invokeAi(Flash)로 분류 → 명확하면 ops(즉시 적용), 조정안이면 choices(카드 2~3개).
 *     둘 다 검증 + knownLabels 필터(환각 라벨 drop). ops 있으면 choices 무시(중복 방지).
 *   - ADR-030 관찰 분할(AC≈60%·PC≈8%·OR≈16% of DR)은 **근거 문구**로만(단정·강제 금지).
 *   - history 로 직전 맥락 유지("운영비 줄여줘" → "너가 추천해줘" 연결).
 */
async function handleBudget(
  message: string,
  contextSummary: string,
  budgetLines: BudgetLineRef[],
  marginRate: number | null,
  history: HistoryTurn[],
): Promise<NextResponse> {
  // 라인이 없으면(적산 전 — 회차·코치 미입력) 강제 생성 금지, 안내만.
  if (budgetLines.length === 0) {
    return NextResponse.json({
      reply:
        '아직 적산된 예산 라인이 없어요. 프로그램 기획(회차)·코치 매칭을 먼저 진행하면 코칭료·운영비 등 라인이 채워지고, 그때 대화로 바로 조정할 수 있어요.',
      ops: null,
      choices: null,
    })
  }

  const acList = budgetLines.filter((l) => l.section === 'AC')
  const pcList = budgetLines.filter((l) => l.section === 'PC')
  const fmtLine = (l: BudgetLineRef) =>
    `- [${l.section}] ${l.label} = ${Math.round(l.amount).toLocaleString()}원`
  const lineBlock = [...acList, ...pcList].map(fmtLine).join('\n')

  const marginBlock =
    marginRate !== null
      ? `\n현재 마진율(OR/R'): ${(marginRate * 100).toFixed(1)}%`
      : ''

  // BR-WS-17: 직전 대화를 프롬프트에 넣어 맥락 유지(되묻기 루프 방지).
  const historyBlock =
    history.length > 0
      ? `이전 대화 (오래된→최신, 맥락 유지에 사용):\n${history
          .map((t) => `${t.role === 'user' ? 'PM' : '보조'}: ${t.text}`)
          .join('\n')}\n\n`
      : ''

  const prompt = `너는 언더독스(Underdogs) 교육 기획 **공동기획자**다. PM 이 **예산 자동화(적산) 캔버스**를 대화로 조정하도록, 되묻지 말고 **구체적인 조정안**으로 행동해서 돕는다.

조정은 **적산 라인의 금액 override** 만 가능하다(단가표·워터폴·OR 공식은 못 바꾼다 — 라인 금액만). 캔버스가 라인 합으로 OR=DR−PC−AC·마진을 다시 계산한다.

${historyBlock}현재 적산 라인 (섹션 · 라벨 = 금액):
${lineBlock}${marginBlock}
${contextSummary ? `\n현재 단계 요약: ${contextSummary}\n` : ''}
참고(ADR-030, 26개 실예산 관찰 중앙 — DR 기준, **근거일 뿐 강제 아님**): 실비(AC)≈60% · 인건비(PC)≈8% · 마진(OR)≈16%. 저비용 프로그램이면 그대로 낮게 나올 수 있다 — 관찰값에 억지로 맞추지 마라.

== 출력 형식 (JSON 객체 하나만, 그 외 텍스트 금지) ==
{
  "reply": "PM 에게 보일 한국어 1~2문장",
  "ops": BudgetOp[] | null,        // 명확한 직접 지시(특정 라인을 얼마로) → 즉시 적용
  "choices": [ { "label": string, "sub"?: string, "ops": BudgetOp[] } ] | null  // 조정 방향만 → 카드 2~3개
}

BudgetOp 종류 (정확히 이 형태만 — section 은 "AC"(실비) | "PC"(인건비), label 은 **위 목록의 정확한 라벨**):
- { "op": "setLine", "section": "AC"|"PC", "label": string, "amount": number }   // 그 라인 금액을 amount(원)로 override
- { "op": "resetLine", "section": "AC"|"PC", "label": string }                   // override 해제(기본 적산값 복귀)

행동 우선 규칙 (가장 중요):
- PM 이 조정을 원하면 **반드시 구체적 금액으로 행동**한다 — ops(직접) 또는 choices(2~3안). "적절해 보인다" 같은 회피 **금지**. 요청한 그 항목에 답하라.
- **"운영비 -20%" "마진을 16%로" 같은 명확한 지시** → 해당 라인의 새 금액을 계산해 setLine ops 로 즉시. (예: 운영비 5,000,000 → "20% 줄여" → setLine amount 4,000,000.)
- **"마진 너무 높아/낮아 줄여/늘려줘"** → AC/PC 라인을 조정해 목표 방향에 도달하는 **구체 안 2~3개**를 choices 로(각 ops 는 setLine 조합, label 은 어떤 라인을 얼마로 바꾸는지 한 줄, sub 에 그 결과 마진 변화 방향).
- **"너가 추천해줘 / 조정안 줘"** → 직전 맥락의 작업에 대한 **구체 추천**: 최선 1안이면 ops, 비교 필요하면 choices 2~3개. **절대 되묻지 마라.**
- 정말 어떤 조정도 불가능할 때(라인·맥락만으로 도저히 못 정함)만 ops·choices 둘 다 null 로 두고 reply 로 **딱 1회** 되묻는다.

기타 규칙:
- "label" 은 **반드시 위 목록에 있는 정확한 라벨**만. 목록에 없는 라인 지어내지 마라(없는 항목 추가 불가 — override 만).
- amount 는 0 이상 정수(원). 음수·퍼센트 문자열 금지 — 반드시 절대 금액으로 환산해라.
- 점수·합격/불합격 판정 금지. 마진은 높을수록 좋은 게 아니다 — 관찰 중앙은 참조일 뿐, 강제 보정하지 마라.
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
      label: 'workspace-assistant-budget',
    })
    parsed = safeParseJson<DesignClassification>(result.raw, 'workspace-assistant-budget')
  } catch (err) {
    console.error('[assistant:budget] invokeAi/parse 실패:', err)
    return NextResponse.json(
      { error: '대화 응답 생성에 실패했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 502 },
    )
  }

  const reply =
    typeof parsed.reply === 'string' && parsed.reply.trim()
      ? parsed.reply.trim()
      : '요청을 이해하지 못했어요. 어느 라인을 얼마로 조정할지 조금 더 구체적으로 알려 주세요.'

  // 현재 라인 라벨 셋(환각 방지 — 적산 엔진이 만든 라인만 통과).
  const knownLabels = new Set(budgetLines.map((l) => lineKey(l.section, l.label)))

  // ops 검증 — 허용 op·section·금액 타입 + 존재하는 라벨만(환각 방지).
  const safeOps = filterKnownBudgetOps(validateBudgetOps(parsed.ops), knownLabels)

  // choices 검증 — 각 카드 ops 를 동일 게이트로(불량/빈 카드 drop). ops 가 있으면 카드는 무시(중복 방지).
  const safeChoices = safeOps.length > 0 ? [] : validateBudgetChoices(parsed.choices, knownLabels)

  return NextResponse.json({
    reply,
    ops: safeOps.length > 0 ? safeOps : null,
    choices: safeChoices.length > 0 ? safeChoices : null,
  })
}

// ─────────────────────────────────────────────────────────────────
// BR-WS-24 — 코치 매칭(coach) 단계: 자연어 → {reply, ops, choices}
//   handleBudget 의 미러. 참조는 추천 풀 coachId + 선발팀 assignmentId.
//   ⚠️ apply 는 client override 가 아니라 **서버 영속**(POST/DELETE coach-assignments) —
//      route 는 검증된 CoachOp 만 반환하고, ProgramWorkspace 가 op 별 fetch 후 로스터 재fetch.
// ─────────────────────────────────────────────────────────────────

/** PM 에게 보일 코치 후보 카드 1개(ops 는 CoachOp[], 최소 1건 보장). */
interface CoachChoice {
  label: string
  sub?: string
  ops: CoachOp[]
}

/**
 * 검증된 CoachOp 중 현재 풀·팀에 실제 존재하는 id 만 통과(환각 방지 — budget 의 knownLabels 미러).
 *   - assign : coachId ∈ poolIds.
 *   - remove : assignmentId ∈ teamIds.
 *   - swap   : addCoachId ∈ poolIds **그리고** removeAssignmentId ∈ teamIds.
 * 어느 하나라도 모르는 id 면 drop(엔진이 안 만든 코치/배정을 지어내지 못하게).
 */
function filterKnownCoachOps(
  ops: CoachOp[],
  poolIds: Set<string>,
  teamIds: Set<string>,
): CoachOp[] {
  return ops.filter((op) => {
    if (op.op === 'assign') return poolIds.has(op.coachId)
    if (op.op === 'remove') return teamIds.has(op.assignmentId)
    // swap — 양쪽 다 존재해야 통과.
    return poolIds.has(op.addCoachId) && teamIds.has(op.removeAssignmentId)
  })
}

/**
 * AI 가 낸 choices(unknown) → 검증된 CoachChoice[].
 *   - label 문자열 필수.
 *   - 각 ops 는 validateCoachOps + knownIds 필터로 거른다(불량/환각 op drop).
 *   - 적용할 op 이 0건이 된 choice 는 drop(빈 카드 금지). 최대 3개.
 */
function validateCoachChoices(
  v: unknown,
  poolIds: Set<string>,
  teamIds: Set<string>,
): CoachChoice[] {
  if (!Array.isArray(v)) return []
  const out: CoachChoice[] = []
  for (const item of v) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    if (typeof o.label !== 'string' || !o.label.trim()) continue
    const ops = filterKnownCoachOps(validateCoachOps(o.ops), poolIds, teamIds)
    if (ops.length === 0) continue // 적용할 게 없는 카드는 버린다.
    const choice: CoachChoice = { label: o.label.trim(), ops }
    if (typeof o.sub === 'string' && o.sub.trim()) choice.sub = o.sub.trim()
    out.push(choice)
    if (out.length >= 3) break // 카드는 최대 3개.
  }
  return out
}

/**
 * 코치 매칭 단계 응답(handleBudget 미러, 행동 우선).
 *   - 추천 풀·선발팀 둘 다 없음 → ops/choices=null + 안내(RFP 분석 먼저).
 *   - 있음 → invokeAi(Flash)로 분류 → "추천/추가" → assign 카드(풀 상위), "교체/대신" → swap,
 *     "빼줘" → remove. 명확하면 ops(즉시), 비교 필요하면 choices(카드 2~3개).
 *     둘 다 검증 + knownIds 필터(환각 coachId/assignmentId drop). ops 있으면 choices 무시.
 *   - role 기본 추론: 선발팀이 비면 첫 배정 = MAIN_COACH, 이미 있으면 추가 = SUB_COACH.
 *   - agreedRate 기본 = 풀의 coachRateMain(프롬프트가 안내, route 가 사후 보정).
 *   - 점수·합격 판정 0. SROI/단가 우열 단정 금지.
 *   - history 로 직전 맥락 유지("디지털 전문가 추가" → "너가 추천해줘" 연결).
 */
async function handleCoach(
  message: string,
  contextSummary: string,
  coachPool: CoachPoolRef[],
  coachTeam: CoachTeamRef[],
  requiredN: number | null,
  history: HistoryTurn[],
): Promise<NextResponse> {
  // 추천 풀·선발팀 둘 다 비면(추천 전 — RFP 분석 미완) 강제 배정 금지, 안내만.
  if (coachPool.length === 0 && coachTeam.length === 0) {
    return NextResponse.json({
      reply:
        '아직 추천 풀과 선발팀이 비어 있어요. RFP 분석을 먼저 진행하면 우측에 AI 추천 풀이 채워지고, 그때 대화로 바로 배정·교체할 수 있어요.',
      ops: null,
      choices: null,
    })
  }

  // 첫 배정 기본 역할(팀이 비면 메인, 있으면 보조) — 프롬프트 안내·route 폴백 근거.
  const defaultRole = coachTeam.length === 0 ? 'MAIN_COACH' : 'SUB_COACH'

  const poolList = coachPool
    .slice(0, 15)
    .map(
      (c) =>
        `- coachId=${c.coachId} · ${c.name || '(이름 없음)'} · 매칭 ${(c.matchScore * 100).toFixed(0)}%` +
        `${c.coachRateMain != null ? ` · 단가 ${Math.round(c.coachRateMain / 10000)}만원` : ''}` +
        `${c.strengthOneLiner ? ` · ${c.strengthOneLiner}` : ''}`,
    )
    .join('\n')

  const teamList =
    coachTeam.length > 0
      ? coachTeam
          .map(
            (m) =>
              `- assignmentId=${m.assignmentId} · ${m.coachName || '(이름 없음)'} · 역할 ${m.role}`,
          )
          .join('\n')
      : '(아직 선발된 코치 없음)'

  // BR-WS-17: 직전 대화를 프롬프트에 넣어 맥락 유지(되묻기 루프 방지).
  const historyBlock =
    history.length > 0
      ? `이전 대화 (오래된→최신, 맥락 유지에 사용):\n${history
          .map((t) => `${t.role === 'user' ? 'PM' : '보조'}: ${t.text}`)
          .join('\n')}\n\n`
      : ''

  const requiredBlock =
    requiredN != null ? `\n필요 코치 수(참고): ${requiredN}명 (현재 선발 ${coachTeam.length}명)` : ''

  const prompt = `너는 언더독스(Underdogs) 교육 기획 **공동기획자**다. PM 이 **코치 매칭**을 대화로 진행하도록, 되묻지 말고 **구체적인 후보**로 행동해서 돕는다.

배정/교체/제거는 **추천 풀의 코치(coachId)**·**선발팀의 배정(assignmentId)**만 다룰 수 있다(새 코치를 지어내지 않는다). apply 는 서버에 영속된다.

${historyBlock}현재 추천 풀 (coachId · 이름 · 매칭 · 단가 · 강점):
${poolList || '(추천 풀 비어 있음)'}

현재 선발팀 (assignmentId · 이름 · 역할):
${teamList}${requiredBlock}
${contextSummary ? `\n현재 단계 요약: ${contextSummary}\n` : ''}
== 출력 형식 (JSON 객체 하나만, 그 외 텍스트 금지) ==
{
  "reply": "PM 에게 보일 한국어 1~2문장",
  "ops": CoachOp[] | null,        // 명확한 직접 지시(이 코치를 배정/이 배정을 제거/이 코치로 교체) → 즉시 적용
  "choices": [ { "label": string, "sub"?: string, "ops": CoachOp[] } ] | null  // 후보 비교 필요 → 카드 2~3개
}

CoachOp 종류 (정확히 이 형태만):
- { "op": "assign", "coachId": string, "coachName": string, "role": AssignmentRole, "agreedRate"?: number }   // 추천 풀에서 배정
- { "op": "remove", "assignmentId": string, "coachName": string }                                             // 선발팀에서 제거
- { "op": "swap", "removeAssignmentId": string, "addCoachId": string, "addCoachName": string, "role": AssignmentRole, "agreedRate"?: number }  // 교체

AssignmentRole = ${ASSIGNMENT_ROLES.map((r) => `"${r}"`).join(' | ')}
- coachId 는 **반드시 위 추천 풀 목록의 coachId**, assignmentId 는 **반드시 위 선발팀 목록의 assignmentId**. 없는 id 지어내지 마라.
- role 기본값: 선발팀이 비어 있으면 첫 배정은 "MAIN_COACH", 이미 멤버가 있으면 추가는 "SUB_COACH"(현재 기본은 "${defaultRole}"). 강사/심사 등 명시 요청이 있으면 그 역할로.
- agreedRate 는 가능하면 그 코치의 풀 단가(위 "단가")를 원 단위로 넣어라(예: 단가 60만원 → 600000). 모르면 생략.

행동 우선 규칙 (가장 중요):
- PM 이 배정/교체/제거를 원하면 **반드시 구체적으로 행동**한다 — ops(직접) 또는 choices(2~3안). "적합한 분이 많아요" 같은 회피 **금지**. 요청한 작업 그 자체에 답하라.
- **"추천해줘 / 디지털 전문가 추가해줘 / 한 명 더"** → 추천 풀 상위 적합자 2~3명을 assign **choices** 로(각 카드 ops 는 그 코치 1명 assign, label=이름·강점, sub=매칭/단가). 최적 1명이 분명하면 ops 로 즉시.
- **"1번 코치 대신 / ~를 다른 사람으로 / 교체"** → 빠질 배정(assignmentId)과 들어올 풀 코치(coachId)를 짝지어 swap. 후보가 여럿이면 choices 2~3개.
- **"~ 빼줘 / 제거"** → 해당 선발팀 멤버 remove(ops 즉시 또는 1카드).
- **"너가 추천해줘 / 골라줘"** → 직전 맥락의 작업에 대한 구체 추천. **절대 되묻지 마라.**
- 정말 어떤 행동도 불가능할 때(풀·팀·맥락만으로 도저히 못 정함)만 ops·choices 둘 다 null 로 두고 reply 로 **딱 1회** 되묻는다.

기타 규칙:
- 점수·합격/불합격 판정 금지. 단가·매칭 점수는 참조일 뿐, 우열을 단정하지 마라. SROI 는 높을수록 좋은 게 아니다.
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
      label: 'workspace-assistant-coach',
    })
    parsed = safeParseJson<DesignClassification>(result.raw, 'workspace-assistant-coach')
  } catch (err) {
    console.error('[assistant:coach] invokeAi/parse 실패:', err)
    return NextResponse.json(
      { error: '대화 응답 생성에 실패했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 502 },
    )
  }

  const reply =
    typeof parsed.reply === 'string' && parsed.reply.trim()
      ? parsed.reply.trim()
      : '요청을 이해하지 못했어요. 어떤 코치를 배정·교체·제거할지 조금 더 구체적으로 알려 주세요.'

  // 환각 방지 — 추천 풀 coachId·선발팀 assignmentId 셋(엔진/로스터가 실제 만든 것만 통과).
  const poolIds = new Set(coachPool.map((c) => c.coachId))
  const teamIds = new Set(coachTeam.map((m) => m.assignmentId))

  // ops 검증 — 허용 op·role enum·id 타입 + 존재하는 id 만(환각 방지).
  const safeOps = filterKnownCoachOps(validateCoachOps(parsed.ops), poolIds, teamIds)

  // choices 검증 — 각 카드 ops 를 동일 게이트로(불량/빈 카드 drop). ops 가 있으면 카드는 무시(중복 방지).
  const safeChoices =
    safeOps.length > 0 ? [] : validateCoachChoices(parsed.choices, poolIds, teamIds)

  return NextResponse.json({
    reply,
    ops: safeOps.length > 0 ? safeOps : null,
    choices: safeChoices.length > 0 ? safeChoices : null,
  })
}
