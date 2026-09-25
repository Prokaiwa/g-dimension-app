// One line of text that fits its box: static when it fits, and when it does
// not, a slow back-and-forth pan so the whole thing can be read, the way a GT
// menu shows a long car name. Pause at the start, glide to the end, pause, glide
// back, repeat.
//
// Measured, not guessed: the pan distance is exactly how far the text overflows,
// re-measured when the box or the text changes size (a web font landing, a
// rotation). Under prefers-reduced-motion it never moves and ellipsizes instead.
//
// The full width comes from an invisible copy of the text, not the visible one:
// WebKit reports an ellipsized line at its truncated width, in both the span's
// rect and the box's scrollWidth, so on iOS the overflow always measured ~0.
import { useEffect, useRef, useState, type CSSProperties } from 'react'

const PX_PER_SEC = 28   // glide speed, slow enough to read while it moves
const HOLD_MS = 1600    // pause at each end
// Below this much overflow, clip instead of panning: an ellipsis still eats
// whole letters to make room for itself (a 1px overflow hid "GE" of GARAGE),
// while a hard clip loses at most a sliver of the last glyph, and a few-pixel
// pan would read as a twitch, not a reveal.
const PAN_MIN_PX = 8

export default function MarqueeText({ text, maxWidth, style }: { text: string; maxWidth: CSSProperties['maxWidth']; style?: CSSProperties }) {
  const boxRef = useRef<HTMLSpanElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const ghostRef = useRef<HTMLSpanElement>(null)
  const [overflow, setOverflow] = useState(0)
  const [reduced] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true)

  useEffect(() => {
    const box = boxRef.current, ghost = ghostRef.current
    if (!box || !ghost) return
    const measure = () => setOverflow(Math.max(0, Math.ceil(ghost.getBoundingClientRect().width - box.clientWidth)))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    ro.observe(ghost)
    return () => ro.disconnect()
  }, [text])

  useEffect(() => {
    const inner = textRef.current
    if (!inner || reduced || overflow < PAN_MIN_PX) return
    const glide = (overflow / PX_PER_SEC) * 1000
    const total = HOLD_MS * 2 + glide * 2
    const at = (ms: number) => ms / total
    const anim = inner.animate([
      { transform: 'translateX(0)', offset: 0 },
      { transform: 'translateX(0)', offset: at(HOLD_MS), easing: 'ease-in-out' },
      { transform: `translateX(${-overflow}px)`, offset: at(HOLD_MS + glide) },
      { transform: `translateX(${-overflow}px)`, offset: at(HOLD_MS * 2 + glide), easing: 'ease-in-out' },
      { transform: 'translateX(0)', offset: 1 },
    ], { duration: total, iterations: Infinity })
    return () => anim.cancel()
  }, [overflow, reduced])

  const moving = !reduced && overflow >= PAN_MIN_PX
  const nearlyFits = overflow > 0 && overflow < PAN_MIN_PX
  return (
    <span
      ref={boxRef}
      style={{
        ...style,
        position: 'relative',
        display: 'inline-block', maxWidth, overflow: 'hidden', whiteSpace: 'nowrap',
        verticalAlign: 'middle',
        textOverflow: moving || nearlyFits ? 'clip' : 'ellipsis',
      }}
    >
      <span ref={textRef} style={{ display: moving ? 'inline-block' : 'inline', willChange: moving ? 'transform' : undefined }}>
        {text}
      </span>
      {/* Invisible, unclipped copy that inherits the same font, case and
          tracking; its width is the text's true width. */}
      <span
        ref={ghostRef}
        aria-hidden="true"
        style={{ position: 'absolute', left: 0, top: 0, visibility: 'hidden', whiteSpace: 'nowrap', pointerEvents: 'none' }}
      >
        {text}
      </span>
    </span>
  )
}
