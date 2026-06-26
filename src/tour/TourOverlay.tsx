// Onboarding tour overlay — speech bubble + dim + controls. Renders nothing
// unless the tour is active. The glowing line is drawn inside HomePage.
//
// Modes per step:
//   node step   — light dim + bubble; "Got it" dismisses, then tap the map node.
//   target step — spotlight: dims everything except the tagged element (which
//                 stays interactive); advances on its waitFor event, or Next.
//   wait + no target — non-blocking: bubble only, screen fully usable (e.g. the
//                 Add-Car form); advances on the waitFor event.
//   plain       — full dim + Next/Finish.
import { useEffect, useMemo, useState } from 'react'
import { useTour } from './TourContext'
import {
  COLOR_CAVITY_BG, COLOR_ACCENT, COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY,
  FONT_UI, FONT_TITLE, EASING_SETTLE, RADIUS_BUTTON,
} from '../tokens'

function parseSegments(body: string): { text: string; accent: boolean }[] {
  return body
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map(p => (p.startsWith('**') && p.endsWith('**'))
      ? { text: p.slice(2, -2), accent: true }
      : { text: p, accent: false })
}

const SPOT_PAD = 8

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

  // Node steps: "Got it" dismisses the bubble, leaving a clean map; tap the node.
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => { setDismissed(false) }, [step?.id])

  // Spotlight: locate the tagged element and track its rect (poll through the
  // page's entry animation, then settle).
  const [rect, setRect] = useState<DOMRect | null>(null)
  const targetKey = step?.target
  useEffect(() => {
    setRect(null)
    if (!targetKey) return
    let raf = 0, tries = 0
    const measure = () => {
      const el = document.querySelector(`[data-tour="${targetKey}"]`) as HTMLElement | null
      if (el) {
        const r = el.getBoundingClientRect()
        setRect(prev => (prev && prev.top === r.top && prev.left === r.left
          && prev.width === r.width && prev.height === r.height) ? prev : r)
      }
      if (++tries < 90) raf = requestAnimationFrame(measure)
    }
    raf = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(raf)
  }, [step?.id, targetKey])

  if (!active || !step) return null
  const isNode = !!step.node
  const place = step.place ?? 'bottom'
  const onHome = step.route === '/home'
  const isLast = index >= total - 1
  const isTarget = !!step.target
  const isWait = !!step.waitFor
  const nonBlocking = isWait && !isTarget
  // Node steps and non-blocking wait steps (e.g. the fill-in-your-car form)
  // both offer a "Got it" that hides the bubble so it's out of the way; it
  // stays hidden until the step changes (dismissed resets per step.id), which
  // for wait steps happens when the waitFor event fires.
  const dismissible = isNode || nonBlocking
  if (dismissible && dismissed) return null
  const DIM = onHome ? 'rgba(5,5,7,0.34)' : 'rgba(5,5,7,0.58)'

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

  // Background / dim layer.
  let dimLayer: React.ReactNode = null
  if (!nonBlocking) {
    if (isTarget && rect) {
      const t = Math.max(0, rect.top - SPOT_PAD)
      const l = Math.max(0, rect.left - SPOT_PAD)
      const w = rect.width + SPOT_PAD * 2
      const h = rect.height + SPOT_PAD * 2
      const seg: React.CSSProperties = { position: 'absolute', background: DIM, pointerEvents: 'auto' }
      dimLayer = (
        <>
          <div style={{ ...seg, left: 0, top: 0, right: 0, height: t }} />
          <div style={{ ...seg, left: 0, top: t + h, right: 0, bottom: 0 }} />
          <div style={{ ...seg, left: 0, top: t, width: l, height: h }} />
          <div style={{ ...seg, left: l + w, top: t, right: 0, height: h }} />
          <div style={{
            position: 'absolute', left: l, top: t, width: w, height: h,
            border: `2px solid ${COLOR_ACCENT}`, borderRadius: 10,
            boxShadow: `0 0 16px ${COLOR_ACCENT}`, pointerEvents: 'none',
            animation: 'tourSpot 1.6s ease-in-out infinite',
          }} />
        </>
      )
    } else {
      dimLayer = <div style={{ position: 'absolute', inset: 0, background: DIM, pointerEvents: 'auto' }} />
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100000,
      // The container itself must NOT capture taps — otherwise it covers the
      // spotlight "hole" and swallows the tap meant for the highlighted tile
      // (the stuck "can't tap My Cars" bug). The dim segments and the bubble
      // each opt back in with pointerEvents:'auto'; the hole stays click-through.
      pointerEvents: 'none',
      animation: `tourFade 220ms ${EASING_SETTLE} both`,
    }}>
      <style>{`
        @keyframes tourFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes tourCaret { 0%,50% { opacity: 1 } 50.01%,100% { opacity: 0 } }
        @keyframes tourSpot { 0%,100% { box-shadow: 0 0 10px ${COLOR_ACCENT} } 50% { box-shadow: 0 0 22px ${COLOR_ACCENT} } }
      `}</style>

      {dimLayer}

      {/* Bubble layer — positioned by place; only the bubble captures taps. */}
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        justifyContent: justify, alignItems: 'center', pointerEvents: 'none',
        padding: place === 'top' ? '64px 20px 0' : place === 'center' ? '0 20px' : '0 20px 38px',
      }}>
        <div style={{
          width: '100%', maxWidth: 360, pointerEvents: 'auto',
          background: COLOR_CAVITY_BG,
          border: '1px solid rgba(245,245,245,0.10)',
          borderTop: `2px solid ${COLOR_ACCENT}`,
          boxShadow: '0 18px 50px rgba(0,0,0,0.6)',
          padding: '18px 18px 14px',
        }}>
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
          </p>

          <div style={{ display: 'flex', alignItems: 'center', marginTop: 16, gap: 10 }}>
            <span style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: COLOR_TEXT_SECONDARY }}>
              {index + 1} / {total}
            </span>
            <div style={{ flex: 1 }} />
            {index > 0 && <button onClick={back} style={ghostBtn}>Back</button>}
            <button onClick={skip} style={ghostBtn}>Skip</button>
            {dismissible
              ? <button onClick={() => setDismissed(true)} style={primaryBtn}>Got it</button>
              : isWait
                ? null
                : <button onClick={next} style={primaryBtn}>{isLast ? 'Finish' : 'Next'}</button>}
          </div>
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
