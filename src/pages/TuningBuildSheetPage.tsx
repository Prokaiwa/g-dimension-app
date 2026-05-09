// Route: /tuning/build-sheet — Hot Version spec card: the machine on display

const _now        = new Date()
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_LABEL = MONTHS[_now.getMonth()]
const DAY_LABEL   = String(_now.getDate())

import { useState, useEffect } from 'react'
import { useNavigate }          from 'react-router-dom'
import { supabase }             from '../lib/supabase'
import garagePlaceholder        from '../assets/garage_placeholder.png'
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
  COLOR_BURGUNDY_M, COLOR_ACCENT, FONT_UI, FONT_TITLE, HEADER_HEIGHT,
} from '../tokens'

// Exported so TuningBlueprintPage, TuningPartsPage, TuningAddPage can import
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

// 4 display groups — empty sections are hidden
const MOD_GROUPS = [
  { id: 'power',    label: 'Power',    categories: ['Engine','Drivetrain','Exhaust','Cooling','Fuel System','Intake'] },
  { id: 'chassis',  label: 'Chassis',  categories: ['Suspension','Brakes','Wheels'] },
  { id: 'exterior', label: 'Exterior', categories: ['Exterior','Paint'] },
  { id: 'interior', label: 'Interior', categories: ['Interior','Audio','Safety','Electrical'] },
]

type Car = {
  id: string
  year: number | null
  make: string | null
  model: string | null
  garage_photo_url: string | null
  photo_y_offset: number | null
  horsepower: number | null
  torque: number | null
}

type Mod = {
  id: string
  title: string
  brand: string | null
  category: string | null
}

// Grey placeholder for section photos (to be wired up in a later step)
function SectionPhotoPlaceholder() {
  return (
    <div style={{
      width: 130, height: 130, flexShrink: 0,
      background: '#1e1e20',
      border: '1px solid rgba(255,255,255,0.06)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{
        fontFamily: FONT_UI, fontWeight: 700, fontSize: 8,
        letterSpacing: '0.14em', textTransform: 'uppercase',
        color: 'rgba(245,240,228,0.12)',
      }}>Photo</span>
    </div>
  )
}

function ModList({ mods }: { mods: Mod[] }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {mods.map((mod, i) => (
        <div key={mod.id} style={{ marginBottom: i < mods.length - 1 ? 10 : 0 }}>
          <div style={{
            fontFamily: FONT_UI, fontWeight: 600, fontSize: 12,
            color: 'rgba(180,192,205,0.82)',
            lineHeight: 1.35,
          }}>
            {mod.brand ? `${mod.brand} · ${mod.title}` : mod.title}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function TuningBuildSheetPage() {
  const navigate = useNavigate()
  const [car, setCar]         = useState<Car | null>(null)
  const [mods, setMods]       = useState<Mod[]>([])
  const [loading, setLoading] = useState(true)
  const [pressed, setPressed] = useState(false)

  useEffect(() => {
    const carId = localStorage.getItem('gdim_chosen_car_id')
    if (!carId) { setLoading(false); return }

    Promise.all([
      supabase
        .from('cars')
        .select('id, year, make, model, garage_photo_url, photo_y_offset, horsepower, torque')
        .eq('id', carId)
        .single(),
      supabase
        .from('jobs')
        .select('id, title, brand, category')
        .eq('car_id', carId)
        .eq('status', 'installed')
        .eq('type', 'modification')
        .order('date_installed', { ascending: false, nullsFirst: false }),
    ]).then(([{ data: carData }, { data: modsData }]) => {
      if (carData) setCar(carData as unknown as Car)
      setMods(modsData ?? [])
      setLoading(false)
    })
  }, [])

  const activeGroups = MOD_GROUPS
    .map(g => ({ ...g, mods: mods.filter(m => g.categories.includes(m.category ?? '')) }))
    .filter(g => g.mods.length > 0)

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#0d0d0f', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{
        height: HEADER_HEIGHT, flexShrink: 0,
        background: COLOR_HEADER_BLACK,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingLeft: 10, paddingRight: 14,
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        position: 'relative', zIndex: 10,
      }}>
        <button onClick={() => navigate('/tuning')} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '4px 8px 4px 4px',
          WebkitTapHighlightColor: 'transparent',
        }}>
          <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
          <span style={{
            fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600,
            fontSize: 22, color: COLOR_HEADER_TITLE, letterSpacing: '0.01em',
          }}>
            Where you are.
          </span>
        </button>
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          <div style={{
            background: 'rgba(242,238,228,0.94)', color: '#0d0d0d',
            padding: '4px 7px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11,
            letterSpacing: '0.05em', textTransform: 'uppercase',
            display: 'flex', alignItems: 'center',
          }}>{MONTH_LABEL}</div>
          <div style={{
            background: COLOR_BURGUNDY_M, color: '#fff',
            padding: '4px 8px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minWidth: DAY_LABEL.length === 1 ? 24 : 30,
          }}>{DAY_LABEL}</div>
        </div>
      </div>

      {/* ── Body ── */}
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: FONT_UI, fontSize: 11, color: 'rgba(245,240,228,0.2)', letterSpacing: '0.12em' }}>LOADING</span>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 96 }}>

          {/* ── Hero: car photo + identity ── */}
          <div style={{
            padding: '24px 16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            display: 'flex', alignItems: 'flex-start', gap: 14,
          }}>
            <div style={{
              flexShrink: 0, width: 150, height: 110,
              backgroundImage: `url(${car?.garage_photo_url ?? garagePlaceholder}), radial-gradient(ellipse 100% 70% at 50% 45%, #484848 0%, #282828 55%, #0d0d0f 100%)`,
              backgroundSize: 'contain, cover',
              backgroundPosition: `center ${car?.photo_y_offset ?? 50}%, center`,
              backgroundRepeat: 'no-repeat, no-repeat',
            }} />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', paddingTop: 4 }}>
              <p style={{
                fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600,
                fontSize: 26, letterSpacing: '-0.01em', lineHeight: 1.1,
                color: 'rgba(245,240,228,0.95)', margin: 0,
              }}>
                {[car?.year, car?.model].filter(Boolean).join(' ') || 'Unknown'}
              </p>
              {car?.make && (
                <p style={{
                  fontFamily: FONT_UI, fontWeight: 700, fontSize: 10,
                  letterSpacing: '0.14em', textTransform: 'uppercase',
                  color: 'rgba(245,240,228,0.32)', margin: '4px 0 0',
                }}>
                  {car.make}
                </p>
              )}
              {(car?.horsepower || car?.torque) && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {car?.horsepower != null && (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                      <span style={{
                        fontFamily: FONT_UI, fontWeight: 800, fontSize: 18,
                        color: 'rgba(245,240,228,0.92)', lineHeight: 1,
                      }}>{car.horsepower}</span>
                      <span style={{
                        fontFamily: FONT_UI, fontWeight: 700, fontSize: 9,
                        letterSpacing: '0.12em', textTransform: 'uppercase',
                        color: 'rgba(200,160,80,0.7)',
                      }}>hp</span>
                    </div>
                  )}
                  {car?.torque != null && (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                      <span style={{
                        fontFamily: FONT_UI, fontWeight: 800, fontSize: 18,
                        color: 'rgba(245,240,228,0.92)', lineHeight: 1,
                      }}>{car.torque}</span>
                      <span style={{
                        fontFamily: FONT_UI, fontWeight: 700, fontSize: 9,
                        letterSpacing: '0.12em', textTransform: 'uppercase',
                        color: 'rgba(200,160,80,0.7)',
                      }}>lb-ft</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Mod sections (alternating layout) ── */}
          {activeGroups.map((group, idx) => {
            const photoRight = idx % 2 === 0  // even: details left, photo right
            return (
              <div key={group.id} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '20px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
              }}>
                {photoRight ? (
                  <>
                    <ModList mods={group.mods} />
                    <SectionPhotoPlaceholder />
                  </>
                ) : (
                  <>
                    <SectionPhotoPlaceholder />
                    <ModList mods={group.mods} />
                  </>
                )}
              </div>
            )
          })}

        </div>
      )}

      {/* ── Add Mods FAB ── */}
      {!loading && (
        <button
          onClick={() => navigate('/tuning/add')}
          onPointerDown={() => setPressed(true)}
          onPointerUp={() => setPressed(false)}
          onPointerLeave={() => setPressed(false)}
          onPointerCancel={() => setPressed(false)}
          style={{
            position: 'absolute', right: 20, bottom: 30,
            width: 54, height: 54, borderRadius: '50%',
            background: 'rgba(200,102,26,0.12)',
            border: `1.5px solid rgba(200,102,26,0.55)`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
            boxShadow: '0 0 18px rgba(200,102,26,0.2)',
            transform: pressed ? 'scale(0.92)' : 'scale(1)',
            transition: pressed ? 'transform 80ms ease-out' : 'transform 200ms cubic-bezier(0.22,1,0.36,1)',
          }}
        >
          <span style={{ fontSize: 28, fontWeight: 200, lineHeight: 1, color: COLOR_ACCENT, marginTop: -2 }}>+</span>
          <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 7, letterSpacing: '0.1em', color: COLOR_ACCENT, lineHeight: 1 }}>MODS</span>
        </button>
      )}

    </div>
  )
}
