# G-Dimension Engineering Principles

Permanent rules that bind every contributor — human or AI. They exist so that
work done in a hundred separate sessions still adds up to one coherent product.
Follow them unless a revision is explicitly recorded in
[DECISION_LOG.md](DECISION_LOG.md).

Companion docs: [DECISION_LOG.md](DECISION_LOG.md) (why things are the way they
are), [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md) (how to build here),
[TESTING.md](TESTING.md) (how correctness is verified), `../CLAUDE.md` (the
operational manual), `../MASTER_ARCHITECTURE.md` (the product spec — wins on
every conflict).

---

## 1. The doc hierarchy is law

`MASTER_ARCHITECTURE.md` is the product spec, design system, and data model in
one file — **it wins on every conflict**. `CLAUDE.md` is the operational manual
(conventions, gotchas, watch-items) and must be read before any session.
`BUILD_NOTES.md` holds per-feature build state — read the relevant section
before touching that feature. Feature deep-dives (`FEATURED.md`,
`CAR_PHOTO_HANDOFF.md`, `supabase/migrations/AUTH_SETUP.md`) must be read
before touching their areas. Never act on memory of these docs — read them.

## 2. Design tokens are canonical

All colors, fonts, spacing, and animation values come from
`src/tokens/index.ts`. Never hardcode them. The non-negotiables (CLAUDE.md →
Non-Negotiable Design Rules): `border-radius: 0` on architectural elements,
no pure-white body text, the typography zones (Hanken Grotesk for UI,
Cormorant Garamond for display moments only, never in Tuning), 44×44px tap
targets. **Aesthetic islands** — Parts Bin (kraft paper, Caveat + Permanent
Marker) and Featured (Anton/Oswald magazine look) — are deliberate, *named*,
*bounded* exceptions (ADR-006). Their styles must never leak outside their
routes, and no new island may be created without a new ADR.

## 3. The privacy boundary is absolute

VIN, license plate, and purchase price live in `car_private` (migration 061)
and are accessed **only** through `src/lib/carPrivate.ts` — the `cars`
public-read RLS policy exposes every column of a public car to the anon key,
which is exactly why those columns were moved out. `receipts` and
`car-documents` buckets are PRIVATE — signed URLs only, never
`getPublicUrl()`. The public surface (`/builds/:username`) is served
exclusively through the `public_*` views — they are an intentional
SECURITY DEFINER gateway; **never convert them to `security_invoker`** (it
breaks production). RLS is enabled on every user table; new tables get RLS +
explicit PostgREST grants before any code references them.
Enforced mechanically: `npm run constitution` (privacy checks).

## 4. Database discipline

Migrations are numbered, ordered, additive, and idempotent. `028` is a
permanently skipped slot — never fill it. After a migration is confirmed
applied to the live DB: update the watermark in `supabase/hotfixes.sql` and
add the migration to the CLAUDE.md table. Before **any** SQL change runs
against the live DB, present the full verification chain and a plain-English
explanation of what it does and why it is safe — no exceptions. New `public`
tables need explicit grants (`authenticated`, plus `anon` for public reads).

## 5. Deterministic core

Derivation logic — the Featured editorial engine, category→group mapping,
unit conversion — is pure and deterministic: same input, same output, offline.
The Featured engine is seeded by car identity so a car's magazine never
changes between refreshes (ADR-007). New derivation features follow the same
shape: a pure engine module with co-located tests, no network inside.

## 6. Logic lives in lib/ and engines, not pages

Anything two pages need lives in `src/lib/` (or a feature engine like
`src/features/featured/engine/`) — the moment a second consumer appears,
extract. Single sources of truth are sacred: `buildGroups.ts` for mod
grouping, `activeCar.ts` for active-car state (never touch its localStorage
key directly), `mileage.ts` for unit conversion, `tokens/index.ts` for design
values. Pages are consumers. Direct Supabase queries in pages are the accepted
convention (ADR-008) — the boundary is *shared logic*, not data access.

## 7. Photo pipeline hard rules

Car photo background removal is 100% client-side (RMBG-1.4 via
Transformers.js/WASM): **no paid API, no server-side processing — ever**
(ADR-005, `CAR_PHOTO_HANDOFF.md`). All photo uploads compress to JPEG before
upload; the single exception is the background-removed carousel cutout, which
is PNG (needs alpha). Storage paths follow
`{userId}/{carId}/{context}/{ts}-{rand}.{ext}` — nothing else.

## 8. Every commit is a release

Work lands on `main` only — no feature branches, no PRs, no force-push,
append-only history. Vercel deploys every push automatically. Therefore:
**`npm run verify` must pass before every commit** (lint, typecheck,
constitution, unit tests). GitHub Actions re-runs the same gate on push; a red
X means production received a broken commit — fix forward immediately. Base
units in the database are permanent: miles, hp, lb-ft — convert at display
time only, never store converted values.

## 9. Working discipline

Verify before committing. Record significant decisions in
[DECISION_LOG.md](DECISION_LOG.md) *before* the work merges — a decision that
isn't written down will be re-litigated and half-reversed by a future session.
When you add an invariant ("X only happens in Y"), add a constitution check or
a test in the same commit — an unenforced invariant is a future bug. Never
widen a constitution allowlist to make a failure go away; fix the code, or
record an ADR that changes the rule.
