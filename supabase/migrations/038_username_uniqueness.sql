-- =============================================================================
-- G-DIMENSION — Migration 038: collision-safe username generation
-- =============================================================================
-- BUG FIX. The original handle_new_user() trigger (001_users.sql) seeds a new
-- user's username from their email local-part:
--
--     john@gmail.com  →  "john"
--
-- but `username` carries a UNIQUE constraint and the insert only guards
-- `on conflict (id)`. So if a second person signs up with an email that
-- normalizes to an existing handle (john@gmail.com then john@yahoo.com, both
-- → "john"), the trigger's INSERT raises a unique_violation. Because this is an
-- AFTER INSERT trigger on auth.users, that error rolls back the whole signup —
-- the second person simply can't create an account.
--
-- This replaces the function with a version that finds the first free handle by
-- appending an incrementing suffix (john, john2, john3, …). The unique index is
-- still the backstop. Username remains editable post-signup in the Profile.
--
-- Only the function body changes; the existing on_auth_user_created trigger
-- continues to point at it. Idempotent (create or replace).
-- =============================================================================

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
  -- email prefix, lowercased, non-alphanumeric stripped (same rule as before)
  base_username := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9_]', '', 'g'));

  -- Guard against an empty handle (e.g. an all-symbol local-part).
  if base_username is null or length(base_username) = 0 then
    base_username := 'driver';
  end if;

  -- Walk to the first unused handle. base, then base2, base3, …
  candidate := base_username;
  while exists (select 1 from public.users where username = candidate) loop
    suffix    := suffix + 1;
    candidate := base_username || suffix::text;
  end loop;

  insert into public.users (id, email, username, display_name)
  values (
    new.id,
    new.email,
    candidate,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
