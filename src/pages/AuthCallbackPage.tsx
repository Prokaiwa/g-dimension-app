// Route: /auth/callback — landing target for the email-confirmation link and
// OAuth redirect. This MUST be a public (non-protected) route: a ProtectedRoute
// evaluates the auth gate before supabase-js has finished parsing the token out
// of the URL, so it would bounce to /login and the freshly-minted session would
// race-lose (the "goes to the main page, then says not authorized" bug).
//
// Here we wait for supabase-js to establish the session from the URL, then route
// the user to /welcome (new handle claim) or /home. If no session ever appears
// (expired / already-used link), we drop them on /login with a friendly note.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { isOnboarded } from '../lib/userProfile'
import {
  GRADIENT_APP_BG,
  COLOR_CAVITY_BG,
  COLOR_ACCENT,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  FONT_UI,
  FONT_TITLE,
  SPACE_LG,
  SPACE_MD,
} from '../tokens'
import logo from '../assets/logo/gdimensionG.webp'

export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let done = false

    async function route(userId: string) {
      if (done) return
      done = true
      const onboarded = await isOnboarded(userId)
      navigate(onboarded ? '/home' : '/welcome', { replace: true })
    }

    // The session may already be present (supabase-js parsed the URL synchronously
    // on load) or may arrive a beat later via SIGNED_IN. Cover both.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) route(data.session.user.id)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) setTimeout(() => route(session.user.id), 0)
    })

    // Safety valve: if nothing has resolved after a few seconds, the link was
    // expired or already used. Send them to sign in manually.
    const timeout = window.setTimeout(() => {
      if (!done) setFailed(true)
    }, 6000)

    return () => { subscription.unsubscribe(); window.clearTimeout(timeout) }
  }, [navigate])

  return (
    <div
      style={{
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
      }}
    >
      <img src={logo} alt="G-Dimension" style={{ width: 72, height: 'auto', marginBottom: SPACE_LG }} />
      {failed ? (
        <>
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
            Your email may already be confirmed. Sign in to continue.
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
              borderRadius: 9999,
              padding: '14px 40px',
              cursor: 'pointer',
            }}
          >
            Sign In
          </button>
        </>
      ) : (
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
          Confirming your account…
        </p>
      )}
    </div>
  )
}
