// Route: /builds/:username/timeline — read-only public mirror of the owner's
// Timeline (the parchment build story), matching the private TimelinePage
// redesign: full-bleed Origin hero with the story below, soft chapter years,
// the living-thread orb, ambient warmth, and substantive session cards.
//
// Differences from the private page (deliberate): NO cinematic Overture (that
// belongs to the owner's home-map dive), NO "the story continues" closing beat
// (a visitor can't add entries), NO upload / FAB. Cards drill into the public
// entry detail.
//
// Resolves which car to show from `public_car_profiles` (username + optional
// ?car=<id>). All queries are anon-RLS gated — timeline_entries are visible
// only when the car is public AND show_timeline_publicly is true (migration
// 053). Session/job enrichment degrades gracefully when the Build Sheet section
// is private.

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ArrivalFade from '../components/ArrivalFade'
import TimelineOverture from '../components/TimelineOverture'
import { playThreadTick } from '../lib/sound'
import { milesToUnit, asMileageUnit } from '../lib/mileage'
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

// One-shot flag set by the public map dive; remembers scroll on entry drill-in.
const OVERTURE_KEY = 'gdim_pub_tl_overture'
const SCROLL_KEY = 'gdim_pub_tl_scroll'

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
  display_date: string
  session_id: string | null
}

type SessionMeta = { title: string | null; shop: string | null; jobNames: string[]; mileage: number | null; photo: string | null }

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

// The card's text model — surfaces what's actually inside instead of "N jobs".
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

export default function PublicTimelinePage() {
  const { username } = useParams<{ username: string }>()
  const navigate = useNavigate()
  const carParam = new URLSearchParams(window.location.search).get('car')

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [carId, setCarId] = useState<string | null>(null)
  const [carMileageUnit, setCarMileageUnit] = useState('mi')
  const [origin, setOrigin] = useState<OriginCard | null>(null)
  const [pressedId, setPressedId] = useState<string | null>(null)
  const [entries, setEntries] = useState<TLEntry[]>([])
  const [meta, setMeta] = useState<Record<string, SessionMeta>>({})
  const [carName, setCarName] = useState('This Build')

  // Cinematic Overture on a fresh dive from the public map (flag consumed once).
  const [arrival, setArrival] = useState<'overture' | 'fade' | 'none'>(() => {
    try {
      if (sessionStorage.getItem(OVERTURE_KEY) === '1') { sessionStorage.removeItem(OVERTURE_KEY); return 'overture' }
    } catch { /* ignore */ }
    return 'fade'
  })
  const [settled, setSettled] = useState(() => {
    if (arrival !== 'overture') return true
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    let active = true
    ;(async () => {
      if (!username) { setNotFound(true); setLoading(false); return }
      const { data } = await supabase
        .from('public_car_profiles')
        .select('id, active_car_id, purchase_story, purchase_date, created_at, show_timeline_publicly, mileage_unit, nickname, year, model, variant')
        .eq('username', username)
      if (!active) return
      const rows = (data as Array<{
        id: string; active_car_id: string | null
        purchase_story: string | null; purchase_date: string | null; created_at: string | null
        show_timeline_publicly: boolean | null; mileage_unit: string | null
        nickname: string | null; year: number | null; model: string | null; variant: string | null
      }> | null) ?? []
      const activeId = rows[0]?.active_car_id
      const car = (carParam ? rows.find(r => r.id === carParam) : null)
        ?? rows.find(r => r.id === activeId) ?? rows[0] ?? null
      if (!car || car.show_timeline_publicly === false) { setNotFound(true); setLoading(false); return }
      setCarId(car.id)
      if (car.mileage_unit) setCarMileageUnit(car.mileage_unit)
      const fullName = [car.year, car.model, car.variant].filter(Boolean).join(' ').trim()
      setCarName(car.nickname?.trim() || fullName || 'This Build')

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
      setLoading(false)   // show timeline immediately; enrichment fills in below

      // Enrich session-derived entries (best-effort — gated by anon RLS).
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
    })()
    return () => { active = false }
  }, [username, carParam])

  const back = () => navigate(`/builds/${username}${carId ? `?car=${carId}` : ''}`)

  // ── Living thread + hero parallax (scroll-driven, ref-mutated; no re-render) ──
  const scrollRef = useRef<HTMLDivElement>(null)
  const heroRef = useRef<HTMLImageElement>(null)
  const colRef = useRef<HTMLDivElement>(null)
  const orbRef = useRef<HTMLDivElement>(null)
  const passedRef = useRef(-1)
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

    // Park on node CENTERS (dot is NODE_SIZE tall at top:16) so the orb lands
    // squarely on a node. Map progress to the ENTRIES' own scroll span — not
    // total scroll — so the tall hero above doesn't pre-advance it.
    const NODE_C = 16 + NODE_SIZE / 2
    const firstRect = nodes[0].getBoundingClientRect()
    const lastRect = nodes[nodes.length - 1].getBoundingClientRect()
    const firstInCol = firstRect.top - colRect.top + NODE_C
    const lastInCol = lastRect.top - colRect.top + NODE_C
    const scrollTop = container.scrollTop
    const scrollMax = container.scrollHeight - container.clientHeight
    const ref = container.clientHeight * 0.42
    const startScroll = (firstRect.top - cRect.top + scrollTop) - ref
    const endScroll = Math.min((lastRect.top - cRect.top + scrollTop) - ref, scrollMax - 28)
    const frac = Math.min(1, Math.max(0, (scrollTop - startScroll) / Math.max(1, endScroll - startScroll)))
    const orbInCol = firstInCol + frac * (lastInCol - firstInCol)
    orb.style.top = `${orbInCol.toFixed(1)}px`

    const entered = firstRect.top < cRect.top + container.clientHeight * 0.92
    orb.style.opacity = entered ? '1' : '0'

    let passed = 0
    nodes.forEach(n => { if (n.getBoundingClientRect().top - colRect.top + NODE_C <= orbInCol + 0.5) passed++ })
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

  useEffect(() => {
    if (loading) return
    const id = requestAnimationFrame(updateThread)
    const onResize = () => updateThread()
    window.addEventListener('resize', onResize)
    return () => { cancelAnimationFrame(id); window.removeEventListener('resize', onResize) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, entries.length])

  // Save scroll on entry drill-in; restore it on return (skipped on a fresh dive).
  const saveScroll = () => {
    try { sessionStorage.setItem(SCROLL_KEY, String(scrollRef.current?.scrollTop ?? 0)) } catch { /* ignore */ }
  }
  const restoredRef = useRef(false)
  useEffect(() => {
    if (loading || restoredRef.current) return
    restoredRef.current = true
    let saved = 0
    try { saved = Number(sessionStorage.getItem(SCROLL_KEY)) || 0; sessionStorage.removeItem(SCROLL_KEY) } catch { /* ignore */ }
    if (arrival === 'overture' || saved <= 0) return
    const apply = () => { if (scrollRef.current) scrollRef.current.scrollTop = saved }
    requestAnimationFrame(() => { apply(); requestAnimationFrame(apply) })
    const t = window.setTimeout(apply, 340)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  // Overture stats line: "N entries · YYYY – now"
  const oStartYear = origin?.display_date ? yearOf(origin.display_date)
    : (entries[0] ? yearOf(entries[0].display_date) : null)
  const oLast = entries[entries.length - 1]
  const oEndNum = oLast ? Number(yearOf(oLast.display_date)) : (oStartYear ? Number(oStartYear) : null)
  const oNow = new Date().getFullYear()
  const oCount = entries.length + (origin ? 1 : 0)
  const oRange = oStartYear
    ? (oEndNum && oEndNum >= oNow ? `${oStartYear} – now`
        : (oEndNum && String(oEndNum) !== oStartYear ? `${oStartYear} – ${oEndNum}` : oStartYear))
    : ''
  const overtureSubtitle = [
    oCount > 0 ? `${oCount} ${oCount === 1 ? 'entry' : 'entries'}` : '',
    oRange,
  ].filter(Boolean).join('   ·   ')

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
    <div
      ref={scrollRef}
      onScroll={onScroll}
      style={{
        height: '100dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        background: COLOR_TIMELINE_BG, fontFamily: FONT_UI, position: 'relative',
        maxWidth: 440, margin: '0 auto',
      }}
    >
      {/* Arrival: cinematic Overture on a fresh dive from the public map; plain fade otherwise */}
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

  // Start null (not the origin year) so the entries section always opens with its
  // first chapter year — even when the first entries share the origin's year.
  let lastYear: string | null = null

  return shell(
    <div style={{
      position: 'relative', zIndex: 2,
      transform: settled ? 'none' : 'translateY(30px) scale(1.04)',
      opacity: settled ? 1 : 0,
      transformOrigin: '50% 0',
      transition: settled ? `transform 900ms ${EASING_SETTLE}, opacity 700ms ${EASING_SETTLE}` : 'none',
    }}>
      {/* ── Origin hero — full-bleed magazine opener (read-only) ── */}
      {origin && (
        <Reveal>
          {origin.photo_url ? (
            <>
            <section style={{
              position: 'relative', width: '100%', height: '54vh', minHeight: 320, maxHeight: 500,
              overflow: 'hidden', background: '#0a0805',
            }}>
              <div ref={heroRef} style={{ position: 'absolute', left: 0, right: 0, top: '-12%', bottom: '-12%', willChange: 'transform' }}>
                <img
                  src={origin.photo_url} alt="" aria-hidden className="tl-ken"
                  style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 120, pointerEvents: 'none',
                background: 'linear-gradient(180deg, rgba(10,8,5,0.5) 0%, rgba(10,8,5,0) 100%)' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '40%', pointerEvents: 'none',
                background: 'linear-gradient(180deg, rgba(10,8,5,0) 0%, rgba(10,8,5,0.64) 100%)' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 24px 20px' }}>
                <div style={{
                  fontFamily: FONT_UI, fontSize: 11, fontWeight: 800, letterSpacing: '0.2em',
                  textTransform: 'uppercase', color: COLOR_TIMELINE_CHEVRON, textShadow: '0 1px 12px rgba(0,0,0,0.7)',
                }}>
                  Where it began{origin.display_date ? ` · ${fmtDate(origin.display_date)}` : ''}
                </div>
              </div>
            </section>
            <div style={{ maxWidth: CANVAS_W, margin: '0 auto', padding: '28px 26px 6px' }}>
              <div aria-hidden style={{ width: 40, height: 2, background: COLOR_TIMELINE_CHEVRON, opacity: 0.7, marginBottom: 18 }} />
              <p style={{
                margin: 0, fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 500,
                fontSize: 21, lineHeight: 1.6, color: COLOR_TIMELINE_TEXT,
              }}>
                {origin.story || 'Every build starts somewhere.'}
              </p>
            </div>
            </>
          ) : (
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
                margin: '0 auto', maxWidth: 320, fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 500,
                fontSize: 22, lineHeight: 1.45, color: COLOR_TIMELINE_TEXT,
              }}>
                {origin.story || 'Every build starts somewhere.'}
              </p>
            </section>
          )}
        </Reveal>
      )}

      {/* ── Entries column ── */}
      <div ref={colRef} style={{ position: 'relative', maxWidth: CANVAS_W, margin: '0 auto', padding: `${origin ? 30 : 64}px 20px 48px` }}>

      {/* Living thread orb (visual; the tick is silent unless the visitor has UI sounds on) */}
      {entries.length > 0 && (
        <div ref={orbRef} aria-hidden style={{
          position: 'absolute', left: 20 + SPINE_LEFT, top: 0, width: 0, height: 0,
          opacity: 0, transition: 'opacity 320ms ease', pointerEvents: 'none', zIndex: 3,
        }}>
          <div style={{
            position: 'absolute', left: -1.5, bottom: 0, width: 3, height: 150, borderRadius: 2,
            background: 'linear-gradient(to top, rgba(245,224,178,0.8) 0%, rgba(245,224,178,0.3) 40%, rgba(245,224,178,0) 100%)',
          }} />
          <div className="tl-orb-dot" style={{
            position: 'absolute', left: -6, top: -6, width: 12, height: 12, borderRadius: '50%',
            background: '#fdf2de', boxShadow: '0 0 10px 3px rgba(240,212,160,0.8)',
          }} />
        </div>
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
        const ct = cardText(e, m, carMileageUnit)

        return (
          <div key={e.id}>
            {showYear && (
              <div style={{ position: 'relative', paddingLeft: CARD_LEFT, paddingTop: 18, height: 84, display: 'flex', alignItems: 'center', gap: 14, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: SPINE_LEFT, top: 0, bottom: 0, width: 2, background: COLOR_TIMELINE_RULE, transform: 'translateX(-50%)' }} />
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
                  data-sfx="tick"
                  onClick={() => { saveScroll(); navigate(`/builds/${username}/timeline/entry/${e.id}${carParam ? `?car=${carParam}` : ''}`) }}
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
                      <div style={{
                        marginTop: 3, fontFamily: FONT_UI, fontSize: 15, fontWeight: 700, color: COLOR_TIMELINE_TEXT, lineHeight: 1.3,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>
                        {ct.title}
                      </div>
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
      </div>
    </div>,
  )
}
