// Route: /tuning/parts-bin/:partId/edit
import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import imageCompression from 'browser-image-compression'
import { supabase } from '../lib/supabase'
import { TUNING_CATEGORIES } from './TuningBuildSheetPage'
import {
  FONT_HANDWRITTEN, FONT_UI,
  COLOR_CARDBOARD_BG, COLOR_CARDBOARD_INK, COLOR_CARDBOARD_INK2, COLOR_CARDBOARD_STAMP,
} from '../tokens'
import { getYouTubeId, getYouTubeThumbnail, type JobLink } from '../lib/links'

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

type Part = {
  title: string
  brand: string | null
  category: string | null
  date_removed: string | null
  date_installed: string | null
  parts_cost: number | null
  notes: string | null
  status: string
  car_id: string
  part_type_id: number | null
}

type ExistingPhoto = { id: string; photo_url: string }

// ── Constants ─────────────────────────────────────────────────────────────

const NOISE_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`

const COMPRESSION_OPTIONS = {
  maxSizeMB: 1, maxWidthOrHeight: 1920,
  useWebWorker: true, exifOrientation: -1 as const, fileType: 'image/jpeg' as const,
}

const LABEL: React.CSSProperties = {
  fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 11,
  letterSpacing: '0.1em', textTransform: 'uppercase',
  color: COLOR_CARDBOARD_INK2, opacity: 0.45, display: 'block', marginBottom: 6,
}

const INPUT: React.CSSProperties = {
  display: 'block', width: '100%', boxSizing: 'border-box',
  background: 'transparent', border: 'none',
  borderBottom: `1px solid rgba(26,16,8,0.18)`,
  padding: '8px 0',
  fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 18,
  color: COLOR_CARDBOARD_INK, outline: 'none',
  WebkitAppearance: 'none' as const,
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

export default function TuningPartEditPage() {
  const { partId } = useParams<{ partId: string }>()
  const navigate   = useNavigate()

  // Basic fields
  const [title,    setTitle]    = useState('')
  const [brand,    setBrand]    = useState('')
  const [category, setCategory] = useState('')
  const [cost,     setCost]     = useState('')
  const [date,     setDate]     = useState('')
  const [notes,    setNotes]    = useState('')
  const [status,   setStatus]   = useState('')

  // Specs
  const [specTemplates, setSpecTemplates] = useState<SpecTemplate[]>([])
  const [specValues,    setSpecValues]    = useState<Record<string, string>>({})
  const [multiValues,   setMultiValues]   = useState<Record<string, string[]>>({})
  const [specsOpen,     setSpecsOpen]     = useState(false)
  const [advOpen,       setAdvOpen]       = useState(false)

  // Photos
  const [existingPhotos,  setExistingPhotos]  = useState<ExistingPhoto[]>([])
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([])
  const [newPhotos,       setNewPhotos]       = useState<File[]>([])
  const [newPreviews,     setNewPreviews]     = useState<string[]>([])
  const [photoInputKey,   setPhotoInputKey]   = useState(0)

  // Links
  const [existingLinks,   setExistingLinks]   = useState<JobLink[]>([])
  const [removedLinkIds,  setRemovedLinkIds]  = useState<string[]>([])
  const [newLinks,        setNewLinks]        = useState<{ url: string; label: string }[]>([])
  const [newLinkUrl,      setNewLinkUrl]      = useState('')
  const [newLinkLabel,    setNewLinkLabel]    = useState('')

  const [carId,   setCarId]   = useState<string | null>(null)
  const [userId,  setUserId]  = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  useEffect(() => {
    if (!partId) return
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      setUserId(session?.user?.id ?? null)

      const [{ data: job }, { data: photoData }, { data: specsData }, { data: linksData }] = await Promise.all([
        supabase
          .from('jobs')
          .select('title, brand, category, date_removed, date_installed, parts_cost, notes, status, car_id, part_type_id')
          .eq('id', partId)
          .single(),
        supabase
          .from('job_photos')
          .select('id, photo_url')
          .eq('job_id', partId)
          .order('display_order'),
        supabase
          .from('job_specs')
          .select('spec_key, spec_value, spec_unit')
          .eq('job_id', partId),
        supabase.from('job_links').select('id, url, label, display_order').eq('job_id', partId).order('display_order'),
      ])

      if (!job) { setLoading(false); return }

      const part = job as unknown as Part
      setTitle(part.title ?? '')
      setBrand(part.brand ?? '')
      setCategory(part.category ?? '')
      setCost(part.parts_cost != null ? String(part.parts_cost) : '')
      setStatus(part.status)
      setCarId(part.car_id)
      setDate(part.status === 'removed' ? (part.date_removed ?? '') : (part.date_installed ?? ''))
      setNotes(part.notes ?? '')
      setExistingPhotos((photoData ?? []) as ExistingPhoto[])
      setExistingLinks((linksData ?? []) as JobLink[])

      if (part.part_type_id) {
        const { data: templates } = await supabase
          .from('spec_templates')
          .select('spec_key, spec_label, input_type, options, unit, is_advanced, display_order, group_label, help_text, placeholder')
          .eq('part_type_id', part.part_type_id)
          .order('display_order')

        const tmplList = (templates ?? []) as SpecTemplate[]
        setSpecTemplates(tmplList)

        const sv: Record<string, string>   = {}
        const mv: Record<string, string[]> = {}
        for (const s of (specsData ?? []) as { spec_key: string; spec_value: string }[]) {
          const tmpl = tmplList.find(t => t.spec_key === s.spec_key)
          if (!tmpl) continue
          if (tmpl.input_type === 'multiselect') {
            try { mv[s.spec_key] = JSON.parse(s.spec_value) } catch { mv[s.spec_key] = [] }
          } else {
            sv[s.spec_key] = s.spec_value
          }
        }
        if ((specsData ?? []).length > 0) setSpecsOpen(true)
        setSpecValues(sv)
        setMultiValues(mv)
      }

      setLoading(false)
    }
    load()
  }, [partId])

  // ── Spec helpers ──────────────────────────────────────────────────────

  const setSpecVal = (key: string, val: string) =>
    setSpecValues(prev => ({ ...prev, [key]: val }))

  const toggleMulti = (key: string, opt: string) =>
    setMultiValues(prev => {
      const cur = prev[key] ?? []
      return { ...prev, [key]: cur.includes(opt) ? cur.filter(x => x !== opt) : [...cur, opt] }
    })

  const renderSpecField = (t: SpecTemplate) => {
    const opts = parseOptions(t.options)
    const val  = specValues[t.spec_key] ?? ''
    if ((t.input_type === 'select' || t.input_type === 'multiselect') && opts.length === 0) return null

    return (
      <div key={t.spec_key} style={{ paddingTop: 20 }}>
        <label style={LABEL}>{t.spec_label}</label>

        {t.input_type === 'text' && (
          <>
            <input value={val} onChange={e => setSpecVal(t.spec_key, e.target.value)}
              placeholder={t.placeholder ?? ''} style={INPUT} className="kraft-input" />
            {t.help_text && <p style={{ fontFamily: FONT_HANDWRITTEN, fontSize: 13, color: COLOR_CARDBOARD_INK2, opacity: 0.45, marginTop: 5, lineHeight: 1.5 }}>{t.help_text}</p>}
          </>
        )}

        {t.input_type === 'number' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <input type="number" value={val} onChange={e => setSpecVal(t.spec_key, e.target.value)}
                placeholder={t.placeholder ?? ''} style={{ ...INPUT, flex: 1 }} className="kraft-input" />
              {t.unit && <span style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 14, color: COLOR_CARDBOARD_INK2, opacity: 0.45, marginLeft: 8, whiteSpace: 'nowrap' }}>{t.unit}</span>}
            </div>
            {t.help_text && <p style={{ fontFamily: FONT_HANDWRITTEN, fontSize: 13, color: COLOR_CARDBOARD_INK2, opacity: 0.45, marginTop: 5, lineHeight: 1.5 }}>{t.help_text}</p>}
          </>
        )}

        {t.input_type === 'date' && (
          <input type="date" value={val} onChange={e => setSpecVal(t.spec_key, e.target.value)}
            style={{ ...INPUT, colorScheme: 'light' }} />
        )}

        {t.input_type === 'select' && opts.length > 0 && (
          <select value={val} onChange={e => setSpecVal(t.spec_key, e.target.value)}
            style={{ ...INPUT, cursor: 'pointer', colorScheme: 'light' }}>
            <option value="">—</option>
            {opts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        )}

        {t.input_type === 'multiselect' && opts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 6 }}>
            {opts.map(o => {
              const checked = (multiValues[t.spec_key] ?? []).includes(o)
              return (
                <label key={o} onClick={() => toggleMulti(t.spec_key, o)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <div style={{
                    width: 18, height: 18, flexShrink: 0,
                    border: `1.5px solid ${checked ? `${COLOR_CARDBOARD_STAMP}` : 'rgba(26,16,8,0.25)'}`,
                    background: checked ? 'rgba(139,58,10,0.12)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 150ms ease',
                  }}>
                    {checked && <span style={{ color: COLOR_CARDBOARD_STAMP, fontSize: 11, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                  </div>
                  <span style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 16, color: COLOR_CARDBOARD_INK, opacity: 0.8 }}>{o}</span>
                </label>
              )
            })}
          </div>
        )}

        {t.input_type === 'boolean' && (
          <div onClick={() => setSpecVal(t.spec_key, val === 'true' ? 'false' : 'true')}
            style={{
              width: 44, height: 26, position: 'relative', cursor: 'pointer',
              background: val === 'true' ? 'rgba(139,58,10,0.2)' : 'rgba(26,16,8,0.06)',
              border: `1.5px solid ${val === 'true' ? COLOR_CARDBOARD_STAMP : 'rgba(26,16,8,0.2)'}`,
              borderRadius: 13, transition: 'background 200ms, border-color 200ms',
            }}>
            <div style={{
              position: 'absolute', top: 3, left: val === 'true' ? 20 : 3,
              width: 16, height: 16, borderRadius: '50%',
              background: val === 'true' ? COLOR_CARDBOARD_STAMP : 'rgba(26,16,8,0.25)',
              transition: 'left 200ms, background 200ms',
            }} />
          </div>
        )}
      </div>
    )
  }

  // ── Photo helpers ─────────────────────────────────────────────────────

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setNewPhotos(prev => [...prev, ...files])
    files.forEach(f => {
      const reader = new FileReader()
      reader.onload = ev => setNewPreviews(prev => [...prev, ev.target?.result as string])
      reader.readAsDataURL(f)
    })
    setPhotoInputKey(k => k + 1)
  }

  const removeNewPhoto = (i: number) => {
    setNewPhotos(prev => prev.filter((_, idx) => idx !== i))
    setNewPreviews(prev => prev.filter((_, idx) => idx !== i))
  }

  const removeExistingPhoto = (id: string) => {
    setRemovedPhotoIds(prev => [...prev, id])
    setExistingPhotos(prev => prev.filter(p => p.id !== id))
  }

  // ── Save ──────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!partId || !title.trim()) return
    setSaving(true)
    setSaveErr(null)

    const dateField = status === 'removed' ? 'date_removed' : 'date_installed'
    const { error: jobErr } = await supabase.from('jobs').update({
      title:      title.trim(),
      brand:      brand.trim() || null,
      category:   category || null,
      parts_cost: cost !== '' ? parseFloat(cost) : null,
      notes:      notes.trim() || null,
      [dateField]: date || null,
    }).eq('id', partId)
    if (jobErr) { setSaving(false); setSaveErr(jobErr.message); return }

    // Replace specs
    if (specTemplates.length > 0) {
      await supabase.from('job_specs').delete().eq('job_id', partId)
      const rows: { job_id: string; spec_key: string; spec_value: string; spec_unit: string | null }[] = []
      for (const t of specTemplates) {
        if (t.input_type === 'multiselect') {
          const vals = multiValues[t.spec_key] ?? []
          if (vals.length > 0) rows.push({ job_id: partId, spec_key: t.spec_key, spec_value: JSON.stringify(vals), spec_unit: t.unit ?? null })
        } else {
          const v = specValues[t.spec_key]
          if (v && v !== '' && v !== 'false') rows.push({ job_id: partId, spec_key: t.spec_key, spec_value: String(v), spec_unit: t.unit ?? null })
        }
      }
      if (rows.length > 0) {
        const { error: specErr } = await supabase.from('job_specs').insert(rows)
        if (specErr) { setSaving(false); setSaveErr(specErr.message); return }
      }
    }

    // Delete removed photos
    if (removedPhotoIds.length > 0) {
      await supabase.from('job_photos').delete().in('id', removedPhotoIds)
    }

    // Upload new photos
    if (newPhotos.length > 0 && userId && carId) {
      for (const file of newPhotos) {
        try {
          const compressed = await imageCompression(file, COMPRESSION_OPTIONS)
          const path = `${userId}/${carId}/${partId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
          const { error: uploadErr } = await supabase.storage.from('job-photos').upload(path, compressed, { contentType: 'image/jpeg' })
          if (uploadErr) continue
          const { data: urlData } = supabase.storage.from('job-photos').getPublicUrl(path)
          await supabase.from('job_photos').insert({ job_id: partId, photo_url: urlData.publicUrl, display_order: null })
        } catch { /* skip failed photo */ }
      }
    }

    // Save links — include any URL still sitting in the input field (didn't click + Add Link)
    const pendingUrl = newLinkUrl.trim()
    const allNewLinks = pendingUrl
      ? [...newLinks, { url: pendingUrl, label: newLinkLabel.trim() }]
      : newLinks

    if (removedLinkIds.length > 0) {
      await supabase.from('job_links').delete().in('id', removedLinkIds)
    }
    if (allNewLinks.length > 0) {
      const { data: { session: saveSession } } = await supabase.auth.getSession()
      const uid = saveSession?.user?.id
      if (uid) {
        const linkRows = allNewLinks.map((l, i) => ({
          job_id: partId!,
          user_id: uid,
          url: l.url,
          label: l.label || null,
          display_order: existingLinks.length + i,
        }))
        const { error: linkErr } = await supabase.from('job_links').insert(linkRows)
        if (linkErr) { setSaveErr(linkErr.message); setSaving(false); return }
      }
    }

    navigate(`/tuning/parts-bin/${partId}`)
  }

  if (loading) {
    return (
      <div style={{ height: '100dvh', background: COLOR_CARDBOARD_BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontFamily: FONT_HANDWRITTEN, fontSize: 18, color: COLOR_CARDBOARD_INK2, opacity: 0.6 }}>loading...</p>
      </div>
    )
  }

  const basicSpecs = specTemplates.filter(t => !t.is_advanced)
  const advSpecs   = specTemplates.filter(t =>  t.is_advanced)
  const basicGroups = groupBy(basicSpecs, t => t.group_label ?? 'Specs')
  const advGroups   = groupBy(advSpecs,   t => t.group_label ?? 'Advanced')
  const dateLabel   = status === 'removed' ? 'Date Pulled' : 'Date Acquired'

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

      {/* Placeholder color injection */}
      <style>{`.kraft-input::placeholder { color: rgba(26,16,8,0.35); }`}</style>

      {/* Kraft grain */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1, backgroundImage: NOISE_SVG, backgroundSize: '180px 180px', opacity: 0.09, mixBlendMode: 'multiply' }} />

      <div style={{ position: 'relative', zIndex: 2, paddingBottom: 120 }}>

        {/* ── Top bar ── */}
        <div style={{ padding: '16px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={() => navigate(`/tuning/parts-bin/${partId}`)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4, WebkitTapHighlightColor: 'transparent' }}
          >
            <span style={{ color: COLOR_CARDBOARD_STAMP, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
            <span style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 600, fontSize: 16, color: COLOR_CARDBOARD_STAMP }}>Part</span>
          </button>
          <span style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 13, color: COLOR_CARDBOARD_INK2, opacity: 0.45, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Edit
          </span>
        </div>

        {/* ── Core fields ── */}
        <div style={{ padding: '28px 20px 0', display: 'flex', flexDirection: 'column', gap: 24 }}>

          <div>
            <label style={LABEL}>Name</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Part name" className="kraft-input"
              style={{ ...INPUT, fontSize: 22 }} />
          </div>

          <div>
            <label style={LABEL}>Brand</label>
            <input value={brand} onChange={e => setBrand(e.target.value)}
              placeholder="—" className="kraft-input" style={INPUT} />
          </div>

          <div>
            <label style={LABEL}>Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)}
              style={{ ...INPUT, cursor: 'pointer', colorScheme: 'light' }}>
              <option value="">—</option>
              {TUNING_CATEGORIES.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={LABEL}>Cost Paid</label>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 18, color: COLOR_CARDBOARD_STAMP, paddingRight: 6, opacity: 0.7 }}>$</span>
              <input type="number" inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)}
                placeholder="0" className="kraft-input" style={{ ...INPUT, flex: 1 }} />
            </div>
          </div>

          <div>
            <label style={LABEL}>{dateLabel}</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              style={{ ...INPUT, colorScheme: 'light' }} />
          </div>

          <div>
            <label style={LABEL}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Any details..." rows={4} className="kraft-input"
              style={{ ...INPUT, resize: 'none', lineHeight: 1.55, borderBottom: 'none', border: `1px solid rgba(26,16,8,0.18)`, padding: '10px 12px' }} />
          </div>

        </div>

        {/* ── Links ── */}
        <div style={{ padding: '28px 20px 0' }}>
          <label style={LABEL}>Links</label>

          {/* Existing + queued links */}
          {[...existingLinks, ...newLinks.map((l, i) => ({ id: `new-${i}`, url: l.url, label: l.label || null, display_order: 0, _isNew: true, _idx: i }))].map(entry => {
            const isNew = '_isNew' in entry
            const ytId  = getYouTubeId(entry.url)
            return (
              <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                {ytId ? (
                  <div style={{ width: 64, height: 36, flexShrink: 0, overflow: 'hidden', position: 'relative' }}>
                    <img src={getYouTubeThumbnail(ytId)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(26,16,8,0.28)' }}>
                      <svg width="10" height="12" viewBox="0 0 10 12" fill="none"><path d="M0 0L10 6L0 12V0Z" fill="white" fillOpacity="0.85"/></svg>
                    </div>
                  </div>
                ) : (
                  <span style={{ color: COLOR_CARDBOARD_STAMP, fontSize: 14, flexShrink: 0, lineHeight: 1, width: 20, textAlign: 'center', opacity: 0.75 }}>↗</span>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 14, color: COLOR_CARDBOARD_INK, opacity: 0.78, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {entry.label || entry.url}
                  </p>
                  {entry.label && (
                    <p style={{ fontFamily: FONT_UI, fontWeight: 400, fontSize: 10, color: COLOR_CARDBOARD_INK2, opacity: 0.4, margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {entry.url}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    if (isNew) {
                      setNewLinks(prev => prev.filter((_, i2) => i2 !== (entry as unknown as { _idx: number })._idx))
                    } else {
                      setRemovedLinkIds(prev => [...prev, entry.id])
                      setExistingLinks(prev => prev.filter(l => l.id !== entry.id))
                    }
                  }}
                  style={{ flexShrink: 0, width: 28, height: 28, borderRadius: '50%', background: 'rgba(26,16,8,0.08)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}
                >
                  <span style={{ color: COLOR_CARDBOARD_INK2, opacity: 0.4, fontSize: 14, lineHeight: 1 }}>×</span>
                </button>
              </div>
            )
          })}

          {/* Add new link */}
          <div style={{ marginTop: 6 }}>
            <input
              value={newLinkUrl}
              onChange={e => setNewLinkUrl(e.target.value)}
              placeholder="https://"
              className="kraft-input"
              style={{ ...INPUT, marginBottom: 10 }}
            />
            <input
              value={newLinkLabel}
              onChange={e => setNewLinkLabel(e.target.value)}
              placeholder="Label (optional)"
              className="kraft-input"
              style={{ ...INPUT, marginBottom: 12 }}
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
              style={{
                padding: '10px 18px',
                background: newLinkUrl.trim() ? 'rgba(139,58,10,0.12)' : 'transparent',
                border: newLinkUrl.trim() ? `1px solid ${COLOR_CARDBOARD_STAMP}` : `1px solid rgba(26,16,8,0.15)`,
                cursor: newLinkUrl.trim() ? 'pointer' : 'default',
                fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 15,
                color: newLinkUrl.trim() ? COLOR_CARDBOARD_STAMP : COLOR_CARDBOARD_INK2,
                opacity: newLinkUrl.trim() ? 1 : 0.35,
                WebkitTapHighlightColor: 'transparent',
                transition: 'all 150ms ease',
              }}
            >
              + Add Link
            </button>
          </div>
        </div>

        {/* ── Spec fields ── */}
        {specTemplates.length > 0 && (
          <div style={{ padding: '28px 20px 0' }}>
            <button
              onClick={() => setSpecsOpen(v => !v)}
              style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, WebkitTapHighlightColor: 'transparent', display: 'flex', alignItems: 'center', gap: 10 }}
            >
              <div style={{ flex: 1, height: 1, background: COLOR_CARDBOARD_INK, opacity: 0.12 }} />
              <span style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 13, color: COLOR_CARDBOARD_INK2, opacity: 0.55, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Specs {specsOpen ? '▴' : '▾'}
              </span>
              <div style={{ flex: 1, height: 1, background: COLOR_CARDBOARD_INK, opacity: 0.12 }} />
            </button>

            {specsOpen && (
              <div style={{ marginTop: 4 }}>
                {Object.entries(basicGroups).map(([groupName, tmpls]) => (
                  <div key={groupName} style={{ marginTop: 20 }}>
                    {groupName !== 'Specs' && (
                      <p style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: COLOR_CARDBOARD_INK2, opacity: 0.35, margin: '0 0 4px' }}>
                        {groupName}
                      </p>
                    )}
                    {tmpls.map(renderSpecField)}
                  </div>
                ))}

                {advSpecs.length > 0 && (
                  <div style={{ marginTop: 24 }}>
                    <button
                      onClick={() => setAdvOpen(v => !v)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, WebkitTapHighlightColor: 'transparent' }}
                    >
                      <span style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 13, color: COLOR_CARDBOARD_INK2, opacity: 0.4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        Advanced Specs {advOpen ? '▴' : '▾'}
                      </span>
                    </button>
                    {advOpen && Object.entries(advGroups).map(([groupName, tmpls]) => (
                      <div key={groupName} style={{ marginTop: 16 }}>
                        {groupName !== 'Advanced' && (
                          <p style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: COLOR_CARDBOARD_INK2, opacity: 0.35, margin: '0 0 4px' }}>
                            {groupName}
                          </p>
                        )}
                        {tmpls.map(renderSpecField)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Photos ── */}
        <div style={{ padding: '28px 20px 0' }}>
          <label style={LABEL}>Photos</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
            {existingPhotos.filter(p => !removedPhotoIds.includes(p.id)).map(p => (
              <div key={p.id} style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
                <img src={p.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                <button onClick={() => removeExistingPhoto(p.id)}
                  style={{ position: 'absolute', top: 3, right: 3, width: 22, height: 22, borderRadius: '50%', background: 'rgba(26,16,8,0.75)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>
                  <span style={{ color: '#e8c98a', fontSize: 12, lineHeight: 1, fontWeight: 700 }}>×</span>
                </button>
              </div>
            ))}
            {newPreviews.map((src, i) => (
              <div key={`new-${i}`} style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
                <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.75 }} />
                <button onClick={() => removeNewPhoto(i)}
                  style={{ position: 'absolute', top: 3, right: 3, width: 22, height: 22, borderRadius: '50%', background: 'rgba(26,16,8,0.75)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>
                  <span style={{ color: '#e8c98a', fontSize: 12, lineHeight: 1, fontWeight: 700 }}>×</span>
                </button>
              </div>
            ))}
            <label style={{ width: 80, height: 80, flexShrink: 0, border: `1.5px dashed rgba(26,16,8,0.25)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: 2 }}>
              <span style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 22, color: COLOR_CARDBOARD_INK2, opacity: 0.35, lineHeight: 1 }}>+</span>
              <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: COLOR_CARDBOARD_INK2, opacity: 0.3 }}>Photo</span>
              <input key={photoInputKey} type="file" accept="image/*" multiple onChange={handlePhotoSelect} style={{ display: 'none' }} />
            </label>
          </div>
        </div>

      </div>

      {/* ── Save bar ── */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 20, padding: '16px 20px 36px', background: `linear-gradient(to top, ${COLOR_CARDBOARD_BG} 70%, transparent)` }}>
        {saveErr && <p style={{ fontFamily: FONT_HANDWRITTEN, fontSize: 14, color: '#8b0000', marginBottom: 10 }}>{saveErr}</p>}
        <button onClick={handleSave} disabled={saving || !title.trim()}
          style={{
            width: '100%', padding: '15px',
            background: title.trim() ? 'rgba(139,58,10,0.15)' : 'transparent',
            border: title.trim() ? `1.5px solid ${COLOR_CARDBOARD_STAMP}` : `1px solid rgba(26,16,8,0.12)`,
            cursor: title.trim() && !saving ? 'pointer' : 'default',
            WebkitTapHighlightColor: 'transparent',
          }}>
          <span style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 17, color: title.trim() ? COLOR_CARDBOARD_STAMP : COLOR_CARDBOARD_INK2, opacity: title.trim() ? 1 : 0.3 }}>
            {saving ? 'Saving…' : 'Save'}
          </span>
        </button>
      </div>

    </div>
  )
}
