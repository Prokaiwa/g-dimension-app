// Onboarding tour overlay — the global speech bubble + dim + controls. Renders
// nothing unless the tour is active. The glowing line itself is drawn inside
// HomePage (so it aligns with the map), not here.
import { useEffect, useMemo, useState } from 'react'
import { useTour } from './TourContext'
import {
  COLOR_CAVITY_BG, COLOR_ACCENT, COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY,
  FONT_UI, FONT_TITLE, EASING_SETTLE, RADIUS_BUTTON,
} from '../tokens'

// Split body copy into plain + **accent** segments.
function parseSegments(body: string): { text: string; accent: boolean }[] {
  return body
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map(p => (p.startsWith('**') && p.endsWith('**'))
      ? { text: p.slice(2, -2), accent: true }
      : { text: p, accent: false })
}

export default function TourOverlay() {
  const { active, step, index, total, next, back, skip } = useTour()

  const segments = useMemo(() => (step ? parseSegments(step.body) : []), [step])
  const fullLen = useMemo(() => segments.reduce((n, s) => n + s.text.length, 0), [segments])

  // Typewriter reveal — resets per step.
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (!step) return
    setShown(0)
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setShown(fullLen); return }
    let n = 0
    const t = window.setInterval(() => {
      n += 1
      setShown(n)
      if (n >= fullLen) window.clearInterval(t)
    }, 22)
    return () => window.clearInterval(t)
  }, [step, fullLen])

  if (!active || !step) return null

  const place = step.place ?? 'bottom'
  const onHome = step.route === '/home'
  const isLast = index >= total - 1
  // Node steps: tapping the dimmed map (where the highlighted node sits) advances
  // the tour. Reliable regardless of the bubble's position over the node.
  const tapToAdvance = !!step.node

  // Render revealed text across segments.
  let remaining = shown
  const text = segments.map((s, i) => {
    if (remaining <= 0) return null
    const slice = s.text.slice(0, remaining)
    remaining -= s.text.length
    return (
      <span key={i} style={{ color: s.accent ? COLOR_ACCENT : COLOR_TEXT_PRIMARY, fontWeight: s.accent ? 800 : (step.voice ? 500 : 400) }}>
        {slice}
      </span>
    )
  })

  const justify = place === 'center' ? 'center' : place === 'top' ? 'flex-start' : 'flex-end'

  return (
    <div
      onClick={tapToAdvance ? () => next() : undefined}
      style={{
        position: 'fixed', inset: 0, zIndex: 100000,
        display: 'flex', flexDirection: 'column', justifyContent: justify,
        alignItems: 'center',
        // Lighter scrim on the home map so the glowing line + nodes read through.
        background: onHome ? 'rgba(5,5,7,0.34)' : 'rgba(5,5,7,0.58)',
        padding: place === 'top' ? '64px 20px 0' : place === 'center' ? '0 20px' : '0 20px 38px',
        animation: `tourFade 220ms ${EASING_SETTLE} both`,
        cursor: tapToAdvance ? 'pointer' : 'default',
      }}
    >
      <style>{`@keyframes tourFade { from { opacity: 0 } to { opacity: 1 } }`}</style>

      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 360,
          background: COLOR_CAVITY_BG,
          border: '1px solid rgba(245,245,245,0.10)',
          borderTop: `2px solid ${COLOR_ACCENT}`,
          boxShadow: '0 18px 50px rgba(0,0,0,0.6)',
          padding: '18px 18px 14px',
          cursor: 'default',
          // square corners per design system
        }}
      >
        {/* Body */}
        <p style={{
          margin: 0,
          fontFamily: step.voice ? FONT_TITLE : FONT_UI,
          fontStyle: step.voice ? 'italic' : 'normal',
          fontSize: step.voice ? 19 : 15,
          lineHeight: step.voice ? 1.5 : 1.55,
          minHeight: 48,
          letterSpacing: step.voice ? 0 : '0.01em',
        }}>
          {text}
          <span style={{
            display: shown < fullLen ? 'inline-block' : 'none',
            width: 7, height: step.voice ? 18 : 14, marginLeft: 1,
            background: COLOR_ACCENT, verticalAlign: 'text-bottom',
            animation: 'tourCaret 0.7s steps(1) infinite',
          }} />
          <style>{`@keyframes tourCaret { 0%,50% { opacity: 1 } 50.01%,100% { opacity: 0 } }`}</style>
        </p>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 16, gap: 10 }}>
          {/* Progress */}
          <span style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: COLOR_TEXT_SECONDARY }}>
            {index + 1} / {total}
          </span>
          <div style={{ flex: 1 }} />
          {index > 0 && (
            <button onClick={back} style={ghostBtn}>Back</button>
          )}
          <button onClick={skip} style={ghostBtn}>Skip</button>
          <button onClick={next} style={primaryBtn}>{isLast ? 'Finish' : 'Next'}</button>
        </div>
      </div>
    </div>
  )
}

const ghostBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontFamily: FONT_UI, fontWeight: 700, fontSize: 12,
  letterSpacing: '0.06em', color: COLOR_TEXT_SECONDARY,
  padding: '8px 6px',
}

const primaryBtn: React.CSSProperties = {
  background: COLOR_ACCENT, border: 'none', cursor: 'pointer',
  fontFamily: FONT_UI, fontWeight: 800, fontSize: 12,
  letterSpacing: '0.1em', textTransform: 'uppercase', color: '#fff',
  padding: '10px 20px', borderRadius: RADIUS_BUTTON,
}
