// Route: /admin/suspended — who is suspended, and the way back.
//
// 084 shipped `admin_suspend_user` with no inverse: a one-way destructive action
// sitting next to two safe ones, reversible only by hand-written SQL. This screen
// and `admin_unsuspend_user` (087) are that inverse.
//
// Route-gated by <AdminOnly>; the RPCs behind it re-check `is_admin` server-side.
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSuspendedUsers, unsuspendUser, type SuspendedUser } from '../lib/moderation'
import { invalidateAttention } from '../lib/attention'
import LinkOutIcon from '../components/LinkOutIcon'
import {
  GRADIENT_APP_BG, COLOR_HEADER_BLACK, COLOR_HEADER_TITLE, COLOR_ACCENT,
  COLOR_SUCCESS, FONT_UI, FONT_TITLE, HEADER_HEIGHT,
  SPACE_XS, SPACE_SM, SPACE_MD, SPACE_LG, RADIUS_BUTTON,
} from '../tokens'

const CREAM = '#f0e4c8'
const MUTED = 'rgba(240,228,200,0.5)'
const FAINT = 'rgba(240,228,200,0.32)'

export default function AdminSuspendedPage() {
  const navigate = useNavigate()
  const [rows, setRows]     = useState<SuspendedUser[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [note, setNote]     = useState<string | null>(null)

  const load = useCallback(async () => { setRows(await getSuspendedUsers()) }, [])
  useEffect(() => { load() }, [load])

  async function lift(u: SuspendedUser) {
    setBusyId(u.id); setNote(null)
    const res = await unsuspendUser(u.id)
    setBusyId(null)
    if (res.ok) {
      setNote(`@${u.username ?? 'account'} restored, at the visibility they had set.`)
      invalidateAttention()
      await load()
    } else {
      setNote(res.error ?? 'Could not lift that suspension.')
    }
  }

  return (
    <div style={{
      minHeight: '100dvh', background: GRADIENT_APP_BG,
      paddingBottom: `calc(${SPACE_LG}px + env(safe-area-inset-bottom))`,
    }}>
      <div style={{
        height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center',
        padding: `0 ${SPACE_MD}px`, gap: SPACE_SM, position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={() => navigate('/admin')} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: COLOR_HEADER_TITLE,
          fontSize: 22, lineHeight: 1, padding: 0, WebkitTapHighlightColor: 'transparent',
        }}>‹</button>
        <span style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 19, color: COLOR_HEADER_TITLE }}>
          Suspended
        </span>
      </div>

      <div style={{ padding: SPACE_MD }}>
        {note && <p style={{ fontFamily: FONT_UI, fontSize: 12, color: COLOR_SUCCESS, marginBottom: SPACE_SM }}>{note}</p>}
        {rows === null && <p style={{ fontFamily: FONT_UI, fontSize: 13, color: MUTED }}>Loading…</p>}

        {rows !== null && rows.length === 0 && (
          <p style={{ fontFamily: FONT_UI, fontSize: 13, color: MUTED, marginTop: SPACE_LG, textAlign: 'center' }}>
            Nobody is suspended.
          </p>
        )}

        {(rows ?? []).map(u => (
          <div key={u.id} style={{
            border: '1px solid rgba(240,228,200,0.10)', padding: SPACE_SM, marginBottom: SPACE_SM,
          }}>
            <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 14, color: CREAM, margin: 0 }}>
              {u.display_name || `@${u.username ?? 'unknown'}`}
            </p>
            <p style={{ fontFamily: FONT_UI, fontSize: 11.5, color: MUTED, margin: '3px 0 0' }}>
              @{u.username ?? '—'} · suspended {new Date(u.suspended_at).toLocaleDateString()}
              {u.suspension_reason ? ` · ${u.suspension_reason}` : ''}
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: SPACE_MD, marginTop: SPACE_SM }}>
              {u.username && (
                <button
                  onClick={() => window.open(`/builds/${u.username}`, '_blank')}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    fontFamily: FONT_UI, fontWeight: 600, fontSize: 11.5, color: FAINT,
                    WebkitTapHighlightColor: 'transparent',
                  }}>
                  Their profile
                  <LinkOutIcon size={12} />
                </button>
              )}
              <button
                onClick={() => lift(u)}
                disabled={busyId === u.id}
                style={{
                  marginLeft: 'auto', minHeight: 40, padding: `0 ${SPACE_MD}px`, cursor: 'pointer',
                  background: 'transparent', border: `1px solid ${COLOR_ACCENT}`, borderRadius: RADIUS_BUTTON,
                  color: COLOR_ACCENT, fontFamily: FONT_UI, fontWeight: 800, fontSize: 11,
                  letterSpacing: '0.10em', textTransform: 'uppercase',
                  opacity: busyId === u.id ? 0.5 : 1, WebkitTapHighlightColor: 'transparent',
                }}>
                {busyId === u.id ? '…' : 'Lift suspension'}
              </button>
            </div>
          </div>
        ))}

        {rows !== null && rows.length > 0 && (
          <p style={{ fontFamily: FONT_UI, fontSize: 11, color: FAINT, marginTop: SPACE_XS, lineHeight: 1.6 }}>
            Lifting restores each car to the visibility its owner had chosen, not
            blanket-public, and files a notice telling them.
          </p>
        )}
      </div>
    </div>
  )
}
