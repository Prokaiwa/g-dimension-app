# G-Dimension — Native App (Capacitor)

The same React/Vite codebase ships three ways: the website (Vercel), an installable
PWA, and now a **native iOS + Android app** wrapped with [Capacitor](https://capacitorjs.com).
Capacitor bundles a snapshot of the Vite build (`dist/`) into a thin native shell, so
the app feels native and can call on-device APIs the web can't. All **data** still comes
live from Supabase over the network exactly as on the web — bundling only changes where
the HTML/JS/CSS shell is served from.

> **The website is unaffected.** Every native capability is gated behind
> `Capacitor.isNativePlatform()` and the plugins are imported dynamically, so the web
> bundle never pulls them in and every native code path is a no-op in the browser.

---

## Layout

```
capacitor.config.ts   — app shell config (appId app.gdimension.mobile, webDir dist)
ios/                   — the Xcode project (committed)
android/               — the Android Studio / Gradle project (committed)
```

Capacitor packages: `@capacitor/core` (runtime, a dependency) + `@capacitor/cli`,
`@capacitor/ios`, `@capacitor/android` (dev dependencies). Feature plugins are ordinary
dependencies (today: `@capacitor/local-notifications`).

---

## Build & run (what YOU need locally)

`npx cap sync` copies the latest web build + installed plugins into `ios/` and
`android/`. It does **not** build the web app for you — run the Vite build first.

**Android** (needs [Android Studio](https://developer.android.com/studio); works on any OS):

```bash
npm run build          # produce dist/
npx cap sync android   # copy dist/ + plugins into android/
npx cap open android   # opens Android Studio → Run ▶ to a device/emulator
```

**iOS** (needs a **Mac** with Xcode + CocoaPods — `sudo gem install cocoapods`):

```bash
npm run build
npx cap sync ios       # copy dist/ + plugins, and run `pod install`
npx cap open ios       # opens Xcode → set a signing team → Run ▶
```

> Run `npx cap sync` after **every** `npm run build` and after installing any new
> Capacitor plugin, so the native projects pick up the change.

### Shipping an update

Because the web shell is **bundled**, a code change reaches native users only through a
new native build (and, for iOS, App Store re-submission) — unlike the website, which
updates instantly on every push to `main`. If that cadence becomes a pain point, add an
OTA web-asset updater (e.g. `@capgo/capacitor-updater`) rather than switching to
`server.url` — see the tradeoff note in `capacitor.config.ts`.

**`appId` is `app.gdimension.mobile`** — easy to change now, painful after the first
store submission. Confirm it before that day.

---

## Native features

### 1. Recurring service reminders — SHIPPED

The flagship native feature. Reminders can now repeat: on the Reminders screen (Garage →
Reminders), a "Repeats (optional)" section sets **every N months** and/or **every N
miles**. Marking a recurring reminder complete spawns the next occurrence automatically
(`due_date + N months`, and/or `due_mileage = current odometer + N miles`).

- **DB:** migration `078_reminder_recurrence.sql` adds `car_reminders.recur_months` +
  `recur_miles` (both int, nullable; NULL/NULL = a plain one-shot reminder). **PENDING —
  apply in the Supabase SQL editor.**
- **Delivery:** `src/lib/reminderNotifications.ts` schedules an **on-device local
  notification** for each active, future-dated reminder, firing at 9am local on
  (`due_date − remind_days_before`). Local notifications need **no push infrastructure**
  (no APNs, no FCM, no Apple/Firebase account) — the OS fires them from data stored on
  the device. `syncReminderNotifications()` re-syncs on every reminders load / save /
  complete / remove, and is a no-op on web.
- **Plugin:** `@capacitor/local-notifications` (already synced into `android/`; run
  `npx cap sync ios` on a Mac to add it to the iOS pods).

Nothing here changes web behaviour: the PWA still shows reminders in-app, it just can't
fire background notifications.

### 2. In-app YouTube playback — STAGED (not built)

Job/timeline YouTube links currently open the system browser. Native could play them
in an in-app browser sheet via `@capacitor/browser`. Small, self-contained; deferred
because it wants device testing to tune the sheet UX. Web keeps the current
open-in-new-tab behaviour.

### 3. Offline photo caching — STAGED (not built)

Cache already-viewed car/build photos to the device via `@capacitor/filesystem` so a
garage browses smoothly without a connection. Larger surface (cache invalidation, disk
budget) — deferred until it can be validated on a real device.

Both staged features follow the same gating pattern as reminders: dynamic plugin import
behind `Capacitor.isNativePlatform()`, no-op on web.

---

## Gotchas

- **Sync after build.** `npx cap open` shows whatever was last `sync`ed, not your latest
  `dist/`. Forgetting `npx cap sync` after `npm run build` ships stale JS to the device.
- **iOS is Mac-only.** `npx cap sync ios` runs `pod install`; without CocoaPods it fails.
- **`smallIcon: 'ic_stat_icon'`** referenced by the reminder notifications needs a
  matching Android drawable before notifications render with an icon on Android — add one
  under `android/app/src/main/res/` when polishing the Android build.
- **Permissions.** The first reminder sync requests notification permission; if denied,
  nothing schedules and the app doesn't nag. iOS also needs the notification usage set up
  in Xcode capabilities when preparing for submission.
