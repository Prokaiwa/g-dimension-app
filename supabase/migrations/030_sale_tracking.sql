-- =============================================================================
-- Migration 030: Add sale tracking columns to jobs
-- =============================================================================
-- Adds sale_price and sale_date to jobs so Parts Bin items can be marked
-- as Sold (with price captured) or Scrapped without losing the row.
-- These columns are nullable — only populated when status='sold'.
-- No view changes needed: public_build_sheet only shows status='installed'.
-- No trigger changes needed: jobs_handle_removal is a no-op (see hotfixes.sql).
-- =============================================================================

alter table public.jobs
  add column if not exists sale_price decimal(10,2),
  add column if not exists sale_date  date;

comment on column public.jobs.sale_price is 'Price received when part was sold. Null if scrapped or not yet sold.';
comment on column public.jobs.sale_date  is 'Date the sale was completed. Used for future price aggregation across users.';
