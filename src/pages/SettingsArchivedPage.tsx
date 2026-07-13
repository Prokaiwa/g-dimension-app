// Route: /settings/archived — Archived Cars.
//
// Two kinds of "not in your garage" cars live here:
//   1. Sold & Archived — SOLD ghosts (migration 074) the user archived from the
//      carousel. Restoring un-archives (archived_at → null) so the keepsake
//      returns to the garage + public profile.
//   2. Removed Cars — soft-deleted cars (cars.deleted_at), restorable within the
//      7-day window before the nightly purge (nightly_purge.sql) hard-deletes.
//      Restoring clears deleted_at. This is the app's first restore surface.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  getArchivedSoldCars, unarchiveSoldCar, soldCarName, type SoldCar,
} from '../lib/carTransfers'
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
} from '../tokens'

const _now   = new Date()
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_LABEL = MONTHS[_now.getMonth()]
const DAY_LABEL   = String(_now.getDate())

const CREAM = '#f0e4c8'
const MUTED = 'rgba(240,228,200,0.5)'
const FAINT = 'rgba(240,228,200,0.32)'

type DeletedCar = {
  id: string
  nickname: string | null
  year: number | null
  make: string | null
  model: string | null
  variant: string | null
  garage_photo_url: string | null
  deleted_at: string
}

function deletedCarName(c: DeletedCar): string {
  const model = [c.year, c.model, c.variant].filter(Boolean).join(' ')
  if (c.nickname && model) return `${c.nickname} — ${model}`
  return c.nickname || model || 'a car'
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: FAINT, margin: `${SPACE_LG}px 0 ${SPACE_XS}px` }}>{children}</p>
  )
}

function Row({ photo, title, sub, actionLabel, busy, onAction }: {
  photo: string | null; title: string; sub: string
  actionLabel: string; busy: boolean; onAction: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: SPACE_MD, padding: `${SPACE_SM}px 0`, borderBottom: '1px solid rgba(240,228,200,0.07)' }}>
      <div style={{ width: 54, height: 40, flexShrink: 0, background: 'rgba(240,228,200,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {photo
          ? <img src={photo} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', filter: 'grayscale(0.5) brightness(0.85)' }} />
          : <span style={{ fontFamily: FONT_UI, fontSize: 9, color: FAINT }}>—</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 14, color: CREAM, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        <div style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 11, color: MUTED, marginTop: 2 }}>{sub}</div>
      </div>
      <button disabled={busy} onClick={onAction}
        style={{ flexShrink: 0, padding: '8px 14px', background: 'none', border: `1px solid ${COLOR_ACCENT}`, color: COLOR_ACCENT, fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>
        {busy ? '…' : actionLabel}
      </button>
    </div>
  )
}

export default function SettingsArchivedPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [ghosts, setGhosts] = useState<SoldCar[]>([])
  const [deleted, setDeleted] = useState<DeletedCar[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const [archived, delRes] = await Promise.all([
        getArchivedSoldCars(),
        session
          ? supabase.from('cars')
              .select('id, nickname, year, make, model, variant, garage_photo_url, deleted_at')
              .eq('user_id', session.user.id)
              .not('deleted_at', 'is', null)
              .order('deleted_at', { ascending: false })
          : Promise.resolve({ data: [] as DeletedCar[] }),
      ])
      if (!active) return
      setGhosts(archived)
      setDeleted(((delRes.data ?? []) as DeletedCar[]))
      setLoading(false)
    })()
    return () => { active = false }
  }, [])

  async function restoreGhost(g: SoldCar) {
    setBusyId(g.id)
    const res = await unarchiveSoldCar(g.id)
    if (res.ok) setGhosts(list => list.filter(x => x.id !== g.id))
    setBusyId(null)
  }

  async function restoreDeleted(c: DeletedCar) {
    setBusyId(c.id)
    const { error } = await supabase.from('cars').update({ deleted_at: null }).eq('id', c.id)
    if (!error) setDeleted(list => list.filter(x => x.id !== c.id))
    setBusyId(null)
  }

  const empty = !loading && ghosts.length === 0 && deleted.length === 0

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: GRADIENT_APP_BG, fontFamily: FONT_UI, overflow: 'hidden' }}>
      {/* ── Header ── */}
      <div style={{ position: 'relative', height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 10, paddingRight: 14, flexShrink: 0, zIndex: 10, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => navigate('/settings')} aria-label="Back" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px 4px 4px', display: 'flex', alignItems: 'center' }}>
            <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
          </button>
          <span style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 22, color: COLOR_HEADER_TITLE, letterSpacing: '0.01em' }}>Archived Cars</span>
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

        {empty && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: SPACE_SM, padding: `0 ${SPACE_XL}px`, textAlign: 'center' }}>
            <p style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 18, color: MUTED, margin: 0 }}>Nothing archived.</p>
            <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 12, color: FAINT, margin: 0, lineHeight: 1.5 }}>
              Cars you sell or remove show up here, ready to bring back.
            </p>
          </div>
        )}

        {!loading && !empty && (
          <div style={{ padding: `${SPACE_MD}px ${SPACE_MD}px calc(${SPACE_XL}px + env(safe-area-inset-bottom))` }}>
            {ghosts.length > 0 && (
              <>
                <SectionLabel>Sold & Archived</SectionLabel>
                <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 12, color: MUTED, margin: `0 0 ${SPACE_SM}px`, lineHeight: 1.5 }}>
                  Cars you sold and hid. Restore to show them (as SOLD) in your garage again.
                </p>
                <div style={{ borderTop: '1px solid rgba(240,228,200,0.07)' }}>
                  {ghosts.map(g => (
                    <Row key={g.id} photo={g.snapshot_photo_url} title={soldCarName(g)}
                      sub={`Sold ${new Date(g.sold_at).toLocaleDateString()}${g.buyer_username ? ` · to @${g.buyer_username}` : ''}`}
                      actionLabel="Restore" busy={busyId === g.id} onAction={() => restoreGhost(g)} />
                  ))}
                </div>
              </>
            )}

            {deleted.length > 0 && (
              <>
                <SectionLabel>Removed Cars</SectionLabel>
                <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 12, color: MUTED, margin: `0 0 ${SPACE_SM}px`, lineHeight: 1.5 }}>
                  Held for 7 days before permanent deletion. Restore to return one to your garage.
                </p>
                <div style={{ borderTop: '1px solid rgba(240,228,200,0.07)' }}>
                  {deleted.map(c => (
                    <Row key={c.id} photo={c.garage_photo_url} title={deletedCarName(c)}
                      sub={`Removed ${new Date(c.deleted_at).toLocaleDateString()}`}
                      actionLabel="Restore" busy={busyId === c.id} onAction={() => restoreDeleted(c)} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
