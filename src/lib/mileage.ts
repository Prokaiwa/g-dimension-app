// Per-car odometer unit. Mileage is ALWAYS stored in miles (base unit, see
// cars.current_mileage / sessions.mileage); a car carries its own display unit
// (cars.mileage_unit) so an imported car kept in km shows km everywhere without
// touching the user's global distance preference. Convert at display/input only.

export type MileageUnit = 'mi' | 'km'

const MI_PER_KM = 0.621371 // 1 km = 0.621371 mi

export function asMileageUnit(v: unknown): MileageUnit {
  return v === 'km' ? 'km' : 'mi'
}

// base miles -> the car's display unit (rounded whole number)
export function milesToUnit(miles: number, unit: MileageUnit): number {
  return unit === 'km' ? Math.round(miles / MI_PER_KM) : Math.round(miles)
}

// a value typed in the car's unit -> base miles for storage
export function unitToMiles(value: number, unit: MileageUnit): number {
  return unit === 'km' ? Math.round(value * MI_PER_KM) : Math.round(value)
}

// base miles -> "12,345 mi" / "19,867 km"; null-safe (returns the dash)
export function formatMiles(miles: number | null | undefined, unit: MileageUnit): string {
  if (miles == null) return '—'
  return `${milesToUnit(miles, unit).toLocaleString()} ${unit}`
}
