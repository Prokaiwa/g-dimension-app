# G-Dimension — Build Notes

Detailed built-state notes and per-section design decisions. **Read the relevant section here before working on that part of the app.** CLAUDE.md holds the always-on rules; this file holds the feature-by-feature detail that doesn't need to load every session.

---

## Beta Readiness Checklist (pre-friends test, no payment yet)

### Planned next sessions (in priority order)
1. ~~**Error observability (Sentry)**~~ ✅ DONE (2026-07-17) — `src/lib/errorTracking.ts`: lazy idle init (adds nothing to boot), inlined public DSN, CSP already allows the ingest domain, `?sentry-test` wiring check. Events are tagged with the user id (set on auth changes in `App.tsx`), the deploy SHA/environment (Vercel system env vars), and every `reportActionError()` save failure is mirrored remotely (`handled:action-error` tag). Errors only — no tracing/replay, to keep the free-tier quota lean. Remaining nice-to-have: readable prod stack traces via `@sentry/vite-plugin` source-map upload (needs a `SENTRY_AUTH_TOKEN` in Vercel).
2. **Empty states** — walk every section as a brand-new user (no car, no mods, no timeline). Each screen should look intentional when empty, not just blank.
3. **Safe area insets** — audit fixed headers/footers for `env(safe-area-inset-top/bottom)`. Notch + home indicator on newer iPhones clip content that isn't padded.
4. ~~**Account deletion**~~ ✅ DONE — "Delete my account" in Settings (`SettingsPage.tsx` + the `delete-account` Edge Function; skips transferred-car storage folders per migration 072).
5. **Public profile end-to-end** — test `/builds/:username` as a logged-out visitor on mobile. (2026-07-17: backend errors on the public landing + garage now show a retryable error state instead of reading as "empty" — retest after that.)
6. ~~**Onboarding walkthrough**~~ ✅ DONE — guided home-map tour (`src/tour/`, migration 062 `users.tutorial_seen`; "Replay App Tour" in Settings).
7. ~~**UI sounds**~~ ✅ DONE — GT-style synthesized sounds (`src/lib/sound.ts`, account-synced via migrations 068/069, audition board at `/sound-test`).
8. ~~**Security audit**~~ ✅ DONE — see `docs/SECURITY_AUDIT.md` (2026-07; column-level anon grants in 071, `car_private` split in 061 came out of it).
9. **Inconsistency check** — cross-file audit: token usage, shared component props, route links, category/group mapping sync (`CATEGORY_TO_GROUP` in two files).
10. **Dead code / file cleanup** — unused imports, unreferenced assets, stale routes.
11. **Polish review** — spacing, tap targets, transition consistency, anything that feels rough.

### Known lower-priority items
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
- `/tuning/parts-bin` — lists parts in "In Storage" (status=`removed`, still_owned=true) and "On Hand" (status=`purchased`) sections. Items have seeded random Polaroid-style offsets (±3.25° rotation, ±5.5px nudge) — stable per UUID, never re-randomizes.
- `/tuning/parts-bin/add` — form to add a part directly (inserts as status=`purchased`, still_owned=true). Fields: name, brand, category, cost, date acquired, notes
- `/tuning/parts-bin/:partId` — Part detail page (kraft paper): photo carousel + fullscreen viewer, specs, notes, links. Actions: Install →, Sell / Scrap.
- `/tuning/parts-bin/:partId/edit` — Part edit: all fields + specs + photos + links management
- "Put Back" button on each part → sets status=`installed`, clears `date_removed`, returns to Build Sheet
- Parts page header: `‹ Tuning` left, `[year model] [Month Day box]` right — same inline pattern as Garage
- Hand-drawn SVG ellipse FAB navigates to `/tuning/parts-bin/add`
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
