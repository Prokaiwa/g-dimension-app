// Route: /admin/reports — the moderation queue (migration 084, ADR-023).
//
// Route-gated by <AdminOnly> in App.tsx, so this page assumes an admin. That
// gate is COSMETIC: every action here is an RPC that re-derives is_admin
// server-side and raises otherwise. Flipping the flag in a debugger gets you an
// empty list and four failing calls — the check belongs where the data is
// (ADR-020/022).
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getReportQueue, dismissReport, hideReported, suspendUser,
  type AdminReport,
} from '../lib/moderation'
import { invalidateAdminAlert } from '../lib/adminAlert'
import {
  GRADIENT_APP_BG, COLOR_HEADER_BLACK, COLOR_HEADER_TITLE, COLOR_ACCENT,
  COLOR_ERROR, COLOR_SUCCESS, FONT_UI, FONT_TITLE, HEADER_HEIGHT,
  SPACE_XS, SPACE_SM, SPACE_MD, SPACE_LG, RADIUS_BUTTON,
} from '../tokens'

const CREAM = '#f0e4c8'
const MUTED = 'rgba(240,228,200,0.5)'
const FAINT = 'rgba(240,228,200,0.32)'

const SEVERE = new Set(['nudity', 'hate', 'violence', 'illegal'])

function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function Btn({ label, tone, onClick, busy }: {
  label: string; tone: 'accent' | 'danger' | 'plain'; onClick: () => void; busy: boolean
}) {
  const color = tone === 'danger' ? COLOR_ERROR : tone === 'accent' ? COLOR_ACCENT : 'rgba(240,228,200,0.45)'
  return (
    <button onClick={onClick} disabled={busy} style={{
      flex: 1, minHeight: 40, cursor: busy ? 'default' : 'pointer',
      background: 'transparent', border: `1px solid ${color}`, borderRadius: RADIUS_BUTTON,
      color, fontFamily: FONT_UI, fontWeight: 800, fontSize: 10.5,
      letterSpacing: '0.10em', textTransform: 'uppercase', opacity: busy ? 0.5 : 1,
      WebkitTapHighlightColor: 'transparent',
    }}>{label}</button>
  )
}

export default function AdminReportsPage() {
  const navigate = useNavigate()
  const [rows, setRows]       = useState<AdminReport[]>([])
  const [busyId, setBusyId]   = useState<string | null>(null)
  const [note, setNote]       = useState<string | null>(null)

  const load = useCallback(async () => {
    setRows(await getReportQueue())
  }, [])

  useEffect(() => { load() }, [load])

  async function act(id: string, fn: () => Promise<{ ok: boolean; error?: string }>, okNote: string) {
    setBusyId(id); setNote(null)
    const res = await fn()
    setBusyId(null)
    setNote(res.ok ? okNote : (res.error ?? 'Action failed.'))
    // Drop the memoized alert count so the avatar ring and the Admin dot clear
    // as soon as the queue is empty, instead of lingering for the TTL.
    if (res.ok) { invalidateAdminAlert(); await load() }
  }

  const open = rows.filter(r => r.status === 'open')

  return (
    <div style={{ minHeight: '100dvh', background: GRADIENT_APP_BG, paddingBottom: `calc(${SPACE_LG}px + env(safe-area-inset-bottom))` }}>
      <div style={{
        height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center',
        padding: `0 ${SPACE_MD}px`, gap: SPACE_SM, position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={() => navigate('/admin')} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: COLOR_HEADER_TITLE,
          fontSize: 22, lineHeight: 1, padding: 0, WebkitTapHighlightColor: 'transparent',
        }}>‹</button>
        <span style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 19, color: COLOR_HEADER_TITLE }}>
          Reports
        </span>
        <span style={{ marginLeft: 'auto', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, color: open.length ? COLOR_ACCENT : FAINT }}>
          {open.length} open
        </span>
      </div>

      <div style={{ padding: SPACE_MD }}>
        {note && (
          <p style={{ fontFamily: FONT_UI, fontSize: 12, color: COLOR_SUCCESS, marginBottom: SPACE_SM }}>{note}</p>
        )}

        {rows.length === 0 && (
          <p style={{ fontFamily: FONT_UI, fontSize: 13, color: MUTED, marginTop: SPACE_LG, textAlign: 'center' }}>
            Nothing reported. That is the good outcome.
          </p>
        )}

        {rows.map(r => {
          const busy = busyId === r.id
          const resolved = r.status !== 'open'
          return (
            <div key={r.id} style={{
              border: '1px solid rgba(240,228,200,0.10)', padding: SPACE_SM,
              marginBottom: SPACE_SM, opacity: resolved ? 0.45 : 1,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE_XS, marginBottom: 4 }}>
                <span style={{
                  fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.10em',
                  textTransform: 'uppercase', color: SEVERE.has(r.reason) ? COLOR_ERROR : COLOR_ACCENT,
                }}>{r.reason}</span>
                {r.auto_hidden && (
                  <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.10em', textTransform: 'uppercase', color: FAINT }}>
                    auto-hidden
                  </span>
                )}
                <span style={{ marginLeft: 'auto', fontFamily: FONT_UI, fontSize: 10.5, color: FAINT }}>
                  {ago(r.created_at)}
                </span>
              </div>

              <p style={{ fontFamily: FONT_UI, fontSize: 13, color: CREAM, margin: `0 0 3px` }}>
                {r.target_type} · @{r.owner_username ?? 'unknown'}
                {r.owner_suspended && <span style={{ color: COLOR_ERROR }}> · suspended</span>}
                {r.target_car_hidden && <span style={{ color: FAINT }}> · hidden</span>}
              </p>
              <p style={{ fontFamily: FONT_UI, fontSize: 11.5, color: MUTED, margin: `0 0 ${SPACE_XS}px` }}>
                reported by @{r.reporter_username ?? 'unknown'}
                {r.report_count > 1 && ` · ${r.report_count} reports on this`}
                {resolved && ` · ${r.status}`}
              </p>
              {r.details && (
                <p style={{ fontFamily: FONT_UI, fontSize: 12, color: 'rgba(240,228,200,0.7)', margin: `0 0 ${SPACE_XS}px`, lineHeight: 1.45, overflowWrap: 'anywhere' }}>
                  “{r.details}”
                </p>
              )}

              {r.owner_username && (
                <button
                  onClick={() => window.open(`/builds/${r.owner_username}`, '_blank')}
                  style={{
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    fontFamily: FONT_UI, fontWeight: 600, fontSize: 11.5, color: COLOR_ACCENT,
                    marginBottom: SPACE_XS, WebkitTapHighlightColor: 'transparent',
                  }}>
                  Open the build ↗
                </button>
              )}

              {!resolved && (
                <div style={{ display: 'flex', gap: SPACE_XS, marginTop: SPACE_XS }}>
                  <Btn label="Dismiss" tone="plain" busy={busy}
                       onClick={() => act(r.id, () => dismissReport(r.id), 'Dismissed, and any hide lifted.')} />
                  <Btn label="Keep hidden" tone="accent" busy={busy}
                       onClick={() => act(r.id, () => hideReported(r.id), 'Content stays hidden.')} />
                  {r.target_owner_id && (
                    <Btn label="Suspend" tone="danger" busy={busy}
                         onClick={() => act(r.id, () => suspendUser(r.target_owner_id!, `report:${r.reason}`),
                                            'Account suspended and their builds hidden.')} />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
