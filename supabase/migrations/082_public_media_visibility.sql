-- =============================================================================
-- 082 — Make public media/spec/DIY actually readable by logged-out visitors
-- =============================================================================
-- Found by loading /builds/:username as a real anonymous visitor against the
-- live database (2026-07-28). Seven tables that are SUPPOSED to be publicly
-- readable return 42501 to anon, so large parts of the public build page are
-- silently empty for everyone who is not signed in:
--
--   job_photos            → mod photo carousel on the public mod detail,
--                           timeline card thumbnails, entry-detail galleries
--   job_specs             → the spec list on the public mod detail
--   timeline_entry_photos → photo galleries on public timeline notes
--   timeline_entry_links  → links on public timeline notes
--   diy_guides            → the ENTIRE public DIY guide feature (059)
--   diy_steps             → ditto
--   diy_step_photos       → ditto
--
-- Every one of these already has a correct `*_select_public` policy. Nothing
-- was wrong with the intent; two separate mechanical faults blocked it.
--
-- ── Fault 1: missing anon GRANT (job_photos, job_specs) ─────────────────────
-- Both predate the 2026-05-30 Supabase change and were only ever granted to
-- `authenticated` (job_specs' grants were themselves a hotfix — see
-- hotfixes.sql "Fix missing grants on job_specs"). PostgREST checks the grant
-- BEFORE RLS is consulted, so the public policy never got a chance to run.
-- Diagnostic signature: the error names the table itself, e.g.
-- "permission denied for table job_photos".
--
-- ── Fault 2: owner policy not scoped to a role (all seven) ──────────────────
-- Each owner policy is `for all` with no role restriction, so PostgreSQL
-- evaluates it for anon too (permissive policies are OR'd). Those policies
-- subquery `cars.user_id`, and anon's grant on `cars` is column-level (053 /
-- 076) and deliberately excludes user_id — so evaluating the policy raises
-- "permission denied for table CARS" even though the request was for a
-- different table. That misleading error is what makes this hard to spot.
--
-- This is not a new idea: migration 076 already applied exactly this fix to
-- `sessions` and `job_links` ("alter policy ... to authenticated"), which is
-- precisely why those two work today and these seven do not. 082 finishes the
-- sweep.
--
-- Scoping the owner policy to `authenticated` loses nothing: anon can never
-- satisfy `cars.user_id = auth.uid()` anyway, since auth.uid() is null.
--
-- Grants here are table-wide rather than column-scoped, unlike 081. That is
-- deliberate and consistent with 047/059's original intent: these tables hold
-- photo URLs, spec keys/values and DIY step text — no financial or identifying
-- data. The tables that do (jobs, sessions, users, cars) stay column-scoped.
--
-- Idempotent. No policy LOGIC changes — only the role they apply to.
-- =============================================================================

-- ── Fault 1: the two tables anon was never granted ──────────────────────────
grant select on public.job_photos to anon;
grant select on public.job_specs  to anon;

-- ── Fault 2: keep owner policies off the anon evaluation path ───────────────
alter policy "job_photos_all_owner"       on public.job_photos            to authenticated;
alter policy "job_specs_all_owner"        on public.job_specs             to authenticated;
alter policy "tl_entry_photos_all_owner"  on public.timeline_entry_photos to authenticated;
alter policy "tl_entry_links_all_owner"   on public.timeline_entry_links  to authenticated;
alter policy "diy_guides_all_owner"       on public.diy_guides            to authenticated;
alter policy "diy_steps_all_owner"        on public.diy_steps             to authenticated;
alter policy "diy_step_photos_all_owner"  on public.diy_step_photos       to authenticated;

notify pgrst, 'reload schema';
