// Route: /tuning/mods/:modId/edit
import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { FONT_UI, COLOR_ACCENT, COLOR_HEADER_BLACK, COLOR_HEADER_WARM, HEADER_HEIGHT } from '../tokens'

// ── Types ─────────────────────────────────────────────────────────────────

interface SpecTemplate {
  spec_key: string
  spec_label: string
  input_type: 'text' | 'number' | 'select' | 'multiselect' | 'boolean' | 'date'
  options: unknown
  unit: string | null
  is_advanced: boolean
  display_order: number
  group_label: string | null
  help_text: string | null
  placeholder: string | null
}

// ── Style constants ────────────────────────────────────────────────────────

const LABEL: React.CSSProperties = {
  display: 'block',
  fontFamily: FONT_UI, fontWeight: 700, fontSize: 10,
  letterSpacing: '0.14em', textTransform: 'uppercase',
  color: 'rgba(245,240,228,0.35)', marginBottom: 7,
}

const INPUT: React.CSSProperties = {
  display: 'block', width: '100%', boxSizing: 'border-box',
  background: 'transparent', border: 'none',
  borderBottom: '1px solid rgba(245,240,228,0.12)',
  padding: '9px 0',
  fontFamily: FONT_UI, fontWeight: 600, fontSize: 15,
  color: 'rgba(245,240,228,0.9)', outline: 'none',
  WebkitAppearance: 'none' as const,
}

const SECTION: React.CSSProperties = {
  padding: '24px 20px 0',
}

// ── Helpers ───────────────────────────────────────────────────────────────

function parseOptions(raw: unknown): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw as string[]
  try { return JSON.parse(raw as string) as string[] } catch { return [] }
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item)
    ;(acc[k] ??= []).push(item)
    return acc
  }, {} as Record<string, T[]>)
}

// ── Component ──────────────────────────────────────────────────────────────

export default function TuningModEditPage() {
  const { modId }  = useParams<{ modId: string }>()
  const navigate   = useNavigate()

  // Basic fields
  const [title,        setTitle]        = useState('')
  const [brand,        setBrand]        = useState('')
  const [partNumber,   setPartNumber]   = useState('')
  const [dateInstalled,setDateInstalled]= useState('')
  const [installedBy,  setInstalledBy]  = useState<'self' | 'shop' | ''>('')
  const [partsCost,    setPartsCost]    = useState('')
  const [laborCost,    setLaborCost]    = useState('')
  const [notes,        setNotes]        = useState('')

  // Spec fields
  const [specTemplates, setSpecTemplates] = useState<SpecTemplate[]>([])
  const [specValues,    setSpecValues]    = useState<Record<string, string>>({})
  const [multiValues,   setMultiValues]   = useState<Record<string, string[]>>({})

  // UI state
  const [partTypeName,  setPartTypeName]  = useState('')
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [saveErr,       setSaveErr]       = useState<string | null>(null)
  const [showAdvanced,  setShowAdvanced]  = useState(false)

  useEffect(() => {
    if (!modId) return
    async function load() {
      // Load job + specs in parallel
      const [{ data: job }, { data: existingSpecs }] = await Promise.all([
        supabase
          .from('jobs')
          .select('title, brand, part_number, date_installed, installed_by, parts_cost, labor_cost, notes, part_type_id')
          .eq('id', modId)
          .single(),
        supabase
          .from('job_specs')
          .select('spec_key, spec_value, spec_unit')
          .eq('job_id', modId),
      ])

      if (!job) { setLoading(false); return }

      // Pre-fill basic fields
      setTitle(job.title ?? '')
      setBrand(job.brand ?? '')
      setPartNumber(job.part_number ?? '')
      setDateInstalled(job.date_installed ?? '')
      setInstalledBy(job.installed_by ?? '')
      setPartsCost(job.parts_cost != null ? String(job.parts_cost) : '')
      setLaborCost(job.labor_cost != null ? String(job.labor_cost) : '')
      setNotes(job.notes ?? '')

      if (job.part_type_id) {
        // Load part type name + spec templates
        const [{ data: pt }, { data: templates }] = await Promise.all([
          supabase.from('part_types').select('name').eq('id', job.part_type_id).single(),
          supabase
            .from('spec_templates')
            .select('spec_key, spec_label, input_type, options, unit, is_advanced, display_order, group_label, help_text, placeholder')
            .eq('part_type_id', job.part_type_id)
            .order('display_order'),
        ])

        if (pt) setPartTypeName((pt as { name: string }).name)

        const tmplList = (templates ?? []) as SpecTemplate[]
        setSpecTemplates(tmplList)

        // Pre-fill spec values from existing job_specs
        const sv: Record<string, string>   = {}
        const mv: Record<string, string[]> = {}
        for (const s of existingSpecs ?? []) {
          const tmpl = tmplList.find(t => t.spec_key === s.spec_key)
          if (!tmpl) continue
          if (tmpl.input_type === 'multiselect') {
            try { mv[s.spec_key] = JSON.parse(s.spec_value) } catch { mv[s.spec_key] = [] }
          } else {
            sv[s.spec_key] = s.spec_value
          }
        }
        setSpecValues(sv)
        setMultiValues(mv)
      }

      setLoading(false)
    }
    load()
  }, [modId])

  // ── Spec field helpers ─────────────────────────────────────────────────

  const setSpecVal = (key: string, val: string) =>
    setSpecValues(prev => ({ ...prev, [key]: val }))

  const toggleMulti = (key: string, opt: string) =>
    setMultiValues(prev => {
      const cur = prev[key] ?? []
      return { ...prev, [key]: cur.includes(opt) ? cur.filter(x => x !== opt) : [...cur, opt] }
    })

  // ── Spec field renderer ────────────────────────────────────────────────

  const renderSpecField = (t: SpecTemplate) => {
    const opts = parseOptions(t.options)
    const val  = specValues[t.spec_key] ?? ''

    if ((t.input_type === 'select' || t.input_type === 'multiselect') && opts.length === 0) return null

    return (
      <div key={t.spec_key} style={{ paddingTop: 18 }}>
        <label style={LABEL}>{t.spec_label}</label>

        {t.input_type === 'text' && (
          <>
            <input value={val} onChange={e => setSpecVal(t.spec_key, e.target.value)}
              placeholder={t.placeholder ?? ''} style={{ ...INPUT, caretColor: '#39ff14' }} />
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
              <input type="number" value={val} onChange={e => setSpecVal(t.spec_key, e.target.value)}
                placeholder={t.placeholder ?? ''} style={{ ...INPUT, flex: 1, caretColor: '#39ff14' }} />
              {t.unit && (
                <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 12, color: 'rgba(245,240,228,0.32)', marginLeft: 8, whiteSpace: 'nowrap' }}>
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
          <input type="date" value={val} onChange={e => setSpecVal(t.spec_key, e.target.value)}
            style={{ ...INPUT, colorScheme: 'dark', caretColor: '#39ff14' }} />
        )}

        {t.input_type === 'select' && opts.length > 0 && (
          <select value={val} onChange={e => setSpecVal(t.spec_key, e.target.value)}
            style={{ ...INPUT, cursor: 'pointer', colorScheme: 'dark' }}>
            <option value="">—</option>
            {opts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        )}

        {t.input_type === 'multiselect' && opts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 6 }}>
            {opts.map(o => {
              const checked = (multiValues[t.spec_key] ?? []).includes(o)
              return (
                <label key={o} onClick={() => toggleMulti(t.spec_key, o)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
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
          <div onClick={() => setSpecVal(t.spec_key, val === 'true' ? 'false' : 'true')}
            style={{
              width: 44, height: 26, position: 'relative', cursor: 'pointer',
              background: val === 'true' ? 'rgba(200,102,26,0.35)' : 'rgba(245,240,228,0.07)',
              border: `1.5px solid ${val === 'true' ? 'rgba(200,102,26,0.65)' : 'rgba(245,240,228,0.14)'}`,
              borderRadius: 13, transition: 'background 200ms, border-color 200ms',
            }}>
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

  // ── Save ──────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!title.trim() || saving) return
    setSaving(true)
    setSaveErr(null)

    // 1. UPDATE job core fields
    const { error: jobErr } = await supabase
      .from('jobs')
      .update({
        title:          title.trim(),
        brand:          brand.trim()      || null,
        part_number:    partNumber.trim() || null,
        date_installed: dateInstalled     || null,
        installed_by:   installedBy       || null,
        parts_cost:     partsCost  ? parseFloat(partsCost)  : null,
        labor_cost:     installedBy === 'shop' && laborCost ? parseFloat(laborCost) : null,
        notes:          notes.trim()      || null,
      })
      .eq('id', modId!)

    if (jobErr) {
      setSaveErr(jobErr.message)
      setSaving(false)
      return
    }

    // 2. Replace all job_specs — delete existing then insert fresh set
    await supabase.from('job_specs').delete().eq('job_id', modId!)

    const specRows: { job_id: string; spec_key: string; spec_value: string; spec_unit: string | null }[] = []
    for (const t of specTemplates) {
      if (t.input_type === 'multiselect') {
        const vals = multiValues[t.spec_key] ?? []
        if (vals.length > 0) {
          specRows.push({ job_id: modId!, spec_key: t.spec_key, spec_value: JSON.stringify(vals), spec_unit: t.unit ?? null })
        }
      } else {
        const v = specValues[t.spec_key]
        if (v && v !== '' && v !== 'false') {
          specRows.push({ job_id: modId!, spec_key: t.spec_key, spec_value: String(v), spec_unit: t.unit ?? null })
        }
      }
    }

    if (specRows.length > 0) {
      const { error: specErr } = await supabase.from('job_specs').insert(specRows)
      if (specErr) {
        setSaveErr(specErr.message)
        setSaving(false)
        return
      }
    }

    navigate(`/tuning/mods/${modId}`)
  }

  // ── Render ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ height: '100dvh', background: '#0d0d0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: FONT_UI, fontSize: 11, color: 'rgba(245,240,228,0.2)', letterSpacing: '0.12em' }}>LOADING</span>
      </div>
    )
  }

  const basicSpecs    = specTemplates.filter(t => !t.is_advanced)
  const advancedSpecs = specTemplates.filter(t =>  t.is_advanced)
  const basicGroups   = groupBy(basicSpecs,    t => t.group_label ?? '')
  const advancedGroups= groupBy(advancedSpecs, t => t.group_label ?? '')

  return (
    <div style={{ minHeight: '100dvh', background: '#0d0d0f', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{
        height: HEADER_HEIGHT, flexShrink: 0,
        background: COLOR_HEADER_BLACK,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingLeft: 4, paddingRight: 16,
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button
          onClick={() => navigate(`/tuning/mods/${modId}`)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px 4px 8px', WebkitTapHighlightColor: 'transparent' }}
        >
          <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
          <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.4)' }}>
            {partTypeName || 'Mod'}
          </span>
        </button>
        <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.25)' }}>
          Edit
        </span>
      </div>

      {/* Form */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 120 }}>

        {/* Core fields */}
        <div style={SECTION}>
          <div style={{ paddingTop: 4 }}>
            <label style={LABEL}>Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. HKS Timing Belt" style={{ ...INPUT, caretColor: '#39ff14' }} />
          </div>
          <div style={{ paddingTop: 18 }}>
            <label style={LABEL}>Brand</label>
            <input value={brand} onChange={e => setBrand(e.target.value)}
              placeholder="e.g. HKS" style={{ ...INPUT, caretColor: '#39ff14' }} />
          </div>
          <div style={{ paddingTop: 18 }}>
            <label style={LABEL}>Date Installed</label>
            <input type="date" value={dateInstalled} onChange={e => setDateInstalled(e.target.value)}
              style={{ ...INPUT, colorScheme: 'dark' }} />
          </div>
          <div style={{ paddingTop: 18 }}>
            <label style={LABEL}>Installed By</label>
            <select value={installedBy} onChange={e => setInstalledBy(e.target.value as 'self' | 'shop' | '')}
              style={{ ...INPUT, cursor: 'pointer', colorScheme: 'dark' }}>
              <option value="">—</option>
              <option value="self">Self</option>
              <option value="shop">Shop</option>
            </select>
          </div>
          <div style={{ paddingTop: 18 }}>
            <label style={LABEL}>Parts Cost</label>
            <input type="number" value={partsCost} onChange={e => setPartsCost(e.target.value)}
              placeholder="0.00" style={{ ...INPUT, caretColor: '#39ff14' }} />
          </div>
          {installedBy === 'shop' && (
            <div style={{ paddingTop: 18 }}>
              <label style={LABEL}>Labor Cost</label>
              <input type="number" value={laborCost} onChange={e => setLaborCost(e.target.value)}
                placeholder="0.00" style={{ ...INPUT, caretColor: '#39ff14' }} />
            </div>
          )}
          <div style={{ paddingTop: 18 }}>
            <label style={LABEL}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              rows={3} placeholder="Any notes about this modification…"
              style={{ ...INPUT, resize: 'none', lineHeight: 1.5, caretColor: '#39ff14' }} />
          </div>
        </div>

        {/* Basic spec groups */}
        {Object.entries(basicGroups).map(([group, specs]) => (
          <div key={group} style={SECTION}>
            {group && (
              <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.2)', marginBottom: 0 }}>
                {group}
              </p>
            )}
            {specs.map(renderSpecField)}
          </div>
        ))}

        {/* Advanced specs */}
        {advancedSpecs.length > 0 && (
          <div style={SECTION}>
            <button
              onClick={() => setShowAdvanced(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 8, WebkitTapHighlightColor: 'transparent' }}
            >
              <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.25)' }}>
                {showAdvanced ? '— Advanced Specs' : '+ Advanced Specs'}
              </span>
            </button>
            {showAdvanced && Object.entries(advancedGroups).map(([group, specs]) => (
              <div key={group}>
                {group && (
                  <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.2)', marginTop: 20, marginBottom: 0 }}>
                    {group}
                  </p>
                )}
                {specs.map(renderSpecField)}
              </div>
            ))}
          </div>
        )}

        {/* Part number */}
        <div style={SECTION}>
          <div style={{ paddingTop: 18 }}>
            <label style={LABEL}>Part Number</label>
            <input value={partNumber} onChange={e => setPartNumber(e.target.value)}
              placeholder="e.g. 14004-AN001" style={{ ...INPUT, caretColor: '#39ff14' }} />
          </div>
        </div>

        {/* Error */}
        {saveErr && (
          <p style={{ fontFamily: FONT_UI, fontSize: 12, color: '#ff5555', padding: '12px 20px 0' }}>
            {saveErr}
          </p>
        )}
      </div>

      {/* Save button */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '12px 20px 32px', background: 'linear-gradient(to top, #0d0d0f 60%, transparent)' }}>
        <button
          onClick={handleSave}
          disabled={!title.trim() || saving}
          style={{
            width: '100%', padding: '15px',
            background: !title.trim() || saving ? 'rgba(200,102,26,0.3)' : COLOR_ACCENT,
            border: 'none', cursor: !title.trim() || saving ? 'default' : 'pointer',
            fontFamily: FONT_UI, fontWeight: 800, fontSize: 13,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: !title.trim() || saving ? 'rgba(255,255,255,0.4)' : '#fff',
            transition: 'background 200ms',
          }}
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

    </div>
  )
}
