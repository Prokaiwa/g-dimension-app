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
  const fileRef = useRef<HTMLInputElement>(null)

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
          .select('purchase_story, purchase_date, created_at')
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
    <div style={{
      height: '100dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
      background: COLOR_TIMELINE_BG, fontFamily: FONT_UI, position: 'relative',
    }}>
      <ArrivalFade />
      <style>{`
        .tl-press { transition: transform 140ms ease-out; }
        .tl-press:active { transform: scale(0.97); }
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
    <div style={{ maxWidth: CANVAS_W, margin: '0 auto', padding: '64px 20px 96px' }}>
      {/* ── Origin cover card (full-bleed, no stripe) ── */}
      {origin && (
        <Reveal>
          <article style={{
            background: COLOR_TIMELINE_CARD,
            borderRadius: RADIUS_TIMELINE_CARD,
            overflow: 'hidden',
            boxShadow: '0 4px 16px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
            marginBottom: 28,
          }}>
            {origin.photo_url ? (
              // Cover photo with a small "change" button overlay
              <div style={{ position: 'relative' }}>
                <img
                  src={origin.photo_url} alt="" aria-hidden
                  style={{ display: 'block', width: '100%', height: 230, objectFit: 'cover',
                    filter: uploading ? 'brightness(0.6)' : 'none', transition: 'filter 200ms' }}
                />
                <button
                  onClick={() => !uploading && fileRef.current?.click()}
                  aria-label="Change cover photo"
                  style={{
                    position: 'absolute', bottom: 10, right: 10, height: 32, padding: '0 12px',
                    display: 'flex', alignItems: 'center', gap: 6, borderRadius: 16,
                    background: 'rgba(20,18,16,0.55)', border: '1px solid rgba(255,255,255,0.25)',
                    backdropFilter: 'blur(4px)', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center' }}><CameraIcon size={15} color="#f5f5f5" /></span>
                  <span style={{ fontFamily: FONT_UI, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#f5f5f5' }}>
                    {uploading ? 'Saving…' : 'Change'}
                  </span>
                </button>
              </div>
            ) : (
              // No photo yet — tappable prompt to add the first one
              <button
                onClick={() => !uploading && fileRef.current?.click()}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                  width: '100%', height: 150, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                  background: 'rgba(200,160,80,0.06)',
                  border: 'none', borderBottom: `1px dashed ${COLOR_TIMELINE_RULE}`,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', opacity: uploading ? 0.4 : 1 }}><CameraIcon size={24} color={COLOR_TIMELINE_CHEVRON} /></span>
                <span style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: COLOR_TIMELINE_CHEVRON }}>
                  {uploading ? 'Saving…' : 'Add the first photo'}
                </span>
              </button>
            )}

            <div style={{ padding: '20px 18px 22px' }}>
              <div style={{
                fontFamily: FONT_UI, fontSize: 10, fontWeight: 800, letterSpacing: '0.18em',
                textTransform: 'uppercase', color: COLOR_TIMELINE_CHEVRON, marginBottom: 10,
              }}>
                The Beginning{origin.display_date ? ` · ${fmtDate(origin.display_date)}` : ''}
              </div>
              <p style={{
                margin: 0, fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 500,
                fontSize: 19, lineHeight: 1.5, color: COLOR_TIMELINE_TEXT,
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
          </article>
        </Reveal>
      )}

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
              <div style={{ position: 'relative', paddingLeft: CARD_LEFT, height: 52, display: 'flex', alignItems: 'center' }}>
                <div style={{ position: 'absolute', left: SPINE_LEFT, top: 0, bottom: 0, width: 2, background: COLOR_TIMELINE_RULE, transform: 'translateX(-50%)' }} />
                <span style={{ fontFamily: FONT_UI, fontSize: 22, fontWeight: 800, letterSpacing: '0.04em', color: COLOR_TIMELINE_YEAR, fontVariantNumeric: 'tabular-nums' }}>
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
