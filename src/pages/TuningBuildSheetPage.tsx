// Route: /tuning/build-sheet — Hot Version spec card: the machine on display

const _now        = new Date()
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_LABEL = MONTHS[_now.getMonth()]
const DAY_LABEL   = String(_now.getDate())

import { useState, useEffect } from 'react'
import { useNavigate }          from 'react-router-dom'
import { supabase }             from '../lib/supabase'
import { getActiveCarId }       from '../lib/activeCar'
import { playBack }             from '../lib/sound'
import garagePlaceholder        from '../assets/garage_placeholder.png'
import iconEngine      from '../assets/icons/tuning/tuning_engine.png'
import iconDrivetrain  from '../assets/icons/tuning/tuning_drivetrain.png'
import iconSuspension  from '../assets/icons/tuning/tuning_suspension.png'
import iconBrakes      from '../assets/icons/tuning/tuning_brakes.png'
import iconWheels      from '../assets/icons/tuning/tuning_wheels.png'
import iconForcedInduction from '../assets/icons/tuning/forced_induction.png'
import iconExhaust          from '../assets/icons/tuning/exhaust.png'
import iconCooling          from '../assets/icons/tuning/cooling.png'
import iconFuelSystem       from '../assets/icons/tuning/fuel_system.png'
import iconLighting         from '../assets/icons/tuning/tuning_lighting.png'
import iconAudio            from '../assets/icons/tuning/audio.png'
import iconSafety           from '../assets/icons/tuning/safety.png'
import iconExterior         from '../assets/icons/tuning/tuning_exterior.png'
import iconPaint            from '../assets/icons/tuning/paint.png'
import iconInterior         from '../assets/icons/tuning/tuning_interior.png'
import {
  COLOR_HEADER_BLACK, COLOR_HEADER_WARM, COLOR_HEADER_TITLE,
  COLOR_BURGUNDY_M, COLOR_ACCENT, FONT_UI, FONT_TITLE, HEADER_HEIGHT,
  EASING_SETTLE,
} from '../tokens'

// Exported so TuningBlueprintPage, TuningPartsPage, TuningAddPage can import
// ids MUST match part_categories.name in Supabase (FK constraint from migration 025)
export const TUNING_CATEGORIES: { id: string; label: string; icon: string | null }[] = [
  { id: 'Engine',           label: 'Engine',     icon: iconEngine          },
  { id: 'Drivetrain',       label: 'Drivetrain', icon: iconDrivetrain      },
  { id: 'Suspension',       label: 'Suspension', icon: iconSuspension      },
  { id: 'Brakes',           label: 'Brakes',     icon: iconBrakes          },
  { id: 'Wheels & Tires',   label: 'Wheels',     icon: iconWheels          },
  { id: 'Forced Induction', label: 'Forced Ind', icon: iconForcedInduction },
  { id: 'Exhaust',          label: 'Exhaust',    icon: iconExhaust         },
  { id: 'Cooling',          label: 'Cooling',    icon: iconCooling         },
  { id: 'Fuel System',      label: 'Fuel',       icon: iconFuelSystem      },
  { id: 'Lighting',         label: 'Lighting',   icon: iconLighting        },
  { id: 'Audio',            label: 'Audio',      icon: iconAudio           },
  { id: 'Safety',           label: 'Safety',     icon: iconSafety          },
  { id: 'Exterior',         label: 'Exterior',   icon: iconExterior        },
  { id: 'Paint & Wrap',     label: 'Paint',      icon: iconPaint           },
  { id: 'Interior',         label: 'Interior',   icon: iconInterior        },
  { id: 'Other',            label: 'Other',      icon: null                },
]

// 4 display groups (frontend-only, no DB equivalent). Electrical legacy data → Power.
const MOD_GROUPS = [
  { id: 'power',    label: 'Power',    categories: ['Engine','Drivetrain','Forced Induction','Exhaust','Cooling','Fuel System','Electrical'] },
  { id: 'chassis',  label: 'Chassis',  categories: ['Suspension','Brakes','Wheels & Tires'] },
  { id: 'exterior', label: 'Exterior', categories: ['Exterior','Paint & Wrap','Lighting'] },
  { id: 'interior', label: 'Interior', categories: ['Interior','Audio','Safety'] },
  { id: 'other',    label: 'Other',    categories: ['Other'] },
]

const GROUP_PHOTO_COL: Record<string, string> = {
  power:    'build_sheet_power_photo',
  chassis:  'build_sheet_chassis_photo',
  exterior: 'build_sheet_exterior_photo',
  interior: 'build_sheet_interior_photo',
}

type Car = {
  id: string
  year: number | null
  make: string | null
  model: string | null
  variant: string | null
  garage_photo_url: string | null
  photo_y_offset: number | null
  horsepower: number | null
  torque: number | null
  weight_lbs: number | null
  build_sheet_power_photo: string | null
  build_sheet_chassis_photo: string | null
  build_sheet_exterior_photo: string | null
  build_sheet_interior_photo: string | null
}

type Mod = {
  id: string
  title: string
  brand: string | null
  category: string | null
  session_id: string | null
}

type ModGroup = {
  id: string
  title: string
  groupId: string
  date_performed: string | null
  total_cost: number | null
  componentCount: number
}

const COLLAPSE_AT = 5

// ── Noise grain data URI (fractal noise → analog zine texture) ────────────
const NOISE_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`

// ── Sub-components ────────────────────────────────────────────────────────

function SectionHeroPhoto({ url, onTap }: { url: string; onTap: () => void }) {
  return (
    <div
      onClick={onTap}
      style={{
        width: '100%', height: 195,
        position: 'relative', overflow: 'hidden',
        cursor: 'pointer', flexShrink: 0,
        marginBottom: 16,
      }}
    >
      <img
        src={url}
        alt=""
        draggable={false}
        style={{
          width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: 'center',
          display: 'block',
          opacity: 0,
          transition: 'opacity 350ms ease',
        }}
        onLoad={e => { e.currentTarget.style.opacity = '1' }}
      />
      {/* Bottom fade to ground the list below */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 48,
        background: 'linear-gradient(to bottom, transparent, rgba(13,13,15,0.72))',
        pointerEvents: 'none',
      }} />
    </div>
  )
}

function SectionPhotoPlaceholder({ onClick }: { onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        width: '100%', height: 72,
        border: '1px dashed rgba(245,240,228,0.09)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: onClick ? 'pointer' : 'default',
        marginBottom: 16,
        background: 'rgba(255,255,255,0.012)',
      }}
    >
      <span style={{
        fontFamily: FONT_UI, fontWeight: 700, fontSize: 9,
        letterSpacing: '0.18em', textTransform: 'uppercase',
        color: onClick ? 'rgba(245,240,228,0.2)' : 'rgba(245,240,228,0.07)',
      }}>
        {onClick ? '+ Set Section Photo' : ''}
      </span>
    </div>
  )
}

function ModList({
  mods,
  navigate,
  expanded,
  onToggleExpand,
}: {
  mods: Mod[]
  navigate: (path: string) => void
  expanded: boolean
  onToggleExpand: () => void
}) {
  const [pressedId, setPressedId] = useState<string | null>(null)
  const visible = expanded ? mods : mods.slice(0, COLLAPSE_AT)
  const hiddenCount = mods.length - COLLAPSE_AT

  return (
    <div>
      {visible.map((mod) => (
        <div
          key={mod.id}
          onClick={() => navigate(`/tuning/mods/${mod.id}`)}
          onPointerDown={() => setPressedId(mod.id)}
          onPointerUp={() => setPressedId(null)}
          onPointerLeave={() => setPressedId(null)}
          onPointerCancel={() => setPressedId(null)}
          style={{
            padding: '10px 0 10px 8px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            borderLeft: pressedId === mod.id
              ? '2px solid rgba(105,12,22,0.7)'
              : '2px solid transparent',
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
            touchAction: 'manipulation',
            opacity: pressedId === mod.id ? 0.6 : 1,
            transition: 'opacity 80ms ease, border-left-color 80ms ease',
          }}
        >
          <div style={{
            fontFamily: FONT_UI, fontWeight: 600, fontSize: 14,
            color: 'rgba(180,192,205,0.88)',
            lineHeight: 1.3,
          }}>
            {mod.title}
          </div>
        </div>
      ))}

      {/* Expand / collapse toggle */}
      {!expanded && hiddenCount > 0 && (
        <button
          onClick={onToggleExpand}
          style={{
            display: 'block', width: '100%',
            padding: '13px 8px',
            background: 'none', border: 'none',
            cursor: 'pointer', textAlign: 'left',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <span style={{
            fontFamily: FONT_UI, fontWeight: 700, fontSize: 11,
            letterSpacing: '0.1em',
            color: 'rgba(245,240,228,0.26)',
          }}>
            — {hiddenCount} more mod{hiddenCount !== 1 ? 's' : ''} —
          </span>
        </button>
      )}
      {expanded && mods.length > COLLAPSE_AT && (
        <button
          onClick={onToggleExpand}
          style={{
            display: 'block', width: '100%',
            padding: '13px 8px',
            background: 'none', border: 'none',
            cursor: 'pointer', textAlign: 'left',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <span style={{
            fontFamily: FONT_UI, fontWeight: 700, fontSize: 11,
            letterSpacing: '0.1em',
            color: 'rgba(245,240,228,0.18)',
          }}>
            — show less —
          </span>
        </button>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function TuningBuildSheetPage() {
  const navigate = useNavigate()
  const [car, setCar]           = useState<Car | null>(null)
  const [mods, setMods]         = useState<Mod[]>([])
  const [modGroups, setModGroups] = useState<ModGroup[]>([])
  const [loading, setLoading]   = useState(true)
  const [pressed, setPressed]   = useState(false)

  // Expand/collapse per group
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const toggleGroup = (groupId: string) =>
    setExpandedGroups(prev => {
      const next = new Set(prev)
      next.has(groupId) ? next.delete(groupId) : next.add(groupId)
      return next
    })

  // Lightbox
  const [lightboxUrl,   setLightboxUrl]   = useState<string | null>(null)
  const [lightboxGroup, setLightboxGroup] = useState<string | null>(null)
  const openLightbox = (url: string, groupId: string) => {
    setLightboxUrl(url)
    setLightboxGroup(groupId)
  }
  const closeLightbox = () => { setLightboxUrl(null); setLightboxGroup(null) }

  // Photo picker
  const [pickerGroup,   setPickerGroup]   = useState<string | null>(null)
  const [pickerPhotos,  setPickerPhotos]  = useState<{ id: string; photo_url: string }[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)

  const openPicker = async (groupId: string) => {
    if (!car?.id) return
    setPickerGroup(groupId)
    setPickerLoading(true)
    setPickerPhotos([])
    const cats = MOD_GROUPS.find(g => g.id === groupId)?.categories ?? []
    const { data: jobRows } = await supabase
      .from('jobs')
      .select('id')
      .eq('car_id', car.id)
      .in('category', cats)
    const jobIds = (jobRows ?? []).map((j: { id: string }) => j.id)
    if (jobIds.length > 0) {
      const { data: photos } = await supabase
        .from('job_photos')
        .select('id, photo_url')
        .in('job_id', jobIds)
      setPickerPhotos((photos ?? []) as { id: string; photo_url: string }[])
    }
    setPickerLoading(false)
  }

  const closePicker = () => setPickerGroup(null)

  const handlePickPhoto = async (url: string) => {
    if (!car?.id || !pickerGroup) return
    const col = GROUP_PHOTO_COL[pickerGroup]
    if (!col) return
    await supabase.from('cars').update({ [col]: url }).eq('id', car.id)
    setCar(c => c ? { ...c, [col]: url } : c)
    closePicker()
  }

  useEffect(() => {
    async function load() {
      const carId = await getActiveCarId()
      if (!carId) { setLoading(false); return }

      const [{ data: carData }, { data: modsData }, { data: sessData }] = await Promise.all([
        supabase
          .from('cars')
          .select('id, year, make, model, variant, garage_photo_url, photo_y_offset, horsepower, torque, weight_lbs, build_sheet_power_photo, build_sheet_chassis_photo, build_sheet_exterior_photo, build_sheet_interior_photo')
          .eq('id', carId)
          .single(),
        supabase
          .from('jobs')
          .select('id, title, brand, category, session_id')
          .eq('car_id', carId)
          .eq('status', 'installed')
          .eq('type', 'modification')
          .order('date_installed', { ascending: false, nullsFirst: false }),
        supabase
          .from('sessions')
          .select('id, title, date_performed, total_cost, jobs(id, category)')
          .eq('car_id', carId)
          .eq('type', 'modification')
          .not('title', 'is', null)
          .order('date_performed', { ascending: false, nullsFirst: false }),
      ])

      if (carData) setCar(carData as unknown as Car)
      setMods(modsData ?? [])

      // Derive which MOD_GROUP section a session belongs to from its jobs' categories
      function sessionGroupId(jobs: { category: string | null }[]): string {
        for (const j of jobs) {
          for (const g of MOD_GROUPS) {
            if (g.categories.includes(j.category ?? '')) return g.id
          }
        }
        return 'other'
      }

      // Build ModGroup list from titled sessions
      const groups: ModGroup[] = ((sessData ?? []) as Array<{
        id: string; title: string; date_performed: string | null;
        total_cost: number | null; jobs: { id: string; category: string | null }[]
      }>).map(s => ({
        id: s.id,
        title: s.title,
        groupId: sessionGroupId(s.jobs ?? []),
        date_performed: s.date_performed,
        total_cost: s.total_cost,
        componentCount: (s.jobs ?? []).length,
      }))
      setModGroups(groups)
      setLoading(false)
    }
    load()
  }, [])

  const photoMap: Record<string, string | null | undefined> = car ? {
    power:    car.build_sheet_power_photo,
    chassis:  car.build_sheet_chassis_photo,
    exterior: car.build_sheet_exterior_photo,
    interior: car.build_sheet_interior_photo,
  } : {}

  // Job IDs that belong to a titled session (shown as a group card, not solo)
  const groupedJobSessionIds = new Set(modGroups.map(g => g.id))

  const activeGroups = MOD_GROUPS
    .map(g => {
      // Solo mods: installed jobs not belonging to a titled session
      const soloMods = mods.filter(m =>
        g.categories.includes(m.category ?? '') &&
        !groupedJobSessionIds.has(m.session_id ?? '')
      )
      // Group entries: titled sessions whose derived section matches this group
      const groups = modGroups.filter(mg => mg.groupId === g.id)
      return { ...g, mods: soloMods, groups }
    })
    .filter(g => g.mods.length > 0 || g.groups.length > 0)

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#0d0d0f', overflow: 'hidden', position: 'relative' }}>
      <style>{`
        @keyframes sectionIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pageReveal {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      {/* ── Magazine sheen + grain overlays (pointer-events: none) ── */}
      {/* Fixed so the light source stays in place as you scroll — like a physical magazine */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 5, pointerEvents: 'none',
        background: [
          // Warm sun-bounce — bottom-right corner, angled ellipse
          'radial-gradient(ellipse 70% 48% at 90% 94%, rgba(245,232,195,0.065) 0%, rgba(245,232,195,0.025) 48%, transparent 72%)',
          // Cool ambient — top-left, GT4 blue filter
          'radial-gradient(ellipse 55% 30% at 10% 6%, rgba(175,195,215,0.04) 0%, transparent 60%)',
        ].join(', '),
      }} />
      {/* Grain layer — fractal noise at low opacity, screen blend for dark backgrounds */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 4, pointerEvents: 'none',
        backgroundImage: NOISE_SVG,
        backgroundSize: '220px 220px',
        opacity: 0.028,
        mixBlendMode: 'screen',
      }} />

      {/* ── Header ── */}
      <div style={{
        height: HEADER_HEIGHT, flexShrink: 0,
        background: COLOR_HEADER_BLACK,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingLeft: 10, paddingRight: 14,
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        position: 'relative', zIndex: 10,
      }}>
        <button onClick={() => { playBack(); navigate('/tuning') }} style={{
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
      {!loading && (
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 96, position: 'relative', zIndex: 6, animation: 'pageReveal 1100ms ease-in-out both' }}>

          {/* ── Hero: car photo + identity ── */}
          <div style={{
            padding: '24px 16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            display: 'flex', alignItems: 'flex-start', gap: 14,
            animation: `sectionIn 480ms ${EASING_SETTLE} 40ms both`,
          }}>
            <div style={{
              flexShrink: 0, width: 185, height: 138,
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
                {[car?.year, car?.model, car?.variant].filter(Boolean).join(' ') || 'Unknown'}
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
              {(car?.horsepower || car?.torque || car?.weight_lbs) && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {car?.horsepower != null && (
                    <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 13, color: 'rgba(245,240,228,0.55)', lineHeight: 1.4 }}>
                      {car.horsepower}{' '}
                      <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>hp</span>
                    </span>
                  )}
                  {car?.torque != null && (
                    <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 13, color: 'rgba(245,240,228,0.55)', lineHeight: 1.4 }}>
                      {car.torque}{' '}
                      <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>lb-ft</span>
                    </span>
                  )}
                  {car?.weight_lbs != null && (
                    <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 13, color: 'rgba(245,240,228,0.55)', lineHeight: 1.4 }}>
                      {car.weight_lbs}{' '}
                      <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>lb</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Mod sections — vertical hero layout ── */}
          {activeGroups.map((group, idx) => {
            const photoUrl     = photoMap[group.id] ?? null
            const hasPhotoCol  = !!GROUP_PHOTO_COL[group.id]
            const isExpanded   = expandedGroups.has(group.id)

            return (
              <div key={group.id} style={{
                padding: '22px 16px 8px',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                animation: `sectionIn 480ms ${EASING_SETTLE} ${120 + idx * 90}ms both`,
              }}>

                {/* Section header — editorial label */}
                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: 10,
                  marginBottom: 14,
                }}>
                  <span style={{
                    fontFamily: FONT_UI, fontWeight: 900, fontSize: 11,
                    letterSpacing: '0.22em', textTransform: 'uppercase',
                    color: 'rgba(245,240,228,0.55)',
                  }}>
                    {group.label}
                  </span>
                </div>

                {/* Section photo — full width hero */}
                {photoUrl ? (
                  <SectionHeroPhoto
                    url={photoUrl}
                    onTap={() => hasPhotoCol && openLightbox(photoUrl, group.id)}
                  />
                ) : (
                  hasPhotoCol && (
                    <SectionPhotoPlaceholder onClick={() => openPicker(group.id)} />
                  )
                )}

                {/* Group cards (titled sessions) */}
                {group.groups.map(mg => (
                  <div
                    key={mg.id}
                    onClick={() => navigate(`/tuning/mod-group/${mg.id}`)}
                    style={{
                      padding: '10px 0 10px 8px',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      borderLeft: '2px solid transparent',
                      cursor: 'pointer',
                      WebkitTapHighlightColor: 'transparent',
                      display: 'flex', alignItems: 'center',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: FONT_UI, fontWeight: 600, fontSize: 14,
                        color: 'rgba(180,192,205,0.88)', lineHeight: 1.3,
                      }}>
                        {mg.title}
                      </div>
                      <div style={{
                        fontFamily: FONT_UI, fontSize: 11,
                        color: 'rgba(245,240,228,0.28)', marginTop: 2,
                      }}>
                        {mg.componentCount} component{mg.componentCount !== 1 ? 's' : ''}
                        {mg.total_cost != null ? ` · $${Number(mg.total_cost).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : ''}
                      </div>
                    </div>
                    <span style={{ color: 'rgba(245,240,228,0.2)', fontSize: 14, flexShrink: 0 }}>›</span>
                  </div>
                ))}

                {/* Solo mod list */}
                <ModList
                  mods={group.mods}
                  navigate={navigate}
                  expanded={isExpanded}
                  onToggleExpand={() => toggleGroup(group.id)}
                />

              </div>
            )
          })}

        </div>
      )}

      {/* ── Lightbox — tap photo → full view → Change button ── */}
      {lightboxUrl && (
        <div
          onClick={closeLightbox}
          style={{
            position: 'fixed', inset: 0, zIndex: 70,
            background: 'rgba(0,0,0,0.96)',
            display: 'flex', flexDirection: 'column',
          }}
        >
          {/* Close */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 60,
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            padding: '0 16px',
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.65), transparent)',
            zIndex: 10, pointerEvents: 'none',
          }}>
            <button
              onClick={e => { e.stopPropagation(); closeLightbox() }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 8, pointerEvents: 'auto',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span style={{ color: 'rgba(245,240,228,0.55)', fontSize: 30, fontWeight: 200, lineHeight: 1 }}>×</span>
            </button>
          </div>

          {/* Photo — full natural dimensions, pinch-zoomable */}
          <div
            onClick={e => e.stopPropagation()}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'auto', touchAction: 'pinch-zoom',
              padding: '60px 0 80px',
            }}
          >
            <img
              src={lightboxUrl}
              alt=""
              draggable={false}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          </div>

          {/* Change button — owner only (this page is always auth-protected) */}
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              padding: '12px 20px 36px',
              background: 'linear-gradient(to top, rgba(0,0,0,0.8) 60%, transparent)',
            }}
          >
            <button
              onClick={() => {
                closeLightbox()
                if (lightboxGroup) openPicker(lightboxGroup)
              }}
              style={{
                width: '100%', padding: '13px 0',
                background: 'transparent',
                border: '1px solid rgba(245,240,228,0.18)',
                cursor: 'pointer',
                fontFamily: FONT_UI, fontWeight: 700, fontSize: 11,
                letterSpacing: '0.16em', textTransform: 'uppercase',
                color: 'rgba(245,240,228,0.5)',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              Change Photo
            </button>
          </div>
        </div>
      )}

      {/* ── Photo picker modal ── */}
      {pickerGroup && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.88)',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            height: 52, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.55)' }}>
              {MOD_GROUPS.find(g => g.id === pickerGroup)?.label} Photo
            </span>
            <button onClick={closePicker} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, WebkitTapHighlightColor: 'transparent' }}>
              <span style={{ color: 'rgba(245,240,228,0.4)', fontSize: 22, fontWeight: 300, lineHeight: 1 }}>×</span>
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {pickerLoading ? (
              <p style={{ fontFamily: FONT_UI, fontSize: 11, color: 'rgba(245,240,228,0.25)', letterSpacing: '0.1em', textAlign: 'center', paddingTop: 40 }}>LOADING…</p>
            ) : pickerPhotos.length === 0 ? (
              <p style={{ fontFamily: FONT_UI, fontSize: 13, color: 'rgba(245,240,228,0.3)', textAlign: 'center', paddingTop: 40, lineHeight: 1.6 }}>
                No photos yet.{'\n'}Log a mod with photos first.
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                {pickerPhotos.map(p => (
                  <div
                    key={p.id}
                    onClick={() => handlePickPhoto(p.photo_url)}
                    style={{
                      aspectRatio: '1', backgroundImage: `url(${p.photo_url})`,
                      backgroundSize: 'cover', backgroundPosition: 'center',
                      cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
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
            position: 'fixed', right: 20, bottom: 30, zIndex: 20,
            width: 54, height: 54, borderRadius: '50%',
            background: 'rgba(200,102,26,0.12)',
            border: '1.5px solid rgba(200,102,26,0.55)',
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
