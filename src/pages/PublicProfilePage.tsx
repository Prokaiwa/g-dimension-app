// Route: /builds/:username — Public Profile (the ONLY non-authenticated route).
//
// "Stepping into someone's world": a read-only mirror of the owner's Home map,
// re-skinned so a visitor knows they're a guest — a LIGHT cool-grey map (vs the
// owner's dark one), graphite wedge header, burgundy driver dot, "Leave"
// top-left, date chip + "Visiting @username" top-right. Maintenance is never
// exposed here.
//
// ADAPTIVE map: a node only appears when the owner has content behind it.
// One designed layout template per node count (1–5).
// Node taps are stubbed — read-only sub-screens are the next build.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  ICON_HOME, ICON_TUNING, ICON_TIMELINE, iconFeatured,
} from '../lib/destinationIcons'
import {
  COLOR_BRAND,
  FONT_UI,
  HEADER_HEIGHT,
  HEADER_WEDGE_LEFT,
  HEADER_WEDGE_RIGHT,
  COLOR_HEADER_BLACK,
  ICON_WRAPPER_FOCAL,
  ICON_WRAPPER_STANDARD,
  FOCAL_UNDERLINE_W,
  FOCAL_UNDERLINE_H,
  EASING_SETTLE,
} from '../tokens'

const _now        = new Date()
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_LABEL = MONTHS[_now.getMonth()]
const DAY_LABEL   = String(_now.getDate())

// ── Map geometry ────────────────────────────────────────────────────────────
type Pt = { x: number; y: number }

// Visual icon radii (the rendered icon is 85% of its wrapper)
const VIS_FOCAL = ICON_WRAPPER_FOCAL   * 0.85 / 2 // ~51
const VIS_STD   = ICON_WRAPPER_STANDARD * 0.85 / 2 // ~36.5
const TUCK = 13 // pull the road anchor inside the icon so the end hides under it

// Roads exit/enter from the SIDE of a node (left or right edge, at centre
// height) — never straight down through the label below — and tuck under the
// icon so they visibly connect to "the house".
function sideAnchor(node: Pt, other: Pt, vis: number): Pt {
  const side = other.x >= node.x ? 1 : -1
  return { x: node.x + side * (vis - TUCK), y: node.y }
}

function road(a: Pt, b: Pt, bend: number): string {
  const dx = b.x - a.x, dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len, ny = dx / len
  const c1 = { x: a.x + dx * 0.33 + nx * bend, y: a.y + dy * 0.33 + ny * bend }
  const c2 = { x: a.x + dx * 0.66 - nx * bend, y: a.y + dy * 0.66 - ny * bend }
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} C ${c1.x.toFixed(1)} ${c1.y.toFixed(1)}, ${c2.x.toFixed(1)} ${c2.y.toFixed(1)}, ${b.x.toFixed(1)} ${b.y.toFixed(1)}`
}

type Edge = { a: number; b: number; bend: number; pathFn?: (a: Pt, b: Pt) => string }
type Template = { nodes: Pt[]; radii: number[]; edges: Edge[] }

const TEMPLATES: Record<number, Template> = {
  1: { nodes: [{ x: 195, y: 408 }], radii: [VIS_FOCAL], edges: [] },
  2: {
    nodes: [{ x: 146, y: 250 }, { x: 254, y: 560 }],
    radii: [VIS_FOCAL, VIS_STD],
    edges: [{ a: 0, b: 1, bend: -64 }],
  },
  3: {
    nodes: [{ x: 195, y: 234 }, { x: 96, y: 556 }, { x: 298, y: 556 }],
    radii: [VIS_FOCAL, VIS_STD, VIS_STD],
    edges: [{ a: 0, b: 1, bend: 50 }, { a: 0, b: 2, bend: -50 }, { a: 1, b: 2, bend: 40 }],
  },
  4: {
    // Diamond: Garage top-center, Build Sheet right, Timeline left, Featured bottom.
    // Both Garage roads fork from the BOTTOM of the Garage icon (195, 233) so
    // they appear to share a single departure point — like a fork in the road.
    // Timeline moved down to y=490 so it sits below the two converging road ends.
    nodes: [
      { x: 195, y: 155 },  // 0: Garage (focal)
      { x: 322, y: 360 },  // 1: Build Sheet (right)
      { x: 68,  y: 450 },  // 2: Timeline (left, moved down)
      { x: 195, y: 605 },  // 3: Featured (bottom)
    ],
    radii: [VIS_FOCAL, VIS_STD, VIS_STD, VIS_STD],
    edges: [
      // Eau Rouge / Raidillon (Spa): exits Garage bottom, sweeps hard right,
      // arcs back to Build Sheet's left entrance.
      { a: 0, b: 1, bend: 0,
        pathFn: (_a, b) =>
          `M 195 193 C 370 200, 392 310, ${b.x} ${b.y}` },
      // Monaco Hairpin: smooth compound bezier (C1 continuity at junction).
      // Both Garage roads share (195,193); Monaco ends at Timeline CENTER (68,450)
      // so the dot and road tuck cleanly behind the icon — same arrival point
      // the Pouhon departs from, giving Timeline a single road junction point.
      { a: 0, b: 2, bend: 0,
        pathFn: () =>
          `M 195 193 C 18 188, 10 295, 15 345 C 20 395, 62 448, 68 450` },
      // Bus Stop Chicane: unchanged.
      { a: 1, b: 3, bend: 0,
        pathFn: (a, b) =>
          `M ${a.x} ${a.y} C 118 432, 358 525, ${b.x} ${b.y}` },
      // Pouhon: departs from Timeline CENTER (same as Monaco arrival) so the
      // road tucks fully behind the icon. CP1 pushed hard left (-60) so the
      // arc clears the TIMELINE label (which sits just below the icon) before
      // sweeping right to Featured.
      { a: 2, b: 3, bend: 0,
        pathFn: (_a, b) =>
          `M 68 450 C -60 468, 70 592, ${b.x} ${b.y}` },
    ],
  },
  5: {
    nodes: [
      { x: 195, y: 230 }, { x: 308, y: 364 }, { x: 82, y: 390 },
      { x: 294, y: 604 }, { x: 108, y: 598 },
    ],
    radii: [VIS_FOCAL, VIS_STD, VIS_STD, VIS_STD, VIS_STD],
    edges: [
      { a: 0, b: 1, bend: 42 }, { a: 0, b: 2, bend: -42 },
      { a: 1, b: 3, bend: 52 }, { a: 2, b: 4, bend: 48 }, { a: 3, b: 4, bend: -40 },
    ],
  },
}

const STAGGER_MS = [380, 500, 560, 660, 720]

// Subtle dark grain on the light map (inlined — no network request)
const GRAIN_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='1.4' numOctaves='2' seed='11' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.1  0 0 0 0 0.12  0 0 0 0 0.16  0 0 0 0 0.05 0'/></filter><rect width='100%' height='100%' filter='url(#g)'/></svg>`
const GRAIN_URL = `url("data:image/svg+xml,${encodeURIComponent(GRAIN_SVG)}")`

type NodeDef = { id: string; label: string; icon: string; focal?: boolean }

// Canonical node order for the ?preview=N dev override (slot 0 = focal Garage)
const PREVIEW_NODES: NodeDef[] = [
  { id: 'garage',     label: 'Garage',      icon: ICON_HOME,     focal: true },
  { id: 'buildsheet', label: 'Build Sheet', icon: ICON_TUNING },
  { id: 'timeline',   label: 'Timeline',    icon: ICON_TIMELINE },
  { id: 'featured',   label: 'Featured',    icon: iconFeatured },
  { id: 'guides',     label: 'Guides',      icon: ICON_TUNING },
]

interface CarRow {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  city: string | null
  country: string | null
  garage_photo_url: string | null
  original_photo_url: string | null
  featured_story: string | null
  show_featured_publicly: boolean | null
  active_car_id: string | null
  created_at: string | null
}

export default function PublicProfilePage() {
  const { username } = useParams<{ username: string }>()
  const navigate = useNavigate()

  const [state, setState] = useState<'loading' | 'ready' | 'empty'>('loading')
  const [_car, setCar] = useState<CarRow | null>(null)
  const [nodes, setNodes] = useState<NodeDef[]>([])
  const [pressedNode, setPressedNode] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const stageRef   = useRef<HTMLDivElement>(null)
  const worldRef   = useRef<HTMLDivElement>(null)
  const compassRef = useRef<HTMLDivElement>(null)
  const driverRef  = useRef<SVGGElement>(null)
  const roadElsRef = useRef<(SVGPathElement | null)[]>([])
  const rafRef     = useRef<number>(0)

  // ── Fetch ──
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!username) { setState('empty'); return }
      const { data, error } = await supabase
        .from('public_car_profiles')
        .select('*')
        .eq('username', username)
        .order('created_at', { ascending: false })
      if (cancelled) return
      const rows = (data as CarRow[] | null) ?? []
      // Prefer the owner's chosen primary (active) car; fall back to newest.
      const activeId = rows[0]?.active_car_id
      const row = rows.find(r => r.id === activeId) ?? rows[0] ?? null
      if (error || !row) { setState('empty'); return }

      const [jobs, tl] = await Promise.all([
        supabase.from('jobs').select('id')
          .eq('car_id', row.id).eq('status', 'installed').limit(1),
        supabase.from('timeline_entries').select('id')
          .eq('car_id', row.id).limit(1),
      ])
      if (cancelled) return

      const hasBuildsheet = (jobs.data?.length ?? 0) > 0
      const hasTimeline   = (tl.data?.length ?? 0) > 0

      // Build Sheet / Timeline auto-hide via RLS (no rows when the section is
      // private). Featured has no probe query, so gate it on the flag
      // (defaults to visible if the column predates migration 053).
      const featuredShared = row.show_featured_publicly !== false
      const hasFeatured = featuredShared && !!(row.garage_photo_url || row.original_photo_url || row.featured_story)
      const built: NodeDef[] = [
        { id: 'garage', label: 'Garage', icon: ICON_HOME, focal: true },
      ]
      if (hasBuildsheet) built.push({ id: 'buildsheet', label: 'Build Sheet', icon: ICON_TUNING })
      if (hasTimeline)   built.push({ id: 'timeline',   label: 'Timeline',    icon: ICON_TIMELINE })
      if (hasFeatured)   built.push({ id: 'featured',   label: 'Featured',    icon: iconFeatured })

      // ?preview=N forces a node count so each layout template (2–5) can be
      // previewed on the live site regardless of the build's actual content.
      const preview = Number(new URLSearchParams(window.location.search).get('preview'))
      const final = preview >= 1 && preview <= 5
        ? PREVIEW_NODES.slice(0, preview)
        : built

      setCar(row)
      setNodes(final)
      setState('ready')
    })()
    return () => { cancelled = true }
  }, [username])

  const template = useMemo(
    () => TEMPLATES[Math.min(5, Math.max(1, nodes.length))] ?? TEMPLATES[1],
    [nodes.length],
  )

  const adjacency = useMemo(() => {
    const adj: number[][] = template.nodes.map(() => [])
    template.edges.forEach((e, i) => { adj[e.a].push(i); adj[e.b].push(i) })
    return adj
  }, [template])

  const roadPaths = useMemo(() =>
    template.edges.map(e => {
      const na = template.nodes[e.a], nb = template.nodes[e.b]
      const a = sideAnchor(na, nb, template.radii[e.a])
      const b = sideAnchor(nb, na, template.radii[e.b])
      return e.pathFn ? e.pathFn(a, b) : road(a, b, e.bend)
    }),
    [template],
  )

  // ── Parallax + driver dot ──
  useEffect(() => {
    if (state !== 'ready') return
    const world = worldRef.current
    const stage = stageRef.current
    if (!world || !stage) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let rect = stage.getBoundingClientRect()
    const onResize = () => { rect = stage.getBoundingClientRect() }
    window.addEventListener('resize', onResize)

    let targetPX = 0, targetPY = 0, curPX = 0, curPY = 0
    const onMove = (e: MouseEvent) => {
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2
      targetPX = Math.max(-1, Math.min(1, (e.clientX - cx) / (rect.width  / 2)))
      targetPY = Math.max(-1, Math.min(1, (e.clientY - cy) / (rect.height / 2)))
    }
    const onLeave = () => { targetPX = 0; targetPY = 0 }
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma === null || e.beta === null) return
      targetPX = Math.max(-1, Math.min(1, e.gamma / 45))
      targetPY = Math.max(-1, Math.min(1, (e.beta - 45) / 45))
    }
    stage.addEventListener('mousemove', onMove as EventListener)
    stage.addEventListener('mouseleave', onLeave)
    window.addEventListener('deviceorientation', onTilt as EventListener)

    const driver = {
      mode: 'dwell' as 'dwell' | 'drive',
      node: 0, until: 0, edge: -1, lastEdge: -1, dir: 1 as 1 | -1,
      dist: 0, len: 0, cruise: 0, opacity: 0,
    }
    let lastT = 0
    const tick = (t: number) => {
      const dt = lastT === 0 ? 0 : Math.min(0.05, (t - lastT) / 1000)
      lastT = t
      const swayX = reduced ? 0 : Math.sin((t / 11000) * Math.PI * 2) * 0.2
      const swayY = reduced ? 0 : Math.sin((t / 17000) * Math.PI * 2 + 2.1) * 0.16
      curPX += (targetPX + swayX - curPX) * 0.08
      curPY += (targetPY + swayY - curPY) * 0.08
      world.style.transform =
        `rotateX(${(8 + curPY * 2).toFixed(3)}deg) rotateY(${(-curPX * 3).toFixed(3)}deg) translate3d(${(-curPX * 5).toFixed(2)}px, ${(-curPY * 4).toFixed(2)}px, 0)`
      if (compassRef.current && !reduced)
        compassRef.current.style.transform = `rotate(${(curPX * 4).toFixed(2)}deg)`

      const dot = driverRef.current
      if (dot && !reduced && template.edges.length > 0) {
        if (driver.mode === 'dwell') {
          if (driver.until === 0) driver.until = t + 2200
          if (t >= driver.until) {
            const opts = adjacency[driver.node] ?? []
            const pool = opts.length > 1 && driver.lastEdge >= 0
              ? opts.filter(e => e !== driver.lastEdge) : opts
            const edgeIdx = pool[Math.floor(Math.random() * pool.length)] ?? opts[0]
            const el = roadElsRef.current[edgeIdx]
            if (el != null && edgeIdx != null) {
              driver.edge = edgeIdx
              driver.dir  = template.edges[edgeIdx].a === driver.node ? 1 : -1
              driver.len  = el.getTotalLength()
              driver.dist = 0
              driver.cruise = 30 + Math.random() * 26
              driver.mode = 'drive'
            } else { driver.until = t + 1000 }
          }
        } else if (driver.edge >= 0) {
          const el = roadElsRef.current[driver.edge]
          const rampIn  = Math.min(1, driver.dist / 36)
          const rampOut = Math.min(1, (driver.len - driver.dist) / 52)
          driver.dist += driver.cruise * Math.max(0.12, Math.min(rampIn, rampOut)) * dt
          if (driver.dist >= driver.len) {
            driver.dist = driver.len
            const e = template.edges[driver.edge]
            driver.node = driver.dir === 1 ? e.b : e.a
            driver.lastEdge = driver.edge
            driver.edge = -1
            driver.mode = 'dwell'
            driver.until = t + 1600 + Math.random() * 3200
          }
          if (el) {
            const s = driver.dir === 1 ? driver.dist : driver.len - driver.dist
            const p = el.getPointAtLength(s)
            dot.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`)
          }
        }
        driver.opacity += ((driver.mode === 'drive' ? 1 : 0) - driver.opacity) * 0.07
        dot.setAttribute('opacity', driver.opacity.toFixed(3))
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', onResize)
      stage.removeEventListener('mousemove', onMove as EventListener)
      stage.removeEventListener('mouseleave', onLeave)
      window.removeEventListener('deviceorientation', onTilt as EventListener)
    }
  }, [state, template, adjacency])

  const toastTimerRef = useRef<number>(0)
  const onNodeTap = (n: NodeDef) => {
    setToast(`${n.label} — opening soon`)
    window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(null), 1600)
  }

  const leave = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/')
  }

  // ── Loading / empty states ──
  if (state !== 'ready') {
    return (
      <div style={{
        minHeight: '100dvh',
        background: 'radial-gradient(ellipse at center, #e9ebf0 0%, #cdd2db 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 14, padding: 24, textAlign: 'center',
      }}>
        <style>{`@keyframes pubspin{to{transform:rotate(360deg)}}`}</style>
        {state === 'loading' ? (
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            border: `2.5px solid rgba(60,70,90,0.15)`, borderTopColor: COLOR_BRAND,
            animation: 'pubspin 750ms linear infinite',
          }} />
        ) : (
          <>
            <div style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 17, color: '#2a2e36' }}>
              No public build here
            </div>
            <div style={{ fontFamily: FONT_UI, fontSize: 13, color: '#717784', maxWidth: 260, lineHeight: 1.5 }}>
              {username ? `@${username} hasn't shared a build yet, or this garage is private.` : 'This garage is private.'}
            </div>
            <button onClick={leave} style={{
              marginTop: 8, padding: '9px 18px', borderRadius: 10, border: 'none',
              background: COLOR_BRAND, color: '#f5f0ea', fontFamily: FONT_UI,
              fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', cursor: 'pointer',
            }}>Leave</button>
          </>
        )}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#050507', position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @keyframes pubWorldIn { 0%{opacity:0;transform:rotateX(11deg) scale(0.95)} 100%{opacity:1;transform:rotateX(8deg) scale(1)} }
        @keyframes pubDestIn  { 0%{opacity:0;transform:translate(-50%,-40%)} 100%{opacity:1;transform:translate(-50%,-50%)} }
        @keyframes pubRoadDraw { from{stroke-dashoffset:1} to{stroke-dashoffset:0} }
        @keyframes pubDashIn   { from{opacity:0} to{opacity:1} }
        @keyframes pubDashFlow { from{stroke-dashoffset:0} to{stroke-dashoffset:-60} }
        @keyframes pubPulse    { 0%,100%{opacity:0.2;transform:scale(1)} 50%{opacity:0.55;transform:scale(1.05)} }
        @keyframes pubFooterIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pubSheen    { from{transform:translateX(-160%) skewX(-18deg)} to{transform:translateX(420%) skewX(-18deg)} }
        @keyframes pubCompass  { 0%{transform:rotate(-130deg)} 55%{transform:rotate(12deg)} 78%{transform:rotate(-5deg)} 100%{transform:rotate(0deg)} }
        @media (prefers-reduced-motion: reduce){ .pub-amb{animation:none !important} }
      `}</style>

      {/* ── Header — graphite wedges (same shape as home), darker toward the centre V ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: HEADER_HEIGHT, zIndex: 10, overflow: 'hidden',
      }}>
        <svg viewBox="0 0 390 44" preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <defs>
            {/* Left wedge: lighter at the outer edge → darker toward the centre V */}
            <linearGradient id="pubHdrL" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor="#3c4452" />
              <stop offset="100%" stopColor="#15171d" />
            </linearGradient>
            {/* Right wedge: darker at the centre V → lighter at the outer edge */}
            <linearGradient id="pubHdrR" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor="#15171d" />
              <stop offset="100%" stopColor="#3c4452" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="390" height="44" fill={COLOR_HEADER_BLACK} />
          <path d={HEADER_WEDGE_LEFT}  fill="url(#pubHdrL)" />
          <path d={HEADER_WEDGE_RIGHT} fill="url(#pubHdrR)" />
        </svg>

        {/* One-time sheen sweep on entry */}
        <div style={{
          position: 'absolute', top: '-20%', left: 0, width: '36%', height: '140%',
          background: 'linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.04) 30%, rgba(255,255,255,0.13) 50%, rgba(255,255,255,0.04) 70%, transparent 100%)',
          transform: 'translateX(-160%) skewX(-18deg)',
          animation: 'pubSheen 900ms cubic-bezier(0.4,0,0.2,1) 1100ms both',
          pointerEvents: 'none',
        }} />

        {/* Leave — top-left, same position as the back chevron on sub-screens */}
        <div onClick={leave} style={{
          position: 'absolute', left: 6, top: 0, height: '100%',
          display: 'flex', alignItems: 'center', gap: 4, padding: '0 10px',
          cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
        }}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
            stroke="rgba(224,230,240,0.9)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span style={{
            fontFamily: FONT_UI, fontWeight: 700, fontSize: 13,
            color: 'rgba(224,230,240,0.9)', letterSpacing: '0.04em',
          }}>Leave</span>
        </div>

        {/* Right: "Visiting @username" + date chip (mirrors the owner's header) */}
        <div style={{
          position: 'absolute', right: 0, top: 0, height: '100%',
          display: 'flex', alignItems: 'center', paddingRight: 14, gap: 0,
        }}>
          <span style={{
            paddingRight: 10,
            fontFamily: FONT_UI, fontWeight: 700, fontSize: 11,
            color: 'rgba(196,206,224,0.75)', letterSpacing: '0.04em',
          }}>
            Visiting @{username}
          </span>
          <div style={{
            background: 'rgba(226,231,240,0.94)', color: '#0d0d0d',
            padding: '4px 7px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11,
            letterSpacing: '0.05em', textTransform: 'uppercase',
            display: 'flex', alignItems: 'center',
          }}>{MONTH_LABEL}</div>
          <div style={{
            background: COLOR_BRAND, color: '#fff',
            padding: '4px 8px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minWidth: DAY_LABEL.length === 1 ? 24 : 30,
          }}>{DAY_LABEL}</div>
        </div>
      </div>

      {/* ── Stage ── */}
      <div
        ref={stageRef}
        style={{
          position: 'absolute', top: HEADER_HEIGHT, left: 0, right: 0, bottom: 0,
          overflow: 'hidden', perspective: '1400px', perspectiveOrigin: '50% 42%',
          touchAction: 'none', overscrollBehavior: 'none',
        }}
      >
        <div
          ref={worldRef}
          style={{
            position: 'absolute', inset: 0,
            animation: `pubWorldIn 800ms ${EASING_SETTLE} both`,
            transformStyle: 'preserve-3d', willChange: 'transform',
          }}
        >
          {/* Light cool-grey base + grain + faint grid */}
          <div style={{
            position: 'absolute', inset: 0,
            background: [
              GRAIN_URL,
              'linear-gradient(rgba(60,70,90,0.04) 1px, transparent 1px)',
              'linear-gradient(90deg, rgba(60,70,90,0.04) 1px, transparent 1px)',
              'linear-gradient(168deg, #eef0f4 0%, #dde1e8 45%, #c7ccd6 80%, #b6bcc8 100%)',
            ].join(', '),
            backgroundSize: '220px 220px, 84px 84px, 84px 84px, 100% 100%',
          }} />

          {/* Soft top light */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 220,
            background: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.6) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          {/* Roads + driver dot */}
          <svg viewBox="0 0 390 800" preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            <defs>
              <filter id="pubGlow" x="-14%" y="-14%" width="128%" height="128%">
                <feGaussianBlur stdDeviation="1.4" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            {roadPaths.map((d, i) => (
              <g key={i}>
                <g fill="none" stroke="rgba(54,62,78,0.5)" strokeLinecap="round" filter="url(#pubGlow)">
                  <path ref={el => { roadElsRef.current[i] = el }}
                    d={d} strokeWidth="2.6" pathLength={1}
                    style={{ strokeDasharray: 1, animation: `pubRoadDraw 650ms ease-out ${360 + i * 60}ms both` }} />
                </g>
                <g fill="none" stroke="rgba(54,62,78,0.3)" strokeWidth="1.1" strokeDasharray="4 7" strokeLinecap="round">
                  <path className="pub-amb" d={d}
                    style={{ animation: `pubDashIn 500ms ease ${980 + i * 60}ms both, pubDashFlow ${9 + i}s linear ${1480 + i * 80}ms infinite` }} />
                </g>
              </g>
            ))}

            {/* Road labels — Cormorant italic, same style as Home */}
            {nodes.length === 4 && (
              <g fontFamily="Cormorant Garamond, serif" fontStyle="italic" fontSize="10"
                 fontWeight="500" fill="rgba(54,62,78,0.58)" letterSpacing="0.8">
                {/* Eau Rouge: label follows the right-sweeping arc */}
                <path id="pub-rl-a" d="M 195 193 C 370 200, 392 310, 298.5 360" fill="none"/>
                <text><textPath href="#pub-rl-a" startOffset="12%">To Build Sheet</textPath></text>
                {/* Monaco Hairpin: label follows exit leg, reversed toward Timeline */}
                <path id="pub-rl-b" d="M 68 450 C 62 448, 20 395, 15 345" fill="none"/>
                <text><textPath href="#pub-rl-b" startOffset="5%">To Timeline</textPath></text>
                {/* Bus Stop: label on the left-dipping entry of the S */}
                <path id="pub-rl-c" d="M 298.5 360 C 118 432, 358 525, 218.5 605" fill="none"/>
                <text><textPath href="#pub-rl-c" startOffset="14%">To Featured</textPath></text>
                {/* Pouhon: subtle label on the arc toward Featured */}
                <path id="pub-rl-d" d="M 68 450 C -60 468, 70 592, 171.5 605" fill="none"/>
                <text><textPath href="#pub-rl-d" startOffset="22%">To Featured</textPath></text>
              </g>
            )}

            {template.edges.length > 0 && (
              <g ref={driverRef} opacity="0">
                <circle r="6" fill="rgba(120,14,18,0.22)" />
                <circle r="2.4" fill={COLOR_BRAND} filter="url(#pubGlow)" />
              </g>
            )}
          </svg>

          {/* Compass — top-right, leans with gyro/mouse like the Home screen */}
          <div ref={compassRef} style={{
            position: 'absolute', top: 14, right: 14,
            width: 42, height: 42, opacity: 0.85, pointerEvents: 'none',
          }}>
            <svg viewBox="0 0 64 64" style={{ width: '100%', height: '100%' }}>
              <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(30,40,55,0.4)" strokeWidth="0.8"/>
              <circle cx="32" cy="32" r="22" fill="none" stroke="rgba(30,40,55,0.25)" strokeWidth="0.5"/>
              <g style={{
                transformOrigin: '32px 32px', transformBox: 'view-box',
                animation: `pubCompass 1100ms ${EASING_SETTLE} 600ms both`,
              }}>
                <path d="M 32 4 L 36 32 L 32 28 L 28 32 Z" fill="rgba(30,40,55,0.6)"/>
                <path d="M 32 60 L 36 32 L 32 36 L 28 32 Z" fill="rgba(30,40,55,0.28)"/>
                <path d="M 4 32 L 32 28 L 28 32 L 32 36 Z" fill="rgba(30,40,55,0.28)"/>
                <path d="M 60 32 L 32 28 L 36 32 L 32 36 Z" fill="rgba(30,40,55,0.28)"/>
              </g>
              <text x="32" y="3" fontFamily="Hanken Grotesk, sans-serif" fontWeight="800"
                fontSize="7" fill="rgba(30,40,55,0.6)" textAnchor="middle">N</text>
            </svg>
          </div>

          {/* Destination nodes */}
          {nodes.map((n, i) => {
            const pos  = template.nodes[i]
            const size = n.focal ? ICON_WRAPPER_FOCAL : ICON_WRAPPER_STANDARD
            return (
              <div
                key={n.id}
                onPointerDown={() => setPressedNode(n.id)}
                onPointerUp={() => { setPressedNode(null); onNodeTap(n) }}
                onPointerCancel={() => setPressedNode(null)}
                style={{
                  position: 'absolute',
                  left: `${(pos.x / 390 * 100).toFixed(2)}%`,
                  top:  `${(pos.y / 800 * 100).toFixed(2)}%`,
                  transform: 'translate(-50%, -50%)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                  touchAction: 'none', userSelect: 'none',
                  animation: `pubDestIn 700ms ${EASING_SETTLE} ${STAGGER_MS[i] ?? 700}ms both`,
                }}
              >
                {n.focal && (
                  <div style={{
                    position: 'absolute', width: 190, height: 190, top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%)',
                    background: 'radial-gradient(circle, rgba(180,185,195,0.35) 0%, transparent 62%)',
                    animation: 'pubPulse 7s ease-in-out infinite', pointerEvents: 'none',
                  }} />
                )}
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  transform: pressedNode === n.id ? 'scale(0.92)' : 'scale(1)',
                  transition: pressedNode === n.id
                    ? 'transform 80ms ease-out'
                    : 'transform 200ms cubic-bezier(0.22,1,0.36,1)',
                }}>
                  <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img src={n.icon} alt={n.label} draggable={false}
                      style={{ width: size * 0.85, height: size * 0.85, objectFit: 'contain', pointerEvents: 'none' }} />
                  </div>
                  {/* Ground shadow */}
                  <div style={{
                    width: size * 0.58, height: 8, marginTop: n.focal ? -6 : -4, borderRadius: '50%',
                    background: 'rgba(30,36,48,0.3)', filter: 'blur(7px)', flexShrink: 0, pointerEvents: 'none',
                  }} />
                  <span style={{
                    fontFamily: FONT_UI, fontWeight: n.focal ? 800 : 700,
                    fontSize: 11,
                    color: n.focal ? '#1b1f26' : '#3a414c',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    textShadow: '0 1px 2px rgba(255,255,255,0.7)',
                    marginTop: 4, pointerEvents: 'none',
                  }}>{n.label}</span>
                  {n.focal && (
                    <div style={{
                      width: FOCAL_UNDERLINE_W, height: FOCAL_UNDERLINE_H,
                      background: COLOR_BRAND, borderRadius: 1, marginTop: 3, opacity: 0.9,
                    }} />
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Faint overlay shade — a gentle uniform tint + vignette, like Home */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3,
          background: 'rgba(28,32,42,0.07)',
        }} />
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3,
          background: 'radial-gradient(ellipse at 50% 46%, transparent 42%, rgba(40,46,60,0.28) 100%)',
        }} />

        {/* Footer wordmark */}
        <div style={{
          position: 'absolute', bottom: 16, left: 0, right: 0, textAlign: 'center',
          zIndex: 5, pointerEvents: 'none', animation: 'pubFooterIn 600ms 1000ms both',
        }}>
          <span style={{
            fontFamily: FONT_UI, fontStyle: 'italic', fontWeight: 900, fontSize: 13,
            color: 'rgba(60,68,84,0.3)', letterSpacing: '-0.1em',
          }}>G‑DIMENSION</span>
        </div>
      </div>

      {/* Toast (until read-only sub-screens land) */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 46, left: '50%', transform: 'translateX(-50%)',
          zIndex: 40, background: 'rgba(28,32,40,0.94)', color: '#e8ecf2',
          padding: '9px 16px', borderRadius: 10, fontFamily: FONT_UI, fontWeight: 700,
          fontSize: 12.5, letterSpacing: '0.03em', boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
          pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>{toast}</div>
      )}
    </div>
  )
}
