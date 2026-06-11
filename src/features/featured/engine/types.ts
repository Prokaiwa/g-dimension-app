// ─── Enumerations ────────────────────────────────────────────────────────────

export type Archetype =
  | 'TimeAttack'
  | 'Drift'
  | 'Drag'
  | 'ShowStance'
  | 'VIP'
  | 'OffRoad'
  | 'Daily'
  | 'Exotic'
  | 'Muscle'
  | 'Survivor'
  | 'OEMPlus'
  | 'StreetBuild'

export type Overlay = 'HighMileage' | null

export type Tier = 1 | 2 | 3

export type ModTier = 'restraint' | 'street' | 'full'

export type HeadlineTemplate = 'T1' | 'T2' | 'T3' | 'T4' | 'T6' | 'T7'

export type DistanceUnit = 'mi' | 'km'
export type PowerUnit = 'hp' | 'ps' | 'kw'

// ─── Input types (match DB schema + public_build_sheet) ───────────────────────

export interface CarProfile {
  id: string
  year: number
  make: string
  model: string
  trim: string | null
  color: string | null
  is_import: boolean
  engine_type: string | null
  engine_origin: 'original' | 'swapped' | null
  forced_induction: 'none' | 'turbo' | 'supercharged' | 'twin-turbo' | 'e-boost' | 'other' | null
  horsepower: number | null
  current_mileage: number | null
  drivetrain: 'rwd' | 'fwd' | 'awd' | '4wd' | null
  purchase_date: string | null  // ISO date
  usage_type: string | null
  // Chassis resolved from variant or free text
  chassis_code: string | null
}

export interface VariantData {
  chassis_code: string | null
  engine_code: string | null
}

export interface ModData {
  category: string
  status: string
  // Donor engine fields
  is_donor_part?: boolean
  donor_year?: number | null
  donor_make?: string | null
  donor_model?: string | null
}

export interface OwnerUnits {
  distance_unit: DistanceUnit
  power_unit: PowerUnit
}

// ─── Resolved context (full, passed to all gates + generators) ────────────────

export interface GateContext {
  carId: string
  make: string
  model: string
  trim: string | null
  year: number
  color: string | null
  isImport: boolean

  // Chassis (normalized, uppercase, no spaces/hyphens)
  chassisCode: string | null
  chassisMatched: boolean

  // Engine (normalized)
  engineCode: string | null
  engineFamily: string | null
  engineOrigin: 'original' | 'swapped' | null

  // Donor (set when engineOrigin = 'swapped' and a donor job exists)
  donorYear: number | null
  donorMake: string | null
  donorModel: string | null
  hasDonorJob: boolean

  // Performance (stored hp; null if absent)
  horsepower: number | null
  hpInBounds: boolean

  // Forced induction
  forcedInduction: 'none' | 'turbo' | 'supercharged' | 'twin-turbo' | 'e-boost' | 'other' | null

  // Mileage (stored miles)
  currentMileage: number | null
  mileageInBounds: boolean

  // Build
  modCount: number
  modCategories: string[]  // distinct categories of installed mods

  // Temporal
  age: number               // current year - car.year
  ownershipYears: number | null

  // Classification (set by matrix cascade)
  archetype: Archetype
  overlay: Overlay
  tier: Tier
  modTier: ModTier

  // Drivetrain / usage
  drivetrain: 'rwd' | 'fwd' | 'awd' | '4wd' | null
  usageType: string | null

  // Display units (for template filling)
  distanceUnit: DistanceUnit
  powerUnit: PowerUnit
}

// ─── Pool data ────────────────────────────────────────────────────────────────

export interface PoolLine {
  text: string
  gates: string[]  // predicate names from gates.ts — ALL must pass
}

export interface T4Line extends PoolLine {
  restraintSafe: boolean  // ◦ mark: eligible for Survivor/Daily/OEMPlus/HighMileage
}

// ─── Chassis DB entry ─────────────────────────────────────────────────────────

export interface ChassisEntry {
  codes: string[]          // primary code + aliases (normalized)
  make: string[]           // allowed makes (lowercase)
  epithets: PoolLine[]
  captions: PoolLine[]
  decks: PoolLine[]
}

// ─── Engine family entry ──────────────────────────────────────────────────────

export interface EngineFamilyEntry {
  prefixes: string[]       // normalized prefix matches
  decks: PoolLine[]
  captions: PoolLine[]
}

// ─── Make heritage entry ──────────────────────────────────────────────────────

export interface MakeHeritageEntry {
  make: string             // lowercase
  decks: PoolLine[]
  captions: PoolLine[]
}

// ─── Output ───────────────────────────────────────────────────────────────────

export interface GeneratedFeature {
  headline: string
  headlineTemplate: HeadlineTemplate
  /** The nickname/epithet for the Cormorant italic line; null = omit that line */
  cormorantLine: string | null
  deck: string
  /** slot-key → caption text (only for slots where user left no caption) */
  captions: Record<string, string>
  archetype: Archetype
  tier: Tier
}
