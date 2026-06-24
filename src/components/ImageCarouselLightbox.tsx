// Full-screen image carousel viewer — swipe LEFT/RIGHT to page between images,
// swipe UP/DOWN to dismiss (the image tracks your finger, scales, and the chrome
// fades). A flick (velocity) commits a page-turn or dismiss even on a tiny drag —
// that's what makes it feel instant. Axis locks once per gesture, biased toward
// horizontal so a slight vertical wobble never kills a swipe. Landscape images are
// centered (objectFit contain). The overlay owns ALL touches and locks body scroll
// while open. Reports the index it closed on via onClose(index) so callers can keep
// a thumbnail carousel in sync. Mirrors the TuningModDetailPage fullscreen viewer.
import { useEffect, useRef, useState } from 'react'
import { FONT_UI } from '../tokens'

const H_SNAP = 'transform 300ms cubic-bezier(0.22,1,0.36,1)'
const V_SNAP = 'transform 340ms cubic-bezier(0.22,1,0.36,1)'

export default function ImageCarouselLightbox({
  images, startIndex = 0, onClose,
}: {
  images: { url: string; caption?: string | null }[]
  startIndex?: number
  onClose: (lastIndex: number) => void
}) {
  const [idx, setIdx] = useState(Math.min(startIndex, Math.max(0, images.length - 1)))
  const idxRef = useRef(idx)
  idxRef.current = idx

  const overlayRef = useRef<HTMLDivElement>(null)
  const vertRef    = useRef<HTMLDivElement>(null)
  const stripRef   = useRef<HTMLDivElement>(null)
  const chromeRef  = useRef<HTMLDivElement>(null)
  // gesture state: start x/y, last x/y, last time, velocities, deltas, axis lock
  const g = useRef({ x0: 0, y0: 0, lx: 0, ly: 0, lt: 0, vx: 0, vy: 0, dx: 0, dy: 0, lock: null as null | 'h' | 'v' })

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Horizontal page offset (+ any in-progress drag).
  const paintStrip = (dx: number, animate: boolean) => {
    const el = stripRef.current; if (!el) return
    el.style.transition = animate ? H_SNAP : 'none'
    el.style.transform  = `translateX(calc(${-idxRef.current * 100}% + ${dx}px))`
  }
  // Vertical dismiss drag — translate + scale the whole layer, fade the chrome.
  const paintVertical = (dy: number, animate: boolean) => {
    const v = vertRef.current, c = chromeRef.current
    const scale = Math.max(0.86, 1 - Math.abs(dy) / 1100)
    const alpha = Math.max(0, 1 - Math.abs(dy) / 280)
    if (v) { v.style.transition = animate ? V_SNAP : 'none'; v.style.transform = `translateY(${dy}px) scale(${scale})` }
    if (c) { c.style.transition = animate ? 'opacity 340ms ease' : 'none'; c.style.opacity = String(alpha) }
  }

  // Re-snap on index change (after a committed page-turn) and on first mount.
  useEffect(() => {
    paintStrip(0, false)
    paintVertical(0, false)
  }, [idx])

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    g.current = { x0: t.clientX, y0: t.clientY, lx: t.clientX, ly: t.clientY, lt: performance.now(), vx: 0, vy: 0, dx: 0, dy: 0, lock: null }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0], s = g.current
    const dx = t.clientX - s.x0, dy = t.clientY - s.y0
    const now = performance.now(), dt = now - s.lt
    if (dt > 0) { s.vx = (t.clientX - s.lx) / dt; s.vy = (t.clientY - s.ly) / dt }
    s.lx = t.clientX; s.ly = t.clientY; s.lt = now; s.dx = dx; s.dy = dy
    if (s.lock === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8))
      s.lock = Math.abs(dy) > Math.abs(dx) * 1.3 ? 'v' : 'h'
    if (s.lock === 'h') {
      const atStart = idxRef.current === 0 && dx > 0
      const atEnd   = idxRef.current === images.length - 1 && dx < 0
      paintStrip(atStart || atEnd ? dx * 0.3 : dx, false)   // rubber-band at the ends
    } else if (s.lock === 'v') {
      paintVertical(dy < 0 ? dy * 0.3 : dy, false)          // resist upward
    }
  }
  const onTouchEnd = () => {
    const s = g.current
    if (s.lock === 'h') {
      const w = window.innerWidth
      const flick = Math.abs(s.vx) > 0.4 && Math.abs(s.dx) > 12
      let ni = idxRef.current
      if      (s.dx < -w * 0.25 || (flick && s.vx < 0)) ni = Math.min(ni + 1, images.length - 1)
      else if (s.dx >  w * 0.25 || (flick && s.vx > 0)) ni = Math.max(ni - 1, 0)
      idxRef.current = ni; setIdx(ni)
      paintStrip(0, true)
    } else if (s.lock === 'v') {
      const flickDown = Math.abs(s.vy) > 0.5 && s.dy > 0
      if (s.dy > 110 || flickDown) {
        paintVertical(window.innerHeight, true)   // fling off-screen, then unmount
        if (chromeRef.current) { chromeRef.current.style.transition = 'opacity 200ms ease'; chromeRef.current.style.opacity = '0' }
        window.setTimeout(() => onClose(idxRef.current), 200)
      } else {
        paintVertical(0, true)
      }
    }
  }

  const current = images[idx]

  return (
    <div
      ref={overlayRef}
      onClick={() => onClose(idxRef.current)}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        touchAction: 'none', overflow: 'hidden', overscrollBehavior: 'none',
      }}
    >
      {/* Vertical-dismiss layer (owns the gesture) */}
      <div
        ref={vertRef}
        style={{ width: '100%', height: '100dvh', display: 'flex', alignItems: 'center', willChange: 'transform' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Horizontal strip — each slide is full width */}
        <div ref={stripRef} style={{ display: 'flex', width: '100%', willChange: 'transform' }}>
          {images.map((im, i) => (
            <div key={i} style={{ width: '100%', flexShrink: 0, height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                src={im.url} alt={im.caption ?? ''} draggable={false}
                style={{
                  maxWidth: '100%', maxHeight: '90dvh',
                  width: 'auto', height: 'auto',
                  objectFit: 'contain', display: 'block',
                  userSelect: 'none', pointerEvents: 'none',
                  WebkitUserSelect: 'none' as React.CSSProperties['WebkitUserSelect'],
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Chrome (close × + counter + caption + dots) — fades with the dismiss drag, passes touches through */}
      <div ref={chromeRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(idxRef.current) }}
          style={{
            position: 'absolute', top: 16, right: 16,
            width: 36, height: 36, borderRadius: '50%',
            background: 'rgba(0,0,0,0.55)', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            WebkitTapHighlightColor: 'transparent', pointerEvents: 'auto',
          }}
        >
          <span style={{ color: 'rgba(245,240,228,0.85)', fontSize: 20, lineHeight: 1 }}>×</span>
        </button>

        {/* Caption */}
        {current?.caption && (
          <p style={{
            position: 'absolute', left: 24, right: 24, bottom: 56, textAlign: 'center',
            fontFamily: FONT_UI, fontSize: 13, color: 'rgba(245,240,228,0.85)',
            lineHeight: 1.5, margin: 0,
          }}>{current.caption}</p>
        )}

        {/* Counter + hint */}
        <p style={{
          position: 'absolute', left: 0, right: 0, bottom: 20, textAlign: 'center',
          fontFamily: FONT_UI, fontSize: 11, letterSpacing: '0.08em',
          color: 'rgba(245,240,228,0.35)', margin: 0,
        }}>
          {images.length > 1
            ? `${idx + 1} / ${images.length}  ·  swipe down to close`
            : 'swipe down to close'}
        </p>
      </div>
    </div>
  )
}
