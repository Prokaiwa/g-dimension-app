# G-Dimension — Claude Context

Car build journal PWA. React + Vite + Supabase. Live at gdimension.app.

**Before implementing any new screen or feature, read `MASTER_ARCHITECTURE.md`.** It is the product spec, design system, and decision log in one file. It wins on every conflict.

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
- Permitted radius only on: pill buttons (`9999px`), bottom sheet top corners (`12px`), avatars (`50%`), notification dots (`50%`), timeline cards (`4px` — the single exception), tiny accent badges (`2px`).

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

5 buckets total. Two are PRIVATE — access via signed URL only, never public URL.

| Bucket | Access | Stores |
|---|---|---|
| `car-photos` | PUBLIC | garage_photo_url, showcase_photo_url |
| `job-photos` | PUBLIC | job_photos.photo_url |
| `timeline-photos` | PUBLIC | sessions.timeline_photo_url, origin entry |
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

`supabase/migrations/001_users.sql` → `031_job_links.sql` — run in order.

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

**`supabase/hotfixes.sql`** — ad-hoc SQL applied directly to the live Supabase DB outside the migration sequence. Keeps a record of manual fixes. Check here when debugging missing permissions (e.g. `job_specs` grants are in here).

**Live DB watermark rule:** After any migration is confirmed run in the Supabase SQL Editor, update the watermark comment at the top of `hotfixes.sql` to reflect the new last-applied migration and today's date. Also update the migration range in this file (`001–031` → new range) and add the new migration to the table above.

### Extra Columns on `jobs` (not in architecture doc)

The `jobs` table has these columns beyond what MASTER_ARCHITECTURE.md shows:
- `part_type_id` — FK to `part_types.id`
- `parts_cost` — decimal (separate from labor)
- `labor_cost` — decimal (only relevant when `installed_by = 'shop'`)
- `installed_by` — `'self' | 'shop'`

**Labor cost rule:** Only show/insert `labor_cost` when `installed_by === 'shop'`. Never show it when self-installed or unset.

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
src/App.tsx                         — Route tree + ProtectedRoute + auth sync on sign-in
src/pages/TuningBuildSheetPage.tsx  — TUNING_CATEGORIES (exported, imported by 4 other pages)
src/pages/TuningAddPage.tsx         — 3-step add mod flow (category → part type → form)
src/pages/TuningModDetailPage.tsx   — Mod detail + carousel/viewer + links display + Remove from Car sheet
src/pages/TuningModEditPage.tsx     — Full mod edit form (fields + specs + photos + links)
src/pages/TuningPartsPage.tsx       — Parts Bin list (cardboard aesthetic, In Storage + On Hand)
src/pages/TuningPartsAddPage.tsx    — Add Part directly to Parts Bin (purchased status)
src/pages/TuningPartDetailPage.tsx  — Part detail (kraft paper, carousel/viewer, links, Install/Sell actions)
src/pages/TuningPartEditPage.tsx    — Part edit form (kraft paper, fields + specs + photos + links)
src/pages/MaintenancePage.tsx             — Maintenance landing (GT Auto diagonal, service history strip)
src/pages/MaintenanceServiceNewPage.tsx   — Add Service Session form (invoice/Courier aesthetic)
src/pages/MaintenanceServiceEditPage.tsx  — Edit Service Session (STUB — not yet built)
src/pages/MaintenanceSessionDetailPage.tsx — Session detail view (shared by maintenance + detail types)
src/pages/MaintenanceDetailPage.tsx       — Detailing log list (aesthetic TBD — watery feel pending)
src/pages/MaintenanceDetailNewPage.tsx    — Log a Detail Session form
src/assets/icons/maintenance/service.png       — Service tile icon
src/assets/icons/maintenance/maintenance_detail.png — Detailing tile icon (transparent PNG, RGBA)
src/pages/SpecTestPage.tsx          — Dev tool at /spec-test — runs all part type spec inserts
MASTER_ARCHITECTURE.md              — Product spec, design system, data model, decisions log
supabase/migrations/                — Numbered SQL files 001–031
supabase/hotfixes.sql               — Ad-hoc fixes applied to live DB
scripts/test-specs.mjs              — Node.js CLI version of spec insert test
```

---

## What's Built

All primary routes are implemented:
- Auth: Landing, Login, Signup
- Hub: Home map
- Garage: hero, My Cars carousel, Add Car, Edit Car, Snapshot, Documents, Contacts, Reminders, PDF
- Tuning: dashboard, Build Sheet (with section photos + photo picker), Blueprint (stub — not yet built), Parts Bin list, Add Part to Parts Bin, Add Mod (3-step), Mod Detail (with carousel/viewer + links + Remove from Car), Mod Edit (fields + specs + photos + links), Part Detail (with carousel/viewer + links + Install/Sell), Part Edit (fields + specs + photos + links)
- Maintenance: landing (GT Auto diagonal), service form, session detail, detailing log, add detail session
- Timeline: scroll, entry detail
- Photos: masonry gallery
- Profile, Settings, Settings/Archived, Public Profile (`/builds/:username`)

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
/maintenance/service/edit/:id       → MaintenanceServiceEditPage (STUB)
/maintenance/:sessionId             → MaintenanceSessionDetailPage (handles both types)
/maintenance/detail                 → MaintenanceDetailPage
/maintenance/detail/new             → MaintenanceDetailNewPage
```
All static routes are declared **above** the dynamic `/:sessionId` route in App.tsx — do not reorder.

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

*Detailing aesthetic — NOT YET DESIGNED:*
- `MaintenanceDetailPage` and `MaintenanceDetailNewPage` are functional but visually minimal.
- Planned aesthetic: "watery feel" — distinct from the invoice style. Specific palette and layout TBD with the owner before building.
- Do not apply the Courier/invoice styling to these pages.

*Tile config in MaintenancePage (do not reorder — left=Detailing, right=Service):*
```ts
{ id: 'detail',  left: 48,  bottom: 60,  imgPad: 20, labelOffset: 4  }
{ id: 'service', left: 218, bottom: 102, imgPad: 0,  labelOffset: -20 }
```
`imgPad` shrinks the image within the 126×126 wrapper. `labelOffset` is `marginTop` on the label span.

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

---

## What's Next (not yet built)

- **Blueprint page** — currently a stub. Should show planned/purchased mods not yet installed. Blueprint items are status=`planned` or status=`purchased` jobs. The page exists at `/tuning/blueprint` but has no real content.
- **Mod lifecycle completeness** — no flow yet to move a Blueprint item directly to Parts On Hand or to install from the Parts Bin.
- **Link reordering** — `job_links.display_order` column exists but there is no drag-to-reorder UI. Links render in insert order.
- **YouTube in-app playback** — currently `window.open`. When the PWA becomes a native Capacitor app, replace with `<iframe>` embed or a native video player. The DB schema supports this with no changes.
- **Unit conversion display** — `users.distance_unit`, `power_unit`, `torque_unit` columns exist but display conversion is not wired up on all screens.
