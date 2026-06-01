// Route: /tuning/add — 3-step animated Add Modification flow
// Step 1: Category picker → Step 2: Part type picker → Step 3: Form + Specs
import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import imageCompression from 'browser-image-compression'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import { getYouTubeId, getYouTubeThumbnail } from '../lib/links'
import { TUNING_CATEGORIES } from './TuningBuildSheetPage'
import {
  FONT_UI, EASING_SETTLE,
  FONT_HANDWRITTEN, FONT_STAMP,
  COLOR_CARDBOARD_BG, COLOR_CARDBOARD_INK, COLOR_CARDBOARD_INK2, COLOR_CARDBOARD_STAMP,
} from '../tokens'

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

const NOISE_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`

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

// Brand example for each part type — kept in sync with TITLE_PLACEHOLDER so the
// title example ("AEM Cold Air Intake System") and the brand example ("AEM")
// always refer to the same maker instead of two unrelated brands.
const BRAND_PLACEHOLDER: Record<string, string> = {
  // Wheels & Tires
  'Wheels':                          'e.g. Enkei',
  'Tires — Metric':                  'e.g. Michelin',
  'Tires — Truck/Standard':          'e.g. BFGoodrich',
  'Wheel Spacers / Adapters':        'e.g. H&R',
  // Suspension
  'Coilovers':                       'e.g. BC Racing',
  'Air Suspension / Bags':           'e.g. Air Lift',
  'Lowering Springs':                'e.g. Tein',
  'Sway Bars':                       'e.g. Whiteline',
  'Control Arms':                    'e.g. Megan Racing',
  // Brakes
  'Brake Pads':                      'e.g. Hawk',
  'Rotors':                          'e.g. StopTech',
  'Brake Calipers':                  'e.g. Wilwood',
  'Big Brake Kit':                   'e.g. Brembo',
  'Brake Fluid':                     'e.g. Motul',
  // Engine
  'Camshafts':                       'e.g. HKS',
  'Cold Air Intake / Short Ram':     'e.g. AEM',
  'Engine Management / ECU':         'e.g. Link',
  'Pistons':                         'e.g. Wiseco',
  'Connecting Rods':                 'e.g. Eagle',
  'Head Work / Porting':             'e.g. JGY Engines',
  // Forced Induction
  'Turbocharger':                    'e.g. HKS',
  'Intercooler':                     'e.g. Mishimoto',
  'Wastegate':                       'e.g. TiAL',
  'Blow-off Valve / Bypass Valve':   'e.g. TiAL',
  // Exhaust
  'Headers / Exhaust Manifold':      'e.g. Tomei',
  'Catback System':                  'e.g. HKS',
  'Downpipe / Frontpipe':            'e.g. Agency Power',
  // Drivetrain
  'Clutch':                          'e.g. ACT',
  'Flywheel':                        'e.g. Fidanza',
  'Differential':                    'e.g. Cusco',
  'Driveshaft':                      'e.g. The Driveshaft Shop',
  // Cooling
  'Radiator':                        'e.g. Mishimoto',
  'Oil Cooler':                      'e.g. Setrab',
  'Thermostat':                      'e.g. Mishimoto',
  // Electrical
  'Battery':                         'e.g. Odyssey',
  // Safety
  'Harness / Seatbelt':              'e.g. Sparco',
  'Roll Bar / Roll Cage':            'e.g. Autopower',
  'Helmet':                          'e.g. Bell',
  'Fire Suppression System':         'e.g. Lifeline',
  // Exterior
  'Wing / Spoiler':                  'e.g. Voltex',
  'Fenders / Widebody':              'e.g. Work Wheels',
  // Interior
  'Seats':                           'e.g. Bride',
  'Window Tint':                     'e.g. Llumar',
  // Paint & Wrap
  'Full Paint':                      'e.g. PPG',
  'Vinyl Wrap':                      'e.g. 3M',
  // Audio
  'Head Unit':                       'e.g. Pioneer',
  'Amplifier':                       'e.g. JL Audio',
  'Subwoofer':                       'e.g. JL Audio',
  // Lighting
  'Headlights':                      'e.g. Morimoto',
  // Fuel System
  'Fuel Injectors':                  'e.g. DeatschWerks',
  'Fuel Pump':                       'e.g. Walbro',
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
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const partsBinMode = searchParams.get('dest') === 'parts-bin'
  const returnPath = partsBinMode ? '/tuning/parts-bin' : '/tuning/build-sheet'

  // When navigating here from a group detail page, these are set in router state
  const locState = location.state as { sessionId?: string; groupTitle?: string } | null
  const existingSessionId  = locState?.sessionId  ?? null
  const existingGroupTitle = locState?.groupTitle ?? null

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
  const [wishlistMode, setWishlistMode]   = useState(false)
  const [newLinkUrl,   setNewLinkUrl]     = useState('')
  const [newLinkLabel, setNewLinkLabel]   = useState('')
  const [newLinks,     setNewLinks]       = useState<{ url: string; label: string }[]>([])
  const [addToTimeline, setAddToTimeline]  = useState(true)
  const [groupName,     setGroupName]      = useState('')
  const [saving, setSaving]               = useState(false)
  const [saveErr, setSaveErr]             = useState<string | null>(null)

  const release      = () => setPressed(null)
  const selectedCat  = TUNING_CATEGORIES.find(c => c.id === selectedCategory)

  // Kraft paper label/input styles — swapped in when partsBinMode
  const lbl: React.CSSProperties = partsBinMode ? {
    display: 'block',
    fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 15,
    color: COLOR_CARDBOARD_INK, opacity: 0.8, marginBottom: 7,
  } : LABEL

  const inp: React.CSSProperties = partsBinMode ? {
    display: 'block', width: '100%', boxSizing: 'border-box' as const,
    background: 'transparent', border: 'none',
    borderBottom: `1px solid rgba(26,16,8,0.18)`,
    padding: '9px 0',
    fontFamily: FONT_HANDWRITTEN, fontWeight: 600, fontSize: 19,
    color: COLOR_CARDBOARD_INK,
    outline: 'none', WebkitAppearance: 'none' as const,
  } : INPUT

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
    if (step === 1) navigate(returnPath)
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
        <label style={lbl}>{t.spec_label}</label>

        {t.input_type === 'text' && (
          <>
            <input
              value={val}
              onChange={e => setSpecVal(t.spec_key, e.target.value)}
              placeholder={t.placeholder ?? ''}
              style={{ ...inp, caretColor: partsBinMode ? COLOR_CARDBOARD_INK : '#39ff14' }}
            />
            {t.help_text && (
              <p style={{ fontFamily: FONT_UI, fontSize: 11, color: 'rgba(245,240,228,0.28)', marginTop: 5, lineHeight: 1.5 }}>
                {t.help_text}
              </p>
            )}
          </>
        )}

        {t.input_type === 'number' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="number"
                value={val}
                onChange={e => setSpecVal(t.spec_key, e.target.value)}
                placeholder={t.placeholder ?? ''}
                style={{ ...inp, flex: 1, caretColor: partsBinMode ? COLOR_CARDBOARD_INK : '#39ff14' }}
              />
              {t.unit && (
                <span style={{ fontFamily: partsBinMode ? FONT_HANDWRITTEN : FONT_UI, fontWeight: 600, fontSize: 12, color: partsBinMode ? COLOR_CARDBOARD_INK2 : 'rgba(245,240,228,0.32)', marginLeft: 8, whiteSpace: 'nowrap', paddingBottom: 1 }}>
                  {t.unit}
                </span>
              )}
            </div>
            {t.help_text && (
              <p style={{ fontFamily: FONT_UI, fontSize: 11, color: 'rgba(245,240,228,0.28)', marginTop: 5, lineHeight: 1.5 }}>
                {t.help_text}
              </p>
            )}
          </>
        )}

        {t.input_type === 'date' && (
          <input
            type="date"
            value={val}
            onChange={e => setSpecVal(t.spec_key, e.target.value)}
            style={{ ...inp, colorScheme: 'dark', caretColor: partsBinMode ? COLOR_CARDBOARD_INK : '#39ff14' }}
          />
        )}

        {t.input_type === 'select' && opts.length > 0 && (
          <select
            value={val}
            onChange={e => setSpecVal(t.spec_key, e.target.value)}
            style={{ ...inp, cursor: 'pointer', colorScheme: 'dark' }}
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
              background: val === 'true'
                ? 'rgba(200,102,26,0.35)'
                : partsBinMode ? 'rgba(26,16,8,0.08)' : 'rgba(245,240,228,0.07)',
              border: `1.5px solid ${val === 'true'
                ? 'rgba(200,102,26,0.65)'
                : partsBinMode ? 'rgba(26,16,8,0.22)' : 'rgba(245,240,228,0.14)'}`,
              borderRadius: 13, transition: 'background 200ms, border-color 200ms',
            }}
          >
            <div style={{
              position: 'absolute', top: 3, left: val === 'true' ? 20 : 3,
              width: 16, height: 16, borderRadius: '50%',
              background: val === 'true'
                ? '#c8661a'
                : partsBinMode ? 'rgba(26,16,8,0.3)' : 'rgba(245,240,228,0.28)',
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
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    if (!userId) { setSaving(false); return }

    const today = new Date().toISOString().split('T')[0]

    // 1. Determine which session to attach this job to
    let sessionId: string | null = existingSessionId

    if (!partsBinMode && !sessionId) {
      if (groupName.trim()) {
        // New named group session — job becomes first component
        const { data: sData } = await supabase
          .from('sessions')
          .insert({
            car_id:          carId,
            type:            'modification',
            title:           groupName.trim(),
            date_performed:  form.dateInstalled || today,
            add_to_timeline: addToTimeline,
          })
          .select('id')
          .single()
        if (sData) sessionId = (sData as { id: string }).id
      } else if (addToTimeline) {
        // Anonymous session for timeline only (solo mod, existing behaviour)
        const { data: sData } = await supabase
          .from('sessions')
          .insert({
            car_id:          carId,
            type:            'modification',
            date_performed:  form.dateInstalled || today,
            add_to_timeline: true,
          })
          .select('id')
          .single()
        if (sData) sessionId = (sData as { id: string }).id
      }
    }

    // 2. INSERT job
    const { data: jobData, error: jobErr } = await supabase
      .from('jobs')
      .insert({
        ...(sessionId ? { session_id: sessionId } : {}),
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
        status:         partsBinMode ? (wishlistMode ? 'planned' : 'purchased') : 'installed',
        still_owned:    partsBinMode ? !wishlistMode : undefined,
      })
      .select('id')
      .single()

    if (jobErr || !jobData) {
      setSaveErr(jobErr?.message ?? 'Failed to save')
      setSaving(false)
      return
    }

    const jobId = jobData.id as string

    // 3. INSERT job_specs for all non-empty spec fields
    type SpecRow = { job_id: string; spec_key: string; spec_value: string; spec_unit: string | null }
    const specRows: SpecRow[] = []

    for (const t of specTemplates) {
      if (t.input_type === 'multiselect') {
        const vals = multiValues[t.spec_key] ?? []
        if (vals.length > 0) {
          specRows.push({ job_id: jobId, spec_key: t.spec_key, spec_value: JSON.stringify(vals), spec_unit: t.unit ?? null })
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

    // 4. Compress (EXIF strip) + upload photos, then INSERT job_photos
    for (const photo of photos) {
      try {
        const compressed = await imageCompression(photo, COMPRESSION_OPTIONS)
        const ext  = 'jpg'
        const path = `${userId}/${carId}/${jobId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
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

    // 5. INSERT job_links
    if (newLinks.length > 0) {
      await supabase.from('job_links').insert(
        newLinks.map((l, i) => ({ job_id: jobId, user_id: userId, url: l.url, label: l.label || null, display_order: i }))
      )
    }

    setSaving(false)
    if (!partsBinMode && sessionId && (groupName.trim() || existingSessionId)) {
      navigate(`/tuning/mod-group/${sessionId}`)
    } else {
      navigate(returnPath)
    }
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
    <div style={partsBinMode ? {
      height: '100dvh', overflow: 'hidden', position: 'relative' as const,
      background: COLOR_CARDBOARD_BG,
      backgroundImage: [
        `repeating-linear-gradient(0deg, transparent, transparent 14px, rgba(100,60,20,0.07) 14px, rgba(100,60,20,0.07) 15px)`,
        `radial-gradient(ellipse 100% 100% at 50% 50%, transparent 60%, rgba(80,40,10,0.25) 100%)`,
      ].join(', '),
    } : { height: '100dvh', background: '#000', overflow: 'hidden', position: 'relative' as const }}>

      {partsBinMode && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1,
          backgroundImage: NOISE_SVG, backgroundSize: '180px 180px',
          opacity: 0.09, mixBlendMode: 'multiply' as const,
        }} />
      )}

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
        .pb-form input::placeholder,
        .pb-form textarea::placeholder { color: rgba(26,16,8,0.38); }
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
        <span style={{ color: partsBinMode ? COLOR_CARDBOARD_STAMP : 'rgba(245,240,228,0.5)', fontSize: 22, fontWeight: 300 }}>‹</span>
        {!partsBinMode && step === 2 && selectedCat?.icon && (
          <img src={selectedCat.icon} alt="" style={{ width: 14, height: 14, objectFit: 'contain', opacity: 0.55, pointerEvents: 'none' }} />
        )}
        <span style={partsBinMode ? {
          fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 16,
          color: COLOR_CARDBOARD_STAMP,
        } : {
          fontFamily: FONT_UI, fontWeight: 800, fontSize: 11,
          letterSpacing: '0.12em', textTransform: 'uppercase' as const,
          color: 'rgba(245,240,228,0.4)',
        }}>
          {backLabel}
        </span>
      </button>

      {/* ── Sliding strip: 3 steps side by side, strip is 300vw wide ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0,
        width: '300%', zIndex: 2,
        display: 'flex',
        transform: `translateX(${-(step - 1) * (100 / 3)}%)`,
        transition: 'transform 280ms ease-in-out',
        willChange: 'transform',
      }}>

        {/* ───────────────── STEP 1: Category picker ───────────────── */}
        <div style={{ width: '33.333%', height: '100%', overflow: 'hidden', flexShrink: 0 }}>
          {partsBinMode ? (
            /* Parts bin mode: scrollable 2-col grid of Caveat text tiles */
            <div style={{ height: '100%', overflowY: 'auto', paddingTop: 56 }}>
              <p style={{
                fontFamily: FONT_STAMP, fontSize: 13,
                color: COLOR_CARDBOARD_INK, opacity: 0.35,
                textAlign: 'center', margin: '0 0 14px',
                letterSpacing: '0.06em',
              }}>
                what kind of part?
              </p>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr',
                gap: 8, padding: '0 14px 20px',
              }}>
                {TUNING_CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => selectCategory(cat.id)}
                    onPointerDown={() => setPressed(cat.id)}
                    onPointerUp={release} onPointerLeave={release} onPointerCancel={release}
                    style={{
                      background: pressed === cat.id ? 'rgba(26,16,8,0.1)' : 'rgba(26,16,8,0.04)',
                      border: `1.5px solid rgba(26,16,8,0.22)`,
                      cursor: 'pointer', padding: '16px 8px', textAlign: 'center',
                      WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                      transform: pressed === cat.id ? 'scale(0.95)' : 'scale(1)',
                      transition: pressed === cat.id
                        ? 'transform 80ms ease-out'
                        : 'transform 200ms cubic-bezier(0.22,1,0.36,1)',
                    }}
                  >
                    <span style={{
                      fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 18,
                      color: COLOR_CARDBOARD_INK, lineHeight: 1.2,
                    }}>
                      {cat.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Build-sheet mode: original icon tile grid */
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
          )}
        </div>

        {/* ───────────────── STEP 2: Part type picker ───────────────── */}
        <div style={{ width: '33.333%', height: '100%', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ height: '100%', overflowY: 'auto', paddingTop: 52 }}>

            {partTypesLoading && (
              <div style={{ padding: '40px 22px', textAlign: 'center' }}>
                <span style={partsBinMode
                  ? { fontFamily: FONT_HANDWRITTEN, fontSize: 18, color: COLOR_CARDBOARD_INK2, opacity: 0.5 }
                  : { fontFamily: FONT_UI, fontSize: 12, letterSpacing: '0.1em', color: 'rgba(245,240,228,0.25)' }
                }>
                  {partsBinMode ? 'checking the box...' : 'Loading…'}
                </span>
              </div>
            )}

            {!partTypesLoading && selectedCategory && partTypes.length === 0 && (
              <div style={{ padding: '40px 22px', textAlign: 'center' }}>
                <p style={partsBinMode
                  ? { fontFamily: FONT_HANDWRITTEN, fontSize: 17, color: COLOR_CARDBOARD_INK2, opacity: 0.5, marginBottom: 20 }
                  : { fontFamily: FONT_UI, fontSize: 13, color: 'rgba(245,240,228,0.35)', marginBottom: 20 }
                }>No part types found</p>
                <button
                  onClick={() => setStep(1)}
                  style={{
                    background: 'none',
                    border: partsBinMode ? `1px solid rgba(26,16,8,0.2)` : '1px solid rgba(245,240,228,0.14)',
                    padding: '10px 24px', cursor: 'pointer',
                    fontFamily: partsBinMode ? FONT_HANDWRITTEN : FONT_UI,
                    fontWeight: 700, fontSize: partsBinMode ? 15 : 10,
                    letterSpacing: partsBinMode ? 0 : '0.12em',
                    textTransform: partsBinMode ? 'none' as const : 'uppercase' as const,
                    color: partsBinMode ? COLOR_CARDBOARD_INK2 : 'rgba(245,240,228,0.35)',
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
                  borderBottom: partsBinMode
                    ? '1px solid rgba(26,16,8,0.12)'
                    : '1px solid rgba(245,240,228,0.05)',
                  cursor: 'pointer', textAlign: 'left',
                  WebkitTapHighlightColor: 'transparent',
                  animation: partsBinMode ? undefined : `rowIn 250ms ${EASING_SETTLE} ${i * 25}ms both`,
                }}
              >
                <span style={partsBinMode
                  ? { fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 20, color: COLOR_CARDBOARD_INK }
                  : { fontFamily: FONT_UI, fontWeight: 700, fontSize: 14, color: 'rgba(245,240,228,0.78)' }
                }>
                  {pt.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ───────────────── STEP 3: Form ───────────────── */}
        <div style={{ width: '33.333%', height: '100%', overflowY: 'auto', flexShrink: 0 }}>
          <div className={partsBinMode ? 'pb-form' : undefined} style={{ paddingTop: 60, paddingBottom: 72 }}>

            {/* Have it / Want it toggle — parts-bin mode only */}
            {partsBinMode && (
              <div style={{ padding: '4px 22px 20px' }}>
                <label style={{ ...lbl, marginBottom: 10 }}>Status</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {([false, true] as const).map((isWish) => {
                    const sel = wishlistMode === isWish
                    return (
                      <button
                        key={String(isWish)}
                        onClick={() => setWishlistMode(isWish)}
                        style={{
                          flex: 1, padding: '11px 0',
                          background: sel ? 'rgba(26,16,8,0.09)' : 'transparent',
                          border: `1.5px solid ${sel ? 'rgba(26,16,8,0.45)' : 'rgba(26,16,8,0.14)'}`,
                          cursor: 'pointer',
                          fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 15,
                          color: sel ? COLOR_CARDBOARD_INK : COLOR_CARDBOARD_INK2,
                          opacity: sel ? 0.85 : 0.45,
                          transition: 'all 200ms ease',
                          WebkitTapHighlightColor: 'transparent',
                        }}
                      >
                        {isWish ? 'I want it' : 'I have it'}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Title */}
            <div style={{ padding: '4px 22px 0' }}>
              <label style={lbl}>Title *</label>
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder={TITLE_PLACEHOLDER[selectedPartType?.name ?? ''] ?? 'e.g. Add a title'}
                style={{ ...inp, caretColor: partsBinMode ? COLOR_CARDBOARD_INK : '#39ff14' }}
              />
            </div>

            {/* Brand */}
            <div style={{ padding: '20px 22px 0' }}>
              <label style={lbl}>Brand</label>
              <input
                value={form.brand}
                onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                placeholder={BRAND_PLACEHOLDER[selectedPartType?.name ?? ''] ?? 'e.g. Brand name'}
                style={{ ...inp, caretColor: partsBinMode ? COLOR_CARDBOARD_INK : '#39ff14' }}
              />
            </div>

            {/* Date Installed + Installed By — hidden in parts-bin mode */}
            {!partsBinMode && (
              <>
                <div style={{ padding: '20px 22px 0' }}>
                  <label style={lbl}>Date Installed</label>
                  <input
                    type="date"
                    value={form.dateInstalled}
                    onChange={e => setForm(f => ({ ...f, dateInstalled: e.target.value }))}
                    style={{ ...inp, colorScheme: 'dark', caretColor: partsBinMode ? COLOR_CARDBOARD_INK : '#39ff14' }}
                  />
                </div>
                <div style={{ padding: '20px 22px 0' }}>
                  <label style={lbl}>Installed By</label>
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
              </>
            )}

            {/* Costs — Labor hidden when self-installed or parts-bin mode */}
            <div style={{ padding: '20px 22px 0', display: 'flex', gap: 20 }}>
              <div style={{ flex: 1 }}>
                <label style={lbl}>{partsBinMode && wishlistMode ? 'Target Price' : 'Parts Cost'}</label>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontFamily: partsBinMode ? FONT_HANDWRITTEN : FONT_UI, fontWeight: 700, fontSize: 14, color: partsBinMode ? COLOR_CARDBOARD_INK2 : 'rgba(245,240,228,0.38)', marginRight: 4, paddingBottom: 1 }}>$</span>
                  <input
                    type="number" inputMode="decimal" min="0" step="0.01"
                    value={form.partsCost}
                    onChange={e => setForm(f => ({ ...f, partsCost: e.target.value }))}
                    placeholder="0.00"
                    style={{ ...inp, flex: 1, caretColor: partsBinMode ? COLOR_CARDBOARD_INK : '#39ff14' }}
                  />
                </div>
              </div>
              {!partsBinMode && form.installedBy === 'shop' && (
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Labor Cost</label>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontFamily: partsBinMode ? FONT_HANDWRITTEN : FONT_UI, fontWeight: 700, fontSize: 14, color: partsBinMode ? COLOR_CARDBOARD_INK2 : 'rgba(245,240,228,0.38)', marginRight: 4, paddingBottom: 1 }}>$</span>
                    <input
                      type="number" inputMode="decimal" min="0" step="0.01"
                      value={form.laborCost}
                      onChange={e => setForm(f => ({ ...f, laborCost: e.target.value }))}
                      placeholder="0.00"
                      style={{ ...inp, flex: 1, caretColor: partsBinMode ? COLOR_CARDBOARD_INK : '#39ff14' }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Notes */}
            <div style={{ padding: '20px 22px 0' }}>
              <label style={lbl}>Notes</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder={selectedPartType?.notes_placeholder ?? 'Add any notes about this modification…'}
                rows={4}
                style={{
                  ...inp, resize: 'none', lineHeight: 1.6,
                  caretColor: partsBinMode ? COLOR_CARDBOARD_INK : '#39ff14',
                } as React.CSSProperties}
              />
            </div>

            {/* Photos */}
            <div style={{ padding: '20px 22px 0' }}>
              <label style={lbl}>Photos</label>

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

              <label style={partsBinMode ? {
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '13px 0', cursor: 'pointer',
                border: `1px solid rgba(26,16,8,0.2)`,
                fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 15,
                color: COLOR_CARDBOARD_STAMP,
              } : {
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '13px 0', cursor: 'pointer',
                border: '1px dashed rgba(245,240,228,0.14)',
                fontFamily: FONT_UI, fontWeight: 800, fontSize: 10,
                letterSpacing: '0.16em', textTransform: 'uppercase' as const,
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

            {/* Links */}
            <div style={{ padding: '24px 22px 0' }}>
              <label style={lbl}>Links</label>

              {newLinks.map((link, i) => {
                const ytId = getYouTubeId(link.url)
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, marginBottom: 2 }}>
                    {ytId ? (
                      <div style={{ width: 64, height: 36, flexShrink: 0, overflow: 'hidden', position: 'relative' }}>
                        <img src={getYouTubeThumbnail(ytId)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.82 }} />
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.28)' }}>
                          <svg width="10" height="12" viewBox="0 0 10 12" fill="none"><path d="M0 0L10 6L0 12V0Z" fill={partsBinMode ? '#f5f0e4' : '#f5f5f5'} fillOpacity="0.6"/></svg>
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: partsBinMode ? COLOR_CARDBOARD_STAMP : 'rgba(245,240,228,0.5)', fontSize: 14, flexShrink: 0, lineHeight: 1, width: 20, textAlign: 'center', opacity: 0.75 }}>↗</span>
                    )}
                    <p style={{ flex: 1, fontFamily: partsBinMode ? FONT_HANDWRITTEN : FONT_UI, fontWeight: 700, fontSize: partsBinMode ? 14 : 13, color: partsBinMode ? COLOR_CARDBOARD_INK : 'rgba(245,240,228,0.75)', opacity: 0.82, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {link.label || link.url}
                    </p>
                    <button
                      onClick={() => setNewLinks(prev => prev.filter((_, j) => j !== i))}
                      style={{ flexShrink: 0, width: 28, height: 28, borderRadius: '50%', background: partsBinMode ? 'rgba(26,16,8,0.08)' : 'rgba(245,240,228,0.08)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}
                    >
                      <span style={{ color: partsBinMode ? COLOR_CARDBOARD_INK2 : 'rgba(245,240,228,0.5)', fontSize: 14, lineHeight: 1 }}>×</span>
                    </button>
                  </div>
                )
              })}

              <div style={{ marginTop: newLinks.length > 0 ? 14 : 10 }}>
                <input
                  value={newLinkUrl}
                  onChange={e => setNewLinkUrl(e.target.value)}
                  placeholder="https://"
                  style={{ ...inp, marginBottom: 10, caretColor: partsBinMode ? COLOR_CARDBOARD_INK : '#39ff14' }}
                />
                <input
                  value={newLinkLabel}
                  onChange={e => setNewLinkLabel(e.target.value)}
                  placeholder="Label (optional)"
                  style={{ ...inp, marginBottom: 12, caretColor: partsBinMode ? COLOR_CARDBOARD_INK : '#39ff14' }}
                />
                <button
                  onClick={() => {
                    const url = newLinkUrl.trim()
                    if (!url) return
                    setNewLinks(prev => [...prev, { url, label: newLinkLabel.trim() }])
                    setNewLinkUrl('')
                    setNewLinkLabel('')
                  }}
                  disabled={!newLinkUrl.trim()}
                  style={partsBinMode ? {
                    padding: '10px 18px',
                    background: newLinkUrl.trim() ? 'rgba(139,58,10,0.12)' : 'transparent',
                    border: newLinkUrl.trim() ? `1px solid ${COLOR_CARDBOARD_STAMP}` : `1px solid rgba(26,16,8,0.15)`,
                    cursor: newLinkUrl.trim() ? 'pointer' : 'default',
                    fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 15,
                    color: newLinkUrl.trim() ? COLOR_CARDBOARD_STAMP : 'rgba(26,16,8,0.25)',
                    WebkitTapHighlightColor: 'transparent',
                  } : {
                    padding: '10px 18px',
                    background: newLinkUrl.trim() ? 'rgba(105,12,22,0.12)' : 'transparent',
                    border: newLinkUrl.trim() ? '1px solid rgba(105,12,22,0.75)' : '1px solid rgba(245,240,228,0.11)',
                    cursor: newLinkUrl.trim() ? 'pointer' : 'default',
                    fontFamily: FONT_UI, fontWeight: 800, fontSize: 10,
                    letterSpacing: '0.14em', textTransform: 'uppercase' as const,
                    color: newLinkUrl.trim() ? '#c0303a' : 'rgba(245,240,228,0.22)',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  + Add Link
                </button>
              </div>
            </div>

            {/* Add to Timeline — build-sheet mode only, hidden when adding to an existing group */}
            {!partsBinMode && !existingSessionId && (
              <div style={{ padding: '24px 22px 0' }}>
                <button
                  onClick={() => setAddToTimeline(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 0, WebkitTapHighlightColor: 'transparent' }}
                >
                  <div style={{
                    width: 18, height: 18, flexShrink: 0,
                    border: `1.5px solid ${addToTimeline ? 'rgba(200,102,26,0.8)' : 'rgba(245,240,228,0.2)'}`,
                    background: addToTimeline ? 'rgba(200,102,26,0.15)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 150ms ease',
                  }}>
                    {addToTimeline && <span style={{ color: '#c8661a', fontSize: 11, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                  </div>
                  <div>
                    <div style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: addToTimeline ? 'rgba(200,102,26,0.85)' : 'rgba(245,240,228,0.45)' }}>
                      Add to Timeline
                    </div>
                    <div style={{ fontFamily: FONT_UI, fontSize: 10, color: 'rgba(245,240,228,0.28)', marginTop: 2 }}>
                      Log this mod as a chapter in your build story
                    </div>
                  </div>
                </button>
              </div>
            )}

            {/* Existing group context banner — shown when adding to a group */}
            {!partsBinMode && existingSessionId && existingGroupTitle && (
              <div style={{ padding: '24px 22px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: FONT_UI, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.28)' }}>Adding to</span>
                <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 13, color: 'rgba(245,240,228,0.65)', fontStyle: 'italic' }}>{existingGroupTitle}</span>
              </div>
            )}

            {/* Optional group name — solo mods only (hidden when adding to existing group) */}
            {!partsBinMode && !existingSessionId && (
              <div style={{ padding: '24px 22px 0' }}>
                <label style={lbl}>Part of a bigger install? <span style={{ opacity: 0.5, textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(optional)</span></label>
                <input
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  placeholder="e.g. Built Block, Big Turbo Kit…"
                  style={{ ...inp, caretColor: '#39ff14' }}
                />
              </div>
            )}

            {/* Full Specs toggle — always shown (Part Number lives here) */}
            <div style={{ padding: '24px 22px 0' }}>
              <button
                onClick={() => setSpecsExpanded(x => !x)}
                style={{
                  width: '100%', padding: '13px 0',
                  background: partsBinMode
                    ? (specsExpanded ? 'rgba(26,16,8,0.07)' : 'transparent')
                    : (specsExpanded ? 'rgba(18,55,190,0.1)' : 'transparent'),
                  border: partsBinMode
                    ? `1px solid ${specsExpanded ? 'rgba(26,16,8,0.3)' : 'rgba(26,16,8,0.15)'}`
                    : `1px solid ${specsExpanded ? 'rgba(18,55,190,0.4)' : 'rgba(245,240,228,0.13)'}`,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 200ms ease',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <span style={partsBinMode ? {
                  fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 15,
                  color: specsExpanded ? COLOR_CARDBOARD_INK : COLOR_CARDBOARD_INK2,
                  opacity: specsExpanded ? 0.75 : 0.45,
                } : {
                  fontFamily: FONT_UI, fontWeight: 800, fontSize: 10,
                  letterSpacing: '0.18em', textTransform: 'uppercase' as const,
                  color: specsExpanded ? 'rgba(60,100,220,0.82)' : 'rgba(245,240,228,0.42)',
                }}>
                  Full Specs
                </span>
                <span style={{
                  color: partsBinMode
                    ? (specsExpanded ? COLOR_CARDBOARD_INK : COLOR_CARDBOARD_INK2)
                    : (specsExpanded ? 'rgba(60,100,220,0.55)' : 'rgba(245,240,228,0.22)'),
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
                    <label style={lbl}>Part Number</label>
                    <input
                      value={form.partNumber}
                      onChange={e => setForm(f => ({ ...f, partNumber: e.target.value }))}
                      placeholder="e.g. 14004-AN001"
                      style={{ ...inp, caretColor: partsBinMode ? COLOR_CARDBOARD_INK : '#39ff14' }}
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
                        <span style={partsBinMode ? {
                          fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 14,
                          color: COLOR_CARDBOARD_INK2, opacity: 0.55,
                        } : {
                          fontFamily: FONT_UI, fontWeight: 700, fontSize: 10,
                          letterSpacing: '0.14em', textTransform: 'uppercase' as const,
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
                style={partsBinMode ? {
                  width: '100%', padding: '15px 0',
                  background: canSubmit ? 'rgba(139,58,10,0.08)' : 'transparent',
                  border: `1.5px solid ${canSubmit ? COLOR_CARDBOARD_STAMP : 'rgba(26,16,8,0.12)'}`,
                  fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 18,
                  color: canSubmit ? COLOR_CARDBOARD_STAMP : 'rgba(26,16,8,0.25)',
                  cursor: canSubmit ? 'pointer' : 'default',
                  transition: 'all 200ms ease',
                  WebkitTapHighlightColor: 'transparent',
                } : {
                  width: '100%', padding: '15px 0',
                  background: canSubmit ? 'rgba(105,12,22,0.22)' : 'transparent',
                  border: `1.5px solid ${canSubmit ? 'rgba(105,12,22,0.82)' : 'rgba(255,255,255,0.07)'}`,
                  fontFamily: FONT_UI, fontWeight: 800, fontSize: 12,
                  letterSpacing: '0.18em', textTransform: 'uppercase' as const,
                  color: canSubmit ? '#c0303a' : 'rgba(245,240,228,0.18)',
                  cursor: canSubmit ? 'pointer' : 'default',
                  transition: 'all 200ms ease',
                  boxShadow: canSubmit ? '0 0 16px rgba(105,12,22,0.28)' : 'none',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {saving ? (partsBinMode ? 'adding...' : 'Saving…') : partsBinMode ? 'Add Part' : 'Log It'}
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
