import { describe, it, expect } from 'vitest'
import { avatarPathFromUrl } from './avatar'

describe('avatarPathFromUrl', () => {
  it('extracts the object path from a public avatar URL', () => {
    const url =
      'https://uxqoernfrtgclpneirvc.supabase.co/storage/v1/object/public/avatars/abc-123/1700000000-x9.jpg'
    expect(avatarPathFromUrl(url)).toBe('abc-123/1700000000-x9.jpg')
  })
  it('returns null for non-avatar URLs', () => {
    expect(avatarPathFromUrl('https://example.com/storage/v1/object/public/car-photos/u/c/g.jpg')).toBeNull()
  })
  it('returns null for empty / nullish input', () => {
    expect(avatarPathFromUrl(null)).toBeNull()
    expect(avatarPathFromUrl(undefined)).toBeNull()
    expect(avatarPathFromUrl('')).toBeNull()
  })
})
