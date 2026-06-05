// Route: /tuning/mods/:modId/edit
import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import imageCompression from 'browser-image-compression'
import { supabase } from '../lib/supabase'
import { FONT_UI, COLOR_ACCENT, COLOR_HEADER_BLACK, COLOR_HEADER_WARM, HEADER_HEIGHT } from '../tokens'
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

interface ExistingPhoto { id: string; photo_url: string }

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

const NOISE_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`

const COMPRESSION_OPTIONS = {
  maxSizeMB: 1, maxWidthOrHeight: 1920,
  useWebWorker: true, exifOrientation: -1 as const, fileType: 'image/jpeg' as const,
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
  const [title,         setTitle]         = useState('')
  const [brand,         setBrand]         = useState('')
  const [partNumber,    setPartNumber]     = useState('')
  const [dateInstalled, setDateInstalled]  = useState('')
  const [installedBy,   setInstalledBy]   = useState<'self' | 'shop' | ''>('')
  const [partsCost,     setPartsCost]     = useState('')
  const [laborCost,     setLaborCost]     = useState('')
  const [notes,         setNotes]         = useState('')

  // Timeline membership (session-level — see handleSave)
  const [addToTimeline,   setAddToTimeline]   = useState(false)
  const [sessionId,       setSessionId]       = useState<string | null>(null)
  const [sessionHasTitle, setSessionHasTitle] = useState(false)
  const [timelineTitle,   setTimelineTitle]   = useState('')
  const [timelineStory,   setTimelineStory]   = useState('')

  // Spec fields
  const [specTemplates,  setSpecTemplates]  = useState<SpecTemplate[]>([])
  const [specValues,     setSpecValues]     = useState<Record<string, string>>({})
  const [multiValues,    setMultiValues]    = useState<Record<string, string[]>>({})
  const [specsExpanded,  setSpecsExpanded]  = useState(false)
  const [advExpanded,    setAdvExpanded]    = useState(false)

  // Photos
  const [existingPhotos,  setExistingPhotos]  = useState<ExistingPhoto[]>([])
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([])
  const [newPhotos,       setNewPhotos]       = useState<File[]>([])
  const [newPreviews,     setNewPreviews]     = useState<string[]>([])

  // Links
  const [existingLinks,   setExistingLinks]   = useState<JobLink[]>([])
  const [removedLinkIds,  setRemovedLinkIds]  = useState<string[]>([])
  const [newLinks,        setNewLinks]        = useState<{ url: string; label: string }[]>([])
  const [newLinkUrl,      setNewLinkUrl]      = useState('')
  const [newLinkLabel,    setNewLinkLabel]    = useState('')

  // UI
  const [partTypeName, setPartTypeName] = useState('')
  const [carId,        setCarId]        = useState<string | null>(null)
  const [userId,       setUserId]       = useState<string | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [saveErr,      setSaveErr]      = useState<string | null>(null)

  useEffect(() => {
    if (!modId) return
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      setUserId(session?.user?.id ?? null)

      const [{ data: job }, { data: existingSpecs }, { data: photoData }, { data: linksData }] = await Promise.all([
        supabase
          .from('jobs')
          .select('title, brand, part_number, date_installed, installed_by, parts_cost, labor_cost, notes, part_type_id, car_id, session_id')
          .eq('id', modId)
          .single(),
        supabase.from('job_specs').select('spec_key, spec_value, spec_unit').eq('job_id', modId),
        supabase.from('job_photos').select('id, photo_url').eq('job_id', modId).order('display_order'),
        supabase.from('job_links').select('id, url, label, display_order').eq('job_id', modId).order('display_order'),
      ])

      if (!job) { setLoading(false); return }

      setTitle(job.title ?? '')
      setBrand(job.brand ?? '')
      setPartNumber(job.part_number ?? '')
      setDateInstalled(job.date_installed ?? '')
      setInstalledBy(job.installed_by ?? '')
      setPartsCost(job.parts_cost != null ? String(job.parts_cost) : '')
      setLaborCost(job.labor_cost != null ? String(job.labor_cost) : '')
      setNotes(job.notes ?? '')
      setCarId(job.car_id ?? null)
      setExistingPhotos((photoData ?? []) as ExistingPhoto[])
      setExistingLinks((linksData ?? []) as JobLink[])

      // Timeline membership lives on the parent session, if there is one.
      if (job.session_id) {
        setSessionId(job.session_id)
        const { data: sess } = await supabase
          .from('sessions')
          .select('add_to_timeline, title, timeline_title, journal_entry')
          .eq('id', job.session_id)
          .single()
        if (sess) {
          const s = sess as { add_to_timeline: boolean | null; title: string | null; timeline_title: string | null; journal_entry: string | null }
          setAddToTimeline(!!s.add_to_timeline)
          setSessionHasTitle(!!s.title)
          setTimelineTitle(s.timeline_title ?? '')
          setTimelineStory(s.journal_entry ?? '')
        }
      }

      if (job.part_type_id) {
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

        // Pre-fill spec values
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
        // If any specs exist, open the Full Specs section pre-expanded
        if (existingSpecs && existingSpecs.length > 0) setSpecsExpanded(true)
        setSpecValues(sv)
        setMultiValues(mv)
      }

      setLoading(false)
    }
    load()
  }, [modId])

  // ── Photo handlers ─────────────────────────────────────────────────────

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setNewPhotos(prev => [...prev, ...files])
    files.forEach(f => {
      const reader = new FileReader()
      reader.onload = ev => setNewPreviews(prev => [...prev, ev.target?.result as string])
      reader.readAsDataURL(f)
    })
    e.target.value = ''
  }

  const removeNewPhoto = (i: number) => {
    setNewPhotos(prev => prev.filter((_, idx) => idx !== i))
    setNewPreviews(prev => prev.filter((_, idx) => idx !== i))
  }

  const removeExistingPhoto = (id: string) => {
    setRemovedPhotoIds(prev => [...prev, id])
    setExistingPhotos(prev => prev.filter(p => p.id !== id))
  }

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

    if (jobErr) { setSaveErr(jobErr.message); setSaving(false); return }

    // 2. Replace all job_specs
    await supabase.from('job_specs').delete().eq('job_id', modId!)
    const specRows: { job_id: string; spec_key: string; spec_value: string; spec_unit: string | null }[] = []
    for (const t of specTemplates) {
      if (t.input_type === 'multiselect') {
        const vals = multiValues[t.spec_key] ?? []
        if (vals.length > 0) specRows.push({ job_id: modId!, spec_key: t.spec_key, spec_value: JSON.stringify(vals), spec_unit: t.unit ?? null })
      } else {
        const v = specValues[t.spec_key]
        if (v && v !== '' && v !== 'false') specRows.push({ job_id: modId!, spec_key: t.spec_key, spec_value: String(v), spec_unit: t.unit ?? null })
      }
    }
    if (specRows.length > 0) {
      const { error: specErr } = await supabase.from('job_specs').insert(specRows)
      if (specErr) { setSaveErr(specErr.message); setSaving(false); return }
    }

    // 3. Delete removed photos from DB (storage cleanup best-effort)
    for (const id of removedPhotoIds) {
      await supabase.from('job_photos').delete().eq('id', id)
    }

    // 4. Upload new photos
    if (userId && carId) {
      for (const photo of newPhotos) {
        try {
          const compressed = await imageCompression(photo, COMPRESSION_OPTIONS)
          const path = `${userId}/${carId}/${modId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
          const { data: up, error: upErr } = await supabase.storage
            .from('job-photos')
            .upload(path, compressed, { contentType: 'image/jpeg' })
          if (!upErr && up) {
            const { data: urlData } = supabase.storage.from('job-photos').getPublicUrl(up.path)
            await supabase.from('job_photos').insert({ job_id: modId, car_id: carId, photo_url: urlData.publicUrl })
          }
        } catch (_) { /* skip failed photo */ }
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
          job_id: modId!,
          user_id: uid,
          url: l.url,
          label: l.label || null,
          display_order: existingLinks.length + i,
        }))
        const { error: linkErr } = await supabase.from('job_links').insert(linkRows)
        if (linkErr) { setSaveErr(linkErr.message); setSaving(false); return }
      }
    }

    // Timeline membership (session-level). The sessions_timeline_sync trigger
    // creates/removes the timeline_entries row from sessions.add_to_timeline.
    const today = new Date().toISOString().split('T')[0]
    if (sessionId) {
      // Existing session — flip its flag. Keep an anonymous (untitled) session's
      // date in sync with this mod's install date so the Timeline card dates
      // correctly. Never touch a named group's date — it's the group's date.
      const sessUpdate: { add_to_timeline: boolean; date_performed?: string; timeline_title: string | null; journal_entry: string | null } = {
        add_to_timeline: addToTimeline,
        timeline_title: timelineTitle.trim() || null,
        journal_entry: timelineStory.trim() || null,
      }
      if (!sessionHasTitle && dateInstalled) sessUpdate.date_performed = dateInstalled
      const { error: sessErr } = await supabase.from('sessions').update(sessUpdate).eq('id', sessionId)
      if (sessErr) { setSaveErr(sessErr.message); setSaving(false); return }
    } else if (addToTimeline && carId) {
      // No session yet — create an anonymous modification session for this mod
      // (mirrors the solo-mod path in TuningAddPage) and attach the job to it.
      const { data: sData, error: sErr } = await supabase
        .from('sessions')
        .insert({ car_id: carId, type: 'modification', date_performed: dateInstalled || today, add_to_timeline: true,
          timeline_title: timelineTitle.trim() || null, journal_entry: timelineStory.trim() || null })
        .select('id')
        .single()
      if (sErr) { setSaveErr(sErr.message); setSaving(false); return }
      if (sData) await supabase.from('jobs').update({ session_id: (sData as { id: string }).id }).eq('id', modId!)
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

  const MAIN_FORM_KEYS = new Set(['brand'])
  const basicSpecs    = specTemplates.filter(t => !t.is_advanced && !MAIN_FORM_KEYS.has(t.spec_key))
  const advancedSpecs = specTemplates.filter(t =>  t.is_advanced && !MAIN_FORM_KEYS.has(t.spec_key))
  const basicGroups   = groupBy(basicSpecs,    t => t.group_label ?? '')
  const advGroups     = groupBy(advancedSpecs, t => t.group_label ?? '')
  const visibleExisting = existingPhotos.filter(p => !removedPhotoIds.includes(p.id))

  return (
    <div style={{ minHeight: '100dvh', background: '#0d0d0f', display: 'flex', flexDirection: 'column' }}>

      {/* ── Magazine sheen + grain overlays ── */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 5, pointerEvents: 'none',
        background: [
          'radial-gradient(ellipse 70% 48% at 90% 94%, rgba(245,232,195,0.065) 0%, rgba(245,232,195,0.025) 48%, transparent 72%)',
          'radial-gradient(ellipse 55% 30% at 10% 6%, rgba(175,195,215,0.04) 0%, transparent 60%)',
        ].join(', '),
      }} />
      <div style={{
        position: 'fixed', inset: 0, zIndex: 4, pointerEvents: 'none',
        backgroundImage: NOISE_SVG, backgroundSize: '220px 220px',
        opacity: 0.028, mixBlendMode: 'screen',
      }} />

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
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 120, position: 'relative', zIndex: 6 }}>
        <div style={{ padding: '24px 20px 0' }}>

          {/* Title */}
          <div>
            <label style={LABEL}>Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. HKS Timing Belt" style={{ ...INPUT, caretColor: '#39ff14' }} />
          </div>

          {/* Brand */}
          <div style={{ paddingTop: 18 }}>
            <label style={LABEL}>Brand</label>
            <input value={brand} onChange={e => setBrand(e.target.value)}
              placeholder="e.g. HKS" style={{ ...INPUT, caretColor: '#39ff14' }} />
          </div>

          {/* Date Installed */}
          <div style={{ paddingTop: 18 }}>
            <label style={LABEL}>Date Installed</label>
            <input type="date" value={dateInstalled} onChange={e => setDateInstalled(e.target.value)}
              style={{ ...INPUT, colorScheme: 'dark' }} />
          </div>

          {/* Installed By */}
          <div style={{ paddingTop: 18 }}>
            <label style={LABEL}>Installed By</label>
            <select value={installedBy} onChange={e => setInstalledBy(e.target.value as 'self' | 'shop' | '')}
              style={{ ...INPUT, cursor: 'pointer', colorScheme: 'dark' }}>
              <option value="">—</option>
              <option value="self">Self</option>
              <option value="shop">Shop</option>
            </select>
          </div>

          {/* Parts Cost */}
          <div style={{ paddingTop: 18 }}>
            <label style={LABEL}>Parts Cost</label>
            <input type="number" value={partsCost} onChange={e => setPartsCost(e.target.value)}
              placeholder="0.00" style={{ ...INPUT, caretColor: '#39ff14' }} />
          </div>

          {/* Labor Cost — shop only */}
          {installedBy === 'shop' && (
            <div style={{ paddingTop: 18 }}>
              <label style={LABEL}>Labor Cost</label>
              <input type="number" value={laborCost} onChange={e => setLaborCost(e.target.value)}
                placeholder="0.00" style={{ ...INPUT, caretColor: '#39ff14' }} />
            </div>
          )}

          {/* Notes */}
          <div style={{ paddingTop: 18 }}>
            <label style={LABEL}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              rows={3} placeholder="Any notes about this modification…"
              style={{ ...INPUT, resize: 'none', lineHeight: 1.5, caretColor: '#39ff14' } as React.CSSProperties} />
          </div>

          {/* Add to Timeline */}
          <div style={{ paddingTop: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={{ ...LABEL, marginBottom: 4 }}>Add to Timeline</label>
              <p style={{ fontFamily: FONT_UI, fontSize: 11, color: 'rgba(245,240,228,0.28)', margin: 0, lineHeight: 1.4 }}>
                {sessionHasTitle
                  ? 'Part of a group — this controls the whole group’s card in your build story.'
                  : 'Show this mod as a card in your build story.'}
              </p>
            </div>
            <div onClick={() => setAddToTimeline(v => !v)}
              style={{
                width: 44, height: 26, position: 'relative', cursor: 'pointer', flexShrink: 0,
                background: addToTimeline ? 'rgba(200,102,26,0.35)' : 'rgba(245,240,228,0.07)',
                border: `1.5px solid ${addToTimeline ? 'rgba(200,102,26,0.65)' : 'rgba(245,240,228,0.14)'}`,
                borderRadius: 13, transition: 'background 200ms, border-color 200ms',
              }}>
              <div style={{
                position: 'absolute', top: 3, left: addToTimeline ? 20 : 3,
                width: 16, height: 16, borderRadius: '50%',
                background: addToTimeline ? '#c8661a' : 'rgba(245,240,228,0.28)',
                transition: 'left 200ms, background 200ms',
              }} />
            </div>
          </div>

          {/* Timeline title + story — only when the entry is on the Timeline */}
          {addToTimeline && (
            <>
              <div style={{ paddingTop: 18 }}>
                <label style={LABEL}>Timeline Title</label>
                <input value={timelineTitle} onChange={e => setTimelineTitle(e.target.value)}
                  placeholder={title.trim() || 'Defaults to the mod name'} style={{ ...INPUT, caretColor: '#39ff14' }} />
              </div>
              <div style={{ paddingTop: 18 }}>
                <label style={LABEL}>Story</label>
                <textarea value={timelineStory} onChange={e => setTimelineStory(e.target.value)}
                  rows={3} placeholder="The story behind this — how it went, why it matters…"
                  style={{ ...INPUT, resize: 'none', lineHeight: 1.5, fontStyle: 'italic', caretColor: '#39ff14' } as React.CSSProperties} />
              </div>
            </>
          )}

        </div>

        {/* ── Links ── */}
        <div style={{ padding: '24px 20px 0' }}>
          <label style={LABEL}>Links</label>

          {/* Existing + queued links */}
          {[...existingLinks, ...newLinks.map((l, i) => ({ id: `new-${i}`, url: l.url, label: l.label || null, display_order: 0, _isNew: true, _idx: i }))].map(entry => {
            const isNew = '_isNew' in entry
            const ytId  = getYouTubeId(entry.url)
            return (
              <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                {ytId ? (
                  <div style={{ width: 64, height: 36, flexShrink: 0, overflow: 'hidden', position: 'relative' }}>
                    <img src={getYouTubeThumbnail(ytId)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.28)' }}>
                      <svg width="10" height="12" viewBox="0 0 10 12" fill="none"><path d="M0 0L10 6L0 12V0Z" fill="#f5f0e4" fillOpacity="0.6"/></svg>
                    </div>
                  </div>
                ) : (
                  <span style={{ color: COLOR_ACCENT, fontSize: 14, flexShrink: 0, lineHeight: 1, width: 20, textAlign: 'center' }}>↗</span>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 12, color: 'rgba(245,240,228,0.75)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {entry.label || entry.url}
                  </p>
                  {entry.label && (
                    <p style={{ fontFamily: FONT_UI, fontWeight: 400, fontSize: 10, color: 'rgba(245,240,228,0.28)', margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                  style={{ flexShrink: 0, width: 28, height: 28, borderRadius: '50%', background: 'rgba(245,240,228,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}
                >
                  <span style={{ color: 'rgba(245,240,228,0.35)', fontSize: 14, lineHeight: 1 }}>×</span>
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
              style={{ ...INPUT, marginBottom: 10, caretColor: '#39ff14' }}
            />
            <input
              value={newLinkLabel}
              onChange={e => setNewLinkLabel(e.target.value)}
              placeholder="Label (optional)"
              style={{ ...INPUT, marginBottom: 12, caretColor: '#39ff14' }}
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
                background: newLinkUrl.trim() ? 'rgba(200,102,26,0.1)' : 'transparent',
                border: `1px solid ${newLinkUrl.trim() ? 'rgba(200,102,26,0.4)' : 'rgba(245,240,228,0.1)'}`,
                cursor: newLinkUrl.trim() ? 'pointer' : 'default',
                fontFamily: FONT_UI, fontWeight: 800, fontSize: 10,
                letterSpacing: '0.14em', textTransform: 'uppercase',
                color: newLinkUrl.trim() ? COLOR_ACCENT : 'rgba(245,240,228,0.2)',
                WebkitTapHighlightColor: 'transparent',
                transition: 'all 150ms ease',
              }}
            >
              + Add Link
            </button>
          </div>
        </div>

        {/* ── Photos ── */}
        <div style={{ padding: '24px 20px 0' }}>
          <label style={LABEL}>Photos</label>

          {/* Existing photos */}
          {visibleExisting.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {visibleExisting.map(p => (
                <div key={p.id} style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
                  <img src={p.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  <button
                    onClick={() => removeExistingPhoto(p.id)}
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

          {/* New photo previews */}
          {newPreviews.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {newPreviews.map((src, i) => (
                <div key={i} style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
                  <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  <button
                    onClick={() => removeNewPhoto(i)}
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

          {/* Add photos picker */}
          <label style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '13px 0', cursor: 'pointer',
            border: '1px dashed rgba(245,240,228,0.14)',
            fontFamily: FONT_UI, fontWeight: 800, fontSize: 10,
            letterSpacing: '0.16em', textTransform: 'uppercase',
            color: 'rgba(245,240,228,0.3)',
          }}>
            + Add Photos
            <input type="file" accept="image/*" multiple onChange={handlePhotoSelect} style={{ display: 'none' }} />
          </label>
        </div>

        {/* ── Full Specs toggle ── */}
        {specTemplates.length > 0 && (
          <div style={{ padding: '24px 20px 0' }}>
            <button
              onClick={() => setSpecsExpanded(x => !x)}
              style={{
                width: '100%', padding: '13px 0',
                background: specsExpanded ? 'rgba(18,55,190,0.1)' : 'transparent',
                border: `1px solid ${specsExpanded ? 'rgba(18,55,190,0.4)' : 'rgba(245,240,228,0.13)'}`,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 200ms ease', WebkitTapHighlightColor: 'transparent',
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
                fontSize: 11, display: 'inline-block',
                transform: specsExpanded ? 'rotate(180deg)' : 'none',
                transition: 'transform 200ms ease',
              }}>▾</span>
            </button>

            {specsExpanded && (
              <div style={{ paddingTop: 8 }}>

                {/* Part Number */}
                <div style={{ paddingTop: 18 }}>
                  <label style={LABEL}>Part Number</label>
                  <input value={partNumber} onChange={e => setPartNumber(e.target.value)}
                    placeholder="e.g. 14004-AN001" style={{ ...INPUT, caretColor: '#39ff14' }} />
                </div>

                {/* Basic specs */}
                {Object.entries(basicGroups).map(([groupLabel, fields]) => (
                  <div key={groupLabel || '__ungrouped__'}>
                    {fields.map(renderSpecField)}
                  </div>
                ))}

                {/* Advanced specs */}
                {advancedSpecs.length > 0 && (
                  <div style={{ marginTop: 28 }}>
                    <button
                      onClick={() => setAdvExpanded(x => !x)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '6px 0', display: 'flex', alignItems: 'center', gap: 6,
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      <span style={{
                        fontFamily: FONT_UI, fontWeight: 800, fontSize: 9,
                        letterSpacing: '0.18em', textTransform: 'uppercase',
                        color: advExpanded ? 'rgba(245,240,228,0.55)' : 'rgba(245,240,228,0.28)',
                      }}>
                        {advExpanded ? '— Advanced Specs' : '+ Advanced Specs'}
                      </span>
                    </button>
                    {advExpanded && (
                      <div>
                        {Object.entries(advGroups).map(([groupLabel, fields]) => (
                          <div key={groupLabel || '__ungrouped__'}>
                            {fields.map(renderSpecField)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}
          </div>
        )}

        {/* Error */}
        {saveErr && (
          <p style={{ fontFamily: FONT_UI, fontSize: 12, color: '#ff5555', padding: '12px 20px 0' }}>
            {saveErr}
          </p>
        )}
      </div>

      {/* Save button */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '12px 20px 32px', background: 'linear-gradient(to top, #0d0d0f 60%, transparent)', zIndex: 10 }}>
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
