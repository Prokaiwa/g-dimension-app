// Route: /tuning/mods/:modId — Mod detail with section photo setter
import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import { FONT_UI, COLOR_ACCENT, COLOR_HEADER_BLACK, COLOR_HEADER_WARM, HEADER_HEIGHT } from '../tokens'
import { getYouTubeId, getYouTubeThumbnail, type JobLink } from '../lib/links'

// ── Types ─────────────────────────────────────────────────────────────────

type Job = {
  id: string
  title: string
  brand: string | null
  category: string | null
  date_installed: string | null
  installed_by: 'self' | 'shop' | null
  parts_cost: number | null
  labor_cost: number | null
  notes: string | null
  part_type_id: number | null
}

type Photo = { id: string; photo_url: string; display_order: number | null }

type SpecRow = { label: string; value: string; unit: string | null; inputType: string; group: string | null; order: number }

// ── Constants ──────────────────────────────────────────────────────────────

const CATEGORY_TO_GROUP: Record<string, string> = {
  'Engine': 'power', 'Drivetrain': 'power', 'Forced Induction': 'power',
  'Exhaust': 'power', 'Cooling': 'power', 'Fuel System': 'power', 'Electrical': 'power',
  'Suspension': 'chassis', 'Brakes': 'chassis', 'Wheels & Tires': 'chassis',
  'Exterior': 'exterior', 'Paint & Wrap': 'exterior', 'Lighting': 'exterior',
  'Interior': 'interior', 'Audio': 'interior', 'Safety': 'interior',
}

const GROUP_LABEL: Record<string, string> = {
  power: 'Power', chassis: 'Chassis', exterior: 'Exterior', interior: 'Interior',
}

// Categories whose parts realistically carry a service interval (wear/racing
// parts) — only these surface the "Set a service reminder" action. Cosmetic
// categories (Paint & Wrap, Lighting, Interior, Audio…) don't. Edit this list
// to change which parts qualify.
const SERVICEABLE_CATEGORIES = new Set([
  'Engine', 'Drivetrain', 'Forced Induction', 'Suspension',
  'Brakes', 'Wheels & Tires', 'Cooling', 'Fuel System', 'Exhaust',
])

const GROUP_PHOTO_COL: Record<string, string> = {
  power:    'build_sheet_power_photo',
  chassis:  'build_sheet_chassis_photo',
  exterior: 'build_sheet_exterior_photo',
  interior: 'build_sheet_interior_photo',
}

const LABEL: React.CSSProperties = {
  fontFamily: FONT_UI, fontWeight: 700, fontSize: 9,
  letterSpacing: '0.14em', textTransform: 'uppercase',
  color: 'rgba(245,240,228,0.3)',
}

const VALUE: React.CSSProperties = {
  fontFamily: FONT_UI, fontWeight: 600, fontSize: 14,
  color: 'rgba(245,240,228,0.82)',
  marginTop: 3,
}

const NOISE_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`

// ── Component ──────────────────────────────────────────────────────────────

import React from 'react'

export default function TuningModDetailPage() {
  const { modId } = useParams<{ modId: string }>()
  const navigate  = useNavigate()

  const [job,          setJob]          = useState<Job | null>(null)
  const [partTypeName, setPartTypeName] = useState<string | null>(null)
  const [photos,       setPhotos]       = useState<Photo[]>([])
  const [specRows,     setSpecRows]     = useState<SpecRow[]>([])
  const [loading,      setLoading]      = useState(true)
  const [setSuccess,   setSetSuccess]   = useState<string | null>(null)
  const [editPressed,   setEditPressed]   = useState(false)
  const [removeSheet,   setRemoveSheet]   = useState(false)
  const [removing,      setRemoving]      = useState(false)
  const [removeError,   setRemoveError]   = useState<string | null>(null)
  const [sellScrapStep, setSellScrapStep] = useState(false)
  const [disposeType,   setDisposeType]   = useState<'sold' | 'scrapped' | null>(null)
  const [salePrice,     setSalePrice]     = useState('')
  const [links,         setLinks]         = useState<JobLink[]>([])

  // Carousel + fullscreen viewer
  const [photoIndex,        setPhotoIndex]        = useState(0)
  const [viewerOpen,        setViewerOpen]        = useState(false)
  const [viewerIdx,         setViewerIdx]         = useState(0)
  const [loadedUrls,        setLoadedUrls]        = useState<Set<string>>(new Set())

  // ── idle preload: warm the previous + next carousel photos ───────────────────
  useEffect(() => {
    if (photos.length < 2) return
    const neighbors = [photos[photoIndex - 1], photos[photoIndex + 1]]
      .filter(Boolean)
      .map(p => p!.photo_url)
    if (neighbors.length === 0) return
    const doPreload = () => { for (const u of neighbors) { const img = new Image(); img.src = u } }
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const id = (window as typeof window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number })
        .requestIdleCallback(doPreload, { timeout: 2000 })
      return () => (window as typeof window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(id)
    }
    const id = setTimeout(doPreload, 300)
    return () => clearTimeout(id)
  }, [photoIndex, photos])

  const touchStartX       = useRef<number>(0)
  const carouselDx        = useRef<number>(0)
  // Fullscreen viewer (FB-Marketplace-style pager) — see handlers below.
  const viewerIdxRef = useRef(0)
  const scrollRef    = useRef<HTMLDivElement>(null)
  const overlayRef   = useRef<HTMLDivElement>(null)
  const vertRef      = useRef<HTMLDivElement>(null)
  const stripRef     = useRef<HTMLDivElement>(null)
  const chromeRef    = useRef<HTMLDivElement>(null)
  const g = useRef({ x0: 0, y0: 0, lx: 0, ly: 0, lt: 0, vx: 0, vy: 0, dx: 0, dy: 0, lock: null as 'h' | 'v' | null })

  useEffect(() => {
    if (!modId) return
    async function load() {
      const [{ data: jobData }, { data: photoData }, { data: specsData }, { data: linksData }] = await Promise.all([
        supabase
          .from('jobs')
          .select('id, title, brand, category, date_installed, installed_by, parts_cost, labor_cost, notes, part_type_id')
          .eq('id', modId)
          .single(),
        supabase
          .from('job_photos')
          .select('id, photo_url, display_order')
          .eq('job_id', modId)
          .order('display_order', { ascending: true }),
        supabase
          .from('job_specs')
          .select('spec_key, spec_value, spec_unit')
          .eq('job_id', modId),
        supabase
          .from('job_links')
          .select('id, url, label, display_order')
          .eq('job_id', modId)
          .order('display_order'),
      ])
      if (jobData) {
        setJob(jobData as unknown as Job)
        if ((jobData as unknown as Job).part_type_id) {
          const [{ data: ptData }, { data: templates }] = await Promise.all([
            supabase.from('part_types').select('name').eq('id', (jobData as unknown as Job).part_type_id).single(),
            supabase.from('spec_templates').select('spec_key, spec_label, input_type, unit, group_label, display_order').eq('part_type_id', (jobData as unknown as Job).part_type_id).order('display_order'),
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

  const closeRemoveSheet = () => {
    setRemoveSheet(false)
    setSellScrapStep(false)
    setDisposeType(null)
    setSalePrice('')
    setRemoveError(null)
  }

  const handleMoveToStorage = async () => {
    if (!modId) return
    setRemoving(true)
    setRemoveError(null)
    const { error } = await supabase.from('jobs').update({
      status:       'removed',
      still_owned:  true,
      date_removed: new Date().toISOString().split('T')[0],
    }).eq('id', modId)
    if (error) { setRemoving(false); setRemoveError(error.message); return }
    navigate('/tuning/build-sheet')
  }

  const handleSellScrap = async () => {
    if (!modId || !disposeType) return
    setRemoving(true)
    setRemoveError(null)
    const today = new Date().toISOString().split('T')[0]
    const updates: Record<string, unknown> = {
      status:       disposeType,
      still_owned:  false,
      date_removed: today,
    }
    if (disposeType === 'sold' && salePrice.trim()) {
      const parsed = parseFloat(salePrice.replace(/[^0-9.]/g, ''))
      if (!isNaN(parsed)) { updates.sale_price = parsed; updates.sale_date = today }
    }
    const { error } = await supabase.from('jobs').update(updates).eq('id', modId)
    if (error) { setRemoving(false); setRemoveError(error.message); return }
    navigate('/tuning/build-sheet')
  }

  const handleSetSectionPhoto = async (photoUrl: string) => {
    if (!job?.category) return
    const group = CATEGORY_TO_GROUP[job.category]
    const col   = GROUP_PHOTO_COL[group]
    if (!col) return
    const carId = await getActiveCarId()
    if (!carId) return
    await supabase.from('cars').update({ [col]: photoUrl }).eq('id', carId)
    setSetSuccess(GROUP_LABEL[group])
    setTimeout(() => setSetSuccess(null), 2500)
  }

  const group      = job?.category ? CATEGORY_TO_GROUP[job.category] : null
  const groupLabel = group ? GROUP_LABEL[group] : null

  const formatDate = (d: string | null) => {
    if (!d) return null
    const [y, m, mo] = d.split('-').map(Number)
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${months[(m ?? mo) - 1]} ${y}`
  }

  // ── Carousel handlers ────────────────────────────────────────────────────

  // Track dx on touchmove and commit on BOTH touchend and touchcancel — with
  // touchAction:'pan-y' the browser claims any vertically-drifting gesture for
  // page scroll and fires touchcancel, which used to silently drop the swipe.
  const onCarouselTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; carouselDx.current = 0 }
  const onCarouselTouchMove  = (e: React.TouchEvent) => { carouselDx.current = touchStartX.current - e.touches[0].clientX }
  const commitCarouselSwipe  = () => {
    const diff = carouselDx.current
    carouselDx.current = 0
    if (diff > 40)       setPhotoIndex(i => Math.min(i + 1, photos.length - 1))
    else if (diff < -40) setPhotoIndex(i => Math.max(i - 1, 0))
  }

  // ── Fullscreen viewer — Facebook-Marketplace-style pager ───────────────────
  // Gestures are painted DIRECTLY onto the DOM via refs during the drag (zero
  // React re-renders per frame → 1:1 finger tracking, no "stuck" lag). Only the
  // committed index + open flag live in state. A flick (velocity) commits a
  // page-turn or dismiss even on a tiny drag — that's what makes it feel
  // instant. Vertical drag-down dismisses; horizontal pages. Axis locks once
  // per gesture, biased toward horizontal so a slight vertical wobble never
  // kills a swipe. The overlay owns ALL touches (touchAction:'none') and the
  // page behind is scroll-locked, so nothing funky happens underneath.
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

  // Initialise transforms + lock the page behind whenever the viewer opens.
  useEffect(() => {
    if (!viewerOpen) return
    paintStrip(0, false)
    paintVertical(0, false)
    const sc = scrollRef.current
    const prev = sc?.style.overflow
    if (sc) sc.style.overflow = 'hidden'
    return () => { if (sc) sc.style.overflow = prev ?? '' }
  }, [viewerOpen])

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
      paintStrip(atStart || atEnd ? dx * 0.3 : dx, false)   // rubber-band at the ends
    } else if (s.lock === 'v') {
      paintVertical(dy < 0 ? dy * 0.3 : dy, false)          // resist upward
    }
  }
  const onViewerTouchEnd = () => {
    const s = g.current
    if (s.lock === 'h') {
      const w = window.innerWidth
      const flick = Math.abs(s.vx) > 0.4 && Math.abs(s.dx) > 12
      let ni = viewerIdxRef.current
      if      (s.dx < -w * 0.25 || (flick && s.vx < 0)) ni = Math.min(ni + 1, photos.length - 1)
      else if (s.dx >  w * 0.25 || (flick && s.vx > 0)) ni = Math.max(ni - 1, 0)
      viewerIdxRef.current = ni; setViewerIdx(ni)
      setPhotoIndex(ni)   // keep the hidden carousel in sync → no jump on close
      paintStrip(0, true)
    } else if (s.lock === 'v') {
      const flickDown = s.vy > 0.5 && s.dy > 0
      if (s.dy > 110 || flickDown) {
        paintVertical(window.innerHeight, true)   // fling off-screen, then unmount
        window.setTimeout(closeViewer, 200)
      } else {
        paintVertical(0, true)
      }
    }
  }

  if (loading) {
    return (
      <div style={{ height: '100dvh', background: '#0d0d0f', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Magazine sheen */}
        <div style={{ position: 'fixed', inset: 0, zIndex: 5, pointerEvents: 'none', background: ['radial-gradient(ellipse 70% 48% at 90% 94%, rgba(245,232,195,0.065) 0%, rgba(245,232,195,0.025) 48%, transparent 72%)', 'radial-gradient(ellipse 55% 30% at 10% 6%, rgba(175,195,215,0.04) 0%, transparent 60%)'].join(', ') }} />
        <div style={{ position: 'fixed', inset: 0, zIndex: 4, pointerEvents: 'none', backgroundImage: NOISE_SVG, backgroundSize: '220px 220px', opacity: 0.028, mixBlendMode: 'screen' }} />
        {/* Functional header — back button works during load */}
        <div style={{ height: HEADER_HEIGHT, flexShrink: 0, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center', paddingLeft: 4, paddingRight: 16, borderBottom: '1px solid rgba(255,255,255,0.04)', position: 'relative', zIndex: 10 }}>
          <button onClick={() => navigate('/tuning/build-sheet')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px 4px 8px', WebkitTapHighlightColor: 'transparent' }}>
            <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
            <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 15, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.5)' }}>Build Sheet</span>
          </button>
        </div>
      </div>
    )
  }

  if (!job) {
    return (
      <div style={{ height: '100dvh', background: '#0d0d0f', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <span style={{ fontFamily: FONT_UI, fontSize: 13, color: 'rgba(245,240,228,0.35)' }}>Mod not found</span>
        <button onClick={() => navigate('/tuning/build-sheet')} style={{ background: 'none', border: '1px solid rgba(245,240,228,0.14)', padding: '10px 24px', cursor: 'pointer', fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.4)' }}>
          ← Build Sheet
        </button>
      </div>
    )
  }

  return (
    <div style={{ height: '100dvh', background: '#0d0d0f', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`
        @keyframes pageReveal {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

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

      {/* ── Header ── */}
      <div style={{
        height: HEADER_HEIGHT, flexShrink: 0,
        background: COLOR_HEADER_BLACK,
        display: 'flex', alignItems: 'center',
        paddingLeft: 4, paddingRight: 16,
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        position: 'relative', zIndex: 10,
      }}>
        <button
          onClick={() => navigate('/tuning/build-sheet')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px 4px 8px', WebkitTapHighlightColor: 'transparent' }}
        >
          <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
          <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 15, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.5)' }}>
            Build Sheet
          </span>
        </button>
      </div>

      {/* ── Body ── */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', paddingBottom: 48, position: 'relative', zIndex: 6, animation: 'pageReveal 1100ms ease-in-out both' }}>

        {/* ── Photo carousel ── */}
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
              <div style={{
                display: 'flex', height: '100%',
                transform: `translateX(-${photoIndex * 100}%)`,
                transition: 'transform 280ms cubic-bezier(0.22,1,0.36,1)',
              }}>
                {photos.map(photo => (
                  <img
                    key={photo.id}
                    src={photo.photo_url}
                    alt=""
                    decoding="async"
                    onLoad={() => setLoadedUrls(prev => prev.has(photo.photo_url) ? prev : new Set(prev).add(photo.photo_url))}
                    style={{
                      width: '100%', height: '100%', flexShrink: 0, objectFit: 'cover', display: 'block',
                      opacity: loadedUrls.has(photo.photo_url) ? 1 : 0,
                      transition: 'opacity 200ms ease',
                    }}
                  />
                ))}
              </div>
            </div>
            {photos.length > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 6, paddingTop: 10 }}>
                {photos.map((_, i) => (
                  <div key={i} style={{
                    width: i === photoIndex ? 18 : 6, height: 6, borderRadius: 3,
                    background: i === photoIndex ? 'rgba(200,102,26,0.85)' : 'rgba(245,240,228,0.18)',
                    transition: 'width 200ms ease, background 200ms ease',
                  }} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Title block */}
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <p style={{
            fontFamily: FONT_UI, fontStyle: 'italic', fontWeight: 700,
            fontSize: 34, lineHeight: 0.9,
            color: 'rgba(245,240,228,0.95)', margin: 0,
          }}>
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

        {/* Details */}
        <div style={{ padding: '20px 20px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 16px' }}>
          {job.brand && (
            <div>
              <p style={LABEL}>Brand</p>
              <p style={VALUE}>{job.brand}</p>
            </div>
          )}
          {job.date_installed && (
            <div>
              <p style={LABEL}>Installed</p>
              <p style={VALUE}>{formatDate(job.date_installed)}</p>
            </div>
          )}
          {job.installed_by && (
            <div>
              <p style={LABEL}>Installed By</p>
              <p style={VALUE}>{job.installed_by === 'self' ? 'Self' : 'Shop'}</p>
            </div>
          )}
          {job.parts_cost != null && (
            <div>
              <p style={LABEL}>Parts Cost</p>
              <p style={VALUE}>${job.parts_cost.toLocaleString()}</p>
            </div>
          )}
          {job.labor_cost != null && (
            <div>
              <p style={LABEL}>Labor Cost</p>
              <p style={VALUE}>${job.labor_cost.toLocaleString()}</p>
            </div>
          )}
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
              for (const r of specRows) {
                const g = r.group ?? 'Specs'
                ;(groups[g] ??= []).push(r)
              }
              return Object.entries(groups).map(([groupName, rows]) => (
                <div key={groupName} style={{ marginBottom: 20 }}>
                  <p style={{ ...LABEL, marginBottom: 10 }}>{groupName}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px' }}>
                    {rows.map(r => {
                      let display = r.value
                      if (r.inputType === 'boolean') display = r.value === 'true' ? 'Yes' : 'No'
                      else if (r.inputType === 'multiselect') {
                        try { display = (JSON.parse(r.value) as string[]).join(' · ') } catch { /* keep raw */ }
                      }
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
                    <button
                      key={link.id}
                      onClick={() => window.open(link.url, '_blank')}
                      style={{
                        display: 'flex', alignItems: 'center',
                        padding: 0, background: 'rgba(245,240,228,0.03)',
                        border: '1px solid rgba(245,240,228,0.08)',
                        cursor: 'pointer', textAlign: 'left',
                        width: '100%', overflow: 'hidden',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      <div style={{ width: 96, height: 54, flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
                        <img src={getYouTubeThumbnail(ytId)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.82 }} />
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.28)' }}>
                          <svg width="14" height="16" viewBox="0 0 14 16" fill="none"><path d="M0 0L14 8L0 16V0Z" fill="#f5f0e4" fillOpacity="0.6"/></svg>
                        </div>
                      </div>
                      <div style={{ flex: 1, padding: '0 12px', minWidth: 0 }}>
                        <p style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 12, color: 'rgba(245,240,228,0.78)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {link.label || 'Watch on YouTube'}
                        </p>
                        <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 10, color: 'rgba(245,240,228,0.28)', margin: '3px 0 0', letterSpacing: '0.04em' }}>
                          YouTube
                        </p>
                      </div>
                    </button>
                  )
                }
                return (
                  <button
                    key={link.id}
                    onClick={() => window.open(link.url, '_blank')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '11px 14px',
                      background: 'rgba(245,240,228,0.03)',
                      border: '1px solid rgba(245,240,228,0.08)',
                      cursor: 'pointer', textAlign: 'left',
                      width: '100%', boxSizing: 'border-box',
                      WebkitTapHighlightColor: 'transparent',
                    }}
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

        {/* ── Actions ── */}
        <div style={{ padding: '28px 20px 0', display: 'flex', gap: 10, borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: 28 }}>
          <button
            onClick={() => setRemoveSheet(true)}
            style={{
              flex: 1, padding: '14px',
              background: 'rgba(245,240,228,0.04)',
              border: '1.5px solid rgba(245,240,228,0.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
            }}
          >
            <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.12em', color: 'rgba(245,240,228,0.4)' }}>
              REMOVE
            </span>
          </button>
          <button
            onClick={() => navigate(`/tuning/mods/${modId}/edit`)}
            onPointerDown={() => setEditPressed(true)}
            onPointerUp={() => setEditPressed(false)}
            onPointerLeave={() => setEditPressed(false)}
            onPointerCancel={() => setEditPressed(false)}
            style={{
              flex: 2, padding: '14px',
              background: 'rgba(200,102,26,0.12)',
              border: '1.5px solid rgba(200,102,26,0.55)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
              boxShadow: '0 0 18px rgba(200,102,26,0.2)',
              transform: editPressed ? 'scale(0.97)' : 'scale(1)',
              transition: editPressed ? 'transform 80ms ease-out' : 'transform 200ms cubic-bezier(0.22,1,0.36,1)',
            }}
          >
            <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.12em', color: COLOR_ACCENT }}>
              EDIT MOD
            </span>
          </button>
        </div>

        {/* Set a service reminder — only for serviceable/wear categories */}
        {job?.category && SERVICEABLE_CATEGORIES.has(job.category) && (
          <div style={{ padding: '14px 20px 0', display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={() => navigate('/garage/reminders', { state: { reminderForJob: { id: job.id, title: job.title, category: 'service' } } })}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px', WebkitTapHighlightColor: 'transparent', fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', color: 'rgba(245,240,228,0.45)' }}
            >
              ⚙ Set a service reminder →
            </button>
          </div>
        )}

      </div>

      {/* ── Fullscreen photo viewer ── */}
      {viewerOpen && (
        <div
          ref={overlayRef}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            touchAction: 'none', overflow: 'hidden', overscrollBehavior: 'none',
          }}
          onClick={closeViewer}
        >
          {/* Vertical-dismiss layer (owns the gesture) */}
          <div
            ref={vertRef}
            style={{ width: '100%', height: '100dvh', display: 'flex', alignItems: 'center', willChange: 'transform' }}
            onTouchStart={onViewerTouchStart}
            onTouchMove={onViewerTouchMove}
            onTouchEnd={onViewerTouchEnd}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            {/* Horizontal strip — each slide is full width */}
            <div ref={stripRef} style={{ display: 'flex', width: '100%', willChange: 'transform' }}>
              {photos.map(photo => (
                <div key={photo.id} style={{ width: '100%', flexShrink: 0, height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img
                    src={photo.photo_url}
                    alt=""
                    draggable={false}
                    style={{
                      maxWidth: '100%', maxHeight: '90dvh',
                      width: 'auto', height: 'auto',
                      objectFit: 'contain', display: 'block',
                      userSelect: 'none', pointerEvents: 'none',
                      WebkitUserSelect: 'none' as React.CSSProperties['WebkitUserSelect'],
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Chrome (close × + set-section + counter) — fades with the dismiss drag, passes touches through */}
          <div ref={chromeRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            <button
              onClick={closeViewer}
              style={{
                position: 'absolute', top: 16, right: 16,
                width: 36, height: 36, borderRadius: '50%',
                background: 'rgba(0,0,0,0.55)', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                WebkitTapHighlightColor: 'transparent', pointerEvents: 'auto',
              }}
            >
              <span style={{ color: 'rgba(245,240,228,0.85)', fontSize: 20, lineHeight: 1 }}>×</span>
            </button>

            {/* Set section photo — only when category maps to a group */}
            {groupLabel && (
              <button
                onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleSetSectionPhoto(photos[viewerIdx].photo_url) }}
                style={{
                  position: 'absolute', bottom: 52, left: '50%', transform: 'translateX(-50%)',
                  background: 'rgba(0,0,0,0.72)',
                  border: `1px solid rgba(200,102,26,0.45)`,
                  padding: '8px 18px', cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent', pointerEvents: 'auto',
                }}
              >
                <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: COLOR_ACCENT }}>
                  Set as {groupLabel} Photo
                </span>
              </button>
            )}

            {/* Counter + hint */}
            <p style={{
              position: 'absolute', left: 0, right: 0, bottom: 20, textAlign: 'center',
              fontFamily: FONT_UI, fontSize: 11,
              letterSpacing: '0.08em',
              color: 'rgba(245,240,228,0.35)',
              margin: 0,
            }}>
              {photos.length > 1
                ? `${viewerIdx + 1} / ${photos.length}  ·  swipe down to close`
                : 'swipe down to close'}
            </p>
          </div>
        </div>
      )}

      {/* ── Remove bottom sheet ── */}
      {removeSheet && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60 }}>
          <div onClick={closeRemoveSheet} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: '#181818',
            borderTop: '1px solid rgba(245,240,228,0.08)',
            borderRadius: '12px 12px 0 0',
            padding: '24px 20px 48px',
          }}>
            {!sellScrapStep ? (
              <>
                <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 13, color: 'rgba(245,240,228,0.9)', marginBottom: 6 }}>
                  Remove from build?
                </p>
                <p style={{ fontFamily: FONT_UI, fontSize: 12, color: 'rgba(245,240,228,0.35)', marginBottom: 24, lineHeight: 1.5 }}>
                  Where is this part going?
                </p>
                {removeError && (
                  <p style={{ fontFamily: FONT_UI, fontSize: 11, color: '#e05050', marginBottom: 16 }}>{removeError}</p>
                )}
                <button
                  onClick={handleMoveToStorage} disabled={removing}
                  style={{ width: '100%', padding: '16px 20px', marginBottom: 10, background: 'rgba(200,102,26,0.08)', border: '1px solid rgba(200,102,26,0.3)', cursor: removing ? 'default' : 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent' }}
                >
                  <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 13, color: 'rgba(245,240,228,0.75)', display: 'block' }}>Move to Storage</span>
                  <span style={{ fontFamily: FONT_UI, fontSize: 11, color: 'rgba(245,240,228,0.35)' }}>Keeps part in Parts Bin — install it again anytime</span>
                </button>
                <button
                  onClick={() => setSellScrapStep(true)} disabled={removing}
                  style={{ width: '100%', padding: '16px 20px', background: 'transparent', border: '1px solid rgba(245,240,228,0.1)', cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent' }}
                >
                  <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 13, color: 'rgba(245,240,228,0.55)', display: 'block' }}>Sell / Scrap</span>
                  <span style={{ fontFamily: FONT_UI, fontSize: 11, color: 'rgba(245,240,228,0.25)' }}>Part is leaving — stays in history</span>
                </button>
                <button onClick={closeRemoveSheet} style={{ width: '100%', padding: '14px', marginTop: 16, background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.25)' }}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 13, color: 'rgba(245,240,228,0.9)', marginBottom: 6 }}>
                  What happened to it?
                </p>
                <p style={{ fontFamily: FONT_UI, fontSize: 12, color: 'rgba(245,240,228,0.35)', marginBottom: 20, lineHeight: 1.5 }}>
                  Both stay in your history.
                </p>

                {/* Sold / Scrapped choice */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                  {(['sold', 'scrapped'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setDisposeType(type)}
                      style={{
                        flex: 1, padding: '14px 10px',
                        background: disposeType === type ? 'rgba(200,102,26,0.12)' : 'transparent',
                        border: disposeType === type ? '1.5px solid rgba(200,102,26,0.5)' : '1px solid rgba(245,240,228,0.12)',
                        cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 13, color: disposeType === type ? 'rgba(245,240,228,0.85)' : 'rgba(245,240,228,0.4)', display: 'block', textTransform: 'capitalize' }}>
                        {type}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Price input — only for sold */}
                {disposeType === 'sold' && (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.3)', marginBottom: 8 }}>
                      Sale Price (optional)
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid rgba(245,240,228,0.14)', background: 'rgba(245,240,228,0.03)' }}>
                      <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 15, color: 'rgba(245,240,228,0.35)', padding: '12px 10px 12px 14px' }}>$</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={salePrice}
                        onChange={e => setSalePrice(e.target.value)}
                        style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: FONT_UI, fontWeight: 600, fontSize: 15, color: 'rgba(245,240,228,0.85)', padding: '12px 14px 12px 0' }}
                      />
                    </div>
                  </div>
                )}

                {removeError && (
                  <p style={{ fontFamily: FONT_UI, fontSize: 11, color: '#e05050', marginBottom: 12 }}>{removeError}</p>
                )}

                <button
                  onClick={handleSellScrap}
                  disabled={!disposeType || removing}
                  style={{ width: '100%', padding: '15px', background: disposeType ? 'rgba(200,102,26,0.1)' : 'transparent', border: `1px solid ${disposeType ? 'rgba(200,102,26,0.4)' : 'rgba(245,240,228,0.08)'}`, cursor: disposeType ? 'pointer' : 'default', WebkitTapHighlightColor: 'transparent', marginBottom: 10 }}
                >
                  <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: disposeType ? 'rgba(245,240,228,0.75)' : 'rgba(245,240,228,0.2)' }}>
                    {removing ? 'Saving…' : 'Confirm'}
                  </span>
                </button>
                <button onClick={() => { setSellScrapStep(false); setDisposeType(null); setSalePrice('') }} style={{ width: '100%', padding: '12px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.25)' }}>
                  ← Back
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Success toast ── */}
      {setSuccess && (
        <div style={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(30,30,32,0.96)', border: '1px solid rgba(200,102,26,0.4)',
          padding: '10px 20px',
          fontFamily: FONT_UI, fontWeight: 700, fontSize: 11,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          color: COLOR_ACCENT, whiteSpace: 'nowrap',
          zIndex: 50,
        }}>
          ✓ Set as {setSuccess} Photo
        </div>
      )}

    </div>
  )
}
