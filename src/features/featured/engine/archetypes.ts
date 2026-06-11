import type { Archetype, ModTier, Tier, Overlay } from './types'

// ─── Cascade constants (§3 — locked) ─────────────────────────────────────────
// Edit values here to tune; the matrix logic reads these, never hardcodes them.

export const EXOTIC_MAKES = new Set([
  'ferrari', 'lamborghini', 'mclaren', 'aston martin', 'lotus',
  'maserati', 'pagani', 'koenigsegg',
])

export const MUSCLE_MAKES = new Set([
  'ford', 'chevrolet', 'dodge', 'plymouth', 'pontiac', 'buick', 'oldsmobile',
])

export const MUSCLE_YEAR_CUTOFF = 1993

/** Mod-tier thresholds */
export const MOD_TIER_RESTRAINT_MAX = 3   // 0–3 = restraint
export const MOD_TIER_STREET_MAX    = 12  // 4–12 = street
// 13+ = full

/** High-Mileage overlay threshold (stored miles) */
export const HIGH_MILEAGE_THRESHOLD = 200_000

/** Survivor thresholds */
export const SURVIVOR_AGE_MIN  = 20
export const SURVIVOR_MOD_MAX  = 3

/** OEM+ age cap */
export const OEMPLUS_AGE_MAX   = 19  // age < 20

// ─── Mod-tier classifier ──────────────────────────────────────────────────────

export function classifyModTier(modCount: number): ModTier {
  if (modCount <= MOD_TIER_RESTRAINT_MAX) return 'restraint'
  if (modCount <= MOD_TIER_STREET_MAX)   return 'street'
  return 'full'
}

// ─── Archetype cascade (§3 primary archetype, first match wins) ───────────────

export function determineArchetype(
  usageType: string | null,
  make: string,
  year: number,
  age: number,
  modCount: number,
  _modCategories: string[],
): Archetype {
  const usage = usageType?.toLowerCase() ?? null

  // Step 1 — usage_type direct
  if (usage === 'track')   return 'TimeAttack'
  if (usage === 'drift')   return 'Drift'
  if (usage === 'drag')    return 'Drag'
  if (usage === 'show')    return 'ShowStance'
  if (usage === 'vip')     return 'VIP'
  if (usage === 'offroad') return 'OffRoad'
  if (usage === 'daily')   return 'Daily'

  // Step 2 — derived (usage = 'street' or null)
  const makeLower = make.toLowerCase()

  if (EXOTIC_MAKES.has(makeLower)) return 'Exotic'

  if (MUSCLE_MAKES.has(makeLower) && year <= MUSCLE_YEAR_CUTOFF) return 'Muscle'

  if (age >= SURVIVOR_AGE_MIN && modCount <= SURVIVOR_MOD_MAX) return 'Survivor'

  if (age < SURVIVOR_AGE_MIN && modCount >= 1 && modCount <= SURVIVOR_MOD_MAX)
    return 'OEMPlus'

  if (modCount >= 4) return 'StreetBuild'

  // Fallback
  return 'Daily'
}

// ─── High-Mileage overlay ─────────────────────────────────────────────────────

export function determineOverlay(
  currentMileage: number | null,
  engineOrigin: 'original' | 'swapped' | null,
): Overlay {
  if (
    currentMileage !== null &&
    currentMileage >= HIGH_MILEAGE_THRESHOLD &&
    engineOrigin === 'original'
  )
    return 'HighMileage'
  return null
}

// ─── Tier classifier ──────────────────────────────────────────────────────────

export function determineTier(chassisMatched: boolean, makeKnown: boolean): Tier {
  if (chassisMatched) return 1
  if (makeKnown)      return 2
  return 3
}
