const _now        = new Date()
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_LABEL = MONTHS[_now.getMonth()]
const DAY_LABEL   = String(_now.getDate())

import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  COLOR_HEADER_BLACK, COLOR_HEADER_WARM, COLOR_HEADER_TITLE,
  COLOR_TIMELINE_SERVICE,
  FONT_UI, HEADER_HEIGHT,
} from '../tokens'

type Session = {
  id: string
  type: 'maintenance' | 'detail' | 'modification'
  date_performed: string
  performed_by: 'self' | 'shop' | null
  shop_name: string | null
  mileage: number | null
  total_cost: number | null
  time_taken: string | null
  notes: string | null
  add_to_timeline: boolean
}

type Job = {
  id: string
  category: string | null
  title: string
  cost: number | null
}

const MONO = "'Courier New', Courier, monospace"

export default function MaintenanceSessionDetailPage() {
  const navigate = useNavigate()
  const { sessionId } = useParams<{ sessionId: string }>()
  const [session, setSession] = useState<Session | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    Promise.all([
      supabase.from('sessions').select('id,type,date_performed,performed_by,shop_name,mileage,total_cost,time_taken,notes,add_to_timeline').eq('id', sessionId).single(),
      supabase.from('jobs').select('id,category,title,cost').eq('session_id', sessionId).order('created_at', { ascending: true }),
    ]).then(([{ data: s }, { data: j }]) => {
      if (s) setSession(s as Session)
      if (j) setJobs(j as Job[])
      setLoading(false)
    })
  }, [sessionId])

  function fmtDate(d: string) {
    const [y, m, day] = d.split('-').map(Number)
    return { month: MONTHS[m - 1].toUpperCase(), day, year: y }
  }

  async function handleDelete() {
    if (deleting || !sessionId) return
    setDeleting(true)
    await supabase.from('sessions').delete().eq('id', sessionId)
    navigate(session?.type === 'detail' ? '/maintenance/detail' : '/maintenance')
  }

  const isDetail  = session?.type === 'detail'
  const backRoute = isDetail ? '/maintenance/detail' : '/maintenance'
  const backLabel = isDetail ? 'Detailing' : 'Service'

  if (loading) return (
    <div style={{ height: '100dvh', background: '#0a0908', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK, borderBottom: '1px solid rgba(255,255,255,0.04)' }} />
    </div>
  )

  if (!session) return (
    <div style={{ height: '100dvh', background: '#0a0908', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <button onClick={() => navigate('/maintenance')} style={{ background: 'none', border: 'none', color: COLOR_TIMELINE_SERVICE, fontFamily: MONO, cursor: 'pointer' }}>← Back</button>
    </div>
  )

  const { month, day, year } = fmtDate(session.date_performed)

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#0a0908', fontFamily: FONT_UI, overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ height: HEADER_HEIGHT, flexShrink: 0, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 10, paddingRight: 14, borderBottom: '1px solid rgba(255,255,255,0.04)', position: 'relative', zIndex: 10 }}>
        <button onClick={() => navigate(backRoute)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px 4px 4px', WebkitTapHighlightColor: 'transparent' }}>
          <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
          <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 13, color: COLOR_HEADER_TITLE, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{backLabel}</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          <div style={{ background: 'rgba(242,238,228,0.94)', color: '#0d0d0d', padding: '4px 7px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>{MONTH_LABEL}</div>
          <div style={{ background: COLOR_TIMELINE_SERVICE, color: '#0d0d0d', padding: '4px 8px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: DAY_LABEL.length === 1 ? 24 : 30 }}>{DAY_LABEL}</div>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        {/* Faint G watermark */}
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontFamily: MONO, fontSize: 340, fontWeight: 900, color: 'rgba(212,184,106,0.06)', pointerEvents: 'none', zIndex: 0, userSelect: 'none', lineHeight: 1 }} aria-hidden>G</div>

        <div style={{ position: 'relative', zIndex: 1, padding: '24px 20px 80px' }}>

          {/* Date hero */}
          <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid rgba(212,184,106,0.14)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(212,184,106,0.45)', marginBottom: 4 }}>Date of Service</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: COLOR_TIMELINE_SERVICE, letterSpacing: '0.06em' }}>{month}</span>
                  <span style={{ fontFamily: MONO, fontSize: 36, fontWeight: 700, color: 'rgba(245,245,245,0.92)', lineHeight: 1 }}>{day}</span>
                  <span style={{ fontFamily: MONO, fontSize: 14, color: 'rgba(245,245,245,0.35)' }}>{year}</span>
                </div>
              </div>
              {session.mileage != null && (
                <div style={{ paddingBottom: 4 }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(212,184,106,0.35)', marginBottom: 2 }}>Odometer</div>
                  <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: 'rgba(245,245,245,0.70)' }}>{session.mileage.toLocaleString()} <span style={{ fontSize: 11, color: 'rgba(245,245,245,0.35)' }}>mi</span></div>
                </div>
              )}
            </div>
          </div>

          {/* Performed by */}
          <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '1px dashed rgba(212,184,106,0.10)' }}>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(212,184,106,0.45)', marginBottom: 6 }}>Performed By</div>
            <div style={{ fontFamily: MONO, fontSize: 14, color: 'rgba(245,245,245,0.80)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {session.performed_by ?? '—'}
              {session.performed_by === 'shop' && session.shop_name && <span style={{ color: COLOR_TIMELINE_SERVICE }}> · {session.shop_name}</span>}
            </div>
            {session.time_taken && (
              <div style={{ marginTop: 8 }}>
                <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(212,184,106,0.35)' }}>Time: </span>
                <span style={{ fontFamily: MONO, fontSize: 13, color: 'rgba(245,245,245,0.60)' }}>{session.time_taken}</span>
              </div>
            )}
          </div>

          {/* Job line items (maintenance only) */}
          {!isDetail && jobs.length > 0 && (
            <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid rgba(212,184,106,0.14)' }}>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(212,184,106,0.55)', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid rgba(212,184,106,0.10)' }}>
                Services Performed
              </div>
              {jobs.map((job, i) => (
                <div key={job.id} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < jobs.length - 1 ? '1px dashed rgba(212,184,106,0.08)' : 'none' }}>
                  <div style={{ flex: 1 }}>
                    {job.category && (
                      <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase', color: COLOR_TIMELINE_SERVICE, marginRight: 8, padding: '1px 5px', border: `1px solid rgba(212,184,106,0.25)` }}>{job.category}</span>
                    )}
                    <span style={{ fontFamily: MONO, fontSize: 13, color: 'rgba(245,245,245,0.72)' }}>{job.title}</span>
                  </div>
                  {job.cost != null && (
                    <span style={{ fontFamily: MONO, fontSize: 13, color: 'rgba(245,245,245,0.60)', paddingLeft: 16 }}>${Number(job.cost).toFixed(2)}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Total */}
          {session.total_cost != null && (
            <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '1px dashed rgba(212,184,106,0.10)', background: 'rgba(212,184,106,0.04)', padding: '12px 14px', marginLeft: -14, marginRight: -14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(212,184,106,0.65)' }}>Total</span>
                <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: COLOR_TIMELINE_SERVICE }}>${Number(session.total_cost).toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Notes */}
          {session.notes && (
            <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '1px dashed rgba(212,184,106,0.10)' }}>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(212,184,106,0.45)', marginBottom: 8 }}>Notes</div>
              <div style={{ fontFamily: MONO, fontSize: 13, color: 'rgba(245,245,245,0.65)', lineHeight: 1.6 }}>{session.notes}</div>
            </div>
          )}

          {/* Timeline badge */}
          <div style={{ marginBottom: 32 }}>
            <span style={{
              fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
              padding: '4px 8px',
              border: `1px solid ${session.add_to_timeline ? 'rgba(212,184,106,0.40)' : 'rgba(255,255,255,0.10)'}`,
              color: session.add_to_timeline ? COLOR_TIMELINE_SERVICE : 'rgba(245,245,245,0.25)',
            }}>
              {session.add_to_timeline ? '◆ In Timeline' : '◇ Not in Timeline'}
            </span>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => navigate(`/maintenance/service/edit/${sessionId}`)}
              style={{ flex: 1, padding: '12px 0', background: 'rgba(212,184,106,0.08)', border: '1px solid rgba(212,184,106,0.25)', borderRadius: 0, color: COLOR_TIMELINE_SERVICE, fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
            >
              Edit Record
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              style={{ flex: 1, padding: '12px 0', background: 'rgba(255,60,60,0.06)', border: '1px solid rgba(255,60,60,0.20)', borderRadius: 0, color: 'rgba(255,100,100,0.70)', fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Delete confirmation overlay */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.80)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}>
          <div style={{ width: '100%', background: '#141210', padding: '28px 24px 40px', borderTop: '1px solid rgba(212,184,106,0.20)' }}>
            <div style={{ fontFamily: MONO, fontSize: 14, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'rgba(245,245,245,0.85)', marginBottom: 8 }}>Delete this record?</div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: 'rgba(245,245,245,0.40)', marginBottom: 24, lineHeight: 1.5 }}>This will permanently remove the service record and all line items. This cannot be undone.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: '12px 0', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 0, color: 'rgba(245,245,245,0.60)', fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>Cancel</button>
              <button onClick={handleDelete} disabled={deleting} style={{ flex: 1, padding: '12px 0', background: deleting ? 'rgba(255,60,60,0.08)' : 'rgba(255,60,60,0.18)', border: '1px solid rgba(255,60,60,0.40)', borderRadius: 0, color: deleting ? 'rgba(255,100,100,0.40)' : 'rgba(255,120,120,0.90)', fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: deleting ? 'default' : 'pointer', WebkitTapHighlightColor: 'transparent' }}>
                {deleting ? 'Deleting...' : 'Delete Record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
