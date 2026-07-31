-- 091_admin_review_car.sql
-- An admin read path into a hidden build, so moderation can look at what it is
-- judging. Plus an audit row for every look.
--
-- THE PROBLEM (exposed by 090, caused by 084 working exactly as designed).
-- ADR-023 chose to reuse `is_public` rather than invent a thirteenth visibility
-- rule: hiding a build flips one boolean and every existing public policy
-- honours it for free. The consequence nobody costed is that there is no reader
-- anywhere in the system exempt from that flag — the admin included. The gate
-- is checked in `public_car_profiles`'s own WHERE clause and in fourteen row
-- policies across twelve tables (cars, jobs, job_photos, job_specs, job_links,
-- sessions, timeline_entries, timeline_entry_photos, timeline_entry_links,
-- diy_guides, diy_steps, diy_step_photos). `is_admin` appears in none of them.
--
-- So reviewing a severe report meant: dismiss it (which REPUBLISHES the content
-- to the open internet and files a "we found no problem" notice), look, then
-- hide again (filing a second notice saying it breaks the Terms). A public
-- window on content severe enough to auto-hide, and two contradictory notices
-- to someone already in a dispute with us.
--
-- WHY NOT `or public.is_admin(...)` ON THE PUBLIC POLICIES. It is fifteen edits
-- to the exact boundary that protects every user's data, for one person's
-- benefit; it puts an `is_admin` subquery in the hot path of every anonymous
-- read on the site; and it destroys the property that makes that boundary
-- auditable — today it is one flag with no exceptions, and every future review
-- would instead have to ask "does the admin branch also hold here?".
--
-- WHAT THIS DOES INSTEAD. One definer function, re-checking `is_admin`
-- server-side like every other admin RPC (084/087, ADR-020/022), returning one
-- jsonb blob of everything user-generated on the car. The public boundary is
-- not touched at all.
--
-- THE COLUMN LIST IS THE SECURITY CONTROL. A definer function reading tables it
-- does not own is exactly where this codebase has been bitten: 081 leaked
-- parts_cost / labor_cost / sale_price to anon, 083 leaked 28 beta emails, both
-- through a grant that was wider than the intent. So the rule here, and for
-- anyone extending this later:
--
--     NEVER WIDER THAN "WHAT A VISITOR WOULD SEE IF THE BUILD WERE PUBLIC."
--
-- Every column below is one a `/builds/*` page already renders. Nothing from
-- receipts, car_documents, car_private, user_contacts or car_reminders. No
-- cost, price, VIN, plate or purchase_price. A moderation decision about
-- nudity or hate needs pixels and prose, never somebody's finances. `select *`
-- is banned in this function forever.
--
-- Storage needs no work: car-photos, job-photos and timeline-photos are PUBLIC
-- buckets, so hiding a build hides the ROWS, not the files. Once this hands
-- back the URLs the images render.
--
-- Idempotent. Run in the Supabase SQL Editor.


-- =============================================================================
-- 1. moderation_reviews — who looked at what, and when
-- =============================================================================
-- Reading a hidden build is a privileged act. This costs almost nothing to
-- record and is the sort of thing you want to already have rather than wish
-- you had. Written ONLY by the definer function below.

create table if not exists public.moderation_reviews (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid not null references public.users(id) on delete cascade,
  car_id     uuid not null references public.cars(id)  on delete cascade,
  report_id  uuid references public.content_reports(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists moderation_reviews_car  on public.moderation_reviews (car_id, created_at desc);
create index if not exists moderation_reviews_when on public.moderation_reviews (created_at desc);

alter table public.moderation_reviews enable row level security;

-- No policies at all, and no DML grants. This DB grants `authenticated` full
-- DML on new public tables by default (085's lesson), so the revoke is the
-- whole control — without it the audit trail would be editable by the people
-- it audits.
revoke all on public.moderation_reviews from anon, authenticated;

comment on table public.moderation_reviews is
  'Audit: an admin opened a build in the moderation review view. Written only by admin_review_car(); no client role can read or write it.';


-- =============================================================================
-- 2. admin_review_car — everything user-generated on one car
-- =============================================================================

create or replace function public.admin_review_car(
  target_car  uuid,
  from_report uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me     uuid := (select auth.uid());
  result jsonb;
begin
  if not public.is_admin(me) then
    raise exception 'not_admin' using errcode = 'insufficient_privilege';
  end if;
  if target_car is null then
    raise exception 'no_target';
  end if;

  -- Existence check BEFORE the audit insert, not after. Auditing first meant a
  -- bad car id came back as a raw 23503 naming the constraint and the table,
  -- rather than a clean `car_not_found` (caught on a scratch cluster before
  -- this ever ran for real).
  if not exists (select 1 from public.cars where id = target_car) then
    raise exception 'car_not_found';
  end if;

  -- Audit BEFORE returning, so a look is recorded even if the caller drops the
  -- response on the floor. The report id is resolved through a subquery so a
  -- hand-typed ?report= that matches nothing records null instead of failing
  -- the whole read on a foreign key.
  insert into public.moderation_reviews (admin_id, car_id, report_id)
  values (me, target_car, (select r.id from public.content_reports r where r.id = from_report));

  select jsonb_build_object(

    -- ── identity + the moderation state, so the page can say where it stands ──
    'car', (
      select jsonb_build_object(
        'id',                   c.id,
        'owner_id',             c.user_id,
        'username',             u.username,
        'display_name',         u.display_name,
        'bio',                  u.bio,            -- reportable prose
        'avatar_url',           u.avatar_url,
        'suspended',            u.suspended_at is not null,
        'year',                 c.year,
        'make',                 c.make,
        'model',                c.model,
        'trim',                 c."trim",
        'variant',              null,             -- see note below
        'nickname',             c.nickname,
        'color',                c.color,
        'is_public',            c.is_public,
        'moderation_hidden_at', c.moderation_hidden_at,
        'deleted_at',           c.deleted_at,
        'purchase_story',       c.purchase_story, -- reportable prose
        'garage_photo_url',     c.garage_photo_url,
        'showcase_photo_url',   c.showcase_photo_url,
        'original_photo_url',   c.original_photo_url,
        'build_sheet_photos',   jsonb_build_array(
                                  c.build_sheet_power_photo,
                                  c.build_sheet_chassis_photo,
                                  c.build_sheet_exterior_photo,
                                  c.build_sheet_interior_photo
                                )
      )
      from public.cars c
      join public.users u on u.id = c.user_id
      where c.id = target_car
    ),

    -- ── every job photo, labelled with the mod it hangs off ──
    'job_photos', coalesce((
      select jsonb_agg(x order by x->>'created_at')
      from (
        select jsonb_build_object(
          'id',         p.id,
          'job_id',     p.job_id,
          'url',        p.photo_url,
          'caption',    p.caption,
          'created_at', p.created_at,
          'job_title',  trim(concat_ws(' ', j.brand, j.title)),
          'category',   j.category
        ) as x
        from public.job_photos p
        left join public.jobs j on j.id = p.job_id
        where p.car_id = target_car
      ) s
    ), '[]'::jsonb),

    -- ── timeline: the entry's own hero photo + its text ──
    'timeline_entries', coalesce((
      select jsonb_agg(x order by x->>'display_date')
      from (
        select jsonb_build_object(
          'id',            e.id,
          'entry_type',    e.entry_type,
          'is_origin',     e.is_origin,
          'title',         e.title,
          'journal_entry', e.journal_entry,   -- reportable prose
          'url',           e.photo_url,
          'display_date',  e.display_date
        ) as x
        from public.timeline_entries e
        where e.car_id = target_car
      ) s
    ), '[]'::jsonb),

    -- ── note photos (timeline_entry_photos), which have no reportable id of
    --    their own — the entry is what gets reported (ADR-026) ──
    'entry_photos', coalesce((
      select jsonb_agg(x order by x->>'created_at')
      from (
        select jsonb_build_object(
          'id',         tp.id,
          'entry_id',   tp.entry_id,
          'url',        tp.photo_url,
          'created_at', tp.created_at
        ) as x
        from public.timeline_entry_photos tp
        where tp.car_id = target_car
      ) s
    ), '[]'::jsonb),

    -- ── DIY step photos, likewise reported as the car ──
    'diy_photos', coalesce((
      select jsonb_agg(x order by x->>'created_at')
      from (
        select jsonb_build_object(
          'id',         dp.id,
          'step_id',    dp.step_id,
          'url',        dp.photo_url,
          'caption',    dp.caption,
          'created_at', dp.created_at
        ) as x
        from public.diy_step_photos dp
        where dp.car_id = target_car
      ) s
    ), '[]'::jsonb),

    -- ── the open reports against anything on this car, so the reviewer sees
    --    the pattern rather than one row at a time ──
    'reports', coalesce((
      select jsonb_agg(x order by x->>'created_at' desc)
      from (
        select jsonb_build_object(
          'id',          r.id,
          'reason',      r.reason,
          'details',     r.details,
          'status',      r.status,
          'target_type', r.target_type,
          'target_id',   r.target_id,
          'auto_hidden', r.auto_hidden,
          'created_at',  r.created_at
        ) as x
        from public.content_reports r
        -- Parenthesised deliberately. `and` binds tighter than `or`, so this
        -- would still parse correctly without them, but a future edit that
        -- adds a fourth target type to an unparenthesised chain would not.
        where (r.target_type = 'car' and r.target_id = target_car)
           or (r.target_type = 'photo'
               and r.target_id in (select p.id from public.job_photos p where p.car_id = target_car))
           or (r.target_type = 'timeline_entry'
               and r.target_id in (select e.id from public.timeline_entries e where e.car_id = target_car))
      ) s
    ), '[]'::jsonb)

  ) into result;

  return result;
end;
$$;

-- NOTE ON 'variant': cars stores variant_id (FK to vehicle_variants), and the
-- public view resolves the NAME. Left null here rather than joining a reference
-- table for a label the reviewer does not need — year/make/model/nickname
-- identify the build unambiguously.

revoke execute on function public.admin_review_car(uuid, uuid) from public, anon;
grant  execute on function public.admin_review_car(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
