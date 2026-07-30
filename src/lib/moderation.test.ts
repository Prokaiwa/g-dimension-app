import { describe, it, expect } from 'vitest'
import {
  isSevereReason,
  usernameRejectionMessage,
  REPORT_REASONS,
  reportTargetHref,
  reportTargetLinkLabel,
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

describe('reportTargetHref', () => {
  const base = {
    id: 'r1', created_at: '', reason: 'spam' as ReportReason, details: null,
    status: 'open' as const, auto_hidden: false, target_owner_id: 'u1',
    reporter_username: 'someone', owner_username: 'scantee',
    owner_suspended: false, target_car_hidden: false, report_count: 1,
  }

  it('sends a photo report to the mod it hangs off, not the profile', () => {
    expect(reportTargetHref({
      ...base, target_type: 'photo', target_id: 'ph1',
      target_car_id: 'car1', target_job_id: 'job1',
    })).toBe('/builds/scantee/mods/job1?car=car1')
  })

  it('sends a timeline_entry report straight to the entry', () => {
    expect(reportTargetHref({
      ...base, target_type: 'timeline_entry', target_id: 'e1', target_car_id: 'car1',
    })).toBe('/builds/scantee/timeline/entry/e1?car=car1')
  })

  it('sends a car report to that car, not whichever one is active', () => {
    expect(reportTargetHref({ ...base, target_type: 'car', target_id: 'car1' }))
      .toBe('/builds/scantee?car=car1')
  })

  // An account-level report is not about any one build, so there is nothing
  // more specific to open than the profile.
  it('falls back to the profile for a user report', () => {
    expect(reportTargetHref({ ...base, target_type: 'user', target_id: 'u1' }))
      .toBe('/builds/scantee')
  })

  // Pre-090 the RPC returns neither resolved column. The link must degrade to
  // the build rather than build a broken URL out of a photo id.
  it('degrades to the build when the row predates migration 090', () => {
    expect(reportTargetHref({ ...base, target_type: 'photo', target_id: 'ph1' }))
      .toBe('/builds/scantee')
  })

  it('gives up when the owner handle is unknown', () => {
    expect(reportTargetHref({ ...base, owner_username: null, target_type: 'car', target_id: 'c' }))
      .toBeNull()
  })
})

describe('reportTargetLinkLabel', () => {
  const base = {
    id: 'r1', created_at: '', reason: 'spam' as ReportReason, details: null,
    status: 'open' as const, auto_hidden: false, target_owner_id: 'u1',
    reporter_username: 's', owner_username: 'scantee',
    owner_suspended: false, target_car_hidden: false, report_count: 1,
  }

  it('names what it opens', () => {
    expect(reportTargetLinkLabel({ ...base, target_type: 'photo', target_id: 'p', target_job_id: 'j' }))
      .toBe('Open the photo')
    expect(reportTargetLinkLabel({ ...base, target_type: 'timeline_entry', target_id: 'e' }))
      .toBe('Open the entry')
    expect(reportTargetLinkLabel({ ...base, target_type: 'car', target_id: 'c' }))
      .toBe('Open the build')
  })

  // No job id means the link points at the build, so it must not promise a photo.
  it('does not promise a photo it cannot open', () => {
    expect(reportTargetLinkLabel({ ...base, target_type: 'photo', target_id: 'p' }))
      .toBe('Open the build')
  })
})
