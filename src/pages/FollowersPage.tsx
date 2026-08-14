// Route: /followers — who follows you (migration 095, ADR-032).
//
// 086 shipped the "people I follow" list and never its inverse, so you could
// gain followers and have nowhere to see them. 094 then started sending
// "You have a new follower", which pointed at a room that did not exist.
//
// Follow back is the whole point of the screen, so it lives on the row rather
// than behind a trip to each profile.
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getFollowers, followUser, unfollowUser, type Follower } from '../lib/follows'
import { getCurrentUserProfile } from '../lib/userProfile'
import { flagEmoji } from '../lib/countries'
import {
  GRADIENT_APP_BG, COLOR_HEADER_BLACK, COLOR_HEADER_TITLE, COLOR_ACCENT,
  FONT_UI, FONT_TITLE, HEADER_HEIGHT_SAFE, SAFE_TOP, SPACE_XS, SPACE_SM, SPACE_MD, SPACE_LG,
  RADIUS_BUTTON,
} from '../tokens'

const CREAM = '#f0e4c8'
const MUTED = 'rgba(240,228,200,0.5)'
const FAINT = 'rgba(240,228,200,0.32)'

function Avatar({ u }: { u: Follower }) {
  const letter = (u.display_name || u.username || '?').charAt(0).toUpperCase()
  if (u.avatar_url) {
    return <img src={u.avatar_url} alt="" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  }
  return (
    <div style={{
      width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
      background: 'rgba(240,228,200,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: FONT_UI, fontWeight: 800, fontSize: 15, color: MUTED,
    }}>{letter}</div>
  )
}

export default function FollowersPage() {
  const navigate = useNavigate()
  const [rows, setRows]     = useState<Follower[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const me = await getCurrentUserProfile()
      if (!me) { setRows([]); return }
      setRows(await getFollowers(me.id))
    })()
  }, [])

  // Optimistic, and reverted on failure — same reasoning as the search results:
  // the button IS the feedback, and dead time reads as a broken tap.
  const toggle = useCallback(async (u: Follower) => {
    setBusyId(u.id)
    const was = !!u.follows_back
    setRows(rs => (rs ?? []).map(r => r.id === u.id ? { ...r, follows_back: !was } : r))
    const ok = was ? await unfollowUser(u.id) : (await followUser(u.id)).ok
    if (!ok) setRows(rs => (rs ?? []).map(r => r.id === u.id ? { ...r, follows_back: was } : r))
    setBusyId(null)
  }, [])

  return (
    <div style={{ minHeight: '100dvh', background: GRADIENT_APP_BG, paddingBottom: `calc(${SPACE_LG}px + env(safe-area-inset-bottom))` }}>
      <div style={{
        height: HEADER_HEIGHT_SAFE, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center',
        padding: `0 ${SPACE_MD}px`, gap: SPACE_SM, position: 'sticky', top: 0, zIndex: 10, paddingTop: SAFE_TOP }}>
        <button onClick={() => navigate('/profile')} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: COLOR_HEADER_TITLE,
          fontSize: 22, lineHeight: 1, padding: 0, WebkitTapHighlightColor: 'transparent',
        }}>‹</button>
        <span style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 19, color: COLOR_HEADER_TITLE }}>
          Followers
        </span>
        {rows && rows.length > 0 && (
          <span style={{ marginLeft: 'auto', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, color: FAINT }}>
            {rows.length}
          </span>
        )}
      </div>

      <div style={{ padding: SPACE_MD }}>
        {rows === null && <p style={{ fontFamily: FONT_UI, fontSize: 13, color: MUTED }}>Loading…</p>}

        {rows !== null && rows.length === 0 && (
          <p style={{ fontFamily: FONT_UI, fontSize: 13, color: MUTED, marginTop: SPACE_LG, textAlign: 'center', lineHeight: 1.7 }}>
            Nobody is following you yet.
            <br />
            <span style={{ fontSize: 12 }}>
              Share a build, or go find someone else's. People tend to follow back.
            </span>
          </p>
        )}

        {(rows ?? []).map(u => {
          const place = [u.city, u.country_code ? flagEmoji(u.country_code) : null].filter(Boolean).join(' ')
          const mutual = !!u.follows_back
          return (
            <div key={u.id} style={{
              display: 'flex', alignItems: 'center', gap: SPACE_SM,
              padding: `${SPACE_SM}px 0`, borderBottom: '1px solid rgba(240,228,200,0.07)',
            }}>
              <div
                role="button" tabIndex={0}
                onClick={() => u.username && navigate(`/builds/${u.username}`, { state: { from: '/followers' } })}
                onKeyDown={e => { if (e.key === 'Enter' && u.username) navigate(`/builds/${u.username}`, { state: { from: '/followers' } }) }}
                style={{ display: 'flex', alignItems: 'center', gap: SPACE_SM, flex: 1, minWidth: 0, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
              >
                <Avatar u={u} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 14, color: CREAM, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.display_name || `@${u.username}`}
                  </p>
                  <p style={{ fontFamily: FONT_UI, fontSize: 11.5, color: MUTED, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    @{u.username}{place ? ` · ${place}` : ''}
                  </p>
                </div>
              </div>
              <button onClick={() => toggle(u)} disabled={busyId === u.id} style={{
                minHeight: 36, padding: `0 ${SPACE_SM}px`, cursor: 'pointer', flexShrink: 0,
                background: mutual ? 'transparent' : COLOR_ACCENT,
                border: `1px solid ${COLOR_ACCENT}`, borderRadius: RADIUS_BUTTON,
                color: mutual ? COLOR_ACCENT : '#fff5dc',
                fontFamily: FONT_UI, fontWeight: 800, fontSize: 10,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                opacity: busyId === u.id ? 0.5 : 1, WebkitTapHighlightColor: 'transparent',
              }}>
                {busyId === u.id ? '…' : mutual ? 'Following' : 'Follow back'}
              </button>
            </div>
          )
        })}

        {rows !== null && rows.length > 0 && (
          <p style={{ fontFamily: FONT_UI, fontSize: 11, color: FAINT, marginTop: SPACE_XS, textAlign: 'center' }}>
            Tap a name to open their build.
          </p>
        )}
      </div>
    </div>
  )
}
