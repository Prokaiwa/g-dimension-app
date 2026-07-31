-- 095_follower_list.sql
-- The other half of following. 086 shipped `following_list` and no
-- `follower_list`, so you could see who YOU follow and never who follows you.
-- 094 then started sending "You have a new follower", which points at a room
-- that does not exist: the notice links to that one person and there is no
-- roster behind it.
--
-- TWO FUNCTIONS, because the two screens need different relationship flags and
-- computing both everywhere would mean every row carrying a column it ignores.
--
--   follower_list(target)  — who follows `target`. Each row says whether
--                            TARGET follows them back (`follows_back`), which
--                            is what "Follow back" vs "Following" hangs on.
--   following_list_v2      — 086's list plus `follows_you`, so the Following
--                            screen can mark the mutuals.
--
-- WHY NOT CHANGE `following_list` IN PLACE: adding an OUT column means DROP and
-- CREATE (090's lesson), and the old signature is live in a deployed client.
-- A deploy is not atomic with a migration — the page and the function are
-- versioned separately — so dropping it would break the Following screen for
-- everyone still on the previous bundle. The new name lets both exist, and the
-- client falls back to the old one when the new is missing.
--
-- Both take the viewer into account via auth.uid() rather than a parameter,
-- because a caller must not be able to ask "does X follow Y" about two other
-- people by passing someone else's id.
--
-- Idempotent. Run in the Supabase SQL Editor.


-- =============================================================================
-- 1. follower_list — who follows this person
-- =============================================================================

create or replace function public.follower_list(target uuid)
returns table (
  id uuid, username text, display_name text, avatar_url text,
  city text, country_code text, followed_at timestamptz,
  -- Does `target` follow this follower back? Drives "Follow back" on your own
  -- followers screen.
  follows_back boolean,
  -- Does the VIEWER follow them? Null-safe for anon. Lets the same row render
  -- correctly when you are looking at someone else's follower list.
  you_follow boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.username, u.display_name, u.avatar_url,
         u.city, u.country_code, f.created_at,
         exists (
           select 1 from public.follows b
            where b.follower_id = target and b.followee_id = u.id
         ) as follows_back,
         exists (
           select 1 from public.follows v
            where v.follower_id = (select auth.uid()) and v.followee_id = u.id
         ) as you_follow
    from public.follows f
    join public.users u on u.id = f.follower_id
   where f.followee_id = target
     and u.suspended_at is null
     and u.deleted_at is null
     and u.username is not null
     -- Someone you have blocked, or who has blocked you, does not appear in a
     -- list you are looking at. The follow EDGE stays (086 only gates new
     -- follows); this hides the person from the reader.
     and not exists (
       select 1 from public.user_blocks bl
        where (bl.blocker_id = (select auth.uid()) and bl.blocked_id = u.id)
           or (bl.blocked_id = (select auth.uid()) and bl.blocker_id = u.id)
     )
   order by f.created_at desc
   limit 500
$$;

revoke execute on function public.follower_list(uuid) from public;
grant  execute on function public.follower_list(uuid) to anon, authenticated;


-- =============================================================================
-- 2. following_list_v2 — 086's list, plus "follows you"
-- =============================================================================
-- Same rows and order as `following_list`, which stays untouched so an older
-- deployed bundle keeps working.

create or replace function public.following_list_v2(target uuid)
returns table (
  id uuid, username text, display_name text, avatar_url text,
  city text, country_code text, followed_at timestamptz,
  /** Does this person follow `target` back? */
  follows_you boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.username, u.display_name, u.avatar_url,
         u.city, u.country_code, f.created_at,
         exists (
           select 1 from public.follows b
            where b.follower_id = u.id and b.followee_id = target
         ) as follows_you
    from public.follows f
    join public.users u on u.id = f.followee_id
   where f.follower_id = target
     and u.suspended_at is null
     and u.deleted_at is null
     and u.username is not null
     and not exists (
       select 1 from public.user_blocks bl
        where (bl.blocker_id = (select auth.uid()) and bl.blocked_id = u.id)
           or (bl.blocked_id = (select auth.uid()) and bl.blocker_id = u.id)
     )
   order by f.created_at desc
   limit 500
$$;

revoke execute on function public.following_list_v2(uuid) from public;
grant  execute on function public.following_list_v2(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
