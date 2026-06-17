// Route: /builds/:username/timeline — read-only public mirror of the owner's
// Timeline (the parchment build story). No header chrome beyond a floating amber
// chevron back to the public profile map; no Add-Entry FAB, no origin-photo
// upload, no entry drill-in. Cards are display-only.
//
// Resolves which car to show from `public_car_profiles` (username + optional
// ?car=<id>) so it matches the car the visitor was viewing on the map. All
// queries are anon-RLS gated — timeline_entries are visible only when the car
// is public AND show_timeline_publicly is true (migration 053). Session/job
// enrichment degrades gracefully (falls back to the entry's own title / no
// thumbnail) when the Build Sheet section is private.

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ArrivalFade from '../components/ArrivalFade'
import {
  COLOR_TIMELINE_BG, COLOR_TIMELINE_CARD, COLOR_TIMELINE_TEXT,
  COLOR_TIMELINE_MUTED, COLOR_TIMELINE_YEAR, COLOR_TIMELINE_RULE,
  COLOR_TIMELINE_CHEVRON, COLOR_TIMELINE_MOD, COLOR_TIMELINE_SERVICE,
  COLOR_TIMELINE_DETAIL, COLOR_TIMELINE_NOTE, RADIUS_TIMELINE_CARD,
  FONT_UI, FONT_TITLE, EASING_SETTLE, CANVAS_W,
} from '../tokens'

// ── Layout constants (mirror of TimelinePage) ──
const SPINE_LEFT = 9
const CARD_LEFT  = 34
const NODE_SIZE  = 11
const THUMB      = 90

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
  display_date: string
  session_id: string | null
}

type SessionMeta = { title: string | null; shop: string | null; jobTitles: string[]; photo: string | null }

type OriginCard = {
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

function yearOf(d: string): string { return d.slice(0, 4) }

function entryTitle(e: TLEntry, meta: SessionMeta | undefined): string {
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

// ── Scroll-reveal primitives (mirror of TimelinePage) ──
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
    <div ref={ref} style={{
      opacity: shown ? 1 : 0,
      transform: shown ? 'none' : 'translateY(12px)',
      transition: `opacity 400ms ${EASING_SETTLE}, transform 400ms ${EASING_SETTLE}`,
    }}>{children}</div>
  )
}

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

export default function PublicTimelinePage() {
  const { username } = useParams<{ username: string }>()
  const navigate = useNavigate()
  const carParam = new URLSearchParams(window.location.search).get('car')

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [carId, setCarId] = useState<string | null>(null)
  const [origin, setOrigin] = useState<OriginCard | null>(null)
  const [pressedId, setPressedId] = useState<string | null>(null)
  const [entries, setEntries] = useState<TLEntry[]>([])
  const [meta, setMeta] = useState<Record<string, SessionMeta>>({})

  useEffect(() => {
    let active = true
    ;(async () => {
      if (!username) { setNotFound(true); setLoading(false); return }
      const { data } = await supabase
        .from('public_car_profiles')
        .select('id, active_car_id, purchase_story, purchase_date, created_at, show_timeline_publicly')
        .eq('username', username)
      if (!active) return
      const rows = (data as Array<{
        id: string; active_car_id: string | null
        purchase_story: string | null; purchase_date: string | null; created_at: string | null
        show_timeline_publicly: boolean | null
      }> | null) ?? []
      const activeId = rows[0]?.active_car_id
      const car = (carParam ? rows.find(r => r.id === carParam) : null)
        ?? rows.find(r => r.id === activeId) ?? rows[0] ?? null
      if (!car || car.show_timeline_publicly === false) { setNotFound(true); setLoading(false); return }
      setCarId(car.id)

      const { data: entData } = await supabase.from('timeline_entries')
        .select('id, entry_type, is_origin, title, photo_url, journal_entry, display_date, session_id')
        .eq('car_id', car.id)
        .order('display_date', { ascending: true })
        .order('created_at', { ascending: true })
      if (!active) return

      const all = (entData ?? []) as TLEntry[]
      const originRow = all.find(e => e.is_origin) ?? null
      const std = all.filter(e => !e.is_origin)

      if (originRow) {
        setOrigin({ photo_url: originRow.photo_url, story: originRow.journal_entry, display_date: originRow.display_date })
      } else {
        const created = car.created_at ? car.created_at.slice(0, 10) : null
        setOrigin({
          photo_url: null,
          story: car.purchase_story?.trim() || null,
          display_date: car.purchase_date || created,
        })
      }
      setEntries(std)

      // Enrich session-derived entries (best-effort — gated by anon RLS).
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
            .from('job_photos').select('job_id, photo_url, display_order')
            .in('job_id', jobIds).order('display_order', { ascending: true })
          if (!active) return
          for (const p of (photoRows ?? []) as { job_id: string; photo_url: string }[]) {
            const sid = jobToSession[p.job_id]
            if (sid && m[sid] && !m[sid].photo) m[sid].photo = p.photo_url
          }
        }
        setMeta(m)
      }

      setLoading(false)
    })()
    return () => { active = false }
  }, [username, carParam])

  const back = () => navigate(`/builds/${username}${carId ? `?car=${carId}` : ''}`)

  const chevron = (
    <button
      onClick={back} aria-label="Back to profile"
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
      maxWidth: 440, margin: '0 auto',
    }}>
      <ArrivalFade />
      {chevron}
      {children}
    </div>
  )

  if (loading) return shell(null)

  if (notFound) {
    return shell(
      <div style={{ paddingTop: '40vh', textAlign: 'center', color: COLOR_TIMELINE_MUTED, fontSize: 14 }}>
        This timeline isn’t available.
      </div>,
    )
  }

  let lastYear: string | null = origin?.display_date ? yearOf(origin.display_date) : null

  return shell(
    <div style={{ maxWidth: CANVAS_W, margin: '0 auto', padding: '64px 20px 96px' }}>
      {/* ── Origin cover card (read-only) ── */}
      {origin && (
        <Reveal>
          <article style={{
            background: COLOR_TIMELINE_CARD, borderRadius: RADIUS_TIMELINE_CARD, overflow: 'hidden',
            boxShadow: '0 4px 16px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)', marginBottom: 28,
          }}>
            {origin.photo_url && (
              <img src={origin.photo_url} alt="" aria-hidden
                style={{ display: 'block', width: '100%', height: 230, objectFit: 'cover' }} />
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
                {origin.story || 'Every build starts somewhere.'}
              </p>
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
                  onClick={() => navigate(`/builds/${username}/timeline/entry/${e.id}${carParam ? `?car=${carParam}` : ''}`)}
                  onPointerDown={() => setPressedId(e.id)}
                  onPointerUp={() => setPressedId(null)}
                  onPointerLeave={() => setPressedId(null)}
                  onPointerCancel={() => setPressedId(null)}
                  style={{
                    background: COLOR_TIMELINE_CARD, borderRadius: RADIUS_TIMELINE_CARD,
                    borderLeft: `3px solid ${accent}`,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
                    cursor: 'pointer',
                    opacity: pressedId === e.id ? 0.7 : 1,
                    transition: 'opacity 80ms ease',
                    WebkitTapHighlightColor: 'transparent',
                  }}>
                  <div style={{ display: 'flex', gap: 12, padding: '12px 14px', alignItems: 'flex-start' }}>
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

                    {img && (
                      <div style={{
                        width: THUMB, height: THUMB, flexShrink: 0, borderRadius: 3, overflow: 'hidden',
                        border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 1px 5px rgba(0,0,0,0.14)', background: '#fff',
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

      {entries.length === 0 && (
        <div style={{ paddingTop: 40, textAlign: 'center', color: COLOR_TIMELINE_MUTED, fontSize: 13 }}>
          The story is just getting started.
        </div>
      )}
    </div>,
  )
}
