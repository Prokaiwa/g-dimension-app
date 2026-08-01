// The notices list itself, shared by the /notifications route and the sheet
// that opens from the Profile bell.
//
// One component on purpose: two copies of a list that renders moderation
// outcomes would drift, and the copy on this screen is the one place the app
// tells someone what happened to their account. A wording fix has to land in
// exactly one file.
//
// Everything rendered here is written by the server (definer functions only —
// `user_notices` has no insert policy), so nothing on this screen can be forged.
import { useEffect, useState } from 'react'
import { getNotices, markNoticesRead, isRestrictive, noticeHref, type Notice } from '../lib/notices'
import { invalidateAttention } from '../lib/attention'
import {
  COLOR_ACCENT, COLOR_ERROR, COLOR_SUCCESS, FONT_UI,
  SPACE_XS, SPACE_SM, SPACE_LG,
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

export default function NoticeList({ onGo }: {
  /**
   * Navigate. The sheet passes a handler that closes itself first.
   * `state` is passed through because GarageCarsPage focuses a car from
   * router state (`focusCarId`), not from a query param.
   */
  onGo: (href: string, state?: unknown) => void
}) {
  const [rows, setRows] = useState<Notice[] | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const list = await getNotices()
      if (!alive) return
      setRows(list)
      // Opening IS the read. Marked after loading so the unread accent survives
      // this render — you get to see what was new before it stops being new.
      if (list.some(n => !n.read_at)) {
        await markNoticesRead()
        invalidateAttention()
      }
    })()
    return () => { alive = false }
  }, [])

  if (rows === null) {
    return <p style={{ fontFamily: FONT_UI, fontSize: 13, color: MUTED, margin: 0 }}>Loading…</p>
  }

  if (rows.length === 0) {
    return (
      <p style={{ fontFamily: FONT_UI, fontSize: 13, color: MUTED, marginTop: SPACE_LG, textAlign: 'center', lineHeight: 1.7 }}>
        Nothing to report.
        <br />
        <span style={{ fontSize: 12 }}>
          New followers, and anything that changes about your account or your builds, land here.
        </span>
      </p>
    )
  }

  return (
    <>
      {rows.map(n => {
        const bad  = isRestrictive(n.kind)
        const good = n.kind === 'content_restored' || n.kind === 'account_restored'
        const accent = bad ? COLOR_ERROR : good ? COLOR_SUCCESS : COLOR_ACCENT
        const href = noticeHref(n)
        return (
          <div key={n.id} style={{
            borderLeft: `2px solid ${accent}`,
            background: n.read_at ? 'transparent' : 'rgba(200,102,26,0.06)',
            padding: SPACE_SM,
            marginBottom: SPACE_SM,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE_XS }}>
              {/* The unread mark. The background wash alone was too quiet to
                  answer "which of these is new?", and this list marks everything
                  read on open, so this render is the only one that shows it. */}
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
                onClick={() => onGo(href)}
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
                onClick={() => onGo('/garage/cars', { focusCarId: n.car_id })}
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
    </>
  )
}
