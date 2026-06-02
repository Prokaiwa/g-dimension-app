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
  bio: string | null
  subscription_status: 'free' | 'pro'
  created_at: string
}

export const PROFILE_COLS =
  'id, username, email, display_name, avatar_url, city, country, bio, subscription_status, created_at'

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

// Usernames are unique, lowercase, and limited to [a-z0-9_] (see the signup
// trigger in 001_users.sql). Mirror that rule when the user edits theirs.
export function normalizeUsername(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30)
}

export const USERNAME_MIN_LEN = 3
