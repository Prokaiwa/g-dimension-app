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

## ADR-020 — Column-level anon grants are the boundary, not the query layer (2026-07-28)

**Decision:** Every table reachable by the anon key must carry a **column-level**
`grant select (...) to anon` listing exactly the columns the public surfaces
consume. A row-level RLS policy is necessary but never sufficient. Migration
081 applies this to `public.jobs`, the last table still holding a table-wide
anon grant.

**Context:** A live-database probe during the 2026-07-28 end-to-end pass found
that anon could read every column of any job belonging to a public car:

```
GET /rest/v1/jobs?select=parts_cost&parts_cost=not.is.null
→ 33 rows, $23,828 of other users' spend
```

plus `cost`, `labor_cost`, `sale_price`, `sale_date`, `part_number`,
`condition`, `install_mileage`, and the donor/fabrication fields. The
`jobs_public_read` policy (076) was doing its job correctly — it restricts
which ROWS anon sees — but a row policy cannot restrict COLUMNS, and the
underlying grant was still table-wide.

The intent had been correct everywhere and enforced nowhere: `CLAUDE.md`
promises "Build Sheet (brand + title + category — no costs)";
`cars.show_investment_publicly` exists to keep the investment total private,
which is meaningless if per-job costs can be summed straight off REST; and
`api/og.js` carries the comment "select just the public columns — brand /
title / category, NEVER costs". Three statements of the rule, all implemented
as *what the app happens to ask for*. The anon key ships in the JS bundle by
design, so anyone can ask for something else.

**Rationale:** This is the same failure ADR-015 fixed for `users` (migration
071 replaced a blanket grant with the public identity columns) and that 076
fixed for `sessions`, `job_links` and `cars`. `jobs` was missed in that sweep —
076 rewrote its *policy* and never revisited its *grant*. Making the grant the
single source of truth means a future page cannot accidentally widen the
boundary by selecting a new column: the request fails until someone adds the
column in a migration, which is a reviewable act.

Note the ordering trap: `grant select (cols)` layered on top of an existing
table-wide grant narrows nothing. The revoke must come first.

**Consequences:** Adding a public-facing field to `jobs` now requires a
migration amending the grant — deliberate friction on the privacy boundary. A
verification sweep of every anon-reachable table (same session) found the rest
already correct: `job_photos`, `job_links`, `timeline_entry_photos`,
`timeline_entry_links`, `job_specs`, the `diy_*` tables, `cars`, `sessions` and
`users` all deny `select=*`. `timeline_entries`, `part_types` and
`spec_templates` remain table-wide on purpose — every column in them is
already public by design. That sweep is the check to repeat whenever a table
gains an anon policy. Source: migration 081.
*(Superseded in part by ADR-021 — that sweep's conclusion was wrong; see there.)*

## ADR-021 — Public-read tables need a grant AND a role-scoped owner policy (2026-07-28)

**Decision:** A table is only genuinely public-readable when **both** hold: anon
has a `select` grant on it, **and** every other permissive policy on that table
is scoped to a role (`alter policy … to authenticated`). Migration 082 applies
this to the seven tables that had a correct `*_select_public` policy and were
still returning `42501` to anon.

**Corrects ADR-020.** That entry's closing sweep concluded every other
anon-reachable table was "already correct" because each denied `select=*`.
That conclusion was wrong, and the reason is the reusable lesson: **a `42501`
on `select=*` is ambiguous.** It means *either* "correctly column-scoped" *or*
"anon cannot read this table at all", and I read it as the former for every
table. Re-testing each table with **the columns its public page actually
selects** exposed seven that were entirely blocked. The right check is not
"does `select=*` fail" but "does the real public query succeed **and** does a
sensitive column fail" — both directions, every time.

**Context:** Loading `/builds/:username` as a real anonymous visitor showed
public mod photos, public mod specs, public timeline-note media and **the whole
public DIY guide feature** rendering empty. All seven tables already had correct
public policies, so nothing about the intent was wrong. Two independent
mechanical faults:

1. **Missing grant** (`job_photos`, `job_specs`). Both predate the 2026-05-30
   Supabase grant change and were only ever granted to `authenticated`.
   PostgREST checks grants *before* RLS, so a perfectly good public policy never
   executes. Diagnostic signature: the error names the table you asked for.
2. **Owner policy not role-scoped** (all seven). Each owner policy is `for all`
   with no role, and permissive policies are OR'd — so anon evaluates the owner
   policy too. Those policies subquery `cars.user_id`, a column anon's
   column-level `cars` grant (053/076) deliberately excludes, so evaluation
   raises **"permission denied for table `cars`"** on a request for a completely
   different table. That misdirection is why this survived so long.

**Rationale:** Scoping the owner policy to `authenticated` costs nothing — anon
can never satisfy `cars.user_id = auth.uid()` because `auth.uid()` is null. And
this was already the established fix: migration 076 applied exactly
`alter policy … to authenticated` to `sessions` and `job_links`, which is
precisely why those two worked while the other seven did not. 076 was a partial
sweep; 082 finishes it.

Grants in 082 are **table-wide**, deliberately unlike 081's column-level grant.
These tables hold photo URLs, spec keys/values and DIY step text — no financial
or identifying data — and 047/059 already intended table-wide anon access. The
tables that do carry sensitive columns (`jobs`, `sessions`, `users`, `cars`)
stay column-scoped.

**Consequences:** "Has a public policy" is not evidence a table is publicly
readable. Any new public-facing table needs all three — policy, grant, and
role-scoped owner policy — and the only trustworthy verification is loading the
real page as an anonymous visitor. Two opposite bugs (081 too wide, 082 too
narrow) were found in the same session on the same boundary, which is the
argument for testing the boundary from the outside rather than reasoning about
it from the migrations. Source: migration 082.

---

## ADR-022 — The `authenticated` role is a public role too (2026-07-29)

**Decision:** `public.users` now carries a **column-level** `grant select (...)`
for `authenticated`, not just for `anon`, and `email` is excluded from it. The
owner's own email is read from the auth session (`supabase.auth.getUser()`),
which is where it actually lives. Migration 083.

**Context:** Driving the live app from a throwaway account created for testing,
a routine `select username, active_car_id` against `/rest/v1/users` came back
with **all 28 rows** rather than one. Widening the select confirmed the rest:

```
GET /rest/v1/users?select=username,email
→ 28 rows, every real address in the beta
```

`anon` is correctly blocked (`42501`) — migration 071 closed that in ADR-015.
But 071's own header records the reasoning that let this survive: *"authenticated
role: untouched (keeps 027's full select + update — own profile reads
PROFILE_COLS incl. email, which stays fine)."* That is true of what the **app**
asks for and false of what the **database** allows. `users` has two permissive
select policies, and `users_select_public` (015) carries no role clause:

```sql
users_all_owner      for all    using (auth.uid() = id)
users_select_public  for select using (deleted_at is null and username is not null)
```

Permissive policies are OR'd, so a signed-in user matches every non-deleted row,
and 027's table-wide grant then hands over every column. 015's own comment
concedes the column filtering is *"enforced at the app query layer"*.

**Rationale:** This is the third instance of one failure — ADR-015 (`users`,
anon), ADR-020 (`jobs`, anon), and now `users` again for `authenticated`. The
lesson the first two encoded was "a row policy cannot restrict columns." The
lesson this one adds is narrower and easier to miss: **`authenticated` is not a
trusted role.** Anyone can sign up, so the gap between anon and authenticated is
one email address, and any table with an unscoped public-read policy leaks to
signed-in users exactly as it would to anonymous ones. A grant reasoned about
via "our queries only ever ask for the owner's row" is not a boundary.

`email` could be dropped outright rather than moved because `public.users.email`
was only ever a mirror of `auth.users.email`, with a single consumer (the
owner's own Profile row). The session already holds the canonical value, so the
fix removed a query rather than adding a view.

**Deliberately still readable** by `authenticated`: `subscription_status` (the
free/pro badge is shown on profiles anyway) and the display/preference columns
(needed by the owner on every load, and not PII). Cross-user reads that
legitimately need identity columns keep working unchanged — the car-transfer
@handle lookup, the transfer/ghost sender-recipient embeds, DIY authorship
credit, and the username-availability check all use `username` / `display_name`.

**Consequence — the maintenance cost is real and worth stating:** like 071 for
anon, this grant is now the single source of truth for what a signed-in user can
read off `users`, *including its own owner*. A column added to the table is
invisible until it is added here. That is the intended trade: widening the
boundary becomes a reviewable act instead of a side effect of a new `select`.

**Note on how it was found:** not by reading migrations — 071 reads as though it
closed this — but by running one query from a real second account. The ADR-021
conclusion applies unchanged: the only trustworthy verification of a data
boundary is crossing it from the outside. Source: migration 083.

---

## ADR-023 — Moderation reuses `is_public` instead of a thirteenth visibility rule (2026-07-29)

**Decision:** Ship the App Store Guideline 1.2 foundation — report, block,
account-level consequences, username blocklist — as migration 084. Moderation
hiding is implemented by flipping `cars.is_public` and remembering the owner's
original value, guarded by a trigger, rather than by adding a
`moderation_hidden_at is null` condition to every public RLS policy.

**Context:** 1.2 requires four things of any app with user-generated content: a
filtering method, a report mechanism with timely response, the ability to block
abusive users, and published contact info. The trigger for this work was the
social layer, but the finding that mattered is that **1.2 already applies**:
`/builds/:username` publishes photos, bios, handles, nicknames and stories to
anyone, so the requirement lands at the first submission and is not gated on
follows existing.

Twelve RLS policies gate the public surface, and every one of them already tests
`cars.is_public = true`. The obvious implementation — add a second condition to
all twelve — means restating twelve policies correctly. That is precisely what
went wrong twice in one week on this exact boundary: 081 (grant too wide, leaking
other users' spend) and 082 (policies too narrow, blanking the public DIY
feature). ADR-021's conclusion was that this boundary is verified by crossing it,
not by reasoning about it.

**Rationale:** Reusing `is_public` inherits a code path that was already driven
end to end as an anonymous visitor on 2026-07-28. No new reasoning, no twelve-way
consistency to maintain, and a future public table added to the app is covered
the moment it respects `is_public` like everything else does.

The approach has one obvious hole — the owner simply re-ticks "Public" on the
Edit Car screen — and `cars_moderation_guard` closes it: while
`moderation_hidden_at` is set, `is_public` is forced back to false and the flags
themselves cannot be changed by the owner. One trigger instead of twelve
rewrites. RLS could not express this, because the rule is "you may update this
row, but not these columns to that value", which is a column-and-value
constraint, not a row predicate.

The guard needed one subtlety worth recording: moderation's own writes run as
the **reporter**, who is correctly not an admin, so a naive guard reverts the
very hide it exists to protect. Moderation writes therefore announce themselves
with a transaction-local `gdim.moderation` setting.

**Auto-hide is the compliance mechanism, not the email.** Severe reports
(nudity/hate/violence/illegal) hide the build immediately, before any human
looks. A solo operator cannot promise a takedown SLA that depends on being
awake, and App Review itself may be the reader. Judgement-call categories
(harassment, spam, impersonation) queue instead, because an instant takedown is
the wrong default when the question is contested. The lever is the **car**, not
the individual photo: per-photo hiding would mean new columns and new conditions
on several more public policies, which is the sprawl this ADR exists to avoid. A
wrongly-hidden build is one tap from restored; objectionable content live during
review is a rejection.

**The username blocklist lives in the database, not a JSON file in the repo.**
This was the owner's initial instinct and it had a hole: `handle_new_user()`
(038/042) mints a public handle from the local part of the signup email, so a
profane address becomes a profane handle without ever touching a form. A
client-side list cannot see that path. The list is calibrated for car culture —
`shit` and `bitch` are exact-match rather than substring, because "shitbox" is
affectionate and "Bitchin' Rides" is a real show. Over-blocking handles in a
build journal is a worse failure than the mild profanity it would catch.

**Rejected: client-side NSFW image screening (NSFWJS/TensorFlow.js).** Proposed
and argued down on four grounds. It compounds an unmeasured ~24MB WASM payload
(BUILD_NOTES already flags the background-removal bundle). It is bypassable by
construction, since the Storage write is a separate authenticated call from the
check. Its `sexy` class fires on car-show photography, which is genuinely part of
the culture. And it is nudity-only, missing gore and hate symbols — the higher
rejection and liability risk. If automated screening is ever wanted it belongs
server-side on upload, and only in response to real abuse.

**Consequence:** admin actions are RPCs that re-derive `is_admin` from
`user_flags` server-side, so `/admin/reports` holds no privilege of its own and
the service-role key stays out of the moderation path entirely. And with
moderation in place, the Phase 7 blocker is lifted: public follows with counts no
longer need to be deferred (see MASTER_ARCHITECTURE Part 29). Source: migration
084.

---

## ADR-024 — Follows are public because moderation exists (2026-07-30)

**Decision:** Ship following as a **public** relationship with visible counts
(migration 086), not the private bookmark recommended earlier the same day.
Blocking is enforced in the RLS insert policy, in both directions.

**Context:** The user's problem, in their words: *"if you see someone's profile
it's very easy to lose and then you can never follow them again."*

The first recommendation was a follow visible only to the follower — functionally
a bookmark. That was not a product judgement; it was a way to **avoid depending
on moderation**, because a follow the followee can see creates a status metric, a
notification surface and a harassment vector, and `MASTER_ARCHITECTURE` Part 29
had parked the whole social layer on exactly that basis: *"a social layer without
moderation is a liability, not a feature."*

Then 084 (ADR-023) built moderation — report, block, auto-hide, suspension,
admin queue — because App Store Guideline 1.2 required it independently of
anything social. That removed the constraint, and the private version would now
have been a worse product for no remaining benefit. So the recommendation was
**inverted deliberately**, not abandoned: the reasoning that produced it no
longer held.

**Rationale for the specifics:**

- **Read is public.** Counts cannot work otherwise, and a follow is a public act
  in every app that has one. The consequence is stated in the migration header
  rather than left to be discovered: the graph is enumerable with the anon key,
  as it is on Instagram and Twitter. Making lists private later is a policy
  change, not a schema change.
- **The pair is the primary key.** Following is idempotent for free — a
  double-tap raises `23505` instead of creating a second edge or inflating a
  count. An edge has no identity of its own, so there is no surrogate id.
- **Blocking lives in the RLS insert policy, checked both ways.** This is the
  payoff for having built 084 first. A block that only hides a button is not a
  block; enforcing it in the UI would have meant the database still permitted the
  follow. Verified live: block → follow refused with `42501`, unblock → follow
  succeeds.
- **Counts and the list go through definer functions.** They stay correct
  regardless of the 071/083 column grants on `users`, they filter suspended and
  deleted accounts next to the query rather than in the page, and they keep
  working if follows ever stops being publicly readable.
- **085's lesson applied up front rather than rediscovered.** This database
  grants `authenticated` full DML on new public tables, so 086 does `revoke all`
  before granting exactly select/insert/delete. An edge is created or destroyed,
  never edited.

**The anon path is the feature, not a nicety.** A logged-out visitor is the
person most at risk of losing a build they just found — the exact complaint. So
tapping Follow while signed out parks the handle, routes to signup, and the app
carries them **back to that profile and completes the follow**. Three details
that matter:

1. `localStorage`, not `sessionStorage` — email confirmation can complete in a
   different tab, which would drop a session-scoped intent and lose precisely the
   user this exists to keep.
2. **Single-use**, so a completed follow cannot loop, and the `?follow=1` param
   is stripped after completing so a refresh cannot re-run it.
3. **A 24-hour TTL.** Generous enough for email confirmation, but an intent that
   fired days later would yank someone to a profile they had forgotten about —
   worse than quietly dropping it.

**Known gap, deliberately not solved here:** there is still **no discovery
anywhere in the app** — no search, no browse; `/builds/:username` is reachable
only via a link someone hands you. Follow keeps people you already reached; it
does not help you find anyone. That is the next piece, and it is why follow alone
should not be mistaken for "the social layer". Source: migration 086.

---

## ADR-025 — Moderation gets a voice, and suspension gets an inverse (2026-07-30)

**Decision:** Every moderation action files a `user_notices` row for the affected
owner, surfaced at `/notifications` and through the existing attention glow. The
**reporter is deliberately never notified.** `admin_unsuspend_user` and
`/admin/suspended` give suspension the inverse it shipped without. Migration 087.

**Context:** 084 gave moderation teeth but no voice. An action landed and the
person it landed on was never told — a hidden build simply went quiet, and a
suspended account looked indistinguishable from the app being broken. Worse,
`admin_suspend_user` had no inverse at all: a one-way destructive action sitting
between two safe ones, reversible only by hand-written SQL.

**Rationale:**

- **Notices are stored text, not derived at read time.** A notice is a record of
  what someone was told on a date. Regenerating the wording later from current
  state would quietly rewrite history once a car is renamed or deleted — which is
  exactly the property that makes it useful in an appeal.
- **There is no INSERT policy on `user_notices` at all.** The only writer is the
  definer function `notify_user`, whose EXECUTE is revoked from every client
  role. A user cannot forge having been told something, and `update` is
  column-scoped to `read_at` so they cannot rewrite what it says.
- **The reporter is told nothing after "report sent."** This matches Instagram
  and is the safer default: telling a reporter their target was actioned turns
  reporting into a scoreboard, and telling them it was dismissed invites
  argument. Nothing is concealed — 084 already lets an author read their own
  report's `status` — it simply isn't pushed at them.
- **Restoring always reads `moderation_prev_public`, never assumes public.** Both
  dismiss and unsuspend put each car back to the visibility its owner had chosen.
  A car that was private before an auto-hide must not be published by the act of
  clearing a bad report.
- **One attention count, not per-feature badges.** `lib/attention.ts` sums unread
  notices (everyone) and open reports (admins) and returns the breakdown, so the
  avatar ring, the Notifications row and the Admin row can never disagree.
  Anything added later — follows, transfers — adds in here rather than growing a
  parallel system. This is the in-app stand-in for push: when the app is native,
  it becomes the local mirror of what was pushed and the surfaces reading it
  don't change.

**Consequence:** the suspended user now sees a banner on their own Profile,
readable only because 084 added `suspended_at` to the 083 column grant. That
grant is load-bearing in a way worth remembering — without it an account cannot
see its own status, and the suspension is indistinguishable from a bug.

Source: migration 087.

---

## ADR-026 — Reporting reaches the photo, but the lever is still the car (2026-07-30)

**Decision:** A long press on a photo or a Timeline card on any `/builds/*` page
opens the same report sheet ADR-023 shipped. The **target** is the most specific
row the database can resolve on its own: `photo` for a `job_photos` row,
`timeline_entry` for a Timeline entry, and `car` everywhere else. Frontend only.
No migration.

**Context:** 084 built four target types and the UI only ever sent one. Every
report in the system said `car`, filed from a single button behind the avatar
chip on the profile. That is a defensible mechanism and a bad discovery path:
the first thing anyone does with objectionable content — a reviewer included —
is press the image itself, and pressing it did nothing at all.

**Rationale:**

- **A hook, not a shared viewer.** The public pages have no common photo
  component: `PublicModDetailPage` and `PublicEntryDetailPage` each hand-built a
  pager, the Build Sheet has a pinch-to-zoom hero, the timeline has cards, and
  the private `ImageCarouselLightbox` is not used out here at all. Unifying them
  would have meant rewriting four gesture implementations to add a menu.
  `useReportLongPress` hands back press handlers and leaves every viewer exactly
  as it was.
- **Only target types the trigger can resolve.** `content_reports_autohide`
  walks `photo` → `job_photos.car_id` and `timeline_entry` →
  `timeline_entries.car_id`. A `timeline_entry_photos` row or a
  `diy_step_photos` row has no such path, and a Build Sheet section photo is a
  *column on `cars`*, not a row at all. Sending those as `photo` would file a
  report with a null `target_owner_id` — an orphan in the queue pointing at
  nothing. Those surfaces report the car, which is what moderation acts on
  anyway (ADR-023: the lever is the car, not the photo). Verified live: a photo
  report and a timeline-entry report both resolved `target_owner_id` correctly.
- **Signed in only, matching the button next to it.** `PublicProfilePage` has
  always hidden "Report this build" from anonymous visitors. Letting a hold open
  the sheet for anon produced a genuine dead end — reason picked, details typed,
  then "Sign in to report." at the very end (observed, then closed). The hold is
  now inert when signed out, exactly like the button. The cost is real and worth
  naming: a logged-out visitor cannot report anything. Reversing that means
  giving the sheet a sign-in path, not just re-enabling the press.
- **The hold announces itself where there's room.** Both fullscreen viewers
  already print "swipe down to close"; they now print "hold to report" beside
  it. An affordance nobody can see is not a mechanism, and this is the one place
  on these pages with a caption line to borrow.
- **Blocking is offered on the person, not the thing.** `ReportSheet` grew a
  `blockLabel` prop for exactly this: without it the block step read "Block this
  photo".

**Consequence:** the report sheet is now reachable from six pages instead of
one, and `content_reports` will start carrying a mix of target types. The admin
queue already renders all four (084) and resolves each back to its car, so
nothing downstream changes. `PublicFeaturedPage` is deliberately **not** wired:
its page-turn owns the gesture layer, and every photo it shows is reachable and
reportable at its source (section photos on the Build Sheet, entry photos on the
Timeline, the cover on the Garage).

Source: `src/hooks/useReportLongPress.tsx`.

---

## ADR-027 — The migration log leaves CLAUDE.md (2026-07-31)

**Decision:** The per-migration table moves out of `CLAUDE.md` into
`supabase/migrations/MIGRATIONS.md`. `CLAUDE.md` keeps only the migration facts
that apply to work not yet written: the missing `028`, the PostgREST grant
requirement for new `public` tables, and the revoke-before-grant ordering trap.
The current range and last-applied watermark are stated in exactly two places
that already had to be maintained (`MIGRATIONS.md` and the `hotfixes.sql`
watermark comment), and nowhere else.

**Context:** `CLAUDE.md` had reached 83 KB, of which 44 KB was the migration
table — 66 rows, some of them paragraphs. The whole file is loaded before every
session, so the table was the single largest standing cost in the project, paid
on every task whether or not it touched the database. An audit the same day
found the prose in good health (five stale claims in 466 lines, all fixed in
`84f7eee`), so the problem was never rot. It was genre: a changelog had been
accumulating inside an instruction file.

**Rationale:**

- **Instructions and records want different lifetimes.** A rule earns its place
  by shaping work that hasn't happened yet. A record of what migration 067 did
  is worth keeping and worth finding, but it does not steer the next commit, and
  it should be read when a specific table's history is in question — not
  preloaded 66 rows deep, every session, forever.
- **The traps were the part actually worth preloading.** Three facts in that
  table were rules wearing history's clothing, and each had already cost
  something. Revoke-before-grant is the clearest: 071, 081 and 083 each exist to
  fix a version of it, and it fails in the worst possible direction — the grant
  reads as restrictive while the table stays open. That belongs where it is seen
  before someone writes SQL, not in the row for the migration that got it wrong.
- **Duplication is the real decay mechanism, not age.** The range lived in three
  places. Two of them disagreed *during this work*: the Key File Map's copy was
  deduplicated in `909f6df` while a concurrent session bumped the Database
  section's copy to 090 in `1602398`. Neither was careless. Any fact stated
  twice will eventually be updated once, so the fix is structural — state it
  once, and say out loud in `CLAUDE.md` that it is deliberately not repeated
  there.
- **Verbatim move, verified.** All 66 rows were relocated with `sed` and the
  extracted rows diffed byte-for-byte against the originals before committing.
  Nothing was summarized, and no row was rewritten in transit.
- **This entry instead of edits.** Four docs pointed at "the CLAUDE.md migration
  table"; `README`, `MASTER_ARCHITECTURE`, `FEATURED` and — the one that
  mattered — `IMPLEMENTATION_GUIDE` step 4, which *instructs* you to add a row
  there, were repointed. Three references remain in this log, at ADR-014,
  ADR-016 and the entry on unit storage. They were left exactly as written,
  because this file is append-only and a stale citation in a historical record
  is a smaller harm than a rewritten one. This entry is where the trail picks
  back up.

**Consequences:** `CLAUDE.md` drops to 39 KB, roughly halving what every session
pays before reading a line of code. Adding a migration now touches
`MIGRATIONS.md` rather than `CLAUDE.md`; `IMPLEMENTATION_GUIDE.md` step 4 says
so. The cost is one more hop for anyone tracing a column's history, which is the
right trade for a lookup that is occasional and deliberate. It does **not**
license trimming `CLAUDE.md` on a schedule: the same audit found the remaining
prose accurate and load-bearing, and most of it is knowledge no model can
re-derive from the code — which two buckets are private, that `/` serves
`marketing.html` and not the React app, that the details sheet morphs the real
card rather than a replica.

Source: `supabase/migrations/MIGRATIONS.md`; commit `efbd1f1`.

---

## ADR-028 — The public build pages are pre-rendered, and the copy uses the searcher's words (2026-07-31)

**Decision:** Two changes, one problem. (1) `api/og.js` pre-renders the real
content of **every** public build room into `#root`, not just the build sheet:
the profile hub, `/garage`, `/timeline` and `/featured`, each with crawlable
`<a>` links to its siblings and a per-build `WebPage` + `Vehicle` JSON-LD.
(2) The marketing copy, `llms.txt` and the `SoftwareApplication` blocks now
carry the category phrases people actually type — "mod tracker", "vehicle
service history tracker", "project car" — in the title, the description, the
visible hero line and three new FAQ entries.

**Context:** Searching for the app the way a stranger would returns nothing from
`gdimension.app`. The one result that surfaces G-Dimension at all is a
ClubLexus forum post the owner wrote; the entire discoverable footprint is
third-party user-generated content. The category queries return a crowded and
recent field (Track My Mods, CarJourney, Garagelog, ModBinder, DynoLog,
Trackara, RevvLog) with G-Dimension absent.

**Rationale:**

- **An empty `<div id="root">` is not a page.** `/sitemap.xml` lists roughly a
  hundred build URLs. Before this, four of every five served literally no text:
  the build-sheet injection shipped alone, and the hub, garage, timeline and
  featured rooms were bare shells. Google renders JavaScript only on a deferred
  second pass it is free to skip, and the AI answer engines — GPTBot,
  PerplexityBot, ClaudeBot, OAI-SearchBot — do not execute JavaScript at all.
  Those pages hold the only content on the whole domain that is genuinely
  unique and genuinely growing. They were invisible to exactly the engines this
  project's `robots.txt` goes out of its way to welcome.
- **The room links are half the point.** The SPA's own navigation is
  JS-rendered, so a non-JS crawler that reached a build had no path to the rest
  of it. Real `<a>` elements between the five rooms are what turn a set of
  orphan URLs into a crawlable structure.
- **You cannot rank for a phrase that does not appear on the page.** The site
  described itself, everywhere, as a "build journal". That is what we call it,
  and it is better writing than "mod tracker" — but nobody types it. The words
  a searcher uses have to be *on the page*, in the title and the visible copy,
  not only in the `keywords` meta tag Google has ignored since 2009. The
  positioning did not change; the vocabulary did, and the two now coexist.
- **The title leads with the category, not the brand.** `Car Mod Tracker &
  Build Journal for Enthusiasts | G-Dimension` inverts the old order. Brand-first
  titles work for brands people search for. Nobody searches for this one yet,
  which is the whole problem being solved.
- **Nothing new is exposed.** Every block reads through the same anon key, views
  and RLS the public React pages already use, selects only public columns, and
  respects `show_buildsheet_publicly` / `show_timeline_publicly` /
  `show_featured_publicly` — a room the owner switched off gets no block at all.
  Costs, receipts, VIN, plate and purchase price are not in any select here.

**What this does not fix:** ranking is mostly earned off-site. A five-month-old
domain with no inbound links does not reach page one on a technical change, and
the remaining work — links from the forums and communities the owners already
post in, and content pages that answer the questions searchers ask before they
are looking for an app — is not code.

**Consequences:** `api/og.js` now issues up to two Supabase reads per build
request (car, then mods or timeline), cached at the edge for five minutes. The
per-room title and description must stay distinct, because `roomCanonical()`
makes each room independently indexable and identical text would put five pages
of one build in competition with each other. Unit conversion factors are
restated in `api/og.js` because `api/` is plain JS outside the Vite bundle and
cannot import `src/lib/unitConversion.ts`; both copies carry a note saying so.

Source: `api/og.js`, `public/marketing.html`, `public/llms.txt`, `index.html`;
commit `435fa1c`.

---

## ADR-029 — Moderation gets its own read path, not an exception in the public one (2026-07-31)

**Decision:** An admin reviewing a hidden build reads it through
`admin_review_car()`, a `security definer` function returning one jsonb blob,
rendered at `/admin/review/:carId`. **No public policy or view gains an admin
branch.** Every look writes a `moderation_reviews` audit row. Migration 091.

**Context:** ADR-023 chose to reuse `is_public` rather than invent a thirteenth
visibility rule, so hiding a build flips one boolean and every existing public
policy honours it for free. The consequence nobody costed is that **no reader is
exempt from that flag, the admin included.** The gate is checked in
`public_car_profiles`'s own `WHERE` clause and in fourteen row policies across
twelve tables; `is_admin` appears in none of them.

So reviewing a severe report meant: dismiss it, look, hide it again. Which is
not merely awkward:

- **Dismissing republishes the content.** `admin_dismiss_report` restores
  `moderation_prev_public`, so material severe enough to auto-hide goes back to
  the open internet for the length of the review.
- **The owner gets two contradictory notices.** Dismiss files *"We reviewed the
  report and found no problem. Everything is back to normal."* The re-hide files
  *"...breaks the content rules in our Terms."* Cleared, then not. ADR-025 built
  that notice system specifically to be trustworthy to someone in a dispute, and
  this made it lie to exactly that person.

**Rationale:**

- **Not `or public.is_admin(...)` on the public policies.** Fifteen edits to the
  boundary protecting every user's data, for one person's benefit; an `is_admin`
  subquery in the hot path of every anonymous read; and the loss of the property
  that makes that boundary auditable at all. Today it is one flag with no
  exceptions. Every future audit would otherwise have to ask "and does the admin
  branch hold here too?" The blast radius is wrong for the problem.
- **The column list is the security control, not the definer boundary.** A
  definer function reading tables it doesn't own is exactly where this codebase
  has been bitten: 081 leaked `parts_cost`/`sale_price` to anon, 083 leaked 28
  beta emails, both through a grant wider than the intent. The standing rule for
  anyone extending 091: **never wider than what a visitor would see if the build
  were public.** Nothing from `receipts`, `car_documents`, `car_private`,
  `user_contacts`. No cost, price, VIN, plate or purchase price. A judgement
  about nudity or hate needs pixels and prose, never somebody's finances.
  `select *` is banned in that function permanently.
- **A moderation view, not a copy of the public pages.** Even if admin-visible
  public pages were free, they'd be the wrong tool: a reviewer wants every photo
  on the car in one grid with the reported one ringed and every piece of free
  text under it, not a magazine spread to navigate. The fix is better than the
  thing it replaces, which is how you know it isn't a workaround.
- **Read-only, deliberately.** Dismiss, hide and suspend stay in the queue, so
  there remains exactly one place where moderation decisions are taken.
- **Audited.** Reading a private build is privileged. `moderation_reviews` has
  no policies and `revoke all` from both client roles — this DB grants
  `authenticated` full DML on new public tables by default (085's lesson), so
  without the revoke the audit trail would be editable by the people it audits.
- **Storage needed nothing.** `car-photos`, `job-photos` and `timeline-photos`
  are public buckets: hiding a build hides the *rows*, not the files. Handing
  back URLs is enough for the images to render.

**Consequence:** hiding is now a decision an admin can make *after* looking
rather than before, and the notice history stops containing retractions that
were never really retractions. A related gap is now visible and deliberately
left open: because those buckets are public, a photo URL that leaked before a
hide still resolves. Hiding controls discovery, not distribution. Fixing that
means private buckets and signed URLs for all user media, which is a much larger
change than this one and should be its own decision.

Source: migration 091, `src/pages/AdminReviewPage.tsx`.

---

## ADR-030 — Search reads the public view, so it cannot leak (2026-07-31)

**Decision:** `/discover` is a public search over people and builds, backed by
two `security definer` functions that read **`public_car_profiles`** — the same
view every `/builds/*` page reads. Both are granted to `anon`. Migration 092.

**Context:** there has never been a way to find anything in this app. No search,
no browse, no index. The only route to a build was someone handing you the URL,
which is the complaint that started the follows work in the first place. 086
gave people a way to *keep* a build; this is the missing half.

**Rationale:**

- **Searching through the public view is a structural guarantee, not a careful
  one.** `public_car_profiles` is where `is_public`, deleted cars, deleted users
  and suspended owners are already enforced (084). Reading through it means
  search *cannot* surface a build the site would not already show — there is no
  code path for it to get that wrong. Had these functions queried `cars`
  directly they would have re-implemented the visibility rule, and a duplicated
  rule drifts. This is the same lesson as 090's `target_car_hidden`, which
  re-derived a lookup instead of reusing one and was silently wrong for a year's
  worth of report types.
- **Public, unlike every other definer RPC here.** The pages it points at are
  readable signed out, so gating the way *in* would mean only people who already
  have an account can find anything. Signing in is for following, not looking.
- **Only people with a public build are findable.** `/builds/:username` needs
  one; surfacing a handle whose profile then says "not available" is a worse
  answer than no answer.
- **`word_similarity`, not `similarity`.** The haystack is a whole label like
  "2006 lexus ls 430 big body". Plain `similarity()` compares the needle against
  the *entire* string, so the typo "lexis" scored 0.11 and the fuzzy tier never
  fired once — the feature looked implemented and did nothing. `word_similarity`
  scores against the best-matching run of words and gives 0.50. Gated on
  `length >= 3`, because a single character scores 0.5 against nearly anything.
  Both numbers were measured on a scratch cluster, not guessed.
- **The landing page shows what is actually there.** Model chips are grouped
  from real cars and "worked on lately" is ordered by real timeline activity. At
  39 builds a "trending" or "recommended" list would be fiction, and inventing
  one would mean the first thing a new user sees is the least honest thing on
  the site.

**Consequences:** search is a sequential scan of the view, which is free at this
size and will not stay free. The fix when it stops being free is a materialised
search table refreshed on write — not an index, which a view cannot use. Second,
`vehicle_search_aliases` (018) is now load-bearing for the first time: it has
sat unused since it was written, and enthusiast shorthand ("evo", "mitsu") only
resolves for entries that exist in it. Adding aliases is now a product decision
with a visible effect rather than dead reference data.

Source: migration 092, `src/lib/discover.ts`, `src/pages/DiscoverPage.tsx`.

---

## ADR-031 — A follow notifies through a trigger, not the client (2026-07-31)

**Decision:** Following someone files a `new_follower` notice in their inbox,
written by a `security definer` trigger on `follows`. `user_notices` gains
`actor_id`; `notify_user` gains an `actor` parameter. One notice per follower
per 30 days. Migration 094.

**Context:** follows have been silent since 086. You could gain followers and
never know, which makes a social feature one-directional and gives the person
being followed no reason to come back. The inbox (087) and the single attention
count (ADR-025) already existed and were used only by moderation.

**Rationale:**

- **A trigger, because the client is not permitted to do this and should not
  be.** `notify_user` has EXECUTE revoked from `anon` and `authenticated`
  deliberately (087) so that nobody can forge having been told something or
  write into someone else's inbox. That rules out the app sending it, correctly:
  a notice that depends on the client remembering to send it is a notice that
  goes missing on a dropped connection, and one that the client *can* send is
  one a modified client can spam.
- **`notify_user` is dropped and recreated rather than replaced.** Adding a
  parameter to an existing function creates a second **overload**, not a
  replacement, and two candidates differing only by a defaulted trailing
  argument is an ambiguity waiting to be hit. The four existing five-argument
  callers keep working untouched because plpgsql resolves the call at run time
  — verified explicitly rather than assumed.
- **Dedupe at 30 days.** Unfollow/refollow is otherwise a free way to put
  yourself at the top of someone's inbox as many times as you like. `actor_id`
  exists for this as much as for the link.
- **The body is stored, the link is derived.** ADR-025 established that a notice
  is a record of what someone was told on a date, so the text is frozen. The
  tap-through is resolved from `actor_id` at read time instead, because a handle
  can change and the link should go wherever that person is *now* rather than to
  a 404. Those two rules look contradictory and aren't: one preserves history,
  the other preserves a working link.
- **Follow moved into the search results.** Finding someone and keeping them
  were two separate journeys — open the profile, open the permit, then tap
  Follow. The button now sits on the result row, at the moment intent is
  highest. Optimistic, because on a list you are scanning a round trip of dead
  time reads as a broken tap; it reverts on failure. Signed out it parks the
  intent and routes to signup, the same path the public profile already uses.

**Consequences:** `user_notices` now carries notices that are not about
moderation, so anything reading `kind` must not assume restriction — the
Notifications screen already branches on it. The client reads the actor's handle
through a PostgREST embed, which 400s before 094 exists; `getNotices` falls back
to the plain select rather than showing an empty inbox on a stale deploy.

Source: migration 094, `src/lib/notices.ts`, `src/pages/DiscoverPage.tsx`.

---

## ADR-032 — A new function beside the old one, not a replacement (2026-07-31)

**Decision:** `/followers` ships with two new RPCs — `follower_list`, and
`following_list_v2` which is 086's list plus a `follows_you` flag. **086's
`following_list` is left untouched** and used as a client-side fallback.
Migration 095.

**Context:** 086 shipped "people I follow" and never its inverse, so you could
gain followers with nowhere to see them. 094 then began sending "You have a new
follower" — a notice pointing at a room that did not exist.

**Rationale:**

- **Adding an OUT column means DROP and CREATE** (090 already learned this), and
  a drop is not safe here the way it was there. **A deploy is not atomic with a
  migration**: the page and the function are versioned separately, and a browser
  holding yesterday's bundle keeps calling the old signature for as long as that
  tab lives. Dropping `following_list` would have broken the Following screen
  for everyone mid-flight, to save one function. The new name costs nothing and
  removes the window entirely; the client tries v2 and falls back.
- **The viewer comes from `auth.uid()`, never a parameter.** Both functions
  report a relationship relative to whoever is calling. If the viewer were an
  argument, anyone could ask "does X follow Y" about two other people. Passing
  it would have been marginally simpler and quietly turned a definer function
  into an oracle about strangers.
- **Blocks hide the person from the reader, but the follow edge stays.** 086
  gates new follows on blocks; it does not delete existing ones. So the list
  filters at read time, in both directions, rather than pretending the edge is
  gone. Verified both ways round.
- **`follows_back` and `you_follow` are different questions** and both are
  needed. On your own followers list they coincide. On someone else's they do
  not: `follows_back` is about the list's owner, `you_follow` is about you.
  Collapsing them would render the wrong button the moment follower lists become
  visible on a public profile.
- **Follow back lives on the row.** Same argument as the search results: the
  screen exists to act on, and routing every action through a profile visit is
  the friction that made following feel like work.

**Consequences:** there are now two functions doing nearly the same job. That is
deliberate and should stay until there is no plausible client left on the old
signature — at which point `following_list` can be dropped in its own migration,
with the client fallback removed first, in that order.

Source: migration 095, `src/pages/FollowersPage.tsx`.

---

## ADR-033 — Fuel is an odometer feature wearing a fuel feature's clothes (2026-08-05)

**Decision:** add fuel logging (migration 097: `fuel_entries`, `users.volume_unit`).
Capture is a **grip at the foot of the Home map** that opens a bottom sheet, not
a sixth node and not a route. Browsing is **`/fuel`, a third tile inside
Maintenance**. The economy chain lives in `src/lib/fuel.ts` as pure functions.

**Context:** fuel is the biggest gap against every competitor in the category and
the most-searched term in it (`docs/STORE_LISTING.md` §5). But the reason to
build it now is internal. `urgencyOf()` in `GarageRemindersPage` reads
`cars.current_mileage`; when that is null a mileage reminder never bumps past
`upcoming`, printing "at 90,000 mi" with its telltale dark, and when it is stale
it prints a confident "in 3,000 mi" from a months-old number. The odometer is
written from the car edit form and from four opt-in checkboxes buried mid-form
(the migration 041 pattern), all of which only fire when a mod or a service is
logged. That is a few times a year. A fill-up is every ten days.

**Rationale:**

- **The map keeps five nodes.** A pump was mocked in four positions, on the road
  and off it, inside the loop and outside. All four failed, and the useful
  explanation is not proportional: the map is made of NOUNS, five places you go,
  and a fill-up is a VERB. No amount of repositioning turns one into the other.
  Placement on the bottom road also left about 27pt of clearance to each
  neighbour, and a node's tap area is larger than its art.
- **The grip is the affordance, and it carries the state.** A long-press was the
  first answer and it is invisible; worse, it sat on the map's most-tapped target
  where a drifted hold navigates to the Garage. A grip has exactly one meaning on
  a phone, so nothing has to be taught, and unlike a gesture it can be DRAWN in a
  second state: after ten days without a fill-up it warms to `COLOR_ACCENT` and
  becomes the only warm pixel on the screen. Not a badge or a dot — the thing
  that catches the eye is already the thing you press. It sits below the wordmark
  in the foot band, off the composition entirely.
- **Capture cannot be a route.** `App.tsx` prefetches the Home chunk
  immediately; a `/fuel/new` route is in none of the prefetched chunks, so the
  pump case would pay `RouteFallback` plus a network fetch plus `ProtectedRoute`'s
  session round-trip. At a pump on bad signal that is the whole feature. A sheet
  inside the already-warm Home chunk is the only genuinely fast path. Mount it as
  a sibling of the stage: the world carries `transform`/`willChange` and the
  stage carries `perspective`, and a `position: fixed` sheet inside either
  anchors to it rather than the viewport.
- **Browsing splits from capture by frequency.** A chart and a log are not a
  ten-second job and do not belong in the sheet. Maintenance's hub is a
  hand-placed diagonal of two objects and absorbs a third gracefully, where the
  map's balanced five-node loop does not.
- **Economy is computed BETWEEN two full fills, and both break flags are needed.**
  `is_full = false` rolls volume forward; `is_missed = true` restarts the chain.
  One boolean cannot carry both, and without the second a forgotten fill-up
  silently reports roughly double the real economy for the tank after it. The
  anchor of a span supplies only an ODOMETER, never its own volume — that tank
  was burned before the span opened — which is why a full fill with unknown
  volume can still anchor. All of it is pure and unit-tested (23 cases).
- **`users.volume_unit` is a real column, not a display toggle.** US and imperial
  gallons differ by about 20%, so "gallons" is not one unit. And L/100km INVERTS
  the direction of better, which is why `higherIsBetter()` is exported as a
  predicate rather than left for each caller to remember.
- **Averages are total distance over total fuel**, not the mean of the per-tank
  figures, which would weight a 90-mile tank the same as a 400-mile one. Cost per
  mile excludes the first fill, the correction Drivvo applies, because that tank
  was bought before the measured span opened.

**Consequences:** the differentiator is not the fill-up form, which everyone has.
It is fuel folded into the cost of ownership the app already tracks and already
hands to the next owner. `/fuel` leads on that block for exactly that reason, and
it should carry into the build report. Nothing here is public: no `anon` grant,
and cost has never been inside the `/builds/*` boundary.

Source: migration 097, `src/lib/fuel.ts`, `docs/FUEL_LOG_RESEARCH.md`,
`design/fuel-mockup/`.

---

## ADR-034 — Fuel economy has four spellings, and three of them are derivable (2026-08-11)

**Decision:** add `users.economy_unit` (migration 099), nullable, where **NULL
means "derive"**. `resolveEconomyUnit()` in `src/lib/fuel.ts` falls back to a
guess made from the distance and volume units the user has already set, and
`Settings > Units > Economy` pins it explicitly for the one case that cannot be
guessed.

**Context:** 097 shipped `volume_unit` and the app went on showing every user US
MPG. That is coherent right up to the moment anyone picks litres, at which point
the sheet asks for 45 L and answers 25.2 mpg. `src/lib/fuel.ts` had carried
`mpgToUnit`, `economyLabel` and `higherIsBetter` since day one, tested and
entirely unused, waiting for this.

**Rationale:**

- **Three cases fall out of what is already known.** miles + US gallons is MPG
  (US). miles + imperial gallons is MPG (imperial). miles + litres is *also* MPG
  (imperial), because that combination is the UK, which buys fuel by the litre
  and has never stopped quoting economy in gallons of its own size.
- **The fourth does not.** km + litres is L/100km in Canada, Australia, New
  Zealand and most of Europe, and km/L in Japan, India and much of Latin America.
  Same distance unit, same volume unit, opposite conventions. No derivation can
  choose, so the user does. L/100km takes the default as the larger bloc.
- **They are not two scales of one number.** L/100km **inverts** which of two
  figures is the better one. That is why `higherIsBetter()` is a predicate rather
  than a comment, and why the chart on `/fuel` scales its bars by raw MPG rather
  than by the printed figure: taller must always mean thriftier, or half the
  world reads the chart upside down.
- **Nullable, not defaulted to `mpg_us`.** A stored `'mpg_us'` cannot be told
  apart from a deliberate choice of US MPG, so a default would freeze the guess
  for everyone who had already opened the app and make it permanently
  unimprovable. Null is the only value that means "we have not been told".
- **The two columns are fetched in separate queries** (`src/lib/fuelUnits.ts`).
  `users` has no table-wide select grant, and PostgREST refuses the whole row if
  any named column is ungranted — so folding them into one select would make a
  missing `economy_unit` take `volume_unit` down with it during the window
  between a deploy and its migration.

**Also in this change, at the owner's direction:** `/fuel` now wears the exact
Service/Detail construction (full-bleed background, flat black header with the
date chips) rather than its own, and the "What this car has cost you" block is
**gone**. Splitting spend across mods, service and fuel was the one comparison no
competitor could build, and it was still wrong in a room about fuel — being told
what your turbo cost belongs in the build report, where the whole car is the
subject. The fuel total survives as the third LCD window.

Source: migration 099, `src/lib/fuel.ts`, `src/lib/fuelUnits.ts`,
`src/pages/FuelPage.tsx`, `src/components/FuelSheet.tsx`.

---

## ADR-035 — A fill-up is a cost, so it carries receipts (2026-08-12)

**Decision:** fuel entries become editable and deletable, capture gets a second
door on `/fuel`, and receipts attach to a fill-up through the **existing**
`receipts` table (migration 100: `session_id` becomes nullable, `fuel_entry_id`
joins it, exactly one parent enforced by CHECK).

**Context:** 097 shipped fuel logging as insert-only. Every other record in the
app — mods, parts, sessions, timeline notes — has an edit path, and fuel needed
one more than most of them: a typo'd odometer poisons **two** tanks, the one it
ends and the one it starts, and there was no way to correct it.

**Rationale:**

- **One sheet, three doors.** Edit reuses `FuelSheet` rather than getting its own
  form. The fields, the validation, the column ceilings and the live economy
  preview are all rules that have to stay in step with `lib/fuel`; a second form
  would be a second copy of them, and the copies drift. The grip on Home, the FAB
  on `/fuel`, and a tap on any row in the log all open the same component.
- **The row being edited is excluded from its own preview.** It is already in the
  `recent` array the sheet receives, so leaving it there would measure the draft
  against the stored version of itself — a zero-mile span for the commonest edit,
  which is correcting the odometer you just typed.
- **The existing receipts table, not a new one.** `receipts` already owns the
  PRIVATE bucket, the signed-URL rule, the owner-only RLS keyed on `car_id`, and
  the account data export. A `fuel_entry_photos` table beside it would be a
  second answer to a solved question, and the export would quietly miss half of
  a user's receipts.
- **A fill-up is not a session.** `receipts.session_id` was NOT NULL, and the
  cheap route would have been to manufacture a `sessions` row per tank. That
  would put a phantom entry in Maintenance every ten days, with no jobs, no shop
  and no timeline. So the column becomes nullable and gains a sibling, which is
  the shape `job_id` already had one level down.
- **CASCADE, not SET NULL.** `job_id` is SET NULL because a receipt for a removed
  part still belongs to its session. A fuel receipt has no other parent and the
  one-parent CHECK would reject the orphan, so it goes with the entry. The app
  deletes the storage OBJECTS first — a cascade cannot reach into the bucket, and
  deleting the rows first would strand the files with nothing pointing at them.
- **The car_id trigger is a security control, not a convenience.** RLS on
  `receipts` joins `cars` on `receipts.car_id` (015), so a row with a null
  `car_id` is invisible to everyone including its owner. The trigger now resolves
  the car through either parent and raises rather than returning null, including
  on the branch that the CHECK currently makes unreachable.

**Also fixed here:** the `/fuel` empty state keyed off the CHART's list, which
filters out the first entry because it has no economy figure yet — so a log with
exactly one fill-up in it announced that it was empty, directly above the
fill-up.

**One consequence that only showed up after the migration ran:**
`GarageDocumentsPage` lists EVERY receipt on the car, by `car_id`. Migration 100
therefore put fuel receipts on a screen that had never seen one, and because a
fill-up receipt has a null `job_id` it fell into the **Services** list and
rendered as a "Service" receipt titled "Service". Fixed by giving fuel its own
group there — "Fuel · n", titled "Fill-up" with the odometer and the fill-up's
own date — rather than by hiding them, since the Documents screen is exactly
where a user goes looking for a receipt. Worth remembering as a shape: adding a
second parent to a shared table changes every screen that reads that table
WITHOUT filtering by parent.

Source: migration 100, `src/components/FuelSheet.tsx`, `src/pages/FuelPage.tsx`,
`src/pages/GarageDocumentsPage.tsx`.

---

## ADR-036 — The notch is a layout constant, and it goes through a variable so it can be tested (2026-08-13)

**Decision:** every top header bar grows by the top safe-area inset instead of
sitting under it, and the inset is read through the CSS custom property
`--safe-top` (defined once in `src/index.css` as
`env(safe-area-inset-top, 0px)`) rather than through `env()` at each call site.
`HEADER_HEIGHT_SAFE` and `SAFE_TOP` in `src/tokens/index.ts` are the only
spellings the app uses. `viewport-fit=cover` **stays**.

**Context:** the app ships to the App Store as a Capacitor build, and `index.html`
sets `viewport-fit=cover`, which means the WKWebView fills the physical screen
and CSS `y=0` is the top of the display. iOS then paints the status bar over
whatever is there. Of 46 header bars, exactly one padded for the inset. A probe
across 20 routes (`test-results/safearea.mjs`) found content inside the
status-bar band on **all 20**, a tap target on **18**, and on **17 the back
chevron was 100% covered** — the entire 44x44 target under the notch. Since the
design has no tab bars and the `‹` chevron is the only way back, the native app
would have been close to unnavigable.

**Why it survived 845 commits:** it is invisible in every environment the project
can actually run. Mobile Safari puts the page below the browser chrome, so the
inset is 0. The installed PWA sets `apple-mobile-web-app-status-bar-style` to
`black`, which keeps content clear. Both of those are true and both are
irrelevant to Capacitor, where the `apple-mobile-web-app-*` metas are Safari
web-clip hints that mean nothing. The one runtime that breaks is the one that
had never been looked at, and this Mac (macOS 12) cannot build it — Capacitor 8's
SPM iOS project needs Xcode 15+, which needs macOS 14.5+.

**Rationale:**

- **The header grows; it does not get padded.** `box-sizing: border-box` is
  global, so `paddingTop` on a fixed-height header steals from its content
  instead of moving it down. The pair is therefore
  `height: HEADER_HEIGHT_SAFE` (= `calc(44px + var(--safe-top))`) **and**
  `paddingTop: SAFE_TOP`, which lands the content box back at exactly 44px.
  `LegalLayout` had the padding without the height and so was quietly squashing
  its own header on any notched device; this fixes that too.
- **Growing beats offsetting, because the background comes along.** The header's
  black fills the status-bar band rather than leaving a gap above it, and the
  full-bleed art on Maintenance/Fuel/Service is a sibling drawn *behind* the
  header, so nothing about the edge-to-edge look changes. That is the whole
  reason `viewport-fit=cover` stays.
- **33 of 46 headers are in normal document flow**, so growing one reflows
  everything below it with no arithmetic. Only 7 sites offset content by
  `HEADER_HEIGHT` explicitly, and those take `HEADER_HEIGHT_SAFE`.
- **A variable, not `env()`, because `env()` cannot be overridden and a variable
  can.** This is the load-bearing part. There is no simulator here, no notched
  device in CI, and `env(safe-area-inset-top)` resolves to 0 in every browser we
  can drive — which is precisely how the bug got in. Routing through
  `--safe-top` lets a test force the value to 47px and assert that nothing
  interactive is left in the band, so the guarantee is mechanical rather than a
  line in BUILD_NOTES asking someone to remember. A fix nobody can regression-test
  is a fix with a shelf life.

**Rejected — `@capacitor/status-bar` with `setOverlaysWebView(false)`:** five
lines, and it only touches the runtime that is broken. But Capacitor's own docs
do not state whether that method works on iOS (they note only that it is gone on
Android 15+), and staking the fix on an unconfirmed API, on a machine that cannot
build iOS to check, is the worst of both. It would also give the native app a
solid status-bar band while the web stayed edge-to-edge — two different-looking
products out of one codebase.

**Rejected — dropping `viewport-fit=cover`:** one line, genuinely correct, and it
fixes the notch everywhere at once. It also letterboxes every screen top and
bottom, and turns the 47 existing `safe-area-inset-bottom` usages into no-ops.
The full-bleed cinematic treatment is most of what stops this reading as a
generic web app; paying for a bug fix with it is the wrong trade.

**Consequence:** `--safe-bottom` is defined alongside `--safe-top` for symmetry
but nothing is migrated to it — the 47 `safe-area-inset-bottom` call sites work
and are not worth the churn. New bottom-anchored UI should prefer the variable.
On-device confirmation is still owed before submission, but it is now a
confirmation rather than a discovery.

Source: `src/index.css`, `src/tokens/index.ts`, 46 header sites, 7 offset sites,
`test-results/safearea.mjs`.

---

## ADR-037 — A printed QR must not encode anything the owner can change (2026-08-14)

**Decision:** printed trading-card QR codes point at `/c/:carId`, a new public
route keyed on the car's immutable UUID that resolves the current handle and
redirects to the canonical `/builds/:username/garage`. The card generator no
longer prints a `/builds/*` URL directly.

**Context:** `DevTradingCardsPage` encoded
`gdimension.app/builds/{username}/garage?car={id}`. Usernames are editable in
`ProfilePage`, behind a full availability-checking edit sheet. Physical cards
were about to be printed and mailed.

**Rationale:**

- **A printed object cannot be patched.** Every other URL in the app is
  recoverable: a broken link gets fixed on the next deploy. A QR code on a card
  in someone's hand is permanent, so it can only encode facts that are also
  permanent. The car UUID is; the handle is not.
- **The failure is worse than a dead link.** A freed handle can be claimed by
  someone else, so a stale card would not 404, it would resolve to a
  **stranger's garage**. Silent and wrong beats loud and broken only when the
  wrongness is harmless, and this is not.
- **Resolution goes through `public_car_profiles`.** The same view every
  `/builds/*` page reads, so the route cannot expose a car the public garage
  would not. A private or deleted car resolves to nothing, which is correct.
- **Shorter payload, better scan.** `/c/{uuid}` is roughly half the characters
  of the old URL, so the QR drops several density versions. At the 0.4in the
  card allows, that is the difference between scanning first time and not.

**Rejected — a redirect table keyed on old handles:** keeps `/builds/*` in the
QR and remaps historical handles. It works until someone changes their handle
twice, or until a freed handle is reclaimed, at which point the table has to
decide between two legitimate owners. The UUID never has that argument.

**Rejected — freezing usernames once a card is printed:** solves it in the
database and breaks a reasonable user expectation. Nobody should lose the
ability to rename themselves because of a decision the app made about
cardboard.

**Consequence:** `/c/:carId` joins the public route family and is included in
the two `isPublic` checks in `App.tsx` (music gating, chunk prefetch), so a
scanned card warms the public world rather than Home. Per-car OG tags are NOT
wired for `/c/*` yet: `api/og.js` keys on the `/builds/*` path shape, so a `/c/`
link shared in a message shows the default card until that is extended.

Source: `src/pages/CarPermalinkPage.tsx`, `src/pages/DevTradingCardsPage.tsx`,
`src/App.tsx`.
