// The signed-in user's display unit preferences (Settings → Units). Values are
// always STORED in base units (miles, hp, lb-ft); these govern display only.
// Cached in-memory + seeded from the server on sign-in (App.tsx) so screens can
// format synchronously without each one re-querying — the same pattern as the
// profile / active-car caches. Distance stays handled per-car by mileage.ts
// (cars.mileage_unit overrides the global distance pref for odometer display);
// this module is what makes power/torque honor the user's choice.
import { supabase } from './supabase'
import { convertPower, convertTorque, powerLabel, torqueLabel } from '../utils/unitConversion'

export type UnitPrefs = {
  distance_unit: 'mi' | 'km'
  power_unit: 'hp' | 'ps' | 'kw'
  torque_unit: 'lbft' | 'nm'
}

const DEFAULT_PREFS: UnitPrefs = { distance_unit: 'mi', power_unit: 'hp', torque_unit: 'lbft' }

let cached: UnitPrefs | null = null

// Synchronous read for render — the defaults (hp / lb-ft / mi) match what most
// users see, so a first paint before the server load resolves is never wrong
// for them, and km/PS/Nm users settle in as soon as loadUnitPrefs resolves.
export function getCachedUnitPrefs(): UnitPrefs { return cached ?? DEFAULT_PREFS }
export function setCachedUnitPrefs(p: UnitPrefs): void { cached = p }
export function clearUnitPrefs(): void { cached = null }

// Seed the cache from the server. Called on sign-in / app load (App.tsx).
export async function loadUnitPrefs(): Promise<UnitPrefs> {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth?.user?.id
  if (!uid) return getCachedUnitPrefs()
  const { data } = await supabase
    .from('users')
    .select('distance_unit, power_unit, torque_unit')
    .eq('id', uid)
    .single()
  if (data) cached = data as UnitPrefs
  return getCachedUnitPrefs()
}

// "641 hp" / "650 PS" / "478 kW" — base hp in, user's power unit out.
export function formatPower(hp: number, p: UnitPrefs = getCachedUnitPrefs()): string {
  return `${Math.round(convertPower(hp, p.power_unit)).toLocaleString()} ${powerLabel(p.power_unit)}`
}

// "428 lb-ft" / "580 Nm" — base lb-ft in, user's torque unit out.
export function formatTorque(lbft: number, p: UnitPrefs = getCachedUnitPrefs()): string {
  return `${Math.round(convertTorque(lbft, p.torque_unit)).toLocaleString()} ${torqueLabel(p.torque_unit)}`
}

// Coerce an unknown/absent value (e.g. a pre-migration public row) to a valid
// unit, falling back to the base unit. Used by the public /builds pages, which
// show the OWNER's units read from public_car_profiles.
export function powerUnitOf(unit: unknown): UnitPrefs['power_unit'] {
  return unit === 'ps' || unit === 'kw' ? unit : 'hp'
}
export function torqueUnitOf(unit: unknown): UnitPrefs['torque_unit'] {
  return unit === 'nm' ? 'nm' : 'lbft'
}

// Format in an EXPLICIT unit (not the current user's) — for public /builds pages.
export function formatPowerIn(hp: number, unit: unknown): string {
  const u = powerUnitOf(unit)
  return `${Math.round(convertPower(hp, u)).toLocaleString()} ${powerLabel(u)}`
}
export function formatTorqueIn(lbft: number, unit: unknown): string {
  const u = torqueUnitOf(unit)
  return `${Math.round(convertTorque(lbft, u)).toLocaleString()} ${torqueLabel(u)}`
}
