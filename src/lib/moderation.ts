import { supabase } from './supabase'

// Report → block, and the admin queue behind them (migration 084, ADR-023).
//
// Guarded in the carPrivate/carTransfers style: before 084 is applied every
// read degrades to "nothing" and every action returns a friendly failure, so a
// deploy that lands ahead of the migration never crashes a page.

// ── Reporting ────────────────────────────────────────────────────────────────

export type ReportTargetType = 'user' | 'car' | 'photo' | 'timeline_entry'

export type ReportReason =
  | 'nudity' | 'hate' | 'violence' | 'illegal'
  | 'harassment' | 'spam' | 'impersonation' | 'other'

// The four that hide the content immediately on report (the DB trigger decides;
// this list only exists so the UI can warn honestly before you tap).
const SEVERE: ReadonlySet<ReportReason> = new Set<ReportReason>([
  'nudity', 'hate', 'violence', 'illegal',
])

export function isSevereReason(reason: ReportReason): boolean {
  return SEVERE.has(reason)
}

// Order matters: this is the order they're offered, worst first.
export const REPORT_REASONS: { id: ReportReason; label: string; sub: string }[] = [
  { id: 'nudity',        label: 'Nudity or sexual content', sub: 'Explicit imagery' },
  { id: 'hate',          label: 'Hate or symbols',          sub: 'Slurs, hate imagery' },
  { id: 'violence',      label: 'Violence or gore',         sub: 'Graphic or threatening' },
  { id: 'illegal',       label: 'Illegal activity',         sub: 'Stolen parts, fraud' },
  { id: 'harassment',    label: 'Harassment or bullying',   sub: 'Targeting someone' },
  { id: 'impersonation', label: 'Impersonation',            sub: 'Pretending to be someone' },
  { id: 'spam',          label: 'Spam or scam',             sub: 'Ads, repeated junk' },
  { id: 'other',         label: 'Something else',           sub: 'Tell us below' },
]

export type ReportResult = { ok: true; autoHidden: boolean } | { ok: false; error: string }

/**
 * Files a report. `targetOwnerId` is NOT trusted from here — the DB trigger
 * re-derives the real owner (and the affected car) server-side, so a doctored
 * client can misattribute nothing.
 */
export async function reportContent(
  targetType: ReportTargetType,
  targetId: string,
  reason: ReportReason,
  details?: string,
): Promise<ReportResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const me = session?.user?.id
    if (!me) return { ok: false, error: 'Sign in to report.' }

    const { data, error } = await supabase
      .from('content_reports')
      .insert({
        reporter_id: me,
        target_type: targetType,
        target_id:   targetId,
        reason,
        details:     details?.trim() || null,
      })
      .select('id, auto_hidden')
      .single()

    if (error) {
      // 23505 = the partial unique index: they already have an open report on
      // this exact thing. Treat as success — re-reporting shouldn't feel broken.
      if (error.code === '23505') return { ok: true, autoHidden: false }
      if (error.code === '42P01') return { ok: false, error: 'Reporting isn’t available yet.' }
      return { ok: false, error: 'Could not send that report. Please try again.' }
    }
    const row = data as { id: string; auto_hidden: boolean } | null

    // Notify the operator. Deliberately fire-and-forget AFTER the insert: the
    // row is the evidence, the email is a convenience. A Resend outage or a
    // cold function must never cost us the report itself, and the reporter
    // should never see an error for a delivery problem they can't act on.
    if (row?.id) {
      supabase.functions.invoke('report-notify', { body: { reportId: row.id } })
        .then(() => {}, () => {})
    }

    return { ok: true, autoHidden: row?.auto_hidden ?? false }
  } catch {
    return { ok: false, error: 'Could not send that report. Please try again.' }
  }
}

// ── Blocking ─────────────────────────────────────────────────────────────────

export async function blockUser(userId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const me = session?.user?.id
    if (!me) return { ok: false, error: 'Sign in to block.' }
    if (me === userId) return { ok: false, error: 'You can’t block yourself.' }
    const { error } = await supabase
      .from('user_blocks')
      .insert({ blocker_id: me, blocked_id: userId })
    // Already blocked is a success from the caller's point of view.
    if (error && error.code !== '23505') return { ok: false, error: 'Could not block. Please try again.' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not block. Please try again.' }
  }
}

export async function unblockUser(userId: string): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const me = session?.user?.id
    if (!me) return false
    const { error } = await supabase
      .from('user_blocks').delete()
      .eq('blocker_id', me).eq('blocked_id', userId)
    return !error
  } catch { return false }
}

export async function isBlocked(userId: string): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const me = session?.user?.id
    if (!me) return false
    const { data } = await supabase
      .from('user_blocks').select('blocked_id')
      .eq('blocker_id', me).eq('blocked_id', userId).maybeSingle()
    return !!data
  } catch { return false }
}

export type BlockedUser = { id: string; username: string | null; display_name: string | null }

/** The signed-in user's block list, for Settings. Empty pre-084. */
export async function getBlockedUsers(): Promise<BlockedUser[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const me = session?.user?.id
    if (!me) return []
    const { data, error } = await supabase
      .from('user_blocks')
      .select('blocked_id, blocked:users!user_blocks_blocked_id_fkey (username, display_name)')
      .eq('blocker_id', me)
      .order('created_at', { ascending: false })
    if (error || !data) return []
    return (data as unknown as {
      blocked_id: string
      blocked: { username: string | null; display_name: string | null } | null
    }[]).map(r => ({
      id: r.blocked_id,
      username: r.blocked?.username ?? null,
      display_name: r.blocked?.display_name ?? null,
    }))
  } catch { return [] }
}

// ── Admin ────────────────────────────────────────────────────────────────────

export type AdminReport = {
  id: string
  created_at: string
  reason: ReportReason
  details: string | null
  status: 'open' | 'actioned' | 'dismissed'
  auto_hidden: boolean
  target_type: ReportTargetType
  target_id: string
  target_owner_id: string | null
  reporter_username: string | null
  owner_username: string | null
  owner_suspended: boolean
  target_car_hidden: boolean
  report_count: number
}

/**
 * Whether the signed-in user is an admin. This is a CONVENIENCE for hiding the
 * UI, never a boundary — every admin RPC re-checks `is_admin` server-side, so
 * flipping this in a debugger buys nothing (ADR-020/022).
 */
export async function isAdmin(): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) return false
    const { data, error } = await supabase.rpc('is_admin', { uid })
    if (error) return false
    return data === true
  } catch { return false }
}

export async function getReportQueue(): Promise<AdminReport[]> {
  try {
    const { data, error } = await supabase.rpc('admin_report_queue')
    if (error || !data) return []
    return data as AdminReport[]
  } catch { return [] }
}

async function adminCall(fn: string, args: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase.rpc(fn, args)
    if (error) {
      if (error.code === '42501') return { ok: false, error: 'Not an admin.' }
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch { return { ok: false, error: 'Action failed.' } }
}

export const dismissReport = (reportId: string) => adminCall('admin_dismiss_report', { report_id: reportId })
export const hideReported  = (reportId: string) => adminCall('admin_hide_content',   { report_id: reportId })
export const suspendUser   = (userId: string, reason: string) =>
  adminCall('admin_suspend_user', { target_user: userId, reason })

// ── Username blocklist ───────────────────────────────────────────────────────

export type UsernameRejection = 'reserved' | 'profanity' | 'slur' | 'brand' | null

/**
 * Server-side handle check (migration 084). The DB is the source of truth
 * because `handle_new_user()` mints a handle from the signup email without ever
 * touching a form — a client-side list cannot see that path at all.
 *
 * Fails OPEN: a network blip must not block someone claiming a handle. The
 * `users_username_guard` trigger is the actual enforcement, so the worst case
 * is a rejection at save time rather than a bad handle getting through.
 */
export async function checkUsernameTerms(candidate: string): Promise<UsernameRejection> {
  try {
    const { data, error } = await supabase.rpc('username_rejection_reason', { candidate })
    if (error) return null
    return (data as UsernameRejection) ?? null
  } catch { return null }
}

export function usernameRejectionMessage(r: Exclude<UsernameRejection, null>): string {
  switch (r) {
    case 'reserved': return 'That handle is reserved.'
    case 'brand':    return 'That handle looks official. Pick another.'
    default:         return 'That handle isn’t allowed.'
  }
}
