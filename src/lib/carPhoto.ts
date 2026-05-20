import { supabase } from './supabase'

const BUCKET = 'car-photos'

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
  const path = `${userId}/${carId}/garage-${Date.now()}.png`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/png' })
  if (error) throw error
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}
