// GT-style UI sounds, synthesized on-device with the Web Audio API.
// No audio assets, no network, no third-party service — an oscillator and a
// gain envelope per blip. iOS only allows audio after a user gesture, which
// is fine: every call site here is a tap handler. Note the iPhone hardware
// silent switch mutes web audio entirely.
//
// The preference is device-local (localStorage), default OFF.

const SOUND_KEY = 'gdim_sound_enabled'

export function isSoundEnabled(): boolean {
  try { return localStorage.getItem(SOUND_KEY) === '1' } catch { return false }
}

export function setSoundEnabled(on: boolean): void {
  try { localStorage.setItem(SOUND_KEY, on ? '1' : '0') } catch { /* private mode — toggle just won't persist */ }
}

let ctx: AudioContext | null = null

function audioCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      ctx = new AC()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function blip(
  c: AudioContext,
  at: number,
  freqFrom: number,
  freqTo: number,
  dur: number,
  peak: number,
  type: OscillatorType,
): void {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freqFrom, at)
  if (freqTo !== freqFrom) o.frequency.exponentialRampToValueAtTime(freqTo, at + dur * 0.8)
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(peak, at + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  o.connect(g)
  g.connect(c.destination)
  o.start(at)
  o.stop(at + dur + 0.02)
}

/** Cursor-move tick — short high blip with a fast pitch drop. */
export function playTick(): void {
  if (!isSoundEnabled()) return
  const c = audioCtx()
  if (!c) return
  blip(c, c.currentTime, 2100, 1400, 0.06, 0.15, 'sine')
}

/** Enter-section confirm — quick rising two-note blip. */
export function playConfirm(): void {
  if (!isSoundEnabled()) return
  const c = audioCtx()
  if (!c) return
  const t = c.currentTime
  blip(c, t, 1100, 1100, 0.12, 0.14, 'triangle')
  blip(c, t + 0.07, 1650, 1650, 0.12, 0.14, 'triangle')
}

/** Cancel / go-back — single falling note. */
export function playBack(): void {
  if (!isSoundEnabled()) return
  const c = audioCtx()
  if (!c) return
  blip(c, c.currentTime, 1300, 620, 0.13, 0.14, 'triangle')
}
