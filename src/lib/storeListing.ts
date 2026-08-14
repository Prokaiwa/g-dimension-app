// Everything the App Store Connect and Play Console forms ask for, as data.
//
// This is the SINGLE SOURCE for submission copy. docs/STORE_LISTING.md holds
// the competitor research and the reasoning behind these words; this file holds
// the words themselves, so /admin/store-shots can render them with live
// character counts and a copy button and nothing has to be retyped into a form
// at 1am.
//
// Every length-capped field is asserted against its real store limit in
// storeListing.test.ts. A field that grows past its cap fails `npm run verify`
// rather than failing in the console after you have pasted it.
//
// House rule: no em dashes in user-facing copy (see CLAUDE.md).

// ── Store limits ───────────────────────────────────────────────────────────
// Apple indexes only name + subtitle + keywords (160 chars total). The
// description is not indexed, so it is pure persuasion. Play indexes the FULL
// description, which is why the same body has to do both jobs there.
export const LIMITS = {
  appleName: 30,
  appleSubtitle: 30,
  appleKeywords: 100,
  applePromo: 170,
  appleDescription: 4000,
  playName: 30,
  playShortDescription: 80,
  playFullDescription: 4000,
} as const

// ── The description body ───────────────────────────────────────────────────
// Shared by both stores. Leads on the category words ("build journal, mod
// tracker and service log") because Play ranks on them, then leads on TRANSFER
// because no competitor does it.
const DESCRIPTION = `G-Dimension is a build journal, mod tracker and service log for people who take their cars seriously. Every modification, every service, every receipt, kept in order for as long as you own the car. And after.

Your build history is worth something. Most of it disappears anyway, buried in forum threads, camera rolls and a glovebox full of paper. This is the logbook your car should have come with.

THE BUILD SHEET
Log every part with brand, part number, cost and install date. Structured specs for the things that matter to that part, not a free text box. Photos, receipts and links on every entry. Grouped into Power, Chassis, Exterior and Interior so the whole build reads at a glance.

DIY GUIDES
Write up how you did the install, step by step, attached to the part itself. Your guide stays credited to you even if the car changes hands.

SERVICE HISTORY
Date, mileage, cost, shop and receipt on every oil change, repair and inspection. Running totals so you always know what the car has cost you. A separate log for detailing, because it is not the same job.

FUEL LOG
Every fill-up, with real tank-to-tank economy computed between full fills. Partial and missed fill-ups are handled properly, so the numbers stay honest.

REMINDERS THAT UNDERSTAND CARS
Due by date or by mileage, and repeating on either. Every 6 months, every 5,000 miles, or both. Mark one done and the next one schedules itself.

THE TIMELINE
Every mod and every service lands on a timeline on its own, in the order it happened. Add your own entries for track days, shows, road trips or the day you bought it. You do not maintain it. It assembles itself.

PARTS BIN
Track what you own but have not fitted yet. Wishlist, on hand, in storage. Tyres know which wheels they are mounted on, so nothing gets counted twice.

THE BUILD REPORT
Export a complete PDF of the car: identity, full modification history, full service history, total invested. Hand it to a buyer, a tuner or an insurer.

WHEN YOU SELL, THE RECORD GOES WITH IT
Transfer the entire car profile to the new owner. Not a PDF, the whole thing, mods, services, photos, timeline and guides. The car keeps its history and you keep a record that you owned it.

YOUR BUILD, ON A COVER
G-Dimension writes your car a magazine cover from your own photos and specs.

A PAGE OF YOUR OWN
Share one link and people see your garage, build sheet, timeline and cover. Receipts, documents, VIN and purchase price are never public.

PRIVATE BY DEFAULT
Documents and receipts are stored privately and served over expiring links. Nothing about your car is published unless you publish it. Export everything you have logged at any time.

Free to use. Built for the long haul.`

// ── Copy fields ────────────────────────────────────────────────────────────
export type ListingField = {
  id: string
  label: string
  value: string
  limit?: number
  /** Why this field reads the way it does. Shown under the field. */
  note?: string
  /** Render in a monospace block rather than a single line. */
  multiline?: boolean
}

export const APP_STORE_FIELDS: ListingField[] = [
  {
    id: 'apple-name',
    label: 'App name',
    value: 'G-Dimension: Car Build Log',
    limit: LIMITS.appleName,
    note: 'Indexed for search. The category words earn their place here.',
  },
  {
    id: 'apple-subtitle',
    label: 'Subtitle',
    value: 'Mod tracker & service record',
    limit: LIMITS.appleSubtitle,
    note: 'Also indexed. No word repeated from the name, which would waste the budget.',
  },
  {
    id: 'apple-keywords',
    label: 'Keywords',
    value: 'mods,tuning,maintenance,garage,parts,receipts,project,restoration,jdm,vehicle,history,maint,fuel,mpg',
    limit: LIMITS.appleKeywords,
    note: 'Comma separated, no spaces, never shown to users. Words already in the name or subtitle are indexed anyway, so repeating them wastes the budget.',
  },
  {
    id: 'apple-promo',
    label: 'Promotional text',
    value: 'New: hand your whole build to the next owner. Export a full report, or transfer the entire car profile when you sell. Every mod, service and receipt goes with it.',
    limit: LIMITS.applePromo,
    note: 'The only field you can change without submitting a new build. Use it for whatever shipped last.',
    multiline: true,
  },
  {
    id: 'apple-description',
    label: 'Description',
    value: DESCRIPTION,
    limit: LIMITS.appleDescription,
    note: 'Not indexed on Apple, so this is pure persuasion.',
    multiline: true,
  },
]

export const PLAY_STORE_FIELDS: ListingField[] = [
  {
    id: 'play-name',
    label: 'App name',
    value: 'G-Dimension: Car Build Log',
    limit: LIMITS.playName,
  },
  {
    id: 'play-short',
    label: 'Short description',
    value: 'Log mods, service, parts and receipts. Your whole build, kept and transferable.',
    limit: LIMITS.playShortDescription,
    note: 'Shown above the fold on the listing card.',
    multiline: true,
  },
  {
    id: 'play-full',
    label: 'Full description',
    value: DESCRIPTION,
    limit: LIMITS.playFullDescription,
    note: 'Play INDEXES this, unlike Apple. Keep the category words in the first paragraph exactly as written.',
    multiline: true,
  },
]

// ── Listing facts ──────────────────────────────────────────────────────────
export const LISTING_FACTS: { label: string; value: string; note?: string }[] = [
  { label: 'Support URL', value: 'https://gdimension.app', note: 'Required by both stores.' },
  { label: 'Privacy policy URL', value: 'https://gdimension.app/privacy', note: 'Public route, no auth gate. Required by both.' },
  { label: 'Terms URL', value: 'https://gdimension.app/terms', note: 'Public route, no auth gate.' },
  { label: 'Apple category', value: 'Lifestyle', note: 'Apple has no automotive category. Utilities is the alternative.' },
  { label: 'Play category', value: 'Auto & Vehicles', note: 'Play does have the right category. Use it.' },
  { label: 'Bundle ID / applicationId', value: 'app.gdimension.mobile', note: 'Locked after the first submission. Confirm before that day.' },
  { label: 'Contact email', value: 'hi@gdimension.app' },
]

// ── Apple App Privacy answers ──────────────────────────────────────────────
// Must agree with ios/App/App/PrivacyInfo.xcprivacy and PrivacyPolicyPage.tsx.
export type PrivacyAnswer = {
  category: string
  type: string
  linked: boolean
  purpose: string
  note?: string
}

export const APPLE_PRIVACY: PrivacyAnswer[] = [
  { category: 'Contact Info', type: 'Email Address', linked: true, purpose: 'App Functionality', note: 'Supabase auth.' },
  { category: 'Contact Info', type: 'Name', linked: true, purpose: 'App Functionality', note: 'Display name and @handle.' },
  { category: 'Identifiers', type: 'User ID', linked: true, purpose: 'App Functionality' },
  { category: 'User Content', type: 'Photos or Videos', linked: true, purpose: 'App Functionality', note: 'Car, mod, receipt and timeline photos.' },
  { category: 'User Content', type: 'Other User Content', linked: true, purpose: 'App Functionality', note: 'Build sheet, service records, DIY guides, journal, typed city and country.' },
  { category: 'Diagnostics', type: 'Crash Data', linked: false, purpose: 'App Functionality', note: 'Sentry. Errors only, no replay, no traces.' },
  { category: 'Usage Data', type: 'Product Interaction', linked: false, purpose: 'Analytics', note: 'Vercel Web Analytics. No cookies.' },
]

// Answer NO to every one of these. Listed because the questionnaire asks about
// each in turn and it is easy to over-declare under fatigue.
export const APPLE_PRIVACY_NOT_COLLECTED = [
  'Location (city and country are TYPED, never read from location services)',
  'Financial Info', 'Health & Fitness', 'Contacts', 'Browsing History',
  'Search History', 'Purchases', 'Sensitive Info', 'Device ID', 'Advertising Data',
]

// ── Play Data Safety answers ───────────────────────────────────────────────
export const PLAY_DATA_SAFETY: { label: string; value: string }[] = [
  { label: 'Encrypted in transit', value: 'Yes. All traffic is HTTPS.' },
  { label: 'Users can request deletion', value: 'Yes. Settings, then Delete Account, in the app.' },
  { label: 'Data shared with third parties', value: 'No.' },
  { label: 'Email address', value: 'Collected, required, App functionality and Account management' },
  { label: 'Name', value: 'Collected, optional, App functionality' },
  { label: 'User IDs', value: 'Collected, required, App functionality' },
  { label: 'Photos', value: 'Collected, optional, App functionality' },
  { label: 'Other user-generated content', value: 'Collected, optional, App functionality' },
  { label: 'Crash logs', value: 'Collected, optional, App functionality' },
  { label: 'Diagnostics', value: 'Collected, optional, Analytics' },
]

// ── Review notes ───────────────────────────────────────────────────────────
// The app is auth-gated, so review CANNOT see anything without an account.
// A missing demo login is one of the most common first-submission rejections.
export const REVIEW_NOTES = `G-Dimension is a build journal and service log for cars. Sign-in is required because every screen shows the user's own vehicles.

A demo account is provided in the App Review Information fields. It has a fully populated garage: cars, modifications, service history, fuel log, timeline entries and a public profile.

The app is a native shell around a bundled web build (Capacitor). All application code ships inside the binary. Nothing is downloaded and executed at runtime.

User-generated content is moderated: any photo, timeline entry or build can be reported with a long press on the public pages, reported items enter an admin review queue, and users can block one another. Contact is hi@gdimension.app.`

// The age rating questionnaire will ask about user-generated content, and the
// honest answer raises the rating. Both stores additionally REQUIRE the four
// controls below for any app with public UGC, all of which already exist
// (moderation.ts, useReportLongPress.tsx, AdminReviewPage, notices.ts).
export const UGC_CONTROLS = [
  'A way to filter objectionable content: report, then admin review queue',
  'A way to report content: long press any photo or Timeline card on /builds/*',
  'A way to block abusive users: Settings, then Blocked',
  'Published developer contact: hi@gdimension.app',
]
