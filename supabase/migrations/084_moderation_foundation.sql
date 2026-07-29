-- 084_moderation_foundation.sql
-- Report → block, account-level consequences, and a username blocklist.
-- The App Store Guideline 1.2 (User-Generated Content) foundation (ADR-023).
--
-- WHY NOW: /builds/:username already publishes user photos, bios, usernames,
-- car nicknames and timeline stories to anyone, so 1.2 applies to the FIRST
-- submission — it is not gated on the social layer. 1.2 asks for four things:
-- a filtering method, a report mechanism with timely response, the ability to
-- block abusive users, and published contact info (already in legalMeta.ts).
-- This migration is the data layer for the first three.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE KEY DESIGN DECISION: hiding reuses `cars.is_public` rather than adding a
-- second visibility condition to every public policy.
--
-- Twelve RLS policies gate the public surface (cars, sessions, jobs, job_links,
-- job_photos, job_specs, timeline_entries, timeline_entry_photos/_links,
-- diy_guides/_steps/_step_photos) and EVERY one of them already tests
-- `cars.is_public = true`. Adding `and c.moderation_hidden_at is null` to all
-- twelve would mean restating twelve policies correctly — and that is precisely
-- where 081 (too wide) and 082 (too narrow) went wrong, on this same boundary,
-- in the same week.
--
-- So moderation hiding flips `is_public` itself, remembering the owner's
-- original value in `moderation_prev_public` so it can be restored exactly.
-- Every existing policy then hides the content with no edit and no new
-- reasoning — the same code path already verified end to end as an anonymous
-- visitor on 2026-07-28.
--
-- The obvious hole in that approach — the owner just switches Public back on in
-- Edit Car — is closed by the `cars_moderation_guard` trigger below: while
-- `moderation_hidden_at` is set, `is_public` is forced back to false and the
-- flag itself cannot be cleared by the owner. Only the admin RPCs in section 9
-- can lift it. One small trigger instead of twelve rewrites.
--
-- The owner keeps full private access to their own car throughout
-- (`cars_all_owner` does not depend on is_public) — a hidden build is not
-- deleted data, and the frontend shows the owner why it is hidden.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Idempotent. Run in the Supabase SQL Editor.


-- =============================================================================
-- 1. content_reports — the report mechanism
-- =============================================================================
-- target_type/target_id is deliberately generic (no FK): a report must survive
-- the thing it points at being deleted, otherwise the audit trail evaporates
-- exactly when it matters. target_owner_id is denormalized at insert time for
-- the same reason — so "who was reported" is still answerable after a takedown.

create table if not exists public.content_reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid not null references public.users(id) on delete cascade,
  target_type     text not null check (target_type in ('user','car','photo','timeline_entry')),
  target_id       uuid not null,
  target_owner_id uuid          references public.users(id) on delete set null,
  -- Severe reasons auto-hide (see the trigger in section 10); the rest queue.
  reason          text not null check (reason in (
                    'nudity','hate','violence','illegal',
                    'harassment','spam','impersonation','other')),
  details         text,
  status          text not null default 'open'
                    check (status in ('open','actioned','dismissed')),
  auto_hidden     boolean not null default false,
  resolved_at     timestamptz,
  resolved_by     uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists content_reports_open
  on public.content_reports (created_at desc) where status = 'open';
create index if not exists content_reports_target
  on public.content_reports (target_type, target_id);
create index if not exists content_reports_reporter
  on public.content_reports (reporter_id, created_at desc);

-- One open report per person per thing: re-reporting is a no-op rather than a
-- way to inflate a count or spam the notification.
create unique index if not exists content_reports_one_open_per_reporter
  on public.content_reports (reporter_id, target_type, target_id)
  where status = 'open';

alter table public.content_reports enable row level security;

-- A reporter may file, and may see what they filed (so the UI can say "already
-- reported"). Nobody can read reports filed against them, and nobody can edit
-- or withdraw a report — resolution runs through the admin RPCs in section 9.
drop policy if exists "content_reports_insert_own" on public.content_reports;
create policy "content_reports_insert_own"
  on public.content_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));

drop policy if exists "content_reports_select_own" on public.content_reports;
create policy "content_reports_select_own"
  on public.content_reports for select to authenticated
  using (reporter_id = (select auth.uid()));

grant select, insert on public.content_reports to authenticated;


-- =============================================================================
-- 2. user_blocks — the block mechanism
-- =============================================================================
-- Deliberately one-directional and private: only the blocker can see their own
-- block list. A blocked user is never told, because "you have been blocked" is
-- itself an escalation vector.
--
-- Scope note, stated honestly: /builds/:username is readable by anon, so a
-- blocked user can always sign out and look at a public page. Blocking governs
-- INTERACTION (following, and later feeds/comments), not the public web. The UI
-- copy must not promise more than that.

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.users(id) on delete cascade,
  blocked_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

drop policy if exists "user_blocks_all_own" on public.user_blocks;
create policy "user_blocks_all_own"
  on public.user_blocks for all to authenticated
  using      (blocker_id = (select auth.uid()))
  with check (blocker_id = (select auth.uid()));

grant select, insert, delete on public.user_blocks to authenticated;


-- =============================================================================
-- 3. Account-level consequences
-- =============================================================================
alter table public.users add column if not exists suspended_at      timestamptz;
alter table public.users add column if not exists suspension_reason text;

comment on column public.users.suspended_at is
  'Set by an admin. Non-null hides the public profile (public_car_profiles filters it) and is expected to be paired with hiding the user''s cars.';

-- ⚠️ 083 MAINTENANCE: 083 replaced the table-wide `authenticated` grant on
-- `users` with a column list, which is now the single source of truth for what
-- a signed-in user can read — INCLUDING its own owner. New columns are
-- invisible until added here, so the owner could not see their own suspension
-- banner without this. `email` stays excluded (that is the whole point of 083).
grant select (suspended_at, suspension_reason) on public.users to authenticated;

alter table public.cars add column if not exists moderation_hidden_at   timestamptz;
alter table public.cars add column if not exists moderation_prev_public boolean;

comment on column public.cars.moderation_hidden_at is
  'Non-null = hidden by moderation. Hiding flips is_public to false (reusing every existing public RLS policy) and stashes the owner''s original value in moderation_prev_public so a dismissal restores it exactly.';


-- =============================================================================
-- 4. is_admin — the admin predicate (defined before its first caller)
-- =============================================================================
-- Reuses user_flags (019): service-role writes only, so a user cannot grant
-- themselves the flag. Definer so it can read a row other than the caller's.
-- Grant yourself admin with:
--   insert into user_flags (user_id, flag) values ('<your-uuid>', 'admin');

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_flags
    where user_id = uid and flag = 'admin' and enabled = true
      and (expires_at is null or expires_at > now())
  )
$$;

revoke execute on function public.is_admin(uuid) from public, anon;
grant  execute on function public.is_admin(uuid) to authenticated;


-- =============================================================================
-- 5. cars_moderation_guard — makes the is_public reuse actually safe
-- =============================================================================
-- Without this, a hidden owner simply re-ticks "Public" on the Edit Car screen.
-- Runs as a trigger rather than an RLS policy because RLS cannot express "you
-- may update this row, but not these two columns, and not that value".
--
-- The admin path (Edge Function, service role) bypasses this by clearing
-- moderation_hidden_at and restoring is_public in the SAME statement, which the
-- guard explicitly allows.

create or replace function public.cars_moderation_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Moderation's own writes (the auto-hide trigger and the admin RPCs below)
  -- announce themselves with a transaction-local flag. Without this the guard
  -- would faithfully revert the very hide it exists to protect: those writes
  -- run as the REPORTER, who is quite correctly not an admin.
  if coalesce(current_setting('gdim.moderation', true), '') = 'on' then
    return new;
  end if;

  -- Nobody else may set, clear, or alter the moderation flags.
  if new.moderation_hidden_at   is distinct from old.moderation_hidden_at
  or new.moderation_prev_public is distinct from old.moderation_prev_public then
    new.moderation_hidden_at   := old.moderation_hidden_at;
    new.moderation_prev_public := old.moderation_prev_public;
  end if;

  -- While hidden, the car cannot be made public again — this is the line that
  -- makes reusing is_public safe instead of merely convenient.
  if new.moderation_hidden_at is not null then
    new.is_public := false;
  end if;

  return new;
end;
$$;

drop trigger if exists cars_moderation_guard_trg on public.cars;
create trigger cars_moderation_guard_trg
  before update on public.cars
  for each row execute function public.cars_moderation_guard();


-- =============================================================================
-- 6. moderation_blocked_terms — the username blocklist
-- =============================================================================
-- In the DATABASE, not a JSON file in the bundle, for one specific reason:
-- handle_new_user() (038/042) auto-generates a username from the local part of
-- the signup email. Someone with a profane address gets a profane public handle
-- without ever touching a form, so a client-side list cannot close this.
--
-- kind:
--   'exact'    — the whole normalized handle must not equal the term. Used for
--                route collisions and for short words that are legitimate
--                substrings ('ass' would otherwise reject "assetto").
--   'contains' — the term must not appear anywhere. Used for slurs and brand
--                impersonation, where evasion is the norm.
--
-- CAR-CULTURE CALIBRATION, deliberate and worth not "fixing" later: 'shit' and
-- 'bitch' are 'exact', not 'contains', because "shitbox" is affectionate car
-- slang and "Bitchin' Rides" is a real show. Over-blocking a build journal's
-- handles is a worse failure here than the mild profanity it would catch.

create table if not exists public.moderation_blocked_terms (
  term     text primary key,
  kind     text not null check (kind in ('exact','contains')),
  category text not null check (category in ('reserved','profanity','slur','brand'))
);

alter table public.moderation_blocked_terms enable row level security;
-- No client policy at all: reachable only through the definer function below.

insert into public.moderation_blocked_terms (term, kind, category) values
  -- Route collisions / system words (exact).
  ('admin','exact','reserved'),        ('administrator','exact','reserved'),
  ('api','exact','reserved'),          ('app','exact','reserved'),
  ('auth','exact','reserved'),         ('about','exact','reserved'),
  ('build','exact','reserved'),        ('builds','exact','reserved'),
  ('contact','exact','reserved'),      ('dashboard','exact','reserved'),
  ('edit','exact','reserved'),         ('featured','exact','reserved'),
  ('garage','exact','reserved'),       ('help','exact','reserved'),
  ('home','exact','reserved'),         ('login','exact','reserved'),
  ('logout','exact','reserved'),       ('maintenance','exact','reserved'),
  ('me','exact','reserved'),           ('new','exact','reserved'),
  ('null','exact','reserved'),         ('photos','exact','reserved'),
  ('privacy','exact','reserved'),      ('profile','exact','reserved'),
  ('root','exact','reserved'),         ('settings','exact','reserved'),
  ('signin','exact','reserved'),       ('signup','exact','reserved'),
  ('support','exact','reserved'),      ('system','exact','reserved'),
  ('terms','exact','reserved'),        ('timeline','exact','reserved'),
  ('tuning','exact','reserved'),       ('undefined','exact','reserved'),
  ('user','exact','reserved'),         ('users','exact','reserved'),
  ('welcome','exact','reserved'),      ('www','exact','reserved'),
  -- Impersonation / brand (contains for the brand itself, exact for the roles).
  ('gdimension','contains','brand'),   ('gdimensions','contains','brand'),
  ('official','exact','brand'),        ('staff','exact','brand'),
  ('team','exact','brand'),            ('moderator','exact','brand'),
  ('mod','exact','brand'),             ('gdim','exact','brand'),
  -- Profanity. Short/ambiguous ones are exact on purpose (see note above).
  ('ass','exact','profanity'),         ('shit','exact','profanity'),
  ('bitch','exact','profanity'),       ('dick','exact','profanity'),
  ('cock','exact','profanity'),        ('piss','exact','profanity'),
  ('fuck','contains','profanity'),     ('cunt','contains','profanity'),
  ('whore','contains','profanity'),    ('slut','contains','profanity'),
  ('rape','contains','profanity'),     ('nazi','contains','profanity'),
  ('hitler','contains','profanity'),   ('pedo','contains','profanity'),
  -- Slurs (contains). Intentionally short and unambiguous; extend by INSERT,
  -- no code change or deploy required.
  ('nigger','contains','slur'),        ('nigga','contains','slur'),
  ('faggot','contains','slur'),        ('tranny','contains','slur'),
  ('kike','contains','slur'),          ('chink','contains','slur'),
  ('spic','contains','slur'),          ('wetback','contains','slur'),
  ('retard','contains','slur')
on conflict (term) do update set kind = excluded.kind, category = excluded.category;


-- =============================================================================
-- 7. Username validation
-- =============================================================================
-- Normalization defeats the cheap evasions (leetspeak, separators) before the
-- list is consulted, so the list itself stays short and readable.

create or replace function public.normalize_handle(candidate text)
returns text
language sql
immutable
as $$
  select regexp_replace(
           translate(lower(coalesce(candidate, '')),
                     '4310$!@', 'aeiosia'),
           '[^a-z0-9]', '', 'g')
$$;

-- Returns NULL when the handle is acceptable, otherwise the offending category
-- ('reserved' | 'profanity' | 'slur' | 'brand') so the UI can word itself.
create or replace function public.username_rejection_reason(candidate text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  norm text := public.normalize_handle(candidate);
  hit  text;
begin
  if norm is null or length(norm) = 0 then return null; end if;

  select category into hit
  from public.moderation_blocked_terms
  where (kind = 'exact'    and norm = term)
     or (kind = 'contains' and position(term in norm) > 0)
  order by case kind when 'contains' then 0 else 1 end
  limit 1;

  return hit;
end;
$$;

revoke execute on function public.username_rejection_reason(text) from public;
grant  execute on function public.username_rejection_reason(text) to anon, authenticated;

-- The real enforcement. A client-side check is UX; this is the boundary.
create or replace function public.users_username_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bad text;
begin
  if new.username is null then return new; end if;
  if tg_op = 'UPDATE' and new.username is not distinct from old.username then
    return new;
  end if;
  bad := public.username_rejection_reason(new.username);
  if bad is not null then
    raise exception 'username_blocked:%', bad using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists users_username_guard_trg on public.users;
create trigger users_username_guard_trg
  before insert or update of username on public.users
  for each row execute function public.users_username_guard();


-- =============================================================================
-- 8. handle_new_user — sanitize the AUTO-GENERATED handle
-- =============================================================================
-- Preserves 038's collision walk and 042's unique_violation retry loop verbatim;
-- the only change is the two lines that reject a blocked base and fall back to
-- 'driver'. Without this the new guard trigger in section 6 would raise inside
-- the signup trigger and break signup outright for such an address.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  candidate     text;
  suffix        integer := 1;
begin
  base_username := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9_]', '', 'g'));
  if base_username is null or length(base_username) = 0 then
    base_username := 'driver';
  end if;

  -- NEW (084): never mint a blocked handle from an email local part.
  if public.username_rejection_reason(base_username) is not null then
    base_username := 'driver';
  end if;

  -- Pre-check: find a likely-free handle (optimization, fewer retries).
  candidate := base_username;
  while exists (select 1 from public.users where username = candidate) loop
    suffix    := suffix + 1;
    candidate := base_username || suffix::text;
  end loop;

  -- Guarantee: insert with retry. A concurrent signup that grabbed the same
  -- candidate first raises unique_violation here; bump the suffix and retry.
  loop
    begin
      insert into public.users (id, email, username, display_name)
      values (
        new.id,
        new.email,
        candidate,
        coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
      )
      on conflict (id) do nothing;
      exit;  -- inserted, or id already existed — either way we're done
    exception when unique_violation then
      suffix    := suffix + 1;
      candidate := base_username || suffix::text;
    end;
  end loop;

  return new;
end;
$$;


-- =============================================================================
-- 9. Admin API — the moderation queue and its three actions
-- =============================================================================
-- These are RPCs rather than raw table access from an admin screen, for the
-- reason ADR-020/022 keeps re-teaching: the check has to be where the data is.
-- A client-side `isAdmin` boolean is not a boundary. Each function re-derives
-- admin status from user_flags server-side and raises otherwise, so the
-- /admin/reports screen holds no privilege of its own — it is only a view onto
-- what these four functions will do for a caller who really is an admin.
--
-- Note there is no Edge Function in this path. Moderation actions run as the
-- signed-in admin over the normal API; the service-role key stays out of it.

create or replace function public.admin_report_queue()
returns table (
  id uuid, created_at timestamptz, reason text, details text, status text,
  auto_hidden boolean, target_type text, target_id uuid, target_owner_id uuid,
  reporter_username text, owner_username text, owner_suspended boolean,
  target_car_hidden boolean, report_count bigint
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
           coalesce((select c.moderation_hidden_at is not null
                       from public.cars c where c.id = r.target_id), false),
           (select count(*) from public.content_reports r2
             where r2.target_type = r.target_type and r2.target_id = r.target_id)
      from public.content_reports r
      left join public.users ru on ru.id = r.reporter_id
      left join public.users ou on ou.id = r.target_owner_id
     order by (r.status = 'open') desc, r.created_at desc
     limit 200;
end;
$$;

-- Dismiss: the report was unfounded. Restores the owner's ORIGINAL is_public
-- value rather than assuming true — a car that was private before an auto-hide
-- must not be published by the act of clearing a bad report.
create or replace function public.admin_dismiss_report(report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.content_reports;
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'not_admin' using errcode = 'insufficient_privilege';
  end if;
  select * into r from public.content_reports where id = report_id;
  if not found then raise exception 'report_not_found'; end if;

  perform set_config('gdim.moderation', 'on', true);
  update public.cars
     set is_public              = coalesce(moderation_prev_public, is_public),
         moderation_hidden_at   = null,
         moderation_prev_public = null
   where id = (case r.target_type
                 when 'car'            then r.target_id
                 when 'photo'          then (select car_id from public.job_photos       where id = r.target_id)
                 when 'timeline_entry' then (select car_id from public.timeline_entries where id = r.target_id)
               end)
     and moderation_hidden_at is not null;
  perform set_config('gdim.moderation', 'off', true);

  update public.content_reports
     set status = 'dismissed', resolved_at = now(), resolved_by = (select auth.uid())
   where id = report_id;
end;
$$;

-- Uphold: the content stays hidden. Deliberately does NOT delete anything —
-- a takedown that destroys evidence cannot be reviewed or appealed later.
create or replace function public.admin_hide_content(report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r          public.content_reports;
  target_car uuid;
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
  end if;

  update public.content_reports
     set status = 'actioned', resolved_at = now(), resolved_by = (select auth.uid())
   where id = report_id;
end;
$$;

-- Suspend the account: the profile leaves the public surface (the view filters
-- suspended owners) and every one of their cars is hidden. Their own data stays
-- intact and privately accessible — suspension is not deletion.
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
end;
$$;

revoke execute on function public.admin_report_queue()                 from public, anon;
revoke execute on function public.admin_dismiss_report(uuid)           from public, anon;
revoke execute on function public.admin_hide_content(uuid)             from public, anon;
revoke execute on function public.admin_suspend_user(uuid, text)       from public, anon;
grant  execute on function public.admin_report_queue()                 to authenticated;
grant  execute on function public.admin_dismiss_report(uuid)           to authenticated;
grant  execute on function public.admin_hide_content(uuid)             to authenticated;
grant  execute on function public.admin_suspend_user(uuid, text)       to authenticated;


-- =============================================================================
-- 10. Auto-hide on severe reports
-- =============================================================================
-- The compliance point: content comes down the moment it is reported, without
-- waiting for a human. A solo operator cannot promise a review SLA that depends
-- on being awake — and App Review itself may be that reader.
--
-- Severe only (nudity/hate/violence/illegal). harassment/spam/impersonation/
-- other queue for review, because those are judgement calls where an instant
-- takedown is the wrong default.
--
-- Granularity, stated plainly: the lever is the CAR. A reported photo or
-- timeline entry hides the build it belongs to, because per-photo hiding would
-- mean new columns and new conditions on several more public policies — the
-- exact sprawl this migration's header argues against. At beta scale the
-- trade is right: a wrongly-hidden build is one admin tap from restored, while
-- objectionable content sitting live during review is a rejection.
--
-- A report against a USER never auto-suspends. Suspension is destructive and
-- impersonation/bio disputes are not emergencies — those queue for a human.

create or replace function public.content_reports_autohide()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_car uuid;
begin
  -- Resolve the target's car and owner SERVER-SIDE. Both arrive from the
  -- client, and a report that misattributes who owns the content is worse than
  -- no report at all, so neither value is taken on trust.
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

  -- Tell cars_moderation_guard this write is moderation's own (see section 5).
  perform set_config('gdim.moderation', 'on', true);

  -- Remember the owner's own setting exactly once, so a later dismissal
  -- restores what they chose rather than assuming "public".
  update public.cars
     set moderation_prev_public = coalesce(moderation_prev_public, is_public),
         moderation_hidden_at   = coalesce(moderation_hidden_at, now()),
         is_public              = false
   where id = target_car;

  perform set_config('gdim.moderation', 'off', true);

  new.auto_hidden := true;
  return new;
end;
$$;

drop trigger if exists content_reports_autohide_trg on public.content_reports;
create trigger content_reports_autohide_trg
  before insert on public.content_reports
  for each row execute function public.content_reports_autohide();


-- =============================================================================
-- 11. public_car_profiles — exclude suspended owners
-- =============================================================================
-- Hidden CARS are already excluded via is_public (see the header). This adds the
-- account-level lever. Definer view (no security_invoker), so anon reads are
-- unaffected by the 083/071 column grants.

create or replace view public.public_car_profiles as
  select
    c.id, c.user_id, c.year, c.make, c.model, c."trim", c.variant_id,
    c.chassis_code, c.nickname, c.color, c.engine_type, c.transmission,
    c.drivetrain, c.forced_induction, c.horsepower, c.torque,
    c.current_mileage, c.is_import, c.garage_photo_url, c.showcase_photo_url,
    c.photo_y_offset, c.purchase_story, c.purchase_date, c.is_public,
    c.show_investment_publicly, c.created_at,
    u.username, u.display_name, u.avatar_url, u.city, u.country,
    c.usage_type, c.engine_origin, c.weight_lbs,
    c.build_sheet_power_photo, c.build_sheet_chassis_photo,
    c.build_sheet_exterior_photo, c.build_sheet_interior_photo,
    c.original_photo_url, c.cover_focus_x, c.cover_focus_y, c.cover_zoom,
    case when c.show_featured_publicly then c.featured_story else null end as featured_story,
    c.show_buildsheet_publicly,
    c.show_timeline_publicly,
    c.show_featured_publicly,
    u.active_car_id,
    c.variant,
    case when c.show_featured_publicly then c.featured_layout else null end as featured_layout,
    c.mileage_unit,
    u.bio,
    u.country_code,
    u.distance_unit,
    u.power_unit,
    u.torque_unit,
    u.license_grade
  from cars c
  join users u on u.id = c.user_id
  where c.is_public = true
    and c.deleted_at is null
    and u.deleted_at is null
    -- appended (084): a suspended account's builds leave the public surface.
    and u.suspended_at is null;

notify pgrst, 'reload schema';
