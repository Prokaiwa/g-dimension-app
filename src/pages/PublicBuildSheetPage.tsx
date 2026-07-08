// Route: /builds/:username/buildsheet — read-only public mirror of the Build Sheet.
// Shows Power / Chassis / Exterior / Interior groups with mod names and brands.
// No costs, no edit affordances, no FAB, no photo picker.
// Resolves car from public_car_profiles (username + ?car param). Section photos
// are viewable in a swipe-to-dismiss lightbox but cannot be changed.
// Anon RLS gated: jobs are visible only when cars.is_public AND show_buildsheet_publicly
// (migration 053). Falls back to "Build Sheet is private" notice if empty.

const _now        = new Date()
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_LABEL = MONTHS[_now.getMonth()]
const DAY_LABEL   = String(_now.getDate())

import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ArrivalFade from '../components/ArrivalFade'
import garagePlaceholder from '../assets/garage_placeholder.webp'
import { MOD_GROUPS } from '../lib/buildGroups'
import {
  COLOR_HEADER_BLACK, COLOR_HEADER_WARM,
  COLOR_BURGUNDY_M, FONT_UI, FONT_TITLE, HEADER_HEIGHT,
  EASING_SETTLE,
} from '../tokens'

// 4 display groups — mirrors TuningBuildSheetPage
const NOISE_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`

const COLLAPSE_AT = 5

type Car = {
  id: string
  year: number | null
  make: string | null
  model: string | null
  garage_photo_url: string | null
  photo_y_offset: number | null
  horsepower: number | null
  torque: number | null
  weight_lbs: number | null
  build_sheet_power_photo: string | null
  build_sheet_chassis_photo: string | null
  build_sheet_exterior_photo: string | null
  build_sheet_interior_photo: string | null
  show_buildsheet_publicly: boolean
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
  componentCount: number
}

// Dyno count-up — same as TuningBuildSheetPage
function CountUp({ value, delay = 0 }: { value: number; delay?: number }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    let raf = 0
    const start = performance.now() + delay
    const dur = 700
    const step = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - start) / dur))
      setShown(Math.round(value * (1 - Math.pow(1 - k, 3))))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, delay])
  return <>{shown}</>
}

// Instagram-style pinch-to-zoom: image stays in the page, two fingers zoom it
// in place (up to 3×, centred on the pinch midpoint). Releasing snaps back.
// No tap-to-lightbox — the image is decorative, not interactive on single touch.
function SectionHeroPhoto({ url }: { url: string }) {
  const imgRef = useRef<HTMLImageElement>(null)
  const pinch  = useRef({ active: false, d0: 0, ox: 50, oy: 50, scale: 1 })

  const dist = (a: React.Touch, b: React.Touch) =>
    Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 2) return
    const p = pinch.current
    p.active = true
    p.d0 = dist(e.touches[0], e.touches[1])
    p.scale = 1
    const rect = imgRef.current?.getBoundingClientRect()
    if (rect) {
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2
      p.ox = ((mx - rect.left) / rect.width)  * 100
      p.oy = ((my - rect.top)  / rect.height) * 100
    }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    const p = pinch.current
    if (!p.active || e.touches.length !== 2) return
    e.preventDefault()
    const d = dist(e.touches[0], e.touches[1])
    p.scale = Math.min(3, Math.max(1, d / p.d0))
    const el = imgRef.current
    if (el) {
      el.style.transition = 'none'
      el.style.transformOrigin = `${p.ox}% ${p.oy}%`
      el.style.transform = `scale(${p.scale})`
    }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length >= 2) return
    pinch.current.active = false
    const el = imgRef.current
    if (el) {
      el.style.transition = 'transform 380ms cubic-bezier(0.22,1,0.36,1)'
      el.style.transform = 'scale(1)'
    }
  }

  return (
    <div
      style={{
        width: '100%', height: 195,
        position: 'relative', overflow: 'hidden',
        flexShrink: 0, marginBottom: 16,
        touchAction: 'pan-x pan-y',   // allow page scroll; pinch handled manually
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <img
        ref={imgRef}
        src={url}
        alt=""
        draggable={false}
        loading="lazy"
        decoding="async"
        style={{
          width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: 'center',
          display: 'block',
          opacity: 0,
          transition: 'opacity 350ms ease',
          userSelect: 'none',
          WebkitUserSelect: 'none' as React.CSSProperties['WebkitUserSelect'],
        }}
        onLoad={e => { e.currentTarget.style.opacity = '1' }}
      />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 48,
        background: 'linear-gradient(to bottom, transparent, rgba(13,13,15,0.72))',
        pointerEvents: 'none',
      }} />
    </div>
  )
}

function ModList({
  mods,
  expanded,
  onToggleExpand,
  onTap,
}: {
  mods: Mod[]
  expanded: boolean
  onToggleExpand: () => void
  onTap: (mod: Mod) => void
}) {
  const [pressedId, setPressedId] = useState<string | null>(null)
  const visible = expanded ? mods : mods.slice(0, COLLAPSE_AT)
  const hiddenCount = mods.length - COLLAPSE_AT

  return (
    <div>
      {visible.map((mod) => (
        <div
          key={mod.id}
          onClick={() => onTap(mod)}
          onPointerDown={() => setPressedId(mod.id)}
          onPointerUp={() => setPressedId(null)}
          onPointerLeave={() => setPressedId(null)}
          onPointerCancel={() => setPressedId(null)}
          style={{
            padding: '10px 0 10px 8px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            borderLeft: pressedId === mod.id ? '2px solid rgba(200,102,26,0.5)' : '2px solid transparent',
            opacity: pressedId === mod.id ? 0.6 : 1,
            transition: 'opacity 80ms ease, border-left-color 80ms ease',
            WebkitTapHighlightColor: 'transparent',
            touchAction: 'manipulation',
            cursor: 'pointer',
          }}
        >
          <div style={{
            fontFamily: FONT_UI, fontWeight: 600, fontSize: 14,
            color: 'rgba(180,192,205,0.88)',
            lineHeight: 1.3,
          }}>
            {mod.title}
          </div>
          {mod.brand && (
            <div style={{
              fontFamily: FONT_UI, fontSize: 11,
              color: 'rgba(245,240,228,0.28)', marginTop: 2,
            }}>
              {mod.brand}
            </div>
          )}
        </div>
      ))}

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

export default function PublicBuildSheetPage() {
  const navigate  = useNavigate()
  const { username } = useParams<{ username: string }>()
  const carParam  = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('car') ?? undefined
    : undefined

  const [car,       setCar]       = useState<Car | null>(null)
  const [carId,     setCarId]     = useState<string | null>(null)
  const [mods,      setMods]      = useState<Mod[]>([])
  const [modGroups, setModGroups] = useState<ModGroup[]>([])
  const [loading,   setLoading]   = useState(true)
  const [notFound,  setNotFound]  = useState(false)
  const [isPrivate, setIsPrivate] = useState(false)

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const toggleGroup = (groupId: string) =>
    setExpandedGroups(prev => {
      const next = new Set(prev)
      next.has(groupId) ? next.delete(groupId) : next.add(groupId)
      return next
    })


  useEffect(() => {
    let active = true
    async function load() {
      if (!username) { setNotFound(true); setLoading(false); return }

      // Query the view directly by username — avoids a separate users-table
      // lookup that would be blocked by anon RLS. The view already filters
      // is_public = true and joins to users.username.
      const { data: cars } = await supabase
        .from('public_car_profiles')
        .select('id, year, make, model, garage_photo_url, photo_y_offset, horsepower, torque, weight_lbs, build_sheet_power_photo, build_sheet_chassis_photo, build_sheet_exterior_photo, build_sheet_interior_photo, show_buildsheet_publicly, active_car_id')
        .eq('username', username)

      if (!active) return
      if (!cars || cars.length === 0) { setNotFound(true); setLoading(false); return }

      const activeId = (cars[0] as { active_car_id?: string }).active_car_id
      const chosen = (carParam ? cars.find(c => c.id === carParam) : null)
        ?? cars.find(c => c.id === activeId) ?? cars[0]
      if (!chosen) { setNotFound(true); setLoading(false); return }

      setCar(chosen as unknown as Car)
      setCarId(chosen.id)

      if (chosen.show_buildsheet_publicly === false) {
        setIsPrivate(true)
        setLoading(false)
        return
      }

      // Fetch mods (anon RLS gated via show_buildsheet_publicly in migration 053)
      const [{ data: modsData }, { data: sessData }] = await Promise.all([
        supabase
          .from('jobs')
          .select('id, title, brand, category, session_id')
          .eq('car_id', chosen.id)
          .eq('status', 'installed')
          .eq('type', 'modification')
          .order('date_installed', { ascending: false, nullsFirst: false }),
        supabase
          .from('sessions')
          .select('id, title, jobs(id, category)')
          .eq('car_id', chosen.id)
          .eq('type', 'modification')
          .not('title', 'is', null),
      ])

      if (!active) return

      setMods((modsData ?? []) as Mod[])

      function sessionGroupId(jobs: { category: string | null }[]): string {
        for (const j of jobs) {
          for (const g of MOD_GROUPS) {
            if (g.categories.includes(j.category ?? '')) return g.id
          }
        }
        return 'other'
      }

      const groups: ModGroup[] = ((sessData ?? []) as Array<{
        id: string; title: string; jobs: { id: string; category: string | null }[]
      }>).map(s => ({
        id: s.id,
        title: s.title,
        groupId: sessionGroupId(s.jobs ?? []),
        componentCount: (s.jobs ?? []).length,
      }))
      setModGroups(groups)
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [username, carParam])

  const back = () => navigate(`/builds/${username}${carId ? `?car=${carId}` : ''}`)

  const photoMap: Record<string, string | null | undefined> = car ? {
    power:    car.build_sheet_power_photo,
    chassis:  car.build_sheet_chassis_photo,
    exterior: car.build_sheet_exterior_photo,
    interior: car.build_sheet_interior_photo,
  } : {}

  const groupedJobSessionIds = new Set(modGroups.map(g => g.id))

  const activeGroups = MOD_GROUPS
    .map(g => {
      const soloMods = mods.filter(m =>
        g.categories.includes(m.category ?? '') &&
        !groupedJobSessionIds.has(m.session_id ?? '')
      )
      const groups = modGroups.filter(mg => mg.groupId === g.id)
      return { ...g, mods: soloMods, groups }
    })
    .filter(g => g.mods.length > 0 || g.groups.length > 0)

  return (
    <div style={{ minHeight: '100dvh', background: '#050507', display: 'flex', justifyContent: 'center' }}>
      <div style={{
        width: '100%', maxWidth: 440,
        height: '100dvh', display: 'flex', flexDirection: 'column',
        background: '#0d0d0f', overflow: 'hidden', position: 'relative',
      }}>
        <ArrivalFade />
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

        {/* ── Sheen + grain overlays ── */}
        <div style={{
          position: 'fixed', inset: 0, zIndex: 5, pointerEvents: 'none',
          background: [
            'radial-gradient(ellipse 70% 48% at 90% 94%, rgba(245,232,195,0.065) 0%, rgba(245,232,195,0.025) 48%, transparent 72%)',
            'radial-gradient(ellipse 55% 30% at 10% 6%, rgba(175,195,215,0.04) 0%, transparent 60%)',
          ].join(', '),
        }} />
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
          <button onClick={back} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 8px 4px 4px',
            WebkitTapHighlightColor: 'transparent',
          }}>
            <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
            <span style={{
              fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600,
              fontSize: 22, color: 'rgba(245,240,228,0.72)', letterSpacing: '0.01em',
            }}>
              Build Sheet
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
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 48, position: 'relative', zIndex: 6, animation: 'pageReveal 1100ms ease-in-out both' }}>

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
                // No-photo placeholder always reads as a dark/dimmed silhouette
                filter: car?.garage_photo_url ? undefined : 'brightness(0.12)',
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
                {(car?.horsepower || car?.torque || car?.weight_lbs) && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {car?.horsepower != null && (
                      <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 13, color: 'rgba(245,240,228,0.55)', lineHeight: 1.4 }}>
                        <CountUp value={car.horsepower} delay={350} />{' '}
                        <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>hp</span>
                      </span>
                    )}
                    {car?.torque != null && (
                      <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 13, color: 'rgba(245,240,228,0.55)', lineHeight: 1.4 }}>
                        <CountUp value={car.torque} delay={450} />{' '}
                        <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>lb-ft</span>
                      </span>
                    )}
                    {car?.weight_lbs != null && (
                      <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 13, color: 'rgba(245,240,228,0.55)', lineHeight: 1.4 }}>
                        <CountUp value={car.weight_lbs} delay={550} />{' '}
                        <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>lb</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── Private notice ── */}
            {isPrivate && (
              <div style={{
                padding: '48px 24px',
                textAlign: 'center',
                animation: `sectionIn 480ms ${EASING_SETTLE} 80ms both`,
              }}>
                <p style={{
                  fontFamily: FONT_UI, fontSize: 13,
                  color: 'rgba(245,240,228,0.28)',
                  lineHeight: 1.6, margin: 0,
                }}>
                  The Build Sheet for this car is private.
                </p>
              </div>
            )}

            {/* ── Empty state ── */}
            {!isPrivate && !notFound && activeGroups.length === 0 && (
              <div style={{
                padding: '48px 24px', textAlign: 'center',
                animation: `sectionIn 480ms ${EASING_SETTLE} 80ms both`,
              }}>
                <p style={{
                  fontFamily: FONT_UI, fontSize: 13,
                  color: 'rgba(245,240,228,0.28)',
                  lineHeight: 1.6, margin: 0,
                }}>
                  No mods logged yet.
                </p>
              </div>
            )}

            {/* ── Mod sections ── */}
            {!isPrivate && activeGroups.map((group, idx) => {
              const photoUrl   = photoMap[group.id] ?? null
              const isExpanded = expandedGroups.has(group.id)

              return (
                <div key={group.id} style={{
                  padding: '22px 16px 8px',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  animation: `sectionIn 480ms ${EASING_SETTLE} ${120 + idx * 90}ms both`,
                }}>
                  {/* Section header */}
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

                  {/* Section photo — pinch to zoom (Instagram-style), no tap-to-lightbox */}
                  {photoUrl ? (
                    <SectionHeroPhoto url={photoUrl} />
                  ) : null}

                  {/* Group cards (titled sessions) — read-only, no nav */}
                  {group.groups.map(mg => (
                    <div
                      key={mg.id}
                      style={{
                        padding: '10px 0 10px 8px',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        borderLeft: '2px solid transparent',
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
                        </div>
                      </div>
                    </div>
                  ))}

                  <ModList
                    mods={group.mods}
                    expanded={isExpanded}
                    onToggleExpand={() => toggleGroup(group.id)}
                    onTap={mod => navigate(`/builds/${username}/mods/${mod.id}${carParam ? `?car=${carParam}` : ''}`)}
                  />
                </div>
              )
            })}

          </div>
        )}


      </div>
    </div>
  )
}
