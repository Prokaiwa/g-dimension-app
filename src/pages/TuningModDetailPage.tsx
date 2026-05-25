// Route: /tuning/mods/:modId — Mod detail with section photo setter
import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import { FONT_UI, COLOR_ACCENT, COLOR_HEADER_BLACK, COLOR_HEADER_WARM, HEADER_HEIGHT } from '../tokens'

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

  // Carousel + fullscreen viewer
  const [photoIndex,      setPhotoIndex]      = useState(0)
  const [viewerOpen,      setViewerOpen]      = useState(false)
  const [viewerIdx,       setViewerIdx]       = useState(0)
  const [viewerDragY,     setViewerDragY]     = useState(0)
  const [viewerDragX,     setViewerDragX]     = useState(0)
  const [viewerDragging,  setViewerDragging]  = useState(false)

  const touchStartX       = useRef<number>(0)
  const viewerTouchStartY = useRef<number>(0)
  const viewerTouchStartX = useRef<number>(0)
  const viewerDragLock    = useRef<'h' | 'v' | null>(null)

  useEffect(() => {
    if (!modId) return
    async function load() {
      const [{ data: jobData }, { data: photoData }, { data: specsData }] = await Promise.all([
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

  const onCarouselTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX }
  const onCarouselTouchEnd   = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (diff > 40)       setPhotoIndex(i => Math.min(i + 1, photos.length - 1))
    else if (diff < -40) setPhotoIndex(i => Math.max(i - 1, 0))
  }

  // ── Fullscreen viewer handlers ────────────────────────────────────────────

  const openViewer = (idx: number) => { setViewerIdx(idx); setViewerDragY(0); setViewerDragX(0); setViewerOpen(true) }

  const closeViewer = () => {
    setPhotoIndex(viewerIdx)
    setViewerOpen(false)
    setViewerDragY(0)
    setViewerDragX(0)
  }

  const onViewerTouchStart = (e: React.TouchEvent) => {
    viewerTouchStartY.current = e.touches[0].clientY
    viewerTouchStartX.current = e.touches[0].clientX
    viewerDragLock.current = null
    setViewerDragging(true)
  }

  const onViewerTouchMove = (e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - viewerTouchStartY.current
    const dx = e.touches[0].clientX - viewerTouchStartX.current
    if (viewerDragLock.current === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      viewerDragLock.current = Math.abs(dy) > Math.abs(dx) ? 'v' : 'h'
    }
    if (viewerDragLock.current === 'v') setViewerDragY(dy)
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
    const lock = viewerDragLock.current
    viewerDragLock.current = null
    if (lock === 'v' && Math.abs(dy) > 90) {
      closeViewer()
    } else if (lock === 'h') {
      if (dx < -50) setViewerIdx(i => Math.min(i + 1, photos.length - 1))
      else if (dx > 50) setViewerIdx(i => Math.max(i - 1, 0))
      setViewerDragX(0)
    } else {
      setViewerDragY(0)
      setViewerDragX(0)
    }
  }

  if (loading) {
    return (
      <div style={{ height: '100dvh', background: '#0d0d0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: FONT_UI, fontSize: 11, color: 'rgba(245,240,228,0.2)', letterSpacing: '0.12em' }}>LOADING</span>
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
          <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.4)' }}>
            Build Sheet
          </span>
        </button>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 100, position: 'relative', zIndex: 6 }}>

        {/* ── Photo carousel ── */}
        {photos.length > 0 && (
          <div>
            <div
              style={{ width: '100%', aspectRatio: '4/3', overflow: 'hidden', touchAction: 'pan-y', cursor: 'zoom-in' }}
              onTouchStart={onCarouselTouchStart}
              onTouchEnd={onCarouselTouchEnd}
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
                    style={{ width: '100%', height: '100%', flexShrink: 0, objectFit: 'cover', display: 'block' }}
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
            fontSize: 28, lineHeight: 0.9,
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

      </div>

      {/* ── Fullscreen photo viewer ── */}
      {viewerOpen && (() => {
        const backdropAlpha = Math.max(0, 1 - Math.abs(viewerDragY) / 260)
        const photoScale    = Math.max(0.72, 1 - Math.abs(viewerDragY) / 900)
        const isVDrag       = viewerDragging && viewerDragLock.current === 'v'
        const isHDrag       = viewerDragging && viewerDragLock.current === 'h'
        return (
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 200,
              background: `rgba(0,0,0,${backdropAlpha})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              touchAction: 'none', overflow: 'hidden',
            }}
            onClick={closeViewer}
          >
            {/* Outer — vertical dismiss */}
            <div
              style={{
                width: '100%',
                transform: `translateY(${viewerDragY}px) scale(${photoScale})`,
                transition: isVDrag ? 'none' : 'transform 340ms cubic-bezier(0.22,1,0.36,1)',
                willChange: 'transform',
              }}
              onTouchStart={onViewerTouchStart}
              onTouchMove={onViewerTouchMove}
              onTouchEnd={onViewerTouchEnd}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              {/* Inner strip — horizontal navigation */}
              <div style={{
                display: 'flex',
                transform: `translateX(calc(-${viewerIdx * 100}% + ${viewerDragX}px))`,
                transition: isHDrag ? 'none' : 'transform 400ms cubic-bezier(0.25,0.46,0.45,0.94)',
                willChange: 'transform',
              }}>
                {photos.map(photo => (
                  <div key={photo.id} style={{ width: '100%', flexShrink: 0 }}>
                    <img
                      src={photo.photo_url}
                      alt=""
                      draggable={false}
                      style={{
                        width: '100%', maxHeight: '90dvh',
                        objectFit: 'contain', display: 'block',
                        userSelect: 'none',
                        WebkitUserSelect: 'none' as React.CSSProperties['WebkitUserSelect'],
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Close × */}
            <button
              onClick={closeViewer}
              style={{
                position: 'absolute', top: 16, right: 16,
                width: 36, height: 36, borderRadius: '50%',
                background: 'rgba(0,0,0,0.55)', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                WebkitTapHighlightColor: 'transparent',
                opacity: backdropAlpha, transition: isVDrag ? 'none' : 'opacity 200ms ease',
              }}
            >
              <span style={{ color: 'rgba(245,240,228,0.85)', fontSize: 20, lineHeight: 1 }}>×</span>
            </button>

            {/* Set section photo — only when category maps to a group */}
            {groupLabel && (
              <button
                onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleSetSectionPhoto(photos[viewerIdx].photo_url) }}
                style={{
                  position: 'absolute', bottom: 52,
                  background: 'rgba(0,0,0,0.72)',
                  border: `1px solid rgba(200,102,26,0.45)`,
                  padding: '8px 18px', cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                  opacity: backdropAlpha, transition: isVDrag ? 'none' : 'opacity 200ms ease',
                }}
              >
                <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: COLOR_ACCENT }}>
                  Set as {groupLabel} Photo
                </span>
              </button>
            )}

            {/* Counter + hint */}
            <p style={{
              position: 'absolute', bottom: 20,
              fontFamily: FONT_UI, fontSize: 11,
              letterSpacing: '0.08em',
              color: 'rgba(245,240,228,0.35)',
              opacity: backdropAlpha, transition: isVDrag ? 'none' : 'opacity 200ms ease',
              margin: 0, pointerEvents: 'none',
            }}>
              {photos.length > 1
                ? `${viewerIdx + 1} / ${photos.length}  ·  swipe down to close`
                : 'swipe down to close'}
            </p>
          </div>
        )
      })()}

      {/* ── FAB row: Remove + Edit ── */}
      <div style={{ position: 'fixed', right: 20, bottom: 30, zIndex: 20, display: 'flex', gap: 10 }}>
        <button
          onClick={() => setRemoveSheet(true)}
          style={{
            padding: '12px 18px',
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
            padding: '12px 22px',
            background: 'rgba(200,102,26,0.12)',
            border: '1.5px solid rgba(200,102,26,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
            boxShadow: '0 0 18px rgba(200,102,26,0.2)',
            transform: editPressed ? 'scale(0.92)' : 'scale(1)',
            transition: editPressed ? 'transform 80ms ease-out' : 'transform 200ms cubic-bezier(0.22,1,0.36,1)',
          }}
        >
          <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.12em', color: COLOR_ACCENT }}>
            EDIT MOD
          </span>
        </button>
      </div>

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
