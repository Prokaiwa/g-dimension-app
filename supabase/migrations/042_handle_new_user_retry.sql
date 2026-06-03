-- =============================================================================
-- G-DIMENSION — Migration 042: fully close the username-collision race
-- =============================================================================
-- 038 made signup pick the first free handle by pre-checking with a SELECT loop
-- (john, john2, john3…). That removes the *common* collision, but a tiny race
-- remains: two people signing up at the same instant with the same email base
-- can both pass the SELECT, then one INSERT loses to the unique index and that
-- signup still rolls back — the exact failure 038 set out to fix, just rare.
--
-- This wraps the INSERT in an exception-retry: on unique_violation we bump the
-- suffix and try again, so the loser silently lands on the next free handle
-- instead of erroring. The pre-check loop is kept as an optimization (fewer
-- retries under contention); the retry is the real guarantee.
--
-- Function-only change. The on_auth_user_created trigger is unchanged, and
-- CREATE OR REPLACE preserves the EXECUTE revokes applied 2026-05-31. Idempotent.
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
  base_username := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9_]', '', 'g'));
  if base_username is null or length(base_username) = 0 then
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
