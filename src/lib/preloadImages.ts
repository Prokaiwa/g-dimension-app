// Warm image URLs into the browser's cache during idle time, so the next
// screen (or the next carousel card) renders from a cache hit instead of a
// cold network fetch. Storage URLs are immutable (timestamped paths +
// 1-year cache-control), so warming is never wasted bandwidth.
//
// Same idiom as the inline preloaders in TuningModDetailPage/FeaturedPage —
// extracted because the car-photo pipeline needs it in three places
// (HomePage, GarageCarsPage, PublicGaragePage).
export function preloadImagesOnIdle(urls: (string | null | undefined)[]): () => void {
  const list = urls.filter((u): u is string => !!u)
  if (list.length === 0) return () => {}
  const run = () => { for (const u of list) { const img = new Image(); img.src = u } }
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
    cancelIdleCallback?: (id: number) => void
  }
  if (typeof w.requestIdleCallback === 'function') {
    const id = w.requestIdleCallback(run, { timeout: 2000 })
    return () => w.cancelIdleCallback?.(id)
  }
  const id = window.setTimeout(run, 300)
  return () => window.clearTimeout(id)
}
