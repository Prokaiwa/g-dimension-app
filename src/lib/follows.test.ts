import { describe, it, expect, beforeEach } from 'vitest'

// The unit test environment is node, so there is no localStorage. Stub it, which
// is the right level anyway: what's under test is the single-use semantics of
// the parked intent, not the browser's storage implementation.
const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) },
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size },
} as Storage
import {
  formatCount, setPendingFollow, takePendingFollow, peekPendingFollow, clearPendingFollow,
} from './follows'

describe('formatCount', () => {
  it('shows small numbers exactly', () => {
    expect(formatCount(0)).toBe('0')
    expect(formatCount(7)).toBe('7')
    expect(formatCount(999)).toBe('999')
  })

  it('abbreviates thousands with one decimal, dropping a trailing .0', () => {
    expect(formatCount(1000)).toBe('1k')
    expect(formatCount(1200)).toBe('1.2k')
    expect(formatCount(9999)).toBe('10k')
  })

  it('drops the decimal past 10k', () => {
    expect(formatCount(10000)).toBe('10k')
    expect(formatCount(23400)).toBe('23k')
    expect(formatCount(999000)).toBe('999k')
  })

  it('handles millions', () => {
    expect(formatCount(1000000)).toBe('1m')
    expect(formatCount(1500000)).toBe('1.5m')
  })
})

describe('pending follow intent', () => {
  beforeEach(() => clearPendingFollow())

  it('round-trips a handle', () => {
    setPendingFollow('dscan007')
    expect(peekPendingFollow()).toBe('dscan007')
    expect(takePendingFollow()).toBe('dscan007')
  })

  it('is single-use, so a completed follow cannot loop', () => {
    // This matters: the intent is consumed on the way back from signup, and if
    // it survived, every later visit would re-trigger the redirect.
    setPendingFollow('someone')
    expect(takePendingFollow()).toBe('someone')
    expect(takePendingFollow()).toBeNull()
    expect(peekPendingFollow()).toBeNull()
  })

  it('returns null when nothing is parked', () => {
    expect(takePendingFollow()).toBeNull()
    expect(peekPendingFollow()).toBeNull()
  })

  it('survives being cleared twice', () => {
    setPendingFollow('x')
    clearPendingFollow()
    clearPendingFollow()
    expect(peekPendingFollow()).toBeNull()
  })
})
