// Route: /notifications — what's happened to your account and builds
// (migration 087, ADR-025).
//
// Before this, moderation was silent: a hidden build just went quiet and a
// suspended account looked like the site had broken. This is where the app tells
// you, in your own words rather than by absence.
//
// Everything here is written by the server (definer functions only — there is no
// insert policy on user_notices), so nothing on this screen can be forged.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getNotices, markNoticesRead, isRestrictive, noticeHref, type Notice } from '../lib/notices'
import { invalidateAttention } from '../lib/attention'
import {
  GRADIENT_APP_BG, COLOR_HEADER_BLACK, COLOR_HEADER_TITLE, COLOR_ACCENT,
  COLOR_ERROR, COLOR_SUCCESS, FONT_UI, FONT_TITLE, HEADER_HEIGHT,
  SPACE_XS, SPACE_SM, SPACE_MD, SPACE_LG,
} from '../tokens'

const CREAM = '#f0e4c8'
const MUTED = 'rgba(240,228,200,0.5)'
const FAINT = 'rgba(240,228,200,0.32)'

function when(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString()
}

export default function NotificationsPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<Notice[] | null>(null)

  useEffect(() => {
    ;(async () => {
      const list = await getNotices()
      setRows(list)
      // Opening the screen IS the read. Mark after loading so the unread accent
      // is still visible on this render — you get to see what was new.
      if (list.some(n => !n.read_at)) {
        await markNoticesRead()
        invalidateAttention()
      }
    })()
  }, [])

  return (
    <div style={{
      minHeight: '100dvh', background: GRADIENT_APP_BG,
      paddingBottom: `calc(${SPACE_LG}px + env(safe-area-inset-bottom))`,
    }}>
      <div style={{
        height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center',
        padding: `0 ${SPACE_MD}px`, gap: SPACE_SM, position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={() => navigate('/profile')} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: COLOR_HEADER_TITLE,
          fontSize: 22, lineHeight: 1, padding: 0, WebkitTapHighlightColor: 'transparent',
        }}>‹</button>
        <span style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 19, color: COLOR_HEADER_TITLE }}>
          Notifications
        </span>
      </div>

      <div style={{ padding: SPACE_MD }}>
        {rows === null && <p style={{ fontFamily: FONT_UI, fontSize: 13, color: MUTED }}>Loading…</p>}

        {rows !== null && rows.length === 0 && (
          <p style={{
            fontFamily: FONT_UI, fontSize: 13, color: MUTED, marginTop: SPACE_LG,
            textAlign: 'center', lineHeight: 1.7,
          }}>
            Nothing to report.
            <br />
            <span style={{ fontSize: 12 }}>
              If anything ever changes about your account or your builds, you'll find it here.
            </span>
          </p>
        )}

        {(rows ?? []).map(n => {
          const bad = isRestrictive(n.kind)
          const good = n.kind === 'content_restored' || n.kind === 'account_restored'
          const accent = bad ? COLOR_ERROR : good ? COLOR_SUCCESS : COLOR_ACCENT
          const href = noticeHref(n)
          return (
            <div key={n.id} style={{
              borderLeft: `2px solid ${accent}`,
              background: n.read_at ? 'transparent' : 'rgba(200,102,26,0.06)',
              padding: `${SPACE_SM}px ${SPACE_SM}px`,
              marginBottom: SPACE_SM,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE_XS }}>
                {/* The unread mark. The row's background wash alone was too
                    quiet to answer "which of these is new?" at a glance, and
                    this screen marks everything read on open — so this render
                    is the ONLY one that ever shows it. */}
                {!n.read_at && (
                  <span aria-label="Unread" style={{
                    width: 7, height: 7, borderRadius: '50%', background: COLOR_ACCENT,
                    flexShrink: 0, alignSelf: 'center', marginRight: 1,
                  }} />
                )}
                <p style={{ fontFamily: FONT_UI, fontWeight: n.read_at ? 700 : 800, fontSize: 14, color: CREAM, margin: 0, flex: 1 }}>
                  {n.title}
                </p>
                <span style={{ fontFamily: FONT_UI, fontSize: 10.5, color: FAINT, flexShrink: 0 }}>
                  {when(n.created_at)}
                </span>
              </div>
              {n.body && (
                <p style={{
                  fontFamily: FONT_UI, fontSize: 12.5, color: 'rgba(240,228,200,0.72)',
                  margin: `${SPACE_XS}px 0 0`, lineHeight: 1.55,
                }}>
                  {n.body}
                </p>
              )}
              {href && (
                <button
                  onClick={() => navigate(href)}
                  style={{
                    background: 'none', border: 'none', padding: 0, marginTop: SPACE_XS, cursor: 'pointer',
                    fontFamily: FONT_UI, fontWeight: 600, fontSize: 11.5, color: COLOR_ACCENT,
                    WebkitTapHighlightColor: 'transparent',
                  }}>
                  {n.kind === 'new_follower' ? 'See their builds' : 'Open'}
                </button>
              )}
              {n.car_id && (
                <button
                  onClick={() => navigate('/garage/cars', { state: { focusCarId: n.car_id } })}
                  style={{
                    background: 'none', border: 'none', padding: 0, marginTop: SPACE_XS, cursor: 'pointer',
                    fontFamily: FONT_UI, fontWeight: 600, fontSize: 11.5, color: COLOR_ACCENT,
                    WebkitTapHighlightColor: 'transparent',
                  }}>
                  Go to the car
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
