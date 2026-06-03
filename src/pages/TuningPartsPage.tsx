// Route: /tuning/parts-bin — Owned, not installed
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import {
  FONT_HANDWRITTEN, FONT_STAMP,
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

type Car = { year: number | null; make: string | null; model: string | null; variant: string | null }

// ── Kraft paper grain ─────────────────────────────────────────────────────

const NOISE_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`

// ── Seeded pseudo-random ──────────────────────────────────────────────────
// Derives a stable 0–1 value from a part's UUID so offsets stay
// consistent across re-renders without useRef/useState.

function seededVal(seed: string, salt = ''): number {
  const s = seed + salt
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0
  }
  return ((h >>> 0) % 1000) / 1000
}

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

  const [wishlist,     setWishlist]     = useState<Part[]>([])
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

    const [{ data: carData }, { data: active }, { data: history }, { data: planned }] = await Promise.all([
      supabase.from('cars').select('year, make, model, variant').eq('id', carId).single(),
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
      supabase
        .from('jobs')
        .select('id, title, brand, category, date_removed, date_installed, parts_cost, status, sale_price, sale_date, job_photos(photo_url, display_order)')
        .eq('car_id', carId)
        .eq('type', 'modification')
        .eq('status', 'planned')
        .order('created_at', { ascending: false }),
    ])

    if (carData) setCar(carData as Car)
    const all = (active ?? []) as Part[]
    setPulled(all.filter(p => p.status === 'removed'))
    setOnHand(all.filter(p => p.status === 'purchased'))
    setSoldScrapped((history ?? []) as Part[])
    setWishlist((planned ?? []) as Part[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const isEmpty = wishlist.length === 0 && pulled.length === 0 && onHand.length === 0

  return (
    <div style={{
      minHeight: '100dvh',
      background: COLOR_CARDBOARD_BG,
      backgroundImage: [
        // Horizontal corrugation — primary structure
        `repeating-linear-gradient(0deg, transparent, transparent 14px, rgba(100,60,20,0.07) 14px, rgba(100,60,20,0.07) 15px)`,
        // Vertical cross-layer — very faint, suggests cardboard internal structure
        `repeating-linear-gradient(90deg, transparent, transparent 18px, rgba(100,60,20,0.028) 18px, rgba(100,60,20,0.028) 19px)`,
        // Edge vignette
        `radial-gradient(ellipse 100% 100% at 50% 50%, transparent 60%, rgba(80,40,10,0.28) 100%)`,
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
                {[car.year, car.model, car.variant].filter(Boolean).join(' ')}
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
        <div style={{ padding: '14px 24px 0', textAlign: 'center' }}>
          <div style={{ position: 'relative', display: 'inline-block', transform: 'rotate(-1.5deg)' }}>
            {/* Oval stamp frame — double ring to mimic rubber stamp border */}
            <svg
              viewBox="0 0 140 72"
              preserveAspectRatio="none"
              style={{
                position: 'absolute',
                inset: '-10px -24px',
                width: 'calc(100% + 48px)',
                height: 'calc(100% + 20px)',
                overflow: 'visible',
                pointerEvents: 'none',
              }}
            >
              <ellipse cx="70" cy="36" rx="67" ry="32"
                fill="none"
                stroke={COLOR_CARDBOARD_STAMP}
                strokeWidth="2.5"
                opacity="0.52"
              />
              <ellipse cx="70" cy="36" rx="61" ry="26"
                fill="none"
                stroke={COLOR_CARDBOARD_STAMP}
                strokeWidth="1"
                opacity="0.22"
              />
            </svg>

            {/* "Parts" in stamp ink */}
            <p style={{
              fontFamily: FONT_STAMP,
              fontSize: 38,
              color: COLOR_CARDBOARD_STAMP,
              opacity: 0.85,
              margin: '0 0 2px',
              lineHeight: 1,
              // Ink bleed / spread — tiny offset shadow same hue
              textShadow: `1px 1px 0 rgba(139,58,10,0.22), -0.5px -0.5px 0 rgba(139,58,10,0.14)`,
            }}>
              Parts
            </p>

            {/* Sub-label */}
            <p style={{
              fontFamily: FONT_HANDWRITTEN,
              fontSize: 11,
              color: COLOR_CARDBOARD_STAMP,
              opacity: 0.4,
              margin: 0,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
            }}>
              — inventory —
            </p>
          </div>
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
              Parts you want, have on hand, or pulled from the car will show up here
            </p>
          </div>
        )}

        {/* Wishlist */}
        {wishlist.length > 0 && (
          <Section label="Wishlist" style={{ marginTop: 32 }}>
            {wishlist.map((part, i) => (
              <PartRow
                key={part.id} part={part}
                dateLabel={null} dateLine=""
                isLast={i === wishlist.length - 1}
                onClick={() => navigate(`/tuning/parts-bin/${part.id}`)}
              />
            ))}
          </Section>
        )}

        {/* On Hand */}
        {onHand.length > 0 && (
          <Section label="On hand" style={{ marginTop: wishlist.length > 0 ? 36 : 32 }}>
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
          <Section label="In storage" style={{ marginTop: (wishlist.length > 0 || onHand.length > 0) ? 36 : 32 }}>
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
          <div style={{ padding: '0 20px', marginTop: (pulled.length > 0 || onHand.length > 0) ? 36 : 32 }}>
            <button
              onClick={() => setSoldExpanded(v => !v)}
              style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, WebkitTapHighlightColor: 'transparent' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, height: 1, background: COLOR_CARDBOARD_INK, opacity: 0.1 }} />
                {/* Label with hand-drawn diagonal marker strikethrough */}
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                  <p style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 13, color: COLOR_CARDBOARD_INK2, opacity: 0.35, letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>
                    Sold / Scrapped ({soldScrapped.length})
                  </p>
                  {/* Diagonal marker line across label */}
                  <svg style={{ position: 'absolute', inset: '-1px -2px', width: 'calc(100% + 4px)', height: 'calc(100% + 2px)', overflow: 'visible', pointerEvents: 'none' }}>
                    <line x1="0" y1="65%" x2="100%" y2="35%"
                      stroke={COLOR_CARDBOARD_STAMP}
                      strokeWidth="1.5"
                      opacity="0.38"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <span style={{ fontFamily: FONT_HANDWRITTEN, fontSize: 14, color: COLOR_CARDBOARD_INK2, opacity: 0.3 }}>
                  {soldExpanded ? '▴' : '▾'}
                </span>
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

function Section({ label, children, style, tapeAngle = -1 }: {
  label: string; children: React.ReactNode; style?: React.CSSProperties; tapeAngle?: number
}) {
  return (
    <div style={{ padding: '0 20px', ...style }}>
      {/* Masking tape label strip */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
        <div style={{
          transform: `rotate(${tapeAngle}deg)`,
          // Tape strip with soft torn-edge fade on left and right
          background: `linear-gradient(90deg,
            transparent,
            rgba(210,178,112,0.78) 9%,
            rgba(218,186,120,0.82) 50%,
            rgba(210,178,112,0.78) 91%,
            transparent
          )`,
          padding: '5px 36px',
          // Top/bottom inner shadow for tape thickness feel
          boxShadow: 'inset 0 1px 0 rgba(255,240,200,0.28), inset 0 -1px 0 rgba(100,60,20,0.14)',
        }}>
          <p style={{
            fontFamily: FONT_HANDWRITTEN,
            fontWeight: 700,
            fontSize: 14,
            color: COLOR_CARDBOARD_INK,
            opacity: 0.7,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            margin: 0,
          }}>
            {label}
          </p>
        </div>
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

  // Derive stable per-part offsets from the UUID.
  // Each salt produces an independent hash so values are uncorrelated.
  const polaroidRot = (seededVal(part.id, 'r') - 0.5) * 6.5   // –3.25 … +3.25 deg
  const nudgeX      = (seededVal(part.id, 'x') - 0.5) * 11    // –5.5 … +5.5 px

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', background: 'none', border: 'none', padding: 0,
        cursor: 'pointer', WebkitTapHighlightColor: 'transparent', textAlign: 'left',
        paddingTop: 14, paddingBottom: 14,
        borderBottom: isLast ? 'none' : `1.5px solid rgba(100,60,20,0.14)`,
        display: 'flex', alignItems: 'center', gap: 14,
        opacity: dimmed ? 0.45 : part.status === 'planned' ? 0.78 : 1,
      }}
    >
      {/* Polaroid photo frame */}
      {thumb ? (
        <div style={{
          flexShrink: 0,
          background: '#f5eed8',
          padding: '3px 3px 13px 3px',
          boxShadow: '1px 2px 6px rgba(0,0,0,0.22), 0 0 0 0.5px rgba(100,60,20,0.1)',
          transform: `rotate(${polaroidRot}deg)`,
          lineHeight: 0,
          opacity: 0,
          transition: 'opacity 180ms ease',
        }}>
          <img
            src={thumb} alt=""
            style={{ width: 56, height: 56, objectFit: 'cover', display: 'block' }}
            onLoad={e => { (e.currentTarget.parentElement as HTMLElement).style.opacity = '1' }}
          />
        </div>
      ) : (
        // Empty polaroid placeholder when no photo
        <div style={{
          flexShrink: 0,
          background: '#f5eed8',
          width: 62, height: 72,
          boxShadow: '1px 2px 5px rgba(0,0,0,0.16)',
          transform: `rotate(${polaroidRot}deg)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          paddingBottom: 10,
        }}>
          <span style={{ fontFamily: FONT_HANDWRITTEN, fontSize: 22, color: COLOR_CARDBOARD_INK, opacity: 0.1 }}>?</span>
        </div>
      )}

      {/* Text block — shifted by per-part horizontal nudge */}
      <div style={{ flex: 1, minWidth: 0, transform: `translateX(${nudgeX}px)` }}>
        <p style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 20, color: COLOR_CARDBOARD_INK, margin: 0, lineHeight: 1.1 }}>
          {part.title}
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          {part.category && (
            // Handwritten category badge — feels stamped, not digital
            <span style={{
              fontFamily: FONT_HANDWRITTEN,
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: COLOR_CARDBOARD_STAMP,
              border: `1px solid ${COLOR_CARDBOARD_STAMP}`,
              padding: '1px 6px',
              opacity: 0.58,
            }}>
              {part.category}
            </span>
          )}
          {part.status === 'planned' && (
            <span style={{
              fontFamily: FONT_STAMP,
              fontSize: 10,
              color: '#6b4882',
              border: '1.5px solid #6b4882',
              padding: '1px 6px',
              transform: 'rotate(-2.5deg)',
              display: 'inline-block',
              opacity: 0.72,
              letterSpacing: '0.05em',
            }}>WANTED</span>
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
