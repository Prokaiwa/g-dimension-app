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

// Black bg + blue from bottom + burgundy from left
function BgGradients() {
  return (
    <>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to top, rgba(18,55,190,0.52) 0%, rgba(18,55,190,0.18) 45%, transparent 72%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to right, rgba(105,12,22,0.62) 0%, rgba(105,12,22,0.22) 42%, transparent 68%)',
        pointerEvents: 'none',
      }} />
    </>
  )
}

export default function TuningAddPage() {
  const navigate        = useNavigate()
  const [searchParams]  = useSearchParams()
  const preCategory     = searchParams.get('category')

  const [step, setStep]         = useState<'category' | 'form'>(preCategory ? 'form' : 'category')
  const [category, setCategory] = useState<string | null>(preCategory)
  const [form, setForm]         = useState({ title: '', brand: '', dateInstalled: '', notes: '' })
  const [saving, setSaving]     = useState(false)
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
    if (!error) navigate('/tuning/build-sheet')
  }

  // ── Step 1: Category picker ──────────────────────────────────────────
  if (step === 'category') {
    return (
      <div style={{ height: '100dvh', position: 'relative', overflow: 'hidden', background: '#000' }}>
        <BgGradients />
        <style>{`
          @keyframes tileIn {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>

        {/* Cancel */}
        <button onClick={() => navigate(-1)} style={{
          position: 'absolute', top: 0, left: 0, height: 52, padding: '0 20px',
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', cursor: 'pointer', zIndex: 10,
          WebkitTapHighlightColor: 'transparent',
        }}>
          <span style={{ color: 'rgba(245,240,228,0.5)', fontSize: 20, fontWeight: 300 }}>‹</span>
          <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.4)' }}>Cancel</span>
        </button>

        <div style={{ position: 'relative', zIndex: 1, paddingTop: 60, paddingBottom: 32, paddingLeft: 20 }}>
          <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 15, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.85)' }}>
            Select Category
          </span>
        </div>

        <div style={{
          position: 'relative', zIndex: 1,
          padding: '0 16px 48px',
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16,
          overflowY: 'auto', maxHeight: 'calc(100dvh - 108px)',
        }}>
          {TUNING_CATEGORIES.map((cat, i) => (
            <button
              key={cat.id}
              onClick={() => { setCategory(cat.id); setStep('form') }}
              onPointerDown={() => press(cat.id)} onPointerUp={release} onPointerLeave={release} onPointerCancel={release}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                animation: `tileIn 350ms ${EASING_SETTLE} ${i * 35}ms both`,
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation', userSelect: 'none',
              }}
            >
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
                transform: pressed === cat.id ? 'scale(0.92)' : 'scale(1)',
                transition: pressed === cat.id ? 'transform 80ms ease-out' : 'transform 200ms cubic-bezier(0.22,1,0.36,1)',
              }}>
                <div style={{
                  width: 78, height: 78,
                  background: '#0a0a0c',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 6,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <img src={cat.icon} alt={cat.label} draggable={false}
                    style={{ width: 54, height: 54, objectFit: 'contain', pointerEvents: 'none' }} />
                </div>
                <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.5)' }}>
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
      <BgGradients />

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
              border: '1px solid rgba(57,255,20,0.2)',
              borderRadius: 4, cursor: 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(57,255,20,0.45)' }}>
              + Add DIY Steps
            </span>
            <span style={{ fontFamily: FONT_UI, fontWeight: 400, fontSize: 9, color: 'rgba(57,255,20,0.28)', letterSpacing: '0.04em' }}>
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
              background: canSubmit ? 'rgba(57,255,20,0.1)' : 'transparent',
              border: `1.5px solid ${canSubmit ? 'rgba(57,255,20,0.65)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 4,
              fontFamily: FONT_UI, fontWeight: 800, fontSize: 12,
              letterSpacing: '0.16em', textTransform: 'uppercase',
              color: canSubmit ? '#39ff14' : 'rgba(245,240,228,0.2)',
              cursor: canSubmit ? 'pointer' : 'default',
              transition: 'all 200ms ease',
              transform: pressed === 'submit' ? 'scale(0.97)' : 'scale(1)',
              boxShadow: canSubmit ? '0 0 14px rgba(57,255,20,0.12)' : 'none',
            }}
          >
            {saving ? 'Saving…' : 'Add to Build Sheet'}
          </button>
        </div>
      </div>
    </div>
  )
}
