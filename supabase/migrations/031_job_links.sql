-- =============================================================================
-- Migration 031: Job links
-- =============================================================================
-- Adds a job_links table so users can attach URLs (purchase links, reviews,
-- YouTube installs, etc.) to any job (mod or part). YouTube vs regular is a
-- display-time concern — detected from the URL, not stored as a type column.
-- =============================================================================

create table public.job_links (
  id            uuid        default gen_random_uuid() primary key,
  job_id        uuid        not null references public.jobs(id) on delete cascade,
  user_id       uuid        not null references public.users(id) on delete cascade,
  url           text        not null,
  label         text,
  display_order int         not null default 0,
  created_at    timestamptz default now()
);

alter table public.job_links enable row level security;

create policy "Users manage own job links"
  on public.job_links for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.job_links to authenticated;
