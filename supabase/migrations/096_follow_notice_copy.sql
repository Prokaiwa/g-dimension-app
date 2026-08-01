-- 096_follow_notice_copy.sql
-- Copy-only. The follow notice said:
--
--   title: "You have a new follower"
--   body:  "@marcus started following your builds."
--
-- Two lines to say one thing, and the part you actually want — WHO — was in the
-- smaller, dimmer line. Every other notice in the inbox is moderation, where a
-- neutral title and an explanatory body is right because something happened TO
-- you and needs explaining. A follow needs no explaining. It needs a name.
--
--   title: "@marcus followed you"
--   body:  null
--
-- Existing notices keep their stored wording, by design — ADR-025: a notice is
-- a record of what someone was told on a date, not a template re-rendered from
-- current state. So the inbox will briefly show both phrasings, which is
-- correct rather than a glitch.
--
-- Everything else in the trigger is byte-identical to 094, including the 30-day
-- dedupe and the fact that NOTHING is ever sent on an unfollow.
--
-- Idempotent. Run in the Supabase SQL Editor.

create or replace function public.follows_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  who text;
begin
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

  select coalesce(nullif(u.username, ''), '')
    into who
    from public.users u
   where u.id = new.follower_id;

  perform public.notify_user(
    new.followee_id,
    'new_follower',
    -- The name IS the notice. A handle-less account (possible only in the
    -- window before handle_new_user finishes) still gets a sentence.
    case when who = '' then 'Someone followed you' else '@' || who || ' followed you' end,
    null,
    null,
    new.follower_id
  );
  return new;
end;
$$;

notify pgrst, 'reload schema';
