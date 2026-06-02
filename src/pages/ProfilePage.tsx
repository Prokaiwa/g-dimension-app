// Route: /profile — Own profile, reached via the avatar/name in the Home header
// (Part 10, Part 13). Shows identity (avatar, display name, @username, location,
// bio, plan) and is the doorway to Settings. Edit happens in a bottom sheet that
// writes straight to the `users` row. Settings live inside Profile per CLAUDE.md.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  getCurrentUserProfile,
  profileName,
  normalizeUsername,
  USERNAME_MIN_LEN,
  type UserProfile,
} from '../lib/userProfile'
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
} from '../tokens'

const _now        = new Date()
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_LABEL = MONTHS[_now.getMonth()]
const DAY_LABEL   = String(_now.getDate())

const CREAM       = '#f0e4c8'
const MUTED       = 'rgba(240,228,200,0.5)'
const FAINT       = 'rgba(240,228,200,0.32)'

type Draft = {
  display_name: string
  username: string
  bio: string
  city: string
  country: string
}

function avatarLetter(p: UserProfile): string {
  return profileName(p).charAt(0).toUpperCase() || '?'
}

function memberSince(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
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
        {sub && <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 12, color: MUTED, margin: '3px 0 0' }}>{sub}</p>}
      </div>
      <span style={{ flexShrink: 0, color: FAINT, fontSize: 20, lineHeight: 1 }}>›</span>
    </button>
  )
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const [draft, setDraft]       = useState<Draft | null>(null)
  const [saving, setSaving]     = useState(false)
  const [unameError, setUnameError] = useState<string | null>(null)
  const usernameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getCurrentUserProfile().then(p => {
      setProfile(p)
      setLoading(false)
    })
  }, [])

  function openEdit() {
    if (!profile) return
    setUnameError(null)
    setDraft({
      display_name: profile.display_name ?? '',
      username: profile.username ?? '',
      bio: profile.bio ?? '',
      city: profile.city ?? '',
      country: profile.country ?? '',
    })
  }

  async function save() {
    if (!draft || !profile) return
    const uname = normalizeUsername(draft.username)
    if (uname.length < USERNAME_MIN_LEN) {
      setUnameError(`At least ${USERNAME_MIN_LEN} characters — letters, numbers, underscores.`)
      usernameRef.current?.focus()
      return
    }
    setSaving(true)
    setUnameError(null)
    const payload = {
      display_name: draft.display_name.trim() || null,
      username: uname,
      bio: draft.bio.trim() || null,
      city: draft.city.trim() || null,
      country: draft.country.trim() || null,
    }
    const { data, error } = await supabase
      .from('users')
      .update(payload)
      .eq('id', profile.id)
      .select('id, username, email, display_name, avatar_url, city, country, bio, subscription_status, created_at')
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
  const isPro = profile?.subscription_status === 'pro'

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: GRADIENT_APP_BG, fontFamily: FONT_UI, overflow: 'hidden' }}>
      <style>{`
        @keyframes profileIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
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

              <h1 style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 32, color: '#f5f5f5', margin: `${SPACE_MD}px 0 0`, lineHeight: 1.1 }}>
                {profileName(profile)}
              </h1>
              <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 13.5, color: COLOR_ACCENT, letterSpacing: '0.02em', margin: `${SPACE_XS}px 0 0` }}>
                @{profile.username}
              </p>

              {(location || isPro) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: SPACE_SM, marginTop: SPACE_SM, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {location && (
                    <span style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 12.5, color: MUTED }}>{location}</span>
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
                marginTop: SPACE_LG, minHeight: 44, padding: '0 26px', borderRadius: 9999,
                background: 'none', border: `1px solid ${COLOR_ACCENT}`, cursor: 'pointer',
                color: COLOR_ACCENT, fontFamily: FONT_UI, fontWeight: 800, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase',
                WebkitTapHighlightColor: 'transparent',
              }}>
                Edit Profile
              </button>
            </div>

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
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, borderBottom: `1px solid ${unameError ? '#d27a5e' : 'rgba(240,228,200,0.22)'}`, background: 'rgba(240,228,200,0.05)' }}>
              <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 15, color: MUTED, paddingLeft: 10 }}>@</span>
              <input
                ref={usernameRef}
                value={draft.username}
                onChange={e => { setDraft({ ...draft, username: normalizeUsername(e.target.value) }); setUnameError(null) }}
                placeholder="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                style={{ ...sheetInput, borderBottom: 'none', background: 'none', paddingLeft: 2 }}
              />
            </div>
            <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 10.5, color: unameError ? '#d27a5e' : FAINT, margin: `6px 0 ${SPACE_MD}px`, lineHeight: 1.4 }}>
              {unameError ?? 'Lowercase letters, numbers and underscores. This is your public /builds link.'}
            </p>

            <FieldLabel>Bio</FieldLabel>
            <textarea value={draft.bio} onChange={e => setDraft({ ...draft, bio: e.target.value })} placeholder="A line about you and your build…" rows={3} style={{ ...sheetInput, resize: 'none', marginBottom: SPACE_MD }} />

            <div style={{ display: 'flex', gap: SPACE_MD }}>
              <div style={{ flex: 1 }}>
                <FieldLabel>City</FieldLabel>
                <input value={draft.city} onChange={e => setDraft({ ...draft, city: e.target.value })} placeholder="City" style={{ ...sheetInput, marginBottom: SPACE_LG }} />
              </div>
              <div style={{ flex: 1 }}>
                <FieldLabel>Country</FieldLabel>
                <input value={draft.country} onChange={e => setDraft({ ...draft, country: e.target.value })} placeholder="Country" style={{ ...sheetInput, marginBottom: SPACE_LG }} />
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
