// Route: /profile — Own profile, reached via the avatar/name in the Home header
// (Part 10, Part 13). Shows identity (avatar, display name, @username, location,
// plan badge, bio), a stats strip, and a garage preview, and is the doorway to
// Settings. Edit happens in a bottom sheet that writes straight to the `users`
// row. Settings live inside Profile per CLAUDE.md.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  getCurrentUserProfile,
  getProfileStats,
  profileName,
  normalizeUsername,
  hasInvalidUsernameChars,
  usernameStatusMessage,
  USERNAME_MIN_LEN,
  PROFILE_COLS,
  type UserProfile,
  type ProfileCar,
  type ProfileStats,
} from '../lib/userProfile'
import { useUsernameStatus } from '../hooks/useUsernameStatus'
import { COUNTRIES, codeForCountry, flagEmoji } from '../lib/countries'
import { uploadAvatar } from '../lib/avatar'
import BottomSheet, { FieldLabel, sheetInput } from '../components/BottomSheet'
import {
  GRADIENT_APP_BG,
  COLOR_HEADER_BLACK,
  COLOR_HEADER_WARM,
  COLOR_HEADER_TITLE,
  COLOR_BURGUNDY_M,
  COLOR_ACCENT,
  FONT_UI,
  FONT_TITLE,
  HEADER_HEIGHT,
  SPACE_XS,
  SPACE_SM,
  SPACE_MD,
  SPACE_LG,
  SPACE_XL,
  EASING_SETTLE,
  RADIUS_BUTTON,
} from '../tokens'

const _now        = new Date()
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_LABEL = MONTHS[_now.getMonth()]
const DAY_LABEL   = String(_now.getDate())

const CREAM = '#f0e4c8'
const MUTED = 'rgba(240,228,200,0.5)'
const FAINT = 'rgba(240,228,200,0.32)'
const OK_GREEN = '#7bbf6a'

type Draft = {
  display_name: string
  username: string
  bio: string
  city: string
  country: string
  country_code: string | null
}

function avatarLetter(p: UserProfile): string {
  return profileName(p).charAt(0).toUpperCase() || '?'
}

function memberSince(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function carSubtitle(c: ProfileCar): string {
  return [c.year, c.make, c.model].filter(Boolean).join(' ')
}

// One headline number in the stats strip.
function Stat({ value, label, onClick }: { value: number; label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} disabled={!onClick} style={{
      flex: 1, background: 'none', border: 'none', padding: `${SPACE_SM}px 0`,
      cursor: onClick ? 'pointer' : 'default', WebkitTapHighlightColor: 'transparent',
    }}>
      <div style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 22, color: CREAM, lineHeight: 1 }}>{value}</div>
      <div style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: FAINT, marginTop: 5 }}>{label}</div>
    </button>
  )
}

// A labelled value row in the Account section.
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: SPACE_MD, padding: `${SPACE_SM}px 0`, borderBottom: '1px solid rgba(240,228,200,0.07)' }}>
      <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: FAINT, flexShrink: 0 }}>{label}</span>
      <span style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 13.5, color: MUTED, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  )
}

// A tappable navigation row (View public profile / Settings).
function NavRow({ label, sub, onClick }: { label: string; sub?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: SPACE_MD, padding: `14px 0`,
      background: 'none', border: 'none', borderBottom: '1px solid rgba(240,228,200,0.07)',
      cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 15, color: CREAM, margin: 0, lineHeight: 1.2 }}>{label}</p>
        {sub && <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 12, color: MUTED, margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</p>}
      </div>
      <span style={{ flexShrink: 0, color: FAINT, fontSize: 20, lineHeight: 1 }}>›</span>
    </button>
  )
}

function CameraIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff5dc" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [stats, setStats]     = useState<ProfileStats | null>(null)
  const [loading, setLoading] = useState(true)

  const [draft, setDraft]           = useState<Draft | null>(null)
  const [saving, setSaving]         = useState(false)
  const [unameError, setUnameError] = useState<string | null>(null)
  const [draftInvalidChar, setDraftInvalidChar] = useState(false)
  const [usernameDirty, setUsernameDirty] = useState(false)
  const usernameRef = useRef<HTMLInputElement>(null)

  // Live handle status for the edit sheet (idle/no-query while the sheet is closed).
  const unameStatus = useUsernameStatus(
    draft?.username ?? '',
    profile?.username ?? '',
    draft ? (profile?.id ?? null) : null,
  )

  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading]     = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // let the user re-pick the same file later
    if (!file || !profile) return
    if (!file.type.startsWith('image/')) { setUploadError('Please choose an image file.'); return }
    setUploading(true)
    setUploadError(null)
    try {
      const url = await uploadAvatar(file, profile.id, profile.avatar_url)
      const { error } = await supabase.from('users').update({ avatar_url: url }).eq('id', profile.id)
      if (error) throw error
      setProfile({ ...profile, avatar_url: url })
    } catch {
      setUploadError('Couldn’t update your photo — please try again.')
    } finally {
      setUploading(false)
    }
  }

  useEffect(() => {
    getCurrentUserProfile().then(p => {
      setProfile(p)
      setLoading(false)
      if (p) getProfileStats(p.id).then(setStats)
    })
  }, [])

  function openEdit() {
    if (!profile) return
    setUnameError(null)
    setDraftInvalidChar(false)
    setUsernameDirty(false)
    setDraft({
      display_name: profile.display_name ?? '',
      username: profile.username ?? '',
      bio: profile.bio ?? '',
      city: profile.city ?? '',
      country: profile.country ?? '',
      country_code: profile.country_code ?? null,
    })
  }

  async function save() {
    if (!draft || !profile) return
    const uname = normalizeUsername(draft.username)
    if (draftInvalidChar) {
      setUnameError('Only lowercase letters, numbers and underscores.')
      usernameRef.current?.focus(); return
    }
    if (uname.length < USERNAME_MIN_LEN) {
      setUnameError(`At least ${USERNAME_MIN_LEN} characters — letters, numbers, underscores.`)
      usernameRef.current?.focus(); return
    }
    if (unameStatus === 'reserved') { setUnameError('That handle is reserved.'); usernameRef.current?.focus(); return }
    if (unameStatus === 'taken')    { setUnameError('That username is already taken.'); usernameRef.current?.focus(); return }
    if (unameStatus === 'checking') { setUnameError('Still checking that handle…'); return }
    setSaving(true)
    setUnameError(null)
    const country = draft.country.trim()
    const payload = {
      display_name: draft.display_name.trim() || null,
      username: uname,
      bio: draft.bio.trim() || null,
      city: draft.city.trim() || null,
      country: country || null,
      // Keep the code in sync with the chosen country; clear it if the country
      // is blank or a free-typed value we don't recognise.
      country_code: country ? (draft.country_code ?? codeForCountry(country)) : null,
    }
    const { data, error } = await supabase
      .from('users')
      .update(payload)
      .eq('id', profile.id)
      .select(PROFILE_COLS)
      .single()
    setSaving(false)
    if (error) {
      // 23505 = unique_violation on the username column.
      if (error.code === '23505') {
        setUnameError('That username is already taken.')
        usernameRef.current?.focus()
      } else {
        setUnameError('Could not save — please try again.')
      }
      return
    }
    if (data) setProfile(data as UserProfile)
    setDraft(null)
  }

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const location = profile ? [profile.city, profile.country].filter(Boolean).join(', ') : ''
  const flag = profile ? (flagEmoji(profile.country_code) || flagEmoji(codeForCountry(profile.country ?? ''))) : ''
  const isPro = profile?.subscription_status === 'pro'

  // Live handle feedback for the edit sheet. Status styling only appears once the
  // user has actually edited the handle — opening the sheet shouldn't announce
  // your own current username as "available".
  const DEFAULT_UNAME_HINT = 'Lowercase letters, numbers and underscores. This is your public /builds link.'
  const unameShowOk    = !!draft && usernameDirty && !draftInvalidChar && !unameError && unameStatus === 'available'
  const unameShowError = !!draft && (draftInvalidChar || !!unameError || (usernameDirty && (unameStatus === 'taken' || unameStatus === 'reserved')))
  const unameHint = (() => {
    if (!draft) return { text: '', color: FAINT }
    if (unameError) return { text: unameError, color: '#d27a5e' }
    if (draftInvalidChar) return { text: 'Only lowercase letters, numbers and underscores.', color: '#d27a5e' }
    if (!usernameDirty) return { text: DEFAULT_UNAME_HINT, color: FAINT }
    if (unameStatus === 'available') return { text: usernameStatusMessage('available', draft.username), color: OK_GREEN }
    if (unameStatus === 'idle') return { text: DEFAULT_UNAME_HINT, color: FAINT }
    const color = (unameStatus === 'taken' || unameStatus === 'reserved') ? '#d27a5e' : FAINT
    return { text: usernameStatusMessage(unameStatus, draft.username), color }
  })()
  const legacyCountry = draft && draft.country && !COUNTRIES.some(c => c.name === draft.country) ? draft.country : null

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: GRADIENT_APP_BG, fontFamily: FONT_UI, overflow: 'hidden' }}>
      <style>{`
        @keyframes profileIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes profileSpin { to { transform: rotate(360deg); } }
        .garage-scroll::-webkit-scrollbar { display: none; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ position: 'relative', height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 10, paddingRight: 14, flexShrink: 0, zIndex: 10, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => navigate('/home')} aria-label="Back" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px 4px 4px', display: 'flex', alignItems: 'center' }}>
            <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
          </button>
          <span style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 22, color: COLOR_HEADER_TITLE, letterSpacing: '0.01em' }}>Profile</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
          <div style={{ background: 'rgba(242,238,228,0.94)', color: '#0d0d0d', padding: '4px 7px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>{MONTH_LABEL}</div>
          <div style={{ background: COLOR_BURGUNDY_M, color: '#fff', padding: '4px 8px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: DAY_LABEL.length === 1 ? 24 : 30 }}>{DAY_LABEL}</div>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60%' }}>
            <span style={{ fontFamily: FONT_UI, fontSize: 12, color: FAINT, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Loading…</span>
          </div>
        )}

        {!loading && !profile && (
          <div style={{ padding: `${SPACE_XL}px ${SPACE_MD}px`, textAlign: 'center' }}>
            <p style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 14, color: MUTED }}>Couldn’t load your profile.</p>
            <button onClick={signOut} style={{ marginTop: SPACE_MD, background: 'none', border: `1px solid ${MUTED}`, cursor: 'pointer', color: CREAM, fontFamily: FONT_UI, fontWeight: 700, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '10px 18px' }}>Sign out</button>
          </div>
        )}

        {!loading && profile && (
          <div style={{ padding: `${SPACE_XL}px ${SPACE_MD}px calc(${SPACE_XL}px + env(safe-area-inset-bottom))`, animation: `profileIn 360ms ${EASING_SETTLE} both` }}>

            {/* Hero — avatar + identity */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploading}
                aria-label="Change profile photo"
                style={{ position: 'relative', width: 92, height: 92, padding: 0, border: 'none', background: 'none', borderRadius: '50%', cursor: uploading ? 'default' : 'pointer', WebkitTapHighlightColor: 'transparent' }}
              >
                <div style={{
                  width: 92, height: 92, borderRadius: '50%',
                  background: profile.avatar_url ? `center / cover no-repeat url(${profile.avatar_url})` : COLOR_ACCENT,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 6px 18px rgba(0,0,0,0.55)', border: '1px solid rgba(240,228,200,0.12)',
                }}>
                  {!profile.avatar_url && (
                    <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 38, color: '#fff' }}>{avatarLetter(profile)}</span>
                  )}
                </div>
                {/* Camera affordance */}
                <div style={{ position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderRadius: '50%', background: COLOR_ACCENT, border: '2px solid #161412', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.5)' }}>
                  <CameraIcon />
                </div>
                {/* Uploading overlay */}
                {uploading && (
                  <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid rgba(240,228,200,0.25)', borderTopColor: CREAM, animation: 'profileSpin 700ms linear infinite' }} />
                  </div>
                )}
              </button>
              <input ref={avatarInputRef} type="file" accept="image/*" onChange={onPickAvatar} style={{ display: 'none' }} />
              {uploadError && (
                <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 11, color: COLOR_ACCENT, margin: `${SPACE_SM}px 0 0`, textAlign: 'center' }}>{uploadError}</p>
              )}

              <h1 style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 32, color: '#f5f5f5', margin: `${SPACE_MD}px 0 0`, lineHeight: 1.1 }}>
                {profileName(profile)}
              </h1>
              <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 13.5, color: COLOR_ACCENT, letterSpacing: '0.02em', margin: `${SPACE_XS}px 0 0` }}>
                @{profile.username}
              </p>

              {(location || isPro) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: SPACE_SM, marginTop: SPACE_SM, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {location && (
                    <span style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 12.5, color: MUTED }}>
                      {flag && <span style={{ marginRight: 5 }}>{flag}</span>}{location}
                    </span>
                  )}
                  <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: isPro ? '#fff5dc' : MUTED, background: isPro ? COLOR_ACCENT : 'rgba(240,228,200,0.08)', border: isPro ? 'none' : '1px solid rgba(240,228,200,0.16)', padding: '3px 8px', borderRadius: 2 }}>
                    {isPro ? 'Pro' : 'Free'}
                  </span>
                </div>
              )}

              {profile.bio && (
                <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontStyle: 'italic', fontSize: 14, color: 'rgba(240,228,200,0.7)', lineHeight: 1.55, margin: `${SPACE_MD}px 0 0`, maxWidth: 320 }}>
                  {profile.bio}
                </p>
              )}

              <button onClick={openEdit} style={{
                marginTop: SPACE_LG, minHeight: 44, padding: '0 26px', borderRadius: RADIUS_BUTTON,
                background: 'none', border: `1px solid ${COLOR_ACCENT}`, cursor: 'pointer',
                color: COLOR_ACCENT, fontFamily: FONT_UI, fontWeight: 800, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase',
                WebkitTapHighlightColor: 'transparent',
              }}>
                Edit Profile
              </button>
            </div>

            {/* Stats strip */}
            <div style={{ display: 'flex', alignItems: 'stretch', marginTop: SPACE_XL, padding: `4px 0`, borderTop: '1px solid rgba(240,228,200,0.07)', borderBottom: '1px solid rgba(240,228,200,0.07)' }}>
              <Stat value={stats?.cars.length ?? 0} label="Cars" onClick={() => navigate('/garage/cars')} />
              <div style={{ width: 1, background: 'rgba(240,228,200,0.07)' }} />
              <Stat value={stats?.modCount ?? 0} label="Mods" onClick={() => navigate('/tuning/build-sheet')} />
              <div style={{ width: 1, background: 'rgba(240,228,200,0.07)' }} />
              <Stat value={stats?.photoCount ?? 0} label="Photos" onClick={() => navigate('/photos')} />
            </div>

            {/* Garage preview */}
            <p style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: FAINT, margin: `${SPACE_XL}px 0 ${SPACE_SM}px` }}>Garage</p>
            {stats && stats.cars.length === 0 ? (
              <button onClick={() => navigate('/garage/cars/new')} style={{
                width: '100%', minHeight: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: SPACE_SM,
                background: 'rgba(240,228,200,0.04)', border: '1px dashed rgba(240,228,200,0.2)', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
              }}>
                <span style={{ color: COLOR_ACCENT, fontSize: 20, fontWeight: 300, lineHeight: 1 }}>+</span>
                <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 13, color: MUTED }}>Add your first car</span>
              </button>
            ) : (
              <div className="garage-scroll" style={{ display: 'flex', gap: SPACE_SM, overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', margin: `0 -${SPACE_MD}px`, padding: `0 ${SPACE_MD}px` }}>
                {(stats?.cars ?? []).map(c => (
                  <button key={c.id} onClick={() => navigate('/garage/cars')} style={{
                    flexShrink: 0, width: 150, background: 'rgba(240,228,200,0.04)', border: '1px solid rgba(240,228,200,0.08)',
                    cursor: 'pointer', padding: 0, textAlign: 'left', WebkitTapHighlightColor: 'transparent',
                  }}>
                    <div style={{ height: 92, background: '#0c0a08', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {c.garage_photo_url
                        ? <img src={c.garage_photo_url} alt={c.nickname} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        : <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: FAINT }}>No photo</span>}
                    </div>
                    <div style={{ padding: `${SPACE_SM}px ${SPACE_SM}px ${SPACE_SM + 2}px` }}>
                      <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 13, color: CREAM, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nickname}</p>
                      <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 11, color: MUTED, margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{carSubtitle(c) || '—'}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Navigation */}
            <div style={{ marginTop: SPACE_XL, borderTop: '1px solid rgba(240,228,200,0.07)' }}>
              <NavRow label="View public profile" sub={`gdimension.app/builds/${profile.username}`} onClick={() => navigate(`/builds/${profile.username}`)} />
              <NavRow label="Settings" sub="Units, preferences, archived cars" onClick={() => navigate('/settings')} />
            </div>

            {/* Account */}
            <p style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: FAINT, margin: `${SPACE_XL}px 0 ${SPACE_XS}px` }}>Account</p>
            <div>
              <InfoRow label="Email" value={profile.email} />
              <InfoRow label="Member since" value={memberSince(profile.created_at)} />
            </div>

            {/* Sign out */}
            <button onClick={signOut} style={{
              width: '100%', minHeight: 48, marginTop: SPACE_XL,
              background: 'none', border: '1px solid rgba(180,60,40,0.5)', cursor: 'pointer',
              color: '#d27a5e', fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
              WebkitTapHighlightColor: 'transparent',
            }}>
              Sign Out
            </button>
          </div>
        )}
      </div>

      {/* ── Edit sheet ── */}
      <BottomSheet open={!!draft} onClose={() => setDraft(null)} title="Edit Profile" busy={saving}>
        {draft && (
          <>
            <FieldLabel>Display Name</FieldLabel>
            <input value={draft.display_name} onChange={e => setDraft({ ...draft, display_name: e.target.value })} placeholder="How your name appears" style={{ ...sheetInput, marginBottom: SPACE_MD }} />

            <FieldLabel>Username</FieldLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, borderBottom: `1px solid ${unameShowError ? '#d27a5e' : unameShowOk ? OK_GREEN : 'rgba(240,228,200,0.22)'}`, background: 'rgba(240,228,200,0.05)' }}>
              <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 15, color: MUTED, paddingLeft: 10 }}>@</span>
              <input
                ref={usernameRef}
                value={draft.username}
                onChange={e => { const raw = e.target.value; setUsernameDirty(true); setDraftInvalidChar(hasInvalidUsernameChars(raw)); setDraft({ ...draft, username: normalizeUsername(raw) }); setUnameError(null) }}
                placeholder="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                style={{ ...sheetInput, borderBottom: 'none', background: 'none', paddingLeft: 2 }}
              />
              <span style={{ width: 26, flexShrink: 0, textAlign: 'center', fontSize: 13, paddingRight: 6 }}>
                {unameShowOk && <span style={{ color: OK_GREEN }}>✓</span>}
                {unameShowError && <span style={{ color: '#d27a5e' }}>✕</span>}
                {usernameDirty && !draftInvalidChar && !unameError && unameStatus === 'checking' && <span style={{ color: FAINT }}>…</span>}
              </span>
            </div>
            <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 10.5, color: unameHint.color, margin: `6px 0 ${SPACE_MD}px`, lineHeight: 1.4 }}>
              {unameHint.text}
            </p>

            <FieldLabel>Bio</FieldLabel>
            <textarea value={draft.bio} onChange={e => setDraft({ ...draft, bio: e.target.value.slice(0, 200) })} placeholder="A line about you and your build…" rows={3} style={{ ...sheetInput, resize: 'none', marginBottom: 4 }} />
            <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 10.5, color: FAINT, margin: `0 0 ${SPACE_MD}px`, textAlign: 'right' }}>{draft.bio.length}/200</p>

            <div style={{ display: 'flex', gap: SPACE_MD }}>
              <div style={{ flex: 1 }}>
                <FieldLabel>City</FieldLabel>
                <input value={draft.city} onChange={e => setDraft({ ...draft, city: e.target.value })} placeholder="City" style={{ ...sheetInput, marginBottom: SPACE_LG }} />
              </div>
              <div style={{ flex: 1 }}>
                <FieldLabel>Country</FieldLabel>
                <div style={{ position: 'relative', marginBottom: SPACE_LG }}>
                  <select
                    value={draft.country}
                    onChange={e => { const name = e.target.value; setDraft({ ...draft, country: name, country_code: codeForCountry(name) }) }}
                    style={{ ...sheetInput, marginBottom: 0, height: 41, cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', paddingRight: 28 }}
                  >
                    <option value="">Select country…</option>
                    {legacyCountry && <option value={legacyCountry}>{legacyCountry}</option>}
                    {COUNTRIES.map(c => <option key={c.code} value={c.name}>{flagEmoji(c.code)}  {c.name}</option>)}
                  </select>
                  {/* Custom chevron — matches the field label colour (native arrow is unstyleable/black) */}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(240,228,200,0.45)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>
              </div>
            </div>

            <button onClick={save} disabled={saving} style={{ width: '100%', minHeight: 48, background: COLOR_ACCENT, border: 'none', cursor: saving ? 'default' : 'pointer', color: '#fff5dc', fontFamily: FONT_UI, fontWeight: 800, fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </>
        )}
      </BottomSheet>
    </div>
  )
}
