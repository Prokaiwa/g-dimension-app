// Route: /welcome — one-time handle claim shown after a new user first
// authenticates (email confirm or OAuth). The gate in App.tsx sends
// un-onboarded users here; on success we set the username + username_set=true
// and drop them into /home. Existing users (backfilled in migration 039) never
// see this screen.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  getCurrentUserProfile,
  normalizeUsername,
  isReservedUsername,
  isUsernameAvailable,
  markOnboarded,
  USERNAME_MIN_LEN,
  type UserProfile,
} from '../lib/userProfile'
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
  SPACE_XS,
  SPACE_SM,
  SPACE_MD,
  SPACE_LG,
  TRANSITION_STANDARD,
} from '../tokens'

type Status =
  | { kind: 'idle' }
  | { kind: 'short' }
  | { kind: 'reserved' }
  | { kind: 'checking' }
  | { kind: 'available' }
  | { kind: 'taken' }

const OK_GREEN = '#7bbf6a'

export default function WelcomePage() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Guards against a slow availability response overwriting a newer keystroke.
  const reqIdRef = useRef(0)

  useEffect(() => {
    getCurrentUserProfile().then(p => {
      if (!p) return
      setProfile(p)
      setUsername(p.username ?? '')
      setDisplayName(p.display_name ?? '')
    })
  }, [])

  // Debounced availability check whenever the handle changes.
  useEffect(() => {
    if (!profile) return
    const u = username
    if (u.length < USERNAME_MIN_LEN) { setStatus({ kind: 'short' }); return }
    if (isReservedUsername(u)) { setStatus({ kind: 'reserved' }); return }
    // Unchanged from what they already own → it's theirs.
    if (u === profile.username) { setStatus({ kind: 'available' }); return }

    setStatus({ kind: 'checking' })
    const reqId = ++reqIdRef.current
    const t = setTimeout(async () => {
      const free = await isUsernameAvailable(u, profile.id)
      if (reqId !== reqIdRef.current) return // a newer keystroke superseded this
      setStatus({ kind: free ? 'available' : 'taken' })
    }, 400)
    return () => clearTimeout(t)
  }, [username, profile])

  const canSubmit = status.kind === 'available' && !saving

  async function claim() {
    if (!profile || !canSubmit) return
    const u = normalizeUsername(username)
    setSaving(true)
    setError('')
    const { error: updateErr } = await supabase
      .from('users')
      .update({
        username: u,
        display_name: displayName.trim() || null,
        username_set: true,
      })
      .eq('id', profile.id)
    if (updateErr) {
      setSaving(false)
      if (updateErr.code === '23505') {
        setStatus({ kind: 'taken' })
      } else {
        setError('Could not save — please try again.')
      }
      return
    }
    markOnboarded(profile.id)
    navigate('/home', { replace: true })
  }

  const hint = (() => {
    switch (status.kind) {
      case 'short':     return { text: `At least ${USERNAME_MIN_LEN} characters — letters, numbers, underscores.`, color: COLOR_TEXT_SECONDARY }
      case 'reserved':  return { text: 'That handle is reserved.', color: COLOR_ACCENT }
      case 'checking':  return { text: 'Checking availability…', color: COLOR_TEXT_SECONDARY }
      case 'available': return { text: `@${username} is available.`, color: OK_GREEN }
      case 'taken':     return { text: `@${username} is taken — try another.`, color: COLOR_ACCENT }
      default:          return { text: 'This becomes your public link: gdimension.app/builds/…', color: COLOR_TEXT_SECONDARY }
    }
  })()

  return (
    <div style={{
      minHeight: '100dvh', background: GRADIENT_APP_BG, backgroundColor: COLOR_CAVITY_BG,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: `0 ${SPACE_LG}px`, fontFamily: FONT_UI,
    }}>
      <img src={logo} alt="G-Dimension" style={{ width: 124, marginBottom: SPACE_LG }} />

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
            borderBottom: `2px solid ${
              status.kind === 'available' ? OK_GREEN
              : (status.kind === 'taken' || status.kind === 'reserved') ? COLOR_ACCENT
              : 'rgba(240,228,200,0.28)'
            }`,
            transition: `border-color ${TRANSITION_STANDARD}`,
          }}>
            <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 16, color: COLOR_TEXT_SECONDARY, padding: '0 4px 0 12px' }}>@</span>
            <input
              value={username}
              onChange={e => setUsername(normalizeUsername(e.target.value))}
              placeholder="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: FONT_UI, fontWeight: 700, fontSize: 16, color: COLOR_TEXT_PRIMARY, paddingRight: 12 }}
            />
            <span style={{ width: 28, flexShrink: 0, textAlign: 'center', fontSize: 15 }}>
              {status.kind === 'available' && <span style={{ color: OK_GREEN }}>✓</span>}
              {(status.kind === 'taken' || status.kind === 'reserved') && <span style={{ color: COLOR_ACCENT }}>✕</span>}
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
