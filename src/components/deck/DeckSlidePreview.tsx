'use client'
/**
 * DeckSlidePreview — DeckSpec 의 슬라이드 1장을 16:9 로 클라이언트 렌더 (DECK-3b-2, ADR-025 Phase 3b)
 *
 * chromium 불필요 — 브라우저가 React 슬라이드를 직접 그린다(미리보기는 워커 경유 X — ADR-025 §1).
 * `.ud-slide-canvas` 는 본래 width:100% + 고정 px 타이포(1280px 기준 캘리브레이션). 정확한 비율을
 * 위해 1280px 고정 래퍼에 슬라이드를 그린 뒤 `transform: scale(width/1280)` 로 축소한다.
 */

import { useRef, useState, useLayoutEffect, type ReactElement } from 'react'

/** 디자인 기준 캔버스 폭(px) — underdogs-slide.css 의 타이포가 이 폭에 맞춰 캘리브레이션됨. */
const BASE_W = 1280
const BASE_H = 720 // 16:9

export function DeckSlidePreview({ element }: { element: ReactElement }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.3)

  // 컨테이너 실제 폭에 맞춰 scale 계산 (반응형).
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = () => {
      const w = el.clientWidth
      if (w > 0) setScale(w / BASE_W)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      ref={wrapRef}
      className="overflow-hidden rounded-md border bg-white shadow-sm"
      style={{ width: '100%', height: BASE_H * scale }}
    >
      <div
        style={{
          width: BASE_W,
          height: BASE_H,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {/* .ud-slide-canvas (16:9, width:100%) → 1280×720 래퍼 안에서 정확히 채워짐 */}
        {element}
      </div>
    </div>
  )
}
