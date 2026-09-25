// Link sharing — native share sheet where available (mobile), clipboard fallback
// elsewhere (desktop). One shared helper so ProfilePage / PublicProfilePage (and
// future callers) don't each re-implement the navigator.share dance FeaturedPage
// and GaragePdfPage hand-rolled for their file shares.
//
// Outcomes:
//   'shared'      — the native share sheet completed
//   'copied'      — no share sheet (or it errored); URL copied to the clipboard
//   'unavailable' — user cancelled the sheet, or nothing worked (caller shows no
//                   feedback for a cancel — dismissing the sheet is not a failure)

import { shareLinkNative } from './nativeShare'

export type ShareOutcome = 'shared' | 'copied' | 'unavailable'

export async function shareLink(opts: { url: string; title?: string; text?: string }): Promise<ShareOutcome> {
  // Native app: the system share sheet via the Share plugin, since WebKit's
  // navigator.share is not reliably exposed inside an app's WebView.
  try {
    const native = await shareLinkNative(opts)
    if (native === 'shared') return 'shared'
    if (native === 'cancelled') return 'unavailable'
  } catch { /* fall through to the web paths */ }
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ url: opts.url, title: opts.title, text: opts.text })
      return 'shared'
    } catch (err) {
      // User dismissed the sheet — respect the cancel, don't surprise them with
      // a clipboard write they didn't ask for.
      if (err instanceof DOMException && err.name === 'AbortError') return 'unavailable'
      // Anything else (permissions, invalid data) → try the clipboard instead.
    }
  }
  try {
    await navigator.clipboard.writeText(opts.url)
    return 'copied'
  } catch {
    return 'unavailable'
  }
}
