// Stale-chunk recovery.
//
// The app is built with hashed JS chunks (code-split routes + the dynamically
// imported heavy libs: transformers, heic-to, jspdf). A new deploy replaces
// those files. A tab left open/backgrounded for hours then resumed can try to
// load a chunk whose hash no longer exists — the server returns the HTML 404
// page, and the browser throws "'text/html' is not a valid JavaScript MIME
// type" / "Failed to fetch dynamically imported module". The page then sits
// broken until a manual refresh.
//
// This module auto-reloads once (capped, to avoid a loop on a genuinely broken
// deploy) whenever that signature is seen — from a route load, the idle
// prefetch, a heavy-lib import, or Vite's own preload-error event.

const KEY = 'gdim_chunk_reloads'
const MAX_RELOADS = 2 // per stale episode; reset after the app runs cleanly
let reloadedThisLoad = false

export function isChunkLoadError(reason: unknown): boolean {
  let msg = ''
  if (typeof reason === 'string') msg = reason
  else if (reason && typeof reason === 'object') {
    const r = reason as { name?: unknown; message?: unknown }
    msg = `${String(r.name ?? '')} ${String(r.message ?? '')}`
  }
  return /dynamically imported module|module script failed|valid JavaScript MIME type|Loading chunk|ChunkLoadError/i.test(msg)
}

/** Reload to fetch fresh chunk names. Returns true if a reload was triggered. */
export function reloadForStaleChunk(): boolean {
  if (reloadedThisLoad) return false
  try {
    const n = Number(sessionStorage.getItem(KEY) || 0)
    if (n >= MAX_RELOADS) return false
    sessionStorage.setItem(KEY, String(n + 1))
  } catch { /* sessionStorage blocked — the per-load flag still prevents a loop */ }
  reloadedThisLoad = true
  window.location.reload()
  return true
}

/** Global net: catch stale-chunk failures from anywhere and auto-reload. */
export function installChunkReloadGuard(): void {
  if (typeof window === 'undefined') return

  // Vite fires this when a lazy/preloaded chunk fails to load.
  window.addEventListener('vite:preloadError', (e: Event) => {
    e.preventDefault()
    reloadForStaleChunk()
  })

  window.addEventListener('unhandledrejection', (e) => {
    if (isChunkLoadError(e.reason)) reloadForStaleChunk()
  })

  window.addEventListener('error', (e) => {
    if (isChunkLoadError(e.message) || isChunkLoadError(e.error)) reloadForStaleChunk()
  })

  // Ran cleanly for a while → clear the counter so a *future* deploy can
  // recover again (each stale episode gets its own MAX_RELOADS budget).
  setTimeout(() => { try { sessionStorage.removeItem(KEY) } catch { /* ignore */ } }, 15_000)
}
