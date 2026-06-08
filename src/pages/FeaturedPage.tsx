// Route: /featured — "Featured" magazine (aesthetic island — like Parts Bin)
// COVER (4 templates, dot-cycle only) + SPEC SPREAD + finger-tracked 3D page-turn
// Uses FONT_MASTHEAD (Anton) + FONT_DECK (Oswald), not the app type system.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import {
  FONT_MASTHEAD, FONT_DECK, FONT_TITLE,
  COLOR_BRAND, COLOR_ACCENT, EASING_SETTLE,
} from '../tokens'
import gLogo from '../assets/logo/gdimensionG.png'

// ─── types ────────────────────────────────────────────────────────────────────
interface Car {
  year: number | null; make: string | null; model: string | null; variant: string | null
  trim: string | null; nickname: string | null; horsepower: number | null
  forced_induction: string | null; drivetrain: string | null; purchase_date: string | null
  showcase_photo_url: string | null; garage_photo_url: string | null; original_photo_url: string | null
}
interface Job { id: string; title: string | null; category: string | null; brand: string | null }
type Photo = { url: string; mode: 'full' | 'cutout'; label: string }

// ─── seeded RNG (stable per car) ──────────────────────────────────────────────
function seedFrom(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ─── cover templates ──────────────────────────────────────────────────────────
interface Template {
  id: string; name: string; surfaceBg: string; band: boolean; bandBg?: string
  mastColor: string; accent: string; textOnPhoto: 'light' | 'dark'; scrim: boolean
  vignette: boolean; logo: boolean
}
const TEMPLATES: Template[] = [
  { id: 'top-band', name: 'Top Band', surfaceBg: 'linear-gradient(180deg,#17171a,#070708)', band: true, bandBg: '#f4f1ea',
    mastColor: '#0a0a0a', accent: COLOR_ACCENT, textOnPhoto: 'light', scrim: false, vignette: false, logo: true },
  { id: 'burgundy', name: 'Burgundy Brand', surfaceBg: 'linear-gradient(180deg,#17171a,#070708)', band: true, bandBg: '#f4f1ea',
    mastColor: COLOR_BRAND, accent: COLOR_BRAND, textOnPhoto: 'light', scrim: false, vignette: false, logo: true },
  { id: 'knockout-white', name: 'Knockout White', surfaceBg: 'radial-gradient(ellipse at 50% 30%,#15151a,#050506)', band: false,
    mastColor: '#ffffff', accent: COLOR_ACCENT, textOnPhoto: 'light', scrim: true, vignette: false, logo: false },
  { id: 'ink-black', name: 'Ink Black', surfaceBg: 'linear-gradient(180deg,#e4ddcf 0%,#b9b1a1 100%)', band: false,
    mastColor: '#111', accent: COLOR_BRAND, textOnPhoto: 'dark', scrim: false, vignette: true, logo: false },
]

// ─── interior themes ──────────────────────────────────────────────────────────
interface InteriorTheme {
  pageBg: string; ink: string; subInk: string; accent: string
  rule: string; menuBorder: string; menuHeaderBg: string; menuHeaderInk: string; gutterShadow: string
}
const INTERIOR_THEMES: Record<string, InteriorTheme> = {
  'top-band': {
    pageBg: '#faf8f4', ink: '#0c0c0c', subInk: '#5a5550', accent: COLOR_ACCENT,
    rule: '#d8d4cc', menuBorder: '#1e1a16', menuHeaderBg: '#0c0c0c', menuHeaderInk: '#f4f1ea',
    gutterShadow: 'linear-gradient(90deg, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.07) 55%, transparent 100%)',
  },
  'burgundy': {
    pageBg: '#f5eed8', ink: '#1a0a0c', subInk: '#7a5a5e', accent: COLOR_BRAND,
    rule: '#c8b0b3', menuBorder: COLOR_BRAND, menuHeaderBg: COLOR_BRAND, menuHeaderInk: '#f5eed8',
    gutterShadow: 'linear-gradient(90deg, rgba(120,14,18,0.18) 0%, rgba(120,14,18,0.05) 55%, transparent 100%)',
  },
  'knockout-white': {
    pageBg: '#111116', ink: '#f0ede8', subInk: '#8a8880', accent: COLOR_ACCENT,
    rule: '#2e2e36', menuBorder: '#444', menuHeaderBg: '#f0ede8', menuHeaderInk: '#111116',
    gutterShadow: 'linear-gradient(90deg, rgba(180,180,200,0.12) 0%, rgba(180,180,200,0.04) 55%, transparent 100%)',
  },
  'ink-black': {
    pageBg: '#f8f7f4', ink: '#111', subInk: '#666', accent: '#1a1a1a',
    rule: '#ddd', menuBorder: '#1a1a1a', menuHeaderBg: '#1a1a1a', menuHeaderInk: '#f8f7f4',
    gutterShadow: 'linear-gradient(90deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.06) 55%, transparent 100%)',
  },
}

// ─── build-sheet grouping ─────────────────────────────────────────────────────
const CAT_TO_GROUP: Record<string, 'power' | 'chassis' | 'exterior' | 'interior'> = {
  'Engine': 'power', 'Drivetrain': 'power', 'Forced Induction': 'power',
  'Exhaust': 'power', 'Cooling': 'power', 'Fuel System': 'power', 'Electrical': 'power',
  'Suspension': 'chassis', 'Brakes': 'chassis', 'Wheels & Tires': 'chassis',
  'Exterior': 'exterior', 'Paint & Wrap': 'exterior', 'Lighting': 'exterior',
  'Interior': 'interior', 'Audio': 'interior', 'Safety': 'interior',
}
const GROUP_LABELS: Record<string, string> = { power: 'POWER', chassis: 'CHASSIS', exterior: 'EXTERIOR', interior: 'INTERIOR' }
const GROUP_ORDER = ['power', 'chassis', 'exterior', 'interior'] as const

// ═══════════════════════════════════════════════════════════════════════════════
export default function FeaturedPage() {
  const navigate = useNavigate()
  const [car, setCar] = useState<Car | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [photoIdx, setPhotoIdx] = useState(0)
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [coverIdx, setCoverIdx] = useState(0)
  // pageIdx: 0 = cover at rest, 1 = spec at rest
  const [pageIdx, setPageIdx] = useState<0 | 1>(0)
  const [isTurning, setIsTurning] = useState(false)

  // ── DOM refs ─────────────────────────────────────────────────────────────────
  const containerRef   = useRef<HTMLDivElement>(null)
  const coverPageRef   = useRef<HTMLDivElement>(null)
  const specPageRef    = useRef<HTMLDivElement>(null)
  const coverShadowRef = useRef<HTMLDivElement>(null)
  const specShadowRef  = useRef<HTMLDivElement>(null)

  // ── synchronous turn-state refs (no re-render needed) ────────────────────────
  const isTurningRef = useRef(false)
  const pageIdxRef   = useRef<0 | 1>(0)
  const turnDirRef   = useRef<'fwd' | 'back'>('fwd')
  const progressRef  = useRef(0)
  const rafRef       = useRef<number | null>(null)

  // ── touch-tracking refs ───────────────────────────────────────────────────────
  const touchStartXRef = useRef<number | null>(null)
  const touchStartYRef = useRef<number | null>(null)
  const isDragRef      = useRef(false)

  // ── data fetch ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    ;(async () => {
      const carId = await getActiveCarId()
      if (!carId) { if (alive) setLoading(false); return }

      const [carRes, jobsRes] = await Promise.all([
        supabase.from('cars')
          .select('year, make, model, variant, trim, nickname, horsepower, forced_induction, drivetrain, purchase_date, showcase_photo_url, garage_photo_url, original_photo_url')
          .eq('id', carId).is('deleted_at', null).single(),
        supabase.from('jobs')
          .select('id, title, category, brand')
          .eq('car_id', carId).eq('status', 'installed')
          .order('created_at', { ascending: true }),
      ])

      if (!alive) return
      const c = (carRes.data as unknown as Car) ?? null
      setCar(c)

      const cands: Photo[] = []
      if (c?.original_photo_url) cands.push({ url: c.original_photo_url, mode: 'full', label: 'Original' })
      if (c?.garage_photo_url) cands.push({ url: c.garage_photo_url, mode: 'cutout', label: 'No BG' })
      setPhotos(cands)

      setJobs((jobsRes.data as unknown as Job[]) ?? [])
      if (carRes.data) setCoverIdx(seedFrom(carId) % TEMPLATES.length)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [])

  // ── sync z-index to rest state after pageIdx changes ─────────────────────────
  useLayoutEffect(() => {
    if (isTurningRef.current) return
    if (coverPageRef.current) coverPageRef.current.style.zIndex = pageIdx === 0 ? '2' : '1'
    if (specPageRef.current)  specPageRef.current.style.zIndex  = pageIdx === 1 ? '2' : '1'
  }, [pageIdx])

  // ── turn helpers ──────────────────────────────────────────────────────────────

  // Apply rotation + shadow at progress p in [0,1].
  // fwd: cover 0°→-90°, spec 90°→0°  |  back: spec 0°→90°, cover -90°→0°
  function applyTransforms(p: number, dir: 'fwd' | 'back') {
    const cov = coverPageRef.current, spc = specPageRef.current
    if (!cov || !spc) return
    cov.style.transform = `rotateY(${dir === 'fwd' ? -90 * p : -90 * (1 - p)}deg)`
    spc.style.transform = `rotateY(${dir === 'fwd' ? 90 * (1 - p) : 90 * p}deg)`
    // Fold shadow peaks mid-turn (sin curve); reveal shadow fades as new page comes into view
    const fold = Math.sin(p * Math.PI) * 0.65
    const rev  = (1 - p) * 0.45
    if (coverShadowRef.current) coverShadowRef.current.style.opacity = String(dir === 'fwd' ? fold : rev)
    if (specShadowRef.current)  specShadowRef.current.style.opacity  = String(dir === 'fwd' ? rev  : fold)
  }

  // Called when turn completes or snaps back
  function finishTurn(completed: boolean) {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    progressRef.current = 0
    if (completed) {
      const nxt: 0 | 1 = turnDirRef.current === 'fwd' ? 1 : 0
      pageIdxRef.current = nxt
      setPageIdx(nxt) // triggers useLayoutEffect to restore z-index
    }
    isTurningRef.current = false
    setIsTurning(false)
    // Reset transforms to flat
    if (coverPageRef.current)  coverPageRef.current.style.transform  = 'rotateY(0deg)'
    if (specPageRef.current)   specPageRef.current.style.transform   = 'rotateY(0deg)'
    if (coverShadowRef.current) coverShadowRef.current.style.opacity = '0'
    if (specShadowRef.current)  specShadowRef.current.style.opacity  = '0'
  }

  // RAF animation from `from` to `to` progress; calls cb(didComplete) when done
  function animateTo(from: number, to: number, dir: 'fwd' | 'back', cb: (done: boolean) => void) {
    const dur = Math.max(100, Math.abs(to - from) * 280)
    const t0  = performance.now()
    const delta = to - from
    const run = (now: number) => {
      const t = Math.min((now - t0) / dur, 1)
      const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t // ease-in-out quad
      const p = from + delta * e
      progressRef.current = p
      applyTransforms(p, dir)
      if (t < 1) { rafRef.current = requestAnimationFrame(run) }
      else { cb(to >= 1) }
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(run)
  }

  // Programmatic turn (button tap) — animates full 0→1
  function runTurn(dir: 'fwd' | 'back') {
    if (isTurningRef.current) return
    isTurningRef.current = true
    turnDirRef.current = dir
    setIsTurning(true)
    // Folding page sits on top
    if (coverPageRef.current) coverPageRef.current.style.zIndex = dir === 'fwd' ? '2' : '1'
    if (specPageRef.current)  specPageRef.current.style.zIndex  = dir === 'fwd' ? '1' : '2'
    applyTransforms(0, dir)
    animateTo(0, 1, dir, finishTurn)
  }

  // ── non-passive touchmove (needed to preventDefault during horizontal drag) ───
  // Store latest function pointers in refs so the useEffect closure stays fresh
  const applyRef   = useRef(applyTransforms)
  const finishRef  = useRef(finishTurn)
  const animateRef = useRef(animateTo)
  applyRef.current   = applyTransforms
  finishRef.current  = finishTurn
  animateRef.current = animateTo

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const onMove = (e: TouchEvent) => {
      if (touchStartXRef.current === null) return
      const dx = e.touches[0].clientX - touchStartXRef.current
      const dy = e.touches[0].clientY - (touchStartYRef.current ?? 0)

      if (!isDragRef.current) {
        // Wait for enough movement to determine intent
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        // Vertical scroll wins — let the inner scroll handle it
        if (Math.abs(dy) > Math.abs(dx)) { touchStartXRef.current = null; return }
        // Horizontal drag — determine direction vs page
        const pg = pageIdxRef.current
        if (pg === 0 && dx < 0) {
          // Cover, swipe left → forward
          isDragRef.current = true
          isTurningRef.current = true
          turnDirRef.current = 'fwd'
          setIsTurning(true)
          if (coverPageRef.current) coverPageRef.current.style.zIndex = '2'
          if (specPageRef.current)  specPageRef.current.style.zIndex  = '1'
        } else if (pg === 1 && dx > 0) {
          // Spec, swipe right → back
          isDragRef.current = true
          isTurningRef.current = true
          turnDirRef.current = 'back'
          setIsTurning(true)
          if (coverPageRef.current) coverPageRef.current.style.zIndex = '1'
          if (specPageRef.current)  specPageRef.current.style.zIndex  = '2'
        } else {
          touchStartXRef.current = null
          return
        }
      }

      e.preventDefault()
      const dir    = turnDirRef.current
      const rawDx  = dir === 'fwd' ? -dx : dx
      const p      = Math.min(Math.max(rawDx / (window.innerWidth * 0.6), 0), 1)
      progressRef.current = p
      applyRef.current(p, dir)
    }

    container.addEventListener('touchmove', onMove, { passive: false })
    return () => container.removeEventListener('touchmove', onMove)
  }, [])

  function handleTouchStart(e: React.TouchEvent) {
    if (isTurningRef.current) return
    touchStartXRef.current = e.touches[0].clientX
    touchStartYRef.current = e.touches[0].clientY
    isDragRef.current = false
  }

  function handleTouchEnd() {
    if (!isDragRef.current) { touchStartXRef.current = null; return }
    isDragRef.current = false
    touchStartXRef.current = null
    const p   = progressRef.current
    const dir = turnDirRef.current
    // Complete if dragged ≥ 35%, snap back otherwise
    if (p >= 0.35) animateRef.current(p, 1, dir, finishRef.current)
    else           animateRef.current(p, 0, dir, () => finishRef.current(false))
  }

  // ── computed display values ───────────────────────────────────────────────────
  const seed = useMemo(() => seedFrom((car?.nickname ?? '') + (car?.year ?? '')), [car])
  const rng  = useMemo(() => mulberry32(seed || 1), [seed])

  const purchaseYear = car?.purchase_date ? new Date(car.purchase_date).getFullYear() : null
  const thisYear     = new Date().getFullYear()
  const vol          = purchaseYear ? Math.max(1, thisYear - purchaseYear + 1) : 1
  const issue        = useMemo(() => 1 + Math.floor(rng() * 12), [rng])
  const carName      = [car?.year, car?.make, car?.model, car?.variant].filter(Boolean).join(' ') || 'YOUR BUILD'
  const headline     = (car?.nickname || car?.model || 'YOUR BUILD').toString()
  const fi           = car?.forced_induction && car.forced_induction !== 'none' ? car.forced_induction.replace('-', ' ') : null
  const powerLine    = [
    car?.horsepower ? `${car.horsepower} HP` : null, fi,
    car?.drivetrain ? car.drivetrain.toUpperCase() : null,
  ].filter(Boolean).join(' · ')

  const bars   = useMemo(() => { const r = mulberry32((seed || 1) ^ 0x9e3779b9); return Array.from({ length: 20 }, () => 2 + Math.floor(r() * 4)) }, [seed])
  const barNum = useMemo(() => String(70000 + Math.floor(rng() * 29999)) + ' ' + String(10 + Math.floor(rng() * 89)), [rng])

  const t          = TEMPLATES[coverIdx]
  const theme      = INTERIOR_THEMES[t.id] ?? INTERIOR_THEMES['top-band']
  const photo      = photos[photoIdx] ?? null
  const cycleCover = (dir: number) => setCoverIdx((p) => (p + dir + TEMPLATES.length) % TEMPLATES.length)

  if (loading) return <div style={{ position: 'fixed', inset: 0, background: '#08080a' }} />

  const bottomColor = t.textOnPhoto === 'light' ? '#f5f5f5' : '#0a0a0a'

  return (
    <div
      ref={containerRef}
      style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden', userSelect: 'none', WebkitUserSelect: 'none' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* SVG spine-warp filter */}
      <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden>
        <defs>
          <filter id="feat-spine-warp" x="-5%" width="115%" y="0%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.02 0.5" numOctaves="3" seed="11" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale={isTurning ? 12 : 0}
              xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      {/* ─── page stage — perspective wrapper for 3D turn ─── */}
      <div style={{ position: 'absolute', inset: 0, perspective: '1100px', perspectiveOrigin: '50% 50%' }}>

        {/* ══ COVER PAGE ══ — always mounted; z-index managed by turn helpers */}
        <div
          ref={coverPageRef}
          style={{ position: 'absolute', inset: 0, transformOrigin: 'right center', willChange: 'transform', zIndex: 2 }}
        >
          {/* fold/reveal shadow overlay */}
          <div ref={coverShadowRef} style={{ position: 'absolute', inset: 0, background: '#000', opacity: 0, zIndex: 10, pointerEvents: 'none' }} />

          <div key={t.id} style={{ position: 'absolute', inset: 0, animation: !isTurning ? `featFade 360ms ${EASING_SETTLE} both` : 'none' }}>
            {/* backdrop */}
            <div style={{ position: 'absolute', inset: 0, background: t.surfaceBg }} />

            {/* cover photo — spine-warp filter active during turn */}
            {photo ? (
              <img src={photo.url} alt=""
                style={photo.mode === 'cutout'
                  ? { position: 'absolute', inset: 'auto 0 5% 0', width: '100%', height: '68%', objectFit: 'contain', objectPosition: 'center',
                      filter: isTurning ? 'url(#feat-spine-warp)' : 'none' }
                  : { position: 'absolute', top: 0, left: 0, width: '100%', height: '64%', objectFit: 'cover', objectPosition: 'center 42%',
                      filter: isTurning ? 'url(#feat-spine-warp)' : 'none' }
                }
              />
            ) : (
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                <span style={{ fontFamily: FONT_DECK, color: 'rgba(245,245,245,0.5)', letterSpacing: '0.3em', fontSize: 12, textTransform: 'uppercase' }}>
                  Add a cover photo
                </span>
              </div>
            )}

            {t.vignette && (
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
                background: 'radial-gradient(ellipse at 50% 42%, transparent 45%, rgba(20,16,10,0.32) 100%)' }} />
            )}
            {t.scrim && !t.band && (
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '34%', pointerEvents: 'none',
                background: 'linear-gradient(180deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.25) 55%, transparent 100%)' }} />
            )}
            {t.textOnPhoto === 'light' && (
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '48%', pointerEvents: 'none',
                background: 'linear-gradient(0deg, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.35) 45%, transparent 100%)' }} />
            )}

            {/* masthead */}
            {t.band ? (
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, background: t.bandBg, padding: '12px 16px 9px' }}>
                <Masthead t={t} size={40} />
                <TopStrip accent={t.accent} dark vol={vol} issue={issue} purchaseYear={purchaseYear} />
              </div>
            ) : (
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '52px 16px 10px' }}>
                <Masthead t={t} size={46} />
                <TopStrip accent={t.accent} dark={false} vol={vol} issue={issue} purchaseYear={purchaseYear} />
              </div>
            )}

            {/* cover lines */}
            <div style={{ position: 'absolute', left: 16, right: 16, bottom: 96 }}>
              <span style={{ display: 'inline-block', fontFamily: FONT_DECK, fontWeight: 600, fontSize: 11,
                letterSpacing: '0.22em', textTransform: 'uppercase', color: '#fff',
                background: t.accent, padding: '3px 8px', marginBottom: 10 }}>
                Feature Car
              </span>
              <div style={{ fontFamily: FONT_MASTHEAD, color: bottomColor, lineHeight: 0.92,
                fontSize: headline.length > 12 ? 44 : 58, textTransform: 'uppercase',
                textShadow: t.textOnPhoto === 'light' ? '0 2px 14px rgba(0,0,0,0.5)' : 'none' }}>
                {headline}
              </div>
              <div style={{ fontFamily: FONT_DECK, fontWeight: 500, color: bottomColor, opacity: 0.92,
                fontSize: 14, letterSpacing: '0.04em', textTransform: 'uppercase', marginTop: 8 }}>
                {carName}{car?.trim ? ` ${car.trim}` : ''}
              </div>
              {powerLine && (
                <div style={{ fontFamily: FONT_DECK, fontWeight: 600, color: t.accent,
                  fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 4 }}>
                  {powerLine}
                </div>
              )}
            </div>

            {/* barcode */}
            <div style={{ position: 'absolute', left: 12, bottom: 16, background: '#f4f1ea', padding: '5px 6px',
              display: 'flex', flexDirection: 'row', alignItems: 'stretch', gap: 4, zIndex: 6 }}>
              <div style={{ display: 'flex', flexDirection: 'column', width: 40 }}>
                {bars.map((h, i) => (
                  <div key={i} style={{ height: h, width: '100%', background: i % 2 ? '#f4f1ea' : '#0a0a0a' }} />
                ))}
              </div>
              <div style={{ writingMode: 'vertical-rl', fontFamily: FONT_DECK, fontSize: 7, letterSpacing: '0.12em', color: '#0a0a0a' }}>
                {barNum}
              </div>
            </div>

            {/* folio */}
            <span style={{ position: 'absolute', right: 12, bottom: 12, fontFamily: FONT_DECK, fontWeight: 600,
              fontSize: 9, letterSpacing: '0.3em', color: bottomColor, opacity: 0.8 }}>
              GDIMENSION.APP
            </span>

            {/* glossy sheen */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
              background: 'radial-gradient(120% 60% at 75% 8%, rgba(255,255,255,0.16) 0%, transparent 42%)', mixBlendMode: 'screen' }} />
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.03, mixBlendMode: 'screen',
              backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")" }} />

            {/* right-edge spine gutter */}
            <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 32, pointerEvents: 'none',
              background: 'linear-gradient(270deg, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.06) 55%, transparent 100%)' }} />

            {/* "INSIDE ▸" trigger chip */}
            <div
              onClick={() => !isTurning && runTurn('fwd')}
              style={{ position: 'absolute', right: 12, bottom: 50, zIndex: 9,
                fontFamily: FONT_DECK, fontWeight: 700, fontSize: 9.5, letterSpacing: '0.24em', textTransform: 'uppercase',
                color: '#f5f5f5', background: 'rgba(0,0,0,0.58)', border: '1px solid rgba(245,245,245,0.38)',
                padding: '7px 12px', cursor: 'pointer', pointerEvents: isTurning ? 'none' : 'auto' }}>
              INSIDE ▸
            </div>
          </div>
        </div>

        {/* ══ SPEC PAGE ══ — always mounted; z-index managed by turn helpers */}
        <div
          ref={specPageRef}
          style={{ position: 'absolute', inset: 0, transformOrigin: 'left center', willChange: 'transform', zIndex: 1 }}
        >
          {/* fold/reveal shadow overlay */}
          <div ref={specShadowRef} style={{ position: 'absolute', inset: 0, background: '#000', opacity: 0, zIndex: 10, pointerEvents: 'none' }} />

          <SpecSpread
            car={car} jobs={jobs} carName={carName} powerLine={powerLine}
            purchaseYear={purchaseYear} theme={theme} vol={vol} issue={issue}
            onBack={() => !isTurning && runTurn('back')}
          />
        </div>

      </div>

      {/* ─── chrome (always on top) ─── */}
      <div
        onClick={() => navigate('/home')}
        style={{ position: 'absolute', top: 14, left: 12, zIndex: 30, fontFamily: FONT_DECK, fontSize: 30, lineHeight: 1,
          color: COLOR_ACCENT, cursor: 'pointer', textShadow: '0 1px 6px rgba(0,0,0,0.6)',
          pointerEvents: isTurning ? 'none' : 'auto' }}>
        ‹
      </div>

      {pageIdx === 0 && !isTurning && (
        <>
          <div style={{ position: 'absolute', top: 18, left: 0, right: 0, textAlign: 'center', zIndex: 20,
            fontFamily: FONT_DECK, fontWeight: 600, fontSize: 9, letterSpacing: '0.28em', textTransform: 'uppercase',
            color: 'rgba(245,245,245,0.55)', pointerEvents: 'none' }}>
            Cover {coverIdx + 1}/{TEMPLATES.length} · {t.name}
          </div>

          {photos.length > 1 && (
            <div onClick={() => setPhotoIdx((p) => (p + 1) % photos.length)}
              style={{ position: 'absolute', top: 48, right: 12, zIndex: 20, fontFamily: FONT_DECK, fontWeight: 600,
                fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#f5f5f5',
                background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(245,245,245,0.35)', padding: '5px 9px', cursor: 'pointer' }}>
              Photo ▸ {photo?.label ?? '—'}
            </div>
          )}

          {/* tap zones for template cycling — left 26%, right 22% (narrowed to not conflict with INSIDE chip) */}
          <div onClick={() => cycleCover(-1)} style={{ position: 'absolute', top: '30%', bottom: '22%', left: 0, width: '26%', zIndex: 15 }} />
          <div onClick={() => cycleCover(1)}  style={{ position: 'absolute', top: '30%', bottom: '22%', right: 0, width: '22%', zIndex: 15 }} />

          <div style={{ position: 'absolute', bottom: 6, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6, zIndex: 20 }}>
            {TEMPLATES.map((tp, i) => (
              <div key={tp.id} onClick={() => setCoverIdx(i)}
                style={{ width: i === coverIdx ? 16 : 6, height: 6, borderRadius: 3,
                  background: i === coverIdx ? COLOR_ACCENT : 'rgba(245,245,245,0.4)', transition: `all 200ms ${EASING_SETTLE}`, cursor: 'pointer' }} />
            ))}
          </div>
        </>
      )}

      <style>{`
        @keyframes featFade { from { opacity: 0 } to { opacity: 1 } }
      `}</style>
    </div>
  )
}

// ─── Masthead ─────────────────────────────────────────────────────────────────
function Masthead({ t, size }: { t: Template; size: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <h1 style={{ fontFamily: FONT_MASTHEAD, color: t.mastColor, margin: 0, lineHeight: 0.82,
        fontSize: size, letterSpacing: '-0.01em', fontStyle: 'italic', transform: 'skewX(-6deg)',
        textShadow: t.band ? 'none' : '0 2px 16px rgba(0,0,0,0.55)' }}>
        G-DIMENSION
      </h1>
      {t.logo && <img src={gLogo} alt="" style={{ height: size * 0.82, width: 'auto', flexShrink: 0 }} />}
    </div>
  )
}

// ─── TopStrip ─────────────────────────────────────────────────────────────────
function TopStrip({ accent, dark, vol, issue, purchaseYear }:
  { accent: string; dark: boolean; vol: number; issue: number; purchaseYear: number | null }) {
  const col = dark ? '#0a0a0a' : '#f5f5f5'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4,
      fontFamily: FONT_DECK, fontWeight: 600, fontSize: 9.5, letterSpacing: '0.12em',
      textTransform: 'uppercase', color: col, textShadow: dark ? 'none' : '0 1px 6px rgba(0,0,0,0.6)' }}>
      <span style={{ color: accent }}>VOL.{vol} NO.{issue}</span>
      <span>· Your Build. Featured.</span>
      {purchaseYear && <span style={{ marginLeft: 'auto' }}>Since {purchaseYear}</span>}
    </div>
  )
}

// ─── SpecSpread ───────────────────────────────────────────────────────────────
interface SpecSpreadProps {
  car: Car | null; jobs: Job[]; carName: string; powerLine: string
  purchaseYear: number | null; theme: InteriorTheme; vol: number; issue: number
  onBack: () => void
}

function SpecSpread({ car, jobs, carName, powerLine, purchaseYear, theme, vol, issue, onBack }: SpecSpreadProps) {
  const grouped = useMemo(() => {
    const g: Record<string, Job[]> = { power: [], chassis: [], exterior: [], interior: [] }
    for (const job of jobs) {
      const grp = job.category ? CAT_TO_GROUP[job.category] : undefined
      if (grp) g[grp].push(job)
    }
    return g
  }, [jobs])

  const activeGroups = GROUP_ORDER.filter(k => grouped[k].length > 0)

  const stats = [
    car?.horsepower    ? { label: 'POWER',           value: `${car.horsepower} HP` } : null,
    car?.drivetrain    ? { label: 'DRIVETRAIN',       value: car.drivetrain.toUpperCase() } : null,
    (car?.forced_induction && car.forced_induction !== 'none')
                       ? { label: 'FORCED INDUCTION', value: car.forced_induction!.replace('-', ' ').toUpperCase() } : null,
    car?.year          ? { label: 'YEAR',             value: String(car.year) } : null,
    car?.trim          ? { label: 'TRIM',             value: car.trim.toUpperCase() } : null,
    purchaseYear       ? { label: 'IN BUILD SINCE',   value: String(purchaseYear) } : null,
  ].filter(Boolean) as { label: string; value: string }[]

  return (
    <div style={{ position: 'absolute', inset: 0, background: theme.pageBg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* left spine gutter shadow */}
      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 32, pointerEvents: 'none', zIndex: 4,
        background: theme.gutterShadow }} />

      {/* running head */}
      <div style={{ background: theme.menuHeaderBg, padding: '11px 16px 9px 28px',
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontFamily: FONT_MASTHEAD, color: theme.menuHeaderInk, fontSize: 20,
          fontStyle: 'italic', letterSpacing: '-0.01em' }}>
          G-DIMENSION
        </span>
        <span style={{ fontFamily: FONT_DECK, color: theme.menuHeaderInk, opacity: 0.65,
          fontSize: 8.5, letterSpacing: '0.26em', textTransform: 'uppercase' }}>
          VOL.{vol} NO.{issue} · SPEC
        </span>
      </div>

      {/* page content — scrollable */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 24px 28px', WebkitOverflowScrolling: 'touch' as const }}>

        {/* car identity block */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: FONT_MASTHEAD, color: theme.ink, fontSize: 38, lineHeight: 0.88,
            textTransform: 'uppercase', fontStyle: 'italic', letterSpacing: '-0.02em' }}>
            {[car?.year, car?.make, car?.model].filter(Boolean).join(' ') || carName}
          </div>
          {car?.variant && (
            <div style={{ fontFamily: FONT_DECK, color: theme.accent, fontWeight: 600,
              fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: 5 }}>
              {car.variant}
            </div>
          )}
          {car?.nickname && (
            <div style={{ fontFamily: FONT_TITLE, color: theme.accent, fontSize: 21, fontStyle: 'italic', marginTop: 4, letterSpacing: '0.01em' }}>
              "{car.nickname}"
            </div>
          )}
          <div style={{ height: 1, background: theme.rule, margin: '10px 0' }} />
          <div style={{ fontFamily: FONT_DECK, fontWeight: 600, color: theme.subInk,
            fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {powerLine || carName}
          </div>
        </div>

        {/* ── TUNING MENU box ── */}
        <div style={{ border: `1.5px solid ${theme.menuBorder}`, marginBottom: 20 }}>
          <div style={{ background: theme.menuHeaderBg, padding: '7px 12px',
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: FONT_MASTHEAD, color: theme.menuHeaderInk,
              fontSize: 15, fontStyle: 'italic', letterSpacing: '0.01em' }}>
              TUNING MENU
            </span>
            <span style={{ fontFamily: FONT_DECK, color: theme.menuHeaderInk, opacity: 0.55,
              fontSize: 7.5, letterSpacing: '0.22em', textTransform: 'uppercase' }}>
              {jobs.length} MOD{jobs.length !== 1 ? 'S' : ''} INSTALLED
            </span>
          </div>

          {activeGroups.length === 0 ? (
            <div style={{ padding: '20px 12px', textAlign: 'center',
              fontFamily: FONT_DECK, color: theme.subInk, fontSize: 10.5,
              letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.55 }}>
              Add mods in Tuning to fill this spread
            </div>
          ) : (
            activeGroups.map((grpKey, gi) => (
              <div key={grpKey}>
                {gi > 0 && <div style={{ height: 1, background: theme.rule }} />}
                <div style={{ padding: '9px 12px' }}>
                  <div style={{ fontFamily: FONT_DECK, fontWeight: 700, color: theme.accent,
                    fontSize: 8.5, letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 7 }}>
                    {GROUP_LABELS[grpKey]}
                  </div>
                  {grouped[grpKey].slice(0, 7).map((job) => (
                    <div key={job.id}
                      style={{ fontFamily: FONT_DECK, color: theme.ink, fontSize: 12.5,
                        letterSpacing: '0.01em', lineHeight: 1.65, paddingLeft: 12, position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 0, top: 1, color: theme.accent, fontSize: 11, lineHeight: 1.65 }}>·</span>
                      {[job.brand, job.title].filter(Boolean).join(' ') || '—'}
                    </div>
                  ))}
                  {grouped[grpKey].length > 7 && (
                    <div style={{ fontFamily: FONT_DECK, color: theme.subInk, fontSize: 9.5,
                      letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 3, paddingLeft: 12, opacity: 0.6 }}>
                      +{grouped[grpKey].length - 7} more
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── quick-stats grid ── */}
        {stats.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1,
            outline: `1px solid ${theme.rule}`, background: theme.rule, marginBottom: 8 }}>
            {stats.map((s) => (
              <div key={s.label} style={{ background: theme.pageBg, padding: '10px 12px' }}>
                <div style={{ fontFamily: FONT_DECK, color: theme.subInk, fontSize: 7.5,
                  letterSpacing: '0.24em', textTransform: 'uppercase', marginBottom: 3 }}>
                  {s.label}
                </div>
                <div style={{ fontFamily: FONT_MASTHEAD, color: theme.ink,
                  fontSize: 18, lineHeight: 1, fontStyle: 'italic' }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* folio bar */}
      <div style={{ padding: '8px 16px 8px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderTop: `1px solid ${theme.rule}`, flexShrink: 0, background: theme.pageBg }}>
        <div onClick={onBack}
          style={{ fontFamily: FONT_DECK, fontWeight: 700, fontSize: 9.5, letterSpacing: '0.22em',
            textTransform: 'uppercase', color: theme.accent, cursor: 'pointer', padding: '4px 0' }}>
          ‹ COVER
        </div>
        <span style={{ fontFamily: FONT_DECK, fontWeight: 600, fontSize: 7.5, letterSpacing: '0.28em',
          textTransform: 'uppercase', color: theme.subInk, opacity: 0.6 }}>
          GDIMENSION.APP
        </span>
        <span style={{ fontFamily: FONT_MASTHEAD, color: theme.ink, fontSize: 17, fontStyle: 'italic', opacity: 0.65 }}>
          02
        </span>
      </div>

      {/* paper noise grain */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.025, mixBlendMode: 'multiply',
        backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")" }} />
    </div>
  )
}
