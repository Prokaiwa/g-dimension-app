const _now        = new Date()
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_LABEL = MONTHS[_now.getMonth()]
const DAY_LABEL   = String(_now.getDate())

import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import gLogo from '../assets/logo/gdimensionG.webp'
import carwashIcon from '../assets/icons/maintenance/carwash_icon.webp'
import {
  COLOR_HEADER_BLACK, COLOR_HEADER_WARM, COLOR_HEADER_TITLE,
  COLOR_TIMELINE_SERVICE, COLOR_TIMELINE_DETAIL, COLOR_BURGUNDY_L,
  FONT_UI, HEADER_HEIGHT,
} from '../tokens'

const CW_BG     = '#f4f8fb'
const CW_BLUE   = COLOR_TIMELINE_DETAIL   // '#8ab0c8'
const CW_INK    = '#111827'
const CW_DIM    = 'rgba(0,0,0,0.40)'
const CW_RULE   = 'rgba(0,0,0,0.07)'

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

type ReceiptRow = {
  id: string
  file_url: string
  file_type: 'image' | 'pdf'
  file_name: string | null
}

type Car = {
  year: number | null
  make: string | null
  model: string | null
  variant: string | null
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
  const [deleting,          setDeleting]          = useState(false)
  const [confirmDelete,     setConfirmDelete]     = useState(false)
  const [receipts,          setReceipts]          = useState<ReceiptRow[]>([])
  const [receiptUrls,       setReceiptUrls]       = useState<Record<string, string>>({})
  const [receiptsExpanded,  setReceiptsExpanded]  = useState(false)

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
      supabase.from('receipts')
        .select('id,file_url,file_type,file_name')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true }),
    ]).then(async ([{ data: s }, { data: j }, { data: r }]) => {
      if (s) {
        setSession(s as Session)
        if (s.car_id) {
          const { data: c } = await supabase.from('cars').select('year,make,model,variant').eq('id', s.car_id).single()
          if (c) setCar(c as Car)
        }
      }
      if (j) setJobs(j as Job[])
      if (r) setReceipts(r as ReceiptRow[])
      setLoading(false)
    })
  }, [sessionId])

  function fmtDate(d: string) {
    const [y, m, day] = d.split('-').map(Number)
    return { month: MONTHS[m - 1].toUpperCase(), day, year: y, full: `${MONTHS[m-1]} ${day}, ${y}` }
  }

  async function loadReceiptUrls(rcpts: ReceiptRow[]) {
    const urls: Record<string, string> = {}
    await Promise.all(rcpts.map(async r => {
      const { data } = await supabase.storage.from('receipts').createSignedUrl(r.file_url, 300)
      if (data?.signedUrl) urls[r.id] = data.signedUrl
    }))
    setReceiptUrls(urls)
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
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: isDetail ? CW_BG : '#f0eeeb', fontFamily: FONT_UI, overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ height: HEADER_HEIGHT, flexShrink: 0, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 10, paddingRight: 14, borderBottom: '1px solid rgba(255,255,255,0.04)', position: 'relative', zIndex: 10 }}>
        <button onClick={() => navigate(backRoute)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px 4px 4px', WebkitTapHighlightColor: 'transparent' }}>
          <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
          <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 13, color: COLOR_HEADER_TITLE, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{backLabel}</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          <div style={{ background: 'rgba(242,238,228,0.94)', color: '#0d0d0d', padding: '4px 7px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>{MONTH_LABEL}</div>
          <div style={{ background: COLOR_BURGUNDY_L, color: '#fff', padding: '4px 8px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: DAY_LABEL.length === 1 ? 24 : 30 }}>{DAY_LABEL}</div>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>

        {isDetail ? (
          /* ══ CAR WASH VIEW ══ */
          <div style={{ position: 'relative', minHeight: '100%' }}>

            {/* Faint G watermark */}
            <img src={gLogo} aria-hidden style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 320, height: 320, objectFit: 'contain', opacity: 0.05, pointerEvents: 'none', zIndex: 0, userSelect: 'none' }} />

            <div style={{ position: 'relative', zIndex: 1, padding: '0 0 80px' }}>

              {/* Icon + Title */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 20px', borderBottom: `1px solid ${CW_RULE}` }}>
                <img src={carwashIcon} alt="" aria-hidden draggable={false} style={{ width: 92, height: 92, objectFit: 'contain', flexShrink: 0 }} />
                <div style={{ fontFamily: FONT_UI, fontStyle: 'italic', fontWeight: 800, fontSize: 42, color: CW_BLUE, lineHeight: 1, letterSpacing: '-0.02em' }}>Car Wash</div>
              </div>

              {/* Date + Mileage */}
              <div style={{ padding: '16px 20px', borderBottom: `1px solid ${CW_RULE}` }}>
                <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' as const }}>
                  <div>
                    <div style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: CW_DIM, marginBottom: 4 }}>Date</div>
                    <div style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 15, color: CW_INK }}>{dateStr}</div>
                  </div>
                  {session.mileage != null && (
                    <div>
                      <div style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: CW_DIM, marginBottom: 4 }}>Mileage</div>
                      <div style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 15, color: CW_INK }}>{session.mileage.toLocaleString()} <span style={{ fontWeight: 400, fontSize: 12, color: CW_DIM }}>mi</span></div>
                    </div>
                  )}
                  {session.performed_by && (
                    <div>
                      <div style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: CW_DIM, marginBottom: 4 }}>Performed By</div>
                      <div style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 15, color: CW_INK }}>
                        {session.performed_by === 'shop' ? (session.shop_name || 'Shop') : 'Self'}
                      </div>
                    </div>
                  )}
                  {session.time_taken && (
                    <div>
                      <div style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: CW_DIM, marginBottom: 4 }}>Time Taken</div>
                      <div style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 15, color: CW_INK }}>{session.time_taken}</div>
                    </div>
                  )}
                  {session.total_cost != null && (
                    <div>
                      <div style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: CW_DIM, marginBottom: 4 }}>Total Cost</div>
                      <div style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 20, color: CW_INK }}>${Number(session.total_cost).toFixed(2)}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Exterior chips */}
              {(() => {
                const extJobs = jobs.filter(j => j.category?.toLowerCase() === 'exterior')
                if (extJobs.length === 0) return null
                return (
                  <div style={{ padding: '16px 20px', borderBottom: `1px solid ${CW_RULE}` }}>
                    <div style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 10, letterSpacing: '0.20em', textTransform: 'uppercase', color: CW_BLUE, marginBottom: 10 }}>Exterior</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
                      {extJobs.map(j => (
                        <span key={j.id} style={{ padding: '6px 12px', borderRadius: 6, border: `1.5px solid ${CW_BLUE}`, background: 'rgba(138,176,200,0.14)', color: CW_INK, fontFamily: FONT_UI, fontWeight: 700, fontSize: 12 }}>{j.title}</span>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* Interior chips */}
              {(() => {
                const intJobs = jobs.filter(j => j.category?.toLowerCase() === 'interior')
                if (intJobs.length === 0) return null
                return (
                  <div style={{ padding: '16px 20px', borderBottom: `1px solid ${CW_RULE}` }}>
                    <div style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 10, letterSpacing: '0.20em', textTransform: 'uppercase', color: CW_BLUE, marginBottom: 10 }}>Interior</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
                      {intJobs.map(j => (
                        <span key={j.id} style={{ padding: '6px 12px', borderRadius: 6, border: `1.5px solid ${CW_BLUE}`, background: 'rgba(138,176,200,0.14)', color: CW_INK, fontFamily: FONT_UI, fontWeight: 700, fontSize: 12 }}>{j.title}</span>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* Notes */}
              {session.notes && (
                <div style={{ padding: '16px 20px', borderBottom: `1px solid ${CW_RULE}` }}>
                  <div style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: CW_DIM, marginBottom: 6 }}>Notes</div>
                  <div style={{ fontFamily: FONT_UI, fontSize: 14, color: CW_INK, lineHeight: 1.65 }}>{session.notes}</div>
                </div>
              )}

              {/* Receipts */}
              {receipts.length > 0 && (
                <div style={{ borderBottom: `1px solid ${CW_RULE}` }}>
                  <button
                    onClick={() => {
                      const next = !receiptsExpanded
                      setReceiptsExpanded(next)
                      if (next && Object.keys(receiptUrls).length === 0) loadReceiptUrls(receipts)
                    }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
                  >
                    <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: CW_DIM }}>Receipts</span>
                    <span style={{ fontFamily: FONT_UI, fontSize: 10, color: CW_BLUE, marginLeft: 6, fontWeight: 700 }}>({receipts.length})</span>
                    <span style={{ marginLeft: 'auto', color: CW_DIM, fontSize: 11 }}>{receiptsExpanded ? '▴' : '▾'}</span>
                  </button>
                  {receiptsExpanded && (
                    <div style={{ padding: '2px 20px 16px', display: 'flex', flexWrap: 'wrap' as const, gap: 10 }}>
                      {receipts.map(r => {
                        const url = receiptUrls[r.id]
                        return (
                          <button key={r.id} onClick={() => url && window.open(url, '_blank')} disabled={!url}
                            style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 4, background: 'none', border: `1px solid ${CW_RULE}`, padding: 6, cursor: url ? 'pointer' : 'default', WebkitTapHighlightColor: 'transparent', borderRadius: 4 }}>
                            {r.file_type === 'image' ? (
                              url
                                ? <img src={url} style={{ width: 76, height: 76, objectFit: 'cover', borderRadius: 2 }} />
                                : <div style={{ width: 76, height: 76, background: 'rgba(138,176,200,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontFamily: FONT_UI, fontSize: 9, color: CW_DIM }}>Loading…</span></div>
                            ) : (
                              <div style={{ width: 76, height: 76, background: 'rgba(138,176,200,0.10)', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                                <span style={{ fontFamily: FONT_UI, fontSize: 16, fontWeight: 700, color: CW_BLUE }}>PDF</span>
                                <span style={{ fontFamily: FONT_UI, fontSize: 8, color: CW_DIM }}>tap to open</span>
                              </div>
                            )}
                            {r.file_name && <span style={{ fontFamily: FONT_UI, fontSize: 8, color: CW_DIM, maxWidth: 76, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{r.file_name}</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Timeline badge */}
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${CW_RULE}` }}>
                <span style={{
                  fontFamily: FONT_UI, fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase',
                  padding: '4px 10px', borderRadius: 9999,
                  border: `1px solid ${session.add_to_timeline ? `${CW_BLUE}88` : 'rgba(0,0,0,0.15)'}`,
                  color: session.add_to_timeline ? CW_BLUE : CW_DIM,
                  background: session.add_to_timeline ? 'rgba(138,176,200,0.12)' : 'transparent',
                  fontWeight: 700,
                }}>
                  {session.add_to_timeline ? '◆ In Timeline' : '◇ Not in Timeline'}
                </span>
              </div>

              {/* Actions */}
              <div style={{ padding: '20px 20px 0', display: 'flex', gap: 10 }}>
                <button
                  onClick={() => navigate(`/maintenance/detail/edit/${sessionId}`)}
                  style={{ flex: 1, padding: '13px 0', background: 'transparent', border: `1px solid ${CW_BLUE}88`, borderRadius: 0, color: CW_BLUE, fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
                >
                  Edit Record
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  style={{ flex: 1, padding: '13px 0', background: 'transparent', border: '1px solid rgba(180,60,60,0.35)', borderRadius: 0, color: '#b04040', fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
                >
                  Delete Record
                </button>
              </div>

            </div>
          </div>

        ) : (

          /* ══ PAPER INVOICE VIEW (service) ══ */
          <div style={{ position: 'relative', zIndex: 1, margin: '16px 14px 80px', background: '#ffffff', boxShadow: '0 2px 12px rgba(0,0,0,0.10)', overflow: 'hidden' }}>

            {/* Faint G logo watermark */}
            <img src={gLogo} aria-hidden style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 300, height: 300, objectFit: 'contain', opacity: 0.05, pointerEvents: 'none', zIndex: 0, userSelect: 'none' }} />

            {/* Invoice header */}
            <div style={{ padding: '20px 20px 16px', borderBottom: `2px solid ${INV_DIVIDER}`, position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <img src={gLogo} alt="G-Dimension" style={{ width: 36, height: 36, objectFit: 'contain' }} />
                  <div>
                    <div style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 13, color: INV_TEXT, letterSpacing: '0.04em' }}>G-DIMENSION</div>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: INV_MUTED, letterSpacing: '0.08em', textTransform: 'uppercase' }}>gdimension.app</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 15, color: INV_TEXT, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Service Invoice</div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: INV_MUTED, marginTop: 2 }}>#{invoiceNum}</div>
                </div>
              </div>
            </div>

            {/* Date / Vehicle row */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${INV_DIVIDER}` }}>
              <div style={{ flex: 1, padding: '14px 20px', borderRight: `1px solid ${INV_DIVIDER}` }}>
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: INV_MUTED, marginBottom: 4 }}>Date of Service</div>
                <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: INV_TEXT }}>{dateStr}</div>
              </div>
              {session.mileage != null ? (
                <div style={{ flex: 1, padding: '14px 20px' }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: INV_MUTED, marginBottom: 4 }}>Odometer</div>
                  <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: INV_TEXT }}>{session.mileage.toLocaleString()} <span style={{ fontWeight: 400, fontSize: 11, color: INV_MUTED }}>mi</span></div>
                </div>
              ) : car ? (
                <div style={{ flex: 1, padding: '14px 20px' }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: INV_MUTED, marginBottom: 4 }}>Vehicle</div>
                  <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: INV_TEXT }}>{[car.year, car.make, car.model, car.variant].filter(Boolean).join(' ')}</div>
                </div>
              ) : <div style={{ flex: 1 }} />}
            </div>

            {/* Vehicle (when mileage AND car both present) */}
            {car && session.mileage != null && (
              <div style={{ padding: '12px 20px', borderBottom: `1px solid ${INV_DIVIDER}` }}>
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: INV_MUTED, marginBottom: 3 }}>Vehicle</div>
                <div style={{ fontFamily: MONO, fontSize: 13, color: INV_TEXT }}>{[car.year, car.make, car.model, car.variant].filter(Boolean).join(' ')}</div>
              </div>
            )}

            {/* Performed By */}
            {(session.performed_by || session.shop_name || session.time_taken) && (
              <div style={{ padding: '12px 20px', borderBottom: `1px solid ${INV_DIVIDER}` }}>
                <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                  {session.performed_by && (
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: INV_MUTED, marginBottom: 3 }}>Performed By</div>
                      <div style={{ fontFamily: MONO, fontSize: 13, color: INV_TEXT, textTransform: 'uppercase' }}>
                        {session.performed_by === 'shop' ? (session.shop_name || 'Shop / Dealer') : 'Self'}
                      </div>
                    </div>
                  )}
                  {session.time_taken && (
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: INV_MUTED, marginBottom: 3 }}>Time Taken</div>
                      <div style={{ fontFamily: MONO, fontSize: 13, color: INV_TEXT }}>{session.time_taken}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Line items */}
            <div style={{ borderBottom: `1px solid ${INV_DIVIDER}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 20px 6px', background: '#f9f7f4', borderBottom: `1px solid ${INV_DIVIDER}` }}>
                <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: INV_MUTED }}>Description</span>
                <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: INV_MUTED }}>Amount</span>
              </div>
              {jobs.length === 0 ? (
                <div style={{ padding: '16px 20px', fontFamily: MONO, fontSize: 12, color: INV_MUTED }}>No line items recorded.</div>
              ) : jobs.map((job, i) => (
                <div key={job.id} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '10px 20px', borderBottom: i < jobs.length - 1 ? `1px dashed ${INV_DIVIDER}` : 'none', background: i % 2 === 0 ? '#ffffff' : '#fdfcfb' }}>
                  <div style={{ flex: 1, paddingRight: 16 }}>
                    <span style={{ fontFamily: MONO, fontSize: 13, color: INV_TEXT }}>{job.title}</span>
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 13, color: INV_TEXT, whiteSpace: 'nowrap' }}>
                    {job.cost != null ? `$${Number(job.cost).toFixed(2)}` : '—'}
                  </span>
                </div>
              ))}
            </div>

            {/* Cost breakdown */}
            {(session.total_cost != null || session.labor_cost != null || session.tax_amount != null) && (() => {
              const partsSum = jobs.reduce((acc, j) => acc + (j.cost != null ? Number(j.cost) : 0), 0)
              const fmt = (n: number) => `$${n.toFixed(2)}`
              const hasBreakdown = partsSum > 0 || session.labor_cost != null || session.tax_amount != null
              return (
                <div style={{ borderBottom: `1px solid ${INV_DIVIDER}`, background: '#fafaf8', paddingTop: 8, paddingBottom: 8 }}>
                  {hasBreakdown && partsSum > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 20px' }}>
                      <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: INV_MUTED }}>Parts</span>
                      <span style={{ fontFamily: MONO, fontSize: 13, color: '#555' }}>{fmt(partsSum)}</span>
                    </div>
                  )}
                  {session.labor_cost != null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 20px' }}>
                      <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: INV_MUTED }}>Labor</span>
                      <span style={{ fontFamily: MONO, fontSize: 13, color: '#555' }}>{fmt(Number(session.labor_cost))}</span>
                    </div>
                  )}
                  {session.tax_amount != null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 20px' }}>
                      <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: INV_MUTED }}>Tax</span>
                      <span style={{ fontFamily: MONO, fontSize: 13, color: '#555' }}>{fmt(Number(session.tax_amount))}</span>
                    </div>
                  )}
                  {hasBreakdown && <div style={{ borderTop: `1px dashed ${INV_DIVIDER}`, margin: '6px 20px 0' }} />}
                  {session.total_cost != null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 20px 2px' }}>
                      <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: INV_MUTED }}>Total</span>
                      <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color: INV_TEXT }}>${Number(session.total_cost).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Notes */}
            {session.notes && (
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${INV_DIVIDER}` }}>
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: INV_MUTED, marginBottom: 6 }}>Notes</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: '#3a3a3a', lineHeight: 1.65 }}>{session.notes}</div>
              </div>
            )}

            {/* Receipts */}
            {receipts.length > 0 && (
              <div style={{ borderBottom: `1px solid ${INV_DIVIDER}` }}>
                <button
                  onClick={() => {
                    const next = !receiptsExpanded
                    setReceiptsExpanded(next)
                    if (next && Object.keys(receiptUrls).length === 0) loadReceiptUrls(receipts)
                  }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', padding: '12px 20px', background: 'none', border: 'none', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
                >
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: INV_MUTED }}>Receipts</span>
                  <span style={{ fontFamily: FONT_UI, fontSize: 10, color: '#bbb', marginLeft: 6 }}>({receipts.length})</span>
                  <span style={{ marginLeft: 'auto', color: INV_MUTED, fontSize: 11 }}>{receiptsExpanded ? '▴' : '▾'}</span>
                </button>
                {receiptsExpanded && (
                  <div style={{ padding: '2px 20px 16px', display: 'flex', flexWrap: 'wrap' as const, gap: 10 }}>
                    {receipts.map(r => {
                      const url = receiptUrls[r.id]
                      return (
                        <button key={r.id} onClick={() => url && window.open(url, '_blank')} disabled={!url}
                          style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 4, background: 'none', border: `1px solid ${INV_DIVIDER}`, padding: 6, cursor: url ? 'pointer' : 'default', WebkitTapHighlightColor: 'transparent', borderRadius: 0 }}>
                          {r.file_type === 'image' ? (
                            url
                              ? <img src={url} style={{ width: 76, height: 76, objectFit: 'cover' }} />
                              : <div style={{ width: 76, height: 76, background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontFamily: MONO, fontSize: 9, color: '#bbb' }}>Loading…</span></div>
                          ) : (
                            <div style={{ width: 76, height: 76, background: '#f5f5f5', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                              <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: '#888' }}>PDF</span>
                              <span style={{ fontFamily: MONO, fontSize: 8, color: '#bbb' }}>tap to open</span>
                            </div>
                          )}
                          {r.file_name && <span style={{ fontFamily: MONO, fontSize: 8, color: INV_MUTED, maxWidth: 76, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{r.file_name}</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Timeline badge */}
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${INV_DIVIDER}` }}>
              <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase', padding: '3px 8px', border: `1px solid ${session.add_to_timeline ? 'rgba(180,145,70,0.55)' : '#d8d8d8'}`, color: session.add_to_timeline ? '#a07828' : INV_MUTED, background: session.add_to_timeline ? 'rgba(212,184,106,0.08)' : 'transparent' }}>
                {session.add_to_timeline ? '◆ In Timeline' : '◇ Not in Timeline'}
              </span>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 0 }}>
              <button onClick={() => navigate(`/maintenance/service/edit/${sessionId}`)} style={{ flex: 1, padding: '14px 0', background: '#f9f7f4', border: 'none', borderRight: `1px solid ${INV_DIVIDER}`, color: '#444', fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
                Edit Record
              </button>
              <button onClick={() => setConfirmDelete(true)} style={{ flex: 1, padding: '14px 0', background: '#fdf8f8', border: 'none', color: '#c06060', fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
                Delete
              </button>
            </div>

          </div>

        )}
      </div>

      {/* ── Delete confirmation overlay ── */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}>
          <div style={{ width: '100%', background: isDetail ? CW_BG : '#ffffff', padding: '28px 24px 40px', borderTop: isDetail ? `2px solid ${CW_RULE}` : `2px solid ${INV_DIVIDER}` }}>
            <div style={{ fontFamily: isDetail ? FONT_UI : MONO, fontSize: 14, letterSpacing: '0.08em', textTransform: 'uppercase', color: isDetail ? CW_INK : INV_TEXT, marginBottom: 8 }}>Delete this record?</div>
            <div style={{ fontFamily: isDetail ? FONT_UI : MONO, fontSize: 12, color: isDetail ? CW_DIM : INV_MUTED, marginBottom: 24, lineHeight: 1.6 }}>This will permanently remove this record and all associated data. This cannot be undone.</div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: '12px 0', background: '#f4f4f4', border: `1px solid ${isDetail ? CW_RULE : INV_DIVIDER}`, borderRadius: 0, color: '#555', fontFamily: isDetail ? FONT_UI : MONO, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>Cancel</button>
              <button onClick={handleDelete} disabled={deleting} style={{ flex: 1, padding: '12px 0', background: deleting ? '#fdf0f0' : '#fce8e8', border: '1px solid #e0b0b0', borderRadius: 0, color: deleting ? '#c09090' : '#b04040', fontFamily: isDetail ? FONT_UI : MONO, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: deleting ? 'default' : 'pointer', WebkitTapHighlightColor: 'transparent' }}>
                {deleting ? 'Deleting…' : 'Delete Record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
