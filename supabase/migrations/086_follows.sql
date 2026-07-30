-- 086_follows.sql
-- Following (ADR-024). The first slice of the social layer.
--
-- WHY THIS IS PUBLIC AND NOT A PRIVATE BOOKMARK: the earlier recommendation was
-- a follow visible only to the follower, specifically to avoid depending on
-- moderation. 084 built moderation (report, block, auto-hide, suspend), so that
-- reason is gone and the private version would now be a worse product for no
-- gain. MASTER_ARCHITECTURE Part 29's "do not build slices of this ad hoc" bar
-- is met: the moderation prerequisite it named exists.
--
-- The user problem being solved, in their words: "if you see someone's profile
-- it's very easy to lose and then you can never follow them again." Note that
-- follow only fixes KEEPING people you already reached via a shared link —
-- there is still no search or browse anywhere in the app, so discovery is a
-- separate piece of work (see BUILD_NOTES).
--
-- Idempotent. Run in the Supabase SQL Editor.


-- =============================================================================
-- 1. follows
-- =============================================================================
-- The pair is the primary key, which makes following idempotent for free: a
-- double-tap raises 23505 rather than creating a second edge or inflating a
-- count. No surrogate id, because an edge has no identity of its own.

create table if not exists public.follows (
  follower_id uuid not null references public.users(id) on delete cascade,
  followee_id uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint follows_no_self check (follower_id <> followee_id)
);

-- The PK covers (follower_id, followee_id) — "who do I follow" and the
-- existence check. This index covers the other direction, "who follows them",
-- which is what the follower count on a profile reads.
create index if not exists follows_followee on public.follows (followee_id, created_at desc);

alter table public.follows enable row level security;


-- =============================================================================
-- 2. RLS
-- =============================================================================
-- READ IS PUBLIC, deliberately. A follow is a public act in every app that has
-- one, and counts on a profile cannot work otherwise. The consequence is that
-- the social graph is enumerable by anyone with the anon key — which is true of
-- Instagram and Twitter too, and is worth stating rather than discovering.
-- If follower lists ever need to be private, that is a policy change here, not
-- a schema change.
drop policy if exists "follows_select_public" on public.follows;
create policy "follows_select_public"
  on public.follows for select to anon, authenticated
  using (true);

-- Only you can create your own follows, and BLOCKING IS ENFORCED HERE rather
-- than in the UI. This is the whole point of having built 084 first: a block
-- that only hides a button is not a block. Checked in both directions —
-- someone who blocked you cannot be followed by you, and someone you blocked
-- cannot be followed by you either.
drop policy if exists "follows_insert_own" on public.follows;
create policy "follows_insert_own"
  on public.follows for insert to authenticated
  with check (
    follower_id = (select auth.uid())
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = follows.followee_id and b.blocked_id = follows.follower_id)
         or (b.blocker_id = follows.follower_id and b.blocked_id = follows.followee_id)
    )
  );

drop policy if exists "follows_delete_own" on public.follows;
create policy "follows_delete_own"
  on public.follows for delete to authenticated
  using (follower_id = (select auth.uid()));

-- Applying 085's lesson up front instead of discovering it again: this database
-- grants `authenticated` full DML on new public tables by default, so listing
-- the privileges we want is not enough — the ones we do NOT want have to be
-- revoked. An edge is created or destroyed, never edited.
revoke all on public.follows from authenticated, anon;
grant select on public.follows to anon, authenticated;
grant insert, delete on public.follows to authenticated;


-- =============================================================================
-- 3. follow_counts — one round trip instead of two head-counts
-- =============================================================================
-- Definer so it is unaffected by the 071/083 column grants on `users`, and so
-- the counts stay correct if follows ever stops being publicly readable.
-- Suspended accounts (084) are excluded from BOTH directions: a suspended user
-- should not inflate anyone's follower count, and their own counts are moot
-- while their profile is dark.

create or replace function public.follow_counts(target uuid)
returns table (followers bigint, following bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.follows f
       join public.users u on u.id = f.follower_id
      where f.followee_id = target and u.suspended_at is null and u.deleted_at is null),
    (select count(*) from public.follows f
       join public.users u on u.id = f.followee_id
      where f.follower_id = target and u.suspended_at is null and u.deleted_at is null)
$$;

revoke execute on function public.follow_counts(uuid) from public;
grant  execute on function public.follow_counts(uuid) to anon, authenticated;


-- =============================================================================
-- 4. following_list — the "people I follow" screen
-- =============================================================================
-- Returns the identity columns needed to render a row and link to /builds/:u.
-- A definer function rather than a client-side embed on `users` because the
-- embed would break the moment follower lists stop being public, and because
-- filtering out suspended/deleted accounts belongs next to the query, not in
-- the page. Callers only ever get their own list or a public one.

create or replace function public.following_list(target uuid)
returns table (
  id uuid, username text, display_name text, avatar_url text,
  city text, country_code text, followed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.username, u.display_name, u.avatar_url,
         u.city, u.country_code, f.created_at
    from public.follows f
    join public.users u on u.id = f.followee_id
   where f.follower_id = target
     and u.suspended_at is null
     and u.deleted_at is null
     and u.username is not null
   order by f.created_at desc
   limit 500
$$;

revoke execute on function public.following_list(uuid) from public;
grant  execute on function public.following_list(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
