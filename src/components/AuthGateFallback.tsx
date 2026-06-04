import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  GRADIENT_APP_BG,
  COLOR_ACCENT,
  COLOR_ACCENT_TEXT,
  FONT_UI,
  FONT_TITLE,
  SPACE_SM,
  SPACE_MD,
  SPACE_LG,
  RADIUS_BUTTON,
} from '../tokens'

// Rendered by the auth gate while it resolves, instead of an empty screen.
//
// Normal loads resolve in well under HIDDEN_MS, so nothing flashes. If the gate
// is still unresolved at WATCHDOG_MS the auth layer is likely wedged
// (historically a Supabase lock deadlock that left a black screen on return
// after the token expired) — surface a visible, recoverable screen so a phone
// user is never staring at a dead black void with no way out.
const HIDDEN_MS = 600
const WATCHDOG_MS = 8000

type Stage = 'hidden' | 'spinner' | 'stuck'

export default function AuthGateFallback() {
  const [stage, setStage] = useState<Stage>('hidden')

  useEffect(() => {
    const t1 = setTimeout(() => setStage('spinner'), HIDDEN_MS)
    const t2 = setTimeout(() => setStage('stuck'), WATCHDOG_MS)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  async function signInAgain() {
    try { await supabase.auth.signOut() } catch { /* best effort — fall through to a hard nav */ }
    window.location.href = '/login'
  }

  if (stage === 'hidden') return null

  return (
    <div style={{ position: 'fixed', inset: 0, background: GRADIENT_APP_BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_UI, padding: '0 32px', textAlign: 'center', zIndex: 50 }}>
      <style>{`@keyframes gateSpin { to { transform: rotate(360deg); } }`}</style>

      {stage === 'spinner' ? (
        <div style={{ width: 26, height: 26, borderRadius: '50%', border: '2px solid rgba(240,228,200,0.2)', borderTopColor: COLOR_ACCENT, animation: 'gateSpin 700ms linear infinite' }} />
      ) : (
        <>
          <p style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 26, color: '#f5f5f5', margin: `0 0 ${SPACE_SM}px`, lineHeight: 1.2 }}>
            Still loading…
          </p>
          <p style={{ fontWeight: 500, fontSize: 13.5, color: 'rgba(245,245,245,0.55)', lineHeight: 1.6, margin: `0 0 ${SPACE_LG}px`, maxWidth: 300 }}>
            This is taking longer than it should — your session may have expired while the tab was asleep. Reload to retry, or sign in again.
          </p>
          <div style={{ display: 'flex', gap: SPACE_MD }}>
            <button onClick={() => window.location.reload()} style={{ minHeight: 44, padding: '0 22px', background: COLOR_ACCENT, border: 'none', borderRadius: RADIUS_BUTTON, color: COLOR_ACCENT_TEXT, fontFamily: FONT_UI, fontWeight: 800, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
              Reload
            </button>
            <button onClick={signInAgain} style={{ minHeight: 44, padding: '0 22px', background: 'none', border: '1px solid rgba(240,228,200,0.3)', borderRadius: RADIUS_BUTTON, color: '#f0e4c8', fontFamily: FONT_UI, fontWeight: 800, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
              Sign in again
            </button>
          </div>
        </>
      )}
    </div>
  )
}
