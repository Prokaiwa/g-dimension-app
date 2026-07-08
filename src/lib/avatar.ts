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

// Tiny-render URL for header/list avatars — routes a public avatars URL through
// the Supabase image-transform endpoint so the browser downloads ~a few KB
// instead of the full 512px upload. Non-avatar URLs pass through unchanged;
// callers should onError-fallback to the original URL (transform may be
// unavailable on some plans).
export function avatarThumbUrl(url: string, size = 56): string {
  const marker = '/storage/v1/object/public/'
  if (!url.includes(`${marker}${BUCKET}/`)) return url
  return url.replace(marker, '/storage/v1/render/image/public/') + `?width=${size}&height=${size}&resize=cover&quality=80`
}

// ── Device-local thumbnail cache ─────────────────────────────────────────────
// The header avatar should be instant, not a network round-trip on every app
// open. After the first load we downscale the avatar to a ~3KB JPEG data URL
// and keep it in localStorage keyed by the source URL; subsequent renders pull
// straight from there. Reconciled against users.avatar_url whenever the
// profile loads, so a changed avatar refreshes itself.
const THUMB_CACHE_KEY = 'gdim_avatar_thumb_v1'
const THUMB_SIZE = 112  // 2x the 56px header circle

export function getCachedAvatarThumb(): { url: string; dataUrl: string } | null {
  try {
    const raw = localStorage.getItem(THUMB_CACHE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as { url?: string; dataUrl?: string }
    return c?.url && c?.dataUrl ? { url: c.url, dataUrl: c.dataUrl } : null
  } catch { return null }
}

export async function cacheAvatarThumb(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const bmp = await createImageBitmap(await res.blob())
    const canvas = document.createElement('canvas')
    canvas.width = THUMB_SIZE; canvas.height = THUMB_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const s = Math.min(bmp.width, bmp.height)  // cover-crop from center
    ctx.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, THUMB_SIZE, THUMB_SIZE)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
    localStorage.setItem(THUMB_CACHE_KEY, JSON.stringify({ url, dataUrl }))
    return dataUrl
  } catch { return null }
}

export function clearAvatarThumbCache() {
  try { localStorage.removeItem(THUMB_CACHE_KEY) } catch { /* ignore */ }
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
    .upload(path, compressed, { contentType: 'image/jpeg', cacheControl: '31536000' })
  if (error || !up) throw error ?? new Error('Upload failed')

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(up.path)

  // Best-effort cleanup of the previous avatar — never block on it.
  const oldPath = avatarPathFromUrl(oldUrl)
  if (oldPath && oldPath !== up.path) {
    try { await supabase.storage.from(BUCKET).remove([oldPath]) } catch { /* ignore */ }
  }

  return urlData.publicUrl
}
