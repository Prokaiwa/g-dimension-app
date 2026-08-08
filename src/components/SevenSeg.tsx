// The pump LCD: a seven-segment readout on a twisted-nematic panel.
//
// Fuel is an aesthetic island (ADR-033), the way Parts Bin is kraft paper and
// Featured is a magazine. Its instrument is the display a pump actually carries.
//
// WHY THIS EXISTS AT ALL. The first pass rendered the headline figure as amber
// numerals on the amber hero, which was amber on amber, and at display size the
// black-and-orange blocks read as a generic high-contrast badge rather than as
// anything to do with a car. An LCD moves the colour story off amber entirely:
// amber becomes the PLACE (the hero photo and panel) and grey-green becomes the
// INSTRUMENT.
//
// THE GHOST SEGMENTS ARE THE WHOLE TRICK. A real LCD cannot hide its unlit
// segments; they sit there at a few percent contrast. That is why a digital
// clock reads as a physical object and a web font of numerals does not. So every
// digit draws all seven and dims the ones that are off.
//
// WHY POLYGONS AND NOT A FONT. DSEG is the obvious candidate and it would mean
// self-hosting a font file, which the app does for nothing else, and it still
// would not give per-segment opacity. Seven polygons per digit is less code than
// the loader would be.
//
// Colours are section-local by design, following MaintenancePage's own amber and
// the CW_* / INV_* constants on the session pages. Nothing here belongs in
// src/tokens: these are one island's materials, not app-wide values.

import type { CSSProperties, ReactNode } from 'react'

/** The lit segment ink. Near-black with a green cast, as a TN panel reads. */
export const LCD_INK = '#22281f'
/** The polarizer. Grey-green, darkening down the panel. */
export const LCD_FACE = 'linear-gradient(180deg,#b4bcae 0%,#a6ae9f 46%,#949d8f 100%)'
export const LCD_BEZEL = '#2a2f28'

/** Ink at a given strength, for labels and chart bars drawn on the same glass. */
export const lcdInk = (alpha: number) => `rgba(34,40,31,${alpha})`

// Geometry in a 12x22 box. The bevelled ends are what give the segments their
// mitred corners; square ends read as a bar chart, not a display.
const SEG: Record<string, string> = {
  a: '3,1 9,1 10,2 9,3 3,3 2,2',
  b: '10,2 11,3 11,9 10,10 9,9 9,3',
  c: '10,12 11,13 11,19 10,20 9,19 9,13',
  d: '3,19 9,19 10,20 9,21 3,21 2,20',
  e: '2,12 3,13 3,19 2,20 1,19 1,13',
  f: '2,2 3,3 3,9 2,10 1,9 1,3',
  g: '3,10 9,10 10,11 9,12 3,12 2,11',
}
const LIT: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc',
  '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
  '-': 'g',
}

const ON_OPACITY = 0.95
const OFF_OPACITY = 0.07

function Digit({ ch, h }: { ch: string; h: number }) {
  const lit = LIT[ch] ?? ''
  return (
    <svg viewBox="0 0 12 22" style={{ height: h, width: (h * 12) / 22, display: 'block' }} aria-hidden>
      {Object.entries(SEG).map(([k, pts]) => (
        <polygon key={k} points={pts} fill={LCD_INK}
                 opacity={lit.includes(k) ? ON_OPACITY : OFF_OPACITY} />
      ))}
    </svg>
  )
}

/** Decimal point and comma get their own narrow cells so the digits stay on a
 *  fixed pitch. A proportional gap here would make the number wobble as its
 *  value changed, which is the one thing a real readout never does. */
function Punct({ ch, h }: { ch: string; h: number }) {
  return (
    <svg viewBox="0 0 4 22" style={{ height: h, width: (h * 4) / 22, display: 'block' }} aria-hidden>
      <rect x="0.6" y="19" width="2.8" height="2.4" fill={LCD_INK} opacity={ON_OPACITY} />
      {ch === ',' && <rect x="1.1" y="21.2" width="1.5" height="1.8" fill={LCD_INK} opacity={ON_OPACITY} />}
    </svg>
  )
}

/**
 * A number on the glass. `value` is pre-formatted text, because how many
 * decimals a figure carries is a question about that figure, not about the
 * display.
 */
export function SevenSeg({ value, height, gap = 2, label }: {
  value: string
  height: number
  gap?: number
  label?: string
}) {
  return (
    <div
      role="img"
      aria-label={label ?? value}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap }}
    >
      {[...value].map((ch, i) =>
        ch === '.' || ch === ',' ? <Punct key={i} ch={ch} h={height} />
          : <Digit key={i} ch={ch} h={height} />)}
    </div>
  )
}

/**
 * The panel the readout sits on: polarizer, bezel, and one hard streak of glass.
 * Real pump displays sit behind a flat cover that catches the canopy light in a
 * single band, not a soft bloom.
 */
export function LcdPanel({ children, style, legend, unit }: {
  children: ReactNode
  style?: CSSProperties
  legend?: string
  unit?: string
}) {
  return (
    <div style={{
      position: 'relative',
      background: LCD_FACE,
      // 1px bezel, not 3: the mockup is drawn at 3x (1170px = 390pt) and every
      // fixed dimension here is that figure divided by three.
      boxShadow: `inset 0 0 0 1px ${LCD_BEZEL}, inset 0 1px 4px rgba(30,38,28,0.34), 0 3px 9px rgba(0,0,0,0.5)`,
      ...style,
    }}>
      {legend && (
        <span style={{
          position: 'absolute', left: 10, top: 7, zIndex: 2,
          fontWeight: 800, fontSize: 7, letterSpacing: '0.2em',
          textTransform: 'uppercase', color: lcdInk(0.45),
        }}>{legend}</span>
      )}
      {children}
      {unit && (
        <span style={{
          position: 'absolute', right: 10, bottom: 6, zIndex: 2,
          fontWeight: 800, fontSize: 10, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: lcdInk(0.55),
        }}>{unit}</span>
      )}
      <div style={{
        position: 'absolute', inset: 1, pointerEvents: 'none',
        background: 'linear-gradient(108deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0.05) 26%, rgba(255,255,255,0) 46%)',
      }} />
    </div>
  )
}
