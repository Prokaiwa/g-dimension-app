// Full-screen image carousel viewer — swipe LEFT/RIGHT to page between images,
// swipe UP/DOWN to dismiss (the image tracks your finger, scales, and the chrome
// fades). A flick (velocity) commits a page-turn or dismiss even on a tiny drag —
// that's what makes it feel instant. Axis locks once per gesture, biased toward
// horizontal so a slight vertical wobble never kills a swipe. Landscape images are
// centered (objectFit contain, maxHeight 90dvh). The overlay owns ALL touches and
// locks body scroll while open. Mirrors TuningModDetailPage's fullscreen viewer.
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

  const vertRef   = useRef<HTMLDivElement>(null)
  const stripRef  = useRef<HTMLDivElement>(null)
  const chromeRef = useRef<HTMLDivElement>(null)
  const g = useRef({ x0: 0, y0: 0, lx: 0, ly: 0, lt: 0, vx: 0, vy: 0, dx: 0, dy: 0, lock: null as null | 'h' | 'v' })

  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Initialise both transforms once on mount (handles startIndex > 0).
  // IMPORTANT: do NOT depend on [idx] here — the touch handlers call paintStrip
  // with animate=true then immediately call setIdx; if the effect re-ran on idx
  // change it would fire transition:'none' during the snap and kill the animation.
  useEffect(() => {
    paintStrip(0, false)
    paintVertical(0, false)
  }, [])  

  const paintStrip = (dx: number, animate: boolean) => {
    const el = stripRef.current; if (!el) return
    el.style.transition = animate ? H_SNAP : 'none'
    el.style.transform  = `translateX(calc(${-idxRef.current * 100}% + ${dx}px))`
  }
  const paintVertical = (dy: number, animate: boolean) => {
    const v = vertRef.current, c = chromeRef.current
    const scale = Math.max(0.86, 1 - Math.abs(dy) / 1100)
    const alpha = Math.max(0, 1 - Math.abs(dy) / 280)
    if (v) { v.style.transition = animate ? V_SNAP : 'none'; v.style.transform = `translateY(${dy}px) scale(${scale})` }
    if (c) { c.style.transition = animate ? 'opacity 340ms ease' : 'none'; c.style.opacity = String(alpha) }
  }

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
    // Wait for a slightly larger move (10px) so the initial direction is a clean
    // read, then only lock 'vertical' when the gesture is clearly (2x) more
    // vertical than horizontal. This keeps an imperfect left/right swipe on the
    // horizontal page-turn instead of accidentally triggering the pull-to-dismiss.
    if (s.lock === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10))
      s.lock = Math.abs(dy) > Math.abs(dx) * 2 ? 'v' : 'h'
    if (s.lock === 'h') {
      const atStart = idxRef.current === 0 && dx > 0
      const atEnd   = idxRef.current === images.length - 1 && dx < 0
      paintStrip(atStart || atEnd ? dx * 0.3 : dx, false)
    } else if (s.lock === 'v') {
      paintVertical(dy < 0 ? dy * 0.3 : dy, false)
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
      idxRef.current = ni
      paintStrip(0, true)   // animate FIRST, then React re-renders (state update is async)
      setIdx(ni)
    } else if (s.lock === 'v') {
      const flickDown = Math.abs(s.vy) > 0.5 && s.dy > 0
      if (s.dy > 110 || flickDown) {
        paintVertical(window.innerHeight, true)
        if (chromeRef.current) { chromeRef.current.style.transition = 'opacity 200ms ease'; chromeRef.current.style.opacity = '0' }
        window.setTimeout(() => onClose(idxRef.current), 200)
      } else {
        paintVertical(0, true)
      }
    }
  }

  return (
    <div
      onClick={() => onClose(idxRef.current)}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        touchAction: 'none', overflow: 'hidden', overscrollBehavior: 'none',
      }}
    >
      {/* Vertical-dismiss layer */}
      <div
        ref={vertRef}
        style={{ width: '100%', height: '100dvh', display: 'flex', alignItems: 'center', willChange: 'transform' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Horizontal strip */}
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

      {/* Chrome — fades with the dismiss drag */}
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

        {images[idx]?.caption && (
          <p style={{
            position: 'absolute', left: 24, right: 24, bottom: 52, textAlign: 'center',
            fontFamily: FONT_UI, fontSize: 13, color: 'rgba(245,240,228,0.85)',
            lineHeight: 1.5, margin: 0,
          }}>{images[idx].caption}</p>
        )}

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
