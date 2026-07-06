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

// iOS/Safari: declare our audio as "ambient" (game/UI audio) instead of the
// default 'auto', which for an <audio> element resolves to 'playback'. Ambient
// audio does NOT surface the system Now-Playing / lock-screen media controls, so
// the app's music stays *contained in the app* like a game (e.g. Pokémon GO)
// rather than looking like a Spotify track; it mixes with other audio and is
// silenced by the ringer switch. Ambient is also more interruption-resilient,
// which helps tap sounds survive backgrounding. No-op where unsupported.
let audioSessionSet = false
export function configureAudioSession(): void {
  if (audioSessionSet) return
  try {
    const as = (navigator as unknown as { audioSession?: { type: string } }).audioSession
    if (as && 'type' in as) { as.type = 'ambient'; audioSessionSet = true }
  } catch { /* unsupported — ignore */ }
}

let ctx: AudioContext | null = null
let visibilityWired = false

function audioCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      configureAudioSession()
      ctx = new AC()
      // iOS Safari drops the context into 'interrupted' (or 'suspended') when
      // you leave the tab/app and come back, and it stays muted until something
      // resumes it — previously only a page refresh did, which is the "tap
      // sounds stop until I reload" bug. Resume when the tab returns to front.
      if (!visibilityWired && typeof document !== 'undefined') {
        visibilityWired = true
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden && ctx && ctx.state !== 'running') void ctx.resume()
        })
        // Also revive within a real user gesture: after an interruption iOS can
        // refuse resume() outside a gesture, so the visibilitychange resume
        // silently fails and taps stay muted. A capture-phase listener resumes
        // reliably, before the tap's own sound call runs.
        const revive = () => { if (ctx && ctx.state !== 'running') void ctx.resume() }
        window.addEventListener('pointerdown', revive, { capture: true, passive: true })
        window.addEventListener('touchstart', revive, { capture: true, passive: true })
      }
    }
    // Resume from ANY non-running state: 'suspended' (before the first gesture)
    // AND 'interrupted' (after returning from background) — not just 'suspended'.
    if (ctx.state !== 'running') void ctx.resume()
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

// ── File-based one-shots ──────────────────────────────────────────────────
// Some UI sounds are real audio files (Pixabay) rather than synthesized blips.
// Each is fetched once, decoded into an AudioBuffer through the same context,
// and played via a BufferSource (low latency, no <audio> element churn). If a
// file is missing or won't decode we mark it failed and fall back to the synth
// equivalent, so a sound always plays and a missing asset never crashes.
//
// Drop confirm at: public/audio/confirm.mp3  (served at /audio/confirm.mp3).
const CONFIRM_URL = '/audio/confirm.mp3'

// undefined = never tried, null = tried and failed, AudioBuffer = ready
const sampleCache = new Map<string, AudioBuffer | null>()

async function loadSample(url: string): Promise<AudioBuffer | null> {
  const existing = sampleCache.get(url)
  if (existing !== undefined) return existing
  const c = audioCtx()
  if (!c) return null
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(String(res.status))
    const arr = await res.arrayBuffer()
    const decoded = await c.decodeAudioData(arr)
    sampleCache.set(url, decoded)
    return decoded
  } catch {
    sampleCache.set(url, null) // remember the failure → permanent synth fallback
    return null
  }
}

function playSample(buf: AudioBuffer, peak = 0.9): void {
  const c = audioCtx()
  if (!c) return
  const src = c.createBufferSource()
  src.buffer = buf
  const g = c.createGain()
  g.gain.value = peak
  src.connect(g)
  g.connect(c.destination)
  src.start()
}

/** Decode the file-based sounds ahead of first use (call on first gesture). */
export function prewarmSfx(): void {
  if (!isSoundEnabled()) return
  void loadSample(CONFIRM_URL)
}

function synthConfirm(c: AudioContext): void {
  blip(c, c.currentTime, 1568, 1568, 0.3, 0.12, 'sine')
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

/** Timeline thread tick — a soft single ping with a faint octave-below warmth,
 *  quieter and rounder than the bright cursor tick, for the gliding orb. */
export function playThreadTick(): void {
  if (!isSoundEnabled()) return
  const c = audioCtx()
  if (!c) return
  const t = c.currentTime
  blip(c, t, 1318.5, 1318.5, 0.22, 0.05, 'sine')  // soft E6 ping
  blip(c, t, 659.25, 659.25, 0.26, 0.022, 'sine') // faint octave-below warmth
}

/** Enter-section / confirm — plays the Pixabay file if loaded, else the synth
 *  ping. Warms the file in the background on a cold call so the next one uses it. */
export function playConfirm(): void {
  if (!isSoundEnabled()) return
  const c = audioCtx()
  if (!c) return
  const cached = sampleCache.get(CONFIRM_URL)
  if (cached) { playSample(cached); return }
  if (cached === undefined) void loadSample(CONFIRM_URL) // warm for next time
  synthConfirm(c) // immediate sound now; also the permanent fallback if missing
}

/** Force-load the confirm sample regardless of the sfx toggle — for the START
 *  splash, whose chime should be ready even when UI sounds are off. */
export function prewarmSfxForced(): void {
  void loadSample(CONFIRM_URL)
}

/** Confirm chime that IGNORES the sfx-enabled toggle — the START splash is a
 *  deliberate one-shot "enter" sound (like pressing START in a game), so it
 *  plays even when the in-app UI sounds are switched off. */
export function playConfirmForced(): void {
  const c = audioCtx()
  if (!c) return
  const cached = sampleCache.get(CONFIRM_URL)
  if (cached) { playSample(cached); return }
  if (cached === undefined) void loadSample(CONFIRM_URL)
  synthConfirm(c)
}

/** Cancel / go-back — gentle falling sine (B2). */
export function playBack(): void {
  if (!isSoundEnabled()) return
  const c = audioCtx()
  if (!c) return
  blip(c, c.currentTime, 990, 740, 0.11, 0.13, 'sine')
}
