// Route: /timeline — the build story (Part 12). The emotional heart.
//
// The one light/parchment destination. NO header — a single floating amber-gold
// chevron only. Reads from `timeline_entries` exclusively (migration 007),
// oldest-at-top (Origin Entry first, scroll down = forward in time), with year
// chapter dividers. A vertical thread connects the entries down the page.
//
// Origin Entry: if no is_origin row exists yet, we render a SYNTHETIC cover card
// derived from `cars` (purchase_story / purchase_date) without writing a row —
// the real Origin Entry creation + photo prompt is a later step.
//
// Standard entries carry no title column, so we enrich each card with a title
// derived from its session (grouped name) / its jobs (single title or count)
// via a small join. photo_url + journal_entry are null until the Add-to-Timeline
// flow gains photo/note inputs — cards stay meaningful via type + date + title.

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import {
  COLOR_TIMELINE_BG, COLOR_TIMELINE_CARD, COLOR_TIMELINE_TEXT,
  COLOR_TIMELINE_MUTED, COLOR_TIMELINE_YEAR, COLOR_TIMELINE_RULE,
  COLOR_TIMELINE_CHEVRON, COLOR_TIMELINE_MOD, COLOR_TIMELINE_SERVICE,
  COLOR_TIMELINE_DETAIL, RADIUS_TIMELINE_CARD,
  FONT_UI, FONT_TITLE, EASING_SETTLE, CANVAS_W,
} from '../tokens'

// ── Layout constants ──
const SPINE_LEFT = 9   // center of the connecting thread, from content left edge
const CARD_LEFT  = 34  // where standard cards begin (clears the thread + node)
const NODE_SIZE  = 11

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

type StdType = 'modification' | 'maintenance' | 'detail'

const TYPE_META: Record<StdType, { label: string; color: string }> = {
  modification: { label: 'Modification', color: COLOR_TIMELINE_MOD },
  maintenance:  { label: 'Service',      color: COLOR_TIMELINE_SERVICE },
  detail:       { label: 'Detail',       color: COLOR_TIMELINE_DETAIL },
}

type TLEntry = {
  id: string
  entry_type: 'origin' | StdType
  is_origin: boolean
  photo_url: string | null
  journal_entry: string | null
  display_date: string // YYYY-MM-DD
  session_id: string | null
}

type SessionMeta = { title: string | null; shop: string | null; jobTitles: string[] }

type OriginCard = {
  photo_url: string | null
  story: string | null
  display_date: string | null
}

// Parse a YYYY-MM-DD date string without timezone drift.
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
  const type = e.entry_type as StdType
  const shop = meta?.shop?.trim() || null
  const titles = meta?.jobTitles ?? []

  let base: string
  if (meta?.title?.trim()) base = meta.title.trim()           // grouped mod name wins
  else if (titles.length === 1) base = titles[0]              // solo job → its name
  else if (titles.length > 1) base = `${titles.length} jobs`  // batch → count
  else base = shop || TYPE_META[type].label                   // fallback

  // Append shop name unless it's already the whole label / a single named job.
  if (shop && base !== shop && titles.length !== 1) return `${base} · ${shop}`
  return base
}

// ── Scroll-reveal wrapper (Part 7: IntersectionObserver fade-in) ──
function Reveal({ children }: { children: React.ReactNode }) {
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

export default function TimelinePage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [hasCar, setHasCar] = useState(true)
  const [origin, setOrigin] = useState<OriginCard | null>(null)
  const [entries, setEntries] = useState<TLEntry[]>([])
  const [meta, setMeta] = useState<Record<string, SessionMeta>>({})

  useEffect(() => {
    let active = true
    ;(async () => {
      const carId = await getActiveCarId()
      if (!active) return
      if (!carId) { setHasCar(false); setLoading(false); return }

      // Car (for Origin cover + synthetic fallback) + all timeline entries.
      const [carRes, entRes] = await Promise.all([
        supabase.from('cars')
          .select('purchase_story, purchase_date, created_at')
          .eq('id', carId).single(),
        supabase.from('timeline_entries')
          .select('id, entry_type, is_origin, photo_url, journal_entry, display_date, session_id')
          .eq('car_id', carId)
          .order('display_date', { ascending: true })
          .order('created_at', { ascending: true }),
      ])
      if (!active) return

      const all = (entRes.data ?? []) as TLEntry[]
      const originRow = all.find(e => e.is_origin) ?? null
      const std = all.filter(e => !e.is_origin)

      // Origin: real row if present, else synthetic from the car.
      if (originRow) {
        setOrigin({
          photo_url: originRow.photo_url,
          story: originRow.journal_entry,
          display_date: originRow.display_date,
        })
      } else {
        const car = carRes.data as
          { purchase_story: string | null; purchase_date: string | null; created_at: string } | null
        const created = car?.created_at ? car.created_at.slice(0, 10) : null
        setOrigin({
          photo_url: null,
          story: car?.purchase_story?.trim() || null,
          display_date: car?.purchase_date || created,
        })
      }
      setEntries(std)

      // Enrich standard entries with a title derived from session + jobs.
      const sessionIds = std.map(e => e.session_id).filter((x): x is string => !!x)
      if (sessionIds.length) {
        const [sessRes, jobRes] = await Promise.all([
          supabase.from('sessions').select('id, title, shop_name').in('id', sessionIds),
          supabase.from('jobs').select('session_id, title').in('session_id', sessionIds),
        ])
        if (!active) return
        const m: Record<string, SessionMeta> = {}
        for (const s of (sessRes.data ?? []) as { id: string; title: string | null; shop_name: string | null }[]) {
          m[s.id] = { title: s.title, shop: s.shop_name, jobTitles: [] }
        }
        for (const j of (jobRes.data ?? []) as { session_id: string | null; title: string | null }[]) {
          if (!j.session_id) continue
          ;(m[j.session_id] ??= { title: null, shop: null, jobTitles: [] })
          if (j.title) m[j.session_id].jobTitles.push(j.title)
        }
        setMeta(m)
      }

      setLoading(false)
    })()
    return () => { active = false }
  }, [])

  // Floating amber-gold back chevron — the only navigation element (Part 12).
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
      {chevron}
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

  // Build the scroll: Origin cover, then standard entries with year dividers.
  let lastYear: string | null = origin?.display_date ? yearOf(origin.display_date) : null

  return shell(
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
            {origin.photo_url && (
              <img
                src={origin.photo_url} alt="" aria-hidden
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                style={{ display: 'block', width: '100%', height: 230, objectFit: 'cover' }}
              />
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

        return (
          <div key={e.id}>
            {showYear && (
              <div style={{ position: 'relative', paddingLeft: CARD_LEFT, height: 52, display: 'flex', alignItems: 'center' }}>
                {/* thread passes behind the year marker */}
                <div style={{ position: 'absolute', left: SPINE_LEFT, top: 0, bottom: 0, width: 2, background: COLOR_TIMELINE_RULE, transform: 'translateX(-50%)' }} />
                <span style={{ fontFamily: FONT_UI, fontSize: 22, fontWeight: 800, letterSpacing: '0.04em', color: COLOR_TIMELINE_YEAR, fontVariantNumeric: 'tabular-nums' }}>
                  {year}
                </span>
              </div>
            )}

            <div style={{ position: 'relative', paddingLeft: CARD_LEFT, paddingBottom: 18 }}>
              {/* connecting thread segment (stop short on the very last entry) */}
              <div style={{ position: 'absolute', left: SPINE_LEFT, top: 0, bottom: isLast ? 'auto' : 0, height: isLast ? 22 : undefined, width: 2, background: COLOR_TIMELINE_RULE, transform: 'translateX(-50%)' }} />
              {/* node on the thread, colored by entry type */}
              <div style={{ position: 'absolute', left: SPINE_LEFT, top: 16, width: NODE_SIZE, height: NODE_SIZE, borderRadius: '50%', background: accent, border: `2px solid ${COLOR_TIMELINE_BG}`, transform: 'translateX(-50%)' }} />

              <Reveal>
                <article
                  onClick={() => navigate(`/timeline/entry/${e.id}`)}
                  style={{
                    background: COLOR_TIMELINE_CARD,
                    borderRadius: RADIUS_TIMELINE_CARD,
                    borderLeft: `3px solid ${accent}`,
                    overflow: 'hidden',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
                    cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <div style={{ padding: '12px 14px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontFamily: FONT_UI, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: COLOR_TIMELINE_MUTED }}>
                        {TYPE_META[type]?.label ?? type}
                      </span>
                      <span style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 600, color: COLOR_TIMELINE_MUTED, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {fmtDate(e.display_date)}
                      </span>
                    </div>
                    <div style={{ marginTop: 3, fontFamily: FONT_UI, fontSize: 15, fontWeight: 700, color: COLOR_TIMELINE_TEXT, lineHeight: 1.3 }}>
                      {entryTitle(e, e.session_id ? meta[e.session_id] : undefined)}
                    </div>
                  </div>

                  {e.photo_url && (
                    <img
                      src={e.photo_url} alt="" aria-hidden
                      onError={ev => { (ev.currentTarget as HTMLImageElement).style.display = 'none' }}
                      style={{ display: 'block', width: '100%', height: 160, objectFit: 'cover', marginTop: 12 }}
                    />
                  )}

                  <div style={{ padding: e.journal_entry ? '8px 14px 14px' : '0 14px 14px' }}>
                    {e.journal_entry && (
                      <p style={{
                        margin: 0, fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 500,
                        fontSize: 15, lineHeight: 1.45, color: COLOR_TIMELINE_TEXT,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>
                        {e.journal_entry}
                      </p>
                    )}
                  </div>
                </article>
              </Reveal>
            </div>
          </div>
        )
      })}
    </div>,
  )
}
