// Shared kraft-paper photo background for the Parts Bin aesthetic island
// (TuningPartsPage, TuningPartDetailPage, TuningPartEditPage, TuningAddPage
// in parts-bin mode).
//
// Three stacked background layers in ONE paint, top to bottom:
//   1. edge vignette gradient
//   2. the real kraft photo (372KB WebP — decodes in ~100-300ms)
//   3. an 82-byte inline blurred placeholder (data URI, paints INSTANTLY)
// Until the photo decodes, the placeholder shows the same warm tan tone, so
// there is never a flash from flat CSS color to photo — the texture simply
// sharpens in. Pages also idle-preload the photo from the Tuning landing
// (see TuningPage), so in practice it's usually cache-hot before arrival.
import kraftUrl from '../assets/backgrounds/kraft.webp'

export const KRAFT_BG_URL = kraftUrl

const KRAFT_LQIP = 'data:image/webp;base64,UklGRkoAAABXRUJQVlA4ID4AAAAwAwCdASogADMAPsFgqlAnpaOipAgA8BgJZwAAIKkrfeAAAP7dcP/+He7PO0C/3SfqgPi//i6JBPGkPmIAAA=='

/** backgroundImage value for the fixed desk-surface layer. */
export function kraftLayers(vignetteAlpha: number): string {
  return [
    `radial-gradient(ellipse 100% 100% at 50% 50%, transparent 60%, rgba(80,40,10,${vignetteAlpha}) 100%)`,
    `url(${kraftUrl})`,
    `url("${KRAFT_LQIP}")`,
  ].join(', ')
}
