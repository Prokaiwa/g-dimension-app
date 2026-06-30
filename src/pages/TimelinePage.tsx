// Route: /timeline — the build story (Part 12). The emotional heart.
//
// The one light/parchment destination. NO header — a single floating amber-gold
// chevron only. Reads from `timeline_entries` exclusively (migration 007),
// oldest-at-top (Origin Entry first, scroll down = forward in time), with year
// chapter dividers. A vertical thread connects the entries down the page.
//
// Origin Entry: a synthetic cover card derived from `cars` (purchase_story /
// purchase_date) is shown until a photo is added. Adding/replacing the cover
// photo persists the real is_origin row (one per car) and uploads to the
// timeline-photos bucket. The full Origin editor (story/date) comes later.
//
// Standard entries carry no title column, so we enrich each card with a title
// derived from its session (grouped name) / its jobs (single title / count) and
// a thumbnail (sessions.timeline_photo_url, falling back to the mod's first
// job_photo) — Part A: a compact "photo print" beside the text, not a banner.

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import imageCompression from 'browser-image-compression'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import ArrivalFade from '../components/ArrivalFade'
import TimelineOverture from '../components/TimelineOverture'
import { CameraIcon } from '../components/CameraIcon'
import { playThreadTick } from '../lib/sound'
import { milesToUnit, asMileageUnit } from '../lib/mileage'
import {
  COLOR_TIMELINE_BG, COLOR_TIMELINE_CARD, COLOR_TIMELINE_TEXT,
  COLOR_TIMELINE_MUTED, COLOR_TIMELINE_YEAR, COLOR_TIMELINE_RULE,
  COLOR_TIMELINE_CHEVRON, COLOR_TIMELINE_MOD, COLOR_TIMELINE_SERVICE,
  COLOR_TIMELINE_DETAIL, COLOR_TIMELINE_NOTE, RADIUS_TIMELINE_CARD, RADIUS_BUTTON,
  FONT_UI, FONT_TITLE, EASING_SETTLE, CANVAS_W, COLOR_ERROR,
  COLOR_ACCENT, COLOR_ACCENT_TEXT,
} from '../tokens'

// ── Layout constants ──
const SPINE_LEFT = 9   // center of the connecting thread, from content left edge
const CARD_LEFT  = 34  // where standard cards begin (clears the thread + node)
const NODE_SIZE  = 11
const THUMB      = 90  // standard-card "photo print" thumbnail size

// One-shot flag set by the Home map when diving into the Timeline, so the
// cinematic Overture plays only on that arrival — never when returning from an
// entry detail or the compose screen.
const OVERTURE_KEY = 'gdim_tl_overture'

// Remembers scroll position so returning from an entry lands where you left off.
const SCROLL_KEY = 'gdim_tl_scroll'

const COMPRESSION_OPTIONS = {
  maxSizeMB: 1, maxWidthOrHeight: 1920,
  useWebWorker: true, exifOrientation: -1 as const, fileType: 'image/jpeg' as const,
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

type StdType = 'modification' | 'maintenance' | 'detail' | 'note'

const TYPE_META: Record<StdType, { label: string; color: string }> = {
  modification: { label: 'Modification', color: COLOR_TIMELINE_MOD },
  maintenance:  { label: 'Service',      color: COLOR_TIMELINE_SERVICE },
  detail:       { label: 'Detail',       color: COLOR_TIMELINE_DETAIL },
  note:         { label: 'Entry',        color: COLOR_TIMELINE_NOTE },
}

type TLEntry = {
  id: string
  entry_type: 'origin' | StdType
  is_origin: boolean
  title: string | null
  photo_url: string | null
  journal_entry: string | null
  display_date: string // YYYY-MM-DD
  session_id: string | null
}

type SessionMeta = { title: string | null; shop: string | null; jobNames: string[]; mileage: number | null; photo: string | null }

type OriginCard = {
  id: string | null            // is_origin row id, or null when still synthetic
  photo_url: string | null
  story: string | null
  display_date: string | null
}

function fmtDate(d: string | null): string {
  if (!d) return ''
  const [y, m, day] = d.split('-').map(Number)
  if (!y || !m || !day) return ''
  return `${MONTHS[m - 1]} ${day}, ${y}`
}

function yearOf(d: string): string {
  return d.slice(0, 4)
}

// The card's text model — surfaces what's actually inside the entry instead of
// a dead "N jobs". `components` is the job list (shown under a group/custom
// title); when there's no title the list becomes the title itself.
function cardText(
  e: TLEntry, meta: SessionMeta | undefined, mileageUnit: string,
): { title: string; components: string | null; metaLine: string | null } {
  const customTitle = e.title?.trim() || meta?.title?.trim() || null
  const names = meta?.jobNames ?? []
  const shop = meta?.shop?.trim() || null
  const mileage = meta?.mileage ?? null
  const type = e.entry_type as StdType

  let title: string
  let components: string | null = null
  if (customTitle) {
    title = customTitle
    components = names.length ? names.join(' · ') : null
  } else if (names.length === 1) {
    title = names[0]
  } else if (names.length > 1) {
    title = names.join(' · ')
  } else {
    title = shop || TYPE_META[type].label
  }

  const metaBits: string[] = []
  if (shop) metaBits.push(shop)
  if (mileage != null) {
    const u = asMileageUnit(mileageUnit)
    metaBits.push(`${milesToUnit(mileage, u).toLocaleString()} ${u}`)
  }
  return { title, components, metaLine: metaBits.length ? metaBits.join(' · ') : null }
}

// ── Scroll-reveal primitives (Part 7: IntersectionObserver fade-in) ──
function useRevealed(): [React.RefObject<HTMLDivElement>, boolean] {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setShown(true); io.disconnect() }
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return [ref, shown]
}

function Reveal({ children }: { children: React.ReactNode }) {
  const [ref, shown] = useRevealed()
  return (
    <div
      ref={ref}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : 'translateY(12px)',
        transition: `opacity 400ms ${EASING_SETTLE}, transform 400ms ${EASING_SETTLE}`,
      }}
    >
      {children}
    </div>
  )
}

// Photo-print thumbnail that fades in once its (full-size) image decodes —
// a slow thumbnail no longer pops in inside an already-revealed card.
function ThumbImg({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <img
      src={src} alt="" aria-hidden decoding="async"
      onLoad={() => setLoaded(true)}
      onError={ev => {
        const el = ev.currentTarget.parentElement as HTMLElement | null
        if (el) el.style.display = 'none'
      }}
      style={{
        display: 'block', width: '100%', height: '100%', objectFit: 'cover',
        opacity: loaded ? 1 : 0, transition: 'opacity 260ms ease',
      }}
    />
  )
}

// Entry block whose spine segment draws downward as it scrolls into view,
// the node dot popping in once the thread reaches it.
function EntryBlock({ accent, isLast, children }: { accent: string; isLast: boolean; children: React.ReactNode }) {
  const [ref, shown] = useRevealed()
  return (
    <div ref={ref} data-tl-node style={{ position: 'relative', paddingLeft: CARD_LEFT, paddingBottom: 18 }}>
      <div style={{
        position: 'absolute', left: SPINE_LEFT, top: 0, bottom: isLast ? 'auto' : 0, height: isLast ? 22 : undefined,
        width: 2, background: COLOR_TIMELINE_RULE,
        transform: `translateX(-50%) scaleY(${shown ? 1 : 0})`, transformOrigin: 'top',
        transition: 'transform 600ms cubic-bezier(0.25, 1, 0.5, 1)',
      }} />
      <div style={{
        position: 'absolute', left: SPINE_LEFT, top: 16, width: NODE_SIZE, height: NODE_SIZE,
        borderRadius: '50%', background: accent, border: `2px solid ${COLOR_TIMELINE_BG}`,
        transform: `translateX(-50%) scale(${shown ? 1 : 0})`,
        transition: 'transform 380ms cubic-bezier(0.34, 1.56, 0.64, 1) 250ms',
      }} />
      {children}
    </div>
  )
}

export default function TimelinePage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [hasCar, setHasCar] = useState(true)
  const [carId, setCarId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [origin, setOrigin] = useState<OriginCard | null>(null)
  const [entries, setEntries] = useState<TLEntry[]>([])
  const [meta, setMeta] = useState<Record<string, SessionMeta>>({})
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState<string | null>(null)
  const [carName, setCarName] = useState('Your Build')
  const [carMileageUnit, setCarMileageUnit] = useState('mi')
  const fileRef = useRef<HTMLInputElement>(null)

  // Arrival treatment, decided once on mount:
  //   'overture' — cinematic cold open (fresh dive from the Home map)
  //   'fade'     — plain fade-from-dark (back-nav / direct load)
  //   'none'     — overture finished; render nothing (no flash)
  // The Home-dive flag is consumed here so back-navigation stays instant.
  const [arrival, setArrival] = useState<'overture' | 'fade' | 'none'>(() => {
    try {
      if (sessionStorage.getItem(OVERTURE_KEY) === '1') {
        sessionStorage.removeItem(OVERTURE_KEY)
        return 'overture'
      }
    } catch { /* private mode — just fade */ }
    return 'fade'
  })

  // The timeline settles into place as the Overture's curtain lifts — it starts
  // slightly raised + scaled and eases to rest, so the camera feels like it
  // lands on the story instead of the overlay just vanishing off a static page.
  const [settled, setSettled] = useState(() => {
    if (arrival !== 'overture') return true
    return typeof window !== 'undefined' &&
      !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    let active = true
    ;(async () => {
      const [cid, { data: { session } }] = await Promise.all([
        getActiveCarId(),
        supabase.auth.getSession(),
      ])
      if (!active) return
      setUserId(session?.user?.id ?? null)
      if (!cid) { setHasCar(false); setLoading(false); return }
      setCarId(cid)

      const [carRes, entRes] = await Promise.all([
        supabase.from('cars')
          .select('purchase_story, purchase_date, created_at, nickname, year, model, variant, mileage_unit')
          .eq('id', cid).single(),
        supabase.from('timeline_entries')
          .select('id, entry_type, is_origin, title, photo_url, journal_entry, display_date, session_id')
          .eq('car_id', cid)
          .order('display_date', { ascending: true })
          .order('created_at', { ascending: true }),
      ])
      if (!active) return

      const all = (entRes.data ?? []) as TLEntry[]
      const originRow = all.find(e => e.is_origin) ?? null
      const std = all.filter(e => !e.is_origin)

      // Build the Overture's hero title: nickname if set, else "year model variant".
      const carMeta = carRes.data as
        { nickname: string | null; year: number | null; model: string | null; variant: string | null; mileage_unit: string | null } | null
      if (carMeta) {
        const full = [carMeta.year, carMeta.model, carMeta.variant].filter(Boolean).join(' ').trim()
        setCarName(carMeta.nickname?.trim() || full || 'Your Build')
        if (carMeta.mileage_unit) setCarMileageUnit(carMeta.mileage_unit)
      }

      if (originRow) {
        setOrigin({
          id: originRow.id,
          photo_url: originRow.photo_url,
          story: originRow.journal_entry,
          display_date: originRow.display_date,
        })
      } else {
        const car = carRes.data as
          { purchase_story: string | null; purchase_date: string | null; created_at: string } | null
        const created = car?.created_at ? car.created_at.slice(0, 10) : null
        setOrigin({
          id: null,
          photo_url: null,
          story: car?.purchase_story?.trim() || null,
          display_date: car?.purchase_date || created,
        })
      }
      setEntries(std)
      setLoading(false)   // show timeline immediately; enrichment fills in below

      // Enrich standard entries: title from session/jobs + a fallback thumbnail
      // from the mod's first job_photo (until timeline_photo_url is set).
      const sessionIds = std.map(e => e.session_id).filter((x): x is string => !!x)
      if (sessionIds.length) {
        const [sessRes, jobRes] = await Promise.all([
          supabase.from('sessions').select('id, title, shop_name, mileage').in('id', sessionIds),
          supabase.from('jobs').select('id, session_id, title, brand').in('session_id', sessionIds),
        ])
        if (!active) return
        const m: Record<string, SessionMeta> = {}
        for (const s of (sessRes.data ?? []) as { id: string; title: string | null; shop_name: string | null; mileage: number | null }[]) {
          m[s.id] = { title: s.title, shop: s.shop_name, jobNames: [], mileage: s.mileage, photo: null }
        }
        const jobToSession: Record<string, string> = {}
        for (const j of (jobRes.data ?? []) as { id: string; session_id: string | null; title: string | null; brand: string | null }[]) {
          if (!j.session_id) continue
          ;(m[j.session_id] ??= { title: null, shop: null, jobNames: [], mileage: null, photo: null })
          jobToSession[j.id] = j.session_id
          const name = [j.brand?.trim(), j.title?.trim()].filter(Boolean).join(' ')
          if (name) m[j.session_id].jobNames.push(name)
        }
        const jobIds = Object.keys(jobToSession)
        if (jobIds.length) {
          const { data: photoRows } = await supabase
            .from('job_photos')
            .select('job_id, photo_url, display_order')
            .in('job_id', jobIds)
            .order('display_order', { ascending: true })
          if (!active) return
          for (const p of (photoRows ?? []) as { job_id: string; photo_url: string }[]) {
            const sid = jobToSession[p.job_id]
            if (sid && m[sid] && !m[sid].photo) m[sid].photo = p.photo_url
          }
        }
        setMeta(m)
      }
    })()
    return () => { active = false }
  }, [])

  // ── Origin cover photo: add or replace (persists the is_origin row) ──
  const onPickOriginPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !carId || !userId || uploading) return
    setUploadErr(null)
    setUploading(true)
    try {
      const compressed = await imageCompression(file, COMPRESSION_OPTIONS)
      const path = `${userId}/${carId}/origin/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
      const { data: up, error: upErr } = await supabase.storage
        .from('timeline-photos')
        .upload(path, compressed, { contentType: 'image/jpeg' })
      if (upErr || !up) throw upErr ?? new Error('upload failed')
      const { data: urlData } = supabase.storage.from('timeline-photos').getPublicUrl(up.path)
      const publicUrl = urlData.publicUrl

      if (origin?.id) {
        const { error } = await supabase.from('timeline_entries')
          .update({ photo_url: publicUrl }).eq('id', origin.id)
        if (error) throw error
        setOrigin(o => o ? { ...o, photo_url: publicUrl } : o)
      } else {
        const { data: ins, error } = await supabase.from('timeline_entries')
          .insert({
            car_id: carId,
            session_id: null,
            entry_type: 'origin',
            is_origin: true,
            photo_url: publicUrl,
            journal_entry: origin?.story ?? null,
            display_date: origin?.display_date ?? new Date().toISOString().slice(0, 10),
          })
          .select('id').single()
        if (error) throw error
        const newId = (ins as { id: string } | null)?.id ?? null
        setOrigin(o => o ? { ...o, id: newId, photo_url: publicUrl } : o)
      }
    } catch {
      setUploadErr('Couldn’t add the photo. Tap to try again.')
    } finally {
      setUploading(false)
    }
  }

  // Scroll-driven effects — all mutated directly off refs (no re-render):
  //  • Origin hero parallax
  //  • the "living thread": a glowing orb that rides the spine at the playhead,
  //    with a comet tail, and a soft tick as it passes each entry node.
  const scrollRef = useRef<HTMLDivElement>(null)
  const heroRef = useRef<HTMLImageElement>(null)
  const colRef = useRef<HTMLDivElement>(null)
  const orbRef = useRef<HTMLDivElement>(null)
  const passedRef = useRef(-1)        // entry nodes already passed (−1 = uninitialised)
  const rafRef = useRef(0)

  const updateThread = () => {
    const container = scrollRef.current
    const col = colRef.current
    const orb = orbRef.current
    if (!container || !col || !orb) return
    const cRect = container.getBoundingClientRect()
    const colRect = col.getBoundingClientRect()

    const nodes = col.querySelectorAll<HTMLElement>('[data-tl-node]')
    if (nodes.length === 0) { orb.style.opacity = '0'; return }

    // The orb maps to overall scroll progress across the whole thread, parking on
    // node CENTERS (the node dot is NODE_SIZE tall at top:16) so it lands squarely
    // on the last node, not its top edge. (Column-relative Y is scroll-invariant.)
    const NODE_C = 16 + NODE_SIZE / 2
    const firstInCol = nodes[0].getBoundingClientRect().top - colRect.top + NODE_C
    const lastInCol = nodes[nodes.length - 1].getBoundingClientRect().top - colRect.top + NODE_C
    // Complete a touch before the absolute scroll bottom so the orb fully lands on
    // the last node without having to scroll through the trailing padding.
    const scrollMax = container.scrollHeight - container.clientHeight
    const frac = Math.min(1, Math.max(0, container.scrollTop / Math.max(1, scrollMax - 28)))
    const orbInCol = firstInCol + frac * (lastInCol - firstInCol)
    orb.style.top = `${orbInCol.toFixed(1)}px`

    // Fade in once the first node has entered the viewport (hidden over the hero).
    const entered = nodes[0].getBoundingClientRect().top < cRect.top + container.clientHeight * 0.92
    orb.style.opacity = entered ? '1' : '0'

    // Soft tick as the orb glides past each node (downward only).
    let passed = 0
    nodes.forEach(n => {
      if (n.getBoundingClientRect().top - colRect.top + NODE_C <= orbInCol + 0.5) passed++
    })
    if (passedRef.current >= 0 && passed > passedRef.current && entered) playThreadTick()
    passedRef.current = passed
  }

  const onScroll = () => {
    const y = scrollRef.current?.scrollTop ?? 0
    if (heroRef.current) heroRef.current.style.transform = `translateY(${(y * 0.12).toFixed(1)}px)`
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; updateThread() })
    }
  }

  // Settle the orb into position once the list is laid out (and on resize).
  useEffect(() => {
    if (loading) return
    const id = requestAnimationFrame(updateThread)
    const onResize = () => updateThread()
    window.addEventListener('resize', onResize)
    return () => { cancelAnimationFrame(id); window.removeEventListener('resize', onResize) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, entries.length])

  // Save scroll position when leaving for an entry; restore it on return.
  const saveScroll = () => {
    try { sessionStorage.setItem(SCROLL_KEY, String(scrollRef.current?.scrollTop ?? 0)) } catch { /* ignore */ }
  }
  const restoredRef = useRef(false)
  useEffect(() => {
    if (loading || restoredRef.current) return
    restoredRef.current = true
    let saved = 0
    try { saved = Number(sessionStorage.getItem(SCROLL_KEY)) || 0; sessionStorage.removeItem(SCROLL_KEY) } catch { /* ignore */ }
    if (arrival === 'overture' || saved <= 0) return  // fresh dive starts at the top
    const apply = () => { if (scrollRef.current) scrollRef.current.scrollTop = saved }
    requestAnimationFrame(() => { apply(); requestAnimationFrame(apply) })
    const t = window.setTimeout(apply, 340)  // re-apply after enrichment expands cards
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  // Overture stats line: "N entries · YYYY – now"
  const startYear = origin?.display_date ? yearOf(origin.display_date)
    : (entries[0] ? yearOf(entries[0].display_date) : null)
  const lastEntry = entries[entries.length - 1]
  const endYearNum = lastEntry ? Number(yearOf(lastEntry.display_date))
    : (startYear ? Number(startYear) : null)
  const nowYear = new Date().getFullYear()
  const count = entries.length + (origin ? 1 : 0)
  const rangeLabel = startYear
    ? (endYearNum && endYearNum >= nowYear
        ? `${startYear} – now`
        : (endYearNum && String(endYearNum) !== startYear ? `${startYear} – ${endYearNum}` : startYear))
    : ''
  const overtureSubtitle = [
    count > 0 ? `${count} ${count === 1 ? 'entry' : 'entries'}` : '',
    rangeLabel,
  ].filter(Boolean).join('   ·   ')

  const chevron = (
    <button
      onClick={() => navigate('/home')}
      aria-label="Back to home"
      style={{
        position: 'fixed', top: 8, left: 8, width: 44, height: 44, zIndex: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{ color: COLOR_TIMELINE_CHEVRON, fontSize: 30, fontWeight: 300, lineHeight: 1 }}>‹</span>
    </button>
  )

  const shell = (children: React.ReactNode) => (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      style={{
        height: '100dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        background: COLOR_TIMELINE_BG, fontFamily: FONT_UI, position: 'relative',
      }}
    >
      {/* Arrival: cinematic Overture on a fresh dive from Home; plain fade otherwise */}
      {arrival === 'overture'
        ? (loading
            ? <div style={{ position: 'fixed', inset: 0, zIndex: 95, background: '#0a0805' }} />
            : <TimelineOverture
                title={carName} subtitle={overtureSubtitle}
                onLeaveStart={() => setSettled(true)}
                onDone={() => setArrival('none')}
              />)
        : arrival === 'fade' ? <ArrivalFade /> : null}

      {/* Ambient material — warm light-leak at the top + a soft vignette + faint grain */}
      <div aria-hidden style={{
        position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
        background:
          'radial-gradient(140% 38% at 50% -4%, rgba(200,150,70,0.10) 0%, rgba(200,150,70,0) 60%),' +
          'radial-gradient(120% 90% at 50% 50%, rgba(0,0,0,0) 62%, rgba(40,30,18,0.06) 100%)',
      }} />
      <div aria-hidden style={{
        position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none', opacity: 0.035,
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        mixBlendMode: 'multiply',
      }} />

      <style>{`
        .tl-press { transition: transform 140ms ease-out; }
        .tl-press:active { transform: scale(0.97); }
        @keyframes tlKen { from { transform: scale(1.05); } to { transform: scale(1.16); } }
        .tl-ken { animation: tlKen 26s ease-in-out infinite alternate; }
        @keyframes tlOrbPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 10px 3px rgba(240,212,160,0.7); }
          50% { transform: scale(1.22); box-shadow: 0 0 15px 6px rgba(245,224,178,0.85); }
        }
        .tl-orb-dot { animation: tlOrbPulse 2.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .tl-ken { animation: none; transform: scale(1.05); }
          .tl-orb-dot { animation: none; }
        }
      `}</style>
      {chevron}
      <input ref={fileRef} type="file" accept="image/*" onChange={onPickOriginPhoto} style={{ display: 'none' }} />
      {children}
    </div>
  )

  if (loading) return shell(null)

  if (!hasCar) {
    return shell(
      <div style={{ paddingTop: '40vh', textAlign: 'center', color: COLOR_TIMELINE_MUTED, fontSize: 14 }}>
        No car selected yet.
      </div>,
    )
  }

  // Start null (not the origin year) so the entries section always opens with its
  // first chapter year — even when the first entries share the origin's year.
  let lastYear: string | null = null

  return shell(
    <>
    <div style={{
      position: 'relative', zIndex: 2,
      transform: settled ? 'none' : 'translateY(30px) scale(1.04)',
      opacity: settled ? 1 : 0,
      transformOrigin: '50% 0',
      transition: settled ? `transform 900ms ${EASING_SETTLE}, opacity 700ms ${EASING_SETTLE}` : 'none',
    }}>
      {/* ── Origin hero — full-bleed magazine opener ── */}
      {origin && (
        <Reveal>
          {origin.photo_url ? (
            <>
            <section style={{
              position: 'relative', width: '100%', height: '54vh', minHeight: 320, maxHeight: 500,
              overflow: 'hidden', background: '#0a0805',
            }}>
              {/* Parallax layer — Ken Burns drift on the image, scroll-lag on this wrapper */}
              <div ref={heroRef} style={{ position: 'absolute', left: 0, right: 0, top: '-12%', bottom: '-12%', willChange: 'transform' }}>
                <img
                  src={origin.photo_url} alt="" aria-hidden className="tl-ken"
                  style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover',
                    filter: uploading ? 'brightness(0.5)' : 'none', transition: 'filter 220ms' }}
                />
              </div>
              {/* Top scrim — keeps the floating chevron legible over bright photos */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 120, pointerEvents: 'none',
                background: 'linear-gradient(180deg, rgba(10,8,5,0.5) 0%, rgba(10,8,5,0) 100%)' }} />
              {/* Bottom scrim — just enough to seat the kicker; the photo stays the hero */}
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '40%', pointerEvents: 'none',
                background: 'linear-gradient(180deg, rgba(10,8,5,0) 0%, rgba(10,8,5,0.64) 100%)' }} />

              <button
                onClick={() => !uploading && fileRef.current?.click()}
                aria-label="Change cover photo"
                style={{
                  position: 'absolute', top: 12, right: 12, height: 32, padding: '0 12px', zIndex: 2,
                  display: 'flex', alignItems: 'center', gap: 6, borderRadius: 16,
                  background: 'rgba(20,18,16,0.5)', border: '1px solid rgba(255,255,255,0.25)',
                  backdropFilter: 'blur(4px)', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center' }}><CameraIcon size={15} color="#f5f5f5" /></span>
                <span style={{ fontFamily: FONT_UI, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#f5f5f5' }}>
                  {uploading ? 'Saving…' : 'Change'}
                </span>
              </button>

              {/* The only text on the photo — a short kicker + date */}
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 24px 20px' }}>
                <div style={{
                  fontFamily: FONT_UI, fontSize: 11, fontWeight: 800, letterSpacing: '0.2em',
                  textTransform: 'uppercase', color: COLOR_TIMELINE_CHEVRON,
                  textShadow: '0 1px 12px rgba(0,0,0,0.7)',
                }}>
                  Where it began{origin.display_date ? ` · ${fmtDate(origin.display_date)}` : ''}
                </div>
              </div>
            </section>

            {/* Story panel — on parchment below the photo: always legible, any length,
                and the car keeps the spotlight. */}
            <div style={{ maxWidth: CANVAS_W, margin: '0 auto', padding: '28px 26px 6px' }}>
              <div aria-hidden style={{ width: 40, height: 2, background: COLOR_TIMELINE_CHEVRON, opacity: 0.7, marginBottom: 18 }} />
              <p style={{
                margin: 0, fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 500,
                fontSize: 21, lineHeight: 1.6, color: COLOR_TIMELINE_TEXT,
              }}>
                {origin.story || 'Every build starts somewhere. This is where yours begins.'}
              </p>
              {uploadErr && (
                <p onClick={() => fileRef.current?.click()}
                  style={{ margin: '12px 0 0', fontFamily: FONT_UI, fontSize: 12, color: COLOR_ERROR, cursor: 'pointer' }}>
                  {uploadErr}
                </p>
              )}
            </div>
            </>
          ) : (
            // No photo yet — a grand parchment opener inviting the first photo
            <section style={{
              position: 'relative', width: '100%', padding: '96px 26px 44px', textAlign: 'center',
              background: 'linear-gradient(180deg, rgba(200,160,80,0.09) 0%, rgba(245,242,238,0) 72%)',
              borderBottom: `1px solid ${COLOR_TIMELINE_RULE}`, marginBottom: 8,
            }}>
              <div style={{
                fontFamily: FONT_UI, fontSize: 11, fontWeight: 800, letterSpacing: '0.2em',
                textTransform: 'uppercase', color: COLOR_TIMELINE_CHEVRON, marginBottom: 14,
              }}>
                Where it began{origin.display_date ? ` · ${fmtDate(origin.display_date)}` : ''}
              </div>
              <p style={{
                margin: '0 auto 24px', maxWidth: 320, fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 500,
                fontSize: 22, lineHeight: 1.45, color: COLOR_TIMELINE_TEXT,
              }}>
                {origin.story || 'Every build starts somewhere. This is where yours begins.'}
              </p>
              <button
                onClick={() => !uploading && fileRef.current?.click()}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, height: 44, padding: '0 18px',
                  borderRadius: RADIUS_BUTTON, background: 'rgba(200,160,80,0.10)',
                  border: `1px solid ${COLOR_TIMELINE_CHEVRON}`, cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent', opacity: uploading ? 0.5 : 1,
                }}
              >
                <CameraIcon size={18} color={COLOR_TIMELINE_CHEVRON} />
                <span style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: COLOR_TIMELINE_CHEVRON }}>
                  {uploading ? 'Saving…' : 'Add the first photo'}
                </span>
              </button>
              {uploadErr && (
                <p onClick={() => fileRef.current?.click()}
                  style={{ margin: '14px 0 0', fontFamily: FONT_UI, fontSize: 12, color: COLOR_ERROR, cursor: 'pointer' }}>
                  {uploadErr}
                </p>
              )}
            </section>
          )}
        </Reveal>
      )}

      {/* ── Entries column ── */}
      <div ref={colRef} style={{ position: 'relative', maxWidth: CANVAS_W, margin: '0 auto', padding: `${origin ? 30 : 64}px 20px 96px` }}>

      {/* Living thread — a glowing orb that rides the spine at the scroll
          playhead, trailing a comet of light. Position (top) + visibility are
          mutated on scroll; x is the spine line (column pad 20 + SPINE_LEFT). */}
      {entries.length > 0 && (
        <div ref={orbRef} aria-hidden style={{
          position: 'absolute', left: 20 + SPINE_LEFT, top: 0, width: 0, height: 0,
          opacity: 0, transition: 'opacity 320ms ease', pointerEvents: 'none', zIndex: 3,
        }}>
          {/* comet tail trailing up the thread (where the orb came from) */}
          <div style={{
            position: 'absolute', left: -1.5, bottom: 0, width: 3, height: 150, borderRadius: 2,
            background: 'linear-gradient(to top, rgba(245,224,178,0.8) 0%, rgba(245,224,178,0.3) 40%, rgba(245,224,178,0) 100%)',
          }} />
          {/* the glowing playhead — a soft warm-white light */}
          <div className="tl-orb-dot" style={{
            position: 'absolute', left: -6, top: -6, width: 12, height: 12, borderRadius: '50%',
            background: '#fdf2de', boxShadow: '0 0 10px 3px rgba(240,212,160,0.8)',
          }} />
        </div>
      )}

      {/* ── Standard entries — oldest first, year dividers, connecting thread ── */}
      {entries.map((e) => {
        const year = yearOf(e.display_date)
        const showYear = year !== lastYear
        lastYear = year
        const type = e.entry_type as StdType
        const accent = TYPE_META[type]?.color ?? COLOR_TIMELINE_MOD
        const isLast = false // a closing beat always follows, so the spine runs through
        const m = e.session_id ? meta[e.session_id] : undefined
        const img = e.photo_url || m?.photo || null
        const ct = cardText(e, m, carMileageUnit)

        return (
          <div key={e.id}>
            {showYear && (
              <div style={{ position: 'relative', paddingLeft: CARD_LEFT, marginTop: 18, height: 84, display: 'flex', alignItems: 'center', gap: 14, overflow: 'hidden' }}>
                {/* the spine runs unbroken through the chapter break */}
                <div style={{ position: 'absolute', left: SPINE_LEFT, top: 0, bottom: 0, width: 2, background: COLOR_TIMELINE_RULE, transform: 'translateX(-50%)' }} />
                {/* A soft tick at the same faintness as the year, so it reads as
                    part of the chapter plate rather than a floating amber hyphen. */}
                <span aria-hidden style={{ position: 'relative', flexShrink: 0, width: 24, height: 2, background: COLOR_TIMELINE_YEAR, opacity: 0.16 }} />
                <span style={{
                  fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 72, lineHeight: 1,
                  letterSpacing: '0.01em', color: COLOR_TIMELINE_YEAR, opacity: 0.16,
                  fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                }}>
                  {year}
                </span>
              </div>
            )}

            <EntryBlock accent={accent} isLast={isLast}>
              <Reveal>
                <article
                  className="tl-press"
                  data-sfx="tick"
                  onClick={() => { saveScroll(); navigate(`/timeline/entry/${e.id}`) }}
                  style={{
                    background: COLOR_TIMELINE_CARD,
                    borderRadius: RADIUS_TIMELINE_CARD,
                    borderLeft: `3px solid ${accent}`,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
                    cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', gap: 12, padding: '12px 14px', alignItems: 'flex-start' }}>
                    {/* Text block */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontFamily: FONT_UI, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: COLOR_TIMELINE_MUTED }}>
                          {TYPE_META[type]?.label ?? type}
                        </span>
                        <span style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 600, color: COLOR_TIMELINE_MUTED, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          {fmtDate(e.display_date)}
                        </span>
                      </div>
                      <div style={{
                        marginTop: 3, fontFamily: FONT_UI, fontSize: 15, fontWeight: 700, color: COLOR_TIMELINE_TEXT, lineHeight: 1.3,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>
                        {ct.title}
                      </div>
                      {/* Components inside a titled group/session */}
                      {ct.components && (
                        <div style={{
                          margin: '4px 0 0', fontFamily: FONT_UI, fontSize: 12, fontWeight: 500, color: COLOR_TIMELINE_MUTED, lineHeight: 1.4,
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        }}>
                          {ct.components}
                        </div>
                      )}
                      {e.journal_entry && (
                        <p style={{
                          margin: '6px 0 0', fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 500,
                          fontSize: 15, lineHeight: 1.45, color: COLOR_TIMELINE_TEXT,
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        }}>
                          {e.journal_entry}
                        </p>
                      )}
                      {/* Quiet meta: shop · mileage at the time */}
                      {ct.metaLine && (
                        <div style={{
                          margin: '7px 0 0', fontFamily: FONT_UI, fontSize: 11, fontWeight: 600, letterSpacing: '0.02em',
                          color: COLOR_TIMELINE_YEAR, fontVariantNumeric: 'tabular-nums',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {ct.metaLine}
                        </div>
                      )}
                    </div>

                    {/* "Photo print" thumbnail */}
                    {img && (
                      <div style={{
                        width: THUMB, height: THUMB, flexShrink: 0,
                        borderRadius: 3, overflow: 'hidden',
                        border: '1px solid rgba(0,0,0,0.07)',
                        boxShadow: '0 1px 5px rgba(0,0,0,0.14)',
                        background: '#fff',
                      }}>
                        <ThumbImg src={img} />
                      </div>
                    )}
                  </div>
                </article>
              </Reveal>
            </EntryBlock>
          </div>
        )
      })}

      {/* ── Closing beat — the thread tapers to "now", inviting the next chapter ── */}
      {entries.length > 0 && (
        <div data-tl-node style={{ position: 'relative', paddingLeft: CARD_LEFT, paddingTop: 6 }}>
          {/* the thread tapers off below the final node */}
          <div style={{
            position: 'absolute', left: SPINE_LEFT, top: 0, width: 2, height: 48, transform: 'translateX(-50%)',
            background: `linear-gradient(to bottom, ${COLOR_TIMELINE_RULE} 0%, rgba(224,216,206,0) 100%)`,
          }} />
          {/* terminal node */}
          <div style={{
            position: 'absolute', left: SPINE_LEFT, top: 12, width: NODE_SIZE, height: NODE_SIZE,
            borderRadius: '50%', background: COLOR_TIMELINE_CHEVRON, border: `2px solid ${COLOR_TIMELINE_BG}`,
            transform: 'translateX(-50%)',
          }} />
          <Reveal>
            <div style={{ paddingTop: 30 }}>
              <div style={{
                fontFamily: FONT_UI, fontSize: 10, fontWeight: 800, letterSpacing: '0.2em',
                textTransform: 'uppercase', color: COLOR_TIMELINE_CHEVRON, marginBottom: 8,
              }}>
                The story continues
              </div>
              <p style={{
                margin: 0, maxWidth: 280, fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 500,
                fontSize: 19, lineHeight: 1.5, color: COLOR_TIMELINE_MUTED,
              }}>
                Every drive, every part, every memory. The next chapter is yours to add.
              </p>
            </div>
          </Reveal>
        </div>
      )}
    </div>
    </div>

    {/* Floating "Add Entry" — free-form note (track day, car show, a story) */}
    <button
      className="tl-press"
      onClick={() => navigate('/timeline/new')}
      style={{
        position: 'fixed', right: 18, bottom: 'calc(24px + env(safe-area-inset-bottom))', zIndex: 20,
        height: 46, padding: '0 18px', borderRadius: RADIUS_BUTTON,
        display: 'flex', alignItems: 'center', gap: 8,
        background: COLOR_ACCENT, color: COLOR_ACCENT_TEXT, border: 'none', cursor: 'pointer',
        fontFamily: FONT_UI, fontWeight: 800, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase',
        boxShadow: '0 6px 18px rgba(0,0,0,0.18)', WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{ fontSize: 17, lineHeight: 1, marginTop: -1 }}>＋</span>
      Add Entry
    </button>
    </>,
  )
}
