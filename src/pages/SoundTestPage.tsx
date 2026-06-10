// Route: /sound-test — dev tool, like /spec-test. An audition board for the
// synthesized UI sounds: every candidate tick/confirm/back variant in one
// place, playable on a real phone. Bypasses the Settings sound toggle (it's
// a listening room, not the app). iPhone: the hardware silent switch mutes
// web audio — flip the ringer on.
import { useNavigate } from 'react-router-dom'
import { playSequence, type BlipNote } from '../lib/sound'
import {
  GRADIENT_APP_BG,
  COLOR_HEADER_BLACK,
  COLOR_HEADER_WARM,
  COLOR_HEADER_TITLE,
  COLOR_ACCENT,
  FONT_UI,
  FONT_TITLE,
  HEADER_HEIGHT,
  SPACE_MD,
  SPACE_LG,
  SPACE_XL,
  RADIUS_BUTTON,
} from '../tokens'

const CREAM = '#f0e4c8'
const MUTED = 'rgba(240,228,200,0.5)'
const FAINT = 'rgba(240,228,200,0.32)'

type Variant = { id: string; name: string; desc: string; notes: BlipNote[]; current?: boolean }

const TICKS: Variant[] = [
  { id: 'T1', name: 'Current Tick', desc: 'Sine 2100→1400, 60ms — what ships today', current: true,
    notes: [{ freqFrom: 2100, freqTo: 1400, dur: 0.06, peak: 0.15, type: 'sine' }] },
  { id: 'T2', name: 'Soft High', desc: 'Plain 2000Hz sine, very short',
    notes: [{ freqFrom: 2000, dur: 0.045, peak: 0.12, type: 'sine' }] },
  { id: 'T3', name: 'Sharp Click', desc: 'Square wave, clicky and dry',
    notes: [{ freqFrom: 2400, dur: 0.035, peak: 0.09, type: 'square' }] },
  { id: 'T4', name: 'Wood Knock', desc: 'Triangle 1150→850, knocks like a menu cursor',
    notes: [{ freqFrom: 1150, freqTo: 850, dur: 0.07, peak: 0.16, type: 'triangle' }] },
  { id: 'T5', name: 'Double Micro', desc: 'Two tiny blips 35ms apart',
    notes: [{ freqFrom: 2000, dur: 0.03, peak: 0.1, type: 'sine' },
            { freqFrom: 2600, at: 0.035, dur: 0.03, peak: 0.1, type: 'sine' }] },
  { id: 'T6', name: 'Low Tap', desc: 'Triangle 880→660, warmer and rounder',
    notes: [{ freqFrom: 880, freqTo: 660, dur: 0.08, peak: 0.15, type: 'triangle' }] },
]

const CONFIRMS: Variant[] = [
  { id: 'C1', name: 'Current Confirm', desc: 'Two triangles 1100 + 1650 — what ships today', current: true,
    notes: [{ freqFrom: 1100, dur: 0.12, peak: 0.14, type: 'triangle' },
            { freqFrom: 1650, at: 0.07, dur: 0.12, peak: 0.14, type: 'triangle' }] },
  { id: 'C2', name: 'Major Third', desc: 'C6 → E6, musical and sweet',
    notes: [{ freqFrom: 1046, dur: 0.12, peak: 0.14, type: 'triangle' },
            { freqFrom: 1318, at: 0.07, dur: 0.13, peak: 0.14, type: 'triangle' }] },
  { id: 'C3', name: 'Perfect Fourth', desc: 'Sine pair, softer attack',
    notes: [{ freqFrom: 990, dur: 0.12, peak: 0.13, type: 'sine' },
            { freqFrom: 1320, at: 0.08, dur: 0.14, peak: 0.13, type: 'sine' }] },
  { id: 'C4', name: 'Three-Note Rise', desc: 'A5 → D6 → G6 arpeggio, grander',
    notes: [{ freqFrom: 880, dur: 0.1, peak: 0.12, type: 'triangle' },
            { freqFrom: 1175, at: 0.07, dur: 0.1, peak: 0.12, type: 'triangle' },
            { freqFrom: 1568, at: 0.14, dur: 0.13, peak: 0.12, type: 'triangle' }] },
  { id: 'C5', name: 'Bright Ping', desc: 'Single G6 sine with a long tail',
    notes: [{ freqFrom: 1568, dur: 0.3, peak: 0.12, type: 'sine' }] },
  { id: 'C6', name: 'Octave Sweep', desc: 'One note sweeping up an octave',
    notes: [{ freqFrom: 740, freqTo: 1480, dur: 0.12, peak: 0.14, type: 'triangle' }] },
]

const BACKS: Variant[] = [
  { id: 'B1', name: 'Current Back', desc: 'Triangle falling 1300→620 — what ships today', current: true,
    notes: [{ freqFrom: 1300, freqTo: 620, dur: 0.13, peak: 0.14, type: 'triangle' }] },
  { id: 'B2', name: 'Soft Drop', desc: 'Gentler sine fall',
    notes: [{ freqFrom: 990, freqTo: 740, dur: 0.11, peak: 0.13, type: 'sine' }] },
  { id: 'B3', name: 'Two-Note Down', desc: 'Reverse of the confirm pair',
    notes: [{ freqFrom: 1320, dur: 0.1, peak: 0.13, type: 'triangle' },
            { freqFrom: 880, at: 0.07, dur: 0.12, peak: 0.13, type: 'triangle' }] },
]

function VariantRow({ v }: { v: Variant }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: SPACE_MD, padding: '12px 0', borderBottom: '1px solid rgba(240,228,200,0.07)' }}>
      <button
        onPointerDown={() => playSequence(v.notes)}
        style={{
          flexShrink: 0, minWidth: 64, minHeight: 44,
          background: v.current ? COLOR_ACCENT : 'transparent',
          border: v.current ? 'none' : '1px solid rgba(240,228,200,0.25)',
          borderRadius: RADIUS_BUTTON,
          color: v.current ? '#fff5dc' : CREAM,
          fontFamily: FONT_UI, fontWeight: 800, fontSize: 12, letterSpacing: '0.06em',
          cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
        }}
      >
        {v.id}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 14, color: CREAM, margin: 0, lineHeight: 1.2 }}>{v.name}</p>
        <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 12, color: MUTED, margin: '2px 0 0' }}>{v.desc}</p>
      </div>
    </div>
  )
}

function Section({ title, sub, items }: { title: string; sub: string; items: Variant[] }) {
  return (
    <>
      <p style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: FAINT, margin: `${SPACE_XL}px 0 2px` }}>{title}</p>
      <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 12, color: MUTED, margin: '0 0 4px', lineHeight: 1.5 }}>{sub}</p>
      <div style={{ borderTop: '1px solid rgba(240,228,200,0.07)' }}>
        {items.map(v => <VariantRow key={v.id} v={v} />)}
      </div>
    </>
  )
}

export default function SoundTestPage() {
  const navigate = useNavigate()
  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: GRADIENT_APP_BG, fontFamily: FONT_UI, overflow: 'hidden' }}>
      {/* ── Header ── */}
      <div style={{ position: 'relative', height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center', paddingLeft: 10, flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <button onClick={() => navigate(-1)} aria-label="Back" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px 4px 4px', display: 'flex', alignItems: 'center' }}>
          <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
        </button>
        <span style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 22, color: COLOR_HEADER_TITLE, letterSpacing: '0.01em' }}>Sound Test</span>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: `${SPACE_LG}px ${SPACE_MD}px calc(${SPACE_XL}px + env(safe-area-inset-bottom))` }}>
        <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 12, color: MUTED, margin: 0, lineHeight: 1.6 }}>
          Every candidate UI sound, synthesized live on this device. These play regardless of the
          Settings sound toggle. iPhone: flip the ringer switch on — silent mode mutes web audio.
          Tell me the IDs you like and I'll wire them in.
        </p>
        <Section title="Ticks" sub="Plays when you press a destination node" items={TICKS} />
        <Section title="Confirms" sub="Plays when you enter a section" items={CONFIRMS} />
        <Section title="Backs" sub="Reserved for back navigation (not wired up yet)" items={BACKS} />
      </div>
    </div>
  )
}
