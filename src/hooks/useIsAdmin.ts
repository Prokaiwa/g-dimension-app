import { useEffect, useState } from 'react'
import { isAdmin } from '../lib/moderation'

/**
 * Admin status for gating owner-only UI. `null` while resolving, so callers can
 * render nothing rather than flashing a "Not available" screen at a real admin.
 *
 * This is presentation only. Every privileged ACTION re-derives admin status
 * server-side in its own RPC (migration 084), so a `true` forced in a debugger
 * unlocks a menu and nothing behind it.
 *
 * @param enabled pass false to skip the lookup entirely and resolve to false.
 *   Lets a caller avoid the round trip when admin status can't matter (e.g. the
 *   public profile only cares if `?tune` is in the URL) while still calling the
 *   hook unconditionally, as the rules of hooks require.
 */
export function useIsAdmin(enabled = true): boolean | null {
  const [admin, setAdmin] = useState<boolean | null>(null)
  useEffect(() => {
    if (!enabled) { setAdmin(false); return }
    let cancelled = false
    isAdmin().then(v => { if (!cancelled) setAdmin(v) })
    return () => { cancelled = true }
  }, [enabled])
  return admin
}
