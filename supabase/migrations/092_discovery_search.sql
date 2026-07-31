-- 092_discovery_search.sql
-- Discovery: find a person by handle, or a build by what it IS.
--
-- THE HOLE THIS FILLS: there has never been a way to find anything in this app.
-- No search, no browse, no index. The only route to a build was someone handing
-- you the URL, which is exactly the complaint that started the follows work
-- ("you see someone's profile and it's very easy to lose"). 086 gave people a
-- way to KEEP a build. This gives them a way to FIND one.
--
-- THE ONE DESIGN DECISION THAT MATTERS: both functions read
-- `public_car_profiles`, the same definer view every public page already reads.
-- That view is where is_public, deleted cars, deleted users and suspended
-- owners are already enforced (084). Searching THROUGH it means search cannot
-- surface a build the site would not already show — it is structurally
-- incapable of it, rather than correct-by-inspection. Any future column added
-- to the view is searchable; anything not in the view is unreachable from here.
-- Do not "optimise" these to read `cars` directly: that would fork the
-- visibility rule, and a forked rule drifts.
--
-- Consequently these are granted to ANON as well as authenticated, unlike the
-- admin RPCs. They expose nothing a logged-out visitor cannot already read on
-- /builds/*. Blocking simply has nothing to filter when nobody is signed in.
--
-- WHAT IS SEARCHED
--   people : username, display_name — and ONLY people with at least one public
--            build, because /builds/:username needs one. Surfacing a handle
--            whose profile then says "not available" is a worse answer than no
--            answer.
--   builds : year, make, model, variant, chassis code, nickname
--
-- Enthusiast shorthand runs through `vehicle_search_aliases` (018, already
-- populated: mitsu → Mitsubishi, chevy → Chevrolet), so "evo" finds Lancer
-- Evolutions. Aliases apply to the CAR half only — a handle is a handle.
--
-- SCALE: 39 public cars today, so a sequential scan of the view costs nothing
-- and no index would be used anyway. If this grows into the thousands the fix
-- is a materialised search table refreshed on write, not an index on a view.
-- pg_trgm is already enabled (002). The fuzzy tier uses `word_similarity`, NOT
-- `similarity`: the haystack is a whole label like "2006 lexus ls 430 big body",
-- and plain similarity() compares the needle against the ENTIRE string, so a
-- five-letter typo scores 0.11 against it and nothing ever matched. Measured on
-- a scratch cluster: similarity('lexis', <that label>) = 0.11, word_similarity =
-- 0.50, because word_similarity scores against the best-matching run of words.
-- The fuzzy tier is also gated on length >= 3, since a single character scores
-- 0.5 against almost anything and would make one keystroke match the world.
--
-- Idempotent. Run in the Supabase SQL Editor.


-- =============================================================================
-- 1. search_public — one ranked list of people and builds
-- =============================================================================
-- Score is ascending (0 = best) so the tiers read in the order a human would
-- rank them:
--   0  exact handle              5  the car matched anywhere in the middle
--   1  handle starts with        6  fuzzy handle (typo tolerance)
--   2  display name starts with  7  fuzzy car
--   3  the car label starts with
--   4  a word in the car starts with

create or replace function public.search_public(q text, max_rows int default 24)
returns table (
  kind         text,
  user_id      uuid,
  username     text,
  display_name text,
  avatar_url   text,
  city         text,
  country_code text,
  car_id       uuid,
  car_label    text,
  nickname     text,
  photo_url    text,
  build_count  int,
  score        int,
  sim          real
)
language sql
stable
security definer
set search_path = public
as $$
  with n as (
    select nullif(btrim(lower(q)), '') as t
  ),
  ex as (
    -- The car half also searches what the shorthand resolves to.
    select n.t,
           coalesce((select lower(a.canonical)
                       from public.vehicle_search_aliases a
                      where lower(a.alias) = n.t
                      limit 1), n.t) as c
      from n
  ),
  blocked as (
    select b.blocked_id as id from public.user_blocks b where b.blocker_id = (select auth.uid())
    union
    select b.blocker_id     from public.user_blocks b where b.blocked_id = (select auth.uid())
  ),
  src as (
    select p.id, p.user_id, p.username, p.display_name, p.avatar_url,
           p.city, p.country_code, p.nickname, p.garage_photo_url,
           btrim(concat_ws(' ', p.year::text, p.make, p.model, p.variant)) as label,
           lower(btrim(concat_ws(' ', p.year::text, p.make, p.model, p.variant,
                                 p.chassis_code, p.nickname)))             as hay,
           lower(coalesce(p.username, ''))     as u_l,
           lower(coalesce(p.display_name, '')) as d_l,
           ex.t, ex.c
      from public.public_car_profiles p
      cross join ex
     where ex.t is not null
       and p.user_id not in (select id from blocked)
  ),
  people_raw as (
    select s.user_id, s.username, s.display_name, s.avatar_url, s.city, s.country_code,
           case when s.u_l = s.t                        then 0
                when s.u_l like s.t || '%'              then 1
                when s.d_l like s.t || '%'              then 2
                when s.u_l like '%' || s.t || '%'
                  or s.d_l like '%' || s.t || '%'       then 5
                else 6 end                                       as score,
           greatest(word_similarity(s.t, s.u_l), word_similarity(s.t, s.d_l)) as sim
      from src s
     where s.u_l like '%' || s.t || '%'
        or s.d_l like '%' || s.t || '%'
        or (length(s.t) >= 3 and (word_similarity(s.t, s.u_l) >= 0.4
                               or word_similarity(s.t, s.d_l) >= 0.4))
  ),
  people as (
    -- One row per person however many of their builds matched the handle.
    select distinct on (user_id)
           user_id, username, display_name, avatar_url, city, country_code, score, sim
      from people_raw
     order by user_id, score asc, sim desc
  ),
  builds as (
    select s.user_id, s.username, s.display_name, s.avatar_url, s.city, s.country_code,
           s.id as car_id, s.label, s.nickname, s.garage_photo_url,
           case when s.hay like s.c || '%'          then 3
                when s.hay like '% ' || s.c || '%'  then 4
                when s.hay like '%' || s.c || '%'   then 5
                else 7 end                          as score,
           word_similarity(s.c, s.hay)              as sim
      from src s
     where s.hay like '%' || s.c || '%'
        or (length(s.c) >= 3 and word_similarity(s.c, s.hay) >= 0.4)
  )
  select 'person'::text, p.user_id, p.username, p.display_name, p.avatar_url,
         p.city, p.country_code,
         null::uuid, null::text, null::text, p.avatar_url,
         (select count(*)::int from public.public_car_profiles x where x.user_id = p.user_id),
         p.score, p.sim
    from people p
  union all
  select 'build'::text, b.user_id, b.username, b.display_name, b.avatar_url,
         b.city, b.country_code,
         b.car_id, b.label, b.nickname, b.garage_photo_url,
         1, b.score, b.sim
    from builds b
   -- Positional, because ORDER BY over a UNION cannot see the RETURNS TABLE
   -- names: 13 = score, 14 = sim, 9 = car_label (a stable final tiebreak so
   -- two equally-ranked builds don't swap places between keystrokes).
   order by 13 asc, 14 desc nulls last, 9 asc nulls first
   limit greatest(1, least(coalesce(max_rows, 24), 60));
$$;


-- =============================================================================
-- 2. discover_home — what to show before anyone has typed anything
-- =============================================================================
-- A search box with an empty page under it is a dead end. This gives the screen
-- something true to say on arrival: what is actually in here, and what has been
-- worked on lately.

create or replace function public.discover_home(max_rows int default 12)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with blocked as (
    select b.blocked_id as id from public.user_blocks b where b.blocker_id = (select auth.uid())
    union
    select b.blocker_id     from public.user_blocks b where b.blocked_id = (select auth.uid())
  ),
  vis as (
    select p.* from public.public_car_profiles p
     where p.user_id not in (select id from blocked)
  ),
  act as (
    -- "Lately" means a timeline entry, which the sessions trigger writes for
    -- every mod and service. Falls back to when the car was added, so a build
    -- with no entries still appears rather than sorting to the bottom forever.
    select v.id, v.username, v.display_name, v.avatar_url, v.city, v.country_code,
           v.nickname, v.garage_photo_url,
           btrim(concat_ws(' ', v.year::text, v.make, v.model, v.variant)) as label,
           greatest(v.created_at,
                    coalesce((select max(e.created_at) from public.timeline_entries e
                               where e.car_id = v.id), v.created_at)) as last_activity
      from vis v
  )
  select jsonb_build_object(
    'total',  (select count(*) from vis),
    'people', (select count(distinct user_id) from vis),

    -- Tappable shortcuts, straight from what people actually own. No curation,
    -- so this can never advertise a car nobody has.
    'models', coalesce((
      select jsonb_agg(jsonb_build_object('label', lbl, 'n', n) order by n desc, lbl)
        from (select btrim(concat_ws(' ', make, model)) as lbl, count(*)::int as n
                from vis
               where make is not null
               group by 1
               order by n desc, 1
               limit 14) t
    ), '[]'::jsonb),

    'makes', coalesce((
      select jsonb_agg(jsonb_build_object('label', mk, 'n', n) order by n desc, mk)
        from (select make as mk, count(*)::int as n
                from vis
               where make is not null
               group by 1
               order by n desc, 1
               limit 10) t
    ), '[]'::jsonb),

    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
               'car_id',       a.id,
               'username',     a.username,
               'display_name', a.display_name,
               'avatar_url',   a.avatar_url,
               'label',        a.label,
               'nickname',     a.nickname,
               'photo_url',    a.garage_photo_url,
               'city',         a.city,
               'country_code', a.country_code
             ) order by a.last_activity desc)
        from (select * from act order by last_activity desc
               limit greatest(1, least(coalesce(max_rows, 12), 40))) a
    ), '[]'::jsonb)
  );
$$;


-- Public by design: these read the same view /builds/* reads and expose nothing
-- beyond it. Discovery has to work logged out, or the only people who can find
-- a build are the ones who already have an account.
revoke execute on function public.search_public(text, int)  from public;
revoke execute on function public.discover_home(int)        from public;
grant  execute on function public.search_public(text, int)  to anon, authenticated;
grant  execute on function public.discover_home(int)        to anon, authenticated;

notify pgrst, 'reload schema';
