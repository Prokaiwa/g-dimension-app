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

export type BlipNote = {
  freqFrom: number
  freqTo?: number
  at?: number   // seconds offset from now
  dur?: number  // seconds
  peak?: number // 0..1
  type?: OscillatorType
}

/** Audition helper for the /sound-test dev page — bypasses the enabled toggle. */
export function playSequence(notes: BlipNote[]): void {
  const c = audioCtx()
  if (!c) return
  const t = c.currentTime
  for (const n of notes) {
    blip(c, t + (n.at ?? 0), n.freqFrom, n.freqTo ?? n.freqFrom, n.dur ?? 0.08, n.peak ?? 0.15, n.type ?? 'sine')
  }
}

/** Cursor-move tick — two tiny micro-blips 35ms apart (T5 on /sound-test). */
export function playTick(): void {
  if (!isSoundEnabled()) return
  const c = audioCtx()
  if (!c) return
  const t = c.currentTime
  blip(c, t, 2000, 2000, 0.03, 0.1, 'sine')
  blip(c, t + 0.035, 2600, 2600, 0.03, 0.1, 'sine')
}

/** Enter-section confirm — single bright G6 ping with a long tail (C5). */
export function playConfirm(): void {
  if (!isSoundEnabled()) return
  const c = audioCtx()
  if (!c) return
  blip(c, c.currentTime, 1568, 1568, 0.3, 0.12, 'sine')
}

/** Cancel / go-back — gentle falling sine (B2). */
export function playBack(): void {
  if (!isSoundEnabled()) return
  const c = audioCtx()
  if (!c) return
  blip(c, c.currentTime, 990, 740, 0.11, 0.13, 'sine')
}
