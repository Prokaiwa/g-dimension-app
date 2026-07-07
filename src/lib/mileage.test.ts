import { describe, it, expect } from 'vitest'
import { asMileageUnit, milesToUnit, unitToMiles, formatMiles } from './mileage'

describe('asMileageUnit', () => {
  it('accepts km', () => {
    expect(asMileageUnit('km')).toBe('km')
  })

  it('falls back to mi for anything else', () => {
    expect(asMileageUnit('mi')).toBe('mi')
    expect(asMileageUnit(null)).toBe('mi')
    expect(asMileageUnit(undefined)).toBe('mi')
    expect(asMileageUnit('KM')).toBe('mi')
    expect(asMileageUnit(42)).toBe('mi')
  })
})

describe('milesToUnit', () => {
  it('mi is identity (rounded)', () => {
    expect(milesToUnit(12345, 'mi')).toBe(12345)
    expect(milesToUnit(12345.6, 'mi')).toBe(12346)
  })

  it('converts miles to km', () => {
    expect(milesToUnit(100, 'km')).toBe(161) // 100 mi ≈ 160.93 km
    expect(milesToUnit(0, 'km')).toBe(0)
  })
})

describe('unitToMiles', () => {
  it('mi is identity (rounded)', () => {
    expect(unitToMiles(50000, 'mi')).toBe(50000)
  })

  it('converts km input to base miles', () => {
    expect(unitToMiles(161, 'km')).toBe(100) // 161 km ≈ 100.04 mi
    expect(unitToMiles(0, 'km')).toBe(0)
  })

  it('round-trips within rounding error (±1) for realistic odometer values', () => {
    for (const miles of [1, 87, 12345, 50000, 123456, 299999]) {
      const roundTrip = unitToMiles(milesToUnit(miles, 'km'), 'km')
      expect(Math.abs(roundTrip - miles)).toBeLessThanOrEqual(1)
    }
  })

  it('is deterministic: same input, same output', () => {
    expect(milesToUnit(98765, 'km')).toBe(milesToUnit(98765, 'km'))
    expect(unitToMiles(98765, 'km')).toBe(unitToMiles(98765, 'km'))
  })
})

describe('formatMiles', () => {
  it('formats with thousands separators and the unit suffix', () => {
    expect(formatMiles(12345, 'mi')).toBe(`${(12345).toLocaleString()} mi`)
    expect(formatMiles(100, 'km')).toBe(`${(161).toLocaleString()} km`)
  })

  it('is null-safe (returns the dash)', () => {
    expect(formatMiles(null, 'mi')).toBe('—')
    expect(formatMiles(undefined, 'km')).toBe('—')
  })

  it('formats zero as a real value, not the dash', () => {
    expect(formatMiles(0, 'mi')).toBe('0 mi')
  })
})
