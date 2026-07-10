import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { shareLink } from './share'

// navigator.share / navigator.clipboard are stubbed per test — the node test
// environment's navigator has neither by default, so each test installs exactly
// what it needs. Omit<> makes `share` genuinely optional (the DOM lib types it
// as a required method, which would forbid `delete`).
const nav = navigator as Omit<Navigator, 'share'> & {
  share?: (data?: ShareData) => Promise<void>
  clipboard: { writeText: (t: string) => Promise<void> }
}

const origShare = nav.share
const origClipboard = nav.clipboard

afterEach(() => {
  if (origShare === undefined) delete nav.share
  else nav.share = origShare
  Object.defineProperty(nav, 'clipboard', { value: origClipboard, configurable: true })
  vi.restoreAllMocks()
})

beforeEach(() => {
  Object.defineProperty(nav, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  })
})

describe('shareLink', () => {
  it("returns 'shared' when navigator.share succeeds", async () => {
    nav.share = vi.fn().mockResolvedValue(undefined)
    await expect(shareLink({ url: 'https://x.test/a' })).resolves.toBe('shared')
    expect(nav.share).toHaveBeenCalledWith({ url: 'https://x.test/a', title: undefined, text: undefined })
    expect(nav.clipboard.writeText).not.toHaveBeenCalled()
  })

  it("returns 'unavailable' on user cancel (AbortError) WITHOUT falling back to clipboard", async () => {
    nav.share = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'))
    await expect(shareLink({ url: 'https://x.test/a' })).resolves.toBe('unavailable')
    expect(nav.clipboard.writeText).not.toHaveBeenCalled()
  })

  it("falls back to clipboard ('copied') when share fails for a non-cancel reason", async () => {
    nav.share = vi.fn().mockRejectedValue(new DOMException('nope', 'NotAllowedError'))
    await expect(shareLink({ url: 'https://x.test/a' })).resolves.toBe('copied')
    expect(nav.clipboard.writeText).toHaveBeenCalledWith('https://x.test/a')
  })

  it("returns 'copied' when navigator.share is absent (desktop)", async () => {
    delete nav.share
    await expect(shareLink({ url: 'https://x.test/a' })).resolves.toBe('copied')
    expect(nav.clipboard.writeText).toHaveBeenCalledWith('https://x.test/a')
  })

  it("returns 'unavailable' when nothing works", async () => {
    delete nav.share
    Object.defineProperty(nav, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    })
    await expect(shareLink({ url: 'https://x.test/a' })).resolves.toBe('unavailable')
  })
})
