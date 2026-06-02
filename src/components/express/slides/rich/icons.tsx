/**
 * Single-stroke line icons — DECK-1 (ADR-025)
 *
 * 디자인 킷 준수: 단색 라인(stroke) 아이콘, 채움 금지, currentColor 상속.
 * OOXML 사각형 어휘로는 불가능했던 표현. lucide-react 와 동일 24px grid · stroke 1.75.
 * 정적 렌더(renderToStaticMarkup) 안전 — 순수 SVG, 'use client' 없음.
 */
import React from 'react'

export type IconName =
  | 'target'
  | 'users'
  | 'rocket'
  | 'compass'
  | 'lightbulb'
  | 'trending-up'
  | 'check-circle'
  | 'layers'
  | 'handshake'
  | 'map-pin'
  | 'award'
  | 'briefcase'
  | 'flask'
  | 'presentation'
  | 'clipboard-check'
  | 'graduation'
  | 'building'
  | 'coins'

const PATHS: Record<IconName, React.ReactNode> = {
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.2" />
    </>
  ),
  users: (
    <>
      <path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" />
      <circle cx="9" cy="7" r="3" />
      <path d="M22 19v-1a4 4 0 0 0-3-3.85" />
      <path d="M16 4.1a4 4 0 0 1 0 7.75" />
    </>
  ),
  rocket: (
    <>
      <path d="M5 13c-1.5 1.3-2 5-2 5s3.7-.5 5-2" />
      <path d="M9 15l-3-3c1-4 4-9 11-10 1 7-4 10-8 11Z" />
      <circle cx="14.5" cy="9.5" r="1.5" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5 13 13l-4.5 2.5L11 11Z" />
    </>
  ),
  lightbulb: (
    <>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M8 14a6 6 0 1 1 8 0c-.8.7-1.4 1.6-1.5 2.7H9.5C9.4 15.6 8.8 14.7 8 14Z" />
    </>
  ),
  'trending-up': (
    <>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M16 7h5v5" />
    </>
  ),
  'check-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3 3 8l9 5 9-5Z" />
      <path d="M3 13l9 5 9-5" />
      <path d="M3 18l9 5 9-5" />
    </>
  ),
  handshake: (
    <>
      <path d="m11 17 2 2a1.5 1.5 0 0 0 2-2" />
      <path d="m13.5 14.5 3 3a1.5 1.5 0 0 0 2-2l-4.5-4.5" />
      <path d="M3 9l4-4 5 5-2 2a1.5 1.5 0 0 1-2 0L6 9" />
      <path d="M21 9l-4-4-3 3" />
    </>
  ),
  'map-pin': (
    <>
      <path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  award: (
    <>
      <circle cx="12" cy="9" r="6" />
      <path d="M9 14.5 8 22l4-2 4 2-1-7.5" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M3 12h18" />
    </>
  ),
  flask: (
    <>
      <path d="M9 3h6" />
      <path d="M10 3v6l-5 9a1.5 1.5 0 0 0 1.3 2.2h11.4A1.5 1.5 0 0 0 19 18l-5-9V3" />
      <path d="M7.5 14h9" />
    </>
  ),
  presentation: (
    <>
      <rect x="3" y="4" width="18" height="12" />
      <path d="M2 4h20" />
      <path d="M12 16v4" />
      <path d="M8 20h8" />
    </>
  ),
  'clipboard-check': (
    <>
      <rect x="5" y="4" width="14" height="17" />
      <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </>
  ),
  graduation: (
    <>
      <path d="M12 4 2 9l10 5 10-5Z" />
      <path d="M6 11v5c0 1.2 2.7 2.5 6 2.5s6-1.3 6-2.5v-5" />
      <path d="M22 9v5" />
    </>
  ),
  building: (
    <>
      <rect x="4" y="3" width="16" height="18" />
      <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />
      <path d="M9 21v-3h6v3" />
    </>
  ),
  coins: (
    <>
      <ellipse cx="9" cy="7" rx="6" ry="3" />
      <path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7" />
      <path d="M15 12.5c2.8-.2 6-1.4 6-3.5" />
      <path d="M9 15v4c0 1.7 2.7 3 6 3s6-1.3 6-3v-7" />
    </>
  ),
}

interface IconProps {
  name: IconName
  size?: number
  color?: string
  strokeWidth?: number
  style?: React.CSSProperties
}

export function Icon({ name, size = 28, color = 'currentColor', strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {PATHS[name]}
    </svg>
  )
}
