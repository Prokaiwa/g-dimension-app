// Client-side car background removal.
//
// Runs entirely in the browser — no API, no cost, no server. Uses the
// BiRefNet model (MIT licensed) via Transformers.js, on WebGPU where
// available and falling back to WASM. The model file downloads once and
// is then cached by the browser for every future use.

// BiRefNet_lite — MIT licensed, supported by the Transformers.js
// `background-removal` pipeline. Hosted by onnx-community on the HF CDN.
const MODEL_ID = 'onnx-community/BiRefNet_lite-ONNX'

export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error'

type RawImageLike = {
  data: Uint8Array | Uint8ClampedArray
  width: number
  height: number
  channels: number
}
type Segmenter = (input: Blob | HTMLCanvasElement) => Promise<RawImageLike | RawImageLike[]>

let pipelinePromise: Promise<Segmenter> | null = null
let status: ModelStatus = 'idle'
let progress = 0
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

/** Subscribe to model load status / progress changes. Returns an unsubscribe fn. */
export function subscribeModelState(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function getModelStatus(): ModelStatus { return status }
/** Model download progress, 0–100. */
export function getModelProgress(): number { return progress }

async function supportsWebGPU(): Promise<boolean> {
  const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
  if (!gpu) return false
  try {
    return !!(await gpu.requestAdapter())
  } catch {
    return false
  }
}

// Quantized weights keep the one-time download small (a fraction of the
// full-precision size) with no meaningful quality loss for this task.
const PREFERRED_DTYPE: Record<'webgpu' | 'wasm', 'fp16' | 'q8'> = {
  webgpu: 'fp16',
  wasm: 'q8',
}

async function buildPipeline(
  device: 'webgpu' | 'wasm',
  dtype: 'fp16' | 'q8' | 'fp32',
): Promise<Segmenter> {
  const { pipeline } = await import('@huggingface/transformers')
  const segmenter = await pipeline('background-removal', MODEL_ID, {
    device,
    dtype,
    progress_callback: (info: { status?: string; progress?: number }) => {
      if (info?.status === 'progress_total' && typeof info.progress === 'number') {
        progress = Math.min(99, Math.round(info.progress))
        notify()
      }
    },
  })
  return segmenter as unknown as Segmenter
}

function loadPipeline(): Promise<Segmenter> {
  if (pipelinePromise) return pipelinePromise
  status = 'loading'
  progress = 0
  notify()

  pipelinePromise = (async () => {
    try {
      const device = (await supportsWebGPU()) ? 'webgpu' : 'wasm'
      console.info(`[background-removal] device: ${device}`)
      let segmenter: Segmenter
      try {
        segmenter = await buildPipeline(device, PREFERRED_DTYPE[device])
      } catch (quantErr) {
        // Quantized weights unavailable — fall back to full precision,
        // which every model ships.
        console.warn(
          `[background-removal] ${PREFERRED_DTYPE[device]} load failed on ${device}, retrying fp32:`,
          quantErr,
        )
        progress = 0
        notify()
        segmenter = await buildPipeline(device, 'fp32')
      }
      status = 'ready'
      progress = 100
      notify()
      return segmenter
    } catch (err) {
      status = 'error'
      pipelinePromise = null // allow a fresh attempt next time
      notify()
      throw err
    }
  })()

  return pipelinePromise
}

/**
 * Start downloading the model in the background so it's ready before the
 * user reaches the photo upload. Safe to call repeatedly — it's a no-op
 * once a load is already underway.
 */
export function prewarmBackgroundRemoval(): void {
  if (status === 'idle') {
    loadPipeline().catch(() => { /* failure is surfaced via getModelStatus() */ })
  }
}

const MAX_INPUT_EDGE = 1920  // downscale large photos before inference for speed

function isLikelyHeic(file: File | Blob): boolean {
  const type = ((file as File).type ?? '').toLowerCase()
  if (type.includes('heic') || type.includes('heif')) return true
  if (type) return false // a known, non-HEIC type
  const name = ((file as File).name ?? '').toLowerCase()
  return /\.(heic|heif)$/.test(name)
}

/**
 * Decode an image file into a canvas, applying EXIF orientation and
 * downscaling large photos. `createImageBitmap` handles the common web
 * formats; HEIC/HEIF (the iPhone camera default) is decoded via libheif,
 * loaded on demand only when such a file is actually picked.
 */
async function decodeToCanvas(file: File | Blob): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap | null = null

  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    bitmap = null
  }

  if (!bitmap && isLikelyHeic(file)) {
    try {
      const { heicTo } = await import('heic-to')
      bitmap = await heicTo({
        blob: file,
        type: 'bitmap',
        options: { imageOrientation: 'from-image' },
      })
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      throw new Error(`couldn't read this HEIC photo — ${detail}`)
    }
  }

  if (!bitmap) {
    const type = (file as File).type || 'unknown format'
    throw new Error(`this browser can't decode the image (${type}) — try a JPEG or PNG`)
  }

  const scale = Math.min(1, MAX_INPUT_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas is unavailable')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return canvas
}

const ALPHA_THRESHOLD = 16   // alpha at or below this counts as background
const TRIM_PADDING = 0.015   // breathing room kept around the car, fraction of size
const MAX_OUTPUT_EDGE = 1600 // cap the stored cutout's long edge

/**
 * Crop away fully-transparent margins and cap the resolution. This makes
 * every uploaded car frame consistently in the carousel regardless of how
 * much empty space the original photo had.
 */
function trimToBlob(image: RawImageLike): Promise<Blob> {
  const { data, width, height, channels } = image

  // Rebuild a clean RGBA buffer (handles 1/3/4-channel pipeline output).
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const s = i * channels
    const d = i * 4
    if (channels >= 3) {
      rgba[d] = data[s]; rgba[d + 1] = data[s + 1]; rgba[d + 2] = data[s + 2]
      rgba[d + 3] = channels === 4 ? data[s + 3] : 255
    } else {
      rgba[d] = rgba[d + 1] = rgba[d + 2] = data[s]
      rgba[d + 3] = 255
    }
  }

  // Bounding box of non-transparent pixels.
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] > ALPHA_THRESHOLD) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < minX || maxY < minY) {
    minX = 0; minY = 0; maxX = width - 1; maxY = height - 1
  }

  const padX = Math.round((maxX - minX + 1) * TRIM_PADDING)
  const padY = Math.round((maxY - minY + 1) * TRIM_PADDING)
  minX = Math.max(0, minX - padX)
  minY = Math.max(0, minY - padY)
  maxX = Math.min(width - 1, maxX + padX)
  maxY = Math.min(height - 1, maxY + padY)

  const cropW = maxX - minX + 1
  const cropH = maxY - minY + 1

  const source = document.createElement('canvas')
  source.width = width
  source.height = height
  const sourceCtx = source.getContext('2d')
  if (!sourceCtx) throw new Error('Canvas is unavailable')
  sourceCtx.putImageData(new ImageData(rgba, width, height), 0, 0)

  const longEdge = Math.max(cropW, cropH)
  const scale = longEdge > MAX_OUTPUT_EDGE ? MAX_OUTPUT_EDGE / longEdge : 1
  const outW = Math.round(cropW * scale)
  const outH = Math.round(cropH * scale)

  const out = document.createElement('canvas')
  out.width = outW
  out.height = outH
  const outCtx = out.getContext('2d')
  if (!outCtx) throw new Error('Canvas is unavailable')
  outCtx.drawImage(source, minX, minY, cropW, cropH, 0, 0, outW, outH)

  return new Promise<Blob>((resolve, reject) => {
    out.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Could not encode the image'))),
      'image/png',
    )
  })
}

/**
 * Decode the input, remove its background, and trim it. Returns a
 * transparent PNG ready to upload.
 *
 * The result is intentionally a PNG, not a JPEG: a cut-out car needs an
 * alpha channel, which JPEG cannot store.
 */
export async function removeCarBackground(file: File | Blob): Promise<Blob> {
  let stage = 'load-model'
  try {
    const segmenter = await loadPipeline()
    stage = 'decode'
    const canvas = await decodeToCanvas(file)
    stage = 'remove-background'
    const result = await segmenter(canvas)
    stage = 'trim'
    const image = Array.isArray(result) ? result[0] : result
    return await trimToBlob(image)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error(`[background-removal] failed at stage "${stage}":`, err)
    throw new Error(`${stage} — ${detail}`)
  }
}
