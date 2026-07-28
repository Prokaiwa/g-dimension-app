-- =============================================================================
-- 081 — Column-level anon grant on public.jobs
-- =============================================================================
-- SECURITY FIX. `jobs` was the last user-data table still carrying a
-- TABLE-WIDE `grant select ... to anon`. Its RLS policy (jobs_public_read,
-- last rewritten in 076) correctly limits which ROWS anon can see — only jobs
-- belonging to a public car with the Build Sheet or Featured room public — but
-- a row policy says nothing about COLUMNS. So anyone holding the anon key
-- (which ships in the JS bundle by design) could read every column of those
-- rows straight off the REST endpoint:
--
--   GET /rest/v1/jobs?select=parts_cost&parts_cost=not.is.null
--
-- Verified against the live database 2026-07-28: that request returned 33 rows
-- totalling $23,828 of other users' spend, plus cost / labor_cost /
-- sale_price / sale_date / part_number / condition / install_mileage and the
-- donor + fabrication fields.
--
-- This contradicts the documented public boundary in three places:
--   * CLAUDE.md — "Build Sheet (brand + title + category — no costs)"
--   * cars.show_investment_publicly — a toggle that is meaningless if the
--     underlying per-job costs can simply be summed via REST
--   * api/og.js — its own comment reads "select just the public columns —
--     brand / title / category, NEVER costs"
--
-- In every one of those the rule was enforced only in the app's query layer.
-- This migration moves it into the grant, where it belongs — exactly the fix
-- ADR-015 (migration 071) applied to `users`, and 076 applied to `sessions`,
-- `job_links` and `cars`. `jobs` was simply missed in that pass.
--
-- The granted set is the union of every column the anon-key consumers select,
-- filter or order on, and nothing else:
--   PublicBuildSheetPage  id, title, brand, category, session_id
--                         + filters car_id / status / type, order date_installed
--   PublicModDetailPage   + date_installed, installed_by, notes, part_type_id
--   PublicFeaturedPage    + order created_at
--   PublicEntryDetailPage id, title, brand, category (by session_id)
--   PublicTimelinePage    id, session_id, title, brand
--   PublicDiyPage         title, brand
--   PublicProfilePage     id (existence probe)
--   api/og.js             title, brand, category
--
-- `notes` IS deliberately public — it is the technical write-up rendered on
-- the public mod detail page. `condition` is deliberately NOT: CLAUDE.md calls
-- it seller info and the public mod page already omits it.
--
-- Idempotent. No policy change (076's jobs_public_read still governs rows).
-- =============================================================================

-- Revoke the blanket grant first; a plain `grant select (cols)` on top of an
-- existing table-wide grant does NOT narrow anything.
revoke select on public.jobs from anon;

grant select (
  id,
  car_id,
  session_id,
  type,
  category,
  title,
  status,
  brand,
  date_installed,
  installed_by,
  notes,
  part_type_id,
  created_at
) on public.jobs to anon;

-- `authenticated` is untouched: owners still read their own full rows through
-- the existing owner policy.

notify pgrst, 'reload schema';
