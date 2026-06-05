// Route: /timeline/new — compose a free-form Timeline entry ("note").
//
// A note is a build-journal entry not tied to any mod or service: a track day,
// a car show, the story of getting pulled over. Writes a timeline_entries row
// (entry_type='note', session_id=NULL, migration 046) plus any photos/links
// into timeline_entry_photos / timeline_entry_links (migration 047) — added at
// compose time, no edit round-trip. Lives in the light parchment Timeline world.

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import imageCompression from 'browser-image-compression'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import { getYouTubeId, getYouTubeThumbnail } from '../lib/links'
import { CameraIcon } from '../components/CameraIcon'
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
  const [photos, setPhotos] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [links, setLinks] = useState<{ url: string; label: string }[]>([])
  const [linkUrl, setLinkUrl] = useState('')
  const [linkLabel, setLinkLabel] = useState('')
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
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length) return
    setPhotos(prev => [...prev, ...files])
    files.forEach(f => {
      const reader = new FileReader()
      reader.onload = ev => setPreviews(prev => [...prev, ev.target?.result as string])
      reader.readAsDataURL(f)
    })
  }

  const removePhoto = (i: number) => {
    setPhotos(prev => prev.filter((_, idx) => idx !== i))
    setPreviews(prev => prev.filter((_, idx) => idx !== i))
  }

  const addLink = () => {
    const url = linkUrl.trim()
    if (!url) return
    setLinks(prev => [...prev, { url, label: linkLabel.trim() }])
    setLinkUrl('')
    setLinkLabel('')
  }

  const removeLink = (i: number) => setLinks(prev => prev.filter((_, idx) => idx !== i))

  const canSave = !!title.trim() && !saving

  const handleSave = async () => {
    if (!canSave) return
    if (!carId) { setErr('No car selected.'); return }
    setErr(null)
    setSaving(true)
    try {
      // 1. The entry itself
      const { data: entry, error: entryErr } = await supabase
        .from('timeline_entries')
        .insert({
          car_id: carId,
          session_id: null,
          entry_type: 'note',
          is_origin: false,
          title: title.trim(),
          journal_entry: journal.trim() || null,
          display_date: date || today,
        })
        .select('id').single()
      if (entryErr || !entry) throw entryErr ?? new Error('save failed')
      const entryId = (entry as { id: string }).id

      // 2. Photos → upload, then gallery rows; hero = first photo
      const urls: string[] = []
      if (userId) {
        for (const file of photos) {
          const compressed = await imageCompression(file, COMPRESSION_OPTIONS)
          const path = `${userId}/${carId}/note/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
          const { data: up, error: upErr } = await supabase.storage
            .from('timeline-photos')
            .upload(path, compressed, { contentType: 'image/jpeg' })
          if (upErr || !up) continue
          urls.push(supabase.storage.from('timeline-photos').getPublicUrl(up.path).data.publicUrl)
        }
      }
      if (urls.length) {
        await supabase.from('timeline_entry_photos').insert(
          urls.map((u, i) => ({ entry_id: entryId, car_id: carId, photo_url: u, display_order: i })),
        )
        await supabase.from('timeline_entries').update({ photo_url: urls[0] }).eq('id', entryId)
      }

      // 3. Links (include a URL still sitting in the input)
      const pending = linkUrl.trim()
      const allLinks = pending ? [...links, { url: pending, label: linkLabel.trim() }] : links
      if (allLinks.length) {
        await supabase.from('timeline_entry_links').insert(
          allLinks.map((l, i) => ({ entry_id: entryId, car_id: carId, url: l.url, label: l.label || null, display_order: i })),
        )
      }

      navigate('/timeline')
    } catch (e) {
      setErr((e as { message?: string })?.message ?? 'Couldn’t save the entry. Try again.')
      setSaving(false)
    }
  }

  return (
    <div style={{ minHeight: '100dvh', background: COLOR_TIMELINE_BG, fontFamily: FONT_UI }}>
      <input ref={fileRef} type="file" accept="image/*" multiple onChange={onPick} style={{ display: 'none' }} />

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

        {/* Photos */}
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Photos</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {previews.map((src, i) => (
              <div key={i} style={{ position: 'relative', width: 84, height: 84, borderRadius: RADIUS_TIMELINE_CARD, overflow: 'hidden', border: `1px solid ${COLOR_TIMELINE_RULE}` }}>
                <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                <button
                  onClick={() => removePhoto(i)} aria-label="Remove photo"
                  style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', background: 'rgba(20,18,16,0.6)', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}
                >×</button>
              </div>
            ))}
            {/* Add tile */}
            <button
              onClick={() => fileRef.current?.click()} aria-label="Add photos"
              style={{
                width: 84, height: 84, borderRadius: RADIUS_TIMELINE_CARD, cursor: 'pointer',
                background: 'rgba(200,160,80,0.06)', border: `1px dashed ${COLOR_TIMELINE_RULE}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <CameraIcon size={24} color={COLOR_TIMELINE_NOTE} />
            </button>
          </div>
        </div>

        {/* Links */}
        <div style={{ marginBottom: 8 }}>
          <label style={labelStyle}>Links</label>

          {links.map((l, i) => {
            const ytId = getYouTubeId(l.url)
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                {ytId ? (
                  <div style={{ width: 56, height: 32, flexShrink: 0, overflow: 'hidden', borderRadius: 3, position: 'relative' }}>
                    <img src={getYouTubeThumbnail(ytId)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                ) : (
                  <span style={{ color: COLOR_ACCENT, fontSize: 14, width: 20, textAlign: 'center', flexShrink: 0 }}>↗</span>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontFamily: FONT_UI, fontWeight: 600, fontSize: 12, color: COLOR_TIMELINE_TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {l.label || l.url}
                  </p>
                  {l.label && (
                    <p style={{ margin: '1px 0 0', fontFamily: FONT_UI, fontSize: 10, color: COLOR_TIMELINE_MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {l.url}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => removeLink(i)} aria-label="Remove link"
                  style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,0.05)', border: 'none', cursor: 'pointer', color: COLOR_TIMELINE_MUTED, fontSize: 14 }}
                >×</button>
              </div>
            )
          })}

          <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://"
            style={{ ...inputStyle, marginBottom: 8 }} />
          <input value={linkLabel} onChange={e => setLinkLabel(e.target.value)} placeholder="Label (optional)"
            style={{ ...inputStyle, marginBottom: 10 }} />
          <button
            onClick={addLink} disabled={!linkUrl.trim()}
            style={{
              padding: '9px 16px', borderRadius: RADIUS_BUTTON,
              background: 'transparent', border: `1px solid ${linkUrl.trim() ? COLOR_ACCENT : COLOR_TIMELINE_RULE}`,
              cursor: linkUrl.trim() ? 'pointer' : 'default',
              fontFamily: FONT_UI, fontWeight: 800, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
              color: linkUrl.trim() ? COLOR_ACCENT : COLOR_TIMELINE_MUTED,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            + Add link
          </button>
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
