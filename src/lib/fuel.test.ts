import { describe, it, expect } from 'vitest'
import {
  asVolumeUnit, galToUnit, unitToGal,
  asEconomyUnit, mpgToUnit, higherIsBetter, economyLabel,
  computeTanks, summarise, pricePerUnit,
  type FuelEntry,
} from './fuel'

// Terse builder so a chain reads as a chain rather than as object literals.
let seq = 0
const fill = (odometer: number, volume: number | null, opts: Partial<FuelEntry> = {}): FuelEntry => ({
  id: `e${++seq}`,
  filled_on: '2026-01-01',
  odometer,
  volume,
  total_cost: null,
  is_full: true,
  is_missed: false,
  ...opts,
})

describe('volume units', () => {
  it('defaults anything unrecognised to US gallons', () => {
    expect(asVolumeUnit('l')).toBe('l')
    expect(asVolumeUnit('gal_imp')).toBe('gal_imp')
    expect(asVolumeUnit('pints')).toBe('gal_us')
    expect(asVolumeUnit(null)).toBe('gal_us')
  })

  it('round-trips through every unit', () => {
    for (const u of ['gal_us', 'gal_imp', 'l'] as const) {
      expect(unitToGal(galToUnit(12.5, u), u)).toBeCloseTo(12.5, 10)
    }
  })

  // The reason users.volume_unit had to exist at all: these are not the same
  // unit wearing two names.
  it('separates US and imperial gallons by about 20%', () => {
    expect(galToUnit(1, 'gal_imp')).toBeCloseTo(0.8327, 4)
    expect(galToUnit(1, 'l')).toBeCloseTo(3.7854, 4)
  })
})

describe('economy units', () => {
  it('converts 30 US mpg into the others', () => {
    expect(mpgToUnit(30, 'mpg_us')).toBeCloseTo(30, 6)
    expect(mpgToUnit(30, 'mpg_imp')).toBeCloseTo(36.03, 2)
    expect(mpgToUnit(30, 'km_l')).toBeCloseTo(12.75, 2)
    expect(mpgToUnit(30, 'l_100km')).toBeCloseTo(7.84, 2)
  })

  it('knows that L/100km inverts the direction of good', () => {
    expect(higherIsBetter('mpg_us')).toBe(true)
    expect(higherIsBetter('km_l')).toBe(true)
    expect(higherIsBetter('l_100km')).toBe(false)
    // A thriftier car must produce a SMALLER L/100km and a LARGER mpg.
    expect(mpgToUnit(40, 'l_100km')).toBeLessThan(mpgToUnit(20, 'l_100km'))
    expect(mpgToUnit(40, 'mpg_us')).toBeGreaterThan(mpgToUnit(20, 'mpg_us'))
  })

  it('labels correctly and falls back to mpg', () => {
    expect(economyLabel('l_100km')).toBe('L/100km')
    expect(asEconomyUnit('nonsense')).toBe('mpg_us')
  })
})

describe('the tank-to-tank chain', () => {
  it('gives the first full fill no figure, and measures from it after', () => {
    const t = computeTanks([fill(1000, 10), fill(1300, 10)])
    expect(t[0].reason).toBe('first')
    expect(t[0].mpg).toBeNull()
    expect(t[1].reason).toBe('ok')
    expect(t[1].miles).toBe(300)
    expect(t[1].mpg).toBeCloseTo(30, 6)
  })

  // The rule that makes this more than a table of purchases: the fuel that
  // counts is the fuel added at the END of the span, not at the start.
  it('divides by the SECOND fill volume, never the first', () => {
    const t = computeTanks([fill(1000, 99), fill(1300, 10)])
    expect(t[1].gallons).toBe(10)
    expect(t[1].mpg).toBeCloseTo(30, 6)
  })

  it('rolls a partial fill forward into the next full tank', () => {
    const t = computeTanks([
      fill(1000, 10),
      fill(1150, 4, { is_full: false }),
      fill(1300, 6),
    ])
    expect(t[1].reason).toBe('partial')
    expect(t[1].mpg).toBeNull()
    // 300 miles on 4 + 6 gallons, not 300 on 6.
    expect(t[2].miles).toBe(300)
    expect(t[2].gallons).toBe(10)
    expect(t[2].mpg).toBeCloseTo(30, 6)
  })

  it('accumulates several partials in a row', () => {
    const t = computeTanks([
      fill(1000, 10),
      fill(1100, 3, { is_full: false }),
      fill(1200, 3, { is_full: false }),
      fill(1300, 4),
    ])
    expect(t[3].gallons).toBe(10)
    expect(t[3].mpg).toBeCloseTo(30, 6)
  })

  // Without this the tank after a forgotten fill-up reports roughly double the
  // real economy, because its distance covers two tanks of fuel but only one is
  // recorded.
  it('breaks the chain on a missed fill and restarts from it', () => {
    const t = computeTanks([
      fill(1000, 10),
      fill(1600, 10, { is_missed: true }),
      fill(1900, 10),
    ])
    expect(t[1].reason).toBe('missed')
    expect(t[1].mpg).toBeNull()
    expect(t[2].reason).toBe('ok')
    expect(t[2].miles).toBe(300)   // measured from the missed entry, not from 1000
    expect(t[2].mpg).toBeCloseTo(30, 6)
  })

  it('discards carried partials when a fill is missed', () => {
    const t = computeTanks([
      fill(1000, 10),
      fill(1100, 5, { is_full: false }),
      fill(1600, 10, { is_missed: true }),
      fill(1900, 10),
    ])
    expect(t[3].gallons).toBe(10)   // the stale 5 gallons are not counted
  })

  it('treats a volume-less entry as an odometer reading, inert to the chain', () => {
    const t = computeTanks([
      fill(1000, 10),
      fill(1150, null),             // just updating the odometer
      fill(1300, 10),
    ])
    expect(t[1].reason).toBe('reading')
    expect(t[1].mpg).toBeNull()
    // The span still runs 1000 -> 1300; the reading neither anchors nor breaks.
    expect(t[2].miles).toBe(300)
    expect(t[2].mpg).toBeCloseTo(30, 6)
  })

  it('anchors on a full fill even when that fill has no known volume', () => {
    // Volume is unknown at 1000, but the anchor only supplies an odometer, and
    // the tank measured is the one added at 1300.
    const t = computeTanks([fill(500, 10), fill(1000, null), fill(1300, 10)])
    expect(t[2].miles).toBe(800)    // 1300 - 500, because 1000 was inert
    expect(t[2].mpg).toBeCloseTo(80, 6)
  })

  it('refuses to divide when the odometer does not advance', () => {
    const t = computeTanks([fill(1000, 10), fill(1000, 10)])
    expect(t[1].reason).toBe('bad-data')
    expect(t[1].mpg).toBeNull()
  })

  it('orders by odometer, not by insertion or date', () => {
    const t = computeTanks([fill(1300, 10), fill(1000, 10)])
    expect(t[0].entry.odometer).toBe(1000)
    expect(t[1].mpg).toBeCloseTo(30, 6)
  })

  it('handles an empty log and a single entry', () => {
    expect(computeTanks([])).toEqual([])
    const one = computeTanks([fill(1000, 10)])
    expect(one).toHaveLength(1)
    expect(one[0].reason).toBe('first')
  })
})

describe('summary', () => {
  it('averages by total distance over total fuel, not by mean of tanks', () => {
    // 100 mi on 10 gal (10 mpg) then 900 mi on 10 gal (90 mpg).
    // Mean of the figures is 50; the honest answer is 1000/20 = 50... so make
    // them asymmetric enough to actually distinguish the two methods.
    const s = summarise([fill(0, 10), fill(100, 10), fill(1000, 5)])
    // tanks: 0->100 on 10 gal = 10 mpg; 100->1000 on 5 gal = 180 mpg
    // mean of figures = 95. distance/fuel = 1000/15 = 66.67.
    expect(s.fullTanks).toBe(2)
    expect(s.avgMpg).toBeCloseTo(1000 / 15, 6)
    expect(s.avgMpg).not.toBeCloseTo(95, 1)
    expect(s.bestMpg).toBeCloseTo(180, 6)
    expect(s.worstMpg).toBeCloseTo(10, 6)
  })

  it('excludes the first fill from cost per mile', () => {
    const s = summarise([
      fill(1000, 10, { total_cost: 100 }),   // bought before the span, excluded
      fill(1300, 10, { total_cost: 30 }),
    ])
    expect(s.spanMiles).toBe(300)
    expect(s.costPerMile).toBeCloseTo(30 / 300, 6)
    // ...but total spend still reports everything the owner actually paid.
    expect(s.totalSpend).toBe(130)
  })

  it('derives average price per gallon across the whole log', () => {
    const s = summarise([
      fill(1000, 10, { total_cost: 40 }),
      fill(1300, 10, { total_cost: 50 }),
    ])
    expect(s.avgPricePerGal).toBeCloseTo(4.5, 6)
    expect(s.totalVolume).toBeCloseTo(20, 6)
  })

  it('reports nulls rather than NaN on an empty log', () => {
    const s = summarise([])
    expect(s.avgMpg).toBeNull()
    expect(s.bestMpg).toBeNull()
    expect(s.costPerMile).toBeNull()
    expect(s.spanMiles).toBeNull()
    expect(s.totalSpend).toBe(0)
  })
})

describe('pricePerUnit', () => {
  it('derives the third value from any two', () => {
    expect(pricePerUnit(59.47, 14.2)).toBeCloseTo(4.188, 3)
  })
  it('is null-safe and never divides by zero', () => {
    expect(pricePerUnit(null, 10)).toBeNull()
    expect(pricePerUnit(10, null)).toBeNull()
    expect(pricePerUnit(10, 0)).toBeNull()
  })
})
