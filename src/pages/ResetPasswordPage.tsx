// Route: /auth/reset — landing target for the "reset password" email link
// (supabase.auth.resetPasswordForEmail's redirectTo). This MUST be a public
// (non-protected) route for the same reason /auth/callback is: a ProtectedRoute
// evaluates the auth gate before supabase-js has finished parsing the recovery
// token out of the URL, so it would bounce to /login and the freshly-minted
// recovery session would race-lose.
//
// We wait for supabase-js to establish the (recovery) session from the URL,
// same both-paths pattern as AuthCallbackPage: getSession() may already resolve
// it, or it may arrive a beat later via onAuthStateChange (PASSWORD_RECOVERY /
// SIGNED_IN). Once a session exists we show a "set new password" form; if none
// appears within a few seconds the link was expired or already used.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ConcretePanelInput from '../components/ConcretePanelInput'
import PasswordChecklist, { passwordMeetsAll } from '../components/PasswordChecklist'
import logo from '../assets/logo/gdimensionG.webp'
import {
  GRADIENT_APP_BG,
  COLOR_CAVITY_BG,
  COLOR_ACCENT,
  COLOR_ACCENT_DIM,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  FONT_UI,
  FONT_TITLE,
  RADIUS_PILL,
  SPACE_LG,
  SPACE_MD,
  SPACE_SM,
  SCALE_PRESS_DEFAULT,
  TRANSITION_STANDARD,
} from '../tokens'

type Stage = 'waiting' | 'ready' | 'expired'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [stage, setStage] = useState<Stage>('waiting')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let done = false

    function markReady() {
      if (done) return
      done = true
      setStage('ready')
    }

    // The recovery session may already be present (supabase-js parsed the URL
    // synchronously on load) or may arrive a beat later via the auth state
    // change event. Cover both paths.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) markReady()
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      // Defer out of the callback — supabase-js holds its internal auth lock for
      // the duration of this callback; any Supabase query run straight from here
      // can deadlock (see the same warning on App.tsx's useAuthGate). We don't
      // query here, but keep the same setTimeout(0) discipline for consistency
      // and so future edits to this callback don't reintroduce the deadlock.
      if (session) setTimeout(() => markReady(), 0)
    })

    // Safety valve: if nothing has resolved after a few seconds, the link was
    // expired or already used.
    const timeout = window.setTimeout(() => {
      if (!done) setStage('expired')
    }, 7000)

    return () => { subscription.unsubscribe(); window.clearTimeout(timeout) }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!passwordMeetsAll(password, confirm)) { setError('Please meet all password requirements.'); return }
    setLoading(true)
    const { error: authError } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (authError) {
      setError(authError.message)
    } else {
      navigate('/home', { replace: true })
    }
  }

  const canSubmit = passwordMeetsAll(password, confirm) && !loading

  if (stage === 'waiting') {
    return (
      <div style={containerStyle}>
        <img src={logo} alt="G-Dimension" style={{ width: 72, height: 'auto', marginBottom: SPACE_LG }} />
        <p
          style={{
            fontFamily: FONT_TITLE,
            fontStyle: 'italic',
            fontWeight: 500,
            fontSize: 22,
            color: COLOR_TEXT_PRIMARY,
            margin: 0,
          }}
        >
          Verifying your link…
        </p>
      </div>
    )
  }

  if (stage === 'expired') {
    return (
      <div style={containerStyle}>
        <img src={logo} alt="G-Dimension" style={{ width: 72, height: 'auto', marginBottom: SPACE_LG }} />
        <p
          style={{
            fontFamily: FONT_TITLE,
            fontStyle: 'italic',
            fontWeight: 500,
            fontSize: 22,
            color: COLOR_TEXT_PRIMARY,
            margin: `0 0 ${SPACE_MD}px`,
          }}
        >
          This link has expired.
        </p>
        <p
          style={{
            fontFamily: FONT_UI,
            fontSize: 14,
            color: COLOR_TEXT_SECONDARY,
            maxWidth: 280,
            lineHeight: 1.6,
            margin: `0 0 ${SPACE_LG}px`,
          }}
        >
          Request a new password reset link and try again.
        </p>
        <button
          onClick={() => navigate('/login', { replace: true })}
          style={{
            background: COLOR_ACCENT,
            color: '#ffffff',
            fontFamily: FONT_UI,
            fontWeight: 800,
            fontSize: 13,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            border: 'none',
            borderRadius: RADIUS_PILL,
            padding: '14px 40px',
            cursor: 'pointer',
          }}
        >
          Sign In
        </button>
      </div>
    )
  }

  // stage === 'ready'
  return (
    <div style={{ ...containerStyle, textAlign: 'left' }}>
      <img
        src={logo}
        alt="G-Dimension"
        style={{ width: 272, height: 'auto', marginBottom: SPACE_SM, alignSelf: 'center' }}
      />
      <p
        style={{
          fontFamily: FONT_TITLE,
          fontStyle: 'italic',
          fontWeight: 500,
          fontSize: 24,
          color: COLOR_TEXT_PRIMARY,
          margin: `0 0 ${SPACE_LG}px`,
          textAlign: 'center',
          alignSelf: 'center',
        }}
      >
        Set a new password.
      </p>

      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: 340,
          display: 'flex',
          flexDirection: 'column',
          gap: SPACE_MD,
          alignSelf: 'center',
        }}
      >
        <ConcretePanelInput
          label="New Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          disabled={loading}
        />
        <div>
          <ConcretePanelInput
            label="Confirm Password"
            type="password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            disabled={loading}
          />
          {(password.length > 0 || confirm.length > 0) && (
            <PasswordChecklist password={password} confirm={confirm} />
          )}
        </div>

        {error && (
          <p
            style={{
              fontFamily: FONT_UI,
              fontSize: 12,
              color: COLOR_ACCENT,
              margin: 0,
              textAlign: 'center',
            }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          onMouseDown={(e) => { e.currentTarget.style.transform = `scale(${SCALE_PRESS_DEFAULT})` }}
          onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
          style={{
            marginTop: SPACE_SM,
            background: !canSubmit ? '#555' : COLOR_ACCENT,
            color: '#ffffff',
            fontFamily: FONT_UI,
            fontWeight: 800,
            fontSize: 13,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            border: 'none',
            borderRadius: RADIUS_PILL,
            padding: '14px 40px',
            cursor: !canSubmit ? 'default' : 'pointer',
            transition: `background ${TRANSITION_STANDARD}, transform ${TRANSITION_STANDARD}`,
          }}
          onMouseEnter={(e) => {
            if (canSubmit) e.currentTarget.style.background = COLOR_ACCENT_DIM
          }}
        >
          {loading ? 'Saving…' : 'Save Password'}
        </button>
      </form>
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  minHeight: '100dvh',
  background: GRADIENT_APP_BG,
  backgroundColor: COLOR_CAVITY_BG,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: `0 ${SPACE_LG}px`,
  fontFamily: FONT_UI,
  textAlign: 'center',
}
