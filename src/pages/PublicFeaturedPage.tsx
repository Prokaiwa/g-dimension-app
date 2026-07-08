// Route: /builds/:username/featured — Public read-only Featured magazine.
// Self-contained. No edit UI. No auth required. Data loaded from public_car_profiles.
// Same fold animation as FeaturedPage, stripped of all owner-only controls.
import type React from 'react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { CATEGORY_TO_GROUP as CAT_TO_GROUP } from '../lib/buildGroups'
import ArrivalFade from '../components/ArrivalFade'
import {
  FONT_MASTHEAD, FONT_DECK, FONT_TITLE,
  COLOR_BRAND, COLOR_ACCENT, EASING_SETTLE,
} from '../tokens'
import gLogo from '../assets/logo/gdimensionG.webp'
import { generateFeature } from '../features/featured/engine/generate'
import type { PhotoSlot } from '../features/featured/engine/generate'

// ─── types ────────────────────────────────────────────────────────────────────
interface CarData {
  id: string
  year: number | null; make: string | null; model: string | null; variant: string | null
  trim: string | null; nickname: string | null; horsepower: number | null; torque: number | null
  engine_type: string | null; transmission: string | null
  forced_induction: string | null; drivetrain: string | null; purchase_date: string | null
  current_mileage: number | null; color: string | null; is_import: boolean
  usage_type: string | null; engine_origin: string | null
  garage_photo_url: string | null; original_photo_url: string | null
  build_sheet_power_photo: string | null; build_sheet_chassis_photo: string | null
  build_sheet_exterior_photo: string | null; build_sheet_interior_photo: string | null
  cover_focus_x?: number | null; cover_focus_y?: number | null; cover_zoom?: number | null
  featured_story?: string | null
  featured_layout?: FeaturedLayout | null
  show_featured_publicly?: boolean | null
  is_public?: boolean | null
}

interface FeaturedLayout {
  published?: boolean
  headline?: string
  deck?: string
  captions?: Record<string, string>
  generated_headline?: string
  generated_deck?: string
  generated_captions?: Record<string, string>
  story_photo?: string
  story_photo_height?: number
  story_photo_pos?: number
  story_photo_focus_x?: number
  story_photo_focus_y?: number
  story_photo_zoom?: number
  template?: string
}

interface Job { id: string; title: string | null; category: string | null; brand: string | null; part_type_name: string | null }
type PhotoItem = { url: string; caption: string | null; key: string; placeholder?: string | null }

interface SpecRow { label: string; value: string }
interface SpecSection { title: string; rows: SpecRow[]; moreCount?: number }

type PageKind = 'cover' | 'photo' | 'story' | 'spec'
interface PageDesc {
  kind: PageKind
  label: string
  photos?: PhotoItem[]
  arrangement?: number
  sections?: SpecSection[]
  isCont?: boolean
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

// ─── build-sheet grouping ────────────────────────────────────────────────────
const GROUP_ORDER = ['power','chassis','exterior','interior'] as const
const GROUP_LABELS: Record<string,string> = { power:'POWER', chassis:'CHASSIS', exterior:'EXTERIOR', interior:'INTERIOR' }
const MAX_ROWS_PER_GROUP = 8

// ─── spec-sheet section builder ───────────────────────────────────────────────
function buildSpecSections(car: CarData | null, grouped: Record<string,Job[]>, purchaseYear: number | null): SpecSection[] {
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
    const all = js.map(j => ({ label: j.part_type_name || j.category || 'Part', value: j.title || '—' }))
    const rows = all.slice(0, MAX_ROWS_PER_GROUP)
    sections.push({ title: GROUP_LABELS[g], rows, moreCount: all.length - rows.length })
  }
  return sections
}

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

// ═══════════════════════════════════════════════════════════════════════════════
export default function PublicFeaturedPage() {
  const { username } = useParams<{ username: string }>()
  const navigate = useNavigate()

  const [car, setCar]       = useState<CarData | null>(null)
  const [jobs, setJobs]     = useState<Job[]>([])
  const [timelinePhotos, setTimelinePhotos] = useState<{id: string; photo_url: string; title: string | null}[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [coverIdx, setCoverIdx] = useState(0)
  const [pageIdx, setPageIdx]   = useState(0)
  const [isTurning, setIsTurning] = useState(false)
  const [photoAspect, setPhotoAspect] = useState<number|null>(null)

  // ── DOM refs ─────────────────────────────────────────────────────────────────
  const pageEls    = useRef<(HTMLDivElement | null)[]>([])
  const shadowEls  = useRef<(HTMLDivElement | null)[]>([])
  const foldOverlayRef = useRef<HTMLDivElement>(null)
  const foldLineRef    = useRef<HTMLDivElement>(null)

  // ── turn state refs ───────────────────────────────────────────────────────────
  const isTurningRef = useRef(false)
  const pageIdxRef   = useRef(0)
  const turnDirRef   = useRef<'fwd'|'back'>('fwd')
  const progressRef  = useRef(0)
  const rafRef       = useRef<number|null>(null)
  const pagesLenRef  = useRef(1)

  // ── touch refs ────────────────────────────────────────────────────────────────
  const touchStartXRef = useRef<number|null>(null)
  const touchStartYRef = useRef<number|null>(null)
  const touchStartTRef = useRef<number>(0)
  const isDragTurnRef  = useRef(false)

  // ── data fetch ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!username) { if (alive) { setNotFound(true); setLoading(false) } return }

      // Look up cars for this username from public_car_profiles (view includes username).
      const { data: profileRows, error: profileErr } = await supabase
        .from('public_car_profiles')
        .select('*')
        .eq('username', username)
        .order('created_at', { ascending: false })

      if (!alive) return
      if (profileErr || !profileRows || profileRows.length === 0) {
        setNotFound(true); setLoading(false); return
      }

      // Pick the car to show: prefer active_car_id, else first.
      const rows = profileRows as CarData[]
      const activeId = (rows[0] as unknown as { active_car_id?: string }).active_car_id
      const row = rows.find(r => r.id === activeId) ?? rows[0]

      if (!row?.is_public || row.show_featured_publicly === false) {
        setNotFound(true); setLoading(false); return
      }

      // Magazine is only live once the owner explicitly publishes.
      const parsedLayout = (() => {
        const raw: unknown = row.featured_layout
        if (!raw) return null
        if (typeof raw === 'string') {
          try { return JSON.parse(raw) as FeaturedLayout } catch { return null }
        }
        if (typeof raw === 'object') return raw as FeaturedLayout
        return null
      })()
      if ((parsedLayout as (FeaturedLayout & { published?: boolean }) | null)?.published !== true) {
        setNotFound(true); setLoading(false); return
      }
      row.featured_layout = parsedLayout

      const carId = row.id

      const [jobsRes, timelineRes] = await Promise.all([
        supabase.from('jobs').select('id,title,category,brand,part_types(name)')
          .eq('car_id', carId).eq('type','modification').eq('status','installed').order('created_at',{ascending:true}),
        supabase.from('timeline_entries')
          .select('id,photo_url,title')
          .eq('car_id', carId)
          .eq('entry_type', 'note')
          .not('photo_url', 'is', null)
          // DIY guide notes carry step photos that must never bleed into the
          // magazine — mirrors the same filter on the owner FeaturedPage.
          .not('title', 'ilike', 'DIY Guide:%')
          .order('created_at', { ascending: false })
          .limit(6),
      ])
      if (!alive) return

      setCar(row)

      // Determine cover template: featured_layout.template wins, else seed.
      const storedTemplateId = (row.featured_layout as FeaturedLayout | null)?.template
      if (storedTemplateId) {
        const idx = TEMPLATES.findIndex(t => t.id === storedTemplateId)
        if (idx >= 0) setCoverIdx(idx)
        else setCoverIdx(seedFrom(carId) % TEMPLATES.length)
      } else {
        setCoverIdx(seedFrom(carId) % TEMPLATES.length)
      }

      const jobRows = (jobsRes.data as unknown as Array<{ id:string; title:string|null; category:string|null; brand:string|null; part_types: { name:string|null } | { name:string|null }[] | null }>) ?? []
      setJobs(jobRows.map(r => {
        const pt = Array.isArray(r.part_types) ? r.part_types[0] : r.part_types
        return { id:r.id, title:r.title, category:r.category, brand:r.brand, part_type_name: pt?.name ?? null }
      }))
      setTimelinePhotos((timelineRes.data as unknown as {id: string; photo_url: string; title: string | null}[]) ?? [])
      setLoading(false)
    })()
    return () => { alive = false }
  }, [username])

  // ── derived ────────────────────────────────────────────────────────────────────
  const seed         = useMemo(() => seedFrom(car?.id ?? ''), [car?.id])
  const rng          = useMemo(() => mulberry32(seed || 1), [seed])
  const purchaseYear = car?.purchase_date ? new Date(car.purchase_date).getFullYear() : null
  const vol          = purchaseYear ? Math.max(1, new Date().getFullYear() - purchaseYear + 1) : 1
  const issue        = useMemo(() => 1 + Math.floor(rng() * 12), [rng])
  const carName      = [car?.year, car?.make, car?.model, car?.variant].filter(Boolean).join(' ') || 'YOUR BUILD'
  const carShortName = [car?.make, car?.model].filter(Boolean).join(' ') || 'BUILD'
  const fi           = car?.forced_induction && car.forced_induction !== 'none' ? car.forced_induction.replace('-',' ') : null
  const powerLine    = [car?.horsepower ? `${car.horsepower} HP` : null, fi, car?.drivetrain ? car.drivetrain.toUpperCase() : null].filter(Boolean).join(' · ')
  const t            = TEMPLATES[coverIdx]
  const theme        = INTERIOR_THEMES[t.id] ?? INTERIOR_THEMES['top-band']
  const bottomColor  = t.textOnPhoto === 'light' ? '#f5f5f5' : '#0a0a0a'
  const layout       = car?.featured_layout ?? null

  // Cover photo: original (full) preferred, else no-bg cutout
  const coverPhoto   = car?.original_photo_url
    ? { url: car.original_photo_url, mode: 'full' as const }
    : car?.garage_photo_url
    ? { url: car.garage_photo_url, mode: 'cutout' as const }
    : null
  const framed = car?.cover_zoom != null

  const fx   = car?.cover_focus_x ?? 50
  const fy   = car?.cover_focus_y ?? 50
  const zoom = car?.cover_zoom    ?? 1

  const grouped = useMemo(() => {
    const g: Record<string,Job[]> = { power:[], chassis:[], exterior:[], interior:[] }
    for (const job of jobs) {
      const grp = job.category ? CAT_TO_GROUP[job.category] : undefined
      if (grp) g[grp].push(job)
    }
    return g
  }, [jobs])

  const engineFeature = useMemo(() => {
    if (!car || !car.year || !car.make || !car.model) return null
    const modData = jobs.map(j => ({ category: j.category ?? 'Unknown', status: 'installed' as const }))
    const groupKeys = ['power', 'chassis', 'exterior', 'interior'] as const
    const groupCols = ['build_sheet_power_photo', 'build_sheet_chassis_photo', 'build_sheet_exterior_photo', 'build_sheet_interior_photo'] as const
    const slots: PhotoSlot[] = []
    for (let i = 0; i < groupKeys.length; i++) {
      const url = car[groupCols[i]]
      if (url) slots.push({ id: `bsg:${groupKeys[i]}`, type: 'build_group', group: groupKeys[i] })
    }
    for (const tp of timelinePhotos) {
      if (tp.photo_url) slots.push({ id: `tl:${tp.id}`, type: 'full_body' })
    }
    return generateFeature(
      {
        id: car.id,
        year: car.year,
        make: car.make,
        model: car.model,
        trim: car.trim,
        color: car.color,
        is_import: car.is_import ?? false,
        engine_type: car.engine_type,
        engine_origin: car.engine_origin as 'original' | 'swapped' | null,
        forced_induction: car.forced_induction as 'none' | 'turbo' | 'supercharged' | 'twin-turbo' | 'e-boost' | 'other' | null,
        horsepower: car.horsepower,
        current_mileage: car.current_mileage,
        drivetrain: car.drivetrain as 'rwd' | 'fwd' | 'awd' | '4wd' | null,
        purchase_date: car.purchase_date,
        usage_type: car.usage_type,
        chassis_code: null,
      },
      modData,
      null,
      { distance_unit: 'mi', power_unit: 'hp' },
      slots,
    )
  }, [car, jobs, timelinePhotos])

  // Effective cover copy: user override wins, else engine, else car name
  const coverHeadline = layout?.headline?.trim() || engineFeature?.headline || carName
  const coverDeck     = layout?.deck?.trim() || engineFeature?.deck || ''

  // Photo pool
  const photoPool = useMemo<(PhotoItem & { baseCaption: string | null })[]>(() => {
    if (!car) return []
    const used = new Set<string>()
    if (car.original_photo_url) used.add(car.original_photo_url)
    if (car.garage_photo_url)   used.add(car.garage_photo_url)
    const pool: (PhotoItem & { baseCaption: string | null })[] = []
    const groupKeys = ['power', 'chassis', 'exterior', 'interior'] as const
    const groupPhotos = [car.build_sheet_power_photo, car.build_sheet_chassis_photo, car.build_sheet_exterior_photo, car.build_sheet_interior_photo]
    for (let i = 0; i < groupPhotos.length; i++) {
      const u = groupPhotos[i]
      if (u && !used.has(u)) { pool.push({ url:u, key:`bsg:${groupKeys[i]}`, caption:null, baseCaption:null }); used.add(u) }
    }
    for (const tp of timelinePhotos) {
      if (tp.photo_url && !used.has(tp.photo_url)) { pool.push({ url: tp.photo_url, key:`tl:${tp.id}`, caption: tp.title ?? null, baseCaption: tp.title ?? null }); used.add(tp.photo_url) }
    }
    return pool
  }, [car, timelinePhotos])

  const photoPoolFinal = useMemo<PhotoItem[]>(() => {
    const overrides = layout?.captions ?? {}
    return photoPool.map(item => {
      const engineCap = engineFeature?.captions[item.key] ?? null
      const def       = item.baseCaption ?? engineCap
      const override  = overrides[item.key]?.trim() || null
      return { url: item.url, key: item.key, caption: override ?? def, placeholder: def }
    })
  }, [photoPool, engineFeature, layout])

  const photoSpreads = useMemo(() => {
    const capped = photoPoolFinal.slice(0, 8)
    if (capped.length === 0) return [] as { photos: PhotoItem[]; arrangement: number }[]
    const lrng = mulberry32((seed || 1) ^ 0xa17de51)
    const chunks: PhotoItem[][] = capped.length <= 4
      ? [capped]
      : [capped.slice(0, Math.ceil(capped.length / 2)), capped.slice(Math.ceil(capped.length / 2))]
    return chunks.map(ph => ({ photos: ph, arrangement: Math.floor(lrng() * 2) }))
  }, [photoPoolFinal, seed])

  const specPages = useMemo(() => {
    const sections = buildSpecSections(car, grouped, purchaseYear)
    const vh = typeof window !== 'undefined' ? window.innerHeight : 780
    const availFirst = vh - 149
    const availCont  = vh - 115
    return paginateSpec(sections, availFirst, availCont)
  }, [car, grouped, purchaseYear])

  const pages = useMemo<PageDesc[]>(() => {
    const arr: PageDesc[] = [{ kind:'cover', label:'COVER' }]
    photoSpreads.forEach(ps => arr.push({ kind:'photo', label:'PHOTOS', photos: ps.photos, arrangement: ps.arrangement }))
    if (car?.featured_story?.trim()) arr.push({ kind:'story', label:'THE STORY' })
    specPages.forEach((secs, i) => arr.push({ kind:'spec', label:'SPEC SHEET', sections: secs, isCont: i > 0 }))
    return arr
  }, [photoSpreads, specPages, car?.featured_story])

  useEffect(() => { pagesLenRef.current = pages.length }, [pages.length])

  // Clamp current page if book shrank
  useEffect(() => {
    if (pageIdx > pages.length - 1) { const n = Math.max(0, pages.length - 1); pageIdxRef.current = n; setPageIdx(n) }
  }, [pages.length, pageIdx])

  useLayoutEffect(() => {
    if (isTurningRef.current) return
    pageEls.current.forEach((el, i) => { if (el) el.style.zIndex = i === pageIdx ? '3' : '1' })
  }, [pageIdx, pages.length])

  // ── fold animation engine ─────────────────────────────────────────────────────
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
      const nxt    = dir === 'fwd' ? fromIdx + 1 : fromIdx - 1
      const nxtEl  = pageEls.current[nxt]
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
    const t0   = performance.now(), delta = to - from
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

  // Stable refs for non-passive touchmove
  const applyRef   = useRef(applyTransforms)
  const finishRef  = useRef(finishTurn)
  const animateRef = useRef(animateTo)
  applyRef.current   = applyTransforms
  finishRef.current  = finishTurn
  animateRef.current = animateTo

  // Disable browser pull-to-refresh while the magazine is open (restored on unmount).
  useEffect(() => {
    const html = document.documentElement, body = document.body
    const prevHtml = html.style.overscrollBehaviorY, prevBody = body.style.overscrollBehaviorY
    html.style.overscrollBehaviorY = 'none'
    body.style.overscrollBehaviorY = 'none'
    return () => { html.style.overscrollBehaviorY = prevHtml; body.style.overscrollBehaviorY = prevBody }
  }, [])

  useEffect(() => {
    const container = document.getElementById('pub-feat-container')
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
        if (Math.abs(dy) > Math.abs(dx) * 1.5) { touchStartXRef.current = null; return }
        const pg   = pageIdxRef.current
        const last = pagesLenRef.current - 1
        if (pg === 0 && dx < 0) {
          armTurn('fwd', 0)
        } else if (pg > 0 && dx > 0) {
          armTurn('back', pg)
        } else if (pg > 0 && dx < 0 && pg < last) {
          armTurn('fwd', pg)
        } else {
          touchStartXRef.current = null; return
        }
      }

      e.preventDefault()
      const dir   = turnDirRef.current
      const rawDx = dir === 'fwd' ? -dx : dx
      const p     = Math.min(Math.max(rawDx / (window.innerWidth * 0.45), 0), 1)
      progressRef.current = p
      applyRef.current(p, dir)
    }
    container.addEventListener('touchmove', onMove, { passive: false })
    return () => container.removeEventListener('touchmove', onMove)
    // Re-attach once the container actually exists (after loading / not-found gates).
  }, [loading, notFound])

  function handleTouchStart(e: React.TouchEvent) {
    if (isTurningRef.current) return
    touchStartXRef.current = e.touches[0].clientX
    touchStartYRef.current = e.touches[0].clientY
    touchStartTRef.current = Date.now()
    isDragTurnRef.current  = false
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const endX = e.changedTouches[0].clientX
    if (isDragTurnRef.current) {
      const startX = touchStartXRef.current
      isDragTurnRef.current  = false
      touchStartXRef.current = null
      const p = progressRef.current, dir = turnDirRef.current
      // Commit on a quick flick even if the drag was short (see FeaturedPage).
      const dt    = Date.now() - touchStartTRef.current
      const moved = startX !== null ? Math.abs(endX - startX) : 0
      // Commit on any deliberate swipe (modest drag or flick) — see FeaturedPage.
      const flick = dt < 500 && moved > 30
      if (p >= 0.18 || flick) animateRef.current(p, 1, dir, finishRef.current)
      else                    animateRef.current(p, 0, dir, () => finishRef.current(false))
      return
    }
    touchStartXRef.current = null
  }

  if (loading) return <div style={{ position:'fixed', inset:0, background:'#08080a' }} />
  if (notFound) {
    return (
      <div style={{ position:'fixed', inset:0, background:'#08080a', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16 }}>
        <span style={{ fontFamily:FONT_DECK, color:'rgba(245,245,245,0.4)', letterSpacing:'0.3em', fontSize:11, textTransform:'uppercase' }}>Featured not available</span>
        <button onClick={() => navigate(`/builds/${username ?? ''}`)}
          style={{ fontFamily:FONT_DECK, fontWeight:700, fontSize:11, letterSpacing:'0.18em', textTransform:'uppercase', color:COLOR_ACCENT, background:'transparent', border:'none', cursor:'pointer' }}>
          ‹ Back
        </button>
      </div>
    )
  }

  // ── page renderer ─────────────────────────────────────────────────────────────
  const renderPageInner = (pg: PageDesc, i: number) => {
    const prev = pages[i - 1], next = pages[i + 1]
    const onBack = prev ? () => runTurn('back') : undefined
    const onNext = next ? () => runTurn('fwd')  : undefined

    if (pg.kind === 'cover') {
      return (
        <>
          <div key={t.id} style={{ position:'absolute', inset:0, animation:`pubFeatFade 320ms ${EASING_SETTLE} both` }}>
            <div style={{ position:'absolute', inset:0, background:t.surfaceBg }} />
            {coverPhoto && coverPhoto.mode === 'cutout' && (
              <img src={coverPhoto.url} alt="" decoding="async"
                style={{ position:'absolute', top:'12%', left:0, right:0, width:'100%', height:'62%', objectFit:'contain', objectPosition:'center' }} />
            )}
            {coverPhoto && coverPhoto.mode === 'full' && framed && (
              <div style={{ position:'absolute', top:'12%', left:0, right:0, height:'62%', overflow:'hidden' }}>
                <img src={coverPhoto.url} alt="" decoding="async"
                  onLoad={(e) => { const img = e.currentTarget; setPhotoAspect(img.naturalWidth / img.naturalHeight) }}
                  style={{ width:'100%', height:'100%', objectFit:'contain', objectPosition:`${fx}% ${fy}%`,
                    transform:`scale(${zoom})`, transformOrigin:`${fx}% ${fy}%`, display:'block' }} />
              </div>
            )}
            {coverPhoto && coverPhoto.mode === 'full' && !framed && (
              <img src={coverPhoto.url} alt="" decoding="async"
                onLoad={(e) => { const img = e.currentTarget; setPhotoAspect(img.naturalWidth / img.naturalHeight) }}
                style={(() => {
                  const h = photoAspect !== null
                    ? (photoAspect > 1.3 ? '56%' : photoAspect < 0.85 ? '70%' : '62%')
                    : '62%'
                  return { position:'absolute' as const, top:'12%', left:0, right:0, width:'100%', height:h, objectFit:'contain' as const, objectPosition:'center' }
                })()}
              />
            )}
            {!coverPhoto && (
              <div style={{ position:'absolute', inset:0, display:'grid', placeItems:'center' }}>
                <span style={{ fontFamily:FONT_DECK, color:'rgba(245,245,245,0.45)', letterSpacing:'0.3em', fontSize:11, textTransform:'uppercase' }}>No cover photo</span>
              </div>
            )}
            {t.vignette && <div style={{ position:'absolute', inset:0, pointerEvents:'none', background:'radial-gradient(ellipse at 50% 42%, transparent 45%, rgba(20,16,10,0.32) 100%)' }} />}
            {t.scrim && !t.band && <div style={{ position:'absolute', top:0, left:0, right:0, height:'34%', pointerEvents:'none', background:'linear-gradient(180deg,rgba(0,0,0,0.62) 0%,rgba(0,0,0,0.25) 55%,transparent 100%)' }} />}
            {t.textOnPhoto==='light' && <div style={{ position:'absolute', left:0, right:0, bottom:0, height:'50%', pointerEvents:'none', background:'linear-gradient(0deg,rgba(0,0,0,0.82) 0%,rgba(0,0,0,0.38) 45%,transparent 100%)' }} />}

            {t.band
              ? <div style={{ position:'absolute', top:0, left:0, right:0, background:t.bandBg, padding:'12px 16px 9px' }}>
                  <Masthead t={t} size={48} />
                  <TopStrip accent={t.accent} dark vol={vol} issue={issue} purchaseYear={purchaseYear} />
                </div>
              : <div style={{ position:'absolute', top:0, left:0, right:0 }}>
                  <div style={{ padding:'10px 0 8px', marginTop:44 }}>
                    <h1 style={{
                      fontFamily:FONT_MASTHEAD, color:t.mastColor, margin:0, lineHeight:0.88,
                      fontSize:'clamp(52px, 14.5vw, 72px)', letterSpacing:'0.01em', fontStyle:'italic',
                      textAlign:'center', textTransform:'uppercase', width:'100%', display:'block', padding:'0 8px',
                      textShadow:t.id==='knockout-white'?'0 2px 20px rgba(0,0,0,0.7)':'none',
                    }}>G-DIMENSION</h1>
                  </div>
                  <TopStrip accent={t.accent} dark={t.id==='ink-black'} vol={vol} issue={issue} purchaseYear={purchaseYear} stripStyle={{ padding:'3px 14px' }} />
                </div>
            }

            <div style={!t.band
              ? { position:'absolute', left:0, right:0, bottom:90, textAlign:'center', padding:'0 20px' }
              : { position:'absolute', left:16, right:16, bottom:96 }}>
              <span style={{ display:'inline-block', fontFamily:FONT_DECK, fontWeight:600, fontSize:11, letterSpacing:'0.22em', textTransform:'uppercase', color:'#fff', background:t.accent, padding:'3px 8px', marginBottom:10 }}>Feature Car</span>
              {(() => {
                const hl = coverHeadline
                const fs = hl.length > 22 ? 28 : hl.length > 14 ? 36 : 44
                return <div style={{ fontFamily:FONT_MASTHEAD, color:bottomColor, lineHeight:0.92, fontSize:fs, textTransform:'uppercase', letterSpacing:'-0.01em', textShadow:t.textOnPhoto==='light'?'0 2px 14px rgba(0,0,0,0.5)':'none' }}>{hl}</div>
              })()}
              <div style={{ fontFamily:FONT_MASTHEAD, color:bottomColor, lineHeight:0.95, fontSize:14,
                fontStyle:'normal', textTransform:'uppercase', letterSpacing:'-0.01em',
                textShadow:t.textOnPhoto==='light'?'0 2px 10px rgba(0,0,0,0.5)':'none', marginTop:8 }}>
                {carName}{car?.trim ? ` ${car.trim}` : ''}
              </div>
              {car?.nickname && (
                <div style={{ fontFamily:FONT_TITLE, fontStyle:'italic', color:bottomColor, opacity:0.92,
                  fontSize:15, lineHeight:1.25, marginTop:6,
                  textShadow:t.textOnPhoto==='light'?'0 1px 8px rgba(0,0,0,0.5)':'none' }}>
                  {car.nickname}
                </div>
              )}
              {coverDeck && (
                <div style={{ fontFamily:FONT_TITLE, fontStyle:'italic', color:bottomColor, opacity:0.82,
                  fontSize:12.5, lineHeight:1.35, marginTop:5,
                  textShadow:t.textOnPhoto==='light'?'0 1px 8px rgba(0,0,0,0.5)':'none' }}>
                  {coverDeck}
                </div>
              )}
              {powerLine && <div style={{ fontFamily:FONT_DECK, fontWeight:600, color:t.accent, fontSize:12, letterSpacing:'0.06em', textTransform:'uppercase', marginTop:6 }}>{powerLine}</div>}
            </div>

            <div style={{ position:'absolute', ...(coverIdx % 2 === 0 ? { left:12, bottom:16 } : { right:12, bottom:16 }),
              transform:'scale(0.72)', transformOrigin: coverIdx % 2 === 0 ? 'bottom left' : 'bottom right' }}>
              <Barcode seed={seed} price={`$${4 + (coverIdx % 3)}.99 US · $${6 + (coverIdx % 3)}.99 CAN`} dark={false} />
            </div>
            <span style={{ position:'absolute', ...(coverIdx % 2 === 0 ? { right:12 } : { left:12 }), bottom:12, fontFamily:FONT_DECK, fontWeight:600, fontSize:9, letterSpacing:'0.3em', color:bottomColor, opacity:0.8 }}>GDIMENSION.APP</span>

            <div style={{ position:'absolute', inset:0, pointerEvents:'none', background:'radial-gradient(120% 60% at 75% 8%, rgba(255,255,255,0.16) 0%, transparent 42%)', mixBlendMode:'screen' }} />
            <div style={{ position:'absolute', inset:0, pointerEvents:'none', overflow:'hidden' }}>
              <style>{`@keyframes pubCoverGloss { from { transform: translateX(-160%) skewX(-16deg); } to { transform: translateX(420%) skewX(-16deg); } }`}</style>
              <div style={{ position:'absolute', top:'-10%', left:0, width:'40%', height:'120%', mixBlendMode:'screen',
                background:'linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.04) 30%, rgba(255,255,255,0.14) 50%, rgba(255,255,255,0.04) 70%, transparent 100%)',
                transform:'translateX(-160%) skewX(-16deg)',
                animation:'pubCoverGloss 1100ms cubic-bezier(0.4, 0, 0.2, 1) 600ms both' }} />
            </div>
            <div style={{ position:'absolute', inset:0, pointerEvents:'none', opacity:0.03, mixBlendMode:'screen', backgroundImage:"url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")" }} />
            <div style={{ position:'absolute', top:0, right:0, bottom:0, width:28, pointerEvents:'none', background:'linear-gradient(270deg,rgba(0,0,0,0.2) 0%,rgba(0,0,0,0.05) 60%,transparent 100%)' }} />
          </div>

          <PubCornerCurl color={t.textOnPhoto==='light' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)'} />
        </>
      )
    }

    const dotsProps = pages.length > 1 ? { count: pages.length, active: i } : undefined

    if (pg.kind === 'photo') {
      return (
        <PubPhotoSpread photos={pg.photos!} arrangement={pg.arrangement ?? 0} theme={theme}
          backLabel={prev ? 'PREV PAGE' : 'COVER'} nextLabel={next ? 'NEXT PAGE' : undefined} pageNum={i}
          carShortName={carShortName}
          near={Math.abs(i - pageIdx) <= 1}
          onBack={onBack} onNext={onNext} dots={dotsProps} />
      )
    }

    if (pg.kind === 'story') {
      const storyPhoto = layout?.story_photo ?? coverPhoto?.url ?? null
      const spFx     = layout?.story_photo_focus_x ?? 50
      const spFy     = layout?.story_photo_focus_y ?? 50
      const spZoom   = layout?.story_photo_zoom ?? 1
      const spHeight = layout?.story_photo_height ?? 32
      const spPos    = layout?.story_photo_pos ?? null
      return (
        <PubStoryPage
          story={car?.featured_story ?? ''} headline={coverHeadline}
          carShortName={carShortName} theme={theme}
          backLabel={prev ? 'PREV PAGE' : 'COVER'} nextLabel={next ? 'NEXT PAGE' : undefined} pageNum={i}
          onBack={onBack} onNext={onNext} dots={dotsProps}
          storyPhoto={storyPhoto}
          spFx={spFx} spFy={spFy} spZoom={spZoom} spHeight={spHeight} spPos={spPos} />
      )
    }

    // spec
    return (
      <PubSpecSheet sections={pg.sections!} isCont={!!pg.isCont} theme={theme}
        totalMods={jobs.length} carShortName={carShortName}
        backLabel={prev ? 'PREV PAGE' : 'COVER'} nextLabel={next ? 'NEXT PAGE' : undefined} pageNum={i}
        onBack={onBack} onNext={onNext} dots={dotsProps} />
    )
  }

  return (
    <div
      id="pub-feat-container"
      style={{ position:'fixed', inset:0, background:'#000', overflow:'hidden', overscrollBehavior:'none', touchAction:'none', userSelect:'none', WebkitUserSelect:'none' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <ArrivalFade />

      <div style={{ position:'absolute', inset:0, perspective:'700px', perspectiveOrigin:'50% 50%' }}>
        {pages.map((pg, i) => (
          <div key={i}
            ref={el => { pageEls.current[i] = el }}
            style={{ position:'absolute', inset:0, willChange:'transform', zIndex: i === pageIdx ? 3 : 1 }}
          >
            {renderPageInner(pg, i)}
            <div ref={el => { shadowEls.current[i] = el }}
              style={{ position:'absolute', inset:0, pointerEvents:'none', opacity:0,
                background: i === 0
                  ? 'linear-gradient(270deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 35%, transparent 70%)'
                  : 'linear-gradient(90deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 35%, transparent 70%)' }} />
          </div>
        ))}

        <div ref={foldOverlayRef} style={{ position:'absolute', top:0, bottom:0, pointerEvents:'none', opacity:0 }} />
        <div ref={foldLineRef}    style={{ position:'absolute', top:0, bottom:0, pointerEvents:'none', opacity:0 }} />
      </div>

      {/* Tap zones — page turn by tapping like a real magazine: left half back,
          right half forward. Inset vertically to clear the back chevron + folio. */}
      {pageIdx === 0 ? (
        <div
          onClick={() => { if (!isTurningRef.current) runTurn('fwd') }}
          style={{ position:'absolute', top:'34%', bottom:'18%', right:0, width:'34%', zIndex:20, cursor:'pointer' }}
        />
      ) : (
        <>
          <div
            onClick={() => { if (!isTurningRef.current) runTurn('back') }}
            style={{ position:'absolute', top:'12%', bottom:'14%', left:0, width:'48%', zIndex:20, cursor:'pointer' }}
          />
          <div
            onClick={() => { if (!isTurningRef.current) runTurn('fwd') }}
            style={{ position:'absolute', top:'12%', bottom:'14%', right:0, width:'48%', zIndex:20, cursor:'pointer' }}
          />
        </>
      )}

      {/* Cover swipe/tap hint — blinks once shortly after load */}
      {pageIdx === 0 && (
        <>
          <style>{`@keyframes pubCoverHint { 0%{opacity:0} 25%{opacity:0.55} 50%{opacity:0} 75%{opacity:0.55} 100%{opacity:0.42} }`}</style>
          <div style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', zIndex:21, pointerEvents:'none',
            fontFamily:FONT_DECK, fontSize:34, lineHeight:1, color:COLOR_ACCENT, opacity:0,
            animation:'pubCoverHint 1600ms ease 700ms both' }}>
            ›
          </div>
        </>
      )}

      {/* Back chevron */}
      <div data-sfx="back" onClick={() => navigate(`/builds/${username ?? ''}`)}
        style={{ position:'absolute', top:14, left:12, zIndex:30, fontFamily:FONT_DECK, fontSize:30, lineHeight:1, color:COLOR_ACCENT, cursor:'pointer', textShadow:'0 1px 6px rgba(0,0,0,0.6)', pointerEvents:isTurning?'none':'auto' }}>
        ‹
      </div>

      <style>{`
        @keyframes pubFeatFade { from { opacity:0 } to { opacity:1 } }
      `}</style>
    </div>
  )
}

// ─── PubCornerCurl ────────────────────────────────────────────────────────────
function PubCornerCurl({ color }: { color: string }) {
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

  return (
    <div style={{ background: bg, padding:'4px 6px 5px', display:'inline-flex', flexDirection:'column', alignItems:'center', gap:2 }}>
      <div style={{ display:'flex', alignItems:'stretch', height:36, gap:'1px' }}>
        {barWidths.map((w, i) => (
          <div key={i} style={{
            width: w, background: i % 2 === 0 ? fg : bg,
            alignSelf: (i < 3 || i > barWidths.length - 4) ? 'stretch' : 'center',
            height: (i < 3 || i > barWidths.length - 4) ? '100%' : '88%',
          }} />
        ))}
      </div>
      <div style={{ fontFamily:FONT_DECK, fontSize:6.5, letterSpacing:'0.14em', color:fg, textAlign:'center', lineHeight:1 }}>
        {price}
      </div>
    </div>
  )
}

// ─── Masthead / TopStrip ──────────────────────────────────────────────────────
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

// ─── Folio ────────────────────────────────────────────────────────────────────
function Folio({ theme, backLabel, nextLabel, pageNum, onBack, onNext, dots }:
  { theme: InteriorTheme; backLabel: string; nextLabel?: string; pageNum: number; onBack?: () => void; onNext?: () => void; dots?: { count: number; active: number } }) {
  void backLabel; void nextLabel; void onBack; void onNext
  return (
    <div style={{ padding:'8px 14px 8px 28px', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:`1px solid ${theme.rule}`, flexShrink:0, background:theme.pageBg }}>
      <div style={{ width:24 }} />
      {dots && dots.count > 1
        ? <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            {Array.from({ length: dots.count }, (_, i) => (
              <div key={i} style={{ width: i === dots.active ? 12 : 4, height:4, borderRadius:2, background: i === dots.active ? theme.accent : theme.rule, transition:`all 200ms ${EASING_SETTLE}` }} />
            ))}
          </div>
        : <span />}
      <span style={{ fontFamily:FONT_MASTHEAD, color:theme.ink, fontSize:17, fontStyle:'italic', opacity:0.6, display:'inline-block', paddingRight:6 }}>{String(pageNum).padStart(2,'0')}</span>
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
const PHOTO_FILTER = 'contrast(1.04) saturate(0.97)'

// ─── PubPhotoCell ─────────────────────────────────────────────────────────────
interface PubPhotoCellProps {
  item: PhotoItem; theme: InteriorTheme
  flexVal?: string | number; figureNum?: number; near?: boolean
  justify?: 'flex-start' | 'flex-end' | 'center'
  onAspect?: (ratio: number) => void
}
function PubPhotoCell({ item, theme, flexVal, figureNum, near = true, justify = 'center', onAspect }: PubPhotoCellProps) {
  const imgMargin = justify === 'flex-start' ? 'auto auto auto 0'
                  : justify === 'flex-end'   ? 'auto 0 auto auto'
                  : 'auto'
  return (
    <div style={{ flex: flexVal ?? 1, display:'flex', flexDirection:'column', minWidth:0, minHeight:0 }}>
      <div style={{ flex:1, minHeight:0, position:'relative' }}>
        <img
          src={near ? item.url : undefined} alt=""
          decoding="async"
          onLoad={(e) => { const img = e.currentTarget; onAspect?.(img.naturalWidth / img.naturalHeight) }}
          style={{ position:'absolute', inset:0, margin:imgMargin, maxWidth:'100%', maxHeight:'100%',
            width:'auto', height:'auto', boxSizing:'border-box', display:'block',
            border:`1px solid ${theme.rule}`, boxShadow:'0 1px 5px rgba(0,0,0,0.10)',
            filter: PHOTO_FILTER }}
        />
      </div>
      {item.caption && (
        <div style={{ flexShrink:0, display:'flex', justifyContent:justify, alignItems:'flex-start', gap:3, marginTop:4 }}>
          {figureNum !== undefined && (
            <span style={{ flexShrink:0, fontFamily:FONT_DECK, fontWeight:700, color:theme.accent, fontSize:8, letterSpacing:'0.08em', lineHeight:'13px' }}>
              {String(figureNum).padStart(2, '0')}
            </span>
          )}
          <div style={{ fontFamily:FONT_DECK, color:theme.subInk, fontSize:8.5, lineHeight:1.3, letterSpacing:'0.04em',
            textAlign: justify === 'flex-end' ? 'right' : 'left',
            overflow:'hidden', textOverflow:'ellipsis', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' as const }}>
            {item.caption}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── PubPhotoSpread ───────────────────────────────────────────────────────────
interface PubPhotoSpreadProps {
  photos: PhotoItem[]; arrangement: number; theme: InteriorTheme
  carShortName: string; near?: boolean
  backLabel: string; nextLabel?: string; pageNum: number; onBack?: () => void; onNext?: () => void
  dots?: { count: number; active: number }
}
function PubPhotoSpread({ photos, arrangement, theme, carShortName, near = true, backLabel, nextLabel, pageNum, onBack, onNext, dots }: PubPhotoSpreadProps) {
  const [aspects, setAspects] = useState<Record<string, number>>({})
  const [heroAspect, setHeroAspect] = useState<number | null>(null)
  const doubleTruck = (heroAspect ?? 0) >= 1.9
  const onAspect = (url: string) => (r: number) =>
    setAspects(prev => (prev[url] === r ? prev : { ...prev, [url]: r }))
  const aspectOf = (p: PhotoItem) => aspects[p.url] ?? 1.5

  const hasHero     = photos.length >= 2
  const heroPhoto   = hasHero ? photos[0] : null
  const supportPhotos = hasHero ? photos.slice(1) : photos

  const allOrdered = heroPhoto ? [heroPhoto, ...supportPhotos] : supportPhotos
  let figCounter = 1
  const figureNums: Record<string, number> = {}
  for (const p of allOrdered) {
    if (p.caption) figureNums[p.url] = figCounter++
  }

  const rows: PhotoItem[][] = (() => {
    const n = supportPhotos.length
    if (n <= 1) return [supportPhotos]
    if (n === 2) {
      const avg = (aspectOf(supportPhotos[0]) + aspectOf(supportPhotos[1])) / 2
      return avg > 1.3 ? [[supportPhotos[0]], [supportPhotos[1]]] : [supportPhotos]
    }
    if (n === 3) {
      const sorted = [...supportPhotos].sort((a, b) => aspectOf(b) - aspectOf(a))
      const solo = sorted[0]
      const pair = supportPhotos.filter(p => p !== solo)
      return arrangement === 0 ? [[solo], pair] : [pair, [solo]]
    }
    const sorted = [...supportPhotos].sort((a, b) => aspectOf(b) - aspectOf(a))
    const rowA = [sorted[0], sorted[3]]
    const rowB = [sorted[1], sorted[2]]
    return arrangement === 0 ? [rowA, rowB] : [rowB, rowA]
  })()

  const rowWeight = (row: PhotoItem[]) =>
    1 / Math.max(0.2, row.reduce((s, p) => s + aspectOf(p), 0))

  return (
    <div style={{ position:'absolute', inset:0, background:theme.pageBg, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={SPINE_GUTTER} />

      <div style={{ flexShrink:0, padding:'8px 14px 5px 30px' }}>
        <div style={{ height:'0.5px', background:theme.rule, marginBottom:5 }} />
        <div style={{ fontFamily:FONT_DECK, fontWeight:600, fontSize:7, letterSpacing:'0.28em', color:theme.subInk, textTransform:'uppercase', opacity:0.65 }}>
          THE DETAILS · {carShortName.toUpperCase()}
        </div>
      </div>

      {heroPhoto && (
        <div style={{ flex:'0 0 52%', position:'relative', overflow:'hidden' }}>
          <img
            src={near ? heroPhoto.url : undefined} alt=""
            decoding="async"
            onLoad={(e) => { const img = e.currentTarget; setHeroAspect(img.naturalWidth / img.naturalHeight) }}
            style={doubleTruck
              ? { position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', display:'block', filter: PHOTO_FILTER }
              : { position:'absolute', top:0, bottom:0, left:30, width:'calc(100% - 44px)', height:'100%', objectFit:'cover', display:'block', filter: PHOTO_FILTER }}
          />
          {doubleTruck && (
            <>
              <div style={{ position:'absolute', top:0, bottom:0, left:'50%', width:44, transform:'translateX(-50%)', pointerEvents:'none',
                background:'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.16) 38%, rgba(0,0,0,0.34) 50%, rgba(255,255,255,0.10) 56%, transparent 100%)' }} />
              <span style={{ position:'absolute', top:7, right:8, fontFamily:FONT_DECK, fontWeight:700, fontSize:6.5, letterSpacing:'0.26em', textTransform:'uppercase',
                color:'rgba(245,245,245,0.85)', background:'rgba(0,0,0,0.4)', padding:'3px 6px', pointerEvents:'none' }}>
                Full Spread
              </span>
            </>
          )}
          {heroPhoto.caption && (
            <div style={{ position:'absolute', bottom:0, left:doubleTruck ? 0 : 30, right:doubleTruck ? 0 : 14,
              background:'linear-gradient(0deg,rgba(0,0,0,0.72) 0%,rgba(0,0,0,0.28) 60%,transparent 100%)',
              padding:'24px 10px 8px' }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:3 }}>
                {figureNums[heroPhoto.url] !== undefined && (
                  <span style={{ flexShrink:0, fontFamily:FONT_DECK, fontWeight:700, color:theme.accent, fontSize:8, letterSpacing:'0.08em', lineHeight:'13px' }}>
                    {String(figureNums[heroPhoto.url]).padStart(2, '0')}
                  </span>
                )}
                <span style={{ fontFamily:FONT_DECK, color:'#f0ede8', fontSize:8.5, lineHeight:1.3, letterSpacing:'0.04em' }}>
                  {heroPhoto.caption}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {supportPhotos.length > 0 && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:8, padding:'8px 14px 8px 30px', minHeight:0 }}>
          {rows.map((row, ri) => (
            <div key={ri} style={{ flex: rowWeight(row), display:'flex', flexDirection:'row', gap:8, minHeight:0 }}>
              {row.map(p => (
                <PubPhotoCell key={p.url} item={p} theme={theme}
                  flexVal={aspectOf(p)}
                  figureNum={figureNums[p.url]}
                  near={near}
                  justify={row.length === 1 ? ((ri + arrangement) % 2 === 0 ? 'flex-start' : 'flex-end') : 'center'}
                  onAspect={onAspect(p.url)} />
              ))}
            </div>
          ))}
        </div>
      )}

      <Folio theme={theme} backLabel={backLabel} nextLabel={nextLabel} pageNum={pageNum} onBack={onBack} onNext={onNext} dots={dots} />
      <div style={NOISE_OVERLAY} />
    </div>
  )
}

// ─── PubStoryPage ─────────────────────────────────────────────────────────────
interface PubStoryPageProps {
  story: string; headline: string; carShortName: string; theme: InteriorTheme
  backLabel: string; nextLabel?: string; pageNum: number; onBack?: () => void; onNext?: () => void
  dots?: { count: number; active: number }
  storyPhoto?: string | null
  spFx?: number; spFy?: number; spZoom?: number; spHeight?: number
  spPos?: number | null
}
function PubStoryPage({ story, headline, carShortName, theme, backLabel, nextLabel, pageNum, onBack, onNext, dots,
  storyPhoto, spFx = 50, spFy = 50, spZoom = 1, spHeight = 32, spPos }: PubStoryPageProps) {
  const paras    = story.split(/\n+/).map(s => s.trim()).filter(Boolean)
  const showPhoto = !!storyPhoto
  const pos      = spPos == null ? 1 : Math.min(1, Math.max(0, spPos))

  return (
    <div style={{ position:'absolute', inset:0, background:theme.pageBg, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={SPINE_GUTTER} />

      <div style={{ flexShrink:0, padding:'8px 14px 5px 30px' }}>
        <div style={{ height:'0.5px', background:theme.rule, marginBottom:5 }} />
        <div style={{ fontFamily:FONT_DECK, fontWeight:600, fontSize:7, letterSpacing:'0.28em', color:theme.subInk, textTransform:'uppercase', opacity:0.65 }}>
          THE FEATURE · {carShortName.toUpperCase()}
        </div>
      </div>

      <div style={{ flexShrink:0, padding:'6px 16px 0 30px' }}>
        <div style={{ fontFamily:FONT_MASTHEAD, color:theme.ink, fontStyle:'italic', textTransform:'uppercase',
          fontSize: headline.length > 22 ? 26 : 34, lineHeight:0.95, letterSpacing:'-0.01em' }}>
          {headline}
        </div>
        <div style={{ height:2, background:theme.accent, width:44, margin:'10px 0 0' }} />
      </div>

      <div data-story-content style={{ flex:1, minHeight:0, position:'relative', overflow:'hidden', display:'flex', flexDirection:'column', padding:'12px 18px 0 30px' }}>
        <div style={{ flexShrink:0 }}>
          {paras.map((p, i) => (
            <p key={i} style={{ margin:'0 0 12px', fontFamily:FONT_TITLE, color:theme.ink, fontSize:15.5, lineHeight:1.58 }}>
              {i === 0 ? (
                <>
                  <span style={{ float:'left', fontFamily:FONT_MASTHEAD, fontStyle:'italic', color:theme.accent,
                    fontSize:46, lineHeight:0.78, paddingRight:7, paddingTop:3 }}>{p.charAt(0)}</span>
                  {p.slice(1)}
                </>
              ) : p}
            </p>
          ))}
          <div style={{ fontFamily:FONT_DECK, fontWeight:700, fontSize:8.5, letterSpacing:'0.22em', textTransform:'uppercase', color:theme.subInk, margin:'16px 0 18px' }}>
            — As told to G-Dimension
          </div>
        </div>
        {showPhoto && (
          <>
            <div style={{ flexGrow: pos, flexShrink: 1, minHeight: 0 }} />
            <div style={{ height:`${spHeight}vh`, margin:'4px 14px 10px 0', position:'relative', overflow:'hidden' }}>
              <img src={storyPhoto!} alt="" decoding="async" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block',
                filter: PHOTO_FILTER, border:`1px solid ${theme.rule}`,
                objectPosition:`${spFx}% ${spFy}%`, transform:`scale(${spZoom})`, transformOrigin:`${spFx}% ${spFy}%` }} />
              <div style={{ position:'absolute', inset:0,
                background:'linear-gradient(0deg, rgba(0,0,0,0.18) 0%, transparent 40%)' }} />
            </div>
            <div style={{ flexGrow: 1 - pos, flexShrink: 1, minHeight: 0 }} />
          </>
        )}
        {!showPhoto && (
          <div style={{ position:'absolute', left:0, right:0, bottom:0, height:34, pointerEvents:'none',
            background:`linear-gradient(0deg, ${theme.pageBg} 12%, transparent 100%)` }} />
        )}
      </div>

      <Folio theme={theme} backLabel={backLabel} nextLabel={nextLabel} pageNum={pageNum} onBack={onBack} onNext={onNext} dots={dots} />
      <div style={NOISE_OVERLAY} />
    </div>
  )
}

// ─── PubSpecSheet ─────────────────────────────────────────────────────────────
interface PubSpecSheetProps {
  sections: SpecSection[]; isCont: boolean; theme: InteriorTheme
  totalMods: number; carShortName: string
  backLabel: string; nextLabel?: string; pageNum: number; onBack?: () => void; onNext?: () => void
  dots?: { count: number; active: number }
}
function PubSpecSheet({ sections, isCont, theme, totalMods, carShortName, backLabel, nextLabel, pageNum, onBack, onNext, dots }: PubSpecSheetProps) {
  return (
    <div style={{ position:'absolute', inset:0, background:theme.pageBg, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={SPINE_GUTTER} />

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

      <div style={{ flex:1, padding:'12px 16px 0 28px', minHeight:0, overflow:'hidden' }}>
        {sections.map((sec, si) => (
          <div key={si} style={{ marginBottom:SEC_GAP }}>
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

      <Folio theme={theme} backLabel={backLabel} nextLabel={nextLabel} pageNum={pageNum} onBack={onBack} onNext={onNext} dots={dots} />
      <div style={NOISE_OVERLAY} />
    </div>
  )
}
