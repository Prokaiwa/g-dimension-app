// Route: /tuning/add — 3-step animated Add Modification flow
// Step 1: Category picker → Step 2: Part type picker → Step 3: Form + Specs
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import imageCompression from 'browser-image-compression'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import { TUNING_CATEGORIES } from './TuningBuildSheetPage'
import { FONT_UI, EASING_SETTLE } from '../tokens'

// ── Types ─────────────────────────────────────────────────────────────────

interface PartType {
  id: number
  name: string
  display_order: number
  notes_placeholder: string | null
}

interface SpecTemplate {
  spec_key: string
  spec_label: string
  input_type: 'text' | 'number' | 'select' | 'multiselect' | 'boolean' | 'date'
  options: string | null
  unit: string | null
  unit_preference: string | null
  required: boolean
  is_advanced: boolean
  display_order: number
  group_label: string | null
  help_text: string | null
  placeholder: string | null
}

// ── Shared style constants ────────────────────────────────────────────────

const LABEL: React.CSSProperties = {
  display: 'block',
  fontFamily: FONT_UI, fontWeight: 700, fontSize: 10,
  letterSpacing: '0.14em', textTransform: 'uppercase',
  color: 'rgba(245,240,228,0.35)',
  marginBottom: 7,
}

const INPUT: React.CSSProperties = {
  display: 'block', width: '100%', boxSizing: 'border-box',
  background: 'transparent', border: 'none',
  borderBottom: '1px solid rgba(245,240,228,0.12)',
  padding: '9px 0',
  fontFamily: FONT_UI, fontWeight: 600, fontSize: 15,
  color: 'rgba(245,240,228,0.9)',
  outline: 'none',
  WebkitAppearance: 'none' as const,
}

const TILE_SHADOW = '-5px 0 7px -1px rgba(105,12,22,0.65), 0 5px 7px -1px rgba(18,55,190,0.5)'

const COMPRESSION_OPTIONS = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  exifOrientation: -1 as const,
  fileType: 'image/jpeg' as const,
}

const TITLE_PLACEHOLDER: Record<string, string> = {
  // Wheels & Tires
  'Wheels':                          'e.g. Enkei RPF1 17×9 +35',
  'Tires — Metric':                  'e.g. Michelin Pilot Sport 4S 235/40R17',
  'Tires — Truck/Standard':          'e.g. BFGoodrich All-Terrain T/A KO2 285/70R17',
  'Wheel Spacers / Adapters':        'e.g. H&R 20mm Wheel Spacers',
  // Suspension
  'Coilovers':                       'e.g. BC Racing BR Series Coilovers',
  'Air Suspension / Bags':           'e.g. Air Lift Performance 3P Kit',
  'Lowering Springs':                'e.g. Tein S-Tech Lowering Springs',
  'Sway Bars':                       'e.g. Whiteline 27mm Front Sway Bar',
  'Control Arms':                    'e.g. Megan Racing Adjustable Rear Upper Arms',
  // Brakes
  'Brake Pads':                      'e.g. Hawk HPS Performance Brake Pads',
  'Rotors':                          'e.g. StopTech Sport Slotted Rotors',
  'Brake Calipers':                  'e.g. Wilwood Superlite 4-Piston Calipers',
  'Big Brake Kit':                   'e.g. Brembo GT 4-Pot Big Brake Kit',
  'Brake Fluid':                     'e.g. Motul RBF 600 Brake Fluid',
  // Engine
  'Camshafts':                       'e.g. HKS 264° Step 2 Camshafts',
  'Cold Air Intake / Short Ram':     'e.g. AEM Cold Air Intake System',
  'Engine Management / ECU':         'e.g. Link G4X ECU',
  'Pistons':                         'e.g. Wiseco 86mm Forged Pistons',
  'Connecting Rods':                 'e.g. Eagle H-Beam Connecting Rods',
  'Head Work / Porting':             'e.g. Stage 2 Port & Polish by JGY Engines',
  // Forced Induction
  'Turbocharger':                    'e.g. HKS GT2530 Turbocharger',
  'Intercooler':                     'e.g. Mishimoto Front Mount Intercooler',
  'Wastegate':                       'e.g. TiAL 38mm External Wastegate',
  'Blow-off Valve / Bypass Valve':   'e.g. TiAL Q BOV',
  // Exhaust
  'Headers / Exhaust Manifold':      'e.g. Tomei Equal Length Exhaust Manifold',
  'Catback System':                  'e.g. HKS Hi-Power Catback Exhaust',
  'Downpipe / Frontpipe':            'e.g. Agency Power High Flow Downpipe',
  // Drivetrain
  'Clutch':                          'e.g. ACT Heavy Duty Clutch Kit',
  'Flywheel':                        'e.g. Fidanza Aluminum Lightweight Flywheel',
  'Differential':                    'e.g. Cusco Type RS LSD',
  'Driveshaft':                      'e.g. Driveshaft Shop Aluminum 1-Piece Driveshaft',
  // Cooling
  'Radiator':                        'e.g. Mishimoto Aluminum Racing Radiator',
  'Oil Cooler':                      'e.g. Setrab 16-Row Oil Cooler Kit',
  'Thermostat':                      'e.g. Mishimoto Racing Thermostat',
  // Electrical
  'Battery':                         'e.g. Odyssey PC680 AGM Battery',
  // Safety
  'Harness / Seatbelt':              'e.g. Sparco 4-Point FIA Harness',
  'Roll Bar / Roll Cage':            'e.g. Autopower 6-Point Street Roll Bar',
  'Helmet':                          'e.g. Bell GTX.3 Full Face Helmet',
  'Fire Suppression System':         'e.g. Lifeline Zero 2000 Fire System',
  // Exterior
  'Wing / Spoiler':                  'e.g. Voltex Type 1.5 GT Wing',
  'Fenders / Widebody':              'e.g. Work Wheels Overfenders +50mm',
  // Interior
  'Seats':                           'e.g. Bride Zeta III FRP Racing Seat',
  'Window Tint':                     'e.g. Llumar ATR 35% Window Tint',
  // Paint & Wrap
  'Full Paint':                      'e.g. Phantom Grey Pearl Custom Paint',
  'Vinyl Wrap':                      'e.g. 3M 1080 Matte Black Vinyl Wrap',
  // Audio
  'Head Unit':                       'e.g. Pioneer AVH-W4500NEX Head Unit',
  'Amplifier':                       'e.g. JL Audio RD400/4 Amplifier',
  'Subwoofer':                       'e.g. JL Audio 10W3v3 Subwoofer',
  // Lighting
  'Headlights':                      'e.g. Morimoto XB LED Headlights',
  // Fuel System
  'Fuel Injectors':                  'e.g. DeatschWerks 1000cc Fuel Injectors',
  'Fuel Pump':                       'e.g. Walbro 255lph High Pressure Fuel Pump',
}

// ── Helper ────────────────────────────────────────────────────────────────

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item)
    ;(acc[k] ??= []).push(item)
    return acc
  }, {} as Record<string, T[]>)
}

// ── Component ─────────────────────────────────────────────────────────────

export default function TuningAddPage() {
  const navigate = useNavigate()

  // step state — drives the sliding strip
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Step 1
  const [pressed, setPressed]             = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  // Step 2
  const [partTypes, setPartTypes]         = useState<PartType[]>([])
  const [partTypesLoading, setPartTypesLoading] = useState(false)
  const [selectedPartType, setSelectedPartType] = useState<PartType | null>(null)

  // Step 3
  const [specTemplates, setSpecTemplates] = useState<SpecTemplate[]>([])
  const [specsExpanded, setSpecsExpanded] = useState(false)
  const [advancedExpanded, setAdvancedExpanded] = useState(false)
  const [form, setForm] = useState({
    title: '', brand: '', partNumber: '',
    dateInstalled: '', partsCost: '', laborCost: '',
    installedBy: null as 'self' | 'shop' | null,
    notes: '',
  })
  const [specValues, setSpecValues]       = useState<Record<string, string>>({})
  const [multiValues, setMultiValues]     = useState<Record<string, string[]>>({})
  const [photos, setPhotos]               = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])
  const [saving, setSaving]               = useState(false)
  const [saveErr, setSaveErr]             = useState<string | null>(null)

  const release      = () => setPressed(null)
  const selectedCat  = TUNING_CATEGORIES.find(c => c.id === selectedCategory)

  // Load part types when category is chosen
  useEffect(() => {
    if (!selectedCategory) return
    setPartTypesLoading(true)
    setSelectedPartType(null)
    setPartTypes([])
    supabase
      .from('part_types')
      .select('id, name, display_order, notes_placeholder')
      .eq('category', selectedCategory)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .then(({ data, error }) => {
        setPartTypesLoading(false)
        if (error) console.error('part_types query failed:', error.message)
        else if (data) setPartTypes(data)
      })
  }, [selectedCategory])

  // Load spec templates when part type is chosen
  useEffect(() => {
    if (!selectedPartType) return
    supabase
      .from('spec_templates')
      .select(
        'spec_key, spec_label, input_type, options, unit, unit_preference, ' +
        'required, is_advanced, display_order, group_label, help_text, placeholder'
      )
      .eq('part_type_id', selectedPartType.id)
      .order('display_order', { ascending: true })
      .then(({ data }) => {
        setSpecTemplates((data as unknown as SpecTemplate[]) ?? [])
        setSpecValues({})
        setMultiValues({})
        setSpecsExpanded(false)
        setAdvancedExpanded(false)
      })
  }, [selectedPartType])

  // Revoke object URLs on unmount to avoid leaks
  useEffect(() => {
    const urls = photoPreviews
    return () => { urls.forEach(URL.revokeObjectURL) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigation ──────────────────────────────────────────────────────────

  const handleBack = () => {
    if (step === 1) navigate('/tuning/build-sheet')
    else if (step === 2) setStep(1)
    else setStep(2)
  }

  const selectCategory = (catId: string) => {
    setSelectedCategory(catId)
    setStep(2)
  }

  const selectPartType = (pt: PartType) => {
    setSelectedPartType(pt)
    setStep(3)
  }

  // ── Photo handling ──────────────────────────────────────────────────────

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    const previews = files.map(f => URL.createObjectURL(f))
    setPhotos(prev => [...prev, ...files])
    setPhotoPreviews(prev => [...prev, ...previews])
    e.target.value = ''
  }

  const removePhoto = (i: number) => {
    URL.revokeObjectURL(photoPreviews[i])
    setPhotos(prev => prev.filter((_, idx) => idx !== i))
    setPhotoPreviews(prev => prev.filter((_, idx) => idx !== i))
  }

  // ── Spec field helpers ──────────────────────────────────────────────────

  const setSpecVal = (key: string, val: string) =>
    setSpecValues(v => ({ ...v, [key]: val }))

  const toggleMulti = (key: string, option: string) =>
    setMultiValues(v => {
      const cur = v[key] ?? []
      return { ...v, [key]: cur.includes(option) ? cur.filter(x => x !== option) : [...cur, option] }
    })

  const parseOpts = (raw: string | null): string[] => {
    if (!raw) return []
    if (Array.isArray(raw as unknown)) return raw as unknown as string[]
    try { return JSON.parse(raw) as string[] } catch { return [] }
  }

  const renderSpecField = (t: SpecTemplate) => {
    const opts = parseOpts(t.options)
    const val  = specValues[t.spec_key] ?? ''

    if ((t.input_type === 'select' || t.input_type === 'multiselect') && opts.length === 0) return null

    return (
      <div key={t.spec_key} style={{ paddingTop: 18 }}>
        <label style={LABEL}>{t.spec_label}</label>

        {t.input_type === 'text' && (
          <>
            <input
              value={val}
              onChange={e => setSpecVal(t.spec_key, e.target.value)}
              placeholder={t.placeholder ?? ''}
              style={{ ...INPUT, caretColor: '#39ff14' }}
            />
            {t.help_text && (
              <p style={{ fontFamily: FONT_UI, fontSize: 11, color: 'rgba(245,240,228,0.28)', marginTop: 5, lineHeight: 1.5 }}>
                {t.help_text}
              </p>
            )}
          </>
        )}

        {t.input_type === 'number' && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <input
              type="number"
              value={val}
              onChange={e => setSpecVal(t.spec_key, e.target.value)}
              placeholder=""
              style={{ ...INPUT, flex: 1, caretColor: '#39ff14' }}
            />
            {t.unit && (
              <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 12, color: 'rgba(245,240,228,0.32)', marginLeft: 8, whiteSpace: 'nowrap', paddingBottom: 1 }}>
                {t.unit}
              </span>
            )}
          </div>
        )}

        {t.input_type === 'date' && (
          <input
            type="date"
            value={val}
            onChange={e => setSpecVal(t.spec_key, e.target.value)}
            style={{ ...INPUT, colorScheme: 'dark', caretColor: '#39ff14' }}
          />
        )}

        {t.input_type === 'select' && opts.length > 0 && (
          <select
            value={val}
            onChange={e => setSpecVal(t.spec_key, e.target.value)}
            style={{ ...INPUT, cursor: 'pointer', colorScheme: 'dark' }}
          >
            <option value="">—</option>
            {opts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        )}

        {t.input_type === 'multiselect' && opts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 6 }}>
            {opts.map(o => {
              const checked = (multiValues[t.spec_key] ?? []).includes(o)
              return (
                <label
                  key={o}
                  onClick={() => toggleMulti(t.spec_key, o)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                >
                  <div style={{
                    width: 18, height: 18, flexShrink: 0,
                    border: `1.5px solid ${checked ? 'rgba(200,102,26,0.8)' : 'rgba(245,240,228,0.2)'}`,
                    background: checked ? 'rgba(200,102,26,0.15)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 150ms ease',
                  }}>
                    {checked && <span style={{ color: '#c8661a', fontSize: 11, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                  </div>
                  <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 14, color: 'rgba(245,240,228,0.75)' }}>{o}</span>
                </label>
              )
            })}
          </div>
        )}

        {t.input_type === 'boolean' && (
          <div
            onClick={() => setSpecVal(t.spec_key, val === 'true' ? 'false' : 'true')}
            style={{
              width: 44, height: 26, position: 'relative', cursor: 'pointer',
              background: val === 'true' ? 'rgba(200,102,26,0.35)' : 'rgba(245,240,228,0.07)',
              border: `1.5px solid ${val === 'true' ? 'rgba(200,102,26,0.65)' : 'rgba(245,240,228,0.14)'}`,
              borderRadius: 13, transition: 'background 200ms, border-color 200ms',
            }}
          >
            <div style={{
              position: 'absolute', top: 3, left: val === 'true' ? 20 : 3,
              width: 16, height: 16, borderRadius: '50%',
              background: val === 'true' ? '#c8661a' : 'rgba(245,240,228,0.28)',
              transition: 'left 200ms, background 200ms',
            }} />
          </div>
        )}
      </div>
    )
  }

  // ── Save ────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!form.title.trim() || !selectedCategory || !selectedPartType || saving) return
    setSaving(true)
    setSaveErr(null)
    const carId = await getActiveCarId()
    if (!carId) { setSaving(false); return }

    // 1. INSERT job
    const { data: jobData, error: jobErr } = await supabase
      .from('jobs')
      .insert({
        car_id:         carId,
        type:           'modification',
        category:       selectedCategory,
        part_type_id:   selectedPartType.id,
        title:          form.title.trim(),
        brand:          form.brand.trim()       || null,
        part_number:    form.partNumber.trim()  || null,
        date_installed: form.dateInstalled      || null,
        parts_cost:     form.partsCost  ? parseFloat(form.partsCost)  : null,
        labor_cost:     form.laborCost  ? parseFloat(form.laborCost)  : null,
        installed_by:   form.installedBy        || null,
        notes:          form.notes.trim()       || null,
        status:         'installed',
      })
      .select('id')
      .single()

    if (jobErr || !jobData) {
      setSaveErr(jobErr?.message ?? 'Failed to save')
      setSaving(false)
      return
    }

    const jobId = jobData.id as string

    // 2. INSERT job_specs for all non-empty spec fields
    type SpecRow = { job_id: string; spec_key: string; spec_value: string; spec_unit: string | null }
    const specRows: SpecRow[] = []

    for (const t of specTemplates) {
      if (t.input_type === 'multiselect') {
        const vals = multiValues[t.spec_key] ?? []
        if (vals.length > 0) {
          specRows.push({ job_id: jobId, spec_key: t.spec_key, spec_value: vals.join(','), spec_unit: t.unit ?? null })
        }
      } else {
        const v = specValues[t.spec_key]
        // Skip empty strings and explicit 'false' (boolean off = no meaningful state to store)
        if (v && v !== '' && v !== 'false') {
          specRows.push({ job_id: jobId, spec_key: t.spec_key, spec_value: String(v), spec_unit: t.unit ?? null })
        }
      }
    }

    if (specRows.length > 0) {
      await supabase.from('job_specs').insert(specRows)
    }

    // 3. Compress (EXIF strip) + upload photos, then INSERT job_photos
    for (const photo of photos) {
      try {
        const compressed = await imageCompression(photo, COMPRESSION_OPTIONS)
        const ext  = 'jpg'
        const path = `${carId}/${jobId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { data: up, error: upErr } = await supabase.storage
          .from('job-photos')
          .upload(path, compressed, { contentType: compressed.type })
        if (!upErr && up) {
          const { data: urlData } = supabase.storage.from('job-photos').getPublicUrl(up.path)
          await supabase.from('job_photos').insert({
            job_id:    jobId,
            car_id:    carId,
            photo_url: urlData.publicUrl,
          })
        }
      } catch (_) {
        // Photo upload failure is non-fatal — the job record is already saved
      }
    }

    setSaving(false)
    navigate('/tuning/build-sheet')
  }

  // ── Derived spec groups ─────────────────────────────────────────────────

  const MAIN_FORM_KEYS = new Set(['brand'])
  const basicSpecs    = specTemplates.filter(t => !t.is_advanced && !MAIN_FORM_KEYS.has(t.spec_key))
  const advancedSpecs = specTemplates.filter(t => t.is_advanced  && !MAIN_FORM_KEYS.has(t.spec_key))
  const basicGroups   = groupBy(basicSpecs, t => t.group_label ?? '')
  const advancedGroups = groupBy(advancedSpecs, t => t.group_label ?? '')

  const canSubmit = form.title.trim().length > 0 && !saving

  // ── Back button label ───────────────────────────────────────────────────

  const backLabel =
    step === 1 ? 'Cancel' :
    step === 2 ? (selectedCat?.label ?? 'Back') :
    (selectedPartType?.name ?? 'Back')

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={{ height: '100dvh', background: '#000', overflow: 'hidden', position: 'relative' }}>

      <style>{`
        @keyframes tileIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes rowIn {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
      `}</style>

      {/* Back button — always on top across all steps */}
      <button
        onClick={handleBack}
        style={{
          position: 'absolute', top: 0, left: 0, height: 52, padding: '0 20px',
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', cursor: 'pointer', zIndex: 30,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span style={{ color: 'rgba(245,240,228,0.5)', fontSize: 20, fontWeight: 300 }}>‹</span>
        {step === 2 && selectedCat?.icon && (
          <img src={selectedCat.icon} alt="" style={{ width: 14, height: 14, objectFit: 'contain', opacity: 0.55, pointerEvents: 'none' }} />
        )}
        <span style={{
          fontFamily: FONT_UI, fontWeight: 800, fontSize: 11,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'rgba(245,240,228,0.4)',
        }}>
          {backLabel}
        </span>
      </button>

      {/* ── Sliding strip: 3 steps side by side, strip is 300vw wide ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0,
        width: '300%',
        display: 'flex',
        transform: `translateX(${-(step - 1) * (100 / 3)}%)`,
        transition: 'transform 280ms ease-in-out',
        willChange: 'transform',
      }}>

        {/* ───────────────── STEP 1: Category picker ───────────────── */}
        <div style={{ width: '33.333%', height: '100%', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{
            height: '100%',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gridTemplateRows: 'repeat(6, 1fr)',
            gap: 8,
            padding: '56px 16px 20px',
          }}>
            {TUNING_CATEGORIES.filter(c => c.id !== 'Other').map((cat, i) => (
              <button
                key={cat.id}
                onClick={() => selectCategory(cat.id)}
                onPointerDown={() => setPressed(cat.id)}
                onPointerUp={release} onPointerLeave={release} onPointerCancel={release}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '4px 4px 4px 8px',
                  animation: `tileIn 320ms ${EASING_SETTLE} ${i * 28}ms both`,
                  WebkitTapHighlightColor: 'transparent',
                  touchAction: 'manipulation', userSelect: 'none',
                }}
              >
                <div style={{
                  width: '100%', height: '100%',
                  background: '#0a0a0c', boxShadow: TILE_SHADOW,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 6,
                  transform: pressed === cat.id ? 'scale(0.93)' : 'scale(1)',
                  transition: pressed === cat.id
                    ? 'transform 80ms ease-out'
                    : 'transform 200ms cubic-bezier(0.22,1,0.36,1)',
                }}>
                  <img
                    src={cat.icon!} alt={cat.label} draggable={false}
                    style={{ width: 66, height: 66, objectFit: 'contain', pointerEvents: 'none' }}
                  />
                  <span style={{
                    fontFamily: FONT_UI, fontWeight: 700, fontSize: 9,
                    letterSpacing: '0.12em', textTransform: 'uppercase',
                    color: 'rgba(245,240,228,0.55)',
                  }}>{cat.label}</span>
                </div>
              </button>
            ))}

            {/* Row 6: two spacers + Other centered */}
            <div />
            <button
              onClick={() => selectCategory('Other')}
              onPointerDown={() => setPressed('Other')}
              onPointerUp={release} onPointerLeave={release} onPointerCancel={release}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '4px 4px 4px 8px',
                animation: `tileIn 320ms ${EASING_SETTLE} ${15 * 28}ms both`,
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation', userSelect: 'none',
              }}
            >
              <div style={{
                width: '100%', height: '100%',
                background: '#0a0a0c', boxShadow: TILE_SHADOW,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transform: pressed === 'Other' ? 'scale(0.93)' : 'scale(1)',
                transition: pressed === 'Other'
                  ? 'transform 80ms ease-out'
                  : 'transform 200ms cubic-bezier(0.22,1,0.36,1)',
              }}>
                <span style={{
                  fontFamily: FONT_UI, fontWeight: 700, fontSize: 13,
                  letterSpacing: '0.14em', textTransform: 'uppercase',
                  color: 'rgba(245,240,228,0.45)',
                }}>Other</span>
              </div>
            </button>
            <div />
          </div>
        </div>

        {/* ───────────────── STEP 2: Part type picker ───────────────── */}
        <div style={{ width: '33.333%', height: '100%', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ height: '100%', overflowY: 'auto', paddingTop: 52 }}>

            {partTypesLoading && (
              <div style={{ padding: '40px 22px', textAlign: 'center', fontFamily: FONT_UI, fontSize: 12, letterSpacing: '0.1em', color: 'rgba(245,240,228,0.25)' }}>
                Loading…
              </div>
            )}

            {!partTypesLoading && selectedCategory && partTypes.length === 0 && (
              <div style={{ padding: '40px 22px', textAlign: 'center' }}>
                <p style={{ fontFamily: FONT_UI, fontSize: 13, color: 'rgba(245,240,228,0.35)', marginBottom: 20 }}>No part types found</p>
                <button
                  onClick={() => setStep(1)}
                  style={{
                    background: 'none', border: '1px solid rgba(245,240,228,0.14)',
                    padding: '10px 24px', cursor: 'pointer',
                    fontFamily: FONT_UI, fontWeight: 700, fontSize: 10,
                    letterSpacing: '0.12em', textTransform: 'uppercase',
                    color: 'rgba(245,240,228,0.35)',
                  }}
                >
                  ‹ Back
                </button>
              </div>
            )}

            {!partTypesLoading && partTypes.map((pt, i) => (
              <button
                key={pt.id}
                onClick={() => selectPartType(pt)}
                style={{
                  display: 'block', width: '100%',
                  padding: '15px 22px',
                  background: 'none', border: 'none',
                  borderBottom: '1px solid rgba(245,240,228,0.05)',
                  cursor: 'pointer', textAlign: 'left',
                  WebkitTapHighlightColor: 'transparent',
                  animation: `rowIn 250ms ${EASING_SETTLE} ${i * 25}ms both`,
                }}
              >
                <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 14, color: 'rgba(245,240,228,0.78)' }}>
                  {pt.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ───────────────── STEP 3: Form ───────────────── */}
        <div style={{ width: '33.333%', height: '100%', overflowY: 'auto', flexShrink: 0 }}>
          <div style={{ paddingTop: 60, paddingBottom: 72 }}>

            {/* Title */}
            <div style={{ padding: '4px 22px 0' }}>
              <label style={LABEL}>Title *</label>
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder={TITLE_PLACEHOLDER[selectedPartType?.name ?? ''] ?? 'e.g. Add a title'}
                style={{ ...INPUT, caretColor: '#39ff14' }}
              />
            </div>

            {/* Brand */}
            <div style={{ padding: '20px 22px 0' }}>
              <label style={LABEL}>Brand</label>
              <input
                value={form.brand}
                onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                placeholder="e.g. HKS"
                style={{ ...INPUT, caretColor: '#39ff14' }}
              />
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

            {/* Installed By — segmented toggle */}
            <div style={{ padding: '20px 22px 0' }}>
              <label style={LABEL}>Installed By</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['self', 'shop'] as const).map(opt => {
                  const active = form.installedBy === opt
                  return (
                    <button
                      key={opt}
                      onClick={() => setForm(f => ({ ...f, installedBy: active ? null : opt }))}
                      style={{
                        flex: 1, padding: '11px 0',
                        background: active ? 'rgba(105,12,22,0.22)' : 'transparent',
                        border: `1.5px solid ${active ? 'rgba(105,12,22,0.75)' : 'rgba(245,240,228,0.11)'}`,
                        cursor: 'pointer',
                        fontFamily: FONT_UI, fontWeight: 800, fontSize: 11,
                        letterSpacing: '0.14em', textTransform: 'uppercase',
                        color: active ? '#c0303a' : 'rgba(245,240,228,0.38)',
                        transition: 'all 200ms ease',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      {opt === 'self' ? 'Self' : 'Shop'}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Costs — Labor hidden when self-installed */}
            <div style={{ padding: '20px 22px 0', display: 'flex', gap: 20 }}>
              <div style={{ flex: 1 }}>
                <label style={LABEL}>Parts Cost</label>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 14, color: 'rgba(245,240,228,0.38)', marginRight: 4, paddingBottom: 1 }}>$</span>
                  <input
                    type="number" inputMode="decimal" min="0" step="0.01"
                    value={form.partsCost}
                    onChange={e => setForm(f => ({ ...f, partsCost: e.target.value }))}
                    placeholder="0.00"
                    style={{ ...INPUT, flex: 1, caretColor: '#39ff14' }}
                  />
                </div>
              </div>
              {form.installedBy === 'shop' && (
                <div style={{ flex: 1 }}>
                  <label style={LABEL}>Labor Cost</label>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 14, color: 'rgba(245,240,228,0.38)', marginRight: 4, paddingBottom: 1 }}>$</span>
                    <input
                      type="number" inputMode="decimal" min="0" step="0.01"
                      value={form.laborCost}
                      onChange={e => setForm(f => ({ ...f, laborCost: e.target.value }))}
                      placeholder="0.00"
                      style={{ ...INPUT, flex: 1, caretColor: '#39ff14' }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Notes */}
            <div style={{ padding: '20px 22px 0' }}>
              <label style={LABEL}>Notes</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder={selectedPartType?.notes_placeholder ?? 'Add any notes about this modification…'}
                rows={4}
                style={{
                  ...INPUT, resize: 'none', lineHeight: 1.6,
                  caretColor: '#39ff14',
                } as React.CSSProperties}
              />
            </div>

            {/* Photos */}
            <div style={{ padding: '20px 22px 0' }}>
              <label style={LABEL}>Photos</label>

              {photoPreviews.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  {photoPreviews.map((src, i) => (
                    <div key={i} style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
                      <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      <button
                        onClick={() => removePhoto(i)}
                        style={{
                          position: 'absolute', top: 3, right: 3,
                          width: 20, height: 20, padding: 0,
                          background: 'rgba(0,0,0,0.75)', border: 'none', cursor: 'pointer',
                          borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          WebkitTapHighlightColor: 'transparent',
                        }}
                      >
                        <span style={{ color: '#fff', fontSize: 12, lineHeight: 1, fontWeight: 700 }}>×</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <label style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '13px 0', cursor: 'pointer',
                border: '1px dashed rgba(245,240,228,0.14)',
                fontFamily: FONT_UI, fontWeight: 800, fontSize: 10,
                letterSpacing: '0.16em', textTransform: 'uppercase',
                color: 'rgba(245,240,228,0.3)',
              }}>
                + Add Photos
                <input
                  type="file" accept="image/*" multiple
                  onChange={handlePhotoSelect}
                  style={{ display: 'none' }}
                />
              </label>
            </div>

            {/* Full Specs toggle — always shown (Part Number lives here) */}
            <div style={{ padding: '24px 22px 0' }}>
              <button
                onClick={() => setSpecsExpanded(x => !x)}
                style={{
                  width: '100%', padding: '13px 0',
                  background: specsExpanded ? 'rgba(18,55,190,0.1)' : 'transparent',
                  border: `1px solid ${specsExpanded ? 'rgba(18,55,190,0.4)' : 'rgba(245,240,228,0.13)'}`,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 200ms ease',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <span style={{
                  fontFamily: FONT_UI, fontWeight: 800, fontSize: 10,
                  letterSpacing: '0.18em', textTransform: 'uppercase',
                  color: specsExpanded ? 'rgba(60,100,220,0.82)' : 'rgba(245,240,228,0.42)',
                }}>
                  Full Specs
                </span>
                <span style={{
                  color: specsExpanded ? 'rgba(60,100,220,0.55)' : 'rgba(245,240,228,0.22)',
                  fontSize: 11,
                  display: 'inline-block',
                  transform: specsExpanded ? 'rotate(180deg)' : 'none',
                  transition: 'transform 200ms ease',
                }}>▾</span>
              </button>

              {specsExpanded && (
                <div style={{ paddingTop: 8 }}>

                  {/* Part Number */}
                  <div style={{ paddingTop: 18 }}>
                    <label style={LABEL}>Part Number</label>
                    <input
                      value={form.partNumber}
                      onChange={e => setForm(f => ({ ...f, partNumber: e.target.value }))}
                      placeholder="e.g. 14004-AN001"
                      style={{ ...INPUT, caretColor: '#39ff14' }}
                    />
                  </div>

                  {/* Basic specs (flat — no group headers) */}
                  {Object.entries(basicGroups).map(([groupLabel, fields]) => (
                    <div key={groupLabel || '__ungrouped__'}>
                      {fields.map(renderSpecField)}
                    </div>
                  ))}

                  {/* Advanced specs collapsible */}
                  {advancedSpecs.length > 0 && (
                    <div style={{ marginTop: 28 }}>
                      <button
                        onClick={() => setAdvancedExpanded(x => !x)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          padding: '6px 0', display: 'flex', alignItems: 'center', gap: 6,
                          WebkitTapHighlightColor: 'transparent',
                        }}
                      >
                        <span style={{
                          fontFamily: FONT_UI, fontWeight: 700, fontSize: 10,
                          letterSpacing: '0.14em', textTransform: 'uppercase',
                          color: 'rgba(245,240,228,0.28)',
                        }}>
                          {advancedExpanded ? '− Advanced Specs' : '+ Advanced Specs'}
                        </span>
                      </button>

                      {advancedExpanded && Object.entries(advancedGroups).map(([groupLabel, fields]) => (
                        <div key={groupLabel || '__adv_ungrouped__'} style={{ marginTop: 16 }}>
                          {fields.map(renderSpecField)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Save button */}
            <div style={{ padding: '32px 22px 0' }}>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                style={{
                  width: '100%', padding: '15px 0',
                  background: canSubmit ? 'rgba(105,12,22,0.22)' : 'transparent',
                  border: `1.5px solid ${canSubmit ? 'rgba(105,12,22,0.82)' : 'rgba(255,255,255,0.07)'}`,
                  fontFamily: FONT_UI, fontWeight: 800, fontSize: 12,
                  letterSpacing: '0.18em', textTransform: 'uppercase',
                  color: canSubmit ? '#c0303a' : 'rgba(245,240,228,0.18)',
                  cursor: canSubmit ? 'pointer' : 'default',
                  transition: 'all 200ms ease',
                  boxShadow: canSubmit ? '0 0 16px rgba(105,12,22,0.28)' : 'none',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {saving ? 'Saving…' : 'Log It'}
              </button>

              {saveErr && (
                <p style={{ fontFamily: FONT_UI, fontSize: 12, color: '#e05555', marginTop: 10, lineHeight: 1.5 }}>
                  {saveErr}
                </p>
              )}
            </div>

          </div>
        </div>

      </div>
    </div>
  )
}
