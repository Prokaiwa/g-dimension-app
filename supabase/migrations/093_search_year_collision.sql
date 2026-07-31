-- 093_search_year_collision.sql
-- Function-only fix to `search_public`. Found immediately on running 092
-- against the real corpus.
--
-- THE BUG: searching "s2000" returned a **2000 Toyota Celica** and a
-- **2000 Toyota MR2** alongside the two actual Honda S2000s.
--
-- Not a LIKE match — "2000 toyota celica" does not contain "s2000". It was the
-- fuzzy tier, and the culprit is the YEAR sitting in the same haystack as the
-- names. Measured:
--
--   word_similarity('s2000', '2000 toyota celica gt-s')  = 0.50   <- passes 0.4
--   word_similarity('s2000', 'toyota celica gt-s')       = 0.17   <- excluded
--   word_similarity('s2000', '2006 honda s2000 ap2')     = 1.00
--   word_similarity('s2000', 'honda s2000 ap2')          = 1.00
--
-- Any model name containing digits — S2000, 350Z, 240SX, RX-7, 86 — collides
-- with every car built in a year that shares those digits. That is a large
-- fraction of the enthusiast vocabulary, so this is not an edge case; it is the
-- normal case for this audience.
--
-- THE FIX: the fuzzy tier gets its own haystack with every BARE FOUR-DIGIT
-- TOKEN removed. Dropping `p.year` alone was not enough, and the live data
-- proved it within a minute: one Celica is NICKNAMED "2000 Toyota Celica", so
-- the year walked straight back in through a user-typed field and the false
-- positive survived at 0.50. Stripping the pattern instead of the column
-- handles the year wherever it appears. Measured after stripping: 0.17.
--
-- Exact, prefix and contains matching keep the full label, so searching "2006"
-- still works and still means the year. Only typo-tolerance stops considering
-- four-digit numbers, which is right — nobody fuzzy-matches a year, they type
-- it exactly. A model that IS a bare four-digit number (a BMW 2002) is still
-- found by the literal tiers, which is the path anyone typing "2002" takes.
--
-- Typo tolerance is unaffected: 'lexis' -> 'lexus ls 430 big body' = 0.50,
-- 'hnda' -> 'honda s2000 ap2' = 0.40. Both still land.
--
-- Everything else is byte-identical to 092. Idempotent.

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
           -- Literal matching: the year is part of the label, because "2006"
           -- is a perfectly good thing to search for and means exactly itself.
           lower(btrim(concat_ws(' ', p.year::text, p.make, p.model, p.variant,
                                 p.chassis_code, p.nickname)))             as hay,
           -- Fuzzy matching: no four-digit numbers at all. A model name full
           -- of digits (S2000, 350Z, 240SX) would otherwise trigram-match
           -- every car built in a year sharing them. Stripped by PATTERN, not
           -- by dropping the year column, because nicknames contain years too.
           regexp_replace(
             lower(btrim(concat_ws(' ', p.make, p.model, p.variant,
                                   p.chassis_code, p.nickname))),
             '\y[0-9]{4}\y', ' ', 'g')                                    as hay_fuzzy,
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
           word_similarity(s.c, s.hay_fuzzy)        as sim
      from src s
     where s.hay like '%' || s.c || '%'
        or (length(s.c) >= 3 and word_similarity(s.c, s.hay_fuzzy) >= 0.4)
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
   order by 13 asc, 14 desc nulls last, 9 asc nulls first
   limit greatest(1, least(coalesce(max_rows, 24), 60));
$$;

notify pgrst, 'reload schema';
