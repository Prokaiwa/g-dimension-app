-- =============================================================================
-- G-DIMENSION — Migration 060: multi-image attachments for documents & receipts
-- =============================================================================
-- Documents and standalone receipts (both live in public.car_documents) gain
-- multiple images — e.g. front/back of a registration card, or a multi-photo
-- receipt. Mirrors the job_photos / timeline_entry_photos pattern:
--
--   car_document_photos — additional attachments for a car_documents row. The
--     row's own file_url stays the PRIMARY/first attachment (keeps the list
--     thumbnail + back-compat); the extras live here, ordered.
--
-- car_id is denormalized for 1-hop RLS. car_documents is ALWAYS private (the
-- car-documents bucket is private, accessed only via signed URLs), so there is
-- NO public/anon policy here — owner-only, unlike timeline_entry_photos.
--
-- Build receipts (public.receipts) already support multiple files: maintenance
-- sessions insert one receipts row per file, and Tuning parts now do the same
-- (multiple rows sharing a job_id). Those are grouped by session_id / job_id in
-- the UI — no new table needed for them.
--
-- Idempotent. Run once in the Supabase SQL editor.
-- =============================================================================

create table if not exists public.car_document_photos (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.car_documents(id) on delete cascade,
  car_id        uuid not null references public.cars(id) on delete cascade,
  file_url      text not null,                 -- storage PATH in the private car-documents bucket
  file_type     text,                          -- 'image' | 'pdf'
  file_name     text,
  display_order integer default 0,
  created_at    timestamptz not null default now()
);

create index if not exists car_document_photos_document
  on public.car_document_photos (document_id, display_order);

-- ── RLS — owner-only (private bucket, never public) ──
alter table public.car_document_photos enable row level security;

create policy "car_document_photos_all_owner" on public.car_document_photos
  for all
  using      (exists (select 1 from public.cars where cars.id = car_document_photos.car_id and cars.user_id = auth.uid()))
  with check (exists (select 1 from public.cars where cars.id = car_document_photos.car_id and cars.user_id = auth.uid()));

-- ── Grants (required for tables created after 2026-05-30; authenticated only) ──
grant select, insert, update, delete on public.car_document_photos to authenticated;

notify pgrst, 'reload schema';
