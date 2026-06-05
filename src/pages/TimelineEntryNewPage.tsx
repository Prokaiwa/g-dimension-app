// Route: /timeline/new — compose a free-form Timeline entry ("note").
//
// A note is a build-journal entry not tied to any mod or service: a track day,
// a car show, the story of getting pulled over. Writes a timeline_entries row
// with entry_type='note', session_id=NULL (migration 046). Lives in the light
// parchment world of the Timeline rather than the dark form aesthetic — you're
// writing in your journal, in the same warm space.

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import imageCompression from 'browser-image-compression'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import {
  COLOR_TIMELINE_BG, COLOR_TIMELINE_CARD, COLOR_TIMELINE_TEXT, COLOR_TIMELINE_MUTED,
  COLOR_TIMELINE_RULE, COLOR_TIMELINE_CHEVRON, COLOR_TIMELINE_NOTE,
  RADIUS_TIMELINE_CARD, RADIUS_BUTTON, FONT_UI, FONT_TITLE,
  COLOR_ACCENT, COLOR_ACCENT_TEXT, COLOR_ERROR,
} from '../tokens'

const COMPRESSION_OPTIONS = {
  maxSizeMB: 1, maxWidthOrHeight: 1920,
  useWebWorker: true, exifOrientation: -1 as const, fileType: 'image/jpeg' as const,
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontFamily: FONT_UI, fontWeight: 800, fontSize: 10,
  letterSpacing: '0.14em', textTransform: 'uppercase', color: COLOR_TIMELINE_MUTED, marginBottom: 7,
}

const inputStyle: React.CSSProperties = {
  display: 'block', width: '100%', boxSizing: 'border-box',
  background: COLOR_TIMELINE_CARD, border: `1px solid ${COLOR_TIMELINE_RULE}`,
  borderRadius: RADIUS_TIMELINE_CARD, padding: '12px 14px',
  fontFamily: FONT_UI, fontSize: 15, color: COLOR_TIMELINE_TEXT, outline: 'none',
}

export default function TimelineEntryNewPage() {
  const navigate = useNavigate()
  const today = new Date().toISOString().slice(0, 10)

  const [carId, setCarId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [date, setDate] = useState(today)
  const [title, setTitle] = useState('')
  const [journal, setJournal] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const [cid, { data: { session } }] = await Promise.all([
        getActiveCarId(),
        supabase.auth.getSession(),
      ])
      if (!active) return
      setCarId(cid)
      setUserId(session?.user?.id ?? null)
    })()
    return () => { active = false }
  }, [])

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setPhoto(f)
    const reader = new FileReader()
    reader.onload = ev => setPreview(ev.target?.result as string)
    reader.readAsDataURL(f)
  }

  const canSave = !!title.trim() && !saving

  const handleSave = async () => {
    if (!canSave) return
    if (!carId) { setErr('No car selected.'); return }
    setErr(null)
    setSaving(true)
    try {
      let photoUrl: string | null = null
      if (photo && userId) {
        const compressed = await imageCompression(photo, COMPRESSION_OPTIONS)
        const path = `${userId}/${carId}/note/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
        const { data: up, error: upErr } = await supabase.storage
          .from('timeline-photos')
          .upload(path, compressed, { contentType: 'image/jpeg' })
        if (upErr || !up) throw upErr ?? new Error('upload failed')
        photoUrl = supabase.storage.from('timeline-photos').getPublicUrl(up.path).data.publicUrl
      }

      const { error } = await supabase.from('timeline_entries').insert({
        car_id: carId,
        session_id: null,
        entry_type: 'note',
        is_origin: false,
        title: title.trim(),
        journal_entry: journal.trim() || null,
        photo_url: photoUrl,
        display_date: date || today,
      })
      if (error) throw error
      navigate('/timeline')
    } catch (e) {
      setErr((e as { message?: string })?.message ?? 'Couldn’t save the entry. Try again.')
      setSaving(false)
    }
  }

  return (
    <div style={{ minHeight: '100dvh', background: COLOR_TIMELINE_BG, fontFamily: FONT_UI }}>
      <input ref={fileRef} type="file" accept="image/*" onChange={onPick} style={{ display: 'none' }} />

      {/* Floating amber-gold chevron — back to the Timeline */}
      <button
        onClick={() => navigate('/timeline')}
        aria-label="Back to timeline"
        style={{
          position: 'fixed', top: 8, left: 8, width: 44, height: 44, zIndex: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span style={{ color: COLOR_TIMELINE_CHEVRON, fontSize: 30, fontWeight: 300, lineHeight: 1 }}>‹</span>
      </button>

      <div style={{ maxWidth: 390, margin: '0 auto', padding: '60px 20px 120px' }}>
        <h1 style={{
          margin: '0 0 4px', fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600,
          fontSize: 30, color: COLOR_TIMELINE_TEXT, lineHeight: 1.1,
        }}>
          New entry
        </h1>
        <p style={{ margin: '0 0 26px', fontFamily: FONT_UI, fontSize: 12, color: COLOR_TIMELINE_MUTED, lineHeight: 1.5 }}>
          A moment in the story — a track day, a show, a drive worth remembering.
        </p>

        {/* Title */}
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Title *</label>
          <input value={title} onChange={e => setTitle(e.target.value)}
            placeholder="e.g. First track day at Tsukuba" style={inputStyle} />
        </div>

        {/* Date */}
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
        </div>

        {/* Journal */}
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Your note</label>
          <textarea value={journal} onChange={e => setJournal(e.target.value)} rows={6}
            placeholder="How did it go?"
            style={{ ...inputStyle, resize: 'none', lineHeight: 1.5,
              fontFamily: FONT_TITLE, fontStyle: 'italic', fontSize: 17 } as React.CSSProperties} />
        </div>

        {/* Photo */}
        <div style={{ marginBottom: 8 }}>
          <label style={labelStyle}>Photo</label>
          {preview ? (
            <div style={{ position: 'relative', borderRadius: RADIUS_TIMELINE_CARD, overflow: 'hidden', border: `1px solid ${COLOR_TIMELINE_RULE}` }}>
              <img src={preview} alt="" style={{ display: 'block', width: '100%', height: 200, objectFit: 'cover' }} />
              <button
                onClick={() => { setPhoto(null); setPreview(null) }}
                aria-label="Remove photo"
                style={{
                  position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: '50%',
                  background: 'rgba(20,18,16,0.6)', border: 'none', cursor: 'pointer', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
                }}
              >×</button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                width: '100%', height: 110, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                background: 'rgba(200,160,80,0.06)', borderRadius: RADIUS_TIMELINE_CARD,
                border: `1px dashed ${COLOR_TIMELINE_RULE}`,
              }}
            >
              <span style={{ fontSize: 20, lineHeight: 1 }}>📷</span>
              <span style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: COLOR_TIMELINE_NOTE }}>
                Add a photo
              </span>
            </button>
          )}
        </div>

        {err && (
          <p style={{ fontFamily: FONT_UI, fontSize: 12, color: COLOR_ERROR, marginTop: 14 }}>{err}</p>
        )}
      </div>

      {/* Save */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '12px 20px 28px',
        background: `linear-gradient(to top, ${COLOR_TIMELINE_BG} 62%, transparent)` }}>
        <button
          onClick={handleSave}
          disabled={!canSave}
          style={{
            width: '100%', maxWidth: 390, margin: '0 auto', display: 'block', padding: '15px',
            borderRadius: RADIUS_BUTTON, border: 'none', cursor: canSave ? 'pointer' : 'default',
            background: canSave ? COLOR_ACCENT : 'rgba(200,102,26,0.35)',
            color: canSave ? COLOR_ACCENT_TEXT : 'rgba(255,255,255,0.6)',
            fontFamily: FONT_UI, fontWeight: 800, fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase',
            WebkitTapHighlightColor: 'transparent', transition: 'background 200ms',
          }}
        >
          {saving ? 'Saving…' : 'Add to Timeline'}
        </button>
      </div>
    </div>
  )
}
