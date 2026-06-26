// The Timeline's cold open — a Gran Turismo-style title sequence that plays
// once when you dive into /timeline from the Home map. Continues seamlessly
// from the Home zoom-exit-to-black: holds black, warms the void, raises the
// build's name in Cormorant, draws an amber horizon hairline, then descends
// and dissolves to reveal the parchment story beneath.
//
// Self-contained: renders a fixed full-screen overlay above the page content
// (which is already mounted underneath), runs a time-based sequence, then
// calls onDone so the host can unmount it. Tap anywhere to skip. Honors
// prefers-reduced-motion with a plain quick fade.

import { useEffect, useRef, useState } from 'react'
import {
  FONT_UI, FONT_TITLE, COLOR_TIMELINE_CHEVRON, COLOR_ACCENT_TEXT, EASING_SETTLE,
} from '../tokens'

const VOID = '#0a0805'           // warm near-black (a hair warmer than #050507)
const REDUCED = typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Sequence timings (ms). Hold then leave; total ≈ ENTER_HOLD + LEAVE_MS.
const ENTER_HOLD = REDUCED ? 650 : 2150
const LEAVE_MS   = REDUCED ? 320 : 620

export default function TimelineOverture({
  title, subtitle, onDone,
}: { title: string; subtitle: string; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false)
  const doneRef = useRef(false)

  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    setLeaving(true)
    window.setTimeout(onDone, LEAVE_MS)
  }

  useEffect(() => {
    const t = window.setTimeout(finish, ENTER_HOLD)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      onClick={finish}
      style={{
        position: 'fixed', inset: 0, zIndex: 95,
        background: VOID,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: leaving ? 0 : 1,
        transition: `opacity ${LEAVE_MS}ms ${EASING_SETTLE}`,
        cursor: 'pointer', WebkitTapHighlightColor: 'transparent', overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes tlBloom   { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
        @keyframes tlRise    { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes tlDraw    { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes tlFadeIn  { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      {/* Warm void bloom — a soft amber light blooming from center */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background:
          'radial-gradient(120% 80% at 50% 42%, rgba(200,140,60,0.20) 0%, rgba(200,140,60,0.07) 34%, rgba(10,8,5,0) 68%)',
        animation: REDUCED ? 'tlFadeIn 400ms ease-out both' : 'tlBloom 1300ms cubic-bezier(0.22,1,0.36,1) both',
      }} />

      {/* Title stack — drifts up and away as the overture leaves */}
      <div style={{
        position: 'relative', textAlign: 'center', padding: '0 32px', maxWidth: 360,
        transform: leaving && !REDUCED ? 'translateY(-26px)' : 'translateY(0)',
        transition: `transform ${LEAVE_MS}ms ${EASING_SETTLE}`,
      }}>
        {/* Eyebrow */}
        <div style={{
          fontFamily: FONT_UI, fontSize: 11, fontWeight: 800, letterSpacing: '0.34em',
          textTransform: 'uppercase', color: COLOR_TIMELINE_CHEVRON,
          opacity: 0.92, marginBottom: 18,
          animation: REDUCED ? 'tlFadeIn 360ms ease-out both' : 'tlRise 520ms cubic-bezier(0.22,1,0.36,1) 220ms both',
        }}>
          The Build Journal
        </div>

        {/* Car name — the hero title */}
        <div style={{
          fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 500,
          fontSize: 40, lineHeight: 1.08, letterSpacing: '0.005em',
          color: '#f3ede1',
          textShadow: '0 2px 24px rgba(0,0,0,0.5)',
          animation: REDUCED ? 'tlFadeIn 420ms ease-out both' : 'tlRise 760ms cubic-bezier(0.22,1,0.36,1) 420ms both',
        }}>
          {title}
        </div>

        {/* Amber horizon hairline — draws outward from center */}
        <div style={{
          width: 132, height: 1, margin: '20px auto 16px',
          background: `linear-gradient(90deg, rgba(200,160,80,0) 0%, ${COLOR_TIMELINE_CHEVRON} 50%, rgba(200,160,80,0) 100%)`,
          transformOrigin: 'center',
          animation: REDUCED ? 'tlFadeIn 360ms ease-out both' : 'tlDraw 760ms cubic-bezier(0.22,1,0.36,1) 880ms both',
        }} />

        {/* Stats subtitle */}
        {subtitle && (
          <div style={{
            fontFamily: FONT_UI, fontSize: 12.5, fontWeight: 600, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: COLOR_ACCENT_TEXT, opacity: 0.62,
            animation: REDUCED ? 'tlFadeIn 360ms ease-out both' : 'tlRise 600ms cubic-bezier(0.22,1,0.36,1) 1180ms both',
          }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  )
}
