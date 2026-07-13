# G-Dimension Decision Log

Architectural Decision Records, in the order the decisions were made. Entries
are **never rewritten** — a revised decision gets a *new* entry that references
the one it supersedes. Backfilled 2026-07-07 from `MASTER_ARCHITECTURE.md`,
`CLAUDE.md`, `BUILD_NOTES.md`, `FEATURED.md`, and `CAR_PHOTO_HANDOFF.md`;
each ADR names its source so details can be checked there.

Format: **Decision** (what) / **Context** (the situation) / **Rationale**
(why this option) / **Consequences** (what it commits us to).

Companion docs: [ENGINEERING_PRINCIPLES.md](ENGINEERING_PRINCIPLES.md) (the
permanent rules these decisions produced), [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md),
[TESTING.md](TESTING.md).

---

## ADR-001 — Vite SPA + Supabase + Vercel, no custom backend

**Decision:** React 18 + Vite + TypeScript SPA; Supabase for Postgres, Auth,
Storage, and Edge Functions; Vercel for hosting with auto-deploy from `main`.

**Context:** Solo-built product; every hour spent on infrastructure is an hour
not spent on the car journal itself.

**Rationale:** Supabase gives a real Postgres with row-level security, so the
"backend" is policies + migrations instead of a server codebase. Vercel makes
every push a deploy. The one server-side escape hatch is Vercel serverless
(`api/og.js` for link previews) and Supabase Edge Functions
(`delete-account`).

**Consequences:** All authorization lives in RLS — policy mistakes are data
leaks, so schema changes carry the verification protocol (Principle 4). The
client talks to Supabase directly; there is no API layer to hide behind.
Source: CLAUDE.md → Stack, Infrastructure.

## ADR-002 — Design tokens + inline styles; zero component libraries

**Decision:** Every component is written from scratch. No shadcn, Radix, MUI,
Chakra, Headless UI. Styling is inline `style={{...}}` objects fed from
`src/tokens/index.ts`; Tailwind is configured but essentially unused.

**Context:** The product's identity is a deliberate anti-generic-app look
(Gran Turismo / print-media influences). Component libraries impose their own
aesthetic and DOM idioms.

**Rationale:** Total control over shape and typography rules that libraries
fight (border-radius 0, custom sheets, the 22.5° cast shadow). One tokens file
makes the design system greppable and mechanical.

**Consequences:** More hand-written UI code; in exchange, the design rules in
CLAUDE.md are enforceable and nothing ships an off-brand default. Do not
introduce a component library. Source: CLAUDE.md → Stack, Design Tokens.

## ADR-003 — RLS everywhere; `public_*` SECURITY DEFINER views are the only public gateway

**Decision:** Every user table has row-level security. Anonymous visitors
reach data exclusively through the `public_car_profiles` (and sibling
`public_*`) views, which are an intentional SECURITY DEFINER boundary
(migration 023 + refreshes in 051–055, 063).

**Context:** `/builds/:username` is the only unauthenticated route; everything
else requires a session. The public view must expose exactly the curated
columns and nothing more.

**Rationale:** A view is a single auditable place that decides what a visitor
can see (including per-section visibility flags from migration 053, and
NULLing `featured_story` when Featured is private). Row policies alone can't
do column-level curation.

**Consequences:** **Never convert these views to `security_invoker`** — the
anon role has no direct table access by design, so the switch breaks
production. Adding a public field means refreshing the view in a migration.
Source: MASTER_ARCHITECTURE.md → Public Profile Boundary; security review
2026-06-27.

## ADR-004 — Sensitive car fields split into `car_private`

**Decision:** VIN, license plate, purchase price (+ purchase details) moved
out of `cars` into `car_private` with owner-only RLS and no public policy
(migration 061). App access only via `src/lib/carPrivate.ts`.

**Context:** The `cars` public-read policy (`is_public = true`, default true)
is row-level, so it exposed *all columns* of public cars — including VIN and
plate — to the anon key.

**Rationale:** Column-level secrecy can't be expressed in a row policy;
physically separating the columns makes the leak impossible rather than
merely guarded.

**Consequences:** Any code needing VIN/plate/price goes through
`getCarPrivate`/`upsertCarPrivate` (constitution-enforced). Kept public on
purpose: `paint_code`, `purchase_date`, `purchase_story`. Source: migration
061; CLAUDE.md migration table.

## ADR-005 — Car photo background removal is client-side, forever free

**Decision:** Background removal runs 100% on-device — RMBG-1.4 via
Transformers.js on WASM in the PWA now; BiRefNet (MIT) bundled on-device when
a native wrapper exists. **Never a paid API, never server-side processing.**

**Context:** Remove.bg-class APIs cost per image and leak user photos to a
vendor; a server pipeline costs money at scale and contradicts the
free-forever carousel feature.

**Rationale:** $0 at any scale, photos never leave the device, no vendor
lock. The quality gap vs. hosted models is a known, accepted trade (the
shadow/reflection open problem is documented).

**Consequences:** The Pro tier cannot promise better cutouts until the native
+ BiRefNet phase. The carousel cutout is the one PNG exception to the
JPEG-only upload rule (needs alpha). The original photo is also kept
(migration 049) so removal can be re-run. Source: CAR_PHOTO_HANDOFF.md
(read it before touching the pipeline).

## ADR-006 — Aesthetic islands: bounded exceptions to the design system

**Decision:** Named surfaces may break the global design rules: Parts Bin
(kraft paper, corrugation, Caveat + Permanent Marker), Featured
(Anton/Oswald magazine layout), DIY guides (light-styled), plus the
maintenance sub-aesthetics (invoice/Courier, Windows XP, Car Wash blue).

**Context:** The product wants distinct physical "places" — a parts shelf, a
magazine, a shop invoice — and one visual system can't express them.

**Rationale:** Contained novelty adds character without eroding the global
rules, *if* the boundary is explicit.

**Consequences:** Island styling must never leak outside its routes; island
fonts (`FONT_HANDWRITTEN`, `FONT_STAMP`) are marked Parts-page-only in the
tokens file. Creating a new island requires a new ADR. Source: CLAUDE.md →
Things to Watch; BUILD_NOTES.md.

## ADR-007 — The Featured editorial engine is deterministic and brand-safe

**Decision:** Magazine copy (headlines, decks, captions) is generated by a
pure, seeded engine (`src/features/featured/engine/`): hash of car identity →
archetype/tier selection → phrase pools, with **gates** that block
brand-unsafe language (no "VTEC" on a B18B, no "Godzilla" on an HCR32).

**Context:** An LLM call per cover would cost money, drift between refreshes,
and could fabricate embarrassing copy on someone's real car.

**Rationale:** Same car → same magazine, always, offline. Gates make brand
errors structurally impossible and testable (1,000-seed negative tests).
User edits layer on top (`cars.featured_layout`, migration 055) with the
generated output snapshotted for diffing.

**Consequences:** New phrases go into pools with tests; the engine test suite
(`engine/__tests__/engine.test.ts`) is the model for all future derivation
features. Source: FEATURED.md; migrations 051–055.

## ADR-008 — Pages query Supabase directly; no service/repository layer

**Decision:** Route pages call `supabase.from(...)` directly. There is no
generalized data-access layer. Exceptions are deliberate helpers where a
boundary matters: `carPrivate.ts` (privacy), `activeCar.ts` (state sync),
`avatar.ts`, `carPhoto.ts` (upload pipelines).

**Context:** With RLS as the authorization layer and one consumer per query,
a repository layer would be indirection without protection.

**Rationale:** Queries read exactly like what they fetch; the schema is the
contract. Boundaries are added only where crossing them has a cost (privacy,
cross-device sync) — and those are constitution-enforced.

**Consequences:** Schema changes touch pages directly (grep for the table
name). If a query grows a second consumer, extract it to `src/lib/` per
Principle 6. Source: codebase survey 2026-07-07.

## ADR-009 — Grouped installs are signalled by `sessions.title IS NOT NULL`

**Decision:** A "named group" of mods (e.g. "Built Block") is a
`type='modification'` session with a non-null `title` (migration 033). No
dedicated grouping table or category column on sessions.

**Context:** Batch installs needed a display name on the Build Sheet without
restructuring the session/job model.

**Rationale:** The session envelope already groups the jobs; a title is the
smallest possible addition. Section placement is always *derived* from
`jobs.category` via `MOD_GROUPS` — never stored on the session.

**Consequences:** Code must treat `title IS NOT NULL` as the group signal and
never hard-code a category on sessions. This is a convention, not a DB
constraint — tests and review guard it. Source: CLAUDE.md → Things to Watch.

## ADR-010 — Migration numbering: 028 permanently skipped; hotfixes watermark

**Decision:** Migration files are numbered and ordered; `028` does not exist
and must never be created. Ad-hoc live-DB fixes go in `supabase/hotfixes.sql`,
whose header watermark records the last-applied migration + date. Ranged
files (`010_014_…`, `019_022_…`) cover multiple numbers; `026` has a
documented `_PRELUDE` companion.

**Context:** Migration 045 discovered that 033 had *never actually been
applied* to production while the watermark claimed otherwise — applied-state
must be tracked deliberately.

**Rationale:** A single watermark + the CLAUDE.md migration table is the
cheapest reliable record of what production actually runs.

**Consequences:** After any live migration: update the watermark, update the
CLAUDE.md table. The constitution script enforces numbering (no 028, no
dupes, no gaps). Source: CLAUDE.md → Database.

## ADR-011 — Storage layout: 6 buckets, owner-prefixed paths, JPEG-only uploads

**Decision:** Six buckets — `car-photos`, `job-photos`, `timeline-photos`,
`avatars` public; `receipts`, `car-documents` **private** (signed URLs only).
Every object path starts with `{userId}/` and follows
`{userId}/{carId}/{context}/{ts}-{rand}.jpg`. All uploads compress to JPEG
(1MB / 1920px cap) except the PNG carousel cutout (ADR-005).

**Context:** iPhone HEIC isn't universally supported; bucket policies key off
the path prefix; the delete-account Edge Function wipes `{userId}/` across
all six buckets.

**Rationale:** One path convention makes RLS-by-prefix, cleanup, and account
deletion mechanical.

**Consequences:** Never use `getPublicUrl()` on private buckets; never invent
a new path shape; new buckets need policies + delete-account coverage.
Source: CLAUDE.md → Storage Buckets, Photo Uploads.

## ADR-012 — Base units in the database; convert at display only

**Decision:** Distance stored in miles, power in hp, torque in lb-ft —
always. Display conversion happens at render/input time (`src/lib/mileage.ts`
etc.). Preferences: global per-user units, plus a per-car odometer display
unit (`cars.mileage_unit`, migration 063).

**Context:** An imported car kept in km must display km without flipping the
owner's global preference or corrupting stored values.

**Rationale:** One base unit means comparisons, reminders, and odometer sync
never mix units; conversion bugs are display bugs, not data corruption.

**Consequences:** Never store a converted value. Any new measured quantity
picks a base unit first. Source: CLAUDE.md → Unit System; migration 063.

## ADR-013 — Stale-chunk 3-layer defense for the code-split SPA

**Decision:** Every route is `React.lazy()`; a deploy replaces hashed chunks,
so a resumed old tab can request a chunk that no longer exists. Recovery is
three-layered (all in `src/lib/chunkReload.ts` + an inline `index.html`
script): global error-signature guard, `lazyWithRetry()` per route, pre-boot
inline catcher — sharing a sessionStorage reload cap so a broken deploy can't
loop.

**Context:** "`text/html` is not a valid JavaScript MIME type" errors after
deploys, including pre-boot failures no React code can catch.

**Rationale:** Each layer covers a failure window the others can't reach.

**Consequences:** The inline script is hash-allowlisted in the `vercel.json`
CSP — **editing any inline script requires recomputing its SHA-256 hash** or
production silently breaks while dev looks fine. Source: CLAUDE.md → Things
to Watch.

## ADR-014 — The verification harness and this constitution (2026-07-07)

**Decision:** Adopt the CareerOS verification model, adapted: `npm run verify`
(lint → typecheck → `scripts/constitution.mjs` → vitest) required before
every commit; GitHub Actions re-runs the gate + production build on push;
a local-only Playwright smoke suite (`npm run test:e2e`) covers boot, auth
form, and the public build page; this docs/ suite records principles and
decisions.

**Context:** G-Dimension is built across many AI sessions of varying
capability. Conventions held by memory (the active-car localStorage rule was
already violated in `GarageSnapshotPage` when the constitution first ran)
don't survive session boundaries; documents plus mechanical checks do.

**Rationale:** CareerOS proved the combination — permanent principles, an
append-only decision log, and cheap deterministic enforcement — keeps
lower-capability contributors accurate without slowing work down.

**Consequences:** New invariants ship with a check or test in the same commit.
Constitution allowlists only widen alongside a new ADR. The smoke suite stays
out of CI until flakiness risk is understood. Source: this change;
docs/TESTING.md.

## ADR-015 — Column-level anon grants on users (2026-07-10)

**Decision:** Replace the blanket `grant select on public.users to anon` (027)
with a column-level grant limited to the deliberately-public identity columns:
`id, username, display_name, avatar_url, city, country, country_code, bio,
created_at`. Migration 071.

**Context:** 015's `users_select_public` row policy has no column restriction —
its own comment said column filtering was "enforced at the app query layer."
That is not a DB-level guarantee: anyone holding the public anon key could read
every column of every non-deleted user row (email, subscription_status,
preference flags) via a direct REST call, no app involved. Surfaced while
building the visitor driver card (070) and flagged for correction by the owner.

**Rationale:** Postgres column grants close the hole at the same layer that
enforces everything else (Principle: all authorization lives in RLS/grants —
ADR-001). Verified zero breakage: the frontend has no direct anon `users`
queries, `authenticated` keeps its full grant, `public_car_profiles` executes
with owner privileges, and both anon-key serverless functions query only the
view.

**Consequences:** Any FUTURE anon-context query of `users` must select only the
granted columns (a `select=*` as anon now errors). Adding a new public profile
field means adding its column to this grant in a new migration — the grant is
now the single source of truth for what user data is public. Source: migration
071; this feedback round.

## ADR-016 — Jobs mount onto jobs (`mounted_on_job_id`) for Wheels + Tires (2026-07-02)

**Decision:** Add `jobs.mounted_on_job_id` (nullable self-FK → `jobs.id`, `on
delete set null`, + covering index) so a "mounted" part can point at the part it
sits on. First and current use: tires reference the wheels they're fitted to,
added together in the Wheels add flow. The two remain **separate `jobs` rows**;
the link is directional (the wheel is the parent). Migration 066.

**Context:** Wheels and tires are bought and sold as a set but are distinct parts
with their own specs, cost, and lifecycle. Users wanted to add them in one flow
and see them as a single item on the build sheet, while still being able to
replace tires independently later and have tire removal follow the wheels.

**Rationale:** A directional self-link models "mounted on" precisely without a
new table or a symmetric bundle concept, and keeps each part a first-class job
(cost, specs, Parts Bin, sale tracking all keep working per-item). Grouping is a
**display-only** concern — the build sheet folds the tire under its wheel via a
`mountedByWheel` map. The lifecycle cascade (Phase 2) lives in **app code, never
a DB trigger**: the `jobs_handle_removal` trigger has caused production incidents
before (see `hotfixes.sql`), so removal/replacement logic stays explicit and
visible.

**Consequences:** `on delete set null` orphans (never cascade-deletes) a child if
a parent row is ever hard-deleted; real lifecycle transitions (remove/sell/scrap)
are handled in app code. Any future "mounted" relationship (e.g. spacers on
wheels) reuses this column. Any query that lists jobs as top-level rows must
exclude rows with `mounted_on_job_id` set, or they double-count. Source:
migration 066; Wheels + Tires Phase 1 (`TuningAddPage`, `TuningBuildSheetPage`).

## ADR-017 — Car ownership transfer via offer → accept and a SECURITY DEFINER RPC (2026-07-11)

**Decision:** Transfer a car (with its full history) to another user through a
new two-party `car_transfers` table (`pending/accepted/declined/cancelled`,
14-day `expires_at`, one pending offer per car via a partial unique index) and
an `accept_car_transfer(uuid)` Postgres function — `security definer`,
`set search_path = public`, EXECUTE granted to `authenticated` only. The
recipient is identified by exact @username. Migration 072.

**Context:** Users selling a car asked to hand the build journal to the buyer
("the build history goes with the car" — also the moat behind the Phase 4
Marketplace). `cars.user_id` is the single ownership column and every child
table keys on `car_id` with 1-hop RLS, so the flip transfers everything — but
three things don't follow: `car_private.user_id` (RLS keyed on user_id, not car
ownership — the new owner would be locked out of the VIN), the old owner's
`users.active_car_id` (would dangle), and storage files under the old owner's
`{userId}/{carId}/…` prefix.

**Rationale:** The swap crosses RLS boundaries no client may cross (writing
`cars` as the losing owner, re-keying `car_private`, clearing another user's
pointer), so it must be one server-side transaction — this is the schema's
first PostgREST-exposed RPC and the app's first `supabase.rpc()` call, and it
establishes the hygiene pattern: `revoke execute … from public/anon`, grant to
`authenticated`, re-check `auth.uid()` inside (DEFINER bypasses RLS). Consent
is structural: no RLS policy can write `status='accepted'` — only the RPC can,
and only when called by the recipient. Cancel/decline are plain RLS-gated
updates made safe by a **column-level** `grant update (status, responded_at)`
(WITH CHECK can't reference the old row, so the grant is what stops rewriting
`car_id`/`to_user_id`). What transfers vs. resets: VIN + `purchase_story`/
`purchase_date` go with the car; `license_plate`, `purchase_price/_currency`,
`purchase_dealer`, `mileage_at_purchase` are the seller's private data and are
wiped in the same transaction. Storage files deliberately stay under the old
owner's prefix (URLs/paths in DB rows keep working; zero rewrites across ~8
tables); the `delete-account` edge function now skips `{userId}/{carId}`
folders whose car belongs to someone else, so a departing previous owner can't
destroy a transferred car's photos.

**Consequences:** A transferred car's files live under a prefix that isn't its
owner's — any future storage tooling (per-user quota, bucket cleanup, the
nightly purge's storage step when it's built) must resolve ownership through
`cars`, never from the path prefix. New uploads by the new owner land under
their own prefix, so a car's files can span prefixes. `public_car_profiles`
follows the owner swap automatically (it joins through `cars.user_id`).
Frontend transfer access goes through `src/lib/carTransfers.ts` (guarded,
`carPrivate.ts`-style — pre-072 everything degrades to "no offers"). Expiry is
enforced at read + accept time only; expired rows stay `pending` in the table
and are filtered everywhere, so any future direct query of `car_transfers`
must filter on `expires_at` too. Source: migration 072; 2026-07 feedback round.

## ADR-018 — DIY guide authorship (`diy_guides.created_by`) survives car transfer (2026-07-13)

**Decision:** Add `diy_guides.created_by` (nullable FK → `users.id`, `on delete
set null`) to record who authored an install guide, independent of who owns the
car. Backfill existing guides to the car's current owner. The frontend stamps
`created_by = auth.uid()` at guide creation (never on update), and both DIY
surfaces (private `TuningDiyPage`, public `PublicDiyPage`) show "Created by
@handle" only when the author differs from the car's current owner. Migration
073.

**Context:** A follow-on to the car-transfer feature (ADR-017). DIY guides had
no author column — authorship was only ever derived transitively via
`car_id → cars.user_id`. That's exactly what breaks on transfer: after a car
changes hands, a guide the previous owner wrote reads as if the new owner
authored it. Reported by the first tester.

**Rationale:** An explicit author column is the only way to keep credit stable
across a `cars.user_id` swap. It is deliberately NOT derived from `car_transfers`
history at read time — that would be fragile (a guide's creation date would have
to be correlated against transfer dates, and a car can pass through several
owners) and needlessly heavy for a display-only credit. `on delete set null`
keeps the guide (owned via `car_id`) alive if the author later deletes their
account, dropping only the credit line. The backfill sets `created_by` to the
current owner because pre-migration guides carry no real authorship record — so
a guide on a car that was **already** transferred before 073 is (unrecoverably)
credited to the new owner; going forward every new guide is stamped correctly.
The read helper (`src/lib/diyAuthor.ts`) is guarded carPrivate-style and the
create-path insert falls back to an author-less insert on `PGRST204`/`42703`, so
the deploy-before-migration window never breaks guide creation. No new grants or
RLS: `created_by` is a column on an existing table (059's table-level grants +
RLS already cover it) and is attribution, not access control — row access still
keys on `car_id → cars.user_id`.

**Consequences:** "Created by @handle" is the first cross-owner attribution in
the app; any future authored-content type (if guides ever gain co-authors, or
other user content becomes transferable) should follow this same explicit-author
pattern rather than deriving from ownership. The credit is silent for the common
untransferred case (author == current owner). Source: migration 073; the
2026-07 feedback round.

## ADR-019 — "SOLD" ghost cars: a dedicated durable table for the seller's keepsake (2026-07-13)

**Decision:** When a car is transferred away (072), insert a row into a new
`car_ghosts` table capturing a **frozen identity snapshot** (year/make/model/
variant/trim/nickname/color/garage_photo_url) + seller/buyer + sold_at. The
seller sees it as a read-only "SOLD" ghost in their garage and (locked) on
their public profile; they can archive it (`archived_at`). Public display goes
through a definer view `public_sold_cars`; the ghost is written inside the
`accept_car_transfer` RPC. Migration 074.

**Context:** The clean handoff in 072 flips `cars.user_id` to the buyer, so the
seller loses the car entirely — it vanishes from their garage. The owner wanted
the opposite feeling: selling a car you loved shouldn't erase it. A ghost keeps
it around as "the car as you knew it," with a link to the new owner's evolving
build.

**Rationale — why a dedicated table, not columns on `car_transfers`:**
Durability. `car_transfers.car_id` is `on delete cascade`, so if the buyer ever
hard-deletes the car (7-day soft-delete → nightly purge) the sale row — and any
snapshot on it — would vanish, destroying the seller's keepsake. `car_ghosts`
has `car_id ... on delete set null`, so the snapshot **outlives the car**. It
also avoids FK surgery on the live `car_transfers` table and cleanly separates
"seller's sale ledger" from "transfer offers." **Snapshot, not live read:** the
seller no longer owns the car (RLS), and a live read would break the moment the
buyer sets it private — a frozen snapshot is a keepsake the buyer can never
alter or erase, matching the intent. Inserts happen only inside the RPC
(SECURITY DEFINER) — there is deliberately no insert grant/policy, mirroring how
`accept` itself is structurally gated; the only client write is
archive/unarchive via a column-level `grant update (archived_at)`. Public
visibility uses the `public_sold_cars` **definer view** (ADR-003 gateway; never
`security_invoker`), so the base table stays owner-only.

**Consequences:** Ghosts live in a separate table keyed on `seller_id`, so they
never inflate `getProfileStats` (Cars/Mods/Photos). A car sold twice by the same
seller (bought back then resold) yields two ghosts — acceptable edge case. If
the buyer deletes their account, `buyer_id` nulls and the ghost shows without a
"@handle" / Visit-Build link (snapshot still stands). The public side + shareable
"sold to @B" link/unfurl are a second phase built on the same table + view.
Source: migration 074; the 2026-07 feedback round.
