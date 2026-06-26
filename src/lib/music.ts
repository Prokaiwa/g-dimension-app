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

let el: HTMLAudioElement | null = null

function ensureEl(): HTMLAudioElement {
  if (!el) {
    el = new Audio(MUSIC_SRC)
    el.loop = true
    el.volume = MUSIC_VOLUME
    el.preload = 'auto'
  }
  return el
}

export async function startMusic(): Promise<void> {
  if (!isMusicEnabled()) return
  const a = ensureEl()
  try { await a.play() } catch { /* needs a user gesture — initMusic re-arms one */ }
}

export function stopMusic(): void {
  if (el) el.pause()
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
