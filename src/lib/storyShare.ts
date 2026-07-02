// Instagram-Story share for the Featured magazine cover.
//
// Captures the EXACT rendered cover DOM (the owner's chosen template, custom
// headline/deck, photo framing — whatever is on screen) with html2canvas,
// letterboxes it onto a 1080×1920 story canvas, and returns a File ready for
// the native share sheet (navigator.share) — where the user picks Instagram
// and lands in the Story composer with the image loaded. There is no web API
// that posts to a Story directly; the share sheet is the standard path.
//
// html2canvas is imported dynamically so none of this weighs on the boot
// bundle — it only loads the first time someone actually shares.

const STORY_W = 1080
const STORY_H = 1920

export async function buildStoryImage(el: HTMLElement): Promise<File> {
  // Fonts must be resolved before rasterizing or Anton/Hanken fall back.
  await document.fonts.ready
  const { default: html2canvas } = await import('html2canvas')

  // Capture at whatever scale makes the cover at least story-width.
  const scale = Math.max(2, STORY_W / Math.max(1, el.clientWidth))
  const cover = await html2canvas(el, {
    useCORS: true,          // Supabase public buckets send ACAO:* — needed to keep the canvas untainted
    backgroundColor: null,
    scale,
    logging: false,
  })

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
