import { useEffect, useState } from 'react'
import { getAdminAlertCount } from '../lib/adminAlert'

/**
 * How many things are waiting in the admin dashboard. 0 for everyone who isn't
 * an admin, so a caller can render the glow unconditionally on `count > 0`.
 *
 * Re-reads when the tab comes back to the foreground — the case where a report
 * arrived while the app sat open in the background is exactly when a stale glow
 * would be wrong.
 */
export function useAdminAlert(): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    const read = () => { getAdminAlertCount().then(n => { if (!cancelled) setCount(n) }) }
    read()
    const onVis = () => { if (document.visibilityState === 'visible') read() }
    document.addEventListener('visibilitychange', onVis)
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVis) }
  }, [])

  return count
}
