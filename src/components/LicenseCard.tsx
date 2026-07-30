// The G-Dimension Permit card — a DMSB-style graded driver's licence shown on
// the owner's Profile. Tap to flip: front = the permit (grade rail with a live
// sheen + a QR to the public profile), back = the next-grade checklist over a
// Nürburgring-style dissolving checker field.
//
// Card material follows the grade (bronze → silver → gold → crimson → carbon,
// the last a real carbon-fibre weave); the pre-first-car state is a cool-white
// provisional permit.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import QRCode from 'qrcode'
import { GRADES, type Grade, type GradeProgress } from '../lib/license'
import { FONT_UI } from '../tokens'

// Slow "showroom" rotation used by the rank-up celebration (spin mode): one full
// 360° turn per SPIN_MS, driven by requestAnimationFrame — NOT a CSS 3D
// animation. iOS Safari repeatedly failed to repaint CSS-composited 3D layers on
// schedule (the face blanked ~2s then blipped in; keyframes, will-change, and
// even a never-turning-away tilt all still blipped). So no face is ever allowed
// to face away from the viewer: the card renders at a rotation clamped within
// ±90°, and at each edge-on instant (zero apparent width) the visible face is
// swapped front ↔ back via display. The eye sees a continuous full rotation —
// grade front, checklist back — but the browser never has a backface to
// mis-repaint and no opacity ever animates.
const SPIN_MS = 9000

// Profile flip duration. The content swap fires at half this, card edge-on.
const FLIP_MS = 640

// Parse a CSS-style duration ('8100ms' / '3.6s') to milliseconds.
function msOf(d: string): number {
  const n = parseFloat(d)
  return Number.isFinite(n) ? (/ms\s*$/.test(d.trim()) ? n : n * 1000) : 0
}

type Material = {
  bg: React.CSSProperties     // full background spec (supports the carbon weave)
  ink: string                 // primary text
  inkDim: string              // labels
  rail: string                // grade-rail base gradient
  railInk: string
  grid: string                // checker line/fill base color ('#000' or '#fff')
  gridAlpha: number           // how strongly the checker field reads
  accent: string              // year + wordmark + class name
  qrTile: boolean             // draw the QR on a light sticker tile (dark cards)
}

const CARBON_BG: React.CSSProperties = {
  // Real carbon-fibre weave (adapted from a CC BY-SA CSS carbon pattern).
  backgroundColor: 'rgb(28,28,30)',
  backgroundImage: [
    'linear-gradient(to right, rgba(0,0,0,1), rgba(0,0,0,0) 20%, rgba(0,0,0,0) 80%, rgba(0,0,0,1))',
    'linear-gradient(45deg, #0a0a0a 25%, transparent 25%, transparent 75%, #0a0a0a 75%, #0a0a0a)',
    'linear-gradient(45deg, #0a0a0a 25%, transparent 25%, transparent 75%, #0a0a0a 75%, #0a0a0a)',
    'linear-gradient(to bottom, rgb(10,10,12), rgb(30,30,34))',
  ].join(', '),
  backgroundSize: '100% 100%, 10px 10px, 10px 10px, 10px 5px',
  backgroundPosition: '0px 0px, 0px 0px, 5px 5px, 0px 0px',
}

const MATERIALS: Record<Grade['material'], Material> = {
  // Learner permit — cool-white laminate. Held once you add your first car.
  provisional: {
    bg: { background: 'linear-gradient(145deg, #f4f6f8 0%, #e3e6ea 55%, #d3d7dd 100%)' },
    ink: '#2c3038', inkDim: 'rgba(44,48,56,0.5)',
    rail: 'linear-gradient(180deg, #b8bcc4, #9aa0a8)', railInk: '#fbfcfe',
    grid: '#000', gridAlpha: 0.7, accent: '#2c3038', qrTile: false,
  },
  bronze: {
    bg: { background: 'linear-gradient(145deg, #b98a52 0%, #9c7040 55%, #855c30 100%)' },
    ink: '#2a1c0c', inkDim: 'rgba(42,28,12,0.6)',
    rail: 'linear-gradient(180deg, #7c5c30, #5e4522)', railInk: '#f3e4c6',
    grid: '#000', gridAlpha: 1, accent: '#3a2810', qrTile: false,
  },
  silver: {
    bg: { background: 'linear-gradient(145deg, #e8e8ea 0%, #c9c9cd 55%, #b8b8bd 100%)' },
    ink: '#1c1c20', inkDim: 'rgba(28,28,32,0.55)',
    rail: 'linear-gradient(180deg, #8a8a90, #6e6e74)', railInk: '#f5f5f5',
    grid: '#000', gridAlpha: 1, accent: '#1c1c20', qrTile: false,
  },
  gold: {
    bg: { background: 'linear-gradient(145deg, #e6c87c 0%, #d4ac54 55%, #c49a42 100%)' },
    ink: '#241a08', inkDim: 'rgba(36,26,8,0.6)',
    rail: 'linear-gradient(180deg, #9a7a2e, #7c5f1e)', railInk: '#f8ecd0',
    grid: '#000', gridAlpha: 1, accent: '#241a08', qrTile: false,
  },
  crimson: {
    bg: { background: 'linear-gradient(145deg, #5a1418 0%, #3e0d10 60%, #2a080a 100%)' },
    ink: '#f2e2d6', inkDim: 'rgba(242,226,214,0.6)',
    rail: 'linear-gradient(180deg, #7c1c20, #4a0f12)', railInk: '#f5e0d0',
    grid: '#fff', gridAlpha: 1, accent: '#f2e2d6', qrTile: true,
  },
  carbon: {
    bg: CARBON_BG,
    ink: '#f0ece0', inkDim: 'rgba(240,236,224,0.55)',
    rail: 'linear-gradient(180deg, #3a0a0c, #780E12)', railInk: '#f5e6c8',
    grid: '#fff', gridAlpha: 0.5, accent: '#f0ece0', qrTile: true,
  },
}


// ── Nürburgring-style dissolving checker field ──────────────────────────────
// A seeded scatter of filled cells (denser toward the right, dissolving left)
// plus grid lines that stop short with variation. Deterministic per seed, so it
// stays stable across renders.
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function CheckerField({ m, seed }: { m: Material; seed: number }) {
  const { lines, cells } = useMemo(() => {
    const rnd = mulberry32(seed)
    const W = 420, H = 264, cell = 21
    const cols = Math.floor(W / cell), rows = Math.ceil(H / cell)
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = []
    // vertical lines — the right third of them stop short at varying heights
    for (let i = 1; i < cols; i++) {
      const x = i * cell
      const rightish = i / cols
      const stops = rightish > 0.6 && rnd() < 0.55
      lines.push({ x1: x, y1: 0, x2: x, y2: stops ? Math.round((0.3 + rnd() * 0.45) * H) : H })
    }
    // horizontal lines — some run full width, others stop short on the right
    for (let j = 1; j < rows; j++) {
      const y = j * cell
      const stops = rnd() < 0.5
      lines.push({ x1: 0, y1: y, x2: stops ? Math.round((0.45 + rnd() * 0.4) * W) : W, y2: y })
    }
    // filled cells — probability rises toward the right edge (the dissolve)
    const cells: { x: number; y: number }[] = []
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const p = 0.04 + Math.pow(i / cols, 2.2) * 0.5
        if (rnd() < p) cells.push({ x: i * cell, y: j * cell })
      }
    }
    return { lines, cells }
  }, [seed])

  const stroke = m.grid === '#fff' ? `rgba(255,255,255,${0.14 * m.gridAlpha})` : `rgba(0,0,0,${0.12 * m.gridAlpha})`
  const fill = m.grid === '#fff' ? `rgba(255,255,255,${0.10 * m.gridAlpha})` : `rgba(0,0,0,${0.16 * m.gridAlpha})`
  return (
    <svg viewBox="0 0 420 264" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      {cells.map((c, i) => <rect key={`c${i}`} x={c.x} y={c.y} width={21} height={21} fill={fill} />)}
      {lines.map((l, i) => <line key={`l${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={stroke} strokeWidth={1} />)}
    </svg>
  )
}

// Grade rail with a live specular sheen — the "laminated card catching light".
// `still` drops the travelling sheen band (PermitMini uses it: that card lives
// in a dropdown that opens and closes constantly, where a looping highlight
// reads as noise rather than gloss). Passing it explicitly matters — the
// @keyframes are declared by the full card, so a `still={false}` rail rendered
// on its own would silently freeze mid-animation instead of holding a
// deliberate highlight.
// `w` narrows the rail for the compact PermitMini — the 52px default is scaled
// for the full 420px-wide card and reads as a slab on a 250px one.
export const RAIL_W = 52
export const RAIL_W_MINI = 34
function GradeRail({ grade, m, still, w = RAIL_W }: { grade: Grade; m: Material; still?: boolean; w?: number }) {
  const mini = w < RAIL_W
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: w, background: m.rail, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* static top-edge highlight */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(105deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 38%)', pointerEvents: 'none' }} />
      {/* moving sheen band */}
      {!still && <div style={{ position: 'absolute', left: '-60%', top: '-30%', width: '80%', height: '160%', background: 'linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.06) 35%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0.06) 65%, transparent 100%)', transform: 'skewX(-16deg)', animation: 'permitSheen 5s ease-in-out 1.5s infinite', pointerEvents: 'none' }} />}
      <span style={{ position: 'relative', transform: 'rotate(-90deg)', whiteSpace: 'nowrap', fontFamily: FONT_UI, fontWeight: 900, fontSize: grade.id === 'P' ? (mini ? 8.5 : 11) : (mini ? 10.5 : 14), letterSpacing: mini ? '0.22em' : '0.32em', color: m.railInk, textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}>
        {grade.id === 'P' ? 'PROVISIONAL' : <>GRADE&nbsp;&nbsp;{grade.id}</>}
      </span>
    </div>
  )
}

// QR (or a fallback dot) to the public profile, top-right of the front face.
function ProfileQR({ url, m }: { url: string; m: Material }) {
  const [png, setPng] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    QRCode.toDataURL(url, {
      margin: 0, width: 160, errorCorrectionLevel: 'M',
      color: { dark: m.qrTile ? '#141414' : m.ink, light: '#00000000' },
    }).then(d => { if (alive) setPng(d) }).catch(() => {})
    return () => { alive = false }
  }, [url, m.ink, m.qrTile])
  if (!png) return null
  return (
    <div style={{ position: 'absolute', right: 16, top: 15, width: 62, height: 62, ...(m.qrTile ? { background: '#f3efe6', padding: 5, borderRadius: 5, boxShadow: '0 1px 3px rgba(0,0,0,0.35)' } : { padding: 0 }) }}>
      <img src={png} alt="Scan for profile" width={m.qrTile ? 52 : 62} height={m.qrTile ? 52 : 62} style={{ display: 'block', width: '100%', height: '100%', imageRendering: 'pixelated' }} />
    </div>
  )
}

function Field({ label, value, m }: { label: string; value: string; m: Material }) {
  return (
    <div>
      <span style={{ display: 'inline-block', width: 84, fontWeight: 600, color: m.inkDim }}>{label}:</span>
      <span style={{ fontWeight: 800, color: m.ink }}>{value}</span>
    </div>
  )
}

function GradeFace({ grade, driver, handle, licensed, profileUrl, m, seed, hidden, spin }: {
  grade: Grade; driver: string; handle: string; licensed: string; profileUrl: string; m: Material; seed: number; hidden: boolean; spin?: boolean
}) {
  const contentStyle: CSSProperties = spin
    // Spin mode: only one face is mounted-visible at a time (the turntable swaps
    // them at edge-on), so content just stays visible — no opacity animation
    // (which is what iOS failed to repaint).
    ? { position: 'absolute', inset: 0, pointerEvents: 'none' }
    // Flip mode now does the same thing: the caller flips `hidden` at the
    // rotation's midpoint (edge-on, zero apparent width), so the swap is
    // invisible and NO opacity is animated. It used to cross-fade with delays,
    // which read as the text blipping out and in — especially on a second tap,
    // where a re-tap restarted both transitions mid-flight. Same lesson as the
    // celebration spin: don't animate opacity on these faces.
    : { position: 'absolute', inset: 0, display: hidden ? 'none' : undefined, pointerEvents: hidden ? 'none' : undefined }
  return (
    // The material BACKGROUND stays visible the whole flip (backface-visibility
    // handles solid backgrounds fine — so the card is seen turning). Only the
    // CONTENT layer (rail, text, QR, checker) is switched off at the flip's
    // midpoint (edge-on, invisible), because WebKit doesn't honor
    // backface-visibility for image/SVG children — that leak was the bug.
    <div style={{ position: 'absolute', inset: 0, borderRadius: 12, overflow: 'hidden', WebkitBackfaceVisibility: 'hidden', backfaceVisibility: 'hidden', ...m.bg }}>
      <div style={contentStyle}>
      <CheckerField m={{ ...m, gridAlpha: m.gridAlpha * 0.5 }} seed={seed} />
      <GradeRail grade={grade} m={m} />
      <div style={{ position: 'absolute', left: 52, top: 0, right: 0, bottom: 0, padding: '18px 20px' }}>
        <div style={{ fontFamily: FONT_UI, fontWeight: 900, fontSize: 17, letterSpacing: '0.02em', lineHeight: 1.15, textTransform: 'uppercase', color: m.ink, maxWidth: 200 }}>
          G-Dimension Permit<br />
          <span style={{ color: m.accent }}>{grade.className} Class</span>
        </div>
        <ProfileQR url={profileUrl} m={m} />
        <div style={{ marginTop: 15, fontSize: 12, lineHeight: 1.85, fontFamily: FONT_UI }}>
          <Field label="Driver" value={driver} m={m} />
          <Field label="Handle" value={handle} m={m} />
          <Field label="Licensed" value={licensed} m={m} />
        </div>
        <div style={{ position: 'absolute', left: 20, bottom: 15, fontFamily: FONT_UI, fontWeight: 900, fontSize: 22, color: m.accent }}>
          {new Date().getFullYear()}
        </div>
        <div style={{ position: 'absolute', right: 18, bottom: 14, fontFamily: FONT_UI, fontWeight: 900, fontStyle: 'italic', fontSize: 13, letterSpacing: '0.05em', color: m.accent }}>
          G-DIMENSION
        </div>
      </div>
      </div>
    </div>
  )
}

function ProgressFace({ next, toNext, m, seed, hidden, spin, flat }: { next: Grade | null; toNext: GradeProgress[]; m: Material; seed: number; hidden: boolean; spin?: boolean; flat?: boolean }) {
  const tickInk = (m.grid === '#000') ? '#fff' : '#1a0a0a'
  const contentStyle: CSSProperties = spin
    // Spin mode: the turntable presents this face head-on only while it's the
    // visible one, so content just stays put — no opacity animation.
    ? { position: 'absolute', inset: 0, pointerEvents: 'none' }
    // Flip mode: swapped at the rotation midpoint by the caller. See GradeFace.
    : { position: 'absolute', inset: 0, display: hidden ? 'none' : undefined, pointerEvents: hidden ? 'none' : undefined }
  return (
    // flat: presented face-on by the spin turntable, so the flip-mode 180°
    // pre-rotation (which the flipped container normally cancels out) is dropped.
    <div style={{ position: 'absolute', inset: 0, borderRadius: 12, overflow: 'hidden', transform: flat ? undefined : 'rotateY(180deg)', WebkitBackfaceVisibility: 'hidden', backfaceVisibility: 'hidden', ...m.bg }}>
      <div style={contentStyle}>
      <CheckerField m={m} seed={seed + 99} />
      <div style={{ position: 'absolute', inset: 0, padding: '14px 20px', display: 'flex', flexDirection: 'column' }}>
        {next ? (
          <>
            <div style={{ fontFamily: FONT_UI, fontWeight: 900, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: m.inkDim, marginBottom: 1 }}>
              Next Grade
            </div>
            <div style={{ fontFamily: FONT_UI, fontWeight: 900, fontSize: 16, letterSpacing: '0.02em', textTransform: 'uppercase', color: m.accent, marginBottom: 9 }}>
              {next.id} · {next.className}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4.5 }}>
              {toNext.map(p => (
                <div key={p.key + p.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flexShrink: 0, width: 15, height: 15, borderRadius: '50%', border: `1.5px solid ${p.done ? m.accent : m.inkDim}`, background: p.done ? m.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {p.done && <span style={{ color: tickInk, fontSize: 9, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                  </span>
                  <span style={{ flex: 1, fontFamily: FONT_UI, fontWeight: 600, fontSize: 12, color: p.done ? m.inkDim : m.ink, textDecoration: p.done ? 'line-through' : 'none' }}>
                    {p.label}
                  </span>
                  <span style={{ flexShrink: 0, fontFamily: FONT_UI, fontWeight: 800, fontSize: 11.5, color: p.done ? m.accent : m.inkDim }}>
                    {p.have}/{p.need}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ margin: 'auto', textAlign: 'center' }}>
            <div style={{ fontFamily: FONT_UI, fontWeight: 900, fontSize: 20, color: m.accent, letterSpacing: '0.04em' }}>TOP GRADE HELD</div>
            <div style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 13, color: m.inkDim, marginTop: 6 }}>You've maxed the permit. Legend.</div>
          </div>
        )}
        <div style={{ marginTop: 'auto', paddingTop: 6, fontFamily: FONT_UI, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: m.inkDim, opacity: 0.7 }}>
          Tap to flip back
        </div>
      </div>
      </div>
    </div>
  )
}

// Stable seed from the driver handle so each card's checker field is consistent.
function seedFrom(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h >>> 0
}

// ── PermitMini ──────────────────────────────────────────────────────────────
// The permit as an IDENTITY CHIP, for the visitor-facing driver card on
// /builds/:username. Same material system, grade rail and checker field as the
// full card, but static: no flip, no QR, no sheen animation (it lives inside a
// dropdown that can be opened and closed constantly — a looping sheen there
// would be noise, and the QR is redundant when you are already on the page it
// points to).
//
// A driver with no grade yet renders on the provisional laminate rather than
// falling back to a neutral panel, so the card is always a permit.
export function PermitMini({ grade, driver, handle, location, bio, avatarUrl, footer }: {
  grade: Grade | null
  driver: string
  handle: string
  location?: string | null
  bio?: string | null
  avatarUrl?: string | null
  footer?: React.ReactNode
}) {
  const g = grade ?? GRADES[0]
  const m = MATERIALS[g.material]
  const seed = useMemo(() => seedFrom(handle || driver || 'g'), [handle, driver])
  // Dark materials (crimson/carbon) need light hairlines; light ones need dark.
  const hair = m.grid === '#fff' ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.16)'

  return (
    <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', boxShadow: '0 16px 44px rgba(0,0,0,0.5)', ...m.bg }}>
      <CheckerField m={{ ...m, gridAlpha: m.gridAlpha * 0.45 }} seed={seed} />
      <GradeRail grade={g} m={m} still w={RAIL_W_MINI} />

      <div style={{ position: 'relative', marginLeft: RAIL_W_MINI }}>
        <div style={{ padding: '10px 12px 10px' }}>
          {/* Permit header — the document title, exactly as on the full card.
              Kicker and class sit on one baseline to save a whole row. */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: FONT_UI, fontWeight: 900, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: m.inkDim }}>
              Permit
            </span>
            <span style={{ fontFamily: FONT_UI, fontWeight: 900, fontSize: 12, letterSpacing: '0.02em', textTransform: 'uppercase', color: m.accent }}>
              {g.className} Class
            </span>
          </div>

          {/* Photo + name, the way a licence carries them. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 9 }}>
            <div style={{
              width: 36, height: 36, flexShrink: 0, overflow: 'hidden',
              border: `1px solid ${hair}`, background: m.rail,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {avatarUrl
                ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontFamily: FONT_UI, fontWeight: 900, fontSize: 15, color: m.railInk }}>
                    {(driver || handle || '?').charAt(0).toUpperCase()}
                  </span>}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 13, color: m.ink, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {driver}
              </div>
              <div style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 10.5, color: m.inkDim, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                @{handle}
              </div>
            </div>
          </div>

          {location && (
            <div style={{
              marginTop: 8, fontFamily: FONT_UI, fontWeight: 700, fontSize: 10.5, lineHeight: 1.3, color: m.ink,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{location}</div>
          )}

          {bio && (
            <p style={{
              margin: '8px 0 0', paddingTop: 7, borderTop: `1px solid ${hair}`,
              fontFamily: FONT_UI, fontWeight: 500, fontSize: 11, lineHeight: 1.45, color: m.ink, opacity: 0.85,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
            }}>{bio}</p>
          )}
        </div>

        {footer && <div style={{ borderTop: `1px solid ${hair}` }}>{footer}</div>}
      </div>
    </div>
  )
}

/** Ink colors for actions rendered into PermitMini's `footer`, per grade. */
export function permitInk(grade: Grade | null): { ink: string; dim: string; hair: string; wash: string } {
  const m = MATERIALS[(grade ?? GRADES[0]).material]
  const dark = m.grid === '#fff'
  return {
    ink: m.ink,
    dim: m.inkDim,
    hair: dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.16)',
    wash: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
  }
}

export default function LicenseCard({ grade, next, toNext, driver, handle, licensed, profileUrl, spin = false, spinDelay = '0s' }: {
  grade: Grade | null
  next: Grade | null
  toNext: GradeProgress[]
  driver: string
  handle: string
  licensed: string
  profileUrl: string
  spin?: boolean       // slow continuous Y-axis rotation (rank-up celebration)
  spinDelay?: string   // hold still (front-facing) this long before the spin starts
}) {
  // Tap-flip turntable — the SAME mechanism as the celebration spin above, just
  // driven by a tap instead of a clock. This is the third attempt and the
  // reasoning is worth keeping:
  //
  //   1. Cross-fading the two content layers blipped, because a re-tap restarted
  //      the delayed opacity transitions mid-flight.
  //   2. Swapping them at the exact midpoint leaked: `backface-visibility` does
  //      not apply to the content layer (WebKit ignores it for image/SVG
  //      children — see the note at the top of this file), so the front briefly
  //      printed on the back.
  //   3. Hiding early to dodge the leak left the card visibly BLANK mid-turn.
  //
  // All three fought the same root cause: a face was allowed to turn away from
  // the viewer. The celebration never has this problem because it doesn't allow
  // that — the rendered angle is clamped within ±90° and the visible face is
  // swapped at the edge-on instant, so there is no backface to leak and no gap
  // to fill. Same thing here: absolute angle animates 0↔180, but what's rendered
  // is always within ±90°, and both faces stay mounted with only the
  // toward-the-viewer one displayed.
  const flipBoxRef = useRef<HTMLDivElement>(null)
  const [flipFace, setFlipFace] = useState<'front' | 'back'>('front')
  const angleRef = useRef(0)        // absolute 0…180, survives interruptions
  const flipRafRef = useRef(0)
  const flipTargetRef = useRef(0)

  const runFlip = () => {
    const to = flipTargetRef.current === 0 ? 180 : 0
    flipTargetRef.current = to
    cancelAnimationFrame(flipRafRef.current)
    const from = angleRef.current
    // Scale the duration by the distance left, so interrupting a flip half-way
    // doesn't crawl through the remainder at full length.
    const dur = Math.max(120, FLIP_MS * (Math.abs(to - from) / 180))
    const t0 = performance.now()
    // ease-in-out quad — matches the feel of the CSS ease-in-out it replaces.
    const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - ((-2 * x + 2) ** 2) / 2)
    const tick = (now: number) => {
      const prog = Math.min(1, (now - t0) / dur)
      const a = from + (to - from) * ease(prog)
      angleRef.current = a
      const isBack = a > 90
      const render = isBack ? a - 180 : a
      if (flipBoxRef.current) flipBoxRef.current.style.transform = `rotateY(${render.toFixed(2)}deg)`
      setFlipFace(f => {
        const want = isBack ? 'back' : 'front'
        return f === want ? f : want
      })
      if (prog < 1) flipRafRef.current = requestAnimationFrame(tick)
    }
    flipRafRef.current = requestAnimationFrame(tick)
  }

  useEffect(() => () => cancelAnimationFrame(flipRafRef.current), [])
  const seed = useMemo(() => seedFrom(handle), [handle])

  // Spin turntable (see the SPIN_MS comment): rAF drives the rotation directly
  // on the element (no CSS animation, no React render per frame); React state
  // changes only at the two edge-on face swaps per revolution.
  const spinBoxRef = useRef<HTMLDivElement>(null)
  const [spinFace, setSpinFace] = useState<'front' | 'back'>('front')
  useEffect(() => {
    if (!spin) return
    const box = spinBoxRef.current
    if (!box) return
    const delay = msOf(spinDelay)
    let raf = 0
    let start = 0
    let back = false
    const tick = (t: number) => {
      if (start === 0) start = t
      const el = t - start - delay
      // Hold at 0° through the delay, then one revolution per SPIN_MS.
      const angle = el <= 0 ? 0 : ((el / SPIN_MS) * 360) % 360
      const isBack = angle > 90 && angle < 270
      // Present whichever face is toward the viewer at a rotation within ±90°.
      const render = isBack ? angle - 180 : angle >= 270 ? angle - 360 : angle
      if (isBack !== back) { back = isBack; setSpinFace(isBack ? 'back' : 'front') }
      box.style.transform = `rotateY(${render.toFixed(2)}deg)`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [spin, spinDelay])

  // Not licensed yet (no car AND no earned grade on record): a cool-white
  // pre-permit card prompting the first car. Once a car exists the holder is
  // Grade P (Provisional) and renders the full card below.
  if (!grade) {
    const m = MATERIALS.provisional
    return (
      <div style={{ width: '100%', maxWidth: 420, aspectRatio: '420 / 264', borderRadius: 12, overflow: 'hidden', position: 'relative', margin: '0 auto', boxShadow: '0 16px 34px rgba(0,0,0,0.4)', ...m.bg }}>
        <CheckerField m={{ ...m, gridAlpha: m.gridAlpha * 0.5 }} seed={seed} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, textAlign: 'center', padding: 24 }}>
          <div style={{ fontFamily: FONT_UI, fontWeight: 900, fontSize: 17, letterSpacing: '0.06em', textTransform: 'uppercase', color: m.ink }}>Provisional Permit</div>
          <div style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 13, color: m.inkDim, maxWidth: 240, lineHeight: 1.5 }}>Add your first car to earn your Provisional permit.</div>
        </div>
      </div>
    )
  }

  const m = MATERIALS[grade.material]

  // ── Spin mode (rank-up celebration): the rAF turntable ──
  // Both faces stay mounted (so the QR's decoded image survives the swaps) but
  // only the toward-the-viewer one is displayed; the swap lands at edge-on,
  // where the card has zero apparent width, so it's invisible.
  if (spin) {
    return (
      <div style={{ width: '100%', maxWidth: 420, margin: '0 auto', perspective: '1400px', WebkitTapHighlightColor: 'transparent' }}>
        <style>{'@keyframes permitSheen { 0% { transform: translateX(0) skewX(-16deg); } 55%,100% { transform: translateX(560%) skewX(-16deg); } }'}</style>
        <div ref={spinBoxRef} style={{
          position: 'relative', width: '100%', aspectRatio: '420 / 264',
          boxShadow: '0 16px 34px rgba(0,0,0,0.45)', borderRadius: 12,
          willChange: 'transform',
        }}>
          <div style={{ position: 'absolute', inset: 0, display: spinFace === 'front' ? 'block' : 'none' }}>
            <GradeFace grade={grade} driver={driver} handle={handle} licensed={licensed} profileUrl={profileUrl} m={m} seed={seed} hidden={false} spin />
          </div>
          <div style={{ position: 'absolute', inset: 0, display: spinFace === 'back' ? 'block' : 'none' }}>
            <ProgressFace next={next} toNext={toNext} m={m} seed={seed} hidden={false} spin flat />
          </div>
        </div>
      </div>
    )
  }

  // ── Flip mode (profile): tap to flip to the next-grade checklist ──
  // Structurally identical to spin mode above — no preserve-3d, no backface, both
  // faces mounted (so the QR's decoded image survives), only the one facing the
  // viewer displayed. rAF writes the transform straight to the element.
  return (
    <div style={{ width: '100%', maxWidth: 420, margin: '0 auto', perspective: '1400px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }} onClick={runFlip}>
      <style>{'@keyframes permitSheen { 0% { transform: translateX(0) skewX(-16deg); } 55%,100% { transform: translateX(560%) skewX(-16deg); } }'}</style>
      <div ref={flipBoxRef} style={{
        position: 'relative', width: '100%', aspectRatio: '420 / 264',
        boxShadow: '0 16px 34px rgba(0,0,0,0.45)', borderRadius: 12,
        willChange: 'transform',
      }}>
        <div style={{ position: 'absolute', inset: 0, display: flipFace === 'front' ? 'block' : 'none' }}>
          <GradeFace grade={grade} driver={driver} handle={handle} licensed={licensed} profileUrl={profileUrl} m={m} seed={seed} hidden={false} spin />
        </div>
        <div style={{ position: 'absolute', inset: 0, display: flipFace === 'back' ? 'block' : 'none' }}>
          <ProgressFace next={next} toNext={toNext} m={m} seed={seed} hidden={false} spin flat />
        </div>
      </div>
    </div>
  )
}
