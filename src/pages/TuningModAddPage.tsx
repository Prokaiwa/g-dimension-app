// Route: /tuning/mod/add — New grouped mod add flow for Build Sheet
// Header form first (title, section, date, cost) → then add components one by one
// Each component: category picker → part type → component form → back to header

const _today = new Date().toISOString().split('T')[0]

import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import { TUNING_CATEGORIES } from './TuningBuildSheetPage'
import { FONT_UI, EASING_SETTLE, COLOR_ACCENT } from '../tokens'

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
  required: boolean
  is_advanced: boolean
  display_order: number
  group_label: string | null
  placeholder: string | null
  help_text: string | null
  unit_preference: string | null
}

interface PendingComponent {
  _id: string
  category: string
  partTypeId: number
  partTypeName: string
  title: string
  brand: string
  cost: string
  specValues: Record<string, string>
  multiValues: Record<string, string[]>
  specTemplates: SpecTemplate[]
}

// ── Style constants ───────────────────────────────────────────────────────

const LBL: React.CSSProperties = {
  display: 'block', fontFamily: FONT_UI, fontWeight: 700, fontSize: 10,
  letterSpacing: '0.14em', textTransform: 'uppercase',
  color: 'rgba(245,240,228,0.35)', marginBottom: 7,
}

const INP: React.CSSProperties = {
  display: 'block', width: '100%', boxSizing: 'border-box',
  background: 'transparent', border: 'none',
  borderBottom: '1px solid rgba(245,240,228,0.12)',
  padding: '9px 0', fontFamily: FONT_UI, fontWeight: 600, fontSize: 15,
  color: 'rgba(245,240,228,0.9)', outline: 'none',
  WebkitAppearance: 'none' as const,
}

const TILE_SHADOW = '-5px 0 7px -1px rgba(105,12,22,0.65), 0 5px 7px -1px rgba(18,55,190,0.5)'

// ── Helpers ───────────────────────────────────────────────────────────────

function parseOpts(raw: string | null): string[] {
  if (!raw) return []
  try { return JSON.parse(raw) as string[] } catch { return [] }
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item)
    ;(acc[k] ??= []).push(item)
    return acc
  }, {} as Record<string, T[]>)
}

// ── Component ─────────────────────────────────────────────────────────────

export default function TuningModAddPage() {
  const navigate = useNavigate()

  // ── Step state: 0=header, 1=pick-category, 2=pick-part-type, 3=component-form
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0)

  // ── Header form state ──
  const [modTitle,      setModTitle]      = useState('')
  const [date,          setDate]          = useState(_today)
  const [performedBy,   setPerformedBy]   = useState<'self' | 'shop' | null>(null)
  const [shopName,      setShopName]      = useState('')
  const [totalCost,     setTotalCost]     = useState('')
  const [notes,         setNotes]         = useState('')
  const [addToTimeline, setAddToTimeline] = useState(true)
  const [components,    setComponents]    = useState<PendingComponent[]>([])

  // ── Category / part-type picker state ──
  const [pressed,         setPressed]         = useState<string | null>(null)
  const [selectedCat,     setSelectedCat]     = useState<string | null>(null)
  const [partTypes,       setPartTypes]       = useState<PartType[]>([])
  const [partTypesLoading, setPartTypesLoading] = useState(false)
  const [selectedPT,      setSelectedPT]      = useState<PartType | null>(null)

  // ── Component sub-form state ──
  const [compTitle,           setCompTitle]           = useState('')
  const [compBrand,           setCompBrand]           = useState('')
  const [compCost,            setCompCost]            = useState('')
  const [compSpecValues,      setCompSpecValues]      = useState<Record<string, string>>({})
  const [compMultiValues,     setCompMultiValues]     = useState<Record<string, string[]>>({})
  const [compSpecTemplates,   setCompSpecTemplates]   = useState<SpecTemplate[]>([])
  const [compSpecsExpanded,   setCompSpecsExpanded]   = useState(false)
  const [compAdvExpanded,     setCompAdvExpanded]     = useState(false)

  // ── Save state ──
  const [saving, setSaving] = useState(false)

  const release = () => setPressed(null)

  // Load part types when category selected
  useEffect(() => {
    if (!selectedCat) return
    setPartTypesLoading(true)
    setSelectedPT(null)
    setPartTypes([])
    supabase.from('part_types')
      .select('id, name, display_order, notes_placeholder')
      .eq('category', selectedCat).eq('is_active', true)
      .order('display_order', { ascending: true })
      .then(({ data }) => {
        setPartTypesLoading(false)
        if (data) setPartTypes(data)
      })
  }, [selectedCat])

  // Load spec templates when part type selected
  useEffect(() => {
    if (!selectedPT) return
    supabase.from('spec_templates')
      .select('spec_key, spec_label, input_type, options, unit, unit_preference, required, is_advanced, display_order, group_label, help_text, placeholder')
      .eq('part_type_id', selectedPT.id)
      .order('display_order', { ascending: true })
      .then(({ data }) => {
        setCompSpecTemplates((data as unknown as SpecTemplate[]) ?? [])
        setCompSpecValues({})
        setCompMultiValues({})
        setCompSpecsExpanded(false)
        setCompAdvExpanded(false)
      })
  }, [selectedPT])

  // ── Navigation ──────────────────────────────────────────────────────────

  function handleBack() {
    if (step === 0) navigate('/tuning/build-sheet')
    else if (step === 1) setStep(0)
    else if (step === 2) { setSelectedCat(null); setStep(1) }
    else {
      // step 3 → back to part type picker, reset comp form
      setCompTitle(''); setCompBrand(''); setCompCost('')
      setCompSpecValues({}); setCompMultiValues({})
      setCompSpecTemplates([])
      setSelectedPT(null)
      setStep(2)
    }
  }

  function selectCategory(catId: string) {
    setSelectedCat(catId)
    setStep(2)
  }

  function selectPartType(pt: PartType) {
    setSelectedPT(pt)
    setStep(3)
  }

  function commitComponent() {
    if (!compTitle.trim() || !selectedCat || !selectedPT) return
    const comp: PendingComponent = {
      _id: Math.random().toString(36).slice(2),
      category: selectedCat,
      partTypeId: selectedPT.id,
      partTypeName: selectedPT.name,
      title: compTitle.trim(),
      brand: compBrand.trim(),
      cost: compCost,
      specValues: { ...compSpecValues },
      multiValues: { ...compMultiValues },
      specTemplates: [...compSpecTemplates],
    }
    setComponents(prev => [...prev, comp])
    // Reset
    setCompTitle(''); setCompBrand(''); setCompCost('')
    setCompSpecValues({}); setCompMultiValues({})
    setCompSpecTemplates([])
    setCompSpecsExpanded(false); setCompAdvExpanded(false)
    setSelectedCat(null); setSelectedPT(null); setPartTypes([])
    setStep(0)
  }

  function removeComponent(id: string) {
    setComponents(prev => prev.filter(c => c._id !== id))
  }

  // ── Save ────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!modTitle.trim() || components.length === 0 || saving) return
    setSaving(true)
    const carId = await getActiveCarId()
    const { data: { session: auth } } = await supabase.auth.getSession()
    const userId = auth?.user?.id
    if (!carId || !userId) { setSaving(false); return }

    // Insert session (the "envelope")
    const { data: sess, error: sessErr } = await supabase.from('sessions').insert({
      car_id: carId,
      type: 'modification',
      title: modTitle.trim(),
      date_performed: date,
      performed_by: performedBy || null,
      shop_name: performedBy === 'shop' ? shopName.trim() || null : null,
      total_cost: totalCost ? parseFloat(totalCost) : null,
      notes: notes.trim() || null,
      add_to_timeline: addToTimeline,
    }).select('id').single()

    if (sessErr || !sess) { setSaving(false); return }
    const sessionId = (sess as { id: string }).id

    // Insert each component as a job
    for (const comp of components) {
      const { data: job, error: jobErr } = await supabase.from('jobs').insert({
        car_id: carId,
        session_id: sessionId,
        type: 'modification',
        category: comp.category,
        part_type_id: comp.partTypeId,
        title: comp.title,
        brand: comp.brand || null,
        parts_cost: comp.cost ? parseFloat(comp.cost) : null,
        installed_by: performedBy || null,
        status: 'installed',
      }).select('id').single()

      if (jobErr || !job) continue
      const jobId = (job as { id: string }).id

      // Insert specs
      type SpecRow = { job_id: string; spec_key: string; spec_value: string; spec_unit: string | null }
      const specRows: SpecRow[] = []
      for (const t of comp.specTemplates) {
        if (t.input_type === 'multiselect') {
          const vals = comp.multiValues[t.spec_key] ?? []
          if (vals.length > 0)
            specRows.push({ job_id: jobId, spec_key: t.spec_key, spec_value: JSON.stringify(vals), spec_unit: t.unit ?? null })
        } else {
          const v = comp.specValues[t.spec_key]
          if (v && v !== '' && v !== 'false')
            specRows.push({ job_id: jobId, spec_key: t.spec_key, spec_value: v, spec_unit: t.unit ?? null })
        }
      }
      if (specRows.length > 0) await supabase.from('job_specs').insert(specRows)
    }

    setSaving(false)
    navigate('/tuning/build-sheet')
  }

  // ── Spec rendering ───────────────────────────────────────────────────────

  function setSpecVal(key: string, val: string) {
    setCompSpecValues(v => ({ ...v, [key]: val }))
  }

  function toggleMulti(key: string, option: string) {
    setCompMultiValues(v => {
      const cur = v[key] ?? []
      return { ...v, [key]: cur.includes(option) ? cur.filter(x => x !== option) : [...cur, option] }
    })
  }

  function renderSpecField(t: SpecTemplate) {
    const opts = parseOpts(t.options)
    const val  = compSpecValues[t.spec_key] ?? ''
    if ((t.input_type === 'select' || t.input_type === 'multiselect') && opts.length === 0) return null
    return (
      <div key={t.spec_key} style={{ paddingTop: 18 }}>
        <label style={LBL}>{t.spec_label}</label>
        {t.input_type === 'text' && (
          <input value={val} onChange={e => setSpecVal(t.spec_key, e.target.value)} placeholder={t.placeholder ?? ''} style={{ ...INP, caretColor: '#39ff14' }} />
        )}
        {t.input_type === 'number' && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <input type="number" value={val} onChange={e => setSpecVal(t.spec_key, e.target.value)} placeholder={t.placeholder ?? ''} style={{ ...INP, flex: 1, caretColor: '#39ff14' }} />
            {t.unit && <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 12, color: 'rgba(245,240,228,0.32)', marginLeft: 8, whiteSpace: 'nowrap' }}>{t.unit}</span>}
          </div>
        )}
        {t.input_type === 'date' && (
          <input type="date" value={val} onChange={e => setSpecVal(t.spec_key, e.target.value)} style={{ ...INP, colorScheme: 'dark', caretColor: '#39ff14' }} />
        )}
        {t.input_type === 'select' && opts.length > 0 && (
          <select value={val} onChange={e => setSpecVal(t.spec_key, e.target.value)} style={{ ...INP, cursor: 'pointer', colorScheme: 'dark' }}>
            <option value="">—</option>
            {opts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        {t.input_type === 'multiselect' && opts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 6 }}>
            {opts.map(o => {
              const checked = (compMultiValues[t.spec_key] ?? []).includes(o)
              return (
                <label key={o} onClick={() => toggleMulti(t.spec_key, o)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <div style={{ width: 18, height: 18, flexShrink: 0, border: `1.5px solid ${checked ? 'rgba(200,102,26,0.8)' : 'rgba(245,240,228,0.2)'}`, background: checked ? 'rgba(200,102,26,0.15)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {checked && <span style={{ color: '#c8661a', fontSize: 11, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                  </div>
                  <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 14, color: 'rgba(245,240,228,0.75)' }}>{o}</span>
                </label>
              )
            })}
          </div>
        )}
        {t.input_type === 'boolean' && (
          <div onClick={() => setSpecVal(t.spec_key, val === 'true' ? 'false' : 'true')} style={{ width: 44, height: 26, position: 'relative', cursor: 'pointer', background: val === 'true' ? 'rgba(200,102,26,0.35)' : 'rgba(245,240,228,0.07)', border: `1.5px solid ${val === 'true' ? 'rgba(200,102,26,0.65)' : 'rgba(245,240,228,0.14)'}`, borderRadius: 13, transition: 'background 200ms, border-color 200ms' }}>
            <div style={{ position: 'absolute', top: 3, left: val === 'true' ? 20 : 3, width: 16, height: 16, borderRadius: '50%', background: val === 'true' ? '#c8661a' : 'rgba(245,240,228,0.28)', transition: 'left 200ms, background 200ms' }} />
          </div>
        )}
        {t.help_text && <p style={{ fontFamily: FONT_UI, fontSize: 11, color: 'rgba(245,240,228,0.28)', marginTop: 5, lineHeight: 1.5 }}>{t.help_text}</p>}
      </div>
    )
  }

  const MAIN_FORM_KEYS = new Set(['brand'])
  const basicSpecs    = compSpecTemplates.filter(t => !t.is_advanced && !MAIN_FORM_KEYS.has(t.spec_key))
  const advancedSpecs = compSpecTemplates.filter(t => t.is_advanced  && !MAIN_FORM_KEYS.has(t.spec_key))
  const basicGroups   = groupBy(basicSpecs, t => t.group_label ?? '')
  const advancedGroups = groupBy(advancedSpecs, t => t.group_label ?? '')

  const canSave = modTitle.trim().length > 0 && components.length > 0 && !saving
  const canCommitComp = compTitle.trim().length > 0 && !!selectedCat && !!selectedPT

  const backLabel =
    step === 0 ? 'Cancel' :
    step === 1 ? 'Back to Form' :
    step === 2 ? (TUNING_CATEGORIES.find(c => c.id === selectedCat)?.label ?? 'Back') :
    (selectedPT?.name ?? 'Back')

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
        input[type="date"]::-webkit-calendar-picker-indicator { opacity: 0.3; cursor: pointer; }
      `}</style>

      {/* Back button */}
      <button
        onClick={handleBack}
        style={{ position: 'absolute', top: 0, left: 0, height: 52, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', zIndex: 30, WebkitTapHighlightColor: 'transparent' }}
      >
        <span style={{ color: 'rgba(245,240,228,0.5)', fontSize: 22, fontWeight: 300 }}>‹</span>
        <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.4)' }}>{backLabel}</span>
      </button>

      {/* 4-panel sliding strip */}
      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0,
        width: '400%', display: 'flex',
        transform: `translateX(${-(step) * 25}%)`,
        transition: 'transform 280ms ease-in-out',
        willChange: 'transform',
      }}>

        {/* ─── Panel 0: Header form ─────────────────────────────────────── */}
        <div style={{ width: '25%', height: '100%', overflowY: 'auto', flexShrink: 0, paddingTop: 52, paddingBottom: 72 }}>

          {/* Build Sheet Name */}
          <div style={{ padding: '8px 22px 0' }}>
            <label style={LBL}>Build Sheet Name *</label>
            <input
              value={modTitle}
              onChange={e => setModTitle(e.target.value)}
              placeholder="e.g. Built Block, Big Turbo Kit…"
              style={{ ...INP, fontSize: 18, caretColor: '#39ff14' }}
            />
          </div>

          {/* Date + Performed By */}
          <div style={{ padding: '24px 22px 0' }}>
            <label style={LBL}>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...INP, colorScheme: 'dark', caretColor: '#39ff14' }} />
          </div>
          <div style={{ padding: '20px 22px 0' }}>
            <label style={LBL}>Performed By</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['self', 'shop'] as const).map(opt => {
                const active = performedBy === opt
                return (
                  <button key={opt} onClick={() => setPerformedBy(active ? null : opt)} style={{ flex: 1, padding: '11px 0', background: active ? 'rgba(105,12,22,0.22)' : 'transparent', border: `1.5px solid ${active ? 'rgba(105,12,22,0.75)' : 'rgba(245,240,228,0.11)'}`, cursor: 'pointer', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: active ? '#c0303a' : 'rgba(245,240,228,0.38)', transition: 'all 200ms ease', WebkitTapHighlightColor: 'transparent' }}>
                    {opt === 'self' ? 'Self' : 'Shop'}
                  </button>
                )
              })}
            </div>
            {performedBy === 'shop' && (
              <div style={{ marginTop: 16 }}>
                <label style={LBL}>Shop Name</label>
                <input value={shopName} onChange={e => setShopName(e.target.value)} placeholder="e.g. JGY Engines" style={{ ...INP, caretColor: '#39ff14' }} />
              </div>
            )}
          </div>

          {/* Total Cost */}
          <div style={{ padding: '20px 22px 0' }}>
            <label style={LBL}>Total Cost</label>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 14, color: 'rgba(245,240,228,0.38)', marginRight: 4, paddingBottom: 1 }}>$</span>
              <input type="number" inputMode="decimal" min="0" step="0.01" value={totalCost} onChange={e => setTotalCost(e.target.value)} placeholder="0.00" style={{ ...INP, flex: 1, caretColor: '#39ff14' }} />
            </div>
          </div>

          {/* Notes */}
          <div style={{ padding: '20px 22px 0' }}>
            <label style={LBL}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Build notes, dyno results, shop info…" rows={3} style={{ ...INP, resize: 'none', lineHeight: 1.6, caretColor: '#39ff14' } as React.CSSProperties} />
          </div>

          {/* Components */}
          <div style={{ padding: '28px 22px 0' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
              <label style={{ ...LBL, marginBottom: 0 }}>Components {components.length > 0 ? `(${components.length})` : ''}</label>
              <button
                onClick={() => setStep(1)}
                style={{ background: 'none', border: '1px solid rgba(200,102,26,0.45)', padding: '5px 12px', cursor: 'pointer', fontFamily: FONT_UI, fontWeight: 800, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: COLOR_ACCENT, WebkitTapHighlightColor: 'transparent' }}
              >
                + Add Component
              </button>
            </div>

            {components.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', border: '1px dashed rgba(245,240,228,0.08)' }}>
                <p style={{ fontFamily: FONT_UI, fontSize: 12, color: 'rgba(245,240,228,0.22)', margin: 0, lineHeight: 1.6 }}>No components yet.{'\n'}Tap + Add Component to start.</p>
              </div>
            ) : (
              <div>
                {components.map((comp) => (
                  <div key={comp._id} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(245,240,228,0.06)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 14, color: 'rgba(245,240,228,0.85)' }}>{comp.title}</div>
                      <div style={{ fontFamily: FONT_UI, fontSize: 11, color: 'rgba(245,240,228,0.32)', marginTop: 2 }}>
                        {comp.partTypeName}{comp.brand ? ` · ${comp.brand}` : ''}{comp.cost ? ` · $${comp.cost}` : ''}
                      </div>
                    </div>
                    <button onClick={() => removeComponent(comp._id)} style={{ flexShrink: 0, width: 28, height: 28, borderRadius: '50%', background: 'rgba(245,240,228,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent', marginLeft: 8 }}>
                      <span style={{ color: 'rgba(245,240,228,0.4)', fontSize: 14, lineHeight: 1 }}>×</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add to Timeline */}
          <div style={{ padding: '24px 22px 0' }}>
            <button onClick={() => setAddToTimeline(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 0, WebkitTapHighlightColor: 'transparent' }}>
              <div style={{ width: 18, height: 18, flexShrink: 0, border: `1.5px solid ${addToTimeline ? 'rgba(200,102,26,0.8)' : 'rgba(245,240,228,0.2)'}`, background: addToTimeline ? 'rgba(200,102,26,0.15)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 150ms ease' }}>
                {addToTimeline && <span style={{ color: '#c8661a', fontSize: 11, fontWeight: 900, lineHeight: 1 }}>✓</span>}
              </div>
              <div>
                <div style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: addToTimeline ? 'rgba(200,102,26,0.85)' : 'rgba(245,240,228,0.45)' }}>Add to Timeline</div>
                <div style={{ fontFamily: FONT_UI, fontSize: 10, color: 'rgba(245,240,228,0.28)', marginTop: 2 }}>Log this build as a chapter in your build story</div>
              </div>
            </button>
          </div>

          {/* Save button */}
          <div style={{ padding: '32px 22px 0' }}>
            <button onClick={handleSave} disabled={!canSave} style={{ width: '100%', padding: '15px 0', background: canSave ? 'rgba(105,12,22,0.22)' : 'transparent', border: `1.5px solid ${canSave ? 'rgba(105,12,22,0.82)' : 'rgba(255,255,255,0.07)'}`, fontFamily: FONT_UI, fontWeight: 800, fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: canSave ? '#c0303a' : 'rgba(245,240,228,0.18)', cursor: canSave ? 'pointer' : 'default', transition: 'all 200ms ease', boxShadow: canSave ? '0 0 16px rgba(105,12,22,0.28)' : 'none', WebkitTapHighlightColor: 'transparent' }}>
              {saving ? 'Saving…' : 'Log It'}
            </button>
            {!canSave && !saving && (
              <p style={{ fontFamily: FONT_UI, fontSize: 10, color: 'rgba(245,240,228,0.22)', marginTop: 8, textAlign: 'center', lineHeight: 1.5, letterSpacing: '0.06em' }}>
                {!modTitle.trim() ? 'Add a build sheet name' : 'Add at least one component'}
              </p>
            )}
          </div>

        </div>

        {/* ─── Panel 1: Category picker ─────────────────────────────────── */}
        <div style={{ width: '25%', height: '100%', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ paddingTop: 52, height: '100%', overflowY: 'auto' }}>
            <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.25)', textAlign: 'center', margin: '8px 0 16px' }}>
              Component Category
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(6, 1fr)', gap: 8, padding: '0 16px 20px', height: 'calc(100% - 52px)' }}>
              {TUNING_CATEGORIES.filter(c => c.id !== 'Other').map((cat, i) => (
                <button key={cat.id} onClick={() => selectCategory(cat.id)} onPointerDown={() => setPressed(cat.id)} onPointerUp={release} onPointerLeave={release} onPointerCancel={release}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 4px 4px 8px', animation: `tileIn 320ms ${EASING_SETTLE} ${i * 28}ms both`, WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation', userSelect: 'none' }}>
                  <div style={{ width: '100%', height: '100%', background: '#0a0a0c', boxShadow: TILE_SHADOW, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, transform: pressed === cat.id ? 'scale(0.93)' : 'scale(1)', transition: pressed === cat.id ? 'transform 80ms ease-out' : 'transform 200ms cubic-bezier(0.22,1,0.36,1)' }}>
                    <img src={cat.icon!} alt={cat.label} draggable={false} style={{ width: 66, height: 66, objectFit: 'contain', pointerEvents: 'none' }} />
                    <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.55)' }}>{cat.label}</span>
                  </div>
                </button>
              ))}
              <div />
              <button onClick={() => selectCategory('Other')} onPointerDown={() => setPressed('Other')} onPointerUp={release} onPointerLeave={release} onPointerCancel={release}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 4px 4px 8px', animation: `tileIn 320ms ${EASING_SETTLE} ${15 * 28}ms both`, WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation', userSelect: 'none' }}>
                <div style={{ width: '100%', height: '100%', background: '#0a0a0c', boxShadow: TILE_SHADOW, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: pressed === 'Other' ? 'scale(0.93)' : 'scale(1)', transition: pressed === 'Other' ? 'transform 80ms ease-out' : 'transform 200ms cubic-bezier(0.22,1,0.36,1)' }}>
                  <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 13, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.45)' }}>Other</span>
                </div>
              </button>
              <div />
            </div>
          </div>
        </div>

        {/* ─── Panel 2: Part type picker ────────────────────────────────── */}
        <div style={{ width: '25%', height: '100%', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ height: '100%', overflowY: 'auto', paddingTop: 52 }}>
            {partTypesLoading && (
              <div style={{ padding: '40px 22px', textAlign: 'center' }}>
                <span style={{ fontFamily: FONT_UI, fontSize: 12, letterSpacing: '0.1em', color: 'rgba(245,240,228,0.25)' }}>Loading…</span>
              </div>
            )}
            {!partTypesLoading && partTypes.map((pt, i) => (
              <button key={pt.id} onClick={() => selectPartType(pt)} style={{ display: 'block', width: '100%', padding: '15px 22px', background: 'none', border: 'none', borderBottom: '1px solid rgba(245,240,228,0.05)', cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent', animation: `rowIn 250ms ${EASING_SETTLE} ${i * 25}ms both` }}>
                <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 14, color: 'rgba(245,240,228,0.78)' }}>{pt.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ─── Panel 3: Component form ──────────────────────────────────── */}
        <div style={{ width: '25%', height: '100%', overflowY: 'auto', flexShrink: 0, paddingTop: 52, paddingBottom: 72 }}>

          {selectedPT && (
            <div style={{ padding: '4px 22px 0' }}>
              <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(200,102,26,0.6)', margin: '0 0 16px' }}>
                {selectedPT.name}
              </p>
            </div>
          )}

          {/* Component title */}
          <div style={{ padding: '4px 22px 0' }}>
            <label style={LBL}>Part Name *</label>
            <input value={compTitle} onChange={e => setCompTitle(e.target.value)} placeholder={`e.g. ${selectedPT?.name ?? 'Part name'}`} style={{ ...INP, caretColor: '#39ff14' }} />
          </div>

          {/* Brand */}
          <div style={{ padding: '20px 22px 0' }}>
            <label style={LBL}>Brand</label>
            <input value={compBrand} onChange={e => setCompBrand(e.target.value)} placeholder="e.g. Wiseco" style={{ ...INP, caretColor: '#39ff14' }} />
          </div>

          {/* Cost */}
          <div style={{ padding: '20px 22px 0' }}>
            <label style={LBL}>Part Cost</label>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 14, color: 'rgba(245,240,228,0.38)', marginRight: 4, paddingBottom: 1 }}>$</span>
              <input type="number" inputMode="decimal" min="0" step="0.01" value={compCost} onChange={e => setCompCost(e.target.value)} placeholder="0.00" style={{ ...INP, flex: 1, caretColor: '#39ff14' }} />
            </div>
          </div>

          {/* Full Specs toggle */}
          {compSpecTemplates.length > 0 && (
            <div style={{ padding: '24px 22px 0' }}>
              <button onClick={() => setCompSpecsExpanded(x => !x)} style={{ width: '100%', padding: '13px 0', background: compSpecsExpanded ? 'rgba(18,55,190,0.1)' : 'transparent', border: `1px solid ${compSpecsExpanded ? 'rgba(18,55,190,0.4)' : 'rgba(245,240,228,0.13)'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 200ms ease', WebkitTapHighlightColor: 'transparent' }}>
                <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: compSpecsExpanded ? 'rgba(60,100,220,0.82)' : 'rgba(245,240,228,0.42)' }}>Full Specs</span>
                <span style={{ color: compSpecsExpanded ? 'rgba(60,100,220,0.55)' : 'rgba(245,240,228,0.22)', fontSize: 11, display: 'inline-block', transform: compSpecsExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 200ms ease' }}>▾</span>
              </button>

              {compSpecsExpanded && (
                <div style={{ paddingTop: 8 }}>
                  {Object.entries(basicGroups).map(([groupLabel, fields]) => (
                    <div key={groupLabel || '__ungrouped__'}>{fields.map(renderSpecField)}</div>
                  ))}
                  {advancedSpecs.length > 0 && (
                    <div style={{ marginTop: 28 }}>
                      <button onClick={() => setCompAdvExpanded(x => !x)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0', display: 'flex', alignItems: 'center', gap: 6, WebkitTapHighlightColor: 'transparent' }}>
                        <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.28)' }}>
                          {compAdvExpanded ? '− Advanced Specs' : '+ Advanced Specs'}
                        </span>
                      </button>
                      {compAdvExpanded && Object.entries(advancedGroups).map(([groupLabel, fields]) => (
                        <div key={groupLabel || '__adv__'} style={{ marginTop: 16 }}>{fields.map(renderSpecField)}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Add Component button */}
          <div style={{ padding: '32px 22px 0' }}>
            <button onClick={commitComponent} disabled={!canCommitComp} style={{ width: '100%', padding: '15px 0', background: canCommitComp ? 'rgba(18,55,190,0.15)' : 'transparent', border: `1.5px solid ${canCommitComp ? 'rgba(18,55,190,0.65)' : 'rgba(255,255,255,0.07)'}`, fontFamily: FONT_UI, fontWeight: 800, fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: canCommitComp ? 'rgba(100,140,230,0.9)' : 'rgba(245,240,228,0.18)', cursor: canCommitComp ? 'pointer' : 'default', transition: 'all 200ms ease', WebkitTapHighlightColor: 'transparent' }}>
              Add Component
            </button>
          </div>

        </div>

      </div>
    </div>
  )
}
