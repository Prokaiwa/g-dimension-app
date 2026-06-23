// Full-screen image viewer — drag the image down (or up) to dismiss; it tracks
// your finger and fades the backdrop, matching the app's other photo viewers.
// Tap the backdrop or ✕ to close. Locks body scroll while open.
import { useEffect, useRef } from 'react'
import { FONT_UI } from '../tokens'

const SNAP = 'transform 300ms cubic-bezier(0.22,1,0.36,1)'

export default function ImageLightbox({
  src, caption, onClose,
}: { src: string; caption?: string | null; onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const figureRef  = useRef<HTMLDivElement>(null)
  const g = useRef({ y0: 0, ly: 0, lt: 0, vy: 0, dy: 0, active: false })

  // Lock background scroll
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const paint = (dy: number, animate: boolean) => {
    const fig = figureRef.current, ov = overlayRef.current
    const scale = Math.max(0.85, 1 - Math.abs(dy) / 1100)
    const alpha = Math.max(0, 0.92 - Math.abs(dy) / 320)
    if (fig) { fig.style.transition = animate ? SNAP : 'none'; fig.style.transform = `translateY(${dy}px) scale(${scale})` }
    if (ov)  { ov.style.transition = animate ? 'background 300ms ease' : 'none'; ov.style.background = `rgba(0,0,0,${alpha})` }
  }

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    g.current = { y0: t.clientY, ly: t.clientY, lt: performance.now(), vy: 0, dy: 0, active: true }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0], s = g.current
    if (!s.active) return
    const dy = t.clientY - s.y0
    const now = performance.now(), dt = now - s.lt
    if (dt > 0) s.vy = (t.clientY - s.ly) / dt
    s.ly = t.clientY; s.lt = now; s.dy = dy
    paint(dy, false)
  }
  const onTouchEnd = () => {
    const s = g.current
    if (!s.active) return
    s.active = false
    const flick = Math.abs(s.vy) > 0.5 && Math.abs(s.dy) > 0
    if (Math.abs(s.dy) > 110 || flick) {
      // Fling off-screen in the swipe direction, then unmount
      const dir = s.dy >= 0 ? 1 : -1
      paint(dir * window.innerHeight, true)
      window.setTimeout(onClose, 200)
    } else {
      paint(0, true) // snap back
    }
  }

  return (
    <div
      ref={overlayRef}
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, boxSizing: 'border-box', touchAction: 'none',
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 14, right: 14, zIndex: 2,
          width: 40, height: 40, borderRadius: '50%',
          background: 'rgba(255,255,255,0.12)', border: 'none',
          color: '#f5f5f5', fontSize: 22, lineHeight: 1, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          WebkitTapHighlightColor: 'transparent',
        }}
      >×</button>
      <div
        ref={figureRef}
        onClick={e => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', willChange: 'transform' }}
      >
        <img
          src={src}
          alt={caption ?? ''}
          draggable={false}
          style={{
            maxWidth: '100%', maxHeight: caption ? '78vh' : '88vh',
            objectFit: 'contain', display: 'block', pointerEvents: 'none',
          }}
        />
        {caption && (
          <p style={{
            fontFamily: FONT_UI, fontSize: 13, color: 'rgba(245,245,245,0.85)',
            textAlign: 'center', margin: '14px 8px 0', lineHeight: 1.5, maxWidth: 600,
          }}>{caption}</p>
        )}
      </div>
    </div>
  )
}
