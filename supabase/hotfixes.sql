-- =============================================================================
-- G-DIMENSION — Manual DB Hotfixes
-- =============================================================================
-- Track SQL fixes applied directly to the live DB outside the migration
-- sequence. Run each block once in the Supabase SQL Editor.
-- =============================================================================

-- Fix missing grants on job_specs (2026-05-14)
-- 024_part_spec_system.sql created job_specs but omitted the DML grants.
-- part_types and spec_templates are admin-managed lookup data — SELECT-only is correct.
grant select, insert, update, delete on public.job_specs to authenticated;
