// Route: /tuning/parts-bin/:partId — Part detail from Parts Bin
import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import {
  FONT_HANDWRITTEN, FONT_STAMP, FONT_UI,
  COLOR_CARDBOARD_BG, COLOR_CARDBOARD_INK, COLOR_CARDBOARD_INK2, COLOR_CARDBOARD_STAMP,
} from '../tokens'
import { getYouTubeId, getYouTubeThumbnail, type JobLink } from '../lib/links'

// ── Types ─────────────────────────────────────────────────────────────────

type Part = {
  id: string
  title: string
  brand: string | null
  category: string | null
  date_removed: string | null
  date_installed: string | null
  parts_cost: number | null
  notes: string | null
  status: string
  still_owned: boolean
  sale_price: number | null
  sale_date: string | null
  part_type_id: number | null
}

type SpecRow = { label: string; value: string; unit: string | null; inputType: string; group: string | null; order: number }

type Photo = { id: string; photo_url: string; display_order: number | null }
type Car   = { year: number | null; make: string | null; model: string | null }

// ── Kraft paper grain ─────────────────────────────────────────────────────

const NOISE_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`

// ── Helpers ───────────────────────────────────────────────────────────────

const LABEL: React.CSSProperties = {
  fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 11,
  letterSpacing: '0.1em', textTransform: 'uppercase',
  color: COLOR_CARDBOARD_INK2, opacity: 0.45, margin: 0,
}

function formatDate(d: string | null) {
  if (!d) return null
  const parts = d.split('-').map(Number)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[parts[1] - 1]} ${parts[0]}`
}

const isActive = (status: string) => status === 'removed' || status === 'purchased'

// ── Component ──────────────────────────────────────────────────────────────

import React from 'react'

export default function TuningPartDetailPage() {
  const { partId } = useParams<{ partId: string }>()
  const navigate   = useNavigate()

  const [part,        setPart]        = useState<Part | null>(null)
  const [photos,      setPhotos]      = useState<Photo[]>([])
  const [car,         setCar]         = useState<Car | null>(null)
  const [specRows,    setSpecRows]    = useState<SpecRow[]>([])
  const [loading,     setLoading]     = useState(true)
  const [actioning,   setActioning]   = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [photoIndex,  setPhotoIndex]  = useState(0)
  const [links,       setLinks]       = useState<JobLink[]>([])

  // Full-screen viewer
  const [viewerOpen,     setViewerOpen]     = useState(false)
  const [viewerIdx,      setViewerIdx]      = useState(0)
  const [viewerDragY,    setViewerDragY]    = useState(0)
  const [viewerDragX,    setViewerDragX]    = useState(0)
  const [viewerDragging,setViewerDragging]= useState(false)

  // Sell/Scrap sub-flow
  const [sellScrapOpen, setSellScrapOpen] = useState(false)
  const [disposeType,   setDisposeType]   = useState<'sold' | 'scrapped' | null>(null)
  const [salePrice,     setSalePrice]     = useState('')

  const touchStartX       = useRef<number>(0)
  const viewerTouchStartY = useRef<number>(0)
  const viewerTouchStartX = useRef<number>(0)
  const viewerDragLock    = useRef<'h' | 'v' | null>(null)

  const now        = new Date()
  const MONTHS     = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const todayMonth = MONTHS[now.getMonth()]
  const todayDay   = now.getDate()

  useEffect(() => {
    if (!partId) return
    async function load() {
      const carId = await getActiveCarId()
      const [{ data: partData }, { data: photoData }, { data: carData }, { data: specsData }, { data: linksData }] = await Promise.all([
        supabase
          .from('jobs')
          .select('id, title, brand, category, date_removed, date_installed, parts_cost, notes, status, still_owned, sale_price, sale_date, part_type_id')
          .eq('id', partId)
          .single(),
        supabase
          .from('job_photos')
          .select('id, photo_url, display_order')
          .eq('job_id', partId)
          .order('display_order', { ascending: true }),
        carId
          ? supabase.from('cars').select('year, make, model').eq('id', carId).single()
          : Promise.resolve({ data: null }),
        supabase
          .from('job_specs')
          .select('spec_key, spec_value, spec_unit')
          .eq('job_id', partId),
        supabase
          .from('job_links')
          .select('id, url, label, display_order')
          .eq('job_id', partId)
          .order('display_order'),
      ])
      if (partData) {
        setPart(partData as unknown as Part)
        const ptId = (partData as unknown as Part).part_type_id
        if (ptId) {
          const { data: templates } = await supabase
            .from('spec_templates')
            .select('spec_key, spec_label, input_type, unit, group_label, display_order')
            .eq('part_type_id', ptId)
            .order('display_order')
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
      if (carData) setCar(carData as Car)
      setLoading(false)
    }
    load()
  }, [partId])

  const handleInstall = async () => {
    if (!partId) return
    setActioning(true)
    await supabase.from('jobs').update({ status: 'installed', date_removed: null }).eq('id', partId)
    navigate('/tuning/build-sheet')
  }

  const handleSellScrap = async () => {
    if (!partId || !disposeType) return
    setActioning(true)
    setActionError(null)
    const today = new Date().toISOString().split('T')[0]
    const updates: Record<string, unknown> = { status: disposeType, still_owned: false }
    if (disposeType === 'sold' && salePrice.trim()) {
      const parsed = parseFloat(salePrice.replace(/[^0-9.]/g, ''))
      if (!isNaN(parsed)) { updates.sale_price = parsed; updates.sale_date = today }
    }
    const { error } = await supabase.from('jobs').update(updates).eq('id', partId)
    if (error) { setActioning(false); setActionError(error.message); return }
    navigate('/tuning/parts-bin')
  }

  const handleMoveBack = async () => {
    if (!partId) return
    setActioning(true)
    await supabase.from('jobs').update({
      status: 'removed', still_owned: true, sale_price: null, sale_date: null,
    }).eq('id', partId)
    navigate('/tuning/parts-bin')
  }

  const closeSellScrap = () => {
    setSellScrapOpen(false)
    setDisposeType(null)
    setSalePrice('')
    setActionError(null)
  }

  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX }
  const onTouchEnd   = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (diff > 40)       setPhotoIndex(i => Math.min(i + 1, photos.length - 1))
    else if (diff < -40) setPhotoIndex(i => Math.max(i - 1, 0))
  }

  // ── Fullscreen viewer handlers ────────────────────────────────────────────

  const openViewer = (idx: number) => {
    setViewerIdx(idx)
    setViewerDragY(0)
    setViewerOpen(true)
  }

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
      // Rubber-band resistance at edges — 25% drag rate past first/last photo
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
    }
  }

  if (loading) {
    return (
      <div style={{ height: '100dvh', background: COLOR_CARDBOARD_BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontFamily: FONT_HANDWRITTEN, fontSize: 18, color: COLOR_CARDBOARD_INK2, opacity: 0.6 }}>loading...</p>
      </div>
    )
  }

  if (!part) {
    return (
      <div style={{ height: '100dvh', background: COLOR_CARDBOARD_BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <p style={{ fontFamily: FONT_HANDWRITTEN, fontSize: 18, color: COLOR_CARDBOARD_INK2, opacity: 0.5 }}>Part not found</p>
        <button onClick={() => navigate('/tuning/parts-bin')} style={{ background: 'none', border: `1px solid ${COLOR_CARDBOARD_STAMP}`, padding: '10px 24px', cursor: 'pointer', fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 15, color: COLOR_CARDBOARD_STAMP }}>
          ← Parts
        </button>
      </div>
    )
  }

  const active = isActive(part.status)

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

      {/* Kraft paper grain */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1, backgroundImage: NOISE_SVG, backgroundSize: '180px 180px', opacity: 0.09, mixBlendMode: 'multiply' }} />

      <div style={{ position: 'relative', zIndex: 2, paddingBottom: 120 }}>

        {/* ── Top bar ── */}
        <div style={{ padding: '16px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={() => navigate('/tuning/parts-bin')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4, WebkitTapHighlightColor: 'transparent' }}
          >
            <span style={{ color: COLOR_CARDBOARD_STAMP, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
            <span style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 600, fontSize: 16, color: COLOR_CARDBOARD_STAMP }}>Parts</span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {active && (
              <button
                onClick={() => navigate(`/tuning/parts-bin/${partId}/edit`)}
                style={{ background: 'none', border: `1px solid rgba(26,16,8,0.2)`, padding: '4px 12px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
              >
                <span style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 13, color: COLOR_CARDBOARD_INK2, opacity: 0.55 }}>Edit</span>
              </button>
            )}
            {car && (
              <span style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 600, fontSize: 13, color: COLOR_CARDBOARD_INK, opacity: 0.55 }}>
                {[car.year, car.model].filter(Boolean).join(' ')}
              </span>
            )}
            <div style={{ border: '1px solid rgba(26,16,8,0.2)', padding: '4px 14px', flexShrink: 0 }}>
              <span style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 13, color: 'rgba(26,16,8,0.55)' }}>
                {todayMonth} {todayDay}
              </span>
            </div>
          </div>
        </div>

        {/* ── Photo carousel ── */}
        {photos.length > 0 && (
          <div style={{ marginTop: 16 }}>
            {/* Slider */}
            <div
              style={{ width: '100%', aspectRatio: '4/3', overflow: 'hidden', touchAction: 'pan-y', cursor: 'zoom-in' }}
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
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

            {/* Dots */}
            {photos.length > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 6, paddingTop: 10 }}>
                {photos.map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: i === photoIndex ? 18 : 6,
                      height: 6,
                      borderRadius: 3,
                      background: COLOR_CARDBOARD_STAMP,
                      opacity: i === photoIndex ? 0.7 : 0.2,
                      transition: 'width 200ms ease, opacity 200ms ease',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Title block ── */}
        <div style={{ padding: `${photos.length > 0 ? 20 : 24}px 20px 20px`, borderBottom: `1px solid rgba(26,16,8,0.12)` }}>
          <p style={{ fontFamily: FONT_STAMP, fontSize: 28, color: COLOR_CARDBOARD_INK, opacity: 0.88, margin: 0, lineHeight: 1.1 }}>
            {part.title}
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {part.brand && (
              <span style={{ fontFamily: FONT_HANDWRITTEN, fontSize: 17, color: COLOR_CARDBOARD_INK2, opacity: 0.7 }}>
                {part.brand}
              </span>
            )}
            {part.category && (
              <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: COLOR_CARDBOARD_STAMP, border: `1px solid ${COLOR_CARDBOARD_STAMP}`, padding: '2px 6px', opacity: 0.65 }}>
                {part.category}
              </span>
            )}
            {!active && (
              <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: COLOR_CARDBOARD_INK2, border: `1px solid rgba(61,40,16,0.3)`, padding: '2px 6px', opacity: 0.55 }}>
                {part.status}
              </span>
            )}
          </div>
        </div>

        {/* ── Info grid ── */}
        <div style={{ padding: '20px 20px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 16px' }}>
          {part.date_removed && (
            <div>
              <p style={LABEL}>Pulled</p>
              <p style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 18, color: COLOR_CARDBOARD_INK, opacity: 0.82, marginTop: 4 }}>{formatDate(part.date_removed)}</p>
            </div>
          )}
          {part.date_installed && (
            <div>
              <p style={LABEL}>Installed</p>
              <p style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 18, color: COLOR_CARDBOARD_INK, opacity: 0.82, marginTop: 4 }}>{formatDate(part.date_installed)}</p>
            </div>
          )}
          {part.parts_cost != null && (
            <div>
              <p style={LABEL}>Paid</p>
              <p style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 18, color: COLOR_CARDBOARD_INK, opacity: 0.82, marginTop: 4 }}>${part.parts_cost.toLocaleString()}</p>
            </div>
          )}
          {part.status === 'sold' && part.sale_price != null && (
            <div>
              <p style={LABEL}>Sold For</p>
              <p style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 18, color: COLOR_CARDBOARD_STAMP, opacity: 0.9, marginTop: 4 }}>${part.sale_price.toLocaleString()}</p>
            </div>
          )}
          {part.sale_date && (
            <div>
              <p style={LABEL}>{part.status === 'sold' ? 'Sold' : 'Scrapped'}</p>
              <p style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 18, color: COLOR_CARDBOARD_INK, opacity: 0.82, marginTop: 4 }}>{formatDate(part.sale_date)}</p>
            </div>
          )}
        </div>

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
                          <p style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 16, color: COLOR_CARDBOARD_INK, opacity: 0.82, marginTop: 3 }}>
                            {display}{r.unit && r.inputType !== 'boolean' && r.inputType !== 'multiselect' ? ` ${r.unit}` : ''}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
            })()}
          </div>
        )}

        {/* Notes */}
        {part.notes && (
          <div style={{ padding: '20px 20px 0' }}>
            <p style={LABEL}>Notes</p>
            <p style={{ fontFamily: FONT_HANDWRITTEN, fontSize: 17, color: COLOR_CARDBOARD_INK2, opacity: 0.75, lineHeight: 1.55, marginTop: 6 }}>
              {part.notes}
            </p>
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
                        padding: 0,
                        background: 'rgba(26,16,8,0.05)',
                        border: `1px solid rgba(26,16,8,0.14)`,
                        cursor: 'pointer', textAlign: 'left',
                        width: '100%', overflow: 'hidden',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      <div style={{ width: 96, height: 54, flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
                        <img src={getYouTubeThumbnail(ytId)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(26,16,8,0.28)' }}>
                          <svg width="14" height="16" viewBox="0 0 14 16" fill="none"><path d="M0 0L14 8L0 16V0Z" fill="white" fillOpacity="0.88"/></svg>
                        </div>
                      </div>
                      <div style={{ flex: 1, padding: '0 12px', minWidth: 0 }}>
                        <p style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 14, color: COLOR_CARDBOARD_INK, opacity: 0.82, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {link.label || 'Watch on YouTube'}
                        </p>
                        <p style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 9, color: COLOR_CARDBOARD_INK2, opacity: 0.4, margin: '3px 0 0', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
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
                      background: 'rgba(26,16,8,0.04)',
                      border: `1px solid rgba(26,16,8,0.12)`,
                      cursor: 'pointer', textAlign: 'left',
                      width: '100%', boxSizing: 'border-box',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    <span style={{ color: COLOR_CARDBOARD_STAMP, fontSize: 14, lineHeight: 1, flexShrink: 0, opacity: 0.75 }}>↗</span>
                    <span style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 15, color: COLOR_CARDBOARD_INK, opacity: 0.78, flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {link.label || link.url}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

      </div>

      {/* ── Actions ── */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 20, padding: '16px 20px 36px', background: `linear-gradient(to top, ${COLOR_CARDBOARD_BG} 70%, transparent)` }}>
        {active ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleInstall} disabled={actioning}
              style={{ flex: 1, padding: '15px', background: 'rgba(139,58,10,0.15)', border: `1.5px solid ${COLOR_CARDBOARD_STAMP}`, cursor: actioning ? 'default' : 'pointer', WebkitTapHighlightColor: 'transparent' }}
            >
              <span style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 17, color: COLOR_CARDBOARD_STAMP }}>
                {actioning ? 'Installing…' : 'Install →'}
              </span>
            </button>
            <button
              onClick={() => setSellScrapOpen(true)} disabled={actioning}
              style={{ flex: 1, padding: '15px', background: 'transparent', border: `1px solid rgba(26,16,8,0.25)`, cursor: actioning ? 'default' : 'pointer', WebkitTapHighlightColor: 'transparent' }}
            >
              <span style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 17, color: COLOR_CARDBOARD_INK2, opacity: 0.55 }}>
                Sell / Scrap
              </span>
            </button>
          </div>
        ) : (
          <button
            onClick={handleMoveBack} disabled={actioning}
            style={{ width: '100%', padding: '15px', background: 'rgba(139,58,10,0.1)', border: `1px solid rgba(139,58,10,0.35)`, cursor: actioning ? 'default' : 'pointer', WebkitTapHighlightColor: 'transparent' }}
          >
            <span style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 17, color: COLOR_CARDBOARD_STAMP, opacity: 0.8 }}>
              {actioning ? 'Moving…' : '← Move Back to Storage'}
            </span>
          </button>
        )}
      </div>

      {/* ── Sell / Scrap bottom sheet ── */}
      {sellScrapOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60 }}>
          <div onClick={closeSellScrap} style={{ position: 'absolute', inset: 0, background: 'rgba(26,16,8,0.55)' }} />
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: '#e8c98a',
            backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 14px, rgba(100,60,20,0.07) 14px, rgba(100,60,20,0.07) 15px)`,
            borderTop: `2px solid rgba(26,16,8,0.15)`,
            borderRadius: '12px 12px 0 0',
            padding: '24px 20px 48px',
          }}>
            <p style={{ fontFamily: FONT_STAMP, fontSize: 18, color: COLOR_CARDBOARD_INK, opacity: 0.8, marginBottom: 6 }}>
              What happened to it?
            </p>
            <p style={{ fontFamily: FONT_HANDWRITTEN, fontSize: 15, color: COLOR_CARDBOARD_INK2, opacity: 0.55, marginBottom: 20 }}>
              Both stay in your history.
            </p>

            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              {(['sold', 'scrapped'] as const).map(type => (
                <button
                  key={type} onClick={() => setDisposeType(type)}
                  style={{ flex: 1, padding: '14px 10px', background: disposeType === type ? 'rgba(139,58,10,0.2)' : 'transparent', border: disposeType === type ? `2px solid ${COLOR_CARDBOARD_STAMP}` : `1px solid rgba(26,16,8,0.2)`, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
                >
                  <span style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 17, color: disposeType === type ? COLOR_CARDBOARD_STAMP : COLOR_CARDBOARD_INK2, opacity: disposeType === type ? 1 : 0.45, display: 'block', textTransform: 'capitalize' }}>
                    {type}
                  </span>
                </button>
              ))}
            </div>

            {disposeType === 'sold' && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: COLOR_CARDBOARD_INK2, opacity: 0.5, marginBottom: 8 }}>
                  Sale Price (optional)
                </p>
                <div style={{ display: 'flex', alignItems: 'center', border: `1px solid rgba(26,16,8,0.25)`, background: 'rgba(26,16,8,0.04)' }}>
                  <span style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 18, color: COLOR_CARDBOARD_STAMP, padding: '12px 8px 12px 14px', opacity: 0.7 }}>$</span>
                  <input
                    type="number" inputMode="decimal" placeholder="0.00"
                    value={salePrice} onChange={e => setSalePrice(e.target.value)}
                    style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 18, color: COLOR_CARDBOARD_INK, padding: '12px 14px 12px 0' }}
                  />
                </div>
              </div>
            )}

            {actionError && (
              <p style={{ fontFamily: FONT_HANDWRITTEN, fontSize: 14, color: '#8b0000', marginBottom: 12 }}>{actionError}</p>
            )}

            <button
              onClick={handleSellScrap} disabled={!disposeType || actioning}
              style={{ width: '100%', padding: '15px', background: disposeType ? 'rgba(139,58,10,0.15)' : 'transparent', border: disposeType ? `1.5px solid ${COLOR_CARDBOARD_STAMP}` : `1px solid rgba(26,16,8,0.12)`, cursor: disposeType ? 'pointer' : 'default', WebkitTapHighlightColor: 'transparent', marginBottom: 10 }}
            >
              <span style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 17, color: disposeType ? COLOR_CARDBOARD_STAMP : COLOR_CARDBOARD_INK2, opacity: disposeType ? 1 : 0.3 }}>
                {actioning ? 'Saving…' : 'Confirm'}
              </span>
            </button>
            <button onClick={closeSellScrap} style={{ width: '100%', padding: '12px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 15, color: COLOR_CARDBOARD_INK2, opacity: 0.4 }}>
              Cancel
            </button>
          </div>
        </div>
      )}

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
              touchAction: 'none',
              overflow: 'hidden',
            }}
            onClick={closeViewer}
          >
            {/* Outer — handles vertical dismiss drag + scale */}
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
              {/* Inner strip — slides horizontally between photos */}
              <div style={{
                display: 'flex',
                transform: `translateX(calc(-${viewerIdx * 100}% + ${viewerDragX}px))`,
                transition: isHDrag ? 'none' : 'transform 400ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                willChange: 'transform',
              }}>
                {photos.map(photo => (
                  <div key={photo.id} style={{ width: '100%', flexShrink: 0 }}>
                    <img
                      src={photo.photo_url}
                      alt=""
                      draggable={false}
                      style={{
                        width: '100%',
                        maxHeight: '90dvh',
                        objectFit: 'contain',
                        display: 'block',
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
                background: 'rgba(26,16,8,0.55)',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                WebkitTapHighlightColor: 'transparent',
                opacity: backdropAlpha,
                transition: isVDrag ? 'none' : 'opacity 200ms ease',
              }}
            >
              <span style={{ color: '#f5eed8', fontSize: 20, lineHeight: 1 }}>×</span>
            </button>

            {/* Hint */}
            <p style={{
              position: 'absolute', bottom: 20,
              fontFamily: FONT_HANDWRITTEN, fontSize: 13,
              color: 'rgba(245,238,216,0.45)',
              opacity: backdropAlpha,
              transition: isVDrag ? 'none' : 'opacity 200ms ease',
              margin: 0,
              pointerEvents: 'none',
            }}>
              {photos.length > 1
                ? `${viewerIdx + 1} / ${photos.length}  ·  swipe down to close`
                : 'swipe down to close'}
            </p>
          </div>
        )
      })()}

    </div>
  )
}
