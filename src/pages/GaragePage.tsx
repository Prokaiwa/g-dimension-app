// Route: /garage — Garage hero + dashboard grid (Build Order Step 7)
const _now        = new Date()
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_LABEL = MONTHS[_now.getMonth()]
const DAY_LABEL   = String(_now.getDate())

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import garageHero    from '../assets/backgrounds/garage_hero.png'
import iconMyCars    from '../assets/icons/garage/my_cars.png'
import iconSnapshot  from '../assets/icons/garage/snapshot.png'
import iconBuildPdf  from '../assets/icons/garage/buildpdf.png'
import iconDocs      from '../assets/icons/garage/docs.png'
import iconContacts  from '../assets/icons/garage/contacts.png'
import iconReminders from '../assets/icons/garage/reminders.png'
import {
  COLOR_ACCENT,
  COLOR_HEADER_BLACK,
  COLOR_HEADER_WARM,
  COLOR_HEADER_TITLE,
  COLOR_BURGUNDY_L,
  COLOR_BURGUNDY_M,
  COLOR_BURGUNDY_R,
  FONT_UI,
  FONT_TITLE,
  HEADER_HEIGHT,
  HEADER_WEDGE_LEFT,
  HEADER_WEDGE_RIGHT,
  CAST_SHADOW_OPACITY,
  SPACE_LG,
  SPACE_SM,
  SPACE_XS,
  STAGGER_BASE_MS,
  STAGGER_STEP_MS,
  EASING_SETTLE,
} from '../tokens'

const GRID_TILES = [
  { id: 'cars',      label: 'My Cars',   route: '/garage/cars',      src: iconMyCars    },
  { id: 'snapshot',  label: 'Snapshot',  route: '/garage/snapshot',  src: iconSnapshot  },
  { id: 'pdf',       label: 'Build PDF', route: '/garage/pdf',       src: iconBuildPdf  },
  { id: 'docs',      label: 'Docs',      route: '/garage/documents', src: iconDocs      },
  { id: 'contacts',  label: 'Contacts',  route: '/garage/contacts',  src: iconContacts  },
  { id: 'reminders', label: 'Reminders', route: '/garage/reminders', src: iconReminders },
]

export default function GaragePage() {
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [carInfo, setCarInfo] = useState<string | null>(null)
  const [hasCar, setHasCar] = useState<boolean | null>(null)
  const [pressed, setPressed] = useState<string | null>(null)
  const [bgLoaded, setBgLoaded] = useState(false)
  const bgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (bgRef.current?.complete) setBgLoaded(true)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const meta = data.user?.user_metadata
      const email = data.user?.email ?? ''
      const name = meta?.full_name ?? meta?.name ?? email.split('@')[0] ?? ''
      setDisplayName(name.charAt(0).toUpperCase() + name.slice(1))
    })
    getActiveCarId().then(carId => {
      if (!carId) {
        setHasCar(false)
        return
      }
      supabase
        .from('cars')
        .select('id, year, model')
        .eq('id', carId)
        .is('deleted_at', null)
        .single()
        .then(({ data }) => {
          if (data) {
            setHasCar(true)
            setCarInfo([data.year, data.model].filter(Boolean).join(' '))
          } else {
            setHasCar(false)
          }
        })
    })
  }, [])

  return (
    <div style={{
      height: '100dvh',
      position: 'relative',
      fontFamily: FONT_UI,
      overflow: 'hidden',
    }}>
      {/* Full-bleed garage photo */}
      <img
        ref={bgRef}
        src={garageHero}
        alt=""
        aria-hidden
        onLoad={() => setBgLoaded(true)}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: 'center 20%',
          opacity: bgLoaded ? 1 : 0,
          transition: 'opacity 350ms ease',
        }}
      />
      {/* Dark overlay — heavier at bottom so grid is readable */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, rgba(5,5,7,0.35) 0%, rgba(5,5,7,0.10) 35%, rgba(5,5,7,0.55) 65%, rgba(5,5,7,0.78) 100%)',
        pointerEvents: 'none',
      }} />
      <style>{`
        @keyframes iconFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes floorPulse {
          0%, 100% { opacity: 0.35; }
          50%       { opacity: 0.6;  }
        }
        @keyframes addPulse {
          0%, 100% { box-shadow: 0 0 8px rgba(200,102,26,0.35), 0 0 0 0 rgba(200,102,26,0.0); }
          50%       { box-shadow: 0 0 24px rgba(200,102,26,0.85), 0 0 0 14px rgba(200,102,26,0.14); }
        }
        .icon-tile { user-select: none; -webkit-touch-callout: none; touch-action: manipulation; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ position: 'relative', height: HEADER_HEIGHT, flexShrink: 0, zIndex: 10 }}>
        <svg
          viewBox="0 0 390 44"
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          <defs>
            <linearGradient id="garageHdrGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor={COLOR_BURGUNDY_L} />
              <stop offset="55%"  stopColor={COLOR_BURGUNDY_M} />
              <stop offset="100%" stopColor={COLOR_BURGUNDY_R} />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="390" height="44" fill={COLOR_HEADER_BLACK} />
          <path d={HEADER_WEDGE_LEFT}  fill="url(#garageHdrGrad)" />
          <path d={HEADER_WEDGE_RIGHT} fill="url(#garageHdrGrad)" />
        </svg>

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
            color: COLOR_HEADER_TITLE, fontFamily: FONT_UI,
            fontWeight: 800, fontSize: 13, letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            {displayName ? `${displayName}'s Garage` : 'Garage'}
          </span>
        </button>

        <div style={{ position: 'absolute', right: 0, top: 0, height: '100%', display: 'flex', alignItems: 'center', gap: 0, paddingRight: 14 }}>
          {carInfo && (
            <span style={{ paddingRight: 10, fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, color: COLOR_HEADER_WARM, letterSpacing: '0.04em', opacity: 0.75 }}>
              {carInfo}
            </span>
          )}
          <div style={{ background: 'rgba(242,238,228,0.94)', color: '#0d0d0d', padding: '4px 7px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>{MONTH_LABEL}</div>
          <div style={{ background: COLOR_HEADER_BLACK, color: '#fff', padding: '4px 8px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: DAY_LABEL.length === 1 ? 24 : 30 }}>{DAY_LABEL}</div>
        </div>
      </div>

      {/* Empty state — no car yet */}
      {hasCar === false && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          paddingTop: '30%',
          zIndex: 2, pointerEvents: 'none',
        }}>
          <div style={{
            width: '80%', height: '30%',
            background: 'radial-gradient(ellipse at 50% 70%, rgba(200,102,26,0.22) 0%, transparent 70%)',
            animation: 'floorPulse 3.5s ease-in-out infinite',
          }} />
        </div>
      )}

      {/* ── Dashboard grid — sits over lower portion of image ── */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        zIndex: 3,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: `${SPACE_SM}px ${SPACE_SM}px 37px`,
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridTemplateRows: 'repeat(2, auto)',
          gap: `${SPACE_LG}px ${SPACE_XS}px`,
          width: '100%',
        }}>
          {bgLoaded && GRID_TILES.map((tile, i) => (
            <button
              key={tile.id}
              onClick={() => navigate(tile.route)}
              className="icon-tile"
              onPointerDown={() => setPressed(tile.id)}
              onPointerUp={() => setPressed(null)}
              onPointerLeave={() => setPressed(null)}
              onPointerCancel={() => setPressed(null)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                animation: `iconFadeIn 550ms ${EASING_SETTLE} ${STAGGER_BASE_MS + i * STAGGER_STEP_MS}ms both`,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {/* Inner wrapper owns the press transform, separate from the fade-in animation */}
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                transform: pressed === tile.id ? 'scale(0.92)' : 'scale(1)',
                transition: pressed === tile.id ? 'transform 80ms ease-out' : 'transform 200ms cubic-bezier(0.22,1,0.36,1)',
              }}>
                {/* Icon tile + cast shadow */}
                <div style={{ position: 'relative', width: 126, height: 126 }}>
                  {/* Shadow entirely behind icon — shows through PNG transparency as a halo */}
                  <div style={{
                    position: 'absolute',
                    top: 90,
                    left: 63,
                    width: 66,
                    height: 60,
                    transform: 'translate(-50%, -50%) rotate(25deg) skewX(-14deg)',
                    background: 'rgba(0,0,0,1)',
                    opacity: CAST_SHADOW_OPACITY,
                    filter: 'blur(5px)',
                  }} />
                  {/* Icon — renders on top of shadow */}
                  <img src={tile.src} alt={tile.label}
                    style={{
                      position: 'absolute', top: 0, left: 0,
                      width: 126, height: 126,
                      objectFit: 'contain',
                      pointerEvents: 'none',
                    }}
                    draggable={false} />
                </div>
                {/* Label — zIndex above any shadow bleed */}
                <span style={{
                  fontFamily: FONT_UI, fontWeight: 700, fontSize: 11,
                  color: 'rgba(245,245,245,0.8)',
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  marginTop: -20, position: 'relative', zIndex: 1,
                }}>
                  {tile.label}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Add car prompt — centered in upper half */}
      {hasCar === false && (
        <div style={{
          position: 'absolute', top: HEADER_HEIGHT, left: 0, right: 0,
          bottom: '45%',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'flex-end',
          paddingBottom: SPACE_LG, zIndex: 4,
        }}>
          <button
            onClick={() => navigate('/garage/cars')}
            style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'rgba(200,102,26,0.22)',
              border: '1.5px solid rgba(200,102,26,0.75)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', marginBottom: SPACE_SM,
              animation: 'addPulse 3s ease-in-out infinite',
            }}
          >
            <span style={{ color: COLOR_ACCENT, fontSize: 26, fontWeight: 300, lineHeight: 1, marginTop: -1, textShadow: '0 0 10px rgba(200,102,26,0.9)' }}>+</span>
          </button>
          <p style={{
            fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 500,
            fontSize: 13.5, color: 'rgba(245,245,245,0.65)',
            textAlign: 'center', margin: 0, maxWidth: 210, lineHeight: 1.55,
          }}>
            When you're ready, tap here to place your car in the garage.
          </p>
        </div>
      )}
    </div>
  )
}
