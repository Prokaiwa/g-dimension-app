// Full-screen image viewer — tap anywhere, swipe, or press ✕ to dismiss.
// Locks body scroll while open.
import { useEffect, useRef } from 'react'
import { FONT_UI } from '../tokens'

export default function ImageLightbox({
  src, caption, onClose,
}: { src: string; caption?: string | null; onClose: () => void }) {
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  // Lock background scroll
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return
    const dx = e.changedTouches[0].clientX - touchStart.current.x
    const dy = e.changedTouches[0].clientY - touchStart.current.y
    // Dismiss on swipe > 60px in any direction
    if (Math.abs(dx) > 60 || Math.abs(dy) > 60) onClose()
    touchStart.current = null
  }

  return (
    <div
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 16, boxSizing: 'border-box',
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 14, right: 14,
          width: 40, height: 40, borderRadius: '50%',
          background: 'rgba(255,255,255,0.12)', border: 'none',
          color: '#f5f5f5', fontSize: 22, lineHeight: 1, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          WebkitTapHighlightColor: 'transparent',
        }}
      >×</button>
      <img
        src={src}
        alt={caption ?? ''}
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '100%', maxHeight: caption ? '82vh' : '90vh',
          objectFit: 'contain', display: 'block',
        }}
      />
      {caption && (
        <p style={{
          fontFamily: FONT_UI, fontSize: 13, color: 'rgba(245,245,245,0.85)',
          textAlign: 'center', margin: '14px 8px 0', lineHeight: 1.5, maxWidth: 600,
        }}>{caption}</p>
      )}
    </div>
  )
}
