// Route: /builds/:username — Public Profile (the ONLY non-authenticated route).
//
// "Stepping into someone's world": a read-only mirror of the owner's Home map,
// deliberately re-skinned so a visitor knows they're a guest — light paper
// background, dark road, burgundy driver dot, graphite header, a "Leave" button
// where the back chevron lives, and a "VISITING" tag instead of the date.
//
// The map is ADAPTIVE: a node only appears when the owner has content behind it
// (a build sheet with mods, a timeline with entries, a Featured cover). The
// layout template is chosen by how many nodes survive that filter (1–5), so a
// bare car reads as an intentional short road, never an empty room. Maintenance
// is never exposed here (sale-context data lives in the build PDF). A future
// Guides node slots in as the 5th.
//
// Node taps are stubbed for now (read-only sub-screens are the next build).
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
  ICON_WRAPPER_FOCAL,
  ICON_WRAPPER_STANDARD,
  FOCAL_UNDERLINE_W,
  FOCAL_UNDERLINE_H,
  RADIUS_AVATAR,
  EASING_SETTLE,
} from '../tokens'

// ── Map geometry ────────────────────────────────────────────────────────────
// A windy S-curve road between two points, bowed perpendicular by `bend` so the
// dashed centreline reads like a mountain pass rather than a straight line.
type Pt = { x: number; y: number }
function road(a: Pt, b: Pt, bend: number): string {
  const dx = b.x - a.x, dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len, ny = dx / len // unit perpendicular
  const c1 = { x: a.x + dx * 0.33 + nx * bend, y: a.y + dy * 0.33 + ny * bend }
  const c2 = { x: a.x + dx * 0.66 - nx * bend, y: a.y + dy * 0.66 - ny * bend }
  return `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`
}

type Edge = { a: number; b: number; bend: number }
type Template = { nodes: Pt[]; edges: Edge[] }

// One designed layout per node count (390×800 viewBox). Slot 0 is always the
// Garage (the focal entry point). Each is intentional on its own — a 2-node
// "pass" should feel exclusive, not broken.
const TEMPLATES: Record<number, Template> = {
  1: { nodes: [{ x: 195, y: 408 }], edges: [] },
  2: {
    nodes: [{ x: 142, y: 256 }, { x: 256, y: 558 }],
    edges: [{ a: 0, b: 1, bend: 74 }],
  },
  3: {
    nodes: [{ x: 195, y: 236 }, { x: 96, y: 560 }, { x: 296, y: 560 }],
    edges: [{ a: 0, b: 1, bend: 52 }, { a: 0, b: 2, bend: -52 }, { a: 1, b: 2, bend: 42 }],
  },
  4: {
    nodes: [{ x: 150, y: 242 }, { x: 296, y: 322 }, { x: 94, y: 566 }, { x: 290, y: 586 }],
    edges: [
      { a: 0, b: 1, bend: 40 }, { a: 0, b: 2, bend: 54 },
      { a: 1, b: 3, bend: 50 }, { a: 2, b: 3, bend: -44 },
    ],
  },
  5: {
    nodes: [
      { x: 195, y: 230 }, { x: 305, y: 366 }, { x: 80, y: 392 },
      { x: 292, y: 606 }, { x: 110, y: 600 },
    ],
    edges: [
      { a: 0, b: 1, bend: 44 }, { a: 0, b: 2, bend: -44 },
      { a: 1, b: 3, bend: 54 }, { a: 2, b: 4, bend: 50 }, { a: 3, b: 4, bend: -40 },
    ],
  },
}

const STAGGER_MS = [380, 500, 560, 660, 720]

// Dark grain on the light paper (inlined — no network request)
const GRAIN_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='1.4' numOctaves='2' seed='7' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0 0.05 0'/></filter><rect width='100%' height='100%' filter='url(#g)'/></svg>`
const GRAIN_URL = `url("data:image/svg+xml,${encodeURIComponent(GRAIN_SVG)}")`

type NodeDef = { id: string; label: string; icon: string; focal?: boolean }

interface CarRow {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  city: string | null
  country: string | null
  year: number | null
  model: string | null
  nickname: string | null
  garage_photo_url: string | null
  original_photo_url: string | null
  featured_story: string | null
  created_at: string | null
}

export default function PublicProfilePage() {
  const { username } = useParams<{ username: string }>()
  const navigate = useNavigate()

  const [state, setState] = useState<'loading' | 'ready' | 'empty'>('loading')
  const [car, setCar] = useState<CarRow | null>(null)
  const [nodes, setNodes] = useState<NodeDef[]>([])
  const [pressedNode, setPressedNode] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const stageRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const driverRef = useRef<SVGGElement>(null)
  const roadElsRef = useRef<(SVGPathElement | null)[]>([])
  const rafRef = useRef<number>(0)
  const parallaxRef = useRef({ px: 0, py: 0 })

  // ── Fetch the build + decide which nodes survive ──
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!username) { setState('empty'); return }
      // public_car_profiles already enforces is_public + soft-delete + the
      // privacy boundary (no costs/VIN/receipts). Newest public car wins.
      const { data, error } = await supabase
        .from('public_car_profiles')
        .select('*')
        .eq('username', username)
        .order('created_at', { ascending: false })
        .limit(1)
      if (cancelled) return
      const row = (data?.[0] as CarRow | undefined) ?? null
      if (error || !row) { setState('empty'); return }

      // Adaptive nodes: only show a room with something in it. Count queries
      // fail closed (a hidden node beats an empty one).
      const [jobs, tl] = await Promise.all([
        supabase.from('jobs').select('id', { count: 'exact', head: true })
          .eq('car_id', row.id).is('deleted_at', null),
        supabase.from('timeline_entries').select('id', { count: 'exact', head: true })
          .eq('car_id', row.id),
      ])
      if (cancelled) return

      const hasFeatured = !!(row.garage_photo_url || row.original_photo_url || row.featured_story)
      const built: NodeDef[] = [
        { id: 'garage', label: 'Garage', icon: ICON_HOME, focal: true },
      ]
      if ((jobs.count ?? 0) > 0) built.push({ id: 'buildsheet', label: 'Build Sheet', icon: ICON_TUNING })
      if ((tl.count ?? 0) > 0) built.push({ id: 'timeline', label: 'Timeline', icon: ICON_TIMELINE })
      if (hasFeatured) built.push({ id: 'featured', label: 'Featured', icon: iconFeatured })

      setCar(row)
      setNodes(built)
      setState('ready')
    })()
    return () => { cancelled = true }
  }, [username])

  const template = useMemo(
    () => TEMPLATES[Math.min(5, Math.max(1, nodes.length))] ?? TEMPLATES[1],
    [nodes.length],
  )

  // Adjacency for the wandering dot: node index → incident edge indices.
  const adjacency = useMemo(() => {
    const adj: number[][] = template.nodes.map(() => [])
    template.edges.forEach((e, i) => { adj[e.a].push(i); adj[e.b].push(i) })
    return adj
  }, [template])

  // ── Parallax tilt + wandering driver dot ──
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
      targetPX = Math.max(-1, Math.min(1, (e.clientX - cx) / (rect.width / 2)))
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
      parallaxRef.current = { px: curPX, py: curPY }
      const rotX = (8 + curPY * 2).toFixed(3)
      const rotY = (-curPX * 3).toFixed(3)
      world.style.transform =
        `rotateX(${rotX}deg) rotateY(${rotY}deg) translate3d(${(-curPX * 5).toFixed(2)}px, ${(-curPY * 4).toFixed(2)}px, 0)`

      const dot = driverRef.current
      if (dot && !reduced && template.edges.length > 0) {
        if (driver.mode === 'dwell') {
          if (driver.until === 0) driver.until = t + 2200
          if (t >= driver.until) {
            const opts = adjacency[driver.node] ?? []
            const pool = opts.length > 1 && driver.lastEdge >= 0
              ? opts.filter(e => e !== driver.lastEdge) : opts
            const edge = pool[Math.floor(Math.random() * pool.length)] ?? opts[0]
            const el = roadElsRef.current[edge]
            if (el != null && edge != null) {
              driver.edge = edge
              driver.dir = template.edges[edge].a === driver.node ? 1 : -1
              driver.len = el.getTotalLength()
              driver.dist = 0
              driver.cruise = 30 + Math.random() * 26
              driver.mode = 'drive'
            } else { driver.until = t + 1000 }
          }
        } else if (driver.edge >= 0) {
          const el = roadElsRef.current[driver.edge]
          const rampIn = Math.min(1, driver.dist / 36)
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

  const leave = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/')
  }

  const onNodeTap = (n: NodeDef) => {
    // Read-only sub-screens are the next build — acknowledge the tap for now.
    setToast(`${n.label} — opening soon`)
    window.clearTimeout((onNodeTap as { _t?: number })._t)
    ;(onNodeTap as { _t?: number })._t = window.setTimeout(() => setToast(null), 1500)
  }

  const displayName = car?.display_name || (username ? `@${username}` : 'Builder')
  const place = [car?.city, car?.country].filter(Boolean).join(', ')

  // ── Loading / empty states ──
  if (state !== 'ready') {
    return (
      <div style={{
        minHeight: '100dvh', background: '#ece8e0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 14, padding: 24, textAlign: 'center',
      }}>
        {state === 'loading' ? (
          <>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              border: `2.5px solid rgba(120,14,18,0.18)`, borderTopColor: COLOR_BRAND,
              animation: 'pubspin 750ms linear infinite',
            }} />
            <style>{`@keyframes pubspin{to{transform:rotate(360deg)}}`}</style>
          </>
        ) : (
          <>
            <div style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 17, color: '#2a2a2a' }}>
              No public build here
            </div>
            <div style={{ fontFamily: FONT_UI, fontSize: 13, color: '#7a766e', maxWidth: 260, lineHeight: 1.5 }}>
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
    <div style={{ minHeight: '100dvh', background: '#ece8e0', position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @keyframes pubWorldIn { 0%{opacity:0;transform:rotateX(11deg) scale(0.95)} 100%{opacity:1;transform:rotateX(8deg) scale(1)} }
        @keyframes pubDestIn { 0%{opacity:0;transform:translate(-50%,-40%)} 100%{opacity:1;transform:translate(-50%,-50%)} }
        @keyframes pubRoadDraw { from{stroke-dashoffset:1} to{stroke-dashoffset:0} }
        @keyframes pubDashIn { from{opacity:0} to{opacity:1} }
        @keyframes pubDashFlow { from{stroke-dashoffset:0} to{stroke-dashoffset:-60} }
        @keyframes pubPulse { 0%,100%{opacity:0.5;transform:scale(1)} 50%{opacity:1;transform:scale(1.06)} }
        @keyframes pubFooterIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @media (prefers-reduced-motion: reduce){ .pub-amb{animation:none !important} }
      `}</style>

      {/* ── Header (graphite — visitor space, distinct from the owner's burgundy) ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: HEADER_HEIGHT,
        zIndex: 10, background: 'linear-gradient(90deg, #26262a 0%, #1c1c1e 60%, #141416 100%)',
        boxShadow: '0 1px 0 rgba(0,0,0,0.4)',
      }}>
        {/* Leave — where the back chevron lives on every sub-screen */}
        <div
          onClick={leave}
          style={{
            position: 'absolute', left: 6, top: 0, height: '100%',
            display: 'flex', alignItems: 'center', gap: 4, padding: '0 10px',
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          }}
        >
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none"
            stroke="#e8e2d6" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span style={{
            fontFamily: FONT_UI, fontWeight: 700, fontSize: 13, color: '#e8e2d6',
            letterSpacing: '0.04em',
          }}>Leave</span>
        </div>

        {/* Visiting tag (replaces the owner's car + date) */}
        <div style={{
          position: 'absolute', right: 12, top: 0, height: '100%',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{
            fontFamily: FONT_UI, fontWeight: 700, fontSize: 11.5, color: 'rgba(232,226,214,0.6)',
            letterSpacing: '0.03em',
          }}>@{username}</span>
          <span style={{
            background: COLOR_BRAND, color: '#f3ece2', padding: '3px 8px',
            fontFamily: FONT_UI, fontWeight: 800, fontSize: 10, letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}>Visiting</span>
        </div>
      </div>

      {/* ── Identity strip — whose world this is ── */}
      <div style={{
        position: 'absolute', top: HEADER_HEIGHT, left: 0, right: 0, height: 60, zIndex: 9,
        display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px',
        background: 'linear-gradient(180deg, rgba(236,232,224,0.96) 0%, rgba(236,232,224,0) 100%)',
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: RADIUS_AVATAR, background: '#1a1a1c',
          position: 'relative', overflow: 'hidden', flexShrink: 0,
          boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
        }}>
          <svg viewBox="0 0 24 24" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <circle cx="12" cy="9.2" r="4.1" fill="#5a5b61" />
            <path d="M12 14.6c-4.5 0-7.6 2.7-7.6 6.2V24h15.2v-3.2c0-3.5-3.1-6.2-7.6-6.2z" fill="#5a5b61" />
          </svg>
          {car?.avatar_url && (
            <img src={car.avatar_url} alt="" decoding="async"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{
            fontFamily: FONT_UI, fontWeight: 800, fontSize: 15, color: '#23211d',
            letterSpacing: '0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{displayName}</span>
          {place && (
            <span style={{
              fontFamily: FONT_UI, fontWeight: 600, fontSize: 11, color: '#8a857b',
              letterSpacing: '0.05em', textTransform: 'uppercase',
            }}>{place}</span>
          )}
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
          {/* Paper base + grain + faint contour grid */}
          <div style={{
            position: 'absolute', inset: 0,
            background: [
              GRAIN_URL,
              'linear-gradient(rgba(60,55,48,0.035) 1px, transparent 1px)',
              'linear-gradient(90deg, rgba(60,55,48,0.035) 1px, transparent 1px)',
              'linear-gradient(168deg, #f4f1ea 0%, #e9e4da 52%, #d9d3c7 100%)',
            ].join(', '),
            backgroundSize: '220px 220px, 84px 84px, 84px 84px, 100% 100%',
          }} />
          {/* Soft top light */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 220,
            background: 'radial-gradient(ellipse at 50% 0%, rgba(255,253,247,0.7) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          {/* Roads */}
          <svg viewBox="0 0 390 800" preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            <defs>
              <filter id="pubGlow" x="-12%" y="-12%" width="124%" height="124%">
                <feGaussianBlur stdDeviation="1.4" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            {template.edges.map((e, i) => {
              const d = road(template.nodes[e.a], template.nodes[e.b], e.bend)
              return (
                <g key={i}>
                  {/* solid base */}
                  <g fill="none" stroke="rgba(48,44,38,0.46)" strokeLinecap="round" filter="url(#pubGlow)">
                    <path ref={el => { roadElsRef.current[i] = el }}
                      d={d} strokeWidth="2.6" pathLength={1}
                      style={{ strokeDasharray: 1, animation: `pubRoadDraw 650ms ease-out ${380 + i * 60}ms both` }} />
                  </g>
                  {/* dashed centreline */}
                  <g fill="none" stroke="rgba(48,44,38,0.26)" strokeWidth="1.1" strokeDasharray="4 7" strokeLinecap="round">
                    <path className="pub-amb" d={d}
                      style={{ animation: `pubDashIn 500ms ease ${1000 + i * 60}ms both, pubDashFlow ${9 + i}s linear ${1500 + i * 80}ms infinite` }} />
                  </g>
                </g>
              )
            })}
            {/* Wandering visitor dot — positioned by the RAF loop */}
            {template.edges.length > 0 && (
              <g ref={driverRef} opacity="0">
                <circle r="6" fill="rgba(120,14,18,0.2)" />
                <circle r="2.4" fill={COLOR_BRAND} filter="url(#pubGlow)" />
              </g>
            )}
          </svg>

          {/* Nodes */}
          {nodes.map((n, i) => {
            const pos = template.nodes[i]
            const size = n.focal ? ICON_WRAPPER_FOCAL : ICON_WRAPPER_STANDARD
            return (
              <div
                key={n.id}
                onPointerDown={() => setPressedNode(n.id)}
                onPointerUp={() => setPressedNode(null)}
                onPointerCancel={() => setPressedNode(null)}
                onClick={() => onNodeTap(n)}
                style={{
                  position: 'absolute',
                  left: `${(pos.x / 390 * 100).toFixed(2)}%`,
                  top: `${(pos.y / 800 * 100).toFixed(2)}%`,
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
                    background: 'radial-gradient(circle, rgba(120,14,18,0.16) 0%, transparent 62%)',
                    animation: 'pubPulse 3s ease-in-out infinite', pointerEvents: 'none',
                  }} />
                )}
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  transform: pressedNode === n.id ? 'scale(0.92)' : 'scale(1)',
                  transition: pressedNode === n.id ? 'transform 80ms ease-out' : 'transform 200ms cubic-bezier(0.22,1,0.36,1)',
                }}>
                  <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img src={n.icon} alt={n.label} draggable={false}
                      style={{ width: size * 0.85, height: size * 0.85, objectFit: 'contain', pointerEvents: 'none' }} />
                  </div>
                  {/* Ground shadow */}
                  <div style={{
                    width: size * 0.58, height: 8, marginTop: n.focal ? -6 : -4, borderRadius: '50%',
                    background: 'rgba(40,36,30,0.28)', filter: 'blur(7px)', flexShrink: 0, pointerEvents: 'none',
                  }} />
                  <span style={{
                    fontFamily: FONT_UI, fontWeight: n.focal ? 800 : 700,
                    fontSize: n.focal ? 13 : 11.5,
                    color: n.focal ? '#1c1a16' : '#3a352d',
                    letterSpacing: n.focal ? '0.12em' : '0.08em', textTransform: 'uppercase',
                    textShadow: '0 1px 2px rgba(255,253,247,0.8)', marginTop: 4,
                    pointerEvents: 'none',
                  }}>{n.label}</span>
                  {n.focal && (
                    <div style={{
                      width: FOCAL_UNDERLINE_W, height: FOCAL_UNDERLINE_H, background: COLOR_BRAND,
                      borderRadius: 1, marginTop: 3, opacity: 0.9,
                    }} />
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Vignette */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3,
          background: 'radial-gradient(ellipse at 50% 48%, transparent 46%, rgba(70,64,54,0.22) 100%)',
        }} />

        {/* Footer wordmark */}
        <div style={{
          position: 'absolute', bottom: 16, left: 0, right: 0, textAlign: 'center',
          zIndex: 5, pointerEvents: 'none', animation: 'pubFooterIn 600ms 1000ms both',
        }}>
          <span style={{
            fontFamily: FONT_UI, fontStyle: 'italic', fontWeight: 900, fontSize: 13,
            color: 'rgba(60,54,44,0.32)', letterSpacing: '-0.1em',
          }}>G‑DIMENSION</span>
        </div>
      </div>

      {/* Tap toast (until read-only sub-screens land) */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 46, left: '50%', transform: 'translateX(-50%)',
          zIndex: 40, background: 'rgba(28,28,30,0.94)', color: '#f0ebe2',
          padding: '9px 16px', borderRadius: 10, fontFamily: FONT_UI, fontWeight: 700,
          fontSize: 12.5, letterSpacing: '0.03em', boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
          pointerEvents: 'none',
        }}>{toast}</div>
      )}
    </div>
  )
}
