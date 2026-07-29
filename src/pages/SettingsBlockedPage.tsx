// Route: /settings/blocked — the accounts you've blocked (migration 084).
// Apple Guideline 1.2 asks for the ability to block; being able to see and undo
// that list is what makes it a real setting rather than a one-way trapdoor.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getBlockedUsers, unblockUser, type BlockedUser } from '../lib/moderation'
import {
  GRADIENT_APP_BG, COLOR_HEADER_BLACK, COLOR_HEADER_TITLE, COLOR_ACCENT,
  FONT_UI, FONT_TITLE, HEADER_HEIGHT, SPACE_SM, SPACE_MD, SPACE_LG, RADIUS_BUTTON,
} from '../tokens'

const CREAM = '#f0e4c8'
const MUTED = 'rgba(240,228,200,0.5)'

export default function SettingsBlockedPage() {
  const navigate = useNavigate()
  const [rows, setRows]       = useState<BlockedUser[] | null>(null)
  const [busyId, setBusyId]   = useState<string | null>(null)

  useEffect(() => { getBlockedUsers().then(setRows) }, [])

  async function undo(id: string) {
    setBusyId(id)
    const ok = await unblockUser(id)
    setBusyId(null)
    if (ok) setRows(r => (r ?? []).filter(u => u.id !== id))
  }

  return (
    <div style={{ minHeight: '100dvh', background: GRADIENT_APP_BG }}>
      <div style={{
        height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center',
        padding: `0 ${SPACE_MD}px`, gap: SPACE_SM, position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={() => navigate('/settings')} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: COLOR_HEADER_TITLE,
          fontSize: 22, lineHeight: 1, padding: 0, WebkitTapHighlightColor: 'transparent',
        }}>‹</button>
        <span style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 19, color: COLOR_HEADER_TITLE }}>
          Blocked
        </span>
      </div>

      <div style={{ padding: SPACE_MD }}>
        {rows === null && (
          <p style={{ fontFamily: FONT_UI, fontSize: 13, color: MUTED }}>Loading…</p>
        )}

        {rows !== null && rows.length === 0 && (
          <p style={{ fontFamily: FONT_UI, fontSize: 13, color: MUTED, marginTop: SPACE_LG, textAlign: 'center', lineHeight: 1.6 }}>
            You haven't blocked anyone.
            <br />
            <span style={{ fontSize: 12 }}>Blocking hides someone from you across the app.</span>
          </p>
        )}

        {(rows ?? []).map(u => (
          <div key={u.id} style={{
            display: 'flex', alignItems: 'center', gap: SPACE_SM,
            padding: `${SPACE_SM}px 0`, borderBottom: '1px solid rgba(240,228,200,0.07)',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 14, color: CREAM, margin: 0 }}>
                {u.display_name || `@${u.username ?? 'unknown'}`}
              </p>
              {u.display_name && u.username && (
                <p style={{ fontFamily: FONT_UI, fontSize: 12, color: MUTED, margin: '2px 0 0' }}>@{u.username}</p>
              )}
            </div>
            <button onClick={() => undo(u.id)} disabled={busyId === u.id} style={{
              minHeight: 40, padding: `0 ${SPACE_MD}px`, cursor: 'pointer',
              background: 'transparent', border: `1px solid ${COLOR_ACCENT}`, borderRadius: RADIUS_BUTTON,
              color: COLOR_ACCENT, fontFamily: FONT_UI, fontWeight: 800, fontSize: 11,
              letterSpacing: '0.10em', textTransform: 'uppercase',
              opacity: busyId === u.id ? 0.5 : 1, WebkitTapHighlightColor: 'transparent',
            }}>
              {busyId === u.id ? '…' : 'Unblock'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
