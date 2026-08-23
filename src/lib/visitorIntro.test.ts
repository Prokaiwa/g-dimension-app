import { describe, it, expect, beforeEach } from 'vitest'

// vitest runs in the `node` environment (vitest.config.ts), so there is no DOM
// and neither storage exists. Same in-memory stand-in as recentSearches.test,
// but BOTH storages are needed here: the whole point of this module is that the
// two records have different lifetimes, and a test that shared one Map between
// them could not tell the session flag from the permanent one.
function fakeStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => { store.clear() },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size },
  } as Storage
}
;(globalThis as unknown as { localStorage: Storage }).localStorage = fakeStorage()
;(globalThis as unknown as { sessionStorage: Storage }).sessionStorage = fakeStorage()

import {
  markScanArrival, isScanArrival, clearScanArrival, shouldWelcome, markWelcomed,
} from './visitorIntro'

const CAR = '11111111-2222-3333-4444-555555555555'

describe('visitorIntro — scan arrival', () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear() })

  it('is false until a scan is recorded', () => {
    expect(isScanArrival()).toBe(false)
    markScanArrival(CAR)
    expect(isScanArrival()).toBe(true)
  })

  // The glow is a nudge that happens once. If acting on it did not spend the
  // flag, the Choose button would still be pulsing when the visitor navigated
  // back to the carousel, which is the behaviour of an ad rather than a hint.
  it('is spent by clearScanArrival', () => {
    markScanArrival(CAR)
    clearScanArrival()
    expect(isScanArrival()).toBe(false)
  })

  it('ignores an empty car id rather than arming on nothing', () => {
    markScanArrival('')
    expect(isScanArrival()).toBe(false)
  })

  // Session scoped on purpose: it describes an arrival, not a person. A closed
  // tab is a finished visit.
  it('lives in sessionStorage, not localStorage', () => {
    markScanArrival(CAR)
    expect(sessionStorage.getItem('gdim_qr_scan')).toBe(CAR)
    expect(localStorage.getItem('gdim_qr_scan')).toBeNull()
  })
})

describe('visitorIntro — welcome', () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear() })

  it('welcomes once, then never again for that profile', () => {
    expect(shouldWelcome('ash')).toBe(true)
    markWelcomed('ash')
    expect(shouldWelcome('ash')).toBe(false)
  })

  // Keyed by username, not a single global "seen" flag: having been shown
  // around one builder's map says nothing about the next one.
  it('is per profile', () => {
    markWelcomed('ash')
    expect(shouldWelcome('kim')).toBe(true)
  })

  it('survives the session (localStorage, not sessionStorage)', () => {
    markWelcomed('ash')
    sessionStorage.clear()
    expect(shouldWelcome('ash')).toBe(false)
  })

  it('handles a missing username without welcoming nobody', () => {
    expect(shouldWelcome(undefined)).toBe(false)
    expect(() => markWelcomed(undefined)).not.toThrow()
  })

  // Half-corrupt or hand-edited storage must not decide whether someone gets
  // welcomed. Falling back to "welcome them" is the safe direction: the worst
  // case is one extra bubble, not a visitor who never gets told what this is.
  it('recovers from junk in storage', () => {
    localStorage.setItem('gdim_pub_welcomed', 'not json')
    expect(shouldWelcome('ash')).toBe(true)
    localStorage.setItem('gdim_pub_welcomed', '{"ash":true}')
    expect(shouldWelcome('ash')).toBe(true)
    localStorage.setItem('gdim_pub_welcomed', '[1, null, "ash"]')
    expect(shouldWelcome('ash')).toBe(false)
  })

  // The record is a short list of handles, not a log of everywhere someone has
  // been. Oldest fall off; the most recent stay remembered.
  it('caps the list, dropping the oldest first', () => {
    for (let i = 0; i < 45; i++) markWelcomed(`u${i}`)
    expect(shouldWelcome('u0')).toBe(true)
    expect(shouldWelcome('u44')).toBe(false)
    expect(JSON.parse(localStorage.getItem('gdim_pub_welcomed') ?? '[]')).toHaveLength(40)
  })

  // Re-marking an already-welcomed profile must refresh its position rather
  // than add a second copy, or a returning visitor would evict 40 entries with
  // repeat visits to one profile.
  it('does not duplicate on a repeat mark', () => {
    markWelcomed('ash')
    markWelcomed('ash')
    expect(JSON.parse(localStorage.getItem('gdim_pub_welcomed') ?? '[]')).toEqual(['ash'])
  })
})
