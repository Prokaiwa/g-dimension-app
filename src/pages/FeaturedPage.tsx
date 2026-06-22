// Route: /featured — "Featured" magazine (aesthetic island)
// Dynamic book: Cover → Photo Spread(s) (0–2) → Spec Sheet (1–2). 2–5 pages total.
// Page turn: fold-line sweep via clip-path + transformOrigin-at-fold + slight rotateY tilt.
//   The fold line travels across the page; left of it: original content (clipped, slightly tilting).
//   Right of it: paper-back overlay (cream with shadow gradient) + bright crease strip.
//   Arriving page is static below. No full-page rotation — feels like a real paper fold.
// Swipe L/R on cover = cycle templates. Drag from right-30% = turn forward.
//   Interior: drag right = back, drag left = forward (when a next page exists).
import type React from 'react'
import imageCompression from 'browser-image-compression'
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
import gLogo from '../assets/logo/gdimensionG.webp'
import { generateFeature } from '../features/featured/engine/generate'
import type { PhotoSlot } from '../features/featured/engine/generate'

// ─── types ────────────────────────────────────────────────────────────────────
interface Car {
  id: string
  year: number | null; make: string | null; model: string | null; variant: string | null
  trim: string | null; nickname: string | null; horsepower: number | null; torque: number | null
  engine_type: string | null; transmission: string | null
  forced_induction: string | null; drivetrain: string | null; purchase_date: string | null
  current_mileage: number | null; color: string | null; is_import: boolean
  usage_type: string | null; engine_origin: string | null
  showcase_photo_url: string | null; garage_photo_url: string | null; original_photo_url: string | null
  build_sheet_power_photo: string | null; build_sheet_chassis_photo: string | null
  build_sheet_exterior_photo: string | null; build_sheet_interior_photo: string | null
  // 052 — may be absent until the migration runs (guarded select falls back)
  cover_focus_x?: number | null; cover_focus_y?: number | null; cover_zoom?: number | null
  featured_story?: string | null
  // 055 — editorial overrides + engine snapshot (guarded select falls back)
  featured_layout?: FeaturedLayout | null
  // 053 — public visibility flags
  show_featured_publicly?: boolean | null
  is_public?: boolean | null
}

// ── Featured editorial overrides (migration 055, cars.featured_layout jsonb) ───
// Sparse: only the slots the owner has customized are present. `generated_*` is a
// snapshot of the engine output at the user's last save — diffed against the live
// engine to quietly flag (a dot on the edit pencil) when fresh output diverges.
interface FeaturedLayout {
  headline?: string
  deck?: string
  captions?: Record<string, string>            // keyed by STABLE photo key (see photoKey)
  generated_headline?: string
  generated_deck?: string
  generated_captions?: Record<string, string>
  story_photo?: string                         // chosen image URL for the Story page (else cover photo)
  story_photo_height?: number                  // vh height of the story photo (default 32)
  story_photo_pos?: number                     // 0 (just below text) … 1 (page bottom); null/absent = bottom
  story_photo_focus_x?: number                 // 0-100
  story_photo_focus_y?: number                 // 0-100
  story_photo_zoom?: number                    // 1-3
  template?: string                            // TEMPLATES[i].id — persisted cover choice
}
interface Job { id: string; title: string | null; category: string | null; brand: string | null; part_type_name: string | null }
type Photo = { url: string; mode: 'full' | 'cutout'; label: string }
// A photo on a spread. `key` is the STABLE caption key (bsg:<group> / tl:<entryId>) —
// never the URL — so re-uploading a photo never orphans its caption (055).
// `placeholder` is the default caption (timeline title / engine) shown in the edit
// field when the owner hasn't written a Featured-specific override.
type PhotoItem = { url: string; caption: string | null; key: string; placeholder?: string | null }

// Spec Sheet data model
interface SpecRow { label: string; value: string }
interface SpecSection { title: string; rows: SpecRow[]; moreCount?: number }

// Page descriptor — the book is assembled from these after data load
type PageKind = 'cover' | 'photo' | 'story' | 'spec'
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

// Cover chrome chip (Photo / Frame / Story)
const COVER_CHIP: React.CSSProperties = {
  fontFamily:FONT_DECK, fontWeight:600, fontSize:9, letterSpacing:'0.16em', textTransform:'uppercase',
  color:'#f5f5f5', background:'rgba(0,0,0,0.55)', border:'1px solid rgba(245,245,245,0.35)', padding:'5px 9px', cursor:'pointer',
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
const GROUP_PHOTO_COL: Record<string, string> = {
  power:'build_sheet_power_photo', chassis:'build_sheet_chassis_photo',
  exterior:'build_sheet_exterior_photo', interior:'build_sheet_interior_photo',
}
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
      value: j.title || '—',
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

// ═══════════════════════════════════════════════════════════════════════════════
export default function FeaturedPage() {
  const navigate = useNavigate()
  const [car, setCar]       = useState<Car | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])       // cover photo candidates (original / no-bg)
  const [photoIdx, setPhotoIdx] = useState(0)
  const [jobs, setJobs]     = useState<Job[]>([])
  const [timelinePhotos, setTimelinePhotos] = useState<{id: string; photo_url: string; title: string | null}[]>([])
  const [userUnits, setUserUnits] = useState<{ distance_unit: 'mi'|'km'; power_unit: 'hp'|'ps'|'kw' }>({ distance_unit: 'mi', power_unit: 'hp' })
  const [loading, setLoading] = useState(true)
  const [coverIdx, setCoverIdx] = useState(0)
  const [pageIdx, setPageIdx]   = useState(0) // 0=cover
  const [isTurning, setIsTurning] = useState(false)
  const [photoAspect, setPhotoAspect] = useState<number|null>(null)

  // ── cover framing (052): pan/pinch adjust mode, persisted on the car ─────────
  const [adjusting, setAdjusting]   = useState(false)
  const adjustingRef                = useRef(false)
  const [fx, setFx]                 = useState(50)   // object-position X %
  const [fy, setFy]                 = useState(50)   // object-position Y %
  const [zoom, setZoom]             = useState(1)
  const [savingFrame, setSavingFrame] = useState(false)
  const [frameErr, setFrameErr]     = useState<string | null>(null)
  const adjTouches = useRef<{ x: number; y: number }[]>([])
  const adjPinch   = useRef<{ dist: number; zoom: number } | null>(null)

  // ── feature story compose sheet ───────────────────────────────────────────────
  const [storyOpen, setStoryOpen]   = useState(false)
  const [storyDraft, setStoryDraft] = useState('')
  const [savingStory, setSavingStory] = useState(false)
  const [storyErr, setStoryErr]     = useState<string | null>(null)

  // ── editorial edit mode (055): inline cover headline/deck overrides ───────────
  // `editing` puts the cover into edit mode (driven by the pencil chip); the
  // headline + deck become inline fields. `editHeadline`/`editDeck` are the
  // working drafts ('' = use the engine text). A quiet dot on the pencil appears
  // when the engine output has diverged from the user's saved snapshot.
  const [editing, setEditing]         = useState(false)
  const editingRef                    = useRef(false)
  const [editHeadline, setEditHeadline] = useState('')
  const [editDeck, setEditDeck]       = useState('')
  const [savingLayout, setSavingLayout] = useState(false)
  const [layoutErr, setLayoutErr]     = useState<string | null>(null)

  // ── caption edit mode (055): per-photo-spread inline caption overrides ────────
  // capEditPage = the page index whose captions are being edited (null = none).
  // editCaptions = working drafts keyed by stable photo key ('' = use the default).
  const [capEditPage, setCapEditPage]   = useState<number | null>(null)
  const capEditRef                      = useRef(false)
  const [editCaptions, setEditCaptions] = useState<Record<string, string>>({})
  const [savingCaptions, setSavingCaptions] = useState(false)
  const [captionErr, setCaptionErr]     = useState<string | null>(null)

  // ── photo replacement (tap photo → sheet with source images + add new) ─────────
  const [photoEditItem, setPhotoEditItem] = useState<PhotoItem | null>(null)
  const [sourcePhotos, setSourcePhotos]   = useState<string[]>([])
  const [loadingSourcePhotos, setLoadingSourcePhotos] = useState(false)
  const [replacingPhoto, setReplacingPhoto] = useState(false)
  const [replaceErr, setReplaceErr]       = useState<string | null>(null)
  const photoReplaceFileRef               = useRef<HTMLInputElement>(null)

  // ── publish state ────────────────────────────────────────────────────────────────
  const [isPublished, setIsPublished]       = useState(false)
  const [savingPublish, setSavingPublish]   = useState(false)
  const [publishErr, setPublishErr]         = useState<string | null>(null)
  const [myUsername, setMyUsername]         = useState<string | null>(null)

  // ── story photo chooser (which image fills the gap under a short story) ────────
  const [storyPhotoSheet, setStoryPhotoSheet] = useState(false)
  const [savingStoryPhoto, setSavingStoryPhoto] = useState(false)
  const [storyPhotoErr, setStoryPhotoErr]   = useState<string | null>(null)
  const storyPhotoFileRef                   = useRef<HTMLInputElement>(null)

  // ── story photo framing (pan/zoom + height, persisted in featured_layout) ────────
  const [spAdjusting, setSpAdjusting]   = useState(false)
  const spAdjustingRef                  = useRef(false)
  const [spFx, setSpFx]                 = useState(50)
  const [spFy, setSpFy]                 = useState(50)
  const [spZoom, setSpZoom]             = useState(1)
  const [spHeight, setSpHeight]         = useState(32)   // vh
  const [spPos, setSpPos]               = useState<number | null>(null)  // 0=just below text … 1=page bottom; null = bottom
  const [savingSpFrame, setSavingSpFrame] = useState(false)
  const [spFrameErr, setSpFrameErr]     = useState<string | null>(null)
  const spTouches = useRef<{x:number;y:number}[]>([])
  const spPinch   = useRef<{dist:number;zoom:number}|null>(null)
  const spHeightDragRef  = useRef(false)
  const spHeightStartY   = useRef(0)
  const spHeightStartVal = useRef(32)
  const spPosDragRef     = useRef(false)

  // True once the user manually picks a template — blocks the brightness auto-pick.
  const userPickedCoverRef = useRef(false)

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
      const { data: { user } } = await supabase.auth.getUser()
      const CAR_COLS_BASE = 'id,year,make,model,variant,trim,nickname,horsepower,torque,engine_type,transmission,forced_induction,drivetrain,purchase_date,current_mileage,color,is_import,usage_type,engine_origin,showcase_photo_url,garage_photo_url,original_photo_url,build_sheet_power_photo,build_sheet_chassis_photo,build_sheet_exterior_photo,build_sheet_interior_photo'
      const CAR_COLS_052  = CAR_COLS_BASE + ',cover_focus_x,cover_focus_y,cover_zoom,featured_story'
      const CAR_COLS_055  = CAR_COLS_052 + ',featured_layout,show_featured_publicly,is_public'
      // Try the newest column set first; fall back step-by-step if a migration
      // isn't applied yet (055 → 052 → base).
      const fetchCar = async () => {
        const v055 = await supabase.from('cars').select(CAR_COLS_055).eq('id', carId).is('deleted_at', null).single()
        if (!v055.error) return v055
        const v052 = await supabase.from('cars').select(CAR_COLS_052).eq('id', carId).is('deleted_at', null).single()
        if (!v052.error) return v052
        return supabase.from('cars').select(CAR_COLS_BASE).eq('id', carId).is('deleted_at', null).single()
      }
      const [carRes, jobsRes, timelineRes, unitsRes] = await Promise.all([
        fetchCar(),
        supabase.from('jobs').select('id,title,category,brand,part_types(name)')
          .eq('car_id', carId).eq('type','modification').eq('status','installed').order('created_at',{ascending:true}),
        supabase.from('timeline_entries')
          .select('id,photo_url,title')
          .eq('car_id', carId)
          .eq('entry_type', 'note')
          .not('photo_url', 'is', null)
          .order('created_at', { ascending: false })
          .limit(6),
        user ? supabase.from('users').select('distance_unit,power_unit,username').eq('id', user.id).single() : Promise.resolve({ data: null }),
      ])
      if (!alive) return
      const c = (carRes.data as unknown as Car) ?? null
      setCar(c)
      if (c?.cover_zoom != null) {
        setFx(c.cover_focus_x ?? 50); setFy(c.cover_focus_y ?? 50); setZoom(c.cover_zoom)
      }
      if (c?.featured_layout?.story_photo_zoom != null) {
        setSpFx(c.featured_layout.story_photo_focus_x ?? 50)
        setSpFy(c.featured_layout.story_photo_focus_y ?? 50)
        setSpZoom(c.featured_layout.story_photo_zoom)
        setSpHeight(c.featured_layout.story_photo_height ?? 32)
      }
      if (c?.featured_layout?.story_photo_pos != null) setSpPos(c.featured_layout.story_photo_pos)
      if (c?.featured_layout?.template) {
        const tIdx = TEMPLATES.findIndex(t => t.id === c.featured_layout!.template)
        if (tIdx >= 0) { setCoverIdx(tIdx); userPickedCoverRef.current = true }
      }
      setIsPublished(c?.show_featured_publicly !== false)
      if (unitsRes.data) {
        const u = unitsRes.data as { distance_unit?: string; power_unit?: string; username?: string }
        setUserUnits({
          distance_unit: (u.distance_unit === 'km' ? 'km' : 'mi') as 'mi'|'km',
          power_unit: (u.power_unit === 'ps' ? 'ps' : u.power_unit === 'kw' ? 'kw' : 'hp') as 'hp'|'ps'|'kw',
        })
        if (u.username) setMyUsername(u.username)
      }
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
      setTimelinePhotos((timelineRes.data as unknown as {id: string; photo_url: string; title: string | null}[]) ?? [])
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
  const cycleCover = (dir: number) => {
    userPickedCoverRef.current = true
    const nextIdx = (coverIdx + dir + TEMPLATES.length) % TEMPLATES.length
    setCoverIdx(nextIdx)
    if (car) {
      const nextLayout: FeaturedLayout = { ...(car.featured_layout ?? {}), template: TEMPLATES[nextIdx].id }
      supabase.from('cars').update({ featured_layout: nextLayout }).eq('id', car.id).then(({ error }) => {
        if (!error) setCar(prev => prev ? { ...prev, featured_layout: nextLayout } : prev)
      })
    }
  }
  const bottomColor = t.textOnPhoto === 'light' ? '#f5f5f5' : '#0a0a0a'

  // Framed = a saved (or in-progress) framing exists → cover-fit + focus/zoom.
  // Unframed full photos keep the legacy aspect-heuristic contain layout.
  const framed = adjusting || car?.cover_zoom != null

  // ── cover brightness → default masthead pick (runs once, never over a user choice)
  useEffect(() => {
    if (!car || !photo || photo.mode !== 'full' || userPickedCoverRef.current) return
    let alive = true
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (!alive || userPickedCoverRef.current) return
      try {
        const w = 40, h = 40
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(img, 0, 0, w, h)
        // Masthead region = top 40% of the photo
        const d = ctx.getImageData(0, 0, w, Math.round(h * 0.4)).data
        let lum = 0
        for (let i = 0; i < d.length; i += 4) lum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
        lum /= (d.length / 4) * 255
        if (lum < 0.40)      setCoverIdx(2)  // dark photo → Knockout White masthead
        else if (lum > 0.62) setCoverIdx(3)  // bright photo → Ink Black masthead
        // mid-range keeps the seeded template
      } catch { /* canvas tainted or unavailable — keep seeded template */ }
    }
    img.src = photo.url
    return () => { alive = false }
  }, [car, photo])

  // ── adjust-mode gestures: one finger pans the focus, two fingers pinch-zoom ───
  const coverRectH = () => window.innerHeight * 0.62
  const onAdjTouchStart = (e: React.TouchEvent) => {
    adjTouches.current = Array.from(e.touches).map(tt => ({ x: tt.clientX, y: tt.clientY }))
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      adjPinch.current = { dist: Math.hypot(dx, dy), zoom }
    }
  }
  const onAdjTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && adjPinch.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const d  = Math.hypot(dx, dy)
      setZoom(Math.min(2.5, Math.max(1, adjPinch.current.zoom * (d / adjPinch.current.dist))))
    } else if (e.touches.length === 1 && adjTouches.current.length >= 1) {
      const prev = adjTouches.current[0]
      const dx = e.touches[0].clientX - prev.x
      const dy = e.touches[0].clientY - prev.y
      // Dragging the photo right reveals more of its left side → focus % decreases.
      setFx(v => Math.min(100, Math.max(0, v - (dx / window.innerWidth) * 100 / zoom)))
      setFy(v => Math.min(100, Math.max(0, v - (dy / coverRectH()) * 100 / zoom)))
    }
    adjTouches.current = Array.from(e.touches).map(tt => ({ x: tt.clientX, y: tt.clientY }))
  }
  const onAdjTouchEnd = (e: React.TouchEvent) => {
    adjTouches.current = Array.from(e.touches).map(tt => ({ x: tt.clientX, y: tt.clientY }))
    if (e.touches.length < 2) adjPinch.current = null
  }
  const enterAdjust = () => {
    setFrameErr(null)
    if (car?.cover_zoom == null) { setFx(50); setFy(50); setZoom(1) }
    adjustingRef.current = true
    setAdjusting(true)
  }
  const cancelAdjust = () => {
    if (car?.cover_zoom != null) { setFx(car.cover_focus_x ?? 50); setFy(car.cover_focus_y ?? 50); setZoom(car.cover_zoom) }
    else { setFx(50); setFy(50); setZoom(1) }
    adjustingRef.current = false
    setAdjusting(false)
  }
  const saveAdjust = async () => {
    if (!car || savingFrame) return
    setSavingFrame(true)
    setFrameErr(null)
    const vals = { cover_focus_x: Math.round(fx), cover_focus_y: Math.round(fy), cover_zoom: Math.round(zoom * 100) / 100 }
    const { error } = await supabase.from('cars').update(vals).eq('id', car.id)
    setSavingFrame(false)
    if (error) { setFrameErr('Couldn’t save framing — run migration 052.'); return }
    setCar(prev => prev ? { ...prev, ...vals } : prev)
    adjustingRef.current = false
    setAdjusting(false)
  }

  // ── feature story save ─────────────────────────────────────────────────────────
  const openStory = () => { setStoryErr(null); setStoryDraft(car?.featured_story ?? ''); setStoryOpen(true) }
  const saveStory = async () => {
    if (!car || savingStory) return
    setSavingStory(true)
    setStoryErr(null)
    const text = storyDraft.trim() || null
    const { error } = await supabase.from('cars').update({ featured_story: text }).eq('id', car.id)
    setSavingStory(false)
    if (error) { setStoryErr('Couldn’t save — run migration 052.'); return }
    setCar(prev => prev ? { ...prev, featured_story: text } : prev)
    setStoryOpen(false)
  }

  // ── editorial edit mode (055) ──────────────────────────────────────────────────
  const enterEditing = () => {
    setLayoutErr(null)
    setEditHeadline(car?.featured_layout?.headline ?? '')
    setEditDeck(car?.featured_layout?.deck ?? '')
    editingRef.current = true
    setEditing(true)
  }
  const cancelEditing = () => {
    editingRef.current = false
    setEditing(false)
    setLayoutErr(null)
  }
  const saveLayout = async () => {
    if (!car || savingLayout) return
    setSavingLayout(true)
    setLayoutErr(null)
    const hl = editHeadline.trim()
    const dk = editDeck.trim()
    // Preserve any other keys already in the layout (e.g. captions, set elsewhere).
    const prevLayout = car.featured_layout ?? {}
    const next: FeaturedLayout = { ...prevLayout }
    if (hl) next.headline = hl; else delete next.headline
    if (dk) next.deck = dk;     else delete next.deck
    // Refresh the engine snapshot so the "suggestion updated" dot clears until the
    // engine output next diverges. Only snapshot a slot the user is overriding.
    if (hl && engineFeature?.headline) next.generated_headline = engineFeature.headline
    else delete next.generated_headline
    if (dk && engineFeature?.deck) next.generated_deck = engineFeature.deck
    else delete next.generated_deck
    // Empty object → store NULL so the column reads cleanly as "fully generated".
    const payload: FeaturedLayout | null = Object.keys(next).length ? next : null
    const { error } = await supabase.from('cars').update({ featured_layout: payload }).eq('id', car.id)
    setSavingLayout(false)
    if (error) { setLayoutErr('Couldn’t save — run migration 055.'); return }
    setCar(prev => prev ? { ...prev, featured_layout: payload } : prev)
    editingRef.current = false
    setEditing(false)
  }

  // ── caption edit mode (055) ─────────────────────────────────────────────────────
  const enterCaptionEdit = (pageIdx: number, spreadPhotos: PhotoItem[]) => {
    setCaptionErr(null)
    const seed: Record<string, string> = {}
    for (const p of spreadPhotos) seed[p.key] = car?.featured_layout?.captions?.[p.key] ?? ''
    setEditCaptions(seed)
    capEditRef.current = true
    setCapEditPage(pageIdx)
  }
  const cancelCaptionEdit = () => {
    capEditRef.current = false
    setCapEditPage(null)
    setCaptionErr(null)
  }
  const saveCaptions = async (spreadPhotos: PhotoItem[]) => {
    if (!car || savingCaptions) return
    setSavingCaptions(true)
    setCaptionErr(null)
    const prevLayout = car.featured_layout ?? {}
    const captions    = { ...(prevLayout.captions ?? {}) }
    const genCaptions = { ...(prevLayout.generated_captions ?? {}) }
    for (const p of spreadPhotos) {
      const val = (editCaptions[p.key] ?? '').trim()
      if (val) {
        captions[p.key] = val
        // Snapshot the engine caption for this key so the freshness dot can later
        // flag when the engine output diverges.
        const eng = engineFeature?.captions[p.key]
        if (eng) genCaptions[p.key] = eng; else delete genCaptions[p.key]
      } else {
        delete captions[p.key]
        delete genCaptions[p.key]
      }
    }
    const next: FeaturedLayout = { ...prevLayout }
    if (Object.keys(captions).length)    next.captions = captions;             else delete next.captions
    if (Object.keys(genCaptions).length) next.generated_captions = genCaptions; else delete next.generated_captions
    const payload: FeaturedLayout | null = Object.keys(next).length ? next : null
    const { error } = await supabase.from('cars').update({ featured_layout: payload }).eq('id', car.id)
    setSavingCaptions(false)
    if (error) { setCaptionErr('Couldn’t save — run migration 055.'); return }
    setCar(prev => prev ? { ...prev, featured_layout: payload } : prev)
    capEditRef.current = false
    setCapEditPage(null)
  }

  // ── photo replacement helpers ──────────────────────────────────────────────────
  const openPhotoReplace = async (item: PhotoItem) => {
    setReplaceErr(null)
    setSourcePhotos([])
    setPhotoEditItem(item)
    setLoadingSourcePhotos(true)
    try {
      if (item.key.startsWith('bsg:')) {
        const group = item.key.slice(4)
        const cats = Object.entries(CAT_TO_GROUP).filter(([, g]) => g === group).map(([c]) => c)
        const groupJobIds = jobs.filter(j => j.category && cats.includes(j.category)).map(j => j.id)
        let urls: string[] = [item.url]
        if (groupJobIds.length > 0) {
          const { data } = await supabase.from('job_photos').select('photo_url')
            .in('job_id', groupJobIds).order('created_at', { ascending: false }).limit(16)
          const extra = ((data ?? []) as { photo_url: string }[]).map(r => r.photo_url).filter(Boolean)
          urls = [...new Set([item.url, ...extra])]
        }
        setSourcePhotos(urls)
      } else if (item.key.startsWith('tl:')) {
        const entryId = item.key.slice(3)
        const { data } = await supabase.from('timeline_entry_photos').select('photo_url')
          .eq('timeline_entry_id', entryId).order('created_at', { ascending: false }).limit(16)
        const extra = ((data ?? []) as { photo_url: string }[]).map(r => r.photo_url).filter(Boolean)
        setSourcePhotos([...new Set([item.url, ...extra])])
      }
    } finally {
      setLoadingSourcePhotos(false)
    }
  }

  const replacePhoto = async (newUrl: string) => {
    const item = photoEditItem
    if (!item || !car || replacingPhoto) return
    setReplacingPhoto(true)
    setReplaceErr(null)
    try {
      if (item.key.startsWith('bsg:')) {
        const group = item.key.slice(4)
        const col = GROUP_PHOTO_COL[group]
        const { error } = await supabase.from('cars').update({ [col]: newUrl }).eq('id', car.id)
        if (error) { setReplaceErr('Couldn’t update photo.'); return }
        setCar(prev => prev ? { ...prev, [col]: newUrl } : prev)
      } else if (item.key.startsWith('tl:')) {
        const entryId = item.key.slice(3)
        const { error } = await supabase.from('timeline_entries').update({ photo_url: newUrl }).eq('id', entryId)
        if (error) { setReplaceErr('Couldn’t update photo.'); return }
        setTimelinePhotos(prev => prev.map(tp => tp.id === entryId ? { ...tp, photo_url: newUrl } : tp))
      }
      setPhotoEditItem(null)
    } finally {
      setReplacingPhoto(false)
    }
  }

  const handlePhotoFileUpload = async (file: File) => {
    const item = photoEditItem
    if (!item || !car) return
    setReplacingPhoto(true)
    setReplaceErr(null)
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true, fileType: 'image/jpeg',
      })
      const rand = Math.random().toString(36).slice(2, 7)
      const isTimeline = item.key.startsWith('tl:')
      const bucket = isTimeline ? 'timeline-photos' : 'car-photos'
      const path = isTimeline
        ? `${car.id}/featured-${Date.now()}-${rand}.jpg`
        : `${car.id}/build-sheet/${item.key.slice(4)}-${Date.now()}-${rand}.jpg`
      const { error: upErr } = await supabase.storage.from(bucket).upload(path, compressed, { contentType: 'image/jpeg', upsert: false })
      if (upErr) { setReplaceErr('Upload failed.'); return }
      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path)
      const newUrl = pub.publicUrl
      if (isTimeline) {
        const entryId = item.key.slice(3)
        await supabase.from('timeline_entry_photos').insert({ timeline_entry_id: entryId, photo_url: newUrl, car_id: car.id })
        const { error } = await supabase.from('timeline_entries').update({ photo_url: newUrl }).eq('id', entryId)
        if (error) { setReplaceErr('Couldn’t update photo.'); return }
        setTimelinePhotos(prev => prev.map(tp => tp.id === entryId ? { ...tp, photo_url: newUrl } : tp))
      } else {
        const group = item.key.slice(4)
        const col = GROUP_PHOTO_COL[group]
        const { error } = await supabase.from('cars').update({ [col]: newUrl }).eq('id', car.id)
        if (error) { setReplaceErr('Couldn’t update photo.'); return }
        setCar(prev => prev ? { ...prev, [col]: newUrl } : prev)
      }
      setPhotoEditItem(null)
    } finally {
      setReplacingPhoto(false)
    }
  }

  // ── publish helpers ──────────────────────────────────────────────────────────────
  const shareUrl = myUsername && car?.is_public !== false
    ? `https://gdimension.app/builds/${myUsername}/featured`
    : null
  const togglePublish = async () => {
    if (!car || savingPublish) return
    setSavingPublish(true)
    setPublishErr(null)
    const next = !isPublished
    const { error } = await supabase.from('cars').update({ show_featured_publicly: next }).eq('id', car.id)
    setSavingPublish(false)
    if (error) { setPublishErr("Couldn't save"); return }
    setIsPublished(next)
    setCar(prev => prev ? { ...prev, show_featured_publicly: next } : prev)
  }

  // ── story photo framing helpers ──────────────────────────────────────────────────
  const enterSpAdjust = () => {
    setSpFrameErr(null)
    spAdjustingRef.current = true
    setSpAdjusting(true)
  }
  const cancelSpAdjust = () => {
    const l = car?.featured_layout
    setSpFx(l?.story_photo_focus_x ?? 50)
    setSpFy(l?.story_photo_focus_y ?? 50)
    setSpZoom(l?.story_photo_zoom ?? 1)
    setSpHeight(l?.story_photo_height ?? 32)
    spAdjustingRef.current = false
    setSpAdjusting(false)
  }
  // Merge the given story-photo layout overrides into featured_layout and persist.
  // Used by the Adjust Save (focus/zoom/height) and by the height + reorder drag-ends.
  const persistStoryLayout = async (overrides: Partial<FeaturedLayout>): Promise<boolean> => {
    if (!car) return false
    const next: FeaturedLayout = { ...(car.featured_layout ?? {}), ...overrides }
    const payload: FeaturedLayout | null = Object.keys(next).length ? next : null
    const { error } = await supabase.from('cars').update({ featured_layout: payload }).eq('id', car.id)
    if (error) return false
    setCar(prev => prev ? { ...prev, featured_layout: payload } : prev)
    return true
  }
  const saveSpFrame = async () => {
    if (!car || savingSpFrame) return
    setSavingSpFrame(true)
    setSpFrameErr(null)
    const ok = await persistStoryLayout({
      story_photo_focus_x: Math.round(spFx),
      story_photo_focus_y: Math.round(spFy),
      story_photo_zoom: Math.round(spZoom * 100) / 100,
      story_photo_height: Math.round(spHeight),
    })
    setSavingSpFrame(false)
    if (!ok) { setSpFrameErr("Couldn't save — run migration 055."); return }
    spAdjustingRef.current = false
    setSpAdjusting(false)
  }
  const onSpAdjTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation()
    spTouches.current = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }))
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      spPinch.current = { dist: Math.hypot(dx, dy), zoom: spZoom }
    }
  }
  const onSpAdjTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation()
    const photoH = (spHeight / 100) * window.innerHeight
    if (e.touches.length === 2 && spPinch.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const d = Math.hypot(dx, dy)
      setSpZoom(Math.min(3, Math.max(1, spPinch.current.zoom * (d / spPinch.current.dist))))
    } else if (e.touches.length === 1 && spTouches.current.length >= 1) {
      const prev = spTouches.current[0]
      const dx = e.touches[0].clientX - prev.x
      const dy = e.touches[0].clientY - prev.y
      setSpFx(v => Math.min(100, Math.max(0, v - (dx / window.innerWidth) * 100 / spZoom)))
      setSpFy(v => Math.min(100, Math.max(0, v - (dy / photoH) * 100 / spZoom)))
    }
    spTouches.current = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }))
  }
  const onSpAdjTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation()
    spTouches.current = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }))
    if (e.touches.length < 2) spPinch.current = null
  }
  const onSpHeightDragStart = (e: React.TouchEvent) => {
    e.stopPropagation()
    spHeightDragRef.current = true
    spHeightStartY.current    = e.touches[0].clientY
    spHeightStartVal.current  = spHeight
    let latest = spHeight
    const handleMove = (ev: TouchEvent) => {
      const delta = ((ev.touches[0].clientY - spHeightStartY.current) / window.innerHeight) * 100
      latest = Math.min(60, Math.max(14, spHeightStartVal.current + delta))
      setSpHeight(latest)
    }
    const handleEnd = () => {
      spHeightDragRef.current = false
      window.removeEventListener('touchmove', handleMove)
      window.removeEventListener('touchend', handleEnd)
      void persistStoryLayout({ story_photo_height: Math.round(latest) })
    }
    window.addEventListener('touchmove', handleMove, { passive: true })
    window.addEventListener('touchend', handleEnd, { passive: true })
  }
  // Position drag — slides the photo smoothly up/down through the free space below
  // the writing (continuous, like the cover pan). The finger tracks the photo's
  // center within the column's draggable band; 0 = just below the text, 1 = bottom.
  const onSpPosDragStart = (e: React.TouchEvent) => {
    e.stopPropagation()
    const col = (e.currentTarget as HTMLElement).closest('[data-story-content]') as HTMLElement | null
    if (!col) return
    const rect = col.getBoundingClientRect()
    const photoH = (spHeight / 100) * window.innerHeight
    const band = Math.max(1, rect.height - photoH)   // px of travel for the full 0→1 range
    const startY = e.touches[0].clientY
    const startPos = spPos ?? 1
    spPosDragRef.current = true
    let latest = startPos
    const handleMove = (ev: TouchEvent) => {
      // Delta-based so the photo never jumps on grab — finger moves it 1:1.
      latest = Math.min(1, Math.max(0, startPos + (ev.touches[0].clientY - startY) / band))
      setSpPos(latest)
    }
    const handleEnd = () => {
      spPosDragRef.current = false
      window.removeEventListener('touchmove', handleMove)
      window.removeEventListener('touchend', handleEnd)
      void persistStoryLayout({ story_photo_pos: Math.round(latest * 1000) / 1000 })
    }
    window.addEventListener('touchmove', handleMove, { passive: true })
    window.addEventListener('touchend', handleEnd, { passive: true })
  }

  // ── story photo chooser helpers ─────────────────────────────────────────────────
  const saveStoryPhoto = async (url: string | null) => {
    if (!car || savingStoryPhoto) return
    setSavingStoryPhoto(true)
    setStoryPhotoErr(null)
    try {
      const prevLayout = car.featured_layout ?? {}
      const next: FeaturedLayout = { ...prevLayout }
      if (url) next.story_photo = url; else delete next.story_photo
      const payload: FeaturedLayout | null = Object.keys(next).length ? next : null
      const { error } = await supabase.from('cars').update({ featured_layout: payload }).eq('id', car.id)
      if (error) { setStoryPhotoErr('Couldn’t save — run migration 055.'); return }
      setCar(prev => prev ? { ...prev, featured_layout: payload } : prev)
      setStoryPhotoSheet(false)
    } finally {
      setSavingStoryPhoto(false)
    }
  }
  const uploadStoryPhoto = async (file: File) => {
    if (!car) return
    setSavingStoryPhoto(true)
    setStoryPhotoErr(null)
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true, fileType: 'image/jpeg',
      })
      const rand = Math.random().toString(36).slice(2, 7)
      const path = `${car.id}/featured-story-${Date.now()}-${rand}.jpg`
      const { error: upErr } = await supabase.storage.from('car-photos').upload(path, compressed, { contentType: 'image/jpeg', upsert: false })
      if (upErr) { setStoryPhotoErr('Upload failed.'); return }
      const { data: pub } = supabase.storage.from('car-photos').getPublicUrl(path)
      await saveStoryPhoto(pub.publicUrl)
    } finally {
      setSavingStoryPhoto(false)
    }
  }

  // A spread shows the quiet dot when any of its photos has a custom caption AND
  // the live engine caption for that photo now differs from the saved snapshot.
  const captionSuggestionFor = (spreadPhotos: PhotoItem[]): boolean => {
    const caps = layout?.captions ?? {}
    const gen  = layout?.generated_captions ?? {}
    return spreadPhotos.some(p => {
      const eng = engineFeature?.captions[p.key]
      return !!(caps[p.key]?.trim() && gen[p.key] && eng && gen[p.key] !== eng)
    })
  }

  const grouped = useMemo(() => {
    const g: Record<string,Job[]> = { power:[], chassis:[], exterior:[], interior:[] }
    for (const job of jobs) {
      const grp = job.category ? CAT_TO_GROUP[job.category] : undefined
      if (grp) g[grp].push(job)
    }
    return g
  }, [jobs])

  // Editorial engine — deterministic feature copy keyed to car.id
  const engineFeature = useMemo(() => {
    if (!car || !car.year || !car.make || !car.model) return null
    const modData = jobs.map(j => ({ category: j.category ?? 'Unknown', status: 'installed' as const }))
    const groupKeys = ['power', 'chassis', 'exterior', 'interior'] as const
    const groupCols = ['build_sheet_power_photo', 'build_sheet_chassis_photo', 'build_sheet_exterior_photo', 'build_sheet_interior_photo'] as const
    // Slot `id` is the STABLE caption key (bsg:<group> / tl:<entryId>) so the
    // engine's caption map is keyed the same way as user overrides (055).
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
      { distance_unit: userUnits.distance_unit, power_unit: userUnits.power_unit },
      slots,
    )
  }, [car, jobs, timelinePhotos, userUnits])

  // ── effective cover copy: user override wins, else engine, else car name ──────
  const layout      = car?.featured_layout ?? null
  const genHeadline = engineFeature?.headline ?? null
  const genDeck     = engineFeature?.deck ?? null
  // In edit mode the in-progress draft drives the cover live (placeholder = engine).
  const coverHeadline = editing
    ? (editHeadline.trim() || genHeadline || carName)
    : (layout?.headline?.trim() || genHeadline || carName)
  const coverDeck = editing
    ? (editDeck.trim() || genDeck || '')
    : (layout?.deck?.trim() || genDeck || '')

  // Quiet "suggestion updated" signal: the user has a custom override AND the live
  // engine output now differs from the snapshot taken when they last saved. A user
  // who adds mods later can discover the refreshed engine line without any nag.
  const headlineUpdated = !!(layout?.headline?.trim() && layout.generated_headline && genHeadline && layout.generated_headline !== genHeadline)
  const deckUpdated     = !!(layout?.deck?.trim()     && layout.generated_deck     && genDeck     && layout.generated_deck     !== genDeck)
  const hasSuggestion   = headlineUpdated || deckUpdated

  // ── photo pool (priority: build-group photos, then timeline photos) ────
  // Each item carries its STABLE key + a `baseCaption` (the timeline note title,
  // when present) — distinct from the engine fallback and the user's override.
  const photoPool = useMemo<(PhotoItem & { baseCaption: string | null })[]>(() => {
    if (!car) return []
    const used = new Set<string>()
    if (car.original_photo_url) used.add(car.original_photo_url)   // cover photo
    if (car.garage_photo_url)   used.add(car.garage_photo_url)     // cover photo (cutout)
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

  // ── resolve each caption: user override (055) > base (timeline title) > engine.
  // `placeholder` carries the default (base ?? engine) shown in the edit field. ──
  const photoPoolFinal = useMemo<PhotoItem[]>(() => {
    const overrides = layout?.captions ?? {}
    return photoPool.map(item => {
      const engineCap  = engineFeature?.captions[item.key] ?? null
      const def        = item.baseCaption ?? engineCap
      const override   = overrides[item.key]?.trim() || null
      return { url: item.url, key: item.key, caption: override ?? def, placeholder: def }
    })
  }, [photoPool, engineFeature, layout])

  // ── photo spreads: 0 / 1 / 2 pages, deterministic collage arrangement ──────────
  const photoSpreads = useMemo(() => {
    const capped = photoPoolFinal.slice(0, 8)
    if (capped.length === 0) return [] as { photos: PhotoItem[]; arrangement: number }[]
    const lrng = mulberry32((seed || 1) ^ 0xa17de51)
    const chunks: PhotoItem[][] = capped.length <= 4
      ? [capped]
      : [capped.slice(0, Math.ceil(capped.length / 2)), capped.slice(Math.ceil(capped.length / 2))]
    return chunks.map(ph => ({ photos: ph, arrangement: Math.floor(lrng() * 2) }))
  }, [photoPoolFinal, seed])

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
    if (car?.featured_story?.trim()) arr.push({ kind:'story', label:'THE STORY' })
    specPages.forEach((secs, i) => arr.push({ kind:'spec', label:'SPEC SHEET', sections: secs, isCont: i > 0 }))
    return arr
  }, [photoSpreads, specPages, car?.featured_story])

  useEffect(() => { pagesLenRef.current = pages.length }, [pages.length])

  // ── idle preload: next page images during browser downtime ───────────────────
  useEffect(() => {
    const nextPage = pages[pageIdx + 1]
    if (!nextPage || nextPage.kind !== 'photo' || !nextPage.photos) return
    const urls = nextPage.photos.map(p => p.url)
    const doPreload = () => { for (const u of urls) { const img = new Image(); img.src = u } }
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const id = (window as typeof window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number })
        .requestIdleCallback(doPreload, { timeout: 2000 })
      return () => (window as typeof window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(id)
    }
    const id = setTimeout(doPreload, 350)
    return () => clearTimeout(id)
  }, [pageIdx, pages])

  // Cancel story-photo adjust when the user turns away from the story page
  useEffect(() => {
    if (spAdjustingRef.current) { spAdjustingRef.current = false; setSpAdjusting(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIdx])

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
      if (adjustingRef.current || editingRef.current || capEditRef.current || spAdjustingRef.current || spHeightDragRef.current || spPosDragRef.current) return
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
    if (isTurningRef.current || adjustingRef.current || editingRef.current || capEditRef.current || storyOpen) return
    touchStartXRef.current = e.touches[0].clientX
    touchStartYRef.current = e.touches[0].clientY
    isDragTurnRef.current  = false
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (adjustingRef.current || editingRef.current || capEditRef.current) return
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
            {photo && photo.mode === 'cutout' && (
              <img src={photo.url} alt=""
                style={{ position:'absolute', top:'12%', left:0, right:0, width:'100%', height:'62%', objectFit:'contain', objectPosition:'center' }} />
            )}
            {photo && photo.mode === 'full' && framed && (
              // User-framed (052): contain baseline (zoom 1 = whole photo, matching
              // the unframed view so entering adjust doesn't jump) + saved focus/zoom.
              <div style={{ position:'absolute', top:'12%', left:0, right:0, height:'62%', overflow:'hidden' }}>
                <img src={photo.url} alt=""
                  onLoad={(e) => { const img = e.currentTarget; setPhotoAspect(img.naturalWidth / img.naturalHeight) }}
                  style={{ width:'100%', height:'100%', objectFit:'contain', objectPosition:`${fx}% ${fy}%`,
                    transform:`scale(${zoom})`, transformOrigin:`${fx}% ${fy}%`, display:'block' }} />
              </div>
            )}
            {photo && photo.mode === 'full' && !framed && (
              // Unframed legacy: contain with aspect heuristics.
              <img src={photo.url} alt=""
                onLoad={(e) => { const img = e.currentTarget; setPhotoAspect(img.naturalWidth / img.naturalHeight) }}
                style={(() => {
                  const h = photoAspect !== null
                    ? (photoAspect > 1.3 ? '56%' : photoAspect < 0.85 ? '70%' : '62%')
                    : '62%'
                  return { position:'absolute' as const, top:'12%', left:0, right:0, width:'100%', height:h, objectFit:'contain' as const, objectPosition:'center' }
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
              {/* Headline — engine-generated, or the owner's override (055) */}
              {(() => {
                const hl = coverHeadline
                const fs = hl.length > 22 ? 28 : hl.length > 14 ? 36 : 44
                const headStyle: React.CSSProperties = { fontFamily:FONT_MASTHEAD, color:bottomColor, lineHeight:0.92, fontSize:fs, textTransform:'uppercase', letterSpacing:'-0.01em', textShadow:t.textOnPhoto==='light'?'0 2px 14px rgba(0,0,0,0.5)':'none' }
                if (editing) return (
                  <textarea value={editHeadline} onChange={e => setEditHeadline(e.target.value)}
                    placeholder={genHeadline ?? carName} rows={1}
                    style={{ ...headStyle, width:'100%', textAlign:'center', resize:'none', background:'rgba(0,0,0,0.18)', border:`1px dashed ${t.accent}`, outline:'none', padding:'2px 4px', boxSizing:'border-box', caretColor:t.accent }} />
                )
                return <div style={headStyle}>{hl}</div>
              })()}
              {/* Car identification line */}
              <div style={{ fontFamily:FONT_MASTHEAD, color:bottomColor, lineHeight:0.95, fontSize:14,
                fontStyle:'normal', textTransform:'uppercase', letterSpacing:'-0.01em',
                textShadow:t.textOnPhoto==='light'?'0 2px 10px rgba(0,0,0,0.5)':'none', marginTop:8 }}>
                {carName}{car?.trim ? ` ${car.trim}` : ''}
              </div>
              {/* Nickname in Cormorant italic — only when present */}
              {car?.nickname && (
                <div style={{ fontFamily:FONT_TITLE, fontStyle:'italic', color:bottomColor, opacity:0.92,
                  fontSize:15, lineHeight:1.25, marginTop:6,
                  textShadow:t.textOnPhoto==='light'?'0 1px 8px rgba(0,0,0,0.5)':'none' }}>
                  {car.nickname}
                </div>
              )}
              {/* Deck — engine-generated, or the owner's override (055) */}
              {(() => {
                const deckStyle: React.CSSProperties = { fontFamily:FONT_TITLE, fontStyle:'italic', color:bottomColor, opacity:0.82,
                  fontSize:12.5, lineHeight:1.35, marginTop:5,
                  textShadow:t.textOnPhoto==='light'?'0 1px 8px rgba(0,0,0,0.5)':'none' }
                if (editing) return (
                  <textarea value={editDeck} onChange={e => setEditDeck(e.target.value)}
                    placeholder={genDeck ?? 'A line of cover copy…'} rows={2}
                    style={{ ...deckStyle, opacity:1, width:'100%', textAlign:'center', resize:'none', background:'rgba(0,0,0,0.18)', border:`1px dashed ${t.accent}`, outline:'none', padding:'2px 4px', boxSizing:'border-box', caretColor:t.accent }} />
                )
                return coverDeck ? <div style={deckStyle}>{coverDeck}</div> : null
              })()}
              {powerLine && <div style={{ fontFamily:FONT_DECK, fontWeight:600, color:t.accent, fontSize:12, letterSpacing:'0.06em', textTransform:'uppercase', marginTop:6 }}>{powerLine}</div>}
            </div>

            <div style={{ position:'absolute', ...(coverIdx % 2 === 0 ? { left:12, bottom:16 } : { right:12, bottom:16 }),
              transform:'scale(0.72)', transformOrigin: coverIdx % 2 === 0 ? 'bottom left' : 'bottom right' }}>
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

    const dotsProps = pages.length > 1 ? { count: pages.length, active: i } : undefined

    if (pg.kind === 'photo') {
      const spreadPhotos = pg.photos!
      const capEditing = capEditPage === i
      return (
        <PhotoSpread photos={spreadPhotos} arrangement={pg.arrangement ?? 0} theme={theme}
          backLabel={prev ? 'PREV PAGE' : 'COVER'} nextLabel={next ? 'NEXT PAGE' : undefined} pageNum={i + 1}
          carShortName={carShortName}
          near={Math.abs(i - pageIdx) <= 1}
          onBack={capEditing ? undefined : onBack} onNext={capEditing ? undefined : onNext} dots={dotsProps}
          canEdit={!!car && i === pageIdx && !isTurning}
          editing={capEditing}
          captionSuggestion={captionSuggestionFor(spreadPhotos)}
          saving={savingCaptions}
          captionErr={captionErr}
          captionValue={(key) => editCaptions[key] ?? ''}
          onCaptionChange={(key, val) => setEditCaptions(prev => ({ ...prev, [key]: val }))}
          onEnterEdit={() => enterCaptionEdit(i, spreadPhotos)}
          onCancelEdit={cancelCaptionEdit}
          onSaveEdit={() => saveCaptions(spreadPhotos)}
          onReplacePhoto={!!car && i === pageIdx && !isTurning ? openPhotoReplace : undefined} />
      )
    }

    if (pg.kind === 'story') {
      const storyEditing = editing && i === pageIdx
      return (
        <StoryPage story={car?.featured_story ?? ''} headline={coverHeadline}
          carShortName={carShortName} theme={theme}
          backLabel={prev ? 'PREV PAGE' : 'COVER'} nextLabel={next ? 'NEXT PAGE' : undefined} pageNum={i + 1}
          onBack={storyEditing ? undefined : onBack} onNext={storyEditing ? undefined : onNext} dots={dotsProps}
          canEdit={!!car && i === pageIdx && !isTurning}
          editing={storyEditing}
          editHeadline={editHeadline} onHeadlineChange={setEditHeadline}
          saving={savingLayout} err={layoutErr} hasSuggestion={hasSuggestion}
          onEnterEdit={enterEditing} onCancelEdit={cancelEditing} onSaveEdit={saveLayout}
          storyPhoto={layout?.story_photo ?? photos[0]?.url ?? null}
          onChangePhoto={() => { setStoryPhotoErr(null); setStoryPhotoSheet(true) }}
          spAdjusting={spAdjusting} spFx={spFx} spFy={spFy} spZoom={spZoom} spHeight={spHeight}
          onAdjust={enterSpAdjust}
          onAdjTouchStart={onSpAdjTouchStart} onAdjTouchMove={onSpAdjTouchMove} onAdjTouchEnd={onSpAdjTouchEnd}
          onHeightDragStart={onSpHeightDragStart}
          spPos={spPos} onPosDragStart={onSpPosDragStart}
          onSaveFrame={saveSpFrame} onCancelFrame={cancelSpAdjust}
          savingFrame={savingSpFrame} frameErr={spFrameErr} />
      )
    }

    // spec
    return (
      <SpecSheet sections={pg.sections!} isCont={!!pg.isCont} theme={theme}
        totalMods={jobs.length} carShortName={carShortName}
        backLabel={prev ? 'PREV PAGE' : 'COVER'} nextLabel={next ? 'NEXT PAGE' : undefined} pageNum={i + 1}
        onBack={onBack} onNext={onNext} dots={dotsProps}
        isLast={!next}
        isPublished={isPublished} onTogglePublish={togglePublish} savingPublish={savingPublish}
        publishErr={publishErr} shareUrl={shareUrl} />
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
      {pageIdx === 0 && !isTurning && !adjusting && !editing && (
        <>
          <div style={{ position:'absolute', top:18, left:0, right:0, textAlign:'center', zIndex:20, fontFamily:FONT_DECK, fontWeight:600, fontSize:9, letterSpacing:'0.28em', textTransform:'uppercase', color:'rgba(245,245,245,0.55)', pointerEvents:'none' }}>
            Cover {coverIdx+1}/{TEMPLATES.length} · {t.name}
          </div>
          <div style={{ position:'absolute', top:48, right:12, zIndex:20, display:'flex', flexDirection:'column', alignItems:'flex-end', gap:7 }}>
            {photos.length > 1 && (
              <div onClick={() => setPhotoIdx(p=>(p+1)%photos.length)} style={COVER_CHIP}>
                Photo ▸ {photo?.label??'—'}
              </div>
            )}
            {photo?.mode === 'full' && (
              <div onClick={enterAdjust} style={COVER_CHIP}>Frame ⤢</div>
            )}
            {car && (
              <div onClick={openStory} style={COVER_CHIP}>{car.featured_story?.trim() ? 'Story' : 'Write Story'} <PencilIcon /></div>
            )}
            {car && (
              <div onClick={enterEditing} style={{ ...COVER_CHIP, position:'relative', display:'flex', alignItems:'center', gap:5 }}>
                Edit Cover <PencilIcon />
                {hasSuggestion && (
                  // Quiet amber dot — engine has a fresher line than the saved override.
                  <span style={{ position:'absolute', top:-3, right:-3, width:7, height:7, borderRadius:'50%', background:COLOR_ACCENT, boxShadow:'0 0 0 1.5px rgba(0,0,0,0.55)' }} />
                )}
              </div>
            )}
          </div>
          <div onClick={() => cycleCover(-1)} style={{ position:'absolute', top:'30%', bottom:'22%', left:0, width:'26%', zIndex:15 }} />
          <div onClick={() => cycleCover(1)}  style={{ position:'absolute', top:'30%', bottom:'22%', right:0, width:'22%', zIndex:15 }} />
          <div style={{ position:'absolute', bottom:6, left:0, right:0, display:'flex', justifyContent:'center', gap:6, zIndex:20 }}>
            {TEMPLATES.map((tp,i) => (
              <div key={tp.id} onClick={() => { userPickedCoverRef.current = true; setCoverIdx(i) }}
                style={{ width:i===coverIdx?16:6, height:6, borderRadius:3, background:i===coverIdx?COLOR_ACCENT:'rgba(245,245,245,0.4)', transition:`all 200ms ${EASING_SETTLE}`, cursor:'pointer' }} />
            ))}
          </div>
        </>
      )}

      {/* ── Cover framing adjust mode ── */}
      {adjusting && (
        <div
          style={{ position:'absolute', inset:0, zIndex:25, touchAction:'none' }}
          onTouchStart={onAdjTouchStart}
          onTouchMove={onAdjTouchMove}
          onTouchEnd={onAdjTouchEnd}
        >
          {/* cover-rect outline */}
          <div style={{ position:'absolute', top:'12%', left:0, right:0, height:'62%', border:`1.5px dashed ${COLOR_ACCENT}`, boxSizing:'border-box', pointerEvents:'none' }} />
          <div style={{ position:'absolute', top:16, left:0, right:0, textAlign:'center', fontFamily:FONT_DECK, fontWeight:600, fontSize:10, letterSpacing:'0.2em', textTransform:'uppercase', color:'#f5f5f5', textShadow:'0 1px 6px rgba(0,0,0,0.8)', pointerEvents:'none' }}>
            Drag to position · pinch to zoom
          </div>
          <div style={{ position:'absolute', top:36, left:0, right:0, textAlign:'center', fontFamily:FONT_DECK, fontWeight:600, fontSize:9, letterSpacing:'0.12em', color:'rgba(245,245,245,0.6)', pointerEvents:'none' }}>
            {Math.round(zoom * 100)}%
          </div>
          {frameErr && (
            <div style={{ position:'absolute', bottom:96, left:0, right:0, textAlign:'center', fontFamily:FONT_DECK, fontSize:11, color:'#e08a6e', textShadow:'0 1px 4px rgba(0,0,0,0.8)' }}>{frameErr}</div>
          )}
          <div style={{ position:'absolute', bottom:28, left:0, right:0, display:'flex', justifyContent:'center', gap:12 }}>
            <button onClick={cancelAdjust}
              style={{ fontFamily:FONT_DECK, fontWeight:700, fontSize:11, letterSpacing:'0.18em', textTransform:'uppercase', color:'#f5f5f5', background:'rgba(0,0,0,0.6)', border:'1px solid rgba(245,245,245,0.4)', padding:'11px 22px', cursor:'pointer' }}>
              Cancel
            </button>
            <button onClick={saveAdjust} disabled={savingFrame}
              style={{ fontFamily:FONT_DECK, fontWeight:700, fontSize:11, letterSpacing:'0.18em', textTransform:'uppercase', color:'#fff', background:COLOR_ACCENT, border:'none', padding:'11px 26px', cursor:'pointer', opacity:savingFrame?0.6:1 }}>
              {savingFrame ? 'Saving…' : 'Save Framing'}
            </button>
          </div>
        </div>
      )}

      {/* ── Editorial edit mode (055): inline headline/deck + suggestion adopt ── */}
      {editing && (
        <>
          <div style={{ position:'absolute', top:16, left:0, right:0, textAlign:'center', zIndex:25, fontFamily:FONT_DECK, fontWeight:600, fontSize:10, letterSpacing:'0.2em', textTransform:'uppercase', color:'#f5f5f5', textShadow:'0 1px 6px rgba(0,0,0,0.8)', pointerEvents:'none' }}>
            Tap the headline or deck to rewrite
          </div>
          {/* Suggestion adopt — only when the engine has a fresher line than the saved override */}
          {(headlineUpdated || deckUpdated) && (
            <div style={{ position:'absolute', top:40, left:14, right:14, zIndex:26, background:'rgba(0,0,0,0.72)', border:`1px solid ${COLOR_ACCENT}`, padding:'10px 12px' }}>
              <div style={{ fontFamily:FONT_DECK, fontWeight:700, fontSize:9, letterSpacing:'0.18em', textTransform:'uppercase', color:COLOR_ACCENT, marginBottom:6 }}>Updated suggestion</div>
              {headlineUpdated && genHeadline && (
                <div onClick={() => setEditHeadline(genHeadline)} style={{ cursor:'pointer', marginBottom: deckUpdated ? 8 : 0 }}>
                  <div style={{ fontFamily:FONT_MASTHEAD, color:'#f5f5f5', fontSize:18, textTransform:'uppercase', lineHeight:1.05 }}>{genHeadline}</div>
                  <div style={{ fontFamily:FONT_DECK, fontSize:9, letterSpacing:'0.14em', textTransform:'uppercase', color:COLOR_ACCENT, marginTop:2 }}>Tap to use this headline ›</div>
                </div>
              )}
              {deckUpdated && genDeck && (
                <div onClick={() => setEditDeck(genDeck)} style={{ cursor:'pointer' }}>
                  <div style={{ fontFamily:FONT_TITLE, fontStyle:'italic', color:'#f5f5f5', fontSize:13, lineHeight:1.3 }}>{genDeck}</div>
                  <div style={{ fontFamily:FONT_DECK, fontSize:9, letterSpacing:'0.14em', textTransform:'uppercase', color:COLOR_ACCENT, marginTop:2 }}>Tap to use this deck ›</div>
                </div>
              )}
            </div>
          )}
          {layoutErr && (
            <div style={{ position:'absolute', bottom:80, left:0, right:0, textAlign:'center', zIndex:26, fontFamily:FONT_DECK, fontSize:11, color:'#e08a6e', textShadow:'0 1px 4px rgba(0,0,0,0.8)' }}>{layoutErr}</div>
          )}
          <div style={{ position:'absolute', bottom:28, left:0, right:0, display:'flex', justifyContent:'center', gap:12, zIndex:26 }}>
            <button onClick={cancelEditing}
              style={{ fontFamily:FONT_DECK, fontWeight:700, fontSize:11, letterSpacing:'0.18em', textTransform:'uppercase', color:'#f5f5f5', background:'rgba(0,0,0,0.6)', border:'1px solid rgba(245,245,245,0.4)', padding:'11px 22px', cursor:'pointer' }}>
              Cancel
            </button>
            <button onClick={saveLayout} disabled={savingLayout}
              style={{ fontFamily:FONT_DECK, fontWeight:700, fontSize:11, letterSpacing:'0.18em', textTransform:'uppercase', color:'#fff', background:COLOR_ACCENT, border:'none', padding:'11px 26px', cursor:'pointer', opacity:savingLayout?0.6:1 }}>
              {savingLayout ? 'Saving…' : 'Save Cover'}
            </button>
          </div>
        </>
      )}

      {/* ── Feature story compose sheet ── */}
      {storyOpen && (
        <div style={{ position:'absolute', inset:0, zIndex:60, background:'rgba(0,0,0,0.72)', display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
          <div style={{ background:'#15151a', padding:'20px 18px calc(18px + env(safe-area-inset-bottom))', maxHeight:'86dvh', display:'flex', flexDirection:'column' }}>
            <div style={{ fontFamily:FONT_MASTHEAD, fontStyle:'italic', color:'#f0ede8', fontSize:20, textTransform:'uppercase', letterSpacing:'0.01em', marginBottom:4 }}>The Feature Story</div>
            <p style={{ fontFamily:FONT_DECK, fontWeight:500, fontSize:11, color:'rgba(240,237,232,0.55)', lineHeight:1.5, margin:'0 0 12px' }}>
              Written like a magazine would write about the car — third person, present tense.
              Your first-person story lives on the Timeline; this is the editorial version.
            </p>
            <textarea
              value={storyDraft}
              onChange={e => setStoryDraft(e.target.value)}
              placeholder="Park next to it and the first thing you notice is the stance…"
              style={{ flex:1, minHeight:'34dvh', resize:'none', background:'rgba(240,237,232,0.06)', border:'1px solid rgba(240,237,232,0.16)',
                color:'#f0ede8', fontFamily:FONT_TITLE, fontStyle:'italic', fontSize:16, lineHeight:1.55, padding:'12px 14px', outline:'none', boxSizing:'border-box' }}
            />
            {storyErr && <p style={{ fontFamily:FONT_DECK, fontSize:11, color:'#e08a6e', margin:'10px 0 0' }}>{storyErr}</p>}
            <div style={{ display:'flex', gap:10, marginTop:14 }}>
              <button onClick={() => setStoryOpen(false)} disabled={savingStory}
                style={{ flex:1, fontFamily:FONT_DECK, fontWeight:700, fontSize:11, letterSpacing:'0.16em', textTransform:'uppercase', color:'#f0ede8', background:'transparent', border:'1px solid rgba(240,237,232,0.3)', padding:'13px 0', cursor:'pointer' }}>
                Cancel
              </button>
              <button onClick={saveStory} disabled={savingStory}
                style={{ flex:2, fontFamily:FONT_DECK, fontWeight:700, fontSize:11, letterSpacing:'0.16em', textTransform:'uppercase', color:'#fff', background:COLOR_ACCENT, border:'none', padding:'13px 0', cursor:'pointer', opacity:savingStory?0.6:1 }}>
                {savingStory ? 'Saving…' : 'Publish to the Issue'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ── Photo replace sheet ── */}
      <input ref={photoReplaceFileRef} type="file" accept="image/*" style={{ display:'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoFileUpload(f); e.target.value = '' }} />
      {photoEditItem && (
        <div style={{ position:'fixed', inset:0, zIndex:55, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}
          onClick={() => !replacingPhoto && setPhotoEditItem(null)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:theme.menuHeaderBg, borderTop:`1px solid ${theme.rule}`, paddingBottom:'env(safe-area-inset-bottom, 0)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px 8px' }}>
              <span style={{ fontFamily:FONT_DECK, fontWeight:700, fontSize:11, letterSpacing:'0.18em', textTransform:'uppercase', color:theme.menuHeaderInk }}>
                Replace Photo
              </span>
              <button onClick={() => setPhotoEditItem(null)} disabled={replacingPhoto}
                style={{ background:'transparent', border:'none', color:theme.menuHeaderInk, fontSize:22, lineHeight:1, cursor:'pointer', padding:'0 4px', opacity:0.7 }}>×</button>
            </div>
            {replaceErr && (
              <div style={{ padding:'0 16px 8px', fontFamily:FONT_DECK, fontSize:10, color:'#e08a6e' }}>{replaceErr}</div>
            )}
            <div style={{ overflowX:'auto', display:'flex', gap:8, padding:'0 16px 14px', WebkitOverflowScrolling:'touch' } as React.CSSProperties}>
              {loadingSourcePhotos && (
                <div style={{ width:80, height:80, display:'flex', alignItems:'center', justifyContent:'center',
                  fontFamily:FONT_DECK, fontSize:9, color:theme.menuHeaderInk, opacity:0.5 }}>Loading…</div>
              )}
              {sourcePhotos.map(url => (
                <div key={url} onClick={() => !replacingPhoto && replacePhoto(url)}
                  style={{ flexShrink:0, width:80, height:80, position:'relative', cursor:'pointer',
                    outline: url === photoEditItem.url ? `2px solid ${theme.accent}` : 'none',
                    outlineOffset:2, opacity: replacingPhoto ? 0.5 : 1 }}>
                  <img src={url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
                  {url === photoEditItem.url && (
                    <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <span style={{ fontFamily:FONT_DECK, fontSize:7, letterSpacing:'0.14em', color:'#fff', textTransform:'uppercase' }}>Current</span>
                    </div>
                  )}
                </div>
              ))}
              <div onClick={() => !replacingPhoto && photoReplaceFileRef.current?.click()}
                style={{ flexShrink:0, width:80, height:80, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:5,
                  border:`1.5px dashed ${theme.rule}`, cursor:'pointer', opacity: replacingPhoto ? 0.4 : 1 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={theme.menuHeaderInk} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity:0.7 }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                </svg>
                <span style={{ fontFamily:FONT_DECK, fontWeight:600, fontSize:7.5, letterSpacing:'0.12em', textTransform:'uppercase', color:theme.menuHeaderInk, opacity:0.65, textAlign:'center', lineHeight:1.2 }}>Add New</span>
              </div>
            </div>
            {replacingPhoto && (
              <div style={{ padding:'0 16px 12px', fontFamily:FONT_DECK, fontSize:10, color:theme.menuHeaderInk, opacity:0.65, textAlign:'center' }}>Saving…</div>
            )}
          </div>
        </div>
      )}

      {/* ── Story photo chooser sheet ── */}
      <input ref={storyPhotoFileRef} type="file" accept="image/*" style={{ display:'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) uploadStoryPhoto(f); e.target.value = '' }} />
      {storyPhotoSheet && (
        <div style={{ position:'fixed', inset:0, zIndex:55, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}
          onClick={() => !savingStoryPhoto && setStoryPhotoSheet(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:theme.menuHeaderBg, borderTop:`1px solid ${theme.rule}`, paddingBottom:'env(safe-area-inset-bottom, 0)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px 8px' }}>
              <span style={{ fontFamily:FONT_DECK, fontWeight:700, fontSize:11, letterSpacing:'0.18em', textTransform:'uppercase', color:theme.menuHeaderInk }}>
                Story Photo
              </span>
              <button onClick={() => setStoryPhotoSheet(false)} disabled={savingStoryPhoto}
                style={{ background:'transparent', border:'none', color:theme.menuHeaderInk, fontSize:22, lineHeight:1, cursor:'pointer', padding:'0 4px', opacity:0.7 }}>×</button>
            </div>
            {storyPhotoErr && (
              <div style={{ padding:'0 16px 8px', fontFamily:FONT_DECK, fontSize:10, color:'#e08a6e' }}>{storyPhotoErr}</div>
            )}
            <div style={{ overflowX:'auto', display:'flex', gap:8, padding:'0 16px 14px', WebkitOverflowScrolling:'touch' } as React.CSSProperties}>
              {photoPoolFinal.map(p => {
                const sel = (layout?.story_photo ?? photos[0]?.url) === p.url
                return (
                  <div key={p.url} onClick={() => !savingStoryPhoto && saveStoryPhoto(p.url)}
                    style={{ flexShrink:0, width:80, height:80, position:'relative', cursor:'pointer',
                      outline: sel ? `2px solid ${theme.accent}` : 'none', outlineOffset:2, opacity: savingStoryPhoto ? 0.5 : 1 }}>
                    <img src={p.url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
                    {sel && (
                      <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <span style={{ fontFamily:FONT_DECK, fontSize:7, letterSpacing:'0.14em', color:'#fff', textTransform:'uppercase' }}>Current</span>
                      </div>
                    )}
                  </div>
                )
              })}
              <div onClick={() => !savingStoryPhoto && storyPhotoFileRef.current?.click()}
                style={{ flexShrink:0, width:80, height:80, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:5,
                  border:`1.5px dashed ${theme.rule}`, cursor:'pointer', opacity: savingStoryPhoto ? 0.4 : 1 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={theme.menuHeaderInk} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity:0.7 }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                </svg>
                <span style={{ fontFamily:FONT_DECK, fontWeight:600, fontSize:7.5, letterSpacing:'0.12em', textTransform:'uppercase', color:theme.menuHeaderInk, opacity:0.65, textAlign:'center', lineHeight:1.2 }}>Add New</span>
              </div>
            </div>
            {/* Reset to the cover photo when a custom one is set */}
            {layout?.story_photo && (
              <div style={{ padding:'0 16px 14px' }}>
                <button onClick={() => saveStoryPhoto(null)} disabled={savingStoryPhoto}
                  style={{ fontFamily:FONT_DECK, fontWeight:700, fontSize:9, letterSpacing:'0.14em', textTransform:'uppercase',
                    color:theme.menuHeaderInk, background:'transparent', border:`1px solid ${theme.rule}`, padding:'7px 14px', cursor:'pointer', opacity:0.85 }}>
                  Use cover photo
                </button>
              </div>
            )}
            {savingStoryPhoto && (
              <div style={{ padding:'0 16px 12px', fontFamily:FONT_DECK, fontSize:10, color:theme.menuHeaderInk, opacity:0.65, textAlign:'center' }}>Saving…</div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes featFade { from { opacity:0 } to { opacity:1 } }
      `}</style>
    </div>
  )
}

// ─── PencilIcon ───────────────────────────────────────────────────────────────
// Stroked editorial pencil for the cover chips (Story / Edit). Deliberately an
// SVG glyph, not an emoji, so it sits in the FONT_DECK chip type cleanly.
function PencilIcon({ size = 11, color = '#f5f5f5' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      style={{ display:'inline-block', verticalAlign:'-1px', flexShrink:0 }}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
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

// Folio bar — back/forward labels derived from neighbor pages; last page shows the
// page number instead of a forward link. When dots are provided the center slot
// shows page progress indicators instead of the GDIMENSION.APP watermark.
function Folio({ theme, backLabel, nextLabel, pageNum, onBack, onNext, dots }:
  { theme: InteriorTheme; backLabel: string; nextLabel?: string; pageNum: number; onBack?: () => void; onNext?: () => void; dots?: { count: number; active: number } }) {
  return (
    <div style={{ padding:'8px 14px 8px 28px', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:`1px solid ${theme.rule}`, flexShrink:0, background:theme.pageBg }}>
      <div onClick={onBack} style={{ fontFamily:FONT_DECK, fontWeight:700, fontSize:9, letterSpacing:'0.22em', textTransform:'uppercase', color:theme.accent, cursor:onBack?'pointer':'default', padding:'4px 0' }}>‹ {backLabel}</div>
      {dots && dots.count > 1
        ? <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            {Array.from({ length: dots.count }, (_, i) => (
              <div key={i} style={{ width: i === dots.active ? 12 : 4, height: 4, borderRadius: 2, background: i === dots.active ? theme.accent : theme.rule, transition:`all 200ms ${EASING_SETTLE}` }} />
            ))}
          </div>
        : <span style={{ fontFamily:FONT_DECK, fontWeight:600, fontSize:7.5, letterSpacing:'0.28em', textTransform:'uppercase', color:theme.subInk, opacity:0.55 }}>GDIMENSION.APP</span>}
      {nextLabel
        ? <div onClick={onNext} style={{ fontFamily:FONT_DECK, fontWeight:700, fontSize:9, letterSpacing:'0.22em', textTransform:'uppercase', color:theme.accent, cursor:onNext?'pointer':'default', padding:'4px 0' }}>{nextLabel} ›</div>
        : <span style={{ fontFamily:FONT_MASTHEAD, color:theme.ink, fontSize:17, fontStyle:'italic', opacity:0.6, display:'inline-block', paddingRight:6 }}>{String(pageNum).padStart(2,'0')}</span>}
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

// ─── PhotoSpread (interior) ───────────────────────────────────────────────────
// Layout: first photo (when ≥2 present) is a full-bleed hero at 52% height —
// objectFit:cover, no border, caption overlaid. The rest pack into rows below
// using the aspect-ratio geometry (flex:aspect for width, 1/Σ for row height).
// All images get a subtle unified filter + decoding=async for smooth page turns.
interface PhotoSpreadProps {
  photos: PhotoItem[]; arrangement: number; theme: InteriorTheme
  carShortName: string
  /** Page is current or adjacent — only then do images get a src. All pages are
   *  stacked full-viewport, so loading="lazy" alone never defers; distant pages
   *  stay dormant until the idle preloader / page turn brings them near. */
  near?: boolean
  backLabel: string; nextLabel?: string; pageNum: number; onBack?: () => void; onNext?: () => void
  dots?: { count: number; active: number }
  // ── caption editing (055) ──
  canEdit?: boolean                 // owner + this page current + not mid-turn → show pencil
  editing?: boolean                 // this spread is in caption-edit mode
  captionSuggestion?: boolean       // engine has a fresher caption than a saved override
  saving?: boolean
  captionErr?: string | null
  captionValue?: (key: string) => string
  onCaptionChange?: (key: string, val: string) => void
  onEnterEdit?: () => void
  onCancelEdit?: () => void
  onSaveEdit?: () => void
  onReplacePhoto?: (item: PhotoItem) => void
}

interface PhotoCellProps {
  item: PhotoItem; theme: InteriorTheme
  flexVal?: string | number
  figureNum?: number
  near?: boolean
  /** Horizontal placement within the cell — solo rows alternate for editorial variety. */
  justify?: 'flex-start' | 'flex-end' | 'center'
  onAspect?: (ratio: number) => void
  editing?: boolean
  captionValue?: string
  onCaptionChange?: (val: string) => void
  onReplaceRequest?: () => void
}
const PHOTO_FILTER = 'contrast(1.04) saturate(0.97)'

// Inline caption field shared by the hero + cell captions in edit mode.
function CaptionField({ theme, value, placeholder, onChange, align = 'left', onPhoto = false }:
  { theme: InteriorTheme; value: string; placeholder: string; onChange: (v: string) => void; align?: 'left' | 'right'; onPhoto?: boolean }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width:'100%', boxSizing:'border-box', fontFamily:FONT_DECK,
        fontSize:8.5, lineHeight:1.3, letterSpacing:'0.04em', textAlign:align,
        color: onPhoto ? '#f0ede8' : theme.subInk,
        background: onPhoto ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.04)',
        border:`1px dashed ${theme.accent}`, outline:'none', padding:'2px 4px', caretColor:theme.accent }} />
  )
}

function PhotoCell({ item, theme, flexVal, figureNum, near = true, justify = 'center', onAspect, editing = false, captionValue = '', onCaptionChange, onReplaceRequest }: PhotoCellProps) {
  // Image letterboxes at natural fitted size (absolute + margin auto — proven
  // layout); the horizontal margin and the caption row share the same edge so
  // the label always hugs its photo instead of the page margin.
  const imgMargin = justify === 'flex-start' ? 'auto auto auto 0'
                  : justify === 'flex-end'   ? 'auto 0 auto auto'
                  : 'auto'
  // Anchor the Replace chip to the photo's own top-right corner (not the cell's),
  // since a letterboxed image rarely fills the cell. Compute the rendered image
  // box from the container size + natural aspect, recompute on resize/turn.
  const areaRef = useRef<HTMLDivElement>(null)
  const naturalRef = useRef<number | null>(null)
  const [chipPos, setChipPos] = useState<{ top: number; right: number } | null>(null)
  const recompute = () => {
    const el = areaRef.current, A = naturalRef.current
    if (!el || !A) return
    const W = el.clientWidth, H = el.clientHeight
    let w = W, h = W / A
    if (h > H) { h = H; w = H * A }
    const left = justify === 'flex-start' ? 0 : justify === 'flex-end' ? W - w : (W - w) / 2
    const top  = (H - h) / 2
    setChipPos({ top: top + 4, right: (W - (left + w)) + 4 })
  }
  useEffect(() => {
    const el = areaRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(recompute)
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justify])
  return (
    <div style={{ flex: flexVal ?? 1, display:'flex', flexDirection:'column', minWidth:0, minHeight:0 }}>
      <div ref={areaRef} style={{ flex:1, minHeight:0, position:'relative' }}>
        <img
          src={near ? item.url : undefined} alt=""
          decoding="async"
          onLoad={(e) => { const img = e.currentTarget; naturalRef.current = img.naturalWidth / img.naturalHeight; recompute(); onAspect?.(img.naturalWidth / img.naturalHeight) }}
          style={{ position:'absolute', inset:0, margin:imgMargin, maxWidth:'100%', maxHeight:'100%',
            width:'auto', height:'auto', boxSizing:'border-box', display:'block',
            border:`1px solid ${theme.rule}`, boxShadow:'0 1px 5px rgba(0,0,0,0.10)',
            filter: PHOTO_FILTER }}
        />
        {onReplaceRequest && (
          <button onClick={e => { e.stopPropagation(); onReplaceRequest() }}
            style={{ position:'absolute', top: chipPos?.top ?? 5, right: chipPos?.right ?? 5, zIndex:4, background:'rgba(0,0,0,0.52)',
              border:'1px solid rgba(245,245,245,0.3)', padding:'4px 7px', cursor:'pointer',
              display:'flex', alignItems:'center', gap:4,
              fontFamily:FONT_DECK, fontWeight:600, fontSize:7, letterSpacing:'0.14em', textTransform:'uppercase', color:'#f0ede8' }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            Replace
          </button>
        )}
      </div>
      <div style={{ flexShrink:0 }}>
        {editing ? (
          <div style={{ marginTop:4 }}>
            <CaptionField theme={theme} value={captionValue} placeholder={item.placeholder || 'Add a caption…'}
              onChange={onCaptionChange ?? (() => {})} align={justify === 'flex-end' ? 'right' : 'left'} />
          </div>
        ) : item.caption && (
          <div style={{ display:'flex', justifyContent:justify, alignItems:'flex-start', gap:3, marginTop:4 }}>
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
    </div>
  )
}

function PhotoSpread({ photos, arrangement, theme, carShortName, near = true, backLabel, nextLabel, pageNum, onBack, onNext, dots,
  canEdit = false, editing = false, captionSuggestion = false, saving = false, captionErr = null, captionValue, onCaptionChange, onEnterEdit, onCancelEdit, onSaveEdit, onReplacePhoto }: PhotoSpreadProps) {
  const [aspects, setAspects] = useState<Record<string, number>>({})
  const [heroAspect, setHeroAspect] = useState<number | null>(null)
  // Ultra-wide hero → "double truck": full-bleed edge to edge with a center
  // fold crease, like a car running across the gutter of facing pages.
  const doubleTruck = (heroAspect ?? 0) >= 1.9
  const onAspect = (url: string) => (r: number) =>
    setAspects(prev => (prev[url] === r ? prev : { ...prev, [url]: r }))
  const aspectOf = (p: PhotoItem) => aspects[p.url] ?? 1.5

  // Hero = first photo when there are ≥2; single-photo spread skips hero treatment.
  const hasHero = photos.length >= 2
  const heroPhoto = hasHero ? photos[0] : null
  const supportPhotos = hasHero ? photos.slice(1) : photos

  // Assign sequential figure numbers to photos that have captions.
  const allOrdered = heroPhoto ? [heroPhoto, ...supportPhotos] : supportPhotos
  let figCounter = 1
  const figureNums: Record<string, number> = {}
  for (const p of allOrdered) {
    if (p.caption) figureNums[p.url] = figCounter++
  }
  const capValue = (p: PhotoItem) => captionValue?.(p.key) ?? ''
  const capChange = (p: PhotoItem) => (v: string) => onCaptionChange?.(p.key, v)

  // ── partition support photos into rows ────────────────────────────────────────
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

      {/* Hairline kicker — single rule + section label */}
      <div style={{ flexShrink:0, padding:'8px 14px 5px 30px' }}>
        <div style={{ height:'0.5px', background:theme.rule, marginBottom:5 }} />
        <div style={{ fontFamily:FONT_DECK, fontWeight:600, fontSize:7, letterSpacing:'0.28em', color:theme.subInk, textTransform:'uppercase', opacity:0.65 }}>
          THE DETAILS · {carShortName.toUpperCase()}
        </div>
      </div>

      {/* Hero photo — aligned to the content column: 30px spine gutter left,
          14px margin right (matches the support photo area, so it never reads
          as bleeding off the page edge). Ultra-wide photos instead go full
          bleed with a center fold crease (double-truck spread). */}
      {heroPhoto && (
        <div style={{ flex:'0 0 52%', position:'relative', overflow:'hidden' }}>
          <img
            src={near ? heroPhoto.url : undefined} alt=""
            decoding="async"
            onLoad={(e) => { const img = e.currentTarget; setHeroAspect(img.naturalWidth / img.naturalHeight) }}
            style={doubleTruck
              ? { position:'absolute', inset:0, width:'100%', height:'100%',
                  objectFit:'cover', display:'block', filter: PHOTO_FILTER }
              : { position:'absolute', top:0, bottom:0, left:30, width:'calc(100% - 44px)', height:'100%',
                  objectFit:'cover', display:'block', filter: PHOTO_FILTER }}
          />
          {doubleTruck && (
            <>
              {/* center fold crease — shadow into the gutter, highlight off it */}
              <div style={{ position:'absolute', top:0, bottom:0, left:'50%', width:44, transform:'translateX(-50%)', pointerEvents:'none',
                background:'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.16) 38%, rgba(0,0,0,0.34) 50%, rgba(255,255,255,0.10) 56%, transparent 100%)' }} />
              <span style={{ position:'absolute', top:7, right:8, fontFamily:FONT_DECK, fontWeight:700, fontSize:6.5, letterSpacing:'0.26em', textTransform:'uppercase',
                color:'rgba(245,245,245,0.85)', background:'rgba(0,0,0,0.4)', padding:'3px 6px', pointerEvents:'none' }}>
                Full Spread
              </span>
            </>
          )}
          {onReplacePhoto && (
            <button onClick={() => onReplacePhoto(heroPhoto)}
              style={{ position:'absolute', top:8, right: doubleTruck ? 8 : 20, zIndex:4, background:'rgba(0,0,0,0.52)',
                border:'1px solid rgba(245,245,245,0.3)', padding:'4px 7px', cursor:'pointer',
                display:'flex', alignItems:'center', gap:4,
                fontFamily:FONT_DECK, fontWeight:600, fontSize:7, letterSpacing:'0.14em', textTransform:'uppercase', color:'#f0ede8' }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              Replace
            </button>
          )}
          {editing ? (
            <div style={{ position:'absolute', bottom:0, left:doubleTruck ? 0 : 30, right:doubleTruck ? 0 : 14,
              background:'linear-gradient(0deg,rgba(0,0,0,0.72) 0%,rgba(0,0,0,0.28) 60%,transparent 100%)',
              padding:'24px 10px 8px' }}>
              <CaptionField theme={theme} value={capValue(heroPhoto)} placeholder={heroPhoto.placeholder || 'Add a caption…'}
                onChange={capChange(heroPhoto)} onPhoto />
            </div>
          ) : heroPhoto.caption && (
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

      {/* Support photos */}
      {supportPhotos.length > 0 && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:8, padding:'8px 14px 8px 30px', minHeight:0 }}>
          {rows.map((row, ri) => (
            <div key={ri} style={{ flex: rowWeight(row), display:'flex', flexDirection:'row', gap:8, minHeight:0 }}>
              {row.map(p => (
                <PhotoCell key={p.url} item={p} theme={theme}
                  flexVal={aspectOf(p)}
                  figureNum={figureNums[p.url]}
                  near={near}
                  justify={row.length === 1 ? ((ri + arrangement) % 2 === 0 ? 'flex-start' : 'flex-end') : 'center'}
                  onAspect={onAspect(p.url)}
                  editing={editing}
                  captionValue={capValue(p)}
                  onCaptionChange={capChange(p)}
                  onReplaceRequest={onReplacePhoto ? () => onReplacePhoto(p) : undefined} />
              ))}
            </div>
          ))}
        </div>
      )}

      <Folio theme={theme} backLabel={backLabel} nextLabel={nextLabel} pageNum={pageNum} onBack={onBack} onNext={onNext} dots={dots} />
      <div style={NOISE_OVERLAY} />

      {/* ── caption edit affordance (055) ── */}
      {/* Pencil chip (owner, page at rest) — enters caption-edit mode for this spread */}
      {canEdit && !editing && (
        <div onClick={onEnterEdit}
          style={{ position:'absolute', top:6, right:10, zIndex:6, display:'flex', alignItems:'center', gap:5,
            fontFamily:FONT_DECK, fontWeight:600, fontSize:8.5, letterSpacing:'0.16em', textTransform:'uppercase',
            color:theme.ink, background:theme.pageBg, border:`1px solid ${theme.rule}`, padding:'4px 8px', cursor:'pointer' }}>
          Captions <PencilIcon size={10} color={theme.ink} />
          {captionSuggestion && (
            <span style={{ position:'absolute', top:-3, right:-3, width:7, height:7, borderRadius:'50%', background:theme.accent, boxShadow:`0 0 0 1.5px ${theme.pageBg}` }} />
          )}
        </div>
      )}

      {/* Edit toolbar — replaces the chip while editing this spread */}
      {editing && (
        <div style={{ position:'absolute', top:0, left:0, right:0, zIndex:7, display:'flex', alignItems:'center', justifyContent:'space-between', gap:8,
          background:theme.menuHeaderBg, padding:'7px 10px' }}>
          <span style={{ fontFamily:FONT_DECK, fontWeight:600, fontSize:8.5, letterSpacing:'0.16em', textTransform:'uppercase', color:theme.menuHeaderInk, opacity:0.85 }}>
            {captionErr ? captionErr : 'Editing captions'}
          </span>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onCancelEdit}
              style={{ fontFamily:FONT_DECK, fontWeight:700, fontSize:9, letterSpacing:'0.14em', textTransform:'uppercase', color:theme.menuHeaderInk, background:'transparent', border:`1px solid ${theme.menuHeaderInk}`, padding:'5px 12px', cursor:'pointer', opacity:0.85 }}>
              Cancel
            </button>
            <button onClick={onSaveEdit} disabled={saving}
              style={{ fontFamily:FONT_DECK, fontWeight:700, fontSize:9, letterSpacing:'0.14em', textTransform:'uppercase', color:'#fff', background:theme.accent, border:'none', padding:'5px 14px', cursor:'pointer', opacity:saving?0.6:1 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── StoryPage (interior) — the user-written feature article ─────────────────────
// Magazine voice, written by the owner via the cover "Story ✎" chip. Drop cap,
// Cormorant body, byline. Fixed height with a bottom fade if the text overruns.
// When the story is short (< 380 chars) and a photo is provided, the photo fills
// the space below the writing. The headline is editable directly on this page.
// The story-page photo — fixed-vh block that flows inline in the writing. Carries
// its own pan/zoom adjust mode, a top reorder grip (slide up/down through the text),
// and a bottom resize grip. Rendered at the chosen paragraph slot by StoryPage.
interface StoryPhotoBlockProps {
  storyPhoto?: string | null
  spAdjusting?: boolean
  spFx?: number; spFy?: number; spZoom?: number; spHeight?: number
  theme: InteriorTheme; canEdit?: boolean; editing?: boolean
  onAdjTouchStart?: (e: React.TouchEvent) => void
  onAdjTouchMove?: (e: React.TouchEvent) => void
  onAdjTouchEnd?: (e: React.TouchEvent) => void
  onChangePhoto?: () => void
  onAdjust?: () => void
  onHeightDragStart?: (e: React.TouchEvent) => void
  onPosDragStart?: (e: React.TouchEvent) => void
  onSaveFrame?: () => void; onCancelFrame?: () => void
  savingFrame?: boolean; frameErr?: string | null
}
function StoryPhotoBlock({ storyPhoto, spAdjusting, spFx = 50, spFy = 50, spZoom = 1, spHeight = 32,
  theme, canEdit, editing, onAdjTouchStart, onAdjTouchMove, onAdjTouchEnd,
  onChangePhoto, onAdjust, onHeightDragStart, onPosDragStart,
  onSaveFrame, onCancelFrame, savingFrame, frameErr }: StoryPhotoBlockProps) {
  const showGrips = canEdit && !editing && !spAdjusting
  return (
    <div
      onTouchStart={spAdjusting ? onAdjTouchStart : undefined}
      onTouchMove={spAdjusting ? onAdjTouchMove : undefined}
      onTouchEnd={spAdjusting ? onAdjTouchEnd : undefined}
      style={{ height:`${spHeight}vh`, margin:'4px 14px 10px 0', position:'relative', overflow:'hidden',
        touchAction: spAdjusting ? 'none' : 'auto' }}>
      <img src={storyPhoto!} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block',
        filter: PHOTO_FILTER, border:`1px solid ${theme.rule}`,
        objectPosition:`${spFx}% ${spFy}%`, transform:`scale(${spZoom})`, transformOrigin:`${spFx}% ${spFy}%` }} />
      {!spAdjusting && <div style={{ position:'absolute', inset:0,
        background:`linear-gradient(0deg, rgba(0,0,0,0.18) 0%, transparent 40%)` }} />}

      {/* Adjust-mode overlay */}
      {spAdjusting && (
        <>
          <div style={{ position:'absolute', inset:0, border:`1.5px dashed ${theme.accent}`, pointerEvents:'none', boxSizing:'border-box' }} />
          <div style={{ position:'absolute', top:7, left:0, right:0, textAlign:'center', pointerEvents:'none',
            fontFamily:FONT_DECK, fontWeight:600, fontSize:9, letterSpacing:'0.18em', textTransform:'uppercase',
            color:'#f5f5f5', textShadow:'0 1px 6px rgba(0,0,0,0.8)' }}>
            Drag · pinch to zoom
          </div>
          <div style={{ position:'absolute', bottom:3, left:0, right:0, textAlign:'center', pointerEvents:'none',
            fontFamily:FONT_DECK, fontWeight:600, fontSize:8, letterSpacing:'0.12em', color:'rgba(245,245,245,0.7)' }}>
            {Math.round(spZoom * 100)}%
          </div>
        </>
      )}

      {/* Change + Adjust chips (at rest) — above the reorder grip so taps land */}
      {showGrips && (
        <div style={{ position:'absolute', top:8, right:8, zIndex:7, display:'flex', gap:5 }}>
          {onChangePhoto && (
            <button onClick={onChangePhoto}
              style={{ background:'rgba(0,0,0,0.52)', border:'1px solid rgba(245,245,245,0.3)', padding:'4px 8px', cursor:'pointer',
                display:'flex', alignItems:'center', gap:4,
                fontFamily:FONT_DECK, fontWeight:600, fontSize:7.5, letterSpacing:'0.14em', textTransform:'uppercase', color:'#f0ede8' }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              Change
            </button>
          )}
          {onAdjust && (
            <button onClick={onAdjust}
              style={{ background:'rgba(0,0,0,0.52)', border:'1px solid rgba(245,245,245,0.3)', padding:'4px 8px', cursor:'pointer',
                fontFamily:FONT_DECK, fontWeight:600, fontSize:7.5, letterSpacing:'0.14em', textTransform:'uppercase', color:'#f0ede8' }}>
              ⤢ Adjust
            </button>
          )}
        </div>
      )}

      {/* Bottom-right corner — two stacked grips: height resize (left) + position (right) */}
      {showGrips && (onHeightDragStart || onPosDragStart) && (
        <div style={{ position:'absolute', bottom:0, right:0, zIndex:5, display:'flex', alignItems:'flex-end',
          background:'linear-gradient(135deg, transparent 40%, rgba(0,0,0,0.38) 100%)' }}>
          {onHeightDragStart && (
            <div onTouchStart={onHeightDragStart}
              style={{ width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center',
                cursor:'ns-resize', touchAction:'none', userSelect:'none', WebkitUserSelect:'none' }}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <line x1="7" y1="1" x2="7" y2="13" stroke="rgba(245,245,245,0.85)" strokeWidth="1.8" strokeLinecap="round"/>
                <polyline points="3,4 7,1 11,4" stroke="rgba(245,245,245,0.85)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                <polyline points="3,10 7,13 11,10" stroke="rgba(245,245,245,0.85)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </div>
          )}
          {onPosDragStart && (
            <div onTouchStart={onPosDragStart}
              style={{ width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center',
                cursor:'grab', touchAction:'none', userSelect:'none', WebkitUserSelect:'none' }}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <circle cx="4" cy="4" r="1.3" fill="rgba(245,245,245,0.85)"/>
                <circle cx="10" cy="4" r="1.3" fill="rgba(245,245,245,0.85)"/>
                <circle cx="4" cy="10" r="1.3" fill="rgba(245,245,245,0.85)"/>
                <circle cx="10" cy="10" r="1.3" fill="rgba(245,245,245,0.85)"/>
              </svg>
            </div>
          )}
        </div>
      )}

      {/* Adjust save/cancel */}
      {spAdjusting && (
        <div style={{ position:'absolute', bottom:28, left:0, right:0, display:'flex', justifyContent:'center', gap:10, zIndex:6 }}>
          {frameErr && <div style={{ position:'absolute', bottom:'100%', left:0, right:0, textAlign:'center', marginBottom:6,
            fontFamily:FONT_DECK, fontSize:9, color:'#e08a6e', textShadow:'0 1px 4px rgba(0,0,0,0.8)' }}>{frameErr}</div>}
          <button onClick={onCancelFrame}
            style={{ fontFamily:FONT_DECK, fontWeight:700, fontSize:10, letterSpacing:'0.14em', textTransform:'uppercase',
              color:'#f5f5f5', background:'rgba(0,0,0,0.6)', border:'1px solid rgba(245,245,245,0.4)', padding:'9px 18px', cursor:'pointer' }}>
            Cancel
          </button>
          <button onClick={onSaveFrame} disabled={!!savingFrame}
            style={{ fontFamily:FONT_DECK, fontWeight:700, fontSize:10, letterSpacing:'0.14em', textTransform:'uppercase',
              color:'#fff', background:theme.accent, border:'none', padding:'9px 20px', cursor:'pointer', opacity:savingFrame?0.6:1 }}>
            {savingFrame ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}

interface StoryPageProps {
  story: string; headline: string; carShortName: string; theme: InteriorTheme
  backLabel: string; nextLabel?: string; pageNum: number; onBack?: () => void; onNext?: () => void
  dots?: { count: number; active: number }
  // ── inline headline editing (reuses cover edit state) ──
  canEdit?: boolean
  editing?: boolean
  editHeadline?: string; onHeadlineChange?: (v: string) => void
  saving?: boolean; err?: string | null
  hasSuggestion?: boolean
  onEnterEdit?: () => void; onCancelEdit?: () => void; onSaveEdit?: () => void
  // ── optional photo shown below writing ──
  storyPhoto?: string | null
  onChangePhoto?: () => void
  // ── photo framing (pan/zoom + height) ──
  spAdjusting?: boolean
  spFx?: number; spFy?: number; spZoom?: number
  spHeight?: number                  // vh
  onAdjust?: () => void
  onAdjTouchStart?: (e: React.TouchEvent) => void
  onAdjTouchMove?: (e: React.TouchEvent) => void
  onAdjTouchEnd?: (e: React.TouchEvent) => void
  onHeightDragStart?: (e: React.TouchEvent) => void
  spPos?: number | null              // 0 (just below text) … 1 (page bottom); null = bottom
  onPosDragStart?: (e: React.TouchEvent) => void
  onSaveFrame?: () => void
  onCancelFrame?: () => void
  savingFrame?: boolean
  frameErr?: string | null
}
function StoryPage({ story, headline, carShortName, theme, backLabel, nextLabel, pageNum, onBack, onNext, dots,
  canEdit, editing, editHeadline = '', onHeadlineChange, saving, err, hasSuggestion,
  onEnterEdit, onCancelEdit, onSaveEdit, storyPhoto, onChangePhoto,
  spAdjusting, spFx = 50, spFy = 50, spZoom = 1, spHeight = 32,
  onAdjust, onAdjTouchStart, onAdjTouchMove, onAdjTouchEnd, onHeightDragStart,
  spPos, onPosDragStart,
  onSaveFrame, onCancelFrame, savingFrame, frameErr }: StoryPageProps) {
  const paras = story.split(/\n+/).map(s => s.trim()).filter(Boolean)
  const showPhoto = !!storyPhoto
  // Vertical position of the photo in the free space below the writing:
  // 0 = right under the byline, 1 = pinned to the page bottom (the default).
  const pos = spPos == null ? 1 : Math.min(1, Math.max(0, spPos))

  return (
    <div style={{ position:'absolute', inset:0, background:theme.pageBg, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={SPINE_GUTTER} />

      {/* Hairline kicker + optional edit chip */}
      <div style={{ flexShrink:0, padding:'8px 14px 5px 30px', position:'relative' }}>
        <div style={{ height:'0.5px', background:theme.rule, marginBottom:5 }} />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontFamily:FONT_DECK, fontWeight:600, fontSize:7, letterSpacing:'0.28em', color:theme.subInk, textTransform:'uppercase', opacity:0.65 }}>
            THE FEATURE · {carShortName.toUpperCase()}
          </div>
          {canEdit && !editing && (
            <div onClick={onEnterEdit}
              style={{ fontFamily:FONT_DECK, fontWeight:600, fontSize:8, letterSpacing:'0.14em', textTransform:'uppercase',
                color:theme.subInk, border:`1px solid ${theme.rule}`, padding:'3px 8px', cursor:'pointer',
                display:'flex', alignItems:'center', gap:4, position:'relative' }}>
              Headline <PencilIcon size={9} color={theme.subInk} />
              {hasSuggestion && (
                <span style={{ position:'absolute', top:-3, right:-3, width:6, height:6, borderRadius:'50%', background:COLOR_ACCENT, boxShadow:'0 0 0 1px rgba(0,0,0,0.4)' }} />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Headline — static display or inline edit */}
      <div style={{ flexShrink:0, padding:'6px 16px 0 30px' }}>
        {editing ? (
          <input value={editHeadline} onChange={e => onHeadlineChange?.(e.target.value)}
            placeholder={headline}
            style={{ width:'100%', boxSizing:'border-box', fontFamily:FONT_MASTHEAD, fontStyle:'italic', textTransform:'uppercase',
              fontSize: headline.length > 22 ? 26 : 34, lineHeight:0.95, letterSpacing:'-0.01em',
              color:theme.ink, background:'transparent', border:'none', borderBottom:`1.5px dashed ${theme.accent}`,
              outline:'none', padding:0, caretColor:theme.accent }} />
        ) : (
          <div style={{ fontFamily:FONT_MASTHEAD, color:theme.ink, fontStyle:'italic', textTransform:'uppercase',
            fontSize: headline.length > 22 ? 26 : 34, lineHeight:0.95, letterSpacing:'-0.01em' }}>
            {headline}
          </div>
        )}
        <div style={{ height:2, background:theme.accent, width:44, margin:'10px 0 0' }} />
      </div>

      {/* Edit toolbar */}
      {editing && (
        <div style={{ flexShrink:0, padding:'8px 16px 0 30px', display:'flex', alignItems:'center', gap:8 }}>
          {err && <span style={{ fontFamily:FONT_DECK, fontSize:9, color:'#e08a6e', flex:1 }}>{err}</span>}
          {!err && <span style={{ flex:1 }} />}
          <button onClick={onCancelEdit}
            style={{ fontFamily:FONT_DECK, fontWeight:700, fontSize:9, letterSpacing:'0.14em', textTransform:'uppercase',
              color:theme.subInk, background:'transparent', border:`1px solid ${theme.rule}`, padding:'5px 12px', cursor:'pointer' }}>
            Cancel
          </button>
          <button onClick={onSaveEdit} disabled={!!saving}
            style={{ fontFamily:FONT_DECK, fontWeight:700, fontSize:9, letterSpacing:'0.14em', textTransform:'uppercase',
              color:'#fff', background:theme.accent, border:'none', padding:'5px 14px', cursor:'pointer', opacity:saving?0.6:1 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}

      {/* Content column — the writing sits at the top; the photo lives in the free
          space below it and slides smoothly between just-under-the-byline (pos 0)
          and the page bottom (pos 1, the default). Column clips long stories. */}
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
            <StoryPhotoBlock {...{ storyPhoto, spAdjusting, spFx, spFy, spZoom, spHeight, theme, canEdit, editing,
              onAdjTouchStart, onAdjTouchMove, onAdjTouchEnd, onChangePhoto, onAdjust, onHeightDragStart, onPosDragStart,
              onSaveFrame, onCancelFrame, savingFrame, frameErr }} />
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

// ─── SpecSheet (interior, the one titled page — D'Sport vehicle spec sheet) ──────
interface SpecSheetProps {
  sections: SpecSection[]; isCont: boolean; theme: InteriorTheme
  totalMods: number; carShortName: string
  backLabel: string; nextLabel?: string; pageNum: number; onBack?: () => void; onNext?: () => void
  dots?: { count: number; active: number }
  // ── publish (last page only) ──
  isLast?: boolean
  isPublished?: boolean; onTogglePublish?: () => void; savingPublish?: boolean
  publishErr?: string | null; shareUrl?: string | null
}
function SpecSheet({ sections, isCont, theme, totalMods, carShortName, backLabel, nextLabel, pageNum, onBack, onNext, dots,
  isLast, isPublished, onTogglePublish, savingPublish, publishErr, shareUrl }: SpecSheetProps) {
  return (
    <div style={{ position:'absolute', inset:0, background:theme.pageBg, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={SPINE_GUTTER} />

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

      {/* Publish strip — last spec sheet only */}
      {isLast && onTogglePublish && (
        <div style={{ flexShrink:0, borderTop:`1px solid ${theme.rule}`, padding:'10px 16px 10px 28px',
          display:'flex', alignItems:'center', gap:10, background:theme.pageBg }}>
          <div style={{ flex:1, minWidth:0 }}>
            {isPublished && shareUrl ? (
              <div style={{ fontFamily:FONT_DECK, fontSize:9, color:theme.subInk, letterSpacing:'0.06em',
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {shareUrl}
              </div>
            ) : (
              <div style={{ fontFamily:FONT_DECK, fontSize:9, color:theme.subInk, letterSpacing:'0.06em', opacity:0.65 }}>
                {isPublished ? 'Visible on your public profile' : 'Not visible to the public yet'}
              </div>
            )}
            {publishErr && <div style={{ fontFamily:FONT_DECK, fontSize:9, color:'#e08a6e', marginTop:2 }}>{publishErr}</div>}
          </div>
          {isPublished && shareUrl && (
            <button onClick={() => { navigator.clipboard?.writeText(shareUrl).catch(() => {}) }}
              style={{ fontFamily:FONT_DECK, fontWeight:600, fontSize:9, letterSpacing:'0.14em', textTransform:'uppercase',
                color:theme.subInk, background:'transparent', border:`1px solid ${theme.rule}`, padding:'5px 10px', cursor:'pointer', flexShrink:0 }}>
              Copy
            </button>
          )}
          <button onClick={onTogglePublish} disabled={!!savingPublish}
            style={{ fontFamily:FONT_DECK, fontWeight:700, fontSize:9, letterSpacing:'0.18em', textTransform:'uppercase',
              color: isPublished ? theme.pageBg : '#fff',
              background: isPublished ? theme.subInk : theme.accent,
              border:'none', padding:'7px 14px', cursor:'pointer', opacity:savingPublish?0.6:1, flexShrink:0 }}>
            {savingPublish ? '…' : isPublished ? 'Unpublish' : 'Publish'}
          </button>
        </div>
      )}

      <Folio theme={theme} backLabel={backLabel} nextLabel={nextLabel} pageNum={pageNum} onBack={onBack} onNext={onNext} dots={dots} />
      <div style={NOISE_OVERLAY} />
    </div>
  )
}
