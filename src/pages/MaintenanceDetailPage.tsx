const _now        = new Date()
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_LABEL = MONTHS[_now.getMonth()]
const DAY_LABEL   = String(_now.getDate())

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import detailHero from '../assets/backgrounds/detail_hero.png'
import {
  COLOR_HEADER_BLACK, COLOR_HEADER_WARM, COLOR_HEADER_TITLE,
  COLOR_TIMELINE_DETAIL, COLOR_BURGUNDY_L,
  FONT_UI, HEADER_HEIGHT,
} from '../tokens'

type DetailSession = {
  id: string
  date_performed: string
  total_cost: number | null
  jobs: { title: string }[]
}

export default function MaintenanceDetailPage() {
  const navigate  = useNavigate()
  const [sessions, setSessions] = useState<DetailSession[]>([])
  const [loading,  setLoading]  = useState(true)
  const [bgLoaded, setBgLoaded] = useState(false)
  const [carInfo,  setCarInfo]  = useState('')

  useEffect(() => {
    getActiveCarId().then(carId => {
      if (!carId) { setLoading(false); return }
      supabase.from('cars').select('year, model, variant').eq('id', carId).single()
        .then(({ data }) => { if (data) setCarInfo([data.year, data.model, data.variant].filter(Boolean).join(' ')) })
      supabase
        .from('sessions')
        .select('id, date_performed, total_cost, jobs(title)')
        .eq('car_id', carId)
        .eq('type', 'detail')
        .order('date_performed', { ascending: false })
        .then(({ data }) => {
          if (data) setSessions(data as DetailSession[])
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
      <div style={{ position: 'absolute', inset: 0, background: '#06101a' }} />

      {/* SVG clip-paths */}
      <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden>
        <defs>
          <clipPath id="dtlLeftPanel" clipPathUnits="objectBoundingBox">
            <path d="M 0,0 L 0.66,0 C 0.92,0.22 0.20,0.72 0.0,0.86 L 0,1 Z" />
          </clipPath>
          <clipPath id="dtlRightPanel" clipPathUnits="objectBoundingBox">
            <path d="M 0.66,0 C 0.92,0.22 0.20,0.72 0.0,0.86 L 0,1 L 1,1 L 1,0 Z" />
          </clipPath>
        </defs>
      </svg>

      {/* Hero photo — left panel only */}
      <img
        src={detailHero}
        alt="" aria-hidden
        onLoad={() => setBgLoaded(true)}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: 'center 40%',
          clipPath: 'url(#dtlLeftPanel)',
          opacity: bgLoaded ? 0.55 : 0,
          transition: 'opacity 400ms ease',
        }}
      />
      {/* Left blue-water tint */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(160deg, rgba(18,72,140,0.82) 0%, rgba(10,45,90,0.70) 50%, rgba(0,0,0,0) 100%)',
        clipPath: 'url(#dtlLeftPanel)',
        pointerEvents: 'none',
      }} />
      {/* Right panel — deep navy */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(155deg, #c47818 0%, #d48828 40%, #b86818 75%, #9a5812 100%)',
        clipPath: 'url(#dtlRightPanel)',
        pointerEvents: 'none',
      }} />
      {/* Grain */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.04, mixBlendMode: 'overlay' }} aria-hidden>
        <filter id="dtlGrain">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#dtlGrain)" />
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
          {carInfo && <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, color: COLOR_HEADER_WARM, letterSpacing: '0.04em', opacity: 0.75, display: 'flex', alignItems: 'center', paddingRight: 10, whiteSpace: 'nowrap' }}>{carInfo}</span>}
          <div style={{ background: 'rgba(242,238,228,0.94)', color: '#0d0d0d', padding: '4px 7px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>{MONTH_LABEL}</div>
          <div style={{ background: COLOR_BURGUNDY_L, color: '#fff', padding: '4px 8px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: DAY_LABEL.length === 1 ? 24 : 30 }}>{DAY_LABEL}</div>
        </div>
      </div>

      {/* ── Section label ── */}
      <div style={{ position: 'relative', zIndex: 5, padding: '14px 16px 6px', borderBottom: '1px solid rgba(138,176,200,0.12)' }}>
        <div style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: COLOR_TIMELINE_DETAIL, opacity: 0.75 }}>Detail Log</div>
      </div>

      {/* ── Session list ── */}
      <div style={{ position: 'relative', zIndex: 5, flex: 1, overflowY: 'auto', height: `calc(100dvh - ${HEADER_HEIGHT}px - 37px)` }}>
        {!loading && sessions.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', fontFamily: FONT_UI, fontSize: 13, color: 'rgba(138,176,200,0.35)', letterSpacing: '0.06em' }}>No detail sessions yet</div>
        )}
        {!loading && sessions.map((s, i) => (
          <button key={s.id} onClick={() => navigate(`/maintenance/${s.id}`)} style={{
            width: '100%', display: 'flex', alignItems: 'center',
            background: i % 2 === 0 ? 'rgba(138,176,200,0.10)' : 'rgba(6,16,26,0.16)',
            border: 'none', borderBottom: '1px solid rgba(138,176,200,0.08)',
            padding: '13px 16px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          }}>
            <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 12, color: COLOR_TIMELINE_DETAIL, minWidth: 72, flexShrink: 0 }}>
              {fmtDate(s.date_performed)}
            </span>
            <span style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 12, color: 'rgba(245,245,245,0.48)', flex: 1, textAlign: 'left', paddingLeft: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.jobs?.length > 0
                ? s.jobs.slice(0, 2).map(j => j.title).join(', ') + (s.jobs.length > 2 ? '…' : '')
                : '—'}
            </span>
            {s.total_cost != null && (
              <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 12, color: 'rgba(245,245,245,0.88)', paddingRight: 6 }}>
                ${Number(s.total_cost).toFixed(2)}
              </span>
            )}
            <span style={{ color: 'rgba(138,176,200,0.35)', fontSize: 14 }}>›</span>
          </button>
        ))}
      </div>

      {/* ── FAB ── */}
      <button
        onClick={() => navigate('/maintenance/detail/new')}
        style={{
          position: 'fixed', right: 20, bottom: 28,
          height: 44, paddingLeft: 20, paddingRight: 20,
          background: COLOR_TIMELINE_DETAIL, border: 'none', borderRadius: 10,
          color: '#060e18', fontFamily: FONT_UI, fontWeight: 700, fontSize: 13,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          cursor: 'pointer', zIndex: 20,
          boxShadow: '0 4px 16px rgba(0,0,0,0.60)',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span style={{ fontSize: 18, fontWeight: 300, lineHeight: 1, marginTop: -1 }}>+</span>
        Add Detail
      </button>
    </div>
  )
}
