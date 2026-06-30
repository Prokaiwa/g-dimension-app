// Shared shell for the Terms and Privacy pages: dark page, back chevron header,
// scrollable readable column, and small typographic helpers so both documents
// look consistent. Public (no auth) so the pages are linkable for visitors and
// for Google's OAuth consent screen.
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  GRADIENT_APP_BG,
  COLOR_CAVITY_BG,
  COLOR_HEADER_BLACK,
  COLOR_HEADER_WARM,
  COLOR_HEADER_TITLE,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  COLOR_ACCENT,
  FONT_UI,
  FONT_TITLE,
  HEADER_HEIGHT,
  SPACE_MD,
  SPACE_LG,
  SPACE_XL,
} from '../tokens'

export function LegalLayout({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  const navigate = useNavigate()
  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: GRADIENT_APP_BG, backgroundColor: COLOR_CAVITY_BG, fontFamily: FONT_UI, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ position: 'relative', height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center', paddingLeft: 10, paddingRight: 14, flexShrink: 0, zIndex: 10, borderBottom: '1px solid rgba(255,255,255,0.04)', paddingTop: 'env(safe-area-inset-top)' }}>
        <button onClick={() => navigate(-1)} aria-label="Back" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px 4px 4px', display: 'flex', alignItems: 'center' }}>
          <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
        </button>
        <span style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 22, color: COLOR_HEADER_TITLE, letterSpacing: '0.01em' }}>{title}</span>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: `${SPACE_LG}px ${SPACE_MD}px calc(${SPACE_XL}px + env(safe-area-inset-bottom))` }}>
          <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: COLOR_ACCENT, margin: `0 0 ${SPACE_MD}px` }}>
            Last updated {updated}
          </p>
          {children}
        </div>
      </div>
    </div>
  )
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section style={{ margin: `${SPACE_LG}px 0 0` }}>
      <h2 style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 15, letterSpacing: '0.02em', color: COLOR_TEXT_PRIMARY, margin: `0 0 ${SPACE_MD}px` }}>{heading}</h2>
      {children}
    </section>
  )
}

export function LegalP({ children }: { children: ReactNode }) {
  return <p style={{ fontFamily: FONT_UI, fontWeight: 400, fontSize: 14, lineHeight: 1.7, color: COLOR_TEXT_SECONDARY, margin: `0 0 ${SPACE_MD}px` }}>{children}</p>
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul style={{ margin: `0 0 ${SPACE_MD}px`, paddingLeft: 20 }}>
      {items.map((it, i) => (
        <li key={i} style={{ fontFamily: FONT_UI, fontWeight: 400, fontSize: 14, lineHeight: 1.7, color: COLOR_TEXT_SECONDARY, marginBottom: 6 }}>{it}</li>
      ))}
    </ul>
  )
}
