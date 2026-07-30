-- 088_restore_notice_wording.sql
-- Function-only fix: the dismissal notice claimed something that isn't always true.
--
-- FOUND WHILE VERIFYING 087. A car that was PRIVATE before being auto-hidden is
-- correctly restored to private — `admin_dismiss_report` reads
-- `moderation_prev_public` rather than assuming public, and that was verified
-- live: the test car came back `is_public = false`, invisible to anon, flags
-- cleared. The BEHAVIOUR was right.
--
-- The words were not. The notice was titled "Your build is public again", which
-- is false for exactly that case — the owner is told their private build was
-- published, when it wasn't. On a screen whose entire purpose is telling people
-- the truth about what moderation did to them, that's the worst place to have a
-- wrong sentence, and it's the kind of thing that costs trust precisely when
-- someone is already unhappy.
--
-- The body was already accurate ("restored to exactly the visibility you had
-- set"), so only the title changes: "Your build has been restored" is true
-- whether the car goes back to public or to private, and needs no branch.
--
-- Everything else in `admin_dismiss_report` is byte-identical to 087.
--
-- Idempotent. Run in the Supabase SQL Editor.

create or replace function public.admin_dismiss_report(report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r          public.content_reports;
  target_car uuid;
  was_hidden boolean := false;
  car_label  text;
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'not_admin' using errcode = 'insufficient_privilege';
  end if;
  select * into r from public.content_reports where id = report_id;
  if not found then raise exception 'report_not_found'; end if;

  target_car := case r.target_type
    when 'car'            then r.target_id
    when 'photo'          then (select car_id from public.job_photos       where id = r.target_id)
    when 'timeline_entry' then (select car_id from public.timeline_entries where id = r.target_id)
  end;

  select (moderation_hidden_at is not null) into was_hidden
    from public.cars where id = target_car;

  perform set_config('gdim.moderation', 'on', true);
  update public.cars
     set is_public              = coalesce(moderation_prev_public, is_public),
         moderation_hidden_at   = null,
         moderation_prev_public = null
   where id = target_car and moderation_hidden_at is not null;
  perform set_config('gdim.moderation', 'off', true);

  update public.content_reports
     set status = 'dismissed', resolved_at = now(), resolved_by = (select auth.uid())
   where id = report_id;

  -- Only worth telling them if something had actually been taken away.
  if coalesce(was_hidden, false) then
    select trim(concat_ws(' ', c.year::text, c.make, c.model))
      into car_label from public.cars c where c.id = target_car;
    perform public.notify_user(
      r.target_owner_id,
      'content_restored',
      -- NOT "public again": the car may well have been private before, and
      -- telling someone their private build was published is a lie that lands
      -- on the one screen that exists to be trustworthy.
      'Your build has been restored',
      'We reviewed the report on ' || coalesce(nullif(car_label, ''), 'your build')
        || ' and found no problem. It has been restored to exactly the visibility you had set.',
      target_car
    );
  end if;
end;
$$;

notify pgrst, 'reload schema';
