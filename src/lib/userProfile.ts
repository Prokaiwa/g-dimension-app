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

// ── Onboarding / handle claim ────────────────────────────────────────────────
// `username_set` (migration 039) is false for fresh signups until they choose a
// handle. The gate in App.tsx routes un-onboarded users to /welcome.

// Once a user is known-onboarded in this session, remember it so every route
// change doesn't re-query. Cleared naturally on reload.
const onboardedCache = new Set<string>()

export function markOnboarded(uid: string): void {
  onboardedCache.add(uid)
}

// Fail OPEN: if the column doesn't exist yet (039 not run) or the query errors,
// treat the user as onboarded so they're never trapped outside the app.
export async function isOnboarded(uid: string): Promise<boolean> {
  if (onboardedCache.has(uid)) return true
  const { data, error } = await supabase
    .from('users')
    .select('username_set')
    .eq('id', uid)
    .single()
  if (error) { onboardedCache.add(uid); return true }
  const ok = (data as { username_set?: boolean })?.username_set !== false
  if (ok) onboardedCache.add(uid)
  return ok
}

// Handles that would shadow routes, impersonate the brand, or read as system
// values. Checked in addition to the DB unique constraint.
export const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'api', 'app', 'auth', 'build', 'builds', 'dashboard',
  'gdimension', 'g-dimension', 'help', 'home', 'login', 'logout', 'me', 'profile',
  'root', 'settings', 'signin', 'signup', 'support', 'system', 'user', 'users',
  'www', 'garage', 'tuning', 'maintenance', 'timeline', 'photos', 'welcome',
  'null', 'undefined', 'spec-test', 'about', 'contact', 'privacy', 'terms',
])

export function isReservedUsername(u: string): boolean {
  return RESERVED_USERNAMES.has(u.toLowerCase())
}

// Is this handle free for `selfId` to take? Reads the public username column
// (allowed by RLS). Fails open on error — the unique constraint is the backstop.
export async function isUsernameAvailable(username: string, selfId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('username', username)
    .neq('id', selfId)
    .limit(1)
    .maybeSingle()
  if (error) return true
  return !data
}

