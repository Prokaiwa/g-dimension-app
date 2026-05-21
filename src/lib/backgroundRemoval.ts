// Client-side car background removal.
//
// Runs entirely in the browser — no API, no cost, no server. Uses RMBG-1.4
// via Transformers.js on the WASM backend. The model file downloads once
// and is then cached by the browser for every future use.
//
// RMBG-1.4 is light enough to run in a browser tab. It is free for
// non-commercial use; when G-Dimension ships as a native app the plan is to
// bundle BiRefNet (MIT) on-device instead — a separate native integration,
// so this choice locks in nothing.
//
// RMBG-1.4 is not auto-detected by the high-level pipeline API, so it is run
// through AutoModel/AutoProcessor with its config supplied explicitly.

const MODEL_ID = 'briaai/RMBG-1.4'

// RMBG-1.4 has no usable preprocessor_config.json — supply it inline.
const PROCESSOR_CONFIG = {
  do_normalize: true,
  do_pad: false,
  do_rescale: true,
  do_resize: true,
  image_mean: [0.5, 0.5, 0.5],
  feature_extractor_type: 'ImageFeatureExtractor',
  image_std: [1, 1, 1],
  resample: 2,
  rescale_factor: 0.00392156862745098,
  size: { width: 1024, height: 1024 },
}

export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error'

type RawImageLike = {
  data: Uint8Array | Uint8ClampedArray
  width: number
  height: number
  channels: number
}

// An engine turns a decoded image canvas into a single-channel foreground mask.
type Engine = (canvas: HTMLCanvasElement) => Promise<RawImageLike>

let enginePromise: Promise<Engine> | null = null
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

// Runs on the WebAssembly backend. WebGPU is intentionally avoided — some
// segmentation graphs exceed common GPUs' per-shader storage-buffer limits,
// so WASM is the reliable choice across every device.
async function buildEngine(dtype: 'q8' | 'fp32'): Promise<Engine> {
  // The library is typed, but the low-level AutoModel path is dynamic; `any`
  // keeps the tensor/processor plumbing readable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tjs: any = await import('@huggingface/transformers')
  const { AutoModel, AutoProcessor, RawImage } = tjs

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const progress_callback = (info: any) => {
    if (info?.status === 'progress_total' && typeof info.progress === 'number') {
      progress = Math.min(99, Math.round(info.progress))
      notify()
    }
  }

  const model = await AutoModel.from_pretrained(MODEL_ID, {
    config: { model_type: 'custom' },
    device: 'wasm',
    dtype,
    progress_callback,
  })
  const processor = await AutoProcessor.from_pretrained(MODEL_ID, {
    config: PROCESSOR_CONFIG,
  })

  return async (canvas: HTMLCanvasElement): Promise<RawImageLike> => {
    const image = RawImage.fromCanvas(canvas)
    const { pixel_values } = await processor(image)
    const outputs = await model({ input: pixel_values })
    const tensor = outputs.output ?? outputs.logits ?? Object.values(outputs)[0]
    if (!tensor) throw new Error('the model returned no output')
    // [1,1,H,W] (or similar) → [1,H,W] uint8 → resized single-channel mask.
    const maskTensor = tensor.squeeze().unsqueeze(0).mul(255).to('uint8')
    const mask = await RawImage.fromTensor(maskTensor).resize(canvas.width, canvas.height)
    return { data: mask.data, width: mask.width, height: mask.height, channels: mask.channels }
  }
}

function loadEngine(): Promise<Engine> {
  if (enginePromise) return enginePromise
  status = 'loading'
  progress = 0
  notify()

  enginePromise = (async () => {
    try {
      let engine: Engine
      try {
        // Quantized weights — small download, fast inference.
        engine = await buildEngine('q8')
      } catch (quantErr) {
        console.warn('[background-removal] q8 load failed, retrying fp32:', quantErr)
        progress = 0
        notify()
        engine = await buildEngine('fp32')
      }
      status = 'ready'
      progress = 100
      notify()
      return engine
    } catch (err) {
      status = 'error'
      enginePromise = null // allow a fresh attempt next time
      notify()
      throw err
    }
  })()

  return enginePromise
}

/**
 * Start downloading the model in the background so it's ready before the
 * user reaches the photo upload. Safe to call repeatedly — a no-op once a
 * load is already underway.
 */
export function prewarmBackgroundRemoval(): void {
  if (status === 'idle') {
    loadEngine().catch(() => { /* failure is surfaced via getModelStatus() */ })
  }
}

const MAX_INPUT_EDGE = 1920 // downscale large photos before inference for speed

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
const RESIDUE_ALPHA = 60     // wipe matte residue fainter than this
const TRIM_PADDING = 0.015   // breathing room kept around the car, fraction of size
const MAX_OUTPUT_EDGE = 1600 // cap the stored cutout's long edge

// Apply a single-channel foreground mask as the alpha channel of the image.
function applyMask(canvas: HTMLCanvasElement, mask: RawImageLike): RawImageLike {
  const width = canvas.width
  const height = canvas.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas is unavailable')
  const rgba = ctx.getImageData(0, 0, width, height)

  const mc = mask.channels || 1
  const sameSize = mask.width === width && mask.height === height
  for (let i = 0; i < width * height; i++) {
    let alpha: number
    if (sameSize) {
      alpha = mask.data[i * mc]
    } else {
      const x = i % width
      const y = (i - x) / width
      const mx = Math.min(mask.width - 1, Math.floor((x / width) * mask.width))
      const my = Math.min(mask.height - 1, Math.floor((y / height) * mask.height))
      alpha = mask.data[(my * mask.width + mx) * mc]
    }
    rgba.data[i * 4 + 3] = alpha
  }
  return { data: rgba.data, width, height, channels: 4 }
}

/**
 * Crop away fully-transparent margins and cap the resolution. This makes
 * every uploaded car frame consistently in the carousel regardless of how
 * much empty space the original photo had.
 */
function trimToBlob(image: RawImageLike): Promise<Blob> {
  const { data, width, height, channels } = image

  // Rebuild a clean RGBA buffer (handles 1/3/4-channel input).
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

  // Wipe faint matte residue (a ghost of the original ground/shadow) so the
  // cutout ends cleanly at the car. Otherwise the derived shadow layer turns
  // that residue solid black and it reads as a blob detached below the car.
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] < RESIDUE_ALPHA) rgba[i] = 0
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
    const engine = await loadEngine()
    stage = 'decode'
    const canvas = await decodeToCanvas(file)
    stage = 'remove-background'
    const mask = await engine(canvas)
    stage = 'compose'
    const composed = applyMask(canvas, mask)
    stage = 'trim'
    return await trimToBlob(composed)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error(`[background-removal] failed at stage "${stage}":`, err)
    throw new Error(`${stage} — ${detail}`)
  }
}
