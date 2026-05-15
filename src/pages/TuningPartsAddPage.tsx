// Route: /tuning/parts-bin/add — Add a part directly to the parts bin
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import {
  FONT_HANDWRITTEN, FONT_STAMP, FONT_UI,
  COLOR_CARDBOARD_BG, COLOR_CARDBOARD_INK, COLOR_CARDBOARD_INK2, COLOR_CARDBOARD_STAMP,
} from '../tokens'
import { TUNING_CATEGORIES } from './TuningBuildSheetPage'

const NOISE_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`

const CATEGORY_IDS = TUNING_CATEGORIES.map(c => c.id)

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(26,16,8,0.06)',
  border: 'none',
  borderBottom: `1.5px solid rgba(26,16,8,0.25)`,
  padding: '10px 0',
  fontFamily: FONT_HANDWRITTEN,
  fontWeight: 600,
  fontSize: 20,
  color: COLOR_CARDBOARD_INK,
  outline: 'none',
  boxSizing: 'border-box',
}

export default function TuningPartsAddPage() {
  const navigate = useNavigate()

  const [carId,    setCarId]    = useState<string | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  // Form fields
  const [title,     setTitle]     = useState('')
  const [brand,     setBrand]     = useState('')
  const [category,  setCategory]  = useState('')
  const [cost,      setCost]      = useState('')
  const [acquired,  setAcquired]  = useState(() => new Date().toISOString().slice(0, 10))
  const [notes,     setNotes]     = useState('')

  useEffect(() => {
    getActiveCarId().then(id => setCarId(id))
  }, [])

  const handleSave = async () => {
    if (!title.trim()) { setError('Part name is required'); return }
    if (!carId) { setError('No active car selected'); return }

    setSaving(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not signed in'); setSaving(false); return }

    const row: Record<string, unknown> = {
      car_id:        carId,
      user_id:       user.id,
      type:          'modification',
      status:        'purchased',
      still_owned:   true,
      title:         title.trim(),
      brand:         brand.trim() || null,
      category:      category || null,
      parts_cost:    cost ? parseFloat(cost) : null,
      date_installed: acquired || null,
      notes:         notes.trim() || null,
    }

    const { error: err } = await supabase.from('jobs').insert(row)
    if (err) { setError(err.message); setSaving(false); return }

    navigate('/tuning/parts-bin')
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: COLOR_CARDBOARD_BG,
      backgroundImage: [
        `repeating-linear-gradient(0deg, transparent, transparent 14px, rgba(100,60,20,0.07) 14px, rgba(100,60,20,0.07) 15px)`,
        `radial-gradient(ellipse 100% 100% at 50% 50%, transparent 60%, rgba(80,40,10,0.25) 100%)`,
      ].join(', '),
      position: 'relative',
    }}>

      {/* Kraft grain */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1,
        backgroundImage: NOISE_SVG, backgroundSize: '180px 180px',
        opacity: 0.09, mixBlendMode: 'multiply',
      }} />

      <div style={{ position: 'relative', zIndex: 2, paddingBottom: 100 }}>

        {/* Top bar */}
        <div style={{ padding: '16px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={() => navigate('/tuning/parts-bin')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4, WebkitTapHighlightColor: 'transparent' }}
          >
            <span style={{ color: COLOR_CARDBOARD_STAMP, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
            <span style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 600, fontSize: 16, color: COLOR_CARDBOARD_STAMP }}>
              Parts
            </span>
          </button>
        </div>

        {/* Stamp header */}
        <div style={{ padding: '10px 24px 0', textAlign: 'center' }}>
          <p style={{
            fontFamily: FONT_STAMP, fontSize: 32,
            color: COLOR_CARDBOARD_INK, opacity: 0.82,
            margin: 0, transform: 'rotate(-1.5deg)', lineHeight: 1,
          }}>
            Add Part
          </p>
          <div style={{ width: 80, height: 3, background: COLOR_CARDBOARD_INK, opacity: 0.15, margin: '8px auto 0' }} />
        </div>

        {/* Form */}
        <div style={{ padding: '28px 20px 0' }}>

          {/* Part name */}
          <div style={{ marginBottom: 28 }}>
            <label style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 13, color: COLOR_CARDBOARD_INK2, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>
              Part Name *
            </label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Coilover kit"
              style={inputStyle}
              autoFocus
            />
          </div>

          {/* Brand */}
          <div style={{ marginBottom: 28 }}>
            <label style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 13, color: COLOR_CARDBOARD_INK2, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>
              Brand
            </label>
            <input
              value={brand}
              onChange={e => setBrand(e.target.value)}
              placeholder="e.g. KW, Ohlins, BC Racing"
              style={inputStyle}
            />
          </div>

          {/* Category */}
          <div style={{ marginBottom: 28 }}>
            <label style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 13, color: COLOR_CARDBOARD_INK2, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>
              Category
            </label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              style={{
                ...inputStyle,
                appearance: 'none',
                WebkitAppearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%231a1008' strokeWidth='1.5' fill='none' strokeLinecap='round'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 4px center',
                paddingRight: 24,
                cursor: 'pointer',
              }}
            >
              <option value="">Select category…</option>
              {CATEGORY_IDS.map(id => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          </div>

          {/* Cost */}
          <div style={{ marginBottom: 28 }}>
            <label style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 13, color: COLOR_CARDBOARD_INK2, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>
              Cost ($)
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={cost}
              onChange={e => setCost(e.target.value)}
              placeholder="0"
              style={inputStyle}
            />
          </div>

          {/* Date acquired */}
          <div style={{ marginBottom: 28 }}>
            <label style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 13, color: COLOR_CARDBOARD_INK2, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>
              Date Acquired
            </label>
            <input
              type="date"
              value={acquired}
              onChange={e => setAcquired(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 28 }}>
            <label style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 13, color: COLOR_CARDBOARD_INK2, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>
              Notes
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Condition, source, fitment notes…"
              rows={3}
              style={{
                ...inputStyle,
                resize: 'none',
                lineHeight: 1.5,
                padding: '10px 0',
              }}
            />
          </div>

          {error && (
            <p style={{ fontFamily: FONT_UI, fontSize: 13, color: '#b00', marginBottom: 16 }}>{error}</p>
          )}

        </div>
      </div>

      {/* Save FAB */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          position: 'fixed', left: 20, right: 20, bottom: 26, zIndex: 20,
          background: saving ? 'rgba(26,16,8,0.25)' : 'rgba(26,16,8,0.88)',
          border: 'none',
          padding: '16px 0',
          cursor: saving ? 'default' : 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span style={{
          fontFamily: FONT_HANDWRITTEN,
          fontWeight: 700,
          fontSize: 20,
          color: saving ? 'rgba(196,162,106,0.5)' : COLOR_CARDBOARD_BG,
          letterSpacing: '0.02em',
        }}>
          {saving ? 'Saving…' : 'Add to Parts Bin'}
        </span>
      </button>

    </div>
  )
}
