// Recent searches — the things you looked up, kept so you can get back to them.
//
// ON-DEVICE ONLY, and that is a decision rather than a shortcut. A server-side
// search history is a log of who someone looked at, which is a genuinely
// sensitive record to hold: it would sit in a table, be readable by a definer
// function someone writes later, and show up in a data export. It buys
// cross-device continuity, which is worth very little here, in exchange for a
// privacy liability that is permanent. localStorage keeps it on the device,
// disposable, and outside the database entirely.
//
// Follow the activeCar pattern: nothing outside this file touches the key.

const KEY = 'gdim_recent_searches'

// Eight is what fits above the fold next to the model chips. A longer list
// stops being "recent" and starts being a history nobody asked for.
const MAX = 8

export type RecentSearch = {
  kind: 'person' | 'build'
  /** Stable identity for dedupe: the user for a person, the car for a build. */
  id: string
  username: string
  label: string
  sub: string | null
  image: string | null
  at: number
}

function read(): RecentSearch[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Written by an older build, hand-edited, or half-corrupt: drop anything
    // that isn't shaped right rather than rendering a broken row.
    return parsed.filter((r): r is RecentSearch =>
      !!r && typeof r === 'object'
      && (r as RecentSearch).kind !== undefined
      && typeof (r as RecentSearch).id === 'string'
      && typeof (r as RecentSearch).username === 'string'
      && typeof (r as RecentSearch).label === 'string',
    ).slice(0, MAX)
  } catch { return [] }
}

function write(rows: RecentSearch[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(rows.slice(0, MAX))) } catch { /* ignore */ }
}

export function getRecentSearches(): RecentSearch[] {
  return read()
}

/**
 * Records a tap on a search result. Re-tapping something moves it to the front
 * rather than adding a duplicate, so the list stays a set ordered by recency.
 */
export function addRecentSearch(entry: Omit<RecentSearch, 'at'>): RecentSearch[] {
  if (!entry.id || !entry.username) return read()
  const rows = read().filter(r => !(r.kind === entry.kind && r.id === entry.id))
  const next = [{ ...entry, at: Date.now() }, ...rows]
  write(next)
  return next.slice(0, MAX)
}

export function removeRecentSearch(kind: RecentSearch['kind'], id: string): RecentSearch[] {
  const next = read().filter(r => !(r.kind === kind && r.id === id))
  write(next)
  return next
}

export function clearRecentSearches(): void {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}

/** Where a recent entry goes when tapped. Mirrors `hitHref`. */
export function recentHref(r: RecentSearch): string {
  return r.kind === 'build' ? `/builds/${r.username}?car=${r.id}` : `/builds/${r.username}`
}
