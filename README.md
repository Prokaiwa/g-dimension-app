# G-Dimension

A car build journal PWA — garage, build sheet, maintenance log, timeline, and
an auto-generated magazine feature for every car. Live at
[gdimension.app](https://gdimension.app).

React 18 + Vite + TypeScript · Supabase (Postgres/Auth/Storage) · Vercel
(auto-deploy from `main`).

## Documentation map

Read in this order; on conflicts, the earlier doc wins.

| Doc | Answers |
|---|---|
| `MASTER_ARCHITECTURE.md` | What is the product? Routes, design system, data model. **Wins every conflict.** |
| `CLAUDE.md` | How do we work here? Conventions, git rules, gotchas, migration table. Read before any session. |
| `BUILD_NOTES.md` | What state is each feature in? Read the section you're touching. |
| `docs/ENGINEERING_PRINCIPLES.md` | The 9 permanent rules that bind every contributor. |
| `docs/DECISION_LOG.md` | Why is it built this way? Append-only ADRs. |
| `docs/IMPLEMENTATION_GUIDE.md` | Playbooks: pages, helpers, migrations, verification. |
| `docs/TESTING.md` | What we test and how. |
| `FEATURED.md`, `CAR_PHOTO_HANDOFF.md` | Feature deep-dives — required reading before touching those areas. |

## Commands

```bash
npm run dev          # dev server
npm run verify       # lint + typecheck + constitution + unit tests — required before every commit
npm run verify:full  # verify + production build
npm run test:e2e     # Playwright smoke suite (local only)
npm run build        # production build
```

Deployment: push to `main` → Vercel deploys. There is no other pipeline.
CI (GitHub Actions) re-runs the verify gate on every push.
