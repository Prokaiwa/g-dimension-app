// Avatar upload helper. Profile pictures live in the public `avatars` bucket
// (migration 040). Like every other photo upload in the app, the file is
// compressed to JPEG client-side before it leaves the device — smaller here,
// since an avatar never needs to be large. Returns the public URL to store in
// users.avatar_url.
import imageCompression from 'browser-image-compression'
import { supabase } from './supabase'

const BUCKET = 'avatars'

const AVATAR_COMPRESSION = {
  maxSizeMB: 0.4,
  maxWidthOrHeight: 512,
  useWebWorker: true,
  exifOrientation: -1 as const,
  fileType: 'image/jpeg' as const,
}

// Recover the storage object path from a public avatar URL, so the previous file
// can be pruned on replace. Public URLs look like:
//   {SUPABASE_URL}/storage/v1/object/public/avatars/{user_id}/{file}.jpg
// Returns null for anything that isn't an avatars URL.
export function avatarPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const marker = `/${BUCKET}/`
  const i = url.indexOf(marker)
  return i === -1 ? null : url.slice(i + marker.length)
}

// Compress, upload under the user's own folder, prune the old file, and return
// the new public URL. Throws on upload failure (caller surfaces the error).
export async function uploadAvatar(
  file: File,
  userId: string,
  oldUrl?: string | null,
): Promise<string> {
  const compressed = await imageCompression(file, AVATAR_COMPRESSION)
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`

  const { data: up, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, compressed, { contentType: 'image/jpeg' })
  if (error || !up) throw error ?? new Error('Upload failed')

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(up.path)

  // Best-effort cleanup of the previous avatar — never block on it.
  const oldPath = avatarPathFromUrl(oldUrl)
  if (oldPath && oldPath !== up.path) {
    try { await supabase.storage.from(BUCKET).remove([oldPath]) } catch { /* ignore */ }
  }

  return urlData.publicUrl
}
