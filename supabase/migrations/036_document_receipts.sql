-- =============================================================================
-- G-DIMENSION — Migration 036: standalone receipts in the document vault
-- =============================================================================
-- The Documents screen now has a Receipts tab. It surfaces two things:
--   1. Build receipts (read-only) — the existing public.receipts rows tied to
--      sessions/jobs. Those feed the Build Investment total and are NOT touched
--      here.
--   2. Standalone receipts — owner-added receipts that are NOT build spend:
--      insurance payments, registration fees, etc. These belong with the car's
--      private paperwork, so they live in car_documents (private bucket, signed
--      URLs) rather than in public.receipts (which would wrongly inflate Build
--      Investment).
--
-- A standalone receipt is a car_documents row with doc_type = 'receipt', a
-- title (label), an optional amount, and a file. This migration:
--   - widens the doc_type CHECK to allow 'receipt'
--   - adds optional amount + currency columns
--
-- Additive and non-destructive. RLS + grants already cover car_documents.
-- =============================================================================

alter table public.car_documents
  drop constraint if exists car_documents_doc_type_check;

alter table public.car_documents
  add constraint car_documents_doc_type_check
  check (doc_type in (
    'registration','insurance','title','emissions',
    'inspection','warranty','purchase','receipt','other'
  ));

alter table public.car_documents
  add column if not exists amount   decimal(10,2);

alter table public.car_documents
  add column if not exists currency char(3) default 'USD';

comment on column public.car_documents.amount is
  'Optional. Used by standalone receipts (doc_type=receipt) — e.g. insurance/registration fees. NOT counted toward Build Investment.';
