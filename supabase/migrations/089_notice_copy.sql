-- 089_notice_copy.sql
-- Copy-only pass over the moderation notices (ADR-025 follow-up).
--
-- TWO PROBLEMS, both owner-spotted:
--
-- 1. "restored to exactly the visibility you had set" is ENGINEERING REASONING
--    LEAKING INTO USER COPY. It exists because `admin_dismiss_report` and
--    `admin_unsuspend_user` read `moderation_prev_public` rather than assuming
--    public — a real and deliberate property (see 087/088). But the user never
--    asked. Saying it out loud answers an unasked question and, by raising it,
--    plants the doubt: "why WOULDN'T it come back the way I had it?" The
--    property still holds and is still verified; it just stops being announced.
--
-- 2. Em dashes inside sentences, which the project's copy rule forbids
--    (CLAUDE.md — the owner's call, they read as AI-generated). Two notices had
--    them. Replaced with full stops, which read better here anyway.
--
-- Function bodies are otherwise byte-identical to 087/088 — only string
-- literals change. Idempotent. Run in the Supabase SQL Editor.


-- ── auto-hide: drop the em dash ──────────────────────────────────────────────
create or replace function public.content_reports_autohide()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_car uuid;
  car_label  text;
begin
  target_car := case new.target_type
    when 'car'            then new.target_id
    when 'photo'          then (select car_id from public.job_photos       where id = new.target_id)
    when 'timeline_entry' then (select car_id from public.timeline_entries where id = new.target_id)
    else null
  end;

  new.target_owner_id := case
    when new.target_type = 'user' then new.target_id
    when target_car is not null   then (select user_id from public.cars where id = target_car)
    else null
  end;

  if new.reason not in ('nudity','hate','violence','illegal') then
    return new;
  end if;
  if target_car is null then return new; end if;

  perform set_config('gdim.moderation', 'on', true);
  update public.cars
     set moderation_prev_public = coalesce(moderation_prev_public, is_public),
         moderation_hidden_at   = coalesce(moderation_hidden_at, now()),
         is_public              = false
   where id = target_car;
  perform set_config('gdim.moderation', 'off', true);

  select trim(concat_ws(' ', c.year::text, c.make, c.model))
    into car_label from public.cars c where c.id = target_car;

  perform public.notify_user(
    new.target_owner_id,
    'content_hidden',
    'A build was hidden while we review it',
    coalesce(nullif(car_label, ''), 'One of your builds')
      || ' was reported and is hidden from public view while we take a look. '
      || 'It is still here and still yours. Nothing has been deleted, and if we '
      || 'find no problem it goes back up automatically.',
    target_car
  );

  new.auto_hidden := true;
  return new;
end;
$$;


-- ── dismiss: stop explaining the mechanism ───────────────────────────────────
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

  if coalesce(was_hidden, false) then
    select trim(concat_ws(' ', c.year::text, c.make, c.model))
      into car_label from public.cars c where c.id = target_car;
    perform public.notify_user(
      r.target_owner_id,
      'content_restored',
      'Your build has been restored',
      'We reviewed the report on ' || coalesce(nullif(car_label, ''), 'your build')
        || ' and found no problem. Everything is back to normal.',
      target_car
    );
  end if;
end;
$$;


-- ── suspend: drop the em dash ────────────────────────────────────────────────
create or replace function public.admin_suspend_user(target_user uuid, reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'not_admin' using errcode = 'insufficient_privilege';
  end if;
  if public.is_admin(target_user) then
    raise exception 'cannot_suspend_admin';
  end if;

  update public.users
     set suspended_at = coalesce(suspended_at, now()), suspension_reason = reason
   where id = target_user;

  perform set_config('gdim.moderation', 'on', true);
  update public.cars
     set moderation_prev_public = coalesce(moderation_prev_public, is_public),
         moderation_hidden_at   = coalesce(moderation_hidden_at, now()),
         is_public              = false
   where user_id = target_user;
  perform set_config('gdim.moderation', 'off', true);

  update public.content_reports
     set status = 'actioned', resolved_at = now(), resolved_by = (select auth.uid())
   where target_owner_id = target_user and status = 'open';

  perform public.notify_user(
    target_user,
    'account_suspended',
    'Your account has been suspended',
    'Your public profile and builds are hidden while your account is suspended. '
      || 'Nothing has been deleted. Your garage, mods and history are all still '
      || 'here, and only you can see them. Reply to the address in our Terms to appeal.',
    null
  );
end;
$$;


-- ── unsuspend: stop explaining the mechanism ─────────────────────────────────
create or replace function public.admin_unsuspend_user(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'not_admin' using errcode = 'insufficient_privilege';
  end if;

  update public.users
     set suspended_at = null, suspension_reason = null
   where id = target_user;

  perform set_config('gdim.moderation', 'on', true);
  update public.cars
     set is_public              = coalesce(moderation_prev_public, is_public),
         moderation_hidden_at   = null,
         moderation_prev_public = null
   where user_id = target_user and moderation_hidden_at is not null;
  perform set_config('gdim.moderation', 'off', true);

  perform public.notify_user(
    target_user,
    'account_restored',
    'Your account has been restored',
    'Your profile and builds are back to normal. Thanks for your patience.',
    null
  );
end;
$$;

notify pgrst, 'reload schema';
