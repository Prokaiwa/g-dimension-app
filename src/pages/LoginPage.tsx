import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { authRedirectOrigin } from '../lib/nativeAuth'
import SocialSignIn from '../components/SocialSignIn'
import ConcretePanelInput from '../components/ConcretePanelInput'
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

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Forgot-password flow, in-page (mirrors SignupPage's confirmed-state pattern
  // rather than a new route): 'form' → 'reset' (enter email) → 'sent' (confirmation).
  const [mode, setMode] = useState<'form' | 'reset' | 'sent'>('form')
  const [resetEmail, setResetEmail] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (authError) {
      setError(authError.message)
    } else {
      navigate('/home')
    }
  }


  async function handleResetRequest(e: React.FormEvent) {
    e.preventDefault()
    setResetError('')
    setResetLoading(true)
    const { error: authError } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${authRedirectOrigin()}/auth/reset`,
    })
    setResetLoading(false)
    if (authError) {
      setResetError(authError.message)
    } else {
      setMode('sent')
    }
  }

  if (mode === 'sent') {
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
        <img src={logo} alt="G-Dimension" style={{ width: 272, height: 'auto', marginBottom: SPACE_SM }} />
        <p
          style={{
            fontFamily: FONT_TITLE,
            fontStyle: 'italic',
            fontWeight: 500,
            fontSize: 24,
            color: COLOR_TEXT_PRIMARY,
            margin: `0 0 ${SPACE_MD}px`,
          }}
        >
          Check your email.
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
          We sent a password reset link to <strong style={{ color: COLOR_TEXT_PRIMARY }}>{resetEmail}</strong>.
          Click it to choose a new password.
        </p>
        <button
          onClick={() => { setMode('form'); setResetEmail('') }}
          style={{
            background: 'none',
            border: 'none',
            color: COLOR_TEXT_SECONDARY,
            fontFamily: FONT_UI,
            fontWeight: 500,
            fontSize: 13,
            cursor: 'pointer',
            padding: `${SPACE_SM}px ${SPACE_MD}px`,
          }}
        >
          Back to{' '}
          <span style={{ color: COLOR_TEXT_PRIMARY, textDecoration: 'underline' }}>Sign in</span>
        </button>
      </div>
    )
  }

  if (mode === 'reset') {
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
        }}
      >
        <img src={logo} alt="G-Dimension" style={{ width: 272, height: 'auto', marginBottom: SPACE_SM }} />
        <p
          style={{
            fontFamily: FONT_TITLE,
            fontStyle: 'italic',
            fontWeight: 500,
            fontSize: 24,
            color: COLOR_TEXT_PRIMARY,
            margin: `0 0 ${SPACE_SM}px`,
          }}
        >
          Reset your password.
        </p>
        <p
          style={{
            fontFamily: FONT_UI,
            fontSize: 14,
            color: COLOR_TEXT_SECONDARY,
            maxWidth: 300,
            lineHeight: 1.6,
            margin: `0 0 ${SPACE_LG}px`,
            textAlign: 'center',
          }}
        >
          Enter your email and we'll send you a link to set a new password.
        </p>

        <form
          onSubmit={handleResetRequest}
          style={{
            width: '100%',
            maxWidth: 340,
            display: 'flex',
            flexDirection: 'column',
            gap: SPACE_MD,
          }}
        >
          <ConcretePanelInput
            label="Email"
            type="email"
            value={resetEmail}
            onChange={setResetEmail}
            autoComplete="email"
            disabled={resetLoading}
          />

          {resetError && (
            <p
              style={{
                fontFamily: FONT_UI,
                fontSize: 12,
                color: COLOR_ACCENT,
                margin: 0,
                textAlign: 'center',
              }}
            >
              {resetError}
            </p>
          )}

          <button
            type="submit"
            disabled={resetLoading || !resetEmail}
            onMouseDown={(e) => { e.currentTarget.style.transform = `scale(${SCALE_PRESS_DEFAULT})` }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
            style={{
              marginTop: SPACE_SM,
              background: resetLoading || !resetEmail ? '#555' : COLOR_ACCENT,
              color: '#ffffff',
              fontFamily: FONT_UI,
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              border: 'none',
              borderRadius: RADIUS_PILL,
              padding: '14px 40px',
              cursor: resetLoading || !resetEmail ? 'default' : 'pointer',
              transition: `background ${TRANSITION_STANDARD}, transform ${TRANSITION_STANDARD}`,
            }}
            onMouseEnter={(e) => {
              if (!resetLoading && resetEmail) e.currentTarget.style.background = COLOR_ACCENT_DIM
            }}
          >
            {resetLoading ? 'Sending…' : 'Send Reset Link'}
          </button>
        </form>

        <button
          onClick={() => { setMode('form'); setResetError('') }}
          style={{
            marginTop: SPACE_LG,
            background: 'none',
            border: 'none',
            color: COLOR_TEXT_SECONDARY,
            fontFamily: FONT_UI,
            fontWeight: 500,
            fontSize: 13,
            cursor: 'pointer',
            padding: `${SPACE_SM}px ${SPACE_MD}px`,
          }}
        >
          Back to{' '}
          <span style={{ color: COLOR_TEXT_PRIMARY, textDecoration: 'underline' }}>Sign in</span>
        </button>
      </div>
    )
  }

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
      }}
    >
      {/* Logo — G mark only (transparent, no white plate on the dark bg) */}
      <img
        src={logo}
        alt="G-Dimension"
        style={{ width: 272, height: 'auto', marginBottom: SPACE_SM }}
      />

      {/* Title */}
      <p
        style={{
          fontFamily: FONT_TITLE,
          fontStyle: 'italic',
          fontWeight: 500,
          fontSize: 24,
          color: COLOR_TEXT_PRIMARY,
          margin: `0 0 ${SPACE_LG}px`,
        }}
      >
        Welcome back.
      </p>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: 340,
          display: 'flex',
          flexDirection: 'column',
          gap: SPACE_MD,
        }}
      >
        <ConcretePanelInput
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          disabled={loading}
        />
        <ConcretePanelInput
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          disabled={loading}
        />

        <button
          type="button"
          onClick={() => { setMode('reset'); setResetEmail(email); setError('') }}
          style={{
            alignSelf: 'flex-end',
            background: 'none',
            border: 'none',
            color: COLOR_TEXT_SECONDARY,
            fontFamily: FONT_UI,
            fontWeight: 500,
            fontSize: 12,
            cursor: 'pointer',
            padding: 0,
            marginTop: -4,
          }}
        >
          Forgot password?
        </button>

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

        {/* Primary CTA */}
        <button
          type="submit"
          disabled={loading || !email || !password}
          onMouseDown={(e) => { e.currentTarget.style.transform = `scale(${SCALE_PRESS_DEFAULT})` }}
          onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
          style={{
            marginTop: SPACE_SM,
            background: loading || !email || !password ? '#555' : COLOR_ACCENT,
            color: '#ffffff',
            fontFamily: FONT_UI,
            fontWeight: 800,
            fontSize: 13,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            border: 'none',
            borderRadius: RADIUS_PILL,
            padding: '14px 40px',
            cursor: loading || !email || !password ? 'default' : 'pointer',
            transition: `background ${TRANSITION_STANDARD}, transform ${TRANSITION_STANDARD}`,
          }}
          onMouseEnter={(e) => {
            if (!loading && email && password) e.currentTarget.style.background = COLOR_ACCENT_DIM
          }}
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </button>

        {/* Divider */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: SPACE_SM,
            color: COLOR_TEXT_SECONDARY,
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          <div style={{ flex: 1, height: 1, background: '#2a2a2c' }} />
          <span>or</span>
          <div style={{ flex: 1, height: 1, background: '#2a2a2c' }} />
        </div>

        <SocialSignIn onError={setError} />
      </form>

      {/* Switch to Signup */}
      <button
        onClick={() => navigate('/signup')}
        style={{
          marginTop: SPACE_LG,
          background: 'none',
          border: 'none',
          color: COLOR_TEXT_SECONDARY,
          fontFamily: FONT_UI,
          fontWeight: 500,
          fontSize: 13,
          cursor: 'pointer',
          padding: `${SPACE_SM}px ${SPACE_MD}px`,
        }}
      >
        Don't have an account?{' '}
        <span style={{ color: COLOR_TEXT_PRIMARY, textDecoration: 'underline' }}>Sign up</span>
      </button>

    </div>
  )
}
