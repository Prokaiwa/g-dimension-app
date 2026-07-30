// Route: /following — the people you follow (migration 086, ADR-024).
//
// This screen is the actual answer to "you see someone's profile and it's very
// easy to lose": a durable list, with a tap straight back to each build.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getFollowing, unfollowUser, type FollowedUser } from '../lib/follows'
import { getCurrentUserProfile } from '../lib/userProfile'
import { flagEmoji } from '../lib/countries'
import {
  GRADIENT_APP_BG, COLOR_HEADER_BLACK, COLOR_HEADER_TITLE, COLOR_ACCENT,
  FONT_UI, FONT_TITLE, HEADER_HEIGHT, SPACE_XS, SPACE_SM, SPACE_MD, SPACE_LG,
  RADIUS_BUTTON,
} from '../tokens'

const CREAM = '#f0e4c8'
const MUTED = 'rgba(240,228,200,0.5)'
const FAINT = 'rgba(240,228,200,0.32)'

function Avatar({ u }: { u: FollowedUser }) {
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

export default function FollowingPage() {
  const navigate = useNavigate()
  const [rows, setRows]     = useState<FollowedUser[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const me = await getCurrentUserProfile()
      if (!me) { setRows([]); return }
      setRows(await getFollowing(me.id))
    })()
  }, [])

  async function undo(id: string) {
    setBusyId(id)
    const ok = await unfollowUser(id)
    setBusyId(null)
    if (ok) setRows(r => (r ?? []).filter(u => u.id !== id))
  }

  return (
    <div style={{ minHeight: '100dvh', background: GRADIENT_APP_BG, paddingBottom: `calc(${SPACE_LG}px + env(safe-area-inset-bottom))` }}>
      <div style={{
        height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center',
        padding: `0 ${SPACE_MD}px`, gap: SPACE_SM, position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={() => navigate('/profile')} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: COLOR_HEADER_TITLE,
          fontSize: 22, lineHeight: 1, padding: 0, WebkitTapHighlightColor: 'transparent',
        }}>‹</button>
        <span style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 19, color: COLOR_HEADER_TITLE }}>
          Following
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
            You aren't following anyone yet.
            <br />
            <span style={{ fontSize: 12 }}>
              When you find a build worth keeping, tap Follow on their profile and it will show up here.
            </span>
          </p>
        )}

        {(rows ?? []).map(u => {
          const place = [u.city, u.country_code ? flagEmoji(u.country_code) : null].filter(Boolean).join(' ')
          return (
            <div key={u.id} style={{
              display: 'flex', alignItems: 'center', gap: SPACE_SM,
              padding: `${SPACE_SM}px 0`, borderBottom: '1px solid rgba(240,228,200,0.07)',
            }}>
              <div
                role="button" tabIndex={0}
                onClick={() => u.username && navigate(`/builds/${u.username}`)}
                onKeyDown={e => { if (e.key === 'Enter' && u.username) navigate(`/builds/${u.username}`) }}
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
              <button onClick={() => undo(u.id)} disabled={busyId === u.id} style={{
                minHeight: 36, padding: `0 ${SPACE_SM}px`, cursor: 'pointer', flexShrink: 0,
                background: 'transparent', border: `1px solid ${COLOR_ACCENT}`, borderRadius: RADIUS_BUTTON,
                color: COLOR_ACCENT, fontFamily: FONT_UI, fontWeight: 800, fontSize: 10,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                opacity: busyId === u.id ? 0.5 : 1, WebkitTapHighlightColor: 'transparent',
              }}>
                {busyId === u.id ? '…' : 'Unfollow'}
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
