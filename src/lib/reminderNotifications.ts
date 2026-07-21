// On-device local notifications for dated service reminders — NATIVE ONLY.
//
// The whole module is a no-op on the web (Capacitor.isNativePlatform() is
// false), so the PWA is completely unaffected. On the native app it schedules
// a local notification for each active reminder that has a due_date, firing on
// (due_date − remind_days_before) at 9am local. Local notifications are
// scheduled entirely on the device — NO push infrastructure (APNs/FCM) and NO
// Apple/Firebase account required.
//
// The plugin is imported dynamically so the web bundle never pulls it in.
import { Capacitor } from '@capacitor/core'

type DatedReminder = {
  id: string
  title: string
  category: string | null
  due_date: string | null
  is_complete: boolean
  remind_days_before?: number | null
}

// A stable 32-bit int id per reminder uuid — LocalNotifications needs numeric ids.
function notifId(uuid: string): number {
  let h = 0
  for (let i = 0; i < uuid.length; i++) h = (Math.imul(31, h) + uuid.charCodeAt(i)) | 0
  return Math.abs(h) % 2000000000
}

/**
 * Re-sync the device's scheduled notifications to the given reminders. Cancels
 * everything we previously scheduled and re-schedules the future-dated, active
 * ones. Safe to call on every reminders load / save / complete. No-op on web.
 */
export async function syncReminderNotifications(reminders: DatedReminder[], carLabel: string | null): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')

    // Ask once; if denied, nothing schedules (and we don't nag).
    const perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted') {
      const req = await LocalNotifications.requestPermissions()
      if (req.display !== 'granted') return
    }

    // Clear what we scheduled before (only our pending ones).
    const pending = await LocalNotifications.getPending()
    if (pending.notifications.length) {
      await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) })
    }

    const now = Date.now()
    const toSchedule = reminders
      .filter(r => !r.is_complete && r.due_date)
      .map(r => {
        const lead = r.remind_days_before ?? 0
        // Fire at 9am local on (due_date − lead days).
        const at = new Date(r.due_date + 'T09:00:00')
        at.setDate(at.getDate() - lead)
        return { r, at }
      })
      .filter(({ at }) => at.getTime() > now)
      .map(({ r, at }) => ({
        id: notifId(r.id),
        title: r.title,
        body: carLabel ? `${carLabel} · service due` : 'Service due',
        schedule: { at },
        smallIcon: 'ic_stat_icon',
        group: 'gdim-reminders',
      }))

    if (toSchedule.length) {
      await LocalNotifications.schedule({ notifications: toSchedule })
    }
  } catch {
    // Never let notification wiring break the reminders screen.
  }
}
