-- 087_user_notices.sql
-- Tell people what happened to them, and make suspension reversible (ADR-025).
--
-- 084 gave moderation teeth but no voice. An action landed and the person it
-- landed on was never told: a hidden build just went quiet, and a suspended
-- account looked like the public pages had broken. Worse, `admin_suspend_user`
-- had no inverse at all — a one-way destructive action sitting next to two safe
-- ones, reversible only by hand-written SQL.
--
-- Three parts:
--   1. `user_notices` — a per-user inbox, written ONLY by definer functions.
--   2. Every moderation action now files a notice for the affected owner.
--   3. `admin_unsuspend_user` + `admin_suspended_users` so a suspension can be
--      seen and undone from the admin hub.
--
-- DELIBERATELY NOT NOTIFIED: the reporter. They're told "report sent" at the
-- time and nothing after, which is how Instagram behaves and is the safer
-- default — telling a reporter that their target was actioned turns reporting
-- into a scoreboard, and telling them it was dismissed invites argument. The
-- report's own `status` is still readable by its author (084), so nothing is
-- hidden from them; it just isn't pushed.
--
-- Idempotent. Run in the Supabase SQL Editor.


-- =============================================================================
-- 1. user_notices — the inbox
-- =============================================================================
-- `kind` is deliberately open-ended rather than moderation-specific: this is the
-- substrate the in-app glow already reads, and follows/other events will land
-- here too rather than growing a parallel system.
--
-- Body text is STORED, not derived at read time. A notice is a record of what
-- someone was told on a date; regenerating it later from current state would
-- quietly rewrite history (e.g. after a car is renamed or deleted).

create table if not exists public.user_notices (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  kind       text not null check (kind in (
               'content_hidden', 'content_restored',
               'account_suspended', 'account_restored')),
  title      text not null,
  body       text,
  -- Nullable and `on delete set null`: the notice must outlive the car it is
  -- about, exactly like content_reports outlives its target.
  car_id     uuid references public.cars(id) on delete set null,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);

create index if not exists user_notices_inbox
  on public.user_notices (user_id, created_at desc);
create index if not exists user_notices_unread
  on public.user_notices (user_id) where read_at is null;

alter table public.user_notices enable row level security;

-- Read your own. Mark your own read. Nothing else — and note there is no INSERT
-- policy at all, so a notice can only ever come from the definer functions
-- below. A user cannot forge being told something.
drop policy if exists "user_notices_select_own" on public.user_notices;
create policy "user_notices_select_own"
  on public.user_notices for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "user_notices_update_own" on public.user_notices;
create policy "user_notices_update_own"
  on public.user_notices for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 085's lesson, applied up front: this DB grants `authenticated` full DML on new
-- public tables by default, so the unwanted privileges must be revoked, not
-- merely left ungranted. `update (read_at)` is column-scoped so a user can mark
-- a notice read but cannot rewrite what it says.
revoke all on public.user_notices from authenticated, anon;
grant select              on public.user_notices to authenticated;
grant update (read_at)    on public.user_notices to authenticated;


-- =============================================================================
-- 2. notify_user — the only way a notice is created
-- =============================================================================
create or replace function public.notify_user(
  target uuid, kind text, title text, body text default null, car uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target is null then return; end if;
  insert into public.user_notices (user_id, kind, title, body, car_id)
  values (target, kind, title, body, car);
end;
$$;

revoke execute on function public.notify_user(uuid, text, text, text, uuid) from public, anon, authenticated;


-- =============================================================================
-- 3. Mark read
-- =============================================================================
create or replace function public.mark_notices_read()
returns void
language sql
security definer
set search_path = public
as $$
  update public.user_notices
     set read_at = now()
   where user_id = (select auth.uid()) and read_at is null
$$;

revoke execute on function public.mark_notices_read() from public, anon;
grant  execute on function public.mark_notices_read() to authenticated;


-- =============================================================================
-- 4. Auto-hide now tells the owner
-- =============================================================================
-- Rewritten wholesale from 084 (same body) with the notice added at the end, so
-- the two can't drift.
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

  -- Tell the owner. Without this the build simply goes quiet and they have no
  -- way to know why, which is both unkind and an App Review liability.
  select trim(concat_ws(' ', c.year::text, c.make, c.model))
    into car_label from public.cars c where c.id = target_car;

  perform public.notify_user(
    new.target_owner_id,
    'content_hidden',
    'A build was hidden while we review it',
    coalesce(nullif(car_label, ''), 'One of your builds')
      || ' was reported and is hidden from public view while we take a look. '
      || 'It is still here and still yours — nothing has been deleted. '
      || 'If we find no problem it goes back up automatically.',
    target_car
  );

  new.auto_hidden := true;
  return new;
end;
$$;


-- =============================================================================
-- 5. Admin actions now file notices, and suspension gains an inverse
-- =============================================================================
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
      'Your build is public again',
      'We reviewed the report on ' || coalesce(nullif(car_label, ''), 'your build')
        || ' and found no problem. It has been restored to exactly the visibility you had set.',
      target_car
    );
  end if;
end;
$$;

create or replace function public.admin_hide_content(report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r          public.content_reports;
  target_car uuid;
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

  if target_car is not null then
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
      r.target_owner_id,
      'content_hidden',
      'A build has been hidden',
      coalesce(nullif(car_label, ''), 'One of your builds')
        || ' breaks the content rules in our Terms and is no longer public. '
        || 'Your data is untouched and still yours. Reply to the address in our '
        || 'Terms if you think this is wrong.',
      target_car
    );
  end if;

  update public.content_reports
     set status = 'actioned', resolved_at = now(), resolved_by = (select auth.uid())
   where id = report_id;
end;
$$;

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
      || 'Nothing has been deleted — your garage, mods and history are all still '
      || 'here and only you can see them. Reply to the address in our Terms to appeal.',
    null
  );
end;
$$;

-- The inverse 084 was missing. Restores each car to the visibility its OWNER had
-- chosen (`moderation_prev_public`), never blanket-publishes.
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
    'Your profile and builds are public again, at exactly the visibility you had '
      || 'set before. Thanks for your patience.',
    null
  );
end;
$$;

revoke execute on function public.admin_unsuspend_user(uuid) from public, anon;
grant  execute on function public.admin_unsuspend_user(uuid) to authenticated;


-- =============================================================================
-- 6. Who is currently suspended (so it can be undone from the hub)
-- =============================================================================
create or replace function public.admin_suspended_users()
returns table (id uuid, username text, display_name text, suspended_at timestamptz, suspension_reason text)
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
    select u.id, u.username, u.display_name, u.suspended_at, u.suspension_reason
      from public.users u
     where u.suspended_at is not null
     order by u.suspended_at desc
     limit 200;
end;
$$;

revoke execute on function public.admin_suspended_users() from public, anon;
grant  execute on function public.admin_suspended_users() to authenticated;

notify pgrst, 'reload schema';
