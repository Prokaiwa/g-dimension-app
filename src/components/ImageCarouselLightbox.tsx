// Full-screen image carousel viewer — swipe LEFT/RIGHT to page between images,
// swipe UP/DOWN to dismiss (the image tracks your finger and the backdrop fades).
// Tap the backdrop or ✕ to close. Locks body scroll while open. Reports the index
// it closed on via onClose(index) so callers can keep a thumbnail carousel in sync.
import { useEffect, useRef, useState } from 'react'
import { FONT_UI } from '../tokens'

const SNAP = 'transform 300ms cubic-bezier(0.22,1,0.36,1)'

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
  const trackRef   = useRef<HTMLDivElement>(null)
  // gesture state: start x/y, last deltas, axis lock, velocity
  const g = useRef({ x0: 0, y0: 0, dx: 0, dy: 0, axis: '' as '' | 'x' | 'y', ly: 0, lt: 0, vy: 0, active: false })

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const W = typeof window !== 'undefined' ? window.innerWidth : 390

  // Paint the track (horizontal page offset + any in-progress drag) and backdrop.
  const paint = (dx: number, dy: number, animate: boolean) => {
    const tr = trackRef.current, ov = overlayRef.current
    const base = -idxRef.current * W
    if (tr) {
      tr.style.transition = animate ? SNAP : 'none'
      // vertical dismiss drags the whole track down/up with a slight scale
      const scale = g.current.axis === 'y' ? Math.max(0.85, 1 - Math.abs(dy) / 1100) : 1
      tr.style.transform = `translate3d(${base + dx}px, ${dy}px, 0) scale(${scale})`
    }
    if (ov) {
      ov.style.transition = animate ? 'background 300ms ease' : 'none'
      const alpha = g.current.axis === 'y' ? Math.max(0, 0.94 - Math.abs(dy) / 320) : 0.94
      ov.style.background = `rgba(0,0,0,${alpha})`
    }
  }

  // Snap to a given index (re-render moves the base offset).
  const settle = (next: number) => {
    g.current.axis = ''
    setIdx(next)
    requestAnimationFrame(() => paint(0, 0, true))
  }

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    g.current = { x0: t.clientX, y0: t.clientY, dx: 0, dy: 0, axis: '', ly: t.clientY, lt: performance.now(), vy: 0, active: true }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    const s = g.current
    if (!s.active) return
    const t = e.touches[0]
    const dx = t.clientX - s.x0
    const dy = t.clientY - s.y0
    if (!s.axis) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    }
    s.dx = dx; s.dy = dy
    const now = performance.now(), dt = now - s.lt
    if (dt > 0) s.vy = (t.clientY - s.ly) / dt
    s.ly = t.clientY; s.lt = now
    if (s.axis === 'x') {
      // resist past the first/last edge
      let eff = dx
      if ((idxRef.current === 0 && dx > 0) || (idxRef.current === images.length - 1 && dx < 0)) eff = dx * 0.35
      paint(eff, 0, false)
    } else if (s.axis === 'y') {
      paint(0, dy, false)
    }
  }
  const onTouchEnd = () => {
    const s = g.current
    if (!s.active) return
    s.active = false
    if (s.axis === 'y') {
      const flick = Math.abs(s.vy) > 0.5
      if (Math.abs(s.dy) > 110 || flick) {
        const dir = s.dy >= 0 ? 1 : -1
        const tr = trackRef.current
        if (tr) { tr.style.transition = SNAP; tr.style.transform = `translate3d(${-idxRef.current * W}px, ${dir * window.innerHeight}px, 0) scale(0.85)` }
        const ov = overlayRef.current
        if (ov) { ov.style.transition = 'background 300ms ease'; ov.style.background = 'rgba(0,0,0,0)' }
        window.setTimeout(() => onClose(idxRef.current), 220)
      } else { paint(0, 0, true) }
      return
    }
    if (s.axis === 'x') {
      const threshold = W * 0.22
      if (s.dx < -threshold && idxRef.current < images.length - 1) settle(idxRef.current + 1)
      else if (s.dx > threshold && idxRef.current > 0) settle(idxRef.current - 1)
      else paint(0, 0, true)
      return
    }
    // no axis movement → treat as nothing
    paint(0, 0, true)
  }

  const current = images[idx]

  return (
    <div
      ref={overlayRef}
      onClick={() => onClose(idxRef.current)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.94)',
        overflow: 'hidden', touchAction: 'none',
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onClose(idxRef.current) }}
        style={{
          position: 'absolute', top: 14, right: 14, zIndex: 3,
          width: 40, height: 40, borderRadius: '50%',
          background: 'rgba(255,255,255,0.12)', border: 'none',
          color: '#f5f5f5', fontSize: 22, lineHeight: 1, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          WebkitTapHighlightColor: 'transparent',
        }}
      >×</button>

      {/* Counter */}
      {images.length > 1 && (
        <div style={{
          position: 'absolute', top: 20, left: 0, right: 0, textAlign: 'center', zIndex: 2,
          fontFamily: FONT_UI, fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', color: 'rgba(245,245,245,0.7)',
          pointerEvents: 'none',
        }}>{idx + 1} / {images.length}</div>
      )}

      {/* Horizontal track of slides */}
      <div
        ref={trackRef}
        style={{
          position: 'absolute', inset: 0, display: 'flex', willChange: 'transform',
          transform: `translate3d(${-idx * W}px, 0, 0)`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {images.map((im, i) => (
          <div key={i} style={{ width: W, height: '100%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, boxSizing: 'border-box' }}>
            <img
              src={im.url} alt={im.caption ?? ''} draggable={false}
              style={{ maxWidth: '100%', maxHeight: '88vh', objectFit: 'contain', display: 'block', pointerEvents: 'none' }}
            />
          </div>
        ))}
      </div>

      {/* Caption + dots */}
      {(current?.caption || images.length > 1) && (
        <div style={{ position: 'absolute', bottom: 24, left: 0, right: 0, zIndex: 2, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          {current?.caption && (
            <p style={{ fontFamily: FONT_UI, fontSize: 13, color: 'rgba(245,245,245,0.85)', textAlign: 'center', margin: '0 24px', lineHeight: 1.5, maxWidth: 600 }}>{current.caption}</p>
          )}
          {images.length > 1 && (
            <div style={{ display: 'flex', gap: 6 }}>
              {images.map((_, i) => (
                <div key={i} style={{ width: i === idx ? 18 : 6, height: 6, borderRadius: 3, background: i === idx ? '#f5f5f5' : 'rgba(245,245,245,0.35)', transition: 'all 200ms ease' }} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
