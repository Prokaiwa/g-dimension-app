// Route: /builds/:username/mods/:modId — read-only public mod detail.
// Mirrors TuningModDetailPage: photo carousel, fullscreen viewer, specs,
// links. Strips all owner-only content: costs, Remove/Edit/reminder actions,
// "Set section photo" button. Queries are anon-RLS gated (jobs visible only
// when cars.is_public AND show_buildsheet_publicly). Back → public build sheet.
import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ArrivalFade from '../components/ArrivalFade'
import { FONT_UI, COLOR_ACCENT, COLOR_HEADER_BLACK, COLOR_HEADER_WARM, HEADER_HEIGHT } from '../tokens'
import { getYouTubeId, getYouTubeThumbnail, type JobLink } from '../lib/links'

const LABEL: React.CSSProperties = {
  fontFamily: FONT_UI, fontWeight: 700, fontSize: 9,
  letterSpacing: '0.14em', textTransform: 'uppercase',
  color: 'rgba(245,240,228,0.3)', margin: 0,
}
const VALUE: React.CSSProperties = {
  fontFamily: FONT_UI, fontWeight: 600, fontSize: 14,
  color: 'rgba(245,240,228,0.82)',
  marginTop: 3, margin: 0,
}
const NOISE_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`

type Job = {
  id: string; title: string; brand: string | null; category: string | null
  date_installed: string | null; installed_by: 'self' | 'shop' | null
  notes: string | null; part_type_id: number | null
}
type Photo   = { id: string; photo_url: string; display_order: number | null }
type SpecRow = { label: string; value: string; unit: string | null; inputType: string; group: string | null; order: number }

function formatDate(d: string | null): string | null {
  if (!d) return null
  const [y, m, mo] = d.split('-').map(Number)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[(m ?? mo) - 1]} ${y}`
}

import React from 'react'

export default function PublicModDetailPage() {
  const { username, modId } = useParams<{ username: string; modId: string }>()
  const navigate = useNavigate()
  const carParam = new URLSearchParams(window.location.search).get('car')

  const [job,          setJob]          = useState<Job | null>(null)
  const [partTypeName, setPartTypeName] = useState<string | null>(null)
  const [photos,       setPhotos]       = useState<Photo[]>([])
  const [specRows,     setSpecRows]     = useState<SpecRow[]>([])
  const [links,        setLinks]        = useState<JobLink[]>([])
  const [loading,      setLoading]      = useState(true)
  const [loadedUrls,   setLoadedUrls]   = useState<Set<string>>(new Set())

  // Carousel
  const [photoIndex, setPhotoIndex] = useState(0)
  const touchStartX  = useRef(0)
  const carouselDx   = useRef(0)

  const onCarouselTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; carouselDx.current = 0 }
  const onCarouselTouchMove  = (e: React.TouchEvent) => { carouselDx.current = touchStartX.current - e.touches[0].clientX }
  const commitCarouselSwipe  = () => {
    const diff = carouselDx.current; carouselDx.current = 0
    if (diff > 40)       setPhotoIndex(i => Math.min(i + 1, photos.length - 1))
    else if (diff < -40) setPhotoIndex(i => Math.max(i - 1, 0))
  }

  // Fullscreen viewer
  const [viewerOpen,     setViewerOpen]     = useState(false)
  const [viewerIdx,      setViewerIdx]      = useState(0)
  const [viewerDragY,    setViewerDragY]    = useState(0)
  const [viewerDragX,    setViewerDragX]    = useState(0)
  const [viewerDragging, setViewerDragging] = useState(false)
  const [viewerSnapBack, setViewerSnapBack] = useState(false)
  const viewerTouchStartY  = useRef(0)
  const viewerTouchStartX  = useRef(0)
  const viewerDragLock     = useRef<'h' | 'v' | null>(null)

  const openViewer  = (idx: number) => { setViewerIdx(idx); setViewerDragY(0); setViewerDragX(0); setViewerOpen(true) }
  const closeViewer = () => { setPhotoIndex(viewerIdx); setViewerOpen(false); setViewerDragY(0); setViewerDragX(0) }

  const onViewerTouchStart = (e: React.TouchEvent) => {
    viewerTouchStartY.current = e.touches[0].clientY
    viewerTouchStartX.current = e.touches[0].clientX
    viewerDragLock.current = null; setViewerDragging(true)
  }
  const onViewerTouchMove = (e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - viewerTouchStartY.current
    const dx = e.touches[0].clientX - viewerTouchStartX.current
    if (viewerDragLock.current === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10))
      viewerDragLock.current = Math.abs(dy) > Math.abs(dx) ? 'v' : 'h'
    if      (viewerDragLock.current === 'v') setViewerDragY(dy)
    else if (viewerDragLock.current === 'h') {
      const atStart = viewerIdx === 0 && dx > 0
      const atEnd   = viewerIdx === photos.length - 1 && dx < 0
      setViewerDragX(atStart || atEnd ? dx * 0.25 : dx)
    }
  }
  const onViewerTouchEnd = (e: React.TouchEvent) => {
    setViewerDragging(false)
    const dy = e.changedTouches[0].clientY - viewerTouchStartY.current
    const dx = e.changedTouches[0].clientX - viewerTouchStartX.current
    const lock = viewerDragLock.current; viewerDragLock.current = null
    if (lock === 'v' && Math.abs(dy) > 90) {
      closeViewer()
    } else if (lock === 'h') {
      const threshold = window.innerWidth * 0.35; setViewerSnapBack(false)
      if      (dx < -threshold) setViewerIdx(i => Math.min(i + 1, photos.length - 1))
      else if (dx >  threshold) setViewerIdx(i => Math.max(i - 1, 0))
      else setViewerSnapBack(true)
      setViewerDragX(0)
    } else { setViewerDragY(0); setViewerDragX(0) }
  }

  useEffect(() => {
    if (!modId) return
    async function load() {
      const [{ data: jobData }, { data: photoData }, { data: specsData }, { data: linksData }] = await Promise.all([
        supabase.from('jobs')
          .select('id, title, brand, category, date_installed, installed_by, notes, part_type_id')
          .eq('id', modId).single(),
        supabase.from('job_photos')
          .select('id, photo_url, display_order')
          .eq('job_id', modId).order('display_order', { ascending: true }),
        supabase.from('job_specs')
          .select('spec_key, spec_value, spec_unit')
          .eq('job_id', modId),
        supabase.from('job_links')
          .select('id, url, label, display_order')
          .eq('job_id', modId).order('display_order'),
      ])
      if (jobData) {
        setJob(jobData as unknown as Job)
        const j = jobData as unknown as Job
        if (j.part_type_id) {
          const [{ data: ptData }, { data: templates }] = await Promise.all([
            supabase.from('part_types').select('name').eq('id', j.part_type_id).single(),
            supabase.from('spec_templates').select('spec_key, spec_label, input_type, unit, group_label, display_order').eq('part_type_id', j.part_type_id).order('display_order'),
          ])
          if (ptData) setPartTypeName((ptData as { name: string }).name)
          const specsMap = Object.fromEntries((specsData ?? []).map((s: { spec_key: string; spec_value: string; spec_unit: string | null }) => [s.spec_key, s]))
          const rows: SpecRow[] = []
          for (const t of (templates ?? []) as { spec_key: string; spec_label: string; input_type: string; unit: string | null; group_label: string | null; display_order: number }[]) {
            const s = specsMap[t.spec_key]
            if (!s?.spec_value) continue
            rows.push({ label: t.spec_label, value: s.spec_value, unit: s.spec_unit ?? t.unit, inputType: t.input_type, group: t.group_label, order: t.display_order })
          }
          setSpecRows(rows)
        }
      }
      setPhotos((photoData ?? []) as Photo[])
      setLinks((linksData ?? []) as JobLink[])
      setLoading(false)
    }
    load()
  }, [modId])

  const back = () => navigate(`/builds/${username}/buildsheet${carParam ? `?car=${carParam}` : ''}`)

  const sharedHeader = (
    <div style={{
      height: HEADER_HEIGHT, flexShrink: 0,
      background: COLOR_HEADER_BLACK,
      display: 'flex', alignItems: 'center',
      paddingLeft: 4, paddingRight: 16,
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      position: 'relative', zIndex: 10,
    }}>
      <button onClick={back} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px 4px 8px', WebkitTapHighlightColor: 'transparent' }}>
        <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
        <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.4)' }}>Build Sheet</span>
      </button>
    </div>
  )

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', background: '#050507', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 440, height: '100dvh', display: 'flex', flexDirection: 'column', background: '#0d0d0f', overflow: 'hidden' }}>
          <ArrivalFade />
          <div style={{ position: 'fixed', inset: 0, zIndex: 5, pointerEvents: 'none', background: 'radial-gradient(ellipse 70% 48% at 90% 94%, rgba(245,232,195,0.065) 0%, transparent 72%)' }} />
          {sharedHeader}
        </div>
      </div>
    )
  }

  if (!job) {
    return (
      <div style={{ minHeight: '100dvh', background: '#050507', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 440, height: '100dvh', display: 'flex', flexDirection: 'column', background: '#0d0d0f', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <span style={{ fontFamily: FONT_UI, fontSize: 13, color: 'rgba(245,240,228,0.35)' }}>Mod not found</span>
          <button onClick={back} style={{ background: 'none', border: '1px solid rgba(245,240,228,0.14)', padding: '10px 24px', cursor: 'pointer', fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.4)' }}>
            ← Build Sheet
          </button>
        </div>
      </div>
    )
  }

  const backdropAlpha = Math.max(0, 1 - Math.abs(viewerDragY) / 260)
  const photoScale    = Math.max(0.72, 1 - Math.abs(viewerDragY) / 900)
  const isVDrag       = viewerDragging && viewerDragLock.current === 'v'
  const isHDrag       = viewerDragging && viewerDragLock.current === 'h'
  const hTransition   = isHDrag ? 'none' : viewerSnapBack
    ? 'transform 280ms cubic-bezier(0.34,1.56,0.64,1)'
    : 'transform 300ms cubic-bezier(0.25,0.46,0.45,0.94)'

  return (
    <div style={{ minHeight: '100dvh', background: '#050507', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 440, height: '100dvh', display: 'flex', flexDirection: 'column', background: '#0d0d0f', overflow: 'hidden', position: 'relative' }}>
        <ArrivalFade />
        <style>{'@keyframes pageReveal { from { opacity:0 } to { opacity:1 } }'}</style>
        <div style={{ position: 'fixed', inset: 0, zIndex: 5, pointerEvents: 'none', background: ['radial-gradient(ellipse 70% 48% at 90% 94%, rgba(245,232,195,0.065) 0%, rgba(245,232,195,0.025) 48%, transparent 72%)','radial-gradient(ellipse 55% 30% at 10% 6%, rgba(175,195,215,0.04) 0%, transparent 60%)'].join(', ') }} />
        <div style={{ position: 'fixed', inset: 0, zIndex: 4, pointerEvents: 'none', backgroundImage: NOISE_SVG, backgroundSize: '220px 220px', opacity: 0.028, mixBlendMode: 'screen' }} />

        {sharedHeader}

        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 48, position: 'relative', zIndex: 6, animation: 'pageReveal 1100ms ease-in-out both' }}>

          {/* Photo carousel */}
          {photos.length > 0 && (
            <div>
              <div
                style={{ width: '100%', aspectRatio: '4/3', overflow: 'hidden', touchAction: 'pan-y', cursor: 'zoom-in' }}
                onTouchStart={onCarouselTouchStart}
                onTouchMove={onCarouselTouchMove}
                onTouchEnd={commitCarouselSwipe}
                onTouchCancel={commitCarouselSwipe}
                onClick={() => openViewer(photoIndex)}
              >
                <div style={{ display: 'flex', height: '100%', transform: `translateX(-${photoIndex * 100}%)`, transition: 'transform 280ms cubic-bezier(0.22,1,0.36,1)' }}>
                  {photos.map(photo => (
                    <img key={photo.id} src={photo.photo_url} alt="" decoding="async"
                      onLoad={() => setLoadedUrls(prev => new Set(prev).add(photo.photo_url))}
                      style={{ width: '100%', height: '100%', flexShrink: 0, objectFit: 'cover', display: 'block', opacity: loadedUrls.has(photo.photo_url) ? 1 : 0, transition: 'opacity 200ms ease' }}
                    />
                  ))}
                </div>
              </div>
              {photos.length > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 6, paddingTop: 10 }}>
                  {photos.map((_, i) => (
                    <div key={i} style={{ width: i === photoIndex ? 18 : 6, height: 6, borderRadius: 3, background: i === photoIndex ? 'rgba(200,102,26,0.85)' : 'rgba(245,240,228,0.18)', transition: 'width 200ms ease, background 200ms ease' }} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Title */}
          <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <p style={{ fontFamily: FONT_UI, fontStyle: 'italic', fontWeight: 700, fontSize: 28, lineHeight: 0.9, color: 'rgba(245,240,228,0.95)', margin: 0 }}>
              {job.title}
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {partTypeName && (
                <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.35)', border: '1px solid rgba(245,240,228,0.1)', padding: '3px 7px' }}>
                  {partTypeName}
                </span>
              )}
              {job.category && (
                <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(200,102,26,0.7)', border: '1px solid rgba(200,102,26,0.2)', padding: '3px 7px' }}>
                  {job.category}
                </span>
              )}
            </div>
          </div>

          {/* Details — no costs */}
          <div style={{ padding: '20px 20px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 16px' }}>
            {job.brand && <div><p style={LABEL}>Brand</p><p style={VALUE}>{job.brand}</p></div>}
            {job.date_installed && <div><p style={LABEL}>Installed</p><p style={VALUE}>{formatDate(job.date_installed)}</p></div>}
            {job.installed_by && <div><p style={LABEL}>Installed By</p><p style={VALUE}>{job.installed_by === 'self' ? 'Self' : 'Shop'}</p></div>}
          </div>

          {/* Notes */}
          {job.notes && (
            <div style={{ padding: '20px 20px 0' }}>
              <p style={LABEL}>Notes</p>
              <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 14, color: 'rgba(245,240,228,0.65)', lineHeight: 1.6, marginTop: 6 }}>
                {job.notes}
              </p>
            </div>
          )}

          {/* Specs */}
          {specRows.length > 0 && (
            <div style={{ padding: '20px 20px 0' }}>
              {(() => {
                const groups: Record<string, SpecRow[]> = {}
                for (const r of specRows) { const g = r.group ?? 'Specs'; (groups[g] ??= []).push(r) }
                return Object.entries(groups).map(([groupName, rows]) => (
                  <div key={groupName} style={{ marginBottom: 20 }}>
                    <p style={{ ...LABEL, marginBottom: 10 }}>{groupName}</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px' }}>
                      {rows.map(r => {
                        let display = r.value
                        if (r.inputType === 'boolean') display = r.value === 'true' ? 'Yes' : 'No'
                        else if (r.inputType === 'multiselect') { try { display = (JSON.parse(r.value) as string[]).join(' · ') } catch { /* keep raw */ } }
                        return (
                          <div key={r.label}>
                            <p style={LABEL}>{r.label}</p>
                            <p style={VALUE}>{display}{r.unit && r.inputType !== 'boolean' && r.inputType !== 'multiselect' ? ` ${r.unit}` : ''}</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))
              })()}
            </div>
          )}

          {/* Links */}
          {links.length > 0 && (
            <div style={{ padding: '20px 20px 0' }}>
              <p style={LABEL}>Links</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                {links.map(link => {
                  const ytId = getYouTubeId(link.url)
                  if (ytId) {
                    return (
                      <button key={link.id} onClick={() => window.open(link.url, '_blank')}
                        style={{ display: 'flex', alignItems: 'center', padding: 0, background: 'rgba(245,240,228,0.03)', border: '1px solid rgba(245,240,228,0.08)', cursor: 'pointer', textAlign: 'left', width: '100%', overflow: 'hidden', WebkitTapHighlightColor: 'transparent' }}
                      >
                        <div style={{ width: 96, height: 54, flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
                          <img src={getYouTubeThumbnail(ytId)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.82 }} />
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.28)' }}>
                            <svg width="14" height="16" viewBox="0 0 14 16" fill="none"><path d="M0 0L14 8L0 16V0Z" fill="#f5f0e4" fillOpacity="0.6"/></svg>
                          </div>
                        </div>
                        <div style={{ flex: 1, padding: '0 12px', minWidth: 0 }}>
                          <p style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 12, color: 'rgba(245,240,228,0.78)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{link.label || 'Watch on YouTube'}</p>
                          <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 10, color: 'rgba(245,240,228,0.28)', margin: '3px 0 0', letterSpacing: '0.04em' }}>YouTube</p>
                        </div>
                      </button>
                    )
                  }
                  return (
                    <button key={link.id} onClick={() => window.open(link.url, '_blank')}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'rgba(245,240,228,0.03)', border: '1px solid rgba(245,240,228,0.08)', cursor: 'pointer', textAlign: 'left', width: '100%', boxSizing: 'border-box', WebkitTapHighlightColor: 'transparent' }}
                    >
                      <span style={{ color: COLOR_ACCENT, fontSize: 14, lineHeight: 1, flexShrink: 0 }}>↗</span>
                      <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 13, color: 'rgba(245,240,228,0.7)', flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {link.label || link.url}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

        </div>

        {/* Fullscreen viewer */}
        {viewerOpen && (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 200, background: `rgba(0,0,0,${backdropAlpha})`, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'pan-y', overflow: 'hidden', overscrollBehavior: 'none' }}
            onClick={closeViewer}
          >
            {/* Outer — vertical dismiss */}
            <div
              style={{ width: '100%', height: '100dvh', display: 'flex', alignItems: 'center', transform: `translateY(${viewerDragY}px) scale(${photoScale})`, transition: isVDrag ? 'none' : 'transform 340ms cubic-bezier(0.22,1,0.36,1)', willChange: 'transform' }}
              onTouchStart={onViewerTouchStart}
              onTouchMove={onViewerTouchMove}
              onTouchEnd={onViewerTouchEnd}
              onClick={e => e.stopPropagation()}
            >
              {/* Inner strip — horizontal navigation (each slide is full width) */}
              <div style={{ display: 'flex', width: '100%', transform: `translateX(calc(-${viewerIdx * 100}% + ${viewerDragX}px))`, transition: hTransition, willChange: 'transform' }}>
                {photos.map(photo => (
                  <div key={photo.id} style={{ width: '100%', flexShrink: 0, height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img src={photo.photo_url} alt="" draggable={false} style={{ maxWidth: '100%', maxHeight: '90dvh', width: 'auto', height: 'auto', objectFit: 'contain', display: 'block', userSelect: 'none' }} />
                  </div>
                ))}
              </div>
            </div>

            {/* Close × */}
            <button
              onClick={closeViewer}
              style={{ position: 'absolute', top: 16, right: 16, width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent', opacity: backdropAlpha, transition: isVDrag ? 'none' : 'opacity 200ms ease' }}
            >
              <span style={{ color: 'rgba(245,240,228,0.85)', fontSize: 20, lineHeight: 1 }}>×</span>
            </button>

            {/* Counter + hint */}
            <p style={{ position: 'absolute', bottom: 20, fontFamily: FONT_UI, fontSize: 11, letterSpacing: '0.08em', color: 'rgba(245,240,228,0.35)', opacity: backdropAlpha, transition: isVDrag ? 'none' : 'opacity 200ms ease', margin: 0, pointerEvents: 'none' }}>
              {photos.length > 1 ? `${viewerIdx + 1} / ${photos.length}  ·  swipe down to close` : 'swipe down to close'}
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
