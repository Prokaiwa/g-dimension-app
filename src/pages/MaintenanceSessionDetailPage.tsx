const _now        = new Date()
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_LABEL = MONTHS[_now.getMonth()]
const DAY_LABEL   = String(_now.getDate())

import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import gLogo from '../assets/logo/gdimensionG.png'
import {
  COLOR_HEADER_BLACK, COLOR_HEADER_WARM, COLOR_HEADER_TITLE,
  COLOR_TIMELINE_SERVICE, COLOR_BURGUNDY_L,
  FONT_UI, HEADER_HEIGHT,
} from '../tokens'

// Light token for the detail session card
const DETAIL_AMBER = COLOR_TIMELINE_SERVICE

type Session = {
  id: string
  type: 'maintenance' | 'detail' | 'modification'
  date_performed: string
  performed_by: 'self' | 'shop' | null
  shop_name: string | null
  mileage: number | null
  total_cost: number | null
  labor_cost: number | null
  tax_amount: number | null
  time_taken: string | null
  notes: string | null
  add_to_timeline: boolean
  car_id: string | null
}

type Job = {
  id: string
  category: string | null
  title: string
  cost: number | null
}

type Car = {
  year: number | null
  make: string | null
  model: string | null
}

const MONO = "'Courier New', Courier, monospace"
const INV_TEXT    = '#1a1a1a'
const INV_MUTED   = '#888888'
const INV_DIVIDER = '#e0e0e0'

export default function MaintenanceSessionDetailPage() {
  const navigate    = useNavigate()
  const { sessionId } = useParams<{ sessionId: string }>()
  const [session,       setSession]       = useState<Session | null>(null)
  const [jobs,          setJobs]          = useState<Job[]>([])
  const [car,           setCar]           = useState<Car | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [deleting,      setDeleting]      = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    Promise.all([
      supabase.from('sessions')
        .select('id,type,date_performed,performed_by,shop_name,mileage,total_cost,labor_cost,tax_amount,time_taken,notes,add_to_timeline,car_id')
        .eq('id', sessionId).single(),
      supabase.from('jobs')
        .select('id,category,title,cost')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true }),
    ]).then(async ([{ data: s }, { data: j }]) => {
      if (s) {
        setSession(s as Session)
        if (s.car_id) {
          const { data: c } = await supabase.from('cars').select('year,make,model').eq('id', s.car_id).single()
          if (c) setCar(c as Car)
        }
      }
      if (j) setJobs(j as Job[])
      setLoading(false)
    })
  }, [sessionId])

  function fmtDate(d: string) {
    const [y, m, day] = d.split('-').map(Number)
    return { month: MONTHS[m - 1].toUpperCase(), day, year: y, full: `${MONTHS[m-1]} ${day}, ${y}` }
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
  const CONTENT_FONT = isDetail ? FONT_UI : MONO

  if (loading) return (
    <div style={{ height: '100dvh', background: '#f5f5f5', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK, borderBottom: '1px solid rgba(255,255,255,0.04)' }} />
    </div>
  )

  if (!session) return (
    <div style={{ height: '100dvh', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <button onClick={() => navigate('/maintenance/service')} style={{ background: 'none', border: 'none', color: COLOR_TIMELINE_SERVICE, fontFamily: MONO, cursor: 'pointer' }}>← Back</button>
    </div>
  )

  const { full: dateStr } = fmtDate(session.date_performed)
  const invoiceNum = session.id.replace(/-/g, '').slice(-8).toUpperCase()

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#f0eeeb', fontFamily: FONT_UI, overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ height: HEADER_HEIGHT, flexShrink: 0, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 10, paddingRight: 14, borderBottom: '1px solid rgba(255,255,255,0.04)', position: 'relative', zIndex: 10 }}>
        <button onClick={() => navigate(backRoute)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px 4px 4px', WebkitTapHighlightColor: 'transparent' }}>
          <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
          <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 13, color: COLOR_HEADER_TITLE, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{backLabel}</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          <div style={{ background: 'rgba(242,238,228,0.94)', color: '#0d0d0d', padding: '4px 7px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>{MONTH_LABEL}</div>
          <div style={{ background: isDetail ? DETAIL_AMBER : COLOR_BURGUNDY_L, color: isDetail ? '#0d0d0d' : '#fff', padding: '4px 8px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: DAY_LABEL.length === 1 ? 24 : 30 }}>{DAY_LABEL}</div>
        </div>
      </div>

      {/* ── Invoice body ── */}
      <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>

        {/* Paper invoice */}
        <div style={{ position: 'relative', zIndex: 1, margin: '16px 14px 80px', background: '#ffffff', boxShadow: '0 2px 12px rgba(0,0,0,0.10)', overflow: 'hidden', borderTop: isDetail ? `3px solid ${DETAIL_AMBER}` : 'none' }}>

          {/* Faint G logo watermark — inside paper so white bg doesn't hide it */}
          <img
            src={gLogo}
            aria-hidden
            style={{
              position: 'absolute',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 300, height: 300,
              objectFit: 'contain',
              opacity: 0.05,
              pointerEvents: 'none',
              zIndex: 0,
              userSelect: 'none',
            }}
          />

          {/* ── Invoice header ── */}
          <div style={{ padding: '20px 20px 16px', borderBottom: `2px solid ${INV_DIVIDER}`, position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              {/* G logo + brand */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img src={gLogo} alt="G-Dimension" style={{ width: 36, height: 36, objectFit: 'contain' }} />
                <div>
                  <div style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 13, color: INV_TEXT, letterSpacing: '0.04em' }}>G-DIMENSION</div>
                  <div style={{ fontFamily: CONTENT_FONT, fontSize: 9, color: INV_MUTED, letterSpacing: '0.08em', textTransform: 'uppercase' }}>gdimension.app</div>
                </div>
              </div>
              {/* Invoice type + number */}
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: CONTENT_FONT, fontWeight: 700, fontSize: 15, color: INV_TEXT, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {isDetail ? 'Detail Record' : 'Service Invoice'}
                </div>
                <div style={{ fontFamily: CONTENT_FONT, fontSize: 10, color: INV_MUTED, marginTop: 2 }}>#{invoiceNum}</div>
              </div>
            </div>
          </div>

          {/* ── Date / Vehicle row ── */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${INV_DIVIDER}` }}>
            {/* Date */}
            <div style={{ flex: 1, padding: '14px 20px', borderRight: `1px solid ${INV_DIVIDER}` }}>
              <div style={{ fontFamily: CONTENT_FONT, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: INV_MUTED, marginBottom: 4 }}>{isDetail ? 'Date' : 'Date of Service'}</div>
              <div style={{ fontFamily: CONTENT_FONT, fontSize: 14, fontWeight: 700, color: INV_TEXT }}>{dateStr}</div>
            </div>
            {/* Mileage */}
            {session.mileage != null ? (
              <div style={{ flex: 1, padding: '14px 20px' }}>
                <div style={{ fontFamily: CONTENT_FONT, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: INV_MUTED, marginBottom: 4 }}>Odometer</div>
                <div style={{ fontFamily: CONTENT_FONT, fontSize: 14, fontWeight: 700, color: INV_TEXT }}>{session.mileage.toLocaleString()} <span style={{ fontWeight: 400, fontSize: 11, color: INV_MUTED }}>mi</span></div>
              </div>
            ) : car ? (
              <div style={{ flex: 1, padding: '14px 20px' }}>
                <div style={{ fontFamily: CONTENT_FONT, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: INV_MUTED, marginBottom: 4 }}>Vehicle</div>
                <div style={{ fontFamily: CONTENT_FONT, fontSize: 13, fontWeight: 700, color: INV_TEXT }}>{[car.year, car.make, car.model].filter(Boolean).join(' ')}</div>
              </div>
            ) : <div style={{ flex: 1 }} />}
          </div>

          {/* ── Vehicle (if we have mileage AND car, show vehicle here) ── */}
          {car && session.mileage != null && (
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${INV_DIVIDER}` }}>
              <div style={{ fontFamily: CONTENT_FONT, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: INV_MUTED, marginBottom: 3 }}>Vehicle</div>
              <div style={{ fontFamily: CONTENT_FONT, fontSize: 13, color: INV_TEXT }}>{[car.year, car.make, car.model].filter(Boolean).join(' ')}</div>
            </div>
          )}

          {/* ── Performed By ── */}
          {(session.performed_by || session.shop_name || session.time_taken) && (
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${INV_DIVIDER}` }}>
              <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                {session.performed_by && (
                  <div>
                    <div style={{ fontFamily: CONTENT_FONT, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: INV_MUTED, marginBottom: 3 }}>Performed By</div>
                    <div style={{ fontFamily: CONTENT_FONT, fontSize: 13, color: INV_TEXT, textTransform: 'uppercase' }}>
                      {session.performed_by === 'shop' ? (session.shop_name || 'Shop / Dealer') : 'Self'}
                    </div>
                  </div>
                )}
                {session.time_taken && (
                  <div>
                    <div style={{ fontFamily: CONTENT_FONT, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: INV_MUTED, marginBottom: 3 }}>Time Taken</div>
                    <div style={{ fontFamily: CONTENT_FONT, fontSize: 13, color: INV_TEXT }}>{session.time_taken}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Services Performed (maintenance only) ── */}
          {!isDetail && (
            <div style={{ borderBottom: `1px solid ${INV_DIVIDER}` }}>
              {/* Column headers */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 20px 6px', background: '#f9f7f4', borderBottom: `1px solid ${INV_DIVIDER}` }}>
                <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: INV_MUTED }}>Description</span>
                <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: INV_MUTED }}>Amount</span>
              </div>
              {jobs.length === 0 ? (
                <div style={{ padding: '16px 20px', fontFamily: MONO, fontSize: 12, color: INV_MUTED }}>No line items recorded.</div>
              ) : jobs.map((job, i) => (
                <div key={job.id} style={{
                  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                  padding: '10px 20px',
                  borderBottom: i < jobs.length - 1 ? `1px dashed ${INV_DIVIDER}` : 'none',
                  background: i % 2 === 0 ? '#ffffff' : '#fdfcfb',
                }}>
                  <div style={{ flex: 1, paddingRight: 16 }}>
                    <span style={{ fontFamily: MONO, fontSize: 13, color: INV_TEXT }}>{job.title}</span>
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 13, color: INV_TEXT, whiteSpace: 'nowrap' }}>
                    {job.cost != null ? `$${Number(job.cost).toFixed(2)}` : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* ── Cost breakdown ── */}
          {(session.total_cost != null || session.labor_cost != null || session.tax_amount != null) && (() => {
            const partsSum = jobs.reduce((acc, j) => acc + (j.cost != null ? Number(j.cost) : 0), 0)
            const fmt = (n: number) => `$${n.toFixed(2)}`
            const breakdownRow = (label: string, value: string, muted = true) => (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 20px' }}>
                <span style={{ fontFamily: CONTENT_FONT, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: INV_MUTED }}>{label}</span>
                <span style={{ fontFamily: CONTENT_FONT, fontSize: 13, color: muted ? '#555' : INV_TEXT }}>{value}</span>
              </div>
            )
            const hasBreakdown = partsSum > 0 || session.labor_cost != null || session.tax_amount != null
            return (
              <div style={{ borderBottom: `1px solid ${INV_DIVIDER}`, background: '#fafaf8', paddingTop: 8, paddingBottom: 8 }}>
                {hasBreakdown && partsSum > 0 && breakdownRow('Parts', fmt(partsSum))}
                {session.labor_cost != null && breakdownRow('Labor', fmt(Number(session.labor_cost)))}
                {session.tax_amount != null && breakdownRow('Tax', fmt(Number(session.tax_amount)))}
                {hasBreakdown && <div style={{ borderTop: `1px dashed ${INV_DIVIDER}`, margin: '6px 20px 0' }} />}
                {session.total_cost != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 20px 2px' }}>
                    <span style={{ fontFamily: CONTENT_FONT, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: INV_MUTED }}>Total</span>
                    <span style={{ fontFamily: CONTENT_FONT, fontSize: 24, fontWeight: 700, color: INV_TEXT }}>${Number(session.total_cost).toFixed(2)}</span>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── Notes ── */}
          {session.notes && (
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${INV_DIVIDER}` }}>
              <div style={{ fontFamily: CONTENT_FONT, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: INV_MUTED, marginBottom: 6 }}>Notes</div>
              <div style={{ fontFamily: CONTENT_FONT, fontSize: isDetail ? 14 : 12, color: '#3a3a3a', lineHeight: 1.65 }}>{session.notes}</div>
            </div>
          )}

          {/* ── Timeline badge ── */}
          <div style={{ padding: '12px 20px', borderBottom: `1px solid ${INV_DIVIDER}` }}>
            <span style={{
              fontFamily: CONTENT_FONT, fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase',
              padding: '3px 8px',
              border: `1px solid ${session.add_to_timeline ? 'rgba(180,145,70,0.55)' : '#d8d8d8'}`,
              color: session.add_to_timeline ? '#a07828' : INV_MUTED,
              background: session.add_to_timeline ? 'rgba(212,184,106,0.08)' : 'transparent',
            }}>
              {session.add_to_timeline ? '◆ In Timeline' : '◇ Not in Timeline'}
            </span>
          </div>

          {/* ── Actions ── */}
          <div style={{ display: 'flex', gap: 0 }}>
            <button
              onClick={() => navigate(`/maintenance/service/edit/${sessionId}`)}
              style={{ flex: 1, padding: '14px 0', background: '#f9f7f4', border: 'none', borderRight: `1px solid ${INV_DIVIDER}`, color: '#444', fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
            >
              Edit Record
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              style={{ flex: 1, padding: '14px 0', background: '#fdf8f8', border: 'none', color: '#c06060', fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
            >
              Delete
            </button>
          </div>

        </div>
      </div>

      {/* ── Delete confirmation overlay ── */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}>
          <div style={{ width: '100%', background: '#ffffff', padding: '28px 24px 40px', borderTop: `2px solid ${INV_DIVIDER}` }}>
            <div style={{ fontFamily: CONTENT_FONT, fontSize: 14, letterSpacing: '0.08em', textTransform: 'uppercase', color: INV_TEXT, marginBottom: 8 }}>Delete this record?</div>
            <div style={{ fontFamily: CONTENT_FONT, fontSize: 12, color: INV_MUTED, marginBottom: 24, lineHeight: 1.6 }}>This will permanently remove this record and all associated data. This cannot be undone.</div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: '12px 0', background: '#f4f4f4', border: `1px solid ${INV_DIVIDER}`, borderRadius: 0, color: '#555', fontFamily: CONTENT_FONT, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>Cancel</button>
              <button onClick={handleDelete} disabled={deleting} style={{ flex: 1, padding: '12px 0', background: deleting ? '#fdf0f0' : '#fce8e8', border: '1px solid #e0b0b0', borderRadius: 0, color: deleting ? '#c09090' : '#b04040', fontFamily: CONTENT_FONT, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: deleting ? 'default' : 'pointer', WebkitTapHighlightColor: 'transparent' }}>
                {deleting ? 'Deleting…' : 'Delete Record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
