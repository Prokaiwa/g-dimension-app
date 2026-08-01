import { getReportQueue, isAdmin } from './moderation'
import { getUnreadNoticeCount } from './notices'

// "There's something waiting for you on the Profile screen."
//
// ONE number for the whole app, deliberately: the glow only needs to know
// whether it's above zero, and a single source keeps every surface that shows it
// in agreement. It sums two things today —
//   • unread notices (everyone: a build hidden, an account restored)
//   • open moderation reports (admins only)
// — and anything added later (follows, transfers) adds in here rather than
// growing a parallel badge system.
//
// This is the in-app stand-in for real notifications. Once the app is native and
// has push, this becomes the local mirror of what was pushed, and the surfaces
// reading it shouldn't need to change.

export type Attention = {
  /** Unread notices — everyone. */
  notices: number
  /** Open moderation reports — admins only, 0 for everyone else. */
  reports: number
  /** What the avatar ring reads. */
  total: number
}

const NONE: Attention = { notices: 0, reports: 0, total: 0 }

let cached: { value: Attention; at: number } | null = null
let inflight: Promise<Attention> | null = null

// The Home header asks on every mount. A short TTL keeps navigating around from
// re-querying, while still noticing something new within a minute.
const TTL_MS = 60_000

async function fetchAttention(): Promise<Attention> {
  const [notices, admin] = await Promise.all([getUnreadNoticeCount(), isAdmin()])
  if (!admin) return { notices, reports: 0, total: notices }
  const rows = await getReportQueue()
  const reports = rows.filter(r => r.status === 'open').length
  return { notices, reports, total: notices + reports }
}

/**
 * What's waiting, broken down. The breakdown matters because the surfaces
 * differ: the avatar ring wants the total, while the Profile rows each want
 * their own number. One query keeps them from disagreeing.
 *
 * Memoized with a 60s TTL and de-duplicated so two surfaces mounting together
 * share one request.
 */
export async function getAttention(): Promise<Attention> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value
  if (inflight) return inflight
  inflight = fetchAttention()
    .then(value => { cached = { value, at: Date.now() }; return value })
    .catch(() => ({ ...NONE }))
    .finally(() => { inflight = null })
  return inflight
}

// Everything currently showing a count. Dropping the memo used to be enough
// because every surface re-mounted on navigation — reading notices was a route
// push, and coming back re-ran the hook. The Profile bell opens a SHEET now, so
// Profile never unmounts and the dot would sit there lit over an inbox you had
// just read. Invalidation has to be able to reach live surfaces, not only the
// next mount.
type Listener = (v: Attention) => void
const listeners = new Set<Listener>()

/** Subscribe to attention changes. Returns the unsubscribe. */
export function onAttentionChange(fn: Listener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/**
 * Drop the memo so the next read is fresh, then push the fresh value to every
 * mounted surface. Call after actioning a report or reading notices, so the
 * glow clears at once rather than lingering for the TTL.
 */
export function invalidateAttention(): void {
  cached = null
  if (listeners.size === 0) return
  getAttention().then(v => { for (const fn of listeners) fn(v) }).catch(() => { /* ignore */ })
}
