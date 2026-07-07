-- 067_db_hygiene.sql
-- Database hygiene pass from the 2026-07-07 full DB review (advisors + pg_stat).
-- Three concerns, all performance-only — NO data changes, NO policy-semantics changes:
--   (1) drop 5 byte-identical duplicate indexes (double write cost, zero benefit)
--   (2) rewrite 7 RLS policies to initplan form: auth.uid() -> (select auth.uid())
--       — same rows allowed/denied, but evaluated once per query instead of once
--       per row. Finishes the June 2026 InitPlan pass; these 7 were reintroduced
--       by later migrations (047, 059, 060, 061).
--   (3) add covering indexes on foreign keys of child tables that will grow —
--       matters most for delete-account cascades and joins at scale.
-- Deliberately NOT dropped: the 37 advisor "unused" indexes (pre-beta traffic —
-- they exist for query shapes that arrive with scale). Deliberately NOT indexed:
-- FKs on tiny reference tables (vehicle_search_aliases, users.active_car_id,
-- user_flags.granted_by, cars.variant_id — empty catalog, jobs.category).
-- Companion manual step (cannot run in a transaction): VACUUM FULL + REINDEX on
-- vehicle_makes to reclaim ~10 MB of NHTSA import/cull bloat. See hotfixes.sql.
-- Idempotent.

-- (1) duplicate indexes ------------------------------------------------------
drop index if exists analytics_events_name_date;      -- = analytics_events_event_name
drop index if exists error_logs_recent;               -- = error_logs_created_at
drop index if exists job_photos_car_id;               -- = job_photos_car_id_created
drop index if exists timeline_entries_origin;         -- = timeline_entries_one_origin_per_car
drop index if exists vehicle_makes_nhtsa_id;          -- = vehicle_makes_nhtsa_id_unique (0 scans vs 48k)

-- (2) RLS initplan rewrites --------------------------------------------------
-- Semantics identical; (select auth.uid()) lets the planner evaluate it once.

alter policy car_private_all_owner on public.car_private
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy tl_entry_photos_all_owner on public.timeline_entry_photos
  using (exists (select 1 from cars
                 where cars.id = timeline_entry_photos.car_id
                   and cars.user_id = (select auth.uid())))
  with check (exists (select 1 from cars
                      where cars.id = timeline_entry_photos.car_id
                        and cars.user_id = (select auth.uid())));

alter policy tl_entry_links_all_owner on public.timeline_entry_links
  using (exists (select 1 from cars
                 where cars.id = timeline_entry_links.car_id
                   and cars.user_id = (select auth.uid())))
  with check (exists (select 1 from cars
                      where cars.id = timeline_entry_links.car_id
                        and cars.user_id = (select auth.uid())));

alter policy diy_guides_all_owner on public.diy_guides
  using (exists (select 1 from cars
                 where cars.id = diy_guides.car_id
                   and cars.user_id = (select auth.uid())))
  with check (exists (select 1 from cars
                      where cars.id = diy_guides.car_id
                        and cars.user_id = (select auth.uid())));

alter policy diy_steps_all_owner on public.diy_steps
  using (exists (select 1 from cars
                 where cars.id = diy_steps.car_id
                   and cars.user_id = (select auth.uid())))
  with check (exists (select 1 from cars
                      where cars.id = diy_steps.car_id
                        and cars.user_id = (select auth.uid())));

alter policy diy_step_photos_all_owner on public.diy_step_photos
  using (exists (select 1 from cars
                 where cars.id = diy_step_photos.car_id
                   and cars.user_id = (select auth.uid())))
  with check (exists (select 1 from cars
                      where cars.id = diy_step_photos.car_id
                        and cars.user_id = (select auth.uid())));

-- owner_all (car_document_photos, migration 060) has no explicit WITH CHECK —
-- Postgres reuses USING for writes. Keep that shape; only rewrite USING.
alter policy owner_all on public.car_document_photos
  using (car_id in (select cars.id from cars
                    where cars.user_id = (select auth.uid())));

-- (3) covering indexes for growing FKs ---------------------------------------
create index if not exists job_links_job_id             on public.job_links (job_id);
create index if not exists job_links_user_id            on public.job_links (user_id);
create index if not exists car_document_photos_document on public.car_document_photos (document_id);
create index if not exists car_document_photos_car      on public.car_document_photos (car_id);
create index if not exists car_reminders_document_id    on public.car_reminders (document_id);
create index if not exists diy_steps_car_id             on public.diy_steps (car_id);
create index if not exists diy_step_photos_car_id       on public.diy_step_photos (car_id);
create index if not exists timeline_entry_photos_car_id on public.timeline_entry_photos (car_id);
create index if not exists timeline_entry_links_car_id  on public.timeline_entry_links (car_id);
create index if not exists car_private_user_id          on public.car_private (user_id);
create index if not exists cars_make_id                 on public.cars (make_id);
create index if not exists cars_model_id                on public.cars (model_id);

notify pgrst, 'reload schema';
