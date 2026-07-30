-- 090_report_queue_targets.sql
-- The admin queue learns to resolve a report's target. Function-only.
--
-- WHY NOW: until ADR-026 every report in the system said 'car', and the queue
-- was written against that assumption. Now that a hold can file a 'photo' or a
-- 'timeline_entry', two things in `admin_report_queue` are wrong:
--
--   1. A REAL BUG. `target_car_hidden` reads
--        (select c.moderation_hidden_at is not null from cars c where c.id = r.target_id)
--      which only holds when target_id IS a car id. For a photo or entry report
--      it looks up a car by the PHOTO's id, finds nothing, and returns false —
--      so a build that HAS been hidden shows no "hidden" marker, on the one
--      screen whose job is telling the admin the current state. Silent and
--      wrong, which is the bad combination.
--
--   2. Nothing to link to. The queue could only offer "open the build", because
--      it never returned the car the report resolves to, nor the job a reported
--      photo hangs off. Judging a photo report by landing on the owner's profile
--      and hunting for the image is the wrong end of the job.
--
-- Both fixes are the same one line of thinking the autohide trigger already
-- does (084): resolve target → car (and, for a photo, → job) through the same
-- three cases. Done here in a definer function so it works regardless of RLS —
-- including for a car that is currently hidden, where every anon-gated path
-- returns nothing.
--
-- DROP first, not `create or replace`: the OUT columns change, and Postgres
-- refuses to replace a function whose return type differs. The revoke/grant is
-- restated because dropping takes the old privileges with it.
--
-- The frontend reads the two new columns defensively, so it is correct before
-- AND after this runs (pre-090 it simply falls back to "open the build").
--
-- Idempotent. Run in the Supabase SQL Editor.

drop function if exists public.admin_report_queue();

create function public.admin_report_queue()
returns table (
  id uuid, created_at timestamptz, reason text, details text, status text,
  auto_hidden boolean, target_type text, target_id uuid, target_owner_id uuid,
  reporter_username text, owner_username text, owner_suspended boolean,
  target_car_hidden boolean, report_count bigint,
  -- New: what the report actually points at, resolved server-side.
  target_car_id uuid, target_job_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'not_admin' using errcode = 'insufficient_privilege';
  end if;
  return query
    select r.id, r.created_at, r.reason, r.details, r.status,
           r.auto_hidden, r.target_type, r.target_id, r.target_owner_id,
           ru.username, ou.username,
           ou.suspended_at is not null,
           -- Now reads the RESOLVED car, so a photo/entry report reports the
           -- hidden state of the build it belongs to.
           coalesce(c.moderation_hidden_at is not null, false),
           (select count(*) from public.content_reports r2
             where r2.target_type = r.target_type and r2.target_id = r.target_id),
           tc.car_id,
           tj.job_id
      from public.content_reports r
      left join public.users ru on ru.id = r.reporter_id
      left join public.users ou on ou.id = r.target_owner_id
      -- Same three cases as content_reports_autohide. 'user' reports resolve to
      -- no car, which is correct: they are about the account, not a build.
      left join lateral (
        select case r.target_type
          when 'car'            then r.target_id
          when 'photo'          then (select p.car_id from public.job_photos       p where p.id = r.target_id)
          when 'timeline_entry' then (select e.car_id from public.timeline_entries e where e.id = r.target_id)
          else null
        end as car_id
      ) tc on true
      -- A reported photo hangs off a job, and the public mod detail page is
      -- keyed on the job, not the photo.
      left join lateral (
        select case when r.target_type = 'photo'
          then (select p.job_id from public.job_photos p where p.id = r.target_id)
          else null
        end as job_id
      ) tj on true
      left join public.cars c on c.id = tc.car_id
     order by (r.status = 'open') desc, r.created_at desc
     limit 200;
end;
$$;

revoke execute on function public.admin_report_queue() from public, anon;
grant  execute on function public.admin_report_queue() to authenticated;

notify pgrst, 'reload schema';
