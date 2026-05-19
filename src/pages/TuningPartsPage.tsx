// Route: /tuning/parts-bin — Owned, not installed
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import {
  FONT_HANDWRITTEN, FONT_STAMP, FONT_UI,
  COLOR_CARDBOARD_BG, COLOR_CARDBOARD_INK, COLOR_CARDBOARD_INK2, COLOR_CARDBOARD_STAMP,
} from '../tokens'

// ── Types ─────────────────────────────────────────────────────────────────

type JobPhoto = { photo_url: string; display_order: number | null }

type Part = {
  id: string
  title: string
  brand: string | null
  category: string | null
  date_removed: string | null
  date_installed: string | null
  parts_cost: number | null
  status: string
  sale_price: number | null
  sale_date: string | null
  job_photos: JobPhoto[]
}

type Car = { year: number | null; make: string | null; model: string | null }

// ── Kraft paper grain ─────────────────────────────────────────────────────

const NOISE_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`

// ── Helpers ───────────────────────────────────────────────────────────────

function formatDate(d: string | null) {
  if (!d) return null
  const parts = d.split('-').map(Number)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[parts[1] - 1]} ${parts[0]}`
}

function firstPhoto(photos: JobPhoto[]): string | null {
  if (!photos?.length) return null
  return [...photos].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))[0].photo_url
}

// ── Component ──────────────────────────────────────────────────────────────

export default function TuningPartsPage() {
  const navigate = useNavigate()

  const [pulled,       setPulled]       = useState<Part[]>([])
  const [onHand,       setOnHand]       = useState<Part[]>([])
  const [soldScrapped, setSoldScrapped] = useState<Part[]>([])
  const [car,          setCar]          = useState<Car | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [soldExpanded, setSoldExpanded] = useState(false)
  const [addPressed,   setAddPressed]   = useState(false)

  const now        = new Date()
  const MONTHS     = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const todayMonth = MONTHS[now.getMonth()]
  const todayDay   = now.getDate()

  async function load() {
    const carId = await getActiveCarId()
    if (!carId) { setLoading(false); return }

    const [{ data: carData }, { data: active }, { data: history }] = await Promise.all([
      supabase.from('cars').select('year, make, model').eq('id', carId).single(),
      supabase
        .from('jobs')
        .select('id, title, brand, category, date_removed, date_installed, parts_cost, status, sale_price, sale_date, job_photos(photo_url, display_order)')
        .eq('car_id', carId)
        .eq('type', 'modification')
        .eq('still_owned', true)
        .in('status', ['removed', 'purchased'])
        .order('date_removed', { ascending: false, nullsFirst: false }),
      supabase
        .from('jobs')
        .select('id, title, brand, category, date_removed, date_installed, parts_cost, status, sale_price, sale_date, job_photos(photo_url, display_order)')
        .eq('car_id', carId)
        .eq('type', 'modification')
        .in('status', ['sold', 'scrapped'])
        .order('sale_date', { ascending: false, nullsFirst: false }),
    ])

    if (carData) setCar(carData as Car)
    const all = (active ?? []) as Part[]
    setPulled(all.filter(p => p.status === 'removed'))
    setOnHand(all.filter(p => p.status === 'purchased'))
    setSoldScrapped((history ?? []) as Part[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const isEmpty = pulled.length === 0 && onHand.length === 0

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
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1,
        backgroundImage: NOISE_SVG, backgroundSize: '180px 180px',
        opacity: 0.09, mixBlendMode: 'multiply',
      }} />

      <div style={{ position: 'relative', zIndex: 2, paddingBottom: 100 }}>

        {/* ── Top bar ── */}
        <div style={{ padding: '16px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={() => navigate('/tuning')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4, WebkitTapHighlightColor: 'transparent' }}
          >
            <span style={{ color: COLOR_CARDBOARD_STAMP, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
            <span style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 600, fontSize: 16, color: COLOR_CARDBOARD_STAMP }}>Tuning</span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
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

        {/* ── Stamp header ── */}
        <div style={{ padding: '10px 24px 0', textAlign: 'center' }}>
          <p style={{ fontFamily: FONT_STAMP, fontSize: 38, color: COLOR_CARDBOARD_INK, opacity: 0.82, margin: 0, transform: 'rotate(-1.5deg)', lineHeight: 1 }}>
            Parts
          </p>
          <div style={{ width: 80, height: 3, background: COLOR_CARDBOARD_INK, opacity: 0.15, margin: '8px auto 0' }} />
        </div>

        {/* Loading */}
        {loading && (
          <p style={{ fontFamily: FONT_HANDWRITTEN, fontSize: 18, color: COLOR_CARDBOARD_INK2, textAlign: 'center', marginTop: 60, opacity: 0.6 }}>
            checking the box...
          </p>
        )}

        {/* Empty */}
        {!loading && isEmpty && soldScrapped.length === 0 && (
          <div style={{ textAlign: 'center', marginTop: 60, padding: '0 40px' }}>
            <p style={{ fontFamily: FONT_STAMP, fontSize: 22, color: COLOR_CARDBOARD_INK, opacity: 0.35, margin: 0 }}>Empty</p>
            <p style={{ fontFamily: FONT_HANDWRITTEN, fontSize: 17, color: COLOR_CARDBOARD_INK2, opacity: 0.5, marginTop: 10, lineHeight: 1.5 }}>
              Parts removed from the car but kept will show up here
            </p>
          </div>
        )}

        {/* On Hand */}
        {onHand.length > 0 && (
          <Section label="On hand" style={{ marginTop: 28 }}>
            {onHand.map((part, i) => (
              <PartRow
                key={part.id} part={part}
                dateLabel={formatDate(part.date_installed)} dateLine="acquired"
                isLast={i === onHand.length - 1}
                onClick={() => navigate(`/tuning/parts-bin/${part.id}`)}
              />
            ))}
          </Section>
        )}

        {/* In Storage */}
        {pulled.length > 0 && (
          <Section label="In storage" style={{ marginTop: onHand.length > 0 ? 32 : 28 }}>
            {pulled.map((part, i) => (
              <PartRow
                key={part.id} part={part}
                dateLabel={formatDate(part.date_removed)} dateLine="pulled"
                isLast={i === pulled.length - 1}
                onClick={() => navigate(`/tuning/parts-bin/${part.id}`)}
              />
            ))}
          </Section>
        )}

        {/* Sold / Scrapped */}
        {soldScrapped.length > 0 && (
          <div style={{ padding: '0 20px', marginTop: (pulled.length > 0 || onHand.length > 0) ? 32 : 28 }}>
            <button
              onClick={() => setSoldExpanded(v => !v)}
              style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, WebkitTapHighlightColor: 'transparent' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, height: 1, background: COLOR_CARDBOARD_INK, opacity: 0.1 }} />
                <p style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 13, color: COLOR_CARDBOARD_INK2, opacity: 0.4, letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>
                  Sold / Scrapped ({soldScrapped.length}) {soldExpanded ? '▴' : '▾'}
                </p>
                <div style={{ flex: 1, height: 1, background: COLOR_CARDBOARD_INK, opacity: 0.1 }} />
              </div>
            </button>
            {soldExpanded && (
              <div style={{ marginTop: 4 }}>
                {soldScrapped.map((part, i) => (
                  <PartRow
                    key={part.id} part={part}
                    dateLabel={formatDate(part.sale_date ?? part.date_removed)}
                    dateLine={part.status}
                    isLast={i === soldScrapped.length - 1}
                    dimmed
                    onClick={() => navigate(`/tuning/parts-bin/${part.id}`)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── Add Part FAB ── */}
      <button
        onClick={() => navigate('/tuning/add?dest=parts-bin')}
        onPointerDown={() => setAddPressed(true)}
        onPointerUp={() => setAddPressed(false)}
        onPointerLeave={() => setAddPressed(false)}
        onPointerCancel={() => setAddPressed(false)}
        style={{
          position: 'fixed', right: 16, bottom: 26, zIndex: 20,
          width: 132, height: 78,
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 0, WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
          transform: addPressed ? 'scale(0.91) rotate(-1deg)' : 'scale(1) rotate(-1.5deg)',
          transition: addPressed ? 'transform 80ms ease-out' : 'transform 280ms cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        <svg viewBox="0 0 132 78" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
          <path
            d="M 22 24 C 48 8, 94 7, 116 30 C 128 44, 120 62, 98 70 C 70 80, 36 76, 16 58 C 4 46, 8 28, 22 24 C 30 18, 50 11, 72 9"
            fill="rgba(26,16,8,0.04)"
            stroke={COLOR_CARDBOARD_INK}
            strokeWidth="5.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.82"
          />
        </svg>
        <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
          <span style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 22, color: COLOR_CARDBOARD_INK, lineHeight: 1, opacity: 0.82 }}>+</span>
          <span style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 600, fontSize: 12, color: COLOR_CARDBOARD_INK, lineHeight: 1, opacity: 0.72 }}>Add Part</span>
        </div>
      </button>

    </div>
  )
}

// ── Section ───────────────────────────────────────────────────────────────

import React from 'react'

function Section({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ padding: '0 20px', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{ flex: 1, height: 1, background: COLOR_CARDBOARD_INK, opacity: 0.15 }} />
        <p style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 13, color: COLOR_CARDBOARD_INK2, opacity: 0.6, letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>
          {label}
        </p>
        <div style={{ flex: 1, height: 1, background: COLOR_CARDBOARD_INK, opacity: 0.15 }} />
      </div>
      {children}
    </div>
  )
}

// ── Part Row ──────────────────────────────────────────────────────────────

function PartRow({ part, dateLabel, dateLine, isLast, dimmed = false, onClick }: {
  part: Part; dateLabel: string | null; dateLine: string
  isLast: boolean; dimmed?: boolean; onClick: () => void
}) {
  const thumb = firstPhoto(part.job_photos)
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', background: 'none', border: 'none', padding: 0,
        cursor: 'pointer', WebkitTapHighlightColor: 'transparent', textAlign: 'left',
        paddingTop: 14, paddingBottom: 14,
        borderBottom: isLast ? 'none' : `1px solid rgba(100,60,20,0.18)`,
        display: 'flex', alignItems: 'center', gap: 12,
        opacity: dimmed ? 0.45 : 1,
      }}
    >
      {/* Thumbnail */}
      {thumb && (
        <img
          src={thumb} alt=""
          style={{ width: 60, height: 60, objectFit: 'cover', flexShrink: 0, display: 'block' }}
        />
      )}

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 20, color: COLOR_CARDBOARD_INK, margin: 0, lineHeight: 1.1 }}>
          {part.title}
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 3, flexWrap: 'wrap', alignItems: 'center' }}>
          {part.category && (
            <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: COLOR_CARDBOARD_STAMP, border: `1px solid ${COLOR_CARDBOARD_STAMP}`, padding: '2px 5px', opacity: 0.65 }}>
              {part.category}
            </span>
          )}
        </div>
        {dateLabel && (
          <p style={{ fontFamily: FONT_HANDWRITTEN, fontSize: 13, color: COLOR_CARDBOARD_INK2, opacity: 0.5, margin: '3px 0 0', textTransform: 'capitalize' }}>
            {dateLine} {dateLabel}
          </p>
        )}
        {part.status === 'sold' && part.sale_price != null && (
          <p style={{ fontFamily: FONT_HANDWRITTEN, fontSize: 13, color: COLOR_CARDBOARD_INK2, opacity: 0.45, margin: '2px 0 0' }}>
            sold for ${part.sale_price.toLocaleString()}
          </p>
        )}
        {part.parts_cost != null && part.status !== 'sold' && (
          <p style={{ fontFamily: FONT_HANDWRITTEN, fontSize: 13, color: COLOR_CARDBOARD_INK2, opacity: 0.45, margin: '2px 0 0' }}>
            ${part.parts_cost.toLocaleString()}
          </p>
        )}
      </div>

      <span style={{ fontFamily: FONT_HANDWRITTEN, fontSize: 20, color: COLOR_CARDBOARD_STAMP, opacity: 0.4, flexShrink: 0, lineHeight: 1 }}>›</span>
    </button>
  )
}
