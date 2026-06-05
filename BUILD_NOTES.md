# G-Dimension — Build Notes

Detailed built-state notes and per-section design decisions. **Read the relevant section here before working on that part of the app.** CLAUDE.md holds the always-on rules; this file holds the feature-by-feature detail that doesn't need to load every session.

---

## What's Built

All primary routes are implemented:
- Auth: Landing, Login, Signup
- Hub: Home map
- Garage: hero, My Cars carousel, Add Car, Edit Car, Snapshot, Documents, Contacts, Reminders, PDF
- Tuning: dashboard, Build Sheet (with section photos + photo picker), Blueprint (stub — not yet built), Parts Bin list, Add Part to Parts Bin, Add Mod (category → part type → form, with optional group field for batch installs), Mod Group detail, Mod Detail (with carousel/viewer + links + Remove from Car), Mod Edit (fields + specs + photos + links), Part Detail (with carousel/viewer + links + Install/Sell), Part Edit (fields + specs + photos + links)
- Maintenance: landing (GT Auto diagonal), service form + edit, session detail, detailing log, add + edit detail session
- Timeline: **stub only** — `TimelinePage` + `EntryDetailPage` return placeholder `<div>`s. Not yet built (see What's Next + MASTER_ARCHITECTURE Part 12).
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
- `sessions` cascade-deletes `jobs` on delete — deleting a session removes all its line items automatically.
- `MaintenanceSessionDetailPage` is shared by both `type = 'maintenance'` and `type = 'detail'` sessions. Always check `session.type` to conditionally render job line items and adjust back navigation.

*Back navigation on session detail (type-aware):*
- `type = 'maintenance'` → `‹ Service` → `/maintenance`
- `type = 'detail'` → `‹ Detailing` → `/maintenance/detail`

*Detailing aesthetic — blue "Car Wash" identity:*
- `MaintenanceDetailNewPage` + `MaintenanceDetailEditPage` use `COLOR_TIMELINE_DETAIL` (`#8ab0c8`, muted cool blue), `FONT_UI`, light blue background (`#f4f8fb`), chip selectors for Exterior/Interior services.
- Do NOT apply the Courier/invoice styling to these pages.
- `MaintenanceDetailPage` (the log list) is still visually minimal — a richer "watery feel" treatment is TBD with the owner before building.

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

---

## What's Next (not yet built)

- **Timeline + Entry Detail** — both still stubs (`TimelinePage`, `EntryDetailPage` return one-line `<div>`s). This is the next major build. Reads from `timeline_entries` (migration 007), **not** from `sessions`/`jobs` directly:
  - **Origin Entry** — one per car (`is_origin = true`, `session_id` NULL), auto-seeded from `cars.purchase_story` + a day-one photo, `display_date` = `cars.purchase_date`. Cannot be deleted, only edited. Always the first card.
  - **Standard entries** — auto-synced from `sessions.add_to_timeline = true` via the `sessions_timeline_sync` trigger (`entry_type` ∈ modification/maintenance/detail; `photo_url` = `sessions.timeline_photo_url`; `journal_entry`; `display_date` = `sessions.date_performed`). No app code creates/deletes these — the trigger does.
  - **Design (MASTER_ARCHITECTURE Part 12):** the emotional heart; the **only light/parchment destination** (`#f5f2ee`), **NO header** (floating amber-gold `‹` `#c8a050` only, like Photos), **oldest-at-top** (Origin first, scroll down = forward in time), year markers as chapter dividers. Entry cards: 3px left accent stripe by type (mod `#c8c4bc` / service `#d4b86a` / detail `#8ab0c8`), type label + right-aligned date, optional full-width photo, journal text in **Cormorant Garamond italic** (the one place Cormorant carries the personal voice). Timeline tokens already exist in `src/tokens` / MASTER_ARCHITECTURE Part 3.
- **Blueprint page** — currently a stub. Should show planned/purchased mods not yet installed. Blueprint items are status=`planned` or status=`purchased` jobs. The page exists at `/tuning/blueprint` but has no real content.
- **Mod lifecycle completeness** — no flow yet to move a Blueprint item directly to Parts On Hand or to install from the Parts Bin.
- **Link reordering** — `job_links.display_order` column exists but there is no drag-to-reorder UI. Links render in insert order.
- **YouTube in-app playback** — currently `window.open`. When the PWA becomes a native Capacitor app, replace with `<iframe>` embed or a native video player. The DB schema supports this with no changes.
- **Unit conversion display** — `users.distance_unit`, `power_unit`, `torque_unit` columns exist but display conversion is not wired up on all screens.
- **Detailing log list visual treatment** — `MaintenanceDetailPage` still minimal; "watery feel" TBD with owner.
