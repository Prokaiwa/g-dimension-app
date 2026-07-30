// The G-Dimension Permit — an achievement-graded "driver's licence" (GT-style
// B → A → S ladder) that advances as the owner documents their build. It's the
// progression hook: every session has a next rung ("2 more mods to Grade A").
//
// v1 is computed 100% client-side from counts we already query — no migration.
// A later increment can persist the grade to users.license_grade so the public
// /builds driver card can show it without recomputing.
import { supabase } from './supabase'

export type GradeId = 'P' | 'C' | 'B' | 'A' | 'IA' | 'S'

// All stats are numeric so requirements compare uniformly; booleans are 0/1.
export type LicenseStats = {
  cars: number
  mods: number
  timeline: number
  services: number       // maintenance-type sessions
  details: number        // detail-type sessions (car washes)
  buildSheetPhotos: number
  diyGuides: number
  featuredPublished: number
  publicShared: number
  records: number        // mods + services + details — "did something to the car" (Grade C entry)
}

export type StatKey = keyof LicenseStats

export type GradeReq = { key: StatKey; need: number; label: string }

export type Grade = {
  id: GradeId
  className: string
  // Card material — keys into the styling in LicenseCard.tsx.
  material: 'provisional' | 'bronze' | 'silver' | 'gold' | 'crimson' | 'carbon'
  // ALL reqs must be met to HOLD this grade (grades are cumulative: a higher
  // grade's numeric thresholds supersede the lower ones).
  reqs: GradeReq[]
}

// The ladder, ascending. className is the single source of truth for the tier
// names shown on the card — change a name here and it updates everywhere.
export const GRADES: Grade[] = [
  {
    // Provisional (Learner) — the walkthrough reward. Adding your first car
    // makes you licensed; the ladder proper starts at Grade C.
    id: 'P', className: 'Provisional', material: 'provisional',
    reqs: [
      { key: 'cars', need: 1, label: 'Add your first car' },
    ],
  },
  {
    // Grade C — one substantive action, mod OR service (via the `records`
    // derived stat). Both a modder and a maintenance-only owner reach it in one
    // step, right after the car — no forced tour of other sections at the door.
    id: 'C', className: 'Street', material: 'bronze',
    reqs: [
      { key: 'records', need: 1, label: 'Log your first mod or service' },
    ],
  },
  {
    // Grade B — breadth kicks in here, once someone's invested enough to explore.
    id: 'B', className: 'Builder', material: 'silver',
    reqs: [
      { key: 'mods', need: 5, label: 'Log 5 mods' },
      { key: 'services', need: 2, label: 'Record 2 services' },
      { key: 'timeline', need: 2, label: 'Write 2 timeline entries' },
      { key: 'buildSheetPhotos', need: 1, label: 'Add a Build Sheet section photo' },
      { key: 'publicShared', need: 1, label: 'Share your build publicly' },
    ],
  },
  {
    id: 'A', className: 'Tuner', material: 'gold',
    reqs: [
      { key: 'mods', need: 15, label: 'Log 15 mods' },
      { key: 'services', need: 4, label: 'Record 4 services' },
      { key: 'timeline', need: 8, label: 'Write 8 timeline entries' },
      { key: 'buildSheetPhotos', need: 2, label: 'Fill 2 Build Sheet sections' },
      { key: 'diyGuides', need: 1, label: 'Publish a DIY install guide' },
    ],
  },
  {
    id: 'IA', className: 'Master', material: 'crimson',
    reqs: [
      { key: 'mods', need: 30, label: 'Log 30 mods' },
      { key: 'services', need: 8, label: 'Record 8 services' },
      { key: 'timeline', need: 20, label: 'Write 20 timeline entries' },
      { key: 'buildSheetPhotos', need: 4, label: 'Fill all 4 Build Sheet sections' },
      { key: 'diyGuides', need: 2, label: 'Publish 2 DIY guides' },
      { key: 'featuredPublished', need: 1, label: 'Publish your Featured magazine' },
    ],
  },
  {
    id: 'S', className: 'Legend', material: 'carbon',
    reqs: [
      { key: 'mods', need: 50, label: 'Log 50 mods' },
      { key: 'cars', need: 2, label: 'Build 2 cars' },
      { key: 'timeline', need: 40, label: 'Write 40 timeline entries' },
      { key: 'services', need: 12, label: 'Record 12 services' },
      { key: 'diyGuides', need: 4, label: 'Publish 4 DIY guides' },
    ],
  },
]

/** Look up a grade by its persisted id (e.g. from users.license_grade). */
export function gradeById(id: string | null | undefined): Grade | null {
  if (!id) return null
  return GRADES.find(g => g.id === id) ?? null
}

/** Compact chip colors for the public grade badge — the material's key tone. */
export const GRADE_CHIP: Record<GradeId, { bg: string; fg: string }> = {
  P:  { bg: '#c3c7cd', fg: '#2c3038' },
  C:  { bg: '#9c7040', fg: '#f3e4c6' },
  B:  { bg: '#8a8a90', fg: '#f7f7f8' },
  A:  { bg: '#c49a42', fg: '#241a08' },
  IA: { bg: '#5a1418', fg: '#f2e2d6' },
  S:  { bg: '#18181c', fg: '#c8661a' },
}

export type GradeProgress = {
  key: StatKey
  label: string
  have: number
  need: number
  done: boolean
}

export type LicenseState = {
  // null = not licensed yet (no car). Otherwise the highest grade held.
  current: Grade | null
  next: Grade | null
  // Checklist toward `next` (empty when already at the top grade).
  toNext: GradeProgress[]
}

function meets(stats: LicenseStats, g: Grade): boolean {
  return g.reqs.every(r => stats[r.key] >= r.need)
}

/**
 * Resolve the held grade: the highest grade for which every grade up to and
 * including it is fully met (cumulative — you can't skip a rung even if a
 * higher rung's counts happen to be satisfied). Returns the checklist toward
 * the next rung so the card can show "what's left".
 */
export function computeLicense(stats: LicenseStats): LicenseState {
  let heldIdx = -1
  for (let i = 0; i < GRADES.length; i++) {
    if (meets(stats, GRADES[i])) heldIdx = i
    else break
  }
  const current = heldIdx >= 0 ? GRADES[heldIdx] : null
  const next = GRADES[heldIdx + 1] ?? null
  const toNext: GradeProgress[] = next
    ? next.reqs.map(r => ({
        key: r.key, label: r.label,
        have: Math.min(stats[r.key], r.need), need: r.need,
        done: stats[r.key] >= r.need,
      }))
    : []
  return { current, next, toNext }
}

/** Gather every count the licence needs for one user. A handful of head-only
 *  counts + one cars row read — cheap, safe to call after the profile mounts. */
export async function getLicenseStats(uid: string): Promise<LicenseStats> {
  const empty: LicenseStats = {
    cars: 0, mods: 0, timeline: 0, services: 0, details: 0,
    buildSheetPhotos: 0, diyGuides: 0, featuredPublished: 0, publicShared: 0,
    records: 0,
  }

  const { data: carRows } = await supabase
    .from('cars')
    .select('id, is_public, featured_layout, build_sheet_power_photo, build_sheet_chassis_photo, build_sheet_exterior_photo, build_sheet_interior_photo')
    .eq('user_id', uid)
    .is('deleted_at', null)
  const cars = (carRows ?? []) as Array<{
    id: string; is_public: boolean | null; featured_layout: { published?: boolean } | null
    build_sheet_power_photo: string | null; build_sheet_chassis_photo: string | null
    build_sheet_exterior_photo: string | null; build_sheet_interior_photo: string | null
  }>
  if (cars.length === 0) return empty

  const carIds = cars.map(c => c.id)

  const publicShared = cars.some(c => c.is_public === true) ? 1 : 0
  const featuredPublished = cars.some(c => c.featured_layout?.published === true) ? 1 : 0
  const buildSheetPhotos = cars.reduce((n, c) =>
    n + (c.build_sheet_power_photo ? 1 : 0) + (c.build_sheet_chassis_photo ? 1 : 0)
      + (c.build_sheet_exterior_photo ? 1 : 0) + (c.build_sheet_interior_photo ? 1 : 0), 0)

  const [mods, timeline, services, details, diyGuides] = await Promise.all([
    // type='modification' matters here for the same reason it does in
    // getProfileStats: maintenance line items live in `jobs` and default to
    // status='installed', so without it every oil change counted toward "Log N
    // mods" — and `records` below then double-counted services, once through
    // mods and once through services. The permit is a ratchet (resolveLicense
    // never demotes), so tightening this can't take a grade away from anyone;
    // it only makes the remaining checklist honest.
    supabase.from('jobs').select('id', { count: 'exact', head: true }).in('car_id', carIds).eq('status', 'installed').eq('type', 'modification'),
    supabase.from('timeline_entries').select('id', { count: 'exact', head: true }).in('car_id', carIds),
    supabase.from('sessions').select('id', { count: 'exact', head: true }).in('car_id', carIds).eq('type', 'maintenance'),
    supabase.from('sessions').select('id', { count: 'exact', head: true }).in('car_id', carIds).eq('type', 'detail'),
    supabase.from('diy_guides').select('id', { count: 'exact', head: true }).in('car_id', carIds),
  ])

  const modsCount = mods.count ?? 0
  const servicesCount = services.count ?? 0
  const detailsCount = details.count ?? 0

  return {
    cars: cars.length,
    mods: modsCount,
    timeline: timeline.count ?? 0,
    services: servicesCount,
    details: detailsCount,
    buildSheetPhotos,
    diyGuides: diyGuides.count ?? 0,
    featuredPublished,
    publicShared,
    // "Did something to the car" — any mod, service, or detail. Backs Grade C's
    // single mod-OR-service requirement.
    records: modsCount + servicesCount + detailsCount,
  }
}

/**
 * The permit is a RATCHET (high-water mark): it never goes DOWN. Given the live
 * stats and the last-persisted grade id (users.license_grade), the effective
 * grade is the higher of the two — so selling/transferring a car, deleting a
 * mod, or going private can never demote someone from a rung they earned.
 *
 * Returns the LicenseState to display, plus `rankedUp` (the live grade exceeds
 * what was stored → a genuine new achievement worth celebrating) and `persistId`
 * (the grade to write back — always >= stored, never lower).
 */
// Cache the resolved permit in-memory so returning to Profile renders it
// instantly instead of blipping in after three round trips (profile → stats →
// stored grade). The blip wasn't just ugly: the card appearing pushed the rows
// below it down, so a tap aimed at "View public profile" could land on the
// permit instead. Same lifetime and sign-out handling as the profile cache.
let cachedLicense: LicenseState | null = null

// Device cache, for the COLD open. The in-memory cache above only helps within a
// session — a fresh launch still had to wait three round trips before the card
// appeared. Same precedent as the avatar thumbnail (getCachedAvatarThumb), and
// for the same reason: the grade is already known and it changes rarely, so
// re-deriving it before showing anything is a delay with no payoff.
//
// Only the grade IDS are persisted, never the checklist: `toNext` is live progress
// and a stale checklist would be a wrong statement about the user's build. So a
// cold open renders the correct card face immediately with an empty checklist,
// and the real counts fill in when the query lands.
const DEVICE_KEY = 'gdim_permit_grade'

export function getCachedLicense(): LicenseState | null {
  if (cachedLicense) return cachedLicense
  try {
    const raw = localStorage.getItem(DEVICE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as { current?: string; next?: string }
    const current = c.current ? GRADES.find(g => g.id === c.current) ?? null : null
    if (!current) return null
    const next = c.next ? GRADES.find(g => g.id === c.next) ?? null : null
    return { current, next, toNext: [] }
  } catch { return null }
}

export function setCachedLicense(l: LicenseState | null): void {
  cachedLicense = l
  try {
    if (!l?.current) localStorage.removeItem(DEVICE_KEY)
    else localStorage.setItem(DEVICE_KEY, JSON.stringify({ current: l.current.id, next: l.next?.id ?? null }))
  } catch { /* private mode: in-memory only */ }
}

export function clearLicenseCache(): void {
  cachedLicense = null
  // Cleared on sign-out: the next account on this browser must not inherit a
  // permit grade it hasn't earned.
  try { localStorage.removeItem(DEVICE_KEY) } catch { /* ignore */ }
}

export function resolveLicense(
  stats: LicenseStats,
  storedGradeId: string | null | undefined,
): LicenseState & { rankedUp: boolean; persistId: GradeId | null } {
  const live = computeLicense(stats)
  const liveIdx = live.current ? GRADES.indexOf(live.current) : -1
  const storedIdx = storedGradeId ? GRADES.findIndex(g => g.id === storedGradeId) : -1
  const effIdx = Math.max(liveIdx, storedIdx)

  const current = effIdx >= 0 ? GRADES[effIdx] : null
  const next = GRADES[effIdx + 1] ?? null
  // Checklist toward the next rung, from LIVE counts (honest about what's left).
  const toNext: GradeProgress[] = next
    ? next.reqs.map(r => ({
        key: r.key, label: r.label,
        have: Math.min(stats[r.key], r.need), need: r.need,
        done: stats[r.key] >= r.need,
      }))
    : []

  return {
    current, next, toNext,
    rankedUp: liveIdx > storedIdx,
    persistId: current?.id ?? null,
  }
}
