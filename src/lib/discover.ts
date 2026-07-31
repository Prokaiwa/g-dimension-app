import { supabase } from './supabase'

// Discovery (migration 092, ADR-030).
//
// Guarded in the follows/moderation style: before 092 is applied, search
// returns nothing and the landing payload is empty, so a deploy that lands
// ahead of the migration shows an honest empty state instead of an error.
//
// Both RPCs read `public_car_profiles`, the same view /builds/* reads, so
// anything they return is already public. That is why they are callable
// signed out.

export type SearchHit = {
  kind: 'person' | 'build'
  user_id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  city: string | null
  country_code: string | null
  car_id: string | null
  car_label: string | null
  nickname: string | null
  photo_url: string | null
  build_count: number
  score: number
  sim: number | null
}

export type DiscoverBuild = {
  car_id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  label: string
  nickname: string | null
  photo_url: string | null
  city: string | null
  country_code: string | null
}

export type DiscoverHome = {
  total: number
  people: number
  models: { label: string; n: number }[]
  makes: { label: string; n: number }[]
  recent: DiscoverBuild[]
}

export const EMPTY_HOME: DiscoverHome = { total: 0, people: 0, models: [], makes: [], recent: [] }

/** Two characters is the floor. One matches half the corpus and reads as noise. */
export const MIN_QUERY = 2

export async function searchPublic(q: string, maxRows = 24): Promise<SearchHit[]> {
  const t = q.trim()
  if (t.length < MIN_QUERY) return []
  try {
    const { data, error } = await supabase.rpc('search_public', { q: t, max_rows: maxRows })
    if (error || !data) return []
    return data as SearchHit[]
  } catch { return [] }
}

export async function getDiscoverHome(maxRows = 12): Promise<DiscoverHome> {
  try {
    const { data, error } = await supabase.rpc('discover_home', { max_rows: maxRows })
    if (error || !data) return EMPTY_HOME
    const d = data as Partial<DiscoverHome>
    return {
      total:  Number(d.total) || 0,
      people: Number(d.people) || 0,
      models: d.models ?? [],
      makes:  d.makes ?? [],
      recent: d.recent ?? [],
    }
  } catch { return EMPTY_HOME }
}

/** Where a hit goes when tapped. A build pins its own car, not the active one. */
export function hitHref(h: SearchHit): string | null {
  if (!h.username) return null
  return h.kind === 'build' && h.car_id
    ? `/builds/${h.username}?car=${h.car_id}`
    : `/builds/${h.username}`
}

/** "2 builds" / "1 build". Used on person rows so the tap is predictable. */
export function buildCountLabel(n: number): string {
  return `${n} build${n === 1 ? '' : 's'}`
}
