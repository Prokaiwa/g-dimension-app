import { describe, it, expect } from 'vitest'
import { computeLicense, resolveLicense, type LicenseStats } from './license'

// Build a stats object; records is derived (mods + services + details) exactly
// as getLicenseStats computes it.
function stats(p: Partial<LicenseStats> = {}): LicenseStats {
  const base: LicenseStats = {
    cars: 0, mods: 0, timeline: 0, services: 0, details: 0,
    buildSheetPhotos: 0, diyGuides: 0, featuredPublished: 0, publicShared: 0,
    records: 0,
  }
  const s = { ...base, ...p }
  s.records = s.mods + s.services + s.details
  return s
}

describe('license ladder', () => {
  it('no car → not licensed (null)', () => {
    expect(computeLicense(stats()).current).toBeNull()
  })

  it('first car → Provisional', () => {
    const lic = computeLicense(stats({ cars: 1 }))
    expect(lic.current?.id).toBe('P')
    expect(lic.next?.id).toBe('C')
  })

  it('Grade C is reachable by a mod OR a service (one action)', () => {
    expect(computeLicense(stats({ cars: 1, mods: 1 })).current?.id).toBe('C')
    expect(computeLicense(stats({ cars: 1, services: 1 })).current?.id).toBe('C')
  })

  it('Grade B needs breadth incl. a public share', () => {
    const notShared = stats({ cars: 1, mods: 5, services: 2, timeline: 2, buildSheetPhotos: 1 })
    expect(computeLicense(notShared).current?.id).toBe('C') // held back by publicShared
    const shared = stats({ cars: 1, mods: 5, services: 2, timeline: 2, buildSheetPhotos: 1, publicShared: 1 })
    expect(computeLicense(shared).current?.id).toBe('B')
  })
})

describe('license ratchet (resolveLicense)', () => {
  it('never demotes: sold the car but keeps the earned grade', () => {
    const r = resolveLicense(stats(), 'A') // no cars now, previously Grade A
    expect(r.current?.id).toBe('A')
    expect(r.rankedUp).toBe(false)
    expect(r.persistId).toBe('A')
  })

  it('detects a genuine rank-up and persists upward', () => {
    const bStats = stats({ cars: 1, mods: 5, services: 2, timeline: 2, buildSheetPhotos: 1, publicShared: 1 })
    const r = resolveLicense(bStats, 'C') // was C, now qualifies for B
    expect(r.current?.id).toBe('B')
    expect(r.rankedUp).toBe(true)
    expect(r.persistId).toBe('B')
  })

  it('first car from nothing is a rank-up to Provisional', () => {
    const r = resolveLicense(stats({ cars: 1 }), null)
    expect(r.current?.id).toBe('P')
    expect(r.rankedUp).toBe(true)
  })

  it('live equal to stored is not a rank-up', () => {
    const r = resolveLicense(stats({ cars: 1, mods: 1 }), 'C')
    expect(r.current?.id).toBe('C')
    expect(r.rankedUp).toBe(false)
  })
})
