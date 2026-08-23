// First-time guidance for someone who arrived from outside the app.
//
// The problem this solves is specific and physical: a printed trading card is
// handed to a stranger, they scan the QR, and `/c/:carId` drops them on the
// public car carousel. They see a car and two icons, and nothing tells them
// that a whole build sits behind them. They look, they close the tab. The
// carousel is the right landing (the car is what they scanned for), so the fix
// is not to move them, it is to point at the door.
//
// Two separate records, because they answer two different questions:
//
//   scan flag   — sessionStorage, "this tab began with a QR scan". Session
//                 scoped on purpose: it describes an arrival, not a person, and
//                 it must not still be true tomorrow. It is what makes the
//                 Choose button glow, and it is consumed the moment they act.
//
//   welcomed    — localStorage, "this device has already been welcomed to
//                 @user's map". Device scoped and permanent, so a second scan
//                 of the same card does not re-explain itself. Keyed BY
//                 USERNAME rather than a single global flag: being shown around
//                 one builder's garage tells you nothing about the next one.
//
// Nothing outside this file touches either key (the activeCar pattern).

const KEY_SCAN     = 'gdim_qr_scan'
const KEY_WELCOMED = 'gdim_pub_welcomed'

// Enough that a regular visitor is never re-welcomed to a profile they know,
// small enough that the record stays a handful of handles rather than a log of
// everywhere someone has been. Oldest drop off first.
const MAX_WELCOMED = 40

/** Records that this tab began at a scanned QR code. Called by `/c/:carId`. */
export function markScanArrival(carId: string): void {
  if (!carId) return
  try { sessionStorage.setItem(KEY_SCAN, carId) } catch { /* ignore */ }
}

/** True while a QR arrival is still unacknowledged. */
export function isScanArrival(): boolean {
  try { return !!sessionStorage.getItem(KEY_SCAN) } catch { return false }
}

/**
 * Spends the scan flag. Called the moment the visitor acts on the guidance
 * (taps through to the map, or dismisses the welcome), so the glow is a nudge
 * that happens once rather than an animation that follows them around.
 */
export function clearScanArrival(): void {
  try { sessionStorage.removeItem(KEY_SCAN) } catch { /* ignore */ }
}

function readWelcomed(): string[] {
  try {
    const raw = localStorage.getItem(KEY_WELCOMED)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Written by an older build or half-corrupt: keep only real handles rather
    // than letting a junk entry decide whether someone gets welcomed.
    return parsed.filter((v): v is string => typeof v === 'string').slice(-MAX_WELCOMED)
  } catch { return [] }
}

/**
 * Whether to show the welcome on @username's map. The caller adds the other
 * half of the condition (only anonymous visitors get it): a signed-in visitor
 * already knows what a build map is, and would read the explanation as noise.
 */
export function shouldWelcome(username: string | undefined): boolean {
  if (!username) return false
  return !readWelcomed().includes(username)
}

export function markWelcomed(username: string | undefined): void {
  if (!username) return
  const rows = readWelcomed().filter(u => u !== username)
  rows.push(username)
  try {
    localStorage.setItem(KEY_WELCOMED, JSON.stringify(rows.slice(-MAX_WELCOMED)))
  } catch { /* ignore */ }
}
