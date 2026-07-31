-- 094_follow_notices.sql
-- "@someone started following you." Follows have been completely silent since
-- 086: you could gain followers and never know, which makes the whole feature
-- one-directional. The inbox (087) and the attention count (ADR-025) already
-- exist; this is the first thing to use them that isn't moderation.
--
-- THREE PARTS
--   1. `user_notices.actor_id` — WHO caused the notice. Needed for two things
--      that are impossible without it: linking the row to that person, and
--      deduping. Nullable + `on delete set null`, like `car_id`: the notice has
--      to outlive the account it is about.
--   2. `notify_user` gains an `actor` parameter. DROP then CREATE, because
--      adding a parameter to an existing function creates a second OVERLOAD
--      rather than replacing it, and two candidates that differ only by a
--      defaulted trailing argument is an ambiguity waiting to happen. The four
--      existing callers pass five arguments and keep working — plpgsql resolves
--      the call at run time, so they need no edit.
--   3. A definer trigger on `follows`.
--
-- WHY A TRIGGER RATHER THAN THE CLIENT: `notify_user` has EXECUTE revoked from
-- every client role, deliberately (087) — a user must not be able to forge
-- having been told something, or write a notice into someone else's inbox. So
-- the app cannot send this itself, and it should not: a notice that depends on
-- the client remembering to send it is a notice that goes missing.
--
-- DEDUPE: unfollow/refollow would otherwise fire a fresh notice every time,
-- which is a free way to pester someone. One notice per follower per 30 days.
--
-- NOTE ON WHAT IS STORED vs DERIVED: the BODY is stored text, per ADR-025 —
-- it is a record of what someone was told on a date. The LINK is derived at
-- read time from actor_id, because a handle can change and the link should go
-- to wherever that person is now, not to a 404.
--
-- Idempotent. Run in the Supabase SQL Editor.


-- =============================================================================
-- 1. actor_id + the widened kind
-- =============================================================================

alter table public.user_notices
  add column if not exists actor_id uuid references public.users(id) on delete set null;

comment on column public.user_notices.actor_id is
  'Who caused this notice (the follower, for new_follower). Null for system/moderation notices. Enables the tap-through link and the repeat-follow dedupe.';

-- Dedupe lookup: "has this actor already notified this user lately?"
create index if not exists user_notices_actor
  on public.user_notices (user_id, actor_id, kind, created_at desc);

do $$
begin
  alter table public.user_notices drop constraint if exists user_notices_kind_check;
  alter table public.user_notices add constraint user_notices_kind_check
    check (kind in (
      'content_hidden', 'content_restored',
      'account_suspended', 'account_restored',
      'new_follower'));
end $$;


-- =============================================================================
-- 2. notify_user, with an actor
-- =============================================================================

drop function if exists public.notify_user(uuid, text, text, text, uuid);

create function public.notify_user(
  target uuid,
  kind   text,
  title  text,
  body   text default null,
  car    uuid default null,
  actor  uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target is null then return; end if;
  insert into public.user_notices (user_id, kind, title, body, car_id, actor_id)
  values (target, kind, title, body, car, actor);
end;
$$;

-- Restated because DROP took the old privileges with it. Still revoked from
-- every client role: the definer functions are the only writers (087).
revoke execute on function public.notify_user(uuid, text, text, text, uuid, uuid)
  from public, anon, authenticated;


-- =============================================================================
-- 3. The trigger
-- =============================================================================

create or replace function public.follows_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  who text;
begin
  -- Can't happen (086 has a check constraint) but costs nothing to be sure a
  -- future edit can't make the app tell you about yourself.
  if new.follower_id = new.followee_id then return new; end if;

  -- One notice per follower per 30 days. Unfollow/refollow is otherwise a free
  -- way to put yourself at the top of someone's inbox repeatedly.
  if exists (
    select 1 from public.user_notices n
     where n.user_id  = new.followee_id
       and n.actor_id = new.follower_id
       and n.kind     = 'new_follower'
       and n.created_at > now() - interval '30 days'
  ) then
    return new;
  end if;

  select coalesce(nullif(u.username, ''), 'Someone')
    into who
    from public.users u
   where u.id = new.follower_id;

  perform public.notify_user(
    new.followee_id,
    'new_follower',
    'You have a new follower',
    case when who = 'Someone'
         then 'Someone started following your builds.'
         else '@' || who || ' started following your builds.' end,
    null,
    new.follower_id
  );
  return new;
end;
$$;

drop trigger if exists follows_notify on public.follows;
create trigger follows_notify
  after insert on public.follows
  for each row execute function public.follows_notify();

notify pgrst, 'reload schema';
