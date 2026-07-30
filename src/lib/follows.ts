import { supabase } from './supabase'

// Following (migration 086, ADR-024).
//
// Guarded in the carPrivate/carTransfers/moderation style: before 086 is applied
// counts read as zero, `isFollowing` is false, and the actions fail with
// friendly copy — so a deploy that lands ahead of the migration is inert rather
// than broken.

export type FollowCounts = { followers: number; following: number }

const ZERO: FollowCounts = { followers: 0, following: 0 }

export type FollowedUser = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  city: string | null
  country_code: string | null
  followed_at: string
}

export async function getFollowCounts(userId: string): Promise<FollowCounts> {
  try {
    const { data, error } = await supabase.rpc('follow_counts', { target: userId })
    if (error || !data) return { ...ZERO }
    // A TABLE-returning function comes back as an array of one row.
    const row = (Array.isArray(data) ? data[0] : data) as { followers: number; following: number } | undefined
    if (!row) return { ...ZERO }
    return { followers: Number(row.followers) || 0, following: Number(row.following) || 0 }
  } catch { return { ...ZERO } }
}

export async function isFollowing(userId: string): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const me = session?.user?.id
    if (!me || me === userId) return false
    const { data } = await supabase
      .from('follows').select('followee_id')
      .eq('follower_id', me).eq('followee_id', userId).maybeSingle()
    return !!data
  } catch { return false }
}

export type FollowResult = { ok: true } | { ok: false; error: string }

export async function followUser(userId: string): Promise<FollowResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const me = session?.user?.id
    if (!me) return { ok: false, error: 'Sign in to follow.' }
    if (me === userId) return { ok: false, error: 'You can’t follow yourself.' }

    const { error } = await supabase.from('follows').insert({ follower_id: me, followee_id: userId })
    if (error) {
      // Already following — idempotent by primary key, so treat as success.
      if (error.code === '23505') return { ok: true }
      // The insert policy also enforces blocking in both directions, so an RLS
      // refusal here is most likely a block rather than a bug. Say something
      // true without confirming to the follower that they've been blocked.
      if (error.code === '42501') return { ok: false, error: 'You can’t follow that account.' }
      if (error.code === '42P01') return { ok: false, error: 'Following isn’t available yet.' }
      return { ok: false, error: 'Could not follow. Please try again.' }
    }
    return { ok: true }
  } catch { return { ok: false, error: 'Could not follow. Please try again.' } }
}

export async function unfollowUser(userId: string): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const me = session?.user?.id
    if (!me) return false
    const { error } = await supabase
      .from('follows').delete()
      .eq('follower_id', me).eq('followee_id', userId)
    return !error
  } catch { return false }
}

export async function getFollowing(userId: string): Promise<FollowedUser[]> {
  try {
    const { data, error } = await supabase.rpc('following_list', { target: userId })
    if (error || !data) return []
    return data as FollowedUser[]
  } catch { return [] }
}

// ── Anon follow intent ───────────────────────────────────────────────────────
//
// The whole point of the feature is not losing someone you just found, and a
// logged-out visitor is the person most at risk of that. So an anon tap on
// Follow parks the handle, sends them to signup, and the app brings them BACK to
// that profile and completes the follow once they're in.
//
// localStorage, not sessionStorage, on purpose: email confirmation can complete
// in a different tab (or after the original one is gone), which would drop a
// session-scoped intent — losing exactly the user this exists to keep.
const KEY = 'gdim_pending_follow'

export function setPendingFollow(username: string): void {
  try { localStorage.setItem(KEY, username) } catch { /* private mode: skip */ }
}

/** Reads and clears the parked intent. Single-use so it can't loop. */
export function takePendingFollow(): string | null {
  try {
    const v = localStorage.getItem(KEY)
    if (v) localStorage.removeItem(KEY)
    return v || null
  } catch { return null }
}

export function peekPendingFollow(): string | null {
  try { return localStorage.getItem(KEY) || null } catch { return null }
}

export function clearPendingFollow(): void {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}

/** Compact count label: 1200 → "1.2k". */
export function formatCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  if (n < 1000000) return `${Math.round(n / 1000)}k`
  return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}m`
}
