import { describe, it, expect } from 'vitest'
import {
  normalizeUsername,
  isReservedUsername,
  profileName,
  USERNAME_MIN_LEN,
} from './userProfile'

describe('normalizeUsername', () => {
  it('lowercases input', () => {
    expect(normalizeUsername('JohnDoe')).toBe('johndoe')
  })
  it('strips characters outside [a-z0-9_]', () => {
    expect(normalizeUsername('john.doe-99!')).toBe('johndoe99')
    expect(normalizeUsername('café*man')).toBe('cafman')
  })
  it('keeps digits and underscores', () => {
    expect(normalizeUsername('skyline_r32')).toBe('skyline_r32')
  })
  it('caps length at 30 characters', () => {
    expect(normalizeUsername('a'.repeat(40))).toHaveLength(30)
  })
  it('returns empty string when nothing valid remains', () => {
    expect(normalizeUsername('   ')).toBe('')
    expect(normalizeUsername('!!!')).toBe('')
  })
})

describe('isReservedUsername', () => {
  it('flags reserved handles case-insensitively', () => {
    expect(isReservedUsername('admin')).toBe(true)
    expect(isReservedUsername('Settings')).toBe(true)
    expect(isReservedUsername('BUILDS')).toBe(true)
    expect(isReservedUsername('welcome')).toBe(true)
  })
  it('allows ordinary handles', () => {
    expect(isReservedUsername('hiroshi')).toBe(false)
    expect(isReservedUsername('skyline_r32')).toBe(false)
  })
})

describe('profileName', () => {
  it('prefers a non-empty display name', () => {
    expect(profileName({ display_name: 'Hiroshi', username: 'hiro_92' })).toBe('Hiroshi')
  })
  it('falls back to username when display name is empty or whitespace', () => {
    expect(profileName({ display_name: '   ', username: 'hiro_92' })).toBe('hiro_92')
    expect(profileName({ display_name: null, username: 'hiro_92' })).toBe('hiro_92')
  })
})

describe('USERNAME_MIN_LEN', () => {
  it('is 3', () => {
    expect(USERNAME_MIN_LEN).toBe(3)
  })
})
