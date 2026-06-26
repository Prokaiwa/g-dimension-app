// Route: /timeline/new (create) and /timeline/entry/:entryId/edit (edit) —
// compose or edit a free-form Timeline entry ("note").
//
// A note is a build-journal entry not tied to any mod or service: a track day,
// a car show, the story of getting pulled over. Writes a timeline_entries row
// (entry_type='note', session_id=NULL, migration 046) plus any photos/links
// into timeline_entry_photos / timeline_entry_links (migration 047). In edit
// mode it loads the existing note and lets you add/remove photos and links.

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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

type ExistingPhoto = { id: string; photo_url: string }
type ExistingLink = { id: string; url: string; label: string | null }

const removeBtn: React.CSSProperties = {
  position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%',
  background: 'rgba(20,18,16,0.6)', border: 'none', cursor: 'pointer', color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
}

export default function TimelineEntryNewPage() {
  const navigate = useNavigate()
  const { entryId } = useParams<{ entryId: string }>()
  const isEdit = !!entryId
  const today = new Date().toISOString().slice(0, 10)

  const [loading, setLoading] = useState(isEdit)
  const [carId, setCarId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [date, setDate] = useState(today)
  const [title, setTitle] = useState('')
  const [journal, setJournal] = useState('')

  // New (unsaved) media
  const [photos, setPhotos] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [links, setLinks] = useState<{ url: string; label: string }[]>([])
  const [linkUrl, setLinkUrl] = useState('')
  const [linkLabel, setLinkLabel] = useState('')

  // Existing media (edit mode)
  const [existingPhotos, setExistingPhotos] = useState<ExistingPhoto[]>([])
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([])
  const [existingLinks, setExistingLinks] = useState<ExistingLink[]>([])
  const [removedLinkIds, setRemovedLinkIds] = useState<string[]>([])

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

      if (isEdit && entryId) {
        const [entryRes, photoRes, linkRes] = await Promise.all([
          supabase.from('timeline_entries').select('title, journal_entry, display_date, car_id').eq('id', entryId).single(),
          supabase.from('timeline_entry_photos').select('id, photo_url').eq('entry_id', entryId).order('display_order'),
          supabase.from('timeline_entry_links').select('id, url, label').eq('entry_id', entryId).order('display_order'),
        ])
        if (!active) return
        const e = entryRes.data as { title: string | null; journal_entry: string | null; display_date: string; car_id: string } | null
        if (e) {
          setTitle(e.title ?? '')
          setJournal(e.journal_entry ?? '')
          setDate(e.display_date ?? today)
          if (e.car_id) setCarId(e.car_id)
        }
        setExistingPhotos((photoRes.data ?? []) as ExistingPhoto[])
        setExistingLinks((linkRes.data ?? []) as ExistingLink[])
        setLoading(false)
      }
    })()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId])

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

  const removeNewPhoto = (i: number) => {
    setPhotos(prev => prev.filter((_, idx) => idx !== i))
    setPreviews(prev => prev.filter((_, idx) => idx !== i))
  }
  const removeExistingPhoto = (id: string) => {
    setRemovedPhotoIds(prev => [...prev, id])
    setExistingPhotos(prev => prev.filter(p => p.id !== id))
  }

  const addLink = () => {
    const url = linkUrl.trim()
    if (!url) return
    setLinks(prev => [...prev, { url, label: linkLabel.trim() }])
    setLinkUrl('')
    setLinkLabel('')
  }
  const removeNewLink = (i: number) => setLinks(prev => prev.filter((_, idx) => idx !== i))
  const removeExistingLink = (id: string) => {
    setRemovedLinkIds(prev => [...prev, id])
    setExistingLinks(prev => prev.filter(l => l.id !== id))
  }

  const canSave = !!title.trim() && !saving

  const handleSave = async () => {
    if (!canSave) return
    if (!carId) { setErr('No car selected.'); return }
    setErr(null)
    setSaving(true)
    try {
      // 1. Create or update the entry row.
      let id = entryId ?? ''
      if (isEdit && entryId) {
        const { error } = await supabase.from('timeline_entries')
          .update({ title: title.trim(), journal_entry: journal.trim() || null, display_date: date || today })
          .eq('id', entryId)
        if (error) throw error
      } else {
        const { data: entry, error } = await supabase.from('timeline_entries')
          .insert({
            car_id: carId, session_id: null, entry_type: 'note', is_origin: false,
            title: title.trim(), journal_entry: journal.trim() || null, display_date: date || today,
          })
          .select('id').single()
        if (error || !entry) throw error ?? new Error('save failed')
        id = (entry as { id: string }).id
      }

      // 2. Remove deleted existing media.
      if (removedPhotoIds.length) await supabase.from('timeline_entry_photos').delete().in('id', removedPhotoIds)
      if (removedLinkIds.length)  await supabase.from('timeline_entry_links').delete().in('id', removedLinkIds)

      // 3. Upload + insert new photos (ordered after the kept existing ones).
      const newUrls: string[] = []
      if (userId) {
        for (const file of photos) {
          const compressed = await imageCompression(file, COMPRESSION_OPTIONS)
          const path = `${userId}/${carId}/note/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
          const { data: up, error: upErr } = await supabase.storage
            .from('timeline-photos').upload(path, compressed, { contentType: 'image/jpeg' })
          if (upErr || !up) continue
          newUrls.push(supabase.storage.from('timeline-photos').getPublicUrl(up.path).data.publicUrl)
        }
      }
      if (newUrls.length) {
        const base = existingPhotos.length
        await supabase.from('timeline_entry_photos').insert(
          newUrls.map((u, i) => ({ entry_id: id, car_id: carId, photo_url: u, display_order: base + i })),
        )
      }

      // 4. Insert new links (include a URL still sitting in the input).
      const pending = linkUrl.trim()
      const allNew = pending ? [...links, { url: pending, label: linkLabel.trim() }] : links
      if (allNew.length) {
        const base = existingLinks.length
        await supabase.from('timeline_entry_links').insert(
          allNew.map((l, i) => ({ entry_id: id, car_id: carId, url: l.url, label: l.label || null, display_order: base + i })),
        )
      }

      // 5. Keep the card hero in sync: first kept existing photo, else first new.
      const hero = existingPhotos[0]?.photo_url ?? newUrls[0] ?? null
      await supabase.from('timeline_entries').update({ photo_url: hero }).eq('id', id)

      navigate(isEdit ? `/timeline/entry/${id}` : '/timeline')
    } catch (e) {
      setErr((e as { message?: string })?.message ?? 'Couldn’t save the entry. Try again.')
      setSaving(false)
    }
  }

  const backTo = isEdit ? `/timeline/entry/${entryId}` : '/timeline'

  if (loading) {
    return <div style={{ minHeight: '100dvh', background: COLOR_TIMELINE_BG }} />
  }

  return (
    <div style={{ minHeight: '100dvh', background: COLOR_TIMELINE_BG, fontFamily: FONT_UI }}>
      <input ref={fileRef} type="file" accept="image/*" multiple onChange={onPick} style={{ display: 'none' }} />

      {/* Floating amber-gold chevron */}
      <button
        onClick={() => navigate(backTo)}
        aria-label="Back"
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
          {isEdit ? 'Edit entry' : 'New entry'}
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
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ ...inputStyle, WebkitAppearance: 'none', appearance: 'none', minWidth: 0 } as React.CSSProperties} />
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
            {existingPhotos.map(p => (
              <div key={p.id} style={{ position: 'relative', width: 84, height: 84, borderRadius: RADIUS_TIMELINE_CARD, overflow: 'hidden', border: `1px solid ${COLOR_TIMELINE_RULE}` }}>
                <img src={p.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                <button onClick={() => removeExistingPhoto(p.id)} aria-label="Remove photo" style={removeBtn}>×</button>
              </div>
            ))}
            {previews.map((src, i) => (
              <div key={i} style={{ position: 'relative', width: 84, height: 84, borderRadius: RADIUS_TIMELINE_CARD, overflow: 'hidden', border: `1px solid ${COLOR_TIMELINE_RULE}` }}>
                <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                <button onClick={() => removeNewPhoto(i)} aria-label="Remove photo" style={removeBtn}>×</button>
              </div>
            ))}
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

          {[
            ...existingLinks.map(l => ({ key: `e-${l.id}`, url: l.url, label: l.label, onRemove: () => removeExistingLink(l.id) })),
            ...links.map((l, i) => ({ key: `n-${i}`, url: l.url, label: l.label || null, onRemove: () => removeNewLink(i) })),
          ].map(item => {
            const ytId = getYouTubeId(item.url)
            return (
              <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                {ytId ? (
                  <div style={{ width: 56, height: 32, flexShrink: 0, overflow: 'hidden', borderRadius: 3 }}>
                    <img src={getYouTubeThumbnail(ytId)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                ) : (
                  <span style={{ color: COLOR_ACCENT, fontSize: 14, width: 20, textAlign: 'center', flexShrink: 0 }}>↗</span>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontFamily: FONT_UI, fontWeight: 600, fontSize: 12, color: COLOR_TIMELINE_TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.label || item.url}
                  </p>
                  {item.label && (
                    <p style={{ margin: '1px 0 0', fontFamily: FONT_UI, fontSize: 10, color: COLOR_TIMELINE_MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.url}
                    </p>
                  )}
                </div>
                <button onClick={item.onRemove} aria-label="Remove link"
                  style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,0.05)', border: 'none', cursor: 'pointer', color: COLOR_TIMELINE_MUTED, fontSize: 14 }}>×</button>
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
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '12px 20px calc(28px + env(safe-area-inset-bottom))',
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
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add to Timeline'}
        </button>
      </div>
    </div>
  )
}
