import { describe, it, expect } from 'vitest'
import { isOfferLive, transferErrorMessage, transferCarName } from './carTransfers'

const HOUR = 60 * 60 * 1000
const now = new Date('2026-07-11T12:00:00Z')

describe('isOfferLive', () => {
  it('is live while pending and before expiry', () => {
    expect(isOfferLive(
      { status: 'pending', expires_at: new Date(now.getTime() + HOUR).toISOString() },
      now,
    )).toBe(true)
  })
  it('is dead once expired, even while still pending', () => {
    expect(isOfferLive(
      { status: 'pending', expires_at: new Date(now.getTime() - HOUR).toISOString() },
      now,
    )).toBe(false)
  })
  it('is dead in any terminal status', () => {
    const expires_at = new Date(now.getTime() + HOUR).toISOString()
    expect(isOfferLive({ status: 'accepted', expires_at }, now)).toBe(false)
    expect(isOfferLive({ status: 'declined', expires_at }, now)).toBe(false)
    expect(isOfferLive({ status: 'cancelled', expires_at }, now)).toBe(false)
  })
  it('treats an unparseable expiry as dead', () => {
    expect(isOfferLive({ status: 'pending', expires_at: 'not-a-date' }, now)).toBe(false)
  })
})

describe('transferErrorMessage', () => {
  it('maps the one-pending-offer unique violation to friendly copy', () => {
    expect(transferErrorMessage('23505', 'duplicate key value')).toContain('already pending')
  })
  it('maps a missing table/function (pre-migration 072) to friendly copy', () => {
    expect(transferErrorMessage('42P01', 'relation does not exist')).toContain('aren’t available yet')
    expect(transferErrorMessage('PGRST202', 'function not found')).toContain('aren’t available yet')
  })
  it('falls through to the raw message otherwise', () => {
    expect(transferErrorMessage('12345', 'boom')).toBe('boom')
    expect(transferErrorMessage(null, 'boom')).toBe('boom')
  })
})

describe('transferCarName', () => {
  it('combines nickname and model line', () => {
    expect(transferCarName({
      year: 2006, nickname: 'The Barge', model: 'LS', variant: '430', garage_photo_url: null,
    })).toBe('The Barge — 2006 LS 430')
  })
  it('falls back to the model line without a nickname', () => {
    expect(transferCarName({
      year: 1999, nickname: null, model: 'Silvia', variant: null, garage_photo_url: null,
    })).toBe('1999 Silvia')
  })
  it('falls back to nickname alone when identity fields are empty', () => {
    expect(transferCarName({
      year: null, nickname: 'Project X', model: null, variant: null, garage_photo_url: null,
    })).toBe('Project X')
  })
  it('handles a completely unreadable car (private car RLS hides the join)', () => {
    expect(transferCarName(null)).toBe('a car')
  })
})
