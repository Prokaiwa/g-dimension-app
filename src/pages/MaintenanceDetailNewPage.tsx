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

// Light design tokens for the detailing aesthetic
const BG       = '#f8f7f4'
const INK      = '#1a1a1a'
const INK_DIM  = 'rgba(0,0,0,0.42)'
const RULE     = 'rgba(0,0,0,0.10)'

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

export default function MaintenanceDetailNewPage() {
  const navigate = useNavigate()
  const [carId, setCarId] = useState<string | null>(null)
  const [date, setDate] = useState(TODAY)
  const [mileage, setMileage] = useState('')
  const [performedBy, setPerformedBy] = useState<'self' | 'shop'>('self')
  const [shopName, setShopName] = useState('')
  const [timeTaken, setTimeTaken] = useState('')
  const [totalCost, setTotalCost] = useState('')
  const [notes, setNotes] = useState('')
  const [addToTimeline, setAddToTimeline] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getActiveCarId().then(id => { if (id) setCarId(id) })
  }, [])

  async function handleSave() {
    if (saving || !carId) return
    setSaving(true)

    const { data: session, error } = await supabase.from('sessions').insert({
      car_id: carId,
      type: 'detail',
      date_performed: date,
      performed_by: performedBy,
      shop_name: performedBy === 'shop' && shopName.trim() ? shopName.trim() : null,
      mileage: mileage ? parseInt(mileage, 10) : null,
      time_taken: timeTaken.trim() || null,
      total_cost: totalCost ? parseFloat(totalCost) : null,
      notes: notes.trim() || null,
      add_to_timeline: addToTimeline,
    }).select('id').single()

    if (error || !session) { setSaving(false); return }
    navigate('/maintenance/detail')
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: BG, fontFamily: FONT_UI, overflow: 'hidden' }}>
      <style>{`
        input[type=date]::-webkit-calendar-picker-indicator { opacity: 0.35; cursor: pointer; }
        .dtl-input:focus { border-bottom-color: ${COLOR_TIMELINE_SERVICE} !important; outline: none; }
        input[type="number"] { -moz-appearance: textfield; }
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        textarea.dtl-input:focus { border-color: rgba(212,184,106,0.45) !important; outline: none; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ height: HEADER_HEIGHT, flexShrink: 0, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 10, paddingRight: 14, borderBottom: '1px solid rgba(255,255,255,0.04)', position: 'relative', zIndex: 10 }}>
        <button onClick={() => navigate('/maintenance/detail')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px 4px 4px', WebkitTapHighlightColor: 'transparent' }}>
          <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
          <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 13, color: COLOR_HEADER_TITLE, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Detailing</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          <div style={{ background: 'rgba(242,238,228,0.94)', color: '#0d0d0d', padding: '4px 7px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>{MONTH_LABEL}</div>
          <div style={{ background: COLOR_TIMELINE_SERVICE, color: '#0d0d0d', padding: '4px 8px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: DAY_LABEL.length === 1 ? 24 : 30 }}>{DAY_LABEL}</div>
        </div>
      </div>

      {/* ── Form ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        <div style={{ padding: '18px 20px 14px', borderBottom: `1px solid ${RULE}` }}>
          <div style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: INK_DIM }}>Detail Session</div>
        </div>

        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${RULE}` }}>
          <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <div style={fieldLabel}>Date</div>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="dtl-input" style={{ ...fieldInput, colorScheme: 'light' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={fieldLabel}>Mileage</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <input type="number" value={mileage} onChange={e => setMileage(e.target.value)} placeholder="—" className="dtl-input" style={{ ...fieldInput, flex: 1 }} />
                <span style={{ fontFamily: FONT_UI, fontSize: 11, color: INK_DIM }}>mi</span>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={fieldLabel}>Performed By</div>
            <div style={{ display: 'flex', gap: 0, marginTop: 6 }}>
              {(['self', 'shop'] as const).map(v => (
                <button key={v} onClick={() => setPerformedBy(v)} style={{
                  flex: 1, padding: '8px 0',
                  background: performedBy === v ? COLOR_TIMELINE_SERVICE : 'rgba(0,0,0,0.05)',
                  border: `1px solid ${performedBy === v ? COLOR_TIMELINE_SERVICE : RULE}`,
                  color: performedBy === v ? '#0d0d0d' : INK_DIM,
                  fontFamily: FONT_UI, fontWeight: 700, fontSize: 11,
                  letterSpacing: '0.10em', textTransform: 'uppercase',
                  cursor: 'pointer', borderRadius: 0,
                  WebkitTapHighlightColor: 'transparent',
                }}>{v === 'self' ? 'Self' : 'Shop'}</button>
              ))}
            </div>
          </div>

          {performedBy === 'shop' && (
            <div style={{ marginBottom: 20 }}>
              <div style={fieldLabel}>Shop Name</div>
              <input type="text" value={shopName} onChange={e => setShopName(e.target.value)} placeholder="—" className="dtl-input" style={fieldInput} />
            </div>
          )}

          <div style={{ display: 'flex', gap: 20 }}>
            <div style={{ flex: 1 }}>
              <div style={fieldLabel}>Time Taken</div>
              <input type="text" value={timeTaken} onChange={e => setTimeTaken(e.target.value)} placeholder="e.g. 3 hours, full day" className="dtl-input" style={fieldInput} />
            </div>
            <div style={{ width: 100 }}>
              <div style={fieldLabel}>Total Cost</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                <span style={{ fontFamily: FONT_UI, fontSize: 13, fontWeight: 600, color: INK_DIM }}>$</span>
                <input type="number" value={totalCost} onChange={e => setTotalCost(e.target.value)} placeholder="0.00" min="0" step="0.01" className="dtl-input" style={fieldInput} />
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${RULE}` }}>
          <div style={fieldLabel}>Notes</div>
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Products used, condition notes…"
            rows={3}
            className="dtl-input"
            style={{ ...fieldInput, resize: 'none', lineHeight: 1.6, border: `1px solid ${RULE}`, padding: '8px 10px' } as React.CSSProperties}
          />
        </div>

        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${RULE}` }}>
          <button onClick={() => setAddToTimeline(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 0, WebkitTapHighlightColor: 'transparent' }}>
            <div style={{ width: 18, height: 18, flexShrink: 0, border: `1.5px solid ${addToTimeline ? COLOR_TIMELINE_SERVICE : RULE}`, background: addToTimeline ? COLOR_TIMELINE_SERVICE : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {addToTimeline && <span style={{ color: '#0d0d0d', fontSize: 12, lineHeight: 1, fontWeight: 700 }}>✓</span>}
            </div>
            <div>
              <div style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: addToTimeline ? '#a07828' : INK_DIM }}>Add to Timeline</div>
              <div style={{ fontFamily: FONT_UI, fontSize: 11, color: INK_DIM, marginTop: 2 }}>Detail sessions are proud moments — default on</div>
            </div>
          </button>
        </div>

        <div style={{ padding: '24px 20px 48px' }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: '100%', padding: '14px 0',
              background: saving ? 'rgba(212,184,106,0.35)' : COLOR_TIMELINE_SERVICE,
              border: 'none', borderRadius: 0,
              color: saving ? 'rgba(0,0,0,0.35)' : '#0a0a0a',
              fontFamily: FONT_UI, fontWeight: 800, fontSize: 12,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              cursor: saving ? 'default' : 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {saving ? 'Saving…' : 'Log Detail Session'}
          </button>
        </div>
      </div>
    </div>
  )
}
