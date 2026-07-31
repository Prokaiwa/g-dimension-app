import { supabase } from './supabase'

// The user's inbox (migration 087, ADR-025). Moderation actions file a notice
// here so nothing ever happens to someone silently — a hidden build used to just
// go quiet, and a suspended account looked like the site had broken.
//
// Guarded like every other lib here: pre-087 the reads return empty and the app
// behaves exactly as it does today.

export type NoticeKind =
  | 'content_hidden' | 'content_restored'
  | 'account_suspended' | 'account_restored'
  | 'new_follower'

export type Notice = {
  id: string
  kind: NoticeKind
  title: string
  body: string | null
  car_id: string | null
  created_at: string
  read_at: string | null
  /** Who caused it (094). Null for moderation, set for a follow. */
  actor_id?: string | null
  /**
   * The actor's CURRENT handle, resolved at read time rather than stored.
   * The body text is stored (ADR-025: a notice records what someone was told),
   * but the link has to point wherever that person is now — a handle they
   * changed since would just 404.
   */
  actor_username?: string | null
}

export async function getNotices(): Promise<Notice[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user?.id) return []
    // The embed needs 094's FK. Pre-094 it 400s, so fall back to the plain
    // select rather than showing an empty inbox on a stale deploy.
    const cols = 'id, kind, title, body, car_id, created_at, read_at, actor_id, ' +
                 'actor:users!user_notices_actor_id_fkey (username)'
    const { data, error } = await supabase
      .from('user_notices')
      .select(cols)
      .order('created_at', { ascending: false })
      .limit(100)
    if (!error && data) {
      return (data as unknown as (Notice & { actor: { username: string | null } | null })[])
        .map(({ actor, ...n }) => ({ ...n, actor_username: actor?.username ?? null }))
    }
    const { data: plain } = await supabase
      .from('user_notices')
      .select('id, kind, title, body, car_id, created_at, read_at')
      .order('created_at', { ascending: false })
      .limit(100)
    return (plain as Notice[] | null) ?? []
  } catch { return [] }
}

export async function getUnreadNoticeCount(): Promise<number> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user?.id) return 0
    const { count, error } = await supabase
      .from('user_notices')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null)
    if (error) return 0
    return count ?? 0
  } catch { return 0 }
}

/** Marks everything read. Called when the Notifications screen is opened. */
export async function markNoticesRead(): Promise<void> {
  try { await supabase.rpc('mark_notices_read') } catch { /* ignore */ }
}

/** Notices that mean "something of yours is currently restricted". */
export function isRestrictive(kind: NoticeKind): boolean {
  return kind === 'content_hidden' || kind === 'account_suspended'
}

/** Where a notice's tap-through goes, if anywhere. */
export function noticeHref(n: Notice): string | null {
  if (n.kind === 'new_follower') {
    return n.actor_username ? `/builds/${n.actor_username}` : null
  }
  return null
}
