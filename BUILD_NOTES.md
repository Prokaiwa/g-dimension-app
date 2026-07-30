# G-Dimension — Build Notes

Detailed built-state notes and per-section design decisions. **Read the relevant section here before working on that part of the app.** CLAUDE.md holds the always-on rules; this file holds the feature-by-feature detail that doesn't need to load every session.

---

## Beta Readiness Checklist (pre-friends test, no payment yet)

### Where to pick up (as of 2026-07-29)

**Both "needs a real device" unknowns are now closed** — a dedicated test
account (`fancyleprechaun7`) made it possible to drive the live app in a real
browser instead of the curl relay, and both open verification items were
exercised end to end. See **Wheels + Tires — verified** and **Multi-car
carousel — verified** below. Two bugs came out of it, one of them a live PII
leak (migration **083**, ADR-022).

**Migration `083` was applied by the owner on 2026-07-29 and re-verified from a
second account**: `email` now returns `42501` to `authenticated` (including on
the owner's own row — the app reads it from the auth session), `select=*` is
refused, and every legitimate read still works.

What is left:

1. **Safe-area insets (item 3) — still needs the owner, not an agent.** The
   audit is finished and written up below; what is missing is thirty seconds of
   looking at the iOS build on a notched device. Do not "fix" it speculatively.
2. **Polish review (item 11)** — partially picked up this session (the last
   em dashes in shipping prose, listed below). Still unscoped by design.

### Where to pick up (as of 2026-07-28)

Nine of the eleven checklist items below are done. **Two remain, and only one of
them can be done from a chat session:**

1. **Safe-area insets (item 3) — needs the owner, not an agent.** The audit is
   finished and written up below; what is missing is thirty seconds of looking at
   the iOS build on a notched device. Do not "fix" it speculatively: padding a
   header that isn't clipped pushes every screen down for nothing. If the title
   does sit under the status bar, the fix is one top inset on the shared
   `HEADER_HEIGHT` bar, since nearly every page uses it.
2. **Polish review (item 11)** — the open work an agent can pick up. Spacing, tap
   targets, transition consistency. Unscoped by design; no known defects feed it.

Everything else is either done, deliberately parked (dev routes in production,
the social layer), or in the **What's Next** backlog at the bottom of this file.
~~Two known unverified areas~~ — **both were verified on 2026-07-29**; see the
sections at the end of this file.

Live-DB caveat for anyone reading counts: the owner's own car
(`dscantee007@yahoo.com`, the 2006 LS 430) is **deliberately loaded with 120
demo service records** marked `shop_name = 'ZZ_LOAD_TEST'`, kept for
demonstrations. They are not real history and not a bug. Delete with
`delete from sessions where car_id = '<car>' and shop_name = 'ZZ_LOAD_TEST';`

### Planned next sessions (in priority order)
1. ~~**Error observability (Sentry)**~~ ✅ DONE (2026-07-17) — `src/lib/errorTracking.ts`: lazy idle init (adds nothing to boot), inlined public DSN, CSP already allows the ingest domain, `?sentry-test` wiring check. Events are tagged with the user id (set on auth changes in `App.tsx`), the deploy SHA/environment (Vercel system env vars), and every `reportActionError()` save failure is mirrored remotely (`handled:action-error` tag). Errors only — no tracing/replay, to keep the free-tier quota lean. Remaining nice-to-have: readable prod stack traces via `@sentry/vite-plugin` source-map upload (needs a `SENTRY_AUTH_TOKEN` in Vercel).
2. ~~**Empty states**~~ ✅ **DONE — verified 2026-07-27 by rendering all 18 app routes as a brand-new account with zero cars** (Playwright at iPhone viewport, Supabase stubbed to empty result sets). Every section already has a designed, in-aesthetic empty state with a working CTA, not a blank screen: Build Sheet *"Bone stock, for now. / Log your first mod with + MODS below."* (Cormorant, over the dimmed placeholder car); Parts Bin *"Empty / Parts you want, have on hand, or pulled from the car will show up here"* on the kraft page; Timeline *"The story hasn't started yet."* on parchment with a **My Cars** button; Featured *"EVERY COVER NEEDS A CAR / Add yours in the Garage and the magazine shoots itself."* in Anton; Contacts an illustrated *"Your address book"* with six quick-add category tiles; Documents/Snapshot/Reminders a consistent *"No car in the garage"* + **MY CARS**. Nothing to build here. (Harness: `test-results/walk.mjs`, gitignored — recreate rather than hunt for it.)
3. **Safe area insets** — audit fixed headers/footers for `env(safe-area-inset-top/bottom)`. Notch + home indicator on newer iPhones clip content that isn't padded.

   **2026-07-27 audit — BOTTOM is done, TOP is essentially unhandled. VERIFY ON A REAL DEVICE BEFORE STORE SUBMISSION.**

   The raw count is lopsided: **34** `safe-area-inset-bottom` usages versus **4** `safe-area-inset-top` (and two of those four are the Timeline chevrons fixed on 2026-07-27; the others are `LegalLayout` and `ErrorBanner`). Every ordinary `HEADER_HEIGHT` page header — sticky or in normal flow — pads for nothing at the top.

   Whether that actually clips depends entirely on the runtime, which is why it has never been reported:
   - **Mobile Safari** — page sits below the browser chrome, `inset-top` is 0. Never affected. *This is where it has been tested.*
   - **Installed PWA** — `manifest.webmanifest` is `display: standalone`, but `index.html` sets `apple-mobile-web-app-status-bar-style` to **`black`**, not `black-translucent`, so iOS keeps the status bar opaque above the web content. Very likely fine.
   - **Capacitor native app** — the `apple-mobile-web-app-*` metas are Safari web-clip hints and mean **nothing** here; layout is governed by the native shell. This is the one that has never been checked, and it is the one shipping to the App Store.

   So: do not assume it's broken, and do not assume it's fine. Run the iOS build on a notched device (or the simulator), look at any page header, and if the title sits under the status bar the fix is a top inset on the shared header — one change, since nearly every page uses the same `HEADER_HEIGHT` bar.

   Fixed regardless (harmless when the inset is 0, since it's a `calc`): the floating Timeline back-chevron on both `TimelinePage.tsx` and `PublicTimelinePage.tsx`. Those two have no header at all, so nothing else was holding them clear.
4. ~~**Account deletion**~~ ✅ DONE — "Delete my account" in Settings (`SettingsPage.tsx` + the `delete-account` Edge Function; skips transferred-car storage folders per migration 072).
5. ~~**Public profile end-to-end**~~ ✅ **DONE (2026-07-28)** — driven as a real anonymous visitor against the live database. Found and fixed **two** genuine bugs rather than just confirming it looked right: migration **081** (anon could read `parts_cost`/`cost`/`sale_price`/`part_number`/`condition` off any public car — 33 rows, $23,828 of other users' spend) and migration **082** (seven tables were wrongly *blocked* for anon, leaving public mod photos, specs, note media and the **entire public DIY guide** blank for logged-out visitors). Both applied and re-verified: private tables still sealed, `is_public=false` and the per-section flags still hide content, and every public page renders its images.
6. ~~**Onboarding walkthrough**~~ ✅ DONE — guided home-map tour (`src/tour/`, migration 062 `users.tutorial_seen`; "Replay App Tour" in Settings).
7. ~~**UI sounds**~~ ✅ DONE — GT-style synthesized sounds (`src/lib/sound.ts`, account-synced via migrations 068/069, audition board at `/sound-test`).
8. ~~**Security audit**~~ ✅ DONE — see `docs/SECURITY_AUDIT.md` (2026-07; column-level anon grants in 071, `car_private` split in 061 came out of it).
9. ~~**Inconsistency check**~~ ✅ **DONE (2026-07-28)** — see the audit section below. Navigation, orphaned modules, pure-white text and the category/group single-source all came back clean; 33 em dashes in user-facing copy were fixed; of the three structural items found, the duplicate miles→km constant and the one-file `src/utils/` are now **fixed**; the unused-export tidy is tracked below.
10. ~~**Dead code / file cleanup**~~ ✅ **DONE (2026-07-28)** — no orphaned modules, no dead routes, no unused imports (lint is clean). 20 unreferenced assets found (~1.3 MB, none of it bundled); the unambiguous 7 deleted, the rest kept deliberately as design sources. See the audit section.
11. **Polish review** — spacing, tap targets, transition consistency, anything that feels rough.

### Known lower-priority items
- ~~**Dev surfaces reachable in production.**~~ ✅ **RESOLVED 2026-07-30.** Fixed as a side effect of the admin hub: `/sound-test`, `/license-preview`, `/dev/trading-cards`, `/admin` and `/admin/reports` are all wrapped in `<AdminOnly>` (`src/components/AdminOnly.tsx`), and the `?tune` console on `PublicProfilePage` now needs the admin flag as well as the URL param. `/spec-test` keeps its `import.meta.env.DEV` gate **on top of** the admin gate, because it writes real rows. Verified live from a non-admin account: all five routes return "Not available." and the Profile row is hidden. Note `AdminOnly` hides UI — it is not a data boundary; these pages are read-only tools, and everything that touches data re-checks `is_admin` server-side (084).
- **Unreferenced assets — audited and part-cleaned 2026-07-28.** A careful scan (matching basenames against all of `src/`, `index.html`, `public/`, `vercel.json` and `api/`) found 20 unreferenced files totalling ~1.3 MB. **None of them ship** — Vite only bundles what is imported — so this was repo weight, never payload.
  - **Deleted** (unambiguous): `pwa.png`, `android.png`, `apple.png`, `r33tester.png` (mockups/screenshots), `icons/tuning-dashboard/tuning_blueprint.png` (the Blueprint page was deleted in `2a01795`), and `icons/home/home_photos.png` + `home_settings.png` (map nodes that no longer exist). Recoverable from git history if ever wanted.
  - **Kept deliberately** (~840 KB): the five `icons/home/*.png` that remain (`garage`, `tuning`, `timeline`, `maintenance`, `featured`) are the **editable design source** for the base64 blobs inlined into `src/lib/destinationIcons.ts` — deleting them would leave the shipped icons unmaintainable. Same reasoning for the `logo/*` files (`gdimensiondark.png` is the documented source for `public/og-default.png`) and `icons/tuning/tuning_intake.png`.
  - Worth knowing: `src/lib/destinationIcons.ts` is a **213 KB source file of inlined base64** and it DOES ship in the JS bundle. That is a deliberate trade (no separate requests, no flash on the home map), not an accident.
- WASM background-removal bundle is ~24MB — measure first-load on mobile data
- ~~Signed URL expiry mid-session~~ ✅ FIXED (2026-07-17) — all receipts/car-documents signing now uses the shared `SIGNED_URL_TTL` (1 hour) from `src/lib/signedUrls.ts` (was 300s, which broke images on sheets left open >5 min)
- Multi-car stress test: 3+ cars in the carousel

---

## What's Built

All primary routes are implemented:
- Auth: Landing, Login, Signup
- Hub: Home map
- Garage: hero, My Cars carousel, Add Car, Edit Car, Snapshot, Documents, Contacts, Reminders, PDF
- Tuning: dashboard, Build Sheet (with section photos + photo picker), Parts Bin list, Add Part to Parts Bin, Add Mod (category → part type → form, with optional group field for batch installs), Mod Group detail, Mod Detail (with carousel/viewer + links + Remove from Car), Mod Edit (fields + specs + photos + links), Part Detail (with carousel/viewer + links + Install/Sell), Part Edit (fields + specs + photos + links)
- Maintenance: landing (GT Auto diagonal), service form + edit, session detail, detailing log, add + edit detail session
- Timeline: **built** — scroll (`TimelinePage`), compose/edit a note (`TimelineEntryNewPage`), Entry Detail (`EntryDetailPage`). See the **Timeline** section below.
- Photos: masonry gallery
- Profile, Settings, Settings/Archived, Public Profile (`/builds/:username`)

**Grouped mod installs** (migration 033, built May 2026):

*Data model:* A "group" is a `sessions` row with `type='modification'` and `title` set. Its components are `jobs` rows with `session_id` pointing to that session. Solo mods (existing behaviour) are bare jobs with no session, or jobs linked to an anonymous session (no title) created only for timeline purposes.

*Add flow:* `/tuning/add` — same 3-step category → part type → form flow as before. An optional "Part of a bigger install?" field at the bottom of Step 3 accepts a group name. If filled, a named session is created and the user lands on the group detail page. If blank, saves as a solo job (unchanged behaviour).

*Group detail page:* `/tuning/mod-group/:sessionId` — shows the session title, date, performed by, total cost, component list (each tappable → `/tuning/mods/:id`), notes, delete. "+ Add Component" FAB navigates to `/tuning/add` with `{ sessionId, groupTitle }` in React Router state, which links the new job to the existing session.

*Build Sheet display:* Group cards appear in the relevant section (derived from component jobs' categories via `MOD_GROUPS`). Each group card shows title + component count + cost. Solo mods whose `session_id` belongs to a titled session are hidden from the solo list to avoid double-display. Group cards use the same color as solo mod rows.

**Section photo system** (added in `186b2d0`):
- Mod photos have a "Set [Group]" button → writes to `cars.build_sheet_*_photo`
- Build sheet shows section photos as tappable placeholders → inline modal picker

**Parts Bin** (cardboard / kraft paper aesthetic — Caveat + Permanent Marker fonts only):
- `/tuning/parts-bin` — three sections: **Wishlist** (status=`planned`, absorbed from the deleted Blueprint page), **On hand** (status=`purchased`), **In storage** (status=`removed`, still_owned=true). Renders a single combined empty state when all three are empty (`isEmpty`). Items have seeded random Polaroid-style offsets (±3.25° rotation, ±5.5px nudge) — stable per UUID, never re-randomizes.
- **Adding a part reuses the Add-mod flow** at `/tuning/add?dest=parts-bin` (there is no `/tuning/parts-bin/add` route and no `TuningPartsAddPage` — that page was replaced in `970fde4`). `TuningAddPage` reads `dest=parts-bin` into `partsBinMode`, themes itself for the kraft world, inserts as status=`purchased`, and returns to `/tuning/parts-bin`.
- `/tuning/parts-bin/:partId` — Part detail page (kraft paper): photo carousel + fullscreen viewer, specs, notes, links. Actions: Install →, Sell / Scrap.
- `/tuning/parts-bin/:partId/edit` — Part edit: all fields + specs + photos + links management
- "Put Back" button on each part → sets status=`installed`, clears `date_removed`, returns to Build Sheet
- Parts page header: `‹ Tuning` left, `[year model] [Month Day box]` right — same inline pattern as Garage
- Hand-drawn SVG ellipse FAB navigates to `/tuning/add?dest=parts-bin`
- TUNING_CATEGORIES imported from TuningBuildSheetPage for the category dropdown

**Remove from Car flow** (TuningModDetailPage bottom sheet):
- "Move to Storage" → status=`removed`, still_owned=true, date_removed=today → navigates to `/tuning/build-sheet`
- "Sold / Scrapped" → status=`removed`, still_owned=false, date_removed=today → navigates to `/tuning/build-sheet`

**Photo carousel + fullscreen viewer** (TuningModDetailPage + TuningPartDetailPage):
- Carousel at top of detail page; swipe left/right to navigate; tap to open fullscreen
- Fullscreen viewer: swipe down to dismiss (spring-back if <90px, close if >90px); swipe left/right to navigate between photos with edge rubber-band resistance (25% drag rate past first/last)
- Direction-locked: first 10px determines axis, locks for the gesture
- Snap easing: `cubic-bezier(0.25, 0.46, 0.45, 0.94)` at 400ms; dismiss spring: `cubic-bezier(0.22, 1, 0.36, 1)` at 340ms
- Mod detail viewer also has "Set as [Group] Photo" button

**Job links system** (migration 031, `src/lib/links.ts`):
- `job_links` table: `id, job_id, user_id, url, label, display_order` — one table for all link types
- YouTube vs regular detected at display time via `getYouTubeId()` — not stored as a type column
- YouTube thumbnail URL built from video ID — no API key needed (`img.youtube.com/vi/{id}/hqdefault.jpg`)
- Detail pages show YouTube links as thumbnail cards (96×54 with SVG play triangle overlay) and regular links as `↗` rows; tap opens `window.open`
- Edit pages: URL + label inputs, + Add Link button, × to remove; queued add/delete saved with the form
- When the app becomes native (Capacitor), swap `window.open` for in-app `<iframe>` — no schema changes needed

**Spec system** (migrations 024–026):
- Multiselect spec values must be stored as JSON arrays (e.g. `["Option A","Option B"]`), not comma-joined strings. The DB trigger `job_specs_validate_value` enforces this.
- All 168 part type specs verified passing via `/spec-test` dev page and `scripts/test-specs.mjs`

**Maintenance section** (built May 2026):

*Routes:*
```
/maintenance                        → MaintenancePage (landing)
/maintenance/service/new            → MaintenanceServiceNewPage
/maintenance/service/edit/:id       → MaintenanceServiceEditPage
/maintenance/detail                 → MaintenanceDetailPage
/maintenance/detail/new             → MaintenanceDetailNewPage
/maintenance/detail/edit/:id        → MaintenanceDetailEditPage
/maintenance/:sessionId             → MaintenanceSessionDetailPage (handles both types)
```
All static routes are declared **above** the dynamic `/:sessionId` route in App.tsx — do not reorder.

*Edit pages — load + UPDATE pattern:* Both edit pages load the session/jobs/receipts on mount, then on save UPDATE the session, **delete + re-insert** all `jobs` (line items have no stable identity to diff), remove deleted receipts (storage + table), upload newly-attached receipts, and navigate to `/maintenance/:sessionId`. Edit pages reuse the exact aesthetic of their New counterpart (Service = Windows XP, Detail = blue Car Wash). The "Edit Record" button on the session detail page branches by `session.type`: detail → `/maintenance/detail/edit/:id`, service → `/maintenance/service/edit/:id`.

*Design identity — non-negotiable:*
- `COLOR_TIMELINE_SERVICE` (`#d4b86a`) is the **only** accent color in this section. Never use `COLOR_ACCENT` (orange) or any burgundy tokens here.
- `FONT_UI` (Hanken Grotesk) for all UI. No Cormorant anywhere in Maintenance.
- Sub-page headers: flat `COLOR_HEADER_BLACK`, no burgundy wedge. Day chip uses `COLOR_TIMELINE_SERVICE` amber (not `COLOR_BURGUNDY_M`) to identify the section.
- Landing page (`MaintenancePage`) gets the full burgundy wedge header to match The Shop / Garage / Home.

*Landing page background:*
- Two CSS layers: dark golden-amber base gradient + amber right panel with SVG bezier clip-path.
- Clip-path defined via `<clipPath id="mntAmberPanel" clipPathUnits="objectBoundingBox">` inline SVG. Do not switch to a polygon — the curve is intentional.
- Current curve path: `M 0.66,0 C 0.88,0.28 0.16,0.72 0.18,1 L 1,1 L 1,0 Z`

*Service form / session detail aesthetic ("dealership invoice"):*
- `'Courier New', Courier, monospace` for all form content and data fields. This is intentional and section-specific — do not replace with `FONT_UI`.
- Input fields: transparent background, bottom-border only (`1px solid rgba(212,184,106,0.18)`).
- Section dividers: `1px dashed rgba(212,184,106,0.10)`.
- Faint `G` watermark on session detail: `position: fixed`, `rgba(212,184,106,0.06)`, `fontSize: 340`, `fontFamily: MONO`, behind content at `zIndex: 0`.
- Service edit page (`MaintenanceServiceEditPage`) uses a **Windows XP** aesthetic (Tahoma, XP title bar, group boxes) — distinct from the invoice view but section-consistent.

*Data model:*
- Session: insert into `sessions` table with `type = 'maintenance'` or `type = 'detail'`.
- Line items: insert into `jobs` table with `type = 'maintenance'`, `session_id`, `category`, `title`, `cost`. No status lifecycle for maintenance jobs — they are historical records. `status = 'installed'` default is fine.
- `add_to_timeline` defaults: **false** for maintenance sessions, **true** for detail sessions.
- DB trigger auto-creates `timeline_entries` row when `add_to_timeline = true` — no app code needed.
- When the toggle is ON, the form also exposes a **Timeline Title** (`sessions.timeline_title`, migration 048) + **Story** (`sessions.journal_entry`) — see the Timeline section. Both are carried onto the entry by the sync trigger.
- `sessions` cascade-deletes `jobs` on delete — deleting a session removes all its line items automatically.
- `MaintenanceSessionDetailPage` is shared by both `type = 'maintenance'` and `type = 'detail'` sessions. Always check `session.type` to conditionally render job line items and adjust back navigation.

*Back navigation on session detail (type-aware):*
- `type = 'maintenance'` → `‹ Service` → `/maintenance`
- `type = 'detail'` → `‹ Detailing` → `/maintenance/detail`

*Detailing aesthetic — blue "Car Wash" identity:*
- `MaintenanceDetailNewPage` + `MaintenanceDetailEditPage` use `COLOR_TIMELINE_DETAIL` (`#8ab0c8`, muted cool blue), `FONT_UI`, light blue background (`#f4f8fb`), chip selectors for Exterior/Interior services.
- Do NOT apply the Courier/invoice styling to these pages.
- `MaintenanceDetailPage` (the log list) — watery visual treatment DONE (signed off by owner 2026-07-21).

*Tile config in MaintenancePage (do not reorder — left=Detailing, right=Service):*
```ts
{ id: 'detail',  left: 48,  bottom: 60,  imgPad: 20, labelOffset: 4  }
{ id: 'service', left: 218, bottom: 102, imgPad: 0,  labelOffset: -20 }
```
`imgPad` shrinks the image within the 126×126 wrapper. `labelOffset` is `marginTop` on the label span.

**Garage — My Cars: read/edit split + morphing Details sheet** (built Jun 2026):

- **Read/edit split.** `/garage/cars` Details is now a **read-only spec sheet** (grouped Identity / Vehicle Specs / Purchase Info / Origin Story; empty rows hidden). The full editable form lives on `/garage/cars/:carId/edit` (`GarageCarsEditPage`) — mirrors mods/parts. `GarageBg` + `GarageHeader` are exported from `GarageCarsPage` for the edit page to reuse. Save/Remove return to `/garage/cars` with `{ focusCarId }` in router state so the carousel re-focuses the edited car. **Add Car remains an inline modal** on `/garage/cars` (there is no `/garage/cars/new` route).
- **Details = bottom sheet that morphs the real card (no replica).** The sheet (bottom 54%, `top: 46%`) holds only the spec content. The **active carousel card itself** morphs: its car lifts/shrinks (`translateY(-20vh) scale(0.8)`) and the logo + model + info strip fade out, driven by an openness value `t` (0–1) that **tracks the drag** — so pulling the sheet down grows the car back and fades the chrome in continuously. One car, true morph, no duplicate. Sheet `top` and the car morph are coupled (the car must clear the sheet top) — tune together.
- **Dismiss.** Non-passive `touchmove` gesture (`{ passive: false }` + `preventDefault`) on the sheet ref, so a downward pull closes instead of the native scroll bouncing. Grip (handle + title, `data-sheet-grip`) always drags; the spec list takes over only at `scrollTop <= 0`. ~110px threshold. Header chevron leaves the Garage (→ `/garage`); swipe-down closes the sheet. Opens instantly (specs stream in with a skeleton + stale-fetch guard via `detailsCarId` ref).
- **No-photo placeholder.** `CarStage` dims the placeholder **image only** to `brightness(0.12)` and overlays a tappable camera + "Add Photo" prompt (→ edit page) with a soft pulsing amber "beat". The same beat (`addPhotoBeat` / `addPhotoTextBeat`, 2.8s) is shared by both Add-Car circles (now hollow amber rings, no fill).

**On-device monitoring** (built Jun 2026, for phone testing — no console attached):
- `AuthGateFallback` — replaces the auth gate's empty render. Nothing shows on fast loads; after 8s unresolved it shows a recovery screen (Reload / Sign in again) so a wedged auth layer can't present as a dead black screen.
- `ErrorBanner` — traps `window.onerror` + `unhandledrejection`, shows a dismissible banner. Renders nothing until an error fires; safe to leave mounted. (Mounted once in `App.tsx`, above the routes.)

**Timeline — the emotional heart** (built Jun 2026, migrations 045–048):

*Read MASTER_ARCHITECTURE Part 12 + its AS-BUILT ADDENDUM before touching this section.*

*Pages / routes:*
```
/timeline                       → TimelinePage (scroll)
/timeline/new                   → TimelineEntryNewPage (compose a note)
/timeline/entry/:id             → EntryDetailPage (read view)
/timeline/entry/:id/edit        → TimelineEntryNewPage (edit a note — same component)
```

*Two DB bugs fixed first (migration 045 — nothing worked before this):* (1) the `sessions_timeline_sync` trigger's bare `on conflict (session_id)` couldn't infer the **partial** unique index → `42P10` on every `add_to_timeline=true` insert; fixed by restating the predicate. (2) `sessions.title` (033) had never actually been applied to production — re-added. Both were silent: no standard entry could ever be created. If timeline entries stop appearing, suspect the trigger first.

*Data sources by entry type (all rows live in `timeline_entries`, read oldest-at-top by `display_date`):*
- **Origin** (`is_origin`, one per car, un-deletable via DB trigger): synthetic cover derived from `cars.purchase_story` / `purchase_date` until a photo is added; adding/replacing the cover photo (upload to `timeline-photos`) **persists** the real row. Full-bleed, no stripe.
- **Session-derived** (`entry_type` mod/maintenance/detail, `session_id` set): created by the sync trigger. Title/story = `sessions.timeline_title` / `sessions.journal_entry` (migration 048; trigger copies them to `timeline_entries.title` / `journal_entry`). Thumbnail = `sessions.timeline_photo_url` → falls back to the session's first `job_photo`. Edited at the source (Tuning/Maintenance), which Entry Detail links to.
- **Notes** (`entry_type='note'`, `session_id` NULL, migration 046): free-form, created at `/timeline/new`. Carry a title, date, story, and **multiple** photos + links (`timeline_entry_photos` / `timeline_entry_links`, migration 047). The entry's `photo_url` is kept synced to the first photo (card hero). Fully editable + deletable.

*Title resolution* (used by both the card and Entry Detail): `timeline_entries.title` first (notes + custom session titles), then `sessions.title` (group name), then single job title / `N jobs`, then shop name, then the type label.

*Design (parchment world, `COLOR_TIMELINE_*` tokens):* NO header — a floating amber-gold `‹` only. A **vertical connecting thread** down the left with a type-colored node per entry (mod stone-grey / service gold / detail blue / note amber-gold = `COLOR_TIMELINE_NOTE`, an alias of the chevron amber). Year chapter dividers; IntersectionObserver fade-in. Cards: type stripe + label + right-aligned date + title, 2-line Cormorant-italic journal, and an inset **"photo-print" thumbnail** (90px, border + soft shadow) to the right — a deliberate refinement of Part 12's "full-width 160px photo" for phone. `RADIUS_TIMELINE_CARD` (4px) is the one allowed radius. The "+ Add Entry" FAB (`COLOR_ACCENT`) → `/timeline/new`.

*Compose/edit page (`TimelineEntryNewPage`):* one component for both create and edit (keys off the `:entryId` param). Edit mode loads the note + existing photos/links, lets you remove existing (× → queued delete) and add new; on save it diffs (deletes removed rows, uploads + appends new, re-syncs the hero `photo_url`). Lives in the parchment aesthetic (not the dark form look). Camera affordance is the shared `CameraIcon` (matches the Garage carousel), **not** an emoji.

*Entry Detail (`EntryDetailPage`):* hero + full Cormorant story + photo gallery + clickable links (YouTube thumbnails). Notes get inline Edit + Delete (confirm sheet); session entries get "View in Tuning/Maintenance ›". Origin can't be deleted.

### Inconsistency + dead-code audit (2026-07-28)

**Checked and clean:**
- **Navigation.** Every `navigate()` target in the codebase resolves to one of the 57 declared routes. No dead links.
- **Orphaned modules.** No unreferenced source file in `src/` (the one apparent hit, `tokens/index.ts`, is imported as `'../tokens'`).
- **Pure-white text.** 80 uses of `#fff`/`#ffffff`, but every one sampled is button/chip/title-bar text on a coloured background. The rule ("never pure white for **body text**") is not being broken.
- **`CATEGORY_TO_GROUP` / `MOD_GROUPS`.** Single-sourced in `lib/buildGroups.ts`, mechanically enforced by `npm run constitution`.

**Fixed:** 33 em dashes in user-facing copy (see the commit). The one worth
remembering: `appError.ts` composed every reported failure as
`${action} — ${detail}` and that string goes straight to the on-device
ErrorBanner, so the app's most-seen error format carried one.

**Left as owner's calls — recorded, not changed:**

1. **Unit conversion lives in three places, and miles→km is implemented twice.**
   `utils/unitConversion.ts` uses `miles * 1.60934`; `lib/mileage.ts` uses
   `Math.round(miles / 0.621371)` (= `× 1.6093444`). Numerically equivalent
   today, but they are two sources of truth for one physical constant, so a
   future "fix" to one will silently drift from the other. They do serve
   different jobs — `mileage.ts` is the per-car odometer (whole numbers,
   null-safe formatting), `unitConversion.ts` is generic display conversion
   used by the Featured engine, the PDF and both Build Sheets, with
   `lib/unitPrefs.ts` layered on top. Consolidating is a real refactor with
   real risk and no user-visible benefit; at minimum the two should reference
   each other in comments.
2. ~~**`src/utils/` holds exactly one file**~~ ✅ **RESOLVED 2026-07-28** —
   `unitConversion.ts` moved to `src/lib/`, the `src/utils/` folder is gone, and
   all importers plus the constitution check were repointed. Every helper now
   lives in `src/lib/`, with no exceptions.
3. **~70 exported symbols are never imported.** Roughly half are design tokens
   in `tokens/index.ts` — a palette is *allowed* unused entries and they are
   the documented source of truth, so leave them. The rest are mostly Featured
   engine constants and a few genuinely dead helpers (`distanceLabel`,
   `avatarThumbUrl`, `stopMusic`, `rankOf`, `hasSeenTutorial`,
   `buildAccountExport`). None cost anything at runtime (tree-shaken); worth a
   look only if the file gets confusing.

### Remaining flows — live-driven (2026-07-28)

Everything below was created through the real UI against the live database and
verified by reading the rows back.

| Flow | Result |
|---|---|
| **Grouped install** | ✅ `sessions.title = "Wringer Built Block"` + job, lands on `/tuning/mod-group/:id`. The named-session mechanism (033/ADR-009) works. |
| **Detail (car wash) session** | ✅ `sessions.type='detail'` + a "Hand Wash" job, lands on `/maintenance/detail`. 7 service chips render. |
| **Timeline note** | ✅ `timeline_entries.entry_type='note'` + the hero `photo_url` re-sync PATCH, lands on `/timeline`. |
| **Reminder** | ✅ `car_reminders` row with all of 078's columns present; the "every N months / every N miles" recurrence inputs render. |
| **Wheels + Tires combo** | ✅ **Verified 2026-07-29** (was "not exercised" — the "Add Tires" toggle sits far down the form and earlier automation never reached it). Every branch of 066/ADR-016 driven end to end, and one real bug found and fixed. See **Wheels + Tires — verified live** below. |

**Mods are never hard-deleted through the UI** — "Remove from Car" sets
`status='removed'` and keeps the job, its session and its timeline entry, by
design (build history is preserved). Worth knowing before anyone reads a
"leftover session" as a bug: during this session's testing, direct REST deletes
of jobs left 10 orphan sessions and their timeline entries behind, but that is
an artifact of bypassing the app, not something the app itself can produce.

**Reminder with no trigger — NOT a gap (corrected 2026-07-28).** A reminder
saves with neither `due_date` nor `due_mileage`, and I first recorded that as a
silent validation gap. That was wrong: `GarageRemindersPage` line ~435 renders
`readout || fmtDate(r.due_date) || 'No trigger set'`, so the list explicitly
labels it **"No trigger set"**. It behaves as a plain checklist item — sorts as
`upcoming`, never fires a notification (`reminderNotifications.ts` filters on
`r.due_date`). That is a coherent feature, not an oversight.

**~~`install_mileage` is write-once~~ ✅ FIXED 2026-07-28.** It used to be
written by `TuningAddPage` / `TuningPartDetailPage`, read only by
`GaragePdfPage` (the build PDF), never shown on the mod detail page and
editable nowhere — so a typo in a number that reaches a seller-facing document
was uncorrectable. `TuningModEditPage` now has an **Install Mileage** field
(loaded and saved in the car's own odometer unit per migration 063) and
`TuningModDetailPage` shows an **At Mileage** row. Verified live: null →
88,500 through the form, and the detail page renders "88,500 mi".

**~~Edit paths never synced the odometer~~ ✅ PARTLY FIXED 2026-07-28.**
`MaintenanceServiceEditPage` now offers the same *"Update this car's odometer
to X"* checkbox as the New form, under the identical guard — only rendered
when the entered reading is **higher** than `cars.current_mileage`, and checked
again before the write, so editing history still can never wind the odometer
backwards. Verified live: at 85,000 (below the car's 90,000) no checkbox; at
96,000 it appears reading *"(now 90,000)"*, and saving moved the odometer to
96,000.

Still not synced, deliberately: `MaintenanceDetailEditPage` (a wash has no
meaningful odometer semantics) and `TuningModEditPage` (editing a mod's install
mileage is a historical correction, not a statement about the car's odometer
*now* — that is exactly the case the higher-only guard exists to reject).

### Private buckets — boundary verified (2026-07-28)

Tested against live Storage by writing a real object into each private bucket
as the owner, then attacking it. **No bugs — this boundary holds.**

| Attempt | `car-documents` | `receipts` |
|---|---|---|
| Owner upload | 200 ✓ | 200 ✓ |
| **Anon** via `/object/public/…` | **400** ✓ | **400** ✓ |
| **Anon** direct authenticated-path GET | **400** ✓ | **400** ✓ |
| **Anon** tries to mint a signed URL | **400** ✓ | **400** ✓ |
| Owner mints a signed URL | works ✓ | works ✓ |
| Fetch via that signed URL | 200 ✓ | 200 ✓ |

**The cross-user case matters more than the anon case, and it also holds.**
A *logged-in* attacker is the real threat, and another user's id is trivially
discoverable — `public_car_profiles` exposes `user_id`, and storage paths are
the predictable `{userId}/{carId}/…`. So the defence must not rely on path
secrecy, and it doesn't: signed in as a different account, listing another
user's `car-documents` and `receipts` folders both return `[]`, as does
selecting their `car_documents` rows. Knowing the path buys nothing.

Note for future work: because `user_id` is public and paths are predictable,
**never** add a storage policy that grants on path prefix alone — ownership
must always be resolved through `cars`/`car_documents` RLS (the same rule
ADR-017 states for transferred-car folders).

*Not covered:* the Documents **UI** flow (quick-add → type picker → form) was
not driven to completion — the boundary was tested at the storage API instead,
which is where the security property actually lives. `GarageDocumentsPage`'s
own invariant that `file_url` stores a *path* and never a public URL is
asserted in its header comment and by `createSignedUrl` usage, but was not
exercised end to end.

### Adversarial pass (2026-07-28) — one real bug, two clean bills

**FIXED — double-tap created duplicate records.** Firing three synchronous
clicks at "Log It" produced **3 jobs + 3 sessions + 3 timeline entries** from
one fumbled tap (reproduced against the live DB; rows landed 46ms and 424ms
apart). Every save handler guarded on the `saving` **React state**, which
updates asynchronously — two taps in the same tick both read `false` before
the re-render lands, so both proceed. `disabled={saving}` has the same hole:
the attribute is only applied on re-render.

Fixed with a synchronous `useRef` guard (`submitting.current`) paired with an
`endSubmit()` helper that clears both the ref and the state, so no early
return can wedge a button permanently. Applied to all six create/save paths:
`TuningAddPage`, `MaintenanceServiceNewPage`, `MaintenanceDetailNewPage`,
`TimelineEntryNewPage`, `TuningDiyEditPage` and `GarageCarsPage.saveCar`
(that last one would have added the same **car** twice).

Verified after the fix: 3 synchronous clicks → 1 job, and an ordinary single
save still works and navigates. **Use the ref pattern for any new save
handler — the state guard is not sufficient.**

**No XSS.** A title of `Ｔｅｓｔ 🏎️💨 <script>alert(1)</script> ; DROP TABLE
jobs;-- «»` stores verbatim and renders as plain **text** on the Build Sheet.
No script node enters the DOM, no dialog fires — React's escaping holds, and
Supabase parameterises. Fullwidth characters and emoji round-trip fine.

**Overlong input — cosmetic only, not fixed.** A 5,000-character title is
accepted with no validation, truncation or error. It does *not* break layout
(`document.scrollWidth` stays at the 390px viewport, so no horizontal scroll);
the unbroken string simply clips at the container edge with no ellipsis,
because a single 5,000-character word cannot wrap. Realistic trigger is a
pasted URL rather than genuine prose. Left as an owner call — the fix would be
`overflow-wrap: anywhere` plus a sane `maxLength` on the title inputs.

### Photo upload pipeline — verified behaviour (2026-07-28)

Driven through the real Edit Car form against the live database and live
Storage.

**The degraded path is solid.** The sandbox blocks `huggingface.co`, so the
RMBG-1.4 weights could not download — which is exactly what a user on a bad
network or a restricted device hits. The pipeline handled it correctly and
without drama: q8 load failed → retried fp32 → failed → fell back to using the
photo as-is, with the honest user-facing line *"removal is not available on
this browser, so your photo is used as…"*. No page error, no stuck spinner,
preview rendered.

**A failed upload does not corrupt the car row.** In an earlier run the storage
POST failed outright (a fault in the test harness, not the app) and
`garage_photo_url` / `original_photo_url` were both correctly left **NULL**
rather than being pointed at a URL that was never written. The "photo upload
failure is non-fatal — the car is still saved" comment in `saveCar` is accurate.

**The successful path writes exactly what the docs claim:**

| | |
|---|---|
| Storage path | `{userId}/{carId}/garage-{ts}.jpg` + `original-{ts}.jpg` — matches the documented layout and migration 049's `original-{ts}.jpg` |
| Content type | `image/jpeg` both files (correct: the *fallback* has no alpha to preserve, so the WebP/PNG cutout exception doesn't apply) |
| Writes | Two separate `PATCH /cars` calls — the original photo is persisted as its own best-effort update, exactly as migration 049 specifies, so a pre-049 gap can't break the save |
| Public read | Both URLs return HTTP 200 to an anonymous client (the `car-photos` bucket is PUBLIC by design) |

**NOT verified here:** the actual RMBG-1.4 cutout — model weights are blocked
from this environment. The WebP/PNG alpha branch (`encodeCutout()`), the
silhouette bounding box, and cutout quality all remain untested and need a real
device or an environment that can reach `huggingface.co`. Everything downstream
of the cutout (compression, upload, path, DB write, public read) is verified.

### Maintenance lists — back nav + scale (2026-07-28)

**Back navigation now matches between the two types.** `MaintenanceSessionDetailPage`
is shared by both, and its `backRoute` sent `detail` sessions to
`/maintenance/detail` (their list) but `maintenance` sessions to `/maintenance`
(the hub) — so backing out of a service record threw you **two** screens back
while backing out of a wash threw you one. Both now return to their own list.
The post-delete `navigate()` had the same split and was fixed with it. Note the
back LABEL was already right ("Service"), which is part of why this read as
correct.

**Scale: there is no pagination, and that is fine.** Both list pages fetch
**every** session for the car (`select(... jobs(title))`, ordered newest-first,
**no `.limit()` / `.range()`**) and render them all into one `overflowY: 'auto'`
container. Measured on the live DB with **120 service records** at iPhone
viewport:

| | |
|---|---|
| Rows rendered | 120 / 120 — all present, none virtualised away |
| Total DOM nodes | **792** (trivial; a row is ~5 nodes) |
| Scroll content | 5,856px in a 583px viewport, normal vertical scroll |
| Last record | reachable — `scrollTop` reaches `scrollHeight − clientHeight` exactly |
| Time to first row | ~2.8s, and that is *through the curl relay*, so real-device is faster |

So 100–200 records scroll fine. The real ceiling is Supabase's PostgREST
`max-rows` cap (commonly 1,000) — past that the list would silently truncate
rather than error, which is the thing to watch if this ever needs paging. Not a
concern at realistic per-car volumes.

**Fixed while measuring:** the "+ Add Service" / "+ Log a Wash" FAB is
`position: fixed` (44px tall, 28px up) floating over a scroll container that had
**no bottom padding**. With a short history there is empty space under the last
row so nothing showed; with a long one the FAB sat on top of the final records.
Both lists padded `calc(96px + env(safe-area-inset-bottom))` — since superseded
by the height cap below, which keeps the FAB clear on its own.

**Capped height + fade + running totals (2026-07-28, owner-requested).** Both
lists now stop at `maxHeight: 64dvh` (about two thirds down), dissolve their
bottom edge, and carry a summary strip underneath: **Services / Total Spent** on
`MaintenanceServicePage`, **Sessions / Total Spent** on `MaintenanceDetailPage`.
Three things worth not re-deciding:

- **The fade is a CSS `maskImage`, not a gradient overlay.** Both pages sit on a
  hero photo, so an opaque overlay reads as a grey band. The mask dissolves the
  rows themselves and lets the photo through, and it tracks the container's
  visible box so the fade stays pinned to the bottom edge through the scroll.
- **Cap and fade are conditional on real overflow**, measured with a ref in a
  `useEffect` (+ a `resize` listener). `maxHeight`, not `height`: a short history
  collapses to its own size, so the totals sit right under the last row instead
  of after a tall empty box, and nothing is faded when there is nothing below.
- **`total_cost` is nullable**, so the strip sums only sessions that carry a
  figure and prints "from N with a cost" when N is short of the total, rather
  than implying the build cost less than it did. This fired for real on the
  detail log (61 sessions, 60 costed).

The two strips differ deliberately: detail keeps cents (`$8,895.00`) and service
rounds (`$32,572`), each matching the per-row cost formatting directly above it.
The detail label is "Sessions", not "Details", which would read as a field count.

### Odometer sync — verified behaviour (2026-07-28)

Tested against the live DB by driving the real UI, because "does mileage ever
go backwards" is the kind of question that deserves evidence rather than a
code read.

**Only two flows ever write `cars.current_mileage` from a logged record:**
`TuningAddPage` (new mod) and `MaintenanceServiceNewPage` (new service). Both
use the identical guard — `enteredMi > (currentMileage ?? -1)` — applied twice:
once to decide whether to *render* the opt-in checkbox, and again before the
`update`. The checkbox defaults **on** (`useState(true)`).

| Case | Behaviour | Verified |
|---|---|---|
| Log a mod/service at a **higher** mileage | Offers *"Update odometer to 90,000 mi (now 82,000)"*, ticked by default → odometer moves | ✅ 82,000 → 90,000 |
| Log an **older** mod/service at a **lower** mileage | Checkbox is not rendered at all, and the write is guarded independently → **odometer never moves backwards** | ✅ stayed 90,000 after logging at 50,000 |
| Service flow, same two cases | Identical (shared guard) | ✅ prompt at 120,000, absent at 40,000 |

Mileage is compared in **miles** (base units) on both sides, so a car set to
`km` can't drift — `unitToMiles()` normalises the entered value first.

**Two deliberate gaps, both by omission rather than design — decide before launch:**

1. **No edit path syncs the odometer.** `MaintenanceServiceEditPage`,
   `MaintenanceDetailNewPage`/`EditPage` and `TuningModEditPage` contain zero
   `current_mileage` writes. So correcting a service from 90,000 to 100,000
   after the fact leaves the odometer at 90,000. Only the *original* save can
   advance it.
2. **A backwards entry is accepted silently.** Logging a mod at 50,000 on a car
   reading 90,000 stores `install_mileage = 50000` with no warning. This is
   *correct* for the common case (back-filling history on a car you bought
   already modified), but there is no signal at all — no "this is earlier than
   your odometer" hint, and nothing distinguishes a deliberate back-fill from a
   typo (50,000 for 500,000).

Neither corrupts data. Both are UX judgement calls, and (2) is arguably right
as-is; (1) is the more likely to surprise someone.

### Car ownership transfer (2026-07-11, migration 072, ADR-017)

Hand a car — with its FULL history (mods, sessions, timeline, service records, DIY guides, documents, receipts, photos) — to another user when selling it. Offer → accept only; nothing moves without the recipient's consent.

*Flow:* Sender opens Edit Car → "Transfer Car" (footer, next to Remove Car) → `BottomSheet` with the recipient's exact @username → pending offer (14-day expiry, cancellable from the same sheet; footer shows "Transfer Pending → @handle"). Recipient sees an amber **Incoming Transfer** card above the Garage carousel (probed on mount, like everything on that page) → Accept (bottom confirm card) or Decline. Accept calls `accept_car_transfer()` — the app's first `supabase.rpc()` — which atomically flips `cars.user_id`, re-keys `car_private.user_id`, **wipes the seller's private financials** (plate, price, dealer, mileage-at-purchase; VIN + purchase story/date transfer with the car), and clears the old owner's `active_car_id`. The garage refetches and lands on the new car; it becomes the active car if the recipient had none. One pending offer per car (partial unique index).

*Helpers:* `src/lib/carTransfers.ts` — guarded carPrivate-style (pre-072 the probes return nothing and actions fail with friendly copy). `isOfferLive`/`transferErrorMessage`/`transferCarName` are pure + unit-tested.

*Storage caveat (deliberate):* photo files stay under the OLD owner's `{userId}/{carId}/…` prefix — URLs/paths in DB rows keep working. The `delete-account` edge function skips transferred-car folders so a departing previous owner can't destroy the car's photos. Future storage tooling must resolve ownership via `cars`, never the path prefix.

*Provenance (2026-07-13):* the new owner's side (Details sheet "Purchase Info" group + Edit Car, under "Where you got it") shows a read-only **"Transferred from @handle · date"** line, sourced from the most recent accepted `car_transfers` row where the signed-in user is `to_user_id` (`getTransferSource()` in `carTransfers.ts`). Silent when the car was never transferred.

*DIY authorship (2026-07-13, migration 073, ADR-018):* `diy_guides.created_by` credits the original guide author independently of the car's current owner, so a transferred car's install guides don't read as if the new owner wrote them. Both DIY pages (`TuningDiyPage`, `PublicDiyPage`) show **"Created by @handle"** only when the author differs from the current owner, via `getDiyAuthorHandle()` in `src/lib/diyAuthor.ts` (guarded). New guides stamp `created_by = auth.uid()` at creation; the backfill credits existing guides to the current owner (so guides on cars transferred *before* 073 are attributed to the new owner — no earlier authorship record exists to recover).

### SOLD ghost cars (2026-07-13, migration 074, ADR-019) — Phase 1 (private) shipped

Selling a car you loved shouldn't erase it. After a transfer, a car persists in the seller's garage as a read-only **SOLD ghost**: a frozen identity snapshot ("the car as you knew it"), a dimmed/desaturated slide with a rotated SOLD stamp (burgundy), tapping **Details** → a bottom card with the snapshot + "Sold to @B · date" + **Visit Build** (→ the new owner's `/builds/:username`) + **Archive**. Backed by the `car_ghosts` table (dedicated + durable: `car_id on delete set null` so the keepsake outlives the car; the ghost is inserted inside the `accept_car_transfer` RPC, never by a client). Ghosts key on `seller_id` so they never touch profile stats.

*Archive* (`archived_at`) pulls a ghost from the carousel (and, in Phase 2, the public profile) and drops it into **Settings → Archived Cars**, which is now built out: two sections — **Sold & Archived** (unarchive → back to the garage) and **Removed Cars** (soft-deleted `cars.deleted_at` within the 7-day window, the app's first **Restore** surface, clears `deleted_at`).

*Helpers:* `src/lib/carTransfers.ts` — `getSoldCars`/`getArchivedSoldCars`/`archiveSoldCar`/`unarchiveSoldCar`, pure `soldCarName` (unit-tested). All guarded (empty/no-op pre-074).

**Phase 2 (2026-07-14) — public side + sharing, shipped.** Locked SOLD tiles now render on the *public* garage carousel (`PublicGaragePage`, reads the `public_sold_cars` definer view via `getPublicSoldCars`) — dimmed car + SOLD stamp, actions are **Details** (snapshot card) + **Visit Build** only; Featured/Build Sheet/Timeline are never reachable for a ghost. A dedicated shareable surface `PublicSoldCarPage` (route `/builds/:username/sold/:ghostId`, `getPublicSoldCar`) shows "‹Year Model› was sold by @A to @B — visit their build" + Share; the seller reaches it via a **Share** button on their private ghost card (`shareGhost` resolves the seller handle then `shareLink`). `api/og.js` gained a `/sold/:ghostId` branch so the link unfurls "‹Year Model› — sold to @B on G-Dimension" with the snapshot photo (the existing `^/builds/(.*)` rewrite already routes it). Guarded end-to-end — pre-074 the view read returns empty and nothing renders.

### Driving the live app from a container session (2026-07-29)

Worth writing down, because it took a while to find and every future session
would otherwise re-derive it. With a test account you can drive the **real app
against the live database** in a real browser, which is how the two items below
were finally verified after months of "needs a real device".

Two obstacles, both solved:

1. **Chromium cannot reach the network through the sandbox proxy.** Every
   HTTPS request dies with `ERR_TUNNEL_CONNECTION_FAILED` or
   `ERR_CONNECTION_RESET`, with or without `--proxy-server`,
   `--ignore-certificate-errors`, `--disable-quic` or HTTP/1-only. Node's fetch
   *can* get through, with `NODE_USE_ENV_PROXY=1` and
   `NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`. So: intercept in Playwright
   (`ctx.route('**://*.supabase.co/**', …)`) and relay each request through
   Node's fetch, fulfilling with the response. Strip `content-encoding` and
   `content-length` (fetch already decoded the body) or the browser fails to
   parse it.
2. **The cold-launch START splash blocks everything.** Seed the flag it checks
   before the app boots: `ctx.addInitScript(() => sessionStorage.setItem('gdim_splash_seen', '1'))`.

Two smaller traps: the pulsing Add Car button never satisfies Playwright's
"element is stable" check (`animation: addPhotoBeat`), so use
`dispatchEvent('click')` rather than `click()`; and most labels are uppercased
in **CSS**, so match `getByText(/^details$/i)`, never `'DETAILS'`.

The Vite dev server must be started on a fixed port (`npm run dev -- --port
5199`) and the browser pointed at it. The harness lives in `test-results/`
(gitignored) — recreate it from this description rather than hunting for it.

### Wheels + Tires — verified live, one bug fixed (2026-07-29)

Migration 066 / ADR-016 had been shipped but never exercised — the 2026-07-28
pass recorded it as "⚠️ NOT exercised" because automation never reached the
"Add Tires" toggle far down the form. Driven properly this time from a real
account in a real browser. **The feature works. Every branch below was checked
against the database, not just the screen.**

| Branch | Result |
|---|---|
| Wheels + "Add Tires" in one save | ✅ Tire job inserted with `mounted_on_job_id` → the wheel job, inheriting its install date |
| Build Sheet combined card | ✅ Renders `Volk TE37 18x9.5 +22` with `+ Michelin Pilot Sport 4S 255/40R18` beneath it; the tire has no solo row |
| Standalone tire → wheel-set picker | ✅ Lists owned sets labelled **ON CAR** / **STORED**, defaults to the first |
| Old-tire retirement prompt | ✅ Names the tires currently on the set, PARTS BIN / SCRAP both write correctly |
| Mounting on a **stored** set | ✅ Tire inherits `status='removed', still_owned=true` → lands in the Parts Bin with its wheels, not on the Build Sheet |
| Removal cascade | ✅ "Move to Storage" on the wheels took the mounted tire with it; the sheet warned by name first |

**BUG FOUND AND FIXED — retired tires stayed mounted forever.** Retiring the old
tires set their status but left `mounted_on_job_id` pointing at the wheel set.
Since a tire retired to the Parts Bin and a tire sitting in storage *with* its
wheels have **identical status** (`removed` + `still_owned`), the link is the
only thing that can tell them apart — and it was never cleared. Observed live:
after two tire changes the prompt read *"Those wheels already have tires
(Michelin…, Falken…)"*, listing two tires that were already in the Parts Bin,
and saving would have re-stamped their `date_removed` to today, overwriting the
real removal date of a part retired weeks earlier.

Fixed in `TuningAddPage` by clearing `mounted_on_job_id` as part of the retire
update — unmounting is what physically happened. Re-verified: the prompt now
names only the tire actually on the set, and the count stops growing.

Worth keeping in mind for any future work here: **status alone cannot express
"is this part still on that part"** — the mount link is the source of truth, so
anything that takes a part off another part has to clear it.

*Note (deliberately NOT changed):* the part-type names `Tires — Performance /
Street` and `Tires — Truck / Off-Road` carry em dashes, but the owner clarified
on 2026-07-29 that the rule targets **em dashes inside sentences** — a dash used
as a separator in a label is fine. These are labels, so they stay. No migration
needed; don't "fix" them from a stale reading of the rule.

### Multi-car carousel — verified at 4 cars (2026-07-29)

The other long-standing "needs a real device" item. Four cars were added
through the real Add Car flow (Silvia S14, Supra, RX-7, Impreza).

| | |
|---|---|
| Strip geometry | 1,950px across a 390px viewport = **5 slides** (4 cars + the Add Car slide), scroll-snap correct |
| Counter | `01 / 04` … `04 / 04`, correct per card |
| Dot indicators | 5 dots, active dot tracks the slide |
| Per-card identity | Make logo, model name and info strip all follow the active card (Mazda/RX-7 on slide 3, Subaru/Impreza on slide 4) |
| Details sheet | Opens on the correct car from **any** slide — Supra→trim, Impreza→nickname "Blobeye", Silvia→variant "S14 Kouki". No cross-contamination, so the `detailsCarId` stale-fetch guard holds |
| Card morph | Correct on the 4th card: the car lifts/shrinks and the chrome fades, sheet shows that car's spec list |
| CHOOSE on the 4th car | Sets it active, header updates, and it persists to `/home` **and** to `users.active_car_id` on the server |

No defects found. The carousel is fine at 4 cars; nothing suggests a ceiling
below that.

### Users table — email was readable by any signed-in user (2026-07-29, migration 083, ADR-022)

Found while verifying the active-car sync above: a routine
`select username, active_car_id` came back with **all 28 user rows** instead of
one. Widening it returned **every real email address in the beta**.

`anon` is correctly blocked (071/ADR-015 closed that). The gap was
`authenticated`: `users_select_public` (015) has **no role clause**, so a
signed-in user matches every non-deleted row, and 027's table-wide grant then
exposes every column. 071's header states the reasoning that let it survive —
*"authenticated role: untouched … own profile reads PROFILE_COLS incl. email,
which stays fine"* — which is true of the app's queries and false of the
database.

Fixed the same way as 071 and 081: a column-level grant for `authenticated`
covering everything **except `email`**. `email` could be dropped rather than
relocated because `public.users.email` only ever mirrored `auth.users.email`
and had exactly one consumer (the owner's own Profile row), which now reads
`getSessionEmail()` straight from the session. Verified the Profile screen still
shows the right address — and it does so **pre-migration**, so the deploy is
safe in either order.

**Applied 2026-07-29**, then re-verified by crossing the boundary again from a
second account: `select=username,email` → `42501`, `select=*` → `42501`, and
`select=email` on the owner's *own* row → `42501` too (expected — a column
grant is role-wide, which is exactly why the Profile screen now reads the
session). Confirmed still working: `PROFILE_COLS`, the car-transfer @handle
lookup, the transfer/ghost `username`+`display_name` embeds, and the owner's
prefs / `active_car_id`.

The generalisable lesson, and the reason this one hid behind two prior audits:
**`authenticated` is not a trusted role.** Anyone can sign up, so the distance
between anon and authenticated is one email address. Any table with an unscoped
public-read policy leaks to signed-in users exactly as it would to anonymous
ones — and reading the migrations would not have found it, because 071 reads
like it closed the door. One query from a second real account did.

### Em dashes — the last of them in shipping prose (2026-07-29)

The 2026-07-28 sweep fixed 33 and left a few behind because they sit inside JSX
expressions rather than plain strings. Fixed now: the mod-removal sheet's three
lines (*"…will go the same way. They came off together."*, *"Keeps part in Parts
Bin, install it again anytime"*, *"Part is leaving, stays in history"*) and five
in the privacy policy (the on-device background-removal note, the cookies line,
and the Supabase / Vercel / Google service list, which now use colons).

**Second pass, same day, after the owner clarified the rule:** *"as long as
they're not in sentences it's okay."* So the target is narrower than the earlier
sweeps assumed — a dash separating a label from its value is fine; a dash inside
prose is not. Re-swept on that basis and fixed 14 more, all of them real
sentences: the auth-recovery screen, both Settings blocks (units note + the
delete-account warning), three on Documents, the Build PDF blurb, the Snapshot
"Not set" prompt, both Maintenance "no line items" hints, the Timeline note
placeholder, two on Featured, and the Terms content-ownership clause.

Deliberately left, and correct under the clarified rule: the standalone `—`
empty-value markers in data cells, the decorative `— select —` placeholder and
`— Advanced Specs` divider, the `Tires — Performance / Street` part-type labels,
and the dev-only `/sound-test` + `/dev/trading-cards` copy (dev surfaces, per
the owner's standing "leave for now" call).

**Open question, deliberately not touched:** the Featured editorial pools
(`src/features/featured/engine/pools/*.ts`) contain ~30 curated magazine deck
lines that use em dashes inside sentences — *"The S14 — overlooked then, hunted
now."*, *"The FD2 — the Type R that took itself most seriously."* These are
hand-written editorial voice on a documented aesthetic island, and the em dash
is a magazine convention rather than an accident, so rewriting them in bulk is a
tone change rather than a copy fix. Ask before touching them.

### Moderation / App Store Guideline 1.2 (2026-07-29, migration 084, ADR-023)

Built as the prerequisite for the social layer, but it stands on its own: 1.2
applies to this app **today**, because `/builds/:username` already publishes
photos, bios, handles, nicknames and stories to anyone. Missing report/block is
the single most common rejection reason for apps like this.

**What shipped**

| Piece | Where |
|---|---|
| Report → block flow | `src/components/ReportSheet.tsx`, mounted on the public profile driver card |
| Block list (undo) | `/settings/blocked` (`SettingsBlockedPage`) |
| Admin queue | `/admin/reports` (`AdminReportsPage`), gated on the `admin` user_flag |
| Email notification | `supabase/functions/report-notify` via Resend |
| Username blocklist | `moderation_blocked_terms` + `users_username_guard` trigger, surfaced by `useUsernameStatus` |
| Terms | zero-tolerance clause, 24-hour commitment, auto-hide disclosure, appeal address |

**Four things not to re-litigate later:**

1. **Hiding flips `cars.is_public`; it is not a separate condition.** Twelve
   public RLS policies already test `is_public`, and restating all twelve is
   exactly where 081 and 082 went wrong in the same week. `cars_moderation_guard`
   stops the owner turning it back on, which is the only hole that approach has.
   The guard recognises moderation's own writes via a transaction-local
   `gdim.moderation` setting — necessary because those writes run as the
   *reporter*, who is correctly not an admin, so a naive guard reverts the very
   hide it protects.
2. **Auto-hide is the compliance mechanism, not the email.** Severe reasons hide
   the build before any human looks. A solo operator cannot promise a takedown
   SLA that depends on being awake, and App Review itself may be the reader. The
   lever is the CAR, not the individual photo — per-photo hiding would need new
   conditions on several more public policies.
3. **The username blocklist is in the database, not a JSON file.**
   `handle_new_user()` mints a handle from the signup email without ever touching
   a form, so a client-side list cannot see that path. Calibrated for car
   culture: `shit` and `bitch` are **exact-match, not substring**, because
   "shitbox" is affectionate and "Bitchin' Rides" is a real show.
4. **NSFWJS was considered and rejected** (see ADR-023 for the full argument):
   compounds the unmeasured ~24MB WASM payload, bypassable since the Storage
   write is a separate call, false-positives on car-show photography, and
   nudity-only so it misses gore and hate symbols anyway.

**Blocking's honest scope:** `/builds` is anon-readable, so a blocked user can
sign out and still view a public page. Blocking governs *interaction* (follows,
and later feeds/comments), not the public web. Don't let UI copy promise more.

**⚠️ Owner steps after running 084:**
1. Grant yourself admin:
   `insert into user_flags (user_id, flag) values ('<your-users.id>', 'admin');`
2. Set `RESEND_API_KEY` as a secret on the `report-notify` Edge Function and
   deploy it (Dashboard → Edge Functions).
3. Bump the `hotfixes.sql` watermark to 084.

**Verified live, 2026-07-30** (084 applied). Driven from the test account, and
deliberately **reporting its OWN car** rather than a real user's, so no genuine
build was hidden to prove a point.

| Check | Result |
|---|---|
| Severe report (`nudity`) on own car | ✅ `auto_hidden = true` on the returned row |
| Did the content actually leave the public surface? | ✅ **All five at once** — `public_car_profiles`, `jobs`, `sessions`, `job_photos`, `timeline_entries` all empty to anon, from the single `is_public` flip. Zero policy edits. The design bet in the 084 header paid off |
| Owner keeps their data | ✅ still reads their own car; only the public surface changed |
| `cars_moderation_guard` vs. owner evasion | ✅ re-ticking Public reverted silently; clearing `moderation_hidden_at`/`prev_public` reverted; ordinary edits (nickname) still saved |
| Falsified `target_owner_id` | ✅ overwritten server-side from a deliberately wrong `00000000-…` to the real owner |
| Non-severe (`spam`) | ✅ queued, `auto_hidden = false`, car stayed public |
| Duplicate report | ✅ `23505` from the partial unique index (client treats it as success) |
| Reporting as someone else | ✅ refused, RLS `with_check` |
| Reporter editing/deleting their own report | ✅ no effect — audit trail intact (**but see 085**) |
| Username blocklist | ✅ `admin`→reserved, `official`/`gdimension`→brand, `nigg3r`→slur, `f_u_c_k`→profanity, and leetspeak normalization caught `gdim3ns10n`→brand |
| Car-culture calibration | ✅ `shitbox`, `bitchinrides`, `assetto`, `turbodave`, `s14kouki` all **allowed** |
| `users_username_guard` via raw REST | ✅ `23514 username_blocked:profanity` / `:reserved` — the form is not the boundary |
| Admin RPCs from a non-admin | ✅ all four `42501 not_admin`; anon cannot even execute them |
| Reports readable by anon / other users | ✅ `42501` for anon; scoped to their author for authenticated |
| Report sheet UI | ✅ eight reasons, worst-first, and the severe warning appears/clears with the selection |
| `report-notify` not yet deployed | ✅ report still saved — the fire-and-forget ordering behaved as designed |

**One finding came out of the verification → migration 085 (pending).** A
reporter's attempt to rewrite or delete their own report returned `204` with zero
rows rather than `42501`. That difference matters: a missing grant errors, so a
clean 204 means the **grant permits the write** and only the absence of an RLS
policy refuses it. This database's default privileges hand `authenticated` full
DML on new public tables, so 084's narrow `grant select, insert` narrowed
nothing. Safe today; fragile the day someone adds a `for all` policy — which
this codebase has done twice (081/082). 085 makes reports append-only at the
grant level and takes the blocklist off REST entirely.

**FULL LIFECYCLE CLOSED (2026-07-30).** Admin was granted to `@scantee`, who
dismissed the test report from `/admin/reports`. The restore is exact: `is_public`
came back as `true` read from `moderation_prev_public` rather than assumed,
`moderation_hidden_at` and `moderation_prev_public` cleared, the car **and its
mods** readable by anon again, and `resolved_by` recorded. So report → auto-hide →
admin dismiss → restore is verified end to end.

**085 applied and verified**: a reporter's `PATCH`/`DELETE` of their own report
now returns `42501` instead of a silent `204`/0-rows, `moderation_blocked_terms`
is off the REST surface entirely, and `username_rejection_reason()` still works
(a definer function needs no table grant).

**Still outstanding** (one owner step): set `RESEND_API_KEY` and deploy the
`report-notify` Edge Function. Until then reports save correctly but no email is
sent — verified harmless, because the notify is fire-and-forget after the insert.
There is also one `spam` test report left open in the queue; dismiss it whenever.

### Social layer — unblocked, and the recommended order (2026-07-29)

`MASTER_ARCHITECTURE` Part 29 parked Phase 7 on the grounds that "a social layer
without moderation is a liability, not a feature." **084 removes that blocker**,
which inverts the advice given earlier the same day: private-follow-first was
proposed *only* to dodge the moderation dependency, so with moderation built,
public follows with counts are safe to ship directly.

Recommended order, agreed with the owner:

1. ~~Moderation foundation~~ ✅ **DONE** (084 + 085).
2. ~~**Follows**~~ ✅ **DONE (086, ADR-024)** — see below.
3. **`@username` search** — **next, and the bigger gap.** There is still **no
   discovery at all**: no search, no browse, and `/builds/:username` is reachable
   only via a link someone hands you. Follow keeps people you found; it does not
   help you find anyone. The columns needed (`username`, `display_name`,
   `avatar_url`) are all still granted post-083.
4. **Feed** — last, and note there is **no push infrastructure** (078's reminders
   are on-device local notifications only), so a feed is in-app only.

### Profile fixes + the in-app admin alert (2026-07-30)

Four things, all from owner observation.

**1. The Mods stat was counting service records.** Maintenance line items live in
the same `jobs` table (a service session inserts one row per line) and default to
`status='installed'` because they have no install lifecycle — so `getProfileStats`
counted them as mods. Measured on the owner's LS 430: **174 "installed" jobs, of
which 6 were mods and 168 were service lines.** Fixed by adding
`.eq('type','modification')`, which is exactly what `TuningBuildSheetPage`
already filters on — so the Profile number now agrees with the Build Sheet, which
is the number being compared against. The photo count got the same filter: it
changes nothing today (maintenance uses `receipts`, never `job_photos`) but stops
a future maintenance-photo feature silently inflating a build stat.

> ⚠️ **Measurement trap worth remembering.** The first attempt at quantifying
> this counted **220 mods across 40 cars** — because `cars` is publicly readable
> (`is_public` default true), so an authenticated REST query without
> `user_id=eq.<me>` returns every public car in the beta, not your own. Always
> scope by `user_id` when measuring "my" anything from a REST probe.

**2. The permit blipped in, causing mis-taps.** It needed three sequential round
trips (profile → `getLicenseStats` → stored grade), and when the card finally
appeared it pushed the rows below it down — so a tap aimed at "View public
profile" could land on the permit. Two fixes: the resolved permit is now cached
in-memory (`getCachedLicense`/`setCachedLicense` in `lib/license.ts`, same pattern
and sign-out handling as the profile cache), and the block **always occupies the
card's box** via an empty `aspectRatio: '420 / 264'` placeholder, so nothing below
it ever moves. Verified: "View public profile" stays at the same y through load,
and on a return visit the permit is present within 350ms.

> Note when testing this: a hard `page.goto` wipes the in-memory cache, so it only
> looks instant on **client-side** navigation — which is the real flow (tapping
> the avatar). The first check measured the wrong thing.

**2a. Follow-up: the COLD open needed device caches, not just in-memory ones.** The
in-memory cache only helps within a session, so a fresh launch still waited on
queries. Both the permit grade (`gdim_permit_grade`) and the profile identity
(`gdim_profile`) are now persisted to localStorage, mirroring the existing avatar-
thumbnail precedent. The profile one matters because the permit **prints** the name,
handle and `created_at` — it cannot draw before the identity does, which was the
real remaining cause of the delay. Measured cold-open time to permit: **2836ms →
1152ms**, and the name now appears in the same paint, so what's left is app boot
and chunk load rather than data waiting.

Two deliberate limits: only the grade **ids** are persisted, never `toNext` — a
stale checklist would be a wrong statement about the user's build, so a cold open
draws the right card with an empty checklist and fills it in when the query lands.
And both caches clear on sign-out, so the next account on a shared browser can't
inherit an identity or a grade it hasn't earned. Persisting the profile row is only
safe because 083 removed `email` from it.

**3a. Follow-up (same day): swapping at the exact midpoint was wrong.** The first
fix below swapped the content layers at 50% of the rotation, on the reasoning that
the card is edge-on and therefore invisible there. It isn't good enough:
`backface-visibility` does **not** apply to the content layer (WebKit ignores it
for image/SVG children — the note at the top of `LicenseCard.tsx` says so), so if
the front content is still mounted even a few frames past 90° it leaks through and
you briefly see the FRONT printed on the BACK before the real back settles. Timing
jitter alone is enough to cause it, and the owner saw it on the first flip.

Fixed with a **blank window** instead of an instant swap: `contentFace` goes
`front → blank → back`, hiding the outgoing layer at **34%** of the flip and
showing the incoming one at **62%**, so neither is mounted while the card passes
edge-on and only the material/checker turns. Hiding early is invisible by
comparison — at 34% the card is already steeply foreshortened, so the content is a
thin sliver when it goes. Verified: front and back are never mounted together, and
a fast double-tap still lands on FRONT.

**3. The permit flip blipped its text.** Flip mode cross-faded the two content
layers with delayed `opacity` transitions (`110ms ease 210ms` out, `130ms ease
330ms` in). On a second tap — or any re-tap mid-flight — those transitions
restarted and the text visibly blipped. Fixed by applying the lesson the rank-up
celebration already learned (documented at the top of `LicenseCard.tsx`): **never
animate opacity on these faces.** A `showBack` state now lags `flipped` by half
the rotation (`FLIP_MS / 2`), swapping the content layers with `display` while the
card is edge-on and therefore invisible. A re-tap just restarts that timer, so a
fast double-tap can't catch a half-swapped face. Verified: front → back → front,
and a fast double-tap lands on FRONT rather than sticking.

**4. In-app admin alert (no sound, no push).** When something is waiting in
`/admin`, the ring around the Home-header avatar pulses amber and the **Admin**
row in Profile grows a glowing dot plus an "N waiting for you" subtitle.

- One number, one source: `lib/adminAlert.ts` → `getAdminAlertCount()`, memoized
  60s and de-duplicated so two surfaces mounting together share one request.
  Always 0 for non-admins. When there are more kinds of attention later (flagged
  accounts, failed jobs) they add into this same total rather than growing a
  second badge system.
- It **reuses the `permitPending` halo's visual language** and *yields* to it when
  both would show — an unclaimed permit is the more interesting event, and two
  stacked rings read as a rendering bug.
- Actioning a report calls `invalidateAdminAlert()`, so the glow clears
  immediately instead of lingering for the TTL. Opening the hub invalidates too,
  so the badge can't disagree with the glow you just followed.
- `useAdminAlert()` re-reads on `visibilitychange`, since a report arriving while
  the app sits backgrounded is exactly when a stale glow would be wrong.
- This is the placeholder for real notifications. Once the app is native with
  push, this becomes the local mirror of what was pushed and the surfaces reading
  it shouldn't need to change.

### Notifications + unsuspend (2026-07-30, migration 087, ADR-025) — PENDING

Answers "what happens next?" after a moderation action. 084 gave moderation teeth
but no voice: an action landed and the person it landed on was never told, and
`admin_suspend_user` had **no inverse at all**.

| Piece | Where |
|---|---|
| Per-user inbox | `user_notices` → `/notifications` (`NotificationsPage`) |
| Profile entry + dot | Notifications row, above Admin |
| Suspended banner | Profile, top — an account must be able to see its own status |
| Lift a suspension | `/admin/suspended` (`AdminSuspendedPage`), linked from the hub |
| One attention count | `lib/attention.ts` (renamed from `adminAlert.ts`) |

**Decisions not to re-litigate:**

- **The reporter is never notified.** Owner's call, matching Instagram: telling a
  reporter their target was actioned turns reporting into a scoreboard, and
  telling them it was dismissed invites argument. They can still read their own
  report's `status` (084) — it just isn't pushed.
- **Notices can't be forged.** There is **no INSERT policy** on `user_notices`;
  the only writer is the definer `notify_user()`, with EXECUTE revoked from every
  client role. `update` is column-scoped to `read_at`, so a user can mark one read
  but not reword it.
- **Body text is stored, not derived.** A notice records what someone was told on
  a date; regenerating it later from current state would rewrite history once a
  car is renamed or deleted — which is the property that makes it useful in an
  appeal.
- **Restoring reads `moderation_prev_public`, never assumes public.** Both dismiss
  and unsuspend put each car back to the visibility its owner chose. A car that
  was private before an auto-hide must not be published by clearing a bad report.
- **One count, not per-feature badges.** `getAttention()` returns
  `{ notices, reports, total }` from a single memoized query, so the avatar ring
  (total), the Notifications row (notices) and the Admin row (reports) can't
  disagree. Follows and transfers should add in here rather than growing a
  parallel system. This is the in-app stand-in for push — when the app is native,
  it becomes the local mirror of what was pushed and these surfaces don't change.

**Worth knowing:** the suspended-account banner works only because 084 added
`suspended_at` to the 083 column grant. That grant is load-bearing — without it
an account can't see its own status and a suspension is indistinguishable from a
bug.

**Verified pre-migration** (the deploy lands first): `/notifications` shows its
empty state, `/admin/suspended` shows "Not available." to a non-admin, Profile
renders with the Notifications row, and nothing errors — the guarded helpers
swallow the missing table.

### Admin hub (2026-07-30)

`/admin`, reachable from an **Admin** row in Profile that only renders for
admins. One place for every surface that exists for the operator rather than for
drivers, instead of a set of URLs you have to remember:

| Section | Contents |
|---|---|
| Moderation | Reports queue, with an "N open" badge |
| Design tools | Sound board, Permit ladder, Trading cards |
| Map console | Opens your own public profile with `?tune` |

Four things worth knowing:

- **`AdminOnly` gates the routes, and this closed a standing item** — those dev
  tools previously shipped to any signed-in user (see the resolved entry above).
- **The gate hides UI; it is not a boundary.** Every privileged *action* is an
  RPC that re-derives `is_admin` server-side (084). Verified by forcing the
  client-side check to `true` in the browser: the menu renders and the report
  queue still returns **403** — the menu grants nothing.
- **`/spec-test` is deliberately absent** from the hub. It writes real rows to a
  real car and only exists in a dev build; listing it would mean a dead row in
  production.
- **The Reports row never says "nothing waiting".** `getReportQueue()` returns an
  empty list on failure as well as on success, so that phrasing would be a false
  reassurance on the one screen where it matters. The badge's absence claims
  nothing.

`useIsAdmin(enabled)` takes a flag so a caller can skip the lookup entirely while
still calling the hook unconditionally — the public profile only needs it when
`?tune` is present, and paying a round trip on every public profile view for
every signed-in visitor would be wasteful.

### Follows (2026-07-30, migration 086, ADR-024)

**Public follows with counts, not the private bookmark first recommended.** That
recommendation existed only to avoid depending on moderation; 084 removed the
dependency, so the private version would have been a worse product for no
remaining benefit. The reversal was deliberate — see ADR-024.

| Piece | Where |
|---|---|
| Follow button + follower/following counts | public profile driver card (`PublicProfilePage`) |
| Following list, with Unfollow and a tap through to each build | `/following` (`FollowingPage`) |
| "Following · N builds you keep an eye on" | Profile, above Settings |
| Anon intent park/consume | `src/lib/follows.ts` + the effect in `App.tsx` |

**Three things not to re-decide:**

1. **The pair is the primary key.** Following is idempotent for free — a
   double-tap raises `23505` rather than creating a second edge. Don't add a
   surrogate id; an edge has no identity of its own.
2. **Blocking is enforced in the RLS insert policy, in both directions**, not in
   the UI. This is the payoff for building 084 first. Verified live: block →
   follow refused `42501` → unblock → follow succeeds.
3. **Read is public**, so the graph is enumerable with the anon key (as on
   Instagram/Twitter). Counts cannot work otherwise. Making lists private later
   is a policy change, not a schema change.

**The anon path is the feature, not a nicety** — a logged-out visitor is the
person most likely to lose a build they just found, which was the original
complaint. Tapping Follow signed-out parks the handle, routes to signup, then the
app carries them back to that profile and completes the follow. `localStorage`
not `sessionStorage` (email confirmation can land in a different tab); single-use
and the `?follow=1` param is stripped after completing, so it can't loop; and a
**24-hour TTL**, because an intent firing days later would yank someone to a
profile they'd forgotten about.

**Verified live 2026-07-30:** follow/unfollow, counts as owner *and* anon,
`following_list`, duplicate/self/impersonated follows all refused, `UPDATE` on an
edge refused, the block interaction, and the full anon loop (parked handle →
login → redirect → follow completed → param stripped). Fixed while testing:
the counts read "1 followers".

---

## What's Next (not yet built)

- **Timeline note multi-photo display** — notes store multiple photos (`timeline_entry_photos`) and they render on Entry Detail, but the explicit "choose *the* hero shot" picker for **session entries** isn't built — those still use the `timeline_photo_url` → first-`job_photo` fallback. (`sessions.timeline_photo_url` has no upload UI yet.)
- **Install-from-Parts-Bin flow** — no flow yet to install a part directly from the Parts Bin into the build.
- **Link reordering** — `job_links.display_order` column exists but there is no drag-to-reorder UI. Links render in insert order.
- **YouTube in-app playback** — currently `window.open`. When the PWA becomes a native Capacitor app, replace with `<iframe>` embed or a native video player. The DB schema supports this with no changes.
- ~~**Unit conversion display**~~ ✅ MOSTLY DONE (2026-07) — `src/lib/unitPrefs.ts` (`formatPower`/`formatTorque` + cached prefs) wired on the private carousel/details and the public pages (owner's units via migration 075); per-car mileage unit via 063 (`src/lib/mileage.ts`). Remaining: sweep any stray hardcoded "hp"/"lb-ft" labels on lesser screens.
- ~~**Detailing log list visual treatment**~~ ✅ DONE (2026-07-21) — `MaintenanceDetailPage` "watery feel" treatment signed off by owner.
- ~~**"Download my data" JSON export**~~ ✅ DONE (2026-07) — Settings → "Download My Data" (`src/lib/dataExport.ts`). Full offline-first sync remains a separate future project.
- ~~**Recurring service intervals**~~ ✅ DONE (2026-07-21, migration 078) — `car_reminders.recur_months` + `recur_miles`; completing a recurring reminder auto-spawns the next occurrence. Delivery is on-device local notifications in the native Capacitor app (`src/lib/reminderNotifications.ts`, no push infra). Still future: community-shared schedule templates per model.
- **Social layer (parked — Phase 7 in MASTER_ARCHITECTURE Part 29)** — groups, meets, events; "forums beautified, GT vibe". Needs its own dedicated design session (data model, moderation, location privacy) before any code.
