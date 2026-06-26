const _now        = new Date()
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_LABEL = MONTHS[_now.getMonth()]
const DAY_LABEL   = String(_now.getDate())

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import { getCurrentUserProfile, profileName } from '../lib/userProfile'
import { getCachedAvatarThumb, cacheAvatarThumb, clearAvatarThumbCache } from '../lib/avatar'
import { playConfirm } from '../lib/sound'
import { ICON_HOME, ICON_TUNING, ICON_TIMELINE, ICON_MAINTENANCE, iconFeatured } from '../lib/destinationIcons'
import {
  GRADIENT_APP_BG,
  COLOR_ACCENT,
  COLOR_HEADER_WARM,
  COLOR_HEADER_BLACK,
  COLOR_BURGUNDY_L,
  COLOR_BURGUNDY_M,
  COLOR_BURGUNDY_R,
  FONT_UI,
  HEADER_HEIGHT,
  HEADER_WEDGE_LEFT,
  HEADER_WEDGE_RIGHT,
  SHADOW_AMBER_HALO,
  GRADIENT_HEADER_SHADOW,
  ICON_WRAPPER_FOCAL,
  ICON_WRAPPER_STANDARD,
  MAP_NODE_HOME,
  MAP_NODE_TUNING,
  MAP_NODE_TIMELINE,
  MAP_NODE_MAINTENANCE,
  MAP_NODE_PHOTOS,
  RADIUS_AVATAR,
  EASING_SETTLE,
} from '../tokens'
import { useTour } from '../tour/TourContext'
import type { TourNode } from '../tour/tourSteps'

// Road bezier paths (390×800 viewBox) — single source for the glow line and
// the dashed centerline of each road.
const ROAD_GARAGE_TUNING   = 'M 228 238 C 300 250, 350 310, 300 340 C 260 370, 300 390, 293 402'
const ROAD_GARAGE_TIMELINE = 'M 162 240 C 120 270, 60 310, 65 360 C 70 390, 90 398, 98 404'
const ROAD_TUNING_MAINT    = 'M 296 420 C 350 460, 345 550, 310 590 C 295 610, 285 618, 272 622'
const ROAD_TIMELINE_PHOTOS = 'M 92 420 C 72 470, 60 520, 90 570 C 105 600, 115 612, 120 622'
const ROAD_MAINT_PHOTOS    = 'M 256 636 C 215 650, 170 645, 134 638'

// The roads form a small graph; the wandering driver dot travels it,
// parking at each destination for a moment before picking the next leg.
type RoadId = 'gt' | 'gl' | 'tm' | 'lp' | 'mp'
const ROADS: Record<RoadId, { d: string; from: string; to: string }> = {
  gt: { d: ROAD_GARAGE_TUNING,   from: 'home',        to: 'tuning' },
  gl: { d: ROAD_GARAGE_TIMELINE, from: 'home',        to: 'timeline' },
  tm: { d: ROAD_TUNING_MAINT,    from: 'tuning',      to: 'maintenance' },
  lp: { d: ROAD_TIMELINE_PHOTOS, from: 'timeline',    to: 'featured' },
  mp: { d: ROAD_MAINT_PHOTOS,    from: 'maintenance', to: 'featured' },
}
const ROAD_ADJ: Record<string, RoadId[]> = {
  home:        ['gt', 'gl'],
  tuning:      ['gt', 'tm'],
  timeline:    ['gl', 'lp'],
  maintenance: ['tm', 'mp'],
  featured:    ['lp', 'mp'],
}

const DESTINATIONS = [
  { id: 'home',        label: 'Home',        icon: ICON_HOME,        pos: MAP_NODE_HOME,        size: ICON_WRAPPER_FOCAL,    route: '/garage',      focal: true  },
  { id: 'tuning',      label: 'Tuning',      icon: ICON_TUNING,      pos: MAP_NODE_TUNING,      size: ICON_WRAPPER_STANDARD, route: '/tuning',      focal: false },
  { id: 'timeline',    label: 'Timeline',    icon: ICON_TIMELINE,    pos: MAP_NODE_TIMELINE,    size: ICON_WRAPPER_STANDARD, route: '/timeline',    focal: false },
  { id: 'maintenance', label: 'Maintenance', icon: ICON_MAINTENANCE, pos: MAP_NODE_MAINTENANCE, size: ICON_WRAPPER_STANDARD, route: '/maintenance', focal: false },
  { id: 'featured',      label: 'Featured',      icon: iconFeatured,      pos: MAP_NODE_PHOTOS,      size: ICON_WRAPPER_STANDARD, route: '/featured',      focal: false },
]

// Cumulative tour trail — roads light up progressively as the tour advances
// along the loop Home → Tuning → Maintenance → Featured → Timeline → (home).
// Each node step lights every road up to and including the one reaching it, so
// Featured shows 3/5 of the track, Timeline 4/5, and the closing step the whole
// loop.
const TOUR_TRAIL: { road: string; to: TourNode }[] = [
  { road: ROAD_GARAGE_TUNING,   to: 'tuning' },
  { road: ROAD_TUNING_MAINT,    to: 'maintenance' },
  { road: ROAD_MAINT_PHOTOS,    to: 'featured' },
  { road: ROAD_TIMELINE_PHOTOS, to: 'timeline' },
]
const TOUR_CLOSING_ROAD = ROAD_GARAGE_TIMELINE // closes the loop: Timeline → Home
const TOUR_FULL_TRACK = [...TOUR_TRAIL.map(t => t.road), TOUR_CLOSING_ROAD]

// Driver-dot tour script: the order the dot drives the unlocking trail. On a
// node step the dot drives Home → … → target and parks (no random wandering).
const TOUR_NODE_SEQ = ['home', 'tuning', 'maintenance', 'featured', 'timeline'] as const
function tourEdgeBetween(a: string, b: string): RoadId | null {
  for (const id of Object.keys(ROADS) as RoadId[]) {
    const r = ROADS[id]
    if ((r.from === a && r.to === b) || (r.from === b && r.to === a)) return id
  }
  return null
}

// Node centers in the 390×800 road viewBox (for the pulsing target ring).
const NODE_POS: Record<TourNode, { x: number; y: number }> = {
  home:        { x: MAP_NODE_HOME.left,        y: MAP_NODE_HOME.top },
  tuning:      { x: MAP_NODE_TUNING.left,      y: MAP_NODE_TUNING.top },
  timeline:    { x: MAP_NODE_TIMELINE.left,    y: MAP_NODE_TIMELINE.top },
  maintenance: { x: MAP_NODE_MAINTENANCE.left, y: MAP_NODE_MAINTENANCE.top },
  featured:    { x: MAP_NODE_PHOTOS.left,      y: MAP_NODE_PHOTOS.top },
}

// Resolve the glowing-trail state for the current home-map tour step.
function tourGlowFor(step: { id?: string; route?: string; node?: TourNode } | null | undefined):
  { lit: string[]; active: string | null; ring: TourNode | null } {
  if (!step || step.route !== '/home') return { lit: [], active: null, ring: null }
  if (step.id === 'closing') return { lit: TOUR_FULL_TRACK, active: null, ring: null }
  if (!step.node) return { lit: [], active: null, ring: null }
  if (step.node === 'home') return { lit: [], active: null, ring: 'home' }
  const idx = TOUR_TRAIL.findIndex(t => t.to === step.node)
  if (idx < 0) return { lit: [], active: null, ring: step.node }
  return { lit: TOUR_TRAIL.slice(0, idx + 1).map(t => t.road), active: TOUR_TRAIL[idx].road, ring: step.node }
}

const STAGGER_MS = [400, 540, 580, 720, 760]

// Glint timing per node (matches DESTINATIONS order) — co-prime periods and
// offset delays so the shines never sync up and read as random.
const GLINT_ANIMS = [
  'glintA 7s ease-in-out 3200ms infinite',
  'glintB 11s ease-in-out 5600ms infinite',
  'glintC 13s ease-in-out 9200ms infinite',
  'glintD 17s ease-in-out 7400ms infinite',
  'glintE 19s ease-in-out 11800ms infinite',
]

// Noise texture SVG (inlined, no network request)
const TEXTURE_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='a'><feTurbulence type='fractalNoise' baseFrequency='1.6' numOctaves='2' seed='5' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0 0.18 -0.04'/></filter><rect width='100%' height='100%' filter='url(#a)'/></svg>`
const TEXTURE_URL = `url("data:image/svg+xml,${encodeURIComponent(TEXTURE_SVG)}")`

// Tap diagnostics overlay — open /home?tapdebug to see the raw pointer
// sequence for any press that doesn't navigate.
const TAP_DEBUG = typeof window !== 'undefined' && window.location.search.includes('tapdebug')

export default function HomePage() {
  const navigate = useNavigate()
  const { active: tourActive, step: tourStep, next: tourNext } = useTour()
  // On home-map tour steps, glow the cumulative trail + pulse the target node.
  const glow = tourGlowFor(tourActive ? tourStep : null)
  const glowRef = useRef(glow); glowRef.current = glow
  // Drives the dot along the unlocking trail during the tour (target = the node
  // step's node; null on welcome/closing/Home → dot stays hidden, no wandering).
  const tourDotRef = useRef<{ active: boolean; target: TourNode | null }>({ active: false, target: null })
  tourDotRef.current = {
    active: tourActive && tourStep?.route === '/home',
    target: glow.ring && glow.ring !== 'home' ? glow.ring : null,
  }
  // After the closing step's "whole track lit", fade it back to the white roads.
  const [fadingTrail, setFadingTrail] = useState(false)
  const lastStepIdRef = useRef<string | null>(null)
  if (tourStep) lastStepIdRef.current = tourStep.id
  useEffect(() => {
    if (!tourActive && lastStepIdRef.current === 'closing') {
      setFadingTrail(true)
      const t = setTimeout(() => setFadingTrail(false), 1500)
      return () => clearTimeout(t)
    }
  }, [tourActive])
  const worldRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const rafRef   = useRef<number>(0)
  const rectRef  = useRef<DOMRect | null>(null)
  const [displayName, setDisplayName] = useState('...')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [carInfo, setCarInfo] = useState<string | null>(null)
  const [_entered, setEntered] = useState(false)
  const [pressedNode, setPressedNode] = useState<string | null>(null)
  const [exiting, setExiting] = useState(false)
  const exitingRef = useRef(false)
  const pressStartRef = useRef<{ id: string; x: number; y: number } | null>(null)
  const [tapLog, setTapLog] = useState<string[]>([])
  const parallaxRef = useRef({ px: 0, py: 0 })
  const compassRef = useRef<HTMLDivElement>(null)
  const roadElsRef = useRef<Partial<Record<RoadId, SVGPathElement>>>({})
  const driverRef = useRef<SVGGElement>(null)

  useEffect(() => {
    getCurrentUserProfile().then(p => {
      if (!p) return
      setDisplayName(profileName(p))
      setAvatarUrl(p.avatar_url ?? '')  // '' = loaded, no avatar (null = still loading)
    })
    getActiveCarId().then(carId => {
      if (!carId) return
      supabase
        .from('cars')
        .select('year, model, variant')
        .eq('id', carId)
        .is('deleted_at', null)
        .single()
        .then(({ data }) => {
          if (data) setCarInfo([data.year, data.model, data.variant].filter(Boolean).join(' '))
        })
    })
  }, [])

  // Parallax RAF loop
  useEffect(() => {
    const world = worldRef.current
    const stage = stageRef.current
    if (!world || !stage) return

    let targetPX = 0, targetPY = 0
    let currentPX = 0, currentPY = 0
    let isEntered = false

    const updateRect = () => { rectRef.current = stage.getBoundingClientRect() }
    updateRect()
    window.addEventListener('resize', updateRect)

    const entryTimer = setTimeout(() => {
      isEntered = true
      setEntered(true)
      // Hand transform control to the RAF loop — worldIn's fill mode would
      // otherwise pin the end keyframe and block the inline transform writes.
      world.style.animation = 'none'
    }, 900)

    const onMouseMove = (e: MouseEvent) => {
      const r = rectRef.current
      if (!r) return
      const cx = r.left + r.width  / 2
      const cy = r.top  + r.height / 2
      targetPX = Math.max(-1, Math.min(1, (e.clientX - cx) / (r.width  / 2)))
      targetPY = Math.max(-1, Math.min(1, (e.clientY - cy) / (r.height / 2)))
    }
    const onMouseLeave = () => { targetPX = 0; targetPY = 0 }

    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma === null || e.beta === null) return
      targetPX = Math.max(-1, Math.min(1,  e.gamma       / 45))
      targetPY = Math.max(-1, Math.min(1, (e.beta - 45)  / 45))
    }

    stage.addEventListener('mousemove',  onMouseMove  as EventListener)
    stage.addEventListener('mouseleave', onMouseLeave)
    window.addEventListener('deviceorientation', onOrientation as EventListener)

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Wandering driver — a little dot running errands between destinations.
    // Eases away from the curb, cruises at a per-leg speed, brakes into the
    // node, parks a few seconds (faded out), then picks the next road.
    const driver = {
      mode: 'dwell' as 'dwell' | 'drive',
      node: 'home',
      until: 0, // 0 = seeded on first frame
      edge: null as RoadId | null,
      lastEdge: null as RoadId | null,
      dir: 1 as 1 | -1,
      dist: 0,
      len: 0,
      cruise: 0,
      opacity: 0,
    }
    let lastT = 0

    const tick = (t: number) => {
      const dt = lastT === 0 ? 0 : Math.min(0.05, (t - lastT) / 1000)
      lastT = t
      // Idle sway — the camera never sits perfectly still, even with no input.
      // Two unsynced periods (11s / 17s) so the drift never visibly loops.
      const swayX = reduced ? 0 : Math.sin((t / 11000) * Math.PI * 2) * 0.22
      const swayY = reduced ? 0 : Math.sin((t / 17000) * Math.PI * 2 + 2.1) * 0.18
      currentPX += (targetPX + swayX - currentPX) * 0.08
      currentPY += (targetPY + swayY - currentPY) * 0.08
      parallaxRef.current.px = currentPX
      parallaxRef.current.py = currentPY
      if (isEntered && !exitingRef.current) {
        const rotX = (10 + currentPY * 2).toFixed(3)
        const rotY = (-currentPX * 3).toFixed(3)
        const shX  = (-currentPX * 6).toFixed(2)
        const shY  = (-currentPY * 4).toFixed(2)
        world.style.transform =
          `rotateX(${rotX}deg) rotateY(${rotY}deg) translate3d(${shX}px, ${shY}px, 0)`
        // The compass leans a touch with the gyro/mouse, like a dash instrument
        if (compassRef.current && !reduced) {
          compassRef.current.style.transform = `rotate(${(currentPX * 4).toFixed(2)}deg)`
        }
      }

      const dot = driverRef.current
      if (dot && !reduced) {
        if (driver.mode === 'dwell') {
          const tourDot = tourDotRef.current
          if (driver.until === 0) driver.until = t + (tourDot.active ? 500 : 2600)
          if (isEntered && t >= driver.until) {
            if (tourDot.active) {
              // Scripted: step one edge toward the target, then park at it.
              const seqI = TOUR_NODE_SEQ.indexOf(driver.node as TourNode)
              const tgtI = tourDot.target ? TOUR_NODE_SEQ.indexOf(tourDot.target) : -1
              if (seqI >= 0 && tgtI > seqI) {
                const nextNode = TOUR_NODE_SEQ[seqI + 1]
                const edge = tourEdgeBetween(driver.node, nextNode)
                const el = edge ? roadElsRef.current[edge] : null
                if (edge && el) {
                  driver.edge = edge
                  driver.dir = ROADS[edge].from === driver.node ? 1 : -1
                  driver.len = el.getTotalLength()
                  driver.dist = 0
                  driver.cruise = 54
                  driver.mode = 'drive'
                } else {
                  driver.until = t + 300
                }
              } else {
                driver.until = t + 300 // parked at target (or nothing to do)
              }
            } else {
              const options = ROAD_ADJ[driver.node]
              const pool = options.length > 1 && driver.lastEdge
                ? options.filter(e => e !== driver.lastEdge)
                : options
              const edge = pool[Math.floor(Math.random() * pool.length)]
              const el = roadElsRef.current[edge]
              if (el) {
                driver.edge = edge
                driver.dir = ROADS[edge].from === driver.node ? 1 : -1
                driver.len = el.getTotalLength()
                driver.dist = 0
                driver.cruise = 30 + Math.random() * 26 // viewBox px/s, varies per leg
                driver.mode = 'drive'
              } else {
                driver.until = t + 1000
              }
            }
          }
        } else if (driver.edge) {
          const el = roadElsRef.current[driver.edge]
          const rampIn  = Math.min(1, driver.dist / 36)
          const rampOut = Math.min(1, (driver.len - driver.dist) / 52)
          driver.dist += driver.cruise * Math.max(0.12, Math.min(rampIn, rampOut)) * dt
          if (driver.dist >= driver.len) {
            driver.dist = driver.len
            const road = ROADS[driver.edge]
            driver.node = driver.dir === 1 ? road.to : road.from
            driver.lastEdge = driver.edge
            driver.edge = null
            driver.mode = 'dwell'
            // During the tour, chain to the next edge almost immediately so the
            // dot flows Home → … → target in one continuous run.
            driver.until = t + (tourDotRef.current.active ? 120 : 1800 + Math.random() * 3400)
          }
          if (el) {
            const s = driver.dir === 1 ? driver.dist : driver.len - driver.dist
            const p = el.getPointAtLength(s)
            dot.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`)
          }
        }
        // Fade out while parked at a destination, back in when departing. During
        // the tour, stay lit while parked AT the target node; hide otherwise.
        const td = tourDotRef.current
        const tourParked = td.active && !!td.target && driver.node === td.target && driver.mode === 'dwell'
        const wantOpacity = (driver.mode === 'drive' || tourParked) ? 1 : 0
        driver.opacity += (wantOpacity - driver.opacity) * 0.07
        dot.setAttribute('opacity', driver.opacity.toFixed(3))
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      clearTimeout(entryTimer)
      cancelAnimationFrame(rafRef.current)
      stage.removeEventListener('mousemove',  onMouseMove  as EventListener)
      stage.removeEventListener('mouseleave', onMouseLeave)
      window.removeEventListener('deviceorientation', onOrientation as EventListener)
      window.removeEventListener('resize', updateRect)
    }
  }, [])

  // GT4-style exit: push the camera into the chosen destination, fade to
  // black, then navigate once the zoom lands.
  const handleSelect = (dest: typeof DESTINATIONS[number]) => {
    if (exitingRef.current) return
    // During the tour, only the highlighted node advances; ignore other taps
    // (and skip the zoom-navigate — the engine drives navigation).
    if (tourActive) {
      if (glowRef.current.ring === dest.id) {
        exitingRef.current = true
        playConfirm()
        tourNext()
      }
      return
    }
    exitingRef.current = true
    playConfirm()
    setExiting(true)
    // Arm the Timeline's cinematic Overture for this dive only (consumed once
    // on arrival, so back-navigation into the Timeline stays instant).
    if (dest.route === '/timeline') {
      try { sessionStorage.setItem('gdim_tl_overture', '1') } catch { /* private mode */ }
    }
    const world = worldRef.current
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (world && !reduced) {
      const { px, py } = parallaxRef.current
      world.style.animation = 'none'
      world.style.transformOrigin =
        `${(dest.pos.left / 390 * 100).toFixed(2)}% ${(dest.pos.top / 800 * 100).toFixed(2)}%`
      world.style.transition = 'transform 380ms cubic-bezier(0.55, 0, 0.85, 0.6)'
      world.style.transform =
        `rotateX(${(10 + py * 2).toFixed(3)}deg) rotateY(${(-px * 3).toFixed(3)}deg) scale(2.05)`
    }
    window.setTimeout(() => navigate(dest.route), reduced ? 200 : 380)
  }
  const handleSelectRef = useRef(handleSelect)
  handleSelectRef.current = handleSelect

  // Complete node presses at the DOCUMENT level: pointerdown on a node arms
  // the press, and any pointerup on the page finishes it (within slop). This
  // removes every dependency on iOS delivering pointerup/click to the node
  // itself — which it dropped under thumb roll-off, gyro movement, and
  // gesture heuristics. pointercancel disarms without navigating.
  useEffect(() => {
    const onUp = (e: PointerEvent) => {
      const s = pressStartRef.current
      pressStartRef.current = null
      setPressedNode(null)
      if (!s) return
      const dist = Math.hypot(e.clientX - s.x, e.clientY - s.y)
      if (TAP_DEBUG) setTapLog(l => [...l.slice(-7), `up ${s.id} ${dist.toFixed(0)}px ${dist < 34 ? '→ GO' : '→ too far'}`])
      if (dist < 34) {
        const dest = DESTINATIONS.find(d => d.id === s.id)
        if (dest) handleSelectRef.current(dest)
      }
    }
    const onCancel = () => {
      if (TAP_DEBUG && pressStartRef.current) setTapLog(l => [...l.slice(-7), `CANCEL ${pressStartRef.current?.id}`])
      pressStartRef.current = null
      setPressedNode(null)
    }
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onCancel)
    return () => {
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onCancel)
    }
  }, [])

  // Header avatar: render the device-cached thumbnail immediately (even before
  // the profile query returns), then reconcile once avatar_url is known. First
  // visit fetches the full image and caches a ~3KB downscaled copy for next time.
  const [avatarSrc, setAvatarSrc] = useState<string | null>(() => getCachedAvatarThumb()?.dataUrl ?? null)
  const [avatarLoaded, setAvatarLoaded] = useState(false)
  useEffect(() => {
    if (avatarUrl === null) return  // profile not loaded yet — keep optimistic cache
    if (!avatarUrl) { setAvatarSrc(null); clearAvatarThumbCache(); return }
    const cached = getCachedAvatarThumb()
    if (cached?.url === avatarUrl) { setAvatarSrc(cached.dataUrl); return }
    // New/changed avatar: show the full URL now, cache the tiny copy for next open.
    setAvatarSrc(avatarUrl)
    cacheAvatarThumb(avatarUrl)
  }, [avatarUrl])

  return (
    <div style={{ minHeight: '100dvh', background: '#050507', display: 'flex', justifyContent: 'center' }}>
    <div style={{ minHeight: '100dvh', width: '100%', maxWidth: 440, background: GRADIENT_APP_BG, position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @keyframes worldIn {
          0%   { opacity: 0; transform: rotateX(12deg) scale(0.94); }
          100% { opacity: 1; transform: rotateX(10deg) scale(1); }
        }
        @keyframes destIn {
          0%   { opacity: 0; transform: translate(-50%, -40%); }
          100% { opacity: 1; transform: translate(-50%, -50%); }
        }
        @keyframes garagePulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50%      { opacity: 1;   transform: scale(1.06); }
        }
        @keyframes footerIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes roadDraw {
          from { stroke-dashoffset: 1; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes tourLineDraw {
          from { stroke-dashoffset: 1; opacity: 0.2; }
          to   { stroke-dashoffset: 0; opacity: 1; }
        }
        @keyframes tourRing {
          0%, 100% { opacity: 0.35; transform: scale(0.92); transform-origin: center; transform-box: fill-box; }
          50%      { opacity: 1;    transform: scale(1.12); transform-origin: center; transform-box: fill-box; }
        }
        @keyframes tourTrailFade {
          0%   { opacity: 1; }
          35%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes roadDashIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes dashFlow {
          from { stroke-dashoffset: 0; }
          to   { stroke-dashoffset: -60; }
        }
        @keyframes compassSettle {
          0%   { transform: rotate(-140deg); }
          55%  { transform: rotate(14deg); }
          78%  { transform: rotate(-6deg); }
          100% { transform: rotate(0deg); }
        }
        @keyframes wmTrack {
          from { opacity: 0; letter-spacing: 0.02em; }
          to   { opacity: 1; letter-spacing: -0.1em; }
        }
        @keyframes tagTrack {
          from { opacity: 0; letter-spacing: 0.7em; }
          to   { opacity: 1; letter-spacing: 0.4em; }
        }
        @keyframes sheenSweep {
          from { transform: translateX(-160%) skewX(-18deg); }
          to   { transform: translateX(420%) skewX(-18deg); }
        }
        /* Glint variants: same ~1.2s sweep across different total periods,
           so every icon catches the light at its own unsynced interval */
        @keyframes glintA {
          0%, 84% { transform: translateX(-160%) skewX(-18deg); }
          100%    { transform: translateX(400%) skewX(-18deg); }
        }
        @keyframes glintB {
          0%, 89% { transform: translateX(-160%) skewX(-18deg); }
          100%    { transform: translateX(400%) skewX(-18deg); }
        }
        @keyframes glintC {
          0%, 91% { transform: translateX(-160%) skewX(-18deg); }
          100%    { transform: translateX(400%) skewX(-18deg); }
        }
        @keyframes glintD {
          0%, 93% { transform: translateX(-160%) skewX(-18deg); }
          100%    { transform: translateX(400%) skewX(-18deg); }
        }
        @keyframes glintE {
          0%, 94% { transform: translateX(-160%) skewX(-18deg); }
          100%    { transform: translateX(400%) skewX(-18deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .gdim-ambient { animation: none !important; }
        }
      `}</style>

      {/* ── Header ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: HEADER_HEIGHT, zIndex: 10,
        overflow: 'hidden',
      }}>
        <svg
          viewBox="0 0 390 44"
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          <defs>
            <linearGradient id="hdrGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor={COLOR_BURGUNDY_L} />
              <stop offset="55%"  stopColor={COLOR_BURGUNDY_M} />
              <stop offset="100%" stopColor={COLOR_BURGUNDY_R} />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="390" height="44" fill={COLOR_HEADER_BLACK} />
          <path d={HEADER_WEDGE_LEFT}  fill="url(#hdrGrad)" />
          <path d={HEADER_WEDGE_RIGHT} fill="url(#hdrGrad)" />
        </svg>

        {/* Right: car info + date */}
        <div style={{ position: 'absolute', right: 0, top: 0, height: '100%', display: 'flex', alignItems: 'center', gap: 0, paddingRight: 14 }}>
          {carInfo && (
            <span style={{ paddingRight: 10, fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, color: COLOR_HEADER_WARM, letterSpacing: '0.04em', opacity: 0.75 }}>
              {carInfo}
            </span>
          )}
          <div style={{ background: 'rgba(242,238,228,0.94)', color: '#0d0d0d', padding: '4px 7px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>{MONTH_LABEL}</div>
          <div style={{ background: COLOR_HEADER_BLACK, color: '#fff', padding: '4px 8px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: DAY_LABEL.length === 1 ? 24 : 30 }}>{DAY_LABEL}</div>
        </div>

        {/* Left: avatar + username */}
        <div
          onClick={() => navigate('/profile')}
          style={{
            position: 'absolute', left: 10, top: 0, height: '100%',
            display: 'flex', alignItems: 'center', gap: 8,
            cursor: 'pointer', padding: '4px 6px',
          }}
        >
          <div style={{
            width: 28, height: 28,
            borderRadius: RADIUS_AVATAR,
            background: '#101013',
            position: 'relative', overflow: 'hidden',
            flexShrink: 0,
            boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
          }}>
            {/* Grey person silhouette — shows while loading and when no avatar is set */}
            <svg viewBox="0 0 24 24" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
              <circle cx="12" cy="9.2" r="4.1" fill="#55565c" />
              <path d="M12 14.6c-4.5 0-7.6 2.7-7.6 6.2V24h15.2v-3.2c0-3.5-3.1-6.2-7.6-6.2z" fill="#55565c" />
            </svg>
            {avatarSrc && (
              <img
                src={avatarSrc} alt="" decoding="async"
                onLoad={() => setAvatarLoaded(true)}
                onError={() => { if (avatarUrl && avatarSrc !== avatarUrl) setAvatarSrc(avatarUrl) }}
                style={{
                  position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
                  opacity: avatarLoaded ? 1 : 0, transition: 'opacity 180ms ease',
                }}
              />
            )}
          </div>
          <span style={{
            fontFamily: FONT_UI, fontWeight: 700, fontSize: 13,
            color: COLOR_HEADER_WARM,
            letterSpacing: '0.04em',
            textShadow: '0 1px 2px rgba(0,0,0,0.6)',
          }}>
            {displayName}
          </span>
        </div>

        {/* One-time light sweep across the header on entry */}
        <div style={{
          position: 'absolute', top: '-20%', left: 0, width: '36%', height: '140%',
          background: 'linear-gradient(105deg, transparent 0%, rgba(255,248,230,0.05) 30%, rgba(255,248,230,0.20) 50%, rgba(255,248,230,0.05) 70%, transparent 100%)',
          transform: 'translateX(-160%) skewX(-18deg)',
          animation: 'sheenSweep 900ms cubic-bezier(0.4, 0, 0.2, 1) 1300ms both',
          pointerEvents: 'none',
        }} />
      </div>

      {/* ── Stage ── */}
      <div
        ref={stageRef}
        style={{
          position: 'absolute',
          top: HEADER_HEIGHT, left: 0, right: 0, bottom: 0,
          overflow: 'hidden',
          perspective: '1400px',
          perspectiveOrigin: '50% 40%',
          // The map has nothing to scroll — claim every touch so the browser
          // never hijacks a tap as a pan/overscroll (which fires pointercancel
          // and eats the tap)
          touchAction: 'none',
          overscrollBehavior: 'none',
        }}
      >
        {/* Header cast shadow */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: 90, zIndex: 5, pointerEvents: 'none',
          background: GRADIENT_HEADER_SHADOW,
        }} />

        {/* World */}
        <div
          ref={worldRef}
          style={{
            position: 'absolute', inset: 0,
            animation: `worldIn 800ms ${EASING_SETTLE} both`,
            transformStyle: 'preserve-3d',
            willChange: 'transform',
          }}
        >
          {/* Texture base + grid lines */}
          <div style={{
            position: 'absolute', inset: 0,
            background: [
              TEXTURE_URL,
              "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)",
              "linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
              "linear-gradient(170deg, #d4dce2 0%, #a8b2ba 30%, #6a737a 65%, #3a4248 100%)",
            ].join(', '),
            backgroundSize: '240px 240px, 80px 80px, 80px 80px, 100% 100%',
          }} />

          {/* Horizon glow */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 200,
            background: 'radial-gradient(ellipse at 50% 0%, rgba(212, 220, 226, 0.55) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          {/* Compass */}
          <div ref={compassRef} style={{
            position: 'absolute', top: 14, right: 14,
            width: 46, height: 46,
            opacity: 0.9,
            pointerEvents: 'none',
          }}>
            <svg viewBox="0 0 64 64" style={{ width: '100%', height: '100%' }}>
              <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(20,30,42,0.45)" strokeWidth="0.8"/>
              <circle cx="32" cy="32" r="22" fill="none" stroke="rgba(20,30,42,0.30)" strokeWidth="0.5"/>
              {/* Needle over-rotates past N on entry, then springs back and settles */}
              <g style={{
                transformOrigin: '32px 32px',
                transformBox: 'view-box',
                animation: `compassSettle 1100ms ${EASING_SETTLE} 500ms both`,
              }}>
                <path d="M 32 4 L 36 32 L 32 28 L 28 32 Z" fill="rgba(20,30,42,0.65)"/>
                <path d="M 32 60 L 36 32 L 32 36 L 28 32 Z" fill="rgba(20,30,42,0.35)"/>
                <path d="M 4 32 L 32 28 L 28 32 L 32 36 Z" fill="rgba(20,30,42,0.35)"/>
                <path d="M 60 32 L 32 28 L 36 32 L 32 36 Z" fill="rgba(20,30,42,0.35)"/>
              </g>
              <text x="32" y="3" fontFamily="Hanken Grotesk, sans-serif" fontWeight="800" fontSize="7"
                fill="rgba(20,30,42,0.65)" textAnchor="middle">N</text>
            </svg>
          </div>

          {/* Watermark — letters track in from wide to tight on entry */}
          <div style={{
            position: 'absolute', top: 14, left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: FONT_UI, fontStyle: 'italic', fontWeight: 800,
            fontSize: 38, color: 'rgba(20,30,42,0.22)',
            letterSpacing: '-0.1em', whiteSpace: 'nowrap',
            pointerEvents: 'none',
            animation: `wmTrack 1100ms ${EASING_SETTLE} 250ms both`,
          }}>
            G‑Dimension
          </div>
          <div style={{
            position: 'absolute', top: 62, left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: FONT_UI, fontWeight: 800, fontSize: 9,
            color: 'rgba(20,30,42,0.4)', letterSpacing: '0.4em',
            whiteSpace: 'nowrap', pointerEvents: 'none',
            animation: `tagTrack 1100ms ${EASING_SETTLE} 420ms both`,
          }}>
            YOUR BUILD · DOCUMENTED
          </div>

          {/* Roads SVG */}
          <svg
            viewBox="0 0 390 800"
            preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          >
            <defs>
              <filter id="roadGlow" x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur stdDeviation="1.8" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="tourGlow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="3.2" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>
            {/* Garage → Tuning */}
            <g fill="none" stroke="rgba(255,250,232,0.52)" strokeLinecap="round" filter="url(#roadGlow)">
              <path ref={el => { roadElsRef.current.gt = el ?? undefined }}
                d={ROAD_GARAGE_TUNING} strokeWidth="2.8" pathLength={1}
                style={{ strokeDasharray: 1, animation: 'roadDraw 650ms ease-out 380ms both' }}/>
            </g>
            <g fill="none" stroke="rgba(255,250,232,0.25)" strokeWidth="1.2" strokeDasharray="4 6" strokeLinecap="round">
              <path className="gdim-ambient" d={ROAD_GARAGE_TUNING}
                style={{ animation: 'roadDashIn 500ms ease 1000ms both, dashFlow 9s linear 1500ms infinite' }}/>
            </g>
            {/* Garage → Timeline */}
            <g fill="none" stroke="rgba(255,250,232,0.42)" strokeLinecap="round" filter="url(#roadGlow)">
              <path ref={el => { roadElsRef.current.gl = el ?? undefined }}
                d={ROAD_GARAGE_TIMELINE} strokeWidth="2.2" pathLength={1}
                style={{ strokeDasharray: 1, animation: 'roadDraw 650ms ease-out 430ms both' }}/>
            </g>
            <g fill="none" stroke="rgba(255,250,232,0.22)" strokeWidth="1.0" strokeDasharray="6 9" strokeLinecap="round">
              <path className="gdim-ambient" d={ROAD_GARAGE_TIMELINE}
                style={{ animation: 'roadDashIn 500ms ease 1050ms both, dashFlow 10s linear 1550ms infinite' }}/>
            </g>
            {/* Tuning → Maintenance */}
            <g fill="none" stroke="rgba(255,250,232,0.48)" strokeLinecap="round" filter="url(#roadGlow)">
              <path ref={el => { roadElsRef.current.tm = el ?? undefined }}
                d={ROAD_TUNING_MAINT} strokeWidth="2.5" pathLength={1}
                style={{ strokeDasharray: 1, animation: 'roadDraw 650ms ease-out 560ms both' }}/>
            </g>
            <g fill="none" stroke="rgba(255,250,232,0.24)" strokeWidth="1.2" strokeDasharray="4 8" strokeLinecap="round">
              <path className="gdim-ambient" d={ROAD_TUNING_MAINT}
                style={{ animation: 'roadDashIn 500ms ease 1180ms both, dashFlow 9s linear 1680ms infinite' }}/>
            </g>
            {/* Timeline → Photos */}
            <g fill="none" stroke="rgba(255,250,232,0.46)" strokeLinecap="round" filter="url(#roadGlow)">
              <path ref={el => { roadElsRef.current.lp = el ?? undefined }}
                d={ROAD_TIMELINE_PHOTOS} strokeWidth="2.4" pathLength={1}
                style={{ strokeDasharray: 1, animation: 'roadDraw 650ms ease-out 600ms both' }}/>
            </g>
            <g fill="none" stroke="rgba(255,250,232,0.22)" strokeWidth="1.1" strokeDasharray="5 7" strokeLinecap="round">
              <path className="gdim-ambient" d={ROAD_TIMELINE_PHOTOS}
                style={{ animation: 'roadDashIn 500ms ease 1220ms both, dashFlow 10s linear 1720ms infinite' }}/>
            </g>
            {/* Maintenance → Photos connector */}
            <g fill="none" stroke="rgba(255,250,232,0.30)" strokeLinecap="round" filter="url(#roadGlow)">
              <path ref={el => { roadElsRef.current.mp = el ?? undefined }}
                d={ROAD_MAINT_PHOTOS} strokeWidth="1.6" pathLength={1}
                style={{ strokeDasharray: 1, animation: 'roadDraw 600ms ease-out 760ms both' }}/>
            </g>

            {/* Road labels */}
            <g fontFamily="Cormorant Garamond, serif" fontStyle="italic" fontSize="10.5" fontWeight="500"
               fill="rgba(20,30,42,0.58)" letterSpacing="1.2">
              <path id="rlA" d="M 228 238 C 300 250, 350 310, 300 340 C 260 370, 300 390, 293 402" fill="none"/>
              <text><textPath href="#rlA" startOffset="18">To Tuning</textPath></text>
              <path id="rlB" d="M 98 404 C 90 398, 70 390, 65 360 C 60 310, 120 270, 162 240" fill="none"/>
              <text><textPath href="#rlB" startOffset="105">To Timeline</textPath></text>
              <path id="rlC" d="M 296 420 C 350 460, 345 550, 310 590" fill="none"/>
              <text><textPath href="#rlC" startOffset="30">To Maintenance</textPath></text>
              <path id="rlD" d="M 120 622 C 115 612, 105 600, 90 570 C 60 520, 72 470, 92 420" fill="none"/>
              <text><textPath href="#rlD" startOffset="125">To Featured</textPath></text>
            </g>

            {/* Onboarding tour — cumulative glowing trail + target-node pulse.
                On finish (closing step) the full track fades back to white. */}
            {fadingTrail && (
              <g style={{ pointerEvents: 'none' }}>
                {TOUR_FULL_TRACK.map((d, i) => (
                  <path key={`tour-fade-${i}`} d={d} fill="none" stroke={COLOR_ACCENT}
                    strokeWidth={3.4} strokeLinecap="round" filter="url(#tourGlow)"
                    style={{ animation: 'tourTrailFade 1500ms ease-out both' }} />
                ))}
              </g>
            )}
            {!fadingTrail && (glow.lit.length > 0 || glow.ring) && (
              <g style={{ pointerEvents: 'none' }}>
                {glow.lit.map((d, i) => {
                  const isActive = d === glow.active
                  return (
                    <path
                      key={`tour-lit-${i}`}
                      d={d} fill="none" stroke={COLOR_ACCENT}
                      strokeWidth={isActive ? 3.8 : 3} strokeLinecap="round"
                      filter="url(#tourGlow)" pathLength={1}
                      style={isActive
                        ? { strokeDasharray: 1, animation: 'tourLineDraw 700ms ease-out both' }
                        : { opacity: 0.72 }}
                    />
                  )
                })}
                {glow.ring === 'home' ? (
                  // Home gets a fuller glow (no road leads to it, so the node
                  // itself is the cue): soft disc + ring.
                  <g>
                    <circle cx={NODE_POS.home.x} cy={NODE_POS.home.y} r={32}
                      fill={COLOR_ACCENT} opacity={0.18} filter="url(#tourGlow)"
                      style={{ animation: 'tourRing 1.6s ease-in-out infinite' }} />
                    <circle cx={NODE_POS.home.x} cy={NODE_POS.home.y} r={22}
                      fill="none" stroke={COLOR_ACCENT} strokeWidth={2.4} filter="url(#tourGlow)"
                      style={{ animation: 'tourRing 1.6s ease-in-out infinite' }} />
                  </g>
                ) : glow.ring && (
                  // Other nodes: the subtle ring (matches the earlier look).
                  <circle cx={NODE_POS[glow.ring].x} cy={NODE_POS[glow.ring].y} r={24}
                    fill="none" stroke={COLOR_ACCENT} strokeWidth={2.2} opacity={0.85}
                    filter="url(#tourGlow)"
                    style={{ animation: 'tourRing 1.6s ease-in-out infinite' }} />
                )}
              </g>
            )}

            {/* Wandering driver — positioned each frame by the RAF loop */}
            <g ref={driverRef} opacity="0">
              <circle r="6" fill="rgba(200,102,26,0.20)" />
              <circle r="2.3" fill="rgba(255,250,232,0.95)" filter="url(#roadGlow)" />
            </g>
          </svg>

          {/* Destination nodes */}
          {DESTINATIONS.map((dest, i) => (
            <div
              key={dest.id}
              // Confirm fires in handleSelect (the real selection path) rather
              // than via the global data-sfx handler — the node's custom pointer
              // handling + entry animation made the delegated pointerdown miss
              // on a fast re-tap after returning to Home.
              // Arms the press — the document-level pointerup listener
              // completes it, and native click is a redundant fallback path
              // (exitingRef dedupes if both fire).
              onPointerDown={e => {
                pressStartRef.current = { id: dest.id, x: e.clientX, y: e.clientY }
                setPressedNode(dest.id)
                if (TAP_DEBUG) setTapLog(l => [...l.slice(-7), `down ${dest.id}`])
                try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* non-critical */ }
              }}
              onClick={() => handleSelect(dest)}
              style={{
                position: 'absolute',
                left: `${(dest.pos.left / 390 * 100).toFixed(2)}%`,
                top: `${(dest.pos.top / 800 * 100).toFixed(2)}%`,
                transform: 'translate(-50%, -50%)',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                cursor: 'pointer',
                animation: `destIn 700ms ${EASING_SETTLE} ${STAGGER_MS[i]}ms both`,
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'none', userSelect: 'none',
              }}
            >
              {/* Focal amber halo — outside scale wrapper so it doesn't shrink on press */}
              {dest.focal && (
                <div style={{
                  position: 'absolute',
                  width: 200, height: 200,
                  top: '50%', left: '50%',
                  transform: 'translate(-50%, -50%)',
                  background: SHADOW_AMBER_HALO,
                  animation: 'garagePulse 3s ease-in-out infinite',
                  pointerEvents: 'none',
                }} />
              )}

              {/* Inner wrapper owns the press transform, separate from the fade-in animation */}
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                transform: pressedNode === dest.id ? 'scale(0.92)' : 'scale(1)',
                transition: pressedNode === dest.id ? 'transform 80ms ease-out' : 'transform 200ms cubic-bezier(0.22,1,0.36,1)',
              }}>
                <div style={{
                  position: 'relative',
                  width: dest.size, height: dest.size,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <img
                    src={dest.icon}
                    alt={dest.label}
                    style={{
                      width: dest.size * 0.85,
                      height: dest.size * 0.85,
                      objectFit: 'contain',
                      filter: 'none',
                      userSelect: 'none',
                      pointerEvents: 'none',
                    }}
                    draggable={false}
                  />
                  {/* Periodic glint — sweeps the icon's opaque pixels only,
                      via an alpha mask of the icon itself */}
                  <div style={{
                    position: 'absolute', top: '50%', left: '50%',
                    width: dest.size * 0.85, height: dest.size * 0.85,
                    transform: 'translate(-50%, -50%)',
                    WebkitMaskImage: `url(${dest.icon})`, maskImage: `url(${dest.icon})`,
                    WebkitMaskSize: 'contain', maskSize: 'contain',
                    WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                    WebkitMaskPosition: 'center', maskPosition: 'center',
                    overflow: 'hidden', pointerEvents: 'none',
                  }}>
                    <div className="gdim-ambient" style={{
                      position: 'absolute', top: '-20%', left: 0,
                      width: '55%', height: '140%',
                      background: `linear-gradient(105deg, transparent 0%, rgba(255,248,230,0.06) 30%, rgba(255,248,230,${dest.focal ? 0.45 : 0.30}) 50%, rgba(255,248,230,0.06) 70%, transparent 100%)`,
                      transform: 'translateX(-160%) skewX(-18deg)',
                      animation: GLINT_ANIMS[i],
                    }} />
                  </div>
                </div>

                {/* Ground shadow — flow element, sits between icon and label */}
                <div style={{
                  width: dest.size * 0.6,
                  height: 8,
                  marginTop: dest.focal ? -6 : -4,
                  borderRadius: '50%',
                  background: 'rgba(0,0,0,0.45)',
                  filter: 'blur(7px)',
                  flexShrink: 0,
                  alignSelf: 'center',
                  pointerEvents: 'none',
                }} />

                {/* Label */}
                <span style={{
                  fontFamily: FONT_UI,
                  fontWeight: dest.focal ? 800 : 700,
                  fontSize: dest.focal ? 13 : 11,
                  color: dest.focal ? '#f5f5f5' : 'rgba(245,245,245,0.8)',
                  letterSpacing: dest.focal ? '0.12em' : '0.08em',
                  textTransform: 'uppercase',
                  textShadow: '0 1px 3px rgba(0,0,0,0.7)',
                  marginTop: 4,
                  position: 'relative', zIndex: 1,
                  pointerEvents: 'none',
                }}>
                  {dest.label}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Vignette overlay */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3,
          background: 'radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(5,5,7,0.55) 100%)',
        }} />

        {/* Bottom fade */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 70,
          pointerEvents: 'none', zIndex: 4,
          background: 'linear-gradient(0deg, rgba(5,5,7,0.45) 0%, transparent 100%)',
        }} />

        {/* Footer text */}
        <div style={{
          position: 'absolute', bottom: 18, left: 0, right: 0,
          textAlign: 'center', zIndex: 5, pointerEvents: 'none',
          animation: 'footerIn 600ms 1000ms both',
        }}>
          <span style={{
            fontFamily: FONT_UI, fontStyle: 'italic', fontWeight: 900, fontSize: 13,
            color: 'rgba(245,245,245,0.28)',
            letterSpacing: '-0.1em', textTransform: 'none',
          }}>
            G‑DIMENSION
          </span>
        </div>
      </div>

      {/* Tap diagnostics — only with ?tapdebug in the URL */}
      {TAP_DEBUG && (
        <div style={{
          position: 'fixed', bottom: 48, left: 10, right: 10, zIndex: 99,
          pointerEvents: 'none', fontFamily: 'monospace', fontSize: 11,
          color: '#7CFC00', textShadow: '0 1px 2px #000', whiteSpace: 'pre-line',
          lineHeight: 1.5,
        }}>
          {tapLog.join('\n')}
        </div>
      )}

      {/* Exit fade — cut to black while the camera dives into the destination */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: '#050507',
        opacity: exiting ? 1 : 0,
        transition: 'opacity 340ms ease-in',
        pointerEvents: exiting ? 'auto' : 'none',
      }} />
    </div>
    </div>
  )
}
