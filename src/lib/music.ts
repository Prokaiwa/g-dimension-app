// Background music — a single looping, streaming <audio> element (memory-light
// for a long track, unlike decoding the whole thing into a buffer). Separate
// from the UI sound effects (src/lib/sound.ts) and from their toggle: a user
// can want click sounds but not a music loop, or the reverse.
//
// Default ON. Browsers block autoplay until the first user gesture, so we try
// to start immediately and again on the first tap/key (whichever lands first).
// The iPhone hardware silent switch mutes this like any other web audio.
//
// Drop the track at: public/audio/music.mp3  (served at /audio/music.mp3).
// Until that file exists the element just fails to play — no crash.

import { configureAudioSession, reviveSfx } from './sound'

const MUSIC_KEY = 'gdim_music_enabled'
const MUSIC_SRC = '/audio/music.mp3'
const MUSIC_VOLUME = 0.35 // gentle bed, never competes with UI sfx

export function isMusicEnabled(): boolean {
  // default ON: only an explicit '0' disables it
  try { return localStorage.getItem(MUSIC_KEY) !== '0' } catch { return true }
}

export function setMusicEnabled(on: boolean): void {
  try { localStorage.setItem(MUSIC_KEY, on ? '1' : '0') } catch { /* private mode */ }
  if (on) void startMusic()
  else stopMusic()
}

// Whether the current screen permits music. Off by default so it never plays
// on the landing / auth / public build pages (a random visitor to someone's
// shared build shouldn't get autoplaying music, and they have no toggle).
// App flips this on for authenticated in-app routes.
let allowed = false

export function setMusicAllowed(on: boolean): void {
  allowed = on
  if (on) void startMusic()
  else stopMusic()
}

let el: HTMLAudioElement | null = null

function ensureEl(): HTMLAudioElement {
  if (!el) {
    // Set the ambient audio session BEFORE the element exists/plays, so iOS never
    // registers this <audio> with the system Now-Playing / lock-screen controls.
    configureAudioSession()
    el = new Audio(MUSIC_SRC)
    el.loop = true
    el.volume = MUSIC_VOLUME
    el.preload = 'auto'
  }
  return el
}

export async function startMusic(): Promise<void> {
  if (!isMusicEnabled() || !allowed) return
  const a = ensureEl()
  try {
    await a.play()
    // The music element just (re)started, so the audio session is active. This is
    // the reliable moment to revive the Web Audio sfx context too — unlike this
    // <audio> element, Web Audio doesn't auto-resume after an interruption, which
    // is why tap sounds died on return while music came back on its own.
    reviveSfx()
  } catch { /* needs a user gesture — initMusic re-arms one */ }
}

export function stopMusic(): void {
  if (el) el.pause()
}

// One-shot cinematic swell: lift the bed above its resting volume, hold, then
// ease back down. Used by the Timeline cold open so the music rises with the
// title moment. No-ops when music is off / not playing, and restores the
// resting volume even if interrupted.
let swellRaf = 0
export function swellMusic(): void {
  if (!el || el.paused) return
  const base = MUSIC_VOLUME
  const dipV = 0.16, peak = 0.7        // breathe in (duck), then swell up
  const dip = 240, up = 950, hold = 450, down = 1700
  const total = dip + up + hold + down
  const start = performance.now()
  cancelAnimationFrame(swellRaf)
  const easeOut = (p: number) => 1 - Math.pow(1 - p, 3)
  const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2)
  const tick = (now: number) => {
    if (!el) return
    const t = now - start
    let v = base
    if (t < dip) v = base + (dipV - base) * easeInOut(t / dip)
    else if (t < dip + up) v = dipV + (peak - dipV) * easeOut((t - dip) / up)
    else if (t < dip + up + hold) v = peak
    else if (t < total) v = peak + (base - peak) * easeInOut((t - dip - up - hold) / down)
    el.volume = Math.min(1, Math.max(0, v))
    if (t < total) swellRaf = requestAnimationFrame(tick)
    else el.volume = base
  }
  swellRaf = requestAnimationFrame(tick)
}

// Call once at app start. Tries to play now (likely blocked pre-gesture), then
// starts on the first user interaction. Also pauses when the tab is hidden and
// resumes when it returns, so the loop doesn't run in the background forever.
let armed = false
export function initMusic(): void {
  if (armed) return
  armed = true

  void startMusic()

  const onFirstGesture = () => {
    void startMusic()
    window.removeEventListener('pointerdown', onFirstGesture)
    window.removeEventListener('touchstart', onFirstGesture)
    window.removeEventListener('keydown', onFirstGesture)
  }
  window.addEventListener('pointerdown', onFirstGesture)
  window.addEventListener('touchstart', onFirstGesture)
  window.addEventListener('keydown', onFirstGesture)

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopMusic()
    else void startMusic()
  })
}
