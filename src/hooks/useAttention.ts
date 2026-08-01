import { useEffect, useState } from 'react'
import { getAttention, onAttentionChange, type Attention } from '../lib/attention'

const NONE: Attention = { notices: 0, reports: 0, total: 0 }

/**
 * What's waiting for the user on Profile: unread notices for everyone, plus the
 * open report queue for admins. All zeroes when there's nothing, so a caller can
 * render a glow unconditionally on `> 0`.
 *
 * Re-reads when the tab returns to the foreground: something arriving while the
 * app sits backgrounded is exactly when a stale glow would be wrong. Also
 * subscribes to `invalidateAttention`, so a surface that stays mounted while the
 * count changes under it — the Profile bell, with the notices sheet open over
 * it — updates instead of staying lit.
 */
export function useAttention(): Attention {
  const [value, setValue] = useState<Attention>(NONE)
  useEffect(() => {
    let cancelled = false
    const read = () => { getAttention().then(v => { if (!cancelled) setValue(v) }) }
    read()
    const onVis = () => { if (document.visibilityState === 'visible') read() }
    document.addEventListener('visibilitychange', onVis)
    const off = onAttentionChange(v => { if (!cancelled) setValue(v) })
    return () => { cancelled = true; off(); document.removeEventListener('visibilitychange', onVis) }
  }, [])
  return value
}
