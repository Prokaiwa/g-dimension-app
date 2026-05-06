// Route: /garage/cars — My Cars carousel + inline Add Car flow
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
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
type MakeItem  = { id: number; name: string; priority: number }
type ModelItem = { id: number; name: string }

type FormData = {
  year: string; make: string; model: string; trim: string
  nickname: string; mileage: string; mileageUnit: 'mi' | 'km'
  purchaseDate: string; purchasePrice: string; purchaseCurrency: string
  mileageAtPurchase: string; wherePurchased: string; originStory: string
}

const EMPTY_FORM: FormData = {
  year: '', make: '', model: '', trim: '', nickname: '', mileage: '', mileageUnit: 'mi',
  purchaseDate: '', purchasePrice: '', purchaseCurrency: 'USD',
  mileageAtPurchase: '', wherePurchased: '', originStory: '',
}

const LABEL: React.CSSProperties = {
  fontFamily: FONT_UI, fontWeight: 700, fontSize: 10,
  letterSpacing: '0.12em', textTransform: 'uppercase', color: COLOR_TEXT_SECONDARY,
}
const INPUT: React.CSSProperties = {
  background: GRADIENT_PANEL, border: 'none',
  borderBottom: `1px solid ${COLOR_PANEL_LINE}`,
  padding: '8px 10px', fontFamily: FONT_UI, fontWeight: 600,
  fontSize: 16, color: COLOR_PANEL_TEXT, outline: 'none',
  width: '100%', boxSizing: 'border-box', WebkitAppearance: 'none',
}
const FIELD: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: SPACE_XS }
const OPT:   React.CSSProperties = { fontWeight: 400, opacity: 0.45, fontSize: 9 }

// Normalize DB make names: "TOYOTA" → "Toyota", "BMW" → "BMW", "LAND ROVER" → "Land Rover"
function normMake(s: string): string {
  if (s !== s.toUpperCase()) return s
  return s.split(/(\s+|-)/).map(part =>
    /^[^A-Za-z]+$/.test(part) ? part :
    part.length <= 3 ? part.toUpperCase() :
    part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
  ).join('')
}

const WHEEL_ITEM_H = 44

// iOS-style drum wheel picker
function WheelPicker({ items, value, onChange }: { items: string[]; value: string; onChange: (v: string) => void }) {
  const VISIBLE = 5
  const ref = useRef<HTMLDivElement>(null)
  const [activeIdx, setActiveIdx] = useState(() => { const i = items.indexOf(value); return i >= 0 ? i : 0 })
  const commitRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const el = ref.current; if (!el) return
    const i = items.indexOf(value)
    el.scrollTop = (i >= 0 ? i : 0) * WHEEL_ITEM_H
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleScroll() {
    const el = ref.current; if (!el) return
    const idx = Math.round(el.scrollTop / WHEEL_ITEM_H)
    const c = Math.max(0, Math.min(idx, items.length - 1))
    setActiveIdx(c)
    clearTimeout(commitRef.current)
    commitRef.current = setTimeout(() => onChange(items[c]), 80)
  }

  return (
    <div style={{ position: 'relative', height: WHEEL_ITEM_H * VISIBLE, overflow: 'hidden', flex: 1 }}>
      <div style={{ position: 'absolute', top: WHEEL_ITEM_H * 2, left: 0, right: 0, height: WHEEL_ITEM_H, background: 'rgba(255,255,255,0.055)', borderTop: '1px solid rgba(255,255,255,0.09)', borderBottom: '1px solid rgba(255,255,255,0.09)', pointerEvents: 'none', zIndex: 2 }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: WHEEL_ITEM_H * 2, background: `linear-gradient(to bottom, ${COLOR_CAVITY_BG} 0%, transparent 100%)`, pointerEvents: 'none', zIndex: 2 }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: WHEEL_ITEM_H * 2, background: `linear-gradient(to top, ${COLOR_CAVITY_BG} 0%, transparent 100%)`, pointerEvents: 'none', zIndex: 2 }} />
      <div ref={ref} onScroll={handleScroll} className="hide-scrollbar" style={{ height: '100%', overflowY: 'scroll', scrollSnapType: 'y mandatory', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
        <div style={{ height: WHEEL_ITEM_H * 2 }} />
        {items.map((item, i) => (
          <div key={item} style={{ height: WHEEL_ITEM_H, scrollSnapAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: FONT_UI, fontWeight: i === activeIdx ? 700 : 500, fontSize: i === activeIdx ? 20 : 16, color: i === activeIdx ? '#f0ece4' : 'rgba(240,236,228,0.28)', transition: '80ms ease' }}>{item}</span>
          </div>
        ))}
        <div style={{ height: WHEEL_ITEM_H * 2 }} />
      </div>
    </div>
  )
}

// Full-screen year wheel overlay
const CURRENT_YEAR = new Date().getFullYear()
const YEAR_LIST = Array.from({ length: CURRENT_YEAR - 1949 }, (_, i) => String(CURRENT_YEAR + 1 - i))

function YearPickerSheet({ value, onSelect, onClose }: { value: string; onSelect: (v: string) => void; onClose: () => void }) {
  const [local, setLocal] = useState(value || String(CURRENT_YEAR))
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'flex', flexDirection: 'column', background: COLOR_CAVITY_BG }}>
      <div style={{ height: HEADER_HEIGHT, display: 'flex', alignItems: 'center', paddingLeft: SPACE_MD, paddingRight: SPACE_MD, background: COLOR_HEADER_BLACK, borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px 4px 0', display: 'flex', alignItems: 'center' }}>
          <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
        </button>
        <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: COLOR_TEXT_SECONDARY }}>Year</span>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: `0 ${SPACE_XL}px` }}>
        <WheelPicker items={YEAR_LIST} value={local} onChange={setLocal} />
      </div>
      <div style={{ flexShrink: 0, padding: `${SPACE_SM}px ${SPACE_MD}px ${SPACE_LG}px`, background: 'rgba(5,5,7,0.96)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <button
          onClick={() => { onSelect(local); onClose() }}
          style={{ width: '100%', padding: '14px', background: COLOR_ACCENT, border: 'none', color: '#fff', fontFamily: FONT_UI, fontWeight: 800, fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}
        >
          Done
        </button>
      </div>
    </div>
  )
}

// Shared header style for picker sheets
function PickerHeader({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div style={{ height: HEADER_HEIGHT, display: 'flex', alignItems: 'center', paddingLeft: SPACE_MD, paddingRight: SPACE_MD, background: COLOR_HEADER_BLACK, borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px 4px 0', display: 'flex', alignItems: 'center' }}>
        <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
      </button>
      <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: COLOR_TEXT_SECONDARY }}>{label}</span>
    </div>
  )
}

// Shared Done button for picker sheets
function PickerDoneButton({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  return (
    <div style={{ flexShrink: 0, padding: `${SPACE_SM}px ${SPACE_MD}px ${SPACE_LG}px`, background: 'rgba(5,5,7,0.96)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
      <button
        onClick={onPress}
        disabled={disabled}
        style={{ width: '100%', padding: '14px', background: disabled ? 'rgba(200,102,26,0.22)' : COLOR_ACCENT, border: 'none', color: disabled ? 'rgba(255,255,255,0.3)' : '#fff', fontFamily: FONT_UI, fontWeight: 800, fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: disabled ? 'default' : 'pointer' }}
      >
        Done
      </button>
    </div>
  )
}

// Free-text entry overlay (used by Make "Other" and Model "Other")
function FreeTextSheet({ label, placeholder, onDone, onBack }: { label: string; placeholder: string; onDone: (text: string) => void; onBack: () => void }) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { setTimeout(() => ref.current?.focus(), 120) }, [])
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', background: COLOR_CAVITY_BG }}>
      <PickerHeader label={label} onBack={onBack} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: `0 ${SPACE_MD}px` }}>
        <input
          ref={ref}
          type="text"
          autoCapitalize="words"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && text.trim() && onDone(text.trim())}
          placeholder={placeholder}
          style={INPUT}
        />
      </div>
      <PickerDoneButton onPress={() => text.trim() && onDone(text.trim())} disabled={!text.trim()} />
    </div>
  )
}

// Full-screen make picker — drum wheel with search + "Other"
function MakePickerSheet({
  allMakes, onSelect, onClose, onFreeText,
}: {
  allMakes: MakeItem[]
  onSelect: (item: { id: number; name: string }) => void
  onClose: () => void
  onFreeText: (text: string) => void
}) {
  const [search, setSearch] = useState('')
  const [local, setLocal] = useState(allMakes[0]?.name ?? 'Other')
  const [showOther, setShowOther] = useState(false)

  const filteredNames = useMemo(() => {
    const q = search.trim().toLowerCase()
    const makes = q
      ? allMakes.filter(m => m.name.toLowerCase().includes(q))
      : allMakes
    return [...makes.map(m => m.name), 'Other']
  }, [search, allMakes])

  // When filter changes, reset wheel to top
  useEffect(() => {
    setLocal(filteredNames[0] ?? 'Other')
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleDone() {
    if (local === 'Other') { setShowOther(true); return }
    const item = allMakes.find(m => m.name === local)
    if (item) onSelect(item)
    else onFreeText(local)
    onClose()
  }

  if (showOther) {
    return (
      <FreeTextSheet
        label="Make"
        placeholder="e.g. Datsun, De Tomaso, Caterham…"
        onDone={text => { onFreeText(text); onClose() }}
        onBack={() => setShowOther(false)}
      />
    )
  }

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'flex', flexDirection: 'column', background: COLOR_CAVITY_BG }}>
      <PickerHeader label="Make" onBack={onClose} />
      <div style={{ padding: `${SPACE_SM}px ${SPACE_MD}px`, background: '#0a0a0c', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search makes…"
          style={{ ...INPUT, background: 'rgba(255,255,255,0.06)', borderBottom: 'none', color: '#f0ece4', borderRadius: 4 }}
        />
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: `0 ${SPACE_XL}px` }}>
        <WheelPicker key={search} items={filteredNames} value={local} onChange={setLocal} />
      </div>
      <PickerDoneButton onPress={handleDone} />
    </div>
  )
}

// Full-screen model picker — drum wheel with "Other"
function ModelPickerSheet({
  models, onSelect, onClose, onFreeText,
}: {
  models: ModelItem[]
  onSelect: (item: ModelItem) => void
  onClose: () => void
  onFreeText: (text: string) => void
}) {
  const items = useMemo(() => [...models.map(m => m.name), 'Other'], [models])
  const [local, setLocal] = useState(items[0] ?? 'Other')
  const [showOther, setShowOther] = useState(false)

  function handleDone() {
    if (local === 'Other') { setShowOther(true); return }
    const item = models.find(m => m.name === local)
    if (item) onSelect(item)
    else onFreeText(local)
    onClose()
  }

  if (showOther) {
    return (
      <FreeTextSheet
        label="Model"
        placeholder="e.g. Silvia S15, Integra Type R…"
        onDone={text => { onFreeText(text); onClose() }}
        onBack={() => setShowOther(false)}
      />
    )
  }

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'flex', flexDirection: 'column', background: COLOR_CAVITY_BG }}>
      <PickerHeader label="Model" onBack={onClose} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: `0 ${SPACE_XL}px` }}>
        <WheelPicker items={items} value={local} onChange={setLocal} />
      </div>
      <PickerDoneButton onPress={handleDone} />
    </div>
  )
}

// Tappable field — looks like an input, opens picker on tap
const TAPPABLE: React.CSSProperties = {
  background: GRADIENT_PANEL, border: 'none', textAlign: 'left',
  borderBottom: `1px solid ${COLOR_PANEL_LINE}`,
  padding: '8px 10px', fontFamily: FONT_UI, fontWeight: 600,
  fontSize: 16, color: COLOR_PANEL_TEXT,
  width: '100%', boxSizing: 'border-box', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
}

// ── Background ──
function GarageBg() {
  return (
    <>
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 90% 65% at 50% 42%, #131315 0%, #050507 100%)' }} />
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `repeating-linear-gradient(180deg, transparent 0px, transparent 34px, rgba(210,210,210,0.026) 34px, rgba(210,210,210,0.026) 35px)` }} />
      <div aria-hidden style={{ position: 'absolute', top: '33%', left: 0, right: 0, height: 2, background: 'rgba(220,215,210,0.048)', pointerEvents: 'none' }} />
      <div aria-hidden style={{ position: 'absolute', top: '67%', left: 0, right: 0, height: 2, background: 'rgba(220,215,210,0.048)', pointerEvents: 'none' }} />
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 72% 48% at 50% 50%, rgba(242,238,226,0.2) 0%, rgba(242,238,226,0.07) 45%, transparent 100%)' }} />
    </>
  )
}

// ── Shared header ──
function Header({ onBack }: { onBack: () => void }) {
  return (
    <div style={{ position: 'relative', height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 10, paddingRight: 14, flexShrink: 0, zIndex: 10, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px 4px 4px', display: 'flex', alignItems: 'center' }}>
          <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
        </button>
        <span style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 22, color: COLOR_HEADER_TITLE, letterSpacing: '0.01em' }}>Garage</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <div style={{ background: 'rgba(242,238,228,0.94)', color: '#0d0d0d', padding: '4px 7px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>{MONTH_LABEL}</div>
        <div style={{ background: COLOR_BURGUNDY_M, color: '#fff', padding: '4px 8px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: DAY_LABEL.length === 1 ? 24 : 30 }}>{DAY_LABEL}</div>
      </div>
    </div>
  )
}

export default function GarageCarsPage() {
  const navigate                              = useNavigate()
  const [cars, setCars]                       = useState<Car[]>([])
  const [loading, setLoading]                 = useState(true)
  const [showAdd, setShowAdd]                 = useState(false)
  const [showHints, setShowHints]             = useState(false)
  const [activeIdx, setActiveIdx]             = useState(0)
  const [step, setStep]                       = useState(1)
  const [form, setForm]                       = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving]                   = useState(false)
  const [saveErr, setSaveErr]                 = useState<string | null>(null)
  const [allMakes, setAllMakes]               = useState<MakeItem[]>([])
  const [makesLoading, setMakesLoading]       = useState(false)
  const [makeModels, setMakeModels]           = useState<ModelItem[]>([])
  const [selectedMakeId, setSelectedMakeId]   = useState<number | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null)
  const [picker, setPicker]                   = useState<'year' | 'make' | 'model' | null>(null)
  const scrollRef                             = useRef<HTMLDivElement>(null)

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

  async function openAdd() {
    setStep(1); setForm(EMPTY_FORM); setSaveErr(null)
    setAllMakes([]); setMakeModels([])
    setSelectedMakeId(null); setSelectedModelId(null); setShowAdd(true)
    setMakesLoading(true)
    const { data } = await supabase
      .from('vehicle_makes')
      .select('id, make_name, priority')
      .eq('is_active', true)
      .gt('priority', 0)
      .order('priority', { ascending: false })
      .order('make_name')
    const normalized = (data ?? []).map(r => ({
      id: r.id, name: normMake(r.make_name), priority: r.priority ?? 0,
    })).sort((a, b) => (b.priority - a.priority) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
    setAllMakes(normalized)
    setMakesLoading(false)
  }

  const onMakeSelect = useCallback(async (item: { id: number; name: string }) => {
    setForm(f => ({ ...f, make: item.name, model: '' }))
    setSelectedMakeId(item.id); setSelectedModelId(null); setMakeModels([])
    setPicker(null)
    const { data } = await supabase
      .from('vehicle_models')
      .select('id, model_name')
      .eq('make_id', item.id)
      .order('model_name')
    setMakeModels(data?.map(r => ({ id: r.id, name: r.model_name })) ?? [])
  }, [])

  const onModelSelect = useCallback((item: ModelItem) => {
    setForm(f => ({ ...f, model: item.name }))
    setSelectedModelId(item.id)
    setPicker(null)
  }, [])

  const set = (k: keyof FormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  const step1Valid = form.year.trim() !== '' && form.make.trim() !== '' &&
    form.model.trim() !== '' && form.mileage.trim() !== ''

  async function saveCar() {
    setSaving(true); setSaveErr(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); setSaveErr('Not signed in.'); return }
    const nickname = form.nickname.trim() ||
      [form.year, form.make, form.model].filter(Boolean).join(' ')
    const rawMileage = parseInt(form.mileage) || null
    // DB always stores miles — convert km input
    const mileageInMiles = rawMileage && form.mileageUnit === 'km'
      ? Math.round(rawMileage * 0.621371)
      : rawMileage
    const { data, error } = await supabase
      .from('cars')
      .insert({
        user_id: user.id,
        year: parseInt(form.year) || null,
        make: form.make.trim() || null,
        make_id: selectedMakeId,
        model: form.model.trim() || null,
        model_id: selectedModelId,
        trim: form.trim.trim() || null,
        nickname,
        current_mileage: mileageInMiles,
        purchase_date: form.purchaseDate || null,
        purchase_price: parseFloat(form.purchasePrice) || null,
        purchase_currency: form.purchaseCurrency || 'USD',
        mileage_at_purchase: parseInt(form.mileageAtPurchase) || null,
        purchase_dealer: form.wherePurchased.trim() || null,
        purchase_story: form.originStory.trim() || null,
      })
      .select('id, year, make, model, trim, nickname, current_mileage')
      .single()
    setSaving(false)
    if (error || !data) { setSaveErr(error?.message ?? 'Save failed'); return }
    const updated = [...cars, data]
    setCars(updated); setShowAdd(false)
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el) el.scrollLeft = (updated.length - 1) * el.clientWidth
    })
    if (updated.length > 1) setShowHints(true)
  }

  const ctaStyle = (active: boolean): React.CSSProperties => ({
    width: '100%', padding: '14px',
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
        @keyframes storyReveal { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .hide-scrollbar{scrollbar-width:none}
        .hide-scrollbar::-webkit-scrollbar{display:none}
        .form-scroll{-webkit-overflow-scrolling:touch;scrollbar-width:none}
        .form-scroll::-webkit-scrollbar{display:none}
        .list-item:active{background:rgba(255,255,255,0.05)!important}
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
                      <p style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 46, color: COLOR_HEADER_TITLE, margin: '0 0 8px', lineHeight: 1.05, letterSpacing: '-0.01em' }}>{car.nickname}</p>
                      <p style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 13, color: 'rgba(245,245,245,0.55)', margin: '0 0 4px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        {[car.year, car.make, car.model].filter(Boolean).join(' ')}
                      </p>
                      {car.trim && <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 11, color: 'rgba(245,245,245,0.3)', margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{car.trim}</p>}
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
                <div style={{ flex: '0 0 100%', height: '100%', scrollSnapAlign: 'start', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: SPACE_MD, paddingBottom: '15%' }}>
                  <button onClick={openAdd} style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(200,102,26,0.22)', border: '1.5px solid rgba(200,102,26,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', animation: 'addCarPulse 3s ease-in-out infinite' }}>
                    <span style={{ color: COLOR_ACCENT, fontSize: 28, fontWeight: 300, lineHeight: 1, marginTop: -1, textShadow: '0 0 10px rgba(200,102,26,0.9)' }}>+</span>
                  </button>
                  <p style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 15, color: 'rgba(245,245,245,0.45)', margin: 0 }}>Add another car</p>
                </div>
              </div>

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
      <div style={{ position: 'absolute', inset: 0, background: COLOR_CAVITY_BG, zIndex: 20, transform: showAdd ? 'translateY(0)' : 'translateY(100%)', transition: `transform 380ms ${EASING_SETTLE}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <GarageBg />
        <Header onBack={() => step === 2 ? setStep(1) : setShowAdd(false)} />

        {/* ── STEP 1 ── */}
        {step === 1 && (
          <>
            <div className="form-scroll" style={{ flex: 1, overflowY: 'auto', padding: `${SPACE_MD}px ${SPACE_MD}px 0`, position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', gap: SPACE_XS, marginBottom: SPACE_MD, alignItems: 'center' }}>
                <div style={{ flex: 1, height: 2, background: COLOR_ACCENT }} />
                <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.1)' }} />
                <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.1em', color: COLOR_TEXT_SECONDARY, textTransform: 'uppercase', paddingLeft: SPACE_XS }}>1 / 2</span>
              </div>
              <p style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 22, color: COLOR_HEADER_TITLE, margin: `0 0 ${SPACE_MD}px`, lineHeight: 1.15 }}>
                Tell us about your car.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_SM }}>
                {/* Year */}
                <div style={FIELD}>
                  <span style={LABEL}>Year</span>
                  <button className="list-item" onClick={() => setPicker('year')} style={TAPPABLE}>
                    <span style={{ opacity: form.year ? 1 : 0.35 }}>{form.year || 'Select year…'}</span>
                    <span style={{ color: COLOR_TEXT_SECONDARY, fontSize: 14 }}>›</span>
                  </button>
                </div>

                {/* Make */}
                <div style={FIELD}>
                  <span style={LABEL}>Make{makesLoading && <span style={{ ...OPT, marginLeft: 4 }}>loading…</span>}</span>
                  {allMakes.length > 0 ? (
                    <button className="list-item" onClick={() => setPicker('make')} style={TAPPABLE}>
                      <span style={{ opacity: form.make ? 1 : 0.35 }}>{form.make || 'Select make…'}</span>
                      <span style={{ color: COLOR_TEXT_SECONDARY, fontSize: 14 }}>›</span>
                    </button>
                  ) : (
                    <input
                      type="text" autoCapitalize="words"
                      placeholder={makesLoading ? 'Loading…' : 'e.g. Nissan'}
                      value={form.make}
                      onChange={e => { setForm(f => ({ ...f, make: e.target.value, model: '' })); setSelectedMakeId(null); setMakeModels([]) }}
                      style={INPUT}
                    />
                  )}
                </div>

                {/* Model */}
                <div style={FIELD}>
                  <span style={LABEL}>Model</span>
                  {form.make ? (
                    makeModels.length > 0 ? (
                      <button className="list-item" onClick={() => setPicker('model')} style={TAPPABLE}>
                        <span style={{ opacity: form.model ? 1 : 0.6 }}>{form.model || 'Select model…'}</span>
                        <span style={{ color: COLOR_TEXT_SECONDARY, fontSize: 14 }}>›</span>
                      </button>
                    ) : (
                      // Free-text model when no DB models for this make (custom/free-text make)
                      <input
                        type="text" autoCapitalize="words"
                        placeholder="e.g. Silvia S15"
                        value={form.model}
                        onChange={set('model')}
                        style={INPUT}
                      />
                    )
                  ) : (
                    <button style={{ ...TAPPABLE, opacity: 0.35, cursor: 'default' }}>
                      <span>Select make first</span>
                    </button>
                  )}
                </div>

                {/* Trim + Nickname */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE_SM }}>
                  <div style={FIELD}>
                    <span style={LABEL}>Trim <span style={OPT}>opt</span></span>
                    <input type="text" autoCapitalize="words" value={form.trim} onChange={set('trim')} style={INPUT} />
                  </div>
                  <div style={FIELD}>
                    <span style={LABEL}>Nickname <span style={OPT}>opt</span></span>
                    <input type="text" autoCapitalize="words" value={form.nickname} onChange={set('nickname')} style={INPUT} />
                  </div>
                </div>

                {/* Mileage + unit toggle */}
                <div style={FIELD}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={LABEL}>Current Mileage</span>
                    <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.07)', padding: 3, borderRadius: 5 }}>
                      {(['mi', 'km'] as const).map(unit => (
                        <button
                          key={unit}
                          type="button"
                          onClick={() => setForm(f => ({ ...f, mileageUnit: unit }))}
                          style={{
                            padding: '3px 9px', border: 'none', borderRadius: 3,
                            background: form.mileageUnit === unit ? COLOR_ACCENT : 'transparent',
                            color: form.mileageUnit === unit ? '#fff' : COLOR_TEXT_SECONDARY,
                            fontFamily: FONT_UI, fontWeight: 700, fontSize: 10,
                            letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
                            transition: '150ms ease',
                          }}
                        >
                          {unit}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input type="number" inputMode="numeric" value={form.mileage} onChange={set('mileage')} style={INPUT} />
                </div>
              </div>

              {saveErr && <p style={{ fontFamily: FONT_UI, fontSize: 12, color: '#e05555', marginTop: SPACE_SM }}>{saveErr}</p>}
              <div style={{ height: SPACE_MD }} />
            </div>

            <div style={{ flexShrink: 0, padding: `${SPACE_SM}px ${SPACE_MD}px ${SPACE_LG}px`, borderTop: '1px solid rgba(255,255,255,0.04)', background: 'rgba(5,5,7,0.96)', position: 'relative', zIndex: 5 }}>
              <button disabled={!step1Valid} onClick={() => setStep(2)} style={ctaStyle(step1Valid)}>Next</button>
            </div>
          </>
        )}

        {/* ── STEP 2 ── */}
        {step === 2 && (
          <>
            <div className="form-scroll" style={{ flex: 1, overflowY: 'auto', padding: `${SPACE_MD}px ${SPACE_MD}px 0`, position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', gap: SPACE_XS, marginBottom: SPACE_LG, alignItems: 'center' }}>
                <div style={{ flex: 1, height: 2, background: COLOR_ACCENT }} />
                <div style={{ flex: 1, height: 2, background: COLOR_ACCENT }} />
                <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.1em', color: COLOR_TEXT_SECONDARY, textTransform: 'uppercase', paddingLeft: SPACE_XS }}>2 / 2</span>
              </div>

              <div style={{ marginBottom: SPACE_LG, animation: 'storyReveal 700ms ease-out both' }}>
                <p style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 28, color: COLOR_HEADER_TITLE, margin: '0 0 6px', lineHeight: 1.1 }}>Tell your story.</p>
                <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 12, color: 'rgba(245,245,245,0.38)', letterSpacing: '0.06em', margin: 0 }}>Every build has a beginning.</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_SM, animation: 'storyReveal 500ms ease-out 280ms both' }}>
                <div style={FIELD}>
                  <span style={LABEL}>Purchase Date <span style={OPT}>opt</span></span>
                  <input type="date" value={form.purchaseDate} onChange={set('purchaseDate')} style={{ ...INPUT, WebkitAppearance: 'auto' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 76px', gap: SPACE_SM }}>
                  <div style={FIELD}>
                    <span style={LABEL}>Purchase Price <span style={OPT}>opt</span></span>
                    <input type="number" inputMode="decimal" value={form.purchasePrice} onChange={set('purchasePrice')} style={INPUT} />
                  </div>
                  <div style={FIELD}>
                    <span style={LABEL}>Currency</span>
                    <select value={form.purchaseCurrency} onChange={set('purchaseCurrency')} style={{ ...INPUT, WebkitAppearance: 'auto' }}>
                      {['USD','CAD','GBP','EUR','JPY','AUD','NZD'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div style={FIELD}>
                  <span style={LABEL}>Mileage at Purchase <span style={OPT}>opt</span></span>
                  <input type="number" inputMode="numeric" value={form.mileageAtPurchase} onChange={set('mileageAtPurchase')} style={INPUT} />
                </div>
                <div style={FIELD}>
                  <span style={LABEL}>Where you got it <span style={OPT}>opt</span></span>
                  <input type="text" autoCapitalize="words" value={form.wherePurchased} onChange={set('wherePurchased')} style={INPUT} />
                </div>
                <div style={FIELD}>
                  <span style={LABEL}>Origin story <span style={OPT}>opt</span></span>
                  <textarea
                    value={form.originStory}
                    onChange={set('originStory')}
                    rows={4}
                    placeholder={'The hunt, the first drive, the reason you kept it. Write it all down.'}
                    style={{ ...INPUT, resize: 'none', lineHeight: 1.65 } as React.CSSProperties}
                  />
                </div>
              </div>

              {saveErr && <p style={{ fontFamily: FONT_UI, fontSize: 12, color: '#e05555', marginTop: SPACE_SM }}>{saveErr}</p>}
              <div style={{ height: SPACE_MD }} />
            </div>

            <div style={{ flexShrink: 0, padding: `${SPACE_SM}px ${SPACE_MD}px ${SPACE_LG}px`, borderTop: '1px solid rgba(255,255,255,0.04)', background: 'rgba(5,5,7,0.96)', display: 'flex', flexDirection: 'column', gap: SPACE_SM, position: 'relative', zIndex: 5 }}>
              <button disabled={saving} onClick={saveCar} style={ctaStyle(true)}>{saving ? 'Placing in garage…' : 'Place in Garage'}</button>
              <button disabled={saving} onClick={saveCar} style={{ width: '100%', padding: '10px', background: 'none', border: 'none', color: COLOR_TEXT_SECONDARY, fontFamily: FONT_UI, fontWeight: 600, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: saving ? 'default' : 'pointer' }}>
                Skip Story
              </button>
            </div>
          </>
        )}

        {/* ── PICKER OVERLAYS ── */}
        {picker === 'year' && (
          <YearPickerSheet
            value={form.year}
            onSelect={v => setForm(f => ({ ...f, year: v }))}
            onClose={() => setPicker(null)}
          />
        )}
        {picker === 'make' && (
          <MakePickerSheet
            allMakes={allMakes}
            onSelect={onMakeSelect}
            onClose={() => setPicker(null)}
            onFreeText={name => { setForm(f => ({ ...f, make: name, model: '' })); setSelectedMakeId(null); setMakeModels([]) }}
          />
        )}
        {picker === 'model' && makeModels.length > 0 && (
          <ModelPickerSheet
            models={makeModels}
            onSelect={onModelSelect}
            onClose={() => setPicker(null)}
            onFreeText={name => { setForm(f => ({ ...f, model: name })); setSelectedModelId(null) }}
          />
        )}
      </div>
    </div>
  )
}
