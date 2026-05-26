'use client'
/**
 * S2ChatCanvas — UX v2 (ADR-018 · mockup s2.html 1:1)
 *
 * Stage 02 · 1차본 작성 · 2 column grid (chat | preview).
 *
 * 레이아웃:
 *   좌 panel: AI 챗봇 (slot progression bar · ai/pm 메시지 · quick chips · chat input)
 *   우 panel: 1차본 미리보기 (7 section card · is-filled/is-partial/is-empty)
 *   gap: 2px (construction grid · hairline)
 *
 * Wire up 상태:
 *   - Slot 진행도: real (props 로 받음)
 *   - Chat: mock messages (Phase C 후속에서 /api/express/turn 연동 예정)
 *   - 7 section card: real (ExpressDraft 의 sections 매핑)
 *
 * Mockup 참조: /public/mockups/v2/_shared.css + s2.html
 */

import { useState } from 'react'

export type SectionStatus = 'filled' | 'partial' | 'empty'

export interface S2Section {
  /** 01~07 */
  num: string
  title: string
  status: SectionStatus
  body: string
  citation?: string
}

export interface S2ChatMessage {
  role: 'ai' | 'pm'
  text: string
  /** AI message 의 quick action chips */
  chips?: { label: string; primary?: boolean }[]
}

export interface S2ChatCanvasProps {
  projectId: string
  /** 채워진 슬롯 수 (예: 5) */
  slotsFilled: number
  /** 전체 슬롯 (보통 12) */
  slotsTotal: number
  /** 7 section 데이터 (없으면 기본 7개 empty 카드 표시) */
  sections?: S2Section[]
  /** Mock chat messages (후속 PR 에서 server-driven) */
  initialMessages?: S2ChatMessage[]
}

const DEFAULT_SECTIONS: S2Section[] = [
  { num: '01', title: '제안 배경', status: 'empty', body: 'RFP 분석 후 자동 채움' },
  { num: '02', title: '핵심 메시지', status: 'empty', body: 'PM 결정 대기' },
  { num: '03', title: '차별화', status: 'empty', body: 'Brain 자산 매칭 대기' },
  { num: '04', title: '실행 계획', status: 'empty', body: '커리큘럼/일정 결정 대기' },
  { num: '05', title: '예상 결과', status: 'empty', body: 'Outcome 결정 대기' },
  { num: '06', title: '사회적 가치 · SROI', status: 'empty', body: 'SROI 계산 예정' },
  { num: '07', title: '부속 자료', status: 'empty', body: '자동 첨부 예정' },
]

const MOCK_MESSAGES: S2ChatMessage[] = [
  {
    role: 'ai',
    text: '안녕하세요! 1차본 작성을 시작합니다. 다음 슬롯은 **Before / After** 입니다.\n이 사업이 끝났을 때 청년 창업가들의 **전·후 모습**이 어떻게 달라져야 할까요?',
    chips: [
      { label: 'AI 가 제안하기 →', primary: true },
      { label: '예시 5개 보기' },
      { label: '유사 사업 참고' },
    ],
  },
]

export function S2ChatCanvas({
  projectId,
  slotsFilled,
  slotsTotal,
  sections,
  initialMessages,
}: S2ChatCanvasProps) {
  const [messages] = useState<S2ChatMessage[]>(initialMessages ?? MOCK_MESSAGES)
  const [input, setInput] = useState('')

  const slotPct = slotsTotal > 0 ? Math.min(100, (slotsFilled / slotsTotal) * 100) : 0
  const filledSections = (sections ?? DEFAULT_SECTIONS).filter(
    (s) => s.status === 'filled',
  ).length
  const totalSections = (sections ?? DEFAULT_SECTIONS).length

  return (
    <div
      className="grid h-[calc(100vh-56px-158px-72px)] grid-cols-2"
      style={{ gap: 2, background: 'var(--hairline, #f0ede8)' }}
    >
      {/* LEFT — Chat panel */}
      <div className="flex flex-col overflow-hidden bg-white">
        <PanelHead
          title="AI 1차본 빌더"
          accent="orange"
          right={
            <div
              className="flex items-center gap-2.5 text-[11px]"
              style={{ color: 'var(--subtitle-text)' }}
            >
              <span>Slot</span>
              <span
                className="text-[12px] font-bold"
                style={{ color: 'var(--dark-charcoal)' }}
              >
                {slotsFilled} / {slotsTotal}
              </span>
              <div
                className="h-1.5 w-[120px] overflow-hidden"
                style={{ background: 'var(--hairline, #f0ede8)' }}
              >
                <div
                  className="h-full transition-[width]"
                  style={{
                    width: `${slotPct}%`,
                    background: 'var(--primary-orange)',
                  }}
                />
              </div>
            </div>
          }
        />

        {/* chat-messages */}
        <div
          className="flex-1 overflow-y-auto p-6"
          style={{ background: 'var(--light-beige)' }}
        >
          {messages.map((m, i) => (
            <ChatMessage key={i} message={m} />
          ))}
        </div>

        {/* chat-input */}
        <div
          className="flex gap-2 bg-white px-6 py-4"
          style={{ borderTop: '1px solid var(--hairline, #f0ede8)' }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="추가 의견이나 질문을 입력하세요..."
            className="h-10 flex-1 bg-white px-3.5 text-[13px] focus:outline-none"
            style={{
              color: 'var(--body-text, #333)',
              border: '1px solid var(--hairline-strong, #e4dfd6)',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--primary-orange)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--hairline-strong, #e4dfd6)'
            }}
          />
          <button
            className="h-10 px-4 text-[12px] font-semibold uppercase tracking-[1px] text-white transition-colors"
            style={{ background: 'var(--dark-charcoal)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--primary-orange)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--dark-charcoal)'
            }}
          >
            ↑ Send
          </button>
        </div>
      </div>

      {/* RIGHT — Preview panel */}
      <div
        className="flex flex-col overflow-hidden"
        style={{ background: 'var(--light-beige)' }}
      >
        <PanelHead
          title="1차본 미리보기"
          accent="charcoal"
          right={
            <span
              className="text-[11px]"
              style={{ color: 'var(--subtitle-text)' }}
            >
              섹션 {filledSections} / {totalSections} 완성
            </span>
          }
        />

        {/* preview-body */}
        <div className="flex-1 overflow-y-auto p-[18px]">
          {(sections ?? DEFAULT_SECTIONS).map((s) => (
            <SectionCard key={s.num} section={s} />
          ))}
        </div>
      </div>
    </div>
  )
}

function PanelHead({
  title,
  accent,
  right,
}: {
  title: string
  accent: 'orange' | 'charcoal'
  right: React.ReactNode
}) {
  const accentColor =
    accent === 'orange' ? 'var(--primary-orange)' : 'var(--dark-charcoal)'
  return (
    <div
      className="flex items-center justify-between bg-white px-6 py-[18px]"
      style={{ borderBottom: `2px solid ${accentColor}` }}
    >
      <div
        className="flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[2px]"
        style={{ color: accentColor }}
      >
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: accentColor }}
        />
        <span
          className="text-[13px] italic normal-case tracking-normal"
          style={{ color: 'var(--dark-charcoal)' }}
        >
          {title}
        </span>
      </div>
      {right}
    </div>
  )
}

function ChatMessage({ message }: { message: S2ChatMessage }) {
  if (message.role === 'pm') {
    return (
      <div className="mb-[18px] text-right">
        <div
          className="inline-block max-w-[90%] px-[18px] py-3.5 text-left text-[13px] leading-[1.7]"
          style={{
            background: 'var(--dark-charcoal)',
            color: 'var(--warm-gray)',
            borderTop: '2px solid var(--orange3)',
            boxShadow: '0 1px 0 var(--hairline, #f0ede8)',
          }}
          dangerouslySetInnerHTML={{ __html: formatMessage(message.text) }}
        />
      </div>
    )
  }

  return (
    <div className="mb-[18px] flex gap-3">
      <div
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center text-[12px] font-bold tracking-[0.5px] text-white"
        style={{ background: 'var(--primary-orange)' }}
      >
        AI
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="max-w-[90%] bg-white px-[18px] py-3.5 text-[13px] leading-[1.7]"
          style={{
            color: 'var(--body-text, #333)',
            borderTop: '2px solid var(--primary-orange)',
            boxShadow: '0 1px 0 var(--hairline, #f0ede8)',
          }}
          dangerouslySetInnerHTML={{ __html: formatMessage(message.text) }}
        />
        {message.chips && message.chips.length > 0 && (
          <div className="ml-11 mt-2.5 flex flex-wrap gap-1.5">
            {message.chips.map((c, i) => (
              <button
                key={i}
                className="inline-flex h-7 items-center px-3 text-[11px] font-semibold tracking-[0.3px] transition-colors"
                style={
                  c.primary
                    ? {
                        background: 'var(--primary-orange)',
                        color: '#ffffff',
                        border: '1px solid var(--primary-orange)',
                      }
                    : {
                        background: '#ffffff',
                        color: 'var(--subtitle-text)',
                        border: '1px solid var(--hairline-strong, #e4dfd6)',
                      }
                }
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SectionCard({ section }: { section: S2Section }) {
  const borderColor =
    section.status === 'filled'
      ? 'var(--green)'
      : section.status === 'partial'
        ? 'var(--primary-orange)'
        : 'var(--hairline-strong, #e4dfd6)'
  const isEmpty = section.status === 'empty'
  const statusLabel =
    section.status === 'filled' ? '완성' : section.status === 'partial' ? '진행' : '대기'
  const statusBg =
    section.status === 'filled'
      ? 'var(--green)'
      : section.status === 'partial'
        ? 'var(--primary-orange)'
        : 'var(--hairline-strong, #e4dfd6)'
  const statusColor = isEmpty ? 'var(--subtitle-text)' : '#ffffff'

  return (
    <div
      className="mb-[2px] px-[22px] py-[18px] transition-colors"
      style={{
        background: isEmpty ? 'var(--light-beige)' : '#ffffff',
        borderLeft: `4px solid ${borderColor}`,
      }}
    >
      <div className="mb-2 flex items-center gap-2.5">
        <span
          className="text-[10px] font-bold tabular-nums tracking-[1.5px]"
          style={{ color: 'var(--subtitle-text)' }}
        >
          {section.num}
        </span>
        <span
          className="flex-1 text-[14px] font-bold tracking-[-0.2px]"
          style={{ color: 'var(--dark-charcoal)' }}
        >
          {section.title}
        </span>
        <span
          className="px-2 py-[3px] text-[9px] font-bold uppercase tracking-[1.5px]"
          style={{ background: statusBg, color: statusColor }}
        >
          {statusLabel}
        </span>
      </div>
      <div
        className="mt-1 leading-[1.7]"
        style={{
          fontSize: isEmpty ? '11px' : '12px',
          color: isEmpty ? 'var(--subtitle-text)' : 'var(--body-text, #333)',
          fontStyle: isEmpty ? 'italic' : 'normal',
        }}
      >
        {section.body}
        {section.citation && (
          <span
            className="ml-1 inline-block px-2 py-[1px] text-[10px] font-semibold"
            style={{
              background: 'var(--light-beige)',
              color: 'var(--primary-orange)',
              borderLeft: '2px solid var(--primary-orange)',
            }}
          >
            {section.citation}
          </span>
        )}
      </div>
    </div>
  )
}

// Mock message formatter — markdown **bold** + newlines.
// XSS 안전: 입력 source 는 server-side (express infrastructure) 또는 hardcoded mock 만 사용.
// 사용자 input 은 chat-input 에서 받지만 후속 PR 에서 server side 에서 sanitize.
function formatMessage(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>')
}
