// Route: /featured — "Featured" magazine (aesthetic island)
// Dynamic book: Cover → Photo Spread(s) (0–2) → Spec Sheet (1–2). 2–5 pages total.
// Page turn: fold-line sweep via clip-path + transformOrigin-at-fold + slight rotateY tilt.
//   The fold line travels across the page; left of it: original content (clipped, slightly tilting).
//   Right of it: paper-back overlay (cream with shadow gradient) + bright crease strip.
//   Arriving page is static below. No full-page rotation — feels like a real paper fold.
// Swipe L/R on cover = cycle templates. Drag from right-30% = turn forward.
//   Interior: drag right = back, drag left = forward (when a next page exists).
import type React from 'react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import { playBack } from '../lib/sound'
import ArrivalFade from '../components/ArrivalFade'
import {
  FONT_MASTHEAD, FONT_DECK, FONT_TITLE,
  COLOR_BRAND, COLOR_ACCENT, EASING_SETTLE,
} from '../tokens'
import gLogo from '../assets/logo/gdimensionG.png'

// ─── types ────────────────────────────────────────────────────────────────────
interface Car {
  id: string
  year: number | null; make: string | null; model: string | null; variant: string | null
  trim: string | null; nickname: string | null; horsepower: number | null; torque: number | null
  engine_type: string | null; transmission: string | null
  forced_induction: string | null; drivetrain: string | null; purchase_date: string | null
  current_mileage: number | null
  showcase_photo_url: string | null; garage_photo_url: string | null; original_photo_url: string | null
  build_sheet_power_photo: string | null; build_sheet_chassis_photo: string | null
  build_sheet_exterior_photo: string | null; build_sheet_interior_photo: string | null
}
interface Job { id: string; title: string | null; category: string | null; brand: string | null; part_type_name: string | null }
type Photo = { url: string; mode: 'full' | 'cutout'; label: string }
type PhotoItem = { url: string; caption: string | null }
type JobPhoto = { photo_url: string; caption: string | null }

// Spec Sheet data model
interface SpecRow { label: string; value: string }
interface SpecSection { title: string; rows: SpecRow[]; moreCount?: number }

// Page descriptor — the book is assembled from these after data load
type PageKind = 'cover' | 'photo' | 'spec'
interface PageDesc {
  kind: PageKind
  label: string                  // folio short label
  photos?: PhotoItem[]
  arrangement?: number           // seed-derived collage variant (dominant top/bottom)
  sections?: SpecSection[]       // spec-sheet sections on this page
  isCont?: boolean               // continuation spec page
}

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

// ─── build-sheet grouping (frontend display logic ONLY — no DB column) ──────────
const CAT_TO_GROUP: Record<string, 'power' | 'chassis' | 'exterior' | 'interior'> = {
  'Engine':'power','Drivetrain':'power','Forced Induction':'power','Exhaust':'power','Cooling':'power','Fuel System':'power','Electrical':'power',
  'Suspension':'chassis','Brakes':'chassis','Wheels & Tires':'chassis',
  'Exterior':'exterior','Paint & Wrap':'exterior','Lighting':'exterior',
  'Interior':'interior','Audio':'interior','Safety':'interior',
}
const GROUP_ORDER = ['power','chassis','exterior','interior'] as const
const GROUP_LABELS: Record<string,string> = { power:'POWER', chassis:'CHASSIS', exterior:'EXTERIOR', interior:'INTERIOR' }
const MAX_ROWS_PER_GROUP = 8

// ─── spec-sheet section builder ─────────────────────────────────────────────────
function buildSpecSections(car: Car | null, grouped: Record<string,Job[]>, purchaseYear: number | null): SpecSection[] {
  const info: SpecRow[] = []
  const ymm = [car?.year, car?.make, car?.model].filter(Boolean).join(' ')
  if (ymm)                                                            info.push({ label:'Year / Make / Model', value: ymm })
  if (car?.trim)                                                      info.push({ label:'Trim', value: car.trim })
  if (car?.engine_type)                                              info.push({ label:'Engine', value: car.engine_type })
  if (car?.horsepower)                                               info.push({ label:'Peak Horsepower', value:`${car.horsepower} HP` })
  if (car?.torque)                                                   info.push({ label:'Peak Torque', value:`${car.torque} lb-ft` })
  if (car?.forced_induction && car.forced_induction !== 'none')      info.push({ label:'Forced Induction', value: car.forced_induction.replace('-',' ') })
  if (car?.drivetrain)                                               info.push({ label:'Drivetrain', value: car.drivetrain.toUpperCase() })
  if (car?.transmission)                                             info.push({ label:'Transmission', value: car.transmission })
  if (car?.current_mileage != null)                                  info.push({ label:'Mileage', value:`${car.current_mileage.toLocaleString()} mi` })
  if (purchaseYear)                                                  info.push({ label:'Owned Since', value: String(purchaseYear) })

  const sections: SpecSection[] = [{ title:'VEHICLE INFORMATION', rows: info }]
  for (const g of GROUP_ORDER) {
    const js = grouped[g]
    if (!js || js.length === 0) continue
    const all = js.map(j => ({
      label: j.part_type_name || j.category || 'Part',
      value: [j.brand, j.title].filter(Boolean).join(' ') || '—',
    }))
    const rows = all.slice(0, MAX_ROWS_PER_GROUP)
    sections.push({ title: GROUP_LABELS[g], rows, moreCount: all.length - rows.length })
  }
  return sections
}

// Greedy pagination — splits sections into at most two Spec Sheet pages at section
// boundaries. Estimates row heights against the fixed page height; overflow:hidden
// on the page is the safety net so nothing ever scrolls.
const SEC_HEADER_H = 26, SEC_ROW_H = 18, SEC_GAP = 11
function sectionHeight(s: SpecSection): number {
  return SEC_HEADER_H + s.rows.length * SEC_ROW_H + (s.moreCount ? SEC_ROW_H : 0) + SEC_GAP
}
function paginateSpec(sections: SpecSection[], availFirst: number, availCont: number): SpecSection[][] {
  const pages: SpecSection[][] = [[]]
  let used = 0, pi = 0
  for (const s of sections) {
    const avail = pi === 0 ? availFirst : availCont
    const need  = sectionHeight(s)
    if (pages[pi].length > 0 && used + need > avail && pi < 1) { pi = 1; pages.push([]); used = 0 }
    pages[pi].push(s); used += need
  }
  return pages
}

// ─── tagline generator (cover — unchanged; kept for a later editorial session) ──
const LUXURY_MAKES = new Set(['lexus','bmw','mercedes','mercedes-benz','cadillac','audi','infiniti','acura','genesis','porsche','maserati','rolls-royce','bentley','jaguar'])

function generateTagline(
  car: Car, totalMods: number,
  grouped: Record<string, { length: number }>,
  purchaseYear: number | null,
  rng: () => number
): string {
  const hp          = car.horsepower ?? 0
  const fi          = car.forced_induction && car.forced_induction !== 'none'
  const fiLabel     = fi ? car.forced_induction!.replace('-', ' ') : ''
  const dr          = (car.drivetrain ?? '').toUpperCase()
  const powerMods   = grouped.power?.length  ?? 0
  const chassisMods = grouped.chassis?.length ?? 0
  const mi          = car.current_mileage ?? 0
  const yearsOwned  = purchaseYear ? Math.max(0, new Date().getFullYear() - purchaseYear) : 0
  const isLuxury    = LUXURY_MAKES.has((car.make ?? '').toLowerCase())

  const pick = <T,>(arr: T[]) => arr[Math.floor(rng() * arr.length)]

  let p1: string, p2: string

  if (fi && hp >= 400) {
    p1 = pick(['Boost-fed build', 'Forced induction machine', `${fiLabel} equipped`])
    p2 = `${hp}hp through ${dr || 'the wheels'}`
  } else if (fi && powerMods >= 3) {
    p1 = pick([`${fiLabel} powered`, 'Forced induction build', 'Boosted and built'])
    p2 = pick(['Maximum power, street registered', 'Built for the long pull', `${hp > 0 ? hp+'hp' : 'Tuned'} and street ready`])
  } else if (fi) {
    p1 = pick([`${fiLabel} equipped`, 'Boost on demand'])
    p2 = pick(['Streetable power delivery', 'Daily driven, boost fed'])
  } else if (hp >= 400) {
    p1 = pick(['All-motor performance', 'Naturally aspirated build', 'Breathing free, pulling hard'])
    p2 = `${hp}hp of pure intent`
  } else if (isLuxury && mi > 100000 && chassisMods >= 2) {
    p1 = pick(['High mileage, high standards', `${Math.round(mi/1000)}k miles, still earning it`])
    p2 = pick(['Luxury smooth meets sporty handling', 'Pampered and performance-tuned'])
  } else if (isLuxury && totalMods >= 5) {
    p1 = pick(['Luxury meets performance', 'Where refinement meets speed', 'Beyond factory spec'])
    p2 = pick(['Grand touring, reimagined', 'Built beyond the showroom', 'Elevated in every detail'])
  } else if (isLuxury) {
    p1 = pick(['Refined grand tourer', 'Luxury smooth', 'Elegance with intent'])
    p2 = pick(['Built for the distance', 'Meticulously maintained', 'Every detail considered'])
  } else if (mi > 150000) {
    p1 = `${Math.round(mi/1000)}k miles and still going strong`
    p2 = pick(['Routinely pampered', 'Meticulously maintained', 'Every mile well earned'])
  } else if (mi > 100000) {
    p1 = pick(['High mileage, high standards', `${Math.round(mi/1000)}k on the clock`])
    p2 = pick(['Built to outlast expectations', 'Routinely pampered, always ready'])
  } else if (totalMods >= 14) {
    p1 = pick(['Nothing left stock', 'Built from the ground up', 'Comprehensive modification list'])
    p2 = `${totalMods} modifications and counting`
  } else if (chassisMods >= 3 && powerMods <= 1) {
    p1 = pick(['Corner-carver setup', 'Chassis-first build', 'Suspension dialed in'])
    p2 = pick(['Handling before horsepower', 'Built for the twisties', 'Precision over power'])
  } else if (powerMods >= 4 && chassisMods >= 2) {
    p1 = pick(['Power and chassis in balance', 'All-around performance build'])
    p2 = pick(['Built fast, set up right', 'Every system upgraded'])
  } else if (totalMods >= 6) {
    p1 = pick(['Thoughtfully modified', 'Carefully curated build', 'Built with purpose'])
    p2 = pick(['Style meets substance', 'Every mod chosen carefully', 'Quality over quantity'])
  } else if (totalMods > 0) {
    p1 = pick(['Tastefully modified', 'Subtly upgraded', 'Restrained but purposeful'])
    p2 = pick(['Less is more, done right', 'Clean build, clear vision'])
  } else if (yearsOwned >= 8) {
    p1 = pick([`${yearsOwned} years of ownership`, 'Long-term relationship'])
    p2 = pick(['Preserved with pride', 'Original and proud of it'])
  } else {
    p1 = pick(['As the factory intended', 'Stock specification'])
    p2 = pick(['Preserved in original condition', 'Clean and unmolested'])
  }

  return `${p1} · ${p2}`
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function FeaturedPage() {
  const navigate = useNavigate()
  const [car, setCar]       = useState<Car | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])       // cover photo candidates (original / no-bg)
  const [photoIdx, setPhotoIdx] = useState(0)
  const [jobs, setJobs]     = useState<Job[]>([])
  const [jobPhotos, setJobPhotos] = useState<JobPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [coverIdx, setCoverIdx] = useState(0)
  const [pageIdx, setPageIdx]   = useState(0) // 0=cover
  const [isTurning, setIsTurning] = useState(false)
  const [photoAspect, setPhotoAspect] = useState<number|null>(null)

  // ── DOM refs: one per page (sized dynamically) ────────────────────────────────
  const pageEls   = useRef<(HTMLDivElement | null)[]>([])
  const shadowEls = useRef<(HTMLDivElement | null)[]>([])
  // fold-line elements (shared, not per-page)
  const foldOverlayRef = useRef<HTMLDivElement>(null)  // paper-back face
  const foldLineRef    = useRef<HTMLDivElement>(null)  // bright crease strip

  // ── turn state refs ───────────────────────────────────────────────────────────
  const isTurningRef = useRef(false)
  const pageIdxRef   = useRef(0)
  const turnDirRef   = useRef<'fwd'|'back'>('fwd')
  const progressRef  = useRef(0)
  const rafRef       = useRef<number|null>(null)
  const pagesLenRef  = useRef(1)   // live page count for the non-passive touch handler

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
      const [carRes, jobsRes, jobPhotosRes] = await Promise.all([
        supabase.from('cars')
          .select('id,year,make,model,variant,trim,nickname,horsepower,torque,engine_type,transmission,forced_induction,drivetrain,purchase_date,current_mileage,showcase_photo_url,garage_photo_url,original_photo_url,build_sheet_power_photo,build_sheet_chassis_photo,build_sheet_exterior_photo,build_sheet_interior_photo')
          .eq('id', carId).is('deleted_at', null).single(),
        supabase.from('jobs').select('id,title,category,brand,part_types(name)')
          .eq('car_id', carId).eq('type','modification').eq('status','installed').order('created_at',{ascending:true}),
        supabase.from('job_photos').select('photo_url,caption')
          .eq('car_id', carId).order('created_at',{ascending:false}),
      ])
      if (!alive) return
      const c = (carRes.data as unknown as Car) ?? null
      setCar(c)
      const cands: Photo[] = []
      if (c?.original_photo_url) cands.push({ url: c.original_photo_url, mode:'full',   label:'Original' })
      if (c?.garage_photo_url)   cands.push({ url: c.garage_photo_url,   mode:'cutout', label:'No BG'    })
      setPhotos(cands)
      // jobs — flatten the embedded part_types(name) (PostgREST may return obj or array)
      const jobRows = (jobsRes.data as unknown as Array<{ id:string; title:string|null; category:string|null; brand:string|null; part_types: { name:string|null } | { name:string|null }[] | null }>) ?? []
      setJobs(jobRows.map(r => {
        const pt = Array.isArray(r.part_types) ? r.part_types[0] : r.part_types
        return { id:r.id, title:r.title, category:r.category, brand:r.brand, part_type_name: pt?.name ?? null }
      }))
      setJobPhotos((jobPhotosRes.data as unknown as JobPhoto[]) ?? [])
      if (carRes.data) setCoverIdx(seedFrom(carId) % TEMPLATES.length)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [])

  // ── derived: seed from car.id so renames never reshuffle the issue ─────────────
  const seed       = useMemo(() => seedFrom(car?.id ?? ''), [car?.id])
  const rng        = useMemo(() => mulberry32(seed || 1), [seed])
  const purchaseYear = car?.purchase_date ? new Date(car.purchase_date).getFullYear() : null
  const vol        = purchaseYear ? Math.max(1, new Date().getFullYear() - purchaseYear + 1) : 1
  const issue      = useMemo(() => 1 + Math.floor(rng() * 12), [rng])
  const carName    = [car?.year, car?.make, car?.model, car?.variant].filter(Boolean).join(' ') || 'YOUR BUILD'
  const carShortName = [car?.make, car?.model].filter(Boolean).join(' ') || 'BUILD'
  const fi         = car?.forced_induction && car.forced_induction !== 'none' ? car.forced_induction.replace('-',' ') : null
  const powerLine  = [car?.horsepower ? `${car.horsepower} HP` : null, fi, car?.drivetrain ? car.drivetrain.toUpperCase() : null].filter(Boolean).join(' · ')
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

  // Tagline — cover only (separate RNG seed; engine fills this later)
  const tagline = useMemo(() => {
    if (!car) return ''
    const tRng = mulberry32((seed || 1) ^ 0xf00dcafe)
    return generateTagline(car, jobs.length, grouped, purchaseYear, tRng)
  }, [car, jobs.length, grouped, purchaseYear, seed])

  // ── photo pool (priority: build-group photos, then job photos newest-first) ────
  const photoPool = useMemo<PhotoItem[]>(() => {
    if (!car) return []
    const used = new Set<string>()
    if (car.original_photo_url) used.add(car.original_photo_url)   // cover photo
    if (car.garage_photo_url)   used.add(car.garage_photo_url)     // cover photo (cutout)
    const pool: PhotoItem[] = []
    const groupPhotos = [car.build_sheet_power_photo, car.build_sheet_chassis_photo, car.build_sheet_exterior_photo, car.build_sheet_interior_photo]
    for (const u of groupPhotos) if (u && !used.has(u)) { pool.push({ url:u, caption:null }); used.add(u) }
    for (const jp of jobPhotos) {
      if (jp.photo_url && !used.has(jp.photo_url)) { pool.push({ url: jp.photo_url, caption: jp.caption?.trim() || null }); used.add(jp.photo_url) }
    }
    return pool
  }, [car, jobPhotos])

  // ── photo spreads: 0 / 1 / 2 pages, deterministic collage arrangement ──────────
  const photoSpreads = useMemo(() => {
    const capped = photoPool.slice(0, 8)
    if (capped.length === 0) return [] as { photos: PhotoItem[]; arrangement: number }[]
    const lrng = mulberry32((seed || 1) ^ 0xa17de51)
    const chunks: PhotoItem[][] = capped.length <= 4
      ? [capped]
      : [capped.slice(0, Math.ceil(capped.length / 2)), capped.slice(Math.ceil(capped.length / 2))]
    return chunks.map(ph => ({ photos: ph, arrangement: Math.floor(lrng() * 2) }))
  }, [photoPool, seed])

  // ── spec-sheet pages (1–2, split at a section boundary) ────────────────────────
  const specPages = useMemo(() => {
    const sections = buildSpecSections(car, grouped, purchaseYear)
    const vh = typeof window !== 'undefined' ? window.innerHeight : 780
    const availFirst = vh - 149   // running head + title block + folio + body padding
    const availCont  = vh - 115   // running head + small cont header + folio + body padding
    return paginateSpec(sections, availFirst, availCont)
  }, [car, grouped, purchaseYear])

  // ── assemble the book ──────────────────────────────────────────────────────────
  const pages = useMemo<PageDesc[]>(() => {
    const arr: PageDesc[] = [{ kind:'cover', label:'COVER' }]
    photoSpreads.forEach(ps => arr.push({ kind:'photo', label:'PHOTOS', photos: ps.photos, arrangement: ps.arrangement }))
    specPages.forEach((secs, i) => arr.push({ kind:'spec', label:'SPEC SHEET', sections: secs, isCont: i > 0 }))
    return arr
  }, [photoSpreads, specPages])

  useEffect(() => { pagesLenRef.current = pages.length }, [pages.length])

  // Clamp current page if the book shrank (e.g. data reloaded smaller)
  useEffect(() => {
    if (pageIdx > pages.length - 1) { const n = Math.max(0, pages.length - 1); pageIdxRef.current = n; setPageIdx(n) }
  }, [pages.length, pageIdx])

  // ── z-index at rest ───────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    if (isTurningRef.current) return
    pageEls.current.forEach((el, i) => { if (el) el.style.zIndex = i === pageIdx ? '3' : '1' })
  }, [pageIdx, pages.length])

  // ── turn helpers ──────────────────────────────────────────────────────────────

  // Fold-line sweep: clip-path reveals/hides pages; transformOrigin tracks the fold;
  // slight rotateY tilt makes the kept slice recede at the crease.
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
    const pb  = theme.pageBg
    const pr  = parseInt(pb.slice(1,3),16), pg2 = parseInt(pb.slice(3,5),16), pbl = parseInt(pb.slice(5,7),16)
    const paperRgba = (a: number) => `rgba(${pr},${pg2},${pbl},${a})`

    if (dir === 'fwd') {
      const foldPct = (1 - p) * 100
      fromEl.style.clipPath        = `inset(0 ${p * 100}% 0 0)`
      fromEl.style.transformOrigin = `${foldPct}% 50%`
      fromEl.style.transform       = `perspective(${W * 2.5}px) rotateY(${-p * 14}deg)`
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
      const foldPct = p * 100
      fromEl.style.clipPath        = `inset(0 0 0 ${p * 100}%)`
      fromEl.style.transform       = 'none'
      fromEl.style.transformOrigin = ''
      if (overlay) overlay.style.opacity = '0'
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
      if (nxtEl) { nxtEl.style.zIndex = '4'; nxtEl.style.clipPath = ''; nxtEl.style.transform = 'none'; nxtEl.style.transformOrigin = '' }
      if (fromEl) { fromEl.style.zIndex = '1'; fromEl.style.clipPath = ''; fromEl.style.transform = 'none'; fromEl.style.transformOrigin = '' }
      pageEls.current.forEach((el, i) => {
        if (el && i !== nxt && i !== fromIdx) { el.style.clipPath = ''; el.style.transform = 'none'; el.style.transformOrigin = ''; el.style.zIndex = '1' }
      })
      pageIdxRef.current = nxt
      setPageIdx(nxt)
    } else {
      const fromEl = pageEls.current[fromIdx]
      if (fromEl) { fromEl.style.clipPath = ''; fromEl.style.transform = 'none'; fromEl.style.transformOrigin = ''; fromEl.style.zIndex = '3' }
      const abortIdx = dir === 'fwd' ? fromIdx + 1 : fromIdx - 1
      const abortEl  = pageEls.current[abortIdx]
      if (abortEl) { abortEl.style.clipPath = ''; abortEl.style.transform = 'none'; abortEl.style.transformOrigin = ''; abortEl.style.zIndex = '1' }
    }

    isTurningRef.current = false
    setIsTurning(false)
  }

  function animateTo(from: number, to: number, dir: 'fwd'|'back', cb: (done: boolean) => void) {
    const completing = to >= 1
    const dist = Math.abs(to - from)
    const dur  = Math.max(240, dist * 540)
    const t0 = performance.now(), delta = to - from
    const run = (now: number) => {
      const tt = Math.min((now - t0) / dur, 1)
      const e = completing
        ? 1 - Math.pow(1 - tt, 3)
        : tt < 0.5 ? 2*tt*tt : -1+(4-2*tt)*tt
      progressRef.current = from + delta * e
      applyTransforms(progressRef.current, dir)
      if (tt < 1) { rafRef.current = requestAnimationFrame(run) } else { cb(to >= 1) }
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(run)
  }

  function runTurn(dir: 'fwd'|'back') {
    if (isTurningRef.current) return
    const fromIdx = pageIdxRef.current
    const toIdx   = dir === 'fwd' ? fromIdx + 1 : fromIdx - 1
    if (toIdx < 0 || toIdx >= pagesLenRef.current) return
    isTurningRef.current = true
    turnDirRef.current   = dir
    setIsTurning(true)
    const fromEl = pageEls.current[fromIdx], toEl = pageEls.current[toIdx]
    if (fromEl) fromEl.style.zIndex = '4'
    if (toEl)   { toEl.style.zIndex = '2'; toEl.style.transform = 'none'; toEl.style.clipPath = '' }
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
    const armTurn = (dir: 'fwd'|'back', fromIdx: number) => {
      isDragTurnRef.current = true
      isTurningRef.current  = true
      turnDirRef.current    = dir
      setIsTurning(true)
      const toIdx  = dir === 'fwd' ? fromIdx + 1 : fromIdx - 1
      const fromEl = pageEls.current[fromIdx], toEl = pageEls.current[toIdx]
      if (fromEl) fromEl.style.zIndex = '4'
      if (toEl)   { toEl.style.zIndex = '2'; toEl.style.transform = 'none'; toEl.style.clipPath = '' }
      if (foldOverlayRef.current) { foldOverlayRef.current.style.zIndex = '3'; foldOverlayRef.current.style.opacity = '0' }
      if (foldLineRef.current)    { foldLineRef.current.style.zIndex = '5';    foldLineRef.current.style.opacity    = '0' }
    }
    const onMove = (e: TouchEvent) => {
      if (touchStartXRef.current === null) return
      const dx = e.touches[0].clientX - touchStartXRef.current
      const dy = e.touches[0].clientY - (touchStartYRef.current ?? 0)

      if (!isDragTurnRef.current) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
        if (Math.abs(dy) > Math.abs(dx) * 0.85) { touchStartXRef.current = null; return }
        const pg = pageIdxRef.current
        const last = pagesLenRef.current - 1
        const startX = touchStartXRef.current!
        const W = window.innerWidth
        if (pg === 0 && dx < 0 && startX >= W * 0.70) {
          // Cover: drag left from the right-30% zone = turn forward
          armTurn('fwd', 0)
        } else if (pg > 0 && dx > 0) {
          // Interior: drag right = go back
          armTurn('back', pg)
        } else if (pg > 0 && dx < 0 && pg < last) {
          // Interior: drag left = go forward (when a next page exists)
          armTurn('fwd', pg)
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

  if (loading) return <div style={{ position:'fixed', inset:0, background:'#08080a' }} />

  // ── page renderer (closes over component scope) ────────────────────────────────
  const renderPageInner = (pg: PageDesc, i: number) => {
    const prev = pages[i - 1], next = pages[i + 1]
    const onBack = prev ? () => runTurn('back') : undefined
    const onNext = next ? () => runTurn('fwd')  : undefined

    if (pg.kind === 'cover') {
      return (
        <>
          {/* Cover content — key triggers the fade-in on template change */}
          <div key={t.id} style={{ position:'absolute', inset:0, animation:`featFade 320ms ${EASING_SETTLE} both` }}>
            <div style={{ position:'absolute', inset:0, background:t.surfaceBg }} />
            {photo && (
              <img src={photo.url} alt=""
                onLoad={photo.mode==='full' ? (e) => { const img = e.currentTarget; setPhotoAspect(img.naturalWidth / img.naturalHeight) } : undefined}
                style={photo.mode==='cutout'
                  ? { position:'absolute', top:'2%', left:0, right:0, width:'100%', height:'66%', objectFit:'contain', objectPosition:'center top' }
                  : (() => {
                      const h = photoAspect !== null
                        ? (photoAspect > 1.3 ? '60%' : photoAspect < 0.85 ? '72%' : '64%')
                        : '64%'
                      const pos = photoAspect !== null
                        ? (photoAspect > 1.3 ? 'center 50%' : photoAspect < 0.85 ? 'center 28%' : 'center 40%')
                        : 'center 40%'
                      return { position:'absolute' as const, top:0, left:0, width:'100%', height:h, objectFit:'cover' as const, objectPosition:pos }
                    })()}
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
                  <Masthead t={t} size={48} /><TopStrip accent={t.accent} dark vol={vol} issue={issue} purchaseYear={purchaseYear} />
                </div>
              : <div style={{ position:'absolute', top:0, left:0, right:0 }}>
                  <div style={{ padding: '10px 0 8px', marginTop: 44 }}>
                    <h1 style={{
                      fontFamily: FONT_MASTHEAD, color: t.mastColor, margin: 0, lineHeight: 0.88,
                      fontSize: 'clamp(52px, 14.5vw, 72px)', letterSpacing: '0.01em', fontStyle: 'italic',
                      textAlign: 'center', textTransform: 'uppercase', width: '100%', display: 'block', padding: '0 8px',
                      textShadow: t.id === 'knockout-white' ? '0 2px 20px rgba(0,0,0,0.7)' : 'none',
                    }}>G-DIMENSION</h1>
                  </div>
                  <TopStrip accent={t.accent} dark={t.id==='ink-black'} vol={vol} issue={issue} purchaseYear={purchaseYear} stripStyle={{ padding:'3px 14px' }} />
                </div>
            }

            <div style={!t.band
              ? { position:'absolute', left:0, right:0, bottom:90, textAlign:'center', padding:'0 20px' }
              : { position:'absolute', left:16, right:16, bottom:96 }}>
              <span style={{ display:'inline-block', fontFamily:FONT_DECK, fontWeight:600, fontSize:11, letterSpacing:'0.22em', textTransform:'uppercase', color:'#fff', background:t.accent, padding:'3px 8px', marginBottom:10 }}>Feature Car</span>
              {car?.nickname && (
                <div style={{ fontFamily:FONT_MASTHEAD, color:bottomColor, lineHeight:0.92, fontSize:car.nickname.length>12?44:58, textTransform:'uppercase', textShadow:t.textOnPhoto==='light'?'0 2px 14px rgba(0,0,0,0.5)':'none' }}>{car.nickname}</div>
              )}
              <div style={{ fontFamily:FONT_MASTHEAD, color:bottomColor, lineHeight:0.95,
                fontSize: car?.nickname ? 14 : (carName.length > 18 ? 22 : 28),
                fontStyle: car?.nickname ? 'normal' : 'italic',
                textTransform:'uppercase', letterSpacing:'-0.01em',
                textShadow:t.textOnPhoto==='light'?'0 2px 10px rgba(0,0,0,0.5)':'none',
                marginTop: car?.nickname ? 8 : 4 }}>
                {carName}{car?.trim ? ` ${car.trim}` : ''}
              </div>
              {tagline && (
                <div style={{ fontFamily:FONT_TITLE, fontStyle:'italic', color:bottomColor, opacity:0.88,
                  fontSize:13.5, lineHeight:1.35, marginTop:7,
                  textShadow:t.textOnPhoto==='light'?'0 1px 8px rgba(0,0,0,0.5)':'none' }}>
                  {tagline}
                </div>
              )}
              {powerLine && <div style={{ fontFamily:FONT_DECK, fontWeight:600, color:t.accent, fontSize:12, letterSpacing:'0.06em', textTransform:'uppercase', marginTop:6 }}>{powerLine}</div>}
            </div>

            <div style={{ position:'absolute', ...(coverIdx % 2 === 0 ? { left:12, bottom:16 } : { right:12, bottom:16 }) }}>
              <Barcode seed={seed} price={`$${4 + (coverIdx % 3)}.99 US · $${6 + (coverIdx % 3)}.99 CAN`} dark={false} />
            </div>

            <span style={{ position:'absolute', ...(coverIdx % 2 === 0 ? { right:12 } : { left:12 }), bottom:12, fontFamily:FONT_DECK, fontWeight:600, fontSize:9, letterSpacing:'0.3em', color:bottomColor, opacity:0.8 }}>GDIMENSION.APP</span>

            <div style={{ position:'absolute', inset:0, pointerEvents:'none', background:'radial-gradient(120% 60% at 75% 8%, rgba(255,255,255,0.16) 0%, transparent 42%)', mixBlendMode:'screen' }} />
            {/* one-time gloss sweep on cover mount (re-runs per template flip) */}
            <div style={{ position:'absolute', inset:0, pointerEvents:'none', overflow:'hidden' }}>
              <style>{`@keyframes coverGloss { from { transform: translateX(-160%) skewX(-16deg); } to { transform: translateX(420%) skewX(-16deg); } }`}</style>
              <div style={{ position:'absolute', top:'-10%', left:0, width:'40%', height:'120%', mixBlendMode:'screen',
                background:'linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.04) 30%, rgba(255,255,255,0.14) 50%, rgba(255,255,255,0.04) 70%, transparent 100%)',
                transform:'translateX(-160%) skewX(-16deg)',
                animation:'coverGloss 1100ms cubic-bezier(0.4, 0, 0.2, 1) 600ms both' }} />
            </div>
            <div style={{ position:'absolute', inset:0, pointerEvents:'none', opacity:0.03, mixBlendMode:'screen', backgroundImage:"url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")" }} />
            <div style={{ position:'absolute', top:0, right:0, bottom:0, width:28, pointerEvents:'none', background:'linear-gradient(270deg,rgba(0,0,0,0.2) 0%,rgba(0,0,0,0.05) 60%,transparent 100%)' }} />
          </div>

          {/* "INSIDE ▸" chip — outside keyed wrapper so it doesn't flash on template change */}
          {!isTurning && next && (
            <div onClick={() => runTurn('fwd')}
              style={{ position:'absolute', right:12, bottom:50, zIndex:9, fontFamily:FONT_DECK, fontWeight:700, fontSize:9.5, letterSpacing:'0.24em', textTransform:'uppercase', color:'#f5f5f5', background:'rgba(0,0,0,0.58)', border:'1px solid rgba(245,245,245,0.38)', padding:'7px 12px', cursor:'pointer' }}>
              INSIDE ▸
            </div>
          )}

          <CornerCurl color={t.textOnPhoto==='light' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)'} />
        </>
      )
    }

    if (pg.kind === 'photo') {
      return (
        <PhotoSpread photos={pg.photos!} arrangement={pg.arrangement ?? 0} theme={theme} vol={vol} issue={issue}
          backLabel={prev?.label ?? 'COVER'} nextLabel={next?.label} pageNum={i + 1}
          onBack={onBack} onNext={onNext} />
      )
    }

    // spec
    return (
      <SpecSheet sections={pg.sections!} isCont={!!pg.isCont} theme={theme} vol={vol} issue={issue}
        totalMods={jobs.length} carShortName={carShortName}
        backLabel={prev?.label ?? 'COVER'} nextLabel={next?.label} pageNum={i + 1}
        onBack={onBack} onNext={onNext} />
    )
  }

  return (
    <div
      id="feat-container"
      style={{ position:'fixed', inset:0, background:'#000', overflow:'hidden', userSelect:'none', WebkitUserSelect:'none' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <ArrivalFade />
      {/* ─── perspective stage ─── */}
      <div style={{ position:'absolute', inset:0, perspective:'700px', perspectiveOrigin:'50% 50%' }}>

        {pages.map((pg, i) => (
          <div key={i}
            ref={el => { pageEls.current[i] = el }}
            style={{ position:'absolute', inset:0, willChange:'transform', zIndex: i === pageIdx ? 3 : 1 }}
          >
            {renderPageInner(pg, i)}
            {/* fold shadow — AFTER content; cover casts to the left, interiors to the right */}
            <div ref={el => { shadowEls.current[i] = el }}
              style={{ position:'absolute', inset:0, pointerEvents:'none', opacity:0,
                background: i === 0
                  ? 'linear-gradient(270deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 35%, transparent 70%)'
                  : 'linear-gradient(90deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 35%, transparent 70%)' }} />
          </div>
        ))}

        {/* ── paper-back overlay — face of the folding leaf ── */}
        <div ref={foldOverlayRef} style={{ position:'absolute', top:0, bottom:0, pointerEvents:'none', opacity:0 }} />
        {/* ── fold crease strip — bright edge highlight ── */}
        <div ref={foldLineRef} style={{ position:'absolute', top:0, bottom:0, pointerEvents:'none', opacity:0 }} />

      </div>

      {/* ─── chrome (always on top) ─── */}
      <div onClick={() => { playBack(); navigate('/home') }}
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

      {/* Page progress dots on interior pages */}
      {pageIdx > 0 && !isTurning && pages.length > 1 && (
        <div style={{ position:'absolute', bottom:52, left:0, right:0, display:'flex', justifyContent:'center', gap:5, zIndex:20, pointerEvents:'none' }}>
          {pages.map((_,i) => (
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
function CornerCurl({ color }: { color: string }) {
  return (
    <div style={{ position:'absolute', bottom:0, right:0, width:52, height:52, pointerEvents:'none', zIndex:8,
      transformOrigin:'bottom right', animation:'curlBreathe 6s ease-in-out 2.5s infinite' }}>
      <style>{`
        @keyframes curlBreathe {
          0%, 76%, 100% { transform: scale(1); }
          84%           { transform: scale(1.22); }
          92%           { transform: scale(1.08); }
        }
        @media (prefers-reduced-motion: reduce) { @keyframes curlBreathe { 0%, 100% { transform: scale(1); } } }
      `}</style>
      <div style={{ position:'absolute', bottom:0, right:0, width:0, height:0,
        borderStyle:'solid', borderWidth:'0 0 52px 52px',
        borderColor:`transparent transparent ${color} transparent` }} />
      <div style={{ position:'absolute', bottom:2, right:2, width:0, height:0,
        borderStyle:'solid', borderWidth:'0 0 22px 22px',
        borderColor:'transparent transparent rgba(255,255,255,0.22) transparent' }} />
    </div>
  )
}

// ─── Barcode ──────────────────────────────────────────────────────────────────
function Barcode({ seed, price, dark }: { seed: number; price: string; dark: boolean }) {
  const rng = mulberry32((seed || 1) ^ 0xdeadbeef)
  const barWidths: number[] = []
  barWidths.push(1, 1, 1)
  for (let i = 0; i < 24; i++) barWidths.push(Math.floor(rng() * 2.8) + 1)
  barWidths.push(1, 1, 1, 1, 1)
  for (let i = 0; i < 24; i++) barWidths.push(Math.floor(rng() * 2.8) + 1)
  barWidths.push(1, 1, 1)

  const bg = dark ? '#0a0a0a' : '#f4f1ea'
  const fg = dark ? '#f4f1ea' : '#0a0a0a'
  const barcodeH = 36

  return (
    <div style={{ background: bg, padding: '4px 6px 5px', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <div style={{ display: 'flex', alignItems: 'stretch', height: barcodeH, gap: '1px' }}>
        {barWidths.map((w, i) => (
          <div key={i} style={{
            width: w,
            background: i % 2 === 0 ? fg : bg,
            alignSelf: (i < 3 || i > barWidths.length - 4) ? 'stretch' : 'center',
            height: (i < 3 || i > barWidths.length - 4) ? '100%' : '88%',
          }} />
        ))}
      </div>
      <div style={{ fontFamily: FONT_DECK, fontSize: 6.5, letterSpacing: '0.14em', color: fg, textAlign: 'center', lineHeight: 1 }}>
        {price}
      </div>
    </div>
  )
}

// ─── Masthead / TopStrip (cover) ────────────────────────────────────────────────
function Masthead({ t, size }: { t: Template; size: number }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
      <h1 style={{ fontFamily:FONT_MASTHEAD, color:t.mastColor, margin:0, lineHeight:0.82, fontSize:size, letterSpacing:'-0.01em', fontStyle:'italic', transform:'skewX(-6deg)', textShadow:t.band?'none':'0 2px 16px rgba(0,0,0,0.55)' }}>G-DIMENSION</h1>
      {t.logo && <img src={gLogo} alt="" style={{ height:size*0.93, width:'auto', flexShrink:0 }} />}
    </div>
  )
}
function TopStrip({ accent, dark, vol, issue, purchaseYear, stripStyle }:{ accent:string; dark:boolean; vol:number; issue:number; purchaseYear:number|null; stripStyle?: React.CSSProperties }) {
  const col = dark ? '#0a0a0a' : '#f5f5f5'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:4, padding:'0 14px', fontFamily:FONT_DECK, fontWeight:600, fontSize:9.5, letterSpacing:'0.12em', textTransform:'uppercase', color:col, textShadow:dark?'none':'0 1px 6px rgba(0,0,0,0.6)', ...stripStyle }}>
      <span style={{ color:accent }}>VOL.{vol} NO.{issue}</span>
      <span>· Your Build. Featured.</span>
      {purchaseYear && <span style={{ marginLeft:'auto' }}>Since {purchaseYear}</span>}
    </div>
  )
}

// ─── shared interior furniture ──────────────────────────────────────────────────
// Running head — masthead + VOL/NO strip. Interior pages carry no title here; the
// only page with a visible title is the Spec Sheet (rendered separately below).
function RunningHead({ theme, vol, issue, suffix }: { theme: InteriorTheme; vol: number; issue: number; suffix?: string }) {
  return (
    <div style={{ background:theme.menuHeaderBg, padding:'10px 16px 8px 28px', display:'flex', alignItems:'baseline', justifyContent:'space-between', flexShrink:0 }}>
      <span style={{ fontFamily:FONT_MASTHEAD, color:theme.menuHeaderInk, fontSize:19, fontStyle:'italic', letterSpacing:'-0.01em' }}>G-DIMENSION</span>
      <span style={{ fontFamily:FONT_DECK, color:theme.menuHeaderInk, opacity:0.6, fontSize:8, letterSpacing:'0.26em', textTransform:'uppercase' }}>
        VOL.{vol} NO.{issue}{suffix ? ` ${suffix}` : ''}
      </span>
    </div>
  )
}

// Folio bar — back/forward labels derived from neighbor pages; last page shows the
// page number instead of a forward link.
function Folio({ theme, backLabel, nextLabel, pageNum, onBack, onNext }:
  { theme: InteriorTheme; backLabel: string; nextLabel?: string; pageNum: number; onBack?: () => void; onNext?: () => void }) {
  return (
    <div style={{ padding:'8px 14px 8px 28px', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:`1px solid ${theme.rule}`, flexShrink:0, background:theme.pageBg }}>
      <div onClick={onBack} style={{ fontFamily:FONT_DECK, fontWeight:700, fontSize:9, letterSpacing:'0.22em', textTransform:'uppercase', color:theme.accent, cursor:onBack?'pointer':'default', padding:'4px 0' }}>‹ {backLabel}</div>
      <span style={{ fontFamily:FONT_DECK, fontWeight:600, fontSize:7.5, letterSpacing:'0.28em', textTransform:'uppercase', color:theme.subInk, opacity:0.55 }}>GDIMENSION.APP</span>
      {nextLabel
        ? <div onClick={onNext} style={{ fontFamily:FONT_DECK, fontWeight:700, fontSize:9, letterSpacing:'0.22em', textTransform:'uppercase', color:theme.accent, cursor:onNext?'pointer':'default', padding:'4px 0' }}>{nextLabel} ›</div>
        : <span style={{ fontFamily:FONT_MASTHEAD, color:theme.ink, fontSize:17, fontStyle:'italic', opacity:0.6 }}>{String(pageNum).padStart(2,'0')}</span>}
    </div>
  )
}

const NOISE_OVERLAY: React.CSSProperties = {
  position:'absolute', inset:0, pointerEvents:'none', opacity:0.025, mixBlendMode:'multiply',
  backgroundImage:"url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
}
const SPINE_GUTTER: React.CSSProperties = {
  position:'absolute', top:0, left:0, bottom:0, width:28, pointerEvents:'none', zIndex:4,
  background:'linear-gradient(90deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.05) 60%, transparent 100%)',
}

// ─── PhotoSpread (interior, untitled) ───────────────────────────────────────────
// Editorial collage: one dominant photo + 1–3 supporting, arranged deterministically.
// Caption slot under each photo is always present (renders text only when written).
interface PhotoSpreadProps {
  photos: PhotoItem[]; arrangement: number; theme: InteriorTheme; vol: number; issue: number
  backLabel: string; nextLabel?: string; pageNum: number; onBack?: () => void; onNext?: () => void
}
function PhotoCell({ item, theme }: { item: PhotoItem; theme: InteriorTheme }) {
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, minHeight:0 }}>
      <div style={{ flex:1, minHeight:0, border:`1px solid ${theme.rule}`, overflow:'hidden', background:`${theme.ink}0a` }}>
        <img src={item.url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
      </div>
      {/* caption slot — present in markup so the editorial engine can fill it later */}
      <div style={{ flexShrink:0 }}>
        {item.caption && (
          <div style={{ fontFamily:FONT_DECK, color:theme.subInk, fontSize:8.5, lineHeight:1.3, letterSpacing:'0.04em', marginTop:3,
            overflow:'hidden', textOverflow:'ellipsis', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' as const }}>
            {item.caption}
          </div>
        )}
      </div>
    </div>
  )
}
function Collage({ photos, arrangement, theme }: { photos: PhotoItem[]; arrangement: number; theme: InteriorTheme }) {
  const dominantTop = arrangement === 0
  const col = (children: React.ReactNode) => <div style={{ flex:1, display:'flex', flexDirection:'column', gap:8, minHeight:0 }}>{children}</div>

  if (photos.length <= 1) {
    return <div style={{ flex:1, display:'flex', minHeight:0 }}>{photos[0] && <PhotoCell item={photos[0]} theme={theme} />}</div>
  }
  if (photos.length === 2) {
    const big   = <div style={{ flex:'1 1 58%', display:'flex', minHeight:0 }}><PhotoCell item={photos[0]} theme={theme} /></div>
    const small = <div style={{ flex:'1 1 42%', display:'flex', minHeight:0 }}><PhotoCell item={photos[1]} theme={theme} /></div>
    return col(dominantTop ? <>{big}{small}</> : <>{small}{big}</>)
  }
  if (photos.length === 3) {
    const big = <div style={{ flex:'1 1 56%', display:'flex', minHeight:0 }}><PhotoCell item={photos[0]} theme={theme} /></div>
    const row = (
      <div style={{ flex:'1 1 44%', display:'flex', gap:8, minHeight:0 }}>
        <div style={{ flex:1, display:'flex', minWidth:0 }}><PhotoCell item={photos[1]} theme={theme} /></div>
        <div style={{ flex:1, display:'flex', minWidth:0 }}><PhotoCell item={photos[2]} theme={theme} /></div>
      </div>
    )
    return col(dominantTop ? <>{big}{row}</> : <>{row}{big}</>)
  }
  // 4
  const big = <div style={{ flex:'1 1 54%', display:'flex', minHeight:0 }}><PhotoCell item={photos[0]} theme={theme} /></div>
  const row = (
    <div style={{ flex:'1 1 46%', display:'flex', gap:7, minHeight:0 }}>
      {[photos[1], photos[2], photos[3]].map((p, i) => (
        <div key={i} style={{ flex:1, display:'flex', minWidth:0 }}><PhotoCell item={p} theme={theme} /></div>
      ))}
    </div>
  )
  return col(dominantTop ? <>{big}{row}</> : <>{row}{big}</>)
}
function PhotoSpread({ photos, arrangement, theme, vol, issue, backLabel, nextLabel, pageNum, onBack, onNext }: PhotoSpreadProps) {
  return (
    <div style={{ position:'absolute', inset:0, background:theme.pageBg, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={SPINE_GUTTER} />
      <RunningHead theme={theme} vol={vol} issue={issue} />
      <div style={{ flex:1, display:'flex', flexDirection:'column', padding:'12px 14px 10px 30px', minHeight:0 }}>
        <Collage photos={photos} arrangement={arrangement} theme={theme} />
      </div>
      <Folio theme={theme} backLabel={backLabel} nextLabel={nextLabel} pageNum={pageNum} onBack={onBack} onNext={onNext} />
      <div style={NOISE_OVERLAY} />
    </div>
  )
}

// ─── SpecSheet (interior, the one titled page — D'Sport vehicle spec sheet) ──────
interface SpecSheetProps {
  sections: SpecSection[]; isCont: boolean; theme: InteriorTheme; vol: number; issue: number
  totalMods: number; carShortName: string
  backLabel: string; nextLabel?: string; pageNum: number; onBack?: () => void; onNext?: () => void
}
function SpecSheet({ sections, isCont, theme, vol, issue, totalMods, carShortName, backLabel, nextLabel, pageNum, onBack, onNext }: SpecSheetProps) {
  return (
    <div style={{ position:'absolute', inset:0, background:theme.pageBg, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={SPINE_GUTTER} />
      <RunningHead theme={theme} vol={vol} issue={issue} suffix={isCont ? '· SPEC SHEET (CONT.)' : undefined} />

      {/* title block — D'Sport masthead, reversed on the ink panel. First page only. */}
      {isCont
        ? <div style={{ background:theme.ink, padding:'7px 14px 6px 28px', flexShrink:0 }}>
            <div style={{ fontFamily:FONT_DECK, fontWeight:700, fontStyle:'italic', color:theme.pageBg, fontSize:11, letterSpacing:'0.06em', textTransform:'uppercase' }}>Vehicle Spec Sheet <span style={{ opacity:0.6 }}>· Continued</span></div>
          </div>
        : <div style={{ background:theme.ink, padding:'10px 14px 9px 28px', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:10 }}>
              <div style={{ fontFamily:FONT_MASTHEAD, color:theme.pageBg, fontSize:25, lineHeight:0.95, textTransform:'uppercase', fontStyle:'italic', letterSpacing:'-0.01em' }}>
                VEHICLE SPEC SHEET
              </div>
              <div style={{ fontFamily:FONT_DECK, fontWeight:700, color:theme.accent, fontSize:9, letterSpacing:'0.14em', textTransform:'uppercase', textAlign:'right', flexShrink:0 }}>
                {totalMods} MOD{totalMods!==1?'S':''} · {carShortName}
              </div>
            </div>
          </div>}

      {/* sections — fixed height, clipped (never scrolls) */}
      <div style={{ flex:1, padding:'12px 16px 0 28px', minHeight:0, overflow:'hidden' }}>
        {sections.map((sec, si) => (
          <div key={si} style={{ marginBottom:SEC_GAP }}>
            {/* section header — italic label + trailing rule line (D'Sport style) */}
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5, height:SEC_HEADER_H - 11, boxSizing:'border-box' }}>
              <span style={{ fontFamily:FONT_DECK, fontWeight:700, fontStyle:'italic', color:theme.ink, fontSize:13, letterSpacing:'0.02em', textTransform:'uppercase', flexShrink:0 }}>{sec.title}</span>
              <div style={{ flex:1, height:2, background:theme.ink }} />
            </div>
            {sec.rows.map((r, ri) => (
              <div key={ri} style={{ display:'flex', alignItems:'baseline', gap:8, height:SEC_ROW_H, boxSizing:'border-box' }}>
                <span style={{ width:'45%', flexShrink:0, fontFamily:FONT_DECK, color:theme.subInk, fontSize:10, letterSpacing:'0.01em', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.label}</span>
                <span style={{ flex:1, fontFamily:FONT_DECK, color:theme.ink, fontSize:10.5, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.value}</span>
              </div>
            ))}
            {sec.rows.length === 0 && (
              <div style={{ fontFamily:FONT_DECK, color:theme.subInk, fontSize:10, letterSpacing:'0.01em', opacity:0.5 }}>—</div>
            )}
            {sec.moreCount ? (
              <div style={{ fontFamily:FONT_DECK, color:theme.subInk, fontSize:9, letterSpacing:'0.06em', textTransform:'uppercase', opacity:0.55, marginTop:1 }}>+{sec.moreCount} more</div>
            ) : null}
          </div>
        ))}
      </div>

      <Folio theme={theme} backLabel={backLabel} nextLabel={nextLabel} pageNum={pageNum} onBack={onBack} onNext={onNext} />
      <div style={NOISE_OVERLAY} />
    </div>
  )
}
