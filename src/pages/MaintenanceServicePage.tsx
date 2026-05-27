const _now        = new Date()
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_LABEL = MONTHS[_now.getMonth()]
const DAY_LABEL   = String(_now.getDate())

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import serviceHero from '../assets/backgrounds/service_hero.png'
import {
  COLOR_HEADER_BLACK, COLOR_HEADER_WARM, COLOR_HEADER_TITLE,
  COLOR_TIMELINE_SERVICE, COLOR_BURGUNDY_L,
  FONT_UI, HEADER_HEIGHT,
} from '../tokens'

type ServiceSession = {
  id: string
  date_performed: string
  mileage: number | null
  total_cost: number | null
  jobs: { category: string | null }[]
}

export default function MaintenanceServicePage() {
  const navigate  = useNavigate()
  const [sessions, setSessions] = useState<ServiceSession[]>([])
  const [loading,  setLoading]  = useState(true)
  const [bgLoaded, setBgLoaded] = useState(false)

  useEffect(() => {
    getActiveCarId().then(carId => {
      if (!carId) { setLoading(false); return }
      supabase
        .from('sessions')
        .select('id, date_performed, mileage, total_cost, jobs(category)')
        .eq('car_id', carId)
        .eq('type', 'maintenance')
        .order('date_performed', { ascending: false })
        .then(({ data }) => {
          if (data) setSessions(data as unknown as ServiceSession[])
          setLoading(false)
        })
    })
  }, [])

  function fmtDate(d: string) {
    const [y, m, day] = d.split('-').map(Number)
    return `${MONTHS[m - 1]} ${day}, ${y}`
  }

  return (
    <div style={{ height: '100dvh', position: 'relative', overflow: 'hidden', fontFamily: FONT_UI }}>

      {/* ── Background layers ── */}
      <div style={{ position: 'absolute', inset: 0, background: '#0e1218' }} />

      {/* SVG clip-paths */}
      <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden>
        <defs>
          <clipPath id="svcLeftPanel" clipPathUnits="objectBoundingBox">
            <path d="M 0,0 L 0.66,0 C 0.92,0.22 0.20,0.72 0.0,0.86 L 0,1 Z" />
          </clipPath>
          <clipPath id="svcRightPanel" clipPathUnits="objectBoundingBox">
            <path d="M 0.66,0 C 0.92,0.22 0.20,0.72 0.0,0.86 L 0,1 L 1,1 L 1,0 Z" />
          </clipPath>
        </defs>
      </svg>

      {/* Hero photo — left panel only */}
      <img
        src={serviceHero}
        alt="" aria-hidden
        onLoad={() => setBgLoaded(true)}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: '22% 0%',
          clipPath: 'url(#svcLeftPanel)',
          opacity: bgLoaded ? 0.55 : 0,
          transition: 'opacity 400ms ease',
        }}
      />
      {/* Left cool-grey tint */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(160deg, rgba(85,100,118,0.82) 0%, rgba(55,68,82,0.70) 50%, rgba(0,0,0,0) 100%)',
        clipPath: 'url(#svcLeftPanel)',
        pointerEvents: 'none',
      }} />
      {/* Right panel — slate grey */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(155deg, #c47818 0%, #d48828 40%, #b86818 75%, #9a5812 100%)',
        clipPath: 'url(#svcRightPanel)',
        pointerEvents: 'none',
      }} />
      {/* Grain */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.04, mixBlendMode: 'overlay' }} aria-hidden>
        <filter id="svcGrain">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#svcGrain)" />
      </svg>
      {/* Bottom vignette */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.70) 0%, rgba(0,0,0,0.10) 30%, transparent 55%)', pointerEvents: 'none' }} />

      {/* ── Header ── */}
      <div style={{ position: 'relative', height: HEADER_HEIGHT, flexShrink: 0, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 10, paddingRight: 14, borderBottom: '1px solid rgba(255,255,255,0.04)', zIndex: 10 }}>
        <button onClick={() => navigate('/maintenance')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px 4px 4px', WebkitTapHighlightColor: 'transparent' }}>
          <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
          <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 13, color: COLOR_HEADER_TITLE, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Maintenance</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          <div style={{ background: 'rgba(242,238,228,0.94)', color: '#0d0d0d', padding: '4px 7px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>{MONTH_LABEL}</div>
          <div style={{ background: COLOR_BURGUNDY_L, color: '#fff', padding: '4px 8px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: DAY_LABEL.length === 1 ? 24 : 30 }}>{DAY_LABEL}</div>
        </div>
      </div>

      {/* ── Section label ── */}
      <div style={{ position: 'relative', zIndex: 5, padding: '14px 16px 6px', borderBottom: '1px solid rgba(212,184,106,0.10)' }}>
        <div style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: COLOR_TIMELINE_SERVICE, opacity: 0.75 }}>Service History</div>
      </div>

      {/* ── Session list ── */}
      <div style={{ position: 'relative', zIndex: 5, overflowY: 'auto', height: `calc(100dvh - ${HEADER_HEIGHT}px - 37px)` }}>
        {!loading && sessions.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', fontFamily: FONT_UI, fontSize: 13, color: 'rgba(212,184,106,0.30)', letterSpacing: '0.06em' }}>No service records yet</div>
        )}
        {!loading && sessions.map((s, i) => (
          <button key={s.id} onClick={() => navigate(`/maintenance/${s.id}`)} style={{
            width: '100%', display: 'flex', alignItems: 'center',
            background: i === 0 ? 'rgba(212,184,106,0.07)' : 'rgba(14,18,24,0.62)',
            border: 'none', borderBottom: '1px solid rgba(212,184,106,0.08)',
            padding: '13px 16px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          }}>
            <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 12, color: COLOR_TIMELINE_SERVICE, minWidth: 72 }}>
              {fmtDate(s.date_performed)}
            </span>
            <span style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 12, color: 'rgba(245,245,245,0.50)', flex: 1, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.06em', paddingLeft: 10 }}>
              {s.jobs?.[0]?.category ?? 'Service'}
            </span>
            {s.mileage != null && (
              <span style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 11, color: 'rgba(245,245,245,0.30)', paddingRight: 10 }}>
                {s.mileage.toLocaleString()} mi
              </span>
            )}
            {s.total_cost != null && (
              <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 12, color: 'rgba(245,245,245,0.70)', paddingRight: 6 }}>
                ${Number(s.total_cost).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
            )}
            <span style={{ color: 'rgba(212,184,106,0.35)', fontSize: 14 }}>›</span>
          </button>
        ))}
      </div>

      {/* ── FAB — Add Service ── */}
      <button
        onClick={() => navigate('/maintenance/service/new')}
        style={{
          position: 'fixed', right: 20, bottom: 28,
          height: 44, paddingLeft: 20, paddingRight: 20,
          background: COLOR_TIMELINE_SERVICE, border: 'none', borderRadius: 10,
          color: '#0a0a0a', fontFamily: FONT_UI, fontWeight: 700, fontSize: 13,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          cursor: 'pointer', zIndex: 20,
          boxShadow: '0 4px 20px rgba(0,0,0,0.55)',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span style={{ fontSize: 18, fontWeight: 300, lineHeight: 1, marginTop: -1 }}>+</span>
        Add Service
      </button>
    </div>
  )
}
