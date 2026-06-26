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
  note:         { label: 'Note',         color: COLOR_TIMELINE_NOTE },
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

type SessionMeta = { title: string | null; shop: string | null; jobTitles: string[]; photo: string | null }

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

function entryTitle(e: TLEntry, meta: SessionMeta | undefined): string {
  // Notes (and any entry with its own headline) carry the title directly.
  if (e.title?.trim()) return e.title.trim()
  const type = e.entry_type as StdType
  const shop = meta?.shop?.trim() || null
  const titles = meta?.jobTitles ?? []

  let base: string
  if (meta?.title?.trim()) base = meta.title.trim()
  else if (titles.length === 1) base = titles[0]
  else if (titles.length > 1) base = `${titles.length} jobs`
  else base = shop || TYPE_META[type].label

  if (shop && base !== shop && titles.length !== 1) return `${base} · ${shop}`
  return base
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
    <div ref={ref} style={{ position: 'relative', paddingLeft: CARD_LEFT, paddingBottom: 18 }}>
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
          .select('purchase_story, purchase_date, created_at, nickname, year, model, variant')
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
        { nickname: string | null; year: number | null; model: string | null; variant: string | null } | null
      if (carMeta) {
        const full = [carMeta.year, carMeta.model, carMeta.variant].filter(Boolean).join(' ').trim()
        setCarName(carMeta.nickname?.trim() || full || 'Your Build')
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
          supabase.from('sessions').select('id, title, shop_name').in('id', sessionIds),
          supabase.from('jobs').select('id, session_id, title').in('session_id', sessionIds),
        ])
        if (!active) return
        const m: Record<string, SessionMeta> = {}
        for (const s of (sessRes.data ?? []) as { id: string; title: string | null; shop_name: string | null }[]) {
          m[s.id] = { title: s.title, shop: s.shop_name, jobTitles: [], photo: null }
        }
        const jobToSession: Record<string, string> = {}
        for (const j of (jobRes.data ?? []) as { id: string; session_id: string | null; title: string | null }[]) {
          if (!j.session_id) continue
          ;(m[j.session_id] ??= { title: null, shop: null, jobTitles: [], photo: null })
          jobToSession[j.id] = j.session_id
          if (j.title) m[j.session_id].jobTitles.push(j.title)
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

  // Scroll-driven parallax for the Origin hero (mutated directly — no re-render).
  const scrollRef = useRef<HTMLDivElement>(null)
  const heroRef = useRef<HTMLImageElement>(null)
  const onScroll = () => {
    const y = scrollRef.current?.scrollTop ?? 0
    if (heroRef.current) heroRef.current.style.transform = `translateY(${(y * 0.12).toFixed(1)}px)`
  }

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
        @media (prefers-reduced-motion: reduce) { .tl-ken { animation: none; transform: scale(1.05); } }
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

  let lastYear: string | null = origin?.display_date ? yearOf(origin.display_date) : null

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
      <div style={{ maxWidth: CANVAS_W, margin: '0 auto', padding: `${origin ? 30 : 64}px 20px 96px` }}>

      {/* ── Standard entries — oldest first, year dividers, connecting thread ── */}
      {entries.map((e, i) => {
        const year = yearOf(e.display_date)
        const showYear = year !== lastYear
        lastYear = year
        const type = e.entry_type as StdType
        const accent = TYPE_META[type]?.color ?? COLOR_TIMELINE_MOD
        const isLast = i === entries.length - 1
        const m = e.session_id ? meta[e.session_id] : undefined
        const img = e.photo_url || m?.photo || null

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
                  onClick={() => navigate(`/timeline/entry/${e.id}`)}
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
                      <div style={{ marginTop: 3, fontFamily: FONT_UI, fontSize: 15, fontWeight: 700, color: COLOR_TIMELINE_TEXT, lineHeight: 1.3 }}>
                        {entryTitle(e, m)}
                      </div>
                      {e.journal_entry && (
                        <p style={{
                          margin: '6px 0 0', fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 500,
                          fontSize: 15, lineHeight: 1.45, color: COLOR_TIMELINE_TEXT,
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        }}>
                          {e.journal_entry}
                        </p>
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
