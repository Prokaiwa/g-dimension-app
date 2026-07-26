// GT-style UI sounds, synthesized on-device with the Web Audio API.
// No audio assets, no network, no third-party service — an oscillator and a
// gain envelope per blip. iOS only allows audio after a user gesture, which
// is fine: every call site here is a tap handler. Note the iPhone hardware
// silent switch mutes web audio entirely.
//
// The preference is account-synced (users.sound_enabled, migration 068) —
// mirrors activeCar.ts's pattern: localStorage is an instant-load cache (every
// read here is synchronous, no await, so a tap never waits on a network round
// trip), the server column is the source of truth. This replaced a pure-
// localStorage design after iOS Safari was observed silently clearing it after
// a stretch of inactivity, resetting the toggle back to default with no way to
// notice except opening Settings. Default ON (migration 069), matching music —
// see syncSoundPrefFromServer.
import { supabase } from './supabase'

const SOUND_KEY = 'gdim_sound_enabled'

export function isSoundEnabled(): boolean {
  // default ON: only an explicit '0' disables it (matches music.ts)
  try { return localStorage.getItem(SOUND_KEY) !== '0' } catch { return true }
}

export function setSoundEnabled(on: boolean): void {
  try { localStorage.setItem(SOUND_KEY, on ? '1' : '0') } catch { /* private mode — toggle just won't persist */ }
  void syncSoundPrefToServer(on)
}

async function syncSoundPrefToServer(on: boolean): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await supabase.from('users').update({ sound_enabled: on }).eq('id', session.user.id)
  } catch { /* best effort — localStorage already has it */ }
}

/** Called once after sign-in (mirrors syncActiveCarFromServer). The server is
 *  the source of truth: seeds localStorage with the account's saved value so
 *  a wiped cache or a new device picks up the real preference instead of
 *  silently falling back to the default. */
export async function syncSoundPrefFromServer(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data } = await supabase.from('users').select('sound_enabled').eq('id', session.user.id).single()
    if (data) localStorage.setItem(SOUND_KEY, data.sound_enabled ? '1' : '0')
  } catch { /* best effort — the localStorage cache (or its default) still works */ }
}

// iOS/Safari: declare our audio as "ambient" (game/UI audio) instead of the
// default 'auto', which for an <audio> element resolves to 'playback'. Ambient
// audio does NOT surface the system Now-Playing / lock-screen media controls, so
// the app's music stays *contained in the app* like a game (e.g. Pokémon GO)
// rather than looking like a Spotify track; it mixes with other audio and is
// silenced by the ringer switch. Ambient is also more interruption-resilient.
// Re-callable (no permanent guard) so it can be re-asserted after an
// interruption. No-op where unsupported.
export function configureAudioSession(): void {
  try {
    const as = (navigator as unknown as { audioSession?: { type: string } }).audioSession
    if (as && 'type' in as) as.type = 'ambient'
  } catch { /* unsupported — ignore */ }
}

let ctx: AudioContext | null = null
let wired = false
// Set when we come back from the background: iOS may have parked the context in
// a dead state that resume() can't revive, so the NEXT sound rebuilds it fresh.
let needsRebuild = false

// Treat these as unrecoverable: 'closed' (we closed it) and the non-standard iOS
// 'interrupted' (after a phone call / Control Center / backgrounding, where
// resume() alone famously will NOT return the context to 'running' — a WebKit
// bug). The only reliable fix, like handling an AVAudioSession interruption in a
// native game, is to discard the context and make a new one.
function isDead(c: AudioContext): boolean {
  const s = c.state as string
  return s === 'closed' || s === 'interrupted'
}

function makeCtx(): AudioContext | null {
  const AC = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  configureAudioSession()
  const c = new AC()
  // If it ever reports 'interrupted', flag for a rebuild on the next sound.
  c.addEventListener('statechange', () => { if (isDead(c)) needsRebuild = true })
  return c
}

function audioCtx(): AudioContext | null {
  try {
    // Rebuild a context that died or that we flagged on background-return. The
    // decoded sample buffers belonged to the old context, so drop them too.
    if (ctx && (needsRebuild || isDead(ctx))) {
      try { void ctx.close() } catch { /* already gone */ }
      ctx = null
      needsRebuild = false
      sampleCache.clear()
    }
    if (!ctx) {
      ctx = makeCtx()
      if (!ctx) return null
      if (!wired && typeof document !== 'undefined') {
        wired = true
        // Back to foreground: the music <audio> element resumes on its own, so
        // the audio session is active again. Actively rebuild + resume the Web
        // Audio context NOW rather than waiting for a tap — Web Audio won't
        // auto-resume like a media element and can be stuck 'interrupted'. With
        // the session already active (music playing), iOS usually allows this
        // without a fresh gesture, so tap sounds come back on their own too.
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) reviveSfx()
        })
        // Gesture fallback (capture phase, before the tap's own sound call), for
        // the case where a foreground resume outside a gesture is still blocked.
        const revive = () => { audioCtx() }
        window.addEventListener('pointerdown', revive, { capture: true, passive: true })
        window.addEventListener('touchstart', revive, { capture: true, passive: true })
      }
    }
    // 'suspended' (pre-gesture) resumes fine; a gesture caller makes this stick.
    if (ctx.state !== 'running') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

// Bring the sfx audio back after an interruption. Rebuilds the context if it
// died, then resumes. Safe to call outside a gesture — it just may not take
// until the session is active (e.g. once the music element has resumed), which
// is exactly when the callers below fire it. No-op if audio can't init.
export function reviveSfx(): void {
  const c = audioCtx()
  if (c && c.state !== 'running') void c.resume()
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

// Like playSample, but returns a STOP handle that fades the gain out and stops
// the source. For the rank-up celebration, which needs to cut its track when the
// user dismisses. Uses a BufferSource + gain node (all Web Audio, one unlocked
// context) rather than an <audio> element, so there's no per-element iOS gesture
// unlock and no risk of a stray element playing over the music.
function playSampleStoppable(buf: AudioBuffer, peak = 0.9): () => void {
  const c = audioCtx()
  if (!c) return () => {}
  const src = c.createBufferSource()
  src.buffer = buf
  const g = c.createGain()
  g.gain.value = peak
  src.connect(g)
  g.connect(c.destination)
  src.start()
  return () => {
    try {
      const now = c.currentTime
      g.gain.cancelScheduledValues(now)
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now)
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.45)
      src.stop(now + 0.47)
    } catch { /* already stopped */ }
  }
}

/** Decode the file-based sounds ahead of first use (call on first gesture). */
export function prewarmSfx(): void {
  if (!isSoundEnabled()) return
  void loadSample(CONFIRM_URL)
}

function synthConfirm(c: AudioContext): void {
  blip(c, c.currentTime, 1568, 1568, 0.3, 0.12, 'sine')
}

// Rank-up celebration sting. Plays the Pixabay file if present, else a
// synthesized ascending major arpeggio with an octave shimmer — triumphant.
// Drop the track at: public/audio/rankup.mp3 (served at /audio/rankup.mp3).
const RANKUP_URL = '/audio/rankup.mp3'
// How long the celebration waits for the real track before the synth covers it.
const RANKUP_WAIT_MS = 4000

function synthRankUp(c: AudioContext): void {
  const t = c.currentTime
  // C5 · E5 · G5 · C6 ascending, then a bright G6 sparkle over the top.
  const arp: Array<[number, number]> = [[523.25, 0], [659.25, 0.11], [783.99, 0.22], [1046.5, 0.34]]
  for (const [f, at] of arp) blip(c, t + at, f, f, 0.5, 0.14, 'triangle')
  blip(c, t + 0.34, 1567.98, 1567.98, 0.7, 0.07, 'sine')
}

// The rank-up track plays through the SAME Web Audio context as the sfx above
// (decoded into an AudioBuffer), NOT a separate <audio> element. An <audio>
// element needs its own iOS gesture-unlock before its first play() — and the
// celebration fires from app state (after the tour), not a tap — so the element
// route silently fell back to the synth, and an unlock-on-gesture workaround let
// it leak audibly over the music. The context is already unlocked by the first
// tap (see audioCtx wiring), so a buffer source Just Works from app state, with
// no second element to fight the music. The ~2-minute track's decoded PCM is a
// few tens of MB held only after first play — an acceptable cost for the payoff.

/** Warm the rank-up track ahead of a likely celebration (call on the hub). */
export function prewarmRankUp(): void {
  if (!isSoundEnabled()) return
  void loadSample(RANKUP_URL) // fetch + decode so the celebration plays instantly
}

/**
 * Triumphant one-shot for a permit rank-up. Returns a STOP handle (fade out +
 * stop) so the celebration can cut the track when dismissed. Plays the decoded
 * Pixabay buffer if ready; if it isn't loaded (or failed) it falls back to the
 * short synth arpeggio and warms the file for next time.
 */
export function playRankUp(): () => void {
  if (!isSoundEnabled()) return () => {}
  const cached = sampleCache.get(RANKUP_URL)
  if (cached) return playSampleStoppable(cached, 0.95)

  // Not decoded yet (a cold PWA launch can reach the celebration before the
  // multi-MB track has landed). Settling for the synth here is what made the
  // real track "never play", so instead wait for the in-flight load and start
  // the moment it lands — the celebration runs ~6s before the card even fades
  // up, so a slightly late start still reads as intentional. If it can't make
  // the deadline, or the file is missing, the synth covers the moment.
  let stop: (() => void) | null = null
  let settled = false // something already played, or the caller dismissed us
  const synthFallback = () => {
    if (settled) return
    settled = true
    const c = audioCtx()
    if (c) synthRankUp(c)
  }
  const deadline = window.setTimeout(synthFallback, RANKUP_WAIT_MS)

  void loadSample(RANKUP_URL).then(buf => {
    window.clearTimeout(deadline)
    if (settled) return       // synth already covered it, or we were dismissed
    if (!buf) { synthFallback(); return }
    settled = true
    stop = playSampleStoppable(buf, 0.95)
  })

  return () => {
    window.clearTimeout(deadline)
    settled = true            // block a late start after dismissal
    stop?.()
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
