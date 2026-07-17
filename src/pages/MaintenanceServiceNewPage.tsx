const TODAY = new Date().toISOString().split('T')[0]

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { reportActionError } from '../lib/appError'
import { getActiveCarId } from '../lib/activeCar'
import { asMileageUnit, milesToUnit, unitToMiles, type MileageUnit } from '../lib/mileage'
import gIcon from '../assets/logo/gdimensionG.webp'
import imageCompression from 'browser-image-compression'

const JOB_CATS = ['Oil Change', 'Tires', 'Brakes', 'Fluids', 'Filters', 'Battery', 'Inspection', 'Custom']
type JobRow = { _id: string; category: string; description: string; cost: string }
let _seq = 0
function uid() { return `j${++_seq}` }

// ── Windows XP palette & shared styles ──────────────────────────────────────
const XP_BG       = '#ece9d8'
const XP_WHITE    = '#ffffff'
const XP_BORDER   = '#aca899'
const XP_INPUT_B  = '#7f9db9'
const XP_TEXT     = '#000000'
const XP_FONT     = "'Tahoma', 'MS Sans Serif', Arial, sans-serif"

const xpInput: React.CSSProperties = {
  fontFamily: XP_FONT, fontSize: 13,
  background: XP_WHITE, color: XP_TEXT,
  border: `1px solid ${XP_INPUT_B}`,
  borderRadius: 0, padding: '4px 5px',
  outline: 'none', width: '100%',
  boxSizing: 'border-box',
  height: 30,
}

const xpLabel: React.CSSProperties = {
  fontFamily: XP_FONT, fontSize: 12,
  color: XP_TEXT, display: 'block', marginBottom: 3,
}

const xpBtn: React.CSSProperties = {
  fontFamily: XP_FONT, fontSize: 12, color: XP_TEXT,
  background: `linear-gradient(to bottom, #f5f3ee 0%, ${XP_BG} 100%)`,
  border: `1px solid #003c74`,
  borderRadius: 0, padding: '5px 18px',
  minWidth: 80, minHeight: 28,
  cursor: 'pointer',
  boxShadow: 'inset 1px 1px 0 rgba(255,255,255,0.9), inset -1px -1px 0 rgba(0,0,0,0.12)',
  WebkitTapHighlightColor: 'transparent',
}

type PendingReceipt = { file: File; preview: string | null; name: string }

// Group box — the classic Windows bordered panel with label on top border
function XPGroupBox({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ position: 'relative', border: `1px solid ${XP_BORDER}`, padding: '16px 10px 10px', marginBottom: 10, ...style }}>
      <span style={{
        position: 'absolute', top: 0, left: 8,
        transform: 'translateY(-50%)',
        background: XP_WHITE, padding: '0 4px',
        fontFamily: XP_FONT, fontSize: 12, color: XP_TEXT,
      }}>{label}</span>
      {children}
    </div>
  )
}

export default function MaintenanceServiceNewPage() {
  const navigate = useNavigate()

  const [carInfo,       setCarInfo]       = useState('')
  const [carId,         setCarId]         = useState<string | null>(null)
  const [currentMileage, setCurrentMileage] = useState<number | null>(null)
  const [mileageUnit,    setMileageUnit]    = useState<MileageUnit>('mi')
  const [updateOdometer, setUpdateOdometer] = useState(true)
  const [date,          setDate]          = useState(TODAY)
  const [mileage,       setMileage]       = useState('')
  const [performedBy,   setPerformedBy]   = useState<'self' | 'shop'>('self')
  const [shopName,      setShopName]      = useState('')
  const [jobs,          setJobs]          = useState<JobRow[]>([{ _id: uid(), category: 'Oil Change', description: '', cost: '' }])
  const [laborCost,     setLaborCost]     = useState('')
  const [taxAmount,     setTaxAmount]     = useState('')
  const [totalCost,     setTotalCost]     = useState('')
  const [totalEdited,   setTotalEdited]   = useState(false)
  const [timeTaken,     setTimeTaken]     = useState('')
  const [notes,         setNotes]         = useState('')
  const [addToTimeline,    setAddToTimeline]    = useState(false)
  const [timelineTitle,    setTimelineTitle]    = useState('')
  const [timelineStory,    setTimelineStory]    = useState('')
  const [pendingReceipts,  setPendingReceipts]  = useState<PendingReceipt[]>([])
  const [saving,           setSaving]           = useState(false)

  useEffect(() => {
    getActiveCarId().then(id => {
      if (!id) return
      setCarId(id)
      supabase.from('cars').select('year, make, model, variant, current_mileage, mileage_unit').eq('id', id).single()
        .then(({ data }) => {
          if (data) {
            const d = data as { year: number | null; make: string | null; model: string | null; variant: string | null; current_mileage: number | null; mileage_unit: string | null }
            setCarInfo([d.year, d.make, d.model, d.variant].filter(Boolean).join(' '))
            setCurrentMileage(d.current_mileage ?? null)
            setMileageUnit(asMileageUnit(d.mileage_unit))
          }
        })
    })
  }, [])

  useEffect(() => {
    if (totalEdited) return
    const parts  = jobs.reduce((acc, j) => acc + (parseFloat(j.cost) || 0), 0)
    const labor  = parseFloat(laborCost) || 0
    const tax    = parseFloat(taxAmount) || 0
    const sum    = parts + labor + tax
    setTotalCost(sum > 0 ? sum.toFixed(2) : '')
  }, [jobs, laborCost, taxAmount, totalEdited])

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
    if (saving) return
    if (!carId) { reportActionError('No active car. Add a car in My Cars first, then save this service'); return }
    setSaving(true)
    const { data: session, error } = await supabase.from('sessions').insert({
      car_id: carId, type: 'maintenance',
      date_performed: date, performed_by: performedBy,
      shop_name: performedBy === 'shop' && shopName.trim() ? shopName.trim() : null,
      mileage: mileage ? unitToMiles(parseInt(mileage, 10), mileageUnit) : null,
      labor_cost: laborCost ? parseFloat(laborCost) : null,
      tax_amount: taxAmount ? parseFloat(taxAmount) : null,
      total_cost: totalCost ? parseFloat(totalCost) : null,
      time_taken: timeTaken.trim() || null,
      notes: notes.trim() || null, add_to_timeline: addToTimeline,
      timeline_title: timelineTitle.trim() || null,
      journal_entry: timelineStory.trim() || null,
    }).select('id').single()
    if (error || !session) { reportActionError("Couldn't save the service session", error); setSaving(false); return }
    // Keep the odometer fresh from the logged mileage (opt-in, only if higher).
    const enteredMi = mileage ? unitToMiles(parseInt(mileage, 10), mileageUnit) : NaN
    if (updateOdometer && Number.isFinite(enteredMi) && enteredMi > (currentMileage ?? -1)) {
      await supabase.from('cars').update({ current_mileage: enteredMi }).eq('id', carId)
    }
    if (jobs.length > 0) {
      const { error: jobsError } = await supabase.from('jobs').insert(jobs.map(j => ({
        car_id: carId, session_id: session.id, type: 'maintenance',
        // category is a FK → part_categories (tuning only); maintenance uses null
        // instead, we fold the service type into the title
        title: j.description.trim() ? `${j.category}: ${j.description.trim()}` : j.category,
        cost: j.cost ? parseFloat(j.cost) : null,
        status: 'installed',
      })))
      if (jobsError) { reportActionError("Couldn't save the service items", jobsError); setSaving(false); return }
    }
    if (pendingReceipts.length > 0) {
      const { data: authData } = await supabase.auth.getUser()
      const userId = authData?.user?.id
      if (userId) {
        const sid = (session as { id: string }).id
        await Promise.all(pendingReceipts.map(async r => {
          const isImg = r.file.type.startsWith('image/')
          const ext   = isImg ? 'jpg' : 'pdf'
          const path  = `${userId}/${carId}/${sid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
          let upload: File | Blob = r.file
          if (isImg) {
            try { upload = await imageCompression(r.file, { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true, fileType: 'image/jpeg' }) } catch { /* use original */ }
          }
          const { error: upErr } = await supabase.storage.from('receipts').upload(path, upload)
          if (upErr) return
          await supabase.from('receipts').insert({ session_id: sid, file_url: path, file_type: isImg ? 'image' : 'pdf', file_name: r.name })
        }))
      }
    }
    navigate(`/maintenance/${(session as { id: string }).id}`)
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: XP_WHITE, fontFamily: XP_FONT, overflow: 'hidden' }}>
      <style>{`
        .xp-date::-webkit-calendar-picker-indicator { opacity: 0.7; cursor: pointer; }
        .xp-input:focus { outline: 1px solid #316ac5 !important; outline-offset: -1px; }
        .xp-btn:hover  { background: linear-gradient(to bottom, #ffffff 0%, #e8e5dc 100%) !important; }
        .xp-btn:active { box-shadow: inset 1px 1px 0 rgba(0,0,0,0.15) !important; }
        select option  { background: #fff; color: #000; }
        input[type="radio"], input[type="checkbox"] { accent-color: #316ac5; }
        input[type="number"] { -moz-appearance: textfield; }
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

      `}</style>

      {/* ── Windows XP Title Bar ── */}
      <div style={{
        height: 30, flexShrink: 0,
        background: 'linear-gradient(to bottom, #4a80be 0%, #2255b5 50%, #1e4fae 100%)',
        display: 'flex', alignItems: 'center',
        padding: '0 3px 0 6px',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35)',
        userSelect: 'none',
      }}>
        <img src={gIcon} alt="" style={{ width: 14, height: 14, marginRight: 5, objectFit: 'contain', opacity: 0.9 }} />
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 12, flex: 1, textShadow: '1px 1px 1px rgba(0,0,0,0.5)', letterSpacing: '0.01em' }}>
          New Service Record
        </span>
        {/* Window control buttons */}
        <div style={{ display: 'flex', gap: 2 }}>
          {[{ label: '─', bg: 'linear-gradient(to bottom, #d0cac0, #b0aaa0)', color: '#000' },
            { label: '□', bg: 'linear-gradient(to bottom, #d0cac0, #b0aaa0)', color: '#000' },
            { label: '✕', bg: 'linear-gradient(to bottom, #e07060, #b82818)', color: '#fff', action: () => navigate('/maintenance/service') },
          ].map(({ label, bg, color, action }) => (
            <button key={label} onClick={action}
              style={{
                width: 21, height: 21, border: '1px solid rgba(0,0,0,0.55)',
                background: bg, color, fontFamily: XP_FONT,
                fontSize: label === '✕' ? 12 : 11, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: action ? 'pointer' : 'default',
                boxShadow: 'inset 1px 1px 0 rgba(255,255,255,0.5)',
                WebkitTapHighlightColor: 'transparent',
                borderRadius: 0,
              }}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── Menu bar ── */}
      <div style={{
        height: 22, flexShrink: 0,
        background: XP_WHITE,
        borderBottom: `1px solid ${XP_BORDER}`,
        display: 'flex', alignItems: 'center',
        padding: '0 4px',
      }}>
        {['File', 'Edit', 'View', 'Help'].map(item => (
          <button key={item} style={{
            background: 'none', border: 'none',
            fontFamily: XP_FONT, fontSize: 12, color: XP_TEXT,
            padding: '2px 8px', cursor: 'default',
            WebkitTapHighlightColor: 'transparent',
          }}>{item}</button>
        ))}
      </div>

      {/* ── Scrollable form body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px 4px', background: XP_WHITE }}>

        {/* Vehicle */}
        <XPGroupBox label="Vehicle" style={{ padding: '10px 10px 6px', marginBottom: 8 }}>
          <div style={{ fontFamily: XP_FONT, fontSize: 13, color: carInfo ? XP_TEXT : '#808080' }}>
            {carInfo || 'Loading vehicle info…'}
          </div>
        </XPGroupBox>

        {/* Service Details */}
        <XPGroupBox label="Service Details">
          <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
            <div>
              <label style={xpLabel}>Date of Service:</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="xp-date xp-input" style={{ ...xpInput, width: 170, colorScheme: 'light' }} />
            </div>
            <div>
              <label style={xpLabel}>Odometer ({mileageUnit}):</label>
              <input type="number" value={mileage} onChange={e => setMileage(e.target.value)}
                placeholder="0" className="xp-input" style={{ ...xpInput, width: 120 }} />
            </div>
          </div>

          {(() => {
            const entered = mileage ? parseInt(mileage, 10) : NaN
            const enteredInMiles = Number.isFinite(entered) ? unitToMiles(entered, mileageUnit) : NaN
            if (!Number.isFinite(enteredInMiles) || enteredInMiles <= (currentMileage ?? -1)) return null
            return (
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10, fontFamily: XP_FONT, fontSize: 12, color: XP_TEXT, cursor: 'pointer' }}>
                <input type="checkbox" checked={updateOdometer} onChange={e => setUpdateOdometer(e.target.checked)} />
                Update {carInfo || 'this car'}'s odometer to {entered.toLocaleString()} {mileageUnit}
                {currentMileage != null && <span style={{ opacity: 0.6 }}> (now {milesToUnit(currentMileage, mileageUnit).toLocaleString()})</span>}
              </label>
            )
          })()}

          <div style={{ marginBottom: performedBy === 'shop' ? 10 : 0 }}>
            <span style={{ ...xpLabel, marginBottom: 5 }}>Performed by:</span>
            <div style={{ display: 'flex', gap: 20 }}>
              {(['self', 'shop'] as const).map(v => (
                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: XP_FONT, fontSize: 12, cursor: 'pointer', color: XP_TEXT }}>
                  <input type="radio" name="performedBy" checked={performedBy === v} onChange={() => setPerformedBy(v)} />
                  {v === 'self' ? 'Self' : 'Shop / Dealer'}
                </label>
              ))}
            </div>
          </div>

          {performedBy === 'shop' && (
            <div style={{ marginBottom: 10 }}>
              <label style={xpLabel}>Shop / Dealer Name:</label>
              <input type="text" value={shopName} onChange={e => setShopName(e.target.value)}
                placeholder="Enter name…" className="xp-input" style={xpInput} />
            </div>
          )}
          <div>
            <label style={xpLabel}>Time Taken:</label>
            <input type="text" value={timeTaken} onChange={e => setTimeTaken(e.target.value)}
              placeholder="e.g. 1.5 hours, 45 min…" className="xp-input" style={{ ...xpInput, width: 220 }} />
          </div>
        </XPGroupBox>

        {/* Services Performed */}
        <XPGroupBox label="Services Performed">
          {jobs.length === 0 && (
            <div style={{ fontFamily: XP_FONT, fontSize: 11, color: '#999', textAlign: 'center', padding: '6px 0 2px', fontStyle: 'italic' }}>
              No line items — tap + Add Line to itemise services
            </div>
          )}
          {jobs.map((job, idx) => (
            <div key={job._id} style={{
              marginBottom: idx < jobs.length - 1 ? 10 : 0,
              paddingBottom: idx < jobs.length - 1 ? 10 : 0,
              borderBottom: idx < jobs.length - 1 ? `1px solid ${XP_BG}` : 'none',
            }}>
              {/* Row: number, category, cost, delete */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <span style={{ fontFamily: XP_FONT, fontSize: 11, color: '#808080', minWidth: 22 }}>
                  {String(idx + 1).padStart(2, '0')}.
                </span>
                <select value={job.category} onChange={e => updateJob(job._id, 'category', e.target.value)}
                  className="xp-input" style={{ ...xpInput, flex: 1, height: 26, padding: '2px 4px' }}>
                  {JOB_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <span style={{ fontFamily: XP_FONT, fontSize: 13, color: '#555' }}>$</span>
                  <input type="number" value={job.cost} onChange={e => updateJob(job._id, 'cost', e.target.value)}
                    placeholder="0.00" min="0" step="0.01"
                    className="xp-input" style={{ ...xpInput, width: 80 }} />
                </div>
                <button onClick={() => removeJob(job._id)} className="xp-btn"
                  style={{ ...xpBtn, minWidth: 'auto', padding: '3px 8px', fontSize: 14, lineHeight: 1 }}>×</button>
              </div>
              {/* Description */}
              <div style={{ paddingLeft: 28 }}>
                <input type="text" value={job.description} onChange={e => updateJob(job._id, 'description', e.target.value)}
                  placeholder="Description of work performed…"
                  className="xp-input" style={{ ...xpInput, fontSize: 12 }} />
              </div>
            </div>
          ))}
          <div style={{ marginTop: jobs.length === 0 ? 8 : 10, textAlign: 'right' }}>
            <button onClick={addJob} className="xp-btn" style={xpBtn}>+ Add Line</button>
          </div>
        </XPGroupBox>

        {/* Total breakdown */}
        <XPGroupBox label="Total" style={{ padding: '10px 10px 8px', marginBottom: 8 }}>
          {(() => {
            const partsSum = jobs.reduce((acc, j) => acc + (parseFloat(j.cost) || 0), 0)
            const row = (label: string, val: string, setter: (v: string) => void, readOnly = false, bold = false) => (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginBottom: 5 }}>
                <span style={{ fontFamily: XP_FONT, fontSize: 11, color: bold ? XP_TEXT : '#666', fontWeight: bold ? 700 : 400, minWidth: 56, textAlign: 'right' }}>{label}</span>
                <span style={{ fontFamily: XP_FONT, fontSize: 12, color: '#555' }}>$</span>
                <input type="number" value={val}
                  readOnly={readOnly}
                  onChange={readOnly ? undefined : e => { setter(e.target.value); if (label === 'Total:') setTotalEdited(true) }}
                  placeholder="0.00" min="0" step="0.01"
                  className={readOnly ? '' : 'xp-input'}
                  style={{ ...xpInput, width: 90, textAlign: 'right', fontWeight: bold ? 700 : 400, fontSize: bold ? 14 : 12, background: readOnly ? 'transparent' : '#fff', border: readOnly ? 'none' : undefined, color: readOnly ? '#555' : XP_TEXT }} />
              </div>
            )
            return (
              <>
                {partsSum > 0 && row('Parts:', partsSum.toFixed(2), () => {}, true)}
                {performedBy === 'shop' && row('Labor:', laborCost, setLaborCost)}
                {row('Tax:', taxAmount, setTaxAmount)}
                <div style={{ borderTop: `1px solid ${XP_BORDER}`, marginTop: 4, paddingTop: 6 }}>
                  {row('Total:', totalCost, v => { setTotalEdited(true); setTotalCost(v) }, false, true)}
                </div>
              </>
            )
          })()}
        </XPGroupBox>

        {/* Notes */}
        <div style={{ marginBottom: 10 }}>
          <label style={xpLabel}>Notes / Additional Remarks:</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Any additional notes…" rows={3}
            className="xp-input"
            style={{ ...xpInput, resize: 'none', lineHeight: 1.5, padding: '5px', height: 64 }} />
        </div>

        {/* Receipts */}
        <XPGroupBox label="Receipts">
          {pendingReceipts.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {pendingReceipts.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, padding: '3px 4px', background: '#f9f9f9', border: `1px solid ${XP_BORDER}` }}>
                  {r.preview
                    ? <img src={r.preview} style={{ width: 28, height: 28, objectFit: 'cover', flexShrink: 0 }} />
                    : <div style={{ width: 28, height: 28, background: '#e8e8e8', border: `1px solid ${XP_BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><span style={{ fontFamily: XP_FONT, fontSize: 8, fontWeight: 700, color: '#666' }}>PDF</span></div>
                  }
                  <span style={{ flex: 1, fontFamily: XP_FONT, fontSize: 11, color: XP_TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                  <button onClick={() => setPendingReceipts(prev => prev.filter((_, idx) => idx !== i))} className="xp-btn" style={{ ...xpBtn, minWidth: 'auto', padding: '1px 7px', fontSize: 13, lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ cursor: 'pointer' }}>
              <input type="file" accept="image/*,application/pdf" multiple style={{ display: 'none' }}
                onChange={e => {
                  const files = Array.from(e.target.files ?? [])
                  setPendingReceipts(prev => [...prev, ...files.map(f => ({ file: f, preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null, name: f.name }))])
                  e.target.value = ''
                }} />
              <span className="xp-btn" style={{ ...xpBtn, display: 'inline-block' }}>Attach Receipt</span>
            </label>
            {pendingReceipts.length === 0 && <span style={{ fontFamily: XP_FONT, fontSize: 11, color: '#888', fontStyle: 'italic' }}>No receipts attached</span>}
          </div>
        </XPGroupBox>

        {/* Timeline checkbox */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: XP_FONT, fontSize: 12, cursor: 'pointer', marginBottom: 12, color: XP_TEXT }}>
          <input type="checkbox" checked={addToTimeline} onChange={e => setAddToTimeline(e.target.checked)} />
          Add this service to the vehicle timeline
        </label>

        {/* Timeline title + story — only when on the timeline */}
        {addToTimeline && (
          <XPGroupBox label="Timeline Entry" style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 8 }}>
              <label style={xpLabel}>Title</label>
              <input type="text" value={timelineTitle} onChange={e => setTimelineTitle(e.target.value)}
                placeholder="Defaults to the service summary" className="xp-input" style={xpInput} />
            </div>
            <div>
              <label style={xpLabel}>Story</label>
              <textarea value={timelineStory} onChange={e => setTimelineStory(e.target.value)}
                placeholder="The story behind this service…"
                className="xp-input" style={{ ...xpInput, resize: 'none', lineHeight: 1.5, padding: '5px', height: 56 }} />
            </div>
          </XPGroupBox>
        )}

      </div>

      {/* ── Footer button bar ── */}
      <div style={{
        flexShrink: 0, background: XP_BG,
        borderTop: `2px solid ${XP_BORDER}`,
        padding: '8px 12px',
        display: 'flex', justifyContent: 'flex-end', gap: 6,
      }}>
        <button onClick={() => navigate('/maintenance/service')} className="xp-btn" style={xpBtn}>
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving} className="xp-btn"
          style={{ ...xpBtn, fontWeight: 700, opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Save Record'}
        </button>
      </div>
    </div>
  )
}
