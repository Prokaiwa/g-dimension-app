import { describe, it, expect } from 'vitest'
import { codeForCountry, flagEmoji, COUNTRIES } from './countries'

describe('codeForCountry', () => {
  it('maps a known country name to its ISO code, case-insensitively', () => {
    expect(codeForCountry('Japan')).toBe('JP')
    expect(codeForCountry('JAPAN')).toBe('JP')
    expect(codeForCountry('  united states ')).toBe('US')
  })
  it('returns null for unknown or empty names', () => {
    expect(codeForCountry('Atlantis')).toBeNull()
    expect(codeForCountry('')).toBeNull()
    expect(codeForCountry('   ')).toBeNull()
  })
})

describe('flagEmoji', () => {
  it('renders a flag from a valid ISO alpha-2 code', () => {
    expect(flagEmoji('JP')).toBe('🇯🇵')
    expect(flagEmoji('us')).toBe('🇺🇸') // lowercase input is upper-cased
  })
  it('returns an empty string for invalid input', () => {
    expect(flagEmoji(null)).toBe('')
    expect(flagEmoji(undefined)).toBe('')
    expect(flagEmoji('USA')).toBe('')
    expect(flagEmoji('1')).toBe('')
    expect(flagEmoji('')).toBe('')
  })
  it('produces a flag for every country in the list', () => {
    for (const c of COUNTRIES) {
      expect(flagEmoji(c.code), `flag for ${c.name} (${c.code})`).not.toBe('')
    }
  })
})
