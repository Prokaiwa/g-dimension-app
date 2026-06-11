import { describe, it, expect } from 'vitest'
import { generateFeature, buildContext } from '../generate'
import type { CarProfile, ModData, VariantData, OwnerUnits } from '../types'
import { GATES, resolveSubaruEye } from '../gates'
import {
  T1_PHRASES, T2_PHRASES, T4_PHRASES, T6_TEMPLATES, T7_PHRASES,
  DECK_POOLS, CAPTIONS_DETAIL_POINTER, CAPTIONS_SPEC_FACT, CAPTIONS_IDENTITY,
} from '../pools/universal'
import { ENGINE_FAMILIES, SWAP_CAPTIONS } from '../pools/engines'
import { MAKE_HERITAGE } from '../pools/makes'
import { CHASSIS_DB } from '../pools/chassis'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const US_UNITS: OwnerUnits = { distance_unit: 'mi', power_unit: 'hp' }
const KM_UNITS: OwnerUnits = { distance_unit: 'km', power_unit: 'ps' }

function makeProfile(overrides: Partial<CarProfile> = {}): CarProfile {
  return {
    id: 'test-car-00000000-0000-0000-0000-000000000001',
    year: 2000,
    make: 'Toyota',
    model: 'Supra',
    trim: null,
    color: null,
    is_import: false,
    engine_type: null,
    engine_origin: null,
    forced_induction: 'none',
    horsepower: null,
    current_mileage: null,
    drivetrain: 'rwd',
    purchase_date: null,
    usage_type: null,
    chassis_code: null,
    ...overrides,
  }
}

function makeMod(category: string, overrides: Partial<ModData> = {}): ModData {
  return { category, status: 'installed', ...overrides }
}

const ALL_CATS = [
  'Engine', 'Suspension', 'Brakes', 'Exhaust', 'Cooling',
  'Drivetrain', 'Exterior', 'Interior', 'Wheels & Tires',
  'Fuel System', 'Electrical', 'Audio', 'Safety',
]
function nMods(n: number): ModData[] {
  return Array.from({ length: n }, (_, i) => makeMod(ALL_CATS[i % ALL_CATS.length]))
}

// ─── Test 1: 800whp 2JZ JZA80, street, 15 mods ────────────────────────────────

describe('Test 1 — 800whp 2JZ JZA80 street build', () => {
  const profile = makeProfile({
    id: 'test-t1-00000000-0000-0000-0000-000000000001',
    make: 'Toyota',
    model: 'Supra',
    year: 1994,
    horsepower: 800,
    engine_type: '2JZ-GTE',
    forced_induction: 'twin-turbo',
    chassis_code: 'JZA80',
    engine_origin: 'original',
    usage_type: 'street',
  })
  const mods = nMods(15)
  const variant: VariantData = { chassis_code: 'JZA80', engine_code: '2JZ-GTE' }

  it('produces a T1-style headline containing hp figure', () => {
    const result = generateFeature(profile, mods, variant, US_UNITS)
    expect(result.headlineTemplate).toBe('T1')
    expect(result.headline).toMatch(/800/)
  })

  it('does not use restraint vocabulary in headline or deck', () => {
    const result = generateFeature(profile, mods, variant, US_UNITS)
    const allText = [result.headline, result.deck].join(' ').toLowerCase()
    const BLOCKED = ['untouched', 'preserved', 'capsule', 'unrestored', 'kept the way']
    for (const word of BLOCKED) {
      expect(allText).not.toContain(word)
    }
  })

  it('resolves to StreetBuild archetype, Tier 1, full mod-tier', () => {
    const ctx = buildContext(profile, mods, variant, US_UNITS)
    expect(ctx.archetype).toBe('StreetBuild')
    expect(ctx.tier).toBe(1)
    expect(ctx.modTier).toBe('full')
  })
})

// ─── Test 2: Stock 2006 Accord, 240k mi, original engine ─────────────────────

describe('Test 2 — High-Mileage Accord', () => {
  const profile = makeProfile({
    id: 'test-t2-00000000-0000-0000-0000-000000000001',
    make: 'Honda',
    model: 'Accord',
    year: 2006,
    horsepower: 166,
    current_mileage: 240_000,
    engine_origin: 'original',
    forced_induction: 'none',
  })

  it('activates High-Mileage overlay', () => {
    const ctx = buildContext(profile, [], null, US_UNITS)
    expect(ctx.overlay).toBe('HighMileage')
  })

  it('produces a T6 headline in miles for US-unit owner', () => {
    const result = generateFeature(profile, [], null, US_UNITS)
    expect(result.headlineTemplate).toBe('T6')
    expect(result.headline).toMatch(/240,000/)
    expect(result.headline).toMatch(/Miles/)
  })

  it('produces a T6 headline in km for KM-unit owner', () => {
    const result = generateFeature(profile, [], null, KM_UNITS)
    expect(result.headlineTemplate).toBe('T6')
    expect(result.headline).toMatch(/Kilometers/)
    const kmVal = Math.round(240_000 * 1.60934).toLocaleString('en-US')
    expect(result.headline).toContain(kmVal)
  })

  it('T1 is impossible — headline template is never T1', () => {
    const result = generateFeature(profile, [], null, US_UNITS)
    expect(result.headlineTemplate).not.toBe('T1')
  })
})

// ─── Test 3: Gate negatives ───────────────────────────────────────────────────

describe('Test 3 — Gate negatives', () => {
  it('R32 GTS-t (HCR32) never receives Godzilla or Group A language across 1,000 seeds', () => {
    const base = makeProfile({
      make: 'Nissan', model: 'Skyline', year: 1993, chassis_code: 'HCR32',
    })
    const variant: VariantData = { chassis_code: 'HCR32', engine_code: null }
    const mods = nMods(6)

    for (let i = 0; i < 1000; i++) {
      const p = { ...base, id: `t3a-nissan-${String(i).padStart(6, '0')}-00000000` }
      const result = generateFeature(p, mods, variant, US_UNITS)
      const allText = [
        result.headline, result.deck, result.cormorantLine ?? '',
        ...Object.values(result.captions),
      ].join(' ')
      expect(allText).not.toMatch(/Godzilla/i)
      expect(allText).not.toMatch(/Group A/i)
      expect(allText).not.toMatch(/ATTESA-GTR/i)
    }
  })

  it('B18B Integra never receives VTEC or crossover lines across 1,000 seeds', () => {
    const base = makeProfile({
      make: 'Acura', model: 'Integra', year: 1998,
      engine_type: 'B18B1', chassis_code: 'DC2',
    })
    const variant: VariantData = { chassis_code: 'DC2', engine_code: 'B18B1' }
    const mods = nMods(4)

    for (let i = 0; i < 1000; i++) {
      const p = { ...base, id: `t3b-acura-${String(i).padStart(6, '0')}-00000000` }
      const result = generateFeature(p, mods, variant, US_UNITS)
      const allText = [
        result.headline, result.deck, result.cormorantLine ?? '',
        ...Object.values(result.captions),
      ].join(' ')
      expect(allText).not.toMatch(/VTEC/i)
      expect(allText).not.toMatch(/crossover/i)
      expect(allText).not.toMatch(/kicked in/i)
    }
  })

  it('JDM 2002 Impreza (GDB) produces zero eye nicknames across 1,000 seeds', () => {
    const base = makeProfile({
      make: 'Subaru', model: 'Impreza', year: 2002,
      is_import: true, chassis_code: 'GDB',
    })
    const variant: VariantData = { chassis_code: 'GDB', engine_code: null }

    for (let i = 0; i < 1000; i++) {
      const p = { ...base, id: `t3c-subaru-${String(i).padStart(6, '0')}-00000000` }
      const result = generateFeature(p, [], variant, US_UNITS)
      const allText = [
        result.headline, result.deck, result.cormorantLine ?? '',
        ...Object.values(result.captions),
      ].join(' ')
      expect(allText).not.toMatch(/bugeye/i)
      expect(allText).not.toMatch(/blobeye/i)
      expect(allText).not.toMatch(/hawkeye/i)
    }
  })
})

// ─── Test 4: SR20-swapped S13, drift ─────────────────────────────────────────

describe('Test 4 — SR20-swapped S13 drift car', () => {
  const donorMod: ModData = {
    category: 'Engine', status: 'installed',
    is_donor_part: true, donor_year: 2001,
    donor_make: 'Nissan', donor_model: '180SX',
  }
  const profile = makeProfile({
    id: 'test-t4-00000000-0000-0000-0000-000000000001',
    make: 'Nissan', model: 'Silvia', year: 1989,
    chassis_code: 'S13', engine_type: 'SR20DET',
    engine_origin: 'swapped', forced_induction: 'turbo',
    drivetrain: 'rwd', usage_type: 'drift',
  })
  const variant: VariantData = { chassis_code: 'S13', engine_code: 'SR20DET' }
  const mods = [donorMod, ...nMods(5)]

  it('resolves to Drift archetype', () => {
    const ctx = buildContext(profile, mods, variant, US_UNITS)
    expect(ctx.archetype).toBe('Drift')
  })

  it('detects SR20 engine family', () => {
    const ctx = buildContext(profile, mods, variant, US_UNITS)
    expect(ctx.engineFamily).toBeTruthy()
    expect(ctx.engineFamily).toMatch(/SR20/)
  })

  it('detects donor job', () => {
    const ctx = buildContext(profile, mods, variant, US_UNITS)
    expect(ctx.hasDonorJob).toBe(true)
    expect(ctx.donorMake).toBe('Nissan')
    expect(ctx.donorModel).toBe('180SX')
  })

  it('generates without error', () => {
    const result = generateFeature(profile, mods, variant, US_UNITS)
    expect(result.headline).toBeTruthy()
    expect(result.deck).toBeTruthy()
  })
})

// ─── Test 5: Unknown make Geo, 2 mods → Tier 3 ────────────────────────────────

describe('Test 5 — Unknown make (Geo), Tier 3', () => {
  const profile = makeProfile({
    id: 'test-t5-00000000-0000-0000-0000-000000000001',
    make: 'Geo', model: 'Tracker', year: 1995,
    horsepower: 95, chassis_code: null,
  })
  const mods = nMods(2)

  it('resolves to Tier 3', () => {
    const ctx = buildContext(profile, mods, null, US_UNITS)
    expect(ctx.tier).toBe(3)
  })

  it('generates without crashing', () => {
    const result = generateFeature(profile, mods, null, US_UNITS)
    expect(result.headline).toBeTruthy()
    expect(result.deck).toBeTruthy()
  })

  it('contains no chassis epithets or icon/weapon tokens across 200 seeds', () => {
    for (let i = 0; i < 200; i++) {
      const p = { ...profile, id: `t5-geo-${String(i).padStart(6, '0')}-00000000` }
      const result = generateFeature(p, mods, null, US_UNITS)
      const allText = [result.headline, result.deck].join(' ')
      // "icon" and "weapon" are in the hype block list; Tier-3 only gets degradation pool
      expect(allText).not.toMatch(/\bicon\b/i)
      expect(allText).not.toMatch(/\bweapon\b/i)
      expect(allText).not.toMatch(/Godzilla/i)
    }
  })
})

// ─── Test 6: Determinism ──────────────────────────────────────────────────────

describe('Test 6 — Determinism', () => {
  const profile = makeProfile({
    id: 'test-t6-00000000-dead-beef-0000-000000000001',
    make: 'Honda', model: 'Civic', year: 2001,
    horsepower: 160, engine_type: 'B16A',
    chassis_code: 'EK9', forced_induction: 'none',
  })
  const mods = nMods(4)
  const variant: VariantData = { chassis_code: 'EK9', engine_code: 'B16A' }

  it('produces identical output across 50 calls with same inputs', () => {
    const first = generateFeature(profile, mods, variant, US_UNITS)
    for (let i = 0; i < 49; i++) {
      const result = generateFeature(profile, mods, variant, US_UNITS)
      expect(result.headline).toBe(first.headline)
      expect(result.deck).toBe(first.deck)
    }
  })

  it('modCount increases when a mod is added', () => {
    const ctxBase = buildContext(profile, mods, variant, US_UNITS)
    const ctxMore = buildContext(profile, [...mods, makeMod('Safety')], variant, US_UNITS)
    expect(ctxMore.modCount).toBe(ctxBase.modCount + 1)
  })
})

// ─── Test 7: Zero photos + zero mods ──────────────────────────────────────────

describe('Test 7 — Zero photos and zero mods', () => {
  it('generates headline and deck; no crash; empty captions', () => {
    const profile = makeProfile({
      id: 'test-t7-00000000-0000-0000-0000-000000000001',
      make: 'Honda', model: 'Civic', year: 2015, horsepower: 140,
    })
    const result = generateFeature(profile, [], null, US_UNITS, [])
    expect(result.headline).toBeTruthy()
    expect(result.deck).toBeTruthy()
    expect(Object.keys(result.captions).length).toBe(0)
  })
})

// ─── Test 8: No-repeat across slots ──────────────────────────────────────────

describe('Test 8 — No-repeat', () => {
  const SKIP = new Set([
    'that', 'this', 'with', 'from', 'have', 'been', 'were', 'what',
    'when', 'your', 'here', 'just', 'more', 'than', 'into', 'over',
    'does', 'even', 'only', 'them', 'they', 'some', 'like', 'made',
    'take', 'good', 'back', 'same', 'keep', 'never', 'every', 'still',
    'there', 'where', 'which', 'while', 'these', 'their', 'those',
  ])

  it('no 5-char+ word appears in both headline and deck', () => {
    const profile = makeProfile({
      id: 'test-t8-base-0000-0000-0000-000000000001',
      make: 'Toyota', model: 'Supra', year: 1994,
      horsepower: 500, engine_type: '2JZ-GTE',
      forced_induction: 'twin-turbo', chassis_code: 'JZA80',
    })
    const mods = nMods(8)
    const variant: VariantData = { chassis_code: 'JZA80', engine_code: '2JZGTE' }

    for (let i = 0; i < 50; i++) {
      const p = { ...profile, id: `t8-toyota-${String(i).padStart(6, '0')}-0000` }
      const result = generateFeature(p, mods, variant, US_UNITS)
      const headWords = new Set(
        result.headline.toLowerCase().replace(/[^a-z\s]/g, ' ')
          .split(/\s+/).filter(w => w.length >= 5 && !SKIP.has(w))
      )
      const deckWords = result.deck.toLowerCase().replace(/[^a-z\s]/g, ' ')
        .split(/\s+/).filter(w => w.length >= 5 && !SKIP.has(w))
      for (const w of deckWords) {
        expect(headWords.has(w)).toBe(false)
      }
    }
  })
})

// ─── Test 9: Pool-data lint ───────────────────────────────────────────────────

describe('Test 9 — Pool-data lint', () => {
  // Collect all text strings from every pool
  function allPoolTexts(): string[] {
    const texts: string[] = []
    const add = (items: Array<{ text: string }>) => items.forEach(i => texts.push(i.text))

    add(T1_PHRASES)
    add(T2_PHRASES)
    add(T4_PHRASES)
    add(T6_TEMPLATES)
    add(T7_PHRASES)
    for (const pool of Object.values(DECK_POOLS)) add(pool)
    add(CAPTIONS_DETAIL_POINTER)
    add(CAPTIONS_SPEC_FACT)
    for (const pool of Object.values(CAPTIONS_IDENTITY)) add(pool)
    for (const f of ENGINE_FAMILIES) { add(f.decks); add(f.captions) }
    add(SWAP_CAPTIONS)
    for (const e of MAKE_HERITAGE) { add(e.decks); add(e.captions) }
    for (const e of CHASSIS_DB) { add(e.epithets); add(e.captions); add(e.decks) }
    return texts
  }

  // Collect all gate keys from every pool
  function allPoolGates(): string[] {
    const keys: string[] = []
    const addG = (items: Array<{ gates: string[] }>) =>
      items.forEach(i => keys.push(...i.gates))

    addG(T1_PHRASES); addG(T2_PHRASES); addG(T4_PHRASES)
    addG(T6_TEMPLATES); addG(T7_PHRASES)
    for (const pool of Object.values(DECK_POOLS)) addG(pool)
    addG(CAPTIONS_DETAIL_POINTER); addG(CAPTIONS_SPEC_FACT)
    for (const pool of Object.values(CAPTIONS_IDENTITY)) addG(pool)
    for (const f of ENGINE_FAMILIES) { addG(f.decks); addG(f.captions) }
    addG(SWAP_CAPTIONS)
    for (const e of MAKE_HERITAGE) { addG(e.decks); addG(e.captions) }
    for (const e of CHASSIS_DB) { addG(e.epithets); addG(e.captions); addG(e.decks) }
    return keys
  }

  it('"kicked in" does not appear anywhere in pool data', () => {
    for (const text of allPoolTexts()) {
      expect(text.toLowerCase()).not.toContain('kicked in')
    }
  })

  it('every gate key referenced in pools exists in gates.ts', () => {
    const unique = [...new Set(allPoolGates())]
    for (const key of unique) {
      expect(
        GATES,
        `Gate "${key}" referenced in pool data but not defined in gates.ts`,
      ).toHaveProperty(key)
    }
  })
})

// ─── Subaru eye gate unit tests ───────────────────────────────────────────────

describe('resolveSubaruEye', () => {
  it('USDM 2002 → bugeye', () =>
    expect(resolveSubaruEye({ chassisCode: 'GDB', year: 2002, isImport: false })).toBe('bugeye'))
  it('USDM 2003 → bugeye', () =>
    expect(resolveSubaruEye({ chassisCode: 'GDB', year: 2003, isImport: false })).toBe('bugeye'))
  it('USDM 2004 → blobeye', () =>
    expect(resolveSubaruEye({ chassisCode: 'GDB', year: 2004, isImport: false })).toBe('blobeye'))
  it('USDM 2005 → blobeye', () =>
    expect(resolveSubaruEye({ chassisCode: 'GDB', year: 2005, isImport: false })).toBe('blobeye'))
  it('USDM 2006 → hawkeye', () =>
    expect(resolveSubaruEye({ chassisCode: 'GDB', year: 2006, isImport: false })).toBe('hawkeye'))
  it('JDM 2000 → bugeye', () =>
    expect(resolveSubaruEye({ chassisCode: 'GDB', year: 2000, isImport: true })).toBe('bugeye'))
  it('JDM 2001 → bugeye', () =>
    expect(resolveSubaruEye({ chassisCode: 'GDB', year: 2001, isImport: true })).toBe('bugeye'))
  it('JDM 2002 → null (ambiguous transition year)', () =>
    expect(resolveSubaruEye({ chassisCode: 'GDB', year: 2002, isImport: true })).toBeNull())
  it('JDM 2003 → blobeye', () =>
    expect(resolveSubaruEye({ chassisCode: 'GDB', year: 2003, isImport: true })).toBe('blobeye'))
  it('JDM 2004 → blobeye', () =>
    expect(resolveSubaruEye({ chassisCode: 'GDB', year: 2004, isImport: true })).toBe('blobeye'))
  it('JDM 2005 → null (ambiguous transition year)', () =>
    expect(resolveSubaruEye({ chassisCode: 'GDB', year: 2005, isImport: true })).toBeNull())
  it('JDM 2006 → hawkeye', () =>
    expect(resolveSubaruEye({ chassisCode: 'GDB', year: 2006, isImport: true })).toBe('hawkeye'))
  it('non-GDB chassis → null', () =>
    expect(resolveSubaruEye({ chassisCode: 'GC8', year: 2002, isImport: false })).toBeNull())
  it('null chassis → null', () =>
    expect(resolveSubaruEye({ chassisCode: null, year: 2002, isImport: false })).toBeNull())
})
