// Fuel logging: units, and the tank-to-tank economy chain (migration 097, ADR-033).
//
// THE ONE RULE EVERYTHING HERE SERVES: fuel economy is not a property of a
// fill-up. It is computed BETWEEN two FULL fills — the distance travelled,
// divided by the fuel added at the second one. Get that wrong and every number
// the feature produces is wrong quietly, which is worse than being absent.
// Field research on how Fuelly, Fuelio, Drivvo and Simply Auto handle it is in
// docs/FUEL_LOG_RESEARCH.md.
//
// Note what the rule does NOT need: the fuel added at the FIRST of the two
// fills. That tank was burned before the span began. So an anchor only has to
// supply an odometer reading, which is why a full fill with an unknown volume
// can still anchor the next tank.
//
// Storage is base units throughout, per the house rule: miles for distance, US
// gallons for volume. Convert at display only.

import { KM_PER_MI } from './unitConversion'

// ── Units ────────────────────────────────────────────────────────────────────

export type VolumeUnit = 'gal_us' | 'gal_imp' | 'l'

/** Exact by definition: the US gallon is 231 cubic inches. */
export const L_PER_GAL_US = 3.785411784
/** Exact by definition: the imperial gallon is 4.54609 L. */
export const L_PER_GAL_IMP = 4.54609

export function asVolumeUnit(v: unknown): VolumeUnit {
  return v === 'gal_imp' || v === 'l' ? v : 'gal_us'
}

/** base US gallons -> the user's display unit */
export function galToUnit(gal: number, unit: VolumeUnit): number {
  if (unit === 'l') return gal * L_PER_GAL_US
  if (unit === 'gal_imp') return (gal * L_PER_GAL_US) / L_PER_GAL_IMP
  return gal
}

/** a value typed in the user's unit -> base US gallons for storage */
export function unitToGal(value: number, unit: VolumeUnit): number {
  if (unit === 'l') return value / L_PER_GAL_US
  if (unit === 'gal_imp') return (value * L_PER_GAL_IMP) / L_PER_GAL_US
  return value
}

export function volumeLabel(unit: VolumeUnit): string {
  return unit === 'l' ? 'L' : unit === 'gal_imp' ? 'gal' : 'gal'
}

// ── Economy units ────────────────────────────────────────────────────────────
//
// L/100km is INVERTED relative to MPG: lower is better. That is not a display
// detail, it changes which end of a chart is good and which of two numbers to
// call "best", so it is exposed as a predicate rather than left for each caller
// to remember.

export type EconomyUnit = 'mpg_us' | 'mpg_imp' | 'l_100km' | 'km_l'

export function asEconomyUnit(v: unknown): EconomyUnit {
  return v === 'mpg_imp' || v === 'l_100km' || v === 'km_l' ? v : 'mpg_us'
}

/** base US MPG -> the user's economy unit */
export function mpgToUnit(mpg: number, unit: EconomyUnit): number {
  if (unit === 'mpg_imp') return (mpg * L_PER_GAL_IMP) / L_PER_GAL_US
  if (unit === 'km_l') return (mpg * KM_PER_MI) / L_PER_GAL_US
  if (unit === 'l_100km') return (100 * L_PER_GAL_US) / (mpg * KM_PER_MI)
  return mpg
}

/** False only for L/100km, where a smaller number is the better one. */
export function higherIsBetter(unit: EconomyUnit): boolean {
  return unit !== 'l_100km'
}

export function economyLabel(unit: EconomyUnit): string {
  if (unit === 'l_100km') return 'L/100km'
  if (unit === 'km_l') return 'km/L'
  return 'mpg'
}

/** Null for anything that is not one of the four, so a caller can tell a stored
 *  preference from an absent one. asEconomyUnit() collapses both to 'mpg_us',
 *  which is the right shape for display and the wrong shape for a fallback. */
export function asEconomyUnitOrNull(v: unknown): EconomyUnit | null {
  return v === 'mpg_us' || v === 'mpg_imp' || v === 'l_100km' || v === 'km_l' ? v : null
}

/**
 * How this user's part of the world spells fuel economy, guessed from the units
 * they have already set (migration 099).
 *
 *   miles + US gallons        -> MPG (US)         the United States
 *   miles + litres            -> MPG (imperial)   the UK: buys litres, thinks mpg
 *   miles + imperial gallons  -> MPG (imperial)
 *   km    + anything          -> L/100km
 *
 * The last line is a guess and the only one that is: Canada, Australia, New
 * Zealand and most of Europe say L/100km, while Japan, India and much of Latin
 * America say km/L, off identical units. L/100km wins the default as the larger
 * bloc, and Settings > Units > Economy exists for everyone else.
 */
export function deriveEconomyUnit(distanceUnit: string | null | undefined, volumeUnit: VolumeUnit): EconomyUnit {
  if (distanceUnit === 'km') return 'l_100km'
  return volumeUnit === 'gal_us' ? 'mpg_us' : 'mpg_imp'
}

/** The stored preference if there is one, otherwise the guess. */
export function resolveEconomyUnit(
  stored: unknown,
  distanceUnit: string | null | undefined,
  volumeUnit: VolumeUnit,
): EconomyUnit {
  return asEconomyUnitOrNull(stored) ?? deriveEconomyUnit(distanceUnit, volumeUnit)
}

/** How many decimals a figure in this unit conventionally carries. MPG and
 *  L/100km are quoted to one; km/L likewise. Kept here so the page, the sheet
 *  and the chart label can never disagree about it. */
export function formatEconomy(mpg: number, unit: EconomyUnit): string {
  return mpgToUnit(mpg, unit).toFixed(1)
}

// ── The chain ────────────────────────────────────────────────────────────────

export type FuelEntry = {
  id: string
  filled_on: string          // YYYY-MM-DD
  odometer: number           // miles
  volume: number | null      // US gallons; null = an odometer reading, not a fill
  total_cost: number | null
  is_full: boolean
  is_missed: boolean
}

/** Why a tank has no economy figure. Surfaced so the UI can say which. */
export type TankReason =
  | 'ok'
  | 'reading'        // no volume: an odometer entry, inert to the chain
  | 'first'          // nothing before it to measure from
  | 'partial'        // volume rolls forward into the next full tank
  | 'missed'         // a fill-up went unlogged, so the chain restarts here
  | 'bad-data'       // non-advancing odometer, or no fuel to divide by

export type TankResult = {
  entry: FuelEntry
  miles: number | null
  gallons: number | null
  mpg: number | null
  reason: TankReason
}

export type FuelSummary = {
  tanks: TankResult[]               // oldest first
  fullTanks: number                 // how many produced a figure
  avgMpg: number | null
  bestMpg: number | null
  worstMpg: number | null
  totalSpend: number
  totalVolume: number               // US gallons
  avgPricePerGal: number | null
  costPerMile: number | null
  spanMiles: number | null
}

/** Oldest first, by odometer. Two entries can share a date, so the reading is
 *  what actually orders them; the date only breaks exact ties. */
function chronological(entries: FuelEntry[]): FuelEntry[] {
  return [...entries].sort((a, b) =>
    a.odometer - b.odometer || a.filled_on.localeCompare(b.filled_on))
}

/**
 * Walk the entries and compute economy for every tank that has one.
 *
 * The state is two values: `anchor`, the last full fill that can start a span,
 * and `carried`, volume from partial fills waiting to be counted against the
 * next full one.
 */
export function computeTanks(entries: FuelEntry[]): TankResult[] {
  const out: TankResult[] = []
  let anchor: FuelEntry | null = null
  let carried = 0

  for (const entry of chronological(entries)) {
    const push = (reason: TankReason, miles: number | null = null, gallons: number | null = null, mpg: number | null = null) =>
      out.push({ entry, miles, gallons, mpg, reason })

    // No volume means no fuel was bought: this is someone updating the reading.
    // It must not anchor (the tank is not known to be full) and must not consume
    // carried volume, so it is completely inert to the chain.
    if (entry.volume == null || entry.volume <= 0) { push('reading'); continue }

    // A fill-up happened that was never logged. The distance since the last
    // record is real but the fuel behind it is not, so this tank is unknowable.
    // The entry can still start the NEXT span, because an anchor only supplies
    // an odometer reading.
    if (entry.is_missed) {
      push('missed')
      anchor = entry.is_full ? entry : null
      carried = 0
      continue
    }

    if (!entry.is_full) {
      push('partial')
      carried += entry.volume
      continue
    }

    if (anchor == null) {
      push('first')
    } else {
      const miles = entry.odometer - anchor.odometer
      const gallons = carried + entry.volume
      if (miles <= 0 || gallons <= 0) push('bad-data')
      else push('ok', miles, gallons, miles / gallons)
    }
    anchor = entry
    carried = 0
  }

  return out
}

export function summarise(entries: FuelEntry[]): FuelSummary {
  const tanks = computeTanks(entries)
  const ok = tanks.filter(t => t.mpg != null)

  const totalSpend = entries.reduce((s, e) => s + (e.total_cost ?? 0), 0)
  const totalVolume = entries.reduce((s, e) => s + (e.volume ?? 0), 0)

  const ordered = chronological(entries)
  const spanMiles = ordered.length >= 2
    ? ordered[ordered.length - 1].odometer - ordered[0].odometer
    : null

  // Cost per mile excludes the FIRST entry's cost, the same correction Drivvo
  // applies to its lifetime average. That tank was bought before the measured
  // span opened and was largely burned before it, so counting it against the
  // span's distance inflates the figure — most visibly on a short history,
  // which is exactly when a new user is deciding whether to trust the number.
  const spendInSpan = ordered.slice(1).reduce((s, e) => s + (e.total_cost ?? 0), 0)

  const measuredMiles = ok.reduce((s, t) => s + (t.miles ?? 0), 0)
  const measuredGal = ok.reduce((s, t) => s + (t.gallons ?? 0), 0)

  return {
    tanks,
    fullTanks: ok.length,
    // Total distance over total fuel, NOT the mean of the per-tank figures. The
    // mean would weight a 90-mile tank the same as a 400-mile one.
    avgMpg: measuredGal > 0 ? measuredMiles / measuredGal : null,
    bestMpg: ok.length ? Math.max(...ok.map(t => t.mpg as number)) : null,
    worstMpg: ok.length ? Math.min(...ok.map(t => t.mpg as number)) : null,
    totalSpend,
    totalVolume,
    avgPricePerGal: totalVolume > 0 ? totalSpend / totalVolume : null,
    costPerMile: spanMiles && spanMiles > 0 ? spendInSpan / spanMiles : null,
    spanMiles,
  }
}

/** Price per unit for a single fill, derived rather than stored. Entering any
 *  two of volume, total and price gives the third, which is the trick that
 *  removes arithmetic at the pump. */
export function pricePerUnit(totalCost: number | null, volume: number | null): number | null {
  if (totalCost == null || volume == null || volume <= 0) return null
  return totalCost / volume
}
