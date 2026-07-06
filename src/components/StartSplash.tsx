// Cold-launch splash — a Gran-Turismo-style boot moment. Black screen, the G
// badge fades in, then the wordmark, then a pulsing "START". Tapping anywhere
// (once START is up) plays the confirm sound, unlocks audio (the tap is the
// user gesture iOS requires), starts the music, and fades away to reveal the app.
//
// Shown once per cold launch (App gates it on sessionStorage, which resets when
// the PWA/tab is killed and reopened). Not lazy-loaded — it must paint instantly
// with no chunk flash, so it's a static import in App.
import { useEffect, useRef, useState } from 'react'
import { COLOR_CAVITY_BG, FONT_UI, EASING_SETTLE } from '../tokens'
import { playConfirm, prewarmSfx, configureAudioSession } from '../lib/sound'
import { startMusic } from '../lib/music'
import gBadge from '../assets/logo/gdimensionG.webp'

export default function StartSplash({ onStart }: { onStart: () => void }) {
  // 0 = black, 1 = badge in, 2 = wordmark in, 3 = START ready (tappable)
  const [phase, setPhase] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 160),
      setTimeout(() => setPhase(2), 980),
      setTimeout(() => setPhase(3), 1720),
    ]
    return () => timers.forEach(clearTimeout)
  }, [])

  const begin = () => {
    if (started.current || phase < 3) return
    started.current = true
    // The tap is the gesture that unlocks audio on iOS.
    configureAudioSession()
    prewarmSfx()
    playConfirm()
    void startMusic()
    setLeaving(true)
    setTimeout(onStart, 520)
  }

  return (
    <div
      onClick={begin}
      role="button"
      aria-label="Start G-Dimension"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: COLOR_CAVITY_BG,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        opacity: leaving ? 0 : 1,
        transition: 'opacity 500ms ease',
        cursor: phase >= 3 ? 'pointer' : 'default',
        WebkitTapHighlightColor: 'transparent', userSelect: 'none', touchAction: 'manipulation',
        paddingBottom: '6vh',
      }}
    >
      <style>{`@keyframes startPulse { 0%,100% { opacity: 0.5 } 50% { opacity: 1 } }`}</style>
      <img
        src={gBadge}
        alt=""
        draggable={false}
        style={{
          width: 92, height: 'auto', display: 'block',
          opacity: phase >= 1 ? 1 : 0,
          transform: phase >= 1 ? 'scale(1)' : 'scale(0.84)',
          transition: `opacity 820ms ease, transform 900ms ${EASING_SETTLE}`,
          filter: 'drop-shadow(0 8px 26px rgba(0,0,0,0.55))',
        }}
      />
      <span
        style={{
          marginTop: 24, display: 'block',
          fontFamily: FONT_UI, fontStyle: 'italic', fontWeight: 800,
          fontSize: 34, letterSpacing: '-0.04em', color: '#f5f5f5',
          opacity: phase >= 2 ? 1 : 0,
          transform: phase >= 2 ? 'translateY(0)' : 'translateY(9px)',
          transition: `opacity 700ms ease, transform 820ms ${EASING_SETTLE}`,
        }}
      >
        G-Dimension
      </span>
      <span
        style={{
          marginTop: 46,
          fontFamily: FONT_UI, fontWeight: 800, fontSize: 13,
          letterSpacing: '0.42em', paddingLeft: '0.42em',
          color: '#f5f5f5',
          opacity: phase >= 3 ? 1 : 0,
          transition: 'opacity 600ms ease',
          animation: phase >= 3 ? 'startPulse 2.2s ease-in-out infinite' : undefined,
        }}
      >
        START
      </span>
    </div>
  )
}
