import { getReportQueue, isAdmin } from './moderation'

// "There's something in the admin dashboard worth looking at."
//
// A single number, deliberately: the glow only needs to know whether the count
// is above zero, and one number keeps every surface that shows it in agreement.
// Today the only source is open moderation reports; when there are more (flagged
// accounts, failed jobs), they add into this same total rather than growing a
// second badge system.
//
// This is the in-app stand-in for real notifications. Once the app is native and
// has push, this becomes the local mirror of what was pushed — the surfaces
// reading it shouldn't need to change.

let cached: { count: number; at: number } | null = null
let inflight: Promise<number> | null = null

// The Home header asks on every mount. A short TTL keeps navigating around from
// re-querying, while still noticing a new report within a minute.
const TTL_MS = 60_000

async function fetchCount(): Promise<number> {
  if (!(await isAdmin())) return 0
  const rows = await getReportQueue()
  return rows.filter(r => r.status === 'open').length
}

/**
 * Open-attention count. Always 0 for non-admins (and it costs them one cheap
 * `is_admin` call, which short-circuits with no network when signed out).
 * Memoized with a 60s TTL, and de-duplicated so two surfaces mounting together
 * share one request.
 */
export async function getAdminAlertCount(): Promise<number> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.count
  if (inflight) return inflight
  inflight = fetchCount()
    .then(count => { cached = { count, at: Date.now() }; return count })
    .catch(() => 0)
    .finally(() => { inflight = null })
  return inflight
}

/**
 * Drop the memo so the next read is fresh. Call after actioning a report, so the
 * glow clears immediately rather than lingering for up to a minute.
 */
export function invalidateAdminAlert(): void { cached = null }
