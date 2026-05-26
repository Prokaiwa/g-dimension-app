const _now        = new Date()
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_LABEL = MONTHS[_now.getMonth()]
const DAY_LABEL   = String(_now.getDate())
const TODAY       = _now.toISOString().split('T')[0]

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import {
  COLOR_HEADER_BLACK, COLOR_HEADER_WARM, COLOR_HEADER_TITLE,
  COLOR_TIMELINE_SERVICE,
  FONT_UI, HEADER_HEIGHT,
} from '../tokens'

const JOB_CATS = ['Oil Change', 'Tires', 'Brakes', 'Fluids', 'Filters', 'Inspection', 'Custom']

type JobRow = { _id: string; category: string; description: string; cost: string }

let _seq = 0
function uid() { return `j${++_seq}` }

const MONO = "'Courier New', Courier, monospace"

const fieldLabel: React.CSSProperties = {
  fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em',
  textTransform: 'uppercase', color: 'rgba(212,184,106,0.55)',
  marginBottom: 3,
}

const fieldInput: React.CSSProperties = {
  background: 'transparent', border: 'none',
  borderBottom: '1px solid rgba(212,184,106,0.18)',
  color: 'rgba(245,245,245,0.90)', fontFamily: MONO,
  fontSize: 14, padding: '4px 0', outline: 'none', width: '100%',
}

const divider: React.CSSProperties = {
  borderTop: '1px dashed rgba(212,184,106,0.14)',
  margin: '0 0 0 0',
}

export default function MaintenanceServiceNewPage() {
  const navigate = useNavigate()
  const [carInfo, setCarInfo] = useState('')
  const [carId, setCarId] = useState<string | null>(null)
  const [date, setDate] = useState(TODAY)
  const [mileage, setMileage] = useState('')
  const [performedBy, setPerformedBy] = useState<'self' | 'shop'>('self')
  const [shopName, setShopName] = useState('')
  const [jobs, setJobs] = useState<JobRow[]>([{ _id: uid(), category: 'Oil Change', description: '', cost: '' }])
  const [totalCost, setTotalCost] = useState('')
  const [totalEdited, setTotalEdited] = useState(false)
  const [notes, setNotes] = useState('')
  const [addToTimeline, setAddToTimeline] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getActiveCarId().then(id => {
      if (!id) return
      setCarId(id)
      supabase.from('cars').select('year, make, model').eq('id', id).single()
        .then(({ data }) => {
          if (data) {
            const d = data as { year: number | null; make: string | null; model: string | null }
            setCarInfo([d.year, d.make, d.model].filter(Boolean).join(' '))
          }
        })
    })
  }, [])

  useEffect(() => {
    if (totalEdited) return
    const sum = jobs.reduce((acc, j) => acc + (parseFloat(j.cost) || 0), 0)
    setTotalCost(sum > 0 ? sum.toFixed(2) : '')
  }, [jobs, totalEdited])

  function addJob() {
    setJobs(prev => [...prev, { _id: uid(), category: 'Oil Change', description: '', cost: '' }])
  }

  function removeJob(id: string) {
    setJobs(prev => prev.filter(j => j._id !== id))
  }

  function updateJob(id: string, field: keyof Omit<JobRow, '_id'>, value: string) {
    setJobs(prev => prev.map(j => j._id === id ? { ...j, [field]: value } : j))
  }

  async function handleSave() {
    if (saving || !carId) return
    setSaving(true)

    const { data: session, error } = await supabase.from('sessions').insert({
      car_id: carId,
      type: 'maintenance',
      date_performed: date,
      performed_by: performedBy,
      shop_name: performedBy === 'shop' && shopName.trim() ? shopName.trim() : null,
      mileage: mileage ? parseInt(mileage, 10) : null,
      total_cost: totalCost ? parseFloat(totalCost) : null,
      notes: notes.trim() || null,
      add_to_timeline: addToTimeline,
    }).select('id').single()

    if (error || !session) { setSaving(false); return }

    const validJobs = jobs.filter(j => j.description.trim() || j.cost)
    if (validJobs.length > 0) {
      await supabase.from('jobs').insert(validJobs.map(j => ({
        session_id: session.id,
        type: 'maintenance',
        category: j.category,
        title: j.description.trim() || j.category,
        cost: j.cost ? parseFloat(j.cost) : null,
        status: 'installed',
      })))
    }

    navigate(`/maintenance/${session.id}`)
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#0a0908', fontFamily: FONT_UI, overflow: 'hidden' }}>
      <style>{`
        input[type=date]::-webkit-calendar-picker-indicator { filter: invert(0.6) sepia(1) hue-rotate(5deg) saturate(0.6); opacity: 0.5; cursor: pointer; }
        select option { background: #1a1612; }
        .svc-input:focus { border-bottom-color: rgba(212,184,106,0.55) !important; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ height: HEADER_HEIGHT, flexShrink: 0, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 10, paddingRight: 14, borderBottom: '1px solid rgba(255,255,255,0.04)', position: 'relative', zIndex: 10 }}>
        <button onClick={() => navigate('/maintenance')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px 4px 4px', WebkitTapHighlightColor: 'transparent' }}>
          <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
          <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 13, color: COLOR_HEADER_TITLE, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Service</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          <div style={{ background: 'rgba(242,238,228,0.94)', color: '#0d0d0d', padding: '4px 7px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>{MONTH_LABEL}</div>
          <div style={{ background: COLOR_TIMELINE_SERVICE, color: '#0d0d0d', padding: '4px 8px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: DAY_LABEL.length === 1 ? 24 : 30 }}>{DAY_LABEL}</div>
        </div>
      </div>

      {/* ── Scrollable form ── */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' as unknown as undefined }}>

        {/* Invoice header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid rgba(212,184,106,0.12)' }}>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.20em', textTransform: 'uppercase', color: 'rgba(212,184,106,0.45)' }}>Vehicle Service Record</div>
          {carInfo && <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, letterSpacing: '0.05em', color: 'rgba(245,245,245,0.88)', marginTop: 5, textTransform: 'uppercase' }}>{carInfo}</div>}
        </div>

        {/* Date / Mileage / Performed by */}
        <div style={{ padding: '16px 20px', borderBottom: divider.borderTop as string }}>
          <div style={{ display: 'flex', gap: 20, marginBottom: 18 }}>
            <div style={{ flex: 1 }}>
              <div style={fieldLabel}>Date of Service</div>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="svc-input" style={{ ...fieldInput, colorScheme: 'dark' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={fieldLabel}>Mileage</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <input type="number" value={mileage} onChange={e => setMileage(e.target.value)} placeholder="—" className="svc-input" style={{ ...fieldInput, flex: 1 }} />
                <span style={{ fontFamily: MONO, fontSize: 11, color: 'rgba(212,184,106,0.40)' }}>mi</span>
              </div>
            </div>
          </div>
          <div>
            <div style={fieldLabel}>Performed By</div>
            <div style={{ display: 'flex', gap: 0, marginTop: 6 }}>
              {(['self', 'shop'] as const).map(v => (
                <button key={v} onClick={() => setPerformedBy(v)} style={{
                  flex: 1, padding: '7px 0',
                  background: performedBy === v ? COLOR_TIMELINE_SERVICE : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${performedBy === v ? COLOR_TIMELINE_SERVICE : 'rgba(212,184,106,0.18)'}`,
                  color: performedBy === v ? '#0d0d0d' : 'rgba(245,245,245,0.55)',
                  fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em',
                  textTransform: 'uppercase', cursor: 'pointer', borderRadius: 0,
                  WebkitTapHighlightColor: 'transparent',
                }}>{v === 'self' ? 'SELF' : 'SHOP'}</button>
              ))}
            </div>
          </div>
          {performedBy === 'shop' && (
            <div style={{ marginTop: 14 }}>
              <div style={fieldLabel}>Shop Name</div>
              <input type="text" value={shopName} onChange={e => setShopName(e.target.value)} placeholder="—" className="svc-input" style={fieldInput} />
            </div>
          )}
        </div>

        {/* Services performed */}
        <div style={{ padding: '14px 20px 0' }}>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(212,184,106,0.55)', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid rgba(212,184,106,0.12)' }}>
            Services Performed
          </div>

          {jobs.map((job, idx) => (
            <div key={job._id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px dashed rgba(212,184,106,0.10)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ fontFamily: MONO, fontSize: 11, color: 'rgba(212,184,106,0.35)', minWidth: 18 }}>{String(idx + 1).padStart(2, '0')}.</span>
                <select
                  value={job.category}
                  onChange={e => updateJob(job._id, 'category', e.target.value)}
                  style={{
                    flex: 1, background: '#0f0d0a',
                    border: '1px solid rgba(212,184,106,0.20)', borderRadius: 0,
                    color: 'rgba(245,245,245,0.85)', fontFamily: MONO,
                    fontSize: 12, padding: '5px 8px', cursor: 'pointer', outline: 'none',
                  }}
                >
                  {JOB_CATS.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                </select>
                {jobs.length > 1 && (
                  <button onClick={() => removeJob(job._id)} style={{ background: 'none', border: 'none', color: 'rgba(212,184,106,0.35)', fontFamily: MONO, fontSize: 16, cursor: 'pointer', padding: '2px 6px', WebkitTapHighlightColor: 'transparent', lineHeight: 1 }}>×</button>
                )}
              </div>
              <div style={{ paddingLeft: 26, display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ ...fieldLabel, fontSize: 9 }}>Description</div>
                  <input type="text" value={job.description} onChange={e => updateJob(job._id, 'description', e.target.value)} placeholder="What was done..." className="svc-input" style={{ ...fieldInput, fontSize: 13 }} />
                </div>
                <div style={{ width: 80 }}>
                  <div style={{ ...fieldLabel, fontSize: 9 }}>Cost</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: 'rgba(212,184,106,0.45)' }}>$</span>
                    <input type="number" value={job.cost} onChange={e => updateJob(job._id, 'cost', e.target.value)} placeholder="0.00" min="0" step="0.01" className="svc-input" style={{ ...fieldInput, fontSize: 13 }} />
                  </div>
                </div>
              </div>
            </div>
          ))}

          <button onClick={addJob} style={{ background: 'none', border: '1px dashed rgba(212,184,106,0.25)', color: COLOR_TIMELINE_SERVICE, fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em', padding: '8px 16px', cursor: 'pointer', borderRadius: 0, width: '100%', marginBottom: 0, WebkitTapHighlightColor: 'transparent', textTransform: 'uppercase' }}>
            + Add Service Line
          </button>
        </div>

        {/* Total */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(212,184,106,0.18)', borderBottom: '1px solid rgba(212,184,106,0.12)', background: 'rgba(212,184,106,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(212,184,106,0.70)' }}>Total Due</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontFamily: MONO, fontSize: 14, color: COLOR_TIMELINE_SERVICE }}>$</span>
              <input
                type="number" value={totalCost}
                onChange={e => { setTotalEdited(true); setTotalCost(e.target.value) }}
                placeholder="0.00" min="0" step="0.01"
                className="svc-input"
                style={{ ...fieldInput, fontSize: 18, fontWeight: 700, width: 100, textAlign: 'right', color: COLOR_TIMELINE_SERVICE, borderBottomColor: 'rgba(212,184,106,0.30)' }}
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div style={{ padding: '16px 20px', borderBottom: '1px dashed rgba(212,184,106,0.10)' }}>
          <div style={fieldLabel}>Notes / Additional Remarks</div>
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Any additional notes..."
            rows={3}
            style={{
              ...fieldInput, resize: 'none', lineHeight: 1.5,
              borderBottom: 'none', border: '1px solid rgba(212,184,106,0.15)',
              padding: '8px', fontFamily: MONO, fontSize: 13,
            }}
          />
        </div>

        {/* Timeline toggle */}
        <div style={{ padding: '16px 20px', borderBottom: '1px dashed rgba(212,184,106,0.10)' }}>
          <button onClick={() => setAddToTimeline(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 0, WebkitTapHighlightColor: 'transparent' }}>
            <div style={{ width: 18, height: 18, border: `1px solid ${addToTimeline ? COLOR_TIMELINE_SERVICE : 'rgba(212,184,106,0.30)'}`, background: addToTimeline ? COLOR_TIMELINE_SERVICE : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {addToTimeline && <span style={{ color: '#0d0d0d', fontSize: 12, lineHeight: 1, fontWeight: 700 }}>✓</span>}
            </div>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: addToTimeline ? COLOR_TIMELINE_SERVICE : 'rgba(245,245,245,0.45)' }}>Add to Timeline</div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: 'rgba(245,245,245,0.25)', marginTop: 2 }}>Default off for routine service</div>
            </div>
          </button>
        </div>

        {/* Save */}
        <div style={{ padding: '24px 20px 48px' }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: '100%', padding: '14px 0',
              background: saving ? 'rgba(212,184,106,0.15)' : COLOR_TIMELINE_SERVICE,
              border: 'none', borderRadius: 0,
              color: saving ? 'rgba(212,184,106,0.50)' : '#0a0a0a',
              fontFamily: MONO, fontSize: 12, letterSpacing: '0.18em',
              textTransform: 'uppercase', fontWeight: 700,
              cursor: saving ? 'default' : 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {saving ? 'Saving...' : 'Save Service Record'}
          </button>
        </div>
      </div>
    </div>
  )
}
