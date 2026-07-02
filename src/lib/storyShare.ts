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

// Remote photos are the CORS minefield: the cover photo is first loaded as a
// plain <img> (no crossorigin), so the browser cache may hold a response with
// no CORS headers, and any crossorigin re-fetch html2canvas makes can fail
// against it. Sidestep the whole problem: fetch each remote image ourselves
// (cache:'reload' bypasses the poisoned entry; Supabase public buckets send
// ACAO:*), turn it into a same-origin blob: URL, and hand THAT to the clone —
// html2canvas then never touches a cross-origin image at all.
async function preloadRemoteImages(el: HTMLElement): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const srcs = Array.from(el.querySelectorAll('img'))
    .map(i => i.getAttribute('src') || '')
    .filter(s => /^https?:\/\//.test(s))
  await Promise.all([...new Set(srcs)].map(async src => {
    // No silent fallback: if a remote photo can't be fetched clean, FAIL with
    // a precise reason. Letting html2canvas load it itself is exactly how
    // Safari taints the canvas (it can serve a stale non-CORS cache entry to
    // a crossorigin request) and the export then dies with the opaque
    // "operation is insecure".
    const res = await fetch(src, { mode: 'cors', cache: 'reload' }).catch((e: unknown) => {
      throw new Error(`photo fetch failed: ${e instanceof Error ? e.message : String(e)}`)
    })
    if (!res.ok) throw new Error(`photo fetch failed: HTTP ${res.status}`)
    map.set(src, URL.createObjectURL(await res.blob()))
  }))
  return map
}

export async function buildStoryImage(el: HTMLElement): Promise<File> {
  // Fonts must be resolved before rasterizing or Anton/Hanken fall back.
  await document.fonts.ready
  const { default: html2canvas } = await import('html2canvas')

  const blobMap = await preloadRemoteImages(el)

  // Capture at whatever scale makes the cover at least story-width.
  const scale = Math.max(2, STORY_W / Math.max(1, el.clientWidth))
  let cover: HTMLCanvasElement
  try {
    cover = await html2canvas(el, {
      useCORS: true,          // for any image the preload couldn't fetch
      backgroundColor: null,
      scale,
      logging: false,
      imageTimeout: 10000,
      onclone: doc => {
        doc.querySelectorAll('img').forEach(img => {
          const swapped = blobMap.get(img.getAttribute('src') || '')
          if (swapped) img.setAttribute('src', swapped)
        })
        // WebKit taint insurance: strip the SVG-data-URI grain overlays (the
        // feTurbulence noise). At opacity ~0.03 they're invisible in the
        // export anyway, and Safari has a history of tainting canvases over
        // SVG-filter images. Clone only — the live page keeps its grain.
        doc.querySelectorAll<HTMLElement>('[style*="data:image/svg"]').forEach(n => n.remove())
      },
    })
  } finally {
    blobMap.forEach(u => URL.revokeObjectURL(u))
  }

  // If anything still tainted the render, fail HERE with a named stage
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
