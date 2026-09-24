import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { authRedirectOrigin } from '../lib/nativeAuth'
import SocialSignIn from '../components/SocialSignIn'
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

export default function SignupPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const canSubmit = !!email && passwordMeetsAll(password, confirm) && !loading

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!passwordMeetsAll(password, confirm)) { setError('Please meet all password requirements.'); return }
    setLoading(true)
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      // Land on the public callback page, which waits for the session to settle
      // out of the URL token, then routes to /welcome (handle claim) or /home.
      // (Redirecting straight to a protected route races the auth gate.)
      options: { emailRedirectTo: `${authRedirectOrigin()}/auth/callback` },
    })
    setLoading(false)
    if (authError) {
      setError(authError.message)
    } else {
      setConfirmed(true)
    }
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
          We sent a confirmation link to <strong style={{ color: COLOR_TEXT_PRIMARY }}>{email}</strong>.
          Click it to activate your account.
        </p>
        {/* Confirmation mail lands in spam often enough to be worth saying out
            loud, especially on Yahoo/AOL. Deliverability is being fixed at the
            DNS level too (DMARC), but the hint costs nothing and saves the
            signup either way. */}
        <p
          style={{
            fontFamily: FONT_UI,
            fontSize: 12.5,
            color: COLOR_TEXT_SECONDARY,
            opacity: 0.75,
            maxWidth: 280,
            lineHeight: 1.6,
            margin: `-${SPACE_SM}px 0 ${SPACE_LG}px`,
          }}
        >
          Don't see it? Check your spam or junk folder, and add
          {' '}<strong style={{ color: COLOR_TEXT_PRIMARY, fontWeight: 600 }}>noreply@gdimension.app</strong>
          {' '}to your contacts.
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

        <SocialSignIn onError={setError} />
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
