// The G-Dimension Permit card — a DMSB-style graded driver's licence shown on
// the owner's Profile. Tap to flip: front = the permit, back = the checklist
// toward the next grade (the "2 more mods to Grade A" pull-forward).
//
// Card material follows the grade (bronze → silver → gold → crimson → carbon).
// The watermark is the Home-map road loop — the app's own circuit.
import { useState } from 'react'
import type { Grade, GradeProgress } from '../lib/license'
import { FONT_UI, COLOR_BRAND, COLOR_ACCENT } from '../tokens'

// The Home-map road loop, closed into a single circuit outline (390×800 space).
const TRACK_PATH =
  'M 195 220 C 285 238, 350 310, 300 340 C 260 370, 302 396, 295 428 C 350 466, 345 550, 310 590 C 295 610, 283 619, 270 625 C 222 650, 168 648, 120 625 C 116 616, 105 600, 90 570 C 60 520, 74 474, 95 428 C 88 406, 70 392, 65 360 C 60 310, 125 252, 195 220 Z'

type Material = {
  bg: string
  ink: string           // primary text
  inkDim: string        // labels
  rail: string          // grade-rail gradient
  railInk: string
  track: string         // watermark stroke
  grid: string          // faint grid line color
  accent: string        // year + wordmark
}

const MATERIALS: Record<Grade['material'], Material> = {
  bronze: {
    bg: 'linear-gradient(145deg, #b98a52 0%, #9c7040 55%, #855c30 100%)',
    ink: '#2a1c0c', inkDim: 'rgba(42,28,12,0.6)',
    rail: 'linear-gradient(180deg, #7c5c30, #5e4522)', railInk: '#f3e4c6',
    track: '#5e4522', grid: '#000', accent: '#3a2810',
  },
  silver: {
    bg: 'linear-gradient(145deg, #e8e8ea 0%, #c9c9cd 55%, #b8b8bd 100%)',
    ink: '#1c1c20', inkDim: 'rgba(28,28,32,0.55)',
    rail: 'linear-gradient(180deg, #8a8a90, #6e6e74)', railInk: '#f5f5f5',
    track: '#8b2020', grid: '#000', accent: COLOR_BRAND,
  },
  gold: {
    bg: 'linear-gradient(145deg, #e6c87c 0%, #d4ac54 55%, #c49a42 100%)',
    ink: '#241a08', inkDim: 'rgba(36,26,8,0.6)',
    rail: 'linear-gradient(180deg, #9a7a2e, #7c5f1e)', railInk: '#f8ecd0',
    track: '#8b2020', grid: '#000', accent: COLOR_BRAND,
  },
  crimson: {
    bg: 'linear-gradient(145deg, #5a1418 0%, #3e0d10 60%, #2a080a 100%)',
    ink: '#f2e2d6', inkDim: 'rgba(242,226,214,0.6)',
    rail: 'linear-gradient(180deg, #7c1c20, #4a0f12)', railInk: '#f5e0d0',
    track: COLOR_ACCENT, grid: '#fff', accent: COLOR_ACCENT,
  },
  carbon: {
    bg: 'linear-gradient(145deg, #232327 0%, #141417 60%, #0c0c0e 100%)',
    ink: '#f0ece0', inkDim: 'rgba(240,236,224,0.55)',
    rail: 'linear-gradient(180deg, #3a0a0c, #780E12)', railInk: '#f5e6c8',
    track: COLOR_ACCENT, grid: '#fff', accent: COLOR_ACCENT,
  },
}

function GradeFace({ grade, driver, handle, licensed, m }: {
  grade: Grade; driver: string; handle: string; licensed: string; m: Material
}) {
  return (
    <div style={{ position: 'absolute', inset: 0, borderRadius: 12, overflow: 'hidden', background: m.bg, WebkitBackfaceVisibility: 'hidden', backfaceVisibility: 'hidden' }}>
      {/* faint grid */}
      <div style={{ position: 'absolute', inset: 0, opacity: m.grid === '#fff' ? 0.09 : 0.05, backgroundImage: `linear-gradient(0deg,${m.grid} 1px,transparent 1px),linear-gradient(90deg,${m.grid} 1px,transparent 1px)`, backgroundSize: '22px 22px' }} />
      {/* grade rail */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 52, background: m.rail, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ transform: 'rotate(-90deg)', whiteSpace: 'nowrap', fontFamily: FONT_UI, fontWeight: 900, fontSize: 14, letterSpacing: '0.32em', color: m.railInk }}>
          GRADE&nbsp;&nbsp;{grade.id}
        </span>
      </div>
      {/* body */}
      <div style={{ position: 'absolute', left: 52, top: 0, right: 0, bottom: 0, padding: '18px 20px' }}>
        <div style={{ fontFamily: FONT_UI, fontWeight: 900, fontSize: 17, letterSpacing: '0.02em', lineHeight: 1.15, textTransform: 'uppercase', color: m.ink }}>
          G-Dimension Permit<br />
          <span style={{ color: m.accent }}>{grade.className} Class</span>
        </div>
        {/* track watermark */}
        <svg viewBox="0 0 390 800" preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', right: 14, top: 12, width: 96, height: 92, opacity: 0.9 }}>
          <path d={TRACK_PATH} fill="none" stroke={m.track} strokeWidth={8} />
        </svg>
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

function Field({ label, value, m }: { label: string; value: string; m: Material }) {
  return (
    <div>
      <span style={{ display: 'inline-block', width: 84, fontWeight: 600, color: m.inkDim }}>{label}:</span>
      <span style={{ fontWeight: 800, color: m.ink }}>{value}</span>
    </div>
  )
}

function ProgressFace({ next, toNext, m }: { next: Grade | null; toNext: GradeProgress[]; m: Material }) {
  return (
    <div style={{ position: 'absolute', inset: 0, borderRadius: 12, overflow: 'hidden', background: m.bg, transform: 'rotateY(180deg)', WebkitBackfaceVisibility: 'hidden', backfaceVisibility: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, opacity: m.grid === '#fff' ? 0.09 : 0.05, backgroundImage: `linear-gradient(0deg,${m.grid} 1px,transparent 1px),linear-gradient(90deg,${m.grid} 1px,transparent 1px)`, backgroundSize: '22px 22px' }} />
      <div style={{ position: 'absolute', inset: 0, padding: '16px 20px', display: 'flex', flexDirection: 'column' }}>
        {next ? (
          <>
            <div style={{ fontFamily: FONT_UI, fontWeight: 900, fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: m.inkDim, marginBottom: 2 }}>
              Next Grade
            </div>
            <div style={{ fontFamily: FONT_UI, fontWeight: 900, fontSize: 17, letterSpacing: '0.02em', textTransform: 'uppercase', color: m.accent, marginBottom: 12 }}>
              {next.id} · {next.className}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, overflow: 'hidden' }}>
              {toNext.map(p => (
                <div key={p.key + p.label} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ flexShrink: 0, width: 16, height: 16, borderRadius: '50%', border: `1.5px solid ${p.done ? m.accent : m.inkDim}`, background: p.done ? m.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {p.done && <span style={{ color: m.bg.includes('#e8e8ea') || m.bg.includes('#e6c87c') ? '#fff' : '#1a0a0a', fontSize: 10, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                  </span>
                  <span style={{ flex: 1, fontFamily: FONT_UI, fontWeight: 600, fontSize: 12.5, color: p.done ? m.inkDim : m.ink, textDecoration: p.done ? 'line-through' : 'none' }}>
                    {p.label}
                  </span>
                  <span style={{ flexShrink: 0, fontFamily: FONT_UI, fontWeight: 800, fontSize: 12, color: p.done ? m.accent : m.inkDim }}>
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
        <div style={{ marginTop: 'auto', paddingTop: 8, fontFamily: FONT_UI, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: m.inkDim, opacity: 0.7 }}>
          Tap to flip back
        </div>
      </div>
    </div>
  )
}

export default function LicenseCard({ grade, next, toNext, driver, handle, licensed }: {
  grade: Grade | null
  next: Grade | null
  toNext: GradeProgress[]
  driver: string
  handle: string
  licensed: string
}) {
  const [flipped, setFlipped] = useState(false)

  // Not licensed yet (no car): a locked "provisional" card prompting the first step.
  if (!grade) {
    const m = MATERIALS.bronze
    return (
      <div style={{ width: '100%', maxWidth: 420, aspectRatio: '420 / 264', borderRadius: 12, overflow: 'hidden', background: m.bg, position: 'relative', margin: '0 auto', filter: 'grayscale(0.4) brightness(0.85)' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.05, backgroundImage: `linear-gradient(0deg,#000 1px,transparent 1px),linear-gradient(90deg,#000 1px,transparent 1px)`, backgroundSize: '22px 22px' }} />
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
      <div style={{ position: 'relative', width: '100%', aspectRatio: '420 / 264', transformStyle: 'preserve-3d', transition: 'transform 620ms cubic-bezier(0.22,1,0.36,1)', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)', boxShadow: '0 16px 34px rgba(0,0,0,0.45)', borderRadius: 12 }}>
        <GradeFace grade={grade} driver={driver} handle={handle} licensed={licensed} m={m} />
        <ProgressFace next={next} toNext={toNext} m={m} />
      </div>
    </div>
  )
}
