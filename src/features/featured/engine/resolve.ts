import type {
  CarProfile, VariantData, ModData, OwnerUnits, GateContext,
} from './types'
import {
  determineArchetype, determineOverlay, determineTier, classifyModTier,
} from './archetypes'
import { CHASSIS_DB } from './pools/chassis'
import { ENGINE_FAMILIES } from './pools/engines'

// ─── Sanity bounds (§4) ───────────────────────────────────────────────────────
const HP_MIN      = 40
const HP_MAX      = 2_500
const MILEAGE_MIN = 1_000
const MILEAGE_MAX = 600_000
const OWNERSHIP_MAX_YRS = 60

const CURRENT_YEAR = new Date().getFullYear()

// ─── Known-make set (for Tier classification) ─────────────────────────────────
// A make is "known" if it has a heritage pool in makes.ts.
// Import here lazily to avoid circular deps — just check the make pool keys.
import { MAKE_HERITAGE } from './pools/makes'

function makeIsKnown(make: string): boolean {
  const m = make.toLowerCase().trim()
  return MAKE_HERITAGE.some(entry => entry.make === m)
}

// ─── Normalization helpers ────────────────────────────────────────────────────

/** Uppercase, strip spaces and hyphens. */
function normalize(s: string): string {
  return s.toUpperCase().replace(/[\s-]/g, '')
}

// ─── Chassis resolution ───────────────────────────────────────────────────────

function resolveChassisCode(
  profile: CarProfile,
  variant: VariantData | null,
): string | null {
  const raw = variant?.chassis_code ?? profile.chassis_code ?? null
  if (!raw || raw.trim() === '') return null
  return normalize(raw.trim())
}

function chassisMatchesDB(
  code: string | null,
  make: string,
): boolean {
  if (!code) return false
  const makeLower = make.toLowerCase().trim()
  return CHASSIS_DB.some(entry =>
    entry.make.includes(makeLower) &&
    entry.codes.some(c => normalize(c) === code)
  )
}

// ─── Engine code resolution ───────────────────────────────────────────────────

function resolveEngineCode(
  profile: CarProfile,
  variant: VariantData | null,
): string | null {
  const raw = variant?.engine_code ?? profile.engine_type ?? null
  if (!raw || raw.trim() === '') return null
  return normalize(raw.trim())
}

function matchEngineFamily(
  code: string | null,
  make: string,
): string | null {
  if (!code) return null
  // BMW S14 collision guard: only matches when make = BMW
  if (code === 'S14') {
    return make.toLowerCase().trim() === 'bmw' ? 'BMWS14' : null
  }
  for (const family of ENGINE_FAMILIES) {
    for (const prefix of family.prefixes) {
      if (code.startsWith(prefix.toUpperCase().replace(/[\s-]/g, ''))) {
        return prefix  // use first matching prefix as family key
      }
    }
  }
  return null
}

// ─── Ownership years ──────────────────────────────────────────────────────────

function calcOwnershipYears(purchaseDate: string | null): number | null {
  if (!purchaseDate) return null
  const purchased = new Date(purchaseDate).getFullYear()
  const yrs = CURRENT_YEAR - purchased
  if (yrs < 0 || yrs > OWNERSHIP_MAX_YRS) return null
  return yrs
}

// ─── Donor data ───────────────────────────────────────────────────────────────

function extractDonor(mods: ModData[]): {
  hasDonorJob: boolean
  donorYear: number | null
  donorMake: string | null
  donorModel: string | null
} {
  const donor = mods.find(
    m => m.is_donor_part === true && m.status === 'installed',
  )
  if (!donor)
    return { hasDonorJob: false, donorYear: null, donorMake: null, donorModel: null }
  return {
    hasDonorJob: true,
    donorYear: donor.donor_year ?? null,
    donorMake: donor.donor_make ?? null,
    donorModel: donor.donor_model ?? null,
  }
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export function buildContext(
  profile: CarProfile,
  mods: ModData[],
  variant: VariantData | null,
  ownerUnits: OwnerUnits,
): GateContext {
  const installedMods = mods.filter(m => m.status === 'installed')
  const modCount = installedMods.length
  const modCategories = [...new Set(installedMods.map(m => m.category))]

  const age = CURRENT_YEAR - profile.year
  const ownershipYears = calcOwnershipYears(profile.purchase_date)
  const chassisCode = resolveChassisCode(profile, variant)
  const chassisMatched = chassisMatchesDB(chassisCode, profile.make)
  const engineCode = resolveEngineCode(profile, variant)
  const engineFamily = matchEngineFamily(engineCode, profile.make)

  const hp = profile.horsepower
  const hpInBounds =
    hp !== null && hp >= HP_MIN && hp <= HP_MAX

  const miles = profile.current_mileage
  const mileageInBounds =
    miles !== null && miles >= MILEAGE_MIN && miles <= MILEAGE_MAX

  const { hasDonorJob, donorYear, donorMake, donorModel } = extractDonor(mods)

  const archetype = determineArchetype(
    profile.usage_type,
    profile.make,
    profile.year,
    age,
    modCount,
    modCategories,
  )

  const overlay = determineOverlay(miles, profile.engine_origin)

  const tier = determineTier(
    chassisMatched,
    makeIsKnown(profile.make),
  )

  const modTier = classifyModTier(modCount)

  return {
    carId: profile.id,
    make: profile.make,
    model: profile.model,
    trim: profile.trim,
    year: profile.year,
    color: profile.color,
    isImport: profile.is_import,

    chassisCode,
    chassisMatched,

    engineCode,
    engineFamily,
    engineOrigin: profile.engine_origin,

    donorYear,
    donorMake,
    donorModel,
    hasDonorJob,

    horsepower: hp,
    hpInBounds,

    forcedInduction: profile.forced_induction,

    currentMileage: miles,
    mileageInBounds,

    modCount,
    modCategories,

    age,
    ownershipYears,

    archetype,
    overlay,
    tier,
    modTier,

    drivetrain: profile.drivetrain,
    usageType: profile.usage_type,

    distanceUnit: ownerUnits.distance_unit,
    powerUnit: ownerUnits.power_unit,
  }
}
