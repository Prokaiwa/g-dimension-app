import { describe, it, expect } from 'vitest'
import {
  isSevereReason,
  usernameRejectionMessage,
  REPORT_REASONS,
  type ReportReason,
} from './moderation'

describe('isSevereReason', () => {
  // These four auto-hide the content on report. The DB trigger in migration 084
  // owns the real decision; this list only drives the warning shown before the
  // user taps, so the two MUST agree or the warning lies.
  it('treats exactly the four auto-hide reasons as severe', () => {
    expect(isSevereReason('nudity')).toBe(true)
    expect(isSevereReason('hate')).toBe(true)
    expect(isSevereReason('violence')).toBe(true)
    expect(isSevereReason('illegal')).toBe(true)
  })

  it('leaves the judgement-call reasons to a human', () => {
    expect(isSevereReason('harassment')).toBe(false)
    expect(isSevereReason('spam')).toBe(false)
    expect(isSevereReason('impersonation')).toBe(false)
    expect(isSevereReason('other')).toBe(false)
  })
})

describe('REPORT_REASONS', () => {
  it('offers every reason the database accepts', () => {
    // Mirrors the CHECK constraint on content_reports.reason. A reason missing
    // here is unreportable; one that is extra fails the insert at 23514.
    const expected: ReportReason[] = [
      'nudity', 'hate', 'violence', 'illegal',
      'harassment', 'spam', 'impersonation', 'other',
    ]
    expect([...REPORT_REASONS.map(r => r.id)].sort()).toEqual([...expected].sort())
  })

  it('leads with the severe reasons', () => {
    // Worst-first ordering: the options that take content down immediately
    // should be the ones a distressed user reaches without scrolling.
    const firstFour = REPORT_REASONS.slice(0, 4).map(r => r.id)
    expect(firstFour.every(isSevereReason)).toBe(true)
  })

  it('gives every reason a label and a hint', () => {
    for (const r of REPORT_REASONS) {
      expect(r.label.length).toBeGreaterThan(0)
      expect(r.sub.length).toBeGreaterThan(0)
    }
  })
})

describe('usernameRejectionMessage', () => {
  it('names the reason when it is harmless to say so', () => {
    expect(usernameRejectionMessage('reserved')).toMatch(/reserved/i)
    expect(usernameRejectionMessage('brand')).toMatch(/official/i)
  })

  it('stays vague about profanity and slurs', () => {
    // Deliberate: telling someone which term matched just teaches them how to
    // spell around the blocklist.
    for (const r of ['profanity', 'slur'] as const) {
      const msg = usernameRejectionMessage(r)
      expect(msg).toMatch(/isn’t allowed/i)
      expect(msg.toLowerCase()).not.toContain('profan')
      expect(msg.toLowerCase()).not.toContain('slur')
    }
  })
})
