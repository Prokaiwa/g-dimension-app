import { useState, useEffect } from 'react'
import imageCompression from 'browser-image-compression'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { asMileageUnit, milesToUnit, unitToMiles, type MileageUnit } from '../lib/mileage'
import carwashIcon from '../assets/icons/maintenance/carwash_icon.webp'
import {
  COLOR_HEADER_BLACK, COLOR_HEADER_WARM, COLOR_HEADER_TITLE,
  COLOR_BURGUNDY_L, COLOR_TIMELINE_DETAIL,
  COLOR_DETAIL_BG, COLOR_DETAIL_INK, COLOR_DETAIL_INK_DIM, COLOR_DETAIL_RULE,
  FONT_UI, HEADER_HEIGHT,
} from '../tokens'

const MONTHS  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const BLUE    = COLOR_TIMELINE_DETAIL  // '#8ab0c8' — muted cool blue, designed for detailing
const BG      = COLOR_DETAIL_BG
const INK     = COLOR_DETAIL_INK
const INK_DIM = COLOR_DETAIL_INK_DIM
const RULE    = COLOR_DETAIL_RULE

const EXTERIOR_PRESETS = [
  'Hand Wash', 'Clay Bar', 'Paint Polish', 'Wax / Sealant',
  'Ceramic Coating', 'Wheel Cleaning', 'Tire Dressing',
  'Glass Treatment', 'Trim Restoration', 'Bug & Tar Removal',
]

const INTERIOR_PRESETS = [
  'Vacuum', 'Wipe Down', 'Leather Conditioning', 'Carpet Shampoo',
  'Fabric Protection', 'Odor Elimination', 'Dashboard Dressing', 'Window Cleaning',
]

const fieldLabel: React.CSSProperties = {
  fontFamily: FONT_UI, fontWeight: 700, fontSize: 10,
  letterSpacing: '0.14em', textTransform: 'uppercase',
  color: INK_DIM, marginBottom: 5,
}

const fieldInput: React.CSSProperties = {
  background: 'transparent', border: 'none',
  borderBottom: `1px solid ${RULE}`,
  color: INK, fontFamily: FONT_UI,
  fontWeight: 600, fontSize: 15,
  padding: '6px 0', outline: 'none', width: '100%',
}

type ExistingReceipt = { id: string; file_url: string; file_type: 'image' | 'pdf'; file_name: string | null; url: string | null }

function ChipSection({
  label, presets, selected, onToggle,
  customInput, setCustomInput, showInput, setShowInput, onAddCustom,
}: {
  label: string
  presets: string[]
  selected: string[]
  onToggle: (item: string) => void
  customInput: string
  setCustomInput: (v: string) => void
  showInput: boolean
  setShowInput: (v: boolean) => void
  onAddCustom: () => void
}) {
  const customItems = selected.filter(s => !presets.includes(s))
  return (
    <div style={{ padding: '18px 20px', borderBottom: `1px solid ${RULE}` }}>
      <div style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 10, letterSpacing: '0.20em', textTransform: 'uppercase', color: BLUE, marginBottom: 12 }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
        {presets.map(p => {
          const active = selected.includes(p)
          return (
            <button
              key={p}
              onClick={() => onToggle(p)}
              style={{
                padding: '6px 12px', borderRadius: 6,
                border: `1.5px solid ${active ? BLUE : 'rgba(0,0,0,0.14)'}`,
                background: active ? 'rgba(138,176,200,0.14)' : 'rgba(0,0,0,0.03)',
                color: active ? INK : INK_DIM,
                fontFamily: FONT_UI, fontWeight: active ? 700 : 500, fontSize: 12,
                cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                transition: 'background 120ms ease, border-color 120ms ease',
              }}
            >
              {p}
            </button>
          )
        })}
        {customItems.map(custom => (
          <button
            key={custom}
            onClick={() => onToggle(custom)}
            style={{
              padding: '6px 12px', borderRadius: 6,
              border: `1.5px solid ${BLUE}`,
              background: 'rgba(138,176,200,0.14)',
              color: INK, fontFamily: FONT_UI, fontWeight: 700, fontSize: 12,
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {custom}
            <span style={{ fontSize: 11, opacity: 0.5, lineHeight: 1 }}>×</span>
          </button>
        ))}
        {!showInput && (
          <button
            onClick={() => setShowInput(true)}
            style={{
              padding: '6px 12px', borderRadius: 6,
              border: '1.5px dashed rgba(0,0,0,0.18)',
              background: 'transparent', color: INK_DIM,
              fontFamily: FONT_UI, fontWeight: 500, fontSize: 12,
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
          >
            + Other
          </button>
        )}
      </div>
      {showInput && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
          <input
            autoFocus
            type="text"
            value={customInput}
            onChange={e => setCustomInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onAddCustom() }}
            placeholder="Custom service…"
            style={{ ...fieldInput, flex: 1, fontSize: 13 }}
          />
          <button onClick={onAddCustom} style={{ padding: '5px 14px', background: BLUE, border: 'none', borderRadius: 9999, color: '#fff', fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', flexShrink: 0 }}>
            Add
          </button>
          <button onClick={() => { setShowInput(false); setCustomInput('') }} style={{ padding: '5px 8px', background: 'none', border: 'none', color: INK_DIM, fontFamily: FONT_UI, fontSize: 12, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', flexShrink: 0 }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

export default function MaintenanceDetailEditPage() {
  const navigate = useNavigate()
  const { sessionId } = useParams<{ sessionId: string }>()
  const detailRoute = `/maintenance/${sessionId}`

  const [carId, setCarId]             = useState<string | null>(null)
  const [date, setDate]               = useState('')
  const [mileage, setMileage]         = useState('')
  const [mileageUnit, setMileageUnit] = useState<MileageUnit>('mi')
  const [performedBy, setPerformedBy] = useState<'self' | 'shop'>('self')
  const [shopName, setShopName]       = useState('')
  const [timeTaken, setTimeTaken]     = useState('')
  const [totalCost, setTotalCost]     = useState('')
  const [notes, setNotes]             = useState('')
  const [addToTimeline, setAddToTimeline] = useState(false)
  const [timelineTitle, setTimelineTitle] = useState('')
  const [timelineStory, setTimelineStory] = useState('')
  const [existingReceipts, setExistingReceipts] = useState<ExistingReceipt[]>([])
  const [removedReceipts, setRemovedReceipts]   = useState<{ id: string; file_url: string }[]>([])
  const [pendingReceipts, setPendingReceipts] = useState<{ file: File; preview: string | null; name: string }[]>([])
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)

  const [exteriorSel, setExteriorSel]     = useState<string[]>([])
  const [exteriorInput, setExteriorInput] = useState('')
  const [showExtInput, setShowExtInput]   = useState(false)

  const [interiorSel, setInteriorSel]     = useState<string[]>([])
  const [interiorInput, setInteriorInput] = useState('')
  const [showIntInput, setShowIntInput]   = useState(false)

  // Load the existing record
  useEffect(() => {
    if (!sessionId) return
    Promise.all([
      supabase.from('sessions')
        .select('car_id,date_performed,performed_by,shop_name,mileage,total_cost,time_taken,notes,add_to_timeline,timeline_title,journal_entry')
        .eq('id', sessionId).single(),
      supabase.from('jobs')
        .select('category,title')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true }),
      supabase.from('receipts')
        .select('id,file_url,file_type,file_name')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true }),
    ]).then(async ([{ data: s }, { data: j }, { data: r }]) => {
      if (s) {
        const sess = s as {
          car_id: string | null; date_performed: string; performed_by: 'self' | 'shop' | null
          shop_name: string | null; mileage: number | null; total_cost: number | null
          time_taken: string | null; notes: string | null; add_to_timeline: boolean
          timeline_title: string | null; journal_entry: string | null
        }
        setCarId(sess.car_id)
        setDate(sess.date_performed)
        setPerformedBy(sess.performed_by === 'shop' ? 'shop' : 'self')
        setShopName(sess.shop_name ?? '')
        if (sess.car_id) {
          const { data: carRow } = await supabase.from('cars').select('mileage_unit').eq('id', sess.car_id).single()
          const unit = asMileageUnit((carRow as { mileage_unit: string | null } | null)?.mileage_unit)
          setMileageUnit(unit)
          setMileage(sess.mileage != null ? String(milesToUnit(sess.mileage, unit)) : '')
        } else {
          setMileage(sess.mileage != null ? String(sess.mileage) : '')
        }
        setTotalCost(sess.total_cost != null ? String(sess.total_cost) : '')
        setTimeTaken(sess.time_taken ?? '')
        setNotes(sess.notes ?? '')
        setAddToTimeline(!!sess.add_to_timeline)
        setTimelineTitle(sess.timeline_title ?? '')
        setTimelineStory(sess.journal_entry ?? '')
      }
      if (j) {
        const rows = j as { category: string | null; title: string }[]
        setExteriorSel(rows.filter(row => row.category === 'Exterior').map(row => row.title))
        setInteriorSel(rows.filter(row => row.category === 'Interior').map(row => row.title))
      }
      if (r) {
        const rows = r as { id: string; file_url: string; file_type: 'image' | 'pdf'; file_name: string | null }[]
        const withUrls = await Promise.all(rows.map(async row => {
          const { data } = await supabase.storage.from('receipts').createSignedUrl(row.file_url, 300)
          return { ...row, url: data?.signedUrl ?? null }
        }))
        setExistingReceipts(withUrls)
      }
      setLoading(false)
    })
  }, [sessionId])

  const toggleExt = (item: string) =>
    setExteriorSel(prev => prev.includes(item) ? prev.filter(x => x !== item) : [...prev, item])

  const toggleInt = (item: string) =>
    setInteriorSel(prev => prev.includes(item) ? prev.filter(x => x !== item) : [...prev, item])

  const addExtCustom = () => {
    const val = exteriorInput.trim()
    if (val) setExteriorSel(prev => [...prev, val])
    setExteriorInput(''); setShowExtInput(false)
  }

  const addIntCustom = () => {
    const val = interiorInput.trim()
    if (val) setInteriorSel(prev => [...prev, val])
    setInteriorInput(''); setShowIntInput(false)
  }

  function removeExisting(id: string) {
    setExistingReceipts(prev => {
      const target = prev.find(r => r.id === id)
      if (target) setRemovedReceipts(rem => [...rem, { id: target.id, file_url: target.file_url }])
      return prev.filter(r => r.id !== id)
    })
  }

  async function handleSave() {
    if (saving || !sessionId || !carId) return
    setSaving(true)

    const { error } = await supabase.from('sessions').update({
      date_performed: date, performed_by: performedBy,
      shop_name: performedBy === 'shop' && shopName.trim() ? shopName.trim() : null,
      mileage: mileage ? unitToMiles(parseInt(mileage, 10), mileageUnit) : null,
      time_taken: timeTaken.trim() || null,
      total_cost: totalCost ? parseFloat(totalCost) : null,
      notes: notes.trim() || null, add_to_timeline: addToTimeline,
      timeline_title: timelineTitle.trim() || null,
      journal_entry: timelineStory.trim() || null,
    }).eq('id', sessionId)
    if (error) { console.error('Session update error:', error); setSaving(false); return }

    // Replace line items: delete existing, re-insert from chips
    await supabase.from('jobs').delete().eq('session_id', sessionId)
    const jobRows = [
      ...exteriorSel.map(title => ({ session_id: sessionId, car_id: carId, type: 'maintenance', category: 'Exterior', title, status: 'installed' })),
      ...interiorSel.map(title => ({ session_id: sessionId, car_id: carId, type: 'maintenance', category: 'Interior', title, status: 'installed' })),
    ]
    if (jobRows.length > 0) {
      const { error: jobsError } = await supabase.from('jobs').insert(jobRows)
      if (jobsError) { console.error('Jobs insert error:', jobsError); setSaving(false); return }
    }

    // Remove receipts the user deleted
    if (removedReceipts.length > 0) {
      const paths = removedReceipts.map(r => r.file_url)
      await supabase.storage.from('receipts').remove(paths)
      await supabase.from('receipts').delete().in('id', removedReceipts.map(r => r.id))
    }

    // Upload any newly attached receipts
    if (pendingReceipts.length > 0) {
      const { data: authData } = await supabase.auth.getUser()
      const userId = authData?.user?.id
      if (userId) {
        await Promise.all(pendingReceipts.map(async r => {
          const isImg = r.file.type.startsWith('image/')
          const ext   = isImg ? 'jpg' : 'pdf'
          const path  = `${userId}/${carId}/${sessionId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
          let upload: File | Blob = r.file
          if (isImg) {
            try { upload = await imageCompression(r.file, { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true, fileType: 'image/jpeg' }) } catch { /* use original */ }
          }
          const { error: upErr } = await supabase.storage.from('receipts').upload(path, upload)
          if (upErr) return
          await supabase.from('receipts').insert({ session_id: sessionId, file_url: path, file_type: isImg ? 'image' : 'pdf', file_name: r.name })
        }))
      }
    }

    navigate(detailRoute)
  }

  const monthLabel = date ? MONTHS[parseInt(date.slice(5, 7), 10) - 1] : ''
  const dayLabel   = date ? String(parseInt(date.slice(8, 10), 10)) : ''

  if (loading) return (
    <div style={{ height: '100dvh', background: BG, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK }} />
    </div>
  )

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: BG, fontFamily: FONT_UI, overflow: 'hidden' }}>
      <style>{`
        input[type=date]::-webkit-calendar-picker-indicator { opacity: 0.30; cursor: pointer; }
        .cw-input:focus { border-bottom-color: ${BLUE} !important; outline: none; }
        input[type="number"] { -moz-appearance: textfield; }
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        textarea.cw-input:focus { border-color: rgba(138,176,200,0.55) !important; outline: none; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ height: HEADER_HEIGHT, flexShrink: 0, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 10, paddingRight: 14, borderBottom: '1px solid rgba(255,255,255,0.04)', position: 'relative', zIndex: 10 }}>
        <button onClick={() => navigate(detailRoute)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px 4px 4px', WebkitTapHighlightColor: 'transparent' }}>
          <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
          <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 13, color: COLOR_HEADER_TITLE, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Detailing</span>
        </button>
        {date && (
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
            <div style={{ background: 'rgba(242,238,228,0.94)', color: '#0d0d0d', padding: '4px 7px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>{monthLabel}</div>
            <div style={{ background: COLOR_BURGUNDY_L, color: '#fff', padding: '4px 8px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: dayLabel.length === 1 ? 24 : 30 }}>{dayLabel}</div>
          </div>
        )}
      </div>

      {/* ── Scroll body ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 20px', borderBottom: `1px solid ${RULE}` }}>
          <img src={carwashIcon} alt="" aria-hidden draggable={false} style={{ width: 92, height: 92, objectFit: 'contain', flexShrink: 0 }} />
          <div style={{ fontFamily: FONT_UI, fontStyle: 'italic', fontWeight: 800, fontSize: 42, color: BLUE, lineHeight: 1, letterSpacing: '-0.02em' }}>
            Car Wash
          </div>
        </div>

        {/* Date + Mileage */}
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${RULE}` }}>
          <div style={{ display: 'flex', gap: 20 }}>
            <div style={{ flex: 1 }}>
              <div style={fieldLabel}>Date</div>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="cw-input" style={{ ...fieldInput, colorScheme: 'light' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={fieldLabel}>Mileage</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <input type="number" value={mileage} onChange={e => setMileage(e.target.value)} placeholder="—" className="cw-input" style={{ ...fieldInput, flex: 1 }} />
                <span style={{ fontFamily: FONT_UI, fontSize: 11, color: INK_DIM }}>{mileageUnit}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Performed By */}
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${RULE}` }}>
          <div style={fieldLabel}>Performed By</div>
          <div style={{ display: 'flex', gap: 0, marginTop: 6 }}>
            {(['self', 'shop'] as const).map(v => (
              <button key={v} onClick={() => setPerformedBy(v)} style={{
                flex: 1, padding: '8px 0',
                background: performedBy === v ? BLUE : 'rgba(0,0,0,0.04)',
                border: `1px solid ${performedBy === v ? BLUE : RULE}`,
                color: performedBy === v ? '#fff' : INK_DIM,
                fontFamily: FONT_UI, fontWeight: 700, fontSize: 11,
                letterSpacing: '0.10em', textTransform: 'uppercase',
                cursor: 'pointer', borderRadius: 0, WebkitTapHighlightColor: 'transparent',
              }}>
                {v === 'self' ? 'Self' : 'Shop'}
              </button>
            ))}
          </div>
          {performedBy === 'shop' && (
            <div style={{ marginTop: 16 }}>
              <div style={fieldLabel}>Shop Name</div>
              <input type="text" value={shopName} onChange={e => setShopName(e.target.value)} placeholder="—" className="cw-input" style={fieldInput} />
            </div>
          )}
        </div>

        {/* Exterior Services */}
        <ChipSection
          label="Exterior"
          presets={EXTERIOR_PRESETS}
          selected={exteriorSel}
          onToggle={toggleExt}
          customInput={exteriorInput}
          setCustomInput={setExteriorInput}
          showInput={showExtInput}
          setShowInput={setShowExtInput}
          onAddCustom={addExtCustom}
        />

        {/* Interior Services */}
        <ChipSection
          label="Interior"
          presets={INTERIOR_PRESETS}
          selected={interiorSel}
          onToggle={toggleInt}
          customInput={interiorInput}
          setCustomInput={setInteriorInput}
          showInput={showIntInput}
          setShowInput={setShowIntInput}
          onAddCustom={addIntCustom}
        />

        {/* Time Taken + Total Cost */}
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${RULE}` }}>
          <div style={{ display: 'flex', gap: 20 }}>
            <div style={{ flex: 1 }}>
              <div style={fieldLabel}>Time Taken</div>
              <input type="text" value={timeTaken} onChange={e => setTimeTaken(e.target.value)} placeholder="e.g. 3 hours, full day" className="cw-input" style={fieldInput} />
            </div>
            <div style={{ width: 100 }}>
              <div style={fieldLabel}>Total Cost</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                <span style={{ fontFamily: FONT_UI, fontSize: 13, fontWeight: 600, color: INK_DIM }}>$</span>
                <input type="number" value={totalCost} onChange={e => setTotalCost(e.target.value)} placeholder="0.00" min="0" step="0.01" className="cw-input" style={fieldInput} />
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${RULE}` }}>
          <div style={fieldLabel}>Notes</div>
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Products used, condition notes…"
            rows={3}
            className="cw-input"
            style={{ ...fieldInput, resize: 'none', lineHeight: 1.6, border: `1px solid ${RULE}`, padding: '8px 10px' } as React.CSSProperties}
          />
        </div>

        {/* Receipts */}
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${RULE}` }}>
          <div style={fieldLabel}>Attach Receipt</div>
          {(existingReceipts.length > 0 || pendingReceipts.length > 0) && (
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8, marginBottom: 10 }}>
              {existingReceipts.map(r => (
                <div key={r.id} style={{ position: 'relative', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 3 }}>
                  {r.file_type === 'image' && r.url
                    ? <img src={r.url} style={{ width: 56, height: 56, objectFit: 'cover', border: `1px solid ${RULE}` }} />
                    : <div style={{ width: 56, height: 56, background: 'rgba(0,0,0,0.04)', border: `1px solid ${RULE}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontFamily: FONT_UI, fontSize: 10, fontWeight: 700, color: INK_DIM }}>PDF</span></div>
                  }
                  <span style={{ fontFamily: FONT_UI, fontSize: 9, color: INK_DIM, maxWidth: 56, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{r.file_name || 'Receipt'}</span>
                  <button onClick={() => removeExisting(r.id)}
                    style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: INK, border: 'none', color: '#fff', fontSize: 10, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>×</button>
                </div>
              ))}
              {pendingReceipts.map((r, i) => (
                <div key={i} style={{ position: 'relative', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 3 }}>
                  {r.preview
                    ? <img src={r.preview} style={{ width: 56, height: 56, objectFit: 'cover', border: `1px solid ${RULE}` }} />
                    : <div style={{ width: 56, height: 56, background: 'rgba(0,0,0,0.04)', border: `1px solid ${RULE}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontFamily: FONT_UI, fontSize: 10, fontWeight: 700, color: INK_DIM }}>PDF</span></div>
                  }
                  <span style={{ fontFamily: FONT_UI, fontSize: 9, color: INK_DIM, maxWidth: 56, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{r.name}</span>
                  <button onClick={() => setPendingReceipts(prev => prev.filter((_, idx) => idx !== i))}
                    style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: INK, border: 'none', color: '#fff', fontSize: 10, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>×</button>
                </div>
              ))}
            </div>
          )}
          <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type="file" accept="image/*,application/pdf" multiple style={{ display: 'none' }}
              onChange={e => {
                const files = Array.from(e.target.files ?? [])
                setPendingReceipts(prev => [...prev, ...files.map(f => ({ file: f, preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null, name: f.name }))])
                e.target.value = ''
              }} />
            <div style={{ padding: '7px 14px', border: `1.5px dashed ${BLUE}`, background: 'rgba(138,176,200,0.06)', color: BLUE, fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', cursor: 'pointer', borderRadius: 6 }}>
              + Attach Receipt
            </div>
          </label>
          <div style={{ fontFamily: FONT_UI, fontSize: 10, color: INK_DIM, marginTop: 6 }}>Image or PDF • uploads on save</div>
        </div>

        {/* Add to Timeline */}
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${RULE}` }}>
          <button onClick={() => setAddToTimeline(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 0, WebkitTapHighlightColor: 'transparent' }}>
            <div style={{ width: 18, height: 18, flexShrink: 0, border: `1.5px solid ${addToTimeline ? BLUE : 'rgba(0,0,0,0.18)'}`, background: addToTimeline ? BLUE : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {addToTimeline && <span style={{ color: '#fff', fontSize: 12, lineHeight: 1, fontWeight: 700 }}>✓</span>}
            </div>
            <div>
              <div style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: addToTimeline ? INK : INK_DIM }}>Add to Timeline</div>
              <div style={{ fontFamily: FONT_UI, fontSize: 11, color: INK_DIM, marginTop: 2 }}>Log this wash as a chapter in your build story</div>
            </div>
          </button>

          {addToTimeline && (
            <div style={{ marginTop: 16 }}>
              <div style={fieldLabel}>Timeline Title</div>
              <input
                value={timelineTitle} onChange={e => setTimelineTitle(e.target.value)}
                placeholder="Defaults to the detail summary"
                className="cw-input"
                style={{ ...fieldInput, border: `1px solid ${RULE}`, padding: '8px 10px' } as React.CSSProperties}
              />
              <div style={{ ...fieldLabel, marginTop: 14 }}>Story</div>
              <textarea
                value={timelineStory} onChange={e => setTimelineStory(e.target.value)}
                placeholder="The story behind this — how it came out, why it mattered…"
                rows={3}
                className="cw-input"
                style={{ ...fieldInput, resize: 'none', lineHeight: 1.6, fontStyle: 'italic', border: `1px solid ${RULE}`, padding: '8px 10px' } as React.CSSProperties}
              />
            </div>
          )}
        </div>

        {/* Save / Cancel */}
        <div style={{ padding: '24px 20px 48px' }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: '100%', padding: '14px 0',
              background: saving ? 'rgba(138,176,200,0.35)' : BLUE,
              border: 'none', borderRadius: 0,
              color: saving ? 'rgba(0,0,0,0.35)' : '#fff',
              fontFamily: FONT_UI, fontWeight: 800, fontSize: 12,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              cursor: saving ? 'default' : 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button
            onClick={() => navigate(detailRoute)}
            disabled={saving}
            style={{
              width: '100%', marginTop: 12, padding: '10px 0',
              background: 'none', border: `1px solid ${INK_DIM}`, borderRadius: 0,
              color: INK_DIM,
              fontFamily: FONT_UI, fontWeight: 700, fontSize: 11,
              letterSpacing: '0.14em', textTransform: 'uppercase',
              cursor: saving ? 'default' : 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            Cancel
          </button>
        </div>

      </div>
    </div>
  )
}
