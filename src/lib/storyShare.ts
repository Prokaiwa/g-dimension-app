// Instagram-Story share for the Featured magazine cover.
//
// Captures the EXACT rendered cover DOM (the owner's chosen template, custom
// headline/deck, photo framing — whatever is on screen), letterboxes it onto
// a 1080×1920 story canvas, and returns a File ready for the native share
// sheet (navigator.share) — where the user picks Instagram and lands in the
// Story composer. There is no web API that posts to a Story directly; the
// share sheet is the standard path.
//
// Engine: html-to-image (SVG foreignObject) — the BROWSER paints the
// snapshot, so text metrics, gradients, blend modes, object-fit framing and
// the barcode all come out exactly as on screen. Its predecessor here
// (html2canvas) re-implements CSS rendering itself and produced squished
// type, a faint masthead, an inverted barcode and a missing car photo.
// It inlines images/fonts by fetching them (CORS; Supabase buckets and
// Google Fonts both send ACAO:*), so no cross-origin pixel ever taints the
// canvas. Loaded dynamically — nothing on the boot path.

const STORY_W = 1080
const STORY_H = 1920

export async function buildStoryImage(el: HTMLElement): Promise<File> {
  // Fonts must be resolved before rasterizing or Anton/Hanken fall back.
  await document.fonts.ready
  const { toCanvas } = await import('html-to-image')

  const opts = {
    // Render at story resolution.
    pixelRatio: Math.max(2, STORY_W / Math.max(1, el.clientWidth)),
  }

  // WebKit warm-up: Safari's first foreignObject rasterization can miss
  // late-inlined images/fonts (long-standing quirk). Render three times and
  // keep the last — each pass is cheap and by the third everything is cached.
  let cover = await toCanvas(el, opts)
  cover = await toCanvas(el, opts)
  cover = await toCanvas(el, opts)

  // If anything unexpectedly tainted the render, fail with a named stage
  // instead of the browser's cryptic SecurityError at export time.
  try {
    cover.getContext('2d')?.getImageData(0, 0, 1, 1)
  } catch {
    throw new Error('render tainted (a cross-origin resource slipped into the capture)')
  }

  const canvas = document.createElement('canvas')
  canvas.width = STORY_W
  canvas.height = STORY_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d unavailable')

  // Letterbox: the cover IS the design; the background is a quiet dark field.
  ctx.fillStyle = '#0a0a0c'
  ctx.fillRect(0, 0, STORY_W, STORY_H)
  let dw = STORY_W
  let dh = cover.height * (STORY_W / cover.width)
  if (dh > STORY_H) { dh = STORY_H; dw = cover.width * (STORY_H / cover.height) }
  ctx.drawImage(cover, (STORY_W - dw) / 2, (STORY_H - dh) / 2, dw, dh)

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.92),
  )
  return new File([blob], 'gdimension-cover.jpg', { type: 'image/jpeg' })
}

export function canShareFile(file: File): boolean {
  try {
    return typeof navigator !== 'undefined'
      && typeof navigator.canShare === 'function'
      && navigator.canShare({ files: [file] })
  } catch {
    return false
  }
}

/** Fallback when the native share sheet isn't available: save the image. */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the click a beat before revoking so the download starts reliably.
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
