// Route: /welcome — one-time handle claim shown after a new user first
// authenticates (email confirm or OAuth). The gate in App.tsx sends
// un-onboarded users here; on success we set the username + username_set=true
// and drop them into /home. Existing users (backfilled in migration 039) never
// see this screen.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  getCurrentUserProfile,
  normalizeUsername,
  hasInvalidUsernameChars,
  usernameStatusMessage,
  markOnboarded,
  type UserProfile,
} from '../lib/userProfile'
import { useUsernameStatus } from '../hooks/useUsernameStatus'
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
  SPACE_XS,
  SPACE_SM,
  SPACE_MD,
  SPACE_LG,
  TRANSITION_STANDARD,
  COLOR_SUCCESS,
} from '../tokens'

const OK_GREEN = COLOR_SUCCESS

export default function WelcomePage() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [invalidChar, setInvalidChar] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getCurrentUserProfile().then(p => {
      if (!p) return
      setProfile(p)
      setUsername(p.username ?? '')
      setDisplayName(p.display_name ?? '')
    })
  }, [])

  const status = useUsernameStatus(username, profile?.username ?? '', profile?.id ?? null)
  const canSubmit = status === 'available' && !invalidChar && !saving

  function onUsernameChange(raw: string) {
    setError('')
    setInvalidChar(hasInvalidUsernameChars(raw))
    setUsername(normalizeUsername(raw))
  }

  async function claim() {
    if (!profile || !canSubmit) return
    const u = normalizeUsername(username)
    setSaving(true)
    setError('')
    const { error: updateErr } = await supabase
      .from('users')
      .update({ username: u, display_name: displayName.trim() || null, username_set: true })
      .eq('id', profile.id)
    if (updateErr) {
      setSaving(false)
      setError(updateErr.code === '23505'
        ? 'That username was just taken — please pick another.'
        : 'Could not save — please try again.')
      return
    }
    markOnboarded(profile.id)
    navigate('/home', { replace: true })
  }

  const showOk    = !invalidChar && status === 'available'
  const showError = invalidChar || status === 'taken' || status === 'reserved'

  const hint = (() => {
    if (invalidChar) return { text: 'Only lowercase letters, numbers and underscores.', color: COLOR_ACCENT }
    if (status === 'idle') return { text: 'This becomes your public link: gdimension.app/builds/…', color: COLOR_TEXT_SECONDARY }
    if (status === 'available') return { text: usernameStatusMessage(status, username), color: OK_GREEN }
    const color = (status === 'taken' || status === 'reserved') ? COLOR_ACCENT : COLOR_TEXT_SECONDARY
    return { text: usernameStatusMessage(status, username), color }
  })()

  return (
    <div style={{
      minHeight: '100dvh', background: GRADIENT_APP_BG, backgroundColor: COLOR_CAVITY_BG,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: `0 ${SPACE_LG}px`, fontFamily: FONT_UI,
    }}>
      <img src={logo} alt="G-Dimension" style={{ width: 272, marginBottom: SPACE_SM }} />

      <p style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 500, fontSize: 26, color: COLOR_TEXT_PRIMARY, margin: `0 0 ${SPACE_XS}px` }}>
        Claim your handle.
      </p>
      <p style={{ fontFamily: FONT_UI, fontSize: 13, color: COLOR_TEXT_SECONDARY, textAlign: 'center', maxWidth: 300, lineHeight: 1.6, margin: `0 0 ${SPACE_LG}px` }}>
        Pick a username for your public build profile. You can change it later in your profile.
      </p>

      <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: SPACE_MD }}>
        {/* Username */}
        <div>
          <label style={{ display: 'block', fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: COLOR_TEXT_SECONDARY, marginBottom: SPACE_XS }}>
            Username
          </label>
          <div style={{
            display: 'flex', alignItems: 'center', height: 48,
            background: 'rgba(240,228,200,0.05)',
            border: '1px solid rgba(240,228,200,0.16)',
            borderBottom: `2px solid ${showOk ? OK_GREEN : showError ? COLOR_ACCENT : 'rgba(240,228,200,0.28)'}`,
            transition: `border-color ${TRANSITION_STANDARD}`,
          }}>
            <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 16, color: COLOR_TEXT_SECONDARY, padding: '0 4px 0 12px' }}>@</span>
            <input
              value={username}
              onChange={e => onUsernameChange(e.target.value)}
              placeholder="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: FONT_UI, fontWeight: 700, fontSize: 16, color: COLOR_TEXT_PRIMARY, paddingRight: 12 }}
            />
            <span style={{ width: 28, flexShrink: 0, textAlign: 'center', fontSize: 15 }}>
              {showOk && <span style={{ color: OK_GREEN }}>✓</span>}
              {showError && <span style={{ color: COLOR_ACCENT }}>✕</span>}
              {status === 'checking' && !invalidChar && <span style={{ color: COLOR_TEXT_SECONDARY, fontSize: 12 }}>…</span>}
            </span>
          </div>
          <p style={{ fontFamily: FONT_UI, fontSize: 11, color: hint.color, margin: '6px 2px 0', lineHeight: 1.4 }}>
            {hint.text}
          </p>
        </div>

        {/* Display name (optional) */}
        <div>
          <label style={{ display: 'block', fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: COLOR_TEXT_SECONDARY, marginBottom: SPACE_XS }}>
            Display Name <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>· optional</span>
          </label>
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="How your name appears"
            style={{ width: '100%', boxSizing: 'border-box', height: 48, background: 'rgba(240,228,200,0.05)', border: '1px solid rgba(240,228,200,0.16)', borderBottom: '2px solid rgba(240,228,200,0.28)', outline: 'none', fontFamily: FONT_UI, fontWeight: 700, fontSize: 16, color: COLOR_TEXT_PRIMARY, padding: '0 12px' }}
          />
        </div>

        {error && (
          <p style={{ fontFamily: FONT_UI, fontSize: 12, color: COLOR_ACCENT, margin: 0, textAlign: 'center' }}>{error}</p>
        )}

        <button
          onClick={claim}
          disabled={!canSubmit}
          style={{
            marginTop: SPACE_SM,
            background: !canSubmit ? '#555' : COLOR_ACCENT,
            color: '#fff', fontFamily: FONT_UI, fontWeight: 800, fontSize: 13, letterSpacing: '0.15em', textTransform: 'uppercase',
            border: 'none', borderRadius: RADIUS_PILL, padding: '15px 40px',
            cursor: !canSubmit ? 'default' : 'pointer', transition: `background ${TRANSITION_STANDARD}`,
          }}
          onMouseEnter={e => { if (canSubmit) e.currentTarget.style.background = COLOR_ACCENT_DIM }}
          onMouseLeave={e => { if (canSubmit) e.currentTarget.style.background = COLOR_ACCENT }}
        >
          {saving ? 'Setting up…' : 'Continue'}
        </button>
      </div>
    </div>
  )
}
