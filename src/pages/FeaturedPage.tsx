// Route: /featured — "Featured" magazine (aesthetic island)
// 3 pages: Cover → Spec spread → Mods spread
// Page turn: fold-line sweep via clip-path + transformOrigin-at-fold + slight rotateY tilt.
//   The fold line travels across the page; left of it: original content (clipped, slightly tilting).
//   Right of it: paper-back overlay (cream with shadow gradient) + bright crease strip.
//   Arriving page is static below. No full-page rotation — feels like a real paper fold.
// Swipe L/R on cover = cycle templates. Drag from right-30% = turn forward. Spec/mods: drag right = back.
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

// ─── seeded RNG ───────────────────────────────────────────────────────────────
function seedFrom(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
function mulberry32(a: number) {
  return () => {
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
  rule: string; menuBorder: string; menuHeaderBg: string; menuHeaderInk: string
}
const INTERIOR_THEMES: Record<string, InteriorTheme> = {
  'top-band':      { pageBg: '#faf8f4', ink: '#0c0c0c', subInk: '#5a5550', accent: COLOR_ACCENT, rule: '#d8d4cc', menuBorder: '#1e1a16', menuHeaderBg: '#0c0c0c', menuHeaderInk: '#f4f1ea' },
  'burgundy':      { pageBg: '#f5eed8', ink: '#1a0a0c', subInk: '#7a5a5e', accent: COLOR_BRAND,  rule: '#c8b0b3', menuBorder: COLOR_BRAND, menuHeaderBg: COLOR_BRAND, menuHeaderInk: '#f5eed8' },
  'knockout-white':{ pageBg: '#111116', ink: '#f0ede8', subInk: '#8a8880', accent: COLOR_ACCENT, rule: '#2e2e36', menuBorder: '#444',      menuHeaderBg: '#f0ede8',  menuHeaderInk: '#111116' },
  'ink-black':     { pageBg: '#f8f7f4', ink: '#111',    subInk: '#666',    accent: '#1a1a1a',   rule: '#ddd',    menuBorder: '#1a1a1a',   menuHeaderBg: '#1a1a1a',  menuHeaderInk: '#f8f7f4' },
}

// ─── build-sheet grouping ─────────────────────────────────────────────────────
const CAT_TO_GROUP: Record<string, 'power' | 'chassis' | 'exterior' | 'interior'> = {
  'Engine':'power','Drivetrain':'power','Forced Induction':'power','Exhaust':'power','Cooling':'power','Fuel System':'power','Electrical':'power',
  'Suspension':'chassis','Brakes':'chassis','Wheels & Tires':'chassis',
  'Exterior':'exterior','Paint & Wrap':'exterior','Lighting':'exterior',
  'Interior':'interior','Audio':'interior','Safety':'interior',
}
const GROUP_ORDER = ['power','chassis','exterior','interior'] as const
const GROUP_LABELS: Record<string,string> = { power:'POWER', chassis:'CHASSIS', exterior:'EXTERIOR', interior:'INTERIOR' }

const NUM_PAGES = 3 // cover, spec, mods

// ═══════════════════════════════════════════════════════════════════════════════
export default function FeaturedPage() {
  const navigate = useNavigate()
  const [car, setCar]       = useState<Car | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [photoIdx, setPhotoIdx] = useState(0)
  const [jobs, setJobs]     = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [coverIdx, setCoverIdx] = useState(0)
  const [pageIdx, setPageIdx]   = useState(0) // 0=cover, 1=spec, 2=mods
  const [isTurning, setIsTurning] = useState(false)

  // ── DOM refs: one per page ────────────────────────────────────────────────────
  const pageEls   = useRef<(HTMLDivElement | null)[]>(Array(NUM_PAGES).fill(null))
  const shadowEls = useRef<(HTMLDivElement | null)[]>(Array(NUM_PAGES).fill(null))
  // fold-line elements (shared, not per-page)
  const foldOverlayRef = useRef<HTMLDivElement>(null)  // paper-back cream face
  const foldLineRef    = useRef<HTMLDivElement>(null)  // bright crease strip

  // ── turn state refs ───────────────────────────────────────────────────────────
  const isTurningRef = useRef(false)
  const pageIdxRef   = useRef(0)
  const turnDirRef   = useRef<'fwd'|'back'>('fwd')
  const progressRef  = useRef(0)
  const rafRef       = useRef<number|null>(null)

  // ── touch refs ────────────────────────────────────────────────────────────────
  const touchStartXRef  = useRef<number|null>(null)
  const touchStartYRef  = useRef<number|null>(null)
  const isDragTurnRef   = useRef(false)

  // ── data fetch ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    ;(async () => {
      const carId = await getActiveCarId()
      if (!carId) { if (alive) setLoading(false); return }
      const [carRes, jobsRes] = await Promise.all([
        supabase.from('cars')
          .select('year,make,model,variant,trim,nickname,horsepower,forced_induction,drivetrain,purchase_date,showcase_photo_url,garage_photo_url,original_photo_url')
          .eq('id', carId).is('deleted_at', null).single(),
        supabase.from('jobs').select('id,title,category,brand')
          .eq('car_id', carId).eq('status','installed').order('created_at',{ascending:true}),
      ])
      if (!alive) return
      const c = (carRes.data as unknown as Car) ?? null
      setCar(c)
      const cands: Photo[] = []
      if (c?.original_photo_url) cands.push({ url: c.original_photo_url, mode:'full',   label:'Original' })
      if (c?.garage_photo_url)   cands.push({ url: c.garage_photo_url,   mode:'cutout', label:'No BG'    })
      setPhotos(cands)
      setJobs((jobsRes.data as unknown as Job[]) ?? [])
      if (carRes.data) setCoverIdx(seedFrom(carId) % TEMPLATES.length)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [])

  // ── z-index at rest ───────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    if (isTurningRef.current) return
    pageEls.current.forEach((el, i) => { if (el) el.style.zIndex = i === pageIdx ? '3' : '1' })
  }, [pageIdx])

  // ── turn helpers ──────────────────────────────────────────────────────────────

  // Fold-line sweep: clip-path reveals/hides pages; transformOrigin tracks the fold;
  // slight rotateY tilt makes the kept slice recede at the crease.
  // foldOverlayRef = cream paper-back fills the folded-over region
  // foldLineRef    = thin bright crease strip at the fold edge
  function applyTransforms(p: number, dir: 'fwd'|'back') {
    const fromIdx = pageIdxRef.current
    const toIdx   = dir === 'fwd' ? fromIdx + 1 : fromIdx - 1
    const fromEl  = pageEls.current[fromIdx]
    const toEl    = pageEls.current[toIdx]
    const overlay = foldOverlayRef.current
    const stripe  = foldLineRef.current
    if (!fromEl || !toEl) return

    const W = window.innerWidth
    const s = Math.sin(p * Math.PI)
    const cA = Math.min(1, Math.max(0, (1 - p) / 0.15))
    // Paper-back color matches the interior page background so dark themes don't show cream
    const pb  = theme.pageBg  // e.g. '#111116' for knockout-white, '#faf8f4' for top-band
    const pr  = parseInt(pb.slice(1,3),16), pg2 = parseInt(pb.slice(3,5),16), pbl = parseInt(pb.slice(5,7),16)
    const paperRgba = (a: number) => `rgba(${pr},${pg2},${pbl},${a})`

    if (dir === 'fwd') {
      // Fold line moves right→left: at p=0 it's at 100% (right edge), at p=1 it's at 0% (left)
      const foldPct = (1 - p) * 100
      // Front face: clip away everything right of the fold line; tilt the remaining slice
      fromEl.style.clipPath        = `inset(0 ${p * 100}% 0 0)`
      fromEl.style.transformOrigin = `${foldPct}% 50%`
      fromEl.style.transform       = `perspective(${W * 2.5}px) rotateY(${-p * 14}deg)`
      // Paper-back: cream fill right of fold line (shadow at crease edge, cream further right)
      if (overlay) {
        overlay.style.left       = `${foldPct}%`
        overlay.style.right      = '0'
        overlay.style.width      = 'auto'
        overlay.style.background = `linear-gradient(90deg,
          rgba(0,0,0,${0.55 * s}) 0%,
          rgba(0,0,0,${0.15 * s}) 10%,
          ${paperRgba(cA)} 28%,
          ${paperRgba(cA * 0.92)} 100%)`
        overlay.style.opacity    = '1'
      }
      if (stripe) {
        stripe.style.left       = `calc(${foldPct}% - 3px)`
        stripe.style.width      = '6px'
        stripe.style.background = `linear-gradient(90deg,
          rgba(0,0,0,${0.25 * s}) 0%,
          rgba(255,255,255,${0.7 * s}) 40%,
          rgba(0,0,0,${0.06 * s}) 100%)`
        stripe.style.opacity    = '1'
      }
    } else {
      // Back turn: clean reverse-wipe — current page clips away left-to-right,
      // previous page shows through directly underneath. No paper-back overlay
      // (you never see the back of the page going backward; that's forward-turn physics).
      // A cast shadow from the folding edge falls on the arriving page for depth.
      const foldPct = p * 100
      fromEl.style.clipPath        = `inset(0 0 0 ${p * 100}%)`
      fromEl.style.transform       = 'none'
      fromEl.style.transformOrigin = ''
      // Hide the cream overlay — cover shows through cleanly
      if (overlay) overlay.style.opacity = '0'
      // Cast shadow on the arriving page: a gradient that follows the fold edge
      // and peaks at mid-turn, giving depth to the wipe without a cream wall
      if (stripe) {
        stripe.style.left       = `calc(${foldPct}% - 18px)`
        stripe.style.width      = '18px'
        stripe.style.background = `linear-gradient(90deg,
          transparent 0%,
          rgba(0,0,0,${0.22 * s}) 60%,
          rgba(0,0,0,${0.38 * s}) 100%)`
        stripe.style.opacity    = '1'
      }
    }
    toEl.style.transform  = 'none'
    toEl.style.clipPath   = ''
  }

  function finishTurn(completed: boolean) {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    progressRef.current = 0
    const dir     = turnDirRef.current
    const fromIdx = pageIdxRef.current

    // Hide fold elements first (cream is already transparent at p=1 due to cA fade)
    if (foldOverlayRef.current) {
      const o = foldOverlayRef.current
      o.style.opacity = '0'; o.style.left = '0'; o.style.right = '0'; o.style.width = 'auto'
    }
    if (foldLineRef.current) foldLineRef.current.style.opacity = '0'
    shadowEls.current.forEach((el) => { if (el) el.style.opacity = '0' })

    if (completed) {
      const nxt   = dir === 'fwd' ? fromIdx + 1 : fromIdx - 1
      const nxtEl = pageEls.current[nxt]
      const fromEl = pageEls.current[fromIdx]
      // 1. Promote arriving page to front BEFORE clearing leaving page's clip-path
      //    so there's never a frame where the leaving page is unclipped and on top.
      if (nxtEl) { nxtEl.style.zIndex = '4'; nxtEl.style.clipPath = ''; nxtEl.style.transform = 'none'; nxtEl.style.transformOrigin = '' }
      // 2. Now safe to reset leaving page (it's behind the arriving page)
      if (fromEl) { fromEl.style.zIndex = '1'; fromEl.style.clipPath = ''; fromEl.style.transform = 'none'; fromEl.style.transformOrigin = '' }
      // 3. Reset all other pages
      pageEls.current.forEach((el, i) => {
        if (el && i !== nxt && i !== fromIdx) { el.style.clipPath = ''; el.style.transform = 'none'; el.style.transformOrigin = ''; el.style.zIndex = '1' }
      })
      pageIdxRef.current = nxt
      setPageIdx(nxt)
    } else {
      // Snap back — just reset the leaving page
      const fromEl = pageEls.current[fromIdx]
      if (fromEl) { fromEl.style.clipPath = ''; fromEl.style.transform = 'none'; fromEl.style.transformOrigin = ''; fromEl.style.zIndex = '3' }
      // Reset arriving page (it was armed but never completed)
      const abortIdx = dir === 'fwd' ? fromIdx + 1 : fromIdx - 1
      const abortEl  = pageEls.current[abortIdx]
      if (abortEl) { abortEl.style.clipPath = ''; abortEl.style.transform = 'none'; abortEl.style.transformOrigin = ''; abortEl.style.zIndex = '1' }
    }

    isTurningRef.current = false
    setIsTurning(false)
  }

  function animateTo(from: number, to: number, dir: 'fwd'|'back', cb: (done: boolean) => void) {
    // Completing (to=1): ease-out cubic — physical deceleration, no hard snap.
    // Aborting (to=0): ease-in so it accelerates back quickly.
    const completing = to >= 1
    const dist = Math.abs(to - from)
    const dur  = Math.max(240, dist * 540) // 540ms full turn feels like real paper
    const t0 = performance.now(), delta = to - from
    const run = (now: number) => {
      const t = Math.min((now - t0) / dur, 1)
      // Ease-out cubic when completing, ease-in-out when snapping back
      const e = completing
        ? 1 - Math.pow(1 - t, 3)
        : t < 0.5 ? 2*t*t : -1+(4-2*t)*t
      progressRef.current = from + delta * e
      applyTransforms(progressRef.current, dir)
      if (t < 1) { rafRef.current = requestAnimationFrame(run) } else { cb(to >= 1) }
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(run)
  }

  function runTurn(dir: 'fwd'|'back') {
    if (isTurningRef.current) return
    const fromIdx = pageIdxRef.current
    const toIdx   = dir === 'fwd' ? fromIdx + 1 : fromIdx - 1
    if (toIdx < 0 || toIdx >= NUM_PAGES) return
    isTurningRef.current = true
    turnDirRef.current   = dir
    setIsTurning(true)
    // Leaving page on top (z=4), arriving page reveals below (z=2), fold elements on z=3/5
    const fromEl = pageEls.current[fromIdx], toEl = pageEls.current[toIdx]
    if (fromEl) fromEl.style.zIndex = '4'
    if (toEl)   { toEl.style.zIndex = '2'; toEl.style.transform = 'none'; toEl.style.clipPath = '' }
    // Arm fold elements
    if (foldOverlayRef.current) { foldOverlayRef.current.style.zIndex = '3'; foldOverlayRef.current.style.opacity = '0' }
    if (foldLineRef.current)    { foldLineRef.current.style.zIndex = '5';    foldLineRef.current.style.opacity    = '0' }
    applyTransforms(0, dir)
    animateTo(0, 1, dir, finishTurn)
  }

  // ── stable refs for non-passive touchmove ─────────────────────────────────────
  const applyRef   = useRef(applyTransforms)
  const finishRef  = useRef(finishTurn)
  const animateRef = useRef(animateTo)
  applyRef.current   = applyTransforms
  finishRef.current  = finishTurn
  animateRef.current = animateTo

  useEffect(() => {
    const container = document.getElementById('feat-container')
    if (!container) return
    const onMove = (e: TouchEvent) => {
      if (touchStartXRef.current === null) return
      const dx = e.touches[0].clientX - touchStartXRef.current
      const dy = e.touches[0].clientY - (touchStartYRef.current ?? 0)

      if (!isDragTurnRef.current) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
        if (Math.abs(dy) > Math.abs(dx) * 0.85) { touchStartXRef.current = null; return }
        const pg = pageIdxRef.current
        const startX = touchStartXRef.current!
        const W = window.innerWidth
        // Cover: right-30% zone dragging left = page turn forward
        if (pg === 0 && dx < 0 && startX >= W * 0.70) {
          isDragTurnRef.current = true
          isTurningRef.current  = true
          turnDirRef.current    = 'fwd'
          setIsTurning(true)
          const fromEl = pageEls.current[0], toEl = pageEls.current[1]
          if (fromEl) fromEl.style.zIndex = '4'
          if (toEl)   { toEl.style.zIndex = '2'; toEl.style.transform = 'none'; toEl.style.clipPath = '' }
          if (foldOverlayRef.current) { foldOverlayRef.current.style.zIndex = '3'; foldOverlayRef.current.style.opacity = '0' }
          if (foldLineRef.current)    { foldLineRef.current.style.zIndex = '5';    foldLineRef.current.style.opacity    = '0' }
        } else if (pg > 0 && dx > 0) {
          // Spec/Mods: drag right = go back
          isDragTurnRef.current = true
          isTurningRef.current  = true
          turnDirRef.current    = 'back'
          setIsTurning(true)
          const fromEl = pageEls.current[pg], toEl = pageEls.current[pg - 1]
          if (fromEl) fromEl.style.zIndex = '4'
          if (toEl)   { toEl.style.zIndex = '2'; toEl.style.transform = 'none'; toEl.style.clipPath = '' }
          if (foldOverlayRef.current) { foldOverlayRef.current.style.zIndex = '3'; foldOverlayRef.current.style.opacity = '0' }
          if (foldLineRef.current)    { foldLineRef.current.style.zIndex = '5';    foldLineRef.current.style.opacity    = '0' }
        } else {
          touchStartXRef.current = null; return
        }
      }

      e.preventDefault()
      const dir   = turnDirRef.current
      const rawDx = dir === 'fwd' ? -dx : dx
      const p     = Math.min(Math.max(rawDx / (window.innerWidth * 0.65), 0), 1)
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
    isDragTurnRef.current  = false
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const endX = e.changedTouches[0].clientX
    if (isDragTurnRef.current) {
      isDragTurnRef.current  = false
      touchStartXRef.current = null
      const p = progressRef.current, dir = turnDirRef.current
      if (p >= 0.35) animateRef.current(p, 1, dir, finishRef.current)
      else           animateRef.current(p, 0, dir, () => finishRef.current(false))
      return
    }
    // Template cycling on cover via swipe
    if (touchStartXRef.current !== null && pageIdx === 0 && !isTurning) {
      const dx = endX - touchStartXRef.current
      const dy = e.changedTouches[0].clientY - (touchStartYRef.current ?? 0)
      if (Math.abs(dx) > 44 && Math.abs(dy) < 70) cycleCover(dx < 0 ? 1 : -1)
    }
    touchStartXRef.current = null
  }

  // ── derived values ────────────────────────────────────────────────────────────
  const seed       = useMemo(() => seedFrom((car?.nickname ?? '') + (car?.year ?? '')), [car])
  const rng        = useMemo(() => mulberry32(seed || 1), [seed])
  const purchaseYear = car?.purchase_date ? new Date(car.purchase_date).getFullYear() : null
  const vol        = purchaseYear ? Math.max(1, new Date().getFullYear() - purchaseYear + 1) : 1
  const issue      = useMemo(() => 1 + Math.floor(rng() * 12), [rng])
  const carName    = [car?.year, car?.make, car?.model, car?.variant].filter(Boolean).join(' ') || 'YOUR BUILD'
  const headline   = (car?.nickname || car?.model || 'YOUR BUILD').toString()
  const fi         = car?.forced_induction && car.forced_induction !== 'none' ? car.forced_induction.replace('-',' ') : null
  const powerLine  = [car?.horsepower ? `${car.horsepower} HP` : null, fi, car?.drivetrain ? car.drivetrain.toUpperCase() : null].filter(Boolean).join(' · ')
  const bars       = useMemo(() => { const r = mulberry32((seed||1)^0x9e3779b9); return Array.from({length:20},()=>2+Math.floor(r()*4)) },[seed])
  const barNum     = useMemo(() => String(70000+Math.floor(rng()*29999))+' '+String(10+Math.floor(rng()*89)),[rng])
  const t          = TEMPLATES[coverIdx]
  const theme      = INTERIOR_THEMES[t.id] ?? INTERIOR_THEMES['top-band']
  const photo      = photos[photoIdx] ?? null
  const cycleCover = (dir: number) => setCoverIdx(p => (p + dir + TEMPLATES.length) % TEMPLATES.length)
  const bottomColor = t.textOnPhoto === 'light' ? '#f5f5f5' : '#0a0a0a'

  const grouped = useMemo(() => {
    const g: Record<string,Job[]> = { power:[], chassis:[], exterior:[], interior:[] }
    for (const job of jobs) {
      const grp = job.category ? CAT_TO_GROUP[job.category] : undefined
      if (grp) g[grp].push(job)
    }
    return g
  }, [jobs])

  if (loading) return <div style={{ position:'fixed', inset:0, background:'#08080a' }} />

  return (
    <div
      id="feat-container"
      style={{ position:'fixed', inset:0, background:'#000', overflow:'hidden', userSelect:'none', WebkitUserSelect:'none' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ─── perspective stage ─── */}
      <div style={{ position:'absolute', inset:0, perspective:'700px', perspectiveOrigin:'50% 50%' }}>

        {/* ══ PAGE 0: COVER ══ */}
        <div
          ref={el => { pageEls.current[0] = el }}
          style={{ position:'absolute', inset:0, willChange:'transform', zIndex:3 }}
        >
          {/* Cover content — key triggers the fade-in on template change */}
          <div key={t.id} style={{ position:'absolute', inset:0, animation:`featFade 320ms ${EASING_SETTLE} both` }}>
            <div style={{ position:'absolute', inset:0, background:t.surfaceBg }} />
            {photo && (
              <img src={photo.url} alt=""
                style={photo.mode==='cutout'
                  ? { position:'absolute', inset:'auto 0 5% 0', width:'100%', height:'68%', objectFit:'contain', objectPosition:'center' }
                  : { position:'absolute', top:0, left:0, width:'100%', height:'64%', objectFit:'cover', objectPosition:'center 42%' }}
              />
            )}
            {!photo && (
              <div style={{ position:'absolute', inset:0, display:'grid', placeItems:'center' }}>
                <span style={{ fontFamily:FONT_DECK, color:'rgba(245,245,245,0.45)', letterSpacing:'0.3em', fontSize:11, textTransform:'uppercase' }}>Add a cover photo</span>
              </div>
            )}
            {t.vignette && <div style={{ position:'absolute', inset:0, pointerEvents:'none', background:'radial-gradient(ellipse at 50% 42%, transparent 45%, rgba(20,16,10,0.32) 100%)' }} />}
            {t.scrim && !t.band && <div style={{ position:'absolute', top:0, left:0, right:0, height:'34%', pointerEvents:'none', background:'linear-gradient(180deg,rgba(0,0,0,0.62) 0%,rgba(0,0,0,0.25) 55%,transparent 100%)' }} />}
            {t.textOnPhoto==='light' && <div style={{ position:'absolute', left:0, right:0, bottom:0, height:'50%', pointerEvents:'none', background:'linear-gradient(0deg,rgba(0,0,0,0.82) 0%,rgba(0,0,0,0.38) 45%,transparent 100%)' }} />}

            {t.band
              ? <div style={{ position:'absolute', top:0, left:0, right:0, background:t.bandBg, padding:'12px 16px 9px' }}>
                  <Masthead t={t} size={40} /><TopStrip accent={t.accent} dark vol={vol} issue={issue} purchaseYear={purchaseYear} />
                </div>
              : <div style={{ position:'absolute', top:0, left:0, right:0, padding:'52px 16px 10px' }}>
                  <Masthead t={t} size={46} /><TopStrip accent={t.accent} dark={false} vol={vol} issue={issue} purchaseYear={purchaseYear} />
                </div>
            }

            <div style={{ position:'absolute', left:16, right:16, bottom:96 }}>
              <span style={{ display:'inline-block', fontFamily:FONT_DECK, fontWeight:600, fontSize:11, letterSpacing:'0.22em', textTransform:'uppercase', color:'#fff', background:t.accent, padding:'3px 8px', marginBottom:10 }}>Feature Car</span>
              <div style={{ fontFamily:FONT_MASTHEAD, color:bottomColor, lineHeight:0.92, fontSize:headline.length>12?44:58, textTransform:'uppercase', textShadow:t.textOnPhoto==='light'?'0 2px 14px rgba(0,0,0,0.5)':'none' }}>{headline}</div>
              <div style={{ fontFamily:FONT_DECK, fontWeight:500, color:bottomColor, opacity:0.92, fontSize:14, letterSpacing:'0.04em', textTransform:'uppercase', marginTop:8 }}>{carName}{car?.trim?` ${car.trim}`:''}</div>
              {powerLine && <div style={{ fontFamily:FONT_DECK, fontWeight:600, color:t.accent, fontSize:13, letterSpacing:'0.06em', textTransform:'uppercase', marginTop:4 }}>{powerLine}</div>}
            </div>

            {/* barcode */}
            <div style={{ position:'absolute', left:12, bottom:16, background:'#f4f1ea', padding:'5px 6px', display:'flex', flexDirection:'row', alignItems:'stretch', gap:4 }}>
              <div style={{ display:'flex', flexDirection:'column', width:40 }}>
                {bars.map((h,i) => <div key={i} style={{ height:h, width:'100%', background:i%2?'#f4f1ea':'#0a0a0a' }} />)}
              </div>
              <div style={{ writingMode:'vertical-rl', fontFamily:FONT_DECK, fontSize:7, letterSpacing:'0.12em', color:'#0a0a0a' }}>{barNum}</div>
            </div>

            <span style={{ position:'absolute', right:12, bottom:12, fontFamily:FONT_DECK, fontWeight:600, fontSize:9, letterSpacing:'0.3em', color:bottomColor, opacity:0.8 }}>GDIMENSION.APP</span>

            {/* glossy sheen */}
            <div style={{ position:'absolute', inset:0, pointerEvents:'none', background:'radial-gradient(120% 60% at 75% 8%, rgba(255,255,255,0.16) 0%, transparent 42%)', mixBlendMode:'screen' }} />
            <div style={{ position:'absolute', inset:0, pointerEvents:'none', opacity:0.03, mixBlendMode:'screen', backgroundImage:"url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")" }} />
            {/* right-edge spine gutter */}
            <div style={{ position:'absolute', top:0, right:0, bottom:0, width:28, pointerEvents:'none', background:'linear-gradient(270deg,rgba(0,0,0,0.2) 0%,rgba(0,0,0,0.05) 60%,transparent 100%)' }} />
          </div>

          {/* "INSIDE ▸" chip — outside keyed wrapper so it doesn't flash on template change */}
          {!isTurning && (
            <div
              onClick={() => runTurn('fwd')}
              style={{ position:'absolute', right:12, bottom:50, zIndex:9, fontFamily:FONT_DECK, fontWeight:700, fontSize:9.5, letterSpacing:'0.24em', textTransform:'uppercase', color:'#f5f5f5', background:'rgba(0,0,0,0.58)', border:'1px solid rgba(245,245,245,0.38)', padding:'7px 12px', cursor:'pointer' }}>
              INSIDE ▸
            </div>
          )}

          {/* corner curl — static hint that grows during drag from right zone */}
          <CornerCurl color={t.textOnPhoto==='light' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)'} />

          {/* fold shadow — AFTER all content */}
          <div ref={el => { shadowEls.current[0] = el }}
            style={{ position:'absolute', inset:0, pointerEvents:'none', opacity:0,
              background:'linear-gradient(270deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 35%, transparent 70%)' }} />
        </div>

        {/* ══ PAGE 1: SPEC SPREAD ══ */}
        <div
          ref={el => { pageEls.current[1] = el }}
          style={{ position:'absolute', inset:0, willChange:'transform', zIndex:1 }}
        >
          <SpecSpread car={car} grouped={grouped} carName={carName} powerLine={powerLine}
            purchaseYear={purchaseYear} theme={theme} vol={vol} issue={issue}
            onNext={() => runTurn('fwd')} onBack={() => runTurn('back')} />
          <div ref={el => { shadowEls.current[1] = el }}
            style={{ position:'absolute', inset:0, pointerEvents:'none', opacity:0,
              background:'linear-gradient(90deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 35%, transparent 70%)' }} />
        </div>

        {/* ══ PAGE 2: MODS SPREAD ══ */}
        <div
          ref={el => { pageEls.current[2] = el }}
          style={{ position:'absolute', inset:0, willChange:'transform', zIndex:1 }}
        >
          <ModsSpread car={car} grouped={grouped} totalMods={jobs.length} theme={theme} vol={vol} issue={issue}
            onBack={() => runTurn('back')} />
          <div ref={el => { shadowEls.current[2] = el }}
            style={{ position:'absolute', inset:0, pointerEvents:'none', opacity:0,
              background:'linear-gradient(90deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 35%, transparent 70%)' }} />
        </div>

        {/* ── paper-back overlay — cream face of the folding leaf ── */}
        <div ref={foldOverlayRef}
          style={{ position:'absolute', top:0, bottom:0, pointerEvents:'none', opacity:0 }} />

        {/* ── fold crease strip — bright edge highlight ── */}
        <div ref={foldLineRef}
          style={{ position:'absolute', top:0, bottom:0, pointerEvents:'none', opacity:0 }} />

      </div>

      {/* ─── chrome (always on top) ─── */}
      <div onClick={() => navigate('/home')}
        style={{ position:'absolute', top:14, left:12, zIndex:30, fontFamily:FONT_DECK, fontSize:30, lineHeight:1, color:COLOR_ACCENT, cursor:'pointer', textShadow:'0 1px 6px rgba(0,0,0,0.6)', pointerEvents:isTurning?'none':'auto' }}>
        ‹
      </div>

      {/* Cover chrome — template switcher + dots */}
      {pageIdx === 0 && !isTurning && (
        <>
          <div style={{ position:'absolute', top:18, left:0, right:0, textAlign:'center', zIndex:20, fontFamily:FONT_DECK, fontWeight:600, fontSize:9, letterSpacing:'0.28em', textTransform:'uppercase', color:'rgba(245,245,245,0.55)', pointerEvents:'none' }}>
            Cover {coverIdx+1}/{TEMPLATES.length} · {t.name}
          </div>
          {photos.length > 1 && (
            <div onClick={() => setPhotoIdx(p=>(p+1)%photos.length)}
              style={{ position:'absolute', top:48, right:12, zIndex:20, fontFamily:FONT_DECK, fontWeight:600, fontSize:9, letterSpacing:'0.16em', textTransform:'uppercase', color:'#f5f5f5', background:'rgba(0,0,0,0.55)', border:'1px solid rgba(245,245,245,0.35)', padding:'5px 9px', cursor:'pointer' }}>
              Photo ▸ {photo?.label??'—'}
            </div>
          )}
          <div onClick={() => cycleCover(-1)} style={{ position:'absolute', top:'30%', bottom:'22%', left:0, width:'26%', zIndex:15 }} />
          <div onClick={() => cycleCover(1)}  style={{ position:'absolute', top:'30%', bottom:'22%', right:0, width:'22%', zIndex:15 }} />
          <div style={{ position:'absolute', bottom:6, left:0, right:0, display:'flex', justifyContent:'center', gap:6, zIndex:20 }}>
            {TEMPLATES.map((tp,i) => (
              <div key={tp.id} onClick={() => setCoverIdx(i)}
                style={{ width:i===coverIdx?16:6, height:6, borderRadius:3, background:i===coverIdx?COLOR_ACCENT:'rgba(245,245,245,0.4)', transition:`all 200ms ${EASING_SETTLE}`, cursor:'pointer' }} />
            ))}
          </div>
        </>
      )}

      {/* Page progress dots on spread pages */}
      {pageIdx > 0 && !isTurning && (
        <div style={{ position:'absolute', bottom:52, left:0, right:0, display:'flex', justifyContent:'center', gap:5, zIndex:20, pointerEvents:'none' }}>
          {Array.from({length:NUM_PAGES},(_,i) => (
            <div key={i} style={{ width:i===pageIdx?14:5, height:5, borderRadius:3, background:i===pageIdx?theme.accent:'rgba(0,0,0,0.2)', transition:`all 200ms ${EASING_SETTLE}` }} />
          ))}
        </div>
      )}

      <style>{`
        @keyframes featFade { from { opacity:0 } to { opacity:1 } }
      `}</style>
    </div>
  )
}

// ─── CornerCurl ───────────────────────────────────────────────────────────────
// Static visual hint at bottom-right that the page is turnable
function CornerCurl({ color }: { color: string }) {
  return (
    <div style={{ position:'absolute', bottom:0, right:0, width:52, height:52, pointerEvents:'none', zIndex:8 }}>
      {/* Triangular fold shadow */}
      <div style={{ position:'absolute', bottom:0, right:0, width:0, height:0,
        borderStyle:'solid', borderWidth:'0 0 52px 52px',
        borderColor:`transparent transparent ${color} transparent` }} />
      {/* Bright highlight on the fold edge */}
      <div style={{ position:'absolute', bottom:2, right:2, width:0, height:0,
        borderStyle:'solid', borderWidth:'0 0 22px 22px',
        borderColor:'transparent transparent rgba(255,255,255,0.22) transparent' }} />
    </div>
  )
}

// ─── Masthead ─────────────────────────────────────────────────────────────────
function Masthead({ t, size }: { t: Template; size: number }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
      <h1 style={{ fontFamily:FONT_MASTHEAD, color:t.mastColor, margin:0, lineHeight:0.82, fontSize:size, letterSpacing:'-0.01em', fontStyle:'italic', transform:'skewX(-6deg)', textShadow:t.band?'none':'0 2px 16px rgba(0,0,0,0.55)' }}>G-DIMENSION</h1>
      {t.logo && <img src={gLogo} alt="" style={{ height:size*0.82, width:'auto', flexShrink:0 }} />}
    </div>
  )
}
function TopStrip({ accent, dark, vol, issue, purchaseYear }:{ accent:string; dark:boolean; vol:number; issue:number; purchaseYear:number|null }) {
  const col = dark ? '#0a0a0a' : '#f5f5f5'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:4, fontFamily:FONT_DECK, fontWeight:600, fontSize:9.5, letterSpacing:'0.12em', textTransform:'uppercase', color:col, textShadow:dark?'none':'0 1px 6px rgba(0,0,0,0.6)' }}>
      <span style={{ color:accent }}>VOL.{vol} NO.{issue}</span>
      <span>· Your Build. Featured.</span>
      {purchaseYear && <span style={{ marginLeft:'auto' }}>Since {purchaseYear}</span>}
    </div>
  )
}

// ─── SpecSpread (Page 1) ──────────────────────────────────────────────────────
// Fixed layout — all content fits on screen, no scrolling
interface SpecSpreadProps {
  car:Car|null; grouped:Record<string,Job[]>; carName:string; powerLine:string
  purchaseYear:number|null; theme:InteriorTheme; vol:number; issue:number
  onNext:()=>void; onBack:()=>void
}
function SpecSpread({ car, grouped, carName, powerLine, purchaseYear, theme, vol, issue, onNext, onBack }: SpecSpreadProps) {
  const stats = [
    car?.horsepower    ? { label:'POWER',          value:`${car.horsepower} HP` } : null,
    car?.drivetrain    ? { label:'DRIVETRAIN',      value:car.drivetrain.toUpperCase() } : null,
    (car?.forced_induction&&car.forced_induction!=='none') ? { label:'FORCED INDUCTION', value:car.forced_induction!.replace('-',' ').toUpperCase() } : null,
    car?.year          ? { label:'YEAR',            value:String(car.year) } : null,
    car?.trim          ? { label:'TRIM',            value:car.trim.toUpperCase() } : null,
    purchaseYear       ? { label:'SINCE',           value:String(purchaseYear) } : null,
  ].filter(Boolean) as { label:string; value:string }[]

  const activeGroups = GROUP_ORDER.filter(k => grouped[k].length > 0)

  return (
    <div style={{ position:'absolute', inset:0, background:theme.pageBg, display:'flex', flexDirection:'column', overflow:'hidden' }}>

      {/* left spine gutter */}
      <div style={{ position:'absolute', top:0, left:0, bottom:0, width:28, pointerEvents:'none', zIndex:4,
        background:`linear-gradient(90deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.05) 60%, transparent 100%)` }} />

      {/* running head */}
      <div style={{ background:theme.menuHeaderBg, padding:'10px 16px 8px 28px', display:'flex', alignItems:'baseline', justifyContent:'space-between', flexShrink:0 }}>
        <span style={{ fontFamily:FONT_MASTHEAD, color:theme.menuHeaderInk, fontSize:19, fontStyle:'italic', letterSpacing:'-0.01em' }}>G-DIMENSION</span>
        <span style={{ fontFamily:FONT_DECK, color:theme.menuHeaderInk, opacity:0.6, fontSize:8, letterSpacing:'0.26em', textTransform:'uppercase' }}>VOL.{vol} NO.{issue} · SPEC</span>
      </div>

      {/* body — flex column, fills remaining height exactly */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', padding:'14px 14px 0 28px', minHeight:0 }}>

        {/* car identity */}
        <div style={{ flexShrink:0, marginBottom:10 }}>
          <div style={{ fontFamily:FONT_MASTHEAD, color:theme.ink, fontSize:32, lineHeight:0.9, textTransform:'uppercase', fontStyle:'italic', letterSpacing:'-0.02em' }}>
            {[car?.year,car?.make,car?.model].filter(Boolean).join(' ')||carName}
          </div>
          {car?.variant && <div style={{ fontFamily:FONT_DECK, color:theme.accent, fontWeight:600, fontSize:10, letterSpacing:'0.18em', textTransform:'uppercase', marginTop:4 }}>{car.variant}</div>}
          {car?.nickname && <div style={{ fontFamily:FONT_TITLE, color:theme.accent, fontSize:18, fontStyle:'italic', marginTop:2, letterSpacing:'0.01em' }}>"{car.nickname}"</div>}
          <div style={{ height:1, background:theme.rule, margin:'8px 0' }} />
          <div style={{ fontFamily:FONT_DECK, fontWeight:600, color:theme.subInk, fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase' }}>{powerLine||carName}</div>
        </div>

        {/* two-column body: stats left, mods right */}
        <div style={{ flex:1, display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, minHeight:0 }}>

          {/* left: stats grid */}
          <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
            <div style={{ fontFamily:FONT_DECK, fontWeight:700, color:theme.accent, fontSize:7.5, letterSpacing:'0.3em', textTransform:'uppercase', marginBottom:6 }}>SPECS</div>
            {stats.map(s => (
              <div key={s.label} style={{ background:`${theme.ink}08`, padding:'7px 10px', marginBottom:2 }}>
                <div style={{ fontFamily:FONT_DECK, color:theme.subInk, fontSize:7, letterSpacing:'0.22em', textTransform:'uppercase', marginBottom:1 }}>{s.label}</div>
                <div style={{ fontFamily:FONT_MASTHEAD, color:theme.ink, fontSize:16, lineHeight:1, fontStyle:'italic' }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* right: mod highlights (2 per group) */}
          <div style={{ display:'flex', flexDirection:'column' }}>
            <div style={{ fontFamily:FONT_DECK, fontWeight:700, color:theme.accent, fontSize:7.5, letterSpacing:'0.3em', textTransform:'uppercase', marginBottom:6 }}>BUILD HIGHLIGHTS</div>
            {activeGroups.length === 0
              ? <div style={{ fontFamily:FONT_DECK, color:theme.subInk, fontSize:9, letterSpacing:'0.08em', textTransform:'uppercase', opacity:0.5, marginTop:8 }}>No mods logged yet</div>
              : activeGroups.map(grpKey => (
                <div key={grpKey} style={{ marginBottom:8 }}>
                  <div style={{ fontFamily:FONT_DECK, fontWeight:700, color:theme.accent, fontSize:7, letterSpacing:'0.26em', textTransform:'uppercase', marginBottom:3 }}>{GROUP_LABELS[grpKey]}</div>
                  {grouped[grpKey].slice(0,2).map(job => (
                    <div key={job.id} style={{ fontFamily:FONT_DECK, color:theme.ink, fontSize:11, lineHeight:1.5, paddingLeft:10, position:'relative' }}>
                      <span style={{ position:'absolute', left:0, top:0, color:theme.accent, fontSize:10 }}>·</span>
                      {[job.brand,job.title].filter(Boolean).join(' ')||'—'}
                    </div>
                  ))}
                  {grouped[grpKey].length > 2 && (
                    <div style={{ fontFamily:FONT_DECK, color:theme.subInk, fontSize:8.5, letterSpacing:'0.1em', textTransform:'uppercase', paddingLeft:10, opacity:0.5 }}>+{grouped[grpKey].length-2} more</div>
                  )}
                </div>
              ))
            }
          </div>

        </div>

      </div>

      {/* folio */}
      <div style={{ padding:'8px 14px 8px 28px', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:`1px solid ${theme.rule}`, flexShrink:0, background:theme.pageBg }}>
        <div onClick={onBack} style={{ fontFamily:FONT_DECK, fontWeight:700, fontSize:9, letterSpacing:'0.22em', textTransform:'uppercase', color:theme.accent, cursor:'pointer', padding:'4px 0' }}>‹ COVER</div>
        <span style={{ fontFamily:FONT_DECK, fontWeight:600, fontSize:7.5, letterSpacing:'0.28em', textTransform:'uppercase', color:theme.subInk, opacity:0.55 }}>GDIMENSION.APP</span>
        <div onClick={onNext} style={{ fontFamily:FONT_DECK, fontWeight:700, fontSize:9, letterSpacing:'0.22em', textTransform:'uppercase', color:theme.accent, cursor:'pointer', padding:'4px 0' }}>FULL BUILD ›</div>
      </div>

      <div style={{ position:'absolute', inset:0, pointerEvents:'none', opacity:0.025, mixBlendMode:'multiply',
        backgroundImage:"url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")" }} />
    </div>
  )
}

// ─── ModsSpread (Page 2) ──────────────────────────────────────────────────────
interface ModsSpreadProps {
  car:Car|null; grouped:Record<string,Job[]>; totalMods:number; theme:InteriorTheme; vol:number; issue:number
  onBack:()=>void
}
function ModsSpread({ car, grouped, totalMods, theme, vol, issue, onBack }: ModsSpreadProps) {
  const activeGroups = GROUP_ORDER.filter(k => grouped[k].length > 0)
  const carShortName = [car?.make, car?.model].filter(Boolean).join(' ') || 'BUILD'

  return (
    <div style={{ position:'absolute', inset:0, background:theme.pageBg, display:'flex', flexDirection:'column', overflow:'hidden' }}>

      {/* left spine gutter */}
      <div style={{ position:'absolute', top:0, left:0, bottom:0, width:28, pointerEvents:'none', zIndex:4,
        background:`linear-gradient(90deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.05) 60%, transparent 100%)` }} />

      {/* running head */}
      <div style={{ background:theme.menuHeaderBg, padding:'10px 16px 8px 28px', display:'flex', alignItems:'baseline', justifyContent:'space-between', flexShrink:0 }}>
        <span style={{ fontFamily:FONT_MASTHEAD, color:theme.menuHeaderInk, fontSize:19, fontStyle:'italic', letterSpacing:'-0.01em' }}>G-DIMENSION</span>
        <span style={{ fontFamily:FONT_DECK, color:theme.menuHeaderInk, opacity:0.6, fontSize:8, letterSpacing:'0.26em', textTransform:'uppercase' }}>VOL.{vol} NO.{issue} · BUILD</span>
      </div>

      {/* page title */}
      <div style={{ padding:'12px 14px 8px 28px', flexShrink:0, borderBottom:`1px solid ${theme.rule}` }}>
        <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between' }}>
          <div style={{ fontFamily:FONT_MASTHEAD, color:theme.ink, fontSize:26, lineHeight:1, textTransform:'uppercase', fontStyle:'italic', letterSpacing:'-0.02em' }}>
            FULL BUILD
          </div>
          <div style={{ fontFamily:FONT_DECK, fontWeight:700, color:theme.accent, fontSize:9, letterSpacing:'0.18em', textTransform:'uppercase' }}>
            {totalMods} MOD{totalMods!==1?'S':''} · {carShortName}
          </div>
        </div>
      </div>

      {/* 2-column mods grid */}
      <div style={{ flex:1, padding:'10px 14px 0 28px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 16px', alignContent:'start', minHeight:0, overflow:'hidden' }}>
        {activeGroups.length === 0
          ? <div style={{ gridColumn:'1/-1', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:FONT_DECK, color:theme.subInk, fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase', opacity:0.5 }}>
              Add mods in Tuning to fill this spread
            </div>
          : activeGroups.map(grpKey => (
            <div key={grpKey} style={{ marginBottom:12 }}>
              {/* group header */}
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
                <div style={{ flex:1, height:1, background:theme.rule }} />
                <div style={{ fontFamily:FONT_DECK, fontWeight:700, color:theme.accent, fontSize:7.5, letterSpacing:'0.3em', textTransform:'uppercase' }}>{GROUP_LABELS[grpKey]}</div>
                <div style={{ flex:1, height:1, background:theme.rule }} />
              </div>
              {/* items — max 6 per group in this compact format */}
              {grouped[grpKey].slice(0,6).map(job => (
                <div key={job.id} style={{ fontFamily:FONT_DECK, color:theme.ink, fontSize:11, lineHeight:1.6, paddingLeft:10, position:'relative', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  <span style={{ position:'absolute', left:0, top:0, color:theme.accent, fontSize:10 }}>·</span>
                  {[job.brand,job.title].filter(Boolean).join(' ')||'—'}
                </div>
              ))}
              {grouped[grpKey].length>6 && (
                <div style={{ fontFamily:FONT_DECK, color:theme.subInk, fontSize:8.5, letterSpacing:'0.1em', textTransform:'uppercase', paddingLeft:10, opacity:0.5, marginTop:1 }}>
                  +{grouped[grpKey].length-6} more
                </div>
              )}
            </div>
          ))
        }
      </div>

      {/* folio */}
      <div style={{ padding:'8px 14px 8px 28px', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:`1px solid ${theme.rule}`, flexShrink:0, background:theme.pageBg }}>
        <div onClick={onBack} style={{ fontFamily:FONT_DECK, fontWeight:700, fontSize:9, letterSpacing:'0.22em', textTransform:'uppercase', color:theme.accent, cursor:'pointer', padding:'4px 0' }}>‹ SPECS</div>
        <span style={{ fontFamily:FONT_DECK, fontWeight:600, fontSize:7.5, letterSpacing:'0.28em', textTransform:'uppercase', color:theme.subInk, opacity:0.55 }}>GDIMENSION.APP</span>
        <span style={{ fontFamily:FONT_MASTHEAD, color:theme.ink, fontSize:17, fontStyle:'italic', opacity:0.6 }}>03</span>
      </div>

      <div style={{ position:'absolute', inset:0, pointerEvents:'none', opacity:0.025, mixBlendMode:'multiply',
        backgroundImage:"url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")" }} />
    </div>
  )
}
