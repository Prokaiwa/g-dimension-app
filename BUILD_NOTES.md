# G-Dimension — Build Notes

Detailed built-state notes and per-section design decisions. **Read the relevant section here before working on that part of the app.** CLAUDE.md holds the always-on rules; this file holds the feature-by-feature detail that doesn't need to load every session.

---

## Beta Readiness Checklist (pre-friends test, no payment yet)

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
Two known unverified areas, both needing a real device rather than the relay
harness: **Wheels + Tires mounting** (migration 066, ADR-016) and the
**multi-car carousel at 3+ cars**.

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
- **Dev surfaces reachable in production.** Only `/spec-test` is `import.meta.env.DEV`-gated (`App.tsx:423`). `/sound-test`, `/dev/trading-cards` and `/license-preview` ship to any signed-in user, and `PublicProfilePage`'s TUNE console (`TUNE_MODE`, line 191) activates for anyone who puts `?tune` in a **public** profile URL. Owner's call (2026-07-27): leave for now, revisit when PWA access is retired in favour of the app stores.
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
| **Wheels + Tires combo** | ⚠️ **NOT exercised.** The wheel job saves fine, but the "Add Tires" toggle sits far down the form and automation never got it clicked, so `mounted_on_job_id` stayed NULL. The mount logic (066/ADR-016) is still **unverified** — worth a manual pass on a device. |

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
