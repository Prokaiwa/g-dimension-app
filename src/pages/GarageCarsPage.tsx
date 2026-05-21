// Route: /garage/cars — My Cars carousel + inline Add Car flow
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import garagePlaceholder from '../assets/garage_placeholder.png'
import iconChoose from '../assets/icons/car-carousel/choose.png'
import iconDetails from '../assets/icons/car-carousel/details.png'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { setActiveCar } from '../lib/activeCar'
import { prewarmBackgroundRemoval } from '../lib/backgroundRemoval'
import { uploadGaragePhoto } from '../lib/carPhoto'
import CarPhotoUpload from '../components/CarPhotoUpload'
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
  nickname: string; current_mileage: number | null; color: string | null
  garage_photo_url: string | null
}

const CAR_COLUMNS = 'id, year, make, model, trim, nickname, current_mileage, color, garage_photo_url'
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

// ── Car stage ────────────────────────────────────────────────────────────────
// Renders the car cutout with a shape-matched contact shadow and a connected
// reflection. All three layers are the same transparent image — the shadow is
// it blackened, squashed flat and blurred; the reflection is it flipped and
// faded — so they adapt to whatever car is uploaded, with no per-image tuning.
function CarStage({ src }: { src: string }) {
  const LAYER: React.CSSProperties = {
    width: '100%',
    maxHeight: 220,
    objectFit: 'contain',
    objectPosition: 'bottom',
    display: 'block',
  }
  return (
    <div style={{ position: 'relative', width: '88%', display: 'flex', justifyContent: 'center' }}>
      {/* Contact shadow — silhouette blackened, squashed flat, blurred */}
      <img
        src={src}
        alt=""
        aria-hidden
        style={{
          ...LAYER,
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          transform: 'scaleY(0.09)',
          transformOrigin: '50% 100%',
          filter: 'brightness(0) blur(7px)',
          opacity: 0.5,
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />
      {/* Reflection — the car flipped below its own base, faded out */}
      <img
        src={src}
        alt=""
        aria-hidden
        style={{
          ...LAYER,
          position: 'absolute',
          left: 0,
          right: 0,
          top: '100%',
          transform: 'scaleY(-1)',
          transformOrigin: '50% 0%',
          WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 55%)',
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 55%)',
          filter: 'blur(1px)',
          opacity: 0.45,
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />
      {/* The car */}
      <img src={src} alt="Vehicle" style={{ ...LAYER, position: 'relative', zIndex: 2 }} />
    </div>
  )
}

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
    <div style={{ position: 'absolute', top: HEADER_HEIGHT, bottom: 0, left: 0, right: 0, zIndex: 40, display: 'flex', flexDirection: 'column', background: COLOR_CAVITY_BG }}>
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
function FreeTextSheet({ label, placeholder, onDone, onBack: _onBack }: { label: string; placeholder: string; onDone: (text: string) => void; onBack: () => void }) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { setTimeout(() => ref.current?.focus(), 120) }, [])
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', background: COLOR_CAVITY_BG }}>
      <div style={{ padding: `${SPACE_XS}px ${SPACE_MD}px`, borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: COLOR_TEXT_SECONDARY }}>{label}</span>
      </div>
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
    <div style={{ position: 'absolute', top: HEADER_HEIGHT, bottom: 0, left: 0, right: 0, zIndex: 40, display: 'flex', flexDirection: 'column', background: COLOR_CAVITY_BG }}>
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
  const [search, setSearch] = useState('')
  const [showOther, setShowOther] = useState(false)

  const filteredNames = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q ? models.filter(m => m.name.toLowerCase().includes(q)) : models
    return [...filtered.map(m => m.name), 'Other']
  }, [search, models])

  const [local, setLocal] = useState(filteredNames[0] ?? 'Other')

  useEffect(() => {
    setLocal(filteredNames[0] ?? 'Other')
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

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
    <div style={{ position: 'absolute', top: HEADER_HEIGHT, bottom: 0, left: 0, right: 0, zIndex: 40, display: 'flex', flexDirection: 'column', background: COLOR_CAVITY_BG }}>
      <div style={{ padding: `${SPACE_SM}px ${SPACE_MD}px`, background: '#0a0a0c', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search models…"
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
function Header({ onBack, subtitle }: { onBack: () => void; subtitle?: string }) {
  return (
    <div style={{ position: 'relative', height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 10, paddingRight: 14, flexShrink: 0, zIndex: 10, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px 4px 4px', display: 'flex', alignItems: 'center' }}>
          <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
        </button>
        <span style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 22, color: COLOR_HEADER_TITLE, letterSpacing: '0.01em' }}>Garage</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
        {subtitle && <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, color: COLOR_HEADER_WARM, letterSpacing: '0.04em', opacity: 0.75, display: 'flex', alignItems: 'center', paddingRight: 10 }}>{subtitle}</span>}
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
  const [showDetails, setShowDetails]         = useState(false)
  const [detailsData, setDetailsData]         = useState<Record<string, string> | null>(null)
  const [detailsSaving, setDetailsSaving]     = useState(false)
  const [detailsErr, setDetailsErr]           = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete]     = useState(false)
  const [pressedAction, setPressedAction]     = useState<string | null>(null)
  const [addPhotoBlob, setAddPhotoBlob]       = useState<Blob | null>(null)
  const [detailsPhotoBlob, setDetailsPhotoBlob] = useState<Blob | null>(null)
  const [detailsPhotoUrl, setDetailsPhotoUrl] = useState<string | null>(null)
  const [photoFieldKey, setPhotoFieldKey]     = useState(0)
  const scrollRef                             = useRef<HTMLDivElement>(null)

  // Begin downloading the background-removal model so it's ready by the
  // time the user opens the photo picker.
  useEffect(() => { prewarmBackgroundRemoval() }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { setLoading(false); return }
      supabase
        .from('cars')
        .select(CAR_COLUMNS)
        .is('deleted_at', null)
        .order('created_at')
        .then(({ data }) => {
          if (data) { setCars(data); if (data.length > 1) setShowHints(true) }
          setLoading(false)
        })
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
    setAddPhotoBlob(null); setPhotoFieldKey(k => k + 1)
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
      .select(CAR_COLUMNS)
      .single()
    if (error || !data) { setSaving(false); setSaveErr(error?.message ?? 'Save failed'); return }
    let savedCar: Car = data
    if (addPhotoBlob) {
      try {
        const url = await uploadGaragePhoto(user.id, data.id, addPhotoBlob)
        await supabase.from('cars').update({ garage_photo_url: url }).eq('id', data.id)
        savedCar = { ...data, garage_photo_url: url }
      } catch { /* photo upload failure is non-fatal — the car is still saved */ }
    }
    setSaving(false)
    const updated = [...cars, savedCar]
    setCars(updated); setShowAdd(false)
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el) el.scrollLeft = (updated.length - 1) * el.clientWidth
    })
    if (updated.length > 1) setShowHints(true)
  }

  async function openDetails() {
    const car = cars[activeIdx]
    if (!car) return
    const { data } = await supabase
      .from('cars')
      .select('color, paint_code, nickname, trim, current_mileage, chassis_code, vin, license_plate, engine_type, forced_induction, horsepower, torque, transmission, drivetrain, oil_type, tire_size, battery_model, purchase_date, purchase_price, purchase_currency, mileage_at_purchase, purchase_dealer, purchase_story, garage_photo_url')
      .eq('id', car.id)
      .single()
    const autoNick = [car.year, car.make, car.model].filter(Boolean).join(' ')
    setDetailsData({
      color:             data?.color              ?? '',
      colorCode:         data?.paint_code ?? '',
      nickname:          data?.nickname === autoNick ? '' : (data?.nickname ?? ''),
      trim:              data?.trim               ?? '',
      mileage:           data?.current_mileage    != null ? String(data.current_mileage) : '',
      mileageUnit:       'mi',
      chassisCode:       data?.chassis_code       ?? '',
      vin:               data?.vin                ?? '',
      licensePlate:      data?.license_plate      ?? '',
      engineType:        data?.engine_type        ?? '',
      forcedInduction:   data?.forced_induction   ?? 'none',
      horsepower:        data?.horsepower         != null ? String(data.horsepower) : '',
      torque:            data?.torque             != null ? String(data.torque) : '',
      transmission:      data?.transmission       ?? '',
      drivetrain:        data?.drivetrain         ?? '',
      oilType:           data?.oil_type           ?? '',
      tireSize:          data?.tire_size          ?? '',
      batteryModel:      data?.battery_model      ?? '',
      purchaseDate:      data?.purchase_date      ?? '',
      purchasePrice:     data?.purchase_price     != null ? String(data.purchase_price)  : '',
      purchaseCurrency:  data?.purchase_currency  ?? 'USD',
      mileageAtPurchase: data?.mileage_at_purchase != null ? String(data.mileage_at_purchase) : '',
      wherePurchased:    data?.purchase_dealer    ?? '',
      originStory:       data?.purchase_story     ?? '',
    })
    setDetailsPhotoUrl(data?.garage_photo_url ?? car.garage_photo_url ?? null)
    setDetailsPhotoBlob(null)
    setPhotoFieldKey(k => k + 1)
    setDetailsErr(null)
    setConfirmDelete(false)
    setShowDetails(true)
  }

  async function saveDetails() {
    if (!detailsData) return
    const car = cars[activeIdx]
    setDetailsSaving(true); setDetailsErr(null)
    const rawMileage = parseInt(detailsData.mileage) || null
    const mileageInMiles = rawMileage && detailsData.mileageUnit === 'km'
      ? Math.round(rawMileage * 0.621371) : rawMileage
    const update: Record<string, unknown> = {
        color:             detailsData.color.trim()          || null,
        paint_code:        (detailsData.colorCode ?? '').trim() || null,
        nickname:          detailsData.nickname.trim()       || [car.year, car.model].filter(Boolean).join(' '),
        trim:              detailsData.trim.trim()           || null,
        current_mileage:   mileageInMiles,
        chassis_code:      detailsData.chassisCode?.trim()   || null,
        vin:               detailsData.vin?.trim()           || null,
        license_plate:     detailsData.licensePlate?.trim()  || null,
        engine_type:       detailsData.engineType?.trim()    || null,
        forced_induction:  detailsData.forcedInduction       || 'none',
        horsepower:        parseInt(detailsData.horsepower)  || null,
        torque:            parseInt(detailsData.torque)      || null,
        transmission:      detailsData.transmission          || null,
        drivetrain:        detailsData.drivetrain            || null,
        oil_type:          detailsData.oilType?.trim()       || null,
        tire_size:         detailsData.tireSize?.trim()      || null,
        battery_model:     detailsData.batteryModel?.trim()  || null,
        purchase_date:     detailsData.purchaseDate          || null,
        purchase_price:    parseFloat(detailsData.purchasePrice) || null,
        purchase_currency: detailsData.purchaseCurrency      || 'USD',
        mileage_at_purchase: parseInt(detailsData.mileageAtPurchase) || null,
        purchase_dealer:   detailsData.wherePurchased.trim() || null,
        purchase_story:    detailsData.originStory.trim()    || null,
    }
    let newPhotoUrl: string | null = null
    if (detailsPhotoBlob) {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          newPhotoUrl = await uploadGaragePhoto(user.id, car.id, detailsPhotoBlob)
          update.garage_photo_url = newPhotoUrl
        }
      } catch { /* photo upload failure is non-fatal — other changes still save */ }
    }
    const { error } = await supabase
      .from('cars')
      .update(update)
      .eq('id', car.id)
    setDetailsSaving(false)
    if (error) { setDetailsErr(error.message); return }
    setCars(prev => prev.map(c => c.id === car.id
      ? { ...c, color: detailsData.color.trim() || null, trim: detailsData.trim.trim() || null,
          nickname: detailsData.nickname.trim() || [car.year, car.model].filter(Boolean).join(' '),
          current_mileage: mileageInMiles,
          garage_photo_url: newPhotoUrl ?? c.garage_photo_url }
      : c))
    setShowDetails(false)
  }

  async function removeCar() {
    const car = cars[activeIdx]
    setDetailsSaving(true); setDetailsErr(null)
    const { error } = await supabase
      .from('cars').update({ deleted_at: new Date().toISOString() }).eq('id', car.id)
    setDetailsSaving(false)
    if (error) { setDetailsErr(error.message); return }
    const updated = cars.filter(c => c.id !== car.id)
    setCars(updated)
    setActiveIdx(Math.max(0, activeIdx - 1))
    setShowDetails(false)
    setConfirmDelete(false)
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
      <Header onBack={() => navigate('/garage')} subtitle={!showAdd && cars[activeIdx] ? [cars[activeIdx].year, cars[activeIdx].model].filter(Boolean).join(' ') : undefined} />

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
                  <div key={car.id} style={{ flex: '0 0 100%', height: '100%', scrollSnapAlign: 'start', position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                    {/* Top bar — logo + model */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${SPACE_MD}px ${SPACE_MD}px ${SPACE_XS}px`, flexShrink: 0, position: 'relative', zIndex: 2 }}>
                      <img
                        src={`/manufacturer_logos/${(car.make ?? '').toLowerCase()}.png`}
                        alt={car.make ?? ''}
                        style={{ height: 51, width: 'auto', objectFit: 'contain', mixBlendMode: 'screen' }}
                        onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
                      />
                      <span style={{ fontFamily: FONT_UI, fontStyle: 'italic', fontWeight: 800, fontSize: 33, color: 'rgba(245,240,228,0.95)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                        {car.model}
                      </span>
                    </div>

                    {/* Spotlight + car image */}
                    <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                      <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 100% 70% at 50% 45%, #484848 0%, #282828 55%, #0d0d0f 100%)' }} />
                      <div aria-hidden style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '42%', background: 'linear-gradient(to bottom, transparent 0%, rgba(220,218,214,0.06) 65%, rgba(220,218,214,0.13) 100%)' }} />
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: '8%', zIndex: 2 }}>
                        <CarStage src={car.garage_photo_url || garagePlaceholder} />
                      </div>
                      <div style={{ position: 'absolute', top: SPACE_XS, right: SPACE_MD, fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.14em', color: 'rgba(245,245,245,0.25)', textTransform: 'uppercase', zIndex: 3 }}>
                        {String(i + 1).padStart(2, '0')} / {String(cars.length).padStart(2, '0')}
                      </div>
                    </div>

                    {/* Info strip */}
                    <div style={{ flexShrink: 0, background: 'rgba(5,5,7,0.9)', backdropFilter: 'blur(10px)', position: 'relative', zIndex: 2 }}>
                      {/* Color */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: `5px ${SPACE_MD}px`, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        {car.color
                          ? <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: COLOR_TEXT_SECONDARY }}>{car.color}</span>
                          : <span style={{ fontFamily: FONT_UI, fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.18)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>+ Add color</span>
                        }
                      </div>
                      {/* Year / Trim / Mileage */}
                      <div style={{ display: 'flex', gap: SPACE_LG, alignItems: 'center', padding: `7px ${SPACE_MD}px`, borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.015)' }}>
                        <div style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
                          <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: COLOR_TEXT_SECONDARY }}>Year</span>
                          <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 15, color: 'rgba(245,240,228,0.9)' }}>{car.year}</span>
                        </div>
                        {car.trim && (
                          <div style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
                            <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: COLOR_TEXT_SECONDARY }}>Trim</span>
                            <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 15, color: 'rgba(245,240,228,0.9)' }}>{car.trim}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
                          <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: COLOR_TEXT_SECONDARY }}>Mileage</span>
                          <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 15, color: 'rgba(245,240,228,0.9)' }}>{car.current_mileage != null ? car.current_mileage.toLocaleString() : '—'}</span>
                          <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: COLOR_TEXT_SECONDARY }}>mi</span>
                        </div>
                      </div>
                      {/* Actions */}
                      <div style={{ display: 'flex', justifyContent: 'center', gap: SPACE_XL * 2, padding: `${SPACE_XS}px ${SPACE_MD}px ${SPACE_MD}px`, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        {([
                          { src: iconChoose, label: 'Choose', onPress: () => { setActiveCar(cars[activeIdx].id).then(() => navigate('/garage')) } },
                          { src: iconDetails, label: 'Details', onPress: openDetails },
                        ] as const).map(({ src, label, onPress }) => (
                          <button key={label} onClick={onPress}
                            onPointerDown={() => setPressedAction(label)}
                            onPointerUp={() => setPressedAction(null)}
                            onPointerLeave={() => setPressedAction(null)}
                            onPointerCancel={() => setPressedAction(null)}
                            style={{
                              display: 'flex', flexDirection: 'column', alignItems: 'center',
                              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                              WebkitTapHighlightColor: 'transparent',
                              touchAction: 'manipulation', userSelect: 'none',
                              transform: pressedAction === label ? 'scale(0.92)' : 'scale(1)',
                              transition: pressedAction === label ? 'transform 80ms ease-out' : 'transform 200ms cubic-bezier(0.22,1,0.36,1)',
                            }}>
                            <div style={{ position: 'relative', width: 101, height: 101 }}>
                              <div style={{ position: 'absolute', top: 74, left: 50, width: 57, height: 50, transform: 'translate(-50%,-50%) rotate(25deg) skewX(-14deg)', background: 'rgba(0,0,0,1)', opacity: 0.65, filter: 'blur(4px)' }} />
                              <img src={src} alt={label} draggable={false} style={{ position: 'absolute', top: 0, left: 0, width: 101, height: 101, objectFit: 'contain', pointerEvents: 'none' }} />
                            </div>
                            <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, color: 'rgba(245,245,245,0.8)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: -14, position: 'relative', zIndex: 1 }}>{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

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

      {/* ── DETAILS OVERLAY ── */}
      <div style={{ position: 'absolute', inset: 0, background: COLOR_CAVITY_BG, zIndex: 20, transform: showDetails ? 'translateY(0)' : 'translateY(100%)', transition: `transform 380ms ${EASING_SETTLE}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <GarageBg />
        <Header onBack={() => confirmDelete ? setConfirmDelete(false) : setShowDetails(false)} />

        {!confirmDelete ? (
          <>
            <div className="form-scroll" style={{ flex: 1, overflowY: 'auto', padding: `${SPACE_MD}px ${SPACE_MD}px 0`, position: 'relative', zIndex: 1 }}>
              {cars[activeIdx] && (
                <div style={{ marginBottom: SPACE_LG }}>
                  <p style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 28, color: COLOR_HEADER_TITLE, margin: '0 0 4px', lineHeight: 1.1 }}>
                    {cars[activeIdx].year} {cars[activeIdx].model}
                  </p>
                  <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, color: 'rgba(245,245,245,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>
                    {cars[activeIdx].make}
                  </p>
                </div>
              )}
              {detailsData && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_SM }}>
                  <div style={FIELD}>
                    <span style={LABEL}>Car Photo <span style={OPT}>opt</span></span>
                    <CarPhotoUpload key={`details-${photoFieldKey}`} currentUrl={detailsPhotoUrl} onChange={setDetailsPhotoBlob} />
                  </div>
                  <div style={FIELD}>
                    <span style={LABEL}>Paint Color <span style={OPT}>opt</span></span>
                    <input type="text" autoCapitalize="words" placeholder="e.g. Midnight Purple II, Championship White" value={detailsData.color} onChange={e => setDetailsData(d => ({ ...d!, color: e.target.value }))} style={INPUT} />
                  </div>
                  <div style={FIELD}>
                    <span style={LABEL}>Paint Color Code <span style={OPT}>opt</span></span>
                    <input type="text" autoCapitalize="characters" placeholder="e.g. TT2, NH-0, A66" value={detailsData.colorCode ?? ''} onChange={e => setDetailsData(d => ({ ...d!, colorCode: e.target.value }))} style={INPUT} />
                  </div>
                  <div style={FIELD}>
                    <span style={LABEL}>Nickname <span style={OPT}>opt</span></span>
                    <input type="text" autoCapitalize="words" placeholder="e.g. The S14, Project R" value={detailsData.nickname} onChange={e => setDetailsData(d => ({ ...d!, nickname: e.target.value }))} style={INPUT} />
                  </div>
                  <div style={FIELD}>
                    <span style={LABEL}>Trim <span style={OPT}>opt</span></span>
                    <input type="text" autoCapitalize="words" value={detailsData.trim} onChange={e => setDetailsData(d => ({ ...d!, trim: e.target.value }))} style={INPUT} />
                  </div>
                  <div style={FIELD}>
                    <span style={LABEL}>Current Mileage</span>
                    <div style={{ display: 'flex', gap: SPACE_SM }}>
                      <input type="number" inputMode="numeric" value={detailsData.mileage} onChange={e => setDetailsData(d => ({ ...d!, mileage: e.target.value }))} style={{ ...INPUT, flex: 1 }} />
                      <button type="button" onClick={() => setDetailsData(d => ({ ...d!, mileageUnit: d!.mileageUnit === 'mi' ? 'km' : 'mi' }))} style={{ flexShrink: 0, padding: '8px 12px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: COLOR_HEADER_WARM, fontFamily: FONT_UI, fontWeight: 700, fontSize: 12, letterSpacing: '0.06em', cursor: 'pointer', borderRadius: 2 }}>
                        {detailsData.mileageUnit}
                      </button>
                    </div>
                  </div>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: `${SPACE_XS}px 0` }} />
                  <span style={{ ...LABEL, opacity: 0.4 }}>Vehicle Specs</span>
                  <div style={FIELD}>
                    <span style={LABEL}>Chassis Code <span style={OPT}>opt</span></span>
                    <input type="text" autoCapitalize="characters" placeholder="e.g. S14, BNR32, JZA80" value={detailsData.chassisCode ?? ''} onChange={e => setDetailsData(d => ({ ...d!, chassisCode: e.target.value }))} style={INPUT} />
                  </div>
                  <div style={FIELD}>
                    <span style={LABEL}>VIN <span style={OPT}>opt</span></span>
                    <input type="text" autoCapitalize="characters" placeholder="17-character VIN" value={detailsData.vin ?? ''} onChange={e => setDetailsData(d => ({ ...d!, vin: e.target.value }))} style={INPUT} />
                  </div>
                  <div style={FIELD}>
                    <span style={LABEL}>License Plate <span style={OPT}>opt</span></span>
                    <input type="text" autoCapitalize="characters" value={detailsData.licensePlate ?? ''} onChange={e => setDetailsData(d => ({ ...d!, licensePlate: e.target.value }))} style={INPUT} />
                  </div>
                  <div style={FIELD}>
                    <span style={LABEL}>Engine Type <span style={OPT}>opt</span></span>
                    <input type="text" autoCapitalize="characters" placeholder="e.g. SR20DET, 2JZ-GTE, RB26" value={detailsData.engineType ?? ''} onChange={e => setDetailsData(d => ({ ...d!, engineType: e.target.value }))} style={INPUT} />
                  </div>
                  <div style={FIELD}>
                    <span style={LABEL}>Forced Induction</span>
                    <select value={detailsData.forcedInduction ?? 'none'} onChange={e => setDetailsData(d => ({ ...d!, forcedInduction: e.target.value }))} style={{ ...INPUT, WebkitAppearance: 'auto' as any }}>
                      <option value="none">None (N/A)</option>
                      <option value="turbo">Turbo</option>
                      <option value="twin-turbo">Twin Turbo</option>
                      <option value="supercharged">Supercharged</option>
                      <option value="e-boost">E-Boost</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE_SM }}>
                    <div style={FIELD}>
                      <span style={LABEL}>Horsepower <span style={OPT}>hp</span></span>
                      <input type="number" inputMode="numeric" placeholder="276" value={detailsData.horsepower ?? ''} onChange={e => setDetailsData(d => ({ ...d!, horsepower: e.target.value }))} style={INPUT} />
                    </div>
                    <div style={FIELD}>
                      <span style={LABEL}>Torque <span style={OPT}>lb-ft</span></span>
                      <input type="number" inputMode="numeric" placeholder="260" value={detailsData.torque ?? ''} onChange={e => setDetailsData(d => ({ ...d!, torque: e.target.value }))} style={INPUT} />
                    </div>
                  </div>
                  <div style={FIELD}>
                    <span style={LABEL}>Transmission</span>
                    <select value={detailsData.transmission ?? ''} onChange={e => setDetailsData(d => ({ ...d!, transmission: e.target.value }))} style={{ ...INPUT, WebkitAppearance: 'auto' as any }}>
                      <option value="">— select —</option>
                      <option value="manual">Manual</option>
                      <option value="automatic">Automatic</option>
                      <option value="sequential">Sequential</option>
                      <option value="cvt">CVT</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div style={FIELD}>
                    <span style={LABEL}>Drivetrain</span>
                    <select value={detailsData.drivetrain ?? ''} onChange={e => setDetailsData(d => ({ ...d!, drivetrain: e.target.value }))} style={{ ...INPUT, WebkitAppearance: 'auto' as any }}>
                      <option value="">— select —</option>
                      <option value="rwd">RWD</option>
                      <option value="fwd">FWD</option>
                      <option value="awd">AWD</option>
                      <option value="4wd">4WD</option>
                    </select>
                  </div>
                  <div style={FIELD}>
                    <span style={LABEL}>Oil Type <span style={OPT}>opt</span></span>
                    <input type="text" placeholder="e.g. 5W-30 Full Synthetic" value={detailsData.oilType ?? ''} onChange={e => setDetailsData(d => ({ ...d!, oilType: e.target.value }))} style={INPUT} />
                  </div>
                  <div style={FIELD}>
                    <span style={LABEL}>Tire Size <span style={OPT}>opt</span></span>
                    <input type="text" autoCapitalize="characters" placeholder="e.g. 225/45R17" value={detailsData.tireSize ?? ''} onChange={e => setDetailsData(d => ({ ...d!, tireSize: e.target.value }))} style={INPUT} />
                  </div>
                  <div style={FIELD}>
                    <span style={LABEL}>Battery Model <span style={OPT}>opt</span></span>
                    <input type="text" autoCapitalize="characters" placeholder="e.g. Optima Red Top 34/78" value={detailsData.batteryModel ?? ''} onChange={e => setDetailsData(d => ({ ...d!, batteryModel: e.target.value }))} style={INPUT} />
                  </div>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: `${SPACE_XS}px 0` }} />
                  <span style={{ ...LABEL, opacity: 0.4 }}>Purchase Info</span>
                  <div style={FIELD}>
                    <span style={LABEL}>Purchase Date <span style={OPT}>opt</span></span>
                    <input type="date" value={detailsData.purchaseDate} onChange={e => setDetailsData(d => ({ ...d!, purchaseDate: e.target.value }))} min="1900-01-01" max="2030-12-31" style={{ ...INPUT, WebkitAppearance: 'auto' as any }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 76px', gap: SPACE_SM }}>
                    <div style={FIELD}>
                      <span style={LABEL}>Purchase Price <span style={OPT}>opt</span></span>
                      <input type="number" inputMode="decimal" value={detailsData.purchasePrice} onChange={e => setDetailsData(d => ({ ...d!, purchasePrice: e.target.value }))} style={INPUT} />
                    </div>
                    <div style={FIELD}>
                      <span style={LABEL}>Currency</span>
                      <select value={detailsData.purchaseCurrency} onChange={e => setDetailsData(d => ({ ...d!, purchaseCurrency: e.target.value }))} style={{ ...INPUT, WebkitAppearance: 'auto' as any }}>
                        {['USD','CAD','GBP','EUR','JPY','AUD','NZD'].map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={FIELD}>
                    <span style={LABEL}>Mileage at Purchase <span style={OPT}>opt</span></span>
                    <input type="number" inputMode="numeric" value={detailsData.mileageAtPurchase} onChange={e => setDetailsData(d => ({ ...d!, mileageAtPurchase: e.target.value }))} style={INPUT} />
                  </div>
                  <div style={FIELD}>
                    <span style={LABEL}>Where you got it <span style={OPT}>opt</span></span>
                    <input type="text" autoCapitalize="words" placeholder="e.g. private party, dealer, gift…" value={detailsData.wherePurchased} onChange={e => setDetailsData(d => ({ ...d!, wherePurchased: e.target.value }))} style={INPUT} />
                  </div>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: `${SPACE_XS}px 0` }} />
                  <div style={FIELD}>
                    <span style={LABEL}>Origin Story <span style={OPT}>opt</span></span>
                    <textarea value={detailsData.originStory} onChange={e => setDetailsData(d => ({ ...d!, originStory: e.target.value }))} rows={4} placeholder="The hunt, the first drive, the reason you kept it." style={{ ...INPUT, resize: 'none', lineHeight: 1.65 } as React.CSSProperties} />
                  </div>
                </div>
              )}
              {detailsErr && <p style={{ fontFamily: FONT_UI, fontSize: 12, color: '#e05555', marginTop: SPACE_SM }}>{detailsErr}</p>}
              <div style={{ height: SPACE_MD }} />
            </div>
            <div style={{ flexShrink: 0, padding: `${SPACE_SM}px ${SPACE_MD}px ${SPACE_LG}px`, borderTop: '1px solid rgba(255,255,255,0.04)', background: 'rgba(5,5,7,0.96)', display: 'flex', flexDirection: 'column', gap: SPACE_SM, position: 'relative', zIndex: 5 }}>
              <button disabled={detailsSaving} onClick={saveDetails} style={ctaStyle(true)}>{detailsSaving ? 'Saving…' : 'Save Changes'}</button>
              <button onClick={() => setConfirmDelete(true)} style={{ width: '100%', padding: '10px', background: 'none', border: 'none', color: 'rgba(224,85,85,0.65)', fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>
                Remove Car
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: `0 ${SPACE_LG}px`, position: 'relative', zIndex: 1 }}>
              <p style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 26, color: COLOR_HEADER_TITLE, margin: '0 0 12px', textAlign: 'center', lineHeight: 1.2 }}>Remove this car?</p>
              <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 13, color: 'rgba(245,245,245,0.45)', textAlign: 'center', lineHeight: 1.6, margin: 0, maxWidth: 260 }}>
                It'll be held for 7 days before permanent deletion. You can restore it from your profile.
              </p>
            </div>
            <div style={{ flexShrink: 0, padding: `${SPACE_SM}px ${SPACE_MD}px ${SPACE_LG}px`, display: 'flex', flexDirection: 'column', gap: SPACE_SM, position: 'relative', zIndex: 5 }}>
              <button disabled={detailsSaving} onClick={removeCar} style={{ ...ctaStyle(true), background: '#c0392b' }}>{detailsSaving ? 'Removing…' : 'Yes, Remove It'}</button>
              <button onClick={() => setConfirmDelete(false)} style={{ width: '100%', padding: '10px', background: 'none', border: 'none', color: 'rgba(245,245,245,0.45)', fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>Keep It</button>
            </div>
          </>
        )}
      </div>

      {/* ── ADD CAR OVERLAY ── */}
      <div style={{ position: 'absolute', inset: 0, background: COLOR_CAVITY_BG, zIndex: 20, transform: showAdd ? 'translateY(0)' : 'translateY(100%)', transition: `transform 380ms ${EASING_SETTLE}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <GarageBg />
        <Header onBack={() => picker !== null ? setPicker(null) : step === 2 ? setStep(1) : setShowAdd(false)} />

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
                {/* Car photo */}
                <div style={FIELD}>
                  <span style={LABEL}>Car Photo <span style={OPT}>opt</span></span>
                  <CarPhotoUpload key={`add-${photoFieldKey}`} onChange={setAddPhotoBlob} />
                </div>

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

              <div style={{ marginBottom: SPACE_LG, animation: 'storyReveal 900ms ease-out 150ms both' }}>
                <p style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 28, color: COLOR_HEADER_TITLE, margin: '0 0 6px', lineHeight: 1.1 }}>Tell your story.</p>
                <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 12, color: 'rgba(245,245,245,0.38)', letterSpacing: '0.06em', margin: 0 }}>Every build has a beginning.</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_SM, animation: 'storyReveal 600ms ease-out 1100ms both' }}>
                <div style={FIELD}>
                  <span style={LABEL}>Purchase Date <span style={OPT}>opt</span></span>
                  <input type="date" value={form.purchaseDate} onChange={set('purchaseDate')} min="1900-01-01" max="2030-12-31" style={{ ...INPUT, WebkitAppearance: 'auto' as any }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 76px', gap: SPACE_SM }}>
                  <div style={FIELD}>
                    <span style={LABEL}>Purchase Price <span style={OPT}>opt</span></span>
                    <input type="number" inputMode="decimal" value={form.purchasePrice} onChange={set('purchasePrice')} style={INPUT} />
                  </div>
                  <div style={FIELD}>
                    <span style={LABEL}>Currency</span>
                    <select value={form.purchaseCurrency} onChange={set('purchaseCurrency')} style={{ ...INPUT, WebkitAppearance: 'auto' as any }}>
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
                  <input type="text" autoCapitalize="words" placeholder="e.g. private party, dealer, gift…" value={form.wherePurchased} onChange={set('wherePurchased')} style={INPUT} />
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
