// Current-user profile helpers. The `users` table (migration 001) is the
// source of truth for identity — username, display_name, avatar, bio, location.
// Read it through here rather than re-deriving a name from the auth email, so
// the header, the Profile screen, and anywhere else stay in sync.
import { supabase } from './supabase'

export type UserProfile = {
  id: string
  username: string
  email: string
  display_name: string | null
  avatar_url: string | null
  city: string | null
  country: string | null
  country_code: string | null
  bio: string | null
  subscription_status: 'free' | 'pro'
  created_at: string
}

export const PROFILE_COLS =
  'id, username, email, display_name, avatar_url, city, country, country_code, bio, subscription_status, created_at'

export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth?.user?.id
  if (!uid) return null
  const { data } = await supabase
    .from('users')
    .select(PROFILE_COLS)
    .eq('id', uid)
    .single()
  return (data as UserProfile) ?? null
}

// The name to surface in the header / avatar: the chosen display name wins,
// otherwise fall back to the (always-present) username.
export function profileName(
  p: Pick<UserProfile, 'display_name' | 'username'>,
): string {
  return (p.display_name && p.display_name.trim()) || p.username || ''
}

// ── Profile stats / garage preview ──────────────────────────────────────────
// Headline numbers and car thumbnails for the Profile screen. RLS already scopes
// every table to the owner, so these counts are the user's own build at a glance.
export type ProfileCar = {
  id: string
  nickname: string
  year: number | null
  make: string | null
  model: string | null
  garage_photo_url: string | null
  created_at: string
}

export type ProfileStats = {
  cars: ProfileCar[]
  modCount: number
  photoCount: number
}

export async function getProfileStats(uid: string): Promise<ProfileStats> {
  const { data: carRows } = await supabase
    .from('cars')
    .select('id, nickname, year, make, model, garage_photo_url, created_at')
    .eq('user_id', uid)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
  const cars = (carRows ?? []) as ProfileCar[]

  if (cars.length === 0) return { cars, modCount: 0, photoCount: 0 }

  const carIds = cars.map(c => c.id)

  // Installed mods across all of the user's cars.
  const { count: modCount } = await supabase
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .in('car_id', carIds)
    .eq('status', 'installed')

  // Build photos: job_photos hanging off those cars' jobs.
  const { data: jobRows } = await supabase
    .from('jobs')
    .select('id')
    .in('car_id', carIds)
  const jobIds = (jobRows ?? []).map(j => j.id as string)

  let photoCount = 0
  if (jobIds.length) {
    const { count } = await supabase
      .from('job_photos')
      .select('id', { count: 'exact', head: true })
      .in('job_id', jobIds)
    photoCount = count ?? 0
  }

  return { cars, modCount: modCount ?? 0, photoCount }
}

// Usernames are unique, lowercase, and limited to [a-z0-9_] (see the signup
// trigger in 001_users.sql). Mirror that rule when the user edits theirs.
export function normalizeUsername(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30)
}

export const USERNAME_MIN_LEN = 3
