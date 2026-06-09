-- 050_nickname_nullable.sql
-- Allow cars.nickname to be NULL.
-- Originally required, but UX should not force a nickname — it's optional
-- personal branding. Featured magazine falls back to model name when null.

alter table public.cars
  alter column nickname drop not null;

notify pgrst, 'reload schema';
