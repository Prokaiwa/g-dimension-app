import type { CapacitorConfig } from '@capacitor/cli'

// Native app shell config. webDir points at the Vite build output — Capacitor
// bundles a snapshot of dist/ into the native app (works offline for
// navigation between already-visited screens; feels like a real app rather
// than "a browser pointed at a URL", which also helps App Store review). All
// DATA still comes live from Supabase over the network exactly as it does on
// the web — bundling only affects where the HTML/JS/CSS shell itself is
// served from, not the app's actual content.
//
// TRADEOFF worth knowing: because the shell is bundled, a code change needs a
// new native build (and iOS re-submission) to reach users — unlike the
// website, which updates instantly on every push to main. If that becomes a
// pain point, look at an OTA web-asset updater (e.g. @capgo/capacitor-updater)
// rather than switching to server.url (pointing the app at the live URL
// instead of bundling) — that alternative is simpler but reads to Apple's
// reviewers as "this actually is just a browser," which hurts review odds
// more than shipping app updates a bit slower.
//
// appId is a placeholder, easy to change now, painful to change after the
// first real App Store / Play Store submission — confirm it before that day.
const config: CapacitorConfig = {
  appId: 'app.gdimension.mobile',
  appName: 'G-Dimension',
  webDir: 'dist',
  server: {
    // Serve over https:// (not the default capacitor://) on Android so
    // Supabase auth cookies/secure-context APIs behave the same as on the web.
    androidScheme: 'https',
  },
}

export default config
