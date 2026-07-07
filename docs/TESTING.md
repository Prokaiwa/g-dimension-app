# G-Dimension Testing Guide

What we test, how, and why. The philosophy is ported from CareerOS: a
deterministic core verified by cheap, dependency-light checks that run before
every commit — not a coverage-percentage chase.

Companion docs: [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md) →
Verification strategy, [ENGINEERING_PRINCIPLES.md](ENGINEERING_PRINCIPLES.md)
§5 (deterministic core), [DECISION_LOG.md](DECISION_LOG.md) ADR-014.

---

## The three layers

| Layer | Tool | Scope | Runs |
|---|---|---|---|
| Unit tests | Vitest | pure logic in `src/lib/` + feature engines | `npm run test`, CI |
| Constitution | `scripts/constitution.mjs` | repo-wide architectural boundaries | `npm run constitution`, CI |
| Smoke E2E | Playwright | app boots, routes work, public profile serves real data | `npm run test:e2e`, local only |

### What we deliberately do NOT test

- **Styling/visuals** — the design system is enforced by tokens + review, not
  snapshots (inline styles make DOM snapshots pure noise).
- **Supabase itself** — RLS policies are verified at migration time via the
  DB verification protocol (Principle 4), not mocked in JS. No Supabase mocks:
  a mocked policy proves nothing about the real one.
- **Page components** — pages are thin consumers (Principle 6); their logic
  should be extracted to `lib/` and tested there instead.

## Unit tests (Vitest)

- Co-located: `src/lib/foo.ts` → `src/lib/foo.test.ts`. Feature engines use a
  `__tests__/` directory (see `src/features/featured/engine/__tests__/`).
- Config: `vitest.config.ts` — Node environment, dummy `VITE_SUPABASE_*` env
  so the Supabase client can initialize at import time without network.
- Patterns to follow (all live in the Featured engine suite, the house
  reference): fixture builders (`makeProfile()`, `makeMod()`), determinism
  checks (call twice, deep-equal), range/shape invariants, and mass negative
  tests ("never produces X across 1,000 seeds") for anything that must be
  structurally impossible.
- When adding an engine or helper: test determinism, null/edge inputs, and
  every invariant you'd otherwise write in a comment.

```bash
npm run test          # single run (CI mode)
npm run test:watch    # watch mode while developing
```

## Constitution checks

`npm run constitution` — a zero-dependency Node script that greps the repo for
boundary violations (the full list and the no-silent-widening rule live in
[IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md)). It found a real violation
on its first run; treat a failure as a bug in the code, not in the check.

## Smoke E2E (Playwright)

`npm run test:e2e` starts a Vite dev server on port 5199 (via
`playwright.config.ts` `webServer`) and runs `e2e/smoke.spec.ts` in Chromium:

- `/` redirects anonymous visitors to `/login`
- `/login` renders the email + password form
- `/terms` (public legal page) renders content
- an unknown route boots without uncaught exceptions
- `/builds/scantee` renders real data — proving router + Supabase anon read +
  RLS + the `public_car_profiles` view all work together

The dev server uses the real Supabase project with the anon key from
`.env.local`; every test is read-only and login-free. Each test traps
`pageerror` events, so an uncaught exception anywhere fails the test.

**Local-only by design** (ADR-014): CI has no `.env.local`, and browser tests
against a live backend flake in ways unit tests don't. If it graduates to CI
later, that's a new DECISION_LOG entry. First install on a new machine:
`npx playwright install chromium`.

### Extending the suite

Add specs to `e2e/*.spec.ts` (Playwright's glob; Vitest only sees
`src/**/*.test.ts`, so the two runners never collide). Keep smoke tests
login-free and read-only; authenticated flows would need a dedicated test
account and belong in a separate spec file with its own ADR-recorded plan.

## CI

`.github/workflows/ci.yml` runs lint → typecheck → constitution → unit tests
→ production build on every push/PR to `main`, with dummy Supabase env vars
(build-time only — CI never contacts the real project). Vercel deploys
independently of CI, so a red X means production already has the bad commit:
fix forward, immediately.
