// The rank-up celebration. A black curtain, a slow beam of light, and the
// actual permit card fading up and turning slowly on its Y axis — stretched and
// cinematic (Gran-Turismo-reveal pacing), not a quick pop. A triumphant sting
// plays and the background music ducks; both fade on accept. No auto-timer: it
// waits for a tap ("accept your permit").
//
// Self-contained: no libraries, keyframes inline, respects reduced-motion.
import { useEffect, useRef, useState } from 'react'
import type { Grade, GradeProgress } from '../lib/license'
import { GRADE_RING } from '../lib/permit'
import { playRankUp } from '../lib/sound'
import { duckMusic } from '../lib/music'
import LicenseCard from './LicenseCard'
import { FONT_UI } from '../tokens'

export default function PermitCelebration({
  grade, next, toNext, driver, handle, licensed, profileUrl, onDone,
}: {
  grade: Grade
  next: Grade | null
  toNext: GradeProgress[]
  driver: string
  handle: string
  licensed: string
  profileUrl: string
  onDone: () => void
}) {
  const [leaving, setLeaving] = useState(false)
  const doneRef = useRef(false)
  const stopSound = useRef<() => void>(() => {})
  const restoreMusic = useRef<() => void>(() => {})
  const reduced = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    stopSound.current = playRankUp()
    restoreMusic.current = duckMusic()
  }, [])

  function dismiss() {
    if (doneRef.current) return
    doneRef.current = true
    stopSound.current()
    restoreMusic.current()
    setLeaving(true)
    window.setTimeout(onDone, 420)
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
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 28, padding: '0 24px', cursor: 'pointer', overflow: 'hidden',
        opacity: leaving ? 0 : 1,
        transition: `opacity ${leaving ? 400 : 700}ms ease`,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <style>{`
        @keyframes permitBeam { 0% { opacity: 0; transform: translateX(-50%) scaleY(0.15); } 100% { opacity: 0.5; transform: translateX(-50%) scaleY(1); } }
        @keyframes permitSpot { 0% { opacity: 0; transform: translate(-50%,-50%) scale(0.35); } 100% { opacity: 1; transform: translate(-50%,-50%) scale(1); } }
        @keyframes permitFadeUp { 0% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes permitCardIn { 0% { opacity: 0; transform: scale(0.965); filter: blur(9px); } 100% { opacity: 1; transform: scale(1); filter: blur(0); } }
        @keyframes permitBreathe { 0%,100% { opacity: 0.55; } 50% { opacity: 0.9; } }
      `}</style>

      {/* Slow beam of light from above */}
      {!reduced && (
        <div style={{
          position: 'absolute', top: 0, left: '50%', width: 260, height: '72%',
          transform: 'translateX(-50%)', transformOrigin: 'top center',
          background: `linear-gradient(to bottom, ${ring}3a 0%, ${ring}14 38%, rgba(0,0,0,0) 80%)`,
          filter: 'blur(8px)', pointerEvents: 'none',
          animation: 'permitBeam 2600ms cubic-bezier(0.22,1,0.36,1) both',
        }} />
      )}
      {/* Spotlight pool, growing slowly */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        width: 560, height: 560, borderRadius: '50%',
        background: `radial-gradient(circle, ${ring}20 0%, ${ring}0b 42%, rgba(0,0,0,0) 72%)`,
        transform: 'translate(-50%,-50%)', pointerEvents: 'none',
        animation: reduced ? undefined : 'permitSpot 2600ms cubic-bezier(0.22,1,0.36,1) both',
      }} />

      {/* Kicker */}
      <div style={{
        position: 'relative',
        fontFamily: FONT_UI, fontWeight: 800, fontSize: 12, letterSpacing: '0.44em',
        textTransform: 'uppercase', color: ring, textAlign: 'center',
        animation: reduced ? undefined : 'permitFadeUp 1600ms cubic-bezier(0.22,1,0.36,1) 900ms both',
      }}>
        {kicker}
        <div style={{ marginTop: 8, fontSize: 10.5, letterSpacing: '0.3em', color: 'rgba(245,245,245,0.5)' }}>
          {gradeLabel}
        </div>
      </div>

      {/* The real permit, fading up and turning slowly. pointerEvents:none so a
          tap anywhere dismisses instead of flipping the card. */}
      <div style={{
        position: 'relative', width: 'min(86vw, 380px)', pointerEvents: 'none',
        // Soft, delayed entry: invisible until 1.5s, then a gentle blur-fade up
        // over 2s. `backwards` fill leaves NO lingering filter afterwards, so the
        // 3D spin (which starts at spinDelay, after the fade) renders with depth.
        animation: reduced ? undefined : 'permitCardIn 2000ms cubic-bezier(0.22,1,0.36,1) 1500ms backwards',
      }}>
        <LicenseCard
          grade={grade} next={next} toNext={toNext}
          driver={driver} handle={handle} licensed={licensed} profileUrl={profileUrl}
          spin={!reduced}
          spinDelay={reduced ? '0s' : '3600ms'}
        />
      </div>

      {/* Accept prompt — arrives last, breathing gently */}
      <div style={{
        position: 'relative',
        fontFamily: FONT_UI, fontWeight: 600, fontSize: 12.5, letterSpacing: '0.06em',
        color: 'rgba(245,240,228,0.55)', textAlign: 'center',
        animation: reduced ? undefined : 'permitFadeUp 1200ms ease 3800ms both, permitBreathe 3s ease-in-out 5000ms infinite',
      }}>
        {grade.id === 'P' ? 'Tap anywhere to accept your permit' : 'Tap anywhere to accept your new ranking'}
      </div>
    </div>
  )
}
