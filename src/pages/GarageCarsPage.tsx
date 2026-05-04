// Route: /garage/cars — My Cars carousel + inline Add Car flow (Task 16)
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  COLOR_CAVITY_BG,
  COLOR_HEADER_BLACK,
  COLOR_HEADER_WARM,
  COLOR_HEADER_TITLE,
  COLOR_BURGUNDY_M,
  COLOR_ACCENT,
  COLOR_PANEL_TEXT,
  GRADIENT_PANEL,
  COLOR_PANEL_LINE,
  COLOR_TEXT_SECONDARY,
  FONT_UI,
  FONT_TITLE,
  HEADER_HEIGHT,
  SPACE_XS,
  SPACE_SM,
  SPACE_MD,
  SPACE_LG,
  SPACE_XL,
  EASING_SETTLE,
} from '../tokens'

const _now        = new Date()
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_LABEL = MONTHS[_now.getMonth()]
const DAY_LABEL   = String(_now.getDate())

type Car = {
  id: string; year: number | null; make: string | null
  model: string | null; trim: string | null
  nickname: string; current_mileage: number | null
}
type FormData = { year: string; make: string; model: string; trim: string; nickname: string; mileage: string }
const EMPTY_FORM: FormData = { year: '', make: '', model: '', trim: '', nickname: '', mileage: '' }

const LABEL_STYLE: React.CSSProperties = {
  fontFamily: FONT_UI, fontWeight: 700, fontSize: 10,
  letterSpacing: '0.12em', textTransform: 'uppercase', color: COLOR_TEXT_SECONDARY,
}
const INPUT_STYLE: React.CSSProperties = {
  background: GRADIENT_PANEL, border: 'none',
  borderBottom: `1px solid ${COLOR_PANEL_LINE}`,
  padding: '11px 12px', fontFamily: FONT_UI, fontWeight: 600,
  fontSize: 14, color: COLOR_PANEL_TEXT, outline: 'none',
  width: '100%', boxSizing: 'border-box', WebkitAppearance: 'none',
}
const DROP_ITEM: React.CSSProperties = {
  padding: '10px 12px', fontFamily: FONT_UI, fontWeight: 600,
  fontSize: 13, color: COLOR_PANEL_TEXT, cursor: 'pointer',
  background: GRADIENT_PANEL, borderBottom: `1px solid ${COLOR_PANEL_LINE}`,
}

// ── Background ──
function GarageBg() {
  return (
    <>
      {/* Slightly lighter base centre — lifts it out of pure black */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 90% 65% at 50% 42%, #131315 0%, #050507 100%)',
      }} />
      {/* Garage door thin lines */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `repeating-linear-gradient(180deg,
          transparent 0px, transparent 34px,
          rgba(210,210,210,0.026) 34px, rgba(210,210,210,0.026) 35px)`,
      }} />
      {/* Two thicker panel dividers */}
      <div aria-hidden style={{ position: 'absolute', top: '33%', left: 0, right: 0, height: 2, background: 'rgba(220,215,210,0.048)', pointerEvents: 'none' }} />
      <div aria-hidden style={{ position: 'absolute', top: '67%', left: 0, right: 0, height: 2, background: 'rgba(220,215,210,0.048)', pointerEvents: 'none' }} />
      {/* Floor spotlight — centred at 72% height so car sits in visible light */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 72% 48% at 50% 72%, rgba(242,238,226,0.2) 0%, rgba(242,238,226,0.07) 45%, transparent 100%)',
      }} />
    </>
  )
}

// ── Shared header ──
function Header({ onBack }: { onBack: () => void }) {
  return (
    <div style={{
      position: 'relative', height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      paddingLeft: 10, paddingRight: 14, flexShrink: 0, zIndex: 10,
      borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px 4px 4px', display: 'flex', alignItems: 'center' }}>
          <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
        </button>
        <span style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 22, color: COLOR_HEADER_TITLE, letterSpacing: '0.01em' }}>
          Garage
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <div style={{ background: 'rgba(242,238,228,0.94)', color: '#0d0d0d', padding: '4px 7px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>
          {MONTH_LABEL}
        </div>
        <div style={{ background: COLOR_BURGUNDY_M, color: '#fff', padding: '4px 8px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: DAY_LABEL.length === 1 ? 24 : 30 }}>
          {DAY_LABEL}
        </div>
      </div>
    </div>
  )
}

// ── Autocomplete input ──
function AutoInput({
  label, value, placeholder, disabled = false,
  onChange, suggestions, onSelect, inputMode,
}: {
  label: string; value: string; placeholder: string; disabled?: boolean
  onChange: (v: string) => void; suggestions: string[]
  onSelect: (v: string) => void; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
}) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_XS, position: 'relative' }}>
      <span style={LABEL_STYLE}>{label}</span>
      <input
        type="text" inputMode={inputMode}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        autoCapitalize="words"
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={{ ...INPUT_STYLE, opacity: disabled ? 0.4 : 1 }}
      />
      {open && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          zIndex: 50, maxHeight: 180, overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          border: `1px solid ${COLOR_PANEL_LINE}`,
        }}>
          {suggestions.map(s => (
            <div
              key={s}
              onMouseDown={() => { onSelect(s); setOpen(false) }}
              style={DROP_ITEM}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function GarageCarsPage() {
  const navigate                        = useNavigate()
  const [cars, setCars]                 = useState<Car[]>([])
  const [loading, setLoading]           = useState(true)
  const [showAdd, setShowAdd]           = useState(false)
  const [showHints, setShowHints]       = useState(false)
  const [activeIdx, setActiveIdx]       = useState(0)
  const [step, setStep]                 = useState(1)
  const [form, setForm]                 = useState<FormData>(EMPTY_FORM)
  const [story, setStory]               = useState('')
  const [saving, setSaving]             = useState(false)
  const [saveErr, setSaveErr]           = useState<string | null>(null)
  const [makeSugs, setMakeSugs]         = useState<string[]>([])
  const [modelSugs, setModelSugs]       = useState<string[]>([])
  const [selectedMakeId, setSelectedMakeId] = useState<number | null>(null)
  const scrollRef                       = useRef<HTMLDivElement>(null)
  const makeTimer                       = useRef<ReturnType<typeof setTimeout>>()
  const modelTimer                      = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    supabase
      .from('cars')
      .select('id, year, make, model, trim, nickname, current_mileage')
      .is('deleted_at', null)
      .order('created_at')
      .then(({ data }) => {
        if (data) { setCars(data); if (data.length > 1) setShowHints(true) }
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (!showHints) return
    const t = setTimeout(() => setShowHints(false), 3200)
    return () => clearTimeout(t)
  }, [showHints])

  function onCarouselScroll() {
    const el = scrollRef.current; if (!el) return
    setActiveIdx(Math.round(el.scrollLeft / el.clientWidth))
  }

  function openAdd() {
    setStep(1); setForm(EMPTY_FORM); setStory('')
    setSaveErr(null); setMakeSugs([]); setModelSugs([])
    setSelectedMakeId(null); setShowAdd(true)
  }

  // Debounced make search
  const onMakeChange = useCallback((v: string) => {
    setForm(f => ({ ...f, make: v, model: '' }))
    setSelectedMakeId(null); setModelSugs([])
    clearTimeout(makeTimer.current)
    if (v.length < 2) { setMakeSugs([]); return }
    makeTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from('vehicle_makes')
        .select('id, make_name')
        .ilike('make_name', `${v}%`)
        .eq('is_active', true)
        .order('make_name')
        .limit(8)
      setMakeSugs(data?.map(r => r.make_name) ?? [])
    }, 280)
  }, [])

  const onMakeSelect = useCallback(async (name: string) => {
    setForm(f => ({ ...f, make: name, model: '' }))
    setMakeSugs([])
    const { data } = await supabase
      .from('vehicle_makes').select('id').eq('make_name', name).single()
    if (data) setSelectedMakeId(data.id)
  }, [])

  // Debounced model search
  const onModelChange = useCallback((v: string) => {
    setForm(f => ({ ...f, model: v }))
    clearTimeout(modelTimer.current)
    if (!selectedMakeId || v.length < 1) { setModelSugs([]); return }
    modelTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from('vehicle_models')
        .select('model_name')
        .eq('make_id', selectedMakeId)
        .ilike('model_name', `${v}%`)
        .order('model_name')
        .limit(8)
      setModelSugs(data?.map(r => r.model_name) ?? [])
    }, 280)
  }, [selectedMakeId])

  const set = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  // Nickname is optional — year/make/model are the only hard requirements
  const step1Valid = form.year.trim() !== '' && form.make.trim() !== '' &&
    form.model.trim() !== '' && form.mileage.trim() !== ''

  async function saveCar() {
    setSaving(true); setSaveErr(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); setSaveErr('Not signed in.'); return }
    // Auto-generate nickname if blank
    const nickname = form.nickname.trim() ||
      [form.year, form.make, form.model].filter(Boolean).join(' ')
    const { data, error } = await supabase
      .from('cars')
      .insert({
        user_id: user.id,
        year: parseInt(form.year) || null,
        make: form.make.trim() || null,
        make_id: selectedMakeId,
        model: form.model.trim() || null,
        trim: form.trim.trim() || null,
        nickname,
        current_mileage: parseInt(form.mileage) || null,
        purchase_story: story.trim() || null,
      })
      .select('id, year, make, model, trim, nickname, current_mileage')
      .single()
    setSaving(false)
    if (error || !data) { setSaveErr(error?.message ?? 'Save failed'); return }
    const updated = [...cars, data]
    setCars(updated)
    setShowAdd(false)
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el) el.scrollLeft = (updated.length - 1) * el.clientWidth
    })
    if (updated.length > 1) setShowHints(true)
  }

  const ctaStyle = (active: boolean): React.CSSProperties => ({
    width: '100%', padding: '15px',
    background: active ? COLOR_ACCENT : 'rgba(200,102,26,0.22)',
    border: 'none', color: active ? '#fff' : 'rgba(255,255,255,0.3)',
    fontFamily: FONT_UI, fontWeight: 800, fontSize: 13,
    letterSpacing: '0.12em', textTransform: 'uppercase',
    cursor: active ? 'pointer' : 'default',
    transition: '200ms ease-out', opacity: saving ? 0.6 : 1,
  })

  return (
    <div style={{ height: '100dvh', background: COLOR_CAVITY_BG, position: 'relative', overflow: 'hidden', fontFamily: FONT_UI, display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes hintPulse { 0%,100%{opacity:0} 30%,70%{opacity:0.6} }
        @keyframes addCarPulse {
          0%,100%{box-shadow:0 0 8px rgba(200,102,26,.3),0 0 0 0 rgba(200,102,26,0)}
          50%    {box-shadow:0 0 22px rgba(200,102,26,.75),0 0 0 12px rgba(200,102,26,.1)}
        }
        .hide-scrollbar{scrollbar-width:none}
        .hide-scrollbar::-webkit-scrollbar{display:none}
      `}</style>

      <GarageBg />
      <Header onBack={() => navigate('/garage')} />

      {/* ── CAROUSEL ── */}
      {!loading && (
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {cars.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: SPACE_MD, paddingBottom: '15%' }}>
              <button onClick={openAdd} style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(200,102,26,0.22)', border: '1.5px solid rgba(200,102,26,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', animation: 'addCarPulse 3s ease-in-out infinite' }}>
                <span style={{ color: COLOR_ACCENT, fontSize: 28, fontWeight: 300, lineHeight: 1, marginTop: -1, textShadow: '0 0 10px rgba(200,102,26,0.9)' }}>+</span>
              </button>
              <p style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 15, color: 'rgba(245,245,245,0.55)', margin: 0, textAlign: 'center', maxWidth: 200, lineHeight: 1.5 }}>
                Tap to place your first car in the garage.
              </p>
            </div>
          ) : (
            <>
              <div ref={scrollRef} onScroll={onCarouselScroll} className="hide-scrollbar" style={{ display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', height: '100%' }}>
                {cars.map((car, i) => (
                  <div key={car.id} style={{ flex: '0 0 100%', height: '100%', scrollSnapAlign: 'start', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: `0 ${SPACE_XL}px` }}>
                    <div style={{ position: 'absolute', top: SPACE_MD, right: SPACE_MD, fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.14em', color: 'rgba(245,245,245,0.3)', textTransform: 'uppercase' }}>
                      {String(i + 1).padStart(2, '0')} / {String(cars.length).padStart(2, '0')}
                    </div>
                    <div style={{ textAlign: 'center', position: 'relative', zIndex: 2 }}>
                      <p style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 46, color: COLOR_HEADER_TITLE, margin: '0 0 8px', lineHeight: 1.05, letterSpacing: '-0.01em' }}>
                        {car.nickname}
                      </p>
                      <p style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 13, color: 'rgba(245,245,245,0.55)', margin: '0 0 4px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        {[car.year, car.make, car.model].filter(Boolean).join(' ')}
                      </p>
                      {car.trim && (
                        <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 11, color: 'rgba(245,245,245,0.3)', margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{car.trim}</p>
                      )}
                    </div>
                    {car.current_mileage != null && (
                      <div style={{ position: 'absolute', bottom: SPACE_XL + 20, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: SPACE_XS, alignItems: 'baseline' }}>
                        <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 22, color: COLOR_ACCENT, letterSpacing: '-0.02em' }}>{car.current_mileage.toLocaleString()}</span>
                        <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, color: COLOR_TEXT_SECONDARY, letterSpacing: '0.12em', textTransform: 'uppercase' }}>mi</span>
                      </div>
                    )}
                    <div aria-hidden style={{ position: 'absolute', bottom: '22%', left: '10%', right: '10%', height: 1, background: 'linear-gradient(90deg,transparent,rgba(245,240,230,0.08) 30%,rgba(245,240,230,0.08) 70%,transparent)', pointerEvents: 'none' }} />
                  </div>
                ))}
                {/* Add another car slide */}
                <div style={{ flex: '0 0 100%', height: '100%', scrollSnapAlign: 'start', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: SPACE_MD, paddingBottom: '15%' }}>
                  <button onClick={openAdd} style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(200,102,26,0.22)', border: '1.5px solid rgba(200,102,26,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', animation: 'addCarPulse 3s ease-in-out infinite' }}>
                    <span style={{ color: COLOR_ACCENT, fontSize: 28, fontWeight: 300, lineHeight: 1, marginTop: -1, textShadow: '0 0 10px rgba(200,102,26,0.9)' }}>+</span>
                  </button>
                  <p style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 15, color: 'rgba(245,245,245,0.45)', margin: 0 }}>Add another car</p>
                </div>
              </div>

              {/* Swipe hint arrows */}
              {showHints && activeIdx < cars.length && (
                <>
                  {activeIdx > 0 && (
                    <div style={{ position: 'absolute', left: SPACE_SM, top: '50%', transform: 'translateY(-50%)', zIndex: 5, animation: `hintPulse 1.6s ${EASING_SETTLE} 2`, pointerEvents: 'none' }}>
                      <span style={{ color: 'rgba(245,245,245,0.7)', fontSize: 32, fontWeight: 300 }}>‹</span>
                    </div>
                  )}
                  <div style={{ position: 'absolute', right: SPACE_SM, top: '50%', transform: 'translateY(-50%)', zIndex: 5, animation: `hintPulse 1.6s ${EASING_SETTLE} 2`, pointerEvents: 'none' }}>
                    <span style={{ color: 'rgba(245,245,245,0.7)', fontSize: 32, fontWeight: 300 }}>›</span>
                  </div>
                </>
              )}

              {/* Slide dots */}
              <div style={{ position: 'absolute', bottom: SPACE_MD, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6, zIndex: 5, pointerEvents: 'none' }}>
                {[...cars, null].map((_, i) => (
                  <div key={i} style={{ width: i === activeIdx ? 16 : 4, height: 4, background: i === activeIdx ? COLOR_ACCENT : 'rgba(255,255,255,0.2)', transition: '300ms ease', borderRadius: 2 }} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── ADD CAR OVERLAY ── */}
      <div style={{
        position: 'absolute', inset: 0, background: COLOR_CAVITY_BG, zIndex: 20,
        transform: showAdd ? 'translateY(0)' : 'translateY(100%)',
        transition: `transform 380ms ${EASING_SETTLE}`,
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        <GarageBg />
        <Header onBack={() => step === 2 ? setStep(1) : setShowAdd(false)} />

        <div style={{ flex: 1, overflowY: 'auto', padding: `${SPACE_LG}px ${SPACE_MD}px 140px` }}>
          {/* Step bars */}
          <div style={{ display: 'flex', gap: SPACE_XS, marginBottom: SPACE_LG, alignItems: 'center' }}>
            <div style={{ flex: 1, height: 2, background: step >= 1 ? COLOR_ACCENT : 'rgba(255,255,255,0.1)', transition: '300ms ease' }} />
            <div style={{ flex: 1, height: 2, background: step >= 2 ? COLOR_ACCENT : 'rgba(255,255,255,0.1)', transition: '300ms ease' }} />
            <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.1em', color: COLOR_TEXT_SECONDARY, textTransform: 'uppercase', paddingLeft: SPACE_XS, flexShrink: 0 }}>{step} / 2</span>
          </div>

          <p style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 26, color: COLOR_HEADER_TITLE, margin: `0 0 ${SPACE_LG}px`, lineHeight: 1.15 }}>
            {step === 1 ? 'Tell us about\nyour car.' : "What's the story?"}
          </p>

          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_MD }}>
              {/* Year */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_XS, flex: '0 0 86px', width: 86 }}>
                <span style={LABEL_STYLE}>Year</span>
                <input type="number" inputMode="numeric" placeholder="2003" value={form.year} onChange={set('year')} style={INPUT_STYLE} />
              </div>

              {/* Make — autocomplete */}
              <AutoInput
                label="Make"
                value={form.make}
                placeholder="Mitsubishi"
                suggestions={makeSugs}
                onChange={onMakeChange}
                onSelect={onMakeSelect}
              />

              {/* Model — autocomplete, unlocks after make */}
              <AutoInput
                label="Model"
                value={form.model}
                placeholder={form.make ? 'Lancer' : 'Enter make first'}
                disabled={form.make.trim() === ''}
                suggestions={modelSugs}
                onChange={onModelChange}
                onSelect={v => { setForm(f => ({ ...f, model: v })); setModelSugs([]) }}
              />

              {/* Trim */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_XS }}>
                <span style={LABEL_STYLE}>Trim <span style={{ fontWeight: 400, opacity: 0.5, fontSize: 9 }}>optional</span></span>
                <input type="text" autoCapitalize="words" placeholder="Evolution IV" value={form.trim} onChange={set('trim')} style={INPUT_STYLE} />
              </div>

              {/* Nickname */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_XS }}>
                <span style={LABEL_STYLE}>Nickname <span style={{ fontWeight: 400, opacity: 0.5, fontSize: 9 }}>optional</span></span>
                <input type="text" autoCapitalize="words" placeholder="Project Evo" value={form.nickname} onChange={set('nickname')} style={INPUT_STYLE} />
              </div>

              {/* Mileage */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_XS }}>
                <span style={LABEL_STYLE}>Current Mileage</span>
                <input type="number" inputMode="numeric" placeholder="87000" value={form.mileage} onChange={set('mileage')} style={INPUT_STYLE} />
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_SM }}>
              <textarea
                placeholder={'How did you find it?\nWhat does it mean to you?'}
                value={story} onChange={e => setStory(e.target.value)}
                rows={7}
                style={{ ...INPUT_STYLE, resize: 'none', lineHeight: 1.65 } as React.CSSProperties}
              />
              <p style={{ fontFamily: FONT_UI, fontSize: 11, color: COLOR_TEXT_SECONDARY, margin: 0, lineHeight: 1.5 }}>
                This lives in your car's origin story. You can always add it later.
              </p>
            </div>
          )}

          {saveErr && <p style={{ fontFamily: FONT_UI, fontSize: 12, color: '#e05555', marginTop: SPACE_MD }}>{saveErr}</p>}
        </div>

        {/* CTA */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: `${SPACE_SM}px ${SPACE_MD}px ${SPACE_XL}px`, background: 'linear-gradient(0deg,rgba(5,5,7,.96) 0%,rgba(5,5,7,.7) 70%,transparent 100%)', display: 'flex', flexDirection: 'column', gap: SPACE_SM, zIndex: 5 }}>
          {step === 1 && <button disabled={!step1Valid} onClick={() => setStep(2)} style={ctaStyle(step1Valid)}>Next</button>}
          {step === 2 && (
            <>
              <button disabled={saving} onClick={saveCar} style={ctaStyle(true)}>{saving ? 'Placing in garage…' : 'Place in Garage'}</button>
              <button disabled={saving} onClick={saveCar} style={{ width: '100%', padding: '10px', background: 'none', border: 'none', color: COLOR_TEXT_SECONDARY, fontFamily: FONT_UI, fontWeight: 600, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: saving ? 'default' : 'pointer' }}>Skip Story</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
