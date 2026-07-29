import { useEffect, useRef, useState } from 'react'
import {
  isReservedUsername,
  isUsernameAvailable,
  USERNAME_MIN_LEN,
  type UsernameStatus,
} from '../lib/userProfile'
import { checkUsernameTerms } from '../lib/moderation'

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
      // Blocklist and availability in one debounced round trip. The blocklist
      // lives in the database (migration 084) rather than a bundled JSON file,
      // because the signup trigger mints handles from email addresses without
      // going through this form at all.
      const [rejection, free] = await Promise.all([
        checkUsernameTerms(value),
        isUsernameAvailable(value, selfId),
      ])
      if (reqId !== reqIdRef.current) return // superseded by a newer keystroke
      if (rejection) { setStatus('blocked'); return }
      setStatus(free ? 'available' : 'taken')
    }, 400)
    return () => clearTimeout(t)
  }, [value, current, selfId])

  return status
}
