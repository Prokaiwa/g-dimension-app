// The rank-up celebration. A full-screen black curtain opens to a beam of light
// on the earned permit, with a triumphant sting (see sound.playRankUp) and a
// one-shot swell of the background music. Fires when the earned grade outranks
// the last-seen grade (see PermitWatcher). Tap or wait to dismiss.
//
// Self-contained: no libraries, keyframes injected inline, respects
// prefers-reduced-motion (skips the motion, keeps the reveal).
import { useEffect, useRef, useState } from 'react'
import { gradeById } from '../lib/license'
import { GRADE_RING } from '../lib/permit'
import { playRankUp } from '../lib/sound'
import { swellMusic } from '../lib/music'
import { FONT_UI, FONT_TITLE } from '../tokens'

const HOLD_MS = 4200

export default function PermitCelebration({ gradeId, onDone }: {
  gradeId: string
  onDone: () => void
}) {
  const grade = gradeById(gradeId)
  const [leaving, setLeaving] = useState(false)
  const doneRef = useRef(false)
  const reduced = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  // Fire audio once on mount.
  useEffect(() => {
    playRankUp()
    swellMusic()
  }, [])

  // Auto-dismiss after the hold.
  useEffect(() => {
    const t = window.setTimeout(() => dismiss(), HOLD_MS)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function dismiss() {
    if (doneRef.current) return
    doneRef.current = true
    setLeaving(true)
    window.setTimeout(onDone, 320)
  }

  if (!grade) { // unknown grade — never trap the user behind a blank overlay
    onDone()
    return null
  }

  const ring = GRADE_RING[grade.id]
  const kicker = grade.id === 'P' ? 'Permit Earned' : 'Rank Up'
  const gradeLabel = grade.id === 'P' ? 'Provisional' : `Grade ${grade.id}`

  return (
    <div
      onClick={dismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#050507',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', overflow: 'hidden',
        opacity: leaving ? 0 : 1,
        transition: 'opacity 300ms ease',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <style>{`
        @keyframes permitBeam { 0% { opacity: 0; transform: translateX(-50%) scaleY(0.2); } 60% { opacity: 0.8; } 100% { opacity: 0.55; transform: translateX(-50%) scaleY(1); } }
        @keyframes permitSpot { 0% { opacity: 0; transform: translate(-50%,-50%) scale(0.4); } 100% { opacity: 1; transform: translate(-50%,-50%) scale(1); } }
        @keyframes permitRise { 0% { opacity: 0; transform: translateY(26px) scale(0.9); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes permitKick { 0%,100% { opacity: 0.85; } 50% { opacity: 1; } }
      `}</style>

      {/* Beam of light from above */}
      {!reduced && (
        <div style={{
          position: 'absolute', top: 0, left: '50%', width: 220, height: '68%',
          transform: 'translateX(-50%)', transformOrigin: 'top center',
          background: `linear-gradient(to bottom, ${ring}44 0%, ${ring}18 35%, rgba(0,0,0,0) 78%)`,
          filter: 'blur(6px)', pointerEvents: 'none',
          animation: 'permitBeam 900ms cubic-bezier(0.22,1,0.36,1) both',
        }} />
      )}
      {/* Spotlight pool behind the plate */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        width: 520, height: 520, borderRadius: '50%',
        background: `radial-gradient(circle, ${ring}22 0%, ${ring}0c 40%, rgba(0,0,0,0) 70%)`,
        transform: 'translate(-50%,-50%)', pointerEvents: 'none',
        animation: reduced ? undefined : 'permitSpot 700ms cubic-bezier(0.22,1,0.36,1) both',
      }} />

      {/* The reveal */}
      <div style={{
        position: 'relative', textAlign: 'center', padding: '0 32px',
        animation: reduced ? undefined : 'permitRise 640ms cubic-bezier(0.22,1,0.36,1) 200ms both',
      }}>
        <div style={{
          fontFamily: FONT_UI, fontWeight: 800, fontSize: 12, letterSpacing: '0.42em',
          textTransform: 'uppercase', color: ring, marginBottom: 18,
          animation: reduced ? undefined : 'permitKick 2.2s ease-in-out 1s infinite',
        }}>
          {kicker}
        </div>

        {/* Grade plate */}
        <div style={{
          display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
          padding: '22px 40px', borderRadius: 4,
          border: `1px solid ${ring}`,
          boxShadow: `0 0 40px ${ring}33, inset 0 0 24px ${ring}14`,
          background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
        }}>
          <div style={{
            fontFamily: FONT_UI, fontWeight: 900, fontSize: 15, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'rgba(245,245,245,0.72)',
          }}>
            {gradeLabel}
          </div>
          <div style={{
            fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600,
            fontSize: 46, lineHeight: 1.05, color: '#f5f5f5', marginTop: 2,
            textShadow: `0 2px 30px ${ring}66`,
          }}>
            {grade.className}
          </div>
        </div>

        <div style={{
          fontFamily: FONT_UI, fontWeight: 600, fontSize: 12.5,
          color: 'rgba(245,240,228,0.5)', marginTop: 22, letterSpacing: '0.03em',
        }}>
          Tap to continue
        </div>
      </div>
    </div>
  )
}
