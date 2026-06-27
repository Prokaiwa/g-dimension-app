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

import React, { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getYouTubeId, getYouTubeThumbnail } from '../lib/links'
import { milesToUnit, asMileageUnit } from '../lib/mileage'
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
  note:         { label: 'Entry',         color: COLOR_TIMELINE_NOTE },
}

// Supabase photo that fades in on load (matches the CarStage idiom).
function FadeImg({ src, style, onLoaded }: { src: string; style?: React.CSSProperties; onLoaded?: () => void }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <img
      src={src} alt="" aria-hidden decoding="async"
      onLoad={() => { setLoaded(true); onLoaded?.() }}
      style={{ ...style, opacity: loaded ? 1 : 0, transition: 'opacity 200ms ease' }}
    />
  )
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
  const [jobsList, setJobsList] = useState<{ brand: string | null; title: string | null; category: string | null }[]>([])
  const [sessionInfo, setSessionInfo] = useState<{ shop: string | null; mileage: number | null; mileageUnit: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [delErr, setDelErr] = useState<string | null>(null)
  const [photoIndex, setPhotoIndex] = useState(0)

  // Gallery carousel + fullscreen viewer (FB-Marketplace-style pager)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerIdx,  setViewerIdx]  = useState(0)
  const viewerIdxRef = useRef(0)
  const touchStartX  = useRef(0)
  const carouselDx   = useRef(0)
  const scrollRef    = useRef<HTMLDivElement>(null)
  const overlayRef   = useRef<HTMLDivElement>(null)
  const vertRef      = useRef<HTMLDivElement>(null)
  const stripRef     = useRef<HTMLDivElement>(null)
  const chromeRef    = useRef<HTMLDivElement>(null)
  const g = useRef({ x0: 0, y0: 0, lx: 0, ly: 0, lt: 0, vx: 0, vy: 0, dx: 0, dy: 0, lock: null as 'h' | 'v' | null })

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
        setTitle(e.title?.trim() || 'Entry')
      } else if (e.is_origin || e.entry_type === 'origin') {
        setPhotos(hero)
        setTitle('The Beginning')
      } else if (e.session_id) {
        // Session-derived entry: pull the session's jobs, photos, links.
        const [sessRes, jobRes, carRes] = await Promise.all([
          supabase.from('sessions').select('title, shop_name, type, mileage').eq('id', e.session_id).single(),
          supabase.from('jobs').select('id, title, brand, category').eq('session_id', e.session_id),
          supabase.from('cars').select('mileage_unit').eq('id', e.car_id).single(),
        ])
        if (!active) return
        const sess = sessRes.data as { title: string | null; shop_name: string | null; type: string | null; mileage: number | null } | null
        const jobs = (jobRes.data ?? []) as { id: string; title: string | null; brand: string | null; category: string | null }[]
        const mileageUnit = (carRes.data as { mileage_unit: string | null } | null)?.mileage_unit || 'mi'
        const jobIds = jobs.map(j => j.id)

        setJobsList(jobs.map(j => ({ brand: j.brand, title: j.title, category: j.category })))
        setSessionInfo({ shop: sess?.shop_name ?? null, mileage: sess?.mileage ?? null, mileageUnit })

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

  const H_SNAP = 'transform 300ms cubic-bezier(0.22,1,0.36,1)'
  const V_SNAP = 'transform 340ms cubic-bezier(0.22,1,0.36,1)'
  const paintStrip = (dx: number, animate: boolean) => {
    const el = stripRef.current; if (!el) return
    el.style.transition = animate ? H_SNAP : 'none'
    el.style.transform  = `translateX(calc(${-viewerIdxRef.current * 100}% + ${dx}px))`
  }
  const paintVertical = (dy: number, animate: boolean) => {
    const v = vertRef.current, o = overlayRef.current, c = chromeRef.current
    const scale = Math.max(0.86, 1 - Math.abs(dy) / 1100)
    const alpha = Math.max(0, 1 - Math.abs(dy) / 280)
    if (v) { v.style.transition = animate ? V_SNAP : 'none'; v.style.transform = `translateY(${dy}px) scale(${scale})` }
    if (o) { o.style.transition = animate ? 'background 340ms ease' : 'none'; o.style.background = `rgba(0,0,0,${alpha})` }
    if (c) { c.style.transition = animate ? 'opacity 340ms ease' : 'none'; c.style.opacity = String(alpha) }
  }
  const openViewer  = (idx: number) => { viewerIdxRef.current = idx; setViewerIdx(idx); setViewerOpen(true) }
  const closeViewer = () => { setPhotoIndex(viewerIdxRef.current); setViewerOpen(false) }
  useEffect(() => {
    if (!viewerOpen) return
    paintStrip(0, false); paintVertical(0, false)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [viewerOpen])
  const onCarouselTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; carouselDx.current = 0 }
  const onCarouselTouchMove  = (e: React.TouchEvent) => { carouselDx.current = touchStartX.current - e.touches[0].clientX }
  const commitCarouselSwipe  = () => {
    const diff = carouselDx.current; carouselDx.current = 0
    if (diff > 40)       setPhotoIndex(i => Math.min(i + 1, photos.length - 1))
    else if (diff < -40) setPhotoIndex(i => Math.max(i - 1, 0))
  }
  const onViewerTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    g.current = { x0: t.clientX, y0: t.clientY, lx: t.clientX, ly: t.clientY, lt: performance.now(), vx: 0, vy: 0, dx: 0, dy: 0, lock: null }
  }
  const onViewerTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0], s = g.current
    const dx = t.clientX - s.x0, dy = t.clientY - s.y0
    const now = performance.now(), dt = now - s.lt
    if (dt > 0) { s.vx = (t.clientX - s.lx) / dt; s.vy = (t.clientY - s.ly) / dt }
    s.lx = t.clientX; s.ly = t.clientY; s.lt = now; s.dx = dx; s.dy = dy
    if (s.lock === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8))
      s.lock = Math.abs(dy) > Math.abs(dx) * 1.3 ? 'v' : 'h'
    if (s.lock === 'h') {
      const atStart = viewerIdxRef.current === 0 && dx > 0
      const atEnd   = viewerIdxRef.current === photos.length - 1 && dx < 0
      paintStrip(atStart || atEnd ? dx * 0.3 : dx, false)
    } else if (s.lock === 'v') {
      paintVertical(dy < 0 ? dy * 0.3 : dy, false)
    }
  }
  const onViewerTouchEnd = () => {
    const s = g.current
    if (s.lock === 'h') {
      const w = window.innerWidth; const flick = Math.abs(s.vx) > 0.4 && Math.abs(s.dx) > 12
      let ni = viewerIdxRef.current
      if      (s.dx < -w * 0.25 || (flick && s.vx < 0)) ni = Math.min(ni + 1, photos.length - 1)
      else if (s.dx >  w * 0.25 || (flick && s.vx > 0)) ni = Math.max(ni - 1, 0)
      viewerIdxRef.current = ni; setViewerIdx(ni); setPhotoIndex(ni)
      paintStrip(0, true)
    } else if (s.lock === 'v') {
      const flickDown = s.vy > 0.5 && s.dy > 0
      if (s.dy > 110 || flickDown) { paintVertical(window.innerHeight, true); window.setTimeout(closeViewer, 200) }
      else paintVertical(0, true)
    }
  }

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
    <div style={{ minHeight: '100dvh', background: COLOR_TIMELINE_BG, fontFamily: FONT_UI, position: 'relative', overscrollBehavior: 'none' }}>
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
  const isNote = entry.entry_type === 'note'

  // Internal links (stored as app-relative paths, e.g. a DIY guide) render as a
  // navigation button rather than an external link card.
  const internalLinks = links.filter(l => l.url.startsWith('/'))
  const externalLinks = links.filter(l => !l.url.startsWith('/'))

  return page(
    <div ref={scrollRef} style={{ paddingBottom: isNote ? 96 : 40 }}>
      {/* Photo carousel — all photos, hero first */}
      {photos.length > 0 && (
        <div style={{ marginBottom: 0, position: 'relative' }}>
          <div
            style={{ width: '100%', height: 300, overflow: 'hidden', touchAction: 'pan-y', cursor: 'zoom-in' }}
            onTouchStart={onCarouselTouchStart} onTouchMove={onCarouselTouchMove}
            onTouchEnd={commitCarouselSwipe} onTouchCancel={commitCarouselSwipe}
            onClick={() => openViewer(photoIndex)}
          >
            <div style={{ display: 'flex', height: '100%', transform: `translateX(-${photoIndex * 100}%)`, transition: 'transform 280ms cubic-bezier(0.22,1,0.36,1)' }}>
              {photos.map((src, i) => (
                <FadeImg key={i} src={src} style={{ width: '100%', height: '100%', flexShrink: 0, objectFit: 'cover', display: 'block' }} />
              ))}
            </div>
          </div>
          {photos.length > 1 && (
            <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5, pointerEvents: 'none' }}>
              {photos.map((_, i) => (
                <div key={i} style={{ width: i === photoIndex ? 14 : 5, height: 5, borderRadius: 3, background: i === photoIndex ? 'rgba(245,240,230,0.9)' : 'rgba(245,240,230,0.35)', transition: 'all 200ms ease' }} />
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ maxWidth: 390, margin: '0 auto', padding: photos.length > 0 ? '22px 20px 0' : '64px 20px 0' }}>
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

        {/* Meta strip — shop · mileage at the time */}
        {sessionInfo && (sessionInfo.shop || sessionInfo.mileage != null) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px', margin: '-6px 0 18px', fontFamily: FONT_UI, fontSize: 12.5, fontWeight: 600, color: COLOR_TIMELINE_YEAR }}>
            {sessionInfo.shop && <span>{sessionInfo.shop}</span>}
            {sessionInfo.shop && sessionInfo.mileage != null && <span style={{ opacity: 0.5 }}>·</span>}
            {sessionInfo.mileage != null && (
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                {milesToUnit(sessionInfo.mileage, asMileageUnit(sessionInfo.mileageUnit)).toLocaleString()} {asMileageUnit(sessionInfo.mileageUnit)}
              </span>
            )}
          </div>
        )}

        {/* Journal */}
        {entry.journal_entry && (
          <p style={{
            margin: '0 0 22px', fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 500,
            fontSize: 19, lineHeight: 1.6, color: COLOR_TIMELINE_TEXT, whiteSpace: 'pre-wrap',
          }}>
            {entry.journal_entry}
          </p>
        )}

        {/* What was done — the components in this session */}
        {jobsList.length >= 2 && (
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontFamily: FONT_UI, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: COLOR_TIMELINE_YEAR, marginBottom: 10 }}>
              What was done
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: COLOR_TIMELINE_RULE, borderRadius: RADIUS_TIMELINE_CARD, overflow: 'hidden' }}>
              {jobsList.map((j, i) => {
                const name = [j.brand?.trim(), j.title?.trim()].filter(Boolean).join(' ') || 'Item'
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: COLOR_TIMELINE_CARD, padding: '11px 14px' }}>
                    <span style={{ fontFamily: FONT_UI, fontSize: 14, fontWeight: 700, color: COLOR_TIMELINE_TEXT, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    {j.category && <span style={{ flexShrink: 0, fontFamily: FONT_UI, fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: COLOR_TIMELINE_MUTED }}>{j.category}</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Internal navigation buttons (e.g. View Install Guide) */}
        {internalLinks.map(l => (
          <button key={l.id} onClick={() => navigate(l.url)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px', marginBottom: 22,
              borderRadius: RADIUS_BUTTON, background: 'transparent', border: `1px solid ${COLOR_TIMELINE_RULE}`,
              cursor: 'pointer', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: COLOR_TIMELINE_TEXT, WebkitTapHighlightColor: 'transparent',
            }}>
            {l.label || 'View Install Guide'}
            <span style={{ color: COLOR_TIMELINE_MUTED }}>›</span>
          </button>
        ))}

        {/* Links */}
        {externalLinks.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontFamily: FONT_UI, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: COLOR_TIMELINE_YEAR, marginBottom: 10 }}>
              Links
            </div>
            {externalLinks.map(l => {
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

      {/* Note actions: Edit + Delete (Origin can't be deleted — DB trigger) */}
      {isNote && (
        <div style={{ maxWidth: 390, margin: '0 auto', padding: '8px 20px 0', display: 'flex', alignItems: 'center', gap: 18 }}>
          <button onClick={() => navigate(`/timeline/entry/${entry.id}/edit`)}
            style={{
              fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: COLOR_TIMELINE_TEXT, background: 'transparent', border: `1px solid ${COLOR_TIMELINE_RULE}`,
              borderRadius: RADIUS_BUTTON, padding: '10px 18px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}>
            Edit
          </button>
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

      {/* Fullscreen gallery viewer */}
      {viewerOpen && (
        <div ref={overlayRef}
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,1)', display: 'flex', alignItems: 'center', touchAction: 'none', overflow: 'hidden', overscrollBehavior: 'none' }}
          onClick={closeViewer}
        >
          <div ref={vertRef}
            style={{ width: '100%', height: '100dvh', display: 'flex', alignItems: 'center', willChange: 'transform' }}
            onTouchStart={onViewerTouchStart} onTouchMove={onViewerTouchMove} onTouchEnd={onViewerTouchEnd}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <div ref={stripRef} style={{ display: 'flex', width: '100%', willChange: 'transform' }}>
              {photos.map((src, i) => (
                <div key={i} style={{ width: '100%', flexShrink: 0, height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src={src} alt="" draggable={false} style={{ maxWidth: '100%', maxHeight: '90dvh', width: 'auto', height: 'auto', objectFit: 'contain', display: 'block', userSelect: 'none', pointerEvents: 'none', WebkitUserSelect: 'none' as React.CSSProperties['WebkitUserSelect'] }} />
                </div>
              ))}
            </div>
          </div>
          <div ref={chromeRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            <button onClick={closeViewer} style={{ position: 'absolute', top: 16, right: 16, width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent', pointerEvents: 'auto' }}>
              <span style={{ color: COLOR_ACCENT, fontSize: 20, lineHeight: 1 }}>×</span>
            </button>
            <p style={{ position: 'absolute', left: 0, right: 0, bottom: 20, textAlign: 'center', fontFamily: FONT_UI, fontSize: 11, letterSpacing: '0.08em', color: 'rgba(245,240,228,0.45)', margin: 0 }}>
              {photos.length > 1 ? `${viewerIdx + 1} / ${photos.length} · swipe down to close` : 'swipe down to close'}
            </p>
          </div>
        </div>
      )}
    </div>,
  )
}
