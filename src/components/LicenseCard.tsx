// The G-Dimension Permit card — a DMSB-style graded driver's licence shown on
// the owner's Profile. Tap to flip: front = the permit (grade rail with a live
// sheen + a QR to the public profile), back = the next-grade checklist over a
// Nürburgring-style dissolving checker field.
//
// Card material follows the grade (bronze → silver → gold → crimson → carbon,
// the last a real carbon-fibre weave); the pre-first-car state is a cool-white
// provisional permit.
import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import type { Grade, GradeProgress } from '../lib/license'
import { FONT_UI } from '../tokens'

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

const PROVISIONAL: Material = {
  bg: { background: 'linear-gradient(145deg, #f4f6f8 0%, #e3e6ea 55%, #d3d7dd 100%)' },
  ink: '#2c3038', inkDim: 'rgba(44,48,56,0.5)',
  rail: 'linear-gradient(180deg, #b8bcc4, #9aa0a8)', railInk: '#fbfcfe',
  grid: '#000', gridAlpha: 0.7, accent: '#2c3038', qrTile: false,
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
function GradeRail({ grade, m }: { grade: Grade; m: Material }) {
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 52, background: m.rail, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* static top-edge highlight */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(105deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 38%)', pointerEvents: 'none' }} />
      {/* moving sheen band */}
      <div style={{ position: 'absolute', left: '-60%', top: '-30%', width: '80%', height: '160%', background: 'linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.06) 35%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0.06) 65%, transparent 100%)', transform: 'skewX(-16deg)', animation: 'permitSheen 5s ease-in-out 1.5s infinite', pointerEvents: 'none' }} />
      <span style={{ position: 'relative', transform: 'rotate(-90deg)', whiteSpace: 'nowrap', fontFamily: FONT_UI, fontWeight: 900, fontSize: 14, letterSpacing: '0.32em', color: m.railInk, textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}>
        GRADE&nbsp;&nbsp;{grade.id}
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

function GradeFace({ grade, driver, handle, licensed, profileUrl, m, seed, hidden }: {
  grade: Grade; driver: string; handle: string; licensed: string; profileUrl: string; m: Material; seed: number; hidden: boolean
}) {
  return (
    // Belt-and-suspenders over backface-visibility (which WebKit doesn't always
    // honor for image/SVG children): the face's content is switched off at the
    // flip's midpoint (edge-on, so the swap is invisible) — kills the moment
    // where the front QR/text showed through the back.
    <div style={{ position: 'absolute', inset: 0, borderRadius: 12, overflow: 'hidden', WebkitBackfaceVisibility: 'hidden', backfaceVisibility: 'hidden', opacity: hidden ? 0 : 1, transition: 'opacity 0s linear 310ms', pointerEvents: hidden ? 'none' : undefined, ...m.bg }}>
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
  )
}

function ProgressFace({ next, toNext, m, seed, hidden }: { next: Grade | null; toNext: GradeProgress[]; m: Material; seed: number; hidden: boolean }) {
  const tickInk = (m.grid === '#000') ? '#fff' : '#1a0a0a'
  return (
    <div style={{ position: 'absolute', inset: 0, borderRadius: 12, overflow: 'hidden', transform: 'rotateY(180deg)', WebkitBackfaceVisibility: 'hidden', backfaceVisibility: 'hidden', opacity: hidden ? 0 : 1, transition: 'opacity 0s linear 310ms', pointerEvents: hidden ? 'none' : undefined, ...m.bg }}>
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
  )
}

// Stable seed from the driver handle so each card's checker field is consistent.
function seedFrom(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h >>> 0
}

export default function LicenseCard({ grade, next, toNext, driver, handle, licensed, profileUrl }: {
  grade: Grade | null
  next: Grade | null
  toNext: GradeProgress[]
  driver: string
  handle: string
  licensed: string
  profileUrl: string
}) {
  const [flipped, setFlipped] = useState(false)
  const seed = useMemo(() => seedFrom(handle), [handle])

  // Not licensed yet (no car): a cool-white provisional permit.
  if (!grade) {
    const m = PROVISIONAL
    return (
      <div style={{ width: '100%', maxWidth: 420, aspectRatio: '420 / 264', borderRadius: 12, overflow: 'hidden', position: 'relative', margin: '0 auto', boxShadow: '0 16px 34px rgba(0,0,0,0.4)', ...m.bg }}>
        <CheckerField m={{ ...m, gridAlpha: m.gridAlpha * 0.5 }} seed={seed} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, textAlign: 'center', padding: 24 }}>
          <div style={{ fontFamily: FONT_UI, fontWeight: 900, fontSize: 17, letterSpacing: '0.06em', textTransform: 'uppercase', color: m.ink }}>Provisional Permit</div>
          <div style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 13, color: m.inkDim, maxWidth: 240, lineHeight: 1.5 }}>Add your first car to earn your Grade C · Street permit.</div>
        </div>
      </div>
    )
  }

  const m = MATERIALS[grade.material]
  return (
    <div style={{ width: '100%', maxWidth: 420, margin: '0 auto', perspective: '1400px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }} onClick={() => setFlipped(f => !f)}>
      <style>{'@keyframes permitSheen { 0% { transform: translateX(0) skewX(-16deg); } 55%,100% { transform: translateX(560%) skewX(-16deg); } }'}</style>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '420 / 264', transformStyle: 'preserve-3d', transition: 'transform 620ms cubic-bezier(0.22,1,0.36,1)', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)', boxShadow: '0 16px 34px rgba(0,0,0,0.45)', borderRadius: 12 }}>
        <GradeFace grade={grade} driver={driver} handle={handle} licensed={licensed} profileUrl={profileUrl} m={m} seed={seed} hidden={flipped} />
        <ProgressFace next={next} toNext={toNext} m={m} seed={seed} hidden={!flipped} />
      </div>
    </div>
  )
}
