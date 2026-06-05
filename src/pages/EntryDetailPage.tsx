// Route: /timeline/entry/:entryId — Entry Detail (Part 10/12).
//
// The full story of one Timeline moment, in the light parchment world. Read-
// focused; editing of session-derived entries happens at the source (Tuning /
// Maintenance), which this page links to. Free-form notes can be deleted here
// (the DB trigger blocks deleting the Origin Entry).
//
// Photo/link sources by type:
//   note     → timeline_entry_photos / timeline_entry_links (migration 047)
//   origin   → single photo_url
//   session  → the session's job_photos / job_links

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getYouTubeId, getYouTubeThumbnail } from '../lib/links'
import {
  COLOR_TIMELINE_BG, COLOR_TIMELINE_CARD, COLOR_TIMELINE_TEXT, COLOR_TIMELINE_MUTED,
  COLOR_TIMELINE_RULE, COLOR_TIMELINE_CHEVRON, COLOR_TIMELINE_YEAR,
  COLOR_TIMELINE_MOD, COLOR_TIMELINE_SERVICE, COLOR_TIMELINE_DETAIL, COLOR_TIMELINE_NOTE,
  RADIUS_TIMELINE_CARD, RADIUS_BUTTON, FONT_UI, FONT_TITLE, COLOR_ACCENT, COLOR_ERROR,
} from '../tokens'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function fmtDate(d: string | null): string {
  if (!d) return ''
  const [y, m, day] = d.split('-').map(Number)
  if (!y || !m || !day) return ''
  return `${MONTHS[m - 1]} ${day}, ${y}`
}

type EntryType = 'origin' | 'modification' | 'maintenance' | 'detail' | 'note'

const TYPE_META: Record<EntryType, { label: string; color: string }> = {
  origin:       { label: 'The Beginning', color: COLOR_TIMELINE_CHEVRON },
  modification: { label: 'Modification',  color: COLOR_TIMELINE_MOD },
  maintenance:  { label: 'Service',       color: COLOR_TIMELINE_SERVICE },
  detail:       { label: 'Detail',        color: COLOR_TIMELINE_DETAIL },
  note:         { label: 'Note',          color: COLOR_TIMELINE_NOTE },
}

type Entry = {
  id: string
  car_id: string
  entry_type: EntryType
  is_origin: boolean
  title: string | null
  photo_url: string | null
  journal_entry: string | null
  display_date: string
  session_id: string | null
}

type LinkRow = { id: string; url: string; label: string | null }

export default function EntryDetailPage() {
  const { entryId } = useParams<{ entryId: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [entry, setEntry] = useState<Entry | null>(null)
  const [title, setTitle] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [links, setLinks] = useState<LinkRow[]>([])
  const [source, setSource] = useState<{ route: string; label: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [delErr, setDelErr] = useState<string | null>(null)

  useEffect(() => {
    if (!entryId) return
    let active = true
    ;(async () => {
      const { data } = await supabase
        .from('timeline_entries')
        .select('id, car_id, entry_type, is_origin, title, photo_url, journal_entry, display_date, session_id')
        .eq('id', entryId).single()
      if (!active) return
      if (!data) { setLoading(false); return }
      const e = data as Entry
      setEntry(e)

      const hero = e.photo_url ? [e.photo_url] : []

      if (e.entry_type === 'note') {
        const [photoRes, linkRes] = await Promise.all([
          supabase.from('timeline_entry_photos').select('photo_url, display_order').eq('entry_id', e.id).order('display_order'),
          supabase.from('timeline_entry_links').select('id, url, label, display_order').eq('entry_id', e.id).order('display_order'),
        ])
        if (!active) return
        const urls = (photoRes.data ?? []).map(p => (p as { photo_url: string }).photo_url)
        setPhotos(urls.length ? urls : hero)
        setLinks((linkRes.data ?? []) as LinkRow[])
        setTitle(e.title?.trim() || 'Note')
      } else if (e.is_origin || e.entry_type === 'origin') {
        setPhotos(hero)
        setTitle('The Beginning')
      } else if (e.session_id) {
        // Session-derived entry: pull the session's jobs, photos, links.
        const [sessRes, jobRes] = await Promise.all([
          supabase.from('sessions').select('title, shop_name, type').eq('id', e.session_id).single(),
          supabase.from('jobs').select('id, title').eq('session_id', e.session_id),
        ])
        if (!active) return
        const sess = sessRes.data as { title: string | null; shop_name: string | null; type: string | null } | null
        const jobs = (jobRes.data ?? []) as { id: string; title: string | null }[]
        const jobIds = jobs.map(j => j.id)

        let urls: string[] = []
        let lks: LinkRow[] = []
        if (jobIds.length) {
          const [phRes, lkRes] = await Promise.all([
            supabase.from('job_photos').select('photo_url, display_order').in('job_id', jobIds).order('display_order'),
            supabase.from('job_links').select('id, url, label, display_order').in('job_id', jobIds).order('display_order'),
          ])
          if (!active) return
          urls = (phRes.data ?? []).map(p => (p as { photo_url: string }).photo_url)
          lks = (lkRes.data ?? []) as LinkRow[]
        }
        setPhotos(urls.length ? urls : hero)
        setLinks(lks)

        // Title
        const jobTitles = jobs.map(j => j.title).filter(Boolean) as string[]
        const t = e.title?.trim()
          || sess?.title?.trim()
          || (jobTitles.length === 1 ? jobTitles[0] : jobTitles.length > 1 ? `${jobTitles.length} jobs` : null)
          || (sess?.shop_name?.trim())
          || TYPE_META[e.entry_type]?.label
        setTitle(t)

        // Source link (edit at origin destination)
        if (e.entry_type === 'modification') {
          if (sess?.title || jobs.length > 1) setSource({ route: `/tuning/mod-group/${e.session_id}`, label: 'View in Tuning' })
          else if (jobs.length === 1) setSource({ route: `/tuning/mods/${jobs[0].id}`, label: 'View in Tuning' })
        } else {
          setSource({ route: `/maintenance/${e.session_id}`, label: 'View in Maintenance' })
        }
      }

      setLoading(false)
    })()
    return () => { active = false }
  }, [entryId])

  const handleDelete = async () => {
    if (!entry || deleting) return
    setDeleting(true)
    setDelErr(null)
    const { error } = await supabase.from('timeline_entries').delete().eq('id', entry.id)
    if (error) { setDelErr(error.message); setDeleting(false); return }
    navigate('/timeline')
  }

  const chevron = (
    <button
      onClick={() => navigate('/timeline')}
      aria-label="Back to timeline"
      style={{
        position: 'fixed', top: 8, left: 8, width: 44, height: 44, zIndex: 30,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(245,242,238,0.6)', backdropFilter: 'blur(4px)', borderRadius: '50%',
        border: 'none', cursor: 'pointer', padding: 0, WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{ color: COLOR_TIMELINE_CHEVRON, fontSize: 30, fontWeight: 300, lineHeight: 1 }}>‹</span>
    </button>
  )

  const page = (children: React.ReactNode) => (
    <div style={{ minHeight: '100dvh', background: COLOR_TIMELINE_BG, fontFamily: FONT_UI, position: 'relative' }}>
      {chevron}
      {children}
    </div>
  )

  if (loading) return page(null)
  if (!entry) {
    return page(
      <div style={{ paddingTop: '40vh', textAlign: 'center', color: COLOR_TIMELINE_MUTED, fontSize: 14 }}>
        Entry not found.
      </div>,
    )
  }

  const meta = TYPE_META[entry.entry_type] ?? TYPE_META.note
  const hero = photos[0] ?? null
  const gallery = photos.slice(1)
  const isNote = entry.entry_type === 'note'

  return page(
    <div style={{ paddingBottom: isNote ? 96 : 40 }}>
      {/* Hero */}
      {hero && (
        <img src={hero} alt="" aria-hidden
          style={{ display: 'block', width: '100%', height: 300, objectFit: 'cover' }} />
      )}

      <div style={{ maxWidth: 390, margin: '0 auto', padding: hero ? '22px 20px 0' : '64px 20px 0' }}>
        {/* Type + date */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ width: 18, height: 3, background: meta.color, borderRadius: 2, display: 'inline-block' }} />
          <span style={{ fontFamily: FONT_UI, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: COLOR_TIMELINE_MUTED }}>
            {meta.label}
          </span>
          <span style={{ marginLeft: 'auto', fontFamily: FONT_UI, fontSize: 12, fontWeight: 600, color: COLOR_TIMELINE_MUTED, fontVariantNumeric: 'tabular-nums' }}>
            {fmtDate(entry.display_date)}
          </span>
        </div>

        {/* Title */}
        <h1 style={{
          margin: '0 0 16px',
          fontFamily: FONT_UI, fontWeight: 800, fontSize: 26, lineHeight: 1.15,
          color: COLOR_TIMELINE_TEXT,
        }}>
          {title}
        </h1>

        {/* Journal */}
        {entry.journal_entry && (
          <p style={{
            margin: '0 0 22px', fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 500,
            fontSize: 19, lineHeight: 1.6, color: COLOR_TIMELINE_TEXT, whiteSpace: 'pre-wrap',
          }}>
            {entry.journal_entry}
          </p>
        )}

        {/* Gallery (photos beyond the hero) */}
        {gallery.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
            {gallery.map((src, i) => (
              <img key={i} src={src} alt="" aria-hidden
                style={{ display: 'block', width: '100%', borderRadius: RADIUS_TIMELINE_CARD, border: `1px solid ${COLOR_TIMELINE_RULE}` }} />
            ))}
          </div>
        )}

        {/* Links */}
        {links.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontFamily: FONT_UI, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: COLOR_TIMELINE_YEAR, marginBottom: 10 }}>
              Links
            </div>
            {links.map(l => {
              const ytId = getYouTubeId(l.url)
              return (
                <button key={l.id} onClick={() => window.open(l.url, '_blank', 'noopener')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                    background: COLOR_TIMELINE_CARD, border: `1px solid ${COLOR_TIMELINE_RULE}`,
                    borderRadius: RADIUS_TIMELINE_CARD, padding: 10, marginBottom: 10, cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                  }}>
                  {ytId ? (
                    <div style={{ width: 72, height: 41, flexShrink: 0, borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                      <img src={getYouTubeThumbnail(ytId)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.25)' }}>
                        <svg width="11" height="13" viewBox="0 0 10 12" fill="none"><path d="M0 0L10 6L0 12V0Z" fill="#fff" fillOpacity="0.9" /></svg>
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: COLOR_ACCENT, fontSize: 15, width: 22, textAlign: 'center', flexShrink: 0 }}>↗</span>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontFamily: FONT_UI, fontWeight: 700, fontSize: 13, color: COLOR_TIMELINE_TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {l.label || l.url}
                    </p>
                    {l.label && (
                      <p style={{ margin: '2px 0 0', fontFamily: FONT_UI, fontSize: 11, color: COLOR_TIMELINE_MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {l.url}
                      </p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Source link for session-derived entries */}
        {source && (
          <button onClick={() => navigate(source.route)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px',
              borderRadius: RADIUS_BUTTON, background: 'transparent', border: `1px solid ${COLOR_TIMELINE_RULE}`,
              cursor: 'pointer', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: COLOR_TIMELINE_TEXT, WebkitTapHighlightColor: 'transparent',
            }}>
            {source.label}
            <span style={{ color: COLOR_TIMELINE_MUTED }}>›</span>
          </button>
        )}
      </div>

      {/* Note actions: Delete (Origin can't be deleted — DB trigger) */}
      {isNote && (
        <div style={{ maxWidth: 390, margin: '0 auto', padding: '8px 20px 0' }}>
          <button onClick={() => setConfirmDelete(true)}
            style={{
              fontFamily: FONT_UI, fontWeight: 700, fontSize: 12, letterSpacing: '0.06em',
              color: COLOR_ERROR, background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0',
              WebkitTapHighlightColor: 'transparent',
            }}>
            Delete entry
          </button>
          {delErr && <p style={{ fontFamily: FONT_UI, fontSize: 12, color: COLOR_ERROR, margin: '4px 0 0' }}>{delErr}</p>}
        </div>
      )}

      {/* Delete confirm sheet */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div onClick={() => !deleting && setConfirmDelete(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(26,24,20,0.4)' }} />
          <div style={{ position: 'relative', background: COLOR_TIMELINE_CARD, borderTopLeftRadius: 12, borderTopRightRadius: 12, padding: '22px 20px calc(22px + env(safe-area-inset-bottom))' }}>
            <p style={{ margin: '0 0 4px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 16, color: COLOR_TIMELINE_TEXT }}>Delete this entry?</p>
            <p style={{ margin: '0 0 18px', fontFamily: FONT_UI, fontSize: 13, color: COLOR_TIMELINE_MUTED, lineHeight: 1.5 }}>
              This removes it from your Timeline for good, along with its photos and links.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDelete(false)} disabled={deleting}
                style={{ flex: 1, padding: '13px', borderRadius: RADIUS_BUTTON, background: 'transparent', border: `1px solid ${COLOR_TIMELINE_RULE}`, cursor: 'pointer', fontFamily: FONT_UI, fontWeight: 800, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: COLOR_TIMELINE_TEXT }}>
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                style={{ flex: 1, padding: '13px', borderRadius: RADIUS_BUTTON, background: COLOR_ERROR, border: 'none', cursor: 'pointer', fontFamily: FONT_UI, fontWeight: 800, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fff' }}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
  )
}
