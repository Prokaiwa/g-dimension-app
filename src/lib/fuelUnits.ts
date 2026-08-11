// The two fuel display preferences, read together.
//
// WHY THIS FILE EXISTS AT ALL, rather than a `select` at each call site: the two
// columns must be fetched in SEPARATE queries, and the reason is not obvious
// enough to survive being retyped three times.
//
// `public.users` has no table-wide select grant — 083 replaced it with a
// column-level one, and 098/099 restate that list. PostgREST checks the grant
// for EVERY column named in a select, and refuses the WHOLE row with 42501 if
// any one of them is missing. So during the window between a deploy and its
// migration, `select('volume_unit, economy_unit')` does not degrade to "no
// economy unit" — it degrades to "no units at all", taking the working column
// down with the new one. 097 already shipped one silent version of this bug.
//
// Two queries, one round trip (Promise.all), and each column fails alone.
//
// The distance unit is NOT read here: lib/unitPrefs.ts already owns it, with a
// cache, and a second reader would be a second answer.

import { supabase } from './supabase'
import { asVolumeUnit, asEconomyUnitOrNull, resolveEconomyUnit, type EconomyUnit, type VolumeUnit } from './fuel'

export type FuelUnits = {
  volume: VolumeUnit
  economy: EconomyUnit
  /** Null when nothing is stored, i.e. `economy` is the derived guess. Settings
   *  needs to tell the two apart; display never does. */
  economyStored: EconomyUnit | null
}

export const DEFAULT_FUEL_UNITS: FuelUnits = {
  volume: 'gal_us', economy: 'mpg_us', economyStored: null,
}

/**
 * @param uid            the signed-in user
 * @param distanceUnit   from lib/unitPrefs, for deriving the economy unit when
 *                       none is stored
 */
export async function loadFuelUnits(uid: string, distanceUnit: string | null | undefined): Promise<FuelUnits> {
  const [volRes, ecoRes] = await Promise.all([
    supabase.from('users').select('volume_unit').eq('id', uid).single(),
    supabase.from('users').select('economy_unit').eq('id', uid).single(),
  ])
  const volume = asVolumeUnit((volRes.data as { volume_unit?: string } | null)?.volume_unit)
  const stored = (ecoRes.data as { economy_unit?: string | null } | null)?.economy_unit ?? null
  return {
    volume,
    economy: resolveEconomyUnit(stored, distanceUnit, volume),
    economyStored: asEconomyUnitOrNull(stored),
  }
}
