// Report a failed user action (a save/delete that didn't take) to the global
// ErrorBanner. Use this for Supabase mutation errors that would otherwise be
// silent — the user must never walk away believing an unsaved change saved.
//
//   const { error } = await supabase.from('user_contacts').insert(...)
//   if (error) { reportActionError("Couldn't save the contact", error); return }
//
// The action string should be human-readable and specific ("Couldn't delete
// the reminder"); the raw error detail is appended for the testing phase.
import { captureHandledError } from './errorTracking'

export function reportActionError(action: string, error?: unknown): void {
  const detail =
    error instanceof Error ? error.message
    : typeof (error as { message?: unknown } | null)?.message === 'string'
      ? (error as { message: string }).message
      : ''
  window.dispatchEvent(new CustomEvent('gdim-action-error', {
    detail: detail ? `${action} — ${detail}` : action,
  }))
  // Mirror to Sentry — a failed save on a tester's phone should be visible
  // remotely, not only in their on-device banner.
  captureHandledError(action, error)
}
