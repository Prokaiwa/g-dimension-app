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

// ── Types ─────────────────────────────────────────────────────────────────

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

// ── Component ──────────────────────────────────────────────────────────────

export default function TuningPartEditPage() {
  const { partId } = useParams<{ partId: string }>()
  const navigate   = useNavigate()

  const [title,    setTitle]    = useState('')
  const [brand,    setBrand]    = useState('')
  const [category, setCategory] = useState('')
  const [cost,     setCost]     = useState('')
  const [date,     setDate]     = useState('')
  const [notes,    setNotes]    = useState('')
  const [status,   setStatus]   = useState('')

  const [existingPhotos,  setExistingPhotos]  = useState<ExistingPhoto[]>([])
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([])
  const [newPhotos,       setNewPhotos]       = useState<File[]>([])
  const [newPreviews,     setNewPreviews]     = useState<string[]>([])

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

      const [{ data: job }, { data: photoData }] = await Promise.all([
        supabase
          .from('jobs')
          .select('title, brand, category, date_removed, date_installed, parts_cost, notes, status, car_id')
          .eq('id', partId)
          .single(),
        supabase
          .from('job_photos')
          .select('id, photo_url')
          .eq('job_id', partId)
          .order('display_order'),
      ])

      if (!job) { setLoading(false); return }

      const part = job as unknown as Part
      setTitle(part.title ?? '')
      setBrand(part.brand ?? '')
      setCategory(part.category ?? '')
      setCost(part.parts_cost != null ? String(part.parts_cost) : '')
      setStatus(part.status)
      setCarId(part.car_id)
      // date field maps to whichever date is relevant for this part's status
      setDate(part.status === 'removed' ? (part.date_removed ?? '') : (part.date_installed ?? ''))
      setNotes(part.notes ?? '')
      setExistingPhotos((photoData ?? []) as ExistingPhoto[])
      setLoading(false)
    }
    load()
  }, [partId])

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

  const handleSave = async () => {
    if (!partId || !title.trim()) return
    setSaving(true)
    setSaveErr(null)

    const dateField = status === 'removed' ? 'date_removed' : 'date_installed'
    const updates: Record<string, unknown> = {
      title:      title.trim(),
      brand:      brand.trim() || null,
      category:   category || null,
      parts_cost: cost !== '' ? parseFloat(cost) : null,
      notes:      notes.trim() || null,
      [dateField]: date || null,
    }

    const { error: jobErr } = await supabase.from('jobs').update(updates).eq('id', partId)
    if (jobErr) { setSaving(false); setSaveErr(jobErr.message); return }

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

    navigate(`/tuning/parts-bin/${partId}`)
  }

  if (loading) {
    return (
      <div style={{ height: '100dvh', background: COLOR_CARDBOARD_BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontFamily: FONT_HANDWRITTEN, fontSize: 18, color: COLOR_CARDBOARD_INK2, opacity: 0.6 }}>loading...</p>
      </div>
    )
  }

  const dateLabel = status === 'removed' ? 'Date Pulled' : 'Date Acquired'

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

        {/* ── Fields ── */}
        <div style={{ padding: '28px 20px 0', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Title */}
          <div>
            <label style={LABEL}>Name</label>
            <input
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Part name"
              style={{ ...INPUT, fontSize: 22 }}
            />
          </div>

          {/* Brand */}
          <div>
            <label style={LABEL}>Brand</label>
            <input
              value={brand} onChange={e => setBrand(e.target.value)}
              placeholder="—"
              style={INPUT}
            />
          </div>

          {/* Category */}
          <div>
            <label style={LABEL}>Category</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              style={{ ...INPUT, cursor: 'pointer', colorScheme: 'light' }}
            >
              <option value="">—</option>
              {TUNING_CATEGORIES.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Cost */}
          <div>
            <label style={LABEL}>Cost Paid</label>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 18, color: COLOR_CARDBOARD_STAMP, paddingRight: 6, opacity: 0.7 }}>$</span>
              <input
                type="number" inputMode="decimal"
                value={cost} onChange={e => setCost(e.target.value)}
                placeholder="0"
                style={{ ...INPUT, flex: 1 }}
              />
            </div>
          </div>

          {/* Date */}
          <div>
            <label style={LABEL}>{dateLabel}</label>
            <input
              type="date"
              value={date} onChange={e => setDate(e.target.value)}
              style={{ ...INPUT, colorScheme: 'light' }}
            />
          </div>

          {/* Notes */}
          <div>
            <label style={LABEL}>Notes</label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Any details..."
              rows={4}
              style={{
                ...INPUT,
                resize: 'none', lineHeight: 1.55,
                borderBottom: 'none',
                border: `1px solid rgba(26,16,8,0.18)`,
                padding: '10px 12px',
              }}
            />
          </div>

        </div>

        {/* ── Photos ── */}
        <div style={{ padding: '28px 20px 0' }}>
          <label style={LABEL}>Photos</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
            {existingPhotos.map(p => (
              <div key={p.id} style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
                <img src={p.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                <button
                  onClick={() => removeExistingPhoto(p.id)}
                  style={{ position: 'absolute', top: 3, right: 3, width: 22, height: 22, borderRadius: '50%', background: 'rgba(26,16,8,0.75)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}
                >
                  <span style={{ color: '#e8c98a', fontSize: 12, lineHeight: 1, fontWeight: 700 }}>×</span>
                </button>
              </div>
            ))}
            {newPreviews.map((src, i) => (
              <div key={`new-${i}`} style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
                <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.75 }} />
                <button
                  onClick={() => removeNewPhoto(i)}
                  style={{ position: 'absolute', top: 3, right: 3, width: 22, height: 22, borderRadius: '50%', background: 'rgba(26,16,8,0.75)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}
                >
                  <span style={{ color: '#e8c98a', fontSize: 12, lineHeight: 1, fontWeight: 700 }}>×</span>
                </button>
              </div>
            ))}
            <label style={{ width: 80, height: 80, flexShrink: 0, border: `1.5px dashed rgba(26,16,8,0.25)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: 2 }}>
              <span style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 22, color: COLOR_CARDBOARD_INK2, opacity: 0.35, lineHeight: 1 }}>+</span>
              <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: COLOR_CARDBOARD_INK2, opacity: 0.3 }}>Photo</span>
              <input type="file" accept="image/*" multiple onChange={handlePhotoSelect} style={{ display: 'none' }} />
            </label>
          </div>
        </div>

      </div>

      {/* ── Save bar ── */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 20, padding: '16px 20px 36px', background: `linear-gradient(to top, ${COLOR_CARDBOARD_BG} 70%, transparent)` }}>
        {saveErr && (
          <p style={{ fontFamily: FONT_HANDWRITTEN, fontSize: 14, color: '#8b0000', marginBottom: 10 }}>{saveErr}</p>
        )}
        <button
          onClick={handleSave}
          disabled={saving || !title.trim()}
          style={{
            width: '100%', padding: '15px',
            background: title.trim() ? 'rgba(139,58,10,0.15)' : 'transparent',
            border: title.trim() ? `1.5px solid ${COLOR_CARDBOARD_STAMP}` : `1px solid rgba(26,16,8,0.12)`,
            cursor: title.trim() && !saving ? 'pointer' : 'default',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <span style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 17, color: title.trim() ? COLOR_CARDBOARD_STAMP : COLOR_CARDBOARD_INK2, opacity: title.trim() ? 1 : 0.3 }}>
            {saving ? 'Saving…' : 'Save'}
          </span>
        </button>
      </div>

    </div>
  )
}
