import { describe, it, expect, vi, afterEach } from 'vitest'
import { shareLink } from './share'

// The test env is 'node' (vitest.config.ts). Node <21 has no global `navigator`,
// so we must never touch it at module scope — instead each test installs exactly
// the navigator shape it needs via vi.stubGlobal (which creates the global if it
// doesn't exist and is cleaned up by unstubAllGlobals). This is why the first CI
// run failed on Node 20 with "navigator is not defined" while passing locally on
// Node 22.
afterEach(() => { vi.unstubAllGlobals() })

describe('shareLink', () => {
  it("returns 'shared' when navigator.share succeeds", async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share, clipboard: { writeText } })
    await expect(shareLink({ url: 'https://x.test/a' })).resolves.toBe('shared')
    expect(share).toHaveBeenCalledWith({ url: 'https://x.test/a', title: undefined, text: undefined })
    expect(writeText).not.toHaveBeenCalled()
  })

  it("returns 'unavailable' on user cancel (AbortError) WITHOUT falling back to clipboard", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'))
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share, clipboard: { writeText } })
    await expect(shareLink({ url: 'https://x.test/a' })).resolves.toBe('unavailable')
    expect(writeText).not.toHaveBeenCalled()
  })

  it("falls back to clipboard ('copied') when share fails for a non-cancel reason", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('nope', 'NotAllowedError'))
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share, clipboard: { writeText } })
    await expect(shareLink({ url: 'https://x.test/a' })).resolves.toBe('copied')
    expect(writeText).toHaveBeenCalledWith('https://x.test/a')
  })

  it("returns 'copied' when navigator.share is absent (desktop)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    await expect(shareLink({ url: 'https://x.test/a' })).resolves.toBe('copied')
    expect(writeText).toHaveBeenCalledWith('https://x.test/a')
  })

  it("returns 'unavailable' when nothing works", async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    await expect(shareLink({ url: 'https://x.test/a' })).resolves.toBe('unavailable')
  })
})
