// The GT-style garage stage backdrop — the six layered gradient divs behind
// every car slide. Extracted verbatim from the inline copies that lived in
// GarageCarsPage and PublicGaragePage (real + SOLD-ghost slides in both), and
// also used by the trading-card generator (/dev/trading-cards).
//
// Renders ONLY the backdrop layers, as a fragment: the consumer owns the stage
// container (position: relative, overflow: hidden) and the slide's base radial
// background — the car, page counter, and SOLD stamp stack on top of these
// layers (car at zIndex 2, under the zIndex 4 vignette).
export default function GarageStageBackdrop() {
  return (
    <>
      {/* Vignette — stage only, doesn't touch info strip */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4,
        background: 'radial-gradient(ellipse 70% 65% at 50% 55%, transparent 20%, rgba(0,0,0,0.53) 58%, rgba(0,0,0,0.87) 100%)',
      }} />
      {/* 2. Garage door lines — thin every 11px + single fixed seam at 38% */}
      <div aria-hidden style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: '46%',
        backgroundImage: [
          'linear-gradient(to bottom, transparent calc(38% - 1.5px), rgba(0,0,0,0.39) calc(38% - 1.5px), rgba(0,0,0,0.39) calc(38% + 0.5px), rgba(255,255,255,0.09) calc(38% + 0.5px), rgba(255,255,255,0.09) calc(38% + 1.5px), transparent calc(38% + 1.5px))',
          'repeating-linear-gradient(to bottom, transparent 0px, transparent 10px, rgba(0,0,0,0.20) 10px, rgba(0,0,0,0.20) 10.5px, rgba(255,255,255,0.035) 10.5px, rgba(255,255,255,0.035) 11px)',
        ].join(', '),
      }} />
      {/* 3. Vertical frame rails — beveled: dark outer edge, dim face, light inner edge */}
      <div aria-hidden style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: '46%',
        backgroundImage: [
          'linear-gradient(to right, transparent calc(14% - 4px), rgba(0,0,0,0.32) calc(14% - 4px), rgba(0,0,0,0.32) calc(14% - 3px), rgba(255,255,255,0.04) calc(14% - 3px), rgba(255,255,255,0.04) calc(14% + 3px), rgba(255,255,255,0.11) calc(14% + 3px), rgba(255,255,255,0.11) calc(14% + 4px), transparent calc(14% + 4px))',
          'linear-gradient(to right, transparent calc(86% - 4px), rgba(255,255,255,0.11) calc(86% - 4px), rgba(255,255,255,0.11) calc(86% - 3px), rgba(255,255,255,0.04) calc(86% - 3px), rgba(255,255,255,0.04) calc(86% + 3px), rgba(0,0,0,0.32) calc(86% + 3px), rgba(0,0,0,0.32) calc(86% + 4px), transparent calc(86% + 4px))',
        ].join(', '),
      }} />
      {/* 4a. Top fade — dissolves the hard upper edge of the door lines */}
      <div aria-hidden style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: '46%',
        background: 'linear-gradient(to bottom, #07070a 0%, transparent 40%)',
        pointerEvents: 'none',
        zIndex: 1,
      }} />
      {/* 4. Floor line */}
      <div aria-hidden style={{
        position: 'absolute', bottom: '46%', left: 0, right: 0,
        height: 1, background: 'rgba(255,255,255,0.07)',
      }} />
      {/* 5. Floor — light pool where spotlight hits ground + subtle surface gradient */}
      <div aria-hidden style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '46%',
        background: [
          'radial-gradient(ellipse 140% 75% at 50% 35%, rgba(220,215,200,0.68) 0%, rgba(200,195,180,0.32) 38%, rgba(175,165,145,0.1) 62%, transparent 80%)',
          'linear-gradient(to bottom, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0.18) 100%)',
        ].join(', '),
      }} />
    </>
  )
}

// The slide's base radial that sits BEHIND the stage layers — exported so the
// trading-card generator can reproduce the exact carousel field; the carousel
// pages keep their own inline copies on the slide containers.
export const GARAGE_STAGE_BASE_BG =
  'radial-gradient(ellipse 90% 55% at 50% 58%, #272420 0%, #141210 40%, #0d0b09 62%, #07070a 100%)'
