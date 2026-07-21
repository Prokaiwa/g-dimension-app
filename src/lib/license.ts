// The G-Dimension Permit — an achievement-graded "driver's licence" (GT-style
// B → A → S ladder) that advances as the owner documents their build. It's the
// progression hook: every session has a next rung ("2 more mods to Grade A").
//
// v1 is computed 100% client-side from counts we already query — no migration.
// A later increment can persist the grade to users.license_grade so the public
// /builds driver card can show it without recomputing.
import { supabase } from './supabase'

export type GradeId = 'C' | 'B' | 'A' | 'IA' | 'S'

// All stats are numeric so requirements compare uniformly; booleans are 0/1.
export type LicenseStats = {
  cars: number
  mods: number
  timeline: number
  services: number
  buildSheetPhotos: number
  diyGuides: number
  featuredPublished: number
  publicShared: number
}

export type StatKey = keyof LicenseStats

export type GradeReq = { key: StatKey; need: number; label: string }

export type Grade = {
  id: GradeId
  className: string
  // Card material — keys into the styling in LicenseCard.tsx.
  material: 'bronze' | 'silver' | 'gold' | 'crimson' | 'carbon'
  // ALL reqs must be met to HOLD this grade (grades are cumulative: a higher
  // grade's numeric thresholds supersede the lower ones).
  reqs: GradeReq[]
}

// The ladder, ascending. className is the single source of truth for the tier
// names shown on the card — change a name here and it updates everywhere.
export const GRADES: Grade[] = [
  {
    id: 'C', className: 'Street', material: 'bronze',
    reqs: [{ key: 'cars', need: 1, label: 'Add your first car' }],
  },
  {
    id: 'B', className: 'Builder', material: 'silver',
    reqs: [
      { key: 'mods', need: 5, label: 'Log 5 mods' },
      { key: 'timeline', need: 3, label: 'Write 3 timeline entries' },
      { key: 'services', need: 1, label: 'Record 1 service' },
    ],
  },
  {
    id: 'A', className: 'Tuner', material: 'gold',
    reqs: [
      { key: 'mods', need: 15, label: 'Log 15 mods' },
      { key: 'timeline', need: 10, label: 'Write 10 timeline entries' },
      { key: 'services', need: 5, label: 'Record 5 services' },
      { key: 'buildSheetPhotos', need: 1, label: 'Add a Build Sheet section photo' },
    ],
  },
  {
    id: 'IA', className: 'Master', material: 'crimson',
    reqs: [
      { key: 'mods', need: 25, label: 'Log 25 mods' },
      { key: 'timeline', need: 20, label: 'Write 20 timeline entries' },
      { key: 'diyGuides', need: 1, label: 'Publish a DIY install guide' },
      { key: 'featuredPublished', need: 1, label: 'Publish your Featured magazine' },
    ],
  },
  {
    id: 'S', className: 'Legend', material: 'carbon',
    reqs: [
      { key: 'mods', need: 50, label: 'Log 50 mods' },
      { key: 'cars', need: 2, label: 'Build 2 cars' },
      { key: 'timeline', need: 40, label: 'Write 40 timeline entries' },
      { key: 'services', need: 10, label: 'Record 10 services' },
      { key: 'publicShared', need: 1, label: 'Share your build publicly' },
    ],
  },
]

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
    cars: 0, mods: 0, timeline: 0, services: 0,
    buildSheetPhotos: 0, diyGuides: 0, featuredPublished: 0, publicShared: 0,
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

  const [mods, timeline, services, diyGuides] = await Promise.all([
    supabase.from('jobs').select('id', { count: 'exact', head: true }).in('car_id', carIds).eq('status', 'installed'),
    supabase.from('timeline_entries').select('id', { count: 'exact', head: true }).in('car_id', carIds),
    supabase.from('sessions').select('id', { count: 'exact', head: true }).in('car_id', carIds).eq('type', 'maintenance'),
    supabase.from('diy_guides').select('id', { count: 'exact', head: true }).in('car_id', carIds),
  ])

  return {
    cars: cars.length,
    mods: mods.count ?? 0,
    timeline: timeline.count ?? 0,
    services: services.count ?? 0,
    buildSheetPhotos,
    diyGuides: diyGuides.count ?? 0,
    featuredPublished,
    publicShared,
  }
}
