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

export type Notice = {
  id: string
  kind: NoticeKind
  title: string
  body: string | null
  car_id: string | null
  created_at: string
  read_at: string | null
}

export async function getNotices(): Promise<Notice[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user?.id) return []
    const { data, error } = await supabase
      .from('user_notices')
      .select('id, kind, title, body, car_id, created_at, read_at')
      .order('created_at', { ascending: false })
      .limit(100)
    if (error || !data) return []
    return data as Notice[]
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
