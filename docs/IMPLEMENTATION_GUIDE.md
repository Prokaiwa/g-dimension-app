# G-Dimension Implementation Guide

How to build on G-Dimension without breaking it. Written for any contributor —
including AI assistants of any capability — arriving cold.

Companion docs: [ENGINEERING_PRINCIPLES.md](ENGINEERING_PRINCIPLES.md) (the
rules), [DECISION_LOG.md](DECISION_LOG.md) (the why), [TESTING.md](TESTING.md)
(the proof), `../CLAUDE.md` (operational manual), `../MASTER_ARCHITECTURE.md`
(product spec — wins on conflicts).

---

## Read order (before writing any code)

1. `CLAUDE.md` — conventions, git rules, watch-items. Always.
2. `MASTER_ARCHITECTURE.md` — before any new screen or feature.
3. `BUILD_NOTES.md` — the section for the feature you're touching.
4. Area deep-dives when relevant: `FEATURED.md` (magazine),
   `CAR_PHOTO_HANDOFF.md` (photo pipeline),
   `supabase/migrations/AUTH_SETUP.md` (auth/domains).
5. This docs/ suite for rules, decisions, and testing.

## Verification strategy

**Before every commit:**

```bash
npm run verify        # lint → typecheck → constitution → unit tests
```

Every push to `main` deploys to production (ADR-014, Principle 8), so a
commit that skips `verify` ships unverified code to real users. For larger
changes also run:

```bash
npm run verify:full   # verify + production build
npm run test:e2e      # Playwright smoke suite (local dev server + real Supabase reads)
```

What each stage catches:

| Stage | Command | Catches |
|---|---|---|
| Lint | `npm run lint` | unused vars, hook-dependency mistakes, unsafe patterns |
| Typecheck | `npm run typecheck` | type errors across all tsconfig projects |
| Constitution | `npm run constitution` | architectural boundary violations (below) |
| Unit tests | `npm run test` | broken pure logic, engine determinism, mapping drift |
| Build | `npm run build` | anything Vite/Rollup rejects that dev mode tolerates |
| Smoke | `npm run test:e2e` | boot crashes, router breakage, dead public profile |

GitHub Actions (`.github/workflows/ci.yml`) re-runs lint → typecheck →
constitution → test → build on every push. **A red X on GitHub means a broken
commit is already deployed — fix forward immediately.**

## The constitution checks (`scripts/constitution.mjs`)

Mechanical enforcement of boundaries from the principles. Current checks:

- `car_private` queried only via `lib/carPrivate.ts` (Principle 3, ADR-004)
- no `service_role` key material anywhere in `src/`
- `MOD_GROUPS`/`CATEGORY_TO_GROUP` defined only in `lib/buildGroups.ts`
- localStorage key `gdim_chosen_car_id` referenced only in `lib/activeCar.ts`
- `import.meta.env` only in its three seams (`supabase.ts`, `App.tsx`, `errorTracking.ts`)
- raw `fetch()` only in its allowlisted files (`avatar.ts`, `buildPdf.ts`, `sound.ts`)
- migration numbering: no `028`, no duplicates (026 PRELUDE pair excepted), no gaps

**Never widen an allowlist to silence a failure.** Fix the code; if the rule
itself is wrong, record a new ADR in [DECISION_LOG.md](DECISION_LOG.md) first,
then change the check in the same commit. When you introduce a *new*
invariant, add a check for it here (or a test) in the same commit.

## Playbooks

### Adding a page/route

Create `src/pages/YourPage.tsx`; register it in `src/App.tsx` as a
`React.lazy()` route inside the existing `<Suspense>` (code-splitting is the
pattern — see ADR-013). Wrap in `<ProtectedRoute>` unless it is deliberately
public (the only public surfaces today: `/builds/*`, `/terms`, `/privacy`,
auth pages). Style from `src/tokens/index.ts`; obey the Non-Negotiable Design
Rules in CLAUDE.md. Back navigation: `‹` chevron top-left, linear.

### Adding a lib helper / engine

Pure logic goes in `src/lib/` with a co-located `.test.ts`. Bigger derivation
features follow the Featured engine shape: a directory under `src/features/`
with a pure engine, typed pools/config, and a `__tests__/` suite including
determinism checks (double-call equality) and negative tests for anything
that must never happen.

### Adding a migration

1. Next sequential number (never `028`). Idempotent (`if not exists` guards).
2. New `public` tables: enable RLS, write policies, and add explicit grants —
   `grant select, insert, update, delete on public.<table> to authenticated;`
   (+ `grant select ... to anon;` only for deliberately public data).
3. Present the full verification chain + a plain-English explanation before
   it runs against the live DB (Principle 4).
4. After it's confirmed applied: update the `hotfixes.sql` watermark and add
   a row to the CLAUDE.md migration table.
5. If the public surface changes, refresh the `public_*` view in the same
   migration (see 051–055 for the pattern) — never grant anon table access.

### Touching the Featured magazine

Read `FEATURED.md` first. New copy goes into the engine pools with tests;
respect the gates (brand-unsafe language must stay structurally impossible).
User editorial overrides live in `cars.featured_layout` — captions are keyed
by stable photo keys, never URLs.

### Touching the photo pipeline

Read `CAR_PHOTO_HANDOFF.md` first. Hard rules: client-side only, no paid
API, no server. JPEG compression for all uploads except the carousel PNG
cutout. Paths: `{userId}/{carId}/{context}/{ts}-{rand}.{ext}`.

### Editing inline scripts in index.html / marketing.html

Recompute the script's SHA-256 hash and update the CSP in `vercel.json`, or
production silently blocks it while dev looks fine (ADR-013). This has caused
a real incident.

## Git & deploy

`main` only; no branches, no PRs, no force-push; every session lands its work
on `main` before ending (full rules in CLAUDE.md → Git Rules). Vercel deploys
each push. Commit per coherent change with a descriptive message, after
`npm run verify` passes.
