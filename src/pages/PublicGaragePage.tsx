// Route: /builds/:username/garage — read-only public mirror of the Garage.
// Same feel as the owner's /garage/cars: a swipeable car carousel (GT-style
// garage stage, cutout + showroom sweep) and a morphing Details sheet that the
// active card lifts/shrinks into. Public-safe only — no Add Car, no Edit, no
// Choose-as-active mutation, and no private fields (VIN, plate, costs, etc.).
// "Choose" simply re-points the public map/sub-screens at this car via ?car.
//
// All car data comes from public_car_profiles (anon RLS, migration 023/053/054),
// so a single up-front query covers both the carousel and the spec sheet.
import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getPublicSoldCars, soldCarName, type PublicSoldCar } from '../lib/carTransfers'
import { asMileageUnit, milesToUnit } from '../lib/mileage'
import { preloadImagesOnIdle } from '../lib/preloadImages'
import ArrivalFade from '../components/ArrivalFade'
import GarageStageBackdrop from '../components/GarageStageBackdrop'
import { formatPowerIn, formatTorqueIn } from '../lib/unitPrefs'
import garagePlaceholder from '../assets/garage_placeholder.webp'
import iconChoose from '../assets/icons/car-carousel/choose.png'
import iconDetails from '../assets/icons/car-carousel/details.png'
import {
  COLOR_CAVITY_BG,
  COLOR_HEADER_BLACK,
  COLOR_HEADER_WARM,
  COLOR_HEADER_TITLE,
  COLOR_BURGUNDY_M,
  COLOR_BRAND,
  COLOR_TEXT_SECONDARY,
  COLOR_ACCENT,
  FONT_UI,
  FONT_TITLE,
  HEADER_HEIGHT,
  SPACE_XS,
  SPACE_SM,
  SPACE_MD,
  SPACE_LG,
  SPACE_XL,
  EASING_SETTLE,
  RADIUS_BADGE,
} from '../tokens'

const _now        = new Date()
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_LABEL = MONTHS[_now.getMonth()]
const DAY_LABEL   = String(_now.getDate())

const FORCED_INDUCTION_LABELS: Record<string, string> = {
  none: 'None (N/A)', turbo: 'Turbo', 'twin-turbo': 'Twin Turbo',
  supercharged: 'Supercharged', 'e-boost': 'E-Boost', other: 'Other',
}
const TRANSMISSION_LABELS: Record<string, string> = {
  manual: 'Manual', automatic: 'Automatic', sequential: 'Sequential', cvt: 'CVT', other: 'Other',
}
const DRIVETRAIN_LABELS: Record<string, string> = {
  rwd: 'RWD', fwd: 'FWD', awd: 'AWD', '4wd': '4WD',
}

type Car = {
  id: string
  year: number | null
  make: string | null
  model: string | null
  variant: string | null
  trim: string | null
  nickname: string | null
  color: string | null
  current_mileage: number | null
  mileage_unit: string | null
  chassis_code: string | null
  engine_type: string | null
  forced_induction: string | null
  horsepower: number | null
  torque: number | null
  power_unit: string | null
  torque_unit: string | null
  transmission: string | null
  drivetrain: string | null
  purchase_date: string | null
  purchase_story: string | null
  garage_photo_url: string | null
  active_car_id: string | null
}

// ── One label/value line in the read-only spec sheet ──
function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: SPACE_MD, padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: COLOR_TEXT_SECONDARY, flexShrink: 0 }}>{label}</span>
      <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 14, color: 'rgba(245,240,228,0.92)', textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
    </div>
  )
}

function SpecGroup({ title, rows }: { title: string; rows: [string, string][] }) {
  const filled = rows.filter(([, v]) => v && v.trim() !== '')
  if (filled.length === 0) return null
  return (
    <div>
      <p style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(245,245,245,0.3)', margin: `0 0 ${SPACE_XS}px` }}>{title}</p>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        {filled.map(([label, value]) => <SpecRow key={label} label={label} value={value} />)}
      </div>
    </div>
  )
}

// ── Car stage (read-only — no add-photo affordance) ──
function CarStage({ src, placeholder, priority }: { src: string; placeholder?: boolean; priority?: boolean }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div style={{ position: 'relative', width: '88%' }}>
      <img
        src={src}
        alt=""
        decoding="async"
        // fetchpriority: visible car wins bandwidth over offscreen neighbors
        // (lowercase spread: React 18 types don't know the attribute yet)
        {...({ fetchpriority: priority ? 'high' : 'low' } as object)}
        onLoad={() => setLoaded(true)}
        style={{
          width: '100%', maxHeight: 200, objectFit: 'contain', objectPosition: 'bottom',
          display: 'block', position: 'relative', zIndex: 2,
          filter: placeholder ? 'brightness(0.12)' : 'drop-shadow(0px 8px 14px rgba(0,0,0,0.92))',
          opacity: loaded ? 1 : 0, transition: 'opacity 180ms ease',
        }}
      />
      {!placeholder && loaded && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none',
          WebkitMaskImage: `url(${src})`, maskImage: `url(${src})`,
          WebkitMaskSize: 'contain', maskSize: 'contain',
          WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'bottom', maskPosition: 'bottom',
          overflow: 'hidden',
        }}>
          <div className="gdim-ambient" style={{
            position: 'absolute', top: '-15%', left: 0, width: '45%', height: '130%',
            background: 'linear-gradient(100deg, transparent 0%, rgba(255,250,235,0.05) 30%, rgba(255,250,235,0.22) 50%, rgba(255,250,235,0.05) 70%, transparent 100%)',
            transform: 'translateX(-160%) skewX(-14deg)',
            animation: 'showroomSweep 14s ease-in-out 4s infinite',
          }} />
        </div>
      )}
    </div>
  )
}

export default function PublicGaragePage() {
  const navigate = useNavigate()
  const { username } = useParams<{ username: string }>()
  const carParam = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('car') ?? undefined
    : undefined

  const [cars, setCars]               = useState<Car[]>([])
  const [soldCars, setSoldCars]       = useState<PublicSoldCar[]>([])
  const [state, setState]             = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [retryTick, setRetryTick]     = useState(0)
  const [activeIdx, setActiveIdx]     = useState(0)
  const [showHints, setShowHints]     = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [pressedAction, setPressedAction] = useState<string | null>(null)
  const [sheetDragY, setSheetDragY]   = useState(0)
  const [sheetDragging, setSheetDragging] = useState(false)
  const sheetRef        = useRef<HTMLDivElement>(null)
  const detailScrollRef = useRef<HTMLDivElement>(null)
  const scrollRef       = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!username) { setState('empty'); return }
      const [{ data, error }, ghosts] = await Promise.all([
        supabase
          .from('public_car_profiles')
          .select('*')
          .eq('username', username)
          .order('created_at', { ascending: true }),
        getPublicSoldCars(username),   // sold "ghosts" — locked SOLD slides
      ])
      if (cancelled) return
      // A backend failure is NOT "no cars" — show a retryable error instead of
      // reading as an empty garage.
      if (error) { setState('error'); return }
      const rows = (data as Car[] | null) ?? []
      // A profile with only sold cars (all transferred away) still has ghosts to show.
      if (rows.length === 0 && ghosts.length === 0) { setState('empty'); return }
      // Move the target car (visitor-selected or owner's active) to position 0.
      const activeId = (rows[0] as Car | undefined)?.active_car_id ?? null
      const targetId = carParam ?? activeId ?? rows[0]?.id
      const idx = rows.findIndex(c => c.id === targetId)
      const ordered = idx > 0
        ? [rows[idx], ...rows.slice(0, idx), ...rows.slice(idx + 1)]
        : rows
      setCars(ordered)
      setSoldCars(ghosts)
      setState('ready')
      if (ordered.length + ghosts.length > 1) setShowHints(true)
    })()
    return () => { cancelled = true }
  }, [username, carParam, retryTick])

  useEffect(() => {
    if (!showHints) return
    const t = setTimeout(() => setShowHints(false), 3200)
    return () => clearTimeout(t)
  }, [showHints])

  // Idle-preload the neighbor cars' cutouts so a swipe lands on a warm image
  // (mirrors the private Garage carousel).
  useEffect(() => {
    return preloadImagesOnIdle([
      cars[activeIdx - 1]?.garage_photo_url,
      cars[activeIdx + 1]?.garage_photo_url,
    ])
  }, [activeIdx, cars])

  function onCarouselScroll() {
    const el = scrollRef.current; if (!el) return
    setActiveIdx(Math.round(el.scrollLeft / el.clientWidth))
  }

  // Drag-to-dismiss for the Details sheet (mirrors the private Garage exactly).
  useEffect(() => {
    const el = sheetRef.current
    if (!el) return
    let startY = 0, curY = 0, dragging = false, fromGrip = false
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0]; if (!t) return
      fromGrip = !!(e.target as HTMLElement).closest('[data-sheet-grip]')
      startY = t.clientY; curY = 0; dragging = false
    }
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0]; if (!t) return
      const dy = t.clientY - startY
      if (!dragging) {
        const atTop = (detailScrollRef.current?.scrollTop ?? 0) <= 0
        if ((fromGrip || atTop) && dy > 4) { dragging = true; setSheetDragging(true) }
        else return
      }
      if (dy <= 0) { curY = 0; setSheetDragY(0); return }
      e.preventDefault()
      curY = dy; setSheetDragY(dy)
    }
    const onEnd = () => {
      if (!dragging) return
      dragging = false
      setSheetDragging(false)
      if (curY > 110) setShowDetails(false)
      setSheetDragY(0)
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [state])   // re-bind once the sheet is actually mounted (after loading)

  const back = () => navigate(`/builds/${username}${carParam ? `?car=${carParam}` : ''}`)

  // ── Loading / empty ──
  if (state !== 'ready') {
    return (
      <div style={{ minHeight: '100dvh', background: COLOR_CAVITY_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, padding: 24, textAlign: 'center' }}>
        <style>{`@keyframes pubgspin{to{transform:rotate(360deg)}}`}</style>
        {state === 'loading' ? (
          <div style={{ width: 30, height: 30, borderRadius: '50%', border: '2.5px solid rgba(245,245,245,0.12)', borderTopColor: COLOR_BURGUNDY_M, animation: 'pubgspin 750ms linear infinite' }} />
        ) : state === 'error' ? (
          <>
            <div style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 17, color: 'rgba(245,245,245,0.85)' }}>Couldn't load this garage</div>
            <div style={{ fontFamily: FONT_UI, fontSize: 13, color: 'rgba(245,245,245,0.45)', maxWidth: 260, lineHeight: 1.5 }}>
              Something went wrong. Check your connection and try again.
            </div>
            <button onClick={() => { setState('loading'); setRetryTick(t => t + 1) }} style={{ marginTop: 8, padding: '9px 18px', borderRadius: 10, border: 'none', background: COLOR_BURGUNDY_M, color: '#f5f0ea', fontFamily: FONT_UI, fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', cursor: 'pointer' }}>Retry</button>
          </>
        ) : (
          <>
            <div style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 17, color: 'rgba(245,245,245,0.85)' }}>No cars to show</div>
            <div style={{ fontFamily: FONT_UI, fontSize: 13, color: 'rgba(245,245,245,0.45)', maxWidth: 260, lineHeight: 1.5 }}>
              {username ? `@${username} hasn't shared a car yet, or this garage is private.` : 'This garage is private.'}
            </div>
            <button onClick={back} style={{ marginTop: 8, padding: '9px 18px', borderRadius: 10, border: 'none', background: COLOR_BURGUNDY_M, color: '#f5f0ea', fontFamily: FONT_UI, fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', cursor: 'pointer' }}>Back</button>
          </>
        )}
      </div>
    )
  }

  return (
    <div style={{ height: '100dvh', background: COLOR_CAVITY_BG, position: 'relative', overflow: 'hidden', fontFamily: FONT_UI, display: 'flex', flexDirection: 'column' }}>
      <ArrivalFade />
      <style>{`
        @keyframes hintPulse { 0%,100%{opacity:0} 30%,70%{opacity:0.6} }
        @keyframes sheetSkeleton { 0%,100%{opacity:0.5} 50%{opacity:1} }
        @keyframes showroomSweep { 0%,88%{transform:translateX(-160%) skewX(-14deg)} 100%{transform:translateX(420%) skewX(-14deg)} }
        @media (prefers-reduced-motion: reduce){ .gdim-ambient{animation:none !important} }
        .hide-scrollbar{scrollbar-width:none}
        .hide-scrollbar::-webkit-scrollbar{display:none}
        .form-scroll{-webkit-overflow-scrolling:touch;scrollbar-width:none}
        .form-scroll::-webkit-scrollbar{display:none}
      `}</style>

      {/* ── Header — graphite bar + "Garage" (Cormorant italic), date chip ── */}
      <div style={{
        position: 'relative', height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingLeft: 10, paddingRight: 14, flexShrink: 0, zIndex: 10,
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}>
        <button onClick={back} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px 4px 4px', WebkitTapHighlightColor: 'transparent' }}>
          <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
          <span style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 22, color: 'rgba(245,240,228,0.72)', letterSpacing: '0.01em' }}>Garage</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, color: COLOR_HEADER_WARM, letterSpacing: '0.04em', opacity: 0.7, display: 'flex', alignItems: 'center', paddingRight: 10 }}>@{username}</span>
          <div style={{ background: 'rgba(242,238,228,0.94)', color: '#0d0d0d', padding: '4px 7px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>{MONTH_LABEL}</div>
          <div style={{ background: COLOR_BURGUNDY_M, color: '#fff', padding: '4px 8px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: DAY_LABEL.length === 1 ? 24 : 30 }}>{DAY_LABEL}</div>
        </div>
      </div>

      {/* ── CAROUSEL ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div ref={scrollRef} onScroll={onCarouselScroll} className="hide-scrollbar" style={{ display: 'flex', overflowX: showDetails ? 'hidden' : 'auto', scrollSnapType: 'x mandatory', height: '100%' }}>
          {cars.map((car, i) => {
            const detail = showDetails && i === activeIdx
            const t = detail ? (sheetDragging ? Math.max(0, 1 - sheetDragY / 400) : 1) : 0
            return (
              <div key={car.id} style={{ flex: '0 0 100%', height: '100%', scrollSnapAlign: 'start', position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'radial-gradient(ellipse 90% 55% at 50% 58%, #272420 0%, #141210 40%, #0d0b09 62%, #07070a 100%)' }}>

                {/* Top bar — logo + model (fades as Details opens) */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${SPACE_MD}px ${SPACE_MD}px ${SPACE_XS}px`, flexShrink: 0, position: 'relative', zIndex: 2, opacity: 1 - t, transition: sheetDragging ? 'none' : 'opacity 300ms ease', pointerEvents: detail ? 'none' : undefined }}>
                  <img
                    src={`/manufacturer_logos/${(car.make ?? '').toLowerCase().replace(/\s+/g, '-')}.png`}
                    alt={car.make ?? ''}
                    style={{ height: 51, width: 'auto', objectFit: 'contain', mixBlendMode: 'screen' }}
                    onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
                  />
                  <span style={{ fontFamily: FONT_UI, fontStyle: 'italic', fontWeight: 800, fontSize: 33, color: 'rgba(245,240,228,0.95)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                    {[car.model, car.variant].filter(Boolean).join(' ')}
                  </span>
                </div>

                {/* GT-style garage stage */}
                <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                  <GarageStageBackdrop />
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: '27%', zIndex: 2, transform: `translateY(${-20 * t}vh) scale(${1 - 0.2 * t})`, transformOrigin: 'center', transition: sheetDragging ? 'none' : `transform 460ms ${EASING_SETTLE}` }}>
                    <CarStage src={car.garage_photo_url || garagePlaceholder} placeholder={!car.garage_photo_url} priority={i === activeIdx} />
                  </div>
                  <div style={{ position: 'absolute', top: SPACE_XS, right: SPACE_MD, fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.14em', color: 'rgba(245,245,245,0.25)', textTransform: 'uppercase', zIndex: 5, opacity: 1 - t, transition: sheetDragging ? 'none' : 'opacity 300ms ease' }}>
                    {String(i + 1).padStart(2, '0')} / {String(cars.length).padStart(2, '0')}
                  </div>
                </div>

                {/* Info strip */}
                <div style={{ flexShrink: 0, background: 'rgba(5,5,7,0.9)', backdropFilter: 'blur(10px)', position: 'relative', zIndex: 2, opacity: 1 - t, transition: sheetDragging ? 'none' : 'opacity 300ms ease', pointerEvents: detail ? 'none' : undefined }}>
                  {/* Color */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: `5px ${SPACE_MD}px`, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {car.color && <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: COLOR_TEXT_SECONDARY }}>{car.color}</span>}
                  </div>
                  {/* Year / Trim / Mileage */}
                  <div style={{ display: 'flex', gap: SPACE_LG, alignItems: 'center', padding: `7px ${SPACE_MD}px`, borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.015)' }}>
                    <div style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
                      <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: COLOR_TEXT_SECONDARY }}>Year</span>
                      <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 15, color: 'rgba(245,240,228,0.9)' }}>{car.year}</span>
                    </div>
                    {car.trim && (
                      <div style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
                        <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: COLOR_TEXT_SECONDARY }}>Trim</span>
                        <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 15, color: 'rgba(245,240,228,0.9)' }}>{car.trim}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
                      <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: COLOR_TEXT_SECONDARY }}>Mileage</span>
                      <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 15, color: 'rgba(245,240,228,0.9)' }}>{car.current_mileage != null ? milesToUnit(car.current_mileage, asMileageUnit(car.mileage_unit)).toLocaleString() : '—'}</span>
                      <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: COLOR_TEXT_SECONDARY }}>{asMileageUnit(car.mileage_unit)}</span>
                    </div>
                  </div>
                  {/* Actions */}
                  <div style={{ display: 'flex', justifyContent: 'center', gap: SPACE_XL * 2, padding: `${SPACE_XS}px ${SPACE_MD}px ${SPACE_MD}px`, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {([
                      { src: iconChoose, label: 'Choose', onPress: () => navigate(`/builds/${username}?car=${cars[activeIdx].id}`) },
                      { src: iconDetails, label: 'Details', onPress: () => { setSheetDragY(0); setSheetDragging(false); setShowDetails(true) } },
                    ] as const).map(({ src, label, onPress }) => (
                      <button key={label} onClick={onPress}
                        onPointerDown={() => setPressedAction(label)}
                        onPointerUp={() => setPressedAction(null)}
                        onPointerLeave={() => setPressedAction(null)}
                        onPointerCancel={() => setPressedAction(null)}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center',
                          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                          WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation', userSelect: 'none',
                          transform: pressedAction === label ? 'scale(0.92)' : 'scale(1)',
                          transition: pressedAction === label ? 'transform 80ms ease-out' : 'transform 200ms cubic-bezier(0.22,1,0.36,1)',
                        }}>
                        <div style={{ position: 'relative', width: 101, height: 101 }}>
                          <div style={{ position: 'absolute', top: 74, left: 50, width: 57, height: 50, transform: 'translate(-50%,-50%) rotate(25deg) skewX(-14deg)', background: 'rgba(0,0,0,1)', opacity: 0.65, filter: 'blur(4px)' }} />
                          <img src={src} alt={label} draggable={false} style={{ position: 'absolute', top: 0, left: 0, width: 101, height: 101, objectFit: 'contain', pointerEvents: 'none' }} />
                        </div>
                        <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, color: 'rgba(245,245,245,0.8)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: -14, position: 'relative', zIndex: 1 }}>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            )
          })}

          {/* ── SOLD ghost slides (locked) ── structurally identical to a real car
              slide (same GT stage, car in its normal spot, same Details pull-up
              morph); a SOLD stamp sits over the car, and the only action is
              Details (which itself offers the Visit Build link). */}
          {soldCars.map((ghost, gi) => {
            const absIdx = cars.length + gi
            const detail = showDetails && absIdx === activeIdx
            const t = detail ? (sheetDragging ? Math.max(0, 1 - sheetDragY / 400) : 1) : 0
            return (
            <div key={ghost.id} style={{ flex: '0 0 100%', height: '100%', scrollSnapAlign: 'start', position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'radial-gradient(ellipse 90% 55% at 50% 58%, #272420 0%, #141210 40%, #0d0b09 62%, #07070a 100%)' }}>

              {/* Top bar — logo + model (fades as Details opens) */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${SPACE_MD}px ${SPACE_MD}px ${SPACE_XS}px`, flexShrink: 0, position: 'relative', zIndex: 2, opacity: 1 - t, transition: sheetDragging ? 'none' : 'opacity 300ms ease', pointerEvents: detail ? 'none' : undefined }}>
                <img
                  src={`/manufacturer_logos/${(ghost.snapshot_make ?? '').toLowerCase().replace(/\s+/g, '-')}.png`}
                  alt={ghost.snapshot_make ?? ''}
                  style={{ height: 51, width: 'auto', objectFit: 'contain', mixBlendMode: 'screen' }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
                />
                <span style={{ fontFamily: FONT_UI, fontStyle: 'italic', fontWeight: 800, fontSize: 33, color: 'rgba(245,240,228,0.95)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                  {[ghost.snapshot_model, ghost.snapshot_variant].filter(Boolean).join(' ')}
                </span>
              </div>

              {/* GT-style garage stage (same as real cars) */}
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                <GarageStageBackdrop />
                {/* Car — same position/lift as real cars; SOLD stamp rides on top */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: '27%', zIndex: 2, transform: `translateY(${-20 * t}vh) scale(${1 - 0.2 * t})`, transformOrigin: 'center', transition: sheetDragging ? 'none' : `transform 460ms ${EASING_SETTLE}` }}>
                  <div style={{ position: 'relative', width: '88%' }}>
                    <img
                      src={ghost.snapshot_photo_url || garagePlaceholder}
                      alt=""
                      style={{ width: '100%', maxHeight: 200, objectFit: 'contain', objectPosition: 'bottom', display: 'block', filter: 'grayscale(0.4) brightness(0.82) drop-shadow(0px 8px 14px rgba(0,0,0,0.92))' }}
                    />
                    <div style={{ position: 'absolute', top: '45%', left: '50%', transform: 'translate(-50%,-50%) rotate(-8deg)', border: `3px solid ${COLOR_BRAND}`, color: COLOR_BRAND, borderRadius: RADIUS_BADGE, padding: '3px 16px', fontFamily: FONT_UI, fontWeight: 900, fontSize: 30, letterSpacing: '0.14em', opacity: 0.95, background: 'rgba(10,8,8,0.35)', boxShadow: '0 2px 12px rgba(0,0,0,0.6)', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                      SOLD
                    </div>
                  </div>
                </div>
                <div style={{ position: 'absolute', top: SPACE_XS, right: SPACE_MD, fontFamily: FONT_UI, fontWeight: 800, fontSize: 10, letterSpacing: '0.16em', color: COLOR_BRAND, textTransform: 'uppercase', zIndex: 5, opacity: 1 - t, transition: sheetDragging ? 'none' : 'opacity 300ms ease' }}>
                  Sold
                </div>
              </div>

              {/* Info strip — minimal (Color / Trim only; Year lives in Details), single Details action */}
              <div style={{ flexShrink: 0, background: 'rgba(5,5,7,0.9)', backdropFilter: 'blur(10px)', position: 'relative', zIndex: 2, opacity: 1 - t, transition: sheetDragging ? 'none' : 'opacity 300ms ease', pointerEvents: detail ? 'none' : undefined }}>
                {(ghost.snapshot_color || ghost.snapshot_trim) && (
                  <div style={{ display: 'flex', gap: SPACE_LG, alignItems: 'center', padding: `7px ${SPACE_MD}px`, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {ghost.snapshot_color && <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: COLOR_TEXT_SECONDARY }}>{ghost.snapshot_color}</span>}
                    {ghost.snapshot_trim && (
                      <div style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
                        <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: COLOR_TEXT_SECONDARY }}>Trim</span>
                        <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 15, color: 'rgba(245,240,228,0.9)' }}>{ghost.snapshot_trim}</span>
                      </div>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'center', padding: `${SPACE_XS}px ${SPACE_MD}px ${SPACE_MD}px`, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <button onClick={() => { setSheetDragY(0); setSheetDragging(false); setShowDetails(true) }}
                    onPointerDown={() => setPressedAction(`gd-${ghost.id}`)}
                    onPointerUp={() => setPressedAction(null)}
                    onPointerLeave={() => setPressedAction(null)}
                    onPointerCancel={() => setPressedAction(null)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                      WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation', userSelect: 'none',
                      transform: pressedAction === `gd-${ghost.id}` ? 'scale(0.92)' : 'scale(1)',
                      transition: pressedAction === `gd-${ghost.id}` ? 'transform 80ms ease-out' : 'transform 200ms cubic-bezier(0.22,1,0.36,1)',
                    }}>
                    <div style={{ position: 'relative', width: 101, height: 101 }}>
                      <div style={{ position: 'absolute', top: 74, left: 50, width: 57, height: 50, transform: 'translate(-50%,-50%) rotate(25deg) skewX(-14deg)', background: 'rgba(0,0,0,1)', opacity: 0.65, filter: 'blur(4px)' }} />
                      <img src={iconDetails} alt="Details" draggable={false} style={{ position: 'absolute', top: 0, left: 0, width: 101, height: 101, objectFit: 'contain', pointerEvents: 'none' }} />
                    </div>
                    <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, color: 'rgba(245,245,245,0.8)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: -14, position: 'relative', zIndex: 1 }}>Details</span>
                  </button>
                </div>
              </div>

            </div>
            )
          })}
        </div>

        {showHints && activeIdx < cars.length + soldCars.length && (
          <>
            {activeIdx > 0 && (
              <div style={{ position: 'absolute', left: SPACE_SM, top: '50%', transform: 'translateY(-50%)', zIndex: 5, animation: `hintPulse 1.6s ${EASING_SETTLE} 2`, pointerEvents: 'none' }}>
                <span style={{ color: 'rgba(245,245,245,0.7)', fontSize: 32, fontWeight: 300 }}>‹</span>
              </div>
            )}
            {activeIdx < cars.length + soldCars.length - 1 && (
              <div style={{ position: 'absolute', right: SPACE_SM, top: '50%', transform: 'translateY(-50%)', zIndex: 5, animation: `hintPulse 1.6s ${EASING_SETTLE} 2`, pointerEvents: 'none' }}>
                <span style={{ color: 'rgba(245,245,245,0.7)', fontSize: 32, fontWeight: 300 }}>›</span>
              </div>
            )}
          </>
        )}

        {cars.length + soldCars.length > 1 && (
          <div style={{ position: 'absolute', bottom: 6, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6, zIndex: 5, pointerEvents: 'none' }}>
            {[...cars, ...soldCars].map((_, i) => (
              <div key={i} style={{ width: i === activeIdx ? 16 : 4, height: 4, background: i === activeIdx ? COLOR_BURGUNDY_M : 'rgba(255,255,255,0.2)', transition: '300ms ease', borderRadius: 2 }} />
            ))}
          </div>
        )}
      </div>

      {/* Tap-outside-to-close — covers the car area above the sheet */}
      {showDetails && (
        <div
          onClick={() => setShowDetails(false)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: '54%', zIndex: 19 }}
        />
      )}

      {/* ── DETAILS SHEET — morphs out of the active card ── */}
      {(() => {
        const car = cars[activeIdx]
        // When the active slide is a SOLD ghost, the same sheet shows its frozen
        // snapshot + Visit Build instead of the live car spec sheet.
        const activeGhost = !car && activeIdx >= cars.length
          ? soldCars[activeIdx - cars.length] ?? null
          : null
        const identity: [string, string][] = car ? [
          ['Paint Color', car.color ?? ''],
          ['Nickname', car.nickname ?? ''],
          ['Variant', car.variant ?? ''],
          ['Trim', car.trim ?? ''],
          ['Mileage', car.current_mileage != null ? `${milesToUnit(car.current_mileage, asMileageUnit(car.mileage_unit)).toLocaleString()} ${asMileageUnit(car.mileage_unit)}` : ''],
        ] : []
        const specs: [string, string][] = car ? [
          ['Chassis Code', car.chassis_code ?? ''],
          ['Engine', car.engine_type ?? ''],
          ['Forced Induction', car.forced_induction && car.forced_induction !== 'none' ? (FORCED_INDUCTION_LABELS[car.forced_induction] ?? car.forced_induction) : ''],
          ['Horsepower', car.horsepower != null ? formatPowerIn(car.horsepower, car.power_unit) : ''],
          ['Torque', car.torque != null ? formatTorqueIn(car.torque, car.torque_unit) : ''],
          ['Transmission', car.transmission ? (TRANSMISSION_LABELS[car.transmission] ?? '') : ''],
          ['Drivetrain', car.drivetrain ? (DRIVETRAIN_LABELS[car.drivetrain] ?? '') : ''],
        ] : []
        const purchase: [string, string][] = car ? [
          ['Purchase Date', car.purchase_date ?? ''],
        ] : []
        const hasStory = !!car?.purchase_story && car.purchase_story.trim() !== ''
        const anyFilled = [...identity, ...specs, ...purchase].some(([, v]) => v && v.trim() !== '') || hasStory
        return (
          <div
            ref={sheetRef}
            style={{
              position: 'absolute', left: 0, right: 0, top: '46%', bottom: 0, zIndex: 20,
              display: 'flex', flexDirection: 'column',
              background: '#0b0b0d', borderTopLeftRadius: 14, borderTopRightRadius: 14,
              boxShadow: '0 -12px 34px rgba(0,0,0,0.6)',
              transform: showDetails ? `translateY(${sheetDragY}px)` : 'translateY(110%)',
              transition: sheetDragging ? 'none' : `transform 460ms ${EASING_SETTLE}`,
              willChange: 'transform',
              pointerEvents: showDetails ? 'auto' : 'none',
            }}
          >
            <div data-sheet-grip style={{ flexShrink: 0, touchAction: 'none', WebkitTapHighlightColor: 'transparent', cursor: 'grab' }}>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '11px 0 7px' }}>
                <div style={{ width: 40, height: 4, borderRadius: 9999, background: 'rgba(245,245,245,0.22)' }} />
              </div>
              {car && (
                <div style={{ padding: `0 ${SPACE_MD}px ${SPACE_SM}px` }}>
                  <p style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 27, color: COLOR_HEADER_TITLE, margin: '0 0 3px', lineHeight: 1.1 }}>
                    {car.year} {car.model}
                  </p>
                  <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, color: 'rgba(245,245,245,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>
                    {car.make}
                  </p>
                </div>
              )}
              {!car && activeGhost && (
                <div style={{ padding: `0 ${SPACE_MD}px ${SPACE_SM}px`, display: 'flex', alignItems: 'baseline', gap: SPACE_SM }}>
                  <span style={{ fontFamily: FONT_UI, fontWeight: 900, fontSize: 11, letterSpacing: '0.16em', color: COLOR_BRAND, border: `1.5px solid ${COLOR_BRAND}`, borderRadius: RADIUS_BADGE, padding: '1px 7px' }}>SOLD</span>
                  <p style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 24, color: COLOR_HEADER_TITLE, margin: 0, lineHeight: 1.1 }}>{soldCarName(activeGhost)}</p>
                </div>
              )}
            </div>

            <div ref={detailScrollRef} className="form-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehaviorY: 'contain', touchAction: 'pan-y', padding: `${SPACE_SM}px ${SPACE_MD}px 0` }}>
              {activeGhost ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_LG }}>
                  <SpecGroup title="Snapshot" rows={[
                    ['Year', activeGhost.snapshot_year != null ? String(activeGhost.snapshot_year) : ''],
                    ['Paint Color', activeGhost.snapshot_color ?? ''],
                    ['Variant', activeGhost.snapshot_variant ?? ''],
                    ['Trim', activeGhost.snapshot_trim ?? ''],
                  ]} />
                  <SpecGroup title="Sale" rows={[
                    ['Sold To', activeGhost.buyer_username ? `@${activeGhost.buyer_username}` : ''],
                    ['Date', new Date(activeGhost.sold_at).toLocaleDateString()],
                  ]} />
                  <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 13, color: 'rgba(245,245,245,0.45)', lineHeight: 1.6, margin: 0 }}>
                    This car was sold. Its build lives on with the new owner.
                  </p>
                </div>
              ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_LG }}>
                <SpecGroup title="Identity" rows={identity} />
                <SpecGroup title="Vehicle Specs" rows={specs} />
                <SpecGroup title="Purchase Info" rows={purchase} />
                {hasStory && (
                  <div>
                    <p style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(245,245,245,0.3)', margin: `0 0 ${SPACE_SM}px` }}>Origin Story</p>
                    <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontStyle: 'italic', fontSize: 14.5, color: 'rgba(245,240,228,0.78)', lineHeight: 1.65, margin: 0 }}>{car?.purchase_story}</p>
                  </div>
                )}
                {!anyFilled && (
                  <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 13, color: 'rgba(245,245,245,0.4)', lineHeight: 1.6, margin: 0 }}>
                    No public details for this car yet.
                  </p>
                )}
              </div>
              )}
              <div style={{ height: SPACE_MD }} />
            </div>

            {/* Footer — ghost gets a single Visit Build CTA; real cars have none here (Choose/Details live on the card) */}
            {activeGhost && activeGhost.buyer_username && (
              <div style={{ flexShrink: 0, padding: `${SPACE_SM}px ${SPACE_MD}px ${SPACE_LG}px`, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <button onClick={() => navigate(`/builds/${activeGhost.buyer_username}${activeGhost.car_id ? `?car=${activeGhost.car_id}` : ''}`)}
                  style={{ width: '100%', padding: '14px', background: COLOR_ACCENT, border: 'none', color: '#fff', fontFamily: FONT_UI, fontWeight: 800, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                  Visit @{activeGhost.buyer_username}'s Build
                </button>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
