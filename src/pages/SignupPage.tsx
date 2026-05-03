import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ConcretePanelInput from '../components/ConcretePanelInput'
import logo from '../assets/logo/gdimensionlight.png'
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

export default function SignupPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const passwordMismatch = confirm.length > 0 && password !== confirm
  const canSubmit = email && password.length >= 8 && password === confirm && !loading

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    const { error: authError } = await supabase.auth.signUp({ email, password })
    setLoading(false)
    if (authError) {
      setError(authError.message)
    } else {
      setConfirmed(true)
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/home` },
    })
  }

  if (confirmed) {
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
        <img src={logo} alt="G-Dimension" style={{ width: 140, marginBottom: SPACE_LG }} />
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
          We sent a confirmation link to <strong style={{ color: COLOR_TEXT_PRIMARY }}>{email}</strong>.
          Click it to activate your account.
        </p>
        <button
          onClick={() => navigate('/login')}
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
      {/* Logo */}
      <img
        src={logo}
        alt="G-Dimension"
        style={{ width: 140, marginBottom: SPACE_LG }}
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
        Start your build.
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
        <div>
          <ConcretePanelInput
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            disabled={loading}
          />
          {password.length > 0 && password.length < 8 && (
            <p style={{ fontFamily: FONT_UI, fontSize: 11, color: COLOR_TEXT_SECONDARY, margin: '4px 0 0' }}>
              Minimum 8 characters
            </p>
          )}
        </div>
        <div>
          <ConcretePanelInput
            label="Confirm Password"
            type="password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            disabled={loading}
          />
          {passwordMismatch && (
            <p style={{ fontFamily: FONT_UI, fontSize: 11, color: COLOR_ACCENT, margin: '4px 0 0' }}>
              Passwords do not match
            </p>
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

        {/* Primary CTA */}
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
          {loading ? 'Creating account…' : 'Create Account'}
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

        {/* Google OAuth */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleLoading}
          style={{
            background: 'transparent',
            color: COLOR_TEXT_PRIMARY,
            fontFamily: FONT_UI,
            fontWeight: 600,
            fontSize: 13,
            border: '1px solid #2a2a2c',
            borderRadius: RADIUS_PILL,
            padding: '13px 40px',
            cursor: googleLoading ? 'default' : 'pointer',
            transition: `border-color ${TRANSITION_STANDARD}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: SPACE_SM,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#555' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a2a2c' }}
        >
          <GoogleIcon />
          {googleLoading ? 'Redirecting…' : 'Continue with Google'}
        </button>
      </form>

      {/* Switch to Login */}
      <button
        onClick={() => navigate('/login')}
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
        Already have an account?{' '}
        <span style={{ color: COLOR_TEXT_PRIMARY, textDecoration: 'underline' }}>Sign in</span>
      </button>

    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" fill="none">
      <path d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" fill="#FFC107"/>
      <path d="M6.306 14.691l6.571 4.819C14.655 15.108 19.000 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" fill="#FF3D00"/>
      <path d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" fill="#4CAF50"/>
      <path d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" fill="#1976D2"/>
    </svg>
  )
}
