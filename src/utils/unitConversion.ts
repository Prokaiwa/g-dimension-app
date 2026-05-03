// Unit conversion — stored in base units, converted at display time only.
// Base units: miles, hp, lb-ft. Part 16 of MASTER_ARCHITECTURE.md.

type DistanceUnit = 'mi' | 'km'
type PowerUnit = 'hp' | 'ps' | 'kw'
type TorqueUnit = 'lbft' | 'nm'

export function convertDistance(miles: number, to: DistanceUnit): number {
  if (to === 'km') return miles * 1.60934
  return miles
}

export function convertPower(hp: number, to: PowerUnit): number {
  if (to === 'ps') return hp / 0.9863
  if (to === 'kw') return hp * 0.7457
  return hp
}

export function convertTorque(lbft: number, to: TorqueUnit): number {
  if (to === 'nm') return lbft * 1.35582
  return lbft
}

export function distanceLabel(unit: DistanceUnit): string {
  return unit === 'km' ? 'km' : 'mi'
}

export function powerLabel(unit: PowerUnit): string {
  return unit === 'ps' ? 'PS' : unit === 'kw' ? 'kW' : 'hp'
}

export function torqueLabel(unit: TorqueUnit): string {
  return unit === 'nm' ? 'Nm' : 'lb-ft'
}
