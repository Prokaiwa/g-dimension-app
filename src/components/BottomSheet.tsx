// Shared bottom sheet with real swipe-to-close.
//
// Drag the grab handle (or title bar) downward to dismiss — past ~110px it
// closes, otherwise it springs back. The drag region uses touchAction:'none'
// and the body uses overscrollBehavior:'contain', which together stop the
// browser's pull-to-refresh from firing (the old "swipe just refreshes" bug).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { COLOR_ACCENT, FONT_TITLE, FONT_UI, RADIUS_BOTTOM_SHEET, EASING_SETTLE, SPACE_MD } from '../tokens'

const DISMISS_PX = 110

export default function BottomSheet({
  open,
  onClose,
  title,
  bg = '#121316',
  busy = false,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  bg?: string
  busy?: boolean
  children: ReactNode
}) {
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [hasDragged, setHasDragged] = useState(false)
  const startY = useRef(0)
  const backdropRef = useRef<HTMLDivElement>(null)

  // Reset drag state each time the sheet opens (it stays mounted while closed).
  useEffect(() => {
    if (open) { setDragY(0); setDragging(false); setHasDragged(false) }
  }, [open])

  // Lock background scroll while open. body overflow covers body-scrolling pages;
  // blocking wheel/touchmove on the dimmed backdrop covers pages whose scroll
  // lives in an inner container. The sheet itself still scrolls internally.
  useEffect(() => {
    const el = backdropRef.current
    if (!open || !el) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const prevent = (e: Event) => e.preventDefault()
    el.addEventListener('wheel', prevent, { passive: false })
    el.addEventListener('touchmove', prevent, { passive: false })
    return () => {
      document.body.style.overflow = prevOverflow
      el.removeEventListener('wheel', prevent)
      el.removeEventListener('touchmove', prevent)
    }
  }, [open])

  if (!open) return null

  const close = () => { if (!busy) onClose() }

  const onStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY
    setHasDragged(true)
    setDragging(true)
  }
  const onMove = (e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - startY.current
    setDragY(Math.max(0, dy))
  }
  const onEnd = () => {
    setDragging(false)
    if (dragY > DISMISS_PX) { close(); setDragY(0); return }
    setDragY(0)
  }

  const backdropAlpha = Math.max(0, 0.6 - dragY / 600)

  return (
    <>
      <style>{`
        @keyframes bsSheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes bsBackdropIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      <div
        ref={backdropRef}
        onClick={close}
        style={{ position: 'fixed', inset: 0, background: `rgba(0,0,0,${dragging ? backdropAlpha : 0.6})`, zIndex: 30, touchAction: 'none', animation: dragging ? undefined : 'bsBackdropIn 200ms ease both' }}
      />

      <div
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 31,
          background: bg,
          borderTopLeftRadius: RADIUS_BOTTOM_SHEET, borderTopRightRadius: RADIUS_BOTTOM_SHEET,
          maxHeight: '92dvh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.6)',
          transform: `translateY(${dragY}px)`,
          transition: dragging ? 'none' : `transform 320ms ${EASING_SETTLE}`,
          animation: hasDragged ? undefined : `bsSheetUp 320ms ${EASING_SETTLE} both`,
        }}
      >
        {/* Drag region — handle + title bar */}
        <div
          onTouchStart={onStart}
          onTouchMove={onMove}
          onTouchEnd={onEnd}
          style={{ flexShrink: 0, padding: `${SPACE_MD}px ${SPACE_MD}px 0`, touchAction: 'none', cursor: 'grab' }}
        >
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(240,228,200,0.25)', margin: '0 auto 14px' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE_MD }}>
            <span style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 22, color: '#f0e4c8' }}>{title}</span>
            <button
              onClick={close}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(240,228,200,0.5)' }}
            >
              Cancel
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: `0 ${SPACE_MD}px calc(${SPACE_MD}px + env(safe-area-inset-bottom))` }}>
          {children}
        </div>
      </div>
    </>
  )
}

// Shared form-field helpers for sheet content.
export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label style={{ display: 'block', fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(240,228,200,0.45)', marginBottom: 5 }}>
      {children}
    </label>
  )
}

export const sheetInput: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(240,228,200,0.05)', border: 'none', borderBottom: '1px solid rgba(240,228,200,0.22)',
  padding: '10px 10px', fontFamily: FONT_UI, fontWeight: 500, fontSize: 15, color: '#f0e4c8', outline: 'none', borderRadius: 0,
}

export const SHEET_ACCENT = COLOR_ACCENT
