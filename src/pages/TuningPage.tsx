// Route: /tuning — Tuning category hub
const _now        = new Date()
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_LABEL = MONTHS[_now.getMonth()]
const DAY_LABEL   = String(_now.getDate())

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import tuningHero     from '../assets/backgrounds/tuning_hero.png'
import iconBuildSheet from '../assets/icons/tuning-dashboard/tuning_buildsheet.png'
import iconBlueprint  from '../assets/icons/tuning-dashboard/tuning_blueprint.png'
import iconPartsBin   from '../assets/icons/tuning-dashboard/tuning_partsbin.png'
import {
  COLOR_HEADER_BLACK,
  COLOR_HEADER_WARM,
  COLOR_HEADER_TITLE,
  COLOR_BURGUNDY_L,
  COLOR_BURGUNDY_M,
  COLOR_BURGUNDY_R,
  FONT_UI,
  HEADER_HEIGHT,
  HEADER_WEDGE_LEFT,
  HEADER_WEDGE_RIGHT,
  CAST_SHADOW_OPACITY,
  STAGGER_BASE_MS,
  STAGGER_STEP_MS,
  EASING_SETTLE,
} from '../tokens'

// L-shape: Blueprint is the vertical stem (upper-left),
// Build Sheet + Parts Bin form the horizontal bar (bottom).
// Parts Bin sits below the lift on the right.
const TILES = [
  { id: 'blueprint',   label: 'Blueprint',   route: '/tuning/blueprint',   src: iconBlueprint,  left: 16,  bottom: 190, labelMargin: -6 },
  { id: 'build-sheet', label: 'Build Sheet', route: '/tuning/build-sheet', src: iconBuildSheet, left: 58,  bottom: 54,  labelMargin: -6 },
  { id: 'parts-bin',   label: 'Parts Bin',   route: '/tuning/parts-bin',   src: iconPartsBin,   left: 222, bottom: 88,  labelMargin: 6 },
]

export default function TuningPage() {
  const navigate = useNavigate()
  const [pressed, setPressed] = useState<string | null>(null)
  const [car, setCar] = useState<{ year: number | null; model: string | null } | null>(null)

  useEffect(() => {
    getActiveCarId().then(carId => {
      if (!carId) return
      supabase.from('cars').select('year, model').eq('id', carId).single()
        .then(({ data }) => { if (data) setCar(data as { year: number | null; model: string | null }) })
    })
  }, [])

  return (
    <div style={{ height: '100dvh', position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @keyframes iconFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .icon-tile { user-select: none; -webkit-touch-callout: none; touch-action: manipulation; }
      `}</style>

      {/* Full-bleed workshop photo */}
      <img
        src={tuningHero}
        alt=""
        aria-hidden
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: 'center top',
        }}
      />

      {/* Gradient — darkens floor so icon labels stay readable */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to top, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.28) 32%, rgba(0,0,0,0.08) 58%, transparent 80%)',
        pointerEvents: 'none',
      }} />

      {/* ── Header ── */}
      <div style={{ position: 'relative', height: HEADER_HEIGHT, flexShrink: 0, zIndex: 10 }}>
        <svg
          viewBox="0 0 390 44"
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          <defs>
            <linearGradient id="tuningHdrGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor={COLOR_BURGUNDY_L} />
              <stop offset="55%"  stopColor={COLOR_BURGUNDY_M} />
              <stop offset="100%" stopColor={COLOR_BURGUNDY_R} />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="390" height="44" fill={COLOR_HEADER_BLACK} />
          <path d={HEADER_WEDGE_LEFT}  fill="url(#tuningHdrGrad)" />
          <path d={HEADER_WEDGE_RIGHT} fill="url(#tuningHdrGrad)" />
        </svg>

        {/* Back + Title */}
        <button
          onClick={() => navigate('/home')}
          style={{
            position: 'absolute', left: 10, top: 0, height: '100%',
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '4px 8px',
          }}
        >
          <span style={{ color: COLOR_HEADER_WARM, fontSize: 20, fontWeight: 300, lineHeight: 1 }}>‹</span>
          <span style={{
            color: COLOR_HEADER_TITLE,
            fontFamily: FONT_UI,
            fontStyle: 'italic',
            fontWeight: 800,
            fontSize: 24,
            letterSpacing: '-0.1em',
          }}>
            The Shop
          </span>
        </button>

        {/* Year/model + Date chips */}
        <div style={{
          position: 'absolute', right: 0, top: 0, height: '100%',
          display: 'flex', alignItems: 'center', paddingRight: 14, gap: 8,
        }}>
          {car && (
            <span style={{
              fontFamily: FONT_UI, fontWeight: 700, fontSize: 11,
              color: COLOR_HEADER_WARM, letterSpacing: '0.04em', opacity: 0.75,
            }}>
              {[car.year, car.model].filter(Boolean).join(' ')}
            </span>
          )}
          <div style={{
            background: 'rgba(242,238,228,0.94)', color: '#0d0d0d',
            padding: '4px 7px', fontFamily: FONT_UI, fontWeight: 800,
            fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase',
            display: 'flex', alignItems: 'center',
          }}>
            {MONTH_LABEL}
          </div>
          <div style={{
            background: COLOR_HEADER_BLACK, color: '#fff',
            padding: '4px 8px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minWidth: DAY_LABEL.length === 1 ? 24 : 30,
          }}>
            {DAY_LABEL}
          </div>
        </div>
      </div>

      {/* ── Icon tiles — asymmetric stagger, left of the lift ── */}
      {TILES.map((tile, i) => (
        <button
          key={tile.id}
          onClick={() => navigate(tile.route)}
          className="icon-tile"
          onPointerDown={() => setPressed(tile.id)}
          onPointerUp={() => setPressed(null)}
          onPointerLeave={() => setPressed(null)}
          onPointerCancel={() => setPressed(null)}
          style={{
            position: 'absolute',
            left: tile.left,
            bottom: tile.bottom,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            animation: `iconFadeIn 550ms ${EASING_SETTLE} ${STAGGER_BASE_MS + i * STAGGER_STEP_MS}ms both`,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {/* Inner wrapper owns the press transform, separate from the fade-in animation on the button */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            transform: pressed === tile.id ? 'scale(0.92)' : 'scale(1)',
            transition: pressed === tile.id ? 'transform 80ms ease-out' : 'transform 200ms cubic-bezier(0.22,1,0.36,1)',
          }}>
            <div style={{ position: 'relative', width: 126, height: 126 }}>
              {/* Angled cast shadow — matches Garage dashboard exactly */}
              <div style={{
                position: 'absolute',
                top: 90, left: 63,
                width: 66, height: 60,
                transform: 'translate(-50%, -50%) rotate(25deg) skewX(-14deg)',
                background: 'rgba(0,0,0,1)',
                opacity: CAST_SHADOW_OPACITY,
                filter: 'blur(5px)',
              }} />
              <img
                src={tile.src}
                alt={tile.label}
                draggable={false}
                style={{
                  position: 'absolute', top: 0, left: 0,
                  width: 126, height: 126,
                  objectFit: 'contain',
                  pointerEvents: 'none',
                }}
              />
            </div>
            <span style={{
              fontFamily: FONT_UI, fontWeight: 700, fontSize: 11,
              color: 'rgba(245,245,245,0.8)',
              letterSpacing: '0.08em', textTransform: 'uppercase',
              marginTop: tile.labelMargin, position: 'relative', zIndex: 1,
            }}>
              {tile.label}
            </span>
          </div>
        </button>
      ))}
    </div>
  )
}
