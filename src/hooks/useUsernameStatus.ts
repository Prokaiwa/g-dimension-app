import { useEffect, useRef, useState } from 'react'
import {
  isReservedUsername,
  isUsernameAvailable,
  USERNAME_MIN_LEN,
  type UsernameStatus,
} from '../lib/userProfile'

// Debounced validity + availability for an (already normalized) handle.
// `current` is the user's existing username — leaving it unchanged counts as
// available so they aren't told their own handle is taken. `selfId` excludes the
// user's own row from the availability query.
//
// Shared by WelcomePage (signup claim) and ProfilePage (edit) so the two stay
// in lockstep.
export function useUsernameStatus(
  value: string,
  current: string,
  selfId: string | null,
): UsernameStatus {
  const [status, setStatus] = useState<UsernameStatus>('idle')
  const reqIdRef = useRef(0)

  useEffect(() => {
    if (!selfId || value.length === 0) { setStatus('idle'); return }
    if (value.length < USERNAME_MIN_LEN) { setStatus('short'); return }
    if (isReservedUsername(value)) { setStatus('reserved'); return }
    if (value === current) { setStatus('available'); return }

    setStatus('checking')
    const reqId = ++reqIdRef.current
    const t = setTimeout(async () => {
      const free = await isUsernameAvailable(value, selfId)
      if (reqId !== reqIdRef.current) return // superseded by a newer keystroke
      setStatus(free ? 'available' : 'taken')
    }, 400)
    return () => clearTimeout(t)
  }, [value, current, selfId])

  return status
}
