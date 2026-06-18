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
import ArrivalFade from '../components/ArrivalFade'
import garagePlaceholder from '../assets/garage_placeholder.webp'
import iconChoose from '../assets/icons/car-carousel/choose.png'
import iconDetails from '../assets/icons/car-carousel/details.png'
import {
  COLOR_CAVITY_BG,
  COLOR_HEADER_BLACK,
  COLOR_HEADER_WARM,
  COLOR_HEADER_TITLE,
  COLOR_BURGUNDY_M,
  COLOR_TEXT_SECONDARY,
  FONT_UI,
  FONT_TITLE,
  HEADER_HEIGHT,
  SPACE_XS,
  SPACE_SM,
  SPACE_MD,
  SPACE_LG,
  SPACE_XL,
  EASING_SETTLE,
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
  chassis_code: string | null
  engine_type: string | null
  forced_induction: string | null
  horsepower: number | null
  torque: number | null
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
function CarStage({ src, placeholder }: { src: string; placeholder?: boolean }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div style={{ position: 'relative', width: '88%' }}>
      <img
        src={src}
        alt=""
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
  const [state, setState]             = useState<'loading' | 'ready' | 'empty'>('loading')
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
      const { data, error } = await supabase
        .from('public_car_profiles')
        .select('*')
        .eq('username', username)
        .order('created_at', { ascending: true })
      if (cancelled) return
      const rows = (data as Car[] | null) ?? []
      if (error || rows.length === 0) { setState('empty'); return }
      setCars(rows)
      setState('ready')
      if (rows.length > 1) setShowHints(true)
      // Focus the visitor-selected car (?car), else the owner's active car.
      const activeId = (rows[0] as Car).active_car_id
      const targetId = carParam ?? activeId ?? rows[0].id
      const idx = rows.findIndex(c => c.id === targetId)
      if (idx > 0) {
        setActiveIdx(idx)
        setTimeout(() => {
          const el = scrollRef.current
          if (el) el.scrollLeft = idx * el.clientWidth
        }, 50)
      }
    })()
    return () => { cancelled = true }
  }, [username, carParam])

  useEffect(() => {
    if (!showHints) return
    const t = setTimeout(() => setShowHints(false), 3200)
    return () => clearTimeout(t)
  }, [showHints])

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
  }, [])

  const back = () => navigate(`/builds/${username}${carParam ? `?car=${carParam}` : ''}`)

  // ── Loading / empty ──
  if (state !== 'ready') {
    return (
      <div style={{ minHeight: '100dvh', background: COLOR_CAVITY_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, padding: 24, textAlign: 'center' }}>
        <style>{`@keyframes pubgspin{to{transform:rotate(360deg)}}`}</style>
        {state === 'loading' ? (
          <div style={{ width: 30, height: 30, borderRadius: '50%', border: '2.5px solid rgba(245,245,245,0.12)', borderTopColor: COLOR_BURGUNDY_M, animation: 'pubgspin 750ms linear infinite' }} />
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
                  <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4, background: 'radial-gradient(ellipse 70% 65% at 50% 55%, transparent 20%, rgba(0,0,0,0.53) 58%, rgba(0,0,0,0.87) 100%)' }} />
                  <div aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: '46%', backgroundImage: ['linear-gradient(to bottom, transparent calc(38% - 1.5px), rgba(0,0,0,0.39) calc(38% - 1.5px), rgba(0,0,0,0.39) calc(38% + 0.5px), rgba(255,255,255,0.09) calc(38% + 0.5px), rgba(255,255,255,0.09) calc(38% + 1.5px), transparent calc(38% + 1.5px))', 'repeating-linear-gradient(to bottom, transparent 0px, transparent 10px, rgba(0,0,0,0.20) 10px, rgba(0,0,0,0.20) 10.5px, rgba(255,255,255,0.035) 10.5px, rgba(255,255,255,0.035) 11px)'].join(', ') }} />
                  <div aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: '46%', backgroundImage: ['linear-gradient(to right, transparent calc(14% - 4px), rgba(0,0,0,0.32) calc(14% - 4px), rgba(0,0,0,0.32) calc(14% - 3px), rgba(255,255,255,0.04) calc(14% - 3px), rgba(255,255,255,0.04) calc(14% + 3px), rgba(255,255,255,0.11) calc(14% + 3px), rgba(255,255,255,0.11) calc(14% + 4px), transparent calc(14% + 4px))', 'linear-gradient(to right, transparent calc(86% - 4px), rgba(255,255,255,0.11) calc(86% - 4px), rgba(255,255,255,0.11) calc(86% - 3px), rgba(255,255,255,0.04) calc(86% - 3px), rgba(255,255,255,0.04) calc(86% + 3px), rgba(0,0,0,0.32) calc(86% + 3px), rgba(0,0,0,0.32) calc(86% + 4px), transparent calc(86% + 4px))'].join(', ') }} />
                  <div aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: '46%', background: 'linear-gradient(to bottom, #07070a 0%, transparent 40%)', pointerEvents: 'none', zIndex: 1 }} />
                  <div aria-hidden style={{ position: 'absolute', bottom: '46%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.07)' }} />
                  <div aria-hidden style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '46%', background: ['radial-gradient(ellipse 140% 75% at 50% 35%, rgba(220,215,200,0.68) 0%, rgba(200,195,180,0.32) 38%, rgba(175,165,145,0.1) 62%, transparent 80%)', 'linear-gradient(to bottom, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0.18) 100%)'].join(', ') }} />
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: '27%', zIndex: 2, transform: `translateY(${-20 * t}vh) scale(${1 - 0.2 * t})`, transformOrigin: 'center', transition: sheetDragging ? 'none' : `transform 460ms ${EASING_SETTLE}` }}>
                    <CarStage src={car.garage_photo_url || garagePlaceholder} placeholder={!car.garage_photo_url} />
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
                      <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 15, color: 'rgba(245,240,228,0.9)' }}>{car.current_mileage != null ? car.current_mileage.toLocaleString() : '—'}</span>
                      <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: COLOR_TEXT_SECONDARY }}>mi</span>
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
        </div>

        {showHints && activeIdx < cars.length && (
          <>
            {activeIdx > 0 && (
              <div style={{ position: 'absolute', left: SPACE_SM, top: '50%', transform: 'translateY(-50%)', zIndex: 5, animation: `hintPulse 1.6s ${EASING_SETTLE} 2`, pointerEvents: 'none' }}>
                <span style={{ color: 'rgba(245,245,245,0.7)', fontSize: 32, fontWeight: 300 }}>‹</span>
              </div>
            )}
            {activeIdx < cars.length - 1 && (
              <div style={{ position: 'absolute', right: SPACE_SM, top: '50%', transform: 'translateY(-50%)', zIndex: 5, animation: `hintPulse 1.6s ${EASING_SETTLE} 2`, pointerEvents: 'none' }}>
                <span style={{ color: 'rgba(245,245,245,0.7)', fontSize: 32, fontWeight: 300 }}>›</span>
              </div>
            )}
          </>
        )}

        {cars.length > 1 && (
          <div style={{ position: 'absolute', bottom: 6, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6, zIndex: 5, pointerEvents: 'none' }}>
            {cars.map((_, i) => (
              <div key={i} style={{ width: i === activeIdx ? 16 : 4, height: 4, background: i === activeIdx ? COLOR_BURGUNDY_M : 'rgba(255,255,255,0.2)', transition: '300ms ease', borderRadius: 2 }} />
            ))}
          </div>
        )}
      </div>

      {/* ── DETAILS SHEET — morphs out of the active card ── */}
      {(() => {
        const car = cars[activeIdx]
        const num = (n: number | null) => n != null ? n.toLocaleString() : ''
        const identity: [string, string][] = car ? [
          ['Paint Color', car.color ?? ''],
          ['Nickname', car.nickname ?? ''],
          ['Variant', car.variant ?? ''],
          ['Trim', car.trim ?? ''],
          ['Mileage', car.current_mileage != null ? `${num(car.current_mileage)} mi` : ''],
        ] : []
        const specs: [string, string][] = car ? [
          ['Chassis Code', car.chassis_code ?? ''],
          ['Engine', car.engine_type ?? ''],
          ['Forced Induction', car.forced_induction && car.forced_induction !== 'none' ? (FORCED_INDUCTION_LABELS[car.forced_induction] ?? car.forced_induction) : ''],
          ['Horsepower', car.horsepower != null ? `${num(car.horsepower)} hp` : ''],
          ['Torque', car.torque != null ? `${num(car.torque)} lb-ft` : ''],
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
            </div>

            <div ref={detailScrollRef} className="form-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehaviorY: 'contain', touchAction: 'pan-y', padding: `${SPACE_SM}px ${SPACE_MD}px ${SPACE_LG}px` }}>
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
            </div>
          </div>
        )
      })()}
    </div>
  )
}
