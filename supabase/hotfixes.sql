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

-- Fix durometer spec unit and placeholder (2026-05-15)
-- Migration 026 set unit=null and placeholder='75' for all durometer specs.
-- Changed to unit='A' (how aftermarket brands label it) and placeholder=null
-- since the help_text already provides enough context.
update spec_templates
set unit = 'A',
    placeholder = null
where spec_key = 'durometer';
