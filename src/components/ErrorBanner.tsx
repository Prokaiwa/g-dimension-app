import { useEffect, useState } from 'react'
import { isChunkLoadError } from '../lib/chunkReload'
import { COLOR_BRAND, COLOR_ACCENT_TEXT, FONT_UI, SPACE_SM } from '../tokens'

// Lightweight on-device error surface for phone testing. Catches uncaught
// errors and unhandled promise rejections and shows a dismissible banner, so
// failures are visible on a device with no console attached. Renders nothing
// until something actually goes wrong — safe to leave mounted in production,
// though it's intended for the current testing phase.
const MAX_VISIBLE = 4

// supabase-js auth-token refresh races its own Navigator Locks lock when a
// tab resumes after a long idle — one request "steals" the lock and the loser
// rejects with a lock error. It's benign and self-recovering (the refresh is
// retried), so it must not alarm anyone as a red banner.
const BENIGN = /lock:sb-.*-auth-token|Navigator LocksManager|lock .* was released|lock broken/i

export default function ErrorBanner() {
  const [errors, setErrors] = useState<string[]>([])

  useEffect(() => {
    function push(msg: string) {
      if (BENIGN.test(msg)) return
      // Failed chunk loads are already auto-handled by installChunkReloadGuard
      // (reload, capped). If one still surfaces here, the network is genuinely
      // struggling — say that in human words instead of a raw module error.
      if (isChunkLoadError(msg)) msg = 'Connection hiccup while loading — check your signal and pull down to refresh.'
      setErrors(prev => [...prev, msg].slice(-MAX_VISIBLE))
    }
    const onError = (e: ErrorEvent) => {
      const msg = e.message || (e.error instanceof Error ? e.error.message : 'Unknown error')
      const where = e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : ''
      push(`${msg}${where}`)
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason
      push(`Unhandled: ${r instanceof Error ? r.message : String(r)}`)
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  if (errors.length === 0) return null

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 1, paddingTop: 'env(safe-area-inset-top)' }}>
      {errors.map((msg, i) => (
        <div key={`${i}-${msg}`} style={{ background: COLOR_BRAND, color: COLOR_ACCENT_TEXT, fontFamily: FONT_UI, fontWeight: 600, fontSize: 12, lineHeight: 1.45, padding: `${SPACE_SM}px 12px`, display: 'flex', alignItems: 'flex-start', gap: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
          <span style={{ flex: 1, wordBreak: 'break-word' }}>{msg}</span>
          <button
            onClick={() => setErrors(prev => prev.filter((_, j) => j !== i))}
            aria-label="Dismiss"
            style={{ background: 'none', border: 'none', color: COLOR_ACCENT_TEXT, fontSize: 16, lineHeight: 1, cursor: 'pointer', padding: 0, flexShrink: 0, WebkitTapHighlightColor: 'transparent' }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
