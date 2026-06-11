import type { GateContext, Archetype } from './types'

// ─── Subaru eye-nickname resolver (exported for testing) ─────────────────────

export function resolveSubaruEye(
  ctx: Pick<GateContext, 'chassisCode' | 'year' | 'isImport'>
): 'bugeye' | 'blobeye' | 'hawkeye' | null {
  const cc = (ctx.chassisCode ?? '').toUpperCase()
  if (cc !== 'GDB' && cc !== 'GD') return null
  const { year, isImport } = ctx
  if (!isImport) {
    // USDM
    if (year >= 2002 && year <= 2003) return 'bugeye'
    if (year >= 2004 && year <= 2005) return 'blobeye'
    if (year >= 2006 && year <= 2007) return 'hawkeye'
  } else {
    // JDM — 2002 and 2005 are ambiguous/transition; restraint beats reach
    if (year >= 2000 && year <= 2001) return 'bugeye'
    if (year === 2002) return null
    if (year >= 2003 && year <= 2004) return 'blobeye'
    if (year === 2005) return null
    if (year >= 2006 && year <= 2007) return 'hawkeye'
  }
  return null
}

// ─── Gate predicate map ───────────────────────────────────────────────────────
// Every predicate referenced in any pool data file must appear here.
// Gates are AND-combined: ALL listed gates must pass for a line to be eligible.

export const GATES: Record<string, (ctx: GateContext) => boolean> = {

  // ── Forced induction ──────────────────────────────────────────────────────
  forcedInduction: ctx =>
    ctx.forcedInduction !== 'none' && ctx.forcedInduction !== null,

  forcedInductionNone: ctx =>
    ctx.forcedInduction === 'none',

  // ── HP / sanity ───────────────────────────────────────────────────────────
  hpPresent: ctx => ctx.hpInBounds,

  // ── Mod tier ─────────────────────────────────────────────────────────────
  modTierStreet: ctx =>
    ctx.modTier === 'street' || ctx.modTier === 'full',

  modTierFull: ctx => ctx.modTier === 'full',

  modTierRestraint: ctx => ctx.modTier === 'restraint',

  // ── Chassis ───────────────────────────────────────────────────────────────
  chassisResolvable: ctx =>
    ctx.chassisCode !== null || ctx.model !== '',

  chassisDB: ctx => ctx.chassisMatched,

  // ── Ownership / age ───────────────────────────────────────────────────────
  ownership5Plus: ctx =>
    ctx.ownershipYears !== null && ctx.ownershipYears >= 5,

  age20Plus: ctx => ctx.age >= 20,

  age25Plus: ctx => ctx.age >= 25,

  // ── Mod count ────────────────────────────────────────────────────────────
  modCountZero: ctx => ctx.modCount === 0,

  modCount1to3: ctx => ctx.modCount >= 1 && ctx.modCount <= 3,

  modCount4Plus: ctx => ctx.modCount >= 4,

  modCount8Plus: ctx => ctx.modCount >= 8,

  modCount13Plus: ctx => ctx.modCount >= 13,

  // ── Engine origin ─────────────────────────────────────────────────────────
  engineOriginal: ctx => ctx.engineOrigin === 'original',

  engineSwapped: ctx => ctx.engineOrigin === 'swapped',

  // ── High-Mileage overlay ──────────────────────────────────────────────────
  overlayHighMileage: ctx => ctx.overlay === 'HighMileage',

  // ── Mod categories ────────────────────────────────────────────────────────
  hasExhaust: ctx => ctx.modCategories.includes('Exhaust'),

  hasExteriorMod: ctx =>
    ctx.modCategories.includes('Exterior') ||
    ctx.modCategories.includes('Paint & Wrap'),

  noExteriorMods: ctx =>
    !ctx.modCategories.includes('Exterior') &&
    !ctx.modCategories.includes('Paint & Wrap'),

  hasSuspensionOrBrakes: ctx =>
    ctx.modCategories.includes('Suspension') ||
    ctx.modCategories.includes('Brakes'),

  // ── Drivetrain ────────────────────────────────────────────────────────────
  drivetrainRwd: ctx => ctx.drivetrain === 'rwd',

  drivetrainAwd: ctx => ctx.drivetrain === 'awd',

  // ── Usage ─────────────────────────────────────────────────────────────────
  usageTrack: ctx => ctx.usageType === 'track',

  usageDrag: ctx => ctx.usageType === 'drag',

  // ── Archetype ────────────────────────────────────────────────────────────
  archetypeDrift: ctx => ctx.archetype === 'Drift',

  archetypeDrag: ctx => ctx.archetype === 'Drag',

  archetypeVIP: ctx => ctx.archetype === 'VIP',

  archetypeShow: ctx => ctx.archetype === 'ShowStance',

  archetypeVIPorShow: ctx =>
    ctx.archetype === 'VIP' || ctx.archetype === 'ShowStance',

  archetypeSurvivorOrDaily: ctx =>
    ctx.archetype === 'Survivor' || ctx.archetype === 'Daily',

  archetypeRestraint: ctx =>
    (['Survivor', 'Daily', 'OEMPlus'] as Archetype[]).includes(ctx.archetype),

  // ── Color ─────────────────────────────────────────────────────────────────
  colorWhite: ctx =>
    ctx.color !== null && ctx.color.toLowerCase().includes('white'),

  colorBlue: ctx =>
    ctx.color !== null && ctx.color.toLowerCase().includes('blue'),

  colorPanda: ctx =>
    ctx.color !== null &&
    ((ctx.color.toLowerCase().includes('black') &&
      ctx.color.toLowerCase().includes('white')) ||
      ctx.color.toLowerCase().includes('panda')),

  colorNullOrNonWhite: ctx =>
    ctx.color === null || !ctx.color.toLowerCase().includes('white'),

  // ── Trim / model word-boundary gates ──────────────────────────────────────
  trimSi: ctx => /\bSi\b/i.test(`${ctx.trim ?? ''} ${ctx.model}`),

  trimTypeR: ctx => /\bType[\s-]?R\b/i.test(`${ctx.trim ?? ''} ${ctx.model}`),

  trimSTI: ctx => /\bSTI\b/i.test(`${ctx.trim ?? ''} ${ctx.model}`),

  trimEK9orTypeR: ctx =>
    /\bEK9\b/i.test(ctx.chassisCode ?? '') ||
    /\bType[\s-]?R\b/i.test(`${ctx.trim ?? ''} ${ctx.model}`),

  // ── VTEC gate (§5 — hard-blocked on B18A/B18B/B20) ───────────────────────
  vtec: ctx => {
    const ec = ctx.engineCode ?? ''
    // Confirmed VTEC codes only
    const vtecPrefixes = ['B16', 'B17A', 'B18C', 'H22', 'F20C', 'F22C', 'K20', 'K24']
    // Hard block B18A, B18B, B20
    if (/^B18[AB]/i.test(ec) || /^B20/i.test(ec)) return false
    return vtecPrefixes.some(p => ec.toUpperCase().startsWith(p.toUpperCase()))
  },

  bSeriesNonVTEC: ctx => {
    const ec = ctx.engineCode ?? ''
    return (
      ec.toUpperCase().startsWith('B18A') ||
      ec.toUpperCase().startsWith('B18B') ||
      ec.toUpperCase().startsWith('B20')
    )
  },

  // ── GT-R gate (§5 — R32 GTS/GTS-t NEVER qualifies) ──────────────────────
  gtr: ctx => {
    const cc = ctx.chassisCode ?? ''
    return (
      ['BNR32', 'BCNR33', 'BNR34'].includes(cc.toUpperCase()) ||
      /\bGT-R\b/i.test(ctx.model)
    )
  },

  // ── Engine code specifics ─────────────────────────────────────────────────
  engineRB26: ctx => (ctx.engineCode ?? '').toUpperCase().startsWith('RB26'),

  engineS54: ctx => (ctx.engineCode ?? '').toUpperCase().startsWith('S54'),

  engine13B: ctx => (ctx.engineCode ?? '').toUpperCase().startsWith('13B'),

  // ── Model contains ────────────────────────────────────────────────────────
  modelIntegra: ctx => /\bIntegra\b/i.test(ctx.model),

  model911: ctx => /\b911\b/.test(ctx.model),

  modelM3: ctx => /\bM3\b/i.test(ctx.model),

  modelMX5orMiata: ctx => /\b(MX-5|Miata|Roadster)\b/i.test(ctx.model),

  modelEvoOrLancer: ctx => /\b(Evo|Evolution|Lancer)\b/i.test(ctx.model),

  // ── Year ──────────────────────────────────────────────────────────────────
  year1998OrBefore: ctx => ctx.year <= 1998,

  // ── Chassis-specific ──────────────────────────────────────────────────────
  chassisAP1: ctx => (ctx.chassisCode ?? '').toUpperCase() === 'AP1',

  chassisAW11: ctx => (ctx.chassisCode ?? '').toUpperCase() === 'AW11',

  chassisSChassis: ctx =>
    ['S13', 'PS13', 'RPS13', 'S14', 'S15'].includes(
      (ctx.chassisCode ?? '').toUpperCase()
    ),

  chassisR32NonGTR: ctx => {
    const cc = (ctx.chassisCode ?? '').toUpperCase()
    // R32 family but NOT the GT-R variant
    return (
      ['R32', 'HCR32', 'ECR32'].includes(cc) &&
      !['BNR32'].includes(cc) &&
      !/\bGT-R\b/i.test(ctx.model)
    )
  },

  // ── Donor ─────────────────────────────────────────────────────────────────
  hasDonorJob: ctx => ctx.hasDonorJob,

  swapWithDonor: ctx => ctx.engineOrigin === 'swapped' && ctx.hasDonorJob,

  swapAny: ctx => ctx.engineOrigin === 'swapped',

  swapClaimFree: ctx =>
    ctx.engineOrigin === 'swapped' &&
    (ctx.modTier === 'street' || ctx.modTier === 'full'),

  // ── Subaru eye nicknames ──────────────────────────────────────────────────
  subEyeBugeye: ctx => resolveSubaruEye(ctx) === 'bugeye',
  subEyeBlobeye: ctx => resolveSubaruEye(ctx) === 'blobeye',
  subEyeHawkeye: ctx => resolveSubaruEye(ctx) === 'hawkeye',
  subEyeAny: ctx => resolveSubaruEye(ctx) !== null,

  // ── Mileage in bounds ─────────────────────────────────────────────────────
  mileageInBounds: ctx => ctx.mileageInBounds,
}

/** Returns true if every gate in the list passes, or if the list is empty. */
export function allGatesPass(gateKeys: string[], ctx: GateContext): boolean {
  for (const key of gateKeys) {
    const fn = GATES[key]
    if (!fn) {
      // Unknown gate — fail safe (restraint beats reach)
      return false
    }
    if (!fn(ctx)) return false
  }
  return true
}
