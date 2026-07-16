import imageCompression from 'browser-image-compression'
import { supabase } from './supabase'

const BUCKET = 'car-photos'

// Original car photo is stored as a JPEG (the project's standard photo rule).
// Only garage_photo_url (the background-removed cutout) carries an alpha
// channel — WebP where the browser can encode it, PNG otherwise; the
// original does not need alpha.
const ORIGINAL_COMPRESSION = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  exifOrientation: -1 as const,
  fileType: 'image/jpeg' as const,
}

/**
 * Upload a background-removed car photo to the public `car-photos` bucket
 * and return its public URL. Each upload gets a unique timestamped path so
 * replacing a photo never fights a stale CDN cache; the previous file is
 * left for the nightly orphan purge to clean up.
 */
export async function uploadGaragePhoto(
  userId: string,
  carId: string,
  blob: Blob,
): Promise<string> {
  // The cutout is WebP-with-alpha where the browser could encode it, PNG
  // otherwise (see encodeCutout in backgroundRemoval.ts) — follow the blob.
  const ext = blob.type === 'image/webp' ? 'webp' : 'png'
  const path = `${userId}/${carId}/garage-${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: blob.type || 'image/png', cacheControl: '31536000' })
  if (error) throw error
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/**
 * Upload the ORIGINAL car photo — the user's upload, before background removal —
 * compressed to JPEG, into the same public `car-photos` bucket. Returns its URL
 * (store in cars.original_photo_url). Kept alongside the cutout so the full photo
 * is never lost: it feeds the Featured magazine cover and lets background removal
 * be re-run later. See CAR_PHOTO_HANDOFF.md.
 */
export async function uploadCarOriginal(
  userId: string,
  carId: string,
  file: File,
): Promise<string> {
  const compressed = await imageCompression(file, ORIGINAL_COMPRESSION)
  const path = `${userId}/${carId}/original-${Date.now()}.jpg`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, compressed, { contentType: 'image/jpeg', cacheControl: '31536000' })
  if (error) throw error
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}
