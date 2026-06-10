# G-Dimension — Claude Context

Car build journal PWA. React + Vite + Supabase. Live at gdimension.app.

**Before implementing any new screen or feature, read `MASTER_ARCHITECTURE.md`.** It is the product spec, design system, and decision log in one file. It wins on every conflict.

**🏁 Active work — the "Featured" magazine section:** read `FEATURED.md` before touching `/featured` (`src/pages/FeaturedPage.tsx`), the Home "Featured" node, or the car-photo upload pipeline. It holds the full direction, what's built (cover prototype + migration 049 original-photo persistence), and the next steps (interior spreads + the CSS/SVG page-turn). Featured is a deliberate **aesthetic island** allowed to break the global design rules (like Parts Bin).

## Git Rules — NON-NEGOTIABLE

- **Always commit and push directly to `main`.** Never create a feature branch. Never push to any other branch.
- Do not open pull requests. Commit to `main` and push.
- Vercel auto-deploys on every push to `main` — that is the deployment pipeline.

---

---

## Stack

```
Frontend:   React 18 + Vite + TypeScript
Routing:    React Router v6
Styling:    Tailwind configured but barely used — nearly everything is inline styles
Backend:    Supabase (Postgres + Auth + Storage + Edge Functions)
Hosting:    Vercel (auto-deploy on push to main)
Domain:     gdimension.app
Repo:       github.com/Prokaiwa/g-dimension-app
```

**Zero component libraries.** No shadcn, Radix, MUI, Chakra, Headless UI — nothing. Every component is written from scratch. Do not introduce any.

---

## Dev Commands

```bash
npm run dev       # Vite dev server (port 5173 usually)
npm run build     # tsc -b && vite build
npm run lint      # eslint
```

Deployment is automatic — push to `main` on GitHub and Vercel deploys.

---

## Design Tokens

All design tokens live in `src/tokens/index.ts`. **Never hardcode colors, fonts, spacing, or animation values.** Import from there.

Key tokens used constantly:
- `FONT_UI` — Hanken Grotesk — all UI text
- `FONT_TITLE` — Cormorant Garamond — display moments only (see rules below)
- `FONT_HANDWRITTEN` — Caveat — **Parts page only**
- `FONT_STAMP` — Permanent Marker — **Parts page only** (the "Parts" header stamp)
- `COLOR_ACCENT` — `#c8661a` — the only warm accent color
- `COLOR_HEADER_BLACK`, `COLOR_HEADER_WARM` — header bar colors
- `HEADER_HEIGHT` — 44 (px)
- `EASING_SETTLE` — `cubic-bezier(0.22, 1, 0.36, 1)` — all entry animations

---

## Non-Negotiable Design Rules

These are enforced decisions. Do not deviate without explicit instruction.

**Shape:**
- `border-radius: 0` on ALL architectural elements — headers, panels, inputs, nav cards, stat rows. No exceptions.
- Permitted radius only on: **rounded-rectangle buttons (`RADIUS_BUTTON` = `10px`)**, pill buttons (`9999px`), bottom sheet top corners (`12px`), avatars (`50%`), notification dots (`50%`), timeline cards (`4px` — the single exception), tiny accent badges (`2px`).
- **Buttons: prefer the rounded rectangle (`RADIUS_BUTTON`), not the pill.** Pills read as generic-modern-app; the rounded rectangle is the deliberate anti-app choice. Pills (`RADIUS_PILL`) remain only where already established (auth CTAs, the sparing Save/Choose/Add actions) — don't add new ones. This supersedes the "Pill buttons in the app" note in MASTER_ARCHITECTURE.md Part 8.

**Color:**
- Never use pure white (`#ffffff`) for body text. Cap at `#f5f5f5`.
- No adding new colors. The palette is in `MASTER_ARCHITECTURE.md` Part 3 / `src/tokens/index.ts`.

**Typography:**
- `FONT_UI` (Hanken Grotesk) for all UI: labels, buttons, nav, forms, stats, body
- `FONT_TITLE` (Cormorant Garamond) for display/chapter moments ONLY: Home title watermark, Garage screen heading, hero taglines, Timeline journal entries (Cormorant exclusively for the personal voice)
- Tuning section: Hanken only, never Cormorant
- Timeline section: Hanken for structure (labels, dates, tags), Cormorant for journal entry text only

**Navigation:**
- No persistent tab bars anywhere
- Every sub-screen has `‹` back chevron top-left — **exception**: Timeline and Photos both have NO header (floating amber-gold `‹` only)
- Car name in every header: informational only, **never tappable**
- Avatar → `/profile`. Settings inside Profile.
- Back navigation is always linear

**Tap targets:** 44×44px minimum

**22.5° cast shadow:** Garage dashboard grid (3×2 icon grid) ONLY. Not on Home map, not anywhere else.

---

## Photo Uploads — Always JPEG

All photo uploads are compressed to JPEG before upload, no exceptions. iPhone HEIC is not universally supported.

```ts
import imageCompression from 'browser-image-compression'

const COMPRESSION_OPTIONS = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  exifOrientation: -1,
  fileType: 'image/jpeg',  // ALWAYS jpeg
}

const compressed = await imageCompression(file, COMPRESSION_OPTIONS)
const ext = 'jpg'  // always jpg, never .heic or original extension
```

Storage path pattern: `{userId}/{carId}/{jobId}/{Date.now()}-{random}.jpg`

---

## Car Photo Background Removal

The car carousel photo (`cars.garage_photo_url`) is the **one exception** to the JPEG rule — it is stored as a transparent **PNG** (a background-removed cutout needs an alpha channel). Background removal runs **100% client-side** — RMBG-1.4 via Transformers.js on WASM, no API, no server, $0 at any scale.

**Before touching `src/lib/backgroundRemoval.ts`, `src/lib/carPhoto.ts`, `src/components/CarPhotoUpload.tsx`, or the `CarStage` component in `GarageCarsPage.tsx`, read `CAR_PHOTO_HANDOFF.md`.** It holds the architecture decision (client-side now / BiRefNet bundled on-device when native; never a server or paid API), the build details, and the open problem (the shadow + reflection are a flat 2D flip and must be reworked to respect the car's receding ground plane).

The `cars.garage_photo_url` comment in `004_cars.sql` ("Remove.bg pipeline") is **outdated** — it is RMBG-1.4 client-side now.

---

## Storage Buckets

6 buckets total. Two are PRIVATE — access via signed URL only, never public URL.

| Bucket | Access | Stores |
|---|---|---|
| `car-photos` | PUBLIC | garage_photo_url, showcase_photo_url |
| `job-photos` | PUBLIC | job_photos.photo_url |
| `timeline-photos` | PUBLIC | sessions.timeline_photo_url, Origin Entry photo, Timeline note photos (`timeline_entry_photos`) |
| `avatars` | PUBLIC | users.avatar_url — profile pictures (migration 040) |
| `receipts` | **PRIVATE** | receipts.file_url — financial records |
| `car-documents` | **PRIVATE** | car_documents.file_url — VINs, registration, insurance |

For private buckets use `supabase.storage.from('receipts').createSignedUrl(path, 60)`. Never `getPublicUrl()`.

---

## Active Car Pattern

Always use the helper functions. Never read/write `localStorage` directly for the active car.

```ts
import { getActiveCarId, setActiveCar, syncActiveCarFromServer } from '../lib/activeCar'

// In any page that needs the active car:
const carId = await getActiveCarId()
```

- `getActiveCarId()` — checks `localStorage` first (instant), falls back to `users.active_car_id` in Supabase
- `setActiveCar(carId)` — writes localStorage + syncs to `users.active_car_id` (cross-device)
- `syncActiveCarFromServer()` — called once on sign-in (see `App.tsx`)
- localStorage key is `'gdim_chosen_car_id'` — do not reference this string elsewhere

---

## Database

### Migration Files

`supabase/migrations/001_users.sql` → `051_usage_type_engine_origin.sql` — run in order.

**MASTER_ARCHITECTURE.md Part 17 documents 001–023.** The following were added during build and are NOT in the architecture doc:

| Migration | What it adds |
|---|---|
| `024_part_spec_system.sql` | `part_types` table, `spec_templates` table, `job_specs` table, `part_type_id` FK on jobs |
| `025_part_spec_cleanup.sql` | Constraints + cleanup on part/spec system |
| `026_part_spec_domain*.sql` | Domain validation on spec fields |
| `027_active_car.sql` | `users.active_car_id` column |
| `029_build_sheet_photos.sql` | `cars.build_sheet_power_photo`, `cars.build_sheet_chassis_photo`, `cars.build_sheet_exterior_photo`, `cars.build_sheet_interior_photo` |
| `030_sale_tracking.sql` | `jobs.sale_price` (decimal), `jobs.sale_date` (date) — populated when status=`sold` |
| `031_job_links.sql` | `job_links` table — multiple URLs per job, RLS + grants |
| `032_session_cost_breakdown.sql` | `sessions.labor_cost` (decimal), `sessions.tax_amount` (decimal) — shop invoice cost breakdown |
| `033_session_mod_groups.sql` | `sessions.title text` — display name for grouped mod entries on the Build Sheet (nullable; only set on `type='modification'` sessions created via the grouped install flow) |
| `034_reminder_job_link.sql` | `car_reminders.job_id` FK to `jobs` (on delete set null) — part-level service-interval reminders (e.g. turbo rebuild every 30k mi). Pairs with `due_mileage` / `due_date` |
| `035_user_contacts.sql` | `user_contacts` table — per-**user** (cross-car) contact book + RLS owner policy + grants. Supersedes per-car `car_contacts` for the Contacts screen (`car_contacts` since dropped — see 043) |
| `036_document_receipts.sql` | `car_documents.doc_type` CHECK widened to allow `'receipt'`; `car_documents.amount` (decimal) + `currency` (char 3) columns — standalone titled receipts (insurance/registration fees). NOT counted toward Build Investment |
| `037_contact_social.sql` | `user_contacts.social` (text) — optional social/profile link per contact, shown after Website on the Contacts screen |
| `038_username_uniqueness.sql` | Rewrites `handle_new_user()` to generate a **collision-safe** username at signup (walks `base`, `base2`, `base3`… to the first free handle). Fixes a latent bug where a colliding auto-handle raised a unique_violation and rolled back the whole signup. Function-only change; trigger unchanged |
| `039_username_claim.sql` | `users.username_set` (boolean, default false) — onboarding flag. New signups start `false` and are routed through the `/welcome` handle-claim screen; existing users backfilled to `true`. Frontend gate reads it defensively (fails open if absent) |
| `040_avatar_bucket.sql` | `avatars` storage bucket (PUBLIC, 6th bucket) + owner-scoped RLS policies — backs `users.avatar_url` profile pictures. Uploaded via `src/lib/avatar.ts` (JPEG-compressed, path `{user_id}/{ts}-{rand}.jpg`). Until run, avatar upload fails gracefully and the letter avatar shows |
| `041_reminder_leadtime_job_mileage.sql` | `car_reminders.remind_days_before` (int) — lead time before `due_date` to start alerting (document expiry reminders set `due_date` = the real expiry, not expiry-minus-leadtime); `jobs.install_mileage` (int) — odometer when a mod was installed, feeds the "update current mileage" prompt. **Applied 2026-06-03, out of order (after 042/043) — had been skipped; the GarageDocuments reminder-write and TuningAdd install-mileage write depend on it** |
| `042_handle_new_user_retry.sql` | Wraps the `handle_new_user()` INSERT in a `unique_violation` retry loop to fully close the residual username-collision race left by 038 (concurrent same-base signups). Function-only; preserves the 2026-05-31 EXECUTE revoke |
| `043_drop_car_contacts.sql` | Drops the orphaned `car_contacts` table (superseded by `user_contacts` in 035; was 0 rows, no code refs). CASCADE also removes its RLS policies + grants |
| `044_car_variant.sql` | `cars.variant` (text) — free-text sub-model label (e.g. "430" on a Lexus LS), distinct from `model` (family) and `trim` (spec level). Display name = year + model + variant ("2006 LS 430"). Forward-compatible with the empty `vehicle_variants` catalog + `cars.variant_id` for a future picker |
| `045_timeline_sync_fix.sql` | **Two live-DB fixes found while building the Timeline.** (1) Re-applies `sessions.title` — migration **033 had never actually been applied to production** (live DB raised `42703 column sessions.title does not exist`), despite the old watermark claiming 001–044 were all applied. (2) Rewrites `handle_timeline_entry()` (the `sessions_timeline_sync` trigger from 007): its bare `on conflict (session_id) do nothing` could not infer the **partial** unique index `timeline_entries_session_unique`, raising `42P10` on **every** `add_to_timeline = true` session insert — so no standard timeline entry could ever be created. Fix restates the index predicate in the conflict clause. Function-only + idempotent column re-add |
| `046_timeline_note_entries.sql` | Free-form Timeline entries. Widens `timeline_entries.entry_type` CHECK to allow `'note'` (personal/blog entries not tied to a session — track day, car show, a story; created via `/timeline/new`, `session_id` NULL) and adds `timeline_entries.title` (headline; notes set it, session-derived entries leave it NULL and still derive their title from the session/jobs). Idempotent + `notify pgrst` reload |
| `047_timeline_entry_media.sql` | `timeline_entry_photos` + `timeline_entry_links` tables — multiple photos/links per Timeline note (added at compose time via `/timeline/new`), mirroring `job_photos`/`job_links`. `car_id` denormalized for 1-hop RLS; owner full access + public read for public cars; authenticated DML + anon select grants. The note's `timeline_entries.photo_url` stays the hero (first photo) for the card thumbnail; the full gallery + links render on Entry Detail |
| `048_session_timeline_fields.sql` | `sessions.timeline_title` (text) — custom Timeline-card title for session-derived entries (mod/service/detail), distinct from the dry record; the `handle_timeline_entry()` trigger now copies it → `timeline_entries.title` (and keeps it synced). The story already had a home (`sessions.journal_entry`, copied by the trigger). Both surface in the six session forms (mod add/edit, service new/edit, detail new/edit) under the Add-to-Timeline toggle. Empty title → card falls back to the derived name. No frontend rendering changes (Timeline + Entry Detail already read `timeline_entries.title` first). Function-only + idempotent column add |
| `049_car_original_photo.sql` | `cars.original_photo_url` (text, nullable) — stores the **original** uploaded car photo (compressed JPEG, `car-photos` bucket, path `original-{ts}.jpg`) *before* background removal; `garage_photo_url` remains the PNG cutout derived from it. Lets the **Featured** magazine cover use the full photo, and lets background removal be re-run later (see `CAR_PHOTO_HANDOFF.md`). Saved on add/edit-car upload via `uploadCarOriginal()` in `carPhoto.ts` (best-effort — never blocks the car save; written as a *separate* update so a pre-migration gap can't break edits). Existing cars stay NULL until re-upload. Additive nullable column — no policy/grant changes (cars RLS already covers it). Applied 2026-06-07. |
| `050_nickname_nullable.sql` | `cars.nickname` — drops `NOT NULL` constraint. Nickname is optional personal branding; Featured falls back to `model + variant` when null. Applied 2026-06-09. |
| `051_usage_type_engine_origin.sql` | `cars.usage_type` (street/daily/track/drift/drag/show/vip/offroad) + `cars.engine_origin` (original/swapped) — primary-use category and engine provenance for the Featured archetype engine. Also refreshes `public_car_profiles` view to include both new columns plus previously-missing `build_sheet_*_photo` columns. |

**`supabase/hotfixes.sql`** — ad-hoc SQL applied directly to the live Supabase DB outside the migration sequence. Keeps a record of manual fixes. Check here when debugging missing permissions (e.g. `job_specs` grants are in here).

**Live DB watermark rule:** After any migration is confirmed run in the Supabase SQL Editor, update the watermark comment at the top of `hotfixes.sql` to reflect the new last-applied migration and today's date. Also update the migration range in this file (e.g. `001–048` → new range) and add the new migration to the table above.

**Supabase schema change notice (effective May 30, 2026):** Any new tables created in the `public` schema after this date require explicit PostgREST grants — Supabase no longer auto-grants access. After creating a new table, always run: `grant select, insert, update, delete on public.<table> to authenticated;` (and `grant select on public.<table> to anon;` for public reference tables).

### Extra Columns on `jobs` (not in architecture doc)

The `jobs` table has these columns beyond what MASTER_ARCHITECTURE.md shows:
- `part_type_id` — FK to `part_types.id`
- `parts_cost` — decimal (separate from labor)
- `labor_cost` — decimal (only relevant when `installed_by = 'shop'`)
- `installed_by` — `'self' | 'shop'`

**Labor cost rule:** Only show/insert `labor_cost` when `installed_by === 'shop'`. Never show it when self-installed or unset.

### Extra Columns on `sessions` (not in architecture doc)

- `title text` (nullable) — Build Sheet display name for grouped mod installs (e.g. "Built Block"). Only populated on `type='modification'` sessions created via the grouped install flow. Sessions without a title are anonymous (timeline-only envelopes for solo mods, or maintenance/detail sessions).
- `labor_cost decimal` (nullable) — shop labor portion of a maintenance session invoice (migration 032)
- `tax_amount decimal` (nullable) — tax on a maintenance session invoice (migration 032)

### Build Sheet Groups

Frontend-only grouping — no DB equivalent. Categories map to display groups:

```ts
const CATEGORY_TO_GROUP: Record<string, string> = {
  'Engine': 'power', 'Drivetrain': 'power', 'Forced Induction': 'power',
  'Exhaust': 'power', 'Cooling': 'power', 'Fuel System': 'power', 'Electrical': 'power',
  'Suspension': 'chassis', 'Brakes': 'chassis', 'Wheels & Tires': 'chassis',
  'Exterior': 'exterior', 'Paint & Wrap': 'exterior', 'Lighting': 'exterior',
  'Interior': 'interior', 'Audio': 'interior', 'Safety': 'interior',
}
```

This mapping exists in **two places** that must stay in sync:
- `TuningBuildSheetPage.tsx` — `MOD_GROUPS` array
- `TuningModDetailPage.tsx` — `CATEGORY_TO_GROUP` object

The group → DB column mapping:
```ts
const GROUP_PHOTO_COL = {
  power:    'build_sheet_power_photo',
  chassis:  'build_sheet_chassis_photo',
  exterior: 'build_sheet_exterior_photo',
  interior: 'build_sheet_interior_photo',
}
```

### RLS

All user tables have Row-Level Security enabled. Reference tables (`vehicle_makes`, `vehicle_models`, `vehicle_variants`, `vehicle_search_aliases`) are public read. Full policies in `015_rls_policies.sql` and `023_public_profile_boundary.sql`.

`users.id` = `auth.users.id` directly. The `on_auth_user_created` trigger creates the `public.users` row automatically — no app code needed.

---

## Key File Map

```
src/tokens/index.ts                 — ALL design tokens (colors, fonts, spacing, animation)
src/lib/supabase.ts                 — Supabase client (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
src/lib/activeCar.ts                — Active car get/set/sync helpers
src/lib/links.ts                    — getYouTubeId, getYouTubeThumbnail, JobLink type
src/App.tsx                         — Route tree + ProtectedRoute (renders AuthGateFallback while loading) + ErrorBanner + auth sync on sign-in
src/components/AuthGateFallback.tsx — Auth watchdog: branded loading, then a recovery screen (Reload / Sign in again) if the gate hangs >8s
src/components/ErrorBanner.tsx      — On-device global error banner (traps window.onerror + unhandledrejection); for phone testing, renders nothing until an error fires
src/pages/GarageCarsPage.tsx        — My Cars carousel + read-only Details sheet (morphs the active card) + inline Add Car flow; exports GarageBg + GarageHeader
src/pages/GarageCarsEditPage.tsx    — Edit Car form (/garage/cars/:carId/edit): full car fields + photo + Remove Car
src/pages/TuningBuildSheetPage.tsx  — TUNING_CATEGORIES (exported, imported by 4 other pages)
src/pages/TuningAddPage.tsx         — Add mod flow (category → part type → form); optional group name field at bottom creates a named session for batch installs
src/pages/TuningModGroupPage.tsx    — Group detail page (/tuning/mod-group/:sessionId): shows session title, components list, notes; + Add Component FAB loops back to TuningAddPage with sessionId in router state
src/pages/TuningModDetailPage.tsx   — Mod detail + carousel/viewer + links display + Remove from Car sheet
src/pages/TuningModEditPage.tsx     — Full mod edit form (fields + specs + photos + links)
src/pages/TuningPartsPage.tsx       — Parts Bin list (cardboard aesthetic, In Storage + On Hand)
src/pages/TuningPartsAddPage.tsx    — Add Part directly to Parts Bin (purchased status)
src/pages/TuningPartDetailPage.tsx  — Part detail (kraft paper, carousel/viewer, links, Install/Sell actions)
src/pages/TuningPartEditPage.tsx    — Part edit form (kraft paper, fields + specs + photos + links)
src/pages/MaintenancePage.tsx             — Maintenance landing (GT Auto diagonal, service history strip)
src/pages/MaintenanceServiceNewPage.tsx   — Add Service Session form (invoice/Courier aesthetic)
src/pages/MaintenanceServiceEditPage.tsx  — Edit Service Session (Windows XP aesthetic, loads + UPDATEs)
src/pages/MaintenanceSessionDetailPage.tsx — Session detail view (shared by maintenance + detail types)
src/pages/MaintenanceDetailPage.tsx       — Detailing log list (aesthetic TBD — watery feel pending)
src/pages/MaintenanceDetailNewPage.tsx    — Log a Detail Session form (blue Car Wash aesthetic)
src/pages/MaintenanceDetailEditPage.tsx   — Edit Detail Session (blue Car Wash aesthetic, loads + UPDATEs)
src/pages/TimelinePage.tsx          — Timeline scroll (parchment, NO header, floating amber chevron). Reads timeline_entries oldest-at-top; Origin cover (settable photo) + connecting thread + year dividers + photo-print thumbnails; "+ Add Entry" FAB → /timeline/new
src/pages/TimelineEntryNewPage.tsx  — Compose AND edit a free-form note (/timeline/new, /timeline/entry/:id/edit). Title, date, story (Cormorant), multiple photos + links
src/pages/EntryDetailPage.tsx       — Entry Detail (/timeline/entry/:id): hero + gallery + links; "View in Tuning/Maintenance" for session entries; Edit/Delete for notes
src/components/CameraIcon.tsx       — Shared stroked camera glyph (matches the Garage carousel camera)
src/assets/icons/maintenance/service.png       — Service tile icon
src/assets/icons/maintenance/maintenance_detail.png — Detailing tile icon (transparent PNG, RGBA)
src/pages/SpecTestPage.tsx          — Dev tool at /spec-test — runs all part type spec inserts
MASTER_ARCHITECTURE.md              — Product spec, design system, data model, decisions log
supabase/migrations/                — Numbered SQL files 001–050
supabase/hotfixes.sql               — Ad-hoc fixes applied to live DB
scripts/test-specs.mjs              — Node.js CLI version of spec insert test
```

---

## What's Built / What's Next

All primary routes are implemented (Auth, Home, Garage, Tuning, Maintenance, Timeline, Photos, Profile/Settings, Public Profile).

**Full feature-by-feature build state, per-section design decisions, and the "what's next" backlog live in `BUILD_NOTES.md`.** Read the relevant section there before working on a specific area (grouped mod installs, Parts Bin, photo carousel, job links, spec system, Maintenance section, etc.). Don't load it for general work — only when touching that feature.

---

## Supabase Project

- **URL:** `https://uxqoernfrtgclpneirvc.supabase.co`
- **Dashboard login:** hi@gdimension.app
- **Env vars (`.env.local`, not committed):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

---

## Infrastructure

| | |
|---|---|
| Domain | gdimension.app (Namecheap, dscan007@gmail.com) |
| Hosting | Vercel (auto-deploy from GitHub main) |
| GitHub | github.com/Prokaiwa/g-dimension-app |
| Supabase | hi@gdimension.app |

---

## Unit System

All values stored in base units, converted at display time only. Never store converted values.
- Distance: miles (display: mi or km)
- Power: hp (display: hp, PS, or kW)  
- Torque: lb-ft (display: lb-ft or Nm)

User preferences live on the `users` table (`distance_unit`, `power_unit`, `torque_unit`).

---

## Public Profile Boundary

`/builds/:username` is the only non-authenticated route.

Public: car identity, specs, timeline, photos, Build Sheet (brand + title + category — **no costs**)
Always private: receipts, contacts, documents, session details, VIN, license plate, purchase price
Private by default: Build Investment total (toggleable via `cars.show_investment_publicly`)

---

## Things to Watch

- **Migrations jump from 027 to 029** — 028 does not exist. Do not create a `028_*.sql` unless intentionally filling that slot.
- **TUNING_CATEGORIES** is exported from `TuningBuildSheetPage.tsx` and imported by `TuningBlueprintPage`, `TuningPartsPage`, `TuningPartsAddPage`, and `TuningAddPage`. Category `id` values must match `part_categories.name` in Supabase (FK constraint from migration 025).
- **`formatDate` in `TuningModDetailPage`** — destructures split as `[y, m, mo]` which is redundant. The month index is `(m ?? mo) - 1`. Leave it as-is unless specifically fixing it.
- **TypeScript:** `spec_templates` query requires `as unknown as SpecTemplate[]` cast — this is intentional, not a mistake.
- **TypeScript:** link entry union type in edit pages requires `as unknown as { _idx: number }` double-cast when removing a queued new link — this is intentional, strict mode doesn't accept a single cast from `JobLink & Record<"_isNew", unknown>` to `{ _idx: number }`.
- **No 028 migration** — skip that number.
- **TuningModDetailPage title:** `fontFamily: FONT_UI, fontStyle: 'italic', fontWeight: 700, fontSize: 28` — Hanken Grotesk bold italic, NOT Cormorant. Tuning never uses Cormorant.
- **Parts Bin aesthetic is intentionally different** from the rest of the app — kraft paper, corrugation lines, grain overlay, Caveat + Permanent Marker fonts. Do not apply this aesthetic outside `/tuning/parts-bin*` routes.
- **Magazine sheen overlay** on TuningModDetailPage and TuningModEditPage: two `position: fixed` divs (radial gradients) + SVG fractal noise grain at `opacity: 0.028, mixBlendMode: 'screen'`. This is intentional and should stay.
- **hotfixes.sql** — `durometer` spec_template has `unit='A'` and `placeholder=null` (changed from 'Shore' and '75' respectively). Applied directly to live DB.
- **job_links display order** — existing links keep their `display_order`; new links added in an edit session get `display_order = existingLinks.length + i`. No reordering UI yet.
- **Grouped mod sessions** — `sessions.title IS NOT NULL` is the signal that a session is a named group. When querying the Build Sheet, the code fetches titled sessions separately and derives their section from `jobs.category` via `MOD_GROUPS`. Never hard-code a `category` column on sessions for this purpose — section placement is always derived.
- **TuningAddPage router state** — when navigating to `/tuning/add` from a group detail page, pass `{ sessionId, groupTitle }` in React Router `state`. The page reads this via `useLocation().state` and skips session creation, attaching the new job directly to the existing session. After save it navigates to `/tuning/mod-group/:sessionId`.
- **Garage cars read/edit split** — `/garage/cars` Details is a **read-only** spec sheet; editing lives on `/garage/cars/:carId/edit` (`GarageCarsEditPage`), mirroring how mods/parts split read vs edit. **Add Car is still an inline modal on `/garage/cars`** — there is no `/garage/cars/new` route (MASTER_ARCHITECTURE's route map lists one, but it's not real; ProfilePage links to `/garage/cars`). `GarageBg` + `GarageHeader` are **exported** from `GarageCarsPage` and reused by the edit page (precedent: TUNING_CATEGORIES). Save/Remove return to `/garage/cars` with `{ focusCarId }` in router state so the carousel re-focuses the edited car.
- **Details sheet morphs the real carousel card — never a replica.** The sheet holds only the spec content; the active card's car lifts/shrinks and the logo + model + info strip fade out, driven by an "openness" value `t` (0–1) that **tracks the drag** (pulling the sheet down grows the car back). Do not reintroduce a hero car inside the sheet — that caused the duplicate-car look. Sheet covers the bottom 54% (`top: 46%`); the car morph at full-open is `translateY(-20vh) scale(0.8)` — the two are **coupled** (the car must clear the sheet top), so tune them together.
- **Details dismiss is a non-passive touch listener** (`touchmove` with `{ passive: false }` + `preventDefault` on the sheet `ref`) — needed so a downward pull closes instead of the native scroll rubber-banding ("pulling the text"). Grip (handle + title, `data-sheet-grip`) always drags; the spec list takes over only at `scrollTop <= 0`. Don't convert it to passive or to React pointer handlers. The header chevron leaves the Garage (`/garage`); swipe-down closes the sheet.
- **No-photo placeholder** — `CarStage` takes `placeholder` (dims the image to `filter: brightness(0.12)` — the image only, not the stage) + `onAddPhoto` (→ edit page). The amber-ring pulsing "beat" (`addPhotoBeat` / `addPhotoTextBeat`, 2.8s) is **shared** by the placeholder prompt AND both Add-Car circles (now hollow amber rings, no fill).
- **Timeline is built** (`TimelinePage`, `TimelineEntryNewPage`, `EntryDetailPage`). Reads `timeline_entries` (migration 007) oldest-at-top: Origin Entry (`is_origin`, one per car — synthetic from `cars.purchase_story` until a photo is added, then persisted) + session entries auto-synced via the `sessions_timeline_sync` trigger + free-form **notes** (`entry_type='note'`, migration 046). Parchment, NO header (floating amber `‹`), connecting thread, year dividers, photo-print thumbnails (timeline_photo_url → first job_photo fallback). Notes carry multiple photos/links (`timeline_entry_photos`/`_links`, migration 047) and are editable/deletable; session entries get a custom Timeline title + story (`sessions.timeline_title` + `journal_entry`, migration 048) and link back to their source for editing. **The card/detail title reads `timeline_entries.title` first**, then derives from session/jobs.

---

## What's Next

The "not yet built" backlog (Blueprint page, mod lifecycle flows, link reordering, YouTube in-app playback, unit conversion display, Detailing list visual treatment) lives in `BUILD_NOTES.md`.
