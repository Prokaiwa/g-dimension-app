// Route: /tuning/add — Add Modification
import { useState }                    from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase }                     from '../lib/supabase'
import { TUNING_CATEGORIES }            from './TuningBuildSheetPage'
import { FONT_UI, EASING_SETTLE }       from '../tokens'

const LABEL: React.CSSProperties = {
  display: 'block',
  fontFamily: FONT_UI, fontWeight: 700, fontSize: 10,
  letterSpacing: '0.14em', textTransform: 'uppercase',
  color: 'rgba(245,240,228,0.35)',
  marginBottom: 7,
}

const INPUT: React.CSSProperties = {
  display: 'block', width: '100%', boxSizing: 'border-box',
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid rgba(245,240,228,0.12)',
  padding: '9px 0',
  fontFamily: FONT_UI, fontWeight: 600, fontSize: 15,
  color: 'rgba(245,240,228,0.9)',
  outline: 'none',
  WebkitAppearance: 'none' as const,
}

// Per-tile depth: colored shadow outside the black box
// Burgundy bleeds left, blue bleeds down — lifts the tile off the background
const TILE_SHADOW = '-5px 0 7px -1px rgba(105,12,22,0.65), 0 5px 7px -1px rgba(18,55,190,0.5)'

export default function TuningAddPage() {
  const navigate        = useNavigate()
  const [searchParams]  = useSearchParams()
  const preCategory     = searchParams.get('category')

  const [step, setStep]         = useState<'category' | 'form'>(preCategory ? 'form' : 'category')
  const [category, setCategory] = useState<string | null>(preCategory)
  const [form, setForm]         = useState({ title: '', brand: '', dateInstalled: '', notes: '' })
  const [saving, setSaving]     = useState(false)
  const [saveErr, setSaveErr]   = useState<string | null>(null)
  const [pressed, setPressed]   = useState<string | null>(null)

  const press   = (id: string) => setPressed(id)
  const release = () => setPressed(null)

  const selectedCat = TUNING_CATEGORIES.find(c => c.id === category)

  const handleSubmit = async () => {
    if (!form.title.trim() || !category) return
    setSaving(true)
    const carId = localStorage.getItem('gdim_chosen_car_id')
    if (!carId) { setSaving(false); return }
    const { error } = await supabase.from('jobs').insert({
      car_id:         carId,
      type:           'modification',
      category,
      title:          form.title.trim(),
      brand:          form.brand.trim() || null,
      date_installed: form.dateInstalled || null,
      notes:          form.notes.trim()  || null,
      status:         'installed',
    })
    setSaving(false)
    if (error) { setSaveErr(error.message); return }
    navigate('/tuning/build-sheet')
  }

  // ── Step 1: Category picker ──────────────────────────────────────────
  if (step === 'category') {
    return (
      <div style={{ height: '100dvh', background: '#000', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <style>{`
          @keyframes tileIn {
            from { opacity: 0; transform: translateY(6px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>

        {/* Cancel */}
        <button onClick={() => navigate(-1)} style={{
          flexShrink: 0, height: 52, padding: '0 20px',
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent', alignSelf: 'flex-start',
        }}>
          <span style={{ color: 'rgba(245,240,228,0.5)', fontSize: 20, fontWeight: 300 }}>‹</span>
          <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.4)' }}>Cancel</span>
        </button>

        {/* 3×5 grid — fills remaining height, no scroll */}
        <div style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridTemplateRows: 'repeat(5, 1fr)',
          gap: 8,
          padding: '4px 16px 20px',
        }}>
          {TUNING_CATEGORIES.map((cat, i) => (
            <button
              key={cat.id}
              onClick={() => { setCategory(cat.id); setStep('form') }}
              onPointerDown={() => press(cat.id)} onPointerUp={release} onPointerLeave={release} onPointerCancel={release}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '4px 4px 4px 8px', // extra left + bottom room for shadow
                animation: `tileIn 320ms ${EASING_SETTLE} ${i * 28}ms both`,
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation', userSelect: 'none',
              }}
            >
              {/* Black box — shadow bleeds outside, lifting tile off background */}
              <div style={{
                width: '100%', height: '100%',
                background: '#0a0a0c',
                boxShadow: TILE_SHADOW,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 6,
                transform: pressed === cat.id ? 'scale(0.93)' : 'scale(1)',
                transition: pressed === cat.id ? 'transform 80ms ease-out' : 'transform 200ms cubic-bezier(0.22,1,0.36,1)',
              }}>
                <img src={cat.icon} alt={cat.label} draggable={false}
                  style={{ width: 74, height: 74, objectFit: 'contain', pointerEvents: 'none',
                    mixBlendMode: cat.id === 'Brakes' ? 'multiply' : undefined }} />
                <span style={{
                  fontFamily: FONT_UI, fontWeight: 700, fontSize: 9,
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  color: 'rgba(245,240,228,0.55)',
                }}>
                  {cat.label}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Step 2: Form ─────────────────────────────────────────────────────
  const canSubmit = form.title.trim().length > 0 && !saving

  return (
    <div style={{ height: '100dvh', position: 'relative', overflow: 'hidden', background: '#000' }}>

      {/* Back / category breadcrumb */}
      <button
        onClick={() => preCategory ? navigate(-1) : setStep('category')}
        style={{
          position: 'absolute', top: 0, left: 0, height: 52, padding: '0 20px',
          display: 'flex', alignItems: 'center', gap: 7,
          background: 'none', border: 'none', cursor: 'pointer', zIndex: 10,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span style={{ color: 'rgba(245,240,228,0.5)', fontSize: 20, fontWeight: 300 }}>‹</span>
        {selectedCat && (
          <img src={selectedCat.icon} alt="" style={{ width: 16, height: 16, objectFit: 'contain', opacity: 0.55, pointerEvents: 'none' }} />
        )}
        <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.45)' }}>
          {selectedCat?.label ?? 'Back'}
        </span>
      </button>

      {/* Scrollable form */}
      <div style={{ position: 'relative', zIndex: 1, height: '100%', overflowY: 'auto', paddingTop: 60, paddingBottom: 48 }}>

        {/* Part Name */}
        <div style={{ padding: '12px 22px 0' }}>
          <label style={LABEL}>Part Name *</label>
          <input
            autoFocus
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Cold Air Intake, Coilovers…"
            style={{ ...INPUT, caretColor: '#39ff14' }}
          />
        </div>

        {/* Brand */}
        <div style={{ padding: '20px 22px 0' }}>
          <label style={LABEL}>Brand</label>
          <input
            value={form.brand}
            onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
            placeholder="e.g. HKS, Tein, Enkei…"
            style={{ ...INPUT, caretColor: '#39ff14' }}
          />
        </div>

        {/* Category — display only */}
        <div style={{ padding: '20px 22px 0' }}>
          <label style={LABEL}>Category</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderBottom: '1px solid rgba(245,240,228,0.12)' }}>
            {selectedCat && <img src={selectedCat.icon} alt="" style={{ width: 18, height: 18, objectFit: 'contain', opacity: 0.6, pointerEvents: 'none' }} />}
            <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 15, color: 'rgba(245,240,228,0.6)' }}>
              {selectedCat?.label ?? '—'}
            </span>
          </div>
        </div>

        {/* Date Installed */}
        <div style={{ padding: '20px 22px 0' }}>
          <label style={LABEL}>Date Installed</label>
          <input
            type="date"
            value={form.dateInstalled}
            onChange={e => setForm(f => ({ ...f, dateInstalled: e.target.value }))}
            style={{ ...INPUT, colorScheme: 'dark', caretColor: '#39ff14' }}
          />
        </div>

        {/* Notes */}
        <div style={{ padding: '20px 22px 0' }}>
          <label style={LABEL}>Notes</label>
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Install notes, specs, torque specs…"
            rows={3}
            style={{ ...INPUT, resize: 'none', lineHeight: 1.55, caretColor: '#39ff14' } as React.CSSProperties}
          />
        </div>

        {/* DIY Steps stub */}
        <div style={{ padding: '24px 22px 0' }}>
          <button
            onClick={() => {/* future phase */}}
            style={{
              width: '100%', padding: '12px 0',
              background: 'transparent',
              border: '1px solid rgba(18,55,190,0.35)',
              borderRadius: 4, cursor: 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(60,100,220,0.6)' }}>
              + Add DIY Steps
            </span>
            <span style={{ fontFamily: FONT_UI, fontWeight: 400, fontSize: 9, color: 'rgba(60,100,220,0.38)', letterSpacing: '0.04em' }}>
              — coming soon
            </span>
          </button>
        </div>

        {/* Submit */}
        <div style={{ padding: '20px 22px 0' }}>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            onPointerDown={() => canSubmit && press('submit')} onPointerUp={release} onPointerLeave={release} onPointerCancel={release}
            style={{
              width: '100%', padding: '14px 0',
              background: canSubmit ? 'rgba(105,12,22,0.2)' : 'transparent',
              border: `1.5px solid ${canSubmit ? 'rgba(105,12,22,0.8)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 4,
              fontFamily: FONT_UI, fontWeight: 800, fontSize: 12,
              letterSpacing: '0.16em', textTransform: 'uppercase',
              color: canSubmit ? '#c0303a' : 'rgba(245,240,228,0.2)',
              cursor: canSubmit ? 'pointer' : 'default',
              transition: 'all 200ms ease',
              transform: pressed === 'submit' ? 'scale(0.97)' : 'scale(1)',
              boxShadow: canSubmit ? '0 0 14px rgba(105,12,22,0.3)' : 'none',
            }}
          >
            {saving ? 'Saving…' : 'Add to Build Sheet'}
          </button>
          {saveErr && (
            <p style={{ fontFamily: FONT_UI, fontSize: 12, color: '#e05555', marginTop: 10, lineHeight: 1.5 }}>
              {saveErr}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
