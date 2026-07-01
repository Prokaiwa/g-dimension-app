-- =============================================================================
-- G-DIMENSION — Migration 066: mount one job onto another (tires → wheels)
-- =============================================================================
-- Adds jobs.mounted_on_job_id — a nullable self-link so a "mounted" part can
-- point at the part it sits on. First use: tires reference the wheels they're
-- fitted to, added together in the Wheels add flow and shown as one combined
-- item on the build sheet. Directional by design: the wheel is the parent.
--
-- on delete set null — if the parent row is ever hard-deleted, the child is
-- orphaned (link cleared) rather than cascade-deleted; lifecycle transitions
-- (remove/sell/scrap) are handled in app code, not by the FK. Additive +
-- idempotent.
-- =============================================================================

alter table public.jobs
  add column if not exists mounted_on_job_id uuid
  references public.jobs(id) on delete set null;

create index if not exists jobs_mounted_on_job_id_idx
  on public.jobs(mounted_on_job_id);
