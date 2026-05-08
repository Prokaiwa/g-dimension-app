// Route: /tuning/build-sheet — Installed mods spec view
const _now        = new Date()
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_LABEL = MONTHS[_now.getMonth()]
const DAY_LABEL   = String(_now.getDate())

import { useState, useEffect } from 'react'
import { useNavigate }          from 'react-router-dom'
import { supabase }             from '../lib/supabase'
import iconEngine      from '../assets/icons/tuning/tuning_engine.png'
import iconDrivetrain  from '../assets/icons/tuning/tuning_drivetrain.png'
import iconSuspension  from '../assets/icons/tuning/tuning_suspension.png'
import iconBrakes      from '../assets/icons/tuning/tuning_brakes.png'
import iconWheels      from '../assets/icons/tuning/tuning_wheels.png'
import iconExhaust     from '../assets/icons/tuning/exhaust.png'
import iconCooling     from '../assets/icons/tuning/cooling.png'
import iconFuelSystem  from '../assets/icons/tuning/fuel_system.png'
import iconIntake      from '../assets/icons/tuning/tuning_intake.png'
import iconElectrical  from '../assets/icons/tuning/tuning_lighting.png'
import iconAudio       from '../assets/icons/tuning/audio.png'
import iconSafety      from '../assets/icons/tuning/safety.png'
import iconExterior    from '../assets/icons/tuning/tuning_exterior.png'
import iconPaint       from '../assets/icons/tuning/paint.png'
import iconInterior    from '../assets/icons/tuning/tuning_interior.png'
import {
  COLOR_HEADER_BLACK, COLOR_HEADER_WARM, COLOR_HEADER_TITLE,
  COLOR_BURGUNDY_L, COLOR_BURGUNDY_M, COLOR_BURGUNDY_R,
  FONT_UI, HEADER_HEIGHT, HEADER_WEDGE_LEFT, HEADER_WEDGE_RIGHT,
  STAGGER_BASE_MS, STAGGER_STEP_MS, EASING_SETTLE,
} from '../tokens'

export const TUNING_CATEGORIES = [
  { id: 'Engine',      label: 'Engine',     icon: iconEngine      },
  { id: 'Drivetrain',  label: 'Drivetrain', icon: iconDrivetrain  },
  { id: 'Suspension',  label: 'Suspension', icon: iconSuspension  },
  { id: 'Brakes',      label: 'Brakes',     icon: iconBrakes      },
  { id: 'Wheels',      label: 'Wheels',     icon: iconWheels      },
  { id: 'Exhaust',     label: 'Exhaust',    icon: iconExhaust     },
  { id: 'Cooling',     label: 'Cooling',    icon: iconCooling     },
  { id: 'Fuel System', label: 'Fuel',       icon: iconFuelSystem  },
  { id: 'Intake',      label: 'Intake',     icon: iconIntake      },
  { id: 'Electrical',  label: 'Electrical', icon: iconElectrical  },
  { id: 'Audio',       label: 'Audio',      icon: iconAudio       },
  { id: 'Safety',      label: 'Safety',     icon: iconSafety      },
  { id: 'Exterior',    label: 'Exterior',   icon: iconExterior    },
  { id: 'Paint',       label: 'Paint',      icon: iconPaint       },
  { id: 'Interior',    label: 'Interior',   icon: iconInterior    },
]

type Mod = {
  id: string
  title: string
  brand: string | null
  category: string | null
  date_installed: string | null
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00')
  return `${MONTHS[dt.getMonth()].toUpperCase()} '${String(dt.getFullYear()).slice(2)}`
}

export default function TuningBuildSheetPage() {
  const navigate = useNavigate()
  const [mods, setMods]       = useState<Mod[]>([])
  const [loading, setLoading] = useState(true)
  const [pressed, setPressed] = useState<string | null>(null)

  useEffect(() => {
    const carId = localStorage.getItem('gdim_chosen_car_id')
    if (!carId) { setLoading(false); return }
    supabase
      .from('jobs')
      .select('id, title, brand, category, date_installed')
      .eq('car_id', carId)
      .eq('status', 'installed')
      .eq('type', 'modification')
      .order('date_installed', { ascending: false, nullsFirst: false })
      .then(({ data }) => { setMods(data ?? []); setLoading(false) })
  }, [])

  const hasMods = !loading && mods.length > 0

  const grouped = TUNING_CATEGORIES
    .map(cat => ({ ...cat, mods: mods.filter(m => m.category === cat.id) }))
    .filter(cat => cat.mods.length > 0)

  const press   = (id: string) => setPressed(id)
  const release = () => setPressed(null)

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#0d0d0f', overflow: 'hidden', position: 'relative' }}>
      <style>{`
        @keyframes tileIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .cat-tile { touch-action: manipulation; user-select: none; -webkit-touch-callout: none; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ position: 'relative', height: HEADER_HEIGHT, flexShrink: 0, zIndex: 10 }}>
        <svg viewBox="0 0 390 44" preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <defs>
            <linearGradient id="bsHdrGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor={COLOR_BURGUNDY_L} />
              <stop offset="55%"  stopColor={COLOR_BURGUNDY_M} />
              <stop offset="100%" stopColor={COLOR_BURGUNDY_R} />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="390" height="44" fill={COLOR_HEADER_BLACK} />
          <path d={HEADER_WEDGE_LEFT}  fill="url(#bsHdrGrad)" />
          <path d={HEADER_WEDGE_RIGHT} fill="url(#bsHdrGrad)" />
        </svg>
        <button onClick={() => navigate('/tuning')} style={{
          position: 'absolute', left: 10, top: 0, height: '100%',
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
        }}>
          <span style={{ color: COLOR_HEADER_WARM, fontSize: 20, fontWeight: 300, lineHeight: 1 }}>‹</span>
          <span style={{ color: COLOR_HEADER_TITLE, fontFamily: FONT_UI, fontStyle: 'italic', fontWeight: 800, fontSize: 20, letterSpacing: '-0.05em' }}>
            Build Sheet
          </span>
        </button>
        <div style={{ position: 'absolute', right: 0, top: 0, height: '100%', display: 'flex', alignItems: 'center', paddingRight: 14 }}>
          <div style={{ background: 'rgba(242,238,228,0.94)', color: '#0d0d0d', padding: '4px 7px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>{MONTH_LABEL}</div>
          <div style={{ background: COLOR_HEADER_BLACK, color: '#fff', padding: '4px 8px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: DAY_LABEL.length === 1 ? 24 : 30 }}>{DAY_LABEL}</div>
        </div>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: FONT_UI, fontSize: 11, color: 'rgba(245,240,228,0.2)', letterSpacing: '0.12em' }}>LOADING</span>
        </div>

      ) : hasMods ? (
        /* ── Filled: spec list ── */
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 96 }}>
          {grouped.map(cat => (
            <div key={cat.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <img src={cat.icon} alt="" style={{ width: 16, height: 16, objectFit: 'contain', opacity: 0.6, pointerEvents: 'none' }} />
                <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(200,160,80,0.75)' }}>
                  {cat.label}
                </span>
              </div>
              {cat.mods.map(mod => (
                <div key={mod.id}
                  onClick={() => navigate(`/tuning/mods/${mod.id}`)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {mod.brand && (
                      <div style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 10, letterSpacing: '0.08em', color: 'rgba(245,240,228,0.3)', marginBottom: 2 }}>
                        {mod.brand.toUpperCase()}
                      </div>
                    )}
                    <div style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 14, color: 'rgba(245,240,228,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {mod.title}
                    </div>
                  </div>
                  <span style={{ fontFamily: FONT_UI, fontWeight: 400, fontSize: 11, color: 'rgba(200,160,80,0.65)', letterSpacing: '0.04em', marginLeft: 12, flexShrink: 0 }}>
                    {fmtDate(mod.date_installed)}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>

      ) : (
        /* ── Empty: category grid ── */
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 18px 48px' }}>

          {/* Phosphorous green + Add Mods */}
          <button
            onClick={() => navigate('/tuning/add')}
            onPointerDown={() => press('add')} onPointerUp={release} onPointerLeave={release} onPointerCancel={release}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              marginBottom: 40, padding: 0,
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'manipulation', userSelect: 'none',
              transform: pressed === 'add' ? 'scale(0.92)' : 'scale(1)',
              transition: pressed === 'add' ? 'transform 80ms ease-out' : 'transform 200ms cubic-bezier(0.22,1,0.36,1)',
            }}
          >
            <span style={{ fontSize: 56, fontWeight: 200, lineHeight: 0.9, color: '#39ff14', textShadow: '0 0 20px rgba(57,255,20,0.5), 0 0 40px rgba(57,255,20,0.2)' }}>+</span>
            <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#39ff14' }}>Add Mods</span>
          </button>

          {/* 3×5 category grid */}
          <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {TUNING_CATEGORIES.map((cat, i) => (
              <button
                key={cat.id}
                className="cat-tile"
                onClick={() => navigate(`/tuning/add?category=${encodeURIComponent(cat.id)}`)}
                onPointerDown={() => press(cat.id)} onPointerUp={release} onPointerLeave={release} onPointerCancel={release}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  animation: `tileIn 400ms ${EASING_SETTLE} ${STAGGER_BASE_MS + i * STAGGER_STEP_MS}ms both`,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  transform: pressed === cat.id ? 'scale(0.92)' : 'scale(1)',
                  transition: pressed === cat.id ? 'transform 80ms ease-out' : 'transform 200ms cubic-bezier(0.22,1,0.36,1)',
                }}>
                  <div style={{ width: 72, height: 72, background: '#111113', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img src={cat.icon} alt={cat.label} draggable={false}
                      style={{ width: 50, height: 50, objectFit: 'contain', pointerEvents: 'none' }} />
                  </div>
                  <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.5)' }}>
                    {cat.label}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── FAB (filled state) ── */}
      {hasMods && (
        <button
          onClick={() => navigate('/tuning/add')}
          onPointerDown={() => press('fab')} onPointerUp={release} onPointerLeave={release} onPointerCancel={release}
          style={{
            position: 'absolute', right: 20, bottom: 30,
            width: 54, height: 54, borderRadius: '50%',
            background: 'rgba(57,255,20,0.1)',
            border: '1.5px solid rgba(57,255,20,0.55)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
            boxShadow: '0 0 18px rgba(57,255,20,0.18)',
            transform: pressed === 'fab' ? 'scale(0.92)' : 'scale(1)',
            transition: pressed === 'fab' ? 'transform 80ms ease-out' : 'transform 200ms cubic-bezier(0.22,1,0.36,1)',
          }}
        >
          <span style={{ fontSize: 28, fontWeight: 200, lineHeight: 1, color: '#39ff14', marginTop: -2 }}>+</span>
          <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 7, letterSpacing: '0.1em', color: '#39ff14', lineHeight: 1 }}>MODS</span>
        </button>
      )}
    </div>
  )
}
