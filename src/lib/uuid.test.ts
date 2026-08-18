import { describe, it, expect } from 'vitest'
import { isUuid, UUID_RE } from './uuid'

const REAL = '07a3198d-7a0b-4d9e-abdd-ce3240018428'   // a real car id shape

describe('isUuid', () => {
  it('accepts a well-formed uuid', () => {
    expect(isUuid(REAL)).toBe(true)
  })

  it('accepts uppercase — Postgres does not care about case', () => {
    expect(isUuid(REAL.toUpperCase())).toBe(true)
  })

  it('rejects the route words that caused this to exist', () => {
    // /maintenance/:sessionId is a catch-all for one segment, so these all
    // matched the route and reached a .eq() on a uuid column as 400s.
    expect(isUuid('detailing')).toBe(false)
    expect(isUuid('service')).toBe(false)
    expect(isUuid('new')).toBe(false)
  })

  it('rejects null and undefined rather than throwing', () => {
    expect(isUuid(null)).toBe(false)
    expect(isUuid(undefined)).toBe(false)
  })

  it('rejects the empty string', () => {
    expect(isUuid('')).toBe(false)
  })

  it('rejects a uuid with the wrong group lengths', () => {
    expect(isUuid('07a3198d-7a0b-4d9e-abdd-ce324001842')).toBe(false)   // short tail
    expect(isUuid('07a3198d-7a0b-4d9e-abdd-ce3240018428a')).toBe(false) // long tail
    expect(isUuid('07a3198-d7a0b-4d9e-abdd-ce3240018428')).toBe(false)  // misplaced dash
  })

  it('rejects non-hex characters', () => {
    expect(isUuid('07a3198g-7a0b-4d9e-abdd-ce3240018428')).toBe(false)
  })

  it('is ANCHORED — a uuid buried in a longer string is not a uuid', () => {
    // Without ^ and $ these would pass, and a crafted param could smuggle
    // trailing text into a query.
    expect(isUuid(` ${REAL}`)).toBe(false)
    expect(isUuid(`${REAL} `)).toBe(false)
    expect(isUuid(`${REAL}/edit`)).toBe(false)
    expect(isUuid(`x${REAL}`)).toBe(false)
  })

  it('has no global flag, so repeated tests do not alternate', () => {
    // A /g regex carries lastIndex between .test() calls, which would make the
    // guard pass and fail alternately for the same id.
    expect(UUID_RE.global).toBe(false)
    expect(UUID_RE.test(REAL)).toBe(true)
    expect(UUID_RE.test(REAL)).toBe(true)
  })
})
