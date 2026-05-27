const _now        = new Date()
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_LABEL = MONTHS[_now.getMonth()]
const DAY_LABEL   = String(_now.getDate())

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import iconService    from '../assets/icons/maintenance/service.png'
import iconDetail     from '../assets/icons/maintenance/maintenance_detail.png'
import maintenanceHero from '../assets/backgrounds/maintenance_hero.png'
import {
  COLOR_HEADER_BLACK, COLOR_HEADER_WARM, COLOR_HEADER_TITLE,
  COLOR_BURGUNDY_L, COLOR_BURGUNDY_M, COLOR_BURGUNDY_R,
  COLOR_TIMELINE_SERVICE,
  FONT_UI, HEADER_HEIGHT, HEADER_WEDGE_LEFT, HEADER_WEDGE_RIGHT,
  CAST_SHADOW_OPACITY, STAGGER_BASE_MS, STAGGER_STEP_MS, EASING_SETTLE,
} from '../tokens'

type RecentSession = {
  id: string
  date_performed: string
  mileage: number | null
  total_cost: number | null
  jobs: { category: string | null }[]
}

const TILES = [
  { id: 'detail',  label: 'Detailing', route: '/maintenance/detail',      src: iconDetail,  left: 48,  bottom: 60,  imgPad: 20, labelOffset: 4  },
  { id: 'service', label: 'Service',   route: '/maintenance/service/new', src: iconService, left: 218, bottom: 102, imgPad: 0,  labelOffset: -20 },
]

export default function MaintenancePage() {
  const navigate = useNavigate()
  const [pressed, setPressed] = useState<string | null>(null)
  const [bgLoaded, setBgLoaded] = useState(false)
  const [car, setCar] = useState<{ year: number | null; model: string | null } | null>(null)
  const [recent, setRecent] = useState<RecentSession[]>([])

  useEffect(() => {
    getActiveCarId().then(carId => {
      if (!carId) return
      supabase.from('cars').select('year, model').eq('id', carId).single()
        .then(({ data }) => { if (data) setCar(data as { year: number | null; model: string | null }) })
      supabase
        .from('sessions')
        .select('id, date_performed, mileage, total_cost, jobs(category)')
        .eq('car_id', carId)
        .eq('type', 'maintenance')
        .order('date_performed', { ascending: false })
        .limit(3)
        .then(({ data }) => { if (data) setRecent(data as unknown as RecentSession[]) })
    })
  }, [])

  function fmtDate(d: string) {
    const [, m, day] = d.split('-').map(Number)
    return `${MONTHS[m - 1]} ${day}`
  }

  return (
    <div style={{ height: '100dvh', position: 'relative', overflow: 'hidden', fontFamily: FONT_UI }}>
      <style>{`
        @keyframes iconFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .mnt-tile { user-select: none; -webkit-touch-callout: none; touch-action: manipulation; }
      `}</style>

      {/* ── Background layers ── */}
      {/* 1. Dark base */}
      <div style={{ position: 'absolute', inset: 0, background: '#1a1005' }} />

      {/* SVG clip-path defs — left panel + right panel */}
      <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden>
        <defs>
          {/* Left panel: everything left of / above the S-curve */}
          <clipPath id="mntLeftPanel" clipPathUnits="objectBoundingBox">
            <path d="M 0,0 L 0.66,0 C 0.92,0.22 0.20,0.72 0.0,0.86 L 0,1 Z" />
          </clipPath>
          {/* Right panel: everything right of the S-curve */}
          <clipPath id="mntAmberPanel" clipPathUnits="objectBoundingBox">
            <path d="M 0.66,0 C 0.92,0.22 0.20,0.72 0.0,0.86 L 0,1 L 1,1 L 1,0 Z" />
          </clipPath>
        </defs>
      </svg>

      {/* 2. Hero photo — clipped to the LEFT panel only, fade in on load */}
      <img
        src={maintenanceHero}
        alt=""
        aria-hidden
        onLoad={() => setBgLoaded(true)}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: 'center 30%',
          clipPath: 'url(#mntLeftPanel)',
          opacity: bgLoaded ? 0.55 : 0,
          transition: 'opacity 400ms ease',
        }}
      />
      {/* 3. Left golden-amber tint over the photo */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(160deg, rgba(200,140,8,0.82) 0%, rgba(130,75,10,0.70) 50%, rgba(0,0,0,0) 100%)',
        clipPath: 'url(#mntLeftPanel)',
        pointerEvents: 'none',
      }} />
      {/* 4. Right amber panel — solid, original colors restored */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(155deg, #c47818 0%, #d48828 40%, #b86818 75%, #9a5812 100%)',
        clipPath: 'url(#mntAmberPanel)',
        pointerEvents: 'none',
      }} />
      {/* 5. Grain overlay */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.035, mixBlendMode: 'overlay' }} aria-hidden>
        <filter id="mntGrain">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#mntGrain)" />
      </svg>
      {/* 6. Bottom vignette for label readability */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.10) 28%, transparent 50%)', pointerEvents: 'none' }} />

      {/* ── Header ── */}
      <div style={{ position: 'relative', height: HEADER_HEIGHT, flexShrink: 0, zIndex: 10 }}>
        <svg viewBox="0 0 390 44" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <defs>
            <linearGradient id="mntHdrGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor={COLOR_BURGUNDY_L} />
              <stop offset="55%"  stopColor={COLOR_BURGUNDY_M} />
              <stop offset="100%" stopColor={COLOR_BURGUNDY_R} />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="390" height="44" fill={COLOR_HEADER_BLACK} />
          <path d={HEADER_WEDGE_LEFT}  fill="url(#mntHdrGrad)" />
          <path d={HEADER_WEDGE_RIGHT} fill="url(#mntHdrGrad)" />
        </svg>
        <button onClick={() => navigate('/home')} style={{ position: 'absolute', left: 10, top: 0, height: '100%', display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>
          <span style={{ color: COLOR_HEADER_WARM, fontSize: 20, fontWeight: 300, lineHeight: 1 }}>‹</span>
          <span style={{ color: COLOR_HEADER_TITLE, fontFamily: FONT_UI, fontStyle: 'italic', fontWeight: 800, fontSize: 16, letterSpacing: '-0.03em' }}>Maintenance &amp; Service</span>
        </button>
        <div style={{ position: 'absolute', right: 0, top: 0, height: '100%', display: 'flex', alignItems: 'center', paddingRight: 14, gap: 0 }}>
          {car && <span style={{ paddingRight: 10, fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, color: COLOR_HEADER_WARM, letterSpacing: '0.04em', opacity: 0.75 }}>{[car.year, car.model].filter(Boolean).join(' ')}</span>}
          <div style={{ background: 'rgba(242,238,228,0.94)', color: '#0d0d0d', padding: '4px 7px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>{MONTH_LABEL}</div>
          <div style={{ background: COLOR_HEADER_BLACK, color: '#fff', padding: '4px 8px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: DAY_LABEL.length === 1 ? 24 : 30 }}>{DAY_LABEL}</div>
        </div>
      </div>

      {/* ── Service history strip ── */}
      {recent.length > 0 && (
        <div style={{ position: 'relative', zIndex: 5 }}>
          {recent.map((s, i) => (
            <button key={s.id} onClick={() => navigate(`/maintenance/${s.id}`)} style={{
              width: '100%', display: 'flex', alignItems: 'center',
              background: i === 0 ? 'rgba(212,184,106,0.07)' : 'rgba(10,9,6,0.52)',
              border: 'none', borderBottom: '1px solid rgba(212,184,106,0.10)',
              padding: '10px 16px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}>
              <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 12, color: COLOR_TIMELINE_SERVICE, minWidth: 58 }}>{fmtDate(s.date_performed)}</span>
              <span style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 12, color: 'rgba(245,245,245,0.55)', flex: 1, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.06em', paddingLeft: 10 }}>{s.jobs?.[0]?.category ?? 'Service'}</span>
              {s.mileage != null && <span style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 11, color: 'rgba(245,245,245,0.35)', paddingRight: 10 }}>{s.mileage.toLocaleString()} mi</span>}
              {s.total_cost != null && <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 12, color: 'rgba(245,245,245,0.70)', paddingRight: 6 }}>${Number(s.total_cost).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>}
              <span style={{ color: 'rgba(212,184,106,0.45)', fontSize: 14 }}>›</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Icon tiles ── */}
      {TILES.map((tile, i) => (
        <button key={tile.id} onClick={() => navigate(tile.route)} className="mnt-tile"
          onPointerDown={() => setPressed(tile.id)} onPointerUp={() => setPressed(null)}
          onPointerLeave={() => setPressed(null)} onPointerCancel={() => setPressed(null)}
          style={{ position: 'absolute', left: tile.left, bottom: tile.bottom, display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, animation: `iconFadeIn 550ms ${EASING_SETTLE} ${STAGGER_BASE_MS + i * STAGGER_STEP_MS}ms both`, WebkitTapHighlightColor: 'transparent', zIndex: 5 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transform: pressed === tile.id ? 'scale(0.92)' : 'scale(1)', transition: pressed === tile.id ? 'transform 80ms ease-out' : 'transform 200ms cubic-bezier(0.22,1,0.36,1)' }}>
            <div style={{ position: 'relative', width: 126, height: 126 }}>
              <div style={{ position: 'absolute', top: 110, left: 63, width: 58, height: 18, transform: 'translate(-50%, -50%) rotate(25deg) skewX(-14deg)', background: 'rgba(0,0,0,1)', opacity: CAST_SHADOW_OPACITY, filter: 'blur(6px)' }} />
              <img src={tile.src} alt={tile.label} draggable={false} style={{ position: 'absolute', top: tile.imgPad, left: tile.imgPad, width: 126 - tile.imgPad * 2, height: 126 - tile.imgPad * 2, objectFit: 'contain', pointerEvents: 'none' }} />
            </div>
            <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, color: 'rgba(245,245,245,0.88)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: tile.labelOffset }}>{tile.label}</span>
          </div>
        </button>
      ))}
    </div>
  )
}
